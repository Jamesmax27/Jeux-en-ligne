// ==========================================================================
// Free Micro Games — adresses des pages du site dans les 5 langues
//
// Fichier partagé par le navigateur (app.js, play.js) et par les scripts Node
// (build-catalog.mjs, pages-seo.mjs, verifier-seo.mjs) : une seule table.
//
//   page        fr               en                 es                  pt                 de
//   accueil     /                /en/               /es/                /pt/               /de/
//   jeu         /jeux/<id>/      /en/games/<slug>/  /es/juegos/<slug>/  /pt/jogos/<slug>/  /de/spiele/<slug>/
//   genre       /genres/<id>/    /en/genres/<slug>/ /es/generos/<slug>/ /pt/generos/<slug>/ /de/spielarten/<slug>/
//   univers     /univers/<id>/   /en/worlds/<slug>/ /es/mundos/<slug>/  /pt/mundos/<slug>/  /de/welten/<slug>/
//   âge         /ages/<slug>/    /en/ages/<slug>/   /es/edades/<slug>/  /pt/idades/<slug>/  /de/alter/<slug>/
//   Slugs traduits (novembre 2026) : d'un jeu, "slugs" de son game.json (recopié
//   dans catalog.json ; scripts/slugs-jeux.mjs) ; d'une catégorie, SLUGS_CATEGORIES
//   ci-dessous. En français, le slug est l'identifiant. Les anciennes adresses
//   (identifiant français dans les autres langues) mènent en 301 aux nouvelles
//   (_redirects, écrit par scripts/pages-seo.mjs).
//   lanceur     /play?id=<id>&lang=<langue>  (une seule page, non indexée)
//   proposer    /proposer/       /en/suggest/     /es/proponer/     /pt/sugerir/     /de/vorschlagen/
//               (formulaire public de demandes, non indexé ; ?jeu=<id> choisit le jeu)
//   profil      /profil/         /en/profile/     /es/perfil/       /pt/perfil/      /de/profil/
//   classement  /classement/     /en/leaderboard/ /es/clasificacion/ /pt/classificacao/ /de/rangliste/
//               (profil joueur et classement, non indexés : docs/cadrage-fidelisation.md)
//   amis        /amis/           /en/friends/     /es/amigos/       /pt/amigos/      /de/freunde/
//               (amis et présence, non indexée : docs/consigne-amis.md)
//
// Pages légales, en français et en anglais seulement (les autres langues
// mènent à la version anglaise) :
//   page             fr                         en (et es, pt, de)
//   mentions         /mentions-legales/         /en/legal-notice/
//   confidentialite  /confidentialite/          /en/privacy-policy/
//   conditions       /conditions-utilisation/   /en/terms-of-use/
//   cookies          /cookies/                  /en/cookie-policy/
//
// Le préfixe de famille (genres, univers…) évite les collisions entre un genre
// et un univers de même identifiant. Les identifiants (jeux, genres, univers) et
// les slugs ne changent pas : une adresse publiée reste valable ; celle d'un genre ou d'un
// univers retiré mène en 301 à la catégorie qui l'a remplacé (ANCIENS_IDS de
// taxonomie.js, fichier _redirects écrit par scripts/pages-seo.mjs), comme
// celle d'une tranche d'âge retirée (ANCIENNES_TRANCHES).
// Toutes les adresses partent de la racine du site et finissent par « / »
// (forme servie par Cloudflare Pages sans redirection).
// ==========================================================================

export const LANGUES = ['fr', 'en', 'es', 'pt', 'de'];

// Code hreflang et <html lang> de chaque langue (portugais du Brésil).
export const HREFLANG = { fr: 'fr', en: 'en', es: 'es', pt: 'pt-BR', de: 'de' };

// Code og:locale (Open Graph) de chaque langue.
export const LOCALE_OG = { fr: 'fr_FR', en: 'en_US', es: 'es_ES', pt: 'pt_BR', de: 'de_DE' };

const PREFIXE = { fr: '', en: 'en/', es: 'es/', pt: 'pt/', de: 'de/' };

const SEGMENTS = {
  jeu: { fr: 'jeux', en: 'games', es: 'juegos', pt: 'jogos', de: 'spiele' },
  // Mêmes mots que le site (groupe.genres, groupe.univers dans i18n/site/*.json).
  genre: { fr: 'genres', en: 'genres', es: 'generos', pt: 'generos', de: 'spielarten' },
  univers: { fr: 'univers', en: 'worlds', es: 'mundos', pt: 'mundos', de: 'welten' },
  age: { fr: 'ages', en: 'ages', es: 'edades', pt: 'idades', de: 'alter' },
};

// Formulaire public de demandes (proposer un jeu, signaler un bug, demander une modification).
const SEGMENTS_PROPOSER = { fr: 'proposer', en: 'suggest', es: 'proponer', pt: 'sugerir', de: 'vorschlagen' };

