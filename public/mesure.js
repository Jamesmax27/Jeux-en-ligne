// ==========================================================================
// Free Micro Games — mesure d'audience Google Analytics 4 (avec accord seulement)
//
// Chargé juste après consentement.js (même ordre, defer) sur toutes les pages
// générées (pages-seo.mjs) et dans le lanceur (play.html). Jamais dans les jeux.
//
// - gtag.js n'est chargé QUE si le visiteur a accepté dans le bandeau des
//   cookies (consentement.js, Google Consent Mode v2 : analytics_storage refusé
//   par défaut, accordé par « Accepter »). Sans choix ou après un refus : aucune
//   requête vers Google Analytics, aucun cookie _ga.
// - Toujours refusés, quel que soit le choix : ad_personalization
//   (consentement.js), Google Signals et signaux de personnalisation des annonces
//   (allow_google_signals et allow_ad_personalization_signals à false ci-dessous).
// - Cookies _ga et _ga_<id> : 13 mois au plus, durée non prolongée à chaque
//   visite (recommandation de la CNIL) ; effacés si le visiteur refuse ensuite.
// - Hors connexion : rien n'est chargé.
// - Évènements des autres scripts : window.FMG_MESURE.evenement(nom, paramètres),
//   ignoré sans accord (rien n'est mis en attente pour être envoyé plus tard).
//   Utilisé par play.js : « game_start » et « vote ».
// ==========================================================================

(function () {
  'use strict';

  var ID_MESURE = 'G-HTQ7RNYW3J';
  var SCRIPT_GTAG = 'https://www.googletagmanager.com/gtag/js?id=' + ID_MESURE;
  var DUREE_COOKIES = 13 * 30 * 24 * 3600; // secondes : 13 mois au plus
  var COOKIES_MESURE = ['_ga', '_ga_' + ID_MESURE.slice(2)];

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') window.gtag = function () { window.dataLayer.push(arguments); };

  var actif = false;
  var charge = false;

  function charger() {
    window['ga-disable-' + ID_MESURE] = false;
    actif = true;
    if (charge) return;
    charge = true;
    window.gtag('js', new Date());
    window.gtag('config', ID_MESURE, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: DUREE_COOKIES,
      cookie_update: false,
    });
    var script = document.createElement('script');
    script.async = true;
    script.src = SCRIPT_GTAG;
    document.head.appendChild(script);
  }

  // Refus après un accord (bandeau rouvert) : plus rien n'est envoyé pour cette
  // page, et les cookies de mesure du site sont effacés (adresse et domaines parents).
  function arreter() {
    actif = false;
    window['ga-disable-' + ID_MESURE] = true;
    var morceaux = location.hostname.split('.');
    var domaines = [''];
    for (var i = 0; i < morceaux.length - 1; i++) domaines.push('; domain=.' + morceaux.slice(i).join('.'));
    COOKIES_MESURE.forEach(function (nom) {
      domaines.forEach(function (domaine) {
        document.cookie = nom + '=; Max-Age=0; path=/' + domaine;
      });
    });
  }

  function suivreChoix(choix) {
    if (choix === 'accepte') {
      if (navigator.onLine !== false) charger();
    } else if (choix === 'refuse') {
      arreter();
    }
  }

  var consentement = window.FMG_CONSENTEMENT;
  if (consentement) {
    suivreChoix(consentement.choix());
    consentement.surChoix(suivreChoix);
  }

  window.FMG_MESURE = {
    /** Envoie un évènement Google Analytics, seulement si le visiteur a accepté. */
    evenement: function (nom, parametres) {
      if (actif) window.gtag('event', nom, parametres || {});
    },
  };
})();
