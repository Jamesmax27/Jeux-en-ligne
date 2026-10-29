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
// ==========================================================================

import { Arbitre } from './moteur.js';
import { JEUX } from './jeux.js';
import { appelerAccueil } from './accueil.js';

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
    return true;
  }

  diffuser(cle, message) {
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
    await this.state.storage.put('partie', { ...this.infos, arbitre: this.arbitre.donnees() });
    const t = this.arbitre.prochainReveil();
    const voulue = t !== null && isFinite(t) ? Math.max(t, Date.now() + 50) : Date.now() + VEILLE_MS;
    const actuelle = await this.state.storage.getAlarm();
    if (actuelle === null || actuelle > voulue || actuelle <= Date.now()) await this.state.storage.setAlarm(voulue);
  }

  // Plus aucun vrai joueur : la partie est libérée (alarme et stockage effacés).
  async liberer() {
    this.arbitre = null;
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
    this.arbitre.recevoir(cle, m);
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
    else await this.sauver();
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
    await this.sauver();
  }
}
