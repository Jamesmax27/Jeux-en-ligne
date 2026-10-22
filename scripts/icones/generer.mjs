#!/usr/bin/env node
// ==========================================================================
// scripts/icones/generer.mjs — icônes des regroupements de l'accueil
//
// À quoi il sert : les tuiles (au hasard, j'ai aimé, hors ligne, âges), les
// puces des genres et des univers et le titre « Tendances » ont chacun une
// icône animée. Chaque icône est dessinée dans un petit fichier SVG
// (scripts/icones/sources/) ; ce script les lit, les contrôle et écrit le CSS
// correspondant dans public/style.css, entre deux repères :
//   /* DÉBUT DU BLOC GÉNÉRÉ : icônes (scripts/icones/generer.mjs) */
//   /* FIN DU BLOC GÉNÉRÉ : icônes */
// Rien d'autre de style.css n'est touché. Ne jamais modifier ce bloc à la
// main : modifier une source (ou ce script), puis relancer.
//
// Comment lancer (depuis la racine du dépôt, Node 18 ou plus, sans npm) :
//   node scripts/icones/generer.mjs              contrôle les sources et
//                                                réécrit le bloc de style.css
//   node scripts/icones/generer.mjs --verifier   contrôle seulement : sources
//                                                valides et style.css à jour ;
//                                                n'écrit rien ; code de sortie
//                                                1 en cas de problème
//   node scripts/icones/planche.mjs              planche de contrôle (captures)
//
// Ajouter une icône (par exemple pour un nouveau genre ou univers, une fois
// ajouté à public/taxonomie.js par le propriétaire) :
//   1. écrire scripts/icones/sources/<nom>.svg, où <nom> = la clé data-cle
//      posée par app.js, avec « : » → « -- » et « + » → « plus » :
//        genre:puzzle → genre--puzzle.svg     univers:ocean → univers--ocean.svg
//        age:9+ → age--9plus.svg     collection:hors-ligne → collection--hors-ligne.svg
//        hasard → hasard.svg     titre « Tendances » → tendances.svg
//      (format, style, animations : scripts/icones/GUIDE.md) ;
//   2. lancer node scripts/icones/generer.mjs, puis la planche pour regarder.
// Une clé sans source garde simplement son emoji (aucune erreur). Un fichier
// dont le nom ne correspond à aucune clé de taxonomie.js est refusé.
//
// Format d'une source (détails dans GUIDE.md) :
//   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
//        data-anim="<nom>" [data-origine="x y"] [data-origine-extra="x y"]>
//     [<defs>…</defs>]          recopié dans chaque calque
//     <g id="fond">…</g>        masses, en noir (rempli par défaut)
//     <g id="trait">…</g>       traits, en noir (trait 1,75, bouts ronds par défaut)
//     [<g id="extra">…</g>]     détail animé, VRAIES couleurs (craie, lavande ;
//                               l'or y est changé en craie, voir COULEURS_EXTRA)
//   </svg>
//
// Le bloc produit contient :
//   1. tailles et couleurs des icônes selon le contexte et l'état ;
//   2. dessin (masques), déclencheurs, mouvements réduits, liste des clés
//      qui ont une icône (les autres gardent leur emoji) ;
//   3. bibliothèque d'animations (@keyframes « ico-<nom>-fond|trait|extra ») ;
//   4. une règle par clé : --ico-fond, --ico-trait, --ico-extra, --ico-anim-*.
// La section « Icônes : la langue du logo » qui suit le bloc dans style.css
// (constellation au survol, étincelle or de l'état choisi) n'est pas générée.
// ==========================================================================

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..');
const SOURCES = path.join(ICI, 'sources');
const TAXONOMIE = path.join(RACINE, 'public', 'taxonomie.js');
const STYLE = path.join(RACINE, 'public', 'style.css');

// Repères du bloc généré dans public/style.css (une ligne chacun).
export const REPERE_DEBUT = '/* DÉBUT DU BLOC GÉNÉRÉ : icônes (scripts/icones/generer.mjs) */';
export const REPERE_FIN = '/* FIN DU BLOC GÉNÉRÉ : icônes */';

const VERIFIER = process.argv.slice(2).includes('--verifier');

// Épaisseur unique du trait, en unités de la grille 24 × 24 (1,17 px à 16 px,
// 1,75 px à 24 px, 3,5 px à 48 px). Les sources ne la répètent pas.
const EPAISSEUR = 1.75;

// Couleurs permises dans l'extra (or, craie, lavande). L'or est accepté dans
// les sources, mais le site le peint en craie : l'or des regroupements est
// réservé à l'étincelle d'une puce ou d'une tuile choisie (section « langue
// du logo » de style.css).
const OR = '#f2d27a';
const CRAIE = '#eceae4';
const COULEURS_EXTRA = [OR, CRAIE, '#a8b3f0'];

// ---------------------------------------------------------------------------
// Bibliothèque d'animations. Chaque animation a trois @keyframes :
//   trait : le trait mène ;
//   fond  : la couleur suit, un peu en retard (≈ 5 % du temps) et un peu moins
//           loin : le décalage donne de la souplesse ;
//   extra : le détail (image de fond du span) n'existe que pendant
//           l'animation : background-size 0 → 100 % (il naît au point
//           data-origine-extra), puis il s'envole ou s'éteint ; toujours
//           « 0 0 » à 100 %.
// Translations en % de l'icône (même allure à 16 et à 48 px) ; propriétés
// translate / rotate / scale séparées (pas de « transform » : les rotations
// de plus de 180° restent justes).
// ---------------------------------------------------------------------------

