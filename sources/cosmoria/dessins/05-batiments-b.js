/* ==========================================================================
   Cosmoria — dessins, partie 5 : santé, Intelligences, éducation, spectacles,
   administration, embellissement, sécurité, défense, épaves et incendies.
   Mêmes conventions que la partie 4.
   ========================================================================== */
(function (racine) {
  'use strict';
  var A = racine.CM_ART, C = A.C, PE = A.PEINTRES, HAUT = A.HAUT, B = A.batir, MA = A.maison;
  var poly = A.poly, ligne = A.ligne, trace = A.trace, cercle = A.cercle, ellipse = A.ellipse, teinte = A.teinte, nuance = A.nuance,
    alpha = A.alpha, boite = A.boite, module = A.module, voute = A.voute, cylindre = A.cylindre, tronc = A.tronc, dome = A.dome,
    sphere = A.sphere, fenetres = A.fenetres, baie = A.baie, ceinture = A.ceinture, neon = A.neon, sas = A.sas, mat = A.mat,
    parabole = A.parabole, panneau = A.panneau, tuyau = A.tuyau, conteneur = A.conteneur, lampe = A.lampe, lueur = A.lueur,
    verdure = A.verdure, arbuste = A.arbuste, dalle = A.dalle, ombre = A.ombre, figurant = A.figurant, vapeur = A.vapeur,
    hologramme = A.hologramme, degR = A.degR, degV = A.degV, RX = A.RX, RY = A.RY, enseigne = B.enseigne, local = B.local;

  function parvis(ctx, P, t, c, h) {
    h = h || 2.4;
    boite(ctx, P, 0.05, 0.05, t - 0.05, t - 0.05, 0, h, c || C.coqueG, { sansPied: true, dessus: nuance(c || C.coqueG, 1.08) });
    return h;
  }
  function lampadaire(ctx, P, u, v, h0, c, H) { var p = P(u, v, h0); ligne(ctx, p, [p[0], p[1] - (H || 8)], C.acier, 1); lampe(ctx, p[0], p[1] - (H || 8), c || C.chaud, 1); }

  // ==========================================================================
  // Santé
  // ==========================================================================
  // Salon de coiffure : vitrine, enseigne torsadée rose et blanche.
  PE.barbier = function (ctx, P) {
    MA.fondation(ctx, P, 1, C.sante);
    var top = module(ctx, P, 0.14, 0.16, 0.86, 0.84, 1.6, 14, '#f4f6fa', { toit: '#ffd0e6', e: 3 });
    baie(ctx, P, 'v', 0.44, 0.82, 0.84, 4, 11, '#2f86b0'); sas(ctx, P, 'v', 0.2, 0.38, 0.84, 8, C.rose);
    baie(ctx, P, 'u', 0.22, 0.78, 0.86, 4, 11, '#2f86b0');
    ceinture(ctx, P, 0.14, 0.16, 0.86, 0.84, 12, 13.4, C.rose);
    // Enseigne torsadée.
    var p = P(0.74, 0.3, top), k;
    ctx.fillStyle = '#fff'; ctx.fillRect(p[0] - 1.8, p[1] - 12, 3.6, 12);
    for (k = 0; k < 4; k++) poly(ctx, [[p[0] - 1.8, p[1] - 12 + k * 3], [p[0] + 1.8, p[1] - 10.4 + k * 3], [p[0] + 1.8, p[1] - 9 + k * 3], [p[0] - 1.8, p[1] - 10.6 + k * 3]], k % 2 ? C.sante : C.rose);
    sphere(ctx, p[0], p[1] - 13.4, 2.2, C.coque); lueur(ctx, p[0], p[1] - 7, 8, C.rose, 0.3);
  };
  HAUT.barbier = 38;
  // Thermes : bassin chaud sous dôme, vapeur quand ils sont alimentés en eau.
  PE.bains = function (ctx, P, t, etat) {
    var on = etat && etat.actif, fr = (etat && etat.frame) || 0;
    parvis(ctx, P, 2, '#dfe6ef');
    var top = local(ctx, P, 1.24, 0.14, 1.9, 0.76, 13, C.sante, { h0: 2.4 });
    var e = P(1.56, 0.44, top); enseigne(ctx, e[0], e[1], 'sante', 6);
    MA.couronne(ctx, P, 0.86, 1.12, 0.8, 2.4, 6, '#eef2f7');
    var b = P(0.86, 1.12, 6);
    ellipse(ctx, b[0], b[1], 0.72 * RX, 0.72 * RY, on ? degR(ctx, b[0], b[1], 0.72 * RX, [[0, '#8ff5e2'], [0.7, '#35c0d0'], [1, '#1f8fa8']], b[0] - 10, b[1] - 5) : '#4a5568');
    if (on) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(b[0] - 5 + fr * 3, b[1], 9, 3.4, 0, 0, Math.PI * 2); ctx.stroke();
      var f = P(0.6, 1.3, 6); cercle(ctx, f[0], f[1] - 1.5, 1.8, '#ffe0c0'); f = P(1.1, 1.0, 6); cercle(ctx, f[0], f[1] - 1.5, 1.8, '#e8b890');
    }
    dome(ctx, P, 0.86, 1.12, 0.76, 6, 32, on ? '#bff6ff' : C.verre, { verre: true, nervures: 5 });
    if (on) { vapeur(ctx, b[0] - 8, b[1] - 34, fr); vapeur(ctx, b[0] + 9, b[1] - 30, 1 - fr); }
    tuyau(ctx, [P(1.24, 0.5, 6), P(1.1, 0.6, 6)], C.eau, 2.2);
  };
  HAUT.bains = 50;
  // Infirmerie.
  PE.medecin = function (ctx, P) {
    MA.fondation(ctx, P, 1, C.sante);
    var top = local(ctx, P, 0.14, 0.16, 0.86, 0.84, 13, C.sante, { h0: 1.6 });
    var e = P(0.5, 0.5, top); enseigne(ctx, e[0], e[1], 'sante', 7);
    boite(ctx, P, 0.6, 0.24, 0.8, 0.44, top, top + 3, C.acier, { sansPied: true });
  };
  HAUT.medecin = 40;
  // Hôpital : deux ailes, bloc central vitré, aire de l'ambulance volante.
  PE.hopital = function (ctx, P) {
    parvis(ctx, P, 3, '#dfe6ef');
    var t1 = local(ctx, P, 0.16, 0.16, 1.24, 1.5, 20, C.sante, { h0: 2.4, porte: false });
    fenetres(ctx, P, 'v', 0.2, 1.2, 1.5, 6, 9.5, 5, '#bfeaff');
    var t2 = module(ctx, P, 1.24, 0.3, 2.84, 1.3, 2.4, 30, C.coque, { e: 3 });
    ceinture(ctx, P, 1.24, 0.3, 2.84, 1.3, 26.4, 28.4, C.sante);
    baie(ctx, P, 'v', 1.34, 2.74, 1.3, 16, 24, '#2f86b0'); fenetres(ctx, P, 'v', 1.74, 2.78, 1.3, 6, 11, 5, '#bfeaff'); sas(ctx, P, 'v', 1.36, 1.68, 1.3, 9, C.sante);
    fenetres(ctx, P, 'u', 0.36, 1.24, 2.84, 6, 11, 4, '#bfeaff'); fenetres(ctx, P, 'u', 0.36, 1.24, 2.84, 16, 22, 4, '#bfeaff');
    var e = P(2.04, 0.8, t2); enseigne(ctx, e[0], e[1], 'sante', 10);
    var p = P(0.5, 0.5, t1); parabole(ctx, p[0], p[1], 5);
    // Aire de pose, marquée d'une croix claire, et navette de secours.
    A.aire(ctx, P, 1.0, 2.2, 0.6, 2.4, alpha(C.sante, 0.9));
    var n = P(1.0, 2.2, 2.4); ombre(ctx, n[0], n[1] + 2, 15, 5, 0.3);
    ctx.fillStyle = '#f4f6fa'; ctx.beginPath(); ctx.ellipse(n[0], n[1] - 5, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.sante; ctx.fillRect(n[0] - 9, n[1] - 5.6, 18, 1.6); ctx.fillStyle = '#2f86b0'; ctx.beginPath(); ctx.ellipse(n[0] + 5, n[1] - 7, 5, 2.4, 0, Math.PI, 0); ctx.fill();
    lampe(ctx, n[0] - 12, n[1] - 5, C.rouge, 0.9);
    lampadaire(ctx, P, 2.7, 2.7, 2.4, C.vert); p = P(2.2, 2.2, 2.4); arbuste(ctx, p[0], p[1], 10, C.feuille, 3); p = P(2.5, 1.8, 2.4); figurant(ctx, p[0], p[1], 1, '#c8fff0');
  };
  HAUT.hopital = 58;

  // ==========================================================================
  // Les Cinq Intelligences
  // ==========================================================================
  var IA = { ceres: '#74d44f', neptune: '#4aa8ff', mercure: '#ffcf6b', mars: '#ff5d5d', venus: '#ff8fd0' };
  // Signe de chaque Intelligence, tracé en lumière (s : taille).
  function signe(ctx, x, y, s, ia, c) {
    c = c || '#fff'; ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = Math.max(0.8, s * 0.22); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (ia) {
      case 'ceres': ligne(ctx, [x, y + s], [x, y - s * 0.2], c, ctx.lineWidth); ctx.beginPath(); ctx.ellipse(x - s * 0.5, y - s * 0.4, s * 0.6, s * 0.3, 0.7, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + s * 0.5, y - s * 0.6, s * 0.6, s * 0.3, -0.7, 0, Math.PI * 2); ctx.fill(); break;
      case 'neptune': for (var k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x - s, y + k * s * 0.55); ctx.quadraticCurveTo(x - s * 0.5, y + k * s * 0.55 - s * 0.5, x, y + k * s * 0.55); ctx.quadraticCurveTo(x + s * 0.5, y + k * s * 0.55 + s * 0.5, x + s, y + k * s * 0.55); ctx.stroke(); } break;
      case 'mercure': ctx.beginPath(); for (var j = 0; j < 6; j++) { var a = j * Math.PI / 3 + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); } ctx.closePath(); ctx.stroke(); cercle(ctx, x, y, s * 0.3, c); break;
      case 'mars': poly(ctx, [[x - s * 0.8, y - s], [x + s * 0.8, y - s], [x + s * 0.8, y], [x, y + s], [x - s * 0.8, y]], null, c, ctx.lineWidth); ligne(ctx, [x, y - s * 0.5], [x, y + s * 0.3], c, ctx.lineWidth); break;
      default: ctx.beginPath(); ctx.moveTo(x, y + s); ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.3, x, y - s * 0.4); ctx.bezierCurveTo(x + s * 0.6, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s); ctx.fill();
    }
  }
  // Cœur lumineux d'un noyau : sphère, halo, anneau d'orbite.
  function coeur(ctx, x, y, r, c) {
    lueur(ctx, x, y, r * 3.2, c, 0.55);
    sphere(ctx, x, y, r, c);
    cercle(ctx, x - r * 0.3, y - r * 0.35, r * 0.34, 'rgba(255,255,255,0.85)');
    A.eclat(ctx, c, 4, function () { ctx.strokeStyle = nuance(c, 1.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, r * 1.7, r * 0.5, -0.35, 0, Math.PI * 2); ctx.stroke(); });
  }
  // Noyau (2 × 2) : estrade ronde, quatre arcs qui portent le cœur de l'Intelligence.
  function peindreNoyau(ctx, P, ia) {
    var c = IA[ia], k;
    parvis(ctx, P, 2, '#dfe6ef');
    cylindre(ctx, P, 1, 1, 0.82, 2.4, 5, '#eef2f7'); cylindre(ctx, P, 1, 1, 0.6, 5, 7.4, '#f8fafc', { dessus: nuance(c, 1.35) });
    var s = P(1, 1, 30), pieds = [[0.44, 0.44], [1.56, 0.44], [0.44, 1.56], [1.56, 1.56]];
    var arc = function (q) { var a = P(q[0], q[1], 5); ctx.strokeStyle = C.coque; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(a[0], s[1] - 4, s[0] + (a[0] - s[0]) * 0.18, s[1] - 13); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(a[0] - 0.8, a[1]); ctx.quadraticCurveTo(a[0] - 0.8, s[1] - 4, s[0] + (a[0] - s[0]) * 0.18 - 0.8, s[1] - 13); ctx.stroke(); lampe(ctx, a[0], a[1] - 1, c, 0.9); };
    arc(pieds[0]); arc(pieds[1]);
    coeur(ctx, s[0], s[1] - 2, 8.5, c);
    arc(pieds[2]); arc(pieds[3]);
    cylindre(ctx, P, 1, 1, 0.12, 40, 43, C.coque); var t = P(1, 1, 43); mat(ctx, t[0], t[1], 6, c);
    // Signe de l'Intelligence, en hologramme devant l'estrade.
    var g = P(1.62, 1.62, 2.4); lueur(ctx, g[0], g[1] - 8, 8, c, 0.4); signe(ctx, g[0], g[1] - 8, 3.6, ia, nuance(c, 1.35)); cercle(ctx, g[0], g[1], 1.6, c);
    for (k = 0; k < 2; k++) { var f = P(0.34 + k * 1.3, 1.74 - k * 1.3, 2.4); if (k === 0) figurant(ctx, f[0], f[1], 1, '#f4f6fa'); }
  }
  // Grand noyau (3 × 3) : estrade à degrés, haute flèche de cristal habitée par l'Intelligence.
  function peindreGrandNoyau(ctx, P, ia) {
    var c = IA[ia];
    parvis(ctx, P, 3, '#dfe6ef');
    A.quadrillage(ctx, P, 0.05, 0.05, 2.95, 2.95, 2.4, 0.48, 'rgba(120,140,170,0.25)');
    boite(ctx, P, 0.5, 0.5, 2.5, 2.5, 2.4, 6, '#eef2f7', { dessus: '#f8fafc' }); boite(ctx, P, 0.8, 0.8, 2.2, 2.2, 6, 9.6, '#f4f6fa', { dessus: nuance(c, 1.4) });
    [[0.62, 0.62], [2.38, 0.62]].forEach(function (q) { var p = P(q[0], q[1], 6); lueur(ctx, p[0], p[1] - 6, 7, c, 0.4); A.cristal(ctx, p[0], p[1], 2.6, 13, c, 0.4); });
    var b = P(1.5, 1.5, 9.6);
    lueur(ctx, b[0], b[1] - 34, 44, c, 0.42);
    // Flèche : trois cristaux, le plus haut au centre.
    A.cristal(ctx, b[0] - 11, b[1] + 1, 5, 36, nuance(c, 0.9), -3); A.cristal(ctx, b[0] + 11, b[1] + 2, 5, 32, nuance(c, 0.85), 3);
    A.cristal(ctx, b[0], b[1] + 3, 8, 66, c, 0);
    ligne(ctx, [b[0] - 1.6, b[1] - 4], [b[0] - 0.6, b[1] - 56], 'rgba(255,255,255,0.7)', 1.2);
    coeur(ctx, b[0], b[1] - 40, 5, nuance(c, 1.2));
    A.eclat(ctx, c, 5, function () { ctx.strokeStyle = nuance(c, 1.35); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(b[0], b[1] - 20, 20, 6.5, 0, 0, Math.PI * 2); ctx.stroke(); });
    lampe(ctx, b[0], b[1] - 64, '#ffffff', 1.4);
    [[0.62, 2.38], [2.38, 2.38]].forEach(function (q) { var p = P(q[0], q[1], 6); lueur(ctx, p[0], p[1] - 6, 7, c, 0.4); A.cristal(ctx, p[0], p[1], 2.6, 13, c, -0.4); });
    var g = P(1.5, 2.72, 2.4); lueur(ctx, g[0], g[1] - 9, 10, c, 0.45); signe(ctx, g[0], g[1] - 9, 4.6, ia, nuance(c, 1.35)); cercle(ctx, g[0], g[1], 1.8, c);
    var f = P(2.2, 2.74, 2.4); figurant(ctx, f[0], f[1], 1, '#f4f6fa'); f = P(0.7, 2.7, 2.4); figurant(ctx, f[0], f[1], 1, '#e0d0ff');
  }
  ['ceres', 'neptune', 'mercure', 'mars', 'venus'].forEach(function (ia) {
    PE['temple_' + ia] = function (ctx, P) { peindreNoyau(ctx, P, ia); }; HAUT['temple_' + ia] = 58;
    PE['grand_temple_' + ia] = function (ctx, P) { peindreGrandNoyau(ctx, P, ia); }; HAUT['grand_temple_' + ia] = 86;
  });
  // Oracle quantique : grande parabole et polyèdre de lumière en suspension.
  PE.oracle = function (ctx, P) {
    parvis(ctx, P, 2, '#394356');
    cylindre(ctx, P, 1, 1, 0.7, 2.4, 6, '#4a5568', { dessus: '#2a3446' });
    var b = P(1, 1, 6), c = C.violet, k;
    for (k = 0; k < 6; k++) { var a = k * Math.PI / 3; lampe(ctx, b[0] + Math.cos(a) * 0.6 * RX, b[1] + Math.sin(a) * 0.6 * RY, c, 0.8); }
    ctx.fillStyle = degV(ctx, b[1] - 34, b[1], alpha(c, 0.02), alpha(c, 0.3)); ctx.beginPath(); ctx.moveTo(b[0] - 14, b[1]); ctx.lineTo(b[0] + 14, b[1]); ctx.lineTo(b[0] + 9, b[1] - 34); ctx.lineTo(b[0] - 9, b[1] - 34); ctx.closePath(); ctx.fill();
    var y = b[1] - 30;
    lueur(ctx, b[0], y, 24, c, 0.55);
    poly(ctx, [[b[0], y - 13], [b[0] + 10, y], [b[0], y + 13], [b[0] - 10, y]], alpha(c, 0.55), nuance(c, 1.3), 1);
    poly(ctx, [[b[0], y - 13], [b[0] + 10, y], [b[0] + 2, y + 2]], alpha('#ffffff', 0.35)); ligne(ctx, [b[0] - 10, y], [b[0] + 2, y + 2], nuance(c, 1.3), 0.8); ligne(ctx, [b[0] + 2, y + 2], [b[0] + 10, y], nuance(c, 1.3), 0.8); ligne(ctx, [b[0] + 2, y + 2], [b[0], y + 13], nuance(c, 1.3), 0.8); ligne(ctx, [b[0] + 2, y + 2], [b[0], y - 13], nuance(c, 1.3), 0.8);
    A.eclat(ctx, c, 4, function () { ctx.strokeStyle = nuance(c, 1.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(b[0], y, 17, 5, 0.3, 0, Math.PI * 2); ctx.stroke(); });
    var p = P(1.7, 0.36, 2.4); parabole(ctx, p[0], p[1], 7, '#dfe6ef');
  };
  HAUT.oracle = 58;

  // ==========================================================================
  // Éducation
  // ==========================================================================
  // École : salle de classe, cour de jeux colorée, globe en hologramme.
  PE.ecole = function (ctx, P) {
    parvis(ctx, P, 2, '#dfe6ef');
    var top = local(ctx, P, 0.14, 0.14, 1.86, 0.94, 14, C.educ, { h0: 2.4, lum: '#fff2c0' });
    var e = P(0.5, 0.54, top); enseigne(ctx, e[0], e[1], 'educ', 7);
    panneau(ctx, P, 1.0, 0.24, 1.7, 0.7, top + 1, top + 6, 3);
    // Cour : marelle de couleurs, petit toboggan, élèves.
    dalle(ctx, P, 0.14, 1.04, 1.86, 1.86, 2.5, '#2f8f9a');
    [['#ffd35a', 0.3], ['#ff8fd0', 0.56], ['#7df3ff', 0.82]].forEach(function (q) { dalle(ctx, P, q[1], 1.2, q[1] + 0.2, 1.4, 2.6, q[0]); });
    var t = P(1.5, 1.4, 2.5); ligne(ctx, [t[0], t[1]], [t[0], t[1] - 8], C.coqueG, 1.4); tuyau(ctx, [[t[0], t[1] - 8], [t[0] - 9, t[1] + 2]], '#ff8a3c', 2.6);
    var f = P(0.5, 1.66, 2.5); figurant(ctx, f[0], f[1], 0.8, '#ffd35a'); f = P(0.84, 1.6, 2.5); figurant(ctx, f[0], f[1], 0.8, '#ff8fd0'); f = P(1.14, 1.72, 2.5); figurant(ctx, f[0], f[1], 1, '#c8f4ff');
    var h = P(1.72, 1.74, 2.5); hologramme(ctx, h[0], h[1], 8, C.educ, 'globe', 3.4);
  };
  HAUT.ecole = 42;
  // Médiathèque : rotonde vitrée, livre de lumière.
  PE.bibliotheque = function (ctx, P) {
    parvis(ctx, P, 2, '#dfe6ef');
    cylindre(ctx, P, 1, 0.96, 0.78, 2.4, 20, C.coque, { anneaux: 0, dessus: '#dfe6ef' });
    var b = P(1, 0.96, 0), k;
    // Bandeau vitré tout autour et ceinture de couleur.
    ctx.strokeStyle = '#2f86b0'; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(b[0], b[1] - 11, 0.78 * RX - 0.6, 0.78 * RY, 0, 0.08, Math.PI - 0.08); ctx.stroke();
    for (k = 1; k < 8; k++) { var a = Math.PI * k / 8, x = b[0] + Math.cos(a) * 0.78 * RX, y = b[1] - 11 + Math.sin(a) * 0.78 * RY; ligne(ctx, [x, y - 3.6], [x, y + 3.6], C.coque, 1.1); }
    ctx.strokeStyle = C.educ; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(b[0], b[1] - 18.4, 0.78 * RX, 0.78 * RY, 0, 0.05, Math.PI - 0.05); ctx.stroke();
    dome(ctx, P, 1, 0.96, 0.62, 20, 16, '#9df0ff', { verre: true, nervures: 5 });
    sas(ctx, P, 'v', 0.86, 1.14, 1.72, 8, C.educ);
    // Livre ouvert en hologramme au-dessus du dôme.
    var h = P(1, 0.96, 38); lueur(ctx, h[0], h[1] - 4, 11, C.educ, 0.5);
    poly(ctx, [[h[0] - 8, h[1] - 6], [h[0], h[1] - 3], [h[0], h[1] + 3], [h[0] - 8, h[1]]], alpha(C.educ, 0.6), '#fff', 0.7);
    poly(ctx, [[h[0] + 8, h[1] - 6], [h[0], h[1] - 3], [h[0], h[1] + 3], [h[0] + 8, h[1]]], alpha(C.educ, 0.4), '#fff', 0.7);
    lampadaire(ctx, P, 0.3, 1.7, 2.4, C.educ); lampadaire(ctx, P, 1.7, 1.7, 2.4, C.educ);
    var f = P(1.4, 1.74, 2.4); figurant(ctx, f[0], f[1], 1, '#c8f4ff');
  };
  HAUT.bibliotheque = 54;
  // Institut des sciences : coupole d'observatoire fendue, télescope, ailes de laboratoires.
  PE.academie = function (ctx, P) {
    parvis(ctx, P, 3, '#dfe6ef');
    var t1 = local(ctx, P, 0.16, 0.2, 1.3, 1.1, 16, C.educ, { h0: 2.4 });
    var p = P(0.7, 0.6, t1); parabole(ctx, p[0], p[1], 6);
    var t2 = local(ctx, P, 1.5, 0.2, 2.84, 1.6, 22, C.educ, { h0: 2.4, porte: false });
    fenetres(ctx, P, 'v', 1.56, 2.8, 1.6, 5, 9, 6, '#bfeaff');
    cylindre(ctx, P, 2.16, 0.9, 0.5, t2, t2 + 5, '#eef2f7');
    dome(ctx, P, 2.16, 0.9, 0.5, t2 + 5, 20, '#eef2f7', { nervures: 2 });
    // Fente de la coupole et télescope.
    var d = P(2.16, 0.9, t2 + 5); poly(ctx, [[d[0] - 3, d[1] - 19], [d[0] + 3, d[1] - 19.5], [d[0] + 7, d[1] - 3], [d[0] + 1, d[1] - 2]], '#1c2330');
    tuyau(ctx, [[d[0] + 2, d[1] - 9], [d[0] + 11, d[1] - 21]], '#aeb9c9', 3.4); cercle(ctx, d[0] + 11.6, d[1] - 21.8, 2, '#7fe0ff');
    // Jardin d'expériences et atome en hologramme.
    dalle(ctx, P, 0.2, 1.3, 1.3, 2.8, 2.5, '#3a7f6a'); B.rangs(ctx, P, 0.3, 1.4, 1.2, 2.7, 2.5, 3, 'v', '#58d08a', 2, '#ffd35a');
    var h = P(2.1, 2.3, 2.4); hologramme(ctx, h[0], h[1], 13, C.educ, 'globe', 5.4);
    lampadaire(ctx, P, 2.76, 2.76, 2.4, C.educ); var f = P(1.7, 2.5, 2.4); figurant(ctx, f[0], f[1], 1, '#c8f4ff'); f = P(2.5, 2.0, 2.4); figurant(ctx, f[0], f[1], 1, '#f4f6fa');
  };
  HAUT.academie = 62;

  // ==========================================================================
  // Spectacles
  // ==========================================================================
  // Stade : mur d'enceinte, gradins en cuvette, piste au fond. o : { piste, sol, gradins, h0 }.
  function stade(ctx, P, cu, cv, r, H, c, o) {
    o = o || {};
    var h0 = o.h0 || 0, k;
    cylindre(ctx, P, cu, cv, r, h0, h0 + H, C.coque, { dessus: false, anneaux: 2 });
    var b = P(cu, cv, h0 + H), rx = r * RX, ry = r * RY, ri = o.piste || 0.54, prof = H * 0.62;
    // Arcades lumineuses au pied du mur.
    for (k = 1; k < 12; k++) { var a = Math.PI * k / 12, x = b[0] + Math.cos(a) * rx, y = b[1] + H + Math.sin(a) * ry; ctx.fillStyle = alpha(C.chaud, 0.85); ctx.fillRect(x - 1.4, y - H * 0.5, 2.8, H * 0.3); }
    ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(b[0], b[1] + H * 0.16, rx, ry, 0, 0.04, Math.PI - 0.04); ctx.stroke();
    ellipse(ctx, b[0], b[1], rx, ry, '#f4f6fa');
    // Cuvette des gradins.
    ctx.save(); ctx.beginPath(); ctx.ellipse(b[0], b[1], rx * 0.94, ry * 0.94, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = degV(ctx, b[1] - ry, b[1] + ry, nuance(c, 0.55), nuance(c, 1.05)); ctx.fillRect(b[0] - rx, b[1] - ry, rx * 2, ry * 2 + prof);
    for (k = 1; k <= (o.gradins || 3); k++) { var f = ri + (0.94 - ri) * k / ((o.gradins || 3) + 1); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(b[0], b[1] + prof * (1 - f), rx * f, ry * f, 0, 0, Math.PI * 2); ctx.stroke(); }
    // Spectateurs : points de couleur.
    var teintes = ['#ffd35a', '#7df3ff', '#ff8fd0', '#ffffff', '#8dffb0'];
    for (k = 0; k < Math.round(r * 46); k++) { var an = A.hachage(k, 7) * Math.PI * 2, d = ri + 0.06 + A.hachage(k, 13) * (0.86 - ri - 0.06); cercle(ctx, b[0] + Math.cos(an) * rx * d, b[1] + prof * (1 - d) + Math.sin(an) * ry * d, 0.75, teintes[k % 5]); }
    ellipse(ctx, b[0], b[1] + prof * (1 - ri), rx * ri, ry * ri, o.sol || '#2a3446');
    ctx.restore();
    A.eclat(ctx, c, 4, function () { ctx.strokeStyle = nuance(c, 1.3); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(b[0], b[1], rx * 0.95, ry * 0.95, 0, 0, Math.PI * 2); ctx.stroke(); });
    return [b[0], b[1] + prof * (1 - ri)];
  }
  // Petit robot d'arène (aussi dessiné en marcheur, en plus grand).
  function robot(ctx, x, y, s, c) {
    ombre(ctx, x, y, 3.4 * s, 1.3 * s, 0.35);
    ctx.fillStyle = '#394356'; ctx.fillRect(x - 2 * s, y - 3 * s, 1.4 * s, 3 * s); ctx.fillRect(x + 0.6 * s, y - 3 * s, 1.4 * s, 3 * s);
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x - 2.8 * s, y - 8 * s, 5.6 * s, 5.4 * s, 1 * s); ctx.fill();
    ctx.fillStyle = teinte(c, 1.25); ctx.beginPath(); ctx.roundRect(x - 2 * s, y - 11.4 * s, 4 * s, 3.2 * s, 0.8 * s); ctx.fill();
    ctx.fillStyle = '#7df3ff'; ctx.fillRect(x - 1.2 * s, y - 10.4 * s, 2.8 * s, 1 * s);
    ligne(ctx, [x - 2.8 * s, y - 7 * s], [x - 4.6 * s, y - 4.6 * s], '#8a96a8', 1.2 * s); ligne(ctx, [x + 2.8 * s, y - 7 * s], [x + 4.8 * s, y - 8.4 * s], '#8a96a8', 1.2 * s);
  }
  // Patte-douce : créature ronde et duveteuse de la planète, à six pattes et longues antennes.
  function patteDouce(ctx, x, y, s, pose, c) {
    c = c || '#5fd8c8';
    var e = pose ? 0.8 * s : -0.8 * s, k;
    ombre(ctx, x, y, 7 * s, 2.2 * s, 0.3);
    ctx.strokeStyle = nuance(c, 0.6); ctx.lineWidth = 1.3 * s; ctx.lineCap = 'round';
    for (k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 4 * s + k * 3.6 * s, y - 3 * s); ctx.lineTo(x - 4 * s + k * 3.6 * s + (k % 2 ? e : -e), y); ctx.stroke(); }
    ctx.fillStyle = degR(ctx, x, y - 5 * s, 7 * s, [[0, nuance(c, 1.3)], [1, nuance(c, 0.7)]], x - 2 * s, y - 7 * s);
    ctx.beginPath(); ctx.ellipse(x, y - 5 * s, 6.4 * s, 4.2 * s, 0, 0, Math.PI * 2); ctx.fill();
    cercle(ctx, x + 5.4 * s, y - 7.4 * s, 3 * s, nuance(c, 1.15));
    cercle(ctx, x + 6.4 * s, y - 8 * s, 0.9 * s, '#1c2330'); cercle(ctx, x + 6.7 * s, y - 8.3 * s, 0.3 * s, '#fff');
    ligne(ctx, [x + 5 * s, y - 10 * s], [x + 3.4 * s, y - 13.6 * s], nuance(c, 0.7), 0.8 * s); ligne(ctx, [x + 6.4 * s, y - 10 * s], [x + 7.4 * s, y - 13.6 * s], nuance(c, 0.7), 0.8 * s);
    cercle(ctx, x + 3.4 * s, y - 13.8 * s, 0.9 * s, '#ffd35a'); cercle(ctx, x + 7.4 * s, y - 13.8 * s, 0.9 * s, '#ffd35a');
    ctx.fillStyle = nuance(c, 1.4); ctx.beginPath(); ctx.ellipse(x - 1.4 * s, y - 6.6 * s, 2.4 * s, 1.2 * s, -0.3, 0, Math.PI * 2); ctx.fill();
  }
  // Bolide antigrav : coque profilée, sillage lumineux.
  function bolide(ctx, x, y, s, c, sens) {
    var d = sens < 0 ? -1 : 1;
    ellipse(ctx, x, y + 1.4 * s, 8 * s, 2 * s, 'rgba(10,12,24,0.3)');
    lueur(ctx, x, y, 6 * s, '#7df3ff', 0.35);
    poly(ctx, [[x - 8 * s * d, y - 1 * s], [x - 6 * s * d, y - 4 * s], [x + 3 * s * d, y - 4.6 * s], [x + 9 * s * d, y - 2.4 * s], [x + 6 * s * d, y - 0.6 * s]], c);
    poly(ctx, [[x - 6 * s * d, y - 4 * s], [x + 3 * s * d, y - 4.6 * s], [x + 9 * s * d, y - 2.4 * s], [x, y - 2.8 * s]], teinte(c, 1.3));
    ctx.fillStyle = '#12303f'; ctx.beginPath(); ctx.ellipse(x + 1.4 * s * d, y - 4.6 * s, 2.6 * s, 1.3 * s, 0, Math.PI, 0); ctx.fill();
    ligne(ctx, [x - 8 * s * d, y - 2 * s], [x - 13 * s * d, y - 2 * s], 'rgba(125,243,255,0.8)', 1.2 * s);
  }
  // Holothéâtre : conque blanche, scène, acteurs de lumière pendant le spectacle.
  PE.theatre = function (ctx, P, t, etat) {
    var on = etat && etat.actif, k;
    parvis(ctx, P, 2, '#dfe6ef');
    // Conque (quart de sphère) au fond.
    var b = P(0.8, 0.8, 2.4), rx = 0.72 * RX;
    ctx.fillStyle = degR(ctx, b[0], b[1] - 10, rx * 1.3, [[0, '#ffffff'], [0.5, '#dfe6ef'], [1, '#8a96a8']], b[0] - 10, b[1] - 26);
    ctx.beginPath(); ctx.ellipse(b[0], b[1], rx, 34, 0, Math.PI, 0); ctx.ellipse(b[0], b[1], rx, 0.72 * RY, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
    ctx.fillStyle = degV(ctx, b[1] - 26, b[1] + 8, '#2a1c4a', '#4a2f7a'); ctx.beginPath(); ctx.ellipse(b[0] + 3, b[1] + 3, rx * 0.84, 27, 0, Math.PI, 0); ctx.ellipse(b[0] + 3, b[1] + 3, rx * 0.84, 0.6 * RY, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
    A.eclat(ctx, C.divert, 4, function () { ctx.strokeStyle = C.divert; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(b[0], b[1], rx, 34, 0, Math.PI, 0); ctx.stroke(); });
    // Scène et acteurs en hologramme.
    cylindre(ctx, P, 0.92, 0.92, 0.46, 2.4, 5, '#eef2f7', { dessus: on ? '#d9c8ff' : '#aeb9c9' });
    var s = P(0.92, 0.92, 5);
    if (on) { lueur(ctx, s[0], s[1] - 8, 16, C.violet, 0.5); figurant(ctx, s[0] - 5, s[1], 1.15, '#d9c8ff'); figurant(ctx, s[0] + 5, s[1] + 1, 1.15, '#7df3ff'); hologramme(ctx, s[0], s[1] - 14, 6, C.rose, 'etoile', 3); }
    // Rangées de sièges.
    for (k = 0; k < 3; k++) { boite(ctx, P, 0.3 + k * 0.16, 1.46 + k * 0.14, 1.3 + k * 0.16, 1.54 + k * 0.14, 2.4, 4.4 + k, C.divert, { sansPied: true }); boite(ctx, P, 1.46 + k * 0.14, 0.3 + k * 0.16, 1.54 + k * 0.14, 1.3 + k * 0.16, 2.4, 4.4 + k, nuance(C.divert, 0.9), { sansPied: true }); }
    var e = P(1.74, 1.74, 2.4); enseigne(ctx, e[0], e[1], 'divert', 8);
  };
  HAUT.theatre = 46;
  // Arène : robots téléguidés au centre pendant les combats.
  PE.amphitheatre = function (ctx, P, t, etat) {
    var on = etat && etat.actif;
    parvis(ctx, P, 3, '#dfe6ef');
    var c = stade(ctx, P, 1.5, 1.5, 1.36, 16, C.divert, { h0: 2.4, sol: '#34405a' });
    ctx.strokeStyle = alpha(C.cyan, 0.8); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse(c[0], c[1], 20, 9, 0, 0, Math.PI * 2); ctx.stroke();
    if (on) { robot(ctx, c[0] - 8, c[1] + 2, 1, '#ff6a5a'); robot(ctx, c[0] + 8, c[1] + 1, 1, '#4aa8ff'); lampe(ctx, c[0], c[1] - 5, '#fff4c0', 1.2); }
    var e = P(2.76, 2.76, 2.4); enseigne(ctx, e[0], e[1], 'divert', 9);
    var m = P(0.24, 0.24, 2.4); mat(ctx, m[0], m[1], 26, on ? C.chaud : '#5d6878', on);
  };
  HAUT.amphitheatre = 40;
  // Xénodrome : grand stade à deux étages, mâts d'éclairage, créatures en piste.
  PE.colisee = function (ctx, P, t, etat) {
    var on = etat && etat.actif, k;
    parvis(ctx, P, 5, '#dfe6ef', 3);
    A.quadrillage(ctx, P, 0.05, 0.05, 4.95, 4.95, 3, 0.62, 'rgba(120,140,170,0.25)');
    var coins = [[0.4, 0.4], [4.6, 0.4], [0.4, 4.6], [4.6, 4.6]];
    coins.slice(0, 2).forEach(function (q) { var p = P(q[0], q[1], 3); mat(ctx, p[0], p[1], 46, on ? C.chaud : '#5d6878', on); if (on) lueur(ctx, p[0], p[1] - 46, 12, C.chaud, 0.5); });
    cylindre(ctx, P, 2.5, 2.5, 2.36, 3, 12, '#dfe6ef', { anneaux: 1 });
    var c = stade(ctx, P, 2.5, 2.5, 2.2, 22, C.divert, { h0: 12, sol: '#3f8f6a', gradins: 5, piste: 0.5 });
    // Piste : enclos de verdure, anneau lumineux.
    verdure(ctx, c[0] - 24, c[1] - 3, 6, '#58d08a', 2); verdure(ctx, c[0] + 26, c[1] + 4, 5, '#58d08a', 5);
    ctx.strokeStyle = alpha(C.or, 0.85); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(c[0], c[1], 34, 15, 0, 0, Math.PI * 2); ctx.stroke();
    if (on) { patteDouce(ctx, c[0] - 10, c[1] + 4, 1.1, 0); patteDouce(ctx, c[0] + 14, c[1] - 2, 0.9, 1, '#ff9bd6'); figurant(ctx, c[0] + 2, c[1] + 9, 1.1, '#ffd35a'); }
    // Auvent : arcs de voile au-dessus des gradins du fond.
    var b = P(2.5, 2.5, 34);
    for (k = 0; k < 7; k++) { var a0 = Math.PI * (1.08 + k * 0.12), a1 = a0 + 0.1; poly(ctx, [[b[0] + Math.cos(a0) * 2.2 * RX, b[1] + Math.sin(a0) * 2.2 * RY], [b[0] + Math.cos(a1) * 2.2 * RX, b[1] + Math.sin(a1) * 2.2 * RY], [b[0] + Math.cos(a1) * 1.5 * RX, b[1] + Math.sin(a1) * 1.5 * RY - 10], [b[0] + Math.cos(a0) * 1.5 * RX, b[1] + Math.sin(a0) * 1.5 * RY - 10]], k % 2 ? alpha('#ffffff', 0.75) : alpha(C.divert, 0.75)); }
    coins.slice(2).forEach(function (q) { var p = P(q[0], q[1], 3); mat(ctx, p[0], p[1], 46, on ? C.chaud : '#5d6878', on); if (on) lueur(ctx, p[0], p[1] - 46, 12, C.chaud, 0.5); });
    var e = P(2.5, 4.74, 3); enseigne(ctx, e[0], e[1], 'divert', 10);
    var f = P(1.5, 4.7, 3); figurant(ctx, f[0], f[1], 1, '#ffd0e6'); f = P(3.4, 4.6, 3); figurant(ctx, f[0], f[1], 1, '#c8f4ff');
  };
  HAUT.colisee = 66;
  // Studio des artistes : modules de couleur, petite scène de répétition sous un projecteur.
  PE.colonie_acteurs = function (ctx, P) {
    parvis(ctx, P, 3, '#dfe6ef');
    var t1 = local(ctx, P, 0.16, 0.16, 1.5, 1.0, 15, C.divert, { h0: 2.4, toit: '#ffd0e6' });
    local(ctx, P, 1.7, 0.2, 2.8, 0.9, 11, C.violet, { h0: 2.4, toit: '#e0d0ff' });
    local(ctx, P, 0.2, 1.2, 0.9, 2.2, 11, C.or, { h0: 2.4, toit: '#fff0b8' });
    var e = P(0.8, 0.56, t1); enseigne(ctx, e[0], e[1], 'divert', 8);
    cylindre(ctx, P, 1.9, 1.9, 0.6, 2.4, 5, '#eef2f7', { dessus: '#d9c8ff' });
    var s = P(1.9, 1.9, 5);
    ctx.fillStyle = degV(ctx, s[1] - 30, s[1], alpha(C.chaud, 0.02), alpha(C.chaud, 0.3)); ctx.beginPath(); ctx.moveTo(s[0] - 14, s[1]); ctx.lineTo(s[0] + 14, s[1]); ctx.lineTo(s[0] + 22, s[1] - 30); ctx.lineTo(s[0] + 18, s[1] - 30); ctx.closePath(); ctx.fill();
    figurant(ctx, s[0] - 4, s[1], 1.2, '#ffd35a'); figurant(ctx, s[0] + 6, s[1] + 2, 1.2, '#ff8fd0');
    var m = P(2.74, 1.5, 2.4); ligne(ctx, m, [m[0], m[1] - 30], C.acier, 1.4); lampe(ctx, m[0], m[1] - 30, C.chaud, 1.6);
    var f = P(1.1, 2.6, 2.4); figurant(ctx, f[0], f[1], 1, '#7df3ff');
  };
  HAUT.colonie_acteurs = 44;
  // Atelier des robots d'arène : hall, robot sur son banc de montage, étincelles.
  PE.ecole_gladiateurs = function (ctx, P) {
    parvis(ctx, P, 3, '#c9d2de');
    var t1 = local(ctx, P, 0.16, 0.16, 2.84, 1.2, 18, C.divert, { h0: 2.4, corps: '#c3ccd8' });
    var e = P(0.6, 0.6, t1); enseigne(ctx, e[0], e[1], 'divert', 8);
    B.cheminee(ctx, P, 2.4, 0.6, t1, 10, 1, 0, C.divert);
    // Banc de montage : portique et grand robot.
    ligne(ctx, P(1.0, 1.7, 2.4), P(1.0, 1.7, 30), C.acierF, 2); ligne(ctx, P(2.2, 1.7, 2.4), P(2.2, 1.7, 30), C.acierF, 2); ligne(ctx, P(1.0, 1.7, 30), P(2.2, 1.7, 30), C.divert, 2.4);
    var r = P(1.6, 1.9, 2.4); robot(ctx, r[0], r[1], 2, '#ff6a5a'); ligne(ctx, [r[0], r[1] - 23], P(1.6, 1.7, 30), '#dfe6ef', 0.8);
    lampe(ctx, r[0] + 10, r[1] - 14, '#fff4c0', 1); ligne(ctx, [r[0] + 10, r[1] - 14], [r[0] + 14, r[1] - 11], '#ffd35a', 0.8); ligne(ctx, [r[0] + 10, r[1] - 14], [r[0] + 13, r[1] - 18], '#ffd35a', 0.8);
    var q = P(0.6, 2.3, 2.4); robot(ctx, q[0], q[1], 1.1, '#4aa8ff'); q = P(2.6, 2.5, 2.4); figurant(ctx, q[0], q[1], 1, '#ffd0e6');
    conteneur(ctx, P, 0.2, 1.5, 0.7, 1.9, 2.4, 8, C.divert);
  };
  HAUT.ecole_gladiateurs = 46;
  // Ménagerie : serre-enclos où vivent les pattes-douces.
  PE.maison_lions = function (ctx, P) {
    parvis(ctx, P, 3, '#dfe6ef');
    var t1 = local(ctx, P, 0.16, 0.16, 1.2, 0.86, 13, C.divert, { h0: 2.4 });
    var e = P(0.68, 0.5, t1); enseigne(ctx, e[0], e[1], 'divert', 8);
    MA.couronne(ctx, P, 1.66, 1.68, 1.18, 2.4, 5);
    MA.pelouse(ctx, P, 1.66, 1.68, 1.1, 5, '#3fa87a');
    var M = A.monde('rubra'), a = P(1.2, 1.1, 5); A.terrain.bulbe(ctx, a[0], a[1] - 15, 6, M.feuillage, M.feuillageC); ligne(ctx, a, [a[0], a[1] - 10], M.tronc, 2);
    a = P(2.3, 1.3, 5); verdure(ctx, a[0], a[1] - 3, 7, '#58d08a', 4);
    var c = P(1.4, 1.9, 5); patteDouce(ctx, c[0], c[1], 1.2, 0); c = P(2.1, 2.0, 5); patteDouce(ctx, c[0], c[1], 0.9, 1, '#ff9bd6'); c = P(1.8, 1.4, 5); patteDouce(ctx, c[0], c[1], 0.8, 0, '#ffd35a');
    dome(ctx, P, 1.66, 1.68, 1.14, 5, 46, C.verre, { verre: true, nervures: 7 });
    var f = P(0.5, 2.4, 2.4); figurant(ctx, f[0], f[1], 1, '#ffd0e6');
  };
  HAUT.maison_lions = 56;
  // Circuit antigrav : anneau de piste lumineux, tribunes, portique de départ, bolides en course.
  PE.hippodrome = function (ctx, P, t, etat) {
    var on = etat && etat.actif, c = t / 2, k;
    parvis(ctx, P, t, '#c9d2de', 3);
    var b = P(c, c, 3), rx = t * 0.46 * RX, ry = t * 0.46 * RY;
    ellipse(ctx, b[0], b[1], rx, ry, '#2a3446');
    ellipse(ctx, b[0], b[1], rx * 0.62, ry * 0.62, '#3f8f6a');
    ellipse(ctx, b[0], b[1], rx * 0.56, ry * 0.56, degR(ctx, b[0], b[1], rx * 0.56, [[0, '#58d08a'], [1, '#2f7f5a']]));
    A.eclat(ctx, C.cyan, 5, function () { ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(b[0], b[1], rx * 0.98, ry * 0.98, 0, 0, Math.PI * 2); ctx.stroke(); });
    A.eclat(ctx, C.divert, 5, function () { ctx.strokeStyle = C.divert; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(b[0], b[1], rx * 0.64, ry * 0.64, 0, 0, Math.PI * 2); ctx.stroke(); });
    ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(b[0], b[1], rx * 0.81, ry * 0.81, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // Tribunes du fond : deux longs bâtiments à gradins.
    var tribune = function (u0, v0, u1, v1) {
      var top = module(ctx, P, u0, v0, u1, v1, 3, 22, C.coque, { e: 3, toit: '#ffd0e6' });
      ceinture(ctx, P, u0, v0, u1, v1, 17, 19.4, C.divert);
      fenetres(ctx, P, 'v', u0 + 0.06, u1 - 0.06, v1, 7, 13, Math.round((u1 - u0) * 4), C.chaud); fenetres(ctx, P, 'u', v0 + 0.06, v1 - 0.06, u1, 7, 13, Math.round((v1 - v0) * 4), C.chaud);
      return top;
    };
    tribune(c - 2.6, 0.3, c + 2.6, 0.9); tribune(0.3, c - 2.2, 0.9, c + 2.2);
    // Tour centrale et hologramme.
    cylindre(ctx, P, c, c, 0.5, 3, 34, C.coque, { anneaux: 3 }); cylindre(ctx, P, c, c, 0.74, 34, 39, '#2f86b0', { dessus: '#dfe6ef' });
    var s = P(c, c, 39); hologramme(ctx, s[0], s[1], 16, C.divert, 'etoile', 7);
    for (k = 0; k < 8; k++) { var a = k * Math.PI / 4 + 0.2; lampadaire(ctx, P, c + Math.cos(a) * t * 0.31, c + Math.sin(a) * t * 0.31, 3, C.cyan, 6); }
    // Portique de départ, côté avant.
    var g0 = P(c + t * 0.3, c + 0.2, 3), g1 = P(c + t * 0.45, c + 0.2, 3);
    ligne(ctx, g0, [g0[0], g0[1] - 22], C.coque, 2.2); ligne(ctx, g1, [g1[0], g1[1] - 22], C.coque, 2.2);
    A.eclat(ctx, C.or, 4, function () { ligne(ctx, [g0[0], g0[1] - 22], [g1[0], g1[1] - 22], C.or, 2.6); });
    if (on) {
      [[0.2, '#ff5d5d'], [1.5, '#4aa8ff'], [2.9, '#ffd35a'], [4.3, '#8dffb0']].forEach(function (q, i) {
        var a = q[0], f = 0.76 + (i % 2) * 0.1; bolide(ctx, b[0] + Math.cos(a) * rx * f, b[1] + Math.sin(a) * ry * f, 1.5, q[1], Math.sin(a) > 0 ? -1 : 1);
      });
    }
    var e = P(t - 0.5, t - 0.5, 3); enseigne(ctx, e[0], e[1], 'divert', 12);
    for (k = 0; k < 5; k++) { var f2 = P(c + 2.4 + (k % 2) * 0.5, t - 0.6 - (k % 3) * 0.2, 3); figurant(ctx, f2[0], f2[1], 1, ['#ffd0e6', '#c8f4ff', '#ffd35a'][k % 3]); }
  };
  HAUT.hippodrome = 70;
  // Atelier des bolides : garage ouvert, bolide sur son plot.
  PE.fabrique_chars = function (ctx, P) {
    parvis(ctx, P, 3, '#c9d2de');
    var t1 = module(ctx, P, 0.16, 0.16, 2.84, 1.4, 2.4, 20, C.coque, { e: 3, toit: '#ffd0e6' });
    ceinture(ctx, P, 0.16, 0.16, 2.84, 1.4, 16.4, 18.6, C.divert);
    // Grande porte de garage ouverte, intérieur éclairé.
    poly(ctx, [P(0.5, 1.4, 2.4), P(1.9, 1.4, 2.4), P(1.9, 1.4, 14), P(0.5, 1.4, 14)], degV(ctx, P(0.5, 1.4, 14)[1], P(1.9, 1.4, 2.4)[1], '#1c2330', '#4a3a5a'), C.acier, 1);
    var i = P(1.2, 1.36, 2.4); lueur(ctx, i[0], i[1] - 4, 14, C.chaud, 0.35); bolide(ctx, i[0], i[1], 1.2, '#4aa8ff', 1);
    fenetres(ctx, P, 'v', 2.1, 2.8, 1.4, 6, 11, 3, C.chaud); fenetres(ctx, P, 'u', 0.2, 1.36, 2.84, 6, 11, 5, C.chaud);
    var e = P(2.4, 0.6, t1); enseigne(ctx, e[0], e[1], 'divert', 8);
    A.aire(ctx, P, 2.0, 2.2, 0.56, 2.4, alpha(C.or, 0.9));
    var p = P(2.0, 2.2, 2.4); bolide(ctx, p[0], p[1] - 4, 1.7, '#ff5d5d', -1);
    conteneur(ctx, P, 0.2, 1.9, 0.8, 2.3, 2.4, 9, C.divert); var f = P(1.1, 2.6, 2.4); figurant(ctx, f[0], f[1], 1, '#ffd0e6');
  };
  HAUT.fabrique_chars = 44;

  // ==========================================================================
  // Administration
  // ==========================================================================
  // Bureau de la colonie : deux niveaux, globe du secteur en hologramme.
  PE.forum = function (ctx, P) {
    parvis(ctx, P, 2, '#dfe6ef');
    var t1 = local(ctx, P, 0.14, 0.14, 1.86, 1.2, 14, C.admin, { h0: 2.4 });
    var t2 = module(ctx, P, 0.3, 0.24, 1.4, 1.0, t1, t1 + 11, C.coque, { e: 3 });
    baie(ctx, P, 'v', 0.36, 1.34, 1.0, t1 + 2.4, t1 + 8.4, '#2f86b0'); baie(ctx, P, 'u', 0.3, 0.94, 1.4, t1 + 2.4, t1 + 8.4, '#2f86b0');
    ceinture(ctx, P, 0.3, 0.24, 1.4, 1.0, t1 + 9.2, t1 + 10.6, C.admin);
    var e = P(0.84, 0.6, t2); enseigne(ctx, e[0], e[1], 'admin', 8);
    var h = P(1.5, 1.6, 2.4); hologramme(ctx, h[0], h[1], 11, C.admin, 'globe', 4.4);
    lampadaire(ctx, P, 0.3, 1.7, 2.4, C.admin); var f = P(0.8, 1.66, 2.4); figurant(ctx, f[0], f[1], 1, '#d0d8ff');
  };
  HAUT.forum = 54;
  // Palais du Conseil : rotonde à grand dôme, deux ailes, allée de lumières, globe du secteur.
  function peindreSenat(ctx, P) {
    parvis(ctx, P, 5, '#dfe6ef', 3.4);
    A.quadrillage(ctx, P, 0.05, 0.05, 4.95, 4.95, 3.4, 0.62, 'rgba(120,140,170,0.25)');
    var p = P(0.5, 0.5, 3.4); arbuste(ctx, p[0], p[1], 15, C.feuille, 1); p = P(4.5, 0.5, 3.4); arbuste(ctx, p[0], p[1], 15, '#58d08a', 2);
    // Aile gauche (fond), corps central, aile droite.
    var aile = function (u0, v0, u1, v1) {
      var top = module(ctx, P, u0, v0, u1, v1, 3.4, 26, '#f4f6fa', { e: 3, toit: '#d0d8ff' });
      ceinture(ctx, P, u0, v0, u1, v1, 21.6, 24, C.admin);
      fenetres(ctx, P, 'v', u0 + 0.06, u1 - 0.06, v1, 7, 12, Math.round((u1 - u0) * 3.4), '#bfeaff'); fenetres(ctx, P, 'v', u0 + 0.06, u1 - 0.06, v1, 14.4, 19.4, Math.round((u1 - u0) * 3.4), C.chaud);
      fenetres(ctx, P, 'u', v0 + 0.06, v1 - 0.06, u1, 7, 12, Math.round((v1 - v0) * 3.4), '#bfeaff'); fenetres(ctx, P, 'u', v0 + 0.06, v1 - 0.06, u1, 14.4, 19.4, Math.round((v1 - v0) * 3.4), C.chaud);
      return top;
    };
    aile(0.5, 0.8, 1.7, 2.9);
    var tc = module(ctx, P, 1.5, 0.6, 3.5, 2.7, 3.4, 36, '#f8fafc', { e: 4, toit: '#eef2f7' });
    ceinture(ctx, P, 1.5, 0.6, 3.5, 2.7, 30.6, 33.6, C.admin);
    // Portique : hautes colonnes de lumière.
    for (var k = 0; k < 6; k++) { var u = 1.62 + k * 0.352, a = P(u, 2.7, 4), b = P(u, 2.7, 29); A.eclat(ctx, '#bfd0ff', 3, function () { ligne(ctx, a, b, '#e8eeff', 2); }); }
    sas(ctx, P, 'v', 2.26, 2.74, 2.7, 15, C.admin);
    fenetres(ctx, P, 'u', 0.7, 2.6, 3.5, 8, 14, 5, '#bfeaff'); fenetres(ctx, P, 'u', 0.7, 2.6, 3.5, 18, 26, 5, C.chaud);
    aile(3.3, 0.8, 4.5, 2.9);
    // Rotonde et dôme.
    cylindre(ctx, P, 2.5, 1.6, 0.86, tc, tc + 12, '#f4f6fa', { anneaux: 1 });
    var r = P(2.5, 1.6, tc + 6); ctx.strokeStyle = '#2f86b0'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(r[0], r[1], 0.86 * RX - 0.5, 0.86 * RY, 0, 0.1, Math.PI - 0.1); ctx.stroke();
    dome(ctx, P, 2.5, 1.6, 0.86, tc + 12, 34, '#f4f6fa', { nervures: 5 });
    var s = P(2.5, 1.6, tc + 46); A.eclat(ctx, C.or, 5, function () { ctx.strokeStyle = C.or; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(s[0], s[1] + 34, 0.88 * RX, 0.88 * RY, 0, 0.05, Math.PI - 0.05); ctx.stroke(); });
    mat(ctx, s[0], s[1], 16, C.or); lueur(ctx, s[0], s[1] - 16, 9, C.or, 0.6);
    // Parvis : allée de lampes, bassins, globe du secteur.
    MA.bassin(ctx, P, 0.6, 3.5, 1.9, 4.3, 3.6); MA.bassin(ctx, P, 3.1, 3.5, 4.4, 4.3, 3.6);
    var h = P(2.5, 3.9, 3.4); hologramme(ctx, h[0], h[1], 20, C.admin, 'globe', 8);
    [[2.0, 3.1], [3.0, 3.1], [2.0, 4.6], [3.0, 4.6]].forEach(function (q) { lampadaire(ctx, P, q[0], q[1], 3.4, C.or, 9); });
    p = P(0.5, 4.6, 3.4); arbuste(ctx, p[0], p[1], 15, C.feuille, 3); p = P(4.6, 4.6, 3.4); arbuste(ctx, p[0], p[1], 15, '#58d08a', 4);
    var f = P(1.6, 4.7, 3.4); figurant(ctx, f[0], f[1], 1.1, '#d0d8ff'); f = P(3.5, 4.7, 3.4); figurant(ctx, f[0], f[1], 1.1, '#f4f6fa'); f = P(2.5, 3.2, 3.4); figurant(ctx, f[0], f[1], 1.1, '#ffd35a');
  }
  PE.senat = function (ctx, P) { peindreSenat(ctx, P); };
  HAUT.senat = 124;
  // Quartiers du commandant : module (3 × 3), résidence (4 × 4), tour (5 × 5).
  function peindreQuartiers(ctx, P, t, rang) {
    parvis(ctx, P, t, '#dfe6ef', 3);
    A.quadrillage(ctx, P, 0.05, 0.05, t - 0.05, t - 0.05, 3, 0.5, 'rgba(120,140,170,0.22)');
    var p = P(0.5, 0.5, 3); arbuste(ctx, p[0], p[1], 14, C.feuille, 1);
    var c = t / 2, top;
    if (rang === 1) {
      top = MA.pavillon(ctx, P, 0.7, 0.5, 2.5, 1.5, 3, 15, { toit: '#d0d8ff' });
      p = P(1.6, 1.0, top); mat(ctx, p[0], p[1], 12, C.admin);
    } else if (rang === 2) {
      MA.pavillon(ctx, P, 0.6, 0.9, 1.5, 2.6, 3, 13, { toit: '#d0d8ff' });
      top = MA.pavillon(ctx, P, 1.3, 0.5, 3.4, 1.7, 3, 19, { toit: '#d0d8ff' });
      cylindre(ctx, P, 2.35, 1.1, 0.44, top, top + 5, '#f4f6fa'); dome(ctx, P, 2.35, 1.1, 0.44, top + 5, 20, '#9df0ff', { verre: true, nervures: 3 });
      p = P(2.35, 1.1, top + 25); mat(ctx, p[0], p[1], 10, C.admin);
      MA.pavillon(ctx, P, 2.7, 1.8, 3.5, 3.0, 3, 12, { toit: '#d0d8ff' });
    } else {
      MA.pavillon(ctx, P, 0.6, 1.0, 1.7, 3.2, 3, 15, { toit: '#d0d8ff' });
      MA.pavillon(ctx, P, 3.3, 1.0, 4.4, 3.2, 3, 15, { toit: '#d0d8ff' });
      top = MA.gradins(ctx, P, 2.5, 1.9, 1.1, 3, 5, 20, C.or, { pente: 0.12 });
      dome(ctx, P, 2.5, 1.9, 0.4, top, 20, '#ffe9a8', { verre: true, nervures: 3 });
      p = P(2.5, 1.9, top + 20); ligne(ctx, p, [p[0], p[1] - 20], C.coque, 1.8);
      A.eclat(ctx, C.or, 5, function () { ctx.strokeStyle = C.or; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 11, 9, 3.6, 0, 0, Math.PI * 2); ctx.stroke(); });
      lampe(ctx, p[0], p[1] - 21, C.or, 1.8);
    }
    // Jardin d'apparat, bassin, aire de la navette du commandant, drapeau de lumière.
    MA.bassin(ctx, P, c - 0.7, t - 1.2, c + 0.5, t - 0.5, 3.2);
    A.aire(ctx, P, t - 0.8, t - 0.8, 0.44, 3, alpha(C.admin, 0.9));
    var n = P(t - 0.8, t - 0.8, 3); ombre(ctx, n[0], n[1] + 1, 12, 4, 0.3); ctx.fillStyle = '#f4f6fa'; ctx.beginPath(); ctx.ellipse(n[0], n[1] - 4, 11, 4.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = C.admin; ctx.fillRect(n[0] - 8, n[1] - 4.6, 16, 1.4); ctx.fillStyle = '#2f86b0'; ctx.beginPath(); ctx.ellipse(n[0] + 4, n[1] - 5.8, 4, 2, 0, Math.PI, 0); ctx.fill();
    p = P(0.5, t - 0.6, 3); arbuste(ctx, p[0], p[1], 13, '#58d08a', 5);
    var h = P(0.6, t - 1.5, 3); hologramme(ctx, h[0], h[1], 12, C.admin, 'etoile', 4.4);
    lampadaire(ctx, P, c + 1.0, t - 0.4, 3, C.or); var f = P(c - 1.0, t - 0.5, 3); figurant(ctx, f[0], f[1], 1.1, '#d0d8ff');
  }
  PE.residence_maison = function (ctx, P, t) { peindreQuartiers(ctx, P, t, 1); }; HAUT.residence_maison = 60;
  PE.residence_villa = function (ctx, P, t) { peindreQuartiers(ctx, P, t, 2); }; HAUT.residence_villa = 84;
  PE.residence_palais = function (ctx, P, t) { peindreQuartiers(ctx, P, t, 3); }; HAUT.residence_palais = 160;

  // ==========================================================================
  // Embellissement
  // ==========================================================================
  // Jardin sous cloche : massif fleuri et petit arbre sous une bulle de verre.
  PE.jardin = function (ctx, P) {
    MA.couronne(ctx, P, 0.5, 0.5, 0.46, 0, 2.4, '#dfe6ef');
    MA.pelouse(ctx, P, 0.5, 0.5, 0.42, 2.4, '#4fd08a');
    var p = P(0.42, 0.42, 2.4); arbuste(ctx, p[0], p[1], 12, C.feuille, 2);
    p = P(0.66, 0.6, 2.4); verdure(ctx, p[0], p[1] - 2, 4, '#ff8fd0', 3); p = P(0.36, 0.7, 2.4); verdure(ctx, p[0], p[1] - 2, 3.4, '#ffd35a', 6);
    dome(ctx, P, 0.5, 0.5, 0.44, 2.4, 17, C.verre, { verre: true, nervures: 3 });
  };
  HAUT.jardin = 28;
  // Petit monument : planète en hologramme sur son socle.
  PE.statue_petite = function (ctx, P) {
    cylindre(ctx, P, 0.5, 0.5, 0.34, 0, 2.4, '#dfe6ef'); cylindre(ctx, P, 0.5, 0.5, 0.2, 2.4, 6, '#f4f6fa', { dessus: '#bfd0ff' });
    var p = P(0.5, 0.5, 6); hologramme(ctx, p[0], p[1], 9, C.cyan, 'globe', 5);
  };
  HAUT.statue_petite = 32;
  // Monument : obélisque de cristal lumineux.
  PE.statue_moyenne = function (ctx, P) {
    parvis(ctx, P, 2, '#dfe6ef');
    boite(ctx, P, 0.6, 0.6, 1.4, 1.4, 2.4, 6, '#eef2f7'); boite(ctx, P, 0.78, 0.78, 1.22, 1.22, 6, 9, '#f8fafc', { dessus: '#ffe9a8' });
    var b = P(1, 1, 9); lueur(ctx, b[0], b[1] - 20, 22, C.or, 0.45);
    A.cristal(ctx, b[0], b[1] + 2, 5.4, 40, '#ffe08a', 0);
    A.eclat(ctx, C.or, 4, function () { ctx.strokeStyle = '#fff4c0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(b[0], b[1] - 14, 12, 4, 0, 0, Math.PI * 2); ctx.stroke(); });
    [[0.34, 0.34], [1.66, 0.34], [0.34, 1.66], [1.66, 1.66]].forEach(function (q) { lampadaire(ctx, P, q[0], q[1], 2.4, C.or, 6); });
  };
  HAUT.statue_moyenne = 56;
  // Grand monument : la fusée des pionniers, dressée sur son pas de tir.
  PE.statue_grande = function (ctx, P) {
    parvis(ctx, P, 3, '#dfe6ef');
    A.quadrillage(ctx, P, 0.05, 0.05, 2.95, 2.95, 2.4, 0.48, 'rgba(120,140,170,0.25)');
    cylindre(ctx, P, 1.5, 1.5, 1.0, 2.4, 6, '#eef2f7'); cylindre(ctx, P, 1.5, 1.5, 0.66, 6, 9.4, '#f8fafc', { dessus: '#ffe9a8' });
    var b = P(1.5, 1.5, 9.4), k;
    // Ailerons, corps, coiffe.
    poly(ctx, [[b[0] - 7, b[1] - 6], [b[0] - 17, b[1] + 3], [b[0] - 7, b[1] - 20]], '#ff7a5a'); poly(ctx, [[b[0] + 7, b[1] - 6], [b[0] + 17, b[1] + 3], [b[0] + 7, b[1] - 20]], '#c94a3a');
    tronc(ctx, P, 1.5, 1.5, 0.2, 0.24, 9.4 + 4, 9.4 + 46, '#f4f6fa', { dessus: false });
    tronc(ctx, P, 1.5, 1.5, 0.24, 0.02, 9.4 + 46, 9.4 + 66, '#ff7a5a', { dessus: false });
    tronc(ctx, P, 1.5, 1.5, 0.14, 0.2, 9.4, 9.4 + 4, '#5d6878', { dessus: false });
    ctx.fillStyle = '#ff7a5a'; ctx.fillRect(b[0] - 10.6, b[1] - 30, 21.2, 2.4);
    for (k = 0; k < 2; k++) { cercle(ctx, b[0] - 2, b[1] - 38 + k * 12, 3, '#7fe0ff', '#394356', 0.9); cercle(ctx, b[0] - 3, b[1] - 39 + k * 12, 1, 'rgba(255,255,255,0.8)'); }
    poly(ctx, [[b[0] - 3, b[1] - 6], [b[0], b[1] + 6], [b[0] + 3, b[1] - 6]], '#ff7a5a');
    lueur(ctx, b[0], b[1] - 4, 16, C.ambre, 0.45); lampe(ctx, b[0], b[1] - 66, '#ffffff', 1.4);
    [[0.4, 0.4], [2.6, 0.4], [0.4, 2.6], [2.6, 2.6]].forEach(function (q) { lampadaire(ctx, P, q[0], q[1], 2.4, C.or, 8); });
    var f = P(2.2, 2.6, 2.4); figurant(ctx, f[0], f[1], 1.1, '#f4f6fa'); f = P(0.9, 2.66, 2.4); figurant(ctx, f[0], f[1], 0.8, '#ffd35a');
  };
  HAUT.statue_grande = 90;

  // ==========================================================================
  // Sécurité
  // ==========================================================================
  // Poste de sécurité : vigie, gyrophare rouge et bleu.
  PE.prefecture = function (ctx, P) {
    MA.fondation(ctx, P, 1, C.secu);
    var top = local(ctx, P, 0.14, 0.16, 0.86, 0.84, 12, C.secu, { h0: 1.6 });
    var t2 = module(ctx, P, 0.3, 0.3, 0.64, 0.64, top, top + 10, C.coque, { e: 2, toit: '#ffd0cc' });
    baie(ctx, P, 'v', 0.33, 0.61, 0.64, top + 3, top + 8, '#2f86b0'); baie(ctx, P, 'u', 0.33, 0.61, 0.64, top + 3, top + 8, '#2f86b0');
    var p = P(0.47, 0.47, t2); lampe(ctx, p[0] - 2, p[1] - 2, C.rouge, 1.3); lampe(ctx, p[0] + 2.4, p[1] - 1.4, '#5a9dff', 1.3);
    var e = P(0.76, 0.3, top); enseigne(ctx, e[0], e[1], 'secu', 8);
  };
  HAUT.prefecture = 46;
  // Atelier de maintenance : bandes jaunes et noires, bras de levage.
  PE.ingenieur = function (ctx, P) {
    MA.fondation(ctx, P, 1, C.ingen);
    var top = local(ctx, P, 0.14, 0.16, 0.86, 0.84, 12, C.ingen, { h0: 1.6 });
    for (var k = 0; k < 5; k++) poly(ctx, [P(0.18 + k * 0.14, 0.84, 1.6), P(0.24 + k * 0.14, 0.84, 1.6), P(0.2 + k * 0.14, 0.84, 3.6), P(0.14 + k * 0.14, 0.84, 3.6)], '#1c2330');
    var a = P(0.4, 0.4, top), b = [a[0] + 2, a[1] - 14], c = [a[0] + 13, a[1] - 9];
    ligne(ctx, a, b, C.ingen, 2.2); ligne(ctx, b, c, C.ingen, 1.8); ligne(ctx, c, [c[0], c[1] + 6], '#dfe6ef', 0.8); cercle(ctx, c[0], c[1] + 7, 1.4, null, C.acier, 1);
    var e = P(0.74, 0.3, top); enseigne(ctx, e[0], e[1], 'ingen', 8);
  };
  HAUT.ingenieur = 44;

  // ==========================================================================
  // Défense
  // ==========================================================================
  var H_REMPART = 20;
  // Rempart d'énergie : pylônes reliés par un champ de force. masque : voisins reliés.
  function peindreRempart(ctx, P, m) {
    var champ = function (u, v) {
      var a = P(0.5, 0.5, 2), b = P(u, v, 2), a1 = P(0.5, 0.5, H_REMPART), b1 = P(u, v, H_REMPART);
      poly(ctx, [a, b, b1, a1], degV(ctx, a1[1], a[1], alpha(C.cyan, 0.5), alpha('#4aa8ff', 0.18)));
      A.eclat(ctx, C.cyan, 3, function () { ligne(ctx, a1, b1, C.cyan, 1.2); });
      ligne(ctx, [(a[0] + a1[0]) / 2, (a[1] + a1[1]) / 2], [(b[0] + b1[0]) / 2, (b[1] + b1[1]) / 2], 'rgba(255,255,255,0.4)', 0.6);
      ligne(ctx, a, b, '#394356', 2.4);
    };
    if (m & 1) champ(0.5, 0); if (m & 8) champ(0, 0.5);
    boite(ctx, P, 0.34, 0.34, 0.66, 0.66, 0, 3, '#394356', { sansPied: true });
    tronc(ctx, P, 0.5, 0.5, 0.13, 0.08, 3, H_REMPART + 2, '#5d6878');
    var s = P(0.5, 0.5, H_REMPART + 3); lampe(ctx, s[0], s[1], C.cyan, 1.4);
    if (m & 2) champ(1, 0.5); if (m & 4) champ(0.5, 1);
  }
  PE.muraille = function (ctx, P, t, e) { peindreRempart(ctx, P, (e && e.masque) || 0); };
  HAUT.muraille = 34;
  // Tourelle : tour blindée, canon jumelé.
  PE.tour = function (ctx, P) {
    parvis(ctx, P, 2, '#5d6878');
    tronc(ctx, P, 1, 1, 0.74, 0.56, 2.4, 30, '#8a96a8');
    var b = P(1, 1, 0);
    ctx.strokeStyle = C.milit; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(b[0], b[1] - 22, 0.6 * RX, 0.6 * RY, 0, 0.1, Math.PI - 0.1); ctx.stroke();
    fenetres(ctx, P, 'v', 0.74, 1.26, 1.62, 9, 12, 3, C.rouge);
    cylindre(ctx, P, 1, 1, 0.66, 30, 34, '#394356');
    dome(ctx, P, 1, 1, 0.5, 34, 16, '#8a96a8', { nervures: 2 });
    var s = P(1, 1, 42); tuyau(ctx, [[s[0] + 4, s[1] - 2], [s[0] + 26, s[1] + 4]], '#394356', 3); tuyau(ctx, [[s[0] + 1, s[1] + 2], [s[0] + 23, s[1] + 8]], '#394356', 3);
    lampe(ctx, s[0] + 27, s[1] + 4, C.rouge, 1); lampe(ctx, s[0], s[1] - 9, C.rouge, 1.2);
    var e = P(0.3, 1.7, 2.4); enseigne(ctx, e[0], e[1], 'milit', 6);
  };
  HAUT.tour = 66;
  // Sas fortifié : deux piliers blindés, porte d'énergie ambrée.
  PE.porte = function (ctx, P) {
    parvis(ctx, P, 2, '#5d6878');
    boite(ctx, P, 0.1, 0.1, 0.62, 1.9, 2.4, 30, '#8a96a8', { joints: 3 }); ceinture(ctx, P, 0.1, 0.1, 0.62, 1.9, 24, 26.4, C.milit);
    // Porte d'énergie entre les deux piliers.
    var a = P(0.62, 1.0, 2.4), b = P(1.38, 1.0, 2.4), a1 = P(0.62, 1.0, 26), b1 = P(1.38, 1.0, 26);
    poly(ctx, [a, b, b1, a1], degV(ctx, a1[1], b[1], alpha(C.ambre, 0.55), alpha(C.ambre, 0.16)));
    A.eclat(ctx, C.ambre, 4, function () { ligne(ctx, a1, b1, C.ambre, 1.4); });
    boite(ctx, P, 1.38, 0.1, 1.9, 1.9, 2.4, 30, '#8a96a8', { joints: 3 }); ceinture(ctx, P, 1.38, 0.1, 1.9, 1.9, 24, 26.4, C.milit);
    boite(ctx, P, 0.1, 0.7, 1.9, 1.3, 30, 35, '#394356');
    var s = P(1.0, 1.0, 35); lampe(ctx, s[0] - 12, s[1] + 2, C.rouge, 1.1); lampe(ctx, s[0] + 12, s[1] + 2, C.rouge, 1.1);
    fenetres(ctx, P, 'v', 1.44, 1.86, 1.9, 9, 13, 2, C.rouge);
  };
  HAUT.porte = 50;
  // Caserne : casemate, cour d'exercice, râtelier d'armes.
  PE.caserne = function (ctx, P) {
    parvis(ctx, P, 3, '#8a96a8');
    var t1 = local(ctx, P, 0.16, 0.16, 2.84, 1.2, 15, C.milit, { h0: 2.4, corps: '#c3ccd8', lum: '#ffd0a0' });
    var e = P(0.7, 0.6, t1); enseigne(ctx, e[0], e[1], 'milit', 8);
    var p = P(2.3, 0.6, t1); parabole(ctx, p[0], p[1], 6, '#c3ccd8');
    dalle(ctx, P, 0.3, 1.5, 2.7, 2.7, 2.5, '#6c7a92'); A.quadrillage(ctx, P, 0.3, 1.5, 2.7, 2.7, 2.5, 0.6, 'rgba(255,255,255,0.3)');
    [[0.8, 1.9], [1.3, 1.9], [1.8, 1.9], [0.8, 2.3], [1.3, 2.3], [1.8, 2.3]].forEach(function (q) { var f = P(q[0], q[1], 2.5); figurant(ctx, f[0], f[1], 1, '#c7483c'); });
    var f = P(2.4, 2.1, 2.5); figurant(ctx, f[0], f[1], 1.15, '#f4f6fa');
    conteneur(ctx, P, 0.2, 2.5, 0.6, 2.8, 2.4, 8, C.milit);
  };
  HAUT.caserne = 42;
  // Académie de défense : bâtiment d'état-major, place d'armes, étendard de lumière.
  PE.academie_militaire = function (ctx, P) {
    parvis(ctx, P, 3, '#c9d2de');
    var t1 = local(ctx, P, 0.16, 0.16, 2.84, 1.3, 20, C.milit, { h0: 2.4, porte: false });
    fenetres(ctx, P, 'v', 0.3, 2.7, 1.3, 5, 9, 8, '#ffd0a0'); sas(ctx, P, 'v', 1.3, 1.7, 1.3, 9, C.milit);
    var t2 = module(ctx, P, 1.0, 0.3, 2.0, 1.0, t1, t1 + 12, C.coque, { e: 3, toit: '#ffd0cc' }); baie(ctx, P, 'v', 1.06, 1.94, 1.0, t1 + 3, t1 + 9, '#2f86b0');
    var m = P(1.5, 0.65, t2); mat(ctx, m[0], m[1], 14, C.rouge); poly(ctx, [[m[0], m[1] - 14], [m[0] + 11, m[1] - 11.4], [m[0], m[1] - 8.6]], C.milit);
    dalle(ctx, P, 0.3, 1.6, 2.7, 2.7, 2.5, '#8a96a8');
    var h = P(1.5, 2.2, 2.5); hologramme(ctx, h[0], h[1], 13, C.milit, 'etoile', 5.4);
    [[0.6, 1.9], [0.6, 2.4], [2.4, 1.9], [2.4, 2.4]].forEach(function (q) { var f = P(q[0], q[1], 2.5); figurant(ctx, f[0], f[1], 1, '#c7483c'); });
    var e = P(2.7, 2.76, 2.4); enseigne(ctx, e[0], e[1], 'milit', 7);
  };
  HAUT.academie_militaire = 64;
  // Base d'escouade (4 × 4) : enceinte, casemate de commandement, cour et signe de l'escouade.
  function peindreBase(ctx, P, unite) {
    parvis(ctx, P, 4, '#8a96a8', 2.4);
    // Enceinte basse à feux d'angle.
    boite(ctx, P, 0.1, 0.1, 3.9, 0.3, 2.4, 9, '#5d6878'); boite(ctx, P, 0.1, 0.1, 0.3, 3.9, 2.4, 9, '#5d6878');
    var t1 = local(ctx, P, 0.5, 0.5, 2.0, 1.5, 16, C.milit, { h0: 2.4, corps: '#c3ccd8', lum: '#ffd0a0' });
    var p = P(1.2, 1.0, t1); parabole(ctx, p[0], p[1], 6, '#c3ccd8');
    dalle(ctx, P, 0.5, 1.8, 3.5, 3.5, 2.5, '#6c7a92');
    A.aire(ctx, P, 2.9, 1.1, 0.5, 2.5, alpha(C.ambre, 0.9));
    var c = P(2.0, 2.7, 2.5), k;
    if (unite === 'cavalier') {
      // Motos-jets alignées.
      for (k = 0; k < 3; k++) { var q = P(1.0 + k * 0.8, 2.3 + k * 0.2, 2.5); A.personnages ? A.personnages.motoJet(ctx, q[0], q[1], 1, C.milit) : bolide(ctx, q[0], q[1], 1, C.milit, 1); }
    } else {
      for (k = 0; k < 6; k++) { var f = P(1.0 + (k % 3) * 0.7, 2.2 + (k / 3 | 0) * 0.6, 2.5); figurant(ctx, f[0], f[1], 1.05, unite === 'javelot' ? '#7fa0d0' : '#c7483c'); }
    }
    // Signe de l'escouade en hologramme : bouclier (gardes), cible (tireurs), éclair (motos-jets).
    var h = P(3.2, 3.2, 2.5), y = h[1] - 16;
    lueur(ctx, h[0], y, 12, C.milit, 0.5); cercle(ctx, h[0], h[1], 2, C.milit);
    ctx.fillStyle = degV(ctx, y, h[1], alpha(C.milit, 0.05), alpha(C.milit, 0.3)); ctx.beginPath(); ctx.moveTo(h[0] - 1.5, h[1]); ctx.lineTo(h[0] + 1.5, h[1]); ctx.lineTo(h[0] + 6, y + 6); ctx.lineTo(h[0] - 6, y + 6); ctx.closePath(); ctx.fill();
    if (unite === 'javelot') { cercle(ctx, h[0], y, 6, null, '#ffb0a8', 1.2); cercle(ctx, h[0], y, 3, null, '#ffb0a8', 1.2); cercle(ctx, h[0], y, 1, '#fff'); }
    else if (unite === 'cavalier') poly(ctx, [[h[0] + 2, y - 7], [h[0] - 4, y + 1], [h[0], y + 1], [h[0] - 2, y + 7], [h[0] + 4, y - 1], [h[0], y - 1]], '#ffb0a8');
    else poly(ctx, [[h[0] - 5, y - 6], [h[0] + 5, y - 6], [h[0] + 5, y + 1], [h[0], y + 7], [h[0] - 5, y + 1]], alpha(C.milit, 0.5), '#ffb0a8', 1.2);
    boite(ctx, P, 3.7, 0.1, 3.9, 3.9, 2.4, 9, '#5d6878'); boite(ctx, P, 0.1, 3.7, 1.5, 3.9, 2.4, 9, '#5d6878'); boite(ctx, P, 2.5, 3.7, 3.9, 3.9, 2.4, 9, '#5d6878');
    [[0.2, 0.2], [3.8, 0.2], [0.2, 3.8], [3.8, 3.8], [1.5, 3.8], [2.5, 3.8]].forEach(function (q) { var l = P(q[0], q[1], 9); lampe(ctx, l[0], l[1] - 1, C.rouge, 1.1); });
    var e = P(0.9, 0.9, t1); enseigne(ctx, e[0], e[1], 'milit', 8);
    void c;
  }
  PE.fort_legionnaires = function (ctx, P) { peindreBase(ctx, P, 'legionnaire'); }; HAUT.fort_legionnaires = 50;
  PE.fort_javelots = function (ctx, P) { peindreBase(ctx, P, 'javelot'); }; HAUT.fort_javelots = 50;
  PE.fort_cavaliers = function (ctx, P) { peindreBase(ctx, P, 'cavalier'); }; HAUT.fort_cavaliers = 50;

  // ==========================================================================
  // Épaves, débris, incendies
  // ==========================================================================
  // Épave : coque éventrée, poutrelles tordues, étincelles.
  PE.ruines = function (ctx, P, t) {
    var k, n = t * t;
    for (k = 0; k < n; k++) {
      var u = (k % t) + 0.5, v = ((k / t) | 0) + 0.5, p = P(u, v), g = k * 3 + 1;
      ellipse(ctx, p[0], p[1], 24, 10, 'rgba(20,16,24,0.4)');
      boite(ctx, P, u - 0.34, v - 0.3, u + 0.1, v + 0.2, 0, 7 + (g % 3) * 2, '#8a96a8', { sansPied: true, dessus: '#394356' });
      poly(ctx, [P(u + 0.1, v - 0.2, 0), P(u + 0.4, v + 0.1, 0), P(u + 0.3, v + 0.06, 9), P(u + 0.12, v - 0.16, 5)], '#c3ccd8');
      ligne(ctx, P(u - 0.2, v + 0.3), [p[0] - 2, p[1] - 14], '#5d6878', 1.6); ligne(ctx, [p[0] - 2, p[1] - 14], [p[0] + 7, p[1] - 10], '#5d6878', 1.4);
      cercle(ctx, p[0] + 8, p[1] - 3, 1, '#ffd35a'); lueur(ctx, p[0] + 8, p[1] - 3, 4, C.ambre, 0.5);
    }
  };
  HAUT.ruines = 22;
  // Débris : plaques et gravats épars.
  PE.gravats = function (ctx, P, t) {
    var k, n = t * t;
    for (k = 0; k < n; k++) {
      var u = (k % t) + 0.5, v = ((k / t) | 0) + 0.5, p = P(u, v);
      ellipse(ctx, p[0], p[1], 22, 9, 'rgba(20,16,24,0.3)');
      A.terrain.caillou(ctx, p[0] - 8, p[1] - 1, 4, '#8a96a8'); A.terrain.caillou(ctx, p[0] + 6, p[1] + 2, 3, '#5d6878'); A.terrain.caillou(ctx, p[0] + 1, p[1] - 4, 2.6, '#c3ccd8');
      poly(ctx, [P(u - 0.1, v + 0.1, 0), P(u + 0.3, v + 0.2, 0), P(u + 0.2, v + 0.1, 4)], '#aeb9c9');
    }
  };
  HAUT.gravats = 14;
  // Incendie : flammes sur toute l'emprise (fr : 0 à 2).
  function flamme(ctx, x, y, s) {
    lueur(ctx, x, y - 6 * s, 14 * s, '#ff8a3c', 0.45);
    ctx.fillStyle = degV(ctx, y - 20 * s, y, '#ffd35a', '#ff5a2a');
    ctx.beginPath(); ctx.moveTo(x - 6 * s, y); ctx.quadraticCurveTo(x - 8 * s, y - 9 * s, x - 2 * s, y - 13 * s); ctx.quadraticCurveTo(x - 1 * s, y - 18 * s, x + 1 * s, y - 21 * s); ctx.quadraticCurveTo(x + 3 * s, y - 14 * s, x + 5 * s, y - 11 * s); ctx.quadraticCurveTo(x + 8 * s, y - 6 * s, x + 6 * s, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff4c0'; ctx.beginPath(); ctx.moveTo(x - 2.6 * s, y); ctx.quadraticCurveTo(x - 3 * s, y - 6 * s, x, y - 11 * s); ctx.quadraticCurveTo(x + 3 * s, y - 6 * s, x + 2.6 * s, y); ctx.closePath(); ctx.fill();
  }
  function peindreFlammes(ctx, P, t, fr) {
    PE.ruines(ctx, P, t);
    var k, n = Math.max(2, t * t * 2);
    for (k = 0; k < n; k++) {
      var u = 0.2 + A.hachage(k, 3) * (t - 0.4), v = 0.2 + A.hachage(k, 9) * (t - 0.4), p = P(u, v, 4);
      flamme(ctx, p[0], p[1], 0.8 + ((k + fr) % 3) * 0.22);
    }
    var c = P(t / 2, t / 2, 22); vapeur(ctx, c[0], c[1], fr % 2, '#3a3a44');
  }

  A.batir.signe = signe; A.batir.coeur = coeur; A.batir.stade = stade; A.batir.robot = robot; A.batir.patteDouce = patteDouce; A.batir.bolide = bolide;
  A.batir.flammes = peindreFlammes; A.batir.IA = IA; A.batir.rempart = peindreRempart; A.batir.H_REMPART = H_REMPART;
  HAUT.incendie = 56;
  void poly; void trace; void teinte; void voute; void sphere; void neon; void conteneur;
})(typeof window !== 'undefined' ? window : globalThis);
