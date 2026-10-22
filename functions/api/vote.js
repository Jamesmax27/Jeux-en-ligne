// ==========================================================================
// POST /api/vote — enregistre, remplace ou annule le vote d'un appareil
//
// Corps : { "gameId": "...", "value": 1 | -1 | 0, "voterId": "...", "turnstileToken": "..." }
//   1 = pouce en l'air, -1 = pouce en bas, 0 = annulation du vote.
//
// - Chaque vote est vérifié par Cloudflare Turnstile (secret : TURNSTILE_SECRET).
// - Le votant est un identifiant aléatoire créé par le navigateur ; la base
//   n'en garde qu'une empreinte (hash SHA-256) : aucun compte, aucune donnée
//   personnelle, pas d'adresse IP enregistrée.
// - Le pays vient de l'en-tête CF-IPCountry ajouté par Cloudflare.
// - Un seul vote par jeu et par votant (clé primaire game_id + voter).
// - Colonne « visiteur » : empreinte SHA-256 de l'adresse IP + IP_SALT
//   (voir functions/_commun.js), jamais l'adresse elle-même. Elle ne sert
//   pas à compter les votes.
//
// Réponse : { "ok": true, "gameId": "...", "value": v, "up": n, "down": n, "score": x }
// ==========================================================================

import { ligneScore } from './scores.js';
import { empreinteVisiteur, jeuExiste } from '../_commun.js';

const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VOTANT_VALIDE = /^[A-Za-z0-9-]{16,64}$/;
const URL_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function json(donnees, statut = 200) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Empreinte anonyme de l'identifiant du navigateur.
async function hacher(texte) {
  const octets = new TextEncoder().encode(`jeux-en-ligne/votant/${texte}`);
  const empreinte = await crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(empreinte)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

async function verifierTurnstile(secret, jeton, ip) {
  const formulaire = new FormData();
  formulaire.append('secret', secret);
  formulaire.append('response', jeton);
  if (ip) formulaire.append('remoteip', ip);
  try {
    const reponse = await fetch(URL_TURNSTILE, { method: 'POST', body: formulaire });
    const resultat = await reponse.json();
    return resultat.success === true && (!resultat.action || resultat.action === 'vote');
  } catch (erreur) {
    console.error('Vérification Turnstile impossible :', erreur);
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  let corps;
  try {
    corps = await request.json();
  } catch {
    return json({ erreur: 'Requête invalide.' }, 400);
  }

  const { gameId, value, voterId, turnstileToken } = corps || {};
  if (typeof gameId !== 'string' || gameId.length > 80 || !ID_VALIDE.test(gameId)) {
    return json({ erreur: 'Jeu invalide.' }, 400);
  }
  if (![1, -1, 0].includes(value)) {
    return json({ erreur: 'Vote invalide.' }, 400);
  }
  if (typeof voterId !== 'string' || !VOTANT_VALIDE.test(voterId)) {
    return json({ erreur: 'Identifiant de votant invalide.' }, 400);
  }
  if (typeof turnstileToken !== 'string' || !turnstileToken || turnstileToken.length > 2048) {
    return json({ erreur: 'Vérification anti-robot manquante.' }, 403);
  }
  if (!env.TURNSTILE_SECRET || !env.DB) {
    console.error('TURNSTILE_SECRET ou la base DB ne sont pas configurés.');
    return json({ erreur: 'Votes indisponibles pour le moment.' }, 503);
  }

  if (!(await jeuExiste(env, request, gameId))) {
    return json({ erreur: 'Jeu inconnu.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP');
  if (!(await verifierTurnstile(env.TURNSTILE_SECRET, turnstileToken, ip))) {
    return json({ erreur: 'Vérification anti-robot échouée.' }, 403);
  }

  const votant = await hacher(voterId);
  const visiteur = await empreinteVisiteur(request, env);
  const paysBrut = (request.headers.get('CF-IPCountry') || '').toUpperCase();
  const pays = /^[A-Z][A-Z0-9]$/.test(paysBrut) ? paysBrut : 'XX'; // XX = inconnu

  try {
    if (value === 0) {
      await env.DB.prepare('DELETE FROM votes WHERE game_id = ? AND voter = ?')
        .bind(gameId, votant).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO votes (game_id, voter, value, country, created_at, visiteur)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (game_id, voter) DO UPDATE SET
           value = excluded.value,
           country = excluded.country,
           created_at = excluded.created_at,
           visiteur = excluded.visiteur`
      ).bind(gameId, votant, value, pays, Date.now(), visiteur).run();
    }

    const totaux = await env.DB.prepare(
      'SELECT SUM(value = 1) AS up, SUM(value = -1) AS down FROM votes WHERE game_id = ?'
    ).bind(gameId).first();

    return json({ ok: true, gameId, value, ...ligneScore(totaux?.up, totaux?.down) });
  } catch (erreur) {
    console.error('Écriture du vote impossible :', erreur);
    return json({ erreur: 'Vote non enregistré, réessaie plus tard.' }, 503);
  }
}
