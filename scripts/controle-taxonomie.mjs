#!/usr/bin/env node
// ==========================================================================
// controle-taxonomie.mjs — genres et univers : uniquement ceux des listes
// fermées de public/taxonomie.js (fichier de référence unique)
//
//   node scripts/controle-taxonomie.mjs              tous les jeux et toutes les idées
//   node scripts/controle-taxonomie.mjs mon-jeu …    seulement ces jeux (et toutes les idées)
//
// Échoue (code de sortie 1) si :
//   - un jeu (games/<id>/game.json) a un "genre" hors liste, des
//     "genres_secondaires" hors liste (2 au plus, sans doublon, différents du
//     genre principal), des "univers" hors liste (1 ou 2, sans doublon), ou
//     garde l'ancien champ "tags" ;
//   - une idée (idees.json, idees-archive.json) fait de même (idees.json :
//     0 à 2 univers, liste vide = l'agent créateur les choisit ; archive : 1 ou 2) ;
//   - « autre » est combiné avec un autre univers, ou sert de genre secondaire ;
//   - la taxonomie elle-même est incohérente : identifiant en double ou mal
//     formé, ancien identifiant (ANCIENS_IDS) encore dans les listes ou qui
//     mène hors liste, libellé français des fichiers de langue (genre.<id>, …court)
//     différent de taxonomie.js, formulaire .github/ISSUE_TEMPLATE/idee-jeu.yml
//     dont les listes Genre et Univers ne reprennent pas les libellés, dans l'ordre,
//     ou dont la liste Âge n'est pas AGES ; tranches d'âge avec un trou, sans
//     adresse (SLUGS_AGE de chemins.js), ancienne tranche qui mène hors liste.
//
// Branché dans la boucle de nuit (étape d, vérification de chaque jeu) et dans
// validate.yml. Les fonctions problemesClassementJeu et problemesClassementIdee
// servent aussi à validate-games.mjs et idees.mjs (mêmes règles partout).
// ==========================================================================

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  GENRES, UNIVERS, IDS_GENRES, IDS_UNIVERS, SECONDAIRES_MAX, UNIVERS_MIN, UNIVERS_MAX, ANCIENS_IDS,
  TRANCHES_AGE, ANCIENNES_TRANCHES, AGES, AGE_ADOS, trancheDeAge,
} from '../public/taxonomie.js';
import { SLUGS_AGE } from '../public/chemins.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --------------------------------------------------------------------------
// Règles (partagées)
// --------------------------------------------------------------------------

// Valeur hors liste, avec l'identifiant qui la remplace s'il s'agit d'un ancien
// identifiant (regroupement d'octobre 2026, ANCIENS_IDS).
function horsListe(famille, x) {
  const nouveau = ANCIENS_IDS[famille][x];
  return nouveau ? `${JSON.stringify(x)} (ancien identifiant : utiliser ${JSON.stringify(nouveau)})` : JSON.stringify(x ?? null);
}

// Une liste d'identifiants : tableau de textes, tous dans « permis », sans doublon.
function problemesListe(nom, valeur, famille, permis, min, max) {
  if (!Array.isArray(valeur)) return [`"${nom}" doit être une liste (${min} à ${max})`];
  const p = [];
  if (valeur.length < min || valeur.length > max) p.push(`"${nom}" : ${min === max ? min : `${min} à ${max}`} attendu(s), ${valeur.length} trouvé(s)`);
  const hors = valeur.filter((x) => !permis.includes(x));
  if (hors.length) p.push(`"${nom}" hors liste : ${hors.map((x) => horsListe(famille, x)).join(', ')}`);
  if (new Set(valeur).size !== valeur.length) p.push(`"${nom}" : valeur en double`);
  return p;
}

// Règles communes aux jeux et aux idées.
function problemesClassement(f, universMin) {
  const p = [];
  if (!IDS_GENRES.includes(f.genre)) p.push(`"genre" hors liste (${horsListe('genre', f.genre)})`);
  if (f.genres_secondaires !== undefined) {
    p.push(...problemesListe('genres_secondaires', f.genres_secondaires, 'genre', IDS_GENRES, 0, SECONDAIRES_MAX));
    if (Array.isArray(f.genres_secondaires)) {
      if (f.genres_secondaires.includes(f.genre)) p.push('"genres_secondaires" ne doit pas reprendre le genre principal');
      if (f.genres_secondaires.includes('autre')) p.push('« autre » ne peut pas être un genre secondaire');
    }
  }
  p.push(...problemesListe('univers', f.univers, 'univers', IDS_UNIVERS, universMin, UNIVERS_MAX));
  if (Array.isArray(f.univers) && f.univers.includes('autre') && f.univers.length > 1) p.push('l\'univers « autre » ne se combine pas avec un autre univers');
  if (f.tags !== undefined) p.push('"tags" n\'existe plus : utiliser "univers" (liste de public/taxonomie.js)');
  return p;
}

/** Problèmes de classement d'une fiche game.json (liste vide = conforme). */
export function problemesClassementJeu(fiche) {
  return problemesClassement(fiche || {}, UNIVERS_MIN);
}

