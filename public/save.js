/* ==========================================================================
   Free Micro Games — module commun de sauvegarde des jeux     jel-sauvegarde v1
   JavaScript pur, sans dépendance, sans compte ni serveur, hors ligne.

   Garde la progression d'un jeu sur l'appareil, sous la clé « save_<id> »
   (ex. « save_pommes-du-poney ») du localStorage du site.

   Où sont les données ?
     - Jeu ouvert seul (adresse /games/<id>/, test local) : localStorage direct.
     - Jeu affiché par le site (cadre isolé, sans accès au stockage) : le
       lanceur (public/play.js) donne la sauvegarde au démarrage
       (window.JEL_SAUVEGARDES = { "save_<id>": "<JSON>" }) et enregistre
       chaque écriture reçue par le message { type: "jel-sauvegarde", cle,
       valeur } (valeur null = effacer). Le jeu ne peut écrire que sa clé.
     - Sans aucun stockage : la sauvegarde vit le temps de la page.

   Données (version de format SAUVEGARDE_VERSION) :
     { v: 1, niveau: 1, score: 0, options: {}, date: <ms> }
     niveau  numéro du niveau où reprendre (1 = premier)
     score   score à ce moment-là
     options réglages utiles (son coupé, difficulté…)
     Le jeu peut ajouter ses propres champs (étoiles, record…).
   Sauvegarde absente, illisible ou d'un format inconnu : valeurs par défaut.

   API (window.JEL_SAVE) :
     save(jeu, donnees)     enregistre (fusionné avec la sauvegarde actuelle) ;
                            renvoie true si c'est fait
     load(jeu)              données (valeurs par défaut si rien d'utilisable)
     clear(jeu)             efface la sauvegarde
     existe(jeu)            une sauvegarde utilisable existe-t-elle ?
     surFermeture(f)        appelle f() quand la page est cachée ou quittée
                            (visibilitychange, pagehide, beforeunload)
     reprise(options)       fenêtre « Continuer » / « Nouvelle partie » /
                            « Effacer la sauvegarde » (voir plus bas)
     boutonEffacer(options) bouton « Effacer la sauvegarde » seul
     texte(cle, vars)       textes du module dans la langue du jeu

   Dans un jeu : ce fichier est recopié tel quel dans index.html, dans une
   balise script d'identifiant « jel-sauvegarde », juste après le module de
   traduction (jel-i18n). Il ne doit jamais contenir la fermeture de balise
   script (elle couperait le jeu).
   Mise à jour des jeux : node scripts/i18n-jeu.mjs (recopie aussi ce fichier).
   Règles d'intégration : CONSIGNES-JEU.md, section « Sauvegarde ».
   ========================================================================== */
