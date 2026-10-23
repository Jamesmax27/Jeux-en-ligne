// ==========================================================================
// Jeux-en-ligne — votes côté navigateur (partagé par le lanceur et le catalogue)
//
// - Le vote est enregistré tout de suite sur l'appareil, puis envoyé à
//   /api/vote. Sans réseau (ou si l'API ne répond pas), il reste en attente
//   et part plus tard : au retour de la connexion ou à la prochaine visite.
// - Chaque envoi est vérifié par Cloudflare Turnstile (turnstile.js), chargé
//   seulement au moment d'envoyer un vote (jamais au simple affichage d'une page).
// - Tout accès au stockage est protégé : sans localStorage, les votes
//   fonctionnent quand même, le temps de la visite.
// ==========================================================================

import { jetonTurnstile } from './turnstile.js';

const DELAI_ENVOI = 10000;      // 10 s pour que l'API réponde

const CLES = {
  votant: 'jel-votant',
  votes: 'jel-votes',             // { gameId: 1 | -1 } : mes votes
  attente: 'jel-votes-attente',   // { gameId: 1 | -1 | 0 } : votes pas encore envoyés
};

// Copie en mémoire, au cas où le stockage serait indisponible.
const memoire = {};

function lire(cle, defaut) {
  if (cle in memoire) return memoire[cle];
  let valeur = defaut;
  try {
    const brut = localStorage.getItem(cle);
    if (brut) valeur = JSON.parse(brut);
  } catch { /* stockage indisponible ou illisible */ }
  memoire[cle] = valeur;
  return valeur;
}

function ecrire(cle, valeur) {
  memoire[cle] = valeur;
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch { /* tant pis */ }
}

function nouvelIdentifiant() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // crypto.randomUUID n'existe qu'en HTTPS : repli pour les tests en Wi-Fi local.
  const o = crypto.getRandomValues(new Uint8Array(16));
  return [...o].map((x) => x.toString(16).padStart(2, '0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');
}

function identifiantVotant() {
  let id = lire(CLES.votant, null);
  if (typeof id !== 'string' || !id) {
    id = nouvelIdentifiant();
    ecrire(CLES.votant, id);
  }
  return id;
}

// --- API publique -----------------------------------------------------------

/** Mon vote pour ce jeu : 1, -1 ou 0 (pas de vote). */
export function monVote(gameId) {
  return lire(CLES.votes, {})[gameId] || 0;
}

/**
 * Tous mes votes { gameId: 1 | -1 }, relus depuis le stockage : un vote a pu
 * être fait dans le lanceur depuis le chargement de la page (bouton « Précédent »).
 */
export function mesVotes() {
  try {
    const brut = localStorage.getItem(CLES.votes);
    if (brut) memoire[CLES.votes] = JSON.parse(brut);
  } catch { /* stockage indisponible ou illisible : copie en mémoire */ }
  return { ...lire(CLES.votes, {}) };
}

/** Y a-t-il des votes qui attendent d'être envoyés ? */
export function votesEnAttente() {
  return Object.keys(lire(CLES.attente, {})).length > 0;
}

/**
 * Vote pour un jeu (1, -1, ou 0 pour annuler).
 * Renvoie 'envoye' si le serveur l'a reçu, sinon 'en-attente'.
 */
export async function voter(gameId, valeur) {
  const votes = { ...lire(CLES.votes, {}) };
  if (valeur === 0) delete votes[gameId];
  else votes[gameId] = valeur;
  ecrire(CLES.votes, votes);

  ecrire(CLES.attente, { ...lire(CLES.attente, {}), [gameId]: valeur });
  await envoyerEnAttente();
  return gameId in lire(CLES.attente, {}) ? 'en-attente' : 'envoye';
}

let envoiEnCours = null;
let relancer = false;

/** Envoie les votes en attente. Ne lève jamais d'erreur. */
export function envoyerEnAttente() {
  if (envoiEnCours) {
    // Un envoi tourne déjà : on refera un tour pour le vote qui vient d'arriver.
    relancer = true;
    return envoiEnCours;
  }
  envoiEnCours = (async () => {
    do {
      relancer = false;
      await envoyer();
    } while (relancer);
  })().finally(() => { envoiEnCours = null; });
  return envoiEnCours;
}

// Nouvel essai dès que la connexion revient.
addEventListener('online', () => { if (votesEnAttente()) envoyerEnAttente(); });

// --- Envoi ------------------------------------------------------------------

async function envoyer() {
  if (navigator.onLine === false) return;

  for (const [gameId, valeur] of Object.entries(lire(CLES.attente, {}))) {
    let reponse;
    try {
      const jeton = await jetonTurnstile('vote');
      reponse = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, value: valeur, voterId: identifiantVotant(), turnstileToken: jeton }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(DELAI_ENVOI) : undefined,
      });
    } catch (erreur) {
      console.warn('Vote non envoyé (réseau ou vérification) :', erreur);
      return; // on réessaiera plus tard
    }

    // 2xx : reçu. 400 : refusé pour de bon (jeu inconnu…), inutile de réessayer.
    // Autres cas (API absente, surcharge, anti-robot) : on garde le vote pour plus tard.
    if (reponse.ok || reponse.status === 400) {
      const attente = { ...lire(CLES.attente, {}) };
      if (attente[gameId] === valeur) { // sauf si le joueur a revoté entre-temps
        delete attente[gameId];
        ecrire(CLES.attente, attente);
      }
    } else {
      console.warn(`Vote non enregistré (HTTP ${reponse.status}), nouvel essai plus tard.`);
      return;
    }
  }
}
