#!/usr/bin/env node
// ==========================================================================
// tester-temps-reel.mjs — robot de contrôle des jeux en temps réel
// (docs/cadrage-temps-reel.md, section 10)
//
//   node scripts/tester-temps-reel.mjs [<id>…]               simulation + Worker (faux Durable Objects)
//   node scripts/tester-temps-reel.mjs [<id>…] --wrangler     + deux clients contre « wrangler dev »
//                                                             (latence 0, 150, 400 ms, pertes, déconnexions)
//   node scripts/tester-temps-reel.mjs [<id>…] --navigateur   + jeu dans le lanceur (Playwright) :
//                                                             joueur seul, hors ligne, pair-à-pair, relais forcé
//   --tout : les deux. --ticks <n> : ticks des parties « wrangler » (2000 par défaut).
//
// 1. Simulation : mots interdits dans jel-sim, état entièrement entier à chaque
//    tick, journal d'ordres rejoué deux fois = mêmes hachages (et depuis un
//    instantané), robots des 3 niveaux (le difficile bat le facile, variété,
//    équité des deux camps).
// 2. Worker avec de faux Durable Objects : recherche et compteur, appariement,
//    pair-à-pair, relais (le Duel cadence, simule et compare les hachages),
//    refus au-delà du budget, absence → robot, reprise par instantané, secours.
// 3. --wrangler : vrai Worker local (npx wrangler dev, rien n'est déployé) :
//    test 4 (2 clients, 2 000 ticks, 3 latences, pertes simulées : sans écart)
//    et test 5 (déconnexion de plus de 10 s : robot, puis retour et reprise de
//    la main). Mesures des parties (durée, messages) dans captures/temps-reel/.
// 4. --navigateur : tests 2 et 3 (partie contre le robot en moins de 16 s, sans
//    aucune requête pendant la partie ; pair-à-pair réussi ; pair-à-pair forcé
//    en échec et bascule sur le relais) ; test 6 : coupures réseau (réseau muet
//    quelques secondes, comme un écran en veille ou un passage du wifi à la 4G) :
//    bandeau chez soi et chez l'adversaire, reconnexion dès le retour du réseau,
//    robot en attendant après une longue coupure puis retour dans la vraie partie,
//    en relais et en pair-à-pair (coupure de chacun des deux pairs).
// Sans réseau Internet pour 1 et 2 ; 3 et 4 ne touchent que la machine locale
// (le premier lancement de wrangler le télécharge).
// ==========================================================================

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const TOUT = args.includes('--tout');
const SEULEMENT_COUPURES = args.includes('--coupures');   // mise au point : seulement le test 6 du navigateur
const AVEC_WRANGLER = TOUT || args.includes('--wrangler');
const AVEC_NAVIGATEUR = TOUT || args.includes('--navigateur') || SEULEMENT_COUPURES;
const iTicks = args.indexOf('--ticks');
const TICKS_WRANGLER = iTicks >= 0 ? Number(args[iTicks + 1]) : 2000;
const iEssai = args.indexOf('--essai');
const ESSAI = iEssai >= 0 ? args[iEssai + 1] : null;   // simulation seule (mise au point) : id « essai-tr »
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--ticks' && args[i - 1] !== '--essai');
const WRANGLER = 'wrangler@4.155.0';

globalThis.window = globalThis;
await import(pathToFileURL(path.join(RACINE, 'public', 'temps-reel', 'moteur.js')).href);
const TR = globalThis.JEL_TR;
const { texteSim } = await import(pathToFileURL(path.join(RACINE, 'public', 'temps-reel', 'lanceur.js')).href);

let problemes = 0;
const lignes = [];
function probleme(sujet, texte) { problemes++; console.log(`  ✗  ${sujet} : ${texte}`); }
function ok(texte) { lignes.push(texte); console.log(`  ✓  ${texte}`); }
const copie = (x) => JSON.parse(JSON.stringify(x));
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------------------------
// Jeux temps réel du dépôt
// --------------------------------------------------------------------------

