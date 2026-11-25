// ==========================================================================
// capture.mjs — filme le vrai gameplay d'un jeu du dépôt, image par image
//
// Le jeu (games/<id>/index.html, jamais modifié) est ouvert seul dans un
// navigateur sans écran, en français, avec une horloge virtuelle
// (horloge.mjs) : chaque image filmée correspond à 1/30 s de jeu, quelle que
// soit la vitesse de la machine. Un « plan de capture » dit comment arriver
// en pleine partie et quoi faire pendant qu'on filme :
//
//   marketing/videos/captures/<id>.json            plan principal du jeu
//   marketing/videos/captures/<id>@<variante>.json autre plan (ex. « @pc »)
//
//   {
//     "ecran": "portrait",            portrait (405 × 720, tactile → 1080 × 1920)
//                                     ou paysage (1280 × 720, souris → 1920 × 1080)
//     "graine": 7,                    hasard du jeu : même partie à chaque capture
//     "sauvegarde": { "niveau": 9 },  facultatif : sauvegarde posée avant l'ouverture
//     "preparation": [                avant de filmer (non filmé)
//       { "attendre": 1 },            secondes de jeu
//       { "clic": "Jouer" },          bouton dont le texte correspond ("facultatif", "max" s d'attente)
//       { "selecteur": "#go" },       ou sélecteur CSS
//       { "toucher": [0.5, 0.6] },    ou point de l'écran (0 à 1)
//       { "touche": "Enter" }         ou touche du clavier ("duree" : secondes de maintien)
//     ],
//     "duree": 8,                     secondes filmées
//     "gestes": [                     pendant le film ; t = seconde depuis le début du film
//       { "t": 0.5, "toucher": [0.5, 0.5] },
//       { "t": 1, "glisser": [[0.5, 0.7], [0.2, 0.7]], "duree": 0.4 },
//       { "t": 2, "touche": "ArrowLeft", "duree": 0.5 },
//       { "t": 3, "clic": "Ouvrir" }
//     ],
//     "pilote": { "type": "touches", "touches": ["ArrowLeft", "ArrowRight"] },
//                                     gestes fabriqués : touches, balade, tapotis, hasard
//     "prises": 3                     nombre d'essais (graines qui se suivent) ; la meilleure est gardée
//   }
//
// Sans plan, un plan passe-partout est essayé (bouton « Jouer », gestes au
// hasard). Les images vont dans marketing/sorties/rushes/ (ignoré par git) et
// sont réutilisées tant que le jeu et son plan ne changent pas.
// ==========================================================================

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { ErreurVideo, FORMAT, JEUX, SORTIES, SOURCES, dire, ecrireJson, empreinte, hasard, lireJson } from './commun.mjs';
import { elementsTouchables, horlogeVirtuelle } from './horloge.mjs';
import { meilleurPassage, mesurer, resumer } from './analyse.mjs';

/** À augmenter quand la façon de filmer change (les rushes gardés sont alors refaits). */
export const MOTEUR_CAPTURE = 2;
const PAS_PAR_IMAGE = 2; // le jeu tourne à 60 pas par seconde, la vidéo à 30 images

export const ECRANS = {
  portrait: { largeur: 405, hauteur: 720, echelle: FORMAT.largeur / 405, tactile: true },
  paysage: { largeur: 1280, hauteur: 720, echelle: 1.5, tactile: false },
};

const PLAN_PASSE_PARTOUT = {
  ecran: 'portrait', graine: 1, duree: 8, prises: 1,
  preparation: [
    { attendre: 1 },
    { clic: 'Jouer', facultatif: true, max: 1 },
    { clic: 'Nouvelle partie', facultatif: true, max: 0.6 },
    { attendre: 1.2 },
    { clic: "J'ai compris", facultatif: true, max: 0.4 },
    { clic: "C'est parti", facultatif: true, max: 0.4 },
    { attendre: 0.8 },
  ],
  pilote: { type: 'hasard' },
};