// Profil joueur et classement (pages non indexées).
const SEGMENTS_PROFIL = { fr: 'profil', en: 'profile', es: 'perfil', pt: 'perfil', de: 'profil' };
const SEGMENTS_CLASSEMENT = { fr: 'classement', en: 'leaderboard', es: 'clasificacion', pt: 'classificacao', de: 'rangliste' };
const SEGMENTS_AMIS = { fr: 'amis', en: 'friends', es: 'amigos', pt: 'amigos', de: 'freunde' };

// Tranches d'âge (TRANCHES_AGE de taxonomie.js) → morceau d'adresse (« + » est interdit).
// Les tranches retirées (ANCIENNES_TRANCHES) gardent le leur : leurs anciennes
// adresses mènent en 301 à la nouvelle tranche (_redirects).
export const SLUGS_AGE = {
  '4-6': '4-6', '7-9': '7-9', '10-12': '10-12', '13+': '13-plus',
  '3-4': '3-4', '5-6': '5-6', '7-8': '7-8', '9+': '9-plus',
};

// Slugs traduits des catégories (en, es, pt, de) ; en français, et pour une
// langue absente d'ici : l'identifiant (genres, univers) ou SLUGS_AGE (âges).
// Ne jamais changer un slug publié (son adresse est dans les moteurs de
// recherche) ; un genre ou un univers ajouté reçoit les siens ici.
export const SLUGS_CATEGORIES = {
  genre: {
    arcade: { en: 'arcade', es: 'arcade', pt: 'arcade', de: 'arcade' },
    puzzle: { en: 'puzzle', es: 'puzles', pt: 'logica', de: 'logik' },
    memoire: { en: 'memory', es: 'memoria', pt: 'memoria', de: 'gedaechtnis' },
    quiz: { en: 'quiz', es: 'preguntas', pt: 'quiz', de: 'quiz' },
    mots: { en: 'words', es: 'palabras', pt: 'palavras', de: 'woerter' },
    calcul: { en: 'math', es: 'calculo', pt: 'matematica', de: 'rechnen' },
    plateforme: { en: 'platformer', es: 'plataformas', pt: 'plataforma', de: 'jump-and-run' },
    course: { en: 'racing', es: 'carreras', pt: 'corrida', de: 'rennen' },
    aventure: { en: 'adventure', es: 'aventura', pt: 'aventura', de: 'abenteuer' },
    strategie: { en: 'strategy', es: 'estrategia', pt: 'estrategia', de: 'strategie' },
    simulation: { en: 'simulation', es: 'simulacion', pt: 'simulacao', de: 'simulation' },
    creation: { en: 'creative', es: 'creatividad', pt: 'criatividade', de: 'kreativ' },
    musique: { en: 'music', es: 'musica', pt: 'musica', de: 'musik' },
  },
  univers: {
    animaux: { en: 'animals', es: 'animales', pt: 'animais', de: 'tiere' },
    chevaux: { en: 'horses', es: 'caballos', pt: 'cavalos', de: 'pferde' },
    dinosaures: { en: 'dinosaurs', es: 'dinosaurios', pt: 'dinossauros', de: 'dinosaurier' },
    ocean: { en: 'ocean', es: 'oceano', pt: 'oceano', de: 'ozean' },
    nature: { en: 'nature', es: 'naturaleza', pt: 'natureza', de: 'natur' },
    fantasy: { en: 'magic', es: 'magia', pt: 'magia', de: 'magie' },
    espace: { en: 'space', es: 'espacio', pt: 'espaco', de: 'weltall' },
    monde: { en: 'world', es: 'mundo', pt: 'mundo', de: 'welt' },
    ville: { en: 'jobs', es: 'oficios', pt: 'profissoes', de: 'berufe' },
    vehicules: { en: 'vehicles', es: 'vehiculos', pt: 'veiculos', de: 'fahrzeuge' },
    sport: { en: 'sports', es: 'deportes', pt: 'esportes', de: 'sport' },
    cuisine: { en: 'cooking', es: 'cocina', pt: 'cozinha', de: 'kochen' },
  },
  age: {
    '13+': { es: '13-mas', pt: '13-mais', de: 'ab-13' },
  },
};

// Morceau d'adresse d'un jeu : minuscules sans accents, chiffres et tirets.
const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const langueValide = (lang) => (LANGUES.includes(lang) ? lang : 'fr');

/** Accueil d'une langue : « / », « /en/ »… */
export function urlAccueil(lang) {
  return `/${PREFIXE[langueValide(lang)]}`;
}

/**
 * Slug de la fiche d'un jeu dans une langue. jeu : entrée du catalogue ou
 * game.json ({ id, slugs }) ; un identifiant seul donne l'identifiant (adresse
 * française, ou ancienne adresse des autres langues).
 */
export function slugJeu(jeu, lang) {
  const l = langueValide(lang);
  if (typeof jeu === 'string') return jeu;
  const s = l === 'fr' ? null : jeu?.slugs?.[l];
  return typeof s === 'string' && RE_SLUG.test(s) ? s : jeu?.id;
}