async function jeuxTempsReel() {
  if (ESSAI) return [{ id: 'essai-tr', fiche: {}, html: '', texte: (await readFile(ESSAI, 'utf8')).split('\r\n').join('\n').trim() }];
  const dossiers = ids.length ? ids : (await readdir(path.join(RACINE, 'games'), { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')).map((e) => e.name).sort();
  const jeux = [];
  for (const id of dossiers) {
    const fiche = path.join(RACINE, 'games', id, 'game.json');
    if (!existsSync(fiche)) continue;
    const f = JSON.parse((await readFile(fiche, 'utf8')).replace(/^﻿/, ''));
    if (f.temps_reel !== true) continue;
    const html = await readFile(path.join(RACINE, 'games', id, 'index.html'), 'utf8');
    jeux.push({ id, fiche: f, html, texte: texteSim(html) });
  }
  return jeux;
}

// Simulation d'un jeu, chargée comme dans le Worker (globaux réseau et page masqués).
const MASQUES = ['self', 'globalThis', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'caches', 'navigator', 'location', 'document', 'localStorage', 'indexedDB'];
function chargerSim(texte) {
  // eslint-disable-next-line no-new-func
  const f = new Function('window', ...MASQUES, `"use strict";\n${texte}\nreturn window.JEL_SIM;`);
  return f({ JEL_TR: TR });
}

// --------------------------------------------------------------------------
// 1. Simulation
// --------------------------------------------------------------------------

const INTERDITS = [
  [/\bMath\.random\b/, 'Math.random'], [/\bDate\b/, 'Date'], [/\bperformance\b/, 'performance'],
  [/\bset(?:Timeout|Interval)\b/, 'minuterie'], [/\brequestAnimationFrame\b/, 'requestAnimationFrame'],
  [/\bMath\.(?:sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|sqrt|cbrt|sinh|cosh|tanh|fround)\b/, 'fonction mathématique non garantie (Math.sin, sqrt, pow…)'],
  [/\b(?:document|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|RTCPeerConnection|parent|top)\b/, 'accès à la page ou au réseau'],
  [/\beval\b|\bnew\s+Function\b/, 'eval'], [/\bfor\s*\([^)]*\bin\b/, 'boucle for…in (ordre non garanti)'],
  [/\bJEL_SAVE\b|\bFMG\b/, 'module du site'],
];

// Ordres « humains » plausibles : ceux d'un robot moyen, tirés d'un hasard à part (jamais celui de l'état).
// paisible : seulement vers des planètes neutres ou à soi (la partie ne finit pas par une conquête :
// le test 4 dure ainsi ses 2 000 ticks).
function ordresHumains(sim, etat, camp, hasard, paisible = false) {
  const e = copie(etat);
  const alea = (n) => (n > 1 ? Math.floor(hasard() * n) : 0);
  let o = [];
  try { o = (sim.bot(e, camp, 2, alea) || []).slice(0, 2); } catch { o = []; }
  if (paisible && Array.isArray(etat.pl)) {
    o = o.filter((x) => x[0] !== 1 || (etat.pl[x[2]] && etat.pl[x[2]].c !== 1 - camp));
    const miennes = etat.pl.map((p, i) => (p.c === camp ? i : -1)).filter((i) => i >= 0);
    if (miennes.length >= 2 && alea(2) === 0) o.push([1, miennes[alea(miennes.length)], miennes[alea(miennes.length)], 25]);
  }
  return o;
}

function hasardGraine(g) { return TR.aleaDe({ a: g >>> 0 }); }

function testerSimulation(jeu) {
  const sujet = jeu.id;
  if (!jeu.texte) { probleme(sujet, 'bloc <script id="jel-sim"> absent'); return null; }
  for (const [re, nom] of INTERDITS) if (re.test(jeu.texte.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''))) probleme(sujet, `simulation : ${nom} interdit dans jel-sim`);
  let sim;
  try { sim = chargerSim(jeu.texte); } catch (e) { probleme(sujet, `simulation illisible : ${e.message}`); return null; }
  const p = TR.problemesSim(sim);
  if (p.length) { for (const x of p) probleme(sujet, x); return null; }

  // Parties robot contre « humain » scripté, avec des ordres réels dans le journal, jusqu'à 6 000 ticks en tout.
  let total = 0;
  for (const [graine, niveau] of [[0xC0FFEE, 3], [12345, 2], [777, 3], [4242, 1], [9001, 3], [31337, 2], [2718, 3], [1618, 2]]) {
    if (total >= 6000) break;
    const fait = partieJournal(sim, sujet, graine, { ligne: 1, ctl: [0, niveau] });
    if (!fait) return null;
    total += fait;
  }
  ok(`${sujet} : déterminisme vérifié sur ${total} ticks (journaux d'ordres rejoués deux fois et depuis un instantané)`);
  return robots(sim, sujet);
}

// Une partie dont le journal est rejoué deux fois et depuis un instantané. Renvoie son nombre de ticks.
function partieJournal(sim, sujet, graine, config) {
  const s = new TR.Simulation(sim, graine, config);
  const cad = new TR.Cadenceur({ camps: sim.camps, delai: s.r.delaiEntree, depart: 0, envoyer: () => {} });
  const alea = Math.random;
  let seq = 0, flottant = null;
  const journal = [];
  for (let k = 0; k < 6000 && !s.resultat; k++) {
    if (k % 7 === 0) for (const o of ordresHumains(sim, s.etat, 0, alea)) cad.recevoir(0, ++seq, o);
    if (k === 1500) cad.controle(1, 3);              // le camp 1 change de robot en cours de partie
    if (k % 13 === 0) cad.recevoir(0, ++seq, [9, 9999, 0, 0]); // ordre invalide : ignoré
    const paquet = cad.pas();
    journal.push([paquet.k, paquet.o]);
    s.avancer(paquet.o);
    if (!flottant) flottant = TR.premierFlottant(s.etat);
  }
  if (flottant) probleme(sujet, `état non entier : ${flottant}`);
  const ordres = journal.reduce((n, x) => n + x[1].length, 0);
  const a = TR.rejouer(sim, graine, config, journal), b = TR.rejouer(sim, graine, config, journal);
  const ha = TR.hacher(a.etat), hb = TR.hacher(b.etat), hs = TR.hacher(s.etat);
  if (ha !== hb || ha !== hs) probleme(sujet, `déterminisme : rejeu différent (${hs} / ${ha} / ${hb})`);
  else ok(`${sujet} : ${journal.length} ticks, ${ordres} ordres, rejoué deux fois → hachage final identique ${ha}`);
  const controles = a.hashes.every(([k, h]) => b.hashDe(k) === h);
  if (!controles) probleme(sujet, 'déterminisme : hachages des ticks de contrôle différents');
  // Depuis un instantané (reprise) : même état à la fin.
  const milieu = Math.floor(journal.length / 2);
  const c = TR.rejouer(sim, graine, config, journal.slice(0, milieu));
  const snap = c.instantane();
  const d = new TR.Simulation(sim, 1, config);
  d.restaurer(JSON.parse(JSON.stringify(snap)));
  for (const [, o] of journal.slice(milieu)) d.avancer(o);
  if (TR.hacher(d.etat) !== ha) probleme(sujet, 'reprise : rejouer depuis un instantané ne donne pas le même état');
  else ok(`${sujet} : reprise depuis l'instantané du tick ${snap.k} → même état final`);
  return journal.length;
}

// Robots : forces, variété, équité.
function robots(sim, sujet) {
  const duel = (n1, n2, parties) => {
    let gagne = 0, duree = 0;
    for (let g = 1; g <= parties; g++) for (const sens of [0, 1]) {
      const sm = new TR.Simulation(sim, (g * 2654435761) >>> 0, { ligne: 1, ctl: sens ? [n2, n1] : [n1, n2] });
      while (!sm.resultat) sm.avancer([]);
      if (sm.resultat.gagnant === (sens ? 1 : 0)) gagne++;
      duree += sm.k();
    }
    return { taux: gagne / (2 * parties), duree: duree / (2 * parties) / 10 };
  };
  const d31 = duel(3, 1, 40), d21 = duel(2, 1, 40), d32 = duel(3, 2, 40);
  if (d31.taux < 0.8) probleme(sujet, `robots : le difficile ne bat le facile que ${Math.round(d31.taux * 100)} % du temps (80 % attendus)`);
  if (d21.taux < 0.65) probleme(sujet, `robots : le moyen ne bat le facile que ${Math.round(d21.taux * 100)} % du temps (65 % attendus)`);
  if (d32.taux < 0.5) probleme(sujet, `robots : le difficile perd plus souvent qu'il ne gagne contre le moyen (${Math.round(d32.taux * 100)} %)`);
  ok(`${sujet} : robots — difficile contre facile ${Math.round(d31.taux * 100)} %, moyen contre facile ${Math.round(d21.taux * 100)} %, difficile contre moyen ${Math.round(d32.taux * 100)} % (parties de ${Math.round(d31.duree)} à ${Math.round(d32.duree)} s)`);
  let c0 = 0;
  const N = 100;
  for (let g = 1; g <= N; g++) { const sm = new TR.Simulation(sim, g * 7 + 1, { ligne: 1, ctl: [2, 2] }); while (!sm.resultat) sm.avancer([]); if (sm.resultat.gagnant === 0) c0++; }
  if (c0 < N * 0.35 || c0 > N * 0.65) probleme(sujet, `équité : le camp 0 gagne ${c0} parties sur ${N} entre robots égaux`);
  else ok(`${sujet} : équité des camps — le camp 0 gagne ${c0} parties sur ${N} entre deux robots moyens`);
  const empreintes = new Set();
  for (let g = 1; g <= 6; g++) {
    const sm = new TR.Simulation(sim, g * 104729, { ligne: 1, ctl: [3, 3] });
    for (let k = 0; k < 600 && !sm.resultat; k++) sm.avancer([]);
    empreintes.add(TR.hacher(sm.etat.f.map((f) => [f.c, f.a])) + sm.etat.pl.length);
  }
  if (empreintes.size < 5) probleme(sujet, 'robots : les parties se ressemblent trop (cartes ou coups identiques)');
  else ok(`${sujet} : variété — ${empreintes.size} débuts de partie différents sur 6 graines`);
  return sim;
}

// --------------------------------------------------------------------------
// Client simulé (Node) : la partie d'un appareil en mode relayé, sans navigateur.
// Il joue les paquets dans l'ordre, demande l'état s'il en manque, envoie ses
// ordres (ceux d'un robot moyen) et un hachage tous les 50 ticks.
// --------------------------------------------------------------------------

class ClientSimule {
  constructor({ sim, envoyer, nom, paisible = false }) {
    this.sim = sim; this.envoyer = envoyer; this.nom = nom; this.paisible = paisible;
    this.s = null; this.camp = 0; this.seq = 0; this.file = []; this.hashes = new Map();
    this.modes = []; this.refus = null; this.fin = null; this.snaps = 0; this.attendSnap = false;
    this.ordres = 0; this.hasard = Math.random; this.ctl = []; this.reseau = [];
  }
  trouve(m) { this.camp = m.camp; this.graine = m.graine; this.config = m.config; this.s = new TR.Simulation(this.sim, m.graine, { ...m.config, ctl: [0, 0] }); }
  recevoir(m) {
    if (m.t === 'mode') this.modes.push(m.mode);
    else if (m.t === 'reseau') this.reseau.push(m);
    else if (m.t === 'refus') this.refus = m.raison;
    else if (m.t === 'fin') this.fin = m.resultat || 'duree';
    else if (m.t === 'snap') { this.snaps++; this.s.restaurer(m.snap); this.attendSnap = false; this.file = this.file.filter((p) => p.k > m.snap.k); this.jouer(); }
    else if (m.t === 'k') { this.file.push(m); this.jouer(); }
  }
  jouer() {
    if (!this.s) return;
    this.file.sort((a, b) => a.k - b.k);
    while (this.file.length && this.file[0].k <= this.s.k()) this.file.shift();
    while (this.file.length && this.file[0].k === this.s.k() + 1) {
      const p = this.file.shift();
      const h = this.s.avancer(p.o);
      this.ctl = this.s.etat.ctl.slice();
      if (h) { this.hashes.set(p.k, h); this.envoyer({ t: 'h', k: p.k, h }); }
      if (p.k % 9 === this.camp * 4 && !this.s.resultat && this.s.etat.ctl[this.camp] === 0) {
        for (const o of ordresHumains(this.sim, this.s.etat, this.camp, this.hasard, this.paisible)) { this.ordres++; this.envoyer({ t: 'o', seq: ++this.seq, o }); }
      }
    }
    if (this.file.length && !this.attendSnap) { this.attendSnap = true; this.envoyer({ t: 'reprise', depuis: this.s.k() }); }
  }
  k() { return this.s ? this.s.k() : 0; }
}

// Écarts de hachage entre deux clients (aux ticks calculés par les deux).
function ecarts(a, b) {
  let communs = 0, diff = 0;
  for (const [k, h] of a.hashes) if (b.hashes.has(k)) { communs++; if (b.hashes.get(k) !== h) diff++; }
  return { communs, diff };
}

// --------------------------------------------------------------------------
// 2. Worker avec de faux Durable Objects
// --------------------------------------------------------------------------

class FausseReponse {
  constructor(corps = null, init = {}) {
    this.status = init.status ?? 200; this.ok = this.status >= 200 && this.status < 300;
    this.webSocket = init.webSocket ?? null; this.corps = corps;
  }
  async json() { return JSON.parse(this.corps); }
  async text() { return String(this.corps ?? ''); }
}
class FausseRequete {
  constructor(entree, init = {}) {
    if (entree instanceof FausseRequete) { this.url = String(entree.url); this.entetes = new Map(entree.entetes); this.corps = entree.corps; }
    else { this.url = String(entree); this.entetes = new Map(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v])); this.corps = init.body ?? null; }
    if (init instanceof FausseRequete) { this.entetes = new Map(init.entetes); this.corps = init.corps; }
    this.headers = { get: (n) => this.entetes.get(n.toLowerCase()) ?? null };
  }
  async json() { return JSON.parse(this.corps); }
}
// Une connexion : côté serveur (Durable Object) et côté client (test).
class FausseSocket {
  constructor() { this.fermee = false; this.attache = null; this.autre = null; this.tags = []; this.ecoute = null; this.objet = null; this.enAttente = []; }
  // Côté client : les messages arrivés avant que le test écoute sont gardés.
  get surMessage() { return this.ecoute; }
  set surMessage(f) { this.ecoute = f; const l = this.enAttente.splice(0); for (const t of l) f(t); }
  send(texte) {
    if (this.fermee) throw new Error('fermée');
    const autre = this.autre;
    if (autre.objet) queueMicrotask(() => { if (!autre.fermee) autre.objet.webSocketMessage(autre, texte); });
    else queueMicrotask(() => { if (autre.ecoute) autre.ecoute(texte); else autre.enAttente.push(texte); });
  }
  close() {
    if (this.fermee) return;
    this.fermee = true;
    const autre = this.autre;
    if (autre && !autre.fermee) { autre.fermee = true; if (autre.objet) queueMicrotask(() => autre.objet.webSocketClose?.(autre, 1000)); }
  }
  serializeAttachment(x) { this.attache = JSON.parse(JSON.stringify(x)); }
  deserializeAttachment() { return this.attache; }
}