/** Ce qu'il faut pour qu'un passage de rush soit montré. */
export const EXPLOITABLE = { mouvementMin: 0.22, figeMax: 0.7, noirMax: 0.1 };

export const dossierDuJeu = (cible) => path.join(JEUX, cible.split('@')[0]);

export async function lirePlan(cible) {
  const id = cible.split('@')[0];
  if (!existsSync(path.join(JEUX, id, 'index.html'))) throw new ErreurVideo(`Jeu inconnu : ${id} (pas de dossier games/${id}/)`);
  const fichier = path.join(SOURCES, 'captures', `${cible}.json`);
  const propre = existsSync(fichier);
  if (!propre && cible.includes('@')) throw new ErreurVideo(`Plan de capture introuvable : marketing/videos/captures/${cible}.json`);
  const plan = { ...PLAN_PASSE_PARTOUT, ...(propre ? await lireJson(fichier) : {}) };
  if (propre && !('pilote' in (await lireJson(fichier))) && plan.gestes) delete plan.pilote; // des gestes écrits remplacent le pilote passe-partout
  if (!ECRANS[plan.ecran]) throw new ErreurVideo(`${cible} : écran inconnu « ${plan.ecran} » (portrait ou paysage)`);
  return { ...plan, cible, jeu: id, passePartout: !propre };
}

// --------------------------------------------------------------------------
// Gestes : du plan à une liste d'événements par image filmée.
// --------------------------------------------------------------------------

/** Gestes fabriqués par un pilote (hasard reproductible). */
function piloter(p, duree, rnd) {
  const entre = ([a, b]) => a + (b - a) * rnd();
  const gestes = [];
  const debut = p.debut ?? 0.1, fin = Math.min(duree, p.fin ?? duree) - 0.1;
  if (p.type === 'touches') {
    let i = Math.floor(rnd() * p.touches.length);
    for (let t = debut; t < fin;) {
      const tenue = Math.min(entre(p.tenue || [0.15, 0.5]), fin - t + 0.05);
      gestes.push({ t, touche: p.touches[i], duree: tenue });
      t += tenue + entre(p.pause || [0.05, 0.3]);
      i = p.alterner === false ? Math.floor(rnd() * p.touches.length) : (i + 1) % p.touches.length;
    }
  } else if (p.type === 'balade') {
    // Un doigt posé qui se promène dans une zone (jeux où l'on glisse pour bouger).
    const [x0, y0, x1, y1] = p.zone || [0.15, 0.3, 0.85, 0.8];
    const n = Math.max(2, Math.ceil((fin - debut) / (p.pas || 0.5)) + 1);
    const points = [];
    for (let k = 0; k < n; k++) points.push([x0 + (x1 - x0) * rnd(), y0 + (y1 - y0) * rnd()]);
    gestes.push({ t: debut, glisser: points, duree: fin - debut, doigt: p.doigt || 1, lisse: true });
  } else if (p.type === 'tapotis') {
    const [x0, y0, x1, y1] = p.zone || [0.1, 0.2, 0.9, 0.85];
    for (let t = debut; t < fin; t += entre(p.cadence || [0.25, 0.6])) {
      gestes.push({ t, toucher: [x0 + (x1 - x0) * rnd(), y0 + (y1 - y0) * rnd()], doigt: p.doigt || 1 });
    }
  } else if (p.type === 'hasard') {
    // Comme le robot de contrôle (validate-games.mjs --jouer) : touchers, glissés, touches.
    const touches = ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    for (let t = debut; t < fin; t += entre([0.25, 0.45])) {
      const x = 0.12 + 0.76 * rnd(), y = 0.18 + 0.68 * rnd(), r = rnd();
      if (r < 0.5) gestes.push({ t, toucher: [x, y] });
      else if (r < 0.8) gestes.push({ t, glisser: [[x, y], [Math.min(0.95, Math.max(0.05, x + (rnd() - 0.5) * 0.6)), Math.min(0.9, Math.max(0.1, y + (rnd() - 0.5) * 0.35))]], duree: 0.2 });
      else gestes.push({ t, touche: touches[Math.floor(rnd() * touches.length)], duree: 0.15 });
    }
  } else {
    throw new ErreurVideo(`Pilote inconnu : « ${p.type} » (touches, balade, tapotis ou hasard)`);
  }
  return gestes;
}

