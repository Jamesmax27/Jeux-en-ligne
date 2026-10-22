#!/usr/bin/env node
// ==========================================================================
// scripts/icones/planche.mjs — planche de contrôle des icônes (HTML + PNG)
//
// Sert à regarder les icônes avant de les publier : chaque icône dans ses
// vrais états (puce ou tuile normale, choisie, « 0 jeu », « Bientôt »), à
// petite taille et à 48 px, puis figée au milieu de son animation.
//
// Comment lancer (depuis la racine du dépôt) :
//   node scripts/icones/planche.mjs                    toutes les icônes
//   node scripts/icones/planche.mjs --lot nouveaux --cles "genre:memoire,univers:*"
//   options : --dpr 2 (densité des captures)  --largeur 700 (px CSS ; ≥ 720 =
//             réglages « ordinateur » du site)  --html-seul (pas de capture)
//
// N'écrit RIEN dans public/ : le CSS des icônes est construit en mémoire
// (generer.mjs) à partir des sources, puis placé dans une copie de
// public/style.css. Pour publier, lancer ensuite node scripts/icones/generer.mjs.
//
// Fichiers produits (dossier captures/icones/, ignoré par git) :
//   planche.html (ou planche-<lot>.html), page autonome aux VRAIES classes du
//   site (puces .puce-filtre dans #genres / #univers, tuiles .tuile, titre
//   #titre-tendances) ;
//   planche.png (états) et planche-anim.png (animations figées à 25, 50 et
//   75 %), ou planche-<lot>.png et planche-<lot>-anim.png.
// Captures : Playwright (npm install --no-save playwright, puis
// npx playwright install chromium), ou Chrome / Edge installés, ou
// CHROMIUM_PATH = chemin d'un Chromium. Sans Playwright : --html-seul.
// ==========================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generer, clesConnues, decouper, encadrer, ANIMATIONS } from './generer.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..');
const STYLE = path.join(RACINE, 'public', 'style.css');
const TAXONOMIE = path.join(RACINE, 'public', 'taxonomie.js');
const FR = path.join(RACINE, 'public', 'i18n', 'site', 'fr.json');
const SORTIE = path.join(RACINE, 'captures', 'icones');

const args = process.argv.slice(2);
const option = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : defaut;
};
const FILTRE = option('--cles', null);
const LOT = option('--lot', FILTRE ? 'filtre' : null);
const DPR = Number(option('--dpr', 2));
const LARGEUR = Number(option('--largeur', 700));
const HTML_SEUL = args.includes('--html-seul');
const nomFichier = (suffixe, ext) => path.join(SORTIE, `planche${LOT ? `-${LOT}` : ''}${suffixe}.${ext}`);

// --- Données du site --------------------------------------------------------

// Entrées de taxonomie.js : { id, court, picto, teinte } (lecture du texte,
// sans exécuter le module).
async function taxonomie() {
  const texte = await readFile(TAXONOMIE, 'utf8');
  const liste = (nom) => {
    const debut = texte.indexOf(`export const ${nom}`);
    const bloc = texte.slice(debut, texte.indexOf('];', debut));
    return [...bloc.matchAll(/\{([^}]*)\}/g)].map(([, corps]) => {
      const champ = (c) => corps.match(new RegExp(`${c}:\\s*(?:'([^']*)'|(\\d+))`))?.slice(1).find((v) => v !== undefined);
      return { id: champ('id'), court: champ('court'), picto: champ('picto'), teinte: champ('teinte') };
    });
  };
  return { genres: liste('GENRES'), univers: liste('UNIVERS'), ages: liste('TRANCHES_AGE') };
}

const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// --- Gabarits : mêmes éléments que app.js (creerPuceFiltre, creerTuile) ----

