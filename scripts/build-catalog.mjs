#!/usr/bin/env node
// ==========================================================================
// build-catalog.mjs — fabrique le site à partir du dossier games/
//
//   1. lit chaque dossier games/<id>/ (index.html + jaquette + game.json)
//   2. vérifie les règles de base ; un jeu invalide est ignoré (avec un
//      message), il ne bloque jamais la publication des autres
//   3. copie les jeux valides dans public/games/
//   4. écrit public/catalog.json (avec les titres et descriptions traduits)
//   5. écrit public/sitemap.xml (accueil et jeux, une variante ?lang= par
//      langue) et public/robots.txt. Adresse du site : variable SITE_URL
//      (réglage Cloudflare Pages, à définir avec le nom de domaine), sinon
//      ADRESSE_PAR_DEFAUT.
//
// Lancé automatiquement par Cloudflare Pages (commande de build),
// et en local avec :  npm run build   (ou  npm run dev  pour tester).
// Aucune dépendance : Node.js 18 ou plus suffit.
// ==========================================================================

import { readdir, readFile, stat, rm, mkdir, cp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDS_GENRES, IDS_UNIVERS, SECONDAIRES_MAX, UNIVERS_MAX } from '../public/taxonomie.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_JEUX = path.join(RACINE, 'games');
const DOSSIER_PUBLIC = path.join(RACINE, 'public');
const SORTIE_JEUX = path.join(DOSSIER_PUBLIC, 'games');
const SORTIE_CATALOGUE = path.join(DOSSIER_PUBLIC, 'catalog.json');
const LANGUES = ['fr', 'en', 'es', 'pt', 'de'];          // même liste que public/i18n/i18n.js
const ADRESSE_PAR_DEFAUT = 'https://jeux-en-ligne.pages.dev/';

const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_VALIDE = /^\d{4}-\d{2}-\d{2}$/;
const JAQUETTES = ['cover.webp', 'cover.png', 'cover.jpg', 'cover.jpeg', 'cover.svg']; // par ordre de préférence
const TAILLE_MAX_JEU = 2 * 1024 * 1024;   // 2 Mo
const TAILLE_MAX_JAQUETTE = 300 * 1024;   // 300 Ko (objectif : < 100 Ko en WebP)

const avertissements = [];
const rejets = [];

function avertir(id, texte) { avertissements.push(`  ⚠  ${id} : ${texte}`); }
function rejeter(id, texte) { rejets.push(`  ✗  ${id} : ${texte}`); }

