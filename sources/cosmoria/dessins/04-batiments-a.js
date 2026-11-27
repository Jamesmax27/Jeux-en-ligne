/* ==========================================================================
   Cosmoria — dessins, partie 4 : eau, alimentation, industrie et stockage.

   Chaque peintre reçoit (ctx, P, t, etat) : P projette (u, v, hauteur) dans
   l'emprise de t × t cases ; etat porte ce que le rendu veut montrer (actif,
   frame d'animation, niveau de stock, avancement d'une récolte…). On peint du
   fond vers l'avant (u + v croissant). Les identifiants sont ceux du moteur :
   voir sources/cosmoria/LEXIQUE.md (puits = foreuse à glace, grenier = silo…).
   ========================================================================== */
(function (racine) {
  'use strict';
  var A = racine.CM_ART, C = A.C, PE = A.PEINTRES, HAUT = A.HAUT, BIENS = A.BIENS;
  var poly = A.poly, ligne = A.ligne, trace = A.trace, cercle = A.cercle, ellipse = A.ellipse, teinte = A.teinte, nuance = A.nuance,
    alpha = A.alpha, melange = A.melange, boite = A.boite, module = A.module, voute = A.voute, cylindre = A.cylindre, tronc = A.tronc,
    dome = A.dome, sphere = A.sphere, fenetres = A.fenetres, baie = A.baie, ceinture = A.ceinture, neon = A.neon, sas = A.sas,
    mat = A.mat, parabole = A.parabole, panneau = A.panneau, tuyau = A.tuyau, conteneur = A.conteneur, lampe = A.lampe, lueur = A.lueur,
    verdure = A.verdure, arbuste = A.arbuste, dalle = A.dalle, ombre = A.ombre, figurant = A.figurant, vapeur = A.vapeur, RX = A.RX, RY = A.RY;

  // --- Enseignes -----------------------------------------------------------------
  // Pictogramme blanc dans un disque de 3 px de rayon utile (sans texte).
  function picto(ctx, x, y, cat) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    switch (cat) {
      case 'eau': ctx.beginPath(); ctx.moveTo(x, y - 2.8); ctx.quadraticCurveTo(x + 2.8, y + 0.6, x, y + 2.4); ctx.quadraticCurveTo(x - 2.8, y + 0.6, x, y - 2.8); ctx.fill(); break;
      case 'alim': ctx.beginPath(); ctx.ellipse(x + 0.3, y - 0.4, 2.6, 1.4, -0.8, 0, Math.PI * 2); ctx.fill(); ligne(ctx, [x - 1.8, y + 2.2], [x + 0.6, y - 0.6], '#fff', 0.8); break;
      case 'indus': cercle(ctx, x, y, 1.7, null, '#fff', 1.1); for (var k = 0; k < 6; k++) { var a = k * Math.PI / 3; ligne(ctx, [x + Math.cos(a) * 2, y + Math.sin(a) * 2], [x + Math.cos(a) * 2.9, y + Math.sin(a) * 2.9], '#fff', 1.1); } break;
      case 'sante': ctx.fillRect(x - 0.8, y - 2.6, 1.6, 5.2); ctx.fillRect(x - 2.6, y - 0.8, 5.2, 1.6); break;
      case 'educ': poly(ctx, [[x - 2.8, y - 1.6], [x, y - 0.8], [x, y + 2.2], [x - 2.8, y + 1.4]], '#fff'); poly(ctx, [[x + 2.8, y - 1.6], [x + 0.4, y - 0.8], [x + 0.4, y + 2.2], [x + 2.8, y + 1.4]], 'rgba(255,255,255,0.75)'); break;
      case 'divert': ctx.beginPath(); for (var j = 0; j < 10; j++) { var r = j % 2 ? 1.2 : 2.9, b = -Math.PI / 2 + j * Math.PI / 5; ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); } ctx.closePath(); ctx.fill(); break;
      case 'admin': poly(ctx, [[x - 2.8, y - 0.8], [x, y - 2.8], [x + 2.8, y - 0.8]], '#fff'); ctx.fillRect(x - 2.2, y - 0.2, 1, 2.4); ctx.fillRect(x - 0.5, y - 0.2, 1, 2.4); ctx.fillRect(x + 1.2, y - 0.2, 1, 2.4); break;
      case 'secu': poly(ctx, [[x - 2.4, y - 2.4], [x + 2.4, y - 2.4], [x + 2.4, y + 0.2], [x, y + 2.8], [x - 2.4, y + 0.2]], '#fff'); break;
      case 'ingen': ligne(ctx, [x - 2, y + 2], [x + 0.8, y - 0.8], '#fff', 1.3); ctx.beginPath(); ctx.arc(x + 1.5, y - 1.5, 1.5, 0.3, Math.PI * 1.7); ctx.stroke(); break;
      case 'milit': trace(ctx, [[x - 2.4, y + 0.2], [x, y - 2.2], [x + 2.4, y + 0.2]], '#fff', 1.2); trace(ctx, [[x - 2.4, y + 2.4], [x, y], [x + 2.4, y + 2.4]], '#fff', 1.2); break;
      default: cercle(ctx, x, y, 1.6, '#fff');
    }
  }
  // Enseigne lumineuse sur mât : disque de la couleur de la catégorie, pictogramme blanc.
  function enseigne(ctx, x, y, cat, h, c) {
    h = h === undefined ? 9 : h; c = c || C[cat] || C.cyan;
    if (h > 0) { ligne(ctx, [x, y], [x, y - h], C.acierF, 1.2); ligne(ctx, [x - 0.4, y], [x - 0.4, y - h], 'rgba(255,255,255,0.35)', 0.4); }
    lueur(ctx, x, y - h - 4.6, 10, c, 0.5);
    cercle(ctx, x, y - h - 4.6, 4.9, c, 'rgba(255,255,255,0.9)', 0.9);
    picto(ctx, x, y - h - 4.6, cat);
  }

  // --- Cultures ---------------------------------------------------------------------
  // n rangs de culture le long de l'axe ('u' ou 'v') : feuillage bas de hauteur H, fruits facultatifs.
  function rangs(ctx, P, u0, v0, u1, v1, h0, n, axe, c, H, fruit) {
    var k, j;
    for (k = 0; k < n; k++) {
      var f0 = (k + 0.18) / n, f1 = (k + 0.82) / n, a0, b0, a1, b1;
      if (axe === 'u') { a0 = u0; a1 = u1; b0 = v0 + (v1 - v0) * f0; b1 = v0 + (v1 - v0) * f1; }
      else { a0 = u0 + (u1 - u0) * f0; a1 = u0 + (u1 - u0) * f1; b0 = v0; b1 = v1; }
      boite(ctx, P, a0, b0, a1, b1, h0, h0 + Math.max(0.8, H), c, { sansPied: true, dessus: nuance(c, 1.2) });
      if (fruit) for (j = 0; j < 4; j++) {
        var q = axe === 'u' ? P(a0 + (a1 - a0) * (j + 0.5) / 4, (b0 + b1) / 2, h0 + H) : P((a0 + a1) / 2, b0 + (b1 - b0) * (j + 0.5) / 4, h0 + H);
        cercle(ctx, q[0], q[1] - 0.4, 1, fruit);
      }
    }
  }
  // Serre vitrée en voûte : terreau, cultures (peintes par dedans), puis le verre par-dessus.
  function serre(ctx, P, u0, v0, u1, v1, h0, H, axe, dedans) {
    boite(ctx, P, u0, v0, u1, v1, 0, h0, C.coqueG, { sansPied: true, dessus: '#3d3430' });
    if (dedans) dedans();
    voute(ctx, P, u0, v0, u1, v1, h0, H, C.verre, axe, { verre: true, nervures: Math.max(2, Math.round((axe === 'v' ? v1 - v0 : u1 - u0) * 3)) });
  }
  // Sol d'une exploitation : plaque sombre bordée de clair.
  function parcelleCulture(ctx, P, u0, v0, u1, v1, c) {
    dalle(ctx, P, u0, v0, u1, v1, 0, c || '#33524a');
    poly(ctx, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], null, 'rgba(220,235,245,0.45)', 0.8);
  }
  // Local technique : petit module à ceinture de couleur, sas et fenêtres.
  function local(ctx, P, u0, v0, u1, v1, H, c, o) {
    o = o || {};
    var top = module(ctx, P, u0, v0, u1, v1, o.h0 || 0, (o.h0 || 0) + H, o.corps || C.coque, { e: o.e === undefined ? 3 : o.e, toit: o.toit, joints: o.joints });
    ceinture(ctx, P, u0, v0, u1, v1, (o.h0 || 0) + H - 3, (o.h0 || 0) + H - 1.2, c);
    if (o.porte !== false) sas(ctx, P, 'v', u0 + (u1 - u0) * 0.12, u0 + (u1 - u0) * 0.12 + Math.min(0.26, (u1 - u0) * 0.4), v1, Math.min(7.5, H * 0.6), c);
    if (o.fen !== false) {
      fenetres(ctx, P, 'v', u0 + (u1 - u0) * 0.5, u1 - 0.04, v1, (o.h0 || 0) + H * 0.36, (o.h0 || 0) + H * 0.66, Math.max(1, Math.round((u1 - u0) * 2.2)), o.lum);
      fenetres(ctx, P, 'u', v0 + 0.04, v1 - 0.04, u1, (o.h0 || 0) + H * 0.36, (o.h0 || 0) + H * 0.66, Math.max(1, Math.round((v1 - v0) * 3.4)), o.lum);
    }
    return top;
  }

  // --- Piles de marchandises (entrepôts, ateliers, quais) -------------------------------
  // q : 1 à 4 charges. La forme dit le bien autant que sa couleur.
  function pile(ctx, P, u0, v0, u1, v1, bien, q, h0) {
    var c = BIENS[bien] || '#aaa', forme = A.FORME_BIEN[bien] || 'caisses', k, places = [[0.3, 0.3], [0.72, 0.36], [0.34, 0.72], [0.74, 0.76]];
    h0 = h0 || 0; q = Math.max(0, Math.min(4, q | 0));
    var du = (u1 - u0), dv = (v1 - v0), s = Math.min(du, dv);
    for (k = 0; k < q; k++) {
      var u = u0 + du * places[k][0], v = v0 + dv * places[k][1], p = P(u, v, h0), r = s * 0.17;
      ombre(ctx, p[0] + 1.5, p[1] + 1, r * 46, r * 20, 0.22);
      switch (forme) {
        case 'sacs': ellipse(ctx, p[0], p[1] - 2.5, r * 40, r * 24, nuance(c, 0.82)); ellipse(ctx, p[0] - 1, p[1] - 5.5, r * 34, r * 20, c); ellipse(ctx, p[0] - 2, p[1] - 7, r * 14, r * 7, nuance(c, 1.3)); break;
        case 'futs': cylindre(ctx, P, u, v, r * 0.78, h0, h0 + 9, c, { anneaux: 2 }); break;
        case 'bacs': boite(ctx, P, u - r, v - r, u + r, v + r, h0, h0 + 5, '#dfe6ef', { sansPied: true, dessus: c }); var d = P(u, v, h0 + 5); cercle(ctx, d[0] - 2, d[1] - 0.6, 1.2, nuance(c, 1.25)); cercle(ctx, d[0] + 2, d[1] + 0.4, 1.2, nuance(c, 0.8)); break;
        case 'ballots': boite(ctx, P, u - r, v - r * 0.8, u + r, v + r * 0.8, h0, h0 + 6, c, { sansPied: true }); ligne(ctx, P(u, v + r * 0.8, h0), P(u, v + r * 0.8, h0 + 6), 'rgba(255,255,255,0.7)', 0.8); ligne(ctx, P(u, v - r * 0.8, h0 + 6), P(u, v + r * 0.8, h0 + 6), 'rgba(255,255,255,0.7)', 0.8); break;
        case 'tas': dome(ctx, P, u, v, r * 1.1, h0, 7, c, { nervures: 0, anneau: false }); break;
        case 'lingots': boite(ctx, P, u - r, v - r * 0.5, u + r, v + r * 0.5, h0, h0 + 2.4, c, { sansPied: true }); boite(ctx, P, u - r * 0.8, v - r * 0.3, u + r * 0.8, v + r * 0.5, h0 + 2.4, h0 + 4.8, nuance(c, 1.1), { sansPied: true }); break;
        case 'cristaux': lueur(ctx, p[0], p[1] - 5, 8, c, 0.4); A.cristal(ctx, p[0] - 2, p[1], 2.2, 9, c, -0.6); A.cristal(ctx, p[0] + 2, p[1] + 1, 2, 7, c, 0.8); break;
        case 'meubles': boite(ctx, P, u - r, v - r, u + r * 0.6, v + r * 0.6, h0 + 3, h0 + 4.4, c, { sansPied: true }); ligne(ctx, P(u - r, v + r * 0.6, h0), P(u - r, v + r * 0.6, h0 + 3), nuance(c, 0.7), 1); ligne(ctx, P(u + r * 0.6, v + r * 0.6, h0), P(u + r * 0.6, v + r * 0.6, h0 + 3), nuance(c, 0.7), 1); ligne(ctx, P(u + r * 0.6, v - r, h0), P(u + r * 0.6, v - r, h0 + 3), nuance(c, 0.6), 1); boite(ctx, P, u + r * 0.3, v - r, u + r * 0.6, v + r * 0.6, h0 + 4.4, h0 + 8.5, nuance(c, 1.08), { sansPied: true }); break;
        case 'bonbonnes': cylindre(ctx, P, u, v, r * 0.5, h0, h0 + 2, '#dfe6ef'); sphere(ctx, p[0], p[1] - 5.4, r * 30, c); cercle(ctx, p[0] - 1.2, p[1] - 6.8, 0.9, 'rgba(255,255,255,0.8)'); ctx.fillStyle = '#dfe6ef'; ctx.fillRect(p[0] - 1, p[1] - 10.6, 2, 2.4); break;
        default: conteneur(ctx, P, u - r, v - r, u + r, v + r, h0, h0 + 7, '#dfe6ef'); ceinture(ctx, P, u - r, v - r, u + r, v + r, h0 + 2.6, h0 + 4.6, c);
      }
    }
  }

  // ==========================================================================
  // Eau
  // ==========================================================================
  // Foreuse à glace : trépied, foret, cuve bleue.
  PE.puits = function (ctx, P) {
    boite(ctx, P, 0.16, 0.16, 0.84, 0.84, 0, 2, C.coqueG, { sansPied: true });
    var s = P(0.46, 0.46, 30), g = P(0.46, 0.46, 2);
    ellipse(ctx, g[0], g[1], 9, 4, '#27384d'); ellipse(ctx, g[0], g[1], 5, 2.2, '#5fd0ff');
    ligne(ctx, P(0.22, 0.3, 2), s, C.acierF, 1.6);
    ligne(ctx, [g[0], g[1]], [s[0], s[1] + 3], C.acier, 2.4);
    for (var k = 0; k < 5; k++) ligne(ctx, [g[0] - 2.2, g[1] - 4 - k * 4.4], [g[0] + 2.2, g[1] - 6 - k * 4.4], '#dfe6ef', 0.9);
    ligne(ctx, P(0.74, 0.34, 2), s, C.acier, 1.6); ligne(ctx, P(0.4, 0.8, 2), s, C.coqueG, 1.8);
    boite(ctx, P, 0.36, 0.36, 0.56, 0.56, 28, 32, C.eau, { sansPied: true });
    cylindre(ctx, P, 0.72, 0.7, 0.13, 2, 13, C.eau, { anneaux: 1 });
    tuyau(ctx, [P(0.5, 0.5, 3), P(0.62, 0.62, 3), P(0.66, 0.66, 8)], C.coqueG, 1.8);
    lampe(ctx, s[0], s[1] - 3.5, C.cyan, 1.1);
  };
  HAUT.puits = 38;
  // Borne d'eau pure : sphère d'eau sur un pied ; éteinte tant qu'aucune station ne l'alimente.
  PE.fontaine = function (ctx, P, t, etat) {
    var on = etat && etat.actif, fr = (etat && etat.frame) || 0;
    cylindre(ctx, P, 0.5, 0.5, 0.36, 0, 2.4, C.coqueG);
    cylindre(ctx, P, 0.5, 0.5, 0.26, 2.4, 4, on ? '#2f9fdc' : '#5d6878', { dessus: on ? '#6fd4ff' : '#778296' });
    tronc(ctx, P, 0.5, 0.5, 0.12, 0.07, 4, 13, C.coque);
    var c = P(0.5, 0.5, 20);
    if (on) lueur(ctx, c[0], c[1], 17, C.eau, 0.55);
    sphere(ctx, c[0], c[1], 7.6, on ? '#3fb4f4' : '#7c8798');
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(c[0], c[1], 5.6, Math.PI * 1.05, Math.PI * 1.45); ctx.stroke();
    cylindre(ctx, P, 0.5, 0.5, 0.09, 26.5, 28.5, C.coqueG);
    if (on) {
      [[-2.4, 1.5], [1.8, -1], [0.2, 3.2]].forEach(function (b, i) { cercle(ctx, c[0] + b[0], c[1] + b[1] - ((fr + i) % 2) * 1.6, 0.9, 'rgba(255,255,255,0.75)'); });
      // Filets d'eau qui retombent dans la vasque.
      ligne(ctx, [c[0] - 6.4, c[1] + 4], [c[0] - 7.4, c[1] + 15], alpha('#bfeaff', 0.8), 0.9); ligne(ctx, [c[0] + 6.4, c[1] + 4], [c[0] + 7.4, c[1] + 15.5], alpha('#bfeaff', 0.6), 0.9);
    }
  };
  HAUT.fontaine = 36;
  // Station de pompage : grande cuve ouverte (pleine ou vide), local des pompes, conduites.
  PE.reservoir = function (ctx, P, t, etat) {
    var plein = etat && etat.plein, fr = (etat && etat.frame) || 0;
    boite(ctx, P, 0.06, 0.06, 2.94, 2.94, 0, 2.4, C.coqueG, { sansPied: true, dessus: '#d3dbe6' });
    var top = local(ctx, P, 1.9, 0.24, 2.76, 0.96, 15, C.eau);
    var e = P(2.3, 0.6, top); enseigne(ctx, e[0], e[1], 'eau', 8);
    cylindre(ctx, P, 0.5, 0.56, 0.24, 2.4, 20, C.coque, { anneaux: 3 }); cylindre(ctx, P, 0.5, 0.56, 0.18, 20, 22, C.eau);
    cylindre(ctx, P, 1.02, 0.5, 0.24, 2.4, 16, C.coque, { anneaux: 2 }); cylindre(ctx, P, 1.02, 0.5, 0.18, 16, 18, C.eau);
    // La cuve.
    cylindre(ctx, P, 1.42, 1.72, 1.14, 2.4, 15, '#dfe6ef', { anneaux: 2, dessus: '#aeb9c9' });
    var b = P(1.42, 1.72, 15);
    ellipse(ctx, b[0], b[1], 1.04 * RX, 1.04 * RY, plein ? A.degR(ctx, b[0], b[1], 1.04 * RX, [[0, '#7fe0ff'], [0.7, '#2f9fdc'], [1, '#1c6fa8']], b[0] - 16, b[1] - 8) : '#2a3446');
    if (plein) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.ellipse(b[0] - 8 + fr * 5, b[1] - 2, 14 + fr * 4, 5 + fr * 1.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(b[0] + 16 - fr * 4, b[1] + 5, 7, 2.6, 0, 0, Math.PI * 2); ctx.stroke();
      lueur(ctx, b[0], b[1], 40, C.eau, 0.22);
    } else { ligne(ctx, [b[0] - 20, b[1] + 2], [b[0] + 18, b[1] - 3], 'rgba(255,255,255,0.12)', 1); }
    neon(ctx, P, 'v', 0.5, 2.3, 2.86, 2.6, plein ? C.cyan : '#6c7a92', 1);
    tuyau(ctx, [P(2.3, 0.96, 6), P(2.3, 1.3, 6), P(2.1, 1.4, 6)], C.eau, 3);
    tuyau(ctx, [P(1.02, 0.74, 5), P(1.02, 0.94, 5)], C.eau, 2.4);
    var p = P(2.62, 2.6, 2.4); figurant(ctx, p[0], p[1], 1, '#bfe4ff');
  };
  HAUT.reservoir = 44;
  // Pipeline : conduite sur pylônes ; bleue et lumineuse quand l'eau y passe ; portique au-dessus d'une passerelle.
  var H_TUYAU = 15;
  PE.aqueduc = function (ctx, P, t, etat) {
    var m = (etat && etat.masque) || 0, eau = etat && etat.eau, route = etat && etat.route, c = P(0.5, 0.5, H_TUYAU);
    var bras = function (u, v) {
      var b = P(u, v, H_TUYAU);
      tuyau(ctx, [c, b], C.coqueG, 5.2);
      if (eau) { A.eclat(ctx, C.cyan, 3, function () { ligne(ctx, c, b, '#5fd0ff', 1.6); }); }
      else ligne(ctx, c, b, '#77839a', 1.4);
    };
    var g = P(0.5, 0.5);
    if (!route) ellipse(ctx, g[0] + 2, g[1] + 1.5, 9, 4, 'rgba(10,12,24,0.24)');
    if (m & 1) bras(0.5, 0); if (m & 8) bras(0, 0.5);
    if (route) {
      // Deux potences de part et d'autre : la passerelle passe dessous.
      var surU = !!(m & 10) && !(m & 5);
      var q0 = surU ? P(0.5, 0.06) : P(0.06, 0.5), q1 = surU ? P(0.5, 0.94) : P(0.94, 0.5);
      [q0, q1].forEach(function (q) { ligne(ctx, q, [q[0], q[1] - H_TUYAU - 3], C.acierF, 2); });
      ligne(ctx, [q0[0], q0[1] - H_TUYAU - 3], [q1[0], q1[1] - H_TUYAU - 3], C.acier, 2);
    } else {
      tronc(ctx, P, 0.5, 0.5, 0.11, 0.07, 0, H_TUYAU - 2, C.acier);
    }
    if (m & 2) bras(1, 0.5); if (m & 4) bras(0.5, 1);
    // Raccord central (vanne) : toujours dessiné, même pour un pipeline isolé.
    sphere(ctx, c[0], c[1], 4.2, C.coque);
    cercle(ctx, c[0], c[1], 1.6, eau ? '#5fd0ff' : '#77839a');
    if (eau) lueur(ctx, c[0], c[1], 7, C.cyan, 0.5);
  };
  HAUT.aqueduc = 30;
  // Portique de circulation : cadre lumineux qui retient les marcheurs errants.
  PE.barriere = function (ctx, P) {
    var q = [P(0.12, 0.12), P(0.88, 0.12), P(0.88, 0.88), P(0.12, 0.88)], H = 13, k;
    for (k = 0; k < 4; k++) ligne(ctx, q[k], [q[k][0], q[k][1] - H], k === 2 ? C.coque : C.coqueG, 2);
    var h = q.map(function (p) { return [p[0], p[1] - H]; });
    A.eclat(ctx, C.ambre, 4, function () { poly(ctx, h, null, C.ambre, 1.5); });
    poly(ctx, h, 'rgba(255,207,107,0.12)');
    for (k = 0; k < 4; k++) lampe(ctx, h[k][0], h[k][1], C.rouge, 1);
  };
  HAUT.barriere = 22;

  // ==========================================================================
  // Alimentation
  // ==========================================================================
  function tetePousse(p) { return melange('#58c24a', '#f0cc55', Math.max(0, Math.min(1, p))); }
  // Serre à céréales : trois tunnels de verre, les épis blondissent avec la récolte.
  PE.ferme_ble = function (ctx, P, t, etat) {
    var p = (etat && etat.prog) || 0, c = tetePousse(p), k;
    parcelleCulture(ctx, P, 0.06, 0.06, 2.94, 2.94);
    var top = local(ctx, P, 0.2, 0.18, 1.0, 0.74, 13, C.alim);
    var e = P(0.6, 0.46, top); enseigne(ctx, e[0], e[1], 'alim', 8);
    cylindre(ctx, P, 1.5, 0.46, 0.22, 0, 15, C.coque, { anneaux: 2 }); cylindre(ctx, P, 1.5, 0.46, 0.16, 15, 17, C.alim);
    panneau(ctx, P, 1.96, 0.2, 2.8, 0.7, 3, 10, 4);
    for (k = 0; k < 3; k++) {
      (function (v0) {
        serre(ctx, P, 0.2, v0, 2.8, v0 + 0.6, 2, 10, 'u', function () { rangs(ctx, P, 0.28, v0 + 0.06, 2.72, v0 + 0.54, 2, 2, 'u', c, 1 + p * 5); });
      })(0.92 + k * 0.67);
    }
  };
  HAUT.ferme_ble = 36;
  // Serre potagère : grande serre et bacs de plein air.
  PE.ferme_legumes = function (ctx, P, t, etat) {
    var p = (etat && etat.prog) || 0;
    parcelleCulture(ctx, P, 0.06, 0.06, 2.94, 2.94);
    var top = local(ctx, P, 2.0, 0.2, 2.8, 0.8, 13, C.alim);
    var e = P(2.4, 0.5, top); enseigne(ctx, e[0], e[1], 'alim', 8);
    serre(ctx, P, 0.2, 0.2, 1.8, 1.5, 2, 15, 'v', function () { rangs(ctx, P, 0.3, 0.3, 1.7, 1.4, 2, 4, 'v', '#4fb85a', 1.5 + p * 4, p > 0.5 ? '#ff6a4a' : null); });
    // Bacs surélevés : salades, tomates, choux.
    [[0.24, 1.76, '#62c24a', null], [1.12, 1.76, '#3f9a52', '#ff6a4a'], [2.0, 1.06, '#74d44f', '#ffc247'], [2.0, 1.9, '#4fb85a', '#b58cff']].forEach(function (b) {
      boite(ctx, P, b[0], b[1], b[0] + 0.76, b[1] + 0.86, 0, 3, C.coqueG, { sansPied: true, dessus: '#3d3430' });
      rangs(ctx, P, b[0] + 0.06, b[1] + 0.06, b[0] + 0.7, b[1] + 0.8, 3, 3, 'v', b[2], 0.8 + p * 2.6, p > 0.5 ? b[3] : null);
    });
    var f = P(1.9, 2.5); figurant(ctx, f[0], f[1], 1, '#c8f0b0');
  };
  HAUT.ferme_legumes = 36;
  // Verger sous dôme : grand dôme de verre, arbres fruitiers.
  PE.ferme_fruits = function (ctx, P, t, etat) {
    var p = (etat && etat.prog) || 0, k;
    parcelleCulture(ctx, P, 0.06, 0.06, 2.94, 2.94, '#3a4658');
    var top = local(ctx, P, 0.2, 0.2, 0.9, 0.72, 12, C.alim);
    var e = P(0.55, 0.46, top); enseigne(ctx, e[0], e[1], 'alim', 8);
    A.maison.couronne(ctx, P, 1.6, 1.62, 1.26, 0, 4);
    A.maison.pelouse(ctx, P, 1.6, 1.62, 1.2, 4, '#4fb85a');
    var arbres = [[1.2, 0.9], [2.0, 1.0], [0.8, 1.6], [1.6, 1.6], [2.4, 1.7], [1.2, 2.3], [2.0, 2.3]];
    arbres.forEach(function (a, i) {
      var q = P(a[0], a[1], 4); arbuste(ctx, q[0], q[1], 15, '#3fa85a', i);
      if (p > 0.24) for (k = 0; k < 3; k++) cercle(ctx, q[0] - 3.4 + k * 3.4, q[1] - 10 - (k % 2) * 2.6, 0.9 + p * 0.5, p > 0.6 ? '#ff8a3c' : '#ffd35a');
    });
    dome(ctx, P, 1.6, 1.62, 1.22, 4, 58, C.verre, { verre: true, nervures: 7 });
    A.voute(ctx, P, 0.9, 0.6, 1.1, 0.9, 0, 7, C.coque, 'v', { nervures: 1 });
  };
  HAUT.ferme_fruits = 62;
  // Ferme à protéines : cuves de culture transparentes, niveau rose qui monte.
  PE.ferme_porcs = function (ctx, P, t, etat) {
    var p = (etat && etat.prog) || 0;
    boite(ctx, P, 0.06, 0.06, 2.94, 2.94, 0, 2, C.coqueG, { sansPied: true, dessus: '#c9d2de' });
    var top = local(ctx, P, 0.2, 0.2, 1.3, 0.86, 14, C.alim);
    var e = P(0.75, 0.52, top); enseigne(ctx, e[0], e[1], 'alim', 8);
    var cuve = function (u, v) {
      cylindre(ctx, P, u, v, 0.37, 2, 5, C.acier);
      var b = P(u, v, 5), H = 22, hp = H * (0.2 + p * 0.7);
      // Liquide, puis verre.
      cylindre(ctx, P, u, v, 0.3, 5, 5 + hp, BIENS.porc, { dessus: nuance(BIENS.porc, 1.25) });
      lueur(ctx, b[0], b[1] - hp * 0.5, 16, BIENS.porc, 0.25);
      ctx.fillStyle = alpha(C.verre, 0.2); ctx.beginPath(); ctx.ellipse(b[0], b[1], 0.33 * RX, 0.33 * RY, 0, 0, Math.PI); ctx.lineTo(b[0] - 0.33 * RX, b[1] - H); ctx.ellipse(b[0], b[1] - H, 0.33 * RX, 0.33 * RY, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
      ligne(ctx, [b[0] - 0.2 * RX, b[1] + 3], [b[0] - 0.2 * RX, b[1] - H + 2], 'rgba(255,255,255,0.6)', 1.2);
      cylindre(ctx, P, u, v, 0.36, 5 + H, 8 + H, C.coque);
      var s = P(u, v, 8 + H); lampe(ctx, s[0], s[1], C.vert, 0.9);
    };
    cuve(2.0, 0.66); cuve(0.7, 1.6); cuve(1.6, 1.6); cuve(2.42, 1.5); cuve(1.16, 2.38); cuve(2.1, 2.34);
    tuyau(ctx, [P(1.3, 0.6, 5), P(1.7, 0.66, 5)], C.rose, 2.2);
  };
  HAUT.ferme_porcs = 44;
  // Champ de fibres : hautes tiges claires à houppes blanches, robot de récolte.
  PE.ferme_olives = function (ctx, P, t, etat) {
    var p = (etat && etat.prog) || 0, k, j;
    parcelleCulture(ctx, P, 0.06, 0.06, 2.94, 2.94);
    var top = local(ctx, P, 0.2, 0.2, 1.0, 0.76, 12, C.indus);
    var e = P(0.6, 0.48, top); enseigne(ctx, e[0], e[1], 'indus', 8);
    for (j = 0; j < 5; j++) for (k = 0; k < 9; k++) {
      var u = (j === 0 ? 1.3 : 0.3) + k * (j === 0 ? 0.18 : 0.28), v = 0.5 + j * 0.5;
      if (u > 2.8) continue;
      var q = P(u, v), H = 4 + p * 9 + ((k + j) % 3);
      ligne(ctx, q, [q[0] + 0.6, q[1] - H], '#8fcf6a', 1.1);
      if (p > 0.24) { cercle(ctx, q[0] + 0.6, q[1] - H, 1.3 + p * 0.9, p > 0.6 ? '#f4f8ee' : BIENS.olives); }
    }
    // Robot de récolte sur roues.
    var r = P(2.2, 2.56); ombre(ctx, r[0], r[1] + 1, 9, 3.4);
    boite(ctx, P, 2.0, 2.4, 2.44, 2.72, 2, 8, C.indus, { sansPied: true }); cercle(ctx, r[0] - 6, r[1] + 1, 2, '#2a3446'); cercle(ctx, r[0] + 5, r[1] + 3, 2, '#2a3446');
    lampe(ctx, r[0] + 2, r[1] - 10, C.ambre, 0.9);
  };
  HAUT.ferme_olives = 34;
  // Plantation de baies : treilles, grappes violettes.
  PE.ferme_vigne = function (ctx, P, t, etat) {
    var p = (etat && etat.prog) || 0, k, j;
    parcelleCulture(ctx, P, 0.06, 0.06, 2.94, 2.94);
    var top = local(ctx, P, 2.0, 0.2, 2.8, 0.76, 12, C.indus);
    var e = P(2.4, 0.48, top); enseigne(ctx, e[0], e[1], 'indus', 8);
    for (j = 0; j < 5; j++) {
      var v = (j === 0 ? 0.48 : 0.5 + j * 0.5), u0 = 0.24, u1 = j === 0 ? 1.8 : 2.76;
      for (k = 0; k <= 4; k++) { var u = u0 + (u1 - u0) * k / 4; ligne(ctx, P(u, v), P(u, v, 9), C.coqueG, 1); }
      ligne(ctx, P(u0, v, 9), P(u1, v, 9), '#dfe6ef', 0.8); ligne(ctx, P(u0, v, 5), P(u1, v, 5), '#dfe6ef', 0.6);
      var n = Math.round((u1 - u0) * 5);
      for (k = 0; k < n; k++) {
        var q = P(u0 + (u1 - u0) * (k + 0.5) / n, v, 6);
        verdure(ctx, q[0], q[1] - 1, 3.2, '#3fa85a', k + j);
        if (p > 0.24) { cercle(ctx, q[0] - 1, q[1] + 1.4, 1 + p * 0.5, p > 0.6 ? BIENS.raisin : '#c9a8f0'); cercle(ctx, q[0] + 1.2, q[1] + 2.2, 0.8 + p * 0.5, p > 0.6 ? nuance(BIENS.raisin, 0.8) : '#c9a8f0'); }
      }
    }
    var f = P(1.4, 2.82); figurant(ctx, f[0], f[1], 1, '#e0c8ff');
  };
  HAUT.ferme_vigne = 34;

  // Barge de pêche et cargo sont dessinés avec les marcheurs (partie 6) ; ici, la barge à quai.
  function bargeAQuai(ctx, x, y) {
    ellipse(ctx, x, y + 2, 15, 4.6, 'rgba(10,30,50,0.35)');
    poly(ctx, [[x - 14, y - 3], [x + 12, y - 3], [x + 16, y - 6], [x + 12, y + 1.5], [x - 11, y + 1.5]], C.coque);
    poly(ctx, [[x - 14, y - 3], [x + 12, y - 3], [x + 16, y - 6], [x - 12, y - 6]], '#f6f8fb');
    ctx.fillStyle = C.alim; ctx.fillRect(x - 11, y - 0.6, 22, 1.2);
    boite2(ctx, x - 6, y - 12, 9, 6, '#dfe6ef'); ctx.fillStyle = '#2f86b0'; ctx.fillRect(x - 4.6, y - 10.8, 6, 2.6);
    lampe(ctx, x + 13, y - 7, C.cyan, 0.8);
  }
  function boite2(ctx, x, y, w, h, c) {
    ctx.fillStyle = teinte(c, 0.95); ctx.fillRect(x, y, w, h);
    poly(ctx, [[x, y], [x + 2.5, y - 2], [x + w + 2.5, y - 2], [x + w, y]], teinte(c, 1.15));
    poly(ctx, [[x + w, y], [x + w + 2.5, y - 2], [x + w + 2.5, y + h - 2], [x + w, y + h]], teinte(c, 0.7));
  }
  // Mer du côté +u d'un quai (au-delà de la rive), aux couleurs du monde de la mission.
  function merDeQuai(ctx, P, t, u0, M) {
    A.sol(ctx, P, u0, 0, t, t, M.eau);
    for (var k = 0; k < t * 2; k++) { var a = P(u0 + 0.3 + (k % 2) * 0.4, 0.3 + k * 0.45); ligne(ctx, [a[0] - 4, a[1]], [a[0] + 4, a[1]], alpha(M.eauC, 0.5), 0.9); }
    poly(ctx, [P(u0 - 0.06, 0), P(u0 + 0.14, 0), P(u0 + 0.08, t * 0.4), P(u0 + 0.16, t * 0.75), P(u0 + 0.06, t), P(u0 - 0.06, t)], M.sable);
  }
  // Ponton de pêche : local, casiers, jetée et barge.
  PE.quai_peche = function (ctx, P, t, etat) {
    var M = A.monde(etat && etat.monde), k;
    merDeQuai(ctx, P, 2, 1.04, M);
    boite(ctx, P, 0.06, 0.06, 1.0, 1.94, 0, 2, C.coqueG, { sansPied: true, dessus: '#c9d2de' });
    var top = local(ctx, P, 0.14, 0.16, 0.9, 0.84, 12, C.alim);
    var e = P(0.5, 0.5, top); enseigne(ctx, e[0], e[1], 'alim', 7);
    pile(ctx, P, 0.14, 1.3, 0.9, 1.9, 'poisson', 2, 2);
    // Jetée sur pieux, feu de bout de jetée.
    for (k = 0; k < 4; k++) ligne(ctx, P(1.16 + k * 0.24, 0.86, 5), P(1.16 + k * 0.24, 0.86, -3), C.acierF, 1.6);
    boite(ctx, P, 0.96, 0.86, 1.96, 1.24, 3.4, 5.4, '#aeb9c9', { sansPied: true, dessus: '#d7dee8' });
    for (k = 0; k < 4; k++) ligne(ctx, P(1.16 + k * 0.24, 1.24, 3.4), P(1.16 + k * 0.24, 1.24, -3), C.acierF, 1.6);
    neon(ctx, P, 'v', 0.98, 1.94, 1.24, 5.6, C.cyan, 0.8);
    var m = P(1.9, 1.06, 5.4); mat(ctx, m[0], m[1], 9, C.vert);
    if (etat && etat.bateau) { var b = P(1.56, 1.6, 0); bargeAQuai(ctx, b[0], b[1]); }
  };
  HAUT.quai_peche = 30;
  // Quai des cargos : môle, grue portique, hangar de transit, conteneurs en attente.
  PE.quai_commerce = function (ctx, P, t, etat) {
    var M = A.monde(etat && etat.monde), k;
    merDeQuai(ctx, P, 3, 2.0, M);
    boite(ctx, P, 0.06, 0.06, 2.0, 2.94, 0, 2.4, C.coqueG, { sansPied: true, dessus: '#c9d2de' });
    A.quadrillage(ctx, P, 0.06, 0.06, 2.0, 2.94, 2.4, 0.5, 'rgba(80,96,124,0.25)');
    var top = local(ctx, P, 0.16, 0.16, 1.4, 1.0, 15, C.indus, { h0: 2.4 });
    var e = P(0.78, 0.58, top); enseigne(ctx, e[0], e[1], 'indus', 8);
    conteneur(ctx, P, 0.2, 1.3, 0.9, 1.62, 2.4, 9, '#4aa8ff'); conteneur(ctx, P, 0.2, 1.7, 0.9, 2.02, 2.4, 9, '#ffa53a');
    conteneur(ctx, P, 0.24, 1.48, 0.86, 1.8, 9, 15, '#ff6fb5'); conteneur(ctx, P, 0.3, 2.3, 1.0, 2.62, 2.4, 9, '#74d44f');
    // Môle qui avance dans la mer, bollards lumineux.
    boite(ctx, P, 1.96, 0.9, 2.9, 2.1, 0, 4, '#aeb9c9', { dessus: '#d7dee8' });
    for (k = 0; k < 3; k++) { var q = P(2.84, 1.0 + k * 0.5, 4); lampe(ctx, q[0], q[1] - 1, C.ambre, 0.9); }
    // Grue portique.
    ligne(ctx, P(1.6, 1.3, 2.4), P(1.6, 1.3, 30), C.indus, 2.6); ligne(ctx, P(1.6, 2.0, 2.4), P(1.6, 2.0, 30), C.indus, 2.6);
    ligne(ctx, P(1.6, 1.3, 30), P(1.6, 2.0, 30), C.indus, 2.4);
    ligne(ctx, P(1.2, 1.65, 32), P(2.8, 1.65, 32), nuance(C.indus, 0.85), 3.4); ligne(ctx, P(1.2, 1.65, 33), P(2.8, 1.65, 33), 'rgba(255,255,255,0.5)', 0.8);
    var c = P(2.4, 1.65, 31); ligne(ctx, c, [c[0], c[1] + 12], '#dfe6ef', 0.8); conteneur(ctx, P, 2.24, 1.5, 2.56, 1.8, 12, 18, '#b58cff');
    var m = P(1.6, 1.65, 33); lampe(ctx, m[0], m[1] - 2, C.rouge, 1);
    var f = P(1.3, 2.6, 2.4); figurant(ctx, f[0], f[1], 1, '#ffd08a');
  };
  HAUT.quai_commerce = 50;
  // Silo à vivres : quatre silos dont la jauge lumineuse monte avec le stock.
  PE.grenier = function (ctx, P, t, etat) {
    var n = (etat && etat.niveau) || 0;
    boite(ctx, P, 0.06, 0.06, 2.94, 2.94, 0, 2.4, C.coqueG, { sansPied: true, dessus: '#c9d2de' });
    var silo = function (u, v, plein) {
      cylindre(ctx, P, u, v, 0.56, 2.4, 34, C.coque, { anneaux: 4, dessus: false });
      dome(ctx, P, u, v, 0.56, 34, 12, C.coqueG, { nervures: 1, anneau: false });
      // Jauge : colonne sombre, niveau lumineux.
      var a = P(u - 0.2, v + 0.52, 6), H = 24;
      ctx.fillStyle = '#1f2838'; ctx.fillRect(a[0] - 1.6, a[1] - H, 3.2, H);
      if (plein > 0) { A.eclat(ctx, C.alim, 3, function () { ctx.fillStyle = C.alim; ctx.fillRect(a[0] - 1.6, a[1] - H * plein, 3.2, H * plein); }); }
      var s = P(u, v, 46); lampe(ctx, s[0], s[1], plein > 0 ? C.vert : '#5d6878', 0.9);
    };
    silo(0.82, 0.8, n >= 4 ? 1 : n >= 3 ? 0.5 : 0);
    silo(2.16, 0.86, n >= 3 ? 1 : n >= 2 ? 0.5 : 0);
    // Tour de l'élévateur et convoyeurs.
    boite(ctx, P, 1.3, 1.3, 1.74, 1.74, 2.4, 44, C.acier, { joints: 2 }); ceinture(ctx, P, 1.3, 1.3, 1.74, 1.74, 38, 41, C.alim);
    tuyau(ctx, [P(1.5, 1.5, 44), P(0.9, 0.9, 46)], C.coqueG, 2.4); tuyau(ctx, [P(1.5, 1.5, 44), P(2.1, 0.94, 46)], C.coqueG, 2.4);
    silo(0.86, 2.14, n >= 2 ? 1 : n >= 1 ? 0.5 : 0);
    tuyau(ctx, [P(1.5, 1.6, 44), P(0.94, 2.1, 46)], C.coqueG, 2.4); tuyau(ctx, [P(1.6, 1.6, 44), P(2.1, 2.1, 46)], C.coqueG, 2.4);
    silo(2.16, 2.16, n >= 1 ? (n >= 4 ? 1 : 0.6) : 0);
    var e = P(1.52, 1.52, 44); enseigne(ctx, e[0], e[1], 'alim', 6);
  };
  HAUT.grenier = 66;
  // Marché : halle sous verrière, étals de couleur, caisses selon le stock.
  PE.marche = function (ctx, P, t, etat) {
    var n = (etat && etat.niveau) || 0, k;
    boite(ctx, P, 0.06, 0.06, 1.94, 1.94, 0, 2, C.coqueG, { sansPied: true, dessus: '#d7dee8' });
    A.quadrillage(ctx, P, 0.06, 0.06, 1.94, 1.94, 2, 0.34, 'rgba(80,96,124,0.22)');
    var etals = [[0.26, 0.3, '#ff8a3c', 'fruits'], [1.06, 0.3, '#62c24a', 'legumes'], [0.26, 1.06, '#f0cc55', 'ble'], [1.06, 1.06, '#6fb6d8', 'poisson']];
    etals.forEach(function (s, i) {
      boite(ctx, P, s[0], s[1], s[0] + 0.62, s[1] + 0.5, 2, 6, '#eef2f7', { sansPied: true });
      if (n > i) { var q = P(s[0] + 0.2, s[1] + 0.26, 6); cercle(ctx, q[0], q[1] - 1, 1.5, BIENS[s[3]]); cercle(ctx, q[0] + 4, q[1] + 0.6, 1.5, nuance(BIENS[s[3]], 0.85)); cercle(ctx, q[0] + 8, q[1] + 2.2, 1.5, BIENS[s[3]]); }
      // Auvent de couleur.
      poly(ctx, [P(s[0] - 0.04, s[1] - 0.04, 13), P(s[0] + 0.66, s[1] - 0.04, 13), P(s[0] + 0.66, s[1] + 0.56, 10.5), P(s[0] - 0.04, s[1] + 0.56, 10.5)], s[2]);
      ligne(ctx, P(s[0] - 0.04, s[1] + 0.56, 10.5), P(s[0] + 0.66, s[1] + 0.56, 10.5), 'rgba(255,255,255,0.7)', 0.8);
      ligne(ctx, P(s[0], s[1] + 0.5, 6), P(s[0], s[1] + 0.5, 10.5), C.acier, 0.8); ligne(ctx, P(s[0] + 0.62, s[1] + 0.5, 6), P(s[0] + 0.62, s[1] + 0.5, 10.5), C.acier, 0.8);
    });
    var f = P(0.98, 1.74, 2); figurant(ctx, f[0], f[1], 1, '#ffd0a0'); f = P(1.74, 0.94, 2); figurant(ctx, f[0], f[1], 1, '#bfe4ff');
    for (k = 0; k < Math.min(2, n); k++) conteneur(ctx, P, 1.52, 1.5 - k * 0.0, 1.8, 1.78, 2 + k * 5, 7 + k * 5, '#ffa53a');
    voute(ctx, P, 0.1, 0.1, 1.9, 1.9, 13, 13, C.verre, 'u', { verre: true, nervures: 5 });
    [P(0.1, 0.1), P(1.9, 0.1), P(1.9, 1.9), P(0.1, 1.9)].forEach(function (q, i) { if (i !== 1) ligne(ctx, [q[0], q[1] - 2], [q[0], q[1] - 13], C.coque, 1.8); });
    var e = P(1.9, 1.0, 26); enseigne(ctx, e[0], e[1], 'alim', 0);
  };
  HAUT.marche = 40;

  // ==========================================================================
  // Extraction
  // ==========================================================================
  // Drague à silice : fosse claire au bord de l'eau, roue à godets, tas de sable.
  PE.carriere_argile = function (ctx, P, t, etat) {
    var p = (etat && etat.prog) || 0, n = Math.round(p * 4), k;
    var c = P(0.86, 1.1);
    ellipse(ctx, c[0], c[1], 40, 18, '#cdbf9c'); ellipse(ctx, c[0], c[1] + 1, 32, 13.5, '#e8dcc0'); ellipse(ctx, c[0] + 2, c[1] + 3, 20, 7, '#f6eed8');
    var top = local(ctx, P, 1.2, 0.14, 1.9, 0.7, 12, C.indus);
    var e = P(1.56, 0.42, top); enseigne(ctx, e[0], e[1], 'indus', 7);
    // Bras et roue à godets.
    var a = P(1.5, 1.2, 12), b = P(0.74, 1.1, 14);
    ligne(ctx, P(1.5, 1.2), a, C.acierF, 3); tuyau(ctx, [a, b], C.indus, 3);
    cercle(ctx, b[0], b[1], 7.6, null, C.acierF, 2); cercle(ctx, b[0], b[1], 2.2, C.acier);
    for (k = 0; k < 6; k++) { var an = k * Math.PI / 3 + 0.3; ctx.fillStyle = C.indus; ctx.fillRect(b[0] + Math.cos(an) * 7.6 - 1.6, b[1] + Math.sin(an) * 7.6 - 1.6, 3.2, 3.2); }
    for (k = 0; k < n; k++) pile(ctx, P, 1.1 + (k % 2) * 0.42, 1.34 + (k >> 1) * 0.3, 1.5 + (k % 2) * 0.42, 1.74 + (k >> 1) * 0.3, 'argile', 1);
    var f = P(0.5, 1.64); figurant(ctx, f[0], f[1], 1, '#ffe0b0');
  };
  HAUT.carriere_argile = 30;
  // Récolteur de résine : pompe à trépied, cuves ambrées qui se remplissent.
  PE.camp_bucherons = function (ctx, P, t, etat) {
    var p = (etat && etat.prog) || 0, n = Math.round(p * 4), k;
    boite(ctx, P, 0.08, 0.08, 1.92, 1.92, 0, 2, C.coqueG, { sansPied: true, dessus: '#c9d2de' });
    var top = local(ctx, P, 0.18, 0.18, 0.98, 0.78, 12, C.indus, { h0: 2 });
    var e = P(0.58, 0.48, top); enseigne(ctx, e[0], e[1], 'indus', 7);
    // Arbre à résine en perce et tuyaux d'aspiration.
    var M = A.monde('rubra'), a = P(1.5, 0.5, 2);
    A.terrain.bulbe(ctx, a[0], a[1] - 22, 7.5, M.feuillage, M.feuillageC); ligne(ctx, a, [a[0], a[1] - 16], M.tronc, 2.4);
    tuyau(ctx, [[a[0], a[1] - 9], P(1.2, 1.0, 9), P(1.0, 1.3, 9)], '#f0a23a', 2);
    cylindre(ctx, P, 0.92, 1.4, 0.24, 2, 12, C.acier, { anneaux: 1 }); var s = P(0.92, 1.4, 12); lampe(ctx, s[0], s[1], C.ambre, 0.9);
    for (k = 0; k < n; k++) { var u = 1.34 + (k % 2) * 0.34, v = 1.22 + (k >> 1) * 0.38; cylindre(ctx, P, u, v, 0.13, 2, 10, BIENS.bois, { anneaux: 2 }); var g = P(u, v, 6); lueur(ctx, g[0], g[1], 6, BIENS.bois, 0.3); }
    var f = P(0.44, 1.6, 2); figurant(ctx, f[0], f[1], 1, '#ffd08a');
  };
  HAUT.camp_bucherons = 36;
  // Butte rocheuse d'une mine.
  function butte(ctx, P, u, v, w, h, M) { var b = P(u, v); A.terrain.bloc(ctx, b[0], b[1], w, h, M.roche, M.rocheC); }
  // Mine de métal : butte, chevalement, wagonnet, lingots.
  PE.mine_fer = function (ctx, P, t, etat) {
    var p = (etat && etat.prog) || 0, n = Math.round(p * 4), M = A.monde(etat && etat.monde), k;
    butte(ctx, P, 0.62, 0.74, 24, 26, M); butte(ctx, P, 1.1, 0.5, 14, 16, M);
    // Entrée de galerie éclairée.
    var g = P(0.86, 1.0); poly(ctx, [[g[0] - 7, g[1] + 3], [g[0] - 7, g[1] - 7], [g[0], g[1] - 11], [g[0] + 7, g[1] - 7], [g[0] + 7, g[1] + 3]], '#1c2330', C.acier, 1.4); lueur(ctx, g[0], g[1] - 3, 8, C.ambre, 0.5);
    // Chevalement.
    var a = P(1.46, 0.86, 34);
    ligne(ctx, P(1.26, 0.7), a, C.acierF, 1.8); ligne(ctx, P(1.7, 0.74), a, C.acierF, 1.8); ligne(ctx, P(1.3, 1.06), a, C.acier, 2); ligne(ctx, P(1.7, 1.06), a, C.acier, 2);
    cercle(ctx, a[0], a[1], 4, null, C.indus, 1.8); cercle(ctx, a[0], a[1], 1.2, C.indus); lampe(ctx, a[0], a[1] - 6, C.rouge, 1);
    // Rails et wagonnet.
    ligne(ctx, P(0.9, 1.1), P(1.7, 1.7), C.acierF, 1); ligne(ctx, P(0.8, 1.2), P(1.6, 1.8), C.acierF, 1);
    conteneur(ctx, P, 1.16, 1.38, 1.46, 1.62, 2, 7, C.indus); var w = P(1.3, 1.5, 7); ellipse(ctx, w[0], w[1], 6, 2.6, BIENS.fer);
    for (k = 0; k < n; k++) pile(ctx, P, 0.2 + (k % 2) * 0.4, 1.36 + (k >> 1) * 0.28, 0.6 + (k % 2) * 0.4, 1.7 + (k >> 1) * 0.28, 'fer', 1);
  };
  HAUT.mine_fer = 40;
  // Mine de cristal : butte hérissée de cristaux, découpe au laser.
  PE.carriere_marbre = function (ctx, P, t, etat) {
    var p = (etat && etat.prog) || 0, n = Math.round(p * 4), M = A.monde(etat && etat.monde), k;
    butte(ctx, P, 0.7, 0.8, 26, 24, M); butte(ctx, P, 1.3, 0.56, 13, 14, M);
    var c = BIENS.marbre, g = P(0.7, 0.72);
    lueur(ctx, g[0], g[1] - 16, 22, c, 0.4);
    A.cristal(ctx, g[0] - 9, g[1] - 10, 3.4, 18, c, -3); A.cristal(ctx, g[0] + 1, g[1] - 14, 4.4, 24, c, 1); A.cristal(ctx, g[0] + 10, g[1] - 8, 3, 15, c, 4); A.cristal(ctx, g[0] - 16, g[1] - 2, 2.4, 10, c, -2);
    // Trépied du laser de découpe et son rayon.
    var a = P(1.44, 1.2, 15), cible = [g[0] + 3, g[1] - 16];
    ligne(ctx, P(1.3, 1.1), a, C.acierF, 1.4); ligne(ctx, P(1.6, 1.14), a, C.acierF, 1.4); ligne(ctx, P(1.44, 1.38), a, C.acier, 1.6);
    boite(ctx, P, 1.36, 1.12, 1.52, 1.28, 15, 19, C.indus, { sansPied: true });
    A.eclat(ctx, C.rouge, 4, function () { ligne(ctx, [a[0] - 2, a[1] - 2], cible, '#ff8a8a', 1); }); lampe(ctx, cible[0], cible[1], '#ffb0b0', 1);
    var top = local(ctx, P, 1.2, 1.46, 1.84, 1.9, 9, C.indus, { fen: false });
    var e = P(1.52, 1.68, top); enseigne(ctx, e[0], e[1], 'indus', 5);
    for (k = 0; k < n; k++) pile(ctx, P, 0.14 + (k % 2) * 0.44, 1.3 + (k >> 1) * 0.3, 0.6 + (k % 2) * 0.44, 1.72 + (k >> 1) * 0.3, 'marbre', 1);
  };
  HAUT.carriere_marbre = 40;

  // ==========================================================================
  // Ateliers
  // ==========================================================================
  // Atelier type : hall, équipement de toiture propre au métier, matières en attente à gauche,
  // voyant et fumée quand il tourne. o : { matiere, produit, toit(ctx, P, top, actif, frame) }.
  function atelier(ctx, P, etat, o) {
    var mat0 = (etat && etat.matiere) || 0, actif = etat && etat.actif, fr = (etat && etat.frame) || 0;
    boite(ctx, P, 0.06, 0.06, 1.94, 1.94, 0, 2, C.coqueG, { sansPied: true, dessus: '#c9d2de' });
    var top = local(ctx, P, 0.5, 0.16, 1.86, 1.2, 16, o.couleur || C.indus, { h0: 2, lum: actif ? C.chaud : '#6c7a92', corps: o.corps });
    if (o.toit) o.toit(ctx, P, top, actif, fr);
    var v = P(0.62, 1.2, 15); lampe(ctx, v[0], v[1], actif ? C.vert : C.rouge, 0.9);
    if (mat0 > 0) pile(ctx, P, 0.1, 1.24, 0.84, 1.9, o.matiere, mat0 * 2, 2);
    if (actif) pile(ctx, P, 1.1, 1.3, 1.84, 1.9, o.produit, 1, 2);
    var e = P(1.72, 0.3, top); enseigne(ctx, e[0], e[1], 'indus', 6, o.couleur);
  }
  function cheminee(ctx, P, u, v, h0, H, actif, fr, c) {
    tronc(ctx, P, u, v, 0.13, 0.09, h0, h0 + H, C.acier); cylindre(ctx, P, u, v, 0.1, h0 + H, h0 + H + 1.6, c || C.indus);
    var s = P(u, v, h0 + H + 2);
    if (actif) { lueur(ctx, s[0], s[1], 6, C.ambre, 0.6); vapeur(ctx, s[0], s[1] - 2, fr); }
  }
  // Atelier de céramique : four à dôme rougeoyant.
  PE.atelier_poterie = function (ctx, P, t, etat) {
    atelier(ctx, P, etat, { matiere: 'argile', produit: 'poterie', toit: function (c, Q, top, actif, fr) {
      dome(c, Q, 0.94, 0.6, 0.3, top, 9, actif ? '#ff9a5a' : C.acier, { nervures: 2 });
      if (actif) { var g = Q(0.94, 0.6, top + 4); lueur(c, g[0], g[1], 12, '#ff7a3a', 0.5); }
      cheminee(c, Q, 1.5, 0.8, top, 12, actif, fr);
    } });
  };
  HAUT.atelier_poterie = 46;
  // Atelier de mobilier : portique d'imprimante géante.
  PE.atelier_mobilier = function (ctx, P, t, etat) {
    atelier(ctx, P, etat, { matiere: 'bois', produit: 'mobilier', toit: function (c, Q, top, actif, fr) {
      ligne(c, Q(0.7, 0.4, top), Q(0.7, 0.4, top + 11), C.acierF, 1.6); ligne(c, Q(1.6, 0.4, top), Q(1.6, 0.4, top + 11), C.acierF, 1.6);
      ligne(c, Q(0.7, 0.4, top + 11), Q(1.6, 0.4, top + 11), C.indus, 2.2);
      var x = Q(0.9 + (fr ? 0.4 : 0), 0.4, top + 11); ligne(c, x, [x[0], x[1] + 6], C.coque, 1.4);
      if (actif) lampe(c, x[0], x[1] + 6.5, C.ambre, 0.9);
      boite(c, Q, 0.86, 0.6, 1.4, 1.0, top, top + 3, BIENS.mobilier, { sansPied: true });
    } });
  };
  HAUT.atelier_mobilier = 44;
  // Atelier de couture : grands rouleaux de tissu bleu sur le toit.
  PE.pressoir = function (ctx, P, t, etat) {
    atelier(ctx, P, etat, { matiere: 'olives', produit: 'huile', couleur: '#5aa0f0', toit: function (c, Q, top, actif, fr) {
      [[0.8, 0.5, '#5aa0f0'], [1.2, 0.56, '#ff8fd0'], [1.52, 0.86, '#ffd35a']].forEach(function (r, i) {
        var a = Q(r[0], r[1], top + 3), b = Q(r[0], r[1] + 0.44, top + 3);
        tuyau(c, [a, b], r[2], 5); cercle(c, b[0], b[1], 2.6, nuance(r[2], 0.8)); cercle(c, b[0], b[1], 0.9, '#fff');
        void i;
      });
      if (actif) { var s = Q(1.0, 0.9, top + 2 + fr); ligne(c, s, [s[0] + 8, s[1] + 4], '#fff', 0.8); }
    } });
  };
  HAUT.pressoir = 40;
  // Fabrique de nectar : cuves de fermentation roses, serpentin.
  PE.cave = function (ctx, P, t, etat) {
    atelier(ctx, P, etat, { matiere: 'raisin', produit: 'vin', couleur: '#e0407a', toit: function (c, Q, top, actif, fr) {
      cylindre(c, Q, 0.86, 0.56, 0.2, top, top + 12, '#f4f6fa', { anneaux: 2 }); sphere(c, Q(0.86, 0.56, top + 14)[0], Q(0.86, 0.56, top + 14)[1], 5.4, BIENS.vin);
      cylindre(c, Q, 1.36, 0.6, 0.2, top, top + 9, '#f4f6fa', { anneaux: 1 }); sphere(c, Q(1.36, 0.6, top + 11)[0], Q(1.36, 0.6, top + 11)[1], 5.4, nuance(BIENS.vin, 1.2));
      tuyau(c, [Q(0.86, 0.56, top + 8), Q(1.36, 0.6, top + 6)], C.coqueG, 1.6);
      if (actif) { var g = Q(0.86, 0.56, top + 14); lueur(c, g[0], g[1], 10, BIENS.vin, 0.45); cercle(c, g[0] - 1 + fr * 2, g[1] - 1, 0.8, 'rgba(255,255,255,0.8)'); }
    } });
  };
  HAUT.cave = 46;
  // Armurerie : hall sombre, forge à plasma, râtelier.
  PE.atelier_armes = function (ctx, P, t, etat) {
    atelier(ctx, P, etat, { matiere: 'fer', produit: 'armes', couleur: C.milit, corps: '#8a96a8', toit: function (c, Q, top, actif, fr) {
      boite(c, Q, 0.8, 0.44, 1.3, 0.94, top, top + 6, '#394356', { sansPied: true });
      var g = Q(1.05, 0.69, top + 6);
      if (actif) { lueur(c, g[0], g[1], 12, '#ff6a5a', 0.6); ellipse(c, g[0], g[1], 9, 4, '#ffb08a'); ellipse(c, g[0], g[1], 5, 2.2, '#fff4e0'); }
      else ellipse(c, g[0], g[1], 9, 4, '#1c2330');
      cheminee(c, Q, 1.6, 0.56, top, 14, actif, fr, C.milit);
    } });
  };
  HAUT.atelier_armes = 50;

  // Entrepôt : dalle à huit emplacements, bureau, portique roulant. emplacements : [bien, charges] ou null.
  PE.entrepot = function (ctx, P, t, etat) {
    var em = (etat && etat.emplacements) || [], k;
    boite(ctx, P, 0.05, 0.05, 2.95, 2.95, 0, 2.4, C.coqueG, { sansPied: true, dessus: '#c9d2de' });
    A.quadrillage(ctx, P, 0.05, 0.05, 2.95, 2.95, 2.4, 0.97, 'rgba(255,207,107,0.55)');
    var top = local(ctx, P, 0.14, 0.14, 0.9, 0.9, 13, C.indus, { h0: 2.4 });
    var e = P(0.52, 0.52, top); enseigne(ctx, e[0], e[1], 'indus', 7);
    // Portique roulant au-dessus de la dalle.
    ligne(ctx, P(1.02, 0.1, 2.4), P(1.02, 0.1, 30), C.acierF, 2); ligne(ctx, P(2.9, 0.1, 2.4), P(2.9, 0.1, 30), C.acierF, 2);
    ligne(ctx, P(1.02, 0.1, 30), P(2.9, 0.1, 30), C.indus, 2.6);
    var cases = [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]], ordre = [0, 2, 1, 3, 5, 4, 6, 7];
    for (k = 0; k < 8; k++) {
      var i = ordre[k], s = em[i];
      if (!s) continue;
      var u = cases[i][0] * 0.97 + 0.06, v = cases[i][1] * 0.97 + 0.06;
      pile(ctx, P, u + 0.06, v + 0.06, u + 0.9, v + 0.9, s[0], Math.min(4, s[1]), 2.4);
    }
    ligne(ctx, P(0.1, 2.9, 2.4), P(0.1, 2.9, 30), C.acier, 2.2); ligne(ctx, P(0.1, 2.9, 30), P(1.02, 0.1, 30), nuance(C.indus, 0.8), 2);
    var l = P(0.1, 2.9, 30); lampe(ctx, l[0], l[1] - 1, C.ambre, 1);
  };
  HAUT.entrepot = 44;

  A.batir = { enseigne: enseigne, picto: picto, rangs: rangs, serre: serre, local: local, pile: pile, atelier: atelier, cheminee: cheminee, butte: butte, boite2: boite2, bargeAQuai: bargeAQuai, parcelleCulture: parcelleCulture };
  void baie; void parabole; void trace;
})(typeof window !== 'undefined' ? window : globalThis);
