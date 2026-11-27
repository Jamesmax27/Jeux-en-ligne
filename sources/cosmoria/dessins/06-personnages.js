/* ==========================================================================
   Cosmoria — dessins, partie 6 : colons, véhicules et escouades.

   Dehors, l'air n'est pas respirable : tout le monde porte une combinaison et
   un casque à visière. On reconnaît le métier à la couleur de la tenue, aux
   marques du casque et à l'objet tenu. Un personnage est dessiné pieds en
   (10, 26), tourné vers la droite ; pose 0 ou 1 = les deux temps de la marche.
   ========================================================================== */
(function (racine) {
  'use strict';
  var A = racine.CM_ART, C = A.C, B = A.batir;
  var poly = A.poly, ligne = A.ligne, trace = A.trace, cercle = A.cercle, ellipse = A.ellipse, teinte = A.teinte, nuance = A.nuance,
    alpha = A.alpha, lampe = A.lampe, lueur = A.lueur, degV = A.degV, degR = A.degR, sphere = A.sphere;

  // Format des images : [largeur, hauteur, ancre x, ancre y]. Les personnages : 26 × 38.
  var FORMAT = [26, 38, 13, 33];
  var FORMATS = { immigrant: [84, 60, 44, 48], charretier: [44, 38, 20, 33], docker: [30, 40, 14, 34], livreur: [42, 38, 19, 33], lion: [36, 30, 17, 25],
    bateau: [50, 36, 25, 28], navire: [72, 50, 36, 40], caravane: [60, 42, 30, 36], char: [48, 30, 24, 24], gladiateur: [28, 40, 14, 35] };

  // Tenues : c = combinaison, m = marque (bandes, gants, bottes), v = visière, sac = sac dorsal.
  var TENUES = {
    immigrant: { c: '#f0e6d2', m: '#ffa94d' }, emigrant: { c: '#aab2bf', m: '#77839a', v: '#3a4658' }, sansabri: { c: '#8f8474', m: '#6a5f52', v: '#4a4238', sac: false, use: 1 },
    livreur: { c: '#f4f6fa', m: '#ffa53a' }, charretier: { c: '#f4f6fa', m: '#4aa8ff' }, docker: { c: '#ffd35a', m: '#394356' },
    vendeuse: { c: '#ffb86b', m: '#ffffff', v: '#5a2f1a' }, acheteuse: { c: '#8fe08a', m: '#ffffff', v: '#1f4a2a' },
    prefet: { c: '#ff5a4d', m: '#ffffff', feu: '#5a9dff' }, ingenieur: { c: '#ffd84a', m: '#394356', feu: '#ffa53a' }, percepteur: { c: '#8f7fe8', m: '#ffd35a' },
    pretre: { c: '#ffffff', m: '#c8a2ff', v: '#5a3fa0', aura: '#c8a2ff' }, acteur: { c: '#ffd35a', m: '#ff6fb5', v: '#6a2f5a' }, comedien: { c: '#ff8fd0', m: '#7df3ff', v: '#3a2f6a', aura: '#ff8fd0' },
    instituteur: { c: '#4fc8e8', m: '#ffffff' }, bibliothecaire: { c: '#3f8fd0', m: '#bfeaff' }, professeur: { c: '#ffffff', m: '#4fc8e8' },
    barbier: { c: '#ffd0e6', m: '#35d0b0', v: '#5a2f4a' }, employe_bains: { c: '#bfeaff', m: '#35d0b0' }, medecin: { c: '#ffffff', m: '#35d0b0', croix: 1 }, chirurgien: { c: '#c8fff0', m: '#35d0b0', croix: 1 },
    lutteur: { c: '#ff6a5a', m: '#ffd35a', carre: 1 }, dompteur: { c: '#a06fe0', m: '#ffd35a' }, aurige: { c: '#4aa8ff', m: '#ffffff', v: '#ffd35a' },
    recrue: { c: '#c3ccd8', m: '#c7483c' }, voleur: { c: '#3a3f52', m: '#1c2330', v: '#ff5d5d', sac: false }, emeutier: { c: '#7a3a3a', m: '#1c2330', v: '#ffd35a', sac: false },
    caravane: { c: '#f4f6fa', m: '#ffa53a' }
  };

  // Un colon en pied, pieds en (x, y), tourné vers la droite. Renvoie la position de la main avant.
  // o : { leve (bras levé), s (échelle), porte (porte une charge devant lui) }.
  function colon(ctx, x, y, a, pose, o) {
    o = o || {};
    var s = o.s || 1, c = a.c || '#f4f6fa', m = a.m || C.cyan, e = (pose ? 1.9 : -1.9) * s, k;
    var X = function (d) { return x + d * s; }, Y = function (d) { return y + d * s; };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ellipse(ctx, x, y, 6 * s, 2.1 * s, 'rgba(10,12,24,0.34)');
    // Sac dorsal (réserve d'air), derrière le corps.
    if (a.sac !== false) {
      ctx.fillStyle = nuance(c, 0.72); ctx.beginPath(); ctx.roundRect(X(-6.2), Y(-18.6), 3.6 * s, 8.4 * s, 1.2 * s); ctx.fill();
      ctx.fillStyle = m; ctx.fillRect(X(-6.2), Y(-16), 3.6 * s, 1.2 * s);
    }
    // Jambes : celle du fond d'abord.
    ctx.strokeStyle = nuance(c, 0.66); ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(X(-1.3), Y(-8.6)); ctx.lineTo(x - 1.3 * s - e, Y(-1.6)); ctx.stroke();
    ctx.strokeStyle = nuance(c, 0.84); ctx.beginPath(); ctx.moveTo(X(1.3), Y(-8.6)); ctx.lineTo(x + 1.3 * s + e, Y(-1.6)); ctx.stroke();
    ctx.fillStyle = nuance(m, 0.62); ctx.beginPath(); ctx.roundRect(x - 1.3 * s - e - 1.6 * s, Y(-2.2), 4 * s, 2.2 * s, 0.9 * s); ctx.fill();
    ctx.fillStyle = nuance(m, 0.82); ctx.beginPath(); ctx.roundRect(x + 1.3 * s + e - 1.6 * s, Y(-2.2), 4.2 * s, 2.2 * s, 0.9 * s); ctx.fill();
    // Bras du fond.
    ligne(ctx, [X(-1.4), Y(-16)], [X(-2.6) + e * 0.6, Y(-10.6)], nuance(c, 0.66), 2.4 * s);
    // Torse.
    ctx.fillStyle = A.degH(ctx, X(-3.8), X(3.8), [[0, nuance(c, 1.08)], [0.6, c], [1, nuance(c, 0.72)]]);
    ctx.beginPath(); ctx.roundRect(X(-3.7), Y(-18.4), 7.4 * s, 10.6 * s, 2.6 * s); ctx.fill();
    if (a.carre) { ctx.fillStyle = nuance(c, 0.8); ctx.beginPath(); ctx.roundRect(X(-4.6), Y(-18.6), 9.2 * s, 5 * s, 2 * s); ctx.fill(); }
    ctx.fillStyle = m; ctx.fillRect(X(-3.7), Y(-12.4), 7.4 * s, 1.5 * s);
    ctx.fillStyle = '#394356'; ctx.fillRect(X(-3.4), Y(-9.4), 6.8 * s, 1.2 * s);
    if (a.croix) { ctx.fillStyle = m; ctx.fillRect(X(-0.2), Y(-17), 1.4 * s, 3.8 * s); ctx.fillRect(X(-1.4), Y(-15.8), 3.8 * s, 1.4 * s); }
    else { ctx.fillStyle = '#394356'; ctx.fillRect(X(0.2), Y(-16.6), 2.4 * s, 2 * s); cercle(ctx, X(0.9), Y(-15.6), 0.5 * s, C.vert); }
    if (a.use) { ctx.fillStyle = 'rgba(40,30,20,0.3)'; ctx.fillRect(X(-2.6), Y(-15), 2 * s, 2 * s); ctx.fillRect(X(1), Y(-11), 1.6 * s, 1.6 * s); }
    // Casque : bulle claire, visière sombre à reflet, bande de couleur.
    var hx = X(0.5), hy = Y(-22.4), r = 4.6 * s;
    ctx.fillStyle = degR(ctx, hx, hy, r * 1.2, [[0, '#ffffff'], [0.6, nuance(c, 1.2)], [1, nuance(c, 0.7)]], hx - r * 0.4, hy - r * 0.5);
    ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = degV(ctx, hy - r * 0.6, hy + r * 0.6, nuance(a.v || '#24405e', 1.5), a.v || '#12243a');
    ctx.beginPath(); ctx.ellipse(hx + 1.5 * s, hy + 0.2 * s, 2.9 * s, 2.6 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(hx + 2.4 * s, hy - 0.9 * s, 0.9 * s, 0.6 * s, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = m; ctx.lineWidth = 1.3 * s; ctx.beginPath(); ctx.arc(hx, hy, r - 0.5 * s, Math.PI * 1.08, Math.PI * 1.62); ctx.stroke();
    ctx.fillStyle = nuance(c, 0.7); ctx.fillRect(X(-2.2), Y(-18.8), 5 * s, 1.3 * s);
    if (a.feu) lampe(ctx, hx - 0.6 * s, hy - r - 0.4 * s, a.feu, 1.1 * s);
    if (a.aura) { ctx.strokeStyle = alpha(a.aura, 0.85); ctx.lineWidth = 1 * s; ctx.beginPath(); ctx.ellipse(hx, hy - r - 1.6 * s, 3.6 * s, 1.2 * s, 0, 0, Math.PI * 2); ctx.stroke(); lueur(ctx, hx, hy - r - 1.6 * s, 5 * s, a.aura, 0.35); }
    // Bras avant et gant.
    var main = o.leve ? [X(3.6), Y(-24)] : o.porte ? [X(5.4), Y(-13.4)] : [X(3.8) - e * 0.6, Y(-10.4)];
    ligne(ctx, [X(1.6), Y(-16.2)], main, nuance(c, 0.94), 2.6 * s);
    cercle(ctx, main[0], main[1], 1.5 * s, m);
    for (k = 0; k < 0; k++) void k;
    return main;
  }
  function caisse(ctx, x, y, w, h, c) {
    ctx.fillStyle = teinte(c, 0.95); ctx.fillRect(x, y, w, h);
    poly(ctx, [[x, y], [x + 2.5, y - 2], [x + w + 2.5, y - 2], [x + w, y]], teinte(c, 1.18));
    poly(ctx, [[x + w, y], [x + w + 2.5, y - 2], [x + w + 2.5, y + h - 2], [x + w, y + h]], teinte(c, 0.68));
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x + 1, y + h * 0.4, w - 2, 1);
  }
  // Chariot flottant (antigravité) : plateau, lueur bleue dessous.
  function chariot(ctx, x, y, w, c) {
    ellipse(ctx, x + w / 2, y + 3, w * 0.56, 2, 'rgba(10,12,24,0.3)');
    lueur(ctx, x + w / 2, y + 0.6, w * 0.5, C.cyan, 0.4);
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x, y - 3.4, w, 3, 1.2); ctx.fill();
    ctx.fillStyle = teinte(c, 1.3); ctx.fillRect(x + 1, y - 3.4, w - 2, 0.9);
    ligne(ctx, [x + 2, y + 0.4], [x + w - 2, y + 0.4], alpha(C.cyan, 0.9), 1.1);
  }
  // Roue de rover.
  function roue(ctx, x, y, r) { cercle(ctx, x, y, r, '#232b3a'); cercle(ctx, x, y, r * 0.5, '#8a96a8'); cercle(ctx, x, y, r, null, '#4a5568', 0.8); }
  // Rover : cabine vitrée, benne ou conteneur, roues (convoi marchand, arrivants).
  function rover(ctx, x, y, pose, c, charge) {
    var j = pose ? 0.5 : -0.5;
    ellipse(ctx, x, y + 1, 19, 3.4, 'rgba(10,12,24,0.34)');
    // Châssis.
    ctx.fillStyle = '#4a5568'; ctx.beginPath(); ctx.roundRect(x - 17, y - 7 + j, 34, 4, 1.6); ctx.fill();
    // Benne et chargement.
    ctx.fillStyle = teinte(c, 0.8); ctx.beginPath(); ctx.roundRect(x - 17, y - 17 + j, 20, 10.4, 1.4); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x - 17, y - 17 + j, 20, 3.4, 1.4); ctx.fill();
    (charge || ['#ffa53a', '#4aa8ff']).forEach(function (cc, i) { caisse(ctx, x - 15.4 + i * 8.6, y - 23.4 + j, 7.2, 6.6, cc); });
    // Cabine.
    ctx.fillStyle = A.degH(ctx, x + 2, x + 17, [[0, '#ffffff'], [1, '#c3ccd8']]); ctx.beginPath(); ctx.roundRect(x + 3, y - 19 + j, 14, 12.6, [2, 6, 2, 2]); ctx.fill();
    ctx.fillStyle = degV(ctx, y - 18, y - 11, '#3f9fd0', '#16405e'); ctx.beginPath(); ctx.roundRect(x + 8.4, y - 17.4 + j, 7.6, 6.2, [1, 4, 1, 1]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x + 9.4, y - 16.6 + j, 1.4, 4.4);
    ctx.fillStyle = c; ctx.fillRect(x + 3, y - 10.4 + j, 14, 1.6);
    lampe(ctx, x + 17.4, y - 8.6 + j, C.chaud, 1); ligne(ctx, [x + 5, y - 19 + j], [x + 5, y - 25 + j], '#8a96a8', 0.8); cercle(ctx, x + 5, y - 25.4 + j, 0.9, C.rouge);
    roue(ctx, x - 12, y - 2.6, 3.6); roue(ctx, x - 2, y - 2.6, 3.6); roue(ctx, x + 11, y - 2.6, 3.6);
  }
  // Moto-jet : selle, carénage, tuyère lumineuse ; flotte au-dessus du sol.
  function motoJet(ctx, x, y, s, c) {
    ellipse(ctx, x, y, 9 * s, 2.2 * s, 'rgba(10,12,24,0.32)');
    lueur(ctx, x - 1 * s, y - 2.6 * s, 7 * s, C.cyan, 0.35);
    poly(ctx, [[x - 10 * s, y - 5 * s], [x - 6 * s, y - 8.4 * s], [x + 5 * s, y - 8.8 * s], [x + 11 * s, y - 6 * s], [x + 7 * s, y - 3.4 * s], [x - 8 * s, y - 3.4 * s]], '#4a5568');
    poly(ctx, [[x + 1 * s, y - 8.8 * s], [x + 5 * s, y - 8.8 * s], [x + 11 * s, y - 6 * s], [x + 6 * s, y - 6 * s]], c);
    poly(ctx, [[x - 10 * s, y - 5 * s], [x - 6 * s, y - 8.4 * s], [x - 2 * s, y - 8.6 * s], [x - 5 * s, y - 5 * s]], teinte(c, 0.8));
    ligne(ctx, [x + 4 * s, y - 8.8 * s], [x + 6.4 * s, y - 12.4 * s], '#8a96a8', 1 * s);
    ligne(ctx, [x - 10 * s, y - 5.4 * s], [x - 15 * s, y - 5.4 * s], alpha(C.cyan, 0.9), 1.6 * s);
    ligne(ctx, [x - 7 * s, y - 2.6 * s], [x + 6 * s, y - 2.6 * s], alpha(C.cyan, 0.8), 1 * s);
  }

  // --- Marcheurs --------------------------------------------------------------------
  function peindreMarcheur(ctx, type, pose, inverse) {
    var a = TENUES[type] || { c: '#f4f6fa', m: C.cyan }, x = 10, y = 26, m, k;
    if (inverse) { ctx.translate(20, 0); ctx.scale(-1, 1); }
    switch (type) {
      case 'lion': B.patteDouce(ctx, x - 2, y, 1.25, pose); return;
      case 'gladiateur': B.robot(ctx, x, y, 2 + 0, '#ff6a5a'); if (pose) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - 5.6, y - 16, 11.2, 1.2); } lampe(ctx, x + 1, y - 24.4, C.rouge, 0.9); return;
      case 'bateau': {
        // Barge de pêche : coque blanche, cabine, mât à feu vert, sillage.
        var j = pose ? 0.6 : -0.4;
        ellipse(ctx, x, y + 2.4, 19, 4, 'rgba(8,30,50,0.34)');
        ligne(ctx, [x - 20, y + 1.6], [x - 26, y + 0.6], 'rgba(255,255,255,0.6)', 1); ligne(ctx, [x - 19, y + 3], [x - 24, y + 3.4], 'rgba(255,255,255,0.45)', 1);
        poly(ctx, [[x - 17, y - 4 + j], [x + 15, y - 4 + j], [x + 20, y - 7.4 + j], [x + 15, y + 1.6 + j], [x - 14, y + 1.6 + j]], '#dfe6ef');
        poly(ctx, [[x - 17, y - 4 + j], [x + 15, y - 4 + j], [x + 20, y - 7.4 + j], [x - 15, y - 7.4 + j]], '#f8fafc');
        ctx.fillStyle = C.alim; ctx.fillRect(x - 14, y - 1.4 + j, 28, 1.3);
        caisse(ctx, x - 12, y - 12.4 + j, 7, 5, '#6fb6d8');
        ctx.fillStyle = '#eef2f7'; ctx.beginPath(); ctx.roundRect(x - 2, y - 15.4 + j, 10, 8.4, 1.6); ctx.fill(); ctx.fillStyle = '#2f86b0'; ctx.fillRect(x + 1.4, y - 14 + j, 5.6, 3);
        ligne(ctx, [x + 3, y - 15.4 + j], [x + 3, y - 23 + j], '#8a96a8', 1); lampe(ctx, x + 3, y - 23.4 + j, C.vert, 1);
        return;
      }
      case 'navire': {
        // Cargo : longue coque sombre à liseré de couleur, conteneurs, passerelle, deux feux.
        var jn = pose ? 0.7 : -0.5;
        ellipse(ctx, x, y + 3.6, 31, 5.4, 'rgba(8,30,50,0.36)');
        ligne(ctx, [x - 31, y + 2.4], [x - 40, y + 1], 'rgba(255,255,255,0.6)', 1.2); ligne(ctx, [x - 30, y + 4.4], [x - 37, y + 5], 'rgba(255,255,255,0.45)', 1.2);
        poly(ctx, [[x - 28, y - 6 + jn], [x + 24, y - 6 + jn], [x + 33, y - 11 + jn], [x + 25, y + 2.6 + jn], [x - 24, y + 2.6 + jn]], '#4a5568');
        poly(ctx, [[x - 28, y - 6 + jn], [x + 24, y - 6 + jn], [x + 33, y - 11 + jn], [x - 25, y - 11 + jn]], '#dfe6ef');
        ctx.fillStyle = C.indus; ctx.fillRect(x - 25, y - 2.6 + jn, 50, 1.6);
        ['#4aa8ff', '#ffa53a', '#ff6fb5', '#74d44f'].forEach(function (cc, i) { caisse(ctx, x - 22 + i * 8.6, y - 17.6 + jn, 7.6, 6.4, cc); });
        caisse(ctx, x - 17.6, y - 24 + jn, 7.6, 6.4, '#b58cff'); caisse(ctx, x - 9, y - 24 + jn, 7.6, 6.4, '#ffd35a');
        ctx.fillStyle = '#f4f6fa'; ctx.beginPath(); ctx.roundRect(x + 14, y - 24 + jn, 11, 13.4, 1.8); ctx.fill(); ctx.fillStyle = '#2f86b0'; ctx.fillRect(x + 16, y - 22 + jn, 8, 3.4);
        ligne(ctx, [x + 19, y - 24 + jn], [x + 19, y - 33 + jn], '#8a96a8', 1.1); lampe(ctx, x + 19, y - 33.6 + jn, C.rouge, 1.1); lampe(ctx, x + 32, y - 10.6 + jn, C.chaud, 1);
        return;
      }
      case 'caravane': rover(ctx, x - 4, y, pose, '#ffa53a', ['#b58cff', '#74d44f']); return;
      case 'char': {
        // Bolide antigrav et son pilote : sillage qui pulse.
        B.bolide(ctx, x, y - 3 - (pose ? 0.8 : 0), 1.8, '#ff5d5d', 1);
        cercle(ctx, x + 2.4, y - 12 - (pose ? 0.8 : 0), 2.6, '#f4f6fa'); ctx.fillStyle = '#ffd35a'; ctx.beginPath(); ctx.ellipse(x + 3.4, y - 12 - (pose ? 0.8 : 0), 1.7, 1.4, 0, 0, Math.PI * 2); ctx.fill();
        if (pose) ligne(ctx, [x - 24, y - 6.4], [x - 30, y - 6.4], 'rgba(125,243,255,0.6)', 1.6);
        return;
      }
      case 'immigrant': {
        // Les arrivants : un rover chargé de bagages, deux colons qui marchent devant, un enfant.
        rover(ctx, x - 24, y, pose, '#ffa94d', ['#c98a4a', '#f0e6d2']);
        colon(ctx, x + 6, y + 1, a, pose);
        colon(ctx, x + 17, y - 1, { c: '#bfeaff', m: '#ff8fd0' }, 1 - pose);
        colon(ctx, x + 26, y + 2, { c: '#ffe0a0', m: '#74d44f' }, pose, { s: 0.72 });
        return;
      }
      case 'livreur': {
        // Pousse un chariot flottant chargé d'une caisse.
        chariot(ctx, x + 6, y - 4, 16, '#8a96a8'); caisse(ctx, x + 8.4, y - 15, 10, 7.6, '#ffa53a');
        colon(ctx, x, y, a, pose, { porte: 1 });
        return;
      }
      case 'charretier': {
        // Grande palette flottante, deux fûts et une caisse.
        chariot(ctx, x + 6, y - 4, 20, '#8a96a8'); caisse(ctx, x + 7.6, y - 15.4, 8, 8, '#4aa8ff'); caisse(ctx, x + 16.4, y - 13.4, 7.6, 6, '#74d44f');
        colon(ctx, x, y, a, pose, { porte: 1 });
        return;
      }
      case 'docker': m = colon(ctx, x, y, a, pose, { leve: 1 }); caisse(ctx, x - 4.6, y - 34, 10.4, 6.6, '#ffa53a'); void m; return;
      default: break;
    }
    m = colon(ctx, x, y, a, pose, { leve: type === 'emeutier' || type === 'lutteur' });
    switch (type) {
      case 'emigrant': caisse(ctx, m[0] - 2.4, m[1] + 1.6, 5.4, 4.4, '#77839a'); break;
      case 'vendeuse': // plateau de fruits et légumes
        ctx.fillStyle = '#f4f6fa'; ctx.beginPath(); ctx.roundRect(m[0] - 1.6, m[1] - 1, 7, 2.4, 1); ctx.fill();
        cercle(ctx, m[0], m[1] - 2, 1.4, '#ff8a3c'); cercle(ctx, m[0] + 2.4, m[1] - 2.2, 1.4, '#62c24a'); cercle(ctx, m[0] + 4.4, m[1] - 1.8, 1.2, '#f0cc55'); break;
      case 'acheteuse': // sac de courses
        poly(ctx, [[m[0] - 2.4, m[1] + 1], [m[0] + 2.8, m[1] + 1], [m[0] + 2.2, m[1] + 6.4], [m[0] - 1.8, m[1] + 6.4]], '#ffffff'); ctx.fillStyle = '#62c24a'; ctx.fillRect(m[0] - 1.6, m[1] + 3, 3.6, 1.2); break;
      case 'prefet': // extincteur
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(m[0] - 1.2, m[1] - 1, 3, 6.4, 1.2); ctx.fill(); ctx.fillStyle = '#ff5a4d'; ctx.fillRect(m[0] - 1.2, m[1] + 1, 3, 1.4); ligne(ctx, [m[0] + 0.4, m[1] - 1], [m[0] + 3.4, m[1] - 3], '#394356', 1); break;
      case 'ingenieur': // clé et boîte à outils
        ligne(ctx, [m[0], m[1]], [m[0] + 4, m[1] - 5.4], '#c3ccd8', 1.5); cercle(ctx, m[0] + 4.4, m[1] - 6, 1.6, null, '#c3ccd8', 1.2); break;
      case 'percepteur': // tablette lumineuse et pièce
        poly(ctx, [[m[0] - 0.6, m[1] - 4.6], [m[0] + 4.4, m[1] - 5.4], [m[0] + 4.8, m[1] + 0.6], [m[0] - 0.2, m[1] + 1.2]], '#1c2330', '#ffd35a', 0.7); lueur(ctx, m[0] + 2, m[1] - 2, 5, '#ffd35a', 0.35); cercle(ctx, m[0] + 2.2, m[1] - 2.2, 1.3, '#ffd35a'); break;
      case 'pretre': // petite sphère de lumière portée devant soi
        lueur(ctx, m[0] + 1.6, m[1] - 2.6, 6, '#c8a2ff', 0.55); sphere(ctx, m[0] + 1.6, m[1] - 2.6, 2.2, '#c8a2ff'); break;
      case 'acteur': poly(ctx, [[m[0] + 1, m[1] - 5], [m[0] + 2, m[1] - 2.6], [m[0] + 4.4, m[1] - 2.4], [m[0] + 2.6, m[1] - 0.8], [m[0] + 3.2, m[1] + 1.6], [m[0] + 1, m[1] + 0.2], [m[0] - 1.2, m[1] + 1.6], [m[0] - 0.6, m[1] - 0.8], [m[0] - 2.4, m[1] - 2.4], [m[0], m[1] - 2.6]], '#ffd35a'); break;
      case 'comedien': A.hologramme(ctx, m[0] + 1.6, m[1] - 0.6, 5.4, '#7df3ff', 'etoile', 2.4); break;
      case 'instituteur': poly(ctx, [[m[0] - 1.4, m[1] - 3.4], [m[0] + 1.6, m[1] - 2.4], [m[0] + 1.6, m[1] + 1.6], [m[0] - 1.4, m[1] + 0.6]], '#ffffff'); poly(ctx, [[m[0] + 4.6, m[1] - 3.4], [m[0] + 1.6, m[1] - 2.4], [m[0] + 1.6, m[1] + 1.6], [m[0] + 4.6, m[1] + 0.6]], '#dfe6ef'); break;
      case 'bibliothecaire': lueur(ctx, m[0] + 1.6, m[1] - 2, 5, '#7df3ff', 0.4); poly(ctx, [[m[0] + 1.6, m[1] - 5], [m[0] + 4.6, m[1] - 3.4], [m[0] + 1.6, m[1] - 1.8], [m[0] - 1.4, m[1] - 3.4]], '#bfeaff'); poly(ctx, [[m[0] - 1.4, m[1] - 3.4], [m[0] + 1.6, m[1] - 1.8], [m[0] + 1.6, m[1] + 1.4], [m[0] - 1.4, m[1] - 0.2]], '#4fc8e8'); poly(ctx, [[m[0] + 4.6, m[1] - 3.4], [m[0] + 1.6, m[1] - 1.8], [m[0] + 1.6, m[1] + 1.4], [m[0] + 4.6, m[1] - 0.2]], '#2f8fb8'); break;
      case 'professeur': // fiole
        poly(ctx, [[m[0] + 0.4, m[1] - 5.6], [m[0] + 2, m[1] - 5.6], [m[0] + 2, m[1] - 2.8], [m[0] + 4, m[1] + 1], [m[0] - 1.6, m[1] + 1], [m[0] + 0.4, m[1] - 2.8]], 'rgba(220,245,255,0.8)', '#ffffff', 0.6); poly(ctx, [[m[0] - 0.6, m[1] - 1], [m[0] + 3, m[1] - 1], [m[0] + 4, m[1] + 1], [m[0] - 1.6, m[1] + 1]], '#8dffb0'); break;
      case 'barbier': ligne(ctx, [m[0], m[1]], [m[0] + 4, m[1] - 4.4], '#ffffff', 0.9); ligne(ctx, [m[0], m[1] - 2], [m[0] + 4.4, m[1] - 1.6], '#ffffff', 0.9); cercle(ctx, m[0] - 0.4, m[1] + 0.6, 1, null, '#35d0b0', 0.8); cercle(ctx, m[0] - 0.4, m[1] - 2.2, 1, null, '#35d0b0', 0.8); break;
      case 'employe_bains': ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(m[0] - 1, m[1] - 3, 5, 5.6, 1); ctx.fill(); ctx.fillStyle = '#35d0b0'; ctx.fillRect(m[0] - 1, m[1] - 1, 5, 1); break;
      case 'medecin': case 'chirurgien': caisse(ctx, m[0] - 2.4, m[1] + 1, 6, 4.6, '#ffffff'); ctx.fillStyle = '#35d0b0'; ctx.fillRect(m[0] + 0.1, m[1] + 1.8, 1.2, 3); ctx.fillRect(m[0] - 0.8, m[1] + 2.7, 3, 1.2); break;
      case 'lutteur': lampe(ctx, m[0], m[1] - 2, '#ffd35a', 1.4); break; // coupe du champion brandie
      case 'dompteur': cercle(ctx, m[0] + 2.4, m[1] - 2.4, 3.4, null, '#ffd35a', 1.1); break; // cerceau
      case 'aurige': ctx.fillStyle = '#ffffff'; ctx.fillRect(m[0] - 0.6, m[1] - 5, 0.9, 6); poly(ctx, [[m[0] + 0.3, m[1] - 5], [m[0] + 5, m[1] - 4], [m[0] + 0.3, m[1] - 2.4]], '#ff5d5d'); break; // fanion de course
      case 'voleur': ellipse(ctx, m[0] - 9, m[1] - 5.6, 3.4, 4, '#77839a'); break; // baluchon sur le dos
      case 'emeutier': ligne(ctx, [m[0], m[1]], [m[0] + 1.4, m[1] - 7], '#8a96a8', 1.2); lueur(ctx, m[0] + 1.6, m[1] - 9, 6, '#ff8a3c', 0.55); poly(ctx, [[m[0] - 0.4, m[1] - 7], [m[0] + 1.6, m[1] - 12], [m[0] + 3.4, m[1] - 7]], '#ff8a3c'); break; // fusée de détresse
      default: for (k = 0; k < 0; k++) void k;
    }
  }
  function marcheur(type, pose, inverse, z) {
    var fm = FORMATS[type] || FORMAT;
    return A.image('m:' + type + ':' + pose + ':' + (inverse ? 1 : 0), fm[0], fm[1], fm[2], fm[3], function (ctx) {
      ctx.translate(fm[2] - 10, fm[3] - 26);
      peindreMarcheur(ctx, type, pose, inverse);
    }, z);
  }

  // --- Escouades et pillards ---------------------------------------------------------
  // Chaque camp a sa tenue. rome = la colonie ; imperiale = les forces de la Terre.
  var CAMPS = {
    rome: { c: '#f4f6fa', m: '#c7483c', v: '#7a1f1a' }, imperiale: { c: '#3a4a8a', m: '#ffd35a', v: '#ffd35a' },
    gaulois: { c: '#c9703a', m: '#3fa85a', v: '#8dffb0', sac: false }, germains: { c: '#dfeaf2', m: '#5a8fc0', v: '#1f3a5a' },
    carthaginois: { c: '#2a2f42', m: '#ff4fa8', v: '#ff4fa8' }, numides: { c: '#e6c78a', m: '#21a394', v: '#0f4a44', sac: false },
    parthes: { c: '#d09a3a', m: '#6a2f1a', v: '#3a1a0a' }, pictes: { c: '#2f4a7a', m: '#7df3ff', v: '#7df3ff', sac: false }
  };
  function bouclierEnergie(ctx, x, y, c) {
    ctx.fillStyle = alpha(c, 0.35); ctx.strokeStyle = nuance(c, 1.3); ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(x, y, 3.2, 6.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ligne(ctx, [x - 1.2, y - 3.4], [x - 1.2, y + 2], 'rgba(255,255,255,0.6)', 0.7);
  }
  function tir(ctx, x, y, c) { lueur(ctx, x, y, 5, c, 0.8); cercle(ctx, x, y, 1.6, '#ffffff'); ligne(ctx, [x, y], [x + 7, y - 0.6], c, 1.2); }
  // Marcheur de siège : gros robot à deux pattes, bélier à l'avant.
  function marcheurSiege(ctx, x, y, c, pose) {
    var e = pose ? 2.4 : -2.4;
    ellipse(ctx, x, y, 17, 4, 'rgba(10,12,24,0.36)');
    ligne(ctx, [x - 5, y - 15], [x - 7 - e, y - 7], '#4a5568', 3.4); ligne(ctx, [x - 7 - e, y - 7], [x - 5 - e, y - 1], '#4a5568', 3);
    ligne(ctx, [x + 5, y - 15], [x + 7 + e, y - 7], '#5d6878', 3.4); ligne(ctx, [x + 7 + e, y - 7], [x + 5 + e, y - 1], '#5d6878', 3);
    ellipse(ctx, x - 5 - e, y - 0.6, 4, 1.6, '#232b3a'); ellipse(ctx, x + 5 + e, y - 0.6, 4, 1.6, '#232b3a');
    ctx.fillStyle = A.degH(ctx, x - 12, x + 12, [[0, nuance(c, 1.15)], [1, nuance(c, 0.6)]]); ctx.beginPath(); ctx.roundRect(x - 12, y - 30, 24, 16, 4); ctx.fill();
    ctx.fillStyle = '#12243a'; ctx.beginPath(); ctx.roundRect(x + 1, y - 27.6, 9, 5, 2); ctx.fill(); ligne(ctx, [x + 2.4, y - 26.4], [x + 5, y - 26.4], 'rgba(255,255,255,0.7)', 0.8);
    lampe(ctx, x - 8, y - 31, C.rouge, 1);
    // Bélier.
    ctx.fillStyle = '#394356'; ctx.beginPath(); ctx.roundRect(x + 10, y - 21, 13, 5, 1.6); ctx.fill(); poly(ctx, [[x + 23, y - 23], [x + 28, y - 18.5], [x + 23, y - 14]], '#c3ccd8');
  }
  function peindreUnite(ctx, k, camp, pose, inverse, attaque) {
    var a = CAMPS[camp] || CAMPS.rome, x = 10, y = 26, m;
    if (inverse) { ctx.translate(20, 0); ctx.scale(-1, 1); }
    if (k === 'siege') { marcheurSiege(ctx, x + 2, y, a.c, pose); return; }
    if (k === 'cavalier' || k === 'cavalerie') {
      // Pilote assis sur sa moto-jet.
      var h = pose ? 0.8 : 0;
      motoJet(ctx, x, y - 2 - h, 1.25, a.m);
      m = colon(ctx, x - 1, y - 9 - h, a, 0, { s: 0.92, porte: 1 });
      if (attaque) tir(ctx, x + 14, y - 12 - h, a.m); else ligne(ctx, [m[0], m[1]], [m[0] + 8, m[1] - 2], '#8a96a8', 1.2);
      return;
    }
    var lourd = k === 'legionnaire' || k === 'lourde';
    m = colon(ctx, x, y, lourd ? { c: a.c, m: a.m, v: a.v, sac: a.sac, carre: 1 } : a, pose, { porte: 1 });
    if (lourd) {
      // Armure lourde : bouclier d'énergie, matraque à impulsion.
      bouclierEnergie(ctx, x + 6.4, y - 12, a.m);
      ligne(ctx, [x - 2, y - 14], attaque ? [x + 9, y - 21] : [x - 5, y - 23], '#c3ccd8', 1.5);
      if (attaque) lueur(ctx, x + 9, y - 21, 5, a.m, 0.8);
    } else if (k === 'javelot' || k === 'tireur') {
      // Tireur : long fusil épaulé.
      ligne(ctx, [m[0] - 5, m[1] - 1], [m[0] + 9, m[1] - 3.4], '#394356', 1.9); ligne(ctx, [m[0] + 1, m[1] - 2.2], [m[0] + 9, m[1] - 3.6], '#8a96a8', 0.9);
      if (attaque) tir(ctx, m[0] + 10, m[1] - 3.6, a.m);
    } else {
      // Pillard : sabre lumineux court.
      var b = attaque ? [m[0] + 7, m[1] - 6] : [m[0] + 3.4, m[1] - 8];
      A.eclat(ctx, a.m, 3, function () { ligne(ctx, m, b, nuance(a.m, 1.3), 1.5); });
    }
  }
  function unite(k, camp, pose, inverse, attaque, z) {
    var gros = k === 'siege', monte = k === 'cavalier' || k === 'cavalerie';
    var fm = gros ? [64, 48, 28, 40] : monte ? [48, 46, 22, 38] : [36, 40, 15, 33];
    return A.image('u:' + k + ':' + camp + ':' + pose + (inverse ? 1 : 0) + (attaque ? 1 : 0), fm[0], fm[1], fm[2], fm[3], function (ctx) {
      ctx.translate(fm[2] - 10, fm[3] - 26);
      peindreUnite(ctx, k, camp, pose, inverse, attaque);
    }, z);
  }

  A.personnages = { marcheur: marcheur, unite: unite, colon: colon, rover: rover, motoJet: motoJet, caisse: caisse, TENUES: TENUES, CAMPS: CAMPS, peindreMarcheur: peindreMarcheur };
  void trace;
})(typeof window !== 'undefined' ? window : globalThis);
