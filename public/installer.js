// ==========================================================================
// Free Micro Games — « Installer l'appli » (toutes les pages générées)
//
// Le site est une PWA (manifest.webmanifest, sw.js) : il peut s'installer comme
// une appli (icône sur l'écran d'accueil, ouverture en plein écran).
// - Bannière en haut de l'accueil (#installer-banniere, gabarits/accueil.html) ;
//   lien « Installer l'appli » du pied de toutes les pages (.pied-installer) ;
//   fenêtre d'explication (#installer-fenetre, gabarits/morceaux/installer.html),
//   écrite dans la langue de la page : ce script ne contient aucun texte.
// - Chrome, Edge, Samsung Internet (Android et ordinateur) : le navigateur sait
//   installer lui-même (évènement beforeinstallprompt, gardé dès le <head> par
//   le petit script de pages-seo.mjs dans window.FMG_INSTALLATION) : le bouton
//   « Installer » ouvre directement sa fenêtre. La bannière n'y est montrée
//   que si cet évènement arrive : il n'arrive pas quand l'appli est déjà
//   installée, ce qui évite d'insister auprès de qui l'a déjà.
// - iPhone, iPad, Firefox sur Android, Safari sur Mac, navigateur intégré d'une
//   autre appli (Facebook, Instagram…) : rien d'automatique, la fenêtre montre
//   les gestes à faire sur cet appareil (data-cas) ; « Autre appareil ? »
//   montre tous les cas. Firefox sur ordinateur ne sait pas installer : pas de
//   bannière, la fenêtre (par le pied de page) conseille Chrome ou Edge.
// - Jamais rien quand le site est ouvert depuis l'appli installée
//   (display-mode standalone… ou navigator.standalone sur iPhone).
// - Rappel : ✕ (ou refus dans la fenêtre du navigateur) cache la bannière
//   RAPPEL_JOURS jours, puis elle revient (demande du propriétaire) ;
//   « C'est fait » (gestes faits à la main, que le site ne peut pas vérifier)
//   la cache JOURS_APRES_FAIT jours ; installation vue par le navigateur
//   (appinstalled, ou site ouvert une fois depuis l'appli) : plus de bannière.
// Mémoire sur l'appareil (stockage technique, politique de cookies) :
// fmg-installer = { masqueeJusqua: ms, installee: bool, montree: bool }
// (montree : la bannière était là, sa place est gardée à la visite suivante
// par le script de tête de l'accueil, classe avec-installer).
// ==========================================================================