/** Problèmes de classement d'une idée. universObligatoire : idée archivée ou proposée par l'agent. */
export function problemesClassementIdee(idee, { universObligatoire = false } = {}) {
  return problemesClassement(idee || {}, universObligatoire ? UNIVERS_MIN : 0);
}

/** Rappel des listes, pour les messages d'erreur. */
export const RAPPEL_LISTES = `genres : ${IDS_GENRES.join(', ')} — univers : ${IDS_UNIVERS.join(', ')}`;

// --------------------------------------------------------------------------
// Contrôle complet (ligne de commande)
// --------------------------------------------------------------------------

async function lireJson(chemin) {
  return JSON.parse((await readFile(chemin, 'utf8')).replace(/^﻿/, ''));
}

// La taxonomie elle-même : identifiants, libellés des fichiers de langue, formulaire d'idées.
async function problemesTaxonomie() {
  const p = [];
  for (const [nom, liste] of [['GENRES', GENRES], ['UNIVERS', UNIVERS]]) {
    const ids = liste.map((x) => x.id);
    if (new Set(ids).size !== ids.length) p.push(`taxonomie.js : identifiant en double dans ${nom}`);
    for (const x of liste) {
      if (!/^[a-z]+$/.test(x.id)) p.push(`taxonomie.js : identifiant « ${x.id} » (minuscules sans accents uniquement)`);
      if (!x.libelle || !x.court || !x.picto || !Number.isFinite(x.teinte)) p.push(`taxonomie.js : « ${x.id} » incomplet (libelle, court, picto, teinte)`);
      // Le formulaire d'idées joint les univers cochés par des virgules.
      if (nom === 'UNIVERS' && /[,;]/.test(`${x.libelle}${x.court}`)) p.push(`taxonomie.js : univers « ${x.id} » : pas de virgule ni de point-virgule dans les libellés (formulaire d'idées)`);
    }
  }
  // Anciens identifiants : jamais dans les listes, remplacés par un identifiant des listes.
  for (const [famille, ids] of [['genre', IDS_GENRES], ['univers', IDS_UNIVERS]]) {
    for (const [ancien, nouveau] of Object.entries(ANCIENS_IDS[famille])) {
      if (ids.includes(ancien)) p.push(`taxonomie.js : ANCIENS_IDS.${famille}.${ancien} est encore dans la liste`);
      if (!ids.includes(nouveau)) p.push(`taxonomie.js : ANCIENS_IDS.${famille}.${ancien} mène à « ${nouveau} », hors liste`);
    }
  }

  // Libellés français : identiques à taxonomie.js (les 4 autres langues ont les mêmes clés : check-i18n.js).
  try {
    const fr = await lireJson(path.join(RACINE, 'public', 'i18n', 'site', 'fr.json'));
    for (const [famille, liste] of [['genre', GENRES], ['univers', UNIVERS]]) {
      for (const x of liste) {
        if (fr[`${famille}.${x.id}`] !== x.libelle) p.push(`fr.json : « ${famille}.${x.id} » doit valoir « ${x.libelle} »`);
        if (fr[`${famille}.${x.id}.court`] !== x.court) p.push(`fr.json : « ${famille}.${x.id}.court » doit valoir « ${x.court} »`);
      }
    }
    const connues = new Set([...GENRES.map((g) => `genre.${g.id}`), ...UNIVERS.map((u) => `univers.${u.id}`)]);
    for (const cle of Object.keys(fr)) {
      if (/^(genre|univers)\./.test(cle) && !connues.has(cle.replace(/\.court$/, ''))) p.push(`fr.json : clé « ${cle} » hors liste (à retirer des 5 fichiers de langue)`);
      if (/^tag\./.test(cle)) p.push(`fr.json : clé « ${cle} » : les tags n'existent plus`);
    }
  } catch (e) {
    p.push(`public/i18n/site/fr.json illisible : ${e.message}`);
  }

  // Formulaire « Nouvelle idée de jeu » : listes déroulantes Genre et Univers = libellés, dans l'ordre.
  const formulaire = path.join(RACINE, '.github', 'ISSUE_TEMPLATE', 'idee-jeu.yml');
  if (existsSync(formulaire)) {
    const texte = (await readFile(formulaire, 'utf8')).replace(/\r/g, '');
    for (const [id, liste] of [['genre', GENRES], ['univers', UNIVERS]]) {
      // Options : lignes « - … » en retrait (le champ suivant du formulaire, « - type: », l'est moins).
      const bloc = new RegExp(`\\n\\s*id: ${id}\\n[\\s\\S]*?options:\\n((?:[ \\t]{6,}- .*\\n)+)`).exec(texte + '\n');
      const options = bloc ? bloc[1].split('\n').map((l) => l.replace(/^\s+- /, '').trim()).filter(Boolean) : [];
      const attendu = liste.map((x) => x.libelle);
      if (options.join('|') !== attendu.join('|')) {
        p.push(`idee-jeu.yml : la liste « ${id} » doit reprendre exactement, dans l'ordre, les libellés de taxonomie.js (${attendu.join(', ')})`);
      }
    }
    // Âge conseillé : liste en ligne « options: ["4+", …] » = AGES.
    const ages = /\n\s*id: age\n[\s\S]*?options:\s*(\[[^\]]*\])/.exec(texte);
    let options = [];
    try { options = ages ? JSON.parse(ages[1]) : []; } catch { /* liste illisible : signalée ci-dessous */ }
    if (options.join('|') !== AGES.join('|')) p.push(`idee-jeu.yml : la liste « age » doit reprendre exactement AGES de taxonomie.js (${AGES.join(', ')})`);
  }

  // Tranches d'âge : bornes qui se suivent sans trou depuis 0, adresse et icône ; anciennes tranches vers une tranche existante.
  const tranches = TRANCHES_AGE.map((t) => t.id);
  TRANCHES_AGE.forEach((t, i) => {
    const attenduMin = i === 0 ? 0 : TRANCHES_AGE[i - 1].max + 1;
    if (t.min !== attenduMin || !(t.max >= t.min)) p.push(`taxonomie.js : tranche « ${t.id} » : bornes ${t.min}-${t.max} (attendu : de ${attenduMin}, sans trou ni chevauchement)`);
    if (!SLUGS_AGE[t.id]) p.push(`chemins.js : tranche « ${t.id} » sans adresse (SLUGS_AGE)`);
  });
  for (const [ancienne, nouvelle] of Object.entries(ANCIENNES_TRANCHES)) {
    if (tranches.includes(ancienne)) p.push(`taxonomie.js : ANCIENNES_TRANCHES.${ancienne} est encore une tranche`);
    if (!tranches.includes(nouvelle)) p.push(`taxonomie.js : ANCIENNES_TRANCHES.${ancienne} mène à « ${nouvelle} », hors liste`);
    if (!SLUGS_AGE[ancienne]) p.push(`chemins.js : ancienne tranche « ${ancienne} » sans adresse (SLUGS_AGE) : sa redirection serait perdue`);
  }
  // Âges proposés : « N+ », croissants, chacun dans une tranche.
  const nombres = AGES.map((a) => (/^\d{1,2}\+$/.test(a) ? parseInt(a, 10) : NaN));
  if (nombres.some((n, i) => Number.isNaN(n) || (i > 0 && n <= nombres[i - 1]))) p.push(`taxonomie.js : AGES doit être une liste croissante de « N+ » (${AGES.join(', ')})`);
  for (const a of AGES) if (!trancheDeAge(a)) p.push(`taxonomie.js : âge « ${a} » hors des tranches d'âge`);
  if (trancheDeAge(`${AGE_ADOS}+`) !== TRANCHES_AGE[TRANCHES_AGE.length - 1].id || trancheDeAge(`${AGE_ADOS - 1}+`) === trancheDeAge(`${AGE_ADOS}+`)) {
    p.push(`taxonomie.js : AGE_ADOS (${AGE_ADOS}) doit être le début de la dernière tranche d'âge`);
  }
  return p;
}

