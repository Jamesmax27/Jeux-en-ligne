#!/usr/bin/env node
// ==========================================================================
// slugs-jeux.mjs — morceaux d'adresse traduits des fiches des jeux
//
//   node scripts/slugs-jeux.mjs <id> [<id>…]   ajoute les slugs manquants de ces jeux
//   node scripts/slugs-jeux.mjs --tous         … de tous les jeux
//   node scripts/slugs-jeux.mjs --verifier     contrôle seulement (code 1 si problème)
//
// Adresse d'une fiche (public/chemins.js) : /jeux/<id>/ en français (l'identifiant,
// jamais changé), /en/games/<slug en>/, /es/juegos/<slug es>/, /pt/jogos/<slug pt>/,
// /de/spiele/<slug de>/. Les slugs sont rangés dans game.json :
//   "slugs": { "en": "the-little-snow-fox", "es": "…", "pt": "…", "de": "…" }
// Ils sont tirés du titre traduit (i18n.<langue>.title) : minuscules, lettres
// sans accents (ä → ae, ß → ss…), chiffres et tirets.
//
// Règles (choix du propriétaire, novembre 2026) :
//   - un slug est posé une fois et ne change plus (même si le titre change) :
//     ce script n'écrit que les slugs absents ; une adresse publiée reste valable ;
//   - s'il faut vraiment en changer un, garder l'ancien dans
//     "anciens_slugs": { "en": ["ancien-slug"] } : son adresse mène en 301 à la nouvelle ;
//   - unique dans sa langue, et jamais égal à l'identifiant d'un autre jeu
//     (l'ancienne adresse /en/games/<id>/ de cet autre jeu mène en 301 à sa fiche).
// Appelé aussi par scripts/i18n-jeu.mjs (--assembler, --meta) : un jeu de la
// boucle de nuit reçoit ses slugs en même temps que ses textes.
// L'identifiant (dossier, votes, profil, /play?id=…) ne change jamais.
// Aucune dépendance : Node.js 18 ou plus suffit.
// ==========================================================================

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LANGUES_SLUG = ['en', 'es', 'pt', 'de'];
export const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 80;

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_JEUX = path.join(RACINE, 'games');

const REMPLACEMENTS = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', '&': ' ' };