function fauxEtat() {
  const donnees = new Map(), sockets = [];
  const e = {
    alarme: null, sockets,
    storage: {
      get: async (k) => copie(donnees.get(k) ?? null) ?? undefined,
      put: async (k, v) => { donnees.set(k, copie(v)); },
      deleteAll: async () => { donnees.clear(); },
      setAlarm: async (t) => { e.alarme = t; },
      getAlarm: async () => e.alarme,
      deleteAlarm: async () => { e.alarme = null; },
    },
    acceptWebSocket(ws, tags) { ws.tags = tags; sockets.push(ws); },
    getWebSockets(tag) { return sockets.filter((ws) => !ws.fermee && (!tag || ws.tags.includes(tag))); },
    setWebSocketAutoResponse() {},
  };
  return e;
}

async function monterWorker(jeuxTR, envPlus = {}) {
  globalThis.Response = FausseReponse;
  globalThis.Request = FausseRequete;
  globalThis.WebSocketPair = function () { const c = new FausseSocket(), s = new FausseSocket(); c.autre = s; s.autre = c; this[0] = c; this[1] = s; };
  const jeux = await import(pathToFileURL(path.join(RACINE, 'multijoueur', 'src', 'jeux.js')).href);
  for (const [id, fiche] of Object.entries(jeuxTR)) jeux.JEUX_TR[id] = fiche;
  const worker = (await import(pathToFileURL(path.join(RACINE, 'multijoueur', 'src', 'index.js')).href)).default;
  const { Rencontre } = await import(pathToFileURL(path.join(RACINE, 'multijoueur', 'src', 'temps-reel', 'rencontre.js')).href);
  const { Duel } = await import(pathToFileURL(path.join(RACINE, 'multijoueur', 'src', 'temps-reel', 'duel.js')).href);
  const { Budget } = await import(pathToFileURL(path.join(RACINE, 'multijoueur', 'src', 'temps-reel', 'budget.js')).href);
  const objets = {};
  const env = { ...envPlus };
  for (const [nom, Classe] of [['RENCONTRE', Rencontre], ['DUEL', Duel], ['BUDGET', Budget]]) {
    objets[nom] = new Map();
    env[nom] = {
      idFromName: (n) => n,
      get: (n) => ({
        fetch: async (entree, init) => {
          if (!objets[nom].has(n)) { const etat = fauxEtat(); const o = new Classe(etat, env); o.etatFaux = etat; objets[nom].set(n, o); }
          const o = objets[nom].get(n);
          const req = entree instanceof FausseRequete ? entree : new FausseRequete(entree, init);
          const rep = await o.fetch(req);
          if (rep.webSocket) {
            // Côté serveur de la paire : relié à l'objet (ses messages arrivent dans webSocketMessage).
            for (const ws of o.etatFaux.sockets) if (!ws.objet) ws.objet = o;
          }
          return rep;
        },
      }),
    };
  }
  const origine = 'https://freemicrogames.com';
  // Ouvre une connexion /tr/… et renvoie la socket du client (null si refusée, avec le statut).
  const ouvrir = async (chemin, entetes = {}) => {
    const rep = await worker.fetch(new FausseRequete(`https://multi.freemicrogames.com${chemin}`, { headers: { Upgrade: 'websocket', Origin: origine, ...entetes } }), env);
    return { statut: rep.status, ws: rep.webSocket };
  };
  return { worker, env, objets, ouvrir };
}

// Un appareil de test : recherche puis duel, en relais (aucun WebRTC dans Node).
async function appareil(W, jeu, empreinteSim, sim, { mode = 'relais' } = {}) {
  const client = new ClientSimule({ sim, envoyer: (m) => client.duel && !client.duel.fermee && client.duel.send(JSON.stringify(m)) });
  client.attentes = [];
  const r = await W.ouvrir(`/tr/ws?jeu=${jeu}&sim=${empreinteSim}&proto=${TR.PROTOCOLE}`);
  if (r.statut !== 101) throw new Error(`recherche refusée (${r.statut})`);
  client.recherche = r.ws;
  client.trouvee = new Promise((ok) => {
    r.ws.surMessage = (t) => {
      const m = JSON.parse(t);
      if (m.t === 'attente') client.attentes.push(m.n);
      if (m.t === 'trouve') { client.infos = m; ok(m); }
      if (m.t === 'refus') ok(null);
    };
  });
  client.lier = async () => {
    const m = await client.trouvee;
    if (!m) return false;
    client.trouve(m);
    const d = await W.ouvrir(`/tr/duel?nom=${encodeURIComponent(m.duel)}&jeton=${m.jeton}`);
    if (d.statut !== 101) throw new Error(`duel refusé (${d.statut})`);
    client.duel = d.ws;
    d.ws.surMessage = (t) => client.recevoir(JSON.parse(t));
    await attendre(5);
    client.envoyer({ t: mode === 'p2p' ? 'p2p' : 'relais' });
    await attendre(5);
    client.envoyer({ t: 'pret' });
    return true;
  };
  return client;
}

