#!/usr/bin/env node
// ==========================================================================
// jaquette-sans-texte.mjs — jaquettes SANS AUCUN TEXTE (capture du jeu)
//
// Le titre traduit est affiché par le site par-dessus la jaquette : l'image ne
// doit donc contenir aucun texte. Même méthode que les jaquettes existantes
// (capture d'écran du jeu dans Chromium, Playwright), mais en masquant les
// textes : lettres et chiffres du HTML, du SVG et du canvas (fillText,
// strokeText). Les emoji seuls et les dessins restent visibles.
//
//   node scripts/jaquette-sans-texte.mjs <id> [options]
//     --affiche            affiche du jeu (window.JEL_AFFICHE = 1 : scène composée pour la
//                            jaquette, CONSIGNES-JEU.md section 5) ; prise d'office si le jeu
//                            en a une et qu'aucun --clic ni --touche n'est donné
//     --sans-affiche       capture de l'écran d'accueil même si le jeu a une affiche
//     --clic "<sélecteur>"   clique d'abord (ex. bouton Jouer), répétable
//     --touche <touche>      appuie sur une touche (ex. Enter), répétable
//     --attendre <ms>        attente avant la capture (défaut 1500)
//     --cacher "<sélecteur>" masque en plus ces éléments (ex. un panneau vide)
//     --fin                masque seulement les textes (et les boutons qui en
//                            portent), jamais un bloc entier (écran de jeu chargé)
//     --largeur / --hauteur  taille de l'image (défaut : celle de la jaquette
//                            existante, sinon 600 × 800)
//     --qualite <0-100>      qualité JPEG/WebP (défaut 80, comme --covers)
//     --sortie <fichier>     nom du fichier (défaut : la jaquette existante,
//                            sinon cover.jpg) ; .jpg, .png ou .webp
//
// Utilisé aussi par validate-games.mjs --covers (jaquette des nouveaux jeux).
// Nécessite Playwright ; CHROMIUM_PATH = chemin d'un Chromium (ex. Edge).
// ==========================================================================

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JAQUETTES = ['cover.webp', 'cover.png', 'cover.jpg', 'cover.jpeg'];

/** Script lancé avant le jeu : le canvas n'écrit plus de lettres ni de chiffres. */
export function scriptCanvasSansTexte() {
  const ecrit = /[\p{L}\p{N}]/u;
  for (const proto of [globalThis.CanvasRenderingContext2D?.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype]) {
    if (!proto) continue;
    for (const nom of ['fillText', 'strokeText']) {
      const original = proto[nom];
      proto[nom] = function (texte, ...reste) {
        if (ecrit.test(String(texte))) return undefined;
        return original.call(this, texte, ...reste);
      };
    }
  }
}

/**
 * Masque tous les textes de la page (à lancer juste avant la capture).
 * - un bouton, un champ ou un lien qui contient des lettres ou des chiffres : caché en entier ;
 * - un bloc sans dessin (canvas, svg, img, emoji) qui contient du texte : caché en entier ;
 * - sinon, seuls ses textes sont cachés, ses dessins restent.
 */
export function masquerTextes({ selecteursEnPlus = [], fin = false } = {}) {
  const ecrit = /[\p{L}\p{N}]/u;
  const cacher = (el) => el.style.setProperty('visibility', 'hidden', 'important');
  const emojiSeul = (texte) => texte.trim() && !ecrit.test(texte);
  // Un dessin dans un bouton ne compte pas : le bouton sera caché avec son texte.
  const BOUTONS = 'button, a, [role="button"], label';
  const horsBouton = (noeud, el) => {
    const bouton = (noeud.nodeType === Node.TEXT_NODE ? noeud.parentElement : noeud)?.closest(BOUTONS);
    return !bouton || !el.contains(bouton);
  };
  const aUnDessin = (el) => {
    if (el.matches('canvas, svg, img, video, picture')) return true;
    if ([...el.querySelectorAll('canvas, svg, img, video, picture')].some((d) => horsBouton(d, el))) return true;
    const marcheur = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) if (emojiSeul(n.textContent) && horsBouton(n, el)) return true;
    return false;
  };
  const parcourir = (el) => {
    if (el.matches('script, style, template, noscript')) return;
    if (el.matches('.jel-langue')) { cacher(el); return; }
    const texte = el.textContent || '';
    if (el.matches('button, input, select, textarea, a, [role="button"], label') && (ecrit.test(texte) || el.matches('input, select, textarea'))) { cacher(el); return; }
    if (el instanceof SVGElement && el.matches('text, tspan, textPath')) { if (ecrit.test(texte)) cacher(el); return; }
    if (!fin && !(el instanceof SVGElement) && !aUnDessin(el) && ecrit.test(texte)) { cacher(el); return; }
    for (const enfant of [...el.childNodes]) {
      if (enfant.nodeType === Node.TEXT_NODE) {
        if (ecrit.test(enfant.textContent)) {
          const enveloppe = document.createElement('span');
          enveloppe.style.setProperty('visibility', 'hidden', 'important');
          enfant.replaceWith(enveloppe);
          enveloppe.append(enfant);
        }
      } else if (enfant.nodeType === Node.ELEMENT_NODE) {
        parcourir(enfant);
      }
    }
  };
  for (const el of document.body.children) parcourir(el);
  for (const s of selecteursEnPlus) document.querySelectorAll(s).forEach(cacher);
  // Les pseudo-éléments (::before, ::after) peuvent aussi porter du texte.
  const style = document.createElement('style');
  style.textContent = '*::before, *::after { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; }';
  document.head.append(style);
}