function puce(d, etat, extraStyle = '') {
  const choisie = etat === 'choisie';
  const classes = ['puce-filtre', etat === 'zero' && 'puce-zero', etat === 'bientot' && 'puce-bientot'].filter(Boolean).join(' ');
  const compte = etat === 'bientot' ? '' : `<span class="puce-filtre-compte" aria-hidden="true">${etat === 'zero' ? 0 : d.nombre}</span>`;
  return `<button type="button" class="${classes}" data-cle="${d.cle}" style="--teinte:${d.teinte};${extraStyle}" aria-pressed="${choisie}"${etat === 'bientot' ? ' disabled' : ''}>`
    + `<span class="puce-filtre-picto" aria-hidden="true">${d.picto}</span><span>${echapper(d.nom)}</span>${compte}</button>`;
}

function tuile(d, etat, extraStyle = '') {
  const classes = ['tuile', etat === 'zero' && 'tuile-zero', etat === 'bientot' && 'tuile-bientot'].filter(Boolean).join(' ');
  const sous = etat === 'bientot' ? d.vide : etat === 'zero' ? '0 jeu' : d.sous;
  const presse = d.cle === 'hasard' ? '' : ` aria-pressed="${etat === 'choisie'}"`;
  const style = `${d.teinte !== undefined ? `--teinte:${d.teinte};` : ''}${extraStyle}`;
  return `<button type="button" class="${classes}" data-cle="${d.cle}"${style ? ` style="${style}"` : ''}${presse}${etat === 'bientot' ? ' disabled' : ''}>`
    + `<span class="tuile-picto" aria-hidden="true">${d.picto}</span><span class="tuile-nom">${echapper(d.nom)}</span><span class="tuile-compte">${echapper(sous)}</span></button>`;
}

// Icône seule, à une taille donnée, avec les couleurs de son contexte.
function specimen(d, taille, extraStyle = '') {
  if (d.type === 'tendances') {
    return `<span class="specimen-titre"><span id="titre-tendances" style="--ico-taille:${taille}px;${extraStyle}"><span aria-hidden="true">🔥</span></span></span>`;
  }
  const classe = d.type === 'puce' ? 'puce-filtre' : 'tuile';
  const picto = d.type === 'puce' ? 'puce-filtre-picto' : 'tuile-picto';
  const teinte = d.teinte !== undefined ? `--teinte:${d.teinte};` : '';
  return `<span class="specimen ${classe}" data-cle="${d.cle}" style="${teinte}--ico-taille:${taille}px;${extraStyle}"><span class="${picto}" aria-hidden="true">${d.picto}</span></span>`;
}

function titreTendances() {
  return '<div class="groupe-tete"><h2 id="titre-tendances"><span aria-hidden="true">🔥</span> <span>Tendances</span> <small>les plus joués cette semaine</small></h2></div>';
}

function nomCellule(d, anims) {
  const anim = anims[d.cle];
  return `<div class="nom"><b>${d.cle}</b><small>${anim ? `${anim}${d.type === 'tendances' ? ' (immobile)' : ''}` : 'emoji (repli)'}</small></div>`;
}

// --- Page --------------------------------------------------------------------

