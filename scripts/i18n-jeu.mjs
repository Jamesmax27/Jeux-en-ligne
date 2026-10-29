#!/usr/bin/env node
// ==========================================================================
// i18n-jeu.mjs — textes traduits des jeux
//
//   node scripts/i18n-jeu.mjs                      recopie le module commun dans tous les jeux
//   node scripts/i18n-jeu.mjs mon-jeu autre        … seulement dans ceux-là
//   node scripts/i18n-jeu.mjs --assembler mon-jeu  assemble les textes d'un jeu en création
//   node scripts/i18n-jeu.mjs --meta mon-jeu       range seulement les textes de la fiche (game.json)
//
// Chaque jeu reste un fichier autonome (jouable hors ligne, sans accès réseau) :
// il contient son bloc de textes
//   <script type="application/json" id="jel-i18n-textes"> { "fr": {…}, … } </script>
// suivi de sa propre copie de public/i18n/i18n.js dans
//   <script id="jel-i18n"> … </script>
//
// suivie de sa copie du module de sauvegarde public/save.js dans
//   <script id="jel-sauvegarde"> … </script>
// et, pour un jeu multijoueur (game.json : "multijoueur": true), de sa copie
// du moteur commun public/multijoueur/moteur.js dans
//   <script id="jel-multi"> … </script>   (docs/multijoueur.md)
//
// 1. Recopie des modules (sans --assembler) : remplace les copies par la
//    version actuelle des modules (à lancer après chaque modification de
//    public/i18n/i18n.js ou de public/save.js, puis augmenter "version" dans
//    game.json des jeux modifiés) ; ajoute le module de sauvegarde juste après
//    jel-i18n s'il manque. Un jeu sans bloc jel-i18n est ignoré.
//
// 2. Assemblage (--assembler <id>) : pendant la création d'un jeu, ses textes
//    sont écrits à part, un fichier par langue, dans i18n-jeu/<id>/ (ignoré
//    par git) :
//      fr.json, en.json, es.json, pt.json, de.json
//      { "meta":   { "title": "…", "description": "…", "titre_seo": "…",
//                    "description_seo": "…", "presentation": "…", "regles": "…",
//                    "competences": "…", "jaquette_alt": "…" },
//        "textes": { "cle": "texte", "cle2": { "one": "…", "other": "…" }, … } }
//    Le script range les "textes" de chaque langue présente dans le bloc
//    jel-i18n-textes de games/<id>/index.html (créé juste après <title> s'il
//    manque), met le module commun à jour, et recopie "meta" dans game.json :
//    (avec le module de sauvegarde), et recopie "meta" dans game.json :
//    français → à la racine (title, description, textes de référencement) ;
//    autres langues → "i18n". Les champs de "meta" absents ne changent pas.
//    Une langue absente est simplement ignorée (le jeu s'affiche alors en
//    français) : c'est scripts/check-i18n.js qui exige les 5 langues.
//    Règles des textes de référencement : scripts/regles-seo.mjs.
//    Option : --sources <dossier> (par défaut i18n-jeu/<id>).
//
// 3. Fiche seule (--meta <id>) : comme --assembler, mais seulement "meta"
//    (les fichiers peuvent ne contenir que { "meta": {…} }) ; index.html n'est
//    pas touché, donc le jeu ne change pas. "maj" (date de modification) reçoit
//    la date du jour. Sert à écrire ou corriger les textes d'un jeu publié.
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
// Textes de la fiche, dans l'ordre où ils sont rangés dans game.json.
const CHAMPS_META = ['title', 'description', 'titre_seo', 'description_seo', 'presentation', 'regles', 'competences', 'jaquette_alt'];
const RE_MODULE = /(<script\b[^>]*\bid=["']jel-i18n["'][^>]*>)[\s\S]*?(<\/script>)/i;
const RE_TEXTES = /(<script\b[^>]*\bid=["']jel-i18n-textes["'][^>]*>)[\s\S]*?(<\/script>)/i;
const RE_SAUVEGARDE = /(<script\b[^>]*\bid=["']jel-sauvegarde["'][^>]*>)[\s\S]*?(<\/script>)/i;
const RE_MULTI = /(<script\b[^>]*\bid=["']jel-multi["'][^>]*>)[\s\S]*?(<\/script>)/i;

const module = (await readFile(path.join(RACINE, 'public', 'i18n', 'i18n.js'), 'utf8')).replace(/\r\n/g, '\n').trim();
const moduleSauvegarde = (await readFile(path.join(RACINE, 'public', 'save.js'), 'utf8')).replace(/\r\n/g, '\n').trim();
const moduleMulti = (await readFile(path.join(RACINE, 'public', 'multijoueur', 'moteur.js'), 'utf8')).replace(/\r\n/g, '\n').trim();
if (/<\/script/i.test(module + moduleSauvegarde + moduleMulti)) {
  console.error('✗ public/i18n/i18n.js, public/save.js ou public/multijoueur/moteur.js contient « </script » : la copie couperait les jeux.');
  process.exit(1);
}
// Le moteur est recopié avant le bloc jel-regles : une balise script écrite dans ses
// commentaires serait prise pour ce bloc (empreinte, Worker, robot).
if (/<script\b/i.test(moduleMulti)) {
  console.error('✗ public/multijoueur/moteur.js contient « <script » : la recherche du bloc jel-regles se tromperait.');
  process.exit(1);
}
const args = process.argv.slice(2);

if (args.includes('--assembler')) await assembler();
else if (args.includes('--meta')) await assembler({ metaSeule: true });
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
    const multi = await estMultijoueur(path.join(DOSSIER_JEUX, id, 'game.json'));
    const nouveau = rangerMulti(rangerSauvegarde(html.replace(RE_MODULE, (_, ouverture, fermeture) => `${ouverture}\n${module}\n${fermeture}`)), multi);
    if (nouveau !== html) {
      await writeFile(chemin, nouveau, 'utf8');
      modifies++;
      console.log(`  ✓  ${id} : modules mis à jour (pensez à augmenter "version" dans game.json)`);
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

async function assembler({ metaSeule = false } = {}) {
  const option = metaSeule ? '--meta' : '--assembler';
  const i = args.indexOf('--sources');
  const sourcesDemandees = i >= 0 ? args[i + 1] : null;
  const id = args.filter((a, k) => !a.startsWith('--') && (i < 0 || k !== i + 1))[0];
  if (!id) arreter(`usage : node scripts/i18n-jeu.mjs ${option} <id> [--sources <dossier>]`);
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
    const objet = (x) => x && typeof x === 'object' && !Array.isArray(x);
    if (!objet(contenu) || (metaSeule ? !objet(contenu.meta) : !objet(contenu.textes))) {
      arreter(`${path.relative(RACINE, chemin)} : il faut un objet { "meta": {…}${metaSeule ? '' : ', "textes": {…}'} }`);
    }
    if (!metaSeule) textes[lang] = contenu.textes;
    metas[lang] = objet(contenu.meta) ? contenu.meta : {};
  }

  if (!metaSeule) await rangerTextes(id, cheminHtml, textes, await estMultijoueur(cheminFiche));
  await rangerMeta(cheminFiche, metas, { maj: metaSeule });

  if (metaSeule) {
    console.log(`✓ ${id} : textes de la fiche rangés dans game.json (${Object.keys(metas).join(', ')})`);
    return;
  }
  const presentes = Object.keys(textes);
  const manquantes = LANGUES.filter((l) => !presentes.includes(l));
  console.log(`✓ ${id} : textes assemblés (${presentes.join(', ')}), ${Object.keys(textes.fr).length} clés`
    + (manquantes.length ? ` ; langue(s) pas encore écrite(s) : ${manquantes.join(', ')}` : ''));
}

// index.html : bloc de textes (créé s'il manque) puis module commun juste après.
async function rangerTextes(id, cheminHtml, textes, multi) {
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
  await writeFile(cheminHtml, rangerMulti(rangerSauvegarde(html), multi), 'utf8');
}

async function estMultijoueur(cheminFiche) {
  try { return JSON.parse((await readFile(cheminFiche, 'utf8')).replace(/^﻿/, '')).multijoueur === true; } catch { return false; }
}

// Moteur multijoueur (public/multijoueur/moteur.js) : mis à jour s'il est déjà
// là, ajouté juste après le module de sauvegarde pour un jeu multijoueur.
function rangerMulti(html, multi) {
  if (RE_MULTI.test(html)) return html.replace(RE_MULTI, (_, ouverture, fermeture) => `${ouverture}\n${moduleMulti}\n${fermeture}`);
  if (!multi) return html;
  const m = RE_SAUVEGARDE.exec(html);
  if (!m) return html;
  const fin = m.index + m[0].length;
  return `${html.slice(0, fin)}\n<script id="jel-multi">\n${moduleMulti}\n</script>${html.slice(fin)}`;
}

// Module de sauvegarde (public/save.js) : mis à jour, ou ajouté juste après le
// module de traduction (avant le code du jeu, qui peut donc l'appeler).
function rangerSauvegarde(html) {
  if (RE_SAUVEGARDE.test(html)) {
    return html.replace(RE_SAUVEGARDE, (_, ouverture, fermeture) => `${ouverture}\n${moduleSauvegarde}\n${fermeture}`);
  }
  const m = RE_MODULE.exec(html);
  if (!m) return html;
  const fin = m.index + m[0].length;
  return `${html.slice(0, fin)}\n<script id="jel-sauvegarde">\n${moduleSauvegarde}\n</script>${html.slice(fin)}`;
}

// game.json : textes de la fiche en français à la racine, traductions dans "i18n".
// Un champ absent de "meta" garde sa valeur actuelle. maj : date du jour dans "maj".
async function rangerMeta(cheminFiche, metas, { maj = false } = {}) {
  const fiche = await lireJson(cheminFiche);
  const texte = (m, champ) => (typeof m?.[champ] === 'string' && m[champ].trim() ? m[champ].trim() : null);
  for (const champ of CHAMPS_META) {
    const v = texte(metas.fr, champ);
    if (v !== null) fiche[champ] = v;
  }
  const i18n = fiche.i18n && typeof fiche.i18n === 'object' ? fiche.i18n : {};
  for (const lang of LANGUES.filter((l) => l !== 'fr')) {
    const m = { ...(i18n[lang] || {}) };
    for (const champ of CHAMPS_META) {
      const v = texte(metas[lang], champ);
      if (v !== null) m[champ] = v;
    }
    if (Object.keys(m).length) i18n[lang] = rangerChamps(m);
  }
  if (maj) fiche.maj = new Date().toISOString().slice(0, 10);

  // Ordre lisible : id, textes de la fiche (CHAMPS_META), i18n, puis le reste ;
  // "maj" juste après "added".
  const ordonnee = {};
  if ('id' in fiche) ordonnee.id = fiche.id;
  for (const champ of CHAMPS_META) if (fiche[champ] !== undefined) ordonnee[champ] = fiche[champ];
  if (Object.keys(i18n).length) ordonnee.i18n = i18n;
  for (const [k, v] of Object.entries(fiche)) {
    if (k in ordonnee || k === 'maj') continue;
    ordonnee[k] = v;
    if (k === 'added' && fiche.maj !== undefined) ordonnee.maj = fiche.maj;
  }
  if (fiche.maj !== undefined && !('maj' in ordonnee)) ordonnee.maj = fiche.maj;
  await writeFile(cheminFiche, enJson(ordonnee), 'utf8');
}

function rangerChamps(m) {
  const r = {};
  for (const champ of CHAMPS_META) if (m[champ] !== undefined) r[champ] = m[champ];
  for (const [k, v] of Object.entries(m)) if (!(k in r)) r[k] = v;
  return r;
}

// JSON indenté de 2 espaces, listes de textes courtes sur une seule ligne
// (« "univers": ["ferme", "nature"] »), comme dans les fiches existantes.
function enJson(objet) {
  return JSON.stringify(objet, null, 2)
    .replace(/\[\n\s+((?:"(?:[^"\\\n]|\\.)*"|-?\d[\d.]*|true|false|null)(?:,\n\s+(?:"(?:[^"\\\n]|\\.)*"|-?\d[\d.]*|true|false|null))*)\n\s*\]/g,
      (_, contenu) => `[${contenu.split(/,\n\s+/).join(', ')}]`) + '\n';
}