/** Fiche d'un jeu : « /jeux/<id>/ », « /en/games/<slug>/ »… (jeu : entrée du catalogue, voir slugJeu). */
export function urlJeu(jeu, lang) {
  const l = langueValide(lang);
  return `/${PREFIXE[l]}${SEGMENTS.jeu[l]}/${encodeURIComponent(slugJeu(jeu, l))}/`;
}

/**
 * Page d'une catégorie : famille « genre », « univers » ou « age » (id de tranche, ex. « 13+ »).
 * ancienne : adresse d'avant les slugs traduits (identifiant ou SLUGS_AGE dans
 * toutes les langues), pour les redirections.
 */
export function urlCategorie(famille, id, lang, { ancienne = false } = {}) {
  const l = langueValide(lang);
  const segment = SEGMENTS[famille]?.[l];
  if (!segment) throw new Error(`famille de catégorie inconnue : ${famille}`);
  const base = famille === 'age' ? SLUGS_AGE[id] : id;
  if (!base) throw new Error(`tranche d'âge inconnue : ${id}`);
  const slug = (!ancienne && l !== 'fr' && SLUGS_CATEGORIES[famille]?.[id]?.[l]) || base;
  return `/${PREFIXE[l]}${segment}/${encodeURIComponent(slug)}/`;
}

// Pages école (classes de CLASSES, public/taxonomie.js) : français, anglais
// (Grade 1 à 5) et allemand (Klasse 1 à 4) seulement.
//   fr /ecole/ce1/   en /en/school/2nd-grade/   de /de/schule/klasse-2/
const SEGMENTS_ECOLE = { fr: 'ecole', en: 'school', de: 'schule' };
export const SLUGS_ECOLE = {
  fr: { cp: 'cp', ce1: 'ce1', ce2: 'ce2', cm1: 'cm1', cm2: 'cm2' },
  en: { cp: '1st-grade', ce1: '2nd-grade', ce2: '3rd-grade', cm1: '4th-grade', cm2: '5th-grade' },
  de: { cp: 'klasse-1', ce1: 'klasse-2', ce2: 'klasse-3', cm1: 'klasse-4' },
};

/** Page école d'une classe (« ce1 »…) dans une langue, ou null si la langue n'en a pas. */
export function urlEcole(classe, lang) {
  const l = langueValide(lang);
  const slug = SLUGS_ECOLE[l]?.[classe];
  return slug ? `/${PREFIXE[l]}${SEGMENTS_ECOLE[l]}/${slug}/` : null;
}

// Pages légales : langues disponibles, pages (ordre du pied de page) et adresses.
export const LANGUES_LEGALES = ['fr', 'en'];
export const PAGES_LEGALES = ['mentions', 'confidentialite', 'conditions', 'cookies'];
const SEGMENTS_LEGAUX = {
  mentions: { fr: 'mentions-legales', en: 'legal-notice' },
  confidentialite: { fr: 'confidentialite', en: 'privacy-policy' },
  conditions: { fr: 'conditions-utilisation', en: 'terms-of-use' },
  cookies: { fr: 'cookies', en: 'cookie-policy' },
};

/** Langue dans laquelle une page légale est lue : le français, sinon l'anglais. */
export const langueLegale = (lang) => (lang === 'fr' ? 'fr' : 'en');

/** Page légale (« mentions », « confidentialite », « conditions », « cookies ») : « /cookies/ », « /en/cookie-policy/ »… */
export function urlLegale(page, lang) {
  const l = langueLegale(lang);
  const segment = SEGMENTS_LEGAUX[page]?.[l];
  if (!segment) throw new Error(`page légale inconnue : ${page}`);
  return `/${PREFIXE[l]}${segment}/`;
}

/** Formulaire public de demandes : « /proposer/ », « /en/suggest/ »… ; avec un jeu : « /proposer/?jeu=<id> ». */
export function urlProposer(lang, idJeu) {
  const l = langueValide(lang);
  return `/${PREFIXE[l]}${SEGMENTS_PROPOSER[l]}/${idJeu ? `?jeu=${encodeURIComponent(idJeu)}` : ''}`;
}

/** Page de profil du joueur : « /profil/ », « /en/profile/ »… */
export function urlProfil(lang) {
  const l = langueValide(lang);
  return `/${PREFIXE[l]}${SEGMENTS_PROFIL[l]}/`;
}

/** Classement des joueurs : « /classement/ », « /en/leaderboard/ »… */
export function urlClassement(lang) {
  const l = langueValide(lang);
  return `/${PREFIXE[l]}${SEGMENTS_CLASSEMENT[l]}/`;
}

/** Page des amis : « /amis/ », « /en/friends/ »… */
export function urlAmis(lang) {
  const l = langueValide(lang);
  return `/${PREFIXE[l]}${SEGMENTS_AMIS[l]}/`;
}

/** Lanceur du jeu (plein écran), dans la langue donnée. */
export function urlLanceur(id, lang) {
  return `/play?id=${encodeURIComponent(id)}&lang=${langueValide(lang)}`;
}
