// ==========================================================================
// derogations-jeux.mjs — dérogations aux consignes accordées à un jeu précis
//
// Une dérogation est une décision écrite du propriétaire du site pour un jeu
// donné (jamais une règle générale). Chaque entrée cite sa source. Les robots
// (scripts/validate-games.mjs, scripts/apercus-jeu.mjs) lisent ce fichier ; les
// autres jeux gardent les règles de CONSIGNES-JEU.md.
//
//   poidsMax     null = pas de limite de poids pour index.html (sinon octets) ;
//   poidsRepere  au-delà, simple avertissement (le poids reste mesuré) ;
//   niveauxMin   nombre minimum de niveaux (« niveaux », window.JEL_NIVEAUX) ;
//   paysage      jeu en paysage : essais tactiles et images de téléphone
//                en 844 × 390 au lieu de 390 × 844 ;
//   province     jeu à plusieurs sans moteur du site (ni jel-multi ni jel-tr) :
//                « Cités voisines », comptoir de province (multijoueur/src/province.js,
//                public/province/lanceur.js) ; game.json : "province": true et "places".
// ==========================================================================

export const DEROGATIONS = {
  // Marmoria (city-builder) : cahier des charges docs/cadrage-marmoria.md, section 19.6,
  // trois dérogations décidées par le propriétaire du site le 24 novembre 2026.
  marmoria: {
    source: 'docs/cadrage-marmoria.md, section 19.6 (décision du 24 novembre 2026)',
    poidsMax: null,
    poidsRepere: 4 * 1024 * 1024,
    niveauxMin: 17,
    paysage: true,
    // Quatrième dérogation (cahier, sections 16.7 et 23.15 ; lot 6 lancé par le propriétaire le
    // 26 novembre 2026) : jeu à plusieurs par le comptoir de province.
    province: true,
  },
  // Cosmoria (colonie spatiale sur le moteur de Marmoria) : docs/cadrage-cosmoria.md, section 5. Le propriétaire a
  // demandé le 27 novembre 2026 « la même chose que Marmoria » dans un univers de science-fiction : le jeu hérite donc
  // des quatre dérogations de son modèle (17 cartes, paysage, poids, « Colonies voisines » par le comptoir de province).
  cosmoria: {
    source: 'docs/cadrage-cosmoria.md, section 5 (demande du propriétaire du 27 novembre 2026 : même principe que Marmoria)',
    poidsMax: null,
    poidsRepere: 4 * 1024 * 1024,
    niveauxMin: 17,
    paysage: true,
    province: true,
  },
  // Les Petits Cuistots (cuisine en 3D pour les petits) : jeu conçu en paysage, pour que la scène et les
  // cibles restent grandes sous le doigt d'un enfant de 4 ans. Décision du propriétaire du site du
  // 27 novembre 2026, à l'ajout du jeu (pull request « Nouveau jeu : Les Petits Cuistots »).
  'les-petits-cuistots': {
    source: 'décision du propriétaire du 27 novembre 2026 (ajout du jeu, compétence ajouter-jeu-site, étape 4)',
    paysage: true,
  },
};

/** Dérogations d'un jeu ({} s'il n'en a pas). */
export function derogation(id) {
  return DEROGATIONS[id] || {};
}

/** Écran de téléphone des essais tactiles : portrait, sauf jeu en paysage. */
export function ecranTelephone(id) {
  return derogation(id).paysage ? { width: 844, height: 390 } : { width: 390, height: 844 };
}
