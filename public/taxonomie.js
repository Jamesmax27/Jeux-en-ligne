// ==========================================================================
// Jeux-en-ligne — taxonomie du catalogue : FICHIER DE RÉFÉRENCE UNIQUE
//
// Listes fermées des genres et des univers, dans l'ordre d'affichage, plus
// les tranches d'âge de l'accueil. Lu par le site (app.js), les scripts
// (build-catalog, validate-games, idees, check-i18n, controle-taxonomie) et
// la boucle de nuit (agents d'idéation et de fabrication).
//
// Chaque entrée :
//   id      identifiant court, minuscules sans accents : c'est lui qu'on écrit
//           dans game.json et idees.json ; il ne change jamais ;
//   libelle libellé complet en français (bulle d'aide, filtre choisi…) ;
//   court   libellé court en français (puces de l'accueil, cartes des jeux) ;
//   picto   emoji affiché devant le libellé ; teinte : couleur de la puce (0-360).
//
// Traductions (I18N.md) : les libellés affichés viennent des fichiers de langue
// public/i18n/site/{fr,en,es,pt,de}.json, clés « genre.<id> », « genre.<id>.court »,
// « univers.<id> », « univers.<id>.court » ; le français y reprend exactement
// libelle et court (vérifié par scripts/check-i18n.js et
// scripts/controle-taxonomie.mjs).
//
// Dans game.json : "genre" (1 genre principal), "genres_secondaires" (0 à 2),
// "univers" (1 ou 2). « autre » seulement si rien ne correspond.
//
// Interdit de créer un genre ou un univers depuis un jeu ou une idée : la
// liste ne change que par une décision du propriétaire du site. Pour changer
// la liste : ce fichier, les 5 fichiers de langue (libellé et libellé court),
// et le formulaire .github/ISSUE_TEMPLATE/idee-jeu.yml (mêmes libellés, même
// ordre) ; puis lancer node scripts/controle-taxonomie.mjs.
// ==========================================================================

// 26 genres : « comment on joue ». Affichés en 2 rangées de 13 sur l'accueil.
export const GENRES = [
  { id: 'puzzle',       libelle: 'Puzzle et logique',            court: 'Puzzle',          picto: '🧩', teinte: 190 },
  { id: 'memoire',      libelle: 'Mémoire',                      court: 'Mémoire',         picto: '🧠', teinte: 330 },
  { id: 'quiz',         libelle: 'Quiz et culture',              court: 'Quiz',            picto: '❓', teinte: 255 },
  { id: 'mots',         libelle: 'Mots et lettres',              court: 'Mots',            picto: '🔤', teinte: 155 },
  { id: 'calcul',       libelle: 'Calcul et nombres',            court: 'Calcul',          picto: '🔢', teinte: 210 },
  { id: 'reflexes',     libelle: 'Réflexes et clic rapide',      court: 'Réflexes',        picto: '⚡', teinte: 90 },
  { id: 'arcade',       libelle: 'Arcade',                       court: 'Arcade',          picto: '🕹️', teinte: 250 },
  { id: 'plateforme',   libelle: 'Plateforme',                   court: 'Plateforme',      picto: '🦘', teinte: 25 },
  { id: 'course',       libelle: 'Course',                       court: 'Course',          picto: '🏁', teinte: 5 },
  { id: 'sport',        libelle: 'Sport',                        court: 'Sport',           picto: '⚽', teinte: 120 },
  { id: 'tir',          libelle: 'Tir et visée',                 court: 'Visée',           picto: '🎯', teinte: 350 },
  { id: 'combat',       libelle: 'Combat',                       court: 'Combat',          picto: '🥊', teinte: 0 },
  { id: 'labyrinthe',   libelle: 'Labyrinthe',                   court: 'Labyrinthe',      picto: '🌀', teinte: 280 },
  { id: 'aventure',     libelle: 'Aventure et exploration',      court: 'Aventure',        picto: '🗺️', teinte: 40 },
  { id: 'observation',  libelle: 'Objets cachés et observation', court: 'Objets cachés',   picto: '🔍', teinte: 170 },
  { id: 'strategie',    libelle: 'Stratégie',                    court: 'Stratégie',       picto: '♟️', teinte: 220 },
  { id: 'defense',      libelle: 'Défense de tour',              court: 'Défense',         picto: '🛡️', teinte: 200 },
  { id: 'gestion',      libelle: 'Gestion et tycoon',            court: 'Gestion',         picto: '🏪', teinte: 45 },
  { id: 'simulation',   libelle: 'Simulation et soin',           court: 'Simulation',      picto: '🩹', teinte: 165 },
  { id: 'creation',     libelle: 'Habillage et création',        court: 'Habillage',       picto: '👗', teinte: 300 },
  { id: 'construction', libelle: 'Bac à sable et construction',  court: 'Construction',    picto: '🧱', teinte: 15 },
  { id: 'musique',      libelle: 'Musique et rythme',            court: 'Musique',         picto: '🎵', teinte: 310 },
  { id: 'societe',      libelle: 'Jeux de société et de cartes', court: 'Société',         picto: '🃏', teinte: 340 },
  { id: 'coloriage',    libelle: 'Coloriage et dessin',          court: 'Coloriage',       picto: '🖍️', teinte: 285 },
  { id: 'role',         libelle: 'Jeu de rôle et progression',   court: 'Jeu de rôle',     picto: '🎭', teinte: 265 },
  { id: 'autre',        libelle: 'Autre',                        court: 'Autre',           picto: '🎮', teinte: 230 },
];

