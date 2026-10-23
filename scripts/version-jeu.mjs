#!/usr/bin/env node
// ==========================================================================
// version-jeu.mjs — augmente "version" dans games/<id>/game.json (+1), sans
// toucher au reste du fichier. À lancer quand index.html ou la jaquette d'un
// jeu changent : les appareils re-téléchargent alors le jeu.
//
//   node scripts/version-jeu.mjs mon-jeu autre
// ==========================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!ids.length) { console.error('usage : node scripts/version-jeu.mjs <id> [<id>…]'); process.exit(1); }

let erreurs = 0;
for (const id of ids) {
  const chemin = path.join(RACINE, 'games', id, 'game.json');
  try {
    const texte = await readFile(chemin, 'utf8');
    let ancienne = null;
    const nouveau = texte.replace(/("version"\s*:\s*)(\d+)/, (_, debut, n) => { ancienne = Number(n); return debut + (ancienne + 1); });
    if (ancienne === null) throw new Error('champ "version" introuvable');
    await writeFile(chemin, nouveau, 'utf8');
    console.log(`✓ ${id} : version ${ancienne} → ${ancienne + 1}`);
  } catch (e) {
    console.error(`✗ ${id} : ${e.message}`);
    erreurs++;
  }
}
process.exit(erreurs ? 1 : 0);
