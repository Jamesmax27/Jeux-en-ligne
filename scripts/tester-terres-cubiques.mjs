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
//   9. Les 30 bâtiments : les 24 gabarits de l'étape 7 posés bloc par bloc et reliés
//      par un chemin, sortie de la carrière, lits, écurie, scierie, bonus, meunier au
//      moulin, tour souhaitée après une attaque ; carrière creusée et bâtie par l'aide
//      de chantier d'un village sans bâtisseur, personne coincé au fond.
//  10. Familles : un enfant devient apprenti puis adulte, ancien à 60 jours, décès
//      et deuil ; mariage d'un couple sans foyer, logement voulu, emménagement,
//      naissance ; plafond atteint : des colons partent fonder un village, relu
//      après rechargement, qui prend corps à l'approche d'un joueur (abri bâti).
//  11. Dialogues : 200 répliques (15 au moins par catégorie, mêmes variables dans
//      les 5 langues) ; salutation, réaction à un bloc cassé, travail du métier,
//      chantier, ressource qui manque, famille, rumeur tirée de la mémoire d'un
//      voisin et conversation, échanges, aucune redite avant 5 autres ; les
//      villageois parlent d'eux-mêmes près du joueur, sans variable non remplie.
//  12. Le joueur et les villages : fiche et menu du villageois (Parler, Échanger,
//      Aider, Demander une tâche), prix et refus selon la réputation, matériaux
//      déposés dans un chantier, tâche livrée, bloc cassé puis réparé, vol, coup,
//      colère et attaque, fuite, attaque dès l'entrée, pardon ; réputation et tâche
//      relues après rechargement.
//  13. Caravanes : voisins connus, départ avec le surplus vers un voisin qui a ce qui
//      manque, marchand visible près du joueur, échange aux valeurs de troc, escorte
//      récompensée dans les deux villages, réplique sur la caravane, retour, relecture.
//  14. Fiche du village et carte : fiche ouverte depuis le pilier de la place, depuis un
//      villageois (et retour), contenu (habitants, métiers, chantier, réserves, manques,
//      voisins, caravanes) ; carte : couleur de la réputation, nom, caravane tracée, liste
//      des villages découverts (boutons de 44 px au moins), fiche ouverte et retour à la carte.
//  15. Sauvegarde complète et rattrapage : empreinte complète des villages identique après
//      rechargement (villages figés) ; deux jours d'absence rattrapés d'un coup (récolte sous
//      le plafond, une couche de chantier au plus, aucune recherche de chemin, réputation),
//      plafond de 3 jours, retour du joueur sans compter deux fois l'absence.
// Le jeu est servi avec une porte d'entrée de test (window.__T, ajoutée à la
// volée, jamais dans le fichier publié). Aucune erreur JavaScript permise.
// Nécessite Playwright et Chromium (ou CHROMIUM_PATH). Code de sortie 0 ou 1.
// ==========================================================================

import { readFile, writeFile, appendFile, mkdtemp, rm } from 'node:fs/promises';
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
let echecs = 0; const rates = [];
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) { echecs++; rates.push(m); } };
const cadre = () => page.frames().find((f) => f.url() === 'about:srcdoc');
const T = (c, code) => c.evaluate((k) => window.__T(k), code);
const attendre = (ms) => page.waitForTimeout(ms);
async function ouvrir(q = '') {
  await page.goto(`${BASE}/play.html?id=${ID}&lang=fr${q}`);
  for (let i = 0; i < 120; i++) { const c = cadre(); if (c && await c.evaluate(() => !!window.__T && window.__T('state') === 'title').catch(() => false)) return c; await attendre(250); }
  throw new Error('le jeu ne s\'ouvre pas dans le lanceur');
}
// « Continuer » : la fenêtre de reprise de la sauvegarde (jel-sauvegarde) peut s'ouvrir un instant après
// l'écran titre et recouvrir son bouton ; on l'attend un peu, sinon le bouton de l'écran titre, puis la fenêtre
async function continuer(c) {
  const b = c.locator('jel-sauvegarde').getByRole('button', { name: /Continuer/ });
  try { await b.first().waitFor({ state: 'visible', timeout: 3000 }); await b.first().click(); }
  catch { await c.locator('#tContinue').click({ timeout: 10000 }).catch(async () => { await b.first().click(); });
    if (await T(c, 'state') !== 'play' && await b.count()) await b.first().click().catch(() => {}); }
  await attendre(1500); }