/** Point d'un tracé à l'avancement u (0 à 1) : droit, ou arrondi (Catmull-Rom). */
function pointDuTrace(points, u, lisse) {
  if (points.length === 1) return points[0];
  const s = Math.min(points.length - 1 - 1e-9, Math.max(0, u) * (points.length - 1));
  const i = Math.floor(s), f = s - i;
  const p1 = points[i], p2 = points[i + 1];
  if (!lisse) return [p1[0] + (p2[0] - p1[0]) * f, p1[1] + (p2[1] - p1[1]) * f];
  const p0 = points[Math.max(0, i - 1)], p3 = points[Math.min(points.length - 1, i + 2)];
  const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f);
  return [Math.min(0.98, Math.max(0.02, cr(p0[0], p1[0], p2[0], p3[0]))), Math.min(0.98, Math.max(0.02, cr(p0[1], p1[1], p2[1], p3[1])))];
}

/** Événements à jouer avant chaque image : programme[i] = [{ a, … }]. */
export function programmer(plan, total, graine) {
  const ips = FORMAT.ips;
  const programme = Array.from({ length: total + 1 }, () => []);
  const image = (t) => Math.min(total, Math.max(0, Math.round(t * ips)));
  const gestes = [...(plan.gestes || [])];
  const rnd = hasard(graine * 7919 + 13);
  for (const p of [].concat(plan.pilote || [])) gestes.push(...piloter(p, plan.duree, rnd));
  gestes.sort((a, b) => (a.t || 0) - (b.t || 0));
  for (const g of gestes) {
    const t = g.t || 0, d = g.doigt || 1;
    if (g.touche) {
      programme[image(t)].push({ a: 'touche-bas', k: g.touche });
      programme[Math.max(image(t) + 1, image(t + (g.duree ?? 0.1)))].push({ a: 'touche-haut', k: g.touche });
    } else if (g.toucher) {
      programme[image(t)].push({ a: 'bas', d, x: g.toucher[0], y: g.toucher[1] });
      programme[Math.min(total, Math.max(image(t) + 2, image(t + (g.duree ?? 0.07))))].push({ a: 'haut', d });
    } else if (g.glisser) {
      const i0 = image(t), i1 = Math.min(total, Math.max(i0 + 2, image(t + (g.duree ?? 0.4))));
      for (let i = i0; i <= i1; i++) {
        const [x, y] = pointDuTrace(g.glisser, (i - i0) / (i1 - i0), g.lisse);
        programme[i].push({ a: i === i0 ? 'bas' : 'bouge', d, x, y });
      }
      programme[Math.min(total, i1 + (g.tenir ? Math.round(g.tenir * ips) : 0))].push({ a: 'haut', d });
    } else if (g.clic !== undefined || g.selecteur) {
      programme[image(t)].push({ a: 'clic', d, cible: g.selecteur ? { selecteur: g.selecteur } : { texte: g.clic } });
    } else {
      throw new ErreurVideo(`${plan.cible} : geste illisible ${JSON.stringify(g)}`);
    }
  }
  return programme;
}

// --------------------------------------------------------------------------
// Une prise : ouvrir le jeu, le préparer, filmer.
// --------------------------------------------------------------------------

async function servir(html) {
  const serveur = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(html); });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  return { adresse: `http://127.0.0.1:${serveur.address().port}/`, fermer: () => new Promise((ok) => serveur.close(ok)) };
}

