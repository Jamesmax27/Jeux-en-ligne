#!/usr/bin/env node
// ==========================================================================
// tester-sauvegarde.mjs — vérifie la sauvegarde de la progression des jeux
// (public/save.js), dans le lanceur du site, comme en ligne (cadre isolé).
//
//   node scripts/tester-sauvegarde.mjs                 tous les jeux
//   node scripts/tester-sauvegarde.mjs mon-jeu autre   seulement ceux-là
//   … --captures   enregistre des captures dans captures/sauvegarde/<id>/
//
// Pour chaque jeu, sur téléphone (390 × 844, toucher) :
//   1. Partie neuve : JEL_SAVE présent, aucune fenêtre de reprise ; on lance la
//      partie puis on simule la fermeture de la page (pagehide) : une
//      sauvegarde lisible doit être écrite par le lanceur sous « save_<id> ».
//   2. Reprise : sauvegarde « niveau 3 » posée, page rechargée : la fenêtre
//      « Continuer / Nouvelle partie / Effacer la sauvegarde » apparaît (au
//      lancement ou au bouton Jouer) et indique le niveau 3 ; « Continuer »,
//      puis fermeture simulée : la sauvegarde doit toujours indiquer le
//      niveau 3 (sinon, la reprise ne remet pas au bon niveau).
//   3. Effacement : « Effacer la sauvegarde » (deux touchers) retire la clé.
//   4. Nouvelle partie : « Nouvelle partie » ne provoque pas d'erreur.
// Aucune erreur JavaScript n'est permise pendant ces essais.
//
// Pas de serveur : les pages du site (public/) et le jeu (games/<id>/) sont
// servis par Playwright à l'adresse http://jel.test/, avec un catalogue réduit
// au jeu testé. Plusieurs contrôles peuvent donc tourner en même temps, sans
// construire le site.
// Nécessite Playwright (npm install --no-save playwright) et Chromium
// (npx playwright install chromium, ou CHROMIUM_PATH = chemin de Chrome/Edge).
// Code de sortie : 0 = tout est bon, 1 = au moins un problème.
// ==========================================================================

import { readdir, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(RACINE, 'public');
const DOSSIER_JEUX = path.join(RACINE, 'games');
const BASE = 'http://jel.test';
const NIVEAU_TEST = 3;
const SCORE_TEST = 42;
const BOUTON_JOUER = /jouer|commencer|c.est parti|démarrer|^go|partir|play|start/i;

const args = process.argv.slice(2);
const avecCaptures = args.includes('--captures');
let ids = args.filter((a) => !a.startsWith('--'));
if (!ids.length) {
  ids = (await readdir(DOSSIER_JEUX, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => e.name).sort();
}

let playwright;
try { playwright = await import('playwright'); }
catch {
  console.error('Playwright manque : npm install --no-save playwright');
  process.exit(1);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };

// Faux site : public/ + le jeu testé + un catalogue réduit à ce jeu.
async function brancherSite(contexte, id) {
  const fiche = JSON.parse(await readFile(path.join(DOSSIER_JEUX, id, 'game.json'), 'utf8'));
  const catalogue = { games: [{ ...fiche, play: `games/${id}/?v=${fiche.version}`, cover: '' }] };
  await contexte.route(`${BASE}/**`, async (route) => {
    const url = new URL(route.request().url());
    let p = decodeURIComponent(url.pathname);
    if (p === '/catalog.json') return route.fulfill({ status: 200, contentType: TYPES['.json'], body: JSON.stringify(catalogue) });
    if (p.startsWith('/api/')) return route.fulfill({ status: 503, body: '' });
    let fichier;
    if (p.startsWith(`/games/${id}/`)) fichier = path.join(DOSSIER_JEUX, id, p.slice(`/games/${id}/`.length) || 'index.html');
    else {
      if (p === '/play') p = '/play.html';
      fichier = path.join(PUBLIC, p.endsWith('/') ? p + 'index.html' : p);
    }
    if (!fichier.startsWith(RACINE) || !existsSync(fichier)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(fichier)] || 'application/octet-stream', body: await readFile(fichier) });
  });
}

const attendre = (page, ms) => page.waitForTimeout(ms);
const cadreDe = (page) => page.frames().find((f) => f.url() === 'about:srcdoc');
const lireCle = (page, id) => page.evaluate((c) => localStorage.getItem(c), `save_${id}`);

