// ==========================================================================
// Partie : un Durable Object par partie (nom donné par l'accueil). C'est
// l'arbitre : il fait jouer les robots, reçoit les actions des vrais joueurs,
// les contrôle et les renvoie à tous (Arbitre de moteur.js). Avant chaque
// manche, un salon d'attente : les arrivants prennent la place de robots, et
// le chef (premier joueur arrivé encore présent) lance la manche, sinon elle
// part seule au bout de attenteSalon. Le chef n'est pas un hôte : le départ de
// n'importe quel joueur (fermeture de la page, réseau perdu) rend sa place à
// un robot, le suivant devient chef, et la partie continue.
//
// Économie du quota gratuit (docs/multijoueur.md) :
// - API WebSocket « hibernation » : entre deux messages, l'objet peut quitter
//   la mémoire sans couper les connexions (pas de durée facturée) ; « ping »
//   reçoit « pong » sans le réveiller ;
// - aucune minuterie : les coups des robots sont calculés dès que c'est à eux,
//   et une seule alarme est programmée (temps laissé à un vrai joueur, pause
//   entre deux manches, ou veille de 15 min), avancée seulement si besoin ;
// - une écriture de stockage par message reçu (état de l'arbitre) ;
// - plus aucun vrai joueur : alarme et stockage effacés, l'objet est libéré.
//
// Profil joueur (docs/cadrage-fidelisation.md, section 8) : le lanceur envoie
// d'abord { t: 'profil', ticket } (ticket signé par le site après Turnstile,
// src/ticket.js) ; le numéro de profil est rangé avec la connexion. À la fin
// de chaque manche, les résultats des joueurs reliés à un profil et assez
// présents (durée, coups joués soi-même) partent vers le site (src/profil.js).
// Ce message n'est pas transmis à l'arbitre : le protocole du moteur ne change pas.
//
// Amis (docs/consigne-amis.md) : à l'arrivée, le lanceur reçoit le nom de la
// partie ({ t: 'fmg-partie', nom }, gardé par le lanceur : c'est l'identifiant
// de session que la présence montre aux amis pour le bouton « Rejoindre ») ;
// et chaque appareil reçoit le pseudo des vrais joueurs assis
// ({ t: 'noms', noms: [{ p: pseudo, u: nombre du pseudo par défaut } | null
// par place] }), tiré de leur ticket (vérifié par le site), à chaque changement.
// Un ancien moteur ignore ces deux messages.
// ==========================================================================

import { Arbitre } from './moteur.js';
import { JEUX } from './jeux.js';
import { appelerAccueil } from './accueil.js';
import { verifierTicket } from './ticket.js';
import { nouveauSuivi, resultatsManche, envoyerResultats } from './profil.js';

const MESSAGE_MAX = 4000;        // caractères d'un message de joueur
const DEBIT_MAX = 30;            // messages par joueur et par fenêtre de 10 s, au-delà : déconnecté
const DEBIT_FENETRE_MS = 10000;
const VEILLE_MS = 15 * 60000;    // alarme de contrôle quand rien d'autre n'est prévu

