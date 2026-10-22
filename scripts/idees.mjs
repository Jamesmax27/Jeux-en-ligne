#!/usr/bin/env node
// ==========================================================================
// idees.mjs — file d'idées de jeux de la boucle de nuit
//
//   idees.json          idées à faire : statut "en_attente" ou "en_cours"
//   idees-archive.json  idées réalisées : statut "faite", "jeu_id" rempli
//
// Une idée : id, titre, description, genre (liste de genres.mjs), tags,
// source ("humain" ou "agent"), date_ajout (AAAA-MM-JJ), statut et jeu_id
// (null tant que le jeu n'est pas publié). Champ facultatif "essais" : nombre
// de jeux de cette idée refusés par la vérification ; à ESSAIS_MAX, l'idée
// n'est plus choisie (le remettre à 0 pour la retenter).
//
// Ordre de fabrication : les idées "humain" dans l'ordre du fichier (ordre
// d'ajout ; une idée prioritaire du formulaire est placée en tête), puis les
// idées "agent", dans l'ordre du fichier.
//
// Le catalogue de référence est l'ensemble des games/*/game.json (dont
// public/catalog.json est tiré au build). Un jeu est relié à son idée par le
// champ "idee" de son game.json, qui vaut l'id de l'idée.
//
// Commandes (boucle-de-nuit.yml, idee-jeu.yml, ou à la main) :
//   verifier               contrôle idees.json et idees-archive.json
//   catalogue              titre, genre et tags de chaque jeu publié, puis
//                          effectifs par genre, univers et tag
//   archive                titres des idées déjà réalisées
//   manque                 nombre d'idées à ajouter pour en avoir 15 en attente
//   ajouter <fichier>      ajoute les idées proposées par l'agent d'idéation
//   ajouter-humain         ajoute l'idée du formulaire (variables TITRE,
//                          PRINCIPE, GENRE, AGE, THEMES, PRIORITE)
//   choisir <n>            passe n idées "en_cours" et écrit leur liste (JSON)
//   reconcilier [--ouvertes id,…] [--echecs id,…]
//                          idée dont le jeu est sur main → archive ; idée
//                          "en_cours" sans pull request ouverte → "en_attente"
//                          (+1 essai pour celles de --echecs)
//   controler <jeu-id>     entrée de public/catalog.json conforme à l'idée
// ==========================================================================

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GENRES } from './genres.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER_IDEES = path.join(RACINE, 'idees.json');
const FICHIER_ARCHIVE = path.join(RACINE, 'idees-archive.json');
const DOSSIER_JEUX = path.join(RACINE, 'games');
const CATALOGUE_CONSTRUIT = path.join(RACINE, 'public', 'catalog.json');

const IDEES_VISEES = 15;   // idées "en_attente" que l'idéation maintient
const ESSAIS_MAX = 3;      // jeux refusés au-delà desquels une idée n'est plus choisie
const CHOIX_MAX = 5;       // idées choisies par passage (une tâche de fabrication chacune)
const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_VALIDE = /^\d{4}-\d{2}-\d{2}$/;
const ORDRE_CHAMPS = ['id', 'titre', 'description', 'genre', 'tags', 'source', 'date_ajout', 'statut', 'jeu_id', 'essais'];

// --------------------------------------------------------------------------
// Outils
// --------------------------------------------------------------------------

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const nfc = (t) => String(t ?? '').normalize('NFC');
const uneLigne = (t, max) => nfc(t).replace(/\s+/g, ' ').trim().slice(0, max);
const sansAccents = (t) => nfc(t).normalize('NFD').replace(/[̀-ͯ]/g, '');

// Clé de comparaison des titres : sans accents, majuscules, ponctuation ni article.
function cle(titre) {
  return sansAccents(titre).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/^(le|la|les|l|un|une|des) /, '');
}

function slug(titre) {
  const s = sansAccents(titre).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (s.length > 50 ? s.slice(0, 50).replace(/-[^-]*$/, '') : s) || 'idee';
}

function idUnique(base, pris) {
  if (!pris.has(base)) return base;
  for (let n = 2; ; n++) if (!pris.has(`${base}-${n}`)) return `${base}-${n}`;
}

