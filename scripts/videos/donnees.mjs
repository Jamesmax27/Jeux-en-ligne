// ==========================================================================
// donnees.mjs — ce que les vidéos affirment vient du dépôt, rien n'est inventé
//
//   - jeux et chiffres : games/*/game.json (nombre de jeux, genres, titres) ;
//   - emblème et mot-symbole : gabarits/morceaux/logo.html (le logo du site) ;
//   - choix des jeux : votes (/api/scores) et jeux les plus joués
//     (/api/tendances) du site, gardés dans marketing/videos/popularite.json
//     (relevé daté, refait par « video.mjs jeux --actualiser »).
// ==========================================================================

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ErreurVideo, JEUX, RACINE, SOURCES, ecrireJson, lireJson } from './commun.mjs';

export const SITE = 'https://freemicrogames.com';
const FICHIER_POPULARITE = path.join(SOURCES, 'popularite.json');
const FICHIER_REGLES = path.join(SOURCES, 'jeux.json');

let memoJeux = null;
/** Tous les jeux du dépôt : [{ id, titre, description, genre, univers, ages, ageMin, ajout, multijoueur, tempsReel, jaquette }]. */
export async function lireJeux() {
  if (memoJeux) return memoJeux;
  const jeux = [];
  for (const id of (await readdir(JEUX)).sort()) {
    const dossier = path.join(JEUX, id);
    if (!existsSync(path.join(dossier, 'index.html')) || !existsSync(path.join(dossier, 'game.json'))) continue;
    let f;
    try { f = JSON.parse(await readFile(path.join(dossier, 'game.json'), 'utf8')); } catch { continue; } // fiche illisible : le build l'ignore aussi
    if (f.id !== id || !f.title) continue;
    const jaquette = ['cover.webp', 'cover.png', 'cover.jpg'].map((n) => path.join(dossier, n)).find(existsSync) || null;
    jeux.push({
      id, titre: f.title, description: f.description || '', genre: f.genre || 'autre', secondaires: f.genres_secondaires || [],
      univers: f.univers || [], ages: f.ages || '', ageMin: parseInt(f.ages, 10) || 0, ajout: f.added || '',
      multijoueur: !!f.multijoueur, tempsReel: !!f.temps_reel, jaquette,
    });
  }
  memoJeux = jeux;
  return jeux;
}

export async function lireJeu(id) {
  const jeu = (await lireJeux()).find((j) => j.id === id);
  if (!jeu) throw new ErreurVideo(`Jeu inconnu : ${id} (pas de fiche games/${id}/game.json)`);
  return jeu;
}

/** Libellés français des genres (public/taxonomie.js, fichier de référence du site). */
async function lireGenres() {
  const { GENRES, ID_AUTRE } = await import(pathToFileURL(path.join(RACINE, 'public', 'taxonomie.js')).href);
  const textes = await lireJson(path.join(RACINE, 'public', 'i18n', 'site', 'fr.json'));
  // « autre » est une valeur de repli, jamais affichée sur le site : pas un genre.
  return GENRES.filter((g) => g.id !== ID_AUTRE).map((g) => ({ id: g.id, libelle: textes[`genre.${g.id}`] || g.libelle || g.id }));
}

/** Chiffres utilisables dans les textes des recettes, sous la forme {nom}. */
export async function chiffres() {
  const jeux = await lireJeux();
  const genres = await lireGenres();
  const parGenre = new Map();
  for (const j of jeux) parGenre.set(j.genre, (parGenre.get(j.genre) || 0) + 1);
  const derniere = jeux.map((j) => j.ajout).sort().pop() || '';
  const ilYA30Jours = derniere ? new Date(Date.parse(derniere) - 30 * 86400000).toISOString().slice(0, 10) : '';
  return {
    nb_jeux: jeux.length,
    nb_jeux_rond: Math.floor(jeux.length / 10) * 10,                    // « plus de 220 jeux » reste vrai quand le catalogue grandit
    nb_genres: genres.filter((g) => parGenre.get(g.id)).length,
    nb_multi: jeux.filter((j) => j.multijoueur).length,
    nb_ados: jeux.filter((j) => j.ageMin >= 13).length,
    nb_nouveaux_30j: jeux.filter((j) => j.ajout > ilYA30Jours).length,   // jeux ajoutés dans les 30 jours avant le dernier ajout
    site: SITE.replace('https://', ''),
  };
}

/** Remplace {nb_jeux}, {titre}… dans un texte de recette ; une variable inconnue est une erreur. */
export function remplir(texte, variables, ou = '') {
  return String(texte).replace(/\{([a-z0-9_]+)\}/g, (_, nom) => {
    if (!(nom in variables)) throw new ErreurVideo(`${ou} : variable inconnue {${nom}} (connues : ${Object.keys(variables).join(', ')})`);
    return String(variables[nom]);
  });
}

