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
// "univers" (1 ou 2). « autre » seulement si rien ne correspond : c'est une
// valeur de repli, jamais affichée (ni puce, ni page de catégorie).
//
// Affichage : une ligne de genres et une ligne d'univers sur l'accueil, triées
// par nombre de jeux du catalogue entier (ordreAffichage, ci-dessous) ; l'ordre
// des listes ne sert qu'à départager les égalités, et aux formulaires.
//
// Interdit de créer un genre ou un univers depuis un jeu ou une idée : la
// liste ne change que par une décision du propriétaire du site. Pour changer
// la liste :
//   1. ce fichier (et ANCIENS_IDS pour un identifiant retiré ou regroupé) ;
//   2. les 5 fichiers de langue (libellé et libellé court) ;
//   3. les textes des pages de catégories, gabarits/textes/categories.<langue>.json ;
//   4. les icônes, scripts/icones/sources/ (puis node scripts/icones/generer.mjs) ;
//   5. le formulaire .github/ISSUE_TEMPLATE/idee-jeu.yml (mêmes libellés, même ordre) ;
//   6. reclasser games/*/game.json, idees.json et idees-archive.json ;
// puis lancer node scripts/controle-taxonomie.mjs et npm run seo.
// ==========================================================================

// Valeur de repli des deux listes : jamais affichée.
export const ID_AUTRE = 'autre';

// 13 genres (+ « autre ») : « comment on joue ». Une ligne sur l'accueil.
export const GENRES = [
  { id: 'puzzle',       libelle: 'Puzzle, logique et labyrinthes',       court: 'Puzzle',      picto: '🧩', teinte: 200 },
  { id: 'memoire',      libelle: 'Mémoire et observation',               court: 'Mémoire',     picto: '🧠', teinte: 228 },
  { id: 'quiz',         libelle: 'Quiz et culture',                      court: 'Quiz',        picto: '❓', teinte: 256 },
  { id: 'mots',         libelle: 'Mots et lettres',                      court: 'Mots',        picto: '🔤', teinte: 284 },
  { id: 'calcul',       libelle: 'Calcul et nombres',                    court: 'Calcul',      picto: '🔢', teinte: 312 },
  { id: 'arcade',       libelle: 'Arcade et réflexes',                   court: 'Arcade',      picto: '🕹️', teinte: 40 },
  { id: 'plateforme',   libelle: 'Plateforme',                           court: 'Plateforme',  picto: '🦘', teinte: 66 },
  { id: 'course',       libelle: 'Course',                               court: 'Course',      picto: '🏁', teinte: 12 },
  { id: 'aventure',     libelle: 'Aventure et jeu de rôle',              court: 'Aventure',    picto: '🗺️', teinte: 146 },
  { id: 'strategie',    libelle: 'Stratégie, défense et jeux de société', court: 'Stratégie',  picto: '♟️', teinte: 118 },
  { id: 'simulation',   libelle: 'Simulation, soin et gestion',          court: 'Simulation',  picto: '🩹', teinte: 174 },
  { id: 'creation',     libelle: 'Habillage, dessin et construction',    court: 'Création',    picto: '👗', teinte: 338 },
  { id: 'musique',      libelle: 'Musique et rythme',                    court: 'Musique',     picto: '🎵', teinte: 92 },
  { id: 'autre',        libelle: 'Autre',                                court: 'Autre',       picto: '🎮', teinte: 230 },
];

