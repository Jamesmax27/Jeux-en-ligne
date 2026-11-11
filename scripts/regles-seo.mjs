#!/usr/bin/env node
// ==========================================================================
// regles-seo.mjs — règles des textes de référencement d'un jeu (game.json)
//
// Source unique des règles, lue par le générateur de pages (pages-seo.mjs),
// le vérificateur (verifier-seo.mjs) et les agents qui écrivent les textes.
//
// Champs, en français à la racine de game.json et traduits dans
// "i18n": { "en": {…}, "es": {…}, "pt": {…}, "de": {…} } :
//   titre_seo        balise <title> complète de la page du jeu   50 à 60 caractères
//   description_seo  meta description, Open Graph, JSON-LD        140 à 160 caractères
//   presentation     « À propos du jeu » (principe, univers)       70 à 150 mots
//   regles           « Comment jouer » (but, gestes, étoiles,      50 à 130 mots
//                    nombre réel de niveaux)
//   competences      « Ce que le jeu fait travailler » : 2 à 4      20 à 160 caractères
//                    compétences séparées par des virgules
//   jaquette_alt     texte alternatif de la jaquette               40 à 125 caractères
// À la racine seulement : "maj" (AAAA-MM-JJ, facultatif) = date de la dernière
// modification du jeu ou de ses textes (sert de lastmod au sitemap).
// Bloc affiché sur la page (presentation + regles + âge + compétences) :
// 150 à 300 mots dans chaque langue.
//
// Pages de catégories (genres, univers, âges) : leurs textes sont écrits une
// seule fois, pour les 29 catégories des listes fermées (même vides, sauf
// « autre », qui n'a pas de page), dans gabarits/textes/categories.<langue>.json :
//   { "genre.puzzle": { "h1": "…", "titre_seo": "…", "description_seo": "…", "intro": "…" },
//     "univers.chevaux": {…}, "age.3-4": {…}, … }
//   h1 10 à 70 caractères, titre_seo 50 à 60, description_seo 140 à 160, intro 80 à 150 mots
//   (sans nom de jeu : la liste des jeux change).
//
// Ligne de commande (contrôle des champs seulement, sans construire le site) :
//   node scripts/regles-seo.mjs                 tous les jeux
//   node scripts/regles-seo.mjs <id> [<id>…]    ces jeux (doublons cherchés dans tout le catalogue)
//   node scripts/regles-seo.mjs --categories    textes des pages de catégories
// Sortie : « ERREUR : … », « attention : … », puis un bilan.
// Code de sortie : 0 = bon, 1 = erreurs, 2 = panne (dossier ou fichier illisible).
// Le contrôle complet des pages construites : scripts/verifier-seo.mjs.
// ==========================================================================

