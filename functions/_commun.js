// ==========================================================================
// Outils communs aux fonctions de l'API (vote, session, tendances, idees).
// Ce fichier n'exporte aucun onRequest… : il ne crée aucune adresse.
// ==========================================================================

export function json(donnees, statut = 200, entetes = {}) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...entetes },
  });
}

// --- Visiteur ----------------------------------------------------------------
// Empreinte SHA-256 de l'adresse IP + IP_SALT (secret Cloudflare) : permet de
// compter des visiteurs différents sans jamais enregistrer l'adresse elle-même.
// null si l'adresse ou le secret manquent (test en local, réglage absent).
// En IPv6, seul le début de l'adresse compte (voir partieReseau) : /64 pour
// les votes, /56 pour les parties (functions/api/session.js).

// Partie de l'adresse qui identifie un visiteur : l'adresse IPv4 entière, ou
// les bitsV6 premiers bits d'une adresse IPv6 (48 à 64). Un appareil change à
// volonté la fin de son adresse IPv6 (les 64 derniers bits), et une box reçoit
// souvent tout un /56 (256 réseaux /64, chez Orange par exemple) : sans ce
// regroupement, un seul foyer fabriquerait autant de « visiteurs » qu'il veut.
// Cela rend la triche coûteuse, pas impossible : quelqu'un qui dispose de
// nombreux réseaux (tunnel gratuit en /48, hébergeur, téléphone reconnecté)
// compte encore pour plusieurs. Contrepartie : un /56 peut réunir quelques
// foyers voisins d'un même opérateur.
// « ::ffff:192.0.2.1 » (IPv4 écrite en IPv6) est traitée comme « 192.0.2.1 ».
export function partieReseau(ip, bitsV6 = 64) {
  const adresse = String(ip).trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const ipv4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(adresse);
  if (ipv4) return ipv4[1];
  if (!adresse.includes(':')) return adresse;
  // « :: » remplace un ou plusieurs groupes nuls ; une IPv4 en fin d'adresse vaut 2 groupes.
  const [debut, fin] = adresse.split('::');
  const groupes = (texte) => (texte ? texte.split(':') : []);
  const taille = (liste) => liste.reduce((n, g) => n + (g.includes('.') ? 2 : 1), 0);
  const avant = groupes(debut);
  const apres = fin === undefined ? [] : groupes(fin);
  const complets = fin === undefined ? avant : [...avant, ...Array(Math.max(0, 8 - taille(avant) - taille(apres))).fill('0'), ...apres];
  // Groupes de 16 bits gardés entiers, puis le groupe coupé (masque des bits gardés).
  const nombres = complets.slice(0, 4).map((g) => parseInt(g, 16) || 0);
  const entiers = Math.floor(bitsV6 / 16);
  const reste = bitsV6 % 16;
  const gardes = nombres.slice(0, entiers);
  if (reste) gardes.push(nombres[entiers] & (0xffff << (16 - reste)) & 0xffff);
  return `${gardes.map((n) => n.toString(16)).join(':')}::/${bitsV6}`;
}

export async function empreinteVisiteur(request, env, bitsV6 = 64) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !env.IP_SALT) return null;
  const octets = new TextEncoder().encode(partieReseau(ip, bitsV6) + env.IP_SALT);
  const empreinte = await crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(empreinte)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

// --- Jeux publiés ------------------------------------------------------------
// Liste des jeux du catalogue, relue au plus toutes les 5 minutes par instance.

let jeuxConnus = null;   // Map id → titre (français)
let jeuxConnusLe = 0;

// Map des jeux publiés, ou null si le catalogue est illisible.
async function lireJeux(env, request) {
  if (!jeuxConnus || Date.now() - jeuxConnusLe > 300000) {
    try {
      const reponse = await env.ASSETS.fetch(new URL('/catalog.json', request.url));
      const catalogue = await reponse.json();
      jeuxConnus = new Map((catalogue.games || []).map((j) => [j.id, j.title]));
      jeuxConnusLe = Date.now();
    } catch (erreur) {
      console.error('Catalogue illisible :', erreur);
      return null;
    }
  }
  return jeuxConnus;
}

export async function jeuExiste(env, request, gameId) {
  const jeux = await lireJeux(env, request);
  // Catalogue illisible : on ne bloque pas, le format de l'id suffit.
  return jeux ? jeux.has(gameId) : true;
}

// Titre français d'un jeu publié ; null s'il est inconnu ou si le catalogue est illisible.
export async function titreJeu(env, request, gameId) {
  const jeux = await lireJeux(env, request);
  return jeux?.get(gameId) ?? null;
}

// --- Issue GitHub ----------------------------------------------------------------
// Crée une issue dans GITHUB_REPO avec GITHUB_TOKEN (secret Cloudflare, jamais
// renvoyé au navigateur). Renvoie son numéro, ou null en cas d'échec.

export async function creerIssueGitHub(env, { title, body, labels }) {
  const reponse = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'jeux-en-ligne-idees',
    },
    body: JSON.stringify({ title, body, labels }),
  });
  if (!reponse.ok) {
    console.error(`Création de l'issue impossible : HTTP ${reponse.status}`, (await reponse.text()).slice(0, 500));
    return null;
  }
  return (await reponse.json()).number;
}

// --- Table « sessions » --------------------------------------------------------
// Créée à la main dans D1 (id, jeu_id, debut, duree_secondes, pays, appareil,
// erreur_js, visiteur), sans fichier de migration dans le dépôt. Pour ne pas
// dépendre de ses types exacts, on les lit une fois par instance :
//   - id : laissé à la base si c'est un INTEGER PRIMARY KEY (ou s'il a une
//     valeur par défaut), sinon un UUID est fourni ;
//   - debut : en millisecondes (comme votes.created_at) si la colonne est
//     numérique, sinon en date ISO (« 2026-10-22T08:00:00.000Z »).

let formatSessions = null;

export function lireFormatSessions(env) {
  if (!formatSessions) {
    formatSessions = env.DB.prepare('PRAGMA table_info(sessions)').all().then(({ results }) => {
      const colonne = (nom) => (results || []).find((c) => c.name === nom) || {};
      const id = colonne('id');
      return {
        idAFournir: !!id.name && !(/INT/i.test(id.type || '') && id.pk) && id.dflt_value == null,
        debutNombre: /INT|REAL|NUM/i.test(colonne('debut').type || ''),
      };
    }).catch((erreur) => {
      formatSessions = null; // nouvel essai à la prochaine requête
      throw erreur;
    });
  }
  return formatSessions;
}

// Date de début telle qu'elle est rangée dans la table.
export function valeurDebut(format, ms) {
  return format.debutNombre ? ms : new Date(ms).toISOString();
}
