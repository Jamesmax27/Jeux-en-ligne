/* ==========================================================================
   Marmoria — interface (couche 3 sur 3)

   L'interface envoie des commandes à la simulation (MM_SIM.appliquer) et ne
   modifie jamais l'état elle-même ; le rendu lit l'état. Elle gère : écrans hors
   partie (titre, missions, présentation, pause, options, sauvegardes, victoire,
   défaite), barre d'état, menu de construction, panneaux d'information,
   conseiller, journal, calques, mini-carte, tutoriels, commandes au clavier, à
   la souris et au doigt (paysage ; téléphone en portrait : affichage pivoté).
   Sauvegardes : progression par JEL_SAVE (save.js), villes par JEL_STOCK
   (stockage.js : 3 automatiques tournantes, 5 emplacements). Fin de mission
   signalée par FMG.reportEnd, campagne terminée par FMG.reportComplete.
   ========================================================================== */
(function () {
  'use strict';

  var I18N = window.JEL_I18N;
  var t = function (cle, vars) { return I18N.t(cle, vars); };
  var nb = function (x) { return I18N.nombre(Math.round(x)); };
  var JEU = 'marmoria';
  var SIM = window.MM_SIM, DS = window.MM_DESSINS, AUDIO = window.MM_AUDIO;
  var D = SIM.charger(JSON.parse(document.getElementById('mm-donnees').textContent));
  var MISSIONS = D.missions;
  // Nombre réel de niveaux : les 17 cartes de la campagne (dérogation du cahier, section 19.6).
  window.JEL_NIVEAUX = MISSIONS.length;
  var MAX_ETOILES = MISSIONS.length * 3;
  var VILLES = [];
  try { VILLES = JSON.parse(document.getElementById('mm-villes').textContent) || []; } catch (e) { VILLES = []; }

  var $ = function (id) { return document.getElementById(id); };
  var app = $('app'), canvas = $('carte'), hud = $('hud'), ecran = $('ecran'), mini = $('mini');
  var rendu = window.MM_RENDU.creer(canvas);
  var estTactile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // ------------------------------------------------------------------------
  // Outils DOM
  // ------------------------------------------------------------------------
  function el(tag, attrs, enfants) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'texte') n.textContent = attrs[k];
      else if (k === 'classe') n.className = attrs[k];
      else if (k === 'clic') n.addEventListener('click', attrs[k]);
      else if (k === 'aria') n.setAttribute('aria-label', attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (enfants || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function bouton(texte, action, classe) {
    return el('button', { classe: classe || 'gros oui', texte: texte, clic: function (ev) { AUDIO.demarrer(); AUDIO.jouer('clic'); action(ev); } });
  }
  function vider(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function etoilesTexte(n, max) {
    var s = el('span', { classe: 'etoiles', aria: t('missions.etoilesAria', { n: n, max: max || 3 }) });
    s.textContent = '★★★'.slice(0, n) + '☆☆☆'.slice(0, (max || 3) - n);
    return s;
  }

  // ------------------------------------------------------------------------
  // Progression (JEL_SAVE) et options
  // ------------------------------------------------------------------------
  var prog = { niveau: 1, gagnees: {}, fortune: 0, options: { son: true, pauseCritique: false, defilement: 2, geste: false, auto: 0 } };
  var progChargee = false;
  function lireProg(d) {
    if (!d || typeof d !== 'object') return;
    if (d.gagnees && typeof d.gagnees === 'object') prog.gagnees = d.gagnees;
    if (d.options && typeof d.options === 'object') for (var k in d.options) if (k in prog.options) prog.options[k] = d.options[k];
    prog.niveau = Math.max(1, Math.min(MISSIONS.length, (d.niveau | 0) || 1));
    prog.fortune = Math.max(0, d.fortune | 0); // fortune du gouverneur, gardée d'une mission à l'autre (section 11.6)
  }
  function chargerProg(d) { lireProg(d); progChargee = true; appliquerOptions(); }
  function totalEtoiles() { var s = 0; for (var k in prog.gagnees) s += prog.gagnees[k] | 0; return Math.min(MAX_ETOILES, s); }
  function sauverProg() {
    if (!progChargee) return;
    try { window.JEL_SAVE.save(JEU, { niveau: prog.niveau, score: totalEtoiles(), options: prog.options, gagnees: prog.gagnees, fortune: prog.fortune }); } catch (e) { /* sans stockage */ }
  }
  function appliquerOptions() { AUDIO.couper(!prog.options.son); majBoutonSon(); }
  // Lecture seule au lancement (son coupé, geste déjà vu) : jamais d'écriture depuis l'écran titre.
  try { lireProg(window.JEL_SAVE.load(JEU)); } catch (e) { /* valeurs par défaut */ }
  AUDIO.couper(!prog.options.son);

  function echelonsGagnes() {
    var vus = {};
    MISSIONS.forEach(function (m) { if (prog.gagnees[m.id]) vus[m.echelon] = 1; });
    return Object.keys(vus).length;
  }
  function rangTexte() { var n = echelonsGagnes(); return n ? t('rang.' + D.rangs[Math.min(n, D.rangs.length) - 1]) : t('rang.aucun'); }
  function missionOuverte(m) {
    // Mode test (?debug=1 dans l'adresse du lanceur) : toutes les missions jouables sont ouvertes,
    // pour essayer directement Ravenne, Narbo ou Massalia.
    if (m.echelon === 1 || window.JEL_DEBUG) return true;
    return MISSIONS.some(function (x) { return x.echelon === m.echelon - 1 && prog.gagnees[x.id]; });
  }

  // ------------------------------------------------------------------------
  // Mise en page : paysage, téléphone en portrait pivoté
  // ------------------------------------------------------------------------
  var W = 1, H = 1, pivote = false;
  function orienter() {
    var iw = window.innerWidth, ih = window.innerHeight;
    pivote = estTactile && ih > iw;
    document.documentElement.classList.toggle('pivote', pivote);
    W = pivote ? ih : iw; H = pivote ? iw : ih;
    app.style.width = W + 'px'; app.style.height = H + 'px';
    rendu.redimensionner(W, H, Math.min(2, window.devicePixelRatio || 1));
    $('menu-cat').classList.toggle('deux', H < 600);
    placerMain();
  }
  // Coordonnées d'un événement dans #app (tiennent compte de la rotation).
  function local(ev) {
    if (pivote) return [ev.clientY, window.innerWidth - ev.clientX];
    return [ev.clientX, ev.clientY];
  }
  window.addEventListener('resize', orienter);

  // ------------------------------------------------------------------------
  // Partie en cours
  // ------------------------------------------------------------------------
  var partie = null;   // { e, m, iv, acc, figee, dernierMsg, tuto, annee, log, derniere }
  var fond = null;     // ville d'exemple de l'écran titre
  function mission(id) { for (var k = 0; k < MISSIONS.length; k++) if (MISSIONS[k].id === id) return MISSIONS[k]; return null; }

  function demarrerEtat(e, options) {
    options = options || {};
    fond = null;
    partie = { e: e, m: mission(e.mission), iv: D.temps.vitesseDepart, acc: 0, figee: !!options.figee, dernierMsg: e.journal[e.journal.length - 1] || null,
      tuto: e.tuto, annee: SIM.date(e).annee, log: [], derniere: 0, finVue: !!(e.victoire || e.defaite) };
    rendu.e = e;
    rendu.calque = null; rendu.apercu = null; rendu.selection = 0;
    rendu.cam.z = 1;
    centrerVille(e);
    ecran.className = ''; vider(ecran);
    hud.hidden = false;
    construireMenu();
    fermerPanneau();
    majTuto(false);
    majHud();
    if (!options.figee && !e.libre) prog.niveau = Math.max(prog.niveau, partie.m.numero);
    if (!options.figee && !prog.options.geste) ecranGeste(0);
  }
  function centrerVille(e) {
    // Centre de la ville (moyenne des bâtiments), sinon l'entrée de la voie de Rome.
    var sx = 0, sy = 0, n = 0;
    e.batiments.forEach(function (b) { if (b.type === 'logement') { sx += b.x; sy += b.y; n++; } });
    if (n) rendu.centrerSur(Math.round(sx / n), Math.round(sy / n));
    else { var N = e.N, i = e.entree; rendu.centrerSur(Math.min(N - 1, (i % N) + 18), Math.floor(i / N)); }
  }
  function nouvelleMission(m) {
    // Rang atteint (salaire du gouverneur) et fortune personnelle (section 11.6).
    var e = SIM.nouvelle(m.id, { rang: Math.max(1, echelonsGagnes()), fortune: prog.fortune, difficulte: m.echelon >= 3 ? (prog.options.difficulte || 'normal') : 'normal' });
    demarrerEtat(e);
    AUDIO.jouer('etape');
  }
  function quitterPartie() {
    finirOrdre();
    partie = null;
    hud.hidden = true;
    annulerOutil();
    ecranTitre();
  }

  // Commande du joueur : appliquée au tick courant, gardée dans le journal des commandes.
  function commander(c) {
    if (!partie || partie.figee) return { ok: false };
    var r = SIM.appliquer(partie.e, c);
    partie.log.push({ t: partie.e.tick, c: c });
    if (partie.log.length > 4000) partie.log.shift();
    return r;
  }

  // ------------------------------------------------------------------------
  // Boucle : pas fixe, plusieurs ticks par image selon la vitesse
  // ------------------------------------------------------------------------
  var dernier = 0, dernierHud = 0, derniereMini = 0, touches = {};
  function boucle(ts) {
    requestAnimationFrame(boucle);
    var dt = Math.min(250, ts - (dernier || ts));
    dernier = ts;
    var actif = partie && !partie.figee && !ecranBloquant();
    if (actif) {
      var v = D.temps.vitesses[partie.iv];
      partie.acc += dt / 1000 * D.temps.ticksParSeconde * v;
      var n = 0;
      while (partie.acc >= 1 && n < 16) { SIM.pas(partie.e); partie.acc -= 1; n++; }
      if (partie.acc > 16) partie.acc = 0;
      if (n) apresTicks();
    } else if (fond) {
      fond.acc += dt / 1000 * D.temps.ticksParSeconde;
      while (fond.acc >= 1) { SIM.pas(fond.e); fond.acc -= 1; }
      if (!fond.fixe) {
        rendu.cam.x += dt * 0.012;
        if (rendu.cam.x > fond.x0 + 260) rendu.cam.x = fond.x0 - 260;
      }
    }
    deplacerCamera(dt);
    rendu.temps = ts;
    rendu.dessiner(actif ? Math.min(1, partie.acc) : 0);
    if (partie) {
      if (ts - dernierHud > 250) { majHud(); dernierHud = ts; if (panneauVivant) panneauVivant(); }
      if (ts - derniereMini > 900) { rendu.dessinerMiniCarte(mini); derniereMini = ts; }
    }
  }
  function ecranBloquant() { return ecran.childNodes.length > 0 && ecran.dataset.bloque === '1'; }

  function apresTicks() {
    var e = partie.e;
    // Nouveaux messages du journal : bulles, sons, pause sur message critique (option).
    var j = e.journal, k = j.length - 1, nouveaux = [];
    while (k >= 0 && j[k] !== partie.dernierMsg) { nouveaux.unshift(j[k]); k--; }
    if (nouveaux.length) {
      partie.dernierMsg = j[j.length - 1];
      nouveaux.forEach(function (m) {
        if (m.cle === 'msg.etapeFaite' || m.cle === 'msg.bienvenue') return;
        if (m.critique || m.cle === 'msg.nouvelleAnnee' || m.cle === 'msg.tribut') toast(texteMsg(m), m.critique);
        if (m.cle === 'msg.incendie') AUDIO.jouer('feu');
        else if (m.critique && m.cle !== 'msg.victoire') AUDIO.jouer('alerte');
        if (m.critique && prog.options.pauseCritique && m.cle !== 'msg.victoire') { partie.iv = 0; majHud(); }
      });
    }
    if (e.tuto !== partie.tuto) { partie.tuto = e.tuto; majTuto(true); }
    var a = SIM.date(e).annee;
    if (a !== partie.annee) { partie.annee = a; sauverVilleAuto(); }
    if (!partie.finVue && e.victoire) { partie.finVue = true; ecranVictoire(); }
    else if (!partie.finVue && e.defaite) { partie.finVue = true; ecranDefaite(); }
  }

  // ------------------------------------------------------------------------
  // Barre d'état
  // ------------------------------------------------------------------------
  function anneeTexte(a) { return a < 0 ? t('annee.av', { n: -a }) : t('annee.ap', { n: a }); }
  function majHud() {
    if (!partie) return;
    var e = partie.e, d = SIM.date(e);
    $('v-tresor').textContent = nb(e.tresor);
    $('i-tresor').classList.toggle('negatif', e.tresor < 0);
    $('v-pop').textContent = nb(e.pop);
    $('v-date').textContent = t('hud.date', { mois: t('mois.' + d.mois), annee: anneeTexte(d.annee) });
    var v = D.temps.vitesses[partie.iv];
    $('v-vitesse').textContent = v === 0 ? t('vitesse.pause') : t('vitesse.x', { v: I18N.nombre(v) });
    if (partie.derniere && Date.now() - partie.derniere > D.regles.annulationSecondes * 1000) { partie.derniere = 0; $('b-annuler-derniere').hidden = true; }
    majTutoProgres();
  }
  function changerVitesse(sens) {
    if (!partie) return;
    partie.iv = Math.max(0, Math.min(D.temps.vitesses.length - 1, partie.iv + sens));
    AUDIO.jouer('clic');
    majHud();
  }
  var SON_OUI = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  var SON_NON = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2"/></svg>';
  function majBoutonSon() {
    document.querySelectorAll('[data-son]').forEach(function (b) {
      b.innerHTML = prog.options.son ? SON_OUI : SON_NON;
      b.setAttribute('aria-label', t(prog.options.son ? 'ui.couperSon' : 'ui.remettreSon'));
      b.setAttribute('aria-pressed', prog.options.son ? 'false' : 'true');
    });
  }
  function basculerSon() {
    prog.options.son = !prog.options.son;
    AUDIO.couper(!prog.options.son);
    if (prog.options.son) { AUDIO.demarrer(); AUDIO.jouer('clic'); }
    majBoutonSon();
    sauverProg();
  }
  $('b-son').setAttribute('data-son', '1');

  // ------------------------------------------------------------------------
  // Menu de construction
  // ------------------------------------------------------------------------
  var ICONES_CAT = {
    logement: '<path d="M4 12l8-7 8 7v8H4z" fill="#e8d8b6" stroke="#8f3c27" stroke-width="1.6"/><path d="M2 12l10-9 10 9" fill="none" stroke="#b9573a" stroke-width="2.4"/><rect x="10" y="14" width="4" height="6" fill="#8a5a32"/>',
    deblaiement: '<path d="M6 4l14 14-2 2L4 6z" fill="#8a5a32"/><path d="M3 3l6 2-4 4z" fill="#9aa0a6" stroke="#555"/><circle cx="17" cy="7" r="4" fill="#4d7d33"/>',
    routes: '<path d="M8 3h8l4 18H4z" fill="#c9bfa8" stroke="#7c735f"/><path d="M12 5v3M12 11v3M12 17v3" stroke="#fff" stroke-width="2"/>',
    eau: '<path d="M12 3c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z" fill="#4a86c0" stroke="#2c5f8f"/><path d="M9 15a3 3 0 0 0 3 3" stroke="#cfe6ff" stroke-width="1.6" fill="none"/>',
    alimentation: '<path d="M12 21V8" stroke="#8a6414" stroke-width="2"/><ellipse cx="9" cy="8" rx="2.2" ry="4" fill="#e0bf52"/><ellipse cx="15" cy="8" rx="2.2" ry="4" fill="#e0bf52"/><ellipse cx="12" cy="5" rx="2.2" ry="3.6" fill="#f0cf72"/><ellipse cx="9" cy="14" rx="2.2" ry="3.6" fill="#d9a93a"/><ellipse cx="15" cy="14" rx="2.2" ry="3.6" fill="#d9a93a"/>',
    industrie: '<rect x="3" y="10" width="18" height="10" fill="#a8743f" stroke="#5b3a22"/><path d="M6 10V5h3v5M14 10V7h3v3" fill="#777"/>',
    sante: '<rect x="4" y="4" width="16" height="16" rx="4" fill="#fff" stroke="#b03a2e" stroke-width="1.6"/><path d="M12 7v10M7 12h10" stroke="#b03a2e" stroke-width="3"/>',
    religion: '<path d="M3 9l9-5 9 5z" fill="#f1ece2" stroke="#8a7a60"/><path d="M5 9v9M9 9v9M15 9v9M19 9v9" stroke="#e2d8c4" stroke-width="2.4"/><rect x="3" y="18" width="18" height="3" fill="#d9cdb5"/><circle cx="12" cy="7" r="1.4" fill="#d9a93a"/>',
    education: '<path d="M4 6h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z" fill="#efe2c4" stroke="#5b4a3a"/><path d="M20 6h-7v14a2 2 0 0 1 2-2h5z" fill="#e8d8b6" stroke="#5b4a3a"/>',
    divertissement: '<path d="M4 5h9v6a4.5 4.5 0 0 1-9 0z" fill="#f6f0e0" stroke="#5b4a3a"/><path d="M11 10h9v6a4.5 4.5 0 0 1-9 0z" fill="#d65a8c" stroke="#5b4a3a"/><circle cx="7" cy="8" r="1" fill="#333"/><circle cx="10" cy="8" r="1" fill="#333"/>',
    administration: '<path d="M3 9l9-6 9 6z" fill="#5a7397"/><path d="M5 9v9M9 9v9M15 9v9M19 9v9" stroke="#e6e0d2" stroke-width="2.4"/><rect x="3" y="18" width="18" height="3" fill="#5a7397"/>',
    securite: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="#b03a2e" stroke="#6e1f17"/><path d="M12 8c2 2.5 3 4 3 5.5a3 3 0 0 1-6 0c0-1.5 1-3 3-5.5z" fill="#f8d24a"/>',
    militaire: '<path d="M4 20L18 4" stroke="#6e4a2c" stroke-width="2"/><path d="M17 3l4 0-1 4z" fill="#c8ccd2"/><rect x="5" y="7" width="10" height="13" rx="2" fill="#b8392c" stroke="#6e1f17"/><circle cx="10" cy="13.5" r="2" fill="#e0c070"/>'
  };
  var categorieOuverte = null;
  // Bâtiments permis : ceux de la mission, ou tous en construction libre.
  var TOUS = Object.keys(D.batiments).filter(function (k) { return D.batiments[k].categorie; });
  function permis() { return partie.e.tout ? TOUS : partie.m.batiments; }
  function permet(k) { return permis().indexOf(k) >= 0; }
  function categoriesMission() {
    var l = permis();
    return D.categories.filter(function (c) { return l.some(function (b) { return D.batiments[b].categorie === c; }); });
  }
  function construireMenu() {
    var nav = $('menu-cat');
    vider(nav);
    categoriesMission().forEach(function (c) {
      var b = el('button', { classe: 'cat', 'data-cat': c, aria: t('cat.' + c), title: t('cat.' + c) });
      b.innerHTML = '<svg viewBox="0 0 24 24">' + ICONES_CAT[c] + '</svg>';
      b.addEventListener('click', function () { AUDIO.demarrer(); AUDIO.jouer('menu'); ouvrirCategorie(categorieOuverte === c ? null : c); });
      nav.appendChild(b);
    });
    ouvrirCategorie(null);
  }
  function ouvrirCategorie(c) {
    categorieOuverte = c;
    document.querySelectorAll('.cat').forEach(function (b) { b.classList.toggle('actif', b.dataset.cat === c); });
    var sm = $('sous-menu');
    if (!c) { sm.hidden = true; return; }
    vider(sm);
    sm.appendChild(el('h3', { texte: t('cat.' + c) }));
    permis().filter(function (k) { return D.batiments[k].categorie === c; }).forEach(function (k) {
      var d = D.batiments[k], ouvert = partie.e.debloques.indexOf(k) >= 0;
      var cout = k === 'deblayer' ? t('outil.parCase', { n: nb(d.cout) }) : nb(d.cout);
      var b = el('button', { classe: 'choix' + (ouvert ? '' : ' verrou') + (outil && outil.type === k ? ' actif' : ''), 'data-bat': k }, [
        DS.vignette(k, 44), el('span', { classe: 'nom', texte: t('bat.' + k + '.nom') }), el('span', { classe: 'cout', texte: cout })
      ]);
      b.addEventListener('click', function () {
        AUDIO.demarrer();
        if (!ouvert) { AUDIO.jouer('refus'); toast(t('outil.verrouille')); return; }
        AUDIO.jouer('menu');
        choisirOutil(k);
      });
      sm.appendChild(b);
    });
    sm.hidden = false;
  }

  // ------------------------------------------------------------------------
  // Outil de construction : aperçu vert ou rouge, coût, validation
  // ------------------------------------------------------------------------
  var outil = null; // { type, d, a, b, actif (tracé en cours), attente (mobile : Valider / Annuler) }
  function choisirOutil(type) {
    outil = { type: type, d: D.batiments[type], a: null, b: null, actif: false, attente: false };
    ouvrirCategorie(null);
    fermerPanneau();
    $('valider').hidden = true;
    toast(t(estTactile ? 'outil.aideTactile' : 'outil.aideSouris', { nom: t('bat.' + type + '.nom') }));
  }
  function annulerOutil() {
    outil = null;
    rendu.apercu = null;
    $('valider').hidden = true;
    $('bulle').hidden = true;
  }
  function casesOutil() {
    if (!outil || !outil.b) return [];
    var a = outil.a || outil.b, b = outil.b, l = [], x, y;
    var trace = outil.d.trace;
    if (trace === 'ligne') {
      // Tracé en L : d'abord le plus long côté.
      var dx = b[0] - a[0], dy = b[1] - a[1];
      x = a[0]; y = a[1]; l.push([x, y]);
      if (Math.abs(dx) >= Math.abs(dy)) {
        while (x !== b[0]) { x += dx > 0 ? 1 : -1; l.push([x, y]); }
        while (y !== b[1]) { y += dy > 0 ? 1 : -1; l.push([x, y]); }
      } else {
        while (y !== b[1]) { y += dy > 0 ? 1 : -1; l.push([x, y]); }
        while (x !== b[0]) { x += dx > 0 ? 1 : -1; l.push([x, y]); }
      }
      return l;
    }
    if (trace === 'zone') {
      for (y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) for (x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) l.push([x, y]);
      return l;
    }
    var tt = outil.d.taille, o = Math.floor((tt - 1) / 2);
    return [[b[0] - o, b[1] - o]];
  }
  function deblayable(e, x, y) {
    if (x < 0 || y < 0 || x >= e.N || y >= e.N) return false;
    var i = y * e.N + x;
    if (e.bat[i]) { var b = SIM.batiment(e, e.bat[i]); return b && b.type !== 'incendie'; }
    return (e.route[i] && e.route[i] !== SIM.R.ROME) || e.aqueduc[i] || e.terrain[i] === SIM.T.ARBRES;
  }
  function majApercu(sx, sy) {
    if (!outil || !partie) return;
    var e = partie.e, cases = casesOutil(), n = 0, raison = null;
    var l = cases.map(function (c) {
      var ok;
      if (outil.type === 'deblayer') ok = deblayable(e, c[0], c[1]);
      else { var r = SIM.peutPlacer(e, outil.type, c[0], c[1]); ok = r === null; if (r && !raison) raison = r; }
      if (ok) n++;
      return { x: c[0], y: c[1], ok: ok };
    });
    rendu.apercu = { type: outil.type, zone: outil.d.trace === 'zone' || outil.d.trace === 'ligne', cases: l };
    var cout = n * outil.d.cout;
    var bulle = $('bulle');
    bulle.textContent = n ? t('outil.cout', { n: nb(cout) }) : t('refus.' + (raison || 'rien'));
    if (sx !== undefined) { bulle.style.left = Math.min(W - 160, sx + 18) + 'px'; bulle.style.top = Math.max(50, sy - 34) + 'px'; }
    bulle.hidden = false;
    $('v-cout').textContent = t('outil.cout', { n: nb(cout) });
    return n;
  }
  function validerOutil() {
    if (!outil || !partie) return;
    var cases = casesOutil();
    if (!cases.length) return;
    var c = cases.length === 1 && !outil.d.trace ? { type: 'poser', bat: outil.type, x: cases[0][0], y: cases[0][1] } : { type: 'tracer', bat: outil.type, cases: cases };
    var r = commander(c);
    if (r.ok) {
      AUDIO.jouer(outil.type === 'route' || outil.type === 'aqueduc' ? 'route' : outil.type === 'deblayer' ? 'detruire' : 'poser');
      if (outil.type !== 'deblayer') { partie.derniere = Date.now(); $('b-annuler-derniere').hidden = !$('valider').hidden ? true : false; }
    } else {
      AUDIO.jouer('refus');
      toast(t('refus.' + (r.raison || 'rien')));
    }
    outil.a = null; outil.actif = false; outil.attente = false;
    $('valider').hidden = true;
    if (estTactile) { rendu.apercu = null; $('bulle').hidden = true; }
    else majApercu();
    if (!partie.derniere) $('b-annuler-derniere').hidden = true;
    else $('b-annuler-derniere').hidden = false;
  }
  function annulerDerniere() {
    if (!partie || !partie.derniere) return;
    var r = commander({ type: 'annuler' });
    if (r.ok) { AUDIO.jouer('pieces'); toast(t('outil.annule', { n: nb(-r.cout) })); }
    partie.derniere = 0;
    $('b-annuler-derniere').hidden = true;
  }

  // ------------------------------------------------------------------------
  // Saisie : souris, doigt, clavier
  // ------------------------------------------------------------------------
  var pts = new Map(), pince = null, appuiLong = null, glisse = null, sourisCase = null, sourisEcran = [0, 0];
  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  canvas.addEventListener('pointerdown', function (ev) {
    AUDIO.demarrer();
    if (!partie || partie.figee) return;
    var p = local(ev);
    canvas.setPointerCapture(ev.pointerId);
    pts.set(ev.pointerId, { x: p[0], y: p[1], x0: p[0], y0: p[1], t0: Date.now(), type: ev.pointerType, bouton: ev.button });
    if (pts.size === 2) {
      // Deux doigts : déplacer et pincer, avec ou sans outil.
      clearTimeout(appuiLong);
      if (outil) { outil.actif = false; if (!outil.attente) rendu.apercu = null; }
      var l = Array.from(pts.values());
      pince = { d: Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y), mx: (l[0].x + l[1].x) / 2, my: (l[0].y + l[1].y) / 2 };
      glisse = null;
      return;
    }
    if (ev.pointerType === 'mouse' && ev.button === 2) {
      if (outil) annulerOutil(); else ouvrirInfo(p[0], p[1]);
      return;
    }
    var c = rendu.versCase(p[0], p[1]);
    if (outil && ev.button === 0) {
      if (outil.attente) { outil.attente = false; $('valider').hidden = true; }
      if (c) { outil.a = c; outil.b = c; outil.actif = true; majApercu(p[0], p[1]); }
      return;
    }
    glisse = { x: p[0], y: p[1], cx: rendu.cam.x, cy: rendu.cam.y, bouge: false };
    if (ev.pointerType !== 'mouse') {
      clearTimeout(appuiLong);
      appuiLong = setTimeout(function () { if (glisse && !glisse.bouge) { glisse = null; ouvrirInfo(p[0], p[1]); } }, 480);
    }
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!partie || partie.figee) return;
    var p = local(ev);
    sourisEcran = p;
    var q = pts.get(ev.pointerId);
    if (q) { q.x = p[0]; q.y = p[1]; }
    if (pince && pts.size >= 2) {
      var l = Array.from(pts.values());
      var d = Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y), mx = (l[0].x + l[1].x) / 2, my = (l[0].y + l[1].y) / 2;
      rendu.cam.x -= (mx - pince.mx) / rendu.cam.z; rendu.cam.y -= (my - pince.my) / rendu.cam.z; rendu.limiter();
      pince.mx = mx; pince.my = my;
      // Zoom progressif : il suit l'écart des deux doigts, centré entre eux.
      if (pince.d > 0 && d > 0) rendu.zoomerVers(rendu.cam.z * d / pince.d, mx, my);
      pince.d = d;
      return;
    }
    if (outil) {
      var c = rendu.versCase(p[0], p[1]);
      if (!c) return;
      if (outil.actif) { outil.b = c; majApercu(p[0], p[1]); }
      else if (ev.pointerType === 'mouse' && !outil.attente) { outil.a = null; outil.b = c; majApercu(p[0], p[1]); }
      return;
    }
    if (glisse && q) {
      var dx = p[0] - glisse.x, dy = p[1] - glisse.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) { glisse.bouge = true; clearTimeout(appuiLong); }
      if (glisse.bouge) { rendu.cam.x = glisse.cx - dx / rendu.cam.z; rendu.cam.y = glisse.cy - dy / rendu.cam.z; rendu.limiter(); }
    }
  });
  function finPointeur(ev) {
    var q = pts.get(ev.pointerId);
    pts.delete(ev.pointerId);
    if (pts.size < 2) pince = null;
    clearTimeout(appuiLong);
    if (!partie || !q) return;
    if (outil && outil.actif) {
      outil.actif = false;
      if (q.type === 'mouse') validerOutil();
      else { outil.attente = true; $('valider').hidden = false; $('b-annuler-derniere').hidden = true; majApercu(); }
      return;
    }
    if (glisse && !glisse.bouge && Date.now() - q.t0 < 450 && ordreCohorte) { glisse = null; donnerOrdre(q.x, q.y); return; }
    if (glisse && !glisse.bouge && Date.now() - q.t0 < 450) {
      // Toucher bref : ferme le panneau ouvert ; à la souris, un clic ouvre l'information.
      if (q.type === 'mouse' && q.bouton === 0) ouvrirInfo(q.x, q.y);
      else if (!$('panneau').hidden) fermerPanneau();
      else ouvrirCategorie(null);
    }
    glisse = null;
  }
  canvas.addEventListener('pointerup', finPointeur);
  canvas.addEventListener('pointercancel', finPointeur);
  canvas.addEventListener('pointerleave', function () { if (outil && !outil.actif && !outil.attente) { rendu.apercu = null; $('bulle').hidden = true; } });
  // Molette ou pavé tactile : zoom progressif autour du pointeur.
  canvas.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    if (!partie) return;
    var p = local(ev), pas = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
    rendu.zoomerVers(rendu.cam.z * Math.exp(-Math.max(-120, Math.min(120, pas)) * 0.0018), p[0], p[1]);
  }, { passive: false });

  // Mini-carte : toucher ou cliquer pour s'y rendre.
  function surMini(ev) {
    var r = mini.getBoundingClientRect(), p = local(ev);
    var ox = pivote ? r.top : r.left, oy = pivote ? window.innerWidth - r.right : r.top;
    var lx = (p[0] - ox) * mini.width / mini.offsetWidth, ly = (p[1] - oy) * mini.height / mini.offsetHeight;
    rendu.miniVersMonde(lx, ly);
    rendu.dessinerMiniCarte(mini);
  }
  mini.addEventListener('pointerdown', function (ev) { mini.setPointerCapture(ev.pointerId); surMini(ev); });
  mini.addEventListener('pointermove', function (ev) { if (ev.buttons || ev.pointerType !== 'mouse') surMini(ev); });

  // Clavier : flèches, P ou Échap (pause), + et − (vitesse), R (rotation).
  window.addEventListener('keydown', function (ev) {
    AUDIO.demarrer();
    var c = ev.code;
    if (c === 'Escape' && ordreCohorte) { finirOrdre(); return; }
    if (c === 'Escape') {
      ev.preventDefault();
      if (!partie) return;
      if (outil) { annulerOutil(); return; }
      if (!$('panneau').hidden) { fermerPanneau(); return; }
      if (ecran.childNodes.length) { if (ecran.dataset.retour) ecranRetour(); return; }
      ecranPause();
      return;
    }
    if (!partie || ecran.childNodes.length) return;
    if (c === 'KeyP') { ev.preventDefault(); ecranPause(); }
    else if (c === 'Equal' || c === 'NumpadAdd') changerVitesse(1);
    else if (c === 'Minus' || c === 'NumpadSubtract') changerVitesse(-1);
    else if (c === 'KeyR') { rendu.pivoter(ev.shiftKey ? -1 : 1); AUDIO.jouer('clic'); }
    else if (c === 'PageUp') rendu.zoomer(1);
    else if (c === 'PageDown') rendu.zoomer(-1);
    else if (c === 'Space') { ev.preventDefault(); partie.iv = partie.iv ? 0 : D.temps.vitesseDepart; majHud(); }
    else if (/^Arrow/.test(c) || c === 'KeyW' || c === 'KeyA' || c === 'KeyS' || c === 'KeyD') { ev.preventDefault(); touches[c] = 1; }
  });
  window.addEventListener('keyup', function (ev) { delete touches[ev.code]; });
  function deplacerCamera(dt) {
    if (!partie || partie.figee || ecran.childNodes.length) return;
    var v = (240 + prog.options.defilement * 160) * dt / 1000 / rendu.cam.z, dx = 0, dy = 0;
    if (touches.ArrowLeft || touches.KeyA) dx -= v;
    if (touches.ArrowRight || touches.KeyD) dx += v;
    if (touches.ArrowUp || touches.KeyW) dy -= v;
    if (touches.ArrowDown || touches.KeyS) dy += v;
    // Bords de l'écran (souris seulement), si l'option de défilement n'est pas à zéro.
    if (!estTactile && prog.options.defilement > 0 && document.hasFocus && document.hasFocus() && sourisEcran[0] > 0) {
      var m = 6;
      if (sourisEcran[0] < m) dx -= v; else if (sourisEcran[0] > W - m) dx += v;
      if (sourisEcran[1] < m) dy -= v; else if (sourisEcran[1] > H - m) dy += v;
    }
    if (dx || dy) { rendu.cam.x += dx; rendu.cam.y += dy; rendu.limiter(); }
  }
  document.addEventListener('mouseleave', function () { sourisEcran = [-1, -1]; });

  // Boutons de la barre.
  $('b-menu').addEventListener('click', function () { AUDIO.jouer('clic'); ecranPause(); });
  $('b-lent').addEventListener('click', function () { changerVitesse(-1); });
  $('b-vite').addEventListener('click', function () { changerVitesse(1); });
  $('b-tourner').addEventListener('click', function () { rendu.pivoter(1); AUDIO.jouer('clic'); });
  $('b-zoomm').addEventListener('click', function () { rendu.zoomer(-1); AUDIO.jouer('clic'); });
  $('b-zoomp').addEventListener('click', function () { rendu.zoomer(1); AUDIO.jouer('clic'); });
  $('b-son').addEventListener('click', basculerSon);
  $('b-conseil').addEventListener('click', function () { AUDIO.jouer('menu'); ouvrirConseil(); });
  $('b-journal').addEventListener('click', function () { AUDIO.jouer('menu'); ouvrirJournal(); });
  $('b-calque').addEventListener('click', function () { AUDIO.jouer('menu'); ouvrirCalques(); });
  $('b-ok').addEventListener('click', function () { validerOutil(); });
  $('b-ordre-annul').addEventListener('click', function () { AUDIO.jouer('clic'); finirOrdre(); });
  $('b-annul').addEventListener('click', function () { AUDIO.jouer('clic'); if (outil) { outil.attente = false; outil.a = null; rendu.apercu = null; } $('valider').hidden = true; $('bulle').hidden = true; });
  $('b-annuler-derniere').addEventListener('click', annulerDerniere);

  // ------------------------------------------------------------------------
  // Bulles d'information
  // ------------------------------------------------------------------------
  function toast(texte, critique) {
    var b = el('div', { classe: 'toast' + (critique ? ' critique' : ''), texte: texte });
    var z = $('toasts');
    z.appendChild(b);
    while (z.childNodes.length > 3) z.removeChild(z.firstChild);
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, critique ? 5000 : 3200);
  }

  // ------------------------------------------------------------------------
  // Panneaux : information, conseiller, journal, calques
  // ------------------------------------------------------------------------
  var panneauVivant = null;
  function ouvrirPanneau(remplir) {
    var p = $('panneau');
    panneauVivant = function () { var h = p.scrollTop; vider(p); p.appendChild(el('button', { classe: 'ico fermer', aria: t('info.fermer'), clic: fermerPanneau, texte: '✕' })); remplir(p); p.scrollTop = h; };
    panneauVivant();
    p.hidden = false;
    ouvrirCategorie(null);
  }
  function fermerPanneau() { $('panneau').hidden = true; panneauVivant = null; rendu.selection = 0; }
  // « Nom : valeur » selon la typographie de la langue (espace avant les deux-points en français seulement).
  function deuxPoints(a, b) { return t('ui.deuxPoints', { a: a, b: b }); }
  // Nom commun (bien, lieu de culture) au milieu d'une phrase : en minuscules, sauf en allemand.
  function enPhrase(s) { var l = document.documentElement.lang || 'fr'; return /^de/.test(l) ? s : s.toLocaleLowerCase(l); }
  // Texte d'un message du journal : les variables qui sont des identifiants (cité, bien, dieu,
  // bâtiment) sont traduites ; une demande dit ce qu'elle réclame.
  function texteMsg(m) {
    var v = {}, k;
    for (k in m.vars) v[k] = m.vars[k];
    if (v.bien !== undefined && v.n !== undefined && /^msg\.demande/.test(m.cle)) v.quoi = v.bien ? t('demande.charges', { n: v.n, bien: enPhrase(t('bien.' + v.bien)) }) : t('demande.deniers', { n: nb(v.n) });
    else if (v.bien) v.bien = enPhrase(t('bien.' + v.bien));
    if (v.cite) v.cite = t('cite.' + v.cite);
    if (v.dieu) v.dieu = t('dieu.' + v.dieu);
    if (v.faction) v.faction = t('faction.' + v.faction);
    if (v.bat) v.bat = t('bat.' + v.bat + '.nom');
    if (v.montant !== undefined) v.montant = nb(v.montant);
    if (v.mois !== undefined) v.n = v.mois; // pluriels des messages qui comptent des mois
    return t(m.cle, v);
  }
  function nomBien(g, suite) {
    return el('span', { classe: 'nom-bien' }, [DS.imageBien(g, 24), t('bien.' + g) + (suite || '')]);
  }
  function ligne(a, b) { return el('div', { classe: 'ligne' }, [el('span', { texte: a }), el('strong', { texte: b })]); }
  function jauge(f) { var j = el('div', { classe: 'jauge' }, [el('i')]); j.firstChild.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; return j; }

  function ouvrirInfo(sx, sy) {
    if (!partie) return;
    var c = rendu.versCase(sx, sy);
    if (!c) return;
    var e = partie.e, b = SIM.batA(e, c[0], c[1]);
    AUDIO.jouer('menu');
    var un = null;
    (e.unites || []).forEach(function (u) { if (!un && !u.mort && u.etat === 'champ' && Math.abs(u.i % e.N - c[0]) <= 1 && Math.abs(Math.floor(u.i / e.N) - c[1]) <= 1) un = u; });
    if (un && un.c === 0) { var fid = un.f; rendu.selection = fid; ouvrirPanneau(function (p) { remplirBatiment(p, fid); }); return; }
    if (un) { var uid = un.id; ouvrirPanneau(function (p) { remplirUnite(p, uid); }); return; }
    if (b) { rendu.selection = b.id; ouvrirPanneau(function (p) { remplirBatiment(p, b.id); }); return; }
    // Marcheur proche (une case).
    var w = null;
    for (var k = 0; k < e.marcheurs.length; k++) { var m = e.marcheurs[k]; if (Math.abs(m.x - c[0]) <= 1 && Math.abs(m.y - c[1]) <= 1) { w = m; break; } }
    if (w) { var id = w.id; ouvrirPanneau(function (p) { remplirMarcheur(p, id); }); return; }
    ouvrirPanneau(function (p) { remplirTerrain(p, c[0], c[1]); });
  }

  function nomBat(b) { return b.type === 'logement' ? t(b.hab > 0 ? 'maison.n' + b.niv : 'maison.vague') : t('bat.' + b.type + '.nom'); }
  function besoinTexte(k, v) {
    if (k === 'eau') return t(v >= 2 ? 'besoin.eau2' : 'besoin.eau1');
    if (k === 'attractivite' || k === 'place') return t('besoin.' + k, { n: v });
    if (k === 'nourriture' || k === 'religion') return t('besoin.' + k, { n: v });
    if (k === 'divertissement') return t('besoin.divertissement', { n: v });
    return t('besoin.' + k);
  }
  function remplirBatiment(p, id) {
    var e = partie.e, b = SIM.batiment(e, id);
    if (!b) { p.appendChild(el('p', { texte: t('info.disparu') })); return; }
    var d = D.batiments[b.type];
    p.appendChild(el('h2', { texte: nomBat(b) }));
    if (b.type === 'logement') return remplirMaison(p, b);
    if (t('bat.' + b.type + '.aide')) p.appendChild(el('p', { texte: t('bat.' + b.type + '.aide') }));
    var cause = SIM.cause(e, b);
    if (d.genre !== 'ruines' && d.genre !== 'incendie') p.appendChild(el('p', { classe: cause ? 'etat-ko' : 'etat-ok', texte: cause ? t('info.arret', { cause: t('cause.' + cause) }) : t('info.enService') }));
    if (d.effectif) p.appendChild(ligne(t('info.effectif'), t('info.surTotal', { n: b.eff, max: d.effectif })));
    if (d.genre === 'ferme' || d.genre === 'extraction' || d.genre === 'atelier') {
      p.appendChild(ligne(t('info.production') + ' · ' + t('bien.' + d.produit), nb(Math.min(100, b.prog / 100)) + ' %'));
      p.appendChild(jauge(b.prog / 10000));
    }
    if (d.genre === 'atelier') p.appendChild(ligne(t('info.matiere') + ' · ' + t('bien.' + d.matiere), t('info.surTotal', { n: nb(b.mat / 100), max: D.regles.atelier.attenteMax })));
    if (d.genre === 'peche') { p.appendChild(ligne(t('info.bateau'), t(b.mb ? 'info.enMer' : 'info.auQuai'))); if (b.stock >= 1) p.appendChild(ligne(t('bien.poisson'), t('info.charges', { n: 1 }))); }
    if (d.genre === 'quai') {
      var nv = b.nav ? SIM.marcheur(e, b.nav) : null;
      if (nv && nv.phase === 'quai') {
        p.appendChild(ligne(t('info.navire'), t('cite.' + nv.cite)));
        p.appendChild(ligne(t('info.charges0'), t('info.surTotal', { n: nv.n, max: D.regles.commerce.navireCharges })));
        p.appendChild(ligne(t('info.joursQuai'), t('info.surTotal', { n: nv.jours, max: D.regles.commerce.navireJours })));
      } else p.appendChild(ligne(t('info.navire'), t(nv ? 'info.navireArrive' : 'info.aucunNavire')));
      p.appendChild(ligne(t('info.dockers'), nb((b.dk || []).length)));
    }
    if (d.genre === 'ecole_art') { p.appendChild(ligne(t('info.formation') + ' · ' + t('marcheur.' + d.forme), nb(b.prog / 100) + ' %')); p.appendChild(jauge(b.prog / 10000)); }
    if (d.genre === 'grenier') {
      p.appendChild(ligne(t('info.stockTotal'), t('info.surTotal', { n: nb(SIM.totalStock(b) / 100), max: nb(D.regles.grenier.capacite / 100) })));
      p.appendChild(jauge(SIM.totalStock(b) / D.regles.grenier.capacite));
      p.appendChild(el('h3', { texte: t('info.consigne') }));
      D.aliments.forEach(function (g) { p.appendChild(ligneDepot(b, g, false)); });
      p.appendChild(el('p', { classe: 'aide', texte: t('consigne.aide') }));
    }
    if (d.genre === 'entrepot') {
      var occ = SIM.emplacements(b).filter(Boolean).length;
      p.appendChild(ligne(t('info.emplacements'), t('info.surTotal', { n: occ, max: D.regles.entrepot.emplacements })));
      p.appendChild(jauge(occ / D.regles.entrepot.emplacements));
      p.appendChild(el('div', { classe: 'ligne bien entete' }, [el('span', { texte: t('info.produits') }), el('span', { texte: t('info.consigne') }), el('span', { texte: t('info.plafond') })]));
      // Biens présents ou réglés d'abord, puis les autres (tous les biens peuvent y entrer).
      var liste = D.listeBiens.slice().sort(function (x, y) { return poidsBien(b, y) - poidsBien(b, x) || D.listeBiens.indexOf(x) - D.listeBiens.indexOf(y); });
      liste.forEach(function (g) { p.appendChild(ligneDepot(b, g, true)); });
      p.appendChild(el('p', { classe: 'aide', texte: t('consigne.aide') }));
    }
    if (d.genre === 'marche') {
      // Étals du marché en vignettes : image du bien, quantité, jauge jusqu'au seuil d'achat,
      // liseré doré quand les maisons le réclament (demande du propriétaire du 25 novembre 2026).
      p.appendChild(el('h3', { texte: t('info.produits') }));
      var grille = el('div', { classe: 'stock-grille' });
      D.aliments.concat(BIENS_MAISONS).forEach(function (g) {
        var interdit = !!b.interdits[g], q = b.stocks[g] || 0, demande = b.dem[g] > 0;
        var seuil = D.aliments.indexOf(g) >= 0 ? D.regles.marche.seuilAchat : D.regles.marche.seuilBien;
        var cs = el('div', { classe: 'stock-case' + (interdit ? ' interdit' : '') + (demande ? ' demande' : '') + (q > 0 ? '' : ' vide') }, [
          DS.imageBien(g, 40),
          el('span', { classe: 'nom', texte: t('bien.' + g) }),
          el('strong', { texte: interdit ? t('info.interdit') : t('info.unites', { n: q }) }),
          interdit ? null : jauge(q / seuil),
          demande ? el('span', { classe: 'badge', title: t('info.demande'), texte: t('info.reclame') }) : null,
          el('button', { classe: 'mini', aria: deuxPoints(t('bien.' + g), t(interdit ? 'info.autoriser' : 'info.interdire')), clic: function () { AUDIO.jouer('clic'); commander({ type: 'interdit', id: b.id, bien: g, valeur: !interdit }); if (panneauVivant) panneauVivant(); }, texte: t(interdit ? 'info.autoriser' : 'info.interdire') })
        ]);
        grille.appendChild(cs);
      });
      p.appendChild(grille);
    }
    if (d.genre === 'spectacle') {
      d.artistes.forEach(function (a) {
        var n = b.spects[a] || 0;
        p.appendChild(el('p', { classe: n > 0 ? 'ok' : 'ko', texte: n > 0 ? t('info.artiste', { artiste: t('marcheur.' + a), n: n }) : t('info.sansArtiste', { artiste: t('marcheur.' + a) }) }));
      });
      p.appendChild(ligne(t('info.points'), nb(SIM.pointsSpectacle(b))));
    }
    if (d.eauRequise) p.appendChild(ligne(t('info.canalisations'), t(b.actif ? 'ui.oui' : 'ui.non')));
    if (d.genre === 'reservoir') p.appendChild(ligne(t('info.reservoir'), t(b.plein ? 'info.plein' : 'info.vide')));
    if (d.genre === 'incendie') p.appendChild(ligne(t('info.brule'), t('info.jours', { n: b.jours })));
    remplirLot4(p, e, b, d);
    if (partie.e.risques) lignesRisques(p, b);
  }
  // Biens que les maisons peuvent réclamer au marché (lot 2 : poterie, mobilier, huile).
  var BIENS_MAISONS = [];
  D.maisons.forEach(function (m) { (m.biensVoulus || []).forEach(function (g) { if (BIENS_MAISONS.indexOf(g) < 0) BIENS_MAISONS.push(g); }); });
  function poidsBien(b, g) { return (b.stocks[g] || 0) + (b.cons[g] ? 1 : 0) + (b.plaf && b.plaf[g] ? 1 : 0); }
  // Ligne d'un produit dans un dépôt : quantité, consigne (touchée : la suivante), plafond.
  function ligneDepot(b, g, avecPlafond) {
    var C = D.regles.consignes, c = SIM.consigne(b, g);
    var l = el('div', { classe: 'ligne bien' }, [
      nomBien(g),
      el('strong', { texte: t('info.charges', { n: Math.round((b.stocks[g] || 0) / 10) / 10 }) }), // nombre brut : le module choisit le pluriel et le met en forme
      el('button', { classe: 'mini c-' + c, aria: deuxPoints(t('info.consigne'), t('consigne.' + c)), clic: function () {
        AUDIO.jouer('clic'); commander({ type: 'consigne', id: b.id, bien: g, valeur: C[(C.indexOf(c) + 1) % C.length] }); if (panneauVivant) panneauVivant();
      }, texte: t('consigne.' + c) })
    ]);
    if (avecPlafond) {
      var q = b.plaf[g] || D.regles.entrepot.plafondDepart;
      l.appendChild(el('button', { classe: 'mini', aria: deuxPoints(t('info.plafond'), t('plafond.' + q)), clic: function () {
        AUDIO.jouer('clic'); commander({ type: 'plafond', id: b.id, bien: g, valeur: q % 4 + 1 }); if (panneauVivant) panneauVivant();
      }, texte: t('plafond.' + q) }));
    }
    return l;
  }
  function remplirMaison(p, h) {
    var e = partie.e, inf = SIM.infosMaison(e, h);
    if (h.hab <= 0) { p.appendChild(el('p', { texte: t('info.terrainVague') })); return; }
    p.appendChild(ligne(t('info.habitants'), t('info.surTotal', { n: h.hab, max: SIM.capacite(h) })));
    var viv = 0; D.aliments.forEach(function (a) { viv += h.viv[a] || 0; });
    p.appendChild(ligne(t('info.reserve'), t('info.mois', { n: inf.conso ? Math.floor(viv * 10 / inf.conso) / 10 : 0 })));
    if (permet('forum')) p.appendChild(el('p', { classe: h.svc.impot > 0 ? 'ok' : 'ko', texte: t(h.svc.impot > 0 ? 'info.recensee' : 'info.nonRecensee') }));
    p.appendChild(ligne(t(inf.attractiviteActive ? 'info.attractivite' : 'info.attractiviteSans'), nb(inf.attractivite)));
    if (inf.biensVoulus.length) p.appendChild(ligne(t('info.biensReserve'), inf.biensVoulus.map(function (g) { return t('bien.' + g) + ' ' + nb(h.viv[g] || 0); }).join(' · ')));
    p.appendChild(el('h3', { texte: t('info.besoinsActuels') }));
    var actuels = D.maisons[h.niv - 1].besoinsCumul, aucun = true;
    Object.keys(actuels).forEach(function (k) {
      aucun = false;
      p.appendChild(el('p', { classe: (inf.satisfaits[k] || 0) >= actuels[k] ? 'ok' : 'ko', texte: besoinTexte(k, actuels[k]) }));
    });
    if (inf.attractiviteRequise !== null && inf.attractiviteRequise !== undefined) {
      aucun = false;
      p.appendChild(el('p', { classe: inf.attractivite >= inf.attractiviteRequise ? 'ok' : 'ko', texte: besoinTexte('attractivite', inf.attractiviteRequise) }));
    }
    if (aucun) p.appendChild(el('p', { texte: t('info.aucunBesoin') }));
    if (inf.suivant) {
      p.appendChild(el('h3', { texte: t('info.pourMonter', { niveau: t('maison.n' + inf.suivant) }) }));
      if (!inf.manque.length) p.appendChild(el('p', { classe: 'ok', texte: t('info.bientot') }));
      inf.manque.forEach(function (x) { p.appendChild(el('p', { classe: 'ko', texte: besoinTexte(x.besoin, x.requis) })); });
    }
    if ((h.crime || 0) >= 1) p.appendChild(ligne(t('info.crime'), t('info.surTotal', { n: Math.round(h.crime), max: 100 })));
    if (partie.e.risques) lignesRisques(p, h);
  }
  // Risque d'incendie et dommages, seulement si le bâtiment y est exposé (un puits, une statue ou
  // une tente pour les dommages n'affichent rien).
  function lignesRisques(p, b) {
    var tx = SIM.tauxRisques(b);
    if (tx.feu > 0) p.appendChild(ligne(t('info.risqueFeu'), nb(b.feu / 100) + ' %'));
    if (tx.dom > 0) p.appendChild(ligne(t('info.dommages'), nb(b.dom / 100) + ' %'));
  }
  function remplirMarcheur(p, id) {
    var e = partie.e, w = SIM.marcheur(e, id);
    if (!w) { p.appendChild(el('p', { texte: t('info.parti') })); return; }
    p.appendChild(el('h2', { texte: t('marcheur.' + w.type) }));
    p.appendChild(el('p', { texte: t('marcheur.' + w.type + '.aide') }));
    var o = w.o ? SIM.batiment(e, w.o) : null, c = w.cb ? SIM.batiment(e, w.cb) : null;
    p.appendChild(ligne(t('info.origine'), o ? nomBat(o) : t(w.type === 'immigrant' ? 'info.rome' : 'info.ailleurs')));
    var fam = D.marcheurs[w.type].famille;
    p.appendChild(ligne(t('info.destination'), c ? nomBat(c) : fam === 'errant' && !w.pompier ? t(w.retour ? 'info.retour' : 'info.tournee') : w.pompier ? t('info.versFeu') : t('info.sortie')));
    if (w.gens) p.appendChild(ligne(t('info.personnes'), nb(w.gens)));
    if (w.cite) { p.appendChild(ligne(t('info.cite'), t('cite.' + w.cite))); p.appendChild(ligne(t('info.charges0'), nb(w.n))); }
  }
  function remplirTerrain(p, x, y) {
    var e = partie.e, i = y * e.N + x, tt = e.terrain[i];
    var noms = ['terrain.herbe', 'terrain.prairie', 'terrain.arbres', 'terrain.rochers', 'terrain.eau'];
    p.appendChild(el('h2', { texte: e.route[i] ? t(e.route[i] === SIM.R.ROME ? 'terrain.rome' : e.route[i] === SIM.R.BARRIERE ? 'bat.barriere.nom' : e.route[i] === SIM.R.PLACE ? 'bat.place.nom' : 'bat.route.nom') : e.aqueduc[i] ? t('bat.aqueduc.nom') : t(noms[tt]) }));
    if (tt === SIM.T.PRAIRIE) p.appendChild(ligne(t('info.fertilite'), e.fertilite[i] + ' %'));
    if (e.route[i] === SIM.R.ROME) p.appendChild(el('p', { texte: t('terrain.romeAide') }));
    else if (e.route[i] === SIM.R.BARRIERE) p.appendChild(el('p', { texte: t('bat.barriere.aide') }));
    else p.appendChild(el('p', { texte: t(noms[tt] + 'Aide') }));
    if (e.eauFontaine[i] || e.eauPuits[i]) p.appendChild(el('p', { classe: 'ok', texte: t(e.eauFontaine[i] ? 'besoin.eau2' : 'besoin.eau1') }));
    p.appendChild(ligne(t(e.attractivite ? 'info.attractivite' : 'info.attractiviteSans'), nb(e.attract[i])));
  }

  // Conseillers (section 17.4, lot 2) : un onglet par domaine ; tout se lit dans l'état, seules
  // les flèches (salaire, impôt, priorités) envoient des commandes.
  var ONGLETS = ['chef', 'cotes', 'imperial', 'militaire', 'commerce', 'religion', 'travail', 'finances', 'population', 'sante', 'education', 'divertissement'];
  var ongletConseil = 'chef';
  function ouvrirConseil(onglet) {
    if (!partie) return;
    if (onglet) ongletConseil = onglet;
    ouvrirPanneau(function (p) {
      var e = partie.e;
      p.appendChild(el('h2', { texte: t('conseil.titre') }));
      var barre = el('div', { classe: 'onglets' }), liste = ongletsPartie(e);
      if (liste.indexOf(ongletConseil) < 0) ongletConseil = liste[0];
      liste.forEach(function (o) {
        barre.appendChild(el('button', { classe: 'onglet' + (o === ongletConseil ? ' actif' : ''), texte: t('conseil.onglet.' + o), clic: function () { AUDIO.jouer('clic'); ongletConseil = o; if (panneauVivant) panneauVivant(); } }));
      });
      p.appendChild(barre);
      // Sur un écran bas, les onglets tiennent sur une ligne qui défile (CSS) : la position est
      // gardée d'un rafraîchissement du panneau à l'autre et l'onglet actif reste visible.
      var act = barre.querySelector('.actif'), x0 = barre.offsetLeft;
      barre.scrollLeft = defilOnglets;
      if (act && (act.offsetLeft - x0 < barre.scrollLeft || act.offsetLeft - x0 + act.offsetWidth > barre.scrollLeft + barre.clientWidth)) barre.scrollLeft = act.offsetLeft - x0 - 8;
      defilOnglets = barre.scrollLeft;
      barre.addEventListener('scroll', function () { defilOnglets = barre.scrollLeft; });
      CONSEILLERS[ongletConseil](p, e);
    });
  }
  function couvertureLigne(p, c, k) {
    var n = 0;
    partie.e.batiments.forEach(function (b) { if (D.batiments[b.type].marcheur && D.marcheurs[D.batiments[b.type].marcheur].service === k) n++; });
    var part = c.pop ? c.svc[k].pop / c.pop : 0;
    p.appendChild(ligne(t('bat.' + k + '.nom') + ' · ' + t('conseil.batiments', { n: n }), t('conseil.couverture', { n: Math.round(part * 100) })));
    p.appendChild(jauge(part));
  }
  var CONSEILLERS = {
    travail: function (p, e) {
      p.appendChild(ligne(t('conseil.travailleurs'), nb(e.travailleurs)));
      p.appendChild(ligne(t('conseil.emplois'), t('info.surTotal', { n: nb(e.emplois), max: nb(e.emploisRequis) })));
      p.appendChild(ligne(t('conseil.chomage'), e.chomage + ' %'));
      p.appendChild(reglage(t('conseil.salaire', { n: e.salaire, rome: e.salaireRome }), function (s) { commander({ type: 'reglage', cle: 'salaire', valeur: e.salaire + s }); }));
      p.appendChild(el('h3', { texte: t('conseil.priorites') }));
      p.appendChild(el('p', { classe: 'aide', texte: t('conseil.prioritesAide') }));
      var tc = SIM.travailCategories(e);
      D.regles.travail.categories.forEach(function (c) {
        if (!tc[c].batiments) return;
        var pr = e.priorites[c] || 0;
        p.appendChild(ligne(t('travail.' + c), t('info.surTotal', { n: nb(tc[c].pourvus), max: nb(tc[c].requis) })));
        p.appendChild(jauge(tc[c].requis ? tc[c].pourvus / tc[c].requis : 0));
        p.appendChild(reglage(pr ? t('conseil.priorite', { n: pr }) : t('conseil.sansPriorite'), function (s) { commander({ type: 'priorite', categorie: c, valeur: Math.max(0, Math.min(9, pr + s)) }); }));
      });
    },
    finances: function (p, e) {
      p.appendChild(ligne(t('hud.tresor'), nb(e.tresor)));
      p.appendChild(reglage(t('conseil.impot', { n: e.impot }), function (s) { commander({ type: 'reglage', cle: 'impot', valeur: e.impot + s }); }));
      var an = e.finances.an, prec = e.finances.prec;
      // Postes de l'année en cours et de la précédente (section 11.1) ; un poste vide les deux années est tu.
      var poste = function (k) { if (an[k] || prec[k] || k === 'impots' || k === 'salaires') p.appendChild(ligne(t('budget.' + k), t('budget.deuxAns', { a: nb(an[k]), p: nb(prec[k]) }))); };
      p.appendChild(el('div', { classe: 'ligne entete' }, [el('span', { texte: t('conseil.recettes') }), el('span', { texte: t('budget.colonnes') })]));
      ['impots', 'exports', 'secours', 'dons'].forEach(poste);
      p.appendChild(el('h3', { texte: t('conseil.depenses') }));
      ['salaires', 'constructions', 'imports', 'tribut', 'interets', 'fetes', 'gouverneur', 'envois', 'vols'].forEach(poste);
      var solde = SIM.recettes(prec) - SIM.depenses(prec);
      if (prec.impots || prec.salaires) p.appendChild(el('p', { classe: solde >= 0 ? 'ok' : 'ko', texte: t(solde >= 0 ? 'budget.benefice' : 'budget.deficit', { n: nb(Math.abs(solde)) }) }));
    },
    population: function (p, e) {
      p.appendChild(ligne(t('hud.population'), nb(e.pop)));
      p.appendChild(ligne(t('conseil.places'), nb(SIM.placesLibres(e))));
      var der = e.histo[e.histo.length - 1];
      if (der) {
        p.appendChild(ligne(t('conseil.arrives'), nb(der.imm || 0)));
        p.appendChild(ligne(t('conseil.partis'), nb(der.emi || 0)));
        if (der.morts) p.appendChild(ligne(t('conseil.morts'), nb(der.morts)));
      }
      // Courbe des 24 derniers mois (dessin, sans texte).
      var h = e.histo.slice(-24);
      if (h.length > 1) {
        p.appendChild(el('h3', { texte: t('conseil.historique') }));
        var max = Math.max.apply(null, h.map(function (x) { return x.pop; })) || 1, pts = h.map(function (x, k) { return (k * 200 / (h.length - 1)).toFixed(1) + ',' + (58 - x.pop * 54 / max).toFixed(1); }).join(' ');
        var svg = el('div', { classe: 'courbe' });
        svg.innerHTML = '<svg viewBox="0 0 200 60" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="#d9a93a" stroke-width="2"/><line x1="0" y1="58" x2="200" y2="58" stroke="#8a7a60"/></svg>';
        p.appendChild(svg);
      }
      if (e.ages && e.pop) {
        // Pyramide des âges (lot 4) : une barre par tranche de 10 ans, les actifs en or.
        p.appendChild(el('h3', { texte: t('conseil.ages') }));
        var A = D.regles.ages, mx = Math.max.apply(null, e.ages) || 1, svgA = '<svg viewBox="0 0 200 ' + (e.ages.length * 9) + '" class="pyramide">';
        e.ages.forEach(function (v, k) {
          var y = (e.ages.length - 1 - k) * 9, l = v / mx * 120, actif = k >= A.actifs[0] && k <= A.actifs[1];
          svgA += '<rect x="' + (100 - l / 2).toFixed(1) + '" y="' + (y + 1) + '" width="' + l.toFixed(1) + '" height="7" fill="' + (actif ? '#d9a93a' : '#8a9aa8') + '"/>';
          svgA += '<text x="2" y="' + (y + 7.5) + '" font-size="7" fill="#3a2a1e">' + (k * A.anneesTranche) + '</text>';
        });
        var bp = el('div', { classe: 'courbe' }); bp.innerHTML = svgA + '</svg>'; p.appendChild(bp);
        p.appendChild(ligne(t('conseil.actifs'), Math.round(SIM.partActifs(e) * 100) + ' %'));
        if (der && der.nais) p.appendChild(ligne(t('conseil.naissances'), nb(der.nais)));
      }
      var c = SIM.couverture(e);
      p.appendChild(el('h3', { texte: t('conseil.niveaux') }));
      for (var n = 1; n < c.niveaux.length; n++) {
        if (!c.niveaux[n]) continue;
        p.appendChild(ligne(t('maison.n' + n), nb(c.niveaux[n])));
        p.appendChild(jauge(c.pop ? c.niveaux[n] / c.pop : 0));
      }
    },
    sante: function (p, e) {
      p.appendChild(ligne(t('conseil.santeVille'), t('info.surTotal', { n: e.sante, max: 100 })));
      p.appendChild(jauge(e.sante / 100));
      p.appendChild(el('p', { classe: 'aide', texte: t('conseil.santeAide') }));
      if (e.epidemies && e.sante < D.regles.sante.seuilEpidemie) p.appendChild(el('p', { classe: 'etat-ko', texte: t('conseil.epidemie') }));
      var c = SIM.couverture(e);
      ['barbier', 'bains', 'medecin', 'hopital'].forEach(function (k) { if (permet(k)) couvertureLigne(p, c, k); });
    },
    education: function (p, e) {
      var c = SIM.couverture(e);
      ['ecole', 'bibliotheque', 'academie'].forEach(function (k) { if (permet(k)) couvertureLigne(p, c, k); });
    },
    divertissement: function (p, e) {
      var c = SIM.couverture(e);
      p.appendChild(ligne(t('conseil.divertMoyen'), nb(c.divert)));
      p.appendChild(el('h3', { texte: t('conseil.lieux') }));
      e.batiments.forEach(function (b) {
        var d = D.batiments[b.type];
        if (d.genre !== 'spectacle') return;
        var pts = SIM.pointsSpectacle(b);
        p.appendChild(el('p', { classe: pts ? 'ok' : 'ko', texte: t('bat.' + b.type + '.nom') + ' · ' + (pts ? t('conseil.enScene') + ' (' + pts + ')' : t('conseil.relache')) }));
      });
      var ecoles = {};
      e.batiments.forEach(function (b) { var d = D.batiments[b.type]; if (d.genre === 'ecole_art') ecoles[b.type] = (ecoles[b.type] || 0) + 1; });
      Object.keys(ecoles).forEach(function (k) { p.appendChild(ligne(t('bat.' + k + '.nom'), nb(ecoles[k]))); });
    }
  };
  // ------------------------------------------------------------------------
  // Lot 3 : conseillers de l'en-chef, des cotes, impérial, du commerce, de la religion ;
  // carte de l'Empire (section 17.4). Tout se lit dans l'état ; seuls les boutons envoient
  // des commandes.
  // ------------------------------------------------------------------------
  function quoiDemande(dm) { if (dm.troupes) return t('demande.troupes', { n: dm.troupes }); return dm.bien ? t('demande.charges', { n: dm.q, bien: enPhrase(t('bien.' + dm.bien)) }) : t('demande.deniers', { n: nb(dm.deniers) }); }
  // Couleur d'une ligne de l'en-chef : 'ok' (vert), 'moyen' (orange), 'ko' (rouge).
  function etatLigne(p, cle, niveau, vars) {
    p.appendChild(el('p', { classe: niveau === 2 ? 'ok' : niveau === 1 ? 'moyen' : 'ko', texte: t('chef.' + cle + '.' + niveau, vars || {}) }));
  }
  CONSEILLERS.chef = function (p, e) {
    var c = SIM.couverture(e), dern = e.finances.prec, ob = SIM.objectifs(e);
    p.appendChild(el('h3', { texte: t('conseil.cite') }));
    etatLigne(p, 'population', e.humeur >= D.regles.immigration.humeurMin && SIM.placesLibres(e) > 0 ? 2 : e.humeur >= D.regles.emigration.humeurMax ? 1 : 0, { n: nb(e.pop) });
    etatLigne(p, 'emploi', e.chomage <= 5 ? 2 : e.chomage <= 15 ? 1 : 0, { n: e.chomage });
    etatLigne(p, 'nourriture', !c.penurie ? 2 : c.penurie * 10 <= c.maisons ? 1 : 0, { n: c.penurie });
    etatLigne(p, 'sante', e.sante >= 60 ? 2 : e.sante >= D.regles.sante.seuilEpidemie ? 1 : 0, { n: e.sante });
    var bas = null;
    D.regles.dieux.liste.forEach(function (g) { if (!bas || e.divins[g].s < e.divins[bas].s) bas = g; });
    if (bas) etatLigne(p, 'religion', e.divins[bas].s >= 40 ? 2 : e.divins[bas].s >= D.regles.dieux.avertissement ? 1 : 0, { dieu: t('dieu.' + bas), n: e.divins[bas].s });
    var solde = SIM.recettes(dern) - SIM.depenses(dern);
    etatLigne(p, 'finances', e.tresor >= 0 && solde >= 0 ? 2 : e.tresor >= 0 ? 1 : 0, { n: nb(e.tresor) });
    if (e.empereur) etatLigne(p, 'faveur', e.cotes.faveur >= 50 ? 2 : e.cotes.faveur > D.regles.empereur.destitution[0] + 10 ? 1 : 0, { n: e.cotes.faveur });
    if (SIM.cites(e).length) {
      var ouvertes = SIM.cites(e).filter(function (x) { return e.routes[x.id] && e.routes[x.id].o; }).length;
      etatLigne(p, 'commerce', ouvertes && e.finances.an.exports + dern.exports > 0 ? 2 : ouvertes ? 1 : 0, { n: ouvertes });
    }
    if (!e.libre && ob.length) etatLigne(p, 'objectifs', ob.every(function (o) { return o.fait; }) ? 2 : ob.filter(function (o) { return o.fait; }).length * 2 >= ob.length ? 1 : 0, { n: ob.filter(function (o) { return o.fait; }).length, max: ob.length });
    p.appendChild(el('h3', { texte: t('conseil.humeur') }));
    p.appendChild(ligne(t('conseil.humeur'), t('info.surTotal', { n: e.humeur, max: 100 })));
    p.appendChild(jauge(e.humeur / 100));
    var det = SIM.variationHumeur(e).detail;
    Object.keys(det).forEach(function (k) { p.appendChild(el('p', { classe: det[k] >= 0 ? 'ok' : 'ko', texte: t('humeur.' + k, { n: (det[k] > 0 ? '+' : '') + det[k] }) })); });
    if (e.humeur < D.regles.immigration.humeurMin) p.appendChild(el('p', { classe: 'etat-ko', texte: t('conseil.immigrationArretee') }));
  };
  CONSEILLERS.cotes = function (p, e) {
    var ob = SIM.objectifs(e), a = SIM.analyseCotes(e), seuils = {};
    ob.forEach(function (o) { seuils[o.cle] = o.cible; });
    if (e.libre) p.appendChild(el('p', { texte: t('conseil.aucunObjectif') }));
    ['population', 'culture', 'prosperite', 'paix', 'faveur'].forEach(function (k) {
      if (k === 'faveur' && !e.empereur) return;
      var v = k === 'population' ? e.pop : e.cotes[k], s = seuils[k];
      p.appendChild(el('h3', { texte: t('cote.' + k) }));
      p.appendChild(ligne(s !== undefined ? t('cote.seuil', { n: nb(s) }) : t('cote.valeur'), nb(v)));
      p.appendChild(jauge(s ? v / s : k === 'population' ? 0 : v / 100));
      var f = a[k], vars = {};
      for (var x in (f.vars || {})) vars[x] = f.vars[x];
      if (vars.comp) vars.comp = enPhrase(t('culture.' + vars.comp));
      if (vars.facteur) vars.facteur = t('prosperite.' + vars.facteur);
      p.appendChild(el('p', { classe: 'aide', texte: t('cote.' + k + '.' + f.cle, vars) }));
    });
    var cu = SIM.cultureDetail(e).detail;
    p.appendChild(el('h3', { texte: t('cote.cultureDetail') }));
    Object.keys(cu).forEach(function (k) { p.appendChild(ligne(t('culture.' + k), t('info.surTotal', { n: cu[k].pts, max: cu[k].max }))); });
    p.appendChild(ligne(t('cote.plafond'), nb(SIM.plafondProsperite(e))));
  };
  CONSEILLERS.imperial = function (p, e) {
    var E = D.regles.empereur;
    p.appendChild(ligne(t('cote.faveur'), t('info.surTotal', { n: e.cotes.faveur, max: 100 })));
    p.appendChild(jauge(e.cotes.faveur / 100));
    if (e.faveurBasse) p.appendChild(el('p', { classe: 'etat-ko', texte: t('imperial.destitution', { n: E.destitution[1] - e.faveurBasse }) }));
    p.appendChild(el('h3', { texte: t('imperial.demandes') }));
    var l = e.demandes.filter(function (dm) { return dm.etat === 'ouverte' || dm.etat === 'retard'; });
    if (!l.length) p.appendChild(el('p', { classe: 'aide', texte: t('imperial.aucuneDemande') }));
    var mois = Math.floor(e.tick / D.ticksParMois);
    l.forEach(function (dm) {
      var pret = SIM.demandePrete(e, dm), reste = (dm.etat === 'ouverte' ? dm.ech : dm.ech2) - mois;
      p.appendChild(el('p', { classe: dm.etat === 'retard' ? 'ko' : '', texte: t(dm.etat === 'retard' ? 'imperial.demandeRetard' : 'imperial.demande', { quoi: quoiDemande(dm), n: Math.max(0, reste) }) }));
      if (dm.troupes) { boutonsTroupes(p, e, dm); return; }
      if (dm.bien) p.appendChild(ligne(t('imperial.enStock'), t('info.surTotal', { n: nb(SIM.stockVille(e, dm.bien) / 100), max: dm.q })));
      p.appendChild(el('div', { classe: 'boutons' }, [bouton(t('imperial.expedier'), function () {
        var r = commander({ type: 'expedier', id: dm.id });
        AUDIO.jouer(r.ok ? 'pieces' : 'refus');
        if (!r.ok) toast(t('refus.' + r.raison));
        if (panneauVivant) panneauVivant();
      }, pret ? 'gros or' : 'gros non')]));
    });
    p.appendChild(el('h3', { texte: t('imperial.gouverneur') }));
    p.appendChild(ligne(t('imperial.fortune'), nb(e.fortune)));
    p.appendChild(reglage(t('imperial.salaire', { n: e.salaireGouv, max: SIM.salaireGouvMax(e) }), function (s) { commander({ type: 'reglage', cle: 'salaireGouv', valeur: e.salaireGouv + s * 5 }); }));
    p.appendChild(el('h3', { texte: t('imperial.presents') }));
    var g = el('div', { classe: 'boutons' }), recent = e.presentT >= 0 && e.tick - e.presentT < E.presentMoitieMois * D.ticksParMois;
    E.presents.forEach(function (pr, k) {
      var m = Math.floor(e.fortune * pr[0] / 100), gain = recent ? Math.floor(pr[1] / 2) : pr[1];
      g.appendChild(bouton(t('imperial.present' + k, { n: nb(m), gain: gain }), function () {
        var r = commander({ type: 'present', taille: k });
        AUDIO.jouer(r.ok ? 'etape' : 'refus');
        if (!r.ok) toast(t('refus.' + r.raison));
        if (panneauVivant) panneauVivant();
      }, m >= 1 ? 'gros non' : 'gros non grise'));
    });
    p.appendChild(g);
    if (recent) p.appendChild(el('p', { classe: 'aide', texte: t('imperial.presentRecent') }));
    var quart = Math.floor(e.fortune / 4);
    p.appendChild(el('div', { classe: 'boutons' }, [bouton(t('imperial.renflouer', { n: nb(quart) }), function () {
      if (commander({ type: 'renflouer', montant: quart }).ok) AUDIO.jouer('pieces');
      if (panneauVivant) panneauVivant();
    }, 'gros non')]));
    p.appendChild(el('p', { classe: 'aide', texte: t('imperial.aide', { tribut: E.tributPart }) }));
  };
  // ------------------------------------------------------------------------
  // Lot 4 : armée (sections 13 et 17.4). Conseiller militaire, panneau du fort, ordres aux
  // cohortes : « Envoyer » met le jeu en attente d'un toucher sur la carte.
  // ------------------------------------------------------------------------
  function militaireUtile(e) {
    return (e.unites && e.unites.length) || SIM.armees(e).length || TOUS.some(function (k) { return D.batiments[k].categorie === 'militaire' && permet(k); }) ||
      e.demandes.some(function (dm) { return dm.troupes; });
  }
  function nomUnite(k) { return t('unite.' + k); }
  function nomFaction(f) { return t('faction.' + f); }
  var ordreCohorte = null; // { fort } : le prochain toucher sur la carte donne la destination
  function majOrdre() {
    var z = $('ordre');
    if (!z) return;
    z.hidden = !ordreCohorte;
    if (ordreCohorte) $('ordre-texte').textContent = t('armee.ordreAide');
  }
  function commencerOrdre(fort) { ordreCohorte = { fort: fort }; fermerPanneau(); rendu.selection = fort; majOrdre(); AUDIO.jouer('clic'); }
  function finirOrdre() { ordreCohorte = null; majOrdre(); }
  function donnerOrdre(sx, sy) {
    var c = rendu.versCase(sx, sy), f = ordreCohorte && ordreCohorte.fort;
    finirOrdre();
    if (!c || !f) return;
    var r = commander({ type: 'cohorte', fort: f, ordre: 'aller', x: c[0], y: c[1] });
    AUDIO.jouer(r.ok ? 'etape' : 'refus');
    toast(r.ok ? t('armee.enRoute') : t('refus.' + r.raison));
    rendu.selection = f;
  }
  function ligneCohorte(p, e, c, avecBoutons) {
    p.appendChild(el('h3', { texte: t('unite.cohorte', { unite: nomUnite(c.unite) }) }));
    p.appendChild(ligne(t('armee.soldats'), t('info.surTotal', { n: c.n, max: D.regles.militaire.cohorte }) + (c.attendus ? ' · ' + t('armee.recrues', { n: c.attendus }) : '')));
    p.appendChild(ligne(t('armee.moral'), t('info.surTotal', { n: c.moral, max: 100 })));
    p.appendChild(jauge(c.moral / 100));
    p.appendChild(ligne(t('armee.entrainement'), t('info.surTotal', { n: c.entr, max: D.regles.militaire.entrainementMax })));
    p.appendChild(ligne(t('armee.ordre'), c.absente ? t('armee.absente') : c.fuite ? t('armee.fuite') : t('armee.ordre.' + c.ordre)));
    if (!avecBoutons || c.absente) return;
    var b = el('div', { classe: 'boutons' });
    b.appendChild(bouton(t('armee.envoyer'), function () { commencerOrdre(c.id); }, c.fuite || !c.ici ? 'gros non grise' : 'gros or'));
    b.appendChild(bouton(t('armee.rentrer'), function () { commander({ type: 'cohorte', fort: c.id, ordre: 'rentrer' }); AUDIO.jouer('clic'); if (panneauVivant) panneauVivant(); }, 'gros non'));
    p.appendChild(b);
    var fm = el('div', { classe: 'boutons' });
    ['ligne', 'colonne', 'carre'].forEach(function (k) {
      fm.appendChild(bouton(t('armee.formation.' + k), function () { commander({ type: 'cohorte', fort: c.id, ordre: 'formation', f: k }); AUDIO.jouer('clic'); if (panneauVivant) panneauVivant(); }, c.formation === k ? 'gros or' : 'gros non'));
    });
    p.appendChild(fm);
  }
  function boutonsTroupes(p, e, dm) {
    var l = SIM.cohortes(e).filter(function (c) { return !c.absente && c.ici > 0; });
    if (dm.lieu) p.appendChild(el('p', { classe: 'aide', texte: t('demande.troupesLieu', { cite: t('cite.' + dm.cite) }) }));
    if (!l.length) { p.appendChild(el('p', { classe: 'aide', texte: t('armee.aucuneCohorte') })); return; }
    var b = el('div', { classe: 'boutons' });
    l.forEach(function (c) {
      b.appendChild(bouton(t('armee.envoyerCohorte', { unite: nomUnite(c.unite), n: c.ici }), function () {
        var r = commander({ type: 'envoyer', id: dm.id, fort: c.id });
        AUDIO.jouer(r.ok ? 'etape' : 'refus');
        if (!r.ok) toast(t('refus.' + r.raison));
        if (panneauVivant) panneauVivant();
      }, 'gros or'));
    });
    p.appendChild(b);
  }
  CONSEILLERS.militaire = function (p, e) {
    var a = SIM.armees(e);
    p.appendChild(el('h3', { texte: t('armee.menaces') }));
    if (!a.length) p.appendChild(el('p', { classe: 'aide', texte: t('armee.aucuneMenace') }));
    a.forEach(function (x) {
      var cle = x.active ? (x.legions ? 'armee.legionsLa' : 'armee.invasionLa') : (x.legions ? 'armee.legionsAnnonce' : 'armee.invasionAnnonce');
      p.appendChild(el('p', { classe: x.active || x.mois <= 3 ? 'ko' : 'moyen', texte: t(cle, { faction: nomFaction(x.faction), effectif: x.n, n: x.mois }) }));
    });
    var cs = SIM.cohortes(e);
    if (!cs.length) p.appendChild(el('p', { classe: 'aide', texte: t('armee.aucunFort') }));
    cs.forEach(function (c) { ligneCohorte(p, e, c, true); });
    var casernes = e.batiments.filter(function (b) { return b.type === 'caserne'; });
    if (casernes.length) {
      p.appendChild(el('h3', { texte: t('bat.caserne.nom') }));
      var armes = 0; casernes.forEach(function (b) { armes += b.mat; });
      p.appendChild(ligne(t('armee.armesCaserne'), t('info.charges', { n: nb(armes / 100) })));
    }
    var envoyees = e.demandes.filter(function (dm) { return dm.troupes && dm.etat === 'envoyee'; });
    envoyees.forEach(function (dm) { p.appendChild(el('p', { texte: t('armee.troupesAbsentes', { effectif: dm.n, n: Math.max(0, Math.ceil((dm.retour - e.tick) / D.ticksParMois)) }) })); });
    p.appendChild(el('p', { classe: 'aide', texte: t('armee.aide') }));
  };
  // Panneaux des bâtiments militaires et d'administration du lot 4.
  function remplirLot4(p, e, b, d) {
    if (d.genre === 'fort') { var c = SIM.cohortes(e).filter(function (x) { return x.id === b.id; })[0]; if (c) ligneCohorte(p, e, c, true); }
    if (d.genre === 'caserne') {
      p.appendChild(ligne(t('armee.armesCaserne'), t('info.surTotal', { n: nb(b.mat / 100), max: D.regles.atelier.attenteMax })));
      p.appendChild(ligne(t('armee.prochaineRecrue'), Math.round(Math.min(1, b.prog / D.regles.militaire.recrueJours) * 100) + ' %'));
      p.appendChild(jauge(b.prog / D.regles.militaire.recrueJours));
    }
    if (d.genre === 'tour' || d.genre === 'muraille' || d.genre === 'porte' || d.genre === 'fort') p.appendChild(ligne(t('armee.structure'), t('info.surTotal', { n: SIM.pvBat(b), max: SIM.structure(b) })));
    if (b.type === 'senat') {
      p.appendChild(el('h3', { texte: t('conseil.onglet.cotes') }));
      ['culture', 'prosperite', 'paix', 'faveur'].forEach(function (k) { if (k !== 'faveur' || e.empereur) p.appendChild(ligne(t('cote.' + k), nb(e.cotes[k]))); });
    }
  }
  function remplirUnite(p, id) {
    var e = partie.e, u = SIM.uniteParId(e, id);
    if (!u) { p.appendChild(el('p', { texte: t('info.disparu') })); return; }
    p.appendChild(el('h2', { texte: u.c === 0 ? nomUnite(u.k) : t('unite.ennemi', { unite: t('ennemi.' + u.k), faction: nomFaction(e.invasion ? (e.invasion.legions ? 'rome' : e.invasion.f) : 'gaulois') }) }));
    p.appendChild(ligne(t('armee.vie'), t('info.surTotal', { n: u.pv, max: u.pm })));
    p.appendChild(jauge(u.pv / u.pm));
    if (u.c === 0) p.appendChild(ligne(t('armee.entrainement'), t('info.surTotal', { n: u.entr, max: D.regles.militaire.entrainementMax })));
  }
  // Armées en marche sur la carte de l'Empire (section 13.6) : marque rouge, mois restants.
  function armeesEmpire(e, X, Y, em) {
    var s = '';
    SIM.armees(e).forEach(function (a) {
      if (!a.depuis || a.active) return;
      var f = Math.max(0, Math.min(1, 1 - a.mois / 12)), q = [a.depuis[0] + (em.ville[0] - a.depuis[0]) * f, a.depuis[1] + (em.ville[1] - a.depuis[1]) * f];
      s += '<line x1="' + X(a.depuis) + '" y1="' + Y(a.depuis) + '" x2="' + X(em.ville) + '" y2="' + Y(em.ville) + '" stroke="#a8322a" stroke-width="0.8" stroke-dasharray="1.5 1.5"/>';
      s += '<path d="M' + X(q) + ' ' + (Number(Y(q)) - 6).toFixed(1) + 'l4 6h-8z" fill="#a8322a" stroke="#f4e8c8" stroke-width="0.6"/>';
      s += '<text x="' + X(q) + '" y="' + (Number(Y(q)) - 7.5).toFixed(1) + '" text-anchor="middle" font-size="5.6" fill="#7a1a12" stroke="#f4ead0" stroke-width="1.4" paint-order="stroke">' + t('armee.moisCarte', { n: a.mois }) + '</text>';
    });
    return s;
  }

  // Biens montrés au conseiller du commerce : ceux que la ville produit, stocke, ou qu'une cité
  // connue vend ou achète.
  function biensCommerce(e) {
    var l = {};
    SIM.cites(e).forEach(function (c) { if (!e.routes[c.id] || !e.routes[c.id].v) return; Object.keys(c.vend).concat(Object.keys(c.achete)).forEach(function (g) { l[g] = 1; }); });
    e.batiments.forEach(function (b) { var d = D.batiments[b.type]; if (d.produit) l[d.produit] = 1; if (b.type === 'entrepot') for (var g in b.stocks) if (b.stocks[g] > 0) l[g] = 1; });
    for (var g2 in e.commerce) l[g2] = 1;
    return D.listeBiens.filter(function (g) { return l[g]; });
  }
  var STATUTS_SUIVANT = { aucun: 'importer', importer: 'exporter', exporter: 'reserver', reserver: 'aucun' };
  var citeChoisie = null;
  CONSEILLERS.commerce = function (p, e) {
    carteEmpire(p, e);
    if (citeChoisie) ficheCite(p, e, citeChoisie);
    p.appendChild(el('h3', { texte: t('commerce.biens') }));
    p.appendChild(el('div', { classe: 'ligne bien entete' }, [el('span', { texte: t('commerce.bien') }), el('span', { texte: t('commerce.statut') })]));
    biensCommerce(e).forEach(function (g) {
      var s = SIM.statutBien(e, g), n = SIM.cibleBien(e, g), px = SIM.prixBien(e, g);
      var l = el('div', { classe: 'ligne bien' }, [nomBien(g, ' · ' + nb(SIM.stockVille(e, g) / 100))]);
      l.appendChild(el('button', { classe: 'mini c-' + s, aria: deuxPoints(t('commerce.statut'), t('statut.' + s)), texte: t('statut.' + s), clic: function () {
        AUDIO.jouer('clic'); commander({ type: 'commerce', bien: g, statut: STATUTS_SUIVANT[s] }); if (panneauVivant) panneauVivant();
      } }));
      p.appendChild(l);
      // Réglage de la quantité sur sa propre ligne : la ligne du bien reste lisible sur téléphone.
      if (s === 'importer' || s === 'exporter') {
        p.appendChild(el('div', { classe: 'reglage petit' }, [
          el('button', { classe: 'ico', texte: '−', aria: t('ui.moins'), clic: function () { AUDIO.jouer('clic'); commander({ type: 'commerce', bien: g, cible: Math.max(0, n - 1) }); if (panneauVivant) panneauVivant(); } }),
          el('span', { texte: t(s === 'importer' ? 'commerce.jusqua' : 'commerce.garder', { n: n }) }),
          el('button', { classe: 'ico', texte: '+', aria: t('ui.plus'), clic: function () { AUDIO.jouer('clic'); commander({ type: 'commerce', bien: g, cible: n + 1 }); if (panneauVivant) panneauVivant(); } })
        ]));
      }
      p.appendChild(el('p', { classe: 'aide prix', texte: t('commerce.prix', { i: nb(px.i), x: nb(px.x) }) }));
    });
    p.appendChild(el('p', { classe: 'aide', texte: t('commerce.aide') }));
  };
  // Carte de l'Empire : la Méditerranée, Rome, la ville, les cités partenaires et leurs routes.
  var MER = [[-5.6, 36.1], [-4.4, 36.7], [-2.1, 36.7], [-1, 37.6], [-0.5, 38.3], [0.2, 38.7], [-0.3, 39.5], [0.9, 40.7], [1.25, 41.1], [2.2, 41.4], [3.3, 42.3], [3.1, 43.1],
    [3.7, 43.4], [4.6, 43.4], [5.4, 43.3], [5.9, 43.1], [7.3, 43.7], [8.9, 44.4], [9.8, 44.1], [10.3, 43.5], [10.5, 42.9], [12.3, 41.7], [13.6, 41.2], [14.3, 40.8], [14.8, 40.6],
    [15.6, 40], [16, 39], [15.6, 38.1], [16, 37.9], [17.1, 39.1], [17.2, 40.5], [18, 40], [18.5, 40.1], [17.9, 40.6], [16.9, 41.1], [16.2, 41.9], [14.2, 42.5], [13.5, 43.6],
    [12.6, 44.1], [12.3, 44.4], [12.5, 45], [12.3, 45.4], [13.8, 45.6], [13.6, 44.8], [14.4, 45.3], [15.2, 44.1], [16.4, 43.5], [18.1, 42.6], [19.4, 41.3], [19.4, 40.4],
    [20, 39.5], [21.3, 38.3], [21.6, 37], [22.5, 36.4], [23, 36.5], [23.7, 37.9], [24, 38.5], [22.9, 40.6], [23.8, 40], [24.4, 40.9], [26.4, 40], [27.1, 38.4], [27.4, 37],
    [29.1, 36.6], [30.7, 36.9], [32, 36.5], [34.6, 36.8], [36.2, 36.6], [35.8, 35.5], [35.5, 33.9], [35, 32.8], [34.4, 31.5], [32.3, 31.3], [29.9, 31.2], [27.2, 31.4],
    [24, 32.1], [20.1, 32.1], [19, 30.3], [15.1, 32.4], [13.2, 32.9], [10.1, 33.9], [10.8, 34.7], [10.8, 35.8], [11, 37.1], [10.2, 36.8], [9.9, 37.3], [7.8, 36.9], [3.1, 36.8],
    [-0.6, 35.7], [-2.9, 35.3], [-5.3, 35.9]];
  var ILES = [[[12.4, 37.8], [13.4, 38.2], [15.6, 38.3], [15.1, 37], [14.3, 37], [12.6, 37.6]], [[8.4, 39], [8.2, 40.6], [9.2, 41.2], [9.8, 40.5], [9.6, 39.1], [9, 38.9]],
    [[8.6, 41.4], [8.6, 42.4], [9.4, 43], [9.5, 42.1], [9.2, 41.4]], [[2.4, 39.6], [3.2, 39.95], [3.45, 39.7], [3, 39.3], [2.6, 39.4]],
    [[23.5, 35.3], [24.3, 35.6], [26.3, 35.3], [26, 35], [24.7, 35]], [[32.3, 34.7], [33, 35.4], [34.6, 35.7], [34, 34.8], [33, 34.6]]];
  function carteEmpire(p, e) {
    var m = partie.m, em = m.empire;
    if (!em) return;
    var v = em.vue, L = 200, H = Math.round(L * (v[3] - v[1]) / (v[2] - v[0]) * 1.25);
    var X = function (q) { return ((q[0] - v[0]) / (v[2] - v[0]) * L).toFixed(1); }, Y = function (q) { return ((v[3] - q[1]) / (v[3] - v[1]) * H).toFixed(1); };
    var pts = function (l) { return l.map(function (q) { return X(q) + ',' + Y(q); }).join(' '); };
    var s = '<svg viewBox="0 0 ' + L + ' ' + H + '" class="empire" role="img" aria-label="' + t('commerce.carte') + '">';
    s += '<rect width="' + L + '" height="' + H + '" fill="#d8c79a"/><polygon points="' + pts(MER) + '" fill="#5f97b8" stroke="#3f6f8a" stroke-width="0.6"/>';
    ILES.forEach(function (i) { s += '<polygon points="' + pts(i) + '" fill="#d8c79a" stroke="#3f6f8a" stroke-width="0.4"/>'; });
    em.cites.forEach(function (c) {
      var r = e.routes[c.id];
      if (!r || !r.v) return;
      var actif = SIM.routeActive(e, c);
      s += '<line x1="' + X(em.ville) + '" y1="' + Y(em.ville) + '" x2="' + X(c.pos) + '" y2="' + Y(c.pos) + '" stroke="' + (actif ? '#b8862b' : r.o ? '#9a6a50' : '#7a7262') + '" stroke-width="' + (actif ? 1.6 : 0.9) + '"' + (c.route === 'mer' ? ' stroke-dasharray="3 2"' : '') + '/>';
    });
    var point = function (q, rayon, fond, contour) { return '<circle cx="' + X(q) + '" cy="' + Y(q) + '" r="' + rayon + '" fill="' + fond + '" stroke="' + contour + '" stroke-width="0.8"/>'; };
    s += point(em.rome, 3.6, '#a8322a', '#f4e8c8') + point(em.ville, 3.6, '#f0c040', '#5a3a10');
    em.cites.forEach(function (c) {
      var r = e.routes[c.id];
      if (!r || !r.v) return;
      s += '<g data-cite="' + c.id + '" class="cite">' + point(c.pos, citeChoisie === c.id ? 4 : 3, r.o ? '#f4e8c8' : '#bdb39a', citeChoisie === c.id ? '#f0c040' : '#4a3a28') + '</g>';
    });
    var nom = function (q, texte, dy) {
      var x = Number(X(q)), a = x < 16 ? 'start' : x > L - 16 ? 'end' : 'middle';
      return '<text x="' + (a === 'start' ? Math.max(1, x - 3) : a === 'end' ? Math.min(L - 1, x + 3) : x).toFixed(1) + '" y="' + (Number(Y(q)) + dy).toFixed(1) + '" text-anchor="' + a + '" font-size="6.2" fill="#2a2018" stroke="#f4ead0" stroke-width="1.6" paint-order="stroke">' + texte + '</text>'; };
    s += nom(em.rome, t('cite.rome'), -5.5) + nom(em.ville, t('mission.' + m.id + '.nom'), 9);
    // Une cité trop près de Rome ou de la ville voit son nom écrit sous son point.
    var pres = function (a, b) { return Math.abs(X(a) - X(b)) < 22 && Math.abs(Y(a) - Y(b)) < 10; };
    em.cites.forEach(function (c) { var r = e.routes[c.id]; if (r && r.v) s += nom(c.pos, t('cite.' + c.id), pres(c.pos, em.rome) || pres(c.pos, em.ville) ? 9 : -5); });
    s += armeesEmpire(e, X, Y, em);
    s += '</svg>';
    var boite = el('div', { classe: 'carte-empire' });
    boite.innerHTML = s;
    boite.querySelectorAll('.cite').forEach(function (g) {
      g.addEventListener('click', function () { AUDIO.jouer('clic'); citeChoisie = g.getAttribute('data-cite'); if (panneauVivant) panneauVivant(); });
    });
    p.appendChild(el('h3', { texte: t('commerce.carte') }));
    p.appendChild(boite);
    // Cités en gros boutons (cibles tactiles de 44 px) sous la carte.
    var g2 = el('div', { classe: 'boutons cites' });
    em.cites.forEach(function (c) {
      var r = e.routes[c.id];
      if (!r || !r.v) return;
      g2.appendChild(bouton(t('cite.' + c.id) + (r.o ? ' ✓' : ''), function () { citeChoisie = c.id; if (panneauVivant) panneauVivant(); }, citeChoisie === c.id ? 'gros or' : 'gros non'));
    });
    p.appendChild(g2);
  }
  function ficheCite(p, e, id) {
    var c = SIM.citeDe(e, id), r = c && e.routes[id];
    if (!c || !r || !r.v) return;
    var f = el('div', { classe: 'fiche-cite' });
    f.appendChild(el('h3', { texte: t('cite.' + id) }));
    f.appendChild(ligne(t('commerce.route'), t(c.route === 'mer' ? 'commerce.mer' : 'commerce.terre')));
    if (r.f > 0) f.appendChild(el('p', { classe: 'etat-ko', texte: t('commerce.fermee', { n: r.f }) }));
    [['vend', 'v', 'importer'], ['achete', 'a', 'exporter']].forEach(function (q) {
      var l = Object.keys(c[q[0]]);
      if (!l.length) return;
      f.appendChild(el('p', { classe: 'aide', texte: t('commerce.' + q[0]) }));
      l.forEach(function (g) {
        var px = SIM.prixBien(e, g);
        f.appendChild(ligne(t('bien.' + g) + ' · ' + nb(q[1] === 'v' ? px.i : px.x), t('commerce.quota', { n: SIM.echange(e, c, q[1], g), max: SIM.quota(e, c, q[1], g) })));
      });
    });
    if (!r.o) {
      var mer = c.route === 'mer' && !SIM.quaiEnService(e);
      if (mer) f.appendChild(el('p', { classe: 'etat-ko', texte: t('commerce.besoinQuai') }));
      f.appendChild(el('div', { classe: 'boutons' }, [bouton(t('commerce.ouvrir', { n: nb(c.cout) }), function () {
        var res = commander({ type: 'ouvrirRoute', cite: id });
        AUDIO.jouer(res.ok ? 'pieces' : 'refus');
        if (!res.ok) toast(t('refus.' + res.raison));
        if (panneauVivant) panneauVivant();
      }, mer ? 'gros non' : 'gros or')]));
    } else f.appendChild(el('p', { classe: 'etat-ok', texte: t(c.route === 'mer' ? 'commerce.ouverteMer' : 'commerce.ouverteTerre', { n: D.regles.commerce.caravaneMois }) }));
    p.appendChild(f);
  }
  CONSEILLERS.religion = function (p, e) {
    var G = D.regles.dieux, cu = SIM.cultes(e);
    if (!e.dieux) p.appendChild(el('p', { classe: 'aide', texte: t('religion.sansEffets') }));
    G.liste.forEach(function (g) {
      var st = e.divins[g], c = SIM.cibleDieu(e, g, cu);
      p.appendChild(el('h3', { texte: t('dieu.' + g) + ' · ' + t('dieu.' + g + '.domaine') }));
      p.appendChild(ligne(t('religion.satisfaction'), t('info.surTotal', { n: st.s, max: 100 })));
      p.appendChild(jauge(st.s / 100));
      p.appendChild(ligne(t('religion.temples', { n: cu.nb[g] }), t('religion.cible', { n: c.cible })));
      if (c.jaloux) p.appendChild(el('p', { classe: 'ko', texte: t('religion.jaloux', { n: G.jalousie }) }));
      if (st.s < G.avertissement) p.appendChild(el('p', { classe: 'etat-ko', texte: t('religion.colere') }));
      else if (st.s > G.bienfait) p.appendChild(el('p', { classe: 'etat-ok', texte: t('religion.bienfait') }));
    });
    p.appendChild(el('h3', { texte: t('religion.fetes') }));
    if (e.fete) {
      p.appendChild(el('p', { classe: 'etat-ok', texte: t('religion.feteEnCours', { dieu: t('dieu.' + e.fete.dieu), n: Math.max(0, Math.ceil((e.fete.t - e.tick) / D.ticksParMois)) }) }));
      return;
    }
    p.appendChild(el('p', { classe: 'aide', texte: t('religion.feteAide', { n: G.feteMois }) }));
    var choix = el('div', { classe: 'boutons' });
    G.liste.forEach(function (g) { choix.appendChild(bouton(t('dieu.' + g), function () { dieuFete = g; if (panneauVivant) panneauVivant(); }, dieuFete === g ? 'gros or' : 'gros non')); });
    p.appendChild(choix);
    var tailles = el('div', { classe: 'boutons' });
    Object.keys(G.fetes).forEach(function (k) {
      tailles.appendChild(bouton(t('religion.fete.' + k, { n: nb(SIM.coutFete(e, k)), gain: G.fetes[k][0] }), function () {
        var r = commander({ type: 'fete', dieu: dieuFete, taille: k });
        AUDIO.jouer(r.ok ? 'etape' : 'refus');
        if (!r.ok) toast(t('refus.' + r.raison));
        if (panneauVivant) panneauVivant();
      }, 'gros non'));
    });
    p.appendChild(tailles);
  };
  var dieuFete = 'ceres';
  var defilOnglets = 0;
  // Onglets montrés : l'impérial seulement quand l'empereur est là, le commerce quand la
  // mission a des cités partenaires.
  function ongletsPartie(e) {
    return ONGLETS.filter(function (o) { return (o !== 'imperial' || e.empereur) && (o !== 'commerce' || SIM.cites(e).length) && (o !== 'militaire' || militaireUtile(e)); });
  }

  function reglage(texte, changer) {
    return el('div', { classe: 'reglage' }, [
      el('button', { classe: 'ico', texte: '−', aria: t('ui.moins'), clic: function () { AUDIO.jouer('clic'); changer(-1); if (panneauVivant) panneauVivant(); } }),
      el('span', { texte: texte }),
      el('button', { classe: 'ico', texte: '+', aria: t('ui.plus'), clic: function () { AUDIO.jouer('clic'); changer(1); if (panneauVivant) panneauVivant(); } })
    ]);
  }
  function ouvrirJournal() {
    if (!partie) return;
    ouvrirPanneau(function (p) {
      var e = partie.e, m = partie.m;
      p.appendChild(el('h2', { texte: t('journal.titre') }));
      if (m.tutoriel && m.tutoriel.length && !e.libre) {
        p.appendChild(el('h3', { texte: t('journal.etapes') }));
        m.tutoriel.forEach(function (et, k) { p.appendChild(el('p', { classe: k < e.tuto ? 'ok' : k === e.tuto ? '' : 'ko', texte: (k + 1) + '. ' + t(et.cle) })); });
      }
      p.appendChild(el('h3', { texte: t('journal.messages') }));
      var l = e.journal.slice().reverse().filter(function (x) { return x.cle !== 'msg.etapeFaite'; });
      if (!l.length) p.appendChild(el('p', { texte: t('journal.vide') }));
      l.slice(0, 30).forEach(function (x) {
        var d = x.t;
        var r = el('div', { classe: 'msg' + (x.critique ? ' critique' : '') }, [el('span', { texte: texteMsg(x) })]);
        if (x.lieu >= 0) r.appendChild(el('button', { classe: 'ico', aria: t('journal.centrer'), title: t('journal.centrer'), texte: '⌖', clic: function () { rendu.centrerSur(x.lieu % e.N, Math.floor(x.lieu / e.N)); fermerPanneau(); } }));
        void d;
        p.appendChild(r);
      });
    });
  }
  function ouvrirCalques() {
    if (!partie) return;
    ouvrirPanneau(function (p) {
      p.appendChild(el('h2', { texte: t('calque.titre') }));
      // Un calque n'apparaît que si la partie permet ce qu'il montre.
      var utile = {
        feu: partie.e.risques, dommages: partie.e.risques, stocks: permet('grenier') || permet('marche') || permet('entrepot'),
        nourriture: permet('marche'), divertissement: permet('theatre') || permet('amphitheatre') || permet('colisee'),
        education: permet('ecole'), sante: permet('barbier') || permet('bains') || permet('medecin') || permet('hopital'),
        religion: TOUS.some(function (k) { return D.batiments[k].dieu && permet(k); }), impots: permet('forum'),
        attractivite: partie.e.attractivite, problemes: true, eau: true, crime: permet('prefecture') && partie.m.echelon >= 3
      };
      [null, 'eau', 'feu', 'dommages', 'crime', 'stocks', 'nourriture', 'divertissement', 'education', 'sante', 'religion', 'impots', 'attractivite', 'problemes'].forEach(function (c) {
        if (c && !utile[c]) return;
        p.appendChild(el('button', { classe: 'choix' + (rendu.calque === c ? ' actif' : ''), clic: function () { AUDIO.jouer('clic'); rendu.calque = c; fermerPanneau(); $('b-calque').classList.toggle('actif', !!c); } }, [
          el('span', { classe: 'nom', texte: t('calque.' + (c || 'aucun')) })
        ]));
        if (c) p.appendChild(el('p', { texte: t('calque.' + c + 'Aide') }));
      });
    });
  }

  // ------------------------------------------------------------------------
  // Tutoriel des missions 1 et 2 : consigne mesurable et main qui montre le bouton
  // ------------------------------------------------------------------------
  function etapeCourante() {
    if (!partie || partie.figee) return null;
    var e = partie.e, m = partie.m;
    if (e.tutoFini || !m.tutoriel || e.tuto >= m.tutoriel.length) return null;
    return m.tutoriel[e.tuto];
  }
  function majTuto(fete) {
    var et = etapeCourante(), bandeau = $('tuto');
    if (!et) { bandeau.hidden = true; $('main').hidden = true; document.querySelectorAll('.cat.signal').forEach(function (b) { b.classList.remove('signal'); }); if (fete) { AUDIO.jouer('etape'); toast(t('tuto.fini')); } return; }
    $('tuto-texte').textContent = t(et.cle);
    bandeau.hidden = false;
    majTutoProgres();
    if (fete) { AUDIO.jouer('etape'); bandeau.classList.remove('fete'); void bandeau.offsetWidth; bandeau.classList.add('fete'); construireMenu(); }
    placerMain();
  }
  function majTutoProgres() {
    var et = etapeCourante();
    if (!et) return;
    var c = SIM.condition(partie.e, et.condition);
    $('tuto-progres').textContent = t('tuto.progres', { v: nb(Math.min(c.valeur, c.cible)), c: nb(c.cible) });
  }
  function placerMain() {
    var et = etapeCourante(), main = $('main');
    document.querySelectorAll('.cat').forEach(function (b) { b.classList.toggle('signal', !!et && b.dataset.cat === et.categorie); });
    var b = et && et.categorie ? document.querySelector('.cat[data-cat="' + et.categorie + '"]') : null;
    if (!b || categorieOuverte) { main.hidden = true; return; }
    var nav = $('menu-cat');
    main.style.left = (nav.offsetLeft + b.offsetLeft + b.offsetWidth - 6) + 'px';
    main.style.top = (nav.offsetTop + b.offsetTop + 8) + 'px';
    main.hidden = false;
  }

  // ------------------------------------------------------------------------
  // Écrans
  // ------------------------------------------------------------------------
  var retourEcran = null;
  function ouvrirEcran(contenu, options) {
    options = options || {};
    vider(ecran);
    ecran.className = options.voile === false ? '' : 'voile';
    ecran.dataset.bloque = options.bloque === false ? '0' : '1';
    ecran.dataset.retour = options.retour ? '1' : '';
    retourEcran = options.retour || null;
    ecran.appendChild(contenu);
    // Pas de focus() automatique : le cadre isolé du site l'interdit sans geste du joueur.
  }
  function fermerEcran() { vider(ecran); ecran.className = ''; ecran.dataset.bloque = '0'; retourEcran = null; }
  function ecranRetour() { if (retourEcran) retourEcran(); }

  function ecranTitre() {
    hud.hidden = true;
    partie = null;
    // Fond : la grande ville d'exemple, qui vit doucement.
    var e = chargerVille(3);
    if (e) {
      rendu.e = e; rendu.calque = null; rendu.apercu = null; rendu.selection = 0; rendu.sansInterface = true; rendu.cam.z = 1;
      centrerVille(e);
      fond = { e: e, acc: 0, x0: rendu.cam.x };
    }
    var coin = el('div', { classe: 'titre-coin' });
    var bSon = el('button', { classe: 'ico', 'data-son': '1', clic: basculerSon });
    coin.appendChild(bSon);
    var hote = el('span', { classe: 'langue-hote', id: 'langue-titre' });
    coin.appendChild(hote);
    var bloc = el('div', { classe: 'titre-jeu' }, [
      el('h1', { texte: t('titre') }),
      el('div', { classe: 'sous', texte: t('titre.sousTitre') }),
      el('p', { classe: 'consigne', texte: t('titre.consigne') }),
      bouton(t('titre.jouer'), jouer, 'gros or'),
      el('div', { classe: 'age', texte: t('titre.age') })
    ]);
    var conteneur = el('div', {}, [bloc]);
    ouvrirEcran(conteneur, { voile: false, bloque: false });
    ecran.appendChild(coin);
    try { I18N.creerSelecteur({ conteneur: hote, isole: true }); } catch (err) { /* sélecteur indisponible */ }
    majBoutonSon();
  }

  function jouer() {
    AUDIO.demarrer();
    rendu.sansInterface = false;
    window.JEL_SAVE.reprise({
      jeu: JEU,
      onContinuer: function (d) { chargerProg(d); continuer(); },
      onNouvelle: function () {
        var d = null;
        try { d = window.JEL_SAVE.load(JEU); } catch (e) { d = null; }
        chargerProg(d);
        // Pas d'écriture ici : la progression s'enregistre en fin de mission et à la fermeture.
        // Premier lancement : la première mission s'ouvre directement.
        if (!Object.keys(prog.gagnees).length) ecranBriefing(MISSIONS[0]);
        else ecranMissions();
      }
    });
  }

  // « Continuer » : la dernière ville enregistrée, sinon le choix des missions.
  function continuer() {
    ecranMissions();
    lireIndex().then(function (idx) {
      var cle = null, quand = 0;
      Object.keys(idx).forEach(function (k) { if (idx[k] && idx[k].quand > quand) { quand = idx[k].quand; cle = k; } });
      if (!cle || partie) return;
      return chargerVilleStock(cle);
    }).catch(function () { /* pas de ville : le choix des missions reste affiché */ });
  }

  function ecranMissions() {
    var carte = el('div', { classe: 'carte-ecran' });
    carte.appendChild(el('h1', { texte: t('missions.titre') }));
    carte.appendChild(el('p', { texte: t('missions.bilan', { rang: rangTexte(), n: totalEtoiles(), max: MAX_ETOILES }) }));
    var grille = el('div', { classe: 'grille-missions' });
    var prochaine = MISSIONS.filter(function (m) { return m.dispo && missionOuverte(m) && !prog.gagnees[m.id]; })[0];
    MISSIONS.forEach(function (m) {
      var ouverte = missionOuverte(m), jouable = ouverte && m.dispo;
      var c = el('button', { classe: 'mission' + (jouable ? '' : ' ferme') + (prochaine === m ? ' prochaine' : '') }, [
        el('span', { classe: 'num', texte: t('missions.echelon', { n: m.echelon }) + (m.echelon >= 4 ? ' · ' + t('missions.' + m.province) : '') }),
        el('span', { classe: 'nom', texte: t('mission.' + m.id + '.nom') }),
        jouable || prog.gagnees[m.id] ? etoilesTexte(prog.gagnees[m.id] | 0) : el('span', { classe: 'num', texte: t(m.dispo ? 'missions.verrouillee' : 'missions.bientot') })
      ]);
      c.addEventListener('click', function () {
        AUDIO.demarrer();
        if (!jouable) { AUDIO.jouer('refus'); toastEcran(t(m.dispo ? 'missions.verrouilleeAide' : 'missions.bientotAide')); return; }
        AUDIO.jouer('clic');
        ecranBriefing(m);
      });
      grille.appendChild(c);
    });
    carte.appendChild(grille);
    carte.appendChild(el('div', { classe: 'boutons' }, [
      bouton(t('libre.bouton'), function () { ecranLibre(); }, 'gros non'),
      bouton(t('missions.charger'), function () { ecranSauvegardes('charger', ecranMissions); }, 'gros non'),
      bouton(t('ui.retour'), ecranTitre, 'gros non')
    ]));
    ouvrirEcran(carte, { retour: ecranTitre });
  }

  // Construction libre (section 17.6) : tous les bâtiments, sans objectif, sur la carte d'une
  // mission déjà ouverte ; fonds de départ et risques au choix.
  var FONDS_LIBRE = [10000, 30000, 100000];
  var choixLibre = { carte: null, fonds: 1, risques: true, dieux: false };
  function ecranLibre() {
    var cartes = MISSIONS.filter(function (m) { return m.dispo && missionOuverte(m); });
    if (!choixLibre.carte || cartes.indexOf(mission(choixLibre.carte)) < 0) choixLibre.carte = cartes[0].id;
    var carte = el('div', { classe: 'carte-ecran' });
    carte.appendChild(el('h1', { texte: t('libre.titre') }));
    carte.appendChild(el('p', { texte: t('libre.intro') }));
    carte.appendChild(el('h2', { texte: t('libre.carte') }));
    var g = el('div', { classe: 'boutons' });
    cartes.forEach(function (m) { g.appendChild(bouton(t('mission.' + m.id + '.nom'), function () { choixLibre.carte = m.id; ecranLibre(); }, choixLibre.carte === m.id ? 'gros or' : 'gros non')); });
    carte.appendChild(g);
    carte.appendChild(el('h2', { texte: t('libre.fonds') }));
    var f = el('div', { classe: 'boutons' });
    FONDS_LIBRE.forEach(function (n, k) { f.appendChild(bouton(nb(n), function () { choixLibre.fonds = k; ecranLibre(); }, choixLibre.fonds === k ? 'gros or' : 'gros non')); });
    carte.appendChild(f);
    carte.appendChild(el('div', { classe: 'boutons' }, [
      bouton(deuxPoints(t('libre.risques'), t(choixLibre.risques ? 'ui.oui' : 'ui.non')), function () { choixLibre.risques = !choixLibre.risques; ecranLibre(); }, 'gros non'),
      bouton(deuxPoints(t('libre.dieux'), t(choixLibre.dieux ? 'ui.oui' : 'ui.non')), function () { choixLibre.dieux = !choixLibre.dieux; ecranLibre(); }, 'gros non')
    ]));
    carte.appendChild(el('div', { classe: 'boutons' }, [
      bouton(t('ui.retour'), ecranMissions, 'gros non'),
      bouton(t('libre.commencer'), function () { fermerEcran(); nouvelleLibre(); }, 'gros or')
    ]));
    ouvrirEcran(carte, { retour: ecranMissions });
  }
  function nouvelleLibre() {
    var e = SIM.nouvelle(choixLibre.carte, { libre: true, tout: true, fonds: FONDS_LIBRE[choixLibre.fonds], risques: choixLibre.risques, dieux: choixLibre.dieux });
    demarrerEtat(e);
    AUDIO.jouer('etape');
  }
  function nomPartie() { return partie.e.libre && partie.e.tout ? t('libre.nom', { carte: t('mission.' + partie.m.id + '.nom') }) : t('mission.' + partie.m.id + '.nom'); }
  function toastEcran(texte) {
    var b = el('div', { classe: 'toast', texte: texte });
    b.style.position = 'absolute'; b.style.left = '50%'; b.style.top = '12px'; b.style.transform = 'translateX(-50%)'; b.style.zIndex = 20;
    ecran.appendChild(b);
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 2600);
  }

  function ecranBriefing(m) {
    var carte = el('div', { classe: 'carte-ecran' });
    carte.appendChild(el('div', { classe: 'num', texte: t('missions.echelon', { n: m.echelon }) + ' · ' + t('rang.' + D.rangs[m.echelon - 1]) }));
    carte.appendChild(el('h1', { texte: t('mission.' + m.id + '.nom') }));
    carte.appendChild(el('p', { texte: t('mission.' + m.id + '.intro') }));
    var nCites = ((m.empire && m.empire.cites) || []).filter(function (c) { return !c.cachee; }).length;
    if (nCites) carte.appendChild(el('p', { texte: t('briefing.cites', { n: nCites }) }));
    carte.appendChild(el('h2', { texte: t('conseil.objectifs') }));
    var ul = el('div', { classe: 'objectifs' });
    Object.keys(m.objectifs).forEach(function (k) { ul.appendChild(el('p', { texte: '• ' + t('obj.' + k, { n: nb(m.objectifs[k]), v: '' }) })); });
    carte.appendChild(ul);
    if (prog.gagnees[m.id]) carte.appendChild(el('p', {}, [t('briefing.dejaGagnee') + ' ', etoilesTexte(prog.gagnees[m.id])]));
    carte.appendChild(el('p', { texte: t('briefing.etoiles', { mois: m.dateCibleMois }) }));
    if (m.echelon >= 3) {
      // Difficulté (section 2.5), gardée dans les options.
      var diffs = el('div', { classe: 'boutons difficulte' });
      ['facile', 'normal', 'difficile'].forEach(function (k) {
        diffs.appendChild(bouton(t('difficulte.' + k), function () { prog.options.difficulte = k; sauverProg(); ecranBriefing(m); }, (prog.options.difficulte || 'normal') === k ? 'gros or' : 'gros non'));
      });
      carte.appendChild(el('h2', { texte: t('difficulte.titre') }));
      carte.appendChild(diffs);
      carte.appendChild(el('p', { classe: 'aide', texte: t('difficulte.' + (prog.options.difficulte || 'normal') + 'Aide') }));
    }
    carte.appendChild(el('div', { classe: 'boutons' }, [
      bouton(t('ui.retour'), ecranMissions, 'gros non'),
      bouton(t('briefing.commencer'), function () { fermerEcran(); nouvelleMission(m); }, 'gros or')
    ]));
    ouvrirEcran(carte, { retour: ecranMissions });
  }

  // Tutoriel animé des gestes (3 étapes au plus, se passe d'un toucher).
  function ecranGeste(n) {
    var GESTES = [
      { cle: estTactile ? 'geste.deplacerTactile' : 'geste.deplacerSouris', classe: 'g1', doigts: 1 },
      { cle: estTactile ? 'geste.zoomTactile' : 'geste.zoomSouris', classe: 'g2', doigts: 2 },
      { cle: estTactile ? 'geste.construireTactile' : 'geste.construireSouris', classe: 'g3', doigts: 1, route: true }
    ];
    if (n >= GESTES.length) { prog.options.geste = true; sauverProg(); fermerEcran(); return; }
    var g = GESTES[n], demo = el('div', { classe: 'geste ' + g.classe });
    if (g.route) demo.appendChild(el('div', { classe: 'route' }));
    demo.appendChild(el('div', { classe: 'doigt' + (g.doigts === 2 ? ' a' : '') }));
    if (g.doigts === 2) demo.appendChild(el('div', { classe: 'doigt b' }));
    var carte = el('div', { classe: 'carte-ecran' }, [
      el('h2', { texte: t('geste.titre', { n: n + 1, max: GESTES.length }) }),
      demo,
      el('p', { texte: t(g.cle) }),
      el('div', { classe: 'boutons' }, [
        bouton(t('geste.passer'), function () { ecranGeste(GESTES.length); }, 'gros non'),
        bouton(t(n + 1 < GESTES.length ? 'geste.suivant' : 'geste.compris'), function () { ecranGeste(n + 1); })
      ])
    ]);
    ouvrirEcran(carte, { retour: function () { ecranGeste(GESTES.length); } });
  }

  function ecranPause() {
    if (!partie) return;
    annulerOutil();
    var carte = el('div', { classe: 'carte-ecran' }, [
      el('h1', { texte: t('pause.titre') }),
      el('p', { texte: nomPartie() + ' · ' + t('hud.date', { mois: t('mois.' + SIM.date(partie.e).mois), annee: anneeTexte(SIM.date(partie.e).annee) }) }),
      el('div', { classe: 'boutons' }, [
        bouton(t('pause.reprendre'), fermerEcran, 'gros or'),
        bouton(t('pause.sauver'), function () { ecranSauvegardes('sauver', ecranPause); }, 'gros non'),
        bouton(t('pause.charger'), function () { ecranSauvegardes('charger', ecranPause); }, 'gros non'),
        bouton(t('pause.exporter'), exporterVille, 'gros non'),
        bouton(t('pause.options'), function () { ecranOptions(ecranPause); }, 'gros non'),
        bouton(t('pause.recommencer'), function () { var m = partie.m, libre = partie.e.tout; fermerEcran(); if (libre) { choixLibre.carte = m.id; nouvelleLibre(); } else nouvelleMission(m); }, 'gros non'),
        bouton(t('pause.missions'), function () { sauverVilleAuto(); quitterVersMissions(); }, 'gros non'),
        bouton(t('pause.accueil'), function () { sauverVilleAuto(); sauverProg(); quitterPartie(); }, 'gros non')
      ])
    ]);
    ouvrirEcran(carte, { retour: fermerEcran });
  }
  function quitterVersMissions() { partie = null; hud.hidden = true; annulerOutil(); ecranMissions(); }

  function ecranOptions(retour) {
    var o = prog.options;
    var bascule = function (cle, nom) {
      return bouton(deuxPoints(t(nom), t(o[cle] ? 'ui.oui' : 'ui.non')), function () { o[cle] = !o[cle]; if (cle === 'son') { AUDIO.couper(!o.son); majBoutonSon(); } sauverProg(); ecranOptions(retour); }, 'gros non');
    };
    var carte = el('div', { classe: 'carte-ecran' }, [
      el('h1', { texte: t('options.titre') }),
      el('div', { classe: 'boutons' }, [
        bascule('son', 'options.son'),
        bascule('pauseCritique', 'options.pauseCritique'),
        bouton(deuxPoints(t('options.defilement'), t('options.defilement' + o.defilement)), function () { o.defilement = (o.defilement + 1) % 4; sauverProg(); ecranOptions(retour); }, 'gros non'),
        bouton(t('options.revoirGestes'), function () { ecranGeste(0); }, 'gros non')
      ]),
      el('div', { classe: 'boutons' }, [bouton(t('ui.retour'), retour, 'gros or')])
    ]);
    ouvrirEcran(carte, { retour: retour });
  }

  // ------------------------------------------------------------------------
  // Villes enregistrées (JEL_STOCK) : 3 automatiques tournantes, 5 emplacements
  // ------------------------------------------------------------------------
  var STOCK = window.JEL_STOCK || null;
  function lireIndex() {
    if (!STOCK) return Promise.resolve({});
    return STOCK.get('index').then(function (txt) { try { return JSON.parse(txt) || {}; } catch (e) { return {}; } }).catch(function () { return {}; });
  }
  function sauverVille(cle) {
    if (!STOCK || !partie || partie.figee) return Promise.reject({ code: 'indispo' });
    var e = partie.e, d = SIM.date(e);
    var meta = { mission: e.mission, libre: !!e.tout, mois: d.mois, annee: d.annee, pop: e.pop, quand: Date.now() };
    return STOCK.set(cle, SIM.exporter(e)).then(function () {
      return lireIndex().then(function (idx) { idx[cle] = meta; return STOCK.set('index', JSON.stringify(idx)); });
    });
  }
  function sauverVilleAuto() {
    if (!STOCK || !partie || partie.figee) return;
    prog.options.auto = ((prog.options.auto | 0) % 3) + 1;
    sauverVille('auto-' + prog.options.auto).catch(function () { /* stockage plein ou absent : le jeu continue */ });
    sauverProg();
  }
  function chargerVilleStock(cle) {
    if (!STOCK) return Promise.reject({ code: 'indispo' });
    return STOCK.get(cle).then(function (txt) {
      if (!txt) throw { code: 'vide' };
      var e;
      try { e = SIM.importer(txt); } catch (err) { toastEcran(t('sauve.ancienne')); throw { code: 'version' }; }
      demarrerEtat(e);
      toast(t('sauve.chargee'));
    });
  }
  function exporterVille() {
    if (!STOCK || !partie) { toastEcran(t('sauve.indispo')); return; }
    STOCK.exporter('marmoria-' + partie.e.mission + '.json', SIM.exporter(partie.e), 'application/json').catch(function () { toastEcran(t('sauve.erreur')); });
  }
  function ecranSauvegardes(mode, retour) {
    var carte = el('div', { classe: 'carte-ecran' }, [el('h1', { texte: t(mode === 'sauver' ? 'sauve.titreSauver' : 'sauve.titreCharger') })]);
    var liste = el('div', { classe: 'emplacements' });
    carte.appendChild(liste);
    carte.appendChild(el('div', { classe: 'boutons' }, [bouton(t('ui.retour'), retour, 'gros non')]));
    ouvrirEcran(carte, { retour: retour });
    if (!STOCK) { liste.appendChild(el('p', { texte: t('sauve.indispo') })); return; }
    lireIndex().then(function (idx) {
      var cles = (mode === 'sauver' ? [] : ['auto-1', 'auto-2', 'auto-3']).concat(['ville-1', 'ville-2', 'ville-3', 'ville-4', 'ville-5']);
      cles.forEach(function (cle) {
        var m = idx[cle], nom = /^auto/.test(cle) ? t('sauve.auto', { n: cle.slice(5) }) : t('sauve.emplacement', { n: cle.slice(6) });
        var desc = m ? t('sauve.resume', { mission: m.libre ? t('libre.nom', { carte: t('mission.' + m.mission + '.nom') }) : t('mission.' + m.mission + '.nom'), date: t('hud.date', { mois: t('mois.' + m.mois), annee: anneeTexte(m.annee) }), pop: nb(m.pop) }) : t('sauve.vide');
        var ligneE = el('div', { classe: 'emplacement' }, [el('strong', { texte: nom }), el('span', { texte: desc })]);
        if (mode === 'sauver') ligneE.appendChild(bouton(t('sauve.ecrire'), function () {
          sauverVille(cle).then(function () { toastEcran(t('sauve.ok')); AUDIO.jouer('pieces'); ecranSauvegardes(mode, retour); }).catch(function () { toastEcran(t('sauve.erreur')); });
        }, 'gros oui'));
        else if (m) ligneE.appendChild(bouton(t('sauve.charger'), function () {
          fermerEcran();
          chargerVilleStock(cle).catch(function () { ecranSauvegardes(mode, retour); });
        }, 'gros oui'));
        liste.appendChild(ligneE);
      });
    });
  }

  // ------------------------------------------------------------------------
  // Victoire, défaite
  // ------------------------------------------------------------------------
  function ecranVictoire() {
    var e = partie.e, m = partie.m, v = e.victoire, n = v.etoiles;
    AUDIO.jouer('victoire');
    var avant = prog.gagnees[m.id] | 0;
    prog.gagnees[m.id] = Math.max(avant, n);
    prog.niveau = Math.max(prog.niveau, Math.min(MISSIONS.length, m.numero + 1));
    // Mission gagnée : progression enregistrée (niveau suivant), puis fin signalée au site.
    if (e.empereur) prog.fortune = e.fortune;
    try { window.JEL_SAVE.save(JEU, { niveau: prog.niveau, score: totalEtoiles(), options: prog.options, gagnees: prog.gagnees, fortune: prog.fortune }); } catch (err) { /* sans stockage */ }
    if (window.FMG) window.FMG.reportEnd({ completed: true, level: m.numero });
    var toutes = MISSIONS.every(function (x) { return prog.gagnees[x.id]; });
    if (toutes) { if (window.FMG) window.FMG.reportComplete({ stars: totalEtoiles(), maxStars: MAX_ETOILES }); }
    sauverVilleAuto();
    var gros = el('div', { classe: 'grosses-etoiles', aria: t('missions.etoilesAria', { n: n, max: 3 }) });
    for (var k = 0; k < 3; k++) gros.appendChild(el('span', { classe: k < n ? '' : 'vide', texte: '★' }));
    var suivante = MISSIONS.filter(function (x) { return x.dispo && missionOuverte(x) && !prog.gagnees[x.id]; })[0];
    var carte = el('div', { classe: 'carte-ecran' }, [
      el('h1', { texte: t('victoire.titre') }),
      gros,
      el('p', { texte: t('victoire.texte', { mission: t('mission.' + m.id + '.nom') }) }),
      el('p', { texte: t('victoire.bilan', { mois: v.mois, pop: nb(e.pop) }) }),
      el('p', { classe: 'ok', texte: t('victoire.etoile1') }),
      el('p', { classe: e.secoursRecu ? 'ko' : 'ok', texte: t('victoire.etoile2') }),
      el('p', { classe: n >= 3 ? 'ok' : 'ko', texte: t('victoire.etoile3', { mois: m.dateCibleMois }) }),
      n > avant && avant ? el('p', { classe: 'etat-ok', texte: t('victoire.record') }) : null,
      toutes ? el('p', { classe: 'etat-ok', texte: t('victoire.campagne') }) : null,
      el('div', { classe: 'boutons' }, [
        suivante ? bouton(t('victoire.suivante'), function () { quitterVersMissions(); ecranBriefing(suivante); }, 'gros or') : null,
        bouton(t('victoire.continuer'), fermerEcran, 'gros non'),
        bouton(t('victoire.rejouer'), function () { fermerEcran(); nouvelleMission(m); }, 'gros non'),
        bouton(t('victoire.missions'), quitterVersMissions, 'gros non')
      ])
    ]);
    ouvrirEcran(carte, { retour: fermerEcran });
  }
  function ecranDefaite() {
    var e = partie.e, m = partie.m;
    AUDIO.jouer('defaite');
    if (e.empereur) { prog.fortune = e.fortune; sauverProg(); }
    if (window.FMG) window.FMG.reportEnd({ completed: false, level: m.numero });
    var carte = el('div', { classe: 'carte-ecran' }, [
      el('h1', { texte: t('defaite.titre') }),
      el('p', { texte: t('defaite.' + e.defaite.cause) }),
      el('p', { texte: t('victoire.bilan', { mois: Math.floor(e.tick / D.ticksParMois), pop: nb(e.pop) }) }),
      el('div', { classe: 'boutons' }, [
        bouton(t('defaite.reessayer'), function () { fermerEcran(); nouvelleMission(m); }, 'gros or'),
        bouton(t('pause.charger'), function () { ecranSauvegardes('charger', ecranDefaite); }, 'gros non'),
        bouton(t('victoire.missions'), quitterVersMissions, 'gros non')
      ])
    ]);
    ouvrirEcran(carte);
  }

  // ------------------------------------------------------------------------
  // Villes d'exemple (affiche, aperçus, fond de l'écran titre)
  // ------------------------------------------------------------------------
  function chargerVille(n) {
    var v = VILLES[n - 1];
    if (!v) return null;
    try { return SIM.importer(JSON.stringify(v)); } catch (e) { return null; }
  }
  // Affiche (jaquette) : une scène de ville, sans interface ni texte.
  function dessinerAffiche() {
    hud.hidden = true; vider(ecran);
    document.querySelectorAll('.jel-langue').forEach(function (b) { b.style.display = 'none'; });
    var e = chargerVille(3);
    if (!e) return;
    rendu.e = e; rendu.sansInterface = true; rendu.effetAffiche = true;
    // Gros plan (zoom réservé à l'affiche) sur le temple le plus entouré de maisons.
    rendu.cam.z = 3;
    var cible = null, meilleur = -1;
    e.batiments.forEach(function (b) {
      if (b.type !== 'temple_ceres') return; // le héros de l'affiche est toujours un temple (texte de la jaquette)
      var n = 0;
      e.batiments.forEach(function (h) { if (h.type === 'logement' && h.niv >= 4 && Math.abs(h.x - b.x) < 6 && Math.abs(h.y - b.y) < 6) n++; });
      if (n > meilleur) { meilleur = n; cible = b; }
    });
    if (cible) rendu.centrerSur(cible.x + 1, cible.y + 1); else centrerVille(e);
    fond = { e: e, acc: 0, x0: rendu.cam.x };
    fond.fixe = true;
  }
  // Images du jeu : la vraie interface, en pleine partie, figée (aucun son, aucune sauvegarde).
  function ouvrirApercu(n) {
    var e = chargerVille(Math.min(3, Math.max(1, n)));
    if (!e) return;
    // Quelques ticks pour que les marcheurs soient en route.
    for (var k = 0; k < 120; k++) SIM.pas(e);
    demarrerEtat(e, { figee: true });
    if (n === 2) ouvrirCategorie('alimentation');
    if (n === 3) rendu.cam.z = 1;
  }

  // ------------------------------------------------------------------------
  // Démarrage
  // ------------------------------------------------------------------------
  window.JEL_SAVE.surFermeture(function () {
    // Partie en cours : progression et ville enregistrées (reprise au même endroit).
    if (partie && !partie.figee) { JEL_SAVE.save(JEU, { niveau: Math.max(prog.niveau, partie.m.numero), score: totalEtoiles(), options: prog.options, gagnees: prog.gagnees }); sauverVilleAuto(); }
    else if (progChargee) sauverProg();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { AUDIO.pause(true); if (partie && !partie.figee && !ecran.childNodes.length) ecranPause(); }
    else AUDIO.pause(false);
  });

  orienter();
  // Bouton de langue de la barre de jeu (placé par l'interface : data-coin="aucun").
  try { I18N.creerSelecteur({ conteneur: $('langue-barre'), isole: true }); } catch (err) { /* sélecteur indisponible */ }
  majBoutonSon();
  requestAnimationFrame(boucle);

  // Outils de mise au point (cahier, section 19.5), seulement avec ?debug=1 dans le lanceur.
  if (window.JEL_DEBUG) {
    window.MM_DEBUG = {
      fonds: function (n) { if (partie) partie.e.tresor += n || 10000; },
      vitesse20: function () { D.temps.vitesses[D.temps.vitesses.length - 1] = 20; },
      incendie: function () { if (partie) { var b = partie.e.batiments.filter(function (x) { return x.type === 'logement' && x.hab > 0; })[0]; if (b) SIM._outils.enflammer(partie.e, b); } },
      etat: function () { return partie && partie.e; },
      vue: function (x, y, z) { rendu.centrerSur(x, y); if (z) rendu.zoomerVers(z); },
      invariants: function () { return partie ? SIM.invariants(partie.e) : []; },
      // Une ville d'exemple (1 à 3) ouverte comme une vraie partie, pour essayer l'interface.
      ville: function (n) { var e = chargerVille(n || 3); if (!e) return false; prog.options.geste = true; fermerEcran(); demarrerEtat(e); return true; },
      // Une partie enregistrée (texte d'une sauvegarde exportée) ouverte telle quelle.
      importer: function (txt) { var e = SIM.importer(txt); prog.options.geste = true; fermerEcran(); demarrerEtat(e); return true; },
      // Panneau d'information d'un bâtiment, par son numéro.
      info: function (id) { if (!partie || !SIM.batiment(partie.e, id)) return false; rendu.selection = id; ouvrirPanneau(function (p) { remplirBatiment(p, id); }); return true; }
    };
  }

  if (window.JEL_AFFICHE) { dessinerAffiche(); return; }
  if (window.JEL_APERCU) { ouvrirApercu(Number(window.JEL_APERCU) || 1); return; }
  ecranTitre();

})();
