#!/usr/bin/env node
// ==========================================================================
// charge-terres-cubiques.mjs — optimisation et essais de charge des villages de
// Terres Cubiques (docs/terres-cubiques-villages.md, section 16), dans le lanceur
// du site, sur un écran de téléphone. Pas dans validate.yml (long, et les temps
// mesurés dépendent de la machine) : à lancer à la main après un changement des villages.
//
//   node scripts/charge-terres-cubiques.mjs              (mesures puis 3 h de simulation ×10, 20 min environ)
//   node scripts/charge-terres-cubiques.mjs --rapide     (mesures seules, 2 min environ)
//   node scripts/charge-terres-cubiques.mjs --heures 1   (endurance plus courte)
//   … --rapport mesures.json                              (mesures écrites dans un fichier)
//
//   1. Charge, processeur ralenti 4 fois (un téléphone moyen) : temps passé par image
//      dans la simulation des villages, l'IA des villageois, les entités et la
//      préparation du rendu, appels de dessin, images par seconde.
//      - loin de tout village (plus de 1 000 blocs) : moins de 0,2 ms de calcul des
//        villages par image, comparé au jeu dont la simulation des villages est coupée ;
//      - près d'un village porté à 20 villageois actifs, le regard tourné vers eux :
//        moins de 4 ms de calcul des villages par image (budget : 33 ms à 30 images
//        par seconde), moins de 300 appels de dessin ;
//      - même foule à la vitesse ×10 du mode test : moins de 15 ms.
//      Les images par seconde affichées viennent d'un navigateur sans carte graphique
//      (rendu logiciel) : elles ne disent rien d'un vrai téléphone, seuls les temps
//      de calcul et les appels de dessin comptent.
//   2. Endurance : 3 heures de simulation accélérée (×10) près du village ; à la fin,
//      arbres adultes, graines, couples d'animaux et champ semé au-dessus de leurs
//      seuils (un village bloqué, c'est un de ces seuils franchi) ; la plus longue
//      impasse est affichée à titre d'information (à ×10, les pousses mettent toujours
//      un jour du jeu à grandir : l'attente du bois paraît 10 fois plus longue).
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

let playwright;
try { playwright = await import('playwright'); }
catch { console.error('Playwright manque : npm install --no-save playwright'); process.exit(1); }

const fiche = JSON.parse(await readFile(path.join(RACINE, 'games', ID, 'game.json'), 'utf8'));
const source = await readFile(path.join(RACINE, 'games', ID, 'index.html'), 'utf8');
const MARQUE = "(function(){\n'use strict';";
if (!source.replace(/\r\n/g, '\n').includes(MARQUE)) { console.error('✗ début du code du jeu introuvable (porte de test)'); process.exit(1); }
const jeu = source.replace(/\r\n/g, '\n').replace(MARQUE, MARQUE + ' window.__T=k=>eval(k);');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };

const navigateur = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR' });
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
async function continuer(c) { const b = c.locator('jel-sauvegarde').getByRole('button', { name: /Continuer/ }); if (await b.count()) await b.first().click(); else await c.locator('#tContinue').click(); await attendre(1500); }
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