import { readdir, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE_DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const LANGUES = ['fr', 'en', 'es', 'pt', 'de'];

// Bornes de chaque champ : [minimum, maximum, unité].
export const BORNES = {
  titre_seo: [50, 60, 'car'],
  description_seo: [140, 160, 'car'],
  presentation: [70, 150, 'mots'],
  regles: [50, 130, 'mots'],
  competences: [20, 160, 'car'],
  jaquette_alt: [40, 125, 'car'],
};
export const CHAMPS_SEO = Object.keys(BORNES);

// Bloc de texte visible de la page du jeu, compté en mots dans chaque langue.
export const BLOC_MOTS = [150, 300];

// Jeux ajoutés à partir de cette date : sans textes conformes, le build Cloudflare
// ne les publie pas. Les jeux plus anciens restent publiés, page en « noindex ».
export const REGLES_SEO_DEPUIS = '2026-10-24';

// Marques et personnages protégés (CLAUDE.md, section 5) : interdits partout.
export const MARQUES = [
  'pac-?man', 'pok[eé]mon', 'pikachu', 'mario', 'luigi', 'zelda', 'kirby', 'nintendo', 'sonic', 'sega',
  'disney', 'mickey', 'reine des neiges', 'minecraft', 'roblox', 'fortnite', 'tetris',
  'playmobil', 'barbie', 'peppa', 'pat.? ?patrouille', 'paw patrol', 'spider-?man',
  'hello kitty', 'angry birds', 'candy crush', 'playstation', 'xbox',
];
// Marques qui sont aussi des mots courants (« marvel at », « among us », « lego » en
// espagnol) : refusées seulement écrites comme des noms propres.
const MARQUES_CASSE = ['Marvel', 'Among Us', 'LEGO', 'Lego'];
const RE_MARQUES_SEULES = new RegExp(`(?<![\\p{L}\\p{N}])(?:${MARQUES.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
const RE_MARQUES_CASSE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${MARQUES_CASSE.join('|')})(?![\\p{L}\\p{N}])`, 'u');
const RE_MARQUES = { exec: (texte) => RE_MARQUES_SEULES.exec(texte) || RE_MARQUES_CASSE.exec(texte) };

// Formules toutes faites (simple attention) : un texte doit décrire CE jeu.
const FORMULES = [
  'plonge dans', 'des heures de', 'petits et grands', 'toute la famille', 'aventure inoubliable', 'expérience unique',
  'dive into', 'hours of fun', 'young and old', 'unforgettable', 'whole family',
  'sumérgete', 'horas de diversión', 'grandes y pequeños', 'toda la familia',
  'mergulhe', 'horas de diversão', 'pequenos e grandes', 'toda a família',
  'tauche ein', 'stundenlang', 'groß und klein', 'ganze familie',
];

// Un texte alternatif décrit l'image : il ne commence pas par « Image de… ».
const RE_ALT_DEBUT = /^(?:image|photo|illustration|jaquette|couverture|picture|cover|imagen|ilustraci[oó]n|portada|imagem|ilustra[cç][aã]o|capa|bild|foto|titelbild)\b/iu;

/** Longueur en caractères (points de code, comme le compte de Google). */
export function longueur(texte) {
  return [...String(texte ?? '')].length;
}

/** Nombre de mots d'un texte dans une langue (Intl.Segmenter). */
export function compterMots(texte, lang = 'fr') {
  const t = String(texte ?? '');
  try {
    let n = 0;
    for (const s of new Intl.Segmenter(lang, { granularity: 'word' }).segment(t)) if (s.isWordLike) n++;
    return n;
  } catch {
    return t.split(/\s+/).filter(Boolean).length;
  }
}

/** Textes d'une langue : français à la racine, autres langues dans "i18n". */
export function textesLangue(fiche, lang) {
  const source = lang === 'fr' ? fiche : fiche?.i18n?.[lang];
  const textes = {};
  for (const champ of ['title', 'description', ...CHAMPS_SEO]) {
    const v = source?.[champ];
    textes[champ] = typeof v === 'string' ? v.trim() : '';
  }
  return textes;
}

/** Langues dans lesquelles le jeu est proposé (« langues » absent = toutes). */
export function languesDuJeu(fiche) {
  const liste = Array.isArray(fiche?.langues) ? fiche.langues.filter((l) => LANGUES.includes(l)) : [];
  return liste.length ? (liste.includes('fr') ? liste : ['fr', ...liste]) : LANGUES;
}

/** Âge minimum conseillé (« 6+ » → 6), ou null. */
export function ageMinimum(ages) {
  const n = parseInt(ages, 10);
  return Number.isNaN(n) ? null : n;
}

// Date de demain (UTC) : une date « maj » posée à l'heure de Paris n'est jamais
// jugée dans le futur par un build lancé juste après minuit.
const demain = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

// Lignes fixes du bloc de la page (gabarits/jeu.html), dans chaque langue :
// textes du site public/i18n/site/<langue>.json (clés page.*).
const textesSite = {};
function texteSite(lang, cle) {
  if (!textesSite[lang]) {
    try {
      textesSite[lang] = JSON.parse(readFileSync(path.join(RACINE_DEPOT, 'public', 'i18n', 'site', `${lang}.json`), 'utf8').replace(/^﻿/, ''));
    } catch {
      textesSite[lang] = {};
    }
  }
  const v = textesSite[lang][cle];
  return typeof v === 'string' ? v : '';
}

/**
 * Nombre de mots du bloc de texte affiché sur la page du jeu, dans une langue :
 * présentation, règles, ligne d'âge, compétences (avec leur intitulé) et, pour
 * un jeu non_traduisible hors français, la note de langue. Même compte que
 * celui de la page construite (scripts/verifier-seo.mjs).
 */
export function motsDuBloc(fiche, lang) {
  const tx = textesLangue(fiche, lang);
  const age = ageMinimum(fiche.ages);
  const morceaux = [tx.presentation || tx.description, tx.regles];
  if (age !== null) morceaux.push(texteSite(lang, 'page.ageConseille').replace('{n}', String(age)));
  if (tx.competences) morceaux.push(texteSite(lang, 'page.competences'), tx.competences);
  if (lang !== 'fr' && fiche.non_traduisible === true) morceaux.push(texteSite(lang, 'page.enFrancais'));
  return morceaux.reduce((n, m) => n + compterMots(m, lang), 0);
}

/**
 * Problèmes des textes SEO d'une fiche (game.json déjà lu).
 * Renvoie une liste de { niveau: 'erreur' | 'attention', lang, champ, message }.
 */
export function problemesChamps(fiche) {
  const problemes = [];
  const ajouter = (niveau, lang, champ, message) => problemes.push({ niveau, lang, champ, message });

  for (const lang of languesDuJeu(fiche)) {
    const tx = textesLangue(fiche, lang);
    const ou = lang === 'fr' ? '' : `i18n.${lang}.`;
    for (const [champ, [min, max, unite]] of Object.entries(BORNES)) {
      const texte = tx[champ];
      if (!texte) { ajouter('erreur', lang, champ, `"${ou}${champ}" manquant`); continue; }
      const n = unite === 'mots' ? compterMots(texte, lang) : longueur(texte);
      const nom = unite === 'mots' ? 'mots' : 'caractères';
      if (n < min || n > max) ajouter('erreur', lang, champ, `"${ou}${champ}" : ${n} ${nom} (attendu : ${min} à ${max})`);
      if (/\s{2,}|^\s|\s$/.test(String((lang === 'fr' ? fiche : fiche.i18n?.[lang])?.[champ] ?? ''))) {
        ajouter('attention', lang, champ, `"${ou}${champ}" : espaces en double ou en bord de texte`);
      }
      const formule = FORMULES.find((f) => texte.toLowerCase().includes(f));
      if (formule) ajouter('attention', lang, champ, `"${ou}${champ}" : formule toute faite « ${formule} » (décrire ce jeu précisément)`);
    }
    for (const champ of ['title', 'description', ...CHAMPS_SEO]) {
      const m = RE_MARQUES.exec(tx[champ]);
      if (m) ajouter('erreur', lang, champ, `"${ou}${champ}" : marque protégée « ${m[0]} » (CLAUDE.md, section 5)`);
    }
    if (tx.jaquette_alt && RE_ALT_DEBUT.test(tx.jaquette_alt)) {
      ajouter('attention', lang, 'jaquette_alt', `"${ou}jaquette_alt" : décrire ce que montre l'image, sans commencer par « image », « jaquette »…`);
    }
    if (tx.titre_seo && tx.title && tx.titre_seo === tx.title) {
      ajouter('attention', lang, 'titre_seo', `"${ou}titre_seo" identique au titre : y ajouter ce qu'est le jeu (genre, âge…)`);
    }
    if (tx.presentation && tx.regles) {
      const bloc = motsDuBloc(fiche, lang);
      if (bloc < BLOC_MOTS[0] || bloc > BLOC_MOTS[1]) {
        ajouter('erreur', lang, 'bloc', `bloc de texte de la page : ${bloc} mots (attendu : ${BLOC_MOTS[0]} à ${BLOC_MOTS[1]} ; présentation + règles + âge + compétences)`);
      }
    }
  }

  if (fiche.maj !== undefined) {
    if (typeof fiche.maj !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fiche.maj)) ajouter('erreur', 'fr', 'maj', '"maj" : format AAAA-MM-JJ attendu');
    else if (typeof fiche.added === 'string' && fiche.maj < fiche.added) ajouter('erreur', 'fr', 'maj', `"maj" (${fiche.maj}) avant "added" (${fiche.added})`);
    else if (fiche.maj > demain()) ajouter('erreur', 'fr', 'maj', `"maj" (${fiche.maj}) dans le futur`);
  }
  if (ageMinimum(fiche.ages) === null) ajouter('erreur', 'fr', 'ages', '"ages" manquant ou illisible (ex. « 6+ »)');
  return problemes;
}

