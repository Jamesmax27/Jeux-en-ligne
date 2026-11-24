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
  var prog = { niveau: 1, gagnees: {}, options: { son: true, pauseCritique: false, defilement: 2, geste: false, auto: 0 } };
  var progChargee = false;
  function lireProg(d) {
    if (!d || typeof d !== 'object') return;
    if (d.gagnees && typeof d.gagnees === 'object') prog.gagnees = d.gagnees;
    if (d.options && typeof d.options === 'object') for (var k in d.options) if (k in prog.options) prog.options[k] = d.options[k];
    prog.niveau = Math.max(1, Math.min(MISSIONS.length, (d.niveau | 0) || 1));
  }
  function chargerProg(d) { lireProg(d); progChargee = true; appliquerOptions(); }
  function totalEtoiles() { var s = 0; for (var k in prog.gagnees) s += prog.gagnees[k] | 0; return Math.min(MAX_ETOILES, s); }
  function sauverProg() {
    if (!progChargee) return;
    try { window.JEL_SAVE.save(JEU, { niveau: prog.niveau, score: totalEtoiles(), options: prog.options, gagnees: prog.gagnees }); } catch (e) { /* sans stockage */ }
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
    if (m.echelon === 1) return true;
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
    if (!options.figee) prog.niveau = Math.max(prog.niveau, partie.m.numero);
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
    var e = SIM.nouvelle(m.id, {});
    demarrerEtat(e);
    AUDIO.jouer('etape');
  }
  function quitterPartie() {
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
        if (m.critique || m.cle === 'msg.nouvelleAnnee') toast(t(m.cle, m.vars), m.critique);
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
    securite: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="#b03a2e" stroke="#6e1f17"/><path d="M12 8c2 2.5 3 4 3 5.5a3 3 0 0 1-6 0c0-1.5 1-3 3-5.5z" fill="#f8d24a"/>'
  };
  var categorieOuverte = null;
  function categoriesMission() {
    var m = partie.m;
    return D.categories.filter(function (c) { return m.batiments.some(function (b) { return D.batiments[b].categorie === c; }); });
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
    partie.m.batiments.filter(function (k) { return D.batiments[k].categorie === c; }).forEach(function (k) {
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
  function ligne(a, b) { return el('div', { classe: 'ligne' }, [el('span', { texte: a }), el('strong', { texte: b })]); }
  function jauge(f) { var j = el('div', { classe: 'jauge' }, [el('i')]); j.firstChild.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; return j; }

  function ouvrirInfo(sx, sy) {
    if (!partie) return;
    var c = rendu.versCase(sx, sy);
    if (!c) return;
    var e = partie.e, b = SIM.batA(e, c[0], c[1]);
    AUDIO.jouer('menu');
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
    if (d.genre === 'ferme') { p.appendChild(ligne(t('info.production'), nb(b.prog / 100) + ' %')); p.appendChild(jauge(b.prog / 10000)); }
    if (d.genre === 'ecole_art') { p.appendChild(ligne(t('info.formation'), nb(b.prog / 100) + ' %')); p.appendChild(jauge(b.prog / 10000)); }
    if (d.genre === 'grenier') {
      p.appendChild(ligne(t('info.stockTotal'), t('info.surTotal', { n: nb(SIM.totalStock(b) / 100), max: nb(D.regles.grenier.capacite / 100) })));
      p.appendChild(jauge(SIM.totalStock(b) / D.regles.grenier.capacite));
    }
    if (d.genre === 'grenier' || d.genre === 'marche') D.aliments.forEach(function (a) { if (b.stocks[a]) p.appendChild(ligne(t('bien.' + a), t('info.unites', { n: nb(b.stocks[a]) }))); });
    if (d.genre === 'spectacle') p.appendChild(ligne(t('info.spectacle'), b.spect > 0 ? t('info.jours', { n: b.spect }) : t('info.aucunSpectacle')));
    if (d.genre === 'reservoir') p.appendChild(ligne(t('info.reservoir'), t(b.plein ? 'info.plein' : 'info.vide')));
    if (d.genre === 'incendie') p.appendChild(ligne(t('info.brule'), t('info.jours', { n: b.jours })));
    if (d.genre !== 'ruines' && d.genre !== 'incendie' && partie.m.risques) {
      p.appendChild(ligne(t('info.risqueFeu'), nb(b.feu / 100) + ' %'));
      p.appendChild(ligne(t('info.dommages'), nb(b.dom / 100) + ' %'));
    }
  }
  function remplirMaison(p, h) {
    var e = partie.e, inf = SIM.infosMaison(e, h);
    if (h.hab <= 0) { p.appendChild(el('p', { texte: t('info.terrainVague') })); return; }
    p.appendChild(ligne(t('info.habitants'), t('info.surTotal', { n: h.hab, max: SIM.capacite(h) })));
    var viv = 0; D.aliments.forEach(function (a) { viv += h.viv[a] || 0; });
    p.appendChild(ligne(t('info.reserve'), t('info.mois', { n: I18N.nombre(inf.conso ? Math.floor(viv * 10 / inf.conso) / 10 : 0) })));
    if (partie.m.batiments.indexOf('forum') >= 0) p.appendChild(el('p', { classe: h.svc.impot > 0 ? 'ok' : 'ko', texte: t(h.svc.impot > 0 ? 'info.recensee' : 'info.nonRecensee') }));
    p.appendChild(el('h3', { texte: t('info.besoinsActuels') }));
    var actuels = D.maisons[h.niv - 1].besoinsCumul, aucun = true;
    Object.keys(actuels).forEach(function (k) {
      aucun = false;
      p.appendChild(el('p', { classe: (inf.satisfaits[k] || 0) >= actuels[k] ? 'ok' : 'ko', texte: besoinTexte(k, actuels[k]) }));
    });
    if (aucun) p.appendChild(el('p', { texte: t('info.aucunBesoin') }));
    if (inf.suivant) {
      p.appendChild(el('h3', { texte: t('info.pourMonter', { niveau: t('maison.n' + inf.suivant) }) }));
      if (!inf.manque.length) p.appendChild(el('p', { classe: 'ok', texte: t('info.bientot') }));
      inf.manque.forEach(function (x) { p.appendChild(el('p', { classe: 'ko', texte: besoinTexte(x.besoin, x.requis) })); });
    }
    if (partie.m.risques) { p.appendChild(ligne(t('info.risqueFeu'), nb(h.feu / 100) + ' %')); }
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
  }
  function remplirTerrain(p, x, y) {
    var e = partie.e, i = y * e.N + x, tt = e.terrain[i];
    var noms = ['terrain.herbe', 'terrain.prairie', 'terrain.arbres', 'terrain.rochers', 'terrain.eau'];
    p.appendChild(el('h2', { texte: e.route[i] ? t(e.route[i] === SIM.R.ROME ? 'terrain.rome' : e.route[i] === SIM.R.BARRIERE ? 'bat.barriere.nom' : 'bat.route.nom') : e.aqueduc[i] ? t('bat.aqueduc.nom') : t(noms[tt]) }));
    if (tt === SIM.T.PRAIRIE) p.appendChild(ligne(t('info.fertilite'), e.fertilite[i] + ' %'));
    if (e.route[i] === SIM.R.ROME) p.appendChild(el('p', { texte: t('terrain.romeAide') }));
    else if (e.route[i] === SIM.R.BARRIERE) p.appendChild(el('p', { texte: t('bat.barriere.aide') }));
    else p.appendChild(el('p', { texte: t(noms[tt] + 'Aide') }));
    if (e.eauFontaine[i] || e.eauPuits[i]) p.appendChild(el('p', { classe: 'ok', texte: t(e.eauFontaine[i] ? 'besoin.eau2' : 'besoin.eau1') }));
  }

  function ouvrirConseil() {
    if (!partie) return;
    ouvrirPanneau(function (p) {
      var e = partie.e;
      p.appendChild(el('h2', { texte: t('conseil.titre') }));
      p.appendChild(el('h3', { texte: t('conseil.objectifs') }));
      SIM.objectifs(e).forEach(function (o) { p.appendChild(el('p', { classe: o.fait ? 'ok' : 'ko', texte: t('obj.' + o.cle, { n: nb(o.cible), v: nb(o.valeur) }) })); });
      p.appendChild(el('h3', { texte: t('conseil.cite') }));
      p.appendChild(ligne(t('hud.population'), nb(e.pop)));
      p.appendChild(ligne(t('conseil.places'), nb(SIM.placesLibres(e))));
      p.appendChild(ligne(t('conseil.humeur'), t('info.surTotal', { n: e.humeur, max: 100 })));
      p.appendChild(jauge(e.humeur / 100));
      var det = SIM.variationHumeur(e).detail;
      Object.keys(det).forEach(function (k) { p.appendChild(el('p', { classe: det[k] >= 0 ? 'ok' : 'ko', texte: t('humeur.' + k, { n: (det[k] > 0 ? '+' : '') + det[k] }) })); });
      if (e.humeur < D.regles.immigration.humeurMin) p.appendChild(el('p', { classe: 'etat-ko', texte: t('conseil.immigrationArretee') }));
      p.appendChild(el('h3', { texte: t('conseil.travail') }));
      p.appendChild(ligne(t('conseil.travailleurs'), nb(e.travailleurs)));
      p.appendChild(ligne(t('conseil.emplois'), t('info.surTotal', { n: nb(e.emplois), max: nb(e.emploisRequis) })));
      p.appendChild(ligne(t('conseil.chomage'), e.chomage + ' %'));
      p.appendChild(reglage(t('conseil.salaire', { n: e.salaire, rome: e.salaireRome }), function (s) { commander({ type: 'reglage', cle: 'salaire', valeur: e.salaire + s }); }));
      p.appendChild(el('h3', { texte: t('conseil.finances') }));
      p.appendChild(reglage(t('conseil.impot', { n: e.impot }), function (s) { commander({ type: 'reglage', cle: 'impot', valeur: e.impot + s }); }));
      var an = e.finances.an, prec = e.finances.prec;
      p.appendChild(ligne(t('conseil.impotsAn'), nb(an.impots)));
      p.appendChild(ligne(t('conseil.salairesAn'), nb(an.salaires)));
      p.appendChild(ligne(t('conseil.constructionsAn'), nb(an.constructions)));
      if (prec.impots || prec.salaires || prec.constructions) p.appendChild(ligne(t('conseil.anPasse'), t('conseil.bilan', { i: nb(prec.impots), s: nb(prec.salaires), c: nb(prec.constructions) })));
    });
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
        var r = el('div', { classe: 'msg' + (x.critique ? ' critique' : '') }, [el('span', { texte: t(x.cle, x.vars) })]);
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
      [null, 'eau', 'feu', 'dommages', 'stocks'].forEach(function (c) {
        if ((c === 'feu' || c === 'dommages') && !partie.m.risques) return;
        if (c === 'stocks' && partie.m.batiments.indexOf('grenier') < 0 && partie.m.batiments.indexOf('marche') < 0) return;
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
      bouton(t('missions.charger'), function () { ecranSauvegardes('charger', ecranMissions); }, 'gros non'),
      bouton(t('ui.retour'), ecranTitre, 'gros non')
    ]));
    ouvrirEcran(carte, { retour: ecranTitre });
  }
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
    carte.appendChild(el('h2', { texte: t('conseil.objectifs') }));
    var ul = el('div', { classe: 'objectifs' });
    Object.keys(m.objectifs).forEach(function (k) { ul.appendChild(el('p', { texte: '• ' + t('obj.' + k, { n: nb(m.objectifs[k]), v: '' }) })); });
    carte.appendChild(ul);
    if (prog.gagnees[m.id]) carte.appendChild(el('p', {}, [t('briefing.dejaGagnee') + ' ', etoilesTexte(prog.gagnees[m.id])]));
    carte.appendChild(el('p', { texte: t('briefing.etoiles', { mois: m.dateCibleMois }) }));
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
      el('p', { texte: t('mission.' + partie.m.id + '.nom') + ' · ' + t('hud.date', { mois: t('mois.' + SIM.date(partie.e).mois), annee: anneeTexte(SIM.date(partie.e).annee) }) }),
      el('div', { classe: 'boutons' }, [
        bouton(t('pause.reprendre'), fermerEcran, 'gros or'),
        bouton(t('pause.sauver'), function () { ecranSauvegardes('sauver', ecranPause); }, 'gros non'),
        bouton(t('pause.charger'), function () { ecranSauvegardes('charger', ecranPause); }, 'gros non'),
        bouton(t('pause.exporter'), exporterVille, 'gros non'),
        bouton(t('pause.options'), function () { ecranOptions(ecranPause); }, 'gros non'),
        bouton(t('pause.recommencer'), function () { var m = partie.m; fermerEcran(); nouvelleMission(m); }, 'gros non'),
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
      return bouton(t(nom) + ' : ' + t(o[cle] ? 'ui.oui' : 'ui.non'), function () { o[cle] = !o[cle]; if (cle === 'son') { AUDIO.couper(!o.son); majBoutonSon(); } sauverProg(); ecranOptions(retour); }, 'gros non');
    };
    var carte = el('div', { classe: 'carte-ecran' }, [
      el('h1', { texte: t('options.titre') }),
      el('div', { classe: 'boutons' }, [
        bascule('son', 'options.son'),
        bascule('pauseCritique', 'options.pauseCritique'),
        bouton(t('options.defilement') + ' : ' + t('options.defilement' + o.defilement), function () { o.defilement = (o.defilement + 1) % 4; sauverProg(); ecranOptions(retour); }, 'gros non'),
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
    var meta = { mission: e.mission, mois: d.mois, annee: d.annee, pop: e.pop, quand: Date.now() };
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
        var desc = m ? t('sauve.resume', { mission: t('mission.' + m.mission + '.nom'), date: t('hud.date', { mois: t('mois.' + m.mois), annee: anneeTexte(m.annee) }), pop: nb(m.pop) }) : t('sauve.vide');
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
    try { window.JEL_SAVE.save(JEU, { niveau: prog.niveau, score: totalEtoiles(), options: prog.options, gagnees: prog.gagnees }); } catch (err) { /* sans stockage */ }
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
      invariants: function () { return partie ? SIM.invariants(partie.e) : []; }
    };
  }

  if (window.JEL_AFFICHE) { dessinerAffiche(); return; }
  if (window.JEL_APERCU) { ouvrirApercu(Number(window.JEL_APERCU) || 1); return; }
  ecranTitre();

})();
