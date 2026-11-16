#!/usr/bin/env node
// ==========================================================================
// tester-terres-cubiques.mjs — essais du monde par morceaux, des 5 emplacements,
// des villages et du mode test de Terres Cubiques (docs/terres-cubiques-villages.md),
// dans le lanceur du site (cadre isolé, IndexedDB du site), comme en ligne.
//
//   node scripts/tester-terres-cubiques.mjs
//   node scripts/tester-terres-cubiques.mjs --seulement <ids…>   (validate.yml :
//        ne fait rien si terres-cubiques n'est pas dans la liste)
//
//   1. Ancienne partie (format 2, scripts/terres-cubiques/ancienne-partie.json,
//      faite par l'ancien jeu) : rangée dans l'emplacement 1, ancienne zone
//      identique morceau par morceau, villages et blocs posés retrouvés,
//      raccord avec le terrain généré autour.
//   2. Nouveau monde : génération reproductible, villages espacés de 200 blocs,
//      un village près du départ, fer en profondeur ; voyage de 1 000 blocs
//      (morceaux libérés, bloc posé retrouvé au retour) ; sauvegarde relue
//      depuis l'IndexedDB du site après rechargement.
//   3. Villages : simulés à moins de 48 blocs, figés au-delà ; fiches des
//      villageois gardées.
//   4. Emplacements : export, import (identique), fichier abîmé refusé,
//      confirmation avant d'écraser.
//   5. Mode test : absent sans ?debug=1 ; avec, panneau et marque « Test ».
// Le jeu est servi avec une porte d'entrée de test (window.__T, ajoutée à la
// volée, jamais dans le fichier publié). Aucune erreur JavaScript permise.
// Nécessite Playwright et Chromium (ou CHROMIUM_PATH). Code de sortie 0 ou 1.
// ==========================================================================

import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(RACINE, 'public');
const ID = 'terres-cubiques';
const BASE = 'http://jel.test';
const args = process.argv.slice(2);
if (args.includes('--seulement') && !args.includes(ID)) { console.log('Terres Cubiques : pas dans la liste, rien à essayer.'); process.exit(0); }

let playwright;
try { playwright = await import('playwright'); }
catch { console.error('Playwright manque : npm install --no-save playwright'); process.exit(1); }

const reference = JSON.parse(await readFile(path.join(RACINE, 'scripts', 'terres-cubiques', 'ancienne-partie.json'), 'utf8'));
const fiche = JSON.parse(await readFile(path.join(RACINE, 'games', ID, 'game.json'), 'utf8'));
const source = await readFile(path.join(RACINE, 'games', ID, 'index.html'), 'utf8');
const MARQUE = "(function(){\n'use strict';";
if (!source.replace(/\r\n/g, '\n').includes(MARQUE)) { console.error('✗ début du code du jeu introuvable (porte de test)'); process.exit(1); }
const jeu = source.replace(/\r\n/g, '\n').replace(MARQUE, MARQUE + ' window.__T=k=>eval(k);');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };

const navigateur = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const contexte = await navigateur.newContext({ viewport: { width: 1000, height: 700 }, acceptDownloads: true, locale: 'fr-FR' });
await contexte.route(`${BASE}/**`, async (route) => {
  const u = new URL(route.request().url()); let p = decodeURIComponent(u.pathname);
  if (p === '/catalog.json') return route.fulfill({ status: 200, contentType: TYPES['.json'], body: JSON.stringify({ games: [{ ...fiche, play: `games/${ID}/?v=1`, cover: '' }] }) });
  if (p.startsWith('/api/')) return route.fulfill({ status: 503, body: '' });
  if (p.startsWith(`/games/${ID}/`)) return route.fulfill({ status: 200, contentType: TYPES['.html'], body: jeu });
  if (p === '/play') p = '/play.html';
  const f = path.join(PUBLIC, p.endsWith('/') ? p + 'index.html' : p);
  if (!f.startsWith(PUBLIC) || !existsSync(f)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: await readFile(f) });
});
const page = await contexte.newPage(), erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e).split('\n')[0]));
const dossier = await mkdtemp(path.join(os.tmpdir(), 'tc-'));
let echecs = 0;
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) echecs++; };
const cadre = () => page.frames().find((f) => f.url() === 'about:srcdoc');
const T = (c, code) => c.evaluate((k) => window.__T(k), code);
const attendre = (ms) => page.waitForTimeout(ms);
async function ouvrir(q = '') {
  await page.goto(`${BASE}/play.html?id=${ID}&lang=fr${q}`);
  for (let i = 0; i < 120; i++) { const c = cadre(); if (c && await c.evaluate(() => !!window.__T && window.__T('state') === 'title').catch(() => false)) return c; await attendre(250); }
  throw new Error('le jeu ne s\'ouvre pas dans le lanceur');
}
async function continuer(c) { const b = c.locator('jel-sauvegarde').getByRole('button', { name: /Continuer/ }); if (await b.count()) await b.first().click(); else await c.locator('#tContinue').click(); await attendre(1500); }
const empreintes = `(()=>{ const h=[]; for(let cz=0;cz<16;cz++) for(let cx=0;cx<16;cx++){ const c=ensureChunk(cx+LO/16,cz+LO/16); let a=0; for(let y=0;y<H;y++) for(let lz=0;lz<16;lz++) for(let lx=0;lx<16;lx++) a=(Math.imul(a,31)+c.b[(y<<8)|(lz<<4)|lx])|0; h.push(a); } return h; })()`;