/**
 * Doublons exacts de titre_seo et description_seo entre jeux, langue par langue.
 * fiches : liste de game.json ; ids : jeux contrôlés (null = tous).
 */
export function doublonsEntreJeux(fiches, ids = null) {
  const problemes = [];
  for (const lang of LANGUES) {
    for (const champ of ['titre_seo', 'description_seo']) {
      const vus = new Map();
      for (const f of fiches) {
        if (!languesDuJeu(f).includes(lang)) continue;
        const v = textesLangue(f, lang)[champ].toLowerCase();
        if (!v) continue;
        if (!vus.has(v)) vus.set(v, []);
        vus.get(v).push(f.id);
      }
      for (const liste of vus.values()) {
        if (liste.length < 2) continue;
        for (const id of liste) {
          if (ids && !ids.includes(id)) continue;
          problemes.push({ id, niveau: 'erreur', lang, champ, message: `"${lang === 'fr' ? '' : `i18n.${lang}.`}${champ}" identique à celui de ${liste.filter((x) => x !== id).join(', ')}` });
        }
      }
    }
  }
  return problemes;
}

// --------------------------------------------------------------------------
// Textes des pages de catégories
// --------------------------------------------------------------------------

// Titre : 30 à 60 caractères (forme « Jeux de <thème> gratuits | Free Micro Games »,
// choix du propriétaire de novembre 2026, plus courte que celle des fiches).
// Introduction : 120 à 200 mots (docs/seo-mots-cles.md). Mêmes règles pour les
// pages école (gabarits/textes/ecole.<langue>.json), avec en plus "nom" (libellé
// court de la puce : « CE1 », « 2nd grade »…).
export const BORNES_CATEGORIE = {
  h1: [10, 70, 'car'],
  titre_seo: [30, 60, 'car'],
  description_seo: [140, 160, 'car'],
  intro: [120, 200, 'mots'],
};
export const FAQ_NOMBRE = [3, 5];
export const FAQ_QUESTION = [10, 120];
export const FAQ_REPONSE = [20, 400];
export const NOM_ECOLE = [2, 24];
// Suite de mots identiques entre deux pages d'une même langue : texte recopié.
export const SUITE_CATEGORIES = 10;

