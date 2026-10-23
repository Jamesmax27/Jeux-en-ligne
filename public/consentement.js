// ==========================================================================
// Free Micro Games — consentement aux cookies (bandeau + Google Consent Mode v2)
//
// Chargé en premier sur toutes les pages générées (pages-seo.mjs, <head>,
// defer) et dans le lanceur (play.html, sans bandeau : il lit le choix déjà
// fait), avant tout script Google (mesure d'audience : mesure.js ; publicité :
// pub.js, accueil seulement).
//
// - Google Consent Mode v2 : TOUT est refusé par défaut (ad_storage,
//   ad_user_data, ad_personalization, analytics_storage).
// - « Accepter » accorde ad_storage, ad_user_data et analytics_storage
//   (Google Analytics, chargé par mesure.js seulement après cet accord).
//   ad_personalization reste TOUJOURS refusé (annonces non personnalisées,
//   public d'enfants).
// - « Refuser » : tout reste refusé et les cookies AdSense du site sont effacés
//   (mesure.js efface ceux de Google Analytics).
// - Choix gardé 6 mois dans localStorage (« fmg-consentement »), puis redemandé.
//   Sans stockage (navigation privée stricte…) : choix gardé le temps de la page.
// - Bandeau : #consentement (gabarits/morceaux/consentement.html), rouvert par
//   le bouton « Réglages des cookies » du pied de page ([data-consentement-ouvrir]).
// - Pour les autres scripts : window.FMG_CONSENTEMENT = { choix(), surChoix(fn), ouvrir() }
//   et l'évènement « fmg-consentement » (detail.choix = 'accepte' | 'refuse').
// Textes : écrits dans la page par le build (clés cookies.* et legal.*), aucun ici.
// ==========================================================================

(function () {
  'use strict';

  var CLE = 'fmg-consentement';
  var MOIS = 6;
  var COOKIES_PUB = ['__gads', '__gpi', '__eoi']; // cookies AdSense déposés sur le domaine du site

  // --- Google Consent Mode v2 : valeurs par défaut, avant tout tag Google ----
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  if (typeof window.gtag !== 'function') window.gtag = gtag;

  var TOUT_REFUSE = {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  };
  window.gtag('consent', 'default', Object.assign({ wait_for_update: 500 }, TOUT_REFUSE));
  // Sans accord, les identifiants de clic publicitaires sont masqués.
  window.gtag('set', 'ads_data_redaction', true);

  // --- Choix enregistré ------------------------------------------------------
  var choixMemoire = null;

  function expiration(date) {
    var d = new Date(date);
    d.setMonth(d.getMonth() + MOIS);
    return d.getTime();
  }

  function lireChoix() {
    if (choixMemoire) return choixMemoire;
    try {
      var o = JSON.parse(localStorage.getItem(CLE) || 'null');
      var maintenant = Date.now();
      if (o && (o.choix === 'accepte' || o.choix === 'refuse') && typeof o.date === 'number'
        && o.date <= maintenant + 86400000 && maintenant < expiration(o.date)) {
        return o.choix;
      }
    } catch (e) { /* stockage indisponible ou illisible */ }
    return null;
  }

  function enregistrer(choix) {
    choixMemoire = choix;
    try { localStorage.setItem(CLE, JSON.stringify({ choix: choix, date: Date.now(), v: 1 })); } catch (e) { /* tant pis : choix gardé pour cette page */ }
  }

  function appliquer(choix) {
    window.gtag('consent', 'update', choix === 'accepte'
      ? { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'denied', analytics_storage: 'granted' }
      : TOUT_REFUSE);
  }

  // Efface les cookies AdSense du site (sur l'adresse et ses domaines parents).
  function effacerCookiesPub() {
    var morceaux = location.hostname.split('.');
    var domaines = [''];
    for (var i = 0; i < morceaux.length - 1; i++) domaines.push('; domain=.' + morceaux.slice(i).join('.'));
    COOKIES_PUB.forEach(function (nom) {
      domaines.forEach(function (domaine) {
        document.cookie = nom + '=; Max-Age=0; path=/' + domaine;
      });
    });
  }

  var abonnes = [];
  function choisir(choix) {
    enregistrer(choix);
    appliquer(choix);
    if (choix === 'refuse') effacerCookiesPub();
    fermer();
    abonnes.forEach(function (fn) { try { fn(choix); } catch (e) { console.error(e); } });
    try { window.dispatchEvent(new CustomEvent('fmg-consentement', { detail: { choix: choix } })); } catch (e) { /* très vieux navigateur */ }
  }

  // Un choix encore valable s'applique tout de suite (avant la publicité).
  var depart = lireChoix();
  if (depart) appliquer(depart);

  // --- Bandeau -----------------------------------------------------------------
  var bandeau = document.getElementById('consentement');
  var retourFocus = null;
  var observateur = null;

  // Le bandeau est fixé en bas de l'écran : la page gagne la même hauteur en
  // bas, pour que le pied de page (et ses liens) reste accessible.
  function reserverPlace() {
    var h = bandeau && !bandeau.hidden ? bandeau.offsetHeight : 0;
    document.documentElement.style.setProperty('--hauteur-consentement', h + 'px');
    document.documentElement.classList.toggle('avec-consentement', h > 0);
  }

  function montrer(avecFocus) {
    if (!bandeau) return;
    bandeau.hidden = false;
    reserverPlace();
    if (!observateur && typeof ResizeObserver === 'function') {
      observateur = new ResizeObserver(reserverPlace);
      observateur.observe(bandeau);
    }
    if (avecFocus) {
      retourFocus = document.activeElement;
      var premier = bandeau.querySelector('[data-consentement]');
      if (premier) premier.focus();
    }
  }

  function fermer() {
    if (!bandeau || bandeau.hidden) return;
    bandeau.hidden = true;
    reserverPlace();
    if (retourFocus && document.contains(retourFocus)) retourFocus.focus();
    retourFocus = null;
  }

  function ouvrir() { montrer(true); }

  if (bandeau) {
    bandeau.addEventListener('click', function (e) {
      var bouton = e.target.closest && e.target.closest('[data-consentement]');
      if (bouton) choisir(bouton.getAttribute('data-consentement') === 'accepte' ? 'accepte' : 'refuse');
    });
    // Échap ferme le bandeau rouvert, si un choix existe déjà.
    bandeau.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lireChoix()) fermer();
    });
    // Première visite (ou choix de plus de 6 mois) : le bandeau s'affiche,
    // sans prendre le focus (on peut lire la page et choisir plus tard).
    if (!depart) montrer(false);
  }

  // Bouton « Réglages des cookies » du pied de page : visible avec JavaScript seulement.
  var reglages = document.querySelectorAll('[data-consentement-ouvrir]');
  for (var i = 0; i < reglages.length; i++) {
    var conteneur = reglages[i].closest('[hidden]');
    if (conteneur) conteneur.hidden = false;
    reglages[i].addEventListener('click', ouvrir);
  }

  window.FMG_CONSENTEMENT = {
    /** 'accepte', 'refuse' ou null (pas encore de choix). */
    choix: lireChoix,
    /** fn(choix) appelée à chaque choix fait dans le bandeau. */
    surChoix: function (fn) { if (typeof fn === 'function') abonnes.push(fn); },
    ouvrir: ouvrir,
  };
})();