// Raccourcis pour les positions de l'extra (en fraction de la taille de l'icône).
const pos = (dx = 0, dy = 0) => {
  const axe = (v, d) => (d ? `calc(var(${v}, 50%) ${d < 0 ? '-' : '+'} var(--ico-taille) * ${Math.abs(d)})` : `var(${v}, 50%)`);
  return `background-position: ${axe('--ico-ex', dx)} ${axe('--ico-ey', dy)};`;
};
const taille = (p) => `background-size: ${p}% ${p}%;`;
const rien = 'background-size: 0 0;';

export const ANIMATIONS = {
  sautiller: {
    sens: 'petit saut : s\'écrase, bondit, retombe en souplesse',
    pour: 'personnages, animaux, doudous, objets mous',
    duree: 560, origine: '50% 92%',
    extra: 'éclat à l\'atterrissage (naît derrière l\'icône et s\'envole vers les bords)',
    trait: `
  0%   { translate: 0 0; scale: 1; }
  14%  { translate: 0 0; scale: 1.1 .86; }
  40%  { translate: 0 -24%; scale: .94 1.08; }
  62%  { translate: 0 0; scale: 1.08 .9; }
  78%  { translate: 0 -5%; scale: .98 1.02; }
  100% { translate: 0 0; scale: 1; }`,
    fond: `
  0%   { translate: 0 0; scale: 1; }
  19%  { translate: 0 0; scale: 1.08 .88; }
  46%  { translate: 0 -19%; scale: .95 1.06; }
  68%  { translate: 0 0; scale: 1.1 .88; }
  84%  { translate: 0 -4%; scale: 1; }
  100% { translate: 0 0; scale: 1; }`,
    extraCles: `
  0%, 56% { ${rien} ${pos()} }
  64%  { ${taille(70)} }
  99%  { ${taille(165)} }
  100% { ${rien} }`,
  },

  galoper: {
    sens: 'galop : se cabre deux fois en se balançant d\'avant en arrière',
    pour: 'chevaux, véhicules, course, animaux qui courent',
    duree: 660, origine: '50% 90%',
    extra: 'poussière qui naît derrière (data-origine-extra) et file vers la gauche',
    trait: `
  0%   { translate: 0 0; rotate: 0deg; }
  16%  { translate: 0 -10%; rotate: -10deg; }
  34%  { translate: 0 0; rotate: 5deg; }
  52%  { translate: 0 -8%; rotate: -7deg; }
  70%  { translate: 0 0; rotate: 3deg; }
  86%  { translate: 0 0; rotate: -1deg; }
  100% { translate: 0 0; rotate: 0deg; }`,
    fond: `
  0%   { translate: 0 0; rotate: 0deg; }
  21%  { translate: 0 -8%; rotate: -8deg; }
  39%  { translate: 0 0; rotate: 4deg; }
  57%  { translate: 0 -6%; rotate: -6deg; }
  75%  { translate: 0 0; rotate: 2deg; }
  90%  { translate: 0 0; rotate: -1deg; }
  100% { translate: 0 0; rotate: 0deg; }`,
    extraCles: `
  0%, 14% { ${rien} ${pos()} }
  26%  { ${taille(100)} ${pos(-0.04, 0)} }
  80%  { ${taille(100)} ${pos(-0.4, 0)} }
  100% { ${rien} ${pos(-0.5, 0)} }`,
  },

  osciller: {
    sens: 'balancement amorti autour d\'un pivot (data-origine)',
    pour: 'notes de musique, cerf-volant, fleurs, cloches, pendules',
    duree: 720, origine: '50% 100%',
    extra: 'petits détails qui naissent au point data-origine-extra et montent',
    trait: `
  0%   { rotate: 0deg; }
  14%  { rotate: -14deg; }
  34%  { rotate: 11deg; }
  54%  { rotate: -7deg; }
  74%  { rotate: 3.5deg; }
  90%  { rotate: -1deg; }
  100% { rotate: 0deg; }`,
    fond: `
  0%   { rotate: 0deg; }
  19%  { rotate: -12deg; }
  39%  { rotate: 9.5deg; }
  59%  { rotate: -6deg; }
  79%  { rotate: 3deg; }
  94%  { rotate: -1deg; }
  100% { rotate: 0deg; }`,
    extraCles: `
  0%, 10% { ${rien} ${pos(0, 0.06)} }
  28%  { ${taille(100)} ${pos(0, 0.04)} }
  80%  { ${taille(100)} ${pos(0, -0.22)} }
  100% { ${rien} ${pos(0, -0.3)} }`,
  },

  tourner: {
    sens: 'prend son élan, fait un tour complet en l\'air, retombe',
    pour: 'dé, ballon, roue, toupie, planète, labyrinthe en spirale',
    duree: 700, origine: '50% 50%',
    extra: 'éclat à l\'atterrissage (naît derrière l\'icône et s\'envole vers les bords)',
    trait: `
  0%   { translate: 0 0; rotate: 0deg; scale: 1; }
  12%  { translate: 0 4%; rotate: -14deg; scale: 1.06 .92; }
  48%  { translate: 0 -18%; rotate: 200deg; scale: 1; }
  72%  { translate: 0 0; rotate: 360deg; scale: 1.08 .92; }
  86%  { translate: 0 -3%; rotate: 360deg; scale: 1; }
  100% { translate: 0 0; rotate: 360deg; scale: 1; }`,
    fond: `
  0%   { translate: 0 0; rotate: 0deg; scale: 1; }
  17%  { translate: 0 4%; rotate: -12deg; scale: 1.05 .93; }
  53%  { translate: 0 -15%; rotate: 186deg; scale: 1; }
  77%  { translate: 0 0; rotate: 360deg; scale: 1.08 .92; }
  91%  { translate: 0 -2%; rotate: 360deg; scale: 1; }
  100% { translate: 0 0; rotate: 360deg; scale: 1; }`,
    extraCles: `
  0%, 66% { ${rien} ${pos()} }
  74%  { ${taille(75)} }
  99%  { ${taille(170)} }
  100% { ${rien} }`,
  },

  decoller: {
    sens: 'recule comme un ressort, s\'élance vers le haut à droite, revient se poser',
    pour: 'fusée, avion, flèche, oiseau, tout ce qui part en diagonale vers le haut à droite',
    duree: 720, origine: '50% 70%',
    extra: 'flamme ou traînée née au point data-origine-extra, qui suit l\'icône puis s\'éteint',
    trait: `
  0%   { translate: 0 0; rotate: 0deg; }
  15%  { translate: -6% 6%; rotate: -3deg; }
  42%  { translate: 16% -16%; rotate: 3deg; }
  62%  { translate: 5% -5%; rotate: -2deg; }
  80%  { translate: -2% 2%; rotate: 1deg; }
  100% { translate: 0 0; rotate: 0deg; }`,
    fond: `
  0%   { translate: 0 0; rotate: 0deg; }
  20%  { translate: -6% 6%; rotate: -3deg; }
  47%  { translate: 12% -12%; rotate: 2deg; }
  67%  { translate: 4% -4%; rotate: -2deg; }
  85%  { translate: -1% 1%; rotate: 1deg; }
  100% { translate: 0 0; rotate: 0deg; }`,
    extraCles: `
  0%, 12% { ${rien} ${pos(-0.06, 0.06)} }
  20%  { ${taille(100)} ${pos(-0.06, 0.06)} }
  42%  { ${taille(115)} ${pos(0.16, -0.16)} }
  62%  { ${taille(70)} ${pos(0.05, -0.05)} }
  78%, 100% { ${rien} ${pos(-0.02, 0.02)} }`,
  },

  nager: {
    sens: 'ondule d\'avant en arrière comme dans l\'eau',
    pour: 'poisson, bateau, vague, serpent, tout ce qui glisse',
    duree: 720, origine: '50% 50%',
    extra: 'bulles nées au point data-origine-extra, qui montent',
    trait: `
  0%   { translate: 0 0; rotate: 0deg; scale: 1; }
  18%  { translate: -8% 2%; rotate: -8deg; scale: .96 1.04; }
  42%  { translate: 10% -3%; rotate: 6deg; scale: 1.04 .97; }
  66%  { translate: -4% 1%; rotate: -3deg; scale: 1; }
  84%  { translate: 2% 0; rotate: 1deg; scale: 1; }
  100% { translate: 0 0; rotate: 0deg; scale: 1; }`,
    fond: `
  0%   { translate: 0 0; rotate: 0deg; scale: 1; }
  23%  { translate: -7% 2%; rotate: -7deg; scale: .97 1.03; }
  47%  { translate: 8% -2%; rotate: 5deg; scale: 1.03 .98; }
  71%  { translate: -3% 1%; rotate: -2deg; scale: 1; }
  89%  { translate: 1% 0; rotate: 1deg; scale: 1; }
  100% { translate: 0 0; rotate: 0deg; scale: 1; }`,
    extraCles: `
  0%, 34% { ${rien} ${pos(0, 0.04)} }
  48%  { ${taille(100)} ${pos(0, 0)} }
  84%  { ${taille(100)} ${pos(0, -0.24)} }
  100% { ${rien} ${pos(0, -0.32)} }`,
  },

  pulser: {
    sens: 'double battement : la couleur gonfle un peu plus que le trait',
    pour: 'cœur, étoile, bouclier, ampoule, flamme, objets précieux',
    duree: 620, origine: '50% 55%',
    extra: 'rayons qui naissent derrière au premier battement et s\'envolent',
    trait: `
  0%   { scale: 1; }
  14%  { scale: 1.16; }
  28%  { scale: .96; }
  42%  { scale: 1.1; }
  60%  { scale: .99; }
  100% { scale: 1; }`,
    fond: `
  0%   { scale: 1; }
  18%  { scale: 1.24; }
  32%  { scale: .94; }
  46%  { scale: 1.16; }
  64%  { scale: .98; }
  100% { scale: 1; }`,
    extraCles: `
  0%, 8% { ${rien} ${pos()} }
  20%  { ${taille(85)} }
  99%  { ${taille(165)} }
  100% { ${rien} }`,
  },

  emboiter: {
    sens: 'se soulève en pivotant, puis s\'enclenche avec un petit « clic »',
    pour: 'puzzle, briques, cartes, construction, pièces qui s\'assemblent',
    duree: 640, origine: '50% 50%',
    extra: 'traits du « clic » qui jaillissent au moment où la pièce s\'enclenche',
    trait: `
  0%   { translate: 0 0; rotate: 0deg; scale: 1; }
  26%  { translate: -10% -14%; rotate: -12deg; scale: 1.04; }
  50%  { translate: 2% 3%; rotate: 2deg; scale: .98; }
  64%  { translate: 0 0; rotate: 0deg; scale: 1.06 .94; }
  80%  { translate: 0 0; rotate: 0deg; scale: .99 1.01; }
  100% { translate: 0 0; rotate: 0deg; scale: 1; }`,
    fond: `
  0%   { translate: 0 0; rotate: 0deg; scale: 1; }
  31%  { translate: -13% -18%; rotate: -15deg; scale: 1.04; }
  55%  { translate: 3% 4%; rotate: 3deg; scale: .98; }
  69%  { translate: 0 0; rotate: 0deg; scale: 1.06 .94; }
  85%  { translate: 0 0; rotate: 0deg; scale: .99 1.01; }
  100% { translate: 0 0; rotate: 0deg; scale: 1; }`,
    extraCles: `
  0%, 54% { ${rien} ${pos()} }
  62%  { ${taille(80)} }
  99%  { ${taille(150)} }
  100% { ${rien} }`,
  },

  secouer: {
    sens: 'tremblement électrique : la couleur tremble à contretemps du trait',
    pour: 'réflexes, combat, monstres, réveil, tout ce qui vibre ou frappe',
    duree: 520, origine: '50% 50%',
    extra: 'étincelles qui clignotent trois fois en place',
    trait: `
  0%   { translate: 0 0; rotate: 0deg; }
  10%  { translate: -9% 0; rotate: -7deg; }
  22%  { translate: 8% 0; rotate: 6deg; }
  34%  { translate: -7% 0; rotate: -5deg; }
  46%  { translate: 5% 0; rotate: 3deg; }
  58%  { translate: -3% 0; rotate: -2deg; }
  72%  { translate: 1% 0; rotate: 1deg; }
  100% { translate: 0 0; rotate: 0deg; }`,
    fond: `
  0%   { translate: 0 0; rotate: 0deg; }
  10%  { translate: 6% 2%; rotate: 4deg; }
  22%  { translate: -6% -2%; rotate: -4deg; }
  34%  { translate: 5% 1%; rotate: 3deg; }
  46%  { translate: -4% -1%; rotate: -2deg; }
  58%  { translate: 2% 0; rotate: 1deg; }
  72%  { translate: -1% 0; rotate: 0deg; }
  100% { translate: 0 0; rotate: 0deg; }`,
    extraCles: `
  0%, 6% { ${rien} ${pos()} }
  12%  { ${taille(100)} }
  20%  { ${taille(40)} }
  30%  { ${taille(100)} }
  40%  { ${taille(40)} }
  52%  { ${taille(105)} }
  66%, 100% { ${rien} }`,
  },

  scintiller: {
    sens: 'presque immobile : gonfle à peine en tournant un peu, et l\'extra scintille',
    pour: 'magie, livre, château, monument, ce qui ne doit pas bouger',
    duree: 700, origine: '50% 50%',
    extra: 'étincelles qui naissent derrière l\'icône, s\'installent puis s\'envolent',
    trait: `
  0%   { rotate: 0deg; scale: 1; }
  30%  { rotate: -5deg; scale: 1.1; }
  60%  { rotate: 2deg; scale: .97; }
  80%  { rotate: 0deg; scale: 1.02; }
  100% { rotate: 0deg; scale: 1; }`,
    fond: `
  0%   { rotate: 0deg; scale: 1; }
  36%  { rotate: -3deg; scale: 1.14; }
  66%  { rotate: 1deg; scale: .96; }
  86%  { rotate: 0deg; scale: 1.02; }
  100% { rotate: 0deg; scale: 1; }`,
    extraCles: `
  0%, 8% { ${rien} ${pos()} }
  30%  { ${taille(100)} }
  62%  { ${taille(108)} }
  99%  { ${taille(160)} }
  100% { ${rien} }`,
  },
};