export class Partie {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.arbitre = null;
    this.infos = null;           // { jeu, nom }
    this.debits = new Map();     // cle → { debut, nombre } (en mémoire seulement)
    this.suivi = null;           // manche en cours : début, coups joués par chaque vrai joueur (profil)
    this.aEnvoyer = [];          // résultats de manche à envoyer au site (profil)
    this.nomsEnvoyes = null;     // derniers pseudos envoyés (texte JSON, mémoire seulement)
    if (typeof WebSocketRequestResponsePair !== 'undefined') {
      state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }
  }

  creer(jeu, nom) {
    this.infos = { jeu, nom };
    // salon : avant chaque manche, salon d'attente ; le chef (premier arrivé) lance la manche.
    this.arbitre = new Arbitre(JEUX[jeu].regles, { salon: true, envoyer: (cle, m) => this.diffuser(cle, m) });
  }

  // Arbitre relu dans le stockage après un réveil. false : aucune partie gardée.
  async charger() {
    if (this.arbitre) return true;
    const d = await this.state.storage.get('partie');
    if (!d || !Object.prototype.hasOwnProperty.call(JEUX, d.jeu)) return false;
    this.creer(d.jeu, d.nom);
    if (!this.arbitre.restaurer(d.arbitre)) { this.arbitre = null; return false; }
    this.suivi = d.suivi || null;
    return true;
  }

  // Profil relié à une connexion (ticket présenté), ou null.
  profilDe(cle) {
    for (const ws of this.state.getWebSockets(cle)) {
      try { const p = ws.deserializeAttachment()?.profil; if (p) return p; } catch { /* connexion fermée */ }
    }
    return null;
  }

  // Pseudo d'un vrai joueur (ticket présenté), ou null.
  nomDe(cle) {
    for (const ws of this.state.getWebSockets(cle)) {
      try { const n = ws.deserializeAttachment()?.nom; if (n) return n; } catch { /* connexion fermée */ }
    }
    return null;
  }

  // Pseudos des places (null : robot, ou joueur sans profil), envoyés à tous quand
  // ils changent, et à un arrivant (cle) dans tous les cas.
  envoyerNoms(cle = null) {
    if (!this.arbitre) return;
    const noms = this.arbitre.sieges.map((c) => (c === null ? null : this.nomDe(c)));
    const texte = JSON.stringify(noms);
    if (texte === this.nomsEnvoyes && !cle) return;
    const message = { t: 'noms', noms };
    if (texte !== this.nomsEnvoyes) { this.nomsEnvoyes = texte; this.diffuser(null, message); }
    else this.diffuser(cle, message);
  }

  // Observe ce que l'arbitre annonce : début de manche, coups des vrais joueurs,
  // retour au salon = fin de la manche (résultats pour les profils).
  suivre(message) {
    if (!this.arbitre || !this.infos) return;
    if (message.t === 'manche') this.suivi = nouveauSuivi(message.manche, Date.now());
    else if (message.t === 'action' && !message.auto && this.suivi) {
      const cle = this.arbitre.sieges[message.s];
      if (cle) this.suivi.actions[cle] = (this.suivi.actions[cle] || 0) + 1;
    } else if (message.t === 'salon' && this.suivi && !this.suivi.rapportee) {
      this.aEnvoyer.push(...resultatsManche({
        regles: JEUX[this.infos.jeu].regles, etat: this.arbitre.etat, sieges: this.arbitre.sieges,
        profils: (cle) => this.profilDe(cle), suivi: this.suivi, nom: this.infos.nom, jeu: this.infos.jeu, maintenant: Date.now(),
      }));
      this.suivi.rapportee = true;
    }
  }

  async envoyerProfils() {
    if (!this.aEnvoyer.length) return;
    const liste = this.aEnvoyer.splice(0);
    await envoyerResultats(this.env, liste);
  }

  diffuser(cle, message) {
    if (!cle) this.suivre(message);
    const texte = JSON.stringify(message);
    for (const ws of cle ? this.state.getWebSockets(cle) : this.state.getWebSockets()) {
      try { ws.send(texte); } catch { /* connexion en train de se fermer */ }
    }
  }

  cleDe(ws) {
    try { return ws.deserializeAttachment()?.cle || null; } catch { return null; }
  }

  // État de l'arbitre (une ligne écrite) et alarme. L'alarme n'est avancée que si elle
  // doit sonner plus tôt : une alarme en avance ne fait rien d'autre que se reprogrammer,
  // ce qui écrit moins souvent qu'une alarme recalée à chaque coup.
  async sauver() {
    await this.state.storage.put('partie', { ...this.infos, arbitre: this.arbitre.donnees(), suivi: this.suivi });
    await this.envoyerProfils();
    const t = this.arbitre.prochainReveil();
    const voulue = t !== null && isFinite(t) ? Math.max(t, Date.now() + 50) : Date.now() + VEILLE_MS;
    const actuelle = await this.state.storage.getAlarm();
    if (actuelle === null || actuelle > voulue || actuelle <= Date.now()) await this.state.storage.setAlarm(voulue);
  }

  // Plus aucun vrai joueur : la partie est libérée (alarme et stockage effacés).
  async liberer() {
    this.arbitre = null;
    this.suivi = null;
    await this.state.storage.deleteAlarm();
    await this.state.storage.deleteAll();
  }

  async signaler() {
    if (!this.infos) return;
    const { jeu, nom } = this.infos;
    const humains = this.arbitre ? this.arbitre.humains() : 0;
    await appelerAccueil(this.env, 'signaler', { nom, jeu, humains, places: JEUX[jeu]?.regles.places });
  }

  // Arrivée d'un joueur (requête transmise par le Worker, avec l'en-tête Upgrade).
  async fetch(request) {
    const url = new URL(request.url);
    const jeu = url.searchParams.get('jeu') || '';
    const nom = url.searchParams.get('nom') || '';
    if (!Object.prototype.hasOwnProperty.call(JEUX, jeu) || !nom) return new Response('Requête invalide', { status: 400 });
    if (!(await this.charger())) this.creer(jeu, nom);
    if (this.infos.jeu !== jeu || this.arbitre.estPleine()) return new Response('Partie pleine', { status: 409 });

    const [client, serveur] = Object.values(new WebSocketPair());
    const cle = crypto.randomUUID();
    this.state.acceptWebSocket(serveur, [cle]);
    serveur.serializeAttachment({ cle });
    if (this.arbitre.rejoindre(cle) === null) {
      try { serveur.close(1013, 'pleine'); } catch { /* déjà fermée */ }
      return new Response('Partie pleine', { status: 409 });
    }
    this.arbitre.demarrer();
    // Pour le lanceur : nom de la partie (présence des amis, « Rejoindre ») ; puis les pseudos.
    this.diffuser(cle, { t: 'fmg-partie', nom: this.infos.nom });
    this.envoyerNoms(cle);
    await this.sauver();
    await this.signaler();
    return new Response(null, { status: 101, webSocket: client });
  }

  debitOk(cle) {
    const t = Date.now();
    let d = this.debits.get(cle);
    if (!d || t - d.debut > DEBIT_FENETRE_MS) this.debits.set(cle, (d = { debut: t, nombre: 0 }));
    return ++d.nombre <= DEBIT_MAX;
  }

  async webSocketMessage(ws, message) {
    const cle = this.cleDe(ws);
    if (!cle) return;
    if (typeof message !== 'string' || message.length > MESSAGE_MAX) { ws.close(1009, 'message trop long'); return; }
    if (!this.debitOk(cle)) { ws.close(1008, 'trop de messages'); return; }
    if (!(await this.charger())) { ws.close(1011, 'partie terminée'); return; }
    let m;
    try { m = JSON.parse(message); } catch { return; }
    // Ticket du profil joueur (envoyé par le lanceur, pas par le jeu).
    if (m?.t === 'profil') {
      const ticket = await verifierTicket(this.env.MULTI_SECRET, m.ticket, this.infos.jeu);
      if (ticket) {
        ws.serializeAttachment({ cle, profil: ticket.profil, nom: { p: ticket.pseudo, u: ticket.numero } });
        this.envoyerNoms();
      }
      return;
    }
    this.arbitre.recevoir(cle, m);
    this.envoyerNoms();
    await this.sauver();
  }

  async webSocketClose(ws, code) {
    await this.depart(ws);
    try { ws.close(code === 1005 ? 1000 : code, 'au revoir'); } catch { /* déjà fermée */ }
  }

  async webSocketError(ws) {
    await this.depart(ws);
  }

  // Départ d'un joueur : un robot reprend sa place ; plus personne : partie libérée.
  async depart(ws) {
    const cle = this.cleDe(ws);
    this.debits.delete(cle);
    if (!cle || !(await this.charger())) return;
    this.arbitre.quitter(cle);
    if (this.arbitre.estVide()) await this.liberer();
    else { this.envoyerNoms(); await this.sauver(); }
    await this.signaler();
  }

  // Réveil : joueurs disparus sans fermeture reçue, nouvelle manche, robot qui
  // joue à la place d'un joueur trop long.
  async alarm() {
    if (!(await this.charger())) { await this.liberer(); return; }
    const connectes = new Set(this.state.getWebSockets().map((ws) => this.cleDe(ws)));
    for (const cle of [...this.arbitre.sieges, ...this.arbitre.attente]) {
      if (cle !== null && !connectes.has(cle)) this.arbitre.quitter(cle);
    }
    if (this.arbitre.estVide()) {
      await this.liberer();
      await this.signaler();
      return;
    }
    this.arbitre.reveil();
    this.envoyerNoms();
    await this.sauver();
  }
}
