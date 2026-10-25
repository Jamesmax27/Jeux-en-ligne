// ==========================================================================
// Free Micro Games — suivi des parties (utilisé par le lanceur, play.js)
//
// Mesure le temps passé sur un jeu, note sa première erreur JavaScript et ce
// que le jeu signale de ses fins de partie (FMG.reportEnd), puis envoie le
// tout à /api/session avec navigator.sendBeacon (l'envoi part même si la page
// se ferme). Sert aux « Tendances » de l'accueil et à l'onglet « Stats » de la
// page privée /idees.
//
// - Les jeux n'ont aucun accès au réseau (règle CSP_JEU) : c'est le lanceur
//   qui envoie. Dans le jeu, SCRIPT_SUIVI (placé par le lanceur en tête de
//   chaque jeu, avant son propre code) transmet par message les erreurs
//   (« jel-erreur ») et les fins de partie (« jel-fin », window.FMG.reportEnd).
//   Le seul code de suivi d'un jeu est donc l'appel à FMG.reportEnd.
// - Une session commence à l'ouverture du jeu. Tout est gardé en mémoire et
//   envoyé en un seul appel quand la page est cachée ou quittée
//   (visibilitychange, pagehide). Si le joueur revient moins de 30 min après
//   (écran verrouillé, autre application), c'est la même session : le temps
//   joué depuis est envoyé à son tour, avec le même lancement (startedAt) ;
//   le serveur et les statistiques regroupent ces morceaux. Plus tard, ou plus
//   de 3 h après le lancement, une nouvelle session commence.
// - Durée plafonnée à 2 heures par session ; morceau de moins de 2 secondes :
//   rien n'est envoyé. Hors connexion : rien n'est envoyé.
// - Rien de personnel : id du jeu, durée, erreur éventuelle, fin de partie,
//   niveau atteint, relance (même jeu lancé moins de 30 min plus tôt sur cet
//   appareil) et un identifiant anonyme tiré au hasard, gardé 13 mois au plus
//   sur l'appareil (« fmg-visiteur »), jamais lié aux votes ni à Google
//   Analytics. Visiteur qui a refusé les cookies : identifiant à usage unique
//   (rien n'est gardé sur l'appareil) et pas de relance détectée. Le serveur
//   ajoute le pays, le type d'appareil et une empreinte anonyme de l'adresse
//   (voir functions/api/session.js).
// ==========================================================================

const ADRESSE = '/api/session';
const DUREE_MIN = 2;                       // secondes
const DUREE_MAX = 2 * 3600;                // plafond d'une session : 2 heures
const ERREUR_MAX = 500;                    // caractères
const NIVEAU_MAX = 1e9;                    // niveau ou score retenu au plus
const RELANCE_MS = 30 * 60000;             // relance : même jeu lancé dans les 30 min précédentes
const ABSENCE_MAX_MS = 30 * 60000;         // retour sur la page après moins de 30 min : même session
const SESSION_MAX_MS = 3 * 3600000;        // une session ne se prolonge pas 3 h après son lancement
const CLE_VISITEUR = 'fmg-visiteur';       // { id, cree } : identifiant anonyme de l'appareil
const CLE_LANCEMENTS = 'fmg-lancements';   // { <id du jeu>: date du dernier lancement (ms) }
const VISITEUR_DUREE_MS = 395 * 86400000;  // 13 mois, puis un nouvel identifiant (jamais prolongé)

// Script ajouté au début de chaque jeu (cadre isolé) :
// - signale au lanceur les erreurs JavaScript et les promesses rejetées (3 au
//   plus) ; addEventListener plutôt que window.onerror : un jeu qui remplit
//   window.onerror ne l'efface pas ;
// - fournit window.FMG.reportEnd({ completed, level }), que le jeu appelle à
//   chaque écran de victoire (completed: true) ou de défaite (false), avec le
//   niveau joué (ou le score d'un jeu sans niveaux). Il peut être appelé
//   plusieurs fois : le lanceur garde le plus haut niveau et « terminé » dès
//   qu'une victoire est signalée. Ne lève jamais d'erreur.
export const SCRIPT_SUIVI = `<script>(function () {
  var envoyees = 0;
  function signaler(texte) {
    if (envoyees++ >= 3) return;
    try { parent.postMessage({ type: 'jel-erreur', message: String(texte).slice(0, ${ERREUR_MAX}) }, '*'); } catch (e) {}
  }
  addEventListener('error', function (e) {
    signaler((e.message || 'Erreur') + (e.lineno ? ' (ligne ' + e.lineno + ')' : ''));
  });
  addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    signaler('Promesse rejetée : ' + (r && r.message ? r.message : r));
  });
  var derniere = '';
  window.FMG = window.FMG || {};
  window.FMG.reportEnd = function (r) {
    try {
      r = r || {};
      var n = Number(r.level);
      var fin = { type: 'jel-fin', completed: r.completed === true, level: r.level == null || !isFinite(n) ? null : n };
      var cle = fin.completed + '|' + fin.level;
      if (cle === derniere) return;
      derniere = cle;
      parent.postMessage(fin, '*');
    } catch (e) {}
  };
})();</script>`;

