#!/usr/bin/env node
// ==========================================================================
// etoiles-jeu.mjs — déclare dans games/<id>/game.json ce que le jeu envoie au
// profil joueur quand il est terminé (CONSIGNES-JEU.md, « Jeu terminé et
// étoiles » ; docs/cadrage-fidelisation.md) :
//
//   node scripts/etoiles-jeu.mjs <id> <n>             "etoiles": n (étoiles possibles dans tout le jeu)
//   node scripts/etoiles-jeu.mjs <id> --sans-etoiles  jeu sans étoiles (reportComplete({}))
//   node scripts/etoiles-jeu.mjs <id> --sans-fin      "sans_fin": true (le jeu ne se termine jamais)
//   … --version                                       augmente aussi "version" et met "maj" à aujourd'hui
//                                                     (index.html modifié : les appareils re-téléchargent le jeu)
//
// Le champ est placé après "niveaux" (ou à la fin), sans toucher au reste du fichier.
// ==========================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const [id, valeur] = args.filter((a) => !a.startsWith('--') || ['--sans-etoiles', '--sans-fin'].includes(a));
const version = args.includes('--version');

if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !valeur) {
  console.error('Usage : node scripts/etoiles-jeu.mjs <id> <nombre | --sans-etoiles | --sans-fin> [--version]');
  process.exit(1);
}

const chemin = path.join(RACINE, 'games', id, 'game.json');
const fiche = JSON.parse(await readFile(chemin, 'utf8'));
delete fiche.etoiles;
delete fiche.sans_fin;
const ajout = {};
if (valeur === '--sans-fin') ajout.sans_fin = true;
else if (valeur !== '--sans-etoiles') {
  const n = Number(valeur);
  if (!Number.isInteger(n) || n < 1 || n > 1500) {
    console.error('Le nombre d\'étoiles possibles doit être un entier de 1 à 1500.');
    process.exit(1);
  }
  ajout.etoiles = n;
}
if (version) {
  fiche.version = (Number.isInteger(fiche.version) ? fiche.version : 0) + 1;
  fiche.maj = new Date().toISOString().slice(0, 10);
}

// Ordre des champs : après "niveaux" s'il existe, sinon à la fin.
const sortie = {};
let place = false;
for (const [cle, v] of Object.entries(fiche)) {
  sortie[cle] = v;
  if (cle === 'niveaux') { Object.assign(sortie, ajout); place = true; }
}
if (!place) Object.assign(sortie, ajout);

await writeFile(chemin, `${JSON.stringify(sortie, null, 2)}\n`, 'utf8');
console.log(`${id} : ${ajout.sans_fin ? 'jeu sans fin' : ajout.etoiles ? `${ajout.etoiles} étoiles possibles` : 'jeu sans étoiles'}${version ? `, version ${fiche.version}` : ''}`);