/** Slug d'un texte : « Le Petit Renard des neiges » → « le-petit-renard-des-neiges ». */
export function slugifier(texte, lang) {
  let s = String(texte ?? '').toLowerCase();
  // Anglais : « Pony's » → « ponys » ; ailleurs l'apostrophe sépare (« l'île » → « l-ile »).
  s = s.replace(/['’]/g, lang === 'en' ? '' : ' ');
  s = s.replace(/[äöüßæœøđł&]/g, (c) => REMPLACEMENTS[c]);
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > SLUG_MAX) s = s.slice(0, SLUG_MAX).replace(/-[^-]*$/, '');
  return s;
}

// Titre d'où tirer le slug : le titre traduit ; le titre français seulement pour
// un jeu « non_traduisible ». Sans titre traduit (jeu en cours de traduction :
// --assembler passe d'abord avec le seul fr.json), pas encore de slug.
const titreDe = (fiche, lang) => {
  const t = fiche?.i18n?.[lang]?.title;
  if (typeof t === 'string' && t.trim()) return t;
  return fiche.non_traduisible === true ? fiche.title : null;
};

/**
 * Problèmes des slugs d'un ensemble de fiches ({ id, slugs, anciens_slugs, … }).
 * Renvoie [{ id, lang, message }].
 */
export function problemesSlugs(fiches) {
  const problemes = [];
  const ids = new Set(fiches.map((f) => f.id));
  for (const lang of LANGUES_SLUG) {
    const vus = new Map();
    for (const f of fiches) {
      const s = f.slugs?.[lang];
      const anciens = Array.isArray(f.anciens_slugs?.[lang]) ? f.anciens_slugs[lang] : [];
      if (s === undefined) { problemes.push({ id: f.id, lang, message: `slug ${lang} absent ("slugs" de game.json : node scripts/slugs-jeux.mjs ${f.id})` }); continue; }
      if (typeof s !== 'string' || !RE_SLUG.test(s) || s.length > SLUG_MAX) { problemes.push({ id: f.id, lang, message: `slug ${lang} « ${s} » : minuscules sans accents, chiffres et tirets, ${SLUG_MAX} caractères au plus` }); continue; }
      if (s !== f.id && ids.has(s)) problemes.push({ id: f.id, lang, message: `slug ${lang} « ${s} » : c'est l'identifiant d'un autre jeu (son ancienne adresse serait perdue)` });
      for (const a of [s, ...anciens]) {
        if (typeof a !== 'string' || !RE_SLUG.test(a)) { problemes.push({ id: f.id, lang, message: `ancien slug ${lang} « ${a} » mal écrit` }); continue; }
        if (vus.has(a) && vus.get(a) !== f.id) problemes.push({ id: f.id, lang, message: `slug ${lang} « ${a} » déjà pris par ${vus.get(a)}` });
        else vus.set(a, f.id);
      }
      // L'ancienne adresse d'un autre jeu (son identifiant) ne doit pas être prise par un ancien slug.
      for (const a of anciens) if (a !== f.id && ids.has(a)) problemes.push({ id: f.id, lang, message: `ancien slug ${lang} « ${a} » : identifiant d'un autre jeu` });
    }
  }
  return problemes;
}

/**
 * Ajoute à « fiche » les slugs qui lui manquent (sans toucher aux autres),
 * uniques parmi « autres » (les autres fiches). Renvoie la liste des langues complétées.
 */
export function completerSlugs(fiche, autres) {
  const ajoutees = [];
  const slugs = fiche.slugs && typeof fiche.slugs === 'object' ? { ...fiche.slugs } : {};
  const ids = new Set(autres.map((f) => f.id));
  for (const lang of LANGUES_SLUG) {
    if (typeof slugs[lang] === 'string' && slugs[lang]) continue;
    const titre = titreDe(fiche, lang);
    if (!titre) continue;
    const pris = new Set(autres.flatMap((f) => [f.slugs?.[lang], ...(f.anciens_slugs?.[lang] || [])]).filter(Boolean));
    const base = slugifier(titre, lang) || fiche.id;
    let s = base;
    for (let n = 2; pris.has(s) || (s !== fiche.id && ids.has(s)); n++) s = `${base}-${n}`;
    slugs[lang] = s;
    ajoutees.push(lang);
  }
  if (ajoutees.length) fiche.slugs = Object.fromEntries(LANGUES_SLUG.filter((l) => slugs[l]).map((l) => [l, slugs[l]]));
  return ajoutees;
}

/** Place "slugs" (et "anciens_slugs") juste après "i18n" dans l'objet de la fiche. */
export function ordonnerSlugs(fiche) {
  const r = {};
  for (const [k, v] of Object.entries(fiche)) {
    if (k === 'slugs' || k === 'anciens_slugs') continue;
    r[k] = v;
    if (k === 'i18n') {
      if (fiche.slugs !== undefined) r.slugs = fiche.slugs;
      if (fiche.anciens_slugs !== undefined) r.anciens_slugs = fiche.anciens_slugs;
    }
  }
  if (fiche.slugs !== undefined && !('slugs' in r)) r.slugs = fiche.slugs;
  if (fiche.anciens_slugs !== undefined && !('anciens_slugs' in r)) r.anciens_slugs = fiche.anciens_slugs;
  return r;
}

// JSON indenté de 2 espaces, comme la plupart des fiches existantes (seul le bloc
// "slugs" change dans un game.json complété).
export function enJson(objet) {
  return `${JSON.stringify(objet, null, 2)}
`;
}

async function lireFiches() {
  const fiches = [];
  for (const e of await readdir(DOSSIER_JEUX, { withFileTypes: true })) {
    if (!e.isDirectory() || /^[._]/.test(e.name)) continue;
    const chemin = path.join(DOSSIER_JEUX, e.name, 'game.json');
    if (!existsSync(chemin)) continue;
    try {
      const texte = await readFile(chemin, 'utf8');
      fiches.push({ chemin, texte, fiche: JSON.parse(texte.replace(/^﻿/, '')) });
    } catch { /* fiche illisible : signalée par les autres contrôles */ }
  }
  return fiches;
}

/** Complète les slugs de la fiche « id » (fichier games/<id>/game.json) ; renvoie les langues ajoutées. */
export async function completerSlugsDuJeu(id) {
  const toutes = await lireFiches();
  const ici = toutes.find((x) => x.fiche.id === id);
  if (!ici) throw new Error(`games/${id}/game.json introuvable`);
  const ajoutees = completerSlugs(ici.fiche, toutes.filter((x) => x !== ici).map((x) => x.fiche));
  if (ajoutees.length) await writeFile(ici.chemin, enJson(ordonnerSlugs(ici.fiche)), 'utf8');
  return ajoutees;
}

async function principal() {
  const args = process.argv.slice(2);
  const toutes = await lireFiches();
  if (args.includes('--verifier')) {
    const p = problemesSlugs(toutes.map((x) => x.fiche));
    for (const x of p) console.log(`ERREUR : ${x.id} : ${x.message}`);
    console.log(p.length ? `\n${p.length} problème(s).` : `Slugs : tout est bon (${toutes.length} jeux).`);
    process.exit(p.length ? 1 : 0);
  }
  const ids = args.includes('--tous') ? toutes.map((x) => x.fiche.id).sort() : args.filter((a) => !a.startsWith('--'));
  if (!ids.length) {
    console.log('Usage : node scripts/slugs-jeux.mjs <id> [<id>…] | --tous | --verifier');
    process.exit(1);
  }
  let n = 0;
  for (const id of ids) {
    const ici = toutes.find((x) => x.fiche.id === id);
    if (!ici) { console.log(`ERREUR : ${id} : games/${id}/game.json introuvable`); process.exitCode = 1; continue; }
    const ajoutees = completerSlugs(ici.fiche, toutes.filter((x) => x !== ici).map((x) => x.fiche));
    if (!ajoutees.length) continue;
    await writeFile(ici.chemin, enJson(ordonnerSlugs(ici.fiche)), 'utf8');
    n++;
    console.log(`${id} : ${ajoutees.map((l) => `${l} « ${ici.fiche.slugs[l]} »`).join(', ')}`);
  }
  console.log(`\n${n} fiche(s) complétée(s).`);
  const p = problemesSlugs(toutes.map((x) => x.fiche));
  for (const x of p) console.log(`ERREUR : ${x.id} : ${x.message}`);
  if (p.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => { console.error(e.message); process.exit(2); });
}
