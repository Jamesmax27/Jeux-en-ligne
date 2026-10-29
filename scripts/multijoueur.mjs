#!/usr/bin/env node
// ==========================================================================
// multijoueur.mjs — règles des jeux multijoueurs pour le Worker commun
//
//   node scripts/multijoueur.mjs            écrit multijoueur/src/jeux.js
//   node scripts/multijoueur.mjs --liste    liste les jeux multijoueurs (sans rien écrire)
//   node scripts/multijoueur.mjs --version  version du Worker (empreinte du code et des règles)
//
// Un jeu multijoueur (game.json : "multijoueur": true) garde ses règles dans
// son index.html, bloc <script id="jel-regles"> (window.JEL_REGLES : fonctions
// pures, voir public/multijoueur/moteur.js et docs/multijoueur.md). Ce script
// recopie ces règles dans le Worker, pour que le serveur arbitre avec
// exactement le même code que les appareils, et note leur empreinte SHA-256
// (le lanceur envoie la sienne : une version différente → robots locaux).
//
// Le code des règles est enfermé dans une fonction qui masque window, fetch,
// WebSocket… : il ne peut que calculer (le robot de contrôle,
// scripts/tester-multijoueur.mjs, refuse aussi ces mots dans les règles).
// Les Workers interdisent eval : le code est recopié tel quel, au déploiement.
//
// Sites permis (en-tête Origin) : SITES_MULTI de public/multijoueur/config.js.
// multijoueur/src/jeux.js est ignoré par git : il est refait à chaque
// déploiement (.github/workflows/multijoueur.yml).
// ==========================================================================

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { texteRegles } from '../public/multijoueur/lanceur.js';
import { SITES_MULTI } from '../public/multijoueur/config.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_JEUX = path.join(RACINE, 'games');
const SORTIE = path.join(RACINE, 'multijoueur', 'src', 'jeux.js');
const SOURCES_WORKER = ['index.js', 'partie.js', 'accueil.js', 'moteur.js'].map((f) => path.join(RACINE, 'multijoueur', 'src', f));
const MOTEUR = path.join(RACINE, 'public', 'multijoueur', 'moteur.js');
// Noms masqués pour le code des règles dans le Worker.
const MASQUES = ['self', 'globalThis', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'caches', 'navigator', 'location', 'document', 'localStorage', 'indexedDB'];

export const empreinteTexte = (texte) => createHash('sha256').update(texte, 'utf8').digest('hex');

// Jeux multijoueurs de games/ : [{ id, fiche, html, texte (règles), empreinte }].
// Un jeu "multijoueur" sans bloc jel-regles a texte et empreinte à null.
export async function jeuxMultijoueurs(ids = null) {
  const dossiers = ids || (await readdir(DOSSIER_JEUX, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => e.name).sort();
  const jeux = [];
  for (const id of dossiers) {
    const cheminFiche = path.join(DOSSIER_JEUX, id, 'game.json');
    const cheminHtml = path.join(DOSSIER_JEUX, id, 'index.html');
    if (!existsSync(cheminFiche) || !existsSync(cheminHtml)) continue;
    let fiche;
    try { fiche = JSON.parse((await readFile(cheminFiche, 'utf8')).replace(/^﻿/, '')); } catch { continue; }
    if (fiche.multijoueur !== true) continue;
    const html = await readFile(cheminHtml, 'utf8');
    let texte = texteRegles(html);
    // Comme le build du site, un jeu fautif est écarté sans casser les autres : des règles
    // illisibles rendraient tout le Worker inutilisable.
    let erreur = null;
    if (texte) {
      try { new vm.Script(`"use strict"; (function (window, ${MASQUES.join(', ')}) {\n${texte}\n})`); }
      catch (e) { erreur = `règles illisibles (${e.message})`; texte = null; }
    }
    jeux.push({ id, fiche, html, texte, erreur, empreinte: texte ? empreinteTexte(texte) : null });
  }
  return jeux;
}

export const origines = () => SITES_MULTI.map((site) => `https://${site}`);

// Contenu de multijoueur/src/jeux.js.
export async function contenuWorker(jeux) {
  const sources = await Promise.all([MOTEUR, ...SOURCES_WORKER].map((f) => readFile(f, 'utf8')));
  const avecRegles = jeux.filter((j) => j.texte);
  const version = empreinteTexte([
    ...sources, JSON.stringify(origines()), ...avecRegles.map((j) => `${j.id}:${j.empreinte}`),
  ].join('\n')).slice(0, 16);
  const lignes = [
    '// GÉNÉRÉ par scripts/multijoueur.mjs à partir des jeux multijoueurs de games/ : ne pas modifier.',
    `export const VERSION = ${JSON.stringify(version)};`,
    `export const ORIGINES = ${JSON.stringify(origines())};`,
    'export const JEUX = {};',
  ];
  for (const j of avecRegles) {
    lignes.push(
      '',
      `// ${j.id} (games/${j.id}/index.html, bloc jel-regles)`,
      `JEUX[${JSON.stringify(j.id)}] = {`,
      `  empreinte: ${JSON.stringify(j.empreinte)},`,
      `  regles: (function (window, ${MASQUES.join(', ')}) {`,
      j.texte,
      '    return window.JEL_REGLES;',
      '  })({}),',
      '};',
    );
  }
  return { version, texte: lignes.join('\n') + '\n' };
}

async function main() {
  const args = process.argv.slice(2);
  const jeux = await jeuxMultijoueurs();
  const { version, texte } = await contenuWorker(jeux);
  if (args.includes('--version')) { console.log(version); return; }
  for (const j of jeux) {
    console.log(j.texte ? `  ✓  ${j.id} : ${j.fiche.places ?? '?'} places, règles ${j.empreinte.slice(0, 12)}…` : `  ✗  ${j.id} : ${j.erreur || 'bloc jel-regles absent'} (jeu ignoré par le Worker)`);
  }
  if (!jeux.length) console.log('  (aucun jeu multijoueur)');
  if (args.includes('--liste')) return;
  await writeFile(SORTIE, texte, 'utf8');
  console.log(`\nmultijoueur/src/jeux.js écrit : ${jeux.filter((j) => j.texte).length} jeu(x), version ${version}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('Échec :', e); process.exit(1); });
}
