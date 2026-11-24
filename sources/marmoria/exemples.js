/* ==========================================================================
   Marmoria — villes d'exemple (affiche, aperçus de la page du jeu, tests)

   Une ville d'exemple est bâtie uniquement par des commandes de la simulation
   (MM_SIM.appliquer), de façon déterministe : même mission, même graine, même
   niveau → même ville. Trois niveaux (cahier des charges, section 18.3) :
     1 = village de début (logements, puits, ferme, grenier, marché) ;
     2 = bourg (préfecture, ingénieur, forum, temple en plus) ;
     3 = ville de fin de lot 1 (réservoirs, aqueduc, fontaines, théâtre, colonie d'acteurs) ;
     4 = cité du lot 2 (industrie, entrepôt, écoles, santé, spectacles, quartier de prestige
         entouré de places pavées, de jardins et de statues, où les insulae montent au niveau 12).
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
    if ((options.niveau || 1) >= 4) return construireLot2(sim, e, options);
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
  // Cité du lot 2 (construction libre, tous les bâtiments) : 10 × 3 pâtés de part et d'autre
  // de la voie de Rome. Le quartier de prestige (2 pâtés au centre, au nord) est bordé de places
  // pavées, d'une bande de jardins, de statues, des temples, de la bibliothèque, des bains et du
  // théâtre ; marchés, écoles, greniers et ateliers (qui font baisser l'attractivité) sont
  // tenus à l'écart. Industrie près de ses ressources, fermes sur les prairies.
  // ------------------------------------------------------------------------

  function construireLot2(sim, e, options) {
    var N = e.N, R = ligneRome(sim, e), D = sim.donnees();
    if (options.illimite !== false) e.tresor = 1e9;
    var cx = Math.floor(N / 2), x0 = cx - 25, x1 = x0 + 50, y0 = R - 10, y1 = R + 5;
    function bloc(c, r) { return [x0 + 1 + c * PAS, y0 + 1 + r * PAS]; }
    function poser(type, x, y) { degagerZone(x, y, D.batiments[type].taille); return cmd(sim, e, { type: 'poser', bat: type, x: x, y: y }).ok; }
    function degagerZone(x, y, t) { var l = []; for (var yy = y; yy < y + t; yy++) for (var xx = x; xx < x + t; xx++) l.push([xx, yy]); degager(sim, e, l); }
    // 1. Déblaiement de la grille et routes.
    var zone = [];
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (e.terrain[y * N + x] === sim.T.ARBRES) zone.push([x, y]);
    cmd(sim, e, { type: 'tracer', bat: 'deblayer', cases: zone });
    for (var ry = y0; ry <= y1; ry += PAS) if (ry !== R) cmd(sim, e, { type: 'tracer', bat: 'route', cases: ligne(x0, ry, x1, ry) });
    for (var rx = x0; rx <= x1; rx += PAS) cmd(sim, e, { type: 'tracer', bat: 'route', cases: ligne(rx, y0, rx, y1) });
    // 2. Eau : réservoir de la ville au nord du quartier de prestige, relié par aqueduc à un
    // réservoir posé au bord de l'eau.
    var pr = bloc(4, 0), vx = pr[0] + 3, vy = y0 - 5;
    poser('reservoir', vx, vy);
    var ville = sim.batA(e, vx, vy);
    if (ville && ville.type === 'reservoir') relierReservoir(sim, e, ville);
    // 3. Pâtés : rôle de chaque pâté (colonne, rangée) ; le reste en logements.
    // Quartier fermé (colonnes 3 à 6 de la rangée nord, et la moitié haute de la rangée
    // suivante) : tous les services des insulae y sont, à quelques cases des deux pâtés de
    // prestige, et des barrières y retiennent leurs errants (section 4.4), sinon ils se perdent
    // dans le reste de la ville. Statues et jardins au nord, hors des routes.
    var ROLE = {
      '4,0': 'prestige', '5,0': 'prestige',
      '3,0': [['amphitheatre', 0, 0], ['jardin', 3, 0], ['jardin', 3, 1], ['jardin', 3, 2], ['jardin', 0, 3], ['jardin', 1, 3], ['medecin', 2, 3], ['barbier', 3, 3]],
      '6,0': [['amphitheatre', 1, 0], ['jardin', 0, 0], ['jardin', 0, 1], ['prefecture', 0, 2], ['ingenieur', 0, 3], ['jardin', 1, 3], ['barbier', 2, 3], ['medecin', 3, 3]],
      '3,1': [['temple_ceres', 0, 0], ['temple_venus', 2, 0], ['puits', 0, 3], ['prefecture', 3, 3]],
      '4,1': [['marche', 0, 0], ['theatre', 2, 0], ['puits', 1, 3]],
      '5,1': [['bains', 0, 0], ['marche', 2, 0], ['puits', 1, 3]],
      '6,1': [['ecole', 0, 0], ['bibliotheque', 2, 0], ['puits', 1, 3]],
      '4,2': [['grenier', 0, 0], ['prefecture', 3, 3]], '5,2': [['grenier', 0, 0], ['ingenieur', 3, 3]],
      '2,0': [['marche', 0, 0], ['forum', 2, 0], ['fontaine', 3, 3]],
      '7,0': [['ecole', 0, 0], ['puits', 3, 3], ['prefecture', 3, 0]],
      '2,1': [['grenier', 0, 0], ['puits', 3, 3]],
      '1,1': [['entrepot', 0, 0], ['prefecture', 3, 3]],
      '0,1': [['grenier', 0, 0], ['puits', 3, 3]],
      '7,1': [['grenier', 0, 0], ['puits', 3, 3]],
      '8,1': [['marche', 0, 0], ['ingenieur', 3, 3]],
      '9,1': [['ecole_gladiateurs', 0, 0], ['puits', 3, 3]],
      '8,0': [['forum', 0, 0], ['puits', 3, 3], ['prefecture', 3, 0]],
      '0,2': [['atelier_poterie', 0, 0], ['atelier_mobilier', 2, 0], ['pressoir', 0, 2], ['atelier_poterie', 2, 2]],
      '1,0': [['colonie_acteurs', 0, 0], ['ingenieur', 3, 3]], '0,0': [['puits', 1, 1], ['prefecture', 3, 3]], '9,0': [['puits', 1, 1]],
      '1,2': [['atelier_mobilier', 0, 0], ['puits', 3, 1], ['prefecture', 3, 3]], '2,2': [['puits', 1, 1]], '3,2': [['puits', 1, 1], ['ingenieur', 3, 3]],
      '6,2': [['puits', 1, 1], ['ingenieur', 3, 3]],
      '7,2': [['puits', 1, 1], ['prefecture', 3, 3]], '8,2': [['puits', 1, 1]], '9,2': [['puits', 1, 1], ['ingenieur', 3, 3]]
    };
    for (var r = 0; r < 3; r++) for (var c = 0; c < 10; c++) {
      var o = bloc(c, r), role = ROLE[c + ',' + r] || [], pris = {};
      if (o[1] + 3 > y1 || o[0] + 3 > x1) continue;
      if (role === 'prestige') {
        // Une fontaine dans un coin, 15 logements : trois coins peuvent devenir des insulae.
        var fc = c === 4 ? [3, 3] : [0, 3];
        poser('fontaine', o[0] + fc[0], o[1] + fc[1]);
        pris[(o[0] + fc[0]) + ',' + (o[1] + fc[1])] = 1;
        role = [];
      }
      role.forEach(function (q) {
        var t = D.batiments[q[0]].taille;
        if (poser(q[0], o[0] + q[1], o[1] + q[2])) for (var yy = 0; yy < t; yy++) for (var xx = 0; xx < t; xx++) pris[(o[0] + q[1] + xx) + ',' + (o[1] + q[2] + yy)] = 1;
      });
      var maisons = [];
      for (var by = o[1]; by < o[1] + 4; by++) for (var bx = o[0]; bx < o[0] + 4; bx++) if (!pris[bx + ',' + by] && !e.bat[by * N + bx]) maisons.push([bx, by]);
      if (maisons.length && !(c === 0 && r === 2)) cmd(sim, e, { type: 'tracer', bat: 'logement', cases: maisons });
    }
    // 4. Places pavées autour du quartier de prestige, jardins au nord de la route.
    var p0 = bloc(4, 0), places = [];
    for (var px = p0[0] - 1; px <= p0[0] + 9; px++) { places.push([px, p0[1] - 1]); places.push([px, p0[1] + 4]); }
    for (var py = p0[1]; py < p0[1] + 4; py++) { places.push([p0[0] - 1, py]); places.push([p0[0] + 4, py]); places.push([p0[0] + 9, py]); }
    cmd(sim, e, { type: 'tracer', bat: 'place', cases: places });
    var jardins = [];
    poser('statue_grande', p0[0] - 4, p0[1] - 5);
    poser('statue_moyenne', p0[0] + 7, p0[1] - 4);
    poser('statue_moyenne', p0[0] + 10, p0[1] - 4);
    for (var jx = p0[0] - 6; jx <= p0[0] + 14; jx++) {
      if (jx >= vx - 1 && jx <= vx + 3) continue;
      jardins.push([jx, p0[1] - 2]);
    }
    degager(sim, e, jardins);
    cmd(sim, e, { type: 'tracer', bat: 'jardin', cases: jardins });
    // Barrières du quartier fermé : sur les deux routes est-ouest, aux sorties ouest et est ;
    // sur chaque route nord-sud, sous la moitié haute de la rangée suivante ; sur les routes qui
    // le rejoignent par le nord.
    var bar = [[x0 + 14, y0], [x0 + 36, y0], [x0 + 14, y0 + PAS], [x0 + 36, y0 + PAS]];
    for (var bx2 = x0 + 15; bx2 <= x0 + 35; bx2 += PAS) bar.push([bx2, y0 + PAS + 3]);
    for (var nx = x0 + 15; nx <= x0 + 35; nx++) if (e.route[(y0 - 1) * N + nx] === sim.R.ROUTE) bar.push([nx, y0 - 1]);
    bar.forEach(function (q) { if (e.route[q[1] * N + q[0]] === sim.R.ROUTE) cmd(sim, e, { type: 'poser', bat: 'barriere', x: q[0], y: q[1] }); });
    // 5. Industrie près de ses ressources, puis fermes sur les prairies (au plus près de la ville).
    var centre = [cx, R];
    poserPres(sim, e, 'carriere_argile', ville ? ville.x : cx, ville ? ville.y - 6 : R - 20);
    poserPres(sim, e, 'camp_bucherons', x0, R - 4);
    // Un quai de pêche par banc de poissons (la carte en fixe la place).
    (e.bancs || []).forEach(function (i) { poserPres(sim, e, 'quai_peche', i % N, Math.floor(i / N), 12); });
    var fermes = options.fermes || ['ferme_ble', 'ferme_legumes', 'ferme_ble', 'ferme_legumes', 'ferme_ble', 'ferme_olives', 'ferme_ble', 'ferme_legumes', 'ferme_ble', 'ferme_fruits',
      'ferme_ble', 'ferme_legumes', 'ferme_ble', 'ferme_ble', 'ferme_fruits', 'ferme_ble', 'ferme_legumes', 'ferme_ble'];
    var deja = {};
    e.batiments.forEach(function (b) { deja[b.type] = (deja[b.type] || 0) + 1; });
    var compte = {};
    fermes.forEach(function (type) {
      compte[type] = (compte[type] || 0) + 1;
      if ((deja[type] || 0) >= compte[type]) return;
      poserPres(sim, e, type, centre[0], centre[1] + 8);
    });
    sim.calculerEau(e);
    sim.calculerAttractivite(e);
    sim.majPopulation(e);
    return { x0: x0, y0: y0, x1: x1, y1: y1, centre: centre, prestige: [bloc(4, 0), bloc(5, 0)] };
  }

  // Réservoir au bord de l'eau le plus proche, relié par un aqueduc au réservoir de la ville.
  function relierReservoir(sim, e, ville) {
    var N = e.N, best = null, bd = 1e9, nres = 0;
    e.batiments.forEach(function (b) { if (b.type === 'reservoir') nres++; });
    if (nres >= 2) return;
    for (var yy = 1; yy < N - 4; yy++) for (var xx = 1; xx < N - 4; xx++) {
      var d = Math.abs(xx - ville.x) + Math.abs(yy - ville.y);
      if (d >= bd || sim.peutPlacer(e, 'reservoir', xx, yy) !== null) continue;
      var mouille = false;
      for (var k = 0; k < 3 && !mouille; k++) {
        var cs = [[xx + k, yy - 1], [xx + 3, yy + k], [xx + k, yy + 3], [xx - 1, yy + k]];
        for (var c = 0; c < 4; c++) if (cs[c][0] >= 0 && cs[c][1] >= 0 && cs[c][0] < N && cs[c][1] < N && e.terrain[cs[c][1] * N + cs[c][0]] === sim.T.EAU) mouille = true;
      }
      if (mouille) { best = [xx, yy]; bd = d; }
    }
    if (!best) return;
    cmd(sim, e, { type: 'poser', bat: 'reservoir', x: best[0], y: best[1] });
    var a = ligne(best[0] + 1, best[1] + (best[1] < ville.y ? 3 : -1), ville.x + 1, ville.y + (best[1] < ville.y ? -1 : ville.t));
    degager(sim, e, a);
    cmd(sim, e, { type: 'tracer', bat: 'aqueduc', cases: a });
  }

  // ------------------------------------------------------------------------
  // Joueur raisonnable : rejoue le plan d'une ville d'exemple sur une vraie partie,
  // comme un joueur prudent (tests du tutoriel, villes mûries des aperçus).
  // ------------------------------------------------------------------------

  var PRIORITE = { ferme_ble: 0, prefecture: 1, grenier: 2, marche: 3, ingenieur: 4, forum: 5, temple_ceres: 6, fontaine: 7, colonie_acteurs: 8, theatre: 9,
    ferme_legumes: 10, ecole: 11, entrepot: 12, carriere_argile: 13, atelier_poterie: 14, bains: 15, barbier: 16, amphitheatre: 17, ecole_gladiateurs: 18,
    camp_bucherons: 19, atelier_mobilier: 20, temple_venus: 21, medecin: 22, ferme_olives: 23, pressoir: 24, bibliotheque: 25, quai_peche: 26, ferme_fruits: 27 };

  // Relève le plan (liste de commandes) sur un état libre de la même mission.
  function planifier(sim, idMission, options) {
    var brouillon = sim.nouvelle(idMission, { libre: true, tout: !!(options && options.niveau >= 4), graine: options && options.graine });
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
      // La nourriture d'abord : les fermes et les greniers passent devant le 1er exemplaire des
      // autres services (une ville qui a faim perd son humeur, puis ses habitants).
      var poids = (D.batiments[c.bat].genre === 'ferme' && D.batiments[c.bat].categorie === 'alimentation') || c.bat === 'quai_peche' ? 0.3 : c.bat === 'grenier' || c.bat === 'marche' ? 0.6 : 1;
      cle.set(c, rang[c.bat] * 100 * poids + (c.bat in PRIORITE ? PRIORITE[c.bat] : 30) + k / 10000);
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
    // Pas de nouveaux logements tant que plus d'une maison sur dix a faim (lot 2 : une ville
    // trop peuplée pour ses fermes vide ses marchés et ses maisons ne montent plus).
    // Ni quand le chômage dépasse 15 % : des tentes en plus n'apportent que des chômeurs.
    if (sim.couverture) { var cv = sim.couverture(e); if (cv.maisons > 20 && (cv.penurie * 10 > cv.maisons || e.chomage > 15)) voulu = 0; }
    // Ni au-delà de ce que les fermes bâties peuvent nourrir (0,5 unité par habitant et par mois).
    if (e.tout) {
      var cap = 0;
      e.batiments.forEach(function (b) {
        var d = D.batiments[b.type];
        if (b.type === 'quai_peche') cap += 6 * 100 / 12;
        else if (d.genre === 'ferme' && D.aliments.indexOf(d.produit) >= 0) {
          var f = 0;
          for (var yy = b.y; yy < b.y + b.t; yy++) for (var xx = b.x; xx < b.x + b.t; xx++) f += e.fertilite[yy * e.N + xx];
          cap += d.chargesParAn * 100 / 12 * f / (b.t * b.t * 100);
        }
      });
      if (e.pop > 150 + 2 * cap * 0.9) voulu = 0;
    }
    while (libres < voulu && k < plan.logements.length) {
      var p = plan.logements[k++];
      if (sim.appliquer(e, { type: 'poser', bat: 'logement', x: p[0], y: p[1] }).ok) libres += D.regles.maison.terrainVagueHabitants;
    }
  }

  // Cherche, par distance croissante au point (cx, cy), où poser ce bâtiment ; le pose et le
  // relie à la route la plus proche. Renvoie le bâtiment, ou null.
  function poserPres(sim, e, type, cx, cy, rayon) {
    var N = e.N, t = sim.donnees().batiments[type].taille, best = null, bd = 1e9;
    for (var y = 1; y < N - t; y++) for (var x = 1; x < N - t; x++) {
      var d = Math.abs(x - cx) + Math.abs(y - cy);
      if (d >= bd || d > (rayon || 2 * N)) continue;
      if (sim.peutPlacer(e, type, x, y) === null) { best = [x, y]; bd = d; }
    }
    if (!best || !cmd(sim, e, { type: 'poser', bat: type, x: best[0], y: best[1] }).ok) return null;
    var b = sim.batA(e, best[0], best[1]);
    if (!sim.donnees().batiments[type].sansRoute) relier(sim, e, cotes(b).filter(function (c) { return c[0] >= 0 && c[1] >= 0 && c[0] < N && c[1] < N; }).map(function (c) { return c[1] * N + c[0]; }));
    return b;
  }

  racine.MM_EXEMPLES = { construire: construire, ligneRome: ligneRome, planifier: planifier, jouer: jouer, poserPres: poserPres, relier: relier, cotes: cotes, ligne: ligne };
})(typeof window !== 'undefined' ? window : globalThis);
