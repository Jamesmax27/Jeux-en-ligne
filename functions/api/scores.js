// ==========================================================================
// GET /api/scores — pouces et score de chaque jeu
//
//   /api/scores           → tous les votes
//   /api/scores?pays=FR   → seulement les votes venant de France
//
// Réponse : { "<gameId>": { "up": n, "down": n, "score": x, "semaine": n }, ... }
//   semaine = nombre de votes des 7 derniers jours (votes modifiés compris).
// Les jeux sans vote n'apparaissent pas (le site les traite comme 0 / 0).
// L'en-tête X-Pays donne le pays détecté du visiteur (ex. FR), s'il est connu :
// le catalogue s'en sert pour la portée « Mon pays ».
// Le résultat est gardé 5 minutes en cache pour économiser la base D1.
// ==========================================================================

const DUREE_CACHE = 300; // secondes
const SEMAINE = 7 * 86400000; // millisecondes

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

// La copie en cache est commune à tous ; celle envoyée porte le pays du visiteur,
// d'où « private » : seul son navigateur peut la garder.
function pourLeVisiteur(reponse, request) {
  const copie = new Response(reponse.body, reponse);
  copie.headers.set('Cache-Control', `private, max-age=${DUREE_CACHE}`);
  const pays = (request.headers.get('CF-IPCountry') || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(pays) && pays !== 'XX') copie.headers.set('X-Pays', pays);
  return copie;
}

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const pays = (url.searchParams.get('pays') || '').toUpperCase();
  if (pays && !/^[A-Z]{2}$/.test(pays)) {
    return json({ erreur: 'Code pays invalide (2 lettres, ex. FR).' }, 400);
  }

  // Cache de Cloudflare (actif sur un nom de domaine personnalisé ;
  // sans effet, mais sans erreur, sur l'adresse en .pages.dev).
  const cle = new Request(`${url.origin}/api/scores${pays ? `?pays=${pays}` : ''}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const enCache = cache && (await cache.match(cle));
  if (enCache) return pourLeVisiteur(enCache, request);

  let resultats;
  try {
    const colonnes = 'game_id, SUM(value = 1) AS up, SUM(value = -1) AS down, SUM(created_at >= ?) AS semaine';
    const depuis = Date.now() - SEMAINE;
    const requete = pays
      ? env.DB.prepare(`SELECT ${colonnes} FROM votes WHERE country = ? GROUP BY game_id`).bind(depuis, pays)
      : env.DB.prepare(`SELECT ${colonnes} FROM votes GROUP BY game_id`).bind(depuis);
    ({ results: resultats } = await requete.all());
  } catch (erreur) {
    console.error('Lecture des scores impossible :', erreur);
    return json({ erreur: 'Scores indisponibles pour le moment.' }, 503, { 'Cache-Control': 'no-store' });
  }

  const scores = {};
  for (const ligne of resultats || []) {
    scores[ligne.game_id] = { ...ligneScore(ligne.up, ligne.down), semaine: Number(ligne.semaine) || 0 };
  }

  const reponse = json(scores, 200, { 'Cache-Control': `public, max-age=${DUREE_CACHE}` });
  if (cache) waitUntil(cache.put(cle, reponse.clone()));
  return pourLeVisiteur(reponse, request);
}