// Tags : minuscules, sans doublon, 5 au plus.
function nettoyerTags(liste) {
  if (!Array.isArray(liste)) return [];
  const tags = liste.filter((t) => typeof t === 'string').map((t) => uneLigne(t, 30).toLowerCase()).filter(Boolean);
  return [...new Set(tags)].slice(0, 5);
}

const memesTags = (a, b) => {
  const x = new Set(nettoyerTags(a)), y = new Set(nettoyerTags(b));
  return x.size === y.size && [...x].every((t) => y.has(t));
};

// Ordre de fabrication : idées humaines, puis idées de l'agent (ordre du fichier).
const choisissables = (idees) => idees.filter((i) => i.statut === 'en_attente' && (i.essais || 0) < ESSAIS_MAX);
const ordreDeFabrication = (idees) => {
  const libres = choisissables(idees);
  return [...libres.filter((i) => i.source === 'humain'), ...libres.filter((i) => i.source !== 'humain')];
};

// --------------------------------------------------------------------------
// Lecture, contrôle et écriture des deux fichiers
// --------------------------------------------------------------------------

function problemesIdee(idee, fichier, statutsPermis) {
  if (!idee || typeof idee !== 'object' || Array.isArray(idee)) return [`${fichier} : chaque idée doit être un objet { … }`];
  const p = [];
  if (typeof idee.id !== 'string' || !ID_VALIDE.test(idee.id)) p.push('"id" : minuscules sans accents, chiffres et tirets');
  if (typeof idee.titre !== 'string' || idee.titre.trim().length < 2 || idee.titre.length > 80) p.push('"titre" : 2 à 80 caractères');
  if (typeof idee.description !== 'string' || idee.description.trim().length < 10 || idee.description.length > 2000) p.push('"description" : 10 à 2 000 caractères');
  if (!GENRES.includes(nfc(idee.genre))) p.push(`"genre" : au choix ${GENRES.join(', ')}`);
  if (!Array.isArray(idee.tags) || idee.tags.length > 5 || idee.tags.some((t) => typeof t !== 'string' || !t.trim() || t !== t.trim().toLowerCase())) {
    p.push('"tags" : liste de 0 à 5 thèmes en minuscules');
  }
  if (!['humain', 'agent'].includes(idee.source)) p.push('"source" : "humain" ou "agent"');
  if (typeof idee.date_ajout !== 'string' || !DATE_VALIDE.test(idee.date_ajout)) p.push('"date_ajout" : date AAAA-MM-JJ');
  if (!statutsPermis.includes(idee.statut)) p.push(`"statut" : ${statutsPermis.map((s) => `"${s}"`).join(' ou ')}`);
  if (idee.statut === 'faite') {
    if (typeof idee.jeu_id !== 'string' || !ID_VALIDE.test(idee.jeu_id)) p.push('"jeu_id" : id du jeu publié');
  } else if (idee.jeu_id !== null && idee.jeu_id !== undefined) p.push('"jeu_id" : null tant que le jeu n\'est pas publié');
  if (idee.essais !== undefined && !(Number.isInteger(idee.essais) && idee.essais >= 0)) p.push('"essais" : nombre entier ≥ 0');
  return p.map((x) => `${fichier}, idée ${JSON.stringify(idee.id ?? idee.titre ?? '?')} : ${x}`);
}

async function lireListe(fichier, obligatoire) {
  const nom = path.basename(fichier);
  if (!existsSync(fichier)) {
    if (obligatoire) throw new Error(`${nom} introuvable`);
    return [];
  }
  let donnees;
  // Un éditeur Windows peut ajouter une marque d'ordre des octets (BOM) en tête : elle est ignorée.
  try { donnees = JSON.parse((await readFile(fichier, 'utf8')).replace(/^﻿/, '')); }
  catch (e) { throw new Error(`${nom} illisible (JSON invalide) : ${e.message}`); }
  if (!Array.isArray(donnees)) throw new Error(`${nom} doit contenir une liste [ … ] d'idées`);
  return donnees;
}

