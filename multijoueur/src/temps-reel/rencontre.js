// ==========================================================================
// Rencontre : un Durable Object par jeu temps réel (nom « rencontre:<jeu> »).
// Il tient la file des joueurs qui cherchent un adversaire et les apparie deux
// par deux (docs/cadrage-temps-reel.md, section 4).
//
// - Un WebSocket ouvert = un joueur qui cherche (API « hibernation » : entre
//   deux arrivées, l'objet n'est pas facturé ; « ping » reçoit « pong » sans le
//   réveiller). Aucune minuterie, aucune alarme : la recherche dure 15 s au
//   plus côté appareil, qui ferme alors la connexion ; une connexion restée
//   ouverte plus de RECHERCHE_MAX_MS est ignorée puis fermée.
// - Dès que deux joueurs cherchent : la graine est tirée ici, le Duel (un
//   Durable Object par partie, duel.js) est créé, chacun reçoit
//   { t: 'trouve', duel, jeton, camp, graine, config } et la connexion se ferme.
// - Le nombre de joueurs qui cherchent est envoyé à chacun quand il change
//   ({ t: 'attente', n } : message sortant, non facturé) ; /compter le donne
//   au site (fin d'une partie contre le robot : « Un joueur est disponible »).
// Rien n'est écrit dans le stockage.
// ==========================================================================

const RECHERCHE_MAX_MS = 25000;
const CONFIG_EN_LIGNE = { ligne: 1 };     // la simulation tire la carte de la graine

function json(x, status = 200) {
  return new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json' } });
}

function lire(ws) {
  try { return ws.deserializeAttachment() || {}; } catch { return {}; }
}

export class Rencontre {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    if (typeof WebSocketRequestResponsePair !== 'undefined') {
      state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }
  }

  // Joueurs qui cherchent encore (les plus anciens d'abord) ; les connexions trop vieilles sont fermées.
  enAttente() {
    const t = Date.now();
    const liste = [];
    for (const ws of this.state.getWebSockets('attente')) {
      const a = lire(ws);
      if (a.pris) continue;
      if (!(t - a.depuis < RECHERCHE_MAX_MS)) { try { ws.close(1000, 'trop long'); } catch { /* fermée */ } continue; }
      liste.push({ ws, depuis: a.depuis });
    }
    return liste.sort((x, y) => x.depuis - y.depuis).map((x) => x.ws);
  }

  annoncer() {
    const liste = this.enAttente();
    const texte = JSON.stringify({ t: 'attente', n: liste.length });
    for (const ws of liste) { try { ws.send(texte); } catch { /* fermée */ } }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/compter') return json({ n: this.enAttente().length });
    if (url.pathname !== '/ws') return new Response('Introuvable', { status: 404 });
    const jeu = url.searchParams.get('jeu') || '';
    const [client, serveur] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(serveur, ['attente']);
    serveur.serializeAttachment({ depuis: Date.now(), jeu });
    const autres = this.enAttente().filter((ws) => ws !== serveur);
    if (autres.length) await this.apparier(autres[0], serveur, jeu);
    else this.annoncer();
    return new Response(null, { status: 101, webSocket: client });
  }

  async apparier(a, b, jeu) {
    // Marqués pris tout de suite : un autre arrivant ne peut plus les choisir pendant l'attente ci-dessous.
    for (const ws of [a, b]) ws.serializeAttachment({ ...lire(ws), pris: true });
    const nom = `${jeu}.${crypto.randomUUID()}`;
    const graine = crypto.getRandomValues(new Uint32Array(1))[0];
    const jetons = [crypto.randomUUID(), crypto.randomUUID()];
    let ok = false;
    try {
      const duel = this.env.DUEL.get(this.env.DUEL.idFromName(nom));
      const r = await duel.fetch('https://duel/creer', { method: 'POST', body: JSON.stringify({ jeu, nom, graine, config: CONFIG_EN_LIGNE, jetons }) });
      ok = r.ok;
    } catch { ok = false; }
    [a, b].forEach((ws, camp) => {
      const message = ok
        ? { t: 'trouve', duel: nom, jeton: jetons[camp], camp, graine, config: CONFIG_EN_LIGNE }
        : { t: 'refus', raison: 'indisponible' };
      try { ws.send(JSON.stringify(message)); ws.close(1000, ok ? 'trouve' : 'refus'); } catch { /* fermée entre-temps */ }
    });
    this.annoncer();
  }

  webSocketMessage(ws, message) {
    if (message === 'annuler' || (typeof message === 'string' && message.includes('"annuler"'))) {
      try { ws.close(1000, 'annule'); } catch { /* fermée */ }
      this.annoncer();
    }
  }

  webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'au revoir'); } catch { /* fermée */ }
    this.annoncer();
  }

  webSocketError() {
    this.annoncer();
  }
}