let jeuId = null;     // jeu suivi
let session = null;   // { lancement, relance, envoye, termine, niveau, cacheeLe }
let debut = 0;        // début du morceau visible en cours (ms), 0 = page cachée
let erreur = null;    // première erreur du jeu depuis le dernier envoi
let visiteur = null;  // identifiant anonyme (lu une fois par page)

// --- Identifiant anonyme et relances (localStorage du site) -----------------

const refuse = () => window.FMG_CONSENTEMENT?.choix?.() === 'refuse';

function nouvelId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const o = crypto.getRandomValues(new Uint8Array(16));
  o[6] = (o[6] & 0x0f) | 0x40;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = [...o].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function idVisiteur() {
  if (visiteur) return visiteur;
  try {
    if (refuse()) {
      localStorage.removeItem(CLE_VISITEUR);
    } else {
      const maintenant = Date.now();
      const lu = JSON.parse(localStorage.getItem(CLE_VISITEUR) || 'null');
      if (lu && /^[0-9a-f-]{36}$/.test(lu.id) && lu.cree <= maintenant && maintenant - lu.cree < VISITEUR_DUREE_MS) {
        return (visiteur = lu.id);
      }
      visiteur = nouvelId();
      localStorage.setItem(CLE_VISITEUR, JSON.stringify({ id: visiteur, cree: maintenant }));
      return visiteur;
    }
  } catch {
    // Stockage refusé ou illisible : identifiant à usage unique.
  }
  return (visiteur = visiteur || nouvelId());
}

// Vrai si ce jeu a été lancé sur cet appareil dans les 30 dernières minutes ;
// note ce lancement (seuls les lancements de moins de 30 min sont gardés).
function noterLancement(id, maintenant) {
  try {
    if (refuse()) {
      localStorage.removeItem(CLE_LANCEMENTS);
      return false;
    }
    const lus = JSON.parse(localStorage.getItem(CLE_LANCEMENTS) || '{}') || {};
    const relance = Number.isFinite(lus[id]) && maintenant - lus[id] >= 0 && maintenant - lus[id] < RELANCE_MS;
    const gardes = { [id]: maintenant };
    for (const [autre, date] of Object.entries(lus)) {
      if (autre !== id && Number.isFinite(date) && maintenant - date >= 0 && maintenant - date < RELANCE_MS) gardes[autre] = date;
    }
    localStorage.setItem(CLE_LANCEMENTS, JSON.stringify(gardes));
    return relance;
  } catch {
    return false;
  }
}

// --- Session ------------------------------------------------------------------

function envoyer() {
  if (!debut) return;
  const maintenant = Date.now();
  const duree = Math.min(Math.round((maintenant - debut) / 1000), DUREE_MAX - session.envoye);
  debut = 0;
  session.cacheeLe = maintenant;
  if (duree < DUREE_MIN || navigator.onLine === false) return;
  const donnees = JSON.stringify({
    jeuId,
    duree,
    erreur,
    visitorId: idVisiteur(),
    startedAt: session.lancement,
    completed: session.termine,
    level: session.niveau,
    replay: session.relance,
  });
  try {
    if (navigator.sendBeacon(ADRESSE, new Blob([donnees], { type: 'application/json' }))) {
      session.envoye += duree;
      erreur = null;
    }
  } catch {
    // Suivi facultatif : le jeu continue sans lui.
  }
}

function reprendre() {
  if (!jeuId || debut || document.visibilityState === 'hidden') return;
  const maintenant = Date.now();
  const finie = session && (maintenant - session.cacheeLe > ABSENCE_MAX_MS || maintenant - session.lancement > SESSION_MAX_MS);
  if (!session || finie) {
    session = { lancement: maintenant, relance: noterLancement(jeuId, maintenant), envoye: 0, termine: false, niveau: null, cacheeLe: maintenant };
  }
  debut = maintenant;
}

// À appeler une fois, quand le jeu est affiché. Lanceur affiché dans un cadre
// (un autre site qui le cacherait dans sa page), ou ouvert par une autre page
// qui garde la main sur lui (window.opener ; le site, lui, ouvre toujours le
// lanceur dans le même onglet) : aucune partie n'est comptée.
export function suivreJeu(id) {
  if (jeuId || window.top !== window || window.opener) return;
  jeuId = id;
  reprendre();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') envoyer();
    else reprendre();
  });
  addEventListener('pagehide', envoyer);
  addEventListener('pageshow', (evenement) => { if (evenement.persisted) reprendre(); });
}

// Erreur signalée par le jeu (message « jel-erreur ») : seule la première est gardée.
export function noterErreur(message) {
  if (jeuId && !erreur) erreur = String(message).slice(0, ERREUR_MAX);
}

// Fin de partie signalée par le jeu (message « jel-fin », FMG.reportEnd) :
// « terminé » dès qu'une victoire est signalée, plus haut niveau (ou score) atteint.
export function noterFin({ completed, level } = {}) {
  if (!jeuId || !session) return;
  if (completed === true) session.termine = true;
  if (typeof level === 'number' && Number.isFinite(level)) {
    const niveau = Math.max(0, Math.min(NIVEAU_MAX, Math.round(level)));
    session.niveau = session.niveau === null ? niveau : Math.max(session.niveau, niveau);
  }
}