async function lireJeu(nomDossier) {
  const dossier = path.join(DOSSIER_JEUX, nomDossier);

  // --- index.html ---
  const cheminJeu = path.join(dossier, 'index.html');
  if (!existsSync(cheminJeu)) return rejeter(nomDossier, 'index.html manquant');
  const tailleJeu = (await stat(cheminJeu)).size;
  if (tailleJeu > TAILLE_MAX_JEU) {
    return rejeter(nomDossier, `index.html trop lourd (${(tailleJeu / 1048576).toFixed(1)} Mo, maximum 2 Mo)`);
  }
  const html = await readFile(cheminJeu, 'utf8');
  if (/<(script|link|img|iframe|audio|video|source)\b[^>]*\b(src|href)\s*=\s*["']?\s*(https?:)?\/\//i.test(html)) {
    avertir(nomDossier, 'index.html semble charger une ressource externe (CDN, police, image…) : elle sera bloquée et le jeu risque de ne pas fonctionner');
  }

  // --- game.json ---
  const cheminFiche = path.join(dossier, 'game.json');
  if (!existsSync(cheminFiche)) return rejeter(nomDossier, 'game.json manquant');
  let fiche;
  try {
    fiche = JSON.parse(await readFile(cheminFiche, 'utf8'));
  } catch (e) {
    return rejeter(nomDossier, `game.json illisible (${e.message})`);
  }

  if (fiche.id !== nomDossier) return rejeter(nomDossier, `"id" (${JSON.stringify(fiche.id)}) doit être identique au nom du dossier`);
  if (!ID_VALIDE.test(fiche.id)) return rejeter(nomDossier, '"id" : minuscules, chiffres et tirets uniquement');
  if (typeof fiche.title !== 'string' || !fiche.title.trim()) return rejeter(nomDossier, '"title" manquant');

  // Genres et univers : listes fermées de public/taxonomie.js. Une valeur hors
  // liste est ignorée avec un avertissement (le robot, lui, la refuse).
  const liste = (valeur) => (Array.isArray(valeur) ? valeur : []).filter((x) => typeof x === 'string').map((x) => x.trim());
  let genre = typeof fiche.genre === 'string' ? fiche.genre.trim() : '';
  if (!IDS_GENRES.includes(genre)) {
    avertir(nomDossier, genre ? `"genre" hors liste (« ${genre} ») : voir public/taxonomie.js` : 'pas de "genre" : le jeu n\'apparaîtra dans aucun filtre de genre');
    genre = '';
  }
  const secondaires = [...new Set(liste(fiche.genres_secondaires))];
  const horsListeG = secondaires.filter((g) => !IDS_GENRES.includes(g));
  if (horsListeG.length) avertir(nomDossier, `"genres_secondaires" hors liste ignorés : ${horsListeG.join(', ')}`);
  const genresSecondaires = secondaires.filter((g) => IDS_GENRES.includes(g) && g !== genre).slice(0, SECONDAIRES_MAX);

  const universBruts = [...new Set(liste(fiche.univers))];
  const horsListeU = universBruts.filter((u) => !IDS_UNIVERS.includes(u));
  if (horsListeU.length) avertir(nomDossier, `"univers" hors liste ignorés : ${horsListeU.join(', ')}`);
  const univers = universBruts.filter((u) => IDS_UNIVERS.includes(u)).slice(0, UNIVERS_MAX);
  if (univers.length === 0) avertir(nomDossier, 'aucun "univers" : le jeu n\'apparaîtra dans aucun univers');
  if (fiche.tags !== undefined) avertir(nomDossier, '"tags" n\'existe plus (remplacé par "univers") : champ ignoré');

  let added = typeof fiche.added === 'string' ? fiche.added : '';
  if (!DATE_VALIDE.test(added)) {
    avertir(nomDossier, '"added" absent ou invalide (format AAAA-MM-JJ) : date du jour utilisée');
    added = new Date().toISOString().slice(0, 10);
  }

  const version = Number.isInteger(fiche.version) && fiche.version > 0 ? fiche.version : 1;

  // --- jaquette ---
  const fichierJaquette = JAQUETTES.find((nom) => existsSync(path.join(dossier, nom)));
  let cover = 'assets/sans-jaquette.svg';
  if (fichierJaquette) {
    const taille = (await stat(path.join(dossier, fichierJaquette))).size;
    if (taille > TAILLE_MAX_JAQUETTE) avertir(nomDossier, `jaquette lourde (${Math.round(taille / 1024)} Ko) : visez moins de 100 Ko en WebP`);
    cover = `games/${fiche.id}/${fichierJaquette}?v=${version}`;
  } else {
    avertir(nomDossier, 'pas de jaquette (cover.webp) : image par défaut utilisée');
  }

  // --- traductions (titre, description et présentation dans les autres langues) ---
  const i18n = {};
  const traductions = fiche.i18n && typeof fiche.i18n === 'object' ? fiche.i18n : {};
  const manquantes = [];
  for (const lang of LANGUES.filter((l) => l !== 'fr')) {
    const t = traductions[lang];
    const title = typeof t?.title === 'string' ? t.title.trim().slice(0, 80) : '';
    const description = typeof t?.description === 'string' ? t.description.trim().slice(0, 200) : '';
    const presentation = typeof t?.presentation === 'string' ? t.presentation.trim().slice(0, 1200) : '';
    if (title || description) i18n[lang] = { title, description, ...(presentation ? { presentation } : {}) };
    if (!title || !description) manquantes.push(lang);
  }
  if (manquantes.length) avertir(nomDossier, `titre ou description non traduits (${manquantes.join(', ')}) dans game.json ("i18n") : le français sera affiché`);
  // Langues dans lesquelles le catalogue propose le jeu (absent = toutes).
  const langues = Array.isArray(fiche.langues) ? fiche.langues.filter((l) => LANGUES.includes(l)) : [];

  return {
    id: fiche.id,
    title: fiche.title.trim().slice(0, 80),
    description: typeof fiche.description === 'string' ? fiche.description.trim().slice(0, 200) : '',
    // Présentation (quelques phrases) : meta description de la page du jeu ; la carte garde la description courte.
    ...(typeof fiche.presentation === 'string' && fiche.presentation.trim() ? { presentation: fiche.presentation.trim().slice(0, 1200) } : {}),
    i18n,
    ...(fiche.non_traduisible === true ? { non_traduisible: true } : {}),
    ...(langues.length ? { langues } : {}),
    genre,
    genres_secondaires: genresSecondaires,
    univers,
    ages: typeof fiche.ages === 'string' ? fiche.ages.trim().slice(0, 10) : '',
    author: typeof fiche.author === 'string' ? fiche.author.trim().slice(0, 60) : '',
    added,
    version,
    cover,
    play: `games/${fiche.id}/?v=${version}`,
  };
}

async function main() {
  if (!existsSync(DOSSIER_JEUX)) await mkdir(DOSSIER_JEUX, { recursive: true });

  const entrees = await readdir(DOSSIER_JEUX, { withFileTypes: true });
  const dossiers = entrees
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort();

  const jeux = [];
  for (const nom of dossiers) {
    try {
      const jeu = await lireJeu(nom);
      if (jeu) jeux.push(jeu);
    } catch (e) {
      rejeter(nom, `erreur inattendue (${e.message})`);
    }
  }

  // Copie des jeux valides vers public/games/ (repart d'un dossier vide).
  await rm(SORTIE_JEUX, { recursive: true, force: true });
  await mkdir(SORTIE_JEUX, { recursive: true });
  for (const jeu of jeux) {
    await cp(path.join(DOSSIER_JEUX, jeu.id), path.join(SORTIE_JEUX, jeu.id), { recursive: true });
  }

  // Du plus récent au plus ancien (le site refait son propre tri).
  jeux.sort((a, b) => b.added.localeCompare(a.added) || a.title.localeCompare(b.title, 'fr'));

  const catalogue = {
    generatedAt: new Date().toISOString(),
    count: jeux.length,
    games: jeux,     // listes et ordre des genres et des univers : public/taxonomie.js
  };
  await writeFile(SORTIE_CATALOGUE, JSON.stringify(catalogue, null, 2) + '\n', 'utf8');
  await ecrireSitemap(jeux);

  console.log(`\nCatalogue : ${jeux.length} jeu(x) publié(s), ${rejets.length} ignoré(s).`);
  if (rejets.length) console.log('\nJeux ignorés :\n' + rejets.join('\n'));
  if (avertissements.length) console.log('\nAvertissements :\n' + avertissements.join('\n'));
  console.log('');
}

// --- Plan du site pour les moteurs de recherche --------------------------------

function adresseDuSite() {
  const brute = process.env.SITE_URL || ADRESSE_PAR_DEFAUT;
  try {
    const u = new URL(brute);
    return u.href.endsWith('/') ? u.href : `${u.href}/`;
  } catch {
    return ADRESSE_PAR_DEFAUT;
  }
}

function echapperXml(texte) {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Une entrée par page et par langue, chacune listant toutes les variantes (hreflang).
// Un jeu limité à certaines langues (« langues ») n'a que ces variantes.
async function ecrireSitemap(jeux) {
  const site = adresseDuSite();
  const pages = [{ chemin: '', langues: LANGUES }, { chemin: 'mentions-legales.html', langues: LANGUES }];
  for (const jeu of jeux) pages.push({ chemin: `play.html?id=${encodeURIComponent(jeu.id)}`, langues: jeu.langues || LANGUES });

  const avecLangue = (chemin, lang) => `${site}${chemin}${chemin.includes('?') ? '&' : '?'}lang=${lang}`;
  const lignes = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  for (const page of pages) {
    const variantes = page.langues.map((lang) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${echapperXml(avecLangue(page.chemin, lang))}"/>`);
    variantes.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${echapperXml(site + page.chemin)}"/>`);
    for (const lang of page.langues) {
      lignes.push('  <url>', `    <loc>${echapperXml(avecLangue(page.chemin, lang))}</loc>`, ...variantes, '  </url>');
    }
  }
  lignes.push('</urlset>');
  await writeFile(path.join(DOSSIER_PUBLIC, 'sitemap.xml'), lignes.join('\n') + '\n', 'utf8');
  await writeFile(path.join(DOSSIER_PUBLIC, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}sitemap.xml\n`, 'utf8');
}

main().catch((e) => {
  console.error('La construction du catalogue a échoué :', e);
  process.exit(1);
});