// ---------------------------------------------------------------------------
// Clés connues (public/taxonomie.js) et conversion clé ↔ nom de fichier
// ---------------------------------------------------------------------------

export const slugDe = (cle) => cle.replace(/:/g, '--').replace(/\+/g, 'plus');

// Toutes les clés data-cle, dans l'ordre de l'accueil : raccourcis, âges,
// genres, univers, puis le titre « Tendances ». taxonomie.js est lu comme
// du texte (sans exécuter le module).
export async function clesConnues() {
  const texte = await readFile(TAXONOMIE, 'utf8');
  const bloc = (nom) => {
    const debut = texte.indexOf(`export const ${nom}`);
    if (debut < 0) throw new Error(`public/taxonomie.js : liste ${nom} introuvable`);
    return texte.slice(debut, texte.indexOf('];', debut));
  };
  const ids = (nom) => [...bloc(nom).matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]);
  return [
    'hasard', 'collection:aimes', 'collection:hors-ligne',
    ...ids('TRANCHES_AGE').map((id) => `age:${id}`),
    ...ids('GENRES').map((id) => `genre:${id}`),
    ...ids('UNIVERS').map((id) => `univers:${id}`),
    'tendances',
  ];
}

// ---------------------------------------------------------------------------
// Lecture d'une source
// ---------------------------------------------------------------------------