// Pose une sauvegarde puis rouvre le jeu. On quitte d'abord le lanceur (page
// sans jeu, même site) : sinon la partie en cours s'enregistre en partant et
// remplace la sauvegarde posée.
async function poserPuisOuvrir(page, id, valeur, adresse) {
  await page.goto(`${BASE}/catalog.json`);
  await page.evaluate(([c, v]) => localStorage.setItem(c, v), [`save_${id}`, valeur]);
  await page.goto(adresse);
  await attendre(page, 2000);
}

// Texte de la fenêtre de reprise (dans son Shadow DOM).
async function texteReprise(cadre) {
  return cadre.evaluate(() => document.querySelector('jel-sauvegarde')?.shadowRoot?.textContent || '').catch(() => '');
}

async function fermer(page) {
  // Fermeture simulée : le jeu enregistre (surFermeture), le lanceur reçoit le message.
  const cadre = cadreDe(page);
  await cadre?.evaluate(() => window.dispatchEvent(new Event('pagehide'))).catch(() => {});
  await attendre(page, 400);
}

// Fenêtre de reprise affichée ? (Shadow DOM ouvert : les locators le traversent.)
async function fenetreReprise(cadre) {
  return cadre.locator('jel-sauvegarde').count().then((n) => n > 0).catch(() => false);
}

async function lancerPartie(page) {
  const cadre = cadreDe(page);
  if (!cadre) return;
  const bouton = cadre.getByRole('button', { name: BOUTON_JOUER }).first();
  if (await bouton.isVisible().catch(() => false)) await bouton.tap().catch(() => bouton.click().catch(() => {}));
  else {
    const boite = await page.locator('#cadre-jeu').boundingBox();
    if (boite) await page.touchscreen.tap(boite.x + boite.width / 2, boite.y + boite.height / 2);
  }
  await attendre(page, 1200);
}

// Ouvre la fenêtre de reprise : déjà là au lancement, ou après le bouton Jouer.
async function ouvrirReprise(page) {
  let cadre = cadreDe(page);
  if (cadre && await fenetreReprise(cadre)) return true;
  await lancerPartie(page);
  cadre = cadreDe(page);
  return !!cadre && fenetreReprise(cadre);
}

async function toucher(cadre, nom) {
  const b = cadre.locator('jel-sauvegarde').getByRole('button', { name: nom }).first();
  await b.tap().catch(() => b.click());
}

