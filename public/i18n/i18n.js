/* ==========================================================================
   Jeux-en-ligne — module commun de traduction (site ET jeux)        jel-i18n v1
   JavaScript pur, sans dépendance, fonctionne hors ligne.

   Langues : fr (source), en, es, pt (Brésil), de. Langue de secours : en.
   Détection, dans l'ordre :
     1. paramètre d'adresse ?lang=xx (enregistré comme choix) ;
     2. choix enregistré : localStorage « lang » (dans un jeu affiché par le
        site, le lanceur transmet ce choix par window.JEL_LANG, car le cadre
        isolé n'a pas accès au stockage du site) ;
     3. navigator.languages (préfixe seul : « pt-BR » → « pt ») ;
     4. « en ».

   API (window.JEL_I18N, et raccourci global t() s'il est libre) :
     getLang()            langue courante
     setLang(code)        change de langue (enregistre, <html lang>, textes)
     t(cle, variables)    texte traduit ; {variables} remplacées ; pluriels
                          via Intl.PluralRules si la valeur est un objet
                          { "one": "…", "other": "…" } (variable n)
     has(cle)             la clé existe-t-elle (langue courante ou fr) ?
     nombre(x, options)   nombre formaté selon la langue (Intl.NumberFormat)
     date(d, options)     date formatée selon la langue (Intl.DateTimeFormat)
     appliquer(racine)    traduit le DOM : data-i18n (texte), data-i18n-html
                          (dictionnaire de confiance seulement),
                          data-i18n-placeholder, data-i18n-title, data-i18n-aria
     ajouter(lang, dico)  ajoute des textes ; charger(dossier) : site seulement
     surChangement(f)     appelle f(lang) après chaque changement de langue
     creerSelecteur(opts) sélecteur de langue (code + nom dans sa langue)

   Clé absente dans la langue choisie : texte français, sinon la clé brute,
   avec un avertissement dans la console (une seule fois par clé).

   Dans un jeu : ce fichier est recopié tel quel dans index.html, juste après
   le bloc <script type="application/json" id="jel-i18n-textes"> qui contient
   { "fr": {…}, "en": {…}, … }. Un petit bouton de langue s'ajoute dans le coin
   indiqué par data-coin (haut-gauche, haut-droite, bas-gauche, bas-droite ;
   data-coin-decalage="52px" l'éloigne du bord haut ou bas, ex. sous une barre ;
   data-coin="aucun" pour le placer soi-même avec creerSelecteur). Changer de
   langue relance le jeu dans la nouvelle langue.
   Mise à jour des jeux : node scripts/i18n-jeu.mjs (recopie ce fichier).
   ========================================================================== */
