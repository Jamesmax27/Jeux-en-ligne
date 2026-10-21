#!/usr/bin/env node
// ==========================================================================
// i18n-jeu.mjs — recopie le module commun de traduction dans les jeux
//
//   node scripts/i18n-jeu.mjs                 tous les jeux
//   node scripts/i18n-jeu.mjs mon-jeu autre   seulement ceux-là
//
// Chaque jeu reste un fichier autonome (jouable hors ligne, sans accès réseau) :
// il contient sa propre copie de public/i18n/i18n.js dans
//   <script id="jel-i18n"> … </script>
// juste après son bloc de textes
//   <script type="application/json" id="jel-i18n-textes"> { "fr": {…}, … } </script>
// Ce script remplace la copie par la version actuelle du module (à lancer
// après chaque modification de public/i18n/i18n.js, puis augmenter "version"
// dans game.json des jeux modifiés). Un jeu sans bloc jel-i18n est ignoré.
// Aucune dépendance : Node.js 18 ou plus suffit.
// ==========================================================================

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_JEUX = path.join(RACINE, 'games');
const RE_MODULE = /(<script\b[^>]*\bid=["']jel-i18n["'][^>]*>)[\s\S]*?(<\/script>)/i;

const module = (await readFile(path.join(RACINE, 'public', 'i18n', 'i18n.js'), 'utf8')).trim();
let ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
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
