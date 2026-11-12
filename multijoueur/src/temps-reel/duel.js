// ==========================================================================
// Duel : un Durable Object par partie temps réel 1 contre 1 (nom donné par la
// Rencontre, rencontre.js). Détails : docs/cadrage-temps-reel.md, sections 6 et 7.
//
// 1. Signalisation : il fait passer les offres et candidats WebRTC entre les
//    deux lanceurs (messages sdp, ice), puis décide du mode :
//      - les deux lanceurs annoncent { t: 'p2p' } (DataChannel ouvert) → mode
//        pair-à-pair : l'objet n'a plus rien à faire et HIBERNE (connexions
//        gardées pour la bascule, « ping » automatique gratuit) ;
//      - un lanceur annonce { t: 'relais' } (pas de DataChannel au bout de
//        5 s) → mode relayé, si le Budget le permet (budget.js), sinon refus :
//        chacun joue contre le robot sur son appareil.
// 2. Relais : quand les deux joueurs sont prêts, l'objet fait tourner le
//    CADENCEUR (horloge à tick fixe, ordres datés tick + délai d'entrée, un
//    paquet par tick même vide) et la SIMULATION (moteur jel-tr et bloc jel-sim
//    du jeu, recopiés par scripts/multijoueur.mjs) : il est l'arbitre en cas
//    d'écart de hachage et donne l'instantané de reprise. C'est la seule
//    minuterie du Worker ; elle s'arrête à la fin de la partie.
// 3. Secours : le pair-à-pair coupe en pleine partie → { t: 'secours' } →
//    relais (si le Budget le permet) : l'objet demande l'état aux appareils,
//    repart de l'instantané reçu et l'envoie à tous.
// 4. Absence : un joueur sans nouvelles depuis ABSENCE_MS (connexion fermée,
//    téléphone en veille) → son camp passe au robot (ordre de contrôle) ; à son
//    retour ({ t: 'reprise' }), instantané, puis il reprend la main.
//
// Coût (docs/couts-temps-reel.md) : pair-à-pair, une dizaine de requêtes et
// quelques lignes écrites par partie ; relais, toute la durée de la partie en
// mémoire (128 Mo), quelques dizaines de requêtes (messages reçus : 1/20).
// Les messages envoyés ne sont pas facturés. Chaque fin de partie relayée écrit
// une ligne de mesures dans les journaux du Worker (« [temps réel] mesure »).
// ==========================================================================

import { Simulation, Cadenceur, REGLAGES } from './moteur-tr.js';
import { appelerBudget, GO_PAR_OBJET } from './budget.js';
import { JEUX_TR } from '../jeux.js';

export const ABSENCE_MS = 10000;          // sans nouvelles d'un joueur : son camp passe au robot
export const DUREE_MAX_MS = 20 * 60000;   // durée maximale d'une partie relayée
const ATTENTE_ADVERSAIRE_MS = 8000;      // un seul joueur arrivé au Duel : il joue contre le robot
const INACTIF_MS = 2 * 60000;            // Duel abandonné avant la fin du choix du mode
const SECOURS_MS = 4000;                 // délai pour recevoir l'instantané d'un appareil
const MESSAGE_MAX = 1000;                // caractères d'un message de joueur
const SNAP_MAX = 65536;                  // caractères d'un instantané envoyé par un appareil
const DEBIT_MAX = 60;                    // messages par joueur et par fenêtre de 10 s
const DEBIT_FENETRE_MS = 10000;
const NIVEAU_RELAIS = 2;                 // robot moyen à la place d'un joueur absent

