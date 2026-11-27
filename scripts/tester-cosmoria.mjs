#!/usr/bin/env node
// ==========================================================================
// tester-cosmoria.mjs — tests de la simulation de « Cosmoria » (city-builder,
// docs/cadrage-cosmoria.md, sections 19.5 et 21), sans navigateur ni réseau.
//
//   node scripts/tester-cosmoria.mjs               tests rapides (≈ 1 min)
//   node scripts/tester-cosmoria.mjs --sources     lit sources/cosmoria/ au lieu du jeu assemblé
//   node scripts/tester-cosmoria.mjs --endurance   ajoute 50 années de jeu sans affichage
//   node scripts/tester-cosmoria.mjs --perf        ajoute la mesure de la carte 160 × 160 remplie
//
// La simulation (bloc cm-sim), ses données (bloc cm-donnees) et les villes
// d'exemple (bloc cm-exemples) sont lues dans games/cosmoria/index.html puis
// exécutées seules, comme le demande le cahier (la simulation ignore l'écran).
// Contrôles : validation des données, une formule au moins par règle chiffrée
// du lot 1, invariants à chaque tick (aucun stock négatif, aucun marcheur hors
// carte, population = somme des maisons), déterminisme sur 10 000 ticks (même
// graine, mêmes commandes → même empreinte), état identique après sauvegarde
// puis chargement, tutoriels des missions 1 et 2 menés jusqu'à la victoire par
// un joueur automatique, endurance et performances.
// Code de sortie : 0 = tout est bon, 1 = au moins un échec.
// ==========================================================================

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const JEU = path.join(RACINE, 'games', 'cosmoria', 'index.html');
const SOURCES = path.join(RACINE, 'sources', 'cosmoria');
const depuisSources = args.includes('--sources') || !existsSync(JEU);

async function chargerCode() {
  if (depuisSources) {
    return {
      donnees: await readFile(path.join(SOURCES, 'donnees.json'), 'utf8'),
      sim: await readFile(path.join(SOURCES, 'sim.js'), 'utf8'),
      exemples: await readFile(path.join(SOURCES, 'exemples.js'), 'utf8'),
      audio: await readFile(path.join(SOURCES, 'audio.js'), 'utf8'),
    };
  }
  const html = await readFile(JEU, 'utf8');
  const bloc = (id) => {
    const m = html.match(new RegExp(`<script\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)</script>`, 'i'));
    if (!m) throw new Error(`bloc ${id} absent de games/cosmoria/index.html`);
    return m[1];
  };
  return { donnees: bloc('cm-donnees'), sim: bloc('cm-sim'), exemples: bloc('cm-exemples'), audio: bloc('cm-audio') };
}

const code = await chargerCode();
function nouveauMonde(transformer) {
  const ctx = vm.createContext({ btoa, atob, console });
  vm.runInContext(code.sim, ctx, { filename: 'cm-sim' });
  vm.runInContext(code.exemples, ctx, { filename: 'cm-exemples' });
  const donnees = JSON.parse(code.donnees);
  if (transformer) transformer(donnees);
  ctx.CM_SIM.charger(donnees);
  return { sim: ctx.CM_SIM, ex: ctx.CM_EXEMPLES, D: donnees };
}

let echecs = 0, reussites = 0;
function ok(cond, msg) {
  if (cond) { reussites++; return true; }
  echecs++; console.log(`  ÉCHEC : ${msg}`);
  return false;
}
function proche(a, b, tol, msg) { return ok(Math.abs(a - b) <= tol, `${msg} (obtenu ${a}, attendu ${b} ± ${tol})`); }
function section(t) { console.log(`\n— ${t}`); }

const { sim, ex, D } = nouveauMonde();
const O = sim._outils;
const TJ = D.temps.ticksParJour, TM = TJ * D.temps.joursParMois;

function etatVide(mission = 'pompei') {
  const e = sim.nouvelle(mission, { libre: true, attractivite: false });
  return e;
}
function maison(e, x, y, niv, hab) {
  const h = O.creerBatiment(e, 'logement', x, y);
  h.niv = niv; h.hab = hab;
  sim.majPopulation(e);
  return h;
}
// Case libre (herbe) proche de la voie de Rome.
function caseLibre(e, dx = 0, dy = -2) {
  const R = ex.ligneRome(sim, e);
  for (let x = 10 + dx; x < e.N - 10; x++) {
    const y = R + dy, i = y * e.N + x;
    if (e.terrain[i] === sim.T.HERBE && !e.bat[i] && !e.route[i]) return [x, y];
  }
  throw new Error('pas de case libre');
}
function avancer(e, n, avecInvariants = false) {
  for (let k = 0; k < n; k++) {
    sim.pas(e);
    if (avecInvariants) {
      const pb = sim.invariants(e);
      if (pb.length) { ok(false, `invariant au tick ${e.tick} : ${pb[0]}`); return false; }
    }
  }
  return true;
}

// --------------------------------------------------------------------------
section('Données');
ok(D.missions.length === 17 && D.maisons.length === 20, '17 missions et 20 niveaux de maison');
try { nouveauMonde((d) => { d.maisons.pop(); }); ok(false, 'données sans le niveau 20 acceptées'); } catch (err) { ok(/Données invalides/.test(err.message), 'données invalides refusées avec un message'); }
try { nouveauMonde((d) => { d.batiments.puits.cout = 'cinq'; }); ok(false, 'coût non numérique accepté'); } catch { ok(true, ''); }
ok(D.missions.every((m) => m.dispo), 'lot 5 : les 17 missions jouables');

// --------------------------------------------------------------------------
section('Formules (une au moins par règle chiffrée du lot 1)');
{
  // Temps : 1 jour = 50 ticks, 1 mois = 16 jours, 1 mois = 40 s à 20 ticks/s.
  ok(TJ === 50 && TM === 800 && TM / D.temps.ticksParSeconde === 40, 'temps : 50 ticks par jour, mois de 40 s');

  // Impôt : habitants × coefficient × taux / 20, par douzièmes, accumulé chaque mois dans la
  // maison et prélevé au passage du percepteur (cahier 23.16) ; salaires : emplois × salaire / 120.
  const e = etatVide();
  const [x, y] = caseLibre(e);
  const h = maison(e, x, y, 7, 100); // casa : coefficient 3
  e.impot = 7; e.emplois = 0; e.reliquat = 0;
  const t0 = e.tresor, mois = 100 * 3 * 7 / 20 / 12;
  O.finances(e);
  ok(e.tresor === t0 && h.dm === 1, 'impôt : rien n\'entre au trésor sans passage du percepteur, 1 mois d\'arriérés');
  proche(h.du, mois, 1e-9, 'impôt mensuel d\'une casa de 100 habitants à 7 % accumulé dans la maison');
  for (let k = 0; k < 5; k++) O.finances(e);
  O.percevoir(e, h);
  proche(e.tresor - t0, Math.floor(6 * mois), 1, 'percepteur passé après 6 mois : 6 mois d\'impôts prélevés');
  ok(h.du === 0 && h.dm === 0, 'impôt : arriérés remis à zéro au passage');
  const t2 = e.tresor;
  O.finances(e); O.percevoir(e, h);
  proche(e.tresor - t2, Math.round(mois), 1, 'percepteur repassé un mois plus tard : un mois prélevé');
  for (let k = 0; k < 30; k++) O.finances(e);
  ok(h.dm === D.regles.impot.arrieresMois && Math.abs(h.du - mois * D.regles.impot.arrieresMois) < 1e-6, `impôt : ${D.regles.impot.arrieresMois} mois d'arriérés au plus`);
  e.impot = 14; h.du = 0; h.dm = 0; e.reliquat = 0;
  O.finances(e);
  proche(h.du, 2 * mois, 1e-9, 'impôt : le taux du mois compte (14 % : le double)');
  h.svc.impot = 0; h.du = 0; e.impot = 7; e.emplois = 100; e.salaire = 30; e.reliquat = 0;
  const t1 = e.tresor;
  O.finances(e);
  proche(t1 - e.tresor, 25, 0, 'masse salariale : 100 emplois × 30 / 120');
  // Repère du cahier : 2 500 habitants en casae à 7 % ≈ 2 600 deniers par an.
  proche(Math.round(2500 * 3 * 7 / 20), 2625, 0, 'repère 11.2 : 2 500 habitants en casae');
}
{
  // Humeur (6.2) : mission sans réglage particulier (Ostie).
  const e = etatVide('ostie');
  const [x, y] = caseLibre(e);
  const h = maison(e, x, y, 3, 300);
  h.viv.ble = 50;
  e.pop = 300;
  const v = (f) => { f(e); return sim.variationHumeur(e).detail; };
  ok(v((s) => { s.chomage = 3; s.salaire = 30; s.impot = 7; }).chomage === 1, 'humeur : chômage sous 5 % → +1');
  ok(v((s) => { s.chomage = 20; }).chomage === -2, 'humeur : chômage de 15 à 25 % → −2');
  ok(v((s) => { s.chomage = 40; }).chomage === -4, 'humeur : chômage au-delà de 25 % → −4');
  ok(v((s) => { s.chomage = 10; s.salaire = 36; }).salaire === 3, 'humeur : salaire +6 → +3 (plafond)');
  ok(v((s) => { s.salaire = 26; }).salaire === -2, 'humeur : salaire −4 → −2');
  ok(v((s) => { s.salaire = 10; }).salaire === -5, 'humeur : salaire −20 → −5 (plafond)');
  ok(v((s) => { s.salaire = 30; s.impot = 6; }).impot === 1, 'humeur : impôt à 6 % → +1');
  ok(v((s) => { s.impot = 9; }).impot === undefined, 'humeur : impôt à 9 % → 0');
  ok(v((s) => { s.impot = 10; }).impot === -1, 'humeur : impôt à 10 % → −1');
  ok(v((s) => { s.impot = 13; }).impot === -2, 'humeur : impôt à 13 % → −2');
  h.viv.ble = 0;
  ok(v((s) => { s.impot = 7; }).penurie === -3, 'humeur : pénurie dans plus de 10 % des maisons → −3');
  h.niv = 1; h.hab = 300; h.viv.ble = 50;
  ok(v(() => {}).tentes === -1, 'humeur : plus de la moitié sous la tente → −1');
  e.pop = 150; h.hab = 150; h.niv = 3;
  ok(Object.keys(v(() => {})).length === 0, 'humeur : sous 200 habitants, pas de variation (réglage du lot 1)');
}
{
  // Main-d'œuvre : 40 % des plébéiens, répartition proportionnelle, arrêt sous 20 %.
  const e = etatVide();
  const R = ex.ligneRome(sim, e);
  sim.appliquer(e, { type: 'tracer', bat: 'route', cases: Array.from({ length: 12 }, (_, k) => [20 + k, R - 1]) });
  const h = maison(e, 20, R - 2, 3, 20); // 20 habitants → 8 travailleurs
  const p = O.creerBatiment(e, 'prefecture', 22, R - 2);   // 6
  const m = O.creerBatiment(e, 'ingenieur', 24, R - 2);    // 5
  const f = O.creerBatiment(e, 'forum', 26, R - 3);        // 6
  sim.repartirTravail(e);
  ok(e.travailleurs === 8, `travailleurs = 40 % de 20 (obtenu ${e.travailleurs})`);
  ok(p.eff + m.eff + f.eff === 8, 'tous les travailleurs sont employés');
  ok(p.eff >= 2 && m.eff >= 2 && f.eff >= 2, 'répartition proportionnelle');
  proche(e.chomage, 0, 0, 'chômage nul');
  h.hab = 2; sim.majPopulation(e); sim.repartirTravail(e);
  ok(sim.taux(p) === 0, 'sous 20 % d\'effectif, le bâtiment s\'arrête');
  void m;
}
{
  // Évolution d'une maison : eau → grande tente en 2 jours ; sans eau → retour après 8 jours.
  const e = etatVide();
  const R = ex.ligneRome(sim, e);
  const [x] = caseLibre(e, 0, -1);
  const h = maison(e, x, R - 1, 1, 4);
  const pu = O.creerBatiment(e, 'puits', x + 1, R - 1);
  sim.calculerEau(e);
  for (let j = 0; j < 2; j++) O.quotidien(e, h);
  ok(h.niv === 2, 'maison : niveau 2 après 2 jours avec de l\'eau');
  e.batiments.splice(e.batiments.indexOf(pu), 1); e._index.delete(pu.id); e.bat[pu.y * e.N + pu.x] = 0;
  sim.calculerEau(e);
  for (let j = 0; j < 7; j++) O.quotidien(e, h);
  ok(h.niv === 2, 'maison : encore niveau 2 après 7 jours sans eau');
  O.quotidien(e, h);
  ok(h.niv === 1, 'maison : niveau 1 au 8e jour sans eau');
  // Compteur de service : 48 jours, −1 par jour.
  h.svc.impot = D.regles.serviceJours;
  for (let j = 0; j < 10; j++) O.quotidien(e, h);
  ok(h.svc.impot === 38, 'compteur de service : −1 par jour');
}
{
  // Immigration : min(places libres, 10 % de la population + 20) par mois.
  const e = etatVide();
  e.pop = 300;
  ok(Math.floor(e.pop * D.regles.immigration.partPopulation) + D.regles.immigration.base === 50, 'immigration : quota de 50 pour 300 habitants');
  // Consommation : 0,5 unité par habitant et par mois.
  const [x, y] = caseLibre(e);
  const h = maison(e, x, y, 3, 10);
  h.viv.ble = 30;
  O.consommer(e);
  ok(h.viv.ble === 25, 'consommation : 5 unités pour 10 habitants');
}
{
  // Ferme à blé : 8 charges par an à plein effectif et fertilité 100 %.
  const e = etatVide();
  const fe = O.creerBatiment(e, 'ferme_ble', 5, 5);
  for (let yy = 5; yy < 8; yy++) for (let xx = 5; xx < 8; xx++) { e.terrain[yy * e.N + xx] = sim.T.PRAIRIE; e.fertilite[yy * e.N + xx] = 100; }
  fe.eff = D.batiments.ferme_ble.effectif;
  let charges = 0;
  for (let j = 0; j < D.temps.joursParMois * D.temps.moisParAn; j++) {
    O.quotidien(e, fe);
    if (fe.stock >= 1) { charges++; fe.stock = 0; }
  }
  proche(charges, 8, 0, 'ferme à blé : charges par an');
}
{
  // Feu : +1 par jour (×100) pour une tente, au-delà de 80 tirage de (risque − 80) %.
  const e = etatVide();
  e.mission = 'pompei';
  const [x, y] = caseLibre(e);
  const h = maison(e, x, y, 1, 4);
  O.quotidien(e, h);
  ok(h.feu === 100, `feu : +1 par jour pour une tente (obtenu ${h.feu / 100})`);
  ok(h.dom === 0, 'effondrement : les tentes ne s\'abîment pas');
  // Probabilité : sur 2 000 essais à 90, environ 10 % d'incendies.
  let n = 0;
  const essai = { alea: 12345 };
  for (let k = 0; k < 2000; k++) {
    const t = sim.nouvelle('pompei', { libre: true, graine: k, attractivite: false });
    const [x2, y2] = caseLibre(t);
    const hh = maison(t, x2, y2, 1, 4);
    hh.feu = 8999;
    O.quotidien(t, hh);
    if (!t._index.get(hh.id)) n++;
  }
  void essai;
  proche(n / 2000, 0.1, 0.03, 'feu : probabilité de (risque − 80) %');
}

{
  // Bâtiments qui se passent de route (puits, fontaine, réservoir, statues, oracle…) : aucun préfet ni
  // ingénieur n'est sûr de les atteindre, ils ne brûlent ni ne s'abîment (décision du 25 novembre 2026).
  const sansRoute = Object.keys(D.batiments).filter((k) => D.batiments[k].sansRoute);
  const fautifs = sansRoute.filter((k) => D.batiments[k].feu > 0 || D.batiments[k].dommages > 0);
  ok(!fautifs.length, `bâtiments sans route : ni feu ni dommages (${sansRoute.length} vérifiés${fautifs.length ? ', fautifs : ' + fautifs.join(', ') : ''})`);
  try { nouveauMonde((d) => { d.batiments.puits.dommages = 0.3; }); ok(false, 'données : un puits qui s\'abîme est accepté'); } catch { ok(true, ''); }
  // Sur la carte, loin de toute route : un puits, une fontaine, un réservoir, une statue et un oracle
  // marqués comme très abîmés (ancienne sauvegarde) ne s'effondrent pas en deux ans et leurs compteurs
  // retombent à zéro ; une préfecture, elle, s'use de 0,3 par jour.
  const e = etatVide();
  const poses = [];
  let dx = 0;
  for (const type of ['puits', 'fontaine', 'reservoir', 'statue_petite', 'oracle']) {
    const t = D.batiments[type].taille;
    const [x, y] = caseLibre(e, dx, -14);
    dx = x - 10 + t + 2;
    const b = O.creerBatiment(e, type, x, y);
    b.feu = 9500; b.dom = 9500;
    poses.push(b);
  }
  const [xp, yp] = caseLibre(e, dx + 2, -1);
  const pref = O.creerBatiment(e, 'prefecture', xp, yp);
  ok(poses.every((b) => !sim.acces(e, b).length), 'les bâtiments essayés sont loin de toute route');
  for (let j = 0; j < D.temps.joursParMois * D.temps.moisParAn * 2; j++) {
    poses.forEach((b) => { if (e._index.get(b.id)) O.quotidien(e, b); });
    if (j === 0) ok(pref.dom === 0 && (O.quotidien(e, pref), pref.dom === 30), `préfecture : dommages +0,3 par jour (obtenu ${pref.dom / 100})`);
  }
  const debout = poses.filter((b) => e._index.get(b.id) === b);
  ok(debout.length === poses.length, `sans route : aucun effondrement ni incendie en 2 ans (${debout.length} sur ${poses.length} debout)`);
  ok(debout.every((b) => b.feu === 0 && b.dom === 0), 'sans route : compteurs de feu et de dommages ramenés à zéro');
}

