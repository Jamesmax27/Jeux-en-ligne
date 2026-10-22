// ==========================================================================
// Jeux-en-ligne — regroupements du catalogue (tuiles de la page d'accueil)
//
// - GENRES_AFFICHAGE : pictogramme et teinte de chaque genre. La liste des
//   genres elle-même est fermée : scripts/genres.mjs (reprise dans
//   catalog.json) et CONSIGNES-JEU.md.
// - UNIVERS : grands thèmes, chacun réunissant plusieurs « tags » de
//   game.json (et le genre). Un jeu peut appartenir à plusieurs univers.
//   Un univers encore vide s'affiche quand même, grisé (« Bientôt »).
// - TRANCHES_AGE : d'après l'âge minimum conseillé (champ "ages").
//
// Les teintes (0 à 360) colorent légèrement le fond des tuiles.
// Les noms affichés sont dans les fichiers de langue public/i18n/site/*.json :
// « genre.<genre> », « univers.<id> », « age.<id> » et « age.<id>.aide »,
// « tag.<tag> » (vérifié par scripts/check-i18n.js).
// Pour ajouter un univers : une ligne ici, son nom dans les 5 fichiers de
// langue, et ses tags dans CONSIGNES-JEU.md.
// ==========================================================================

export const GENRES_AFFICHAGE = {
  'adresse':     { picto: '🎯', teinte: 350 },
  'action':      { picto: '⚡', teinte: 90 },
  'plateforme':  { picto: '🦘', teinte: 25 },
  'course':      { picto: '🏁', teinte: 5 },
  'sport':       { picto: '⚽', teinte: 120 },
  'rythme':      { picto: '🥁', teinte: 300 },
  'aventure':    { picto: '🗺️', teinte: 40 },
  'réflexion':   { picto: '🧠', teinte: 270 },
  'stratégie':   { picto: '♟️', teinte: 220 },
  'puzzle':      { picto: '🧩', teinte: 190 },
  'mémoire':     { picto: '🃏', teinte: 330 },
  'observation': { picto: '🔍', teinte: 170 },
  'quiz':        { picto: '❓', teinte: 255 },
  'calcul':      { picto: '🔢', teinte: 210 },
  'lecture':     { picto: '📖', teinte: 155 },
  'création':    { picto: '🎨', teinte: 285 },
  'simulation':  { picto: '🏡', teinte: 60 },
};

export const UNIVERS = [
  { id: 'chevaux',      picto: '🐴', teinte: 30,  tags: ['chevaux', 'cheval', 'poney', 'poneys', 'équitation'] },
  { id: 'animaux',      picto: '🐾', teinte: 45,  tags: ['animaux', 'chevaux', 'oiseau', 'oiseaux', 'ferme', 'chien', 'chiens', 'chat', 'chats', 'insectes'] },
  { id: 'sports',       picto: '🥋', teinte: 0,   tags: ['judo', 'sport', 'sports', 'football', 'natation', 'ski'] },
  { id: 'nature',       picto: '🌳', teinte: 115, tags: ['nature', 'forêt', 'plantes', 'fleurs', 'jardin', 'arbres'] },
  { id: 'mer',          picto: '🐠', teinte: 195, tags: ['mer', 'océan', 'océans', 'poissons', 'plage', 'bateaux'] },
  { id: 'espace',       picto: '🚀', teinte: 240, tags: ['espace', 'planètes', 'étoiles', 'astronomie', 'fusées'] },
  { id: 'monde',        picto: '🌍', teinte: 175, tags: ['géographie', 'pays', 'drapeaux', 'cartes', 'voyage'] },
  { id: 'apprendre',    picto: '🎒', teinte: 210, tags: ['lecture', 'calcul', 'lettres', 'mots', 'alphabet', 'nombres', 'maths', 'tables', 'orthographe', 'anglais', 'heure'] },
  { id: 'sciences',     picto: '🔬', teinte: 160, tags: ['sciences', 'corps', 'météo', 'expériences', 'énergie'] },
  { id: 'formes',       picto: '🔷', teinte: 260, tags: ['formes', 'couleurs', 'logique', 'motifs', 'suites'] },
  { id: 'construction', picto: '🧱', teinte: 15,  tags: ['cubes', 'construction', 'blocs', 'survie', 'bâtiments'] },
  { id: 'labyrinthes',  picto: '🌀', teinte: 280, tags: ['labyrinthe', 'labyrinthes', 'chemins'] },
  { id: 'musique',      picto: '🎵', teinte: 310, tags: ['musique', 'sons', 'chansons', 'instruments', 'notes'] },
  { id: 'vehicules',    picto: '🚗', teinte: 355, tags: ['véhicules', 'voitures', 'trains', 'avions', 'camions', 'tracteurs'] },
  { id: 'dinosaures',   picto: '🦕', teinte: 95,  tags: ['dinosaures', 'préhistoire', 'fossiles'] },
  { id: 'magie',        picto: '🧚', teinte: 290, tags: ['magie', 'fantastique', 'contes', 'fées', 'dragons', 'licornes', 'sorcières', 'chevaliers', 'princesses'] },
  { id: 'cuisine',      picto: '🧁', teinte: 335, tags: ['cuisine', 'gâteaux', 'fruits', 'légumes', 'pâtisserie', 'recettes'] },
  { id: 'histoire',     picto: '🏰', teinte: 35,  tags: ['histoire', 'châteaux', 'égypte', 'pirates', 'romains'] },
  { id: 'metiers',      picto: '🧑‍🚒', teinte: 20,  tags: ['métiers', 'pompiers', 'docteur', 'vétérinaire', 'magasin'] },
  { id: 'fetes',        picto: '🎄', teinte: 140, tags: ['fêtes', 'noël', 'halloween', 'pâques', 'anniversaire', 'saisons', 'hiver', 'été'] },
  { id: 'arcade',       picto: '👾', teinte: 250, tags: ['retro', 'rétro', 'arcade', 'pixel', 'pixels'] },
];

// min / max : âge minimum conseillé du jeu (« 6+ » → 6), bornes comprises.
export const TRANCHES_AGE = [
  { id: '3-4', picto: '🧸', min: 0, max: 4 },
  { id: '5-6', picto: '🪁', min: 5, max: 6 },
  { id: '7-8', picto: '🚲', min: 7, max: 8 },
  { id: '9+',  picto: '🛹', min: 9, max: 99 },
];
