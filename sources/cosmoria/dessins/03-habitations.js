/* ==========================================================================
   Cosmoria — dessins, partie 3 : les habitations, un dessin par niveau.

   0 parcelle libre · 1-2 abris gonflables · 3-4 capsules · 5-6 modules ·
   7-8 habitats · 9 petit dôme · 10-12 dômes (2 × 2) · 13-16 résidences des
   notables (2 × 2 puis 3 × 3) · 17-20 arcologies (3 × 3 puis 4 × 4).
   Chaque niveau est dessiné pour sa taille prévue, puis mis à l'échelle de
   l'emprise réelle (une habitation peut changer de niveau avant de changer
   d'emprise). v : variante (0 à 2), qui change un détail et la couleur d'accent.
   ========================================================================== */
(function (racine) {
  'use strict';
  var A = racine.CM_ART, C = A.C;
  var poly = A.poly, ligne = A.ligne, cercle = A.cercle, ellipse = A.ellipse, teinte = A.teinte, nuance = A.nuance, alpha = A.alpha,
    boite = A.boite, module = A.module, voute = A.voute, cylindre = A.cylindre, tronc = A.tronc, dome = A.dome, fenetres = A.fenetres,
    baie = A.baie, ceinture = A.ceinture, neon = A.neon, sas = A.sas, mat = A.mat, parabole = A.parabole, panneau = A.panneau,
    lampe = A.lampe, lueur = A.lueur, verdure = A.verdure, arbuste = A.arbuste, dalle = A.dalle, ombre = A.ombre, RX = A.RX, RY = A.RY;

  var ACCENTS = ['#ffa94d', '#4fc8e8', '#ff7fa8'];
  // Taille prévue du dessin et hauteur réservée au-dessus de l'emprise, par niveau.
  var TAILLE = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4];
  var HAUTS = [16, 20, 24, 30, 32, 26, 36, 40, 48, 40, 62, 70, 74, 50, 62, 74, 92, 132, 156, 190, 216];
  var GROS = { 1: 1.4, 2: 1.22, 3: 1.3, 4: 1.25, 5: 1.2, 6: 1.14, 7: 1.1, 8: 1.06 };
  function haut(niv, t) { return Math.ceil(HAUTS[niv] * (GROS[niv] || 1) * t / TAILLE[niv]) + 8; }

  // Plaque de fondation commune : dalle claire, liseré de couleur.
  function fondation(ctx, P, t, c, m) {
    m = m === undefined ? 0.07 : m;
    boite(ctx, P, m, m, t - m, t - m, 0, 1.6, C.coqueG, { sansPied: true, dessus: '#cfd7e2' });
    ligne(ctx, P(m, t - m, 1.6), P(t - m, t - m, 1.6), alpha(c, 0.9), 0.9);
    ligne(ctx, P(t - m, t - m, 1.6), P(t - m, m, 1.6), alpha(c, 0.6), 0.9);
  }
  // Logis : module à fenêtres éclairées sur ses deux faces, ceinture de couleur. Renvoie le sommet.
  function logis(ctx, P, u0, v0, u1, v1, h0, H, c, o) {
    o = o || {};
    var corps = o.corps || C.coque, top = module(ctx, P, u0, v0, u1, v1, h0, h0 + H, corps, { toit: o.toit || corps, d: o.d, e: o.e, joints: o.joints });
    ceinture(ctx, P, u0, v0, u1, v1, h0 + H - 2.6, h0 + H - 1, c);
    var nu = Math.max(1, Math.round((u1 - u0) * (o.dens || 5))), nv = Math.max(1, Math.round((v1 - v0) * (o.dens || 5)));
    var etages = o.etages || 1, he = (H - 4) / etages, k;
    for (k = 0; k < etages; k++) {
      var b = h0 + 2 + k * he + he * 0.25, tt = b + he * 0.46;
      if (!(o.porte && k === 0)) fenetres(ctx, P, 'v', u0 + 0.03, u1 - 0.03, v1, b, tt, nu, o.lum);
      else fenetres(ctx, P, 'v', u0 + (u1 - u0) * 0.5, u1 - 0.03, v1, b, tt, Math.max(1, nu >> 1), o.lum);
      fenetres(ctx, P, 'u', v0 + 0.03, v1 - 0.03, u1, b, tt, nv, o.lum);
    }
    if (o.porte) sas(ctx, P, 'v', u0 + (u1 - u0) * 0.14, u0 + (u1 - u0) * 0.4, v1, Math.min(7, H * 0.55), c);
    return top;
  }
  // Petit intérieur de dôme : pelouse ronde.
  function pelouse(ctx, P, u, v, r, h, c) {
    var b = P(u, v, h);
    ellipse(ctx, b[0], b[1], r * RX, r * RY, A.degR(ctx, b[0], b[1], r * RX, [[0, nuance(c || C.feuille, 1.15)], [1, nuance(c || C.feuilleF, 0.9)]]));
  }
  // Anneau de base d'un dôme (couronne métallique).
  function couronne(ctx, P, u, v, r, h0, h1, c) { cylindre(ctx, P, u, v, r, h0, h1, c || C.coqueG, { dessus: nuance(c || C.coqueG, 0.82) }); }

  // --- Niveau 0 : parcelle libre -------------------------------------------------
  function parcelle(ctx, P) {
    var q = [P(0.12, 0.12), P(0.88, 0.12), P(0.88, 0.88), P(0.12, 0.88)], k;
    ctx.setLineDash([2.5, 2.5]); poly(ctx, q, 'rgba(255,184,107,0.1)', 'rgba(255,200,130,0.85)', 0.9); ctx.setLineDash([]);
    for (k = 0; k < 4; k++) { ligne(ctx, q[k], [q[k][0], q[k][1] - 5], C.acier, 1.1); lampe(ctx, q[k][0], q[k][1] - 5.5, C.ambre, 0.9); }
    var c = P(0.5, 0.5);
    A.hologramme(ctx, c[0], c[1], 9, C.ambre, 'losange', 3.2);
  }

  // --- Niveaux 1 et 2 : abris gonflables -------------------------------------------
  function abri(ctx, P, u0, v0, u1, v1, H, c) {
    var m = P((u0 + u1) / 2, (v0 + v1) / 2);
    ombre(ctx, m[0] + 3, m[1] + 2, (u1 - u0) * 30, (v1 - v0) * 13, 0.2);
    voute(ctx, P, u0, v0, u1, v1, 0, H, '#f3ead9', 'u', { nervures: 3 });
    // Boudins de couleur et sas souple au pignon.
    var k, n = 10;
    for (k = 1; k < 3; k++) {
      var L = u0 + (u1 - u0) * k / 3, arc = [];
      for (var j = 0; j <= n; j++) { var a = Math.PI * j / n; arc.push(P(L, (v0 + v1) / 2 - (v1 - v0) / 2 * Math.cos(a), H * Math.sin(a))); }
      A.trace(ctx, arc, c, 1.6);
    }
    var vm = (v0 + v1) / 2;
    poly(ctx, [P(u1, vm - 0.07, 0), P(u1, vm + 0.07, 0), P(u1, vm + 0.07, H * 0.56), P(u1, vm - 0.07, H * 0.56)], '#2b3446', nuance(c, 0.9), 0.8);
    var l = P(u1, vm, H * 0.72); lampe(ctx, l[0], l[1], C.chaud, 0.8);
  }
  function niveau1(ctx, P, v, acc) {
    abri(ctx, P, 0.24, 0.3, 0.76, 0.72, 11, acc);
    var p = P(0.2, 0.84); boite(ctx, P, 0.14, 0.78, 0.26, 0.9, 0, 4, '#c98a4a', { sansPied: true });
    p = P(0.84, 0.2 + v * 0.05); mat(ctx, p[0], p[1], 13, C.cyan);
  }
  function niveau2(ctx, P, v, acc) {
    abri(ctx, P, 0.1, 0.14, 0.62, 0.52, 10, acc);
    abri(ctx, P, 0.3, 0.52, 0.9, 0.9, 13, acc);
    var p = P(0.82, 0.24); mat(ctx, p[0], p[1], 15, C.cyan);
    panneau(ctx, P, 0.66, 0.16, 0.84, 0.34, 2, 6, 2);
    void v;
  }

  // --- Niveaux 3 et 4 : capsules -----------------------------------------------------
  function capsule(ctx, P, u, v, r, H, c) {
    var b = P(u, v, 0), k;
    ellipse(ctx, b[0] + 2, b[1] + 1.5, r * RX * 1.25, r * RY * 1.25, 'rgba(10,12,24,0.28)');
    ellipse(ctx, b[0], b[1], r * RX * 1.12, r * RY * 1.12, 'rgba(60,30,24,0.35)');
    // Pieds.
    for (k = 0; k < 3; k++) { var a = 0.5 + k * 2.1, f = [b[0] + Math.cos(a) * r * RX * 1.1, b[1] + Math.sin(a) * r * RY * 1.1 + 1]; ligne(ctx, [b[0] + Math.cos(a) * r * RX * 0.6, b[1] - 3], f, C.acierF, 1.3); ellipse(ctx, f[0], f[1], 1.8, 0.8, C.acier); }
    tronc(ctx, P, u, v, r, r * 0.9, 2, 4.5, C.acierF, { dessus: false });
    tronc(ctx, P, u, v, r, r * 0.52, 4.5, H, C.coque, { dessus: false });
    dome(ctx, P, u, v, r * 0.52, H, r * RX * 0.4, C.coqueG, { nervures: 0, anneau: false });
    // Bande de couleur et hublots éclairés.
    var y1 = P(u, v, 4.5 + (H - 4.5) * 0.3)[1], y0 = P(u, v, 4.5 + (H - 4.5) * 0.62)[1], rr = r * RX * 0.82;
    ctx.strokeStyle = c; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(b[0], y1 + 1.5, rr, rr * 0.5, 0, 0.15, Math.PI - 0.15); ctx.stroke();
    for (k = 0; k < 3; k++) { var hx = b[0] - rr * 0.55 + k * rr * 0.5, hy = y0 + 4.2 - Math.abs(k - 1) * 0.8; lueur(ctx, hx, hy, 3.4, C.chaud, 0.4); cercle(ctx, hx, hy, 1.5, k === 2 ? nuance(C.chaud, 0.8) : C.chaud, '#39465a', 0.6); }
    var top = P(u, v, H + r * RX * 0.4); mat(ctx, top[0], top[1], 5, C.rouge);
  }
  function niveau3(ctx, P, v, acc) { capsule(ctx, P, 0.5, 0.5, 0.3, 21, acc); var p = P(0.84, 0.82); boite(ctx, P, 0.78, 0.76, 0.9, 0.88, 0, 3.5, '#8a96a8', { sansPied: true }); void p; void v; }
  function niveau4(ctx, P, v, acc) {
    capsule(ctx, P, 0.33, 0.36, 0.25, 18, acc);
    // Tunnel de liaison, puis seconde capsule devant.
    A.tuyau(ctx, [P(0.4, 0.44, 6), P(0.6, 0.62, 6)], C.coqueG, 4.2);
    capsule(ctx, P, 0.66, 0.68, 0.27, 22, acc);
    void v;
  }

  // --- Niveaux 5 et 6 : modules ------------------------------------------------------
  function niveau5(ctx, P, v, acc) {
    fondation(ctx, P, 1, acc);
    var top = logis(ctx, P, 0.16, 0.2, 0.84, 0.8, 1.6, 12, acc, { porte: true, e: 3 });
    boite(ctx, P, 0.52, 0.34, 0.7, 0.52, top, top + 3, C.acier, { sansPied: true });
    var p = P(0.3, 0.36, top); mat(ctx, p[0], p[1], 8 + v * 2, C.cyan);
  }
  function niveau6(ctx, P, v, acc) {
    fondation(ctx, P, 1, acc);
    var top = logis(ctx, P, 0.12, 0.16, 0.88, 0.84, 1.6, 12, acc, { porte: true, e: 2 });
    var t2 = logis(ctx, P, 0.2, 0.22, 0.64, 0.7, top, 9, acc, { e: 3, dens: 4 });
    panneau(ctx, P, 0.68, 0.26, 0.86, 0.6, top + 1, top + 6, 2);
    var p = P(0.3, 0.36, t2); mat(ctx, p[0], p[1], 7, C.cyan);
    void v;
  }

  // --- Niveaux 7 et 8 : habitats -----------------------------------------------------
  function niveau7(ctx, P, v, acc) {
    fondation(ctx, P, 1, acc, 0.05);
    var top = logis(ctx, P, 0.1, 0.14, 0.9, 0.86, 1.6, 19, acc, { porte: true, etages: 2, e: 2 });
    // Petite serre sur le toit et parabole.
    var s = P(0.62, 0.52, top); ellipse(ctx, s[0], s[1], 0.2 * RX, 0.2 * RY, C.feuilleF); verdure(ctx, s[0], s[1] - 2, 5, C.feuille, 3);
    dome(ctx, P, 0.62, 0.52, 0.2, top, 9, C.verre, { verre: true, nervures: 1 });
    var p = P(0.28, 0.3, top); parabole(ctx, p[0], p[1], 4.4);
    void v;
  }
  function niveau8(ctx, P, v, acc) {
    fondation(ctx, P, 1, acc, 0.04);
    var top = logis(ctx, P, 0.08, 0.1, 0.92, 0.9, 1.6, 15, acc, { porte: true, e: 1.5 });
    // Terrasse : garde-corps lumineux, puis étage en retrait à grande baie.
    neon(ctx, P, 'v', 0.1, 0.9, 0.88, top + 0.6, acc, 0.9); neon(ctx, P, 'u', 0.12, 0.88, 0.9, top + 0.6, acc, 0.9);
    var t2 = module(ctx, P, 0.16, 0.16, 0.74, 0.72, top, top + 12, C.coque, { e: 2.5 });
    baie(ctx, P, 'v', 0.2, 0.7, 0.72, top + 3, top + 9.5);
    baie(ctx, P, 'u', 0.2, 0.68, 0.74, top + 3, top + 9.5);
    ceinture(ctx, P, 0.16, 0.16, 0.74, 0.72, top + 10.2, top + 11.4, acc);
    var s = P(0.45, 0.44, t2); ellipse(ctx, s[0], s[1], 0.16 * RX, 0.16 * RY, C.feuilleF); verdure(ctx, s[0], s[1] - 1.5, 4, C.feuille, 5);
    dome(ctx, P, 0.45, 0.44, 0.16, t2, 7, C.verre, { verre: true, nervures: 1 });
    var p = P(0.84, 0.8, top); arbuste(ctx, p[0], p[1], 7, C.feuille, 2);
    p = P(0.22, 0.22, t2); mat(ctx, p[0], p[1], 8, C.rouge);
    void v;
  }

  // --- Niveau 9 : petit dôme ---------------------------------------------------------
  function niveau9(ctx, P, v, acc) {
    couronne(ctx, P, 0.5, 0.5, 0.47, 0, 3);
    pelouse(ctx, P, 0.5, 0.5, 0.43, 3);
    var p = P(0.3, 0.66, 3); arbuste(ctx, p[0], p[1], 9, C.feuille, 1);
    logis(ctx, P, 0.34, 0.3, 0.72, 0.64, 3, 16, acc, { etages: 2, e: 2, dens: 5 });
    p = P(0.74, 0.74, 3); arbuste(ctx, p[0], p[1], 7, '#58d08a', 4);
    dome(ctx, P, 0.5, 0.5, 0.45, 3, 32, C.verre, { verre: true, nervures: 3 });
    p = P(0.5, 0.5, 35); lampe(ctx, p[0], p[1], acc, 1.1);
    void v;
  }

  // --- Niveaux 10 à 12 : dômes (dessinés pour 2 × 2) ----------------------------------
  function sasDome(ctx, P, c) {
    // Tunnel d'entrée vers l'avant gauche (côté +v).
    voute(ctx, P, 0.82, 1.7, 1.18, 2.0, 0, 8, C.coque, 'v', { nervures: 1 });
    A.sas(ctx, P, 'v', 0.9, 1.1, 2.0, 6, c);
  }
  function niveau10(ctx, P, v, acc) {
    couronne(ctx, P, 1, 1, 0.94, 0, 4);
    pelouse(ctx, P, 1, 1, 0.88, 4);
    var p = P(0.5, 1.2, 4); arbuste(ctx, p[0], p[1], 12, C.feuille, 1);
    logis(ctx, P, 0.62, 0.42, 1.18, 0.92, 4, 20, acc, { etages: 2, e: 2 });
    logis(ctx, P, 1.02, 1.0, 1.52, 1.44, 4, 14, acc, { e: 2 });
    p = P(1.5, 0.66, 4); arbuste(ctx, p[0], p[1], 10, '#58d08a', 3);
    p = P(0.72, 1.5, 4); arbuste(ctx, p[0], p[1], 9, C.feuille, 6);
    dome(ctx, P, 1, 1, 0.9, 4, 54, C.verre, { verre: true, nervures: 5 });
    sasDome(ctx, P, acc);
    p = P(1, 1, 58); lampe(ctx, p[0], p[1], acc, 1.3);
    void v;
  }
  function niveau11(ctx, P, v, acc) {
    couronne(ctx, P, 1, 1, 0.96, 0, 5);
    pelouse(ctx, P, 1, 1, 0.9, 5);
    var p = P(0.46, 1.16, 5); arbuste(ctx, p[0], p[1], 12, C.feuille, 1);
    logis(ctx, P, 0.52, 0.4, 1.0, 0.86, 5, 28, acc, { etages: 3, e: 2 });
    logis(ctx, P, 1.06, 0.6, 1.5, 1.02, 5, 20, acc, { etages: 2, e: 2 });
    logis(ctx, P, 0.86, 1.1, 1.36, 1.5, 5, 14, acc, { e: 2 });
    p = P(1.56, 1.2, 5); arbuste(ctx, p[0], p[1], 10, '#58d08a', 3);
    dome(ctx, P, 1, 1, 0.92, 5, 62, C.verre, { verre: true, nervures: 5 });
    sasDome(ctx, P, acc);
    // Anneau lumineux à la base.
    var b = P(1, 1, 5); A.eclat(ctx, acc, 4, function () { ctx.strokeStyle = acc; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(b[0], b[1], 0.95 * RX, 0.95 * RY, 0, 0.1, Math.PI - 0.1); ctx.stroke(); });
    p = P(1, 1, 67); mat(ctx, p[0], p[1], 6, acc);
    void v;
  }
  function niveau12(ctx, P, v, acc) {
    couronne(ctx, P, 1, 1, 0.97, 0, 6, '#dfe6ef');
    pelouse(ctx, P, 1, 1, 0.91, 6, '#4fd08a');
    // Bassin et jardin luxuriant autour d'une tour centrale.
    var b = P(1.36, 1.34, 6); ellipse(ctx, b[0], b[1], 13, 6, '#2fb8d8'); ellipse(ctx, b[0] - 2, b[1] - 1, 7, 2.6, 'rgba(255,255,255,0.4)');
    var p = P(0.42, 1.06, 6); arbuste(ctx, p[0], p[1], 14, C.feuille, 1);
    p = P(0.74, 0.5, 6); arbuste(ctx, p[0], p[1], 12, '#58d08a', 8);
    cylindre(ctx, P, 1.0, 0.92, 0.3, 6, 40, C.coque, { anneaux: 3 });
    for (var k = 0; k < 3; k++) { var y = P(1.0, 0.92, 14 + k * 9); ctx.strokeStyle = C.chaud; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(y[0], y[1], 0.3 * RX, 0.3 * RY, 0, 0.25, Math.PI - 0.25); ctx.stroke(); }
    p = P(1.0, 0.92, 40); verdure(ctx, p[0], p[1] - 2, 8, C.feuille, 2);
    logis(ctx, P, 0.6, 1.2, 1.06, 1.56, 6, 13, acc, { e: 2 });
    p = P(1.56, 0.78, 6); arbuste(ctx, p[0], p[1], 12, C.feuille, 3);
    p = P(1.2, 1.62, 6); verdure(ctx, p[0], p[1] - 2, 5, '#ff8fd0', 4);
    dome(ctx, P, 1, 1, 0.93, 6, 66, '#9df0ff', { verre: true, nervures: 7 });
    sasDome(ctx, P, C.or);
    b = P(1, 1, 6); A.eclat(ctx, C.or, 4, function () { ctx.strokeStyle = C.or; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(b[0], b[1], 0.96 * RX, 0.96 * RY, 0, 0.1, Math.PI - 0.1); ctx.stroke(); });
    p = P(1, 1, 72); lampe(ctx, p[0], p[1], C.or, 1.5);
    void v; void acc;
  }

  // --- Niveaux 13 à 16 : résidences des notables --------------------------------------
  // Pavillon bas aux lignes courbes : corps blanc, toit doré, grandes baies.
  function pavillon(ctx, P, u0, v0, u1, v1, h0, H, o) {
    o = o || {};
    module(ctx, P, u0, v0, u1, v1, h0, h0 + H, '#f4f6fa', { toit: o.toit || '#f0d28a', e: o.e || 3, d: 0.08 });
    baie(ctx, P, 'v', u0 + 0.06, u1 - 0.06, v1, h0 + 2, h0 + H - 2.4, '#2f86b0');
    baie(ctx, P, 'u', v0 + 0.06, v1 - 0.06, u1, h0 + 2, h0 + H - 2.4, '#2f86b0');
    neon(ctx, P, 'v', u0, u1, v1, h0 + H - 0.8, C.or, 0.9); neon(ctx, P, 'u', v0, v1, u1, h0 + H - 0.8, C.or, 0.8);
    return h0 + H + (o.e || 3);
  }
  function bassin(ctx, P, u0, v0, u1, v1, h) {
    dalle(ctx, P, u0 - 0.04, v0 - 0.04, u1 + 0.04, v1 + 0.04, h, '#e6ecf3');
    dalle(ctx, P, u0, v0, u1, v1, h, A.degV(ctx, P(u0, v0, h)[1], P(u1, v1, h)[1], '#52d8f0', '#1f9ec4'));
    var a = P((u0 + u1) / 2 - 0.08, (v0 + v1) / 2, h); ligne(ctx, [a[0] - 4, a[1]], [a[0] + 4, a[1]], 'rgba(255,255,255,0.7)', 0.8);
  }
  function residence(ctx, P, niv, acc) {
    // Dessinée pour 2 × 2 : terrasse claire, jardin, bassin, pavillon principal et aile.
    boite(ctx, P, 0.06, 0.06, 1.94, 1.94, 0, 2.4, '#dfe6ef', { sansPied: true, dessus: '#eef2f7' });
    A.quadrillage(ctx, P, 0.06, 0.06, 1.94, 1.94, 2.4, 0.32, 'rgba(120,140,170,0.25)');
    var p = P(0.3, 0.3, 2.4); arbuste(ctx, p[0], p[1], 13, C.feuille, 1);
    var haute = niv >= 14;
    var t1 = pavillon(ctx, P, 0.5, 0.26, 1.7, 0.92, 2.4, haute ? 15 : 12);
    if (haute) { var t2 = pavillon(ctx, P, 0.7, 0.34, 1.4, 0.82, t1, 9, { toit: '#f6dc98' }); p = P(1.05, 0.58, t2); mat(ctx, p[0], p[1], 7, C.or); }
    else { p = P(1.1, 0.58, t1); verdure(ctx, p[0], p[1] - 2, 6, C.feuille, 3); dome(ctx, P, 1.1, 0.58, 0.2, t1, 9, C.verre, { verre: true, nervures: 1 }); }
    pavillon(ctx, P, 1.26, 0.98, 1.8, 1.6, 2.4, 10);
    bassin(ctx, P, 0.36, 1.12, 1.1, 1.56, 2.6);
    p = P(0.28, 1.72, 2.4); arbuste(ctx, p[0], p[1], 10, '#58d08a', 5);
    p = P(1.2, 1.8, 2.4); verdure(ctx, p[0], p[1] - 2, 5, '#ff8fd0', 2);
    p = P(1.68, 1.78, 2.4); lampe(ctx, p[0], p[1] - 6, acc, 1); ligne(ctx, [p[0], p[1]], [p[0], p[1] - 6], C.acier, 1);
  }
  function grandeResidence(ctx, P, niv, acc) {
    // Dessinée pour 3 × 3 : rotonde centrale sous dôme, deux ailes, cour à bassin, jardins.
    boite(ctx, P, 0.06, 0.06, 2.94, 2.94, 0, 3, '#dfe6ef', { sansPied: true, dessus: '#eef2f7' });
    A.quadrillage(ctx, P, 0.06, 0.06, 2.94, 2.94, 3, 0.36, 'rgba(120,140,170,0.25)');
    var prestige = niv >= 16, p;
    p = P(0.36, 0.4, 3); arbuste(ctx, p[0], p[1], 15, C.feuille, 1);
    p = P(2.5, 0.4, 3); arbuste(ctx, p[0], p[1], 13, '#58d08a', 7);
    pavillon(ctx, P, 0.5, 0.7, 1.16, 1.9, 3, 13);
    var t1 = pavillon(ctx, P, 1.0, 0.4, 2.2, 1.3, 3, prestige ? 20 : 16);
    cylindre(ctx, P, 1.6, 0.85, 0.36, t1, t1 + 5, '#f4f6fa');
    var g = P(1.6, 0.85, t1 + 5); verdure(ctx, g[0], g[1] - 3, 9, C.feuille, 2);
    dome(ctx, P, 1.6, 0.85, 0.36, t1 + 5, 20, '#9df0ff', { verre: true, nervures: 3 });
    if (prestige) { p = P(1.6, 0.85, t1 + 25); mat(ctx, p[0], p[1], 9, C.or); var b = P(1.6, 0.85, t1 + 5); A.eclat(ctx, C.or, 4, function () { ctx.strokeStyle = C.or; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(b[0], b[1], 0.38 * RX, 0.38 * RY, 0, 0.1, Math.PI - 0.1); ctx.stroke(); }); }
    pavillon(ctx, P, 2.06, 1.36, 2.7, 2.4, 3, 12);
    bassin(ctx, P, 0.9, 1.7, 1.8, 2.36, 3.2);
    if (prestige) { p = P(1.35, 2.03, 3.2); A.hologramme(ctx, p[0], p[1], 10, C.or, 'etoile', 4); }
    p = P(0.4, 2.5, 3); arbuste(ctx, p[0], p[1], 13, C.feuille, 4);
    p = P(2.2, 2.66, 3); verdure(ctx, p[0], p[1] - 2, 6, '#ff8fd0', 6);
    p = P(2.72, 2.72, 3); ligne(ctx, [p[0], p[1]], [p[0], p[1] - 7], C.acier, 1); lampe(ctx, p[0], p[1] - 7, acc, 1.1);
    p = P(0.34, 1.5, 3); ligne(ctx, [p[0], p[1]], [p[0], p[1] - 7], C.acier, 1); lampe(ctx, p[0], p[1] - 7, acc, 1.1);
  }

  // --- Niveaux 17 à 20 : arcologies ----------------------------------------------------
  // Tour en gradins : chaque étage en retrait porte une terrasse plantée et un anneau de lumière.
  function gradins(ctx, P, cu, cv, r, h0, n, he, acc, o) {
    o = o || {};
    var h = h0, k, top;
    for (k = 0; k < n; k++) {
      var rr = r * (1 - k * (o.pente || 0.13)), u0 = cu - rr, v0 = cv - rr, u1 = cu + rr, v1 = cv + rr, H = he * (k === n - 1 ? 1.25 : 1);
      top = module(ctx, P, u0, v0, u1, v1, h, h + H, '#eef2f7', { toit: '#dfe6ef', e: 1.5, d: 0.05, joints: 0 });
      var et = Math.max(1, Math.round(H / 7)), j;
      for (j = 0; j < et; j++) {
        var b = h + 1.5 + j * (H - 2) / et;
        fenetres(ctx, P, 'v', u0 + 0.04, u1 - 0.04, v1, b + 1, b + (H - 2) / et * 0.62, Math.max(2, Math.round(rr * 9)), j % 2 ? C.chaud : '#bfeaff');
        fenetres(ctx, P, 'u', v0 + 0.04, v1 - 0.04, u1, b + 1, b + (H - 2) / et * 0.62, Math.max(2, Math.round(rr * 9)), j % 2 ? C.chaud : '#bfeaff');
      }
      neon(ctx, P, 'v', u0, u1, v1, h + H - 0.6, acc, 1); neon(ctx, P, 'u', v0, v1, u1, h + H - 0.6, acc, 0.9);
      // Terrasse plantée sur le retrait.
      if (k < n - 1) {
        var r2 = r * (1 - (k + 1) * (o.pente || 0.13)), q;
        q = P(cu - r2 - (rr - r2) * 0.5, cv + rr * 0.5, top); verdure(ctx, q[0], q[1] - 1.5, 3.6, C.feuille, k);
        q = P(cu + rr * 0.4, cv + r2 + (rr - r2) * 0.5, top); verdure(ctx, q[0], q[1] - 1.5, 3.6, '#58d08a', k + 3);
        q = P(cu + r2 + (rr - r2) * 0.5, cv - rr * 0.2, top); verdure(ctx, q[0], q[1] - 1.5, 3.2, C.feuille, k + 5);
      }
      h = top;
    }
    return h;
  }
  function arcologie(ctx, P, niv, acc) {
    // Dessinée pour 3 × 3.
    boite(ctx, P, 0.05, 0.05, 2.95, 2.95, 0, 3, '#cfd7e2', { sansPied: true, dessus: '#e3e9f1' });
    var p = P(0.34, 0.34, 3); arbuste(ctx, p[0], p[1], 13, C.feuille, 1);
    p = P(2.62, 0.4, 3); arbuste(ctx, p[0], p[1], 12, '#58d08a', 2);
    var grande = niv >= 18, top = gradins(ctx, P, 1.5, 1.42, 1.12, 3, grande ? 5 : 4, grande ? 22 : 21, acc);
    var g = P(1.5, 1.42, top); verdure(ctx, g[0], g[1] - 3, 8, C.feuille, 4);
    dome(ctx, P, 1.5, 1.42, grande ? 0.36 : 0.42, top, grande ? 16 : 18, '#9df0ff', { verre: true, nervures: 3 });
    p = P(1.5, 1.42, top + (grande ? 16 : 18)); mat(ctx, p[0], p[1], grande ? 14 : 9, C.rouge);
    p = P(0.4, 2.56, 3); arbuste(ctx, p[0], p[1], 12, C.feuille, 3);
    p = P(2.6, 2.6, 3); A.hologramme(ctx, p[0], p[1], 10, acc, 'globe', 4);
  }
  function grandeArcologie(ctx, P, niv, acc) {
    // Dessinée pour 4 × 4 : tour centrale, deux tours satellites reliées par des passerelles vitrées.
    boite(ctx, P, 0.05, 0.05, 3.95, 3.95, 0, 3, '#cfd7e2', { sansPied: true, dessus: '#e3e9f1' });
    A.quadrillage(ctx, P, 0.05, 0.05, 3.95, 3.95, 3, 0.5, 'rgba(120,140,170,0.22)');
    var stellaire = niv >= 20, or = stellaire ? C.or : acc, p;
    p = P(0.4, 0.44, 3); arbuste(ctx, p[0], p[1], 15, C.feuille, 1);
    p = P(3.5, 0.5, 3); arbuste(ctx, p[0], p[1], 13, '#58d08a', 2);
    // Tour arrière gauche.
    var ta = gradins(ctx, P, 0.98, 1.36, 0.6, 3, 4, 20, or, { pente: 0.1 });
    p = P(0.98, 1.36, ta); mat(ctx, p[0], p[1], 8, C.rouge);
    // Tour centrale.
    var tc = gradins(ctx, P, 2.1, 1.9, 1.16, 3, stellaire ? 6 : 5, stellaire ? 27 : 28, or, { pente: 0.11 });
    var g = P(2.1, 1.9, tc); verdure(ctx, g[0], g[1] - 3, 9, C.feuille, 4);
    dome(ctx, P, 2.1, 1.9, 0.38, tc, 20, stellaire ? '#ffe9a8' : '#9df0ff', { verre: true, nervures: 3 });
    p = P(2.1, 1.9, tc + 20);
    if (stellaire) {
      // Flèche couronnée d'un anneau d'or.
      ligne(ctx, [p[0], p[1]], [p[0], p[1] - 22], C.coque, 1.8);
      A.eclat(ctx, C.or, 5, function () { ctx.strokeStyle = C.or; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 12, 9, 3.6, 0, 0, Math.PI * 2); ctx.stroke(); });
      lampe(ctx, p[0], p[1] - 23, C.or, 1.8);
    } else mat(ctx, p[0], p[1], 14, C.rouge);
    // Tour avant droite et passerelles.
    var tb = gradins(ctx, P, 3.2, 2.9, 0.58, 3, 3, 20, or, { pente: 0.1 });
    p = P(3.2, 2.9, tb); mat(ctx, p[0], p[1], 7, C.rouge);
    A.tuyau(ctx, [P(1.5, 1.6, 30), P(1.1, 1.5, 30)], '#bfeaff', 3.2);
    A.tuyau(ctx, [P(2.9, 2.5, 26), P(3.1, 2.7, 26)], '#bfeaff', 3.2);
    p = P(0.6, 3.3, 3); arbuste(ctx, p[0], p[1], 14, C.feuille, 3);
    bassin(ctx, P, 1.0, 3.0, 2.2, 3.56, 3.2);
    p = P(1.6, 3.28, 3.2); A.hologramme(ctx, p[0], p[1], 12, or, stellaire ? 'etoile' : 'globe', 5);
    p = P(3.6, 1.5, 3); arbuste(ctx, p[0], p[1], 12, '#58d08a', 5);
  }

  var NIVEAUX = [parcelle, niveau1, niveau2, niveau3, niveau4, niveau5, niveau6, niveau7, niveau8, niveau9, niveau10, niveau11, niveau12];
  function peindre(ctx, P, niv, v, t) {
    niv = Math.max(0, Math.min(20, niv | 0));
    var acc = ACCENTS[(v || 0) % 3], d = TAILLE[niv], Q = t === d ? P : A.echelle(P, t / d);
    // Les premiers logis sont petits : on les grossit autour du centre de la case pour bien l'occuper.
    var g = GROS[niv];
    if (g) { var Q0 = Q, c = d / 2; Q = function (u, w, h) { return Q0(c + (u - c) * g, c + (w - c) * g, (h || 0) * g); }; }
    if (niv <= 12) NIVEAUX[niv](ctx, Q, v || 0, acc);
    else if (niv <= 14) residence(ctx, Q, niv, acc);
    else if (niv <= 16) grandeResidence(ctx, Q, niv, acc);
    else if (niv <= 18) arcologie(ctx, Q, niv, acc);
    else grandeArcologie(ctx, Q, niv, acc);
  }

  A.maison = { peindre: peindre, haut: haut, TAILLE: TAILLE, logis: logis, fondation: fondation, pavillon: pavillon, bassin: bassin, gradins: gradins, capsule: capsule, abri: abri, couronne: couronne, pelouse: pelouse };
  void poly; void teinte; void tronc; void lueur;
})(typeof window !== 'undefined' ? window : globalThis);
