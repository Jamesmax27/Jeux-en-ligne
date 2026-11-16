#!/usr/bin/env node
// ==========================================================================
// tester-stockage.mjs — vérifie le stockage des grosses données des jeux
// (public/stockage.js côté jeu, public/stockage-lanceur.js côté lanceur), dans
// le lanceur du site, comme en ligne (cadre isolé, sans stockage propre).
//
//   node scripts/tester-stockage.mjs            jeux qui ont le bloc jel-stockage
//   node scripts/tester-stockage.mjs mon-jeu    seulement celui-là
//
// Pour chaque jeu :
//   1. window.JEL_STOCK présent, en mode « site » (le lanceur garde les données).
//   2. Écriture, relecture, liste des clés, texte de 1 Mo ; clé refusée (« / »).
//   3. Rangement dans l'IndexedDB du site sous « <id du jeu>/<clé> » ; une clé
//      d'un autre jeu n'apparaît pas dans la liste.
//   4. Page rechargée : les données sont toujours là ; effacement.
//   5. Export : refusé sans geste du joueur ; après un toucher, le fichier est
//      proposé au téléchargement, avec son nom et son contenu.
// Aucune erreur JavaScript n'est permise pendant ces essais.
// Comme tester-sauvegarde.mjs : pas de serveur, le site est servi par Playwright
// à l'adresse http://jel.test/. Nécessite Playwright et Chromium (ou CHROMIUM_PATH).
// Code de sortie : 0 = tout est bon, 1 = au moins un problème.
// ==========================================================================

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(RACINE, 'public');
const DOSSIER_JEUX = path.join(RACINE, 'games');
const BASE = 'http://jel.test';
const RE_BLOC = /<script\b[^>]*\bid=["']jel-stockage["']/i;

// --seulement : parmi les jeux donnés, seulement ceux qui ont le bloc jel-stockage (validate.yml).
const args = process.argv.slice(2), seulement = args.includes('--seulement');
let ids = args.filter((a) => !a.startsWith('--'));
const aLeBloc = async (id) => { const chemin = path.join(DOSSIER_JEUX, id, 'index.html'); return existsSync(chemin) && RE_BLOC.test(await readFile(chemin, 'utf8')); };
if (!ids.length && !seulement) {
  for (const e of await readdir(DOSSIER_JEUX, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_') && await aLeBloc(e.name)) ids.push(e.name);
  }
  ids.sort();
} else if (seulement) {
  const garder = []; for (const id of ids) if (await aLeBloc(id)) garder.push(id); ids = garder;
}
if (!ids.length) { console.log('Stockage : aucun jeu n\'utilise jel-stockage.'); process.exit(0); }

let playwright;
try { playwright = await import('playwright'); }
catch { console.error('Playwright manque : npm install --no-save playwright'); process.exit(1); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };

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
    else { if (p === '/play') p = '/play.html'; fichier = path.join(PUBLIC, p.endsWith('/') ? p + 'index.html' : p); }
    if (!fichier.startsWith(RACINE) || !existsSync(fichier)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(fichier)] || 'application/octet-stream', body: await readFile(fichier) });
  });
}

const cadreDe = (page) => page.frames().find((f) => f.url() === 'about:srcdoc');
// appel dans le jeu : renvoie { ok, v } ou { ok: false, code }
const appel = (cadre, code) => cadre.evaluate(`(async()=>{ try{ return {ok:true,v:await (${code})}; }catch(e){ return {ok:false,code:e&&e.code||String(e)}; } })()`);

