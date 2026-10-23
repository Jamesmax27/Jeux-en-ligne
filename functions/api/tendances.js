// ==========================================================================
// GET /api/tendances — jeux les plus joués des 7 derniers jours
//
// Réponse : { "jours": 7, "jeux": [ { "id": "..." }, ... ] }
//   les NOMBRE_MAX jeux les plus joués, rangés par identifiant : ni rang, ni
//   chiffre. Un temps de jeu ou une place publiés donneraient une cible (et
//   une mesure de son effet) à qui voudrait fausser le classement. L'accueil
//   (public/app.js) les range lui-même dans un ordre qui change chaque jour.
//
// Classement : joueurs différents. On compte des joueurs, pas les heures
// annoncées par le navigateur (n'importe qui peut envoyer de fausses parties
// à /api/session) :
//   - un joueur = une empreinte d'adresse (colonne visiteur, voir
//     empreinteVisiteur dans functions/_commun.js : adresse IPv4, ou réseau
//     /56 en IPv6) ; il compte pour un jour s'il a joué au moins JOUEUR_MIN_S
//     à ce jeu ce jour-là (UTC ; une partie compte PARTIE_MAX au plus) ;
//     1 000 fausses parties d'une même adresse valent donc 1 joueur ;
//   - tri : joueurs différents sur la période, puis joueurs-jours (un joueur
//     qui revient un autre jour), puis temps (JOUR_MAX au plus par joueur, par
//     jeu et par jour), puis identifiant. Les joueurs d'abord : un foyer qui a
//     3 connexions (box en IPv4 et IPv6, téléphone) pèse 3, même s'il revient
//     chaque jour, et passe derrière un jeu découvert par 15 enfants ;
//   - un jeu n'entre qu'avec JOUEURS_MIN joueurs différents au moins ;
//   - écartés : parties sans empreinte (IP_SALT absent) et sorties du réseau
//     Tor (pays « T1 » donné par Cloudflare).
// Cela rend la triche coûteuse (il faut de nombreuses adresses réelles), pas
// impossible.
// Période : les 7 jours UTC terminés avant (maintenant − MARGE). Une partie
// n'est écrite qu'à sa fin (3 h au plus) : la marge laisse arriver celles qui
// étaient en cours à minuit, pour que tous les centres de données calculent
// la même liste. Le résultat change donc une fois par jour, vers 03:10 UTC.
// Il est gardé en cache jusque-là par Cloudflare (une copie par centre de
// données), au plus une heure par le navigateur.
// Données : table « sessions » (remplie par /api/session). Index conseillé
// (schema.sql) : sessions_debut, qui évite de relire toute la table.
// ==========================================================================

import { json, lireFormatSessions, valeurDebut } from '../_commun.js';

const VERSION_CALCUL = 3;       // à augmenter si le calcul change (nouvelle clé de cache)
const JOURS = 7;
const NOMBRE_MAX = 12;          // l'accueil en montre 8 (sans Archives, 2 par genre au plus)
const PARTIE_MAX = 1800;        // secondes comptées au plus par partie (30 min)
const JOUR_MAX = 3600;          // secondes comptées au plus par joueur, par jeu et par jour
const JOUEUR_MIN_S = 60;        // un joueur compte pour un jour s'il a joué au moins 60 s
const JOUEURS_MIN = 3;          // joueurs différents (sur la période) pour entrer
const DUREE_MAX = 3 * 3600;     // même limite que /api/session
const MARGE = DUREE_MAX + 600;   // secondes : partie la plus longue + 10 min pour son envoi
const JOUR_MS = 86400000;
const CACHE_SERVEUR = 86400;    // secondes (la clé change chaque jour)
const CACHE_NAVIGATEUR = 3600;  // secondes, et jamais au-delà du prochain calcul

export async function onRequestGet({ request, env, waitUntil }) {
  const maintenant = Date.now();
  // Fin de la période : le minuit UTC qui précède (maintenant − MARGE).
  const finPeriode = Math.floor((maintenant - MARGE * 1000) / JOUR_MS) * JOUR_MS;
  const jour = new Date(finPeriode).toISOString().slice(0, 10);
  const prochainCalcul = finPeriode + JOUR_MS + MARGE * 1000;
  const enTetesNavigateur = {
    'Cache-Control': `public, max-age=${Math.max(60, Math.min(CACHE_NAVIGATEUR, Math.floor((prochainCalcul - maintenant) / 1000)))}`,
  };

  // Cache de Cloudflare (actif sur un nom de domaine personnalisé ; sans effet,
  // mais sans erreur, sur l'adresse en .pages.dev). Une clé par jour de calcul.
  const cle = new Request(`${new URL(request.url).origin}/api/tendances?jour=${jour}&calcul=${VERSION_CALCUL}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const enCache = cache && (await cache.match(cle));
  if (enCache) {
    const reponse = new Response(enCache.body, enCache);
    reponse.headers.set('Cache-Control', enTetesNavigateur['Cache-Control']);
    return reponse;
  }

  if (!env.IP_SALT) {
    console.error('IP_SALT absent : les nouvelles parties n\'ont pas d\'empreinte et ne comptent pas dans les Tendances.');
  }

  let resultats;
  try {
    const format = await lireFormatSessions(env);
    // Jour UTC d'une partie : numéro du jour (millisecondes) ou date « AAAA-MM-JJ » (texte ISO).
    const jourPartie = format.debutNombre ? `CAST(debut / ${JOUR_MS} AS INTEGER)` : 'substr(debut, 1, 10)';
    ({ results: resultats } = await env.DB.prepare(
      `SELECT jeu_id, COUNT(*) AS joueurs_jours, COUNT(DISTINCT visiteur) AS joueurs, SUM(temps) AS temps
       FROM (
         SELECT jeu_id, visiteur, ${jourPartie} AS jour, MIN(SUM(MIN(duree_secondes, ?)), ?) AS temps
         FROM sessions
         WHERE debut >= ? AND debut < ?
           AND visiteur IS NOT NULL AND COALESCE(pays, '') <> 'T1'
           AND duree_secondes > 0 AND duree_secondes <= ?
         GROUP BY jeu_id, visiteur, jour
         HAVING SUM(MIN(duree_secondes, ?)) >= ?
       )
       GROUP BY jeu_id
       HAVING COUNT(DISTINCT visiteur) >= ?
       ORDER BY joueurs DESC, joueurs_jours DESC, temps DESC, jeu_id
       LIMIT ?`
    ).bind(
      PARTIE_MAX, JOUR_MAX,
      valeurDebut(format, finPeriode - JOURS * JOUR_MS), valeurDebut(format, finPeriode),
      DUREE_MAX,
      PARTIE_MAX, JOUEUR_MIN_S,
      JOUEURS_MIN,
      NOMBRE_MAX,
    ).all());
  } catch (erreur) {
    console.error('Lecture des tendances impossible :', erreur);
    return json({ erreur: 'Tendances indisponibles pour le moment.' }, 503);
  }

  const jeux = (resultats || [])
    .map((ligne) => String(ligne.jeu_id))
    .sort()
    .map((id) => ({ id }));

  const corps = { jours: JOURS, jeux };
  if (cache) waitUntil(cache.put(cle, json(corps, 200, { 'Cache-Control': `public, max-age=${CACHE_SERVEUR}` })));
  return json(corps, 200, enTetesNavigateur);
}