function page({ style, groupes, anims, sansIcone }) {
  const ETATS = ['normal', 'choisie', 'zero', 'bientot'];
  const ligneEtats = (d) => {
    if (d.type === 'tendances') {
      return `<div class="ligne">${nomCellule(d, anims)}<div class="cellule large">${titreTendances()}</div><div class="cellule">${specimen(d, 24)}</div><div class="cellule">${specimen(d, 48)}</div></div>`;
    }
    const composant = d.type === 'puce' ? puce : tuile;
    const petit = d.type === 'puce' ? 24 : 16;
    return `<div class="ligne">${nomCellule(d, anims)}${ETATS.map((e) => `<div class="cellule">${composant(d, e)}</div>`).join('')}`
      + `<div class="cellule">${specimen(d, petit)}</div><div class="cellule">${specimen(d, 48)}</div></div>`;
  };
  const ligneAnim = (d) => {
    const composant = d.type === 'puce' ? puce : tuile;
    const temps = [0.25, 0.5, 0.75];
    return `<div class="ligne ligne-anim">${nomCellule(d, anims)}`
      + temps.map((t) => `<div class="cellule">${composant(d, 'normal', `--t:${t}`).replace('class="', 'class="fige ')}</div>`).join('')
      + temps.map((t) => `<div class="cellule">${specimen(d, 48, `--t:${t}`).replace('class="specimen', 'class="fige specimen')}</div>`).join('')
      + '</div>';
  };
  const bloc = (titre, id, liste, ligne, entete) => liste.length
    ? `<div class="bloc"${id ? ` id="${id}"` : ''}><h2>${titre}</h2>${entete}${liste.map(ligne).join('')}</div>` : '';
  const enteteEtats = (petit) => `<div class="ligne entete-planche"><div></div><div>normal</div><div>choisie</div><div>0 jeu</div><div>bientôt</div><div>${petit} px</div><div>48 px</div></div>`;
  const enteteAnim = '<div class="ligne ligne-anim entete-planche"><div></div><div>25 %</div><div>50 %</div><div>75 %</div><div>48 : 25 %</div><div>50 %</div><div>75 %</div></div>';

  const nb = groupes.genres.length + groupes.univers.length + groupes.tuiles.length + groupes.titre.length;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Planche des icônes${LOT ? ` — ${LOT}` : ''}</title>
<style>
${style}
</style>
<style>
/* --- Mise en page de la planche (pas pour le site) --- */
body { padding: 16px; }
.planche { padding: 0 0 24px; }
.planche > h1 { margin: 0 0 2px; font-size: 18px; font-weight: 800; }
.planche > p { margin: 0 0 8px; color: var(--craie-douce); font-size: 12px; }
.bloc { margin-top: 14px; }
.bloc > h2 { margin: 0 0 4px; font-size: 14px; font-weight: 800; color: var(--lavande); }
.ligne { display: grid; grid-template-columns: 118px repeat(4, 102px) 34px 56px; gap: 0 8px; align-items: center; min-height: 64px; padding: 6px 0; border-top: 1px solid rgba(236, 234, 228, .07); }
.ligne-anim { grid-template-columns: 118px repeat(3, 102px) repeat(3, 56px); }
.entete-planche { min-height: 0; padding: 0 0 4px; border: 0; color: var(--craie-douce); font-size: 11px; }
.nom b { display: block; font-size: 11px; font-weight: 800; overflow-wrap: anywhere; }
.nom small { color: var(--craie-douce); font-size: 11px; }
.cellule { display: flex; align-items: center; min-width: 0; }
.cellule.large { grid-column: span 4; }
.cellule .tuile:not(.specimen) { width: 102px; }
.cellule .groupe-tete { padding: 0; }
.specimen.puce-filtre, .specimen.tuile { flex: none; min-width: 0; min-height: 0; padding: 0; border: 0; background: none; box-shadow: none; cursor: default; --ico-marge: 0px; }
.specimen.puce-filtre::before { content: none; }
.specimen-titre { display: inline-flex; }
.specimen-titre #titre-tendances { display: inline-flex; font-size: 16px; }
/* Animations figées à --t (fraction de la durée). */
.fige > :is(.tuile-picto, .puce-filtre-picto),
.fige > span[aria-hidden="true"] { animation-name: var(--ico-anim-extra, none) !important; }
.fige > :is(.tuile-picto, .puce-filtre-picto)::before,
.fige > span[aria-hidden="true"]::before { animation-name: var(--ico-anim-fond, none) !important; }
.fige > :is(.tuile-picto, .puce-filtre-picto)::after,
.fige > span[aria-hidden="true"]::after { animation-name: var(--ico-anim-trait, none) !important; }
.fige > :is(.tuile-picto, .puce-filtre-picto),
.fige > :is(.tuile-picto, .puce-filtre-picto)::before,
.fige > :is(.tuile-picto, .puce-filtre-picto)::after {
  animation-play-state: paused !important;
  animation-delay: calc(var(--ico-duree, 600ms) * var(--t, .5) * -1) !important;
}
</style>
</head>
<body>
<section class="planche" id="etats">
  <h1>Planche des icônes${LOT ? ` — lot « ${LOT} »` : ''}</h1>
  <p>${nb} icône(s) · vraies classes du site · ${LARGEUR} px de large${LARGEUR >= 720 ? ' (réglages ordinateur)' : ' (réglages téléphone)'}</p>
  ${bloc('Genres', 'genres', groupes.genres, ligneEtats, enteteEtats(24))}
  ${bloc('Univers', 'univers', groupes.univers, ligneEtats, enteteEtats(24))}
  ${bloc('Raccourcis et âges', null, groupes.tuiles, ligneEtats, enteteEtats(16))}
  ${bloc('Titre', null, groupes.titre, ligneEtats, '')}
  ${bloc('Sans icône : l’emoji reste', null, sansIcone.filter((d) => d.type !== 'tendances'), (d) => `<div class="ligne">${nomCellule(d, anims)}<div class="cellule">${(d.type === 'puce' ? puce : tuile)(d, 'normal')}</div><div class="cellule">${(d.type === 'puce' ? puce : tuile)(d, 'choisie')}</div></div>`, '')}
</section>
<section class="planche" id="anim">
  <h1>Milieu d'animation${LOT ? ` — lot « ${LOT} »` : ''}</h1>
  <p>Images figées à 25, 50 et 75 % de l'animation (survol, focus ou choix).</p>
  ${bloc('Genres', 'genres', groupes.genres, ligneAnim, enteteAnim)}
  ${bloc('Univers', 'univers', groupes.univers, ligneAnim, enteteAnim)}
  ${bloc('Raccourcis et âges', null, groupes.tuiles, ligneAnim, enteteAnim)}
</section>
</body>
</html>
`;
}

// --- Navigateur ----------------------------------------------------------------

async function lancerNavigateur() {
  let playwright;
  try { playwright = await import('playwright'); } catch {
    throw new Error('Playwright manque : npm install --no-save playwright (puis npx playwright install chromium), ou --html-seul.');
  }
  const essais = process.env.CHROMIUM_PATH
    ? [{ executablePath: process.env.CHROMIUM_PATH }]
    : [{}, { channel: 'chrome' }, { channel: 'msedge' }];
  for (const o of essais) {
    try { return await playwright.chromium.launch(o); } catch { /* essai suivant */ }
  }
  throw new Error('Aucun navigateur : Chromium de Playwright, Chrome ou Edge.');
}

// --- Principal ---------------------------------------------------------------

async function principal() {
  const { css, anims, erreurs } = await generer();
  if (erreurs) console.warn(`${erreurs} source(s) refusée(s) : absente(s) de la planche.`);
  const tax = await taxonomie();
  const fr = JSON.parse(await readFile(FR, 'utf8'));

  // Toutes les clés, dans l'ordre de l'accueil, avec ce qu'il faut pour les dessiner.
  const nombre = (i) => 1 + ((i * 7) % 9);
  const donnees = new Map();
  donnees.set('hasard', { cle: 'hasard', type: 'tuile', picto: '🎲', nom: fr['raccourci.hasard'], sous: fr['raccourci.hasardAide'], vide: fr['raccourci.aucunJeu'], teinte: 265 });
  donnees.set('collection:aimes', { cle: 'collection:aimes', type: 'tuile', picto: '👍', nom: fr['collection.aimes'], sous: '4 jeux', vide: fr['collection.aimesVide'], teinte: 230 });
  donnees.set('collection:hors-ligne', { cle: 'collection:hors-ligne', type: 'tuile', picto: '📶', nom: fr['collection.horsLigne'], sous: '2 jeux', vide: fr['collection.horsLigneVide'], teinte: 200 });
  tax.ages.forEach((a, i) => donnees.set(`age:${a.id}`, { cle: `age:${a.id}`, type: 'tuile', picto: a.picto, nom: fr[`age.${a.id}`], sous: `${nombre(i) * 3} jeux`, vide: fr['tuile.bientot'] }));
  tax.genres.forEach((g, i) => donnees.set(`genre:${g.id}`, { cle: `genre:${g.id}`, type: 'puce', picto: g.picto, nom: g.court, teinte: g.teinte, nombre: nombre(i) }));
  tax.univers.forEach((u, i) => donnees.set(`univers:${u.id}`, { cle: `univers:${u.id}`, type: 'puce', picto: u.picto, nom: u.court, teinte: u.teinte, nombre: nombre(i + 3) }));
  donnees.set('tendances', { cle: 'tendances', type: 'tendances', picto: '🔥', nom: 'Tendances' });

  // Filtre --cles : liste séparée par des virgules ; « préfixe* » accepté.
  const motifs = FILTRE ? FILTRE.split(',').map((m) => m.trim()).filter(Boolean) : null;
  const retenue = (cle) => !motifs || motifs.some((m) => (m.endsWith('*') ? cle.startsWith(m.slice(0, -1)) : cle === m));

  const ordre = await clesConnues();
  const avecIcone = ordre.filter((c) => anims[c] && retenue(c)).map((c) => donnees.get(c));
  const groupes = {
    genres: avecIcone.filter((d) => d.cle.startsWith('genre:')),
    univers: avecIcone.filter((d) => d.cle.startsWith('univers:')),
    tuiles: avecIcone.filter((d) => d.type === 'tuile'),
    titre: avecIcone.filter((d) => d.type === 'tendances'),
  };
  // Repli : une clé sans icône de chaque sorte (puce de genre, d'univers, tuile).
  const sansIcone = ['genre:', 'univers:', 'age:', 'collection:']
    .map((p) => ordre.find((c) => c.startsWith(p) && !anims[c]))
    .filter(Boolean).map((c) => donnees.get(c));

  // style.css du site, avec le bloc des icônes tiré des sources actuelles.
  const { avant, apres } = decouper((await readFile(STYLE, 'utf8')).replace(/\r\n/g, '\n'));
  const style = avant + encadrer(css) + apres;

  await mkdir(SORTIE, { recursive: true });
  const fichierHtml = nomFichier('', 'html');
  await writeFile(fichierHtml, page({ style, groupes, anims, sansIcone }), 'utf8');
  console.log(`${fichierHtml} : ${avecIcone.length} icône(s) sur la planche.`);
  if (!avecIcone.length) console.warn('Aucune icône ne correspond au filtre.');
  for (const d of avecIcone) {
    if (!ANIMATIONS[anims[d.cle]]) console.warn(`! ${d.cle} : animation inconnue`);
  }
  if (HTML_SEUL) return;

  const navigateur = await lancerNavigateur();
  try {
    const contexte = await navigateur.newContext({ viewport: { width: LARGEUR, height: 900 }, deviceScaleFactor: DPR, colorScheme: 'dark', reducedMotion: 'no-preference' });
    const p = await contexte.newPage();
    const erreursPage = [];
    p.on('console', (m) => { if (m.type() === 'error') erreursPage.push(m.text()); });
    p.on('pageerror', (e) => erreursPage.push(e.message));
    await p.goto(pathToFileURL(fichierHtml).href, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts?.ready);
    await p.waitForTimeout(200);
    const etats = nomFichier('', 'png');
    const anim = nomFichier('-anim', 'png');
    // D'abord les images figées ; puis les états au repos (les animations
    // « choisie », jouées au chargement, sont menées à leur fin).
    await p.locator('#anim').screenshot({ path: anim });
    await p.locator('#etats').screenshot({ path: etats, animations: 'disabled' });
    console.log(`${etats}\n${anim}`);
    if (erreursPage.length) console.warn(`Erreurs dans la page :\n  ${erreursPage.join('\n  ')}`);
  } finally {
    await navigateur.close();
  }
}

principal().catch((e) => {
  console.error('Planche interrompue :', e.message || e);
  process.exit(1);
});
