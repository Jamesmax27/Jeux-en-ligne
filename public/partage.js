// ==========================================================================
// Free Micro Games — partage d'un jeu (pages des jeux : gabarits/jeu.html)
//
// Bloc .partage écrit par le build (scripts/pages-seo.mjs), boutons cachés
// tant que ce script n'est pas passé :
// - « Partager » : menu de partage de l'appareil (navigator.share), montré
//   seulement s'il existe ; menu fermé sans choix (AbortError) : rien ;
//   autre refus : le lien est copié.
// - WhatsApp et Facebook : liens posés ici (la page ne contient aucun lien
//   vers un autre site : verifier-seo.mjs) ; rien n'est chargé de chez eux
//   avant le clic.
// - « Copier le lien » : presse-papiers, avec repli par textarea +
//   execCommand('copy') ; message bref dans .partage-message.
// Données lues sur le bloc : data-url (adresse officielle de la page),
// data-titre, data-texte (message traduit), data-copie et data-echec
// (messages traduits). Aucun texte ici, aucune donnée enregistrée.
// ==========================================================================

(function () {
  'use strict';

  var DUREE_MESSAGE = 2500; // ms

  var bloc = document.querySelector('.partage');
  if (!bloc) return;

  var url = bloc.dataset.url || location.href.split('#')[0];
  var titre = bloc.dataset.titre || document.title;
  var texte = bloc.dataset.texte || titre;
  var message = bloc.querySelector('.partage-message');
  var minuterie = null;

  function bouton(nom) { return bloc.querySelector('[data-partage="' + nom + '"]'); }

  function annoncer(phrase) {
    if (!message) return;
    clearTimeout(minuterie);
    message.textContent = phrase;
    minuterie = setTimeout(function () { message.textContent = ''; }, DUREE_MESSAGE);
  }

  // Repli des navigateurs sans presse-papiers moderne (ou page sans HTTPS).
  function copierAncien() {
    var zone = document.createElement('textarea');
    zone.value = url;
    zone.setAttribute('readonly', '');
    zone.style.position = 'fixed';
    zone.style.top = '0';
    zone.style.left = '0';
    zone.style.opacity = '0';
    document.body.appendChild(zone);
    zone.select();
    zone.setSelectionRange(0, zone.value.length); // iPhone
    var reussi = false;
    try { reussi = document.execCommand('copy'); } catch (e) { /* refusé */ }
    document.body.removeChild(zone);
    return reussi;
  }

  function copier() {
    var fin = function (reussi) { annoncer(reussi ? bloc.dataset.copie : bloc.dataset.echec); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { fin(true); }, function () { fin(copierAncien()); });
    } else {
      fin(copierAncien());
    }
  }

  var natif = bouton('natif');
  if (natif && typeof navigator.share === 'function') {
    natif.hidden = false;
    natif.addEventListener('click', function () {
      navigator.share({ title: titre, text: texte, url: url }).catch(function (e) {
        if (e && e.name === 'AbortError') return; // menu fermé sans choix
        copier(); // partage refusé par l'appareil : le lien est copié à la place
      });
    });
  }

  var whatsapp = bouton('whatsapp');
  if (whatsapp) {
    whatsapp.href = 'https://wa.me/?text=' + encodeURIComponent(texte + ' ' + url);
    whatsapp.hidden = false;
  }

  var facebook = bouton('facebook');
  if (facebook) {
    facebook.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
    facebook.hidden = false;
  }

  var copie = bouton('copier');
  if (copie) {
    copie.hidden = false;
    copie.addEventListener('click', copier);
  }
})();