/** Clés des pages école d'une langue : « ecole.<classe> » (CLASSES_PAR_LANGUE de taxonomie.js). */
export function clesEcoles({ CLASSES_PAR_LANGUE = {} }, lang) {
  return (CLASSES_PAR_LANGUE[lang] || []).map((id) => `ecole.${id}`);
}

/** Problèmes des textes des pages école d'une langue (mêmes règles que les catégories, plus "nom"). */
export function problemesEcoles(textes, lang, cles) {
  const problemes = problemesCategories(textes, lang, cles);
  for (const cle of cles) {
    const nom = typeof textes?.[cle]?.nom === 'string' ? textes[cle].nom.trim() : '';
    if (longueur(nom) < NOM_ECOLE[0] || longueur(nom) > NOM_ECOLE[1]) problemes.push({ niveau: 'erreur', lang, cle, message: `"nom" (libellé court de la puce) : ${NOM_ECOLE[0]} à ${NOM_ECOLE[1]} caractères` });
  }
  return problemes;
}

/**
 * Introductions et réponses recopiées d'une page à l'autre dans une langue :
 * une suite de SUITE_CATEGORIES mots identiques (mots de 3 lettres ou plus).
 * textes : { cle: { intro, faq } } (catégories et pages école réunies).
 */
export function suitesCommunesCategories(textes, lang) {
  const motsDe = (t) => {
    try { return [...new Intl.Segmenter(lang, { granularity: 'word' }).segment(String(t).toLowerCase())].filter((x) => x.isWordLike).map((x) => x.segment).filter((m) => m.length >= 3); } catch { return String(t).toLowerCase().split(/\W+/).filter((m) => m.length >= 3); }
  };
  const vues = new Map();
  const problemes = [];
  for (const [cle, c] of Object.entries(textes || {})) {
    const m = motsDe([c?.intro, ...(Array.isArray(c?.faq) ? c.faq.map((x) => x?.r) : [])].filter(Boolean).join(' '));
    const ici = new Set();
    for (let i = 0; i + SUITE_CATEGORIES <= m.length; i++) {
      const suite = m.slice(i, i + SUITE_CATEGORIES).join(' ');
      if (ici.has(suite)) continue;
      ici.add(suite);
      if (vues.has(suite) && vues.get(suite) !== cle) { problemes.push({ niveau: 'erreur', lang, cle, message: `texte commun avec ${vues.get(suite)} (« ${suite}… ») : chaque page a son propre texte` }); break; }
      vues.set(suite, cle);
    }
  }
  return problemes;
}