(function () {
  'use strict';
  if (window.JEL_SAVE) return;

  var SAUVEGARDE_VERSION = 1;
  var PREFIXE = 'save_';
  var TAILLE_MAX = 100000; // caractères : le lanceur refuse au-delà

  // --- Stockage -------------------------------------------------------------

  var direct = (function () {
    try {
      var essai = '__jel_essai__';
      localStorage.setItem(essai, '1');
      localStorage.removeItem(essai);
      return localStorage;
    } catch (e) { return null; } // cadre isolé du site, stockage refusé
  })();

  var memoire = {};
  try {
    var donnees = window.JEL_SAUVEGARDES;
    if (donnees && typeof donnees === 'object') {
      for (var c in donnees) {
        if (Object.prototype.hasOwnProperty.call(donnees, c) && typeof donnees[c] === 'string') memoire[c] = donnees[c];
      }
    }
  } catch (e) { /* rien reçu du lanceur */ }

  function lire(cle) {
    if (direct) { try { return direct.getItem(cle); } catch (e) { /* stockage devenu indisponible */ } }
    return Object.prototype.hasOwnProperty.call(memoire, cle) ? memoire[cle] : null;
  }

  // valeur null = effacer
  function ecrire(cle, valeur) {
    if (valeur === null) delete memoire[cle]; else memoire[cle] = valeur;
    var ok = false;
    if (direct) {
      try {
        if (valeur === null) direct.removeItem(cle); else direct.setItem(cle, valeur);
        ok = true;
      } catch (e) { /* stockage plein ou refusé */ }
    }
    if (!ok && window.parent && window.parent !== window) {
      try { window.parent.postMessage({ type: 'jel-sauvegarde', cle: cle, valeur: valeur }, '*'); ok = true; } catch (e) { /* pas de lanceur */ }
    }
    return ok;
  }

  // --- Données ----------------------------------------------------------------

  function cleDe(jeu) { return PREFIXE + String(jeu || '').trim(); }

  function defauts() { return { v: SAUVEGARDE_VERSION, niveau: 1, score: 0, options: {} }; }

  function objet(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

  // Données relues, ou null si absentes, illisibles ou d'un format inconnu.
  function lireDonnees(jeu) {
    var brut = lire(cleDe(jeu));
    if (typeof brut !== 'string' || !brut) return null;
    var d;
    try { d = JSON.parse(brut); } catch (e) { return null; }
    if (!objet(d) || d.v !== SAUVEGARDE_VERSION) return null;
    var propre = defauts();
    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) propre[k] = d[k];
    var n = Number(propre.niveau);
    propre.niveau = isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    var s = Number(propre.score);
    propre.score = isFinite(s) ? s : 0;
    if (!objet(propre.options)) propre.options = {};
    return propre;
  }

  function load(jeu) { return lireDonnees(jeu) || defauts(); }

  function existe(jeu) { return lireDonnees(jeu) !== null; }

  function save(jeu, donnees) {
    if (!String(jeu || '').trim()) return false;
    var tout = load(jeu);
    if (objet(donnees)) for (var k in donnees) if (Object.prototype.hasOwnProperty.call(donnees, k)) tout[k] = donnees[k];
    tout.v = SAUVEGARDE_VERSION;
    tout.date = Date.now();
    var texte;
    try { texte = JSON.stringify(tout); } catch (e) { return false; }
    if (texte.length > TAILLE_MAX) {
      try { console.warn('[sauvegarde] trop grosse, ignorée (' + texte.length + ' caractères)'); } catch (e) { /* pas de console */ }
      return false;
    }
    return ecrire(cleDe(jeu), texte);
  }

  function clear(jeu) { return ecrire(cleDe(jeu), null); }

  // --- Fermeture de la page -------------------------------------------------

  function surFermeture(f) {
    if (typeof f !== 'function') return;
    var appeler = function () { try { f(); } catch (e) { setTimeout(function () { throw e; }); } };
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') appeler(); });
    window.addEventListener('pagehide', appeler);
    window.addEventListener('beforeunload', appeler);
  }

  // --- Textes (5 langues) -----------------------------------------------------

  var TEXTES = {
    fr: { titre: 'Une partie est sauvegardée', niveau: 'Niveau {n}', score: 'Score : {n}', continuer: 'Continuer', nouvelle: 'Nouvelle partie', effacer: 'Effacer la sauvegarde', confirmer: 'Toucher encore pour effacer', efface: 'Sauvegarde effacée' },
    en: { titre: 'You have a saved game', niveau: 'Level {n}', score: 'Score: {n}', continuer: 'Continue', nouvelle: 'New game', effacer: 'Delete saved game', confirmer: 'Tap again to delete', efface: 'Saved game deleted' },
    es: { titre: 'Tienes una partida guardada', niveau: 'Nivel {n}', score: 'Puntos: {n}', continuer: 'Continuar', nouvelle: 'Nueva partida', effacer: 'Borrar la partida guardada', confirmer: 'Toca otra vez para borrar', efface: 'Partida guardada borrada' },
    pt: { titre: 'Você tem um jogo salvo', niveau: 'Nível {n}', score: 'Pontos: {n}', continuer: 'Continuar', nouvelle: 'Novo jogo', effacer: 'Apagar o jogo salvo', confirmer: 'Toque de novo para apagar', efface: 'Jogo salvo apagado' },
    de: { titre: 'Du hast einen gespeicherten Spielstand', niveau: 'Level {n}', score: 'Punkte: {n}', continuer: 'Weiterspielen', nouvelle: 'Neues Spiel', effacer: 'Spielstand löschen', confirmer: 'Zum Löschen noch mal tippen', efface: 'Spielstand gelöscht' },
  };

  function langue() {
    var l = '';
    try { l = window.JEL_I18N ? window.JEL_I18N.getLang() : (window.JEL_LANG || document.documentElement.lang); } catch (e) { /* rien */ }
    l = String(l || '').toLowerCase().split(/[-_]/)[0];
    return TEXTES[l] ? l : 'fr';
  }

  function texte(cle, vars) {
    var l = langue();
    var s = TEXTES[l][cle] || TEXTES.fr[cle] || cle;
    return s.replace(/\{(\w+)\}/g, function (tout, nom) {
      if (!vars || !Object.prototype.hasOwnProperty.call(vars, nom)) return tout;
      var v = vars[nom];
      if (typeof v === 'number') { try { return new Intl.NumberFormat(l).format(v); } catch (e) { return String(v); } }
      return String(v);
    });
  }

  // --- Interface ------------------------------------------------------------------
  // Isolée dans un Shadow DOM (comme le bouton de langue) : le CSS du jeu ne la
  // déforme pas. Les gestes et les touches n'arrivent pas au jeu.

  var CSS =
    ':host{all:initial}' +
    '*{box-sizing:border-box}' +
    '.fond{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(7,10,20,.72);font:600 16px/1.3 ui-rounded,"Segoe UI",system-ui,sans-serif;color:#eceae4}' +
    '.carte{width:min(360px,100%);padding:20px 18px 14px;border-radius:20px;background:#161f38;border:1px solid #5a6688;box-shadow:0 14px 40px rgba(0,0,0,.5);text-align:center}' +
    'h2{margin:0 0 6px;font-size:19px;line-height:1.25;color:#eceae4}' +
    'p{margin:0 0 16px;color:#a3adc2;font-size:15px}' +
    'button{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;margin:0 0 10px;padding:8px 14px;border-radius:999px;border:2px solid #a8b3f0;background:transparent;color:#eceae4;font:inherit;font-size:17px;line-height:1.2;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +
    'button.principal{background:#a8b3f0;color:#0b1020;border-color:#a8b3f0}' +
    'button.discret{min-height:44px;margin:4px 0 0;border:0;color:#a3adc2;font-size:14px;text-decoration:underline}' +
    'button.discret.armer{color:#f2d27a;text-decoration:none}' +
    'button:focus-visible{outline:3px solid #f2d27a;outline-offset:2px}' +
    '.seul{display:inline-flex;width:auto;min-height:44px;margin:0;padding:6px 14px;border:1px solid #5a6688;background:rgba(11,16,32,.6);color:#eceae4;font:600 14px/1.2 ui-rounded,"Segoe UI",system-ui,sans-serif}' +
    '.seul.armer{border-color:#f2d27a;color:#f2d27a}';

  function isoler(element) {
    ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchmove', 'click', 'keydown', 'keyup', 'wheel'].forEach(function (type) {
      element.addEventListener(type, function (e) { e.stopPropagation(); });
    });
  }

  function creerHote(nom, style) {
    var hote = document.createElement(nom);
    for (var p in style) hote.style.setProperty(p, style[p], 'important');
    var ombre = hote.attachShadow ? hote.attachShadow({ mode: 'open' }) : hote;
    var feuille = document.createElement('style');
    feuille.textContent = CSS;
    ombre.appendChild(feuille);
    return { hote: hote, ombre: ombre };
  }

  function bouton(classe, contenu) {
    var b = document.createElement('button');
    b.type = 'button';
    if (classe) b.className = classe;
    b.textContent = contenu;
    return b;
  }

  // Bouton d'effacement en deux temps (les fenêtres du navigateur sont interdites) :
  // 1er toucher → « Toucher encore pour effacer », 2e toucher dans les 3 s → efface.
  function armerEffacement(b, jeu, fait) {
    var minuteur = null;
    b.addEventListener('click', function () {
      if (!b.classList.contains('armer')) {
        b.classList.add('armer');
        b.textContent = texte('confirmer');
        clearTimeout(minuteur);
        minuteur = setTimeout(function () { b.classList.remove('armer'); b.textContent = texte('effacer'); }, 3000);
        return;
      }
      clearTimeout(minuteur);
      b.classList.remove('armer');
      clear(jeu);
      fait();
    });
  }

  var ouverte = null; // fenêtre de reprise affichée

  // Fenêtre de reprise. options :
  //   jeu          identifiant du jeu (obligatoire)
  //   onContinuer  f(donnees) : reprendre au niveau donnees.niveau
  //   onNouvelle   f() : partie depuis le début (la sauvegarde reste jusqu'à la
  //                prochaine écriture du jeu)
  //   onEffacer    f() facultatif, après effacement (par défaut : onNouvelle)
  //   sansNiveau   true pour un jeu sans niveaux (partie sans fin) : la fenêtre
  //                montre seulement le score (rien s'il est nul)
  // Sans sauvegarde utilisable : rien ne s'affiche, onNouvelle() est appelé
  // tout de suite. Renvoie true si la fenêtre s'affiche.
  function reprise(options) {
    options = options || {};
    var jeu = options.jeu;
    var nouvelle = typeof options.onNouvelle === 'function' ? options.onNouvelle : function () {};
    var continuer = typeof options.onContinuer === 'function' ? options.onContinuer : nouvelle;
    var effacer = typeof options.onEffacer === 'function' ? options.onEffacer : nouvelle;
    var d = lireDonnees(jeu);
    if (!d) { nouvelle(); return false; }
    if (ouverte) ouverte.fermer();

    var precedent = document.activeElement;
    var h = creerHote('jel-sauvegarde', { position: 'fixed', inset: '0', 'z-index': '2147483002', display: 'block', margin: '0', padding: '0' });
    var fond = document.createElement('div');
    fond.className = 'fond';
    var carte = document.createElement('div');
    carte.className = 'carte';
    carte.setAttribute('role', 'dialog');
    carte.setAttribute('aria-modal', 'true');
    var titre = document.createElement('h2');
    titre.id = 'jel-sauvegarde-titre';
    titre.textContent = texte('titre');
    carte.setAttribute('aria-labelledby', titre.id);
    var detail = document.createElement('p');
    detail.textContent = options.sansNiveau
      ? (d.score ? texte('score', { n: d.score }) : '')
      : texte('niveau', { n: d.niveau }) + (d.score ? ' · ' + texte('score', { n: d.score }) : '');
    if (!detail.textContent) detail.hidden = true;
    var bContinuer = bouton('principal', texte('continuer'));
    var bNouvelle = bouton('', texte('nouvelle'));
    var bEffacer = bouton('discret', texte('effacer'));
    carte.append(titre, detail, bContinuer, bNouvelle, bEffacer);
    fond.appendChild(carte);
    h.ombre.appendChild(fond);
    isoler(h.hote);

    var fenetre = {
      fermer: function () {
        if (h.hote.parentNode) h.hote.parentNode.removeChild(h.hote);
        if (ouverte === fenetre) ouverte = null;
        try { if (precedent && precedent.focus) precedent.focus(); } catch (e) { /* rien */ }
      },
    };
    ouverte = fenetre;
    var choisir = function (f, arg) { return function () { fenetre.fermer(); f(arg); }; };
    bContinuer.addEventListener('click', choisir(continuer, d));
    bNouvelle.addEventListener('click', choisir(nouvelle));
    armerEffacement(bEffacer, jeu, function () { fenetre.fermer(); effacer(); });

    // Clavier : Tab et les flèches restent dans la fenêtre, Entrée et Espace
    // activent le bouton choisi. Échap ne ferme pas : le choix doit être explicite.
    var boutons = [bContinuer, bNouvelle, bEffacer];
    fond.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      var actif = h.ombre.activeElement || document.activeElement;
      var i = boutons.indexOf(actif);
      var recul = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
      boutons[(i + (recul ? boutons.length - 1 : 1)) % boutons.length].focus();
    });

    (document.body || document.documentElement).appendChild(h.hote);
    try { bContinuer.focus(); } catch (e) { /* rien */ }
    return true;
  }

  // Bouton « Effacer la sauvegarde » seul (écran titre, menu pause…). options :
  //   jeu, conteneur (élément où le placer), apres f() facultatif.
  // Caché tant qu'il n'y a pas de sauvegarde ; appeler .maj() pour le rafraîchir.
  // Renvoie l'élément ajouté (avec sa méthode maj).
  function boutonEffacer(options) {
    options = options || {};
    var h = creerHote('jel-sauvegarde-effacer', { display: 'inline-block', margin: '0', padding: '0', 'vertical-align': 'middle' });
    var b = bouton('seul', texte('effacer'));
    h.ombre.appendChild(b);
    isoler(h.hote);
    h.hote.maj = function () {
      b.classList.remove('armer');
      b.textContent = texte('effacer');
      h.hote.style.setProperty('display', existe(options.jeu) ? 'inline-block' : 'none', 'important');
    };
    armerEffacement(b, options.jeu, function () {
      h.hote.maj();
      if (typeof options.apres === 'function') options.apres();
    });
    h.hote.maj();
    if (options.conteneur) options.conteneur.appendChild(h.hote);
    return h.hote;
  }

  window.JEL_SAVE = {
    VERSION: SAUVEGARDE_VERSION,
    save: save,
    load: load,
    clear: clear,
    existe: existe,
    surFermeture: surFermeture,
    reprise: reprise,
    boutonEffacer: boutonEffacer,
    texte: texte,
  };
})();
