/* ==========================================================================
   Marmoria — simulation de la cité (couche 1 sur 3 : simulation, rendu, interface)

   Règles imposées par le cahier des charges (docs/cadrage-marmoria.md, section 19) :
   - simulation à pas fixe (20 ticks par seconde à vitesse normale) : la vitesse du jeu
     change le nombre de ticks par image, jamais la durée d'un tick ;
   - déterministe : le générateur aléatoire à graine fait partie de l'état ; même graine
     et mêmes commandes donnent le même état (empreinte()) ;
   - toute action du joueur est une commande sérialisable (appliquer()) ; l'interface ne
     modifie jamais l'état directement ;
   - tous les chiffres de règle viennent des données (bloc mm-donnees), validées au
     chargement (charger()) ;
   - état entièrement sérialisable, avec un numéro de version (exporter(), importer()).
   Ce fichier n'utilise ni la page, ni l'horloge, ni Math.random : il tourne aussi seul
   sous Node (scripts/tester-marmoria.mjs).
   Les champs de l'état dont le nom commence par « _ » sont des caches recalculables,
   jamais sauvegardés.
   ========================================================================== */
(function (racine) {
  'use strict';

  var VERSION_ETAT = 1;

  // Énumérations (codes de couches, pas des règles de jeu).
  var T = { HERBE: 0, PRAIRIE: 1, ARBRES: 2, ROCHERS: 3, EAU: 4 };
  var R = { AUCUNE: 0, ROUTE: 1, BARRIERE: 2, ROME: 3 };

  var D = null;          // données validées et préparées
  var MISSIONS = {};     // id → mission

  // ------------------------------------------------------------------------
  // Données : validation au chargement
  // ------------------------------------------------------------------------

  function valider(d) {
    var pb = [];
    function exige(cond, msg) { if (!cond) pb.push(msg); }
    exige(d && typeof d === 'object', 'données absentes');
    if (!d) throw new Error('Données invalides : données absentes');
    exige(d.version === 1, 'version des données inconnue');
    var t = d.temps || {};
    ['ticksParSeconde', 'ticksParJour', 'joursParMois', 'moisParAn'].forEach(function (k) {
      exige(Number.isInteger(t[k]) && t[k] > 0, 'temps.' + k + ' doit être un entier positif');
    });
    exige(Array.isArray(t.vitesses) && t.vitesses.length > 1, 'temps.vitesses manquant');
    var r = d.regles || {};
    ['detteMax', 'deblaiementCout', 'serviceRayon', 'serviceJours', 'porteeErrant', 'delaiMarcheurJours', 'divertissementMax'].forEach(function (k) {
      exige(typeof r[k] === 'number', 'regles.' + k + ' manquant');
    });
    ['maison', 'immigration', 'emigration', 'humeur', 'travail', 'salaire', 'impot', 'eau', 'feu', 'effondrement', 'marche', 'grenier', 'ferme', 'spectacle', 'vitesses'].forEach(function (k) {
      exige(r[k] && typeof r[k] === 'object', 'regles.' + k + ' manquant');
    });
    exige(Array.isArray(d.maisons) && d.maisons.length === 20, '20 niveaux de maison attendus');
    (d.maisons || []).forEach(function (m, i) {
      exige(m.niveau === i + 1, 'maison ' + (i + 1) + ' : niveau mal numéroté');
      exige(Number.isInteger(m.habitants) && m.habitants > 0, 'maison ' + (i + 1) + ' : habitants');
      exige(m.besoins && typeof m.besoins === 'object', 'maison ' + (i + 1) + ' : besoins');
      exige(typeof m.impot === 'number', 'maison ' + (i + 1) + ' : impot');
    });
    var b = d.batiments || {};
    exige(Object.keys(b).length > 0, 'aucun bâtiment');
    Object.keys(b).forEach(function (k) {
      var x = b[k];
      exige(typeof x.genre === 'string', k + ' : genre');
      exige(Number.isInteger(x.taille) && x.taille >= 1 && x.taille <= 15, k + ' : taille');
      exige(typeof x.cout === 'number' && x.cout >= 0, k + ' : cout');
      exige(Number.isInteger(x.effectif) && x.effectif >= 0, k + ' : effectif');
      if (x.marcheur) exige(!!(d.marcheurs || {})[x.marcheur], k + ' : marcheur inconnu ' + x.marcheur);
      if (x.categorie) exige((d.categories || []).indexOf(x.categorie) >= 0, k + ' : catégorie inconnue ' + x.categorie);
    });
    exige(Array.isArray(d.missions) && d.missions.length === 17, '17 missions attendues');
    (d.missions || []).forEach(function (m, i) {
      exige(typeof m.id === 'string', 'mission ' + i + ' : id');
      exige(m.numero === i + 1, 'mission ' + m.id + ' : numéro');
      if (m.dispo) {
        exige(m.carte && [80, 120, 160].indexOf(m.carte.taille) >= 0, 'mission ' + m.id + ' : taille de carte');
        exige(Array.isArray(m.batiments), 'mission ' + m.id + ' : batiments');
        (m.batiments || []).concat(m.depart || []).forEach(function (k) { exige(!!b[k], 'mission ' + m.id + ' : bâtiment inconnu ' + k); });
        exige(typeof m.fonds === 'number', 'mission ' + m.id + ' : fonds');
        (m.tutoriel || []).forEach(function (e, j) {
          exige(typeof e.cle === 'string' && e.condition, 'mission ' + m.id + ' : étape ' + j);
          (e.debloque || []).forEach(function (k) { exige(!!b[k], 'mission ' + m.id + ' : déblocage inconnu ' + k); });
        });
      }
    });
    if (pb.length) throw new Error('Données invalides : ' + pb.join(' ; '));
  }

  // Prépare des tables dérivées (besoins cumulés des maisons…).
  function preparer(d) {
    var cumul = {};
    d.maisons.forEach(function (m) {
      var c = {};
      Object.keys(cumul).forEach(function (k) { c[k] = cumul[k]; });
      Object.keys(m.besoins).forEach(function (k) { c[k] = Math.max(c[k] || 0, m.besoins[k]); });
      m.besoinsCumul = c;
      cumul = c;
    });
    MISSIONS = {};
    d.missions.forEach(function (m) { MISSIONS[m.id] = m; });
    d.ticksParMois = d.temps.ticksParJour * d.temps.joursParMois;
    d.joursParAn = d.temps.joursParMois * d.temps.moisParAn;
    return d;
  }

  function charger(donnees) {
    valider(donnees);
    D = preparer(donnees);
    return D;
  }

  // ------------------------------------------------------------------------
  // Hasard à graine (mulberry32) : son état est dans etat.alea
  // ------------------------------------------------------------------------

  function hasard(e, n) {
    var a = (e.alea = (e.alea + 0x6D2B79F5) | 0);
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    var v = (t ^ (t >>> 14)) >>> 0;
    return n ? v % n : v;
  }
  // Générateur local (création de carte), indépendant de l'état.
  function generateur(graine) {
    var s = { alea: graine | 0 };
    return function (n) { return hasard(s, n); };
  }

  // ------------------------------------------------------------------------
  // Outils de grille
  // ------------------------------------------------------------------------

  function dedans(e, x, y) { return x >= 0 && y >= 0 && x < e.N && y < e.N; }
  function ix(e, x, y) { return y * e.N + x; }
  function bat(e, i) { var id = e.bat[i]; return id ? e._index.get(id) : null; }
  function batA(e, x, y) { return dedans(e, x, y) ? bat(e, ix(e, x, y)) : null; }
  function def(b) { return D.batiments[b.type]; }
  function estMaison(b) { return b && b.type === 'logement'; }
  function niveauDef(h) { return D.maisons[Math.max(1, h.niv) - 1]; }
  function capacite(h) { return h.niv <= 0 ? D.regles.maison.terrainVagueHabitants : niveauDef(h).habitants; }

  function versionRoutes(e) { e._vRoutes = (e._vRoutes || 0) + 1; e._v = (e._v || 0) + 1; }
  function versionCarte(e) { e._v = (e._v || 0) + 1; }

  // Tampons de recherche de chemin (réutilisés).
  var BUF = null;
  function tampons(n) {
    if (!BUF || BUF.n !== n) BUF = { n: n, prev: new Int32Array(n), dist: new Int32Array(n), vu: new Uint32Array(n), gen: 0, file: new Int32Array(n) };
    BUF.gen++;
    if (BUF.gen >= 0xfffffff0) { BUF.vu.fill(0); BUF.gen = 1; }
    return BUF;
  }

  // Parcours en largeur, voisins dans l'ordre nord, est, sud, ouest (déterministe).
  // sources : cases de départ ; passable(i) ; cible(i) ; max : distance maximale.
  // Renvoie { chemin: [cases après le départ…], depart } ou null.
  function parcours(e, sources, passable, cible, max) {
    var N = e.N, B = tampons(N * N), tete = 0, queue = 0, i, k;
    for (k = 0; k < sources.length; k++) {
      i = sources[k];
      if (B.vu[i] === B.gen) continue;
      B.vu[i] = B.gen; B.prev[i] = -1; B.dist[i] = 0; B.file[queue++] = i;
    }
    while (tete < queue) {
      i = B.file[tete++];
      if (cible(i)) {
        var ch = [], j = i;
        while (B.prev[j] !== -1) { ch.push(j); j = B.prev[j]; }
        ch.reverse();
        return { chemin: ch, depart: j, fin: i };
      }
      var d = B.dist[i];
      if (d >= max) continue;
      var x = i % N, y = (i - x) / N;
      for (k = 0; k < 4; k++) {
        var v;
        if (k === 0) { if (y === 0) continue; v = i - N; }
        else if (k === 1) { if (x === N - 1) continue; v = i + 1; }
        else if (k === 2) { if (y === N - 1) continue; v = i + N; }
        else { if (x === 0) continue; v = i - 1; }
        if (B.vu[v] === B.gen) continue;
        if (!passable(v) && !cible(v)) continue;
        B.vu[v] = B.gen; B.prev[v] = i; B.dist[v] = d + 1; B.file[queue++] = v;
      }
    }
    return null;
  }

  // Parcours unique vers plusieurs cibles : les n premières cibles atteintes, avec leur chemin.
  function parcoursMulti(e, sources, passable, cible, max, n) {
    var N = e.N, B = tampons(N * N), tete = 0, queue = 0, i, k, trouves = [];
    for (k = 0; k < sources.length; k++) {
      i = sources[k];
      if (B.vu[i] === B.gen) continue;
      B.vu[i] = B.gen; B.prev[i] = -1; B.dist[i] = 0; B.file[queue++] = i;
    }
    while (tete < queue && trouves.length < n) {
      i = B.file[tete++];
      if (cible(i)) { trouves.push(i); continue; }
      var d = B.dist[i];
      if (d >= max) continue;
      var x = i % N, y = (i - x) / N;
      for (k = 0; k < 4; k++) {
        var v;
        if (k === 0) { if (y === 0) continue; v = i - N; }
        else if (k === 1) { if (x === N - 1) continue; v = i + 1; }
        else if (k === 2) { if (y === N - 1) continue; v = i + N; }
        else { if (x === 0) continue; v = i - 1; }
        if (B.vu[v] === B.gen) continue;
        if (!passable(v) && !cible(v)) continue;
        B.vu[v] = B.gen; B.prev[v] = i; B.dist[v] = d + 1; B.file[queue++] = v;
      }
    }
    return trouves.map(function (f) {
      var ch = [], j = f;
      while (B.prev[j] !== -1) { ch.push(j); j = B.prev[j]; }
      ch.reverse();
      return { chemin: ch, depart: j, fin: f };
    });
  }

  // Cases de route qui touchent un côté du bâtiment (les diagonales ne comptent pas).
  function acces(e, b) {
    var c = e._acces.get(b.id);
    if (c && c.v === e._vRoutes) return c.l;
    var l = [], t = b.t, N = e.N, x, y;
    for (x = b.x; x < b.x + t; x++) if (b.y > 0 && e.route[ix(e, x, b.y - 1)]) l.push(ix(e, x, b.y - 1));
    for (y = b.y; y < b.y + t; y++) if (b.x + t < N && e.route[ix(e, b.x + t, y)]) l.push(ix(e, b.x + t, y));
    for (x = b.x + t - 1; x >= b.x; x--) if (b.y + t < N && e.route[ix(e, x, b.y + t)]) l.push(ix(e, x, b.y + t));
    for (y = b.y + t - 1; y >= b.y; y--) if (b.x > 0 && e.route[ix(e, b.x - 1, y)]) l.push(ix(e, b.x - 1, y));
    e._acces.set(b.id, { v: e._vRoutes, l: l });
    return l;
  }
  // Sorties pour un errant : accès sans barrière.
  function sortiesErrant(e, b) { return acces(e, b).filter(function (i) { return e.route[i] !== R.BARRIERE; }); }

  // Route à 2 cases ou moins (distance de Tchebychev) d'un bâtiment ?
  function routeProche(e, b, r) {
    for (var y = b.y - r; y < b.y + b.t + r; y++) for (var x = b.x - r; x < b.x + b.t + r; x++) {
      if (dedans(e, x, y) && e.route[ix(e, x, y)]) return true;
    }
    return false;
  }

  // Composantes connexes du réseau routier (cache, recalculé si les routes changent).
  function composantes(e) {
    if (e._comp && e._compV === e._vRoutes) return e._comp;
    var n = e.N * e.N, c = e._comp && e._comp.length === n ? e._comp : new Int32Array(n), lab = 0, N = e.N;
    c.fill(0);
    var file = new Int32Array(n);
    for (var s = 0; s < n; s++) {
      if (!e.route[s] || c[s]) continue;
      lab++;
      var t = 0, q = 0; file[q++] = s; c[s] = lab;
      while (t < q) {
        var i = file[t++], x = i % N;
        if (i >= N && e.route[i - N] && !c[i - N]) { c[i - N] = lab; file[q++] = i - N; }
        if (x < N - 1 && e.route[i + 1] && !c[i + 1]) { c[i + 1] = lab; file[q++] = i + 1; }
        if (i + N < n && e.route[i + N] && !c[i + N]) { c[i + N] = lab; file[q++] = i + N; }
        if (x > 0 && e.route[i - 1] && !c[i - 1]) { c[i - 1] = lab; file[q++] = i - 1; }
      }
    }
    e._comp = c; e._compV = e._vRoutes;
    return c;
  }

  // ------------------------------------------------------------------------
  // Carte : création d'après les paramètres de la mission (données)
  // ------------------------------------------------------------------------

  // Bruit de valeur lissé, entier de 0 à 255.
  function bruit(N, pas, alea) {
    var g = Math.ceil(N / pas) + 2, grille = new Uint8Array(g * g), out = new Uint8Array(N * N), i, x, y;
    for (i = 0; i < grille.length; i++) grille[i] = alea(256);
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      var gx = Math.floor(x / pas), gy = Math.floor(y / pas), fx = x - gx * pas, fy = y - gy * pas;
      var a = grille[gy * g + gx], b = grille[gy * g + gx + 1], c = grille[(gy + 1) * g + gx], d = grille[(gy + 1) * g + gx + 1];
      var haut = a * (pas - fx) + b * fx, bas = c * (pas - fx) + d * fx;
      out[y * N + x] = Math.floor((haut * (pas - fy) + bas * fy) / (pas * pas));
    }
    return out;
  }

  function creerCarte(e, p) {
    var N = e.N, alea = generateur(p.graine), x, y, i;
    var n1 = bruit(N, 9, alea), n2 = bruit(N, 5, alea), n3 = bruit(N, 7, alea), n4 = bruit(N, 4, alea);
    for (i = 0; i < N * N; i++) {
      var v1 = (n1[i] * 3 + n2[i]) >> 2, v2 = (n3[i] * 3 + n4[i]) >> 2;
      if (v1 > (p.prairie || 999)) { e.terrain[i] = T.PRAIRIE; e.fertilite[i] = Math.min(100, 30 + (v1 - p.prairie) * 2); }
      else if (v2 > (p.foret || 999)) e.terrain[i] = T.ARBRES;
    }
    (p.prairies || []).forEach(function (z) {
      for (y = z[1] - z[2]; y <= z[1] + z[2]; y++) for (x = z[0] - z[2]; x <= z[0] + z[2]; x++) {
        if (!dedans(e, x, y)) continue;
        var dd = (x - z[0]) * (x - z[0]) + (y - z[1]) * (y - z[1]);
        if (dd > z[2] * z[2]) continue;
        i = ix(e, x, y); e.terrain[i] = T.PRAIRIE;
        e.fertilite[i] = Math.max(e.fertilite[i], 100 - Math.floor(dd * 40 / (z[2] * z[2] + 1)));
      }
    });
    (p.rochers || []).forEach(function (z) {
      for (y = z[1] - z[2]; y <= z[1] + z[2]; y++) for (x = z[0] - z[2]; x <= z[0] + z[2]; x++) {
        if (!dedans(e, x, y)) continue;
        var dd = (x - z[0]) * (x - z[0]) + (y - z[1]) * (y - z[1]);
        if (dd <= z[2] * z[2] - alea(z[2] + 1)) { i = ix(e, x, y); e.terrain[i] = T.ROCHERS; e.fertilite[i] = 0; }
      }
    });
    if (p.mer) {
      for (x = 0; x < N; x++) {
        var l = p.mer.largeur + ((n2[x] >> 5) - 3);
        for (var k = 0; k < l; k++) {
          var mx, my;
          if (p.mer.cote === 'sud') { mx = x; my = N - 1 - k; } else if (p.mer.cote === 'nord') { mx = x; my = k; }
          else if (p.mer.cote === 'est') { mx = N - 1 - k; my = x; } else { mx = k; my = x; }
          i = ix(e, mx, my); e.terrain[i] = T.EAU; e.fertilite[i] = 0;
        }
      }
    }
    if (p.riviere) {
      var pos = p.riviere.position;
      for (var a = 0; a < N; a++) {
        pos += (n4[a] > 170 ? 1 : n4[a] < 85 ? -1 : 0) * (a % 3 === 0 ? 1 : 0);
        for (var w = 0; w < p.riviere.largeur; w++) {
          var rx = p.riviere.axe === 'horizontal' ? a : pos + w, ry = p.riviere.axe === 'horizontal' ? pos + w : a;
          if (dedans(e, rx, ry)) { i = ix(e, rx, ry); e.terrain[i] = T.EAU; e.fertilite[i] = 0; }
        }
      }
    }
    // Voie de Rome : d'ouest en est, case fixe ; abords dégagés.
    var ry0 = p.route;
    for (x = 0; x < N; x++) {
      for (var dy = -1; dy <= 1; dy++) {
        if (!dedans(e, x, ry0 + dy)) continue;
        i = ix(e, x, ry0 + dy);
        if (e.terrain[i] === T.EAU || e.terrain[i] === T.ROCHERS || e.terrain[i] === T.ARBRES) { e.terrain[i] = T.HERBE; e.fertilite[i] = 0; }
      }
      e.route[ix(e, x, ry0)] = R.ROME;
    }
    e.entree = ix(e, 0, ry0);
    e.sortie = ix(e, N - 1, ry0);
  }

  // ------------------------------------------------------------------------
  // État : création
  // ------------------------------------------------------------------------

  function nouvelle(idMission, options) {
    options = options || {};
    var m = MISSIONS[idMission];
    if (!m || !m.dispo) throw new Error('mission indisponible : ' + idMission);
    var N = m.carte.taille, n = N * N;
    var diff = D.difficultes[options.difficulte || 'normal'] || D.difficultes.normal;
    var e = {
      v: VERSION_ETAT,
      mission: m.id,
      difficulte: options.difficulte || 'normal',
      libre: !!options.libre,
      graine: (options.graine === undefined ? m.carte.graine : options.graine) | 0,
      alea: 0,
      tick: 0,
      N: N,
      terrain: new Uint8Array(n),
      fertilite: new Uint8Array(n),
      route: new Uint8Array(n),
      aqueduc: new Uint8Array(n),
      bat: new Int32Array(n),
      eauPuits: new Uint8Array(n),
      eauFontaine: new Uint8Array(n),
      entree: 0, sortie: 0,
      batiments: [],
      marcheurs: [],
      prochainId: 1,
      tresor: Math.round(m.fonds * diff.fonds),
      impot: D.regles.impot.tauxDepart,
      salaire: D.regles.salaire.rome,
      salaireRome: D.regles.salaire.rome,
      humeur: D.regles.humeur.depart,
      creditImmigration: 0,
      reliquat: 0,
      pop: 0,
      travailleurs: 0, emplois: 0, emploisRequis: 0, chomage: 0,
      debloques: (m.tutoriel && m.tutoriel.length && !options.libre ? m.depart : m.batiments).slice(),
      tuto: 0,
      tutoFini: !(m.tutoriel && m.tutoriel.length) || !!options.libre,
      secoursRecu: false,
      victoire: null,
      defaite: null,
      derniere: null,
      journal: [],
      finances: { an: nouveauBudget(), prec: nouveauBudget() },
      histo: [],
      stats: { incendies: 0, effondrements: 0 }
    };
    e.alea = e.graine ^ 0x5bd1e995;
    reconstruireCaches(e);
    creerCarte(e, m.carte);
    versionRoutes(e);
    calculerEau(e);
    noter(e, 'msg.bienvenue', {}, false);
    return e;
  }

  function nouveauBudget() {
    return { impots: 0, salaires: 0, constructions: 0 };
  }

  function reconstruireCaches(e) {
    e._index = new Map();
    e.batiments.forEach(function (b) { e._index.set(b.id, b); });
    e._mIndex = new Map();
    e.marcheurs.forEach(function (w) { e._mIndex.set(w.id, w); });
    e._acces = new Map();
    e._vRoutes = (e._vRoutes || 0) + 1;
    e._v = (e._v || 0) + 1;
    e._comp = null;
  }

  function mission(e) { return MISSIONS[e.mission]; }

  function noter(e, cle, vars, critique, lieu) {
    e.journal.push({ t: e.tick, cle: cle, vars: vars || {}, critique: !!critique, lieu: lieu === undefined ? -1 : lieu });
    if (e.journal.length > 60) e.journal.splice(0, e.journal.length - 60);
  }

  // ------------------------------------------------------------------------
  // Bâtiments : création, retrait
  // ------------------------------------------------------------------------

  function creerBatiment(e, type, x, y, taille) {
    var d = D.batiments[type], t = taille || d.taille;
    var b = { id: e.prochainId++, type: type, x: x, y: y, t: t, eff: 0, feu: 0, dom: 0, cpt: 0, m: 0, sortie: 0 };
    switch (d.genre) {
      case 'maison': b.niv = 0; b.hab = 0; b.att = 0; b.viv = {}; b.svc = {}; b.ok = 0; b.manque = 0; b.sansRoute = 0; break;
      case 'ferme': b.prog = 0; b.stock = 0; break;
      case 'grenier': b.stocks = {}; b.attendu = 0; break;
      case 'marche': b.stocks = {}; b.mA = 0; b.mV = 0; b.cptV = 0; break;
      case 'spectacle': b.spect = 0; b.attendu = 0; break;
      case 'ecole_art': b.prog = 0; break;
      case 'reservoir': b.plein = 0; break;
      case 'fontaine': b.actif = 0; break;
      case 'incendie': b.jours = 0; b.pompier = 0; b.ext = 0; break;
      default: break;
    }
    for (var yy = y; yy < y + t; yy++) for (var xx = x; xx < x + t; xx++) e.bat[ix(e, xx, yy)] = b.id;
    e.batiments.push(b);
    e._index.set(b.id, b);
    versionCarte(e);
    return b;
  }

  function retirerBatiment(e, b, sansSansAbri) {
    if (estMaison(b) && b.hab > 0 && !sansSansAbri) creerSansAbri(e, ix(e, b.x, b.y), b.hab);
    for (var yy = b.y; yy < b.y + b.t; yy++) for (var xx = b.x; xx < b.x + b.t; xx++) {
      var i = ix(e, xx, yy);
      if (e.bat[i] === b.id) e.bat[i] = 0;
    }
    var k = e.batiments.indexOf(b);
    if (k >= 0) e.batiments.splice(k, 1);
    e._index.delete(b.id);
    e._acces.delete(b.id);
    versionCarte(e);
  }

  // Remplace un bâtiment par des ruines, des gravats ou un incendie (même emprise).
  function remplacer(e, b, type) {
    var x = b.x, y = b.y, t = b.t;
    retirerBatiment(e, b);
    var nb = creerBatiment(e, type, x, y, t);
    return nb;
  }

  // ------------------------------------------------------------------------
  // Placement
  // ------------------------------------------------------------------------

  function caseLibre(e, i) {
    var t = e.terrain[i];
    return (t === T.HERBE || t === T.PRAIRIE) && !e.bat[i] && !e.route[i] && !e.aqueduc[i];
  }

  // Raison du refus, ou null si la pose est possible.
  function peutPlacer(e, type, x, y) {
    var d = D.batiments[type];
    if (!d) return 'inconnu';
    if (e.debloques.indexOf(type) < 0) return 'verrouille';
    if (e.tresor - d.cout < D.regles.detteMax && d.cout > 0) return 'argent';
    var t = d.taille, i;
    if (d.genre === 'outil') return dedans(e, x, y) ? null : 'horsCarte';
    if (!dedans(e, x, y) || !dedans(e, x + t - 1, y + t - 1)) return 'horsCarte';
    if (d.genre === 'route') {
      i = ix(e, x, y);
      if (e.route[i]) return 'occupe';
      if (e.bat[i]) return 'occupe';
      return (e.terrain[i] === T.HERBE || e.terrain[i] === T.PRAIRIE) ? null : 'terrain';
    }
    if (d.genre === 'barriere') {
      i = ix(e, x, y);
      return e.route[i] === R.ROUTE ? null : 'pasRoute';
    }
    if (d.genre === 'aqueduc') {
      i = ix(e, x, y);
      if (e.aqueduc[i] || e.bat[i]) return 'occupe';
      if (e.route[i] === R.BARRIERE) return 'occupe';
      return (e.terrain[i] === T.HERBE || e.terrain[i] === T.PRAIRIE) ? null : 'terrain';
    }
    for (var yy = y; yy < y + t; yy++) for (var xx = x; xx < x + t; xx++) {
      i = ix(e, xx, yy);
      if (e.bat[i] || e.route[i] || e.aqueduc[i]) return 'occupe';
      if (e.terrain[i] === T.ARBRES) return 'arbres';
      if (e.terrain[i] !== T.HERBE && e.terrain[i] !== T.PRAIRIE) return 'terrain';
      if (d.terrain === 'prairie' && e.terrain[i] !== T.PRAIRIE) return 'prairie';
    }
    if (d.genre === 'maison' && !routeProche(e, { x: x, y: y, t: 1 }, D.regles.logementDistanceRoute)) return 'routeLoin';
    return null;
  }

  // Pose d'un élément sur une case, sans contrôle de l'argent (fait par l'appelant).
  function poser(e, type, x, y, trace) {
    var d = D.batiments[type], i = ix(e, x, y);
    if (d.genre === 'route') { e.route[i] = R.ROUTE; versionRoutes(e); trace.cases.push({ i: i, k: 'route' }); return; }
    if (d.genre === 'barriere') { e.route[i] = R.BARRIERE; versionRoutes(e); trace.cases.push({ i: i, k: 'barriere' }); return; }
    if (d.genre === 'aqueduc') { e.aqueduc[i] = 1; versionCarte(e); trace.cases.push({ i: i, k: 'aqueduc' }); return; }
    var b = creerBatiment(e, type, x, y);
    trace.bats.push(b.id);
  }

  // Déblaiement d'une case : arbres, bâtiment, ruines, route, aqueduc (sans remboursement).
  function deblayer(e, x, y) {
    if (!dedans(e, x, y)) return 0;
    var i = ix(e, x, y), b = bat(e, i);
    if (b) {
      if (b.type === 'incendie') return 0;
      var n = b.t * b.t;
      retirerBatiment(e, b);
      calculerEau(e);
      return n;
    }
    if (e.route[i] && e.route[i] !== R.ROME) { e.route[i] = 0; versionRoutes(e); return 1; }
    if (e.aqueduc[i]) { e.aqueduc[i] = 0; versionCarte(e); calculerEau(e); return 1; }
    if (e.terrain[i] === T.ARBRES) { e.terrain[i] = T.HERBE; versionCarte(e); return 1; }
    return 0;
  }

  // ------------------------------------------------------------------------
  // Commandes du joueur (objets sérialisables)
  // ------------------------------------------------------------------------
  //   { type: 'poser', bat, x, y }
  //   { type: 'tracer', bat, cases: [[x, y], …] }   (routes, aqueducs, logements, déblaiement)
  //   { type: 'annuler' }                           (dernière construction, remboursée)
  //   { type: 'reglage', cle: 'impot' | 'salaire', valeur }

  function appliquer(e, c) {
    var res = { ok: false, cout: 0, n: 0, raison: null };
    if (!c || typeof c.type !== 'string') { res.raison = 'commande'; return res; }
    if (c.type === 'poser' || c.type === 'tracer') {
      var d = D.batiments[c.bat];
      if (!d) { res.raison = 'inconnu'; return res; }
      var cases = c.type === 'poser' ? [[c.x, c.y]] : (c.cases || []);
      var trace = { tick: e.tick, cout: 0, cases: [], bats: [] };
      var eauTouchee = false;
      for (var k = 0; k < cases.length; k++) {
        var x = cases[k][0] | 0, y = cases[k][1] | 0;
        if (d.genre === 'outil') {
          if (e.debloques.indexOf('deblayer') < 0) { res.raison = 'verrouille'; break; }
          var cout = D.regles.deblaiementCout;
          if (e.tresor - cout < D.regles.detteMax) { res.raison = 'argent'; break; }
          var nn = deblayer(e, x, y);
          if (nn) { var c2 = cout * nn; e.tresor -= c2; e.finances.an.constructions += c2; res.cout += c2; res.n++; }
          continue;
        }
        var r = peutPlacer(e, c.bat, x, y);
        if (r) { res.raison = res.raison || r; if (r === 'argent') break; continue; }
        poser(e, c.bat, x, y, trace);
        e.tresor -= d.cout; e.finances.an.constructions += d.cout;
        trace.cout += d.cout; res.cout += d.cout; res.n++;
        if (d.genre === 'puits' || d.genre === 'fontaine' || d.genre === 'reservoir' || d.genre === 'aqueduc') eauTouchee = true;
      }
      if (d.genre !== 'outil' && res.n) e.derniere = trace;
      if (eauTouchee) calculerEau(e);
      if (res.n) { majPopulation(e); verifierTutoriel(e); }
      res.ok = res.n > 0;
      return res;
    }
    if (c.type === 'annuler') {
      var a = e.derniere;
      if (!a) { res.raison = 'rien'; return res; }
      a.cases.forEach(function (cs) {
        if (cs.k === 'route' && e.route[cs.i] === R.ROUTE) { e.route[cs.i] = 0; versionRoutes(e); }
        if (cs.k === 'barriere' && e.route[cs.i] === R.BARRIERE) { e.route[cs.i] = R.ROUTE; versionRoutes(e); }
        if (cs.k === 'aqueduc' && e.aqueduc[cs.i]) { e.aqueduc[cs.i] = 0; versionCarte(e); }
      });
      a.bats.forEach(function (id) { var b = e._index.get(id); if (b) retirerBatiment(e, b); });
      e.tresor += a.cout; e.finances.an.constructions -= a.cout;
      res.cout = -a.cout; res.ok = true;
      e.derniere = null;
      calculerEau(e); majPopulation(e);
      return res;
    }
    if (c.type === 'reglage') {
      if (c.cle === 'impot') e.impot = Math.max(0, Math.min(D.regles.impot.tauxMax, c.valeur | 0));
      else if (c.cle === 'salaire') e.salaire = Math.max(D.regles.salaire.min, Math.min(D.regles.salaire.max, c.valeur | 0));
      else { res.raison = 'reglage'; return res; }
      res.ok = true;
      return res;
    }
    res.raison = 'commande';
    return res;
  }

  // ------------------------------------------------------------------------
  // Eau (couverture statique, sans marcheur)
  // ------------------------------------------------------------------------

  function couvrir(e, grille, b, r) {
    for (var y = b.y - r; y < b.y + b.t + r; y++) for (var x = b.x - r; x < b.x + b.t + r; x++) {
      if (dedans(e, x, y)) grille[ix(e, x, y)] = 1;
    }
  }
  function distRect(b, x, y) {
    var dx = x < b.x ? b.x - x : x >= b.x + b.t ? x - (b.x + b.t - 1) : 0;
    var dy = y < b.y ? b.y - y : y >= b.y + b.t ? y - (b.y + b.t - 1) : 0;
    return Math.max(dx, dy);
  }

  function calculerEau(e) {
    var E = D.regles.eau, N = e.N;
    e.eauPuits.fill(0); e.eauFontaine.fill(0);
    var reservoirs = [];
    e.batiments.forEach(function (b) {
      var g = def(b).genre;
      if (g === 'puits') couvrir(e, e.eauPuits, b, E.puitsRayon);
      else if (g === 'reservoir') { b.plein = 0; reservoirs.push(b); }
    });
    // Réservoir plein : il touche l'eau, ou il est relié par aqueduc à un réservoir plein.
    var file = [];
    reservoirs.forEach(function (b) {
      for (var y = b.y - 1; y <= b.y + b.t && !b.plein; y++) for (var x = b.x - 1; x <= b.x + b.t; x++) {
        var bord = (x === b.x - 1 || x === b.x + b.t) !== (y === b.y - 1 || y === b.y + b.t);
        if (bord && dedans(e, x, y) && e.terrain[ix(e, x, y)] === T.EAU) { b.plein = 1; break; }
      }
      if (b.plein) file.push(b);
    });
    if (file.length && reservoirs.length > 1) {
      // Propagation le long des aqueducs (cases d'aqueduc et emprises de réservoirs).
      var vu = new Uint8Array(N * N), q = [];
      var marquer = function (i) { if (!vu[i]) { vu[i] = 1; q.push(i); } };
      file.forEach(function (b) { for (var y = b.y; y < b.y + b.t; y++) for (var x = b.x; x < b.x + b.t; x++) marquer(ix(e, x, y)); });
      while (q.length) {
        var i = q.pop(), x0 = i % N, y0 = (i - x0) / N;
        var vs = [[x0, y0 - 1], [x0 + 1, y0], [x0, y0 + 1], [x0 - 1, y0]];
        for (var k = 0; k < 4; k++) {
          var vx = vs[k][0], vy = vs[k][1];
          if (!dedans(e, vx, vy)) continue;
          var j = ix(e, vx, vy);
          if (vu[j]) continue;
          var bj = bat(e, j);
          if (e.aqueduc[j]) marquer(j);
          else if (bj && bj.type === 'reservoir') {
            bj.plein = 1;
            for (var yy = bj.y; yy < bj.y + bj.t; yy++) for (var xx = bj.x; xx < bj.x + bj.t; xx++) marquer(ix(e, xx, yy));
          }
        }
      }
    }
    // Fontaines : dans le rayon d'un réservoir plein, avec du personnel.
    e.batiments.forEach(function (b) {
      if (def(b).genre !== 'fontaine') return;
      b.actif = 0;
      if (b.eff <= 0) return;
      for (var k = 0; k < reservoirs.length; k++) {
        if (reservoirs[k].plein && distRect(reservoirs[k], b.x, b.y) <= E.reservoirRayon) { b.actif = 1; break; }
      }
      if (b.actif) couvrir(e, e.eauFontaine, b, b.eff >= def(b).effectif ? E.fontaineRayon : E.fontaineRayonReduit);
    });
    versionCarte(e);
  }

  // ------------------------------------------------------------------------
  // Main-d'œuvre : réservoir unique (section 6.3)
  // ------------------------------------------------------------------------

  function repartirTravail(e) {
    var Tr = D.regles.travail, comp = composantes(e), avecMaison = new Set(), plebs = 0;
    e.batiments.forEach(function (h) {
      if (!estMaison(h) || h.hab <= 0) return;
      if (h.niv <= Tr.plebeiensNiveauMax) plebs += h.hab;
      for (var y = h.y - 2; y < h.y + h.t + 2; y++) for (var x = h.x - 2; x < h.x + h.t + 2; x++) {
        if (dedans(e, x, y)) { var c = comp[ix(e, x, y)]; if (c) avecMaison.add(c); }
      }
    });
    var travailleurs = Math.floor(plebs * Tr.partTravailleurs);
    var demandes = [], total = 0;
    e.batiments.forEach(function (b) {
      var d = def(b);
      if (!d.effectif) return;
      var relie = false, a = acces(e, b), k;
      for (k = 0; k < a.length && !relie; k++) if (avecMaison.has(comp[a[k]])) relie = true;
      if (!relie && d.sansRoute) {
        // Bâtiment posé sans route (fontaine) : une route à 2 cases ou moins suffit.
        for (var yy = b.y - 2; yy < b.y + b.t + 2 && !relie; yy++) for (var xx = b.x - 2; xx < b.x + b.t + 2; xx++) {
          if (dedans(e, xx, yy) && comp[ix(e, xx, yy)] && avecMaison.has(comp[ix(e, xx, yy)])) { relie = true; break; }
        }
      }
      if (!relie) { b.eff = 0; return; }
      demandes.push(b); total += d.effectif;
    });
    var donnes = 0;
    if (travailleurs >= total) {
      demandes.forEach(function (b) { b.eff = def(b).effectif; });
      donnes = total;
    } else {
      // Proportionnel ; le reste part une place à la fois, dans l'ordre des bâtiments.
      demandes.forEach(function (b) { b.eff = Math.floor(def(b).effectif * travailleurs / total); donnes += b.eff; });
      for (var k = 0; donnes < travailleurs && k < demandes.length; k++) {
        if (demandes[k].eff < def(demandes[k]).effectif) { demandes[k].eff++; donnes++; }
      }
    }
    e.travailleurs = travailleurs;
    e.emplois = donnes;
    e.emploisRequis = total;
    e.chomage = travailleurs > 0 ? Math.round((travailleurs - donnes) * 100 / travailleurs) : 0;
  }

  // Taux de fonctionnement d'un bâtiment (0 à 1), 0 sous le seuil d'arrêt.
  function taux(b) {
    var req = def(b).effectif;
    if (!req) return 1;
    var r = b.eff / req;
    return r * 100 < D.regles.travail.seuilArret ? 0 : r;
  }

  // ------------------------------------------------------------------------
  // Marcheurs
  // ------------------------------------------------------------------------

  function vitesse(type) { return D.regles.vitesses[D.marcheurs[type].vitesse] || D.regles.vitesses.normale; }

  function creerMarcheur(e, type, i, props) {
    var N = e.N, x = i % N, y = (i - x) / N, v = vitesse(type);
    var w = { id: e.prochainId++, type: type, x: x, y: y, nx: x, ny: y, prog: v - 1, v: v, o: 0, dx: 0, dy: 0, attente: 0 };
    if (props) for (var k in props) w[k] = props[k];
    e.marcheurs.push(w);
    e._mIndex.set(w.id, w);
    return w;
  }

  function finir(e, w) {
    if (w.fin) return;
    w.fin = 1;
    e._finis = (e._finis || 0) + 1;
    var o = w.o ? e._index.get(w.o) : null;
    if (o) {
      var d = def(o);
      if (o.m === w.id) { o.m = 0; o.cpt = Math.ceil(D.regles.delaiMarcheurJours / Math.max(0.2, taux(o) || 0.2)); }
      if (o.mA === w.id) o.mA = 0;
      if (o.mV === w.id) { o.mV = 0; o.cptV = D.regles.delaiMarcheurJours; }
      if (d.genre === 'spectacle' && w.type === 'comedien') o.m = 0;
    }
    if ((w.type === 'immigrant' || w.type === 'sansabri') && w.cb) {
      var h = e._index.get(w.cb);
      if (h && estMaison(h)) h.att = Math.max(0, h.att - w.gens);
    }
    if (w.type === 'acteur' && w.cb) {
      var th = e._index.get(w.cb);
      if (th && th.attendu) th.attendu = 0;
    }
    if (w.pompier) {
      var f = e._index.get(w.pompier);
      if (f && f.pompier === w.id) f.pompier = 0;
    }
  }

  function allerVers(e, w, cible) {
    var N = e.N;
    w.dx = (cible % N) - w.x; w.dy = ((cible - (cible % N)) / N) - w.y;
    w.nx = cible % N; w.ny = (cible - (cible % N)) / N;
  }

  function avancerTous(e) {
    var l = e.marcheurs;
    for (var k = 0; k < l.length; k++) {
      var w = l[k];
      if (w.fin) continue;
      if (w.attente > 0) {
        w.attente--;
        if (w.attente === 0 && w.eteint) finirExtinction(e, w);
        continue;
      }
      w.prog++;
      if (w.prog < w.v) continue;
      w.prog = 0;
      w.x = w.nx; w.y = w.ny;
      arrivee(e, w);
    }
    if (e._finis) {
      e.marcheurs = l.filter(function (w) { if (w.fin) { e._mIndex.delete(w.id); return false; } return true; });
      e._finis = 0;
    }
  }

  function arrivee(e, w) {
    var fam = D.marcheurs[w.type].famille;
    if (fam === 'errant' && !w.pompier && !w.retourLibre) return arriveeErrant(e, w);
    return arriveeDestination(e, w);
  }

  // Passable pour un marcheur à destination sur route (les barrières laissent passer).
  function passableRoute(e) { return function (i) { return e.route[i] !== 0; }; }
  // Passable pour un errant (les barrières l'arrêtent).
  function passableErrant(e) { return function (i) { return e.route[i] === R.ROUTE || e.route[i] === R.ROME; }; }
  // Passable hors route : herbe, prairie, arbres, routes ; jamais l'eau, les rochers ou un bâtiment.
  function passableLibre(e) {
    return function (i) { var t = e.terrain[i]; return !e.bat[i] && t !== T.EAU && t !== T.ROCHERS; };
  }

  function suivreChemin(e, w, passable) {
    if (w.ch && w.k < w.ch.length) {
      var s = w.ch[w.k];
      if (!passable(s) && w.k < w.ch.length - 1) return false;
      w.k++;
      allerVers(e, w, s);
      return true;
    }
    return null; // arrivé
  }

  // --- Errants ---------------------------------------------------------------

  function arriveeErrant(e, w) {
    var o = e._index.get(w.o);
    if (!o) { finir(e, w); return; }
    servir(e, w);
    var N = e.N, i = ix(e, w.x, w.y);
    if (w.retour) {
      var r = suivreChemin(e, w, passableErrant(e));
      if (r === true) return;
      if (r === false || acces(e, o).indexOf(i) < 0) {
        var p = parcours(e, [i], passableErrant(e), cibleAcces(e, o), 4 * N);
        if (!p || !p.chemin.length) { finir(e, w); return; }
        w.ch = p.chemin; w.k = 0; suivreChemin(e, w, passableErrant(e));
        return;
      }
      finir(e, w);
      return;
    }
    w.pas++;
    if (w.pas >= w.portee) {
      w.retour = 1;
      if (acces(e, o).indexOf(i) >= 0) { finir(e, w); return; }
      var pr = parcours(e, [i], passableErrant(e), cibleAcces(e, o), 4 * N);
      if (!pr) { finir(e, w); return; }
      w.ch = pr.chemin; w.k = 0; suivreChemin(e, w, passableErrant(e));
      return;
    }
    // Intersection : direction au hasard, sans demi-tour sauf en impasse.
    var opts = [], x = w.x, y = w.y, pe = passableErrant(e);
    var vs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (var k = 0; k < 4; k++) {
      var vx = x + vs[k][0], vy = y + vs[k][1];
      if (!dedans(e, vx, vy) || !pe(ix(e, vx, vy))) continue;
      if (vs[k][0] === -w.dx && vs[k][1] === -w.dy && (w.dx || w.dy)) continue;
      opts.push(ix(e, vx, vy));
    }
    if (!opts.length) {
      var bx = x - w.dx, by = y - w.dy;
      if ((w.dx || w.dy) && dedans(e, bx, by) && pe(ix(e, bx, by))) opts.push(ix(e, bx, by));
    }
    if (!opts.length) { finir(e, w); return; }
    allerVers(e, w, opts.length === 1 ? opts[0] : opts[hasard(e, opts.length)]);
  }

  function cibleAcces(e, b) {
    var l = acces(e, b);
    return function (i) { return l.indexOf(i) >= 0; };
  }

  // Service rendu à chaque case parcourue : bâtiments à 2 cases ou moins.
  var VUS = [];
  function servir(e, w) {
    var svc = D.marcheurs[w.type].service, r = D.regles.serviceRayon, o = e._index.get(w.o);
    if (!svc || !o) return;
    VUS.length = 0;
    for (var y = w.y - r; y <= w.y + r; y++) for (var x = w.x - r; x <= w.x + r; x++) {
      if (!dedans(e, x, y)) continue;
      var id = e.bat[ix(e, x, y)];
      if (!id || VUS.indexOf(id) >= 0) continue;
      VUS.push(id);
      var b = e._index.get(id);
      if (!b) continue;
      var jours = D.regles.serviceJours;
      switch (svc) {
        case 'prefet': b.feu = 0; break;
        case 'ingenieur': b.dom = 0; break;
        case 'impot': if (estMaison(b) && b.hab > 0) b.svc.impot = jours; break;
        case 'religion': if (estMaison(b) && b.hab > 0) b.svc['dieu_' + def(o).dieu] = jours; break;
        case 'spectacle': if (estMaison(b) && b.hab > 0) b.svc[o.type] = jours; break;
        case 'vente': if (estMaison(b) && b.hab > 0) vendre(e, o, b); break;
        default: break;
      }
    }
  }

  function consoMois(h) { return Math.ceil(h.hab * D.regles.maison.nourritureParHabitantMois); }

  // La vendeuse remplit la réserve de la maison (4 mois de consommation au plus).
  function vendre(e, m, h) {
    var types = D.aliments.filter(function (a) { return (m.stocks[a] || 0) > 0; });
    if (!types.length) return;
    var cible = Math.ceil(D.regles.maison.reserveMois * consoMois(h) / types.length);
    types.forEach(function (a) {
      var manque = cible - (h.viv[a] || 0);
      if (manque <= 0) return;
      var q = Math.min(manque, m.stocks[a]);
      m.stocks[a] -= q;
      h.viv[a] = (h.viv[a] || 0) + q;
    });
  }

  // --- Marcheurs à destination -------------------------------------------------

  function arriveeDestination(e, w) {
    var fam = D.marcheurs[w.type];
    var pass = (fam.horsRoute || w.pompier || w.retourLibre) ? passableLibre(e) : passableRoute(e);
    var r = suivreChemin(e, w, pass);
    if (r === true) return;
    if (r === false) { if (!rechercher(e, w)) finir(e, w); return; }
    atteint(e, w);
  }

  // Recalcule le chemin vers la cible courante (route coupée en chemin).
  function rechercher(e, w) {
    var i = ix(e, w.x, w.y), N = e.N, p = null;
    if (w.type === 'immigrant' || (w.type === 'sansabri' && w.cb)) {
      var h = e._index.get(w.cb);
      if (!h) return false;
      var cible = ix(e, h.x, h.y);
      p = parcours(e, [i], passableLibre(e), function (j) { return j === cible; }, 6 * N);
    } else if (w.type === 'emigrant' || w.type === 'sansabri') {
      p = parcours(e, [i], passableLibre(e), function (j) { return j === e.sortie; }, 6 * N);
    } else if (w.pompier) {
      var f = e._index.get(w.pompier);
      if (!f) return false;
      p = parcours(e, [i], passableLibre(e), function (j) { return distRect(f, j % N, (j - j % N) / N) === 1; }, 4 * N);
    } else if (w.retourLibre) {
      var o = e._index.get(w.o);
      if (!o) return false;
      p = parcours(e, [i], passableLibre(e), cibleAcces(e, o), 4 * N);
    } else {
      var c = e._index.get(w.phase === 'retour' ? w.o : w.cb);
      if (!c) return false;
      p = parcours(e, [i], passableRoute(e), cibleAcces(e, c), 4 * N);
    }
    if (!p) return false;
    w.ch = p.chemin; w.k = 0;
    if (!w.ch.length) { atteint(e, w); return true; }
    suivreChemin(e, w, function () { return true; });
    return true;
  }

  function atteint(e, w) {
    var h, o, c, N = e.N, i = ix(e, w.x, w.y);
    switch (w.type) {
      case 'immigrant':
      case 'sansabri':
        if (w.cb) {
          h = e._index.get(w.cb);
          if (h && estMaison(h) && i === ix(e, h.x, h.y)) {
            h.att = Math.max(0, h.att - w.gens);
            var place = capacite(h) - h.hab;
            var entrent = Math.min(place, w.gens);
            if (entrent > 0) { h.hab += entrent; if (h.niv === 0) h.niv = 1; }
            var reste = w.gens - entrent;
            w.cb = 0; w.fin = 0;
            if (reste > 0) creerSansAbri(e, i, reste);
            finir(e, w);
            majPopulation(e);
            return;
          }
          finir(e, w);
          if (w.gens > 0) creerSansAbri(e, i, w.gens);
          return;
        }
        finir(e, w); // a quitté la carte
        return;
      case 'emigrant':
        finir(e, w);
        return;
      case 'livreur':
        o = e._index.get(w.o);
        if (w.phase === 'aller') {
          c = e._index.get(w.cb);
          if (c && c.type === 'grenier' && w.ld) {
            c.attendu = Math.max(0, c.attendu - w.ld.q);
            var libre = D.regles.grenier.capacite - totalStock(c);
            var q = Math.min(libre, w.ld.q);
            c.stocks[w.ld.g] = (c.stocks[w.ld.g] || 0) + q;
            w.ld.q -= q;
          }
          if (w.ld && w.ld.q > 0) {
            // Grenier disparu ou plein : chercher un autre grenier.
            var g = chercherGrenier(e, i, w.ld.q);
            if (g) { w.cb = g.b.id; g.b.attendu += w.ld.q; w.ch = g.chemin; w.k = 0; suivreChemin(e, w, passableRoute(e)); return; }
          }
          w.ld = null;
          if (!o) { finir(e, w); return; }
          w.phase = 'retour';
          if (!rechercher(e, w)) finir(e, w);
          return;
        }
        finir(e, w);
        return;
      case 'acheteuse':
        o = e._index.get(w.o);
        if (w.phase === 'aller') {
          c = e._index.get(w.cb);
          if (c && c.type === 'grenier') {
            var choix = null;
            D.aliments.forEach(function (a) {
              if ((c.stocks[a] || 0) > 0 && (!choix || (o && (o.stocks[a] || 0) < (o.stocks[choix] || 0)))) choix = a;
            });
            if (choix) {
              var pris = Math.min(D.regles.maison.uniteParCharge, c.stocks[choix]);
              c.stocks[choix] -= pris;
              w.ld = { g: choix, q: pris };
            }
          }
          if (!o) { finir(e, w); return; }
          w.phase = 'retour';
          if (!rechercher(e, w)) finir(e, w);
          return;
        }
        if (o && w.ld) o.stocks[w.ld.g] = (o.stocks[w.ld.g] || 0) + w.ld.q;
        finir(e, w);
        return;
      case 'acteur':
        c = e._index.get(w.cb);
        if (c && c.type === 'theatre') { c.spect = D.regles.spectacle.dureeJours; c.attendu = 0; }
        w.cb = 0;
        finir(e, w);
        return;
      default:
        if (w.pompier) {
          var f = e._index.get(w.pompier);
          if (f && f.type === 'incendie') {
            w.eteint = f.id;
            w.attente = D.regles.feu.extinctionJours * D.temps.ticksParJour;
            return;
          }
          w.pompier = 0;
          retourLibre(e, w);
          return;
        }
        if (w.retourLibre) { finir(e, w); return; }
        finir(e, w);
    }
  }

  function retourLibre(e, w) {
    w.retourLibre = 1;
    if (!rechercher(e, w)) finir(e, w);
  }

  function finirExtinction(e, w) {
    var f = e._index.get(w.eteint);
    w.eteint = 0;
    if (f && f.type === 'incendie') {
      f.pompier = 0;
      remplacer(e, f, 'ruines');
      noter(e, 'msg.feuEteint', {}, false, ix(e, f.x, f.y));
    }
    w.pompier = 0;
    retourLibre(e, w);
  }

  function totalStock(b) {
    var s = 0;
    for (var k in b.stocks) s += b.stocks[k];
    return s;
  }

  // Grenier le plus proche par la route qui a de la place pour q unités.
  function chercherGrenier(e, depart, q) {
    var N = e.N, cap = D.regles.grenier.capacite, cibles = new Map();
    e.batiments.forEach(function (b) {
      if (b.type !== 'grenier' || taux(b) <= 0) return;
      if (totalStock(b) + b.attendu + q > cap) return;
      acces(e, b).forEach(function (i) { if (!cibles.has(i)) cibles.set(i, b); });
    });
    if (!cibles.size) return null;
    var sources = Array.isArray(depart) ? depart : [depart];
    var p = parcours(e, sources, passableRoute(e), function (i) { return cibles.has(i); }, 6 * N);
    if (!p) return null;
    return { b: cibles.get(p.fin), chemin: p.chemin, depart: p.depart };
  }

  // Sans-abri : cherche une maison qui a de la place, sinon quitte la carte.
  function creerSansAbri(e, i, gens) {
    var groupe = D.regles.emigration.groupeMax;
    while (gens > 0) {
      var g = Math.min(groupe, gens);
      gens -= g;
      var w = creerMarcheur(e, 'sansabri', i, { gens: g, cb: 0, ch: null, k: 0 });
      var h = maisonLibre(e, g);
      if (h) {
        var cible = ix(e, h.x, h.y);
        var p = parcours(e, [i], passableLibre(e), function (j) { return j === cible; }, 6 * e.N);
        if (p) { w.cb = h.id; h.att += g; w.ch = p.chemin; w.k = 0; continue; }
      }
      var ps = parcours(e, [i], passableLibre(e), function (j) { return j === e.sortie; }, 8 * e.N);
      if (ps) { w.ch = ps.chemin; w.k = 0; } else finir(e, w);
    }
  }

  function maisonLibre(e, g) {
    var meilleur = null;
    for (var k = 0; k < e.batiments.length; k++) {
      var h = e.batiments[k];
      if (!estMaison(h) || h.sansRoute > 0) continue;
      if (capacite(h) - h.hab - h.att >= Math.min(g, 1)) { meilleur = h; break; }
    }
    return meilleur;
  }

  // ------------------------------------------------------------------------
  // Quotidien d'un bâtiment (étalé : chaque bâtiment a son tick du jour)
  // ------------------------------------------------------------------------

  function quotidien(e, b) {
    var d = def(b), m = mission(e), diff = D.difficultes[e.difficulte] || D.difficultes.normal;
    // Risques (feu, effondrement), si la mission les active.
    if (m.risques && d.genre !== 'ruines' && d.genre !== 'incendie') {
      var climat = D.regles.feu.climats[m.climat] || 1;
      var hf = estMaison(b) ? (b.hab > 0 ? niveauDef(b).feu : 0) : (d.feu || 0);
      var hd = estMaison(b) ? (b.hab > 0 ? niveauDef(b).dommages : 0) : (d.dommages || 0);
      b.feu = Math.min(10000, b.feu + Math.round(hf * 100 * climat * diff.degradation));
      b.dom = Math.min(10000, b.dom + Math.round(hd * 100 * diff.degradation));
      var sf = D.regles.feu.seuil * 100, sd = D.regles.effondrement.seuil * 100;
      if (b.feu > sf && hasard(e, 10000) < b.feu - sf) { enflammer(e, b); return; }
      if (b.dom > sd && hasard(e, 10000) < b.dom - sd) { effondrer(e, b); return; }
    }
    if (b.cpt > 0) b.cpt--;
    switch (d.genre) {
      case 'maison': quotidienMaison(e, b); break;
      case 'service': if (!b.m && !b.cpt) emettreErrant(e, b, d.marcheur); break;
      case 'ferme': quotidienFerme(e, b, d); break;
      case 'marche': quotidienMarche(e, b); break;
      case 'spectacle':
        if (b.spect > 0) b.spect--;
        if (b.spect > 0 && !b.m && !b.cpt) emettreErrant(e, b, d.marcheur);
        break;
      case 'ecole_art': quotidienEcoleArt(e, b, d); break;
      case 'incendie': quotidienIncendie(e, b); break;
      default: break;
    }
  }

  function emettreErrant(e, b, type) {
    if (taux(b) <= 0) return null;
    var s = sortiesErrant(e, b);
    if (!s.length) return null;
    var dep = s[b.sortie % s.length];
    b.sortie++;
    var w = creerMarcheur(e, type, dep, { o: b.id, pas: 0, portee: D.regles.porteeErrant, retour: 0, ch: null, k: 0 });
    b.m = w.id;
    return w;
  }

  function quotidienMaison(e, h) {
    var M = D.regles.maison;
    for (var k in h.svc) if (h.svc[k] > 0) h.svc[k]--;
    if (h.hab <= 0) { h.ok = 0; h.manque = 0; return; }
    // Sans route proche : la maison se vide en un mois.
    if (!routeProche(e, h, D.regles.logementDistanceRoute)) {
      h.sansRoute++;
      if (h.sansRoute >= M.sansRouteJours) {
        var n = h.hab; h.hab = 0; h.niv = 0; h.viv = {};
        creerSansAbri(e, ix(e, h.x, h.y), n);
        h.sansRoute = 0;
        majPopulation(e);
      }
      return;
    }
    h.sansRoute = 0;
    var s = satisfaits(e, h);
    var cur = niveauDef(h), suiv = D.maisons[h.niv];
    if (!remplit(s, cur.besoinsCumul)) {
      h.ok = 0; h.manque++;
      if (h.manque >= M.joursDescente && h.niv > 1) {
        h.niv--; h.manque = 0;
        var trop = h.hab - capacite(h);
        if (trop > 0) { h.hab -= trop; creerSansAbri(e, ix(e, h.x, h.y), trop); majPopulation(e); }
        noter(e, 'msg.maisonDescend', { niveau: h.niv }, false, ix(e, h.x, h.y));
      }
      return;
    }
    h.manque = 0;
    if (suiv && suiv.emprise === 1 && remplit(s, suiv.besoinsCumul)) {
      h.ok++;
      if (h.ok >= M.joursMontee) { h.niv++; h.ok = 0; }
    } else h.ok = 0;
  }

  // Besoins satisfaits d'une maison (valeurs comparées aux besoins des données).
  function satisfaits(e, h) {
    var i = ix(e, h.x, h.y), s = {};
    s.eau = e.eauFontaine[i] ? 2 : e.eauPuits[i] ? 1 : 0;
    var n = 0;
    D.aliments.forEach(function (a) { if ((h.viv[a] || 0) > 0) n++; });
    s.nourriture = n;
    var dieux = 0, divert = 0;
    for (var k in h.svc) {
      if (h.svc[k] <= 0) continue;
      if (k.indexOf('dieu_') === 0) dieux++;
      else if (D.batiments[k] && D.batiments[k].points) divert += D.batiments[k].points;
      else s[k] = 1;
    }
    s.religion = dieux;
    s.divertissement = Math.min(D.regles.divertissementMax, divert);
    for (var g in h.viv) if (!D.biens[g] || D.aliments.indexOf(g) < 0) { if (h.viv[g] > 0) s[g] = 1; }
    return s;
  }

  function remplit(s, besoins) {
    for (var k in besoins) if ((s[k] || 0) < besoins[k]) return false;
    return true;
  }

  // Pour le panneau d'information : besoins satisfaits et ce qui manque pour monter.
  function infosMaison(e, h) {
    var s = satisfaits(e, h), suiv = h.niv >= 1 ? D.maisons[h.niv] : null, manque = [];
    if (suiv) {
      var b = suiv.besoinsCumul;
      for (var k in b) if ((s[k] || 0) < b[k]) manque.push({ besoin: k, requis: b[k], actuel: s[k] || 0 });
    }
    return { satisfaits: s, manque: manque, suivant: suiv ? suiv.niveau : null, conso: consoMois(h) };
  }

  function quotidienFerme(e, b, d) {
    var fin = D.regles.ferme.progressionCharge;
    var r = taux(b);
    if (b.prog < fin && r > 0) {
      var fert = 0, n = 0;
      for (var y = b.y; y < b.y + b.t; y++) for (var x = b.x; x < b.x + b.t; x++) { fert += e.fertilite[ix(e, x, y)]; n++; }
      fert = fert / n;
      b.prog = Math.min(fin, b.prog + Math.floor(fin * d.chargesParAn * r * fert / (D.joursParAn * 100)));
    }
    if (b.prog >= fin && b.stock < 1) { b.stock = 1; b.prog = 0; }
    if (b.stock >= 1 && !b.m && r > 0) {
      var a = acces(e, b);
      if (!a.length) return;
      var q = D.regles.maison.uniteParCharge;
      var g = chercherGrenier(e, a, q);
      if (!g) return;
      var w = creerMarcheur(e, 'livreur', g.depart, { o: b.id, cb: g.b.id, phase: 'aller', ld: { g: d.produit, q: q }, ch: g.chemin, k: 0 });
      g.b.attendu += q;
      b.m = w.id;
      b.stock = 0;
    }
  }

  function quotidienMarche(e, b) {
    var Mr = D.regles.marche, r = taux(b);
    if (b.cptV > 0) b.cptV--;
    if (r <= 0) return;
    var a = acces(e, b);
    if (!a.length) return;
    // Acheteuse : au grenier le plus proche (40 cases de route au plus) qui a de la nourriture.
    if (!b.mA && totalStock(b) < Mr.seuilAchat) {
      var cibles = new Map();
      e.batiments.forEach(function (g) {
        if (g.type !== 'grenier' || totalStock(g) <= 0) return;
        acces(e, g).forEach(function (i) { if (!cibles.has(i)) cibles.set(i, g); });
      });
      if (cibles.size) {
        var p = parcours(e, a, passableRoute(e), function (i) { return cibles.has(i); }, Mr.porteeAcheteuse);
        if (p) {
          var w = creerMarcheur(e, 'acheteuse', p.depart, { o: b.id, cb: cibles.get(p.fin).id, phase: 'aller', ld: null, ch: p.chemin, k: 0 });
          b.mA = w.id;
        }
      }
    }
    // Vendeuse : errante, tant que le marché a du stock.
    if (!b.mV && !b.cptV && totalStock(b) > 0) {
      var s = sortiesErrant(e, b);
      if (s.length) {
        var v = creerMarcheur(e, 'vendeuse', s[b.sortie % s.length], { o: b.id, pas: 0, portee: D.regles.porteeErrant, retour: 0, ch: null, k: 0 });
        b.sortie++;
        b.mV = v.id;
      }
    }
  }

  function quotidienEcoleArt(e, b, d) {
    var S = D.regles.spectacle, fin = D.regles.ferme.progressionCharge, r = taux(b);
    if (r <= 0) return;
    if (b.prog < fin) b.prog = Math.min(fin, b.prog + Math.floor(fin * r / S.formationJours));
    if (b.prog < fin || b.m) return;
    var a = acces(e, b);
    if (!a.length) return;
    // Lieu de spectacle qui manque d'artiste (spectacle fini ou presque, aucun artiste en route).
    var cibles = new Map();
    e.batiments.forEach(function (t) {
      var dt = def(t);
      if (dt.artiste !== d.forme || t.attendu || t.spect > S.rappelJours) return;
      acces(e, t).forEach(function (i) { if (!cibles.has(i)) cibles.set(i, t); });
    });
    if (!cibles.size) return;
    var p = parcours(e, a, passableRoute(e), function (i) { return cibles.has(i); }, 6 * e.N);
    if (!p) return;
    var th = cibles.get(p.fin);
    var w = creerMarcheur(e, d.forme, p.depart, { o: b.id, cb: th.id, phase: 'aller', ch: p.chemin, k: 0 });
    th.attendu = w.id;
    b.m = w.id;
    b.prog = 0;
  }

  // ------------------------------------------------------------------------
  // Feu et effondrement
  // ------------------------------------------------------------------------

  function enflammer(e, b) {
    var f = remplacer(e, b, 'incendie');
    f.jours = D.regles.feu.dureeJours;
    e.stats.incendies++;
    calculerEau(e);
    majPopulation(e);
    noter(e, 'msg.incendie', {}, true, ix(e, f.x, f.y));
    return f;
  }

  function effondrer(e, b) {
    var g = remplacer(e, b, 'gravats');
    e.stats.effondrements++;
    calculerEau(e);
    majPopulation(e);
    noter(e, 'msg.effondrement', {}, true, ix(e, g.x, g.y));
  }

  function quotidienIncendie(e, f) {
    f.jours--;
    // Propagation : 10 % de chances par jour pour chaque bâtiment voisin.
    var vus = [];
    for (var y = f.y - 1; y <= f.y + f.t; y++) for (var x = f.x - 1; x <= f.x + f.t; x++) {
      if (!dedans(e, x, y)) continue;
      var id = e.bat[ix(e, x, y)];
      if (!id || id === f.id || vus.indexOf(id) >= 0) continue;
      vus.push(id);
    }
    for (var k = 0; k < vus.length; k++) {
      var b = e._index.get(vus[k]);
      if (!b) continue;
      var g = def(b).genre;
      if (g === 'incendie' || g === 'ruines' || g === 'puits' || g === 'reservoir' || g === 'fontaine') continue;
      if (estMaison(b) && b.hab <= 0) continue;
      if (hasard(e, 100) < D.regles.feu.propagationPct) enflammer(e, b);
    }
    if (f.jours <= 0 && e._index.get(f.id)) remplacer(e, f, 'ruines');
  }

  // Le préfet le plus proche (15 cases au plus) court vers chaque feu sans pompier.
  function envoyerPompiers(e) {
    var feux = e.batiments.filter(function (b) { return b.type === 'incendie' && !b.pompier; });
    if (!feux.length) return;
    var R0 = D.regles.feu.rayonPrefet, N = e.N;
    feux.forEach(function (f) {
      var meilleur = null, dm = R0 + 1;
      e.marcheurs.forEach(function (w) {
        if (w.fin || w.type !== 'prefet' || w.pompier || w.eteint || w.retourLibre) return;
        var dd = distRect(f, w.x, w.y);
        if (dd < dm) { dm = dd; meilleur = w; }
      });
      if (!meilleur) return;
      var p = parcours(e, [ix(e, meilleur.x, meilleur.y)], passableLibre(e), function (j) { return distRect(f, j % N, (j - j % N) / N) === 1; }, 4 * N);
      if (!p) return;
      meilleur.pompier = f.id;
      meilleur.v = D.regles.vitesses.rapide;
      meilleur.ch = p.chemin; meilleur.k = 0;
      f.pompier = meilleur.id;
    });
  }

  // ------------------------------------------------------------------------
  // Population, immigration, émigration
  // ------------------------------------------------------------------------

  function majPopulation(e) {
    var p = 0;
    for (var k = 0; k < e.batiments.length; k++) { var h = e.batiments[k]; if (estMaison(h)) p += h.hab; }
    e.pop = p;
    return p;
  }

  function placesLibres(e) {
    var l = 0;
    e.batiments.forEach(function (h) { if (estMaison(h) && !h.sansRoute) l += Math.max(0, capacite(h) - h.hab - h.att); });
    return l;
  }

  // Chaque jour, une part du quota mensuel d'immigrants entre par la voie de Rome.
  function immigrer(e) {
    var I = D.regles.immigration, J = D.temps.joursParMois;
    if (e.humeur < I.humeurMin) { e.creditImmigration = 0; return; }
    var quota = Math.floor(e.pop * I.partPopulation) + I.base;
    e.creditImmigration = Math.min(quota * J, e.creditImmigration + quota);
    if (e.creditImmigration < J) return;
    // Maisons qui ont de la place, dans l'ordre de construction ; une recherche de chemin
    // donne toutes les maisons accessibles depuis la voie de Rome.
    var libres = new Map();
    e.batiments.forEach(function (h) {
      if (estMaison(h) && !h.sansRoute && capacite(h) - h.hab - h.att > 0) libres.set(ix(e, h.x, h.y), h);
    });
    if (!libres.size) return;
    var n = Math.min(8, Math.ceil(e.creditImmigration / J / I.groupeMax) + 1);
    var l = parcoursMulti(e, [e.entree], passableLibre(e), function (j) { return libres.has(j); }, 6 * e.N, n);
    for (var k = 0; k < l.length && e.creditImmigration >= J; k++) {
      var h = libres.get(l[k].fin);
      var g = Math.min(I.groupeMax, Math.floor(e.creditImmigration / J), capacite(h) - h.hab - h.att);
      if (g <= 0) continue;
      creerMarcheur(e, 'immigrant', e.entree, { gens: g, cb: h.id, ch: l[k].chemin, k: 0 });
      h.att += g;
      e.creditImmigration -= g * J;
    }
  }

  function emigrer(e) {
    var Em = D.regles.emigration;
    if (e.humeur >= Em.humeurMax || e.pop <= 0) return;
    var n = Math.ceil(e.pop * Em.part);
    var maisons = e.batiments.filter(function (h) { return estMaison(h) && h.hab > 0; });
    maisons.sort(function (a, b) { return a.niv - b.niv || a.id - b.id; });
    for (var k = 0; k < maisons.length && n > 0; k++) {
      var h = maisons[k], q = Math.min(n, h.hab, Em.groupeMax);
      h.hab -= q; n -= q;
      if (h.hab === 0) { h.niv = 0; h.viv = {}; }
      var i = ix(e, h.x, h.y);
      var w = creerMarcheur(e, 'emigrant', i, { gens: q, ch: null, k: 0 });
      var p = parcours(e, [i], passableLibre(e), function (j) { return j === e.sortie; }, 8 * e.N);
      if (p) { w.ch = p.chemin; } else finir(e, w);
    }
    majPopulation(e);
  }

  // ------------------------------------------------------------------------
  // Mois : nourriture, impôts, salaires, humeur
  // ------------------------------------------------------------------------

  function consommer(e) {
    e.batiments.forEach(function (h) {
      if (!estMaison(h) || h.hab <= 0) return;
      var besoin = consoMois(h);
      var types = D.aliments.filter(function (a) { return (h.viv[a] || 0) > 0; });
      for (var k = 0; k < types.length && besoin > 0; k++) {
        var part = Math.ceil(besoin / (types.length - k));
        var q = Math.min(part, h.viv[types[k]]);
        h.viv[types[k]] -= q; besoin -= q;
      }
    });
  }

  function groupeDe(h) { return h.niv > 0 ? niveauDef(h).groupe : null; }

  function finances(e) {
    var I = D.regles.impot, S = D.regles.salaire, total = 0;
    e.batiments.forEach(function (h) {
      if (!estMaison(h) || h.hab <= 0 || !(h.svc.impot > 0)) return;
      total += h.hab * niveauDef(h).impot * e.impot / I.diviseur / D.temps.moisParAn;
    });
    var salaires = e.emplois * e.salaire / S.diviseur;
    var net = total - salaires + e.reliquat;
    var entier = Math.floor(net);
    e.reliquat = net - entier;
    e.tresor += entier;
    e.finances.an.impots += total;
    e.finances.an.salaires += salaires;
  }

  function variationHumeur(e) {
    var H = D.regles.humeur, m = mission(e), ignore = m.humeurIgnore || [], v = 0, det = {};
    if (e.pop < (H.populationMin || 0)) return { total: 0, detail: det };
    if (ignore.indexOf('chomage') < 0) {
      for (var k = 0; k < H.chomage.length; k++) if (e.chomage <= H.chomage[k][0]) { det.chomage = H.chomage[k][1]; break; }
    }
    var ds = e.salaire - e.salaireRome;
    if (ds >= H.salairePas) det.salaire = Math.min(H.salaireBonusMax, Math.floor(ds / H.salairePas));
    else if (ds <= -H.salairePas) det.salaire = -Math.min(H.salaireMalusMax, Math.floor(-ds / H.salairePas));
    if (e.impot <= H.impotBonusJusqua) det.impot = 1;
    else if (e.impot > H.impotNeutreJusqua) det.impot = -(1 + Math.floor((e.impot - H.impotNeutreJusqua - 1) / H.impotPas));
    // Pénurie : maisons dont le niveau exige de la nourriture (section 7.5) et dont la réserve est vide.
    var habitees = 0, affamees = 0, tentes = 0;
    e.batiments.forEach(function (h) {
      if (!estMaison(h) || h.hab <= 0) return;
      habitees++;
      if (niveauDef(h).besoinsCumul.nourriture && satisfaits(e, h).nourriture === 0) affamees++;
      if (h.niv <= H.tentesNiveauMax) tentes += h.hab;
    });
    if (ignore.indexOf('penurie') < 0 && habitees && affamees * 100 > habitees * H.penuriePart) det.penurie = H.penurieVariation;
    if (e.pop && tentes * 100 > e.pop * H.tentesPart) det.tentes = H.tentesVariation;
    for (var c in det) v += det[c];
    return { total: v, detail: det };
  }

  // Le mois est découpé en quatre temps, joués à des ticks différents du premier jour
  // (étalement de la charge) : nourriture, finances, humeur et départs, bilan.
  function moisNourriture(e) { consommer(e); }
  function moisFinances(e) {
    finances(e);
    // Secours de l'empereur : premier passage sous 0 (section 11.4).
    if (e.tresor < 0 && !e.secoursRecu && D.regles.secours) {
      e.secoursRecu = true;
      e.tresor += D.regles.secours.montant;
      noter(e, 'msg.secours', { montant: D.regles.secours.montant }, true);
    }
  }
  function moisHumeur(e) {
    // Variation du barème (section 6.2), puis rappel vers l'humeur de départ (réglage « retour » :
    // sans lui, l'humeur ne ferait que s'accumuler ; écart noté dans le cahier).
    var vh = variationHumeur(e), H = D.regles.humeur;
    var hum = e.humeur + vh.total;
    hum += Math.trunc((H.depart - hum) * (H.retour || 0));
    e.humeur = Math.max(0, Math.min(100, hum));
    e._humeurDetail = vh.detail;
    emigrer(e);
  }
  function moisBilan(e) {
    var moisEcoules = Math.floor(e.tick / D.ticksParMois);
    e.histo.push({ m: moisEcoules, pop: e.pop, tresor: e.tresor, humeur: e.humeur });
    if (e.histo.length > 240) e.histo.shift();
    if (moisEcoules > 0 && moisEcoules % D.temps.moisParAn === 0) {
      e.finances.prec = e.finances.an;
      e.finances.an = nouveauBudget();
      noter(e, 'msg.nouvelleAnnee', { annee: date(e).annee }, false);
    }
    verifierFin(e, moisEcoules);
  }
  function nouveauMois(e) { moisNourriture(e); moisFinances(e); moisHumeur(e); moisBilan(e); }

  // ------------------------------------------------------------------------
  // Tutoriel, victoire, défaite
  // ------------------------------------------------------------------------

  function compter(e, type) {
    var n = 0;
    for (var k = 0; k < e.batiments.length; k++) if (e.batiments[k].type === type) n++;
    return n;
  }
  function maisonsNiveau(e, niv) {
    var n = 0;
    for (var k = 0; k < e.batiments.length; k++) { var h = e.batiments[k]; if (estMaison(h) && h.hab > 0 && h.niv >= niv) n++; }
    return n;
  }

  // Avancement d'une condition : { fait, valeur, cible }.
  function condition(e, c) {
    if (c.compte) { var n = compter(e, c.compte); return { fait: n >= c.min, valeur: n, cible: c.min }; }
    if (c.maisonsNiveau) { var m = maisonsNiveau(e, c.maisonsNiveau); return { fait: m >= c.min, valeur: m, cible: c.min }; }
    if (c.population) return { fait: e.pop >= c.population, valeur: e.pop, cible: c.population };
    return { fait: false, valeur: 0, cible: 1 };
  }

  function verifierTutoriel(e) {
    var m = mission(e);
    if (e.tutoFini || !m.tutoriel) return;
    var garde = 0;
    while (e.tuto < m.tutoriel.length && garde++ < 20) {
      var etape = m.tutoriel[e.tuto];
      if (!condition(e, etape.condition).fait) return;
      (etape.debloque || []).forEach(function (k) { if (e.debloques.indexOf(k) < 0) e.debloques.push(k); });
      noter(e, 'msg.etapeFaite', { etape: e.tuto + 1 }, false);
      e.tuto++;
      e._v = (e._v || 0) + 1;
    }
    if (e.tuto >= m.tutoriel.length) e.tutoFini = true;
  }

  function objectifs(e) {
    var m = mission(e), o = m.objectifs || {}, l = [];
    Object.keys(o).forEach(function (k) {
      var val = k === 'population' ? e.pop : (e.cotes && typeof e.cotes[k] === 'number' ? e.cotes[k] : 0);
      l.push({ cle: k, valeur: val, cible: o[k], fait: val >= o[k] });
    });
    return l;
  }

  function verifierFin(e, moisEcoules) {
    if (e.victoire || e.defaite || e.libre) return;
    var m = mission(e), ob = objectifs(e);
    if (ob.length && ob.every(function (x) { return x.fait; })) {
      var etoiles = 1 + (e.secoursRecu ? 0 : 1) + (m.dateCibleMois && moisEcoules <= m.dateCibleMois ? 1 : 0);
      e.victoire = { tick: e.tick, mois: moisEcoules, etoiles: etoiles };
      noter(e, 'msg.victoire', {}, true);
      return;
    }
    if (m.limiteMois && moisEcoules >= m.limiteMois) { e.defaite = { tick: e.tick, cause: 'delai' }; noter(e, 'msg.defaite', {}, true); return; }
    var A = D.regles.aneantie;
    if (moisEcoules >= A.moisMin && e.pop === 0 && e.tresor <= D.regles.detteMax) { e.defaite = { tick: e.tick, cause: 'aneantie' }; noter(e, 'msg.defaite', {}, true); }
  }

  // ------------------------------------------------------------------------
  // Pas de simulation
  // ------------------------------------------------------------------------

  function verifierVictoire(e) {
    if (e.victoire || e.defaite || e.libre) return;
    var ob = objectifs(e);
    if (ob.length && ob.every(function (x) { return x.fait; })) verifierFin(e, Math.floor(e.tick / D.ticksParMois));
  }
  function nouveauJour(e) {
    repartirTravail(e); calculerEau(e); envoyerPompiers(e); immigrer(e);
    majPopulation(e); verifierTutoriel(e); verifierVictoire(e);
  }

  // Temps de la journée (ticks) où se font les calculs globaux, étalés pour éviter les à-coups.
  var PHASES = { travail: 0, eau: 10, pompiers: 20, immigration: 25, bilan: 35, nourriture: 5, finances: 15, humeur: 30, mois: 40 };

  function pas(e) {
    e.tick++;
    var J = D.temps.ticksParJour, phase = e.tick % J;
    var premierJour = Math.floor(e.tick / J) % D.temps.joursParMois === 0 && e.tick >= J;
    if (phase === PHASES.travail) repartirTravail(e);
    else if (phase === PHASES.eau) calculerEau(e);
    else if (phase === PHASES.pompiers) envoyerPompiers(e);
    else if (phase === PHASES.immigration) immigrer(e);
    else if (phase === PHASES.bilan) { majPopulation(e); verifierTutoriel(e); verifierVictoire(e); }
    if (premierJour) {
      if (phase === PHASES.nourriture) moisNourriture(e);
      else if (phase === PHASES.finances) moisFinances(e);
      else if (phase === PHASES.humeur) moisHumeur(e);
      else if (phase === PHASES.mois) moisBilan(e);
    }
    // Chaque bâtiment vit sa journée à son propre tick (étalement de la charge).
    var l = e.batiments;
    for (var k = 0; k < l.length; k++) {
      var b = l[k];
      if (b.id % J === phase) {
        quotidien(e, b);
        if (l[k] !== b) k--; // le bâtiment a été remplacé (feu…) : la liste a bougé
      }
    }
    avancerTous(e);
  }

  // ------------------------------------------------------------------------
  // Informations pour l'interface
  // ------------------------------------------------------------------------

  function date(e) {
    var j = Math.floor(e.tick / D.temps.ticksParJour), m = mission(e);
    var mois = (m.mois || 0) + Math.floor(j / D.temps.joursParMois);
    return { mois: mois % D.temps.moisParAn, annee: (m.annee || 0) + Math.floor(mois / D.temps.moisParAn), jour: j % D.temps.joursParMois };
  }

  // Cause de l'arrêt d'un bâtiment (section 8.4), ou null s'il est en service.
  function cause(e, b) {
    var d = def(b);
    if (d.genre === 'maison' || d.genre === 'ruines' || d.genre === 'incendie' || d.genre === 'puits') return null;
    if (d.genre === 'reservoir') return b.plein ? null : 'sansEau';
    if (!d.sansRoute && !acces(e, b).length) return 'pasDeRoute';
    if (d.effectif && taux(b) <= 0) return 'pasDePersonnel';
    if (d.genre === 'fontaine' && !b.actif) return 'sansEau';
    if (d.genre === 'ferme' && b.stock >= 1 && !b.m) return 'sansPreneur';
    if (d.genre === 'marche' && totalStock(b) <= 0 && !b.mA) return 'sansMarchandise';
    if (d.genre === 'spectacle' && b.spect <= 0) return 'sansArtiste';
    return null;
  }

  // Invariants vérifiés en mode test (section 19.5).
  function invariants(e) {
    var pb = [], pop = 0;
    e.batiments.forEach(function (b) {
      if (estMaison(b)) {
        if (b.hab < 0) pb.push('maison ' + b.id + ' : habitants négatifs');
        if (b.hab > capacite(b)) pb.push('maison ' + b.id + ' : trop d\'habitants');
        pop += b.hab;
        for (var k in b.viv) if (b.viv[k] < 0) pb.push('maison ' + b.id + ' : réserve négative');
      }
      if (b.stocks) for (var s in b.stocks) if (b.stocks[s] < 0) pb.push(b.type + ' ' + b.id + ' : stock négatif');
      if (b.type === 'grenier' && totalStock(b) > D.regles.grenier.capacite) pb.push('grenier ' + b.id + ' : stock au-delà de la capacité');
    });
    e.marcheurs.forEach(function (w) {
      if (!dedans(e, w.x, w.y) || !dedans(e, w.nx, w.ny)) pb.push('marcheur ' + w.id + ' hors carte');
    });
    if (pop !== e.pop) pb.push('population ' + e.pop + ' ≠ somme des maisons ' + pop);
    return pb;
  }

  // ------------------------------------------------------------------------
  // Sauvegarde : export et import, avec version
  // ------------------------------------------------------------------------

  function versB64(arr) {
    var u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), s = '', P = 0x8000;
    for (var i = 0; i < u8.length; i += P) s += String.fromCharCode.apply(null, u8.subarray(i, i + P));
    return btoa(s);
  }
  function deB64(txt, Type) {
    var s = atob(txt), u8 = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return new Type(u8.buffer);
  }
  var TYPES = { u8: Uint8Array, i32: Int32Array };

  function exporter(e) {
    var o = {};
    Object.keys(e).forEach(function (k) {
      if (k.charAt(0) === '_') return;
      var v = e[k];
      if (v instanceof Uint8Array) o[k] = { __t: 'u8', d: versB64(v) };
      else if (v instanceof Int32Array) o[k] = { __t: 'i32', d: versB64(v) };
      else o[k] = v;
    });
    return JSON.stringify(o);
  }

  function importer(txt) {
    var o = typeof txt === 'string' ? JSON.parse(txt) : txt;
    if (!o || typeof o !== 'object') throw new Error('sauvegarde illisible');
    if (o.v !== VERSION_ETAT) throw new Error('version de sauvegarde inconnue : ' + o.v);
    if (!MISSIONS[o.mission]) throw new Error('mission inconnue : ' + o.mission);
    var e = {};
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (v && typeof v === 'object' && v.__t && TYPES[v.__t]) e[k] = deB64(v.d, TYPES[v.__t]);
      else e[k] = v;
    });
    var n = e.N * e.N;
    ['terrain', 'fertilite', 'route', 'aqueduc', 'bat', 'eauPuits', 'eauFontaine'].forEach(function (k) {
      if (!e[k] || e[k].length !== n) throw new Error('sauvegarde abîmée : ' + k);
    });
    reconstruireCaches(e);
    return e;
  }

  // Empreinte FNV-1a de l'état sérialisé (tests de déterminisme).
  function empreinte(e) {
    var s = exporter(e), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }

  racine.MM_SIM = {
    VERSION_ETAT: VERSION_ETAT, T: T, R: R,
    charger: charger,
    donnees: function () { return D; },
    missions: function () { return D.missions; },
    mission: mission,
    nouvelle: nouvelle,
    pas: pas,
    appliquer: appliquer,
    peutPlacer: peutPlacer,
    cause: cause,
    infosMaison: infosMaison,
    satisfaits: satisfaits,
    capacite: capacite,
    taux: taux,
    acces: acces,
    batA: batA,
    marcheur: function (e, id) { return e._mIndex.get(id) || null; },
    batiment: function (e, id) { return e._index.get(id) || null; },
    date: date,
    objectifs: objectifs,
    condition: condition,
    placesLibres: placesLibres,
    variationHumeur: variationHumeur,
    totalStock: totalStock,
    invariants: invariants,
    exporter: exporter,
    importer: importer,
    empreinte: empreinte,
    majPopulation: majPopulation,
    calculerEau: calculerEau,
    repartirTravail: repartirTravail,
    // Outils réservés aux villes d'exemple (affiche, aperçus) et aux tests : jamais appelés par le joueur.
    _outils: {
      creerBatiment: creerBatiment, creerMarcheur: creerMarcheur, emettreErrant: emettreErrant, ix: ix, noter: noter,
      finances: finances, consommer: consommer, quotidien: quotidien, nouveauMois: nouveauMois, nouveauJour: nouveauJour,
      enflammer: enflammer, immigrer: immigrer, verifierTutoriel: verifierTutoriel, composantes: composantes
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
