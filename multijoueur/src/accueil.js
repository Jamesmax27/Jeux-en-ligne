// ==========================================================================
// Accueil : Durable Object unique (nom « accueil ») qui répartit les joueurs
// entre les parties et tient la limite globale de vrais joueurs connectés.
//
// Il garde, pour chaque partie ouverte : son jeu, son nombre de places, son
// nombre de vrais joueurs et l'heure de la dernière nouvelle. Chaque partie
// lui donne son nombre exact de vrais joueurs à chaque arrivée et à chaque
// départ ; une partie sans nouvelles depuis 4 heures est oubliée.
//
//   POST /placer   { jeu, places, max, prefere } → { nom } (place réservée) ou { complet: true }
//                  La partie choisie est « prefere » (partie d'un ami, bouton
//                  « Rejoindre ») si elle existe et a encore une place, sinon
//                  celle du jeu qui a déjà le plus de vrais joueurs sans être
//                  pleine (les joueurs se retrouvent) ; s'il n'y en a pas, une
//                  nouvelle partie.
//   POST /signaler { nom, jeu, humains, places }   compte exact d'une partie
//   POST /annuler  { nom }   place réservée mais pas prise
//   POST /etat     { nom, jeu, max } → { etat: 'ouverte' | 'pleine' | 'introuvable' | 'complet' }
//                  (lecture seule : peut-on rejoindre la partie d'un ami ?)
// Une seule écriture de stockage par appel (aucune pour /etat).
// ==========================================================================

const OUBLI_MS = 4 * 3600000;   // partie sans nouvelles depuis 4 h : oubliée
const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Appel à l'accueil depuis le Worker ou une partie. Renvoie sa réponse JSON, ou null.
export async function appelerAccueil(env, action, corps) {
  try {
    const accueil = env.ACCUEIL.get(env.ACCUEIL.idFromName('accueil'));
    const reponse = await accueil.fetch(`https://accueil/${action}`, { method: 'POST', body: JSON.stringify(corps) });
    return reponse.ok ? await reponse.json() : null;
  } catch {
    return null;
  }
}

export class Accueil {
  constructor(state) {
    this.state = state;
    this.parties = null;      // { <nom>: { jeu, places, humains, maj } }
  }

  async fetch(request) {
    const action = new URL(request.url).pathname.slice(1);
    let corps = {};
    try { corps = (await request.json()) || {}; } catch { /* corps vide */ }
    if (!this.parties) this.parties = (await this.state.storage.get('parties')) || {};

    const maintenant = Date.now();
    for (const [nom, p] of Object.entries(this.parties)) if (maintenant - p.maj > OUBLI_MS) delete this.parties[nom];

    let reponse = {};
    if (action === 'etat') {
      const p = Object.prototype.hasOwnProperty.call(this.parties, corps.nom) ? this.parties[corps.nom] : null;
      let etat = 'ouverte';
      if (!p || p.jeu !== corps.jeu || p.humains <= 0) etat = 'introuvable';
      else if (p.humains >= p.places) etat = 'pleine';
      else if (Number.isInteger(corps.max) && this.joueurs() >= corps.max) etat = 'complet';
      return new Response(JSON.stringify({ etat }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (action === 'placer') reponse = this.placer(corps, maintenant);
    else if (action === 'signaler') this.signaler(corps, maintenant);
    else if (action === 'annuler') this.annuler(corps);
    else return new Response('Introuvable', { status: 404 });

    await this.state.storage.put('parties', this.parties);
    return new Response(JSON.stringify(reponse), { headers: { 'Content-Type': 'application/json' } });
  }

  joueurs() {
    return Object.values(this.parties).reduce((n, p) => n + p.humains, 0);
  }

  placer({ jeu, places, max, prefere }, maintenant) {
    if (!ID_VALIDE.test(String(jeu)) || !Number.isInteger(places)) return {};
    if (this.joueurs() >= max) return { complet: true };
    let choix = null;
    const voulue = typeof prefere === 'string' && Object.prototype.hasOwnProperty.call(this.parties, prefere) ? this.parties[prefere] : null;
    if (voulue && voulue.jeu === jeu && voulue.humains > 0 && voulue.humains < voulue.places) choix = prefere;
    else for (const [nom, p] of Object.entries(this.parties)) {
      if (p.jeu !== jeu || p.humains >= p.places) continue;
      if (!choix || p.humains > this.parties[choix].humains) choix = nom;
    }
    if (!choix) {
      choix = `${jeu}.${crypto.randomUUID()}`;
      this.parties[choix] = { jeu, places, humains: 0, maj: maintenant };
    }
    const p = this.parties[choix];
    p.humains += 1;
    p.maj = maintenant;
    return { nom: choix };
  }

  signaler({ nom, jeu, humains, places }, maintenant) {
    if (typeof nom !== 'string' || !nom) return;
    if (!(Number.isInteger(humains) && humains > 0)) delete this.parties[nom];
    else this.parties[nom] = { jeu, places, humains, maj: maintenant };
  }

  annuler({ nom }) {
    const p = this.parties[nom];
    if (!p) return;
    p.humains -= 1;
    if (p.humains <= 0) delete this.parties[nom];
  }
}
