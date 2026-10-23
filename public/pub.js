// ==========================================================================
// Free Micro Games — publicité Google AdSense (PRÉPARÉE, DÉSACTIVÉE)
//
// Un seul emplacement, en bas du catalogue (accueil, #pub). Jamais dans le
// lanceur (play.html), dans les jeux, ni sur les autres pages.
// Tant que PUB_ACTIVE vaut false, rien n'est chargé ni affiché, aucun cookie.
// Pour l'activer : suivre PUBLICITE.md (identifiants du compte AdSense).
//
// Déroulé une fois activée :
//   1. le visiteur choisit dans le bandeau des cookies (consentement.js, qui a
//      déjà posé Google Consent Mode v2 : tout refusé par défaut,
//      ad_personalization toujours refusé) ; rien n'est chargé avant ce choix ;
//   2. annonce TOUJOURS non personnalisée et demandée avec le traitement
//      réservé aux enfants :
//        - requestNonPersonalizedAds = 1 (réglage de la page) ;
//        - data-restrict-data-processing="1" (traitement restreint des données :
//          annonces non personnalisées seulement) ;
//        - data-tag-for-age-treatment="1" (« enfant » : remplace l'ancien
//          tag_for_child_directed_treatment = 1, abandonné par Google, et lui
//          est équivalent ; aide AdSense 3248194 et 9598414) ;
//      refus : ni cookie publicitaire lu ni déposé (ad_storage refusé) ;
//   hors connexion : rien.
// ==========================================================================

const PUB_ACTIVE = false;

// Réglages donnés par AdSense (voir PUBLICITE.md). Vides tant qu'il n'y a pas
// de compte : ne jamais y mettre d'identifiants inventés.
const REGIE = {
  editeur: '',      // identifiant éditeur : « ca-pub-… »
  emplacement: '',  // identifiant du bloc d'annonce (data-ad-slot)
};

const SCRIPT_ADSENSE = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

// 1. Consentement : suite(accord) dès que le visiteur a choisi dans le bandeau
//    (tout de suite si son choix de moins de 6 mois est enregistré).
function demanderConsentement(suite) {
  const consentement = window.FMG_CONSENTEMENT;
  if (!consentement) return; // bandeau absent : pas de publicité
  const choix = consentement.choix();
  if (choix) { suite(choix === 'accepte'); return; }
  let fait = false;
  consentement.surChoix((nouveau) => {
    if (fait) return; // Consent Mode transmet lui-même les changements suivants
    fait = true;
    suite(nouveau === 'accepte');
  });
}

// 2. Annonce : non personnalisée et « enfant » dans tous les cas. L'accord ne
//    change que le droit de lire et déposer des cookies (Consent Mode).
function chargerAnnonce(zone) {
  const adsbygoogle = (window.adsbygoogle = window.adsbygoogle || []);
  adsbygoogle.requestNonPersonalizedAds = 1;

  const annonce = document.createElement('ins');
  annonce.className = 'adsbygoogle';
  annonce.style.display = 'block';
  annonce.dataset.adClient = REGIE.editeur;
  annonce.dataset.adSlot = REGIE.emplacement;
  annonce.dataset.adFormat = 'auto';
  annonce.dataset.fullWidthResponsive = 'true';
  annonce.dataset.restrictDataProcessing = '1';
  annonce.dataset.tagForAgeTreatment = '1';
  zone.append(annonce);

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `${SCRIPT_ADSENSE}?client=${encodeURIComponent(REGIE.editeur)}`;
  script.onerror = () => { zone.hidden = true; };
  document.head.append(script);

  adsbygoogle.push({});
}

function demarrer() {
  if (!PUB_ACTIVE) return;
  if (!/^ca-pub-\d+$/.test(REGIE.editeur) || !/^\d+$/.test(REGIE.emplacement)) {
    console.warn('Publicité activée sans les identifiants AdSense : rien ne s\'affiche (voir PUBLICITE.md).');
    return;
  }
  if (navigator.onLine === false) return;
  const zone = document.getElementById('pub');
  if (!zone) return;
  demanderConsentement(() => {
    zone.hidden = false;
    chargerAnnonce(zone);
  });
}

demarrer();
