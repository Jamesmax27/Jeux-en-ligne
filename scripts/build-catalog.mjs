#!/usr/bin/env node
// ==========================================================================
// build-catalog.mjs — fabrique le site à partir du dossier games/
//
//   1. lit chaque dossier games/<id>/ (index.html + jaquette + game.json)
//   2. vérifie les règles de base ; un jeu invalide est ignoré (avec un
//      message), il ne bloque jamais la publication des autres
//   3. copie les jeux valides dans public/games/
//   4. écrit public/catalog.json
//
// Lancé automatiquement par Cloudflare Pages (commande de build),
// et en local avec :  npm run build   (ou  npm run dev  pour tester).
// Aucune dépendance : Node.js 18 ou plus suffit.
// ==========================================================================

import { readdir, readFile, stat, rm, mkdir, cp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_JEUX = path.join(RACINE, 'games');
const DOSSIER_PUBLIC = path.join(RACINE, 'public');
const SORTIE_JEUX = path.join(DOSSIER_PUBLIC, 'games');
const SORTIE_CATALOGUE = path.join(DOSSIER_PUBLIC, 'catalog.json');

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

  const tags = Array.isArray(fiche.tags)
    ? [...new Set(fiche.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().toLowerCase()))]
    : [];
  if (tags.length === 0) avertir(nomDossier, 'aucun "tags" : le jeu n\'apparaîtra dans aucun thème');

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

  return {
    id: fiche.id,
    title: fiche.title.trim().slice(0, 80),
    description: typeof fiche.description === 'string' ? fiche.description.trim().slice(0, 200) : '',
    tags,
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
    games: jeux,
  };
  await writeFile(SORTIE_CATALOGUE, JSON.stringify(catalogue, null, 2) + '\n', 'utf8');

  console.log(`\nCatalogue : ${jeux.length} jeu(x) publié(s), ${rejets.length} ignoré(s).`);
  if (rejets.length) console.log('\nJeux ignorés :\n' + rejets.join('\n'));
  if (avertissements.length) console.log('\nAvertissements :\n' + avertissements.join('\n'));
  console.log('');
}

main().catch((e) => {
  console.error('La construction du catalogue a échoué :', e);
  process.exit(1);
});