async function main() {
  const demandes = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const erreurs = [];
  const signaler = (sujet, liste) => { for (const e of liste) erreurs.push(`${sujet} : ${e}`); };

  signaler('taxonomie', await problemesTaxonomie());

  // Jeux
  const dossierJeux = path.join(RACINE, 'games');
  const tous = existsSync(dossierJeux)
    ? (await readdir(dossierJeux, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')).map((e) => e.name).sort()
    : [];
  const ids = demandes.length ? demandes : tous;
  for (const id of ids) {
    const chemin = path.join(dossierJeux, id, 'game.json');
    if (!existsSync(chemin)) { erreurs.push(`jeu ${id} : games/${id}/game.json introuvable`); continue; }
    try { signaler(`jeu ${id}`, problemesClassementJeu(await lireJson(chemin))); }
    catch (e) { erreurs.push(`jeu ${id} : game.json illisible (${e.message})`); }
  }

  // Idées
  for (const [fichier, archive] of [['idees.json', false], ['idees-archive.json', true]]) {
    const chemin = path.join(RACINE, fichier);
    if (!existsSync(chemin)) continue;
    let idees;
    try { idees = await lireJson(chemin); }
    catch (e) { erreurs.push(`${fichier} illisible (${e.message})`); continue; }
    for (const idee of Array.isArray(idees) ? idees : []) {
      signaler(`${fichier}, idée ${idee?.id ?? '?'}`, problemesClassementIdee(idee, { universObligatoire: archive }));
    }
  }

  if (erreurs.length) {
    for (const e of erreurs) console.log(`    ERREUR : ${e}`);
    console.log(`\nTaxonomie : ${erreurs.length} erreur(s). Listes permises (public/taxonomie.js) — ${RAPPEL_LISTES}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ Taxonomie : tout est bon (${ids.length} jeu(x), idées, libellés et formulaire conformes à public/taxonomie.js).`);
  }
}

// Lancé directement (et non importé par un autre script).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`Erreur : ${e.message}`);
    process.exit(1);
  });
}
