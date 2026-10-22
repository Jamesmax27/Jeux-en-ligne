// ==========================================================================
// POST /api/session — enregistre une partie (temps passé sur un jeu)
//
// Corps : { "jeuId": "...", "duree": secondes, "erreur": "..." | null }
// Envoyé par le lanceur (public/suivi.js, navigator.sendBeacon) quand la page
// du jeu est cachée ou quittée.
//
// - duree : nombre entier de secondes, de 2 s à 3 h ; au-delà, refusée.
// - debut : calculé ici (maintenant − durée), avec l'horloge du serveur.
// - erreur : première erreur JavaScript du jeu pendant la partie (500 caractères au plus).
// - pays : request.cf.country (« XX » si inconnu) ;
//   appareil : « mobile » ou « desktop », d'après le User-Agent ;
//   visiteur : empreinte SHA-256 de l'adresse IP + IP_SALT, jamais l'adresse elle-même.
// - Table « sessions » de la base D1 (voir lireFormatSessions dans functions/_commun.js).
//
// Réponse : 204 sans contenu (sendBeacon ne lit pas la réponse), 400 si les
// données sont invalides, 503 si la base ne répond pas.
// ==========================================================================

import { json, empreinteVisiteur, jeuExiste, lireFormatSessions, valeurDebut } from '../_commun.js';

const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DUREE_MIN = 2;          // secondes (le lanceur n'envoie pas les parties plus courtes)
const DUREE_MAX = 3 * 3600;   // 3 heures
const ERREUR_MAX = 500;       // caractères
const TAILLE_MAX = 4096;      // octets du corps

export async function onRequestPost({ request, env }) {
  let corps;
  try {
    // sendBeacon peut envoyer du texte brut : on lit le texte, puis le JSON.
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
  const visiteur = await empreinteVisiteur(request, env);

  try {
    const format = await lireFormatSessions(env);
    const valeurs = {
      jeu_id: jeuId,
      debut: valeurDebut(format, Date.now() - duree * 1000),
      duree_secondes: duree,
      pays,
      appareil,
      erreur_js: erreur ? erreur.slice(0, ERREUR_MAX) : null,
      visiteur,
    };
    if (format.idAFournir) valeurs.id = crypto.randomUUID();
    const colonnes = Object.keys(valeurs);
    await env.DB.prepare(
      `INSERT INTO sessions (${colonnes.join(', ')}) VALUES (${colonnes.map(() => '?').join(', ')})`
    ).bind(...Object.values(valeurs)).run();
  } catch (e) {
    console.error('Écriture de la session impossible :', e);
    return json({ erreur: 'Session non enregistrée.' }, 503);
  }

  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
