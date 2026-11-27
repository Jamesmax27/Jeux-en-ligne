#!/usr/bin/env node
// ==========================================================================
// capture.mjs — capture d'écran du jeu assemblé (outil de travail)
//
//   node sources/cosmoria/outils/capture.mjs <sortie.png> [--apercu 1|2|3] [--affiche] [--titre]
//        [--l 1280] [--h 720] [--dpr 1] [--lang fr] [--tactile] [--debug] [--attente 1500]
//        [--lanceur http://localhost:8080] [--clic "texte d'un bouton"]… [--js "code à exécuter avant la capture"]
//
// Ouvre games/cosmoria/index.html seul (sans le lanceur du site), avec
// window.JEL_APERCU (ville d'exemple en pleine partie), window.JEL_AFFICHE
// (affiche sans interface) ou rien (écran titre), puis enregistre l'image.
// --lanceur <adresse> : ouvre le jeu dans le lanceur du site (npm run dev), comme un joueur ;
// les clics et le code visent alors le cadre du jeu. --tactile : téléphone (écran tactile).
// Les erreurs de la page sont affichées. Navigateur : Playwright, sinon Edge.
// ==========================================================================

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const JEU = path.resolve(ICI, '..', '..', '..', 'games', 'cosmoria', 'index.html');
const args = process.argv.slice(2);
const sortie = args.shift();
const o = { l: 1280, h: 720, dpr: 1, lang: 'fr', attente: 1500, apercu: 0, affiche: false, tactile: false, debug: false, js: '', lanceur: '', clics: [] };
while (args.length) {
  const a = args.shift();
  if (a === '--affiche') o.affiche = true;
  else if (a === '--tactile') o.tactile = true;
  else if (a === '--debug') o.debug = true;
  else if (a === '--titre') o.apercu = 0;
  else if (a === '--clic') o.clics.push(args.shift());
  else if (a.startsWith('--')) o[a.slice(2)] = /^(js|lang|lanceur)$/.test(a.slice(2)) ? args.shift() : Number(args.shift());
}
if (!sortie) { console.log('usage : node capture.mjs <sortie.png> [--apercu n] [--affiche] [--l 1280] [--h 720] [--dpr 1] [--lang fr] [--tactile] [--lanceur <adresse>] [--clic "…"] [--js "…"]'); process.exit(1); }

const lancer = async () => {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'msedge' }); }
};
const nav = await lancer();
const ctx = await nav.newContext({ viewport: { width: o.l, height: o.h }, deviceScaleFactor: o.dpr, hasTouch: o.tactile, isMobile: o.tactile, locale: 'fr-FR' });
const page = await ctx.newPage();
let erreurs = 0;
page.on('console', (m) => { if (m.type() === 'error') { erreurs++; console.log('[console]', m.text()); } });
page.on('pageerror', (e) => { erreurs++; console.log('[erreur]', e.message); });
let cible = page;
if (o.lanceur) {
  await page.goto(`${o.lanceur.replace(/\/$/, '')}/play.html?id=cosmoria&lang=${o.lang}`);
  await page.waitForTimeout(o.attente + 800);
  cible = page.frames().find((f) => f.url() === 'about:srcdoc') || page;
  if (cible === page) console.log('[lanceur] cadre du jeu introuvable');
} else {
  await page.addInitScript(([lang, apercu, affiche, debug]) => {
    if (debug) window.JEL_DEBUG = 1; // mode test du jeu : toutes les missions ouvertes
    window.JEL_LANG = lang;
    if (affiche) window.JEL_AFFICHE = 1; else if (apercu) window.JEL_APERCU = apercu;
  }, [o.lang, o.apercu, o.affiche, o.debug]);
  await page.goto(pathToFileURL(JEU).href);
  await page.waitForTimeout(o.attente);
}
// Clics successifs sur des boutons, désignés par leur texte ou leur nom accessible (--clic).
for (const nom of o.clics) {
  const b = cible.getByRole('button', { name: nom }).first();
  try { if (o.tactile) await b.tap({ timeout: 4000 }); else await b.click({ timeout: 4000 }); }
  catch (e) {
    // Qui recouvre le bouton ? (aide au diagnostic)
    const dessus = await b.evaluate((el) => { const r = el.getBoundingClientRect(), x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)} ; au-dessus : ${x ? x.tagName + '.' + x.className + '#' + x.id : 'rien'} ; fenêtre ${innerWidth}×${innerHeight}`; }).catch(() => '?');
    console.log(`[clic] « ${nom} » : ${String(e.message).split(/\n/)[0]} (${dessus})`);
  }
  await page.waitForTimeout(700);
}
if (o.js) { try { console.log('[js]', await cible.evaluate(o.js)); } catch (e) { console.log('[js]', e.message); } await page.waitForTimeout(600); }
await page.screenshot({ path: sortie });
await nav.close();
console.log(`✓ ${sortie} (${o.l} × ${o.h}, ${erreurs} erreur(s))`);