async function charger() {
  const idees = await lireListe(FICHIER_IDEES, true);
  const archive = await lireListe(FICHIER_ARCHIVE, false);
  const problemes = [
    ...idees.flatMap((i) => problemesIdee(i, 'idees.json', ['en_attente', 'en_cours'])),
    ...archive.flatMap((i) => problemesIdee(i, 'idees-archive.json', ['faite'])),
  ];
  const vus = new Set();
  for (const i of [...idees, ...archive]) {
    if (!i || typeof i.id !== 'string') continue;
    if (vus.has(i.id)) problemes.push(`"id" en double : ${i.id}`);
    vus.add(i.id);
  }
  if (problemes.length) throw new Error(`idées invalides :\n  - ${problemes.join('\n  - ')}`);
  for (const i of [...idees, ...archive]) i.genre = nfc(i.genre);
  return { idees, archive };
}

// Champs dans l'ordre habituel ; "essais" seulement s'il est utile ; un champ ajouté à la main est gardé.
function ranger(idee) {
  const o = {};
  for (const k of ORDRE_CHAMPS) {
    if (k === 'jeu_id') o.jeu_id = idee.jeu_id ?? null;
    else if (k === 'essais') { if (idee.essais > 0) o.essais = idee.essais; }
    else if (idee[k] !== undefined) o[k] = idee[k];
  }
  for (const k of Object.keys(idee)) if (!ORDRE_CHAMPS.includes(k)) o[k] = idee[k];
  return o;
}

async function ecrire(fichier, liste) {
  const texte = JSON.stringify(liste.map(ranger), null, 2)
    // Listes de textes (tags) sur une seule ligne, plus lisibles.
    .replace(/\[\n\s+("(?:[^"\\]|\\.)*"(?:,\n\s+"(?:[^"\\]|\\.)*")*)\n\s+\]/g, (_, contenu) => `[${contenu.split(/,\n\s+/).join(', ')}]`) + '\n';
  const avant = existsSync(fichier) ? await readFile(fichier, 'utf8') : '';
  if (texte !== avant) await writeFile(fichier, texte, 'utf8');
}

