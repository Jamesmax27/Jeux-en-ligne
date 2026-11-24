/* ==========================================================================
   Marmoria — sons synthétisés (Web Audio, aucun fichier audio)

   Aucun son avant le premier geste du joueur (le contexte audio n'est créé
   qu'à ce moment-là). Le bouton du son coupe tout ; son choix est mémorisé
   par l'interface (sauvegarde des options).
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

  racine.MM_AUDIO = {
    demarrer: demarrer,
    jouer: function (nom) { if (SONS[nom]) { try { SONS[nom](); } catch (e) { /* audio indisponible */ } } },
    couper: function (c) {
      coupe = !!c;
      if (maitre && ctx) maitre.gain.setTargetAtTime(coupe ? 0 : 0.5, ctx.currentTime, 0.02);
    },
    estCoupe: function () { return coupe; },
    pause: function (p) { if (ctx) { try { if (p) ctx.suspend(); else ctx.resume(); } catch (e) { /* rien */ } } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
