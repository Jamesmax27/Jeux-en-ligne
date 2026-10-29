// ==========================================================================
// moderation.mjs — modération IA des demandes publiques (formulaire /proposer/)
//
// Utilisé par .github/workflows/moderation-demande.yml :
//
//   node scripts/moderation.mjs preparer
//       Lit l'issue (variables ISSUE_BODY et NUMERO), écrit dans .moderation/ :
//         demande.json    la demande du visiteur (donnée non fiable) ;
//         catalogue.json  les jeux publiés (games/*/game.json) : id, titre,
//                         description, genres, univers ;
//         taxonomie.json  identifiants permis (public/taxonomie.js) et âges.
//       Cas tranchés sans IA (type illisible, jeu absent ou inconnu pour un bug
//       ou une modification) : verdict.json écrit tout de suite.
//       Sortie GITHUB_OUTPUT : ia=true|false.
//
//   node scripts/moderation.mjs verifier
//       Contrôle strict de .moderation/verdict.json (écrit par Claude) : toute
//       valeur hors liste rend le verdict invalide (code de sortie 1). Écrit
//       .moderation/avis.json (verdict nettoyé, ajouté ensuite à l'issue) et
//       GITHUB_OUTPUT : decision, categorie, abus (true si insulte ou spam).
//
// Le texte du visiteur n'est jamais placé dans le prompt : Claude le lit dans
// demande.json, avec la consigne de le juger sans jamais suivre ce qu'il dit.
// Même un verdict « valide » obtenu par ruse passe encore par la validation
// humaine (page /idees, onglet « Demandes publiques »).
// ==========================================================================

import { readFile, writeFile, mkdir, readdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENRES, UNIVERS, IDS_GENRES, IDS_UNIVERS, UNIVERS_MAX, AGES } from '../public/taxonomie.js';
import { TYPES_DEMANDE, TYPES_AVEC_JEU } from '../public/demandes-regles.js';
import { lireDemandePublique, MOTIFS_IA, AGE_MIN, AGE_MAX } from '../functions/_demandes.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, '.moderation');

// Catégories d'un refus et d'une validation.
export const CATEGORIES_REFUS = ['insulte', 'spam', 'inadapte', 'hors-sujet', 'incomprehensible', 'doublon', 'jeu-incoherent'];
export const CATEGORIES_VALIDE = { nouveau: ['nouveau-jeu'], bug: ['bug', 'amelioration', 'modification'], modification: ['bug', 'amelioration', 'modification'] };

const MOTIF_MAX = 600;
const RESUME_MAX = 800;

const lireJson = async (fichier) => JSON.parse((await readFile(fichier, 'utf8')).replace(/^﻿/, ''));

