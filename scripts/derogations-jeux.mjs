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
};

/** Dérogations d'un jeu ({} s'il n'en a pas). */
export function derogation(id) {
  return DEROGATIONS[id] || {};
}

/** Écran de téléphone des essais tactiles : portrait, sauf jeu en paysage. */
export function ecranTelephone(id) {
  return derogation(id).paysage ? { width: 844, height: 390 } : { width: 390, height: 844 };
}