// 12 univers (+ « autre ») : « de quoi ça parle ». Une ligne sur l'accueil.
// Libellés sans virgule ni point-virgule : le formulaire d'idées joint les
// univers cochés par des virgules (scripts/idees.mjs les sépare ainsi).
export const UNIVERS = [
  { id: 'animaux',      libelle: 'Animaux',                    court: 'Animaux',     picto: '🐾', teinte: 100 },
  { id: 'chevaux',      libelle: 'Chevaux',                    court: 'Chevaux',     picto: '🐴', teinte: 70 },
  { id: 'dinosaures',   libelle: 'Dinosaures et préhistoire',  court: 'Dinosaures',  picto: '🦕', teinte: 130 },
  { id: 'ocean',        libelle: 'Océan et pirates',           court: 'Océan',       picto: '🐠', teinte: 220 },
  { id: 'nature',       libelle: 'Nature et saisons',          court: 'Nature',      picto: '🌳', teinte: 160 },
  { id: 'fantasy',      libelle: 'Magie et monstres',          court: 'Magie',       picto: '🧚', teinte: 310 },
  { id: 'espace',       libelle: 'Espace et robots',           court: 'Espace',      picto: '🚀', teinte: 280 },
  { id: 'monde',        libelle: 'Monde et histoire',          court: 'Monde',       picto: '🌍', teinte: 250 },
  { id: 'ville',        libelle: 'Ville et métiers',           court: 'Métiers',     picto: '🏙️', teinte: 340 },
  { id: 'vehicules',    libelle: 'Véhicules',                  court: 'Véhicules',   picto: '🚗', teinte: 40 },
  { id: 'sport',        libelle: 'Sport',                      court: 'Sport',       picto: '🏅', teinte: 190 },
  { id: 'cuisine',      libelle: 'Cuisine et nourriture',      court: 'Cuisine',     picto: '🧁', teinte: 10 },
  { id: 'autre',        libelle: 'Autre',                      court: 'Autre',       picto: '✨', teinte: 230 },
];

// Identifiants retirés (regroupement d'octobre 2026) → identifiant qui les a
// remplacés. Sert aux redirections des anciennes pages de catégorie
// (public/_redirects, écrit par scripts/pages-seo.mjs) et à reclasser une
// donnée restée sur un ancien identifiant. Un ancien identifiant n'est jamais
// accepté dans game.json ni dans idees.json.
export const ANCIENS_IDS = {
  genre: {
    reflexes: 'arcade', tir: 'arcade', labyrinthe: 'puzzle', observation: 'memoire', sport: 'course',
    combat: 'aventure', role: 'aventure', defense: 'strategie', societe: 'strategie',
    gestion: 'simulation', construction: 'creation', coloriage: 'creation',
  },
  univers: {
    ferme: 'animaux', sauvages: 'animaux', compagnie: 'animaux', monstres: 'fantasy', contes: 'fantasy',
    robots: 'espace', pirates: 'ocean', histoire: 'monde', chevaliers: 'monde', corps: 'ville',
    fetes: 'nature', abstrait: 'autre',
  },
};

// Identifiants seuls, pour les contrôles.
export const IDS_GENRES = GENRES.map((g) => g.id);
export const IDS_UNIVERS = UNIVERS.map((u) => u.id);

// Ordre d'affichage des genres ou des univers (accueil, pages générées) : du plus
// grand nombre de jeux au plus petit, à égalité dans l'ordre de la liste ; sans
// « autre ». nombre(id) : nombre de jeux du catalogue entier (pas selon les
// filtres choisis : les puces ne bougent pas quand on clique).
export function ordreAffichage(liste, nombre) {
  return liste
    .filter((x) => x.id !== ID_AUTRE)
    .map((x, rang) => ({ x, rang, n: nombre(x.id) }))
    .sort((a, b) => b.n - a.n || a.rang - b.rang)
    .map(({ x }) => x);
}

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

// Tranche d'un jeu d'après son champ "ages" (« 6+ » → « 5-6 ») ; âge illisible → null.
// Partagée par l'accueil (app.js) et les pages générées (scripts/pages-seo.mjs).
export function trancheDeAge(ages) {
  const age = parseInt(ages, 10);
  if (Number.isNaN(age)) return null;
  return TRANCHES_AGE.find((t) => age >= t.min && age <= t.max)?.id ?? null;
}
