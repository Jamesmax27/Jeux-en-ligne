// ==========================================================================
// Jeux-en-ligne — langue du site (partagé par le catalogue et le lanceur)
//
// S'appuie sur le module commun i18n/i18n.js (window.JEL_I18N), chargé par
// une balise <script> avant ce module. Textes : i18n/site/<langue>.json.
// - demarrerLangue() : charge les textes, crée le sélecteur de l'en-tête.
// - majSeo() : <title> et meta description des pages traduites en JavaScript.
// - accueils pré-rendus (data-prerendu) : changer de langue mène à la page de
//   cette langue (/en/…), au lieu de traduire sur place.
// - nomGenre(), nomUnivers(), titreJeu(), descriptionJeu() : noms affichés ;
//   les identifiants internes (genres, univers, id des jeux) ne changent jamais.
// ==========================================================================

const I = window.JEL_I18N;

export const t = (cle, variables) => I.t(cle, variables);
export const getLang = () => I.getLang();
export const LANGUES = I.LANGUES;

// Page pré-rendue dans une langue (accueils /, /en/… générés par
// scripts/pages-seo.mjs : <html data-prerendu="<code hreflang>">) : son titre, sa
// description, sa canonical et ses hreflang sont écrits dans le HTML ; changer
// de langue mène à la page de l'autre langue (lien <link rel="alternate" hreflang>).
const PRERENDU = document.documentElement.hasAttribute('data-prerendu');
const LANG_HTML = document.documentElement.dataset.prerendu;   // ex. « pt-BR » (i18n.js écrit « pt » dans lang)

function pageDeLangue(lang) {
  const lien = [...document.querySelectorAll('link[rel="alternate"][hreflang]')]
    .find((l) => l.hreflang.toLowerCase().split('-')[0] === lang);
  return lien ? lien.href : null;
}

/** Charge les textes du site puis place le sélecteur de langue dans « conteneur ». */
export async function demarrerLangue(conteneur) {
  await I.charger('/i18n/site/');
  if (PRERENDU) {
    if (LANG_HTML) document.documentElement.lang = LANG_HTML;
    // Le lien hreflang est absolu (adresse publique du site) : on n'en garde que le
    // chemin, pour rester sur le site consulté (serveur local, préversion…).
    I.surChangement((lang) => {
      const adresse = pageDeLangue(lang);
      const chemin = adresse && new URL(adresse).pathname;
      if (chemin && chemin !== location.pathname) location.assign(chemin);
    });
  }
  // Page pré-rendue : ses liens de langue sont déjà dans le HTML (details.langues).
  if (conteneur && !conteneur.querySelector('.langues')) I.creerSelecteur({ conteneur, classe: 'selecteur-site' });
}

/** Appelle f(lang) après chaque changement de langue. */
export function surChangementLangue(f) {
  I.surChangement(f);
}

function majuscule(mot) {
  const texte = String(mot ?? '');
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

// Libellé complet (« genre.<id> ») ou court (« genre.<id>.court ») ; à défaut, l'identifiant.
function nomTaxonomie(famille, id, court) {
  const cle = `${famille}.${id}`;
  if (court && I.has(`${cle}.court`)) return t(`${cle}.court`);
  return I.has(cle) ? t(cle) : majuscule(id);
}

/** Nom affiché d'un genre (public/taxonomie.js) ; court = libellé des puces et des cartes. */
export const nomGenre = (id, court = false) => nomTaxonomie('genre', id, court);

/** Nom affiché d'un univers (public/taxonomie.js) ; court = libellé des puces et des cartes. */
export const nomUnivers = (id, court = false) => nomTaxonomie('univers', id, court);

/** Traduction d'un champ de la fiche d'un jeu (game.json → catalog.json). */
function champJeu(jeu, champ) {
  const lang = getLang();
  const traduit = jeu?.i18n?.[lang]?.[champ];
  return typeof traduit === 'string' && traduit.trim() ? traduit : jeu[champ];
}

export const titreJeu = (jeu) => champJeu(jeu, 'title');
export const descriptionJeu = (jeu) => champJeu(jeu, 'description');
/** Présentation de quelques phrases (nouveaux jeux), sinon la description courte. */
export const presentationJeu = (jeu) => (jeu?.presentation ? champJeu(jeu, 'presentation') : descriptionJeu(jeu));

/** Le jeu est-il proposé dans la langue courante ? (« langues » absent = toutes) */
export function jeuDisponible(jeu) {
  return !Array.isArray(jeu.langues) || jeu.langues.length === 0 || jeu.langues.includes(getLang());
}

/** Le contenu du jeu (mots, lettres…) reste-t-il en français dans la langue courante ? */
export function jeuEnFrancais(jeu) {
  return getLang() !== 'fr' && jeu.non_traduisible === true;
}

/**
 * Titre de l'onglet et description des pages traduites en JavaScript (lanceur,
 * mentions légales). Ces pages ne sont pas indexées (noindex) : les pages
 * proposées aux moteurs de recherche sont générées dans chaque langue, avec
 * leurs liens hreflang écrits dans le HTML (scripts/pages-seo.mjs).
 * Sans effet sur une page pré-rendue : tout y est déjà écrit.
 */
export function majSeo({ titre, description }) {
  if (PRERENDU) return;
  document.title = titre;
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'description';
    document.head.append(meta);
  }
  meta.content = description;
}
