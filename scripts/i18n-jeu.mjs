#!/usr/bin/env node
// ==========================================================================
// i18n-jeu.mjs — textes traduits des jeux
//
//   node scripts/i18n-jeu.mjs                      recopie le module commun dans tous les jeux
//   node scripts/i18n-jeu.mjs mon-jeu autre        … seulement dans ceux-là
//   node scripts/i18n-jeu.mjs --assembler mon-jeu  assemble les textes d'un jeu en création
//
// Chaque jeu reste un fichier autonome (jouable hors ligne, sans accès réseau) :
// il contient son bloc de textes
//   <script type="application/json" id="jel-i18n-textes"> { "fr": {…}, … } </script>
// suivi de sa propre copie de public/i18n/i18n.js dans
//   <script id="jel-i18n"> … </script>
//
// 1. Recopie du module (sans --assembler) : remplace la copie par la version
//    actuelle du module (à lancer après chaque modification de
//    public/i18n/i18n.js, puis augmenter "version" dans game.json des jeux
//    modifiés). Un jeu sans bloc jel-i18n est ignoré.
//
// 2. Assemblage (--assembler <id>) : pendant la création d'un jeu, ses textes
//    sont écrits à part, un fichier par langue, dans i18n-jeu/<id>/ (ignoré
//    par git) :
//      fr.json, en.json, es.json, pt.json, de.json
//      { "meta":   { "title": "…", "description": "…", "presentation": "…" },
//        "textes": { "cle": "texte", "cle2": { "one": "…", "other": "…" }, … } }
//    Le script range les "textes" de chaque langue présente dans le bloc
//    jel-i18n-textes de games/<id>/index.html (créé juste après <title> s'il
//    manque), met le module commun à jour, et recopie "meta" dans game.json :
//    français → title, description, presentation ; autres langues → "i18n".
//    Une langue absente est simplement ignorée (le jeu s'affiche alors en
//    français) : c'est scripts/check-i18n.js qui exige les 5 langues.
//    Option : --sources <dossier> (par défaut i18n-jeu/<id>).
//
// Code de sortie : 0 = bon, 1 = fichier manquant ou illisible.
// Aucune dépendance : Node.js 18 ou plus suffit.
// ==========================================================================

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_JEUX = path.join(RACINE, 'games');
const LANGUES = ['fr', 'en', 'es', 'pt', 'de'];
const CHAMPS_META = ['title', 'description', 'presentation'];
const RE_MODULE = /(<script\b[^>]*\bid=["']jel-i18n["'][^>]*>)[\s\S]*?(<\/script>)/i;
const RE_TEXTES = /(<script\b[^>]*\bid=["']jel-i18n-textes["'][^>]*>)[\s\S]*?(<\/script>)/i;

const module = (await readFile(path.join(RACINE, 'public', 'i18n', 'i18n.js'), 'utf8')).replace(/\r\n/g, '\n').trim();
const args = process.argv.slice(2);

if (args.includes('--assembler')) await assembler();
else await recopierModule();

// --------------------------------------------------------------------------
// 1. Recopie du module commun dans les jeux
// --------------------------------------------------------------------------
async function recopierModule() {
  let ids = args.filter((a) => !a.startsWith('--'));
  if (ids.length === 0) {
    ids = (await readdir(DOSSIER_JEUX, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map((e) => e.name).sort();
  }
  let modifies = 0;
  for (const id of ids) {
    const chemin = path.join(DOSSIER_JEUX, id, 'index.html');
    if (!existsSync(chemin)) continue;
    const html = await readFile(chemin, 'utf8');
    if (!RE_MODULE.test(html)) { console.log(`  –  ${id} : pas de module jel-i18n, ignoré`); continue; }
    const nouveau = html.replace(RE_MODULE, (_, ouverture, fermeture) => `${ouverture}\n${module}\n${fermeture}`);
    if (nouveau !== html) {
      await writeFile(chemin, nouveau, 'utf8');
      modifies++;
      console.log(`  ✓  ${id} : module mis à jour (pensez à augmenter "version" dans game.json)`);
    }
  }
  console.log(`\n${modifies} jeu(x) mis à jour.`);
}

// --------------------------------------------------------------------------
// 2. Assemblage des textes d'un jeu en création
// --------------------------------------------------------------------------
function arreter(message) { console.error(`✗ ${message}`); process.exit(1); }

async function lireJson(chemin) {
  try { return JSON.parse((await readFile(chemin, 'utf8')).replace(/^﻿/, '')); }
  catch (e) { arreter(`${path.relative(RACINE, chemin)} illisible : ${e.message}`); }
}

async function assembler() {
  const i = args.indexOf('--sources');
  const sourcesDemandees = i >= 0 ? args[i + 1] : null;
  const id = args.filter((a, k) => !a.startsWith('--') && (i < 0 || k !== i + 1))[0];
  if (!id) arreter('usage : node scripts/i18n-jeu.mjs --assembler <id> [--sources <dossier>]');
  const dossierJeu = path.join(DOSSIER_JEUX, id);
  const sources = path.resolve(RACINE, sourcesDemandees || path.join('i18n-jeu', id));
  const cheminHtml = path.join(dossierJeu, 'index.html');
  const cheminFiche = path.join(dossierJeu, 'game.json');
  if (!existsSync(cheminHtml)) arreter(`games/${id}/index.html introuvable`);
  if (!existsSync(cheminFiche)) arreter(`games/${id}/game.json introuvable`);
  if (!existsSync(path.join(sources, 'fr.json'))) arreter(`${path.relative(RACINE, sources)}/fr.json introuvable (textes français du jeu)`);

  // Textes de chaque langue présente.
  const textes = {}, metas = {};
  for (const lang of LANGUES) {
    const chemin = path.join(sources, `${lang}.json`);
    if (!existsSync(chemin)) continue;
    const contenu = await lireJson(chemin);
    if (!contenu || typeof contenu !== 'object' || typeof contenu.textes !== 'object' || !contenu.textes || Array.isArray(contenu.textes)) {
      arreter(`${path.relative(RACINE, chemin)} : il faut un objet { "meta": {…}, "textes": {…} }`);
    }
    textes[lang] = contenu.textes;
    metas[lang] = contenu.meta && typeof contenu.meta === 'object' ? contenu.meta : {};
  }

  // index.html : bloc de textes (créé s'il manque) puis module commun juste après.
  let html = (await readFile(cheminHtml, 'utf8')).replace(/\r\n/g, '\n');
  const json = JSON.stringify(textes, null, 1).replace(/</g, '\\u003c');
  if (RE_TEXTES.test(html)) {
    html = html.replace(RE_TEXTES, (_, ouverture, fermeture) => `${ouverture}\n${json}\n${fermeture}`);
  } else {
    const bloc = `<script type="application/json" id="jel-i18n-textes" data-coin="haut-gauche">\n${json}\n</script>`;
    const finTitre = html.search(/<\/title>/i), premierScript = html.search(/<script\b/i);
    let pos;
    if (finTitre !== -1 && (premierScript === -1 || finTitre < premierScript)) pos = finTitre + '</title>'.length;
    else if (premierScript !== -1) pos = premierScript;
    else pos = html.search(/<\/head>/i);
    if (pos < 0) arreter(`games/${id}/index.html : ni <title>, ni <script>, ni </head> pour y placer les textes`);
    html = `${html.slice(0, pos)}\n${bloc}\n${html.slice(pos)}`;
  }
  const moduleComplet = `<script id="jel-i18n">\n${module}\n</script>`;
  if (RE_MODULE.test(html)) html = html.replace(RE_MODULE, (_, ouverture, fermeture) => `${ouverture}\n${module}\n${fermeture}`);
  else html = html.replace(RE_TEXTES, (bloc) => `${bloc}\n${moduleComplet}`);
  await writeFile(cheminHtml, html, 'utf8');

  // game.json : titre, description et présentation (français), traductions dans "i18n".
  const fiche = await lireJson(cheminFiche);
  for (const champ of CHAMPS_META) {
    if (typeof metas.fr[champ] === 'string' && metas.fr[champ].trim()) fiche[champ] = metas.fr[champ].trim();
  }
  const i18n = {};
  for (const lang of LANGUES.filter((l) => l !== 'fr' && metas[l])) {
    const m = {};
    for (const champ of CHAMPS_META) if (typeof metas[lang][champ] === 'string' && metas[lang][champ].trim()) m[champ] = metas[lang][champ].trim();
    if (Object.keys(m).length) i18n[lang] = m;
  }
  // Ordre lisible : … title, description, presentation, i18n, puis le reste.
  const ordonnee = {};
  for (const [k, v] of Object.entries(fiche)) {
    if (k === 'i18n' || k === 'presentation') continue;
    ordonnee[k] = v;
    if (k === 'description') {
      if (fiche.presentation !== undefined) ordonnee.presentation = fiche.presentation;
      if (Object.keys(i18n).length) ordonnee.i18n = i18n;
    }
  }
  if (!('description' in ordonnee)) {
    if (fiche.presentation !== undefined) ordonnee.presentation = fiche.presentation;
    if (Object.keys(i18n).length) ordonnee.i18n = i18n;
  }
  await writeFile(cheminFiche, JSON.stringify(ordonnee, null, 2) + '\n', 'utf8');

  const presentes = Object.keys(textes);
  const manquantes = LANGUES.filter((l) => !presentes.includes(l));
  console.log(`✓ ${id} : textes assemblés (${presentes.join(', ')}), ${Object.keys(textes.fr).length} clés`
    + (manquantes.length ? ` ; langue(s) pas encore écrite(s) : ${manquantes.join(', ')}` : ''));
}
