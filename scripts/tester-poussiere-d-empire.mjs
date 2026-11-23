#!/usr/bin/env node
// ==========================================================================
// tester-poussiere-d-empire.mjs — robot de contrôle de la simulation du jeu
// « Poussière d'Empire » (docs/cadrage-poussiere-d-empire.md, section 14 ;
// contrat des blocs : CONTRAT-LOT1.md du lot 1). Node seul, sans navigateur,
// sans réseau, sans dépendance.
//
//   node scripts/tester-poussiere-d-empire.mjs                 contrôles 1 à 11 (environ 3 minutes)
//   node scripts/tester-poussiere-d-empire.mjs --missions      + 12 : chaque mission 1 à 20 jouée 20 fois avec
//                                                              un robot à la place du joueur (taux, médiane)
//   node scripts/tester-poussiere-d-empire.mjs --cartes        + 13 : la planète de l'acte 1, les zones des 20
//                                                              missions, 500 graines de la carte « ligne »
//   --rapide    1 500 ticks au lieu de 6 000, 5 parties au lieu de 20 (mise au point ; seuils relâchés)
//   --souple    les taux de victoire des missions (≥ 70 % au niveau 2 ; ≤ 70 % au niveau 1 sur les missions
//               de fin d'acte et 33 à 40, ≤ 50 % sur 45 à 60 ; joueur sans ordre battu) ne sont plus bloquants
//   --sources <dossier>   lit <dossier>/pe-outils.js, pe-donnees.js, pe-sim.js, pe-pilote.js au lieu des
//                         blocs de games/poussiere-d-empire/index.html (sources du lot avant assemblage)
//
// Le jeu est solo : sa simulation vit dans les blocs <script id="pe-outils">,
// <script id="pe-donnees">, <script id="pe-sim"> et <script id="pe-pilote"> de
// index.html, et suit déjà le contrat jel-sim du moteur temps réel
// (public/temps-reel/moteur.js), sans que ce moteur soit dans le jeu. Le test
// évalue les quatre blocs dans un faux window NU (sans JEL_TR : la simulation
// se rabat sur sa copie des outils, PE_OUTILS), charge le moteur à part
// (import) et compare :
//    1. mots interdits dans pe-outils, pe-donnees, pe-sim (liste de tester-temps-reel.mjs) ;
//    2. PE_OUTILS identique au moteur (hacher, tirer, sinus, cosinus, racineEntiere, div, aleaDe
//       sur 1 000 valeurs) ;
//    3. interfaces du contrat : JEL_TR.problemesSim, camps 6, periodeBot 5, réglages, aides pures,
//       essais, PE_PILOTE, fiches de PE_DONNEES ;
//    4. rejeu : 3 configurations (mission 4 graine 777, la mission à la plus grande zone graine 4242,
//       « ligne » graine 12345)
//       de 6 000 ticks sous JEL_TR.Simulation, ordres de essais.ordres pour le camp 0 tous les 7 ticks,
//       journal rejoué deux fois (hachages identiques tous les 50 ticks), repris depuis l'instantané du
//       tick 3 000, puis le même journal sous PE_PILOTE.Simulation (contexte sans JEL_TR) ;
//    5. état entièrement entier après chaque tick (JEL_TR.premierFlottant) ;
//    6. importer(exporter(etat)) → même empreinte ; instantané de la plus grande carte avec 300 flottes
//       < 25 000 caractères ;
//    7. coût d'un tick sur la plus grande carte avec 5 robots de niveau 3 (≤ 0,5 ms visé, bloquant à 1 ms) ;
//    8. duels sur la carte « ligne » : niveau 3 contre 1 ≥ 85 %, 2 contre 1 ≥ 65 %, robots égaux 35 à 65 % ;
//    9. variété : 20 graines → 20 débuts de partie différents (essais.variete) ;
//   10. fin(etat) non nul au plus tard au tick tmax + 1 (toutes les parties jouées) ;
//   11. mission 1 gagnée par l'humain d'essai (essais.ordres) en moins de 3 000 ticks, et chaque mission
//       1 à 20 jouée une fois jusqu'au bout avec un robot moyen à la place du joueur ;
//   12. (--missions) chaque mission 1 à 20 jouée 20 fois avec un robot à la place du joueur (niveau 2,
//       puis niveau 1) : taux de victoire et médiane des ticks ; ≥ 70 % au niveau 2 et, sur les missions de
//       fin d'acte (MISSIONS_FIN_ACTE), ≤ 70 % au niveau 1 (bloquants sauf --souple) ; temps visé comparé à la règle (1,5 × médiane des victoires du robot 2,
//       bornée à 50–100 % de la durée visée dv, arrondie à 10 s : avertissement) ; puis chaque mission où un
//       rival attaque (MISSIONS_PASSIF) jouée 20 fois sans aucun ordre : 0 victoire, et la base assiégée
//       à chaque partie pour les missions « tenir » (bloquant sauf --souple) ;
//   13. (--cartes) la planète de l'acte 1 (connexe, sans articulation, provinces contiguës de taille[0] à
//       taille[1] régions numérotées par éloignement de la province natale, capitales, départ des factions),
//       les zones des 20 missions (10 à 90 régions, connexes, camps présents, objectif pas déjà atteint,
//       propriétaires et conquêtes cohérents, chaque province conquise une seule fois, toute la planète au
//       joueur après la mission 20 ; articulations entre deux camps : avertissement), et 500 graines de la
//       carte « ligne » (forme 1 : connexe, capitales à ≥ 3 arêtes, cellule, positions entières, quotas).
//   14. actes 2 et 3 (CONTRAT-LOT2) : cartes (connexes, 24 provinces, 2 à 4 routes par nœud, zones de 15 à 80
//       nœuds, conquêtes qui couvrent toute la carte à la fin de l'acte), règles isolées (orbites, durée figée,
//       pulsar, allié, objectifs 8 et 10, ravitaillement, personnalités, capacités des robots), déterminisme
//       (rejeu, reprise, JEL_TR.Simulation contre PE_PILOTE.Simulation), instantané, coût d'un tick, et chaque
//       mission 21 à 60 jouée jusqu'au bout ; avec --missions, 20 parties par mission et par robot : niveau 2 ≥ 70 %,
//       niveau 1 ≤ 70 % sur 33 à 40 et ≤ 50 % sur 45 à 60 (missions avec un rival), joueur sans ordre toujours battu
//       (5 parties par mission à rival), bloquants sauf --souple ou --rapide ; tvise comparé à la règle de l'acte 1.
//   15. actes 4 et 5 et bac à sable (CONTRAT-LOT3) : cartes (galaxie, toile : connexes, 24 provinces, routes, rivaux, zones
//       de 15 à 120 nœuds, conquêtes qui couvrent toute la carte à la fin de chaque acte), règles isolées (Pont, Essaimage,
//       Sursaut, vagues, robots, rivaux entre eux), bac à sable (carte fixée par la graine, reprise, fin), déterminisme
//       avec les trois capacités (rejeu, reprise, JEL_TR.Simulation contre PE_PILOTE.Simulation), instantané, coût d'un
//       tick, chaque mission 61 à 100 jouée jusqu'au bout ; avec --missions, seuils du contrat du lot 3 (section 4) :
//       robot 2 ≥ 70 %, robot 1 ≤ 50 % (missions à rival, hors 3 premières de l'acte), médiane du robot 2 ≥ 600 ticks,
//       objectif secondaire réussi au moins une fois par le robot 2 ou 3, joueur sans ordre battu, joueur glouton
//       (un geste toutes les 1,3 s, attaque directe) jamais vainqueur en moins de 60 s.
//   --controle  seul : robot 2 sur les missions 21 à 100, 100 graines de la série de contrôle (jamais utilisées pour
//               régler ; hors CI) ; objectif ≥ 65 % partout (avertissement en dessous). TRAVAILLEURS=n : nombre de fils.
// Les parties de --missions sont jouées par des fils de travail (node:worker_threads), sans les hachages de contrôle
// (le déterminisme est vérifié à part, sections 4 et 14 c, 15 d) : mêmes résultats, bien plus vite.
// Rien n'est écrit sur le disque. Code de sortie 1 dès qu'un problème bloquant a
// été rencontré (tous les contrôles possibles sont quand même joués et imprimés) ;
// les avertissements (⚠) ne changent pas le code de sortie.
// ==========================================================================

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'poussiere-d-empire';
const args = process.argv.slice(2);
const AVEC_MISSIONS = args.includes('--missions');
const AVEC_CARTES = args.includes('--cartes');
const RAPIDE = args.includes('--rapide');
const SOUPLE = args.includes('--souple');
const AVEC_CONTROLE = args.includes('--controle');
const DETAIL = !!process.env.DETAIL;             // DETAIL=1 : une ligne par duel (mise au point)
const iSources = args.indexOf('--sources');
const SOURCES = iSources >= 0 ? args[iSources + 1] : null;
if (iSources >= 0 && (!SOURCES || SOURCES.startsWith('--'))) { console.error('--sources attend un dossier'); process.exit(1); }

const BLOCS = ['pe-outils', 'pe-donnees', 'pe-sim', 'pe-pilote'];
const SANS_INTERDITS = new Set(['pe-pilote']);   // la boucle du pilote a le droit à setTimeout et à son horloge
const TICKS = RAPIDE ? 1500 : 6000;              // ticks de chaque partie rejouée
const PARTIES = RAPIDE ? 5 : 20;                 // parties des duels et des missions
const TICK_INSTANTANE = RAPIDE ? 750 : 3000;     // reprise depuis l'instantané de ce tick
const NB_MISSIONS = 20;                          // missions de l'acte 1 (contrôles 1 à 13, inchangés)
const NB_JOUABLES = 100;                         // missions jouables : les 5 actes (contrat du lot 3)
const NB_FICHES = 100;                           // 5 actes × 20 missions
const TICKS_SUITE = RAPIDE ? 800 : 3000;         // ticks des rejeux des actes 2 et 3
const PARTIES_SUITE = RAPIDE ? 3 : 20;           // parties par mission 21 à 60 et par robot avec --missions
const PARTIES_PASSIF_SUITE = RAPIDE ? 2 : 5;     // parties du joueur sans ordre, par mission à rival (longues : jusqu'à tmax)
// Plafond du robot de niveau 1 à la place du joueur (contrat du lot 2, section 3) ; 41 à 44 : début d'acte, libres.
const plafondRobot1 = (m) => (m >= 33 && m <= 40 ? 70 : m >= 45 ? 50 : null);
const MISSIONS_PASSIF = [5, 6, 9, 10, 12, 15, 16, 17, 18, 19, 20];   // un rival attaque : le joueur sans ordre perd
// Fin d'acte : un joueur peu attentif (robot de niveau 1 à sa place) doit y perdre souvent (réglage du 18 novembre 2026).
const MISSIONS_FIN_ACTE = [16, 17, 18, 19, 20];
const TAUX_MAX_ROBOT1_FIN_ACTE = 70;
// Mission 17 allégée après l'essai du propriétaire (18 novembre 2026), qui ne la gagnait pas en 10 parties.
const TAUX_MAX_ROBOT1_PAR_MISSION = { 17: 85 };
// Victoire avant le chrono (carte entière prise, raison 7 ; 19 novembre 2026) : les missions de siège 69 et 86 se
// gagnent dès que l'assaillant est écrasé à sa première offensive (vers 40 s pour le robot 2, qui les gagnait avant
// en tenant 3 minutes). Le robot 1 n'y gagne que 30 % et 15 % : elles ne sont pas faciles, seulement courtes.
const MEDIANE_MIN_PAR_MISSION = { 69: 300, 86: 300 };
// Mission où chaque capacité est gagnée (contrat v2, section 5).
const CAPACITE_MISSION = { rallier: 3, fortin: 6, transfert: 10, arrierepays: 15, relais: 25, chantier: 32, frappe: 47, pont: 66, essaimage: 71, sursaut: 85 };

// --------------------------------------------------------------------------
// Journal de bord
// --------------------------------------------------------------------------

let problemes = 0, avertissements = 0, reussites = 0;
function probleme(sujet, texte) { problemes++; console.log(`  ✗  ${sujet} : ${texte}`); }
function avertir(sujet, texte) { avertissements++; console.log(`  ⚠  ${sujet} : ${texte}`); }
function ok(texte) { reussites++; console.log(`  ✓  ${texte}`); }
function titre(texte) { console.log(`\n${texte}`); }
const copie = (x) => JSON.parse(JSON.stringify(x));
const ms = (x) => `${x.toFixed(3)} ms`;
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
function mediane(liste) {
  if (!liste.length) return 0;
  const l = liste.slice().sort((a, b) => a - b), m = Math.floor(l.length / 2);
  return l.length % 2 ? l[m] : Math.floor((l[m - 1] + l[m]) / 2);
}
function sortir() {
  console.log(problemes ? `\nPoussière d'Empire : ${problemes} problème(s), ${avertissements} avertissement(s), ${reussites} contrôle(s) bon(s).`
    : `\nPoussière d'Empire : tout est bon (${reussites} contrôles${avertissements ? `, ${avertissements} avertissement(s)` : ''}).`);
  process.exit(problemes ? 1 : 0);
}

// --------------------------------------------------------------------------
// Lecture des blocs : index.html (par id) ou --sources <dossier>
// --------------------------------------------------------------------------

async function lireBlocs() {
  const blocs = {};
  if (SOURCES) {
    const dossier = path.resolve(SOURCES);
    if (!existsSync(dossier)) { console.error(`Dossier des sources introuvable : ${dossier}`); process.exit(1); }
    for (const id of BLOCS) {
      const f = path.join(dossier, `${id}.js`);
      if (!existsSync(f)) { console.error(`Source manquante : ${f} (les quatre blocs ${BLOCS.join(', ')} sont attendus en .js dans ce dossier)`); process.exit(1); }
      blocs[id] = (await readFile(f, 'utf8')).replace(/\r\n/g, '\n').replace(/^﻿/, '').trim();
    }
    return { blocs, origine: dossier };
  }
  const fichier = path.join(RACINE, 'games', ID, 'index.html');
  if (!existsSync(fichier)) {
    console.error(`Jeu introuvable : ${fichier}\n(assembler d'abord le jeu, ou passer --sources <dossier> avec les quatre blocs en .js)`);
    process.exit(1);
  }
  const html = (await readFile(fichier, 'utf8')).replace(/\r\n/g, '\n');
  // Depuis les parties à plusieurs (cadrage, section 21), les données et la simulation forment un seul bloc jel-sim
  // (le contrat du moteur temps réel) : il est lu ici comme « pe-donnees », « pe-sim » restant vide.
  const jelSim = /<script\s+id="jel-sim"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (jelSim) { blocs['pe-donnees'] = jelSim[1].trim(); blocs['pe-sim'] = '/* dans jel-sim */'; }
  for (const id of BLOCS) {
    if (jelSim && (id === 'pe-donnees' || id === 'pe-sim')) continue;
    const re = new RegExp(`<script\\s+id="${id}"[^>]*>([\\s\\S]*?)</script>`, 'i');
    const m = re.exec(html);
    if (!m) { console.error(`Bloc <script id="${id}"> absent de ${fichier}`); process.exit(1); }
    blocs[id] = m[1].trim();
    if (!blocs[id]) { console.error(`Bloc <script id="${id}"> vide dans ${fichier}`); process.exit(1); }
  }
  return { blocs, origine: fichier };
}

// Les quatre blocs sont évalués dans un faux window (contexte « nu » : aucun JEL_TR ; contexte
// « moteur » : window.JEL_TR = le moteur importé). Les noms masqués valent undefined dans le
// bloc : aucun accès à la page, au réseau ni au moteur par un nom nu ; globalThis est le faux
// window lui-même (globalThis.window === window).
const MASQUES = ['self', 'globalThis', 'JEL_TR', 'JEL_SAVE', 'JEL_I18N', 'FMG', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'importScripts', 'caches', 'navigator', 'location', 'document', 'localStorage', 'sessionStorage', 'indexedDB'];
function evaluerBlocs(blocs, ids, fenetre) {
  fenetre.window = fenetre;
  for (const id of ids) {
    // eslint-disable-next-line no-new-func
    const f = new Function('window', ...MASQUES, `"use strict";\n${blocs[id]}\n`);
    const valeurs = MASQUES.map((n) => (n === 'globalThis' ? fenetre : undefined));
    try { f(fenetre, ...valeurs); } catch (e) { throw new Error(`bloc ${id} : ${e.message}`); }
  }
  return fenetre;
}

// --------------------------------------------------------------------------
// Fil de travail : joue des lots de parties (contexte « nu », celui du jeu publié)
// tache : { m, niveau (0 : personne ne joue le camp du joueur), graines, varie, limite, court, siege, glouton }
// --------------------------------------------------------------------------

const SANS_CONTROLE = { hashTous: 1 << 30, instantaneTous: 1 << 30 };   // ni hachage ni instantané : la partie n'en dépend pas
// Joueur « glouton » : un geste toutes les 13 ticks (1,3 s) : 100 % de la source qui a la plus grande avance sur un voisin à
// prendre, les cibles de l'objectif d'abord. Pas de plan, pas de défense : il mesure si l'attaque directe suffit.
function gesteGlouton(sim, e, bonus) {
  let b = null;
  for (let a = 0; a < e.nn; a++) {
    if (e.p[a] !== 0 || e.f[a] < 6) continue;
    for (const j of e.m.vois[a]) {
      if (e.p[j] === 0 || (e.p[j] > 0 && e.eq[e.p[j]] === 0)) continue;
      const sc = e.f[a] - e.f[j] * 1.2 + (e.o.l && e.o.l.includes(j) ? bonus : 0);
      if (!b || sc > b.s) b = { s: sc, a, j };
    }
  }
  return b && sim.valide(e, 0, [1, b.a, b.j, 100]) ? [1, b.a, b.j, 100] : null;
}
// Joueur « ciblé » (relecture du lot 3) : un geste toutes les 13 ticks, 100 % de sa plus grosse pile, sur le plus court
// chemin vers l'objectif. Il mesure si une seule pile lancée en ligne droite suffit à gagner.
function ciblesDirectes(e) {
  const o = e.o || {}; let T = [];
  if (o.t === 7) { for (let i = 0; i < e.nn; i++) if (e.p[i] > 0 && (o.l || []).includes(e.p[i])) T.push(i); }
  else if (o.l && o.l.length) T = o.l.filter((i) => e.p[i] !== 0);
  if (!T.length) for (let c = 1; c < e.c.length; c++) { const cp = e.c[c].cap; if (cp >= 0 && e.c[c].v && e.eq[c] !== e.eq[0]) T.push(cp); }
  if (!T.length) for (let i = 0; i < e.nn; i++) if (e.p[i] !== 0) T.push(i);
  return T;
}
function gesteCible(sim, e) {
  const n = e.nn, d = new Int32Array(n).fill(1e9), q = [];
  for (const t of ciblesDirectes(e)) { d[t] = 0; q.push(t); }
  for (let h = 0; h < q.length; h++) for (const j of e.m.vois[q[h]]) if (d[j] > d[q[h]] + 1) { d[j] = d[q[h]] + 1; q.push(j); }
  let b = null;
  for (let a = 0; a < n; a++) {
    if (e.p[a] !== 0 || e.f[a] < 6) continue;
    let j0 = -1;
    for (const j of e.m.vois[a]) if (d[j] < d[a] && (j0 < 0 || d[j] < d[j0])) j0 = j;
    if (j0 < 0) continue;
    const s = e.f[a] - (e.p[j0] === 0 ? 0 : e.f[j0] * 0.5) - d[a] * 5;
    if (!b || s > b.s) b = { s, a, j: j0 };
  }
  return b && sim.valide(e, 0, [1, b.a, b.j, 100]) ? [1, b.a, b.j, 100] : null;
}
function jouerLot(X, t) {
  const fiche = X.D.missions[t.m - 1], sortie = [];
  const limite = t.limite || (fiche.tmax > 0 ? fiche.tmax + 1 : 20001), bonus = Math.max(30, fiche.neutres[1] >> 1);
  for (let i = 0; i < t.graines.length; i++) {
    const r = { fin: 0, ga: -1, k: 0, ra: 0, et: 0, sec: 0, si: 0, fl: null, err: null };
    try {
      const g = t.graines[i], config = JSON.parse(JSON.stringify(X.S.configMission(t.m, { graine: g, vent: 0 })));
      config.ctl[0] = t.niveau;
      const s = new X.P.Simulation(X.S, g, config, SANS_CONTROLE);
      // Missions à carte fixe (graine de la fiche) : seul le hasard de l'état varie d'une partie à l'autre.
      if (t.varie && fiche.graine && i > 0) s.etat.a = (fiche.graine ^ (i * 0x9e3779b9)) >>> 0;
      const cap0 = s.etat.m.cap[0];
      let seq = 0, file = [];
      while (!s.resultat && s.k() < limite) {
        let ordres = [];
        if (t.glouton || t.cible) {
          const k = s.k();
          ordres = file.filter((o) => o[0] <= k + 1).map((o) => o[1]); file = file.filter((o) => o[0] > k + 1);
          if (k % 13 === 0) { const o = t.cible ? gesteCible(X.S, s.etat) : gesteGlouton(X.S, s.etat, bonus); if (o) file.push([k + 2, [0, ++seq].concat(o)]); }
        }
        s.avancer(ordres);
        if (!r.fl && s.k() % 97 === 0) r.fl = X.O.premierFlottant(s.etat);
        if (t.siege && !r.si) for (const ev of s.etat.ev) if (ev[0] === 4 && ev[1] === cap0 && ev[2] !== 0) r.si = 1;
      }
      r.k = s.k();
      if (s.resultat) {
        const e = s.etat;
        r.fin = 1; r.ga = s.resultat.gagnant; r.ra = s.resultat.raison; r.et = s.resultat.etoiles | 0;
        r.sec = r.ga === 0 && e.s2.t && e.s2.ok && (e.s2.t !== 3 || e.s2.x === 1) ? 1 : 0;
      } else if (t.court) r.fin = 1;                                       // arrêt voulu : sans ordre, cet objectif est hors d'atteinte
    } catch (err) { r.err = err.message; }
    sortie.push(r);
  }
  return sortie;
}
if (!isMainThread) {
  const f = evaluerBlocs(workerData.blocs, BLOCS, {}), X = { S: f.JEL_SIM, D: f.PE_DONNEES, P: f.PE_PILOTE, O: f.PE_OUTILS };
  parentPort.on('message', ({ id, tache }) => parentPort.postMessage({ id, lot: jouerLot(X, tache) }));
  await new Promise(() => {});                                             // le fil reste à l'écoute jusqu'à terminate()
}