const nomImage = (i) => `${String(i).padStart(5, '0')}.jpg`;

/**
 * Ouvre le jeu et le pilote. `surImage(i, jpeg)` reçoit chaque image filmée ;
 * `explorer` (facultatif) est appelé après la préparation, à la place du film.
 */
async function prise(navigateur, plan, html, graine, { surImage, explorer, chaque = 1 }) {
  const ecran = ECRANS[plan.ecran];
  const serveur = await servir(html);
  const contexte = await navigateur.newContext({
    viewport: { width: ecran.largeur, height: ecran.hauteur }, deviceScaleFactor: ecran.echelle,
    isMobile: ecran.tactile, hasTouch: ecran.tactile, locale: 'fr-FR', timezoneId: 'Europe/Paris',
  });
  try {
    const page = await contexte.newPage();
    const erreursPage = [];
    page.on('pageerror', (e) => erreursPage.push(e.message));
    // Comme sur le site : le jeu n'a aucun accès réseau.
    await page.route('**/*', (route) => (route.request().url().startsWith(serveur.adresse) ? route.continue() : route.abort()));
    const sauvegardes = { ...(plan.stockage || {}) };
    if (plan.sauvegarde) sauvegardes[`save_${plan.jeu}`] = JSON.stringify({ v: 1, niveau: 1, score: 0, options: {}, ...plan.sauvegarde });
    await page.addInitScript(horlogeVirtuelle, { graine, sauvegardes });
    await page.addInitScript(() => { window.JEL_LANG = 'fr'; });
    await page.goto(`${serveur.adresse}?lang=fr`, { waitUntil: 'load' });
    await page.waitForTimeout(400); // polices et images intégrées décodées
    const cdp = await contexte.newCDPSession(page);

    const avancer = (n) => page.evaluate((k) => { for (let i = 0; i < k; i++) window.__fmgHorloge.avancer(1000 / 60); }, n);
    const attendre = async (secondes) => { for (let reste = Math.round(secondes * 60); reste > 0; reste -= 6) await avancer(Math.min(6, reste)); };
    const etat = () => page.evaluate(() => window.__fmgHorloge.etat());
    // Après un geste du doigt ou de la souris : le jeu le reçoit avant le pas de temps suivant (horloge.mjs).
    const souffle = () => page.evaluate(() => window.__fmgHorloge.souffle());

    // Doigts (écran tactile) ou souris (ordinateur).
    const doigts = new Map();
    const points = () => [...doigts].map(([id, p]) => ({ id, x: Math.round(p.x), y: Math.round(p.y), radiusX: 9, radiusY: 9, force: 1 }));
    const px = (x, y) => ({ x: x * ecran.largeur, y: y * ecran.hauteur });
    const pointeur = ecran.tactile ? {
      async bas(d, p) { doigts.set(d, p); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points() }); },
      async bouge(d, p) { if (!doigts.has(d)) return; doigts.set(d, p); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points() }); },
      async haut(d) { if (!doigts.delete(d)) return; await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: points() }); },
    } : {
      async bas(d, p) { doigts.set(d, p); await page.mouse.move(p.x, p.y); await page.mouse.down(); },
      async bouge(d, p) { if (!doigts.has(d)) return; await page.mouse.move(p.x, p.y); },
      async haut(d) { if (!doigts.delete(d)) return; await page.mouse.up(); },
    };
    const trouver = async (cible, max = 0) => {
      for (let ecoule = 0; ; ecoule += 0.1) {
        const [el] = await page.evaluate(elementsTouchables, cible);
        if (el || ecoule >= max) return el || null;
        await attendre(0.1);
      }
    };
    const taper = async (p, d = 1) => { await pointeur.bas(d, p); await souffle(); await avancer(3); await pointeur.haut(d); await souffle(); };

    // 1. Préparation : jusqu'en pleine partie.
    for (const etape of plan.preparation || []) {
      if (etape.attendre !== undefined) { await attendre(etape.attendre); continue; }
      if (etape.touche) { await page.keyboard.down(etape.touche); await (etape.duree ? attendre(etape.duree) : avancer(4)); await page.keyboard.up(etape.touche); await attendre(etape.apres ?? 0.3); continue; }
      if (etape.toucher) { await taper(px(...etape.toucher)); await attendre(etape.apres ?? 0.3); continue; }
      if (etape.glisser) {
        const n = Math.max(2, Math.round((etape.duree ?? 0.4) * 30));
        for (let i = 0; i <= n; i++) { const p = px(...pointDuTrace(etape.glisser, i / n, etape.lisse)); await (i ? pointeur.bouge(1, p) : pointeur.bas(1, p)); await souffle(); await avancer(PAS_PAR_IMAGE); }
        await pointeur.haut(1); await souffle(); await attendre(etape.apres ?? 0.3); continue;
      }
      const cible = etape.selecteur ? { selecteur: etape.selecteur } : { texte: etape.clic };
      // "repeter" : le bouton est touché tant qu'il est là (pages d'un tutoriel), n fois au plus.
      for (let fois = 0; fois < (etape.repeter || 1); fois++) {
        const el = await trouver(cible, fois ? 0.3 : etape.max ?? 3);
        if (!el) {
          if (etape.facultatif || fois) break;
          const vus = (await page.evaluate(elementsTouchables, {})).map((e) => `« ${e.texte || e.id || e.classe} »`).slice(0, 12).join(', ');
          throw new ErreurVideo(`${plan.cible} : rien à toucher pour ${JSON.stringify(cible)} (visibles : ${vus || 'aucun bouton'})`);
        }
        await taper({ x: el.x, y: el.y });
        await attendre(etape.apres ?? 0.4);
      }
    }
    if (explorer) return await explorer({ page, cdp, attendre, etat });

    // 2. Film.
    const total = Math.round(plan.duree * FORMAT.ips);
    const programme = programmer(plan, total, graine);
    const depart = (await etat()).t;
    const jouer = async (ev) => {
      if (ev.a === 'touche-bas') return page.keyboard.down(ev.k);
      if (ev.a === 'touche-haut') return page.keyboard.up(ev.k);
      if (ev.a === 'bas') return pointeur.bas(ev.d, px(ev.x, ev.y));
      if (ev.a === 'bouge') return pointeur.bouge(ev.d, px(ev.x, ev.y));
      if (ev.a === 'haut') return pointeur.haut(ev.d);
      if (ev.a === 'clic') { const [el] = await page.evaluate(elementsTouchables, ev.cible); if (el) await taper({ x: el.x, y: el.y }, ev.d); }
      return null;
    };
    // « scale » = échelle de l'écran : l'image sort en vrais pixels (1080 × 1920), pas en pixels CSS.
    // Brouillon (chaque > 1) : une image sur `chaque`, en pixels CSS — même partie, bien plus vite.
    const cadre = { x: 0, y: 0, width: ecran.largeur, height: ecran.hauteur, scale: chaque > 1 ? 1 : ecran.echelle };
    const duPointeur = (ev) => ev.a === 'bas' || ev.a === 'bouge' || ev.a === 'haut';
    for (let i = 0; i < total; i++) {
      for (const ev of programme[i]) await jouer(ev);
      if (programme[i].some(duPointeur)) await souffle();
      await avancer(PAS_PAR_IMAGE);
      if (i % chaque) continue;
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: chaque > 1 ? 80 : 93, clip: cadre, captureBeyondViewport: false, optimizeForSpeed: true });
      await surImage(i / chaque, Buffer.from(data, 'base64'));
    }
    for (const ev of programme[total]) await jouer(ev).catch(() => {});
    const final = await etat();
    return {
      images: total,
      fins: final.fins.map((f) => ({ t: Number(((f.t - depart) / 1000).toFixed(2)), gagne: f.gagne, niveau: f.niveau })),
      erreurs: [...new Set([...erreursPage, ...final.erreurs])].slice(0, 5),
    };
  } finally {
    await contexte.close();
    await serveur.fermer();
  }
}

