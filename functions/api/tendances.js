// ==========================================================================
// GET /api/tendances — jeux les plus joués des 7 derniers jours
//
// Réponse : { "jours": 7, "jeux": [ { "id": "..." }, ... ] }
//   les NOMBRE_MAX jeux les plus joués, rangés par identifiant : ni rang, ni
//   chiffre. Un temps de jeu ou une place publiés donneraient une cible (et
//   une mesure de son effet) à qui voudrait fausser le classement. L'accueil
//   (public/app.js) les range lui-même dans un ordre qui change chaque jour.
// Classement interne : temps total joué, une partie comptant PARTIE_MAX au plus.
// Données : table « sessions » (remplie par /api/session).
// Le résultat est gardé 30 minutes en cache pour économiser la base D1.
// ==========================================================================

import { json, lireFormatSessions, valeurDebut } from '../_commun.js';

const DUREE_CACHE = 1800;       // secondes
const JOURS = 7;
const NOMBRE_MAX = 12;          // l'accueil en montre 8 (sans Archives, 2 par genre au plus)
const PARTIE_MAX = 1800;        // secondes comptées au plus par partie (30 min)
const DUREE_MAX = 3 * 3600;     // même limite que /api/session

export async function onRequestGet({ request, env, waitUntil }) {
  // Cache de Cloudflare (actif sur un nom de domaine personnalisé ;
  // sans effet, mais sans erreur, sur l'adresse en .pages.dev).
  const cle = new Request(`${new URL(request.url).origin}/api/tendances`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const enCache = cache && (await cache.match(cle));
  if (enCache) return enCache;

  let resultats;
  try {
    const format = await lireFormatSessions(env);
    const depuis = valeurDebut(format, Date.now() - JOURS * 86400000);
    ({ results: resultats } = await env.DB.prepare(
      `SELECT jeu_id, SUM(MIN(duree_secondes, ?)) AS total, COUNT(*) AS sessions
       FROM sessions
       WHERE debut >= ? AND duree_secondes > 0 AND duree_secondes <= ?
       GROUP BY jeu_id
       ORDER BY total DESC, sessions DESC, jeu_id
       LIMIT ?`
    ).bind(PARTIE_MAX, depuis, DUREE_MAX, NOMBRE_MAX).all());
  } catch (erreur) {
    console.error('Lecture des tendances impossible :', erreur);
    return json({ erreur: 'Tendances indisponibles pour le moment.' }, 503);
  }

  const jeux = (resultats || [])
    .map((ligne) => String(ligne.jeu_id))
    .sort()
    .map((id) => ({ id }));

  const reponse = json({ jours: JOURS, jeux }, 200, { 'Cache-Control': `public, max-age=${DUREE_CACHE}` });
  if (cache) waitUntil(cache.put(cle, reponse.clone()));
  return reponse;
}