{
  // Une maison qui redescend : ceux qui doivent partir vont à pied dans la maison la plus proche qui a
  // de la place et y entrent en quelques secondes, même si cette place était retenue par des
  // immigrants en route (demande du propriétaire du 25 novembre 2026).
  const e = etatVide();
  e.humeur = 45; // ni immigration ni émigration pendant l'essai
  const [xa, ya] = caseLibre(e, 0, -1);
  const a = maison(e, xa, ya, 3, D.maisons[2].habitants);
  const [xl, yl] = caseLibre(e, 30, -1);
  const loin = maison(e, xl, yl, 2, 0);   // loin : ne doit pas être choisie
  const [xb, yb] = caseLibre(e, xa - 10 + 3, -1);
  const pres = maison(e, xb, yb, 2, 0);   // à 3 cases : 6 places, toutes retenues par des immigrants
  pres.att = 6;
  const avant = e.pop;
  a.manque = D.regles.maison.joursDescente;
  O.quotidien(e, a);
  const partants = D.maisons[2].habitants - D.maisons[1].habitants;
  ok(a.niv === 2 && a.hab === D.maisons[1].habitants, `descente : ${partants} habitants doivent partir`);
  let tic = 0;
  while (pres.hab < partants && tic < 20 * 20) { sim.pas(e); tic++; }
  ok(pres.hab === partants && loin.hab === 0, `relogés dans la maison la plus proche (${pres.hab} sur ${partants}, maison lointaine : ${loin.hab})`);
  ok(tic <= 10 * 20, `relogés en ${(tic / 20).toFixed(1)} s de jeu à vitesse ×1 (10 s au plus)`);
  ok(e.pop === avant, `aucun habitant perdu (${e.pop} sur ${avant})`);
  ok(!e.marcheurs.some((w) => w.type === 'sansabri' && !w.fin), 'plus aucun sans-abri en route');
}

{
  // Une fontaine reçoit ses employés sans route (demande du propriétaire du 25 novembre 2026).
  const e = etatVide();
  for (let k = 0; k < 4; k++) { const [x, y] = caseLibre(e, k * 2, -1); maison(e, x, y, 4, 10); }
  const [xf, yf] = caseLibre(e, 0, -9);
  const f = O.creerBatiment(e, 'fontaine', xf, yf);
  let routeProche = false;
  for (let y = yf - 3; y <= yf + 3; y++) for (let x = xf - 3; x <= xf + 3; x++) if (e.route[y * e.N + x]) routeProche = true;
  sim.repartirTravail(e);
  ok(!routeProche && f.eff === D.batiments.fontaine.effectif, `fontaine sans route : ${f.eff} employés sur ${D.batiments.fontaine.effectif}`);
}

{
  // Une tente entourée d'autres logements reçoit quand même ses immigrants : on entre
  // dans une maison depuis une route à 2 cases ou moins (demande du propriétaire du 24 novembre 2026).
  const e = sim.nouvelle('ostie', { libre: true, attractivite: false });
  const R = ex.ligneRome(sim, e);
  let x0 = -1;
  for (let x = 5; x < e.N - 8 && x0 < 0; x++) {
    let bon = true;
    for (let y = R - 4; y <= R - 1; y++) for (let x2 = x - 1; x2 < x + 4; x2++) { const t = e.terrain[y * e.N + x2]; if (t === sim.T.EAU || t === sim.T.ROCHERS) bon = false; }
    if (bon) x0 = x;
  }
  // Pâté de 3 × 3 logements entre la voie de Rome et une route tracée au-dessus.
  const cases = [], route = [];
  for (let y = R - 3; y <= R - 1; y++) for (let x = x0; x < x0 + 3; x++) cases.push([x, y]);
  for (let x = x0 - 1; x <= x0 + 3; x++) route.push([x, R - 4]);
  sim.appliquer(e, { type: 'tracer', bat: 'deblayer', cases: cases.concat(route) });
  sim.appliquer(e, { type: 'tracer', bat: 'route', cases: route });
  ok(sim.appliquer(e, { type: 'tracer', bat: 'logement', cases }).n === 9, 'pâté de 9 logements posé');
  const centre = sim.batA(e, x0 + 1, R - 2);
  avancer(e, 3 * TM, true);
  ok(centre && centre.hab > 0, `tente au centre d'un pâté de 3 × 3 habitée (${centre ? centre.hab : 'absente'} habitants)`);
  ok(e.batiments.filter((b) => b.type === 'logement' && b.hab > 0).length === 9, 'les 9 logements du pâté sont habités');
}

// --------------------------------------------------------------------------
section('Marcheurs guidés vers les besoins, impôts au passage (cahier 23.16)');
{
  // Une rue de 25 cases : le bâtiment de service au milieu, les maisons à l'ouest, rien à l'est.
  const rue = () => {
    const e = etatVide();
    e.tresor = 1e6;
    const N = e.N;
    const libre = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const k = j * N + i; if (i < 0 || j < 0 || i >= N || j >= N || e.bat[k] || e.route[k] || e.terrain[k] >= sim.T.ROCHERS) return false; } return true; };
    let zx = -1, zy = -1;
    for (let y = 5; y < N - 10 && zx < 0; y++) for (let x = 5; x < N - 30; x++) if (libre(x, y, 25, 5)) { zx = x; zy = y; break; }
    // Les arbres de la zone sont abattus : l'essai ne dépend pas du terrain.
    for (let j = zy; j < zy + 5; j++) for (let i = zx; i < zx + 25; i++) e.terrain[j * N + i] = sim.T.HERBE;
    const yR = zy + 2;
    const r = sim.appliquer(e, { type: 'tracer', bat: 'route', cases: Array.from({ length: 25 }, (_, k) => [zx + k, yR]) });
    return { e, zx, yR, ok: zx >= 0 && r.ok };
  };
  const service = (e, type, x, y) => { const b = O.creerBatiment(e, type, x, y); b.eff = D.batiments[type].effectif; return b; };

  // Préfet : il va vers la maison la plus menacée, jamais vers la partie vide de la rue.
  {
    const { e, zx, yR, ok: pret } = rue();
    ok(pret, 'rue d\'essai de 25 cases tracée');
    const pref = service(e, 'prefecture', zx + 12, yR - 1);
    const a = maison(e, zx + 2, yR - 1, 2, 6), b = maison(e, zx + 6, yR + 1, 2, 6);
    a.feu = 7000; b.feu = 3000;
    const w = O.emettreErrant(e, pref, 'prefet');
    const c = O.choisirCibleErrant(e, w, pref, D.regles.porteeErrant);
    ok(c && c.id === a.id, `préfet : la maison la plus menacée est visée d'abord (${c ? c.id : 'aucune'} pour ${a.id})`);
    ok(c && c.chemin.every((i) => i % e.N <= zx + 12), 'préfet : son chemin part vers les maisons, pas vers la partie vide');
    const w2 = O.emettreErrant(e, pref, 'prefet', true);
    w.cible = c.id;
    const c2 = O.choisirCibleErrant(e, w2, pref, D.regles.porteeErrant);
    ok(c2 && c2.id === b.id, 'deux préfets : le second prend l\'autre maison (pas de doublon)');
    e.marcheurs = e.marcheurs.filter((x) => x !== w2); e._mIndex.delete(w2.id); pref.m2 = 0;
    let maxX = 0, jours = 0;
    while ((a.feu > 0 || b.feu > 0) && jours < 30) { for (let k = 0; k < TJ; k++) { sim.pas(e); e.marcheurs.forEach((x) => { if (x.type === 'prefet' && (a.feu > 0 || b.feu > 0)) maxX = Math.max(maxX, x.x); }); } jours++; }
    ok(a.feu < 3000 && b.feu < 3000, `préfet : les deux maisons visitées en ${jours} jours (risque ${a.feu}, ${b.feu})`);
    ok(maxX <= zx + 13, `préfet : il n'est pas allé dans la partie vide de la rue (x max ${maxX - zx} pour 13)`);
    a.feu = 0; b.feu = 0;
    ok(O.besoinErrant(e, 'prefet', pref, a) === 0, 'préfet : une maison sans risque n\'est pas une cible');
  }
  // Vendeuse : la maison qui a faim, pas celle dont la réserve est pleine ; marché sans vivres : aucune.
  {
    const { e, zx, yR } = rue();
    const m = service(e, 'marche', zx + 12, yR - 2);
    m.stocks.ble = 800;
    const pleine = maison(e, zx + 16, yR + 1, 3, 8), faim = maison(e, zx + 4, yR + 1, 3, 8);
    pleine.viv = { ble: 1000 }; faim.viv = {};
    const v = O.creerMarcheur(e, 'vendeuse', yR * e.N + zx + 12, { o: m.id, pas: 0, portee: D.regles.porteeErrant, retour: 0, ch: null, k: 0 });
    const c = O.choisirCibleErrant(e, v, m, D.regles.porteeErrant);
    ok(c && c.id === faim.id, 'vendeuse : elle va vers la maison qui manque de nourriture');
    ok(O.besoinErrant(e, 'vente', m, pleine) === 0, 'vendeuse : une maison bien servie n\'est pas une cible');
    m.stocks.ble = 0;
    ok(O.besoinErrant(e, 'vente', m, faim) === 0, 'vendeuse : sans vivres au marché, la faim d\'une tente ne l\'attire pas');
  }
  // Percepteur : la maison aux arriérés les plus anciens ; impôts entrés au trésor en passant.
  {
    const { e, zx, yR } = rue();
    const f = service(e, 'forum', zx + 12, yR - 2);
    const vieille = maison(e, zx + 3, yR + 1, 7, 16), recente = maison(e, zx + 20, yR + 1, 7, 16);
    vieille.dm = 6; vieille.du = 30; vieille.svc.impot = 0;
    recente.dm = 1; recente.du = 5; recente.svc.impot = 40;
    const p = O.emettreErrant(e, f, 'percepteur');
    const c = O.choisirCibleErrant(e, p, f, D.regles.porteeErrant);
    ok(c && c.id === vieille.id, 'percepteur : il va d\'abord vers la maison qui n\'a pas payé depuis 6 mois');
    const t0 = e.tresor, i0 = e.finances.an.impots;
    let jours = 0;
    while (vieille.du > 0 && jours < 20) { for (let k = 0; k < TJ; k++) sim.pas(e); jours++; }
    ok(vieille.du === 0 && vieille.dm === 0 && e.finances.an.impots - i0 >= 30, `percepteur : 6 mois prélevés en passant (${Math.round(e.finances.an.impots - i0)} deniers, ${jours} jours)`);
    ok(e.tresor > t0 - 100, 'percepteur : le trésor reçoit les arriérés');
  }
  // Aucun besoin : la tournée s'arrête aussitôt (pas de marche dans le vide).
  {
    const { e, zx, yR } = rue();
    const ing = service(e, 'ingenieur', zx + 12, yR - 1);
    const w = O.emettreErrant(e, ing, 'ingenieur');
    let fin = false;
    for (let k = 0; k < 3 * D.regles.vitesses.normale && !fin; k++) { sim.pas(e); fin = !e._mIndex.has(w.id); }
    ok(fin, 'ingénieur sans bâtiment abîmé : il rentre aussitôt');
  }
}

// --------------------------------------------------------------------------
section('Ville d\'exemple, invariants à chaque tick');
// Ville d'exemple bâtie par le joueur raisonnable (CM_EXEMPLES.jouer), tous les demi-mois.
const PLANS = new Map();
function villeTest(graine = 1, ticks = 0) {
  const e = sim.nouvelle('pompei', { libre: true, graine, attractivite: false }); // règles du lot 1
  e.tresor = 1e6; // construction libre : l'argent n'est pas ce qu'on teste ici
  if (!PLANS.has(graine)) PLANS.set(graine, ex.planifier(sim, 'pompei', { niveau: 3, graine }));
  e._plan = PLANS.get(graine);
  ex.jouer(sim, e, e._plan);
  return e;
}
function avancerVille(e, n, avecInvariants = false) {
  const demi = TM / 2;
  while (n > 0) {
    const k = Math.min(n, demi - (e.tick % demi));
    if (!avancer(e, k, avecInvariants)) return false;
    n -= k;
    if (e.tick % demi === 0) ex.jouer(sim, e, e._plan);
  }
  return true;
}
{
  const e = villeTest();
  avancerVille(e, 24 * TM, true);
  const n0 = e.batiments.length;
  ok(n0 > 100, `la ville d'exemple compte ${n0} bâtiments`);
  const d = sim.date(e);
  console.log(`  après 2 ans : ${e.pop} habitants, ${e.marcheurs.length} marcheurs, trésor ${e.tresor > 1e8 ? 'illimité' : e.tresor}, an ${d.annee}`);
  const niveaux = {};
  e.batiments.filter((b) => b.type === 'logement' && b.hab > 0).forEach((h) => { niveaux[h.niv] = (niveaux[h.niv] || 0) + 1; });
  console.log(`  maisons par niveau : ${JSON.stringify(niveaux)}`);
  ok(e.pop > 300, 'la ville se peuple');
  ok((niveaux[3] || 0) + (niveaux[4] || 0) + (niveaux[5] || 0) + (niveaux[6] || 0) > 10, 'des maisons montent au-delà du niveau 2');
  ok(Object.keys(niveaux).some((n) => n >= 5), 'des maisons atteignent le niveau 5 (fontaines)');
  // Marcheurs vus pendant un mois (une vendeuse peut être entre deux tournées à un instant donné).
  // Stocks vus pendant le même mois : les vendeuses guidées (cahier 23.16) vident vite les
  // marchés vers les maisons, un instant donné ne suffit plus.
  const vus = new Set();
  let stockVu = false;
  for (let k = 0; k < TM; k++) {
    sim.pas(e); e.marcheurs.forEach((w) => vus.add(w.type));
    if (!stockVu && k % TJ === 0) stockVu = e.batiments.some((b) => (b.type === 'grenier' || b.type === 'marche') && sim.totalStock(b) > 0);
  }
  ok(vus.has('vendeuse') && vus.has('prefet') && vus.has('ingenieur') && vus.has('percepteur'), `vendeuses, préfets, ingénieurs et percepteurs circulent (${[...vus].sort().join(', ')})`);
  ok(stockVu, 'la nourriture circule jusqu\'aux greniers et marchés');
}

// --------------------------------------------------------------------------
section('Déterminisme et sauvegarde');
{
  const a = villeTest(7), b = villeTest(7);
  avancerVille(a, 10000); avancerVille(b, 10000);
  ok(sim.empreinte(a) === sim.empreinte(b), 'même graine et mêmes commandes → même état après 10 000 ticks');
  const c = villeTest(8);
  avancerVille(c, 10000);
  ok(sim.empreinte(a) !== sim.empreinte(c), 'une autre graine donne un autre état');
  const d = villeTest(7);
  avancerVille(d, 5000);
  const txt = sim.exporter(d);
  const d2 = sim.importer(txt);
  d2._plan = d._plan;
  ok(sim.empreinte(d2) === sim.empreinte(d), 'état identique juste après sauvegarde puis chargement');
  avancerVille(d2, 5000);
  ok(sim.empreinte(d2) === sim.empreinte(a), 'sauvegarde au tick 5 000, chargement, puis 5 000 ticks → même état qu\'en continu');
  console.log(`  taille d'une ville sauvegardée : ${(txt.length / 1024).toFixed(0)} Ko (cible : 1 Mo au plus)`);
  ok(txt.length < 1024 * 1024, 'ville sauvegardée de moins de 1 Mo');
  try { sim.importer(JSON.stringify({ v: 99 })); ok(false, 'version inconnue acceptée'); } catch (err) { ok(/version/.test(err.message), 'sauvegarde d\'une version inconnue refusée avec un message'); }
  try { sim.importer('{ pas du json'); ok(false, 'sauvegarde illisible acceptée'); } catch { ok(true, ''); }
}

// --------------------------------------------------------------------------
section('Commandes du joueur');
{
  const e = sim.nouvelle('ostie');
  const R = ex.ligneRome(sim, e);
  const [x] = caseLibre(e, 0, -1);
  ok(sim.appliquer(e, { type: 'poser', bat: 'puits', x, y: R - 3 }).raison === 'verrouille', 'tutoriel : le puits est verrouillé au départ');
  const t0 = e.tresor;
  const r = sim.appliquer(e, { type: 'tracer', bat: 'route', cases: [[x, R - 1], [x, R - 2], [x, R - 3]] });
  ok(r.ok && t0 - e.tresor === 3 * D.batiments.route.cout, 'tracé de route : coût par case');
  const a = sim.appliquer(e, { type: 'annuler' });
  ok(a.ok && e.tresor === t0 && !e.route[(R - 2) * e.N + x], 'annulation : routes retirées et remboursées');
  const far = sim.peutPlacer(e, 'logement', x, R - 8);
  ok(far === 'routeLoin', 'logement à plus de 2 cases d\'une route refusé');
  e.tresor = D.regles.detteMax + 5;
  ok(sim.peutPlacer(e, 'logement', x, R - 1) === 'argent', 'construction refusée au plafond de dette');
}

