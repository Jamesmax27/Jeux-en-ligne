/* ==========================================================================
   Cosmoria — dessins, partie 2 : le sol des trois mondes, la mer, les rivages,
   les passerelles, les esplanades, les arbres à résine et les rochers.
   ========================================================================== */
(function (racine) {
  'use strict';
  var A = racine.CM_ART, C = A.C;
  var poly = A.poly, ligne = A.ligne, trace = A.trace, cercle = A.cercle, ellipse = A.ellipse, teinte = A.teinte, nuance = A.nuance,
    alpha = A.alpha, hachage = A.hachage, degV = A.degV, degR = A.degR, lueur = A.lueur, lampe = A.lampe, sol = A.sol;

  // Losange de la case, très légèrement débordant (pas de liseré entre deux cases voisines).
  function fond(ctx, P, c) { var d = 0.012; poly(ctx, [P(-d, -d), P(1 + d, -d), P(1 + d, 1 + d), P(-d, 1 + d)], c); }

  // --- Sol nu ----------------------------------------------------------------
  // v : 0 à 15 (teinte lente × 4 variantes de détails). Rubra : régolithe rouille, cailloux et
  // petits cratères ; Borée : glace craquelée et congères ; Ambre : sable ridé par le vent.
  function peindreSol(ctx, P, M, nom, v) {
    var t = (v >> 2) & 3, d = v & 3, k, p, q;
    fond(ctx, P, M.sol[t]);
    // Nuage de grains : donne de la matière sans dessiner de damier.
    for (k = 0; k < 9; k++) {
      p = P(0.12 + hachage(k, v * 7 + 1) * 0.76, 0.12 + hachage(k + 20, v * 5 + 2) * 0.76);
      ellipse(ctx, p[0], p[1], 2.4 + hachage(k, v) * 3, 0.9 + hachage(k + 4, v) * 1.1, alpha(k % 2 ? M.solC : M.solF, 0.16));
    }
    if (nom === 'boree') {
      // Fissures bleutées dans la glace, reflets blancs.
      if (d === 1 || d === 3) { p = P(0.2, 0.3); q = P(0.55, 0.5); var r = P(0.8, 0.42); trace(ctx, [p, q, r], alpha(M.solF, 0.75), 0.8); trace(ctx, [q, P(0.6, 0.8)], alpha(M.solF, 0.6), 0.6); }
      if (d === 2) { p = P(0.62, 0.36); ellipse(ctx, p[0], p[1], 9, 3.4, alpha(M.solC, 0.7)); ellipse(ctx, p[0] - 2, p[1] - 0.8, 5, 1.6, 'rgba(255,255,255,0.75)'); }
      if (d === 0) { p = P(0.36, 0.64); ligne(ctx, [p[0] - 5, p[1]], [p[0] + 4, p[1] - 1], 'rgba(255,255,255,0.7)', 0.8); }
    } else if (nom === 'ambre') {
      // Rides de sable : arcs parallèles.
      for (k = 0; k < 3; k++) {
        if ((d + k) % 3 === 2) continue;
        p = P(0.24 + k * 0.2, 0.2 + ((d * 3 + k * 5) % 7) * 0.05); q = P(0.3 + k * 0.2, 0.82 - ((d + k) % 4) * 0.06);
        ctx.strokeStyle = alpha(M.solF, 0.42); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.quadraticCurveTo((p[0] + q[0]) / 2 + 3, (p[1] + q[1]) / 2 - 1, q[0], q[1]); ctx.stroke();
        ctx.strokeStyle = alpha(M.solC, 0.5);
        ctx.beginPath(); ctx.moveTo(p[0] + 1.2, p[1] + 0.8); ctx.quadraticCurveTo((p[0] + q[0]) / 2 + 4.2, (p[1] + q[1]) / 2 - 0.2, q[0] + 1.2, q[1] + 0.8); ctx.stroke();
      }
      if (d === 1) { p = P(0.7, 0.3); caillou(ctx, p[0], p[1], 2.2, M.caillou); }
    } else {
      // Régolithe : cailloux, un petit cratère de temps en temps, veines sombres.
      if (d === 0 || d === 2) { p = P(0.3 + d * 0.1, 0.62 - d * 0.1); caillou(ctx, p[0], p[1], 2.4, M.caillou); p = P(0.66, 0.34 + d * 0.08); caillou(ctx, p[0], p[1], 1.6, M.caillou); }
      if (d === 1) {
        p = P(0.56, 0.5);
        ellipse(ctx, p[0], p[1], 8.5, 3.9, alpha(M.solF, 0.55));
        ellipse(ctx, p[0] + 0.6, p[1] + 0.5, 6.6, 2.8, nuance(M.sol[t], 0.8));
        ctx.strokeStyle = alpha(M.solC, 0.7); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse(p[0], p[1], 8.5, 3.9, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
      }
      if (d === 3) { p = P(0.2, 0.42); q = P(0.5, 0.56); trace(ctx, [p, q, P(0.74, 0.5)], alpha(M.solF, 0.4), 0.8); }
    }
  }
  function caillou(ctx, x, y, r, c) {
    ellipse(ctx, x + r * 0.5, y + r * 0.3, r * 1.2, r * 0.5, 'rgba(10,12,24,0.22)');
    poly(ctx, [[x - r, y], [x - r * 0.5, y - r * 0.8], [x + r * 0.4, y - r * 0.9], [x + r, y - r * 0.1], [x + r * 0.5, y + r * 0.4], [x - r * 0.5, y + r * 0.35]], c);
    poly(ctx, [[x - r, y], [x - r * 0.5, y - r * 0.8], [x + r * 0.4, y - r * 0.9], [x, y - r * 0.2]], teinte(c, 1.3));
  }

  // --- Sol fertile -------------------------------------------------------------
  // Mousse terraformée ; f : fertilité (0 faible, 1 bonne, 2 très bonne) : plus dense, plus lumineuse.
  function peindreFertile(ctx, P, M, f) {
    fond(ctx, P, M.fertile[f]);
    var k, p, n = 7 + f * 4;
    for (k = 0; k < n; k++) {
      p = P(0.1 + hachage(k, f * 3 + 5) * 0.8, 0.1 + hachage(k + 30, f * 7 + 1) * 0.8);
      ellipse(ctx, p[0], p[1], 3.4, 1.5, alpha(nuance(M.fertile[f], k % 2 ? 1.25 : 0.78), 0.55));
    }
    for (k = 0; k < 3 + f * 3; k++) {
      p = P(0.14 + hachage(k + 7, f + 11) * 0.72, 0.14 + hachage(k + 50, f + 3) * 0.72);
      ligne(ctx, [p[0], p[1]], [p[0], p[1] - 2.6], nuance(M.fertile[f], 1.35), 0.8);
      cercle(ctx, p[0], p[1] - 3, 0.9, M.pousse);
      if (f === 2 && k % 2 === 0) lueur(ctx, p[0], p[1] - 3, 3.4, M.pousse, 0.35);
    }
  }

  // --- Mer ---------------------------------------------------------------------
  // fr : 0 à 3 (les reflets glissent d'une image à l'autre).
  function peindreEau(ctx, P, M, fr) {
    var k, p;
    fond(ctx, P, M.eau);
    // Nappes plus sombres, sans bord de case visible.
    p = P(0.3 + (fr & 1) * 0.1, 0.62); ellipse(ctx, p[0], p[1], 15, 5, alpha(M.eauF, 0.5));
    p = P(0.72, 0.3 + (fr >> 1) * 0.08); ellipse(ctx, p[0], p[1], 10, 3.6, alpha(M.eauF, 0.4));
    ctx.lineCap = 'round';
    for (k = 0; k < 4; k++) {
      var s = ((k * 0.27 + fr * 0.07) % 1), u = 0.14 + ((k * 0.37 + 0.11) % 0.72), w = 0.2 + s * 0.6;
      p = P(u, w);
      var l = 3 + ((k + fr) % 3) * 1.6;
      ligne(ctx, [p[0] - l, p[1]], [p[0] + l, p[1]], alpha(M.eauC, 0.34 + 0.12 * ((k + fr) % 2)), 0.9);
    }
    p = P(0.3 + (fr % 2) * 0.36, 0.7 - (fr % 3) * 0.2);
    cercle(ctx, p[0], p[1], 0.8, 'rgba(255,255,255,0.75)');
  }
  // Rive : sable et écume du côté de la terre. masque : 1 nord (v = 0), 2 est (u = 1), 4 sud (v = 1), 8 ouest (u = 0).
  function peindreRivage(ctx, P, M, masque, fr) {
    var e = 0.2, f = 0.3 + (fr & 1) * 0.035, clair = alpha(M.ecume, 0.8);
    var bord = function (q0, q1, i0, i1, m0, m1) {
      poly(ctx, [q0, q1, i1, i0], M.sable);
      poly(ctx, [i0, i1, m1, m0], alpha(M.eauC, 0.38));
      ligne(ctx, m0, m1, clair, 1.1);
      ligne(ctx, i0, i1, alpha(nuance(M.sable, 0.75), 0.7), 0.7);
    };
    if (masque & 1) bord(P(0, 0), P(1, 0), P(0, e), P(1, e), P(0, f), P(1, f));
    if (masque & 8) bord(P(0, 0), P(0, 1), P(e, 0), P(e, 1), P(f, 0), P(f, 1));
    if (masque & 2) bord(P(1, 0), P(1, 1), P(1 - e, 0), P(1 - e, 1), P(1 - f, 0), P(1 - f, 1));
    if (masque & 4) bord(P(0, 1), P(1, 1), P(0, 1 - e), P(1, 1 - e), P(0, 1 - f), P(1, 1 - f));
  }

  // --- Passerelle ----------------------------------------------------------------
  // Dalles claires bordées de lumières. masque des passerelles voisines (mêmes bits que la rive).
  // astroport : la grande piste par où arrivent les colons (plus sombre, chevrons ambre).
  function peindreRoute(ctx, P, masque, astroport) {
    var base = astroport ? '#59647a' : '#97a4b8', k;
    var a = P(0, 0), b = P(1, 1);
    fond(ctx, P, degV(ctx, a[1], b[1], nuance(base, 1.1), nuance(base, 0.92)));
    // Joints des dalles.
    var joint = astroport ? 'rgba(20,26,40,0.3)' : 'rgba(40,52,76,0.22)';
    ligne(ctx, P(0.5, 0), P(0.5, 1), joint, 0.6); ligne(ctx, P(0, 0.5), P(1, 0.5), joint, 0.6);
    // Reflet doux au centre.
    var c = P(0.5, 0.5);
    ellipse(ctx, c[0] - 3, c[1] - 1.5, 13, 5, 'rgba(255,255,255,0.1)');
    // Bordures : liseré sombre et rail lumineux du côté sans voisine.
    var lum = astroport ? C.ambre : C.cyan;
    var bords = [[1, P(0, 0), P(1, 0), P(0, 0.09), P(1, 0.09)], [8, P(0, 0), P(0, 1), P(0.09, 0), P(0.09, 1)], [2, P(1, 0), P(1, 1), P(0.91, 0), P(0.91, 1)], [4, P(0, 1), P(1, 1), P(0, 0.91), P(1, 0.91)]];
    bords.forEach(function (q) {
      if (masque & q[0]) return;
      poly(ctx, [q[1], q[2], q[4], q[3]], astroport ? '#3c4558' : '#6c7a92');
      ligne(ctx, q[3], q[4], alpha(lum, 0.85), 0.9);
    });
    // Guide lumineux au centre, vers chaque voisine (toujours tracé sur une passerelle isolée).
    var m = masque || 15, guide = alpha(lum, astroport ? 0.9 : 0.55);
    ctx.setLineDash(astroport ? [3, 3] : [2, 3]);
    if (m & 1) ligne(ctx, P(0.5, 0.5), P(0.5, 0), guide, astroport ? 1.4 : 1);
    if (m & 4) ligne(ctx, P(0.5, 0.5), P(0.5, 1), guide, astroport ? 1.4 : 1);
    if (m & 8) ligne(ctx, P(0.5, 0.5), P(0, 0.5), guide, astroport ? 1.4 : 1);
    if (m & 2) ligne(ctx, P(0.5, 0.5), P(1, 0.5), guide, astroport ? 1.4 : 1);
    ctx.setLineDash([]);
    if (astroport) {
      // Chevrons ambre et plots de balisage.
      for (k = 0; k < 2; k++) { var p = P(0.5, 0.3 + k * 0.4); trace(ctx, [[p[0] - 5, p[1] + 1], [p[0], p[1] - 1.5], [p[0] + 5, p[1] + 1]], alpha(C.ambre, 0.7), 1.2); }
      [P(0.14, 0.14), P(0.86, 0.86), P(0.14, 0.86), P(0.86, 0.14)].forEach(function (q) { lampe(ctx, q[0], q[1], C.ambre, 0.8); });
    } else {
      cercle(ctx, c[0], c[1], 1.3, alpha(C.cyan, 0.9)); cercle(ctx, c[0], c[1], 0.6, '#ffffff');
    }
  }
  // Esplanade : grandes dalles claires, incrustations de couleur ; les bords se fondent entre
  // esplanades voisines (même masque que les passerelles).
  function peindrePlace(ctx, P, masque) {
    var a = P(0, 0), b = P(1, 1), k, j;
    fond(ctx, P, degV(ctx, a[1], b[1], '#dfe6ef', '#c9d3e0'));
    for (k = 0; k < 2; k++) for (j = 0; j < 2; j++) {
      var u = 0.07 + k * 0.5, v = 0.07 + j * 0.5;
      poly(ctx, [P(u, v), P(u + 0.36, v), P(u + 0.36, v + 0.36), P(u, v + 0.36)], (k + j) % 2 ? '#eef3f8' : '#d3dce8');
    }
    var c = P(0.5, 0.5);
    poly(ctx, [P(0.4, 0.4), P(0.6, 0.4), P(0.6, 0.6), P(0.4, 0.6)], '#4fc8e8');
    poly(ctx, [P(0.45, 0.45), P(0.55, 0.45), P(0.55, 0.55), P(0.45, 0.55)], '#ffffff');
    lueur(ctx, c[0], c[1], 7, '#4fc8e8', 0.25);
    var bords = [[1, P(0, 0), P(1, 0)], [8, P(0, 0), P(0, 1)], [2, P(1, 0), P(1, 1)], [4, P(0, 1), P(1, 1)]];
    bords.forEach(function (q) { if (!(masque & q[0])) ligne(ctx, q[1], q[2], 'rgba(70,90,120,0.55)', 1.1); });
  }

  // --- Arbres à résine -----------------------------------------------------------
  // Rubra : troncs violets, bulbes turquoise lumineux, gouttes de résine ambrée.
  // Borée : arbres de givre aux palmes mauves. Ambre : cactus-cristal aux pointes lumineuses.
  function bulbe(ctx, x, y, r, c, cc) {
    ctx.fillStyle = degR(ctx, x, y, r * 1.15, [[0, cc], [0.5, c], [1, nuance(c, 0.55)]], x - r * 0.35, y - r * 0.4);
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.82, 0, 0, Math.PI * 2); ctx.fill();
    cercle(ctx, x - r * 0.35, y - r * 0.35, r * 0.18, 'rgba(255,255,255,0.75)');
  }
  function peindreArbre(ctx, P, M, nom, v) {
    var p = P(0.5, 0.56), x = p[0], y = p[1], k;
    ellipse(ctx, x + 4, y + 1.5, 12, 4.6, 'rgba(10,12,24,0.26)');
    if (nom === 'ambre') {
      // Cactus-cristal : colonnes facettées, bras, pointe qui luit.
      var H = [24, 30, 20][v], bras = [[-6, 10, 9], [6, 14, 8]];
      bras.forEach(function (b, i) {
        if (v === 2 && i === 1) return;
        var bx = x + b[0], by = y - b[1];
        A.tuyau(ctx, [[x, by + 4], [bx, by + 4], [bx, by - b[2]]], M.tronc, 3.2);
        lampe(ctx, bx, by - b[2] - 1, M.cristal, 0.9);
      });
      ctx.fillStyle = A.degH(ctx, x - 4, x + 4, [[0, nuance(M.tronc, 1.15)], [0.4, nuance(M.feuillage, 1.05)], [1, nuance(M.tronc, 0.6)]]);
      ctx.beginPath(); ctx.roundRect(x - 3.6, y - H, 7.2, H, 3.4); ctx.fill();
      for (k = 0; k < 3; k++) ligne(ctx, [x - 1.6 + k * 1.6, y - H + 3], [x - 1.6 + k * 1.6, y - 1], 'rgba(255,255,255,0.22)', 0.5);
      lueur(ctx, x, y - H, 6, M.cristal, 0.5); A.cristal(ctx, x, y - H + 1.5, 2.4, 6, M.cristal, 0.5);
      return;
    }
    if (nom === 'boree') {
      // Arbre de givre : tronc pâle, palmes mauves en étages, givre blanc.
      var Hb = [30, 36, 26][v];
      ligne(ctx, [x, y], [x + 1, y - Hb], M.tronc, 2.4); ligne(ctx, [x - 0.6, y], [x + 0.4, y - Hb], 'rgba(255,255,255,0.45)', 0.7);
      for (k = 0; k < 4; k++) {
        var yy = y - Hb * (0.38 + k * 0.17), l = (11 - k * 2.2) * (v === 2 ? 0.85 : 1);
        poly(ctx, [[x - l, yy + 3], [x + 0.5, yy - 5], [x + l, yy + 3], [x + 0.5, yy + 0.6]], nuance(M.feuillage, 0.82 + k * 0.08));
        poly(ctx, [[x - l, yy + 3], [x + 0.5, yy - 5], [x + 0.5, yy + 0.6]], nuance(M.feuillage, 1.12 + k * 0.05));
        ligne(ctx, [x - l, yy + 3], [x + 0.5, yy - 5], 'rgba(255,255,255,0.55)', 0.6);
      }
      lampe(ctx, x + 1, y - Hb - 1, M.feuillageC, 1);
      return;
    }
    // Rubra : un grand bulbe et deux petits, portés par des troncs courbes.
    var G = [[[0, 30, 8.6], [-8, 19, 5.2], [8, 16, 4.4]], [[1, 34, 7.6], [-7, 22, 6], [7, 23, 5]], [[-2, 24, 7.4], [7, 28, 6.2], [-9, 14, 3.8]]][v];
    G.forEach(function (g) {
      ctx.strokeStyle = M.tronc; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + g[0] * 0.2, y - g[1] * 0.6, x + g[0], y - g[1] + g[2] * 0.6); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(x - 0.7, y); ctx.quadraticCurveTo(x + g[0] * 0.2 - 0.7, y - g[1] * 0.6, x + g[0] - 0.7, y - g[1] + g[2] * 0.6); ctx.stroke();
    });
    G.slice().sort(function (a, b) { return b[1] - a[1]; }).forEach(function (g, i) {
      lueur(ctx, x + g[0], y - g[1], g[2] * 1.9, M.feuillage, 0.3);
      bulbe(ctx, x + g[0], y - g[1], g[2], M.feuillage, M.feuillageC);
      // Goutte de résine ambrée sous le bulbe.
      if (i < 2) { cercle(ctx, x + g[0] + g[2] * 0.3, y - g[1] + g[2] * 0.9, 1.1, C.ambre); cercle(ctx, x + g[0] + g[2] * 0.3 - 0.3, y - g[1] + g[2] * 0.9 - 0.3, 0.4, '#fff'); }
    });
  }

  // --- Rochers -------------------------------------------------------------------
  function bloc(ctx, x, y, w, h, c, cc) {
    poly(ctx, [[x - w, y], [x - w * 0.62, y - h * 0.86], [x - w * 0.1, y - h], [x + w * 0.5, y - h * 0.78], [x + w, y - h * 0.1], [x + w * 0.7, y + h * 0.16], [x - w * 0.5, y + h * 0.18]], c);
    poly(ctx, [[x - w, y], [x - w * 0.62, y - h * 0.86], [x - w * 0.1, y - h], [x - w * 0.02, y - h * 0.3], [x - w * 0.5, y + h * 0.18]], cc);
    poly(ctx, [[x - w * 0.1, y - h], [x + w * 0.5, y - h * 0.78], [x + w * 0.2, y - h * 0.46], [x - w * 0.02, y - h * 0.3]], teinte(cc, 0.86));
    ligne(ctx, [x - w * 0.62, y - h * 0.86], [x - w * 0.1, y - h], 'rgba(255,255,255,0.4)', 0.6);
  }
  function peindreRocher(ctx, P, M, nom, v) {
    var p = P(0.5, 0.55), x = p[0], y = p[1];
    ellipse(ctx, x + 3, y + 3, 19, 7, 'rgba(10,12,24,0.28)');
    if (v === 0) { bloc(ctx, x - 6, y + 1, 12, 18, M.roche, M.rocheC); bloc(ctx, x + 9, y + 3, 9, 11, nuance(M.roche, 0.92), M.rocheC); }
    else if (v === 1) { bloc(ctx, x + 4, y, 14, 22, M.roche, M.rocheC); bloc(ctx, x - 10, y + 4, 8, 9, nuance(M.roche, 1.06), nuance(M.rocheC, 1.08)); }
    else { bloc(ctx, x - 2, y, 10, 14, nuance(M.roche, 0.94), M.rocheC); bloc(ctx, x + 10, y + 4, 7, 8, M.roche, M.rocheC); bloc(ctx, x - 12, y + 5, 6, 7, M.roche, M.rocheC); }
    if (nom === 'boree') { ellipse(ctx, x - 5, y - 12 - v * 2, 6, 2, 'rgba(255,255,255,0.85)'); }
    // Éclats de cristal lumineux au pied des rochers.
    lueur(ctx, x + 11, y + 2, 5, M.cristal, 0.4);
    A.cristal(ctx, x + 11, y + 4, 1.8, 6.5, M.cristal, 0.6); A.cristal(ctx, x + 14, y + 5, 1.3, 4, M.cristal, -0.4);
    if (v !== 1) A.cristal(ctx, x - 13, y + 3, 1.4, 5, M.cristal, -0.6);
  }

  A.terrain = {
    sol: peindreSol, fertile: peindreFertile, eau: peindreEau, rivage: peindreRivage, route: peindreRoute, place: peindrePlace,
    arbre: peindreArbre, rocher: peindreRocher, fond: fond, caillou: caillou, bloc: bloc, bulbe: bulbe
  };
  void sol; void degV; void lampe;
})(typeof window !== 'undefined' ? window : globalThis);