// Attributs d'une balise ouvrante → objet.
function attributs(balise) {
  const a = {};
  for (const m of balise.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) a[m[1]] = m[3] ?? m[4];
  return a;
}

// Contenu d'un élément <nom …>…</nom> à partir de l'index de sa balise ouvrante,
// en comptant les éléments de même nom imbriqués.
function contenuDe(svg, debut, nom) {
  const ouvrante = svg.slice(debut).match(new RegExp(`^<${nom}\\b[^>]*>`))[0];
  if (ouvrante.endsWith('/>')) return { ouvrante, interieur: '' };
  const re = new RegExp(`<(/?)${nom}\\b[^>]*?(/?)>`, 'g');
  re.lastIndex = debut + ouvrante.length;
  let profondeur = 1;
  for (let m; (m = re.exec(svg));) {
    if (m[2] === '/') continue;               // <g …/> : rien à compter
    profondeur += m[1] ? -1 : 1;
    if (profondeur === 0) return { ouvrante, interieur: svg.slice(debut + ouvrante.length, m.index) };
  }
  throw new Error(`<${nom}> non fermé`);
}

function groupe(svg, id) {
  const m = new RegExp(`<g\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>`).exec(svg);
  if (!m) return null;
  const { ouvrante, interieur } = contenuDe(svg, m.index, 'g');
  const attrs = attributs(ouvrante);
  delete attrs.id;
  return { attrs, interieur };
}

const attrsTexte = (a) => Object.entries(a).map(([k, v]) => ` ${k}="${v}"`).join('');

// SVG compact : sans commentaires, sans blancs inutiles, guillemets simples.
function compacter(svg) {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s*(\/?>)/g, '$1')
    .replace(/"/g, "'")
    .trim();
}