// --------------------------------------------------------------------------
section('Tutoriels : un joueur automatique gagne les missions 1 et 2');
function joueurAutomatique(idMission, plan, moisMax, chaqueDemiMois) {
  const e = sim.nouvelle(idMission);
  const m = D.missions.find((x) => x.id === idMission);
  let etapeVue = -1;
  for (let mois = 0; mois < moisMax && !e.victoire; mois++) {
    for (let j = 0; j < D.temps.joursParMois && !e.victoire; j++) {
      if (e.tuto !== etapeVue) { etapeVue = e.tuto; plan(e, e.tuto); }
      if (chaqueDemiMois && j % 8 === 0) chaqueDemiMois(e);
      avancer(e, TJ, true);
    }
    plan(e, -1, mois);
  }
  return { e, m };
}
{
  // Ostie : logements le long d'un petit quartier, puits, ferme, grenier, marché.
  const { e } = joueurAutomatique('ostie', (e, etape) => {
    const R = ex.ligneRome(sim, e), N = e.N;
    const cx = Math.floor(N / 2);
    if (etape === 0) {
      const routes = [];
      for (let x = cx - 12; x <= cx + 12; x++) routes.push([x, R - 5]);
      for (let y = R - 9; y < R; y++) routes.push([cx - 12, y], [cx, y], [cx + 12, y]);
      sim.appliquer(e, { type: 'tracer', bat: 'deblayer', cases: routes });
      sim.appliquer(e, { type: 'tracer', bat: 'route', cases: routes });
      const zone = [];
      for (let y = R - 4; y <= R - 1; y++) for (let x = cx - 11; x <= cx + 11; x++) if (x !== cx) zone.push([x, y]);
      sim.appliquer(e, { type: 'tracer', bat: 'deblayer', cases: zone });
      sim.appliquer(e, { type: 'tracer', bat: 'logement', cases: zone });
    }
    if (etape === 2) {
      for (let x = cx - 10; x <= cx + 10; x += 4) { sim.appliquer(e, { type: 'tracer', bat: 'deblayer', cases: [[x, R - 3]] }); sim.appliquer(e, { type: 'poser', bat: 'puits', x, y: R - 3 }); }
    }
    if (etape === 4 || etape === 5 || etape === 6) {
      const type = etape === 4 ? 'ferme_ble' : etape === 5 ? 'grenier' : 'marche';
      const n = etape === 4 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        let best = null;
        for (let y = 2; y < N - 4 && !best; y++) for (let x = 2; x < N - 4 && !best; x++) {
          if (Math.abs(y - R) > 14) continue;
          if (type !== 'ferme_ble' && (y < R - 9 || y > R + 6)) continue;
          if (sim.peutPlacer(e, type, x, y) !== null) continue;
          const t = D.batiments[type].taille;
          const voisinRoute = [...Array(t).keys()].some((d) => e.route[(y - 1) * N + x + d] || e.route[(y + t) * N + x + d]);
          if (voisinRoute) best = [x, y];
        }
        if (best) sim.appliquer(e, { type: 'poser', bat: type, x: best[0], y: best[1] });
      }
    }
  }, 30);
  ok(!!e.victoire, `Ostie gagnée (population ${e.pop}, étape ${e.tuto}, ${e.victoire ? `mois ${e.victoire.mois}, ${e.victoire.etoiles} étoiles` : 'pas de victoire'})`);
}
{
  // Pompéi : le joueur raisonnable rejoue le plan de la ville d'exemple de niveau 3 ;
  // les bâtiments encore verrouillés par le tutoriel sont refusés, puis posés une fois débloqués.
  const plan = ex.planifier(sim, 'pompei', { niveau: 3, colonnes: 4, rangees: 2, fermes: 5 });
  const { e } = joueurAutomatique('pompei', (e, etape) => { if (etape >= 0) ex.jouer(sim, e, plan); }, 60, (e) => ex.jouer(sim, e, plan));
  ok(!!e.victoire, `Pompéi gagnée (population ${e.pop}, étape ${e.tuto}, ${e.victoire ? `mois ${e.victoire.mois}, ${e.victoire.etoiles} étoiles` : 'pas de victoire'})`);
}

// --------------------------------------------------------------------------
// Lot 2 « Économie » (cahier, section 21) : un scénario par chaîne de production, consignes
// des greniers et entrepôts, biens au marché, niveaux 7 à 12 (agrandissement, division),
// attractivité, priorités de main-d'œuvre, santé, puis une insula de prestige (niveau 12)
// atteinte en construction libre par le joueur automatique.
section('Économie (lot 2) : chaînes de production');
// Construction libre, tous les bâtiments, sans attractivité ni risques : seule la chaîne compte.
// Des tentes pleines le long de la voie de Rome fournissent les travailleurs.
function partieEco(options = {}) {
  const e = sim.nouvelle('pompei', { libre: true, tout: true, attractivite: false, risques: false, fonds: 1e7, ...options });
  const R = ex.ligneRome(sim, e), l = [];
  for (let x = 2; x < 70; x++) for (const y of [R - 1, R + 1]) if (sim.peutPlacer(e, 'logement', x, y) === null) l.push([x, y]);
  sim.appliquer(e, { type: 'tracer', bat: 'logement', cases: l });
  e.batiments.forEach((h) => { if (h.type === 'logement') { h.niv = 1; h.hab = 4; } });
  sim.majPopulation(e);
  return e;
}
const CHAINES = [
  ['carriere_argile', 'atelier_poterie', 'argile', 'poterie'], ['camp_bucherons', 'atelier_mobilier', 'bois', 'mobilier'],
  ['ferme_olives', 'pressoir', 'olives', 'huile'], ['ferme_vigne', 'cave', 'raisin', 'vin'],
  ['mine_fer', 'atelier_armes', 'fer', 'armes'], ['carriere_marbre', null, 'marbre', 'marbre'],
];
for (const [source, atelier, matiere, bien] of CHAINES) {
  const e = partieEco();
  const ent = ex.poserPres(sim, e, 'entrepot', 40, 40);
  const src = ex.poserPres(sim, e, source, 40, 40);
  const at = atelier ? ex.poserPres(sim, e, atelier, 40, 44) : null;
  if (!ok(ent && src && (at || !atelier), `${source} : bâtiments posés`)) continue;
  if (!avancer(e, 14 * TM, true)) continue;
  ok((ent.stocks[bien] || 0) >= 200, `${source}${atelier ? ' → ' + atelier : ''} → entrepôt : ${ent.stocks[bien] || 0} unités de ${bien} en 14 mois`);
  if (at) ok(at.mat > 0 || (ent.stocks[matiere] || 0) > 0, `${atelier} approvisionné en ${matiere} (surplus rangé à l'entrepôt)`);
  if (bien === 'marbre') {
    // Grand temple : 150 deniers et 2 charges de marbre prises à l'entrepôt à la pose ; remboursées à l'annulation.
    const avant = ent.stocks.marbre;
    let pos = null;
    for (let y = 30; y < 60 && !pos; y++) for (let x = 20; x < 60 && !pos; x++) if (sim.peutPlacer(e, 'grand_temple_ceres', x, y) === null) pos = [x, y];
    const pose = pos && sim.appliquer(e, { type: 'poser', bat: 'grand_temple_ceres', x: pos[0], y: pos[1] }).ok;
    ok(pose && ent.stocks.marbre === avant - 200, `grand temple : 2 charges de marbre prises à l'entrepôt (${avant} → ${ent.stocks.marbre})`);
    sim.appliquer(e, { type: 'annuler' });
    ok(ent.stocks.marbre === avant, 'annulation du grand temple : marbre rendu');
    ent.stocks.marbre = 100;
    ok(sim.peutPlacer(e, 'oracle', 30, 30) === 'marbre' || sim.peutPlacer(e, 'oracle', 30, 30) !== null, 'sans 2 charges de marbre en entrepôt, pas d\'oracle');
  }
}
for (const source of ['ferme_legumes', 'ferme_fruits', 'ferme_porcs', 'quai_peche']) {
  const e = partieEco();
  const g = ex.poserPres(sim, e, 'grenier', 40, 40);
  const src = ex.poserPres(sim, e, source, 40, 30);
  const bien = D.batiments[source].produit;
  if (!ok(g && src, `${source} : bâtiments posés`)) continue;
  avancer(e, 12 * TM, true);
  ok((g.stocks[bien] || 0) >= 300, `${source} → grenier : ${g.stocks[bien] || 0} unités de ${bien} en 12 mois`);
  if (source === 'quai_peche') ok(e.bancs.length === 3, 'trois bancs de poissons posés sur l\'eau de la carte');
}
{
  // Rendements à plein effectif (sections 7.2 et 8.2), au jour près : extraction 8 charges par an,
  // atelier 4 charges par an.
  const e = partieEco();
  const src = ex.poserPres(sim, e, 'carriere_marbre', 40, 40);
  src.eff = D.batiments.carriere_marbre.effectif;
  let n = 0;
  for (let j = 0; j < D.joursParAn; j++) { O.quotidien(e, src); if (src.stock >= 1) { n++; src.stock = 0; } }
  ok(n === 8, `extraction : ${n} charges par an à plein effectif (8 attendues)`);
  const at = ex.poserPres(sim, e, 'atelier_poterie', 40, 44);
  at.eff = D.batiments.atelier_poterie.effectif; at.mat = 200;
  let p = 0;
  for (let j = 0; j < D.joursParAn; j++) { if (at.mat < 100) at.mat = 200; O.quotidien(e, at); if (at.stock >= 1) { p++; at.stock = 0; } }
  ok(p === 4, `atelier : ${p} charges par an à plein effectif (4 attendues)`);
  at.mat = 200;
  ok(sim.placeDans(at, 'argile') === 0 && sim.placeDans(at, 'bois') === 0, 'un atelier garde 2 charges de matière au plus, et seulement la sienne');
}

section('Économie (lot 2) : entrepôts, consignes, marchés');
{
  const e = partieEco();
  const ent = O.creerBatiment(e, 'entrepot', 10, 10);
  // 8 emplacements de 4 charges, un bien par emplacement ; plafond en quarts.
  ok(sim.placeDans(ent, 'bois') === 3200, 'entrepôt vide : 32 charges de place');
  for (const g of ['bois', 'fer', 'argile', 'marbre', 'poterie', 'vin', 'huile']) ent.stocks[g] = 100;
  ok(sim.placeDans(ent, 'armes') === 400 && sim.placeDans(ent, 'bois') === 700, 'un bien nouveau n\'a que l\'emplacement restant ; un bien présent remplit le sien puis le reste');
  ent.stocks.armes = 50;
  ok(sim.placeDans(ent, 'mobilier') === 0, 'huit biens différents : plus de place pour un neuvième');
  ok(sim.emplacements(ent).filter(Boolean).length === 8, 'huit emplacements occupés pour le dessin');
  const r = sim.appliquer(e, { type: 'plafond', id: ent.id, bien: 'bois', valeur: 1 });
  ent.stocks = { bois: 600 };
  ok(r.ok && sim.placeDans(ent, 'bois') === 200, 'plafond « un quart » : 8 charges de bois au plus');
  sim.appliquer(e, { type: 'consigne', id: ent.id, bien: 'bois', valeur: 'refuser' });
  ok(sim.placeDans(ent, 'bois') === 0 && sim.placeDans(ent, 'bois', true) > 0, 'consigne « refuser » : plus rien n\'entre (sauf retour forcé)');
  ok(!sim.appliquer(e, { type: 'consigne', id: ent.id, bien: 'bois', valeur: 'jeter' }).ok, 'consigne inconnue refusée');
  const g = O.creerBatiment(e, 'grenier', 20, 10);
  ok(!sim.appliquer(e, { type: 'consigne', id: g.id, bien: 'bois', valeur: 'refuser' }).ok, 'un grenier n\'a de consigne que pour la nourriture');
}
{
  // « Vider » et « aller chercher » : un charretier déplace le stock d'un dépôt à l'autre.
  const e = partieEco();
  const a = ex.poserPres(sim, e, 'entrepot', 30, 40), b = ex.poserPres(sim, e, 'entrepot', 50, 40);
  a.stocks.bois = 1200;
  sim.appliquer(e, { type: 'consigne', id: a.id, bien: 'bois', valeur: 'vider' });
  avancer(e, 3 * TM, true);
  ok((b.stocks.bois || 0) >= 200 && a.stocks.bois + (b.stocks.bois || 0) <= 1200 && a.stocks.bois <= 1000, `« vider » : le bois part vers l'autre entrepôt, une charge par trajet (${a.stocks.bois} restent, ${b.stocks.bois || 0} arrivés)`);
  sim.appliquer(e, { type: 'consigne', id: a.id, bien: 'bois', valeur: 'chercher' });
  const avant = a.stocks.bois;
  avancer(e, 3 * TM, true);
  ok(a.stocks.bois > avant, `« aller chercher » : le bois revient (${avant} → ${a.stocks.bois})`);
}
{
  // Biens au marché : la vendeuse relève la demande, l'acheteuse va la chercher à l'entrepôt,
  // la maison la reçoit ; un produit interdit n'est plus acheté.
  const e = partieEco();
  const ent = ex.poserPres(sim, e, 'entrepot', 40, 40);
  ent.stocks.poterie = 800;
  const m = ex.poserPres(sim, e, 'marche', 30, 44);
  const R = ex.ligneRome(sim, e);
  const casa = e.batiments.find((h) => h.type === 'logement' && Math.abs(h.x - m.x) < 4 && h.y === R - 1);
  casa.niv = 7; casa.hab = 16;
  sim.majPopulation(e);
  ok(sim.infosMaison(e, casa).biensVoulus.includes('poterie'), 'une petite casa (niveau 7) réclame la poterie du niveau 8');
  m.dem = { poterie: D.regles.serviceJours }; // demande relevée par la vendeuse
  avancer(e, 2 * TM, true);
  ok((m.stocks.poterie || 0) > 0, `l'acheteuse rapporte la poterie de l'entrepôt au marché (${m.stocks.poterie || 0} unités ; entrepôt ${ent.stocks.poterie})`);
  sim.appliquer(e, { type: 'interdit', id: m.id, bien: 'poterie', valeur: true });
  m.stocks.poterie = 0; m.dem = {};
  avancer(e, 2 * TM);
  ok(!(m.stocks.poterie > 0) && !sim.besoinsMarche(m).includes('poterie'), 'produit interdit au marché : plus acheté');
}

section('Économie (lot 2) : maisons, attractivité, main-d\'œuvre, santé');
{
  // Attractivité : « +4 sur 3 » donne 4, 2, 1 aux distances 1, 2, 3, puis 0.
  const e = sim.nouvelle('pompei', { libre: true, tout: true });
  const [x, y] = caseLibre(e, 0, -6);
  O.creerBatiment(e, 'temple_ceres', x, y);
  sim.calculerAttractivite(e);
  const val = (dx) => e.attract[(y) * e.N + x + 1 + dx];
  ok(val(1) === 4 && val(2) === 2 && val(3) === 1 && val(4) === 0, `attractivité « +4 sur 3 » : ${[1, 2, 3, 4].map(val).join(', ')} (4, 2, 1, 0 attendus)`);
  ok(val(0) === 0, 'un bâtiment ne compte pas pour lui-même');
  O.creerBatiment(e, 'statue_grande', x + 6, y);
  sim.calculerAttractivite(e);
  ok(e.attract[y * e.N + x + 4] === 11 + 1, `les sources s'additionnent : ${e.attract[y * e.N + x + 4]} (statue « +14 sur 5 » à 2 cases : 11 ; temple à 3 cases : 1)`);
}
{
  // Agrandissement au niveau 10 (2 × 2) avec des voisines de même niveau, puis division à la descente.
  const e = sim.nouvelle('pompei', { libre: true, tout: true, attractivite: false });
  const [x, y] = caseLibre(e, 0, -2);
  const hs = [maison(e, x, y, 9, 20), maison(e, x + 1, y, 9, 20), maison(e, x, y + 1, 9, 20), maison(e, x + 1, y + 1, 0, 0)];
  hs[0].viv = { ble: 40, mobilier: 4 };
  ok(O.agrandir(e, hs[0], 2), 'quatre cases (trois maisons de niveau 9 et une zone vide) forment une insula de 2 × 2');
  const h = hs[0];
  h.niv = 10;
  ok(h.t === 2 && h.hab === 60 && sim.batA(e, x + 1, y + 1) === h && !sim.batiment(e, hs[1].id), `l'insula garde les ${h.hab} habitants et occupe les quatre cases`);
  ok(sim.invariants(e).length === 0, `invariants tenus après l'agrandissement ${sim.invariants(e)[0] || ''}`);
  O.diviser(e, h, 1);
  h.niv = 9;
  const quatre = [sim.batA(e, x, y), sim.batA(e, x + 1, y), sim.batA(e, x, y + 1), sim.batA(e, x + 1, y + 1)];
  ok(new Set(quatre.map((b) => b.id)).size === 4 && quatre.every((b) => b.t === 1 && b.type === 'logement'), 'à la descente sous le niveau 10, l\'insula redevient quatre maisons d\'une case');
  ok(quatre.reduce((n, b) => n + b.hab, 0) === 60 && sim.invariants(e).length === 0, 'les 60 habitants sont répartis, invariants tenus');
  const bloque = maison(e, x + 5, y, 9, 20);
  O.creerBatiment(e, 'prefecture', x + 6, y); O.creerBatiment(e, 'prefecture', x + 4, y);
  O.creerBatiment(e, 'prefecture', x + 5, y + 1); O.creerBatiment(e, 'prefecture', x + 5, y - 1);
  ok(!O.agrandir(e, bloque, 2), 'sans voisines ni zone vide autour, pas d\'agrandissement (la maison attend)');
}
{
  // Niveau 12 : besoins cumulés du cahier (section 5.2).
  const b = D.maisons[11].besoinsCumul;
  ok(b.eau === 2 && b.nourriture === 2 && b.religion === 2 && b.divertissement === 35 && ['ecole', 'bains', 'poterie', 'barbier', 'mobilier', 'huile', 'medecin', 'bibliotheque'].every((k) => b[k]),
    'insula de prestige : eau courante, 2 aliments, 2 dieux, divertissement 35, école, bains, poterie, barbier, mobilier, huile, médecin, bibliothèque');
  ok(D.niveauMax === 20 && D.maisons[19].emprise === 4 && D.maisons[14].emprise === 3, 'lot 4 : 20 niveaux, 3 × 3 cases au niveau 15, 4 × 4 au niveau 19');
  ok(D.maisons[9].habitants === 80 && D.maisons[9].emprise === 2, 'niveau 10 : 2 × 2 cases, 80 habitants');
}
{
  // Priorités de main-d'œuvre : la catégorie prioritaire est pourvue en entier.
  const e = partieEco();
  const fermes = [ex.poserPres(sim, e, 'ferme_ble', 40, 55), ex.poserPres(sim, e, 'ferme_ble', 40, 55)];
  const services = [];
  for (let k = 0; k < 30; k++) services.push(ex.poserPres(sim, e, 'ecole', 30 + (k % 10) * 3, 40));
  sim.repartirTravail(e);
  const avant = fermes[0].eff;
  sim.appliquer(e, { type: 'priorite', categorie: 'alimentation', valeur: 1 });
  sim.repartirTravail(e);
  ok(e.travailleurs < e.emploisRequis && avant < 10 && fermes.every((f) => f.eff === 10), `pénurie de bras : sans priorité, la ferme a ${avant} travailleurs sur 10 ; avec la priorité « alimentation », 10`);
  ok(!sim.appliquer(e, { type: 'priorite', categorie: 'cuisine', valeur: 1 }).ok, 'catégorie de travail inconnue refusée');
}
{
  // Santé (section 9.4) : médecin 50, bains 20, variété 20, absence de pénurie 10.
  const e = sim.nouvelle('pompei', { libre: true, tout: true, attractivite: false });
  const [x, y] = caseLibre(e, 0, -2);
  const a = maison(e, x, y, 4, 10), b = maison(e, x + 1, y, 4, 10);
  a.svc = { medecin: 10, bains: 10 }; a.viv = { ble: 5, legumes: 5, fruits: 5 };
  b.viv = {};
  ok(sim.calculerSante(e) === 50, `santé : ${sim.calculerSante(e)} (une maison parfaite, une affamée sans service : 50 attendu)`);
}

