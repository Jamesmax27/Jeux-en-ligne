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
  function relier(sim, e, depart, interdit) {
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
        if (!e.route[v] && interdit && interdit[v]) continue; // pas de rue dans un futur quartier
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
    // 6. Niveau 5 (ville de fin de campagne, lot 5) : rempart à l'ouest de la ville, ouvert sur la
    // voie de Rome (une porte ne se pose pas sur la voie), une tour de chaque côté de l'ouverture.
    if ((options.niveau || 4) >= 5) {
      var mx = x0 - 4, mur = [];
      for (var my = y0 - 8; my <= y1 + 6; my++) if (my < R - 1 || my > R + 1) mur.push([mx, my]);
      degager(sim, e, mur);
      // Tracé en deux lignes droites (une muraille se trace en ligne).
      cmd(sim, e, { type: 'tracer', bat: 'muraille', cases: mur.filter(function (q) { return q[1] < R; }) });
      cmd(sim, e, { type: 'tracer', bat: 'muraille', cases: mur.filter(function (q) { return q[1] > R; }) });
      [[mx + 1, R - 4], [mx + 1, R + 3], [mx + 1, y0 - 7], [mx + 1, y1 + 4]].forEach(function (q) { degager(sim, e, [[q[0], q[1]], [q[0] + 1, q[1]], [q[0], q[1] + 1], [q[0] + 1, q[1] + 1]]); poser('tour', q[0], q[1]); });
    }
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
  function poserPres(sim, e, type, cx, cy, rayon, interdit) {
    var N = e.N, t = sim.donnees().batiments[type].taille, best = null, bd = 1e9;
    var hors = function (x, y) {
      if (!interdit) return true;
      for (var yy = y; yy < y + t; yy++) for (var xx = x; xx < x + t; xx++) if (interdit[yy * N + xx]) return false;
      return true;
    };
    for (var y = 1; y < N - t; y++) for (var x = 1; x < N - t; x++) {
      var d = Math.abs(x - cx) + Math.abs(y - cy);
      if (d >= bd || d > (rayon || 2 * N)) continue;
      if (sim.peutPlacer(e, type, x, y) === null && hors(x, y)) { best = [x, y]; bd = d; }
    }
    if (!best || !cmd(sim, e, { type: 'poser', bat: type, x: best[0], y: best[1] }).ok) return null;
    var b = sim.batA(e, best[0], best[1]);
    if (!sim.donnees().batiments[type].sansRoute) relier(sim, e, cotes(b).filter(function (c) { return c[0] >= 0 && c[1] >= 0 && c[0] < N && c[1] < N; }).map(function (c) { return c[1] * N + c[0]; }), interdit);
    return b;
  }

  // ------------------------------------------------------------------------
  // Missions du lot 3 (Ravenne, Narbo, Massalia) : plan d'une ville en quartiers fermés,
  // rejoué étape par étape sur une vraie partie par un « gouverneur automatique » prudent.
  //
  // Un quartier = 4 × 2 pâtés de 4 × 4 cases, entouré de sa propre rue (le « tour »), relié à
  // la voie de Rome par une seule case de route munie d'une barrière : les errants de ses
  // services y restent (section 4.4), les marcheurs à destination (immigrants, livreurs,
  // acheteuses, artistes) passent. Pâtés de logements aux deux bouts, services au milieu :
  //   rangée loin de la voie : bains, temple, école, bibliothèque | amphithéâtre, préfecture,
  //                             ingénieur, barbier, médecin ;
  //   rangée près de la voie : marché, temple, forum, théâtre | grenier.
  // Réservoir du quartier de l'autre côté du tour, relié par aqueduc au réseau d'eau.
  // Un îlot de logistique (entrepôts, ateliers, écoles d'artistes) borde la voie de Rome.
  // ------------------------------------------------------------------------

  var LQ = 21, HQ = 11; // emprise d'un quartier, tour compris

  // Plan de chaque mission : nombre de quartiers, lots de fermes, lots d'industrie (la source
  // d'abord, puis ses ateliers ; un quai de commerce pour les routes de mer).
  var F3 = function (a, b, c) { return [a || 'ferme_ble', b || 'ferme_ble', c || 'ferme_legumes']; };
  var PLANS_MISSIONS = {
    // services : dernière étape de services des quartiers (2 : théâtre ; 3 : école, bains ; 4 :
    // bibliothèque, amphithéâtre), selon la prospérité visée (valeur moyenne des maisons, 14.2).
    ravenne: { quartiers: 3, services: 2, gouverneur: { reserve: 200, marge: 30 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits'), F3('ferme_ble', 'ferme_porcs'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_fruits'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_porcs')],
      ateliers: [['carriere_argile', 'atelier_poterie'], ['atelier_poterie', 'carriere_argile'], ['atelier_poterie', 'atelier_poterie']] },
    narbo: { quartiers: 4, services: 4, gouverneur: { reserve: 200, marge: 40 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits'), F3('ferme_ble', 'ferme_porcs'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_fruits'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_porcs'), F3(), F3()],
      ateliers: [['mine_fer', 'atelier_armes'], ['quai_commerce'], ['atelier_armes', 'mine_fer'], ['atelier_armes', 'atelier_armes'], ['mine_fer', 'atelier_armes', 'atelier_armes'], ['carriere_argile', 'atelier_poterie'], ['atelier_poterie', 'atelier_poterie'], ['camp_bucherons', 'atelier_mobilier'], ['ferme_olives', 'pressoir'], ['ferme_vigne', 'cave']] },
    massalia: { quartiers: 5, services: 4,
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits'), F3('ferme_ble', 'ferme_porcs'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_fruits'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_porcs'), F3()],
      ateliers: [['ferme_olives', 'pressoir', 'pressoir'], ['ferme_olives', 'pressoir', 'pressoir'], ['carriere_argile', 'atelier_poterie', 'atelier_poterie'], ['quai_commerce'],
        ['ferme_olives', 'pressoir', 'pressoir'], ['carriere_marbre'], ['camp_bucherons', 'atelier_mobilier'], ['quai_peche'], ['ferme_vigne', 'cave']] },
    // Missions militaires (lot 4) : defense = casernes, forts (type, ordre dans le plan) posés
    // entre la ville et les points d'invasion, à « avant » cases du centre ; académie militaire.
    aquilee: { quartiers: 5, services: 4, gouverneur: { reserve: 200, marge: 30 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits'), F3('ferme_ble', 'ferme_porcs'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_fruits'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_porcs')],
      ateliers: [['mine_fer', 'atelier_armes', 'atelier_armes'], ['carriere_argile', 'atelier_poterie'], ['mine_fer', 'atelier_armes', 'atelier_armes'], ['camp_bucherons', 'atelier_mobilier'], ['atelier_poterie', 'atelier_poterie'], ['quai_commerce'], ['ferme_vigne', 'cave'], ['ferme_olives', 'pressoir']],
      dieux: [['mars', 'ceres'], ['venus', 'mercure'], ['neptune', 'mars'], ['ceres', 'venus']],
      defense: { avant: 20, casernes: [13.2], forts: [{ type: 'fort_javelots', ordre: 13.4 }, { type: 'fort_javelots', ordre: 48 }, { type: 'fort_legionnaires', ordre: 75 }, { type: 'fort_legionnaires', ordre: 105 }] } },
    vindobona: { quartiers: 6, services: 4, gouverneur: { reserve: 200, marge: 30 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits'), F3('ferme_ble', 'ferme_porcs'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_fruits'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_porcs'), F3()],
      ateliers: [['mine_fer', 'atelier_armes', 'atelier_armes'], ['carriere_argile', 'atelier_poterie'], ['mine_fer', 'atelier_armes', 'atelier_armes'], ['camp_bucherons', 'atelier_mobilier'], ['atelier_poterie', 'atelier_poterie'], ['atelier_armes', 'atelier_armes'], ['ferme_vigne', 'cave'], ['ferme_olives', 'pressoir']],
      dieux: [['mars', 'ceres'], ['venus', 'mercure'], ['neptune', 'mars'], ['ceres', 'venus'], ['mercure', 'neptune']],
      defense: { avant: 22, casernes: [13.2, 73], academie: 120, forts: [{ type: 'fort_javelots', ordre: 13.4 }, { type: 'fort_javelots', ordre: 48 }, { type: 'fort_cavaliers', ordre: 72 }, { type: 'fort_legionnaires', ordre: 90 }, { type: 'fort_legionnaires', ordre: 112 }] } },
    // Lot 5 : échelons 6 à 10. Les cartes arides (Alexandrie, Leptis Magna, Palmyre) ont peu de
    // prairies : moins de fermes, le reste du blé s'achète (piloter importe quand des maisons ont faim).
    ephese: { quartiers: 6, services: 4, gouverneur: { reserve: 200, marge: 30 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits'), F3('ferme_ble', 'ferme_porcs')],
      ateliers: [['quai_commerce'], ['carriere_marbre'], ['carriere_argile', 'atelier_poterie', 'atelier_poterie'], ['quai_peche'], ['camp_bucherons', 'atelier_mobilier'], ['ferme_vigne', 'cave'], ['ferme_olives', 'pressoir']] },
    burdigala: { quartiers: 6, services: 4, gouverneur: { reserve: 200, marge: 30 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits'), F3('ferme_ble', 'ferme_porcs'), F3()],
      ateliers: [['ferme_vigne', 'cave', 'cave'], ['mine_fer', 'atelier_armes', 'atelier_armes'], ['ferme_vigne', 'cave', 'cave'], ['carriere_argile', 'atelier_poterie'], ['camp_bucherons', 'atelier_mobilier'], ['atelier_armes', 'atelier_armes']],
      dieux: [['mars', 'ceres'], ['venus', 'mercure'], ['neptune', 'mars'], ['ceres', 'venus'], ['mercure', 'neptune']],
      defense: { avant: 20, casernes: [13.2, 73], forts: [{ type: 'fort_javelots', ordre: 13.4 }, { type: 'fort_legionnaires', ordre: 48 }, { type: 'fort_legionnaires', ordre: 80 }, { type: 'fort_javelots', ordre: 110 }] } },
    alexandrie: { quartiers: 6, services: 4, gouverneur: { reserve: 200, marge: 30 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits')],
      ateliers: [['quai_commerce'], ['carriere_argile', 'atelier_poterie', 'atelier_poterie'], ['quai_peche'], ['atelier_poterie', 'atelier_poterie'], ['ferme_olives', 'pressoir']] },
    leptis: { quartiers: 6, services: 4, gouverneur: { reserve: 200, marge: 30 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes')],
      ateliers: [['ferme_olives', 'pressoir', 'pressoir'], ['quai_commerce'], ['ferme_olives', 'pressoir', 'pressoir'], ['mine_fer', 'atelier_armes', 'atelier_armes'], ['carriere_argile', 'atelier_poterie'], ['quai_peche']],
      dieux: [['mars', 'ceres'], ['venus', 'mercure'], ['neptune', 'mars'], ['ceres', 'venus'], ['mercure', 'neptune']],
      defense: { avant: 20, casernes: [13.2, 73], academie: 120, forts: [{ type: 'fort_javelots', ordre: 13.4 }, { type: 'fort_cavaliers', ordre: 48 }, { type: 'fort_javelots', ordre: 80 }, { type: 'fort_legionnaires', ordre: 110 }] } },
    corinthe: { quartiers: 7, services: 4, gouverneur: { reserve: 400, marge: 30 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits'), F3('ferme_ble', 'ferme_porcs'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_fruits'), F3()],
      ateliers: [['carriere_argile', 'atelier_poterie', 'atelier_poterie'], ['quai_commerce'], ['carriere_marbre'], ['ferme_vigne', 'cave'], ['camp_bucherons', 'atelier_mobilier'], ['ferme_olives', 'pressoir'], ['quai_peche']] },
    colonia: { quartiers: 6, services: 4, gouverneur: { reserve: 200, marge: 30 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits'), F3('ferme_ble', 'ferme_porcs'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_fruits'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_porcs')],
      ateliers: [['mine_fer', 'atelier_armes', 'atelier_armes'], ['camp_bucherons', 'atelier_mobilier'], ['mine_fer', 'atelier_armes', 'atelier_armes'], ['carriere_argile', 'atelier_poterie'], ['atelier_armes', 'atelier_armes'], ['ferme_vigne', 'cave']],
      dieux: [['mars', 'ceres'], ['venus', 'mercure'], ['neptune', 'mars'], ['ceres', 'venus'], ['mercure', 'neptune']],
      defense: { avant: 24, casernes: [13.2, 60, 90], academie: 100, forts: [{ type: 'fort_javelots', ordre: 13.4 }, { type: 'fort_legionnaires', ordre: 40 }, { type: 'fort_javelots', ordre: 62 }, { type: 'fort_legionnaires', ordre: 84 }, { type: 'fort_cavaliers', ordre: 104 }, { type: 'fort_legionnaires', ordre: 124 }] } },
    antioche: { quartiers: 8, services: 4, gouverneur: { reserve: 400, marge: 40 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits'), F3('ferme_ble', 'ferme_porcs'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_fruits'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_porcs'), F3(), F3()],
      ateliers: [['carriere_argile', 'atelier_poterie', 'atelier_poterie'], ['camp_bucherons', 'atelier_mobilier', 'atelier_mobilier'], ['ferme_olives', 'pressoir'], ['ferme_vigne', 'cave'], ['carriere_marbre'], ['mine_fer', 'atelier_armes'], ['ferme_vigne', 'cave']] },
    palmyre: { quartiers: 6, services: 4, gouverneur: { reserve: 200, marge: 30 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits')],
      ateliers: [['mine_fer', 'atelier_armes', 'atelier_armes'], ['carriere_argile', 'atelier_poterie'], ['mine_fer', 'atelier_armes', 'atelier_armes'], ['carriere_marbre'], ['atelier_poterie', 'atelier_poterie']],
      dieux: [['mars', 'ceres'], ['venus', 'mercure'], ['neptune', 'mars'], ['ceres', 'venus'], ['mercure', 'neptune']],
      defense: { avant: 24, casernes: [13.2, 60, 90], academie: 100, forts: [{ type: 'fort_javelots', ordre: 13.4 }, { type: 'fort_cavaliers', ordre: 40 }, { type: 'fort_javelots', ordre: 62 }, { type: 'fort_legionnaires', ordre: 84 }, { type: 'fort_cavaliers', ordre: 104 }, { type: 'fort_legionnaires', ordre: 124 }] } },
    athenes: { quartiers: 8, services: 4, gouverneur: { reserve: 400, marge: 40 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits'), F3('ferme_ble', 'ferme_porcs'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_fruits'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_porcs')],
      ateliers: [['ferme_olives', 'pressoir', 'pressoir'], ['quai_commerce'], ['carriere_marbre'], ['carriere_argile', 'atelier_poterie', 'atelier_poterie'], ['camp_bucherons', 'atelier_mobilier'], ['ferme_vigne', 'cave'], ['quai_peche']],
      defense: { avant: 20, casernes: [40], forts: [{ type: 'fort_javelots', ordre: 41 }, { type: 'fort_legionnaires', ordre: 100 }] } },
    eburacum: { quartiers: 7, services: 4, gouverneur: { reserve: 200, marge: 30 },
      fermes: [F3(), F3('ferme_ble', 'ferme_legumes'), F3('ferme_ble', 'ferme_fruits'), F3('ferme_ble', 'ferme_porcs'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_fruits'), F3(), F3('ferme_ble', 'ferme_ble', 'ferme_porcs'), F3()],
      ateliers: [['mine_fer', 'atelier_armes', 'atelier_armes'], ['camp_bucherons', 'atelier_mobilier'], ['mine_fer', 'atelier_armes', 'atelier_armes'], ['carriere_argile', 'atelier_poterie'], ['camp_bucherons', 'atelier_mobilier'], ['atelier_armes', 'atelier_armes']],
      dieux: [['mars', 'ceres'], ['venus', 'mercure'], ['neptune', 'mars'], ['ceres', 'venus'], ['mercure', 'neptune']],
      defense: { avant: 24, casernes: [13.2, 60, 90], academie: 100, forts: [{ type: 'fort_javelots', ordre: 13.4 }, { type: 'fort_legionnaires', ordre: 40 }, { type: 'fort_javelots', ordre: 62 }, { type: 'fort_legionnaires', ordre: 84 }, { type: 'fort_cavaliers', ordre: 104 }, { type: 'fort_legionnaires', ordre: 124 }] } }
  };
  var DIEUX_QUARTIERS = [['ceres', 'venus'], ['mercure', 'neptune'], ['mars', 'ceres'], ['venus', 'mercure'], ['neptune', 'mars']];

  // Emprise libre (herbe, prairie ou arbres ; ni eau, ni rochers, ni construction) ?
  function zoneLibre(sim, e, x0, y0, x1, y1) {
    if (x0 < 1 || y0 < 1 || x1 > e.N - 2 || y1 > e.N - 2) return false;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var i = y * e.N + x, t = e.terrain[i];
      if (t === sim.T.EAU || t === sim.T.ROCHERS || e.bat[i] || e.aqueduc[i]) return false;
      if (e.route[i] && e.route[i] !== sim.R.ROME) return false;
    }
    return true;
  }
  // Emprise d'un quartier (x : bord ouest du tour ; nord : au-dessus de la voie de Rome),
  // avec son réservoir et la case de liaison.
  function empriseQuartier(R, x, nord) {
    var yT = nord ? R - 12 : R + 2;
    return { x: x, yT: yT, yB: yT + HQ - 1, nord: nord, lien: [x + 10, nord ? R - 1 : R + 1], res: [x + 9, nord ? R - 17 : R + 15] };
  }
  function quartierPossible(sim, e, R, x, nord) {
    var q = empriseQuartier(R, x, nord);
    return zoneLibre(sim, e, q.x, q.yT, q.x + LQ - 1, q.yB) && zoneLibre(sim, e, q.lien[0], q.lien[1], q.lien[0], q.lien[1]) &&
      zoneLibre(sim, e, q.res[0], q.res[1], q.res[0] + 2, q.res[1] + 2);
  }
  // Places des quartiers et de l'îlot de logistique : à partir du centre de la carte, vers
  // l'extérieur ; l'îlot au nord, face au premier quartier du sud.
  function placesVille(sim, e, nQuartiers) {
    var N = e.N, R = ligneRome(sim, e), cx = Math.floor(N / 2), pris = [], logistique = null, quartiers = [];
    function chevauche(x, nord) { return pris.some(function (p) { return p.nord === nord && x < p.x + LQ + 1 && p.x < x + LQ + 1; }); }
    function chercher(nord, depart, aussiLog) {
      for (var d = 0; d < N; d++) {
        for (var s = -1; s <= 1; s += 2) {
          var x = depart + s * d;
          if (chevauche(x, nord)) continue;
          if (aussiLog ? zoneLibre(sim, e, x, R - 11, x + LQ - 1, R - 1) : quartierPossible(sim, e, R, x, nord)) return x;
        }
      }
      return null;
    }
    var x0 = chercher(false, cx - 10, false);
    if (x0 !== null) { quartiers.push(empriseQuartier(R, x0, false)); pris.push({ x: x0, nord: false }); }
    var xl = chercher(true, (x0 === null ? cx - 10 : x0), true);
    if (xl !== null) { logistique = { x: xl }; pris.push({ x: xl, nord: true }); }
    var ordre = [[true, -1], [true, 1], [false, -1], [false, 1], [true, -2], [true, 2], [false, -2], [false, 2]];
    for (var k = 0; k < ordre.length && quartiers.length < nQuartiers; k++) {
      var nord = ordre[k][0], x = chercher(nord, (x0 === null ? cx - 10 : x0) + ordre[k][1] * (LQ + 1), false);
      if (x === null) continue;
      quartiers.push(empriseQuartier(R, x, nord)); pris.push({ x: x, nord: nord });
    }
    return { R: R, quartiers: quartiers, logistique: logistique };
  }

  /**
   * Plan d'une mission : liste ordonnée d'étapes { nom, ordre, apres, cmds }, relevée sur un
   * brouillon (état libre de la même mission, argent illimité). Chaque étape est d'abord
   * déclarée avec la fonction qui la bâtit ; le brouillon les bâtit ensuite dans l'ordre de la
   * vraie partie, pour qu'une ferme ou une carrière se raccorde à une rue qui existera déjà
   * quand le gouverneur la posera. options : { quartiers, fermes, ateliers }.
   */
  function planifierMission(sim, idMission, options) {
    options = options || PLANS_MISSIONS[idMission] || {};
    var e = sim.nouvelle(idMission, { libre: true }), D = sim.donnees(), N = e.N;
    e.tresor = 1e9;
    var permis = sim.mission(e).batiments;
    var decl = [], cur = null, orig = sim.appliquer;
    function etape(nom, ordre, apres, bati) { decl.push({ nom: nom, ordre: ordre, apres: apres ? [].concat(apres) : [], bati: bati, k: decl.length }); }
    sim.appliquer = function (e2, c) {
      var r = orig(e2, c);
      if (cur && r.ok) { if (c.type === 'annuler') cur.cmds.pop(); else cur.cmds.push(JSON.parse(JSON.stringify(c))); }
      return r;
    };
    try {
      var V = placesVille(sim, e, options.quartiers || 3), R = V.R;
      // Cases réservées aux quartiers et à l'îlot de logistique : aqueducs, fermes, industrie et
      // leurs rues les contournent.
      var interdit = new Uint8Array(N * N);
      var reserver = function (x0, y0, x1, y1) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < N && y < N) interdit[y * N + x] = 1; };
      V.quartiers.forEach(function (q) { reserver(q.x - 1, q.yT - 1, q.x + LQ, q.yB + 1); reserver(q.lien[0], q.lien[1], q.lien[0], q.lien[1]); reserver(q.res[0] - 1, q.res[1] - 1, q.res[0] + 3, q.res[1] + 3); });
      if (V.logistique) reserver(V.logistique.x - 1, R - 12, V.logistique.x + LQ, R - 1);
      var poser = function (type, x, y) {
        if (permis.indexOf(type) < 0) return false;
        var t = D.batiments[type].taille, l = [];
        for (var yy = y; yy < y + t; yy++) for (var xx = x; xx < x + t; xx++) l.push([xx, yy]);
        degager(sim, e, l);
        return sim.appliquer(e, { type: 'poser', bat: type, x: x, y: y }).ok;
      };
      var pres = function (type, x, y, rayon) { return permis.indexOf(type) < 0 ? null : poserPres(sim, e, type, x, y, rayon, interdit); };
      var premiereSource = null; // source du premier lot d'industrie : le quai de commerce se pose au plus près
      // Quai de commerce : sur la rive la plus proche de (cx, cy) qu'un navire venu de la voie
      // maritime peut atteindre ; relié à la route.
      var poserQuai = function (cx, cy) {
        if (permis.indexOf('quai_commerce') < 0 || e.mer < 0) return null;
        var t = D.batiments.quai_commerce.taille, cands = [];
        for (var y = 1; y < N - t; y++) for (var x = 1; x < N - t; x++) {
          if (sim.peutPlacer(e, 'quai_commerce', x, y) !== null) continue;
          var libre = true;
          for (var yy = y; yy < y + t && libre; yy++) for (var xx = x; xx < x + t; xx++) if (interdit[yy * N + xx]) { libre = false; break; }
          if (libre) cands.push([Math.abs(x - cx) + Math.abs(y - cy), x, y]);
        }
        cands.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2] || a[1] - b[1]; });
        for (var k = 0; k < cands.length && k < 40; k++) {
          var q = sim.quaiEau(e, { x: cands[k][1], y: cands[k][2], t: t });
          if (q < 0 || !eauJointe(sim, e, e.mer, q)) continue;
          if (!sim.appliquer(e, { type: 'poser', bat: 'quai_commerce', x: cands[k][1], y: cands[k][2] }).ok) continue;
          var b = sim.batA(e, cands[k][1], cands[k][2]);
          relier(sim, e, bords(e, b), interdit);
          return b;
        }
        return null;
      };
      var route = function (l) { degager(sim, e, l); sim.appliquer(e, { type: 'tracer', bat: 'route', cases: l }); };
      // Eau d'un quartier : son réservoir, relié au plus proche des réservoirs déjà en eau (le
      // premier, à un réservoir posé au bord de l'eau), et un ingénieur à côté de chacun (sans
      // lui, un réservoir s'effondre au bout de 9 mois, section 10.2).
      var relies = [];
      var eauQuartier = function (q) {
        if (!poser('reservoir', q.res[0], q.res[1])) return;
        var b = sim.batA(e, q.res[0], q.res[1]);
        if (!relies.length) {
          var src = sourceEau(sim, e, [b], interdit);
          if (src) { relies.push(src); poserPres(sim, e, 'ingenieur', src.x + 1, src.y + 1, 6, interdit); }
        } else {
          var best = null, bd = 1e9;
          relies.forEach(function (a) { var d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y); if (d < bd) { bd = d; best = a; } });
          aqueducVers(sim, e, [best], b, interdit);
        }
        relies.push(b);
        poserPres(sim, e, 'ingenieur', b.x + 1, b.y + 1, 4);
        sim.calculerEau(e);
      };
      // 1. Quartiers : d'abord un demi-quartier (logements de l'ouest, puits, préfectures,
      // ingénieur), ses vivres, l'autre moitié, son forum et son temple ; les fontaines viennent
      // avec le réseau d'eau, puis les places pavées, puis les services des maisons plus riches.
      V.quartiers.forEach(function (q, n) {
        var x = q.x, yT = q.yT, yB = q.yB, far = q.nord ? 0 : 1, near = 1 - far;
        var bloc = function (c, r) { return [x + 1 + 5 * c, yT + 1 + 5 * r]; };
        var sF = bloc(2, far), sN = bloc(2, near), pN = bloc(1, near), pF = bloc(1, far);
        var lesDieux = options.dieux || DIEUX_QUARTIERS, dieux = lesDieux[n % lesDieux.length];
        // Pâté de logements : un puits (1, 1) et une fontaine (2, 2) ; le reste en logements.
        var pate = function (c, r) {
          var o = bloc(c, r), m = [];
          for (var by = o[1]; by < o[1] + 4; by++) for (var bx = o[0]; bx < o[0] + 4; bx++) {
            if (!((bx === o[0] + 1 && by === o[1] + 1) || (bx === o[0] + 2 && by === o[1] + 2))) m.push([bx, by]);
          }
          return { maisons: m, puits: [o[0] + 1, o[1] + 1], fontaine: [o[0] + 2, o[1] + 2] };
        };
        var logements = function (pates, extra) {
          var m = [];
          pates.forEach(function (p) { poser('puits', p.puits[0], p.puits[1]); m = m.concat(p.maisons); });
          m = m.concat(extra || []);
          degager(sim, e, m);
          sim.appliquer(e, { type: 'tracer', bat: 'logement', cases: m });
        };
        var ouest = [pate(0, 0), pate(0, 1)], est = [pate(3, 0), pate(3, 1)];
        etape('q' + n + '-base', 10 + 40 * n, n ? ['q' + (n - 1) + '-services1', 'q' + (n - 1) + '-base2'] : null, function () {
          var l = [], xx, yy;
          for (xx = x; xx < x + LQ; xx++) { l.push([xx, yT]); l.push([xx, yB]); }
          for (yy = yT + 1; yy < yB; yy++) { l.push([x, yy]); l.push([x + LQ - 1, yy]); [5, 10, 15].forEach(function (d) { l.push([x + d, yy]); }); }
          for (xx = x + 1; xx < x + LQ - 1; xx++) l.push([xx, yT + 5]);
          l.push(q.lien);
          route(l);
          sim.appliquer(e, { type: 'poser', bat: 'barriere', x: q.lien[0], y: q.lien[1] });
          // Trois préfectures par quartier : tentes et cabanes prennent feu au bout de 80 jours
          // sans passage d'un préfet (section 10.1), et les errants vont au hasard.
          poser('prefecture', sF[0] + 3, sF[1]);
          poser('ingenieur', sF[0] + 3, sF[1] + 1);
          poser('prefecture', sN[0] + 3, sN[1]);
          logements(ouest);
        });
        var B = 'q' + n + '-base';
        etape('q' + n + '-vivres', 12 + 40 * n, B, function () { poser('grenier', sN[0], sN[1]); poser('marche', pN[0], pN[1]); });
        etape('q' + n + '-base2', 12.5 + 40 * n, [B, 'q' + n + '-vivres'], function () {
          poser('prefecture', sF[0] + 1, sF[1] + 3);
          logements(est, [[sF[0], sF[1] + 3], [sF[0] + 2, sF[1] + 3],
            [sN[0] + 3, sN[1] + 1], [sN[0] + 3, sN[1] + 2], [sN[0], sN[1] + 3], [sN[0] + 1, sN[1] + 3], [sN[0] + 2, sN[1] + 3], [sN[0] + 3, sN[1] + 3]]);
        });
        etape('q' + n + '-services1', 14 + 40 * n, B, function () { poser('forum', pN[0], pN[1] + 2); poser('temple_' + dieux[0], pN[0] + 2, pN[1]); });
        etape('q' + n + '-eau', n ? 34 + 40 * n : 26, B, function () {
          eauQuartier(q);
          ouest.concat(est).forEach(function (p) { poser('fontaine', p.fontaine[0], p.fontaine[1]); });
        });
        // Places pavées sur les rues qui bordent les logements : sans elles, grenier, marché,
        // préfectures et puits tiennent l'attractivité sous le seuil du niveau 5 (section 5.3).
        // D'abord les quatre rues verticales (niveaux 5 et 6), puis les rues est-ouest (7 et 8).
        etape('q' + n + '-places', n ? 36 + 40 * n : 27, 'q' + n + '-eau', function () {
          var places = [];
          for (var yy = yT; yy <= yB; yy++) [x, x + 5, x + 15, x + LQ - 1].forEach(function (xx2) { places.push([xx2, yy]); });
          sim.appliquer(e, { type: 'tracer', bat: 'place', cases: places });
        });
        etape('q' + n + '-services2', 30 + 40 * n, B, function () { poser('theatre', pN[0] + 2, pN[1] + 2); poser('temple_' + dieux[1], pF[0] + 2, pF[1]); });
        if ((options.services || 4) < 3) return;
        etape('q' + n + '-services3', 45 + 40 * n, B, function () {
          poser('ecole', pF[0], pF[1] + 2); poser('bains', pF[0], pF[1]); poser('barbier', sF[0] + 3, sF[1] + 2); poser('medecin', sF[0] + 3, sF[1] + 3);
        });
        etape('q' + n + '-places2', 46 + 40 * n, 'q' + n + '-places', function () {
          var places = [];
          for (var xx = x; xx < x + LQ; xx++) [yT, yB, yT + 5].forEach(function (yy2) { if (xx <= x + 5 || xx >= x + 15) places.push([xx, yy2]); });
          sim.appliquer(e, { type: 'tracer', bat: 'place', cases: places });
        });
        if ((options.services || 4) < 4) return;
        etape('q' + n + '-services4', 70 + 40 * n, B, function () { poser('bibliotheque', pF[0] + 2, pF[1] + 2); poser('amphitheatre', sF[0], sF[1]); });
      });
      // 2. Îlot de logistique : entrepôt et écoles d'artistes le long de la voie de Rome.
      var L = V.logistique;
      if (L) {
        var lx = L.x;
        etape('logistique', 28, null, function () {
          var l2 = [];
          for (var y2 = R - 4; y2 <= R - 1; y2++) { l2.push([lx + 3, y2]); l2.push([lx + 7, y2]); }
          for (var x2 = lx; x2 <= lx + 7; x2++) l2.push([x2, R - 4]);
          route(l2);
          poser('entrepot', lx, R - 3); poser('prefecture', lx + 4, R - 3); poser('ingenieur', lx + 5, R - 3);
        });
        etape('logistique-colonie', 29, null, function () {
          var l2 = [];
          for (var y2 = R - 4; y2 <= R - 1; y2++) [11, 15, 19].forEach(function (d) { l2.push([lx + d, y2]); });
          for (var x2 = lx + 8; x2 <= lx + 20; x2++) l2.push([x2, R - 4]);
          route(l2);
          poser('colonie_acteurs', lx + 12, R - 3);
        });
        etape('logistique2', 60, null, function () {
          var l2 = [];
          for (var y2 = R - 7; y2 <= R - 5; y2++) [3, 7, 11, 15, 19].forEach(function (d) { l2.push([lx + d, y2]); });
          for (var x2 = lx; x2 <= lx + 20; x2++) l2.push([x2, R - 7]);
          route(l2);
          poser('entrepot', lx + 8, R - 3); poser('ecole_gladiateurs', lx + 16, R - 3);
        });
      }
      // 3. Fermes (une préfecture et un ingénieur au milieu de chaque lot, à l'étape suivante).
      var cx = V.quartiers.length ? V.quartiers[0].x + 10 : Math.floor(N / 2);
      (options.fermes || []).forEach(function (lot, k) {
        var centre = { x: 0, y: 0, n: 0 };
        etape('fermes' + k, 11 + 20 * k, k >= 2 ? 'q' + Math.floor(k / 2) + '-base' : null, function () {
          lot.forEach(function (type) { var f = pres(type, cx, R); if (f) { centre.x += f.x; centre.y += f.y; centre.n++; } });
        });
        etape('fermes' + k + '-garde', 11 + 20 * k + 9, null, function () {
          if (!centre.n || k % 2) return; // une préfecture et un ingénieur pour deux lots
          var gx = Math.round(centre.x / centre.n) + 1, gy = Math.round(centre.y / centre.n) + 1;
          pres('prefecture', gx, gy, 12); pres('ingenieur', gx, gy, 12);
        });
      });
      // 4. Industrie : chaque lot commence par sa source (extraction, ferme) ; ses ateliers, un
      // entrepôt, deux préfectures et un ingénieur se posent à côté (un charretier lent met un
      // mois pour 25 cases : une source loin de ses ateliers ne les nourrit pas).
      (options.ateliers || []).forEach(function (lot, k) {
        var src = null;
        etape('industrie' + k, k === 0 ? 15 : 18 + 25 * k, null, function () {
          lot.forEach(function (type) {
            if (permis.indexOf(type) < 0) return;
            var d = D.batiments[type];
            if (type === 'quai_peche') { (e.bancs || []).forEach(function (i) { pres('quai_peche', i % N, Math.floor(i / N), 14); }); }
            else if (type === 'quai_commerce') {
              // Le quai, son entrepôt et son ingénieur ensemble : loin de tout, il s'effondrerait.
              var qc = premiereSource ? poserQuai(premiereSource.x, premiereSource.y) : poserQuai(e.mer % N, Math.floor(e.mer / N));
              if (qc) { if (!src) src = qc; pres('ingenieur', qc.x + 1, qc.y + 1, 8); }
            }
            else if (d.genre === 'atelier') {
              // À côté de la source de sa matière (celle du lot, sinon la première déjà posée).
              var s0 = src && D.batiments[src.type].produit === d.matiere ? src : null;
              if (!s0) e.batiments.forEach(function (x) { if (D.batiments[x.type].produit === d.matiere && (!s0 || x.id < s0.id)) s0 = x; });
              var at = pres(type, s0 ? s0.x + 1 : (L ? L.x + 10 : cx), s0 ? s0.y + 1 : R, 16);
              if (at && !src) src = s0 || at;
            } else { var b = pres(type, L ? L.x + 10 : cx, R); if (b && !src) src = b; }
          });
          if (src && !premiereSource && src.type !== 'quai_commerce') premiereSource = src;
          // Missions militaires : la préfecture tout de suite (l'argent part aussi dans l'armée,
          // et un atelier sans préfet brûle en moins d'un an).
          if (src && options.defense && !e.batiments.some(function (b) { return b.type === 'prefecture' && Math.abs(b.x - src.x) + Math.abs(b.y - src.y) <= 6; })) pres('prefecture', src.x + 1, src.y + 1, 10);
          if (src && !e.batiments.some(function (b) { return b.type === 'entrepot' && Math.abs(b.x - src.x) + Math.abs(b.y - src.y) <= 16; })) pres('entrepot', src.x + 1, src.y + 1, 16);
        });
        etape('industrie' + k + '-garde', (k === 0 ? 15 : 18 + 25 * k) + 3, 'industrie' + k, function () {
          if (!src) return;
          var proche = function (t, r) { return e.batiments.some(function (b) { return b.type === t && Math.abs(b.x - src.x) + Math.abs(b.y - src.y) <= r; }); };
          if (!proche('prefecture', 6)) { pres('prefecture', src.x + 1, src.y + 1, 10); pres('prefecture', src.x + 1, src.y + 1, 12); }
          if (!proche('ingenieur', 12)) pres('ingenieur', src.x + 1, src.y + 1, 12);
        });
      });
      // 5. Défense (missions militaires, lot 4) : casernes près de l'îlot de logistique, forts entre
      // la ville et les points d'invasion (chacun vers l'un d'eux, à tour de rôle), académie.
      var Df = options.defense;
      if (Df) {
        var entrees = [];
        (sim.mission(e).evenements || []).forEach(function (ev) {
          if (ev.type === 'invasion' && !entrees.some(function (p) { return p[0] === ev.entree[0] && p[1] === ev.entree[1]; })) entrees.push(ev.entree);
        });
        var gx = L ? L.x + 10 : cx;
        // Un ingénieur et une préfecture à côté de chaque bâtiment militaire : sans eux, il
        // s'effondre ou brûle au bout de quelques mois (sections 10.1 et 10.2).
        var garder = function (b) { if (b) { pres('ingenieur', b.x + 1, b.y + 1, 8); pres('prefecture', b.x + 1, b.y + 1, 8); } };
        (Df.casernes || []).forEach(function (o, k) { etape('defense-caserne' + k, o, null, function () { garder(pres('caserne', gx + 8 * k, R - 10, 30)); }); });
        (Df.forts || []).forEach(function (f, k) {
          var p = entrees.length ? entrees[k % entrees.length] : [cx, 0];
          etape('defense-fort' + k, f.ordre, 'defense-caserne0', function () {
            var dx = p[0] - cx, dy = p[1] - R, d = Math.max(1, Math.sqrt(dx * dx + dy * dy)), av = Math.max(4, Math.min(Df.avant, d - 6));
            garder(pres(f.type, Math.round(cx + dx * av / d), Math.round(R + dy * av / d), 24));
          });
        });
        if (Df.academie) etape('defense-academie', Df.academie, 'defense-caserne0', function () { pres('academie_militaire', gx, R - 10, 30); });
      }
      // Le brouillon bâtit les étapes dans l'ordre de la partie et relève leurs commandes.
      decl.sort(function (a, b) { return a.ordre - b.ordre || a.k - b.k; });
      var etapes = decl.map(function (d) {
        cur = { nom: d.nom, ordre: d.ordre, apres: d.apres, cmds: [] };
        d.bati();
        return cur;
      });
      cur = null;
    } finally { sim.appliquer = orig; }
    return { etapes: etapes.filter(function (s) { return s.cmds.length; }), gouverneur: options.gouverneur || {} };
  }

  // Deux cases d'eau reliées par l'eau (6 × N cases au plus) ?
  function eauJointe(sim, e, a, b) {
    var N = e.N, vu = new Uint8Array(N * N), file = [a], t = 0;
    vu[a] = 1;
    while (t < file.length) {
      var i = file[t++];
      if (i === b) return true;
      var x = i % N, vs = [i - N, x < N - 1 ? i + 1 : -1, i + N, x > 0 ? i - 1 : -1];
      for (var k = 0; k < 4; k++) { var v = vs[k]; if (v >= 0 && v < N * N && !vu[v] && e.terrain[v] === sim.T.EAU) { vu[v] = 1; file.push(v); } }
    }
    return false;
  }

  // Cases voisines (côtés) d'un bâtiment.
  function bords(e, b) { return cotes(b).filter(function (c) { return c[0] >= 0 && c[1] >= 0 && c[0] < e.N && c[1] < e.N; }).map(function (c) { return c[1] * e.N + c[0]; }); }
  // Aqueduc le plus court d'un des réservoirs « depuis » vers le réservoir « vers », en
  // contournant les cases interdites (quartiers) ; il peut passer sur une route. Arbres dégagés.
  function aqueducVers(sim, e, depuis, vers, interdit) {
    var N = e.N, prev = new Int32Array(N * N).fill(-2), file = [], t = 0, cible = new Set(bords(e, vers));
    var libre = function (i) {
      if (interdit && interdit[i] && !cible.has(i)) return false; // les abords du réservoir visé restent permis
      var ty = e.terrain[i];
      if (ty === sim.T.EAU || ty === sim.T.ROCHERS || e.bat[i] || e.route[i] === sim.R.BARRIERE) return false;
      return true;
    };
    depuis.forEach(function (a) { bords(e, a).forEach(function (i) { if (prev[i] === -2 && (libre(i) || e.aqueduc[i])) { prev[i] = -1; file.push(i); } }); });
    while (t < file.length) {
      var i = file[t++];
      if (cible.has(i)) {
        var l = [];
        for (var j = i; j >= 0; j = prev[j]) l.push([j % N, Math.floor(j / N)]);
        degager(sim, e, l);
        sim.appliquer(e, { type: 'tracer', bat: 'aqueduc', cases: l });
        return true;
      }
      var x = i % N, y = (i - x) / N, vs = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
      for (var k = 0; k < 4; k++) {
        var vx = vs[k][0], vy = vs[k][1];
        if (vx < 0 || vy < 0 || vx >= N || vy >= N) continue;
        var v = vy * N + vx;
        if (prev[v] !== -2 || !(libre(v) || e.aqueduc[v])) continue;
        prev[v] = i; file.push(v);
      }
    }
    return false;
  }
  // Réservoir au bord de l'eau, au plus près du réseau, relié à lui par aqueduc.
  function sourceEau(sim, e, reseau, interdit) {
    var N = e.N, cands = [];
    for (var yy = 1; yy < N - 4; yy++) for (var xx = 1; xx < N - 4; xx++) {
      if (sim.peutPlacer(e, 'reservoir', xx, yy) !== null) continue;
      var pris = false, mouille = false;
      for (var y = yy; y < yy + 3 && !pris; y++) for (var x = xx; x < xx + 3; x++) if (interdit[y * N + x]) { pris = true; break; }
      if (pris) continue;
      for (var k = 0; k < 3 && !mouille; k++) {
        var cs = [[xx + k, yy - 1], [xx + 3, yy + k], [xx + k, yy + 3], [xx - 1, yy + k]];
        for (var c = 0; c < 4; c++) if (cs[c][0] >= 0 && cs[c][1] >= 0 && cs[c][0] < N && cs[c][1] < N && e.terrain[cs[c][1] * N + cs[c][0]] === sim.T.EAU) mouille = true;
      }
      if (!mouille) continue;
      var d = 1e9;
      reseau.forEach(function (r) { d = Math.min(d, Math.abs(r.x - xx) + Math.abs(r.y - yy)); });
      cands.push([d, xx, yy]);
    }
    cands.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2] || a[1] - b[1]; });
    for (var n = 0; n < Math.min(12, cands.length); n++) {
      var p = cands[n];
      if (!sim.appliquer(e, { type: 'poser', bat: 'reservoir', x: p[1], y: p[2] }).ok) continue;
      var src = sim.batA(e, p[1], p[2]), proche = null, pd = 1e9;
      reseau.forEach(function (r) { var dd = Math.abs(r.x - src.x) + Math.abs(r.y - src.y); if (dd < pd) { pd = dd; proche = r; } });
      if (aqueducVers(sim, e, [src], proche, interdit)) return src;
      sim.appliquer(e, { type: 'annuler' });
    }
    return null;
  }

  // Coût et personnel d'une étape (pour décider si on peut la bâtir).
  function besoinEtape(sim, e, s) {
    var D = sim.donnees(), cout = 0, eff = 0, reste = 0;
    s.cmds.forEach(function (c) {
      var d = D.batiments[c.bat];
      if (!d || c.bat === 'deblayer') return;
      if (c.type === 'poser' && (c.bat === 'barriere' || c.bat === 'place')) {
        var r = e.route[c.y * e.N + c.x];
        if (r === (c.bat === 'barriere' ? sim.R.BARRIERE : sim.R.PLACE)) return;
        cout += d.cout; reste++;
      } else if (c.type === 'poser') {
        var b = sim.batA(e, c.x, c.y);
        if (b && b.type === c.bat && b.x === c.x && b.y === c.y) return;
        cout += d.cout; eff += d.effectif; reste++;
      } else (c.cases || []).forEach(function (p) {
        var i = p[1] * e.N + p[0];
        var fait = c.bat === 'route' ? e.route[i] : c.bat === 'aqueduc' ? e.aqueduc[i] : c.bat === 'place' ? e.route[i] === sim.R.PLACE : c.bat === 'barriere' ? e.route[i] === sim.R.BARRIERE : !!e.bat[i];
        if (!fait) { cout += d.cout; reste++; }
      });
    });
    return { cout: cout, eff: eff, reste: reste };
  }

  /**
   * Un tour du gouverneur automatique (deux fois par mois) : étapes du plan dans l'ordre,
   * tant que l'argent et les bras suffisent ; commerce, demandes de l'empereur, fêtes, présents.
   * etat : objet gardé d'un tour à l'autre par l'appelant.
   */
  function jouerMission(sim, e, plan, etat, options) {
    options = options || {};
    // Réglages du gouverneur : ceux de l'appel, sinon ceux du plan de la mission.
    var G = plan.gouverneur || {}, D = sim.donnees();
    var reserve = options.reserve !== undefined ? options.reserve : G.reserve !== undefined ? G.reserve : 400;
    var seuilChomage = G.chomage !== undefined ? G.chomage : 15;
    // Ruines et gravats déblayés, pour rebâtir.
    var ruines = [];
    e.batiments.forEach(function (b) { if (b.type === 'ruines' || b.type === 'gravats') ruines.push([b.x, b.y]); });
    if (ruines.length && e.tresor > reserve) sim.appliquer(e, { type: 'tracer', bat: 'deblayer', cases: ruines });
    var emplois = e.emploisRequis, marge = options.marge !== undefined ? options.marge : G.marge !== undefined ? G.marge : 15, sansBras = false;
    etat = etat || {};
    var bloque = etat.bloque || (etat.bloque = {});
    // Une étape qui n'avance pas quand on la bâtit (case occupée pour de bon) est mise de côté
    // six mois, sans quoi elle arrêterait toutes les suivantes.
    var batir = function (s, bs) {
      s.cmds.forEach(function (c) { if (c.bat === 'deblayer') degager(sim, e, c.cases); else sim.appliquer(e, c); });
      if (besoinEtape(sim, e, s).reste >= bs.reste && e.tresor - bs.cout >= D.regles.detteMax + 1000) bloque[s.nom] = e.tick + 6 * D.ticksParMois;
    };
    var parNom = {};
    plan.etapes.forEach(function (x) { parNom[x.nom] = x; });
    var pret = function (s) { return !(s.apres || []).some(function (a) { return parNom[a] && besoinEtape(sim, e, parNom[a]).reste; }); };
    if (e.chomage > seuilChomage && e.pop > 300) {
      // Trop de chômeurs : parmi les étapes prêtes et payables, celle qui crée un emploi au
      // meilleur prix (pas plus de bras qu'il n'y a de chômeurs, à 20 près).
      // L'industrie d'abord (elle exporte) ; des fermes seulement si des maisons ont faim.
      var libres = e.travailleurs - e.emploisRequis, meilleure = null, prix = Infinity, cvf = sim.couverture(e), faim = cvf.penurie * 20 > cvf.maisons;
      plan.etapes.forEach(function (s) {
        if (bloque[s.nom] > e.tick) return;
        var b = besoinEtape(sim, e, s), indus = /^industrie/.test(s.nom);
        if (!(indus || (faim && /^fermes/.test(s.nom))) || /garde/.test(s.nom)) return;
        if (!b.reste || !b.eff || b.eff > libres || e.tresor - b.cout < reserve || !pret(s)) return;
        var p = b.cout / b.eff * (indus ? 0.3 : 1);
        if (p < prix) { prix = p; meilleure = s; }
      });
      if (meilleure) {
        batir(meilleure, besoinEtape(sim, e, meilleure));
        piloter(sim, e, etat);
        return;
      }
    }
    for (var k = 0; k < plan.etapes.length; k++) {
      var s = plan.etapes[k];
      if (bloque[s.nom] > e.tick) continue;
      var bs = besoinEtape(sim, e, s);
      if (!bs.reste) continue;
      if ((s.apres || []).some(function (a) { return parNom[a] && besoinEtape(sim, e, parNom[a]).reste; })) continue; // attend les étapes dont elle dépend
      if (e.tresor - bs.cout < reserve) break;
      // Faute de bras, on passe aux étapes qui n'en demandent pas (logements : de nouveaux bras) ;
      // avec trop de chômeurs, aux étapes qui donnent du travail.
      // Le grenier et le marché d'un quartier passent même faute de bras : la seconde moitié de
      // ses logements les attend, et c'est elle qui apporte les bras.
      var base = /base/.test(s.nom), vital = base || /vivres/.test(s.nom);
      if (sansBras && !vital) continue; // faute de bras : seulement de nouveaux logements
      if (bs.eff && !vital && emplois + bs.eff > e.travailleurs + marge) { sansBras = true; continue; }
      if (base && e.chomage > 8 && e.pop > 60) { if (sansBras) break; continue; }
      batir(s, bs);
      emplois += bs.eff;
      if (!options.toutDeSuite) break; // une étape par tour : la ville suit
    }
    piloter(sim, e, etat);
  }

  // Décisions du gouverneur : commerce, demandes, fêtes, présents, salaire, impôt.
  function piloter(sim, e, etat) {
    var D = sim.donnees(), Q = D.regles.maison.uniteParCharge, cites = sim.cites(e);
    if (!cites.length && !e.empereur) return;
    // Commerce : exporter ce que la ville produit en surplus, importer les biens des maisons
    // et les matières des ateliers qu'elle ne produit pas.
    var produits = {}, matieres = {};
    e.batiments.forEach(function (b) { var d = D.batiments[b.type]; if (d.produit) produits[d.produit] = (produits[d.produit] || 0) + 1; if (d.matiere && d.genre === 'atelier') matieres[d.matiere] = 1; });
    // Armes : la caserne est servie d'abord par l'atelier ; le surplus s'exporte, 4 charges gardées.
    var caserne = e.batiments.some(function (b) { return D.batiments[b.type].genre === 'caserne'; });
    var demandes = {};
    e.demandes.forEach(function (dm) { if ((dm.etat === 'ouverte' || dm.etat === 'retard') && dm.bien) demandes[dm.bien] = (demandes[dm.bien] || 0) + dm.q; });
    var vendus = {}, achetes = {};
    cites.forEach(function (c) { if (!sim.routeActive(e, c)) return; Object.keys(c.vend).forEach(function (g) { vendus[g] = 1; }); Object.keys(c.achete).forEach(function (g) { achetes[g] = 1; }); });
    // Biens réclamés par les maisons (relevés par les vendeuses des marchés).
    var reclames = {};
    e.batiments.forEach(function (b) { if (b.type === 'marche') for (var g in b.dem) if (b.dem[g] > 0) reclames[g] = 1; });
    var aise = e.tresor > 2500, cvf = sim.couverture(e), faim = cvf.maisons > 10 && cvf.penurie * 20 > cvf.maisons;
    D.listeBiens.forEach(function (g) {
      var stock = sim.stockVille(e, g) / Q, s = 'aucun', n = 4;
      if (demandes[g] && !produits[g] && vendus[g]) { s = e.tresor - demandes[g] * sim.prixBien(e, g).i > 2000 ? 'importer' : 'aucun'; n = demandes[g]; }
      else if (demandes[g]) { s = 'reserver'; n = demandes[g]; }
      else if (produits[g] && achetes[g] && matieres[g]) { s = 'aucun'; } // matière de nos ateliers : gardée
      else if (g === 'armes' && caserne && produits[g] && achetes[g]) { s = 'exporter'; n = 4; }
      else if (produits[g] && achetes[g] && D.aliments.indexOf(g) < 0) { s = 'exporter'; n = reclames[g] ? 3 : 0; }
      else if (produits[g] && achetes[g] && stock > 12) { s = 'exporter'; n = 8; }
      else if (vendus[g] && !produits[g] && reclames[g] && aise) { s = 'importer'; n = 2; }
      else if (vendus[g] && D.aliments.indexOf(g) >= 0 && faim && e.tresor > 600) { s = 'importer'; n = 8; } // des maisons ont faim
      if (sim.statutBien(e, g) !== s || sim.cibleBien(e, g) !== n) sim.appliquer(e, { type: 'commerce', bien: g, statut: s, cible: n });
    });
    // Les caravanes ne visitent que les 3 entrepôts les plus proches de l'entrée (section 12.3),
    // et les dockers d'un quai ont 40 jours pour faire leurs navettes (12.4) : ces entrepôts-là
    // vont chercher d'avance les biens exportés dans les autres.
    var exportes = D.listeBiens.filter(function (g) { return sim.statutBien(e, g) === 'exporter'; });
    var N = e.N, depots = e.batiments.filter(function (b) { return b.type === 'entrepot'; });
    var commerce = {};
    var plusProches = function (x0, y0, n) {
      depots.slice().sort(function (a, b) { return (Math.abs(a.x - x0) + Math.abs(a.y - y0)) - (Math.abs(b.x - x0) + Math.abs(b.y - y0)) || a.id - b.id; })
        .slice(0, n).forEach(function (b) { commerce[b.id] = 1; });
    };
    var terre = cites.some(function (c) { return c.route === 'terre' && sim.routeActive(e, c); });
    var mer = cites.some(function (c) { return c.route === 'mer' && sim.routeActive(e, c); });
    if (terre && depots.length > 2) plusProches(e.entree % N, Math.floor(e.entree / N), 2);
    if (mer) e.batiments.forEach(function (q) { if (q.type === 'quai_commerce') plusProches(q.x + 1, q.y + 1, 1); });
    depots.forEach(function (b) {
      exportes.forEach(function (g) {
        var voulu = commerce[b.id] && Object.keys(commerce).length < depots.length ? 'chercher' : 'accepter';
        if (sim.consigne(b, g) !== voulu) sim.appliquer(e, { type: 'consigne', id: b.id, bien: g, valeur: voulu });
      });
    });
    // Routes : la moins chère qui sert à quelque chose, quand il y a un entrepôt et de quoi payer.
    var entrepot = e.batiments.some(function (b) { return b.type === 'entrepot'; });
    if (entrepot) {
      var choix = null;
      cites.forEach(function (c) {
        var r = e.routes[c.id];
        if (!r || r.o || !r.v || (c.route === 'mer' && !sim.quaiEnService(e))) return;
        // Une route ne s'ouvre que pour vendre un bien déjà produit (hors nourriture), ou acheter
        // un bien réclamé par une demande de l'empereur.
        var utile = Object.keys(c.achete).some(function (g) { return produits[g] && D.aliments.indexOf(g) < 0 && !matieres[g]; }) || Object.keys(c.vend).some(function (g) { return (demandes[g] && !produits[g]) || (faim && D.aliments.indexOf(g) >= 0); });
        if (utile && (!choix || c.cout < choix.cout)) choix = c;
      });
      // Une nouvelle route seulement quand les quotas des routes ouvertes sont presque épuisés.
      var reste = 0, ouvertes = 0;
      cites.forEach(function (c) {
        if (!sim.routeActive(e, c)) return;
        ouvertes++;
        Object.keys(c.achete).forEach(function (g) { if (produits[g] && D.aliments.indexOf(g) < 0 && !matieres[g]) reste += sim.resteQuota(e, c, 'a', g); });
      });
      var pret = choix && Object.keys(choix.achete).some(function (g) { return sim.stockVille(e, g) >= Q; });
      var invendus = choix && Object.keys(choix.achete).some(function (g) { return sim.stockVille(e, g) >= 6 * Q; });
      var nourrit = choix && faim && Object.keys(choix.vend).some(function (g) { return D.aliments.indexOf(g) >= 0; });
      if (choix && (!ouvertes || reste < 4 || invendus || nourrit) && e.tresor - choix.cout > (pret || nourrit ? 200 : 1500)) sim.appliquer(e, { type: 'ouvrirRoute', cite: choix.id });
    }
    // Impôt au plus haut sans fâcher les habitants, salaire un peu au-dessus de Rome
    // (humeur et prospérité, sections 6.2 et 14.2).
    var neutre = D.regles.humeur.impotNeutreJusqua;
    if (e.impot !== neutre) sim.appliquer(e, { type: 'reglage', cle: 'impot', valeur: neutre });
    var sal = e.salaireRome + D.regles.humeur.salairePas;
    if (e.salaire !== sal) sim.appliquer(e, { type: 'reglage', cle: 'salaire', valeur: sal });
    if (!e.empereur) return;
    // Salaire du gouverneur : rien tant que le trésor est maigre.
    var sg = e.tresor > 300 ? sim.salaireGouvMax(e) : 0;
    if (e.salaireGouv !== sg) sim.appliquer(e, { type: 'reglage', cle: 'salaireGouv', valeur: sg });
    // Demandes : expédiées dès que le stock suffit.
    e.demandes.forEach(function (dm) { if (!dm.troupes && sim.demandePrete(e, dm) && (!dm.deniers || e.tresor - dm.deniers > 1500)) sim.appliquer(e, { type: 'expedier', id: dm.id }); });
    // Troupes : la cohorte la plus forte part, sauf si une invasion arrive dans les 4 mois.
    var menace = sim.armees(e).some(function (a) { return a.mois <= 4; });
    e.demandes.forEach(function (dm) {
      if (!dm.troupes || dm.etat !== 'ouverte' || menace) return;
      var best = null;
      sim.cohortes(e).forEach(function (c) { if (!c.absente && !c.fuite && c.ici >= 12 && (!best || c.ici * (1 + c.entr / 10) > best.ici * (1 + best.entr / 10))) best = c; });
      if (best) sim.appliquer(e, { type: 'envoyer', id: dm.id, fort: best.id });
    });
    // Fêtes : pour le dieu le moins satisfait, sous 35.
    var bas = null;
    D.regles.dieux.liste.forEach(function (g) { if (!bas || e.divins[g].s < e.divins[bas].s) bas = g; });
    if (bas && e.divins[bas].s < 35 && !e.fete && e.tresor > sim.coutFete(e, 'petite') + 1500) sim.appliquer(e, { type: 'fete', dieu: bas, taille: 'petite' });
    // Présents : quand la faveur approche du seuil de la mission, un présent généreux par an.
    var seuil = (sim.mission(e).objectifs || {}).faveur || 0;
    if (e.cotes.faveur < seuil + 6 && e.fortune >= 40 && (e.presentT < 0 || e.tick - e.presentT >= 12 * D.ticksParMois)) sim.appliquer(e, { type: 'present', taille: 1 });
  }

  // Armée du gouverneur (appelée chaque jour) : pendant une invasion, toutes les cohortes marchent
  // sur l'ennemi le plus proche du centre de la ville ; ensuite, elles rentrent au fort.
  function piloterArmee(sim, e) {
    var l = sim.cohortes(e), inv = e.invasion, N = e.N;
    if (!l.length) return;
    if (!inv || inv.fuite) {
      l.forEach(function (c) { if (c.ordre === 'aller') sim.appliquer(e, { type: 'cohorte', fort: c.id, ordre: 'rentrer' }); });
      return;
    }
    var sx = 0, sy = 0, n = 0;
    e.batiments.forEach(function (h) { if (h.type === 'logement' && h.hab > 0) { sx += h.x; sy += h.y; n++; } });
    var cx = n ? sx / n : N / 2, cy = n ? sy / n : N / 2, cible = null, bd = Infinity;
    e.unites.forEach(function (u) {
      if (u.c !== 1 || u.mort) return;
      var x = u.i % N, y = (u.i - x) / N, d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bd) { bd = d; cible = u; }
    });
    if (!cible) return;
    var tx = cible.i % N, ty = (cible.i - tx) / N;
    l.forEach(function (c) {
      if (c.fuite || c.absente || !c.ici) return;
      var f = sim.batiment(e, c.id);
      if (f.ordre.t === 'aller' && f.ordre.i >= 0 && Math.abs(f.ordre.i % N - tx) + Math.abs(Math.floor(f.ordre.i / N) - ty) <= 4) return;
      sim.appliquer(e, { type: 'cohorte', fort: c.id, ordre: 'aller', x: tx, y: ty });
    });
  }

  racine.MM_EXEMPLES = { piloterArmee: piloterArmee, construire: construire, ligneRome: ligneRome, planifier: planifier, jouer: jouer, poserPres: poserPres, relier: relier, cotes: cotes, ligne: ligne,
    planifierMission: planifierMission, jouerMission: jouerMission, piloter: piloter, placesVille: placesVille, besoinEtape: besoinEtape, PLANS_MISSIONS: PLANS_MISSIONS };
})(typeof window !== 'undefined' ? window : globalThis);