/**
 * Clés des 29 catégories : « genre.<id> », « univers.<id> », « age.<id de tranche> ».
 * « autre » n'en fait pas partie : il n'a ni page ni puce (public/taxonomie.js).
 */
export function clesCategories({ IDS_GENRES, IDS_UNIVERS, TRANCHES_AGE, ID_AUTRE = 'autre' }) {
  return [
    ...IDS_GENRES.filter((id) => id !== ID_AUTRE).map((id) => `genre.${id}`),
    ...IDS_UNIVERS.filter((id) => id !== ID_AUTRE).map((id) => `univers.${id}`),
    ...TRANCHES_AGE.map((t) => `age.${t.id}`),
  ];
}

/**
 * Problèmes des textes de catégories d'une langue.
 * textes : contenu de categories.<lang>.json ; cles : clesCategories(...).
 */
export function problemesCategories(textes, lang, cles) {
  const problemes = [];
  const ajouter = (niveau, cle, message) => problemes.push({ niveau, lang, cle, message });
  if (!textes || typeof textes !== 'object') return [{ niveau: 'erreur', lang, cle: '*', message: 'fichier absent ou illisible' }];
  for (const cle of cles) {
    const c = textes[cle];
    if (!c || typeof c !== 'object') { ajouter('erreur', cle, 'textes manquants'); continue; }
    for (const [champ, [min, max, unite]] of Object.entries(BORNES_CATEGORIE)) {
      const texte = typeof c[champ] === 'string' ? c[champ].trim() : '';
      // « {n} » (nombre de jeux, remplacé au build) : seulement dans l'introduction et les réponses.
      if (champ !== 'intro' && texte.includes('{n}')) ajouter('erreur', cle, `"${champ}" : « {n} » seulement dans "intro" et "faq" (longueur fixe)`);
      if (!texte) { ajouter('erreur', cle, `"${champ}" manquant`); continue; }
      const n = unite === 'mots' ? compterMots(texte, lang) : longueur(texte);
      if (n < min || n > max) ajouter('erreur', cle, `"${champ}" : ${n} ${unite === 'mots' ? 'mots' : 'caractères'} (attendu : ${min} à ${max})`);
      const m = RE_MARQUES.exec(texte);
      if (m) ajouter('erreur', cle, `"${champ}" : marque protégée « ${m[0]} »`);
      const formule = FORMULES.find((f) => texte.toLowerCase().includes(f));
      if (formule) ajouter('attention', cle, `"${champ}" : formule toute faite « ${formule} »`);
    }
    // Questions fréquentes (facultatives) : 3 à 5, question et réponse courtes, sans doublon.
    if (c.faq !== undefined) {
      if (!Array.isArray(c.faq) || c.faq.length < FAQ_NOMBRE[0] || c.faq.length > FAQ_NOMBRE[1]) ajouter('erreur', cle, `"faq" : liste de ${FAQ_NOMBRE[0]} à ${FAQ_NOMBRE[1]} questions { "q": …, "r": … }`);
      else {
        const vues = new Set();
        c.faq.forEach((x, i) => {
          const q = typeof x?.q === 'string' ? x.q.trim() : '';
          const r = typeof x?.r === 'string' ? x.r.trim() : '';
          if (longueur(q) < FAQ_QUESTION[0] || longueur(q) > FAQ_QUESTION[1]) ajouter('erreur', cle, `"faq" n° ${i + 1} : question de ${FAQ_QUESTION[0]} à ${FAQ_QUESTION[1]} caractères`);
          if (longueur(r) < FAQ_REPONSE[0] || longueur(r) > FAQ_REPONSE[1]) ajouter('erreur', cle, `"faq" n° ${i + 1} : réponse de ${FAQ_REPONSE[0]} à ${FAQ_REPONSE[1]} caractères`);
          if (vues.has(q.toLowerCase())) ajouter('erreur', cle, `"faq" n° ${i + 1} : question en double`);
          vues.add(q.toLowerCase());
          if (RE_MARQUES.exec(`${q} ${r}`)) ajouter('erreur', cle, `"faq" n° ${i + 1} : marque protégée`);
        });
      }
    }
    // Date de la dernière retouche des textes (facultative) : lastmod du sitemap.
    if (c.maj !== undefined && !(typeof c.maj === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.maj))) ajouter('erreur', cle, '"maj" : date AAAA-MM-JJ attendue');
  }
  for (const cle of Object.keys(textes)) if (!cles.includes(cle)) ajouter('erreur', cle, 'catégorie inconnue (listes fermées de public/taxonomie.js)');
  for (const champ of ['h1', 'titre_seo', 'description_seo']) {
    const vus = new Map();
    for (const cle of cles) {
      const v = String(textes[cle]?.[champ] ?? '').trim().toLowerCase();
      if (!v) continue;
      if (vus.has(v)) ajouter('erreur', cle, `"${champ}" identique à celui de ${vus.get(v)}`);
      else vus.set(v, cle);
    }
  }
  return problemes;
}