section('Économie (lot 2) : insula de prestige en construction libre');
{
  const e = sim.nouvelle('pompei', { libre: true, tout: true, risques: false, fonds: 1e6 });
  const plan = ex.planifier(sim, 'pompei', { niveau: 4 });
  let mois = null, max = 0, invariant = null;
  for (let m = 0; m < 60 && mois === null; m++) {
    for (let k = 0; k < TM; k++) { sim.pas(e); if (k === 0 || k === TM / 2) ex.jouer(sim, e, plan, { places: 80 }); }
    const pb = sim.invariants(e);
    if (pb.length && !invariant) invariant = pb[0];
    e.batiments.forEach((h) => { if (h.type === 'logement' && h.hab > 0) max = Math.max(max, h.niv); });
    if (max >= 12) mois = m + 1;
  }
  ok(!invariant, `invariants tenus pendant toute la partie${invariant ? ' : ' + invariant : ''}`);
  ok(mois !== null, `une insula de prestige (niveau 12) atteinte en construction libre${mois ? ` au mois ${mois}` : ` (niveau maximal ${max} en 5 ans)`}`);
  console.log(`  insula de prestige au mois ${mois} ; ${e.pop} habitants, ${e.batiments.length} bâtiments, attractivité appliquée : ${e.attractivite}`);
  // Sauvegarde puis chargement d'une ville du lot 2 : même état, puis mêmes 2 000 ticks.
  const txt = sim.exporter(e), e2 = sim.importer(txt);
  ok(sim.empreinte(e2) === sim.empreinte(e), 'ville du lot 2 : état identique après sauvegarde puis chargement');
  for (let k = 0; k < 2000; k++) { sim.pas(e); sim.pas(e2); }
  ok(sim.empreinte(e2) === sim.empreinte(e), 'ville du lot 2 : même état 2 000 ticks après le chargement');
}
{
  // Sauvegarde du lot 1 (version 1) : complétée à l'import, la partie continue.
  const e = villeTest(5);
  avancerVille(e, 3 * TM);
  const o = JSON.parse(sim.exporter(e));
  o.v = 1;
  ['attract', 'bancs', 'priorites', 'sante', 'flux', 'tout', 'risques', 'attractivite', 'epidemies'].forEach((k) => delete o[k]);
  o.batiments.forEach((b) => {
    if (b.type === 'theatre') { b.spect = b.spects.acteur || 0; b.attendu = b.attendus.acteur || 0; delete b.spects; delete b.attendus; }
    if (b.type === 'logement') { delete b.pts; delete b.quar; delete b.bloque; }
    if (b.type === 'grenier') { delete b.cons; delete b.mc; }
    if (b.type === 'marche') { delete b.interdits; delete b.dem; delete b.der; }
  });
  let e1 = null;
  try { e1 = sim.importer(JSON.stringify(o)); } catch (err) { ok(false, `sauvegarde du lot 1 refusée : ${err.message}`); }
  if (e1) {
    ok(e1.v === sim.VERSION_ETAT && e1.attract.length === e1.N * e1.N, 'sauvegarde du lot 1 relue et complétée (version actuelle)');
    let erreur = null;
    try { for (let k = 0; k < TM; k++) sim.pas(e1); } catch (err) { erreur = err; }
    ok(!erreur && sim.invariants(e1).length === 0, `la partie du lot 1 continue un mois sans erreur${erreur ? ' : ' + erreur.message : ''}`);
  }
}

// --------------------------------------------------------------------------
// Lot 3 « Commerce et empereur » (cahier, section 21) : un test par formule de cote (section 14),
// commerce (caravanes, navires, quotas, réserves), empereur (demandes, faveur, tribut, dette,
// présents, destitution), dieux et fêtes, événements, sauvegarde ; puis les missions Ravenne,
// Narbo et Massalia jouées par le gouverneur automatique en difficulté normale.
const Q = D.regles.maison.uniteParCharge;
// Mission du lot 3 en partie normale (empereur, dieux), carte vide ; « libre » pour les tests
// qui ne regardent que les cotes.
function partieMission(id = 'ravenne', options = {}) {
  const e = sim.nouvelle(id, { rang: 2, ...options });
  e.tresor = 1e6;
  if (!options.rang) e.salaireGouv = 0; // sans salaire du gouverneur : les comptes des tests tombent juste
  return e;
}
// Bâtiment en service le long de la voie de Rome (accès direct), effectif complet.
function batimentService(e, type, x) {
  const R = ex.ligneRome(sim, e), t = D.batiments[type].taille;
  const b = O.creerBatiment(e, type, x, R - t);
  b.eff = D.batiments[type].effectif;
  if (D.batiments[type].genre === 'spectacle') D.batiments[type].artistes.forEach((a) => { b.spects[a] = 30; });
  return b;
}
function habitants(e, n, niveau = 4) {
  const R = ex.ligneRome(sim, e), l = [];
  let x = 2;
  while (n > 0 && x < e.N - 2) {
    for (const y of [R + 2, R + 3, R + 4]) {
      if (n <= 0 || e.bat[y * e.N + x] || e.terrain[y * e.N + x] > 1) continue;
      const h = O.creerBatiment(e, 'logement', x, y);
      h.niv = niveau; h.hab = Math.min(n, sim.capacite(h)); n -= h.hab; l.push(h);
    }
    x++;
  }
  sim.majPopulation(e);
  return l;
}

section('Lot 3 : les cinq cotes (une formule chacune, section 14)');
{
  // Culture (14.3) : 1 000 habitants ; un petit temple (750), un théâtre (500), une bibliothèque
  // (800), une école (750), une académie (1 000), tous en service.
  const e = partieMission('massalia', { libre: true });
  habitants(e, 1000, 4);
  ok(e.pop === 1000, `population : ${e.pop} habitants logés (1 000 attendus)`);
  let x = 4;
  for (const t of ['temple_ceres', 'theatre', 'bibliotheque', 'ecole', 'academie']) { batimentService(e, t, x); x += 4; }
  const c = sim.cultureDetail(e);
  ok(c.detail.religion.pts === 23 && c.detail.theatre.pts === 13 && c.detail.bibliotheque.pts === 16 && c.detail.ecole.pts === 11 && c.detail.academie.pts === 10 && c.total === 73,
    `culture : religion ${c.detail.religion.pts}, théâtres ${c.detail.theatre.pts}, bibliothèques ${c.detail.bibliotheque.pts}, écoles ${c.detail.ecole.pts}, académies ${c.detail.academie.pts} = ${c.total} (23 + 13 + 16 + 11 + 10 = 73 attendus)`);
  e.batiments.filter((b) => b.type === 'theatre').forEach((b) => { b.spects = {}; });
  e.batiments.filter((b) => b.type === 'academie').forEach((b) => { b.eff = 0; });
  const c2 = sim.cultureDetail(e);
  ok(c2.detail.theatre.pts === 0 && c2.detail.academie.pts === 0, 'culture : un théâtre sans acteurs et une académie sans personnel ne comptent pas');
}
{
  // Prospérité (14.2) : variations et plafond par la qualité de l'habitat.
  const e = partieMission('ravenne', { libre: true });
  const maisons = habitants(e, 400, 13); // villas (niveau 13, valeur 80) : habitat riche
  maisons.forEach((h, k) => { h.viv = k % 2 ? { ble: 10, legumes: 10 } : { ble: 10 }; });
  e.chomage = 3; e.salaire = e.salaireRome + 2;
  const b = { ...e.finances.an, impots: 1000, exports: 500, salaires: 800, constructions: 200 };
  const p = sim.prosperiteAnnee(e, b);
  ok(p.detail.benefice === 5 && p.detail.chomage === 1 && p.detail.salaire === 1 && p.detail.habitat === 2 && p.detail.alimentation === 1 && p.variation === 10,
    `prospérité : bénéfice +5, chômage sous 5 % +1, salaire +1, habitat riche +2, deux aliments +1 = ${p.variation} (+10 attendu)`);
  ok(p.plafond === 80, `prospérité plafonnée par l'habitat : ${p.plafond} (villas : 80)`);
  maisons.forEach((h) => { h.niv = 2; h.hab = Math.min(h.hab, sim.capacite(h)); h.viv = {}; });
  sim.majPopulation(e);
  e.chomage = 20; e.salaire = e.salaireRome - 1;
  const p2 = sim.prosperiteAnnee(e, { ...b, exports: 0 });
  ok(p2.detail.benefice === -3 && p2.detail.chomage === -1 && p2.detail.salaire === -1 && p2.detail.habitat === -2 && !p2.detail.alimentation && p2.plafond === 5,
    `prospérité : déficit −3, chômage au-dessus de 15 % −1, salaire sous Rome −1, tentes −2, plafond ${p2.plafond} (5 attendu)`);
  e.cotes.prosperite = 4; e.finances.an = { ...b, exports: 0 };
  O.nouvelAn(e);
  ok(e.cotes.prosperite === 0, `prospérité de janvier : 4 − 7, bornée à 0 (${e.cotes.prosperite})`);
}
{
  // Paix (14.4) : +5 chaque janvier après une année sans incident.
  const e = partieMission('ravenne');
  e.cotes.paix = 10;
  O.nouvelAn(e);
  ok(e.cotes.paix === 15, `paix : +5 après une année sans incident (${e.cotes.paix})`);
  e.incidentsAn = 1;
  O.nouvelAn(e);
  ok(e.cotes.paix === 15, 'paix : rien après une année avec un incident');
}
{
  // Faveur (14.5) : départ, érosion, trésor négatif, secours, demandes, présents.
  const e = partieMission('ravenne');
  ok(e.cotes.faveur === 50, `faveur de départ : ${e.cotes.faveur} (50)`);
  e.tresor = 1000;
  O.anneeEmpereur(e, e.finances.prec);
  ok(e.cotes.faveur === 48, `faveur : érosion de 2 chaque janvier (${e.cotes.faveur})`);
  e.tresor = -2000;
  O.anneeEmpereur(e, e.finances.prec);
  ok(e.cotes.faveur === 41 && e.finances.an.interets === 200, `faveur : trésor négatif −5 et érosion −2 (${e.cotes.faveur}) ; intérêts de 10 % : ${e.finances.an.interets} (200)`);
  const f0 = e.cotes.faveur, avant = e.tresor;
  e.secoursRecu = false; e.tresor = -10;
  O.nouveauMois(e);
  ok(e.secoursRecu && e.cotes.faveur === f0 - 5, `secours de l'empereur : ${D.regles.secours.montant} deniers, faveur −5 (${f0} → ${e.cotes.faveur})`);
  // Demandes : à temps +gain, en retard +2, ignorée −8.
  e.tresor = 1e6;
  const g = O.creerBatiment(e, 'grenier', 4, ex.ligneRome(sim, e) - 3);
  g.stocks.ble = 500;
  const dm = O.creerDemande(e, { bien: 'ble', charges: 3, delai: 12, faveur: 7 }, 0);
  const f1 = e.cotes.faveur;
  ok(sim.appliquer(e, { type: 'expedier', id: dm.id }).ok && e.cotes.faveur === f1 + 7 && g.stocks.ble === 200, `demande satisfaite à temps : +7 (${f1} → ${e.cotes.faveur}), 3 charges retirées du grenier`);
  const dm2 = O.creerDemande(e, { bien: 'ble', charges: 1, delai: 6, faveur: 9 }, 0);
  sim._outils.moisEmpire(e, 6);
  ok(dm2.etat === 'retard', 'demande non satisfaite à l\'échéance : en retard (12 mois de plus)');
  const f2 = e.cotes.faveur;
  sim.appliquer(e, { type: 'expedier', id: dm2.id });
  ok(e.cotes.faveur === f2 + 2, `demande satisfaite en retard : +2 (${f2} → ${e.cotes.faveur})`);
  const dm3 = O.creerDemande(e, { deniers: 500, delai: 6, faveur: 6 }, 0);
  sim._outils.moisEmpire(e, 6);
  const f3 = e.cotes.faveur;
  sim._outils.moisEmpire(e, 6 + D.regles.empereur.retardMois);
  ok(dm3.etat === 'ignoree' && e.cotes.faveur === f3 - 8, `demande ignorée : −8 (${f3} → ${e.cotes.faveur})`);
  // Présents : 10, 25, 50 % de la fortune pour +2, +5, +10 ; moitié moins dans les 12 mois.
  e.fortune = 1000; e.presentT = -1;
  const f4 = e.cotes.faveur;
  sim.appliquer(e, { type: 'present', taille: 1 });
  ok(e.fortune === 750 && e.cotes.faveur === f4 + 5, `présent généreux : 25 % de la fortune (1 000 → ${e.fortune}), +5`);
  const f5 = e.cotes.faveur;
  sim.appliquer(e, { type: 'present', taille: 2 });
  ok(e.cotes.faveur === f5 + 5 && e.fortune === 375, `second présent dans les 12 mois : somptueux, moitié moins (+${e.cotes.faveur - f5})`);
}
{
  // Tribut (11.5) et salaire du gouverneur (11.6).
  const e = partieMission('ravenne');
  habitants(e, 1000, 4);
  const b = { ...e.finances.an, impots: 3000, exports: 1000, salaires: 1000, constructions: 5000 };
  const t0 = e.tresor;
  O.anneeEmpereur(e, b);
  ok(e.finances.an.tribut === 750, `tribut : 25 % du bénéfice hors constructions (4 000 − 1 000 = 3 000 → ${e.finances.an.tribut})`);
  const e2 = partieMission('ravenne');
  habitants(e2, 1000, 4);
  O.anneeEmpereur(e2, { ...e2.finances.an });
  ok(e2.finances.an.tribut === 50, `tribut minimal : population / 20 (${e2.finances.an.tribut})`);
  const e3 = partieMission('ravenne', { rang: 3 });
  ok(e3.salaireGouv === 30 && sim.salaireGouvMax(e3) === 30, `salaire du gouverneur : 10 deniers par rang (rang 3 : ${e3.salaireGouv})`);
  const fo = e3.fortune;
  O.nouveauMois(e3);
  ok(e3.fortune === fo + 30 && e3.finances.an.gouverneur === 30, 'le salaire du gouverneur passe du trésor à sa fortune');
  ok(!sim.appliquer(e3, { type: 'reglage', cle: 'salaireGouv', valeur: 99 }).ok || e3.salaireGouv === 30, 'salaire plafonné');
}
{
  // Destitution (2.4) : faveur ≤ 10 pendant 12 mois consécutifs.
  const e = partieMission('ravenne');
  e.cotes.faveur = 10;
  for (let m = 1; m <= 11; m++) O.moisEmpire(e, m);
  ok(!e.defaite, 'faveur à 10 pendant 11 mois : pas encore de destitution');
  O.moisEmpire(e, 12);
  ok(!e.defaite && e.legions && e.legions.mois === 15, 'faveur à 10 pendant 12 mois : les légions de l\'empereur sont annoncées pour dans 3 mois (lot 4)');
  for (let m = 13; m <= 15; m++) O.moisEmpire(e, m);
  ok(e.invasion && e.invasion.legions && e.unites.filter((u) => u.c === 1).length === D.regles.militaire.legions.effectif, 'trois mois plus tard, les légions entrent sur la carte');
  // Sans soldat, elles atteignent la ville : la mission est perdue.
  O.creerBatiment(e, 'forum', 60, 60);
  for (let k = 0; k < 20 * 60 * 6 && !e.defaite; k++) sim.pas(e);
  ok(e.defaite && e.defaite.cause === 'destitution', 'les légions atteignent le forum : destitution');
}

