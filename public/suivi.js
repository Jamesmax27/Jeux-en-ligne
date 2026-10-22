// ==========================================================================
// Jeux-en-ligne — suivi des parties (utilisé par le lanceur, play.js)
//
// Mesure le temps passé sur un jeu et note sa première erreur JavaScript,
// puis envoie le tout à /api/session avec navigator.sendBeacon (l'envoi part
// même si la page se ferme). Sert aux « Tendances » de l'accueil.
//
// - Les jeux n'ont aucun accès au réseau (règle CSP_JEU) : c'est le lanceur
//   qui envoie. Dans le jeu, SCRIPT_ERREURS (placé par le lanceur en tête de
//   chaque jeu, avant son propre code) transmet seulement les erreurs, par un
//   message « jel-erreur ». Aucun jeu n'a donc besoin de code de suivi.
// - Une partie commence à l'ouverture du jeu (ou au retour sur la page) et se
//   termine quand la page est cachée ou quittée (visibilitychange, pagehide).
// - Parties de moins de 2 secondes ou de plus de 3 heures : non envoyées.
//   Hors connexion : la partie n'est pas comptée.
// - Rien de personnel : id du jeu, durée, erreur éventuelle. Le serveur ajoute
//   le pays, le type d'appareil et une empreinte anonyme (voir functions/api/session.js).
// ==========================================================================

const ADRESSE = '/api/session';
const DUREE_MIN = 2;          // secondes
const DUREE_MAX = 3 * 3600;   // 3 heures (limite du serveur)
const ERREUR_MAX = 500;       // caractères

// Script ajouté au début de chaque jeu (cadre isolé) : signale au lanceur les
// erreurs JavaScript et les promesses rejetées (3 au plus). addEventListener
// plutôt que window.onerror : un jeu qui remplit window.onerror ne l'efface pas.
export const SCRIPT_ERREURS = `<script>(function () {
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
})();</script>`;

let jeuId = null;   // jeu suivi
let debut = 0;      // début de la partie en cours (ms), 0 = pas de partie en cours
let erreur = null;  // première erreur du jeu depuis le dernier envoi

function terminerPartie() {
  if (!debut) return;
  const duree = Math.round((Date.now() - debut) / 1000);
  debut = 0;
  if (duree < DUREE_MIN || duree > DUREE_MAX || navigator.onLine === false) return;
  const donnees = JSON.stringify({ jeuId, duree, erreur });
  try {
    if (navigator.sendBeacon(ADRESSE, new Blob([donnees], { type: 'application/json' }))) erreur = null;
  } catch {
    // Suivi facultatif : le jeu continue sans lui.
  }
}

function commencerPartie() {
  if (jeuId && !debut && document.visibilityState !== 'hidden') debut = Date.now();
}

// À appeler une fois, quand le jeu est affiché.
export function suivreJeu(id) {
  if (jeuId) return;
  jeuId = id;
  commencerPartie();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') terminerPartie();
    else commencerPartie();
  });
  addEventListener('pagehide', terminerPartie);
  addEventListener('pageshow', (evenement) => { if (evenement.persisted) commencerPartie(); });
}

// Erreur signalée par le jeu (message « jel-erreur ») : seule la première est gardée.
export function noterErreur(message) {
  if (jeuId && !erreur) erreur = String(message).slice(0, ERREUR_MAX);
}
