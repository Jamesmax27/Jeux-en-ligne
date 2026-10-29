#!/usr/bin/env node
// ==========================================================================
// tester-multijoueur.mjs — robot de contrôle des jeux multijoueurs
//
//   node scripts/tester-multijoueur.mjs                moteur, Worker et tous les jeux multijoueurs
//   node scripts/tester-multijoueur.mjs <id>…          … seulement ces jeux
//   … --navigateur   en plus, chaque jeu dans le lanceur (Playwright) avec un
//                    faux serveur : partie en ligne, arrivée de vrais joueurs
//                    jusqu'à la table pleine, départs, coupure du réseau
//                    (le jeu doit continuer contre des robots locaux) ;
//                    captures dans captures/multijoueur/<id>/
//   … --moteur       seulement le moteur et le Worker (jeu d'essai intégré)
//
// Sans réseau ni Cloudflare : le Worker (multijoueur/src/) tourne ici avec de
// faux Durable Objects. Contrôles (docs/multijoueur.md, « Critères de validation ») :
//   - règles (bloc jel-regles) : fonctions pures, sans réseau, ni date, ni
//     Math.random (le hasard passe par alea) ; places de 2 à 10, égal à
//     "places" de game.json ;
//   - mêmes états sur le serveur et sur chaque appareil (seules les actions
//     circulent) ; chaque manche se termine ; résultat bien formé ;
//   - remplacement robot → joueur et joueur → robot ; départ de n'importe
//     quel joueur sans interrompre la partie ; robot qui joue à la place d'un
//     joueur trop long ; table pleine ; manches qui s'enchaînent ;
//   - robots qu'on peut battre (un joueur fort gagne au moins une manche
//     sur 10) et qui ne jouent pas toujours pareil ;
//   - Worker : sites permis, règles et protocole identiques, répartition
//     entre parties, limite globale MAX_JOUEURS, partie libérée au départ du
//     dernier joueur.
// Code de sortie : 0 = tout est bon, 1 = problème(s), 2 = panne de l'outil.
// Le mode --navigateur nécessite Playwright (ou CHROMIUM_PATH, ex. Edge).
// ==========================================================================

import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { jeuxMultijoueurs, contenuWorker } from './multijoueur.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT_TEST = 8126;
const MANCHES = 12;                 // manches simulées par contrôle
const ACTIONS_MAX = 3000;           // actions au plus par manche

const args = process.argv.slice(2);
const avecNavigateur = args.includes('--navigateur');
const moteurSeul = args.includes('--moteur');
const idsDemandes = args.filter((a) => !a.startsWith('--'));

const problemes = new Map();        // sujet → [messages]
const notes = new Map();
const probleme = (sujet, m) => (problemes.get(sujet) || problemes.set(sujet, []).get(sujet)).push(m);
const noter = (sujet, m) => (notes.get(sujet) || notes.set(sujet, []).get(sujet)).push(m);

await import('../public/multijoueur/moteur.js');
const { Arbitre, hasard, copie, problemesRegles, PROTOCOLE } = globalThis.JEL_MULTI;

// --------------------------------------------------------------------------
// Jeu d'essai du moteur : on retire 1 à 3 jetons ; parfois (hasard) un jeton
// revient ; celui qui prend le dernier jeton gagne.
// --------------------------------------------------------------------------
const REGLES_ESSAI = `window.JEL_REGLES = {
  places: 3,
  delaiBot: 300,
  depart: function (alea, places, options) { return { tas: 9 + Math.floor(alea() * 6), tour: Math.floor(alea() * places), pris: [0, 0, 0], gagnant: -1 }; },
  aQui: function (e) { return e.tour; },
  valide: function (e, s, a) { return e.gagnant < 0 && Number.isInteger(a) && a >= 1 && a <= 3 && a <= e.tas; },
  jouer: function (e, s, a, alea) {
    e.tas -= a; e.pris[s] += a;
    if (e.tas === 0) { e.gagnant = s; return e; }
    if (e.tas > 4 && alea() < 0.25) e.tas += 1;
    e.tour = (e.tour + 1) % 3;
    return e;
  },
  bot: function (e, s, alea, force) {
    var bon = e.tas % 4;
    if (bon && alea() < force) return bon;
    return 1 + Math.floor(alea() * Math.min(3, e.tas));
  },
  fin: function (e) {
    if (e.gagnant < 0) return null;
    var autres = [0, 1, 2].filter(function (s) { return s !== e.gagnant; });
    return { classement: [e.gagnant].concat(autres), scores: [0, 1, 2].map(function (s) { return s === e.gagnant ? 1 : 0; }) };
  }
};`;

