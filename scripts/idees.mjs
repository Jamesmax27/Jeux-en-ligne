#!/usr/bin/env node
// ==========================================================================
// idees.mjs — file d'idées de jeux de la boucle de nuit
//
//   idees.json          idées à faire : statut "en_attente" ou "en_cours"
//   idees-archive.json  idées réalisées : statut "faite", "jeu_id" rempli
//
// Une idée : id, titre, description, genre (1 genre principal),
// genres_secondaires (0 à 2, facultatif), univers (0 à 2 ; liste vide =
// l'agent créateur les choisit), source ("humain" ou "agent"), date_ajout
// (AAAA-MM-JJ), statut et jeu_id (null tant que le jeu n'est pas publié).
// Genres et univers : identifiants des listes fermées de public/taxonomie.js,
// jamais d'autres (règles : scripts/controle-taxonomie.mjs). Champ facultatif
// "essais" : nombre de jeux de cette idée refusés par la vérification ; à
// ESSAIS_MAX, l'idée n'est plus choisie (le remettre à 0 pour la retenter).
// Champ facultatif "issue" : numéro de l'issue « idee-perso » d'où vient
// l'idée (page privée /idees) ; la boucle ferme cette issue quand la pull
// request du jeu est ouverte.
//
// Ordre de fabrication : d'abord les idées perso (champ "issue"), de la plus
// ancienne issue à la plus récente ; puis les idées "humain" dans l'ordre du
// fichier (ordre d'ajout ; une idée prioritaire du formulaire est placée en
// tête), puis les idées "agent", dans l'ordre du fichier.
//
// Le catalogue de référence est l'ensemble des games/*/game.json (dont
// public/catalog.json est tiré au build). Un jeu est relié à son idée par le
// champ "idee" de son game.json, qui vaut l'id de l'idée.
//
// Commandes (boucle-de-nuit.yml, idee-jeu.yml, ou à la main) :
//   verifier               contrôle idees.json et idees-archive.json
//   catalogue              titre, genres et univers de chaque jeu publié, puis
//                          effectifs par genre et par univers, et combinaisons
//                          genre × univers déjà couvertes (jeux et idées)
//   archive                titres des idées déjà réalisées
//   manque                 nombre d'idées à ajouter pour en avoir 15 en attente
//   ajouter <fichier>      ajoute les idées proposées par l'agent d'idéation
//   ajouter-humain         ajoute l'idée du formulaire (variables TITRE,
//                          PRINCIPE, GENRE, AGE, UNIVERS, PRIORITE ; genre et
//                          univers : identifiants ou libellés de taxonomie.js)
//   importer-perso <fichier>
//                          ajoute les idées des issues « idee-perso » (liste
//                          JSON [{ issue, titre, genre, description }]) qui ne
//                          sont pas déjà dans idees.json ou l'archive
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
import { fileURLToPath } from 'node:url';
import { GENRES, UNIVERS, IDS_GENRES, IDS_UNIVERS, UNIVERS_MAX } from '../public/taxonomie.js';
import { problemesClassementIdee, RAPPEL_LISTES } from './controle-taxonomie.mjs';

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
const ORDRE_CHAMPS = ['id', 'titre', 'description', 'genre', 'genres_secondaires', 'univers', 'source', 'date_ajout', 'statut', 'jeu_id', 'issue', 'essais'];

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

// Liste de textes : sans espaces autour, sans doublon (les identifiants hors liste sont gardés, pour être signalés).
function nettoyerListe(liste) {
  if (!Array.isArray(liste)) return [];
  return [...new Set(liste.filter((t) => typeof t === 'string').map((t) => uneLigne(t, 40)).filter(Boolean))];
}

const memesListes = (a, b) => {
  const x = new Set(nettoyerListe(a)), y = new Set(nettoyerListe(b));
  return x.size === y.size && [...x].every((t) => y.has(t));
};

// Identifiant d'un genre ou d'un univers, donné par son identifiant ou son libellé
// (complet ou court, sans tenir compte des accents ni des majuscules) ; '' si hors liste.
function identifiant(texte, liste) {
  const c = sansAccents(uneLigne(texte, 60)).toLowerCase();
  if (!c) return '';
  return liste.find((x) => x.id === c || [x.libelle, x.court].some((l) => sansAccents(l).toLowerCase() === c))?.id || '';
}

