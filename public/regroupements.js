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
// Pour ajouter un univers : une ligne ici, et ses tags dans CONSIGNES-JEU.md.
// ==========================================================================

export const GENRES_AFFICHAGE = {
  'adresse':     { picto: '🎯', teinte: 350 },
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
  { id: 'chevaux',      nom: 'Chevaux',            picto: '🐴', teinte: 30,  tags: ['chevaux', 'cheval', 'poney', 'poneys', 'équitation'] },
  { id: 'animaux',      nom: 'Animaux',            picto: '🐾', teinte: 45,  tags: ['animaux', 'chevaux', 'oiseau', 'oiseaux', 'ferme', 'chien', 'chiens', 'chat', 'chats', 'insectes'] },
  { id: 'sports',       nom: 'Judo et sports',     picto: '🥋', teinte: 0,   tags: ['judo', 'sport', 'sports', 'football', 'natation', 'ski'] },
  { id: 'nature',       nom: 'Nature',             picto: '🌳', teinte: 115, tags: ['nature', 'forêt', 'plantes', 'fleurs', 'jardin', 'arbres'] },
  { id: 'mer',          nom: 'Mer et océans',      picto: '🐠', teinte: 195, tags: ['mer', 'océan', 'océans', 'poissons', 'plage', 'bateaux'] },
  { id: 'espace',       nom: 'Espace',             picto: '🚀', teinte: 240, tags: ['espace', 'planètes', 'étoiles', 'astronomie', 'fusées'] },
  { id: 'monde',        nom: 'Pays du monde',      picto: '🌍', teinte: 175, tags: ['géographie', 'pays', 'drapeaux', 'cartes', 'voyage'] },
  { id: 'apprendre',    nom: 'Apprendre',          picto: '🎒', teinte: 210, tags: ['lecture', 'calcul', 'lettres', 'mots', 'alphabet', 'nombres', 'maths', 'tables', 'orthographe', 'anglais', 'heure'] },
  { id: 'sciences',     nom: 'Sciences',           picto: '🔬', teinte: 160, tags: ['sciences', 'corps', 'météo', 'expériences', 'énergie'] },
  { id: 'formes',       nom: 'Formes et couleurs', picto: '🔷', teinte: 260, tags: ['formes', 'couleurs', 'logique', 'motifs', 'suites'] },
  { id: 'construction', nom: 'Construire',         picto: '🧱', teinte: 15,  tags: ['cubes', 'construction', 'blocs', 'survie', 'bâtiments'] },
  { id: 'labyrinthes',  nom: 'Labyrinthes',        picto: '🌀', teinte: 280, tags: ['labyrinthe', 'labyrinthes', 'chemins'] },
  { id: 'musique',      nom: 'Musique',            picto: '🎵', teinte: 310, tags: ['musique', 'sons', 'chansons', 'instruments', 'notes'] },
  { id: 'vehicules',    nom: 'Véhicules',          picto: '🚗', teinte: 355, tags: ['véhicules', 'voitures', 'trains', 'avions', 'camions', 'tracteurs'] },
  { id: 'dinosaures',   nom: 'Dinosaures',         picto: '🦕', teinte: 95,  tags: ['dinosaures', 'préhistoire', 'fossiles'] },
  { id: 'magie',        nom: 'Magie et contes',    picto: '🧚', teinte: 290, tags: ['magie', 'fantastique', 'contes', 'fées', 'dragons', 'licornes', 'sorcières', 'chevaliers', 'princesses'] },
  { id: 'cuisine',      nom: 'Cuisine',            picto: '🧁', teinte: 335, tags: ['cuisine', 'gâteaux', 'fruits', 'légumes', 'pâtisserie', 'recettes'] },
  { id: 'histoire',     nom: 'Histoire',           picto: '🏰', teinte: 35,  tags: ['histoire', 'châteaux', 'égypte', 'pirates', 'romains'] },
  { id: 'metiers',      nom: 'Métiers',            picto: '🧑‍🚒', teinte: 20,  tags: ['métiers', 'pompiers', 'docteur', 'vétérinaire', 'magasin'] },
  { id: 'fetes',        nom: 'Fêtes et saisons',   picto: '🎄', teinte: 140, tags: ['fêtes', 'noël', 'halloween', 'pâques', 'anniversaire', 'saisons', 'hiver', 'été'] },
  { id: 'arcade',       nom: 'Arcade rétro',       picto: '👾', teinte: 250, tags: ['retro', 'rétro', 'arcade', 'pixel', 'pixels'] },
];

// min / max : âge minimum conseillé du jeu (« 6+ » → 6), bornes comprises.
export const TRANCHES_AGE = [
  { id: '3-4', nom: '3-4 ans',    picto: '🧸', min: 0, max: 4,  aide: 'Jeux conseillés dès 3 ou 4 ans' },
  { id: '5-6', nom: '5-6 ans',    picto: '🪁', min: 5, max: 6,  aide: 'Jeux conseillés dès 5 ou 6 ans' },
  { id: '7-8', nom: '7-8 ans',    picto: '🚲', min: 7, max: 8,  aide: 'Jeux conseillés dès 7 ou 8 ans' },
  { id: '9+',  nom: '9 ans et +', picto: '🛹', min: 9, max: 99, aide: 'Jeux conseillés dès 9 ans' },
];