/** Le jeu sait-il dessiner son affiche (window.JEL_AFFICHE, CONSIGNES-JEU.md, section 5) ? */
export const aUneAffiche = (html) => /\bJEL_AFFICHE\b/.test(html);

/** Boutons, champs et liens visibles (une affiche n'en montre aucun). */
function compterBoutons() {
  // Le bouton de langue (.jel-langue) est masqué avec les textes : il ne compte pas.
  return [...document.querySelectorAll('button, input, select, textarea, a[href], [role="button"]')].filter((e) => {
    if (e.closest('.jel-langue')) return false;
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
      && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }).length;
}

/**
 * Ouvre l'adresse du jeu dans « navigateur », fait les gestes demandés,
 * masque les textes et renvoie la capture (Buffer PNG).
 * affiche : le jeu est ouvert avec window.JEL_AFFICHE = 1 et dessine son affiche
 * (scène composée pour la jaquette, sans interface) ; details : renvoie
 * { png, boutons } (boutons visibles avant le masquage des textes).
 */
export async function capturerSansTexte(navigateur, adresse, { largeur = 600, hauteur = 800, clics = [], touches = [], attendre = 1500, cacher = [], fin = false, affiche = false, details = false } = {}) {
  const contexte = await navigateur.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 1 });
  try {
    const page = await contexte.newPage();
    if (affiche) await page.addInitScript(() => { window.JEL_AFFICHE = 1; });
    await page.addInitScript(scriptCanvasSansTexte);
    await page.goto(adresse);
    await page.waitForTimeout(800);
    for (const s of clics) { await page.click(s, { timeout: 5000 }); await page.waitForTimeout(400); }
    for (const k of touches) { await page.keyboard.press(k); await page.waitForTimeout(300); }
    await page.waitForTimeout(affiche ? Math.max(attendre, 2000) : attendre);
    const boutons = await page.evaluate(compterBoutons).catch(() => 0);
    await page.evaluate(masquerTextes, { selecteursEnPlus: cacher, fin });
    await page.waitForTimeout(150);
    const png = await page.screenshot({ type: 'png' });
    return details ? { png, boutons } : png;
  } finally {
    await contexte.close();
  }
}

/**
 * Mesures d'une jaquette (image PNG, JPEG ou WebP), pour repérer une jaquette qui ne donne pas envie :
 *   luminosite : luminance moyenne, de 0 (noir) à 255 (blanc) ;
 *   contraste  : écart type de la luminance (une image grise et plate est faible) ;
 *   details    : part des carrés de 20 px qui contiennent quelque chose (variation de luminance
 *                ou de couleur), de 0 à 1 (une grande surface vide ou un fond uni est faible) ;
 *   couleur    : saturation moyenne, de 0 (gris) à 1.
 */
export async function mesurerImage(navigateur, image) {
  const contexte = await navigateur.newContext();
  try {
    const page = await contexte.newPage();
    const type = image[0] === 0x89 ? 'png' : image[0] === 0xff ? 'jpeg' : 'webp';
    return await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const W = img.naturalWidth, H = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, W, H).data;
      const L = new Float32Array(W * H);
      let somme = 0, carres = 0, sat = 0;
      for (let i = 0; i < W * H; i++) {
        const r = d[i * 4], v = d[i * 4 + 1], b = d[i * 4 + 2];
        L[i] = 0.2126 * r + 0.7152 * v + 0.0722 * b;
        somme += L[i]; carres += L[i] * L[i];
        const max = Math.max(r, v, b), min = Math.min(r, v, b);
        sat += max ? (max - min) / max : 0;
      }
      const n = W * H, moyenne = somme / n;
      const T = 20;
      let pleins = 0, total = 0;
      for (let by = 0; by + T <= H; by += T) {
        for (let bx = 0; bx + T <= W; bx += T) {
          let s = 0, s2 = 0, rMin = 255, rMax = 0, bMin = 255, bMax = 0;
          for (let y = by; y < by + T; y++) {
            for (let x = bx; x < bx + T; x++) {
              const i = y * W + x, l = L[i];
              s += l; s2 += l * l;
              rMin = Math.min(rMin, d[i * 4]); rMax = Math.max(rMax, d[i * 4]);
              bMin = Math.min(bMin, d[i * 4 + 2]); bMax = Math.max(bMax, d[i * 4 + 2]);
            }
          }
          const m = s / (T * T), ecart = Math.sqrt(Math.max(0, s2 / (T * T) - m * m));
          total++;
          if (ecart > 6 || rMax - rMin > 40 || bMax - bMin > 40) pleins++;
        }
      }
      return {
        luminosite: Math.round(moyenne),
        contraste: Math.round(Math.sqrt(Math.max(0, carres / n - moyenne * moyenne))),
        details: Math.round((pleins / total) * 100) / 100,
        couleur: Math.round((sat / n) * 100) / 100,
      };
    }, `data:image/${type};base64,${image.toString('base64')}`);
  } finally {
    await contexte.close();
  }
}

