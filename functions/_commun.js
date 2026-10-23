// ==========================================================================
// Outils communs aux fonctions de l'API (vote, session, tendances, idees,
// demandes, moderation).
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

// --- Turnstile (anti-robot) ----------------------------------------------------
// Vérifie un jeton Cloudflare Turnstile (secret TURNSTILE_SECRET) pour l'action
// attendue (« vote », « demande »). Faux si le jeton est refusé ou si la
// vérification est impossible.

const URL_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifierTurnstile(secret, jeton, ip, action) {
  const formulaire = new FormData();
  formulaire.append('secret', secret);
  formulaire.append('response', jeton);
  if (ip) formulaire.append('remoteip', ip);
  try {
    const reponse = await fetch(URL_TURNSTILE, { method: 'POST', body: formulaire });
    const resultat = await reponse.json();
    return resultat.success === true && (!resultat.action || resultat.action === action);
  } catch (erreur) {
    console.error('Vérification Turnstile impossible :', erreur);
    return false;
  }
}

// --- GitHub ------------------------------------------------------------------------
// Appels à l'API REST de GitHub sur GITHUB_REPO avec GITHUB_TOKEN (secret
// Cloudflare, jamais renvoyé au navigateur ; droits nécessaires : Issues en
// lecture et écriture sur ce seul dépôt).

/**
 * Appel à https://api.github.com/repos/<GITHUB_REPO><chemin>.
 * Renvoie { ok, statut, donnees } ; ne lève jamais d'erreur (réseau : statut 0).
 */
export async function appelGitHub(env, methode, chemin, corps) {
  try {
    const reponse = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${chemin}`, {
      method: methode,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'jeux-en-ligne-idees',
        ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
    });
    const texte = await reponse.text();
    let donnees = null;
    try { donnees = texte ? JSON.parse(texte) : null; } catch { donnees = texte; }
    if (!reponse.ok) console.error(`GitHub ${methode} ${chemin} : HTTP ${reponse.status}`, String(texte).slice(0, 500));
    return { ok: reponse.ok, statut: reponse.status, donnees };
  } catch (erreur) {
    console.error(`GitHub ${methode} ${chemin} injoignable :`, erreur);
    return { ok: false, statut: 0, donnees: null };
  }
}

// Crée une issue. Renvoie son numéro, ou null en cas d'échec.
export async function creerIssueGitHub(env, { title, body, labels }) {
  const r = await appelGitHub(env, 'POST', '/issues', { title, body, labels });
  if (!r.ok) {
    console.error(`Création de l'issue impossible : HTTP ${r.statut}`);
    return null;
  }
  return r.donnees.number;
}

// --- Jeton Cloudflare Access (pages privées /idees) ----------------------------
// Vérifie le jeton Cf-Access-Jwt-Assertion : signature RS256 avec les clés de
// https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs, audience ACCESS_AUD,
// émetteur, dates. Renvoie son contenu s'il est valide, sinon null.

const CLES_DUREE = 3600000; // clés publiques d'Access gardées 1 h par instance

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

export async function verifierJetonAccess(jeton, env) {
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