// data: URI encodé en URL (pas en base64) : plus court et lisible.
function uri(svg) {
  return `url("data:image/svg+xml,${compacter(svg).replace(/[%#<>{}|\\^`"\n\r]/g, encodeURIComponent)}")`;
}

// Point « x y » de la grille 24 × 24 → « x% y% ».
function enPourcents(valeur, quoi, avert) {
  const n = String(valeur).trim().split(/[\s,]+/).map(Number);
  if (n.length !== 2 || n.some((v) => !Number.isFinite(v))) {
    avert(`${quoi} « ${valeur} » illisible (attendu : « x y » dans la grille 24 × 24)`);
    return null;
  }
  return n.map((v) => `${+(v / 24 * 100).toFixed(2)}%`);
}

async function lireSource(fichier, cle) {
  const texte = await readFile(fichier, 'utf8');
  const erreurs = [];
  const avertissements = [];
  const avert = (m) => avertissements.push(m);

  const racine = texte.match(/<svg\b[^>]*>/);
  if (!racine) return { cle, erreurs: ['pas de balise <svg>'], avertissements };
  const ra = attributs(racine[0]);
  if (ra.viewBox !== '0 0 24 24') erreurs.push(`viewBox « ${ra.viewBox} » : il faut « 0 0 24 24 »`);
  const anim = ra['data-anim'];
  if (!anim) erreurs.push('data-anim manquant');
  else if (!ANIMATIONS[anim]) erreurs.push(`data-anim « ${anim} » inconnue (connues : ${Object.keys(ANIMATIONS).join(', ')})`);

  // Interdits : texte, images, scripts, liens externes, styles.
  if (/<(text|tspan|image|foreignObject|script|style)\b/i.test(texte)) erreurs.push('élément interdit (text, image, script, style ou foreignObject)');
  if (/\bon\w+\s*=/i.test(texte)) erreurs.push('attribut d\'événement (on…) interdit');
  if (/(href|url\()\s*=?\s*["']?\s*(https?:|\/\/)/i.test(texte)) erreurs.push('ressource externe interdite');
  if (/\bstyle\s*=/i.test(texte)) avert('attribut style : utiliser des attributs SVG (fill, stroke…)');
  if (/<(linearGradient|radialGradient|filter|pattern)\b/i.test(texte)) avert('dégradé, filtre ou motif : à éviter (le fond et le trait sont des masques)');

  const defsM = texte.match(/<defs\b[^>]*>[\s\S]*?<\/defs>/);
  const defs = defsM ? defsM[0] : '';
  const fond = groupe(texte, 'fond');
  const trait = groupe(texte, 'trait');
  const extra = groupe(texte, 'extra');
  if (!fond && !trait) erreurs.push('ni <g id="fond"> ni <g id="trait">');

  // Couleurs : noir seulement dans le fond et le trait (ce sont des masques).
  for (const [nom, g] of [['fond', fond], ['trait', trait]]) {
    if (!g) continue;
    const contenu = attrsTexte(g.attrs) + g.interieur;
    for (const m of contenu.matchAll(/\b(fill|stroke)\s*=\s*["']([^"']+)["']/g)) {
      if (!/^(#000|#000000|black|none)$/i.test(m[2].trim())) avert(`${nom} : ${m[1]}="${m[2]}" (seuls #000 et none comptent : c'est un masque)`);
    }
  }
  if (trait) {
    for (const m of (attrsTexte(trait.attrs) + trait.interieur).matchAll(/stroke-width\s*=\s*["']([^"']+)["']/g)) {
      if (Number(m[1]) !== EPAISSEUR) avert(`trait : stroke-width="${m[1]}" (une seule épaisseur : ${EPAISSEUR}, posée par le générateur)`);
    }
  }
  if (extra) {
    for (const m of extra.interieur.matchAll(/\b(fill|stroke)\s*=\s*["']([^"']+)["']/g)) {
      const c = m[2].trim().toLowerCase();
      if (c !== 'none' && !COULEURS_EXTRA.includes(c)) avert(`extra : ${m[1]}="${m[2]}" (permis : craie #eceae4, lavande #a8b3f0 ; or #f2d27a, peint en craie)`);
    }
  }

  const ouvrir = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';
  // Réglages par défaut du calque, puis ceux du groupe de la source (qui
  // l'emportent) ; pas de groupe intérieur s'il n'a aucun attribut.
  const calque = (g, defauts) => g && `${ouvrir}${defs}<g ${defauts}>${
    Object.keys(g.attrs).length ? `<g${attrsTexte(g.attrs)}>${g.interieur}</g>` : g.interieur}</g></svg>`;
  const origine = ra['data-origine'] ? enPourcents(ra['data-origine'], 'data-origine', avert) : null;
  const origineExtra = ra['data-origine-extra'] ? enPourcents(ra['data-origine-extra'], 'data-origine-extra', avert) : null;
  if (extra && !extra.interieur.trim()) avert('extra vide');

  // Extra : l'or devient craie (voir COULEURS_EXTRA).
  const extraSvg = extra && extra.interieur.trim()
    ? `${ouvrir}${defs}<g${attrsTexte(extra.attrs)}>${extra.interieur}</g></svg>`.replace(new RegExp(OR, 'gi'), CRAIE)
    : null;

  return {
    cle, anim, erreurs, avertissements,
    fond: calque(fond, 'fill="#000"'),
    trait: calque(trait, `fill="none" stroke="#000" stroke-width="${EPAISSEUR}" stroke-linecap="round" stroke-linejoin="round"`),
    extra: extraSvg,
    origine: origine ? origine.join(' ') : ANIMATIONS[anim]?.origine,
    origineExtra,
  };
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