// Joue toutes les tâches sur NB_FILS fils ; renvoie les lots dans l'ordre des tâches.
const NB_FILS = Math.max(1, Math.min(16, Number(process.env.TRAVAILLEURS) || (os.availableParallelism ? os.availableParallelism() : os.cpus().length)));
async function lancerLots(taches) {
  const lots = new Array(taches.length);
  let suivante = 0;
  await Promise.all(Array.from({ length: Math.min(NB_FILS, taches.length) }, () => new Promise((fini, echec) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { blocs } });
    const envoyer = () => { if (suivante >= taches.length) { w.terminate().then(fini); return; } const id = suivante++; w.postMessage({ id, tache: taches[id] }); };
    w.on('message', ({ id, lot }) => { lots[id] = lot; envoyer(); });
    w.on('error', echec);
    envoyer();
  })));
  return lots;
}
// Résumé d'un lot ; les anomalies (exception, état non entier, partie sans fin) sont des problèmes bloquants.
function bilanLot(lot, sujet) {
  const r = { v: 0, n: 0, t: [], tv: [], ra: {}, et: 0, sec: false, assiegees: 0 };
  for (const p of lot) {
    if (p.err) { probleme(sujet, p.err); continue; }
    if (p.fl) probleme(sujet, `état non entier : ${p.fl}`);
    if (!p.fin) { probleme(sujet, `partie sans fin au tick ${p.k}`); continue; }
    r.n++; r.t.push(p.k); r.ra[p.ra] = (r.ra[p.ra] || 0) + 1; if (p.si) r.assiegees++;
    if (p.ga === 0) { r.v++; r.tv.push(p.k); r.et += p.et; if (p.sec) r.sec = true; }
  }
  return r;
}
const serie = (n, f) => Array.from({ length: n }, (_, i) => f(i));
// Sans ordre, le joueur ne prend rien : un objectif de conquête (1, 2, 3, 4, 9) est hors d'atteinte, inutile d'aller jusqu'à tmax.
const objectifConquete = (fiche) => [1, 2, 3, 4, 9].includes(fiche.objectif.t);

// --------------------------------------------------------------------------
// Moteur temps réel, chargé à part (import) : JEL_TR
// --------------------------------------------------------------------------

await import(pathToFileURL(path.join(RACINE, 'public', 'temps-reel', 'moteur.js')).href);
const TR = globalThis.JEL_TR;
if (!TR || typeof TR.Simulation !== 'function') { console.error('public/temps-reel/moteur.js : JEL_TR illisible'); process.exit(1); }

const { blocs, origine } = await lireBlocs();
console.log(`Poussière d'Empire : ${origine}${RAPIDE ? ' (--rapide)' : ''}`);
console.log(`Blocs : ${BLOCS.map((id) => `${id} ${Math.round(blocs[id].length / 1024)} Ko`).join(', ')}`);

// --------------------------------------------------------------------------
// 1. Mots interdits (liste de scripts/tester-temps-reel.mjs)
// --------------------------------------------------------------------------

const INTERDITS = [
  [/\bMath\.random\b/, 'Math.random'], [/\bDate\b/, 'Date'], [/\bperformance\b/, 'performance'],
  [/\bset(?:Timeout|Interval)\b/, 'minuterie'], [/\brequestAnimationFrame\b/, 'requestAnimationFrame'],
  [/\bMath\.(?:sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|sqrt|cbrt|sinh|cosh|tanh|fround)\b/, 'fonction mathématique non garantie (Math.sin, sqrt, pow… : JEL_TR.flottant)'],
  [/\*\*/, 'puissance ** (non garantie : multiplier, ou JEL_TR.flottant.carre)'],
  [/\b(?:document|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|RTCPeerConnection|parent|top)\b/, 'accès à la page ou au réseau'],
  [/\beval\b|\bnew\s+Function\b/, 'eval'], [/\bfor\s*\([^)]*\bin\b/, 'boucle for…in (ordre non garanti)'],
  [/\bJEL_SAVE\b|\bFMG\b/, 'module du site'],
];
const sansCommentaires = (texte) => texte.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');