// --------------------------------------------------------------------------
// 1. Règles : lecture dans un contexte isolé, mots interdits
// --------------------------------------------------------------------------

const INTERDITS = [
  [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon)\b/, 'accès au réseau'],
  [/\b(?:localStorage|sessionStorage|indexedDB|document|parent|postMessage|JEL_SAVE|JEL_I18N|FMG)\b/, 'page, stockage ou site (les règles ne font que calculer)'],
  [/\b(?:eval|Function)\s*\(|\bnew\s+Function\b|\bimport\s*\(/, 'code fabriqué à la volée (eval, Function, import)'],
  [/\b(?:setTimeout|setInterval|requestAnimationFrame)\b/, 'minuterie (l\'arbitre décide du temps)'],
  [/\bDate\b|\bperformance\b/, 'heure (même résultat sur le serveur et sur chaque appareil : pas de Date)'],
  [/\bMath\.random\b|\bcrypto\b/, 'hasard non reproductible (utiliser alea, donné par l\'arbitre)'],
];

function lireRegles(texte, sujet) {
  // Les commentaires ne comptent pas pour les mots interdits.
  const code = texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
  for (const [motif, quoi] of INTERDITS) {
    const m = motif.exec(code);
    if (m) probleme(sujet, `règles (jel-regles) : « ${m[0].trim()} » interdit — ${quoi}`);
  }
  try {
    // Mode strict, comme dans le Worker (module ES) ; window = objet vide.
    const r = vm.runInNewContext(`"use strict"; (function (window) {\n${texte}\n;return window.JEL_REGLES; })({})`, {}, { timeout: 3000 });
    const p = problemesRegles(r);
    for (const x of p) probleme(sujet, `règles (jel-regles) : ${x}`);
    return p.length ? null : r;
  } catch (e) {
    probleme(sujet, `règles (jel-regles) : erreur à la lecture (${e.message})`);
    return null;
  }
}

// --------------------------------------------------------------------------
// 2. Arbitre : parties simulées
// --------------------------------------------------------------------------

// Horloge et hasard reproductibles pour l'arbitre.
function banc(r, reglages = {}) {
  let t = 1_000_000;
  const graine = hasard(reglages.graine ?? 7);
  const boites = new Map();      // cle → messages reçus (null = tous)
  const tous = [];
  const arbitre = new Arbitre(r, {
    maintenant: () => t,
    alea: graine,
    envoyer: (cle, m) => {
      const copieM = copie(m);
      if (cle === null) { tous.push(copieM); for (const b of boites.values()) b.push(copieM); }
      else (boites.get(cle) || boites.set(cle, []).get(cle)).push(copieM);
    },
    ...reglages,
  });
  return {
    arbitre, tous, boites,
    avancerHorloge(ms) { t += ms; },
    heure: () => t,
    boite(cle) { return boites.get(cle) || boites.set(cle, []).get(cle); },
  };
}

// Copie d'un appareil : refait l'état à partir des seuls messages.
function replique(r) {
  const c = { etat: null, n: 0, ecarts: [] };
  c.appliquer = (m) => {
    if (m.t === 'bienvenue') { c.etat = copie(m.etat); c.n = m.n; }
    else if (m.t === 'manche') { c.etat = r.depart(hasard(m.g), r.places, copie(m.o)); c.n = m.n; }
    else if (m.t === 'action') {
      if (m.n !== c.n + 1) c.ecarts.push(`message ${m.n} reçu après ${c.n}`);
      c.etat = r.jouer(copie(c.etat), m.s, copie(m.a), hasard(m.g));
      c.n = m.n;
    }
  };
  return c;
}

// Fait jouer les vrais joueurs (cles) avec le robot des règles, jusqu'à la fin
// de la manche en cours. Renvoie false si la manche ne se termine pas.
function jouerManche(b, r, joueurs, force = 0.5, alea = hasard(99)) {
  const a = b.arbitre;
  for (let i = 0; i < ACTIONS_MAX && a.phase === 'jeu'; i++) {
    const s = r.aQui(a.etat);
    const cle = a.sieges[s];
    if (cle === null || !joueurs.includes(cle)) return a.phase !== 'jeu';
    const action = r.bot(copie(a.etat), s, alea, force);
    a.recevoir(cle, { t: 'action', n: a.n, a: action });
  }
  return a.phase !== 'jeu';
}

function resultatBienForme(res, places) {
  if (!res || !Array.isArray(res.classement) || !res.classement.length) return 'fin(etat) : "classement" (liste des places, du 1er au dernier) manquant';
  if (res.classement.some((s) => !Number.isInteger(s) || s < 0 || s >= places) || new Set(res.classement).size !== res.classement.length) return 'fin(etat) : "classement" contient une place invalide ou en double';
  if (res.scores !== undefined && (!Array.isArray(res.scores) || res.scores.length !== places || res.scores.some((x) => typeof x !== 'number'))) return 'fin(etat) : "scores" doit donner un nombre par place';
  return null;
}

function testerArbitre(r, sujet) {
  const places = r.places;
  const regles = globalThis.JEL_MULTI.completer(r);

  // a) Déterminisme : même graine, même départ et mêmes coups.
  for (let g = 1; g <= 5; g++) {
    const e1 = JSON.stringify(r.depart(hasard(g), places, { manche: 1 }));
    const e2 = JSON.stringify(r.depart(hasard(g), places, { manche: 1 }));
    if (e1 !== e2) { probleme(sujet, 'depart() ne donne pas le même état avec la même graine (hasard hors de alea ?)'); break; }
  }

  // b) Manches complètes, un vrai joueur, robots partout ailleurs ; une copie
  //    d'appareil doit suivre exactement l'état du serveur.
  {
    const b = banc(r, { graine: 11 });
    const a = b.arbitre;
    const copieA = replique(r);
    const s0 = a.rejoindre('A');
    if (s0 !== 0 && !(Number.isInteger(s0) && s0 >= 0)) probleme(sujet, `premier joueur : place ${s0} au lieu d'une place de robot`);
    a.demarrer();
    let resultats = 0;
    let identiques = true;
    for (let m = 0; m < MANCHES; m++) {
      if (!jouerManche(b, r, ['A'])) { probleme(sujet, `manche ${a.manche} : ne se termine pas (${ACTIONS_MAX} actions)`); break; }
      for (const msg of b.boite('A').splice(0)) copieA.appliquer(msg);
      if (JSON.stringify(copieA.etat) !== JSON.stringify(a.etat)) { identiques = false; break; }
      const err = resultatBienForme(r.fin(a.etat), places);
      if (err) { probleme(sujet, err); break; }
      resultats++;
      b.avancerHorloge(regles.pauseManche + 50000);
      if (a.prochainReveil() === null) { probleme(sujet, 'fin de manche : aucun réveil prévu pour la manche suivante'); break; }
      a.reveil();
      if (a.phase !== 'jeu') { probleme(sujet, 'la manche suivante ne commence pas après la pause'); break; }
    }
    if (!identiques) probleme(sujet, 'l\'état refait sur l\'appareil (messages seuls) diffère de celui du serveur : jouer() ou depart() utilisent autre chose que leurs arguments et alea');
    if (copieA.ecarts.length) probleme(sujet, `messages manquants : ${copieA.ecarts[0]}`);
    noter(sujet, `${resultats} manches complètes (1 vrai joueur, ${places - 1} robots), états identiques sur le serveur et l'appareil`);
  }

  // c) Remplacement dans les deux sens et départs.
  {
    const b = banc(r, { graine: 23, delaiJoueur: 20000 });
    const a = b.arbitre;
    a.rejoindre('A');
    a.demarrer();
    const sB = a.rejoindre('B');
    const copieB = replique(r);
    for (const m of b.boite('B').splice(0)) copieB.appliquer(m);
    if (regles.remplacement === 'tour') {
      if (!(Number.isInteger(sB) && sB >= 0) || a.sieges[sB] !== 'B') probleme(sujet, 'arrivée d\'un 2e joueur : il ne prend pas la place d\'un robot');
      else if (a.flagsSieges().filter(Boolean).length !== 2) probleme(sujet, 'arrivée d\'un 2e joueur : les places annoncées ne comptent pas 2 vrais joueurs');
    } else {
      if (sB !== -1) probleme(sujet, 'remplacement « manche » : le 2e joueur devrait attendre la manche suivante');
      jouerManche(b, r, ['A']);
      b.avancerHorloge(regles.pauseManche + 1);
      a.reveil();
      if (!a.sieges.includes('B')) probleme(sujet, 'remplacement « manche » : le 2e joueur n\'a pas de place à la manche suivante');
    }
    for (const m of b.boite('B').splice(0)) copieB.appliquer(m);
    if (JSON.stringify(copieB.etat) !== JSON.stringify(a.etat)) probleme(sujet, 'arrivée en cours de partie : l\'état envoyé au nouveau joueur ne correspond pas');
    // A s'en va pendant la manche : un robot reprend, la manche continue jusqu'au bout.
    jouerManche(b, r, ['B']);
    const avant = a.n;
    a.quitter('A');
    if (a.sieges.includes('A')) probleme(sujet, 'départ d\'un joueur : sa place n\'est pas rendue à un robot');
    if (!jouerManche(b, r, ['B'])) probleme(sujet, 'départ d\'un joueur : la manche ne va plus au bout');
    if (a.n <= avant && a.phase === 'jeu') probleme(sujet, 'départ d\'un joueur : la partie s\'est arrêtée');
    a.quitter('B');
    if (!a.estVide()) probleme(sujet, 'départ de tous les joueurs : la partie n\'est pas vide');
    noter(sujet, `remplacement robot → joueur et joueur → robot (${regles.remplacement === 'tour' ? 'tout de suite' : 'à la manche suivante'}), départs sans interruption`);
  }

  // d) Table pleine, puis joueur trop long : son robot joue à sa place.
  {
    const b = banc(r, { graine: 31 });
    const a = b.arbitre;
    const cles = [];
    for (let i = 0; i < places; i++) { cles.push(`J${i}`); a.rejoindre(`J${i}`); if (i === 0) a.demarrer(); }
    if (a.rejoindre('trop') !== null) probleme(sujet, `table pleine (${places} vrais joueurs) : un joueur de plus est accepté`);
    if (regles.remplacement === 'tour' && a.flagsSieges().some((x) => !x)) probleme(sujet, 'table pleine : il reste des robots alors que tous les joueurs sont arrivés');
    if (a.phase === 'jeu') {
      const avant = a.n;
      // Temps laissé au joueur, compté après l'affichage des coups des robots.
      if (a.prochainReveil() === null) probleme(sujet, 'tour d\'un vrai joueur : aucun réveil prévu (temps laissé au joueur)');
      b.avancerHorloge(Math.max(regles.delaiJoueur, (a.prochainReveil() ?? 0) - b.heure()) + 1);
      a.reveil();
      if (a.n === avant && a.phase === 'jeu') probleme(sujet, 'joueur trop long : son robot ne joue pas à sa place');
      else if (!b.tous.some((m) => m.t === 'action' && m.auto)) probleme(sujet, 'joueur trop long : l\'action n\'est pas marquée « auto »');
    }
    noter(sujet, `table pleine à ${places} vrais joueurs ; robot à la place d'un joueur après ${regles.delaiJoueur / 1000} s`);
  }

  // e) Robots : on peut les battre, et ils varient.
  {
    let victoiresFort = 0, total = 0;
    const gagnants = new Set();
    const empreintes = new Set();
    for (let m = 0; m < 40; m++) {
      const b = banc(r, { graine: 100 + m, enchainer: false });
      const a = b.arbitre;
      a.rejoindre('fort');
      a.demarrer();
      empreintes.add(JSON.stringify(b.tous.filter((x) => x.t === 'action').slice(0, 6).map((x) => x.a)));
      if (!jouerManche(b, r, ['fort'], 1, hasard(500 + m))) continue;
      const res = r.fin(a.etat);
      total++;
      if (res?.classement?.[0] === a.sieges.indexOf('fort')) victoiresFort++;
      if (res?.classement) gagnants.add(res.classement[0]);
    }
    if (total && victoiresFort / total < 0.1) probleme(sujet, `robots imbattables : un joueur qui joue au mieux ne gagne que ${victoiresFort} manche(s) sur ${total}`);
    if (empreintes.size < 3) probleme(sujet, 'robots trop prévisibles : les premiers coups sont presque toujours les mêmes');
    noter(sujet, `joueur fort contre ${places - 1} robots : ${victoiresFort} victoire(s) sur ${total} ; ${gagnants.size} gagnant(s) différent(s)`);
  }
}

// --------------------------------------------------------------------------
// 3. Worker (multijoueur/src/) avec de faux Durable Objects
// --------------------------------------------------------------------------

class FausseReponse {
  constructor(corps = null, init = {}) {
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.webSocket = init.webSocket ?? null;
    this.corps = corps;
    this.headers = new Map(Object.entries(init.headers || {}));
  }
  async json() { return JSON.parse(this.corps); }
  async text() { return String(this.corps ?? ''); }
}

class FausseRequete {
  constructor(entree, init = {}) {
    const base = entree instanceof FausseRequete ? entree : null;
    this.url = String(base ? (init.url || base.url) : entree);
    if (entree instanceof FausseRequete === false && init instanceof FausseRequete) {
      this.entetes = new Map(init.entetes);
      this.corps = init.corps;
    } else {
      this.entetes = new Map(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      this.corps = init.body ?? null;
    }
    this.headers = { get: (n) => this.entetes.get(n.toLowerCase()) ?? null };
  }
  async json() { return JSON.parse(this.corps); }
}

class FausseSocket {
  constructor() { this.recus = []; this.fermee = false; this.attache = null; this.autre = null; }
  send(texte) { if (this.fermee) throw new Error('fermée'); this.autre.recus.push(JSON.parse(texte)); }
  close() { this.fermee = true; if (this.autre) this.autre.fermee = true; }
  serializeAttachment(x) { this.attache = JSON.parse(JSON.stringify(x)); }
  deserializeAttachment() { return this.attache; }
}

function fauxEtat() {
  const donnees = new Map();
  const sockets = [];
  return {
    alarme: null,
    sockets,
    storage: {
      get: async (k) => copie(donnees.get(k)),
      put: async (k, v) => { donnees.set(k, copie(v)); },
      deleteAll: async () => { donnees.clear(); },
      setAlarm: async function (t) { this.parent.alarme = t; },
      getAlarm: async function () { return this.parent.alarme; },
      deleteAlarm: async function () { this.parent.alarme = null; },
      taille: () => donnees.size,
    },
    acceptWebSocket(ws, tags) { ws.tags = tags; sockets.push(ws); },
    getWebSockets(tag) { return sockets.filter((ws) => !ws.fermee && (!tag || ws.tags.includes(tag))); },
    setWebSocketAutoResponse() {},
  };
}

async function testerWorker(sujet, jeuxDuWorker) {
  globalThis.Response = FausseReponse;
  globalThis.Request = FausseRequete;
  globalThis.WebSocketPair = function () { const c = new FausseSocket(), s = new FausseSocket(); c.autre = s; s.autre = c; this[0] = c; this[1] = s; };

  const { JEUX } = await import(pathToFileURL(path.join(RACINE, 'multijoueur', 'src', 'jeux.js')).href);
  for (const [id, fiche] of Object.entries(jeuxDuWorker)) JEUX[id] = fiche;
  const worker = (await import(pathToFileURL(path.join(RACINE, 'multijoueur', 'src', 'index.js')).href)).default;
  const { Partie } = await import(pathToFileURL(path.join(RACINE, 'multijoueur', 'src', 'partie.js')).href);
  const { Accueil } = await import(pathToFileURL(path.join(RACINE, 'multijoueur', 'src', 'accueil.js')).href);

  const objets = { PARTIE: new Map(), ACCUEIL: new Map() };
  const etats = new Map();
  const env = { MAX_JOUEURS: '5' };
  for (const [nom, Classe] of [['PARTIE', Partie], ['ACCUEIL', Accueil]]) {
    env[nom] = {
      idFromName: (n) => n,
      get: (n) => ({
        fetch: async (entree, init) => {
          if (!objets[nom].has(n)) { const e = fauxEtat(); e.storage.parent = e; etats.set(`${nom}:${n}`, e); objets[nom].set(n, new Classe(e, env)); }
          const req = entree instanceof FausseRequete ? entree : new FausseRequete(entree, init);
          return objets[nom].get(n).fetch(req);
        },
      }),
    };
  }
  const [id, fiche] = Object.entries(jeuxDuWorker)[0];
  const origine = 'https://freemicrogames.com';
  const connexion = (entetes = {}, params = {}) => worker.fetch(new FausseRequete(
    `https://multi.freemicrogames.com/ws?jeu=${params.jeu ?? id}&regles=${params.regles ?? fiche.empreinte}&proto=${params.proto ?? PROTOCOLE}`,
    { headers: { Upgrade: 'websocket', Origin: origine, ...entetes } },
  ), env);

  const etatRep = await worker.fetch(new FausseRequete('https://multi.freemicrogames.com/etat'), env);
  if (etatRep.status !== 200 || !(await etatRep.json()).version) probleme(sujet, 'Worker : /etat ne répond pas');
  if ((await connexion({ Origin: 'https://autre-site.example' })).status !== 403) probleme(sujet, 'Worker : une connexion d\'un autre site est acceptée');
  if ((await connexion({}, { regles: '0'.repeat(64) })).status !== 409) probleme(sujet, 'Worker : des règles différentes sont acceptées');
  if ((await connexion({}, { proto: 999 })).status !== 409) probleme(sujet, 'Worker : un autre protocole est accepté');
  if ((await connexion({}, { jeu: 'jeu-inconnu' })).status !== 404) probleme(sujet, 'Worker : un jeu inconnu est accepté');

  // Joueurs : les premiers se retrouvent dans la même partie, la suivante s'ouvre quand elle est pleine.
  const places = fiche.regles.places;
  const clients = [];
  for (let i = 0; i < 5; i++) {
    const r = await connexion();
    if (r.status !== 101) { probleme(sujet, `Worker : joueur ${i + 1} refusé (${r.status})`); break; }
    clients.push(r.webSocket);
  }
  const parties = [...objets.PARTIE.keys()];
  if (parties.length !== Math.ceil(5 / places)) probleme(sujet, `Worker : 5 joueurs pour des parties de ${places} places devraient ouvrir ${Math.ceil(5 / places)} partie(s) (${parties.length})`);
  const premier = clients[0];
  if (!premier?.recus.some((m) => m.t === 'bienvenue')) probleme(sujet, 'Worker : pas de message de bienvenue');
  if (!premier?.recus.some((m) => m.t === 'manche')) probleme(sujet, 'Worker : la partie ne commence pas tout de suite (robots aux places vides)');

  // Limite globale : MAX_JOUEURS = 5.
  if (clients.length === 5 && (await connexion()).status !== 503) probleme(sujet, 'Worker : la limite MAX_JOUEURS n\'est pas respectée');

  // Un coup d'un vrai joueur parvient à tous ceux de sa partie.
  const nomPartie = parties[0];
  const partie = objets.PARTIE.get(nomPartie);
  const a = partie.arbitre;
  if (a && a.phase === 'jeu') {
    const s = fiche.regles.aQui(a.etat);
    const cle = a.sieges[s];
    const ws = etats.get(`PARTIE:${nomPartie}`).sockets.find((x) => x.tags.includes(cle));
    if (ws) {
      const action = fiche.regles.bot(copie(a.etat), s, hasard(3), 0.5);
      const avant = a.n;
      await partie.webSocketMessage(ws, JSON.stringify({ t: 'action', n: a.n, a: action }));
      if (partie.arbitre.n <= avant) probleme(sujet, 'Worker : le coup d\'un joueur n\'est pas joué');
      const autre = clients.find((c) => c !== ws.autre && etats.get(`PARTIE:${nomPartie}`).sockets.some((x) => x.autre === c));
      if (autre && !autre.recus.some((m) => m.t === 'action' && m.n === avant + 1)) probleme(sujet, 'Worker : les autres joueurs ne reçoivent pas le coup');
    }
  }

  // Joueur trop long (alarme) puis départ de tous : partie libérée, accueil à jour.
  const etatPartie = etats.get(`PARTIE:${nomPartie}`);
  if (partie.arbitre?.echeance) {
    partie.arbitre.echeance.quand = Date.now() - 1;
    const avant = partie.arbitre.n;
    await partie.alarm();
    if (partie.arbitre && partie.arbitre.n === avant && partie.arbitre.phase === 'jeu') probleme(sujet, 'Worker : à l\'alarme, le robot ne joue pas à la place du joueur trop long');
  }
  for (const ws of [...etatPartie.sockets]) { ws.fermee = true; await partie.webSocketClose(ws, 1001); }
  if (etatPartie.storage.taille() !== 0 || etatPartie.alarme !== null) probleme(sujet, 'Worker : partie sans joueur pas libérée (stockage ou alarme restants)');
  const accueil = objets.ACCUEIL.get('accueil');
  if (accueil?.parties?.[nomPartie]) probleme(sujet, 'Worker : l\'accueil garde une partie vide');
  noter(sujet, 'Worker : sites permis, règles et protocole contrôlés, répartition entre parties, limite globale, coups transmis, alarme, partie libérée');
}

// --------------------------------------------------------------------------
// 4. Dans le lanceur (--navigateur) : faux serveur qui arbitre avec les règles du jeu
// --------------------------------------------------------------------------

async function testerNavigateur(jeux) {
  let playwright;
  try { playwright = await import('playwright'); }
  catch { console.error('Le mode --navigateur nécessite Playwright : npm install --no-save playwright'); process.exit(2); }
  const build = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'build-catalog.mjs')], { encoding: 'utf8' });
  if (build.status !== 0) { console.error(build.stdout, build.stderr); process.exit(2); }
  const serveur = spawn(process.execPath, [path.join(RACINE, 'scripts', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT_TEST) }, stdio: 'ignore' });
  const base = `http://localhost:${PORT_TEST}`;
  const navigateur = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await attendre(100); }
    for (const { id, regles: r } of jeux) {
      const sujet = id;
      const dossier = path.join(RACINE, 'captures', 'multijoueur', id);
      await rm(dossier, { recursive: true, force: true });
      await mkdir(dossier, { recursive: true });
      const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'fr-FR' });
      const page = await contexte.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(`erreur JavaScript : ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') erreurs.push(`erreur console : ${m.text().slice(0, 160)}`); });

      // Faux serveur : un arbitre en mémoire, la page est le joueur « page ».
      let route = null;
      const faux = new Set();          // faux joueurs ajoutés par le test
      const arbitre = new Arbitre(r, {
        delaiJoueur: 4000,
        envoyer: (cle, m) => {
          if ((cle === null || cle === 'page') && route) { try { route.send(JSON.stringify(m)); } catch { /* fermée */ } }
        },
      });
      // Les faux joueurs jouent leur tour avec le robot des règles.
      const fauxJouent = setInterval(() => {
        if (arbitre.phase !== 'jeu') return;
        const s = r.aQui(arbitre.etat);
        const cle = arbitre.sieges[s];
        if (faux.has(cle)) arbitre.recevoir(cle, { t: 'action', n: arbitre.n, a: r.bot(copie(arbitre.etat), s, Math.random, 0.5) });
      }, 500);
      const reveils = setInterval(() => { if ((arbitre.prochainReveil() ?? Infinity) <= Date.now()) arbitre.reveil(); }, 200);
      await page.routeWebSocket(/\/multi\/ws\?/, (ws) => {
        route = ws;
        ws.onMessage((texte) => {
          if (texte === 'ping') { ws.send('pong'); return; }
          try { arbitre.recevoir('page', JSON.parse(texte)); } catch { /* illisible */ }
        });
        ws.onClose(() => { arbitre.quitter('page'); route = null; });
        arbitre.rejoindre('page');
        arbitre.demarrer();
      });

      const etatJeu = (cadre) => cadre.evaluate(() => {
        const p = window.JEL_MULTI?.derniere;
        return p ? { mode: p.mode, n: p.n, sieges: p.sieges(), phase: p.phase, siege: p.siege } : null;
      }).catch(() => null);
      const capturer = (nom) => page.screenshot({ path: path.join(dossier, nom) });
      // Les messages passent par la file d'affichage du jeu (coups espacés de delaiBot) :
      // on attend qu'elle soit vide avant de regarder (15 s au plus).
      const attendreFile = async (cadre) => {
        for (let k = 0; k < 75; k++) {
          await attendre(200);
          const vide = await cadre.evaluate(() => (window.JEL_MULTI?.derniere?.file?.length ?? 0) === 0).catch(() => true);
          if (vide) return;
        }
      };

      try {
        await page.goto(`${base}/play.html?id=${id}&multi=ws://localhost:${PORT_TEST}/multi`);
        await attendre(2500);
        const cadre = page.frames().find((f) => f.url() === 'about:srcdoc');
        if (!cadre) throw new Error('le jeu ne se charge pas dans le lanceur');
        const bouton = cadre.locator('[data-multi="jouer"]').first();
        if (!(await bouton.count())) throw new Error('aucun bouton data-multi="jouer" (partie en ligne) sur l\'écran titre');
        await bouton.tap().catch(() => bouton.click());
        await attendre(3000);
        let e = await etatJeu(cadre);
        if (e?.mode !== 'en-ligne') probleme(sujet, `navigateur : la partie ne passe pas en ligne avec le serveur (mode : ${e?.mode ?? 'aucune partie JEL_MULTI'})`);
        await capturer('1-en-ligne.png');

        // La table se remplit de vrais joueurs (nombre maximum de joueurs), puis ils repartent.
        for (let k = 2; k <= r.places; k++) { faux.add(`faux-${k}`); arbitre.rejoindre(`faux-${k}`); }
        await attendre(1000);
        await attendreFile(cadre);
        e = await etatJeu(cadre);
        const humains = e?.sieges?.filter((x) => x.humain).length ?? 0;
        if (globalThis.JEL_MULTI.completer(r).remplacement === 'tour' && humains !== r.places) probleme(sujet, `navigateur : ${r.places} vrais joueurs à la table, le jeu en montre ${humains}`);
        await capturer('2-table-pleine.png');
        const nAvant = e?.n ?? 0;
        await attendre(6000);
        e = await etatJeu(cadre);
        if ((e?.n ?? 0) <= nAvant && e?.phase === 'jeu') probleme(sujet, 'navigateur : la partie n\'avance pas avec tous les joueurs (coups des autres non affichés ?)');
        await capturer('3-partie.png');
        for (const cle of faux) arbitre.quitter(cle);
        faux.clear();
        await attendre(500);
        await attendreFile(cadre);
        e = await etatJeu(cadre);
        if (e?.sieges?.filter((x) => x.humain).length !== 1) probleme(sujet, 'navigateur : après le départ des autres joueurs, le jeu ne montre pas leurs places reprises par des robots');

        // Réseau coupé : le jeu continue contre des robots sur l'appareil.
        const nCoupe = e?.n ?? 0;
        await route?.close();
        await attendre(1500);
        e = await etatJeu(cadre);
        if (e?.mode !== 'solo') probleme(sujet, `navigateur : connexion coupée, le jeu ne passe pas en solo (mode : ${e?.mode})`);
        // Le joueur de l'appareil laisse passer son tour : en solo, rien ne joue à sa place, on vérifie
        // donc seulement que la partie a gardé son état et qu'elle répond.
        if (!e || e.n < nCoupe) probleme(sujet, 'navigateur : la partie repart de zéro après la coupure');
        await capturer('4-apres-coupure.png');
      } catch (err) {
        probleme(sujet, `navigateur : ${err.message.split('\n')[0]}`);
      } finally {
        clearInterval(fauxJouent);
        clearInterval(reveils);
      }
      for (const m of [...new Set(erreurs)].slice(0, 5)) probleme(sujet, `navigateur : ${m}`);
      noter(sujet, `navigateur : captures dans captures/multijoueur/${id}/`);
      await contexte.close();
    }
  } finally {
    await navigateur.close();
    serveur.kill();
  }
}