// Attend que la vie du village avance de `secondes` (temps du village, vitesse comprise) ou que `cond`
// soit vraie, en gardant le jour ; plafond en temps réel. Le pas de chaque image est plafonné à 0,05 s :
// sur une machine lente, la simulation va moins vite et une attente fixe ne suffirait pas.
async function attendreVillage(c, vid, secondes, cond = 'false', maxMs = 240000) {
  const t0 = await T(c, `vie(VILLAGES.get(${vid})).t`), fin = Date.now() + maxMs;
  while (Date.now() < fin) { await attendre(1000); await T(c, 'time=Math.min(time,.45); P.food=20;');
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
  await T(c, "(()=>{ prefs.monsters=false; if(state==='dead') respawn(); P.food=20; P.hp=20; })()"); await attendre(500); // relevé s'il est mort plus tôt (voyage de la section 2) // une longue partie en survie : le joueur de l'essai ne doit ni mourir de faim ni des monstres
  const vid = await T(c, `(()=>{ const v=[...VILLAGES.values()].sort((a,b)=>Math.hypot(a.cx-P.x,a.cz-P.z)-Math.hypot(b.cx-P.x,b.cz-P.z))[0]; P.fly=true; P.x=v.cx+.5; P.z=v.cz+12.5; P.y=v.h0+3; loadAround(P.x,P.z); return v.id; })()`);
  await attendre(2500);
  r = await T(c, `(()=>{ const v=VILLAGES.get(${vid}); const vil=ents.filter(e=>e.type==='villager'&&e.vil===v.id); return {sim:v.sim,n:vil.length,noms:vil.every(e=>typeof e.nom==='string'&&e.nom),etat:state,bord:Math.round(Math.hypot(P.x-v.cx,P.z-v.cz)-v.R)}; })()`);
  ok(r.sim && r.n > 0 && r.noms, `à moins de 48 blocs : village simulé, ${r.n} villageois nommés${r.sim && r.noms ? "" : " — simulé " + r.sim + ", noms " + r.noms + ", état " + r.etat + ", distance au bord " + r.bord}`);
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
    return {id:v.id,jx,jy,jz,stock:JSON.stringify(vie(v).stock),arbres0:arbresAdultes(v)}; })()`);
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
  ok(plus.length >= 2, `le stock du village grandit (${plus.join(', ')})`);
  ok(r.arbres >= 15 || r.arbres >= v6.arbres0, `arbres adultes : au-dessus du seuil, ou jamais coupés sous lui (départ ${v6.arbres0}, fin ${r.arbres}, seuil 15)`);
  ok(r.champ > .6, `champ ressemé (${Math.round(r.champ * 100)} %)`);
  ok(await T(c, `(()=>{ for(let k=0;k<4;k++) if(getB(${v6.jx},${v6.jy}+k,${v6.jz})!==OAK_LOG) return false; return getB(${v6.jx}+1,${v6.jy},${v6.jz})===COBBLE&&(${pz?`isLog(getB(${pz[0]},${pz[1] + 1},${pz[2]}))`:'true'}); })()`), 'aucun bloc du joueur touché (bûches, pierre, arbre né de sa pousse)');

  console.log('7. construction (vitesse ×10)');
  // le joueur vole au-dessus du chantier, tourné vers lui (l'étiquette n'est montrée que si on la voit)
  await T(c, `window.vueSur=S=>{ const v=VILLAGES.get(${v6.id}), dx=v.cx-S.x, dz=v.cz-S.z, d=Math.hypot(dx,dz)||1, k=Math.min(14,d)/d; P.fly=true; P.x=S.x+.5+dx*k; P.z=S.z+.5+dz*k; P.y=S.g0+9; P.yaw=Math.atan2(dx,dz); P.pitch=-Math.atan2(6,Math.min(14,d)); }`);
  const cab = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); vie(v).stock.bois=150; vie(v).stock.pierre=150; const S=siteBat(v,'cabane'); if(!S) return null; vilEco(v).s=S; vie(v).planT=1e9; vueSur(S); return {x:S.x,z:S.z,g0:S.g0}; })()`);
  ok(!!cab, 'emplacement de cabane trouvé (terrain aplani de 2 blocs au plus)');
  let fini = null, etiquette = false;
  const tc = await T(c, `vie(VILLAGES.get(${v6.id})).t`), finC = Date.now() + 420000;
  while (cab && !fini && Date.now() < finC && await T(c, `vie(VILLAGES.get(${v6.id})).t`) - tc < 900) { await attendre(1000); await T(c, 'time=Math.min(time,.45)');
    const e = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), S=vilEco(v).s; return S?{lab:[...document.querySelectorAll('.chantier')].filter(b=>!b.hidden).map(b=>b.textContent)}:{bats:(vie(v).bats||[]).map(b=>b.t)}; })()`);
    if (e.lab && e.lab.some((t) => /Cabane de bûcheron · \d+ %/.test(t))) etiquette = true;
    if (e.bats) fini = e; }
  ok(etiquette, 'étiquette de progression du chantier affichée');
  const cabEtat = fini ? '' : ' — ' + await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), S=vilEco(v).s, a=aideChantier(v); return (S?S.t+' '+S.p+'/'+(S.plan?S.plan.length:0)+(S.manque?' manque '+S.manque:''):'pas de chantier')+' · temps du village '+Math.round(vie(v).t)+' s · '+(a?'aide '+a.metier:'bâtisseur '+(VILS.find(o=>o.vil===v.id&&o.metier==='batisseur')||{act:null}).act?.k); })()`);
  ok(fini && fini.bats.includes('cabane'), 'cabane terminée' + cabEtat);
  if (cab) ok(await T(c, `(()=>{ let porte=0, coffre=0; for(let dz=-3;dz<=3;dz++) for(let dx=-3;dx<=3;dx++) for(let y=${cab.g0};y<=${cab.g0}+3;y++){ const id=getB(${cab.x}+dx,y,${cab.z}+dz); if(DOORF[id]) porte++; if(id===CHEST) coffre++; } return porte>=2&&coffre>=1&&(edits.src(BK(${cab.x},${cab.g0}+3,${cab.z}))===ORIGINE.village||getB(${cab.x},${cab.g0}+3,${cab.z})===AIR); })()`), 'cabane bâtie bloc par bloc (porte, coffre), blocs notés « village »');
  const ent = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); vie(v).stock.bois=0; vie(v).stock.pierre=40; for(const e of ents) if(e.vil===v.id){ const f=ficheDe(e); if(f) f.inv={}; } const S=siteBat(v,'entrepot'); if(!S) return false; S.credit={}; vilEco(v).s=S; vueSur(S); return true; })()`);
  let pause = null;
  const tp = await T(c, `vie(VILLAGES.get(${v6.id})).t`), finP = Date.now() + 300000;
  while (ent && !pause && Date.now() < finP && await T(c, `vie(VILLAGES.get(${v6.id})).t`) - tp < 300) { await attendre(1000); await T(c, 'time=Math.min(time,.45)'); pause = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), S=vilEco(v).s; return S&&S.pauseR==='bois'?{p:S.p,enCours:S.manque==='bois',besoin:besoin(v,'bois'),lab:[...document.querySelectorAll('.chantier.pause')].filter(b=>!b.hidden).length}:null; })()`); }
  // la pause peut être brève : le bâtisseur va aussitôt chercher du bois chez un bûcheron qui en porte (étape 6)
  const pauseOk = !!pause && (!pause.enCours || (pause.besoin === 1 && pause.lab > 0));
  ok(pauseOk, 'entrepôt en pause faute de bois (besoin de bois maximal et étiquette rouge pendant la pause)' + (pauseOk ? '' : ' — ' + JSON.stringify(pause) + ' · ' + await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), S=vilEco(v).s, b=VILS.find(o=>o.vil===v.id&&metierDe(o)==='batisseur')||aideChantier(v); return (S?S.t+' '+S.p+'/'+(S.plan?S.plan.length:'?')+' manque '+S.manque+' pause '+S.pauseR+' crédit '+JSON.stringify(S.credit):'pas de chantier')+' · bois '+stockDe(v,'bois')+' pierre '+stockDe(v,'pierre')+' · '+(b?(metierDe(b)+' '+(b.act&&b.act.k)+' '+vilWant(b)+' à '+(S?Math.round(Math.hypot(b.x-S.x,b.z-S.z)):'?')+' blocs'):'personne pour bâtir'); })()`)));
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
  const prep = `(hB,sac)=>{ const v=VILLAGES.get(${v6.id}), w=vie(v), ad=VILS.filter(o=>o.vil===v.id&&!(o.baby>0)&&ficheDe(o)), A=ad.find(o=>vilWant(o)==='work')||ad[0], B=ad.find(o=>o!==A);
    w.stock.ble=0; w.stock.farine=0; for(const o of VILS) if(o.vil===v.id){ const g=ficheDe(o); if(g){ delete g.inv.ble; g.dettes={}; g.humeur=70; } }
    for(const o of VILS) if(o.vil===v.id&&o!==A){ const g=ficheDe(o); if(g&&g.metier==='meunier') g.metier='tisserand'; } /* un seul meunier : celui de l'essai */
    const fa=ficheDe(A), fb=ficheDe(B); fa.metier='meunier'; fa.inv={}; fa.humeur=60; fa.memoire=[]; fb.metier='garde'; fb.inv=sac||{ble:6}; fb.humeur=hB;
    A.act=null; A.trocT=0; A.decT=0; B.act=null; B.attendTroc=0; return {a:A.vslot,b:B.vslot}; }`;
  let tr = await T(c, `(${prep})(70)`); const n0 = await T(c, `echg(VILLAGES.get(${v6.id})).troc.n`);
  ok(await attendreVillage(c, v6.id, 900, `echg(VILLAGES.get(${v6.id})).troc.n>${n0}`, 240000), 'le meunier sans blé en obtient d\'un porteur');
  ok(await T(c, `VILLAGES.get(${v6.id}).pop.get(${tr.b}).humeur>70`), 'échange : le porteur est plus content');
  const detteOk = await attendreVillage(c, v6.id, 900, `(()=>{ const fa=VILLAGES.get(${v6.id}).pop.get(${tr.a}); return !((fa.dettes||{})[${tr.b}]>0)&&fa.memoire.some(m=>m[2]==='dette'); })()`, 240000);
  ok(detteOk, 'sac vide : dette notée, puis rendue sur la farine moulue' + (detteOk ? '' : ' — ' + await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), fa=v.pop.get(${tr.a}), A=entDe(v,${tr.a}); return 'métier '+fa.metier+' · dettes '+JSON.stringify(fa.dettes)+' · sac '+JSON.stringify(fa.inv)+' · mémoire '+JSON.stringify(fa.memoire.map(m=>[m[2],m[3]]))+' · action '+(A&&A.act&&A.act.k)+' · '+(A?vilWant(A):'absent')+' · farine '+stockDe(v,'farine')+' blé '+stockDe(v,'ble'); })()`)));
  tr = await T(c, `(${prep})(10)`); const rf0 = await T(c, `echg(VILLAGES.get(${v6.id})).troc.refus`);
  ok(await attendreVillage(c, v6.id, 900, `echg(VILLAGES.get(${v6.id})).troc.refus>${rf0}`, 240000) && await T(c, `VILLAGES.get(${v6.id}).pop.get(${tr.b}).inv.ble===6`), 'porteur de mauvaise humeur : il refuse et garde son blé');
  await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); for(const o of VILS) if(o.vil===v.id){ const g=ficheDe(o); if(g) g.humeur=70; } vie(v).stock.bois=80; vie(v).stock.pierre=80; const S=siteBat(v,'marche'); if(S){ vilEco(v).s=S; vueSur(S); } })()`);
  ok(await attendreVillage(c, v6.id, 2000, `(vie(VILLAGES.get(${v6.id})).bats||[]).some(b=>b.t==='marche')`, 240000), 'marché bâti');
  ok(await T(c, `[...VILLAGES.get(${v6.id}).pop.values()].some(f=>f.metier==='marchand')`), 'un villageois devient marchand');
  await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+14; vie(v).stock.pierre=60; })()`);
  const etalOk = await attendreVillage(c, v6.id, 900, `(echg(VILLAGES.get(${v6.id})).etal.pierre|0)>0`, 240000);
  const etalEtat = etalOk ? '' : ' — ' + await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), m=VILS.find(o=>o.vil===v.id&&o.metier==='marchand'), M=marcheDe(v), p=M&&M.pts.marchand; return 'marchand '+(m?(m.act&&m.act.k)+' · '+vilWant(m)+' · à '+Math.round(Math.hypot(m.x-p[0],m.z-p[1]))+' blocs de l\\'étal':'absent des villageois présents')+' · pierre '+stockDe(v,'pierre')+' · à ranger '+JSON.stringify(aRanger(v))+' · étals '+JSON.stringify(echg(v).etal); })()`);
  ok(etalOk, 'le marchand range le surplus de pierre sur les étals' + etalEtat);
  tr = await T(c, `(()=>{ const r=(${prep})(70,{}); echg(VILLAGES.get(${v6.id})).etal.ble=6; return r; })()`); const mk0 = await T(c, `echg(VILLAGES.get(${v6.id})).troc.marche`);
  ok(await attendreVillage(c, v6.id, 900, `echg(VILLAGES.get(${v6.id})).troc.marche>${mk0}`, 240000), 'sans porteur, le meunier prend du blé au marché');
  const etal = await T(c, `JSON.stringify([echg(VILLAGES.get(${v6.id})).etal,echg(VILLAGES.get(${v6.id})).troc])`);
  await T(c, `(async()=>{ saveNow(); await saving; })()`);
  c = await ouvrir('&debug=1'); await attendre(800);
  ok(await T(c, `(()=>{ const ci=Math.floor((${v6.id}-1000)/256), cj=(${v6.id}-1000)%256, inf=villageInfo(ci,cj); for(let a=-3;a<=3;a++) for(let b=-3;b<=3;b++) ensureChunk((inf.cx>>4)+a,(inf.cz>>4)+b); const v=VILLAGES.get(${v6.id}); return !!v&&!!v.vie&&JSON.stringify([v.vie.etal,v.vie.troc])===${JSON.stringify(etal)}&&!!marcheDe(v); })()`), 'étals, compteurs et marché relus après rechargement');

  console.log('9. les 30 bâtiments');
  await continuer(c);
  await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); for(let a=-4;a<=4;a++) for(let b=-4;b<=4;b++) ensureChunk((v.cx>>4)+a,(v.cz>>4)+b); P.fly=true; P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+14; loadAround(P.x,P.z); time=.08; DBG.vitesse=10; prefs.monsters=false; vilEco(v).s=null; vie(v).planT=1e9; })()`);
  ok(await attendreVillage(c, v6.id, 1e9, `VILLAGES.get(${v6.id}).sim===true`, 30000), 'village simulé');
  const gab = await T(c, `Object.entries(GABARITS).filter(([t,g])=>!g.couches.every(c=>c.length===g.d&&c.every(l=>l.length===g.w))||!ROLE_BAT[t]).map(([t])=>t)`);
  ok(gab.length === 0 && await T(c, 'Object.keys(GABARITS).length') === 30, `30 gabarits aux bonnes dimensions, chacun avec son rôle${gab.length ? ' — fautifs : ' + gab.join(', ') : ''}`);
  const poses = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), out=[]; for(const t of ['abri','familiale','grande','ancien','place','scierie','carriere','tailleur','mine','forge','four','grange','ecurie','moulin','boulangerie','peche','potier','tisserand','magasin','auberge','eglise','ecole','mairie','tour']){
      if(t==='peche'&&!pointPeche(v)) continue; const S=siteBat(v,t); if(!S){ out.push([t,0,0,null]); continue; } planBat(v,S); let n=0; for(const it of S.plan){ if(poserBat(v,S,it)){ n++; continue; } for(const o of ents) if(!o.puppet&&!(o.dead>0)&&Math.abs(o.x-it[0]-.5)<1.6&&Math.abs(o.z-it[2]-.5)<1.6){ o.x=v.cx+.5; o.z=v.cz+.5; o.y=v.h0+1.05; o.vx=o.vz=0; } if(poserBat(v,S,it)) n++; } chantierFini(v,S,null);
      const O=porteBat(v,batsDe(v,t)[0]); let ch; for(let k=0;k<40&&ch===undefined;k++){ cheminsCeTick=0; ch=chercherChemin(Math.floor(v.cx+v.ps+1),v.h0+1,Math.floor(v.cz),O[0],O[1],1); } out.push([t,n,S.plan.length,!!ch]); }
    return out; })()`);
  const places = poses.filter((p) => p[2] > 0);
  // 24 bâtiments posés d'un coup autour d'un même village : quelques portes peuvent se retrouver isolées
  // (le métier retombe alors sur l'atelier de la place) ; en jeu, ils viennent un à un, chacun avec son chemin
  // (selon le monde tiré, jusqu'à 4 portes isolées vues : 5 tolérées sur 24)
  ok(places.length >= poses.length - 3 && places.every((p) => p[1] === p[2]) && places.filter((p) => !p[3]).length <= 5, `${places.length} bâtiments sur ${poses.length} posés en entier (villageois ou animal qui gêne poussé dehors), ${places.filter((p) => p[3]).length} reliés par un chemin${poses.filter((p) => !p[3] || p[1] < p[2]).map((p) => ' · ' + p[0] + (p[2] ? ' ' + p[1] + '/' + p[2] + (p[3] ? '' : ' sans chemin') : ' sans place')).join('')}`);
  ok(await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), b=batsDe(v,'carriere')[0]; if(!b) return true; const m=cellBat(GABARITS.carriere,orienter(v,b.x,b.z),b.x,b.z,3,3), O=porteBat(v,b); let p; for(let k=0;k<40&&p===undefined;k++){ cheminsCeTick=0; p=chercherChemin(m[0],b.g0-2,m[1],O[0],O[1],1); } return !!p; })()`), 'on sort du fond de la carrière');
  const ef = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), a=t=>batsDe(v,t).length>0; return {lits:litsBats(v),attendus:batsDe(v,'abri').length*2+batsDe(v,'familiale').length*4+batsDe(v,'grande').length*6+batsDe(v,'ancien').length*2,
    anim:capAnimaux(v)-VIL_ECO.animaux,ecurie:a('ecurie'),planche:coutBlocV(v,OAK_PLANKS)[1],scierie:a('scierie'),pierre:bonusRes(v,'pierre'),carriere:a('carriere')}; })()`);
  ok(ef.lits === ef.attendus && ef.lits > 0, `lits des logements comptés (${ef.lits})`);
  ok((!ef.ecurie || ef.anim === 4) && (!ef.scierie || ef.planche === .25) && (!ef.carriere || ef.pierre === .5), 'écurie (+4 animaux), scierie (planches à moitié prix), carrière (bonus de pierre)');
  const meu = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); if(!pointBat(v,'moulin')) return null; const ad=VILS.filter(o=>o.vil===v.id&&!(o.baby>0)&&ficheDe(o)), A=ad.find(o=>vilWant(o)==='work')||ad[0]; ficheDe(A).metier='meunier'; ficheDe(A).inv={}; vie(v).stock.ble=30; A.act=null; A.decT=0; A.trocT=0; return A.vslot; })()`);
  const meuOk = meu === null || await attendreVillage(c, v6.id, 900, `(()=>{ const v=VILLAGES.get(${v6.id}), A=VILS.find(o=>o.vil===v.id&&o.vslot===${meu}), O=pointBat(v,'moulin'); return !!A&&!!A.act&&A.act.k==='transformer'&&Math.hypot(A.x-O[0]-.5,A.z-O[1]-.5)<2; })()`, 180000);
  ok(meuOk, 'le meunier moud devant le moulin' + (meuOk ? '' : ' — ' + await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), A=VILS.find(o=>o.vil===v.id&&o.vslot===${meu}), O=pointBat(v,'moulin'); return A?('action '+(A.act&&A.act.k)+(A.act&&A.act.sansBat?' (atelier inaccessible)':'')+' · '+vilWant(A)+' · à '+Math.round(Math.hypot(A.x-O[0],A.z-O[1]))+' blocs du moulin · blé '+stockDe(v,'ble')+' · métier '+metierDe(A)):'absent'; })()`)));
  ok(await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), b=v.vie.bats; v.vie.bats=b.filter(x=>x.t!=='tour'); v.vie.attaque=1; const ok=souhaits(v).includes('tour'); v.vie.bats=b; return ok; })()`), 'après une attaque, le planificateur veut une tour de guet');
  const car = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); v.vie.bats=v.vie.bats.filter(b=>b.t!=='carriere'); vie(v).stock.pierre=200; vie(v).stock.bois=100;
    for(const o of VILS) if(o.vil===v.id&&o.metier==='batisseur'){ ficheDe(o).metier='tisserand'; o.act=null; } const S=siteBat(v,'carriere'); if(!S) return null; vilEco(v).s=S; return {x:S.x,z:S.z,g0:S.g0}; })()`);
  const carOk = !car || await attendreVillage(c, v6.id, 4000, `batsDe(VILLAGES.get(${v6.id}),'carriere').length>0&&!vilEco(VILLAGES.get(${v6.id})).s`, 300000);
  const carEtat = carOk ? '' : ' — ' + await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), S=vilEco(v).s, a=aideChantier(v); return S?S.t+' '+S.p+'/'+(S.plan?S.plan.length:0)+(S.manque?' manque '+S.manque:'')+' · aide '+(a?a.metier+' '+(a.act&&a.act.k)+' à '+Math.round(Math.hypot(a.x-S.x,a.z-S.z))+' blocs':'aucune'):'pas de chantier'; })()`);
  ok(carOk, 'sans bâtisseur, l\'aide de chantier creuse et bâtit une carrière' + (car ? '' : ' (pas de place : essai sauté)') + carEtat);
  ok(!car || await attendreVillage(c, v6.id, 300, `!VILS.some(o=>o.vil===${v6.id}&&o.y<${car ? car.g0 : 0}-1.5&&Math.hypot(o.x-${car ? car.x : 0},o.z-${car ? car.z : 0})<4)`, 90000), 'personne ne reste coincé au fond (l\'aide remonte par l\'escalier)');

  console.log('10. familles, naissances, nouveaux villages');
  const V = `VILLAGES.get(${v6.id})`;
  await T(c, `(()=>{ const v=${V}; P.fly=true; P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+14; vilEco(v).s=null; vie(v).planT=1e9; vie(v).stock.pain=80; for(const f of v.pop.values()) if(vivant(f)) f.humeur=70; })()`);
  ok(await attendreVillage(c, v6.id, 1e9, `VILS.filter(o=>o.vil===${v6.id}&&!(o.baby>0)&&ficheDe(o)&&vivant(ficheDe(o))).length>=4`, 30000), '4 adultes au moins');
  const k = await T(c, `(()=>{ const v=${V}, e=VILS.filter(o=>o.vil===v.id&&!(o.baby>0)&&ficheDe(o)&&vivant(ficheDe(o)))[0], f=ficheDe(e); f.age='enfant'; f.metier=null; e.baby=.01; return e.vslot; })()`);
  ok(await attendreVillage(c, v6.id, 1e9, `(()=>{ const f=${V}.pop.get(${k}), e=entDe(${V},${k}); return f.age==='ado'&&!!f.metier&&!!e&&e.ado&&e.sc===.8; })()`, 30000), 'un enfant qui grandit devient apprenti (adolescent, métier, plus petit)');
  ok(await T(c, `(()=>{ const v=${V}, f=v.pop.get(${k}); f.adoDepuis=jourJeu-2; vieFamille(v); const a=f.age==='adulte'; f.naissance=jourJeu-61; vieFamille(v); return a&&f.age==='ancien'; })()`), 'puis adulte au bout d\'un jour, et ancien à 60 jours');
  const dc = await T(c, `(()=>{ const v=${V}, p=VILS.filter(o=>o.vil===v.id&&!(o.baby>0)&&ficheDe(o)&&vivant(ficheDe(o))&&o.vslot!==${k})[0], f=v.pop.get(${k}); f.famille.enfants.push(p.vslot); ficheDe(p).famille.parents=[${k}]; f.naissance=jourJeu-200; vieFamille(v); return {p:p.vslot,mort:Number.isFinite(f.mort)}; })()`);
  ok(dc.mort && await attendreVillage(c, v6.id, 1e9, `!entDe(${V},${k})&&${V}.pop.get(${dc.p}).memoire.some(m=>m[2]==='deuil')`, 20000), 'un ancien meurt : il quitte la scène, deuil chez son enfant');
  const mar = await T(c, `(()=>{ const v=${V}, ad=VILS.filter(o=>o.vil===v.id&&!(o.baby>0)&&ficheDe(o)&&vivant(ficheDe(o))).slice(0,4); for(const o of ad){ const f=ficheDe(o); f.famille.conjoint=null; f.famille.parents=[]; f.age='adulte'; f.naissance=jourJeu-30; delete f.sansFoyer; }
    for(const [s2,f] of v.pop) if(!ad.some(o=>o.vslot===s2)&&vivant(f)&&!Number.isInteger(f.famille.conjoint)) f.famille.conjoint=s2;
    const a=ad[0], b=ad[1], t=ad[2]; ficheDe(b).maison=ficheDe(a).maison=ficheDe(t).maison=a.house; b.house=t.house=a.house; for(const o of ad.slice(2)) ficheDe(o).famille.conjoint=o.vslot;
    VIE_FAMILLE.mariage=1; vieFamille(v); VIE_FAMILLE.mariage=.35; const fa=ficheDe(a); return {a:a.vslot,c:fa.famille.conjoint,sf:fa.sansFoyer!==undefined,veut:souhaits(v)[0],plein:v.houses.length>=PLAFOND_MAISONS}; })()`);
  ok(Number.isInteger(mar.c) && mar.sf && (['maison', 'familiale', 'grande', 'ancien'].includes(mar.veut) || mar.plein), `mariage ; le couple vit chez un autre adulte : sans foyer, le planificateur veut un logement (${mar.plein ? 'plafond de logements atteint : les colons partiront' : mar.veut})`);
  const em = await T(c, `(()=>{ const v=${V}, fa=v.pop.get(${mar.a}), fb=v.pop.get(fa.famille.conjoint); for(const g of v.pop.values()) if(g!==fa&&g!==fb) delete g.sansFoyer; const S=siteBat(v,'familiale'); if(!S) return null; planBat(v,S); for(const it of S.plan){ if(!poserBat(v,S,it)){ for(const o of ents) if(!o.puppet&&!(o.dead>0)&&Math.abs(o.x-it[0]-.5)<1.6&&Math.abs(o.z-it[2]-.5)<1.6){ o.x=v.cx+.5; o.z=v.cz+.5; o.y=v.h0+1.05; } poserBat(v,S,it); } } chantierFini(v,S,null);
    const hi=v.houses.length-1, f=v.pop.get(${mar.a}); return {ok:f.maison===hi&&entDe(v,${mar.a}).house===hi&&f.sansFoyer===undefined&&v.houses[hi].lits===4}; })()`);
  ok(!em || em.ok, 'maison familiale bâtie : le couple y emménage (4 lits)' + (em ? '' : ' (pas de place : essai sauté)'));
  const nNaiss = await T(c, `${V}.pop.size`);
  await T(c, `(()=>{ const v=${V}; vie(v).stock.pain=80; vie(v).naissT=-1e9; for(const f of v.pop.values()) delete f.dernNaiss; })()`);
  ok(!em || await attendreVillage(c, v6.id, 1e9, `${V}.pop.size>${nNaiss}&&[...${V}.pop.values()].some(f=>f.age==='enfant'&&f.famille.parents.includes(${mar.a}))`, 90000), 'le couple a un enfant');
  let col = null;
  for (let i = 0; i < 5 && !col; i++) col = await T(c, `(()=>{ const v=${V}; VIE_FAMILLE.plafond.village=VIE_FAMILLE.plafond.ville=2; vie(v).colonieJour=undefined; vie(v).stock.pain=80; const nv=fonderVillage(v); VIE_FAMILLE.plafond.village=18; VIE_FAMILLE.plafond.ville=26;
    return nv?{id:nv.id,n:nv.pop.size,cx:nv.cx,cz:nv.cz,d:Math.round(Math.hypot(nv.cx-v.cx,nv.cz-v.cz)),partis:[...v.pop.values()].filter(f=>f.parti===nv.id).length}:null; })()`);
  ok(!!col && col.n >= 2 && col.n <= 4 && col.partis === col.n, col ? `plafond atteint : ${col.n} colons partent fonder un village à ${col.d} blocs` : 'plafond atteint : aucun terrain plat trouvé à 100-170 blocs');
  if (col) {
    ok(await attendreVillage(c, v6.id, 1e9, `!VILS.some(o=>o.vil===${v6.id}&&o.colon)`, 120000), 'les colons s\'en vont et quittent la scène');
    await T(c, `(async()=>{ saveNow(); await saving; })()`);
    c = await ouvrir('&debug=1'); await continuer(c);
    ok(await T(c, `COLONIES.has(${col.id})&&VILLAGES.has(${col.id})&&!!VILLAGES.get(${col.id}).pop&&VILLAGES.get(${col.id}).pop.size===${col.n}`), 'le village fondé et ses colons sont relus après rechargement');
    await T(c, `(()=>{ P.fly=true; P.x=${col.cx}+.5; P.z=${col.cz}+12.5; P.y=terrain(${col.cx},${col.cz})+14; loadAround(P.x,P.z); time=.08; DBG.vitesse=10; prefs.monsters=false; })()`);
    const prend = await attendreVillage(c, v6.id, 1e9, `(()=>{ const nv=VILLAGES.get(${col.id}); return nv.active&&nv.houses.length>0&&ents.filter(e=>e.vil===${col.id}&&e.type==='villager').length===${col.n}; })()`, 90000).catch(() => false)
      || await T(c, `(()=>{ const nv=VILLAGES.get(${col.id}); return nv.active&&nv.houses.length>0&&ents.filter(e=>e.vil===${col.id}&&e.type==='villager').length===${col.n}; })()`);
    ok(prend, 'un joueur approche : il prend corps (abri de fondation, colons)');
    ok(prend && await attendreVillage(c, `${col.id}`, 2000, `(()=>{ const nv=VILLAGES.get(${col.id}), S=vilEco(nv).s; return batsDe(nv,'abri').length>0||(!!S&&S.t==='abri'&&S.p>10); })()`, 240000), 'les colons bâtissent l\'abri de fondation');
  }

  console.log('11. dialogues');
  { const V = `VILLAGES.get(${v6.id})`;
  await T(c, `(()=>{ const v=${V}; for(let a=-4;a<=4;a++) for(let b=-4;b<=4;b++) ensureChunk((v.cx>>4)+a,(v.cz>>4)+b); P.fly=true; P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+6; P.pitch=-.5; loadAround(P.x,P.z); time=.08; DBG.vitesse=10; prefs.monsters=false; vilEco(v).s=null; vie(v).planT=1e9; })()`);
  ok(await attendreVillage(c, v6.id, 1e9, `${V}.sim&&VILS.filter(o=>o.vil===${v6.id}&&!(o.baby>0)&&ficheDe(o)&&vivant(ficheDe(o))).length>=4`, 40000), 'village simulé');
  const D = await T(c, `(()=>{ const v=${V}; for(const o of VILS) if(o.vil===v.id&&!(o.baby>0)){ const g=ficheDe(o); if(g&&vivant(g)&&g.age!=='enfant') g.age='adulte'; } const ad=VILS.filter(o=>o.vil===v.id&&!(o.baby>0)&&ficheDe(o)&&vivant(ficheDe(o))&&ficheDe(o).age==='adulte'); return ad.slice(0,6).map(o=>o.vslot); })()`);
  ok(D.length >= 4, `4 adultes au moins pour parler (${D.length})`);
  const dit = (slot, code) => T(c, `(()=>{ const v=${V}, e=entDe(v,${slot}); e.say=null; const ok=(${code}); const k=e.say&&e.say.k, t=k?traduire(k,e.say.v||undefined):''; return {ok,k,t}; })()`);
  const propre = (r) => !!r.t && !/[{}]/.test(r.t);
  // textes : chaque réplique a, dans les 5 langues, exactement les variables qu'elle attend
  const fautes = await T(c, `(()=>{ const D=JSON.parse(document.getElementById('jel-i18n-textes').textContent), out=[]; const vs=t=>[...new Set([...(t||'').matchAll(/\\{(\\w+)\\}/g)].map(m=>m[1]))].sort().join();
    for(const r of REPLIQUES) for(const l in D){ const t=D[l][r[2]]; if(!t||vs(t)!==r[3].slice().sort().join()) out.push(l+':'+r[2]); } const cats={}; for(const r of REPLIQUES) cats[r[1].c]=(cats[r[1].c]||0)+1; return {out,cats}; })()`);
  ok(fautes.out.length === 0 && Object.entries(fautes.cats).every(([k, n]) => n >= 15), `200 répliques, 15 au moins par catégorie, variables identiques dans les 5 langues${fautes.out.length ? ' — ' + fautes.out.slice(0, 4).join(', ') : ''}`);
  // salutation d'un inconnu, puis réaction à un bloc cassé
  await T(c, `(()=>{ const v=${V}; v.dlgRec=[]; const f=v.pop.get(${D[0]}); f.vu=0; f.vuT=-9; vie(v).joueur={}; })()`);
  let r = await dit(D[0], 'saluer(e)');
  ok(r.ok && /^dlg\.salut\./.test(r.k) && propre(r) && await T(c, `${V}.pop.get(${D[0]}).vu===1`), `salutation : « ${r.t} »`);
  await T(c, `noterJoueur(${V},'casse')`);
  r = await dit(D[0], 'saluer(e)');
  ok(r.ok && /^dlg\.joueur\.[5-8]$/.test(r.k) && propre(r), `après un bloc cassé : « ${r.t} »`);
  // travail propre au métier et à l'action
  r = await dit(D[1], `(()=>{ const f=ficheDe(e); f.metier='bucheron'; e.act={k:'couper',d:null,phase:0,t:0}; const ok=dire(e,['travail']); e.act=null; return ok; })()`);
  ok(r.ok && r.k === 'dlg.travail.1' && /\d/.test(r.t) && propre(r), `bûcheron qui coupe : « ${r.t} »`);
  r = await dit(D[1], `(()=>{ const f=ficheDe(e); f.metier='meunier'; e.act={k:'transformer',d:null,phase:0,t:0}; const ok=dire(e,['travail']); e.act=null; return ok; })()`);
  ok(r.ok && r.k === 'dlg.travail.12' && propre(r), `meunier qui moud : « ${r.t} »`);
  // chantier : bâtiment et progression réels, matériau qui manque
  r = await dit(D[2], `(()=>{ const v=vilV(e), S=siteBat(v,'cabane'); if(!S) return false; planBat(v,S); S.p=Math.round(S.plan.length*.5); S.manque='pierre'; vilEco(v).s=S; e.act={k:'construire',d:null,phase:0,t:0}; const ok=dire(e,['chantier']); e.act=null; return ok; })()`);
  const pct = await T(c, `(()=>{ const S=vilEco(${V}).s; return S?Math.round(S.p/S.plan.length*100):-1; })()`);
  ok(r.ok && /^dlg\.chantier\./.test(r.k) && propre(r) && (r.t.includes(String(pct)) || r.t.includes('pierre') || r.k === 'dlg.chantier.4'), `chantier à ${pct} % : « ${r.t} »`);
  await T(c, `(()=>{ vilEco(${V}).s=null; })()`);
  // ressource qui manque vraiment
  r = await dit(D[3], `(()=>{ const f=ficheDe(e); f.metier='batisseur'; e.act={k:'attendre',d:'bois',phase:0,t:0}; e.dbg={manque:'bois'}; const ok=dire(e,['manque']); e.act=null; return ok; })()`);
  ok(r.ok && r.k === 'dlg.manque.5' && r.t.includes('bois') && propre(r), `il manque du bois : « ${r.t} »`);
  // famille : naissance
  r = await dit(D[3], `(()=>{ e.act=null; e.dbg=null; ficheDe(e).memoire=[]; souvenir(e,'naissance',{enfant:'Zoé'}); return dire(e,['famille']); })()`);
  ok(r.ok && /^dlg\.famille\.[12]$/.test(r.k) && r.t.includes('Zoé'), `naissance : « ${r.t} »`);
  // rumeur tirée de la mémoire d'un voisin, puis réponse du même ton et au revoir
  const nomV = await T(c, `(()=>{ const v=${V}; for(const o of VILS) if(o.vil===v.id){ const g=ficheDe(o); if(g) g.memoire=[]; } const e=entDe(v,${D[D.length - 1]}); souvenir(e,'mariage',{avec:'Lou'}); return ficheDe(e).nom; })()`);
  const conv = await T(c, `(()=>{ const v=${V}, a=entDe(v,${D[1]}), b=entDe(v,${D[0]}), cv={turn:0,n:4}, out=[]; for(;cv.turn<4;cv.turn++){ const sp=cv.turn%2?b:a; sp.say=null; const ok=replique2(sp,cv,cv.turn===3); out.push([ok,sp.say&&sp.say.k,sp.say?traduire(sp.say.k,sp.say.v||undefined):'']); } return out; })()`);
  ok(conv.every((x) => x[0]) && conv[0][1] === 'dlg.rumeur.1' && conv[0][2].includes(nomV) && /^dlg\.reponse\.[1-4]$/.test(conv[1][1]) && /^dlg\.reponse\.1[2-5]$/.test(conv[3][1]),
    `conversation : ${conv.map((x) => '« ' + x[2] + ' »').join(' / ')}`);
  // échange : demande et refus pour dette, avec les répliques de la banque
  r = await dit(D[1], `dire(e,['echange'],{role:'demande',vars:{r:nomRes('ble'),voisin:'Lou'}})`);
  ok(r.ok && ['dlg.echange.2', 'dlg.echange.3', 'troc.demande'].includes(r.k) && r.t.includes('blé') && propre(r), `demande d'échange : « ${r.t} »`);
  r = await dit(D[2], `dire(e,['echange'],{role:'refus',raison:'dette',vars:{voisin:'Lou'}})`);
  ok(r.ok && r.k === 'troc.refusDette', `refus pour dette : « ${r.t} »`);
  // pas de répétition avant 5 autres (8 répliques équivalentes)
  const rep = await T(c, `(()=>{ const v=${V}, e=entDe(v,${D[0]}); v.dlgRec=[]; const n0=REPLIQUES.length; for(let i=0;i<8;i++) REPLIQUES.push(['essai.'+i,{c:'essai'},'dlg.humeur.13',[]]); const l=[]; for(let i=0;i<12;i++){ dire(e,['essai']); l.push(e.dlgDernier[0]); } REPLIQUES.length=n0; return l; })()`);
  ok(rep.every((k, i) => !rep.slice(Math.max(0, i - 5), i).includes(k)), `aucune réplique redite avant 5 autres (${rep.join(' ')})`);
  // conversations seulement près d'un joueur ; aucun texte à trous à l'écran
  ok(await T(c, `DLG.proche===16`), 'bavardages et répliques de travail à moins de 16 blocs d’un joueur');
  ok(await attendreVillage(c, v6.id, 1e9, `VILS.some(o=>o.vil===${v6.id}&&o.say&&typeof o.say.k==='string'&&o.say.k.startsWith('dlg.'))`, 120000), 'près du joueur, les villageois parlent d\'eux-mêmes');
  ok(await T(c, `[...document.querySelectorAll('#bulles .bulle')].filter(b=>!b.hidden).every(b=>!/[{}]/.test(b.textContent))`), 'aucune bulle avec une variable non remplie');
  }

  console.log('12. le joueur et les villages');
  { const V = `VILLAGES.get(${v6.id})`, VID = v6.id;
  await T(c, `(()=>{ const v=${V}; P.fly=true; P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+6; loadAround(P.x,P.z); time=.08; DBG.vitesse=10; prefs.monsters=false; vilEco(v).s=null; vie(v).planT=1e9; })()`);
  ok(await attendreVillage(c, v6.id, 1e9, `${V}.sim&&VILS.some(o=>o.vil===${v6.id}&&!(o.baby>0)&&ficheDe(o)&&vivant(ficheDe(o))&&ficheDe(o).age==='adulte')`, 40000), 'village simulé');
  const A = await T(c, `(()=>{ const v=${V}; for(const o of VILS) if(o.vil===v.id&&!(o.baby>0)){ const g=ficheDe(o); if(g&&vivant(g)&&g.age!=='enfant') g.age='adulte'; } const e=VILS.find(o=>o.vil===v.id&&!(o.baby>0)&&ficheDe(o)&&vivant(ficheDe(o))&&ficheDe(o).age==='adulte'); rel(v).rep=0; rel(v).actes=0; rel(v).colere=0; rel(v).reparer=[]; rel(v).quete=null; P.hp=20; return e.vslot; })()`);
  const ouvrirFiche = () => T(c, `(()=>{ const v=${V}, e=entDe(v,${A}); openVillageois(e); return state; })()`);
  const cliquer = async (txt) => { await c.locator('#bagBody .vbtn', { hasText: txt }).first().click(); await attendre(300); };
  ok(await ouvrirFiche() === 'bag' && await c.locator('#bagBody .vfiche').count() === 1 && (await c.locator('#bTitle').innerText()).trim() === (await T(c, `ficheDe(entDe(${V},${A})).nom`)) && await c.locator('#bagBody .vmenu .vbtn').count() === 5, 'toucher un villageois ouvre sa fiche et le menu (4 boutons et « Le village »)');
  const ficheTxt = await c.locator('#bagBody .vfiche').innerText();
  ok(/Famille/.test(ficheTxt) && /En ce moment/.test(ficheTxt) && /Humeur/.test(ficheTxt) && /réputation/.test(ficheTxt), 'fiche : âge, métier, famille, action, humeur, réputation');
  await cliquer('Parler');
  ok(!/[{}]/.test(await c.locator('#bagBody .vquote').innerText()), 'Parler : le villageois répond (« ' + (await c.locator('#bagBody .vquote').innerText()).replace(/[«»]/g, '').trim() + ' »)');
  // échanges : prix selon la réputation, refus en dessous du palier
  ok(await T(c, `(()=>{ const v=${V}; rel(v).rep=-15; const a=prixPour(v,4); rel(v).rep=40; const b=prixPour(v,4); rel(v).rep=0; return a===6&&b===3&&prixPour(v,4)===4; })()`), 'prix : plus chers si la réputation est mauvaise, moins chers si elle est excellente');
  await T(c, `rel(${V}).rep=-30`); await cliquer('Échanger');
  ok(/ne veulent plus commercer/.test(await c.locator('#bagBody').innerText()), 'réputation très basse : plus d’échange');
  await T(c, `rel(${V}).rep=0`); await cliquer('Parler'); await cliquer('Échanger');
  ok(await c.locator('#bagBody .rec').count() >= 3, 'Échanger : la table de troc du villageois');
  // aider : matériaux déposés dans le chantier
  const aide = await T(c, `(()=>{ const v=${V}, S=siteBat(v,'cabane'); if(!S) return null; vilEco(v).s=S; vie(v).planT=1e9; addItem(OAK_LOG,20,true); return {bois:haveOf('logs'),rep:rel(v).rep}; })()`);
  if (aide) { await cliquer('Aider'); await c.locator('#bagBody .rec .cbtn').first().click(); await attendre(300);
    const ap = await T(c, `(()=>{ const v=${V}, S=vilEco(v).s; return {credit:(S.credit&&S.credit.bois)|0,bois:haveOf('logs'),rep:rel(v).rep}; })()`);
    ok(ap.credit === 16 && ap.bois === aide.bois - 16 && ap.rep > aide.rep, `Aider : 16 bûches déposées dans le chantier, réputation +${ap.rep - aide.rep}`); }
  // tâche : une ressource qui manque vraiment, livrée contre une récompense
  await T(c, `(()=>{ const v=${V}; vilEco(v).s=null; vie(v).stock.ble=0; vie(v).stock.pain=60; vie(v).stock.bois=80; rel(v).quete=null; })()`);
  await cliquer('Demander une tâche');
  const q = await T(c, `(()=>{ const q=rel(${V}).quete; return q?{r:q.r,n:q.n,obj:objetRecu(q.objet),rec:objetRecu(q.recompense[0]),m:q.recompense[1]}:null; })()`);
  ok(!!q && /Apporte-moi/.test(await c.locator('#bagBody').innerText()), q ? `tâche : apporter ${q.n} (${q.r}), récompense ${q.m}` : 'tâche : aucune');
  if (q) { const av = await T(c, `(()=>{ addItem(${q.obj},${q.n},true); renderBag(); return {stock:stockDe(${V},'${q.r}'),rec:inv[${q.rec}]|0,rep:rel(${V}).rep}; })()`);
    await c.locator('#bagBody .rec .cbtn').first().click(); await attendre(300);
    const ap = await T(c, `({stock:stockDe(${V},'${q.r}'),rec:inv[${q.rec}]|0,rep:rel(${V}).rep,q:rel(${V}).quete})`);
    ok(ap.stock === av.stock + q.n && ap.rec >= av.rec + q.m - (q.obj === q.rec ? q.n : 0) && ap.rep >= av.rep + 12 && !ap.q, 'tâche livrée : stock du village, récompense, réputation +12'); }
  await T(c, `setState('play')`);
  // un bloc d'une maison cassé : réputation, avertissement, puis réparation par les villageois
  const blk = await T(c, `(()=>{ const v=${V}; rel(v).rep=0; rel(v).actes=0; for(const h of v.houses){ for(let x=h.x0;x<=h.x1;x++) for(let z=h.z0;z<=h.z1;z++) for(let y=v.h0+1;y<v.h0+5;y++){ const id=getB(x,y,z); if(id!==AIR&&SOLID[id]&&!DOORF[id]&&id!==BED&&id!==CHEST&&!blocJoueur(x,y,z)) return {x,y,z,id}; } } return null; })()`);
  if (blk) { await T(c, `breakBlock({x:${blk.x},y:${blk.y},z:${blk.z},id:${blk.id}})`);
    const r = await T(c, `({rep:rel(${V}).rep,actes:rel(${V}).actes,rep2:rel(${V}).reparer.length,colere:rel(${V}).colere})`);
    ok(r.rep === -6 && r.actes === 1 && r.rep2 === 1 && !r.colere, 'bloc d’une maison cassé : réputation -6, premier acte (avertissement, pas encore de colère), bloc à réparer');
    await T(c, `(()=>{ const v=${V}; vie(v).planT=0; vie(v).stock.bois=80; vie(v).stock.pierre=80; P.x=v.cx+.5; P.z=v.cz+.5; })()`);
    ok(await attendreVillage(c, VID, 600, `getB(${blk.x},${blk.y},${blk.z})===${blk.id}`, 120000), 'les villageois reconstruisent le bloc cassé (chantier « Réparations »)'); }
  // vol dans un coffre du village
  const vol = await T(c, `(()=>{ const v=${V}; let idx=null; for(const k of GENCH.keys()){ const x=KX(k), z=KZ(k); if(villageDe(x,z)===v){ idx=k; break; } } if(idx===null){ for(const h of v.houses) for(let x=h.x0;x<=h.x1&&idx===null;x++) for(let z=h.z0;z<=h.z1&&idx===null;z++) for(let y=v.h0+1;y<v.h0+4;y++) if(getB(x,y,z)===CHEST){ idx=I(x,y,z); break; } }
    if(idx===null) return null; const a=rel(v).rep; coffreVol=null; coffrePris(idx); coffrePris(idx); return {d:rel(v).rep-a}; })()`);
  ok(!vol || vol.d === -10, vol ? 'vol dans un coffre du village : réputation -10 (une fois par coffre ouvert)' : 'pas de coffre dans ce village (essai du vol sauté)');
  // frapper un villageois : colère, les gardes et les adultes attaquent jusqu'à la fuite
  await T(c, `(()=>{ const v=${V}, e=entDe(v,${A}); rel(v).rep=0; rel(v).colere=0; P.fly=false; P.x=v.cx+2.5; P.z=v.cz+.5; P.y=v.h0+1.05; P.vx=P.vy=P.vz=0; /* au sol, sur la place (pas sur un toit) */ P.hp=20; invul=0; damageEnt(e,2,'player'); })()`);
  ok(await T(c, `rel(${V}).colere===1&&rel(${V}).rep<=-15`), 'frapper un villageois : réputation -15, le village se met en colère');
  const attaque = await attendreVillage(c, VID, 300, `P.hp<20`, 60000);
  ok(attaque, 'les villageois attaquent le joueur fautif' + (attaque ? '' : ' — ' + await T(c, `(()=>{ const v=${V}; return 'colère '+rel(v).colere+' · état '+state+' · mode '+mode+' · sim '+v.sim+' · '+VILS.filter(o=>o.vil===v.id).map(o=>{ const g=ficheDe(o); return (g?g.age:'?')+'/'+(o.act&&o.act.k)+'/'+o.goal+'/'+Math.round(Math.hypot(o.x-P.x,o.z-P.z))+(o.ko?'/ko':''); }).join(' '); })()`)));
  await T(c, `(()=>{ const v=${V}; P.fly=true; P.hp=20; P.x=v.cx+v.R+v.BL+40; P.y=v.h0+20; })()`); await attendre(1500);
  ok(await T(c, `rel(${V}).colere===0`), 'le joueur s’enfuit hors du village : la colère cesse');
  await T(c, `(()=>{ const v=${V}; rel(v).rep=-80; P.x=v.cx+.5; P.z=v.cz+.5; })()`); await attendre(1500);
  ok(await T(c, `rel(${V}).colere===1`), 'réputation très basse : attaqué dès l’entrée au village');
  ok(await T(c, `(()=>{ const v=${V}; rel(v).colere=0; rel(v).rep=-30; pardonJour(v); const a=rel(v).rep; rel(v).rep=0; pardonJour(v); return a===-26&&rel(v).rep===0; })()`), 'pardon : la réputation remonte chaque jour vers 0');
  await T(c, `(()=>{ const v=${V}; rel(v).rep=-12; rel(v).actes=3; rel(v).quete={r:'ble',n:6,objet:WHEAT,recompense:[BREAD,3,'pain'],de:'Lou',jour:jourJeu}; P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+6; })()`);
  await T(c, `(async()=>{ saveNow(); await saving; })()`);
  c = await ouvrir('&debug=1'); await attendre(800);
  ok(await T(c, `(()=>{ const ci=Math.floor((${VID}-1000)/256), cj=(${VID}-1000)%256, inf=villageInfo(ci,cj); for(let a=-3;a<=3;a++) for(let b=-3;b<=3;b++) ensureChunk((inf.cx>>4)+a,(inf.cz>>4)+b); const v=${V}; return !!v&&rel(v).rep===-12&&rel(v).actes===3&&!!rel(v).quete&&rel(v).quete.n===6; })()`), 'réputation, actes et tâche relus après rechargement' + await T(c, `(()=>{ const v=${V}; if(!v) return ' — village absent'; const r=rel(v); return r.rep===-12&&r.actes===3&&r.quete&&r.quete.n===6?'':' — relu : réputation '+r.rep+', actes '+r.actes+', tâche '+JSON.stringify(r.quete)+', rattrapage '+JSON.stringify(vie(v).rattrapage||null); })()`));
  }

  console.log('13. caravanes');
  { await continuer(c);
  await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); P.fly=true; P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+10; loadAround(P.x,P.z); time=.08; DBG.vitesse=10; prefs.monsters=false; if(state==='dead') respawn(); P.food=20; P.hp=20; })()`); await attendre(1500);
  // deux villages voisins : A manque de fer et a trop de bois, B a trop de fer
  const pair = await T(c, `(()=>{ for(let ci=-3;ci<=3;ci++) for(let cj=-3;cj<=3;cj++){ const inf=villageInfo(Math.floor(P.x/256)+ci,Math.floor(P.z/256)+cj); if(inf) for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++) ensureChunk((inf.cx>>4)+a,(inf.cz>>4)+b); }
    const l=[...VILLAGES.values()].filter(v=>!v.colonie); for(const a of l) for(const b of l) if(a!==b&&Math.hypot(a.cx-b.cx,a.cz-b.cz)<=CARAVANE.rayon&&Math.hypot(a.cx-b.cx,a.cz-b.cz)>=150) return {a:a.id,b:b.id,d:Math.round(Math.hypot(a.cx-b.cx,a.cz-b.cz))}; return null; })()`);
  ok(!!pair, pair ? `deux villages voisins à ${pair.d} blocs (rayon ${600})` : 'pas deux villages connus à moins de 600 blocs');
  if (pair) {
    const VA = `VILLAGES.get(${pair.a})`, VB = `VILLAGES.get(${pair.b})`;
    ok(await T(c, `voisins(${VA}).includes(${VB})&&voisins(${VB}).includes(${VA})`), 'chaque village connaît ses voisins');
    const car = await T(c, `(()=>{ const A=${VA}, B=${VB}; for(const v of [A,B]){ vie(v); if(!v.pop) v.pop=new Map(); }
      if(![...A.pop.values()].some(f=>f.metier==='marchand'&&vivant(f))) A.pop.set(900,{nom:'Lou',age:'adulte',naissance:jourJeu-30,metier:'marchand',maison:0,famille:{parents:[],conjoint:null,enfants:[]},inv:{},humeur:70,memoire:[]});
      for(const w of [vie(A),vie(B)]) for(const r in w.stock) w.stock[r]=0; vie(A).stock.bois=300; vie(B).stock.fer=60; /* seuls surplus : le bois de A, le fer de B */ vie(A).caravaneT=undefined; CARAVANES.clear();
      const c=partirCaravane(A); return c?{id:c.id,charge:JSON.stringify(c.charge),veut:c.veut,vers:c.vers,bois:stockDe(A,'bois')}:null; })()`);
    ok(!!car && car.veut === 'fer' && car.vers === pair.b && /bois/.test(car.charge), car ? `une caravane part avec son surplus (${car.charge}) chercher du fer` : 'aucune caravane');
    if (car) {
      // le marchand marche, visible près du joueur, et répond quand on lui parle
      await T(c, `(()=>{ const k=CARAVANES.get(${car.id}); k.duree=.04; const p=posCaravane(k); P.fly=true; P.x=p.x; P.z=p.z+6; P.y=terrain(Math.floor(p.x),Math.floor(p.z))+8; loadAround(P.x,P.z); })()`);
      ok(await attendreVillage(c, pair.a, 1e9, `(()=>{ const k=CARAVANES.get(${car.id}), p=k&&posCaravane(k); if(p){ P.x=p.x; P.z=p.z+6; } return !!k&&!!k.ent&&ents.includes(k.ent); })()`, 30000), 'près du joueur, on voit le marchand de la caravane');
      ok(await T(c, `(()=>{ const k=CARAVANES.get(${car.id}); if(!k||!k.ent) return false; interactVillager(k.ent,0); return k.ent.say&&k.ent.say.k==='carav.dit'; })()`), 'le marchand dit où il va');
      // escorte jusqu'à l'arrivée : la réputation monte dans les deux villages
      const rep0 = await T(c, `[rel(${VA}).rep,rel(${VB}).rep,stockDe(${VB},'bois'),stockDe(${VB},'fer')]`);
      ok(await attendreVillage(c, pair.a, 1e9, `(()=>{ const k=CARAVANES.get(${car.id}); if(!k) return true; const p=posCaravane(k); if(p){ P.x=p.x; P.z=p.z+4; } return k.etat==='retour'; })()`, 120000), 'arrivée chez le voisin : échange, puis retour');
      const ap = await T(c, `[rel(${VA}).rep,rel(${VB}).rep,stockDe(${VB},'bois'),stockDe(${VB},'fer'),JSON.stringify((CARAVANES.get(${car.id})||{}).retour)]`);
      ok(ap[2] > rep0[2] && ap[3] < rep0[3] && /fer/.test(ap[4]), `le voisin reçoit le bois (${rep0[2]} → ${ap[2]}) et donne du fer (${ap[4]})`);
      ok(ap[0] > rep0[0] && ap[1] > rep0[1], `caravane escortée : réputation +${ap[0] - rep0[0]} et +${ap[1] - rep0[1]} dans les deux villages`);
      const e = await T(c, `(()=>{ const B=${VB}; let o=VILS.find(x=>x.vil===B.id&&!(x.baby>0)&&ficheDe(x)); if(!o) return null; B.dlgRec=[]; o.say=null; dire(o,['village']); return o.say?traduire(o.say.k,o.say.v||undefined):null; })()`);
      ok(e === null || !/[{}]/.test(e), e ? `chez le voisin : « ${e} »` : 'pas de villageois présent chez le voisin (réplique non essayée)');
      const fer0 = await T(c, `stockDe(${VA},'fer')`);
      ok(await attendreVillage(c, pair.a, 1e9, `(()=>{ const k=CARAVANES.get(${car.id}); if(k){ const p=posCaravane(k); if(p){ P.x=p.x; P.z=p.z+4; } } return !k; })()`, 120000) && await T(c, `stockDe(${VA},'fer')`) > fer0, 'la caravane rentre avec le fer');
      // une caravane en route est gardée dans la sauvegarde
      await T(c, `(()=>{ vie(${VA}).caravaneT=undefined; vie(${VA}).stock.fer=0; vie(${VB}).stock.fer=60; const k=partirCaravane(${VA}); if(k) k.duree=5; })()`);
      const n = await T(c, `CARAVANES.size`);
      await T(c, `(async()=>{ saveNow(); await saving; })()`);
      c = await ouvrir('&debug=1'); await attendre(800);
      ok(n > 0 && await T(c, `CARAVANES.size`) === n, 'caravane en route relue après rechargement');
    }
  }
  }

  console.log('14. fiche du village et carte');
  { c = await ouvrir('&debug=1'); await continuer(c);
  const vf = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id})||[...VILLAGES.values()][0]; if(!v) return null; for(let a=-3;a<=3;a++) for(let b=-3;b<=3;b++) ensureChunk((v.cx>>4)+a,(v.cz>>4)+b);
    if(state==='dead') respawn(); P.fly=true; P.x=v.cx+3.5; P.z=v.cz+3.5; P.y=v.h0+3; loadAround(P.x,P.z); P.food=20; P.hp=20; prefs.monsters=false; vie(v); if(!v.pop) v.pop=new Map(); markSeen(); seen.add(CK(v.cx>>4,v.cz>>4));
    const o=[...VILLAGES.values()].find(x=>x!==v); CARAVANES.clear(); if(o){ seen.add(CK(o.cx>>4,o.cz>>4)); CARAVANES.set(990,{id:990,de:v.id,vers:o.id,veut:'fer',charge:{bois:16},retour:null,etat:'aller',depart:maintenant(),duree:50,escorteT:0,nuit:0}); }
    return {id:v.id,nom:villageNom(v),autre:o?villageNom(o):null,hab:habitants(v)}; })()`);
  ok(!!vf, vf ? `village ${vf.nom} (${vf.hab} habitants)` : 'aucun village chargé');
  if (vf) {
    const V = `VILLAGES.get(${vf.id})`;
    // le pilier (ou le puits) de la place : le bouton d'action ouvre la fiche
    const pil = await T(c, `(()=>{ const v=${V}, b={x:v.cx,y:v.h0+1,z:v.cz}; b.id=getB(b.x,b.y,b.z); if(villageIci(b)!==v) return 'non reconnu'; setState('play'); target=b; targetEnt=null; useKey=''; updateUseBtn(); const l=$('#useLbl').textContent; useAction(); return l+' → '+state+' / '+bagTab+' / '+$('#bTitle').textContent; })()`);
    ok(new RegExp('^Le village → bag / village / ' + vf.nom + '$').test(pil), 'le pilier de la place : bouton « Le village », fiche ouverte (' + pil + ')');
    const txt = await T(c, `$('#bagBody').textContent`);
    const attendus = ['Habitants', 'Métiers', 'Bâtiments', 'Ta réputation', 'Chantier en cours', 'Réserves', 'Ce qui manque', 'Villages voisins', 'Caravanes'].filter((m) => !txt.includes(m));
    ok(attendus.length === 0 && !/[{}]/.test(txt), 'la fiche donne habitants, métiers, bâtiments, réputation, chantier, réserves, manques, voisins et caravanes' + (attendus.length ? ' — manque : ' + attendus.join(', ') : ''));
    if (vf.autre) ok(txt.includes('Partie pour ' + vf.autre + ' avec du bois ×16'), `la caravane en route vers ${vf.autre} est dans la fiche`);
    // depuis un villageois : bouton « Le village », puis retour au villageois
    const vil = await T(c, `(()=>{ const v=${V}, o=VILS.find(x=>x.vil===v.id&&!(x.baby>0)&&!x.puppet&&ficheDe(x)&&!(x.dead>0)); if(!o) return null; setState('play'); openVillageois(o); return o.nom; })()`);
    if (vil) {
      await c.locator('#bagBody .vbtn', { hasText: 'Le village' }).click(); await attendre(200);
      ok(await T(c, `bagTab==='village'&&$('#bTitle').textContent===${JSON.stringify(vf.nom)}`), `depuis ${vil} : « Le village » ouvre la fiche du village`);
      await c.locator('#bagBody .vbtn', { hasText: 'Retour à ' + vil }).click(); await attendre(200);
      ok(await T(c, `bagTab==='vil'&&$('#bTitle').textContent===${JSON.stringify(vil)}`), 'retour à la fiche du villageois');
    } else ok(true, 'pas de villageois présent (bouton « Le village » non essayé)');
    // la carte : couleur de la réputation, nom, caravane, liste des villages
    await T(c, `(()=>{ rel(${V}).rep=40; setState('play'); openMap(); })()`); await attendre(300);
    const d1 = await T(c, `JSON.stringify(carteDessin)`), dv = JSON.parse(d1);
    const mv = dv.villages.find((x) => x.id === vf.id);
    ok(!!mv && mv.couleur === '#3fa34d' && mv.nom === vf.nom, mv ? `sur la carte : ${mv.nom}, toit vert (réputation excellente), taille ${mv.taille}` : 'le village n\'est pas sur la carte : ' + d1);
    await T(c, `(()=>{ rel(${V}).rep=-60; drawMap(); })()`);
    ok(await T(c, `carteDessin.villages.find(x=>x.id===${vf.id}).couleur`) === '#c0392b', 'réputation très mauvaise : toit rouge');
    if (vf.autre) ok(dv.caravanes >= 1, `caravane en route tracée sur la carte (${dv.caravanes})`);
    const btn = await c.locator('#mVils .mvil').evaluateAll((l) => l.map((b) => [b.textContent, Math.round(b.getBoundingClientRect().height)]));
    ok(btn.length >= 1 && btn.some((b) => b[0].startsWith(vf.nom + ' · ')) && btn.every((b) => b[1] >= 44), `liste des villages découverts : ${btn.map((b) => b[0] + ' (' + b[1] + ' px)').join(', ')}`);
    await c.locator('#mVils .mvil', { hasText: vf.nom + ' · ' }).first().click(); await attendre(200);
    ok(await T(c, `state==='bag'&&bagTab==='village'&&ficheRetour==='map'`), 'un village de la liste ouvre sa fiche');
    await c.locator('#bagBody .vbtn', { hasText: 'Retour à la carte' }).click(); await attendre(200);
    ok(await T(c, `state`) === 'map', 'retour à la carte');
    await T(c, `(()=>{ rel(${V}).rep=0; CARAVANES.delete(990); resume(); })()`);
  }
  }

  console.log('15. sauvegarde complète et rattrapage');
  { await T(c, `(()=>{ const inf=villageInfo(Math.floor((${v6.id}-1000)/256),(${v6.id}-1000)%256); for(let a=-3;a<=3;a++) for(let b=-3;b<=3;b++) ensureChunk((inf.cx>>4)+a,(inf.cz>>4)+b); /* le village de l'essai, chargé (la section 14 a rechargé la partie ailleurs) */
    const v=VILLAGES.get(${v6.id}); P.fly=true; P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+14; loadAround(P.x,P.z); DBG.vitesse=10; prefs.monsters=false; if(state==='dead') respawn(); P.food=20; P.hp=20; if(state!=='play') resume(); })()`); await attendre(1000);
  // --- empreinte complète des villages : relevée, sauvegardée, rechargée, comparée
  const SIG = `(()=>{ const o={}; for(const v of VILLAGES.values()){ if(!v.vie) continue; const e=v.eco||{}, w=v.vie;
    o[v.id]={stock:w.stock,bats:(w.bats||[]).map(b=>b.t+' '+b.x+','+b.z).join(' / '),champs:(w.champs||[]).length,
      pop:v.pop?[...v.pop].map(([s,f])=>[s,f.nom,f.age,f.naissance,f.metier,f.maison,f.humeur,JSON.stringify(f.famille),f.memoire.length,JSON.stringify(f.inv),JSON.stringify(f.dettes||{}),f.mort|0,f.parti|0]):null,
      chantier:e.s?[e.s.t,e.s.p,e.s.x,e.s.z,JSON.stringify(e.s.credit||{})]:null,h:(e.h||[]).length,houses:v.houses.length,
      rep:w.rel?[w.rel.rep,w.rel.actes,w.rel.reparer.length,JSON.stringify(w.rel.quete||null)]:null,etal:w.etal&&Object.keys(w.etal).length?w.etal:null,troc:w.troc&&(w.troc.n||w.troc.refus||w.troc.marche)?w.troc:null,t:Math.round(w.t),prog:Math.round(w.prog),jour:w.jour,
      mine:JSON.stringify(w.mine||null),foret:JSON.stringify(w.foret||null),vu:w.vu===undefined?null:+w.vu.toFixed(3)}; } return JSON.stringify(o); })()`;
  await attendreVillage(c, v6.id, 400, 'false', 120000);
  // le joueur s'éloigne : les villages sont figés, rien ne bouge entre la sauvegarde et la relecture
  const loin = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); P.fly=true; P.x=v.cx+700.5; P.z=v.cz+.5; P.y=terrain(Math.floor(P.x),Math.floor(P.z))+20; loadAround(P.x,P.z); return [P.x,P.y,P.z]; })()`); await attendre(1500);
  ok(await T(c, `![...VILLAGES.values()].some(v=>v.sim)`), 'loin des villages : tous figés');
  const avant = JSON.parse(await T(c, SIG)), vids = Object.keys(avant);
  await T(c, `(async()=>{ saveNow(); await saving; })()`);
  c = await ouvrir('&debug=1'); await continuer(c);
  await T(c, `(()=>{ for(const id of ${JSON.stringify(vids.map(Number))}){ const inf=villageInfo(Math.floor((id-1000)/256),(id-1000)%256); if(inf) for(let a=-3;a<=3;a++) for(let b=-3;b<=3;b++) ensureChunk((inf.cx>>4)+a,(inf.cz>>4)+b); } })()`);
  const apres = JSON.parse(await T(c, SIG)); let diffs = [];
  for (const id of vids) { const a = avant[id], b = apres[id]; if (!b) { diffs.push(id + ' : village perdu'); continue; }
    for (const k in a) { const x = JSON.stringify(a[k]), y = JSON.stringify(b[k]); if (x !== y) diffs.push(id + ' ' + k + ' : ' + x.slice(0, 200) + ' → ' + y.slice(0, 200)); } }
  for (const d of diffs.slice(0, 30)) console.log('    ' + d);
  ok(diffs.length === 0, `${vids.length} villages identiques après rechargement` + (diffs.length ? ` — ${diffs.length} différence(s)` : ''));
  // --- rattrapage : deux jours du jeu passent loin du village (figé), puis il rattrape d'un coup
  const ra = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); for(let a=-3;a<=3;a++) for(let b=-3;b<=3;b++) ensureChunk((v.cx>>4)+a,(v.cz>>4)+b);
    const w=vie(v), eco=vilEco(v); if(v.sim) return {err:'village encore simulé'}; if(w.vu===undefined) return {err:'pas de date de dernière simulation'};
    for(const r of ['ble','graines','carotte','poisson','viande','laine','charbon','minerai']) w.stock[r]=0; w.stock.bois=200; w.stock.pierre=200;
    if(!eco.s){ const S=siteBat(v,'abri'); if(S) eco.s=S; } const S=eco.s; if(S&&!S.plan) planChantier(v,S); const p0=S?S.p:0;
    if(!w.rel) rel(v); w.rel.rep=-20; const st0=JSON.stringify(w.stock), cap={}; for(const r in CIBLES) cap[r]=Math.max(w.stock[r]|0,Math.ceil(CIBLES[r](habitants(v))*RATTRAPAGE.plafond));
    jourJeu+=2; // deux jours du jeu loin du village
    const orig=chercherChemin; let chemins=0; chercherChemin=(...a)=>{ chemins++; return orig(...a); };
    let b; try { b=rattraperVillage(v); } finally { chercherChemin=orig; }
    const trop=Object.keys(CIBLES).filter(r=>stockDe(v,r)>cap[r]);
    const metiers=fichesVivantes(v).filter(([,f])=>f.age==='adulte'&&RATTRAPAGE.recolte[f.metier]&&moyensRecolte(v,f.metier)).map(([,f])=>f.metier);
    return {b,chemins,trop,metiers,st0,st1:JSON.stringify(w.stock),rep:w.rel.rep,chantier:S?[S.t,p0,S.p,S.manque||null]:null}; })()`);
  ok(!ra.err && ra.b && Math.abs(ra.b.j - 2) < 0.05, ra.err || (ra.b ? `deux jours rattrapés d'un coup (${ra.b.j} j)` : 'aucun rattrapage'));
  if (ra.b) {
    ok(ra.metiers.length === 0 || Object.keys(ra.b.recolte).length > 0, `récolte des ${ra.metiers.length} récoltants : ${JSON.stringify(ra.b.recolte)}`);
    ok(ra.trop.length === 0, 'aucune réserve au-delà du plafond' + (ra.trop.length ? ' — ' + ra.trop.join(', ') : ''));
    ok(ra.chantier === null || (ra.b.blocs <= 24 && ra.b.couches <= 1 && (ra.b.blocs > 0 || !!ra.chantier[3])), ra.chantier ? `chantier « ${ra.chantier[0]} » : une étape au plus (${ra.b.blocs} blocs sur ${ra.b.couches} couche, ${ra.chantier[1]} → ${ra.chantier[2]}${ra.chantier[3] ? ', attend ' + ra.chantier[3] : ''})` : 'pas de chantier (étape non essayée)');
    ok(ra.chemins === 0, `aucune recherche de chemin pendant le rattrapage (${ra.chemins})`);
    ok(ra.rep === -16, `réputation remontée d'un jour manqué (−20 → ${ra.rep})`);
  }
  // plafond : dix jours d'absence ne comptent que pour trois
  ok(await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); vie(v).vu=maintenant()-10; const b=rattraperVillage(v); return !!b&&b.j===RATTRAPAGE.maxJours; })()`), 'dix jours d\'absence : rattrapage plafonné à 3 jours');
  // le joueur revient : le village se remet en marche, sans rattraper une seconde fois
  const rb = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); window.__rat=vie(v).rattrapage; P.fly=true; P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+14; loadAround(P.x,P.z); return 1; })()`);
  const retour = await attendreVillage(c, v6.id, 1e9, `VILLAGES.get(${v6.id}).sim===true`, 60000), etatR = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}), r=vie(v).rattrapage; return 'simulé '+!!v.sim+' · rattrapage '+(r===window.__rat?'inchangé':JSON.stringify(r)); })()`);
  ok(retour && await T(c, `(()=>{ const r=vie(VILLAGES.get(${v6.id})).rattrapage; return r===window.__rat||r.j<.2; })()`), 'retour du joueur : le village repart sans recompter son absence (' + etatR + ')');
  }
} catch (e) { ok(false, e.message); }
ok(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
await navigateur.close(); await rm(dossier, { recursive: true, force: true });
console.log(echecs ? `\nTerres Cubiques : ${echecs} problème(s).` : '\nTerres Cubiques : tout est bon.');
// sur GitHub, les échecs vont aussi dans le résumé du job (lisible sans ouvrir les journaux)
if (process.env.GITHUB_ACTIONS) for (const m of rates.slice(0, 10)) console.log('::error title=Terres Cubiques::' + String(m).replace(/[\r\n%]/g, ' '));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Terres Cubiques\n\n${rates.length ? rates.map((m) => '- ✗ ' + m).join('\n') : 'Tout est bon.'}\n\n`).catch(() => {});
process.exit(echecs ? 1 : 0);
