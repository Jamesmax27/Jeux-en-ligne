/* ==========================================================================
   Cosmoria — dessins, partie 1 : couleurs, géométrie et boîte à outils

   Tout est dessiné par le code (aucune image, aucun texte). Chaque dessin est
   une fonction paramétrée, rendue une fois dans un cache d'images par zoom, puis
   réutilisée. Isométrie 2:1, case de 64 × 32 au zoom 1, lumière du nord-ouest
   (face gauche claire, face droite sombre). Les dessins sont vectoriels : ils
   restent nets à tous les zooms et sur les écrans à haute densité.

   Les fichiers de dessins/ partagent l'objet interne CM_ART (outils, peintres) ;
   seul 07-public.js publie CM_DESSINS, lu par le rendu et l'interface.
   ========================================================================== */
(function (racine) {
  'use strict';

  var TW = 64, TH = 32, MARGE = 10;
  var cache = new Map();
  var DPR = 1;
  var ECH = 1; // échelle de l'image en cours de peinture (flous des lueurs)

  // --- Couleurs ------------------------------------------------------------
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function borne(v) { return Math.max(0, Math.min(255, Math.round(v))); }
  // f < 1 assombrit, f > 1 éclaircit vers le blanc.
  function teinte(c, f) {
    var r = hex(c);
    var k = function (v) { return borne(f >= 1 ? v + (255 - v) * (f - 1) : v * f); };
    return 'rgb(' + k(r[0]) + ',' + k(r[1]) + ',' + k(r[2]) + ')';
  }
  function versHex(r, g, b) { return '#' + [r, g, b].map(function (x) { return ('0' + borne(x).toString(16)).slice(-2); }).join(''); }
  function nuance(c, f) { var m = teinte(c, f).match(/\d+/g); return versHex(+m[0], +m[1], +m[2]); }
  function melange(a, b, t) { var x = hex(a), y = hex(b); return versHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }
  function alpha(c, a) { var r = hex(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }

  var C = {
    // Matières des bâtiments.
    coque: '#e9eef4', coqueG: '#c3ccd8', acier: '#8a96a8', acierF: '#5d6878', sombre: '#394356', noir: '#1c2330',
    verre: '#7fe0ff', verreF: '#2a7fa6', vitre: '#12303f',
    // Lumières.
    cyan: '#7df3ff', ambre: '#ffcf6b', chaud: '#ffe0a0', rouge: '#ff5d5d', vert: '#8dffb0', violet: '#c8a2ff', rose: '#ff8fd0',
    // Accents par catégorie (toits, bandeaux, enseignes).
    logement: '#ffb86b', eau: '#4aa8ff', alim: '#74d44f', indus: '#ffa53a', sante: '#35d0b0', relig: '#b58cff',
    educ: '#4fc8e8', divert: '#ff6fb5', admin: '#6f8cff', secu: '#ff5a4d', ingen: '#ffd84a', milit: '#c7483c', route: '#aab6c6',
    // Nature.
    feuille: '#3fbf7a', feuilleF: '#238a5c', terre: '#6b4a3a', or: '#ffd35a'
  };
  // Les trois mondes (climat des missions) : centre = Rubra, nord = Borée, aride = Ambre.
  var MONDES = {
    rubra: {
      sol: ['#a9644b', '#a15e46', '#b16b50', '#a56149'], solF: '#874c39', solC: '#c68266', caillou: '#7d4636',
      fertile: ['#2c8571', '#32917a', '#3a9f85'], pousse: '#9dffd0',
      eau: '#1d8ea3', eauF: '#15707f', eauC: '#6fe0e6', sable: '#d9a57f', ecume: '#f4fbff',
      roche: '#6e4a44', rocheC: '#946a5c', cristal: '#ff9bd6',
      tronc: '#4b3f7a', feuillage: '#35d6c0', feuillageC: '#9dfff0', fond: '#1a1024'
    },
    boree: {
      sol: ['#b7d0e1', '#aecadc', '#bfd6e5', '#b2cdde'], solF: '#8fb0c8', solC: '#eef8ff', caillou: '#7f9cb2',
      fertile: ['#4f9d92', '#5cb0a2', '#6cc4b4'], pousse: '#d6fff4',
      eau: '#1f5f96', eauF: '#174a78', eauC: '#8fd0ff', sable: '#e6f2f8', ecume: '#ffffff',
      roche: '#6c8298', rocheC: '#a9bfd0', cristal: '#9fe8ff',
      tronc: '#5a6f9a', feuillage: '#b58cff', feuillageC: '#ecd9ff', fond: '#0c1626'
    },
    ambre: {
      sol: ['#e2b76c', '#dbae63', '#e8bf76', '#deb267'], solF: '#bf8f48', solC: '#f6d999', caillou: '#b07a3e',
      fertile: ['#5fa257', '#6eb463', '#80c871'], pousse: '#e6ffb0',
      eau: '#21a394', eauF: '#188577', eauC: '#8ff5e2', sable: '#f3d9a0', ecume: '#fffdf2',
      roche: '#a8683c', rocheC: '#d2935a', cristal: '#7df3ff',
      tronc: '#2f8f78', feuillage: '#3fd0a4', feuillageC: '#c2ffe6', fond: '#221608'
    }
  };
  function monde(m) { return MONDES[m] || MONDES.rubra; }

  // Couleur de chaque bien (piles des entrepôts, matières des ateliers ; reprise par l'interface).
  // Les identifiants sont ceux du moteur ; voir sources/cosmoria/LEXIQUE.md (blé = céréales…).
  var BIENS = {
    ble: '#f0cc55', legumes: '#62c24a', fruits: '#ff8a3c', porc: '#e8788c', poisson: '#6fb6d8', olives: '#b7e08a',
    raisin: '#9a5ae0', argile: '#e8dcc0', bois: '#f0a23a', fer: '#8f9cae', marbre: '#8ff0ff', poterie: '#f2f2f6',
    mobilier: '#c98a4a', huile: '#5aa0f0', vin: '#e0407a', armes: '#ff6a5a'
  };
  // Forme de la pile de chaque bien : on reconnaît le bien à sa forme autant qu'à sa couleur.
  var FORME_BIEN = {
    ble: 'sacs', legumes: 'bacs', fruits: 'bacs', porc: 'futs', poisson: 'bacs', olives: 'ballots', raisin: 'bacs',
    argile: 'tas', bois: 'futs', fer: 'lingots', marbre: 'cristaux', poterie: 'caisses', mobilier: 'meubles', huile: 'ballots',
    vin: 'bonbonnes', armes: 'caisses'
  };

  // --- Géométrie isométrique ------------------------------------------------
  // Projection dans un dessin de t × t cases : (u, v) en cases, h en pixels de hauteur.
  function projecteur(t, haut) {
    return function (u, v, h) { return [(u - v) * TW / 2 + t * TW / 2, (u + v) * TH / 2 + haut - (h || 0)]; };
  }
  // Même projection, à l'échelle k (un dessin prévu pour 1 case rendu sur k cases).
  function echelle(P, k) { return function (u, v, h) { return P(u * k, v * k, (h || 0) * k); }; }
  // Rayons à l'écran d'un cercle posé au sol, de rayon r (en cases).
  var RX = TW * Math.SQRT1_2, RY = TH * Math.SQRT1_2;

  function chemin(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function poly(ctx, pts, fond, trait, l) {
    chemin(ctx, pts);
    if (fond) { ctx.fillStyle = fond; ctx.fill(); }
    if (trait) { ctx.strokeStyle = trait; ctx.lineWidth = l || 1; ctx.stroke(); }
  }
  function ligne(ctx, a, b, c, l) { ctx.strokeStyle = c; ctx.lineWidth = l || 1; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  function trace(ctx, pts, c, l) {
    ctx.strokeStyle = c; ctx.lineWidth = l || 1; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  function cercle(ctx, x, y, r, fond, trait, l) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fond) { ctx.fillStyle = fond; ctx.fill(); }
    if (trait) { ctx.strokeStyle = trait; ctx.lineWidth = l || 1; ctx.stroke(); }
  }
  function ellipse(ctx, x, y, rx, ry, fond, trait, l) {
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
    if (fond) { ctx.fillStyle = fond; ctx.fill(); }
    if (trait) { ctx.strokeStyle = trait; ctx.lineWidth = l || 1; ctx.stroke(); }
  }
  function sol(ctx, P, u0, v0, u1, v1, fond, trait) { poly(ctx, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], fond, trait); }
  function dalle(ctx, P, u0, v0, u1, v1, h, fond, trait) { poly(ctx, [P(u0, v0, h), P(u1, v0, h), P(u1, v1, h), P(u0, v1, h)], fond, trait); }
  // Petit hasard déterministe pour les variantes (jamais Math.random : les dessins sont stables).
  function hachage(a, b) { var h = Math.imul(a * 374761393 + b * 668265263, 1274126177); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; }

  // Dégradés.
  function degV(ctx, y0, y1, c0, c1) { var g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  function degH(ctx, x0, x1, arrets) { var g = ctx.createLinearGradient(x0, 0, x1, 0); arrets.forEach(function (a) { g.addColorStop(a[0], a[1]); }); return g; }
  function degR(ctx, x, y, r, arrets, x0, y0) { var g = ctx.createRadialGradient(x0 === undefined ? x : x0, y0 === undefined ? y : y0, 0, x, y, r); arrets.forEach(function (a) { g.addColorStop(a[0], a[1]); }); return g; }

  // --- Lumières --------------------------------------------------------------
  // Halo doux (lampe, cœur d'un noyau, hologramme).
  function lueur(ctx, x, y, r, c, a) {
    ctx.fillStyle = degR(ctx, x, y, r, [[0, alpha(c, a === undefined ? 0.55 : a)], [1, alpha(c, 0)]]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // Point lumineux : halo, puis cœur presque blanc.
  function lampe(ctx, x, y, c, r) {
    r = r || 1.2;
    lueur(ctx, x, y, r * 3.6, c, 0.5);
    cercle(ctx, x, y, r, c);
    cercle(ctx, x, y, r * 0.5, 'rgba(255,255,255,0.9)');
  }
  // Remplit la forme courante avec un éclat (ombre portée colorée du canvas).
  function eclat(ctx, c, flou, peindre) {
    ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = flou * ECH; peindre(); ctx.restore();
  }

  // --- Volumes ---------------------------------------------------------------
  // Mur : quadrilatère vertical [bas gauche, bas droite, haut droite, haut gauche], dégradé du haut vers le bas.
  function mur(ctx, pts, c, f0, f1) {
    var y0 = Math.min(pts[2][1], pts[3][1]), y1 = Math.max(pts[0][1], pts[1][1]);
    poly(ctx, pts, degV(ctx, y0, y1, teinte(c, f0), teinte(c, f1)));
  }
  // Boîte : face gauche (vers +v) claire, face droite (vers +u) sombre, dessus. Options : dessus
  // (couleur, ou false), joints (nombre de panneaux par face), sansPied (pas d'ombre au pied).
  function boite(ctx, P, u0, v0, u1, v1, h0, h1, c, o) {
    o = o || {};
    var H = h1 - h0, k, f;
    mur(ctx, [P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, h1), P(u0, v1, h1)], c, 0.99, 0.84);
    mur(ctx, [P(u1, v1, h0), P(u1, v0, h0), P(u1, v0, h1), P(u1, v1, h1)], c, 0.76, 0.6);
    if (H >= 6 && !o.sansPied) {
      var e = Math.min(2.4, H * 0.12);
      poly(ctx, [P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, h0 + e), P(u0, v1, h0 + e)], 'rgba(20,24,40,0.2)');
      poly(ctx, [P(u1, v0, h0), P(u1, v1, h0), P(u1, v1, h0 + e), P(u1, v0, h0 + e)], 'rgba(20,24,40,0.26)');
    }
    if (o.joints && H >= 5) {
      for (k = 1; k < o.joints; k++) {
        f = k / o.joints;
        ligne(ctx, P(u0 + (u1 - u0) * f, v1, h0), P(u0 + (u1 - u0) * f, v1, h1), 'rgba(40,50,70,0.2)', 0.6);
        ligne(ctx, P(u1, v0 + (v1 - v0) * f, h0), P(u1, v0 + (v1 - v0) * f, h1), 'rgba(20,26,40,0.24)', 0.6);
      }
    }
    if (o.dessus !== false) poly(ctx, [P(u0, v0, h1), P(u1, v0, h1), P(u1, v1, h1), P(u0, v1, h1)], o.dessus || teinte(c, 1.12));
    if (H >= 4) {
      ligne(ctx, P(u0, v1, h1), P(u1, v1, h1), 'rgba(255,255,255,0.6)', 0.8);
      ligne(ctx, P(u1, v1, h1), P(u1, v0, h1), 'rgba(255,255,255,0.28)', 0.8);
      ligne(ctx, P(u1, v1, h0), P(u1, v1, h1), 'rgba(255,255,255,0.16)', 0.7);
    }
  }
  // Module préfabriqué : boîte au toit chanfreiné (le dessus est en retrait de d, relevé de e).
  // Silhouette de base des constructions de la colonie. Options : toit (couleur du dessus), joints.
  function module(ctx, P, u0, v0, u1, v1, h0, h1, c, o) {
    o = o || {};
    var d = o.d === undefined ? 0.1 : o.d, e = o.e === undefined ? 4 : o.e, ht = h1 + e;
    boite(ctx, P, u0, v0, u1, v1, h0, h1, c, { dessus: false, joints: o.joints, sansPied: o.sansPied });
    var toitC = o.toit || c;
    // Pans du chanfrein : arrière (nord, ouest) puis avant (gauche, droite).
    poly(ctx, [P(u0, v0, h1), P(u1, v0, h1), P(u1 - d, v0 + d, ht), P(u0 + d, v0 + d, ht)], teinte(toitC, 0.86));
    poly(ctx, [P(u0, v0, h1), P(u0, v1, h1), P(u0 + d, v1 - d, ht), P(u0 + d, v0 + d, ht)], teinte(toitC, 0.94));
    poly(ctx, [P(u0, v1, h1), P(u1, v1, h1), P(u1 - d, v1 - d, ht), P(u0 + d, v1 - d, ht)], teinte(toitC, 1.04));
    poly(ctx, [P(u1, v1, h1), P(u1, v0, h1), P(u1 - d, v0 + d, ht), P(u1 - d, v1 - d, ht)], teinte(toitC, 0.7));
    poly(ctx, [P(u0 + d, v0 + d, ht), P(u1 - d, v0 + d, ht), P(u1 - d, v1 - d, ht), P(u0 + d, v1 - d, ht)], teinte(toitC, 1.14));
    ligne(ctx, P(u0, v1, h1), P(u1, v1, h1), 'rgba(255,255,255,0.5)', 0.8);
    ligne(ctx, P(u0 + d, v1 - d, ht), P(u1 - d, v1 - d, ht), 'rgba(255,255,255,0.55)', 0.8);
    ligne(ctx, P(u1 - d, v1 - d, ht), P(u1 - d, v0 + d, ht), 'rgba(255,255,255,0.25)', 0.8);
    return ht;
  }
  // Voûte (demi-cylindre couché) : faîtage parallèle à u (axe 'u') ou à v. H : hauteur de la voûte
  // au-dessus de h0. Options : verre (voûte translucide : dessiner l'intérieur avant), nervures.
  function voute(ctx, P, u0, v0, u1, v1, h0, H, c, axe, o) {
    o = o || {};
    var n = 10, k, a0, a1, pts = [], verre = o.verre;
    var surU = axe !== 'v'; // la section court le long de v
    var m0 = surU ? v0 : u0, m1 = surU ? v1 : u1, mm = (m0 + m1) / 2, r = (m1 - m0) / 2;
    var pt = function (long, a) { var s = mm - r * Math.cos(a), h = h0 + H * Math.sin(a); return surU ? P(long, s, h) : P(s, long, h); };
    var l0 = surU ? u0 : v0, l1 = surU ? u1 : v1;
    for (k = 0; k < n; k++) {
      a0 = Math.PI * k / n; a1 = Math.PI * (k + 1) / n;
      // Éclairage : le sommet et le côté gauche de l'écran sont clairs.
      var am = (a0 + a1) / 2, lum = surU ? 0.62 + 0.5 * Math.sin(am) * (0.55 + 0.45 * (am / Math.PI)) : 0.56 + 0.5 * Math.sin(am) * (1 - 0.5 * (am / Math.PI));
      var q = [pt(l0, a0), pt(l1, a0), pt(l1, a1), pt(l0, a1)];
      if (verre) poly(ctx, q, alpha(c, 0.16 + 0.22 * Math.sin(am)));
      else poly(ctx, q, teinte(c, Math.min(1.25, lum + 0.25)));
    }
    // Pignon visible (côté +u pour l'axe u, côté +v pour l'axe v).
    for (k = 0; k <= n; k++) pts.push(pt(l1, Math.PI * k / n));
    poly(ctx, pts, verre ? alpha(c, 0.3) : teinte(c, surU ? 0.66 : 0.9));
    var nn = o.nervures === undefined ? 4 : o.nervures, tr = verre ? 'rgba(255,255,255,0.55)' : 'rgba(30,40,60,0.22)';
    for (k = 0; k <= nn; k++) {
      var L = l0 + (l1 - l0) * k / nn, arc = [];
      for (var j = 0; j <= n; j++) arc.push(pt(L, Math.PI * j / n));
      trace(ctx, arc, tr, k === nn || k === 0 ? 1 : 0.7);
    }
    ligne(ctx, pt(l0, Math.PI / 2), pt(l1, Math.PI / 2), verre ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)', 0.9);
    if (verre) ligne(ctx, pt(l0, Math.PI * 0.72), pt(l1, Math.PI * 0.72), 'rgba(255,255,255,0.35)', 2);
  }
  // Cylindre debout (cuve, silo, tour). Options : dessus (couleur ou false), anneaux (cerclages).
  function cylindre(ctx, P, u, v, r, h0, h1, c, o) {
    o = o || {};
    var a = P(u, v, h0), b = P(u, v, h1), rx = r * RX, ry = r * RY, k;
    ctx.beginPath();
    ctx.ellipse(a[0], a[1], rx, ry, 0, 0, Math.PI);
    ctx.lineTo(b[0] - rx, b[1]);
    ctx.ellipse(b[0], b[1], rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = degH(ctx, a[0] - rx, a[0] + rx, [[0, teinte(c, 0.92)], [0.28, teinte(c, 1.14)], [0.55, teinte(c, 0.9)], [1, teinte(c, 0.55)]]);
    ctx.fill();
    for (k = 1; k <= (o.anneaux || 0); k++) {
      var y = a[1] + (b[1] - a[1]) * k / (o.anneaux + 1);
      ctx.strokeStyle = 'rgba(20,30,50,0.28)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(a[0], y, rx, ry, 0, 0, Math.PI); ctx.stroke();
    }
    if (o.dessus !== false) {
      ellipse(ctx, b[0], b[1], rx, ry, o.dessus || teinte(c, 1.16));
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(b[0], b[1], rx, ry, 0, Math.PI * 0.15, Math.PI * 0.95); ctx.stroke();
    }
  }
  // Tronc de cône debout (tuyère, tour de refroidissement, fusée).
  function tronc(ctx, P, u, v, r0, r1, h0, h1, c, o) {
    o = o || {};
    var a = P(u, v, h0), b = P(u, v, h1);
    ctx.beginPath();
    ctx.ellipse(a[0], a[1], r0 * RX, r0 * RY, 0, 0, Math.PI);
    ctx.lineTo(b[0] - r1 * RX, b[1]);
    ctx.ellipse(b[0], b[1], Math.max(0.01, r1 * RX), Math.max(0.01, r1 * RY), 0, Math.PI, 0, true);
    ctx.closePath();
    var R = Math.max(r0, r1) * RX;
    ctx.fillStyle = degH(ctx, a[0] - R, a[0] + R, [[0, teinte(c, 0.92)], [0.3, teinte(c, 1.14)], [0.58, teinte(c, 0.9)], [1, teinte(c, 0.55)]]);
    ctx.fill();
    if (o.dessus !== false && r1 > 0.01) ellipse(ctx, b[0], b[1], r1 * RX, r1 * RY, o.dessus || teinte(c, 1.16));
  }
  // Dôme posé au sol : centre (u, v), rayon r (cases), hauteur H (pixels) au-dessus de h0.
  // Options : verre (dôme translucide : peindre l'intérieur avant), nervures, anneau.
  function dome(ctx, P, u, v, r, h0, H, c, o) {
    o = o || {};
    var b = P(u, v, h0), rx = r * RX, ry = r * RY, k;
    var forme = function () { ctx.beginPath(); ctx.ellipse(b[0], b[1], rx, H, 0, Math.PI, 0); ctx.ellipse(b[0], b[1], rx, ry, 0, 0, Math.PI); ctx.closePath(); };
    forme();
    if (o.verre) {
      ctx.fillStyle = degR(ctx, b[0], b[1] - H * 0.2, rx * 1.25, [[0, alpha(c, 0.1)], [0.55, alpha(c, 0.24)], [1, alpha(nuance(c, 0.6), 0.5)]], b[0] - rx * 0.4, b[1] - H * 0.75);
      ctx.fill();
    } else {
      ctx.fillStyle = degR(ctx, b[0], b[1] - H * 0.2, rx * 1.3, [[0, teinte(c, 1.3)], [0.4, teinte(c, 1.04)], [1, teinte(c, 0.55)]], b[0] - rx * 0.42, b[1] - H * 0.72);
      ctx.fill();
    }
    var trait = o.verre ? 'rgba(255,255,255,0.5)' : 'rgba(30,40,60,0.2)';
    var nn = o.nervures === undefined ? 3 : o.nervures;
    ctx.save(); forme(); ctx.clip();
    for (k = 1; k <= nn; k++) {
      var f = k / (nn + 1);
      ctx.strokeStyle = trait; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.ellipse(b[0], b[1], rx * Math.abs(1 - 2 * f) + 0.01, H, 0, Math.PI, 0); ctx.stroke();
    }
    if (o.anneau !== false) {
      var s = 0.5, cs = Math.sqrt(1 - s * s);
      ctx.strokeStyle = trait; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.ellipse(b[0], b[1] - H * s, rx * cs, ry * cs, 0, 0, Math.PI); ctx.stroke();
    }
    // Reflet : croissant clair en haut à gauche.
    ctx.strokeStyle = o.verre ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1.2, H * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(b[0], b[1], rx * 0.74, H * 0.8, 0, Math.PI * 1.12, Math.PI * 1.4); ctx.stroke();
    ctx.restore();
    // Couronne de base et contour.
    ctx.strokeStyle = o.verre ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(b[0], b[1], rx, H, 0, Math.PI, 0); ctx.stroke();
    if (o.verre) { ctx.strokeStyle = teinte(C.coqueG, 0.9); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(b[0], b[1], rx, ry, 0, 0, Math.PI); ctx.stroke(); }
  }
  // Sphère (réservoir, boule d'antenne, planète d'un monument).
  function sphere(ctx, x, y, r, c) {
    ctx.fillStyle = degR(ctx, x, y, r * 1.2, [[0, teinte(c, 1.4)], [0.45, teinte(c, 1.02)], [1, teinte(c, 0.5)]], x - r * 0.4, y - r * 0.45);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // --- Détails de façade -------------------------------------------------------
  // Point d'une face : 'v' = face gauche (v fixe, on court le long de u) ; 'u' = face droite.
  function surFace(P, face, a, fixe, h) { return face === 'v' ? P(a, fixe, h) : P(fixe, a, h); }
  // Rangée de n fenêtres éclairées. c : couleur de la lumière (chaude par défaut).
  function fenetres(ctx, P, face, a0, a1, fixe, h0, h1, n, c) {
    c = c || C.chaud;
    var pas = (a1 - a0) / n, k;
    for (k = 0; k < n; k++) {
      var s0 = a0 + pas * (k + 0.2), s1 = a0 + pas * (k + 0.8);
      var q = [surFace(P, face, s0, fixe, h0), surFace(P, face, s1, fixe, h0), surFace(P, face, s1, fixe, h1), surFace(P, face, s0, fixe, h1)];
      poly(ctx, q, face === 'v' ? c : nuance(c, 0.78));
      ligne(ctx, q[3], q[2], 'rgba(255,255,255,0.7)', 0.5);
    }
  }
  // Baie vitrée sombre à reflets (hublot long, verrière de façade).
  function baie(ctx, P, face, a0, a1, fixe, h0, h1, c) {
    c = c || C.verreF;
    var q = [surFace(P, face, a0, fixe, h0), surFace(P, face, a1, fixe, h0), surFace(P, face, a1, fixe, h1), surFace(P, face, a0, fixe, h1)];
    poly(ctx, q, degV(ctx, q[3][1], q[0][1], teinte(c, face === 'v' ? 1.25 : 0.95), teinte(c, face === 'v' ? 0.8 : 0.6)));
    var m = function (f, g) { return [q[0][0] + (q[1][0] - q[0][0]) * f + (q[3][0] - q[0][0]) * g, q[0][1] + (q[1][1] - q[0][1]) * f + (q[3][1] - q[0][1]) * g]; };
    poly(ctx, [m(0.12, 1), m(0.3, 1), m(0.16, 0), m(0, 0)], 'rgba(255,255,255,0.22)');
    poly(ctx, q, null, 'rgba(255,255,255,0.5)', 0.5);
  }
  // Bandeau de couleur sur une face (repère de la catégorie du bâtiment).
  function bandeau(ctx, P, face, a0, a1, fixe, h0, h1, c) {
    poly(ctx, [surFace(P, face, a0, fixe, h0), surFace(P, face, a1, fixe, h0), surFace(P, face, a1, fixe, h1), surFace(P, face, a0, fixe, h1)], face === 'v' ? c : nuance(c, 0.72));
  }
  // Ceinture de couleur sur les deux faces visibles d'une boîte.
  function ceinture(ctx, P, u0, v0, u1, v1, h0, h1, c) {
    bandeau(ctx, P, 'v', u0, u1, v1, h0, h1, c);
    bandeau(ctx, P, 'u', v0, v1, u1, h0, h1, c);
  }
  // Bandeau lumineux (néon) sur une face.
  function neon(ctx, P, face, a0, a1, fixe, h, c, l) {
    var a = surFace(P, face, a0, fixe, h), b = surFace(P, face, a1, fixe, h);
    eclat(ctx, c, 3, function () { ligne(ctx, a, b, c, l || 1.2); });
    ligne(ctx, a, b, 'rgba(255,255,255,0.7)', (l || 1.2) * 0.4);
  }
  // Sas d'entrée : cadre clair, porte sombre, voyant au-dessus.
  function sas(ctx, P, face, a0, a1, fixe, h, c) {
    var q = [surFace(P, face, a0, fixe, 0), surFace(P, face, a1, fixe, 0), surFace(P, face, a1, fixe, h), surFace(P, face, a0, fixe, h)];
    poly(ctx, q, face === 'v' ? '#2a3446' : '#1f2838', teinte(C.acier, 1.1), 0.9);
    var am = (a0 + a1) / 2;
    ligne(ctx, surFace(P, face, am, fixe, 0), surFace(P, face, am, fixe, h), 'rgba(160,180,210,0.5)', 0.6);
    var v = surFace(P, face, am, fixe, h + 1.6);
    lampe(ctx, v[0], v[1], c || C.cyan, 0.9);
  }

  // --- Équipements ---------------------------------------------------------------
  // Mât avec, au choix, un feu (couleur) ; allume : feu allumé (clignote d'une image à l'autre).
  function mat(ctx, x, y, h, feu, allume, c) {
    ligne(ctx, [x, y], [x, y - h], c || C.acier, 1.1);
    ligne(ctx, [x - 0.3, y], [x - 0.3, y - h], 'rgba(255,255,255,0.4)', 0.4);
    if (feu) { if (allume !== false && allume !== 0) lampe(ctx, x, y - h, feu, 1.1); else cercle(ctx, x, y - h, 1, nuance(feu, 0.45)); }
  }
  // Antenne parabolique tournée vers le haut à gauche.
  function parabole(ctx, x, y, r, c) {
    c = c || C.coque;
    ligne(ctx, [x, y], [x, y - r * 0.9], C.acierF, 1.4);
    ctx.save(); ctx.translate(x, y - r * 1.1); ctx.rotate(-0.5);
    ctx.fillStyle = degV(ctx, -r * 0.5, r * 0.5, teinte(c, 1.1), teinte(c, 0.62));
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.46, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.46, 0, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = teinte(c, 0.5); ctx.beginPath(); ctx.ellipse(0, r * 0.05, r * 0.72, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ligne(ctx, [0, 0], [-r * 0.1, -r * 0.8], C.acier, 0.8);
    ctx.restore();
    cercle(ctx, x - r * 0.48, y - r * 1.85, 0.9, C.ambre);
  }
  // Panneau solaire incliné : bord arrière (v0) relevé à h1, bord avant (v1) à h0.
  function panneau(ctx, P, u0, v0, u1, v1, h0, h1, n) {
    var a = P(u0, v0, h1), b = P(u1, v0, h1), c = P(u1, v1, h0), d = P(u0, v1, h0), k;
    ligne(ctx, P((u0 + u1) / 2, v0, 0), P((u0 + u1) / 2, v0, h1), C.acierF, 1.2);
    poly(ctx, [a, b, c, d], degV(ctx, a[1], d[1], '#2b4f9e', '#16254f'), '#cfd8e6', 0.7);
    n = n || 3;
    for (k = 1; k < n; k++) { var f = k / n; ligne(ctx, [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], [d[0] + (c[0] - d[0]) * f, d[1] + (c[1] - d[1]) * f], 'rgba(160,200,255,0.4)', 0.5); }
    ligne(ctx, [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2], [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], 'rgba(160,200,255,0.4)', 0.5);
    poly(ctx, [[a[0] + (b[0] - a[0]) * 0.1, a[1] + (b[1] - a[1]) * 0.1], [a[0] + (b[0] - a[0]) * 0.32, a[1] + (b[1] - a[1]) * 0.32], [d[0] + (c[0] - d[0]) * 0.2, d[1] + (c[1] - d[1]) * 0.2], [d[0], d[1]]], 'rgba(255,255,255,0.14)');
  }
  // Tuyau : trait épais sombre, reflet clair dessus.
  function tuyau(ctx, pts, c, l) {
    l = l || 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    trace(ctx, pts, teinte(c, 0.55), l + 0.8);
    trace(ctx, pts, c, l);
    trace(ctx, pts.map(function (p) { return [p[0] - l * 0.18, p[1] - l * 0.22]; }), 'rgba(255,255,255,0.45)', l * 0.3);
  }
  // Conteneur nervuré (entrepôts, quais, convois).
  function conteneur(ctx, P, u0, v0, u1, v1, h0, h1, c) {
    boite(ctx, P, u0, v0, u1, v1, h0, h1, c, { sansPied: true });
    var n = Math.max(2, Math.round((u1 - u0) * 9)), m = Math.max(2, Math.round((v1 - v0) * 9)), k;
    for (k = 1; k < n; k++) ligne(ctx, P(u0 + (u1 - u0) * k / n, v1, h0 + 0.6), P(u0 + (u1 - u0) * k / n, v1, h1 - 0.6), 'rgba(0,0,0,0.16)', 0.5);
    for (k = 1; k < m; k++) ligne(ctx, P(u1, v0 + (v1 - v0) * k / m, h0 + 0.6), P(u1, v0 + (v1 - v0) * k / m, h1 - 0.6), 'rgba(0,0,0,0.2)', 0.5);
  }
  // Socle de fondation : plaque claire biseautée sous un bâtiment (m : retrait en cases).
  function socle(ctx, P, t, m, c, h) {
    m = m === undefined ? 0.04 : m; h = h || 2; c = c || C.coqueG;
    boite(ctx, P, m, m, t - m, t - m, 0, h, c, { sansPied: true, dessus: teinte(c, 1.06) });
    return h;
  }
  // Dallage quadrillé sur une plaque à la hauteur h.
  function quadrillage(ctx, P, u0, v0, u1, v1, h, pas, c) {
    var k;
    for (k = Math.ceil(u0 / pas) * pas; k < u1 - 1e-6; k += pas) if (k > u0 + 1e-6) ligne(ctx, P(k, v0, h), P(k, v1, h), c, 0.5);
    for (k = Math.ceil(v0 / pas) * pas; k < v1 - 1e-6; k += pas) if (k > v0 + 1e-6) ligne(ctx, P(u0, k, h), P(u1, k, h), c, 0.5);
  }
  // Marquage d'aire de pose : cercle et croix peints au sol.
  function aire(ctx, P, u, v, r, h, c) {
    var b = P(u, v, h);
    ctx.strokeStyle = c; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(b[0], b[1], r * RX, r * RY, 0, 0, Math.PI * 2); ctx.stroke();
    ligne(ctx, P(u - r * 0.5, v, h), P(u + r * 0.5, v, h), c, 1.2);
    ligne(ctx, P(u, v - r * 0.5, h), P(u, v + r * 0.5, h), c, 1.2);
  }
  // Hologramme : cône de lumière et forme flottante. forme : 'anneau', 'losange', 'etoile', 'globe'.
  function hologramme(ctx, x, y, h, c, forme, r) {
    r = r || h * 0.3;
    ctx.fillStyle = degV(ctx, y - h, y, alpha(c, 0.02), alpha(c, 0.34));
    ctx.beginPath(); ctx.moveTo(x - 1.5, y); ctx.lineTo(x + 1.5, y); ctx.lineTo(x + r, y - h); ctx.lineTo(x - r, y - h); ctx.closePath(); ctx.fill();
    var cy = y - h - r * 0.4;
    lueur(ctx, x, cy, r * 2.2, c, 0.4);
    ctx.strokeStyle = c; ctx.fillStyle = alpha(c, 0.35); ctx.lineWidth = 1;
    if (forme === 'losange') { poly(ctx, [[x, cy - r], [x + r * 0.7, cy], [x, cy + r], [x - r * 0.7, cy]], alpha(c, 0.4), c, 0.9); }
    else if (forme === 'etoile') { for (var k = 0; k < 4; k++) { var a = k * Math.PI / 4; ligne(ctx, [x - Math.cos(a) * r, cy - Math.sin(a) * r], [x + Math.cos(a) * r, cy + Math.sin(a) * r], c, 0.9); } }
    else if (forme === 'globe') { cercle(ctx, x, cy, r, alpha(c, 0.3), c, 0.9); ctx.beginPath(); ctx.ellipse(x, cy, r, r * 0.35, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x, cy, r * 0.4, r, 0, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.beginPath(); ctx.ellipse(x, cy, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x, cy, r * 0.5, r * 0.2, 0, 0, Math.PI * 2); ctx.fill(); }
    cercle(ctx, x, y, 1.6, c);
  }
  // Touffe de verdure (jardins, serres, dômes) : masses rondes, reflet clair.
  function verdure(ctx, x, y, r, c, g) {
    c = c || C.feuille;
    var n = 3 + Math.floor(hachage(Math.round(x * 7), Math.round(y * 5) + (g || 0)) * 2);
    for (var k = 0; k < n; k++) {
      var a = hachage(k + 3, Math.round(x + y) + (g || 0)) * 6.28, d = r * 0.42 * hachage(k + 9, Math.round(x * 3));
      var px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.6;
      ctx.fillStyle = degR(ctx, px, py, r * 0.8, [[0, teinte(c, 1.3)], [1, teinte(c, 0.72)]], px - r * 0.25, py - r * 0.3);
      ctx.beginPath(); ctx.arc(px, py, r * 0.62, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Petit arbre de serre ou de jardin : tronc et houppier.
  function arbuste(ctx, x, y, h, c, g) {
    ligne(ctx, [x, y], [x, y - h * 0.5], '#6b4a3a', Math.max(1, h * 0.09));
    verdure(ctx, x, y - h * 0.68, h * 0.42, c, g);
  }
  // Cristal dressé (mines, monuments, grands noyaux).
  function cristal(ctx, x, y, l, h, c, penche) {
    var p = penche || 0;
    poly(ctx, [[x - l, y], [x - l * 0.6 + p * 0.5, y - h * 0.72], [x + p, y - h], [x, y]], teinte(c, 1.18));
    poly(ctx, [[x, y], [x + p, y - h], [x + l * 0.7 + p * 0.5, y - h * 0.66], [x + l, y]], teinte(c, 0.7));
    ligne(ctx, [x, y], [x + p, y - h], 'rgba(255,255,255,0.65)', 0.6);
  }
  // Silhouette de colon en combinaison (figurants des bâtiments) : s = échelle, c = couleur de la tenue.
  function figurant(ctx, x, y, s, c) {
    s = s || 1; c = c || C.coque;
    ellipse(ctx, x, y, 2.6 * s, 1 * s, 'rgba(10,14,26,0.3)');
    ctx.strokeStyle = teinte(c, 0.7); ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 0.9 * s, y - 3.4 * s); ctx.lineTo(x - 1 * s, y - 0.4 * s); ctx.moveTo(x + 0.9 * s, y - 3.4 * s); ctx.lineTo(x + 1 * s, y - 0.4 * s); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x - 2 * s, y - 7.6 * s, 4 * s, 4.6 * s, 1.2 * s); ctx.fill();
    cercle(ctx, x, y - 9.2 * s, 2.1 * s, teinte(c, 1.1));
    ctx.fillStyle = '#1d2c40'; ctx.beginPath(); ctx.ellipse(x + 0.5 * s, y - 9.2 * s, 1.3 * s, 1.1 * s, 0, 0, Math.PI * 2); ctx.fill();
    cercle(ctx, x + 0.9 * s, y - 9.7 * s, 0.4 * s, 'rgba(255,255,255,0.85)');
  }
  // Fumée ou vapeur : trois bouffées qui montent (fr : image de l'animation).
  function vapeur(ctx, x, y, fr, c) {
    c = c || '#ffffff';
    for (var k = 0; k < 3; k++) {
      var d = (k + (fr ? 0.5 : 0)) * 4.2;
      cercle(ctx, x + Math.sin(k * 1.7 + (fr || 0)) * 1.8, y - d, 2 + k * 0.9, alpha(c, 0.34 - k * 0.09));
    }
  }
  // Ombre de contact au sol.
  function ombre(ctx, x, y, rx, ry, a) { ellipse(ctx, x, y, rx, ry, 'rgba(10,12,24,' + (a === undefined ? 0.28 : a) + ')'); }

  // --- Cache ---------------------------------------------------------------
  // Renvoie { c: canvas, ox, oy, w, h } : (ox, oy) = décalage, au zoom 1, entre le coin
  // haut de l'emprise et le coin haut-gauche de l'image.
  function sprite(cle, t, haut, peindre, z) {
    var k = cle + '@' + z;
    var s = cache.get(k);
    if (s) return s;
    var w = t * TW + 2 * MARGE, h = t * TH + haut + MARGE, f = z * DPR;
    // Plafond de 5 millions de points par image : au-delà, l'image est un peu moins fine (mémoire des téléphones).
    if (w * h * f * f > 5e6) f = Math.sqrt(5e6 / (w * h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * f)); c.height = Math.max(1, Math.ceil(h * f));
    var ctx = c.getContext('2d');
    ctx.scale(f, f);
    ctx.translate(MARGE, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ECH = f;
    peindre(ctx, projecteur(t, haut), t);
    s = { c: c, ox: -(t * TW / 2 + MARGE), oy: -haut, w: w, h: h };
    cache.set(k, s);
    return s;
  }
  // Image libre (marcheurs, icônes) : largeur × hauteur, ancre (ax, ay).
  function image(cle, w, h, ax, ay, peindre, z) {
    var k = cle + '@' + z, s = cache.get(k);
    if (s) return s;
    var f = z * DPR, c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * f)); c.height = Math.max(1, Math.ceil(h * f));
    var ctx = c.getContext('2d');
    ctx.scale(f, f); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ECH = f;
    peindre(ctx);
    s = { c: c, ox: -ax, oy: -ay, w: w, h: h };
    cache.set(k, s);
    return s;
  }
  function vider() { cache.clear(); }
  function reglerDPR(d) { if (d !== DPR) { DPR = d; vider(); } }
  function reglerEchelle(f) { ECH = f; }

  racine.CM_ART = {
    TW: TW, TH: TH, MARGE: MARGE, RX: RX, RY: RY, C: C, MONDES: MONDES, monde: monde, BIENS: BIENS, FORME_BIEN: FORME_BIEN,
    hex: hex, teinte: teinte, nuance: nuance, melange: melange, alpha: alpha,
    projecteur: projecteur, echelle: echelle, chemin: chemin, poly: poly, ligne: ligne, trace: trace, cercle: cercle, ellipse: ellipse,
    sol: sol, dalle: dalle, hachage: hachage, degV: degV, degH: degH, degR: degR,
    lueur: lueur, lampe: lampe, eclat: eclat,
    mur: mur, boite: boite, module: module, voute: voute, cylindre: cylindre, tronc: tronc, dome: dome, sphere: sphere,
    surFace: surFace, fenetres: fenetres, baie: baie, bandeau: bandeau, ceinture: ceinture, neon: neon, sas: sas,
    mat: mat, parabole: parabole, panneau: panneau, tuyau: tuyau, conteneur: conteneur, socle: socle, quadrillage: quadrillage, aire: aire,
    hologramme: hologramme, verdure: verdure, arbuste: arbuste, cristal: cristal, figurant: figurant, vapeur: vapeur, ombre: ombre,
    sprite: sprite, image: image, vider: vider, reglerDPR: reglerDPR, reglerEchelle: reglerEchelle,
    PEINTRES: {}, HAUT: {}
  };
})(typeof window !== 'undefined' ? window : globalThis);
