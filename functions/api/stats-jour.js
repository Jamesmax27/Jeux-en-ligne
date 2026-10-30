// ==========================================================================
// POST /api/stats-jour — calcul quotidien des statistiques des jeux
// Appelé une fois par jour par .github/workflows/stats-jour.yml, jamais par un
// navigateur.
//
// En-tête : Authorization: Bearer <STATS_SECRET> (secret partagé : même valeur
//           dans Cloudflare et dans les secrets GitHub).
//
// 1. Calcule les jours complets qui manquent dans game_stats_daily (la veille,
//    et les jours sautés si la tâche n'est pas passée), voir functions/_stats.js.
// 2. Efface les sessions brutes de plus de 60 jours (politique de
//    confidentialité) ; les statistiques par jour sont gardées sans limite.
//
// 3. Profil joueur : indicateurs de fidélisation des jours manquants
//    (fidelisation_jour) et effacement de ce qui a dépassé sa durée de
//    conservation (gains, jours de visite, profils inactifs depuis 2 ans…),
//    voir tacheQuotidienneProfil dans functions/_profil.js. Une erreur ici
//    n'empêche pas les statistiques des jeux.
//
// Réponse : { "ok": true, "jours": ["AAAA-MM-JJ", …], "effacees": n, "fidelisation": [jours] | null }
// ==========================================================================

import { json, bonSecret } from '../_commun.js';
import { calculerJoursManquants, effacerSessionsAnciennes } from '../_stats.js';
import { tacheQuotidienneProfil } from '../_profil.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ erreur: 'Méthode non autorisée.' }, 405, { Allow: 'POST' });
  if (!env.STATS_SECRET || !env.DB) {
    console.error('STATS_SECRET ou la base DB ne sont pas configurés.');
    return json({ erreur: 'Indisponible.' }, 503);
  }
  if (!(await bonSecret(request, env.STATS_SECRET))) return json({ erreur: 'Accès refusé.' }, 401);

  try {
    const jours = await calculerJoursManquants(env);
    const effacees = await effacerSessionsAnciennes(env);
    let fidelisation = null;
    try {
      fidelisation = await tacheQuotidienneProfil(env, Date.now());
    } catch (erreur) {
      console.error('Indicateurs de fidélisation impossibles :', erreur);
    }
    return json({ ok: true, jours, effacees, fidelisation });
  } catch (erreur) {
    console.error('Calcul des statistiques impossible :', erreur);
    return json({ erreur: 'Calcul impossible pour le moment.' }, 503);
  }
}
