// ==========================================================================
// POST /api/idees — idée de jeu envoyée depuis la page privée /idees
//
// Corps : { "titre": "...", "genre": "...", "description": "..." }
//
// - Réservé aux personnes connectées par Cloudflare Access : le jeton
//   Cf-Access-Jwt-Assertion est vérifié (signature RS256 avec les clés de
//   https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs, audience ACCESS_AUD,
//   émetteur, dates). Jeton absent ou invalide : 403.
// - Champs : titre de 3 à 100 caractères, description de 2 000 au plus,
//   genre dans la liste fermée (scripts/genres.mjs).
// - Crée une issue « Idée : <titre> » dans GITHUB_REPO (étiquettes
//   « idee-perso » et le genre). La boucle de nuit (boucle-de-nuit.yml,
//   étape b) la transforme en idée prioritaire, puis la ferme avec le lien
//   de la pull request du jeu. Le corps de l'issue suit le format qu'elle lit
//   (rubriques « ### Genre », « ### Description », « ### Auteur »).
// - GITHUB_TOKEN (secret) ne sert qu'ici : il n'est jamais renvoyé au navigateur.
//
// Réponse : { "ok": true, "numero": n } ou { "erreur": "..." }
// ==========================================================================

import { json } from '../_commun.js';
import { GENRES } from '../../scripts/genres.mjs';

const ETIQUETTE = 'idee-perso';
const CLES_DUREE = 3600000; // clés publiques d'Access gardées 1 h par instance

// --- Jeton Cloudflare Access -------------------------------------------------

let cles = null;      // Map kid → CryptoKey
let clesLe = 0;
let clesDomaine = '';

const domaineEquipe = (env) => String(env.ACCESS_TEAM_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');

function base64UrlEnOctets(texte) {
  const b64 = texte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(texte.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const base64UrlEnJson = (texte) => JSON.parse(new TextDecoder().decode(base64UrlEnOctets(texte)));

async function chargerCles(domaine, forcer) {
  if (!forcer && cles && clesDomaine === domaine && Date.now() - clesLe < CLES_DUREE) return cles;
  const reponse = await fetch(`https://${domaine}/cdn-cgi/access/certs`);
  if (!reponse.ok) throw new Error(`clés Access : HTTP ${reponse.status}`);
  const { keys } = await reponse.json();
  const nouvelles = new Map();
  for (const jwk of keys || []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    nouvelles.set(jwk.kid, await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  cles = nouvelles;
  clesLe = Date.now();
  clesDomaine = domaine;
  return cles;
}

// Renvoie le contenu du jeton s'il est valide, sinon null.
async function verifierJetonAccess(jeton, env) {
  const domaine = domaineEquipe(env);
  if (!jeton || !domaine || !env.ACCESS_AUD) return null;
  const morceaux = jeton.split('.');
  if (morceaux.length !== 3) return null;
  try {
    const entete = base64UrlEnJson(morceaux[0]);
    const contenu = base64UrlEnJson(morceaux[1]);
    if (entete.alg !== 'RS256' || !entete.kid) return null;

    // Clé inconnue : Access a peut-être changé ses clés, on les relit une fois.
    let cle = (await chargerCles(domaine, false)).get(entete.kid);
    if (!cle) cle = (await chargerCles(domaine, true)).get(entete.kid);
    if (!cle) return null;

    const signe = new TextEncoder().encode(`${morceaux[0]}.${morceaux[1]}`);
    const valide = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cle, base64UrlEnOctets(morceaux[2]), signe);
    if (!valide) return null;

    const maintenant = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(contenu.aud) ? contenu.aud : [contenu.aud];
    if (!audiences.includes(env.ACCESS_AUD)) return null;
    if (contenu.iss !== `https://${domaine}`) return null;
    if (typeof contenu.exp !== 'number' || contenu.exp <= maintenant) return null;
    if (typeof contenu.nbf === 'number' && contenu.nbf > maintenant + 60) return null;
    return contenu;
  } catch (erreur) {
    console.error('Jeton Access illisible ou clés indisponibles :', erreur);
    return null;
  }
}

// --- Issue GitHub --------------------------------------------------------------

function corpsIssue(genre, description, auteur) {
  return [
    '### Genre', '', genre, '',
    '### Description', '', description || '_Aucune description_', '',
    '### Auteur', '', auteur, '',
    '---',
    '_Idée envoyée depuis la page privée /idees. La boucle de nuit la fabrique en priorité, puis ferme cette issue avec le lien de la pull request du jeu._',
  ].join('\n');
}

async function creerIssue(env, titre, genre, description, auteur) {
  const reponse = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'jeux-en-ligne-idees',
    },
    body: JSON.stringify({
      title: `Idée : ${titre}`,
      body: corpsIssue(genre, description, auteur),
      labels: [ETIQUETTE, genre],
    }),
  });
  if (!reponse.ok) {
    console.error(`Création de l'issue impossible : HTTP ${reponse.status}`, (await reponse.text()).slice(0, 500));
    return null;
  }
  return (await reponse.json()).number;
}

// --- Point d'entrée --------------------------------------------------------------

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json({ erreur: 'Méthode non autorisée.' }, 405, { Allow: 'POST' });
  }

  // Envoi venu d'un autre site (formulaire caché…) : refusé, en plus du jeton Access.
  const origine = request.headers.get('Origin');
  if (origine && origine !== new URL(request.url).origin) {
    return json({ erreur: 'Origine refusée.' }, 403);
  }
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    return json({ erreur: 'Requête invalide.' }, 400);
  }

  const acces = await verifierJetonAccess(request.headers.get('Cf-Access-Jwt-Assertion'), env);
  if (!acces) {
    return json({ erreur: 'Accès refusé : connexion Cloudflare Access absente ou expirée. Recharge la page.' }, 403);
  }

  let corps;
  try {
    corps = await request.json();
  } catch {
    return json({ erreur: 'Requête invalide.' }, 400);
  }
  const titre = typeof corps?.titre === 'string' ? corps.titre.replace(/\s+/g, ' ').trim() : '';
  const genre = typeof corps?.genre === 'string' ? corps.genre.trim().normalize('NFC') : '';
  const description = typeof corps?.description === 'string' ? corps.description.replace(/\r\n?/g, '\n').trim() : '';

  if (titre.length < 3 || titre.length > 100) {
    return json({ erreur: 'Le titre doit faire entre 3 et 100 caractères.' }, 400);
  }
  if (description.length > 2000) {
    return json({ erreur: 'La description ne doit pas dépasser 2 000 caractères.' }, 400);
  }
  if (!GENRES.includes(genre)) {
    return json({ erreur: 'Genre inconnu.' }, 400);
  }

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    console.error('GITHUB_TOKEN ou GITHUB_REPO ne sont pas configurés.');
    return json({ erreur: 'Envoi des idées indisponible pour le moment.' }, 503);
  }

  const auteur = acces.email || acces.common_name || 'inconnu';
  const numero = await creerIssue(env, titre, genre, description, auteur);
  if (!numero) {
    return json({ erreur: "L'idée n'a pas pu être enregistrée sur GitHub. Réessaie plus tard." }, 502);
  }
  return json({ ok: true, numero });
}