section('Lot 3 : commerce (section 12)');
{
  // Caravane : 3 charges exportées (stock 5, minimum 2), 4 importées (stock cible 4), payées sur-le-champ.
  const e = partieMission('ravenne');
  habitants(e, 100, 2); // des travailleurs pour l'entrepôt
  const ent = batimentService(e, 'entrepot', 6);
  ent.stocks.poterie = 5 * Q;
  ok(!sim.appliquer(e, { type: 'ouvrirRoute', cite: 'aquileia' }).ok, 'une cité pas encore connue ne s\'ouvre pas');
  const t0 = e.tresor;
  ok(sim.appliquer(e, { type: 'ouvrirRoute', cite: 'bononia' }).ok && e.tresor === t0 - 900, 'route de Bononia ouverte : 900 deniers, paiement unique');
  e.routes.bononia.x = 1e9; // le test envoie lui-même ses caravanes
  sim.appliquer(e, { type: 'commerce', bien: 'poterie', statut: 'exporter', cible: 2 });
  sim.appliquer(e, { type: 'commerce', bien: 'huile', statut: 'importer', cible: 4 });
  const c = sim.citeDe(e, 'bononia'), t1 = e.tresor;
  ok(O.envoyerCaravane(e, c), 'une caravane part vers l\'entrepôt le plus proche');
  for (let k = 0; k < 6 * TM && e.marcheurs.some((w) => w.type === 'caravane'); k++) sim.pas(e);
  const px = sim.prixBien(e, 'poterie').x, pi = sim.prixBien(e, 'huile').i;
  ok(ent.stocks.poterie === 2 * Q && ent.stocks.huile === 4 * Q, `caravane : poterie 5 → ${ent.stocks.poterie / Q} charges (minimum 2), huile 0 → ${(ent.stocks.huile || 0) / Q} (cible 4)`);
  ok(e.tresor === t1 + 3 * px - 4 * pi, `paiements : +3 × ${px} − 4 × ${pi} (trésor ${t1} → ${e.tresor})`);
  ok(sim.echange(e, c, 'a', 'poterie') === 3 && sim.echange(e, c, 'v', 'huile') === 4, 'quotas : 3 charges achetées et 4 vendues par Bononia cette année');
  // Quota presque épuisé : une seule charge de plus.
  ent.stocks.poterie = 10 * Q;
  e.routes.bononia.n['a:poterie'] = sim.quota(e, c, 'a', 'poterie') - 1;
  O.envoyerCaravane(e, c);
  for (let k = 0; k < 6 * TM && e.marcheurs.some((w) => w.type === 'caravane'); k++) sim.pas(e);
  ok(ent.stocks.poterie === 9 * Q, `quota annuel respecté : 1 seule charge de plus (${ent.stocks.poterie / Q} charges restent)`);
  O.nouvelAn(e);
  ok(sim.echange(e, c, 'a', 'poterie') === 0, 'quotas remis à zéro en janvier');
  // Bien réservé : ni consommé par les marchés, ni exporté.
  sim.appliquer(e, { type: 'commerce', bien: 'poterie', statut: 'reserver', cible: 0 });
  O.envoyerCaravane(e, c);
  for (let k = 0; k < 6 * TM && e.marcheurs.some((w) => w.type === 'caravane'); k++) sim.pas(e);
  ok(ent.stocks.poterie === 9 * Q, 'bien réservé : pas exporté');
  ok(!sim.appliquer(e, { type: 'commerce', bien: 'poterie', statut: 'vendre' }).ok, 'statut inconnu refusé');
}
{
  // Navire : route de mer seulement avec un quai de commerce ; il accoste, ses dockers font la
  // navette, il repart après 40 jours au plus.
  const e = partieMission('narbo');
  ok(sim.appliquer(e, { type: 'ouvrirRoute', cite: 'tarraco' }).raison === 'quai', 'route de mer refusée sans quai de commerce en service');
  const R = ex.ligneRome(sim, e);
  habitants(e, 200, 2);
  const quai = ex.poserPres(sim, e, 'quai_commerce', 60, 104, 30);
  const ent = quai && ex.poserPres(sim, e, 'entrepot', quai.x + 1, quai.y - 4, 10);
  if (ok(quai && ent, 'quai de commerce et entrepôt posés au bord de la mer')) {
    quai.eff = 12; ent.eff = 6;
    sim.repartirTravail(e);
    quai.eff = 12; ent.eff = 6;
    ok(sim.appliquer(e, { type: 'ouvrirRoute', cite: 'tarraco' }).ok, 'route de Tarraco ouverte avec le quai');
    e.routes.tarraco.x = 1e9; // un seul navire, envoyé par le test
    ent.stocks.armes = 6 * Q;
    sim.appliquer(e, { type: 'commerce', bien: 'armes', statut: 'exporter', cible: 0 });
    O.envoyerNavire(e, sim.citeDe(e, 'tarraco'));
    let accoste = -1, parti = -1;
    for (let k = 0; k < 4 * TM; k++) {
      if (k % TJ === 0) { quai.eff = 12; ent.eff = 6; }
      sim.pas(e);
      const w = e.marcheurs.find((m) => m.type === 'navire');
      if (w && w.phase === 'quai' && accoste < 0) accoste = k;
      if (accoste >= 0 && !w && parti < 0) parti = k;
    }
    ok(accoste >= 0, `le navire accoste au quai (jour ${Math.round(accoste / TJ)})`);
    ok(sim.echange(e, sim.citeDe(e, 'tarraco'), 'a', 'armes') > 0, `les dockers chargent ${sim.echange(e, sim.citeDe(e, 'tarraco'), 'a', 'armes')} charge(s) d'armes`);
    ok(parti > 0 && (parti - accoste) / TJ <= D.regles.commerce.navireJours + 2, `le navire repart (${Math.round((parti - accoste) / TJ)} jours au quai, 40 au plus)`);
  }
}

section('Lot 3 : dieux et fêtes (section 9.1)');
{
  const e = partieMission('ravenne');
  habitants(e, 1500, 4);
  batimentService(e, 'temple_ceres', 4);
  const cu = sim.cultes(e);
  ok(sim.cibleDieu(e, 'ceres', cu).cible === 50, `cible de Cérès : couverture 750 / 1 500 habitants = ${sim.cibleDieu(e, 'ceres', cu).cible}`);
  batimentService(e, 'temple_venus', 8); batimentService(e, 'temple_mars', 12); batimentService(e, 'temple_mercure', 16);
  const cu2 = sim.cultes(e), j = sim.cibleDieu(e, 'neptune', cu2);
  ok(j.jaloux && j.cible === 0, 'jalousie : Neptune, seul sans temple, voit sa cible baisser de 20 (0 au plus bas)');
  e.divins.ceres.s = 40;
  O.moisDieux(e, 1);
  ok(e.divins.ceres.s === 41, `la satisfaction se rapproche de la cible d'un point par mois (40 → ${e.divins.ceres.s})`);
  // Colère sous 10, puis remontée à 30 ; bienfait au-dessus de 90, 24 mois au plus tôt.
  e.divins.venus.s = 9; e.divins.venus.c = 9; const hum = e.humeur;
  O.colereDieu(e, 'venus'); // effet seul
  ok(e.humeur === hum - 10, `colère de Vénus : humeur −10 (${hum} → ${e.humeur})`);
  e.divins.neptune.s = 5;
  O.moisDieux(e, 2);
  ok(e.divins.neptune.s === 30 && e.effets.quais === D.regles.dieux.quaisArretMois, 'satisfaction sous 10 : colère (quais à l\'arrêt), puis remontée à 30');
  const f = O.creerBatiment(e, 'ferme_ble', 30, 10); f.prog = 0;
  e.divins.ceres.s = 95; e.divins.ceres.b = -1000;
  O.moisDieux(e, 3);
  ok(f.prog === D.regles.ferme.progressionCharge, 'bienfait de Cérès au-dessus de 90 : récolte immédiate dans toutes les fermes');
  f.prog = 0; e.divins.ceres.s = 95;
  O.moisDieux(e, 10);
  ok(f.prog === 0, 'pas de second bienfait avant 24 mois');
  // Fêtes : coût par tranche de 100 habitants (50 au moins), effet 2 mois plus tard ; la grandiose exige du vin.
  const cout = sim.coutFete(e, 'grande');
  ok(cout === Math.max(50, Math.ceil(e.pop * 10 / 100)), `grande fête : ${cout} deniers pour ${e.pop} habitants`);
  ok(sim.appliquer(e, { type: 'fete', dieu: 'grandiose' }).ok === false, 'fête d\'un dieu inconnu refusée');
  ok(sim.appliquer(e, { type: 'fete', dieu: 'mars', taille: 'grandiose' }).raison === 'vin', 'fête grandiose refusée sans vin en entrepôt');
  const s0 = e.divins.mars.s;
  ok(sim.appliquer(e, { type: 'fete', dieu: 'mars', taille: 'grande' }).ok && sim.appliquer(e, { type: 'fete', dieu: 'mars', taille: 'petite' }).raison === 'fete', 'une fête à la fois');
  e.tick += 2 * TM;
  O.moisEmpire(e, 20);
  ok(e.divins.mars.s >= s0 + 10 - 1 && !e.fete, `fête de Mars deux mois plus tard : +10 (${s0} → ${e.divins.mars.s})`);
}

section('Lot 3 : événements (section 15.2)');
{
  const e = partieMission('narbo');
  const s0 = e.salaireRome;
  O.evenement(e, { type: 'salaireRome', delta: 3 }, 5);
  ok(e.salaireRome === s0 + 3, 'salaire de Rome : +3');
  const p0 = sim.prixBien(e, 'armes').x;
  O.evenement(e, { type: 'prix', bien: 'armes', delta: 25 }, 5);
  ok(sim.prixBien(e, 'armes').x === p0 + 25, 'prix d\'un bien : +25 à l\'achat et à la vente');
  const c = sim.citeDe(e, 'ostia');
  O.evenement(e, { type: 'quota', cite: 'ostia', sens: 'a', bien: 'armes', pas: 1 }, 5);
  ok(sim.quota(e, c, 'a', 'armes') === 40, `quota d'une cité : palier supérieur (25 → ${sim.quota(e, c, 'a', 'armes')})`);
  O.evenement(e, { type: 'routeFermee', cite: 'ostia', duree: 3 }, 5);
  e.routes.ostia.o = 1;
  ok(!sim.routeActive(e, c), 'route fermée pendant 3 mois');
  for (let m = 6; m < 9; m++) O.moisEmpire(e, m);
  ok(sim.routeActive(e, c), 'route rouverte au bout de 3 mois');
  ok(!e.routes.carthagonova.v, 'Carthago Nova inconnue au départ');
  O.evenement(e, { type: 'nouvelleCite', cite: 'carthagonova' }, 5);
  ok(e.routes.carthagonova.v === 1, 'nouvelle cité partenaire : la route devient ouvrable');
  O.evenement(e, { type: 'mauvaiseRecolte', duree: 12 }, 5);
  ok(e.effets.recolte === 12, 'mauvaise récolte : fertilité divisée par 2 pendant 12 mois');
  const mine = ex.poserPres(sim, e, 'mine_fer', 14, 18, 20);
  O.evenement(e, { type: 'sitePerdu' }, 5);
  ok(mine && !e.batiments.includes(mine), 'site d\'extraction perdu : la mine est détruite');
  const R = ex.ligneRome(sim, e);
  const b = O.creerBatiment(e, 'grenier', 60, R - 3);
  O.evenement(e, { type: 'seisme', zone: [59, R - 4, 63, R - 1] }, 5);
  ok(!e.batiments.includes(b) && e.batiments.some((x) => x.type === 'ruines' && x.x === 60), 'tremblement de terre : les bâtiments de la bande deviennent des ruines');
  // Script de la mission : dates tirées dans les fenêtres, chaque événement joué une fois.
  const m = D.missions.find((x) => x.id === 'narbo'), e2 = sim.nouvelle('narbo', {});
  ok(e2.script.length === m.evenements.length && e2.script.every((s, k) => { const ev = m.evenements[k]; return ev.mois !== undefined ? s.m === ev.mois : s.m >= ev.fenetre[0] && s.m <= ev.fenetre[1]; }),
    'script de Narbo : une date par événement, dans sa fenêtre');
  const e3 = sim.nouvelle('narbo', {});
  ok(JSON.stringify(e3.script) === JSON.stringify(e2.script), 'même graine, mêmes dates');
}

section('Lot 3 : sauvegarde (version 3)');
{
  const e = partieMission('narbo');
  habitants(e, 300, 3);
  sim.appliquer(e, { type: 'commerce', bien: 'armes', statut: 'exporter', cible: 2 });
  O.creerDemande(e, { bien: 'vin', charges: 4, delai: 12, faveur: 8 }, 0);
  for (let k = 0; k < 3 * TM; k++) sim.pas(e);
  const e2 = sim.importer(sim.exporter(e));
  ok(sim.empreinte(e2) === sim.empreinte(e), 'partie du lot 3 : état identique après sauvegarde puis chargement');
  for (let k = 0; k < 2000; k++) { sim.pas(e); sim.pas(e2); }
  ok(sim.empreinte(e2) === sim.empreinte(e), 'partie du lot 3 : même état 2 000 ticks après le chargement');
  // Sauvegarde du lot 2 (version 2) : complétée.
  const o = JSON.parse(sim.exporter(sim.nouvelle('pompei', {})));
  o.v = 2;
  ['empereur', 'dieux', 'cotes', 'prosDetail', 'faveurBasse', 'incidentsAn', 'rang', 'fortune', 'salaireGouv', 'presentT', 'commerce', 'routes', 'prix', 'demandes', 'script', 'divins', 'fete', 'effets', 'mer'].forEach((k) => delete o[k]);
  let e3 = null;
  try { e3 = sim.importer(JSON.stringify(o)); } catch (err) { ok(false, `sauvegarde du lot 2 refusée : ${err.message}`); }
  if (e3) {
    let erreur = null;
    try { for (let k = 0; k < TM; k++) sim.pas(e3); } catch (err) { erreur = err; }
    ok(e3.v === sim.VERSION_ETAT && !erreur && sim.invariants(e3).length === 0, `sauvegarde du lot 2 complétée, la partie continue${erreur ? ' : ' + erreur.message : ''}`);
  }
}

section('Lot 3 : missions jouées par le gouverneur automatique (difficulté normale)');
{
  const resultats = {};
  for (const [id, rang, moisMax, exige] of [['ravenne', 2, 240, true], ['narbo', 3, 300, true], ['massalia', 4, 360, false]]) {
    const plan = ex.planifierMission(sim, id), e = sim.nouvelle(id, { rang }), etat = {};
    const t0 = Date.now();
    let invariant = null;
    for (let m = 0; m < moisMax && !e.victoire && !e.defaite; m++) {
      for (let k = 0; k < TM; k++) { sim.pas(e); if (k === 0 || k === TM / 2) ex.jouerMission(sim, e, plan, etat); }
      if (!invariant) { const pb = sim.invariants(e); if (pb.length) invariant = pb[0]; }
    }
    ok(!invariant, `${id} : invariants tenus${invariant ? ' : ' + invariant : ''}`);
    const bilan = e.victoire ? `gagnée au mois ${e.victoire.mois}, ${e.victoire.etoiles} étoile(s)` : e.defaite ? `perdue (${e.defaite.cause})` : 'pas encore gagnée';
    const texte = `${id} ${bilan} : ${e.pop} habitants, culture ${e.cotes.culture}, prospérité ${e.cotes.prosperite}, paix ${e.cotes.paix}, faveur ${e.cotes.faveur} ; ${((Date.now() - t0) / 1000).toFixed(0)} s`;
    if (exige) ok(!!e.victoire, texte);
    console.log('  ' + texte + (exige ? '' : ' (mesure seulement : voir le cahier, section 23.6)'));
    resultats[id] = e.victoire ? e.victoire.mois : null;
  }
}