// --------------------------------------------------------------------------
// Rush d'un jeu : la meilleure prise, gardée tant que rien ne change.
// --------------------------------------------------------------------------

/** Juge un rush mesuré : seconde limite (première fin de partie) et meilleur passage de 2,5 s. */
function juger(mesures, fins) {
  const premiere = fins.find((f) => f.t >= 0);
  const limite = premiere ? premiere.t + 0.25 : Infinity;
  const passage = meilleurPassage(mesures, 2.5, { limite });
  const raisons = [];
  if (fins.some((f) => f.t < 0)) raisons.push('la partie était déjà finie avant le film');
  if (!passage) raisons.push(`moins de 2,5 s de jeu avant la fin de partie (${premiere ? premiere.t : 0} s)`);
  else {
    const r = passage.resume;
    if (r.noirMax > EXPLOITABLE.noirMax) raisons.push(`images noires (${r.noirMax} s)`);
    if (r.figeMax > EXPLOITABLE.figeMax) raisons.push(`image figée pendant ${r.figeMax} s`);
    if (r.mouvement < EXPLOITABLE.mouvementMin) raisons.push(`presque rien ne bouge (mouvement ${r.mouvement})`);
  }
  return { limite: Number.isFinite(limite) ? limite : null, note: passage ? passage.note : -99, raisons };
}