async function testerJeu(navigateur, id) {
  const problemes = [];
  const notes = [];
  const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'fr-FR' });
  await brancherSite(contexte, id);
  const page = await contexte.newPage();
  page.on('pageerror', (e) => problemes.push(`erreur JavaScript : ${e.message.split('\n')[0]}`));
  const capturer = async (nom) => {
    if (!avecCaptures) return;
    const dossier = path.join(RACINE, 'captures', 'sauvegarde', id);
    await mkdir(dossier, { recursive: true });
    await page.screenshot({ path: path.join(dossier, nom) });
  };
  const adresse = `${BASE}/play.html?id=${id}&lang=fr`;

  try {
    // 1. Partie neuve, puis fermeture : sauvegarde écrite.
    await page.goto(adresse);
    await attendre(page, 2000);
    let cadre = cadreDe(page);
    if (!cadre) throw new Error('le jeu ne se charge pas dans le lanceur');
    if (!(await cadre.evaluate(() => !!window.JEL_SAVE).catch(() => false))) throw new Error('window.JEL_SAVE absent (module jel-sauvegarde)');
    if (await fenetreReprise(cadre)) problemes.push('partie neuve : la fenêtre de reprise s\'affiche alors qu\'il n\'y a aucune sauvegarde');
    await lancerPartie(page);
    if (await fenetreReprise(cadreDe(page))) problemes.push('partie neuve : la fenêtre de reprise s\'affiche alors qu\'il n\'y a aucune sauvegarde');
    await attendre(page, 800);
    await fermer(page);
    const ecrite = await lireCle(page, id);
    let d = null;
    try { d = JSON.parse(ecrite); } catch { /* illisible */ }
    if (!ecrite) problemes.push('fermeture de la page : aucune sauvegarde écrite (JEL_SAVE.surFermeture → JEL_SAVE.save pendant la partie)');
    else if (!d || d.v !== 1 || !Number.isInteger(d.niveau) || d.niveau < 1) problemes.push(`fermeture de la page : sauvegarde mal formée (${String(ecrite).slice(0, 80)})`);
    else notes.push(`fermeture → niveau ${d.niveau}, score ${d.score}`);
    await capturer('1-partie.png');

    // 2. Reprise au niveau 3.
    const posee = JSON.stringify({ v: 1, niveau: NIVEAU_TEST, score: SCORE_TEST, options: {}, date: Date.now() });
    await poserPuisOuvrir(page, id, posee, adresse);
    if (!(await ouvrirReprise(page))) {
      problemes.push('reprise : la fenêtre « Continuer / Nouvelle partie » n\'apparaît ni au lancement ni au bouton Jouer');
    } else {
      cadre = cadreDe(page);
      const texte = await texteReprise(cadre);
      if (!new RegExp(`\\b(${NIVEAU_TEST}|${SCORE_TEST})\\b`).test(texte)) problemes.push(`reprise : la fenêtre n'indique ni le niveau ${NIVEAU_TEST} ni le score ${SCORE_TEST}`);
      await capturer('2-reprise.png');
      await toucher(cadre, /^continuer$/i);
      await attendre(page, 1500);
      if (await fenetreReprise(cadreDe(page))) problemes.push('reprise : la fenêtre reste affichée après « Continuer »');
      await capturer('3-continuer.png');
      await fermer(page);
      const apres = await lireCle(page, id);
      let r = null;
      try { r = JSON.parse(apres); } catch { /* illisible */ }
      if (!r) problemes.push('reprise : plus de sauvegarde lisible après « Continuer » puis fermeture');
      // Jeu à niveaux : il doit reprendre au niveau 3. Jeu sans niveaux (partie
      // sans fin, niveau toujours 1) : il doit reprendre avec le score gardé.
      else if (r.niveau < NIVEAU_TEST && !(r.niveau === 1 && r.score >= SCORE_TEST)) {
        problemes.push(`reprise : après « Continuer » (niveau ${NIVEAU_TEST}, score ${SCORE_TEST}) puis fermeture, la sauvegarde indique niveau ${r.niveau}, score ${r.score} : le jeu ne reprend pas où on en était`);
      }
      else notes.push(`continuer niveau ${NIVEAU_TEST} → fermeture → niveau ${r.niveau}, score ${r.score}`);
    }

    // 3. Effacement (deux touchers).
    await poserPuisOuvrir(page, id, posee, adresse);
    if (await ouvrirReprise(page)) {
      cadre = cadreDe(page);
      await toucher(cadre, /effacer/i);
      await attendre(page, 200);
      await toucher(cadre, /effacer/i);
      await attendre(page, 600);
      if (await lireCle(page, id)) problemes.push('effacement : la clé save_' + id + ' existe encore après « Effacer la sauvegarde »');
      else notes.push('effacement ok');
      await capturer('4-efface.png');
    }

    // 4. Nouvelle partie.
    await poserPuisOuvrir(page, id, posee, adresse);
    if (await ouvrirReprise(page)) {
      await toucher(cadreDe(page), /nouvelle partie/i);
      await attendre(page, 1200);
      if (await fenetreReprise(cadreDe(page))) problemes.push('nouvelle partie : la fenêtre reste affichée');
      await capturer('5-nouvelle.png');
    }
  } catch (e) {
    problemes.push(e.message.split('\n')[0]);
  }
  await contexte.close();
  return { problemes: [...new Set(problemes)], notes };
}

const navigateur = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let nbProblemes = 0;
try {
  for (const id of ids) {
    if (!existsSync(path.join(DOSSIER_JEUX, id, 'game.json'))) { console.log(`✗ ${id} : jeu introuvable`); nbProblemes++; continue; }
    const { problemes, notes } = await testerJeu(navigateur, id);
    nbProblemes += problemes.length;
    console.log(`${problemes.length ? '✗' : '✓'} ${id}${notes.length ? `  (${notes.join(' ; ')})` : ''}`);
    for (const p of problemes) console.log(`    PROBLÈME : ${p}`);
  }
} finally {
  await navigateur.close();
}
console.log(nbProblemes ? `\n${nbProblemes} problème(s).` : '\nSauvegarde : tout est bon.');
process.exit(nbProblemes ? 1 : 0);
