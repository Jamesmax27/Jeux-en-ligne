// ==========================================================================
// POST /api/session — enregistre une partie (temps passé sur un jeu)
//
// Corps : { "jeuId": "...", "duree": secondes, "erreur": "..." | null,
//           "visitorId": "<uuid>", "startedAt": ms, "completed": true | false,
//           "level": n | null, "replay": true | false }
// Envoyé par le lanceur (public/suivi.js, navigator.sendBeacon) quand la page
// du jeu est cachée ou quittée : une seule écriture par session. Si le joueur
// revient sur la page peu après, le temps joué ensuite arrive dans une 2e ligne
// avec les mêmes visitorId et startedAt (regroupées par functions/_stats.js).
//
// - duree : nombre entier de secondes, de 2 s à 3 h ; plafonnée à 2 h
//   (DUREE_PLAFOND) à l'enregistrement.
// - debut : calculé ici (maintenant − durée), avec l'horloge du serveur.
// - erreur : première erreur JavaScript du jeu pendant la partie (500 caractères au plus).
// - Statistiques de jeu (facultatives : un ancien lanceur gardé en cache ne
//   les envoie pas, sa ligne est alors ignorée par les statistiques) :
//   visitor_id (identifiant anonyme tiré au hasard par l'appareil), started_at
//   (lancement, horloge de l'appareil), game_completed (victoire signalée par
//   le jeu, FMG.reportEnd), max_level (plus haut niveau ou score signalé),
//   is_replay (même jeu lancé moins de 30 min plus tôt sur l'appareil).
// - pays : request.cf.country (« XX » si inconnu) ;
//   appareil : « mobile » ou « desktop », d'après le User-Agent ;
//   visiteur : empreinte SHA-256 de l'adresse IP + IP_SALT, jamais l'adresse
//   elle-même ; en IPv6, du réseau /56 (BITS_V6 : une box en reçoit souvent un
//   entier, voir partieReseau dans functions/_commun.js).
// - Table « sessions » de la base D1 (voir lireFormatSessions dans functions/_commun.js).
//
// Provenance : seul le lanceur du site envoie des parties, en JSON. Un envoi
// venu d'une autre page (un autre site qui ferait envoyer de fausses parties
// par les navigateurs de ses visiteurs) est refusé (403). Un programme peut
// imiter ces en-têtes : c'est alors le calcul des Tendances (joueurs
// différents, functions/api/tendances.js) qui limite son poids à une voix par
// adresse ou par réseau. Sur les aperçus de Cloudflare
// (<branche>.<projet>.pages.dev), rien n'est enregistré.
//
// Réponse : 204 sans contenu (sendBeacon ne lit pas la réponse), 400 si les
// données sont invalides, 403 si l'envoi vient d'un autre site, 503 si la base
// ne répond pas.
//
// Conservation : les parties de plus de 60 jours sont effacées chaque jour par
// /api/stats-jour (tâche planifiée), et ici de temps en temps (1 enregistrement
// sur PURGE_FREQUENCE, après la réponse) si la tâche ne passe pas.
// ==========================================================================

import { json, empreinteVisiteur, jeuExiste, lireFormatSessions, valeurDebut } from '../_commun.js';
import { effacerSessionsAnciennes } from '../_stats.js';

const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DUREE_MIN = 2;            // secondes (le lanceur n'envoie pas les parties plus courtes)
const DUREE_MAX = 3 * 3600;     // 3 heures : au-delà, refusée
const DUREE_PLAFOND = 2 * 3600; // durée enregistrée au plus (2 heures)
const NIVEAU_MAX = 1e9;
const ERREUR_MAX = 500;         // caractères
const TAILLE_MAX = 4096;        // octets du corps
const PURGE_FREQUENCE = 100;
const PURGE_MAX = 1000;         // lignes effacées au plus par passage
const BITS_V6 = 56;             // préfixe IPv6 de l'empreinte (les votes gardent /64)

/** Efface des parties de plus de 60 jours (PURGE_MAX au plus, voir functions/_stats.js). */
async function effacerAnciennes(env) {
  try {
    await effacerSessionsAnciennes(env, Date.now(), PURGE_MAX);
  } catch (e) {
    console.error('Effacement des anciennes sessions impossible :', e);
  }
}

const SANS_CONTENU = { status: 204, headers: { 'Cache-Control': 'no-store' } };

