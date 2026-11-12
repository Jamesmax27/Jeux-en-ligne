/* ==========================================================================
   Free Micro Games — moteur commun des jeux en temps réel          jel-tr v1
   JavaScript pur, sans dépendance. Cadrage : docs/cadrage-temps-reel.md.

   Le même fichier sert à quatre endroits :
     - dans chaque jeu temps réel, recopié tel quel dans index.html (bloc
       jel-tr, juste après jel-sauvegarde) par node scripts/i18n-jeu.mjs :
       window.JEL_TR ;
     - dans le lanceur du site (public/temps-reel/lanceur.js), qui l'importe
       pour le cadenceur du pair horloge ;
     - dans le Worker Cloudflare commun (multijoueur/src/temps-reel/), qui fait
       tourner le cadenceur et la simulation des parties relayées ;
     - dans les tests (scripts/tester-temps-reel.mjs).

   La simulation d'un jeu (bloc jel-sim, objet window.JEL_SIM) est faite de
   fonctions pures sur un état entièrement entier :
     camps          nombre de camps (2)
     periodeBot     un robot réfléchit tous les periodeBot ticks
     depart(graine, config)          état de départ (graine : entier 32 bits)
     valide(etat, camp, ordre)       ordre permis ? (ordre : [type, a, b, c], entiers, type ≥ 1)
     ordre(etat, camp, ordre)        applique un ordre déjà validé
     pas(etat, alea)                 avance d'un tick
     bot(etat, camp, niveau, alea)   ordres d'un robot (niveau 1 facile, 2 moyen, 3 difficile)
     fin(etat)                       null, ou { gagnant, scores }
   alea(n) donne un entier de 0 à n − 1 tiré du hasard gardé DANS l'état
   (etat.a) : deux appareils partis du même état tirent la même suite.
   Le moteur gère lui-même etat.k (numéro du tick) et etat.ctl (qui tient
   chaque camp : 0 = un humain, 1 à 3 = un robot de ce niveau).

   Un tick se joue toujours ainsi (ordre fixe, le même partout) :
     1. ordres de contrôle (camp « système » = camps) : etat.ctl change ;
     2. ordres des humains, triés par camp puis numéro de séquence ;
        un ordre d'un camp tenu par un robot ou refusé par valide est ignoré ;
     3. robots, dans l'ordre des camps, tous les periodeBot ticks ;
     4. pas(etat).
   Paquet d'un tick : { t: 'k', k, o: [[camp, seq, type, a, b, c], …] }.

   Le CADENCEUR est l'horloge d'une partie : il numérote les ticks, donne à
   chaque ordre reçu le tick courant + delai (délai d'entrée) et diffuse un
   paquet par tick, même vide. Il tourne sur l'appareil (partie contre le
   robot), chez le pair horloge (pair-à-pair) ou dans le Durable Object
   (partie relayée) : les appareils, eux, ne font que jouer les paquets.

   Ce fichier ne doit contenir aucune balise script (ni ouverture ni fermeture) :
   il est recopié dans le jeu.
   ========================================================================== */