// 24 univers : « de quoi ça parle ». Affichés en 2 rangées de 12 sur l'accueil.
export const UNIVERS = [
  { id: 'ferme',        libelle: 'Ferme',                        court: 'Ferme',           picto: '🐄', teinte: 45 },
  { id: 'chevaux',      libelle: 'Chevaux',                      court: 'Chevaux',         picto: '🐴', teinte: 30 },
  { id: 'compagnie',    libelle: 'Animaux de compagnie',         court: 'Compagnons',      picto: '🐶', teinte: 35 },
  { id: 'sauvages',     libelle: 'Animaux sauvages',             court: 'Sauvages',        picto: '🦁', teinte: 50 },
  { id: 'dinosaures',   libelle: 'Dinosaures et préhistoire',    court: 'Dinosaures',      picto: '🦕', teinte: 95 },
  { id: 'ocean',        libelle: 'Océan',                        court: 'Océan',           picto: '🐠', teinte: 195 },
  { id: 'espace',       libelle: 'Espace',                       court: 'Espace',          picto: '🚀', teinte: 240 },
  { id: 'fantasy',      libelle: 'Fantasy et magie',             court: 'Magie',           picto: '🧚', teinte: 290 },
  { id: 'chevaliers',   libelle: 'Chevaliers et Moyen Âge',      court: 'Chevaliers',      picto: '🏰', teinte: 35 },
  { id: 'pirates',      libelle: 'Pirates',                      court: 'Pirates',         picto: '⚓', teinte: 15 },
  { id: 'monstres',     libelle: 'Monstres et créatures',        court: 'Monstres',        picto: '👾', teinte: 275 },
  { id: 'robots',       libelle: 'Robots et futur',              court: 'Robots',          picto: '🤖', teinte: 200 },
  { id: 'nature',       libelle: 'Nature et jardin',             court: 'Nature',          picto: '🌳', teinte: 115 },
  { id: 'cuisine',      libelle: 'Cuisine et nourriture',        court: 'Cuisine',         picto: '🧁', teinte: 335 },
  { id: 'vehicules',    libelle: 'Véhicules',                    court: 'Véhicules',       picto: '🚗', teinte: 355 },
  { id: 'sport',        libelle: 'Sport',                        court: 'Sport',           picto: '🏅', teinte: 120 },
  { id: 'monde',        libelle: 'Monde et pays',                court: 'Monde',           picto: '🌍', teinte: 175 },
  { id: 'histoire',     libelle: 'Histoire',                     court: 'Histoire',        picto: '🏛️', teinte: 35 },
  { id: 'corps',        libelle: 'Corps humain et santé',        court: 'Corps humain',    picto: '🩺', teinte: 0 },
  { id: 'ville',        libelle: 'Ville et métiers',             court: 'Métiers',         picto: '🏙️', teinte: 20 },
  { id: 'fetes',        libelle: 'Saisons et fêtes',             court: 'Fêtes',           picto: '🎄', teinte: 140 },
  { id: 'contes',       libelle: 'Contes et légendes',           court: 'Contes',          picto: '📖', teinte: 300 },
  { id: 'abstrait',     libelle: 'Abstrait',                     court: 'Abstrait',        picto: '🔷', teinte: 260 },
  { id: 'autre',        libelle: 'Autre',                        court: 'Autre',           picto: '✨', teinte: 230 },
];

// Identifiants seuls, pour les contrôles.
export const IDS_GENRES = GENRES.map((g) => g.id);
export const IDS_UNIVERS = UNIVERS.map((u) => u.id);

// Nombre de genres secondaires et d'univers permis pour un jeu.
export const SECONDAIRES_MAX = 2;
export const UNIVERS_MIN = 1;
export const UNIVERS_MAX = 2;

// Tranches d'âge de l'accueil, d'après l'âge minimum conseillé du jeu
// (champ "ages" : « 6+ » → 6), bornes comprises. Noms : « age.<id> » et
// « age.<id>.aide » dans les fichiers de langue.
export const TRANCHES_AGE = [
  { id: '3-4', picto: '🧸', min: 0, max: 4 },
  { id: '5-6', picto: '🪁', min: 5, max: 6 },
  { id: '7-8', picto: '🚲', min: 7, max: 8 },
  { id: '9+',  picto: '🛹', min: 9, max: 99 },
];