async function testerWorker(jeux) {
  const sujet = 'Worker (faux Durable Objects)';
  const fiches = {};
  for (const j of jeux) fiches[j.id] = { empreinte: createHash('sha256').update(j.texte).digest('hex'), sim: chargerSim(j.texte) };
  const [id] = Object.keys(fiches);
  const { empreinte, sim } = fiches[id];
  const W = await monterWorker(fiches, { BUDGET_RELAIS_GOS: '600' });

  // Contrôles d'entrée.
  if ((await W.ouvrir(`/tr/ws?jeu=${id}&sim=${empreinte}&proto=${TR.PROTOCOLE}`, { Origin: 'https://autre.exemple' })).statut !== 403) probleme(sujet, 'un autre site peut ouvrir une recherche');
  if ((await W.ouvrir(`/tr/ws?jeu=${id}&sim=0000&proto=${TR.PROTOCOLE}`)).statut !== 409) probleme(sujet, 'simulation différente acceptée');
  if ((await W.ouvrir(`/tr/ws?jeu=inconnu&sim=${empreinte}&proto=${TR.PROTOCOLE}`)).statut !== 404) probleme(sujet, 'jeu inconnu accepté');
  if ((await W.ouvrir(`/tr/duel?nom=${id}.00000000-0000-0000-0000-000000000000&jeton=00000000-0000-0000-0000-000000000000`)).statut !== 410) probleme(sujet, 'duel inexistant accepté');

  // Recherche seul : compteur à 1, puis 0 après fermeture ; /tr/attente.
  const seul = await appareil(W, id, empreinte, sim);
  await attendre(10);
  const compte = await (await W.worker.fetch(new FausseRequete(`https://multi.freemicrogames.com/tr/attente?jeu=${id}`), W.env)).json();
  if (compte.enRecherche !== 1 || seul.attentes.at(-1) !== 1) probleme(sujet, `compteur de recherche : ${compte.enRecherche} (1 attendu)`);
  seul.recherche.close();
  await attendre(10);
  const compte0 = await (await W.worker.fetch(new FausseRequete(`https://multi.freemicrogames.com/tr/attente?jeu=${id}`), W.env)).json();
  if (compte0.enRecherche !== 0) probleme(sujet, 'compteur : la recherche fermée compte encore');
  else ok('recherche : compteur des joueurs qui cherchent (1, puis 0 après départ), /tr/attente');

  // Deux joueurs : appariement, relais, partie identique sur le serveur et les deux appareils.
  const a = await appareil(W, id, empreinte, sim), b = await appareil(W, id, empreinte, sim);
  const [ma, mb] = await Promise.all([a.trouvee, b.trouvee]);
  if (!ma || !mb || ma.duel !== mb.duel || ma.camp === mb.camp || ma.graine !== mb.graine) probleme(sujet, 'appariement : les deux joueurs ne sont pas dans la même partie');
  await Promise.all([a.lier(), b.lier()]);
  await attendre(7000);
  const duelObj = W.objets.DUEL.get(ma.duel);
  if (!a.modes.includes('relais') || !b.modes.includes('relais')) probleme(sujet, `relais non annoncé (${a.modes} / ${b.modes})`);
  const e = ecarts(a, b);
  if (a.k() < 25 || b.k() < 25) probleme(sujet, `relais : trop peu de ticks joués (${a.k()}, ${b.k()})`);
  else if (e.diff || !e.communs || duelObj.mesure.desync) probleme(sujet, `relais : états différents entre appareils et serveur (${e.diff} écart(s) sur ${e.communs}, serveur : ${duelObj.mesure.desync})`);
  else ok(`relais : ${a.k()} ticks en 7 s, ${a.ordres + b.ordres} ordres, mêmes hachages sur les deux appareils et le serveur (${e.communs} contrôles)`);

  // Absence : l'appareil b se tait et ferme → robot après 10 s ; retour → la main lui revient.
  b.duel.close();
  await attendre(11500);
  if (!a.reseau.some((m) => m.camp === mb.camp && m.ok === false)) probleme(sujet, `absence : l'autre joueur n'a pas été prévenu du problème de réseau (${JSON.stringify(a.reseau)})`);
  if (a.ctl[mb.camp] !== 2) probleme(sujet, `absence : le camp du joueur parti n'est pas passé au robot (${a.ctl})`);
  else ok('déconnexion de plus de 10 s : le camp du joueur parti passe au robot, la partie continue');
  const retour = await W.ouvrir(`/tr/duel?nom=${encodeURIComponent(mb.duel)}&jeton=${mb.jeton}`);
  b.duel = retour.ws;
  retour.ws.surMessage = (t) => b.recevoir(JSON.parse(t));
  b.envoyer({ t: 'reprise', depuis: b.k() });
  await attendre(1500);
  if (!a.reseau.some((m) => m.camp === mb.camp && m.ok === true)) probleme(sujet, `retour : l'autre joueur n'a pas été prévenu que le réseau est revenu (${JSON.stringify(a.reseau)})`);
  if (b.snaps < 1 || a.ctl[mb.camp] !== 0) probleme(sujet, `reprise : pas d'instantané (${b.snaps}) ou main pas rendue (${a.ctl})`);
  else if (Math.abs(a.k() - b.k()) > 3) probleme(sujet, `reprise : l'appareil revenu n'a pas rattrapé (${a.k()} / ${b.k()})`);
  else ok(`reconnexion : instantané + ticks suivants, le joueur reprend la main (ticks ${a.k()} / ${b.k()})`);
  const e2 = ecarts(a, b);
  if (e2.diff) probleme(sujet, `${e2.diff} écart(s) de hachage après la reprise`);
  a.duel.close(); b.duel.close();
  await attendre(11500);
  if (duelObj.minuteur) probleme(sujet, 'les deux joueurs partis : la boucle des ticks tourne encore');
  else ok('plus personne : la boucle des ticks s\'arrête (fin de la durée facturée)');

  // Pair-à-pair : les deux lanceurs annoncent p2p → mode p2p, aucune minuterie.
  const c = await appareil(W, id, empreinte, sim, { mode: 'p2p' }), d = await appareil(W, id, empreinte, sim, { mode: 'p2p' });
  await Promise.all([c.lier(), d.lier()]);
  await attendre(300);
  const duelP2P = W.objets.DUEL.get(c.infos.duel);
  if (!c.modes.includes('p2p') || duelP2P.minuteur) probleme(sujet, 'pair-à-pair : mode non annoncé, ou minuterie lancée');
  else ok('pair-à-pair : mode annoncé aux deux, aucune minuterie sur le serveur (il peut hiberner)');
  // Signalisation : une offre de c arrive chez d.
  let recu = null;
  const ancien = d.duel.surMessage;
  d.duel.surMessage = (t) => { const m = JSON.parse(t); if (m.t === 'sdp') recu = m; else ancien(t); };
  c.duel.send(JSON.stringify({ t: 'sdp', d: { type: 'offer', sdp: 'v=0' } }));
  await attendre(20);
  if (!recu || recu.d.type !== 'offer') probleme(sujet, 'signalisation : l\'offre WebRTC n\'est pas transmise à l\'autre joueur');
  else ok('signalisation WebRTC : offres et candidats transmis d\'un joueur à l\'autre');
  d.duel.surMessage = ancien;
  // Secours : le pair-à-pair coupe, le serveur reprend la partie depuis l'instantané d'un appareil.
  c.duel.surMessage = (t) => { const m = JSON.parse(t); if (m.t === 'demande-snap') c.duel.send(JSON.stringify({ t: 'snap', snap: { k: 120, etat: (() => { const s = new TR.Simulation(sim, c.graine, { ...c.config, ctl: [0, 0] }); for (let i = 0; i < 120; i++) s.avancer([]); return s.etat; })() } })); else c.recevoir(m); };
  c.duel.send(JSON.stringify({ t: 'secours', k: 120 }));
  await attendre(1500);
  if (!duelP2P.minuteur || c.snaps < 1 || d.snaps < 1 || c.k() < 125) probleme(sujet, `secours : le serveur n'a pas repris la partie (${c.snaps}, ${d.snaps}, tick ${c.k()})`);
  else ok(`secours : pair-à-pair coupé → relais depuis l'instantané du tick 120, partie reprise (tick ${c.k()})`);
  c.duel.close(); d.duel.close();

  // Budget : au-delà de 80 % (600 Go-s → 480, une partie en réserve 150), les relais suivants sont refusés.
  const refus = [];
  for (let i = 0; i < 3; i++) {
    const x = await appareil(W, id, empreinte, sim), y = await appareil(W, id, empreinte, sim);
    await Promise.all([x.lier(), y.lier()]);
    await attendre(50);
    refus.push(x.refus);
    x.duel.close(); y.duel.close();
  }
  if (!refus.includes('budget')) probleme(sujet, `budget : aucun refus au-delà de 80 % (${refus})`);
  else ok(`budget : au-delà de 80 % du budget du jour, nouvelle partie relayée refusée (« budget » : jeu contre le robot) ; ${refus.filter((r) => r === 'budget').length} refus sur 3`);
  await attendre(11000);
  for (const o of W.objets.DUEL.values()) clearInterval(o.minuteur);
}