try {
  console.log('1. ancienne partie (format 2)');
  await page.goto(`${BASE}/catalog.json`);
  await page.evaluate((m) => { localStorage.clear(); localStorage.setItem('save_terres-cubiques', JSON.stringify({ v: 1, niveau: 2, score: 0, options: {}, date: Date.now(), monde: m })); }, reference.save);
  let c = await ouvrir(); await attendre(1000);
  let r = await T(c, `({p:parties.s.map(m=>!!m),dernier:parties.dernier,legacy,seed,villages:VILLAGES.size})`);
  ok(r.p[0] && r.dernier === 0 && r.legacy && r.seed === reference.save.seed, 'rangée dans l\'emplacement 1, ancienne zone chargée');
  ok(r.villages === reference.villages, `mêmes villages (${r.villages})`);
  const h = await T(c, empreintes), diff = h.filter((v, i) => v !== reference.empreintes[i]).length;
  ok(diff === 0, `ancienne zone identique morceau par morceau (${256 - diff} / 256)`);
  const g = reference.or;
  await continuer(c);
  ok(await T(c, `state==='play'&&getB(${g[0]}+LO,${g[1]},${g[2]}+LO)===GOLD_BLOCK`), '« Continuer » : bloc d\'or de l\'ancienne partie retrouvé');
  r = await T(c, `(()=>{ let s=0; for(let z=LO;z<LO+LW;z+=4) for(const [a,b] of [[LO,LO-1],[LO+LW-1,LO+LW]]){ ensureChunk(a>>4,z>>4); ensureChunk(b>>4,z>>4); s=Math.max(s,Math.abs(surfaceY(a,z)-surfaceY(b,z))); } return s; })()`);
  ok(r <= 12, `raccord avec le terrain généré autour : ${r} blocs d'écart au plus`);

  console.log('2. nouveau monde');
  await T(c, `setState('title')`); await c.locator('#tSurv').click(); await attendre(2500);
  r = await T(c, `(()=>{ const hash=b=>{ let a=0; for(let i=0;i<b.length;i++) a=(Math.imul(a,31)+b[i])|0; return a; };
    const cx=Math.floor(P.x/16)+3, cz=Math.floor(P.z/16)-2, h1=hash(baseOf(cx,cz).b); BASES.clear(); CAVES.clear(); DONJONS.clear(); const h2b=hash(baseOf(cx,cz).b);
    let fer=0; for(let k=0;k<20;k++){ const b=baseOf(Math.floor(ORIG/16)+k*7-100,Math.floor(ORIG/16)+k*5-70).b; for(let i=0;i<b.length;i++) if(b[i]===IRON_ORE&&(i>>8)<=20) fer++; }
    const d=[]; for(let cj=120;cj<136;cj++) for(let ci=120;ci<136;ci++){ const v=villageInfo(ci,cj); if(v) d.push([v.cx,v.cz]); }
    let dmin=1e9; for(let a=0;a<d.length;a++) for(let b=a+1;b<d.length;b++) dmin=Math.min(dmin,Math.hypot(d[a][0]-d[b][0],d[a][1]-d[b][1]));
    const vs=nearestVillageSite(P.x,P.z); return {legacy,cur:curSlot,same:h1===h2b,fer:fer/20,n:d.length,dmin,dv:vs?Math.hypot(vs.cx-P.x,vs.cz-P.z):-1}; })()`);
  ok(!r.legacy && r.cur === 1, 'nouvelle partie dans l\'emplacement 2, sans ancienne zone');
  ok(r.same, 'même graine, même morceau (génération reproductible)');
  ok(r.n >= 30 && r.dmin >= 200, `${r.n} villages sur 16 × 16 cases, ${Math.round(r.dmin)} blocs au moins entre deux`);
  ok(r.dv > 0 && r.dv < 80, `un village près du départ (${Math.round(r.dv)} blocs)`);
  ok(r.fer >= 2, `fer en profondeur : ${r.fer.toFixed(1)} blocs par morceau`);
  const or = await T(c, `(()=>{ const x=Math.floor(P.x)+3, z=Math.floor(P.z), y=surfaceY(x,z)+1; setBlock(x,y,z,GOLD_BLOCK); const o=[x,y,z,P.x,P.z]; P.fly=true; P.x+=1000; loadAround(P.x,P.z); return o; })()`);
  await attendre(4000);
  ok(await T(c, `!chunkAt(${or[0]}>>4,${or[2]}>>4)`), 'à 1 000 blocs : les morceaux du départ sont libérés');
  ok(await T(c, `(()=>{ P.x=${or[3]}; P.z=${or[4]}; loadAround(P.x,P.z); return getB(${or[0]},${or[1]},${or[2]})===GOLD_BLOCK; })()`), 'retour : le bloc posé est intact');
  await T(c, `(async()=>{ saveNow(); await saving; })()`);
  c = await ouvrir(); await attendre(800);
  ok(await T(c, `parties.dernier===1&&getB(${or[0]},${or[1]},${or[2]})===GOLD_BLOCK`), 'page rechargée : partie relue depuis l\'IndexedDB du site');

  console.log('3. villages par proximité');
  await continuer(c);
  const vid = await T(c, `(()=>{ const v=[...VILLAGES.values()].sort((a,b)=>Math.hypot(a.cx-P.x,a.cz-P.z)-Math.hypot(b.cx-P.x,b.cz-P.z))[0]; P.fly=true; P.x=v.cx+.5; P.z=v.cz+12.5; P.y=v.h0+3; loadAround(P.x,P.z); return v.id; })()`);
  await attendre(2500);
  r = await T(c, `(()=>{ const v=VILLAGES.get(${vid}); const vil=ents.filter(e=>e.type==='villager'&&e.vil===v.id); return {sim:v.sim,n:vil.length,noms:vil.every(e=>typeof e.nom==='string'&&e.nom)}; })()`);
  ok(r.sim && r.n > 0 && r.noms, `à moins de 48 blocs : village simulé, ${r.n} villageois nommés`);
  await T(c, `(()=>{ P.x+=90; loadAround(P.x,P.z); })()`); await attendre(1500);
  const p1 = await T(c, `JSON.stringify(ents.filter(e=>e.type==='villager'&&e.vil===${vid}).map(e=>[e.x,e.z]))`); await attendre(2500);
  const p2 = await T(c, `JSON.stringify(ents.filter(e=>e.type==='villager'&&e.vil===${vid}).map(e=>[e.x,e.z]))`);
  ok(await T(c, `VILLAGES.get(${vid}).sim===false`) && p1 === p2, 'à 90 blocs : village figé (villageois immobiles)');
  const noms = await T(c, `JSON.stringify([...VILLAGES.get(${vid}).pop.values()].map(f=>f.nom+f.age+f.metier))`);
  await T(c, `(async()=>{ saveNow(); await saving; })()`);
  c = await ouvrir(); await attendre(800);
  ok(await T(c, `(()=>{ const v=VILLAGES.get(${vid}); return v&&v.pop?JSON.stringify([...v.pop.values()].map(f=>f.nom+f.age+f.metier)):''; })()`) === noms, 'fiches des villageois gardées');

  console.log('4. emplacements : export et import');
  { const b = c.locator('jel-sauvegarde').getByRole('button', { name: /Nouvelle partie/ }); if (await b.count()) await b.first().click(); await attendre(300); }
  await c.locator('#tSlots').click(); await attendre(300);
  const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await c.locator('.part').nth(0).getByRole('button', { name: 'Exporter' }).click();
  const tele = await dl; ok(!!tele && tele.suggestedFilename().endsWith('.terrescubiques'), `fichier exporté : ${tele && tele.suggestedFilename()}`);
  const fichier = path.join(dossier, 'partie.terrescubiques'); if (tele) await tele.saveAs(fichier);
  await c.locator('.part').nth(2).getByRole('button', { name: 'Importer' }).click(); await c.locator('#slFile').setInputFiles(fichier); await attendre(1500);
  ok(await T(c, `(async()=>{ const s=JSON.parse(await decompresser(await JEL_STOCK.get('partie-3'))); return s.seed===${reference.save.seed}&&s.lg===1; })()`), 'importé dans l\'emplacement 3, identique');
  const abime = path.join(dossier, 'abime.terrescubiques'); await writeFile(abime, 'gz:QUJDREVGR0g=');
  await c.locator('.part').nth(3).getByRole('button', { name: 'Importer' }).click(); await c.locator('#slFile').setInputFiles(abime); await attendre(800);
  ok(await T(c, 'parties.s[3]===null'), 'fichier abîmé refusé, rien de changé');
  const avant = await T(c, `(async()=>JSON.parse(await decompresser(await JEL_STOCK.get('partie-2'))).seed)()`);
  await c.locator('.part').nth(1).getByRole('button', { name: 'Importer' }).click(); await c.locator('#slFile').setInputFiles(fichier); await attendre(800);
  ok(await T(c, `(async()=>JSON.parse(await decompresser(await JEL_STOCK.get('partie-2'))).seed)()`) === avant, 'emplacement pris : rien d\'écrasé sans confirmation');

  console.log('5. mode test');
  ok(await T(c, `!DEBUG&&$('#dbg').hidden`), 'sans ?debug=1 : aucune trace');
  c = await ouvrir('&debug=1'); await continuer(c); await attendre(800);
  r = await T(c, `({debug:DEBUG,panneau:!$('#dbg').hidden,test:partieTest})`);
  ok(r.debug && r.panneau && r.test, 'avec ?debug=1 : panneau affiché, partie marquée « Test »');
} catch (e) { ok(false, e.message); }
ok(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
await navigateur.close(); await rm(dossier, { recursive: true, force: true });
console.log(echecs ? `\nTerres Cubiques : ${echecs} problème(s).` : '\nTerres Cubiques : tout est bon.');
process.exit(echecs ? 1 : 0);