(function () {
  'use strict';
  if (window.JEL_I18N) return;

  var LANGUES = ['fr', 'en', 'es', 'pt', 'de'];
  var NOMS = { fr: 'Français', en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch' };
  var ETIQUETTE = { fr: 'Langue', en: 'Language', es: 'Idioma', pt: 'Idioma', de: 'Sprache' }; // nom du bouton
  var SOURCE = 'fr';
  var SECOURS = 'en';
  var CLE_STOCKAGE = 'lang';

  var dicos = {};          // { fr: { cle: texte }, en: {…} }
  var ecouteurs = [];
  var avertis = {};
  var dossierSite = null;  // site : dossier des fichiers JSON (charger)
  var blocJeu = document.getElementById('jel-i18n-textes');
  var modeJeu = !!blocJeu;

  // --- Outils ---------------------------------------------------------------

  function valide(code) {
    var c = String(code || '').trim().toLowerCase().split(/[-_]/)[0];
    return LANGUES.indexOf(c) >= 0 ? c : null;
  }
  function lireStockage() { try { return localStorage.getItem(CLE_STOCKAGE); } catch (e) { return null; } }
  function ecrireStockage(v) { try { localStorage.setItem(CLE_STOCKAGE, v); } catch (e) { /* stockage refusé */ } }
  function paramAdresse() { try { return new URLSearchParams(location.search).get('lang'); } catch (e) { return null; } }

  function detecter() {
    var c = valide(paramAdresse());
    if (c) { ecrireStockage(c); return c; }
    c = valide(window.JEL_LANG) || valide(lireStockage());
    if (c) return c;
    var liste = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
    for (var i = 0; i < liste.length; i++) {
      c = valide(liste[i]);
      if (c) return c;
    }
    return SECOURS;
  }

  var langue = detecter();
  document.documentElement.lang = langue;

  function avertir(texte) {
    if (avertis[texte]) return;
    avertis[texte] = true;
    try { console.warn('[i18n] ' + texte); } catch (e) { /* pas de console */ }
  }

  function trouver(lang, cle) {
    var d = dicos[lang];
    return d && Object.prototype.hasOwnProperty.call(d, cle) ? d[cle] : undefined;
  }

  function nombre(x, options) {
    try { return new Intl.NumberFormat(langue, options).format(x); } catch (e) { return String(x); }
  }

  function date(d, options) {
    try { return new Intl.DateTimeFormat(langue, options).format(d instanceof Date ? d : new Date(d)); } catch (e) { return String(d); }
  }

  // Valeur au pluriel : { one, other, … } selon Intl.PluralRules (variable n).
  function pluriel(valeur, lang, variables) {
    var n = variables && typeof variables.n === 'number' ? variables.n : 0;
    var forme = 'other';
    try { forme = new Intl.PluralRules(lang).select(n); } catch (e) { /* navigateur ancien */ }
    if (n === 0 && typeof valeur.zero === 'string') return valeur.zero;
    return typeof valeur[forme] === 'string' ? valeur[forme] : valeur.other;
  }

  function remplacer(texte, variables) {
    if (!variables) return texte;
    return texte.replace(/\{(\w+)\}/g, function (tout, nom) {
      if (!Object.prototype.hasOwnProperty.call(variables, nom)) return tout;
      var v = variables[nom];
      return typeof v === 'number' ? nombre(v) : String(v);
    });
  }

  // --- Traduction -----------------------------------------------------------

  function t(cle, variables) {
    var lang = langue;
    var valeur = trouver(lang, cle);
    if (valeur === undefined) {
      lang = SOURCE;
      valeur = trouver(SOURCE, cle);
      if (langue !== SOURCE || valeur === undefined) avertir('clé manquante en ' + langue + ' : ' + cle);
      if (valeur === undefined) return cle;
    }
    if (valeur && typeof valeur === 'object') valeur = pluriel(valeur, lang, variables);
    return remplacer(String(valeur), variables);
  }

  function has(cle) {
    return trouver(langue, cle) !== undefined || trouver(SOURCE, cle) !== undefined;
  }

  // Traduit tous les éléments marqués sous « racine » (document par défaut).
  function appliquer(racine) {
    racine = racine || document;
    if (!racine.querySelectorAll) return;
    var regles = [
      ['data-i18n', function (el, v) { el.textContent = v; }],
      ['data-i18n-html', function (el, v) { el.innerHTML = v; }],
      ['data-i18n-placeholder', function (el, v) { el.setAttribute('placeholder', v); }],
      ['data-i18n-title', function (el, v) { el.setAttribute('title', v); }],
      ['data-i18n-aria', function (el, v) { el.setAttribute('aria-label', v); }],
    ];
    regles.forEach(function (regle) {
      var liste = racine.querySelectorAll('[' + regle[0] + ']');
      for (var i = 0; i < liste.length; i++) regle[1](liste[i], t(liste[i].getAttribute(regle[0])));
    });
  }

  function ajouter(lang, dico) {
    var c = valide(lang);
    if (!c || !dico || typeof dico !== 'object') return;
    dicos[c] = dicos[c] || {};
    for (var cle in dico) {
      if (Object.prototype.hasOwnProperty.call(dico, cle)) dicos[c][cle] = dico[cle];
    }
  }

  // Site : charge <dossier><lang>.json (fr toujours, pour le repli).
  function chargerUne(lang) {
    if (dicos[lang] || !dossierSite) return Promise.resolve();
    return fetch(dossierSite + lang + '.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { ajouter(lang, d); })
      .catch(function (e) { avertir('textes « ' + lang + ' » indisponibles (' + e.message + ')'); });
  }

  function charger(dossier) {
    dossierSite = dossier;
    return Promise.all([chargerUne(SOURCE), chargerUne(langue)]).then(function () { appliquer(document); });
  }

  function surChangement(f) { if (typeof f === 'function') ecouteurs.push(f); }

  function prevenir() {
    for (var i = 0; i < ecouteurs.length; i++) {
      try { ecouteurs[i](langue); } catch (e) { setTimeout(function () { throw e; }); }
    }
  }

  // Changement de langue appliqué sur place (sans recharger la page).
  function changerSurPlace(c) {
    langue = c;
    document.documentElement.lang = c;
    appliquer(document);
    majSelecteurs();
    prevenir();
  }

  function setLang(code) {
    var c = valide(code);
    if (!c) return Promise.resolve(langue);
    ecrireStockage(c);
    if (modeJeu) {
      if (c === langue) return Promise.resolve(langue);
      // Jeu affiché par le site : le lanceur enregistre le choix et relance le jeu.
      if (window.parent && window.parent !== window) {
        try { window.parent.postMessage({ type: 'jel-langue', lang: c }, '*'); } catch (e) { /* cadre isolé */ }
        // Si personne ne répond (jeu ouvert ailleurs), on change sur place.
        setTimeout(function () { changerSurPlace(c); }, 700);
        return Promise.resolve(c);
      }
      // Jeu ouvert seul : on le relance dans la nouvelle langue.
      if (/^https?:$/.test(location.protocol)) {
        var u = new URL(location.href);
        u.searchParams.set('lang', c);
        location.replace(u.href);
        return Promise.resolve(c);
      }
      changerSurPlace(c);
      return Promise.resolve(c);
    }
    // Site : l'adresse suit le choix si elle porte déjà ?lang=.
    try {
      var adresse = new URL(location.href);
      if (adresse.searchParams.has('lang')) {
        adresse.searchParams.set('lang', c);
        history.replaceState(history.state, '', adresse.href);
      }
    } catch (e) { /* adresse spéciale */ }
    return chargerUne(c).then(function () { changerSurPlace(c); return c; });
  }

  // --- Sélecteur de langue ---------------------------------------------------
  // Bouton (code de la langue) qui ouvre la liste des 5 langues, chacune avec
  // son code et son nom dans sa propre langue. Pas de drapeaux. Doigt et clavier
  // (Entrée, Espace, flèches, Échap).
  // Dans un jeu, il est isolé dans un Shadow DOM (élément <jel-langue>) : le CSS
  // du jeu (button {…}, * {…}) ne peut pas le déformer, et inversement.

  var CSS_SELECTEUR =
    '.jel-langue{position:relative;display:inline-block;font:600 14px/1.2 ui-rounded,"Segoe UI",system-ui,sans-serif;text-align:left;color:#eceae4}' +
    '.jel-langue *{box-sizing:border-box}' +
    '.jel-langue-bouton{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;min-height:44px;margin:0;padding:0 10px;border:0;border-radius:999px;background:rgba(11,16,32,.55);color:#eceae4;font:inherit;line-height:1;cursor:pointer;box-shadow:none}' +
    '.jel-langue-code{font-weight:800;letter-spacing:.04em}' +
    '.jel-langue-menu{position:absolute;z-index:2147483001;min-width:170px;margin:6px 0 0;padding:6px;list-style:none;border-radius:14px;background:#161f38;box-shadow:0 10px 30px rgba(0,0,0,.45);border:1px solid #434e6b}' +
    '.jel-langue-menu[hidden]{display:none}' +
    '.jel-langue-menu li{margin:0;padding:0}' +
    '.jel-langue-menu button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;margin:0;padding:0 12px;border:0;border-radius:10px;background:none;color:#eceae4;font:inherit;text-align:left;cursor:pointer;box-shadow:none;white-space:nowrap}' +
    '.jel-langue-menu button b{min-width:2.2em;color:#a8b3f0}' +
    '.jel-langue-menu button[aria-current="true"]{background:#a8b3f0;color:#0b1020}' +
    '.jel-langue-menu button[aria-current="true"] b{color:#0b1020}' +
    '.jel-langue-menu button:hover:not([aria-current="true"]),.jel-langue-menu button:focus-visible{background:#1d2745}' +
    '.jel-langue :focus-visible{outline:3px solid #a8b3f0;outline-offset:2px}' +
    // Jeu : petit bouton discret (code seul) ; liste ouverte vers l'intérieur de l'écran.
    '.jel-langue.compact .jel-langue-bouton{min-width:40px;min-height:40px;padding:0 8px;font-size:12px;background:rgba(11,16,32,.45);border:1px solid rgba(255,255,255,.3)}' +
    '.jel-langue.compact .jel-langue-nom{display:none}' +
    '.jel-langue.vers-gauche .jel-langue-menu{right:0}' +
    '.jel-langue.vers-haut .jel-langue-menu{bottom:100%;margin:0 0 6px}';

  // Place du bouton dans un jeu, selon le coin choisi (data-coin).
  var COINS = {
    'haut-gauche': { top: 'max(6px, env(safe-area-inset-top))', left: 'max(6px, env(safe-area-inset-left))' },
    'haut-droite': { top: 'max(6px, env(safe-area-inset-top))', right: 'max(6px, env(safe-area-inset-right))' },
    'bas-gauche': { bottom: 'max(6px, env(safe-area-inset-bottom))', left: 'max(6px, env(safe-area-inset-left))' },
    'bas-droite': { bottom: 'max(6px, env(safe-area-inset-bottom))', right: 'max(6px, env(safe-area-inset-right))' },
  };

  var selecteurs = [];

  function majSelecteurs() {
    selecteurs.forEach(function (s) { s.maj(); });
  }

  // options : { conteneur, classe, coin, decalage } ; coin = sélecteur de jeu isolé, fixé dans ce coin,
  // éloigné du bord haut ou bas de « decalage » (longueur CSS, ex. « 52px ») s'il est donné.
  function creerSelecteur(options) {
    options = options || {};
    var coin = options.coin && COINS[options.coin] ? options.coin : null;
    var boite = document.createElement('div');
    boite.className = 'jel-langue' + (options.classe ? ' ' + options.classe : '') +
      (coin ? ' compact' + (/droite/.test(coin) ? ' vers-gauche' : '') + (/bas/.test(coin) ? ' vers-haut' : '') : '');

    var bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'jel-langue-bouton';
    bouton.setAttribute('aria-haspopup', 'true');
    bouton.setAttribute('aria-expanded', 'false');
    var code = document.createElement('span');
    code.className = 'jel-langue-code';
    var nom = document.createElement('span');
    nom.className = 'jel-langue-nom';
    bouton.append(code, nom);

    var menu = document.createElement('ul');
    menu.className = 'jel-langue-menu';
    menu.hidden = true;
    var choix = LANGUES.map(function (l) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.lang = l;
      b.dataset.lang = l;
      var c = document.createElement('b');
      c.textContent = l.toUpperCase();
      b.append(c, document.createTextNode(' ' + NOMS[l]));
      b.addEventListener('click', function () { fermer(true); setLang(l); });
      li.append(b);
      menu.append(li);
      return b;
    });

    var hote = null; // jeu : élément <jel-langue> (un peu transparent, sauf liste ouverte)
    function opacite(v) { if (hote) hote.style.setProperty('opacity', v, 'important'); }
    function ouvrir() {
      menu.hidden = false;
      opacite('1');
      bouton.setAttribute('aria-expanded', 'true');
      var actuel = choix[LANGUES.indexOf(langue)] || choix[0];
      actuel.focus();
    }
    function fermer(rendreFocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      opacite('.85');
      bouton.setAttribute('aria-expanded', 'false');
      if (rendreFocus) bouton.focus();
    }

    bouton.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.hidden) ouvrir(); else fermer(false);
    });
    menu.addEventListener('keydown', function (e) {
      var racine = boite.getRootNode();
      var i = choix.indexOf(racine.activeElement || document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); fermer(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); choix[(i + 1) % choix.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); choix[(i - 1 + choix.length) % choix.length].focus(); }
      else if (e.key === 'Tab') fermer(false);
      e.stopPropagation(); // les touches du menu ne pilotent pas le jeu
    });
    bouton.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' && menu.hidden) { e.preventDefault(); ouvrir(); }
      e.stopPropagation();
    });
    // Un toucher ailleurs referme la liste (sans gêner le jeu).
    document.addEventListener('pointerdown', function (e) {
      var chemin = e.composedPath ? e.composedPath() : [e.target];
      if (chemin.indexOf(boite) < 0) fermer(false);
    }, true);
    // Les gestes sur le sélecteur ne doivent pas arriver au jeu.
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click'].forEach(function (type) {
      boite.addEventListener(type, function (e) { e.stopPropagation(); });
    });
    boite.append(bouton, menu);

    // Élément ajouté à la page : la boîte elle-même (site), ou un hôte isolé (jeu).
    var element = boite;
    if (coin) {
      element = hote = document.createElement('jel-langue');
      element.className = 'jel-langue';
      var place = COINS[coin];
      var style = { position: 'fixed', 'z-index': '2147483000', opacity: '.85', margin: '0', padding: '0', display: 'block' };
      for (var p in place) style[p] = options.decalage && /^(top|bottom)$/.test(p) ? 'calc(' + place[p] + ' + ' + options.decalage + ')' : place[p];
      for (var nomStyle in style) element.style.setProperty(nomStyle, style[nomStyle], 'important');
      var ombre = element.attachShadow ? element.attachShadow({ mode: 'open' }) : element;
      var feuille = document.createElement('style');
      feuille.textContent = CSS_SELECTEUR;
      ombre.append(feuille, boite);
    }

    var s = {
      element: element,
      maj: function () {
        code.textContent = langue.toUpperCase();
        nom.textContent = NOMS[langue];
        var etiquette = ETIQUETTE[langue] + ' : ' + NOMS[langue];
        bouton.setAttribute('aria-label', etiquette);
        bouton.title = etiquette;
        choix.forEach(function (b) {
          if (b.dataset.lang === langue) b.setAttribute('aria-current', 'true');
          else b.removeAttribute('aria-current');
        });
      },
    };
    s.maj();
    selecteurs.push(s);
    if (options.conteneur) options.conteneur.append(element);
    return element;
  }

  // Site : style de base du sélecteur dans la page (style.css le complète).
  function ajouterStyle() {
    if (document.getElementById('jel-langue-style')) return;
    var style = document.createElement('style');
    style.id = 'jel-langue-style';
    style.textContent = CSS_SELECTEUR;
    (document.head || document.documentElement).append(style);
  }

  // --- Démarrage ----------------------------------------------------------------

  if (modeJeu) {
    try {
      var textes = JSON.parse(blocJeu.textContent);
      for (var l in textes) if (Object.prototype.hasOwnProperty.call(textes, l)) ajouter(l, textes[l]);
    } catch (e) {
      avertir('textes du jeu illisibles (' + e.message + ')');
    }
  }

  window.JEL_I18N = {
    LANGUES: LANGUES.slice(),
    NOMS: NOMS,
    SOURCE: SOURCE,
    getLang: function () { return langue; },
    setLang: setLang,
    t: t,
    has: has,
    nombre: nombre,
    date: date,
    appliquer: appliquer,
    ajouter: ajouter,
    charger: charger,
    surChangement: surChangement,
    creerSelecteur: creerSelecteur,
  };
  if (!('t' in window)) window.t = t;

  if (!modeJeu) ajouterStyle();

  if (modeJeu) {
    var demarrer = function () {
      appliquer(document);
      var coin = blocJeu.getAttribute('data-coin') || 'haut-gauche';
      if (coin !== 'aucun' && document.body) {
        creerSelecteur({ conteneur: document.body, coin: coin, decalage: blocJeu.getAttribute('data-coin-decalage') || '' });
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
    else demarrer();
  }
})();
