/* ==========================================================================
   Marmoria — sons et musique synthétisés (Web Audio, aucun fichier audio)

   Aucun son avant le premier geste du joueur (le contexte audio n'est créé
   qu'à ce moment-là). Le bouton du son coupe tout ; son choix est mémorisé
   par l'interface (sauvegarde des options). Effets courts, puis musique en
   quatre morceaux (petite ville, grande ville, menace, combat), coupable seule.
   ========================================================================== */
(function (racine) {
  'use strict';

  var ctx = null, maitre = null, coupe = false;

  function demarrer() {
    if (ctx) { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); return; }
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

  // ------------------------------------------------------------------------
  // Musique (cahier, sections 18.5 et 23.13). Quatre morceaux écrits à la main,
  // joués par des instruments antiques imités :
  //   cithare (lyre) : corde pincée, synthèse de Karplus-Strong, rendue une
  //                    fois par hauteur et gardée ;
  //   aulos double   : anche nasale jouée liée (glissés, mordants, coups de
  //                    langue, vibrato tardif, souffle) ; le second tuyau
  //                    tient le bourdon ;
  //   hydraulis      : orgue à eau des arènes (jeux de flûtes, attaque des
  //                    tuyaux, tremblement de l'eau) ;
  //   cornu et tuba  : cuivres militaires, appels sur les harmoniques naturelles ;
  //   tympanum       : tambour sur cadre (doum grave, tek clair) ; grosse caisse ;
  //   sistre, crotales : métaux.
  // Salle : réverbération d'une cour de marbre (réponse impulsionnelle calculée).
  // Modes : dorien (petite ville), mixolydien (grande ville), phrygien (menace),
  // phrygien dominant (combat). Chaque morceau a sa forme (parties de 4 mesures)
  // et plusieurs passages qui changent l'instrument du chant. Une mesure est
  // programmée d'un coup ; l'ambiance change à la fin d'une mesure.
  //
  // Écriture des voix : mesures séparées par « | », notes séparées par des
  // espaces, « NOTE:durée » en croches (1 par défaut), « r » = silence,
  // « 'NOTE » = mordant (note du dessus dans le mode), « ~NOTE » = glissé
  // depuis le demi-ton du dessous. Accords : « Dm », « G », « E5 » (quinte seule).
  // Rythmes : 16 doubles croches par mesure ; D doum, T tek, t tek léger,
  // S sistre, C crotales, « . » rien.
  // ------------------------------------------------------------------------
  var ARP_FLUIDE = [1, 3, 4, 5, 6, 5, 4, 3], ARP_LEGER = [1, null, 4, null, 3, null, 4, null];
  var ARP_BAS = [0, null, 3, null, 1, null, 3, null], GRATTE = ['s', null, null, null, 's', null, null, null];
  var MORCEAUX = {
    // Petite ville : ré dorien, pastoral ; la cithare répond à l'aulos.
    petite: {
      tempo: 72, tonique: 'D', mode: [0, 2, 3, 5, 7, 9, 10], forme: ['A', 'A2', 'B', 'A2'],
      parties: {
        A: { chant: "A4:2 D5:2 E5 F5 E5 D5 | ~E5:3 D5 B4:2 G4:2 | A4:2 D5 E5 'F5:2 G5 F5 | E5 D5 C5 E5 'D5:4", accords: 'Dm G Dm Dm' },
        A2: { chant: "A4:2 D5:2 E5 F5 G5 A5 | G5:3 F5 E5:2 C5:2 | D5 E5 F5 E5 D5:2 B4:2 | C5:2 A4:2 'D5:4", accords: 'Dm C G Dm' },
        B: { chant: "~A5:3 G5 F5:2 A5:2 | G5:2 E5:2 C5:4 | B4:2 D5:2 G5:3 F5 | 'E5:6 r:2", accords: 'F C G Am' }
      },
      passages: [
        { chant: 'aulos', bourdon: { instr: 'aulos', notes: ['D4'], niv: 0.8 }, arpege: ARP_LEGER, arpNiv: 0.8,
          tambour: 'D.......t...t...', tambourFin: 'D.......t.t.t.tt', tambNiv: 1, crotales: true },
        { chant: 'lyre', arpege: ARP_BAS, arpNiv: 0.9 },
        { chant: 'aulos', bourdon: { instr: 'aulos', notes: ['D4'], niv: 0.8 }, arpege: ARP_FLUIDE, arpNiv: 0.7,
          tambour: 'D.....t.D...t.t.', tambourFin: 'D.....t.D.t.tttt', tambNiv: 1.2, metal: '....S.......S...', metalNiv: 0.5, crotales: true }
      ]
    },
    // Grande ville : sol mixolydien, fête ; hydraulis, cithare grattée, sistres.
    grande: {
      tempo: 96, tonique: 'G', mode: [0, 2, 4, 5, 7, 9, 10], forme: ['A', 'A2', 'B', 'A2'],
      parties: {
        A: { chant: "D5 G5 G5 A5 B5:2 A5 G5 | A5 F5 F5 G5 'A5:2 G5 F5 | E5 G5 C5 E5 G5 A5 G5 E5 | D5:2 B4 C5 'D5:4", accords: 'G F C G' },
        A2: { chant: "D5 G5 G5 A5 B5:2 C6 B5 | A5:2 F5 G5 A5:2 C6:2 | C6 A5 F5 A5 G5 F5 E5 D5 | E5 F5 D5:2 'G5:4", accords: 'G F F G',
          cuivre: '| | | D4:2 G4:2 B4:4' },
        B: { chant: "G4:2 C5:2 ~E5:3 D5 | C5:2 F5:2 ~A5:3 G5 | F5 E5 D5 E5 F5:2 A5:2 | G5:4 F5:2 D5:2", accords: 'C F Dm G',
          cuivre: '| | | G3:2 D4:2 G4:4' }
      },
      passages: [
        { chant: 'aulos', orgue: 0.8, arpege: GRATTE, arpNiv: 0.6, tambour: 'D.Tt..T.D.t.T.t.', tambourFin: 'D.TtD.T.DtTtT.TT', tambNiv: 0.8,
          metal: '....S.......S...', metalNiv: 0.6 },
        { chant: 'orgue', orgue: 0.45, arpege: ARP_FLUIDE, arpNiv: 0.5, tambour: 'D.Tt..T.D.t.T.t.', tambourFin: 'D.TtD.T.DtTtT.TT', tambNiv: 0.8,
          metal: '....S.......S...', metalNiv: 0.6, crotales: true },
        { chant: 'aulos', orgue: 0.7, arpege: ARP_FLUIDE, arpNiv: 0.45, tambour: 'D.Tt..T.D.t.T.t.', tambourFin: 'D.TtD.T.DtTtT.TT', tambNiv: 0.85,
          metal: '..S.S...S.S.S...', metalNiv: 0.55, cuivre: true, crotales: true }
      ]
    },
    // Menace : mi phrygien, lent ; bourdon d'orgue grave, cœur qui bat, cornu au loin.
    menace: {
      tempo: 60, tonique: 'E', mode: [0, 1, 3, 5, 7, 8, 10], forme: ['M1', 'M2'], salle: 1.7,
      parties: {
        M1: { chant: "E4:4 'F4:2 E4:2 | r:4 G4 F4 E4:2 | A4:3 G4 'F4:2 G4 F4 | E4:8", accords: 'E5 F E5 E5', cuivre: '| | | B3:2 E4:6' },
        M2: { chant: "r:8 | ~B4:3 C5 B4:2 A4:2 | G4 A4 G4 F4 E4:2 'F4:2 | E4:8", accords: 'E5 Dm F E5', cuivre: 'E3:2 B3:2 E4:4' }
      },
      passages: [
        { chant: 'aulos', bourdon: { instr: 'orgue', notes: ['E2', 'B2'], niv: 0.9 }, arpege: [0, null, null, null, null, null, null, null], arpNiv: 0.9,
          tambour: 'D..D............', tambourFin: 'D..D....D..D....', tambNiv: 0.7, cuivre: true },
        { chant: 'aulos', octave: -12, bourdon: { instr: 'orgue', notes: ['E2', 'B2'], niv: 0.9 }, arpege: [0, null, null, null, 3, null, null, null], arpNiv: 0.8,
          tambour: 'D..D............', tambourFin: 'D..D....D..D....', tambNiv: 0.75, cuivre: true, crotales: true }
      ]
    },
    // Combat : mi phrygien dominant, rapide ; tambours, sistres, appels de cuivres.
    combat: {
      tempo: 132, tonique: 'E', mode: [0, 1, 4, 5, 7, 8, 10], forme: ['C1', 'C2'],
      parties: {
        C1: { chant: "E5 F5 G#5 F5 E5 F5 G#5 A5 | B5:2 A5 G#5 F5:2 E5:2 | F5 E5 D5 E5 F5:2 A5:2 | G#5 F5 'E5:2 r:4", accords: 'E E Dm E',
          cuivre: '| | | r:4 B3 E4 G#4:2' },
        C2: { chant: "E5 F5 G#5 A5 B5 A5 G#5 F5 | A5 G#5 F5 E5 F5:2 C6:2 | D6:2 C6 B5 A5:2 F5:2 | G#5:2 F5:2 'E5:4", accords: 'E F Dm E',
          cuivre: '| | | E3:4 B3:2 E4:2' }
      },
      passages: [
        { chant: 'aulos', arpege: GRATTE, arpNiv: 0.6, tambour: 'D..TD.T.D..TD.T.', tambourFin: 'D.TTD.TTDtTtDTTT', tambNiv: 0.55,
          grosse: 'D.......D.......', metal: '..S...S...S...S.', metalNiv: 0.45, cuivre: true },
        { chant: 'aulos', arpege: GRATTE, arpNiv: 0.6, tambour: 'D..TD.T.D..TD.T.', tambourFin: 'D.TTD.TTDtTtDTTT', tambNiv: 0.55,
          grosse: 'D...D...D...D...', metal: '..S...S...S...S.', metalNiv: 0.5, cuivre: true, appuis: true }
      ]
    }
  };

  var NOMS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function hauteur(nom) {
    var m = /^([A-G])(#|b)?(\d)$/.exec(nom);
    if (!m) throw new Error('note inconnue : ' + nom);
    return 12 * (+m[3] + 1) + NOMS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // Une voix écrite → mesures de notes { m, debut, duree (croches), orn }.
  function lireVoix(texte) {
    return texte.split('|').map(function (mesure) {
      var notes = [], pos = 0;
      mesure.trim().split(/\s+/).filter(Boolean).forEach(function (jeton) {
        var r = /^(['~]?)([A-G][#b]?\d|r)(?::(\d+(?:\.\d+)?))?$/.exec(jeton);
        if (!r) throw new Error('jeton inconnu : ' + jeton);
        var duree = r[3] ? +r[3] : 1;
        if (r[2] !== 'r') notes.push({ m: hauteur(r[2]), debut: pos, duree: duree, orn: r[1] });
        pos += duree;
      });
      return { notes: notes, croches: pos };
    });
  }
  // Accord « Dm » → fondamentale à l'octave 3 et tons [basse, f, tierce, quinte, F, T, Q, FF].
  function lireAccord(nom) {
    var r = /^([A-G][#b]?)(m|5)?$/.exec(nom);
    if (!r) throw new Error('accord inconnu : ' + nom);
    var f = hauteur(r[1] + '3'), tierce = r[2] === 'm' ? 3 : r[2] === '5' ? 7 : 4;
    return { nom: nom, fond: f, tons: [f - 12, f, f + tierce, f + 7, f + 12, f + 12 + tierce, f + 19, f + 24], tierce: tierce };
  }
  // Mesures du morceau, dans l'ordre de sa forme (préparé une fois).
  function preparerMorceau(M) {
    if (M.mesures) return M;
    M.mesures = [];
    M.forme.forEach(function (nom) {
      var P = M.parties[nom], chant = lireVoix(P.chant), cuivre = P.cuivre ? lireVoix(P.cuivre) : [];
      var accords = P.accords.split(/\s+/).map(lireAccord);
      chant.forEach(function (mes, k) {
        M.mesures.push({ partie: nom, rang: k, chant: mes, cuivre: cuivre[k] || null, accord: accords[k] });
      });
    });
    M.racine = hauteur(M.tonique + '4') % 12;
    return M;
  }
  // Note du dessus dans le mode (mordant).
  function voisinHaut(M, m) {
    for (var k = 1; k <= 3; k++) if (M.mode.indexOf(((m + k - M.racine) % 12 + 12) % 12) >= 0) return m + k;
    return m + 2;
  }

  // --- Branchements : bus par instrument, salle commune ---------------------
  var mus = { voulue: null, jouee: null, active: true, minuterie: null, prochaine: 0, mesure: 0, passe: 0,
    pret: false, effet: false, bus: {}, sec: null, envoi: null, humide: null, salle: null, sources: [], bourdon: null };
  var VOLUME_MUSIQUE = 0.62, VOLUME_SALLE = 1.5, AVANCE = 1.0;
  var ONDES = {}, cordes = {}, TAUX_CORDE = 22050, bruitBlanc = null;

  function hasard(s) { return function () { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x3fffffff - 1; }; }
  function onde(harm) {
    var re = new Float32Array(harm.length + 1), im = new Float32Array(harm.length + 1);
    for (var i = 0; i < harm.length; i++) im[i + 1] = harm[i];
    return ctx.createPeriodicWave(re, im);
  }
  // Réponse d'une cour de marbre : premières réflexions puis queue de bruit qui s'assombrit.
  function reponseSalle(duree) {
    var sr = ctx.sampleRate, n = Math.floor(sr * duree), ir = ctx.createBuffer(2, n, sr), avant = Math.floor(sr * 0.012);
    for (var c = 0; c < 2; c++) {
      var d = ir.getChannelData(c), h = hasard(777 + c * 131), lp = 0;
      for (var i = avant; i < n; i++) {
        var u = i / n, b = 0.75 - 0.6 * u;           // filtre de plus en plus fermé
        lp += b * (h() - lp);
        d[i] = lp * Math.sqrt((2 - b) / b) * Math.exp(-6.9 * u) * 0.5;
      }
      [0.013, 0.019, 0.027, 0.038, 0.052, 0.069, 0.083].forEach(function (r, k) {
        var j = Math.floor(r * sr * (c ? 1.09 : 1));
        if (j < n) d[j] += (0.7 - k * 0.08) * (k % 2 ? -1 : 1);
      });
    }
    return ir;
  }
  function panoramique(p) {
    if (ctx.createStereoPanner) { var s = ctx.createStereoPanner(); s.pan.value = p; return s; }
    return ctx.createGain();
  }
  function preparer() {
    if (mus.pret) return;
    mus.pret = true;
    ONDES.anche = onde([1, 0.62, 0.8, 0.45, 0.52, 0.3, 0.27, 0.16, 0.13, 0.08, 0.06, 0.04]);
    ONDES.orgue = onde([1, 0.52, 0.3, 0.26, 0.08, 0.11, 0.03, 0.05]);
    var n = ctx.sampleRate, h = hasard(4242);
    bruitBlanc = ctx.createBuffer(1, n, ctx.sampleRate);
    for (var i = 0, d = bruitBlanc.getChannelData(0); i < n; i++) d[i] = h();
    // La salle ne reçoit pas les graves (sinon la queue gronde).
    var coupeBas = ctx.createBiquadFilter(); coupeBas.type = 'highpass'; coupeBas.frequency.value = 160; coupeBas.Q.value = 0.6;
    mus.salle = ctx.createConvolver(); mus.salle.buffer = reponseSalle(2.3);
    mus.humide = ctx.createGain(); mus.humide.gain.value = VOLUME_SALLE;
    coupeBas.connect(mus.salle); mus.salle.connect(mus.humide); mus.humide.connect(maitre);
    var v = mus.active ? VOLUME_MUSIQUE : 0;
    mus.sec = ctx.createGain(); mus.sec.gain.value = v; mus.sec.connect(maitre);
    mus.envoi = ctx.createGain(); mus.envoi.gain.value = v; mus.envoi.connect(coupeBas);
    // Instruments de la musique : panoramique et part envoyée dans la salle.
    function bus(nom, pan, envoi, filtres, versSec, versSalle, niveau) {
      var e = ctx.createGain(), p = panoramique(pan), dernier = e;
      e.gain.value = niveau || 1;
      (filtres || []).forEach(function (f) { dernier.connect(f); dernier = f; });
      dernier.connect(p);
      p.connect(versSec);
      var g = ctx.createGain(); g.gain.value = envoi; p.connect(g); g.connect(versSalle);
      mus.bus[nom] = e;
    }
    function caisse() {   // corps de la cithare : bois qui résonne, aigus adoucis
      var a = ctx.createBiquadFilter(), b = ctx.createBiquadFilter();
      a.type = 'peaking'; a.frequency.value = 290; a.Q.value = 1.1; a.gain.value = 4;
      b.type = 'lowpass'; b.frequency.value = 5200; b.Q.value = 0.5;
      return [a, b];
    }
    // Niveaux réglés à l'écoute et à la mesure (cahier, 23.13) : chant vers −36 dB,
    // accompagnement vers −40 dB, ensemble vers −33 dB à la sortie.
    bus('lyre', -0.32, 0.55, caisse(), mus.sec, mus.envoi, 1.5);
    bus('aulos', 0.18, 0.5, null, mus.sec, mus.envoi, 0.6);
    bus('bourdon', 0.12, 0.6, null, mus.sec, mus.envoi, 1.2);
    bus('orgue', 0, 0.75, null, mus.sec, mus.envoi, 1.35);
    bus('cuivre', -0.12, 0.7, null, mus.sec, mus.envoi, 1.1);
    bus('tambour', 0.08, 0.32, null, mus.sec, mus.envoi, 1);
    bus('metal', 0.38, 0.55, null, mus.sec, mus.envoi, 3);
    // Mêmes instruments pour les effets (victoire, défaite, étape) : hors du réglage « Musique ».
    var fx = ctx.createGain(); fx.gain.value = 1; fx.connect(maitre);
    bus('fx-lyre', -0.2, 0.5, caisse(), fx, coupeBas);
    bus('fx-cuivre', 0, 0.6, null, fx, coupeBas);
    bus('fx-tambour', 0.1, 0.4, null, fx, coupeBas);
    bus('fx-metal', 0.3, 0.5, null, fx, coupeBas);
  }
  // Source démarrée ; celles de la musique sont gardées pour pouvoir l'arrêter net
  // (pas celles des effets, qui jouent pendant que la musique s'arrête).
  function suivre(src, debut, fin, decalage) {
    debut = Math.max(0, debut);
    if (decalage !== undefined) src.start(debut, decalage); else src.start(debut);
    src.stop(fin);
    if (!mus.effet) mus.sources.push({ s: src, fin: fin });
  }

  // --- Instruments -----------------------------------------------------------
  // Corde pincée (Karplus-Strong) : ligne à retard nourrie d'un bruit adouci,
  // moyenne de deux échantillons (cordes en boyau), passe-tout pour l'accord fin.
  function corde(m) {
    if (cordes[m]) return cordes[m];
    var sr = TAUX_CORDE, f = hz(m), t60 = Math.max(1.0, Math.min(3.6, 3.1 * Math.pow(196 / f, 0.45)));
    var n = Math.floor(sr * Math.min(t60, 3.0)), buf = ctx.createBuffer(1, n, sr), out = buf.getChannelData(0);
    var P = sr / f - 0.5, N = Math.floor(P), D = P - N;
    if (D < 0.2) { N -= 1; D += 1; }
    var C = (1 - D) / (1 + D), rho = Math.pow(0.001, 1 / (f * t60));
    var ligne = new Float32Array(N), h = hasard(m * 7919 + 13), lisse = 0, moyenne = 0, i;
    for (i = 0; i < N; i++) { lisse += 0.5 * (h() - lisse); ligne[i] = lisse; moyenne += lisse / N; }
    var pince = Math.max(1, Math.round(N * 0.14)), copie = new Float32Array(N);
    for (i = 0; i < N; i++) copie[i] = ligne[i] - moyenne;
    for (i = 0; i < N; i++) ligne[i] = copie[i] - 0.85 * copie[(i + N - pince) % N];
    var idx = 0, avant = 0, ax = 0, ay = 0, crete = 1e-6;
    for (i = 0; i < n; i++) {
      var y = ligne[idx];
      out[i] = y;
      var moy = 0.5 * (y + avant); avant = y;
      var ap = C * moy + ax - C * ay; ax = moy; ay = ap;
      ligne[idx] = ap * rho;
      if (++idx === N) idx = 0;
      if (y > crete) crete = y; else if (-y > crete) crete = -y;
    }
    var fin = Math.floor(sr * 0.1), k = 0.9 / crete;
    for (i = 0; i < n; i++) out[i] *= k * (i > n - fin ? (n - i) / fin : 1);
    cordes[m] = buf;
    return buf;
  }
  function pincer(bus, m, t, vol) {
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = corde(m); g.gain.value = vol;
    src.connect(g); g.connect(bus);
    suivre(src, t, t + src.buffer.duration + 0.05);
  }
  // Accord gratté vers l'aigu.
  function gratter(bus, accord, t, vol) {
    [1, 3, 4, 5, 6].forEach(function (k, j) { pincer(bus, accord.tons[k], t + j * 0.022, vol * (1 - j * 0.1)); });
  }
  // Bruit filtré bref (peau, métal, souffle) tiré du bruit blanc commun.
  function bruitBref(bus, t, duree, vol, type, frequence, q) {
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = bruitBlanc; f.type = type; f.frequency.value = frequence; f.Q.value = q || 0.7;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + duree);
    src.connect(f); f.connect(g); g.connect(bus);
    suivre(src, t, t + duree + 0.02, Math.random() * 0.8);
  }
  function sinusBref(bus, f, t, duree, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + duree);
    o.connect(g); g.connect(bus); suivre(o, t, t + duree + 0.02);
  }
  // Aulos : une phrase liée, un seul tuyau qui change de note.
  function aulos(bus, notes, vol) {
    var t0 = notes[0].t, der = notes[notes.length - 1], fin = der.t + der.d;
    var o = ctx.createOscillator(), g = ctx.createGain(), nez = ctx.createBiquadFilter(), haut = ctx.createBiquadFilter(), bas = ctx.createBiquadFilter();
    var vib = ctx.createOscillator(), vg = ctx.createGain();
    o.setPeriodicWave(ONDES.anche);
    nez.type = 'peaking'; nez.frequency.value = 1180; nez.Q.value = 1.3; nez.gain.value = 7;
    haut.type = 'peaking'; haut.frequency.value = 2700; haut.Q.value = 2; haut.gain.value = 3;
    bas.type = 'lowpass'; bas.frequency.value = 4400; bas.Q.value = 0.5;
    vib.frequency.value = 5.4 + Math.random() * 0.6; vg.gain.value = 0;
    vib.connect(vg); vg.connect(o.detune);
    o.connect(nez); nez.connect(haut); haut.connect(bas); bas.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0, t0);
    notes.forEach(function (n, k) {
      var f = hz(n.m);
      if (n.orn === "'") { o.frequency.setValueAtTime(hz(n.haut), n.t); o.frequency.setTargetAtTime(f, n.t + Math.min(0.07, n.d * 0.3), 0.008); }
      else if (n.orn === '~') { o.frequency.setValueAtTime(f * 0.944, n.t); o.frequency.setTargetAtTime(f, n.t + 0.01, 0.045); }
      else if (k === 0) o.frequency.setValueAtTime(f, n.t);
      else o.frequency.setTargetAtTime(f, n.t - 0.012, 0.011);
      if (k === 0) g.gain.setTargetAtTime(vol, n.t, 0.022);
      else { g.gain.setTargetAtTime(vol * 0.4, n.t - 0.035, 0.008); g.gain.setTargetAtTime(vol, n.t, 0.014); }
      vg.gain.setTargetAtTime(0, n.t, 0.03);
      if (n.d >= 0.45) vg.gain.setTargetAtTime(17, n.t + n.d * 0.4, 0.12);
    });
    g.gain.setTargetAtTime(0, fin - 0.05, 0.045);
    suivre(o, t0 - 0.005, fin + 0.35); vib.start(t0); vib.stop(fin + 0.35);
    // Souffle dans l'anche.
    var s = ctx.createBufferSource(), sf = ctx.createBiquadFilter(), sg = ctx.createGain();
    s.buffer = bruitBlanc; s.loop = true; sf.type = 'bandpass'; sf.frequency.value = 1900; sf.Q.value = 0.9;
    sg.gain.setValueAtTime(0, t0); sg.gain.setTargetAtTime(vol * 0.09, t0, 0.03); sg.gain.setTargetAtTime(0, fin - 0.05, 0.05);
    s.connect(sf); sf.connect(sg); sg.connect(bus);
    suivre(s, t0, fin + 0.35);
  }
  // Second tuyau ou bourdon d'orgue : tenu jusqu'à ce qu'on l'arrête.
  function bourdonDebut(cle, B, t) {
    var g = ctx.createGain(), oscs = [];
    g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(B.niv * (B.instr === 'orgue' ? 0.05 : 0.055), t, 0.25);
    B.notes.forEach(function (nom, k) {
      var o = ctx.createOscillator();
      o.setPeriodicWave(B.instr === 'orgue' ? ONDES.orgue : ONDES.anche);
      o.frequency.value = hz(hauteur(nom)); o.detune.value = k * 2 - 1;
      o.connect(g); o.start(t); oscs.push(o);
    });
    if (B.instr === 'aulos') {
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200; g.connect(f); f.connect(mus.bus.bourdon);
    } else g.connect(mus.bus.bourdon);
    mus.bourdon = { cle: cle, g: g, oscs: oscs };
  }
  function bourdonFin(t) {
    var B = mus.bourdon;
    if (!B) return;
    mus.bourdon = null;
    B.g.gain.setTargetAtTime(0, t, 0.3);
    B.oscs.forEach(function (o) { try { o.stop(t + 2); } catch (e) { /* déjà arrêté */ } });
  }
  // Hydraulis : tuyaux de flûtes, attaque soufflée, tremblement de l'eau.
  function orgue(bus, ms, t, d, vol) {
    var g = ctx.createGain(), tr = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(vol, t, 0.035); g.gain.setTargetAtTime(0, t + d - 0.04, 0.07);
    lfo.frequency.value = 4.2; lg.gain.value = 0.11; lfo.connect(lg); lg.connect(tr.gain);
    g.connect(tr); tr.connect(bus);
    ms.forEach(function (m) {
      var o = ctx.createOscillator();
      o.setPeriodicWave(ONDES.orgue); o.frequency.value = hz(m); o.detune.value = Math.random() * 6 - 3;
      o.connect(g); suivre(o, t, t + d + 0.5);
    });
    suivre(lfo, t, t + d + 0.5);
    bruitBref(bus, t, 0.06, vol * 0.5, 'bandpass', Math.min(6000, hz(ms[0]) * 4), 2.5);
  }
  // Cornu ou tuba : deux sonneurs, embouchure qui s'ouvre, note prise par-dessous.
  function cuivre(bus, m, t, d, vol) {
    var f = hz(m), g = ctx.createGain(), fl = ctx.createBiquadFilter(), haut = Math.min(9000, f * 7);
    fl.type = 'lowpass'; fl.Q.value = 1.4;
    fl.frequency.setValueAtTime(f * 1.3, t); fl.frequency.setTargetAtTime(haut, t, 0.035); fl.frequency.setTargetAtTime(Math.min(7000, f * 4.2), t + 0.12, 0.25);
    g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(vol, t, 0.028); g.gain.setTargetAtTime(vol * 0.72, t + 0.14, 0.2); g.gain.setTargetAtTime(0, t + d - 0.06, 0.07);
    [-7, 6].forEach(function (c) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth'; o.detune.value = c;
      o.frequency.setValueAtTime(f * 0.972, t); o.frequency.setTargetAtTime(f, t + 0.005, 0.03);
      o.connect(fl); suivre(o, t, t + d + 0.45);
    });
    fl.connect(g); g.connect(bus);
  }
  // Tympanum : doum (peau au centre), tek (bord), grosse caisse.
  function tympanum(bus, coup, t, vol) {
    if (coup === 'D' || coup === 'G') {
      var gros = coup === 'G', o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(gros ? 78 : 108, t); o.frequency.exponentialRampToValueAtTime(gros ? 41 : 64, t + 0.16);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + (gros ? 0.75 : 0.42));
      o.connect(g); g.connect(bus); suivre(o, t, t + 0.8);
      bruitBref(bus, t, 0.05, vol * 0.45, 'lowpass', gros ? 260 : 420);
      if (!gros) sinusBref(bus, 196, t, 0.16, vol * 0.12);
      return;
    }
    var v = coup === 'T' ? vol : vol * 0.38;
    bruitBref(bus, t, 0.045, v * 0.75, 'bandpass', 2400, 1.5);
    sinusBref(bus, 410, t, 0.07, v * 0.25);
  }
  // Sistre : disques de métal secoués ; crotales : petites cymbales qui sonnent longtemps.
  function sistre(bus, t, vol) {
    for (var k = 0; k < 4; k++) bruitBref(bus, t + k * 0.017, 0.06, vol * (1 - k * 0.2), 'highpass', 6000, 0.7);
    sinusBref(bus, 6240, t, 0.18, vol * 0.12); sinusBref(bus, 8130, t + 0.017, 0.14, vol * 0.08);
  }
  function crotales(bus, t, vol) {
    [[2350, 1.5, 1], [3460, 1.0, 0.55], [4930, 0.7, 0.35], [6080, 0.45, 0.22]].forEach(function (p) { sinusBref(bus, p[0], t, p[1], vol * p[2]); });
  }

  // --- Programmation d'une mesure --------------------------------------------
  function joueRythme(motif, t, dc, faire) {
    if (!motif) return;
    for (var i = 0; i < motif.length; i++) if (motif[i] !== '.') faire(motif[i], t + i * dc);
  }
  function humain(n) { return (Math.random() - 0.5) * n; }
  function programmerMesure(M, p, mes, t) {
    var croche = 30 / M.tempo, dc = croche / 2, duree = croche * 8, acc = mes.accord, B = mus.bus;
    // Bourdon : tenu de mesure en mesure tant qu'il ne change pas.
    var cle = p.bourdon ? p.bourdon.instr + p.bourdon.notes.join() + M.tonique : null;
    if (!mus.bourdon || mus.bourdon.cle !== cle) { bourdonFin(t); if (p.bourdon) bourdonDebut(cle, p.bourdon, t); }
    // Chant.
    var oct = p.octave || 0, notes = mes.chant.notes.map(function (n) {
      return { m: n.m + oct, t: t + n.debut * croche, d: n.duree * croche, orn: n.orn, haut: voisinHaut(M, n.m + oct), fin: n.debut + n.duree };
    });
    if (p.chant === 'aulos') {
      var groupe = [];
      notes.forEach(function (n, k) {
        if (groupe.length && Math.abs(groupe[groupe.length - 1].t + groupe[groupe.length - 1].d - n.t) > 0.001) { aulos(B.aulos, groupe, 0.2); groupe = []; }
        groupe.push(n);
        if (k === notes.length - 1) aulos(B.aulos, groupe, 0.2);
      });
    } else if (p.chant === 'lyre') {
      notes.forEach(function (n) {
        if (n.orn === "'") pincer(B.lyre, n.haut, n.t, 0.42);
        pincer(B.lyre, n.m, n.t + (n.orn === "'" ? 0.06 : 0), 0.58 + humain(0.08));
      });
    } else if (p.chant === 'orgue') {
      notes.forEach(function (n) { orgue(B.orgue, [n.m, n.m - 12], n.t, n.d, 0.085); });
    }
    // Cithare : arpège ou accord gratté.
    (p.arpege || []).forEach(function (k, i) {
      if (k === null) return;
      var ti = t + i * croche + humain(0.012);
      if (k === 's') gratter(B.lyre, acc, ti, 0.34 * p.arpNiv);
      else pincer(B.lyre, acc.tons[k], ti, (i % 4 === 0 ? 0.36 : 0.27) * p.arpNiv);
    });
    // Hydraulis : l'accord tenu toute la mesure.
    if (p.orgue) orgue(B.orgue, [acc.fond, acc.fond + 7, acc.fond + 12, acc.fond + 12 + acc.tierce], t, duree + 0.03, 0.036 * p.orgue);
    // Cuivres : appels écrits, appuis sur la fondamentale.
    if (p.cuivre && mes.cuivre) mes.cuivre.notes.forEach(function (n) { cuivre(B.cuivre, n.m, t + n.debut * croche, n.duree * croche, 0.075); });
    if (p.appuis) { cuivre(B.cuivre, acc.fond - 12, t, croche * 1.4, 0.06); cuivre(B.cuivre, acc.fond - 5, t, croche * 1.4, 0.045); }
    // Percussions.
    var tn = p.tambNiv || 0.8;
    joueRythme(mes.rang === 3 && p.tambourFin ? p.tambourFin : p.tambour, t, dc, function (c, ti) { tympanum(B.tambour, c, ti + humain(0.008), (c === 'D' ? 0.55 : 0.32) * tn * (1 + humain(0.15))); });
    joueRythme(p.grosse, t, dc, function (c, ti) { tympanum(B.tambour, 'G', ti, 0.36); });
    joueRythme(p.metal, t, dc, function (c, ti) { if (c === 'S') sistre(B.metal, ti + humain(0.006), 0.11 * (p.metalNiv || 0.5)); else crotales(B.metal, ti, 0.05); });
    if (p.crotales && mes.rang === 0) crotales(B.metal, t, 0.045);
    return duree;
  }
  function avancerMusique() {
    if (!ctx || coupe || !mus.active || !mus.voulue) return;
    preparer();
    var maintenant = ctx.currentTime;
    if (mus.prochaine < maintenant + 0.02) mus.prochaine = maintenant + 0.08;
    // Les sources finies sont oubliées.
    if (mus.sources.length > 60) mus.sources = mus.sources.filter(function (s) { return s.fin > maintenant; });
    while (mus.prochaine < maintenant + AVANCE) {
      if (mus.jouee !== mus.voulue) {
        mus.jouee = mus.voulue; mus.mesure = 0; mus.passe = 0;
        mus.humide.gain.setTargetAtTime(VOLUME_SALLE * (MORCEAUX[mus.jouee].salle || 1), mus.prochaine, 0.4);
      }
      var M = preparerMorceau(MORCEAUX[mus.jouee]), p = M.passages[mus.passe % M.passages.length];
      var duree = 240 / M.tempo;
      try { programmerMesure(M, p, M.mesures[mus.mesure], mus.prochaine); } catch (e) { /* audio indisponible */ }
      mus.prochaine += duree;
      if (++mus.mesure >= M.mesures.length) { mus.mesure = 0; mus.passe++; }
    }
  }
  // Arrêt : fondu court, puis toutes les sources prévues sont arrêtées.
  function arreterMusique() {
    if (!ctx || !mus.pret) return;
    var t = ctx.currentTime;
    mus.sec.gain.setTargetAtTime(0, t, 0.08); mus.envoi.gain.setTargetAtTime(0, t, 0.08);
    mus.sources.forEach(function (s) { if (s.fin > t) { try { s.s.stop(t + 0.4); } catch (e) { /* déjà arrêtée */ } } });
    mus.sources = [];
    bourdonFin(t);
    mus.jouee = null; mus.mesure = 0; mus.passe = 0; mus.prochaine = 0;
  }
  function musique(ambiance) {
    var avant = mus.voulue;
    mus.voulue = MORCEAUX[ambiance] ? ambiance : null;
    if (mus.voulue === avant) return;
    if (mus.voulue && ctx) {
      preparer();
      if (!avant) {
        var v = mus.active ? VOLUME_MUSIQUE : 0;
        mus.sec.gain.cancelScheduledValues(ctx.currentTime); mus.envoi.gain.cancelScheduledValues(ctx.currentTime);
        mus.sec.gain.setTargetAtTime(v, ctx.currentTime + 0.45, 0.05); mus.envoi.gain.setTargetAtTime(v, ctx.currentTime + 0.45, 0.05);
      }
    }
    if (mus.voulue && !mus.minuterie && typeof setInterval === 'function') mus.minuterie = setInterval(avancerMusique, 100);
    if (!mus.voulue) {
      if (mus.minuterie) { clearInterval(mus.minuterie); mus.minuterie = null; }
      arreterMusique();
    }
  }

  // --- Effets courts ---------------------------------------------------------
  // Les trois annonces (étape, victoire, défaite) passent par les mêmes instruments.
  function annonce(fn) {
    if (!ctx || coupe) return false;
    mus.effet = true;
    try { preparer(); fn(ctx.currentTime + 0.02, mus.bus); } catch (e) { /* audio indisponible */ }
    mus.effet = false;
    return true;
  }
  var SONS = {
    clic: function () { note('triangle', 880, 660, 0.06, 0.15); },
    menu: function () { note('sine', 520, 620, 0.07, 0.12); },
    poser: function () { bruit(0.12, 0.35, 700); note('square', 160, 90, 0.1, 0.12); },
    route: function () { bruit(0.06, 0.2, 1500); },
    refus: function () { note('sawtooth', 220, 150, 0.16, 0.12); },
    detruire: function () { bruit(0.35, 0.4, 500); note('triangle', 120, 60, 0.3, 0.2); },
    pieces: function () { note('square', 1320, 1320, 0.05, 0.08); note('square', 1760, 1760, 0.07, 0.08, 0.06); },
    // Étape franchie : la cithare monte un accord de sol, crotales.
    etape: function () {
      annonce(function (t, B) {
        ['G3', 'D4', 'G4', 'B4', 'D5'].forEach(function (n, k) { pincer(B['fx-lyre'], hauteur(n), t + k * 0.07, 0.55); });
        crotales(B['fx-metal'], t + 0.3, 0.06);
      });
    },
    alerte: function () { note('square', 740, 740, 0.12, 0.12); note('square', 554, 554, 0.18, 0.12, 0.14); },
    feu: function () { bruit(0.6, 0.35, 900); note('sawtooth', 300, 200, 0.4, 0.06); },
    // Victoire : fanfare de cornu sur les harmoniques de do, tambour et cithare.
    victoire: function () {
      annonce(function (t, B) {
        [['C4', 0, 0.16], ['C4', 0.18, 0.16], ['G4', 0.36, 0.34], ['E4', 0.72, 0.16], ['G4', 0.9, 0.16], ['C5', 1.08, 1.1]].forEach(function (n) {
          cuivre(B['fx-cuivre'], hauteur(n[0]), t + n[1], n[2], 0.1); cuivre(B['fx-cuivre'], hauteur(n[0]) - 12, t + n[1], n[2], 0.05);
        });
        [0, 0.36, 1.08].forEach(function (d) { tympanum(B['fx-tambour'], 'D', t + d, 0.6); });
        gratter(B['fx-lyre'], lireAccord('C'), t + 1.08, 0.45);
        crotales(B['fx-metal'], t + 1.08, 0.07);
      });
    },
    // Défaite : appel grave du cornu qui descend en phrygien, grosse caisse.
    defaite: function () {
      annonce(function (t, B) {
        [['E4', 0, 0.5], ['D4', 0.5, 0.5], ['C4', 1.0, 0.5], ['B3', 1.5, 1.4]].forEach(function (n) {
          cuivre(B['fx-cuivre'], hauteur(n[0]), t + n[1], n[2], 0.07); cuivre(B['fx-cuivre'], hauteur(n[0]) - 12, t + n[1], n[2], 0.05);
        });
        [0, 1.5].forEach(function (d) { tympanum(B['fx-tambour'], 'G', t + d, 0.7); });
      });
    }
  };

  racine.MM_AUDIO = {
    demarrer: demarrer,
    // Ambiance de musique voulue ('petite', 'grande', 'menace', 'combat'), ou null pour l'arrêter.
    musique: musique,
    // Musique permise (option du joueur) ; les effets restent.
    musiqueActive: function (a) {
      mus.active = !!a;
      if (mus.pret && ctx) {
        var v = a && mus.voulue ? VOLUME_MUSIQUE : 0;
        mus.sec.gain.setTargetAtTime(v, ctx.currentTime, 0.2); mus.envoi.gain.setTargetAtTime(v, ctx.currentTime, 0.2);
      }
    },
    ambiance: function () { return mus.voulue; },
    jouer: function (nom) { if (SONS[nom]) { try { SONS[nom](); } catch (e) { /* audio indisponible */ } } },
    couper: function (c) {
      coupe = !!c;
      if (maitre && ctx) maitre.gain.setTargetAtTime(coupe ? 0 : 0.5, ctx.currentTime, 0.02);
    },
    estCoupe: function () { return coupe; },
    pause: function (p) { if (ctx) { try { if (p) ctx.suspend(); else ctx.resume(); } catch (e) { /* rien */ } } },
    // Pour les tests : les morceaux lus (mesures, accords, mode), sans contexte audio.
    partitions: function () {
      var r = {};
      Object.keys(MORCEAUX).forEach(function (k) { var M = preparerMorceau(MORCEAUX[k]); r[k] = { tempo: M.tempo, mode: M.mode, racine: M.racine, mesures: M.mesures, passages: M.passages }; });
      return r;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
