#!/usr/bin/env node
// ==========================================================================
// apercus-jeu.mjs — les 3 IMAGES DU JEU montrées sur sa page (« Images du jeu »)
//
// La jaquette est une affiche composée (CONSIGNES-JEU.md, section 5) : pour que
// le joueur voie à quoi ressemble vraiment le jeu, sa page montre 3 captures
// d'une vraie partie. Le jeu les prépare lui-même : quand window.JEL_APERCU
// vaut 1, 2 ou 3 (posé seulement par ce script), il s'ouvre directement sur un
// vrai moment de partie, avec sa vraie interface :
//   1 = début de partie, 2 = milieu du jeu (sur un téléphone, 390 × 844) ;
//   3 = niveau avancé, sur un écran d'ordinateur (1280 × 720).
// Page du jeu : les deux images de téléphone côte à côte, l'image d'ordinateur
// dessous sur téléphone, les trois sur une ligne sur ordinateur (choix du
// propriétaire, 19 novembre 2026).
// Captures en anglais (décision du propriétaire, 19 novembre 2026 : une seule
// série par jeu, pour rester loin de la limite de 20 000 fichiers de Cloudflare).
//
//   node scripts/apercus-jeu.mjs <id> [<id>…]     capture et écrit games/<id>/apercu-1.webp … apercu-3.webp
//   node scripts/apercus-jeu.mjs <id> --verifier   capture et contrôle, sans rien écrire
//
// Contrôles (aussi lancés par validate-games.mjs) : le jeu connaît JEL_APERCU,
// chaque image est remplie (pas d'écran vide ou plat), les 3 images sont
// différentes, aucune fenêtre ni bouton « Jouer » ou « J'ai compris » au milieu.
// Nécessite Playwright ; CHROMIUM_PATH = chemin d'un Chromium (ex. Edge).
// ==========================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertir, mesurerImage } from './jaquette-sans-texte.mjs';
import { derogation } from './derogations-jeux.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Réglages communs (robot, page du jeu). */
export const APERCUS = {
  nombre: 3,
  fichier: (n) => `apercu-${n}.webp`,
  // Écran de chaque image : téléphone en portrait (488 × 1055 px) pour 1 et 2, ordinateur (1280 × 720 px) pour 3.
  // Jeu en paysage (dérogation, scripts/derogations-jeux.mjs) : téléphone tenu à l'horizontale, 844 × 390.
  ecran: (n, paysage) => (n === 3
    ? { largeur: 1280, hauteur: 720, echelle: 1, mobile: false }
    : paysage ? { largeur: 844, hauteur: 390, echelle: 1.25, mobile: true }
      : { largeur: 390, hauteur: 844, echelle: 1.25, mobile: true }),
  qualite: 78,
  langue: 'en',
  attendre: 2500,                   // le jeu met son moment en place, puis capture
  tailleMax: 160 * 1024,            // par image
  // Une image doit montrer quelque chose (mesures de jaquette-sans-texte.mjs) :
  detailsMin: 0.25, detailsMinOrdi: 0.2, contrasteMin: 14,
  // Deux images trop proches (écart moyen de luminance sur une vignette 39 × 84) = le même écran.
  ecartMin: 6,
};

/** Le jeu prépare-t-il ses images (window.JEL_APERCU) ? */
export const aDesApercus = (html) => /\bJEL_APERCU\b/.test(html);

/** Vignette en niveaux de gris (pour comparer deux images). */
async function vignette(page, png) {
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 39; c.height = 84;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 39, 84);
    const d = g.getImageData(0, 0, 39, 84).data;
    const L = [];
    for (let i = 0; i < d.length; i += 4) L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    return L;
  }, `data:image/png;base64,${png.toString('base64')}`);
}