// --------------------------------------------------------------------------
// Logo du site : emblème (manette à planète) et mot-symbole, tirés du gabarit
// du site et colorés comme dans public/style.css (.marque-logo).
// --------------------------------------------------------------------------

export async function lireLogo() {
  const html = await readFile(path.join(RACINE, 'gabarits', 'morceaux', 'logo.html'), 'utf8');
  const blocs = html.match(/<svg[\s\S]*?<\/svg>/g) || [];
  if (blocs.length < 2) throw new ErreurVideo('Logo du site introuvable dans gabarits/morceaux/logo.html');
  const ns = 'xmlns="http://www.w3.org/2000/svg"';
  const embleme = blocs[0]
    .replace('<svg ', `<svg ${ns} width="560" height="380" `)
    .replaceAll('fill="#ccd3f8"', 'fill="#e4dcff"').replaceAll('fill="#a8b3f0"', 'fill="#c4b5fd"')
    .replaceAll('fill="#8e9ae2"', 'fill="#a694f2"').replaceAll('stroke="#0b1020"', 'stroke="#0e0c24"');
  const mot = blocs[1]
    .replace('<svg ', `<svg ${ns} width="1186" height="128" `)
    .replaceAll('currentColor', '#f2effa').replaceAll('fill="#f2d27a"', 'fill="#ffd88a"');
  const enData = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return { embleme: enData(embleme.replaceAll('fill="#f2d27a"', 'fill="#ffd88a"')), mot: enData(mot) };
}

// --------------------------------------------------------------------------
// Popularité : votes et jeux les plus joués, relevés sur le site.
// --------------------------------------------------------------------------

async function lireApi(chemin) {
  let reponse;
  try { reponse = await fetch(`${SITE}${chemin}`, { signal: AbortSignal.timeout(20000) }); } catch (e) {
    throw new ErreurVideo(`${SITE}${chemin} injoignable (${e.cause?.code || e.message}). Derrière un proxy : relancer avec NODE_USE_ENV_PROXY=1.`);
  }
  if (!reponse.ok) throw new ErreurVideo(`${SITE}${chemin} a répondu ${reponse.status}`);
  return reponse.json();
}

/** Relit les votes et les jeux les plus joués sur le site, et les range dans popularite.json. */
export async function actualiserPopularite() {
  const [scores, tendances] = await Promise.all([lireApi('/api/scores'), lireApi('/api/tendances')]);
  const connus = new Set((await lireJeux()).map((j) => j.id));
  const votes = {};
  for (const id of Object.keys(scores).sort()) if (connus.has(id)) votes[id] = { pour: scores[id].up, contre: scores[id].down, score: scores[id].score };
  const donnees = {
    releve: new Date().toISOString().slice(0, 10),
    source: `${SITE}/api/scores (votes, score de Wilson) et ${SITE}/api/tendances (jeux les plus joués sur ${tendances.jours} jours, sans rang)`,
    plus_joues: tendances.jeux.map((j) => j.id).filter((id) => connus.has(id)).sort(),
    votes,
  };
  await ecrireJson(FICHIER_POPULARITE, donnees);
  return donnees;
}

export async function lirePopularite() {
  if (!existsSync(FICHIER_POPULARITE)) throw new ErreurVideo('Pas de relevé de popularité : node scripts/videos/video.mjs jeux --actualiser');
  return lireJson(FICHIER_POPULARITE);
}

/**
 * Jeux candidats pour une vidéo, du plus légitime au moins légitime :
 * d'abord les jeux à la fois parmi les plus joués et bien notés, puis les
 * mieux notés (score de Wilson, puis nombre de votes). Les règles de
 * marketing/videos/jeux.json écartent les jeux pensés pour les jeunes
 * enfants et ceux qui ne se laissent pas filmer.
 */
export async function classerJeux() {
  const [jeux, pop, regles] = await Promise.all([lireJeux(), lirePopularite(), lireJson(FICHIER_REGLES)]);
  const joues = new Set(pop.plus_joues);
  const lignes = jeux.map((j) => {
    const v = pop.votes[j.id] || { pour: 0, contre: 0, score: 0 };
    let ecart = null;
    if (regles.ecartes?.[j.id]) ecart = regles.ecartes[j.id];
    else if (j.ageMin < regles.age_min && !regles.exceptions?.[j.id]) ecart = `conseillé dès ${j.ageMin} ans : pensé pour les plus jeunes (âge minimum retenu : ${regles.age_min} ans)`;
    return { ...j, pour: v.pour, contre: v.contre, score: v.score, plusJoue: joues.has(j.id), exception: regles.exceptions?.[j.id] || null, ecart };
  });
  lignes.sort((a, b) => (Number(b.plusJoue && b.score > 0) - Number(a.plusJoue && a.score > 0)) || b.score - a.score || (b.pour + b.contre) - (a.pour + a.contre) || Number(b.plusJoue) - Number(a.plusJoue) || a.id.localeCompare(b.id));
  return { releve: pop.releve, source: pop.source, lignes };
}