// Ordre de fabrication : idées perso (issue la plus ancienne d'abord), idées humaines, puis idées de l'agent
// (ordre du fichier).
const choisissables = (idees) => idees.filter((i) => i.statut === 'en_attente' && (i.essais || 0) < ESSAIS_MAX);
const estPerso = (i) => Number.isInteger(i.issue);
const ordreDeFabrication = (idees) => {
  const libres = choisissables(idees);
  const perso = libres.filter(estPerso).sort((a, b) => a.issue - b.issue);
  const autres = libres.filter((i) => !estPerso(i));
  return [...perso, ...autres.filter((i) => i.source === 'humain'), ...autres.filter((i) => i.source !== 'humain')];
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
  // Genre, genres secondaires et univers : listes fermées (archive : 1 ou 2 univers obligatoires).
  const classement = problemesClassementIdee(idee, { universObligatoire: idee.statut === 'faite' });
  p.push(...classement);
  if (classement.length) p.push(`listes permises (public/taxonomie.js) — ${RAPPEL_LISTES}`);
  if (!['humain', 'agent'].includes(idee.source)) p.push('"source" : "humain" ou "agent"');
  if (typeof idee.date_ajout !== 'string' || !DATE_VALIDE.test(idee.date_ajout)) p.push('"date_ajout" : date AAAA-MM-JJ');
  if (!statutsPermis.includes(idee.statut)) p.push(`"statut" : ${statutsPermis.map((s) => `"${s}"`).join(' ou ')}`);
  if (idee.statut === 'faite') {
    if (typeof idee.jeu_id !== 'string' || !ID_VALIDE.test(idee.jeu_id)) p.push('"jeu_id" : id du jeu publié');
  } else if (idee.jeu_id !== null && idee.jeu_id !== undefined) p.push('"jeu_id" : null tant que le jeu n\'est pas publié');
  if (idee.essais !== undefined && !(Number.isInteger(idee.essais) && idee.essais >= 0)) p.push('"essais" : nombre entier ≥ 0');
  if (idee.issue !== undefined && !(Number.isInteger(idee.issue) && idee.issue > 0)) p.push('"issue" : numéro d\'issue GitHub');
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
  return { idees, archive };
}

// Champs dans l'ordre habituel ; "essais" seulement s'il est utile ; un champ ajouté à la main est gardé.
function ranger(idee) {
  const o = {};
  for (const k of ORDRE_CHAMPS) {
    if (k === 'jeu_id') o.jeu_id = idee.jeu_id ?? null;
    else if (k === 'univers') o.univers = idee.univers ?? [];
    else if (k === 'genres_secondaires') { if (idee.genres_secondaires?.length) o.genres_secondaires = idee.genres_secondaires; }
    else if (k === 'essais') { if (idee.essais > 0) o.essais = idee.essais; }
    else if (idee[k] !== undefined) o[k] = idee[k];
  }
  for (const k of Object.keys(idee)) if (!ORDRE_CHAMPS.includes(k)) o[k] = idee[k];
  return o;
}

async function ecrire(fichier, liste) {
  const texte = JSON.stringify(liste.map(ranger), null, 2)
    // Listes de textes (genres secondaires, univers) sur une seule ligne, plus lisibles.
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
    const genre = typeof f.genre === 'string' ? f.genre.trim() : '';
    jeux.push({
      id: nom,
      titre: uneLigne(f.title || nom, 80),
      genre: IDS_GENRES.includes(genre) ? genre : '',
      genres_secondaires: nettoyerListe(f.genres_secondaires).filter((g) => IDS_GENRES.includes(g)),
      univers: nettoyerListe(f.univers).filter((u) => IDS_UNIVERS.includes(u)),
      idee: typeof f.idee === 'string' ? f.idee.trim() : '',
    });
  }
  return jeux;
}

const libelleGenre = (id) => GENRES.find((g) => g.id === id)?.libelle || id;
const libelleUnivers = (id) => UNIVERS.find((u) => u.id === id)?.libelle || id;

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