titre('1. Mots interdits');
{
  let fautes = 0;
  for (const id of BLOCS) {
    if (SANS_INTERDITS.has(id)) continue;
    const texte = sansCommentaires(blocs[id]);
    for (const [re, nom] of INTERDITS) {
      const m = re.exec(texte);
      if (m) { fautes++; probleme(id, `${nom} interdit (« ${m[0]} »)`); }
    }
    if (/https?:\/\//.test(texte)) { fautes++; probleme(id, 'adresse http(s):// interdite'); }
    if (/\b(?:alert|confirm|prompt)\s*\(|window\.open\b/.test(texte)) { fautes++; probleme(id, 'alert/confirm/prompt/window.open interdits'); }
  }
  if (!fautes) ok(`aucun mot interdit dans ${BLOCS.filter((b) => !SANS_INTERDITS.has(b)).join(', ')} (${INTERDITS.length} règles ; pe-pilote exclu : c'est la boucle)`);
}

// --------------------------------------------------------------------------
// Deux contextes : « nu » (PE_OUTILS seul, celui du jeu publié) et « moteur » (window.JEL_TR).
// --------------------------------------------------------------------------

let NU, MOTEUR;
try {
  NU = evaluerBlocs(blocs, BLOCS, {});
  MOTEUR = evaluerBlocs(blocs, ['pe-outils', 'pe-donnees', 'pe-sim'], { JEL_TR: TR });
} catch (e) {
  probleme('évaluation', e.message);
  sortir();
}
const simNu = NU.JEL_SIM, simTR = MOTEUR.JEL_SIM, D = NU.PE_DONNEES, OUTILS = NU.PE_OUTILS, PILOTE = NU.PE_PILOTE;

// --------------------------------------------------------------------------
// --controle : série de contrôle (contrat du lot 3, section 4), graines jamais utilisées pour régler
// --------------------------------------------------------------------------

if (AVEC_CONTROLE) {
  const N = 100, debut = Date.now(), taches = serie(80, (i) => ({ m: 21 + i, niveau: 2, graines: serie(N, (x) => 600000 + 1000 * (21 + i) + x) }));
  titre(`Série de contrôle : robot 2 à la place du joueur, missions 21 à 100, ${N} graines (${NB_FILS} fils ; objectif ≥ 65 %)`);
  const lots = await lancerLots(taches), taux = [];
  taches.forEach((t, i) => {
    const r = bilanLot(lots[i], `mission ${t.m}`), v = pct(r.v, r.n); taux.push(v);
    const ligne = `mission ${t.m} : ${v} % (${r.v} / ${r.n}), médiane ${mediane(r.t)} ticks`;
    if (v < 65) avertir('contrôle', `${ligne} : sous les 65 % visés`); else ok(ligne);
  });
  console.log(`\nContrôle : minimum ${Math.min(...taux)} %, moyenne ${Math.round(taux.reduce((a, b) => a + b, 0) / taux.length)} %, ${taux.filter((v) => v < 65).length} mission(s) sous 65 %, ${Math.round((Date.now() - debut) / 1000)} s`);
  sortir();
}

// --------------------------------------------------------------------------
// 2. PE_OUTILS identique au moteur
// --------------------------------------------------------------------------

titre('2. PE_OUTILS recopié du moteur');
{
  if (!OUTILS || typeof OUTILS !== 'object') { probleme('pe-outils', 'window.PE_OUTILS absent'); sortir(); }
  for (const f of ['copie', 'tirer', 'aleaDe', 'racineEntiere', 'div', 'sinus', 'cosinus', 'hacher', 'premierFlottant', 'ordreBienForme', 'trierOrdres']) {
    if (typeof OUTILS[f] !== 'function') probleme('pe-outils', `PE_OUTILS.${f} absent (contrat, section 2)`);
  }
  // Valeurs d'essai : nombres entiers petits et grands, négatifs, à virgule, chaînes, tableaux, objets
  // aux clés dans un ordre différent, null, booléens.
  const gen = TR.aleaDe({ a: 0xA11CE });
  const valeurs = [];
  for (let i = 0; i < 1000; i++) {
    const r = gen(10);
    if (r === 0) valeurs.push(gen(1000000) - 500000);
    else if (r === 1) valeurs.push(gen(1 << 30) * 4096 + gen(4096));
    else if (r === 2) valeurs.push((gen(100000) - 50000) / 7);
    else if (r === 3) valeurs.push(`t${gen(100000)}`);
    else if (r === 4) valeurs.push([gen(50), gen(50), [gen(9), -gen(9)], null, true]);
    else if (r === 5) valeurs.push({ b: gen(100), a: [gen(10), { z: gen(3), y: gen(3) }], c: false });
    else if (r === 6) valeurs.push({ z: gen(100), a: { k: gen(1000), j: [gen(7)] }, m: null });
    else if (r === 7) valeurs.push([{ i: gen(999), c: gen(6), n: gen(500), d: gen(60), v: gen(60), q: gen(40), L: gen(40) }]);
    else if (r === 8) valeurs.push(gen(2) ? null : -gen(1000));
    else valeurs.push({ p: Array.from({ length: gen(20) + 1 }, () => gen(6) - 1), f: Array.from({ length: gen(20) + 1 }, () => gen(600)) });
  }
  let ecarts = 0;
  if (typeof OUTILS.hacher === 'function') {
    for (const v of valeurs) if (OUTILS.hacher(v) !== TR.hacher(v)) { if (!ecarts++) probleme('pe-outils', `hacher diffère du moteur sur ${JSON.stringify(v).slice(0, 60)} (${OUTILS.hacher(v)} / ${TR.hacher(v)})`); }
    if (!ecarts) ok('hacher : mêmes empreintes que le moteur sur 1 000 valeurs');
  }
  if (typeof OUTILS.tirer === 'function') {
    let diff = 0;
    for (const g of [0, 1, 777, 12345, 0xC0FFEE, 0xFFFFFFFF]) {
      const a = { a: g }, b = { a: g };
      for (let i = 0; i < 1000; i++) if (OUTILS.tirer(a) !== TR.tirer(b) || a.a !== b.a) { diff++; break; }
    }
    if (diff) probleme('pe-outils', `tirer : suite différente du moteur (${diff} graine(s) sur 6)`);
    else ok('tirer : mêmes suites que le moteur (6 graines × 1 000 tirages)');
  }
  if (typeof OUTILS.aleaDe === 'function') {
    const a = OUTILS.aleaDe({ a: 4242 }), b = TR.aleaDe({ a: 4242 });
    let diff = 0;
    for (let i = 0; i < 1000; i++) { const n = (i % 97) + 1; if (a(n) !== b(n)) diff++; }
    if (diff) probleme('pe-outils', `aleaDe : ${diff} tirages différents du moteur sur 1 000`);
    else ok('aleaDe : mêmes tirages que le moteur sur 1 000 appels');
  }
  if (typeof OUTILS.sinus === 'function' && typeof OUTILS.cosinus === 'function') {
    let diff = 0;
    for (let i = -500; i < 500; i++) if (OUTILS.sinus(i) !== TR.sinus(i) || OUTILS.cosinus(i) !== TR.cosinus(i)) diff++;
    if (diff) probleme('pe-outils', `sinus/cosinus : ${diff} valeurs différentes du moteur sur 1 000 directions`);
    else ok('sinus et cosinus : mêmes valeurs que le moteur sur 1 000 directions (−500 à 499)');
  }
  if (typeof OUTILS.racineEntiere === 'function' && typeof OUTILS.div === 'function') {
    let diff = 0;
    for (let i = 0; i < 1000; i++) {
      const n = i < 500 ? i * 37 : gen(1 << 30), b = gen(50) - 25;
      if (OUTILS.racineEntiere(n) !== TR.racineEntiere(n) || OUTILS.div(n - 500, b) !== TR.div(n - 500, b)) diff++;
    }
    if (diff) probleme('pe-outils', `racineEntiere/div : ${diff} valeurs différentes du moteur sur 1 000`);
    else ok('racineEntiere et div : mêmes valeurs que le moteur sur 1 000 nombres');
  }
  if (typeof OUTILS.ordreBienForme === 'function') {
    const essais = [[1, 2, 3, 50], [0, 1], [1.5, 2], [], [1], [-1, 2], [1, 1000001], Array(201).fill(1), null, [1, 'a']];
    const diff = essais.filter((o) => OUTILS.ordreBienForme(o) !== TR.ordreBienForme(o)).length;
    if (diff) probleme('pe-outils', `ordreBienForme : ${diff} verdicts différents du moteur`);
    else ok('ordreBienForme : mêmes verdicts que le moteur');
  }
}

// --------------------------------------------------------------------------
// 3. Interfaces du contrat (JEL_SIM, PE_DONNEES, PE_PILOTE)
// --------------------------------------------------------------------------

titre('3. Interfaces du contrat');
{
  let fautes = 0;
  const f = (sujet, texte) => { fautes++; probleme(sujet, texte); };
  if (!simNu || typeof simNu !== 'object') { f('pe-sim', 'window.JEL_SIM absent'); sortir(); }
  if (NU.PE_SIM !== simNu) f('pe-sim', 'window.PE_SIM doit être le même objet que window.JEL_SIM');
  for (const p of TR.problemesSim(simNu)) f('pe-sim', `JEL_TR.problemesSim : ${p}`);
  if (simNu.camps !== 6) f('pe-sim', `camps : 6 attendus, ${simNu.camps} obtenu`);
  if (simNu.periodeBot !== 5) f('pe-sim', `periodeBot : 5 attendu, ${simNu.periodeBot} obtenu`);
  if (!simNu.reglages || simNu.reglages.tickMs !== 100 || simNu.reglages.delaiEntree !== 1) f('pe-sim', `reglages : { tickMs: 100, delaiEntree: 1 } attendu, ${JSON.stringify(simNu.reglages)} obtenu`);
  for (const fn of ['exporter', 'importer', 'empreinte', 'configMission', 'chemin', 'duree', 'defense', 'prevision', 'generer']) {
    if (typeof simNu[fn] !== 'function') f('pe-sim', `fonction JEL_SIM.${fn} absente (contrat, section 4.1)`);
  }
  if (simNu.flottants) f('pe-sim', 'flottants: true interdit (état entièrement entier)');
  if (!simNu.modes || !Array.isArray(simNu.cartes)) f('pe-sim', 'modes et cartes attendus (parties à plusieurs, cadrage section 21)');
  const es = simNu.essais;
  if (!es || typeof es !== 'object') f('pe-sim', 'JEL_SIM.essais absent');
  else {
    if (typeof es.ordres !== 'function') f('pe-sim', 'essais.ordres(etat, camp, alea, paisible) absent');
    if (typeof es.variete !== 'function') f('pe-sim', 'essais.variete(etat) absent');
    for (const [cle, attendu] of [['parties', 12], ['equite', 30], ['ticksFin', 20000]]) if (es[cle] !== attendu) f('pe-sim', `essais.${cle} : ${attendu} attendu, ${es[cle]} obtenu`);
  }
  if (!PILOTE || typeof PILOTE !== 'object') f('pe-pilote', 'window.PE_PILOTE absent');
  else {
    if (typeof PILOTE.Simulation !== 'function') f('pe-pilote', 'PE_PILOTE.Simulation (recopie de la classe du moteur) absente');
    else for (const m of ['avancer', 'instantane', 'hachage', 'restaurer', 'k']) if (typeof PILOTE.Simulation.prototype[m] !== 'function') f('pe-pilote', `PE_PILOTE.Simulation.prototype.${m} absent`);
    if (typeof PILOTE.PiloteLocal !== 'function') f('pe-pilote', 'PE_PILOTE.PiloteLocal absent');
  }
  if (!D || typeof D !== 'object') { f('pe-donnees', 'window.PE_DONNEES absent'); sortir(); }
  if (D.version !== 1) f('pe-donnees', `version : 1 attendue, ${D.version} obtenue`);
  if (D.camps !== 6) f('pe-donnees', `camps : 6 attendus, ${D.camps} obtenu`);
  if (!Array.isArray(D.factions) || D.factions.length < 3) f('pe-donnees', `factions : au moins 3 attendues (Aube, Cendrés, Pionniers), ${Array.isArray(D.factions) ? D.factions.length : 'aucune'}`);
  else if (D.factions[0].id !== 'aube') f('pe-donnees', `factions[0] : « aube » (le joueur) attendu, « ${D.factions[0].id} » obtenu`);
  if (!Array.isArray(D.robots) || D.robots.length !== 4 || D.robots[0] !== null || [1, 2, 3].some((n) => !D.robots[n] || !Number.isInteger(D.robots[n].ratio))) f('pe-donnees', 'robots : [ null, ROBOT_1, ROBOT_2, ROBOT_3 ] attendu');
  if (!Array.isArray(D.capacites) || D.capacites.length !== 10) f('pe-donnees', `capacites : 10 attendues, ${Array.isArray(D.capacites) ? D.capacites.length : 'aucune'}`);
  if (!Array.isArray(D.echelles) || D.echelles.length !== 6 || D.echelles[0] !== null || !D.echelles[1] || !D.echelles[1].types) f('pe-donnees', 'echelles : [ null, ECHELLE_1 … ECHELLE_5 ] attendu');
  else for (const t of ['plaine', 'montagne', 'cratere', 'calotte', 'capitale']) if (!D.echelles[1].types[t]) f('pe-donnees', `echelles[1].types.${t} absent`);
  if (!Array.isArray(D.missions) || D.missions.length !== NB_FICHES) f('pe-donnees', `missions : ${NB_FICHES} fiches attendues, ${Array.isArray(D.missions) ? D.missions.length : 'aucune'}`);
  else {
    D.missions.forEach((fiche, i) => {
      const m = i + 1;
      if (!fiche || fiche.m !== m) { f('pe-donnees', `missions[${i}] : m = ${m} attendu`); return; }
      if (m <= NB_JOUABLES) {
        if (fiche.acte !== 1 + Math.floor((m - 1) / 20)) f('pe-donnees', `mission ${m} : acte ${1 + Math.floor((m - 1) / 20)} attendu`);
        if (!fiche.carte || !(fiche.carte.forme === 3 || (fiche.carte.forme === 1 && fiche.carte.rayon >= 2 && fiche.carte.rayon <= 4))) f('pe-donnees', `mission ${m} : carte { forme: 3 } (zone de la planète) ou { forme: 1, rayon: 2 à 4 } attendue`);
        if (fiche.carte && fiche.carte.forme === 3 && !(Array.isArray(fiche.cibles) && fiche.cibles.length)) f('pe-donnees', `mission ${m} : cibles (provinces) attendues sur une mission planète`);
        if (fiche.carte && fiche.carte.forme === 3 && !(Number.isInteger(fiche.dv) && fiche.dv > 0)) f('pe-donnees', `mission ${m} : dv (durée visée, secondes) attendue`);
        if (!Array.isArray(fiche.camps) || !fiche.camps.length || fiche.camps[0].fa !== 0 || fiche.camps[0].ctl !== 0) f('pe-donnees', `mission ${m} : camps[0] = le joueur ({ fa: 0, ctl: 0, … }) attendu`);
        else if (fiche.camps.some((c, j) => j > 0 && !(c.ctl >= 1 && c.ctl <= 3))) f('pe-donnees', `mission ${m} : les rivaux ont un ctl de 1 à 3`);
        if (!fiche.objectif || !Number.isInteger(fiche.objectif.t)) f('pe-donnees', `mission ${m} : objectif { t, … } attendu`);
        if (![5, 6, 8, 10].includes(fiche.objectif && fiche.objectif.t) && !(Number.isInteger(fiche.tmax) && fiche.tmax > 0)) f('pe-donnees', `mission ${m} : tmax entier attendu`);
        if (!(Number.isInteger(fiche.tvise) && fiche.tvise > 0)) f('pe-donnees', `mission ${m} : tvise entier attendu`);
        // Règle du 17 novembre 2026 : objectif à durée fixe → tvise = d (sans effet) ; sinon tmax ≥ 3 × tvise.
        if ([5, 6, 8, 10].includes(fiche.objectif && fiche.objectif.t)) { if (fiche.tvise !== (fiche.objectif.d | 0)) f('pe-donnees', `mission ${m} : objectif à durée fixe, tvise = d (${fiche.objectif.d}) attendu`); }
        else if (Number.isInteger(fiche.tmax) && fiche.tmax < 3 * fiche.tvise) f('pe-donnees', `mission ${m} : tmax ≥ 3 × tvise attendu (${fiche.tmax} < ${3 * fiche.tvise})`);
        if (Array.isArray(fiche.camps)) fiche.camps.forEach((c, j) => {
          if (!c.perso) return;
          if (!(c.perso.cibles >= 0 && c.perso.cibles <= 3)) f('pe-donnees', `mission ${m}, camp ${j} : perso.cibles 0 à 3 attendu`);
          if (c.perso.offensive && ![undefined, 0, 1].includes(c.perso.offensive.cible)) f('pe-donnees', `mission ${m}, camp ${j} : perso.offensive.cible absent, 0 ou 1 attendu`);
          if (c.perso.offensive && !(c.perso.offensive.annonce > 0 && c.perso.offensive.annonce < c.perso.offensive.periode && c.perso.offensive.annonce % 10 === 0)) f('pe-donnees', `mission ${m}, camp ${j} : perso.offensive.annonce multiple de 10 et < periode attendu`);
        });
        if (m <= 3 && !(Number.isInteger(fiche.graine) && fiche.graine > 0)) f('pe-donnees', `mission ${m} : graine fixe attendue (missions 1 à 3)`);
        if (m >= 4 && fiche.graine !== 0) f('pe-donnees', `mission ${m} : graine 0 attendue (tirée au lancement)`);
      } else if (fiche.verrou !== 1 || fiche.acte !== 1 + Math.floor((m - 1) / 20)) f('pe-donnees', `mission ${m} : fiche « verrou » { m, acte: ${1 + Math.floor((m - 1) / 20)}, verrou: 1 } attendue`);
    });
  }
  if (!D.silhouette2 || !Array.isArray(D.silhouette2.corps)) f('pe-donnees', 'silhouette2 { orbites, corps } attendue');
  if (Array.isArray(D.capacites)) for (const c of D.capacites) if (CAPACITE_MISSION[c.id] !== c.mission) f('pe-donnees', `capacité ${c.id} : gagnée à la mission ${CAPACITE_MISSION[c.id]} attendue (${c.mission} obtenue)`);
  if (!Array.isArray(D.planetes) || D.planetes[0] !== null || [1, 2, 3, 4, 5].some((a) => !D.planetes[a])) f('pe-donnees', 'planetes : [ null, PLANETE_1, SYSTEME, AMAS, GALAXIE, TOILE ] attendu (contrats des lots 2 et 3)');
  for (const fa of [7, 8, 9, 10, 11]) if (!D.factions[fa] || !D.factions[fa].perso) f('pe-donnees', `faction ${fa} : personnalité attendue (contrat du lot 3)`);
  if (typeof simNu.configBac !== 'function' || typeof simNu.planeteBac !== 'function' || typeof simNu.graineSuivante !== 'function') f('pe-sim', 'configBac, planeteBac, graineSuivante attendus (contrat du lot 3, section 5)');
  if (!D.bac) f('pe-donnees', 'bac attendu (réglages du bac à sable)');
  if (!D.pulsar || D.pulsar.periode !== 200 || D.pulsar.ferme !== 50) f('pe-donnees', 'pulsar { periode: 200, ferme: 50 } attendu');
  if (!D.silhouettes || !D.silhouettes[4] || !Array.isArray(D.silhouettes[4].points) || !D.silhouettes[4].points.length) f('pe-donnees', 'silhouettes[4] { points } attendue (galaxie, après l\'acte 3)');
  for (const fn of ['planete', 'proprietaires', 'conquetes', 'missionsActe', 'position']) if (typeof simNu[fn] !== 'function') f('pe-sim', `aide JEL_SIM.${fn} absente (contrat v2, section 3)`);
  if (!D.vitesse || !Array.isArray(D.vitesse.V)) f('pe-donnees', 'vitesse { V: [ null, … ] } attendue');
  if (!fautes) ok(`JEL_SIM (camps 6, periodeBot 5, réglages, aides pures dont planete, proprietaires, conquetes, missionsActe, essais), PE_PILOTE (Simulation, PiloteLocal) et PE_DONNEES (${NB_FICHES} fiches, ${NB_JOUABLES} complètes, capacités renumérotées, trois cartes) conformes au contrat`);
  if (fautes) { console.log('\nInterfaces non conformes : les contrôles suivants seraient trompeurs.'); sortir(); }
}

// La mission à la plus grande zone (contrôles 4, 6, 7 et 9) : le plus de régions actives.
let GRANDE = 1, tailleGrande = 0;
for (let m = 1; m <= NB_MISSIONS; m++) {
  try { const c = simNu.configMission(m, { graine: 1 }); const e = simNu.depart(c.graine, c); if (e.nn > tailleGrande) { tailleGrande = e.nn; GRANDE = m; } }
  catch (err) { probleme(`mission ${m}`, `depart : ${err.message}`); }
}
console.log(`\nPlus grande zone de mission : mission ${GRANDE} (${tailleGrande} régions)`);

// --------------------------------------------------------------------------
// Aides : configurations, journal, rejeu
// --------------------------------------------------------------------------

// Configuration d'une mission (ctl0 : qui tient le camp du joueur ; 0 humain, 1 à 3 robot).
function configMission(sim, m, graine, ctl0 = 0) {
  const fiche = D.missions[m - 1];
  const g = fiche.graine || graine;
  let cfg;
  try { cfg = sim.configMission(m, { graine: g, vent: 0 }); } catch (e) { cfg = null; }
  if (!cfg || typeof cfg !== 'object') cfg = { mission: m, graine: g, vent: 0, ctl: fiche.camps.map((c) => c.ctl) };
  if (!Array.isArray(cfg.ctl)) cfg.ctl = fiche.camps.map((c) => c.ctl);
  cfg = copie(cfg);
  cfg.ctl[0] = ctl0;
  return cfg;
}
// Carte « ligne » : 2 camps. camps est lu par JEL_TR.Simulation (campsDe : sans lui, le moteur
// crée sim.camps = 6 entrées ctl) ; pe-sim.depart le lit aussi (2 par défaut pour la ligne).
const configLigne = (ctl) => ({ ligne: 1, ctl: ctl.slice(), camps: ctl.length });
const nomConfig = (cfg) => (cfg.bac ? `bac ${cfg.bac.taille} (${cfg.bac.rivaux} rivaux, niveau ${cfg.bac.niveau})` : cfg.ligne ? `« ligne » (ctl ${cfg.ctl.join('/')})` : `mission ${cfg.mission} (carte ${cfg.graine}, ctl ${cfg.ctl.join('/')})`);

// Hasard du test (jamais celui de l'état) : alea(n) → entier de 0 à n − 1, déterministe par graine.
const hasardTest = (graine) => TR.aleaDe({ a: (graine ^ 0x5bd1e995) >>> 0 });

// Ordres de l'humain d'essai pour un camp (essais.ordres ne modifie pas l'état).
function ordresEssai(sim, etat, camp, alea, paisible = false) {
  let o;
  try { o = sim.essais.ordres(etat, camp, alea, paisible); } catch (e) { probleme('essais.ordres', `exception : ${e.message}`); return []; }
  if (!Array.isArray(o)) { probleme('essais.ordres', `un tableau d'ordres est attendu (${typeof o})`); return []; }
  return o;
}

// Joue une partie sous une classe Simulation (celle du moteur ou celle du pilote) avec un journal
// déjà écrit : [[k, ordres], …]. Renvoie la simulation et ses hachages de contrôle [[k, h], …].
function rejouer(Classe, sim, graine, config, journal, depuis = null) {
  const s = new Classe(sim, depuis ? 1 : graine, copie(config));
  if (depuis) s.restaurer(copie(depuis));
  const hashes = [];
  for (const [k, o] of journal) {
    if (depuis && k <= depuis.k) continue;
    const h = s.avancer(o);
    if (h) hashes.push([k, h]);
  }
  return { s, hashes };
}
function memesHashes(a, b) {
  if (a.length !== b.length) return `${a.length} / ${b.length} hachages de contrôle`;
  for (let i = 0; i < a.length; i++) if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return `tick ${a[i][0]} : ${a[i][1]} / ${b[i][1]}`;
  return null;
}

// --------------------------------------------------------------------------
// 4, 5, 6. Rejeu, états entiers, exporter/importer
// --------------------------------------------------------------------------

titre(`4. Rejeu (${TICKS} ticks par configuration, ordres de essais.ordres pour le camp 0 tous les 7 ticks)`);
const CONFIGS = [
  ['mission 4, graine 777', () => configMission(simTR, 4, 777, 0), 777],
  [`mission ${GRANDE}, graine 4242`, () => configMission(simTR, GRANDE, 4242, 0), 4242],
  ['ligne, graine 12345', () => configLigne([0, 3]), 12345],
];
let msTickTotal = 0, ticksTotal = 0, tailleMax = 0;
// nbTicks, tickSnap : longueur de la partie, tick de l'instantané ; cumuler : compte dans les mesures de l'acte 1.
// ordresSup (facultatif) : (sim, etat, k) → ordres de plus pour le camp 0 (capacités des actes 4 et 5).
function controleRejeu(nom, faireConfig, graine, nbTicks, tickSnap, cumuler, ordresSup = null) {
  const sujet = `rejeu ${nom}`;
  let config;
  try { config = faireConfig(); } catch (e) { probleme(sujet, `configuration impossible : ${e.message}`); return; }
  let s;
  try { s = new TR.Simulation(simTR, graine, copie(config)); } catch (e) { probleme(sujet, `depart : ${e.message}`); return; }
  const camps = s.etat.ctl.length;
  if (camps !== config.ctl.length) probleme(sujet, `${camps} camps dans l'état, ${config.ctl.length} dans la configuration`);
  if (s.etat.ctl[0] !== 0) { probleme(sujet, 'le camp 0 doit être humain (ctl[0] = 0) pour recevoir les ordres d\'essai'); return; }
  const cad = new TR.Cadenceur({ camps, systeme: simTR.camps, delai: s.r.delaiEntree, depart: 0, envoyer: () => {} });
  const alea = hasardTest(graine);
  const journal = [], hashes = [];
  let seq = 0, snap = null, flottant = null, nbOrdres = 0, refuses = 0;
  const t0 = performance.now();
  let msAvancer = 0;
  for (let k = 0; k < nbTicks && !s.resultat; k++) {
    if (k % 7 === 0) for (const o of ordresEssai(simTR, s.etat, 0, alea)) { if (cad.recevoir(0, ++seq, o)) nbOrdres++; else refuses++; }
    if (ordresSup) for (const o of ordresSup(simTR, s.etat, k)) { if (cad.recevoir(0, ++seq, o)) nbOrdres++; else refuses++; }
    if (k === 1500 && camps > 1) cad.controle(1, 3);                 // le camp 1 change de robot en cours de partie
    if (k % 13 === 0) cad.recevoir(0, ++seq, [9, 9999, 0, 0]);       // ordre mal formé pour le jeu : ignoré par valide
    const paquet = cad.pas();
    journal.push([paquet.k, paquet.o]);
    const t1 = performance.now();
    const h = s.avancer(paquet.o);
    msAvancer += performance.now() - t1;
    if (h) hashes.push([paquet.k, h]);
    if (!flottant) flottant = TR.premierFlottant(s.etat);
    if (s.etat.k === tickSnap) snap = copie(s.instantane());
  }
  const joues = journal.length;
  if (cumuler) { msTickTotal += msAvancer; ticksTotal += joues; }
  const fini = s.resultat ? ` (partie finie au tick ${s.k()} : raison ${s.resultat.raison}, gagnant ${s.resultat.gagnant})` : '';
  if (refuses) probleme(sujet, `${refuses} ordres de essais.ordres mal formés (JEL_TR.ordreBienForme)`);
  // 5. État entier.
  if (flottant) probleme(sujet, `état non entier : ${flottant}`);
  else ok(`${sujet} : état entièrement entier après chacun des ${joues} ticks`);
  // 4. Rejeu deux fois.
  const a = rejouer(TR.Simulation, simTR, graine, config, journal), b = rejouer(TR.Simulation, simTR, graine, config, journal);
  const ha = a.s.hachage(), hb = b.s.hachage(), hs = s.hachage();
  let ecart = memesHashes(hashes, a.hashes) || memesHashes(a.hashes, b.hashes);
  if (ha !== hb || ha !== hs) probleme(sujet, `déterminisme : rejeu différent (${hs} / ${ha} / ${hb})`);
  else if (ecart) probleme(sujet, `déterminisme : hachages de contrôle différents (${ecart})`);
  else ok(`${sujet} : ${joues} ticks, ${nbOrdres} ordres, rejoué deux fois → ${hashes.length} hachages de contrôle et état final identiques (${ha})${fini}`);
  // 4. Reprise depuis l'instantané du tick 3 000 (ou du milieu si la partie a fini avant).
  if (!snap) {
    const milieu = Math.floor(joues / 2);
    snap = copie(rejouer(TR.Simulation, simTR, graine, config, journal.slice(0, milieu)).s.instantane());
  }
  if (snap.etat && snap.etat.m !== undefined) probleme(sujet, 'instantané : la carte m doit être exclue de exporter(etat)');
  const c = rejouer(TR.Simulation, simTR, graine, config, journal, snap);
  ecart = memesHashes(hashes.filter(([k]) => k > snap.k), c.hashes);
  if (c.s.hachage() !== hs) probleme(sujet, `reprise : rejouer depuis l'instantané du tick ${snap.k} ne donne pas le même état (${c.s.hachage()} / ${hs})`);
  else if (ecart) probleme(sujet, `reprise : hachages de contrôle différents après le tick ${snap.k} (${ecart})`);
  else ok(`${sujet} : reprise depuis l'instantané du tick ${snap.k} → même état final`);
  // 4. Le même journal sous PE_PILOTE.Simulation, dans le contexte nu (PE_OUTILS seul).
  try {
    const p = rejouer(PILOTE.Simulation, simNu, graine, config, journal);
    const hp = typeof p.s.hachage === 'function' ? p.s.hachage() : null;
    ecart = memesHashes(hashes, p.hashes);
    if (hp !== hs) probleme(sujet, `PE_PILOTE.Simulation (sans JEL_TR) : état final différent (${hp} / ${hs}) : la copie des outils ou de la classe Simulation n'est pas exacte`);
    else if (ecart) probleme(sujet, `PE_PILOTE.Simulation : hachages de contrôle différents (${ecart})`);
    else {
      const q = rejouer(PILOTE.Simulation, simNu, graine, config, journal, snap);
      if (q.s.hachage() !== hs) probleme(sujet, `PE_PILOTE.Simulation : reprise depuis l'instantané différente (${q.s.hachage()} / ${hs})`);
      else ok(`${sujet} : même journal sous PE_PILOTE.Simulation avec PE_OUTILS seul → mêmes ${p.hashes.length} hachages, même état final, même reprise`);
    }
  } catch (e) { probleme(sujet, `PE_PILOTE.Simulation : ${e.message}`); }
  // 6. exporter / importer.
  try {
    const exp = simNu.exporter(s.etat);
    if (exp.m !== undefined) probleme(sujet, 'exporter(etat) ne doit pas contenir m');
    const texte = JSON.stringify(exp);
    const rebati = simNu.importer(JSON.parse(texte));
    const h1 = TR.hacher(simNu.empreinte(s.etat)), h2 = TR.hacher(simNu.empreinte(rebati));
    if (h1 !== h2) probleme(sujet, `importer(exporter(etat)) : empreinte différente (${h2} / ${h1})`);
    else if (JSON.stringify(simNu.exporter(rebati)) !== texte) probleme(sujet, 'exporter(importer(x)) ne redonne pas x');
    else if (!rebati.m || !Number.isInteger(rebati.m.n) || rebati.m.n !== s.etat.nn) probleme(sujet, `importer : carte m non régénérée (m.n ${rebati.m && rebati.m.n} / nn ${s.etat.nn})`);
    else ok(`${sujet} : importer(exporter(etat)) → même empreinte, carte régénérée (${texte.length} caractères, ${s.etat.fl.length} flottes en vol)`);
    tailleMax = Math.max(tailleMax, texte.length);
  } catch (e) { probleme(sujet, `exporter/importer : ${e.message}`); }
  console.log(`     ${ms(msAvancer / Math.max(1, joues))} par tick (${nomConfig(config)}, ${s.etat.nn} territoires), ${Math.round(performance.now() - t0)} ms en tout`);
}
for (const [nom, faireConfig, graine] of CONFIGS) controleRejeu(nom, faireConfig, graine, TICKS, TICK_INSTANTANE, true);
const mesures = {};   // chiffres du résumé final
mesures.msTickRejeu = ticksTotal ? msTickTotal / ticksTotal : 0;
console.log(`     en moyenne ${ms(mesures.msTickRejeu)} par tick sur ${ticksTotal} ticks rejoués ; plus gros instantané : ${tailleMax} caractères`);

// Joue une simulation sans ordre humain (robots seuls) jusqu'à la fin ou à maxTicks ; renvoie la simulation.
// mesure (facultatif) : { ms, max, ticks } rempli avec le coût de chaque avancer().
function jouerSeul(sim, graine, config, maxTicks, mesure = null) {
  const s = new TR.Simulation(sim, graine, copie(config));
  while (!s.resultat && s.k() < maxTicks) {
    if (mesure) { const t1 = performance.now(); s.avancer([]); const dt = performance.now() - t1; mesure.ms += dt; mesure.max = Math.max(mesure.max, dt); mesure.ticks++; }
    else s.avancer([]);
  }
  return s;
}
// Joue une simulation où le camp 0 est l'humain d'essai (essais.ordres tous les `tous` ticks).
function jouerEssai(sim, graine, config, maxTicks, tous, paisible = false) {
  const s = new TR.Simulation(sim, graine, copie(config));
  const alea = hasardTest(graine);
  let seq = 0;
  while (!s.resultat && s.k() < maxTicks) {
    const liste = s.k() % tous === 0 ? ordresEssai(sim, s.etat, 0, alea, paisible).map((o) => [0, ++seq, ...o]) : [];
    s.avancer(liste);
  }
  return s;
}
const decrireFin = (s) => (s.resultat ? `tick ${s.k()}, raison ${s.resultat.raison}, gagnant ${s.resultat.gagnant}` : `aucune fin au tick ${s.k()}`);
const raisonsDe = (r) => Object.entries(r).map(([k, v]) => `raison ${k} × ${v}`).join(', ');

// --------------------------------------------------------------------------
// 6 (suite). Instantané de la plus grande carte avec 300 flottes
// --------------------------------------------------------------------------

titre(`6. Instantané de la plus grande zone (mission ${GRANDE}, ${tailleGrande} régions) avec 300 flottes`);
{
  const sujet = 'instantané 300 flottes';
  try {
    const graine = 9001;
    const config = configMission(simTR, GRANDE, graine, 0);
    config.ctl = config.ctl.map(() => 0);                       // tous les camps humains : l'humain d'essai envoie partout
    const s = new TR.Simulation(simTR, graine, config);
    const alea = hasardTest(graine);
    let seq = 0, maxFl = 0, maxSg = 0;
    for (let k = 0; k < 600 && !s.resultat; k++) {
      const liste = [];
      for (let c = 0; c < s.etat.ctl.length; c++) for (const o of ordresEssai(simTR, s.etat, c, alea)) liste.push([c, ++seq, ...o]);
      s.avancer(liste);
      maxFl = Math.max(maxFl, s.etat.fl.length); maxSg = Math.max(maxSg, s.etat.sg.length);
    }
    // Les ordres d'essai n'entretiennent jamais 300 flottes à la fois : l'état est complété
    // jusqu'à 300 flottes (copies des flottes en vol, identifiants neufs) pour mesurer la
    // taille maximale d'un instantané.
    const e = s.etat;
    const modele = e.fl.length ? e.fl.slice() : [{ i: 0, c: 0, n: 7, d: 0, v: 1, q: 1, L: 12 }];
    while (e.fl.length < 300) { const f = modele[e.fl.length % modele.length]; e.fl.push({ i: e.nf++, c: f.c, n: f.n, d: f.d, v: f.v, q: f.q, L: f.L }); }
    const texte = JSON.stringify(simNu.exporter(e));
    const rebati = simNu.importer(JSON.parse(texte));
    mesures.tailleInstantane = texte.length;
    if (TR.hacher(simNu.empreinte(rebati)) !== TR.hacher(simNu.empreinte(e))) probleme(sujet, 'importer(exporter(etat)) : empreinte différente avec 300 flottes');
    else if (texte.length >= 25000) probleme(sujet, `${texte.length} caractères (< 25 000 attendus ; ${e.nn} territoires, 300 flottes, ${e.sg.length} sièges)`);
    else ok(`${sujet} : ${texte.length} caractères (${e.nn} territoires, 300 flottes, ${e.sg.length} sièges ; jusqu'à ${maxFl} flottes et ${maxSg} sièges réellement en vol en 600 ticks avec ${e.ctl.length} humains d'essai)`);
  } catch (err) { probleme(sujet, err.message); }
}

// --------------------------------------------------------------------------
// 7. Coût d'un tick sur la plus grande carte avec des robots de niveau 3
// --------------------------------------------------------------------------

titre(`7. Coût d'un tick (mission ${GRANDE}, ${tailleGrande} régions, robots de niveau 3 à toutes les places, 2 000 ticks)`);
{
  const sujet = 'coût';
  try {
    const nbCamps = D.missions[GRANDE - 1].camps.length;
    if (nbCamps < 5) avertir(sujet, `la fiche de la mission ${GRANDE} n'a que ${nbCamps} camps : le contrat demande 5 robots sur la plus grande carte, la mesure porte sur ${nbCamps} robots de niveau 3 (un camp sans fiche naît mort : config.camps ne peut pas en ajouter)`);
    // Chauffe (JIT) hors mesure : une partie courte.
    { const cfg = configMission(simTR, GRANDE, 4999, 3); cfg.ctl = cfg.ctl.map(() => 3); jouerSeul(simTR, 4999, cfg, 300); }
    const mesure = { ms: 0, max: 0, ticks: 0 };
    let graine = 5001, parties = 0, territoires = 0;
    while (mesure.ticks < 2000 && parties < 50) {
      const cfg = configMission(simTR, GRANDE, graine, 3);
      cfg.ctl = cfg.ctl.map(() => 3);
      const s = jouerSeul(simTR, graine, cfg, 2000 - mesure.ticks, mesure);   // maxTicks par partie : ce qui reste à mesurer
      territoires = s.etat.nn; parties++; graine++;
    }
    const moy = mesure.ms / Math.max(1, mesure.ticks);
    mesures.msTickRobots = moy; mesures.msTickMax = mesure.max;
    const detail = `${ms(moy)} par tick en moyenne (pire tick ${ms(mesure.max)}) sur ${mesure.ticks} ticks, ${parties} partie(s), ${territoires} territoires, ${nbCamps} robots de niveau 3`;
    if (moy > 1) probleme(sujet, `${detail} : plus de 1 ms (0,5 ms visés)`);
    else if (moy > 0.5) avertir(sujet, `${detail} : au-dessus des 0,5 ms visés`);
    else ok(`${sujet} : ${detail} (≤ 0,5 ms)`);
  } catch (err) { probleme(sujet, err.message); }
}

// --------------------------------------------------------------------------
// 8. Duels de robots sur la carte « ligne »
// --------------------------------------------------------------------------

titre(`8. Duels sur la carte « ligne » (${PARTIES} parties par affiche, le robot fort change de côté une partie sur deux)`);
{
  const ticksFin = (simTR.essais && simTR.essais.ticksFin) || 20000;
  // Joue PARTIES duels a contre b ; renvoie { victoiresA, parties, ticks: [], raisons: {} }.
  function duels(a, b, graineBase) {
    const r = { victoiresA: 0, parties: 0, ticks: [], raisons: {} };
    for (let i = 0; i < PARTIES; i++) {
      const aEnZero = i % 2 === 0;                  // le robot a joue le camp 0 une partie sur deux
      const config = configLigne(aEnZero ? [a, b] : [b, a]);
      const s = jouerSeul(simTR, graineBase + i, config, ticksFin + 1);
      if (s.etat.ctl.length !== 2) { probleme('ligne', `${s.etat.ctl.length} camps dans l'état pour la configuration ${JSON.stringify(config)}`); return r; }
      if (!s.resultat) { probleme('ligne', `partie sans fin au tick ${s.k()} (tmax ${s.etat.tmax})`); return r; }
      r.parties++;
      r.ticks.push(s.k());
      r.raisons[s.resultat.raison] = (r.raisons[s.resultat.raison] || 0) + 1;
      if (s.resultat.gagnant === (aEnZero ? 0 : 1)) r.victoiresA++;
      if (DETAIL) console.log(`     duel ${a} contre ${b}, graine ${graineBase + i}, ctl ${config.ctl.join('/')} : gagnant ${s.resultat.gagnant}, raison ${s.resultat.raison}, tick ${s.k()}, ${s.hachage()}`);
    }
    return r;
  }
  mesures.duels = {};
  for (const [a, b, seuil, nom] of [[3, 1, 85, 'niveau 3 contre 1'], [2, 1, 65, 'niveau 2 contre 1'], [3, 2, 0, 'niveau 3 contre 2 (indicatif)']]) {
    const r = duels(a, b, 70000 + a * 100 + b * 10);
    if (!r.parties) continue;
    const taux = pct(r.victoiresA, r.parties);
    mesures.duels[`${a}c${b}`] = taux;
    const detail = `${nom} : ${r.victoiresA} / ${r.parties} (${taux} %), médiane ${mediane(r.ticks)} ticks, ${raisonsDe(r.raisons)}`;
    if (!seuil) ok(`duels ${detail}`);
    else if (taux < seuil) { if (RAPIDE) avertir('duels', `${detail} : sous les ${seuil} % attendus (--rapide : ${PARTIES} parties seulement)`); else probleme('duels', `${detail} : ${seuil} % attendus`); }
    else ok(`duels ${detail}, ≥ ${seuil} %`);
  }
  // Robots égaux : le camp 0 (toujours le même côté) gagne 35 à 65 %, sur essais.equite parties
  // (30, comme tester-temps-reel.mjs ; PARTIES en --rapide). Hors des bornes, une seconde série de
  // même taille départage : le cumul dans les bornes n'est qu'un avertissement (hasard des 30 parties),
  // hors des bornes c'est un problème (biais de côté).
  const N_EQUITE = RAPIDE ? PARTIES : ((simTR.essais && simTR.essais.equite) || 30);
  for (const niveau of [2, 3]) {
    const r = { victoires0: 0, parties: 0, ticks: [], raisons: {} };
    const serie = (depuis, nb) => {
      for (let i = depuis; i < depuis + nb; i++) {
        const s = jouerSeul(simTR, 71000 + niveau * 1000 + i, configLigne([niveau, niveau]), ticksFin + 1);
        if (!s.resultat) { probleme('ligne', `partie sans fin au tick ${s.k()}`); return false; }
        r.parties++; r.ticks.push(s.k()); r.raisons[s.resultat.raison] = (r.raisons[s.resultat.raison] || 0) + 1;
        if (s.resultat.gagnant === 0) r.victoires0++;
      }
      return true;
    };
    if (!serie(0, N_EQUITE) || !r.parties) continue;
    const taux1 = pct(r.victoires0, r.parties);
    let confirme = '';
    if ((taux1 < 35 || taux1 > 65) && serie(N_EQUITE, N_EQUITE)) confirme = ` (première série : ${taux1} %, seconde série jouée pour départager)`;
    const taux = pct(r.victoires0, r.parties);
    mesures.duels[`${niveau}c${niveau}`] = taux;
    const detail = `robots égaux de niveau ${niveau} : camp 0 gagne ${r.victoires0} / ${r.parties} (${taux} %), médiane ${mediane(r.ticks)} ticks, ${raisonsDe(r.raisons)}${confirme}`;
    if (taux < 35 || taux > 65) { if (RAPIDE || niveau !== 2) avertir('équité', `${detail} : 35 à 65 % attendus${RAPIDE ? ` (--rapide : ${PARTIES} parties seulement)` : ''}`); else probleme('équité', `${detail} : 35 à 65 % attendus`); }
    else if (confirme) avertir('équité', `${detail} : 35 à 65 % attendus, cumul dans les bornes`);
    else ok(`équité ${detail}`);
  }
}

// --------------------------------------------------------------------------
// 9. Variété des débuts de partie
// --------------------------------------------------------------------------

titre('9. Variété : 20 graines → 20 débuts différents (essais.variete)');
for (const [nom, faireConfig] of [['mission 4', (g) => configMission(simTR, 4, g, 0)], [`mission ${GRANDE}`, (g) => configMission(simTR, GRANDE, g, 0)], ['ligne', () => configLigne([1, 1])]]) {
  const sujet = `variété ${nom}`;
  try {
    const vues = new Map();
    for (let g = 1; g <= 20; g++) {
      const s = new TR.Simulation(simTR, 2000 + g, faireConfig(2000 + g));
      const v = simTR.essais.variete(s.etat);
      if (!v || !Array.isArray(v.p) || !Array.isArray(v.f)) { probleme(sujet, 'essais.variete doit renvoyer { p: [], f: [] }'); break; }
      const h = TR.hacher(v);
      if (vues.has(h)) probleme(sujet, `graines ${vues.get(h)} et ${2000 + g} : même début de partie (${h})`);
      vues.set(h, 2000 + g);
    }
    if (vues.size === 20) ok(`${sujet} : 20 graines → 20 débuts différents`);
  } catch (err) { probleme(sujet, err.message); }
}

// --------------------------------------------------------------------------
// 10. fin(etat) non nul au plus tard au tick tmax + 1 (partie sans aucun ordre)
// --------------------------------------------------------------------------

titre('10. Fin de partie au plus tard au tick tmax + 1 (aucun ordre, aucun robot)');
{
  let bons = 0, total = 0;
  const cas = D.missions.slice(0, NB_MISSIONS).map((fiche, i) => [`mission ${i + 1}`, () => { const c = configMission(simTR, i + 1, 3001 + i, 0); c.ctl = c.ctl.map(() => 0); return c; }]);
  cas.push(['ligne', () => configLigne([0, 0])]);
  for (const [nom, faireConfig] of cas) {
    const sujet = `fin ${nom}`;
    try {
      const config = faireConfig();
      const s = new TR.Simulation(simTR, 3001, config);
      const tmax = s.etat.tmax;
      if (!(tmax > 0)) { avertir(sujet, `pas de tmax (objectif de type ${s.etat.o.t}) : la fin vient de l'objectif, rien à contrôler ici`); continue; }
      total++;
      while (!s.resultat && s.k() <= tmax + 1) s.avancer([]);
      if (!s.resultat) probleme(sujet, `fin(etat) encore nul au tick ${s.k()} (tmax ${tmax})`);
      else if (s.k() > tmax + 1) probleme(sujet, `fin au tick ${s.k()}, après tmax + 1 (${tmax + 1})`);
      else { bons++; if (s.k() < tmax) console.log(`     ${nom} : finie avant tmax (${decrireFin(s)})`); }
    } catch (err) { probleme(sujet, err.message); }
  }
  if (bons === total && total) ok(`fin : ${bons} parties sans ordre finies au plus tard à tmax + 1 (${cas.length - total} sans tmax)`);
}

// --------------------------------------------------------------------------
// 11. Mission 1 gagnée par l'humain d'essai ; chaque mission jouée une fois jusqu'au bout
// --------------------------------------------------------------------------

titre(`11. Mission 1 gagnée par essais.ordres en moins de 3 000 ticks ; missions 1 à ${NB_MISSIONS} jouées une fois avec un robot moyen`);
{
  const sujet = 'mission 1 (humain d\'essai)';
  try {
    const config = configMission(simTR, 1, 0, 0);
    const graine = D.missions[0].graine || 1;
    let s = jouerEssai(simTR, graine, config, 3000, 7);
    let cadence = 'tous les 7 ticks';
    if (!(s.resultat && s.resultat.gagnant === 0)) {
      const s2 = jouerEssai(simTR, graine, config, 3000, 1);
      if (s2.resultat && s2.resultat.gagnant === 0) { avertir(sujet, `pas gagnée avec des ordres tous les 7 ticks (${decrireFin(s)}), gagnée avec des ordres à chaque tick`); s = s2; cadence = 'à chaque tick'; }
    }
    mesures.mission1Ticks = s.resultat && s.resultat.gagnant === 0 ? s.k() : null;
    if (s.resultat && s.resultat.gagnant === 0) ok(`${sujet} : gagnée au tick ${s.k()} (ordres ${cadence}, ${s.resultat.etoiles} étoile(s), raison ${s.resultat.raison})`);
    else probleme(sujet, `pas gagnée en 3 000 ticks (${decrireFin(s)})`);
  } catch (err) { probleme(sujet, err.message); }
  // Chaque mission une fois, robot de niveau 2 à la place du joueur : la partie va au bout.
  let bons = 0;
  const lignes = [];
  for (let m = 1; m <= NB_MISSIONS; m++) {
    const sujetM = `mission ${m} (robot 2 au camp 0)`;
    try {
      const fiche = D.missions[m - 1];
      const graine = fiche.graine || 4100 + m;
      const s = jouerSeul(simTR, graine, configMission(simTR, m, graine, 2), fiche.tmax > 0 ? fiche.tmax + 1 : 20001);
      if (!s.resultat) probleme(sujetM, `aucune fin au tick ${s.k()}`);
      else { bons++; lignes.push(`m${m} ${s.resultat.gagnant === 0 ? 'gagnée' : 'perdue'} au tick ${s.k()} (raison ${s.resultat.raison})`); }
    } catch (err) { probleme(sujetM, err.message); }
  }
  if (bons === NB_MISSIONS) ok(`missions 1 à ${NB_MISSIONS} jouées jusqu'au bout avec un robot de niveau 2 : ${lignes.join(' ; ')}`);
}

// --------------------------------------------------------------------------
// 12. --missions : chaque mission 20 fois avec un robot à la place du joueur
// --------------------------------------------------------------------------

if (AVEC_MISSIONS) {
  titre(`12. Missions 1 à ${NB_MISSIONS} × ${PARTIES} parties, robot à la place du joueur (niveau 2 : ≥ 70 % attendus ; niveau 1 : ≤ ${TAUX_MAX_ROBOT1_FIN_ACTE} % sur les missions ${MISSIONS_FIN_ACTE[0]} à ${MISSIONS_FIN_ACTE[MISSIONS_FIN_ACTE.length - 1]}, indicatif ailleurs${SOUPLE ? ' ; non bloquant (--souple)' : ''})`);
  mesures.missions = {};
  const taches = [];
  for (const niveau of [2, 1]) for (let m = 1; m <= NB_MISSIONS; m++) {
    // Missions à carte fixe (graine de la fiche) : la carte ne change pas, seul le hasard de l'état varie (varie).
    const fiche = D.missions[m - 1];
    taches.push({ m, niveau, graines: serie(PARTIES, (i) => fiche.graine || 6000 + 100 * m + i), varie: true });
  }
  for (const mp of MISSIONS_PASSIF) taches.push({ m: mp, niveau: 0, graines: serie(PARTIES, (i) => D.missions[mp - 1].graine || 6500 + 100 * mp + i), limite: 20001, siege: true });
  const lots = await lancerLots(taches);
  let x = 0;
  for (const niveau of [2, 1]) {
    for (let m = 1; m <= NB_MISSIONS; m++) {
      const sujet = `mission ${m}, robot ${niveau}`;
      const fiche = D.missions[m - 1];
      const r = bilanLot(lots[x++], sujet);
      if (!r.n) continue;
      const taux = pct(r.v, r.n);
      mesures.missions[`m${m}n${niveau}`] = { taux, mediane: mediane(r.t) };
      const detail = `${sujet} : ${r.v} / ${r.n} victoires (${taux} %), médiane ${mediane(r.t)} ticks (victoires : ${mediane(r.tv)}), ${(r.et / Math.max(1, r.v)).toFixed(1)} étoile(s) par victoire, ${raisonsDe(r.ra)}`;
      if (niveau === 2 && taux < 70) { if (SOUPLE) avertir('missions', `${detail} : sous les 70 % attendus`); else probleme('missions', `${detail} : 70 % attendus`); }
      else if (niveau === 1 && MISSIONS_FIN_ACTE.includes(m) && taux > (TAUX_MAX_ROBOT1_PAR_MISSION[m] ?? TAUX_MAX_ROBOT1_FIN_ACTE)) {
        const t = `${detail} : ${TAUX_MAX_ROBOT1_PAR_MISSION[m] ?? TAUX_MAX_ROBOT1_FIN_ACTE} % au plus attendus (fin d'acte trop facile pour un joueur peu attentif)`;
        if (SOUPLE) avertir('missions', t); else probleme('missions', t);
      }
      else ok(detail);
      // Temps visé (règle du 17 novembre 2026) : 1,5 × la médiane des victoires du robot de niveau 2, bornée
      // entre 50 % et 100 % de la durée visée (dv, secondes) et arrondie à 10 s ; objectifs à durée fixe : d.
      if (niveau === 2 && r.tv.length && fiche.dv && ![5, 6, 8].includes(fiche.objectif.t)) {
        const borne = Math.min(fiche.dv * 10, Math.max(Math.round((fiche.dv * 5) / 100) * 100, Math.round((1.5 * mediane(r.tv)) / 100) * 100));
        if (Math.abs(borne - fiche.tvise) > 100) avertir('temps visé', `mission ${m} : tvise ${fiche.tvise}, la règle donne ${borne} (médiane des victoires ${mediane(r.tv)} ticks, dv ${fiche.dv} s)`);
      }
    }
  }
  // 12 b. Missions où un rival attaque, jouées sans aucun ordre du joueur : perdues à chaque partie ; pour les
  // missions « tenir » (objectif 5), la base est assiégée à chaque partie (sinon le cœur de la mission, les
  // offensives dirigées des Cendrés, ne joue pas).
  for (const mp of MISSIONS_PASSIF) {
    const sujet = `mission ${mp}, joueur sans ordre`;
    const fiche = D.missions[mp - 1];
    const tenir = fiche.objectif && fiche.objectif.t === 5;
    const r = bilanLot(lots[x++], sujet);
    if (!r.n) continue;
    mesures.missions[`m${mp}passif`] = { taux: pct(r.v, r.n), mediane: mediane(r.t), assiegees: r.assiegees };
    const detail = `${sujet} : ${r.v} / ${r.n} victoires${tenir ? `, base assiégée dans ${r.assiegees} parties` : ''}, fin médiane ${mediane(r.t)} ticks`;
    if (r.v > 0 || (tenir && r.assiegees < r.n)) { const t = `${detail} : 0 victoire${tenir ? ' et un siège de la base à chaque partie' : ''} attendus`; if (SOUPLE) avertir('missions', t); else probleme('missions', t); }
    else ok(detail);
  }
}

// --------------------------------------------------------------------------
// 13. --cartes : 500 graines par rayon (2, 3, 4)
// --------------------------------------------------------------------------

if (AVEC_CARTES) {
  controlerPlanete();
  const NB_GRAINES = RAPIDE ? 100 : 500;
  titre(`13 c. Cartes hexagonales (forme 1) : ${NB_GRAINES} graines par rayon (connexe, capitales à ≥ 3 arêtes, cellule, positions entières, quotas de types)`);
  // Fiches par rayon : les missions de forme 1 de ce rayon (aucune depuis la planète), et la « ligne » pour le rayon 3.
  const fiches = { 2: [], 3: [], 4: [] };
  D.missions.slice(0, NB_MISSIONS).forEach((f, i) => { if (f.carte.forme === 1 && fiches[f.carte.rayon]) fiches[f.carte.rayon].push({ nom: `mission ${i + 1}`, mi: i + 1, carte: f.carte, camps: f.camps.length, balise: f.balise | 0 }); });
  if (D.ligne) fiches[3].push({ nom: 'ligne', mi: 0, carte: D.ligne.carte, camps: 2, balise: 0 });
  // Distance en arêtes entre deux territoires (largeur d'abord).
  function distance(m, a, b) {
    const d = new Int32Array(m.n).fill(-1); d[a] = 0;
    const file = [a];
    for (let t = 0; t < file.length; t++) { const i = file[t]; if (i === b) return d[i]; for (const j of m.vois[i]) if (d[j] < 0) { d[j] = d[i] + 1; file.push(j); } }
    return -1;
  }
  const liste = D.echelles[1].liste;
  mesures.cartes = {};
  for (const rayon of [2, 3, 4]) {
    const sujet = `cartes rayon ${rayon}`;
    const fs = fiches[rayon];
    if (!fs.length) continue;                    // plus aucune mission en forme 1 : seule la « ligne » (rayon 3)
    const n0 = 3 * rayon * rayon + 3 * rayon + 1;
    let fautes = 0, mersIncompletes = 0, quotasManques = 0, nMin = 1e9, nMax = 0;
    const t0 = performance.now();
    const faute = (g, f, texte) => { fautes++; if (fautes <= 5) probleme(sujet, `${f.nom}, graine ${g} : ${texte}`); };
    for (let g = 1; g <= NB_GRAINES; g++) {
      const f = fs[g % fs.length];
      let m;
      try { m = simNu.generer(g, typeof simNu.carteDe === 'function' ? simNu.carteDe(f.mi) : { ...f.carte, camps: f.camps, balise: f.balise, ligne: f.mi === 0 ? 1 : 0 }, 1); } catch (err) { faute(g, f, `generer : ${err.message}`); continue; }
      if (!m || !Number.isInteger(m.n) || m.n < 1) { faute(g, f, 'carte vide'); continue; }
      nMin = Math.min(nMin, m.n); nMax = Math.max(nMax, m.n);
      if (m.n !== n0 - (f.carte.mers | 0)) mersIncompletes++;
      // Positions entières dans la carte, bbox englobante.
      let posOk = true;
      for (let i = 0; i < m.n; i++) if (!Number.isInteger(m.x[i]) || !Number.isInteger(m.y[i]) || m.x[i] < 0 || m.x[i] > 4096 || m.y[i] < 0 || m.y[i] > 4096) posOk = false;
      if (!posOk) faute(g, f, 'positions non entières ou hors de 0..4096');
      if (!Array.isArray(m.bbox) || m.bbox.length !== 4 || m.x.some((x) => x < m.bbox[0] || x > m.bbox[2]) || m.y.some((y) => y < m.bbox[1] || y > m.bbox[3])) faute(g, f, 'bbox ne contient pas tous les centres');
      // Voisins triés et symétriques, arêtes a < b, graphe connexe.
      let voisOk = true, nbVois = 0;
      for (let i = 0; i < m.n; i++) {
        const v = m.vois[i]; nbVois += v.length;
        for (let x = 0; x < v.length; x++) { if (x && v[x] <= v[x - 1]) voisOk = false; if (!m.vois[v[x]].includes(i)) voisOk = false; }
      }
      if (!voisOk) faute(g, f, 'voisins non triés ou non symétriques');
      if (m.ar.length * 2 !== nbVois || m.ar.some(([a, b]) => !(a < b))) faute(g, f, `arêtes : ${m.ar.length} pour ${nbVois / 2} voisinages, ou a ≥ b`);
      const vus = new Uint8Array(m.n); const file = [0]; vus[0] = 1;
      for (let t = 0; t < file.length; t++) for (const j of m.vois[file[t]]) if (!vus[j]) { vus[j] = 1; file.push(j); }
      if (file.length !== m.n) faute(g, f, `graphe non connexe (${file.length} / ${m.n} atteints)`);
      // Capitales : une par camp, distinctes, ≥ 2 voisins, ≥ 3 arêtes entre elles, celle du joueur en bas.
      if (!Array.isArray(m.cap) || m.cap.length !== f.camps) faute(g, f, `${m.cap && m.cap.length} capitales pour ${f.camps} camps`);
      else {
        if (new Set(m.cap).size !== m.cap.length) faute(g, f, 'capitales confondues');
        for (const c of m.cap) if (m.vois[c].length < 2) faute(g, f, `capitale ${c} à ${m.vois[c].length} voisin(s)`);
        for (let a = 0; a < m.cap.length; a++) for (let b = a + 1; b < m.cap.length; b++) { const d = distance(m, m.cap[a], m.cap[b]); if (d < 3) faute(g, f, `capitales ${m.cap[a]} et ${m.cap[b]} à ${d} arête(s)`); }
        if (m.y[m.cap[0]] !== Math.max(...m.y)) faute(g, f, 'la capitale du joueur n\'est pas en bas de la carte');
        if (m.cap.some((c) => m.t[c] !== liste.length - 1)) faute(g, f, 'une capitale n\'a pas le type capitale');
      }
      if (f.balise && (m.balise < 0 || m.cap.includes(m.balise))) faute(g, f, `balise ${m.balise} absente ou sur une capitale`);
      if (!f.balise && m.balise !== -1) faute(g, f, `balise ${m.balise} inattendue`);
      // Cellule : diamètre de la plus petite cellule = distance entre centres voisins (à 2 unités près).
      let dmin = 1e9;
      for (const [a, b] of m.ar) dmin = Math.min(dmin, Math.round(Math.hypot(m.x[a] - m.x[b], m.y[a] - m.y[b])));
      if (!(Number.isInteger(m.cellule) && m.cellule > 0) || Math.abs(dmin - m.cellule) > 2) faute(g, f, `cellule ${m.cellule} incohérente avec la plus courte arête (${dmin} unités)`);
      if (m.R !== undefined && !(Number.isInteger(m.R) && m.R > 0 && m.R * 2 <= m.cellule + 100)) faute(g, f, `R ${m.R} incohérent`);
      // Types : quotas de la fiche (montagnes, cratères, calottes) ; manque compté, pas bloquant.
      const compte = {}; for (const t of m.t) compte[liste[t]] = (compte[liste[t]] || 0) + 1;
      if (m.t.some((t) => !(t >= 0 && t < liste.length))) faute(g, f, 'type de territoire hors liste');
      for (const [cle, type] of [['montagnes', 'montagne'], ['crateres', 'cratere'], ['calottes', 'calotte']]) if ((compte[type] || 0) < (f.carte[cle] | 0)) { quotasManques++; break; }
      // Ligne : symétrie centrale des types et des capitales.
      if (f.mi === 0 && Array.isArray(m.mir)) {
        if (m.mir[m.cap[0]] !== m.cap[1]) faute(g, f, 'capitales non symétriques');
        for (let i = 0; i < m.n; i++) if (m.t[m.mir[i]] !== m.t[i]) { faute(g, f, 'types non symétriques'); break; }
      }
    }
    const msCarte = (performance.now() - t0) / NB_GRAINES;
    mesures.cartes[rayon] = { fautes, nMin, nMax, msCarte: Math.round(msCarte * 1000) / 1000 };
    const detail = `${NB_GRAINES} graines (${fs.map((x) => x.nom).join(', ')}) : ${nMin} à ${nMax} territoires, ${ms(msCarte)} par carte`;
    if (fautes) probleme(sujet, `${fautes} faute(s) sur ${detail}`);
    else ok(`${sujet} : ${detail}`);
    if (mersIncompletes) avertir(sujet, `${mersIncompletes} carte(s) où toutes les mers n'ont pas pu être retirées (graphe gardé connexe)`);
    if (quotasManques) avertir(sujet, `${quotasManques} carte(s) avec moins de montagnes, cratères ou calottes que la fiche`);
  }
}

// --------------------------------------------------------------------------
// 13 a et b. La planète de l'acte 1 et les zones des 20 missions (contrat v2, sections 1 à 3)
// --------------------------------------------------------------------------

// Parties d'un graphe { n, vois } sans la case a (ou toutes si a = −1) : liste de listes de cases.
function parties(n, vois, a, garder = () => true) {
  const comp = new Int32Array(n).fill(-1), l = [];
  for (let d = 0; d < n; d++) {
    if (d === a || comp[d] >= 0 || !garder(d)) continue;
    const f = [d]; comp[d] = l.length;
    for (let u = 0; u < f.length; u++) for (const j of vois[f[u]]) if (j !== a && comp[j] < 0 && garder(j)) { comp[j] = l.length; f.push(j); }
    l.push(f);
  }
  return l;
}

function controlerPlanete() {
  titre('13 a. Planète de l\'acte 1 (connexe, sans articulation, provinces, numérotation, capitales, départ)');
  const PD = D.planetes && D.planetes[1];
  let P = null, msPlanete = 0;
  try {
    const neuf = evaluerBlocs(blocs, ['pe-outils', 'pe-donnees', 'pe-sim'], {});
    const t0 = performance.now();
    neuf.JEL_SIM.planete(1);
    msPlanete = Math.round((performance.now() - t0) * 10) / 10;
    P = simNu.planete(1);
  } catch (err) { probleme('planète', `JEL_SIM.planete(1) : ${err.message}`); return; }
  if (!P) { probleme('planète', 'JEL_SIM.planete(1) renvoie null (génération impossible avec ces réglages)'); return; }
  if (simNu.planete(1) !== P) probleme('planète', 'JEL_SIM.planete(1) doit renvoyer la planète en cache (même objet)');
  if (simNu.planete(6) !== null) probleme('planète', 'JEL_SIM.planete(6) : null attendu (il n’y a que cinq actes)');
  const liste = D.echelles[1].liste, tCap = liste.length - 1, tCal = liste.indexOf('calotte');
  let fautes = 0;
  const faute = (texte) => { fautes++; if (fautes <= 12) probleme('planète', texte); };
  // Régions : positions, voisins, connexité, articulations.
  const R = PD.rayon, n0 = 3 * R * R + 3 * R + 1;
  if (P.n !== n0 - PD.mers) avertir('planète', `${P.n} régions pour ${n0} cases et ${PD.mers} mers (toutes les mers n'ont pas pu être retirées)`);
  for (let i = 0; i < P.n; i++) {
    if (![P.x[i], P.y[i]].every((v) => Number.isInteger(v) && v >= 0 && v <= 4096)) faute(`région ${i} : position (${P.x[i]}, ${P.y[i]}) non entière ou hors de 0..4096`);
    const v = P.vois[i];
    for (let x = 0; x < v.length; x++) { if (x && v[x] <= v[x - 1]) faute(`région ${i} : voisins non triés`); if (!P.vois[v[x]].includes(i)) faute(`région ${i} : voisin ${v[x]} non symétrique`); }
    if (P.vois[i].length !== P.lv[i].length || P.lv[i].some((L) => !(Number.isInteger(L) && L >= 5 && L <= 40))) faute(`région ${i} : longueurs des routes (lv) incohérentes`);
    if (!(P.t[i] >= 0 && P.t[i] < liste.length)) faute(`région ${i} : type ${P.t[i]} hors liste`);
  }
  if (P.x.some((x, i) => x < P.bbox[0] || x > P.bbox[2] || P.y[i] < P.bbox[1] || P.y[i] > P.bbox[3])) faute('bbox ne contient pas toutes les régions');
  const tout = parties(P.n, P.vois, -1);
  if (tout.length !== 1) faute(`planète non connexe (${tout.length} parties)`);
  let articulations = 0;
  for (let a = 0; a < P.n; a++) if (parties(P.n, P.vois, a).length > 1) articulations++;
  if (articulations) faute(`${articulations} case(s) d'articulation (un passage d'une seule case fige la partie)`);
  // Provinces : partition, contiguïté, tailles, nombre.
  const NP = P.nProv;
  if (NP < (PD.provinces | 0 || 24)) faute(`${NP} provinces (${PD.provinces || 24} au moins attendues)`);
  if (!Array.isArray(P.cellules) || P.cellules.length !== NP) faute('cellules : une liste par province attendue');
  const vues = new Uint8Array(P.n);
  let tMin = 1e9, tMax = 0;
  for (let k = 0; k < NP; k++) {
    const cel = P.cellules[k];
    tMin = Math.min(tMin, cel.length); tMax = Math.max(tMax, cel.length);
    if (cel.length < PD.taille[0] || cel.length > PD.taille[1]) faute(`province ${k} : ${cel.length} régions (${PD.taille[0]} à ${PD.taille[1]} attendues)`);
    for (const i of cel) { if (P.prov[i] !== k) faute(`région ${i} : prov ${P.prov[i]} mais rangée dans la province ${k}`); vues[i]++; }
    if (parties(P.n, P.vois, -1, (i) => P.prov[i] === k).length !== 1) faute(`province ${k} non contiguë`);
    if (P.prov[P.centre[k]] !== k) faute(`province ${k} : centre ${P.centre[k]} hors de la province`);
    // Voisins de province : exactement les provinces qui touchent une de ses régions.
    const vp = new Set();
    for (const i of cel) for (const j of P.vois[i]) if (P.prov[j] !== k) vp.add(P.prov[j]);
    if ([...vp].sort((a, b) => a - b).join(',') !== P.voisinsProv[k].join(',')) faute(`province ${k} : voisinsProv ${P.voisinsProv[k].join(',')} au lieu de ${[...vp].sort((a, b) => a - b).join(',')}`);
  }
  if ([...vues].some((v) => v !== 1)) faute('les provinces ne partagent pas exactement les régions (partition)');
  // Numérotation par éloignement de la province natale (largeur d'abord).
  const niv = new Array(NP).fill(-1), file = [0];
  niv[0] = 0;
  for (let u = 0; u < file.length; u++) for (const b of P.voisinsProv[file[u]]) if (niv[b] < 0) { niv[b] = niv[file[u]] + 1; file.push(b); }
  for (let k = 1; k < NP; k++) if (niv[k] < niv[k - 1]) faute(`province ${k} (distance ${niv[k]}) numérotée après la province ${k - 1} (distance ${niv[k - 1]}) : numérotation non croissante`);
  // Capitales, sud et nord, calottes.
  const cy = (k) => P.cellules[k].reduce((s, i) => s + P.y[i], 0) / P.cellules[k].length;
  const yMilieu = (P.bbox[1] + P.bbox[3]) / 2;
  if (P.prov[P.capitales[0]] !== 0 || P.t[P.capitales[0]] !== tCap) faute('capitale du joueur : dans la province 0, de type capitale, attendue');
  if (!(cy(0) > yMilieu)) faute('province natale : au sud attendue');
  const depart = PD.depart || {};
  const tenues = new Map();
  for (const [fa, l] of Object.entries(depart)) {
    for (const k of l) { if (k === 0) faute(`faction ${fa} : la province natale ne peut pas être tenue au départ`); if (tenues.has(k)) faute(`province ${k} tenue par deux factions au départ`); tenues.set(k, +fa); }
    const c = P.capitales[fa];
    if (c === undefined || !l.includes(P.prov[c]) || P.t[c] !== tCap) faute(`faction ${fa} : capitale dans une de ses provinces, de type capitale, attendue`);
    if (+fa === 1 && !(l.reduce((s, k) => s + cy(k), 0) / l.length < yMilieu)) avertir('planète', 'les Cendrés (faction 1) devraient tenir le nord');
  }
  for (let k = 0; k < NP; k++) if (P.depart[k] !== (tenues.has(k) ? tenues.get(k) : -1)) faute(`province ${k} : depart ${P.depart[k]} incohérent avec PE_DONNEES.planetes[1].depart`);
  if (tCal >= 0 && !(P.t.some((t, i) => t === tCal && P.y[i] < yMilieu) && P.t.some((t, i) => t === tCal && P.y[i] > yMilieu))) faute('calottes : une au nord et une au sud attendues');
  mesures.planete = { n: P.n, provinces: NP, tMin, tMax, ms: msPlanete, zMin: 0, zMax: 0 };
  if (!fautes) ok(`planète : ${P.n} régions, ${NP} provinces de ${tMin} à ${tMax} régions, connexe, sans articulation, numérotées par éloignement de la province natale (${Math.max(...niv) + 1} cercles), capitales ${Object.entries(P.capitales).map(([fa, i]) => `${fa}:${i}`).join(' ')}, construite en ${msPlanete} ms`);

  // 13 b. Zones des missions, propriétaires, conquêtes.
  titre(`13 b. Zones des ${NB_MISSIONS} missions (10 à 90 régions, connexes, camps présents, propriétaires et conquêtes cohérents)`);
  fautes = 0;
  const fauteZ = (mi, texte) => { fautes++; if (fautes <= 20) probleme(`mission ${mi}`, texte); };
  const ma = simNu.missionsActe(1);
  if (ma.join(',') !== Array.from({ length: NB_MISSIONS }, (_, i) => i + 1).join(',')) fauteZ(0, `missionsActe(1) : 1 à ${NB_MISSIONS} attendus (${ma.join(',')})`);
  if (simNu.missionsActe(2).join(',') !== Array.from({ length: 20 }, (_, i) => i + 21).join(',')) fauteZ(0, 'missionsActe(2) : 21 à 40 attendus');
  if (simNu.proprietaires(1, 1).join(',') !== P.depart.join(',')) fauteZ(1, 'proprietaires(1, 1) : le départ de l\'acte attendu');
  const conquises = new Map();
  let zMin = 1e9, zMax = 0;
  const lignes = [];
  for (let mi = 1; mi <= NB_MISSIONS; mi++) {
    const fiche = D.missions[mi - 1];
    if (!fiche.carte || fiche.carte.forme !== 3) continue;
    const prop = simNu.proprietaires(1, mi);
    for (const k of simNu.conquetes(mi)) { if (conquises.has(k)) fauteZ(mi, `province ${k} déjà conquise à la mission ${conquises.get(k)}`); conquises.set(k, mi); }
    for (const k of fiche.cibles) if (prop[k] === 0) fauteZ(mi, `cible ${k} déjà au joueur avant la mission`);
    let e;
    try { const c = simNu.configMission(mi, { graine: 4321 }); e = simNu.depart(c.graine, c); } catch (err) { fauteZ(mi, `depart : ${err.message}`); continue; }
    const m = e.m, n = m.n;
    zMin = Math.min(zMin, n); zMax = Math.max(zMax, n);
    if (n < 10 || n > 90) fauteZ(mi, `${n} régions actives (10 à 90 attendues)`);
    if (!Array.isArray(m.gi) || m.gi.length !== n || m.planete !== P) fauteZ(mi, 'm.gi (index dans la planète) et m.planete attendus');
    else for (let i = 0; i < n; i++) if (m.x[i] !== P.x[m.gi[i]] || m.y[i] !== P.y[m.gi[i]] || m.t[i] !== P.t[m.gi[i]]) { fauteZ(mi, `région ${i} : position ou type différents de la planète (région ${m.gi[i]})`); break; }
    if (!Array.isArray(m.prop) || m.prop.join(',') !== prop.join(',')) fauteZ(mi, 'm.prop : proprietaires(1, mi) attendu');
    if (parties(n, m.vois, -1).length !== 1) fauteZ(mi, 'zone non connexe');
    for (let c = 0; c < fiche.camps.length; c++) if (!e.p.includes(c)) fauteZ(mi, `camp ${c} de la fiche sans région au départ`);
    if (m.cap.length !== fiche.camps.length || m.cap.some((c, x) => !(c >= 0 && e.p[c] === x))) fauteZ(mi, `régions des forces (m.cap ${m.cap.join(',')}) hors de leur camp`);
    const o = e.o;
    if ([3, 4, 5, 9].includes(o.t) && !o.l.length) fauteZ(mi, `objectif ${o.t} sans liste de régions`);
    if ((o.t === 1 || o.t === 2) && o.x >= o.n) fauteZ(mi, `objectif ${o.t} déjà atteint au départ (${o.x} / ${o.n})`);
    if (o.t === 3 && o.x >= o.l.length) fauteZ(mi, 'objectif déjà atteint au départ');
    if ((o.t === 4 || o.t === 9) && o.x !== 0) fauteZ(mi, 'balise déjà au joueur');
    if (fiche.balise && fiche.balise.province >= 0 && !(m.balise >= 0 && P.prov[m.gi[m.balise]] === fiche.balise.province)) fauteZ(mi, `balise hors de la province ${fiche.balise.province}`);
    // Articulations entre deux camps (un passage d'une case dont chaque côté tient des régions de camps différents).
    let entre = 0;
    for (let a = 0; a < n; a++) {
      const ps = parties(n, m.vois, a);
      if (ps.length < 2) continue;
      const autres = ps.filter((l) => l.length >= 3 && l.some((i) => e.p[i] !== e.p[a])).length;
      if (autres >= 2) entre++;
    }
    if (entre) avertir(`mission ${mi}`, `${entre} case(s) d'articulation entre deux camps dans la zone (risque de partie figée : élargir la zone)`);
    const cnt = {};
    for (const p of e.p) cnt[p] = (cnt[p] || 0) + 1;
    lignes.push(`m${mi} ${n} (${Object.entries(cnt).sort().map(([c, v]) => `${c === '-1' ? 'n' : 'c' + c}:${v}`).join(' ')})`);
  }
  for (let k = 0; k < NP; k++) if (!conquises.has(k) && P.depart[k] !== 0) fauteZ(0, `province ${k} jamais conquise`);
  const fin = simNu.proprietaires(1, NB_MISSIONS + 1);
  if (fin.some((p) => p !== 0)) fauteZ(NB_MISSIONS, `après la mission ${NB_MISSIONS}, provinces pas au joueur : ${fin.map((p, k) => (p !== 0 ? k : -1)).filter((k) => k >= 0).join(',')}`);
  mesures.planete.zMin = zMin; mesures.planete.zMax = zMax;
  if (!fautes) ok(`zones : ${lignes.join(' ; ')} ; chaque province conquise une seule fois, toute la planète au joueur après la mission ${NB_MISSIONS}`);
}


// --------------------------------------------------------------------------
// 14. Actes 2 et 3 : cartes, règles, déterminisme, instantané, coût, parties (CONTRAT-LOT2)
// --------------------------------------------------------------------------

const ACTES_SUITE = [[2, 21, 40, 130, 170], [3, 41, 60, 160, 190]];
const NOM_ORDRE = (t) => ({ 1: 'pourcentage', 2: 'nombre', 3: 'liste', 4: 'atteindre', 5: 'tenir', 6: 'survivre', 7: 'éliminer', 8: 'couper', 9: 'course', 10: 'allié' }[t] || t);
const faux1 = () => 1;                                            // hasard qui ne saute jamais une décision

async function controlerActesSuite() {
  titre('14 a. Cartes des actes 2 et 3 (connexes, tailles, 24 provinces, routes, positions, numérotation)');
  for (const [acte, debut, fin, nMin, nMax] of ACTES_SUITE) {
    const sujet = `carte de l'acte ${acte}`;
    let fautes = 0;
    const faute = (texte) => { fautes++; if (fautes <= 12) probleme(sujet, texte); };
    const P = simNu.planete(acte), PD = D.planetes[acte];
    if (!P) { probleme(sujet, 'JEL_SIM.planete renvoie null'); continue; }
    if (simNu.planete(acte) !== P) faute('la carte doit rester en cache (même objet)');
    if (P.forme !== 2) faute(`forme ${P.forme} (2 attendue)`);
    if (P.n < nMin || P.n > nMax) faute(`${P.n} nœuds (${nMin} à ${nMax} attendus)`);
    if (P.nProv !== 24 || P.cellules.length !== 24) faute(`${P.nProv} provinces (24 attendues)`);
    if (!Number.isInteger(P.R) || P.R <= 0 || !Number.isInteger(P.cellule) || P.cellule <= 0) faute('R et cellule entiers attendus');
    let dMin = 9, dMax = 0, longueurs = true;
    for (let i = 0; i < P.n; i++) {
      if (![P.x[i], P.y[i]].every((v) => Number.isInteger(v) && v >= 0 && v <= 4096)) faute(`nœud ${i} : position non entière ou hors carte`);
      const v = P.vois[i];
      dMin = Math.min(dMin, v.length); dMax = Math.max(dMax, v.length);
      for (let x = 0; x < v.length; x++) { if (x && v[x] <= v[x - 1]) faute(`nœud ${i} : voisins non triés`); if (!P.vois[v[x]].includes(i)) faute(`nœud ${i} : voisin ${v[x]} non symétrique`); }
      if (P.lv[i].length !== v.length || P.lv[i].some((L) => !(Number.isInteger(L) && L >= 5 && L <= 40))) longueurs = false;
    }
    if (!longueurs) faute('longueurs des routes (lv) hors de 5 à 40');
    if (dMin < 2 || dMax > 4) faute(`routes par nœud : ${dMin} à ${dMax} (2 à 4 attendues)`);
    if (parties(P.n, P.vois, -1).length !== 1) faute('carte non connexe');
    let art = 0;
    for (let a = 0; a < P.n; a++) if (parties(P.n, P.vois, a).length > 1) art++;
    if (art) faute(`${art} nœud(s) d'articulation`);
    let tMin = 99, tMax = 0;
    const vues = new Uint8Array(P.n);
    for (let k = 0; k < P.nProv; k++) {
      const cel = P.cellules[k];
      tMin = Math.min(tMin, cel.length); tMax = Math.max(tMax, cel.length);
      if (cel.length < PD.taille[0] || cel.length > PD.taille[1]) faute(`province ${k} : ${cel.length} nœuds (${PD.taille[0]} à ${PD.taille[1]} attendus)`);
      for (const i of cel) { if (P.prov[i] !== k) faute(`nœud ${i} mal rangé`); vues[i]++; }
      if (parties(P.n, P.vois, -1, (i) => P.prov[i] === k).length !== 1) faute(`province ${k} non contiguë`);
      const vp = new Set();
      for (const i of cel) for (const j of P.vois[i]) if (P.prov[j] !== k) vp.add(P.prov[j]);
      if ([...vp].sort((a, b) => a - b).join(',') !== P.voisinsProv[k].join(',')) faute(`province ${k} : voisinsProv incohérent`);
    }
    if ([...vues].some((v) => v !== 1)) faute('les provinces ne couvrent pas exactement la carte');
    for (let k = 1; k < P.nProv; k++) if (P.niveau[k] < P.niveau[k - 1]) faute(`province ${k} : numérotation non croissante`);
    const L = D.echelles[acte].liste;
    if (P.prov[P.capitales[0]] !== 0 || P.t[P.capitales[0]] !== L.length - 1) faute('capitale du joueur : province 0, dernier type de l\'échelle, attendue');
    if (P.depart[0] !== 0) faute('la province 0 doit être au joueur dès le début de l\'acte');
    for (const [fa, l] of Object.entries(PD.depart)) {
      if (+fa === 0) continue;
      const c = P.capitales[fa], ty = PD.typesCap && PD.typesCap[fa];
      if (c === undefined || !l.includes(P.prov[c])) faute(`faction ${fa} : capitale hors de ses provinces`);
      else if (ty && L[P.t[c]] !== ty) faute(`faction ${fa} : capitale de type ${L[P.t[c]]} (${ty} attendu)`);
    }
    if (acte === 2) {
      if (!P.orb || !P.per || !P.rayons || P.orb.length !== P.n || P.per.length !== P.n) faute('orb, per, rayons attendus');
      const parOrbite = new Map();
      for (let i = 0; i < P.n; i++) parOrbite.set(P.orb[i], P.per[i]);
      const pers = [...parOrbite.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
      if (pers.some((p) => p < 60 || p > 240) || pers.some((p, i) => i && p <= pers[i - 1])) faute(`périodes ${pers.join(',')} : 60 à 240, croissantes vers l'extérieur, attendues`);
      for (const nom of ['ceinture', 'geante', 'lune', 'station', 'tellurique', 'mere']) if (!P.t.some((t) => L[t] === nom)) faute(`aucun corps de type ${nom}`);
      for (let i = 0; i < P.n; i++) {
        const z = simNu.position(P, null, i);
        if (z[0] !== P.x[i] || z[1] !== P.y[i]) { faute(`position(P, null, ${i}) différente de x, y`); break; }
        for (let a = 0; a < 64; a += 7) { const q = simNu.position(P, a, i); if (!q.every((v) => Number.isInteger(v) && v >= 0 && v <= 4096)) { faute(`position du corps ${i} au pas ${a} hors carte`); break; } }
      }
    } else for (const nom of ['naine', 'binaire', 'nebuleuse', 'pulsar', 'relais', 'forteresse', 'natal']) if (!P.t.some((t) => L[t] === nom)) faute(`aucun système de type ${nom}`);
    if (!fautes) ok(`${sujet} : ${P.n} nœuds, 24 provinces de ${tMin} à ${tMax}, ${dMin} à ${dMax} routes par nœud, connexe, sans articulation, cellule ${P.cellule}`);

    // Zones et conquêtes.
    fautes = 0;
    const sujetZ = `zones de l'acte ${acte}`;
    const fauteZ = (m, texte) => { fautes++; if (fautes <= 20) probleme(`mission ${m}`, texte); };
    if (simNu.missionsActe(acte).join(',') !== Array.from({ length: 20 }, (_, i) => debut + i).join(',')) fauteZ(debut, 'missionsActe incohérent');
    const conquises = new Map(), bilans = [];
    let zMin = 1e9, zMax = 0;
    for (let m = debut; m <= fin; m++) {
      const fiche = D.missions[m - 1];
      if (fiche.verrou) { fauteZ(m, 'fiche encore verrouillée'); continue; }
      const av = simNu.proprietaires(acte, m);
      for (const k of simNu.conquetes(m)) { if (conquises.has(k)) fauteZ(m, `province ${k} déjà conquise à la mission ${conquises.get(k)}`); if (av[k] === 0) fauteZ(m, `province ${k} déjà au joueur`); conquises.set(k, m); }
      if (!simNu.conquetes(m).length) fauteZ(m, 'aucune province conquise');
      let e;
      try { const c = simNu.configMission(m, { graine: 4321 }); e = simNu.depart(c.graine, c); } catch (err) { fauteZ(m, `depart : ${err.message}`); continue; }
      const z = e.m, n = z.n;
      zMin = Math.min(zMin, n); zMax = Math.max(zMax, n); bilans.push(`m${m} ${n}`);
      if (n < 15 || n > 80) fauteZ(m, `${n} nœuds actifs (15 à 80 attendus)`);
      if (z.forme !== 2) fauteZ(m, `m.forme ${z.forme} (2 attendue)`);
      if (parties(n, z.vois, -1).length !== 1) fauteZ(m, 'zone non connexe');
      fiche.camps.forEach((_, c) => { if (!e.p.includes(c)) fauteZ(m, `camp ${c} sans territoire au départ`); if (!(z.cap[c] >= 0 && e.p[z.cap[c]] === c)) fauteZ(m, `base du camp ${c} hors de son camp`); });
      if (acte === 2 && (!z.per || !z.orb || !(z.perRef >= 60) || !Number.isInteger(z.ph))) fauteZ(m, 'm.per, m.orb, m.perRef attendus');
      const o = e.o;
      if ([3, 4, 5, 8, 9].includes(o.t) && !o.l.length) fauteZ(m, `objectif ${NOM_ORDRE(o.t)} sans nœud`);
      if ((o.t === 1 || o.t === 2) && o.x >= o.n) fauteZ(m, `objectif déjà atteint (${o.x} / ${o.n})`);
      if (o.t === 3 && o.x >= o.l.length) fauteZ(m, 'objectif déjà atteint');
      if ((o.t === 4 || o.t === 9) && (o.x !== 0 || (o.t === 9 && e.p[o.l[0]] > 0))) fauteZ(m, 'balise déjà prise au départ');
      if (o.t === 7 && !o.l.every((c) => e.p.includes(c))) fauteZ(m, 'camp à éliminer absent');
      if (o.t === 10 && !fiche.camps.some((c, x) => x > 0 && c.eq === 0)) fauteZ(m, 'objectif allié sans camp allié');
      if ([6, 8].includes(o.t) && !(fiche.tmax > 0)) fauteZ(m, 'tmax attendu (objectif qui peut ne jamais aboutir)');
      if (fiche.capacite && !D.capacites.some((c) => c.id === fiche.capacite && c.mission === m)) fauteZ(m, `capacité ${fiche.capacite} : mauvaise mission`);
      const attendu = D.capacites.filter((c) => c.mission < m).reduce((s, c) => s | c.bit, 0);
      if (fiche.tech !== attendu) fauteZ(m, `tech ${fiche.tech} (${attendu} attendu : capacités gagnées avant la mission)`);
    }
    for (let k = 0; k < 24; k++) if (P.depart[k] !== 0 && !conquises.has(k)) fauteZ(fin, `province ${k} jamais conquise`);
    const finale = simNu.proprietaires(acte, fin + 1);
    if (finale.some((p) => p !== 0)) fauteZ(fin, `après la mission ${fin}, pas au joueur : ${finale.map((p, k) => (p !== 0 ? k : -1)).filter((k) => k >= 0).join(',')}`);
    if (!fautes) ok(`${sujetZ} : ${zMin} à ${zMax} nœuds actifs (${bilans.join(', ')}), chaque province conquise une fois, toute la carte au joueur après la mission ${fin}`);
    mesures[`zones${acte}`] = `${zMin} à ${zMax}`;
  }

  titre('14 b. Orbites, pulsar, allié, objectifs 8 et 10, ravitaillement (règles isolées)');
  const nouvelle = (m, g = 77, ctl0 = 0) => { const c = configMission(simNu, m, g, ctl0); return simNu.depart(c.graine, c); };
  const garder = (sujet, f) => { try { const r = f(); if (r) probleme(sujet, r); else return true; } catch (err) { probleme(sujet, err.message); } return false; };
  garder('orbites', () => {
    const s = new TR.Simulation(simNu, 77, configMission(simNu, 26, 77, 0));
    const m = s.etat.m, tours = 1200;
    for (let k = 0; k < tours && !s.resultat; k++) s.avancer([]);
    const K = s.k();
    for (let i = 0; i < m.n; i++) if (s.etat.ang[i] !== Math.floor((K + m.ph) / m.per[i]) % 64) return `corps ${i} : angle ${s.etat.ang[i]} au tick ${K} (période ${m.per[i]}, décalage ${m.ph})`;
    // Fenêtre de transfert : toutes les orbites reviennent à l'angle 0 au tick d'alignement de la mission.
    const fiche26 = D.missions[25], al = Number.isInteger(fiche26.alignement) ? fiche26.alignement : fiche26.dv * 5;
    if (m.per.some((p) => Math.floor((al + m.ph) / p) % 64 !== 0)) return `orbites non alignées au tick ${al}`;
    // La durée d'une route suit la distance courante, puis reste figée dans la flotte.
    const e = nouvelle(26);
    let a = -1, b = -1;
    outer: for (let i = 0; i < e.m.n; i++) if (e.p[i] === 0) for (const j of e.m.vois[i]) if (e.m.orb[j] !== e.m.orb[i]) { a = i; b = j; break outer; }
    if (a < 0) return 'aucune route entre deux orbites';
    e.f[a] = 50;
    const d0 = simNu.duree(e, a, b);
    let autre = d0;
    const angB = e.ang[b];
    for (let x = 1; x < 64 && autre === d0; x++) { e.ang[b] = (angB + x) % 64; autre = simNu.duree(e, a, b); }
    if (autre === d0) return 'la durée ne dépend pas de la position des corps';
    e.ang[b] = angB;
    if (!simNu.valide(e, 0, [1, a, b, 50])) return 'ordre refusé';
    simNu.ordre(e, 0, [1, a, b, 50]);
    const fl = e.fl[e.fl.length - 1], L = fl.L;
    if (L !== d0) return `flotte : L ${L}, duree ${d0}`;
    e.ang[b] = 20; simNu.pas(e, faux1);
    if (fl.L !== L) return 'la durée d\'une flotte partie doit rester figée';
    const [px, py] = simNu.position(e.m, e.ang, b);
    if (!Number.isInteger(px) || !Number.isInteger(py)) return 'position non entière';
  }) && ok('orbites : angles au pas des périodes, alignement au tick prévu, durée lue sur les positions courantes puis figée dans la flotte');
  garder('pulsar', () => {
    const e = nouvelle(49), m = e.m, tP = D.echelles[3].liste.indexOf('pulsar');
    const i = m.t.indexOf(tP);
    if (i < 0) return 'aucun pulsar dans la zone de la mission 49';
    const a = m.vois[i][0];
    e.p[a] = 0; e.f[a] = 60; e.fer[i] = 5;
    if (simNu.valide(e, 0, [1, a, i, 50])) return 'envoi vers un pulsar fermé accepté';
    e.p[i] = 0; e.f[i] = 60;
    if (simNu.valide(e, 0, [1, i, a, 50])) return 'départ d\'un pulsar fermé accepté';
    if (simNu.valide(e, 0, [3, i])) return 'Rallier sur un pulsar fermé accepté';
    e.p[i] = -1; e.fer[i] = 0;
    if (!simNu.valide(e, 0, [1, a, i, 50])) return 'envoi vers un pulsar ouvert refusé';
    simNu.ordre(e, 0, [1, a, i, 50]);
    const fl = e.fl[e.fl.length - 1];
    fl.q = fl.L - 1; e.fer[i] = 3;
    simNu.pas(e, faux1);
    if (!e.fl.includes(fl) || fl.q !== fl.L - 1) return 'la flotte doit attendre au bout de la route';
    let fermes = 0, ouverts = 0;
    for (let k = 0; k < 450; k++) { simNu.pas(e, faux1); e.k++; for (const v of e.ev) if (v[0] === 12) { if (v[2] === 1) fermes++; else ouverts++; } }
    if (e.fl.includes(fl)) return 'la flotte n\'est jamais arrivée après la réouverture';
    if (!fermes || !ouverts) return `événements 12 : ${fermes} fermetures, ${ouverts} ouvertures`;
    const nb = m.t.filter((t) => t === tP).length;
    if (fermes < nb * 2) return `${fermes} fermetures pour ${nb} pulsars en 450 ticks (2 chacun attendues)`;
  }) && ok('pulsar : routes fermées (valide), flotte en attente au bout de la route, cycles et événements 12');
  garder('allié', () => {
    const e = nouvelle(46), al = e.eq.findIndex((q, c) => c > 0 && q === 0), m = e.m;
    if (al < 0) return 'camp allié absent';
    const j = e.p.findIndex((p, i) => p === al && m.vois[i].some((x) => e.p[x] !== al)), a = m.vois[j].find((x) => e.p[x] !== al);
    e.p[a] = 0; e.f[a] = 40;
    e.c[0].t |= 64; e.c[0].r[0] = 0;
    if (simNu.valide(e, 0, [4, j])) return 'Frappe sur un allié acceptée';
    if (!simNu.valide(e, 0, [1, a, j, 50])) return 'renfort vers un allié refusé';
    const fav = e.f[j];
    simNu.ordre(e, 0, [1, a, j, 50]);
    const fl = e.fl[e.fl.length - 1]; fl.q = fl.L - 1;
    simNu.pas(e, faux1);
    if (e.p[j] !== al || e.f[j] <= fav) return `renfort : propriétaire ${e.p[j]}, forces ${fav} → ${e.f[j]}`;
    const e2 = nouvelle(46); e2.o.d = 1; simNu.pas(e2, faux1);
    const r2 = simNu.fin(e2);
    if (!r2 || r2.gagnant !== 0 || r2.raison !== 1) return `objectif 10 : fin ${JSON.stringify(r2)}`;
    const e3 = nouvelle(46);
    for (let i = 0; i < e3.nn; i++) if (e3.p[i] === al) e3.p[i] = 1;
    e3.fl = e3.fl.filter((f) => f.c !== al); e3.sg = e3.sg.filter((x) => x.c !== al);
    const r3 = simNu.fin(e3);
    if (!r3 || r3.gagnant === 0 || r3.raison !== 4) return `allié tombé : fin ${JSON.stringify(r3)}`;
  }) && ok('allié : renforts acceptés, Frappe refusée, objectif 10 gagné à d = 0, défaite (raison 4) si l\'allié tombe');
  // Missions à durée (tenir, survivre puis conquérir, couper, l'allié tient) : toute la carte prise = victoire sans
  // attendre le chrono (raison 7), une seule région encore à un rival ou neutre = la partie continue.
  garder('carte entière', () => {
    const duree = [];
    D.missions.forEach((f, x) => { if ([5, 6, 8, 10].includes(f.objectif.t)) duree.push(x + 1); });
    if (duree.length < 15) return `${duree.length} missions à durée seulement`;
    for (const mi of duree) {
      const e = nouvelle(mi);
      const allie = (c) => c > 0 && e.eq[c] === e.eq[0];
      for (let i = 0; i < e.nn; i++) if (!allie(e.p[i])) e.p[i] = 0;
      e.fl = e.fl.filter((f) => f.c === 0 || allie(f.c)); e.sg = e.sg.filter((s) => s.c === 0 || allie(s.c));
      const r = simNu.fin(e);
      if (!r || r.gagnant !== 0 || r.raison !== 7 || r.etoiles < 1) return `mission ${mi}, carte entière : fin ${JSON.stringify(r)}`;
      const e2 = nouvelle(mi);
      for (let i = 0; i < e2.nn; i++) if (!(e2.p[i] > 0 && e2.eq[e2.p[i]] === e2.eq[0])) e2.p[i] = 0;
      const k = e2.p.findIndex((c, i) => i < e2.nn && c === 0 && i !== e2.c[0].cap && !e2.o.l.includes(i));
      e2.p[k] = -1;
      const r2 = simNu.fin(e2);
      if (r2 && r2.raison === 7) return `mission ${mi} : raison 7 avec une région neutre restante`;
    }
    const e3 = nouvelle(1);
    for (let i = 0; i < e3.nn; i++) e3.p[i] = 0;
    const r3 = simNu.fin(e3);
    if (r3 && r3.raison === 7) return 'mission 1 (sans chrono) : raison 7';
  }) && ok('carte entière : les missions à durée sont gagnées dès que toute la carte est prise (raison 7), pas avant');
  garder('couper', () => {
    const e = nouvelle(32), l = e.o.l, d0 = D.missions[31].objectif.d;
    if (l.length !== D.missions[31].passages.nb) return `${l.length} passages`;
    for (const i of l) e.p[i] = 0;
    for (let k = 0; k < 5; k++) simNu.pas(e, faux1);
    if (e.o.d !== d0 - 5) return `compte ${e.o.d}, ${d0 - 5} attendu`;
    e.p[l[0]] = 1; simNu.pas(e, faux1);
    if (e.o.d !== d0 || e.o.x !== 0 || !e.o.ok) return `un passage perdu : d ${e.o.d}, x ${e.o.x}, ok ${e.o.ok}`;
    for (const i of l) e.p[i] = 0;
    e.o.d = 1; simNu.pas(e, faux1);
    const r = simNu.fin(e);
    if (!r || r.gagnant !== 0) return `fin ${JSON.stringify(r)}`;
  }) && ok('couper : le compte descend passages tenus, repart de d si un passage tombe, victoire à 0');
  garder('ravitaillement', () => {
    const e = nouvelle(43), m = e.m, cap = e.c[0].cap;
    if (!(cap >= 0 && e.p[cap] === 0)) return 'base du joueur absente';
    // Une région du joueur coupée de sa base par des voisins ennemis : demi-production au tick 10 suivant.
    const i = e.p.findIndex((p, x) => p === 0 && x !== cap && !m.vois[x].includes(cap));
    if (i < 0) return 'aucune région du joueur loin de sa base';
    for (const j of m.vois[i]) e.p[j] = 1;
    while ((e.k + 1) % 10) { simNu.pas(e, faux1); e.k++; }
    simNu.pas(e, faux1);
    if (e.rav[i] !== 0) return 'région coupée toujours ravitaillée';
    if (e.rav[cap] !== 1) return 'la base doit rester ravitaillée';
    // Base avancée (camps[0].base, mission 52) : c'est elle, la « capitale » du camp dans la mission.
    const b = nouvelle(52), cb = b.c[0].cap, P3 = simNu.planete(3);
    if (cb !== b.m.cap[0] || b.m.gi[cb] !== P3.centre[22]) return 'mission 52 : la base doit être le centre de la province 22';
    for (let k = 0; k < 20; k++) { simNu.pas(b, faux1); b.k++; }
    for (let x = 0; x < b.nn; x++) if (b.p[x] === 0 && b.rav[x] !== 1 && parties(b.nn, b.m.vois, -1, (y) => b.p[y] === 0).length === 1) return 'mission 52 : région reliée à la base non ravitaillée';
  }) && ok('ravitaillement : la base de mission alimente, une région coupée passe à rav = 0');
  garder('personnalités', () => {
    const choix = (m, c, ty1, ty2) => {
      const e = nouvelle(m), z = e.m, L = D.echelles[e.ac].liste, s = e.p.indexOf(c);
      for (let i = 0; i < e.nn; i++) { e.f[i] = 1; if (e.p[i] === c && i !== s) e.p[i] = -1; }
      for (const j of z.vois[s]) e.p[j] = -1;
      const [a, b] = z.vois[s];
      z.t[a] = L.indexOf(ty1); z.t[b] = L.indexOf(ty2); e.f[a] = e.f[b] = 10; e.f[s] = 300;
      for (const j of z.vois[s]) if (j !== a && j !== b) e.f[j] = 1000;
      const o = simNu.bot(e, c, 2, faux1).find((x) => x[0] === 1 && (x[2] === a || x[2] === b));
      return o ? (o[2] === a ? 1 : 2) : 0;
    };
    if (choix(25, 1, 'ceinture', 'tellurique') !== 1) return 'les Essaims ne vont pas d\'abord vers la ceinture';
    if (choix(24, 1, 'geante', 'lune') !== 1) return 'la Guilde ne va pas d\'abord vers la géante';
    const s = new TR.Simulation(simTR, 91, configMission(simTR, 46, 91, 2));
    const an = [];
    while (!s.resultat && s.k() < 2600) { s.avancer([]); for (const v of s.etat.ev) if (v[0] === 8 && v[1] === 1) an.push(s.k()); }
    // Offensive déclenchée sur un camp puissant : au plus N nœuds de départ, chacun à 100 %.
    const eo = nouvelle(46);
    for (let i = 0; i < eo.nn; i++) if (eo.p[i] === 1) eo.f[i] = 400;
    eo.c[1].mem[3] = 30;
    const envois = simNu.bot(eo, 1, 2, faux1).filter((o) => o[0] === 1 && o[3] === 100);
    const maxSources = new Set(envois.map((o) => o[1])).size;
    if (!maxSources) return 'Hégémonie : aucun envoi à 100 % pendant une offensive';
    if (an.length < 2) return `Hégémonie : ${an.length} offensive(s) annoncée(s) en ${s.k()} ticks`;
    if (an[1] - an[0] !== D.factions[5].perso.offensive.periode) return `Hégémonie : annonces espacées de ${an[1] - an[0]} ticks`;
    if (maxSources > D.factions[5].perso.offensive.sources) return `Hégémonie : ${maxSources} envois à 100 % pendant une offensive`;
    mesures.offensives = `${an.length} annonces, ${maxSources} sources au plus`;
  }) && ok(`personnalités : Essaims vers la ceinture, Guilde vers les géantes, Hégémonie : offensives toutes les 1 200 ticks (${mesures.offensives})`);
  garder('capacités des robots', () => {
    let relais = 0, chantiers = 0, frappes = 0, ticks = 0;
    for (const m of [46, 53, 54, 58]) {
      const s = new TR.Simulation(simTR, 92 + m, configMission(simTR, m, 92 + m, 3));
      for (const cc of s.etat.c) cc.t = 127;
      for (let c = 0; c < s.etat.ctl.length; c++) s.etat.ctl[c] = 3;
      while (!s.resultat && s.k() < 2000) { s.avancer([]); for (const v of s.etat.ev) { if (v[0] === 6 && v[2] === 2) relais++; if (v[0] === 6 && v[2] === 3) chantiers++; if (v[0] === 7 && v[1] === 4) frappes++; } }
      ticks += s.k();
    }
    mesures.capRobots = `${relais} relais, ${chantiers} chantiers, ${frappes} frappes en ${ticks} ticks`;
    if (!relais || !chantiers) return mesures.capRobots;
    if (!frappes) avertir('capacités des robots', `aucune Frappe jouée (${mesures.capRobots})`);
  }) && ok(`capacités des robots de niveau 3 : ${mesures.capRobots}`);

  // ------------------------------------------------------------------------
  titre(`14 c. Déterminisme des actes 2 et 3 (${TICKS_SUITE} ticks par mission : rejeu, reprise, JEL_TR.Simulation contre PE_PILOTE)`);
  for (const m of [26, 34, 38, 43, 46, 49, 50, 53]) {
    const graine = 5100 + m;
    controleRejeu(`mission ${m}`, () => configMission(simTR, m, graine, 0), graine, TICKS_SUITE, Math.floor(TICKS_SUITE / 2), false);
  }

  // ------------------------------------------------------------------------
  let G2 = 21, tG2 = 0;
  for (let m = 21; m <= 60; m++) { const c = simNu.configMission(m, { graine: 1 }), e = simNu.depart(c.graine, c); if (e.nn > tG2) { tG2 = e.nn; G2 = m; } }
  titre(`14 d. Plus grande zone des actes 2 et 3 (mission ${G2}, ${tG2} nœuds) : instantané avec 300 flottes, coût d'un tick`);
  try {
    const config = configMission(simTR, G2, 9101, 0);
    config.ctl = config.ctl.map(() => 0);
    const s = new TR.Simulation(simTR, 9101, config), alea = hasardTest(9101);
    let seq = 0;
    for (let k = 0; k < 400 && !s.resultat; k++) {
      const liste = [];
      for (let c = 0; c < s.etat.ctl.length; c++) for (const o of ordresEssai(simTR, s.etat, c, alea)) liste.push([c, ++seq, ...o]);
      s.avancer(liste);
    }
    const e = s.etat, modele = e.fl.length ? e.fl.slice() : [{ i: 0, c: 0, n: 7, d: 0, v: 1, q: 1, L: 12 }];
    while (e.fl.length < 300) { const f = modele[e.fl.length % modele.length]; e.fl.push({ i: e.nf++, c: f.c, n: f.n, d: f.d, v: f.v, q: f.q, L: f.L }); }
    const texte = JSON.stringify(simNu.exporter(e));
    mesures.instantaneSuite = texte.length;
    if (TR.hacher(simNu.empreinte(simNu.importer(JSON.parse(texte)))) !== TR.hacher(simNu.empreinte(e))) probleme('instantané', 'empreinte différente après importer');
    else if (texte.length >= 25000) probleme('instantané', `${texte.length} caractères (< 25 000 attendus)`);
    else ok(`instantané : ${texte.length} caractères (${e.nn} nœuds, 300 flottes)`);
  } catch (err) { probleme('instantané', err.message); }
  try {
    const mesure = { ms: 0, max: 0, ticks: 0 };
    let graine = 5301, n = 0;
    { const c = configMission(simTR, G2, 5300, 3); c.ctl = c.ctl.map(() => 3); jouerSeul(simTR, 5300, c, 300); }
    while (mesure.ticks < 2000 && n < 50) { const c = configMission(simTR, G2, graine++, 3); c.ctl = c.ctl.map(() => 3); jouerSeul(simTR, graine, c, 2000 - mesure.ticks, mesure); n++; }
    const moy = mesure.ms / Math.max(1, mesure.ticks);
    mesures.msTickSuite = moy;
    const detail = `${ms(moy)} par tick (pire ${ms(mesure.max)}) sur ${mesure.ticks} ticks, ${n} partie(s), mission ${G2}, robots de niveau 3 partout`;
    if (moy > 1) probleme('coût', `${detail} : plus de 1 ms`);
    else if (moy > 0.5) avertir('coût', `${detail} : au-dessus des 0,5 ms visés`);
    else ok(`coût : ${detail}`);
  } catch (err) { probleme('coût', err.message); }

  // ------------------------------------------------------------------------
  const NB = AVEC_MISSIONS ? PARTIES_SUITE : 1;
  const bloquant = !SOUPLE && !RAPIDE;
  const ecart = (sujet, texte) => { if (bloquant) probleme(sujet, texte); else avertir(sujet, texte); };
  titre(`14 e. Missions 21 à 60 : ${NB} partie(s) par mission et par robot à la place du joueur${AVEC_MISSIONS ? ` (niveau 2 ≥ 70 % ; niveau 1 ≤ 70 % sur 33 à 40, ≤ 50 % sur 45 à 60${bloquant ? '' : ' ; non bloquant'})` : ' (doivent aller au bout sans erreur)'}`);
  mesures.missionsSuite = {};
  const lignes = [], niveaux = AVEC_MISSIONS ? [2, 1] : [2], taches = [];
  for (let m = 21; m <= 60; m++) for (const niveau of niveaux) taches.push({ m, niveau, graines: serie(NB, (i) => 8000 + 100 * m + i) });
  const rival = (fiche) => fiche.camps.some((c, x) => x > 0 && c.eq !== 0);
  const passives = [];
  if (AVEC_MISSIONS) for (let m = 21; m <= 60; m++) {
    const fiche = D.missions[m - 1];
    if (rival(fiche)) passives.push({ m, niveau: 0, graines: serie(PARTIES_PASSIF_SUITE, (i) => 8500 + 100 * m + i), siege: fiche.objectif.t === 5, court: objectifConquete(fiche), limite: objectifConquete(fiche) ? 1500 : 0 });
  }
  const lots = await lancerLots(taches.concat(passives));
  let x = 0;
  for (let m = 21; m <= 60; m++) {
    const fiche = D.missions[m - 1];
    for (const niveau of niveaux) {
      const r = bilanLot(lots[x++], `mission ${m}, robot ${niveau}`), taux = pct(r.v, r.n);
      mesures.missionsSuite[`m${m}n${niveau}`] = { taux, mediane: mediane(r.t) };
      if (AVEC_MISSIONS) {
        const detail = `mission ${m}, robot ${niveau} : ${r.v} / ${r.n} (${taux} %), médiane ${mediane(r.t)} ticks (victoires ${mediane(r.tv)}), ${raisonsDe(r.ra)}`, plafond = plafondRobot1(m);
        if (niveau === 2 && taux < 70) ecart('missions', `${detail} : 70 % attendus`);
        else if (niveau === 1 && rival(fiche) && plafond !== null && taux > plafond) ecart('missions', `${detail} : ${plafond} % au plus attendus`);
        else ok(detail);
        // Temps visé : même règle qu'à l'acte 1 (section 12), hors objectifs à durée fixe.
        if (niveau === 2 && r.tv.length && fiche.dv && ![5, 6, 8, 10].includes(fiche.objectif.t)) {
          const borne = Math.min(fiche.dv * 10, Math.max(Math.round((fiche.dv * 5) / 100) * 100, Math.round((1.5 * mediane(r.tv)) / 100) * 100));
          if (Math.abs(borne - fiche.tvise) > 100) avertir('temps visé', `mission ${m} : tvise ${fiche.tvise}, la règle donne ${borne} (médiane des victoires ${mediane(r.tv)} ticks, dv ${fiche.dv} s)`);
        }
      } else lignes.push(`m${m} ${r.v ? 'gagnée' : 'perdue'} au tick ${r.t[0]} (raison ${Object.keys(r.ra)[0]})`);
    }
  }
  if (!AVEC_MISSIONS) ok(`missions 21 à 60 jouées jusqu'au bout avec un robot de niveau 2 : ${lignes.join(' ; ')}`);
  // Joueur sans ordre : perd toute mission où un rival attaque ; « tenir » (objectif 5) : sa base est assiégée à chaque partie.
  if (AVEC_MISSIONS) {
    titre(`14 f. Missions 21 à 60 avec un rival, joueur sans ordre (${PARTIES_PASSIF_SUITE} parties par mission : toutes perdues)`);
    let vues = 0;
    for (const t of passives) {
      const tenir = D.missions[t.m - 1].objectif.t === 5, r = bilanLot(lots[x++], `mission ${t.m}, joueur sans ordre`);
      mesures.missionsSuite[`m${t.m}passif`] = { taux: pct(r.v, r.n), mediane: 0 };
      if (r.v > 0 || (tenir && r.assiegees < r.n)) ecart('missions', `mission ${t.m}, joueur sans ordre : ${r.v} / ${r.n} victoires${tenir ? `, base assiégée dans ${r.assiegees} parties` : ''} : 0 victoire${tenir ? ' et un siège à chaque partie' : ''} attendus`);
      else vues++;
    }
    ok(`joueur sans ordre battu sur ${vues} missions à rival`);
  }
}

await controlerActesSuite();

// --------------------------------------------------------------------------
// 15. Actes 4 et 5 et bac à sable : cartes, règles, déterminisme, instantané, coût, parties (CONTRAT-LOT3)
// --------------------------------------------------------------------------

const ACTES_FIN = [[4, 61, 80, 220, 260], [5, 81, 100, 240, 280]];
const MISSIONS_REJEU_FIN = [67, 72, 78, 86, 93, 100];
const MISSION_PONT = 67;                                          // la seule zone en deux morceaux (le Pont les relie)
const TICKS_FIN = RAPIDE ? 800 : 2500;
const PARTIES_FIN = RAPIDE ? 3 : 20;                              // parties par mission 61 à 100 et par robot avec --missions
const PARTIES_GLOUTON = RAPIDE ? 2 : 6;                           // parties du joueur glouton par mission à rival
const PARTIES_CIBLE = RAPIDE ? 2 : 8;                             // parties du joueur ciblé par mission à rival
// Durée plancher d'une victoire du joueur ciblé : 20 % de la durée visée de la mission, 60 s au moins.
const plancherCible = (fiche) => Math.max(600, fiche.dv * 2);
// Pont permis pour le camp : deux de ses nœuds non voisins, à 1,5 × l'arête moyenne au plus (le plus proche d'abord).
function chercherPont(sim, e, camp = 0) {
  const m = e.m, lim = TR.div(m.dmoy * 150, 100);
  let meilleur = null, bd = 0;
  for (let a = 0; a < e.nn; a++) {
    if (e.p[a] !== camp || e.f[a] <= D.capacites[7].cout) continue;
    for (let b = 0; b < e.nn; b++) {
      if (b === a || e.p[b] !== camp || m.vois[a].includes(b)) continue;
      const dx = m.x[a] - m.x[b], dy = m.y[a] - m.y[b], d = TR.racineEntiere(dx * dx + dy * dy);
      if (d <= lim && (!meilleur || d < bd) && sim.valide(e, camp, [5, a, b])) { meilleur = [5, a, b]; bd = d; }
    }
  }
  return meilleur;
}
// Capacités jouées par le « joueur » des rejeux : Essaimage au début, Sursaut et Pont dès qu'ils sont prêts.
function ordresCapacites(sim, e, k) {
  const l = [], cc = e.c[0];
  if (k === 2 && sim.valide(e, 0, [7, 1])) l.push([7, 1]);
  if (k % 40 === 5 && sim.valide(e, 0, [6])) l.push([6]);
  if (k % 60 === 7 && cc.r[2] === 0 && (cc.t & 128)) { const o = chercherPont(sim, e); if (o) l.push(o); }
  return l;
}

async function controlerActesFin() {
  titre('15 a. Cartes des actes 4 et 5 (connexes, tailles, 24 provinces, routes, zones de 15 à 120 nœuds, conquêtes)');
  for (const [acte, debut, fin, nMin, nMax] of ACTES_FIN) {
    const sujet = `carte de l'acte ${acte}`;
    let fautes = 0;
    const faute = (texte) => { fautes++; if (fautes <= 12) probleme(sujet, texte); };
    const P = simNu.planete(acte), PD = D.planetes[acte], L = D.echelles[acte].liste, tVide = L.indexOf('vide');
    if (!P) { probleme(sujet, 'JEL_SIM.planete renvoie null'); continue; }
    if (simNu.planete(acte) !== P) faute('la carte doit rester en cache (même objet)');
    if (P.forme !== 2) faute(`forme ${P.forme} (2 attendue)`);
    if (P.orb || P.per) faute('pas d\'orbites attendues');
    if (P.n < nMin || P.n > nMax) faute(`${P.n} nœuds (${nMin} à ${nMax} attendus)`);
    if (P.nProv !== 24 || P.cellules.length !== 24) faute(`${P.nProv} provinces (24 attendues)`);
    let dMin = 9, dMax = 0, longues = 0;
    for (let i = 0; i < P.n; i++) {
      if (![P.x[i], P.y[i]].every((v) => Number.isInteger(v) && v >= 0 && v <= 4096)) faute(`nœud ${i} : position non entière ou hors carte`);
      const v = P.vois[i];
      dMin = Math.min(dMin, v.length); dMax = Math.max(dMax, v.length);
      for (let x = 0; x < v.length; x++) {
        if (x && v[x] <= v[x - 1]) faute(`nœud ${i} : voisins non triés`);
        if (!P.vois[v[x]].includes(i)) faute(`nœud ${i} : voisin ${v[x]} non symétrique`);
        const Lr = P.lv[i][x], vide = tVide >= 0 && (P.t[i] === tVide || P.t[v[x]] === tVide);
        if (!Number.isInteger(Lr) || (vide ? Lr < 40 || Lr > 90 : Lr < 5 || Lr > 40)) faute(`route ${i}-${v[x]} : longueur ${Lr}`);
        if (vide) longues++;
      }
    }
    if (dMin < 2 || dMax > 6) faute(`routes par nœud : ${dMin} à ${dMax} (2 à 6 attendues)`);
    if (parties(P.n, P.vois, -1).length !== 1) faute('carte non connexe');
    let art = 0;
    for (let a = 0; a < P.n; a++) if (parties(P.n, P.vois, a).length > 1) art++;
    if (art) faute(`${art} nœud(s) d'articulation`);
    const vues = new Uint8Array(P.n);
    let tMin = 99, tMax = 0;
    for (let k = 0; k < P.nProv; k++) {
      const cel = P.cellules[k];
      tMin = Math.min(tMin, cel.length); tMax = Math.max(tMax, cel.length);
      if (cel.length < PD.taille[0] || cel.length > PD.taille[1]) faute(`province ${k} : ${cel.length} nœuds (${PD.taille[0]} à ${PD.taille[1]} attendus)`);
      for (const i of cel) { if (P.prov[i] !== k) faute(`nœud ${i} mal rangé`); vues[i]++; }
      if (parties(P.n, P.vois, -1, (i) => P.prov[i] === k).length !== 1) faute(`province ${k} non contiguë`);
      const vp = new Set();
      for (const i of cel) for (const j of P.vois[i]) if (P.prov[j] !== k) vp.add(P.prov[j]);
      if ([...vp].sort((a, b) => a - b).join(',') !== P.voisinsProv[k].join(',')) faute(`province ${k} : voisinsProv incohérent`);
    }
    if ([...vues].some((v) => v !== 1)) faute('les provinces ne couvrent pas exactement la carte');
    for (let k = 1; k < P.nProv; k++) if (P.niveau[k] < P.niveau[k - 1]) faute(`province ${k} : numérotation non croissante`);
    if (P.prov[P.capitales[0]] !== 0 || P.t[P.capitales[0]] !== L.length - 1 || P.depart[0] !== 0) faute('capitale du joueur : province 0, type « héritée », province au joueur attendus');
    for (const nom of L) if (!P.t.some((t) => L[t] === nom)) faute(`aucun nœud de type ${nom}`);
    // Rivaux au départ.
    const parFa = {};
    P.depart.forEach((fa, k) => { if (fa > 0) (parFa[fa] = parFa[fa] || []).push(k); });
    let detail;
    if (acte === 4) {
      const noeuds = (parFa[7] || []).reduce((s, k) => s + P.cellules[k].length, 0), part = pct(noeuds, P.n);
      if (Object.keys(parFa).join() !== '7') faute(`rivaux au départ : ${Object.keys(parFa)} (le Silence seul attendu)`);
      if (part < 33 || part > 47) faute(`le Silence tient ${part} % de la carte (environ 40 % attendus)`);
      if (P.prov[P.capitales[7]] !== P.provCoeur || L[P.t[P.capitales[7]]] !== 'coeur') faute('capitale du Silence : au cœur attendue');
      if (!P.provBras || P.provBras.length !== 4 || P.provHalo.length !== 4) faute('repères provBras, provHalo attendus');
      if (P.prov[P.capitales[0]] !== P.provBras[0][P.provBras[0].length - 1]) faute('capitale du joueur : au bout de son bras attendue');
      // Routes directes entre bras voisins : 2 à 3 par paire.
      for (let a = 0; a < 4; a++) { const b = (a + 3) % 4; let nb = 0; for (let i = 0; i < P.n; i++) if (P.bras[i] === a) for (const j of P.vois[i]) if (P.bras[j] === b) nb++; if (nb < 2 || nb > 3) faute(`bras ${a} et ${b} : ${nb} routes directes (2 à 3 attendues)`); }
      detail = `Silence ${part} %`;
    } else {
      if (Object.keys(parFa).sort().join() !== '10,11,8,9') faute(`rivaux au départ : ${Object.keys(parFa)} (factions 8 à 11 attendues)`);
      for (const [fa, l] of Object.entries(parFa)) { if (l.length < 3 || l.length > 4) faute(`faction ${fa} : ${l.length} provinces (3 à 4 attendues)`); if (!l.includes(P.prov[P.capitales[fa]])) faute(`faction ${fa} : capitale hors de ses provinces`); }
      if (longues < 8) faute(`${longues} extrémités de routes de grand vide seulement`);
      detail = `${P.vides.length} grands vides`;
    }
    if (!fautes) ok(`${sujet} : ${P.n} nœuds, 24 provinces de ${tMin} à ${tMax}, ${dMin} à ${dMax} routes par nœud, connexe, sans articulation, ${detail}`);
    // Zones et conquêtes.
    fautes = 0;
    const fauteZ = (m, texte) => { fautes++; if (fautes <= 24) probleme(`mission ${m}`, texte); };
    if (simNu.missionsActe(acte).join(',') !== Array.from({ length: 20 }, (_, i) => debut + i).join(',')) fauteZ(debut, 'missionsActe incohérent');
    const conquises = new Map(), bilans = [];
    let zMin = 1e9, zMax = 0;
    for (let m = debut; m <= fin; m++) {
      const fiche = D.missions[m - 1];
      if (fiche.verrou) { fauteZ(m, 'fiche encore verrouillée'); continue; }
      const av = simNu.proprietaires(acte, m);
      for (const k of simNu.conquetes(m)) { if (conquises.has(k)) fauteZ(m, `province ${k} déjà conquise à la mission ${conquises.get(k)}`); if (av[k] === 0) fauteZ(m, `province ${k} déjà au joueur`); conquises.set(k, m); }
      if (!simNu.conquetes(m).length) fauteZ(m, 'aucune province conquise');
      // Ce qui est conquis touche l'empire (province au joueur, ou conquise par la même mission).
      const cq = simNu.conquetes(m), monde = new Set(av.map((p, k) => (p === 0 ? k : -1)).filter((k) => k >= 0));
      for (let t = 0; t < cq.length; t++) for (const k of cq) if (!monde.has(k) && P.voisinsProv[k].some((b) => monde.has(b))) monde.add(k);
      for (const k of cq) if (!monde.has(k)) fauteZ(m, `province ${k} conquise sans toucher l'empire`);
      let e;
      try { const c = simNu.configMission(m, { graine: 4321 }); e = simNu.depart(c.graine, c); } catch (err) { fauteZ(m, `depart : ${err.message}`); continue; }
      const z = e.m, n = z.n, morceaux = parties(n, z.vois, -1).length;
      zMin = Math.min(zMin, n); zMax = Math.max(zMax, n); bilans.push(`m${m} ${n}`);
      if (n < 15 || n > 120) fauteZ(m, `${n} nœuds actifs (15 à 120 attendus)`);
      if (z.forme !== 2) fauteZ(m, `m.forme ${z.forme} (2 attendue)`);
      if (m === MISSION_PONT) { if (morceaux !== 2) fauteZ(m, `${morceaux} morceaux (2 attendus : aucune route vers l'objectif)`); if (!chercherPont(simNu, e)) fauteZ(m, 'aucun Pont possible au départ'); }
      else if (morceaux !== 1) fauteZ(m, `zone en ${morceaux} morceaux`);
      fiche.camps.forEach((c, x) => { if (!e.p.includes(x)) fauteZ(m, `camp ${x} sans territoire au départ`); if (!(z.cap[x] >= 0 && e.p[z.cap[x]] === x)) fauteZ(m, `base du camp ${x} hors de son camp`); });
      const o = e.o;
      if ([3, 4, 5, 8, 9].includes(o.t) && !o.l.length) fauteZ(m, `objectif ${NOM_ORDRE(o.t)} sans nœud`);
      if ((o.t === 1 || o.t === 2) && o.x >= o.n) fauteZ(m, `objectif déjà atteint (${o.x} / ${o.n})`);
      if (o.t === 3 && o.x >= o.l.length) fauteZ(m, 'objectif déjà atteint');
      if ((o.t === 4 || o.t === 9) && (o.x !== 0 || (o.t === 9 && e.p[o.l[0]] > 0))) fauteZ(m, 'balise déjà prise au départ');
      if (o.t === 7 && !o.l.every((c) => e.p.includes(c))) fauteZ(m, 'camp à éliminer absent');
      if ([6, 8].includes(o.t) && !(fiche.tmax > 0)) fauteZ(m, 'tmax attendu');
      if (fiche.secondaire.t === 3 && !e.s2.l.length) fauteZ(m, 'objectif secondaire sans nœud');
      if (fiche.capacite && !D.capacites.some((c) => c.id === fiche.capacite && c.mission === m)) fauteZ(m, `capacité ${fiche.capacite} : mauvaise mission`);
      const attendu = D.capacites.filter((c) => c.mission < m).reduce((s, c) => s | c.bit, 0);
      if (fiche.tech !== attendu) fauteZ(m, `tech ${fiche.tech} (${attendu} attendu)`);
    }
    for (let k = 0; k < 24; k++) if (P.depart[k] !== 0 && !conquises.has(k)) fauteZ(fin, `province ${k} jamais conquise`);
    if (simNu.proprietaires(acte, fin + 1).some((p) => p !== 0)) fauteZ(fin, `après la mission ${fin}, toute la carte n'est pas au joueur`);
    if (!fautes) ok(`zones de l'acte ${acte} : ${zMin} à ${zMax} nœuds actifs (${bilans.join(', ')}), chaque province conquise une fois en touchant l'empire, toute la carte au joueur après la mission ${fin}`);
    mesures[`zones${acte}`] = `${zMin} à ${zMax}`;
  }

  titre('15 b. Pont stellaire, Essaimage, Sursaut, vagues, rivaux entre eux (règles isolées)');
  const nouvelle = (m, g = 77, ctl0 = 0) => { const c = configMission(simNu, m, g, ctl0); return simNu.depart(c.graine, c); };
  const garder = (sujet, f) => { try { const r = f(); if (r) probleme(sujet, r); else return true; } catch (err) { probleme(sujet, err.message); } return false; };
  const compter = (m, ctl0, ticks, graine, f) => { const c = configMission(simTR, m, graine, ctl0); const s = new TR.Simulation(simTR, graine, c); while (!s.resultat && s.k() < ticks) { s.avancer([]); for (const v of s.etat.ev) f(v, s); } return s; };
  garder('pont', () => {
    const e = nouvelle(MISSION_PONT), o = chercherPont(simNu, e), cp = D.capacites[7];
    if (!o) return 'aucun pont possible';
    const [, a, b] = o, fa = e.f[a];
    if (parties(e.nn, e.m.vois, -1).length !== 2) return 'zone déjà reliée';
    if (simNu.valide(e, 1, o)) return 'pont accepté pour un camp qui n\'a pas ces nœuds';
    const sansTech = nouvelle(66);
    if (chercherPont(simNu, sansTech)) return 'pont accepté sans la capacité (mission 66)';
    simNu.ordre(e, 0, o);
    if (e.f[a] !== fa - cp.cout || e.c[0].r[2] !== cp.recharge) return `coût ou recharge : f ${fa} → ${e.f[a]}, recharge ${e.c[0].r[2]}`;
    if (!e.m.vois[a].includes(b) || !e.m.vois[b].includes(a) || e.pont.length !== 1) return 'route absente après le pont';
    if (parties(e.nn, e.m.vois, -1).length !== 1) return 'le pont doit relier les deux morceaux';
    if (simNu.valide(e, 0, [5, a, b]) || chercherPont(simNu, e)) return 'recharge ignorée';
    e.c[0].r[2] = 0;
    if (simNu.valide(e, 0, [5, a, b])) return 'pont entre deux nœuds déjà voisins accepté';
    const lim = TR.div(e.m.dmoy * 150, 100), loin = e.p.findIndex((p, i) => p === 0 && i !== a && TR.racineEntiere((e.m.x[i] - e.m.x[a]) ** 2 + (e.m.y[i] - e.m.y[a]) ** 2) > lim);
    if (loin >= 0 && simNu.valide(e, 0, [5, a, loin])) return 'pont trop long accepté';
    const c = simNu.importer(JSON.parse(JSON.stringify(simNu.exporter(e))));
    if (!c.m.vois[a].includes(b) || c.pont.length !== 1) return 'route perdue à la reprise';
    if (TR.hacher(simNu.empreinte(c)) !== TR.hacher(simNu.empreinte(e))) return 'empreinte différente après reprise';
    const e2 = nouvelle(MISSION_PONT); simNu.ordre(e2, 0, o);
    if (simNu.duree(e2, a, b) === null) return 'trajet impossible sur le pont';
  }) && ok('Pont stellaire : 150 forces, recharge de 300 ticks, deux nœuds à soi non voisins à 1,5 × l\'arête moyenne, route gardée à la reprise et hachée');
  garder('essaimage', () => {
    const e = nouvelle(72), m = e.m, R = D.essaim, GROS = 30000;
    const besoin = (q, j) => TR.div(TR.div(q.f[j] * (100 + simNu.defense(q, j)), 100) * R.ratio, 100) + 1;
    // Deux voisins d'un même neutre passent au joueur, bien garnis ; tous ses autres nœuds sont vidés.
    for (let i = 0; i < e.nn; i++) if (e.p[i] === 0) e.f[i] = 10;
    const neutre = e.p.findIndex((p, j) => p < 0 && m.vois[j].length >= 2);
    if (neutre < 0) return 'aucun neutre';
    const srcs = m.vois[neutre].slice(0, 2);
    for (const i of srcs) { e.p[i] = 0; e.f[i] = GROS; }
    const sans = JSON.parse(JSON.stringify(simNu.exporter(e)));
    for (let t = 0; t < e.nn; t++) { simNu.pas(e, faux1); e.k++; }
    if (e.fl.length) return 'envoi sans Essaimage';
    const e2 = simNu.importer(sans);
    if (!simNu.valide(e2, 0, [7, 1])) return 'interrupteur refusé';
    simNu.ordre(e2, 0, [7, 1]);
    for (let t = 0; t < e2.nn && !e2.fl.length; t++) { simNu.pas(e2, faux1); e2.k++; }
    if (e2.fl.length !== 1) return `${e2.fl.length} envois en un tick (1 attendu)`;
    const fl = e2.fl[0];
    if (e2.p[fl.d] !== 0) return 'envoi depuis un nœud qui n\'est pas au joueur';
    if (e2.p[fl.v] >= 0) return 'envoi vers un non-neutre';
    if (fl.n !== besoin(e2, fl.v)) return `envoi de ${fl.n} forces (${besoin(e2, fl.v)} attendues : défense × ${R.ratio} %)`;
    if (e2.f[fl.d] * 100 < (e2.f[fl.d] + fl.n) * R.garde - 100) return 'le nœud garde moins que sa réserve';
    const faible = Math.min(...e2.m.vois[fl.d].filter((j) => e2.p[j] < 0).map((j) => e2.f[j]));
    if (e2.f[fl.v] !== faible) return 'le voisin neutre le plus faible n\'est pas choisi';
    const visee = fl.v;
    for (let t = 0; t < 8; t++) {
      const avant = e2.fl.length; simNu.pas(e2, faux1); e2.k++;
      if (e2.fl.length > avant + 1) return 'plus d\'un envoi en un tick';
      if (e2.fl.filter((x) => x.v === visee).length > 1) return 'deux envois vers le même neutre';
    }
    simNu.ordre(e2, 0, [7, 0]); e2.fl.length = 0;
    for (let t = 0; t < e2.nn; t++) { simNu.pas(e2, faux1); e2.k++; }
    if (e2.fl.length) return 'envoi après l\'arrêt de l\'interrupteur';
    // Un nœud trop faible pour prendre un neutre n'envoie rien.
    const e3 = simNu.importer(sans);
    for (let i = 0; i < e3.nn; i++) if (e3.p[i] === 0) e3.f[i] = 10;
    simNu.ordre(e3, 0, [7, 1]);
    for (let t = 0; t < e3.nn; t++) { simNu.pas(e3, faux1); e3.k++; }
    if (e3.fl.length) return 'envoi d\'un nœud trop faible';
  }) && ok(`Essaimage : au plus un envoi par tick, défense × ${D.essaim.ratio} % vers le voisin neutre le plus faible, ${D.essaim.garde} % gardés, un neutre visé une seule fois ; interrupteur`);
  garder('rivaux de niveau 3', () => {
    if (!(D.robots[3].ratioGrand > D.robots[2].ratio)) return 'le niveau 3 doit garder une vraie marge aux actes 4 et 5';
    let sorties = 0;
    compter(96, 0, 500, 77, (v, s) => { if (v[0] === 2 && v[4] === 1 && v[2] === s.etat.m.cap[1]) sorties++; });
    if (sorties) return `${sorties} flotte(s) parties de la capitale visée par la mission 96`;
  }) && ok('rivaux de niveau 3 : marge d\'attaque aux actes 4 et 5, capitale visée jamais vidée (garde du trône)');
  garder('sursaut', () => {
    const e = nouvelle(86), cs = D.capacites[9];
    if (!simNu.valide(e, 0, [6])) return 'ordre refusé';
    const i = e.p.findIndex((p, x) => p === 0 && x !== e.c[0].cap);
    if (i < 0) return 'aucun nœud du joueur hors de sa base';
    const aucun = simNu.importer(JSON.parse(JSON.stringify(simNu.exporter(e))));
    for (const q of [e, aucun]) { q.acc[i] = 0; q.f[i] = 10; }
    simNu.ordre(e, 0, [6]);
    if (e.c[0].s !== cs.duree || e.c[0].r[1] !== cs.recharge) return `durée ${e.c[0].s}, recharge ${e.c[0].r[1]}`;
    if (simNu.valide(e, 0, [6])) return 'recharge ignorée';
    simNu.pas(e, faux1); simNu.pas(aucun, faux1);
    const g1 = e.acc[i] + 1000 * (e.f[i] - 10), g0 = aucun.acc[i] + 1000 * (aucun.f[i] - 10);
    if (g1 !== 3 * g0) return `production ${g1} au lieu de 3 × ${g0}`;
    for (let k = 0; k < 100; k++) simNu.pas(e, faux1);
    if (e.c[0].s !== 0) return 'Sursaut non terminé après 100 ticks';
  }) && ok('Sursaut : production × 3 pendant 100 ticks, recharge de 900 ticks');
  garder('vagues', () => {
    const vu = {};
    // Partie entre robots sur une mission longue : le camp 1 est le Silence (77) ou la Marée (81), sa cadence se mesure.
    for (const [m, per] of [[77, 900], [81, 1200]]) {
      const c = configMission(simTR, m, 300 + m, 0), s = new TR.Simulation(simTR, 300 + m, c), an = [];
      s.etat.tmax = 0; s.etat.o.d = 999999;
      while (s.k() < 3000 && s.etat.c[1].v) { s.avancer([]); s.resultat = null; for (const v of s.etat.ev) if (v[0] === 8 && v[1] === 1) an.push(s.k()); }
      if (an.length < 2) return `mission ${m} : ${an.length} annonce(s) en ${s.k()} ticks`;
      if (an[1] - an[0] !== per) return `mission ${m} : annonces espacées de ${an[1] - an[0]} ticks (${per} attendus)`;
      vu[m] = an.length;
    }
    mesures.vagues = JSON.stringify(vu);
  }) && ok(`vagues du Silence (900 ticks) et offensives de la Marée (1 200 ticks) annoncées (${mesures.vagues})`);
  garder('robots', () => {
    let ponts2 = 0; compter(MISSION_PONT, 2, 3000, 411, (v) => { if (v[0] === 7 && v[1] === 5 && v[3] === 0) ponts2++; });
    if (!ponts2) return 'le robot de niveau 2 ne pose pas de pont à la mission 67';
    const n = { 5: 0, 6: 0, 7: 0 };
    for (const m of [80, 99, 100]) compter(m, 3, 2500, 500 + m, (v) => { if (v[0] === 7 && n[v[1]] !== undefined) n[v[1]]++; });
    mesures.capFin = `${n[5]} ponts, ${n[6]} sursauts, ${n[7]} essaimages`;
    if (!n[6] || !n[7]) return `niveau 3 : ${mesures.capFin}`;
    if (!n[5]) avertir('robots', `niveau 3 : aucun pont (${mesures.capFin})`);
    let entre = 0;
    for (const m of [93, 100]) compter(m, 2, 3000, 600 + m, (v, q) => { if (v[0] === 1 && v[2] > 0 && v[3] > 0 && v[2] !== v[3]) entre++; });
    mesures.entreEux = entre;
    if (!entre) return 'les rivaux ne s\'attaquent jamais entre eux';
  }) && ok(`robots : pont du niveau 2 à la mission 67, capacités du niveau 3 (${mesures.capFin}), ${mesures.entreEux} nœuds pris entre rivaux`);

  // ------------------------------------------------------------------------
  titre('15 c. Bac à sable : cartes, reprise, fin de partie');
  for (const taille of [40, 80, 120]) for (const rivaux of [1, 4]) {
    const sujet = `bac ${taille} galaxies, ${rivaux} rival(aux)`;
    garder(sujet, () => {
      const cfg = simNu.configBac({ taille, rivaux, niveau: 2, graine: 123456 + taille + rivaux, tech: 1023 });
      if (cfg.camps !== rivaux + 1 || cfg.ctl.length !== rivaux + 1 || cfg.ctl[0] !== 0 || cfg.ctl[1] !== 2) return `configuration ${JSON.stringify(cfg)}`;
      const e = simNu.depart(cfg.graine, cfg), z = e.m;
      if (e.nn !== taille) return `${e.nn} galaxies`;
      if (parties(e.nn, z.vois, -1).length !== 1) return 'carte non connexe';
      if (z.forme !== 2 || !z.planete || z.gi.length !== e.nn) return 'carte de mission attendue (forme 2, planete, gi)';
      for (let c = 0; c <= rivaux; c++) if (!(z.cap[c] >= 0 && e.p[z.cap[c]] === c)) return `base du camp ${c}`;
      if (e.o.t !== 7 || e.o.l.length !== rivaux || e.o.x !== rivaux) return `objectif ${JSON.stringify(e.o)}`;
      if (e.c[0].t !== 1023 || e.mi !== 0 || !e.bac) return 'tech ou marque du bac';
      const b = simNu.depart(cfg.graine, simNu.configBac({ taille, rivaux, niveau: 2, graine: cfg.graine, tech: 1023 }));
      if (TR.hacher(simNu.empreinte(b)) !== TR.hacher(simNu.empreinte(e)) || JSON.stringify(b.m.vois) !== JSON.stringify(z.vois)) return 'même graine : carte différente';
      const c2 = simNu.depart(cfg.graine + 1, simNu.configBac({ taille, rivaux, niveau: 2, graine: cfg.graine + 1, tech: 1023 }));
      if (JSON.stringify(c2.m.x) === JSON.stringify(z.x)) return 'autre graine : même carte';
      if (simNu.graineSuivante(cfg.graine) === cfg.graine || simNu.graineSuivante(cfg.graine) !== simNu.graineSuivante(cfg.graine)) return 'graineSuivante';
      const re = simNu.importer(JSON.parse(JSON.stringify(simNu.exporter(e))));
      if (TR.hacher(simNu.empreinte(re)) !== TR.hacher(simNu.empreinte(e)) || !re.bac || re.m.n !== taille) return 'reprise différente';
      const s = new TR.Simulation(simTR, cfg.graine, copie(Object.assign(cfg, { ctl: cfg.ctl.map((_, c) => (c === 0 ? 2 : 1)) })));
      const lim = taille === 40 ? 6000 : 2500;
      while (!s.resultat && s.k() < lim) s.avancer([]);
      if (TR.premierFlottant(s.etat)) return 'état non entier';
      if (s.resultat && s.resultat.etoiles !== 0) return 'étoiles dans le bac';
      // Fin : tous les rivaux éliminés → victoire ; joueur éliminé → défaite.
      const v = simNu.depart(cfg.graine, cfg);
      for (let i = 0; i < v.nn; i++) if (v.p[i] > 0) v.p[i] = 0;
      for (let k = 0; k < 10; k++) { simNu.pas(v, faux1); v.k++; }
      const rv = simNu.fin(v);
      if (!rv || rv.gagnant !== 0 || rv.raison !== 1 || rv.etoiles !== 0) return `victoire : ${JSON.stringify(rv)}`;
      const d = simNu.depart(cfg.graine, cfg);
      for (let i = 0; i < d.nn; i++) if (d.p[i] === 0) d.p[i] = 1;
      const rd = simNu.fin(d);
      if (!rd || rd.gagnant === 0 || rd.raison !== 2) return `défaite : ${JSON.stringify(rd)}`;
    }) && ok(`${sujet} : taille exacte, connexe, carte fixée par la graine, reprise, fin de partie, sans étoiles`);
  }

  // ------------------------------------------------------------------------
  titre(`15 d. Déterminisme des actes 4 et 5 et du bac (${TICKS_FIN} ticks : rejeu, reprise, JEL_TR.Simulation contre PE_PILOTE, avec Pont, Essaimage, Sursaut)`);
  for (const m of MISSIONS_REJEU_FIN) { const graine = 5200 + m; controleRejeu(`mission ${m}`, () => configMission(simTR, m, graine, 0), graine, TICKS_FIN, Math.floor(TICKS_FIN / 2), false, ordresCapacites); }
  for (const [taille, rivaux, niveau] of [[80, 3, 3], [40, 1, 2], [120, 4, 2]]) {
    const graine = 7000 + taille + rivaux;
    controleRejeu(`bac ${taille}/${rivaux}/${niveau}`, () => simTR.configBac({ taille, rivaux, niveau, graine, tech: 1023 }), graine, TICKS_FIN, Math.floor(TICKS_FIN / 2), false, ordresCapacites);
  }

  // ------------------------------------------------------------------------
  let G = 61, tG = 0;
  for (let m = 61; m <= 100; m++) { const c = simNu.configMission(m, { graine: 1 }), e = simNu.depart(c.graine, c); if (e.nn > tG) { tG = e.nn; G = m; } }
  titre(`15 e. Plus grande zone des actes 4 et 5 (mission ${G}, ${tG} nœuds) : instantané avec 300 flottes, coût d'un tick`);
  try {
    const config = configMission(simTR, G, 9201, 0);
    config.ctl = config.ctl.map(() => 0);
    const s = new TR.Simulation(simTR, 9201, config), alea = hasardTest(9201);
    let seq = 0;
    for (let k = 0; k < 400 && !s.resultat; k++) {
      const liste = [];
      for (let c = 0; c < s.etat.ctl.length; c++) for (const o of ordresEssai(simTR, s.etat, c, alea)) liste.push([c, ++seq, ...o]);
      s.avancer(liste);
    }
    const e = s.etat, modele = e.fl.length ? e.fl.slice() : [{ i: 0, c: 0, n: 7, d: 0, v: 1, q: 1, L: 12 }];
    for (let i = 0; i < 6; i++) e.pont.push([i, i + 2, 20]);
    while (e.fl.length < 300) { const f = modele[e.fl.length % modele.length]; e.fl.push({ i: e.nf++, c: f.c, n: f.n, d: f.d, v: f.v, q: f.q, L: f.L }); }
    const texte = JSON.stringify(simNu.exporter(e));
    mesures.instantaneFin = texte.length;
    if (texte.length >= 25000) probleme('instantané', `${texte.length} caractères (< 25 000 attendus)`);
    else ok(`instantané : ${texte.length} caractères (${e.nn} nœuds, 300 flottes, 6 ponts)`);
  } catch (err) { probleme('instantané', err.message); }
  try {
    const mesure = { ms: 0, max: 0, ticks: 0 };
    let graine = 5401, n = 0;
    { const c = configMission(simTR, G, 5400, 3); c.ctl = c.ctl.map(() => 3); jouerSeul(simTR, 5400, c, 300); }
    while (mesure.ticks < 2000 && n < 50) { const c = configMission(simTR, G, graine++, 3); c.ctl = c.ctl.map(() => 3); jouerSeul(simTR, graine, c, 2000 - mesure.ticks, mesure); n++; }
    const moy = mesure.ms / Math.max(1, mesure.ticks);
    mesures.msTickFin = moy;
    const detail = `${ms(moy)} par tick (pire ${ms(mesure.max)}) sur ${mesure.ticks} ticks, ${n} partie(s), mission ${G}, robots de niveau 3 partout`;
    if (moy > 1) probleme('coût', `${detail} : plus de 1 ms`);
    else if (moy > 0.5) avertir('coût', `${detail} : au-dessus des 0,5 ms visés`);
    else ok(`coût : ${detail}`);
    // Le bac le plus lourd : 120 galaxies, 4 rivaux de niveau 3, un robot de niveau 3 à la place du joueur.
    const mb = { ms: 0, max: 0, ticks: 0 }, cb = simTR.configBac({ taille: 120, rivaux: 4, niveau: 3, graine: 5501, tech: 1023 });
    cb.ctl = cb.ctl.map(() => 3);
    jouerSeul(simTR, 5501, cb, 2000, mb);
    const moyB = mb.ms / Math.max(1, mb.ticks), detB = `${ms(moyB)} par tick (pire ${ms(mb.max)}) sur ${mb.ticks} ticks, bac de 120 galaxies, 5 robots de niveau 3`;
    mesures.msTickBac = moyB;
    if (moyB > 1) probleme('coût', `${detB} : plus de 1 ms`); else if (moyB > 0.5) avertir('coût', `${detB} : au-dessus des 0,5 ms visés`); else ok(`coût : ${detB}`);
  } catch (err) { probleme('coût', err.message); }

  // ------------------------------------------------------------------------
  const NB = AVEC_MISSIONS ? PARTIES_FIN : 1;
  const bloquant = !SOUPLE && !RAPIDE;
  const ecart = (sujet, texte) => { if (bloquant) probleme(sujet, texte); else avertir(sujet, texte); };
  const debutActe = (m) => (m - 1) % 20 < 3;
  const aRival = (f) => f.camps.some((c, x) => x > 0 && c.eq !== 0);
  titre(`15 f. Missions 61 à 100 : ${NB} partie(s) par mission et par robot à la place du joueur${AVEC_MISSIONS ? ` (niveau 2 ≥ 70 % ; niveau 1 ≤ 50 % sauf sans rival et 3 premières de l'acte ; médiane ≥ 600 ticks ; secondaire réussi au moins une fois${bloquant ? '' : ' ; non bloquant'})` : ' (doivent aller au bout sans erreur)'}`);
  mesures.missionsFin = {};
  const lignes = [], niveaux = AVEC_MISSIONS ? [2, 1, 3] : [2], taches = [], passives = [], gloutons = [], cibles = [];
  for (let m = 61; m <= 100; m++) {
    const fiche = D.missions[m - 1];
    for (const niveau of niveaux) taches.push({ m, niveau, graines: serie(niveau === 3 ? Math.ceil(NB / 4) : NB, (i) => 8000 + 100 * m + i) });
    if (AVEC_MISSIONS && aRival(fiche)) {
      passives.push({ m, niveau: 0, graines: serie(PARTIES_PASSIF_SUITE, (i) => 8700 + 100 * m + i), court: objectifConquete(fiche), limite: objectifConquete(fiche) ? 1500 : 0 });
      if (!debutActe(m)) {
        gloutons.push({ m, niveau: 0, graines: serie(PARTIES_GLOUTON, (i) => 3000 + m + i), glouton: true });
        cibles.push({ m, niveau: 0, graines: serie(PARTIES_CIBLE, (i) => 930000 + 100 * m + i), cible: true });
      }
    }
  }
  const lots = await lancerLots(taches.concat(passives, gloutons, cibles));
  let x = 0;
  for (let m = 61; m <= 100; m++) {
    const fiche = D.missions[m - 1];
    let secondaire = false;
    for (const niveau of niveaux) {
      const r = bilanLot(lots[x++], `mission ${m}, robot ${niveau}`), taux = pct(r.v, r.n);
      if (niveau >= 2 && r.sec) secondaire = true;
      mesures.missionsFin[`m${m}n${niveau}`] = { taux, mediane: mediane(r.t) };
      if (AVEC_MISSIONS) {
        const detail = `mission ${m}, robot ${niveau} : ${r.v} / ${r.n} (${taux} %), médiane ${mediane(r.t)} ticks (victoires ${mediane(r.tv)}), ${raisonsDe(r.ra)}`;
        if (niveau === 2 && taux < 70) ecart('missions', `${detail} : 70 % attendus`);
        else if (niveau === 2 && aRival(fiche) && !debutActe(m) && mediane(r.t) < (MEDIANE_MIN_PAR_MISSION[m] ?? 600)) ecart('missions', `${detail} : médiane d'au moins ${MEDIANE_MIN_PAR_MISSION[m] ?? 600} ticks attendue`);
        else if (niveau === 1 && aRival(fiche) && !debutActe(m) && taux > 50) ecart('missions', `${detail} : 50 % au plus attendus`);
        else ok(detail);
        if (niveau === 2 && r.tv.length && fiche.dv && ![5, 6, 8, 10].includes(fiche.objectif.t)) {
          const borne = Math.min(fiche.dv * 10, Math.max(Math.round((fiche.dv * 5) / 100) * 100, Math.round((1.5 * mediane(r.tv)) / 100) * 100));
          if (Math.abs(borne - fiche.tvise) > 100) avertir('temps visé', `mission ${m} : tvise ${fiche.tvise}, la règle donne ${borne} (médiane des victoires ${mediane(r.tv)} ticks, dv ${fiche.dv} s)`);
        }
      } else lignes.push(`m${m} ${r.v ? 'gagnée' : 'perdue'} au tick ${r.t[0]} (raison ${Object.keys(r.ra)[0]})`);
    }
    if (AVEC_MISSIONS && !secondaire) ecart('missions', `mission ${m} : objectif secondaire jamais réussi par les robots 2 et 3`);
  }
  if (!AVEC_MISSIONS) ok(`missions 61 à 100 jouées jusqu'au bout avec un robot de niveau 2 : ${lignes.join(' ; ')}`);
  if (AVEC_MISSIONS) {
    titre(`15 g. Missions 61 à 100 avec un rival, joueur sans ordre (${PARTIES_PASSIF_SUITE} parties par mission : toutes perdues)`);
    let vues = 0;
    for (const t of passives) {
      const r = bilanLot(lots[x++], `mission ${t.m}, joueur sans ordre`);
      if (r.v > 0) ecart('missions', `mission ${t.m}, joueur sans ordre : ${r.v} / ${r.n} victoires (0 attendue)`); else vues++;
    }
    ok(`joueur sans ordre battu sur ${vues} missions à rival`);
    titre(`15 h. Joueur glouton (un geste toutes les 1,3 s, attaque directe, ${PARTIES_GLOUTON} parties par mission) : aucune victoire en moins de 60 s`);
    let bons = 0, gagnees = 0;
    for (const t of gloutons) {
      const r = bilanLot(lots[x++], `mission ${t.m}, joueur glouton`), rapides = r.tv.filter((k) => k < 600);
      gagnees += r.v;
      if (rapides.length) ecart('missions', `mission ${t.m}, joueur glouton : ${rapides.length} victoire(s) en moins de 600 ticks (${Math.min(...rapides)} au mieux)`); else bons++;
    }
    ok(`joueur glouton : ${bons} missions sans victoire éclair sur ${gloutons.length} (${gagnees} victoires, toutes après 60 s)`);
    titre(`15 i. Joueur ciblé (une pile à 100 % sur le plus court chemin de l'objectif, un geste toutes les 1,3 s, ${PARTIES_CIBLE} parties par mission) : aucune victoire sous 20 % de la durée visée (60 s au moins)`);
    let bonsC = 0, gagneesC = 0;
    for (const t of cibles) {
      const pl = plancherCible(D.missions[t.m - 1]), r = bilanLot(lots[x++], `mission ${t.m}, joueur ciblé`), rapides = r.tv.filter((k) => k < pl);
      gagneesC += r.v;
      if (rapides.length) ecart('missions', `mission ${t.m}, joueur ciblé : ${rapides.length} victoire(s) en moins de ${pl} ticks (${Math.min(...rapides)} au mieux)`); else bonsC++;
    }
    ok(`joueur ciblé : ${bonsC} missions sans victoire éclair sur ${cibles.length} (${gagneesC} victoires au total)`);
  }
}

await controlerActesFin();


// --------------------------------------------------------------------------
// Résumé
// --------------------------------------------------------------------------

console.log('\nMesures');
console.log(`  rejeu : ${ms(mesures.msTickRejeu)} par tick ; robots de niveau 3 sur la plus grande carte : ${mesures.msTickRobots !== undefined ? `${ms(mesures.msTickRobots)} par tick (pire ${ms(mesures.msTickMax)})` : 'non mesuré'}`);
console.log(`  instantané : ${tailleMax} caractères en jeu, ${mesures.tailleInstantane !== undefined ? `${mesures.tailleInstantane} avec 300 flottes` : 'non mesuré avec 300 flottes'} (< 25 000)`);
if (mesures.duels) console.log(`  duels (victoires du premier nommé, %) : ${Object.entries(mesures.duels).map(([k, v]) => `${k.replace('c', ' contre ')} : ${v}`).join(' ; ')}`);
if (mesures.mission1Ticks) console.log(`  mission 1 gagnée par l'humain d'essai au tick ${mesures.mission1Ticks}`);
if (mesures.missions) console.log(`  missions (taux %, médiane ticks) : ${Object.entries(mesures.missions).map(([k, v]) => `${k} ${v.taux} % / ${v.mediane}`).join(' ; ')}`);
if (mesures.planete) console.log(`  planète : ${mesures.planete.n} régions, ${mesures.planete.provinces} provinces de ${mesures.planete.tMin} à ${mesures.planete.tMax} régions, construite en ${mesures.planete.ms} ms ; zones des missions : ${mesures.planete.zMin} à ${mesures.planete.zMax} régions`);
if (mesures.zones2) console.log(`  actes 2 et 3 : zones de ${mesures.zones2} (acte 2) et ${mesures.zones3} (acte 3) nœuds ; ${mesures.msTickSuite !== undefined ? ms(mesures.msTickSuite) + ' par tick (robots de niveau 3)' : 'coût non mesuré'} ; instantané ${mesures.instantaneSuite} caractères avec 300 flottes`);
if (mesures.zones4) console.log(`  actes 4 et 5 : zones de ${mesures.zones4} (acte 4) et ${mesures.zones5} (acte 5) nœuds ; ${mesures.msTickFin !== undefined ? ms(mesures.msTickFin) + ' par tick (robots de niveau 3)' : 'coût non mesuré'} ; instantané ${mesures.instantaneFin} caractères avec 300 flottes`);
if (mesures.missionsFin && AVEC_MISSIONS) console.log(`  missions 61 à 100 (taux %, médiane ticks) : ${Object.entries(mesures.missionsFin).map(([k, v]) => `${k} ${v.taux} % / ${v.mediane}`).join(' ; ')}`);
if (mesures.missionsSuite && AVEC_MISSIONS) console.log(`  missions 21 à 60 (taux %, médiane ticks) : ${Object.entries(mesures.missionsSuite).map(([k, v]) => `${k} ${v.taux} % / ${v.mediane}`).join(' ; ')}`);
if (mesures.cartes) console.log(`  cartes : ${Object.entries(mesures.cartes).map(([r, v]) => `rayon ${r} : ${v.nMin}–${v.nMax} territoires, ${v.msCarte} ms`).join(' ; ')}`);
if (!AVEC_MISSIONS || !AVEC_CARTES) console.log(`  (non joués : ${[!AVEC_MISSIONS && '--missions', !AVEC_CARTES && '--cartes'].filter(Boolean).join(', ')})`);
sortir();