/** Fenêtres et boutons de menu visibles au milieu de l'écran (tutoriel, « Jouer », « Got it »…). */
function boutonsDeMenu() {
  // Libellé exact d'un bouton de menu : « Next weapon » ou « Play again » sont des commandes du jeu, pas un menu.
  const motif = /^(play|start|got it|ok|okay|continue|next|let's go|new game|resume|tap to start)[\s!.…▶►›>]*$/i;
  let n = 0;
  for (const el of document.querySelectorAll('button, [role="button"], a')) {
    if (el.closest('.jel-langue')) continue;
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    if (r.width < 8 || r.height < 8 || st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue;
    if (r.bottom < 0 || r.top > innerHeight) continue;
    if (motif.test((el.innerText || el.getAttribute('aria-label') || '').trim())) n++;
  }
  return n;
}

/**
 * Capture les 3 images d'un jeu servi à `adresse` (le jeu seul, comme à games/<id>/).
 * Renvoie { images: [{ n, png, webp, mesures, menus }], problemes: [] }.
 */
export async function capturerApercus(navigateur, adresse, options = {}) {
  const images = [], problemes = [];
  for (let n = 1; n <= APERCUS.nombre; n++) {
    const e = APERCUS.ecran(n, options.paysage);
    const contexte = await navigateur.newContext({
      viewport: { width: e.largeur, height: e.hauteur },
      deviceScaleFactor: e.echelle, isMobile: e.mobile, hasTouch: e.mobile, locale: 'en-US',
    });
    try {
      const page = await contexte.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(e.message));
      await page.addInitScript((v) => { window.JEL_APERCU = v; window.JEL_LANG = 'en'; }, n);
      await page.goto(`${adresse}?lang=${APERCUS.langue}`);
      await page.waitForTimeout(APERCUS.attendre);
      const menus = await page.evaluate(boutonsDeMenu).catch(() => 0);
      const png = await page.screenshot({ type: 'png' });
      const mesures = await mesurerImage(navigateur, png);
      const webp = await convertir(navigateur, png, 'webp', APERCUS.qualite);
      images.push({ n, png, webp, mesures, menus, vignette: await vignette(page, png) });
      for (const e of [...new Set(erreurs)].slice(0, 2)) problemes.push(`image ${n} : erreur JavaScript (${e.slice(0, 140)})`);
      // Écran d'ordinateur : le décor occupe naturellement plus de place (seuil de l'affiche, 20 %).
      const detailsMin = e.mobile ? APERCUS.detailsMin : APERCUS.detailsMinOrdi;
      if (mesures.details < detailsMin || mesures.contraste < APERCUS.contrasteMin) {
        problemes.push(`image ${n} : écran presque vide ou plat (occupée ${Math.round(mesures.details * 100)} %, contraste ${mesures.contraste}) : montrer un vrai moment de partie`);
      }
      if (menus) problemes.push(`image ${n} : ${menus} bouton(s) de menu visible(s) (« Play », « Got it »…) : JEL_APERCU doit ouvrir la partie elle-même, sans écran titre ni tutoriel`);
      if (webp.length > APERCUS.tailleMax) problemes.push(`image ${n} : ${Math.round(webp.length / 1024)} Ko (${Math.round(APERCUS.tailleMax / 1024)} Ko au plus)`);
    } finally {
      await contexte.close();
    }
  }
  // Trois moments différents : deux images presque identiques montrent le même écran.
  for (let a = 0; a < images.length; a++) {
    for (let b = a + 1; b < images.length; b++) {
      const va = images[a].vignette, vb = images[b].vignette;
      const ecart = va.reduce((s, x, i) => s + Math.abs(x - vb[i]), 0) / va.length;
      if (ecart < APERCUS.ecartMin) problemes.push(`images ${a + 1} et ${b + 1} presque identiques (écart ${ecart.toFixed(1)}) : montrer 3 moments différents (début, milieu, niveau avancé)`);
    }
  }
  return { images, problemes };
}

/** Petit serveur qui sert le jeu seul (comme ouvert à son adresse games/<id>/). */
export async function servirJeu(dossier) {
  const { createServer } = await import('node:http');
  const serveur = createServer(async (req, res) => {
    const html = await readFile(path.join(dossier, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
  });
  await new Promise((ok) => serveur.listen(0, ok));
  return { adresse: `http://localhost:${serveur.address().port}/`, fermer: () => serveur.close() };
}

async function principal() {
  const args = process.argv.slice(2);
  const ids = args.filter((a) => !a.startsWith('--'));
  const verifier = args.includes('--verifier');
  if (!ids.length) {
    console.log('Usage : node scripts/apercus-jeu.mjs <id> [<id>…] [--verifier]');
    process.exit(1);
  }
  const { chromium } = await import('playwright');
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  let echecs = 0;
  try {
    for (const id of ids) {
      const dossier = path.join(RACINE, 'games', id);
      const html = await readFile(path.join(dossier, 'index.html'), 'utf8');
      if (!aDesApercus(html)) {
        console.log(`  ✗ ${id} : le jeu ne prépare pas ses images (window.JEL_APERCU, CONSIGNES-JEU.md section 5)`);
        echecs++;
        continue;
      }
      const serveur = await servirJeu(dossier);
      try {
        const { images, problemes } = await capturerApercus(navigateur, serveur.adresse, { paysage: !!derogation(id).paysage });
        for (const im of images) {
          if (!verifier) await writeFile(path.join(dossier, APERCUS.fichier(im.n)), im.webp);
          console.log(`  📷 ${id} : image ${im.n}${verifier ? '' : ` → ${APERCUS.fichier(im.n)}`} (${Math.round(im.webp.length / 1024)} Ko ; occupée ${Math.round(im.mesures.details * 100)} %, contraste ${im.mesures.contraste}, luminosité ${im.mesures.luminosite})`);
        }
        for (const p of problemes) console.log(`  ✗ ${id} : ${p}`);
        if (problemes.length) echecs++;
      } finally {
        serveur.fermer();
      }
    }
  } finally {
    await navigateur.close();
  }
  if (echecs) {
    console.log(`\nImages du jeu : ${echecs} jeu(x) à reprendre.`);
    process.exit(1);
  }
  console.log('\nImages du jeu : tout est bon.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => { console.error('Images non créées :', e.message); process.exit(1); });
}