// --------------------------------------------------------------------------
// Lot 4 « Guerre et patriciens » (cahier, section 21) : patriciens, sénat, résidences,
// hippodrome, pyramide des âges, criminalité, difficulté, armée (caserne, forts, combat, tours,
// murailles, invasions, demandes de troupes, légions), missions Aquilée et Vindobona.
section('Lot 4 : patriciens (niveaux 13 à 20)');
{
  const e = partieMission('vindobona', { libre: true, tout: true });
  const [x, y] = caseLibre(e, 0, 3);
  // Une insula de prestige (2 × 2, 96 habitants) qui devient petite villa (40) : 56 sans-abri.
  const h = O.creerBatiment(e, 'logement', x, y, 2);
  h.niv = 12; h.hab = 96; sim.majPopulation(e);
  O.monter(e, h, D.maisons[11], D.maisons[12]);
  const partis = e.marcheurs.filter((w) => w.type === 'sansabri').reduce((n, w) => n + w.gens, 0);
  ok(h.niv === 13 && h.hab === 40 && partis === 56, `12 → 13 : la villa garde 40 habitants, 56 repartent chercher un logement (${partis})`);
  // Les patriciens ne travaillent pas.
  const e2 = partieMission('vindobona', { libre: true, tout: true });
  const [x2, y2] = caseLibre(e2, 0, 3);
  const v = O.creerBatiment(e2, 'logement', x2, y2, 2); v.niv = 14; v.hab = 44;
  const p = O.creerBatiment(e2, 'logement', x2 + 3, y2, 1); p.niv = 6; p.hab = 14;
  sim.majPopulation(e2);
  sim.repartirTravail(e2);
  ok(e2.travailleurs === Math.floor(14 * sim.partActifs(e2)), `travailleurs : seuls les plébéiens comptent (${e2.travailleurs} pour 14 plébéiens et 44 patriciens)`);
  ok(D.maisons[12].impot === 12 && D.maisons[16].impot === 30, 'impôt : coefficient 12 pour les villas, 30 pour les palais (section 11.2)');
  // Agrandissement : une villa de 2 × 2 au niveau 14 s'étend à 3 × 3 sur des jardins.
  const e3 = partieMission('vindobona', { libre: true, tout: true });
  const [x3, y3] = caseLibre(e3, 0, 3);
  const g = O.creerBatiment(e3, 'logement', x3, y3, 2); g.niv = 14; g.hab = 44;
  for (let k = 0; k < 3; k++) O.creerBatiment(e3, 'jardin', x3 + 2, y3 + k);
  O.creerBatiment(e3, 'jardin', x3, y3 + 2); O.creerBatiment(e3, 'jardin', x3 + 1, y3 + 2);
  ok(O.agrandir(e3, g, 3) && g.t === 3 && g.x === x3 && g.y === y3, 'niveau 15 : la villa de 2 × 2 absorbe 5 jardins et passe à 3 × 3');
  ok(sim.invariants(e3).length === 0, 'agrandissement à 3 × 3 : emprise cohérente (invariants)');
  // Bâtiments uniques.
  const e4 = partieMission('vindobona', { libre: true, tout: true });
  const [x4, y4] = caseLibre(e4, 0, -12);
  ok(sim.appliquer(e4, { type: 'poser', bat: 'residence_maison', x: x4, y: y4 }).ok, 'une résidence du gouverneur se pose');
  const r2 = sim.appliquer(e4, { type: 'poser', bat: 'residence_palais', x: x4 + 8, y: y4 });
  ok(!r2.ok && r2.raison === 'unique', 'une seconde résidence (même d\'une autre taille) est refusée : une par ville');
}

{
  // Montée jusqu'au palais impérial (niveau 20, 4 × 4) en construction libre : un carré de
  // 16 logements, un anneau de places, un anneau de grandes statues, la résidence et le sénat ;
  // le test fournit chaque jour les services, les biens et l'eau (les marcheurs ne sont pas en
  // cause ici, voir le cahier, section 23.9).
  const e = sim.nouvelle('vindobona', { libre: true, tout: true, risques: false, fonds: 1e6 });
  const N = e.N, R = ex.ligneRome(sim, e), x0 = 50, y0 = R - 16;
  const zone = (x, y, t) => { const l = []; for (let j = y; j < y + t; j++) for (let i = x; i < x + t; i++) l.push([i, j]); return l; };
  sim.appliquer(e, { type: 'tracer', bat: 'deblayer', cases: zone(x0 - 14, y0 - 14, 32).filter(([i, j]) => e.terrain[j * N + i] === sim.T.ARBRES) });
  const places = []; // l'anneau de places sert de route (une maison doit avoir une route à 2 cases)
  for (let i = x0 - 1; i <= x0 + 4; i++) { places.push([i, y0 - 1]); places.push([i, y0 + 4]); }
  for (let j = y0; j < y0 + 4; j++) { places.push([x0 - 1, j]); places.push([x0 + 4, j]); }
  sim.appliquer(e, { type: 'tracer', bat: 'route', cases: places });
  sim.appliquer(e, { type: 'tracer', bat: 'place', cases: places });
  sim.appliquer(e, { type: 'tracer', bat: 'logement', cases: zone(x0, y0, 4) });
  const statues = [];
  for (let i = x0 - 4; i <= x0 + 5; i += 3) { statues.push([i, y0 - 4]); statues.push([i, y0 + 5]); }
  for (let j = y0 - 1; j <= y0 + 2; j += 3) { statues.push([x0 - 4, j]); statues.push([x0 + 5, j]); }
  statues.forEach(([i, j]) => sim.appliquer(e, { type: 'poser', bat: 'statue_grande', x: i, y: j }));
  sim.appliquer(e, { type: 'poser', bat: 'residence_palais', x: x0 + 8, y: y0 - 1 });
  sim.appliquer(e, { type: 'poser', bat: 'senat', x: x0 - 9, y: y0 - 1 });
  sim.calculerAttractivite(e);
  const SVC = ['ecole', 'bains', 'barbier', 'medecin', 'bibliotheque', 'hopital', 'academie', 'impot', 'dieu_ceres', 'dieu_neptune', 'dieu_mercure', 'dieu_mars', 'dieu_venus'];
  const PTS = { theatre: 15, amphitheatre: 20, colisee: 25, hippodrome: 30 };
  const premiere = e.batiments.find((b) => b.type === 'logement');
  premiere.hab = 4; premiere.niv = 1;
  let max = 0, jour20 = null, t20 = 0;
  for (let jour = 0; jour < 200 && max < 20; jour++) {
    for (const h of e.batiments) if (h.type === 'logement' && h.hab > 0) {
      SVC.forEach((k) => { h.svc[k] = 48; });
      for (const k in PTS) { h.svc[k] = 48; h.pts[k] = PTS[k]; }
      ['ble', 'legumes', 'fruits'].forEach((g) => { h.viv[g] = 2000; });
      ['poterie', 'mobilier', 'huile', 'vin'].forEach((g) => { h.viv[g] = 400; });
      h.hab = sim.capacite(h);
      for (let j = h.y; j < h.y + h.t; j++) for (let i = h.x; i < h.x + h.t; i++) { e.eauFontaine[j * N + i] = 1; e.eauPuits[j * N + i] = 1; }
    }
    sim.majPopulation(e);
    for (const h of e.batiments.slice()) if (h.type === 'logement' && h.hab > 0) O.quotidien(e, h);
    e.batiments.forEach((h) => { if (h.type === 'logement' && h.hab > 0 && h.niv > max) { max = h.niv; if (max === 20) { jour20 = jour; t20 = h.t; } } });
  }
  ok(max === 20 && t20 === 4, `palais impérial (niveau 20, 4 × 4) atteint au jour ${jour20} : agrandissements 2 × 2, 3 × 3 puis 4 × 4 (niveau maximal ${max})`);
  ok(sim.invariants(e).length === 0, 'montée au palais impérial : invariants tenus');
}

section('Lot 4 : sénat, hippodrome');
{
  const e = partieMission('vindobona', { libre: true, tout: true });
  habitants(e, 300, 6);
  const s = batimentService(e, 'senat', 30);
  for (let k = 0; k < 3 * TJ; k++) sim.pas(e);
  const perc = e.marcheurs.filter((w) => w.type === 'percepteur' && w.o === s.id).length;
  ok(perc === 2, `le sénat envoie deux percepteurs à la fois (${perc})`);
  const h = batimentService(e, 'hippodrome', 50);
  h.spects = {};
  ok(sim.cause(e, h) === 'sansArtiste', 'hippodrome sans char : relâche');
  const f = batimentService(e, 'fabrique_chars', 70);
  let arrive = false;
  for (let k = 0; k < 40 * TJ && !arrive; k++) { sim.pas(e); arrive = (h.spects.char || 0) > 0; }
  ok(arrive, 'la fabrique de chars envoie un char : l\'hippodrome ouvre ses courses');
  ok(sim.pointsSpectacle(h) === 30, `hippodrome en course : 30 points (${sim.pointsSpectacle(h)})`);
  void f;
}

section('Lot 4 : pyramide des âges (section 6.3)');
{
  const e = partieMission('ravenne', { libre: true });
  habitants(e, 400, 4);
  e.sante = 60;
  O.moisAges(e);
  const somme = e.ages.reduce((a, b) => a + b, 0);
  proche(somme, e.pop, 0.01, 'la pyramide compte exactement la population logée');
  proche(sim.partActifs(e), D.regles.travail.partTravailleurs, 0.02, 'ville au profil des immigrants : 40 % de travailleurs');
  // Une ville qui vieillit perd des travailleurs.
  const n = e.ages.length; e.ages = new Array(n).fill(0); e.ages[6] = e.pop * 0.6; e.ages[7] = e.pop * 0.4;
  ok(sim.partActifs(e) === 0, 'une ville de sexagénaires n\'a plus de travailleurs');
  // Mortalité : plus forte quand la santé est basse.
  const morts = (sante) => { const x = partieMission('ravenne', { libre: true }); habitants(x, 600, 4); x.sante = sante; O.moisAges(x); let m = 0; for (let k = 0; k < 24; k++) { x.flux.morts = 0; O.moisAges(x); m += x.flux.morts; } return m; };
  const mBas = morts(5), mHaut = morts(95);
  ok(mBas > mHaut, `mortalité : ${mBas} décès en 2 ans avec une santé de 5, ${mHaut} avec 95`);
  // Naissances seulement dans une maison qui a de la place.
  const pleine = partieMission('ravenne', { libre: true });
  habitants(pleine, 200, 4);
  pleine.batiments.forEach((b) => { if (b.type === 'logement') b.hab = sim.capacite(b); });
  sim.majPopulation(pleine);
  const p0 = pleine.pop; pleine.sante = 100;
  for (let k = 0; k < 12; k++) O.moisAges(pleine);
  ok(pleine.pop <= p0 && pleine.histo.length === 0, `maisons pleines : aucune naissance (${p0} → ${pleine.pop})`);
}

section('Lot 4 : criminalité, voleurs, émeutes (section 10.3)');
{
  const e = partieMission('ravenne');
  const l = habitants(e, 200, 6);
  const tente = O.creerBatiment(e, 'logement', l[l.length - 1].x + 1, l[l.length - 1].y); tente.niv = 2; tente.hab = 6;
  sim.majPopulation(e);
  e.humeur = 30;
  O.moisCrime(e);
  proche(l[0].crime, 4, 0.001, 'humeur 30 : la criminalité d\'une masure monte de (50 − 30) / 5 = 4');
  proche(tente.crime, 8, 0.001, '… doublée pour une tente : 8');
  // Un voleur dérobe au forum, puis s'enfuit ; un préfet l'arrête.
  const forum = batimentService(e, 'forum', 60);
  l[0].crime = 100; e.tresor = 5000;
  const t0 = e.tresor;
  O.lancerCriminel(e, l[0], 'voleur');
  for (let k = 0; k < 20 * TJ && !e.finances.an.vols; k++) sim.pas(e);
  ok(e.finances.an.vols >= D.regles.crime.volMin && e.finances.an.vols <= D.regles.crime.volMax && e.tresor <= t0 - e.finances.an.vols + 1000, `un voleur dérobe ${e.finances.an.vols} deniers au forum (poste « Vols »)`);
  void forum;
  // Émeute : la paix baisse de 5, au plus 20 par an.
  const e2 = partieMission('ravenne');
  const l2 = habitants(e2, 400, 3);
  batimentService(e2, 'theatre', 60); batimentService(e2, 'forum', 64); batimentService(e2, 'marche', 68);
  e2.cotes.paix = 50; e2.humeur = 10;
  let emeutes = 0;
  for (let r = 0; r < 8; r++) { const w = l2[r]; w.crime = 100; O.lancerCriminel(e2, w, 'emeutier'); }
  for (let k = 0; k < 30 * TJ; k++) sim.pas(e2);
  emeutes = e2.stats.emeutes || 0;
  ok(emeutes >= 1 && e2.stats.incendies >= 1, `des émeutiers incendient la ville (${emeutes} émeutes, ${e2.stats.incendies} incendies)`);
  ok(e2.cotes.paix === 50 - Math.min(20, 5 * emeutes), `paix : −5 par émeute, 20 au plus par an (${e2.cotes.paix})`);
  // Un préfet arrête un criminel croisé.
  const e3 = partieMission('ravenne');
  const l3 = habitants(e3, 100, 3);
  const pf = batimentService(e3, 'prefecture', l3[0].x + 20);
  batimentService(e3, 'forum', 80); // le voleur vise le forum
  l3[0].crime = 100;
  O.lancerCriminel(e3, l3[0], 'voleur'); // sa maison borde la voie de Rome : il part de la route
  const w = e3.marcheurs.find((m) => m.type === 'voleur');
  if (w) { const pr = O.creerMarcheur(e3, 'prefet', w.y * e3.N + w.x, { o: pf.id, pas: 0, portee: 26, retour: 0, ch: null, k: 0 }); void pr; }
  for (let k = 0; k < 40 && !(e3.stats.arrestations > 0); k++) sim.pas(e3);
  ok(e3.stats.arrestations === 1 && !e3.marcheurs.some((m) => m.type === 'voleur'), 'un préfet qui croise un voleur l\'arrête');
}

