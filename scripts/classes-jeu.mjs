#!/usr/bin/env node
// ==========================================================================
// classes-jeu.mjs — classes de l'école d'un jeu (champ "classes" de game.json)
//
//   node scripts/classes-jeu.mjs <id> [<id>…]   pose "classes" si le jeu est éducatif
//   node scripts/classes-jeu.mjs --proposer      liste les propositions pour tous les jeux
//                                                (n'écrit rien)
//
// Pages école (docs/seo-mots-cles.md, section 5 ; adresses : urlEcole de
// public/chemins.js) : un jeu y figure par son champ "classes" (identifiants de
// CLASSES, public/taxonomie.js : cp, ce1, ce2, cm1, cm2).
// Proposition automatique (boucle de nuit, étape c ; jeux existants : relue à
// la main) : seulement pour un jeu de calcul ou de mots (genre principal ou
// secondaire), d'après son âge minimum conseillé :
//   4+ ou 5+ → cp ; 6+ → cp, ce1 ; 7+ → ce1, ce2 ; 8+ → ce2, cm1 ;
//   9+ → cm1, cm2 ; 10+ → cm2 ; 11+ et plus (dont 13+) → aucune.
// Un jeu de logique ou de culture peut recevoir ses classes à la main.
// Le script ne remplace jamais un champ "classes" déjà présent.
// ==========================================================================

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDS_CLASSES } from '../public/taxonomie.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GENRES_SCOLAIRES = ['calcul', 'mots'];

/** Classes proposées pour une fiche (game.json), ou [] si le jeu n'est pas éducatif. */
export function classesProposees(fiche) {
  const genres = [fiche.genre, ...(Array.isArray(fiche.genres_secondaires) ? fiche.genres_secondaires : [])];
  if (!genres.some((g) => GENRES_SCOLAIRES.includes(g))) return [];
  const age = parseInt(fiche.ages, 10);
  if (Number.isNaN(age) || age >= 11) return [];
  if (age <= 5) return [IDS_CLASSES[0]];   // 4+ et 5+ : cp seulement
  return IDS_CLASSES.slice(age - 6, age - 4); // 6+ → cp, ce1 ; … ; 10+ → cm2
}

/** Problèmes du champ "classes" d'une fiche (pour validate-games.mjs). */
export function problemesClasses(fiche) {
  if (fiche.classes === undefined) return [];
  if (!Array.isArray(fiche.classes) || !fiche.classes.length) return ['"classes" (facultatif) : liste non vide de classes, ex. ["ce1", "ce2"]'];
  const p = [];
  const inconnues = fiche.classes.filter((c) => !IDS_CLASSES.includes(c));
  if (inconnues.length) p.push(`"classes" : ${inconnues.join(', ')} inconnu(s) (permis : ${IDS_CLASSES.join(', ')})`);
  if (new Set(fiche.classes).size !== fiche.classes.length) p.push('"classes" : classe en double');
  if (parseInt(fiche.ages, 10) >= 13) p.push('"classes" : un jeu 13+ ne va pas sur les pages école');
  return p;
}

async function principal() {
  const args = process.argv.slice(2);
  const ids = args.includes('--proposer')
    ? (await readdir(path.join(RACINE, 'games'), { withFileTypes: true })).filter((e) => e.isDirectory() && !/^[._]/.test(e.name)).map((e) => e.name).sort()
    : args.filter((a) => !a.startsWith('--'));
  if (!ids.length) { console.log('Usage : node scripts/classes-jeu.mjs <id> [<id>…] | --proposer'); process.exit(1); }
  for (const id of ids) {
    const chemin = path.join(RACINE, 'games', id, 'game.json');
    let texte;
    try { texte = await readFile(chemin, 'utf8'); } catch { console.log(`ERREUR : ${id} : game.json introuvable`); process.exitCode = 1; continue; }
    const fiche = JSON.parse(texte.replace(/^﻿/, ''));
    const proposees = classesProposees(fiche);
    if (args.includes('--proposer')) {
      if (proposees.length || fiche.classes) console.log(`${id.padEnd(44)} ${fiche.ages.padEnd(4)} ${(fiche.classes || []).join(',').padEnd(10)} → ${proposees.join(', ') || '—'}`);
      continue;
    }
    if (fiche.classes !== undefined || !proposees.length) continue;
    fiche.classes = proposees;
    await writeFile(chemin, `${JSON.stringify(fiche, null, 2)}\n`, 'utf8');
    console.log(`${id} : classes ${proposees.join(', ')}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => { console.error(e.message); process.exit(2); });
}
