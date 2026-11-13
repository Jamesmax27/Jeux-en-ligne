// ==========================================================================
// Rencontre : un Durable Object par jeu temps réel (nom « rencontre:<jeu> »).
// Il tient la file des joueurs qui cherchent une partie et les réunit
// (docs/cadrage-temps-reel.md, sections 4 et 16).
//
// - Un WebSocket ouvert = un joueur qui cherche (API « hibernation » : entre
//   deux arrivées, l'objet n'est pas facturé ; « ping » reçoit « pong » sans le
//   réveiller). Aucune minuterie, aucune alarme : la recherche dure 15 s au
//   plus côté appareil ; une connexion restée ouverte plus de RECHERCHE_MAX_MS
//   est ignorée puis fermée.
// - Chaque joueur cherche un MODE du jeu (sim.modes : 1 contre 1, chacun pour
//   soi à 3 ou 4, 2 contre 2, équipe contre des robots…), une CARTE (ou « au
//   hasard », '*') et un niveau de robots. Les joueurs sont réunis en groupes,
//   par ordre d'arrivée : même mode (et même niveau de robots quand le mode a
//   des robots adverses), cartes compatibles (même carte, ou l'un des deux au
//   hasard). Le premier arrivé du groupe (l'hôte) aura le camp 0 et décide du
//   niveau des robots qui prennent les places libres.
// - Groupe complet (autant de joueurs que de places humaines du mode) : la
//   partie commence aussitôt. Sinon, un joueur du groupe peut la lancer avec
//   ceux qui sont là ({ t: 'lancer' } : bouton, ou fin de ses 15 s) : au moins
//   deux joueurs, les places libres sont des robots ; seul → { t: 'refus',
//   raison: 'personne' } (partie contre les robots sur l'appareil).
// - Partie trouvée : la graine est tirée ici, le Duel (un Durable Object par
//   partie, duel.js) est créé, chacun reçoit { t: 'trouve', duel, jeton, camp,
//   graine, config, humains, systeme } et la connexion se ferme.
// - Chaque joueur reçoit la taille de son groupe quand elle change
//   ({ t: 'attente', n, max } : message sortant, non facturé) ; /compter donne
//   au site le nombre de joueurs qui cherchent ce mode (fin d'une partie contre
//   le robot : « Un joueur est disponible »).
// Rien n'est écrit dans le stockage.
// ==========================================================================

import { JEUX_TR } from '../jeux.js';
import { configMode, modeDe, placesHumaines } from './moteur-tr.js';

const RECHERCHE_MAX_MS = 25000;
const RE_CHOIX = /^[a-z0-9*]{1,16}$/;

function json(x, status = 200) {
  return new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json' } });
}

function lire(ws) {
  try { return ws.deserializeAttachment() || {}; } catch { return {}; }
}

// Choix d'un joueur, ramenés à ce que la simulation connaît (mode par défaut, carte au hasard, robots moyens).
export function choixValides(sim, p) {
  const mode = modeDe(sim, RE_CHOIX.test(p.mode || '') ? p.mode : '').id;
  const cartes = Array.isArray(sim.cartes) ? sim.cartes : [];
  const carte = cartes.includes(p.carte) ? p.carte : '*';
  const n = Number(p.niveau);
  const niveau = Number.isInteger(n) && n >= 1 && n <= 3 ? n : 2;
  return { mode, carte, niveau };
}

// Clé de la file : le mode, et le niveau des robots quand le mode a des robots adverses
// (« 2 joueurs contre 1 robot difficile » : on ne se retrouve pas contre un robot facile).
function cleDe(sim, a) {
  return modeDe(sim, a.mode).robots.length ? `${a.mode}:${a.niveau}` : a.mode;
}