// --------------------------------------------------------------------------
// 3. Vrai Worker local (wrangler dev) : tests 4 et 5
// --------------------------------------------------------------------------

// Lien réseau simulé : latence (et gigue) dans chaque sens, ordre gardé comme sur TCP.
class Lien {
  constructor(latence, gigue) { this.latence = latence; this.gigue = gigue; this.prochain = 0; }
  passer(f) {
    const t = Math.max(this.prochain, Date.now() + this.latence + Math.random() * this.gigue);
    this.prochain = t;
    setTimeout(f, Math.max(0, t - Date.now()));
  }
}

async function demarrerWrangler(port) {
  // Un ancien wrangler dev encore ouvert sur ce port répondrait à la place du nouveau (avec l'ancien code).
  try { const r = await fetch(`http://127.0.0.1:${port}/etat`); if (r) throw new Error('occupé'); }
  catch (e) { if (e.message === 'occupé') throw new Error(`le port ${port} est déjà pris (ancien wrangler dev ?) : arrêtez-le avant le test`); }
  const dossier = path.join(RACINE, 'multijoueur');
  const persist = path.join(RACINE, 'captures', 'temps-reel', 'wrangler-etat');
  const enfant = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
    '--yes', WRANGLER, 'dev', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', persist,
    '--var', 'ORIGINES:http://localhost:8080,http://127.0.0.1:8080', '--var', 'BUDGET_RELAIS_GOS:100000',
  ], { cwd: dossier, shell: process.platform === 'win32', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' } });
  const journal = [];
  // Les morceaux de sortie peuvent couper une ligne en deux : on les recolle ligne par ligne.
  const reste = { out: '', err: '' };
  const lecteur = (cle) => (b) => {
    const t = reste[cle] + String(b);
    const morceaux = t.split(/\r?\n/);
    reste[cle] = morceaux.pop();
    for (const l of morceaux) if (l.trim()) journal.push(l);
  };
  enfant.stdout.on('data', lecteur('out'));
  enfant.stderr.on('data', lecteur('err'));
  enfant.on('exit', () => { for (const cle of ['out', 'err']) if (reste[cle].trim()) journal.push(reste[cle]); });
  const debut = Date.now();
  while (Date.now() - debut < 180000) {
    try { const r = await fetch(`http://127.0.0.1:${port}/etat`); if (r.ok) return { enfant, journal }; } catch { /* pas encore prêt */ }
    if (enfant.exitCode !== null) break;
    await attendre(1000);
  }
  arreterProcessus(enfant, port);
  throw new Error(`wrangler dev n'a pas démarré :\n${journal.slice(-20).join('\n')}`);
}

// Arrêt de wrangler dev : l'arbre de processus, puis (Windows) tout ce qui écoute encore sur son port
// ou porte « --port <port> » (npx lance wrangler, qui lance workerd : taskkill seul en laisse filer).
function arreterProcessus(enfant, port) {
  if (process.platform !== 'win32') { enfant.kill('SIGTERM'); return; }
  spawnSync('taskkill', ['/pid', String(enfant.pid), '/T', '/F'], { stdio: 'ignore' });
  if (port) {
    spawnSync('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'wrangler.*--port ${port} ' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; ` +
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
    ], { stdio: 'ignore' });
  }
}

// Un appareil relié au vrai Worker local, à travers un lien simulé.
function appareilReseau(port, jeu, empreinteSim, sim, { latence = 0, gigue = 0, pertes = 0, nom, paisible = false }) {
  const montant = new Lien(latence, gigue), descendant = new Lien(latence, gigue);
  const origine = 'http://localhost:8080';
  const c = new ClientSimule({ sim, nom, paisible, envoyer: (m) => {
    const ws = c.ws;
    if (!ws || ws.readyState !== 1) return;
    const t = JSON.stringify(m);
    montant.passer(() => { if (ws.readyState === 1) ws.send(t); });
  } });
  c.coupures = 0;
  const ouvrir = (url, surMessage) => new Promise((ok, ko) => {
    const ws = new WebSocket(url, { headers: { Origin: origine } });
    ws.onopen = () => ok(ws);
    ws.onerror = () => ko(new Error(`connexion impossible : ${url}`));
    ws.onmessage = (e) => { if (e.data !== 'pong') descendant.passer(() => surMessage(JSON.parse(e.data))); };
  });
  c.chercher = async () => {
    const trouve = await new Promise((ok, ko) => {
      ouvrir(`ws://127.0.0.1:${port}/tr/ws?jeu=${jeu}&sim=${empreinteSim}&proto=${TR.PROTOCOLE}`, (m) => { if (m.t === 'trouve') ok(m); if (m.t === 'refus') ko(new Error(m.raison)); }).catch(ko);
    });
    c.infos = trouve;
    c.trouve(trouve);
    await c.rejoindre();
    c.envoyer({ t: 'relais' });
    c.envoyer({ t: 'pret' });
  };
  c.rejoindre = async () => {
    c.ws = await ouvrir(`ws://127.0.0.1:${port}/tr/duel?nom=${encodeURIComponent(c.infos.duel)}&jeton=${c.infos.jeton}`, (m) => c.recevoir(m));
    c.ws.onclose = () => { c.ws = null; };
  };
  // Pertes simulées : sur TCP, une perte devient un retard ou une coupure ; on coupe parfois la connexion.
  c.minuteurPertes = pertes ? setInterval(async () => {
    if (!c.ws || Math.random() > pertes || c.fin) return;
    c.coupures++;
    try { c.ws.close(); } catch { /* fermée */ }
    c.ws = null;
    await attendre(500 + Math.random() * 2500);
    try { await c.rejoindre(); c.attendSnap = true; c.envoyer({ t: 'reprise', depuis: c.k() }); } catch { /* réessaiera */ }
  }, 10000) : 0;
  c.fermer = () => { clearInterval(c.minuteurPertes); try { c.ws?.close(); } catch { /* */ } };
  return c;
}

