// ==========================================================================
// GET /api/scores — pouces et score de chaque jeu (votes du monde entier)
//
// Réponse : { "<gameId>": { "up": n, "down": n, "score": x, "jour": n, "semaine": n, "mois": n }, ... }
//   jour, semaine, mois = nombre de votes des dernières 24 heures, des 7 et des
//   30 derniers jours (votes modifiés compris) : tris « Populaires aujourd'hui »,
//   « cette semaine » et « ce mois-ci » du catalogue.
// Les jeux sans vote n'apparaissent pas (le site les traite comme 0 / 0).
// Le résultat est gardé 5 minutes en cache pour économiser la base D1.
// ==========================================================================

const DUREE_CACHE = 300; // secondes
const JOUR = 86400000; // millisecondes
const SEMAINE = 7 * JOUR;
const MOIS = 30 * JOUR;

// Borne inférieure de l'intervalle de Wilson (z = 1,96).
// Repères : 90/10 → 0,826 ; 1/0 → 0,207 ; 20/30 → 0,276 ; 0/0 → 0.
export function wilson(up, down, z = 1.96) {
  const n = up + down;
  if (n === 0) return 0;
  const p = up / n;
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const marge = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return (centre - marge) / (1 + z2 / n);
}

// Arrondi à 4 décimales : suffisant pour trier, réponse plus légère.
export function ligneScore(up, down) {
  up = Number(up) || 0;
  down = Number(down) || 0;
  return { up, down, score: Math.round(wilson(up, down) * 10000) / 10000 };
}

function json(donnees, statut = 200, entetes = {}) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...entetes },
  });
}

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);

  // Cache de Cloudflare (actif sur un nom de domaine personnalisé ;
  // sans effet, mais sans erreur, sur l'adresse en .pages.dev).
  const cle = new Request(`${url.origin}/api/scores`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const enCache = cache && (await cache.match(cle));
  if (enCache) return enCache;

  let resultats;
  try {
    const maintenant = Date.now();
    const requete = env.DB.prepare(`SELECT game_id, SUM(value = 1) AS up, SUM(value = -1) AS down,
        SUM(created_at >= ?) AS jour, SUM(created_at >= ?) AS semaine, SUM(created_at >= ?) AS mois
      FROM votes GROUP BY game_id`).bind(maintenant - JOUR, maintenant - SEMAINE, maintenant - MOIS);
    ({ results: resultats } = await requete.all());
  } catch (erreur) {
    console.error('Lecture des scores impossible :', erreur);
    return json({ erreur: 'Scores indisponibles pour le moment.' }, 503, { 'Cache-Control': 'no-store' });
  }

  const scores = {};
  for (const ligne of resultats || []) {
    scores[ligne.game_id] = {
      ...ligneScore(ligne.up, ligne.down),
      jour: Number(ligne.jour) || 0,
      semaine: Number(ligne.semaine) || 0,
      mois: Number(ligne.mois) || 0,
    };
  }

  const reponse = json(scores, 200, { 'Cache-Control': `public, max-age=${DUREE_CACHE}` });
  if (cache) waitUntil(cache.put(cle, reponse.clone()));
  return reponse;
}