(function () {
  'use strict';

  var RAPPEL_JOURS = 3;        // ✕ : la bannière revient au bout de 3 jours
  var JOURS_APRES_FAIT = 30;   // « C'est fait » (non vérifiable) : 30 jours
  var ATTENTE_NAVIGATEUR = 4000; // ms après le chargement pour beforeinstallprompt
  var JOUR = 24 * 3600 * 1000;
  var CLE = 'fmg-installer';

  var racine = document.documentElement;
  var banniere = document.getElementById('installer-banniere');
  var fenetre = document.getElementById('installer-fenetre');
  var liensPied = document.querySelectorAll('.pied-installer');

  // --- Mémoire --------------------------------------------------------------

  function lire() {
    try {
      var v = JSON.parse(localStorage.getItem(CLE) || 'null');
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }
  function ecrire(changements) {
    var v = lire();
    for (var k in changements) v[k] = changements[k];
    try { localStorage.setItem(CLE, JSON.stringify(v)); } catch (e) { /* stockage refusé */ }
  }

  // --- Appareil ---------------------------------------------------------------

  function dansLAppli() {
    try {
      if (navigator.standalone === true) return true;
      return !!(window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui), (display-mode: window-controls-overlay)').matches);
    } catch (e) { return false; }
  }

  var ua = navigator.userAgent || '';
  var iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var android = /Android/.test(ua);
  var firefox = /Firefox\/|FxiOS/.test(ua);
  var integre = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Line\/|Snapchat|TikTok|musical_ly|Bytedance|LinkedInApp|Pinterest|Twitter/i.test(ua);
  var safariMac = !iOS && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/.test(ua);
  var versionSafari = parseInt((ua.match(/Version\/(\d+)/) || [])[1], 10) || 0;

  // Cas de l'appareil : une section data-cas de la fenêtre.
  var cas = integre ? 'integre'
    : iOS ? 'ios'
    : android ? (firefox ? 'firefox-android' : 'android')
    : firefox ? 'firefox-ordi'
    : safariMac ? 'mac'
    : 'ordi';
  // Cas où le navigateur peut proposer sa propre installation (Chromium).
  var casNavigateur = cas === 'android' || cas === 'ordi';
  // Cas où la bannière se montre sans attendre le navigateur (gestes à la main).
  var casManuel = cas === 'ios' || cas === 'firefox-android' || cas === 'integre' || (cas === 'mac' && versionSafari >= 17);

  // Évènement du navigateur, gardé dès le <head> (pages-seo.mjs) ou reçu ici.
  function evenement() { return window.FMG_INSTALLATION || null; }

  // --- Bannière --------------------------------------------------------------

  function bannierePermise() {
    var v = lire();
    if (dansLAppli() || v.installee) return false;
    if (v.masqueeJusqua && v.masqueeJusqua > Date.now()) return false;
    return casManuel || (casNavigateur && !!evenement());
  }

  function montrerBanniere() {
    if (!banniere) return;
    banniere.hidden = false;
    racine.classList.remove('avec-installer'); // place gardée : la vraie bannière la prend
    ecrire({ montree: true });
  }

  function cacherBanniere() {
    if (banniere) banniere.hidden = true;
    racine.classList.remove('avec-installer');
    if (banniere) ecrire({ montree: false });
  }

  function decider() {
    if (!banniere) return;
    if (bannierePermise()) montrerBanniere();
    else cacherBanniere();
  }

  function masquer(jours) {
    ecrire({ masqueeJusqua: Date.now() + jours * JOUR });
    cacherBanniere();
  }

  function installee() {
    ecrire({ installee: true, masqueeJusqua: 0 });
    cacherBanniere();
  }

  // --- Installation par le navigateur --------------------------------------

  function lancerNavigateur() {
    var e = evenement();
    if (!e) { ouvrir(); return; }
    window.FMG_INSTALLATION = null; // un évènement ne sert qu'une fois
    var choix;
    try { choix = e.prompt(); } catch (x) { ouvrir(); return; }
    Promise.resolve(e.userChoice || choix).then(function (r) {
      if (r && r.outcome === 'accepted') {
        installee();
        if (fenetre && fenetre.open) afficherReussi();
      } else {
        masquer(RAPPEL_JOURS);
        if (fenetre && fenetre.open) preparer(false);
      }
    }).catch(function () { /* fenêtre du navigateur fermée sans réponse */ });
  }

  // --- Fenêtre d'explication -------------------------------------------------

  function preparer(tous) {
    if (!fenetre) return;
    var avecBouton = !!evenement();
    fenetre.classList.toggle('installer-tous', tous);
    fenetre.querySelectorAll('.installer-cas').forEach(function (s) {
      var c = s.getAttribute('data-cas');
      s.hidden = c === 'bouton' ? !avecBouton : !(tous || (!avecBouton && c === cas));
    });
    var manuel = fenetre.querySelector('.installer-manuel');
    if (manuel) manuel.hidden = tous || avecBouton;
    var fait = fenetre.querySelector('[data-installer="fait"]');
    if (fait) fait.hidden = avecBouton || (!tous && (cas === 'firefox-ordi' || cas === 'integre'));
    var autre = fenetre.querySelector('[data-installer="tous"]');
    if (autre) autre.setAttribute('aria-expanded', String(tous));
    var reussi = fenetre.querySelector('.installer-reussi');
    if (reussi) reussi.hidden = true;
  }

  function afficherReussi() {
    if (!fenetre) return;
    fenetre.querySelectorAll('.installer-cas, .installer-manuel, [data-installer="fait"], .installer-autre').forEach(function (el) { el.hidden = true; });
    var reussi = fenetre.querySelector('.installer-reussi');
    if (reussi) reussi.hidden = false;
  }

  function ouvrir() {
    if (!fenetre) return;
    preparer(false);
    var autre = fenetre.querySelector('.installer-autre');
    if (autre) autre.hidden = false;
    if (typeof fenetre.showModal === 'function') {
      if (!fenetre.open) fenetre.showModal();
    } else {
      fenetre.setAttribute('open', ''); // très vieux navigateur : fenêtre simple
    }
  }

  function fermer() {
    if (!fenetre) return;
    if (typeof fenetre.close === 'function') fenetre.close();
    else fenetre.removeAttribute('open');
  }

  // --- Clics -------------------------------------------------------------------

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-installer]');
    if (!b) {
      // Clic sur le fond de la fenêtre (en dehors de sa boîte) : on la ferme.
      if (fenetre && e.target === fenetre) {
        var r = fenetre.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fermer();
      }
      return;
    }
    switch (b.getAttribute('data-installer')) {
      case 'banniere': if (evenement()) lancerNavigateur(); else ouvrir(); break;
      case 'ouvrir': ouvrir(); break;
      case 'lancer': lancerNavigateur(); break;
      case 'masquer': masquer(RAPPEL_JOURS); break;
      case 'fait': masquer(JOURS_APRES_FAIT); fermer(); break;
      case 'fermer-fenetre': fermer(); break;
      case 'tous': preparer(b.getAttribute('aria-expanded') !== 'true'); break;
    }
  });

  // --- Départ ------------------------------------------------------------------

  var appli = dansLAppli();
  if (appli) {
    // Ouvert depuis l'appli : rien à proposer, et le navigateur du même
    // appareil (même stockage sur Android et ordinateur) ne la propose plus.
    ecrire({ installee: true, montree: false });
    if (banniere) banniere.hidden = true;
    racine.classList.remove('avec-installer');
    return;
  }

  liensPied.forEach(function (li) { li.hidden = false; });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // notre bannière à la place de celle du navigateur
    window.FMG_INSTALLATION = e;
    ecrire({ installee: false }); // le navigateur la propose : elle n'est pas (ou plus) installée
    decider();
    if (fenetre && fenetre.open && !fenetre.classList.contains('installer-tous')) preparer(false);
  });

  window.addEventListener('appinstalled', function () {
    window.FMG_INSTALLATION = null;
    installee();
    if (fenetre && fenetre.open) afficherReussi();
  });

  if (!casNavigateur || evenement()) {
    decider();
  } else {
    // Chrome, Edge… : on attend l'évènement du navigateur ; sans lui (appli déjà
    // installée, navigateur qui ne sait pas installer), pas de bannière.
    var attendre = function () {
      setTimeout(function () { if (!evenement()) decider(); }, ATTENTE_NAVIGATEUR);
    };
    if (document.readyState === 'complete') attendre();
    else window.addEventListener('load', attendre);
  }
})();