async function sortie(valeurs) {
  const lignes = Object.entries(valeurs).map(([cle, valeur]) => {
    const texte = String(valeur);
    return texte.includes('\n') ? `${cle}<<FIN_${cle.toUpperCase()}\n${texte}\nFIN_${cle.toUpperCase()}` : `${cle}=${texte}`;
  });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${lignes.join('\n')}\n`);
  else console.log(lignes.join('\n'));
}

/** Jeux publiés : games/<id>/game.json. */
async function catalogue() {
  const dossier = path.join(RACINE, 'games');
  const jeux = [];
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue;
    try {
      const f = await lireJson(path.join(dossier, e.name, 'game.json'));
      jeux.push({
        id: e.name, titre: f.title, description: f.description, genre: f.genre,
        genres_secondaires: f.genres_secondaires || [], univers: f.univers || [], ages: f.ages,
      });
    } catch { /* fiche illisible : ignorée */ }
  }
  return jeux.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Contrôle d'un verdict (objet lu dans verdict.json) pour une demande de ce type.
 * Renvoie { avis } (verdict nettoyé) ou { erreur }.
 */
export function controlerVerdict(verdict, type) {
  if (!verdict || typeof verdict !== 'object' || Array.isArray(verdict)) return { erreur: 'verdict absent ou pas un objet JSON' };
  const { decision, categorie } = verdict;
  if (!['valide', 'refuse'].includes(decision)) return { erreur: `decision invalide (${JSON.stringify(decision)})` };
  const permises = decision === 'refuse' ? CATEGORIES_REFUS : (CATEGORIES_VALIDE[type] || []);
  if (!permises.includes(categorie)) return { erreur: `categorie « ${categorie} » impossible pour une demande ${type} ${decision === 'refuse' ? 'refusée' : 'validée'}` };
  const motif = typeof verdict.motif === 'string' ? verdict.motif.replace(/\s+/g, ' ').trim() : '';
  if (!motif) return { erreur: 'motif absent' };
  const resume = typeof verdict.resume === 'string' ? verdict.resume.replace(/\s+/g, ' ').trim() : '';
  if (decision === 'valide' && !resume) return { erreur: 'resume absent pour une demande validée' };

  const avis = { decision, categorie, motif: motif.slice(0, MOTIF_MAX), resume: resume.slice(0, RESUME_MAX) };
  // Classement proposé pour un nouveau jeu : valeurs hors liste écartées (le propriétaire choisit alors dans /idees).
  if (decision === 'valide' && type === 'nouveau') {
    if (IDS_GENRES.includes(verdict.genre)) avis.genre = verdict.genre;
    if (Array.isArray(verdict.univers)) {
      const univers = [...new Set(verdict.univers.filter((u) => IDS_UNIVERS.includes(u)))];
      if (univers.length <= UNIVERS_MAX && !(univers.includes('autre') && univers.length > 1)) avis.univers = univers;
    }
    const age = /^\d{1,2}\+$/.test(String(verdict.ages ?? '')) ? parseInt(verdict.ages, 10) : NaN;
    if (age >= AGE_MIN && age <= AGE_MAX && AGES.includes(`${age}+`)) avis.ages = `${age}+`;
  }
  return { avis };
}

async function preparer() {
  await mkdir(DOSSIER, { recursive: true });
  const numero = Number(process.env.NUMERO);
  const d = lireDemandePublique(process.env.ISSUE_BODY || '');
  const jeux = await catalogue();
  const demande = {
    numero,
    type: d.type,
    jeu: d.jeu || null,
    titre: d.titre,
    description: d.description,
  };
  const jeu = d.jeu ? jeux.find((j) => j.id === d.jeu) : null;
  if (jeu) demande.jeu_publie = { titre: jeu.titre, description: jeu.description };

  await writeFile(path.join(DOSSIER, 'demande.json'), `${JSON.stringify(demande, null, 2)}\n`);
  await writeFile(path.join(DOSSIER, 'catalogue.json'), `${JSON.stringify(jeux, null, 2)}\n`);
  await writeFile(path.join(DOSSIER, 'taxonomie.json'), `${JSON.stringify({
    genres: GENRES.map((g) => ({ id: g.id, libelle: g.libelle })),
    univers: UNIVERS.map((u) => ({ id: u.id, libelle: u.libelle })),
    univers_max: UNIVERS_MAX,
    ages: AGES,
  }, null, 2)}\n`);

  // Cas tranchés sans IA : rien à juger.
  let verdict = null;
  if (!TYPES_DEMANDE.includes(d.type)) {
    verdict = { decision: 'refuse', categorie: 'incomprehensible', motif: 'Type de demande illisible (issue modifiée à la main ?).', resume: '' };
  } else if (TYPES_AVEC_JEU.includes(d.type) && !jeu) {
    verdict = { decision: 'refuse', categorie: 'jeu-incoherent', motif: `Le jeu « ${d.jeu || '(aucun)'} » n'existe pas sur le site.`, resume: '' };
  } else if (!d.titre || !d.description) {
    verdict = { decision: 'refuse', categorie: 'incomprehensible', motif: 'Titre ou description absents.', resume: '' };
  }
  if (verdict) await writeFile(path.join(DOSSIER, 'verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
  console.log(`Demande #${numero} (${d.type || '?'}${d.jeu ? `, jeu ${d.jeu}` : ''}) : ${verdict ? `tranchée sans IA (${verdict.categorie})` : "à juger par l'IA"}.`);
  await sortie({ ia: verdict ? 'false' : 'true' });
}

async function verifier() {
  const demande = await lireJson(path.join(DOSSIER, 'demande.json'));
  let verdict;
  try {
    verdict = await lireJson(path.join(DOSSIER, 'verdict.json'));
  } catch (e) {
    console.error(`::error::verdict.json absent ou illisible : ${e.message}`);
    process.exit(1);
  }
  const { avis, erreur } = controlerVerdict(verdict, demande.type);
  if (erreur) {
    console.error(`::error::verdict invalide : ${erreur}`);
    process.exit(1);
  }
  await writeFile(path.join(DOSSIER, 'avis.json'), `${JSON.stringify(avis, null, 2)}\n`);
  console.log(`Verdict : ${avis.decision} (${avis.categorie}) — ${avis.motif}`);
  await sortie({ decision: avis.decision, categorie: avis.categorie, abus: String(avis.decision === 'refuse' && MOTIFS_IA.includes(avis.categorie)) });
}

// --- Ligne de commande ---------------------------------------------------------------

const estPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (estPrincipal) {
  const commande = process.argv[2];
  const commandes = { preparer, verifier };
  if (!commandes[commande]) {
    console.error('Usage : node scripts/moderation.mjs preparer | verifier');
    process.exit(2);
  }
  if (!existsSync(path.join(RACINE, 'games'))) {
    console.error('Dossier games/ introuvable : lancer depuis le dépôt.');
    process.exit(2);
  }
  commandes[commande]().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}