// Résumé du catalogue pour l'idéation et la fabrication : titre, genres et univers de chaque
// jeu, effectifs par genre et par univers, combinaisons genre × univers déjà couvertes.
// Identifiants entre crochets : ce sont eux qu'on écrit dans les idées et les fiches.
async function catalogue() {
  const jeux = await lireCatalogue();
  const { idees } = await charger();
  const compter = (liste, cles) => {
    const m = new Map();
    for (const x of liste) for (const k of cles(x)) m.set(k, (m.get(k) || 0) + 1);
    return m;
  };
  const tousGenres = (x) => [x.genre, ...(x.genres_secondaires || [])].filter(Boolean);
  const lignes = [
    'Listes fermées (public/taxonomie.js) : aucun autre genre ni univers n\'est permis.',
    '',
    `Catalogue : ${jeux.length} jeu(x) publié(s) — titre | genre principal (+ secondaires) | univers`,
  ];
  for (const j of jeux) {
    const sec = j.genres_secondaires.length ? ` (+ ${j.genres_secondaires.join(', ')})` : '';
    lignes.push(`- ${j.titre} | ${j.genre || 'sans genre'}${sec} | ${j.univers.join(', ') || 'sans univers'}`);
  }

  const gJeux = compter(jeux, (j) => [j.genre]), gSec = compter(jeux, (j) => j.genres_secondaires), gIdees = compter(idees, (i) => [i.genre]);
  lignes.push('', 'Genres [identifiant] — jeux publiés en genre principal / en genre secondaire / idées déjà prévues (idees.json) :');
  for (const g of GENRES) lignes.push(`- ${g.libelle} [${g.id}] : ${gJeux.get(g.id) || 0} / ${gSec.get(g.id) || 0} / ${gIdees.get(g.id) || 0}`);

  const uJeux = compter(jeux, (j) => j.univers), uIdees = compter(idees, (i) => i.univers || []);
  lignes.push('', 'Univers [identifiant] (vide = puce grisée « Bientôt » sur l\'accueil) — jeux publiés / idées prévues :');
  for (const u of UNIVERS) lignes.push(`- ${u.libelle} [${u.id}] : ${uJeux.get(u.id) || 0} / ${uIdees.get(u.id) || 0}`);

  // Combinaisons genre × univers (tous les genres d'un jeu ou d'une idée, principal et secondaires).
  const paires = (x) => tousGenres(x).flatMap((g) => (x.univers || []).map((u) => `${g} × ${u}`));
  const cJeux = compter(jeux, paires), cIdees = compter(idees, paires);
  const couvertes = [...new Set([...cJeux.keys(), ...cIdees.keys()])].sort((a, b) => a.localeCompare(b, 'fr'));
  lignes.push('', `Combinaisons genre × univers déjà couvertes (${couvertes.length} sur ${GENRES.length * UNIVERS.length}) — jeux / idées prévues ; toutes les autres sont libres :`);
  lignes.push(couvertes.map((c) => `${c} (${cJeux.get(c) || 0}/${cIdees.get(c) || 0})`).join(' ; ') || '(aucune)');
  const vides = (liste, a, b) => liste.filter((x) => !(a.get(x.id) || 0) && !(b.get(x.id) || 0)).map((x) => x.id);
  lignes.push('', `Genres sans aucun jeu ni idée : ${vides(GENRES, compter(jeux, tousGenres), compter(idees, tousGenres)).join(', ') || '(aucun)'}`);
  lignes.push(`Univers sans aucun jeu ni idée : ${vides(UNIVERS, uJeux, uIdees).join(', ') || '(aucun)'}`);
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
    // Identifiants (ou libellés) des listes fermées ; une valeur inconnue refuse l'idée entière.
    const genre = identifiant(p?.genre, GENRES);
    const secondairesBruts = nettoyerListe(p?.genres_secondaires);
    const universBruts = nettoyerListe(p?.univers);
    const genres_secondaires = secondairesBruts.map((g) => identifiant(g, GENRES));
    const univers = universBruts.map((u) => identifiant(u, UNIVERS));
    const classement = problemesClassementIdee({ genre, genres_secondaires, univers }, { universObligatoire: true });
    let refus = '';
    if (place === 0) refus = `déjà ${IDEES_VISEES} idées en attente`;
    else if (titre.length < 2) refus = 'titre manquant';
    else if (titresPris.has(cle(titre))) refus = 'titre déjà pris (jeu publié ou idée)';
    else if (description.length < 80) refus = 'description trop courte (80 caractères au moins)';
    else if (!genre) refus = `genre hors liste (« ${uneLigne(p?.genre, 40)} ») : aucun nouveau genre n'est permis`;
    else if (genres_secondaires.includes('')) refus = `genre secondaire hors liste (${secondairesBruts.join(', ')}) : aucun nouveau genre n'est permis`;
    else if (univers.includes('')) refus = `univers hors liste (${universBruts.join(', ')}) : aucun nouvel univers n'est permis`;
    else if (classement.length) refus = classement.join(' ; ');
    if (refus) { console.log(`Refusée : ${titre || '(sans titre)'} — ${refus}`); continue; }

    const id = idUnique(slug(titre), ids);
    idees.push({ id, titre, description, genre, genres_secondaires, univers, source: 'agent', date_ajout: aujourdhui(), statut: 'en_attente', jeu_id: null });
    ids.add(id); titresPris.add(cle(titre)); place--; ajoutees++;
    const sec = genres_secondaires.length ? ` + ${genres_secondaires.join(', ')}` : '';
    console.log(`Ajoutée : ${titre} (${genre}${sec} ; ${univers.join(', ')})`);
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
  // Le formulaire donne les libellés (« Puzzle et logique ») ; les identifiants sont aussi acceptés.
  const genre = identifiant(env.GENRE, GENRES);
  const age = uneLigne(env.AGE, 4);
  const universBruts = nettoyerListe(String(env.UNIVERS || '').split(/[,;]/));
  const univers = universBruts.map((u) => identifiant(u, UNIVERS));
  const priorite = /^(1|oui|true)$/i.test(String(env.PRIORITE || '').trim());
  const repondre = (r) => console.log(JSON.stringify(r));

  if (titre.length < 2 || principe.length < 5 || !genre || !/^\d{1,2}\+$/.test(age)) {
    return repondre({ resultat: 'invalide', message: 'titre, principe, genre ou âge manquant' });
  }
  if (univers.includes('')) {
    return repondre({ resultat: 'invalide', message: `univers inconnu (${universBruts.join(', ')}) : choisis dans la liste du formulaire` });
  }
  const classement = problemesClassementIdee({ genre, univers });
  if (classement.length) {
    return repondre({ resultat: 'invalide', message: `${classement.join(' ; ')} (${UNIVERS_MAX} univers au plus)` });
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
    titre, description, genre, univers, source: 'humain', date_ajout: aujourdhui(), statut: 'en_attente', jeu_id: null,
  };
  // Priorité : en tête de la file, donc fabriquée au prochain passage. Sinon : à la fin.
  if (priorite) idees.unshift(idee); else idees.push(idee);
  await ecrire(FICHIER_IDEES, idees);
  const avant = ordreDeFabrication(idees).findIndex((i) => i.id === idee.id);
  repondre({
    resultat: 'ajoutee', id: idee.id, titre, description, genre, univers, avant,
    genreLibelle: libelleGenre(genre), universLibelles: univers.map(libelleUnivers),
  });
}

