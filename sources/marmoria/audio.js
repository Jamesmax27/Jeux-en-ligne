/* ==========================================================================
   Marmoria — sons synthétisés (Web Audio, aucun fichier audio)

   Aucun son avant le premier geste du joueur (le contexte audio n'est créé
   qu'à ce moment-là). Le bouton du son coupe tout ; son choix est mémorisé
   par l'interface (sauvegarde des options). Effets courts, puis musique en
   quatre ambiances (petite ville, grande ville, menace, combat), coupable seule.
   ========================================================================== */
(function (racine) {
  'use strict';

  var ctx = null, maitre = null, coupe = false;

  function demarrer() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      maitre = ctx.createGain();
      maitre.gain.value = coupe ? 0 : 0.5;
      maitre.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }

  // Une note : forme, fréquence de départ et d'arrivée, durée, volume, délai.
  function note(forme, f0, f1, duree, vol, delai) {
    if (!ctx || coupe) return;
    var t = ctx.currentTime + (delai || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = forme;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + duree);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    o.connect(g); g.connect(maitre);
    o.start(t); o.stop(t + duree + 0.02);
  }
  function bruit(duree, vol, filtre, delai) {
    if (!ctx || coupe) return;
    var t = ctx.currentTime + (delai || 0), n = Math.floor(ctx.sampleRate * duree);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0), s = 12345;
    for (var i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff - 1) * (1 - i / n); }
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = filtre || 1200; g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(maitre);
    src.start(t);
  }

  var SONS = {
    clic: function () { note('triangle', 880, 660, 0.06, 0.15); },
    menu: function () { note('sine', 520, 620, 0.07, 0.12); },
    poser: function () { bruit(0.12, 0.35, 700); note('square', 160, 90, 0.1, 0.12); },
    route: function () { bruit(0.06, 0.2, 1500); },
    refus: function () { note('sawtooth', 220, 150, 0.16, 0.12); },
    detruire: function () { bruit(0.35, 0.4, 500); note('triangle', 120, 60, 0.3, 0.2); },
    pieces: function () { note('square', 1320, 1320, 0.05, 0.08); note('square', 1760, 1760, 0.07, 0.08, 0.06); },
    etape: function () { [523, 659, 784].forEach(function (f, k) { note('triangle', f, f, 0.18, 0.18, k * 0.09); }); },
    alerte: function () { note('square', 740, 740, 0.12, 0.12); note('square', 554, 554, 0.18, 0.12, 0.14); },
    feu: function () { bruit(0.6, 0.35, 900); note('sawtooth', 300, 200, 0.4, 0.06); },
    victoire: function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, k) { note('triangle', f, f, 0.26, 0.2, k * 0.14); }); },
    defaite: function () { [392, 349, 311, 262].forEach(function (f, k) { note('sine', f, f * 0.98, 0.32, 0.18, k * 0.2); }); }
  };

  // ------------------------------------------------------------------------
  // Musique (cahier, section 18.5) : motifs courts composés au fil de l'eau,
  // quatre ambiances choisies par l'interface d'après l'état de la ville.
  //   petite : petite ville, lyre seule en pentatonique, lente ;
  //   grande : grande ville, lyre, aulos et nappe, mode mixolydien ;
  //   menace : invasion annoncée, bourdon grave et notes rares, mode phrygien ;
  //   combat : ennemis sur la carte, tambours et ostinato, phrygien dominant.
  // Chaque phrase dure deux mesures de 8 croches ; l'ambiance change à la fin d'une phrase.
  // ------------------------------------------------------------------------
  var AMBIANCES = {
    petite: { base: 220, gamme: [0, 2, 4, 7, 9, 12, 14], tempo: 84, lyre: 0.6, aulos: 0, nappe: 0.3, tambour: 0, bourdon: 0 },
    grande: { base: 196, gamme: [0, 2, 4, 5, 7, 9, 10, 12, 14], tempo: 96, lyre: 0.7, aulos: 0.45, nappe: 0.5, tambour: 0.15, bourdon: 0 },
    menace: { base: 164.8, gamme: [0, 1, 3, 5, 7, 8, 10, 12], tempo: 72, lyre: 0.25, aulos: 0.3, nappe: 0.2, tambour: 0.25, bourdon: 0.6 },
    combat: { base: 164.8, gamme: [0, 1, 4, 5, 7, 8, 10, 12], tempo: 126, lyre: 0.5, aulos: 0.35, nappe: 0, tambour: 1, bourdon: 0.4 }
  };
  var mus = { voulue: null, jouee: null, active: true, gain: null, prochaine: 0, pas: 0, phrase: null, minuterie: null, degre: 0 };
  var VOLUME_MUSIQUE = 0.22;
  function alea(n) { return Math.floor(Math.random() * n); }
  function freq(A, degre) { var g = A.gamme, o = Math.floor(degre / g.length), k = ((degre % g.length) + g.length) % g.length; return A.base * Math.pow(2, (g[k] + 12 * o) / 12); }
  function sortieMusique() {
    if (!mus.gain) { mus.gain = ctx.createGain(); mus.gain.gain.value = VOLUME_MUSIQUE; mus.gain.connect(maitre); }
    return mus.gain;
  }
  // Lyre : corde pincée (triangle et harmonique, attaque sèche, longue chute).
  function lyre(f, t, vol) {
    var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.005;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(3200, t); fl.frequency.exponentialRampToValueAtTime(900, t + 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(sortieMusique());
    o.start(t); o2.start(t); o.stop(t + 1.15); o2.stop(t + 1.15);
  }
  // Aulos : anche douce (dent de scie filtrée, léger vibrato).
  function aulos(f, t, duree, vol) {
    var o = ctx.createOscillator(), v = ctx.createOscillator(), vg = ctx.createGain(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f; v.frequency.value = 5.2; vg.gain.value = f * 0.008;
    v.connect(vg); vg.connect(o.frequency);
    fl.type = 'lowpass'; fl.frequency.value = 1400; fl.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
    g.gain.setValueAtTime(vol, t + Math.max(0.07, duree - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + duree + 0.05);
    o.connect(fl); fl.connect(g); g.connect(sortieMusique());
    o.start(t); v.start(t); o.stop(t + duree + 0.1); v.stop(t + duree + 0.1);
  }
  // Nappe ou bourdon : deux ondes à peine désaccordées, attaque et fin lentes.
  function nappe(f, t, duree, vol) {
    [0.997, 1.003].forEach(function (d) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * d;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.8, duree / 3));
      g.gain.setValueAtTime(vol, t + duree * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      o.connect(g); g.connect(sortieMusique());
      o.start(t); o.stop(t + duree + 0.05);
    });
  }
  // Tambour : grave (sinus qui descend) ou clair (bruit court filtré).
  function tambour(t, vol, grave) {
    if (grave) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(sortieMusique()); o.start(t); o.stop(t + 0.32);
      return;
    }
    var n = Math.floor(ctx.sampleRate * 0.08), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g2 = ctx.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.9; g2.gain.value = vol;
    src.connect(f); f.connect(g2); g2.connect(sortieMusique()); src.start(t);
  }
  // Une phrase : mélodie (marche autour du degré courant, notes de la gamme) et rythme.
  function composer(A) {
    var notes = [], d = mus.degre;
    for (var k = 0; k < 16; k++) {
      var fort = k % 4 === 0;
      if (!fort && Math.random() < (A === AMBIANCES.menace ? 0.7 : 0.35)) { notes.push(null); continue; }
      d += [-2, -1, -1, 0, 1, 1, 2][alea(7)];
      d = Math.max(0, Math.min(A.gamme.length + 2, d));
      if (k === 15 || k === 0) d = Math.round(d / A.gamme.length) * A.gamme.length; // retour vers la tonique
      notes.push(d);
    }
    mus.degre = d;
    return { notes: notes, tonique: alea(3) === 0 ? 3 : 0 };
  }
  function jouerPas(A, ph, k, t, croche) {
    var n = ph.notes[k];
    if (n !== null) {
      if (A.lyre) lyre(freq(A, n + A.gamme.length), t, 0.12 * A.lyre);
      if (A.aulos && k % 2 === 0 && Math.random() < 0.55) aulos(freq(A, n + A.gamme.length), t, croche * (1.6 + alea(2)), 0.05 * A.aulos);
    }
    if (k === 0) {
      var tonique = freq(A, ph.tonique) / 2;
      if (A.nappe) { nappe(tonique, t, croche * 16, 0.05 * A.nappe); nappe(tonique * 1.5, t, croche * 16, 0.035 * A.nappe); }
      if (A.bourdon) nappe(tonique / 2, t, croche * 16, 0.08 * A.bourdon);
    }
    if (A.tambour) {
      if (k % 4 === 0) tambour(t, 0.22 * A.tambour, true);
      else if (A.tambour >= 0.5 && (k % 4 === 2 || (k % 8 === 7 && Math.random() < 0.6))) tambour(t, 0.08 * A.tambour, false);
      else if (A.tambour < 0.5 && k === 8) tambour(t, 0.18 * A.tambour, true);
    }
  }
  function avancerMusique() {
    if (!ctx || coupe || !mus.active || !mus.voulue) return;
    var maintenant = ctx.currentTime;
    if (mus.prochaine < maintenant) mus.prochaine = maintenant + 0.05;
    while (mus.prochaine < maintenant + 0.35) {
      if (mus.pas === 0) {
        if (mus.jouee !== mus.voulue) { mus.jouee = mus.voulue; mus.degre = 0; }
        mus.phrase = composer(AMBIANCES[mus.jouee]);
      }
      var A = AMBIANCES[mus.jouee], croche = 30 / A.tempo;
      try { jouerPas(A, mus.phrase, mus.pas, mus.prochaine, croche); } catch (e) { /* audio indisponible */ }
      mus.prochaine += croche;
      mus.pas = (mus.pas + 1) % 16;
    }
  }
  function musique(ambiance) {
    mus.voulue = AMBIANCES[ambiance] ? ambiance : null;
    if (mus.voulue && !mus.minuterie && typeof setInterval === 'function') mus.minuterie = setInterval(avancerMusique, 100);
    if (!mus.voulue && mus.minuterie) { clearInterval(mus.minuterie); mus.minuterie = null; mus.pas = 0; mus.jouee = null; }
  }

  racine.MM_AUDIO = {
    demarrer: demarrer,
    // Ambiance de musique voulue ('petite', 'grande', 'menace', 'combat'), ou null pour l'arrêter.
    musique: musique,
    // Musique permise (option du joueur) ; les effets restent.
    musiqueActive: function (a) {
      mus.active = !!a;
      if (mus.gain && ctx) mus.gain.gain.setTargetAtTime(a ? VOLUME_MUSIQUE : 0, ctx.currentTime, 0.2);
    },
    ambiance: function () { return mus.voulue; },
    jouer: function (nom) { if (SONS[nom]) { try { SONS[nom](); } catch (e) { /* audio indisponible */ } } },
    couper: function (c) {
      coupe = !!c;
      if (maitre && ctx) maitre.gain.setTargetAtTime(coupe ? 0 : 0.5, ctx.currentTime, 0.02);
    },
    estCoupe: function () { return coupe; },
    pause: function (p) { if (ctx) { try { if (p) ctx.suspend(); else ctx.resume(); } catch (e) { /* rien */ } } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