let c;
const mesures = [];
try {
  await page.goto(`${BASE}/catalog.json`); await page.evaluate(() => localStorage.clear());
  c = await ouvrir('&debug=1'); await c.locator('#tSurv').click(); await attendre(2500);
  const v6 = await T(c, `(()=>{ for(let ci=-2;ci<=2;ci++) for(let cj=-2;cj<=2;cj++){ const inf=villageInfo(Math.floor(P.x/256)+ci,Math.floor(P.z/256)+cj); if(inf) for(let a=-3;a<=3;a++) for(let b=-3;b<=3;b++) ensureChunk((inf.cx>>4)+a,(inf.cz>>4)+b); }
    const v=[...VILLAGES.values()].sort((a,b)=>b.vils.length-a.vils.length)[0]; P.fly=true; P.x=v.cx+.5; P.z=v.cz+.5; P.y=v.h0+14; loadAround(P.x,P.z); time=.08; DBG.vitesse=1; prefs.monsters=false; return {id:v.id,nom:villageNom(v)}; })()`);
  ok(await attendreVillage(c, v6.id, 1e9, `VILLAGES.get(${v6.id}).sim===true`, 60000), `village ${v6.nom} simulé`);
  const D = await T(c, 'JSON.parse(JSON.stringify(DURABLE))'); // seuils de durabilité du jeu

  console.log('1. charge (processeur ralenti ×4, écran de téléphone)');
  const cdp = await page.context().newCDPSession(page);
  // instruments : temps de la simulation des villages, de l'IA des villageois, des entités et du rendu ; images comptées
  await T(c, `(()=>{ window.__M={vt:0,ai:0,ue:0,rd:0,calls:0,img:0,dts:[]}; const a=villagesTick, b=villagerAI, u=updateEnts, rr=renderer.render.bind(renderer);
    renderer.render=(s,cam)=>{ const t=performance.now(); rr(s,cam); if(s===scene){ __M.rd+=performance.now()-t; __M.calls+=renderer.info.render.calls; } };
    updateEnts=dt=>{ const t=performance.now(); u(dt); __M.ue+=performance.now()-t; };
    villagesTick=dt=>{ const t=performance.now(); a(dt); __M.vt+=performance.now()-t; };
    villagerAI=(e,dt)=>{ const t=performance.now(); b(e,dt); __M.ai+=performance.now()-t; };
    let l=performance.now(); const f=n=>{ __M.img++; __M.dts.push(n-l); l=n; requestAnimationFrame(f); }; requestAnimationFrame(f); window.__vtOrig=a; window.__face=null; })()`);
  async function mesurer(nom, ms) {
    await T(c, `(()=>{ for(const k of ['vt','ai','ue','rd','calls','img']) __M[k]=0; __M.dts=[]; })()`);
    for (let k = 0; k < ms / 500; k++) { await attendre(500); await T(c, `(()=>{ if(window.__face) __face(); P.food=20; P.hp=20; })()`); }
    const r = await T(c, `(()=>{ const d=__M.dts.slice().sort((a,b)=>a-b), n=Math.max(1,__M.img); return {img:__M.img,med:d[d.length>>1]||0,vt:__M.vt/n,ai:__M.ai/n,ue:__M.ue/n,rd:__M.rd/n,calls:__M.calls/n,actifs:VILS.filter(e=>{ const v=vilV(e); return v&&v.sim; }).length}; })()`);
    const o = { nom, images: +(r.img / (ms / 1000)).toFixed(1), imageMed: +r.med.toFixed(1), villages: +r.vt.toFixed(3), ia: +r.ai.toFixed(3), entites: +r.ue.toFixed(2), rendu: +r.rd.toFixed(2), appels: Math.round(r.calls), actifs: r.actifs };
    console.log(`    ${nom} : ${o.images} images/s (navigateur de test, rendu logiciel), simulation des villages ${o.villages} ms, IA des villageois ${o.ia} ms, entités ${o.entites} ms, préparation du rendu ${o.rendu} ms, ${o.appels} appels de dessin par image, ${o.actifs} villageois actifs`);
    mesures.push(o); return o; }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // A. loin de tout village (plus de 1 000 blocs)
  await T(c, `(()=>{ let x=P.x, z=P.z; for(let k=0;k<40;k++){ x+=600; if([...VILLAGES.values()].every(v=>Math.hypot(v.cx-x,v.cz-z)>1000)&&!villageInfo(Math.floor(x/256),Math.floor(z/256))) break; } P.x=x+.5; P.z=z+.5; P.y=terrain(Math.floor(P.x),Math.floor(P.z))+6; loadAround(P.x,P.z); })()`);
  await attendre(6000);
  const loin = await mesurer('loin des villages', 10000);
  await T(c, `villagesTick=()=>{}`); const sans = await mesurer('loin, simulation des villages coupée', 10000);
  await T(c, `villagesTick=(dt=>{ const t=performance.now(); __vtOrig(dt); __M.vt+=performance.now()-t; })`);
  ok(loin.villages < 0.2, `loin des villages : ${loin.villages} ms de calcul des villages par image (moins de 0,2 ms ; ${loin.appels} appels de dessin, ${sans.appels} sans la simulation des villages)`);
  // B. près d'un village porté à 20 villageois, le regard tourné vers eux
  const n20 = await T(c, `(()=>{ const v=VILLAGES.get(${v6.id}); P.x=v.cx+400; loadAround(P.x,P.z); deactivateVillage(v);
    const jobs=[0,4,5,6,7,2,1,0,4,5,2,3,6,7,0,4,5,2,1,0]; for(let i=v.vils.length;i<SIM.plafond;i++) v.vils.push({house:i%Math.max(1,v.houses.length),job:jobs[i]});
    P.x=v.cx+14.5; P.z=v.cz+14.5; P.y=v.h0+9; loadAround(P.x,P.z); window.__face=()=>{ P.yaw=Math.atan2(-(v.cx-P.x),-(v.cz-P.z)); P.pitch=-.45; }; __face(); return v.vils.length; })()`);
  await attendre(8000);
  const pres = await mesurer(`près d'un village, ${n20} villageois`, 15000);
  ok(pres.actifs >= 20, `${pres.actifs} villageois actifs`);
  ok(pres.villages + pres.ia < 4, `près du village : ${(pres.villages + pres.ia).toFixed(2)} ms de calcul des villages par image (moins de 4 ms sur les 33 ms d'une image à 30 images par seconde)`);
  ok(pres.appels < 300, `foule de ${pres.actifs} villageois : ${pres.appels} appels de dessin par image (moins de 300)`);
  // C. même foule, villages à la vitesse ×10 du mode test (la simulation tourne 10 fois par image)
  await T(c, `DBG.vitesse=10`); const x10 = await mesurer('même foule, vitesse ×10', 10000); await T(c, `DBG.vitesse=1`);
  ok(x10.villages + x10.ia < 15, `vitesse ×10 : ${(x10.villages + x10.ia).toFixed(2)} ms de calcul des villages par image (moins de 15 ms)`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await T(c, `window.__face=null`);

  if (!args.includes('--rapide')) {
    const heures = Number(args[args.indexOf('--heures') + 1]) > 0 && args.includes('--heures') ? Number(args[args.indexOf('--heures') + 1]) : 3;
    console.log(`2. endurance : ${heures} h de simulation accélérée (×10)`);
    const E = `VILLAGES.get(${v6.id})`;
    const etat = `(()=>{ const v=${E}, w=vie(v), a=animauxVillage(v), cel=v.field?v.field.cells:[]; let semes=0; for(const q of cel){ const id=getB(q[0],v.h0+1,q[1]); if(B[id]&&B[id].crop) semes++; }
      return {t:Math.round(w.t),arbres:arbresAdultes(v),graines:stockDe(v,'graines'),especes:Object.fromEntries(Object.entries(a.par).map(([k,l])=>[k,l.length])),champ:cel.length?semes/cel.length:-1,impasse:w.impasse?{cause:w.impasse.cause,depuis:Math.round(w.t-w.impasse.depuis)}:null,hab:habitants(v),repas:pointsRepas(v),bats:(w.bats||[]).length,maisons:v.houses.length,bois:stockDe(v,'bois'),cible:Math.ceil(CIBLES.bois(habitants(v))),chantier:v.eco&&v.eco.s?v.eco.s.t+(v.eco.s.manque?' (attend '+v.eco.s.manque+')':''):'—',buch:VILS.filter(o=>o.vil===v.id&&metierDe(o)==='bucheron').map(o=>(o.act&&o.act.k)||'—').join('/')}; })()`;
    await T(c, `(()=>{ const v=${E}; P.x=v.cx+.5; P.z=v.cz+v.R+6.5; P.y=v.h0+16; loadAround(P.x,P.z); DBG.vitesse=10; prefs.monsters=false; })()`);
    await attendre(5000);
    const e0 = await T(c, etat), t0 = e0.t, fin = Date.now() + heures * 3600 / 10 * 1000 * 2.5; let e = e0, pireImpasse = 0;
    const especes0 = Object.keys(e0.especes).filter((k) => e0.especes[k] >= D.couple);
    while (Date.now() < fin && e.t - t0 < heures * 3600) {
      await attendre(30000); await T(c, `(()=>{ if(state==='dead') respawn(); P.food=20; P.hp=20; const v=${E}; P.x=v.cx+.5; P.z=v.cz+v.R+6.5; P.y=v.h0+16; if(state!=='play') resume(); })()`);
      e = await T(c, etat); if (e.impasse) pireImpasse = Math.max(pireImpasse, e.impasse.depuis);
      console.log(`    ${((e.t - t0) / 3600).toFixed(2)} h · arbres ${e.arbres} · graines ${e.graines} · animaux ${JSON.stringify(e.especes)} · champ ${e.champ < 0 ? '—' : Math.round(e.champ * 100) + ' %'} · ${e.hab} habitants · ${e.bats} bâtiments · ${e.maisons} maisons · bois ${e.bois}/${e.cible} · chantier ${e.chantier} · bûcherons ${e.buch || 'aucun'}${e.impasse ? ' · impasse ' + e.impasse.cause + ' depuis ' + e.impasse.depuis + ' s' : ''}`);
    }
    ok(e.t - t0 >= heures * 3600, `${((e.t - t0) / 3600).toFixed(2)} h de simulation sur ${heures} h demandées`);
    ok(e.arbres >= Math.min(D.arbres, e0.arbres), `arbres adultes au-dessus du seuil (${e0.arbres} → ${e.arbres}, seuil ${D.arbres})`);
    ok(e.graines >= D.graines, `graines gardées en réserve (${e.graines}, seuil ${D.graines})`);
    ok(especes0.every((k) => (e.especes[k] || 0) >= D.couple), `couples d'animaux gardés (${JSON.stringify(e0.especes)} → ${JSON.stringify(e.especes)})`);
    ok(e.champ < 0 || e.champ > 0.6, `champ semé (${e.champ < 0 ? 'pas de champ' : Math.round(e.champ * 100) + ' %'})`);
    // impasse (rien produit depuis 180 s alors qu'un besoin essentiel manque) : donnée à titre d'information. À ×10,
    // les pousses grandissent toujours en un jour du jeu, que la vitesse n'accélère pas : l'attente du bois dure
    // 10 fois plus longtemps en temps du village qu'en jeu normal. Un village bloqué, c'est un seuil franchi (ci-dessus).
    console.log(`    plus longue impasse : ${pireImpasse} s${e.impasse ? ' ; à la fin : ' + e.impasse.cause + ' depuis ' + e.impasse.depuis + ' s' : ' ; aucune à la fin'}`);
  }
} catch (e) { ok(false, e.message); }
ok(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
await navigateur.close(); await rm(dossier, { recursive: true, force: true });
if (args.includes('--rapport')) await writeFile(args[args.indexOf('--rapport') + 1], JSON.stringify(mesures, null, 2));
console.log(echecs ? `\nCharge de Terres Cubiques : ${echecs} problème(s).` : '\nCharge de Terres Cubiques : tout est bon.');
process.exit(echecs ? 1 : 0);
