// ==========================================================================
// Free Micro Games — adresses des pages du site dans les 5 langues
//
// Fichier partagé par le navigateur (app.js, play.js) et par les scripts Node
// (build-catalog.mjs, pages-seo.mjs, verifier-seo.mjs) : une seule table.
//
//   page        fr               en               es                pt               de
//   accueil     /                /en/             /es/              /pt/             /de/
//   jeu         /jeux/<id>/      /en/games/<id>/  /es/juegos/<id>/  /pt/jogos/<id>/  /de/spiele/<id>/
//   genre       /genres/<id>/    /en/genres/<id>/ /es/generos/<id>/ /pt/generos/<id>/ /de/spielarten/<id>/
//   univers     /univers/<id>/   /en/worlds/<id>/ /es/mundos/<id>/  /pt/mundos/<id>/  /de/welten/<id>/
//   âge         /ages/<slug>/    /en/ages/<slug>/ /es/edades/<slug>/ /pt/idades/<slug>/ /de/alter/<slug>/
//   lanceur     /play?id=<id>&lang=<langue>  (une seule page, non indexée)
//
// Pages légales, en français et en anglais seulement (les autres langues
// mènent à la version anglaise) :
//   page             fr                         en (et es, pt, de)
//   mentions         /mentions-legales/         /en/legal-notice/
//   confidentialite  /confidentialite/          /en/privacy-policy/
//   conditions       /conditions-utilisation/   /en/terms-of-use/
//   cookies          /cookies/                  /en/cookie-policy/
//
// Le préfixe de famille (genres, univers…) évite les collisions : « sport » et
// « autre » sont à la fois un genre et un univers. Les identifiants (jeux,
// genres, univers) ne changent jamais : une adresse publiée reste valable.
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

// Tranches d'âge (TRANCHES_AGE de taxonomie.js) → morceau d'adresse (« + » est interdit).
export const SLUGS_AGE = { '3-4': '3-4', '5-6': '5-6', '7-8': '7-8', '9+': '9-plus' };

const langueValide = (lang) => (LANGUES.includes(lang) ? lang : 'fr');

/** Accueil d'une langue : « / », « /en/ »… */
export function urlAccueil(lang) {
  return `/${PREFIXE[langueValide(lang)]}`;
}

/** Fiche d'un jeu : « /jeux/<id>/ », « /en/games/<id>/ »… */
export function urlJeu(id, lang) {
  const l = langueValide(lang);
  return `/${PREFIXE[l]}${SEGMENTS.jeu[l]}/${encodeURIComponent(id)}/`;
}

/** Page d'une catégorie : famille « genre », « univers » ou « age » (id de tranche, ex. « 9+ »). */
export function urlCategorie(famille, id, lang) {
  const l = langueValide(lang);
  const segment = SEGMENTS[famille]?.[l];
  if (!segment) throw new Error(`famille de catégorie inconnue : ${famille}`);
  const slug = famille === 'age' ? SLUGS_AGE[id] : id;
  if (!slug) throw new Error(`tranche d'âge inconnue : ${id}`);
  return `/${PREFIXE[l]}${segment}/${encodeURIComponent(slug)}/`;
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

/** Lanceur du jeu (plein écran), dans la langue donnée. */
export function urlLanceur(id, lang) {
  return `/play?id=${encodeURIComponent(id)}&lang=${langueValide(lang)}`;
}
