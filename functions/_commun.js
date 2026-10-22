// ==========================================================================
// Outils communs aux fonctions de l'API (vote, session, tendances).
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

export async function empreinteVisiteur(request, env) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !env.IP_SALT) return null;
  const octets = new TextEncoder().encode(ip + env.IP_SALT);
  const empreinte = await crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(empreinte)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

// --- Jeux publiés ------------------------------------------------------------
// Liste des jeux du catalogue, relue au plus toutes les 5 minutes par instance.

let jeuxConnus = null;
let jeuxConnusLe = 0;

export async function jeuExiste(env, request, gameId) {
  if (!jeuxConnus || Date.now() - jeuxConnusLe > 300000) {
    try {
      const reponse = await env.ASSETS.fetch(new URL('/catalog.json', request.url));
      const catalogue = await reponse.json();
      jeuxConnus = new Set((catalogue.games || []).map((j) => j.id));
      jeuxConnusLe = Date.now();
    } catch (erreur) {
      // Catalogue illisible : on ne bloque pas, le format de l'id suffit.
      console.error('Catalogue illisible :', erreur);
      return true;
    }
  }
  return jeuxConnus.has(gameId);
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
