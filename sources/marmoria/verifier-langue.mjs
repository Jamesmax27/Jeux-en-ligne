#!/usr/bin/env node
// ==========================================================================
// verifier-langue.mjs — contrôle rapide d'une traduction de Marmoria
//
//   node sources/marmoria/verifier-langue.mjs <en|es|pt|de>
//
// Compare sources/marmoria/textes/<langue>.json au français (fr.json) : mêmes
// clés, aucune valeur vide, mêmes {variables}, mêmes formes de pluriel ; puis
// les textes de la fiche (meta) avec les règles du site (scripts/regles-seo.mjs :
// longueurs de chaque champ, bloc de 150 à 300 mots, marques interdites).
// Ne touche à aucun fichier. Code de sortie 0 = tout est bon.
// ==========================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { problemesChamps } from '../../scripts/regles-seo.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lang = process.argv[2];
if (!['en', 'es', 'pt', 'de'].includes(lang)) { console.log('usage : node sources/marmoria/verifier-langue.mjs <en|es|pt|de>'); process.exit(1); }
const fr = JSON.parse(await readFile(path.join(ICI, 'textes', 'fr.json'), 'utf8'));
const tr = JSON.parse(await readFile(path.join(ICI, 'textes', `${lang}.json`), 'utf8'));
const pb = [];
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const [k, v] of Object.entries(fr.textes)) {
  const w = tr.textes?.[k];
  if (w === undefined) { pb.push(`clé manquante : ${k}`); continue; }
  if (typeof v === 'object') {
    if (typeof w !== 'object' || !w.one || !w.other) { pb.push(`${k} : pluriel { one, other } attendu`); continue; }
    for (const f of ['one', 'other']) if (vars(w[f]) !== vars(v[f])) pb.push(`${k}.${f} : variables ${vars(w[f])} au lieu de ${vars(v[f])}`);
  } else {
    if (typeof w !== 'string' || !w.trim()) { pb.push(`${k} : valeur vide`); continue; }
    if (vars(w) !== vars(v)) pb.push(`${k} : variables {${vars(w)}} au lieu de {${vars(v)}}`);
  }
}
for (const k of Object.keys(tr.textes || {})) if (!(k in fr.textes)) pb.push(`clé en trop : ${k}`);
for (const k of Object.keys(fr.meta)) if (!tr.meta?.[k]) pb.push(`meta.${k} manquant`);
// Règles du site sur une fiche fictive : français (déjà contrôlé) + cette langue.
const fiche = { id: 'marmoria', ages: '13+', ...fr.meta, i18n: { [lang]: tr.meta } };
for (const p of problemesChamps(fiche)) if (p.lang === lang) pb.push(`${p.niveau === 'erreur' ? '' : '(attention) '}${p.message}`);
if (pb.length) { console.log(pb.map((p) => `✗ ${p}`).join('\n')); console.log(`${lang} : ${pb.length} problème(s).`); process.exit(1); }
console.log(`${lang} : tout est bon (${Object.keys(fr.textes).length} clés, textes de la fiche conformes).`);
