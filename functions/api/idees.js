// ==========================================================================
// POST /api/idees — idée de jeu ou demande de modification d'un jeu,
// envoyée depuis la page privée /idees
//
// Corps : { "titre": "...", "genre": "...", "ages": "6+", "univers": ["ferme", ...],
//           "description": "..." }
//
// - Réservé aux personnes connectées par Cloudflare Access : le jeton
//   Cf-Access-Jwt-Assertion est vérifié (signature RS256 avec les clés de
//   https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs, audience ACCESS_AUD,
//   émetteur, dates). Jeton absent ou invalide : 403.
// - Champs : titre de 3 à 100 caractères, description de 2 000 au plus,
//   genre : identifiant de la liste fermée (public/taxonomie.js) ;
//   ages (obligatoire) : âge minimum conseillé « N+ », de « 4+ » à « 12+ » ;
//   univers (facultatif) : 0 à 2 identifiants de la liste fermée, sans
//   doublon, « autre » seul. Les textes pour les moteurs de recherche ne sont
//   pas demandés : l'agent créateur les rédige d'après le jeu fini.
// - Crée une issue « Idée : <titre> » dans GITHUB_REPO (étiquettes
//   « idee-perso » et le genre). La boucle de nuit (boucle-de-nuit.yml,
//   étape b) la transforme en idée prioritaire, puis la ferme avec le lien
//   de la pull request du jeu. Le corps de l'issue suit le format qu'elle lit
//   (rubriques « ### Genre », « ### Âge », « ### Univers », « ### Description »,
//   « ### Auteur », dans cet ordre ; univers : identifiants séparés par
//   « , », ou « _Aucun univers_ » ; l'âge et les univers passent ensuite par
//   scripts/idees.mjs importer-perso).
// - GITHUB_TOKEN (secret) ne sert qu'ici : il n'est jamais renvoyé au navigateur.
//
// Demande de modification d'un jeu (même page, même accès) :
//   corps { "type": "demande", "jeu": "<id du jeu>", "texte": "..." }
// - jeu : identifiant d'un jeu publié (public/catalog.json) ; texte de 10 à
//   2 000 caractères. Pas de type à choisir : l'IA classe la demande.
// - Crée une issue « [Demande] <titre du jeu> » (étiquette « demande-ia »),
//   rubriques « ### Jeu », « ### Demande », « ### Auteur », dans cet ordre.
//   Elle est traitée aussitôt par .github/workflows/demande-modification.yml
//   (voir DEMANDES.md).
//
// Réponse : { "ok": true, "numero": n } ou { "erreur": "..." }
// ==========================================================================

import { json, titreJeu, creerIssueGitHub } from '../_commun.js';
import { IDS_GENRES, IDS_UNIVERS, UNIVERS_MAX } from '../../public/taxonomie.js';

const ETIQUETTE = 'idee-perso';
const ETIQUETTE_DEMANDE = 'demande-ia';
const DEMANDE_MIN = 10;     // longueur du texte d'une demande de modification
const DEMANDE_MAX = 2000;
const CLES_DUREE = 3600000; // clés publiques d'Access gardées 1 h par instance
const AGE_MIN = 4;          // âges permis : de « 4+ » à « 12+ » (la page propose ceux du formulaire GitHub)
const AGE_MAX = 12;

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

// « Description » doit rester juste avant « Auteur » : la boucle de nuit lit le texte entre les deux.
function corpsIssue({ genre, ages, univers, description, auteur }) {
  return [
    '### Genre', '', genre, '',
    '### Âge', '', ages, '',
    '### Univers', '', univers.length ? univers.join(', ') : '_Aucun univers_', '',
    '### Description', '', description || '_Aucune description_', '',
    '### Auteur', '', auteur, '',
    '---',
    '_Idée envoyée depuis la page privée /idees. La boucle de nuit la fabrique en priorité, puis ferme cette issue avec le lien de la pull request du jeu._',
  ].join('\n');
}

const creerIssue = (env, titre, idee) =>
  creerIssueGitHub(env, { title: `Idée : ${titre}`, body: corpsIssue(idee), labels: [ETIQUETTE, idee.genre] });

// « Demande » doit rester juste avant « Auteur » : le workflow lit le texte entre les deux.
function corpsDemande({ jeu, texte, auteur }) {
  return [
    '### Jeu', '', jeu, '',
    '### Demande', '', texte, '',
    '### Auteur', '', auteur, '',
    '---',
    "_Demande envoyée depuis la page privée /idees. L'IA la classe et la traite aussitôt (DEMANDES.md) ; le résultat arrive en commentaire._",
  ].join('\n');
}

