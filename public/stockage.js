/* ==========================================================================
   Free Micro Games — module commun de stockage des jeux          jel-stockage v1
   JavaScript pur, sans dépendance, sans compte ni serveur, hors ligne.

   Pour les jeux qui gardent beaucoup de données (grand monde, plusieurs parties,
   fichier à exporter). La progression ordinaire reste dans save.js (JEL_SAVE,
   100 000 caractères au plus) ; ce module est facultatif.

   Où sont les données ?
     - Jeu affiché par le site (cadre isolé, sans accès au stockage) : le
       lanceur (public/play.js, public/stockage-lanceur.js) les garde dans
       l'IndexedDB du site (base « fmg-jeux »). Un jeu ne voit que ses propres
       clés. Le lanceur le signale par window.JEL_STOCKAGE = 1 ; échanges :
       { type: "jel-stockage", id, op, cle, valeur… } et réponse du même type
       { type: "jel-stockage", id, ok, valeur | err }.
     - Jeu ouvert seul (test local, autre site) : IndexedDB de la page, sinon
       localStorage, sinon la mémoire (le temps de la page).

   API (window.JEL_STOCK) — tout renvoie une promesse :
     get(cle)               texte gardé, ou null
     set(cle, texte)        garde le texte ; erreur { code: "plein" } si
                            l'appareil manque de place, { code: "trop-gros" }
                            au-delà de TAILLE_MAX, { code: "cle" } pour une clé
                            refusée
     del(cle)               efface
     liste()                clés gardées par ce jeu
     persister()            demande au navigateur de ne pas effacer les données
                            du site (true si c'est accordé ; jamais garanti)
     place()                { utilise, quota } en octets, ou null
     exporter(nom, texte, type)  propose un fichier au téléchargement ; à
                            appeler juste après un geste du joueur (toucher,
                            clic) : sinon le navigateur peut le refuser
     mode()                 "site", "indexeddb", "local" ou "memoire"
   Clés : lettres, chiffres, « - », « _ » et « . », 80 caractères au plus.

   Dans un jeu : ce fichier est recopié tel quel dans index.html, dans une
   balise script d'identifiant « jel-stockage », juste après jel-sauvegarde.
   Il ne doit jamais contenir la fermeture de balise script.
   Mise à jour des jeux : node scripts/i18n-jeu.mjs (recopie aussi ce fichier
   dans les jeux qui l'ont déjà ; on l'ajoute à la main la première fois).
   Règles : CONSIGNES-JEU.md, section « Sauvegarde ».
   ========================================================================== */
