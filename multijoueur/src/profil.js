// ==========================================================================
// Profil joueur côté Worker multijoueur (docs/cadrage-fidelisation.md, section 8)
//
// Le serveur, jamais le navigateur, valide et envoie le résultat de chaque
// manche en ligne : à la fin d'une manche, pour chaque vrai joueur encore
// assis qui a présenté un ticket valide (profil relié par le site après
// Turnstile, src/ticket.js), un résultat part vers le site
// (POST /api/profil-multi, secret MULTI_SECRET), qui l'enregistre une seule
// fois par manche et par joueur.
// Présence réelle : durée minimale de la manche et minimum de coups joués
// soi-même (pas ceux du robot qui a joué à sa place) — réglages communs avec
// le site : public/profil-reglages.js (le site les revérifie).
// ==========================================================================

import { MULTI_DUREE_MIN_S, MULTI_ACTIONS_MIN } from '../../public/profil-reglages.js';

/** Suivi d'une nouvelle manche (gardé avec l'état de la partie). */
export function nouveauSuivi(manche, maintenant) {
  return { manche, debut: maintenant, actions: {}, rapportee: false };
}

/**
 * Résultats de la manche qui vient de finir.
 *   regles   : règles du jeu (JEL_REGLES) ; etat : état final de la manche
 *   sieges   : cle du vrai joueur de chaque place (null = robot)
 *   profils  : fonction cle → numéro de profil (ou null)
 *   suivi    : { manche, debut, actions: { cle: n } }
 * Renvoie [{ partie, profil, jeu, victoire, humains, duree, actions }] : seuls
 * les joueurs reliés à un profil et assez présents.
 */
export function resultatsManche({ regles, etat, sieges, profils, suivi, nom, jeu, maintenant }) {
  if (!suivi || suivi.rapportee || !suivi.manche) return [];
  let fin = null;
  try { fin = regles.fin(JSON.parse(JSON.stringify(etat))); } catch { fin = null; }
  if (!fin || !Array.isArray(fin.classement) || !fin.classement.length) return [];
  const humains = sieges.filter((c) => c !== null).length;
  const duree = Math.max(0, Math.round((maintenant - suivi.debut) / 1000));
  const liste = [];
  sieges.forEach((cle, siege) => {
    if (cle === null) return;
    const profil = profils(cle);
    const actions = suivi.actions[cle] || 0;
    if (!profil || duree < MULTI_DUREE_MIN_S || actions < MULTI_ACTIONS_MIN) return;
    liste.push({ partie: `${nom}#${suivi.manche}`, profil, jeu, victoire: fin.classement[0] === siege, humains, duree, actions });
  });
  return liste;
}

/** Envoie les résultats au site. Ne lève jamais d'erreur. */
export async function envoyerResultats(env, resultats) {
  if (!resultats.length || !env.MULTI_SECRET) return;
  const site = String(env.SITE_API || 'https://freemicrogames.com').replace(/\/+$/, '');
  try {
    const reponse = await fetch(`${site}/api/profil-multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.MULTI_SECRET}` },
      body: JSON.stringify({ resultats }),
    });
    if (!reponse.ok) console.warn(`Résultats multijoueur refusés par le site : HTTP ${reponse.status}`);
  } catch (erreur) {
    console.warn('Résultats multijoueur non envoyés :', erreur);
  }
}
