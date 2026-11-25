#!/usr/bin/env node
// ==========================================================================
// tester-marmoria.mjs — tests de la simulation de « Marmoria » (city-builder,
// docs/cadrage-marmoria.md, sections 19.5 et 21), sans navigateur ni réseau.
//
//   node scripts/tester-marmoria.mjs               tests rapides (≈ 1 min)
//   node scripts/tester-marmoria.mjs --sources     lit sources/marmoria/ au lieu du jeu assemblé
//   node scripts/tester-marmoria.mjs --endurance   ajoute 50 années de jeu sans affichage
//   node scripts/tester-marmoria.mjs --perf        ajoute la mesure de la carte 160 × 160 remplie
//
// La simulation (bloc mm-sim), ses données (bloc mm-donnees) et les villes
// d'exemple (bloc mm-exemples) sont lues dans games/marmoria/index.html puis
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
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const JEU = path.join(RACINE, 'games', 'marmoria', 'index.html');
const SOURCES = path.join(RACINE, 'sources', 'marmoria');
const depuisSources = args.includes('--sources') || !existsSync(JEU);

async function chargerCode() {
  if (depuisSources) {
    return {
      donnees: await readFile(path.join(SOURCES, 'donnees.json'), 'utf8'),
      sim: await readFile(path.join(SOURCES, 'sim.js'), 'utf8'),
      exemples: await readFile(path.join(SOURCES, 'exemples.js'), 'utf8'),
    };
  }
  const html = await readFile(JEU, 'utf8');
  const bloc = (id) => {
    const m = html.match(new RegExp(`<script\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)</script>`, 'i'));
    if (!m) throw new Error(`bloc ${id} absent de games/marmoria/index.html`);
    return m[1];
  };
  return { donnees: bloc('mm-donnees'), sim: bloc('mm-sim'), exemples: bloc('mm-exemples') };
}

const code = await chargerCode();
function nouveauMonde(transformer) {
  const ctx = vm.createContext({ btoa, atob, console });
  vm.runInContext(code.sim, ctx, { filename: 'mm-sim' });
  vm.runInContext(code.exemples, ctx, { filename: 'mm-exemples' });
  const donnees = JSON.parse(code.donnees);
  if (transformer) transformer(donnees);
  ctx.MM_SIM.charger(donnees);
  return { sim: ctx.MM_SIM, ex: ctx.MM_EXEMPLES, D: donnees };
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
ok(D.missions.filter((m) => m.dispo).map((m) => m.id).join(',') === 'ostie,pompei,ravenne,narbo,massalia', 'lots 1 à 3 : Ostie, Pompéi, Ravenne, Narbo et Massalia jouables');

// --------------------------------------------------------------------------
section('Formules (une au moins par règle chiffrée du lot 1)');
{
  // Temps : 1 jour = 50 ticks, 1 mois = 16 jours, 1 mois = 40 s à 20 ticks/s.
  ok(TJ === 50 && TM === 800 && TM / D.temps.ticksParSeconde === 40, 'temps : 50 ticks par jour, mois de 40 s');

  // Impôt : habitants × coefficient × taux / 20, par douzièmes ; salaires : emplois × salaire / 120.
  const e = etatVide();
  const [x, y] = caseLibre(e);
  const h = maison(e, x, y, 7, 100); // casa : coefficient 3
  h.svc.impot = 10;
  e.impot = 7; e.emplois = 0; e.reliquat = 0;
  const t0 = e.tresor;
  O.finances(e);
  proche(e.tresor - t0, Math.floor(100 * 3 * 7 / 20 / 12), 0, 'impôt mensuel d\'une casa de 100 habitants à 7 %');
  h.svc.impot = 0; e.emplois = 100; e.salaire = 30; e.reliquat = 0;
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
section('Ville d\'exemple, invariants à chaque tick');
// Ville d'exemple bâtie par le joueur raisonnable (MM_EXEMPLES.jouer), tous les demi-mois.
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
  const vus = new Set();
  for (let k = 0; k < TM; k++) { sim.pas(e); e.marcheurs.forEach((w) => vus.add(w.type)); }
  ok(vus.has('vendeuse') && vus.has('prefet') && vus.has('ingenieur') && vus.has('percepteur'), `vendeuses, préfets, ingénieurs et percepteurs circulent (${[...vus].sort().join(', ')})`);
  ok(e.batiments.some((b) => b.type === 'grenier' && sim.totalStock(b) > 0) || e.batiments.some((b) => b.type === 'marche' && sim.totalStock(b) > 0), 'la nourriture circule jusqu\'aux greniers et marchés');
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
}

console.log(`\nMarmoria : ${reussites} contrôles réussis, ${echecs} échec(s)${depuisSources ? ' (sources)' : ''}.`);
if (echecs) { console.log('Marmoria : il reste des problèmes.'); process.exit(1); }
console.log('Marmoria : tout est bon.');
