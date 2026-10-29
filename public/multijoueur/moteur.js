/* ==========================================================================
   Free Micro Games — moteur commun des jeux multijoueurs          jel-multi v2
   JavaScript pur, sans dépendance. Détails : docs/multijoueur.md.

   Le même fichier sert à trois endroits :
     - dans chaque jeu multijoueur, recopié tel quel dans index.html
       (bloc jel-multi, juste après jel-sauvegarde) par
       node scripts/i18n-jeu.mjs : window.JEL_MULTI ;
     - dans le Worker Cloudflare commun (multijoueur/src/), qui l'importe :
       globalThis.JEL_MULTI ;
     - dans les tests (scripts/tester-multijoueur.mjs).

   Les règles d'un jeu (bloc jel-regles du jeu, objet
   window.JEL_REGLES) sont des fonctions pures, sans écran ni réseau :
     places        nombre de places de la partie, 2 à 10 (constante unique)
     depart(alea, places, options)  état de départ d'une manche
     aQui(etat)    place qui doit jouer (0 à places − 1)
     valide(etat, place, action)    l'action est-elle permise ? (true/false)
     jouer(etat, place, action, alea)  nouvel état (alea : hasard reproductible)
     bot(etat, place, alea, force)  action d'un robot (force de 0 à 1)
     fin(etat)     null pendant la manche, sinon { classement, scores }
   Facultatifs : remplacement ('tour' : un vrai joueur prend la place d'un
   robot tout de suite ; 'manche' : à la manche suivante), delaiBot (ms entre
   deux coups affichés), delaiJoueur (ms laissées à un vrai joueur avant que
   son robot joue), pauseManche (ms entre deux manches, solo), attenteSalon
   (ms avant que le salon lance seul la manche), forceEnLigne.

   Arbitre : fait tourner une partie (places, robots, coups, manches). En ligne,
   c'est le Durable Object de la partie qui l'utilise ; en solo, le jeu en crée
   un sur l'appareil. Il n'a ni minuterie ni boucle : les coups des robots sont
   calculés d'un coup, dès que c'est à eux (le jeu les affiche ensuite un par
   un, espacés de delaiBot), et seul un réveil (alarme) est programmé pour le
   temps laissé à un vrai joueur, la pause entre deux manches ou le salon.

   Salon (en ligne : réglage salon) : avant chaque manche, les joueurs se
   retrouvent dans un salon d'attente ; les places vides y sont des robots, et
   chaque joueur qui arrive prend la place d'un robot. Le « chef » (le premier
   joueur arrivé encore présent) lance la manche ; s'il part, le suivant devient
   chef. Sans lancement, la manche part seule après attenteSalon. Pendant une
   manche, un arrivant remplace un robot selon « remplacement ».

   Messages de l'arbitre (seules les actions circulent, jamais l'état complet
   en continu ; l'état n'est envoyé qu'une fois, à l'arrivée d'un joueur) :
     { t: 'bienvenue', proto, siege, sieges, chef, n, manche, phase, etat, o, reste }
     { t: 'salon', chef, reste }        salon d'attente (reste : ms avant le lancement automatique)
     { t: 'manche', n, manche, g, o }   nouvelle manche (graine g, options o)
     { t: 'action', n, s, a, g, auto }  action a de la place s (graine g)
     { t: 'sieges', sieges, chef }      vrais joueurs (true) et robots (false), place du chef
     { t: 'place', siege }              place enfin attribuée (spectateur)
     { t: 'refus', n }                  action refusée
   Messages d'un joueur : { t: 'action', n, a }, { t: 'lancer' } (chef, dans le
   salon) et { t: 'resync' }.

   API pour le jeu (window.JEL_MULTI) :
     creer({ regles, surEvenement, enLigne, force, options, enchainer })
                       partie (voir Partie plus bas) ; lancer() la démarre
   Ce fichier ne doit contenir aucune balise script, ni ouverture ni fermeture
   (recopié dans le jeu, il tromperait la recherche des blocs jel-regles…).
   ========================================================================== */
