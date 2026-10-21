// ==========================================================================
// Jeux-en-ligne — publicité (PRÉPARÉE, DÉSACTIVÉE)
//
// Un seul emplacement, en bas du catalogue (index.html, #pub). Jamais dans le
// lanceur (play.html) ni dans les jeux.
// Tant que PUB_ACTIVE vaut false, rien n'est chargé ni affiché, aucun cookie.
// Pour l'activer : suivre PUBLICITE.md (domaine, compte régie, identifiants).
//
// Déroulé prévu une fois activée :
//   1. bandeau de consentement aux cookies (#consentement) ;
//   2. annonce NON personnalisée, réglée pour un public d'enfants (#pub) ;
//   hors connexion : rien.
// ==========================================================================

const PUB_ACTIVE = false;

// Réglages donnés par la régie (voir PUBLICITE.md). Vides tant qu'il n'y a pas
// de compte : ne jamais y mettre d'identifiants inventés.
const REGIE = {
  script: '',       // adresse du script de la régie
  editeur: '',      // identifiant éditeur (le compte)
  emplacement: '',  // identifiant du bloc d'annonce
};

// 1. Consentement : à brancher sur l'outil de consentement de la régie (Google
//    impose en Europe un outil certifié). Il affiche son bandeau dans `bandeau`,
//    puis appelle suite(accord) : accord = true si le visiteur accepte les cookies.
function demanderConsentement(bandeau, suite) {
  // À compléter avec le code de l'outil de consentement (PUBLICITE.md, étape 2).
}

// 2. Annonce : à compléter avec le code de la régie. Toujours une annonce non
//    personnalisée, avec le traitement « public enfant » ; sans accord, aucune
//    annonce qui dépose des cookies.
function chargerAnnonce(zone, accord) {
  // À compléter avec le code de la régie (PUBLICITE.md, étape 2).
}

function demarrer() {
  if (!PUB_ACTIVE) return;
  if (!REGIE.script || !REGIE.editeur || !REGIE.emplacement) {
    console.warn('Publicité activée sans les réglages de la régie : rien ne s\'affiche (voir PUBLICITE.md).');
    return;
  }
  if (navigator.onLine === false) return;
  const zone = document.getElementById('pub');
  const bandeau = document.getElementById('consentement');
  if (!zone || !bandeau) return;
  demanderConsentement(bandeau, (accord) => {
    zone.hidden = false;
    chargerAnnonce(zone, accord);
  });
}

demarrer();