// Idées de la page privée /idees : issues ouvertes « idee-perso », lues par boucle-de-nuit.yml (étape b).
// Une issue déjà importée (champ "issue" dans idees.json ou l'archive) est ignorée : elle reste ouverte
// jusqu'à l'ouverture de la pull request de son jeu.
async function importerPerso(fichier) {
  if (!fichier) throw new Error('fichier des issues manquant : node scripts/idees.mjs importer-perso <fichier>');
  const { idees, archive } = await charger();
  let issues;
  try { issues = JSON.parse((await readFile(fichier, 'utf8')).replace(/^﻿/, '')); }
  catch (e) { throw new Error(`${fichier} illisible : ${e.message}`); }
  if (!Array.isArray(issues)) issues = [];

  const dejaImportees = new Set([...idees, ...archive].filter(estPerso).map((i) => i.issue));
  const ids = new Set([...idees, ...archive].map((i) => i.id));
  let ajoutees = 0;
  for (const p of issues) {
    const issue = Number(p?.issue);
    if (!Number.isInteger(issue) || issue <= 0 || dejaImportees.has(issue)) continue;
    const titre = uneLigne(String(p?.titre ?? '').replace(/^\s*idée\s*:\s*/i, ''), 80);
    // Identifiant de public/taxonomie.js (le libellé est aussi accepté).
    const genre = identifiant(p?.genre, GENRES);
    let description = uneLigne(p?.description, 2000);
    if (titre.length < 2) { console.log(`Issue #${issue} ignorée : titre manquant`); continue; }
    if (!genre) { console.log(`Issue #${issue} ignorée : genre hors liste (« ${uneLigne(p?.genre, 40)} »)`); continue; }
    // Description facultative sur la page : à défaut, le titre guide l'agent créateur.
    if (description.length < 10) description = `Idée de jeu : ${titre}.`;

    // Univers vides : l'agent créateur les choisit (comme pour une idée du formulaire sans univers).
    const id = idUnique(slug(titre), ids);
    idees.push({ id, titre, description, genre, univers: [], source: 'humain', date_ajout: aujourdhui(), statut: 'en_attente', jeu_id: null, issue });
    ids.add(id); dejaImportees.add(issue); ajoutees++;
    console.log(`Idée perso ajoutée (issue #${issue}) : ${titre} (${genre})`);
  }
  await ecrire(FICHIER_IDEES, idees);
  console.log(`${ajoutees} idée(s) perso ajoutée(s).`);
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
  // "issue" (idées perso) : la tâche de fabrication ferme l'issue une fois la pull request ouverte.
  console.log(JSON.stringify(choix.map(({ id, titre, description, genre, genres_secondaires, univers, issue }) => (
    { id, titre, description, genre, genres_secondaires: genres_secondaires || [], univers: univers || [],
      ...(estPerso({ issue }) ? { issue } : {}) }))));
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
  for (const j of await lireCatalogue()) if (j.idee && !publies.has(j.idee)) publies.set(j.idee, j);

  const restent = [];
  for (const i of idees) {
    if (publies.has(i.id)) {
      // L'archive garde le classement réel du jeu (univers choisis par l'agent si l'idée n'en avait pas).
      const jeu = publies.get(i.id);
      archive.push({
        ...i, genre: jeu.genre || i.genre, genres_secondaires: jeu.genres_secondaires,
        univers: jeu.univers.length ? jeu.univers : i.univers, statut: 'faite', jeu_id: jeu.id, essais: undefined,
      });
      console.log(`Faite : ${i.titre} → ${jeu.id}`);
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

// Entrée du catalogue construit (public/catalog.json) : genre et univers présents et dans les
// listes fermées, et ceux de l'idée (genre ; univers et genres secondaires si l'idée en donne).
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
    if (!IDS_GENRES.includes(entree.genre)) erreurs.push('catalogue : genre absent ou hors liste (public/taxonomie.js)');
    if (!entree.univers?.length) erreurs.push('catalogue : aucun univers valide (public/taxonomie.js)');
    if (!memesListes(entree.univers, fiche.univers) || !memesListes(entree.genres_secondaires, fiche.genres_secondaires || [])) {
      erreurs.push('catalogue : des genres ou univers de game.json ont été écartés (hors liste ou en trop)');
    }
  }
  const { idees } = await charger();
  const idee = idees.find((i) => i.id === fiche.idee);
  if (!idee) erreurs.push(`game.json : "idee" (${JSON.stringify(fiche.idee ?? null)}) ne correspond à aucune idée de idees.json`);
  else {
    if (fiche.genre !== idee.genre) erreurs.push(`game.json : "genre" doit être celui de l'idée (« ${idee.genre} »)`);
    if (idee.univers?.length && !memesListes(fiche.univers, idee.univers)) erreurs.push(`game.json : "univers" doivent être ceux de l'idée (${idee.univers.join(', ')})`);
    if (idee.genres_secondaires?.length && !memesListes(fiche.genres_secondaires, idee.genres_secondaires)) {
      erreurs.push(`game.json : "genres_secondaires" doivent être ceux de l'idée (${idee.genres_secondaires.join(', ')})`);
    }
  }
  for (const e of erreurs) console.log(`    ERREUR : ${e}`);
  if (!erreurs.length) {
    const sec = entree.genres_secondaires.length ? ` (+ ${entree.genres_secondaires.join(', ')})` : '';
    console.log(`✓ Entrée du catalogue conforme : genre « ${entree.genre} »${sec}, univers ${entree.univers.join(', ')}`);
  }
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
  'importer-perso': () => importerPerso(args[0]),
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