(function () {
  'use strict';
  if (window.JEL_STOCK) return;

  var TAILLE_MAX = 20 * 1024 * 1024; // caractères : le lanceur refuse au-delà
  var RE_CLE = /^[\w.-]{1,80}$/;
  var DELAI = 20000; // ms : sans réponse du lanceur, l'opération échoue
  var espace = 'jel:' + (location.pathname || '/') + ':'; // jeu ouvert seul : un espace par adresse

  function erreur(code) { return { code: code }; }

  // --- Lanceur du site --------------------------------------------------------
  var attente = {}, numero = 0;
  function parLanceur(op, donnees) {
    return new Promise(function (ok, ko) {
      var id = ++numero, message = { type: 'jel-stockage', id: id, op: op };
      for (var k in donnees) message[k] = donnees[k];
      attente[id] = { ok: ok, ko: ko };
      try { window.parent.postMessage(message, '*'); } catch (e) { delete attente[id]; ko(erreur('indisponible')); return; }
      setTimeout(function () { if (attente[id]) { delete attente[id]; ko(erreur('delai')); } }, DELAI);
    });
  }
  window.addEventListener('message', function (evenement) {
    if (evenement.source !== window.parent) return;
    var d = evenement.data;
    if (!d || d.type !== 'jel-stockage' || !attente[d.id]) return;
    var a = attente[d.id]; delete attente[d.id];
    if (d.ok) a.ok(d.valeur === undefined ? null : d.valeur); else a.ko(erreur(d.err || 'erreur'));
  });

  // --- IndexedDB de la page (jeu ouvert seul) ---------------------------------
  var base = null;
  function ouvrir() {
    if (base) return base;
    base = new Promise(function (ok, ko) {
      try {
        var r = indexedDB.open('jel-stockage', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('d'); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { ko(r.error); };
      } catch (e) { ko(e); }
    });
    return base;
  }
  function transaction(ecrire, travail) {
    return ouvrir().then(function (db) {
      return new Promise(function (ok, ko) {
        var t = db.transaction('d', ecrire ? 'readwrite' : 'readonly'), magasin = t.objectStore('d'), resultat = null;
        var r = travail(magasin); if (r) r.onsuccess = function () { resultat = r.result; };
        t.oncomplete = function () { ok(resultat); };
        t.onerror = t.onabort = function () { ko(t.error && t.error.name === 'QuotaExceededError' ? erreur('plein') : erreur('erreur')); };
      });
    });
  }
  var memoire = {};
  var direct = {
    indexeddb: {
      get: function (c) { return transaction(false, function (m) { return m.get(espace + c); }).then(function (v) { return typeof v === 'string' ? v : null; }); },
      set: function (c, v) { return transaction(true, function (m) { return m.put(v, espace + c); }).then(function () { return true; }); },
      del: function (c) { return transaction(true, function (m) { return m.delete(espace + c); }).then(function () { return true; }); },
      liste: function () { return transaction(false, function (m) { return m.getAllKeys(); }).then(function (cles) { return (cles || []).filter(function (k) { return typeof k === 'string' && k.indexOf(espace) === 0; }).map(function (k) { return k.slice(espace.length); }); }); }
    },
    local: {
      get: function (c) { var v = localStorage.getItem(espace + c); return Promise.resolve(v); },
      set: function (c, v) { try { localStorage.setItem(espace + c, v); return Promise.resolve(true); } catch (e) { return Promise.reject(erreur('plein')); } },
      del: function (c) { localStorage.removeItem(espace + c); return Promise.resolve(true); },
      liste: function () { var out = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(espace) === 0) out.push(k.slice(espace.length)); } return Promise.resolve(out); }
    },
    memoire: {
      get: function (c) { return Promise.resolve(Object.prototype.hasOwnProperty.call(memoire, c) ? memoire[c] : null); },
      set: function (c, v) { memoire[c] = v; return Promise.resolve(true); },
      del: function (c) { delete memoire[c]; return Promise.resolve(true); },
      liste: function () { return Promise.resolve(Object.keys(memoire)); }
    }
  };

  // --- Choix du mode ------------------------------------------------------------
  var dansLeSite = window.JEL_STOCKAGE === 1 && window.parent !== window;
  var choix = null, modeChoisi = dansLeSite ? 'site' : null;
  function pret() {
    if (choix) return choix;
    if (dansLeSite) { choix = Promise.resolve('site'); return choix; }
    choix = ouvrir().then(function () { return 'indexeddb'; }, function () {
      try { var e = espace + '__essai__'; localStorage.setItem(e, '1'); localStorage.removeItem(e); return 'local'; } catch (x) { return 'memoire'; }
    }).then(function (m) { modeChoisi = m; return m; });
    return choix;
  }
  function verifierCle(c) { return typeof c === 'string' && RE_CLE.test(c); }
  function operation(op, c, v) {
    if (op !== 'liste' && !verifierCle(c)) return Promise.reject(erreur('cle'));
    if (op === 'set' && (typeof v !== 'string' || v.length > TAILLE_MAX)) return Promise.reject(erreur(typeof v === 'string' ? 'trop-gros' : 'valeur'));
    return pret().then(function (m) {
      if (m === 'site') return parLanceur(op, { cle: c, valeur: v });
      return direct[m][op](c, v);
    });
  }

  function telecharger(nom, texte, type) {
    var url = URL.createObjectURL(new Blob([texte], { type: type || 'application/octet-stream' }));
    var a = document.createElement('a'); a.href = url; a.download = nom; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 20000);
    return true;
  }

  window.JEL_STOCK = {
    get: function (c) { return operation('get', c); },
    set: function (c, v) { return operation('set', c, v); },
    del: function (c) { return operation('del', c); },
    liste: function () { return operation('liste'); },
    persister: function () {
      if (dansLeSite) return parLanceur('persister', {}).catch(function () { return false; });
      try { return navigator.storage && navigator.storage.persist ? navigator.storage.persist().catch(function () { return false; }) : Promise.resolve(false); }
      catch (e) { return Promise.resolve(false); }
    },
    place: function () {
      if (dansLeSite) return parLanceur('place', {}).catch(function () { return null; });
      try { return navigator.storage && navigator.storage.estimate ? navigator.storage.estimate().then(function (e) { return { utilise: e.usage || 0, quota: e.quota || 0 }; }, function () { return null; }) : Promise.resolve(null); }
      catch (e) { return Promise.resolve(null); }
    },
    exporter: function (nom, texte, type) {
      if (typeof texte !== 'string' || texte.length > TAILLE_MAX) return Promise.reject(erreur('trop-gros'));
      if (dansLeSite) return parLanceur('exporter', { nom: String(nom || 'partie.txt'), valeur: texte, mime: type || '' });
      try { return Promise.resolve(telecharger(String(nom || 'partie.txt'), texte, type)); } catch (e) { return Promise.reject(erreur('erreur')); }
    },
    mode: function () { return modeChoisi || (dansLeSite ? 'site' : null); },
    TAILLE_MAX: TAILLE_MAX
  };
})();