/**
 * Rush d'un jeu (ou « jeu@variante ») : { dossier, images, largeur, hauteur,
 * mesures, fins, exploitable, raisons… }. Filmé si besoin, sinon relu.
 */
export async function capturer(navigateur, cible, { forcer = false, brouillon = false, journal = dire } = {}) {
  if (brouillon) return brouillonner(navigateur, cible);
  const plan = await lirePlan(cible);
  const html = await readFile(path.join(JEUX, plan.jeu, 'index.html'));
  const { cible: _c, passePartout: _p, ...cleDuPlan } = plan;
  const cle = empreinte(String(MOTEUR_CAPTURE), html, cleDuPlan);
  const base = path.join(SORTIES, 'rushes', cible.replace('@', '--'));
  const dossier = path.join(base, cle);
  const fiche = path.join(dossier, 'rush.json');
  if (!forcer && existsSync(fiche)) return { ...(await lireJson(fiche)), dossier, garde: true };

  await rm(base, { recursive: true, force: true }); // un seul rush gardé par jeu
  const ecran = ECRANS[plan.ecran];
  const prises = [];
  const debut = Date.now();
  for (let k = 0; k < Math.max(1, plan.prises || 1); k++) {
    const graine = (plan.graine || 1) + k;
    const ou = path.join(dossier, `prise-${k}`);
    await mkdir(ou, { recursive: true });
    let resultat;
    try {
      resultat = await prise(navigateur, plan, html, graine, { surImage: (i, jpeg) => writeFile(path.join(ou, nomImage(i)), jpeg) });
    } catch (e) {
      if (!(e instanceof ErreurVideo) && !/Target|closed|crash/i.test(e.message)) throw e;
      prises.push({ k, graine, ou, echec: e.message, note: -999, raisons: [e.message] });
      continue;
    }
    const mesures = await mesurer(ou, { images: true });
    prises.push({ k, graine, ou, ...resultat, mesures, ...juger(mesures, resultat.fins) });
  }
  prises.sort((a, b) => (a.raisons.length ? 1 : 0) - (b.raisons.length ? 1 : 0) || b.note - a.note);
  const gardee = prises[0];
  for (const p of prises) {
    if (p !== gardee || p.echec) { await rm(p.ou, { recursive: true, force: true }); continue; }
    for (const f of await readdir(p.ou)) await rename(path.join(p.ou, f), path.join(dossier, f));
    await rm(p.ou, { recursive: true, force: true });
  }
  const rush = {
    cible, jeu: plan.jeu, cle, moteur: MOTEUR_CAPTURE, ecran: plan.ecran, passePartout: plan.passePartout,
    largeur: Math.round(ecran.largeur * ecran.echelle), hauteur: Math.round(ecran.hauteur * ecran.echelle), ips: FORMAT.ips,
    images: gardee.images || 0, graine: gardee.graine, prises: prises.length,
    fins: gardee.fins || [], erreurs: gardee.erreurs || [], limite: gardee.limite ?? null,
    exploitable: gardee.raisons.length === 0, raisons: gardee.raisons,
    resume: gardee.mesures ? (({ noires, figees, ...r }) => r)(resumer(gardee.mesures)) : null,
    mesures: gardee.mesures ? {
      n: gardee.mesures.n, ips: gardee.mesures.ips,
      luminosite: gardee.mesures.luminosite.map((x) => Number(x.toFixed(1))),
      contraste: gardee.mesures.contraste.map((x) => Number(x.toFixed(1))),
      ecart: gardee.mesures.ecart.map((x) => Number(x.toFixed(3))),
    } : null,
    secondes: Math.round((Date.now() - debut) / 1000),
  };
  await ecrireJson(fiche, rush);
  journal(`  🎬 ${cible} : ${rush.images} images filmées en ${rush.secondes} s${rush.prises > 1 ? ` (${rush.prises} prises, graine ${rush.graine} gardée)` : ''}${rush.exploitable ? '' : ` — inexploitable : ${rush.raisons.join(' ; ')}`}`);
  return { ...rush, dossier, garde: false };
}

