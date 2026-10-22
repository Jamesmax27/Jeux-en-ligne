// ==========================================================================
// Jeux-en-ligne — langue du site (partagé par le catalogue et le lanceur)
//
// S'appuie sur le module commun i18n/i18n.js (window.JEL_I18N), chargé par
// une balise <script> avant ce module. Textes : i18n/site/<langue>.json.
// - demarrerLangue() : charge les textes, crée le sélecteur de l'en-tête.
// - majSeo() : <title>, meta description et liens hreflang (?lang=…).
// - nomGenre(), nomTag(), titreJeu(), descriptionJeu() : noms affichés ;
//   les identifiants internes (genres, tags, id des jeux) ne changent jamais.
// ==========================================================================

const I = window.JEL_I18N;

export const t = (cle, variables) => I.t(cle, variables);
export const getLang = () => I.getLang();
export const LANGUES = I.LANGUES;

/** Charge les textes du site puis place le sélecteur de langue dans « conteneur ». */
export async function demarrerLangue(conteneur) {
  await I.charger('i18n/site/');
  if (conteneur) I.creerSelecteur({ conteneur, classe: 'selecteur-site' });
}

/** Appelle f(lang) après chaque changement de langue. */
export function surChangementLangue(f) {
  I.surChangement(f);
}

// « Équitation » : la clé garde l'accent (forme NFC, comme dans les fichiers).
function cle(prefixe, mot) {
  return `${prefixe}.${String(mot).normalize('NFC')}`;
}

function majuscule(mot) {
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}

/** Nom affiché d'un genre (identifiant interne inchangé). */
export function nomGenre(genre) {
  return I.has(cle('genre', genre)) ? t(cle('genre', genre)) : majuscule(genre);
}

/** Nom affiché d'un tag : sa traduction, sinon celle du genre du même nom, sinon le mot lui-même. */
export function nomTag(tag) {
  if (I.has(cle('tag', tag))) return t(cle('tag', tag));
  if (I.has(cle('genre', tag))) return t(cle('genre', tag));
  return majuscule(tag);
}

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
 * Référencement : titre, description, et une variante ?lang=xx par langue
 * (plus x-default, l'adresse sans langue). Les autres paramètres (id) sont gardés.
 */
export function majSeo({ titre, description }) {
  document.title = titre;
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'description';
    document.head.append(meta);
  }
  meta.content = description;

  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((l) => l.remove());
  const base = new URL(location.href);
  base.hash = '';
  base.searchParams.delete('lang');
  const ajouter = (hreflang, href) => {
    const lien = document.createElement('link');
    lien.rel = 'alternate';
    lien.hreflang = hreflang;
    lien.href = href;
    document.head.append(lien);
  };
  for (const lang of LANGUES) {
    const u = new URL(base);
    u.searchParams.set('lang', lang);
    ajouter(lang, u.href);
  }
  ajouter('x-default', base.href);
}