function texte(contenu, status) {
  return new Response(contenu, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export class Duel {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.d = null;               // fiche du duel (stockage) : jeu, graine, config, jetons, mode…
    this.sim = null;             // simulation (relais)
    this.cad = null;             // cadenceur (relais)
    this.minuteur = 0;
    this.t0 = 0;
    this.kDebut = 0;
    this.dernier = [0, 0];       // dernière nouvelle de chaque camp (ms)
    this.robot = [false, false]; // camp passé au robot pour absence
    this.debutRelais = 0;
    this.attenteSnap = 0;        // secours : instantané attendu jusqu'à cette heure
    this.debits = new Map();
    this.mesure = { recus: 0, octetsRecus: 0, envoyes: 0, octetsEnvoyes: 0, ticks: 0, desync: 0, reprises: 0 };
    if (typeof WebSocketRequestResponsePair !== 'undefined') {
      state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }
  }

  async charger() {
    if (!this.d) this.d = (await this.state.storage.get('duel')) || null;
    return this.d;
  }

  async sauver() { if (this.d) await this.state.storage.put('duel', this.d); }

  socketsDe(camp) { return this.state.getWebSockets(`c${camp}`); }

  campDe(ws) {
    try { const a = ws.deserializeAttachment(); return a && Number.isInteger(a.camp) ? a.camp : -1; } catch { return -1; }
  }

  envoyer(camp, message) {
    const t = JSON.stringify(message);
    for (const ws of camp === null ? this.state.getWebSockets() : this.socketsDe(camp)) {
      try { ws.send(t); this.mesure.envoyes += 1; this.mesure.octetsEnvoyes += t.length; } catch { /* fermée */ }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/creer') {
      let corps;
      try { corps = await request.json(); } catch { return texte('Invalide', 400); }
      if (!corps || !Object.prototype.hasOwnProperty.call(JEUX_TR, corps.jeu) || !Array.isArray(corps.jetons) || corps.jetons.length !== 2) return texte('Invalide', 400);
      this.d = {
        jeu: corps.jeu, nom: corps.nom, graine: corps.graine >>> 0, config: corps.config || {}, jetons: corps.jetons,
        mode: null, p2p: [false, false], pret: [false, false], vus: [false, false], cree: Date.now(), fini: false,
      };
      await this.sauver();
      await this.state.storage.setAlarm(Date.now() + ATTENTE_ADVERSAIRE_MS);
      return texte('ok', 200);
    }
    if (url.pathname !== '/ws') return texte('Introuvable', 404);
    const d = await this.charger();
    if (!d || d.fini) return texte('Partie terminée', 410);
    const camp = d.jetons.indexOf(url.searchParams.get('jeton') || '');
    if (camp < 0) return texte('Jeton inconnu', 403);
    // Reconnexion : l'ancienne connexion du même camp est remplacée.
    for (const ancien of this.socketsDe(camp)) { try { ancien.close(1000, 'remplacee'); } catch { /* fermée */ } }
    const [client, serveur] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(serveur, [`c${camp}`]);
    serveur.serializeAttachment({ camp });
    this.dernier[camp] = Date.now();
    if (!d.vus[camp]) { d.vus[camp] = true; await this.sauver(); }
    try { serveur.send(JSON.stringify({ t: 'bienvenue', camp, mode: d.mode, k: this.cad ? this.cad.k : null })); } catch { /* fermée */ }
    return new Response(null, { status: 101, webSocket: client });
  }

  debitOk(camp) {
    const t = Date.now();
    let x = this.debits.get(camp);
    if (!x || t - x.debut > DEBIT_FENETRE_MS) this.debits.set(camp, (x = { debut: t, n: 0 }));
    return ++x.n <= DEBIT_MAX;
  }

  async webSocketMessage(ws, message) {
    const camp = this.campDe(ws);
    if (camp < 0 || typeof message !== 'string') return;
    this.mesure.recus += 1;
    this.mesure.octetsRecus += message.length;
    if (message.length > SNAP_MAX || (message.length > MESSAGE_MAX && !message.startsWith('{"t":"snap"'))) { ws.close(1009, 'message trop long'); return; }
    if (!this.debitOk(camp)) { ws.close(1008, 'trop de messages'); return; }
    let m;
    try { m = JSON.parse(message); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const d = await this.charger();
    if (!d) { ws.close(1011, 'partie inconnue'); return; }
    this.dernier[camp] = Date.now();
    if (this.robot[camp] && this.cad && m.t !== 'snap') this.rendreLaMain(camp);
    const autre = 1 - camp;

    switch (m.t) {
      case 'sdp':
      case 'ice':
        if (d.mode !== 'relais') this.envoyer(autre, { t: m.t, d: m.d });
        return;
      case 'p2p':
        d.p2p[camp] = true;
        if (!d.mode && d.p2p[0] && d.p2p[1]) {
          d.mode = 'p2p';
          this.envoyer(null, { t: 'mode', mode: 'p2p' });
          await appelerBudget(this.env, 'noter', { type: 'p2p' });
          await this.state.storage.setAlarm(Date.now() + DUREE_MAX_MS + 60000);
        }
        await this.sauver();
        return;
      case 'relais':
        if (!d.mode) await this.passerRelais('relais');
        return;
      case 'pret':
        d.pret[camp] = true;
        await this.sauver();
        if (d.mode === 'relais' && !d.secours && d.pret[0] && d.pret[1] && !this.minuteur) this.demarrer(0, null);
        return;
      case 'o':
        if (this.cad && Array.isArray(m.o)) this.cad.recevoir(camp, m.seq, m.o);
        return;
      case 'h':
        if (this.sim && Number.isInteger(m.k)) {
          const h = this.sim.hashDe(m.k);
          if (h && h !== m.h) {
            this.mesure.desync += 1;
            console.warn('[temps réel] désynchronisation', JSON.stringify({ duel: d.nom, camp, k: m.k, serveur: h, appareil: m.h, ordres: this.sim.journal.slice(-50) }));
            this.envoyer(camp, { t: 'snap', snap: this.sim.instantane() });
          }
        }
        return;
      case 'reprise':
        if (this.sim) { this.mesure.reprises += 1; this.envoyer(camp, { t: 'snap', snap: this.sim.instantane() }); }
        return;
      case 'secours':
        if (d.mode === 'p2p' && !this.minuteur && !this.attenteSnap) await this.passerRelais('secours');
        return;
      case 'snap':
        if (this.attenteSnap && m.snap && Number.isInteger(m.snap.k) && m.snap.etat) {
          this.attenteSnap = 0;
          this.demarrer(m.snap.k, m.snap);
          this.envoyer(null, { t: 'snap', snap: this.sim.instantane() });
        }
        return;
      case 'fin':
        // Pair-à-pair fini : plus rien à garder (le relais finit de lui-même).
        if (d.mode === 'p2p' && !d.fini) {
          console.log('[temps réel] mesure', JSON.stringify({ duel: d.nom, raison: 'fin-p2p', secondes: Math.round((Date.now() - d.cree) / 1000), ...this.mesure, requetesEstimees: Math.ceil(this.mesure.recus / 20) + 2 }));
          d.fini = true; await this.sauver(); await this.state.storage.setAlarm(Date.now() + 5000);
        }
        return;
      default:
        return;
    }
  }

  // Passage au relais (ou secours), si le Budget du jour le permet.
  async passerRelais(raison) {
    const d = this.d;
    const gos = (DUREE_MAX_MS / 1000) * GO_PAR_OBJET;
    const r = await appelerBudget(this.env, 'reserver', { gos });
    if (!r?.ok) {
      d.mode = 'refus';
      await this.sauver();
      this.envoyer(null, { t: 'refus', raison: 'budget' });
      await this.state.storage.setAlarm(Date.now() + 5000);
      return false;
    }
    d.reserve = gos;
    d.mode = 'relais';
    d.secours = raison === 'secours';
    await this.sauver();
    await appelerBudget(this.env, 'noter', { type: raison === 'secours' ? 'secours' : 'relais' });
    this.envoyer(null, { t: 'mode', mode: 'relais', secours: raison === 'secours' });
    if (raison === 'secours') {
      this.attenteSnap = Date.now() + SECOURS_MS;
      this.envoyer(null, { t: 'demande-snap' });
      await this.state.storage.setAlarm(this.attenteSnap);
    } else if (d.pret[0] && d.pret[1] && !this.minuteur) {
      this.demarrer(0, null);     // les deux joueurs étaient déjà prêts
    }
    return true;
  }

  // Lance la boucle des ticks au tick k (instantané facultatif : secours).
  demarrer(k, snap) {
    const d = this.d;
    const fiche = JEUX_TR[d.jeu];
    this.sim = new Simulation(fiche.sim, d.graine, { ...d.config, ctl: [0, 0] });
    if (snap) this.sim.restaurer(snap);
    const tickMs = (fiche.sim.reglages && fiche.sim.reglages.tickMs) || REGLAGES.tickMs;
    this.cad = new Cadenceur({
      camps: fiche.sim.camps, delai: this.sim.r.delaiEntree, depart: this.sim.k(),
      envoyer: (paquet) => this.envoyer(null, paquet),
    });
    this.tickMs = tickMs;
    this.t0 = Date.now();
    this.kDebut = this.sim.k();
    this.debutRelais = this.debutRelais || Date.now();
    this.dernier = [Date.now(), Date.now()];
    clearInterval(this.minuteur);
    this.minuteur = setInterval(() => this.battre(), Math.max(20, tickMs >> 1));
  }

  battre() {
    const maintenant = Date.now();
    let dus = this.kDebut + Math.floor((maintenant - this.t0) / this.tickMs) - this.cad.k;
    if (dus > 100) { this.t0 = maintenant - (this.cad.k - this.kDebut) * this.tickMs; dus = 1; }   // objet arrêté plus de 10 s : pas d'avalanche
    while (dus-- > 0 && !this.sim.resultat) {
      const paquet = this.cad.pas();
      this.sim.avancer(paquet.o);
      this.mesure.ticks += 1;
    }
    // Absences : le camp d'un joueur sans nouvelles passe au robot ; personne : la partie s'arrête.
    let presents = 0;
    for (let c = 0; c < 2; c++) {
      const connecte = this.socketsDe(c).length > 0;
      const absent = !connecte || maintenant - this.dernier[c] > ABSENCE_MS;
      if (!absent) presents += 1;
      if (absent && !this.robot[c] && this.sim.etat.ctl[c] === 0) { this.cad.controle(c, NIVEAU_RELAIS); this.robot[c] = true; }
    }
    if (this.sim.resultat) { this.envoyer(null, { t: 'fin', resultat: this.sim.resultat }); this.arreter('fin'); return; }
    if (presents === 0 && maintenant - Math.max(...this.dernier) > ABSENCE_MS) { this.arreter('abandon'); return; }
    if (maintenant - this.debutRelais > DUREE_MAX_MS) { this.envoyer(null, { t: 'fin', resultat: null }); this.arreter('duree'); }
  }

  rendreLaMain(camp) {
    this.robot[camp] = false;
    if (this.sim.etat.ctl[camp] !== 0) this.cad.controle(camp, 0);
  }

  // Fin d'une partie relayée : la minuterie s'arrête, le Budget récupère la réserve non utilisée.
  arreter(raison) {
    clearInterval(this.minuteur);
    this.minuteur = 0;
    const secondes = (Date.now() - this.debutRelais) / 1000;
    const reel = secondes * GO_PAR_OBJET;
    console.log('[temps réel] mesure', JSON.stringify({ duel: this.d && this.d.nom, raison, secondes: Math.round(secondes), gos: Math.round(reel), ...this.mesure, requetesEstimees: Math.ceil(this.mesure.recus / 20) + 2 }));
    const reserve = this.d ? this.d.reserve || 0 : 0;
    if (this.d) { this.d.reserve = 0; this.d.fini = true; }
    // Sans attendre : la minuterie appelle cette fonction hors d'un événement.
    this.state.waitUntil?.(Promise.all([
      appelerBudget(this.env, 'rendre', { gos: reserve, reel }),
      this.sauver(),
      this.state.storage.setAlarm(Date.now() + 30000),
    ]).catch(() => {}));
    if (!this.state.waitUntil) {
      appelerBudget(this.env, 'rendre', { gos: reserve, reel }).catch(() => {});
      this.sauver().catch(() => {});
      this.state.storage.setAlarm(Date.now() + 30000).catch(() => {});
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'au revoir'); } catch { /* fermée */ }
  }

  async webSocketError() { /* la boucle des ticks voit l'absence */ }

  // Réveil : adversaire jamais arrivé, secours sans instantané, nettoyage.
  async alarm() {
    const d = await this.charger();
    if (!d) { await this.state.storage.deleteAll(); return; }
    if (this.minuteur) { await this.state.storage.setAlarm(Date.now() + 60000); return; }
    if (this.attenteSnap) {
      if (Date.now() < this.attenteSnap) { await this.state.storage.setAlarm(this.attenteSnap); return; }
      this.attenteSnap = 0;
      this.envoyer(null, { t: 'refus', raison: 'secours' });
      if (d.reserve) { await appelerBudget(this.env, 'rendre', { gos: d.reserve, reel: 0 }); d.reserve = 0; }
      d.fini = true;
    }
    const age = Date.now() - d.cree;
    if (!d.fini && !d.mode && !(d.vus[0] && d.vus[1])) {
      // Un seul joueur est arrivé : il joue contre le robot.
      this.envoyer(null, { t: 'refus', raison: 'adversaire' });
      await appelerBudget(this.env, 'noter', { type: 'echec' });
      d.fini = true;
    }
    if (!d.fini && (!d.mode || d.mode === 'relais') && age < INACTIF_MS) { await this.state.storage.setAlarm(d.cree + INACTIF_MS); return; }
    if (!d.fini && d.mode === 'p2p' && age < DUREE_MAX_MS + 60000) { await this.state.storage.setAlarm(d.cree + DUREE_MAX_MS + 60000); return; }
    for (const ws of this.state.getWebSockets()) { try { ws.close(1000, 'fin'); } catch { /* fermée */ } }
    this.d = null;
    await this.state.storage.deleteAlarm();
    await this.state.storage.deleteAll();
  }
}