(function (racine) {
  'use strict';
  if (racine.JEL_MULTI) return;

  var PROTOCOLE = 2;               // à augmenter si les messages changent (2 : salon d'attente)
  var TOURS_MAX = 5000;            // coups de robots enchaînés au plus (règles en boucle)
  var DELAI_CONNEXION = 6000;      // ms : sans réponse du serveur, partie contre des robots locaux
  var DELAI_MOI = 120;             // ms après son propre coup, avant le coup suivant affiché
  var DELAI_RATTRAPAGE = 80;       // ms entre deux coups rejoués après une pause en ligne

  var DEFAUTS = { remplacement: 'tour', delaiBot: 700, delaiJoueur: 20000, pauseManche: 6000, attenteSalon: 90000, forceEnLigne: 0.6 };
  var FONCTIONS = ['depart', 'aQui', 'valide', 'jouer', 'bot', 'fin'];

  // --- Outils ---------------------------------------------------------------

  function copie(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

  // Hasard reproductible (mulberry32) : la même graine donne la même suite,
  // sur le serveur comme sur chaque appareil.
  function hasard(graine) {
    var a = graine >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function nouvelleGraine(alea) { return Math.floor(alea() * 4294967296) >>> 0; }

  // Problèmes des règles d'un jeu (liste vide = bonnes). Sert au robot de contrôle.
  function problemesRegles(r) {
    if (!r || typeof r !== 'object') return ['window.JEL_REGLES absent ou qui n\'est pas un objet'];
    var p = [];
    if (!Number.isInteger(r.places) || r.places < 2 || r.places > 10) p.push('"places" doit être un nombre entier de 2 à 10');
    FONCTIONS.forEach(function (f) { if (typeof r[f] !== 'function') p.push('fonction "' + f + '" absente'); });
    if (r.remplacement !== undefined && r.remplacement !== 'tour' && r.remplacement !== 'manche') p.push('"remplacement" : "tour" ou "manche"');
    var bornes = { delaiBot: [200, 3000], delaiJoueur: [5000, 60000], pauseManche: [2000, 30000], attenteSalon: [20000, 300000], forceEnLigne: [0, 1] };
    Object.keys(bornes).forEach(function (k) {
      if (r[k] !== undefined && !(typeof r[k] === 'number' && r[k] >= bornes[k][0] && r[k] <= bornes[k][1])) {
        p.push('"' + k + '" : nombre de ' + bornes[k][0] + ' à ' + bornes[k][1]);
      }
    });
    return p;
  }

  // Règles avec les valeurs par défaut des réglages facultatifs.
  function completer(r) {
    var c = {};
    Object.keys(DEFAUTS).forEach(function (k) { c[k] = DEFAUTS[k]; });
    Object.keys(r).forEach(function (k) { if (r[k] !== undefined) c[k] = r[k]; });
    return c;
  }

  // --- Arbitre --------------------------------------------------------------
  // reglages : {
  //   envoyer(cle, message)  cle = un joueur, ou null pour tous
  //   maintenant()           heure en ms (Date.now par défaut)
  //   alea()                 hasard du serveur (Math.random par défaut)
  //   salon                  true (en ligne) : salon d'attente avant chaque manche, lancée par le chef
  //   enchainer              false : pas de nouvelle manche automatique (solo à niveaux)
  //   delaiJoueur            remplace celui des règles (Infinity : jamais de robot à sa place)
  //   force                  force des robots (forceEnLigne des règles par défaut)
  //   options                options des manches (ex. { niveau: 3 }) ; sinon { manche: n }
  // }

  function Arbitre(regles, reglages) {
    this.r = completer(regles);
    this.reglages = reglages || {};
    this.places = this.r.places;
    this.sieges = [];                       // cle du vrai joueur de chaque place, null = robot
    for (var s = 0; s < this.places; s++) this.sieges.push(null);
    this.attente = [];                      // joueurs qui attendent une place (remplacement 'manche')
    this.arrivees = [];                     // vrais joueurs présents, dans l'ordre d'arrivée (le 1er est le chef)
    this.etat = null;
    this.n = 0;                             // numéro du dernier message de jeu (manche ou action)
    this.manche = 0;
    this.phase = 'attente';                 // 'attente' (rien commencé), 'salon', 'jeu', 'pause' (entre deux manches, solo)
    this.finManche = 0;                     // fin de la pause entre deux manches (ms)
    this.salonDepuis = 0;                   // ouverture du salon (ms), pour son lancement automatique
    this.echeance = null;                   // { siege, quand } : temps laissé à un vrai joueur
    this.options = null;                    // options de la manche en cours
  }

  Arbitre.prototype.maintenant = function () { return this.reglages.maintenant ? this.reglages.maintenant() : Date.now(); };
  Arbitre.prototype.alea = function () { return this.reglages.alea ? this.reglages.alea() : Math.random(); };
  Arbitre.prototype.force = function () { return typeof this.reglages.force === 'number' ? this.reglages.force : this.r.forceEnLigne; };
  Arbitre.prototype.envoyer = function (cle, message) { if (this.reglages.envoyer) this.reglages.envoyer(cle, message); };

  // Nombre de vrais joueurs (assis ou en attente d'une place).
  Arbitre.prototype.humains = function () {
    return this.sieges.filter(function (c) { return c !== null; }).length + this.attente.length;
  };
  Arbitre.prototype.estVide = function () { return this.humains() === 0; };
  Arbitre.prototype.estPleine = function () { return this.humains() >= this.places; };

  // État à garder (stockage du Durable Object entre deux réveils).
  Arbitre.prototype.donnees = function () {
    return {
      v: PROTOCOLE, sieges: this.sieges, attente: this.attente, arrivees: this.arrivees, etat: this.etat, n: this.n,
      manche: this.manche, phase: this.phase, finManche: this.finManche, salonDepuis: this.salonDepuis,
      echeance: this.echeance, options: this.options,
    };
  };

  Arbitre.prototype.restaurer = function (d) {
    if (!d || d.v !== PROTOCOLE || !Array.isArray(d.sieges) || d.sieges.length !== this.places) return false;
    this.sieges = d.sieges.slice();
    this.attente = Array.isArray(d.attente) ? d.attente.slice() : [];
    var presents = this.sieges.concat(this.attente).filter(function (c) { return c !== null; });
    this.arrivees = Array.isArray(d.arrivees) ? d.arrivees.filter(function (c) { return presents.indexOf(c) >= 0; }) : presents;
    this.salonDepuis = d.salonDepuis || 0;
    this.etat = d.etat;
    this.n = d.n;
    this.manche = d.manche;
    this.phase = d.phase;
    this.finManche = d.finManche || 0;
    this.echeance = d.echeance || null;
    this.options = d.options || null;
    return true;
  };

  Arbitre.prototype.flagsSieges = function () { return this.sieges.map(function (c) { return c !== null; }); };

  // Le chef : le premier vrai joueur arrivé encore présent ; sa place (-1 s'il n'en a pas encore).
  Arbitre.prototype.chef = function () { return this.arrivees.length ? this.arrivees[0] : null; };
  Arbitre.prototype.siegeChef = function () { var c = this.chef(); return c === null ? -1 : this.sieges.indexOf(c); };

  Arbitre.prototype.envoyerSieges = function () {
    this.envoyer(null, { t: 'sieges', sieges: this.flagsSieges(), chef: this.siegeChef() });
  };

  // Temps restant avant la fin de la pause (solo) ou le lancement automatique du salon.
  Arbitre.prototype.reste = function () {
    var t = this.maintenant();
    if (this.phase === 'pause') return Math.max(0, this.finManche - t);
    if (this.phase === 'salon') return Math.max(0, this.salonDepuis + this.r.attenteSalon - t);
    return 0;
  };

  Arbitre.prototype.bienvenue = function (cle, siege) {
    this.envoyer(cle, {
      t: 'bienvenue', proto: PROTOCOLE, siege: siege, sieges: this.flagsSieges(), chef: this.siegeChef(),
      n: this.n, manche: this.manche, phase: this.phase, etat: this.etat, o: this.options, reste: this.reste(),
    });
  };

  // Place d'un robot à donner à un vrai joueur : de préférence pas celle qui doit jouer.
  Arbitre.prototype.siegeRobot = function () {
    var tour = this.phase === 'jeu' ? this.r.aQui(this.etat) : -1;
    var choix = -1;
    for (var s = 0; s < this.places; s++) {
      if (this.sieges[s] !== null) continue;
      if (s !== tour) return s;
      choix = s;
    }
    return choix;
  };

  // Une fois le premier joueur arrivé : salon d'attente (en ligne), sinon première manche.
  Arbitre.prototype.demarrer = function () {
    if (this.phase !== 'attente') return;
    if (this.reglages.salon) this.ouvrirSalon(0);
    else this.nouvelleManche();
  };

  // Salon d'attente : les arrivants prennent la place de robots ; le chef lance la
  // manche (message 'lancer'), sinon elle part seule après attenteSalon.
  // delai : temps d'affichage des derniers coups de la manche précédente.
  Arbitre.prototype.ouvrirSalon = function (delai) {
    this.phase = 'salon';
    this.echeance = null;
    this.salonDepuis = this.maintenant() + delai;
    this.placerAttente();
    // reste : compté à partir du moment où l'appareil lit le message (après l'affichage des coups).
    this.envoyer(null, { t: 'salon', chef: this.siegeChef(), reste: this.r.attenteSalon });
  };

  Arbitre.prototype.nouvelleManche = function () {
    var options = this.reglages.options ? copie(this.reglages.options) : { manche: this.manche + 1 };
    var g = nouvelleGraine(this.alea.bind(this));
    this.manche += 1;
    this.n += 1;
    this.options = options;
    this.etat = this.r.depart(hasard(g), this.places, copie(options));
    this.phase = 'jeu';
    this.echeance = null;
    this.envoyer(null, { t: 'manche', n: this.n, manche: this.manche, g: g, o: options });
    this.placerAttente();
    this.avancer(0);
  };

  // Joueurs en attente (remplacement 'manche') : ils prennent la place de robots.
  Arbitre.prototype.placerAttente = function () {
    var change = false;
    while (this.attente.length) {
      var s = this.siegeRobot();
      if (s < 0) break;
      var cle = this.attente.shift();
      this.sieges[s] = cle;
      change = true;
      this.envoyer(cle, { t: 'place', siege: s });
    }
    if (change) this.envoyerSieges();
  };

  // Un vrai joueur arrive. Renvoie sa place, -1 s'il attend la manche suivante,
  // null si la partie est déjà pleine de vrais joueurs.
  Arbitre.prototype.rejoindre = function (cle) {
    var deja = this.sieges.indexOf(cle);
    if (deja >= 0 || this.attente.indexOf(cle) >= 0) {
      this.bienvenue(cle, deja);
      return deja;
    }
    if (this.estPleine()) return null;
    var s = this.r.remplacement === 'manche' && this.phase === 'jeu' ? -1 : this.siegeRobot();
    if (s >= 0) this.sieges[s] = cle; else this.attente.push(cle);
    this.arrivees.push(cle);
    this.bienvenue(cle, s);
    if (s >= 0) this.envoyerSieges();
    return s;
  };

  // Un vrai joueur s'en va : un robot reprend sa place, la partie continue ;
  // si c'était le chef, le joueur arrivé juste après lui le devient.
  Arbitre.prototype.quitter = function (cle) {
    var k = this.arrivees.indexOf(cle);
    if (k >= 0) this.arrivees.splice(k, 1);
    var i = this.attente.indexOf(cle);
    if (i >= 0) { this.attente.splice(i, 1); if (k === 0) this.envoyerSieges(); return; }
    var s = this.sieges.indexOf(cle);
    if (s < 0) return;
    this.sieges[s] = null;
    this.envoyerSieges();
    if (this.echeance && this.echeance.siege === s) {
      this.echeance = null;
      this.avancer(0);
    }
  };

  Arbitre.prototype.valide = function (s, a) {
    if (a === undefined || this.phase !== 'jeu') return false;
    try { return this.r.valide(copie(this.etat), s, copie(a)) === true; } catch (e) { return false; }
  };

  // Applique une action (déjà contrôlée) et l'annonce à tous.
  Arbitre.prototype.appliquer = function (s, a, auto) {
    var g = nouvelleGraine(this.alea.bind(this));
    this.etat = this.r.jouer(copie(this.etat), s, copie(a), hasard(g));
    this.n += 1;
    var m = { t: 'action', n: this.n, s: s, a: a, g: g };
    if (auto) m.auto = true;
    this.envoyer(null, m);
  };

  // Coup d'un robot (à sa place, ou à celle d'un vrai joueur trop long : auto).
  // Un robot qui ne trouve aucune action permise arrête la manche (règles fautives).
  Arbitre.prototype.jouerRobot = function (s, auto) {
    var a;
    try { a = this.r.bot(copie(this.etat), s, this.alea.bind(this), this.force()); } catch (e) { a = undefined; }
    if (!this.valide(s, a)) { this.finirManche(0); return false; }
    this.appliquer(s, a, auto);
    return true;
  };

  // Fait jouer les robots tant que c'est à eux, jusqu'au tour d'un vrai joueur
  // ou à la fin de la manche. delai : temps d'affichage des coups déjà annoncés.
  Arbitre.prototype.avancer = function (delai) {
    var tours = 0;
    while (this.phase === 'jeu') {
      if (this.r.fin(this.etat)) { this.finirManche(delai); return; }
      if (this.estVide()) return;            // plus personne : la partie va être fermée
      var s = this.r.aQui(this.etat);
      if (!(Number.isInteger(s) && s >= 0 && s < this.places)) { this.finirManche(delai); return; }
      if (this.sieges[s] !== null) {
        var d = this.reglages.delaiJoueur !== undefined ? this.reglages.delaiJoueur : this.r.delaiJoueur;
        this.echeance = isFinite(d) ? { siege: s, quand: this.maintenant() + delai + d } : null;
        return;
      }
      if (!this.jouerRobot(s, false)) return;
      delai += this.r.delaiBot;
      if (++tours > TOURS_MAX) { this.finirManche(delai); return; }
    }
  };

  Arbitre.prototype.finirManche = function (delai) {
    if (this.reglages.salon) { this.ouvrirSalon(delai); return; }
    this.phase = 'pause';
    this.echeance = null;
    this.finManche = this.maintenant() + delai + this.r.pauseManche;
  };

  // Message d'un vrai joueur (déjà lu en JSON).
  Arbitre.prototype.recevoir = function (cle, m) {
    if (!m || typeof m !== 'object') return;
    var s = this.sieges.indexOf(cle);
    if (m.t === 'resync') { this.bienvenue(cle, s); return; }
    // Le chef lance la manche depuis le salon (les autres attendent).
    if (m.t === 'lancer') {
      if (this.phase === 'salon' && cle === this.chef()) this.nouvelleManche();
      return;
    }
    if (m.t !== 'action') return;
    if (s < 0 || this.phase !== 'jeu' || m.n !== this.n || this.r.aQui(this.etat) !== s || !this.valide(s, m.a)) {
      this.envoyer(cle, { t: 'refus', n: this.n });
      return;
    }
    this.echeance = null;
    this.appliquer(s, m.a, false);
    this.avancer(0);
  };

  // Heure du prochain réveil utile (ms), ou null.
  Arbitre.prototype.prochainReveil = function () {
    if (this.phase === 'pause' && this.reglages.enchainer !== false) return this.finManche;
    if (this.phase === 'salon') return this.salonDepuis + this.r.attenteSalon;
    if (this.phase === 'jeu' && this.echeance) return this.echeance.quand;
    return null;
  };

  // Réveil (alarme) : nouvelle manche après la pause ou au bout du salon, ou
  // robot qui joue à la place d'un vrai joueur resté trop longtemps sans jouer.
  Arbitre.prototype.reveil = function () {
    var t = this.maintenant();
    if (this.phase === 'salon' && t >= this.salonDepuis + this.r.attenteSalon) {
      if (!this.estVide()) this.nouvelleManche();
      return;
    }
    if (this.phase === 'pause' && this.reglages.enchainer !== false && t >= this.finManche) {
      if (!this.estVide()) this.nouvelleManche();
      return;
    }
    if (this.phase === 'jeu' && this.echeance && t >= this.echeance.quand) {
      var s = this.echeance.siege;
      this.echeance = null;
      if (this.r.aQui(this.etat) === s && this.jouerRobot(s, true)) this.avancer(this.r.delaiBot);
    }
  };

  // --- Partie, côté jeu -----------------------------------------------------
  // o : {
  //   regles        window.JEL_REGLES
  //   surEvenement  function (e) : { type: 'mode', mode, raison } ('connexion', 'en-ligne', 'solo') ;
  //                 { type: 'debut', reste } (arrivée dans une partie : etat, siege, sieges,
  //                 phase : 'salon' le plus souvent) ;
  //                 { type: 'salon', reste } (salon d'attente, en ligne : avant la 1re manche et
  //                 après chacune ; le chef peut lancer, sinon lancement seul dans reste ms) ;
  //                 { type: 'manche' } (nouvelle manche, etat de départ) ;
  //                 { type: 'action', siege, action, avant, apres, auto, moi } ;
  //                 { type: 'fin', resultat } (fin(etat) des règles) ;
  //                 { type: 'sieges' } (un vrai joueur arrive ou part, ou le chef change) ; { type: 'refus' }
  //   enLigne       false : directement contre des robots sur l'appareil (sinon : en ligne
  //                 si le lanceur du site le permet, robots locaux à défaut)
  //   force         force des robots locaux (0 à 1)
  //   options       options des manches locales (ex. { niveau: 3 })
  //   enchainer     false : pas de nouvelle manche automatique en solo (jeu à niveaux)
  // }
  // Lecture : partie.mode, partie.etat, partie.siege (place du joueur, -1 en attente),
  // partie.phase ('attente', 'salon', 'jeu', 'pause'), partie.sieges() ([{ humain, moi, chef }]),
  // partie.chef (place du chef), partie.estChef(), partie.monTour(). Commandes : lancer(),
  // lancerManche() (le chef, dans le salon), jouer(action), pause(oui), recommencer(options)
  // (solo), quitter(). La dernière partie lancée est aussi dans JEL_MULTI.derniere.

  function dansLanceur() {
    try { return racine.parent && racine.parent !== racine; } catch (e) { return false; }
  }

  function Partie(o) {
    this.o = o || {};
    this.r = completer(this.o.regles);
    this.mode = 'arret';
    this.etat = null;
    this.n = 0;
    this.manche = 0;
    this.phase = 'attente';
    this.siege = -1;
    this.humains = [];
    this.chef = -1;            // place du chef du salon (en ligne)
    this.options = null;
    this.file = [];            // messages reçus, joués un par un
    this.libreA = 0;           // heure à partir de laquelle le message suivant peut être joué
    this.rattrapage = false;   // coups accumulés pendant une pause en ligne : rejoués vite
    this.minuteur = 0;
    this.enPause = false;
    this.debutPause = 0;
    this.attendEcho = false;   // action envoyée, pas encore revenue
    this.versSolo = false;     // connexion coupée : bascule en solo une fois la file vidée
    this.local = null;         // arbitre local (solo)
    this.minuteurReveil = 0;
    this.minuteurConnexion = 0;
    this.ecoute = this.recevoirLanceur.bind(this);
  }

  Partie.prototype.signaler = function (e) {
    var f = this.o.surEvenement;
    if (typeof f !== 'function') return;
    // Une erreur du jeu ne bloque pas la file ; elle reste signalée (console, suivi du site).
    try { f(e); } catch (erreur) { setTimeout(function () { throw erreur; }, 0); }
  };

  Partie.prototype.changerMode = function (mode, raison) {
    this.mode = mode;
    this.signaler({ type: 'mode', mode: mode, raison: raison || '' });
  };

  Partie.prototype.lancer = function () {
    this.arreter();
    racine.JEL_MULTI.derniere = this;      // pour le robot de contrôle (scripts/tester-multijoueur.mjs)
    if (this.o.enLigne !== false && dansLanceur()) {
      this.changerMode('connexion');
      racine.addEventListener('message', this.ecoute);
      try { racine.parent.postMessage({ type: 'jel-multi', op: 'rejoindre', proto: PROTOCOLE }, '*'); } catch (e) { /* pas de lanceur */ }
      var moi = this;
      this.minuteurConnexion = setTimeout(function () { moi.passerSolo('delai'); }, DELAI_CONNEXION);
    } else {
      this.passerSolo(this.o.enLigne === false ? 'choix' : 'seul');
    }
  };

  // Arrête tout (connexion, robots locaux, file) sans rien annoncer.
  Partie.prototype.arreter = function () {
    clearTimeout(this.minuteur);
    clearTimeout(this.minuteurReveil);
    clearTimeout(this.minuteurConnexion);
    racine.removeEventListener('message', this.ecoute);
    if (this.mode === 'connexion' || this.mode === 'en-ligne') {
      try { racine.parent.postMessage({ type: 'jel-multi', op: 'quitter' }, '*'); } catch (e) { /* pas de lanceur */ }
    }
    this.file = [];
    this.local = null;
    this.versSolo = false;
    this.attendEcho = false;
    this.mode = 'arret';
  };

  Partie.prototype.quitter = function () { this.arreter(); };

  // Messages du lanceur : { type: 'jel-multi', m } (message du serveur) ou
  // { type: 'jel-multi', etat: 'solo' | 'coupe', raison }.
  Partie.prototype.recevoirLanceur = function (e) {
    if (e.source !== racine.parent) return;
    var d = e.data;
    if (!d || d.type !== 'jel-multi') return;
    if (d.etat) {
      if (this.mode === 'connexion') this.passerSolo(d.raison || d.etat);
      else if (this.mode === 'en-ligne') { this.versSolo = true; this.pomper(); }
      return;
    }
    var m = d.m;
    if (!m || typeof m !== 'object') return;
    if (this.mode === 'connexion') {
      if (m.t !== 'bienvenue') return;
      clearTimeout(this.minuteurConnexion);
      this.changerMode('en-ligne');
    }
    if (this.mode !== 'en-ligne') return;
    this.file.push(m);
    this.pomper();
  };

  // Partie contre des robots sur l'appareil (choix, pas de site, ou serveur absent).
  Partie.prototype.passerSolo = function (raison) {
    this.arreter();
    this.changerMode('solo', raison);
    this.local = this.creerArbitreLocal();
    this.local.rejoindre('moi');
    this.local.demarrer();
    this.programmerReveil();
  };

  Partie.prototype.creerArbitreLocal = function () {
    var moi = this;
    return new Arbitre(this.o.regles, {
      envoyer: function (cle, m) { moi.file.push(m); moi.pomper(); },
      enchainer: this.o.enchainer !== false,
      delaiJoueur: Infinity,               // le joueur de l'appareil prend son temps
      force: typeof this.o.force === 'number' ? this.o.force : this.r.forceEnLigne,
      options: this.o.options || null,
    });
  };

  // Connexion coupée pendant une partie en ligne : la partie continue sur
  // l'appareil, au même point, les autres places tenues par des robots locaux.
  Partie.prototype.basculer = function () {
    racine.removeEventListener('message', this.ecoute);
    // Coupure dans le salon (ou sans place) : une nouvelle manche commence contre des robots.
    if (this.siege < 0 || !this.etat || this.phase === 'salon') { this.passerSolo('coupe'); return; }
    var a = this.creerArbitreLocal();
    var sieges = [];
    for (var s = 0; s < this.r.places; s++) sieges.push(s === this.siege ? 'moi' : null);
    a.restaurer({
      v: PROTOCOLE, sieges: sieges, attente: [], etat: copie(this.etat), n: this.n, manche: this.manche,
      phase: this.phase, finManche: Date.now() + this.r.pauseManche, echeance: null, options: this.options,
    });
    this.local = a;
    this.attendEcho = false;
    this.humains = a.flagsSieges();
    this.changerMode('solo', 'coupe');
    this.signaler({ type: 'sieges' });
    if (a.phase === 'jeu') a.avancer(0);
    this.programmerReveil();
  };

  Partie.prototype.programmerReveil = function () {
    clearTimeout(this.minuteurReveil);
    if (!this.local || this.enPause) return;
    var t = this.local.prochainReveil();
    if (t === null || !isFinite(t)) return;
    var moi = this;
    this.minuteurReveil = setTimeout(function () {
      if (!moi.local || moi.enPause) return;
      moi.local.reveil();
      moi.programmerReveil();
    }, Math.max(0, t - Date.now()));
  };

  // Joue les messages reçus un par un : les coups des autres sont espacés de
  // delaiBot, pour qu'on les voie.
  Partie.prototype.pomper = function () {
    if (this.enPause) return;
    clearTimeout(this.minuteur);
    while (this.file.length) {
      var attente = this.libreA - Date.now();
      if (attente > 0) {
        var moi = this;
        this.minuteur = setTimeout(function () { moi.pomper(); }, attente);
        return;
      }
      var delai = this.traiter(this.file.shift());
      this.libreA = Date.now() + (this.rattrapage ? Math.min(delai, DELAI_RATTRAPAGE) : delai);
    }
    this.rattrapage = false;
    if (this.versSolo) {
      this.versSolo = false;
      this.basculer();
    }
  };

  // Joue un message ; renvoie le temps à laisser avant le suivant (ms).
  Partie.prototype.traiter = function (m) {
    var r = this.r;
    switch (m.t) {
      case 'bienvenue':
        this.siege = m.siege;
        this.humains = m.sieges || [];
        this.chef = typeof m.chef === 'number' ? m.chef : -1;
        this.n = m.n;
        this.manche = m.manche;
        this.options = m.o || null;
        this.etat = m.etat;
        this.phase = m.phase;
        this.attendEcho = false;
        this.signaler({ type: 'debut', reste: m.reste || 0 });
        return 0;
      case 'manche':
        this.etat = r.depart(hasard(m.g), r.places, copie(m.o));
        this.n = m.n;
        this.manche = m.manche;
        this.options = m.o || null;
        this.phase = 'jeu';
        this.attendEcho = false;
        this.signaler({ type: 'manche' });
        return 300;
      case 'action': {
        if (m.n !== this.n + 1 || !this.etat) { this.resynchroniser(); return 0; }
        var avant = this.etat, apres;
        try { apres = r.jouer(copie(avant), m.s, copie(m.a), hasard(m.g)); } catch (e) { this.resynchroniser(); return 0; }
        this.etat = apres;
        this.n = m.n;
        var moi = m.s === this.siege;
        if (moi) this.attendEcho = false;
        this.signaler({ type: 'action', siege: m.s, action: m.a, avant: avant, apres: apres, auto: !!m.auto, moi: moi });
        var resultat = r.fin(apres);
        if (resultat) {
          this.phase = 'pause';
          this.signaler({ type: 'fin', resultat: resultat });
        }
        return moi && !m.auto ? DELAI_MOI : r.delaiBot;
      }
      case 'sieges':
        this.humains = m.sieges || [];
        if (typeof m.chef === 'number') this.chef = m.chef;
        this.signaler({ type: 'sieges' });
        return 0;
      case 'salon':
        this.phase = 'salon';
        if (typeof m.chef === 'number') this.chef = m.chef;
        this.attendEcho = false;
        this.signaler({ type: 'salon', reste: m.reste || 0 });
        return 0;
      case 'place':
        this.siege = m.siege;
        this.signaler({ type: 'sieges' });
        return 0;
      case 'refus':
        this.attendEcho = false;
        this.signaler({ type: 'refus' });
        return 0;
      default:
        return 0;
    }
  };

  // Messages perdus ou incohérents : en ligne, on redemande l'état au serveur.
  Partie.prototype.resynchroniser = function () {
    this.file = [];
    if (this.mode === 'en-ligne') {
      try { racine.parent.postMessage({ type: 'jel-multi', op: 'envoyer', m: { t: 'resync' } }, '*'); } catch (e) { /* pas de lanceur */ }
    }
  };

  Partie.prototype.sieges = function () {
    var liste = [];
    for (var s = 0; s < this.r.places; s++) {
      liste.push({ humain: this.humains[s] === true, moi: s === this.siege, chef: this.mode === 'en-ligne' && s === this.chef });
    }
    return liste;
  };

  // Le joueur de l'appareil peut-il lancer la manche ? (en ligne, dans le salon, s'il est le chef)
  Partie.prototype.estChef = function () {
    return this.mode === 'en-ligne' && this.phase === 'salon' && this.siege >= 0 && this.siege === this.chef;
  };

  // Le chef lance la manche depuis le salon. Renvoie true si la demande part.
  Partie.prototype.lancerManche = function () {
    if (!this.estChef() || this.file.length) return false;
    try { racine.parent.postMessage({ type: 'jel-multi', op: 'envoyer', m: { t: 'lancer' } }, '*'); } catch (e) { return false; }
    return true;
  };

  Partie.prototype.monTour = function () {
    if (this.phase !== 'jeu' || !this.etat || this.siege < 0 || this.attendEcho || this.file.length) return false;
    if (this.mode !== 'solo' && this.mode !== 'en-ligne') return false;
    try { return this.r.aQui(this.etat) === this.siege; } catch (e) { return false; }
  };

  // Action du joueur de l'appareil. Renvoie true si elle part (elle sera jouée
  // à son retour, comme celles des autres).
  Partie.prototype.jouer = function (action) {
    if (!this.monTour()) return false;
    try { if (this.r.valide(copie(this.etat), this.siege, copie(action)) !== true) return false; } catch (e) { return false; }
    this.attendEcho = true;
    var m = { t: 'action', n: this.n, a: copie(action) };
    if (this.mode === 'solo') {
      this.local.recevoir('moi', m);
      this.programmerReveil();
    } else {
      try { racine.parent.postMessage({ type: 'jel-multi', op: 'envoyer', m: m }, '*'); } catch (e) { this.attendEcho = false; return false; }
    }
    return true;
  };

  // Pause (menu, écran caché) : la file et les robots locaux s'arrêtent. En
  // ligne, la partie continue sur le serveur : les coups attendent la reprise.
  Partie.prototype.pause = function (oui) {
    if (oui === this.enPause) return;
    this.enPause = oui;
    if (oui) {
      this.debutPause = Date.now();
      clearTimeout(this.minuteur);
      clearTimeout(this.minuteurReveil);
      return;
    }
    var duree = Date.now() - this.debutPause;
    if (this.local) {
      if (this.local.finManche) this.local.finManche += duree;
      if (this.local.echeance) this.local.echeance.quand += duree;
    }
    if (this.mode === 'en-ligne') { this.libreA = 0; this.rattrapage = true; }   // rattraper vite les coups joués pendant la pause
    this.pomper();
    this.programmerReveil();
  };

  // Solo : nouvelle manche tout de suite (niveau suivant, rejouer…).
  Partie.prototype.recommencer = function (options) {
    if (this.mode !== 'solo' || !this.local) return false;
    if (options) { this.o.options = options; this.local.reglages.options = options; }
    this.file = [];
    this.libreA = 0;
    this.local.nouvelleManche();
    this.programmerReveil();
    return true;
  };

  racine.JEL_MULTI = {
    PROTOCOLE: PROTOCOLE,
    hasard: hasard,
    copie: copie,
    completer: completer,
    problemesRegles: problemesRegles,
    Arbitre: Arbitre,
    Partie: Partie,
    creer: function (o) { return new Partie(o); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
