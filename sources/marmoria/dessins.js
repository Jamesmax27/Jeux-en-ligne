/* ==========================================================================
   Marmoria — dessins (tout est dessiné par le code, aucune image, aucun texte)

   Chaque dessin est une fonction paramétrée, rendue une fois dans un cache
   d'images (canvas) par zoom, puis réutilisée (cahier des charges, section 18.2).
   Isométrie 2:1, case de 64 × 32 au zoom 1, même lumière partout (du nord-ouest :
   face gauche claire, face droite sombre). Silhouettes et couleurs de toit
   distinctes par catégorie, lisibles au zoom 0,5.
   ========================================================================== */
(function (racine) {
  'use strict';

  var TW = 64, TH = 32, MARGE = 6;
  var cache = new Map();
  var DPR = 1;

  // --- Couleurs ------------------------------------------------------------
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function teinte(c, f) {
    var r = hex(c);
    var k = function (v) { return Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f))); };
    return 'rgb(' + k(r[0]) + ',' + k(r[1]) + ',' + k(r[2]) + ')';
  }
  var C = {
    herbe: ['#7fa84a', '#78a246', '#83ad4f', '#7aa548'], prairie: '#a9b64e', terre: '#b08a5a', sable: '#d8c48e',
    eau: '#3f7fb5', eauClair: '#6aa5d6', pierre: '#c9bfa8', pierreF: '#a79e88', rome: '#9c937e',
    bois: '#8a5a32', boisC: '#a8743f', chaume: '#cfa64b', tuile: '#b9573a', tuileF: '#9c4630',
    enduit: '#e8d8b6', marbre: '#efeae0', toile: '#e9dcc0', rougeToile: '#b5443a',
    vert: '#4f7a34', vertF: '#3d612a', feuillage: '#4d7d33', feuillageC: '#69a040',
    roche: '#8f8a80', rocheC: '#aaa59a', or: '#d9a93a',
    alim: '#c98a2b', eauToit: '#4a86c0', relig: '#f1ece2', divert: '#8e5aa8', admin: '#5a7397', secu: '#b03a2e', ingen: '#4f86a0'
  };

  // --- Géométrie isométrique ------------------------------------------------
  // Projection dans un dessin de t × t cases : (u, v) en cases, h en pixels de hauteur.
  function projecteur(t, haut) {
    return function (u, v, h) { return [(u - v) * TW / 2 + t * TW / 2, (u + v) * TH / 2 + haut - (h || 0)]; };
  }
  function poly(ctx, pts, fond, trait) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fond) { ctx.fillStyle = fond; ctx.fill(); }
    if (trait) { ctx.strokeStyle = trait; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function sol(ctx, P, u0, v0, u1, v1, fond, trait) { poly(ctx, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], fond, trait); }
  // Boîte (murs) : face gauche (vers +v) claire, face droite (vers +u) sombre, dessus.
  function boite(ctx, P, u0, v0, u1, v1, h0, h1, c, dessus) {
    poly(ctx, [P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, h1), P(u0, v1, h1)], teinte(c, 0.92));
    poly(ctx, [P(u1, v0, h0), P(u1, v1, h0), P(u1, v1, h1), P(u1, v0, h1)], teinte(c, 0.7));
    if (dessus !== false) poly(ctx, [P(u0, v0, h1), P(u1, v0, h1), P(u1, v1, h1), P(u0, v1, h1)], dessus || teinte(c, 1.08));
  }
  // Toit à deux pentes, faîtage parallèle à u (axe 'u') ou à v.
  function toit(ctx, P, u0, v0, u1, v1, h, hf, c, axe) {
    var d = 0.08;
    u0 -= d; v0 -= d; u1 += d; v1 += d;
    if (axe === 'v') {
      var um = (u0 + u1) / 2;
      poly(ctx, [P(u0, v0, h), P(um, v0, h + hf), P(um, v1, h + hf), P(u0, v1, h)], teinte(c, 1.05));
      poly(ctx, [P(um, v0, h + hf), P(u1, v0, h), P(u1, v1, h), P(um, v1, h + hf)], teinte(c, 0.72));
      poly(ctx, [P(u0, v1, h), P(u1, v1, h), P(um, v1, h + hf)], teinte(c, 0.85));
    } else {
      var vm = (v0 + v1) / 2;
      poly(ctx, [P(u0, v0, h), P(u1, v0, h), P(u1, vm, h + hf), P(u0, vm, h + hf)], teinte(c, 0.8));
      poly(ctx, [P(u0, vm, h + hf), P(u1, vm, h + hf), P(u1, v1, h), P(u0, v1, h)], teinte(c, 1.02));
      poly(ctx, [P(u1, v0, h), P(u1, v1, h), P(u1, vm, h + hf)], teinte(c, 0.66));
    }
  }
  function cercle(ctx, x, y, r, fond, trait) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fond) { ctx.fillStyle = fond; ctx.fill(); }
    if (trait) { ctx.strokeStyle = trait; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function ellipse(ctx, x, y, rx, ry, fond) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fond; ctx.fill();
  }
  function colonnes(ctx, P, u0, v0, u1, v1, h, n, c) {
    for (var k = 0; k < n; k++) {
      var u = u0 + (u1 - u0) * (k + 0.5) / n;
      var a = P(u, v1, 0), b = P(u, v1, h);
      ctx.fillStyle = teinte(c, 0.95); ctx.fillRect(a[0] - 2, b[1], 4, a[1] - b[1]);
      ctx.fillStyle = teinte(c, 0.75); ctx.fillRect(a[0] + 1, b[1], 1, a[1] - b[1]);
    }
    for (var k2 = 0; k2 < n; k2++) {
      var v = v0 + (v1 - v0) * (k2 + 0.5) / n;
      var a2 = P(u1, v, 0), b2 = P(u1, v, h);
      ctx.fillStyle = teinte(c, 0.78); ctx.fillRect(a2[0] - 2, b2[1], 4, a2[1] - b2[1]);
    }
  }
  // Petit hasard déterministe pour les variantes (jamais Math.random : les dessins sont stables).
  function hachage(a, b) { var h = Math.imul(a * 374761393 + b * 668265263, 1274126177); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; }

  // --- Cache ---------------------------------------------------------------
  // Renvoie { c: canvas, ox, oy, w, h } : (ox, oy) = décalage, au zoom 1, entre le coin
  // haut de l'emprise et le coin haut-gauche de l'image.
  function sprite(cle, t, haut, peindre, z) {
    var k = cle + '@' + z;
    var s = cache.get(k);
    if (s) return s;
    var w = t * TW + 2 * MARGE, h = t * TH + haut + MARGE, f = z * DPR;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * f)); c.height = Math.max(1, Math.ceil(h * f));
    var ctx = c.getContext('2d');
    ctx.scale(f, f);
    ctx.translate(MARGE, 0);
    ctx.lineJoin = 'round';
    peindre(ctx, projecteur(t, haut), t);
    s = { c: c, ox: -(t * TW / 2 + MARGE), oy: -haut, w: w, h: h };
    cache.set(k, s);
    return s;
  }
  function vider() { cache.clear(); }
  function reglerDPR(d) { if (d !== DPR) { DPR = d; vider(); } }

  // --- Sol -----------------------------------------------------------------
  function peindreHerbe(ctx, P, v) {
    sol(ctx, P, -0.02, -0.02, 1.02, 1.02, C.herbe[v & 3]); // léger débord : pas de liseré entre cases au zoom progressif
    for (var k = 0; k < 6; k++) {
      var a = hachage(v, k), b = hachage(k, v + 7);
      var p = P(0.15 + a * 0.7, 0.15 + b * 0.7);
      ctx.fillStyle = teinte(C.herbe[v & 3], k % 2 ? 0.86 : 1.12);
      ctx.fillRect(p[0], p[1], 2, 1);
    }
  }
  function peindrePrairie(ctx, P, f) {
    sol(ctx, P, -0.02, -0.02, 1.02, 1.02, teinte(C.prairie, 0.9 + f * 0.06));
    ctx.strokeStyle = teinte(C.prairie, 0.78 + f * 0.05); ctx.lineWidth = 1;
    for (var k = 1; k < 4; k++) {
      var a = P(0.12, k / 4), b = P(0.88, k / 4);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  }
  function peindreEau(ctx, P, fr) {
    sol(ctx, P, -0.02, -0.02, 1.02, 1.02, C.eau);
    ctx.strokeStyle = C.eauClair; ctx.lineWidth = 1;
    for (var k = 0; k < 2; k++) {
      var o = ((fr + k * 2) % 4) / 4;
      var a = P(0.2 + o * 0.3, 0.3 + k * 0.35), b = P(0.45 + o * 0.3, 0.3 + k * 0.35);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  }
  // Route selon ses voisins (masque nord, est, sud, ouest dans l'orientation affichée).
  function peindreRoute(ctx, P, masque, rome) {
    var c = rome ? C.rome : C.pierre, l = 0.3;
    var morceau = function (u0, v0, u1, v1) { sol(ctx, P, u0, v0, u1, v1, c); };
    morceau(0.5 - l, 0.5 - l, 0.5 + l, 0.5 + l);
    if (masque & 1) morceau(0.5 - l, 0, 0.5 + l, 0.5);
    if (masque & 2) morceau(0.5, 0.5 - l, 1, 0.5 + l);
    if (masque & 4) morceau(0.5 - l, 0.5, 0.5 + l, 1);
    if (masque & 8) morceau(0, 0.5 - l, 0.5, 0.5 + l);
    // Pavés.
    ctx.fillStyle = teinte(c, 0.82);
    for (var k = 0; k < 5; k++) { var p = P(0.3 + hachage(masque, k) * 0.4, 0.3 + hachage(k, masque) * 0.4); ctx.fillRect(p[0], p[1], 3, 1); }
  }

  // --- Objets du terrain ---------------------------------------------------
  function peindreArbre(ctx, P, v) {
    var n = 1 + (v % 2);
    for (var k = 0; k < n; k++) {
      var u = n === 1 ? 0.5 : 0.32 + k * 0.38, w = n === 1 ? 0.5 : 0.62 - k * 0.3;
      var b = P(u, w, 0);
      ellipse(ctx, b[0], b[1] + 1, 9, 4, 'rgba(40,60,20,0.35)');
      ctx.fillStyle = C.bois; ctx.fillRect(b[0] - 1.5, b[1] - 14, 3, 14);
      cercle(ctx, b[0], b[1] - 22, 11 - k * 2, C.feuillage);
      cercle(ctx, b[0] - 3, b[1] - 25, 6 - k, C.feuillageC);
      cercle(ctx, b[0] + 4, b[1] - 19, 5, teinte(C.feuillage, 0.8));
    }
  }
  function peindreRocher(ctx, P, v) {
    var b = P(0.5, 0.5, 0);
    poly(ctx, [[b[0] - 18, b[1]], [b[0] - 10, b[1] - 16 - v * 2], [b[0] + 4, b[1] - 20], [b[0] + 18, b[1] - 6], [b[0] + 12, b[1] + 4], [b[0] - 8, b[1] + 6]], C.roche);
    poly(ctx, [[b[0] - 10, b[1] - 16 - v * 2], [b[0] + 4, b[1] - 20], [b[0] + 2, b[1] - 6], [b[0] - 8, b[1] - 4]], C.rocheC);
  }

  // --- Maisons (un dessin par niveau, variantes par paramètres) -------------
  function peindreMaison(ctx, P, niv, v) {
    var murs = [C.enduit, '#e2cfa4', '#ead9bd'][v % 3];
    if (niv === 0) {
      sol(ctx, P, 0.1, 0.1, 0.9, 0.9, C.terre);
      [[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]].forEach(function (q) {
        var a = P(q[0], q[1], 0); ctx.fillStyle = C.bois; ctx.fillRect(a[0] - 1, a[1] - 7, 2, 7);
      });
      return;
    }
    if (niv <= 2) {
      var g = niv === 1 ? 0.28 : 0.18, h = niv === 1 ? 16 : 22, c = niv === 1 ? C.toile : '#efe2c4';
      sol(ctx, P, 0.08, 0.08, 0.92, 0.92, teinte(C.terre, 1.1));
      // Tente : prisme triangulaire.
      var um = 0.5;
      poly(ctx, [P(g, g, 0), P(um, g, h), P(um, 1 - g, h), P(g, 1 - g, 0)], teinte(c, 1.02));
      poly(ctx, [P(um, g, h), P(1 - g, g, 0), P(1 - g, 1 - g, 0), P(um, 1 - g, h)], teinte(c, 0.72));
      poly(ctx, [P(g, 1 - g, 0), P(1 - g, 1 - g, 0), P(um, 1 - g, h)], teinte(c, 0.86));
      if (niv === 2) {
        ctx.strokeStyle = C.rougeToile; ctx.lineWidth = 2;
        var a1 = P(g + 0.11, 1 - g, 0), b1 = P(um, 1 - g, h * 0.5);
        ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
        var a2 = P(um, 1 - g, h); cercle(ctx, a2[0], a2[1] - 2, 2, C.rougeToile);
      }
      var porte = P(um, 1 - g, 0); poly(ctx, [[porte[0] - 3, porte[1] - 1], [porte[0], porte[1] - 8], [porte[0] + 3, porte[1] - 1]], teinte(C.bois, 0.6));
      return;
    }
    if (niv <= 4) {
      var g2 = niv === 3 ? 0.2 : 0.12, hm = niv === 3 ? 11 : 14;
      sol(ctx, P, 0.06, 0.06, 0.94, 0.94, teinte(C.terre, 1.12));
      boite(ctx, P, g2, g2, 1 - g2, 1 - g2, 0, hm, C.boisC);
      toit(ctx, P, g2, g2, 1 - g2, 1 - g2, hm, niv === 3 ? 9 : 11, C.chaume, v % 2 ? 'u' : 'v');
      var d1 = P(0.5, 1 - g2, 0); ctx.fillStyle = teinte(C.bois, 0.55); ctx.fillRect(d1[0] - 2, d1[1] - 8, 4, 7);
      return;
    }
    if (niv <= 6) {
      var g3 = niv === 5 ? 0.14 : 0.08, hm2 = niv === 5 ? 14 : 24;
      sol(ctx, P, 0.04, 0.04, 0.96, 0.96, teinte(C.pierre, 1.05));
      boite(ctx, P, g3, g3, 1 - g3, 1 - g3, 0, hm2, murs);
      toit(ctx, P, g3, g3, 1 - g3, 1 - g3, hm2, 10, C.tuile, v % 2 ? 'u' : 'v');
      ctx.fillStyle = teinte(C.bois, 0.55);
      var f1 = P(0.35, 1 - g3, 0); ctx.fillRect(f1[0] - 2, f1[1] - 9, 4, 8);
      ctx.fillStyle = '#5b4632';
      var f2 = P(0.7, 1 - g3, 0); ctx.fillRect(f2[0] - 2, f2[1] - hm2 + 4, 3, 3);
      var f3 = P(1 - g3, 0.45, 0); ctx.fillRect(f3[0] - 1, f3[1] - hm2 + 5, 3, 3);
      if (niv === 6) { var f4 = P(0.35, 1 - g3, 0); ctx.fillRect(f4[0] - 2, f4[1] - hm2 + 4, 3, 3); }
      return;
    }
    // Niveaux suivants (lots 2 et 4) : immeubles et villas, plus hauts et plus clairs.
    var etages = Math.min(5, 1 + Math.floor((niv - 5) / 2));
    boite(ctx, P, 0.06, 0.06, 0.94, 0.94, 0, 10 + etages * 9, niv >= 13 ? C.marbre : murs);
    toit(ctx, P, 0.06, 0.06, 0.94, 0.94, 10 + etages * 9, 10, C.tuile, 'u');
  }

  // --- Bâtiments ------------------------------------------------------------
  var PEINTRES = {
    puits: function (ctx, P) {
      var b = P(0.5, 0.5, 0);
      sol(ctx, P, 0.15, 0.15, 0.85, 0.85, teinte(C.pierre, 1.05));
      ellipse(ctx, b[0], b[1], 13, 7, C.pierreF);
      ellipse(ctx, b[0], b[1] - 4, 13, 7, C.pierre);
      ellipse(ctx, b[0], b[1] - 4, 8, 4, '#2f5c84');
      ctx.fillStyle = C.bois; ctx.fillRect(b[0] - 11, b[1] - 22, 2, 18); ctx.fillRect(b[0] + 9, b[1] - 22, 2, 18);
      poly(ctx, [[b[0] - 14, b[1] - 20], [b[0], b[1] - 28], [b[0] + 14, b[1] - 20], [b[0], b[1] - 16]], C.tuile);
    },
    fontaine: function (ctx, P, t, etat) {
      var b = P(0.5, 0.5, 0);
      sol(ctx, P, 0.08, 0.08, 0.92, 0.92, teinte(C.pierre, 1.1));
      ellipse(ctx, b[0], b[1] + 1, 18, 9, C.pierreF);
      ellipse(ctx, b[0], b[1] - 3, 18, 9, C.marbre);
      ellipse(ctx, b[0], b[1] - 3, 14, 7, etat.actif ? C.eauClair : '#9a8f78');
      ctx.fillStyle = C.marbre; ctx.fillRect(b[0] - 2, b[1] - 18, 4, 15);
      cercle(ctx, b[0], b[1] - 19, 4, C.marbre);
      if (etat.actif) {
        ctx.strokeStyle = '#d6ecff'; ctx.lineWidth = 1.5;
        var o = etat.frame % 2 ? 2 : 0;
        ctx.beginPath(); ctx.moveTo(b[0], b[1] - 22); ctx.quadraticCurveTo(b[0] - 8 - o, b[1] - 24, b[0] - 10, b[1] - 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b[0], b[1] - 22); ctx.quadraticCurveTo(b[0] + 8 + o, b[1] - 24, b[0] + 10, b[1] - 5); ctx.stroke();
      }
    },
    reservoir: function (ctx, P, t, etat) {
      boite(ctx, P, 0.1, 0.1, 2.9, 2.9, 0, 14, C.pierre, false);
      sol(ctx, P, 0.1, 0.1, 2.9, 2.9, teinte(C.pierre, 1.12));
      poly(ctx, [P(0.4, 0.4, 14), P(2.6, 0.4, 14), P(2.6, 2.6, 14), P(0.4, 2.6, 14)], etat.plein ? C.eau : '#8c8068');
      if (etat.plein) {
        ctx.strokeStyle = C.eauClair; ctx.lineWidth = 1;
        for (var k = 0; k < 3; k++) { var a = P(0.8 + k * 0.5, 1.2 + (etat.frame % 2) * 0.2, 14), bb = P(1.3 + k * 0.5, 1.2 + (etat.frame % 2) * 0.2, 14); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(bb[0], bb[1]); ctx.stroke(); }
      }
      [[0.1, 0.1], [2.9, 0.1], [2.9, 2.9], [0.1, 2.9]].forEach(function (q) { var a = P(q[0], q[1], 14); cercle(ctx, a[0], a[1] - 2, 4, C.marbre); });
    },
    aqueduc: function (ctx, P, t, etat) {
      // Canal sur piliers ; orientation d'après les voisins (axe 'u' ou 'v').
      var axe = etat.axe, h = 22;
      if (axe === 'u') {
        boite(ctx, P, 0, 0.38, 1, 0.62, 0, h, C.pierreF, false);
        sol(ctx, P, 0, 0.38, 1, 0.62, etat.eau ? C.eau : C.pierre);
        var a = P(0.5, 0.62, 0), b = P(0.5, 0.62, h - 6);
        ctx.fillStyle = 'rgba(60,50,30,0.55)'; ctx.beginPath(); ctx.ellipse(a[0], (a[1] + b[1]) / 2 + 3, 7, 9, 0, Math.PI, 0); ctx.lineTo(a[0] + 7, a[1]); ctx.lineTo(a[0] - 7, a[1]); ctx.fill();
        poly(ctx, [P(0, 0.38, h), P(1, 0.38, h), P(1, 0.62, h), P(0, 0.62, h)], null, teinte(C.pierreF, 0.8));
      } else {
        boite(ctx, P, 0.38, 0, 0.62, 1, 0, h, C.pierreF, false);
        sol(ctx, P, 0.38, 0, 0.62, 1, etat.eau ? C.eau : C.pierre);
        var c = P(0.62, 0.5, 0), d = P(0.62, 0.5, h - 6);
        ctx.fillStyle = 'rgba(60,50,30,0.55)'; ctx.beginPath(); ctx.ellipse(c[0], (c[1] + d[1]) / 2 + 3, 7, 9, 0, Math.PI, 0); ctx.lineTo(c[0] + 7, c[1]); ctx.lineTo(c[0] - 7, c[1]); ctx.fill();
      }
    },
    barriere: function (ctx, P) {
      var a = P(0.2, 0.5, 0), b = P(0.8, 0.5, 0);
      ctx.fillStyle = C.bois; ctx.fillRect(a[0] - 1, a[1] - 12, 3, 12); ctx.fillRect(b[0] - 1, b[1] - 12, 3, 12);
      ctx.strokeStyle = '#d9c39a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a[0], a[1] - 9); ctx.lineTo(b[0], b[1] - 9); ctx.stroke();
      ctx.strokeStyle = C.secu; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a[0] + (b[0] - a[0]) * 0.33, a[1] - 9 + (b[1] - a[1]) * 0.33); ctx.lineTo(a[0] + (b[0] - a[0]) * 0.5, a[1] - 9 + (b[1] - a[1]) * 0.5); ctx.stroke();
    },
    ferme_ble: function (ctx, P, t, etat) {
      sol(ctx, P, 0, 0, 3, 3, teinte(C.terre, 0.95));
      var murs = 0.42 + 0.5 * (etat.prog || 0);
      var ble = teinte('#d8b545', 0.85 + 0.2 * (etat.prog || 0)), tige = teinte('#8aa040', 1);
      for (var r = 0; r < 6; r++) {
        sol(ctx, P, 0.15, 0.2 + r * 0.45, 2.85, 0.38 + r * 0.45, (etat.prog || 0) > 0.15 ? ble : tige);
      }
      // Ferme : petite maison et meule dans le coin nord.
      boite(ctx, P, 0.1, 0.1, 0.9, 0.9, 0, 12, C.enduit);
      toit(ctx, P, 0.1, 0.1, 0.9, 0.9, 12, 8, C.alim, 'u');
      var m = P(2.5, 0.5, 0);
      ellipse(ctx, m[0], m[1] - 6 * murs, 10, 8 * murs + 2, '#e0bf52');
    },
    // Grenier : une grande ouverture de façade laisse voir le tas de grain, et des sacs
    // s'alignent devant la porte : le remplissage se lit sans ouvrir le panneau (0 à 4).
    grenier: function (ctx, P, t, etat) {
      var n = etat.niveau || 0, hg = 3 + 17 * n / 4;
      sol(ctx, P, 0.05, 0.05, 2.95, 2.95, teinte(C.pierre, 1.0));
      boite(ctx, P, 0.25, 0.25, 2.75, 2.75, 0, 26, '#e3cf9e');
      // Ouverture (intérieur sombre), puis le grain jusqu'à la hauteur du stock.
      poly(ctx, [P(0.55, 2.75, 2), P(2.45, 2.75, 2), P(2.45, 2.75, 21), P(0.55, 2.75, 21)], '#3b2a1c');
      if (n > 0) {
        poly(ctx, [P(0.55, 2.75, 2), P(2.45, 2.75, 2), P(2.45, 2.75, hg), P(1.5, 2.75, hg + 2), P(0.55, 2.75, hg)], '#e6bd45');
        ctx.strokeStyle = '#c9982c'; ctx.lineWidth = 1;
        for (var r = 1; r < n * 2; r++) { var a = P(0.65, 2.75, 2 + r * 2), b = P(2.35, 2.75, 2 + r * 2); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      }
      // Poteaux de l'ouverture.
      ctx.fillStyle = teinte(C.bois, 0.85);
      [0.55, 1.18, 1.82, 2.45].forEach(function (u) { var a = P(u, 2.75, 0), b = P(u, 2.75, 22); ctx.fillRect(a[0] - 1.5, b[1], 3, a[1] - b[1]); });
      toit(ctx, P, 0.25, 0.25, 2.75, 2.75, 26, 18, C.alim, 'u');
      var w = P(2.75, 1.5, 0); ctx.fillStyle = teinte(C.bois, 0.6); ctx.fillRect(w[0] - 2, w[1] - 18, 5, 6);
      // Sacs devant la façade : un par quart de remplissage.
      for (var k = 0; k < n; k++) {
        var q = P(0.75 + k * 0.5, 2.9, 0);
        ellipse(ctx, q[0], q[1] - 4, 5, 5.5, '#d9c08a');
        ellipse(ctx, q[0], q[1] - 9, 2.5, 1.5, '#a8844a');
      }
    },
    // Marché : 4 cagettes alignées devant les étals, pleines ou vides : une par quart du stock.
    marche: function (ctx, P, t, etat) {
      var n = etat.niveau || 0;
      sol(ctx, P, 0.05, 0.05, 1.95, 1.95, teinte(C.pierre, 1.08));
      var couleurs = ['#c24a3a', '#e0b13c', '#3f86b8', '#5b9c45'];
      [[0.25, 0.2], [1.05, 0.2], [0.25, 0.9], [1.05, 0.9]].forEach(function (q, k) {
        boite(ctx, P, q[0] + 0.1, q[1] + 0.1, q[0] + 0.6, q[1] + 0.55, 0, 6, C.boisC);
        toit(ctx, P, q[0], q[1], q[0] + 0.7, q[1] + 0.65, 12, 5, couleurs[k], 'v');
        ctx.fillStyle = teinte(C.bois, 0.7); var a = P(q[0], q[1] + 0.65, 0); ctx.fillRect(a[0] - 1, a[1] - 12, 2, 12);
      });
      var produits = [['#e8c34a', '#d9a93a', '#f0cf72'], ['#a3c34a', '#7fa83a', '#c24a3a'], ['#e07a3a', '#e8c34a', '#c9982c'], ['#b8d45a', '#e8c34a', '#a05a2c']];
      for (var k = 0; k < 4; k++) {
        var u0 = 0.2 + k * 0.42;
        boite(ctx, P, u0, 1.62, u0 + 0.3, 1.9, 0, 6, '#9a6b3a');
        var c = P(u0 + 0.15, 1.76, 6);
        if (k < n) {
          cercle(ctx, c[0] - 3, c[1], 2.8, produits[k][0]);
          cercle(ctx, c[0] + 3, c[1], 2.8, produits[k][1]);
          cercle(ctx, c[0], c[1] - 2.5, 2.8, produits[k][2]);
        } else poly(ctx, [P(u0 + 0.04, 1.66, 6), P(u0 + 0.26, 1.66, 6), P(u0 + 0.26, 1.86, 6), P(u0 + 0.04, 1.86, 6)], '#4a3220');
      }
    },
    temple_ceres: function (ctx, P) {
      sol(ctx, P, 0.05, 0.05, 1.95, 1.95, teinte(C.marbre, 0.94));
      boite(ctx, P, 0.15, 0.15, 1.85, 1.85, 0, 4, C.marbre);
      boite(ctx, P, 0.45, 0.45, 1.55, 1.55, 4, 26, teinte(C.marbre, 0.92));
      colonnes(ctx, P, 0.25, 0.25, 1.75, 1.75, 28, 4, C.marbre);
      toit(ctx, P, 0.2, 0.2, 1.8, 1.8, 28, 12, C.relig, 'u');
      var o = P(1.8, 1.0, 34); cercle(ctx, o[0] - 3, o[1], 3, C.or);
    },
    theatre: function (ctx, P) {
      sol(ctx, P, 0.05, 0.05, 1.95, 1.95, teinte(C.pierre, 1.06));
      // Gradins en demi-cercle.
      for (var r = 0; r < 4; r++) {
        var h = 4 + r * 5, k = 0.2 + r * 0.12;
        poly(ctx, [P(k, k, h), P(1.8, k, h), P(1.8, 0.5 + k * 0.3, h), P(k, 1.8, h)], teinte(C.pierre, 1.1 - r * 0.05), teinte(C.pierreF, 0.9));
        boite(ctx, P, k, k, 1.8, 0.3 + k, h - 5, h, C.pierre, false);
      }
      sol(ctx, P, 1.0, 1.0, 1.85, 1.85, teinte(C.bois, 1.1));
      boite(ctx, P, 1.55, 1.0, 1.85, 1.85, 0, 18, C.divert);
      var d = P(1.35, 1.45, 2); cercle(ctx, d[0], d[1], 3, '#f3d24e');
    },
    colonie_acteurs: function (ctx, P) {
      sol(ctx, P, 0.05, 0.05, 2.95, 2.95, teinte(C.terre, 1.12));
      boite(ctx, P, 0.2, 0.2, 2.0, 2.0, 0, 18, '#ead9c0');
      toit(ctx, P, 0.2, 0.2, 2.0, 2.0, 18, 11, C.divert, 'u');
      boite(ctx, P, 2.15, 0.3, 2.8, 2.7, 0, 10, C.boisC);
      toit(ctx, P, 2.15, 0.3, 2.8, 2.7, 10, 6, '#c66b9a', 'v');
      // Fanions colorés sur un fil.
      ctx.strokeStyle = '#6a5040'; ctx.lineWidth = 1;
      var a = P(0.2, 2.6, 22), b = P(2.8, 2.6, 22); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ['#e6b43c', '#c24a3a', '#3f86b8', '#5b9c45', '#8e5aa8'].forEach(function (c, k) {
        var p = P(0.5 + k * 0.5, 2.6, 22); poly(ctx, [[p[0] - 3, p[1]], [p[0] + 3, p[1]], [p[0], p[1] + 6]], c);
      });
      var m = P(1.1, 2.0, 0); ctx.fillStyle = '#5b4632'; ctx.fillRect(m[0] - 3, m[1] - 10, 6, 9);
    },
    forum: function (ctx, P) {
      sol(ctx, P, 0.05, 0.05, 1.95, 1.95, teinte(C.marbre, 0.9));
      boite(ctx, P, 0.15, 0.15, 1.85, 1.85, 0, 22, '#e6e0d2');
      colonnes(ctx, P, 0.15, 0.15, 1.85, 1.85, 22, 5, C.marbre);
      toit(ctx, P, 0.1, 0.1, 1.9, 1.9, 22, 10, C.admin, 'v');
      var p = P(1.0, 1.9, 12); cercle(ctx, p[0], p[1], 3, C.or);
    },
    prefecture: function (ctx, P) {
      sol(ctx, P, 0.05, 0.05, 0.95, 0.95, teinte(C.pierre, 1.05));
      boite(ctx, P, 0.15, 0.15, 0.85, 0.85, 0, 16, '#e3d3b5');
      toit(ctx, P, 0.15, 0.15, 0.85, 0.85, 16, 9, C.secu, 'u');
      var m = P(0.85, 0.2, 25); ctx.fillStyle = '#5b4632'; ctx.fillRect(m[0], m[1] - 12, 1.5, 14);
      poly(ctx, [[m[0] + 1.5, m[1] - 12], [m[0] + 10, m[1] - 9], [m[0] + 1.5, m[1] - 6]], C.secu);
      var s = P(0.5, 0.85, 0); ellipse(ctx, s[0] + 8, s[1] - 2, 3, 2, '#6a8fb5');
    },
    ingenieur: function (ctx, P) {
      sol(ctx, P, 0.05, 0.05, 0.95, 0.95, teinte(C.terre, 1.15));
      boite(ctx, P, 0.15, 0.3, 0.75, 0.85, 0, 13, '#ddd0b4');
      toit(ctx, P, 0.15, 0.3, 0.75, 0.85, 13, 8, C.ingen, 'v');
      // Petite grue en bois.
      var a = P(0.85, 0.2, 0); ctx.strokeStyle = C.bois; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0], a[1] - 30); ctx.lineTo(a[0] - 14, a[1] - 24); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a[0] - 12, a[1] - 25); ctx.lineTo(a[0] - 12, a[1] - 12); ctx.stroke();
      ctx.fillStyle = C.pierreF; ctx.fillRect(a[0] - 15, a[1] - 12, 6, 4);
    },
    ruines: function (ctx, P, t) {
      sol(ctx, P, 0.05, 0.05, t - 0.05, t - 0.05, '#6b5a48');
      for (var k = 0; k < 4 * t * t; k++) {
        var p = P(0.2 + hachage(t, k) * (t - 0.4), 0.2 + hachage(k, t + 3) * (t - 0.4), 0);
        poly(ctx, [[p[0] - 4, p[1]], [p[0] - 1, p[1] - 5 - (k % 3) * 2], [p[0] + 4, p[1] - 1]], k % 2 ? '#3d342c' : '#57493b');
      }
    },
    gravats: function (ctx, P, t) {
      sol(ctx, P, 0.05, 0.05, t - 0.05, t - 0.05, '#9d968a');
      for (var k = 0; k < 4 * t * t; k++) {
        var p = P(0.2 + hachage(t, k) * (t - 0.4), 0.2 + hachage(k, t + 9) * (t - 0.4), 0);
        poly(ctx, [[p[0] - 5, p[1]], [p[0] - 2, p[1] - 6], [p[0] + 4, p[1] - 3], [p[0] + 5, p[1]]], k % 2 ? '#bdb4a2' : '#8a8274');
      }
    }
  };

  // Flammes animées (3 images), dessinées au-dessus des ruines d'un incendie.
  function peindreFlammes(ctx, P, t, fr) {
    PEINTRES.ruines(ctx, P, t);
    for (var k = 0; k < 2 + t * 2; k++) {
      var p = P(0.3 + hachage(k, 11) * (t - 0.6), 0.3 + hachage(17, k) * (t - 0.6), 0);
      var h = 14 + ((k + fr) % 3) * 5;
      poly(ctx, [[p[0] - 6, p[1]], [p[0] - 2, p[1] - h * 0.6], [p[0], p[1] - h], [p[0] + 3, p[1] - h * 0.55], [p[0] + 6, p[1]]], '#e9762b');
      poly(ctx, [[p[0] - 3, p[1]], [p[0], p[1] - h * 0.6], [p[0] + 3, p[1]]], '#f8d24a');
    }
    ctx.fillStyle = 'rgba(70,60,60,0.35)';
    var f = P(t / 2, t / 2, 30 + fr * 3); cercle(ctx, f[0], f[1] - 14, 10 + fr * 2, 'rgba(70,60,60,0.3)');
  }

  // --- Marcheurs ------------------------------------------------------------
  var TENUES = {
    immigrant: ['#8a6a48', '#d8c8a8'], emigrant: ['#7d7d7d', '#c8c8c8'], sansabri: ['#585450', '#9a948c'],
    livreur: ['#9a6b38', '#e0c9a0'], acheteuse: ['#4f8a3c', '#e8d8a8'], vendeuse: ['#d27c2c', '#f1e1b0'],
    prefet: ['#b03a2e', '#e8c9b0'], ingenieur: ['#3d6f9c', '#e1c8a8'], percepteur: ['#6b4a90', '#e3cdb0'],
    pretre: ['#f2efe6', '#e3cdb0'], acteur: ['#d9b13a', '#e8cdb2'], comedien: ['#d65a8c', '#e8cdb2']
  };
  function peindreMarcheur(ctx, type, pose, inverse) {
    var t = TENUES[type] || ['#888', '#ddd'], x = 10, y = 26;
    if (inverse) { ctx.translate(20, 0); ctx.scale(-1, 1); }
    ellipse(ctx, x, y, 5, 2, 'rgba(30,30,20,0.35)');
    // Jambes (2 poses de marche).
    ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 2;
    var e1 = pose ? 2 : -2;
    ctx.beginPath(); ctx.moveTo(x - 1, y - 8); ctx.lineTo(x - 1 + e1, y - 1); ctx.moveTo(x + 1, y - 8); ctx.lineTo(x + 1 - e1, y - 1); ctx.stroke();
    // Tunique.
    poly(ctx, [[x - 4, y - 7], [x - 3, y - 16], [x + 3, y - 16], [x + 4, y - 7]], t[0]);
    cercle(ctx, x, y - 19, 3, t[1]);
    // Accessoire selon le métier.
    if (type === 'livreur') { ctx.fillStyle = C.boisC; ctx.fillRect(x + 4, y - 10, 9, 6); cercle(ctx, x + 6, y - 3, 2, '#4a3828'); cercle(ctx, x + 11, y - 3, 2, '#4a3828'); ctx.fillStyle = '#e0bf52'; ctx.fillRect(x + 5, y - 13, 7, 3); }
    else if (type === 'acheteuse' || type === 'vendeuse') ellipse(ctx, x + 5, y - 12, 3, 2.5, '#b98a48');
    else if (type === 'prefet') { ctx.fillStyle = '#6a8fb5'; ctx.fillRect(x + 4, y - 12, 3, 4); }
    else if (type === 'ingenieur') { ctx.fillStyle = '#5b4632'; ctx.fillRect(x + 4, y - 16, 1.5, 8); ctx.fillRect(x + 2.5, y - 17, 5, 2); }
    else if (type === 'percepteur') cercle(ctx, x + 5, y - 11, 2, C.or);
    else if (type === 'pretre') cercle(ctx, x, y - 23, 2, C.or);
    else if (type === 'comedien' || type === 'acteur') cercle(ctx, x + 5, y - 18, 2.5, '#f6f0e0');
    else if (type === 'immigrant' || type === 'emigrant' || type === 'sansabri') ellipse(ctx, x - 5, y - 13, 3, 4, '#a08458');
  }
  function marcheur(type, pose, inverse, z) {
    var k = 'm:' + type + ':' + pose + ':' + (inverse ? 1 : 0) + '@' + z;
    var s = cache.get(k);
    if (s) return s;
    var f = z * DPR, c = document.createElement('canvas');
    c.width = Math.ceil(22 * f); c.height = Math.ceil(30 * f);
    var ctx = c.getContext('2d');
    ctx.scale(f, f);
    peindreMarcheur(ctx, type, pose, inverse);
    s = { c: c, ox: -10, oy: -26, w: 22, h: 30 };
    cache.set(k, s);
    return s;
  }

  // --- Icônes d'arrêt (au-dessus des bâtiments, sans texte) -------------------
  function peindreIcone(ctx, cause) {
    cercle(ctx, 12, 12, 11, '#fff8e8', '#7a2e22');
    ctx.fillStyle = '#7a2e22'; ctx.strokeStyle = '#7a2e22'; ctx.lineWidth = 2;
    if (cause === 'pasDeRoute') { ctx.fillRect(5, 13, 14, 4); ctx.fillStyle = '#fff8e8'; ctx.fillRect(8, 14, 3, 2); ctx.fillRect(13, 14, 3, 2); ctx.beginPath(); ctx.moveTo(5, 6); ctx.lineTo(19, 20); ctx.stroke(); }
    else if (cause === 'pasDePersonnel') { cercle(ctx, 12, 8, 3.5, '#7a2e22'); poly(ctx, [[6, 20], [8, 12], [16, 12], [18, 20]], '#7a2e22'); }
    else if (cause === 'sansEau') { ctx.beginPath(); ctx.moveTo(12, 4); ctx.quadraticCurveTo(19, 13, 12, 19); ctx.quadraticCurveTo(5, 13, 12, 4); ctx.fill(); }
    else if (cause === 'sansPreneur') { ctx.fillRect(6, 9, 12, 10); ctx.fillStyle = '#fff8e8'; ctx.fillRect(8, 11, 8, 2); }
    else if (cause === 'sansMarchandise' || cause === 'sansArtiste') { ctx.beginPath(); ctx.arc(12, 13, 6, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(7, 18); ctx.lineTo(17, 8); ctx.stroke(); }
    else { ctx.fillRect(11, 6, 2, 8); ctx.fillRect(11, 16, 2, 2); }
  }
  function icone(cause, z) {
    var k = 'i:' + cause + '@' + z, s = cache.get(k);
    if (s) return s;
    var f = z * DPR, c = document.createElement('canvas');
    c.width = Math.ceil(24 * f); c.height = Math.ceil(24 * f);
    var ctx = c.getContext('2d'); ctx.scale(f, f);
    peindreIcone(ctx, cause);
    s = { c: c, ox: -12, oy: -24, w: 24, h: 24 };
    cache.set(k, s);
    return s;
  }

  // --- Accès publics ----------------------------------------------------------
  // Hauteur réservée au-dessus de l'emprise (zoom 1), par type de dessin.
  var HAUT = { puits: 34, fontaine: 34, reservoir: 30, aqueduc: 30, barriere: 18, ferme_ble: 30, grenier: 52, marche: 30, temple_ceres: 50, theatre: 34, colonie_acteurs: 40, forum: 40, prefecture: 44, ingenieur: 40, ruines: 14, gravats: 14, incendie: 50 };

  racine.MM_DESSINS = {
    TW: TW, TH: TH,
    reglerDPR: reglerDPR,
    vider: vider,
    teinte: teinte,
    couleurs: C,
    herbe: function (v, z) { return sprite('sol:h' + v, 1, 0, function (ctx, P) { peindreHerbe(ctx, P, v); }, z); },
    prairie: function (f, z) { return sprite('sol:p' + f, 1, 0, function (ctx, P) { peindrePrairie(ctx, P, f); }, z); },
    eau: function (fr, z) { return sprite('sol:e' + fr, 1, 0, function (ctx, P) { peindreEau(ctx, P, fr); }, z); },
    route: function (masque, rome, z) { return sprite('route:' + masque + (rome ? 'r' : ''), 1, 0, function (ctx, P) { peindreRoute(ctx, P, masque, rome); }, z); },
    arbre: function (v, z) { return sprite('arbre:' + v, 1, 40, function (ctx, P) { peindreArbre(ctx, P, v); }, z); },
    rocher: function (v, z) { return sprite('rocher:' + v, 1, 26, function (ctx, P) { peindreRocher(ctx, P, v); }, z); },
    maison: function (niv, v, t, z) { return sprite('maison:' + niv + ':' + v, t, 30 + Math.max(0, niv - 4) * 8, function (ctx, P) { peindreMaison(ctx, P, niv, v); }, z); },
    batiment: function (type, t, etat, z) {
      var p = PEINTRES[type];
      if (!p) return null;
      var cle = type + ':' + (etat.cle || '');
      return sprite(cle, t, HAUT[type] || 40, function (ctx, P, tt) { p(ctx, P, tt, etat); }, z);
    },
    incendie: function (t, fr, z) { return sprite('feu:' + t + ':' + fr, t, HAUT.incendie, function (ctx, P, tt) { peindreFlammes(ctx, P, tt, fr); }, z); },
    marcheur: marcheur,
    icone: icone,
    // Tuile plate colorée (aperçu de pose, calques).
    losange: function (cle, couleur, z) { return sprite('l:' + cle, 1, 0, function (ctx, P) { sol(ctx, P, 0, 0, 1, 1, couleur, 'rgba(255,255,255,0.5)'); }, z); },
    // Dessin d'un bâtiment pour un bouton de menu (canvas de la taille demandée).
    vignette: function (type, taille, niv) {
      var c = document.createElement('canvas'), f = Math.min(2, window.devicePixelRatio || 1);
      c.width = taille * f; c.height = taille * f;
      var ctx = c.getContext('2d');
      var tt = type === 'logement' ? 1 : (racine.MM_SIM ? racine.MM_SIM.donnees().batiments[type].taille : 1);
      var haut = type === 'logement' ? 30 : (HAUT[type] || 40);
      var w = tt * TW, h = tt * TH + haut, k = Math.min(taille / w, taille / h) * 0.95 * f;
      ctx.translate((taille * f - w * k) / 2, (taille * f - h * k) / 2);
      ctx.scale(k, k);
      var P = projecteur(tt, haut);
      if (type === 'logement') peindreMaison(ctx, P, niv || 5, 0);
      else if (type === 'route') { peindreRoute(ctx, P, 10, false); }
      else if (type === 'deblayer') { peindreArbre(ctx, P, 0); ctx.strokeStyle = '#b03a2e'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(12, haut - 10); ctx.lineTo(52, haut + 26); ctx.stroke(); }
      else if (type === 'barriere') { peindreRoute(ctx, P, 10, false); PEINTRES.barriere(ctx, P); }
      else if (PEINTRES[type]) PEINTRES[type](ctx, P, tt, { actif: 1, plein: 1, frame: 0, axe: 'u', eau: 1, prog: 0.8, niveau: 3 });
      return c;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