// --------------------------------------------------------------------------
// Programme principal
// --------------------------------------------------------------------------

async function main() {
  // Moteur et Worker, avec le jeu d'essai.
  const essai = lireRegles(REGLES_ESSAI, 'moteur');
  if (essai) testerArbitre(essai, 'moteur');

  // Fichier des règles du Worker à jour (ignoré par git), comme au déploiement.
  const tous = await jeuxMultijoueurs();
  const { texte } = await contenuWorker(tous);
  await writeFile(path.join(RACINE, 'multijoueur', 'src', 'jeux.js'), texte, 'utf8');
  if (essai) await testerWorker('worker', { 'jeu-d-essai': { empreinte: 'e'.repeat(64), regles: essai } });

  const jeux = [];
  if (!moteurSeul) {
    const choisis = idsDemandes.length ? tous.filter((j) => idsDemandes.includes(j.id)) : tous;
    // Un jeu qui n'est pas multijoueur est ignoré (validate-games.mjs contrôle "multijoueur" et "places").
    for (const id of idsDemandes) if (!tous.some((j) => j.id === id)) noter(id, 'pas un jeu multijoueur ("multijoueur": true absent de game.json) : ignoré');
    for (const j of choisis) {
      if (!j.texte) { probleme(j.id, j.erreur ? `bloc jel-regles : ${j.erreur}` : 'bloc <script id="jel-regles"> absent (règles du jeu multijoueur)'); continue; }
      const r = lireRegles(j.texte, j.id);
      if (!r) continue;
      if (j.fiche.places !== r.places) probleme(j.id, `"places" : ${j.fiche.places} dans game.json, ${r.places} dans les règles (une seule valeur, de 2 à 10)`);
      testerArbitre(r, j.id);
      jeux.push({ id: j.id, regles: r });
    }
    if (avecNavigateur && jeux.length) await testerNavigateur(jeux.filter((j) => !problemes.has(j.id)));
  }

  const sujets = [...new Set([...notes.keys(), ...problemes.keys()])];
  for (const s of sujets) {
    const p = problemes.get(s) || [];
    console.log(`\n${p.length ? '✗' : '✓'} ${s}`);
    for (const m of p) console.log(`    PROBLÈME : ${m}`);
    for (const m of notes.get(s) || []) console.log(`    ${m}`);
  }
  const n = [...problemes.values()].reduce((x, l) => x + l.length, 0);
  console.log(n ? `\nMultijoueur : ${n} problème(s).\n` : '\nMultijoueur : tout est bon.\n');
  process.exit(n ? 1 : 0);
}

main().catch((e) => { console.error('Panne du contrôle multijoueur :', e); process.exit(2); });
