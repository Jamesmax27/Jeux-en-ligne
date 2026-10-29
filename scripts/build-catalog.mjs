#!/usr/bin/env node
// ==========================================================================
// build-catalog.mjs — fabrique le site à partir du dossier games/
//
//   1. lit chaque dossier games/<id>/ (index.html + jaquette + game.json)
//   2. vérifie les règles de base ; un jeu invalide est ignoré (avec un
//      message), il ne bloque jamais la publication des autres. Sur
//      Cloudflare (variable CF_PAGES), un jeu ajouté depuis REGLES_SEO_DEPUIS
//      dont les textes de référencement ne respectent pas scripts/regles-seo.mjs
//      n'est pas publié non plus
//   3. copie les jeux valides dans public/games/ (index.html et jaquette)
//   4. écrit public/catalog.json (avec les titres et descriptions traduits)
//   5. écrit les pages HTML du site, le sitemap et robots.txt
//      (scripts/pages-seo.mjs : accueils, fiches des jeux, catégories, 404).
//      Adresse du site : variable SITE_URL, sinon https://freemicrogames.com/.
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
import { genererPages } from './pages-seo.mjs';
import { problemesChamps, languesDuJeu, REGLES_SEO_DEPUIS } from './regles-seo.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_JEUX = path.join(RACINE, 'games');
const DOSSIER_PUBLIC = path.join(RACINE, 'public');
const SORTIE_JEUX = path.join(DOSSIER_PUBLIC, 'games');
const SORTIE_CATALOGUE = path.join(DOSSIER_PUBLIC, 'catalog.json');
const LANGUES = ['fr', 'en', 'es', 'pt', 'de'];          // même liste que public/i18n/i18n.js
const SUR_CLOUDFLARE = process.env.CF_PAGES === '1';      // posée par Cloudflare Pages pendant ses builds

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
    fiche = JSON.parse((await readFile(cheminFiche, 'utf8')).replace(/^﻿/, ''));
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
    if (title || description) i18n[lang] = { title, description };
    if (!title || !description) manquantes.push(lang);
  }
  if (manquantes.length) avertir(nomDossier, `titre ou description non traduits (${manquantes.join(', ')}) dans game.json ("i18n") : le français sera affiché`);
  // Langues dans lesquelles le catalogue propose le jeu (absent = toutes) : même
  // règle que les pages générées (le français, langue source, en fait toujours partie).
  const langues = Array.isArray(fiche.langues) && fiche.langues.length ? languesDuJeu(fiche) : [];

  // Textes de référencement (scripts/regles-seo.mjs) : obligatoires pour les jeux
  // ajoutés depuis REGLES_SEO_DEPUIS. Sur Cloudflare, un tel jeu non conforme
  // n'est pas publié (le contrôle bloquant a lieu avant, dans la pull request).
  const erreursSeo = problemesChamps(fiche).filter((p) => p.niveau === 'erreur');
  if (erreursSeo.length && added >= REGLES_SEO_DEPUIS) {
    const resume = `textes de référencement non conformes (${erreursSeo.length} erreur(s), voir node scripts/regles-seo.mjs ${fiche.id})`;
    if (SUR_CLOUDFLARE) return rejeter(nomDossier, `${resume} : jeu non publié`);
    avertir(nomDossier, `${resume} : il ne serait pas publié sur Cloudflare`);
  }

  // Les textes longs (présentation, règles…) vont seulement dans la page du jeu
  // (pages-seo.mjs) : catalog.json garde ce que montrent les cartes.
  return {
    id: fiche.id,
    title: fiche.title.trim().slice(0, 80),
    description: typeof fiche.description === 'string' ? fiche.description.trim().slice(0, 200) : '',
    i18n,
    ...(fiche.non_traduisible === true ? { non_traduisible: true } : {}),
    ...(langues.length ? { langues } : {}),
    // Jeu multijoueur (docs/multijoueur.md) : rubrique « Multijoueur » et étiquette « Multi » du catalogue.
    ...(fiche.multijoueur === true ? { multijoueur: true, places: Number.isInteger(fiche.places) ? fiche.places : null } : {}),
    genre,
    genres_secondaires: genresSecondaires,
    univers,
    ages: typeof fiche.ages === 'string' ? fiche.ages.trim().slice(0, 10) : '',
    author: typeof fiche.author === 'string' ? fiche.author.trim().slice(0, 60) : '',
    added,
    version,
    cover,
    play: `games/${fiche.id}/?v=${version}`,
    fichierJaquette: fichierJaquette || null,
    fiche,                                   // game.json complet, pour les pages (retiré du catalogue)
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

  // Copie des jeux valides vers public/games/ (repart d'un dossier vide) : le jeu
  // et sa jaquette seulement (game.json n'est lu par aucune page du site).
  await rm(SORTIE_JEUX, { recursive: true, force: true });
  await mkdir(SORTIE_JEUX, { recursive: true });
  for (const jeu of jeux) {
    await mkdir(path.join(SORTIE_JEUX, jeu.id), { recursive: true });
    for (const fichier of ['index.html', jeu.fichierJaquette].filter(Boolean)) {
      await cp(path.join(DOSSIER_JEUX, jeu.id, fichier), path.join(SORTIE_JEUX, jeu.id, fichier));
    }
  }

  // Du plus récent au plus ancien (le site refait son propre tri).
  jeux.sort((a, b) => b.added.localeCompare(a.added) || a.title.localeCompare(b.title, 'fr'));

  const catalogue = {
    generatedAt: new Date().toISOString(),
    count: jeux.length,
    // listes et ordre des genres et des univers : public/taxonomie.js
    games: jeux.map(({ fiche, fichierJaquette, ...entree }) => entree),
  };
  await writeFile(SORTIE_CATALOGUE, JSON.stringify(catalogue, null, 2) + '\n', 'utf8');

  // Pages HTML (accueils, fiches, catégories, 404), sitemap.xml et robots.txt.
  const { pages, avertissements: avertissementsPages, fichiers } = await genererPages({ jeux, racine: RACINE, dossierPublic: DOSSIER_PUBLIC });
  avertissements.push(...avertissementsPages.map((texte) => `  ⚠  ${texte}`));

  const indexees = pages.filter((p) => p.indexable).length;
  console.log(`\nCatalogue : ${jeux.length} jeu(x) publié(s), ${rejets.length} ignoré(s).`);
  console.log(`Pages : ${pages.length} générée(s), dont ${indexees} dans le sitemap ; ${fichiers} fichiers dans public/.`);
  if (rejets.length) console.log('\nJeux ignorés :\n' + rejets.join('\n'));
  if (avertissements.length) console.log('\nAvertissements :\n' + avertissements.join('\n'));
  console.log('');
}

main().catch((e) => {
  console.error('La construction du catalogue a échoué :', e);
  process.exit(1);
});
