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
  const e = sim.nouvelle(mission, { libre: true });
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
ok(D.missions.filter((m) => m.dispo).length === 2, 'lot 1 : missions 1 et 2 jouables');

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
  proche(charges, 8, 1, 'ferme à blé : charges par an');
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
    const t = sim.nouvelle('pompei', { libre: true, graine: k });
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
  // Une tente entourée d'autres logements reçoit quand même ses immigrants : on entre
  // dans une maison depuis une route à 2 cases ou moins (demande du propriétaire du 24 novembre 2026).
  const e = sim.nouvelle('ostie', { libre: true });
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
  const e = sim.nouvelle('pompei', { libre: true, graine });
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
  const e = monde.sim.nouvelle('pompei', { libre: true });
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
