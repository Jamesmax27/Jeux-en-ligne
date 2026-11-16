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
//   6. Vie des villages (vitesse ×10) : métiers variés, stock qui grandit, arbres
//      jamais sous le seuil, champ ressemé, pousse devenue arbre, blocs du joueur
//      (bûches, pierre, arbre né de sa pousse) jamais touchés.
//   7. Construction (vitesse ×10) : cabane bâtie bloc par bloc avec étiquette de
//      progression, blocs notés « village » ; chantier en pause faute de bois
//      (besoin maximal), reprise à la livraison ; le planificateur lance un
//      chantier ; chantier et bâtiments finis relus après rechargement.
//   8. Échanges et marché (vitesse ×10) : un meunier sans blé va en chercher chez
//      un porteur, dette notée puis rendue sur la farine ; refus d'un porteur de
//      mauvaise humeur ; marché bâti, marchand nommé, surplus rangé sur les étals,
//      blé pris au marché faute de porteur ; étals et compteurs relus après rechargement.
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
// Attend que la vie du village avance de `secondes` (temps du village, vitesse comprise) ou que `cond`
// soit vraie, en gardant le jour ; plafond en temps réel. Le pas de chaque image est plafonné à 0,05 s :
// sur une machine lente, la simulation va moins vite et une attente fixe ne suffirait pas.
async function attendreVillage(c, vid, secondes, cond = 'false', maxMs = 240000) {
  const t0 = await T(c, `vie(VILLAGES.get(${vid})).t`), fin = Date.now() + maxMs;
  while (Date.now() < fin) { await attendre(1000); await T(c, 'time=Math.min(time,.45)');
    if (await T(c, `(${cond})`)) return true;
    if (await T(c, `vie(VILLAGES.get(${vid})).t`) - t0 >= secondes) return false; }
  return false;
}
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

  console.log('6. vie des villages (mode test, vitesse ×10)');
  const v6 = await T(c, `(()=>{ for(let ci=-2;ci<=2;ci++) for(let cj=-2;cj<=2;cj++){ const inf=villageInfo(Math.floor(P.x/256)+ci,Math.floor(P.z/256)+cj); if(inf) for(let a=-3;a<=3;a++) for(let b=-3;b<=3;b++) ensureChunk((inf.cx>>4)+a,(inf.cz>>4)+b); }
    const v=[...VILLAGES.values()].sort((a,b)=>b.vils.length-a.vils.length)[0]; P.fly=true; P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+14; loadAround(P.x,P.z); time=.08; DBG.vitesse=10; prefs.monsters=false;
    const jx=v.cx+v.R+8, jz=v.cz, jy=surfaceY(jx,jz)+1; for(let k=0;k<4;k++) setBlock(jx,jy+k,jz,OAK_LOG); setBlock(jx+1,jy,jz,COBBLE);
    return {id:v.id,jx,jy,jz,stock:JSON.stringify(vie(v).stock)}; })()`);
  let vit = false; for (let k = 0; k < 40 && !vit; k++) { await attendre(500); vit = await T(c, `state==='play'&&VILLAGES.get(${v6.id}).sim===true&&vie(VILLAGES.get(${v6.id})).t>3`); }
  ok(vit, 'partie en cours, village simulé');
  await attendreVillage(c, v6.id, 20);
  const metiers = await T(c, `[...new Set(ents.filter(e=>e.type==='villager'&&e.vil===${v6.id}).map(e=>e.metier))]`);
  ok(metiers.length >= 4, `métiers variés : ${metiers.join(', ')}`);
  const pz = await T(c, `(()=>{ const p=foret(VILLAGES.get(${v6.id})).find(q=>getB(q[0],q[1]+1,q[2])===AIR); if(!p) return null; setBlock(p[0],p[1]+1,p[2],SAPLING_OAK,false,ORIGINE.joueur); POUSSES.set(BK(p[0],p[1]+1,p[2]),[jourJeu+time-2,0]); return p; })()`);
  if (pz) await attendreVillage(c, v6.id, 1e9, `isLog(getB(${pz[0]},${pz[1] + 1},${pz[2]}))`, 30000);
  ok(!pz || await T(c, `isLog(getB(${pz[0]},${pz[1] + 1},${pz[2]}))`), 'une pousse plantée il y a deux jours est devenue un arbre');
  await attendreVillage(c, v6.id, 600);
  r = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), w=vie(v); return {stock:w.stock,arbres:arbresAdultes(v),champ:v.field?v.field.cells.filter(q=>{ const id=getB(q[0],v.h0+1,q[1]); return B[id]&&B[id].crop; }).length/v.field.cells.length:1}; })()`);
  const avant6 = JSON.parse(v6.stock), plus = Object.keys(r.stock).filter((k) => (r.stock[k] | 0) > (avant6[k] | 0));
  ok(plus.length >= 3, `le stock du village grandit (${plus.join(', ')})`);
  ok(r.arbres >= 15, `arbres adultes au-dessus du seuil (${r.arbres})`);
  ok(r.champ > .6, `champ ressemé (${Math.round(r.champ * 100)} %)`);
  ok(await T(c, `(()=>{ for(let k=0;k<4;k++) if(getB(${v6.jx},${v6.jy}+k,${v6.jz})!==OAK_LOG) return false; return getB(${v6.jx}+1,${v6.jy},${v6.jz})===COBBLE&&(${pz?`isLog(getB(${pz[0]},${pz[1] + 1},${pz[2]}))`:'true'}); })()`), 'aucun bloc du joueur touché (bûches, pierre, arbre né de sa pousse)');

  console.log('7. construction (vitesse ×10)');
  // le joueur vole au-dessus du chantier, tourné vers lui (l'étiquette n'est montrée que si on la voit)
  await T(c, `window.vueSur=S=>{ const v=VILLAGES.get(${v6.id}), dx=v.cx-S.x, dz=v.cz-S.z, d=Math.hypot(dx,dz)||1, k=Math.min(14,d)/d; P.fly=true; P.x=S.x+.5+dx*k; P.z=S.z+.5+dz*k; P.y=S.g0+9; P.yaw=Math.atan2(dx,dz); P.pitch=-Math.atan2(6,Math.min(14,d)); }`);
  const cab = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); vie(v).stock.bois=60; vie(v).stock.pierre=40; const S=siteBat(v,'cabane'); if(!S) return null; vilEco(v).s=S; vie(v).planT=1e9; vueSur(S); return {x:S.x,z:S.z,g0:S.g0}; })()`);
  ok(!!cab, 'emplacement de cabane trouvé (terrain aplani de 2 blocs au plus)');
  let fini = null, etiquette = false;
  const tc = await T(c, `vie(VILLAGES.get(${v6.id})).t`), finC = Date.now() + 240000;
  while (cab && !fini && Date.now() < finC && await T(c, `vie(VILLAGES.get(${v6.id})).t`) - tc < 900) { await attendre(1000); await T(c, 'time=Math.min(time,.45)');
    const e = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), S=vilEco(v).s; return S?{lab:[...document.querySelectorAll('.chantier')].filter(b=>!b.hidden).map(b=>b.textContent)}:{bats:(vie(v).bats||[]).map(b=>b.t)}; })()`);
    if (e.lab && e.lab.some((t) => /Cabane de bûcheron · \d+ %/.test(t))) etiquette = true;
    if (e.bats) fini = e; }
  ok(etiquette, 'étiquette de progression du chantier affichée');
  ok(fini && fini.bats.includes('cabane'), 'cabane terminée');
  if (cab) ok(await T(c, `(()=>{ let porte=0, coffre=0; for(let dz=-3;dz<=3;dz++) for(let dx=-3;dx<=3;dx++) for(let y=${cab.g0};y<=${cab.g0}+3;y++){ const id=getB(${cab.x}+dx,y,${cab.z}+dz); if(DOORF[id]) porte++; if(id===CHEST) coffre++; } return porte>=2&&coffre>=1&&(edits.src(BK(${cab.x},${cab.g0}+3,${cab.z}))===ORIGINE.village||getB(${cab.x},${cab.g0}+3,${cab.z})===AIR); })()`), 'cabane bâtie bloc par bloc (porte, coffre), blocs notés « village »');
  const ent = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); vie(v).stock.bois=0; vie(v).stock.pierre=40; for(const e of ents) if(e.vil===v.id){ const f=ficheDe(e); if(f) f.inv={}; } const S=siteBat(v,'entrepot'); if(!S) return false; S.credit={}; vilEco(v).s=S; vueSur(S); return true; })()`);
  let pause = null;
  const tp = await T(c, `vie(VILLAGES.get(${v6.id})).t`), finP = Date.now() + 180000;
  while (ent && !pause && Date.now() < finP && await T(c, `vie(VILLAGES.get(${v6.id})).t`) - tp < 300) { await attendre(1000); await T(c, 'time=Math.min(time,.45)'); pause = await T(c, `(()=>{ const S=vilEco(VILLAGES.get(${v6.id})).s; return S&&S.manque==='bois'?{p:S.p,lab:[...document.querySelectorAll('.chantier.pause')].filter(b=>!b.hidden).length}:null; })()`); }
  ok(!!pause && pause.lab > 0 && await T(c, `besoin(VILLAGES.get(${v6.id}),'bois')`) === 1, 'entrepôt en pause faute de bois, besoin de bois maximal');
  await T(c, `ajouter(VILLAGES.get(${v6.id}),'bois',80)`);
  const reprise = !!pause && await attendreVillage(c, v6.id, 300, `(()=>{ const S=vilEco(VILLAGES.get(${v6.id})).s; return !S||(!S.manque&&S.p>${pause ? pause.p : 0}); })()`, 180000);
  ok(reprise, 'bois livré : le chantier reprend');
  const plan = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); vilEco(v).s=null; vie(v).planT=0; vie(v).stock.bois=60; planifier(v); return vilEco(v).s&&vilEco(v).s.t; })()`);
  ok(!!plan, `le planificateur lance un chantier (${plan})`);
  await T(c, `(async()=>{ saveNow(); await saving; })()`);
  c = await ouvrir('&debug=1'); await attendre(800);
  ok(await T(c, `(()=>{ const ci=Math.floor((${v6.id}-1000)/256), cj=(${v6.id}-1000)%256, inf=villageInfo(ci,cj); for(let a=-3;a<=3;a++) for(let b=-3;b<=3;b++) ensureChunk((inf.cx>>4)+a,(inf.cz>>4)+b); const v=VILLAGES.get(${v6.id}); return !!(v&&v.eco&&v.eco.s&&v.eco.s.t===${JSON.stringify(plan)}&&(vie(v).bats||[]).some(b=>b.t==='cabane')); })()`), 'chantier en cours et bâtiments finis relus après rechargement');

  console.log('8. échanges et marché (vitesse ×10)');
  await continuer(c);
  await T(c, `window.vueSur=S=>{ const v=VILLAGES.get(${v6.id}), dx=v.cx-S.x, dz=v.cz-S.z, d=Math.hypot(dx,dz)||1, k=Math.min(14,d)/d; P.fly=true; P.x=S.x+.5+dx*k; P.z=S.z+.5+dz*k; P.y=S.g0+9; P.yaw=Math.atan2(dx,dz); P.pitch=-Math.atan2(6,Math.min(14,d)); }`);
  await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); P.fly=true; P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+14; loadAround(P.x,P.z); time=.08; DBG.vitesse=10; prefs.monsters=false; vilEco(v).s=null; vie(v).planT=1e9;
    for(const o of VILS) if(o.vil===v.id){ const g=ficheDe(o); if(g) g.humeur=70; } })()`);
  ok(await attendreVillage(c, v6.id, 1e9, `VILLAGES.get(${v6.id}).sim&&VILS.filter(o=>o.vil===${v6.id}&&!(o.baby>0)&&ficheDe(o)).length>=3`, 30000), 'village simulé, 3 adultes au moins');
  // A devient meunier sans blé ; B (garde, qui ne livre pas tout de suite) porte du blé ; personne d'autre n'en a
  const prep = `(hB,sac)=>{ const v=VILLAGES.get(${v6.id}), w=vie(v), ad=VILS.filter(o=>o.vil===v.id&&!(o.baby>0)&&ficheDe(o)), A=ad[0], B=ad[1];
    w.stock.ble=0; w.stock.farine=0; for(const o of VILS) if(o.vil===v.id){ const g=ficheDe(o); if(g){ delete g.inv.ble; g.dettes={}; } }
    const fa=ficheDe(A), fb=ficheDe(B); fa.metier='meunier'; fa.inv={}; fa.humeur=60; fa.memoire=[]; fb.metier='garde'; fb.inv=sac||{ble:6}; fb.humeur=hB;
    A.act=null; A.trocT=0; A.decT=0; B.act=null; B.attendTroc=0; return {a:A.vslot,b:B.vslot}; }`;
  let tr = await T(c, `(${prep})(70)`); const n0 = await T(c, `echg(VILLAGES.get(${v6.id})).troc.n`);
  ok(await attendreVillage(c, v6.id, 900, `echg(VILLAGES.get(${v6.id})).troc.n>${n0}`, 120000), 'le meunier sans blé en obtient d\'un porteur');
  ok(await T(c, `VILLAGES.get(${v6.id}).pop.get(${tr.b}).humeur>70`), 'échange : le porteur est plus content');
  ok(await attendreVillage(c, v6.id, 900, `(()=>{ const fa=VILLAGES.get(${v6.id}).pop.get(${tr.a}); return !((fa.dettes||{})[${tr.b}]>0)&&fa.memoire.some(m=>m[2]==='dette'); })()`, 120000), 'sac vide : dette notée, puis rendue sur la farine moulue');
  tr = await T(c, `(${prep})(10)`); const rf0 = await T(c, `echg(VILLAGES.get(${v6.id})).troc.refus`);
  ok(await attendreVillage(c, v6.id, 900, `echg(VILLAGES.get(${v6.id})).troc.refus>${rf0}`, 120000) && await T(c, `VILLAGES.get(${v6.id}).pop.get(${tr.b}).inv.ble===6`), 'porteur de mauvaise humeur : il refuse et garde son blé');
  await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); for(const o of VILS) if(o.vil===v.id){ const g=ficheDe(o); if(g) g.humeur=70; } vie(v).stock.bois=80; vie(v).stock.pierre=80; const S=siteBat(v,'marche'); if(S){ vilEco(v).s=S; vueSur(S); } })()`);
  ok(await attendreVillage(c, v6.id, 2000, `(vie(VILLAGES.get(${v6.id})).bats||[]).some(b=>b.t==='marche')`, 240000), 'marché bâti');
  ok(await T(c, `[...VILLAGES.get(${v6.id}).pop.values()].some(f=>f.metier==='marchand')`), 'un villageois devient marchand');
  await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+14; vie(v).stock.pierre=60; })()`);
  ok(await attendreVillage(c, v6.id, 900, `(echg(VILLAGES.get(${v6.id})).etal.pierre|0)>0`, 150000), 'le marchand range le surplus de pierre sur les étals');
  tr = await T(c, `(()=>{ const r=(${prep})(70,{}); echg(VILLAGES.get(${v6.id})).etal.ble=6; return r; })()`); const mk0 = await T(c, `echg(VILLAGES.get(${v6.id})).troc.marche`);
  ok(await attendreVillage(c, v6.id, 900, `echg(VILLAGES.get(${v6.id})).troc.marche>${mk0}`, 150000), 'sans porteur, le meunier prend du blé au marché');
  const etal = await T(c, `JSON.stringify([echg(VILLAGES.get(${v6.id})).etal,echg(VILLAGES.get(${v6.id})).troc])`);
  await T(c, `(async()=>{ saveNow(); await saving; })()`);
  c = await ouvrir('&debug=1'); await attendre(800);
  ok(await T(c, `(()=>{ const ci=Math.floor((${v6.id}-1000)/256), cj=(${v6.id}-1000)%256, inf=villageInfo(ci,cj); for(let a=-3;a<=3;a++) for(let b=-3;b<=3;b++) ensureChunk((inf.cx>>4)+a,(inf.cz>>4)+b); const v=VILLAGES.get(${v6.id}); return !!v&&!!v.vie&&JSON.stringify([v.vie.etal,v.vie.troc])===${JSON.stringify(etal)}&&!!marcheDe(v); })()`), 'étals, compteurs et marché relus après rechargement');
} catch (e) { ok(false, e.message); }
ok(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
await navigateur.close(); await rm(dossier, { recursive: true, force: true });
console.log(echecs ? `\nTerres Cubiques : ${echecs} problème(s).` : '\nTerres Cubiques : tout est bon.');
process.exit(echecs ? 1 : 0);