// Statistiques de jeu envoyées par le lanceur ; null si absentes (ancien lanceur), false si invalides.
function lireStats(corps) {
  const { visitorId, startedAt, completed, level, replay } = corps;
  if (visitorId === undefined) return null;
  if (typeof visitorId !== 'string' || !UUID.test(visitorId)) return false;
  if (!Number.isSafeInteger(startedAt) || startedAt <= 0) return false;
  if (level != null && (typeof level !== 'number' || !Number.isFinite(level))) return false;
  return {
    visitor_id: visitorId,
    started_at: startedAt,
    game_completed: completed === true ? 1 : 0,
    max_level: level == null ? null : Math.max(0, Math.min(NIVEAU_MAX, Math.round(level))),
    is_replay: replay === true ? 1 : 0,
  };
}

export async function onRequestPost({ request, env, waitUntil }) {
  const adresse = new URL(request.url);
  const origine = request.headers.get('Origin');
  if (origine && origine !== adresse.origin) {
    return json({ erreur: 'Origine refusée.' }, 403);
  }
  const provenance = request.headers.get('Sec-Fetch-Site');
  if (provenance && provenance !== 'same-origin') {
    return json({ erreur: 'Origine refusée.' }, 403);
  }
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    return json({ erreur: 'Requête invalide.' }, 400);
  }
  // Aperçu d'une branche ou d'un déploiement (<branche>.<projet>.pages.dev) : rien n'est enregistré.
  if (/^[^.]+\.[^.]+\.pages\.dev$/.test(adresse.hostname)) return new Response(null, SANS_CONTENU);

  let corps;
  try {
    // Le lanceur envoie un Blob JSON (suivi.js) : on lit le texte, puis le JSON.
    const texte = await request.text();
    if (texte.length > TAILLE_MAX) throw new Error('trop long');
    corps = JSON.parse(texte);
  } catch {
    return json({ erreur: 'Requête invalide.' }, 400);
  }

  const { jeuId, duree, erreur } = corps || {};
  if (typeof jeuId !== 'string' || jeuId.length > 80 || !ID_VALIDE.test(jeuId)) {
    return json({ erreur: 'Jeu invalide.' }, 400);
  }
  if (!Number.isInteger(duree) || duree < DUREE_MIN || duree > DUREE_MAX) {
    return json({ erreur: 'Durée invalide.' }, 400);
  }
  if (erreur != null && typeof erreur !== 'string') {
    return json({ erreur: 'Erreur JavaScript invalide.' }, 400);
  }
  const stats = lireStats(corps);
  if (stats === false) {
    return json({ erreur: 'Statistiques invalides.' }, 400);
  }
  if (!env.DB) {
    console.error('La base DB n\'est pas configurée.');
    return json({ erreur: 'Suivi indisponible pour le moment.' }, 503);
  }
  if (!(await jeuExiste(env, request, jeuId))) {
    return json({ erreur: 'Jeu inconnu.' }, 400);
  }

  const paysBrut = String(request.cf?.country || '').toUpperCase();
  const pays = /^[A-Z][A-Z0-9]$/.test(paysBrut) ? paysBrut : 'XX'; // XX = inconnu
  const agent = request.headers.get('User-Agent') || '';
  const appareil = /Mobi|Android|iPhone|iPad|iPod/i.test(agent) ? 'mobile' : 'desktop';
  const visiteur = await empreinteVisiteur(request, env, BITS_V6);
  const dureeGardee = Math.min(duree, DUREE_PLAFOND);

  try {
    const format = await lireFormatSessions(env);
    const valeurs = {
      jeu_id: jeuId,
      debut: valeurDebut(format, Date.now() - dureeGardee * 1000),
      duree_secondes: dureeGardee,
      pays,
      appareil,
      erreur_js: erreur ? erreur.slice(0, ERREUR_MAX) : null,
      visiteur,
      ...(format.stats && stats ? stats : {}),
    };
    if (format.idAFournir) valeurs.id = crypto.randomUUID();
    const colonnes = Object.keys(valeurs);
    await env.DB.prepare(
      `INSERT INTO sessions (${colonnes.join(', ')}) VALUES (${colonnes.map(() => '?').join(', ')})`
    ).bind(...Object.values(valeurs)).run();
    if (Math.random() < 1 / PURGE_FREQUENCE) {
      const purge = effacerAnciennes(env);
      if (typeof waitUntil === 'function') waitUntil(purge); else await purge;
    }
  } catch (e) {
    console.error('Écriture de la session impossible :', e);
    return json({ erreur: 'Session non enregistrée.' }, 503);
  }

  return new Response(null, SANS_CONTENU);
}