async function testerJeu(navigateur, id) {
  const problemes = [];
  const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR', acceptDownloads: true });
  await brancherSite(contexte, id);
  const page = await contexte.newPage();
  page.on('pageerror', (e) => problemes.push(`erreur JavaScript : ${e.message.split('\n')[0]}`));
  const adresse = `${BASE}/play.html?id=${id}&lang=fr`;
  const verifier = (c, m) => { if (!c) problemes.push(m); };
  try {
    await page.goto(adresse); await page.waitForTimeout(2000);
    let cadre = cadreDe(page);
    if (!cadre) throw new Error('le jeu ne se charge pas dans le lanceur');
    verifier(await cadre.evaluate(() => !!window.JEL_STOCK), 'window.JEL_STOCK absent (module jel-stockage)');
    verifier(await cadre.evaluate(() => window.JEL_STOCK && window.JEL_STOCK.mode()) === 'site', 'JEL_STOCK n\'est pas en mode « site » dans le lanceur');
    // 2. écriture, relecture, liste
    let r = await appel(cadre, `JEL_STOCK.set('essai-1','bonjour')`); verifier(r.ok, `écriture refusée (${r.code})`);
    r = await appel(cadre, `JEL_STOCK.get('essai-1')`); verifier(r.ok && r.v === 'bonjour', 'relecture différente de ce qui a été écrit');
    r = await appel(cadre, `JEL_STOCK.set('gros','x'.repeat(1048576))`); verifier(r.ok, `texte de 1 Mo refusé (${r.code})`);
    r = await appel(cadre, `JEL_STOCK.get('gros').then(t=>t&&t.length)`); verifier(r.ok && r.v === 1048576, 'texte de 1 Mo mal relu');
    r = await appel(cadre, `JEL_STOCK.get('../autre')`); verifier(!r.ok && r.code === 'cle', 'une clé avec « / » devrait être refusée');
    // 3. rangement dans le site, autres jeux invisibles
    const cles = await page.evaluate(() => new Promise((ok) => { const q = indexedDB.open('fmg-jeux', 1); q.onsuccess = () => { const t = q.result.transaction('donnees', 'readwrite'), m = t.objectStore('donnees'); m.put('secret', 'autre-jeu/essai-1'); const k = m.getAllKeys(); k.onsuccess = () => ok(k.result); }; q.onerror = () => ok(null); }));
    verifier(Array.isArray(cles) && cles.includes(`${id}/essai-1`), `données absentes de l'IndexedDB du site (clé « ${id}/essai-1 »)`);
    r = await appel(cadre, `JEL_STOCK.liste()`); verifier(r.ok && r.v.includes('essai-1') && r.v.includes('gros') && !r.v.some((k) => k.includes('autre')), 'liste des clés incorrecte (elle doit ne montrer que les clés du jeu)');
    // 4. rechargement, effacement
    await page.goto(adresse); await page.waitForTimeout(2000); cadre = cadreDe(page);
    r = await appel(cadre, `JEL_STOCK.get('essai-1')`); verifier(r.ok && r.v === 'bonjour', 'données perdues après le rechargement de la page');
    await appel(cadre, `Promise.all([JEL_STOCK.del('essai-1'),JEL_STOCK.del('gros')])`);
    r = await appel(cadre, `JEL_STOCK.get('essai-1')`); verifier(r.ok && r.v === null, 'effacement sans effet');
    r = await appel(cadre, `JEL_STOCK.place()`); verifier(r.ok, 'place() en erreur');
    // 5. export : accepté après un toucher, refusé sans geste du joueur
    await cadre.evaluate(() => { const b = document.createElement('button'); b.id = 'essai-export'; b.textContent = 'Exporter'; b.style.cssText = 'position:fixed;left:10px;top:200px;z-index:2147483647;width:160px;height:60px';
      b.addEventListener('click', () => { window.JEL_STOCK.exporter('essai.txt', 'contenu du fichier', 'text/plain').then(() => { window.__export = 'ok'; }, (e) => { window.__export = e.code; }); }); document.body.append(b); });
    const attente = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await cadre.locator('#essai-export').tap().catch(() => cadre.locator('#essai-export').click());
    const tele = await attente;
    if (!tele) problemes.push(`export après un toucher : aucun fichier proposé (${await cadre.evaluate(() => window.__export)})`);
    else {
      verifier(tele.suggestedFilename() === 'essai.txt', `nom du fichier exporté inattendu : ${tele.suggestedFilename()}`);
      const flux = await tele.createReadStream(); let texte = ''; for await (const morceau of flux) texte += morceau;
      verifier(texte === 'contenu du fichier', 'contenu du fichier exporté différent');
    }
    // sans geste : demandé 6 s après (l'activation laissée par un geste dure 5 s ; evaluate de Playwright en vaut un)
    await cadre.evaluate(() => { window.__sans = null; setTimeout(() => { window.JEL_STOCK.exporter('essai2.txt', 'x', 'text/plain').then(() => { window.__sans = 'ok'; }, (e) => { window.__sans = e.code; }); }, 6000); });
    await page.waitForTimeout(7000);
    verifier(await cadre.evaluate(() => window.__sans) === 'geste', 'un export sans geste du joueur devrait être refusé');
  } catch (e) { problemes.push(e.message); }
  await contexte.close();
  return problemes;
}

const executable = process.env.CHROMIUM_PATH || undefined;
const navigateur = await playwright.chromium.launch({ executablePath: executable });
let echecs = 0;
for (const id of ids) {
  const p = await testerJeu(navigateur, id);
  if (p.length) { echecs++; console.log(`✗ ${id}`); for (const m of p) console.log(`    – ${m}`); }
  else console.log(`✓ ${id}  (écriture, relecture, 1 Mo, isolement, rechargement, effacement, export)`);
}
await navigateur.close();
console.log(echecs ? `\nStockage : ${echecs} jeu(x) en échec.` : '\nStockage : tout est bon.');
process.exit(echecs ? 1 : 0);