export class Rencontre {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    if (typeof WebSocketRequestResponsePair !== 'undefined') {
      state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }
  }

  sim(jeu) { return JEUX_TR[jeu] ? JEUX_TR[jeu].sim : null; }

  // Joueurs qui cherchent encore (les plus anciens d'abord) ; les connexions trop vieilles sont fermées.
  enAttente() {
    const t = Date.now();
    const liste = [];
    for (const ws of this.state.getWebSockets('attente')) {
      const a = lire(ws);
      if (a.pris) continue;
      if (!(t - a.depuis < RECHERCHE_MAX_MS)) { try { ws.close(1000, 'trop long'); } catch { /* fermée */ } continue; }
      liste.push({ ws, a });
    }
    return liste.sort((x, y) => x.a.depuis - y.a.depuis || x.a.n - y.a.n);
  }

  // Groupes, par ordre d'arrivée : chacun rejoint le plus ancien groupe compatible qui a encore une place.
  groupes() {
    const g = [];
    for (const x of this.enAttente()) {
      const sim = this.sim(x.a.jeu);
      if (!sim) continue;
      const cle = cleDe(sim, x.a);
      let groupe = g.find((y) => y.cle === cle && y.membres.length < y.max && (y.carte === '*' || x.a.carte === '*' || y.carte === x.a.carte));
      if (!groupe) g.push(groupe = { cle, jeu: x.a.jeu, mode: x.a.mode, niveau: x.a.niveau, carte: '*', max: placesHumaines(sim, x.a.mode).length, membres: [], ids: [] });
      groupe.membres.push(x.ws);
      groupe.ids.push(x.a.id);
      if (groupe.carte === '*' && x.a.carte !== '*') groupe.carte = x.a.carte;
    }
    return g;
  }

  annoncer(groupes = this.groupes()) {
    for (const groupe of groupes) {
      const texte = JSON.stringify({ t: 'attente', n: groupe.membres.length, max: groupe.max });
      for (const ws of groupe.membres) { try { ws.send(texte); } catch { /* fermée */ } }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/compter') {
      const mode = url.searchParams.get('mode');
      const n = this.enAttente().filter((x) => !mode || x.a.mode === mode).length;
      return json({ n });
    }
    if (url.pathname !== '/ws') return new Response('Introuvable', { status: 404 });
    const jeu = url.searchParams.get('jeu') || '';
    const sim = this.sim(jeu);
    if (!sim) return new Response('Jeu inconnu', { status: 404 });
    const choix = choixValides(sim, Object.fromEntries(url.searchParams));
    const [client, serveur] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(serveur, ['attente']);
    this.numero = (this.numero || 0) + 1;
    const id = crypto.randomUUID();
    serveur.serializeAttachment({ depuis: Date.now(), n: this.numero, id, jeu, ...choix });
    const groupes = this.groupes();
    // Les connexions sont reconnues par leur identifiant (getWebSockets peut rendre d'autres objets).
    const sien = groupes.find((g) => g.ids.includes(id));
    if (sien && sien.membres.length >= sien.max) await this.apparier(sien);
    else this.annoncer(groupes);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Une partie pour ce groupe : camps dans l'ordre d'arrivée, robots aux places libres.
  async apparier(groupe) {
    const membres = groupe.membres;
    // Marqués pris tout de suite : un autre arrivant ne peut plus les choisir pendant l'attente ci-dessous.
    for (const ws of membres) ws.serializeAttachment({ ...lire(ws), pris: true });
    const sim = this.sim(groupe.jeu);
    const nom = `${groupe.jeu}.${crypto.randomUUID()}`;
    const graine = crypto.getRandomValues(new Uint32Array(1))[0];
    const config = configMode(sim, { mode: groupe.mode, carte: groupe.carte, niveau: groupe.niveau }, membres.length, graine);
    const humains = placesHumaines(sim, groupe.mode).slice(0, membres.length);
    const jetons = config.ctl.map((x, camp) => (humains.includes(camp) ? crypto.randomUUID() : null));
    let ok = false;
    try {
      const duel = this.env.DUEL.get(this.env.DUEL.idFromName(nom));
      const r = await duel.fetch('https://duel/creer', { method: 'POST', body: JSON.stringify({ jeu: groupe.jeu, nom, graine, config, jetons, humains, systeme: sim.camps }) });
      ok = r.ok;
    } catch { ok = false; }
    membres.forEach((ws, i) => {
      const camp = humains[i];
      const message = ok
        ? { t: 'trouve', duel: nom, jeton: jetons[camp], camp, graine, config, humains, systeme: sim.camps }
        : { t: 'refus', raison: 'indisponible' };
      try { ws.send(JSON.stringify(message)); ws.close(1000, ok ? 'trouve' : 'refus'); } catch { /* fermée entre-temps */ }
    });
    this.annoncer();
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 200) return;
    if (message === 'annuler' || message.includes('"annuler"')) {
      try { ws.close(1000, 'annule'); } catch { /* fermée */ }
      this.annoncer();
      return;
    }
    if (message.includes('"lancer"')) {
      if (lire(ws).pris) return;
      const id = lire(ws).id;
      const groupe = this.groupes().find((g) => g.ids.includes(id));
      if (groupe && groupe.membres.length >= 2) { await this.apparier(groupe); return; }
      try { ws.send(JSON.stringify({ t: 'refus', raison: 'personne' })); ws.close(1000, 'seul'); } catch { /* fermée */ }
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
