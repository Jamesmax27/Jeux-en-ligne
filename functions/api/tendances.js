// ==========================================================================
// GET /api/tendances — jeux les plus joués des 7 derniers jours
//
// Réponse : { "jours": 7, "jeux": [ { "id": "...", "sessions": n, "tempsTotal": s, "tempsMoyen": s }, ... ] }
//   classés par temps total joué (en secondes), du plus grand au plus petit ;
//   50 jeux au plus. tempsMoyen = temps moyen d'une partie, arrondi à la seconde.
// Données : table « sessions » (remplie par /api/session).
// Le résultat est gardé 5 minutes en cache pour économiser la base D1.
// ==========================================================================

import { json, lireFormatSessions, valeurDebut } from '../_commun.js';

const DUREE_CACHE = 300;        // secondes
const JOURS = 7;
const NOMBRE_MAX = 50;
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
      `SELECT jeu_id, COUNT(*) AS sessions, SUM(duree_secondes) AS total, AVG(duree_secondes) AS moyenne
       FROM sessions
       WHERE debut >= ? AND duree_secondes > 0 AND duree_secondes <= ?
       GROUP BY jeu_id
       ORDER BY total DESC, sessions DESC
       LIMIT ?`
    ).bind(depuis, DUREE_MAX, NOMBRE_MAX).all());
  } catch (erreur) {
    console.error('Lecture des tendances impossible :', erreur);
    return json({ erreur: 'Tendances indisponibles pour le moment.' }, 503);
  }

  const jeux = (resultats || []).map((ligne) => ({
    id: ligne.jeu_id,
    sessions: Number(ligne.sessions) || 0,
    tempsTotal: Number(ligne.total) || 0,
    tempsMoyen: Math.round(Number(ligne.moyenne) || 0),
  }));

  const reponse = json({ jours: JOURS, jeux }, 200, { 'Cache-Control': `public, max-age=${DUREE_CACHE}` });
  if (cache) waitUntil(cache.put(cle, reponse.clone()));
  return reponse;
}