// --------------------------------------------------------------------------
// Ligne de commande
// --------------------------------------------------------------------------

/** Textes des pages école d'une langue, ou null si le fichier n'existe pas. */
export async function lireTextesEcole(racine, lang) {
  let brut;
  try { brut = await readFile(path.join(racine, 'gabarits', 'textes', `ecole.${lang}.json`), 'utf8'); } catch { return null; }
  try { return JSON.parse(brut.replace(/^\uFEFF/, '')); } catch { return {}; }
}

async function controlerCategories(racine) {
  const taxonomie = await import(pathToFileURL(path.join(racine, 'public', 'taxonomie.js')).href);
  const cles = clesCategories(taxonomie);
  let erreurs = 0;
  let attentions = 0;
  for (const lang of LANGUES) {
    let textes = null;
    try {
      textes = JSON.parse((await readFile(path.join(racine, 'gabarits', 'textes', `categories.${lang}.json`), 'utf8')).replace(/^﻿/, ''));
    } catch { /* signalé ci-dessous */ }
    // Pages école (fichier facultatif : sans lui, pas de page école dans la langue).
    const ecoles = await lireTextesEcole(racine, lang);
    const clesE = clesEcoles(taxonomie, lang);
    const problemes = [
      ...problemesCategories(textes, lang, cles),
      ...(ecoles === null ? [] : clesE.length ? problemesEcoles(ecoles, lang, clesE) : [{ niveau: 'erreur', lang, cle: '*', message: `gabarits/textes/ecole.${lang}.json : pas de pages école dans cette langue (CLASSES_PAR_LANGUE)` }]),
      ...suitesCommunesCategories({ ...(textes || {}), ...(ecoles || {}) }, lang),
    ];
    for (const p of problemes) {
      console.log(`${p.niveau === 'erreur' ? 'ERREUR' : 'attention'} : catégories ${lang} : ${p.cle} : ${p.message}`);
      if (p.niveau === 'erreur') erreurs++; else attentions++;
    }
  }
  console.log(erreurs
    ? `\n${erreurs} erreur(s) à corriger${attentions ? `, ${attentions} attention(s)` : ''}.`
    : `\nTextes des catégories : tout est bon (${cles.length} catégories × ${LANGUES.length} langues${attentions ? `, ${attentions} attention(s)` : ''}).`);
  process.exit(erreurs ? 1 : 0);
}

