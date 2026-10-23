// ==========================================================================
// POST /api/idees — page privée /idees : idée de jeu, demande de modification
// d'un jeu, et décisions sur les demandes du formulaire public
//
// Corps : { "titre": "...", "genre": "...", "ages": "6+", "univers": ["ferme", ...],
//           "description": "..." }
//
// - Réservé aux personnes connectées par Cloudflare Access : le jeton
//   Cf-Access-Jwt-Assertion est vérifié (verifierJetonAccess, functions/_commun.js :
//   signature RS256 avec les clés de https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs,
//   audience ACCESS_AUD, émetteur, dates). Jeton absent ou invalide : 403.
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
//   (corpsIdee, functions/_demandes.js : rubriques « ### Genre », « ### Âge »,
//   « ### Univers », « ### Description », « ### Auteur », dans cet ordre ;
//   l'âge et les univers passent ensuite par scripts/idees.mjs importer-perso).
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
// Demandes du formulaire public (onglet « Demandes publiques », même accès ;
// circuit complet : functions/_demandes.js et DEMANDES.md) :
//   { "type": "publiques" }  → { ok, demandes: [...], enModeration: n }
//       demandes validées par l'IA (étiquette valide-ia), en attente d'une décision ;
//   { "type": "publique-accepter", "numero": n, "genre", "ages", "univers" }
//       (genre, âge et univers : nouveau jeu seulement) ;
//   { "type": "publique-refuser", "numero": n, "bannir": true | false } ;
//   { "type": "blocages" }   → { ok, blocages: [...] } empreintes bloquées ou bannies ;
//   { "type": "blocage", "visiteur": "<empreinte>", "action": "debloquer" | "bannir" }.
//
// Réponse : { "ok": true, "numero": n } ou { "erreur": "..." }
// ==========================================================================

import { json, titreJeu, creerIssueGitHub, verifierJetonAccess } from '../_commun.js';
import {
  corpsIdee, problemeClassement, listerPubliques, accepterPublique, refuserPublique,
  preparerTables, listerBlocages, debloquer, bannir,
} from '../_demandes.js';

const ETIQUETTE = 'idee-perso';
const ETIQUETTE_DEMANDE = 'demande-ia';
const DEMANDE_MIN = 10;     // longueur du texte d'une demande de modification
const DEMANDE_MAX = 2000;

// --- Issue GitHub --------------------------------------------------------------

const creerIssue = (env, titre, idee) =>
  creerIssueGitHub(env, { title: `Idée : ${titre}`, body: corpsIdee(idee), labels: [ETIQUETTE, idee.genre] });

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

// --- Demandes du formulaire public --------------------------------------------------

const EMPREINTE = /^[0-9a-f]{64}$/;

async function traiterPublique(env, request, corps, auteur) {
  const resultat = (r) => (r.erreur ? json({ erreur: r.erreur }, r.statut || 400) : json(r));
  switch (corps.type) {
    case 'publiques': {
      const liste = await listerPubliques(env, (id) => titreJeu(env, request, id));
      if (!liste) return json({ erreur: 'Liste des demandes indisponible (GitHub ne répond pas). Réessaie plus tard.' }, 502);
      return json({ ok: true, ...liste });
    }
    case 'publique-accepter': {
      const univers = corps.univers ?? [];
      const classement = { genre: typeof corps.genre === 'string' ? corps.genre.trim() : '', ages: typeof corps.ages === 'string' ? corps.ages.replace(/\s+/g, '') : '', univers };
      return resultat(await accepterPublique(env, { numero: Number(corps.numero), classement, auteur }));
    }
    case 'publique-refuser': {
      if (corps.bannir === true && !env.DB) return json({ erreur: 'Base DB non configurée : bannissement impossible.' }, 503);
      if (corps.bannir === true) await preparerTables(env);
      return resultat(await refuserPublique(env, { numero: Number(corps.numero), bannir: corps.bannir === true, auteur }));
    }
    case 'blocages': {
      if (!env.DB) return json({ erreur: 'Base DB non configurée.' }, 503);
      await preparerTables(env);
      return json({ ok: true, blocages: await listerBlocages(env) });
    }
    case 'blocage': {
      if (!env.DB) return json({ erreur: 'Base DB non configurée.' }, 503);
      const visiteur = typeof corps.visiteur === 'string' ? corps.visiteur : '';
      if (!EMPREINTE.test(visiteur)) return json({ erreur: 'Empreinte invalide.' }, 400);
      await preparerTables(env);
      if (corps.action === 'debloquer') await debloquer(env, visiteur);
      else if (corps.action === 'bannir') await bannir(env, visiteur, `banni à la main par ${auteur}`);
      else return json({ erreur: 'Action inconnue.' }, 400);
      return json({ ok: true });
    }
    default:
      return null;
  }
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
  const auteur = acces.email || acces.common_name || 'inconnu';

  let corps;
  try {
    corps = await request.json();
  } catch {
    return json({ erreur: 'Requête invalide.' }, 400);
  }

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    console.error('GITHUB_TOKEN ou GITHUB_REPO ne sont pas configurés.');
    return json({ erreur: 'Envoi indisponible pour le moment (GitHub non configuré).' }, 503);
  }

  if (corps?.type === 'demande') {
    return traiterDemande(env, request, corps, auteur);
  }
  if (typeof corps?.type === 'string') {
    try {
      const reponse = await traiterPublique(env, request, corps, auteur);
      if (reponse) return reponse;
    } catch (erreur) {
      console.error('Action sur les demandes publiques impossible :', erreur);
      return json({ erreur: 'Action impossible pour le moment. Réessaie plus tard.' }, 503);
    }
    return json({ erreur: 'Type de requête inconnu.' }, 400);
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
  // Genre, âge (« N+ », de 4+ à 12+) et univers : listes fermées de public/taxonomie.js
  // (mêmes règles que scripts/controle-taxonomie.mjs).
  const probleme = problemeClassement({ genre, ages, univers });
  if (probleme) {
    return json({ erreur: probleme }, 400);
  }

  const numero = await creerIssue(env, titre, { genre, ages: `${parseInt(ages, 10)}+`, univers, description, auteur });
  if (!numero) {
    return json({ erreur: "L'idée n'a pas pu être enregistrée sur GitHub. Réessaie plus tard." }, 502);
  }
  return json({ ok: true, numero });
}