async function testerWrangler(jeux) {
  const port = 8797;
  const jeu = jeux[0];
  const empreinte = createHash('sha256').update(jeu.texte).digest('hex');
  const sim = chargerSim(jeu.texte);
  console.log(`\n— wrangler dev (${WRANGLER}, port ${port}) : démarrage…`);
  const { enfant, journal } = await demarrerWrangler(port);
  const mesures = [];
  // Base d'observabilité locale vidée : seules les parties de ce test y seront.
  try { await fetch(`http://127.0.0.1:${port}/cdn-cgi/local/explorer/api/local/observability/clear`, { method: 'POST' }); } catch { /* ancienne version */ }
  try {
    const conditions = [
      { nom: 'latence 0 ms', latence: 0, gigue: 0, pertes: 0, paisible: true },
      { nom: 'latence 150 ms, gigue 60 ms, pertes', latence: 150, gigue: 60, pertes: 0.5, paisible: true },
      { nom: 'latence 400 ms, gigue 150 ms, pertes', latence: 400, gigue: 150, pertes: 0.5, paisible: true },
    ];
    const duels = [];
    for (const cond of conditions) {
      const a = appareilReseau(port, jeu.id, empreinte, sim, cond), b = appareilReseau(port, jeu.id, empreinte, sim, cond);
      // Appariés deux par deux : le second arrive pendant que le premier cherche.
      const pa = a.chercher();
      await attendre(300);
      await Promise.all([pa, b.chercher()]);
      duels.push({ cond, a, b, debut: Date.now() });
    }
    // Test 5 : un joueur coupé plus de 10 s → robot, puis retour.
    const x = appareilReseau(port, jeu.id, empreinte, sim, { nom: 'déconnexion' }), y = appareilReseau(port, jeu.id, empreinte, sim, { nom: 'déconnexion' });
    const px = x.chercher(); await attendre(300); await Promise.all([px, y.chercher()]);
    console.log(`  …  ${duels.length + 1} parties relayées en cours (${TICKS_WRANGLER} ticks, environ ${Math.round(TICKS_WRANGLER / 10)} s)`);
    await attendre(20000);
    const campY = y.camp;
    y.ws.close(); y.ws = null;
    await attendre(12500);
    const robot = x.ctl[campY] === 2;
    const prevenu = x.reseau.some((m) => m.camp === campY && m.ok === false);
    if (!prevenu) probleme('test 5', `l'autre joueur n'a pas été prévenu du problème de réseau (${JSON.stringify(x.reseau)})`);
    await y.rejoindre(); y.attendSnap = true; y.envoyer({ t: 'reprise', depuis: y.k() });
    await attendre(3000);
    const rendue = x.ctl[campY] === 0 && Math.abs(x.k() - y.k()) <= 5;
    if (!robot) probleme('test 5', `le camp du joueur coupé 12 s n'est pas passé au robot (${x.ctl})`);
    else if (!rendue) probleme('test 5', `au retour, le joueur n'a pas repris la main ou pas rattrapé (${x.ctl}, ticks ${x.k()} / ${y.k()})`);
    else ok(`test 5 : coupure de 12,5 s → robot à sa place ; retour → instantané, rattrapage (ticks ${x.k()} / ${y.k()}), il reprend la main`);

    // Attente de la fin des parties (ticks voulus).
    const finVoulue = Date.now() + (TICKS_WRANGLER * 100) + 30000;
    while (Date.now() < finVoulue && duels.some((d) => Math.min(d.a.k(), d.b.k()) < TICKS_WRANGLER && !d.a.fin)) await attendre(2000);
    for (const d of duels) {
      const e = ecarts(d.a, d.b);
      const ticks = Math.min(d.a.k(), d.b.k());
      if (ticks < TICKS_WRANGLER && !d.a.fin) probleme(`test 4 (${d.cond.nom})`, `seulement ${ticks} ticks joués`);
      else if (e.diff) probleme(`test 4 (${d.cond.nom})`, `${e.diff} écart(s) de hachage sur ${e.communs}`);
      else ok(`test 4 (${d.cond.nom}) : ${ticks} ticks${d.a.fin ? ' (partie finie)' : ''}, ${d.a.ordres + d.b.ordres} ordres, ${d.a.coupures + d.b.coupures} coupure(s), ${e.communs} contrôles de hachage, aucun écart`);
      d.a.fermer(); d.b.fermer();
    }
    x.fermer(); y.fermer();
    await attendre(13000);   // la boucle des ticks voit l'absence et s'arrête : ligne de mesure
    // wrangler dev garde les console.log des Durable Objects dans sa base d'observabilité locale.
    try {
      const r = await fetch(`http://127.0.0.1:${port}/cdn-cgi/local/explorer/api/local/observability/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: "SELECT * FROM logs WHERE CAST(message AS TEXT) LIKE '%temps réel%' LIMIT 500" }),
      });
      const texte = await r.text();
      journal.push(`[observabilité] ${r.status} ${texte.slice(0, 200)}`);
      const fouiller = (x) => {
        if (typeof x === 'string') { if (x.includes('[temps réel]')) journal.push(x); }
        else if (Array.isArray(x)) x.forEach(fouiller);
        else if (x && typeof x === 'object') Object.values(x).forEach(fouiller);
      };
      try { fouiller(JSON.parse(texte)); } catch { journal.push(texte); }
    } catch (e) { journal.push(`[observabilité] ${e.message}`); }
    await new Promise((ok) => { enfant.once('exit', ok); arreterProcessus(enfant, port); setTimeout(ok, 8000); });
    for (const l of journal) {
      const i = l.indexOf('[temps réel] mesure');
      if (i >= 0) {
        // Ligne de la base d'observabilité : ["[temps réel] mesure", "{…}"] ; sinon texte brut.
        try { const x = JSON.parse(l); mesures.push(JSON.parse(x[1])); continue; } catch { /* texte brut */ }
        try { mesures.push(JSON.parse(l.slice(l.indexOf('{', i)))); } catch { /* ligne coupée */ }
      }
      if (l.includes('[temps réel] désynchronisation')) probleme('Worker', `désynchronisation signalée par le serveur : ${l.slice(0, 300)}`);
    }
    await mkdir(path.join(RACINE, 'captures', 'temps-reel'), { recursive: true });
    await writeFile(path.join(RACINE, 'captures', 'temps-reel', 'journal-wrangler.txt'), journal.join(String.fromCharCode(10)));
    await writeFile(path.join(RACINE, 'captures', 'temps-reel', 'mesures-wrangler.json'), JSON.stringify({ date: new Date().toISOString(), ticks: TICKS_WRANGLER, mesures }, null, 2));
    if (mesures.length) ok(`mesures du serveur (captures/temps-reel/mesures-wrangler.json) : ${mesures.map((m) => `${m.secondes} s, ${m.recus} messages reçus, ${m.envoyes} envoyés, ${m.ticks} ticks, ${m.desync} écart(s)`).join(' ; ')}`);
  } finally {
    arreterProcessus(enfant, port);
  }
}

// --------------------------------------------------------------------------
// 4. Navigateur : jeu dans le lanceur (tests 2 et 3)
// --------------------------------------------------------------------------

async function testerNavigateur(jeux) {
  const { chromium } = await import('playwright');
  const jeu = jeux[0];
  const portSite = 8080, portWorker = 8798;
  const executable = process.env.CHROMIUM_PATH || undefined;
  console.log('\n— navigateur : construction du site et serveurs locaux…');
  await new Promise((ok, ko) => { const b = spawn(process.execPath, ['scripts/build-catalog.mjs'], { cwd: RACINE, stdio: 'ignore' }); b.on('exit', (c) => (c === 0 ? ok() : ko(new Error('build en échec')))); });
  const site = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: RACINE, env: { ...process.env, PORT: String(portSite) }, stdio: 'ignore' });
  const { enfant: worker } = await demarrerWrangler(portWorker);
  const navigateur = await chromium.launch({ executablePath: executable, args: ['--use-fake-ui-for-media-stream'] });
  const dossierCaptures = path.join(RACINE, 'captures', 'temps-reel');
  await mkdir(dossierCaptures, { recursive: true });
  try {
    await attendre(1500);
    const base = `http://localhost:${portSite}/play?id=${jeu.id}&lang=fr`;
    const ouvrirJeu = async (contexte, suffixe = '') => {
      const page = await contexte.newPage();
      const journal = [];
      page.on('console', (m) => journal.push(m.text()));
      await page.goto(base + suffixe);
      const cadre = await (await page.waitForSelector('iframe', { timeout: 20000 })).contentFrame();
      await cadre.waitForFunction(() => !!window.JEL_TR, null, { timeout: 20000 });
      return { page, cadre, journal };
    };
    const etatPartie = (cadre) => cadre.evaluate(() => { const p = window.JEL_TR.derniere; return p ? { mode: p.mode, connexion: p.connexion, k: p.etat ? p.etat.k : 0, h: p.etat ? window.JEL_TR.hacher(p.etat) : null, ctl: p.etat ? p.etat.ctl : null } : null; });
    const cliquerJouer = async (cadre) => {
      await cadre.click('[data-tr="jouer"]', { timeout: 15000 });
      // Le jeu peut demander le niveau du robot de secours avant de chercher : on prend le choix proposé.
      for (let i = 0; i < 4; i++) {
        const p = await etatPartie(cadre);
        if (p && p.mode !== 'arret') return;
        const suite = await cadre.$('[data-tr="chercher"]');
        if (suite) await suite.click();
        await attendre(300);
      }
    };

    // Test 2 : personne d'autre → partie contre le robot en moins de 16 s, aucune requête pendant la partie.
    if (!SEULEMENT_COUPURES) {
      const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const { page, cadre } = await ouvrirJeu(contexte, `&multi=ws://localhost:${portWorker}`);
      await cliquerJouer(cadre);
      // Délai compté depuis le début de la recherche (le joueur a pu prendre son temps pour choisir le robot).
      const t0 = Date.now() - await cadre.evaluate(() => { const p = window.JEL_TR.derniere; return p && p.mode === 'recherche' ? Math.max(0, p.r.rechercheMs - (p.finRecherche - performance.now())) : 0; });
      await cadre.waitForFunction(() => window.JEL_TR.derniere && window.JEL_TR.derniere.mode === 'local', null, { timeout: 17000 });
      const delai = (Date.now() - t0) / 1000;
      const requetes = [];
      page.on('request', (r) => requetes.push(r.url()));
      contexte.on('websocket', (w) => requetes.push(w.url()));
      await attendre(6000);
      const p = await etatPartie(cadre);
      await page.screenshot({ path: path.join(dossierCaptures, 'seul-robot.png') });
      if (delai > 16) probleme('test 2', `partie contre le robot après ${delai.toFixed(1)} s`);
      else if (requetes.length) probleme('test 2', `requêtes pendant la partie contre le robot : ${requetes.slice(0, 5).join(', ')}`);
      else if (!(p.k > 40)) probleme('test 2', `la partie contre le robot n'avance pas (tick ${p.k})`);
      else ok(`test 2 : personne en ligne → partie contre le robot en ${delai.toFixed(1)} s, ${p.k} ticks joués en 6 s sans aucune requête réseau`);
      await contexte.close();
    }
    // Test 2 bis : hors ligne → partie contre le robot tout de suite.
    if (!SEULEMENT_COUPURES) {
      const contexte = await navigateur.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
      const { page, cadre } = await ouvrirJeu(contexte, `&multi=ws://localhost:${portWorker}`);
      await contexte.setOffline(true);
      const t0 = Date.now();
      await cliquerJouer(cadre);
      await cadre.waitForFunction(() => window.JEL_TR.derniere && window.JEL_TR.derniere.mode === 'local', null, { timeout: 17000 });
      const delai = (Date.now() - t0) / 1000;
      await attendre(2000);
      await page.screenshot({ path: path.join(dossierCaptures, 'hors-ligne-paysage.png') });
      if (delai > 3) probleme('test 2 (hors ligne)', `partie contre le robot après ${delai.toFixed(1)} s`);
      else ok(`test 2 : hors ligne → partie contre le robot en ${delai.toFixed(1)} s (téléphone en paysage)`);
      await contexte.close();
    }
    // Test 3 : deux joueurs → pair-à-pair ; puis pair-à-pair forcé en échec → relais.
    for (const [nom, suffixe, attendu] of SEULEMENT_COUPURES ? [] : [['pair-à-pair', '', 'p2p'], ['pair-à-pair forcé en échec', '&p2p=non', 'relais']]) {
      const c1 = await navigateur.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const c2 = await navigateur.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const j1 = await ouvrirJeu(c1, `&multi=ws://localhost:${portWorker}${suffixe}`);
      const j2 = await ouvrirJeu(c2, `&multi=ws://localhost:${portWorker}${suffixe}`);
      await cliquerJouer(j1.cadre);
      await attendre(500);
      await cliquerJouer(j2.cadre);
      const enLigne = (c) => c.waitForFunction(() => window.JEL_TR.derniere && window.JEL_TR.derniere.mode === 'en-ligne', null, { timeout: 20000 });
      try { await Promise.all([enLigne(j1.cadre), enLigne(j2.cadre)]); } catch { /* vérifié ci-dessous */ }
      await attendre(12000);
      const [p1, p2] = await Promise.all([etatPartie(j1.cadre), etatPartie(j2.cadre)]);
      await j1.page.screenshot({ path: path.join(dossierCaptures, `${attendu}-joueur1.png`) });
      await j2.page.screenshot({ path: path.join(dossierCaptures, `${attendu}-joueur2.png`) });
      // Même état au même tick : on compare le hachage des deux appareils au tick de contrôle commun le plus récent.
      const kCommun = Math.floor(Math.min(p1.k, p2.k) / 50) * 50;
      const [h1, h2] = await Promise.all([j1.cadre, j2.cadre].map((c) => c.evaluate((k) => window.JEL_TR.derniere.s.hashDe(k), kCommun)));
      const journaux = [...j1.journal, ...j2.journal].filter((l) => l.includes('[temps réel]'));
      if (p1.mode !== 'en-ligne' || p2.mode !== 'en-ligne') probleme(`test 3 (${nom})`, `pas de partie en ligne (${p1.mode} / ${p2.mode}) — ${journaux.slice(-6).join(' | ')}`);
      else if (p1.connexion !== attendu || p2.connexion !== attendu) probleme(`test 3 (${nom})`, `mode ${p1.connexion} / ${p2.connexion} (${attendu} attendu)`);
      else if (!h1 || h1 !== h2) probleme(`test 3 (${nom})`, `états différents au tick ${kCommun} (${h1} / ${h2})`);
      else ok(`test 3 (${nom}) : partie en ligne en mode ${attendu}, ${Math.min(p1.k, p2.k)} ticks, même état sur les deux appareils (tick ${kCommun})`);
      await c1.close(); await c2.close();
      await attendre(500);
    }

    // Test 6 : coupures réseau (crochet __fmgTempsReel du lanceur, actif seulement en local).
    const duo = async (suffixe) => {
      const c1 = await navigateur.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const c2 = await navigateur.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const a = await ouvrirJeu(c1, `&multi=ws://localhost:${portWorker}${suffixe}`);
      const b = await ouvrirJeu(c2, `&multi=ws://localhost:${portWorker}${suffixe}`);
      await cliquerJouer(a.cadre); await attendre(500); await cliquerJouer(b.cadre);
      // 40 s : la toute première connexion réveille wrangler dev (démarrage à froid).
      const enLigne = (c) => c.waitForFunction(() => window.JEL_TR.derniere && window.JEL_TR.derniere.mode === 'en-ligne', null, { timeout: 40000 });
      await Promise.all([enLigne(a.cadre), enLigne(b.cadre)]);
      a.contexte = c1; b.contexte = c2;
      return [a, b];
    };
    const bandeau = (c) => c.evaluate(() => { const el = document.getElementById('reseau'); return el && !el.classList.contains('cache') ? document.getElementById('reseauTexte').textContent : ''; });
    const camp = (j) => j.page.evaluate(() => window.__fmgTempsReel.etat().camp);
    // Même état sur les deux appareils, au tick de contrôle commun le plus récent (on attend qu'il soit joué des deux côtés).
    const memeEtat = async (a, b) => {
      await attendre(6500);
      const [p1, p2] = await Promise.all([etatPartie(a.cadre), etatPartie(b.cadre)]);
      const k = Math.floor((Math.min(p1.k, p2.k) - 5) / 50) * 50;
      const [h1, h2] = await Promise.all([a.cadre, b.cadre].map((c) => c.evaluate((x) => window.JEL_TR.derniere.s.hashDe(x), k)));
      return { ok: !!h1 && h1 === h2, k, p1, p2 };
    };
    const scenarios = [
      { nom: 'relais, coupure de 9 s', suffixe: '&p2p=non', qui: 'b', ms: 9000, adversaire: true },
      { nom: 'relais, coupure de 16 s (robot en attendant)', suffixe: '&p2p=non', qui: 'b', ms: 16000, long: true },
      { nom: 'pair-à-pair, coupure du pair non horloge (6 s)', suffixe: '', qui: 'camp1', ms: 6000 },
      { nom: 'pair-à-pair, coupure du pair horloge (6 s)', suffixe: '', qui: 'camp0', ms: 6000 },
    ];
    const choix = process.env.SCENARIO ? [scenarios[Number(process.env.SCENARIO)]] : scenarios;
    for (const sc of choix) {
      let a, b;
      try {
        [a, b] = await duo(sc.suffixe);
        await attendre(3000);
        // coupe : l'appareil coupé ; autre : l'autre.
        let coupe = b, autre = a;
        if (sc.qui === 'camp0' || sc.qui === 'camp1') {
          const ca = await camp(a);
          if ((sc.qui === 'camp0') === (ca === 0)) { coupe = a; autre = b; }
        }
        const t0 = Date.now();
        await coupe.page.evaluate((ms) => window.__fmgTempsReel.couper(ms), sc.ms);
        await attendre(6000);
        const bandeauMoi = await bandeau(coupe.cadre);
        const nomCapture = sc.nom.replace(/[^a-z0-9]+/gi, '-');
        await coupe.page.screenshot({ path: path.join(dossierCaptures, `bandeau-moi-${nomCapture}.png`) });
        let bandeauAutre = '';
        if (sc.adversaire) {
          await attendre(Math.max(0, t0 + 8500 - Date.now()));
          bandeauAutre = await bandeau(autre.cadre);
          await autre.page.screenshot({ path: path.join(dossierCaptures, `bandeau-adversaire-${nomCapture}.png`) });
        }
        let modeLong = null, robotChezAutre = false;
        if (sc.long) {
          await attendre(Math.max(0, t0 + 13500 - Date.now()));
          modeLong = (await etatPartie(coupe.cadre)).mode;
          robotChezAutre = (await etatPartie(autre.cadre)).ctl.some((x, i) => x > 0);
        }
        await attendre(Math.max(0, t0 + sc.ms + 4000 - Date.now()));
        const apres = await etatPartie(coupe.cadre);
        const bandeauApres = await bandeau(coupe.cadre);
        const m = await memeEtat(a, b);
        await coupe.page.screenshot({ path: path.join(dossierCaptures, `coupure-${sc.nom.replace(/[^a-z0-9]+/gi, '-')}.png`) });
        const sujet = `test 6 (${sc.nom})`;
        if (!bandeauMoi) probleme(sujet, 'pas de bandeau « connexion perdue » sur l\'appareil coupé');
        else if (sc.adversaire && !bandeauAutre) probleme(sujet, 'pas de bandeau « problème de réseau » chez l\'adversaire');
        else if (sc.long && modeLong !== 'local') probleme(sujet, `après 13,5 s de coupure, la partie devrait continuer contre le robot (mode ${modeLong})`);
        else if (sc.long && !robotChezAutre) probleme(sujet, 'chez l\'adversaire, le robot n\'a pas pris la place du joueur coupé');
        else if (apres.mode !== 'en-ligne') probleme(sujet, `pas de retour dans la partie en ligne après la coupure (mode ${apres.mode})`);
        else if (bandeauApres) probleme(sujet, `le bandeau reste affiché après le retour du réseau (« ${bandeauApres} »)`);
        else if (!m.ok) probleme(sujet, `états différents après la reprise (tick ${m.k} ; ${m.p1.k} / ${m.p2.k})`);
        else ok(`${sujet} : bandeau « ${bandeauMoi} »${sc.adversaire ? ` ; chez l'adversaire : « ${bandeauAutre} »` : ''}${sc.long ? ' ; robot en attendant des deux côtés' : ''} ; retour en ligne aussitôt le réseau revenu, même état au tick ${m.k} (mode ${m.p1.connexion} / ${m.p2.connexion})`);
      } catch (e) {
        probleme(`test 6 (${sc.nom})`, e.message);
      } finally {
        if (problemes && (a || b)) for (const j of [a, b]) if (j) console.log(`    journal : ${j.journal.filter((l) => l.includes('[temps réel]')).slice(process.env.SCENARIO ? -60 : -12).join(' | ')}`);
        if (problemes && process.env.SCENARIO) {
          try {
            const r = await fetch(`http://127.0.0.1:${portWorker}/cdn-cgi/local/explorer/api/local/observability/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: "SELECT ts_ms, message FROM logs WHERE CAST(message AS TEXT) LIKE '%temps réel%' ORDER BY ts_ms DESC LIMIT 40" }) });
            await writeFile(path.join(dossierCaptures, 'observabilite.json'), await r.text());
            console.log('    serveur : captures/temps-reel/observabilite.json');
          } catch (e) { console.log('    serveur :', e.message); }
        }
        await a?.contexte.close(); await b?.contexte.close();
        await attendre(500);
      }
    }
  } finally {
    await navigateur.close();
    arreterProcessus(worker, portWorker);
    site.kill();
  }
}

// --------------------------------------------------------------------------

const jeux = await jeuxTempsReel();
console.log(`Temps réel : ${jeux.length} jeu(x)${jeux.length ? ` (${jeux.map((j) => j.id).join(', ')})` : ''}\n`);
if (!jeux.length) { console.log('Aucun jeu en temps réel ("temps_reel": true) : rien à contrôler.'); process.exit(0); }
const valides = jeux.filter((j) => testerSimulation(j));
if (valides.length) {
  // jeux.js doit contenir les simulations (comme au déploiement).
  const { contenuWorker, jeuxMultijoueurs } = await import(pathToFileURL(path.join(RACINE, 'scripts', 'multijoueur.mjs')).href);
  let texteJeux = (await contenuWorker(await jeuxMultijoueurs())).texte;
  if (ESSAI) {
    // Mise au point : la simulation seule est ajoutée au Worker sous l'id « essai-tr ».
    const j = valides[0];
    texteJeux += `\nJEUX_TR["essai-tr"] = {\n  empreinte: ${JSON.stringify(createHash('sha256').update(j.texte).digest('hex'))},\n  sim: (function (window, ${MASQUES.join(', ')}) {\n${j.texte}\n    return window.JEL_SIM;\n  })({ JEL_TR: globalThis.JEL_TR }),\n};\n`;
  }
  await writeFile(path.join(RACINE, 'multijoueur', 'src', 'jeux.js'), texteJeux, 'utf8');
  try { await testerWorker(valides); } catch (e) { probleme('Worker', e.stack || e.message); }
  if (AVEC_WRANGLER) { try { await testerWrangler(valides); } catch (e) { probleme('wrangler dev', e.stack || e.message); } }
  if (AVEC_NAVIGATEUR) { try { await testerNavigateur(valides); } catch (e) { probleme('navigateur', e.stack || e.message); } }
}
console.log(problemes ? `\nTemps réel : ${problemes} problème(s).` : '\nTemps réel : tout est bon.');
process.exit(problemes ? 1 : 0);