// Demande de modification d'un jeu publié : issue « [Demande] <titre> », étiquette demande-ia.
async function traiterDemande(env, request, corps, auteur) {
  const jeu = typeof corps?.jeu === 'string' ? corps.jeu.trim() : '';
  const texte = typeof corps?.texte === 'string' ? corps.texte.replace(/\r\n?/g, '\n').trim() : '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(jeu)) {
    return json({ erreur: 'Choisis un jeu.' }, 400);
  }
  if (texte.length < DEMANDE_MIN || texte.length > DEMANDE_MAX) {
    return json({ erreur: `La demande doit faire entre ${DEMANDE_MIN} et 2 000 caractères.` }, 400);
  }
  const titre = await titreJeu(env, request, jeu);
  if (!titre) {
    return json({ erreur: 'Jeu inconnu : recharge la page.' }, 400);
  }
  const numero = await creerIssueGitHub(env, {
    title: `[Demande] ${titre}`,
    body: corpsDemande({ jeu, texte, auteur }),
    labels: [ETIQUETTE_DEMANDE],
  });
  if (!numero) {
    return json({ erreur: "La demande n'a pas pu être enregistrée sur GitHub. Réessaie plus tard." }, 502);
  }
  return json({ ok: true, numero });
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

  if (corps?.type === 'demande') {
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
      console.error('GITHUB_TOKEN ou GITHUB_REPO ne sont pas configurés.');
      return json({ erreur: 'Envoi des demandes indisponible pour le moment.' }, 503);
    }
    return traiterDemande(env, request, corps, acces.email || acces.common_name || 'inconnu');
  }

  const titre = typeof corps?.titre === 'string' ? corps.titre.replace(/\s+/g, ' ').trim() : '';
  const genre = typeof corps?.genre === 'string' ? corps.genre.trim() : '';
  const description = typeof corps?.description === 'string' ? corps.description.replace(/\r\n?/g, '\n').trim() : '';
  const ages = typeof corps?.ages === 'string' ? corps.ages.replace(/\s+/g, '') : '';
  const univers = corps?.univers ?? [];

  if (titre.length < 3 || titre.length > 100) {
    return json({ erreur: 'Le titre doit faire entre 3 et 100 caractères.' }, 400);
  }
  if (description.length > 2000) {
    return json({ erreur: 'La description ne doit pas dépasser 2 000 caractères.' }, 400);
  }
  if (!IDS_GENRES.includes(genre)) {
    return json({ erreur: 'Genre inconnu.' }, 400);
  }
  // Âge : « N+ », de AGE_MIN à AGE_MAX (même format que "ages" des idées et de game.json).
  const age = /^\d{1,2}\+$/.test(ages) ? parseInt(ages, 10) : NaN;
  if (!(age >= AGE_MIN && age <= AGE_MAX)) {
    return json({ erreur: `Choisis un âge conseillé, de ${AGE_MIN}+ à ${AGE_MAX}+.` }, 400);
  }
  // Univers : identifiants de la liste fermée (public/taxonomie.js), mêmes règles que scripts/controle-taxonomie.mjs.
  if (!Array.isArray(univers) || univers.some((u) => !IDS_UNIVERS.includes(u))) {
    return json({ erreur: 'Univers inconnu.' }, 400);
  }
  if (new Set(univers).size !== univers.length || univers.length > UNIVERS_MAX) {
    return json({ erreur: `${UNIVERS_MAX} univers au plus, sans doublon.` }, 400);
  }
  if (univers.includes('autre') && univers.length > 1) {
    return json({ erreur: "L'univers « Autre » ne se combine pas avec un autre univers." }, 400);
  }

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    console.error('GITHUB_TOKEN ou GITHUB_REPO ne sont pas configurés.');
    return json({ erreur: 'Envoi des idées indisponible pour le moment.' }, 503);
  }

  const auteur = acces.email || acces.common_name || 'inconnu';
  const numero = await creerIssue(env, titre, { genre, ages: `${age}+`, univers, description, auteur });
  if (!numero) {
    return json({ erreur: "L'idée n'a pas pu être enregistrée sur GitHub. Réessaie plus tard." }, 502);
  }
  return json({ ok: true, numero });
}