/**
 * Brouillon d'un rush, pour régler un plan : la même partie (même graine, mêmes gestes),
 * mais une image sur 3 et en petit. Rien n'est gardé pour le montage.
 */
async function brouillonner(navigateur, cible) {
  const CHAQUE = 3;
  const plan = await lirePlan(cible);
  const html = await readFile(path.join(JEUX, plan.jeu, 'index.html'));
  const dossier = path.join(SORTIES, 'rushes', `${cible.replace('@', '--')}--brouillon`);
  await rm(dossier, { recursive: true, force: true });
  await mkdir(dossier, { recursive: true });
  const debut = Date.now();
  const resultat = await prise(navigateur, plan, html, plan.graine || 1, { chaque: CHAQUE, surImage: (i, jpeg) => writeFile(path.join(dossier, nomImage(i)), jpeg) });
  const ips = FORMAT.ips / CHAQUE;
  const mesures = await mesurer(dossier, { images: true, ips });
  const ecran = ECRANS[plan.ecran];
  return {
    cible, jeu: plan.jeu, brouillon: true, dossier, ecran: plan.ecran, largeur: ecran.largeur, hauteur: ecran.hauteur, ips,
    images: mesures.n, graine: plan.graine || 1, fins: resultat.fins, erreurs: resultat.erreurs, exploitable: true, raisons: [],
    resume: (({ noires, figees, ...r }) => r)(resumer(mesures)), secondes: Math.round((Date.now() - debut) / 1000),
  };
}

/** Pour écrire un plan : prépare le jeu, puis liste ce qu'on peut toucher et fait une capture. */
export async function explorer(navigateur, cible, sortie) {
  const plan = await lirePlan(cible);
  const html = await readFile(path.join(JEUX, plan.jeu, 'index.html'));
  return prise(navigateur, plan, html, plan.graine || 1, {
    explorer: async ({ page, etat }) => {
      const elements = await page.evaluate(elementsTouchables, {});
      if (sortie) { await mkdir(path.dirname(sortie), { recursive: true }); await page.screenshot({ path: sortie, type: 'jpeg', quality: 80, scale: 'css' }); }
      return { elements, etat: await etat() };
    },
  });
}

export { nomImage };