/** Convertit une capture PNG au format voulu (jpeg, png ou webp), dans le navigateur. */
export async function convertir(navigateur, png, format, qualite = 80) {
  if (format === 'png') return png;
  const contexte = await navigateur.newContext();
  try {
    const page = await contexte.newPage();
    const donnees = await page.evaluate(async ({ b64, type, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL(type, q).split(',')[1];
    }, { b64: png.toString('base64'), type: format === 'webp' ? 'image/webp' : 'image/jpeg', q: qualite / 100 });
    return Buffer.from(donnees, 'base64');
  } finally {
    await contexte.close();
  }
}

/** Dimensions d'une image (lue par le navigateur). */
async function dimensions(navigateur, chemin) {
  const contexte = await navigateur.newContext();
  try {
    const page = await contexte.newPage();
    const ext = path.extname(chemin).slice(1).replace('jpg', 'jpeg');
    const b64 = (await readFile(chemin)).toString('base64');
    return await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return { largeur: img.naturalWidth, hauteur: img.naturalHeight };
    }, `data:image/${ext};base64,${b64}`);
  } finally {
    await contexte.close();
  }
}

// --- Ligne de commande ---------------------------------------------------------

async function principal() {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
  if (!id) {
    console.log('Usage : node scripts/jaquette-sans-texte.mjs <id> [--clic "<sélecteur>"] [--attendre ms] …');
    process.exit(1);
  }
  const valeurs = (nom) => args.flatMap((a, i) => (a === nom && args[i + 1] !== undefined ? [args[i + 1]] : []));
  const valeur = (nom) => valeurs(nom)[0];

  const dossier = path.join(RACINE, 'games', id);
  const existante = JAQUETTES.find((n) => existsSync(path.join(dossier, n)));
  const sortie = path.join(dossier, valeur('--sortie') || existante || 'cover.jpg');
  const format = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' }[path.extname(sortie).toLowerCase()];
  if (!format) throw new Error(`format non pris en charge : ${sortie}`);

  const { chromium } = await import('playwright');
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const { createServer } = await import('node:http');
  // Petit serveur : le jeu seul, comme ouvert à son adresse (games/<id>/).
  const serveur = createServer(async (req, res) => {
    const html = await readFile(path.join(dossier, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
  }).listen(0);
  try {
    const taille = existante && !valeur('--largeur') ? await dimensions(navigateur, path.join(dossier, existante)) : { largeur: 600, hauteur: 800 };
    const largeur = Number(valeur('--largeur')) || taille.largeur;
    const hauteur = Number(valeur('--hauteur')) || taille.hauteur;
    // Affiche du jeu (window.JEL_AFFICHE) : demandée par --affiche, ou prise d'office quand le jeu en a
    // une et qu'aucun geste n'est demandé (--sans-affiche : capture de l'écran d'accueil comme avant).
    const html = await readFile(path.join(dossier, 'index.html'), 'utf8');
    const affiche = args.includes('--affiche') || (aUneAffiche(html) && !args.includes('--sans-affiche') && !valeurs('--clic').length && !valeurs('--touche').length);
    const { png, boutons } = await capturerSansTexte(navigateur, `http://localhost:${serveur.address().port}/?lang=fr`, {
      largeur, hauteur,
      clics: valeurs('--clic'),
      touches: valeurs('--touche'),
      attendre: Number(valeur('--attendre')) || 1500,
      cacher: valeurs('--cacher'),
      fin: args.includes('--fin'),
      affiche,
      details: true,
    });
    const image = await convertir(navigateur, png, format, Number(valeur('--qualite')) || 80);
    await writeFile(sortie, image);
    console.log(`  🖼  ${id} : ${path.basename(sortie)} sans texte${affiche ? ', depuis son affiche' : ''} (${largeur} × ${hauteur}, ${Math.round(image.length / 1024)} Ko)`);
    const m = await mesurerImage(navigateur, png);
    console.log(`     luminosité ${m.luminosite} (45 au moins), contraste ${m.contraste} (22 au moins), image occupée ${Math.round(m.details * 100)} % (20 % au moins), couleur ${m.couleur}${affiche && boutons ? ` ; ATTENTION : ${boutons} bouton(s) visible(s) sur l'affiche` : ''}`);
  } finally {
    serveur.close();
    await navigateur.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => { console.error('Jaquette non créée :', e.message); process.exit(1); });
}
