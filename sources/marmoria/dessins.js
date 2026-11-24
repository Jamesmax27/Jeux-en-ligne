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
  // Même nuance que teinte, mais rendue en #rrvvbb : utilisable comme couleur de base d'un outil
  // qui ombre lui-même (boite, cylindre…), car teinte ne lit que l'hexadécimal.
  function nuance(c, f) {
    var m = teinte(c, f).match(/\d+/g);
    return '#' + m.map(function (x) { return ('0' + (+x).toString(16)).slice(-2); }).join('');
  }
  var C = {
    herbe: ['#7fa84a', '#78a246', '#83ad4f', '#7aa548'], prairie: '#a9b64e', terre: '#b08a5a', sable: '#d8c48e',
    eau: '#3f7fb5', eauClair: '#6aa5d6', pierre: '#c9bfa8', pierreF: '#a79e88', rome: '#9c937e',
    bois: '#8a5a32', boisC: '#a8743f', chaume: '#cfa64b', tuile: '#b9573a', tuileF: '#9c4630',
    enduit: '#e8d8b6', marbre: '#efeae0', toile: '#e9dcc0', rougeToile: '#b5443a',
    vert: '#4f7a34', vertF: '#3d612a', feuillage: '#4d7d33', feuillageC: '#69a040',
    roche: '#8f8a80', rocheC: '#aaa59a', or: '#d9a93a',
    alim: '#c98a2b', eauToit: '#4a86c0', relig: '#f1ece2', divert: '#8e5aa8', admin: '#5a7397', secu: '#b03a2e', ingen: '#4f86a0',
    // Lot 2 : toits de l'éducation (bleu-vert), de la santé (corail) et de l'industrie (brun).
    educ: '#3a9a8c', sante: '#e07b6c', indus: '#9a6a48'
  };
  // Couleur de chaque bien (piles des entrepôts, matières des ateliers ; reprise par l'interface).
  var BIENS = {
    ble: '#e0c050', legumes: '#5f9e3c', fruits: '#ee8a2a', porc: '#d4606a', poisson: '#7f98aa', olives: '#4f6a30',
    raisin: '#7a3a8a', argile: '#a8583a', bois: '#8a5a32', fer: '#5a5e66', marbre: '#efeae0', poterie: '#d07a48',
    mobilier: '#7a4a2a', huile: '#c2c050', vin: '#8e2335', armes: '#8c949e'
  };
  // Forme de la pile de chaque bien : on reconnaît le bien à sa forme autant qu'à sa couleur.
  var FORME_BIEN = {
    ble: 'sacs', legumes: 'caisses', fruits: 'caisses', porc: 'caisses', poisson: 'paniers', olives: 'paniers', raisin: 'paniers',
    argile: 'tas', bois: 'rondins', fer: 'lingots', marbre: 'blocs', poterie: 'jarres', mobilier: 'meubles', huile: 'amphores',
    vin: 'amphores', armes: 'armes'
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

  // --- Outils de dessin du lot 2 ----------------------------------------------
  // Chemin d'un polygone, sans le peindre (pour découper : ctx.clip()).
  function chemin(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function ligne(ctx, a, b, c, l) { ctx.strokeStyle = c; ctx.lineWidth = l || 1; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  // Projecteur mis à l'échelle : un dessin pensé pour 2 × 2 cases, peint sur k × 2 cases.
  function echelle(P, k) { return function (u, v, h) { return P(u * k, v * k, (h || 0) * k); }; }
  // Morceaux peints par profondeur (u + v croissant) : ce qui est derrière d'abord.
  function scene() {
    var l = [];
    return {
      ajouter: function (u, v, f) { l.push([u + v, l.length, f]); },
      peindre: function () {
        l.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
        for (var k = 0; k < l.length; k++) l[k][2]();
      }
    };
  }
  // Poteau vertical planté en (u, v), de h0 à h1 (bois, mât, colonne fine).
  function poteau(ctx, P, u, v, h0, h1, c, l) {
    var a = P(u, v, h0), b = P(u, v, h1), e = l || 2;
    ctx.fillStyle = c; ctx.fillRect(a[0] - e / 2, b[1], e, a[1] - b[1]);
  }
  // Ouverture dans une face : 'v' = face gauche (v fixe, claire), 'u' = face droite (u fixe, sombre).
  // arc : hauteur du cintre (porte ou fenêtre arrondie), 0 pour une ouverture droite.
  function ouverture(ctx, P, face, a0, a1, fixe, h0, h1, c, arc) {
    var A = face === 'v' ? function (a, h) { return P(a, fixe, h); } : function (a, h) { return P(fixe, a, h); };
    var pts = [A(a0, h0), A(a1, h0), A(a1, h1)];
    if (arc) pts.push(A((a0 + a1) / 2, h1 + arc));
    pts.push(A(a0, h1));
    poly(ctx, pts, c);
  }
  // Rangée régulière de n fenêtres sur une face.
  function fenetres(ctx, P, face, a0, a1, fixe, h0, h1, n, c, arc) {
    var pas = (a1 - a0) / n, l = pas * 0.24;
    for (var k = 0; k < n; k++) { var m = a0 + pas * (k + 0.5); ouverture(ctx, P, face, m - l, m + l, fixe, h0, h1, c, arc); }
  }
  // Bandeau horizontal sur les deux faces visibles d'un bloc (étages, moulures).
  function bandeau(ctx, P, u0, v0, u1, v1, h, e, c) {
    poly(ctx, [P(u0, v1, h), P(u1, v1, h), P(u1, v1, h + e), P(u0, v1, h + e)], teinte(c, 0.98));
    poly(ctx, [P(u1, v0, h), P(u1, v1, h), P(u1, v1, h + e), P(u1, v0, h + e)], teinte(c, 0.76));
  }
  // Colonnade posée sur un socle (h0) : nu colonnes sur la face gauche (v1), nv sur la face droite (u1).
  function colonnade(ctx, P, u0, v0, u1, v1, h0, h1, nu, nv, c) {
    var k, a, b;
    for (k = 0; k < nv; k++) {
      var v = v0 + (v1 - v0) * (k + 0.5) / nv; a = P(u1, v, h0); b = P(u1, v, h1);
      ctx.fillStyle = teinte(c, 0.8); ctx.fillRect(a[0] - 2, b[1], 4, a[1] - b[1]);
      ctx.fillStyle = teinte(c, 0.64); ctx.fillRect(a[0] + 1, b[1], 1, a[1] - b[1]);
      ctx.fillStyle = teinte(c, 0.9); ctx.fillRect(a[0] - 3, b[1], 6, 2);
    }
    for (k = 0; k < nu; k++) {
      var u = u0 + (u1 - u0) * (k + 0.5) / nu; a = P(u, v1, h0); b = P(u, v1, h1);
      ctx.fillStyle = teinte(c, 0.98); ctx.fillRect(a[0] - 2, b[1], 4, a[1] - b[1]);
      ctx.fillStyle = teinte(c, 0.76); ctx.fillRect(a[0] + 1, b[1], 1, a[1] - b[1]);
      ctx.fillStyle = teinte(c, 1.04); ctx.fillRect(a[0] - 3, b[1], 6, 2);
    }
  }
  // Cylindre debout de rayon r (en cases), de h0 à h1 : flanc ombré de gauche à droite, dessus clair.
  function cylindre(ctx, P, u, v, r, h0, h1, c, dessus) {
    var b = P(u, v, h0), a = P(u, v, h1), rx = r * 45.25, ry = r * 22.63;
    var g = ctx.createLinearGradient(b[0] - rx, 0, b[0] + rx, 0);
    g.addColorStop(0, teinte(c, 0.98)); g.addColorStop(0.55, teinte(c, 0.86)); g.addColorStop(1, teinte(c, 0.64));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(a[0] - rx, a[1]); ctx.lineTo(b[0] - rx, b[1]);
    ctx.ellipse(b[0], b[1], rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(a[0] + rx, a[1]); ctx.closePath(); ctx.fill();
    if (dessus !== false) ellipse(ctx, a[0], a[1], rx, ry, dessus || teinte(c, 1.1));
  }
  // Dôme posé sur l'ellipse (x, y, rx) : moitié gauche claire, droite ombrée.
  function dome(ctx, x, y, rx, h, c) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, rx, h, 0, Math.PI, 0); ctx.ellipse(x, y, rx, rx * 0.5, 0, 0, Math.PI); ctx.closePath();
    ctx.fillStyle = teinte(c, 0.72); ctx.fill(); ctx.clip();
    ellipse(ctx, x - rx * 0.28, y - h * 0.22, rx * 0.86, h * 0.95, teinte(c, 1.0));
    ellipse(ctx, x - rx * 0.42, y - h * 0.55, rx * 0.3, h * 0.25, teinte(c, 1.12));
    ctx.restore();
  }
  // Tas arrondi (argile, minerai, grain) posé en (x, y).
  function tas(ctx, x, y, rx, h, c, graine) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, h, 0, Math.PI, 0); ctx.ellipse(x, y, rx, rx * 0.42, 0, 0, Math.PI); ctx.closePath();
    ctx.fillStyle = teinte(c, 0.78); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - rx * 0.12, y - h * 0.08, rx * 0.8, h * 0.88, 0, Math.PI, 0); ctx.ellipse(x - rx * 0.12, y - h * 0.08, rx * 0.8, rx * 0.3, 0, 0, Math.PI); ctx.closePath();
    ctx.fillStyle = c; ctx.fill();
    for (var k = 0; k < 5; k++) {
      var a = hachage(graine || 3, k), b = hachage(k + 11, graine || 3);
      cercle(ctx, x + (a - 0.5) * rx * 1.2, y - h * (0.2 + b * 0.6), 1.2 + a, k % 2 ? teinte(c, 1.18) : teinte(c, 0.82));
    }
  }
  // Petite fumée (cheminée, four), décalée d'un cran selon l'image (0 ou 1).
  function fumee(ctx, x, y, fr) {
    var o = (fr || 0) % 2 ? 1.5 : 0;
    cercle(ctx, x + o * 0.4, y - 3, 2.4, 'rgba(226,222,214,0.85)');
    cercle(ctx, x + 2 + o, y - 8.5, 3.4, 'rgba(214,210,202,0.72)');
    cercle(ctx, x + 4.5 + o * 1.4, y - 15, 4.3, 'rgba(204,200,192,0.55)');
  }
  // Petit arbre rond (vergers, jardins) : pied en (x, y), rayon du feuillage r.
  function arbuste(ctx, x, y, r, c, tronc) {
    ellipse(ctx, x + 1, y + 1, r * 0.95, r * 0.42, 'rgba(40,60,20,0.3)');
    ctx.fillStyle = tronc || C.bois; ctx.fillRect(x - 1, y - r - 2, 2, r + 2);
    cercle(ctx, x, y - r * 1.7, r, c);
    cercle(ctx, x + r * 0.38, y - r * 1.42, r * 0.58, teinte(c, 0.8));
    cercle(ctx, x - r * 0.32, y - r * 2.0, r * 0.52, teinte(c, 1.22));
  }
  // Cyprès : flamme vert sombre, pied en (x, y), hauteur h.
  function cypres(ctx, x, y, h) {
    ellipse(ctx, x + 1, y + 0.5, 3.5, 1.5, 'rgba(40,60,20,0.3)');
    poly(ctx, [[x, y - h], [x + 3.4, y - h * 0.45], [x + 2.4, y], [x - 2.4, y], [x - 3.4, y - h * 0.45]], '#3b6a33');
    poly(ctx, [[x, y - h], [x - 3.4, y - h * 0.45], [x - 2.4, y], [x - 0.2, y]], '#4f8640');
  }
  // Semis de fleurs dans un rectangle (u0..u1, v0..v1).
  function fleurs(ctx, P, u0, v0, u1, v1, n, graine) {
    var cs = ['#e8584a', '#f2d24a', '#f6f0e6', '#e889b4', '#b080d8'];
    for (var k = 0; k < n; k++) {
      var p = P(u0 + hachage(graine, k) * (u1 - u0), v0 + hachage(k + 5, graine) * (v1 - v0), 0);
      ctx.fillStyle = teinte('#4a7a30', 0.95); ctx.fillRect(p[0] - 0.5, p[1] - 3, 1, 3);
      cercle(ctx, p[0], p[1] - 3.2, 1.4, cs[(k + graine) % cs.length]);
    }
  }
  // Clôture de bois le long d'un segment : n intervalles, deux lisses.
  function cloture(ctx, P, u0, v0, u1, v1, n) {
    for (var k = 0; k <= n; k++) { var f = k / n; poteau(ctx, P, u0 + (u1 - u0) * f, v0 + (v1 - v0) * f, 0, 9, '#6e4a2c', 2); }
    ligne(ctx, P(u0, v0, 4), P(u1, v1, 4), '#a8743f', 1.5);
    ligne(ctx, P(u0, v0, 7.5), P(u1, v1, 7.5), '#b98450', 1.5);
  }
  // Amphore debout (ou jarre ronde) : pied en (x, y).
  function amphore(ctx, x, y, c, ronde) {
    if (ronde) {
      ellipse(ctx, x, y - 3.6, 3.6, 3.7, teinte(c, 0.8));
      ellipse(ctx, x - 0.7, y - 4, 2.7, 3.1, c);
      ctx.fillStyle = teinte(c, 0.85); ctx.fillRect(x - 1.5, y - 9, 3, 2.5);
      ellipse(ctx, x, y - 9, 2.1, 0.9, teinte(c, 0.55));
    } else {
      poly(ctx, [[x, y], [x - 2.8, y - 6], [x - 2, y - 10], [x + 2, y - 10], [x + 2.8, y - 6]], teinte(c, 0.8));
      poly(ctx, [[x - 0.3, y], [x - 2.8, y - 6], [x - 2, y - 10], [x + 0.6, y - 10], [x + 0.6, y - 6]], c);
      ctx.fillStyle = teinte(c, 0.9); ctx.fillRect(x - 1, y - 13, 2, 3);
      ctx.strokeStyle = teinte(c, 0.65); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 1, y - 12); ctx.lineTo(x - 2.6, y - 11.5); ctx.lineTo(x - 2.2, y - 9.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 1, y - 12); ctx.lineTo(x + 2.6, y - 11.5); ctx.lineTo(x + 2.2, y - 9.5); ctx.stroke();
      ellipse(ctx, x, y - 13, 1.5, 0.7, teinte(c, 0.55));
    }
  }
  // Rondin couché le long de u (de u0 à u1, en v), posé à la hauteur h, rayon r en pixels.
  function rondin(ctx, P, u0, u1, v, h, r, c) {
    var a = P(u0, v, h), b = P(u1, v, h);
    poly(ctx, [[a[0], a[1] - 2 * r], [b[0], b[1] - 2 * r], [b[0], b[1]], [a[0], a[1]]], c);
    ligne(ctx, [a[0], a[1] - 2 * r + 0.8], [b[0], b[1] - 2 * r + 0.8], teinte(c, 1.25), 1);
    ellipse(ctx, b[0], b[1] - r, r * 0.85, r, '#dcb27a');
    ellipse(ctx, b[0], b[1] - r, r * 0.35, r * 0.42, '#b98a52');
  }
  // Sac de grain : panse ronde, col serré d'un lien, pied en (x, y).
  function sac(ctx, x, y, c) {
    ellipse(ctx, x, y - 4, 5, 4.2, teinte(c, 0.74));
    ellipse(ctx, x - 0.9, y - 4.6, 3.8, 3.4, c);
    poly(ctx, [[x - 2.4, y - 7.4], [x + 2.4, y - 7.4], [x + 1.4, y - 10], [x - 1.4, y - 10]], teinte(c, 0.86));
    ctx.fillStyle = teinte(c, 0.5); ctx.fillRect(x - 1.9, y - 8.6, 3.8, 1.1);
    ellipse(ctx, x, y - 10.2, 1.9, 0.9, teinte(c, 1.12));
  }
  // Retrouve (u, v) au sol à partir d'un point de l'image (pour poser des rails devant une entrée).
  function auSol(P, x, y) {
    var o = P(0, 0, 0), s = (y - o[1]) / 16, d = (x - o[0]) / 32;
    return [(s + d) / 2, (s - d) / 2];
  }
  // Rocher massif à facettes (mine, carrière) : base centrée en (x, y), largeur w, hauteur h ;
  // face gauche claire, face droite sombre, sommets éclairés, fissures ; g choisit la variante.
  // Renvoie les coins de la face gauche (A : base gauche, H : base avant) pour y creuser une entrée.
  function massif(ctx, x, y, w, h, c, g) {
    var j = function (k) { return (hachage(g, k) - 0.5) * 0.1; };
    var A = [x - w * 0.5, y - h * 0.04], B = [x - w * (0.45 + j(1)), y - h * (0.52 + j(2))],
      S1 = [x - w * (0.24 + j(3)), y - h * (0.9 + j(4))], D = [x - w * 0.05, y - h * (0.74 + j(5))],
      S2 = [x + w * (0.13 + j(6)), y - h], F = [x + w * (0.38 + j(7)), y - h * (0.58 + j(8))],
      G = [x + w * 0.5, y - h * 0.08], H = [x + w * 0.05, y + h * 0.16], I = [x - w * 0.02, y - h * 0.4], K = [x + w * 0.13, y - h * 0.66];
    poly(ctx, [A, B, S1, D, S2, F, G, H], teinte(c, 0.64));
    poly(ctx, [A, B, S1, D, I, H], teinte(c, 0.95));
    poly(ctx, [B, S1, D, [x - w * 0.2, y - h * 0.6]], teinte(c, 1.12));
    poly(ctx, [D, S2, F, K], teinte(c, 0.84));
    poly(ctx, [D, K, I], teinte(c, 0.76));
    poly(ctx, [B, [x - w * 0.2, y - h * 0.6], D, I, [x - w * 0.3, y - h * 0.3]], teinte(c, 1.02));
    ligne(ctx, [x - w * 0.32, y - h * 0.22], [x - w * 0.24, y - h * 0.08], teinte(c, 0.72), 1);
    ligne(ctx, [x + w * 0.24, y - h * 0.46], [x + w * 0.3, y - h * 0.2], teinte(c, 0.48), 1);
    ligne(ctx, [x - w * 0.12, y - h * 0.7], [x - w * 0.18, y - h * 0.52], teinte(c, 0.85), 1);
    return { A: A, H: H };
  }
  // Panier rond rempli (poissons, olives, raisin) : pied en (x, y).
  function panier(ctx, x, y, c) {
    poly(ctx, [[x - 5, y - 5], [x - 4, y], [x + 4, y], [x + 5, y - 5]], '#a87a3e');
    poly(ctx, [[x + 0.5, y - 5], [x + 0.5, y], [x + 4, y], [x + 5, y - 5]], '#8a6230');
    ctx.fillStyle = '#c99a5a'; ctx.fillRect(x - 4.5, y - 3, 9, 1);
    ellipse(ctx, x, y - 5, 5, 2.2, teinte(c, 0.85));
    cercle(ctx, x - 1.8, y - 5.6, 1.4, c); cercle(ctx, x + 1.5, y - 5.4, 1.4, teinte(c, 1.2)); cercle(ctx, x, y - 6.4, 1.3, teinte(c, 1.05));
  }
  // Silhouette en pied (statue, dieu) : pieds en (x, y), s = échelle (1 ≈ 16 px).
  // Renvoie la position de la main droite (levée si leve), pour lui faire tenir un emblème.
  function figure(ctx, x, y, s, c, leve, cape) {
    var cl = teinte(c, 1.06), cf = teinte(c, 0.76);
    poly(ctx, [[x - 2.6 * s, y], [x - 2 * s, y - 8 * s], [x + 2 * s, y - 8 * s], [x + 2.6 * s, y]], cl);
    poly(ctx, [[x + 0.2 * s, y], [x + 0.2 * s, y - 8 * s], [x + 2 * s, y - 8 * s], [x + 2.6 * s, y]], cf);
    poly(ctx, [[x - 2.4 * s, y - 7.6 * s], [x - 2.2 * s, y - 12.6 * s], [x + 2.2 * s, y - 12.6 * s], [x + 2.4 * s, y - 7.6 * s]], cl);
    poly(ctx, [[x + 0.4 * s, y - 7.6 * s], [x + 0.4 * s, y - 12.6 * s], [x + 2.2 * s, y - 12.6 * s], [x + 2.4 * s, y - 7.6 * s]], cf);
    if (cape) poly(ctx, [[x - 2.3 * s, y - 12.4 * s], [x + 2.2 * s, y - 9 * s], [x + 2.5 * s, y - 6.5 * s], [x - 1.2 * s, y - 10 * s]], cape);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 1.7 * s;
    ctx.strokeStyle = cl; ctx.beginPath(); ctx.moveTo(x - 2.2 * s, y - 12 * s); ctx.lineTo(x - 3.4 * s, y - 7.5 * s); ctx.stroke();
    var main = leve ? [x + 4.4 * s, y - 17.5 * s] : [x + 3.8 * s, y - 8 * s];
    ctx.strokeStyle = cf; ctx.beginPath(); ctx.moveTo(x + 2.1 * s, y - 12 * s); ctx.lineTo(main[0], main[1]); ctx.stroke();
    ctx.restore();
    cercle(ctx, x, y - 14.4 * s, 2 * s, cl);
    cercle(ctx, x + 0.7 * s, y - 14.1 * s, 1.2 * s, teinte(c, 0.9));
    return main;
  }

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
  // Place dallée : plus claire qu'une route, damier de dalles et rosace au centre ; une bordure
  // de pierre sombre court sur les côtés sans voisin (même masque que les routes).
  function peindrePlace(ctx, P, masque) {
    var c = '#e4dac2', k = teinte(c, 0.8), b = 0.07, i, j;
    sol(ctx, P, -0.02, -0.02, 1.02, 1.02, c);
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) if ((i + j) % 2) sol(ctx, P, i / 4, j / 4, (i + 1) / 4, (j + 1) / 4, teinte(c, 0.93));
    for (i = 1; i < 4; i++) { ligne(ctx, P(i / 4, 0), P(i / 4, 1), teinte(c, 0.85), 1); ligne(ctx, P(0, i / 4), P(1, i / 4), teinte(c, 0.85), 1); }
    sol(ctx, P, 0.38, 0.38, 0.62, 0.62, '#efe8d6');
    sol(ctx, P, 0.45, 0.45, 0.55, 0.55, '#c9a878');
    if (!(masque & 1)) sol(ctx, P, 0, 0, 1, b, k);
    if (!(masque & 2)) sol(ctx, P, 1 - b, 0, 1, 1, k);
    if (!(masque & 4)) sol(ctx, P, 0, 1 - b, 1, 1, k);
    if (!(masque & 8)) sol(ctx, P, 0, 0, b, 1, k);
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
  // t : emprise en cases (1 jusqu'au niveau 9, 2 pour les insulae ; les dessins se mettent à l'échelle).
  function peindreMaison(ctx, P, niv, v, t) {
    var murs = [C.enduit, '#e2cfa4', '#ead9bd'][v % 3];
    t = t || 1;
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
    if (niv <= 9) { peindreCasa(ctx, t > 1 ? echelle(P, t) : P, niv, v); return; }
    if (niv <= 12) { peindreInsula(ctx, echelle(P, t / 2), niv, v); return; }
    // Niveaux 13 à 20 (lot 4) : bloc générique à l'échelle de l'emprise, en attendant villas et palais.
    var etages = Math.min(5, 1 + Math.floor((niv - 5) / 2)), hh = 10 + etages * 9, m = 0.06, f = t - 0.06;
    var mur = niv >= 13 ? C.marbre : murs;
    sol(ctx, P, 0.03, 0.03, t - 0.03, t - 0.03, teinte(C.pierre, 1.05));
    boite(ctx, P, m, m, f, f, 0, hh, mur);
    for (var e = 0; e < etages; e++) {
      var h0 = 6 + e * 9;
      fenetres(ctx, P, 'v', m, f, f, h0, h0 + 5, 3 * t, '#5b4632');
      fenetres(ctx, P, 'u', m, f, f, h0, h0 + 5, 3 * t, '#4a3828');
    }
    toit(ctx, P, m, m, f, f, hh, 8 + 3 * t, C.tuile, 'u');
  }

  // Casae et petite insula (niveaux 7 à 9, 1 case) : enduit, tuiles, cour fermée, étages.
  function peindreCasa(ctx, P, niv, v) {
    var murs = ['#e8d6ae', '#eedcb8', '#e4cc9e'][v % 3], fen = '#5b4632', fenS = '#4a3828', k;
    sol(ctx, P, 0.04, 0.04, 0.96, 0.96, teinte(C.pierre, 1.05));
    if (niv === 9) {
      // Petite insula : trois étages, rangs de fenêtres, boutique au rez-de-chaussée sous un auvent.
      var ocre = ['#dcae7a', '#e0b888', '#d6a472'][v % 3], H = 34;
      boite(ctx, P, 0.08, 0.08, 0.92, 0.92, 0, H, ocre);
      bandeau(ctx, P, 0.08, 0.08, 0.92, 0.92, 11, 1.5, '#f0dcb8');
      bandeau(ctx, P, 0.08, 0.08, 0.92, 0.92, 22, 1.5, '#f0dcb8');
      fenetres(ctx, P, 'v', 0.08, 0.92, 0.92, 15, 20, 3, fen); fenetres(ctx, P, 'v', 0.08, 0.92, 0.92, 26, 31, 3, fen);
      fenetres(ctx, P, 'u', 0.08, 0.92, 0.92, 15, 20, 3, fenS); fenetres(ctx, P, 'u', 0.08, 0.92, 0.92, 26, 31, 3, fenS);
      fenetres(ctx, P, 'u', 0.08, 0.92, 0.92, 3, 8, 2, fenS);
      ouverture(ctx, P, 'v', 0.2, 0.62, 0.92, 0, 8, '#3b2a1c');
      ouverture(ctx, P, 'v', 0.72, 0.84, 0.92, 0, 8, teinte(C.bois, 0.55));
      var aw = ['#b5443a', '#3f86b8', '#5b9c45'][v % 3];
      for (k = 0; k < 3; k++) { var a0 = 0.16 + k * 0.17; poly(ctx, [P(a0, 0.92, 10), P(a0 + 0.17, 0.92, 10), P(a0 + 0.17, 1.04, 7), P(a0, 1.04, 7)], k % 2 ? '#f4ece0' : aw); }
      toit(ctx, P, 0.08, 0.08, 0.92, 0.92, H, 8, C.tuile, v % 2 ? 'u' : 'v');
      return;
    }
    // Casa : maison à étage au fond, cour fermée par un muret devant.
    var grand = niv === 8, hc = grand ? 27 : 22, vm = 0.5;
    sol(ctx, P, 0.1, vm, 0.9, 0.9, teinte(C.pierre, 1.16));
    if (grand) {
      // Grande casa : une aile basse ferme la cour à droite.
      boite(ctx, P, 0.62, vm, 0.9, 0.9, 0, 13, murs);
      fenetres(ctx, P, 'u', vm, 0.9, 0.9, 5, 9, 1, fenS);
      toit(ctx, P, 0.62, vm, 0.9, 0.9, 13, 6, C.tuile, 'v');
    }
    boite(ctx, P, 0.1, 0.1, 0.9, vm, 0, hc, murs);
    if (grand) bandeau(ctx, P, 0.1, 0.1, 0.9, vm, 0, 3.5, '#b8703f');
    fenetres(ctx, P, 'v', 0.1, 0.9, vm, hc - 9, hc - 4, 3, fen);
    fenetres(ctx, P, 'u', 0.1, vm, 0.9, hc - 9, hc - 4, 1, fenS);
    ouverture(ctx, P, 'v', 0.28, 0.42, vm, 0, 9, teinte(C.bois, 0.55));
    toit(ctx, P, 0.1, 0.1, 0.9, vm, hc, 9, C.tuile, 'u');
    if (grand) {
      // Balcon de bois à l'étage, au-dessus de la cour.
      boite(ctx, P, 0.16, vm, 0.56, vm + 0.1, 12, 13.5, C.bois);
      for (k = 0; k < 5; k++) poteau(ctx, P, 0.17 + k * 0.095, vm + 0.1, 13.5, 17, C.bois, 1);
      ligne(ctx, P(0.16, vm + 0.1, 17), P(0.56, vm + 0.1, 17), C.bois, 1.2);
    }
    // Plante ou petit arbre dans la cour.
    var pl = P(0.3, 0.74, 0);
    if (grand) { poly(ctx, [[pl[0] - 3, pl[1] - 5], [pl[0] + 3, pl[1] - 5], [pl[0] + 2, pl[1]], [pl[0] - 2, pl[1]]], '#b9653d'); cercle(ctx, pl[0], pl[1] - 8, 4, '#5f9e3c'); cercle(ctx, pl[0] - 1.5, pl[1] - 9.5, 2, '#7fbf55'); }
    else arbuste(ctx, pl[0], pl[1], 4.5, C.feuillage);
    // Muret de la cour (devant), avec sa porte.
    boite(ctx, P, 0.1, 0.84, grand ? 0.62 : 0.9, 0.9, 0, 7, murs);
    if (!grand) boite(ctx, P, 0.84, vm, 0.9, 0.84, 0, 7, murs);
    ouverture(ctx, P, 'v', 0.42, 0.56, 0.9, 0, 6, teinte(C.bois, 0.6));
    if (grand) { var po = P(0.18, 0.9, 7); poly(ctx, [[po[0] - 2.4, po[1] - 4], [po[0] + 2.4, po[1] - 4], [po[0] + 1.8, po[1]], [po[0] - 1.8, po[1]]], '#b9653d'); cercle(ctx, po[0], po[1] - 6, 3, '#e8584a'); cercle(ctx, po[0] + 1, po[1] - 7, 1.6, '#f2d24a'); }
  }

  // Insulae (niveaux 10 à 12), dessinées pour 2 × 2 cases (P déjà mis à l'échelle de l'emprise).
  // 10 : trois étages, cour intérieure ; 11 : quatre étages, terrasse à treille ;
  // 12 (prestige) : moulures de marbre, portique à colonnes, jardin sur le toit.
  function peindreInsula(ctx, P, niv, v) {
    var k, e, m = 0.1, f = 1.9, fen = '#5b4632', fenS = '#4a3828';
    var prestige = niv === 12, et = niv === 10 ? 3 : 4, hE = 11, H = 12 + (et - 1) * hE;
    var murs = prestige ? ['#e8cf9e', '#ecd6aa', '#e4c894'][v % 3] : ['#dcae7a', '#e2bd8c', '#d8a874'][v % 3];
    var auvents = ['#b5443a', '#3f86b8', '#5b9c45', '#d9a93a'];
    sol(ctx, P, 0.03, 0.03, 1.97, 1.97, teinte(C.pierre, 1.06));
    boite(ctx, P, m, m, f, f, 0, H, murs, false);
    // Étages : bandeaux (de marbre pour la prestige), rangs de fenêtres.
    for (e = 1; e < et; e++) {
      var hb = 12 + (e - 1) * hE;
      bandeau(ctx, P, m, m, f, f, hb - 1, prestige ? 2 : 1.4, prestige ? C.marbre : '#f0dcb8');
      fenetres(ctx, P, 'v', m, f, f, hb + 3, hb + 8, 6, fen, prestige ? 1.5 : 0);
      fenetres(ctx, P, 'u', m, f, f, hb + 3, hb + 8, 6, fenS, prestige ? 1.5 : 0);
    }
    // Rez-de-chaussée : boutiques sous auvents (portique d'entrée pour la prestige).
    if (prestige) {
      bandeau(ctx, P, m, m, f, f, 0, 2.5, C.marbre);
      // Pilastres de marbre aux angles.
      poly(ctx, [P(m, f, 0), P(m + 0.1, f, 0), P(m + 0.1, f, H), P(m, f, H)], C.marbre);
      poly(ctx, [P(f - 0.1, f, 0), P(f, f, 0), P(f, f, H), P(f - 0.1, f, H)], C.marbre);
      poly(ctx, [P(f, m, 0), P(f, m + 0.1, 0), P(f, m + 0.1, H), P(f, m, H)], teinte(C.marbre, 0.78));
      fenetres(ctx, P, 'v', m + 0.1, 0.55, f, 3, 9, 2, fen, 2); fenetres(ctx, P, 'v', 1.45, f - 0.1, f, 3, 9, 2, fen, 2);
      for (k = 0; k < 3; k++) { var a0 = 0.3 + k * 0.5; ouverture(ctx, P, 'u', a0, a0 + 0.3, f, 0, 8, '#3b2a1c', 2); }
      // Portique : vestibule sombre, cinq colonnes de marbre, fronton.
      ouverture(ctx, P, 'v', 0.6, 1.4, f, 0, 12, '#3b2a1c');
      boite(ctx, P, 0.56, f, 1.44, f + 0.08, 0, 1.6, C.marbre);
      for (k = 0; k < 5; k++) poteau(ctx, P, 0.62 + k * 0.19, f + 0.05, 1.6, 13, C.marbre, 3.4);
      boite(ctx, P, 0.54, f - 0.02, 1.46, f + 0.1, 13, 15.5, C.marbre);
      poly(ctx, [P(0.54, f + 0.1, 15.5), P(1.46, f + 0.1, 15.5), P(1.0, f + 0.1, 22)], teinte(C.marbre, 0.96));
      poly(ctx, [P(0.7, f + 0.1, 16.5), P(1.3, f + 0.1, 16.5), P(1.0, f + 0.1, 20.4)], teinte(C.or, 1.2));
    } else {
      for (k = 0; k < 3; k++) {
        var b0 = 0.22 + k * 0.58;
        ouverture(ctx, P, 'v', b0, b0 + 0.36, f, 0, 8, '#3b2a1c');
        poly(ctx, [P(b0 - 0.04, f, 10.5), P(b0 + 0.4, f, 10.5), P(b0 + 0.4, f + 0.13, 7), P(b0 - 0.04, f + 0.13, 7)], auvents[(k + v) % 4]);
        ouverture(ctx, P, 'u', b0, b0 + 0.36, f, 0, 8, '#33241a');
        poly(ctx, [P(f, b0 - 0.04, 10.5), P(f, b0 + 0.4, 10.5), P(f + 0.13, b0 + 0.4, 7), P(f + 0.13, b0 - 0.04, 7)], teinte(auvents[(k + v + 2) % 4], 0.8));
      }
    }
    // Balcons de bois sur la face gauche (la prestige a des moulures de marbre à la place).
    for (e = 1; e < (niv === 10 ? 2 : prestige ? 1 : 3); e++) {
      var hb2 = 12 + (e - 1) * hE;
      boite(ctx, P, 0.3, f, 1.7, f + 0.1, hb2, hb2 + 1.4, prestige ? C.marbre : C.bois);
      for (k = 0; k <= 10; k++) poteau(ctx, P, 0.3 + k * 0.14, f + 0.1, hb2 + 1.4, hb2 + 5, prestige ? C.marbre : C.bois, 1);
      ligne(ctx, P(0.3, f + 0.1, hb2 + 5), P(1.7, f + 0.1, hb2 + 5), prestige ? C.marbre : C.bois, 1.2);
    }
    if (prestige) bandeau(ctx, P, m - 0.03, m - 0.03, f + 0.03, f + 0.03, H, 3, C.marbre);
    if (niv === 10) {
      // Toit de tuiles en anneau autour d'une cour intérieure (puits de lumière avec un arbre).
      var r0 = 0.72, r1 = 1.28, ht = H + 7, d = 0.06;
      poly(ctx, [P(m - d, m - d, H), P(f + d, m - d, H), P(r1, r0, ht), P(r0, r0, ht)], teinte(C.tuile, 0.8));
      poly(ctx, [P(m - d, m - d, H), P(r0, r0, ht), P(r0, r1, ht), P(m - d, f + d, H)], teinte(C.tuile, 0.9));
      poly(ctx, [P(f + d, m - d, H), P(f + d, f + d, H), P(r1, r1, ht), P(r1, r0, ht)], teinte(C.tuile, 0.68));
      poly(ctx, [P(m - d, f + d, H), P(r0, r1, ht), P(r1, r1, ht), P(f + d, f + d, H)], teinte(C.tuile, 1.03));
      var trou = [P(r0, r0, ht), P(r1, r0, ht), P(r1, r1, ht), P(r0, r1, ht)];
      poly(ctx, trou, '#3b2a1c');
      ctx.save(); chemin(ctx, trou); ctx.clip();
      poly(ctx, [P(r0, r0, ht), P(r1, r0, ht), P(r1, r0, ht - 14), P(r0, r0, ht - 14)], teinte(murs, 0.75));
      poly(ctx, [P(r0, r0, ht), P(r0, r1, ht), P(r0, r1, ht - 14), P(r0, r0, ht - 14)], teinte(murs, 0.62));
      var ar = P(1.05, 1.05, ht - 6); cercle(ctx, ar[0], ar[1], 5, C.feuillage); cercle(ctx, ar[0] - 1.5, ar[1] - 1.5, 2.6, C.feuillageC);
      ctx.restore();
      return;
    }
    // Toit plat en terrasse, avec parapet.
    var hp = prestige ? H + 3 : H;
    poly(ctx, [P(m, m, hp), P(f, m, hp), P(f, f, hp), P(m, f, hp)], prestige ? '#e8dcc0' : '#c98a62');
    for (k = 1; k < 6; k++) { ligne(ctx, P(m + k * 0.3, m, hp), P(m + k * 0.3, f, hp), prestige ? '#d8caa8' : '#b5734e', 1); }
    if (niv === 11) {
      // Moitié du fond couverte de tuiles, terrasse devant avec une treille.
      toit(ctx, P, m, m, f, 0.95, H, 9, C.tuile, 'u');
      [[0.45, 1.25], [1.55, 1.25], [0.45, 1.7], [1.55, 1.7]].forEach(function (q) { poteau(ctx, P, q[0], q[1], H, H + 10, C.bois, 1.6); });
      for (k = 0; k < 7; k++) { var q2 = P(0.45 + k * 0.183, 1.25 + (k % 2) * 0.45, H + 10); cercle(ctx, q2[0], q2[1], 4, k % 2 ? '#4f8a35' : '#5f9e3c'); }
      ligne(ctx, P(0.45, 1.25, H + 10), P(1.55, 1.25, H + 10), C.bois, 1.4); ligne(ctx, P(0.45, 1.7, H + 10), P(1.55, 1.7, H + 10), C.bois, 1.4);
      for (k = 0; k < 6; k++) { var q3 = P(0.5 + k * 0.2, 1.48, H + 10.5); cercle(ctx, q3[0], q3[1], 3.6, k % 2 ? '#6aa845' : '#4f8a35'); }
      cercle(ctx, P(0.6, 1.48, H + 10)[0], P(0.6, 1.48, H + 10)[1] + 2, 1.5, '#6a2f7a');
      boite(ctx, P, m, f - 0.06, f, f, H, H + 3, murs); boite(ctx, P, f - 0.06, 0.95, f, f, H, H + 3, murs);
      return;
    }
    // Prestige : jardin sur le toit (cyprès, bacs fleuris, pergola) et pavillon couvert au fond.
    boite(ctx, P, m + 0.08, m + 0.08, 0.9, 0.9, hp, hp + 10, '#f4ead4');
    toit(ctx, P, m + 0.08, m + 0.08, 0.9, 0.9, hp + 10, 7, C.tuile, 'v');
    [[1.25, 0.35], [1.7, 0.4], [0.35, 1.3], [0.4, 1.72]].forEach(function (q) { var a = P(q[0], q[1], hp); cypres(ctx, a[0], a[1], 15); });
    [[1.0, 1.3], [1.4, 1.0], [1.3, 1.5]].forEach(function (q) {
      boite(ctx, P, q[0] - 0.12, q[1] - 0.12, q[0] + 0.12, q[1] + 0.12, hp, hp + 3, C.marbre, '#5f9e3c');
      var a = P(q[0], q[1], hp + 3); cercle(ctx, a[0] - 2, a[1] - 1, 1.4, '#e8584a'); cercle(ctx, a[0] + 2, a[1] - 0.5, 1.4, '#f2d24a'); cercle(ctx, a[0], a[1] - 2, 1.4, '#f6f0e6');
    });
    boite(ctx, P, m, f - 0.06, f, f, hp, hp + 3, C.marbre); boite(ctx, P, f - 0.06, m, f, f, hp, hp + 3, C.marbre);
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
      boite(ctx, P, 0.45, 0.45, 1.55, 1.55, 4, 26, nuance(C.marbre, 0.92));
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

  // ==========================================================================
  // Lot 2 : piles de biens, emblèmes des dieux, nouveaux bâtiments
  // ==========================================================================

  // Pile d'un bien dans un emplacement (u0..u1, v0..v1) ; q quarts (1 à 4) = hauteur de la pile.
  function pile(ctx, P, u0, v0, u1, v1, bien, q) {
    var c = BIENS[bien] || '#a89a80', f = FORME_BIEN[bien] || 'caisses', k, l, p;
    q = Math.max(1, Math.min(4, q | 0));
    var U = function (a) { return u0 + (u1 - u0) * a; }, V = function (b) { return v0 + (v1 - v0) * b; };
    if (f === 'caisses' || f === 'meubles' || f === 'armes') {
      var bois = f === 'meubles' ? '#7a4a2a' : f === 'armes' ? '#7d848c' : '#a8743f';
      var a0 = U(0.14), a1 = U(0.86), b0 = V(0.14), b1 = V(0.86), am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
      for (l = 0; l < q; l++) {
        var h0 = l * 5, h1 = h0 + 5;
        boite(ctx, P, a0, b0, a1, b1, h0, h1, bois, l === q - 1 ? teinte(bois, 1.12) : false);
        // Joints des caisses : arête basse et planche du milieu, sur les deux faces visibles.
        ligne(ctx, P(a0, b1, h0 + 0.5), P(a1, b1, h0 + 0.5), teinte(bois, 0.6), 1);
        ligne(ctx, P(a1, b0, h0 + 0.5), P(a1, b1, h0 + 0.5), teinte(bois, 0.48), 1);
        ligne(ctx, P(am, b1, h0), P(am, b1, h1), teinte(bois, 0.7), 1);
        ligne(ctx, P(a1, bm, h0), P(a1, bm, h1), teinte(bois, 0.55), 1);
      }
      var ht = q * 5;
      if (f === 'caisses') {
        // Les produits dépassent du dessus de la dernière caisse.
        poly(ctx, [P(a0 + 0.04, b0 + 0.04, ht), P(a1 - 0.04, b0 + 0.04, ht), P(a1 - 0.04, b1 - 0.04, ht), P(a0 + 0.04, b1 - 0.04, ht)], c);
        for (k = 0; k < 8; k++) {
          p = P(a0 + 0.06 + hachage(k, 3) * (a1 - a0 - 0.12), b0 + 0.06 + hachage(7, k) * (b1 - b0 - 0.12), ht);
          cercle(ctx, p[0], p[1] - 1, 1.8, k % 2 ? teinte(c, 1.22) : teinte(c, 0.8));
        }
      } else if (f === 'meubles') {
        // Une chaise posée sur la pile.
        p = P(am, bm, ht);
        ctx.fillStyle = '#c08a52'; ctx.fillRect(p[0] - 3, p[1] - 5, 6, 1.6);
        ctx.fillStyle = '#9a6436'; ctx.fillRect(p[0] - 3, p[1] - 3.4, 1.2, 3.4); ctx.fillRect(p[0] + 1.8, p[1] - 3.4, 1.2, 3.4);
        ctx.fillRect(p[0] + 1.8, p[1] - 11, 1.4, 7); ctx.fillRect(p[0] - 0.6, p[1] - 11, 3.8, 1.4);
      } else {
        // Lance couchée sur le dessus, bouclier rond appuyé contre la face gauche.
        ligne(ctx, P(a0, b0 + 0.06, ht + 1), P(a1, b1 - 0.06, ht + 1), '#6a4a2a', 1.5);
        p = P(am, b1 + 0.03, 0);
        ellipse(ctx, p[0], p[1] - 6, 4.6, 5.2, '#7a241c');
        ellipse(ctx, p[0] - 0.5, p[1] - 6.3, 3.5, 4.1, C.secu);
        cercle(ctx, p[0] - 0.3, p[1] - 6.2, 1.4, C.or);
      }
    } else if (f === 'sacs') {
      for (l = 0; l < q; l++) {
        var e = 0.12 + l * 0.08;
        [[e, e], [1 - e, e], [e, 1 - e], [1 - e, 1 - e]].forEach(function (s) {
          var b = P(U(0.1 + s[0] * 0.8), V(0.1 + s[1] * 0.8), l * 4.2);
          sac(ctx, b[0], b[1], c);
        });
      }
    } else if (f === 'paniers') {
      // Grand bac d'osier bas, chargement en tas qui monte avec les quarts : poissons, olives ou grappes.
      var c0 = U(0.12), c1 = U(0.88), d0 = V(0.12), d1 = V(0.88);
      boite(ctx, P, c0, d0, c1, d1, 0, 4, '#a87a3e', '#5a3e24');
      ligne(ctx, P(c0, d1, 2), P(c1, d1, 2), '#c99a5a', 1); ligne(ctx, P(c1, d0, 2), P(c1, d1, 2), '#8a6230', 1);
      p = P(U(0.5), V(0.5), 4);
      tas(ctx, p[0], p[1], 12.5, 2 + q * 2.8, c, 9);
      for (k = 0; k < 3 + q * 2; k++) {
        var x = p[0] + (hachage(k, 21) - 0.5) * 18, y = p[1] - 1 - hachage(21, k) * (1 + q * 2.2);
        if (bien === 'poisson') {
          ellipse(ctx, x, y, 2.8, 1.1, '#c9d6de'); poly(ctx, [[x - 2.6, y], [x - 4.2, y - 1.3], [x - 4.2, y + 1.3]], '#9fb2bf');
        } else if (bien === 'raisin') {
          cercle(ctx, x - 1, y, 1.3, '#9a5aa8'); cercle(ctx, x + 1, y, 1.3, '#5a2468'); cercle(ctx, x, y + 1.6, 1.2, '#6a2f7a');
        } else cercle(ctx, x, y, 1.2, k % 2 ? '#7f9a50' : '#2f3a22');
      }
    } else if (f === 'tas') {
      p = P(U(0.5), V(0.55), 0); tas(ctx, p[0], p[1], 13, 3 + q * 3.4, c, 5);
    } else if (f === 'rondins') {
      for (l = 0; l < q; l++) {
        var vs = l % 2 ? [0.36, 0.64] : [0.22, 0.5, 0.78];
        for (k = 0; k < vs.length; k++) rondin(ctx, P, U(0.1), U(0.9), V(vs[k]), l * 4.2, 2.3, c);
      }
    } else if (f === 'lingots') {
      for (l = 0; l < q; l++) for (k = 0; k < 3; k++) {
        var m2 = 0.25 + k * 0.25, hl = l * 2.8;
        if (l % 2) boite(ctx, P, U(m2) - 0.045, V(0.16), U(m2) + 0.045, V(0.84), hl, hl + 2.8, c, teinte(c, 1.4));
        else boite(ctx, P, U(0.14), V(m2) - 0.055, U(0.86), V(m2) + 0.055, hl, hl + 2.8, c, teinte(c, 1.4));
      }
    } else if (f === 'blocs') {
      [[0.3, 0.3, 0], [0.7, 0.34, 0], [0.36, 0.72, 0], [0.52, 0.48, 7]].slice(0, q).forEach(function (s) {
        var u = U(s[0]), v = V(s[1]);
        boite(ctx, P, u - 0.13, v - 0.13, u + 0.13, v + 0.13, s[2], s[2] + 7, '#e3dfd5', '#f8f5ef');
        ligne(ctx, P(u - 0.1, v + 0.13, s[2] + 5), P(u + 0.05, v + 0.13, s[2] + 2), '#b8b2a6', 1);
      });
    } else {
      // Jarres de poterie, amphores d'huile ou de vin : une rangée par quart.
      for (l = 0; l < q; l++) for (k = 0; k < 3; k++) {
        p = P(U(0.2 + k * 0.3), V(0.16 + l * 0.22), 0);
        amphore(ctx, p[0], p[1], c, f === 'jarres');
      }
    }
  }

  // Couleur de chaque dieu ; son emblème est un objet dessiné, jamais une lettre.
  var DIEUX = { ceres: '#d9a93a', neptune: '#2c9a9c', mercure: '#e8b72e', mars: '#c0392b', venus: '#e98bb2' };
  // Emblème posé par sa base en (x, y), haut d'environ 12 × s pixels, cerné de sombre pour se lire partout.
  function embleme(ctx, dieu, x, y, s) {
    var c = DIEUX[dieu] || C.or, f = teinte(c, 0.5), k;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var deux = function (trace, l) {
      ctx.strokeStyle = f; ctx.lineWidth = (l + 1.2) * s; trace(); ctx.stroke();
      ctx.strokeStyle = c; ctx.lineWidth = l * s; trace(); ctx.stroke();
    };
    if (dieu === 'neptune') {
      // Trident : hampe, traverse courbe, trois dents à pointe barbelée.
      deux(function () {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 10.5 * s);
        ctx.moveTo(x - 3.6 * s, y - 10 * s); ctx.lineTo(x - 3.6 * s, y - 7.6 * s); ctx.quadraticCurveTo(x - 3.6 * s, y - 6 * s, x, y - 6 * s);
        ctx.quadraticCurveTo(x + 3.6 * s, y - 6 * s, x + 3.6 * s, y - 7.6 * s); ctx.lineTo(x + 3.6 * s, y - 10 * s);
      }, 1.5);
      [-3.6, 0, 3.6].forEach(function (d) {
        var px = x + d * s, py = (d ? y - 10 * s : y - 10.5 * s);
        poly(ctx, [[px - 1.7 * s, py + 0.6 * s], [px, py - 2.6 * s], [px + 1.7 * s, py + 0.6 * s]], c, f);
      });
    } else if (dieu === 'mercure') {
      // Bâton ailé : hampe, boule, deux ailes à plumes.
      deux(function () { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 10 * s); }, 1.5);
      [-1, 1].forEach(function (d) {
        poly(ctx, [[x + d * 0.6 * s, y - 8.2 * s], [x + d * 5.6 * s, y - 11.6 * s], [x + d * 4.6 * s, y - 9.6 * s], [x + d * 5.8 * s, y - 9.2 * s],
          [x + d * 4.4 * s, y - 7.6 * s], [x + d * 5.2 * s, y - 6.8 * s], [x + d * 0.8 * s, y - 6.4 * s]], c, f);
      });
      cercle(ctx, x, y - 11.2 * s, 1.7 * s, c, f);
    } else if (dieu === 'mars') {
      // Lance en travers, bouclier rond à ombilic doré.
      deux(function () { ctx.beginPath(); ctx.moveTo(x - 4.6 * s, y); ctx.lineTo(x + 3.8 * s, y - 10.6 * s); }, 1.3);
      poly(ctx, [[x + 2.6 * s, y - 10.2 * s], [x + 5.4 * s, y - 13.2 * s], [x + 4.4 * s, y - 9.2 * s]], '#d8d4cc', f);
      cercle(ctx, x - 0.6 * s, y - 5.6 * s, 4.4 * s, c, f);
      cercle(ctx, x - 0.6 * s, y - 5.6 * s, 3 * s, teinte(c, 1.18));
      cercle(ctx, x - 0.6 * s, y - 5.6 * s, 1.3 * s, C.or);
    } else if (dieu === 'venus') {
      // Coquille Saint-Jacques : éventail festonné et côtes rayonnantes.
      var cx = x, cy = y - 1.4 * s, pts = [[cx, cy]];
      for (k = 0; k <= 12; k++) {
        var a = Math.PI + Math.PI * k / 12, r = (k % 2 ? 6.1 : 6.8) * s;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.05]);
      }
      poly(ctx, pts, c, f);
      ctx.strokeStyle = teinte(c, 0.72); ctx.lineWidth = 0.8 * s;
      for (k = 1; k < 6; k++) {
        var a2 = Math.PI + Math.PI * k / 6;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a2) * 6 * s, cy + Math.sin(a2) * 6.3 * s); ctx.stroke();
      }
      poly(ctx, [[cx - 2.4 * s, cy + 1.4 * s], [cx - 1.6 * s, cy - 0.6 * s], [cx + 1.6 * s, cy - 0.6 * s], [cx + 2.4 * s, cy + 1.4 * s]], teinte(c, 0.85), f);
    } else {
      // Cérès : gerbe de blé liée, épis en éventail.
      for (k = -2; k <= 2; k++) {
        var hx = x + k * 2.2 * s, hy = y - (10.4 - Math.abs(k) * 1.1) * s;
        ctx.strokeStyle = f; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(x + k * 0.5 * s, y); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.save(); ctx.translate(hx, hy - 1.4 * s); ctx.rotate(k * 0.22);
        ctx.beginPath(); ctx.ellipse(0, 0, 1.4 * s, 2.8 * s, 0, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = f; ctx.lineWidth = 0.8 * s; ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = f; ctx.fillRect(x - 2.2 * s, y - 3.6 * s, 4.4 * s, 1.4 * s);
    }
    ctx.restore();
  }
  // Petite flamme sacrée (autel, trépied) : base en (x, y).
  function flamme(ctx, x, y, s) {
    poly(ctx, [[x - 3 * s, y], [x - 2.2 * s, y - 4 * s], [x - 0.6 * s, y - 3 * s], [x, y - 8 * s], [x + 1.2 * s, y - 3.4 * s], [x + 2.6 * s, y - 5 * s], [x + 3 * s, y]], '#ea7a2a');
    poly(ctx, [[x - 1.6 * s, y], [x - 0.4 * s, y - 4.4 * s], [x + 1.6 * s, y]], '#f8d44a');
  }

  // Petit temple (2 × 2) : fronton tourné vers la face gauche, frise, porte et tympan à la couleur du dieu,
  // emblème debout au sommet du fronton.
  function peindreTemple(ctx, P, dieu) {
    var a = DIEUX[dieu];
    sol(ctx, P, 0.05, 0.05, 1.95, 1.95, teinte(C.marbre, 0.94));
    boite(ctx, P, 0.14, 0.12, 1.86, 1.76, 0, 3, nuance(C.marbre, 0.95));
    boite(ctx, P, 0.22, 0.2, 1.78, 1.68, 3, 6, C.marbre);
    boite(ctx, P, 0.5, 0.45, 1.5, 1.3, 6, 26, nuance(C.marbre, 0.9));
    ouverture(ctx, P, 'v', 0.8, 1.2, 1.3, 6, 17, teinte(a, 0.62), 3);
    colonnade(ctx, P, 0.3, 0.28, 1.7, 1.6, 6, 24, 4, 3, C.marbre);
    boite(ctx, P, 0.26, 0.24, 1.74, 1.64, 24, 29, a);
    toit(ctx, P, 0.26, 0.24, 1.74, 1.64, 29, 12, C.relig, 'v');
    poly(ctx, [P(0.44, 1.72, 30.6), P(1.56, 1.72, 30.6), P(1.0, 1.72, 38.6)], teinte(a, 1.42));
    var s = P(1.0, 1.72, 41.5);
    embleme(ctx, dieu, s[0], s[1], 1.2);
  }
  // Grand temple (3 × 3) : trois degrés, colonnade de 6 sur 5, statue du dieu tenant son emblème, autel.
  function peindreGrandTemple(ctx, P, dieu) {
    var a = DIEUX[dieu];
    sol(ctx, P, 0.04, 0.04, 2.96, 2.96, teinte(C.marbre, 0.9));
    sol(ctx, P, 0.35, 2.36, 2.65, 2.94, teinte(C.marbre, 0.98));
    boite(ctx, P, 0.1, 0.1, 2.9, 2.36, 0, 3, nuance(C.marbre, 0.93));
    boite(ctx, P, 0.18, 0.16, 2.82, 2.28, 3, 6, nuance(C.marbre, 0.97));
    boite(ctx, P, 0.26, 0.22, 2.74, 2.2, 6, 9, C.marbre);
    boite(ctx, P, 0.72, 0.6, 2.28, 1.78, 9, 38, nuance(C.marbre, 0.9));
    ouverture(ctx, P, 'v', 1.22, 1.78, 1.78, 9, 26, teinte(a, 0.62), 5);
    colonnade(ctx, P, 0.36, 0.3, 2.64, 2.12, 9, 36, 6, 5, C.marbre);
    boite(ctx, P, 0.3, 0.25, 2.7, 2.16, 36, 42, a);
    bandeau(ctx, P, 0.3, 0.25, 2.7, 2.16, 41, 1, '#f4e7c4');
    toit(ctx, P, 0.3, 0.25, 2.7, 2.16, 42, 16, C.relig, 'v');
    poly(ctx, [P(0.52, 2.24, 43.8), P(2.48, 2.24, 43.8), P(1.5, 2.24, 55)], teinte(a, 1.42));
    [[0.22, 42], [2.78, 42]].forEach(function (q) { var g = P(q[0], 2.24, q[1]); cercle(ctx, g[0], g[1] - 2, 2.2, C.or, teinte(C.or, 0.6)); });
    var sm = P(1.5, 2.24, 58.4);
    embleme(ctx, dieu, sm[0], sm[1], 1.05);
    // Autel fumant, à droite de l'esplanade.
    boite(ctx, P, 2.42, 2.48, 2.72, 2.78, 0, 6, C.marbre, teinte(a, 1.25));
    var fl = P(2.57, 2.63, 6); flamme(ctx, fl[0], fl[1], 1.1);
    // Statue du dieu (bronze doré, manteau à sa couleur) qui brandit son emblème.
    boite(ctx, P, 1.34, 2.5, 1.66, 2.82, 0, 9, C.marbre, teinte(C.marbre, 1.04));
    var st = P(1.5, 2.66, 9), main = figure(ctx, st[0], st[1], 1.2, '#c49a52', true, a);
    embleme(ctx, dieu, main[0], main[1] + 5, 0.75);
  }

  // Ferme (lot 2) : maisonnette au coin nord, cultures partout ailleurs. Toutes les plantations
  // sont à u > 0,9 ou v > 0,9 : toujours devant la maisonnette, qu'on peint donc en premier.
  function fermette(ctx, P) {
    boite(ctx, P, 0.1, 0.1, 0.9, 0.9, 0, 12, C.enduit);
    var d = P(0.5, 0.9, 0); ctx.fillStyle = teinte(C.bois, 0.55); ctx.fillRect(d[0] - 2, d[1] - 8, 4, 7);
    toit(ctx, P, 0.1, 0.1, 0.9, 0.9, 12, 8, C.alim, 'u');
  }
  // Appelle f(u, v, r) sur une grille de rangées le long de u, en évitant la maisonnette.
  function rangs(v0, pasV, nV, u0, pasU, f) {
    for (var r = 0; r < nV; r++) {
      var v = v0 + r * pasV, u = u0;
      if (v < 1.02) while (u < 1.12) u += pasU;
      for (; u < 2.9; u += pasU) f(u, v, r);
    }
  }
  // Olivier : tronc tordu, feuillage gris-vert large et bas ; fruits selon la saison (p de 0 à 1).
  function olivier(ctx, x, y, p, g) {
    ellipse(ctx, x + 1, y + 1, 8, 3, 'rgba(40,50,20,0.28)');
    poly(ctx, [[x - 2, y], [x - 1, y - 5], [x - 3, y - 9], [x - 1, y - 9], [x + 0.5, y - 6], [x + 2, y - 10], [x + 3.5, y - 10], [x + 1.5, y - 5], [x + 2.2, y]], '#6b5a48');
    cercle(ctx, x - 4, y - 11, 4.6, '#6f8255'); cercle(ctx, x + 4, y - 11.5, 4.8, '#64774c');
    cercle(ctx, x, y - 14, 5.2, '#82956a'); cercle(ctx, x - 2.5, y - 15.5, 3, '#a6b48a'); cercle(ctx, x + 2.8, y - 13.2, 2.2, '#93a378');
    var n = p < 0.3 ? 0 : Math.round(2 + p * 6);
    for (var k = 0; k < n; k++) cercle(ctx, x + (hachage(g, k) - 0.5) * 12, y - 10 - hachage(k, g) * 7, 1.2, p < 0.7 ? '#9aa64a' : '#3d2f45');
  }

  // Quai et maison du pêcheur : la barque d'un quai (ou le bateau en mer, sens donné par pose).
  function barque(ctx, x, y, voile, pose) {
    var o = pose ? 1 : 0;
    ctx.strokeStyle = 'rgba(214,236,255,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 20 + o * 2, y + 1); ctx.lineTo(x - 13, y + 1); ctx.moveTo(x - 17 + o * 2, y + 3.5); ctx.lineTo(x - 9, y + 3.5); ctx.moveTo(x + 8, y + 3.5); ctx.lineTo(x + 15 - o * 2, y + 2.5); ctx.stroke();
    // Coque : flanc proche sombre, intérieur clair, bande colorée.
    poly(ctx, [[x - 14, y - 6], [x - 6, y - 3.6], [x + 6, y - 3.8], [x + 16, y - 8.4], [x + 11, y + 0.6], [x - 11, y + 0.6]], '#6e4626');
    poly(ctx, [[x - 13, y - 4.6], [x - 6, y - 2.4], [x + 6, y - 2.6], [x + 14.5, y - 6.6], [x + 14, y - 5.4], [x + 6, y - 1.4], [x - 6, y - 1.2], [x - 12.5, y - 3.4]], '#3f6f9a');
    poly(ctx, [[x - 14, y - 6], [x - 6, y - 8.6], [x + 6, y - 9.2], [x + 16, y - 8.4], [x + 6, y - 3.8], [x - 6, y - 3.6]], '#b98a52');
    poly(ctx, [[x - 11, y - 6.2], [x - 6, y - 7.4], [x + 6, y - 7.8], [x + 12, y - 8], [x + 6, y - 5.2], [x - 6, y - 5]], '#8a6238');
    ctx.fillStyle = '#d9b27a'; ctx.fillRect(x - 3, y - 7.6, 2, 3.6);
    // Mât et voile latine (barque au quai : voile ferlée).
    ctx.fillStyle = '#4a3220'; ctx.fillRect(x + 1, y - (voile ? 25 : 20), 1.6, voile ? 19 : 14);
    if (voile) {
      poly(ctx, [[x + 2.6, y - 24], [x + 13 - o, y - 11], [x + 2.6, y - 10]], '#f1e6c8');
      poly(ctx, [[x + 2.6, y - 24], [x + 8 - o * 0.5, y - 17], [x + 2.6, y - 17]], '#fbf4e2');
      ligne(ctx, [x - 3, y - 21.5], [x + 14 - o, y - 10], '#6e4626', 1);
      // Pêcheur à la poupe.
      ctx.fillStyle = '#3d6f9c'; ctx.fillRect(x - 10, y - 12, 3.6, 5);
      cercle(ctx, x - 8.2, y - 13.6, 1.9, '#e1c8a8');
    } else {
      poly(ctx, [[x + 0.5, y - 19], [x + 3.4, y - 17], [x + 3.4, y - 9], [x + 0.5, y - 9]], '#e6dcc0');
    }
  }

  PEINTRES.ferme_legumes = function (ctx, P, t, etat) {
    var p = etat.prog || 0;
    sol(ctx, P, 0, 0, 3, 3, teinte(C.terre, 0.9));
    // Billons de terre claire, un rang de légumes sur chacun.
    for (var r = 0; r < 6; r++) {
      var v = 0.32 + r * 0.45;
      sol(ctx, P, v < 1.02 ? 1.0 : 0.12, v - 0.13, 2.88, v + 0.13, teinte(C.terre, 1.07));
    }
    fermette(ctx, P);
    var sortes = [['#4a8a36', '#78b552'], ['#93c757', '#bfe07e'], ['#3b7444', '#5f9a5c']];
    rangs(0.32, 0.45, 6, 0.24, 0.26, function (u, v, r) {
      var q = P(u, v, 0), s = sortes[r % 3], k = 0.6 + 2.8 * p;
      if (r % 3 === 2) {
        // Poireaux : touffes dressées.
        ellipse(ctx, q[0], q[1] - k * 1.1, 1.1 + k * 0.25, k * 1.1 + 0.6, s[0]);
        ellipse(ctx, q[0] - 0.5, q[1] - k * 1.5, 0.7 + k * 0.15, k * 0.6, s[1]);
      } else {
        // Choux et salades : boules.
        ellipse(ctx, q[0], q[1] - k * 0.6, k + 0.9, k * 0.75 + 0.6, s[0]);
        ellipse(ctx, q[0] - k * 0.25, q[1] - k * 0.9, k * 0.55 + 0.3, k * 0.38 + 0.2, s[1]);
      }
    });
    if (p >= 0.75) {
      // Récolte : paniers de légumes près de la maison.
      var b = P(1.25, 1.18, 0); panier(ctx, b[0], b[1], '#5f9e3c');
    }
  };
  PEINTRES.ferme_fruits = function (ctx, P, t, etat) {
    var p = etat.prog || 0;
    sol(ctx, P, 0, 0, 3, 3, teinte(C.prairie, 0.94));
    for (var r = 0; r < 4; r++) { var v = 0.5 + r * 0.72; sol(ctx, P, v < 1 ? 1.1 : 0.15, v - 0.16, 2.88, v + 0.16, teinte(C.prairie, 0.86)); }
    fermette(ctx, P);
    var sc = scene();
    [0.5, 1.22, 1.94, 2.62].forEach(function (u, i) {
      [0.5, 1.22, 1.94, 2.62].forEach(function (v, j) {
        if (u < 1 && v < 1) return;
        sc.ajouter(u, v, function () {
          var q = P(u, v, 0), g = i * 4 + j;
          arbuste(ctx, q[0], q[1], 6.8, '#4f8a35');
          // Au printemps des fleurs, puis des fruits de plus en plus nombreux.
          var fleur = p > 0.1 && p < 0.45, nb = fleur ? 6 : p < 0.45 ? 0 : Math.round(3 + p * 6);
          for (var k = 0; k < nb; k++) {
            var x = q[0] + (hachage(g, k) - 0.5) * 11, y = q[1] - 11.5 + (hachage(k, g + 9) - 0.5) * 9;
            cercle(ctx, x, y, fleur ? 1.2 : 1.6, fleur ? '#f8e6ee' : (k % 3 ? '#f28a22' : '#d8432e'));
          }
        });
      });
    });
    if (p >= 0.75) sc.ajouter(1.5, 1.6, function () { var b = P(1.58, 1.58, 0); panier(ctx, b[0], b[1], '#ee8a2a'); });
    sc.peindre();
  };
  PEINTRES.ferme_porcs = function (ctx, P, t, etat) {
    var p = etat.prog || 0;
    sol(ctx, P, 0, 0, 3, 3, teinte(C.terre, 1.02));
    // Enclos boueux, flaques.
    poly(ctx, [P(1.05, 0.15), P(2.85, 0.15), P(2.85, 2.85), P(0.15, 2.85), P(0.15, 1.05), P(1.05, 1.05)], '#8e6b46');
    [[1.6, 2.3, 9, 4], [2.3, 1.0, 7, 3], [0.8, 1.7, 6, 2.5]].forEach(function (f) { var q = P(f[0], f[1], 0); ellipse(ctx, q[0], q[1], f[2], f[3], '#6c5034'); });
    cloture(ctx, P, 1.05, 0.15, 2.85, 0.15, 5);
    cloture(ctx, P, 0.15, 1.05, 0.15, 2.85, 5);
    fermette(ctx, P);
    cloture(ctx, P, 1.05, 0.15, 1.05, 1.05, 2);
    cloture(ctx, P, 0.15, 1.05, 1.05, 1.05, 2);
    // Porcherie : abri de planches au toit de chaume.
    boite(ctx, P, 1.85, 0.3, 2.7, 0.85, 0, 9, C.boisC);
    ouverture(ctx, P, 'v', 2.05, 2.4, 0.85, 0, 6, '#3b2a1c');
    toit(ctx, P, 1.85, 0.3, 2.7, 0.85, 9, 6, C.chaume, 'u');
    // Auge.
    boite(ctx, P, 0.45, 2.3, 1.3, 2.45, 0, 3, '#7a5232', '#5b3e24');
    // Cochons : un de plus par quart de l'élevage.
    var places = [[1.55, 1.55, 1], [2.25, 1.35, -1], [0.85, 2.05, 1], [1.75, 2.35, -1], [2.45, 2.1, 1], [1.2, 1.4, -1]];
    var sc = scene(), n = 1 + Math.round(p * 5);
    places.slice(0, n).forEach(function (q) { sc.ajouter(q[0], q[1], function () { var b = P(q[0], q[1], 0); cochon(ctx, b[0], b[1], 1, q[2]); }); });
    sc.peindre();
    cloture(ctx, P, 2.85, 0.15, 2.85, 2.85, 8);
    cloture(ctx, P, 0.15, 2.85, 2.85, 2.85, 8);
  };
  // Cochon rose : pattes en (x, y), sens 1 = tête à droite.
  function cochon(ctx, x, y, s, sens) {
    ellipse(ctx, x, y + 0.5, 6 * s, 1.8 * s, 'rgba(50,30,20,0.3)');
    ctx.fillStyle = '#b86c6a';
    [-3.6, -1.6, 1.6, 3.6].forEach(function (d) { ctx.fillRect(x + d * s - 0.7, y - 2.6 * s, 1.4, 2.6 * s); });
    ellipse(ctx, x, y - 4 * s, 5.8 * s, 3.4 * s, '#e99d98');
    ellipse(ctx, x - 0.6 * s, y - 5.2 * s, 4.2 * s, 1.7 * s, '#f6c3bc');
    cercle(ctx, x + sens * 5 * s, y - 4.6 * s, 2.7 * s, '#e99d98');
    ellipse(ctx, x + sens * 7.4 * s, y - 4.2 * s, 1.1 * s, 1.4 * s, '#cf7f7c');
    poly(ctx, [[x + sens * 3.8 * s, y - 6.4 * s], [x + sens * 4.6 * s, y - 8.6 * s], [x + sens * 5.8 * s, y - 6.6 * s]], '#d48884');
    cercle(ctx, x + sens * 5.8 * s, y - 5.3 * s, 0.6 * s, '#3a2420');
    ctx.strokeStyle = '#d48884'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x - sens * 6.4 * s, y - 5.4 * s, 1.2 * s, 0, Math.PI * 1.5); ctx.stroke();
  }
  PEINTRES.ferme_olives = function (ctx, P, t, etat) {
    var p = etat.prog || 0;
    sol(ctx, P, 0, 0, 3, 3, '#c4b37a');
    for (var k = 0; k < 18; k++) { var q = P(0.2 + hachage(k, 2) * 2.6, 0.2 + hachage(4, k) * 2.6, 0); if (hachage(k, 2) > 0.33 || hachage(4, k) > 0.33) { ctx.fillStyle = '#a79a5e'; ctx.fillRect(q[0], q[1], 3, 1); } }
    fermette(ctx, P);
    var sc = scene();
    for (var r = 0; r < 4; r++) for (var i = 0; i < 4; i++) {
      (function (u, v, g) {
        if (u < 1.05 && v < 1.05) return;
        sc.ajouter(u, v, function () { var b = P(u, v, 0); olivier(ctx, b[0], b[1], p, g); });
      })(0.42 + i * 0.7 + (r % 2 ? 0.28 : 0), 0.45 + r * 0.7, r * 4 + i);
    }
    sc.peindre();
  };
  PEINTRES.ferme_vigne = function (ctx, P, t, etat) {
    var p = etat.prog || 0, k;
    sol(ctx, P, 0, 0, 3, 3, teinte(C.terre, 1.04));
    var vs = [0.38, 0.82, 1.3, 1.75, 2.2, 2.65];
    vs.forEach(function (v) { sol(ctx, P, v < 1 ? 1.05 : 0.15, v - 0.06, 2.88, v + 0.06, teinte(C.terre, 0.86)); });
    fermette(ctx, P);
    var f = Math.min(1, 0.35 + p * 1.3);
    vs.forEach(function (v, r) {
      var u0 = v < 1 ? 1.15 : 0.22, u1 = 2.8, u;
      // Échalas et fil de fer.
      for (u = u0; u <= u1 + 0.01; u += (u1 - u0) / 5) poteau(ctx, P, u, v, 0, 12, '#6e4a2c', 1.6);
      ligne(ctx, P(u0, v, 10.5), P(u1, v, 10.5), '#5a4632', 1);
      // Feuillage le long du rang, plus fourni avec la saison.
      for (u = u0; u <= u1; u += 0.12) {
        var g = hachage(r, Math.round(u * 20)), q = P(u, v, 8);
        cercle(ctx, q[0], q[1] - g * 1.5, 2 + 1.8 * f, g > 0.5 ? '#4f8a35' : '#3f7a2e');
        cercle(ctx, q[0] - 1, q[1] - 1.6 - g, 1 + 1.2 * f, '#72ad4c');
      }
      // Grappes violettes sous les feuilles.
      if (p >= 0.3) for (k = 0; k < Math.round(1 + p * 6); k++) {
        var q2 = P(u0 + 0.12 + hachage(k, r + 3) * (u1 - u0 - 0.24), v + 0.04, 5);
        cercle(ctx, q2[0] - 1.3, q2[1] - 1, 1.5, '#6a2f7a'); cercle(ctx, q2[0] + 1.3, q2[1] - 1, 1.5, '#6a2f7a');
        cercle(ctx, q2[0], q2[1] + 1.2, 1.5, '#5a2468'); cercle(ctx, q2[0] - 0.6, q2[1] - 1.5, 0.7, '#a070b0');
      }
    });
  };
  PEINTRES.quai_peche = function (ctx, P, t, etat) {
    // Rive : eau côté +u (la mer, au-delà de l'emprise), sable côté terre.
    sol(ctx, P, 1.0, 0, 2, 2, C.eau);
    ctx.strokeStyle = C.eauClair; ctx.lineWidth = 1;
    [[1.4, 0.3], [1.75, 0.55], [1.5, 1.75], [1.85, 1.45]].forEach(function (q) { var a = P(q[0], q[1], 0); ctx.beginPath(); ctx.moveTo(a[0] - 4, a[1]); ctx.lineTo(a[0] + 4, a[1]); ctx.stroke(); });
    poly(ctx, [P(0, 0), P(1.18, 0), P(1.08, 0.6), P(1.22, 1.3), P(1.1, 2), P(0, 2)], C.sable);
    ligne(ctx, P(1.18, 0), P(1.08, 0.6), teinte(C.sable, 0.8), 2); ligne(ctx, P(1.08, 0.6), P(1.22, 1.3), teinte(C.sable, 0.8), 2); ligne(ctx, P(1.22, 1.3), P(1.1, 2), teinte(C.sable, 0.8), 2);
    // Cabane du pêcheur.
    boite(ctx, P, 0.15, 0.18, 0.85, 0.82, 0, 12, C.boisC);
    ouverture(ctx, P, 'v', 0.38, 0.6, 0.82, 0, 8, '#3b2a1c');
    toit(ctx, P, 0.15, 0.18, 0.85, 0.82, 12, 7, C.alim, 'v');
    // Filet qui sèche sur deux perches.
    poteau(ctx, P, 0.25, 1.3, 0, 12, '#6e4a2c', 2); poteau(ctx, P, 0.85, 1.3, 0, 12, '#6e4a2c', 2);
    var n0 = P(0.25, 1.3, 11), n1 = P(0.85, 1.3, 11), n2 = P(0.85, 1.3, 3), n3 = P(0.25, 1.3, 3);
    poly(ctx, [n0, n1, n2, n3], 'rgba(120,96,64,0.35)');
    ctx.strokeStyle = 'rgba(90,70,46,0.8)'; ctx.lineWidth = 0.8;
    for (var k = 1; k < 6; k++) { var f = k / 6; ctx.beginPath(); ctx.moveTo(n0[0] + (n1[0] - n0[0]) * f, n0[1] + (n1[1] - n0[1]) * f); ctx.lineTo(n3[0] + (n2[0] - n3[0]) * f, n3[1] + (n2[1] - n3[1]) * f); ctx.stroke(); }
    for (k = 1; k < 4; k++) { var g = k / 4; ctx.beginPath(); ctx.moveTo(n0[0], n0[1] + (n3[1] - n0[1]) * g); ctx.lineTo(n1[0], n1[1] + (n2[1] - n1[1]) * g); ctx.stroke(); }
    // Paniers de poissons.
    var b = P(0.55, 1.72, 0); panier(ctx, b[0], b[1], BIENS.poisson); b = P(0.95, 1.6, 0); panier(ctx, b[0], b[1], BIENS.poisson);
    // Ponton sur pilotis, vers +u.
    for (k = 0; k < 4; k++) { poteau(ctx, P, 1.2 + k * 0.25, 0.78, -3, 4, '#5a3e26', 2); }
    poly(ctx, [P(0.95, 0.78, 4), P(1.95, 0.78, 4), P(1.95, 1.2, 4), P(0.95, 1.2, 4)], C.boisC);
    poly(ctx, [P(0.95, 1.2, 4), P(1.95, 1.2, 4), P(1.95, 1.2, 1.5), P(0.95, 1.2, 1.5)], teinte(C.bois, 0.9));
    poly(ctx, [P(1.95, 0.78, 4), P(1.95, 1.2, 4), P(1.95, 1.2, 1.5), P(1.95, 0.78, 1.5)], teinte(C.bois, 0.7));
    for (k = 1; k < 8; k++) ligne(ctx, P(0.95 + k * 0.125, 0.78, 4), P(0.95 + k * 0.125, 1.2, 4), teinte(C.boisC, 0.82), 1);
    for (k = 0; k < 4; k++) { poteau(ctx, P, 1.2 + k * 0.25, 1.2, -3, 1.5, '#5a3e26', 2); }
    poteau(ctx, P, 1.9, 1.16, 4, 9, '#5a3e26', 2.4);
    // Barque amarrée devant le ponton.
    if (etat.bateau) { var bq = P(1.55, 1.58, 0); barque(ctx, bq[0], bq[1], false, 0); ligne(ctx, P(1.9, 1.16, 8), [bq[0] + 12, bq[1] - 8], '#d9c39a', 1); }
  };

  PEINTRES.carriere_argile = function (ctx, P, t, etat) {
    var p = etat.prog || 0, k;
    sol(ctx, P, 0.03, 0.03, 1.97, 1.97, '#b88a62');
    // Fosse : ouverture sombre, parois du fond (strates), flaque.
    var f0 = 0.15, f1 = 1.12, g0 = 0.2, g1 = 1.25, bord = [P(f0, g0), P(f1, g0), P(f1, g1), P(f0, g1)];
    poly(ctx, bord, '#7c4630');
    ctx.save(); chemin(ctx, bord); ctx.clip();
    poly(ctx, [P(f0, g0, 0), P(f1, g0, 0), P(f1, g0, -10), P(f0, g0, -10)], '#a85d3c');
    poly(ctx, [P(f0, g0, 0), P(f0, g1, 0), P(f0, g1, -10), P(f0, g0, -10)], '#8f4e33');
    for (k = 1; k < 3; k++) { ligne(ctx, P(f0, g0, -k * 3.3), P(f1, g0, -k * 3.3), '#c27248', 1); ligne(ctx, P(f0, g0, -k * 3.3), P(f0, g1, -k * 3.3), '#a35c3c', 1); }
    var fl = P(0.75, 0.85, -10); ellipse(ctx, fl[0], fl[1], 9, 3.5, '#6f7f86');
    ctx.restore();
    // Échelle qui descend dans la fosse.
    ligne(ctx, P(0.35, 1.25, 3), P(0.42, 0.95, -10), '#6e4a2c', 1.5); ligne(ctx, P(0.55, 1.25, 3), P(0.62, 0.95, -10), '#6e4a2c', 1.5);
    // Abri du fond à droite : toit sur quatre poteaux.
    [[1.3, 0.2], [1.85, 0.2], [1.3, 0.75], [1.85, 0.75]].forEach(function (q) { poteau(ctx, P, q[0], q[1], 0, 10, '#6e4a2c', 2); });
    toit(ctx, P, 1.3, 0.2, 1.85, 0.75, 10, 5, C.indus, 'v');
    // Tas d'argile extraite (selon la production).
    if (p > 0) { var b = P(1.48, 1.08, 0); tas(ctx, b[0], b[1], 7 + p * 6, 3 + p * 8, BIENS.argile, 2); }
    // Briques qui sèchent, en rangées devant.
    for (var r = 0; r < 2; r++) for (k = 0; k < 6; k++) {
      var u = 0.3 + k * 0.24, v = 1.5 + r * 0.2;
      if (r * 6 + k < 4 + Math.round(p * 8)) boite(ctx, P, u, v, u + 0.15, v + 0.09, 0, 2.5, '#c4683f');
    }
  };
  PEINTRES.camp_bucherons = function (ctx, P, t, etat) {
    var p = etat.prog || 0, k;
    sol(ctx, P, 0.03, 0.03, 1.97, 1.97, '#8e8c50');
    var sc = P(1.15, 1.2, 0); ellipse(ctx, sc[0], sc[1], 22, 9, '#c9a874');
    // Sapins au fond à droite.
    [[1.55, 0.22], [1.85, 0.5]].forEach(function (q, i) {
      var b = P(q[0], q[1], 0); ctx.fillStyle = C.bois; ctx.fillRect(b[0] - 1.5, b[1] - 6, 3, 6);
      for (var e = 0; e < 3; e++) {
        poly(ctx, [[b[0] - 9 + e * 2, b[1] - 4 - e * 7], [b[0], b[1] - 16 - e * 7 - i * 2], [b[0] + 9 - e * 2, b[1] - 4 - e * 7]], e % 2 ? '#3f6e36' : '#355f2e');
        poly(ctx, [[b[0] - 9 + e * 2, b[1] - 4 - e * 7], [b[0], b[1] - 16 - e * 7 - i * 2], [b[0], b[1] - 4 - e * 7]], '#4f8a42');
      }
    });
    // Cabane en rondins.
    boite(ctx, P, 0.15, 0.15, 0.9, 0.8, 0, 11, C.bois);
    for (k = 1; k < 4; k++) { ligne(ctx, P(0.15, 0.8, k * 2.8), P(0.9, 0.8, k * 2.8), teinte(C.bois, 0.7), 1); ligne(ctx, P(0.9, 0.15, k * 2.8), P(0.9, 0.8, k * 2.8), teinte(C.bois, 0.55), 1); }
    ouverture(ctx, P, 'v', 0.42, 0.62, 0.8, 0, 7, '#3b2a1c');
    toit(ctx, P, 0.15, 0.15, 0.9, 0.8, 11, 7, C.indus, 'u');
    // Souches, chevalet de sciage avec un rondin.
    [[1.25, 0.45], [0.35, 1.15]].forEach(function (q) { cylindre(ctx, P, q[0], q[1], 0.09, 0, 3, C.bois, '#dcb27a'); });
    var hache = P(1.25, 0.45, 3); ligne(ctx, [hache[0], hache[1] - 1], [hache[0] + 4, hache[1] - 7], '#6e4a2c', 1.5); poly(ctx, [[hache[0] - 1, hache[1] - 1], [hache[0] + 2, hache[1] - 0.5], [hache[0] + 1, hache[1] - 3]], '#8a8a90');
    [[1.3, 1.0], [1.6, 1.0]].forEach(function (q) { var a = P(q[0], q[1], 0); ligne(ctx, [a[0] - 3, a[1]], [a[0] + 3, a[1] - 7], '#6e4a2c', 1.5); ligne(ctx, [a[0] + 3, a[1]], [a[0] - 3, a[1] - 7], '#6e4a2c', 1.5); });
    rondin(ctx, P, 1.2, 1.75, 1.0, 5.5, 2.4, '#8a5a32');
    // Pile de rondins (selon la production) : 3 en bas, 2 au milieu, 1 en haut.
    var pos = [[1.38, 0], [1.56, 0], [1.74, 0], [1.47, 4.2], [1.65, 4.2], [1.56, 8.4]], n = 1 + Math.round(p * 5);
    pos.slice(0, n).sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; }).forEach(function (q) { rondin(ctx, P, 0.2, 1.1, q[0], q[1], 2.4, q[1] ? '#9a6a3a' : '#8a5a32'); });
  };
  PEINTRES.mine_fer = function (ctx, P, t, etat) {
    var p = etat.prog || 0, k;
    sol(ctx, P, 0.03, 0.03, 1.97, 1.97, '#9a917f');
    // Petite remise à outils au fond à droite.
    boite(ctx, P, 1.45, 0.15, 1.88, 0.6, 0, 10, C.boisC);
    toit(ctx, P, 1.45, 0.15, 1.88, 0.6, 10, 5, C.indus, 'v');
    // Massif rocheux brun-gris, veines de rouille.
    var b = P(0.78, 0.72, 0), m = massif(ctx, b[0], b[1], 86, 44, '#8d8577', 3);
    [[-0.3, 0.55], [-0.08, 0.3], [0.2, 0.5], [0.3, 0.3]].forEach(function (q) { ellipse(ctx, b[0] + q[0] * 86, b[1] - q[1] * 44, 3.2, 1.4, '#9a4f30'); });
    // Entrée de galerie sur la face gauche : trou sombre, coffrage de bois, lanterne.
    var e0 = [m.A[0] + (m.H[0] - m.A[0]) * 0.36, m.A[1] + (m.H[1] - m.A[1]) * 0.36], e1 = [m.A[0] + (m.H[0] - m.A[0]) * 0.76, m.A[1] + (m.H[1] - m.A[1]) * 0.76];
    var em = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2];
    poly(ctx, [e0, e1, [e1[0], e1[1] - 14], [em[0], em[1] - 18], [e0[0], e0[1] - 14]], '#1c1816');
    ctx.fillStyle = '#7a5232'; ctx.fillRect(e0[0] - 1.5, e0[1] - 16, 3, 16); ctx.fillRect(e1[0] - 1.5, e1[1] - 16, 3, 16);
    ligne(ctx, [e0[0] - 3, e0[1] - 16], [e1[0] + 3, e1[1] - 16], '#8a6238', 3);
    cercle(ctx, e1[0] + 4.5, e1[1] - 11, 2.2, '#f2c24a', '#7a5232');
    // Rails qui sortent de la galerie, wagonnet chargé.
    var s = auSol(P, em[0], em[1]), u0 = s[0], v0 = s[1];
    ligne(ctx, P(u0 - 0.1, v0, 0), P(u0 - 0.1, 1.96, 0), '#4a4440', 1.2); ligne(ctx, P(u0 + 0.1, v0, 0), P(u0 + 0.1, 1.96, 0), '#4a4440', 1.2);
    for (k = 0; k < 5; k++) { var vk = v0 + 0.08 + k * (1.9 - v0) / 5; ligne(ctx, P(u0 - 0.16, vk, 0), P(u0 + 0.16, vk, 0), '#6e4a2c', 1.5); }
    var vw = Math.min(1.72, v0 + 0.32);
    boite(ctx, P, u0 - 0.15, vw - 0.14, u0 + 0.15, vw + 0.14, 2, 8, '#4f4a48', '#3a3634');
    [[u0 - 0.11, vw + 0.14], [u0 + 0.11, vw + 0.14]].forEach(function (q) { var a = P(q[0], q[1], 2); cercle(ctx, a[0], a[1], 1.9, '#2e2a28'); });
    var w = P(u0, vw, 8); tas(ctx, w[0], w[1], 6, 4, '#5a4a44', 4);
    // Tas de minerai à droite (selon la production), éclats de rouille.
    if (p > 0) {
      var t2 = P(1.5, 1.38, 0); tas(ctx, t2[0], t2[1], 7 + p * 8, 3 + p * 10, '#5c4c46', 7);
      for (k = 0; k < 5; k++) cercle(ctx, t2[0] + (hachage(k, 1) - 0.5) * 12, t2[1] - 2 - hachage(1, k) * p * 8, 1.3, '#a65a36');
    }
  };
  PEINTRES.carriere_marbre = function (ctx, P, t, etat) {
    var p = etat.prog || 0;
    sol(ctx, P, 0.03, 0.03, 1.97, 1.97, '#c4beb2');
    // Massif gris dont le front de taille, en gradins, montre le marbre blanc.
    var b = P(0.72, 0.62, 0);
    massif(ctx, b[0], b[1], 88, 44, '#a29c90', 5);
    boite(ctx, P, 0.3, 0.66, 0.95, 0.9, 0, 15, '#e6e2d9', '#f6f3ed');
    boite(ctx, P, 0.2, 0.9, 1.08, 1.22, 0, 7, '#e2ded4', '#f4f1ea');
    ligne(ctx, P(0.42, 0.9, 13), P(0.72, 0.9, 9), '#c2bcb0', 1); ligne(ctx, P(0.4, 1.22, 5.5), P(0.8, 1.22, 2), '#c2bcb0', 1);
    // Grue (bois) : mât, flèche inclinée, haubans, roue à marcher ; câble et bloc suspendu.
    var pied = P(1.62, 1.36, 0), mat = P(1.62, 1.36, 42), fl = P(1.02, 1.66, 30);
    ligne(ctx, mat, P(1.95, 1.05, 0), '#8a7a60', 1); ligne(ctx, mat, P(1.95, 1.7, 0), '#8a7a60', 1);
    ligne(ctx, pied, mat, '#5a3e26', 3);
    ligne(ctx, [pied[0], pied[1] - 5], fl, '#7a5232', 2.6);
    ligne(ctx, mat, fl, '#8a7a60', 1);
    var rw = P(1.78, 1.5, 9); ctx.strokeStyle = '#7a5232'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(rw[0], rw[1], 4.2, 8, 0, 0, Math.PI * 2); ctx.stroke();
    ligne(ctx, [rw[0], rw[1] - 8], [rw[0], rw[1] + 8], '#7a5232', 1); ligne(ctx, [rw[0] - 4, rw[1]], [rw[0] + 4, rw[1]], '#7a5232', 1);
    ligne(ctx, fl, [fl[0], fl[1] + 15], '#4a3a2a', 1);
    var bl = [fl[0], fl[1] + 15];
    poly(ctx, [[bl[0] - 6, bl[1]], [bl[0], bl[1] - 3], [bl[0] + 6, bl[1]], [bl[0] + 6, bl[1] + 5], [bl[0], bl[1] + 8], [bl[0] - 6, bl[1] + 5]], '#ece8e0');
    poly(ctx, [[bl[0], bl[1] + 3], [bl[0] + 6, bl[1]], [bl[0] + 6, bl[1] + 5], [bl[0], bl[1] + 8]], '#cfc9bd');
    // Blocs taillés qui attendent (selon la production).
    var pos = [[0.36, 1.48, 0], [0.72, 1.56, 0], [0.4, 1.82, 0], [0.8, 1.86, 0], [0.54, 1.52, 7]], n = 1 + Math.round(p * 4);
    pos.slice(0, n).sort(function (a, b2) { return a[2] - b2[2] || (a[0] + a[1]) - (b2[0] + b2[1]); }).forEach(function (q) {
      boite(ctx, P, q[0] - 0.14, q[1] - 0.12, q[0] + 0.14, q[1] + 0.12, q[2], q[2] + 7, '#e3dfd5', '#f8f5ef');
      ligne(ctx, P(q[0] - 0.1, q[1] + 0.12, q[2] + 5), P(q[0] + 0.06, q[1] + 0.12, q[2] + 2), '#c2bcb0', 1);
    });
  };

  // Ateliers (2 × 2) : cour de terre battue, bâtiment au fond, matière en attente dans la cour
  // (etat.matiere : 0 à 2 lots), fumée ou porte ouverte quand l'atelier travaille (etat.actif).
  function matieres(ctx, P, n, bien, places) {
    for (var k = 0; k < Math.min(2, n || 0); k++) pile(ctx, P, places[k][0], places[k][1], places[k][2], places[k][3], bien, 2);
  }
  function porteAtelier(ctx, P, a0, a1, v, h, actif) {
    if (actif) {
      ouverture(ctx, P, 'v', a0, a1, v, 0, h, '#4a2e1c', 3);
      ouverture(ctx, P, 'v', a0 + 0.04, a1 - 0.04, v, 0, h * 0.55, '#e9a84a');
    } else {
      ouverture(ctx, P, 'v', a0, a1, v, 0, h, '#7a5232', 3);
      ligne(ctx, P((a0 + a1) / 2, v, 0), P((a0 + a1) / 2, v, h + 2), '#5a3a22', 1);
    }
  }
  PEINTRES.atelier_poterie = function (ctx, P, t, etat) {
    sol(ctx, P, 0.03, 0.03, 1.97, 1.97, teinte(C.terre, 1.12));
    boite(ctx, P, 0.15, 0.15, 1.15, 0.95, 0, 14, '#e2cfa8');
    porteAtelier(ctx, P, 0.45, 0.75, 0.95, 9, etat.actif);
    fenetres(ctx, P, 'u', 0.15, 0.95, 1.15, 6, 10, 2, '#4a3828');
    toit(ctx, P, 0.15, 0.15, 1.15, 0.95, 14, 8, C.indus, 'u');
    // Four en ruche : socle de briques, dôme, gueule (rougeoyante quand il cuit).
    cylindre(ctx, P, 1.55, 0.55, 0.3, 0, 6, '#a8583a', false);
    var f = P(1.55, 0.55, 6); dome(ctx, f[0], f[1], 13.5, 13, '#b8643f');
    var m = P(1.55, 0.85, 3); poly(ctx, [[m[0] - 4, m[1] + 3], [m[0] - 4, m[1] - 3], [m[0], m[1] - 6], [m[0] + 4, m[1] - 3], [m[0] + 4, m[1] + 3]], etat.actif ? '#f29a32' : '#3b2216');
    if (etat.actif) { ellipse(ctx, m[0], m[1], 2.4, 2.4, '#ffd76a'); fumee(ctx, f[0], f[1] - 13, etat.frame); }
    // Poteries terminées, en rang devant la maison.
    [[0.32, 1.5, 0], [0.55, 1.58, 1], [0.78, 1.66, 0], [1.0, 1.74, 1]].forEach(function (q) { var a = P(q[0], q[1], 0); amphore(ctx, a[0], a[1], BIENS.poterie, q[2]); });
    matieres(ctx, P, etat.matiere, 'argile', [[1.25, 1.05, 1.85, 1.5], [1.32, 1.42, 1.92, 1.9]]);
  };
  PEINTRES.atelier_mobilier = function (ctx, P, t, etat) {
    sol(ctx, P, 0.03, 0.03, 1.97, 1.97, teinte(C.terre, 1.12));
    // Planches à sécher contre le bâtiment, à droite.
    for (var k = 0; k < 3; k++) boite(ctx, P, 1.4, 0.2 + k * 0.08, 1.85, 0.26 + k * 0.08, 0, 3 + k * 0.8, '#c9965a', '#ddb07a');
    boite(ctx, P, 0.15, 0.15, 1.3, 1.0, 0, 15, '#dcc9a3');
    porteAtelier(ctx, P, 0.4, 0.95, 1.0, 10, etat.actif);
    fenetres(ctx, P, 'u', 0.15, 1.0, 1.3, 7, 11, 2, '#4a3828');
    toit(ctx, P, 0.15, 0.15, 1.3, 1.0, 15, 9, C.indus, 'u');
    // Établi et meubles finis dans la cour : une table, une chaise.
    var tb = P(0.55, 1.45, 0);
    [[0.38, 1.33], [0.72, 1.33], [0.38, 1.57], [0.72, 1.57]].forEach(function (q) { poteau(ctx, P, q[0], q[1], 0, 6, '#7a4a2a', 1.5); });
    boite(ctx, P, 0.34, 1.29, 0.76, 1.61, 6, 7.5, '#9a6436', '#b57c46');
    void tb;
    var ch = P(1.0, 1.7, 0);
    ctx.fillStyle = '#7a4a2a'; ctx.fillRect(ch[0] - 3, ch[1] - 4, 1.2, 4); ctx.fillRect(ch[0] + 2, ch[1] - 4, 1.2, 4); ctx.fillRect(ch[0] + 2, ch[1] - 12, 1.5, 8);
    ctx.fillStyle = '#b57c46'; ctx.fillRect(ch[0] - 3.4, ch[1] - 5.4, 7, 1.8); ctx.fillRect(ch[0] - 0.2, ch[1] - 12, 3.8, 1.5);
    matieres(ctx, P, etat.matiere, 'bois', [[1.38, 1.02, 1.9, 1.42], [1.4, 1.45, 1.92, 1.9]]);
  };
  PEINTRES.pressoir = function (ctx, P, t, etat) {
    var k;
    sol(ctx, P, 0.03, 0.03, 1.97, 1.97, teinte(C.terre, 1.12));
    // Réserve au fond à droite.
    boite(ctx, P, 1.0, 0.15, 1.85, 0.8, 0, 13, '#e0cfa9');
    porteAtelier(ctx, P, 1.25, 1.55, 0.8, 8, etat.actif);
    toit(ctx, P, 1.0, 0.15, 1.85, 0.8, 13, 7, C.indus, 'u');
    // Moulin à olives : cuve ronde de pierre, meule dressée.
    cylindre(ctx, P, 0.52, 0.55, 0.3, 0, 5, '#9d978b', '#7a7468');
    var m = P(0.52, 0.55, 5); ellipse(ctx, m[0], m[1], 8, 4, etat.actif ? '#4a4a26' : '#6a6458');
    ctx.fillStyle = '#6e4a2c'; ctx.fillRect(m[0] - 1, m[1] - 12, 2, 12);
    ellipse(ctx, m[0] - 5, m[1] - 3, 2.2, 4.4, '#b6b0a3'); ellipse(ctx, m[0] - 5.6, m[1] - 3, 1.4, 3.6, '#cfc9bd');
    ligne(ctx, [m[0] - 10, m[1] - 9], [m[0] + 9, m[1] - 9], '#6e4a2c', 2);
    // Pressoir à vis : deux montants, sommier, grosse vis, maie où coule l'huile.
    boite(ctx, P, 0.92, 1.05, 1.58, 1.42, 0, 4, '#b6b0a3', etat.actif ? '#c9b84a' : '#8f8a7e');
    poteau(ctx, P, 0.98, 1.24, 0, 24, '#6e4a2c', 3.4); poteau(ctx, P, 1.52, 1.24, 0, 24, '#5a3e26', 3.4);
    boite(ctx, P, 0.94, 1.18, 1.56, 1.3, 20, 24, '#7a5232');
    var v0 = P(1.25, 1.24, 8), v1 = P(1.25, 1.24, 20);
    ctx.fillStyle = '#9a6a3a'; ctx.fillRect(v0[0] - 2, v1[1], 4, v0[1] - v1[1]);
    for (k = 0; k < 5; k++) ligne(ctx, [v0[0] - 2, v1[1] + 1 + k * 2.4], [v0[0] + 2, v1[1] + 2.6 + k * 2.4], '#5a3e26', 1);
    boite(ctx, P, 1.08, 1.16, 1.42, 1.32, 6, 8, '#8a5a32');
    boite(ctx, P, 1.1, 1.18, 1.4, 1.3, 4, 6, '#4a3a22');
    // Amphores d'huile, prêtes.
    [[0.3, 1.55], [0.5, 1.65], [0.7, 1.75]].forEach(function (q) { var a = P(q[0], q[1], 0); amphore(ctx, a[0], a[1], BIENS.huile); });
    matieres(ctx, P, etat.matiere, 'olives', [[1.5, 0.95, 1.92, 1.32], [1.4, 1.5, 1.85, 1.92]]);
  };
  PEINTRES.cave = function (ctx, P, t, etat) {
    var k;
    sol(ctx, P, 0.03, 0.03, 1.97, 1.97, teinte(C.terre, 1.12));
    boite(ctx, P, 0.15, 0.15, 1.3, 0.95, 0, 14, '#dccbb0');
    porteAtelier(ctx, P, 0.5, 0.9, 0.95, 9, etat.actif);
    fenetres(ctx, P, 'u', 0.15, 0.95, 1.3, 6, 10, 2, '#4a3828');
    toit(ctx, P, 0.15, 0.15, 1.3, 0.95, 14, 8, C.indus, 'u');
    // Dolia : grandes jarres à demi enterrées.
    [[1.55, 0.35], [1.6, 0.75], [1.65, 1.15]].forEach(function (q) {
      var a = P(q[0], q[1], 0);
      ctx.beginPath(); ctx.ellipse(a[0], a[1], 7.5, 7, 0, Math.PI, 0); ctx.ellipse(a[0], a[1], 7.5, 3.4, 0, 0, Math.PI); ctx.fillStyle = '#a85a3a'; ctx.fill();
      ellipse(ctx, a[0] - 2, a[1] - 3, 3.5, 3.4, '#c27048');
      ellipse(ctx, a[0], a[1] - 6.4, 3.6, 1.6, '#7a3e26'); ellipse(ctx, a[0], a[1] - 6.4, 2.4, 1, '#2a1410');
    });
    // Cuve de foulage : margelle de pierre, moût violet quand la cave travaille, fond sec sinon.
    boite(ctx, P, 0.28, 1.2, 0.95, 1.62, 0, 6, '#b9ad94', '#d8ceb6');
    poly(ctx, [P(0.34, 1.26, 6), P(0.89, 1.26, 6), P(0.89, 1.56, 6), P(0.34, 1.56, 6)], etat.actif ? '#5e2448' : '#6a5a48');
    poly(ctx, [P(0.34, 1.26, 6), P(0.89, 1.26, 6), P(0.89, 1.3, 4.5), P(0.38, 1.3, 4.5), P(0.38, 1.56, 4.5), P(0.34, 1.56, 6)], etat.actif ? '#3e1430' : '#4e4234');
    if (etat.actif) for (k = 0; k < 5; k++) { var q = P(0.45 + hachage(k, 8) * 0.38, 1.33 + hachage(8, k) * 0.2, 5); cercle(ctx, q[0], q[1], 1.3, k % 2 ? '#8f4fa0' : '#6a2f7a'); }
    // Tonneaux debout, cerclés de fer.
    [[1.02, 1.7], [1.26, 1.76], [1.06, 1.94]].forEach(function (q) {
      cylindre(ctx, P, q[0], q[1], 0.1, 0, 9, '#8a5a32', '#b07a44');
      var a2 = P(q[0], q[1], 2), b2 = P(q[0], q[1], 7);
      ctx.strokeStyle = '#3a3634'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(a2[0], a2[1], 4.5, 2.26, 0, 0, Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(b2[0], b2[1], 4.5, 2.26, 0, 0, Math.PI); ctx.stroke();
    });
    matieres(ctx, P, etat.matiere, 'raisin', [[1.38, 1.3, 1.85, 1.7], [0.3, 1.66, 0.78, 1.96]]);
  };
  PEINTRES.atelier_armes = function (ctx, P, t, etat) {
    sol(ctx, P, 0.03, 0.03, 1.97, 1.97, teinte(C.terre, 1.05));
    boite(ctx, P, 0.15, 0.15, 1.3, 1.0, 0, 15, '#cbbfa8');
    // Forge ouverte : le foyer rougeoie quand l'atelier travaille.
    ouverture(ctx, P, 'v', 0.35, 0.85, 1.0, 0, 10, '#2e2420', 3);
    ouverture(ctx, P, 'v', 0.45, 0.75, 1.0, 1, 6, etat.actif ? '#f08a2a' : '#5a2a1e', 2);
    if (etat.actif) ouverture(ctx, P, 'v', 0.52, 0.68, 1.0, 1, 3.5, '#ffd76a');
    // Boucliers ronds accrochés au mur.
    [[1.0, 1.0], [1.18, 1.0]].forEach(function (q, i) { var a = P(q[0], q[1], 9); ellipse(ctx, a[0], a[1], 3.6, 4.2, '#7a241c'); ellipse(ctx, a[0] - 0.4, a[1] - 0.3, 2.8, 3.4, i ? C.secu : '#c28a3a'); cercle(ctx, a[0] - 0.3, a[1] - 0.2, 1, C.or); });
    toit(ctx, P, 0.15, 0.15, 1.3, 1.0, 15, 9, C.indus, 'u');
    boite(ctx, P, 0.95, 0.3, 1.15, 0.5, 15, 28, '#8f8477');
    if (etat.actif) { var c = P(1.05, 0.4, 28); fumee(ctx, c[0], c[1], etat.frame); }
    // Enclume sur son billot, bac de trempe.
    cylindre(ctx, P, 1.12, 1.42, 0.1, 0, 4, '#7a5232', '#9a6a3a');
    var e = P(1.12, 1.42, 4);
    poly(ctx, [[e[0] - 5, e[1] - 4], [e[0] + 6, e[1] - 4], [e[0] + 4, e[1] - 2], [e[0] + 2, e[1] - 2], [e[0] + 2, e[1]], [e[0] - 2, e[1]], [e[0] - 2, e[1] - 2], [e[0] - 4, e[1] - 2]], '#3e3c3e');
    ctx.fillStyle = '#6a686c'; ctx.fillRect(e[0] - 4, e[1] - 4.5, 9, 1);
    boite(ctx, P, 0.3, 1.25, 0.75, 1.5, 0, 4, '#7a5232', '#4f86a0');
    // Lances dressées contre le mur de droite.
    for (var k = 0; k < 3; k++) { var l0 = P(1.38, 0.35 + k * 0.12, 0); ligne(ctx, l0, [l0[0] - 3, l0[1] - 18], '#6e4a2c', 1.2); poly(ctx, [[l0[0] - 4.2, l0[1] - 17], [l0[0] - 3.4, l0[1] - 22], [l0[0] - 1.8, l0[1] - 17.6]], '#b8bcc2'); }
    matieres(ctx, P, etat.matiere, 'fer', [[1.4, 1.0, 1.9, 1.4], [0.42, 1.58, 0.92, 1.95]]);
  };
  // Entrepôt (3 × 3) : hangar au fond, cour de 8 emplacements (4 × 2) ; etat.emplacements[k] = null
  // (vide) ou [bien, quarts de 1 à 4] : chaque pile a la forme et la couleur de son bien.
  PEINTRES.entrepot = function (ctx, P, t, etat) {
    var emp = etat.emplacements || [];
    sol(ctx, P, 0.04, 0.04, 2.96, 2.96, teinte(C.pierre, 0.97));
    boite(ctx, P, 0.12, 0.12, 2.88, 0.82, 0, 18, '#e3d3b0');
    [0.45, 1.3, 2.15].forEach(function (u) { ouverture(ctx, P, 'v', u, u + 0.4, 0.82, 0, 12, '#6b4a2e', 4); ligne(ctx, P(u + 0.2, 0.82, 0), P(u + 0.2, 0.82, 14), '#4a321e', 1); });
    fenetres(ctx, P, 'u', 0.12, 0.82, 2.88, 9, 13, 2, '#4a3828');
    toit(ctx, P, 0.12, 0.12, 2.88, 0.82, 18, 10, C.indus, 'u');
    for (var k = 0; k < 8; k++) {
      var c = k % 4, r = Math.floor(k / 4), u0 = 0.22 + c * 0.66, v0 = 1.0 + r * 0.95;
      sol(ctx, P, u0, v0, u0 + 0.6, v0 + 0.86, teinte(C.pierre, 1.1), teinte(C.pierreF, 0.92));
      if (emp[k] && emp[k][0]) pile(ctx, P, u0, v0, u0 + 0.6, v0 + 0.86, emp[k][0], emp[k][1] || 1);
    }
    // Muret bas devant la cour (ne cache pas les piles).
    boite(ctx, P, 0.04, 2.88, 1.3, 2.96, 0, 4, C.pierreF);
    boite(ctx, P, 1.7, 2.88, 2.96, 2.96, 0, 4, C.pierreF);
    boite(ctx, P, 2.88, 0.82, 2.96, 2.88, 0, 4, C.pierreF);
  };

  // --- Éducation -------------------------------------------------------------
  PEINTRES.ecole = function (ctx, P) {
    sol(ctx, P, 0.05, 0.05, 1.95, 1.95, teinte(C.terre, 1.16));
    boite(ctx, P, 0.2, 0.2, 1.35, 1.2, 0, 17, '#ece0c4');
    fenetres(ctx, P, 'u', 0.2, 1.2, 1.35, 7, 12, 3, '#3f5a56');
    fenetres(ctx, P, 'v', 0.2, 1.35, 1.2, 9, 13, 4, '#3f5a56');
    ouverture(ctx, P, 'v', 0.62, 0.92, 1.2, 0, 9, '#4a3424', 2);
    toit(ctx, P, 0.2, 0.2, 1.35, 1.2, 17, 10, C.educ, 'v');
    // Porche : petit toit sur deux colonnes, devant la porte.
    poteau(ctx, P, 0.5, 1.58, 0, 11, C.marbre, 3); poteau(ctx, P, 1.04, 1.58, 0, 11, C.marbre, 3);
    toit(ctx, P, 0.48, 1.2, 1.06, 1.58, 11, 5, C.educ, 'v');
    // Cour : arbre, bancs, tablettes de cire sur un pupitre.
    var a = P(1.62, 0.45, 0); arbuste(ctx, a[0], a[1], 7, C.feuillage);
    boite(ctx, P, 1.45, 1.05, 1.85, 1.15, 0, 3, C.boisC); boite(ctx, P, 1.45, 1.4, 1.85, 1.5, 0, 3, C.boisC);
    var pu = P(1.35, 1.75, 0); ctx.fillStyle = '#6e4a2c'; ctx.fillRect(pu[0] - 0.75, pu[1] - 7, 1.5, 7);
    poly(ctx, [[pu[0] - 4, pu[1] - 7], [pu[0] + 4, pu[1] - 9], [pu[0] + 4, pu[1] - 6], [pu[0] - 4, pu[1] - 4]], '#a8743f');
  };
  PEINTRES.bibliotheque = function (ctx, P) {
    sol(ctx, P, 0.05, 0.05, 1.95, 1.95, teinte(C.marbre, 0.92));
    boite(ctx, P, 0.12, 0.12, 1.88, 1.8, 0, 4, nuance(C.marbre, 0.96));
    boite(ctx, P, 0.3, 0.3, 1.7, 1.38, 4, 26, '#efe6d2');
    // Rayonnages entre les colonnes : niches sombres, étagères, bouts de rouleaux.
    for (var k = 0; k < 4; k++) {
      var u0 = 0.4 + k * 0.33, u1 = u0 + 0.22;
      ouverture(ctx, P, 'v', u0, u1, 1.38, 6, 22, '#4a3424', 2);
      for (var r = 0; r < 4; r++) {
        var h = 7.6 + r * 3.7;
        ligne(ctx, P(u0, 1.38, h - 0.8), P(u1, 1.38, h - 0.8), '#8a6440', 1);
        for (var m = 0; m < 3; m++) { var q = P(u0 + 0.045 + m * 0.065, 1.38, h + 1); cercle(ctx, q[0], q[1], 1.15, ['#f2e6c6', '#e2c98e', '#f6eed8'][(k + r + m) % 3]); }
      }
    }
    fenetres(ctx, P, 'u', 0.3, 1.38, 1.7, 10, 18, 3, '#4a3424', 2);
    colonnade(ctx, P, 0.2, 0.2, 1.8, 1.66, 4, 26, 5, 4, C.marbre);
    boite(ctx, P, 0.18, 0.18, 1.82, 1.7, 26, 29, nuance(C.marbre, 0.97));
    toit(ctx, P, 0.18, 0.18, 1.82, 1.7, 29, 11, C.educ, 'v');
    var a = P(1.0, 1.78, 40); cercle(ctx, a[0], a[1] - 1.5, 2, C.or);
  };
  PEINTRES.academie = function (ctx, P) {
    sol(ctx, P, 0.04, 0.04, 2.96, 2.96, teinte(C.marbre, 0.9));
    // Cour-jardin : pelouse, allées en croix.
    sol(ctx, P, 0.8, 0.8, 2.25, 2.25, '#8db055');
    sol(ctx, P, 1.43, 0.8, 1.62, 2.25, '#e3d6b0'); sol(ctx, P, 0.8, 1.43, 2.25, 1.62, '#e3d6b0');
    // Ailes du fond, à étage.
    boite(ctx, P, 0.15, 0.15, 2.85, 0.8, 0, 21, '#efe4cc');
    fenetres(ctx, P, 'v', 0.8, 2.85, 0.8, 12, 17, 5, '#3f5a56', 1.5);
    fenetres(ctx, P, 'u', 0.15, 0.8, 2.85, 6, 16, 2, '#3f5a56', 1.5);
    toit(ctx, P, 0.15, 0.15, 2.85, 0.8, 21, 10, C.educ, 'u');
    boite(ctx, P, 0.15, 0.8, 0.8, 2.85, 0, 21, '#efe4cc');
    fenetres(ctx, P, 'u', 0.8, 2.85, 0.8, 12, 17, 5, '#3f5a56', 1.5);
    toit(ctx, P, 0.15, 0.8, 0.8, 2.85, 21, 10, C.educ, 'v');
    // Portiques intérieurs le long des ailes du fond.
    colonnade(ctx, P, 0.8, 0.8, 2.2, 0.9, 0, 10, 5, 0, C.marbre);
    colonnade(ctx, P, 0.8, 0.9, 0.9, 2.2, 0, 10, 0, 5, C.marbre);
    // Au centre du jardin : un olivier et des bancs de marbre.
    var o = P(1.52, 1.52, 0); olivier(ctx, o[0], o[1], 0, 9);
    boite(ctx, P, 1.0, 1.15, 1.3, 1.24, 0, 2.5, C.marbre); boite(ctx, P, 1.75, 1.15, 2.05, 1.24, 0, 2.5, C.marbre);
    // Portiques de devant, bas et ouverts.
    boite(ctx, P, 2.25, 0.8, 2.85, 2.25, 0, 2, C.marbre);
    colonnade(ctx, P, 2.25, 0.8, 2.85, 2.25, 2, 13, 0, 4, C.marbre);
    toit(ctx, P, 2.25, 0.8, 2.85, 2.25, 13, 5, C.educ, 'v');
    boite(ctx, P, 0.8, 2.25, 2.85, 2.85, 0, 2, C.marbre);
    colonnade(ctx, P, 0.8, 2.25, 2.85, 2.85, 2, 13, 6, 1, C.marbre);
    toit(ctx, P, 0.8, 2.25, 2.85, 2.85, 13, 6, C.educ, 'u');
  };

  // --- Santé ---------------------------------------------------------------
  // Enseigne de la santé : disque corail, bol blanc d'où sort un brin d'herbe à trois feuilles.
  function enseigneSante(ctx, x, y, r) {
    cercle(ctx, x, y, r, C.sante, '#8a3a30');
    ctx.fillStyle = '#4f8a35'; ctx.fillRect(x - 0.5, y - r * 0.62, 1, r * 0.7);
    ellipse(ctx, x - r * 0.3, y - r * 0.5, r * 0.28, r * 0.16, '#6fae48');
    ellipse(ctx, x + r * 0.3, y - r * 0.32, r * 0.28, r * 0.16, '#6fae48');
    ellipse(ctx, x, y - r * 0.7, r * 0.16, r * 0.24, '#6fae48');
    ctx.fillStyle = '#f6f0e6'; ctx.beginPath(); ctx.moveTo(x - r * 0.62, y); ctx.lineTo(x + r * 0.62, y);
    ctx.quadraticCurveTo(x + r * 0.5, y + r * 0.55, x, y + r * 0.55); ctx.quadraticCurveTo(x - r * 0.5, y + r * 0.55, x - r * 0.62, y); ctx.fill();
  }
  // Vapeur des bains : bouffées blanches translucides qui montent (deux images).
  function vapeur(ctx, x, y, fr) {
    var o = (fr || 0) % 2 ? 1.5 : 0;
    for (var k = -1; k <= 1; k++) {
      var bx = x + k * 7;
      cercle(ctx, bx + o * 0.5, y - 3 - (k ? 0 : 2), 2.4, 'rgba(250,250,248,0.85)');
      cercle(ctx, bx - 1 + o, y - 8 - (k ? 0 : 2), 3, 'rgba(250,250,248,0.7)');
      if (!k) cercle(ctx, bx + 0.5 + o * 1.4, y - 15, 3.6, 'rgba(250,250,248,0.5)');
    }
  }
  PEINTRES.barbier = function (ctx, P) {
    sol(ctx, P, 0.05, 0.05, 0.95, 0.95, teinte(C.pierre, 1.08));
    boite(ctx, P, 0.15, 0.15, 0.85, 0.62, 0, 15, '#eadcc0');
    ouverture(ctx, P, 'v', 0.3, 0.7, 0.62, 0, 9, '#4a3424');
    fenetres(ctx, P, 'u', 0.15, 0.62, 0.85, 6, 10, 1, '#4a3828');
    toit(ctx, P, 0.15, 0.15, 0.85, 0.62, 15, 8, C.sante, 'u');
    // Auvent rayé corail et blanc, sur deux perches.
    for (var k = 0; k < 4; k++) { var u0 = 0.18 + k * 0.16; poly(ctx, [P(u0, 0.62, 11.5), P(u0 + 0.16, 0.62, 11.5), P(u0 + 0.16, 0.86, 8), P(u0, 0.86, 8)], k % 2 ? '#f6efe2' : C.sante); }
    poteau(ctx, P, 0.2, 0.86, 0, 8, '#6e4a2c', 1.5); poteau(ctx, P, 0.8, 0.86, 0, 8, '#6e4a2c', 1.5);
    // Tabouret et bassine sur son pied, serviette pendue.
    boite(ctx, P, 0.38, 0.7, 0.52, 0.8, 0, 3.5, C.boisC);
    var b = P(0.68, 0.76, 0); ctx.fillStyle = '#6e4a2c'; ctx.fillRect(b[0] - 0.7, b[1] - 6, 1.4, 6);
    ellipse(ctx, b[0], b[1] - 6.5, 3.6, 1.7, '#c98a4a'); ellipse(ctx, b[0], b[1] - 6.8, 2.6, 1.1, C.eauClair);
    var sv = P(0.3, 0.86, 7); ctx.fillStyle = '#f6f0e6'; ctx.fillRect(sv[0] - 1.5, sv[1], 3, 4);
  };
  PEINTRES.bains = function (ctx, P, t, etat) {
    sol(ctx, P, 0.05, 0.05, 1.95, 1.95, teinte(C.marbre, 0.92));
    // Annexe au toit corail.
    boite(ctx, P, 1.3, 0.15, 1.85, 0.85, 0, 12, '#e6d6b8');
    fenetres(ctx, P, 'u', 0.15, 0.85, 1.85, 5, 9, 2, '#4a3a2c', 1.5);
    toit(ctx, P, 1.3, 0.15, 1.85, 0.85, 12, 7, C.sante, 'v');
    // Salle chaude à coupole.
    boite(ctx, P, 0.15, 0.15, 1.25, 1.2, 0, 18, '#e6d6b8');
    fenetres(ctx, P, 'v', 0.15, 1.25, 1.2, 6, 13, 3, '#4a3a2c', 2.5);
    fenetres(ctx, P, 'u', 0.15, 1.2, 1.25, 6, 13, 3, '#4a3a2c', 2.5);
    bandeau(ctx, P, 0.15, 0.15, 1.25, 1.2, 16, 2, C.sante);
    var d = P(0.7, 0.675, 18); dome(ctx, d[0], d[1], 25, 19, '#cfc8ba');
    ellipse(ctx, d[0], d[1] - 19, 3.5, 1.6, '#6a6458');
    // Piscine devant : margelle de marbre, eau claire quand les bains sont alimentés.
    boite(ctx, P, 0.3, 1.38, 1.78, 1.86, 0, 3, C.marbre);
    poly(ctx, [P(0.38, 1.44, 3), P(1.7, 1.44, 3), P(1.7, 1.8, 3), P(0.38, 1.8, 3)], etat.actif ? C.eauClair : '#b5aa92');
    if (etat.actif) {
      var o = (etat.frame || 0) % 2 ? 0.1 : 0;
      ligne(ctx, P(0.6 + o, 1.55, 3), P(0.85 + o, 1.55, 3), '#d6ecff', 1); ligne(ctx, P(1.2 - o, 1.68, 3), P(1.45 - o, 1.68, 3), '#d6ecff', 1);
      var v1 = P(1.0, 1.62, 3); vapeur(ctx, v1[0], v1[1] - 2, etat.frame);
      vapeur(ctx, d[0], d[1] - 21, (etat.frame || 0) + 1);
    }
  };
  PEINTRES.medecin = function (ctx, P) {
    sol(ctx, P, 0.05, 0.05, 0.95, 0.95, teinte(C.pierre, 1.08));
    boite(ctx, P, 0.15, 0.15, 0.85, 0.72, 0, 16, '#eee2c8');
    ouverture(ctx, P, 'v', 0.4, 0.6, 0.72, 0, 9, '#4a3424', 2);
    fenetres(ctx, P, 'u', 0.15, 0.72, 0.85, 7, 11, 2, '#4a3828');
    toit(ctx, P, 0.15, 0.15, 0.85, 0.72, 16, 9, C.sante, 'v');
    // Pots d'herbes médicinales devant la porte.
    [[0.22, 0.84], [0.32, 0.88]].forEach(function (q) { var a = P(q[0], q[1], 0); poly(ctx, [[a[0] - 2.4, a[1] - 4], [a[0] + 2.4, a[1] - 4], [a[0] + 1.8, a[1]], [a[0] - 1.8, a[1]]], '#b9653d'); cercle(ctx, a[0], a[1] - 6, 2.8, '#5f9e3c'); });
    // Enseigne sur un poteau, à l'angle.
    var e = P(0.82, 0.86, 0); ctx.fillStyle = '#6e4a2c'; ctx.fillRect(e[0] - 0.8, e[1] - 15, 1.6, 15);
    enseigneSante(ctx, e[0], e[1] - 18, 5.5);
  };
  PEINTRES.hopital = function (ctx, P) {
    sol(ctx, P, 0.04, 0.04, 2.96, 2.96, teinte(C.pierre, 1.06));
    sol(ctx, P, 0.9, 0.9, 2.4, 2.7, teinte(C.pierre, 1.15));
    // Aile du fond à étage, aile gauche, aile droite basse : un U autour d'une cour.
    boite(ctx, P, 0.15, 0.15, 2.85, 0.9, 0, 26, '#efe4cc');
    fenetres(ctx, P, 'v', 0.9, 2.85, 0.9, 15, 21, 5, '#4a3a2c'); fenetres(ctx, P, 'u', 0.15, 0.9, 2.85, 15, 21, 2, '#4a3a2c');
    fenetres(ctx, P, 'u', 0.15, 0.9, 2.85, 4, 10, 2, '#4a3a2c');
    bandeau(ctx, P, 0.15, 0.15, 2.85, 0.9, 12, 1.5, C.sante);
    toit(ctx, P, 0.15, 0.15, 2.85, 0.9, 26, 11, C.sante, 'u');
    boite(ctx, P, 0.15, 0.9, 0.9, 2.85, 0, 18, '#efe4cc');
    fenetres(ctx, P, 'u', 0.9, 2.85, 0.9, 6, 12, 4, '#4a3a2c'); fenetres(ctx, P, 'v', 0.15, 0.9, 2.85, 6, 12, 2, '#4a3a2c');
    toit(ctx, P, 0.15, 0.9, 0.9, 2.85, 18, 9, C.sante, 'v');
    // Jardin des simples : carrés de plantes, puits.
    [[1.1, 1.1], [1.65, 1.1], [1.1, 1.65], [1.65, 1.65]].forEach(function (q, i) {
      sol(ctx, P, q[0], q[1], q[0] + 0.4, q[1] + 0.4, '#5f8f3a');
      for (var k = 0; k < 5; k++) { var a = P(q[0] + 0.06 + hachage(i, k) * 0.28, q[1] + 0.06 + hachage(k, i) * 0.28, 0); cercle(ctx, a[0], a[1] - 1.5, 1.8, k % 2 ? '#7fb050' : (i % 2 ? '#c9a0d8' : '#f2d24a')); }
    });
    cylindre(ctx, P, 2.15, 2.25, 0.12, 0, 5, C.pierre, '#2f5c84');
    boite(ctx, P, 2.4, 0.9, 2.85, 2.4, 0, 14, '#efe4cc');
    fenetres(ctx, P, 'u', 0.9, 2.4, 2.85, 5, 10, 3, '#4a3a2c');
    toit(ctx, P, 2.4, 0.9, 2.85, 2.4, 14, 7, C.sante, 'v');
    // Muret de façade, portail et enseigne.
    boite(ctx, P, 0.9, 2.74, 1.5, 2.85, 0, 6, '#e6d8bc'); boite(ctx, P, 1.95, 2.74, 2.85, 2.85, 0, 6, '#e6d8bc');
    boite(ctx, P, 2.74, 2.4, 2.85, 2.74, 0, 6, '#e6d8bc');
    boite(ctx, P, 1.42, 2.7, 1.56, 2.88, 0, 11, '#ddd0b4'); boite(ctx, P, 1.9, 2.7, 2.04, 2.88, 0, 11, '#ddd0b4');
    var e = P(1.73, 2.79, 15); enseigneSante(ctx, e[0], e[1], 5.5);
  };

  // --- Divertissement ---------------------------------------------------------
  // Arène ovale (amphithéâtre, colisée) : mur extérieur à arcades sur « rangs » étages,
  // gradins en anneaux de plus en plus bas jusqu'à la piste de sable ; foule et fanions si actif.
  function arene(ctx, P, cu, cv, ru, rv, H, rangs, nGradins, actif, pierre) {
    var N = 48, k, j;
    var pt = function (r, a, h) { return P(cu + ru * r * Math.cos(a), cv + rv * r * Math.sin(a), h); };
    var anneau = function (r, h) { var l = []; for (var i = 0; i < N; i++) l.push(pt(r, i / N * Math.PI * 2, h)); return l; };
    // Mur extérieur : seuls les pans tournés vers nous, teinte selon leur orientation.
    for (k = 0; k < N; k++) {
      var a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2, am = (a0 + a1) / 2;
      var nu = Math.cos(am) / ru, nv = Math.sin(am) / rv, nn = Math.sqrt(nu * nu + nv * nv);
      nu /= nn; nv /= nn;
      if (nu + nv <= -0.05) continue;
      var f = 0.81 + 0.11 * (nv - nu);
      poly(ctx, [pt(1, a0, 0), pt(1, a1, 0), pt(1, a1, H), pt(1, a0, H)], teinte(pierre, f));
      var hr = (H - 3) / rangs;
      for (j = 0; j < rangs; j++) {
        var b = j * hr + 1.5, A = function (s, h) { return pt(1, a0 + (a1 - a0) * s, h); };
        poly(ctx, [A(0.22, b), A(0.78, b), A(0.78, b + hr * 0.6), A(0.5, b + hr * 0.8), A(0.22, b + hr * 0.6)], teinte(pierre, f * 0.42));
        if (j) ligne(ctx, A(0, b - 0.5), A(1, b - 0.5), teinte(pierre, f * 1.12), 1);
      }
    }
    // Sommet du mur, puis gradins : chaque marche peinte plus bas, sa contremarche se voit au fond.
    poly(ctx, anneau(1, H), teinte(pierre, 1.1));
    var r0 = 0.95, rp = 0.4, hp = 2;
    for (k = 0; k < nGradins; k++) {
      var r = r0 - (r0 - rp) * k / nGradins, hT = H - (H - hp - 3) * k / nGradins, hN = H - (H - hp - 3) * (k + 1) / nGradins;
      poly(ctx, anneau(r, hT), teinte(pierre, 0.66));
      poly(ctx, anneau(r, hN), teinte(pierre, k % 2 ? 0.98 : 1.06));
      if (actif) {
        // Spectateurs : points de couleur sur la marche.
        var rm = r - (r0 - rp) / nGradins * 0.45;
        for (j = 0; j < 30; j++) {
          var aa = (j + hachage(k, j)) / 30 * Math.PI * 2, q = pt(rm, aa, hN);
          cercle(ctx, q[0], q[1] - 1.3, 1.3, ['#c24a3a', '#e8d8b0', '#3f86b8', '#e6b43c', '#8e5aa8', '#f2efe6'][(j + k * 2) % 6]);
        }
      }
    }
    poly(ctx, anneau(rp, hp + 3), teinte(pierre, 0.6));
    poly(ctx, anneau(rp, hp), C.sable);
    var c0 = pt(0, 0, hp); ellipse(ctx, c0[0], c0[1], ru * rp * 14, rv * rp * 7, teinte(C.sable, 0.92));
    if (actif) {
      // Fanions sur le haut du mur, au fond.
      for (k = 0; k < 7; k++) {
        var an = Math.PI * (0.8 + k / 6 * 0.9), m = pt(1, an, H);
        ctx.fillStyle = '#5a4030'; ctx.fillRect(m[0] - 0.6, m[1] - 12, 1.2, 12);
        poly(ctx, [[m[0] + 0.6, m[1] - 12], [m[0] + 7, m[1] - 10], [m[0] + 0.6, m[1] - 8]], [C.divert, '#e6b43c', C.secu][k % 3]);
      }
    }
  }
  PEINTRES.amphitheatre = function (ctx, P, t, etat) {
    sol(ctx, P, 0.04, 0.04, 2.96, 2.96, teinte(C.pierre, 1.04));
    arene(ctx, P, 1.5, 1.5, 1.4, 1.18, 16, 1, 4, etat.actif, '#d8ccb0');
    // Deux mâts violets à l'entrée.
    [[2.75, 2.2], [2.2, 2.75]].forEach(function (q) { var a = P(q[0], q[1], 0); ctx.fillStyle = '#6a4a30'; ctx.fillRect(a[0] - 0.8, a[1] - 22, 1.6, 22); poly(ctx, [[a[0] + 0.8, a[1] - 22], [a[0] + 8, a[1] - 19], [a[0] + 0.8, a[1] - 16]], C.divert); });
  };
  PEINTRES.colisee = function (ctx, P, t, etat) {
    sol(ctx, P, 0.03, 0.03, 4.97, 4.97, teinte(C.pierre, 1.04));
    arene(ctx, P, 2.5, 2.5, 2.4, 2.05, 42, 3, 6, etat.actif, '#d9cdb0');
    // Bannières violettes pendues à l'attique, côté spectateur.
    for (var b = 0; b < 6; b++) {
      var a0 = -0.35 + b * 0.5, a1 = a0 + 0.07;
      var Q = function (a, h) { return P(2.5 + 2.4 * Math.cos(a), 2.5 + 2.05 * Math.sin(a), h); };
      poly(ctx, [Q(a0, 40), Q(a1, 40), Q(a1, 31), Q((a0 + a1) / 2, 28.5), Q(a0, 31)], b % 2 ? C.divert : teinte(C.divert, 0.8));
    }
    // Mâts du velum sur le haut du mur, moitié du fond (ils se découpent sur le ciel).
    for (var k = 0; k < 9; k++) {
      var an = Math.PI * (0.8 + k / 8 * 0.9), m = P(2.5 + 2.4 * Math.cos(an), 2.5 + 2.05 * Math.sin(an), 42);
      ctx.fillStyle = '#8a7a60'; ctx.fillRect(m[0] - 0.7, m[1] - 6, 1.4, 6);
      if (etat.actif && k % 2 === 0) poly(ctx, [[m[0] + 0.7, m[1] - 6], [m[0] + 6, m[1] - 4.5], [m[0] + 0.7, m[1] - 3]], C.divert);
    }
  };
  PEINTRES.ecole_gladiateurs = function (ctx, P) {
    sol(ctx, P, 0.04, 0.04, 2.96, 2.96, teinte(C.pierre, 1.02));
    sol(ctx, P, 0.25, 1.05, 2.75, 2.75, C.sable);
    var c = P(1.5, 1.9, 0); ellipse(ctx, c[0], c[1], 50, 22, teinte(C.sable, 0.94)); ellipse(ctx, c[0], c[1], 40, 17, C.sable);
    // Caserne au fond.
    boite(ctx, P, 0.12, 0.12, 2.88, 0.85, 0, 16, '#e2d2b2');
    [0.35, 0.9, 1.45, 2.0, 2.5].forEach(function (u) { ouverture(ctx, P, 'v', u, u + 0.22, 0.85, 0, 9, '#4a3424', 2); });
    fenetres(ctx, P, 'u', 0.12, 0.85, 2.88, 6, 11, 2, '#4a3424');
    toit(ctx, P, 0.12, 0.12, 2.88, 0.85, 16, 9, C.divert, 'u');
    // Râtelier d'armes et boucliers contre la caserne.
    var r = P(0.55, 1.05, 0);
    ligne(ctx, [r[0] - 10, r[1] - 3], [r[0] + 10, r[1] + 7], '#6e4a2c', 2);
    for (var k = 0; k < 4; k++) ligne(ctx, [r[0] - 8 + k * 5, r[1] - 12 + k * 2.5], [r[0] - 8 + k * 5, r[1] - 1 + k * 2.5], '#9aa0a8', 1.2);
    [[2.3, 1.0], [2.55, 1.0]].forEach(function (q, i) { var a = P(q[0], q[1], 0); poly(ctx, [[a[0] - 3, a[1] - 11], [a[0] + 3, a[1] - 13], [a[0] + 3, a[1] - 3], [a[0] - 3, a[1] - 1]], i ? C.secu : '#c28a3a', '#5a2a1e'); });
    // Poteaux d'entraînement (palus) et mannequin.
    [[0.8, 1.6], [1.5, 1.4], [2.2, 1.6], [0.9, 2.35]].forEach(function (q) {
      var a = P(q[0], q[1], 0); ctx.fillStyle = '#7a5232'; ctx.fillRect(a[0] - 1.8, a[1] - 13, 3.6, 13); ctx.fillStyle = '#5a3a22'; ctx.fillRect(a[0] + 0.6, a[1] - 13, 1.2, 13);
      ellipse(ctx, a[0], a[1], 4, 1.6, 'rgba(60,40,20,0.3)');
    });
    var mq = P(2.1, 2.3, 0); ctx.fillStyle = '#7a5232'; ctx.fillRect(mq[0] - 1, mq[1] - 14, 2, 14);
    ligne(ctx, [mq[0] - 6, mq[1] - 11], [mq[0] + 6, mq[1] - 11], '#7a5232', 2); ellipse(ctx, mq[0], mq[1] - 9, 4, 5, '#cfb47e'); cercle(ctx, mq[0], mq[1] - 16, 2.6, '#cfb47e');
    // Muret bas autour de la piste.
    boite(ctx, P, 0.12, 2.82, 2.88, 2.9, 0, 4, '#cbbd9e');
    boite(ctx, P, 2.82, 0.85, 2.9, 2.82, 0, 4, '#cbbd9e');
  };
  // Lion : pattes en (x, y), tête vers la droite ; pose 0 ou 1 (pas de marche).
  function peindreLion(ctx, x, y, s, pose) {
    var corps = '#d9a650', ombre = '#b5833a', criniere = '#8a4f22', o = pose ? 1.6 : -1.6;
    ellipse(ctx, x, y + 0.5, 10 * s, 2.2 * s, 'rgba(40,30,20,0.3)');
    ctx.fillStyle = ombre;
    ctx.fillRect(x - 6 * s - o * 0.5, y - 5 * s, 2 * s, 5 * s); ctx.fillRect(x + 4 * s + o * 0.5, y - 5 * s, 2 * s, 5 * s);
    ctx.save(); ctx.strokeStyle = corps; ctx.lineWidth = 1.6 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 8 * s, y - 7.5 * s); ctx.quadraticCurveTo(x - 12.5 * s, y - 8 * s, x - 12 * s, y - 3.5 * s); ctx.stroke(); ctx.restore();
    cercle(ctx, x - 12 * s, y - 3.2 * s, 1.5 * s, criniere);
    ellipse(ctx, x - 0.5 * s, y - 7.2 * s, 8.4 * s, 3.8 * s, corps);
    ellipse(ctx, x - 1 * s, y - 8.6 * s, 6.5 * s, 1.6 * s, '#e8bf6e');
    ctx.fillStyle = corps;
    ctx.fillRect(x - 5 * s + o * 0.5, y - 5 * s, 2.2 * s, 5 * s); ctx.fillRect(x + 3 * s - o * 0.5, y - 5 * s, 2.2 * s, 5 * s);
    cercle(ctx, x + 6.4 * s, y - 10.4 * s, 4.9 * s, criniere);
    cercle(ctx, x + 5.6 * s, y - 11.4 * s, 3.2 * s, teinte(criniere, 1.18));
    cercle(ctx, x + 8 * s, y - 10 * s, 2.9 * s, corps);
    ellipse(ctx, x + 10 * s, y - 9 * s, 1.7 * s, 1.4 * s, '#efd29a');
    cercle(ctx, x + 11.3 * s, y - 9.6 * s, 0.7 * s, '#3a2420');
    cercle(ctx, x + 8.6 * s, y - 11 * s, 0.6 * s, '#3a2420');
  }
  // Cage de pierre et de fer : socle, mur du fond, paille, lion, barreaux sur les deux faces visibles.
  function cage(ctx, P, u0, v0, u1, v1, pose) {
    var k, h = 18;
    boite(ctx, P, u0, v0, u1, v1, 0, 3, C.pierreF, '#d9c07a');
    boite(ctx, P, u0, v0, u1, v0 + 0.08, 3, h, C.pierre); boite(ctx, P, u0, v0, u0 + 0.08, v1, 3, h, C.pierre);
    var l = P((u0 + u1) / 2, (v0 + v1) / 2 + 0.05, 3); peindreLion(ctx, l[0], l[1], 0.85, pose);
    for (k = 0; k <= 10; k++) { var u = u0 + (u1 - u0) * k / 10; ligne(ctx, P(u, v1, 3), P(u, v1, h), '#3a3530', 1.2); }
    for (k = 0; k <= 8; k++) { var v = v0 + (v1 - v0) * k / 8; ligne(ctx, P(u1, v, 3), P(u1, v, h), '#2e2a26', 1.2); }
    ligne(ctx, P(u0, v1, h), P(u1, v1, h), '#4a4440', 2); ligne(ctx, P(u1, v0, h), P(u1, v1, h), '#3a3530', 2);
    ligne(ctx, P(u0, v1, h), P(u0, v0, h), '#4a4440', 1.5);
  }
  PEINTRES.maison_lions = function (ctx, P) {
    sol(ctx, P, 0.04, 0.04, 2.96, 2.96, teinte(C.terre, 1.1));
    // Maison du gardien.
    boite(ctx, P, 0.15, 0.15, 1.05, 1.0, 0, 16, '#e4d4b4');
    ouverture(ctx, P, 'v', 0.45, 0.7, 1.0, 0, 9, '#4a3424', 2);
    fenetres(ctx, P, 'u', 0.15, 1.0, 1.05, 7, 11, 2, '#4a3424');
    toit(ctx, P, 0.15, 0.15, 1.05, 1.0, 16, 9, C.divert, 'u');
    cage(ctx, P, 1.3, 0.2, 2.8, 1.05, 0);
    cage(ctx, P, 0.2, 1.3, 1.05, 2.8, 1);
    // Enclos de sable devant, avec un lion qui fait les cent pas.
    sol(ctx, P, 1.3, 1.3, 2.8, 2.8, C.sable);
    var l = P(2.0, 2.05, 0); peindreLion(ctx, l[0], l[1], 1, 1);
    var sv = P(1.5, 1.45, 0); ellipse(ctx, sv[0], sv[1], 4, 2, '#8a5a3a'); cercle(ctx, sv[0], sv[1] - 1, 2, '#c94a3a');
    boite(ctx, P, 1.3, 2.75, 2.85, 2.85, 0, 9, C.pierreF); boite(ctx, P, 2.75, 1.3, 2.85, 2.75, 0, 9, C.pierreF);
    for (var k = 0; k < 6; k++) { var a = P(1.4 + k * 0.28, 2.8, 9); ctx.fillStyle = '#3a3530'; ctx.fillRect(a[0] - 0.6, a[1] - 5, 1.2, 5); }
  };

  // --- Religion ----------------------------------------------------------------
  PEINTRES.temple_neptune = function (ctx, P) { peindreTemple(ctx, P, 'neptune'); };
  PEINTRES.temple_mercure = function (ctx, P) { peindreTemple(ctx, P, 'mercure'); };
  PEINTRES.temple_mars = function (ctx, P) { peindreTemple(ctx, P, 'mars'); };
  PEINTRES.temple_venus = function (ctx, P) { peindreTemple(ctx, P, 'venus'); };
  PEINTRES.grand_temple_ceres = function (ctx, P) { peindreGrandTemple(ctx, P, 'ceres'); };
  PEINTRES.grand_temple_neptune = function (ctx, P) { peindreGrandTemple(ctx, P, 'neptune'); };
  PEINTRES.grand_temple_mercure = function (ctx, P) { peindreGrandTemple(ctx, P, 'mercure'); };
  PEINTRES.grand_temple_mars = function (ctx, P) { peindreGrandTemple(ctx, P, 'mars'); };
  PEINTRES.grand_temple_venus = function (ctx, P) { peindreGrandTemple(ctx, P, 'venus'); };
  // Oracle : tholos rond (socle, anneau de colonnes, tambour, toit conique) et trépied à flamme sacrée.
  PEINTRES.oracle = function (ctx, P) {
    var k, cu = 0.95, cv = 0.95;
    sol(ctx, P, 0.05, 0.05, 1.95, 1.95, teinte(C.marbre, 0.92));
    cylindre(ctx, P, cu, cv, 0.8, 0, 3, nuance(C.marbre, 0.95));
    cylindre(ctx, P, cu, cv, 0.72, 3, 6, C.marbre);
    var cols = [];
    for (k = 0; k < 10; k++) { var an = (k + 0.5) / 10 * Math.PI * 2; cols.push([cu + 0.6 * Math.cos(an), cv + 0.6 * Math.sin(an)]); }
    var colonne = function (q) {
      var b = P(q[0], q[1], 6), h = P(q[0], q[1], 25), f = 0.8 + 0.18 * ((q[1] - cv) - (q[0] - cu)) / 0.85;
      ctx.fillStyle = teinte(C.marbre, f); ctx.fillRect(b[0] - 2, h[1], 4, b[1] - h[1]);
      ctx.fillStyle = teinte(C.marbre, f * 0.8); ctx.fillRect(b[0] + 1, h[1], 1, b[1] - h[1]);
    };
    cols.filter(function (q) { return q[0] + q[1] < cu + cv; }).forEach(colonne);
    cylindre(ctx, P, cu, cv, 0.42, 6, 25, nuance(C.marbre, 0.9), false);
    var dp = P(cu + 0.3, cv + 0.3, 6); poly(ctx, [[dp[0] - 3.5, dp[1]], [dp[0] - 3.5, dp[1] - 10], [dp[0], dp[1] - 13], [dp[0] + 3.5, dp[1] - 10], [dp[0] + 3.5, dp[1]]], '#5a3e26');
    cols.filter(function (q) { return q[0] + q[1] >= cu + cv; }).sort(function (a, b) { return (a[0] + a[1]) - (b[0] + b[1]); }).forEach(colonne);
    cylindre(ctx, P, cu, cv, 0.7, 25, 28, C.marbre);
    // Toit conique à tuiles rayonnantes, pomme dorée.
    var b0 = P(cu, cv, 28), ap = P(cu, cv, 50), rx = 0.72 * 45.25, ry = 0.72 * 22.63;
    var g = ctx.createLinearGradient(b0[0] - rx, 0, b0[0] + rx, 0);
    g.addColorStop(0, teinte(C.relig, 1.02)); g.addColorStop(1, teinte(C.relig, 0.7));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ap[0], ap[1]); ctx.lineTo(b0[0] - rx, b0[1]); ctx.ellipse(b0[0], b0[1], rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = teinte(C.relig, 0.78); ctx.lineWidth = 1;
    for (k = 1; k < 6; k++) { var a = Math.PI * k / 6; ctx.beginPath(); ctx.moveTo(ap[0], ap[1]); ctx.lineTo(b0[0] - Math.cos(a) * rx, b0[1] + Math.sin(a) * ry); ctx.stroke(); }
    ctx.strokeStyle = C.or; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(b0[0], b0[1], rx, ry, 0, 0, Math.PI); ctx.stroke();
    cercle(ctx, ap[0], ap[1] - 1.5, 2.5, C.or, teinte(C.or, 0.6));
    // Trépied de bronze et flamme sacrée, à l'angle avant.
    var tr = P(1.75, 1.75, 0);
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(tr[0] - 4, tr[1]); ctx.lineTo(tr[0], tr[1] - 9); ctx.lineTo(tr[0] + 4, tr[1]); ctx.moveTo(tr[0], tr[1] + 1); ctx.lineTo(tr[0], tr[1] - 9); ctx.stroke();
    ellipse(ctx, tr[0], tr[1] - 9.5, 5, 2, '#b08a4a');
    flamme(ctx, tr[0], tr[1] - 10, 1.5);
  };

  // --- Embellissement ---------------------------------------------------------
  // Dallage décoratif (places, abords des statues) : damier de deux tons et joints.
  function dallage(ctx, P, u0, v0, u1, v1, n, c) {
    sol(ctx, P, u0, v0, u1, v1, c);
    var du = (u1 - u0) / n, dv = (v1 - v0) / n, i, j;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) if ((i + j) % 2) sol(ctx, P, u0 + i * du, v0 + j * dv, u0 + (i + 1) * du, v0 + (j + 1) * dv, teinte(c, 0.94));
    for (i = 1; i < n; i++) { ligne(ctx, P(u0 + i * du, v0), P(u0 + i * du, v1), teinte(c, 0.86), 1); ligne(ctx, P(u0, v0 + i * dv), P(u1, v0 + i * dv), teinte(c, 0.86), 1); }
  }
  // Statue équestre de bronze : sabots en (x, y), cheval cabré tourné vers la droite, cavalier bras levé.
  function cavalier(ctx, x, y, s, c) {
    var cl = teinte(c, 1.2), cf = teinte(c, 0.7);
    var pt = function (l) { return l.map(function (q) { return [x + q[0] * s, y + q[1] * s]; }); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var jambe = function (col, l) { ctx.strokeStyle = col; ctx.lineWidth = 1.9 * s; ctx.beginPath(); var q = pt(l); ctx.moveTo(q[0][0], q[0][1]); for (var i = 1; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.stroke(); };
    // Pattes du côté loin (sombres), queue.
    jambe(cf, [[5, -7.5], [6.4, -3.8], [6, 0]]); jambe(cf, [[-5.4, -7.6], [-6.6, -3.8], [-6, 0]]);
    ctx.strokeStyle = cf; ctx.lineWidth = 1.8 * s; ctx.beginPath(); var tq = pt([[-8, -12], [-11.5, -9], [-10.5, -3.5]]);
    ctx.moveTo(tq[0][0], tq[0][1]); ctx.quadraticCurveTo(tq[1][0], tq[1][1], tq[2][0], tq[2][1]); ctx.stroke();
    // Corps, encolure et tête d'un seul tenant.
    poly(ctx, pt([[-7.5, -13], [-2, -12.6], [3, -13.6], [5.2, -16.4], [7.4, -19.8], [8, -21.4], [9.2, -19.6], [11.6, -15.6], [10.6, -14.4], [8.2, -16.2],
      [6.8, -13.2], [7, -9.6], [5.8, -6.8], [2, -6.2], [-4, -6.5], [-7.8, -8], [-8.6, -11.2]]), c);
    poly(ctx, pt([[-7, -12.6], [-2, -12.2], [3, -13.2], [5, -15.8], [4, -13.6], [-2, -11.2], [-6.6, -11.4]]), cl);
    poly(ctx, pt([[5.2, -16.4], [7.4, -19.8], [8, -21.4], [6.8, -20.6], [4.4, -16.6], [3, -13.6]]), cf);
    // Pattes du côté proche : l'avant levé (cabré).
    jambe(c, [[4.6, -7.6], [8.2, -6], [8.8, -3]]); jambe(c, [[-4.4, -7.6], [-4, -3.8], [-4.6, 0]]);
    // Cavalier : cape au vent, jambe, buste, tête, bras levé.
    poly(ctx, pt([[-1.2, -19.2], [-5.4, -14.2], [-1.4, -13.6]]), cf);
    jambe(cf, [[0.6, -13.2], [1.8, -9.4], [1.2, -7.8]]);
    poly(ctx, pt([[-1.4, -13], [-1, -19.6], [1.8, -19.6], [2, -13]]), c);
    poly(ctx, pt([[0.5, -13], [0.5, -19.6], [1.8, -19.6], [2, -13]]), cf);
    jambe(c, [[1.4, -18.6], [4.8, -23.6]]);
    var tt = pt([[0.4, -21.4]])[0]; cercle(ctx, tt[0], tt[1], 1.8 * s, c);
    ctx.restore();
  }
  PEINTRES.jardin = function (ctx, P) {
    sol(ctx, P, 0.03, 0.03, 0.97, 0.97, '#86b04e');
    sol(ctx, P, 0.42, 0.03, 0.58, 0.97, '#e6dab6'); sol(ctx, P, 0.03, 0.42, 0.97, 0.58, '#e6dab6');
    // Haies basses au fond, cyprès dans le carré du fond.
    boite(ctx, P, 0.06, 0.06, 0.4, 0.14, 0, 4, '#4f8a3a'); boite(ctx, P, 0.6, 0.06, 0.94, 0.14, 0, 4, '#4f8a3a');
    boite(ctx, P, 0.06, 0.14, 0.14, 0.4, 0, 4, '#4f8a3a'); boite(ctx, P, 0.06, 0.6, 0.14, 0.94, 0, 4, '#4f8a3a');
    var c = P(0.26, 0.26, 0); cypres(ctx, c[0], c[1], 20);
    fleurs(ctx, P, 0.62, 0.18, 0.92, 0.38, 6, 1);
    fleurs(ctx, P, 0.18, 0.62, 0.38, 0.92, 6, 2);
    var a = P(0.75, 0.75, 0); arbuste(ctx, a[0], a[1], 5, '#5f9a3c');
    fleurs(ctx, P, 0.62, 0.62, 0.92, 0.7, 3, 3);
    boite(ctx, P, 0.6, 0.9, 0.94, 0.96, 0, 3, '#4f8a3a'); boite(ctx, P, 0.9, 0.6, 0.96, 0.9, 0, 3, '#4f8a3a');
  };
  PEINTRES.statue_petite = function (ctx, P) {
    dallage(ctx, P, 0.08, 0.08, 0.92, 0.92, 2, '#e2d8c0');
    fleurs(ctx, P, 0.14, 0.14, 0.86, 0.3, 4, 4); fleurs(ctx, P, 0.14, 0.3, 0.3, 0.86, 3, 6);
    boite(ctx, P, 0.32, 0.32, 0.68, 0.68, 0, 3, nuance(C.marbre, 0.95));
    boite(ctx, P, 0.38, 0.38, 0.62, 0.62, 3, 11, C.marbre);
    var s = P(0.5, 0.5, 11); figure(ctx, s[0], s[1], 0.95, '#ece6d8', true);
  };
  PEINTRES.statue_moyenne = function (ctx, P) {
    dallage(ctx, P, 0.06, 0.06, 1.94, 1.94, 4, '#e2d8c0');
    [[0.12, 0.12], [1.5, 0.12], [0.12, 1.5], [1.5, 1.5]].forEach(function (q, i) {
      boite(ctx, P, q[0], q[1], q[0] + 0.38, q[1] + 0.38, 0, 2, C.pierreF, '#6f9e44');
      fleurs(ctx, P, q[0] + 0.06, q[1] + 0.06, q[0] + 0.32, q[1] + 0.32, 5, i + 7);
    });
    boite(ctx, P, 0.55, 0.55, 1.45, 1.45, 0, 3, nuance(C.marbre, 0.94));
    boite(ctx, P, 0.66, 0.66, 1.34, 1.34, 3, 6, nuance(C.marbre, 0.98));
    boite(ctx, P, 0.78, 0.78, 1.22, 1.22, 6, 17, C.marbre);
    bandeau(ctx, P, 0.76, 0.76, 1.24, 1.24, 15, 2, C.or);
    var s = P(1.0, 1.0, 17), main = figure(ctx, s[0], s[1], 1.45, '#c49a52', true, C.secu);
    cercle(ctx, main[0], main[1] - 1.5, 2.2, '#5f9e3c', '#3d6a2a');
  };
  PEINTRES.statue_grande = function (ctx, P) {
    dallage(ctx, P, 0.04, 0.04, 2.96, 2.96, 6, '#e2d8c0');
    // Bassin de marbre autour du socle.
    boite(ctx, P, 0.32, 0.32, 2.68, 2.68, 0, 4, C.marbre, teinte(C.marbre, 1.04));
    poly(ctx, [P(0.46, 0.46, 4), P(2.54, 0.46, 4), P(2.54, 2.54, 4), P(0.46, 2.54, 4)], C.eau);
    ctx.strokeStyle = C.eauClair; ctx.lineWidth = 1;
    [[0.8, 0.9], [2.0, 0.8], [0.9, 2.1], [2.2, 2.0], [1.6, 2.3]].forEach(function (q) { var a = P(q[0], q[1], 4); ctx.beginPath(); ctx.moveTo(a[0] - 4, a[1]); ctx.lineTo(a[0] + 4, a[1]); ctx.stroke(); });
    // Jets d'eau aux quatre coins du bassin.
    [[0.62, 0.62], [2.38, 0.62], [0.62, 2.38], [2.38, 2.38]].forEach(function (q) {
      var a = P(q[0], q[1], 4);
      poly(ctx, [[a[0] - 1, a[1]], [a[0] - 3, a[1] - 6], [a[0], a[1] - 10], [a[0] + 3, a[1] - 6], [a[0] + 1, a[1]]], 'rgba(220,240,255,0.75)');
      ellipse(ctx, a[0], a[1], 4, 1.6, 'rgba(220,240,255,0.6)');
    });
    // Haut socle mouluré, statue équestre de bronze.
    boite(ctx, P, 1.05, 1.05, 1.95, 1.95, 4, 8, nuance(C.marbre, 0.95));
    boite(ctx, P, 1.16, 1.16, 1.84, 1.84, 8, 26, C.marbre);
    bandeau(ctx, P, 1.12, 1.12, 1.88, 1.88, 24, 2.5, C.or);
    ouverture(ctx, P, 'v', 1.3, 1.7, 1.84, 12, 20, teinte(C.marbre, 0.88));
    var s = P(1.5, 1.5, 26); cavalier(ctx, s[0], s[1], 1.6, '#5f8f7e');
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
    pretre: ['#f2efe6', '#e3cdb0'], acteur: ['#d9b13a', '#e8cdb2'], comedien: ['#d65a8c', '#e8cdb2'],
    // Lot 2.
    charretier: ['#5f7d8c', '#e0c9a0'], instituteur: ['#3a8f82', '#e3cdb0'], bibliothecaire: ['#2f7392', '#e3cdb0'],
    professeur: ['#ece6d8', '#e1c8a8'], barbier: ['#e07b6c', '#e8cdb2'], employe_bains: ['#6aa5d6', '#e3cdb0'],
    medecin: ['#b9574c', '#e3cdb0'], chirurgien: ['#f2efe8', '#e1c8a8'], lutteur: ['#d9a27a', '#e0ae88'],
    dompteur: ['#6a3a78', '#e1c8a8'], gladiateur: ['#8a2a22', '#d9a880']
  };
  // Image d'un marcheur : largeur, hauteur et point d'ancrage (pieds, ou ligne de flottaison du bateau).
  // Les personnages gardent 22 × 30 ancrés en (10, 26) ; le charretier tire sa charrette, d'où plus de largeur.
  var FORMATS = { charretier: [38, 30, 19, 26], lion: [34, 26, 17, 22], bateau: [44, 34, 22, 27] };
  function peindreMarcheur(ctx, type, pose, inverse) {
    var t = TENUES[type] || ['#888', '#ddd'], x = 10, y = 26;
    if (inverse) { ctx.translate(20, 0); ctx.scale(-1, 1); }
    if (type === 'lion') { peindreLion(ctx, x, y, 1, pose); return; }
    if (type === 'bateau') { barque(ctx, x, y, true, pose); return; }
    if (type === 'charretier') {
      // Charrette à bras tirée derrière lui : caisse chargée, grande roue, brancards jusqu'aux mains.
      ellipse(ctx, x - 11, y, 7, 2, 'rgba(30,30,20,0.3)');
      ligne(ctx, [x - 7, y - 9], [x + 3, y - 11], '#6e4a2c', 1.5);
      boite2d(ctx, x - 16, y - 13, 10, 6, '#8a6a48');
      ctx.fillStyle = '#e0bf52'; ellipse(ctx, x - 13.5, y - 14, 3, 2.4, '#e0bf52'); ellipse(ctx, x - 9.5, y - 14.5, 2.6, 2.2, '#d9c08a');
      amphore(ctx, x - 11.5, y - 12, '#c0643c', true);
      cercle(ctx, x - 11, y - 4, 3.6, '#4a3828'); cercle(ctx, x - 11, y - 4, 1.2, '#a8743f');
    }
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
    // Lot 2.
    else if (type === 'instituteur') { ctx.fillStyle = '#efe2c0'; ctx.fillRect(x + 2.2, y - 13, 5, 2.6); cercle(ctx, x + 2.2, y - 11.7, 1.3, '#d9c08a'); cercle(ctx, x + 7.2, y - 11.7, 1.3, '#d9c08a'); }
    else if (type === 'bibliothecaire') { for (var r = 0; r < 3; r++) { ctx.fillStyle = r % 2 ? '#e2c98e' : '#f2e6c6'; ctx.fillRect(x + 2.2, y - 10 - r * 2.4, 5, 2.2); cercle(ctx, x + 7.2, y - 8.9 - r * 2.4, 1.1, '#c9a86a'); } }
    else if (type === 'professeur') {
      poly(ctx, [[x - 3.6, y - 15.5], [x + 3.6, y - 9], [x + 3.9, y - 7.4], [x - 2.2, y - 12.8]], C.educ);
      ctx.fillStyle = '#6e4a2c'; ctx.fillRect(x + 5, y - 23, 1.5, 22); cercle(ctx, x + 5.75, y - 23.4, 1.5, '#8a6238');
    }
    else if (type === 'barbier') { ellipse(ctx, x + 5.5, y - 11, 3, 1.6, '#c98a4a'); ctx.fillStyle = '#f6f0e6'; ctx.fillRect(x - 6, y - 15, 2.2, 6); }
    else if (type === 'employe_bains') { poly(ctx, [[x + 3, y - 11], [x + 8.6, y - 11], [x + 7.8, y - 5], [x + 3.8, y - 5]], '#8a6a48'); ellipse(ctx, x + 5.8, y - 11, 2.8, 1, C.eauClair); ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x + 5.8, y - 11, 2.8, Math.PI, 0); ctx.stroke(); }
    else if (type === 'medecin') { poly(ctx, [[x + 3.4, y - 11], [x + 8.2, y - 11], [x + 8.7, y - 6], [x + 3, y - 6]], '#7a4a2a'); ctx.fillStyle = '#5a3a22'; ctx.fillRect(x + 5, y - 12.5, 3, 1.5); }
    else if (type === 'chirurgien') { ctx.fillStyle = C.sante; ctx.fillRect(x - 3.4, y - 10, 6.8, 1.4); poly(ctx, [[x + 3.4, y - 11], [x + 8.2, y - 11], [x + 8.7, y - 6], [x + 3, y - 6]], '#6a2a22'); }
    else if (type === 'lutteur') {
      ctx.fillStyle = '#6a3a2a'; ctx.fillRect(x - 4, y - 9.5, 8, 2.6);
      ellipse(ctx, x + 5.4, y - 12, 3.4, 4.2, '#7a4a2a'); ellipse(ctx, x + 5.1, y - 12.2, 2.6, 3.4, '#c28a3a'); cercle(ctx, x + 5.1, y - 12.2, 1, C.or);
    }
    else if (type === 'dompteur') {
      ctx.save(); ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 4, y - 12); ctx.lineTo(x + 5.5, y - 15.5);
      ctx.quadraticCurveTo(x + 8.6, y - (pose ? 21 : 14), x + 8, y - (pose ? 23 : 4)); ctx.stroke(); ctx.restore();
    }
    else if (type === 'gladiateur') {
      cercle(ctx, x, y - 19.5, 3.4, '#9aa0a8'); ctx.fillStyle = '#5a6068'; ctx.fillRect(x - 0.5, y - 20, 3.5, 1.2);
      poly(ctx, [[x - 3, y - 21.6], [x - 0.6, y - 25], [x + 3, y - 22.2], [x, y - 22.8]], C.secu);
      ligne(ctx, [x - 3, y - 12], [x - 8, y - 17], '#c8ccd2', 1.6);
      poly(ctx, [[x + 2.5, y - 17], [x + 8, y - 16], [x + 8, y - 6], [x + 2.5, y - 6.5]], C.secu, '#6a2018');
      cercle(ctx, x + 5.3, y - 11.5, 1.2, C.or);
    }
  }
  // Petite caisse vue de trois quarts, en coordonnées d'écran (marcheurs) : face avant de (x, y), w × h.
  function boite2d(ctx, x, y, w, h, c) {
    ctx.fillStyle = teinte(c, 0.95); ctx.fillRect(x, y, w, h);
    poly(ctx, [[x, y], [x + 2.5, y - 2], [x + w + 2.5, y - 2], [x + w, y]], teinte(c, 1.15));
    poly(ctx, [[x + w, y], [x + w + 2.5, y - 2], [x + w + 2.5, y + h - 2], [x + w, y + h]], teinte(c, 0.7));
  }
  function marcheur(type, pose, inverse, z) {
    var k = 'm:' + type + ':' + pose + ':' + (inverse ? 1 : 0) + '@' + z;
    var s = cache.get(k);
    if (s) return s;
    var f = z * DPR, c = document.createElement('canvas'), fm = FORMATS[type] || [22, 30, 10, 26];
    c.width = Math.ceil(fm[0] * f); c.height = Math.ceil(fm[1] * f);
    var ctx = c.getContext('2d');
    ctx.scale(f, f);
    ctx.translate(fm[2] - 10, fm[3] - 26);
    peindreMarcheur(ctx, type, pose, inverse);
    s = { c: c, ox: -fm[2], oy: -fm[3], w: fm[0], h: fm[1] };
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
    // Lot 2 : caisse vide et flèche vers le bas (pas de matière première).
    else if (cause === 'sansMatiere') {
      ctx.lineWidth = 1.8; ctx.strokeRect(6, 13, 12, 6.5); ctx.beginPath(); ctx.moveTo(6, 13); ctx.lineTo(8, 11); ctx.lineTo(20, 11); ctx.lineTo(18, 13); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, 3); ctx.lineTo(12, 7.5); ctx.stroke(); poly(ctx, [[9, 6.5], [15, 6.5], [12, 10]], '#7a2e22');
    }
    // Poisson barré (pas de banc de poissons).
    else if (cause === 'sansBanc') {
      ellipse(ctx, 13, 12, 5.5, 3.2, '#7a2e22'); poly(ctx, [[8.5, 12], [4.5, 8.5], [4.5, 15.5]], '#7a2e22'); cercle(ctx, 16, 11.2, 0.9, '#fff8e8');
      ctx.lineWidth = 2.2; ctx.strokeStyle = '#fff8e8'; ctx.beginPath(); ctx.moveTo(5.5, 19.5); ctx.lineTo(18.5, 4.5); ctx.stroke();
      ctx.lineWidth = 1.6; ctx.strokeStyle = '#7a2e22'; ctx.beginPath(); ctx.moveTo(5, 20); ctx.lineTo(19, 4); ctx.stroke();
    }
    // Tuyau et goutte barrés (pas de réservoir relié).
    else if (cause === 'sansReservoir') {
      ctx.fillRect(4, 6, 10, 3.2); ctx.fillRect(12, 6, 3.2, 5);
      ctx.beginPath(); ctx.moveTo(13.6, 12); ctx.quadraticCurveTo(18.5, 17, 13.6, 20); ctx.quadraticCurveTo(8.7, 17, 13.6, 12); ctx.fill();
      ctx.lineWidth = 2.2; ctx.strokeStyle = '#fff8e8'; ctx.beginPath(); ctx.moveTo(5.5, 19.5); ctx.lineTo(18.5, 4.5); ctx.stroke();
      ctx.lineWidth = 1.6; ctx.strokeStyle = '#7a2e22'; ctx.beginPath(); ctx.moveTo(5, 20); ctx.lineTo(19, 4); ctx.stroke();
    }
    // Caisse pleine et flèche vers le haut (stock plein, sans preneur).
    else if (cause === 'stockPlein') {
      ctx.fillRect(6, 12, 12, 7.5); poly(ctx, [[6, 12], [8, 10], [20, 10], [18, 12]], '#7a2e22');
      ctx.fillStyle = '#fff8e8'; ctx.fillRect(7.5, 15, 9, 1);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, 9); ctx.lineTo(12, 5); ctx.stroke(); poly(ctx, [[9, 6], [15, 6], [12, 2.5]], '#7a2e22');
    }
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
  var HAUT = { puits: 34, fontaine: 34, reservoir: 30, aqueduc: 30, barriere: 18, ferme_ble: 30, grenier: 52, marche: 30, temple_ceres: 50, theatre: 34, colonie_acteurs: 40, forum: 40, prefecture: 44, ingenieur: 40, ruines: 14, gravats: 14, incendie: 50,
    // Lot 2 (hauteur utilisée au-dessus de l'emprise, plus 8 px de marge).
    ferme_legumes: 20, ferme_fruits: 20, ferme_porcs: 20, ferme_olives: 20, ferme_vigne: 20, quai_peche: 18,
    carriere_argile: 14, camp_bucherons: 18, mine_fer: 28, carriere_marbre: 32,
    atelier_poterie: 20, atelier_mobilier: 22, pressoir: 14, cave: 20, atelier_armes: 32, entrepot: 28,
    ecole: 22, bibliotheque: 34, academie: 32, barbier: 24, bains: 44, medecin: 24, hopital: 36,
    amphitheatre: 18, colisee: 34, ecole_gladiateurs: 26, maison_lions: 24,
    temple_neptune: 32, temple_mercure: 32, temple_mars: 32, temple_venus: 32,
    grand_temple_ceres: 44, grand_temple_neptune: 44, grand_temple_mercure: 44, grand_temple_mars: 44, grand_temple_venus: 44, oracle: 32,
    jardin: 20, statue_petite: 22, statue_moyenne: 24, statue_grande: 26 };
  // Emprise prévue des dessins du lot 2 (repli des vignettes quand les données ne connaissent pas encore le type).
  var TAILLE = { ferme_legumes: 3, ferme_fruits: 3, ferme_porcs: 3, ferme_olives: 3, ferme_vigne: 3, quai_peche: 2,
    carriere_argile: 2, camp_bucherons: 2, mine_fer: 2, carriere_marbre: 2, atelier_poterie: 2, atelier_mobilier: 2, pressoir: 2, cave: 2,
    atelier_armes: 2, entrepot: 3, ecole: 2, bibliotheque: 2, academie: 3, barbier: 1, bains: 2, medecin: 1, hopital: 3,
    amphitheatre: 3, colisee: 5, ecole_gladiateurs: 3, maison_lions: 3, temple_neptune: 2, temple_mercure: 2, temple_mars: 2, temple_venus: 2,
    grand_temple_ceres: 3, grand_temple_neptune: 3, grand_temple_mercure: 3, grand_temple_mars: 3, grand_temple_venus: 3, oracle: 2,
    jardin: 1, statue_petite: 1, statue_moyenne: 2, statue_grande: 3 };
  // Hauteur réservée au-dessus d'une maison : celle d'avant pour les niveaux 1 à 6, assez pour les immeubles ensuite.
  var HAUT_MAISON = { 7: 34, 8: 40, 9: 42, 10: 42, 11: 54, 12: 64 };
  function hautMaison(niv, t) { return niv <= 6 ? 30 + Math.max(0, niv - 4) * 8 : (HAUT_MAISON[niv] || 70); }

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
    biens: BIENS,
    maison: function (niv, v, t, z) { return sprite('maison:' + niv + ':' + v + ':' + t, t, hautMaison(niv, t), function (ctx, P, tt) { peindreMaison(ctx, P, niv, v, tt); }, z); },
    // Place dallée (masque des voisins comme les routes : 1 nord, 2 est, 4 sud, 8 ouest).
    place: function (masque, z) { return sprite('place:' + masque, 1, 0, function (ctx, P) { peindrePlace(ctx, P, masque); }, z); },
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
      var bd = racine.MM_SIM ? racine.MM_SIM.donnees().batiments[type] : null;
      var tt = type === 'logement' ? 1 : (bd ? bd.taille : (TAILLE[type] || 1));
      var haut = type === 'logement' ? ((niv || 5) > 6 ? hautMaison(niv, 1) : 30) : (HAUT[type] || 40);
      var w = tt * TW, h = tt * TH + haut, k = Math.min(taille / w, taille / h) * 0.95 * f;
      ctx.translate((taille * f - w * k) / 2, (taille * f - h * k) / 2);
      ctx.scale(k, k);
      var P = projecteur(tt, haut);
      if (type === 'logement') peindreMaison(ctx, P, niv || 5, 0, 1);
      else if (type === 'route') { peindreRoute(ctx, P, 10, false); }
      else if (type === 'place') { peindrePlace(ctx, P, 10); }
      else if (type === 'deblayer') { peindreArbre(ctx, P, 0); ctx.strokeStyle = '#b03a2e'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(12, haut - 10); ctx.lineTo(52, haut + 26); ctx.stroke(); }
      else if (type === 'barriere') { peindreRoute(ctx, P, 10, false); PEINTRES.barriere(ctx, P); }
      else if (PEINTRES[type]) PEINTRES[type](ctx, P, tt, {
        actif: 1, plein: 1, frame: 0, axe: 'u', eau: 1, prog: 0.8, niveau: 3, matiere: 2, bateau: 1,
        emplacements: [['ble', 4], ['vin', 2], null, ['bois', 3], null, null, ['marbre', 1], null]
      });
      return c;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
