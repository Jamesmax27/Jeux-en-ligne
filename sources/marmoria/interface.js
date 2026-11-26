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
  var prog = { niveau: 1, gagnees: {}, fortune: 0, options: { son: true, musique: true, pauseCritique: false, defilement: 2, geste: false, auto: 0 } };
  var progChargee = false;
  function lireProg(d) {
    if (!d || typeof d !== 'object') return;
    if (d.gagnees && typeof d.gagnees === 'object') prog.gagnees = d.gagnees;
    if (d.options && typeof d.options === 'object') for (var k in d.options) if (k in prog.options) prog.options[k] = d.options[k];
    prog.niveau = Math.max(1, Math.min(MISSIONS.length, (d.niveau | 0) || 1));
    prog.fortune = Math.max(0, d.fortune | 0); // fortune du gouverneur, gardée d'une mission à l'autre (section 11.6)
    if (d.vus && typeof d.vus === 'object') prog.vus = d.vus; // tutoriels de bâtiments déjà lus (cahier 23.16)
  }
  function chargerProg(d) { lireProg(d); progChargee = true; appliquerOptions(); }
  function totalEtoiles() { var s = 0; for (var k in prog.gagnees) s += prog.gagnees[k] | 0; return Math.min(MAX_ETOILES, s); }
  function sauverProg() {
    if (!progChargee) return;
    try { window.JEL_SAVE.save(JEU, { niveau: prog.niveau, score: totalEtoiles(), options: prog.options, gagnees: prog.gagnees, fortune: prog.fortune, vus: prog.vus || {} }); } catch (e) { /* sans stockage */ }
  }
  function appliquerOptions() { AUDIO.couper(!prog.options.son); AUDIO.musiqueActive(prog.options.musique !== false); majBoutonSon(); }
  // Lecture seule au lancement (son coupé, geste déjà vu) : jamais d'écriture depuis l'écran titre.
  try { lireProg(window.JEL_SAVE.load(JEU)); } catch (e) { /* valeurs par défaut */ }
  AUDIO.couper(!prog.options.son);
  AUDIO.musiqueActive(prog.options.musique !== false);

  function echelonsGagnes() {
    var vus = {};
    MISSIONS.forEach(function (m) { if (prog.gagnees[m.id]) vus[m.echelon] = 1; });
    return Object.keys(vus).length;
  }
  function campagneFinie() { return echelonsGagnes() >= D.rangs.length; }
  // Mission proposée après une victoire : l'échelon suivant, dans la même province si possible ;
  // sinon la première mission ouverte et pas encore gagnée.
  function missionSuivante(m) {
    var ouvertes = MISSIONS.filter(function (x) { return x.dispo && missionOuverte(x) && !prog.gagnees[x.id]; });
    var suivantes = ouvertes.filter(function (x) { return x.echelon === m.echelon + 1; });
    return suivantes.filter(function (x) { return x.province === m.province; })[0] || suivantes[0] || ouvertes[0] || null;
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
    partie = { e: e, m: mission(e.mission) || SIM.mission(e), iv: D.temps.vitesseDepart, acc: 0, figee: !!options.figee, dernierMsg: e.journal[e.journal.length - 1] || null,
      tuto: e.tuto, annee: SIM.date(e).annee, log: [], derniere: 0, finVue: !!(e.victoire || e.defaite) };
    rendu.e = e;
    e._gains = [];
    rendu.calque = null; rendu.apercu = null; rendu.selection = 0;
    rendu.cam.z = 1;
    centrerVille(e);
    ecran.className = ''; vider(ecran);
    hud.hidden = false;
    construireMenu();
    fermerPanneau();
    majTuto(false);
    majHud();
    if (!options.figee && !e.libre && !e.province) prog.niveau = Math.max(prog.niveau, partie.m.numero);
    // Cité d'une province : bouton du panneau, première synchronisation tout de suite.
    $('b-province').hidden = !e.province;
    $('b-commerce').hidden = !(partie.m.empire && partie.m.empire.cites && partie.m.empire.cites.length);
    provinceSync = { enCours: false, dernier: 0, envoyes: e.province ? e.province.n : 0, signal: null, echecs: 0, reussite: 0 };
    provinceOuvert = false;
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
    presenterNouveaux(m);
  }
  function quitterPartie() {
    finirOrdre();
    if (partie && partie.e.province) synchroProvince(); // dernier envoi (la ville est enregistrée avant)
    partie = null; AUDIO.musique(null);
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
      if (ts - dernierHud > 250) { majHud(); dernierHud = ts; if (panneauVivant) panneauVivant(); rythmeProvince(); }
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
    if (!partie.finVue && e.victoire) { partie.finVue = true; if (e.victoire.province) ecranVictoireProvince(); else ecranVictoire(); }
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
    choisirMusique();
  }
  // Ambiance de la musique (section 18.5) : combat tant que des ennemis sont sur la carte, menace
  // quand une armée arrive dans 3 mois ou moins, grande ville dès 1 500 habitants, sinon petite ville.
  function choisirMusique() {
    if (!partie || partie.figee) { AUDIO.musique(null); return; }
    var e = partie.e, amb = 'petite';
    var ennemis = (e.unites || []).some(function (u) { return u.c === 1 && !u.mort && u.etat !== 'absent'; });
    if (e.invasion && ennemis) amb = 'combat';
    else if (SIM.armees(e).some(function (a) { return a.mois <= 3; })) amb = 'menace';
    else if (e.pop >= 1500) amb = 'grande';
    AUDIO.musique(amb);
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
      b.addEventListener('click', function () {
        AUDIO.demarrer();
        // Catégorie à un seul choix (zone de logement, déblayer) : l'outil est pris d'un clic,
        // sans sous-menu ; un second clic le repose (retour du propriétaire, cahier 23.16).
        var seul = choixUnique(c);
        if (seul) {
          if (outil && outil.type === seul) { AUDIO.jouer('menu'); annulerOutil(); ouvrirCategorie(null); return; }
          if (partie.e.debloques.indexOf(seul) < 0) { AUDIO.jouer('refus'); toast(t('outil.verrouille')); return; }
          AUDIO.jouer('menu');
          if (estNouveau(seul)) { ecranTutoBatiment([seul], 0); return; }
          choisirOutil(seul, true);
          return;
        }
        AUDIO.jouer('menu');
        ouvrirCategorie(categorieOuverte === c ? null : c);
      });
      nav.appendChild(b);
    });
    ouvrirCategorie(null);
  }
  function choixUnique(c) {
    var l = permis().filter(function (k) { return D.batiments[k].categorie === c; });
    return l.length === 1 ? l[0] : null;
  }
  function ouvrirCategorie(c) {
    categorieOuverte = c;
    // Bouton allumé : la catégorie ouverte, ou celle de l'outil à un seul choix tenu en main.
    document.querySelectorAll('.cat').forEach(function (b) { b.classList.toggle('actif', b.dataset.cat === c || (!c && !!outil && choixUnique(b.dataset.cat) === outil.type)); });
    var sm = $('sous-menu');
    if (!c) { sm.hidden = true; return; }
    vider(sm);
    sm.appendChild(el('h3', { texte: t('cat.' + c) }));
    permis().filter(function (k) { return D.batiments[k].categorie === c; }).forEach(function (k) {
      var d = D.batiments[k], ouvert = partie.e.debloques.indexOf(k) >= 0;
      var cout = k === 'deblayer' ? t('outil.parCase', { n: nb(d.cout) }) : nb(d.cout);
      var nouveau = estNouveau(k);
      var b = el('button', { classe: 'choix' + (ouvert ? '' : ' verrou') + (outil && outil.type === k ? ' actif' : ''), 'data-bat': k }, [
        DS.vignette(k, 44), el('span', { classe: 'nom' }, [t('bat.' + k + '.nom'), nouveau ? el('span', { classe: 'marque-nouveau', texte: t('tutoB.nouveau') }) : null]), el('span', { classe: 'cout', texte: cout })
      ]);
      b.addEventListener('click', function () {
        AUDIO.demarrer();
        if (!ouvert) { AUDIO.jouer('refus'); toast(t('outil.verrouille')); return; }
        AUDIO.jouer('menu');
        // Bâtiment jamais vu dans la campagne : sa fiche de tutoriel d'abord (« Le construire »).
        if (estNouveau(k)) { ouvrirCategorie(null); ecranTutoBatiment([k], 0); return; }
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
  function choisirOutil(type, direct) {
    outil = { type: type, d: D.batiments[type], a: null, b: null, actif: false, attente: false };
    ouvrirCategorie(null);
    fermerPanneau();
    $('valider').hidden = true;
    if (!direct) toast(t(estTactile ? 'outil.aideTactile' : 'outil.aideSouris', { nom: t('bat.' + type + '.nom') }));
  }
  function annulerOutil() {
    outil = null;
    document.querySelectorAll('.cat.actif').forEach(function (b) { if (b.dataset.cat !== categorieOuverte) b.classList.remove('actif'); });
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
  $('b-province').addEventListener('click', function () { AUDIO.jouer('menu'); ouvrirProvince(); });
  $('b-commerce').addEventListener('click', function () { AUDIO.jouer('menu'); if (panneauVivant && $('panneau').classList.contains('grand')) fermerPanneau(); else ouvrirCommerce(); });
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
  function ouvrirPanneau(remplir, classe) {
    var p = $('panneau');
    p.classList.toggle('grand', classe === 'grand');
    panneauVivant = function () { var h = p.scrollTop; vider(p); p.appendChild(el('button', { classe: 'ico fermer', aria: t('info.fermer'), clic: fermerPanneau, texte: '✕' })); remplir(p); p.scrollTop = h; };
    p.hidden = false;
    panneauVivant();
    ouvrirCategorie(null);
  }
  function fermerPanneau() { var p = $('panneau'); p.hidden = true; p.classList.remove('grand'); panneauVivant = null; rendu.selection = 0; }
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
    if (v.siege !== undefined && partie) v.voisin = nomSiege(partie.e, v.siege);
    if (v.deniers !== undefined) v.deniers = nb(v.deniers);
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
    var typeAide = b.type;
    p.appendChild(el('button', { classe: 'lien-aide', texte: t('aide.fiche'), clic: function () { AUDIO.jouer('clic'); fermerPanneau(); ecranAide(fermerEcran, 'bat:' + typeAide); } }));
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
    if (permet('forum')) {
      p.appendChild(el('p', { classe: h.svc.impot > 0 ? 'ok' : 'ko', texte: t(h.svc.impot > 0 ? 'info.recensee' : 'info.nonRecensee') }));
      // Impôt accumulé depuis le dernier passage du percepteur (cahier 23.16).
      if (h.dm > 0) p.appendChild(el('p', { classe: 'aide', texte: t('info.impotDu', { d: nb(Math.floor(h.du || 0)), n: h.dm }) }));
    }
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
      ['impots', 'exports', 'voisins', 'secours', 'dons'].forEach(poste);
      var attente = 0;
      e.batiments.forEach(function (h) { if (h.type === 'logement' && h.du > 0) attente += h.du; });
      if (attente >= 1) p.appendChild(el('p', { classe: 'aide', texte: t('conseil.impotsAttente', { n: nb(Math.floor(attente)) }) }));
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
  // Onglet du Gouvernement : un bouton ouvre la carte en grand ; les réglages des biens suivent.
  CONSEILLERS.commerce = function (p, e) {
    if (partie.m.empire) p.appendChild(el('div', { classe: 'boutons' }, [bouton(t('commerce.ouvrirCarte'), ouvrirCommerce, 'gros or')]));
    reglagesBiens(p, e);
  };
  function reglagesBiens(p, e) {
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
  }

  // --- Grand écran du commerce (retour du propriétaire du 26 novembre 2026, cahier 23.16) -------
  // Bouton de la barre du haut : la carte de l'Empire en grand. À côté de chaque cité, les biens
  // qu'elle achète (flèche verte : la ville peut les lui vendre) et ceux qu'elle vend (flèche
  // bleue : la ville peut les lui acheter) ; à droite, la fiche de la cité touchée (ouverture de
  // la route, quotas) et les réglages des biens. La carte est dessinée à la taille de l'écran.
  var URL_BIENS = {}, defilCommerce = 0;
  function urlBien(g) { return URL_BIENS[g] || (URL_BIENS[g] = DS.imageBien(g, 40).toDataURL()); }
  function ouvrirCommerce() {
    if (!partie || !partie.m.empire) return;
    ouvrirPanneau(function (p) {
      var e = partie.e;
      p.appendChild(el('h2', { texte: t('commerce.carte') }));
      var gauche = el('div', { classe: 'cg-carte' }), droite = el('div', { classe: 'cg-cote' });
      p.appendChild(el('div', { classe: 'commerce-grand' }, [gauche, droite]));
      grandeCarteEmpire(gauche, e);
      var leg = el('p', { classe: 'aide legende-commerce' });
      leg.innerHTML = '<span class="fl-achete">▲</span> ' + echapper(t('commerce.legendeAchete')) + ' &nbsp; <span class="fl-vend">▼</span> ' + echapper(t('commerce.legendeVend'));
      droite.appendChild(leg);
      if (citeChoisie && SIM.citeDe(e, citeChoisie)) ficheCite(droite, e, citeChoisie);
      else droite.appendChild(el('p', { classe: 'aide', texte: t('commerce.toucheCite') }));
      reglagesBiens(droite, e);
      droite.scrollTop = defilCommerce;
      droite.addEventListener('scroll', function () { defilCommerce = droite.scrollTop; });
    }, 'grand');
  }
  // Biens montrés à côté d'une cité : [achetés par elle, vendus par elle]. Cité d'un joueur de la
  // province : ce qu'il a mis à son étal (il n'achète que par ses demandes).
  function biensCite(e, c) {
    var vj = e.province && c.voisin !== undefined && c.voisin !== null ? e.province.voisins[c.voisin] : null;
    if (vj && vj.pris && vj.actif) return [[], Object.keys(vj.etal || {}).filter(function (g) { return vj.etal[g] > 0; })];
    return [Object.keys(c.achete || {}), Object.keys(c.vend || {})];
  }
  function grandeCarteEmpire(box, e) {
    var m = partie.m, em = m.empire, v = em.vue;
    if (!em) return;
    var ratio = (v[3] - v[1]) / (v[2] - v[0]) * 1.25;
    var dw = Math.max(200, box.clientWidth || 300), dh = Math.max(140, box.clientHeight || 220);
    var L = Math.floor(Math.min(dw, dh / ratio)), H = Math.floor(L * ratio), k = L / 200;
    var fs = Math.round(Math.max(10, Math.min(15, L / 46))), is = Math.round(Math.max(13, Math.min(24, L / 30)));
    var X = function (q) { return (q[0] - v[0]) / (v[2] - v[0]) * L; }, Y = function (q) { return (v[3] - q[1]) / (v[3] - v[1]) * H; };
    var f1 = function (n) { return n.toFixed(1); };
    var pts = function (l) { return l.map(function (q) { return f1(X(q)) + ',' + f1(Y(q)); }).join(' '); };
    var s = '<svg viewBox="0 0 ' + L + ' ' + H + '" width="' + L + '" height="' + H + '" class="empire" role="img" aria-label="' + echapper(t('commerce.carte')) + '">';
    s += '<rect width="' + L + '" height="' + H + '" fill="#d8c79a"/><polygon points="' + pts(MER) + '" fill="#5f97b8" stroke="#3f6f8a" stroke-width="' + f1(0.6 * k) + '"/>';
    ILES.forEach(function (i) { s += '<polygon points="' + pts(i) + '" fill="#d8c79a" stroke="#3f6f8a" stroke-width="' + f1(0.4 * k) + '"/>'; });
    var visibles = em.cites.filter(function (c) { var r = e.routes[c.id]; return r && r.v; });
    visibles.forEach(function (c) {
      var r = e.routes[c.id], actif = SIM.routeActive(e, c);
      s += '<line x1="' + f1(X(em.ville)) + '" y1="' + f1(Y(em.ville)) + '" x2="' + f1(X(c.pos)) + '" y2="' + f1(Y(c.pos)) + '" stroke="' + (actif ? '#b8862b' : r.o ? '#9a6a50' : '#7a7262') + '" stroke-width="' + f1((actif ? 2.4 : 1.2) * Math.min(k, 2)) + '"' + (c.route === 'mer' ? ' stroke-dasharray="6 4"' : '') + '/>';
    });
    s += armeesEmpire(e, function (q) { return f1(X(q)); }, function (q) { return f1(Y(q)); }, em).replace(/font-size="5.6"/g, 'font-size="' + fs + '"');
    // Étiquettes : placées une à une, sans se chevaucher quand c'est possible.
    var pris = [], etiq = '', pointsSvg = '';
    var largeur = function (txt) { return txt.length * fs * 0.56; };
    var chevauche = function (a) { var n = 0; pris.forEach(function (b) { var dx = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]), dy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]); if (dx > 0 && dy > 0) n += dx * dy; }); return n; };
    var placer = function (px, py, w, h) {
      var d = 7, cands = [[px + d, py - h / 2], [px - d - w, py - h / 2], [px - w / 2, py - d - h], [px - w / 2, py + d], [px + d, py - h - 2], [px + d, py + 2], [px - d - w, py - h - 2], [px - d - w, py + 2],
        [px + 3 * d, py - h / 2], [px - 3 * d - w, py - h / 2], [px - w / 2, py - 3 * d - h], [px - w / 2, py + 3 * d]];
      var meilleur = null, mn = Infinity;
      cands.forEach(function (c) {
        var r = [Math.max(2, Math.min(L - w - 2, c[0])), Math.max(2, Math.min(H - h - 2, c[1])), w, h], n = chevauche(r);
        if (n < mn) { mn = n; meilleur = r; }
      });
      pris.push(meilleur);
      return meilleur;
    };
    var point = function (q, rayon, fond, contour) { pris.push([X(q) - rayon, Y(q) - rayon, 2 * rayon, 2 * rayon]); return '<circle cx="' + f1(X(q)) + '" cy="' + f1(Y(q)) + '" r="' + rayon + '" fill="' + fond + '" stroke="' + contour + '" stroke-width="1.5"/>'; };
    pointsSvg += point(em.rome, 6, '#a8322a', '#f4e8c8') + point(em.ville, 6, '#f0c040', '#5a3a10');
    visibles.forEach(function (c) { var r = e.routes[c.id]; pointsSvg += '<g data-cite="' + c.id + '" class="cite">' + point(c.pos, citeChoisie === c.id ? 7 : 5.5, r.o ? '#f4e8c8' : '#bdb39a', citeChoisie === c.id ? '#f0c040' : '#4a3a28') + '</g>'; });
    var nomSimple = function (q, texte, coul) {
      var w = largeur(texte) + 10, h = fs + 8, r = placer(X(q), Y(q), w, h);
      return '<g pointer-events="none"><rect x="' + f1(r[0]) + '" y="' + f1(r[1]) + '" width="' + f1(w) + '" height="' + h + '" rx="5" fill="rgba(244,234,208,0.92)" stroke="' + coul + '" stroke-width="1.2"/>' +
        '<text x="' + f1(r[0] + 5) + '" y="' + f1(r[1] + h / 2 + fs * 0.36) + '" font-size="' + fs + '" font-weight="700" fill="#2a2018">' + echapper(texte) + '</text></g>';
    };
    etiq += nomSimple(em.rome, t('cite.rome'), '#a8322a');
    etiq += nomSimple(em.ville, m.voisinage ? t('cite.' + m.id) : t('mission.' + m.id + '.nom'), '#5a3a10');
    visibles.forEach(function (c) {
      var r = e.routes[c.id], bc = biensCite(e, c), nom = nomVoisine(e, c), choisie = citeChoisie === c.id;
      var lignes = [['achete', bc[0]], ['vend', bc[1]]].filter(function (x) { return x[1].length; });
      var w = Math.max(largeur(nom), Math.max.apply(null, lignes.map(function (x) { return 12 + x[1].length * (is + 2); }).concat([0]))) + 10;
      var h = fs + 8 + lignes.length * (is + 3) + (lignes.length ? 2 : 0), b = placer(X(c.pos), Y(c.pos), w, h);
      var bord = choisie ? '#f0c040' : SIM.routeActive(e, c) ? '#b8862b' : r.o ? '#9a6a50' : '#7a7262';
      var g = '<g data-cite="' + c.id + '" class="cite" tabindex="0" role="button" aria-label="' + echapper(nom) + '">';
      // Trait de rappel quand l'étiquette est loin de son point.
      var cx = Math.max(b[0], Math.min(b[0] + w, X(c.pos))), cy = Math.max(b[1], Math.min(b[1] + h, Y(c.pos)));
      if (Math.hypot(cx - X(c.pos), cy - Y(c.pos)) > 12) g += '<line x1="' + f1(X(c.pos)) + '" y1="' + f1(Y(c.pos)) + '" x2="' + f1(cx) + '" y2="' + f1(cy) + '" stroke="#4a3a28" stroke-width="1"/>';
      g += '<rect x="' + f1(b[0]) + '" y="' + f1(b[1]) + '" width="' + f1(w) + '" height="' + f1(h) + '" rx="6" fill="' + (r.o ? 'rgba(255,250,236,0.95)' : 'rgba(236,228,206,0.92)') + '" stroke="' + bord + '" stroke-width="' + (choisie ? 2.6 : 1.4) + '"' + (r.o ? '' : ' stroke-dasharray="4 3"') + '/>';
      g += '<text x="' + f1(b[0] + 5) + '" y="' + f1(b[1] + fs + 2) + '" font-size="' + fs + '" font-weight="700" fill="#2a2018">' + echapper(nom) + (r.o ? ' ✓' : '') + '</text>';
      lignes.forEach(function (x, j) {
        var y0 = b[1] + fs + 6 + j * (is + 3);
        g += '<text x="' + f1(b[0] + 4) + '" y="' + f1(y0 + is * 0.78) + '" font-size="' + Math.round(is * 0.72) + '" fill="' + (x[0] === 'achete' ? '#2f7a3a' : '#2c5f8f') + '">' + (x[0] === 'achete' ? '▲' : '▼') + '</text>';
        x[1].forEach(function (gb, n) { g += '<image href="' + urlBien(gb) + '" x="' + f1(b[0] + 14 + n * (is + 2)) + '" y="' + f1(y0) + '" width="' + is + '" height="' + is + '"><title>' + echapper(t('bien.' + gb)) + '</title></image>'; });
      });
      etiq += g + '</g>';
    });
    s += pointsSvg + etiq + '</svg>';
    var boite = el('div', { classe: 'carte-empire grande' });
    boite.style.width = L + 'px'; boite.style.height = H + 'px';
    boite.innerHTML = s;
    var choisir = function (id) { AUDIO.jouer('clic'); citeChoisie = id; defilCommerce = 0; if (panneauVivant) panneauVivant(); };
    boite.querySelectorAll('.cite').forEach(function (g) {
      g.addEventListener('click', function () { choisir(g.getAttribute('data-cite')); });
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choisir(g.getAttribute('data-cite')); } });
    });
    box.appendChild(boite);
  }
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
  function ficheCite(p, e, id) {
    var c = SIM.citeDe(e, id), r = c && e.routes[id];
    if (!c || !r || !r.v) return;
    var f = el('div', { classe: 'fiche-cite' });
    f.appendChild(el('h3', { texte: nomVoisine(e, c) }));
    f.appendChild(ligne(t('commerce.route'), t(c.route === 'mer' ? 'commerce.mer' : 'commerce.terre')));
    if (r.f > 0) f.appendChild(el('p', { classe: 'etat-ko', texte: t('commerce.fermee', { n: r.f }) }));
    // Cité d'un joueur de la province : commerce par le comptoir, à son étal.
    var vj = e.province && c.voisin !== undefined ? e.province.voisins[c.voisin] : null;
    if (vj && vj.pris && vj.actif) {
      f.appendChild(el('p', { classe: 'aide', texte: t('voisins.ficheJoueur') }));
      if (!e.province.enLigne) f.appendChild(el('p', { classe: 'etat-ko', texte: t('voisins.horsLigne') }));
      var etal = Object.keys(vj.etal || {}).filter(function (g) { return vj.etal[g] > 0; });
      f.appendChild(el('p', { classe: 'aide', texte: t(etal.length ? 'voisins.etal' : 'voisins.etalVide') }));
      etal.forEach(function (g) { f.appendChild(ligne(t('bien.' + g) + ' · ' + nb(SIM.prixVoisin(g)), t('commerce.quota', { n: SIM.echange(e, c, 'v', g), max: D.regles.commerce.voisinPlafond }))); });
    } else [['vend', 'v', 'importer'], ['achete', 'a', 'exporter']].forEach(function (q) {
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
    partie = null; AUDIO.musique(null);
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
      el('div', { classe: 'boutons' }, [bouton(t('titre.jouer'), jouer, 'gros or'), bouton(t('voisins.bouton'), ecranProvinces, 'gros non')]),
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

  // --- Carte de la campagne (retour du propriétaire du 26 novembre 2026, cahier 23.16) --------
  // L'Europe romaine en grand, Rome au centre : chaque mission à la place de sa ville, reliée à la
  // mission qui l'ouvre ; gagnée (or et étoiles), ouverte (anneau qui bat), fermée (grise). Le
  // chiffre d'un point est l'échelon. Toucher une ville ouvre sa présentation ; la liste reste
  // à un bouton. Positions en degrés (longitude, latitude), un peu écartées quand deux villes se
  // touchent (Ostie et Rome, Corinthe et Athènes).
  var POS_MISSIONS = { ostie: [11.7, 41.5], pompei: [14.49, 40.75], ravenne: [12.2, 44.42], narbo: [3.0, 43.18], aquilee: [13.37, 45.77],
    massalia: [5.37, 43.3], vindobona: [16.37, 48.21], ephese: [27.34, 37.94], burdigala: [-0.58, 44.84], alexandrie: [29.92, 31.2], leptis: [14.29, 32.64],
    corinthe: [21.6, 37.3], colonia: [6.96, 50.94], antioche: [36.16, 36.2], palmyre: [38.27, 34.55], athenes: [24.0, 38.3], eburacum: [-1.08, 53.96] };
  var ROME_CAMPAGNE = [12.9, 42.3], EUROPE = [-10.5, 29.3, 41.5, 56.5]; // ouest, sud, est, nord
  // Mers et îles hors de la Méditerranée (MER, ILES) : Atlantique et mer du Nord, Baltique, mer Noire ; Bretagne, Irlande.
  var OCEANS = [
    [[-12, 28], [-9.7, 30.4], [-9.2, 32.5], [-7.6, 33.6], [-6.8, 34.0], [-6.0, 35.5], [-5.6, 36.0], [-6.3, 36.5], [-7.4, 37.2], [-8.9, 37.0], [-8.8, 38.5], [-9.5, 38.8], [-8.9, 40.2],
      [-8.7, 41.2], [-8.9, 42.1], [-9.3, 43.0], [-8.3, 43.6], [-7.0, 43.6], [-5.6, 43.6], [-3.8, 43.45], [-1.8, 43.4], [-1.5, 43.5], [-1.2, 44.6], [-1.2, 45.8], [-2.2, 47.2],
      [-4.5, 47.8], [-4.8, 48.4], [-3.0, 48.8], [-1.6, 48.7], [-1.9, 49.7], [-1.2, 49.4], [0.1, 49.5], [1.6, 50.2], [1.6, 50.9], [2.5, 51.1], [3.6, 51.4], [4.2, 52.0], [4.7, 52.9],
      [5.5, 53.4], [7.0, 53.6], [8.5, 53.6], [8.6, 54.3], [8.6, 55.0], [8.1, 55.6], [8.1, 58], [-12, 58]],
    [[10.4, 58], [10.2, 55.6], [9.9, 54.8], [10.0, 54.4], [11.0, 54.0], [12.1, 54.2], [13.4, 54.6], [14.3, 53.9], [16.0, 54.25], [18.6, 54.4], [19.9, 54.6], [21.0, 55.3], [21.1, 58]],
    [[27.5, 42.4], [28.0, 43.2], [28.6, 44.2], [29.7, 45.2], [30.7, 46.5], [31.9, 46.6], [33.6, 46.1], [33.4, 45.2], [33.5, 44.5], [34.4, 44.4], [35.5, 45.1], [36.6, 45.4],
      [37.6, 44.8], [39.7, 43.6], [42, 41.8], [42, 41.0], [40.5, 41.0], [39.7, 41.0], [37.9, 41.0], [36.3, 41.3], [35.1, 42.0], [33.3, 41.9], [31.4, 41.3], [29.1, 41.2], [28.0, 41.6]]];
  var TERRES = [
    [[-5.7, 50.05], [-4.2, 50.35], [-3.4, 50.6], [-1.9, 50.7], [-0.8, 50.75], [1.0, 51.0], [1.4, 51.4], [0.9, 51.8], [1.75, 52.5], [1.3, 52.9], [0.3, 53.0], [0.1, 53.5], [-0.1, 54.1],
      [-1.2, 54.6], [-1.6, 55.6], [-2.1, 56.0], [-2.5, 58], [-5.5, 58], [-4.9, 55.7], [-5.1, 55.0], [-3.4, 54.9], [-3.4, 54.3], [-3.0, 53.9], [-3.1, 53.4], [-4.5, 53.4], [-4.2, 52.9],
      [-4.1, 52.3], [-5.3, 51.85], [-4.2, 51.6], [-3.2, 51.4], [-3.0, 51.25], [-4.2, 51.2]],
    [[-6.2, 53.3], [-6.4, 52.2], [-8.5, 51.6], [-10.3, 51.9], [-9.9, 53.4], [-10.1, 54.3], [-8.4, 55.2], [-6.1, 55.2], [-5.5, 54.4], [-6.0, 53.8]],
    [[11.0, 55.0], [12.6, 55.6], [12.3, 56.1], [11.2, 55.9]]];
  var carteCampagneOuverte = null;
  function ecranMissions() {
    var bloc = el('div', { classe: 'campagne' }), boite = el('div', { classe: 'cp-carte' }), cote = el('div', { classe: 'cp-cote' });
    cote.appendChild(el('h1', { texte: t('missions.titre') }));
    cote.appendChild(el('p', { texte: t('missions.bilan', { rang: rangTexte(), n: totalEtoiles(), max: MAX_ETOILES }) }));
    if (campagneFinie()) cote.appendChild(el('p', { classe: 'etat-ok', texte: t('missions.campagneFinie') }));
    var prochaine = MISSIONS.filter(function (m) { return m.dispo && missionOuverte(m) && !prog.gagnees[m.id]; })[0];
    if (prochaine) {
      cote.appendChild(el('div', { classe: 'prochaine-mission' }, [
        el('span', { classe: 'num', texte: t('missions.prochaine') }),
        el('strong', { texte: t('mission.' + prochaine.id + '.nom') }),
        bouton(t('missions.jouer'), function () { AUDIO.demarrer(); AUDIO.jouer('clic'); ecranBriefing(prochaine); }, 'gros or')
      ]));
    }
    cote.appendChild(el('p', { classe: 'aide', texte: t('missions.carteAide') }));
    cote.appendChild(el('div', { classe: 'boutons' }, [
      bouton(t('missions.liste'), ecranListeMissions, 'gros non'),
      bouton(t('libre.bouton'), function () { ecranLibre(); }, 'gros non'),
      bouton(t('missions.charger'), function () { ecranSauvegardes('charger', ecranMissions); }, 'gros non'),
      bouton(t('aide.titre'), function () { ecranAide(ecranMissions); }, 'gros non'),
      bouton(t('ui.retour'), ecranTitre, 'gros non')
    ]));
    bloc.appendChild(boite); bloc.appendChild(cote);
    ouvrirEcran(bloc, { retour: ecranTitre });
    carteCampagneOuverte = boite;
    dessinerCarteCampagne(boite);
  }
  function dessinerCarteCampagne(boite) {
    if (!boite || !boite.isConnected) { carteCampagneOuverte = null; return; }
    // Fenêtre plus haute que large (ordinateur, fenêtre étroite) : la carte au-dessus du reste.
    if (boite.parentNode) boite.parentNode.classList.toggle('colonne', W < H * 0.9);
    var E = EUROPE, kx = Math.cos(43.5 * Math.PI / 180), lu = (E[2] - E[0]) * kx, lv = E[3] - E[1];
    var dw = Math.max(200, boite.clientWidth || 400), dh = Math.max(140, boite.clientHeight || 280);
    var sc = Math.min(dw / lu, dh / lv), L = Math.floor(lu * sc), H = Math.floor(lv * sc);
    var X = function (q) { return (q[0] - E[0]) * kx * sc; }, Y = function (q) { return (E[3] - q[1]) * sc; };
    var f1 = function (n) { return n.toFixed(1); };
    var pts = function (l) { return l.map(function (q) { return f1(X(q)) + ',' + f1(Y(q)); }).join(' '); };
    var fs = Math.round(Math.max(10, Math.min(16, L / 55))), rp = Math.max(7, Math.min(13, L / 70)), petit = L < 520;
    var s = '<svg viewBox="0 0 ' + L + ' ' + H + '" width="' + L + '" height="' + H + '" role="img" aria-label="' + echapper(t('missions.titre')) + '">';
    s += '<rect width="' + L + '" height="' + H + '" fill="#dccb9c"/>';
    s += '<polygon points="' + pts(MER) + '" fill="#6aa2c2" stroke="#3f6f8a" stroke-width="1"/>';
    OCEANS.forEach(function (o) { s += '<polygon points="' + pts(o) + '" fill="#6aa2c2" stroke="#3f6f8a" stroke-width="1"/>'; });
    ILES.concat(TERRES).forEach(function (i) { s += '<polygon points="' + pts(i) + '" fill="#dccb9c" stroke="#3f6f8a" stroke-width="0.8"/>'; });
    // Chemins : chaque mission reliée à celle qui l'ouvre (même province dès l'échelon 4).
    var precedente = function (m) {
      if (m.echelon <= 1) return null;
      var l = MISSIONS.filter(function (x) { return x.echelon === m.echelon - 1; });
      return l.filter(function (x) { return x.province === m.province; })[0] || l[0];
    };
    var etat = function (m) { return prog.gagnees[m.id] ? 'gagnee' : m.dispo && missionOuverte(m) ? 'ouverte' : 'fermee'; };
    s += '<line x1="' + f1(X(ROME_CAMPAGNE)) + '" y1="' + f1(Y(ROME_CAMPAGNE)) + '" x2="' + f1(X(POS_MISSIONS.ostie)) + '" y2="' + f1(Y(POS_MISSIONS.ostie)) + '" stroke="#b8862b" stroke-width="2.5" stroke-linecap="round"/>';
    MISSIONS.forEach(function (m) {
      var p = precedente(m);
      if (!p || !POS_MISSIONS[m.id] || !POS_MISSIONS[p.id]) return;
      // Route courbe : faite (or), ouverte (tirets qui avancent), à venir (pointillés pâles).
      var e1 = etat(m), fait = prog.gagnees[p.id], a1 = POS_MISSIONS[p.id], b1 = POS_MISSIONS[m.id];
      var xa = X(a1), ya = Y(a1), xb = X(b1), yb = Y(b1), mx = (xa + xb) / 2 - (yb - ya) * 0.12, my = (ya + yb) / 2 + (xb - xa) * 0.12;
      s += '<path d="M' + f1(xa) + ' ' + f1(ya) + ' Q' + f1(mx) + ' ' + f1(my) + ' ' + f1(xb) + ' ' + f1(yb) + '" fill="none"' +
        ' stroke="' + (e1 === 'gagnee' ? '#b8862b' : fait ? '#c9793a' : '#6e6656') + '" stroke-width="' + (e1 === 'gagnee' ? 3 : fait ? 2.5 : 1.4) + '" stroke-linecap="round"' +
        (e1 === 'gagnee' ? '' : fait ? ' stroke-dasharray="7 5" class="cp-route"' : ' stroke-dasharray="2 5" opacity="0.45"') + '/>';
    });
    // Étiquettes placées une à une, sans chevauchement quand c'est possible.
    var pris = [];
    MISSIONS.forEach(function (m) { var q = POS_MISSIONS[m.id]; if (q) pris.push([X(q) - rp - 2, Y(q) - rp - 2, 2 * rp + 4, 2 * rp + 4]); });
    var chevauche = function (a) { var n = 0; pris.forEach(function (b) { var dx = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]), dy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]); if (dx > 0 && dy > 0) n += dx * dy; }); return n; };
    var etiquette = function (q, texte, gras, coul, etoiles) {
      var w = texte.length * fs * 0.56 + (etoiles >= 0 ? 3.4 * fs : 0) + 6, h = fs + 4, px = X(q), py = Y(q), d = rp + 3;
      var cands = [[px + d, py - h / 2], [px - d - w, py - h / 2], [px - w / 2, py - d - h], [px - w / 2, py + d], [px + d, py - h - 2], [px + d, py + 2], [px - d - w, py - h - 2], [px - d - w, py + 2]];
      var best = null, mn = Infinity;
      cands.forEach(function (c) { var r = [Math.max(1, Math.min(L - w - 1, c[0])), Math.max(1, Math.min(H - h - 1, c[1])), w, h], n = chevauche(r); if (n < mn) { mn = n; best = r; } });
      pris.push(best);
      var et = etoiles >= 0 ? ' <tspan fill="#d9a020" stroke="#5a3a10" stroke-width="2">' + '★★★'.slice(0, etoiles) + '☆☆☆'.slice(0, 3 - etoiles) + '</tspan>' : '';
      return '<text x="' + f1(best[0] + 3) + '" y="' + f1(best[1] + h - 4) + '" font-size="' + fs + '" font-weight="' + (gras ? 800 : 600) + '" fill="' + coul + '" stroke="rgba(246,238,214,0.92)" stroke-width="3" paint-order="stroke">' + echapper(texte) + et + '</text>';
    };
    var g = '';
    g += '<circle cx="' + f1(X(ROME_CAMPAGNE)) + '" cy="' + f1(Y(ROME_CAMPAGNE)) + '" r="' + f1(rp * 0.8) + '" fill="#a8322a" stroke="#f4e8c8" stroke-width="2"/>';
    pris.push([X(ROME_CAMPAGNE) - rp, Y(ROME_CAMPAGNE) - rp, 2 * rp, 2 * rp]);
    var noms = etiquette(ROME_CAMPAGNE, t('cite.rome'), true, '#7a1a12');
    MISSIONS.forEach(function (m) {
      var q = POS_MISSIONS[m.id];
      if (!q) return;
      var e1 = etat(m), x = X(q), y = Y(q), n = prog.gagnees[m.id] | 0;
      var fond = e1 === 'gagnee' ? '#f0c040' : e1 === 'ouverte' ? '#fff8e6' : '#bdb39a', bord = e1 === 'gagnee' ? '#6a4a10' : e1 === 'ouverte' ? '#b9573a' : '#7a7262';
      g += '<g class="cp-ville ' + e1 + '" data-mission="' + m.id + '" tabindex="0" role="button" aria-label="' + echapper(t('mission.' + m.id + '.nom') + ' · ' + t('missions.echelon', { n: m.echelon })) + '">';
      g += '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(Math.max(rp + 6, 20)) + '" fill="transparent"/>';
      if (e1 === 'ouverte') g += '<circle class="cp-pouls" cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(rp + 4) + '" fill="none" stroke="#b9573a" stroke-width="2"/>';
      g += '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(rp) + '" fill="' + fond + '" stroke="' + bord + '" stroke-width="2"/>';
      g += '<text x="' + f1(x) + '" y="' + f1(y + rp * 0.42) + '" text-anchor="middle" font-size="' + f1(rp * 1.15) + '" font-weight="800" fill="' + (e1 === 'fermee' ? '#5e584a' : '#3a2410') + '">' + m.echelon + '</text>';
      g += '</g>';
      if (!petit || e1 !== 'fermee') noms += etiquette(q, t('mission.' + m.id + '.nom'), e1 !== 'fermee', e1 === 'fermee' ? '#5e584a' : '#2a2018', e1 === 'gagnee' && !petit ? n : -1);
    });
    s += g + noms + '</svg>';
    vider(boite);
    var cadre = el('div', { classe: 'cp-cadre' });
    cadre.style.width = L + 'px'; cadre.style.height = H + 'px';
    cadre.innerHTML = s;
    var ouvrir = function (id) {
      var m = mission(id);
      AUDIO.demarrer();
      if (!m || !(m.dispo && missionOuverte(m))) { AUDIO.jouer('refus'); toastEcran(t(m && m.dispo ? 'missions.verrouilleeAide' : 'missions.bientotAide')); return; }
      AUDIO.jouer('clic');
      carteCampagneOuverte = null;
      ecranBriefing(m);
    };
    cadre.querySelectorAll('.cp-ville').forEach(function (v) {
      v.addEventListener('click', function () { ouvrir(v.getAttribute('data-mission')); });
      v.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ouvrir(v.getAttribute('data-mission')); } });
    });
    boite.appendChild(cadre);
  }
  window.addEventListener('resize', function () { if (carteCampagneOuverte) setTimeout(function () { dessinerCarteCampagne(carteCampagneOuverte); }, 60); });

  // Liste des missions (l'ancien écran), à un bouton de la carte.
  function ecranListeMissions() {
    carteCampagneOuverte = null;
    var carte = el('div', { classe: 'carte-ecran' });
    carte.appendChild(el('h1', { texte: t('missions.titre') }));
    carte.appendChild(el('p', { texte: t('missions.bilan', { rang: rangTexte(), n: totalEtoiles(), max: MAX_ETOILES }) }));
    if (campagneFinie()) carte.appendChild(el('p', { classe: 'etat-ok', texte: t('missions.campagneFinie') }));
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
      bouton(t('missions.carte'), ecranMissions, 'gros or'),
      bouton(t('ui.retour'), ecranMissions, 'gros non')
    ]));
    ouvrirEcran(carte, { retour: ecranMissions });
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
    if (n >= GESTES.length) { prog.options.geste = true; sauverProg(); fermerEcran(); if (partie) presenterNouveaux(partie.m); return; }
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
        bouton(t('aide.titre'), function () { ecranAide(ecranPause); }, 'gros non'),
        bouton(t('pause.recommencer'), function () { var m = partie.m, libre = partie.e.tout; fermerEcran(); if (libre) { choixLibre.carte = m.id; nouvelleLibre(); } else nouvelleMission(m); }, 'gros non'),
        bouton(t('pause.missions'), function () { sauverVilleAuto(); quitterVersMissions(); }, 'gros non'),
        bouton(t('pause.accueil'), function () { sauverVilleAuto(); sauverProg(); quitterPartie(); }, 'gros non')
      ])
    ]);
    ouvrirEcran(carte, { retour: fermerEcran });
  }
  function quitterVersMissions() { partie = null; AUDIO.musique(null); hud.hidden = true; annulerOutil(); ecranMissions(); }

  function ecranOptions(retour) {
    var o = prog.options;
    var bascule = function (cle, nom) {
      return bouton(deuxPoints(t(nom), t(o[cle] !== false ? 'ui.oui' : 'ui.non')), function () {
        o[cle] = o[cle] === false; if (cle === 'son') { AUDIO.couper(!o.son); majBoutonSon(); }
        if (cle === 'musique') AUDIO.musiqueActive(o.musique);
        sauverProg(); ecranOptions(retour);
      }, 'gros non');
    };
    var carte = el('div', { classe: 'carte-ecran' }, [
      el('h1', { texte: t('options.titre') }),
      el('div', { classe: 'boutons' }, [
        bascule('son', 'options.son'),
        bascule('musique', 'options.musique'),
        bascule('pauseCritique', 'options.pauseCritique'),
        bouton(deuxPoints(t('options.defilement'), t('options.defilement' + o.defilement)), function () { o.defilement = (o.defilement + 1) % 4; sauverProg(); ecranOptions(retour); }, 'gros non'),
        bouton(t('options.revoirGestes'), function () { ecranGeste(0); }, 'gros non')
      ]),
      el('div', { classe: 'boutons' }, [bouton(t('ui.retour'), retour, 'gros or')])
    ]);
    ouvrirEcran(carte, { retour: retour });
  }

  // ------------------------------------------------------------------------
  // Aide intégrée (section 17.6) : une fiche par mécanique (textes aide.<id>.*) et une fiche par
  // bâtiment, écrite d'après ses données (taille, coût, personnel, accès, production, risques…).
  // ------------------------------------------------------------------------
  var MECANIQUES = ['debut', 'routes', 'maisons', 'eau', 'nourriture', 'travail', 'industrie', 'securite', 'finances', 'religion', 'culture', 'commerce', 'empereur', 'cotes', 'armee', 'patriciens'];
  var BESOIN_SERVICE = { barbier: 'barbier', bains: 'bains', medecin: 'medecin', hopital: 'hopital', ecole: 'ecole', bibliotheque: 'bibliotheque', academie: 'academie', marche: 'nourriture', puits: 'eau', fontaine: 'eau' };
  var aideOnglet = 'mecaniques';
  function niveauBesoin(cle) { for (var k = 0; k < D.maisons.length; k++) if (D.maisons[k].besoins[cle]) return D.maisons[k].niveau; return 0; }
  function cleBesoin(id, d) {
    if (d.produit && niveauBesoin(d.produit)) return d.produit;
    if (BESOIN_SERVICE[id]) return BESOIN_SERVICE[id];
    if (d.dieu) return 'religion';
    if (d.genre === 'spectacle') return 'divertissement';
    return null;
  }
  function niveauRisque(v) { return t(!(v > 0) ? 'aide.aucun' : v >= 0.8 ? 'aide.eleve' : v >= 0.4 ? 'aide.moyen' : 'aide.faible'); }
  // --- Tutoriels des bâtiments (retour du propriétaire du 26 novembre 2026, cahier 23.16) ----
  // Dans la campagne, chaque bâtiment jamais lu porte la marque « Nouveau » dans le menu ; le
  // toucher ouvre d'abord sa fiche : à quoi il sert (texte du bâtiment) et ce qu'il faut faire
  // (étapes tirées de ses données : où le poser, route, employés, ce qu'il lui faut, ce qu'il
  // produit et pour qui), avec « Le construire ». Au début d'une mission, un écran présente
  // les nouveaux bâtiments. Ostie a son propre tutoriel pas à pas : ses bâtiments comptent
  // comme lus. Les fiches lues sont gardées dans la progression (prog.vus).
  var BASIQUES = { logement: 1, deblayer: 1, route: 1 };
  function tutoActif() { return !!partie && !partie.e.libre && !partie.e.province && !partie.figee; }
  function estNouveau(k) { return tutoActif() && !BASIQUES[k] && !(prog.vus && prog.vus[k]); }
  function marquerVu(k) { prog.vus = prog.vus || {}; if (!prog.vus[k]) { prog.vus[k] = 1; sauverProg(); } }
  function presenterNouveaux(m) {
    if (!tutoActif()) return;
    if (m.id === 'ostie') { m.batiments.forEach(marquerVu); return; }
    // Dans l'ordre du menu de construction (catégories, puis ordre de la mission).
    var l = m.batiments.filter(estNouveau).sort(function (a, b) { return D.categories.indexOf(D.batiments[a].categorie) - D.categories.indexOf(D.batiments[b].categorie) || m.batiments.indexOf(a) - m.batiments.indexOf(b); });
    if (!l.length || (ecran.childNodes.length && ecran.dataset.bloque === '1')) return;
    ecranNouveaux(l);
  }
  function ecranNouveaux(l) {
    var carte = el('div', { classe: 'carte-ecran tuto-bat' });
    carte.appendChild(el('h1', { texte: t('tutoB.nouveauxTitre') }));
    carte.appendChild(el('p', { texte: t('tutoB.nouveauxIntro', { n: l.length }) }));
    var g = el('div', { classe: 'grille-nouveaux' });
    l.forEach(function (k, i) {
      var b = el('button', { classe: 'choix' }, [DS.vignette(k, 44), el('span', { classe: 'nom', texte: t('bat.' + k + '.nom') })]);
      b.addEventListener('click', function () { AUDIO.demarrer(); AUDIO.jouer('clic'); ecranTutoBatiment(l, i); });
      g.appendChild(b);
    });
    carte.appendChild(g);
    carte.appendChild(el('p', { classe: 'aide', texte: t('tutoB.menuAide') }));
    carte.appendChild(el('div', { classe: 'boutons' }, [
      bouton(t('tutoB.unParUn'), function () { ecranTutoBatiment(l, 0); }, 'gros or'),
      bouton(t('tutoB.plusTard'), fermerEcran, 'gros non')
    ]));
    ouvrirEcran(carte, { retour: fermerEcran });
  }
  function ecranTutoBatiment(l, i) {
    var k = l[i];
    marquerVu(k);
    var carte = el('div', { classe: 'carte-ecran tuto-bat' });
    carte.appendChild(el('div', { classe: 'num', texte: l.length > 1 ? t('tutoB.titreN', { i: i + 1, n: l.length }) : t('tutoB.titre') }));
    carte.appendChild(el('div', { classe: 'tuto-tete' }, [DS.vignette(k, 64), el('h1', { texte: t('bat.' + k + '.nom') })]));
    carte.appendChild(el('h2', { texte: t('tutoB.sert') }));
    carte.appendChild(el('p', { texte: t('bat.' + k + '.aide') }));
    carte.appendChild(el('h2', { texte: t('tutoB.faire') }));
    var ol = el('ol', { classe: 'tuto-etapes' });
    etapesBatiment(k).forEach(function (x) { ol.appendChild(el('li', { texte: x })); });
    carte.appendChild(ol);
    var b = [];
    if (partie && permet(k) && partie.e.debloques.indexOf(k) >= 0) b.push(bouton(t('tutoB.construire'), function () { fermerEcran(); choisirOutil(k); }, 'gros or'));
    if (i + 1 < l.length) b.push(bouton(t('tutoB.suivant'), function () { ecranTutoBatiment(l, i + 1); }, 'gros oui'));
    b.push(bouton(t(i + 1 < l.length ? 'tutoB.plusTard' : 'tutoB.compris'), function () { fermerEcran(); construireMenu(); }, 'gros non'));
    carte.appendChild(el('div', { classe: 'boutons' }, b));
    ouvrirEcran(carte, { retour: function () { fermerEcran(); construireMenu(); } });
  }
  // Étapes « Ce qu'il faut faire », tirées des données du bâtiment.
  function etapesBatiment(k) {
    var d = D.batiments[k], l = [], B = D.batiments;
    var nomB = function (b) { return t('bat.' + b + '.nom'); }, bien = function (g) { return enPhrase(t('bien.' + g)); };
    // Bâtiment de la mission d'abord (sinon le premier des données) qui répond au critère.
    var trouver = function (f) { var ids = Object.keys(B).filter(function (b) { return f(B[b]); }); var p = partie ? ids.filter(permet) : []; return (p.length ? p : ids)[0] || null; };
    var route = function () { if (!d.sansRoute && !d.trace) l.push(t('tutoB.route')); };
    var employes = function () { if (d.effectif) l.push(t('tutoB.employes', { n: d.effectif })); };
    var atelierPour = function (g) { return trouver(function (x) { return x.genre === 'atelier' && x.matiere === g; }); };
    switch (d.genre) {
      case 'ferme': {
        l.push(t('tutoB.prairie')); route(); employes();
        var at = atelierPour(d.produit);
        if (D.aliments.indexOf(d.produit) >= 0 || !at) l.push(t('tutoB.fermeAliment', { bien: bien(d.produit) }));
        else l.push(t('tutoB.fermeMatiere', { bien: bien(d.produit), atelier: nomB(at), produit: bien(B[at].produit) }));
        break;
      }
      case 'peche': l.push(t('tutoB.peche')); route(); employes(); l.push(t('tutoB.pecheGrenier')); break;
      case 'extraction': {
        if (d.pres) l.push(t('tutoB.pres.' + d.pres));
        route(); employes();
        l.push(t('tutoB.extraction', { bien: bien(d.produit), n: d.chargesParAn || 0 }));
        var at2 = atelierPour(d.produit);
        l.push(at2 ? t('tutoB.versAtelier', { atelier: nomB(at2), bien: bien(d.produit), produit: bien(B[at2].produit) }) : t('tutoB.vendre'));
        break;
      }
      case 'atelier': {
        route(); employes();
        var src = trouver(function (x) { return x.produit === d.matiere && (x.genre === 'extraction' || x.genre === 'ferme'); });
        l.push(src && (!partie || permet(src)) ? t('tutoB.atelier', { matiere: bien(d.matiere), produit: bien(d.produit), source: nomB(src) }) : t('tutoB.atelierImport', { matiere: bien(d.matiere), produit: bien(d.produit) }));
        l.push(t('tutoB.entrepotAtelier'));
        break;
      }
      case 'entrepot': route(); employes(); l.push(t('tutoB.entrepot1'), t('tutoB.entrepot2')); break;
      case 'grenier': route(); employes(); l.push(t('tutoB.grenier')); break;
      case 'marche': route(); employes(); l.push(t('tutoB.marche1'), t('tutoB.marche2')); break;
      case 'service': {
        route(); employes();
        l.push(t('tutoB.service', { marcheur: enPhrase(t('marcheur.' + d.marcheur)) }));
        var svc = D.marcheurs[d.marcheur].service;
        if (svc === 'prefet') l.push(t('tutoB.prefet'));
        else if (svc === 'ingenieur') l.push(t('tutoB.ingenieur'));
        else if (svc === 'impot') l.push(t('tutoB.impot'));
        else if (svc === 'religion') l.push(t('tutoB.religion', { dieu: t('dieu.' + d.dieu) }));
        else if (d.categorie === 'education') l.push(t('tutoB.education'));
        else if (d.categorie === 'sante') l.push(t('tutoB.sante'));
        if (d.marbre) l.push(t('tutoB.marbre', { n: d.marbre }));
        if (d.eauRequise) l.push(t('tutoB.eau'));
        if (d.unique) l.push(t('tutoB.unique'));
        l.push(t('tutoB.calque'));
        break;
      }
      case 'spectacle': {
        route(); employes();
        var ecoles = (d.artistes || []).map(function (a) { return trouver(function (x) { return x.genre === 'ecole_art' && x.forme === a; }); }).filter(Boolean).map(nomB);
        l.push(t('tutoB.spectacle', { ecoles: ecoles.join(' », « '), marcheur: enPhrase(t('marcheur.' + d.marcheur)) }));
        if (d.unique) l.push(t('tutoB.unique'));
        break;
      }
      case 'ecole_art': {
        route(); employes();
        var lieux = Object.keys(B).filter(function (b) { return B[b].genre === 'spectacle' && (B[b].artistes || []).indexOf(d.forme) >= 0 && (!partie || permet(b)); }).map(nomB);
        l.push(t('tutoB.ecoleArt', { artiste: enPhrase(t('marcheur.' + d.forme)), lieux: lieux.join(' », « ') }));
        break;
      }
      case 'puits': l.push(t('tutoB.puits')); break;
      case 'fontaine': l.push(t('tutoB.fontaine')); employes(); break;
      case 'reservoir': l.push(t('tutoB.reservoir1'), t('tutoB.reservoir2')); break;
      case 'aqueduc': l.push(t('tutoB.aqueduc')); break;
      case 'deco': l.push(t('tutoB.deco')); break;
      case 'place': l.push(t('tutoB.place'), t('tutoB.deco')); break;
      case 'barriere': l.push(t('tutoB.barriere')); break;
      case 'residence': l.push(t('tutoB.residence')); break;
      case 'oracle': l.push(t('tutoB.oracle'), t('tutoB.marbre', { n: d.marbre || 0 })); break;
      case 'quai': l.push(t('tutoB.quai1')); route(); employes(); l.push(t('tutoB.quai2')); break;
      case 'caserne': route(); employes(); l.push(t('tutoB.caserne')); break;
      case 'academie_militaire': route(); employes(); l.push(t('tutoB.academieMil')); break;
      case 'fort': l.push(t('tutoB.fort', { unite: enPhrase(t('unite.' + d.unite)) })); route(); break;
      case 'tour': l.push(t('tutoB.tour')); employes(); break;
      case 'muraille': l.push(t('tutoB.muraille')); break;
      case 'porte': l.push(t('tutoB.porte')); break;
      default: route(); employes(); break;
    }
    return l;
  }

  function remplirFicheBatiment(p, id) {
    var d = D.batiments[id];
    p.appendChild(el('h2', { texte: t('bat.' + id + '.nom') }));
    p.appendChild(el('p', { texte: t('bat.' + id + '.aide') }));
    p.appendChild(ligne(t('aide.categorie'), t('cat.' + d.categorie)));
    p.appendChild(ligne(t('aide.taille'), d.trace ? t('aide.trace') : t('aide.cases', { n: d.taille })));
    if (d.cout) p.appendChild(ligne(t('aide.cout'), t(d.trace ? 'aide.parCase' : 'aide.deniers', { n: nb(d.cout) })));
    if (d.effectif) p.appendChild(ligne(t('aide.employes'), nb(d.effectif)));
    if (d.genre !== 'ruines' && d.genre !== 'incendie' && !d.trace) p.appendChild(ligne(t('aide.acces'), t(d.sansRoute ? 'aide.sansRoute' : 'aide.route')));
    if (d.terrain === 'prairie') p.appendChild(ligne(t('aide.terrain'), t('aide.prairie')));
    if (d.pres) p.appendChild(ligne(t('aide.terrain'), t('aide.pres.' + d.pres)));
    if (d.produit) p.appendChild(ligne(t('aide.produit'), d.chargesParAn ? t('aide.parAn', { bien: t('bien.' + d.produit), n: d.chargesParAn }) : t('bien.' + d.produit)));
    if (d.matiere) p.appendChild(ligne(t('aide.matiere'), t('bien.' + d.matiere)));
    if (d.marcheur) p.appendChild(ligne(t('aide.marcheur'), t('marcheur.' + d.marcheur)));
    if (d.dieu) p.appendChild(ligne(t('aide.dieu'), t('dieu.' + d.dieu)));
    if (d.couverture) p.appendChild(ligne(t('aide.couverture'), t('aide.habitants', { n: nb(d.couverture) })));
    if (d.marbre) p.appendChild(ligne(t('aide.marbre'), t('aide.charges', { n: d.marbre })));
    var cb = cleBesoin(id, d), nv = cb ? niveauBesoin(cb) : 0;
    if (nv) p.appendChild(ligne(t('aide.besoin'), t('aide.besoinNiveau', { n: nv })));
    if (d.attractivite && d.attractivite[0]) p.appendChild(ligne(t('aide.attractivite'), t('aide.attractiviteVal', { v: (d.attractivite[0] > 0 ? '+' : '') + d.attractivite[0], r: d.attractivite[1] })));
    if (d.feu !== undefined) p.appendChild(ligne(t('aide.feu'), niveauRisque(d.feu)));
    if (d.dommages !== undefined) p.appendChild(ligne(t('aide.dommages'), niveauRisque(d.dommages)));
    if (d.eauRequise) p.appendChild(el('p', { classe: 'aide', texte: t('aide.eauRequise') }));
    if (d.unique) p.appendChild(el('p', { classe: 'aide', texte: t('aide.unique') }));
  }
  // retour : écran d'où l'on vient ; sujet : 'meca:<id>' ou 'bat:<type>' pour ouvrir une fiche.
  function ecranAide(retour, sujet) {
    var carte = el('div', { classe: 'carte-ecran aide-ecran' });
    var rouvrir = function (s) { ecranAide(retour, s); };
    if (sujet) {
      var k = sujet.indexOf(':'), genre = sujet.slice(0, k), id = sujet.slice(k + 1);
      if (genre === 'bat' && D.batiments[id]) remplirFicheBatiment(carte, id);
      else {
        carte.appendChild(el('h2', { texte: t('aide.' + id + '.titre') }));
        carte.appendChild(el('p', { texte: t('aide.' + id + '.texte') }));
      }
      carte.appendChild(el('div', { classe: 'boutons' }, [
        bouton(t('aide.retourListe'), function () { rouvrir(null); }, 'gros non'),
        bouton(t('ui.retour'), retour, 'gros or')
      ]));
      ouvrirEcran(carte, { retour: function () { rouvrir(null); } });
      return;
    }
    carte.appendChild(el('h1', { texte: t('aide.titre') }));
    var barre = el('div', { classe: 'onglets' });
    ['mecaniques', 'batiments'].forEach(function (o) {
      barre.appendChild(el('button', { classe: 'onglet' + (o === aideOnglet ? ' actif' : ''), texte: t('aide.' + o), clic: function () { AUDIO.jouer('clic'); aideOnglet = o; rouvrir(null); } }));
    });
    carte.appendChild(barre);
    var liste = el('div', { classe: 'liste-aide' });
    if (aideOnglet === 'mecaniques') {
      MECANIQUES.forEach(function (m) { liste.appendChild(bouton(t('aide.' + m + '.titre'), function () { rouvrir('meca:' + m); }, 'gros non')); });
      carte.appendChild(liste);
    } else {
      D.categories.forEach(function (c) {
        var ids = Object.keys(D.batiments).filter(function (b) { return D.batiments[b].categorie === c; });
        if (!ids.length) return;
        carte.appendChild(el('h3', { texte: t('cat.' + c) }));
        var l = el('div', { classe: 'liste-aide' });
        ids.forEach(function (b) { l.appendChild(bouton(t('bat.' + b + '.nom'), function () { rouvrir('bat:' + b); }, 'gros non')); });
        carte.appendChild(l);
      });
    }
    carte.appendChild(el('div', { classe: 'boutons' }, [bouton(t('ui.retour'), retour, 'gros or')]));
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
    // Une cité de province s'enregistre seule, dans sa province (jamais une copie plus ancienne).
    if (partie.e.province) { synchroProvince(); return; }
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
    if (mode === 'sauver' && partie && partie.e.province) { liste.appendChild(el('p', { texte: t('sauve.provinceSeule') })); synchroProvince(); return; }
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
  // Cités voisines (lot 6, cahier 16.7 et 23.15) : provinces de 2 à 4 joueurs
  //   Le jeu n'a aucun accès réseau : il demande au lanceur du site (messages
  //   « jel-province », public/province/lanceur.js) de parler au comptoir.
  //   Règle de sûreté : avant chaque envoi, la ville est enregistrée (clé
  //   « province-<code> ») ; les opérations et l'accusé envoyés sont lus dans
  //   l'état enregistré au même instant (SIM.provinceEnvoi, puis SIM.exporter).
  // ------------------------------------------------------------------------
  var VOISINAGES = D.voisinages || [], VOISINES = D.missionsVoisinage || [];
  var RE_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
  var SYNC_MS = 45000, SYNC_OP_MS = 3000;
  var demandesProvince = {}, numeroDemande = 0;
  var provinceSync = { enCours: false, dernier: 0, envoyes: 0, signal: null, echecs: 0, reussite: 0 };
  window.addEventListener('message', function (ev) {
    var m = ev.data;
    if (ev.source !== window.parent || !m || m.type !== 'jel-province' || !demandesProvince[m.id]) return;
    var f = demandesProvince[m.id]; delete demandesProvince[m.id]; f(m);
  });
  function demanderProvince(op, donnees) {
    return new Promise(function (ok) {
      if (window.parent === window) { ok({ ok: false, erreur: 'hors-site' }); return; }
      var id = 'p' + (++numeroDemande);
      var minuterie = setTimeout(function () { if (demandesProvince[id]) { delete demandesProvince[id]; ok({ ok: false, erreur: 'injoignable' }); } }, 15000);
      demandesProvince[id] = function (m) { clearTimeout(minuterie); ok(m); };
      var msg = { type: 'jel-province', id: id, op: op };
      for (var k in donnees) msg[k] = donnees[k];
      try { window.parent.postMessage(msg, '*'); } catch (err) { delete demandesProvince[id]; clearTimeout(minuterie); ok({ ok: false, erreur: 'injoignable' }); }
    });
  }
  function missionVoisine(id) { for (var k = 0; k < VOISINES.length; k++) if (VOISINES[k].id === id) return VOISINES[k]; return null; }
  function voisinage(id) { for (var k = 0; k < VOISINAGES.length; k++) if (VOISINAGES[k].id === id) return VOISINAGES[k]; return null; }
  function nomJoueur(v) { return v && v.pseudo ? v.pseudo : v && v.numero ? t('voisins.joueur', { n: v.numero }) : t('voisins.joueurSans'); }
  // Nom d'une cité voisine, avec son joueur quand il commerce par le comptoir.
  function nomVoisine(e, c) {
    var v = e.province && c.voisin !== undefined ? e.province.voisins[c.voisin] : null;
    return t('cite.' + c.id) + (v && v.pris && v.actif ? ' · ' + nomJoueur(v) : '');
  }
  function nomSiege(e, siege) {
    var m = SIM.mission(e), pv = m && m.voisinage ? voisinage(m.voisinage.province) : null;
    var c = pv ? { id: pv.cites[siege], voisin: siege } : null;
    return c ? nomVoisine(e, c) : '';
  }
  function echapper(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function erreurProvince(code) {
    return t(code === 'introuvable' ? 'voisins.introuvable' : code === 'pleine' ? 'voisins.pleine' : 'voisins.serveur');
  }
  function depuisTexte(quand) {
    var s = Math.max(0, (Date.now() - quand) / 1000);
    if (s < 3600) return t('voisins.ilYaMin', { n: Math.max(1, Math.round(s / 60)) });
    if (s < 86400 * 2) return t('voisins.ilYaHeures', { n: Math.round(s / 3600) });
    return t('voisins.ilYaJours', { n: Math.round(s / 86400) });
  }

  // Enregistrement puis envoi au comptoir ; la réponse entre dans la simulation par une commande.
  function synchroProvince() {
    if (!partie || partie.figee || !partie.e.province || provinceSync.enCours || !STOCK) return;
    var e = partie.e, P = e.province, d = SIM.date(e);
    var envoi = SIM.provinceEnvoi(e), txt = SIM.exporter(e), cle = 'province-' + P.code;
    var meta = { mission: e.mission, province: true, code: P.code, mois: d.mois, annee: d.annee, pop: e.pop, quand: Date.now() };
    var signal = provinceSync.signal;
    provinceSync.enCours = true; provinceSync.dernier = Date.now(); provinceSync.envoyes = P.n;
    STOCK.set(cle, txt).then(function () {
      return lireIndex().then(function (idx) { idx[cle] = meta; return STOCK.set('index', JSON.stringify(idx)); });
    }).then(function () {
      var corps = { code: envoi.code, siege: envoi.siege, jeton: envoi.jeton, ops: envoi.ops, accuse: envoi.accuse, infos: envoi.infos };
      if (signal) corps.signal = signal;
      return demanderProvince('sync', corps);
    }).then(function (r) {
      provinceSync.enCours = false;
      if (!partie || partie.e !== e) return;
      if (r && r.ok && r.donnees) {
        if (signal && provinceSync.signal === signal) provinceSync.signal = null;
        provinceSync.echecs = 0; provinceSync.reussite = Date.now();
        commander({ type: 'province-sync', recu: r.donnees.recu, sortie: r.donnees.sortie, vue: r.donnees.vue });
      } else {
        provinceSync.echecs++;
        commander({ type: 'province-reseau', enLigne: false });
      }
      if (panneauVivant && provinceOuvert) panneauVivant();
    }).catch(function () { provinceSync.enCours = false; });
  }
  // Rythme : toutes les 45 s de jeu visible, 3 s après une nouvelle opération ; plus lent après des échecs.
  function rythmeProvince() {
    if (!partie || !partie.e.province || partie.figee || provinceSync.enCours) return;
    var P = partie.e.province, ecart = Date.now() - provinceSync.dernier;
    var attente = provinceSync.echecs ? Math.min(4, provinceSync.echecs) * 30000 : SYNC_MS;
    if (ecart >= attente || ((P.n > provinceSync.envoyes || provinceSync.signal) && ecart >= SYNC_OP_MS && !provinceSync.echecs)) synchroProvince();
  }

  function lancerCiteVoisine(id, prov, vue) {
    var e = SIM.nouvelle(id, { province: prov });
    if (vue) SIM.appliquer(e, { type: 'province-sync', recu: 0, sortie: [], vue: vue });
    rendu.sansInterface = false;
    demarrerEtat(e);
    AUDIO.jouer('etape');
    toast(t('voisins.creee', { code: prov.code }));
  }
  function ecranAttenteProvince(retour) {
    ouvrirEcran(el('div', { classe: 'carte-ecran' }, [el('h1', { texte: t('voisins.titre') }), el('p', { texte: t('voisins.attente') })]), { retour: retour });
  }
  function ecranErreurProvince(code, retour) {
    ouvrirEcran(el('div', { classe: 'carte-ecran' }, [el('h1', { texte: t('voisins.titre') }), el('p', { classe: 'etat-ko', texte: erreurProvince(code) }),
      el('div', { classe: 'boutons' }, [bouton(t('ui.retour'), retour, 'gros non')])]), { retour: retour });
  }

  // Écran « Cités voisines » : mes provinces, créer, rejoindre.
  function ecranProvinces() {
    AUDIO.demarrer();
    var carte = el('div', { classe: 'carte-ecran' }, [el('h1', { texte: t('voisins.titre') }), el('p', { texte: t('voisins.intro') }), el('h2', { texte: t('voisins.mes') })]);
    var liste = el('div', { classe: 'emplacements' });
    carte.appendChild(liste);
    carte.appendChild(el('div', { classe: 'boutons' }, [
      bouton(t('voisins.creer'), ecranCreerProvince, 'gros oui'),
      bouton(t('voisins.rejoindre'), function () { ecranRejoindreProvince(''); }, 'gros or'),
      bouton(t('ui.retour'), ecranTitre, 'gros non')
    ]));
    ouvrirEcran(carte, { retour: ecranTitre });
    lireIndex().then(function (idx) {
      var cles = Object.keys(idx).filter(function (k) { return /^province-/.test(k) && idx[k]; }).sort(function (a, b) { return idx[b].quand - idx[a].quand; });
      if (!cles.length) { liste.appendChild(el('p', { texte: t('voisins.aucune') })); return; }
      cles.forEach(function (cle) {
        var m = idx[cle], mv = missionVoisine(m.mission);
        if (!mv) return;
        var desc = t('voisins.resume', { province: t('province.' + mv.voisinage.province + '.nom'), code: m.code, pop: nb(m.pop), date: t('hud.date', { mois: t('mois.' + m.mois), annee: anneeTexte(m.annee) }) });
        liste.appendChild(el('div', { classe: 'emplacement' }, [el('strong', { texte: t('cite.' + m.mission) }), el('span', { texte: desc }),
          bouton(t('voisins.continuer'), function () { fermerEcran(); rendu.sansInterface = false; chargerVilleStock(cle).catch(function () { ecranProvinces(); }); }, 'gros oui')]));
      });
    });
  }
  function ecranCreerProvince() {
    var carte = el('div', { classe: 'carte-ecran' }, [el('h1', { texte: t('voisins.creer') }), el('p', { texte: t('voisins.choisirCite') })]);
    VOISINAGES.forEach(function (pv) {
      carte.appendChild(el('h2', { texte: t('province.' + pv.id + '.nom') }));
      carte.appendChild(el('p', { classe: 'aide', texte: t('province.' + pv.id + '.desc') }));
      var g = el('div', { classe: 'grille-missions' });
      pv.cites.forEach(function (id, siege) {
        g.appendChild(el('button', { classe: 'mission', clic: function () { AUDIO.jouer('clic'); creerProvince(pv.id, siege); } }, [
          el('span', { classe: 'nom', texte: t('cite.' + id) }), el('span', { classe: 'num', texte: t('mission.' + id + '.atouts') })]));
      });
      carte.appendChild(g);
    });
    carte.appendChild(el('div', { classe: 'boutons' }, [bouton(t('ui.retour'), ecranProvinces, 'gros non')]));
    ouvrirEcran(carte, { retour: ecranProvinces });
  }
  function creerProvince(pid, siege) {
    ecranAttenteProvince(ecranCreerProvince);
    demanderProvince('creer', { carte: pid, siege: siege }).then(function (r) {
      if (!r.ok) { ecranErreurProvince(r.erreur, ecranCreerProvince); return; }
      var d = r.donnees, pv = voisinage(pid);
      lancerCiteVoisine(pv.cites[d.siege], { code: d.code, siege: d.siege, jeton: d.jeton, vus: d.vue ? d.vue.maintenant : 0 }, d.vue);
      ouvrirProvince();
    });
  }
  // Rejoindre : le code (6 lettres ou chiffres), puis une cité libre de la province.
  function ecranRejoindreProvince(code) {
    var champ = el('input', { type: 'text', maxlength: '6', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', classe: 'champ-code', aria: t('voisins.saisirCode'), placeholder: 'ABC234' });
    champ.value = code || '';
    var info = el('p', { classe: 'aide', texte: t('voisins.saisirCode') });
    var chercher = function () {
      var c = champ.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!RE_CODE.test(c)) { info.textContent = t('voisins.codeInvalide'); info.className = 'etat-ko'; return; }
      ecranAttenteProvince(function () { ecranRejoindreProvince(c); });
      demanderProvince('lire', { code: c }).then(function (r) {
        if (!r.ok) { ecranErreurProvince(r.erreur, function () { ecranRejoindreProvince(c); }); return; }
        ecranCitesLibres(c, r.donnees);
      });
    };
    champ.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') chercher(); });
    var carte = el('div', { classe: 'carte-ecran' }, [el('h1', { texte: t('voisins.rejoindre') }), info, champ,
      el('div', { classe: 'boutons' }, [bouton(t('voisins.chercher'), chercher, 'gros oui'), bouton(t('ui.retour'), ecranProvinces, 'gros non')])]);
    ouvrirEcran(carte, { retour: ecranProvinces });
  }
  function rejoindreProvinceAmi(code) {
    lireIndex().then(function (idx) {
      if (idx['province-' + code]) { rendu.sansInterface = false; return chargerVilleStock('province-' + code); }
      ecranAttenteProvince(ecranProvinces);
      return demanderProvince('lire', { code: code }).then(function (r) {
        if (!r.ok) ecranErreurProvince(r.erreur, ecranProvinces); else ecranCitesLibres(code, r.donnees);
      });
    }).catch(function () { ecranProvinces(); });
  }
  function ecranCitesLibres(code, lu) {
    var pv = voisinage(lu.carte);
    if (!pv) { ecranErreurProvince('introuvable', ecranProvinces); return; }
    var carte = el('div', { classe: 'carte-ecran' }, [el('h1', { texte: t('province.' + pv.id + '.nom') + ' · ' + code }), el('p', { texte: t('voisins.choisirCite') })]);
    var g = el('div', { classe: 'grille-missions' });
    pv.cites.forEach(function (id, siege) {
      var s = lu.sieges[siege];
      var b = el('button', { classe: 'mission' + (s ? ' ferme' : ''), clic: function () {
        if (s) return;
        AUDIO.jouer('clic');
        ecranAttenteProvince(function () { ecranCitesLibres(code, lu); });
        demanderProvince('rejoindre', { code: code, siege: siege }).then(function (r) {
          if (!r.ok) { ecranErreurProvince(r.erreur, ecranProvinces); return; }
          var d = r.donnees;
          lancerCiteVoisine(pv.cites[d.siege], { code: code, siege: d.siege, jeton: d.jeton, vus: d.vue ? d.vue.maintenant : 0 }, d.vue);
          ouvrirProvince();
        });
      } }, [el('span', { classe: 'nom', texte: t('cite.' + id) }),
        el('span', { classe: 'num', texte: s ? t('voisins.prise', { nom: nomJoueur(s) }) : t('mission.' + id + '.atouts') })]);
      g.appendChild(b);
    });
    carte.appendChild(g);
    carte.appendChild(el('div', { classe: 'boutons' }, [bouton(t('ui.retour'), ecranProvinces, 'gros non')]));
    ouvrirEcran(carte, { retour: ecranProvinces });
  }

  // Panneau de la province : code, voisins, signaux.
  var provinceOuvert = false;
  var SIGNAUX = ['cherche', 'vend', 'merci', 'aide', 'route'], signalChoisi = null;
  function ouvrirProvince() {
    if (!partie || !partie.e.province) return;
    provinceOuvert = true;
    ouvrirPanneau(function (p) {
      var e = partie.e, P = e.province, m = SIM.mission(e), pv = voisinage(m.voisinage.province);
      p.appendChild(el('h2', { texte: t('province.' + pv.id + '.nom') }));
      p.appendChild(ligne(t('voisins.code'), P.code));
      p.appendChild(el('p', { classe: 'aide', texte: t('voisins.codeAide') }));
      p.appendChild(el('p', { classe: P.enLigne ? 'ok' : 'ko', texte: t(P.enLigne ? 'voisins.enLigne' : 'voisins.horsLigne') }));
      if (P.gagnee) p.appendChild(el('p', { classe: 'etat-ok', texte: t('voisins.gagneeTitre') }));
      p.appendChild(el('p', { classe: P.objectif ? 'ok' : '', texte: t(P.objectif ? 'voisins.objectifFait' : 'voisins.objectifEnCours') }));
      p.appendChild(ligne(t('budget.voisins'), nb(P.ventes)));
      p.appendChild(ligne(t('voisins.achats'), nb(P.achats)));
      var reserve = Object.keys(P.reserve).reduce(function (n, g) { return n + P.reserve[g]; }, 0);
      if (reserve) p.appendChild(el('p', { classe: 'aide', texte: t('voisins.reserve', { n: Math.ceil(reserve / D.regles.maison.uniteParCharge) }) }));
      p.appendChild(el('h3', { texte: t('voisins.voisins') }));
      pv.cites.forEach(function (id, siege) {
        if (siege === P.siege) return;
        var v = P.voisins[siege];
        var f = el('div', { classe: 'fiche-cite' });
        f.appendChild(el('h3', { texte: nomVoisine(e, { id: id, voisin: siege }) }));
        if (!v || !v.pris) { f.appendChild(el('p', { classe: 'aide', texte: t('voisins.ordinateur') })); p.appendChild(f); return; }
        if (!v.actif) f.appendChild(el('p', { classe: 'aide', texte: t('voisins.absent') }));
        f.appendChild(ligne(t('hud.population'), nb((v.infos && v.infos.pop) || 0)));
        var co = (v.infos && v.infos.cotes) || {};
        f.appendChild(ligne(t('voisins.cotes'), [co.culture, co.prosperite, co.paix, co.faveur].map(function (x) { return x | 0; }).join(' · ')));
        f.appendChild(el('p', { classe: v.infos && v.infos.objectif ? 'ok' : 'aide', texte: t(v.infos && v.infos.objectif ? 'voisins.objectifFait' : 'voisins.objectifEnCours') }));
        if (v.visite) f.appendChild(ligne(t('voisins.visite'), depuisTexte(v.visite)));
        var etal = Object.keys(v.etal || {}).filter(function (g) { return v.etal[g] > 0; });
        f.appendChild(el('p', { classe: 'aide', texte: t(etal.length ? 'voisins.etal' : 'voisins.etalVide') }));
        etal.forEach(function (g) { f.appendChild(ligne(t('bien.' + g) + ' · ' + nb(SIM.prixVoisin(g)), t('voisins.charges', { n: v.etal[g] }))); });
        (v.signaux || []).forEach(function (sg) { f.appendChild(el('p', { classe: 'msg', texte: '✉ ' + texteSignal(sg) })); });
        p.appendChild(f);
      });
      p.appendChild(el('h3', { texte: t('voisins.envoyerSignal') }));
      if (provinceSync.signal) p.appendChild(el('p', { classe: 'aide', texte: t('voisins.signalAttente', { s: texteSignal(provinceSync.signal) }) }));
      var gs = el('div', { classe: 'boutons cites' });
      SIGNAUX.forEach(function (sg) {
        gs.appendChild(bouton(t('signal.' + sg + '.bouton'), function () {
          if (sg === 'cherche' || sg === 'vend') { signalChoisi = sg; if (panneauVivant) panneauVivant(); return; }
          envoyerSignal({ s: sg, b: null });
        }, signalChoisi === sg ? 'gros or' : 'gros non'));
      });
      p.appendChild(gs);
      if (signalChoisi) {
        p.appendChild(el('p', { classe: 'aide', texte: t('voisins.choisirBien') }));
        var gb = el('div', { classe: 'boutons cites' });
        Object.keys(D.biens).forEach(function (g) { gb.appendChild(bouton(t('bien.' + g), function () { envoyerSignal({ s: signalChoisi, b: g }); }, 'gros non')); });
        p.appendChild(gb);
      }
    });
  }
  function texteSignal(sg) { return t('signal.' + sg.s, { bien: sg.b ? enPhrase(t('bien.' + sg.b)) : '' }); }
  function envoyerSignal(sg) {
    provinceSync.signal = sg; signalChoisi = null;
    toast(t('voisins.signalEnvoye'));
    synchroProvince();
    if (panneauVivant) panneauVivant();
  }

  // La province a gagné (objectif commun) : la part de chacun.
  function ecranVictoireProvince() {
    var e = partie.e, P = e.province, m = SIM.mission(e), pv = voisinage(m.voisinage.province);
    AUDIO.jouer('victoire');
    if (window.FMG) window.FMG.reportEnd({ completed: true, level: null });
    var carte = el('div', { classe: 'carte-ecran' }, [el('h1', { texte: t('voisins.gagneeTitre') }), el('p', { texte: t('voisins.gagneeTexte') })]);
    pv.cites.forEach(function (id, siege) {
      var v = siege === P.siege ? { pris: true, infos: { pop: e.pop, ventes: P.ventes } } : P.voisins[siege];
      if (!v || !v.pris) return;
      carte.appendChild(el('p', { texte: t('voisins.part', { nom: siege === P.siege ? t('cite.' + id) + ' · ' + t('voisins.toi') : nomVoisine(e, { id: id, voisin: siege }), pop: nb((v.infos && v.infos.pop) || 0), ventes: nb((v.infos && v.infos.ventes) || 0) }) }));
    });
    carte.appendChild(el('div', { classe: 'boutons' }, [bouton(t('voisins.continuerBatir'), fermerEcran, 'gros oui'), bouton(t('ui.retour'), quitterPartie, 'gros non')]));
    ouvrirEcran(carte, {});
  }

  // ------------------------------------------------------------------------
  // Victoire, défaite
  // ------------------------------------------------------------------------
  function ecranVictoire() {
    var e = partie.e, m = partie.m, v = e.victoire, n = v.etoiles;
    AUDIO.jouer('victoire');
    var avant = prog.gagnees[m.id] | 0, finieAvant = campagneFinie();
    prog.gagnees[m.id] = Math.max(avant, n);
    prog.niveau = Math.max(prog.niveau, Math.min(MISSIONS.length, m.numero + 1));
    // Mission gagnée : progression enregistrée (niveau suivant), puis fin signalée au site.
    if (e.empereur) prog.fortune = e.fortune;
    try { window.JEL_SAVE.save(JEU, { niveau: prog.niveau, score: totalEtoiles(), options: prog.options, gagnees: prog.gagnees, fortune: prog.fortune }); } catch (err) { /* sans stockage */ }
    if (window.FMG) window.FMG.reportEnd({ completed: true, level: m.numero });
    // Campagne terminée quand les 10 échelons sont gagnés, par l'une ou l'autre province (16.6) ;
    // rappelé à chaque victoire suivante (le site garde le meilleur total d'étoiles).
    var finie = campagneFinie(), premiere = finie && !finieAvant;
    if (finie && window.FMG) window.FMG.reportComplete({ stars: totalEtoiles(), maxStars: MAX_ETOILES });
    sauverVilleAuto();
    var gros = el('div', { classe: 'grosses-etoiles', aria: t('missions.etoilesAria', { n: n, max: 3 }) });
    for (var k = 0; k < 3; k++) gros.appendChild(el('span', { classe: k < n ? '' : 'vide', texte: '★' }));
    var suivante = missionSuivante(m);
    var carte = el('div', { classe: 'carte-ecran' }, [
      el('h1', { texte: t('victoire.titre') }),
      gros,
      el('p', { texte: t('victoire.texte', { mission: t('mission.' + m.id + '.nom') }) }),
      el('p', { texte: t('victoire.bilan', { mois: v.mois, pop: nb(e.pop) }) }),
      el('p', { classe: 'ok', texte: t('victoire.etoile1') }),
      el('p', { classe: e.secoursRecu ? 'ko' : 'ok', texte: t('victoire.etoile2') }),
      el('p', { classe: n >= 3 ? 'ok' : 'ko', texte: t('victoire.etoile3', { mois: m.dateCibleMois }) }),
      n > avant && avant ? el('p', { classe: 'etat-ok', texte: t('victoire.record') }) : null,
      premiere ? el('h2', { texte: t('campagne.titre') }) : null,
      premiere ? el('p', { classe: 'etat-ok', texte: t('campagne.texte', { n: totalEtoiles(), max: MAX_ETOILES }) }) : null,
      premiere ? el('p', { texte: t('campagne.suite') }) : null,
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
      info: function (id) { if (!partie || !SIM.batiment(partie.e, id)) return false; rendu.selection = id; ouvrirPanneau(function (p) { remplirBatiment(p, id); }); return true; },
      // Victoire immédiate de la mission en cours (essai des écrans de fin et de la fin de campagne).
      gagner: function (n) { if (!partie) return false; partie.e.victoire = { tick: partie.e.tick, mois: Math.floor(partie.e.tick / D.ticksParMois), etoiles: n || 3 }; partie.finVue = false; apresTicks(); return true; },
      // Missions gagnées (progression), par leurs identifiants : { ostie: 3, … }.
      gagnees: function (g) { prog.gagnees = g || {}; progChargee = true; return echelonsGagnes(); }
    };
  }

  if (window.JEL_AFFICHE) { dessinerAffiche(); return; }
  if (window.JEL_APERCU) { ouvrirApercu(Number(window.JEL_APERCU) || 1); return; }
  ecranTitre();
  // Bouton « Rejoindre » de la page Amis : la province de l'ami (sa propre cité si on y joue déjà).
  if (window.JEL_REJOINDRE && RE_CODE.test(String(window.JEL_REJOINDRE.province || ''))) rejoindreProvinceAmi(window.JEL_REJOINDRE.province);

})();
