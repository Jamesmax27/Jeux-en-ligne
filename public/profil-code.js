// ==========================================================================
// Free Micro Games — code de sauvegarde du profil joueur
//
// Format : 4 mots simples tirés d'une liste de 2 048 (public/profil-mots.js),
// puis une clé de contrôle de 2 chiffres, séparés par des tirets :
//   « chat-lune-fusee-pomme-37 »
// 2 048⁴ ≈ 17 600 milliards de combinaisons. La clé détecte les fautes de
// frappe : un mot remplacé par un autre mot de la liste, ou deux mots
// inversés, la changent presque toujours ; un mot mal écrit n'est de toute
// façon pas dans la liste. Les mots n'ont ni accent ni majuscule, les
// chiffres ne sont que dans la clé : aucune confusion entre 0 et O.
//
// Le code ne contient aucune progression : c'est une clé, tirée au hasard par
// un générateur sûr (crypto.getRandomValues), jamais construite à partir du
// pseudo ou d'un compteur. La progression reste dans la base (functions/_profil.js).
//
// Partagé par le navigateur (profil-page.js : contrôle à la saisie) et le
// serveur (functions/_profil.js : création et contrôle).
// ==========================================================================

import { MOTS } from './profil-mots.js';

const POIDS = [1, 3, 7, 11];   // poids des mots dans la clé (premiers avec 97)
const MODULE = 97;             // clé : 00 à 96

const index = new Map(MOTS.map((mot, i) => [mot, i]));

function cle(indices) {
  const somme = indices.reduce((s, i, k) => s + (i + 1) * POIDS[k], 13);
  return String(somme % MODULE).padStart(2, '0');
}

/** Forme comparée d'un code tapé : minuscules, sans accents, mots séparés par un tiret. */
export function normaliserCode(texte) {
  return String(texte || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Contrôle un code tapé. Renvoie { ok: true, code } (code normalisé), ou
 * { ok: false, raison } : 'format' (pas 4 mots + 2 chiffres), 'mot' (mot
 * absent de la liste, avec sa position dans { position }), 'cle' (clé fausse).
 */
export function lireCode(texte) {
  const morceaux = normaliserCode(texte).split('-').filter(Boolean);
  if (morceaux.length !== POIDS.length + 1 || !/^\d{2}$/.test(morceaux[POIDS.length])) return { ok: false, raison: 'format' };
  const indices = [];
  for (let k = 0; k < POIDS.length; k++) {
    const i = index.get(morceaux[k]);
    if (i === undefined) return { ok: false, raison: 'mot', position: k + 1 };
    indices.push(i);
  }
  if (cle(indices) !== morceaux[POIDS.length]) return { ok: false, raison: 'cle' };
  return { ok: true, code: morceaux.join('-') };
}

/** Nouveau code tiré au hasard (générateur sûr). */
export function nouveauCode() {
  const hasard = crypto.getRandomValues(new Uint16Array(POIDS.length));
  const indices = [...hasard].map((x) => x % MOTS.length);   // 65 536 est un multiple de 2 048 : aucun biais
  return [...indices.map((i) => MOTS[i]), cle(indices)].join('-');
}
