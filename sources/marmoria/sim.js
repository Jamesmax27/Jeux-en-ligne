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

  var VERSION_ETAT = 2; // 2 : lot 2 (économie) ; une sauvegarde de version 1 est complétée à l'import

  // Énumérations (codes de couches, pas des règles de jeu).
  var T = { HERBE: 0, PRAIRIE: 1, ARBRES: 2, ROCHERS: 3, EAU: 4 };
  var R = { AUCUNE: 0, ROUTE: 1, BARRIERE: 2, ROME: 3, PLACE: 4 };
  var GENRES = ['maison', 'outil', 'route', 'barriere', 'puits', 'fontaine', 'reservoir', 'aqueduc', 'ferme', 'extraction', 'peche',
    'atelier', 'grenier', 'entrepot', 'marche', 'service', 'spectacle', 'ecole_art', 'oracle', 'deco', 'place', 'ruines', 'incendie'];

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
    ['maison', 'immigration', 'emigration', 'humeur', 'travail', 'salaire', 'impot', 'eau', 'feu', 'effondrement', 'marche', 'grenier', 'ferme', 'spectacle', 'vitesses',
      'extraction', 'atelier', 'entrepot', 'peche', 'attractivite', 'sante'].forEach(function (k) {
      exige(r[k] && typeof r[k] === 'object', 'regles.' + k + ' manquant');
    });
    exige(Array.isArray(d.maisons) && d.maisons.length === 20, '20 niveaux de maison attendus');
    (d.maisons || []).forEach(function (m, i) {
      exige(m.niveau === i + 1, 'maison ' + (i + 1) + ' : niveau mal numéroté');
      exige(Number.isInteger(m.habitants) && m.habitants > 0, 'maison ' + (i + 1) + ' : habitants');
      exige(m.besoins && typeof m.besoins === 'object', 'maison ' + (i + 1) + ' : besoins');
      exige(typeof m.impot === 'number', 'maison ' + (i + 1) + ' : impot');
      exige(Array.isArray(m.emet) && m.emet.length === 2, 'maison ' + (i + 1) + ' : emet');
      Object.keys(m.besoins || {}).forEach(function (k) {
        exige(['eau', 'nourriture', 'religion', 'divertissement'].indexOf(k) >= 0 || (d.biens || {})[k] || (d.batiments || {})[k], 'maison ' + (i + 1) + ' : besoin inconnu ' + k);
      });
    });
    exige(Array.isArray((d.regles || {}).consignes) && d.regles.consignes[0] === 'accepter', 'regles.consignes : « accepter » en premier');
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
      exige(GENRES.indexOf(x.genre) >= 0, k + ' : genre inconnu ' + x.genre);
      if (x.effectif) exige((r.travail && r.travail.categories || []).indexOf(x.travail) >= 0, k + ' : catégorie de travail');
      if (x.produit) exige(!!(d.biens || {})[x.produit], k + ' : produit inconnu ' + x.produit);
      if (x.matiere) exige(!!(d.biens || {})[x.matiere], k + ' : matière inconnue ' + x.matiere);
      if (x.genre === 'ferme' || x.genre === 'extraction' || x.genre === 'atelier') exige(x.chargesParAn > 0 && !!x.produit, k + ' : production');
      if (x.genre === 'atelier') exige(!!x.matiere, k + ' : matière');
      if (x.genre === 'extraction') exige(['eau', 'arbres', 'rochers'].indexOf(x.pres) >= 0, k + ' : « pres »');
      if (x.genre === 'spectacle') {
        exige(Array.isArray(x.artistes) && x.artistes.length && Array.isArray(x.points) && x.points.length === x.artistes.length, k + ' : artistes et points');
        (x.artistes || []).forEach(function (a) { exige(!!(d.marcheurs || {})[a], k + ' : artiste inconnu ' + a); });
      }
      if (x.genre === 'ecole_art') exige(!!(d.marcheurs || {})[x.forme], k + ' : artiste formé inconnu');
      if (x.attractivite) exige(Array.isArray(x.attractivite) && x.attractivite.length === 2, k + ' : attractivité');
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
    // Biens qu'une maison achète au marché : ceux de son niveau et du suivant (pour monter).
    var nmax = d.regles.maison.niveauMax || d.maisons.length;
    d.maisons.forEach(function (m, i) {
      var cible = d.maisons[Math.min(i + 1, nmax - 1)];
      m.biensVoulus = Object.keys(cible.besoinsCumul).filter(function (k) { return d.biens[k] && d.aliments.indexOf(k) < 0; });
    });
    d.niveauMax = nmax;
    d.listeBiens = Object.keys(d.biens);
    d.matieres = [];
    Object.keys(d.batiments).forEach(function (k) { var x = d.batiments[k]; if (x.matiere && d.matieres.indexOf(x.matiere) < 0) d.matieres.push(x.matiere); });
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
  function capacite(h) { return h.quar > 0 ? 0 : h.niv <= 0 ? D.regles.maison.terrainVagueHabitants : niveauDef(h).habitants; }

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
    placerBancs(e, p);
  }

  // Bancs de poissons (données de la carte) : chacun est posé sur la case d'eau la plus
  // proche du point donné (6 cases au plus), pour suivre une rive tirée au hasard.
  function placerBancs(e, p) {
    e.bancs = [];
    (p.poissons || []).forEach(function (q) {
      for (var r = 0; r <= 6; r++) {
        for (var y = q[1] - r; y <= q[1] + r; y++) for (var x = q[0] - r; x <= q[0] + r; x++) {
          if (Math.max(Math.abs(x - q[0]), Math.abs(y - q[1])) !== r || !dedans(e, x, y)) continue;
          var i = ix(e, x, y);
          if (e.terrain[i] === T.EAU) { if (e.bancs.indexOf(i) < 0) e.bancs.push(i); return; }
        }
      }
    });
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
    var libre = !!options.libre, tout = !!options.tout;
    var risques = options.risques === undefined ? !!m.risques : !!options.risques;
    var permis = tout ? Object.keys(D.batiments).filter(function (k) { return D.batiments[k].categorie; }) : m.batiments.slice();
    var e = {
      v: VERSION_ETAT,
      mission: m.id,
      difficulte: options.difficulte || 'normal',
      libre: libre,
      tout: tout,
      risques: risques,
      // Attractivité (section 5.3) : ignorée dans les deux missions tutorielles, appliquée ailleurs.
      attractivite: options.attractivite !== undefined ? !!options.attractivite : (libre || m.attractivite !== false),
      epidemies: risques && (permis.indexOf('medecin') >= 0 || permis.indexOf('hopital') >= 0),
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
      attract: new Int8Array(n),
      bancs: [],
      entree: 0, sortie: 0,
      batiments: [],
      marcheurs: [],
      prochainId: 1,
      tresor: options.fonds !== undefined ? Math.round(options.fonds) : Math.round(m.fonds * diff.fonds),
      impot: D.regles.impot.tauxDepart,
      salaire: D.regles.salaire.rome,
      salaireRome: D.regles.salaire.rome,
      humeur: D.regles.humeur.depart,
      creditImmigration: 0,
      reliquat: 0,
      pop: 0,
      travailleurs: 0, emplois: 0, emploisRequis: 0, chomage: 0,
      priorites: {},
      sante: 0,
      flux: { imm: 0, emi: 0, morts: 0 },
      debloques: (m.tutoriel && m.tutoriel.length && !libre ? m.depart.slice() : permis),
      tuto: 0,
      tutoFini: !(m.tutoriel && m.tutoriel.length) || libre,
      secoursRecu: false,
      victoire: null,
      defaite: null,
      derniere: null,
      journal: [],
      finances: { an: nouveauBudget(), prec: nouveauBudget() },
      histo: [],
      stats: { incendies: 0, effondrements: 0, epidemies: 0 }
    };
    e.alea = e.graine ^ 0x5bd1e995;
    reconstruireCaches(e);
    creerCarte(e, m.carte);
    versionRoutes(e);
    calculerEau(e);
    calculerAttractivite(e);
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
      case 'maison': b.niv = 0; b.hab = 0; b.att = 0; b.viv = {}; b.svc = {}; b.pts = {}; b.ok = 0; b.manque = 0; b.sansRoute = 0; b.quar = 0; b.bloque = 0; break;
      case 'ferme': case 'extraction': b.prog = 0; b.stock = 0; break;
      case 'peche': b.stock = 0; b.mb = 0; b.sansBanc = 0; break;
      case 'atelier': b.prog = 0; b.mat = 0; b.matAtt = 0; b.stock = 0; break;
      case 'grenier': b.stocks = {}; b.attendu = 0; b.cons = {}; b.mc = 0; break;
      case 'entrepot': b.stocks = {}; b.attendus = {}; b.cons = {}; b.plaf = {}; b.mc = 0; break;
      case 'marche': b.stocks = {}; b.mA = 0; b.mV = 0; b.cptV = 0; b.interdits = {}; b.dem = {}; b.der = {}; break;
      case 'spectacle': b.spects = {}; b.attendus = {}; break;
      case 'service': if (d.eauRequise) b.actif = 0; break;
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
    if (d.genre === 'barriere' || d.genre === 'place') {
      i = ix(e, x, y);
      if (d.genre === 'place' && e.route[i] === R.PLACE) return 'occupe';
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
    if (d.pres && !pres(e, { x: x, y: y, t: t }, d.pres)) return { eau: 'presEau', arbres: 'presArbres', rochers: 'presRochers' }[d.pres];
    if (d.genre === 'peche' && quaiEau(e, { x: x, y: y, t: t }) < 0) return 'rive';
    if (d.marbre && marbreDispo(e) < d.marbre * D.regles.marbreParCharge) return 'marbre';
    return null;
  }

  // Terrain voulu (eau, arbres, rochers) à « presRayon » case(s) ou moins de l'emprise.
  function pres(e, b, quoi) {
    var r = D.regles.extraction.presRayon, cible = quoi === 'eau' ? T.EAU : quoi === 'arbres' ? T.ARBRES : T.ROCHERS;
    for (var y = b.y - r; y < b.y + b.t + r; y++) for (var x = b.x - r; x < b.x + b.t + r; x++) {
      if (dedans(e, x, y) && e.terrain[ix(e, x, y)] === cible) return true;
    }
    return false;
  }

  // Quai : un côté entier de l'emprise donne sur l'eau. Renvoie la première case d'eau de ce
  // côté (là où le bateau s'amarre), ou -1. Côtés dans l'ordre nord, est, sud, ouest.
  function quaiEau(e, b) {
    var cotes = [[0, -1, 1, 0], [b.t, 0, 0, 1], [0, b.t, 1, 0], [-1, 0, 0, 1]];
    for (var c = 0; c < 4; c++) {
      var ok = true, x0 = b.x + cotes[c][0], y0 = b.y + cotes[c][1];
      for (var k = 0; k < b.t && ok; k++) {
        var x = x0 + cotes[c][2] * k, y = y0 + cotes[c][3] * k;
        if (!dedans(e, x, y) || e.terrain[ix(e, x, y)] !== T.EAU) ok = false;
      }
      if (ok) return ix(e, x0, y0);
    }
    return -1;
  }

  // Marbre des entrepôts (grands temples et oracle le consomment à la pose).
  function marbreDispo(e) {
    var n = 0;
    e.batiments.forEach(function (b) { if (b.type === 'entrepot') n += b.stocks.marbre || 0; });
    return n;
  }
  function prendreMarbre(e, q, trace) {
    for (var k = 0; k < e.batiments.length && q > 0; k++) {
      var b = e.batiments[k];
      if (b.type !== 'entrepot' || !(b.stocks.marbre > 0)) continue;
      var p = Math.min(q, b.stocks.marbre);
      b.stocks.marbre -= p; q -= p;
      if (trace) trace.marbre.push([b.id, p]);
    }
  }

  // Pose d'un élément sur une case, sans contrôle de l'argent (fait par l'appelant).
  function poser(e, type, x, y, trace) {
    var d = D.batiments[type], i = ix(e, x, y);
    if (d.genre === 'route') { e.route[i] = R.ROUTE; versionRoutes(e); trace.cases.push({ i: i, k: 'route' }); return; }
    if (d.genre === 'barriere') { e.route[i] = R.BARRIERE; versionRoutes(e); trace.cases.push({ i: i, k: 'barriere' }); return; }
    if (d.genre === 'place') { e.route[i] = R.PLACE; versionRoutes(e); trace.cases.push({ i: i, k: 'place' }); return; }
    if (d.genre === 'aqueduc') { e.aqueduc[i] = 1; versionCarte(e); trace.cases.push({ i: i, k: 'aqueduc' }); return; }
    var b = creerBatiment(e, type, x, y);
    trace.bats.push(b.id);
    if (d.marbre) prendreMarbre(e, d.marbre * D.regles.marbreParCharge, trace);
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
    if (e.route[i] === R.PLACE) { e.route[i] = R.ROUTE; versionRoutes(e); return 1; } // la place redevient route
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
  //   { type: 'consigne', id, bien, valeur: 'accepter' | 'refuser' | 'chercher' | 'vider' }  (grenier, entrepôt)
  //   { type: 'plafond', id, bien, valeur: 1 à 4 }   (entrepôt : quarts de la capacité)
  //   { type: 'interdit', id, bien, valeur: booléen } (marché)
  //   { type: 'priorite', categorie, valeur: 0 à 9 }  (0 : sans priorité ; 1 passe en premier)

  function appliquer(e, c) {
    var res = { ok: false, cout: 0, n: 0, raison: null };
    if (!c || typeof c.type !== 'string') { res.raison = 'commande'; return res; }
    if (c.type === 'poser' || c.type === 'tracer') {
      var d = D.batiments[c.bat];
      if (!d) { res.raison = 'inconnu'; return res; }
      var cases = c.type === 'poser' ? [[c.x, c.y]] : (c.cases || []);
      var trace = { tick: e.tick, cout: 0, cases: [], bats: [], marbre: [] };
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
      if (res.n) { majPopulation(e); verifierTutoriel(e); calculerAttractivite(e); }
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
        if (cs.k === 'place' && e.route[cs.i] === R.PLACE) { e.route[cs.i] = R.ROUTE; versionRoutes(e); }
      });
      a.bats.forEach(function (id) { var b = e._index.get(id); if (b) retirerBatiment(e, b); });
      (a.marbre || []).forEach(function (m) { var b = e._index.get(m[0]); if (b) b.stocks.marbre = (b.stocks.marbre || 0) + m[1]; });
      e.tresor += a.cout; e.finances.an.constructions -= a.cout;
      res.cout = -a.cout; res.ok = true;
      e.derniere = null;
      calculerEau(e); majPopulation(e); calculerAttractivite(e);
      return res;
    }
    if (c.type === 'consigne' || c.type === 'plafond' || c.type === 'interdit') {
      var cb = e._index.get(c.id | 0);
      if (!cb || !D.biens[c.bien]) { res.raison = 'cible'; return res; }
      var aliment = D.aliments.indexOf(c.bien) >= 0;
      if (c.type === 'consigne') {
        if (!(cb.type === 'entrepot' || (cb.type === 'grenier' && aliment)) || D.regles.consignes.indexOf(c.valeur) < 0) { res.raison = 'cible'; return res; }
        if (c.valeur === 'accepter') delete cb.cons[c.bien]; else cb.cons[c.bien] = c.valeur;
      } else if (c.type === 'plafond') {
        var q = c.valeur | 0;
        if (cb.type !== 'entrepot' || q < 1 || q > 4) { res.raison = 'cible'; return res; }
        if (q === D.regles.entrepot.plafondDepart) delete cb.plaf[c.bien]; else cb.plaf[c.bien] = q;
      } else {
        if (cb.type !== 'marche') { res.raison = 'cible'; return res; }
        if (c.valeur) cb.interdits[c.bien] = 1; else delete cb.interdits[c.bien];
      }
      res.ok = true;
      return res;
    }
    if (c.type === 'priorite') {
      var v = c.valeur | 0;
      if (D.regles.travail.categories.indexOf(c.categorie) < 0 || v < 0 || v > 9) { res.raison = 'reglage'; return res; }
      if (v) e.priorites[c.categorie] = v; else delete e.priorites[c.categorie];
      res.ok = true;
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
    // Bains : sur les canalisations, c'est-à-dire dans le rayon d'un réservoir plein (section 7.1).
    e.batiments.forEach(function (b) {
      if (!def(b).eauRequise) return;
      b.actif = 0;
      for (var k = 0; k < reservoirs.length; k++) {
        if (reservoirs[k].plein && distRect(reservoirs[k], b.x, b.y) <= E.reservoirRayon) { b.actif = 1; break; }
      }
    });
    versionCarte(e);
  }

  // ------------------------------------------------------------------------
  // Attractivité (section 5.3) : grille de -100 à +100, recalculée chaque jour et après
  // chaque construction. Chaque source donne v à son contact, puis décroît linéairement
  // jusqu'à 0 à r cases (« +4 sur 3 » : 4, 2, 1 aux distances 1, 2, 3).
  // ------------------------------------------------------------------------

  var ACC = null;
  function emission(b) {
    if (estMaison(b)) return b.hab > 0 ? niveauDef(b).emet : null;
    return def(b).attractivite || null;
  }
  function rayonner(e, acc, x0, y0, t, v, r) {
    var N = e.N;
    for (var y = Math.max(0, y0 - r); y < Math.min(N, y0 + t + r); y++) for (var x = Math.max(0, x0 - r); x < Math.min(N, x0 + t + r); x++) {
      var dx = x < x0 ? x0 - x : x >= x0 + t ? x - (x0 + t - 1) : 0;
      var dy = y < y0 ? y0 - y : y >= y0 + t ? y - (y0 + t - 1) : 0;
      var d = dx > dy ? dx : dy;
      if (d === 0) continue; // un bâtiment ne compte pas pour lui-même
      acc[y * N + x] += Math.trunc(v * (r + 1 - d) / r);
    }
  }
  function calculerAttractivite(e) {
    var N = e.N, n = N * N, A = D.regles.attractivite, i;
    if (!ACC || ACC.length !== n) ACC = new Int32Array(n);
    ACC.fill(0);
    for (var k = 0; k < e.batiments.length; k++) {
      var b = e.batiments[k], em = emission(b);
      if (em && em[0] && em[1] > 0) rayonner(e, ACC, b.x, b.y, b.t, em[0], em[1]);
    }
    var pl = D.batiments.place && D.batiments.place.attractivite;
    if (pl) for (i = 0; i < n; i++) if (e.route[i] === R.PLACE) rayonner(e, ACC, i % N, (i - i % N) / N, 1, pl[0], pl[1]);
    for (i = 0; i < n; i++) e.attract[i] = Math.max(A.min, Math.min(A.max, ACC[i]));
  }
  // Attractivité d'un bâtiment : moyenne de ses cases.
  function attractiviteDe(e, b) {
    var s = 0;
    for (var y = b.y; y < b.y + b.t; y++) for (var x = b.x; x < b.x + b.t; x++) s += e.attract[ix(e, x, y)];
    return Math.trunc(s / (b.t * b.t));
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
    // Catégories prioritaires d'abord (rang 1, puis 2…), servies en entier si possible ; le reste
    // des travailleurs va aux autres bâtiments, proportionnellement (section 6.3).
    var prio = e.priorites || {}, cats = Tr.categories, reste = travailleurs, donnes = 0;
    var ordre = Object.keys(prio).filter(function (c) { return prio[c] > 0; })
      .sort(function (a, b) { return prio[a] - prio[b] || cats.indexOf(a) - cats.indexOf(b); });
    ordre.forEach(function (c) {
      var g = distribuer(demandes.filter(function (b) { return def(b).travail === c; }), reste);
      reste -= g; donnes += g;
    });
    donnes += distribuer(demandes.filter(function (b) { return !(prio[def(b).travail] > 0); }), reste);
    e.travailleurs = travailleurs;
    e.emplois = donnes;
    e.emploisRequis = total;
    e.chomage = travailleurs > 0 ? Math.round((travailleurs - donnes) * 100 / travailleurs) : 0;
  }

  // Répartit « dispo » travailleurs entre ces bâtiments : tous servis s'il y en a assez, sinon
  // proportionnellement, le reste partant une place à la fois dans l'ordre des bâtiments.
  function distribuer(liste, dispo) {
    var tot = 0, k;
    for (k = 0; k < liste.length; k++) tot += def(liste[k]).effectif;
    if (dispo >= tot) { liste.forEach(function (b) { b.eff = def(b).effectif; }); return tot; }
    var g = 0;
    liste.forEach(function (b) { b.eff = tot ? Math.floor(def(b).effectif * dispo / tot) : 0; g += b.eff; });
    for (k = 0; g < dispo && k < liste.length; k++) if (liste[k].eff < def(liste[k]).effectif) { liste[k].eff++; g++; }
    return g;
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
      if (o.mc === w.id) o.mc = 0;
      if (o.mb === w.id) o.mb = 0;
      if (d.genre === 'spectacle' && w.type === d.marcheur) o.m = 0;
    }
    // Place réservée chez la destination (ou chez soi pour « aller chercher ») : libérée.
    if (w.res) { var rb = e._index.get(w.res[0]); if (rb) liberer(rb, w.res[1], w.res[2]); w.res = null; }
    if ((w.type === 'immigrant' || w.type === 'sansabri') && w.cb) {
      var h = e._index.get(w.cb);
      if (h && estMaison(h)) h.att = Math.max(0, h.att - w.gens);
    }
    if (estArtiste(w.type) && w.cb) {
      var th = e._index.get(w.cb);
      if (th && th.attendus && th.attendus[w.type] === w.id) th.attendus[w.type] = 0;
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
  // Passable pour un errant (les barrières l'arrêtent ; les places sont des routes).
  function passableErrant(e) { return function (i) { var r = e.route[i]; return r === R.ROUTE || r === R.ROME || r === R.PLACE; }; }
  // Passable pour un bateau : l'eau seulement.
  function passableEau(e) { return function (i) { return e.terrain[i] === T.EAU; }; }
  function estArtiste(type) { return type === 'acteur' || type === 'gladiateur' || type === 'lion'; }
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
        case 'spectacle': if (estMaison(b) && b.hab > 0) { b.svc[o.type] = jours; b.pts[o.type] = pointsSpectacle(o); } break;
        case 'vente': if (estMaison(b) && b.hab > 0) vendre(e, o, b); break;
        // Éducation et santé : le passage valide le besoin du même nom (école, bains…).
        default: if (estMaison(b) && b.hab > 0) b.svc[svc] = jours; break;
      }
    }
  }

  function consoMois(h) { return Math.ceil(h.hab * D.regles.maison.nourritureParHabitantMois); }

  // Points d'un lieu de spectacle : selon le nombre de types d'artistes en scène (section 9.2).
  function pointsSpectacle(b) {
    var d = def(b), n = 0;
    d.artistes.forEach(function (a) { if ((b.spects[a] || 0) > 0) n++; });
    return n ? d.points[Math.min(n, d.points.length) - 1] : 0;
  }

  // Biens qu'une maison veut acheter (niveau actuel et suivant) et sa réserve visée par bien.
  function biensVoulus(h) { return h.niv >= 1 ? niveauDef(h).biensVoulus : []; }
  function reserveBien(h) { return D.regles.maison.reserveMois * h.t * h.t * D.regles.maison.biensParCaseMois; }

  // La vendeuse remplit la réserve de la maison (4 mois de consommation au plus) ; elle note
  // les biens que la maison réclame, pour que l'acheteuse aille les chercher (section 7.4).
  function vendre(e, m, h) {
    var types = D.aliments.filter(function (a) { return (m.stocks[a] || 0) > 0; });
    if (types.length) {
      var cible = Math.ceil(D.regles.maison.reserveMois * consoMois(h) / types.length);
      types.forEach(function (a) {
        var manque = cible - (h.viv[a] || 0);
        if (manque <= 0) return;
        var q = Math.min(manque, m.stocks[a]);
        m.stocks[a] -= q;
        h.viv[a] = (h.viv[a] || 0) + q;
      });
    }
    var veut = biensVoulus(h), rb = reserveBien(h);
    for (var k = 0; k < veut.length; k++) {
      var g = veut[k];
      if (m.interdits[g]) continue;
      m.dem[g] = D.regles.serviceJours;
      var manque2 = rb - (h.viv[g] || 0);
      if (manque2 <= 0 || !(m.stocks[g] > 0)) continue;
      var q2 = Math.min(manque2, m.stocks[g]);
      m.stocks[g] -= q2;
      h.viv[g] = (h.viv[g] || 0) + q2;
    }
  }

  // --- Marcheurs à destination -------------------------------------------------

  function arriveeDestination(e, w) {
    var fam = D.marcheurs[w.type];
    var pass = fam.surEau ? passableEau(e) : (fam.horsRoute || w.pompier || w.retourLibre) ? passableLibre(e) : passableRoute(e);
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
      var portes = new Set(entreesMaison(e, h));
      p = parcours(e, [i], passableLibre(e), function (j) { return portes.has(j); }, 6 * N);
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
    } else if (w.type === 'bateau') {
      if (w.phase === 'aller') { var bancs = new Set(e.bancs); p = parcours(e, [i], passableEau(e), function (j) { return bancs.has(j); }, 4 * N); }
      else p = parcours(e, [i], passableEau(e), function (j) { return j === w.quai; }, 4 * N);
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
          if (h && estMaison(h) && arriveChezSoi(e, h, w.x, w.y)) {
            h.att = Math.max(0, h.att - w.gens);
            var place = capacite(h) - h.hab;
            var entrent = Math.min(place, w.gens);
            if (entrent > 0) { h.hab += entrent; if (h.niv === 0) h.niv = 1; if (w.type === 'immigrant') e.flux.imm += entrent; }
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
      case 'charretier':
        o = e._index.get(w.o);
        if (w.phase === 'aller') {
          c = e._index.get(w.cb);
          if (w.mode === 'chercher') {
            // Aller chercher : on charge chez la cible, puis retour chez soi (place déjà réservée).
            if (c && c.stocks && (c.stocks[w.g] || 0) > 0) {
              var pr = Math.min(D.regles.maison.uniteParCharge, c.stocks[w.g]);
              c.stocks[w.g] -= pr;
              w.ld = { g: w.g, q: pr };
            }
          } else if (w.ld) {
            if (w.res && w.res[0] === w.cb) { if (c) liberer(c, w.res[1], w.res[2]); w.res = null; }
            if (c) w.ld.q -= deposer(c, w.ld.g, w.ld.q);
            if (w.ld.q > 0) {
              // Destination disparue ou pleine : un autre preneur, sinon retour avec la charge.
              var g2 = chercherPreneur(e, [i], w.ld.g, w.ld.q, o, w.type === 'charretier');
              if (g2) { allerAuPreneur(e, w, g2); return; }
            }
            if (w.ld.q <= 0) w.ld = null;
          }
          if (!o) { finir(e, w); return; }
          w.phase = 'retour';
          if (!rechercher(e, w)) finir(e, w);
          return;
        }
        // Retour chez soi : une charge non livrée (ou rapportée) est remise en stock.
        if (o && w.ld && w.ld.q > 0) {
          if (w.res && w.res[0] === o.id) { liberer(o, w.res[1], w.res[2]); w.res = null; }
          rentrer(o, w.ld.g, w.ld.q);
          w.ld = null;
        }
        finir(e, w);
        return;
      case 'bateau':
        o = e._index.get(w.o);
        if (w.phase === 'aller') {
          // Au banc : pêche pendant quelques jours, puis retour au quai.
          var pq = parcours(e, [i], passableEau(e), function (j) { return j === w.quai; }, 4 * N);
          if (!o || !pq) { finir(e, w); return; }
          w.phase = 'retour'; w.ch = pq.chemin; w.k = 0;
          w.attente = D.regles.peche.joursPeche * D.temps.ticksParJour;
          return;
        }
        if (o && o.type === 'quai_peche') o.stock = 1;
        finir(e, w);
        return;
      case 'acheteuse':
        o = e._index.get(w.o);
        if (w.phase === 'aller') {
          c = e._index.get(w.cb);
          if (c && c.stocks && o) {
            var choix = w.g && (c.stocks[w.g] || 0) > 0 ? w.g : choisirAchat(o, c);
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
      case 'gladiateur':
      case 'lion':
        c = e._index.get(w.cb);
        if (c && c.spects && def(c).artistes.indexOf(w.type) >= 0) { c.spects[w.type] = D.regles.spectacle.dureeJours; c.attendus[w.type] = 0; }
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

  // ------------------------------------------------------------------------
  // Stockage : greniers (nourriture), entrepôts (8 emplacements de 4 charges, un bien par
  // emplacement), ateliers (matière en attente). Les quantités sont en unités (1 charge = 100).
  // Les places promises à un marcheur en route sont réservées (attendu) jusqu'à son arrivée.
  // ------------------------------------------------------------------------

  function estAliment(g) { return D.aliments.indexOf(g) >= 0; }
  function charge() { return D.regles.maison.uniteParCharge; }
  function consigne(b, g) { return (b.cons && b.cons[g]) || 'accepter'; }
  function accepte(b, g) { var c = consigne(b, g); return c === 'accepter' || c === 'chercher'; }

  // Unités de g qu'un entrepôt peut encore recevoir (emplacements libres, plafond du bien).
  function placeEntrepot(b, g) {
    var E = D.regles.entrepot, cap = E.chargesParEmplacement * charge(), pris = 0, mien = 0;
    for (var k in b.stocks) if (k !== g) pris += Math.ceil(((b.stocks[k] || 0) + (b.attendus[k] || 0)) / cap);
    for (var k2 in b.attendus) if (k2 !== g && !(k2 in b.stocks)) pris += Math.ceil((b.attendus[k2] || 0) / cap);
    mien = (b.stocks[g] || 0) + (b.attendus[g] || 0);
    var plafond = (b.plaf[g] || E.plafondDepart) * E.emplacements * cap / 4;
    return Math.max(0, Math.min((E.emplacements - pris) * cap, plafond) - mien);
  }
  // Place libre pour g (consigne comprise ; « force » ignore la consigne : rentrée chez soi).
  function placeDans(b, g, force) {
    if (b.type === 'grenier') {
      if (!estAliment(g) || (!force && !accepte(b, g))) return 0;
      return Math.max(0, D.regles.grenier.capacite - totalStock(b) - b.attendu);
    }
    if (b.type === 'entrepot') return (!force && !accepte(b, g)) ? 0 : placeEntrepot(b, g);
    if (def(b).genre === 'atelier') return def(b).matiere === g ? Math.max(0, D.regles.atelier.attenteMax * charge() - b.mat - b.matAtt) : 0;
    return 0;
  }
  function reserver(b, g, q) {
    if (b.type === 'grenier') b.attendu += q;
    else if (b.type === 'entrepot') b.attendus[g] = (b.attendus[g] || 0) + q;
    else if (def(b).genre === 'atelier') b.matAtt += q;
  }
  function liberer(b, g, q) {
    if (b.type === 'grenier') b.attendu = Math.max(0, b.attendu - q);
    else if (b.type === 'entrepot') { var v = Math.max(0, (b.attendus[g] || 0) - q); if (v) b.attendus[g] = v; else delete b.attendus[g]; }
    else if (def(b).genre === 'atelier') b.matAtt = Math.max(0, b.matAtt - q);
  }
  // Dépose au plus q unités de g ; renvoie la quantité acceptée.
  function deposer(b, g, q, force) {
    var n = Math.min(q, placeDans(b, g, force));
    if (n <= 0) return 0;
    if (def(b).genre === 'atelier') b.mat += n;
    else b.stocks[g] = (b.stocks[g] || 0) + n;
    return n;
  }
  // Une charge revient à son point de départ (producteur, atelier ou dépôt).
  function rentrer(b, g, q) {
    var d = def(b);
    if (d.genre === 'ferme' || d.genre === 'extraction' || d.genre === 'peche' || d.genre === 'atelier') {
      if (g === d.produit && q >= charge() && b.stock < 1) b.stock = 1;
      return;
    }
    if (b.stocks) deposer(b, g, q, true);
  }

  // Preneur le plus proche par la route pour q unités de g : d'abord un atelier qui manque de
  // cette matière (section 8.2), puis un grenier (nourriture), puis un entrepôt. « exclu » ne
  // reçoit rien (le dépôt d'origine) ; « depotsSeuls » : un charretier ne livre pas d'atelier
  // en vidant, il ne fait que déplacer le stock.
  function chercherPreneur(e, sources, g, q, exclu, depotsSeuls) {
    var N = e.N, etapes = [];
    if (!depotsSeuls && D.matieres.indexOf(g) >= 0) etapes.push(function (b) { return def(b).genre === 'atelier'; });
    if (estAliment(g)) etapes.push(function (b) { return b.type === 'grenier'; });
    etapes.push(function (b) { return b.type === 'entrepot'; });
    for (var k = 0; k < etapes.length; k++) {
      var cibles = new Map(), filtre = etapes[k];
      for (var j = 0; j < e.batiments.length; j++) {
        var b = e.batiments[j];
        if (b === exclu || !filtre(b) || taux(b) <= 0 || placeDans(b, g) < q) continue;
        acces(e, b).forEach(function (i) { if (!cibles.has(i)) cibles.set(i, b); });
      }
      if (!cibles.size) continue;
      var p = parcours(e, sources, passableRoute(e), function (i) { return cibles.has(i); }, 6 * N);
      if (p) return { b: cibles.get(p.fin), chemin: p.chemin, depart: p.depart };
    }
    return null;
  }
  function allerAuPreneur(e, w, cible) {
    w.cb = cible.b.id;
    reserver(cible.b, w.ld.g, w.ld.q);
    w.res = [cible.b.id, w.ld.g, w.ld.q];
    w.ch = cible.chemin; w.k = 0;
    suivreChemin(e, w, passableRoute(e));
  }
  // Un producteur (ferme, extraction, quai, atelier) envoie sa charge au preneur le plus proche.
  function livrer(e, b, g) {
    var a = acces(e, b);
    if (!a.length) return;
    var q = charge(), cible = chercherPreneur(e, a, g, q, b, false);
    if (!cible) return;
    var w = creerMarcheur(e, 'livreur', cible.depart, { o: b.id, cb: cible.b.id, phase: 'aller', ld: { g: g, q: q }, ch: cible.chemin, k: 0 });
    reserver(cible.b, g, q);
    w.res = [cible.b.id, g, q];
    b.m = w.id;
    b.stock = 0;
  }

  // Charretier d'un grenier ou d'un entrepôt (section 8.3) : approvisionne un atelier en
  // matière (entrepôt), vide un bien marqué « vider », ou va chercher un bien marqué « aller
  // chercher » dans un autre dépôt. Une tâche à la fois.
  function quotidienDepot(e, b) {
    if (b.mc || taux(b) <= 0) return;
    var a = acces(e, b);
    if (!a.length) return;
    var Q = charge(), N = e.N, k, g, cibles, p;
    // 1. Ateliers qui manquent d'une matière que l'entrepôt détient.
    if (b.type === 'entrepot') {
      cibles = new Map();
      e.batiments.forEach(function (t) {
        var dt = def(t);
        if (dt.genre !== 'atelier' || taux(t) <= 0 || !((b.stocks[dt.matiere] || 0) >= Q) || placeDans(t, dt.matiere) < Q) return;
        acces(e, t).forEach(function (i) { if (!cibles.has(i)) cibles.set(i, t); });
      });
      if (cibles.size) {
        p = parcours(e, a, passableRoute(e), function (i) { return cibles.has(i); }, 6 * N);
        if (p) { var at = cibles.get(p.fin), m = def(at).matiere; envoyerCharretier(e, b, at, m, Q, p, 'livrer'); return; }
      }
    }
    // 2. Vider : la charge part vers un autre dépôt qui l'accepte.
    var biens = Object.keys(b.stocks).sort();
    for (k = 0; k < biens.length; k++) {
      g = biens[k];
      if (consigne(b, g) !== 'vider' || !(b.stocks[g] > 0)) continue;
      var q = Math.min(Q, b.stocks[g]), c = chercherPreneur(e, a, g, q, b, true);
      if (c) { envoyerCharretier(e, b, c.b, g, q, { chemin: c.chemin, depart: c.depart }, 'vider'); return; }
    }
    // 3. Aller chercher : dans le dépôt le plus proche qui en a et ne le cherche pas lui-même.
    var voulus = Object.keys(b.cons).filter(function (x) { return b.cons[x] === 'chercher'; }).sort();
    for (k = 0; k < voulus.length; k++) {
      g = voulus[k];
      if (placeDans(b, g) < Q) continue;
      cibles = new Map();
      for (var j = 0; j < e.batiments.length; j++) {
        var t = e.batiments[j];
        if (t === b || !t.stocks || (t.type !== 'grenier' && t.type !== 'entrepot') || !((t.stocks[g] || 0) > 0) || consigne(t, g) === 'chercher') continue;
        acces(e, t).forEach(function (i) { if (!cibles.has(i)) cibles.set(i, t); });
      }
      if (!cibles.size) continue;
      p = parcours(e, a, passableRoute(e), function (i) { return cibles.has(i); }, 6 * N);
      if (!p) continue;
      var w = creerMarcheur(e, 'charretier', p.depart, { o: b.id, cb: cibles.get(p.fin).id, phase: 'aller', mode: 'chercher', g: g, ld: null, ch: p.chemin, k: 0 });
      reserver(b, g, Q);
      w.res = [b.id, g, Q];
      b.mc = w.id;
      return;
    }
  }
  function envoyerCharretier(e, b, cible, g, q, p, mode) {
    b.stocks[g] -= q;
    var w = creerMarcheur(e, 'charretier', p.depart, { o: b.id, cb: cible.id, phase: 'aller', mode: mode, ld: { g: g, q: q }, ch: p.chemin, k: 0 });
    reserver(cible, g, q);
    w.res = [cible.id, g, q];
    b.mc = w.id;
  }

  // Produits dont un marché a besoin : les aliments sous le seuil d'achat, et les biens qu'une
  // maison desservie a réclamés, sous leur propre seuil ; jamais un produit interdit.
  function besoinsMarche(m) {
    var Mr = D.regles.marche, l = [];
    D.aliments.forEach(function (a) { if (!m.interdits[a] && (m.stocks[a] || 0) < Mr.seuilAchat) l.push(a); });
    Object.keys(m.dem).sort().forEach(function (g) { if (m.dem[g] > 0 && !m.interdits[g] && (m.stocks[g] || 0) < Mr.seuilBien) l.push(g); });
    return l;
  }
  // Au dépôt : le produit utile le moins présent au marché (rapporté à son seuil).
  function choisirAchat(m, c) {
    var Mr = D.regles.marche, choix = null, meilleur = Infinity;
    besoinsMarche(m).forEach(function (g) {
      if (!((c.stocks[g] || 0) > 0)) return;
      var r = (m.stocks[g] || 0) / (estAliment(g) ? Mr.seuilAchat : Mr.seuilBien);
      if (r < meilleur) { meilleur = r; choix = g; }
    });
    return choix;
  }

  // Sans-abri : cherche une maison qui a de la place, sinon quitte la carte.
  function creerSansAbri(e, i, gens) {
    var groupe = D.regles.emigration.groupeMax;
    i = pointDeSortie(e, i);
    while (gens > 0) {
      var g = Math.min(groupe, gens);
      gens -= g;
      var w = creerMarcheur(e, 'sansabri', i, { gens: g, cb: 0, ch: null, k: 0 });
      var h = maisonLibre(e, g);
      if (h) {
        var portes = new Set(entreesMaison(e, h));
        var p = parcours(e, [i], passableLibre(e), function (j) { return portes.has(j); }, 6 * e.N);
        if (p) { w.cb = h.id; h.att += g; w.ch = p.chemin; w.k = 0; continue; }
      }
      var ps = parcours(e, [i], passableLibre(e), function (j) { return j === e.sortie; }, 8 * e.N);
      if (ps) { w.ch = ps.chemin; w.k = 0; } else finir(e, w);
    }
  }

  // On entre dans une maison depuis une route à 2 cases ou moins (la distance exigée pour
  // poser un logement), ou depuis sa propre case : une tente entourée d'autres bâtiments
  // reste accessible (avant, il fallait marcher jusque sur sa case).
  function entreesMaison(e, h) {
    var r = D.regles.logementDistanceRoute, l = [];
    for (var y = h.y - r; y < h.y + h.t + r; y++) for (var x = h.x - r; x < h.x + h.t + r; x++) {
      if (dedans(e, x, y) && e.route[ix(e, x, y)]) l.push(ix(e, x, y));
    }
    l.push(ix(e, h.x, h.y));
    return l;
  }
  function arriveChezSoi(e, h, x, y) { return distRect(h, x, y) <= D.regles.logementDistanceRoute; }
  // Ceux qui quittent une maison partent de la route la plus proche (2 cases au plus), sinon de la maison.
  function pointDeSortie(e, i) {
    var N = e.N, x0 = i % N, y0 = (i - x0) / N, r = D.regles.logementDistanceRoute;
    for (var d = 1; d <= r; d++) for (var y = y0 - d; y <= y0 + d; y++) for (var x = x0 - d; x <= x0 + d; x++) {
      if (Math.max(Math.abs(x - x0), Math.abs(y - y0)) !== d || !dedans(e, x, y)) continue;
      if (e.route[ix(e, x, y)]) return ix(e, x, y);
    }
    return i;
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
    if (e.risques && d.genre !== 'ruines' && d.genre !== 'incendie') {
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
      case 'service': if (!b.m && !b.cpt && (!d.eauRequise || b.actif)) emettreErrant(e, b, d.marcheur); break;
      case 'ferme': case 'extraction': case 'peche': quotidienProducteur(e, b, d); break;
      case 'atelier': quotidienAtelier(e, b, d); break;
      case 'grenier': case 'entrepot': quotidienDepot(e, b); break;
      case 'marche': quotidienMarche(e, b); break;
      case 'spectacle': {
        var actif = false;
        for (var k = 0; k < d.artistes.length; k++) {
          var ar = d.artistes[k];
          if (b.spects[ar] > 0) { b.spects[ar]--; if (b.spects[ar] > 0) actif = true; }
        }
        if (actif && !b.m && !b.cpt) emettreErrant(e, b, d.marcheur);
        break;
      }
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
    if (h.quar > 0) h.quar--;
    if (h.hab <= 0) { h.ok = 0; h.manque = 0; h.bloque = 0; return; }
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
    var cur = niveauDef(h), suiv = h.niv < D.niveauMax ? D.maisons[h.niv] : null;
    if (!remplit(s, cur.besoinsCumul) || !attractiviteOk(e, s, cur)) {
      h.ok = 0; h.manque++; h.bloque = 0;
      if (h.manque >= M.joursDescente && h.niv > 1) descendre(e, h);
      return;
    }
    h.manque = 0;
    if (suiv && remplit(s, suiv.besoinsCumul) && attractiviteOk(e, s, suiv)) {
      h.ok++;
      if (h.ok >= M.joursMontee) {
        // Niveau d'une emprise plus grande (10, 15, 19) : la maison doit d'abord s'agrandir.
        if (suiv.emprise === h.t || agrandir(e, h, suiv.emprise)) {
          h.niv++; h.ok = 0; h.bloque = 0;
          if (suiv.emprise !== cur.emprise) noter(e, 'msg.maisonAgrandie', { niveau: h.niv }, false, ix(e, h.x, h.y));
        } else { h.ok = M.joursMontee; h.bloque = 1; }
      }
    } else { h.ok = 0; h.bloque = 0; }
  }

  function attractiviteOk(e, s, niveau) {
    return !e.attractivite || niveau.attractivite === null || niveau.attractivite === undefined || s.attractivite >= niveau.attractivite;
  }

  function descendre(e, h) {
    h.niv--; h.manque = 0;
    if (niveauDef(h).emprise < h.t) diviser(e, h, niveauDef(h).emprise);
    var trop = h.hab - capacite(h);
    if (trop > 0) { h.hab -= trop; creerSansAbri(e, ix(e, h.x, h.y), trop); }
    majPopulation(e);
    noter(e, 'msg.maisonDescend', { niveau: h.niv }, false, ix(e, h.x, h.y));
  }

  // Agrandissement (section 5.1) : la maison forme un carré de k × k avec des maisons voisines de
  // même niveau, des zones vides ou des jardins. Carrés essayés dans un ordre fixe (la maison
  // en haut à gauche, puis en haut à droite, en bas à gauche, en bas à droite).
  function agrandir(e, h, k) {
    for (var oy = 0; oy < k; oy++) for (var ox = 0; ox < k; ox++) {
      var sx = h.x - ox, sy = h.y - oy, autres = [], ok = true;
      for (var y = sy; y < sy + k && ok; y++) for (var x = sx; x < sx + k && ok; x++) {
        if (!dedans(e, x, y)) { ok = false; break; }
        var b = bat(e, ix(e, x, y));
        if (b === h) continue;
        if (b && estMaison(b) && b.t === 1 && (b.hab === 0 || b.niv === h.niv) && !b.quar) { if (autres.indexOf(b) < 0) autres.push(b); }
        else if (b && b.type === 'jardin') { if (autres.indexOf(b) < 0) autres.push(b); }
        else ok = false;
      }
      if (!ok) continue;
      autres.forEach(function (b) {
        if (estMaison(b)) {
          h.hab += b.hab;
          for (var g in b.viv) h.viv[g] = (h.viv[g] || 0) + b.viv[g];
          for (var s2 in b.svc) h.svc[s2] = Math.max(h.svc[s2] || 0, b.svc[s2]);
          for (var p2 in b.pts) if (!(h.pts[p2] >= b.pts[p2])) h.pts[p2] = b.pts[p2];
        }
        retirerBatiment(e, b, true);
      });
      h.x = sx; h.y = sy; h.t = k;
      for (y = sy; y < sy + k; y++) for (x = sx; x < sx + k; x++) e.bat[ix(e, x, y)] = h.id;
      e._acces.delete(h.id);
      versionCarte(e);
      majPopulation(e);
      return true;
    }
    return false;
  }

  // Division à la descente : la maison garde son coin haut-gauche de k × k ; les autres cases
  // redeviennent des maisons d'une case, du niveau le plus haut possible à cette emprise.
  function diviser(e, h, k) {
    var niv1 = 0, cases = [], x, y;
    for (var n = 0; n < D.maisons.length; n++) if (D.maisons[n].emprise === 1) niv1 = n + 1;
    for (y = h.y; y < h.y + h.t; y++) for (x = h.x; x < h.x + h.t; x++) {
      if (x < h.x + k && y < h.y + k) continue;
      cases.push([x, y]);
      e.bat[ix(e, x, y)] = 0;
    }
    h.t = k;
    e._acces.delete(h.id);
    var parts = [h], total = h.hab, viv = h.viv;
    cases.forEach(function (c) {
      var nb = creerBatiment(e, 'logement', c[0], c[1]);
      nb.niv = Math.min(niv1, h.niv);
      for (var s2 in h.svc) nb.svc[s2] = h.svc[s2];
      for (var p2 in h.pts) nb.pts[p2] = h.pts[p2];
      parts.push(nb);
    });
    // Habitants et réserves répartis en parts égales (le reste dans l'ordre des cases).
    var hv = {};
    parts.forEach(function (b, i) {
      b.hab = Math.floor(total / parts.length) + (i < total % parts.length ? 1 : 0);
      var cap = capacite(b);
      if (b.hab > cap) { creerSansAbri(e, ix(e, b.x, b.y), b.hab - cap); b.hab = cap; }
      if (b.hab === 0 && b !== h) b.niv = 0;
    });
    for (var g in viv) {
      var q = viv[g], part = Math.floor(q / parts.length);
      parts.forEach(function (b, i) { hv[b.id] = hv[b.id] || {}; hv[b.id][g] = part + (i === 0 ? q - part * parts.length : 0); });
    }
    parts.forEach(function (b) { b.viv = hv[b.id] || {}; });
    versionCarte(e);
  }

  // Besoins satisfaits d'une maison (valeurs comparées aux besoins des données).
  function satisfaits(e, h) {
    var i = ix(e, h.x, h.y), s = {};
    s.eau = e.eauFontaine[i] ? 2 : e.eauPuits[i] ? 1 : 0;
    var n = 0;
    D.aliments.forEach(function (a) { if ((h.viv[a] || 0) > 0) n++; });
    s.nourriture = n;
    var dieux = {}, nd = 0, divert = 0;
    for (var k in h.svc) {
      if (h.svc[k] <= 0) continue;
      if (k.indexOf('dieu_') === 0) { if (!dieux[k]) { dieux[k] = 1; nd++; } }
      else if (D.batiments[k] && D.batiments[k].points) divert += (h.pts && h.pts[k] !== undefined) ? h.pts[k] : D.batiments[k].points[0];
      else s[k] = 1;
    }
    s.religion = nd;
    s.divertissement = Math.min(D.regles.divertissementMax, divert);
    for (var g in h.viv) if (D.biens[g] && D.aliments.indexOf(g) < 0 && h.viv[g] > 0) s[g] = 1;
    s.attractivite = attractiviteDe(e, h);
    return s;
  }

  function remplit(s, besoins) {
    for (var k in besoins) if ((s[k] || 0) < besoins[k]) return false;
    return true;
  }

  // Pour le panneau d'information : besoins satisfaits et ce qui manque pour monter.
  function infosMaison(e, h) {
    var s = satisfaits(e, h), suiv = h.niv >= 1 && h.niv < D.niveauMax ? D.maisons[h.niv] : null, manque = [];
    if (suiv) {
      var b = suiv.besoinsCumul;
      for (var k in b) if ((s[k] || 0) < b[k]) manque.push({ besoin: k, requis: b[k], actuel: s[k] || 0 });
      if (!attractiviteOk(e, s, suiv)) manque.push({ besoin: 'attractivite', requis: suiv.attractivite, actuel: s.attractivite });
      if (h.bloque) manque.push({ besoin: 'place', requis: suiv.emprise, actuel: h.t });
    }
    var cur = h.niv >= 1 ? niveauDef(h) : null;
    return {
      satisfaits: s, manque: manque, suivant: suiv ? suiv.niveau : null, conso: consoMois(h),
      attractivite: s.attractivite, attractiviteActive: !!e.attractivite,
      attractiviteRequise: cur && e.attractivite ? cur.attractivite : null,
      biensVoulus: biensVoulus(h), reserveBien: reserveBien(h)
    };
  }

  // Ferme, extraction, quai de pêche : une charge prête part chez le preneur le plus proche.
  function quotidienProducteur(e, b, d) {
    var fin = D.regles.ferme.progressionCharge, r = taux(b);
    if (d.genre === 'peche') quotidienPeche(e, b, r);
    else {
      if (b.prog < fin && r > 0) {
        var fert = 100;
        if (d.genre === 'ferme') {
          var n = 0; fert = 0;
          for (var y = b.y; y < b.y + b.t; y++) for (var x = b.x; x < b.x + b.t; x++) { fert += e.fertilite[ix(e, x, y)]; n++; }
          fert = fert / n;
        }
        // Arrondi au-dessus et report du reste : 8 charges par an tombent juste, au jour près.
        b.prog += Math.ceil(fin * d.chargesParAn * r * fert / (D.joursParAn * 100));
      }
      if (b.prog >= fin && b.stock < 1) { b.stock = 1; b.prog -= fin; }
      if (b.prog > fin) b.prog = fin; // stock plein : la production attend le livreur
    }
    if (b.stock >= 1 && !b.m && r > 0) livrer(e, b, d.produit);
  }

  // Quai de pêche : son bateau gagne le banc de poissons le plus proche par l'eau, y pêche
  // quelques jours et rapporte une charge (section 7.2).
  function quotidienPeche(e, b, r) {
    if (r <= 0 || b.stock >= 1 || b.mb) return;
    var quai = quaiEau(e, b);
    var bancs = new Set(e.bancs);
    var p = quai < 0 || !bancs.size ? null : parcours(e, [quai], passableEau(e), function (j) { return bancs.has(j); }, D.regles.peche.porteeBateau);
    if (!p) { b.sansBanc = 1; return; }
    b.sansBanc = 0;
    var w = creerMarcheur(e, 'bateau', quai, { o: b.id, phase: 'aller', quai: quai, ch: p.chemin, k: 0 });
    b.mb = w.id;
  }

  // Atelier : 1 charge de matière donne 1 charge de bien, 4 par an à plein effectif (section 8.2).
  function quotidienAtelier(e, b, d) {
    var fin = D.regles.ferme.progressionCharge, r = taux(b), Q = charge();
    if (r > 0 && b.stock < 1 && b.mat >= Q) {
      b.prog += Math.ceil(fin * d.chargesParAn * r / D.joursParAn);
      if (b.prog >= fin) { b.prog = Math.min(fin, b.prog - fin); b.mat -= Q; b.stock = 1; }
    }
    if (b.stock >= 1 && !b.m && r > 0) livrer(e, b, d.produit);
  }

  function quotidienMarche(e, b) {
    var Mr = D.regles.marche, r = taux(b);
    if (b.cptV > 0) b.cptV--;
    for (var g0 in b.dem) if (--b.dem[g0] <= 0) delete b.dem[g0];
    if (r <= 0) return;
    var a = acces(e, b);
    if (!a.length) return;
    // Acheteuse : le produit qui manque le plus d'abord (rapporté à son seuil ; à égalité, celui
    // qui a été acheté il y a le plus longtemps), au grenier ou à l'entrepôt le plus proche qui en
    // détient (40 cases de route au plus) ; sinon le suivant.
    if (!b.mA) {
      var der = b.der || (b.der = {});
      var besoins = besoinsMarche(b).sort(function (x, y) {
        return (b.stocks[x] || 0) / (estAliment(x) ? Mr.seuilAchat : Mr.seuilBien) - (b.stocks[y] || 0) / (estAliment(y) ? Mr.seuilAchat : Mr.seuilBien) ||
          (der[x] || 0) - (der[y] || 0) || D.listeBiens.indexOf(x) - D.listeBiens.indexOf(y);
      });
      for (var n = 0; n < besoins.length; n++) {
        var g = besoins[n], cibles = new Map();
        for (var j = 0; j < e.batiments.length; j++) {
          var dep = e.batiments[j];
          if ((dep.type !== 'grenier' && dep.type !== 'entrepot') || !((dep.stocks[g] || 0) > 0)) continue;
          acces(e, dep).forEach(function (i) { if (!cibles.has(i)) cibles.set(i, dep); });
        }
        if (!cibles.size) continue;
        var p = parcours(e, a, passableRoute(e), function (i) { return cibles.has(i); }, Mr.porteeAcheteuse);
        if (!p) continue;
        var w = creerMarcheur(e, 'acheteuse', p.depart, { o: b.id, cb: cibles.get(p.fin).id, phase: 'aller', g: g, ld: null, ch: p.chemin, k: 0 });
        b.mA = w.id;
        der[g] = e.tick;
        break;
      }
    }
    // Vendeuse : errante ; même sans stock, elle relève ce que les maisons réclament.
    if (!b.mV && !b.cptV) {
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
    // Lieu de spectacle qui manque de cet artiste (spectacle fini ou presque, aucun en route).
    var cibles = new Map();
    e.batiments.forEach(function (t) {
      var dt = def(t);
      if (dt.genre !== 'spectacle' || dt.artistes.indexOf(d.forme) < 0 || t.attendus[d.forme] || (t.spects[d.forme] || 0) > S.rappelJours) return;
      acces(e, t).forEach(function (i) { if (!cibles.has(i)) cibles.set(i, t); });
    });
    if (!cibles.size) return;
    var p = parcours(e, a, passableRoute(e), function (i) { return cibles.has(i); }, 6 * e.N);
    if (!p) return;
    var th = cibles.get(p.fin);
    var w = creerMarcheur(e, d.forme, p.depart, { o: b.id, cb: th.id, phase: 'aller', ch: p.chemin, k: 0 });
    th.attendus[d.forme] = w.id;
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
    // Maisons qui ont de la place, dans l'ordre de construction, rangées par case d'entrée
    // (route à 2 cases ou moins, ou leur propre case) ; une seule recherche de chemin donne
    // les entrées les plus proches de la voie de Rome.
    var entrees = new Map();
    e.batiments.forEach(function (h) {
      if (!estMaison(h) || h.sansRoute || capacite(h) - h.hab - h.att <= 0) return;
      entreesMaison(e, h).forEach(function (i) { var l = entrees.get(i); if (!l) entrees.set(i, (l = [])); l.push(h); });
    });
    if (!entrees.size) return;
    var n = Math.min(8, Math.ceil(e.creditImmigration / J / I.groupeMax) + 1);
    var l = parcoursMulti(e, [e.entree], passableLibre(e), function (j) { return entrees.has(j); }, 6 * e.N, n * 3);
    var servies = 0;
    for (var k = 0; k < l.length && e.creditImmigration >= J && servies < n; k++) {
      var maisons = entrees.get(l[k].fin);
      for (var m = 0; m < maisons.length && e.creditImmigration >= J; m++) {
        var h = maisons[m], g = Math.min(I.groupeMax, Math.floor(e.creditImmigration / J), capacite(h) - h.hab - h.att);
        if (g <= 0) continue;
        creerMarcheur(e, 'immigrant', e.entree, { gens: g, cb: h.id, ch: l[k].chemin, k: 0 });
        h.att += g;
        e.creditImmigration -= g * J;
        servies++;
        break;
      }
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
      h.hab -= q; n -= q; e.flux.emi += q;
      if (h.hab === 0) { h.niv = 0; h.viv = {}; }
      var i = pointDeSortie(e, ix(e, h.x, h.y));
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
      // Biens : 1 unité par case occupée et par mois (section 5.1).
      var parCase = D.regles.maison.biensParCaseMois * h.t * h.t;
      for (var g in h.viv) if (!estAliment(g) && h.viv[g] > 0) h.viv[g] = Math.max(0, h.viv[g] - parCase);
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
    e.sante = calculerSante(e);
    epidemie(e);
    e.histo.push({ m: moisEcoules, pop: e.pop, tresor: e.tresor, humeur: e.humeur, sante: e.sante, imm: e.flux.imm, emi: e.flux.emi, morts: e.flux.morts });
    e.flux = { imm: 0, emi: 0, morts: 0 };
    if (e.histo.length > 240) e.histo.shift();
    if (moisEcoules > 0 && moisEcoules % D.temps.moisParAn === 0) {
      e.finances.prec = e.finances.an;
      e.finances.an = nouveauBudget();
      noter(e, 'msg.nouvelleAnnee', { annee: date(e).annee }, false);
    }
    verifierFin(e, moisEcoules);
  }
  function nouveauMois(e) { moisNourriture(e); moisFinances(e); moisHumeur(e); moisBilan(e); }

  // Santé de la ville (section 9.4), de 0 à 100 : maisons couvertes par un médecin ou un hôpital
  // (50 points), par des bains (20), variété alimentaire (20 : 3 aliments ou plus = plein),
  // absence de pénurie (10).
  function calculerSante(e) {
    var S = D.regles.sante, n = 0, med = 0, bains = 0, variete = 0, affamees = 0;
    e.batiments.forEach(function (h) {
      if (!estMaison(h) || h.hab <= 0) return;
      n++;
      if (h.svc.medecin > 0 || h.svc.hopital > 0) med++;
      if (h.svc.bains > 0) bains++;
      var t = 0;
      D.aliments.forEach(function (a) { if ((h.viv[a] || 0) > 0) t++; });
      variete += Math.min(t, S.varieteTypes) / S.varieteTypes;
      if (niveauDef(h).besoinsCumul.nourriture && t === 0) affamees++;
    });
    if (!n) return 0;
    return Math.round((S.medecin * med + S.bains * bains + S.variete * variete + S.penurie * (n - affamees)) / n);
  }

  // Épidémie : santé sous le seuil, 5 % de risque par mois ; 1 à 3 maisons sans médecin ni
  // hôpital perdent leurs habitants et restent vides 2 mois. Seulement dans une partie avec
  // risques où médecin ou hôpital peuvent être construits.
  function epidemie(e) {
    var S = D.regles.sante;
    if (!e.epidemies || e.pop <= 0 || e.sante >= S.seuilEpidemie) return;
    if (hasard(e, 100) >= S.risqueEpidemie) return;
    var cibles = e.batiments.filter(function (h) { return estMaison(h) && h.hab > 0 && !(h.svc.medecin > 0) && !(h.svc.hopital > 0); });
    if (!cibles.length) return;
    var nb = S.maisonsEpidemie[0] + hasard(e, S.maisonsEpidemie[1] - S.maisonsEpidemie[0] + 1), lieu = -1;
    for (var k = 0; k < nb && cibles.length; k++) {
      var h = cibles.splice(hasard(e, cibles.length), 1)[0];
      e.flux.morts += h.hab;
      h.hab = 0; h.niv = 0; h.viv = {}; h.ok = 0; h.manque = 0;
      h.quar = S.videMois * D.temps.joursParMois;
      lieu = ix(e, h.x, h.y);
    }
    e.stats.epidemies++;
    majPopulation(e);
    noter(e, 'msg.epidemie', {}, true, lieu);
  }

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
    majPopulation(e); verifierTutoriel(e); verifierVictoire(e); calculerAttractivite(e);
  }

  // Temps de la journée (ticks) où se font les calculs globaux, étalés pour éviter les à-coups.
  var PHASES = { travail: 0, eau: 10, pompiers: 20, immigration: 25, bilan: 35, attractivite: 45, nourriture: 5, finances: 15, humeur: 30, mois: 40 };

  function pas(e) {
    e.tick++;
    var J = D.temps.ticksParJour, phase = e.tick % J;
    var premierJour = Math.floor(e.tick / J) % D.temps.joursParMois === 0 && e.tick >= J;
    if (phase === PHASES.travail) repartirTravail(e);
    else if (phase === PHASES.eau) calculerEau(e);
    else if (phase === PHASES.pompiers) envoyerPompiers(e);
    else if (phase === PHASES.immigration) immigrer(e);
    else if (phase === PHASES.bilan) { majPopulation(e); verifierTutoriel(e); verifierVictoire(e); }
    else if (phase === PHASES.attractivite) calculerAttractivite(e);
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
    if (d.genre === 'maison' || d.genre === 'ruines' || d.genre === 'incendie' || d.genre === 'puits' || d.genre === 'deco' || d.genre === 'oracle') return null;
    if (d.genre === 'reservoir') return b.plein ? null : 'sansEau';
    if (!d.sansRoute && !acces(e, b).length) return 'pasDeRoute';
    if (d.effectif && taux(b) <= 0) return 'pasDePersonnel';
    if (d.genre === 'fontaine' && !b.actif) return 'sansEau';
    if (d.eauRequise && !b.actif) return 'sansReservoir';
    if (d.genre === 'peche' && b.sansBanc && !b.mb) return 'sansBanc';
    if ((d.genre === 'ferme' || d.genre === 'extraction' || d.genre === 'peche' || d.genre === 'atelier') && b.stock >= 1 && !b.m) return 'sansPreneur';
    if (d.genre === 'atelier' && b.mat < charge() && b.stock < 1) return 'sansMatiere';
    if (d.genre === 'marche' && totalStock(b) <= 0 && !b.mA) return 'sansMarchandise';
    if (d.genre === 'spectacle' && !d.artistes.some(function (a) { return (b.spects[a] || 0) > 0; })) return 'sansArtiste';
    return null;
  }

  // Emplacements d'un entrepôt pour le dessin et le panneau : 8 cases [bien, quarts] ou null.
  function emplacements(b) {
    var E = D.regles.entrepot, cap = E.chargesParEmplacement * charge(), l = [];
    D.listeBiens.forEach(function (g) {
      var q = b.stocks[g] || 0;
      while (q > 0 && l.length < E.emplacements) { var u = Math.min(cap, q); l.push([g, Math.max(1, Math.ceil(u * 4 / cap))]); q -= u; }
    });
    while (l.length < E.emplacements) l.push(null);
    return l;
  }

  // Couverture des services (conseillers, section 17.4) : habitants et maisons desservis.
  function couverture(e) {
    var c = { maisons: 0, pop: 0, svc: {}, divert: 0, religion: [0, 0, 0, 0, 0, 0], niveaux: [], penurie: 0 };
    for (var n = 0; n <= D.maisons.length; n++) c.niveaux.push(0);
    ['ecole', 'bibliotheque', 'academie', 'barbier', 'bains', 'medecin', 'hopital', 'impot'].forEach(function (k) { c.svc[k] = { maisons: 0, pop: 0 }; });
    e.batiments.forEach(function (h) {
      if (!estMaison(h) || h.hab <= 0) return;
      c.maisons++; c.pop += h.hab; c.niveaux[h.niv] += h.hab;
      for (var k in c.svc) if (h.svc[k] > 0) { c.svc[k].maisons++; c.svc[k].pop += h.hab; }
      var s = satisfaits(e, h);
      c.divert += s.divertissement * h.hab;
      c.religion[Math.min(5, s.religion)] += h.hab;
      if (niveauDef(h).besoinsCumul.nourriture && s.nourriture === 0) c.penurie++;
    });
    c.divert = c.pop ? Math.round(c.divert / c.pop) : 0;
    return c;
  }

  // Emplois par catégorie de travail (conseiller du travail).
  function travailCategories(e) {
    var t = {};
    D.regles.travail.categories.forEach(function (k) { t[k] = { requis: 0, pourvus: 0, batiments: 0 }; });
    e.batiments.forEach(function (b) {
      var d = def(b);
      if (!d.effectif || !t[d.travail]) return;
      t[d.travail].requis += d.effectif; t[d.travail].pourvus += b.eff; t[d.travail].batiments++;
    });
    return t;
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
      if (b.type === 'entrepot') {
        var E = D.regles.entrepot, cap = E.chargesParEmplacement * charge(), n = 0;
        for (var g in b.stocks) n += Math.ceil(b.stocks[g] / cap);
        if (n > E.emplacements) pb.push('entrepôt ' + b.id + ' : ' + n + ' emplacements occupés');
      }
      if (def(b).genre === 'atelier' && (b.mat < 0 || b.mat > D.regles.atelier.attenteMax * charge())) pb.push('atelier ' + b.id + ' : matière ' + b.mat);
      for (var y = b.y; y < b.y + b.t; y++) for (var x = b.x; x < b.x + b.t; x++) {
        if (!dedans(e, x, y) || e.bat[ix(e, x, y)] !== b.id) { pb.push(b.type + ' ' + b.id + ' : emprise abîmée'); y = b.y + b.t; break; }
      }
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
  var TYPES = { u8: Uint8Array, i32: Int32Array, i8: Int8Array };

  function exporter(e) {
    var o = {};
    Object.keys(e).forEach(function (k) {
      if (k.charAt(0) === '_') return;
      var v = e[k];
      if (v instanceof Uint8Array) o[k] = { __t: 'u8', d: versB64(v) };
      else if (v instanceof Int32Array) o[k] = { __t: 'i32', d: versB64(v) };
      else if (v instanceof Int8Array) o[k] = { __t: 'i8', d: versB64(v) };
      else o[k] = v;
    });
    return JSON.stringify(o);
  }

  function importer(txt) {
    var o = typeof txt === 'string' ? JSON.parse(txt) : txt;
    if (!o || typeof o !== 'object') throw new Error('sauvegarde illisible');
    if (o.v !== VERSION_ETAT && o.v !== 1) throw new Error('version de sauvegarde inconnue : ' + o.v);
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
    if (o.v === 1) completerV1(e);
    if (!e.attract || e.attract.length !== n) throw new Error('sauvegarde abîmée : attract');
    return e;
  }

  // Sauvegarde du lot 1 : champs du lot 2 ajoutés avec leurs valeurs de départ.
  function completerV1(e) {
    var m = MISSIONS[e.mission];
    e.v = VERSION_ETAT;
    e.tout = false;
    e.risques = !!m.risques;
    e.attractivite = !!e.libre || m.attractivite !== false;
    e.epidemies = e.risques && m.batiments.some(function (k) { return k === 'medecin' || k === 'hopital'; });
    e.attract = new Int8Array(e.N * e.N);
    e.priorites = {}; e.sante = 0; e.flux = { imm: 0, emi: 0, morts: 0 };
    e.stats.epidemies = 0;
    placerBancs(e, m.carte);
    e.batiments.forEach(function (b) {
      var g = def(b).genre;
      if (g === 'maison') { b.pts = {}; b.quar = 0; b.bloque = 0; }
      else if (g === 'grenier') { b.cons = {}; b.mc = 0; }
      else if (g === 'marche') { b.interdits = {}; b.dem = {}; b.der = {}; }
      else if (g === 'spectacle') { b.spects = { acteur: b.spect || 0 }; b.attendus = { acteur: b.attendu || 0 }; delete b.spect; delete b.attendu; }
    });
    e.marcheurs.forEach(function (w) {
      if (w.type === 'livreur' && w.phase === 'aller' && w.ld && w.cb) w.res = [w.cb, w.ld.g, w.ld.q];
    });
    calculerAttractivite(e);
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
    calculerAttractivite: calculerAttractivite,
    attractiviteDe: attractiviteDe,
    emplacements: emplacements,
    placeDans: placeDans,
    consigne: consigne,
    besoinsMarche: besoinsMarche,
    pointsSpectacle: pointsSpectacle,
    couverture: couverture,
    travailCategories: travailCategories,
    calculerSante: calculerSante,
    quaiEau: quaiEau,
    // Outils réservés aux villes d'exemple (affiche, aperçus) et aux tests : jamais appelés par le joueur.
    _outils: {
      creerBatiment: creerBatiment, creerMarcheur: creerMarcheur, emettreErrant: emettreErrant, ix: ix, noter: noter,
      finances: finances, consommer: consommer, quotidien: quotidien, nouveauMois: nouveauMois, nouveauJour: nouveauJour,
      enflammer: enflammer, immigrer: immigrer, verifierTutoriel: verifierTutoriel, composantes: composantes,
      deposer: deposer, agrandir: agrandir, diviser: diviser, epidemie: epidemie
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
