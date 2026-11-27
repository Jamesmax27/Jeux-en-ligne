/* ==========================================================================
   Cosmoria — dessins, partie 7 : icônes d'arrêt, images des biens, ciel étoilé
   et accès publics (CM_DESSINS, lu par le rendu et par l'interface).
   ========================================================================== */
(function (racine) {
  'use strict';
  var A = racine.CM_ART, C = A.C, PE = A.PEINTRES, HAUT = A.HAUT, B = A.batir, T = A.terrain;
  var poly = A.poly, ligne = A.ligne, trace = A.trace, cercle = A.cercle, ellipse = A.ellipse, teinte = A.teinte, nuance = A.nuance,
    alpha = A.alpha, lueur = A.lueur, lampe = A.lampe, degV = A.degV, degR = A.degR, sphere = A.sphere;

  // --- Icônes d'arrêt (au-dessus des bâtiments, sans texte) -------------------
  // Pastille sombre cerclée d'orange, pictogramme clair : lisible sur tous les sols.
  var ALERTE = '#ff7a4a', CLAIR = '#ffe9d6';
  function barre(ctx) { ligne(ctx, [6, 19], [18, 5], '#16203a', 3.4); ligne(ctx, [6, 19], [18, 5], ALERTE, 1.8); }
  function peindreIcone(ctx, cause) {
    lueur(ctx, 12, 12, 13, ALERTE, 0.45);
    cercle(ctx, 12, 12, 10.4, '#16203a', ALERTE, 1.6);
    ctx.fillStyle = CLAIR; ctx.strokeStyle = CLAIR; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (cause) {
      case 'pasDeRoute': poly(ctx, [[5, 14], [12, 10], [19, 14], [12, 18]], CLAIR); ligne(ctx, [9, 14], [15, 14], '#16203a', 1); barre(ctx); break;
      case 'pasDePersonnel': case 'sansSoldat': cercle(ctx, 12, 8.4, 3.2, CLAIR); ctx.beginPath(); ctx.roundRect(7.4, 12.4, 9.2, 6.6, 2.4); ctx.fill(); ctx.fillStyle = '#16203a'; ctx.beginPath(); ctx.ellipse(12.8, 8.4, 1.8, 1.5, 0, 0, Math.PI * 2); ctx.fill(); break;
      case 'sansEau': ctx.beginPath(); ctx.moveTo(12, 4.6); ctx.quadraticCurveTo(18.6, 13, 12, 18.6); ctx.quadraticCurveTo(5.4, 13, 12, 4.6); ctx.fill(); barre(ctx); break;
      case 'sansPreneur': case 'stockPlein': ctx.fillRect(6.4, 12, 11.2, 7); poly(ctx, [[6.4, 12], [8.4, 10], [19.6, 10], [17.6, 12]], CLAIR); ligne(ctx, [12, 8.6], [12, 4.6], CLAIR, 1.8); poly(ctx, [[9.2, 6.2], [14.8, 6.2], [12, 3]], CLAIR); break;
      case 'sansMatiere': ctx.lineWidth = 1.6; ctx.strokeRect(6.4, 12.6, 11.2, 6.6); ligne(ctx, [12, 3.6], [12, 8], CLAIR, 1.8); poly(ctx, [[9.2, 7], [14.8, 7], [12, 10.4]], CLAIR); break;
      case 'sansMarchandise': case 'sansArtiste': cercle(ctx, 12, 12, 5.6, null, CLAIR, 1.8); barre(ctx); break;
      case 'sansBanc': ellipse(ctx, 13, 12, 5.4, 3.1, CLAIR); poly(ctx, [[8.6, 12], [4.8, 8.8], [4.8, 15.2]], CLAIR); cercle(ctx, 15.8, 11.3, 0.9, '#16203a'); barre(ctx); break;
      case 'sansReservoir': ctx.fillRect(4.6, 6.4, 9.6, 3); ctx.fillRect(12, 6.4, 3, 4.8); ctx.beginPath(); ctx.moveTo(13.5, 12.4); ctx.quadraticCurveTo(18, 16.8, 13.5, 19.6); ctx.quadraticCurveTo(9, 16.8, 13.5, 12.4); ctx.fill(); barre(ctx); break;
      case 'colereNeptune': case 'sansRouteMer': poly(ctx, [[5, 13.6], [19, 13.6], [16.4, 17.6], [7.6, 17.6]], CLAIR); ctx.fillRect(10, 8.4, 5, 5); barre(ctx); break;
      case 'sansFort': poly(ctx, [[6.6, 6], [17.4, 6], [17.4, 12.6], [12, 18.6], [6.6, 12.6]], null, CLAIR, 1.8); barre(ctx); break;
      default: ctx.fillRect(10.9, 5.6, 2.2, 8.6); ctx.fillRect(10.9, 16, 2.2, 2.4);
    }
  }
  function icone(cause, z) { return A.image('i:' + cause, 24, 24, 12, 24, function (ctx) { peindreIcone(ctx, cause); }, z); }

  // --- Biens : une image par bien, dans un carré de 24 × 24 (sans texte) -----------
  // On reconnaît le bien à sa forme autant qu'à sa couleur.
  function peindreBien(ctx, g) {
    var c = A.BIENS[g] || '#aaa', k;
    ellipse(ctx, 12, 20.6, 8.4, 2, 'rgba(10,12,24,0.3)');
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (g) {
      case 'ble': // trois épis dorés
        for (k = -1; k <= 1; k++) { ligne(ctx, [12 + k * 2, 20], [12 + k * 5.4, 7], nuance(c, 0.72), 1.1); for (var j = 0; j < 4; j++) { ellipse(ctx, 12 + k * 5.4 - (k * 0.3) * j - 1.4, 7.6 + j * 2.6, 1.7, 1.1, c); ellipse(ctx, 12 + k * 5.4 - (k * 0.3) * j + 1.6, 8.6 + j * 2.6, 1.7, 1.1, nuance(c, 0.86)); } }
        break;
      case 'legumes': // salade ronde et carotte
        cercle(ctx, 9.4, 14, 5.8, nuance(c, 0.8)); cercle(ctx, 9, 13.4, 4.2, c); cercle(ctx, 8.4, 12.8, 2.2, nuance(c, 1.3));
        poly(ctx, [[15.4, 9.4], [20, 12], [15.6, 20.4]], '#ff8a3c'); ligne(ctx, [17, 9.8], [18, 6], '#62c24a', 1.4); ligne(ctx, [18.4, 10.6], [21, 7.4], '#62c24a', 1.4);
        break;
      case 'fruits': // deux fruits orange à feuille
        sphere(ctx, 9, 14.4, 5.4, c); sphere(ctx, 16, 15.6, 4.4, nuance(c, 1.1)); ellipse(ctx, 10.6, 8, 2.6, 1.2, '#62c24a'); ligne(ctx, [9, 9.4], [9.4, 7.4], '#6b4a3a', 1);
        break;
      case 'porc': // bloc de protéines rose dans sa barquette
        poly(ctx, [[4.6, 12], [12, 8.4], [19.4, 12], [12, 15.6]], nuance(c, 1.2)); poly(ctx, [[4.6, 12], [12, 15.6], [12, 20], [4.6, 16.4]], c); poly(ctx, [[19.4, 12], [12, 15.6], [12, 20], [19.4, 16.4]], nuance(c, 0.72));
        ligne(ctx, [7.6, 11.6], [12, 9.6], 'rgba(255,255,255,0.7)', 1);
        break;
      case 'poisson':
        ctx.fillStyle = degV(ctx, 8, 18, nuance(c, 1.25), nuance(c, 0.7)); ctx.beginPath(); ctx.ellipse(13.4, 13, 6.8, 4.2, 0, 0, Math.PI * 2); ctx.fill();
        poly(ctx, [[7.6, 13], [3, 8.6], [3, 17.4]], nuance(c, 0.82)); poly(ctx, [[12, 9], [15, 6], [16, 9.4]], nuance(c, 0.82)); cercle(ctx, 17, 12, 1.1, '#16203a'); cercle(ctx, 17.3, 11.7, 0.4, '#fff');
        break;
      case 'olives': // botte de fibres liée
        for (k = 0; k < 6; k++) ligne(ctx, [7 + k * 2, 20], [5 + k * 2.8, 5 + (k % 2) * 1.4], k % 2 ? c : nuance(c, 0.8), 1.5);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(7, 12.4, 10.6, 2.4);
        break;
      case 'raisin': // grappe de baies violettes
        [[12, 8], [9, 11], [15, 11], [12, 12.4], [10.4, 15], [13.8, 15], [12, 18]].forEach(function (q, i) { sphere(ctx, q[0], q[1], 2.6, i % 2 ? c : nuance(c, 1.16)); });
        ligne(ctx, [12, 6], [13.6, 3.4], '#62c24a', 1.2); ellipse(ctx, 16, 4.6, 2.6, 1.2, '#62c24a');
        break;
      case 'argile': // tas de silice claire qui scintille
        ctx.fillStyle = degV(ctx, 8, 20, nuance(c, 1.2), nuance(c, 0.74)); ctx.beginPath(); ctx.moveTo(3.4, 20); ctx.quadraticCurveTo(12, 3, 20.6, 20); ctx.closePath(); ctx.fill();
        cercle(ctx, 10, 13, 0.8, '#fff'); cercle(ctx, 14.4, 16, 0.7, '#fff'); cercle(ctx, 12, 9.6, 0.6, '#fff');
        break;
      case 'bois': // goutte de résine ambrée
        lueur(ctx, 12, 14, 9, c, 0.4);
        ctx.fillStyle = degR(ctx, 12, 14.4, 7.4, [[0, nuance(c, 1.45)], [0.6, c], [1, nuance(c, 0.6)]], 10, 12); ctx.beginPath(); ctx.moveTo(12, 3.4); ctx.quadraticCurveTo(20, 13.6, 12, 20.4); ctx.quadraticCurveTo(4, 13.6, 12, 3.4); ctx.fill();
        ellipse(ctx, 10, 12.4, 1.2, 2.2, 'rgba(255,255,255,0.75)');
        break;
      case 'fer': // lingots de métal empilés
        [[4.4, 15.6], [12.4, 15.6], [8.4, 10.6]].forEach(function (q) { poly(ctx, [[q[0], q[1]], [q[0] + 1.6, q[1] - 2.4], [q[0] + 8.4, q[1] - 2.4], [q[0] + 7, q[1]]], nuance(c, 1.3)); ctx.fillStyle = c; ctx.fillRect(q[0], q[1], 7, 4.4); poly(ctx, [[q[0] + 7, q[1]], [q[0] + 8.4, q[1] - 2.4], [q[0] + 8.4, q[1] + 2], [q[0] + 7, q[1] + 4.4]], nuance(c, 0.66)); });
        break;
      case 'marbre': // cristaux lumineux
        lueur(ctx, 12, 12, 11, c, 0.45); A.cristal(ctx, 8, 20, 3, 12, c, -1.4); A.cristal(ctx, 13, 20.6, 4, 17, c, 0.6); A.cristal(ctx, 17.6, 20, 2.4, 9, c, 1.6);
        break;
      case 'poterie': // bol et assiette de céramique à liseré bleu
        ctx.fillStyle = degV(ctx, 8, 19, '#ffffff', '#b9c2cf'); ctx.beginPath(); ctx.moveTo(4.6, 10.4); ctx.quadraticCurveTo(5.4, 19.6, 12, 19.6); ctx.quadraticCurveTo(18.6, 19.6, 19.4, 10.4); ctx.closePath(); ctx.fill();
        ellipse(ctx, 12, 10.4, 7.4, 2.4, '#ffffff', '#4fc8e8', 1); ellipse(ctx, 12, 10.6, 5, 1.4, '#dfe6ef'); ligne(ctx, [6.4, 15], [17.6, 15], '#4fc8e8', 1);
        break;
      case 'mobilier': // fauteuil imprimé
        ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(6, 5.4, 4, 13.4, 1.6); ctx.fill(); ctx.fillStyle = nuance(c, 1.2); ctx.beginPath(); ctx.roundRect(6, 12.4, 12.4, 4.4, 1.6); ctx.fill();
        ligne(ctx, [7.6, 17], [7.6, 20], nuance(c, 0.7), 1.6); ligne(ctx, [17, 17], [17, 20], nuance(c, 0.7), 1.6); ctx.fillStyle = '#ff8fd0'; ctx.beginPath(); ctx.roundRect(10, 10.4, 7.6, 2.8, 1.2); ctx.fill();
        break;
      case 'huile': // combinaison pliée (vêtements)
        poly(ctx, [[8, 5], [16, 5], [20.4, 9.4], [17.6, 12], [16, 10.4], [16, 20], [8, 20], [8, 10.4], [6.4, 12], [3.6, 9.4]], c);
        poly(ctx, [[10, 5], [14, 5], [12, 8.4]], '#16203a'); ctx.fillStyle = '#ffffff'; ctx.fillRect(8, 13.4, 8, 1.4); cercle(ctx, 12, 11, 0.9, '#ffffff');
        break;
      case 'vin': // bonbonne de nectar
        sphere(ctx, 12, 14.6, 6.4, c); ctx.fillStyle = '#dfe6ef'; ctx.fillRect(10.4, 4.4, 3.2, 5); ctx.fillStyle = '#ffd35a'; ctx.fillRect(10, 3.4, 4, 1.8);
        ellipse(ctx, 9.6, 12.4, 1.2, 2.4, 'rgba(255,255,255,0.7)');
        break;
      case 'armes': // pistolet à impulsion
        poly(ctx, [[4, 9], [18, 9], [20.4, 11], [18, 13], [11.4, 13], [10, 19.4], [6.4, 19.4], [7.4, 13], [4, 13]], '#5d6878'); ctx.fillStyle = c; ctx.fillRect(8, 10.2, 8.4, 1.6); lampe(ctx, 20.6, 11, c, 1);
        break;
      default: cercle(ctx, 12, 12, 6, c);
    }
  }
  // Image d'un bien pour l'interface : un canvas neuf, taille × taille pixels CSS.
  var IMAGES_BIENS = {};
  function imageBien(g, taille) {
    var f = Math.min(3, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)), cle = g + '@' + f;
    var src = IMAGES_BIENS[cle];
    if (!src) {
      src = document.createElement('canvas'); src.width = src.height = Math.ceil(48 * f);
      var cx = src.getContext('2d'); cx.scale(2 * f, 2 * f); A.reglerEchelle(2 * f); peindreBien(cx, g);
      IMAGES_BIENS[cle] = src;
    }
    var c = document.createElement('canvas');
    c.width = c.height = Math.ceil(taille * f);
    c.style.width = c.style.height = taille + 'px';
    c.className = 'bien-ico';
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  // --- Ciel étoilé (au-delà des bords de la carte) -------------------------------------
  // Tuile carrée répétable : fond de nuit teinté par le monde, nébuleuses, étoiles.
  var CIELS = {};
  function ciel(nom, cote) {
    var cle = nom + '@' + cote, c = CIELS[cle];
    if (c) return c;
    var M = A.monde(nom), k;
    c = document.createElement('canvas'); c.width = c.height = cote;
    var ctx = c.getContext('2d');
    ctx.fillStyle = M.fond; ctx.fillRect(0, 0, cote, cote);
    // Nébuleuses : halos très doux, répétés aux bords pour que la tuile se raccorde.
    var nuages = [[0.25, 0.3, 0.42, M.feuillage, 0.1], [0.75, 0.7, 0.5, M.sol[0], 0.12], [0.6, 0.15, 0.3, '#5a4fd0', 0.1]];
    nuages.forEach(function (n) {
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) lueur(ctx, (n[0] + dx) * cote, (n[1] + dy) * cote, n[2] * cote, n[3], n[4]);
    });
    for (k = 0; k < 150; k++) {
      var x = A.hachage(k, 11) * cote, y = A.hachage(k, 23) * cote, r = 0.4 + A.hachage(k, 5) * 1.1, a = 0.35 + A.hachage(k, 31) * 0.6;
      ctx.fillStyle = k % 9 === 0 ? alpha('#ffd8a8', a) : k % 7 === 0 ? alpha('#a8d8ff', a) : 'rgba(255,255,255,' + a.toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (k % 25 === 0) { lueur(ctx, x, y, 6, '#ffffff', 0.35); ligne(ctx, [x - 4, y], [x + 4, y], 'rgba(255,255,255,0.5)', 0.5); ligne(ctx, [x, y - 4], [x, y + 4], 'rgba(255,255,255,0.5)', 0.5); }
    }
    CIELS[cle] = c;
    return c;
  }

  // --- Accès publics ----------------------------------------------------------
  // Emprise prévue des dessins (repli des vignettes quand les données ne connaissent pas le type).
  var TAILLE = { hopital: 3, grenier: 3, reservoir: 3, entrepot: 3, marche: 2, senat: 5, colisee: 5, hippodrome: 9 };
  function batiment(type, t, etat, z) {
    var p = PE[type];
    if (!p) return null;
    etat = etat || {};
    return A.sprite(type + ':' + t + ':' + (etat.cle || ''), t, HAUT[type] || 40, function (ctx, P, tt) { p(ctx, P, tt, etat); }, z);
  }
  var VIGNETTE = { actif: 1, plein: 1, frame: 0, eau: 1, prog: 0.75, niveau: 3, matiere: 2, bateau: 1, masque: 10, monde: 'rubra',
    emplacements: [['ble', 4], ['vin', 2], null, ['bois', 3], null, ['fer', 3], ['marbre', 1], null] };

  racine.CM_DESSINS = {
    TW: A.TW, TH: A.TH,
    reglerDPR: A.reglerDPR,
    vider: A.vider,
    teinte: teinte,
    couleurs: C,
    mondes: A.MONDES,
    biens: A.BIENS,
    ciel: ciel,
    // Terrain : monde = 'rubra', 'boree' ou 'ambre'.
    sol: function (monde, v, z) { var M = A.monde(monde); return A.sprite('sol:' + monde + v, 1, 0, function (ctx, P) { T.sol(ctx, P, M, monde, v); }, z); },
    prairie: function (monde, f, z) { var M = A.monde(monde); return A.sprite('fer:' + monde + f, 1, 0, function (ctx, P) { T.fertile(ctx, P, M, f); }, z); },
    eau: function (monde, fr, z) { var M = A.monde(monde); return A.sprite('eau:' + monde + fr, 1, 0, function (ctx, P) { T.eau(ctx, P, M, fr); }, z); },
    rivage: function (monde, masque, fr, z) { var M = A.monde(monde); return A.sprite('riv:' + monde + masque + ':' + (fr & 1), 1, 0, function (ctx, P) { T.rivage(ctx, P, M, masque, fr); }, z); },
    arbre: function (monde, v, z) { var M = A.monde(monde); return A.sprite('arbre:' + monde + v, 1, 44, function (ctx, P) { T.arbre(ctx, P, M, monde, v); }, z); },
    rocher: function (monde, v, z) { var M = A.monde(monde); return A.sprite('rocher:' + monde + v, 1, 30, function (ctx, P) { T.rocher(ctx, P, M, monde, v); }, z); },
    route: function (masque, astroport, z) { return A.sprite('route:' + masque + (astroport ? 'a' : ''), 1, 0, function (ctx, P) { T.route(ctx, P, masque, astroport); }, z); },
    place: function (masque, z) { return A.sprite('place:' + masque, 1, 0, function (ctx, P) { T.place(ctx, P, masque); }, z); },
    maison: function (niv, v, t, z) { return A.sprite('maison:' + niv + ':' + v + ':' + t, t, A.maison.haut(niv, t), function (ctx, P, tt) { A.maison.peindre(ctx, P, niv, v, tt); }, z); },
    batiment: batiment,
    incendie: function (t, fr, z) { return A.sprite('feu:' + t + ':' + fr, t, HAUT.incendie, function (ctx, P, tt) { B.flammes(ctx, P, tt, fr); }, z); },
    marcheur: A.personnages.marcheur,
    unite: A.personnages.unite,
    icone: icone,
    imageBien: imageBien,
    // Tuile plate colorée (aperçu de pose, calques).
    losange: function (cle, couleur, z) { return A.sprite('l:' + cle, 1, 0, function (ctx, P) { A.sol(ctx, P, 0, 0, 1, 1, couleur, 'rgba(255,255,255,0.5)'); }, z); },
    // Dessin d'un bâtiment pour un bouton de menu (canvas de la taille demandée).
    vignette: function (type, taille, niv) {
      var c = document.createElement('canvas'), f = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      c.width = taille * f; c.height = taille * f;
      var ctx = c.getContext('2d');
      var bd = racine.CM_SIM ? racine.CM_SIM.donnees().batiments[type] : null;
      var tt = type === 'logement' ? A.maison.TAILLE[niv || 5] : (bd ? bd.taille : (TAILLE[type] || 1));
      var haut = type === 'logement' ? A.maison.haut(niv || 5, tt) : type === 'deblayer' ? 44 : (HAUT[type] || 40);
      var w = tt * A.TW, h = tt * A.TH + haut, k = Math.min(taille / w, taille / h) * 0.96 * f;
      ctx.translate((taille * f - w * k) / 2, (taille * f - h * k) / 2);
      ctx.scale(k, k); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      A.reglerEchelle(k);
      var P = A.projecteur(tt, haut), M = A.monde('rubra');
      if (type === 'logement') A.maison.peindre(ctx, P, niv || 5, 0, tt);
      else if (type === 'route') T.route(ctx, P, 10, false);
      else if (type === 'place') T.place(ctx, P, 10);
      else if (type === 'deblayer') { T.arbre(ctx, P, M, 'rubra', 0); ligne(ctx, [14, haut - 14], [50, haut + 24], '#ff5d5d', 6); ligne(ctx, [50, haut - 14], [14, haut + 24], '#ff5d5d', 6); }
      else if (type === 'barriere') { T.route(ctx, P, 10, false); PE.barriere(ctx, P); }
      else if (PE[type]) PE[type](ctx, P, tt, VIGNETTE);
      return c;
    }
  };
  void trace; void ellipse;
})(typeof window !== 'undefined' ? window : globalThis);