section('Lot 4 : armée (sections 13.1 à 13.6)');
// Partie libre de Vindobona, deux forts pleins, une invasion de n ennemis à 40 cases au nord.
function partieArmee(n, faction = 'gaulois', options = {}) {
  const e = sim.nouvelle('vindobona', { libre: true, tout: true, fonds: 1e6, ...options });
  const N = e.N, libre = (x, y, t) => { for (let j = y; j < y + t; j++) for (let i = x; i < x + t; i++) { const k = j * N + i; if (e.bat[k] || e.route[k] || e.terrain[k] >= 2) return false; } return true; };
  const poser = (type, x0, y0) => { const t = D.batiments[type].taille; for (let r = 0; r < 30; r++) for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) if (libre(x, y, t)) return O.creerBatiment(e, type, x, y); return null; };
  const forts = (options.forts || ['fort_legionnaires', 'fort_javelots']).map((t, k) => poser(t, 50 + 7 * k, 44));
  forts.forEach((f) => { for (let k = 0; k < 16; k++) O.creerUnite(e, 0, D.batiments[f.type].unite, sim.ancreFort(e, f), { f: f.id }); });
  const maisons = []; for (let k = 0; k < 8; k++) maisons.push(poser('logement', 52 + k, 58));
  if (n) O.lancerInvasion(e, { faction, effectif: n, entree: [56, 2] }, false);
  return { e, forts, maisons, poser };
}
{
  const { e } = partieArmee(50);
  ok(e.unites.filter((u) => u.c === 1).length === 50, 'invasion : 50 ennemis entrent sur la carte');
  const comp = {}; e.unites.forEach((u) => { if (u.c === 1) comp[u.k] = (comp[u.k] || 0) + 1; });
  ok(comp.legere === 25 && comp.lourde === 10 && comp.tireur === 10 && comp.cavalerie === 5, `dosage des Gaulois : ${JSON.stringify(comp)}`);
  let pire = 0;
  const t0 = process.hrtime.bigint();
  let ticks = 0, invariant = null;
  while (e.invasion && ticks < 20 * TM) {
    const a = process.hrtime.bigint(); sim.pas(e); const d = Number(process.hrtime.bigint() - a) / 1e6; if (d > pire) pire = d;
    ticks++;
    if (!invariant && ticks % 50 === 0) { const pb = sim.invariants(e); if (pb.length) invariant = pb[0]; }
  }
  const moy = Number(process.hrtime.bigint() - t0) / 1e6 / ticks;
  ok(!invariant, `invariants tenus pendant le combat${invariant ? ' : ' + invariant : ''}`);
  ok(!e.invasion, `l'invasion se termine (${ticks} ticks)`);
  ok(moy < 4, `invasion de 50 ennemis : ${moy.toFixed(3)} ms par tick en moyenne (cible 4 ms), ${pire.toFixed(1)} ms au pire`);
  console.log(`  invasion de 50 ennemis : ${moy.toFixed(3)} ms par tick en moyenne, ${pire.toFixed(1)} ms au pire, ${ticks} ticks ; ${e.stats.ennemisTues || 0} ennemis tués, ${e.stats.soldatsMorts || 0} soldats morts, ${e.stats.detruits || 0} bâtiments détruits, paix ${e.cotes.paix}`);
  const entr = e.unites.filter((u) => u.c === 0 && u.combat === 0 && u.entr === 1).length;
  ok(entr > 0, `entraînement : +1 aux soldats qui ont combattu (${entr})`);
  ok(e.cotes.paix === (e.stats.detruits ? 0 : D.regles.militaire.paix.repoussee), 'paix : +5 pour une invasion repoussée sans bâtiment détruit');
}
{
  // Retraite à 70 % de pertes : les survivants repartent par leur point d'entrée.
  const { e } = partieArmee(20);
  let fuite = false;
  while (e.invasion && !fuite) { sim.pas(e); fuite = e.invasion && e.invasion.fuite; }
  ok(fuite && e.invasion.morts * 100 >= 70 * e.invasion.n, 'l\'ennemi bat en retraite après 70 % de pertes');
}
{
  // Sans défense, l'ennemi détruit : −1 de paix par bâtiment, 30 au plus.
  const { e } = partieArmee(30, 'gaulois', { forts: [] });
  e.cotes.paix = 60;
  for (let k = 0; k < 30 * TJ && e.invasion; k++) sim.pas(e);
  ok((e.stats.detruits || 0) > 0 && e.cotes.paix === 60 - Math.min(30, e.stats.detruits), `sans soldat, ${e.stats.detruits} bâtiments détruits ; paix ${e.cotes.paix}`);
}
{
  // Caserne : une recrue tous les 8 jours ; un légionnaire prend une charge d'armes ; académie +1.
  const e = sim.nouvelle('vindobona', { libre: true, tout: true, fonds: 1e6 });
  habitants(e, 400, 6);
  const c = batimentService(e, 'caserne', 20), f = batimentService(e, 'fort_javelots', 30), fl = batimentService(e, 'fort_legionnaires', 40);
  for (let k = 0; k < 9 * TJ; k++) { c.eff = D.batiments.caserne.effectif; sim.pas(e); }
  ok(sim.effectifFort(e, f) + f.att === 1 && sim.effectifFort(e, fl) + fl.att === 0, '8 jours : une recrue pour le fort de javelots ; sans armes, aucun légionnaire');
  const e2 = sim.nouvelle('vindobona', { libre: true, tout: true, fonds: 1e6 });
  habitants(e2, 400, 6);
  const c2 = batimentService(e2, 'caserne', 20), fl2 = batimentService(e2, 'fort_legionnaires', 30), ac = batimentService(e2, 'academie_militaire', 40);
  c2.mat = 2 * Q;
  for (let k = 0; k < 30 * TJ && sim.effectifFort(e2, fl2) < 1; k++) { c2.eff = D.batiments.caserne.effectif; ac.eff = D.batiments.academie_militaire.effectif; sim.pas(e2); }
  const s = e2.unites.find((u) => u.f === fl2.id);
  ok(!!s && c2.mat === Q, 'un légionnaire recruté prend une charge d\'armes à la caserne');
  ok(!!s && s.entr === 1, 'passé par l\'académie militaire, il arrive au niveau 1 d\'entraînement');
}
{
  // Tour : tire à 6 cases au plus. Muraille : l'ennemi l'abat ou la contourne.
  const e = sim.nouvelle('vindobona', { libre: true, tout: true, fonds: 1e6 });
  const [x, y] = caseLibre(e, 10, -20);
  for (let k = 0; k < 6; k++) O.creerBatiment(e, 'muraille', x + k, y);
  ok(sim.peutPlacer(e, 'tour', x + 6, y) === null && sim.peutPlacer(e, 'tour', x + 10, y + 6) === 'muraille', 'une tour se pose collée à une muraille, pas ailleurs');
  const t = O.creerBatiment(e, 'tour', x + 2, y + 1); t.eff = D.batiments.tour.effectif;
  e.invasion = { id: 999, f: 'gaulois', n: 2, morts: 0, detruits: 0, paix: 0, entree: e.entree, debut: e.tick, fuite: 0, legions: 0, cible: 'proche', cibleEff: 'proche' };
  const pres = O.creerUnite(e, 1, 'legere', (y + 6) * e.N + x + 3, { inv: 999 }), loin = O.creerUnite(e, 1, 'legere', (y + 12) * e.N + x + 3, { inv: 999 });
  pres.p = loin.p = 1e9; // immobiles
  for (let k = 0; k < 41; k++) { pres.p = loin.p = 1e9; sim.pas(e); }
  ok(pres.pv < pres.pm && loin.pv === loin.pm, `la tour touche l'ennemi à 5 cases (${pres.pv}/${pres.pm}), pas celui à 11`);
}
{
  // Moral : la colère de Mars le met à 0 et la cohorte rentre ; son bienfait coupe la prochaine invasion de moitié.
  const { e, forts } = partieArmee(0);
  sim.appliquer(e, { type: 'cohorte', fort: forts[0].id, ordre: 'aller', x: 56, y: 20 });
  e.effets.mars = 6;
  for (let k = 0; k < 2 * TJ; k++) sim.pas(e);
  ok(forts[0].moral === 0 && forts[0].ordre.t === 'garde', 'colère de Mars : moral à 0, la cohorte rentre au fort');
  ok(!sim.appliquer(e, { type: 'cohorte', fort: forts[0].id, ordre: 'aller', x: 56, y: 20 }).ok, 'une cohorte au moral brisé refuse de partir');
  const { e: e2 } = partieArmee(0);
  e2.effets.marsBienfait = 1;
  O.lancerInvasion(e2, { faction: 'germains', effectif: 40, entree: [56, 2] }, false);
  ok(e2.unites.filter((u) => u.c === 1).length === 20 && !e2.effets.marsBienfait, 'bienfait de Mars : la prochaine invasion arrive avec moitié moins de guerriers');
  // Difficulté : ennemis × 0,7 en facile, × 1,3 en difficile.
  const { e: ef } = partieArmee(0, 'gaulois', { difficulte: 'facile' }), { e: ed } = partieArmee(0, 'gaulois', { difficulte: 'difficile' });
  O.lancerInvasion(ef, { faction: 'gaulois', effectif: 40, entree: [56, 2] }, false);
  O.lancerInvasion(ed, { faction: 'gaulois', effectif: 40, entree: [56, 2] }, false);
  ok(ef.unites.filter((u) => u.c === 1).length === 28 && ed.unites.filter((u) => u.c === 1).length === 52, 'difficulté : 40 ennemis deviennent 28 en facile, 52 en difficile');
}
{
  // Ordres : aller (formation), rentrer.
  const { e, forts } = partieArmee(0);
  const f = forts[1];
  ok(sim.appliquer(e, { type: 'cohorte', fort: f.id, ordre: 'formation', f: 'ligne' }).ok && f.ordre.f === 'ligne', 'formation en ligne');
  sim.appliquer(e, { type: 'cohorte', fort: f.id, ordre: 'aller', x: 56, y: 30 });
  for (let k = 0; k < 40 * TJ; k++) sim.pas(e);
  const l = e.unites.filter((u) => u.f === f.id), ys = new Set(l.map((u) => Math.floor(u.i / e.N)));
  ok(l.every((u) => Math.abs(u.i % e.N - 56) <= 5 && Math.abs(Math.floor(u.i / e.N) - 30) <= 3) && ys.size <= 3, `la cohorte rejoint la case visée, en ligne (${ys.size} rangs)`);
  sim.appliquer(e, { type: 'cohorte', fort: f.id, ordre: 'rentrer' });
  for (let k = 0; k < 40 * TJ; k++) sim.pas(e);
  const a = sim.ancreFort(e, f);
  ok(e.unites.filter((u) => u.f === f.id).every((u) => Math.abs(u.i % e.N - a % e.N) <= 4 && Math.abs(Math.floor(u.i / e.N) - Math.floor(a / e.N)) <= 4), 'rentrée : la cohorte retrouve sa place d\'armes');
}
{
  // Demande de troupes (13.7) : envoyée, la cohorte quitte la carte puis revient ; refusée, −8.
  const { e, forts } = partieArmee(0);
  e.empereur = true; e.cotes.faveur = 50;
  const dm = O.creerDemandeTroupes(e, { force: 12, delai: 12, faveur: 8, pos: [0, 0] }, 0);
  ok(sim.appliquer(e, { type: 'envoyer', id: dm.id, fort: forts[0].id }).ok && e.unites.filter((u) => u.f === forts[0].id && u.etat === 'absent').length === 16, 'la cohorte part : 16 soldats quittent la carte');
  e.tick = dm.retour;
  O.moisEmpire(e, 13);
  ok(dm.etat === 'faite' && e.cotes.faveur === 58 && e.unites.filter((u) => u.f === forts[0].id && u.etat === 'champ').length === 16 - Math.round(16 * D.regles.militaire.troupes.pertesVictoire / 100), `16 soldats contre 12 : victoire, faveur +8, ${Math.round(16 * D.regles.militaire.troupes.pertesVictoire / 100)} morts`);
  const dm2 = O.creerDemandeTroupes(e, { force: 12, delai: 3, faveur: 8, pos: [0, 0] }, 20);
  for (let m = 21; m <= 23; m++) O.moisEmpire(e, m);
  ok(dm2.etat === 'ignoree' && e.cotes.faveur === 58 + D.regles.empereur.ignoree, 'aucune cohorte envoyée à temps : faveur −8');
}
{
  // Légions repoussées : la faveur remonte à 20 et le compte repart de zéro.
  const { e } = partieArmee(0, 'gaulois', { forts: ['fort_legionnaires', 'fort_javelots', 'fort_legionnaires', 'fort_cavaliers'] });
  e.empereur = true; e.cotes.faveur = 5; e.faveurBasse = 12; e.legions = { mois: 0, lance: 1 };
  O.lancerInvasion(e, { faction: 'rome', effectif: 12, entree: [56, 2] }, true);
  for (let k = 0; k < 20 * TM && e.invasion && !e.defaite; k++) sim.pas(e);
  ok(!e.defaite && e.cotes.faveur === D.regles.militaire.legions.faveurApres && e.faveurBasse === 0 && !e.legions, 'légions repoussées : faveur à 20, destitution repoussée');
}

section('Lot 4 : sauvegarde en pleine invasion (version 4)');
{
  const { e } = partieArmee(40, 'numides');
  for (let k = 0; k < 437; k++) sim.pas(e);
  const e2 = sim.importer(sim.exporter(e));
  ok(sim.empreinte(e2) === sim.empreinte(e), 'état identique après sauvegarde puis chargement, en plein combat');
  for (let k = 0; k < 1500; k++) { sim.pas(e); sim.pas(e2); }
  ok(sim.empreinte(e2) === sim.empreinte(e), 'même état 1 500 ticks après le chargement');
  const o = JSON.parse(sim.exporter(partieMission('narbo')));
  o.v = 3; ['ages', 'agesReste', 'paixEmeutes', 'unites', 'invasion', 'champ', 'legions', 'invasions'].forEach((k) => delete o[k]);
  let e3 = null;
  try { e3 = sim.importer(JSON.stringify(o)); } catch (err) { ok(false, `sauvegarde du lot 3 refusée : ${err.message}`); }
  if (e3) { let er = null; try { for (let k = 0; k < TM; k++) sim.pas(e3); } catch (err) { er = err; } ok(e3.v === sim.VERSION_ETAT && !er && sim.invariants(e3).length === 0, `sauvegarde du lot 3 complétée, la partie continue${er ? ' : ' + er.message : ''}`); }
}

