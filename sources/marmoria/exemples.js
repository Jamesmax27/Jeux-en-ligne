/* ==========================================================================
   Marmoria — villes d'exemple (affiche, aperçus de la page du jeu, tests)

   Une ville d'exemple est bâtie uniquement par des commandes de la simulation
   (MM_SIM.appliquer), de façon déterministe : même mission, même graine, même
   niveau → même ville. Trois niveaux (cahier des charges, section 18.3) :
     1 = village de début (logements, puits, ferme, grenier, marché) ;
     2 = bourg (préfecture, ingénieur, forum, temple en plus) ;
     3 = ville de fin de lot (réservoirs, aqueduc, fontaines, théâtre, colonie d'acteurs).
   Ce fichier n'utilise pas la page : il tourne aussi sous Node.
   ========================================================================== */
(function (racine) {
  'use strict';

  var PAS = 5; // une route, puis un pâté de 4 × 4 cases (toutes à 2 cases ou moins d'une route)

  function ligneRome(sim, e) {
    for (var y = 0; y < e.N; y++) if (e.route[y * e.N] === sim.R.ROME) return y;
    return Math.floor(e.N / 2);
  }

  function cmd(sim, e, c) { return sim.appliquer(e, c); }

  // Déblaie seulement les arbres de ces cases (jamais un bâtiment).
  function degager(sim, e, cases) {
    var l = cases.filter(function (c) { return e.terrain[c[1] * e.N + c[0]] === sim.T.ARBRES && !e.bat[c[1] * e.N + c[0]]; });
    if (l.length) cmd(sim, e, { type: 'tracer', bat: 'deblayer', cases: l });
  }

  // Ligne de route ou d'aqueduc entre deux cases (en L : d'abord en x, puis en y).
  function ligne(x0, y0, x1, y1) {
    var l = [], x = x0, y = y0;
    l.push([x, y]);
    while (x !== x1) { x += x1 > x ? 1 : -1; l.push([x, y]); }
    while (y !== y1) { y += y1 > y ? 1 : -1; l.push([x, y]); }
    return l;
  }

  // Rôles des pâtés, du centre vers l'extérieur, selon le niveau de la ville.
  var ROLES = {
    1: ['maisons', 'maisons', 'grenier', 'maisons', 'marche', 'maisons', 'maisons', 'maisons'],
    2: ['maisons', 'forum', 'grenier', 'maisons', 'marche', 'maisons', 'temple', 'maisons', 'maisons', 'maisons', 'marche', 'maisons', 'temple', 'maisons'],
    3: ['maisons', 'forum', 'grenier', 'maisons', 'marche', 'theatre', 'maisons', 'temple', 'maisons', 'colonie', 'maisons', 'marche', 'reservoir', 'maisons', 'temple', 'maisons', 'grenier', 'maisons', 'theatre', 'maisons', 'marche', 'maisons', 'maisons', 'temple', 'maisons', 'maisons']
  };

  // Remplit un pâté (coin haut-gauche x, y ; 4 × 4 cases) selon son rôle.
  function remplir(sim, e, x, y, role, niveau, n) {
    var TYPES = { grenier: 'grenier', colonie: 'colonie_acteurs', reservoir: 'reservoir', marche: 'marche', forum: 'forum', temple: 'temple_ceres', theatre: 'theatre' };
    var pris = {}, maisons = [], k, cx, cy;
    // Le grand bâtiment du pâté se pose dans le coin nord-ouest : il touche deux routes.
    if (TYPES[role]) {
      var t = sim.donnees().batiments[TYPES[role]].taille;
      sim.appliquer(e, { type: 'poser', bat: TYPES[role], x: x, y: y });
      for (cy = y; cy < y + t; cy++) for (cx = x; cx < x + t; cx++) pris[cx + ',' + cy] = 1;
    }
    for (cy = y; cy < y + 4; cy++) for (cx = x; cx < x + 4; cx++) if (!pris[cx + ',' + cy]) maisons.push([cx, cy]);
    // Services de quartier : puits partout, préfecture et ingénieur dès le niveau 2, fontaine au niveau 3.
    var services = ['puits'];
    if (niveau >= 2 && n % 3 === 0) services.push('prefecture');
    if (niveau >= 2 && n % 4 === 1) services.push('ingenieur');
    if (niveau >= 3 && role === 'maisons') services.push('fontaine');
    for (k = 0; k < services.length && maisons.length > 2; k++) {
      var p = maisons.splice(k === 0 ? Math.min(5, maisons.length - 1) : maisons.length - 1 - k, 1)[0];
      if (p) cmd(sim, e, { type: 'poser', bat: services[k], x: p[0], y: p[1] });
    }
    if (maisons.length) cmd(sim, e, { type: 'tracer', bat: 'logement', cases: maisons });
  }

  // Cherche, par ordre de distance au centre, un carré t × t de prairie libre.
  function chercherPrairie(sim, e, cx, cy, t, rayon) {
    var best = null, bd = 1e9;
    for (var y = 1; y < e.N - t - 1; y++) for (var x = 1; x < e.N - t - 1; x++) {
      var d = Math.abs(x - cx) + Math.abs(y - cy);
      if (d >= bd || d > rayon) continue;
      if (sim.peutPlacer(e, 'ferme_ble', x, y) === null) { best = [x, y]; bd = d; }
    }
    return best;
  }

  // Relie une case à la route la plus proche (parcours sur les cases où une route peut aller).
  function relier(sim, e, depart) {
    var N = e.N, prev = new Int32Array(N * N).fill(-2), file = [], t = 0;
    depart.forEach(function (i) {
      // Départ : seulement une case où une route peut aller (jamais sous un autre bâtiment).
      var libre = e.route[i] || (!e.bat[i] && (sim.peutPlacer(e, 'route', i % N, Math.floor(i / N)) === null || e.terrain[i] === sim.T.ARBRES));
      if (libre && prev[i] === -2) { prev[i] = -1; file.push(i); }
    });
    while (t < file.length) {
      var i = file[t++];
      if (e.route[i]) {
        var l = [];
        for (var j = prev[i]; j >= 0; j = prev[j]) l.push([j % N, Math.floor(j / N)]);
        if (l.length) { degager(sim, e, l); cmd(sim, e, { type: 'tracer', bat: 'route', cases: l }); }
        return true;
      }
      var x = i % N, y = (i - x) / N, vs = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
      for (var k = 0; k < 4; k++) {
        var vx = vs[k][0], vy = vs[k][1];
        if (vx < 0 || vy < 0 || vx >= N || vy >= N) continue;
        var v = vy * N + vx;
        if (prev[v] !== -2) continue;
        if (!e.route[v] && sim.peutPlacer(e, 'route', vx, vy) !== null && !(e.terrain[v] === sim.T.ARBRES && !e.bat[v])) continue;
        prev[v] = i; file.push(v);
      }
    }
    return false;
  }

  function cotes(b) {
    var l = [];
    for (var k = 0; k < b.t; k++) { l.push([b.x + k, b.y - 1], [b.x + b.t, b.y + k], [b.x + k, b.y + b.t], [b.x - 1, b.y + k]); }
    return l;
  }

  /**
   * Bâtit une ville d'exemple sur un état neuf créé avec { libre: true }.
   * options : { niveau: 1 | 2 | 3, colonnes, rangees, fermes }
   */
  function construire(sim, e, options) {
    options = options || {};
    var niveau = options.niveau || 1, N = e.N, R = ligneRome(sim, e);
    var nc = options.colonnes || (niveau === 1 ? 3 : niveau === 2 ? 4 : 6);
    var nr = options.rangees || (niveau === 1 ? 1 : niveau === 2 ? 2 : 2);
    if (options.illimite !== false) e.tresor = 1e9; // ville d'exemple : pas de contrainte d'argent
    var x0 = Math.max(3, Math.floor(N / 2 - nc * PAS / 2)), y0 = R - nr * PAS, y1 = R + nr * PAS;
    while (y0 < 2) y0 += PAS;
    while (y1 > N - 3) y1 -= PAS;
    var x1 = Math.min(N - 4, x0 + nc * PAS);
    // Déblaiement des arbres (jamais des bâtiments : la fonction peut être rappelée), puis grille de routes.
    var zone = [];
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (e.terrain[y * N + x] === sim.T.ARBRES) zone.push([x, y]);
    cmd(sim, e, { type: 'tracer', bat: 'deblayer', cases: zone });
    for (var ry = y0; ry <= y1; ry += PAS) cmd(sim, e, { type: 'tracer', bat: 'route', cases: ligne(x0, ry, x1, ry) });
    for (var rx = x0; rx <= x1; rx += PAS) cmd(sim, e, { type: 'tracer', bat: 'route', cases: ligne(rx, y0, rx, y1) });
    // Pâtés, du centre vers l'extérieur.
    var pates = [];
    for (var by = y0 + 1; by + 3 < y1 + 1; by += PAS) for (var bx = x0 + 1; bx + 3 < x1 + 1; bx += PAS) pates.push([bx, by]);
    var cx = (x0 + x1) / 2, cy = R;
    pates.sort(function (a, b) { return (Math.abs(a[0] + 2 - cx) + Math.abs(a[1] + 2 - cy)) - (Math.abs(b[0] + 2 - cx) + Math.abs(b[1] + 2 - cy)) || a[1] - b[1] || a[0] - b[0]; });
    var roles = ROLES[niveau];
    pates.forEach(function (p, n) { remplir(sim, e, p[0], p[1], roles[n % roles.length], niveau, n); });
    // Fermes sur la prairie la plus proche, reliées à la route.
    var nf = options.fermes || (niveau === 1 ? 2 : niveau === 2 ? 3 : 5);
    var dejaFermes = e.batiments.filter(function (b) { return b.type === 'ferme_ble'; }).length;
    for (var f = dejaFermes; f < nf; f++) {
      var pos = chercherPrairie(sim, e, cx, cy, 3, N);
      if (!pos) break;
      var r = cmd(sim, e, { type: 'poser', bat: 'ferme_ble', x: pos[0], y: pos[1] });
      if (!r.ok) break;
      var ferme = sim.batA(e, pos[0], pos[1]);
      relier(sim, e, cotes(ferme).filter(function (c) { return c[0] >= 0 && c[1] >= 0 && c[0] < N && c[1] < N; }).map(function (c) { return c[1] * N + c[0]; }));
    }
    // Eau courante (niveau 3) : réservoir au bord de l'eau, aqueduc jusqu'au réservoir de la ville.
    if (niveau >= 3) {
      var ville = null, nres = 0;
      e.batiments.forEach(function (b) { if (b.type === 'reservoir') { nres++; if (!ville) ville = b; } });
      if (ville && nres < 2) {
        var best = null, bd = 1e9;
        for (var yy = 1; yy < N - 4; yy++) for (var xx = 1; xx < N - 4; xx++) {
          var d = Math.abs(xx - ville.x) + Math.abs(yy - ville.y);
          if (d >= bd) continue;
          if (sim.peutPlacer(e, 'reservoir', xx, yy) !== null) continue;
          var mouille = false;
          for (var k = 0; k < 3 && !mouille; k++) {
            var cs = [[xx + k, yy - 1], [xx + 3, yy + k], [xx + k, yy + 3], [xx - 1, yy + k]];
            for (var c = 0; c < 4; c++) if (cs[c][0] >= 0 && cs[c][1] >= 0 && cs[c][0] < N && cs[c][1] < N && e.terrain[cs[c][1] * N + cs[c][0]] === sim.T.EAU) mouille = true;
          }
          if (mouille) { best = [xx, yy]; bd = d; }
        }
        if (best) {
          cmd(sim, e, { type: 'poser', bat: 'reservoir', x: best[0], y: best[1] });
          var a = ligne(best[0] + 1, best[1] + (best[1] < ville.y ? 3 : -1), ville.x + 1, ville.y + (best[1] < ville.y ? -1 : ville.t));
          degager(sim, e, a);
          cmd(sim, e, { type: 'tracer', bat: 'aqueduc', cases: a });
        }
      }
    }
    sim.calculerEau(e);
    sim.majPopulation(e);
    return { x0: x0, y0: y0, x1: x1, y1: y1, centre: [Math.round(cx), cy] };
  }

  // ------------------------------------------------------------------------
  // Joueur raisonnable : rejoue le plan d'une ville d'exemple sur une vraie partie,
  // comme un joueur prudent (tests du tutoriel, villes mûries des aperçus).
  // ------------------------------------------------------------------------

  var PRIORITE = { ferme_ble: 0, prefecture: 1, grenier: 2, marche: 3, ingenieur: 4, forum: 5, temple_ceres: 6, fontaine: 7, colonie_acteurs: 8, theatre: 9 };

  // Relève le plan (liste de commandes) sur un état libre de la même mission.
  function planifier(sim, idMission, options) {
    var brouillon = sim.nouvelle(idMission, { libre: true, graine: options && options.graine });
    var plan = [], orig = sim.appliquer;
    sim.appliquer = function (e, c) { plan.push(JSON.parse(JSON.stringify(c))); return orig(e, c); };
    try { construire(sim, brouillon, options); } finally { sim.appliquer = orig; }
    var D = sim.donnees(), infra = [], travail = [], logements = [];
    plan.forEach(function (c) {
      if (c.bat === 'logement') c.cases.forEach(function (cs) { logements.push(cs); });
      else if (c.type === 'poser' && D.batiments[c.bat].effectif > 0) travail.push(c);
      else infra.push(c);
    });
    // Tour à tour : le 1er de chaque type (dans l'ordre des priorités), puis le 2e de chaque type…
    var rang = {}, cle = new Map();
    travail.forEach(function (c, k) {
      rang[c.bat] = (rang[c.bat] || 0) + 1;
      cle.set(c, rang[c.bat] * 100 + (c.bat in PRIORITE ? PRIORITE[c.bat] : 9) + k / 10000);
    });
    travail.sort(function (a, b) { return cle.get(a) - cle.get(b); });
    return { infra: infra, travail: travail, logements: logements };
  }

  // Un tour de jeu : infrastructures, bâtiments à personnel tant qu'il y a des
  // travailleurs, logements quand les places libres manquent.
  function jouer(sim, e, plan, options) {
    options = options || {};
    var D = sim.donnees();
    // Ruines et gravats déblayés pour rebâtir.
    var ruines = [];
    e.batiments.forEach(function (b) { if (b.type === 'ruines' || b.type === 'gravats') ruines.push([b.x, b.y]); });
    if (ruines.length) sim.appliquer(e, { type: 'tracer', bat: 'deblayer', cases: ruines });
    plan.infra.forEach(function (c) {
      // Déblaiement rejoué : seulement les arbres qui restent (jamais ce qui a été bâti depuis).
      if (c.bat === 'deblayer') degager(sim, e, c.cases);
      else sim.appliquer(e, c);
    });
    var emplois = e.emploisRequis, marge = options.marge === undefined ? 12 : options.marge;
    plan.travail.forEach(function (c) {
      var b = sim.batA(e, c.x, c.y);
      if (b && b.type === c.bat) return;
      var d = D.batiments[c.bat];
      if (emplois + d.effectif > e.travailleurs + marge) return;
      if (sim.appliquer(e, c).ok) emplois += d.effectif;
    });
    var libres = sim.placesLibres(e), k = 0, voulu = options.places || 40;
    while (libres < voulu && k < plan.logements.length) {
      var p = plan.logements[k++];
      if (sim.appliquer(e, { type: 'poser', bat: 'logement', x: p[0], y: p[1] }).ok) libres += D.regles.maison.terrainVagueHabitants;
    }
  }

  racine.MM_EXEMPLES = { construire: construire, ligneRome: ligneRome, planifier: planifier, jouer: jouer };
})(typeof window !== 'undefined' ? window : globalThis);