// Sélecteurs du span qui porte l'emoji, pour les clés qui ont une icône.
function selecteurSpans(cles) {
  const avecCle = cles.filter((c) => c !== 'tendances');
  const lignes = [];
  if (avecCle.length) {
    lignes.push(`:is(\n    ${avecCle.map((c) => `[data-cle="${c}"]`).join(',\n    ')}\n  ) > :is(.tuile-picto, .puce-filtre-picto)`);
  }
  if (cles.includes('tendances')) lignes.push('#titre-tendances > span[aria-hidden="true"]:first-child');
  return lignes.join(',\n  ');
}

// :where() : spécificité nulle, pour que les déclencheurs (survol, focus,
// choisi) l'emportent toujours sur ces règles de base.
const SPAN = ':where(.tuile-picto, .puce-filtre-picto, #titre-tendances > span[aria-hidden="true"]:first-child)';

// Remarque : le commentaire d'en-tête ci-dessous est recopié tel quel dans
// style.css ; le modifier change le bloc (relancer le générateur).
function cssGeneral(cles) {
  return `/* ==========================================================================
   Icônes des regroupements (tuiles, puces des genres et des univers, titre
   « Tendances »). GÉNÉRÉ par scripts/icones/generer.mjs depuis
   scripts/icones/sources/*.svg : ne pas modifier à la main (bloc entre les
   repères DÉBUT / FIN DU BLOC GÉNÉRÉ).

   app.js pose data-cle sur chaque tuile et puce ; l'emoji est dans un span
   aria-hidden (.tuile-picto, .puce-filtre-picto). Pour les clés qui ont une
   icône, l'emoji est masqué et l'icône est peinte par trois calques :
     ::before  la masse colorée (masque --ico-fond, couleur --ico-couleur-fond) ;
     ::after   le trait par-dessus (masque --ico-trait, couleur --ico-couleur-trait) ;
     le span   le détail « extra » (image --ico-extra, ses vraies couleurs),
               qui n'existe que pendant l'animation, derrière l'icône.
   Une clé sans icône garde son emoji ; un navigateur sans masques CSS aussi.
   Les détails « extra » dessinés en or sont repeints en craie par le
   générateur ; l'or ne sert qu'à l'étincelle d'une
   puce ou d'une tuile choisie (section suivante).
   L'animation se joue au survol (souris), au focus clavier, et une fois quand
   la tuile ou la puce apparaît choisie (app.js la recrée à chaque clic). Le
   trait mène, la couleur suit un peu en retard. Rien ne bouge si l'appareil
   demande de réduire les mouvements.
   ========================================================================== */

/* --- 1. Taille et couleurs selon le contexte ------------------------------
   Puces : la masse prend la teinte de la puce (un peu plus vive que son
   nombre), le trait est en craie. Tuiles des raccourcis : lavande (ce qu'on
   touche). Âges : une teinte par tranche, du chaud au froid (on grandit).
   Titre « Tendances » : or (ce qui brille). */

.puce-filtre {
  --ico-taille: 16px;
  --ico-couleur-fond: oklch(.72 calc(var(--c) + .035) var(--teinte));
  --ico-couleur-trait: var(--craie);
}

/* Tuiles : icône de 24 px, dont 20 px comptent dans la hauteur (la grille
   24 × 24 garde 2 unités de marge) : les tuiles gardent leur hauteur. */
.tuile {
  --ico-taille: 24px;
  --ico-marge: -2px;
  --ico-couleur-fond: var(--lavande);
  --ico-couleur-trait: var(--craie);
}

.tuile[data-cle^="age:"] { --ico-couleur-fond: oklch(.76 .085 var(--ico-teinte-age, 250)); }
[data-cle="age:3-4"] { --ico-teinte-age: 28; }
[data-cle="age:5-6"] { --ico-teinte-age: 82; }
[data-cle="age:7-8"] { --ico-teinte-age: 152; }
[data-cle="age:9+"]  { --ico-teinte-age: 236; }

#titre-tendances {
  --ico-taille: 20px;
  --ico-couleur-fond: var(--or);
  --ico-couleur-trait: var(--craie);
}

@media (min-width: 720px) {
  .tuile { --ico-taille: 26px; --ico-marge: -3px; }
}

/* États. Choisie : la puce se remplit de sa teinte claire ; l'icône passe
   en trait nuit (comme le texte) sur une masse plus soutenue de la même
   teinte. « 0 jeu » : trait adouci, masse éteinte. « Bientôt » : gris
   ardoise et immobile ; « J'ai aimé » et « Hors ligne » vides restent
   normaux (c'est une invitation). */
.puce-filtre[aria-pressed="true"] {
  --ico-couleur-fond: oklch(.6 calc(var(--c) + .08) var(--teinte));
  --ico-couleur-trait: var(--nuit);
}

.puce-filtre.puce-zero,
.tuile.tuile-zero {
  --ico-couleur-trait: var(--craie-douce);
  --ico-opacite-fond: .45;
}

.puce-filtre.puce-bientot,
.tuile.tuile-bientot {
  --ico-couleur-fond: #323c5a;
  --ico-couleur-trait: var(--craie-faible);
}

.tuile.tuile-bientot[data-cle^="collection:"] {
  --ico-couleur-fond: var(--lavande);
  --ico-couleur-trait: var(--craie);
}

/* Navigateurs sans OKLCH : masses en craie douce, lavande pour les âges. */
@supports not (color: oklch(0 0 0)) {
  .puce-filtre { --ico-couleur-fond: var(--craie-douce); }
  .puce-filtre[aria-pressed="true"] { --ico-couleur-fond: var(--orbite); }
  .tuile[data-cle^="age:"] { --ico-couleur-fond: var(--lavande); }
}

/* --- 2. Dessin : seulement si le navigateur sait faire des masques -------- */

@supports ((-webkit-mask-image: none) or (mask-image: none)) {
  /* Les clés qui ont une icône (liste générée). L'emoji (font-size: 0) ne
     prend plus de place ; le span devient la boîte de l'icône. Il remplace
     aussi l'opacité et le gris des états « 0 jeu » et « Bientôt » de l'emoji. */
  ${selecteurSpans(cles)} {
    --ico-contenu: "";
    position: relative;
    display: inline-block;
    flex: none;
    width: var(--ico-taille);
    height: var(--ico-taille);
    margin-block: var(--ico-marge, 0);
    font-size: 0;
    line-height: 0;
    vertical-align: middle;
    opacity: 1;
    filter: none;
    background: var(--ico-extra, none) no-repeat;
    background-position: var(--ico-ex, 50%) var(--ico-ey, 50%);
    background-size: 0 0;
    animation: var(--ico-duree, 600ms) ease-in-out both;
    animation-name: none;
  }

  /* Titre : centrée sur les minuscules (vertical-align: middle ; la ligne
     de base du span, vide, serait son bord haut), remontée d'1 px pour les
     majuscules. */
  #titre-tendances > span[aria-hidden="true"]:first-child { top: -1px; }

  /* Les deux calques : n'existent que si le span a une icône (--ico-contenu). */
  ${SPAN}::before,
  ${SPAN}::after {
    content: var(--ico-contenu, none);
    position: absolute;
    inset: 0;
    transform-origin: var(--ico-origine, 50% 50%);
    animation: var(--ico-duree, 600ms) ease-in-out both;
    animation-name: none;
    pointer-events: none;
  }

  ${SPAN}::before {
    background: var(--ico-couleur-fond);
    opacity: var(--ico-opacite-fond, 1);
    -webkit-mask: var(--ico-fond, none) 50% 50% / 100% 100% no-repeat;
    mask: var(--ico-fond, none) 50% 50% / 100% 100% no-repeat;
  }

  ${SPAN}::after {
    background: var(--ico-couleur-trait);
    -webkit-mask: var(--ico-trait, none) 50% 50% / 100% 100% no-repeat;
    mask: var(--ico-trait, none) 50% 50% / 100% 100% no-repeat;
  }

  /* Puce choisie : l'extra (or, craie, lavande) ne se verrait pas sur la
     teinte claire ; seule l'icône bouge. */
  .puce-filtre[aria-pressed="true"] > .puce-filtre-picto { background-image: none; }

  /* Déclencheurs : survol (souris seulement : au doigt, il resterait
     « collé »), focus clavier, et apparition à l'état choisi. */
  @media (hover: hover) {
    :is(.tuile, .puce-filtre):hover:not(:disabled) > :is(.tuile-picto, .puce-filtre-picto) { animation-name: var(--ico-anim-extra, none); }
    :is(.tuile, .puce-filtre):hover:not(:disabled) > :is(.tuile-picto, .puce-filtre-picto)::before { animation-name: var(--ico-anim-fond, none); }
    :is(.tuile, .puce-filtre):hover:not(:disabled) > :is(.tuile-picto, .puce-filtre-picto)::after { animation-name: var(--ico-anim-trait, none); }
  }

  :is(.tuile, .puce-filtre):is(:focus-visible, [aria-pressed="true"]) > :is(.tuile-picto, .puce-filtre-picto) { animation-name: var(--ico-anim-extra, none); }
  :is(.tuile, .puce-filtre):is(:focus-visible, [aria-pressed="true"]) > :is(.tuile-picto, .puce-filtre-picto)::before { animation-name: var(--ico-anim-fond, none); }
  :is(.tuile, .puce-filtre):is(:focus-visible, [aria-pressed="true"]) > :is(.tuile-picto, .puce-filtre-picto)::after { animation-name: var(--ico-anim-trait, none); }

  /* Contraste élevé (couleurs forcées de Windows) : le navigateur remplacerait
     les couleurs des calques par celle du fond, et l'icône disparaîtrait ;
     on prend les couleurs du système. */
  @media (forced-colors: active) {
    ${SPAN}::before { forced-color-adjust: none; background: GrayText; }
    ${SPAN}::after { forced-color-adjust: none; background: CanvasText; }
  }

  /* Mouvements réduits : icônes immobiles, pas d'extra. */
  @media (prefers-reduced-motion: reduce) {
    ${SPAN},
    ${SPAN}::before,
    ${SPAN}::after {
      animation: none !important;
    }
  }
}
`;
}

