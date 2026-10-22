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
//     formé, libellé français des fichiers de langue (genre.<id>, …court)
//     différent de taxonomie.js, formulaire .github/ISSUE_TEMPLATE/idee-jeu.yml
//     dont les listes Genre et Univers ne reprennent pas les libellés, dans l'ordre.
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
  GENRES, UNIVERS, IDS_GENRES, IDS_UNIVERS, SECONDAIRES_MAX, UNIVERS_MIN, UNIVERS_MAX,
} from '../public/taxonomie.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --------------------------------------------------------------------------
// Règles (partagées)
// --------------------------------------------------------------------------

// Une liste d'identifiants : tableau de textes, tous dans « permis », sans doublon.
function problemesListe(nom, valeur, permis, min, max) {
  if (!Array.isArray(valeur)) return [`"${nom}" doit être une liste (${min} à ${max})`];
  const p = [];
  if (valeur.length < min || valeur.length > max) p.push(`"${nom}" : ${min === max ? min : `${min} à ${max}`} attendu(s), ${valeur.length} trouvé(s)`);
  const hors = valeur.filter((x) => !permis.includes(x));
  if (hors.length) p.push(`"${nom}" hors liste : ${hors.map((x) => JSON.stringify(x)).join(', ')}`);
  if (new Set(valeur).size !== valeur.length) p.push(`"${nom}" : valeur en double`);
  return p;
}

// Règles communes aux jeux et aux idées.
function problemesClassement(f, universMin) {
  const p = [];
  if (!IDS_GENRES.includes(f.genre)) p.push(`"genre" hors liste (${JSON.stringify(f.genre ?? null)})`);
  if (f.genres_secondaires !== undefined) {
    p.push(...problemesListe('genres_secondaires', f.genres_secondaires, IDS_GENRES, 0, SECONDAIRES_MAX));
    if (Array.isArray(f.genres_secondaires)) {
      if (f.genres_secondaires.includes(f.genre)) p.push('"genres_secondaires" ne doit pas reprendre le genre principal');
      if (f.genres_secondaires.includes('autre')) p.push('« autre » ne peut pas être un genre secondaire');
    }
  }
  p.push(...problemesListe('univers', f.univers, IDS_UNIVERS, universMin, UNIVERS_MAX));
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