async function lireFiches(dossierJeux) {
  const dossiers = (await readdir(dossierJeux, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => e.name).sort();
  const fiches = [];
  for (const nom of dossiers) {
    try {
      fiches.push({ id: nom, ...JSON.parse((await readFile(path.join(dossierJeux, nom, 'game.json'), 'utf8')).replace(/^﻿/, '')) });
    } catch (e) {
      fiches.push({ id: nom, illisible: e.message });
    }
  }
  return fiches;
}

async function principal() {
  const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (process.argv.includes('--categories')) return controlerCategories(racine);
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  let fiches;
  try {
    fiches = await lireFiches(path.join(racine, 'games'));
  } catch (e) {
    console.error(`Panne : dossier games/ illisible (${e.message})`);
    process.exit(2);
  }
  const connus = new Set(fiches.map((f) => f.id));
  const inconnus = ids.filter((id) => !connus.has(id));
  if (inconnus.length) {
    console.error(`Panne : jeu(x) introuvable(s) dans games/ : ${inconnus.join(', ')}`);
    process.exit(2);
  }
  const controles = ids.length ? fiches.filter((f) => ids.includes(f.id)) : fiches;
  let erreurs = 0;
  let attentions = 0;
  for (const f of controles) {
    if (f.illisible) {
      console.log(`ERREUR : ${f.id} : game.json illisible (${f.illisible})`);
      erreurs++;
      continue;
    }
    for (const p of problemesChamps(f)) {
      console.log(`${p.niveau === 'erreur' ? 'ERREUR' : 'attention'} : ${f.id} : ${p.lang} : ${p.message}`);
      if (p.niveau === 'erreur') erreurs++; else attentions++;
    }
  }
  for (const p of doublonsEntreJeux(fiches.filter((f) => !f.illisible), ids.length ? ids : null)) {
    console.log(`ERREUR : ${p.id} : ${p.lang} : ${p.message}`);
    erreurs++;
  }
  console.log(erreurs
    ? `\n${erreurs} erreur(s) à corriger${attentions ? `, ${attentions} attention(s)` : ''}.`
    : `\nTextes SEO : tout est bon (${controles.length} jeu(x)${attentions ? `, ${attentions} attention(s)` : ''}).`);
  process.exit(erreurs ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) principal();