function cssAnimations() {
  const blocs = [`/* --- 3. Bibliothèque d'animations ----------------------------------------
   Une animation = trois @keyframes : « -trait » (mène), « -fond » (suit, un
   peu en retard) et « -extra » (taille et place de l'image du détail ; la
   taille revient toujours à 0 à la fin). Choisie par icône avec data-anim. */`];
  for (const [nom, a] of Object.entries(ANIMATIONS)) {
    blocs.push(`/* ${nom} (${a.duree} ms) : ${a.sens}. Extra : ${a.extra}. */
@keyframes ico-${nom}-trait {${a.trait}
}
@keyframes ico-${nom}-fond {${a.fond}
}
@keyframes ico-${nom}-extra {${a.extraCles}
}`);
  }
  return blocs.join('\n\n');
}

function cssCle(s) {
  const a = ANIMATIONS[s.anim];
  const selecteur = s.cle === 'tendances' ? '#titre-tendances' : `[data-cle="${s.cle}"]`;
  const lignes = [
    s.fond ? `  --ico-fond: ${uri(s.fond)};` : '  --ico-fond: none;',
    s.trait ? `  --ico-trait: ${uri(s.trait)};` : '  --ico-trait: none;',
    s.extra ? `  --ico-extra: ${uri(s.extra)};` : '  --ico-extra: none;',
    `  --ico-anim-fond: ico-${s.anim}-fond;`,
    `  --ico-anim-trait: ico-${s.anim}-trait;`,
    `  --ico-anim-extra: ${s.extra ? `ico-${s.anim}-extra` : 'none'};`,
    `  --ico-duree: ${a.duree}ms;`,
  ];
  if (s.origine && s.origine !== '50% 50%') lignes.push(`  --ico-origine: ${s.origine};`);
  if (s.origineExtra) lignes.push(`  --ico-ex: ${s.origineExtra[0]};`, `  --ico-ey: ${s.origineExtra[1]};`);
  return `/* ${s.cle} — ${s.anim} */\n${selecteur} {\n${lignes.join('\n')}\n}`;
}