section('Lot 4 : missions militaires jouées par le gouverneur automatique (difficulté normale)');
{
  // Une partie du gouverneur, ses tours décalés de « off » ticks dans le mois.
  const jouerMilitaire = (id, rang, moisMax, off) => {
    const plan = ex.planifierMission(sim, id), e = sim.nouvelle(id, { rang }), etat = {}, a = off % TM, b = (off + TM / 2) % TM;
    const t0 = Date.now();
    let invariant = null;
    for (let m = 0; m < moisMax && !e.victoire && !e.defaite; m++) {
      for (let k = 0; k < TM; k++) { sim.pas(e); if (k === a || k === b) ex.jouerMission(sim, e, plan, etat); if (k % TJ === TJ / 2) ex.piloterArmee(sim, e); }
      if (!invariant) { const pb = sim.invariants(e); if (pb.length) invariant = pb[0]; }
    }
    ok(!invariant, `${id} (décalage ${off}) : invariants tenus${invariant ? ' : ' + invariant : ''}`);
    const bilan = e.victoire ? `gagnée au mois ${e.victoire.mois}, ${e.victoire.etoiles} étoile(s)` : e.defaite ? `perdue (${e.defaite.cause})` : 'pas encore gagnée';
    console.log(`  ${id} (décalage ${off}) ${bilan} : ${e.pop} habitants, culture ${e.cotes.culture}, prospérité ${e.cotes.prosperite}, paix ${e.cotes.paix}, faveur ${e.cotes.faveur}, ${e.stats.invasions || 0} invasions repoussées ; ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    return e;
  };
  // Aquilée : trois départs ; le gouverneur doit en gagner deux au moins (cahier, section 23.9).
  const gagnees = [0, 97, 333].map((off) => jouerMilitaire('aquilee', 3, 300, off)).filter((e) => e.victoire).length;
  ok(gagnees >= 2, `aquilee : ${gagnees} victoire(s) sur 3 départs du gouverneur automatique`);
  jouerMilitaire('vindobona', 4, 240, 0);
  console.log('  (Vindobona : mesure seulement, voir le cahier, section 23.9)');
}

section('Lot 5 : campagne complète, les 10 cartes des échelons 6 à 10');
{
  ok(D.rangs.length === 10, '10 rangs, de citoyen à princeps');
  for (let n = 1; n <= 10; n++) {
    const pr = D.missions.filter((m) => m.echelon === n).map((m) => m.province).sort().join(' et ');
    ok(pr === (n <= 3 ? 'paisible' : 'militaire et paisible'), `échelon ${n} : ${pr}`);
  }
  // Seuils et dates cibles qui montent d'un échelon à l'autre, dans chaque province.
  for (const br of ['paisible', 'militaire']) {
    const l = D.missions.filter((m) => m.province === br || m.echelon <= 3).sort((a, b) => a.echelon - b.echelon);
    ok(l.every((m, k) => !k || (m.objectifs.population >= l[k - 1].objectifs.population && m.dateCibleMois > l[k - 1].dateCibleMois)), `province ${br} : population et date cible croissantes`);
  }
  const NOUVELLES = ['ephese', 'burdigala', 'alexandrie', 'leptis', 'corinthe', 'colonia', 'antioche', 'palmyre', 'athenes', 'eburacum'];
  // Ce que la carte permet de produire, et qui le paie (cités visibles dès le départ).
  const SOURCE = { olives: 'prairie', raisin: 'prairie', huile: 'prairie', vin: 'prairie', ble: 'prairie', legumes: 'prairie', fruits: 'prairie', porc: 'prairie', argile: 'eau', poterie: 'eau', bois: 'arbres', mobilier: 'arbres', fer: 'rochers', armes: 'rochers', marbre: 'rochers', poisson: 'bancs' };
  for (const id of NOUVELLES) {
    const m = D.missions.find((x) => x.id === id), e = sim.nouvelle(id, {}), N = e.N;
    const cnt = { prairie: 0, eau: 0, arbres: 0, rochers: 0, bancs: (e.bancs || []).length };
    for (let i = 0; i < N * N; i++) { const t = e.terrain[i]; if (t === sim.T.PRAIRIE) cnt.prairie++; else if (t === sim.T.EAU) cnt.eau++; else if (t === sim.T.ARBRES) cnt.arbres++; else if (t === sim.T.ROCHERS) cnt.rochers++; }
    const vendables = new Set();
    m.empire.cites.filter((c) => !c.cachee).forEach((c) => Object.keys(c.achete).forEach((g) => { if (cnt[SOURCE[g]] > (SOURCE[g] === 'bancs' ? 0 : 20)) vendables.add(g); }));
    ok(vendables.size >= 4, `${id} : ${vendables.size} biens à vendre aux cités voisines (${[...vendables].join(', ')})`);
    ok(m.empire.cites.every((c) => c.route === 'terre' || e.mer >= 0), `${id} : une voie maritime pour chaque cité de la mer`);
    // Chaque armée peut atteindre la ville : chemin à pied (ni eau, ni rocher) jusqu'à la voie de Rome.
    const R = ex.ligneRome(sim, e), but = R * N + (N >> 1);
    const atteint = (x0, y0) => {
      const vu = new Uint8Array(N * N), file = [y0 * N + x0]; vu[file[0]] = 1;
      for (let t = 0; t < file.length; t++) {
        const i = file[t]; if (i === but) return true;
        const x = i % N;
        for (const v of [i - N, x < N - 1 ? i + 1 : -1, i + N, x > 0 ? i - 1 : -1]) if (v >= 0 && v < N * N && !vu[v] && e.terrain[v] !== sim.T.EAU && e.terrain[v] !== sim.T.ROCHERS) { vu[v] = 1; file.push(v); }
      }
      return false;
    };
    const inv = m.evenements.filter((ev) => ev.type === 'invasion');
    ok(inv.every((ev) => e.terrain[ev.entree[1] * N + ev.entree[0]] !== sim.T.EAU && atteint(ev.entree[0], ev.entree[1])), `${id} : ${inv.length} invasion(s), chaque entrée relie la ville`);
    ok(m.evenements.filter((ev) => ev.type === 'seisme').every((ev) => ev.zone[0] >= 0 && ev.zone[1] >= 0 && ev.zone[2] < N && ev.zone[3] < N && ev.zone[0] <= ev.zone[2] && ev.zone[1] <= ev.zone[3]), `${id} : zones des séismes dans la carte`);
  }
  // Deux années (militaires : jusqu'à la première invasion) jouées par le gouverneur automatique.
  const t0 = Date.now();
  for (const id of NOUVELLES) {
    const m = D.missions.find((x) => x.id === id), plan = ex.planifierMission(sim, id), e = sim.nouvelle(id, { rang: m.echelon - 1 }), etat = {};
    const mois = m.province === 'militaire' ? 26 : 24;
    let erreur = null, invariant = null;
    try {
      for (let mo = 0; mo < mois; mo++) {
        for (let k = 0; k < TM; k++) { sim.pas(e); if (k === 0 || k === TM / 2) ex.jouerMission(sim, e, plan, etat); if (k % TJ === TJ / 2) ex.piloterArmee(sim, e); }
        if (!invariant) { const pb = sim.invariants(e); if (pb.length) invariant = pb[0]; }
      }
    } catch (err) { erreur = err; }
    ok(!erreur && !invariant, `${id} : ${mois} mois du gouverneur sans erreur, invariants tenus${erreur ? ' : ' + erreur.message : invariant ? ' : ' + invariant : ''} (${e.pop} habitants)`);
    if (m.province === 'militaire') ok((e.stats.invasionsSubies || 0) >= 1, `${id} : la première invasion arrive`);
  }
  console.log(`  10 cartes jouées en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  // Corinthe : le séisme rase les bâtiments de sa zone.
  {
    const id = 'corinthe', plan = ex.planifierMission(sim, id), e = sim.nouvelle(id, { rang: 7 }), etat = {};
    for (let mo = 0; mo < 14; mo++) for (let k = 0; k < TM; k++) { sim.pas(e); if (k === 0 || k === TM / 2) ex.jouerMission(sim, e, plan, etat); }
    const k = D.missions.find((x) => x.id === id).evenements.findIndex((ev) => ev.type === 'seisme'), z = D.missions.find((x) => x.id === id).evenements[k].zone;
    const dansZone = () => e.batiments.filter((b) => b.x >= z[0] && b.x <= z[2] && b.y >= z[1] && b.y <= z[3] && !['ruines', 'gravats'].includes(b.type)).length;
    const avant = dansZone();
    e.script.find((s) => s.k === k).m = Math.floor(e.tick / TM) + 1;
    for (let j = 0; j < 2 * TM; j++) sim.pas(e);
    ok(e.journal.some((j) => j.cle === 'msg.evt.seisme') && avant > 0 && dansZone() < avant, `corinthe : le séisme rase sa zone (${avant} bâtiments avant, ${dansZone()} après)`);
    ok(sim.invariants(e).length === 0, 'corinthe : invariants tenus après le séisme');
  }
}

// --------------------------------------------------------------------------
section('Tutoriels des bâtiments et carte de la campagne (cahier 23.16)');
{
  // L'interface est dans le jeu assemblé (ou dans les sources) : on y lit les genres traités.
  const ui = depuisSources ? await readFile(path.join(SOURCES, 'interface.js'), 'utf8') : await readFile(JEU, 'utf8');
  const corps = ui.slice(ui.indexOf('function etapesBatiment('), ui.indexOf('function remplirFicheBatiment('));
  const traites = new Set([...corps.matchAll(/case '([a-z_]+)'/g)].map((m) => m[1]));
  const sansFiche = new Set(['maison', 'outil', 'route', 'ruines', 'incendie']);
  const genres = new Set(Object.values(D.batiments).map((b) => b.genre).filter((g) => !sansFiche.has(g)));
  const manquants = [...genres].filter((g) => !traites.has(g));
  ok(!manquants.length, `tutoriels : chaque genre de bâtiment a ses étapes « Ce qu'il faut faire » (${manquants.join(', ') || 'tous'})`);
  const cles = new Set([...corps.matchAll(/t\('(tutoB\.[A-Za-z.]+)'/g)].map((m) => m[1]));
  const fr = JSON.parse(await readFile(path.join(SOURCES, 'textes', 'fr.json'), 'utf8')).textes;
  const absentes = [...cles].filter((k) => !(k in fr) && !k.endsWith('.'));
  ok(!absentes.length, `tutoriels : ${cles.size} textes d'étapes présents (${absentes.join(', ') || 'aucun manquant'})`);
  // Chaque mission de la campagne a sa place sur la carte de l'Europe.
  const places = ui.slice(ui.indexOf('var POS_MISSIONS'), ui.indexOf('var ROME_CAMPAGNE'));
  const sansPlace = D.missions.filter((m) => !new RegExp(`\\b${m.id}: \\[`).test(places)).map((m) => m.id);
  ok(!sansPlace.length, `carte de la campagne : les ${D.missions.length} missions placées (${sansPlace.join(', ') || 'toutes'})`);
}

// --------------------------------------------------------------------------
section('Lot 6 : cités voisines, comptoir de province (sections 16.7 et 23.15)');
{
  // Deux villes de la Campanie commercent par le vrai comptoir (multijoueur/src/province.js),
  // monté en mémoire : poterie de Capua vers Puteoli, payée au vendeur.
  const { routeProvince, Province } = await import(pathToFileURL(path.join(RACINE, 'multijoueur', 'src', 'province.js')).href);
  const objets = new Map();
  const envW = { PROVINCE: { idFromName: (n) => n, get: (n) => ({ fetch: async (req) => {
    if (!objets.has(n)) { const donnees = new Map(); objets.set(n, new Province({ storage: { get: async (k) => structuredClone(donnees.get(k)), put: async (k, v) => { donnees.set(k, structuredClone(v)); }, deleteAll: async () => donnees.clear(), setAlarm: async () => {} } }, {})); }
    return objets.get(n).fetch(req);
  } }) } };
  const appel = async (corps) => {
    const r = await routeProvince(new Request('https://multi/province', { method: 'POST', headers: { Origin: 'https://freemicrogames.com' }, body: JSON.stringify(corps) }), envW, '/province', ['https://freemicrogames.com']);
    return r.json();
  };
  const { sim: S, ex: X, D: DD } = nouveauMonde();
  ok(DD.voisinages.length === 2 && DD.missionsVoisinage.length === 8, 'deux provinces de 4 cités');
  ok(DD.missionsVoisinage.every((m) => { const e = S.nouvelle(m.id, {}); return e.N === m.carte.taille && e.province === null; }), 'chaque cité se crée (sans province : comme une carte seule)');
  const c0 = await appel({ a: 'creer', jeu: 'cosmoria', carte: 'campanie', siege: 0 });
  const c1 = await appel({ a: 'rejoindre', code: c0.code, siege: 1 });
  const villes = [
    S.nouvelle('capua', { libre: true, tout: true, risques: false, province: { code: c0.code, siege: 0, jeton: c0.jeton } }),
    S.nouvelle('puteoli', { libre: true, tout: true, risques: false, province: { code: c0.code, siege: 1, jeton: c1.jeton } }),
  ];
  const Q = DD.regles.maison.uniteParCharge;
  for (const e of villes) {
    X.construire(S, e, { niveau: 2 });
    const centre = e.batiments.find((b) => b.type === 'marche') || e.batiments[0];
    X.poserPres(S, e, 'entrepot', centre.x, centre.y, 30);
    for (let k = 0; k < 2 * DD.ticksParMois; k++) S.pas(e);
  }
  const [A, B] = villes;
  const entA = A.batiments.find((b) => b.type === 'entrepot'), entB = B.batiments.find((b) => b.type === 'entrepot');
  ok(entA && entB, 'un entrepôt dans chaque ville');
  entA.stocks.poterie = 20 * Q;
  S.appliquer(A, { type: 'commerce', bien: 'poterie', statut: 'exporter', cible: 2 });
  S.appliquer(B, { type: 'commerce', bien: 'poterie', statut: 'importer', cible: 24 });
  ok(S.appliquer(A, { type: 'ouvrirRoute', cite: 'puteoli' }).ok && S.appliquer(B, { type: 'ouvrirRoute', cite: 'capua' }).ok, 'routes ouvertes vers le voisin');
  const unites = (e) => e.batiments.reduce((n, b) => n + ((b.stocks && b.stocks.poterie) || 0), 0) + (e.province.reserve.poterie || 0)
    + e.marcheurs.filter((w) => !w.fin && w.liv).reduce((n, w) => n + w.liv.filter((x) => x[0] === 'poterie').reduce((a, x) => a + x[1] * Q, 0), 0);
  const poterie0 = unites(A) + unites(B);
  const synchro = async (e) => {
    const env = S.provinceEnvoi(e);
    const r = await appel({ a: 'sync', code: env.code, siege: env.siege, jeton: env.jeton, ops: env.ops, accuse: env.accuse, infos: env.infos });
    return S.appliquer(e, { type: 'province-sync', recu: r.recu, sortie: r.sortie, vue: r.vue }).ok;
  };
  ok(await synchro(A) && await synchro(B) && A.province.enLigne && B.province.voisins[0].pris === true, 'vue des voisins reçue, routes ouvertes en ligne');
  // Hors connexion : routes vers les voisins fermées.
  S.appliquer(B, { type: 'province-reseau', enLigne: false });
  const avantHors = B.province.sortie.length;
  for (let k = 0; k < DD.ticksParMois * 3; k++) S.pas(B);
  ok(B.province.sortie.length === avantHors, 'hors connexion : aucune demande envoyée aux voisins');
  await synchro(B);
  // 24 mois, une synchronisation tous les quarts de mois pour chaque ville ; une sauvegarde relue à mi-chemin.
  let relu = false;
  for (let mois = 0; mois < 24; mois++) {
    for (let q = 0; q < 4; q++) {
      for (const e of villes) for (let k = 0; k < DD.ticksParMois / 4; k++) S.pas(e);
      await synchro(A); await synchro(B);
    }
    if (mois === 12 && !relu) { villes[1] = S.importer(S.exporter(B)); relu = true; }
  }
  const B2 = villes[1];
  for (let k = 0; k < 3; k++) { for (const e of [A, B2]) for (let j = 0; j < DD.ticksParMois; j++) S.pas(e); await synchro(A); await synchro(B2); }
  const p = await objets.get(`province:${c0.code}`).state.storage.get('p');
  const etal = (p.sieges[0].etal.poterie || []).reduce((n, l) => n + l[0], 0) * Q;
  console.log(`  Capua : ${A.stats.depotsVoisins || 0} charges posées à l'étal, ${A.province.ventes} deniers reçus ; Puteoli : ${B2.province.achats} deniers payés, ${unites(B2) / Q} charges de poterie`);
  ok((A.stats.depotsVoisins || 0) > 0 && B2.province.achats > 0, 'poterie posée à l\'étal par Capua et achetée par Puteoli');
  ok(A.province.ventes === B2.province.achats && A.province.ventes > 0, `vendeur payé exactement ce que l'acheteur a payé (${A.province.ventes} = ${B2.province.achats})`);
  ok(unites(A) + unites(B2) + etal === poterie0, `poterie conservée (${poterie0} unités = ${unites(A)} + ${unites(B2)} + ${etal} à l'étal)`);
  ok(Object.values(B2.routes.capua.n).every((x) => x <= DD.regles.commerce.voisinPlafond), 'plafond de 40 charges par bien et par voisin et par année');
  ok(S.invariants(A).length === 0 && S.invariants(B2).length === 0, 'invariants tenus');
  ok(A.province.sortie.length === 0 && B2.province.sortie.length === 0, 'toutes les opérations accusées par le comptoir');
  // Objectif commun : la ville seule ne gagne pas ; la province gagnée fait gagner chaque ville.
  const V = S.nouvelle('nola', { province: { code: c0.code, siege: 2, jeton: '0'.repeat(32) } });
  S.appliquer(V, { type: 'province-sync', recu: 0, sortie: [], vue: { sieges: [], evenements: [], gagnee: 123 } });
  for (let k = 0; k < DD.temps.ticksParJour; k++) S.pas(V);
  ok(V.victoire && V.victoire.province === true, 'province gagnée : victoire de la ville (objectif commun)');
}

section('Musique : quatre morceaux écrits (sections 18.5 et 23.13)');
{
  // Les partitions sont lues sans contexte audio : mesures complètes, notes dans le mode, voix valides.
  const ctxA = vm.createContext({ console });
  vm.runInContext(code.audio, ctxA, { filename: 'cm-audio' });
  const P = ctxA.CM_AUDIO.partitions();
  ok(['petite', 'grande', 'menace', 'combat'].every((k) => P[k]) && Object.keys(P).length === 4, 'quatre morceaux : petite ville, grande ville, menace, combat');
  for (const [nom, M] of Object.entries(P)) {
    const mesures = M.mesures;
    ok(mesures.length >= 8 && mesures.length % 4 === 0 && mesures.every((m) => m.chant.croches === 8), `${nom} : ${mesures.length} mesures de 8 croches au chant`);
    ok(mesures.every((m) => !m.cuivre || m.cuivre.croches === 0 || m.cuivre.croches === 8), `${nom} : cuivres écrits en mesures complètes`);
    const hors = [];
    mesures.forEach((m, i) => [...m.chant.notes, ...(m.cuivre ? m.cuivre.notes : [])].forEach((n) => {
      if (!M.mode.includes(((n.m - M.racine) % 12 + 12) % 12)) hors.push(`mesure ${i + 1} : ${n.m}`);
    }));
    ok(!hors.length, `${nom} : toutes les notes dans le mode${hors.length ? ' (' + hors.join(', ') + ')' : ''}`);
    const chant = mesures.flatMap((m) => m.chant.notes.map((n) => n.m));
    ok(Math.min(...chant) >= 52 && Math.max(...chant) <= 86, `${nom} : chant entre mi 3 et ré 6`);
    ok(mesures.every((m) => m.accord && m.accord.tons.length === 8), `${nom} : un accord par mesure`);
    ok(M.passages.length >= 2 && M.passages.every((p) => ['aulos', 'lyre', 'orgue'].includes(p.chant)
      && ['tambour', 'tambourFin', 'grosse', 'metal'].every((k) => !p[k] || /^[DTtGSC.]{16}$/.test(p[k]))
      && (!p.arpege || (p.arpege.length === 8 && p.arpege.every((x) => x === null || x === 's' || (x >= 0 && x <= 7))))), `${nom} : ${M.passages.length} passages aux voix valides`);
  }
}

// --------------------------------------------------------------------------
if (args.includes('--endurance')) {
  section('Endurance : 50 années sans affichage');
  const e = villeTest(3);
  const ans = 50, t0 = Date.now();
  let erreur = null;
  try { avancerVille(e, ans * D.temps.moisParAn * TM); } catch (err) { erreur = err; }
  ok(!erreur, `50 années sans exception${erreur ? ` : ${erreur.message}` : ''}`);
  ok(sim.invariants(e).length === 0, 'invariants tenus après 50 années');
  console.log(`  ${ans} ans en ${((Date.now() - t0) / 1000).toFixed(1)} s, ${e.pop} habitants, ${e.marcheurs.length} marcheurs`);
} else {
  section('Endurance courte : 3 années');
  const e = villeTest(3);
  let erreur = null;
  try { avancerVille(e, 3 * D.temps.moisParAn * TM); } catch (err) { erreur = err; }
  ok(!erreur, `3 années sans exception${erreur ? ` : ${erreur.message}` : ''}`);
  ok(sim.invariants(e).length === 0, 'invariants tenus');
}

if (args.includes('--perf')) {
  section('Performances : carte 160 × 160 remplie');
  const monde = nouveauMonde((d) => {
    const p = d.missions.find((m) => m.id === 'pompei');
    const g = JSON.parse(JSON.stringify(p));
    g.carte.taille = 160; g.carte.route = 92; g.carte.riviere.position = 36;
    g.carte.prairies = [[48, 120, 10], [112, 124, 10], [80, 60, 8], [20, 100, 8], [140, 100, 8]];
    g.carte.rochers = [[140, 140, 8]];
    Object.assign(p, g);
  });
  const e = monde.sim.nouvelle('pompei', { libre: true, attractivite: false });
  monde.ex.construire(monde.sim, e, { niveau: 3, colonnes: 26, rangees: 6, fermes: 14 });
  // Ville mûre : maisons pleines au niveau 6, réserves de nourriture, services récents.
  e.batiments.forEach((h) => { if (h.type === 'logement') { h.niv = 6; h.hab = 14; h.viv = { ble: 40 }; h.svc = { impot: 40, dieu_ceres: 40, theatre: 40 }; } });
  monde.sim.majPopulation(e);
  monde.sim.avancer = null;
  for (let k = 0; k < 2000; k++) monde.sim.pas(e);
  const n = 2000, t0 = process.hrtime.bigint();
  let pire = 0;
  for (let k = 0; k < n; k++) {
    const a = process.hrtime.bigint();
    monde.sim.pas(e);
    const d = Number(process.hrtime.bigint() - a) / 1e6;
    if (d > pire) pire = d;
  }
  const moy = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  console.log(`  ${e.pop} habitants, ${e.batiments.length} bâtiments, ${e.marcheurs.length} marcheurs : ${moy.toFixed(3)} ms par tick en moyenne, ${pire.toFixed(2)} ms au pire`);
  ok(moy < 4, 'durée moyenne d\'un tick sous 4 ms (PC)');
  // Lot 4 : la même carte avec 10 000 habitants (une tente de 3 habitants par logement).
  const e10 = monde.sim.nouvelle('pompei', { libre: true, attractivite: false });
  monde.ex.construire(monde.sim, e10, { niveau: 3, colonnes: 26, rangees: 6, fermes: 14 });
  const lg = e10.batiments.filter((h) => h.type === 'logement'), par = Math.ceil(10000 / lg.length);
  lg.forEach((h) => { h.niv = 1; h.hab = Math.min(4, par); h.viv = { ble: 400 }; h.svc = { impot: 40, dieu_ceres: 40, theatre: 40 }; });
  monde.sim.majPopulation(e10);
  for (let k = 0; k < 2000; k++) monde.sim.pas(e10);
  let pire10 = 0; const t10 = process.hrtime.bigint();
  for (let k = 0; k < n; k++) { const a = process.hrtime.bigint(); monde.sim.pas(e10); const d = Number(process.hrtime.bigint() - a) / 1e6; if (d > pire10) pire10 = d; }
  const moy10 = Number(process.hrtime.bigint() - t10) / 1e6 / n;
  console.log(`  ${e10.pop} habitants, ${e10.batiments.length} bâtiments, ${e10.marcheurs.length} marcheurs : ${moy10.toFixed(3)} ms par tick en moyenne, ${pire10.toFixed(2)} ms au pire`);
  ok(e10.pop >= 10000 && moy10 < 4, 'lot 4 : 10 000 habitants, tick moyen sous 4 ms (PC)');
}

console.log(`\nCosmoria : ${reussites} contrôles réussis, ${echecs} échec(s)${depuisSources ? ' (sources)' : ''}.`);
if (echecs) { console.log('Cosmoria : il reste des problèmes.'); process.exit(1); }
console.log('Cosmoria : tout est bon.');