(function (racine) {
  'use strict';
  if (racine.JEL_TR) return;

  var PROTOCOLE = 1;
  var T_CONTROLE = 0;                // type réservé aux ordres de contrôle (camp système)

  // Réglages communs (tous paramétrables par la partie ou le jeu).
  var REGLAGES = {
    tickMs: 100,                     // durée d'un tick
    delaiEntree: 2,                  // un ordre reçu au tick k est joué au tick k + delaiEntree
    hashTous: 50,                    // hachage de l'état tous les N ticks
    instantaneTous: 300,             // instantané gardé tous les N ticks (30 s)
    rattrapageMax: 50,               // ticks rejoués au plus par appel de la boucle (jamais de gel)
    reserve: 2,                      // paquets gardés d'avance pour lisser le réseau
    rechercheMs: 15000,              // recherche d'un adversaire, au plus
    connexionMs: 12000,              // adversaire trouvé, mais aucune partie au bout de ce délai : robot
  };

  // --- Outils entiers --------------------------------------------------------

  function copie(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

  // Hasard gardé dans l'état (mulberry32 sur etat.a) : renvoie un entier 32 bits non signé.
  function tirer(etat) {
    var a = ((etat.a >>> 0) + 0x6D2B79F5) >>> 0;
    etat.a = a;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  // alea(n) : entier de 0 à n − 1 (n ≥ 1), tiré du hasard de l'état.
  function aleaDe(etat) {
    return function (n) { n = n | 0; return n > 1 ? tirer(etat) % n : 0; };
  }

  // Racine carrée entière (Newton), sans Math.sqrt : même résultat partout.
  function racineEntiere(n) {
    if (!(n > 0)) return 0;
    var x = n, y = Math.floor((x + 1) / 2);
    while (y < x) { x = y; y = Math.floor((x + Math.floor(n / x)) / 2); }
    return x;
  }

  // Division entière tronquée (vers zéro).
  function div(a, b) { return b ? Math.trunc(a / b) : 0; }

  // Sinus et cosinus entiers : table de 64 directions, valeurs × 1024 (calculées une fois,
  // écrites en dur : aucune fonction trigonométrique, dont le résultat varie d'un moteur à l'autre).
  var SINUS = [0, 100, 200, 297, 392, 483, 569, 650, 724, 792, 851, 903, 946, 980, 1004, 1019, 1024,
    1019, 1004, 980, 946, 903, 851, 792, 724, 650, 569, 483, 392, 297, 200, 100, 0,
    -100, -200, -297, -392, -483, -569, -650, -724, -792, -851, -903, -946, -980, -1004, -1019, -1024,
    -1019, -1004, -980, -946, -903, -851, -792, -724, -650, -569, -483, -392, -297, -200, -100];
  function sinus(i) { return SINUS[((i % 64) + 64) % 64]; }
  function cosinus(i) { return SINUS[(((i + 16) % 64) + 64) % 64]; }

  // --- Hachage et contrôle de l'état ----------------------------------------

  // Empreinte d'un état (deux hachages FNV-1a de 32 bits). Les clés des objets sont
  // parcourues triées : le résultat ne dépend jamais de l'ordre d'insertion.
  function hacher(x) {
    var h1 = 0x811c9dc5 | 0, h2 = 0x050c5d1f | 0;
    function melanger(v) {
      v = v | 0;
      for (var i = 0; i < 4; i++) {
        var o = (v >>> (i * 8)) & 0xff;
        h1 = Math.imul(h1 ^ o, 16777619);
        h2 = Math.imul(h2 ^ o, 0x01000193) ^ (h2 >>> 15);
      }
    }
    function parcourir(y) {
      if (y === null || y === undefined) { melanger(1); return; }
      if (typeof y === 'boolean') { melanger(y ? 2 : 3); return; }
      if (typeof y === 'number') {
        melanger(4);
        if (Number.isInteger(y)) { melanger(y % 4294967296); melanger(Math.floor(y / 4294967296)); }
        else { melanger(0x7fc00000); }       // flottant : refusé de toute façon par premierFlottant
        return;
      }
      if (typeof y === 'string') { melanger(5); melanger(y.length); for (var c = 0; c < y.length; c++) melanger(y.charCodeAt(c)); return; }
      if (Array.isArray(y)) { melanger(6); melanger(y.length); for (var i = 0; i < y.length; i++) parcourir(y[i]); return; }
      var cles = Object.keys(y).sort();
      melanger(7); melanger(cles.length);
      for (var j = 0; j < cles.length; j++) { parcourir(cles[j]); parcourir(y[cles[j]]); }
    }
    parcourir(x);
    return ('0000000' + (h1 >>> 0).toString(16)).slice(-8) + ('0000000' + (h2 >>> 0).toString(16)).slice(-8);
  }

  // Chemin du premier nombre non entier (ou non fini) de l'état, ou null. Sert aux tests.
  function premierFlottant(x, chemin) {
    chemin = chemin || 'etat';
    if (typeof x === 'number') return Number.isInteger(x) && Math.abs(x) <= 9007199254740991 ? null : chemin + ' = ' + x;
    if (!x || typeof x !== 'object') return null;
    if (Array.isArray(x)) {
      for (var i = 0; i < x.length; i++) { var p = premierFlottant(x[i], chemin + '[' + i + ']'); if (p) return p; }
      return null;
    }
    var cles = Object.keys(x).sort();
    for (var j = 0; j < cles.length; j++) { var q = premierFlottant(x[cles[j]], chemin + '.' + cles[j]); if (q) return q; }
    return null;
  }

  // Un ordre de joueur bien formé : [type ≥ 1, a, b, c] (entiers, 4 au plus).
  function ordreBienForme(o) {
    if (!Array.isArray(o) || o.length < 1 || o.length > 4) return false;
    for (var i = 0; i < o.length; i++) if (!Number.isInteger(o[i]) || o[i] < -1000000 || o[i] > 1000000) return false;
    return o[0] >= 1;
  }

  // Tri des ordres d'un tick : camp, puis numéro de séquence (le camp système en dernier
  // ne gêne pas : les contrôles sont joués à part, avant).
  function trierOrdres(liste) {
    return liste.slice().sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
  }

  // Problèmes d'une simulation (liste vide = bonne). Sert au robot de contrôle.
  function problemesSim(s) {
    if (!s || typeof s !== 'object') return ['window.JEL_SIM absent ou qui n\'est pas un objet'];
    var p = [];
    if (s.camps !== 2) p.push('"camps" doit valoir 2 (prototype 1 contre 1)');
    if (!(Number.isInteger(s.periodeBot) && s.periodeBot >= 1 && s.periodeBot <= 50)) p.push('"periodeBot" : entier de 1 à 50');
    ['depart', 'valide', 'ordre', 'pas', 'bot', 'fin'].forEach(function (f) { if (typeof s[f] !== 'function') p.push('fonction "' + f + '" absente'); });
    return p;
  }

  // --- Simulation : état, ticks, journal, instantanés -----------------------
  // config : { ctl: [0 | 1..3 par camp], … (propre au jeu : carte, niveau…) }

  function Simulation(sim, graine, config, reglages) {
    this.sim = sim;
    this.r = Object.assign({}, REGLAGES, reglages || {});
    this.config = copie(config || {});
    var etat = sim.depart(graine >>> 0, copie(this.config));
    etat.k = 0;
    if (!Number.isInteger(etat.a)) etat.a = graine >>> 0;
    etat.ctl = [];
    for (var c = 0; c < sim.camps; c++) etat.ctl.push(Array.isArray(this.config.ctl) && Number.isInteger(this.config.ctl[c]) ? this.config.ctl[c] : 0);
    this.etat = etat;
    this.prec = copie(etat);
    this.resultat = sim.fin(etat);
    this.journal = [];               // [[k, ordres], …] depuis le plus ancien instantané gardé
    this.instantanes = [{ k: 0, etat: copie(etat) }];
    this.hashes = [];                // [[k, h], …] (les 20 derniers)
  }

  Simulation.prototype.k = function () { return this.etat.k; };

  // Joue le tick suivant avec ses ordres. Renvoie le hachage si c'est un tick de contrôle.
  Simulation.prototype.avancer = function (ordres) {
    var sim = this.sim, etat = this.etat, camps = sim.camps;
    var k = etat.k + 1;
    this.prec = copie(etat);
    var liste = trierOrdres(Array.isArray(ordres) ? ordres : []);
    var alea = aleaDe(etat);
    var i, o;
    // 1. contrôles
    for (i = 0; i < liste.length; i++) {
      o = liste[i];
      if (o[0] === camps && o[2] === T_CONTROLE && Number.isInteger(o[3]) && o[3] >= 0 && o[3] < camps && Number.isInteger(o[4]) && o[4] >= 0 && o[4] <= 3) etat.ctl[o[3]] = o[4];
    }
    // 2. humains
    for (i = 0; i < liste.length; i++) {
      o = liste[i];
      if (!Array.isArray(o) || !Number.isInteger(o[0]) || o[0] < 0 || o[0] >= camps || etat.ctl[o[0]] !== 0) continue;
      var ordre = o.slice(2, 6);
      if (!ordreBienForme(ordre)) continue;
      var ok = false;
      try { ok = sim.valide(etat, o[0], ordre) === true; } catch (e) { ok = false; }
      if (ok) sim.ordre(etat, o[0], ordre);
    }
    // 3. robots
    for (var c = 0; c < camps; c++) {
      if (etat.ctl[c] === 0 || (k + c * 3) % sim.periodeBot !== 0) continue;
      var siens = [];
      try { siens = sim.bot(etat, c, etat.ctl[c], alea) || []; } catch (e) { siens = []; }
      for (var j = 0; j < siens.length && j < 8; j++) {
        if (ordreBienForme(siens[j]) && sim.valide(etat, c, siens[j]) === true) sim.ordre(etat, c, siens[j]);
      }
    }
    // 4. un pas
    sim.pas(etat, alea);
    etat.k = k;
    this.journal.push([k, liste]);
    var h = null;
    if (k % this.r.hashTous === 0) {
      h = hacher(etat);
      this.hashes.push([k, h]);
      if (this.hashes.length > 20) this.hashes.shift();
    }
    if (k % this.r.instantaneTous === 0) {
      this.instantanes.push({ k: k, etat: copie(etat) });
      if (this.instantanes.length > 2) {
        this.instantanes.shift();
        var depuis = this.instantanes[0].k;
        while (this.journal.length && this.journal[0][0] <= depuis) this.journal.shift();
      }
    }
    if (!this.resultat) this.resultat = sim.fin(etat);
    return h;
  };

  Simulation.prototype.instantane = function () { return { k: this.etat.k, etat: copie(this.etat) }; };

  // Remplace l'état (resynchronisation, reprise). Le journal repart de cet instantané.
  Simulation.prototype.restaurer = function (snap) {
    if (!snap || !snap.etat || !Number.isInteger(snap.k)) return false;
    this.etat = copie(snap.etat);
    this.etat.k = snap.k;
    this.prec = copie(this.etat);
    this.journal = [];
    this.instantanes = [{ k: snap.k, etat: copie(this.etat) }];
    this.hashes = [];
    this.resultat = this.sim.fin(this.etat);
    return true;
  };

  Simulation.prototype.hashDe = function (k) {
    for (var i = this.hashes.length - 1; i >= 0; i--) if (this.hashes[i][0] === k) return this.hashes[i][1];
    return null;
  };

  // Rejoue un journal de paquets [[k, ordres], …] depuis un état de départ (tests, reprise).
  function rejouer(sim, graine, config, journal, reglages) {
    var s = new Simulation(sim, graine, config, reglages);
    for (var i = 0; i < journal.length; i++) s.avancer(journal[i][1]);
    return s;
  }

  // --- Cadenceur : l'horloge d'une partie -----------------------------------
  // o : { camps, delai, depart (dernier tick déjà joué), envoyer(paquet) }

  function Cadenceur(o) {
    this.camps = o.camps;
    this.delai = Number.isInteger(o.delai) ? o.delai : REGLAGES.delaiEntree;
    this.k = Number.isInteger(o.depart) ? o.depart : 0;
    this.envoyer = o.envoyer || function () {};
    this.attente = [];                    // [kApplication, ordre complet]
    this.seqs = [];
    for (var c = 0; c < this.camps; c++) this.seqs.push(-1);
    this.seqSys = 0;
  }

  // Ordre d'un joueur : joué au tick courant + délai. Les numéros de séquence ne font que
  // croître (un ordre en double ou rejoué est ignoré). false si l'ordre est refusé.
  Cadenceur.prototype.recevoir = function (camp, seq, ordre) {
    if (!Number.isInteger(camp) || camp < 0 || camp >= this.camps) return false;
    if (!Number.isInteger(seq) || seq <= this.seqs[camp] || !ordreBienForme(ordre)) return false;
    this.seqs[camp] = seq;
    this.attente.push([this.k + this.delai, [camp, seq].concat(ordre)]);
    return true;
  };

  // Le camp passe à un robot (niveau 1 à 3) ou revient à un humain (0), au tick suivant.
  Cadenceur.prototype.controle = function (camp, niveau) {
    this.seqSys += 1;
    this.attente.push([this.k + 1, [this.camps, this.seqSys, T_CONTROLE, camp, niveau]]);
  };

  // Tick suivant : paquet des ordres arrivés à échéance, diffusé (même vide).
  Cadenceur.prototype.pas = function () {
    this.k += 1;
    var k = this.k, garde = [], o = [];
    for (var i = 0; i < this.attente.length; i++) {
      if (this.attente[i][0] <= k) o.push(this.attente[i][1]); else garde.push(this.attente[i]);
    }
    this.attente = garde;
    var paquet = { t: 'k', k: k, o: trierOrdres(o) };
    this.envoyer(paquet);
    return paquet;
  };

  // --- Partie, côté jeu ------------------------------------------------------
  // o : {
  //   sim           window.JEL_SIM
  //   surEvenement  function (e) :
  //                   { type: 'recherche', reste, n }      recherche en cours (reste : ms ; n : joueurs qui cherchent, ou null)
  //                   { type: 'connexion' }                adversaire trouvé, connexion en cours
  //                   { type: 'debut', mode, camp, raison } partie commencée : mode 'local' (robot) ou 'p2p' / 'relais'
  //                   { type: 'controle', camp, niveau }   un camp passe au robot (niveau ≥ 1) ou revient à l'humain (0)
  //                   { type: 'fin', resultat }            partie finie (fin(etat) de la simulation)
  //                   { type: 'info', code }               'budget', 'coupe', 'reprise', 'desync', 'hors-ligne'…
  //                   { type: 'attente', n }               réponse à partie.attente() : joueurs qui cherchent
  //   reglages      remplace des valeurs de REGLAGES
  // }
  // Commandes : local({ graine, config, camp }), chercher({ config, repli }), jouerRobot(),
  // ordre([type, a, b, c]), pause(oui), quitter(), attente().
  // Lecture : mode ('arret', 'recherche', 'connexion', 'local', 'en-ligne', 'fin'), camp, etat (tick
  // courant), prec (tick précédent), alpha() (0 à 1, pour l'interpolation du rendu), resultat,
  // connexion ('p2p' | 'relais' | null).

  function dansLanceur() {
    try { return racine.parent && racine.parent !== racine; } catch (e) { return false; }
  }

  function horloge() {
    return racine.performance && typeof racine.performance.now === 'function' ? racine.performance.now() : Date.now();
  }

  function Partie(o) {
    this.o = o || {};
    this.sim = this.o.sim;
    this.r = Object.assign({}, REGLAGES, this.sim && this.sim.reglages, this.o.reglages || {});
    this.mode = 'arret';
    this.camp = 0;
    this.connexion = null;
    this.s = null;                 // Simulation
    this.cad = null;               // cadenceur local (partie contre le robot)
    this.file = [];                // paquets reçus, pas encore joués (en ligne)
    this.seq = 0;
    this.tDernier = 0;             // heure du dernier tick joué
    this.minuteur = 0;
    this.minuteurRecherche = 0;
    this.finRecherche = 0;
    this.nRecherche = null;
    this.enPause = false;
    this.attendSnap = false;
    this.repli = null;             // { graine, config } de la partie contre le robot si personne n'est trouvé
    this.ecoute = this.recevoirLanceur.bind(this);
    this.battement = this.boucle.bind(this);
  }

  Object.defineProperty(Partie.prototype, 'etat', { get: function () { return this.s ? this.s.etat : null; } });
  Object.defineProperty(Partie.prototype, 'prec', { get: function () { return this.s ? this.s.prec : null; } });
  Object.defineProperty(Partie.prototype, 'resultat', { get: function () { return this.s ? this.s.resultat : null; } });

  Partie.prototype.signaler = function (e) {
    var f = this.o.surEvenement;
    if (typeof f !== 'function') return;
    try { f(e); } catch (erreur) { setTimeout(function () { throw erreur; }, 0); }
  };

  Partie.prototype.alpha = function () {
    if (!this.s || this.enPause) return 1;
    var a = (horloge() - this.tDernier) / this.r.tickMs;
    return a < 0 ? 0 : a > 1 ? 1 : a;
  };

  Partie.prototype.versLanceur = function (m) {
    m.type = 'jel-tr';
    try { racine.parent.postMessage(m, '*'); } catch (e) { /* pas de lanceur */ }
  };

  // Arrête tout sans rien annoncer.
  Partie.prototype.arreter = function () {
    clearTimeout(this.minuteur);
    clearInterval(this.minuteurRecherche);
    racine.removeEventListener('message', this.ecoute);
    if (this.mode === 'recherche' || this.mode === 'connexion' || this.mode === 'en-ligne') this.versLanceur({ op: 'quitter' });
    this.mode = 'arret';
    this.file = [];
    this.cad = null;
    this.connexion = null;
    this.attendSnap = false;
  };

  Partie.prototype.quitter = function () { this.arreter(); };

  // Partie contre le robot, entièrement sur l'appareil (aucune requête réseau).
  // p : { graine, config (ctl compris), camp }.
  Partie.prototype.local = function (p, raison) {
    this.arreter();
    racine.JEL_TR.derniere = this;       // pour le robot de contrôle (scripts/tester-temps-reel.mjs)
    p = p || {};
    this.camp = Number.isInteger(p.camp) ? p.camp : 0;
    this.s = new Simulation(this.sim, (p.graine >>> 0) || 1, p.config || {}, this.r);
    this.seq = 0;
    var moi = this;
    this.cad = new Cadenceur({ camps: this.sim.camps, delai: this.r.delaiEntree, depart: 0, envoyer: function (paquet) { moi.jouerPaquet(paquet); } });
    this.mode = 'local';
    this.enPause = false;
    this.tDernier = horloge();
    this.signaler({ type: 'debut', mode: 'local', camp: this.camp, raison: raison || 'choix' });
    this.minuteur = setTimeout(this.battement, 16);
  };

  // Recherche d'un adversaire en ligne (par le lanceur), robot si personne n'est trouvé
  // dans rechercheMs. p : { config (partie en ligne), repli: { graine, config, camp } }.
  Partie.prototype.chercher = function (p) {
    this.arreter();
    racine.JEL_TR.derniere = this;
    p = p || {};
    this.repli = p.repli || { graine: 1, config: {} };
    if (!dansLanceur()) { this.local(this.repli, 'seul'); return; }
    this.mode = 'recherche';
    this.nRecherche = null;
    this.finRecherche = horloge() + this.r.rechercheMs;
    racine.addEventListener('message', this.ecoute);
    this.versLanceur({ op: 'chercher', proto: PROTOCOLE, config: copie(p.config || {}) });
    var moi = this;
    var annoncer = function () {
      if (moi.mode !== 'recherche') return;
      var reste = Math.max(0, moi.finRecherche - horloge());
      moi.signaler({ type: 'recherche', reste: reste, n: moi.nRecherche });
      if (reste <= 0) moi.basculerLocal('personne');
    };
    this.minuteurRecherche = setInterval(annoncer, 250);
    annoncer();
  };

  // Bouton « Jouer contre un robot maintenant » (ou délai écoulé).
  Partie.prototype.jouerRobot = function () {
    if (this.mode === 'recherche' || this.mode === 'connexion') this.basculerLocal('choix');
  };

  Partie.prototype.basculerLocal = function (raison) {
    var repli = this.repli || { graine: 1, config: {} };
    this.local(repli, raison);
  };

  // Joueurs en recherche, demandés au lanceur (fin d'une partie contre le robot) : événement 'attente'.
  Partie.prototype.attente = function () {
    if (!dansLanceur()) return false;
    racine.removeEventListener('message', this.ecoute);
    racine.addEventListener('message', this.ecoute);
    this.versLanceur({ op: 'attente' });
    return true;
  };

  // Messages du lanceur : { type: 'jel-tr', etat: … } ou { type: 'jel-tr', paquet | snap | journal | demande }.
  Partie.prototype.recevoirLanceur = function (e) {
    if (e.source !== racine.parent) return;
    var d = e.data;
    if (!d || d.type !== 'jel-tr') return;
    if (d.etat === 'attente') {
      if (this.mode === 'recherche') { this.nRecherche = Number.isInteger(d.n) ? d.n : null; }
      else this.signaler({ type: 'attente', n: Number.isInteger(d.n) ? d.n : 0 });
      return;
    }
    if (d.etat === 'solo') {
      if (this.mode === 'recherche' || this.mode === 'connexion') this.basculerLocal(d.raison || 'reseau');
      return;
    }
    if (d.etat === 'trouve') {
      if (this.mode !== 'recherche') return;
      clearInterval(this.minuteurRecherche);
      this.mode = 'connexion';
      this.camp = d.camp === 1 ? 1 : 0;
      var cfg = copie(d.config || {});
      cfg.ctl = [0, 0];
      this.s = new Simulation(this.sim, d.graine >>> 0, cfg, this.r);
      this.seq = 0;
      this.file = [];
      this.signaler({ type: 'connexion' });
      this.versLanceur({ op: 'pret' });
      var moi = this;
      clearTimeout(this.minuteur);
      this.minuteur = setTimeout(function () { if (moi.mode === 'connexion') moi.basculerLocal('connexion'); }, this.r.connexionMs);
      return;
    }
    if (d.etat === 'mode') { this.connexion = d.mode === 'p2p' ? 'p2p' : 'relais'; return; }
    if (d.etat === 'info') { this.signaler({ type: 'info', code: String(d.code || '') }); return; }
    if (d.etat === 'coupe') { this.continuerSeul(d.raison || 'coupe'); return; }
    if (d.demande === 'snap') {
      if (this.s) this.versLanceur({ op: 'snap', snap: this.s.instantane() });
      return;
    }
    if (d.snap) { this.recevoirSnap(d.snap); return; }
    if (d.paquet) {
      if (this.mode !== 'connexion' && this.mode !== 'en-ligne') return;
      this.file.push(d.paquet);
      if (this.mode === 'connexion') {
        clearTimeout(this.minuteur);
        this.mode = 'en-ligne';
        this.tDernier = horloge();
        this.signaler({ type: 'debut', mode: this.connexion || 'relais', camp: this.camp, raison: 'en-ligne' });
        this.minuteur = setTimeout(this.battement, 0);
      }
    }
  };

  // Instantané reçu (désynchronisation, reprise) : l'état est remplacé, les paquets
  // suivants reprennent derrière.
  Partie.prototype.recevoirSnap = function (snap) {
    if (!this.s || !snap || !Number.isInteger(snap.k)) return;
    this.s.restaurer(snap);
    this.attendSnap = false;
    var k = snap.k;
    this.file = this.file.filter(function (p) { return p.k > k; });
    this.tDernier = horloge();
    this.signaler({ type: 'info', code: 'reprise' });
  };

  // Plus de réseau du tout : la partie continue sur l'appareil, au même tick, l'autre
  // camp tenu par le robot (niveau moyen).
  Partie.prototype.continuerSeul = function (raison) {
    if (this.mode === 'recherche' || this.mode === 'connexion') { this.basculerLocal(raison); return; }
    if (this.mode !== 'en-ligne' || !this.s) return;
    clearTimeout(this.minuteur);
    racine.removeEventListener('message', this.ecoute);
    var moi = this;
    // Les paquets déjà reçus sont joués d'abord (dans l'ordre), puis l'horloge locale prend la suite.
    while (this.file.length && this.file[0].k === this.s.k() + 1) this.jouerPaquet(this.file.shift());
    this.file = [];
    this.cad = new Cadenceur({ camps: this.sim.camps, delai: this.r.delaiEntree, depart: this.s.k(), envoyer: function (p) { moi.jouerPaquet(p); } });
    for (var c = 0; c < this.sim.camps; c++) if (c !== this.camp && this.s.etat.ctl[c] === 0) this.cad.controle(c, 2);
    this.mode = 'local';
    this.connexion = null;
    this.tDernier = horloge();
    this.signaler({ type: 'info', code: raison });
    this.minuteur = setTimeout(this.battement, 16);
  };

  // Ordre du joueur de l'appareil : [type, a, b, c]. Renvoie true s'il part.
  Partie.prototype.ordre = function (ordre) {
    if (!ordreBienForme(ordre) || !this.s || this.s.resultat) return false;
    if (this.mode === 'local') {
      if (this.enPause) return false;
      this.seq += 1;
      return this.cad.recevoir(this.camp, this.seq, ordre.slice());
    }
    if (this.mode === 'en-ligne' || this.mode === 'connexion') {
      this.seq += 1;
      this.versLanceur({ op: 'ordre', seq: this.seq, o: ordre.slice() });
      return true;
    }
    return false;
  };

  // Pause : seulement contre le robot (en ligne, la partie continue ; le moteur rattrape
  // les ticks au retour).
  Partie.prototype.pause = function (oui) {
    oui = !!oui;
    if (oui === this.enPause) return;
    this.enPause = oui;
    if (!oui) { this.tDernier = horloge(); clearTimeout(this.minuteur); this.minuteur = setTimeout(this.battement, 0); }
  };

  Partie.prototype.jouerPaquet = function (paquet) {
    var s = this.s;
    if (!s || !paquet || paquet.k !== s.k() + 1) return false;
    var avaitFin = !!s.resultat;
    var ctlAvant = s.etat.ctl.slice();
    var h = s.avancer(paquet.o);
    for (var c = 0; c < ctlAvant.length; c++) {
      if (s.etat.ctl[c] !== ctlAvant[c]) this.signaler({ type: 'controle', camp: c, niveau: s.etat.ctl[c] });
    }
    if (h && this.mode === 'en-ligne') this.versLanceur({ op: 'hash', k: paquet.k, h: h });
    if (!avaitFin && s.resultat) {
      this.signaler({ type: 'fin', resultat: s.resultat });
      if (this.mode === 'en-ligne') this.versLanceur({ op: 'fin', k: paquet.k, resultat: s.resultat });
    }
    return true;
  };

  // Boucle (minuterie courte, découplée du rendu) : joue les ticks dus, sans jamais en
  // jouer plus de rattrapageMax d'un coup (l'affichage ne gèle pas ; un onglet revenu
  // d'arrière-plan rattrape en quelques images).
  Partie.prototype.boucle = function () {
    clearTimeout(this.minuteur);
    var s = this.s;
    if (!s || (this.mode !== 'local' && this.mode !== 'en-ligne')) return;
    var maintenant = horloge(), tick = this.r.tickMs, joues = 0;
    if (this.mode === 'local') {
      if (this.enPause || s.resultat) { this.tDernier = maintenant; if (s.resultat) { this.mode = 'fin'; return; } }
      else {
        var dus = Math.floor((maintenant - this.tDernier) / tick);
        // Contre le robot, un long retard (appareil endormi) n'est pas rattrapé : la partie reprend où elle était.
        if (dus > this.r.rattrapageMax) { dus = 1; this.tDernier = maintenant - tick; }
        while (dus > 0 && !s.resultat) { this.cad.pas(); this.tDernier += tick; dus--; joues++; }
      }
    } else {
      // En ligne : on suit l'horloge distante, avec une petite réserve pour lisser le réseau.
      this.file.sort(function (a, b) { return a.k - b.k; });
      while (this.file.length && this.file[0].k <= s.k()) this.file.shift();
      if (this.file.length && this.file[0].k !== s.k() + 1 && !this.attendSnap) {
        this.attendSnap = true;      // paquet manquant : on redemande l'état
        this.versLanceur({ op: 'reprise', depuis: s.k() });
      }
      var aJouer = Math.floor((maintenant - this.tDernier) / tick);
      if (this.file.length > this.r.reserve) aJouer = Math.max(aJouer, this.file.length - this.r.reserve);
      aJouer = Math.min(aJouer, this.r.rattrapageMax);
      while (aJouer > 0 && this.file.length && this.file[0].k === s.k() + 1) {
        this.jouerPaquet(this.file.shift());
        this.tDernier = Math.max(this.tDernier + tick, maintenant - tick);
        aJouer--; joues++;
      }
      if (!this.file.length && maintenant - this.tDernier > tick) this.tDernier = maintenant - tick;
      if (s.resultat && !this.file.length) { this.mode = 'fin'; this.versLanceur({ op: 'quitter' }); return; }
    }
    this.minuteur = setTimeout(this.battement, joues > 1 ? 0 : 16);
  };

  racine.JEL_TR = {
    PROTOCOLE: PROTOCOLE,
    T_CONTROLE: T_CONTROLE,
    REGLAGES: REGLAGES,
    copie: copie,
    tirer: tirer,
    aleaDe: aleaDe,
    racineEntiere: racineEntiere,
    div: div,
    sinus: sinus,
    cosinus: cosinus,
    hacher: hacher,
    premierFlottant: premierFlottant,
    ordreBienForme: ordreBienForme,
    trierOrdres: trierOrdres,
    problemesSim: problemesSim,
    Simulation: Simulation,
    rejouer: rejouer,
    Cadenceur: Cadenceur,
    Partie: Partie,
    creer: function (o) { return new Partie(o); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