// Jeux publiés : games/<id>/game.json (les dossiers en . ou _ sont ignorés, comme au build).
async function lireCatalogue() {
  if (!existsSync(DOSSIER_JEUX)) return [];
  const dossiers = (await readdir(DOSSIER_JEUX, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => e.name).sort();
  const jeux = [];
  for (const nom of dossiers) {
    let f;
    try { f = JSON.parse((await readFile(path.join(DOSSIER_JEUX, nom, 'game.json'), 'utf8')).replace(/^﻿/, '')); }
    catch { continue; } // fiche absente ou illisible : le build ignore aussi ce jeu
    const genre = typeof f.genre === 'string' ? nfc(f.genre.trim().toLowerCase()) : '';
    jeux.push({
      id: nom,
      titre: uneLigne(f.title || nom, 80),
      genre: GENRES.includes(genre) ? genre : '',
      tags: nettoyerTags(f.tags),
      idee: typeof f.idee === 'string' ? f.idee.trim() : '',
    });
  }
  return jeux;
}

async function chargerUnivers() {
  let univers = [];
  try { univers = (await import(pathToFileURL(path.join(RACINE, 'public', 'regroupements.js')).href)).UNIVERS || []; }
  catch { return []; }
  // Nom français de chaque univers : textes du site (clé univers.<id>), sinon son identifiant.
  let textes = {};
  try { textes = JSON.parse((await readFile(path.join(RACINE, 'public', 'i18n', 'site', 'fr.json'), 'utf8')).replace(/^﻿/, '')); }
  catch { /* textes du site absents : identifiants */ }
  return univers.map((u) => ({ ...u, nom: u.nom || textes[`univers.${u.id}`] || u.id }));
}

// --------------------------------------------------------------------------
// Commandes
// --------------------------------------------------------------------------

async function verifier() {
  const { idees, archive } = await charger();
  const n = (s) => idees.filter((i) => i.statut === s).length;
  const deCote = idees.filter((i) => (i.essais || 0) >= ESSAIS_MAX);
  console.log(`idees.json : ${idees.length} idée(s), ${n('en_attente')} en attente, ${n('en_cours')} en cours.`);
  console.log(`idees-archive.json : ${archive.length} idée(s) réalisée(s).`);
  for (const i of deCote) console.log(`Mise de côté (${i.essais} jeux refusés) : ${i.titre} — remettre "essais" à 0 pour la retenter.`);
}

// Résumé du catalogue pour l'idéation : titre, genre et tags seulement, puis les effectifs.
async function catalogue() {
  const jeux = await lireCatalogue();
  const { idees } = await charger();
  const compter = (liste, cles) => {
    const m = new Map();
    for (const x of liste) for (const k of cles(x)) m.set(k, (m.get(k) || 0) + 1);
    return m;
  };
  const lignes = [`Catalogue : ${jeux.length} jeu(x) publié(s) — titre | genre | tags`];
  for (const j of jeux) lignes.push(`- ${j.titre} | ${j.genre || 'sans genre'} | ${j.tags.join(', ')}`);

  const gJeux = compter(jeux, (j) => [j.genre]), gIdees = compter(idees, (i) => [i.genre]);
  lignes.push('', 'Genres — jeux publiés / idées déjà prévues (idees.json) :');
  for (const g of GENRES) lignes.push(`- ${g} : ${gJeux.get(g) || 0} / ${gIdees.get(g) || 0}`);

  // Univers de l'accueil : un jeu y entre par son genre ou l'un de ses tags (comme public/app.js).
  const UNIVERS = await chargerUnivers();
  const univers = (x) => { const mots = new Set([x.genre, ...x.tags]); return UNIVERS.filter((u) => u.tags.some((t) => mots.has(t))).map((u) => u.id); };
  const uJeux = compter(jeux, univers), uIdees = compter(idees, univers);
  lignes.push('', 'Univers de l\'accueil (vide = tuile grisée « Bientôt ») — jeux publiés / idées prévues — tags qui y mènent :');
  for (const u of UNIVERS) lignes.push(`- ${u.nom} : ${uJeux.get(u.id) || 0} / ${uIdees.get(u.id) || 0} — ${u.tags.join(', ')}`);

  const tJeux = [...compter(jeux, (j) => j.tags)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
  lignes.push('', 'Tags des jeux publiés (nombre de jeux) :', tJeux.map(([t, n]) => `${t} (${n})`).join(', ') || '(aucun)');
  console.log(lignes.join('\n'));
}

async function titresArchive() {
  const { archive } = await charger();
  console.log(`Idées déjà réalisées : ${archive.length}`);
  for (const i of archive) console.log(`- ${i.titre}`);
}

async function manque() {
  const { idees } = await charger();
  console.log(Math.max(0, IDEES_VISEES - choisissables(idees).length));
}

// Idées proposées par l'agent d'idéation : contrôlées une à une, ajoutées jusqu'à 15 en attente.
async function ajouter(fichier) {
  if (!fichier) throw new Error('fichier des idées proposées manquant : node scripts/idees.mjs ajouter <fichier>');
  const { idees, archive } = await charger();
  let propositions;
  try { propositions = JSON.parse((await readFile(fichier, 'utf8')).replace(/^﻿/, '')); }
  catch (e) { throw new Error(`${fichier} illisible : ${e.message}`); }
  if (!Array.isArray(propositions)) propositions = Array.isArray(propositions?.idees) ? propositions.idees : [];

  const jeux = await lireCatalogue();
  const titresPris = new Set([...jeux.map((j) => j.titre), ...idees.map((i) => i.titre), ...archive.map((i) => i.titre)].map(cle));
  const ids = new Set([...idees, ...archive].map((i) => i.id));
  let place = Math.max(0, IDEES_VISEES - choisissables(idees).length);
  let ajoutees = 0;

  for (const p of propositions) {
    const titre = uneLigne(p?.titre, 80);
    const description = uneLigne(p?.description, 2000);
    const genre = uneLigne(p?.genre, 30).toLowerCase();
    const tags = nettoyerTags(p?.tags);
    let refus = '';
    if (place === 0) refus = `déjà ${IDEES_VISEES} idées en attente`;
    else if (titre.length < 2) refus = 'titre manquant';
    else if (titresPris.has(cle(titre))) refus = 'titre déjà pris (jeu publié ou idée)';
    else if (description.length < 80) refus = 'description trop courte (80 caractères au moins)';
    else if (!GENRES.includes(genre)) refus = `genre hors liste (« ${genre} »)`;
    else if (tags.length === 0) refus = 'aucun tag';
    if (refus) { console.log(`Refusée : ${titre || '(sans titre)'} — ${refus}`); continue; }

    const id = idUnique(slug(titre), ids);
    idees.push({ id, titre, description, genre, tags, source: 'agent', date_ajout: aujourdhui(), statut: 'en_attente', jeu_id: null });
    ids.add(id); titresPris.add(cle(titre)); place--; ajoutees++;
    console.log(`Ajoutée : ${titre} (${genre} ; ${tags.join(', ')})`);
  }
  await ecrire(FICHIER_IDEES, idees);
  console.log(`${ajoutees} idée(s) ajoutée(s) ; ${choisissables(idees).length} en attente.`);
}

// Idée du formulaire « Nouvelle idée de jeu » (idee-jeu.yml). Écrit le résultat en JSON.
async function ajouterHumain() {
  const { idees, archive } = await charger();
  const env = process.env;
  const titre = uneLigne(env.TITRE, 60);
  let principe = uneLigne(env.PRINCIPE, 1500).replace(/[\s.]+$/, '');
  const genre = uneLigne(env.GENRE, 30).toLowerCase();
  const age = uneLigne(env.AGE, 4);
  const tags = nettoyerTags(String(env.THEMES || '').split(/[,;]/));
  const priorite = /^(1|oui|true)$/i.test(String(env.PRIORITE || '').trim());
  const repondre = (r) => console.log(JSON.stringify(r));

  if (titre.length < 2 || principe.length < 5 || !GENRES.includes(genre) || !/^\d{1,2}\+$/.test(age)) {
    return repondre({ resultat: 'invalide', message: 'titre, principe, genre ou âge manquant' });
  }
  if ([...idees, ...archive].some((i) => cle(i.titre) === cle(titre))) {
    return repondre({ resultat: 'doublon', message: `« ${titre} » est déjà dans les idées` });
  }
  if ((await lireCatalogue()).some((j) => cle(j.titre) === cle(titre))) {
    return repondre({ resultat: 'doublon', message: `un jeu « ${titre} » existe déjà sur le site` });
  }

  principe = principe.charAt(0).toUpperCase() + principe.slice(1);
  const description = `${principe}${/[!?]$/.test(principe) ? '' : '.'} Âge conseillé : ${age}.`;
  const idee = {
    id: idUnique(slug(titre), new Set([...idees, ...archive].map((i) => i.id))),
    titre, description, genre, tags, source: 'humain', date_ajout: aujourdhui(), statut: 'en_attente', jeu_id: null,
  };
  // Priorité : en tête de la file, donc fabriquée au prochain passage. Sinon : à la fin.
  if (priorite) idees.unshift(idee); else idees.push(idee);
  await ecrire(FICHIER_IDEES, idees);
  const avant = ordreDeFabrication(idees).findIndex((i) => i.id === idee.id);
  repondre({ resultat: 'ajoutee', id: idee.id, titre, description, genre, tags, avant });
}

// Choix des idées à fabriquer : statut "en_cours". Seule sortie standard : la liste en JSON.
async function choisir(n) {
  const nombre = Math.max(0, Math.min(CHOIX_MAX, parseInt(n, 10) || 0));
  const { idees } = await charger();
  const choix = ordreDeFabrication(idees).slice(0, nombre);
  for (const i of choix) i.statut = 'en_cours';
  await ecrire(FICHIER_IDEES, idees);
  for (const i of choix) console.error(`Choisie : ${i.titre} (${i.source})`);
  if (!choix.length) console.error('Aucune idée choisie.');
  console.log(JSON.stringify(choix.map(({ id, titre, description, genre, tags }) => ({ id, titre, description, genre, tags }))));
}

async function reconcilier(args) {
  const liste = (nom) => {
    const i = args.indexOf(nom);
    const valeur = i >= 0 ? args[i + 1] : '';
    return new Set(valeur && !valeur.startsWith('--') ? valeur.split(',').map((s) => s.trim()).filter(Boolean) : []);
  };
  const ouvertes = liste('--ouvertes'), echecs = liste('--echecs');
  const { idees, archive } = await charger();

  // Jeux publiés sur main, par idée (champ "idee" de game.json).
  const publies = new Map();
  for (const j of await lireCatalogue()) if (j.idee && !publies.has(j.idee)) publies.set(j.idee, j.id);

  const restent = [];
  for (const i of idees) {
    if (publies.has(i.id)) {
      archive.push({ ...i, statut: 'faite', jeu_id: publies.get(i.id), essais: undefined });
      console.log(`Faite : ${i.titre} → ${publies.get(i.id)}`);
      continue;
    }
    if (i.statut === 'en_cours' && !ouvertes.has(i.id)) {
      i.statut = 'en_attente';
      if (echecs.has(i.id)) {
        i.essais = (i.essais || 0) + 1;
        console.log(`Jeu refusé (${i.essais} sur ${ESSAIS_MAX}) : ${i.titre}${i.essais >= ESSAIS_MAX ? ' — idée mise de côté' : ' — remise en attente'}`);
      } else {
        console.log(`Remise en attente (aucune pull request ouverte) : ${i.titre}`);
      }
    }
    restent.push(i);
  }
  await ecrire(FICHIER_IDEES, restent);
  await ecrire(FICHIER_ARCHIVE, archive);
}

// Entrée du catalogue construit (public/catalog.json) : genre et tags présents, et ceux de l'idée.
// Erreurs au format de validate-games.mjs (« ERREUR : … »).
async function controler(jeuId) {
  if (!jeuId) throw new Error('id du jeu manquant : node scripts/idees.mjs controler <jeu-id>');
  if (!existsSync(CATALOGUE_CONSTRUIT)) throw new Error('public/catalog.json absent : lancer d\'abord node scripts/build-catalog.mjs');
  const erreurs = [];
  const entree = (JSON.parse(await readFile(CATALOGUE_CONSTRUIT, 'utf8')).games || []).find((g) => g.id === jeuId);
  let fiche = {};
  try { fiche = JSON.parse((await readFile(path.join(DOSSIER_JEUX, jeuId, 'game.json'), 'utf8')).replace(/^﻿/, '')); }
  catch { erreurs.push(`games/${jeuId}/game.json illisible`); }

  if (!entree) erreurs.push('catalogue : le jeu est absent du catalogue construit');
  else {
    if (!GENRES.includes(entree.genre)) erreurs.push('catalogue : genre absent ou hors liste');
    else if (entree.genre !== nfc(fiche.genre)) erreurs.push(`catalogue : genre déduit des tags (« ${entree.genre} ») car le "genre" de game.json n'est pas valide`);
    if (!entree.tags?.length) erreurs.push('catalogue : aucun tag');
  }
  const { idees } = await charger();
  const idee = idees.find((i) => i.id === fiche.idee);
  if (!idee) erreurs.push(`game.json : "idee" (${JSON.stringify(fiche.idee ?? null)}) ne correspond à aucune idée de idees.json`);
  else {
    if (nfc(fiche.genre) !== idee.genre) erreurs.push(`game.json : "genre" doit être celui de l'idée (« ${idee.genre} »)`);
    if (idee.tags.length && !memesTags(fiche.tags, idee.tags)) erreurs.push(`game.json : "tags" doivent être ceux de l'idée (${idee.tags.join(', ')})`);
  }
  for (const e of erreurs) console.log(`    ERREUR : ${e}`);
  if (!erreurs.length) console.log(`✓ Entrée du catalogue conforme : genre « ${entree.genre} », tags ${entree.tags.join(', ')}`);
  process.exitCode = erreurs.length ? 1 : 0;
}

// --------------------------------------------------------------------------
// Programme principal
// --------------------------------------------------------------------------

const [commande, ...args] = process.argv.slice(2);
const COMMANDES = {
  verifier,
  catalogue,
  archive: titresArchive,
  manque,
  ajouter: () => ajouter(args[0]),
  'ajouter-humain': ajouterHumain,
  choisir: () => choisir(args[0]),
  reconcilier: () => reconcilier(args),
  controler: () => controler(args[0]),
};

if (!COMMANDES[commande]) {
  console.error(`Commande inconnue. Au choix : ${Object.keys(COMMANDES).join(', ')} (détails en tête de scripts/idees.mjs).`);
  process.exit(1);
}
COMMANDES[commande]().catch((e) => {
  console.error(`Erreur : ${e.message}`);
  process.exit(1);
});