// ---------------------------------------------------------------------------
// Place du bloc dans public/style.css
// ---------------------------------------------------------------------------

// Découpe style.css (fins de ligne LF) en { avant, bloc, apres } autour des
// repères (repères compris dans « bloc »). Erreur claire s'ils manquent.
export function decouper(style) {
  const i = style.indexOf(REPERE_DEBUT);
  const j = style.indexOf(REPERE_FIN, i + REPERE_DEBUT.length);
  if (i < 0 || j < 0 || style.indexOf(REPERE_DEBUT, i + 1) >= 0) {
    throw new Error(`public/style.css : repères du bloc introuvables (ou en double). Il faut, chacune sur sa ligne :\n  ${REPERE_DEBUT}\n  ${REPERE_FIN}`);
  }
  const fin = j + REPERE_FIN.length;
  return { avant: style.slice(0, i), bloc: style.slice(i, fin), apres: style.slice(fin) };
}

// Bloc complet, repères compris (sans fin de ligne après le repère de fin).
export const encadrer = (css) => `${REPERE_DEBUT}\n${css.trimEnd()}\n${REPERE_FIN}`;

// ---------------------------------------------------------------------------

// Lit et contrôle les sources, construit le CSS du bloc (sans les repères).
// Renvoie { css, cles, manquantes, erreurs, anims } ; utilisé aussi par
// planche.mjs.
export async function generer() {
  const connues = await clesConnues();
  const parSlug = new Map(connues.map((c) => [slugDe(c), c]));
  const fichiers = (await readdir(SOURCES).catch(() => [])).filter((f) => f.endsWith('.svg')).sort();

  const sources = [];
  let erreurs = 0;
  for (const f of fichiers) {
    const cle = parSlug.get(f.slice(0, -4));
    if (!cle) {
      console.error(`✗ ${f} : nom inconnu (attendu : <slug>.svg, slug = clé de public/taxonomie.js avec « : » → « -- », « + » → « plus »)`);
      erreurs++;
      continue;
    }
    const s = await lireSource(path.join(SOURCES, f), cle);
    for (const e of s.erreurs) console.error(`✗ ${f} : ${e}`);
    for (const m of s.avertissements) console.warn(`! ${f} : ${m}`);
    if (s.erreurs.length) { erreurs++; continue; }
    sources.push(s);
  }

  // Ordre stable : celui de l'accueil (raccourcis, âges, genres, univers).
  sources.sort((a, b) => connues.indexOf(a.cle) - connues.indexOf(b.cle));
  const cles = sources.map((s) => s.cle);
  const manquantes = connues.filter((c) => !cles.includes(c));

  const css = [
    cssGeneral(cles),
    cssAnimations(),
    `/* --- 4. Une règle par icône (${cles.length}) -----------------------------------
   Clés sans icône (emoji gardé) : ${manquantes.length ? manquantes.join(', ') : 'aucune'}. */`,
    ...sources.map(cssCle),
  ].join('\n\n') + '\n';
  if (new RegExp(OR.slice(1), 'i').test(css)) {
    throw new Error('or restant dans les icônes (il doit devenir craie)');
  }

  return { css, cles, manquantes, erreurs, anims: Object.fromEntries(sources.map((s) => [s.cle, s.anim])) };
}

// Programme principal : génère (ou vérifie) et met à jour public/style.css.
async function principal() {
  const { css, cles, manquantes, erreurs } = await generer();
  console.log(`${cles.length} icône(s) lisible(s) dans scripts/icones/sources/.`);
  console.log(`Sans icône (emoji gardé) : ${manquantes.length ? manquantes.join(', ') : 'aucune'}.`);
  if (erreurs) {
    // Jamais d'écriture avec une source refusée : son icône disparaîtrait.
    console.error(`${erreurs} source(s) refusée(s) : public/style.css n'est pas modifié.`);
    process.exitCode = 1;
    return;
  }

  // style.css est traité en LF ; ses fins de ligne d'origine sont gardées.
  const brut = await readFile(STYLE, 'utf8');
  const crlf = brut.includes('\r\n');
  const style = crlf ? brut.replace(/\r\n/g, '\n') : brut;
  const { avant, bloc, apres } = decouper(style);
  const nouveau = encadrer(css);

  if (bloc === nouveau) {
    console.log('public/style.css : bloc des icônes à jour.');
    return;
  }
  if (VERIFIER) {
    console.error('public/style.css : bloc des icônes PAS à jour. Lancer : node scripts/icones/generer.mjs');
    process.exitCode = 1;
    return;
  }
  const resultat = avant + nouveau + apres;
  await writeFile(STYLE, crlf ? resultat.replace(/\n/g, '\r\n') : resultat, 'utf8');
  console.log(`public/style.css : bloc des icônes réécrit (${(Buffer.byteLength(nouveau) / 1024).toFixed(1)} Ko).`);
}

// Lancé directement (et non importé par planche.mjs).
if (import.meta.main ?? path.basename(process.argv[1] || '') === 'generer.mjs') {
  principal().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
