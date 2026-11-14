// ==========================================================================
// pages-seo.mjs — pages HTML statiques du site, pour les moteurs de recherche
//
// Appelé par scripts/build-catalog.mjs à chaque build (Cloudflare Pages lance
// ce build à chaque push sur main) : tout jeu publié, quelle que soit sa
// source, passe donc par les mêmes gabarits (dossier gabarits/).
//
// Écrit dans public/ (fichiers générés, ignorés par git, recréés à chaque build) :
//   - accueils          /, /en/, /es/, /pt/, /de/            (gabarits/accueil.html)
//   - fiches des jeux   /jeux/<id>/, /en/games/<id>/…        (gabarits/jeu.html)
//   - catégories        /genres/<id>/, /univers/<id>/, /ages/<tranche>/… (gabarits/categorie.html)
//   - page 404          /404.html, /en/404.html…             (gabarits/introuvable.html)
//   - pages légales     /mentions-legales/, /en/legal-notice/… (gabarits/legal.html),
//                       en français et en anglais (textes : gabarits/legal/ et
//                       gabarits/textes/legal.json)
//   - formulaire public /proposer/, /en/suggest/…         (gabarits/proposer.html),
//                       non indexé (textes : clés « proposer.* »)
//   - profil joueur /profil/, /en/profile/…, classement /classement/,
//                       /en/leaderboard/… et amis /amis/, /en/friends/…
//                       (gabarits/profil.html, classement.html, amis.html),
//                       non indexés (docs/cadrage-fidelisation.md)
//   - sitemap.xml (pages indexables seulement, avec lastmod) et robots.txt
//   - _redirects (Cloudflare Pages) : redirections 301 des pages de catégorie
//                       retirées (ANCIENS_IDS de public/taxonomie.js) vers la
//                       catégorie qui les a remplacées ; fichier généré, ne
//                       pas le modifier à la main
// Genres et univers : du plus grand nombre de jeux au plus petit (ordreAffichage,
// comme l'accueil) ; « autre » n'a ni page, ni puce, ni libellé sur les cartes.
// Adresses : public/chemins.js. Textes des jeux : game.json (règles :
// scripts/regles-seo.mjs). Textes des catégories : gabarits/textes/categories.<langue>.json.
// Intitulés des pages : clés « page.* » de public/i18n/site/<langue>.json.
//
// Chaque page contient, dans son HTML : <html lang>, <title>, meta description,
// meta robots, canonical, hreflang (x-default = français), Open Graph, JSON-LD,
// un seul H1, et des liens <a> ordinaires (fil d'Ariane, catégories, jeux
// similaires) : tout reste lisible sans JavaScript.
//
// Sécurité (CLAUDE.md, section 11) : aucun texte de game.json n'est inséré sans
// être échappé ; le JSON-LD est sérialisé avec « < » échappé.
// ==========================================================================

import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  GENRES, UNIVERS, TRANCHES_AGE, IDS_GENRES, IDS_UNIVERS, ID_AUTRE, ANCIENS_IDS, ANCIENNES_TRANCHES, AGE_ADOS,
  trancheDeAge, pourAdos, ordreAffichage, CLASSES_PAR_LANGUE,
} from '../public/taxonomie.js';
import { LANGUES, HREFLANG, LOCALE_OG, LANGUES_LEGALES, PAGES_LEGALES, urlAccueil, urlJeu, urlCategorie, urlLanceur, urlLegale, urlProposer, urlProfil, urlClassement, urlAmis, urlEcole, langueLegale } from '../public/chemins.js';
import { TITRE_MIN, TITRE_MAX, DESCRIPTION_MIN, DESCRIPTION_MAX } from '../public/demandes-regles.js';
import { problemesChamps, textesLangue, languesDuJeu, ageMinimum } from './regles-seo.mjs';

export const ADRESSE_PAR_DEFAUT = 'https://freemicrogames.com/';
export const NOM_DU_SITE = 'Free Micro Games';

// Une catégorie est indexée à partir de ce nombre de jeux (en dessous : noindex, follow).
export const SEUIL_INDEXATION_CATEGORIE = 3;
export const NB_SIMILAIRES = 6;
export const NB_DERNIERS_JEUX = 12;
export const JAQUETTES_PRIORITAIRES = 4;   // premières jaquettes chargées tout de suite (les autres en lazy)
export const ALERTE_FICHIERS = 16000;      // limite Cloudflare Pages : 20 000 fichiers par site
export const MAX_FICHIERS = 19500;
export const MAX_REDIRECTIONS = 2000;      // limite Cloudflare Pages : 2 000 redirections fixes
export const ALERTE_REDIRECTIONS = 1800;

// Dossiers et fichiers de public/ écrits par ce module (effacés au début de chaque build).
export const SORTIES = ['index.html', '404.html', 'jeux', 'genres', 'univers', 'ages', 'en', 'es', 'pt', 'de', 'sitemap.xml', 'robots.txt', '_redirects',
  'mentions-legales', 'confidentialite', 'conditions-utilisation', 'cookies', 'proposer', 'profil', 'classement', 'amis', 'ecole'];

// Anciennes catégories dont la page la plus proche est dans une autre famille
// que le remplaçant de ANCIENS_IDS (qui reste celui des données) : redirections
// seulement (choix du propriétaire, novembre 2026).
//   genre « sport » → univers « sport » (le genre « course » ne parle que de course) ;
//   univers « abstrait » → genre « puzzle » (jeux de formes et de logique).
export const DESTINATIONS_ANCIENNES = {
  'genre:sport': ['univers', 'sport'],
  'univers:abstrait': ['genre', 'puzzle'],
};

// Images de partage : la jaquette du jeu si elle est en image matricielle, sinon l'icône du site.
const IMAGE_SITE = 'assets/icone-512.png';
const IMAGE_PAR_DEFAUT_JAQUETTE = 'assets/sans-jaquette.svg';

/**
 * Adresse publique du site (variable SITE_URL, sinon freemicrogames.com), terminée par « / ».
 * Une adresse en *.pages.dev ou sans https est refusée : ces adresses sont en noindex
 * (public/_headers), toutes les canonical et le sitemap y mèneraient. Sur le build de
 * production (branche main sur Cloudflare), c'est une erreur ; ailleurs, le défaut est pris.
 */
export function adresseDuSite() {
  const brute = process.env.SITE_URL;
  if (!brute) return ADRESSE_PAR_DEFAUT;
  let u;
  try { u = new URL(brute); } catch { u = null; }
  if (u && u.protocol === 'https:' && !u.hostname.endsWith('.pages.dev')) return u.href.endsWith('/') ? u.href : `${u.href}/`;
  if (process.env.CF_PAGES === '1' && process.env.CF_PAGES_BRANCH === 'main') {
    throw new Error(`SITE_URL (« ${brute} ») doit être l'adresse publique en https du site, pas une adresse *.pages.dev : la régler sur https://freemicrogames.com/ ou la retirer (réglages Cloudflare Pages)`);
  }
  return ADRESSE_PAR_DEFAUT;
}

/** Adresse absolue d'un chemin du site (« /jeux/x/ » → « https://…/jeux/x/ »). */
export function absolue(chemin) {
  return new URL(String(chemin).replace(/^\//, ''), adresseDuSite()).href;
}

// --------------------------------------------------------------------------
// Outils
// --------------------------------------------------------------------------

const ECHAPPEMENTS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const echapper = (texte) => String(texte ?? '').replace(/[&<>"']/g, (c) => ECHAPPEMENTS[c]);

const jsonLd = (donnees) => `<script type="application/ld+json">${JSON.stringify(donnees).replace(/</g, '\\u003c')}</script>`;

// Paragraphes d'un texte (lignes vides = nouveau paragraphe).
const paragraphes = (texte) => String(texte ?? '').split(/\n\s*\n|\r?\n/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${echapper(p)}</p>`).join('\n      ');

// Du plus récent au plus ancien, puis par titre français (même ordre que le catalogue, app.js).
const parDate = (a, b) => String(b.added).localeCompare(String(a.added)) || a.title.localeCompare(b.title, 'fr');

/** Fonction de traduction (mêmes règles que public/i18n/i18n.js : repli sur fr, pluriels, {variables}). */
function creerT(dicos, lang) {
  return (cle, variables) => {
    let valeur = dicos[lang]?.[cle];
    let l = lang;
    if (valeur === undefined) {
      valeur = dicos.fr?.[cle];
      l = 'fr';
      if (valeur === undefined) throw new Error(`texte du site introuvable : « ${cle} » (public/i18n/site/fr.json)`);
    }
    if (valeur && typeof valeur === 'object') {
      const n = typeof variables?.n === 'number' ? variables.n : 0;
      let forme = 'other';
      try { forme = new Intl.PluralRules(l).select(n); } catch { /* forme par défaut */ }
      valeur = n === 0 && typeof valeur.zero === 'string' ? valeur.zero : (typeof valeur[forme] === 'string' ? valeur[forme] : valeur.other);
    }
    return String(valeur).replace(/\{(\w+)\}/g, (tout, nom) => {
      if (!variables || !Object.prototype.hasOwnProperty.call(variables, nom)) return tout;
      const v = variables[nom];
      return typeof v === 'number' ? new Intl.NumberFormat(lang).format(v) : String(v);
    });
  };
}

/**
 * Remplit un gabarit :
 *   {{> nom}}      morceau gabarits/morceaux/<nom>.html (rempli lui aussi)
 *   {{{cle}}}      fragment HTML déjà construit par ce module
 *   {{t:cle}}      texte du site dans la langue de la page (échappé)
 *   {{cle}}        valeur échappée
 * Un emplacement inconnu arrête le build : jamais de page à moitié remplie.
 */
function remplir(gabarit, valeurs, t, morceaux, nomGabarit) {
  // Morceaux, y compris ceux placés dans un autre morceau (5 niveaux au plus).
  let avecMorceaux = gabarit;
  for (let niveau = 0; /\{\{>/.test(avecMorceaux); niveau++) {
    if (niveau >= 5) throw new Error(`${nomGabarit} : morceaux imbriqués trop profondément`);
    avecMorceaux = avecMorceaux.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, nom) => {
      if (!(nom in morceaux)) throw new Error(`${nomGabarit} : morceau inconnu « ${nom} »`);
      return morceaux[nom];
    });
  }
  return avecMorceaux.replace(/\{\{\{\s*([\w.-]+)\s*\}\}\}|\{\{\s*t:([\w.+-]+)\s*\}\}|\{\{\s*([\w.-]+)\s*\}\}/g, (_, brut, cleTexte, cle) => {
    if (cleTexte) return echapper(t(cleTexte));
    const nom = brut || cle;
    if (!Object.prototype.hasOwnProperty.call(valeurs, nom) || valeurs[nom] === undefined || valeurs[nom] === null) {
      throw new Error(`${nomGabarit} : emplacement sans valeur « ${nom} »`);
    }
    return brut ? String(valeurs[nom]) : echapper(valeurs[nom]);
  });
}

async function lireJson(chemin, defaut) {
  try {
    return JSON.parse((await readFile(chemin, 'utf8')).replace(/^﻿/, ''));
  } catch (e) {
    if (defaut !== undefined && e.code === 'ENOENT') return defaut;
    throw new Error(`${chemin} illisible : ${e.message}`);
  }
}

async function ecrire(dossierPublic, chemin, contenu) {
  const fichier = path.join(dossierPublic, chemin.replace(/^\//, ''), chemin.endsWith('/') ? 'index.html' : '');
  await mkdir(path.dirname(fichier), { recursive: true });
  await writeFile(fichier, contenu, 'utf8');
}

async function compterFichiers(dossier) {
  let n = 0;
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    n += e.isDirectory() ? await compterFichiers(path.join(dossier, e.name)) : 1;
  }
  return n;
}

// --------------------------------------------------------------------------
// Données des jeux
// --------------------------------------------------------------------------

/** Jeux d'une catégorie : genre (principal ou secondaire), univers, ou tranche d'âge. */
function jeuxDeCategorie(jeux, famille, id) {
  if (famille === 'genre') return jeux.filter((j) => j.genre === id || j.genres_secondaires.includes(id));
  if (famille === 'univers') return jeux.filter((j) => j.univers.includes(id));
  return jeux.filter((j) => trancheDeAge(j.ages) === id);
}

/**
 * Jeux similaires (déterministe) : 8 points si même genre principal, 4 par autre
 * genre commun, 5 par univers commun, 1 si même tranche d'âge, 4 de moins si les
 * âges conseillés diffèrent de 3 ans ou plus. Candidats d'au moins 3 points (un
 * genre ou un univers partagé), puis complément par la même tranche d'âge (qui
 * est aussi une catégorie) jusqu'à NB_SIMILAIRES. Jamais de jeu pour adolescents
 * (pourAdos) parmi ceux d'un jeu conseillé avant 10 ans (ou sans âge lisible).
 */
export function jeuxSimilaires(jeu, jeux, nombre = NB_SIMILAIRES) {
  const genresDe = (j) => [j.genre, ...j.genres_secondaires].filter(Boolean);
  const mesGenres = genresDe(jeu);
  const maTranche = trancheDeAge(jeu.ages);
  const monAge = ageMinimum(jeu.ages);
  const pourPetits = monAge === null || monAge < AGE_ADOS - 3;
  const score = (autre) => {
    let s = 0;
    if (jeu.genre && autre.genre === jeu.genre) s += 8;
    for (const g of genresDe(autre)) {
      if (g === jeu.genre && autre.genre === jeu.genre) continue; // déjà compté : même genre principal
      if (mesGenres.includes(g)) s += 4;
    }
    for (const u of autre.univers) if (jeu.univers.includes(u)) s += 5;
    if (maTranche && trancheDeAge(autre.ages) === maTranche) s += 1;
    const sonAge = ageMinimum(autre.ages);
    if (monAge !== null && sonAge !== null && Math.abs(monAge - sonAge) >= 3) s -= 4;
    return s;
  };
  const ordre = (a, b) => b.score - a.score || String(b.jeu.added).localeCompare(String(a.jeu.added)) || a.jeu.id.localeCompare(b.jeu.id);
  const autres = jeux.filter((j) => j.id !== jeu.id && !(pourPetits && pourAdos(j.ages))).map((j) => ({ jeu: j, score: score(j) }));
  const proches = autres.filter((x) => x.score >= 3).sort(ordre).slice(0, nombre);
  if (proches.length < nombre && maTranche) {
    const complement = autres.filter((x) => x.score < 3 && trancheDeAge(x.jeu.ages) === maTranche).sort(ordre);
    proches.push(...complement.slice(0, nombre - proches.length));
  }
  return proches.map((x) => x.jeu);
}

// --------------------------------------------------------------------------
// Morceaux HTML construits ici
// --------------------------------------------------------------------------

// Type et dimensions d'une image de partage (og:image) d'après son adresse :
// jaquettes 600 × 800 (CLAUDE.md, section 5), icône du site 512 × 512.
function infosImage(image) {
  const ext = (/\.(jpe?g|png|webp)(?:\?|$)/i.exec(image) || [])[1]?.toLowerCase();
  const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext];
  return image.endsWith(IMAGE_SITE) ? { type, largeur: 512, hauteur: 512 } : { type, largeur: 600, hauteur: 800 };
}

// Petit script de toutes les pages générées : enregistre le service worker (hors
// ligne dès la première visite, même arrivé par une fiche) et note le choix
// de langue fait avec les liens de langue (utilisé par l'accueil « / »), et
// garde l'offre d'installation du navigateur (beforeinstallprompt, Chrome, Edge)
// même si elle arrive avant installer.js.
const SCRIPT_PAGE = `<script>
    addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.FMG_INSTALLATION = e; });
    if ('serviceWorker' in navigator) addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('.langues a[hreflang]');
      if (a) try { localStorage.setItem('lang', a.getAttribute('hreflang').split('-')[0]); } catch (x) { /* stockage refusé */ }
    });
  </script>`;

/** Tête commune de toutes les pages générées. */
function tete({ lang, titre, description, canonique, indexable, alternatives, image, imageAlt, type = 'website', donnees = [] }) {
  const img = infosImage(image);
  const lignes = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${echapper(titre)}</title>`,
    `<meta name="description" content="${echapper(description)}">`,
    `<meta name="robots" content="${indexable ? 'index, follow' : 'noindex, follow'}">`,
    `<link rel="canonical" href="${echapper(canonique)}">`,
  ];
  if (alternatives && Object.keys(alternatives).length > 1) {
    for (const [l, href] of Object.entries(alternatives)) lignes.push(`<link rel="alternate" hreflang="${HREFLANG[l]}" href="${echapper(href)}">`);
    if (alternatives.fr) lignes.push(`<link rel="alternate" hreflang="x-default" href="${echapper(alternatives.fr)}">`);
  }
  lignes.push(
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="${NOM_DU_SITE}">`,
    `<meta property="og:title" content="${echapper(titre)}">`,
    `<meta property="og:description" content="${echapper(description)}">`,
    `<meta property="og:url" content="${echapper(canonique)}">`,
    `<meta property="og:image" content="${echapper(image)}">`,
    ...(img.type ? [`<meta property="og:image:type" content="${img.type}">`] : []),
    `<meta property="og:image:width" content="${img.largeur}">`,
    `<meta property="og:image:height" content="${img.hauteur}">`,
    `<meta property="og:image:alt" content="${echapper(imageAlt)}">`,
    `<meta property="og:locale" content="${LOCALE_OG[lang]}">`,
    ...Object.keys(alternatives || {}).filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${LOCALE_OG[l]}">`),
    '<meta name="twitter:card" content="summary">',
    '<meta name="theme-color" content="#0b1020">',
    '<link rel="icon" href="/assets/logo.svg" type="image/svg+xml">',
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">',
    '<link rel="stylesheet" href="/style.css">',
    ...donnees.map(jsonLd),
    // Consentement aux cookies (Google Consent Mode v2, tout refusé par défaut) :
    // placé avant tout autre script de la page, dont la publicité (pub.js) ;
    // puis la mesure d'audience Google Analytics (chargée seulement après « Accepter »).
    '<script src="/consentement.js" defer></script>',
    '<script src="/mesure.js" defer></script>',
    // Pastille du profil joueur (coin de l'en-tête) : profil créé dès la première
    // visite, check vert des jeux terminés (docs/cadrage-fidelisation.md).
    '<script type="module" src="/profil-pastille.js"></script>',
    // « Installer l'appli » : bannière de l'accueil, lien du pied, fenêtre d'explication.
    '<script src="/installer.js" defer></script>',
    SCRIPT_PAGE,
  );
  return lignes.join('\n  ');
}

/**
 * Liens vers les autres langues (HTML seul, sans JavaScript) pour l'en-tête des pages.
 * Adresses depuis la racine (on reste sur le site consulté : local, préversion…) ;
 * les adresses absolues sont réservées aux <link rel="alternate">.
 */
function liensLangues(lang, alternatives, t) {
  const NOMS = { fr: 'Français', en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch' };
  const etiquette = `${t('langue.choisir')} : ${NOMS[lang]}`;
  const items = LANGUES.filter((l) => alternatives[l]).map((l) => {
    const courant = l === lang ? ' aria-current="true"' : '';
    return `<li><a href="${echapper(new URL(alternatives[l]).pathname)}" hreflang="${HREFLANG[l]}" lang="${HREFLANG[l]}"${courant}><b>${l.toUpperCase()}</b> ${NOMS[l]}</a></li>`;
  });
  if (items.length < 2) return '';
  return `<details class="langues">
        <summary aria-label="${echapper(etiquette)}" title="${echapper(etiquette)}"><span class="langues-code">${lang.toUpperCase()}</span><span class="langues-nom">${NOMS[lang]}</span></summary>
        <ul>${items.join('')}</ul>
      </details>`;
}

/** Maison dessinée devant « Accueil » dans le fil d'Ariane : les joueurs voient d'un coup d'œil comment revenir au catalogue. */
const ICONE_MAISON = '<svg class="ariane-maison" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Fil d'Ariane visible (le dernier élément est la page elle-même) et son équivalent JSON-LD. */
function ariane(etapes, t) {
  const html = `<nav class="ariane" aria-label="${echapper(t('page.ariane'))}">
      <ol>${etapes.map((e, i) => (i === etapes.length - 1
    ? `<li><span aria-current="page">${echapper(e.nom)}</span></li>`
    : i === 0
      ? `<li><a class="ariane-accueil" href="${echapper(e.chemin)}">${ICONE_MAISON}${echapper(e.nom)}</a></li>`
      : `<li><a href="${echapper(e.chemin)}">${echapper(e.nom)}</a></li>`)).join('')}</ol>
    </nav>`;
  const donnees = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: etapes.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.nom, item: absolue(e.chemin) })),
  };
  return { html, donnees };
}

/** Puce-lien vers une catégorie (mêmes classes et icônes que les puces de l'accueil). « autre » : aucune. */
function puceCategorie(famille, id, lang, t) {
  const info = famille === 'genre' ? GENRES.find((g) => g.id === id) : famille === 'univers' ? UNIVERS.find((u) => u.id === id) : TRANCHES_AGE.find((a) => a.id === id);
  if (!info || id === ID_AUTRE) return '';
  const nom = famille === 'age' ? t(`age.${id}`) : t(`${famille}.${id}`);
  const teinte = info.teinte !== undefined ? ` style="--teinte: ${info.teinte}"` : '';
  return `<a class="puce-filtre puce-lien" data-cle="${famille}:${echapper(id)}"${teinte} href="${echapper(urlCategorie(famille, id, lang))}"><span class="puce-filtre-picto" aria-hidden="true">${info.picto}</span><span>${echapper(nom)}</span></a>`;
}

/** Carte d'un jeu (même dessin que le catalogue) : lien vers sa fiche. */
function carteJeu(jeu, lang, t, { titreNiveau = 'h3', prioritaire = false } = {}) {
  const tx = textesLangue(jeu.fiche, lang);
  const titre = tx.title || jeu.title;
  // Genre principal et premier univers, en libellés courts (comme app.js), sans « autre ».
  const genre = jeu.genre !== ID_AUTRE && jeu.genre;
  const univers = jeu.univers.find((u) => u !== ID_AUTRE);
  const infos = [
    [genre && t(`genre.${genre}.court`), univers && t(`univers.${univers}.court`)].filter(Boolean).join(' · '),
    jeu.ages,
  ].filter(Boolean).join(' — ');
  const alt = tx.jaquette_alt || titre;
  const chargement = prioritaire ? 'fetchpriority="high"' : 'loading="lazy"';
  // data-jeu : identifiant du jeu (le check vert « terminé » de profil.js ne peut
  // plus le lire dans l'adresse, traduite dans les autres langues).
  return `<li><a class="carte" data-jeu="${echapper(jeu.id)}" href="${echapper(urlJeu(jeu, lang))}">
          <div class="jaquette"><img src="/${echapper(jeu.cover)}" alt="${echapper(alt)}" width="600" height="800" ${chargement} decoding="async"><${titreNiveau} class="carte-titre" lang="${HREFLANG[lang]}">${echapper(titre)}</${titreNiveau}></div>
          <div class="carte-texte"><p class="carte-infos">${echapper(infos)}</p></div>
        </a></li>`;
}

// --------------------------------------------------------------------------
// Génération
// --------------------------------------------------------------------------

/**
 * jeux : jeux publiés, chacun { ...entrée du catalogue, fiche: game.json lu }.
 * Renvoie { pages: [{ chemin, lang, type, indexable, lastmod }], avertissements: [] }.
 */
export async function genererPages({ jeux, racine, dossierPublic }) {
  const avertissements = [];
  const avertir = (texte) => avertissements.push(texte);
  const dossierGabarits = path.join(racine, 'gabarits');

  // Gabarits et morceaux.
  const gabarits = {};
  for (const nom of ['accueil', 'jeu', 'categorie', 'introuvable', 'legal', 'proposer', 'profil', 'classement', 'amis']) gabarits[nom] = await readFile(path.join(dossierGabarits, `${nom}.html`), 'utf8');
  const morceauxBruts = {};
  for (const fichier of await readdir(path.join(dossierGabarits, 'morceaux'))) {
    if (fichier.endsWith('.html')) morceauxBruts[fichier.slice(0, -5)] = await readFile(path.join(dossierGabarits, 'morceaux', fichier), 'utf8');
  }

  // Textes du site (intitulés) et des catégories, par langue.
  const dicos = {};
  const categories = {};
  const ecoles = {};
  for (const lang of LANGUES) {
    dicos[lang] = await lireJson(path.join(racine, 'public', 'i18n', 'site', `${lang}.json`));
    categories[lang] = await lireJson(path.join(dossierGabarits, 'textes', `categories.${lang}.json`), {});
    ecoles[lang] = await lireJson(path.join(dossierGabarits, 'textes', `ecole.${lang}.json`), {});
  }

  // Effacer les anciennes sorties.
  for (const sortie of SORTIES) await rm(path.join(dossierPublic, sortie), { recursive: true, force: true });

  // Jeux conformes aux règles de référencement : leur fiche est indexée.
  for (const jeu of jeux) {
    jeu.problemes = problemesChamps(jeu.fiche).filter((p) => p.niveau === 'erreur');
    jeu.conforme = jeu.problemes.length === 0;
    jeu.lastmod = typeof jeu.fiche.maj === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(jeu.fiche.maj) && jeu.fiche.maj > jeu.added ? jeu.fiche.maj : jeu.added;
    if (!jeu.conforme) avertir(`${jeu.id} : textes de référencement incomplets (${jeu.problemes.length} problème(s), voir node scripts/regles-seo.mjs ${jeu.id}) : fiche publiée en noindex, hors sitemap`);
  }
  const jeuxDe = (lang) => jeux.filter((j) => languesDuJeu(j.fiche).includes(lang));
  const lastmodMax = (liste) => liste.reduce((m, j) => (j.lastmod > m ? j.lastmod : m), '0000-00-00');

  const pages = [];

  // Catégories non vides, par langue : { cle, famille, id, jeux }. Genres et
  // univers du plus grand nombre de jeux publiés au plus petit (même ordre dans
  // toutes les langues, comme les puces de l'accueil), sans « autre ».
  const nombre = (famille) => (id) => jeuxDeCategorie(jeux, famille, id).length;
  const FAMILLES = [
    ...ordreAffichage(GENRES, nombre('genre')).map((g) => ({ famille: 'genre', id: g.id })),
    ...ordreAffichage(UNIVERS, nombre('univers')).map((u) => ({ famille: 'univers', id: u.id })),
    ...TRANCHES_AGE.map((a) => ({ famille: 'age', id: a.id })),
  ];
  const categoriesDe = {};
  for (const lang of LANGUES) {
    categoriesDe[lang] = FAMILLES.map((c) => ({ ...c, cle: `${c.famille}.${c.id}`, jeux: jeuxDeCategorie(jeuxDe(lang), c.famille, c.id).sort(parDate) }))
      .filter((c) => c.jeux.length > 0);
  }
  const categorieExiste = (famille, id, lang) => categoriesDe[lang].some((c) => c.famille === famille && c.id === id);
  const categorieIndexable = (c, lang) => c.jeux.length >= SEUIL_INDEXATION_CATEGORIE && !!categories[lang][c.cle]?.h1;
  const nomCategorie = (c, t) => categories[c.lang]?.[c.cle]?.h1 || (c.famille === 'age' ? t(`age.${c.id}`) : t(`${c.famille}.${c.id}`));

  // Pages école (CLASSES de public/taxonomie.js, adresses urlEcole) : jeux dont
  // "classes" contient la classe (sans les jeux en français seul hors du site
  // français) ; seulement avec leurs textes (gabarits/textes/ecole.<langue>.json :
  // nom, h1, titre_seo, description_seo, intro, faq) et au moins
  // SEUIL_INDEXATION_CATEGORIE jeux : jamais de page école vide ou sans texte.
  const ecolesDe = {};
  for (const lang of LANGUES) {
    ecolesDe[lang] = (CLASSES_PAR_LANGUE[lang] || []).map((id) => ({
      famille: 'ecole', id, cle: `ecole.${id}`,
      jeux: jeuxDe(lang).filter((j) => Array.isArray(j.fiche.classes) && j.fiche.classes.includes(id) && !(lang !== 'fr' && j.fiche.non_traduisible === true)).sort(parDate),
    })).filter((c) => c.jeux.length >= SEUIL_INDEXATION_CATEGORIE && ecoles[lang][c.cle]?.h1 && ecoles[lang][c.cle]?.nom);
  }
  const ecoleExiste = (id, lang) => ecolesDe[lang].some((c) => c.id === id);
  // Puce-lien vers une page école (cartable : la classe n'a pas d'icône dessinée).
  const puceEcole = (id, lang) => `<a class="puce-filtre puce-lien" data-cle="ecole:${echapper(id)}" href="${echapper(urlEcole(id, lang))}"><span class="puce-filtre-picto" aria-hidden="true">🎒</span><span>${echapper(ecoles[lang][`ecole.${id}`].nom)}</span></a>`;

  // Morceaux d'une langue. Le pied de page et le bandeau des cookies mènent aux
  // pages légales de la langue (français, sinon anglais) : {{lien:<page>}},
  // {{langue_legale}} et {{note_langues_legales}} sont remplis ici, une fois ;
  // {{lien_proposer}} : formulaire public de demandes dans la langue de la page.
  const outils = (lang) => {
    const t = creerT(dicos, lang);
    const ll = langueLegale(lang);
    const note = lang === ll ? '' : `<p class="pied-note" data-i18n="legal.noteLangues">${echapper(t('legal.noteLangues'))}</p>`;
    const morceaux = {};
    for (const [nom, brut] of Object.entries(morceauxBruts)) {
      morceaux[nom] = brut
        .replace(/\{\{lien_proposer\}\}/g, echapper(urlProposer(lang)))
        .replace(/\{\{lien:([\w-]+)\}\}/g, (_, page) => echapper(urlLegale(page, lang)))
        .replace(/\{\{langue_legale\}\}/g, HREFLANG[ll])
        .replace(/\{\{note_langues_legales\}\}/g, note);
      if (/\{\{lien:/.test(morceaux[nom])) throw new Error(`gabarits/morceaux/${nom}.html : emplacement {{lien:…}} mal écrit`);
    }
    return { t, morceaux };
  };

  // --- Fiches des jeux ------------------------------------------------------
  for (const jeu of jeux) {
    const langues = languesDuJeu(jeu.fiche);
    const alternatives = Object.fromEntries(langues.map((l) => [l, absolue(urlJeu(jeu, l))]));
    for (const lang of langues) {
      const { t, morceaux } = outils(lang);
      const tx = textesLangue(jeu.fiche, lang);
      const titre = tx.title || jeu.title;
      const chemin = urlJeu(jeu, lang);
      const canonique = absolue(chemin);
      const indexable = jeu.conforme;

      // Catégorie du fil d'Ariane : la première catégorie indexée du jeu (genre
      // principal, genres secondaires, univers, tranche d'âge), sinon la première
      // qui existe. Un jeu sans aucune catégorie a un fil Accueil › Jeu.
      const siennes = [
        jeu.genre && { famille: 'genre', id: jeu.genre },
        ...jeu.genres_secondaires.map((id) => ({ famille: 'genre', id })),
        ...jeu.univers.map((id) => ({ famille: 'univers', id })),
        trancheDeAge(jeu.ages) && { famille: 'age', id: trancheDeAge(jeu.ages) },
      ].filter(Boolean).map((x) => categoriesDe[lang].find((c) => c.famille === x.famille && c.id === x.id)).filter(Boolean);
      const cat = siennes.find((c) => categorieIndexable(c, lang)) || siennes[0];
      const fil = ariane([
        { nom: t('page.accueil'), chemin: urlAccueil(lang) },
        ...(cat ? [{ nom: nomCategorie({ ...cat, lang }, t), chemin: urlCategorie(cat.famille, cat.id, lang) }] : []),
        { nom: titre, chemin },
      ], t);

      const imageMatricielle = /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(jeu.cover) && !jeu.cover.startsWith(IMAGE_PAR_DEFAUT_JAQUETTE);
      const image = absolue(imageMatricielle ? `/${jeu.cover}` : `/${IMAGE_SITE}`);
      const alt = tx.jaquette_alt || titre;
      const age = ageMinimum(jeu.ages);
      const description = tx.description_seo || tx.description || jeu.description;

      const similaires = jeuxSimilaires(jeu, jeuxDe(lang));
      const puces = [
        trancheDeAge(jeu.ages) && puceCategorie('age', trancheDeAge(jeu.ages), lang, t),
        jeu.genre && puceCategorie('genre', jeu.genre, lang, t),
        ...jeu.genres_secondaires.map((g) => puceCategorie('genre', g, lang, t)),
        ...jeu.univers.map((u) => puceCategorie('univers', u, lang, t)),
        // Pages école du jeu (classes de game.json) qui existent dans cette langue.
        ...(Array.isArray(jeu.fiche.classes) ? jeu.fiche.classes : []).filter((id) => ecoleExiste(id, lang)).map((id) => puceEcole(id, lang)),
      ].filter(Boolean);

      // Données structurées : elles décrivent le jeu pour les moteurs de recherche.
      // Aucune note (aggregateRating) : les votes sont dans D1, que le build ne lit
      // pas, et rien ne doit être inventé ; Google n'affichera donc pas d'étoiles.
      const donneesJeu = {
        '@context': 'https://schema.org',
        '@type': 'VideoGame',
        name: titre,
        description,
        url: canonique,
        image,
        // Langue du jeu : le français pour un jeu de mots ou de lettres (non_traduisible).
        inLanguage: jeu.fiche.non_traduisible === true ? 'fr' : HREFLANG[lang],
        genre: [jeu.genre, ...jeu.genres_secondaires].filter((g) => g && g !== ID_AUTRE).map((g) => t(`genre.${g}`)),
        gamePlatform: 'Web browser',
        applicationCategory: 'GameApplication',
        operatingSystem: 'Android, iOS, Windows, macOS, Linux',
        // Jeu multijoueur : en ligne à plusieurs, et seul contre des robots (docs/multijoueur.md).
        // Jeu en temps réel (docs/cadrage-temps-reel.md) : 1 contre 1, en ligne ou contre le robot.
        playMode: jeu.fiche.multijoueur === true || jeu.fiche.temps_reel === true ? ['https://schema.org/SinglePlayer', 'https://schema.org/MultiPlayer'] : 'https://schema.org/SinglePlayer',
        ...(jeu.fiche.multijoueur === true && Number.isInteger(jeu.fiche.places) ? { numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: jeu.fiche.places } } : {}),
        ...(jeu.fiche.temps_reel === true ? { numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: Number.isInteger(jeu.fiche.places) ? jeu.fiche.places : 2 } } : {}),
        isAccessibleForFree: true,
        // Jeux pour adolescents (13+ : frissons, horreur) : pas « pour toute la famille ».
        isFamilyFriendly: !pourAdos(jeu.ages),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        datePublished: jeu.added,
        dateModified: jeu.lastmod,
        publisher: { '@type': 'Organization', name: NOM_DU_SITE, url: adresseDuSite() },
        ...(age !== null ? { audience: { '@type': 'PeopleAudience', suggestedMinAge: age }, typicalAgeRange: `${age}-` } : {}),
      };

      const valeurs = {
        lang: HREFLANG[lang],
        tete: tete({ lang, titre: tx.titre_seo || t('jeu.titreDocument', { titre }), description, canonique, indexable, alternatives, image, imageAlt: alt, donnees: [donneesJeu, fil.donnees] }),
        accueil: urlAccueil(lang),
        langues: liensLangues(lang, alternatives, t),
        ariane: fil.html,
        titre,
        accroche: tx.description || jeu.description,
        jaquette: `/${jeu.cover}`,
        jaquette_alt: alt,
        jouer: urlLanceur(jeu.id, lang),
        jouer_aria: t('page.jouerAria', { titre }),
        signaler: urlProposer(lang, jeu.id),
        // Partage (public/partage.js) : l'adresse officielle de la page, lue par
        // WhatsApp et Facebook pour l'aperçu (balises og:* de la tête).
        partage_url: canonique,
        partage_texte: t('partage.message', { titre }),
        puces: puces.join(''),
        presentation: paragraphes(tx.presentation || tx.description || jeu.description),
        regles: tx.regles ? `<h2>${echapper(t('page.commentJouer'))}</h2>\n      ${paragraphes(tx.regles)}` : '',
        age: age !== null ? t('page.ageConseille', { n: age }) : '',
        competences: tx.competences ? `<p><strong>${echapper(t('page.competences'))}</strong> ${echapper(tx.competences)}</p>` : '',
        note_langue: lang !== 'fr' && jeu.fiche.non_traduisible === true ? `<p class="fiche-note-langue">${echapper(t('page.enFrancais'))}</p>` : '',
        // Classement des étoiles (public/classement-jeu.js) : jeux à étoiles seulement.
        classement_etoiles: Number.isInteger(jeu.fiche.etoiles) && jeu.fiche.etoiles > 0 && jeu.fiche.sans_fin !== true
          ? remplir(morceaux['classement-jeu'], { jeu_id: jeu.id, etoiles_max: jeu.fiche.etoiles }, t, morceaux, 'gabarits/morceaux/classement-jeu.html').trim()
          : '',
        similaires: similaires.length
          ? `<section class="similaires" aria-labelledby="titre-similaires">
      <h2 id="titre-similaires">${echapper(t('page.similaires'))}</h2>
      <ul class="grille">${similaires.map((s) => carteJeu(s, lang, t)).join('')}</ul>
    </section>`
          : '',
      };
      await ecrire(dossierPublic, chemin, remplir(gabarits.jeu, valeurs, t, morceaux, 'gabarits/jeu.html'));
      pages.push({ chemin, lang, type: 'jeu', id: jeu.id, indexable, lastmod: jeu.lastmod, image: imageMatricielle ? image : null });
    }
  }

  // --- Catégories et pages école ---------------------------------------------
  // Même gabarit ; une page école (famille « ecole ») n'existe qu'avec ses textes
  // et au moins SEUIL_INDEXATION_CATEGORIE jeux (ecolesDe).
  for (const lang of LANGUES) {
    const { t, morceaux } = outils(lang);
    for (const c of [...categoriesDe[lang], ...ecolesDe[lang]]) {
      const estEcole = c.famille === 'ecole';
      const textes = estEcole ? ecoles[lang][c.cle] : categories[lang][c.cle];
      if (!textes) avertir(`catégorie ${c.cle} : textes absents de gabarits/textes/categories.${lang}.json (page en noindex)`);
      const cheminDe = (l) => (estEcole ? urlEcole(c.id, l) : urlCategorie(c.famille, c.id, l));
      const chemin = cheminDe(lang);
      const canonique = absolue(chemin);
      const h1 = estEcole ? textes.h1 : nomCategorie({ ...c, lang }, t);
      const indexable = estEcole || categorieIndexable(c, lang);
      const alternatives = Object.fromEntries(LANGUES.filter((l) => (estEcole ? ecoleExiste(c.id, l) : categorieExiste(c.famille, c.id, l))).map((l) => [l, absolue(cheminDe(l))]));
      const fil = ariane([{ nom: t('page.accueil'), chemin: urlAccueil(lang) }, { nom: h1, chemin }], t);
      const description = textes?.description_seo || t('meta.description');
      const soeurs = [...categoriesDe[lang], ...ecolesDe[lang]].filter((x) => x.famille === c.famille && x.id !== c.id);
      const titreSoeurs = { genre: 'page.autresGenres', univers: 'page.autresUnivers', age: 'page.autresAges', ecole: 'page.autresClasses' }[c.famille];
      const puce = (s) => (estEcole ? puceEcole(s.id, lang) : puceCategorie(s.famille, s.id, lang, t));
      const donneesListe = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: h1,
        description,
        url: canonique,
        inLanguage: HREFLANG[lang],
        isPartOf: { '@type': 'WebSite', name: NOM_DU_SITE, url: absolue(urlAccueil(lang)) },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: c.jeux.length,
          itemListElement: c.jeux.map((j, i) => ({ '@type': 'ListItem', position: i + 1, url: absolue(urlJeu(j, lang)), name: textesLangue(j.fiche, lang).title || j.title })),
        },
      };
      // Questions fréquentes (« faq » des textes de la catégorie, facultatives) :
      // visibles en bas de page et décrites en JSON-LD FAQPage (mêmes textes).
      // « {n} » dans l'introduction et les questions-réponses : nombre de jeux de la
      // page au moment du build (les textes ne vieillissent pas quand la boucle de
      // nuit ajoute des jeux). Jamais dans le titre ni la description (longueur fixe).
      const avecNombre = (texte) => String(texte).replace(/\{n\}/g, () => new Intl.NumberFormat(HREFLANG[lang]).format(c.jeux.length));
      const faq = Array.isArray(textes?.faq) ? textes.faq.filter((x) => typeof x?.q === 'string' && typeof x?.r === 'string' && x.q.trim() && x.r.trim()).map((x) => ({ q: avecNombre(x.q), r: avecNombre(x.r) })) : [];
      const donneesFaq = faq.length ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: HREFLANG[lang],
        mainEntity: faq.map((x) => ({ '@type': 'Question', name: x.q.trim(), acceptedAnswer: { '@type': 'Answer', text: x.r.trim() } })),
      } : null;
      const valeurs = {
        lang: HREFLANG[lang],
        tete: tete({ lang, titre: textes?.titre_seo || `${h1} — ${NOM_DU_SITE}`, description, canonique, indexable, alternatives, image: absolue(`/${IMAGE_SITE}`), imageAlt: NOM_DU_SITE, donnees: [donneesListe, fil.donnees, ...(donneesFaq ? [donneesFaq] : [])] }),
        faq: faq.length
          ? `<section class="faq" aria-labelledby="titre-faq">
      <h2 id="titre-faq">${echapper(t('page.faq'))}</h2>
      <dl>${faq.map((x) => `<dt>${echapper(x.q.trim())}</dt><dd>${echapper(x.r.trim())}</dd>`).join('')}</dl>
    </section>`
          : '',
        accueil: urlAccueil(lang),
        langues: liensLangues(lang, alternatives, t),
        ariane: fil.html,
        h1,
        intro: paragraphes(avecNombre(textes?.intro || '')),
        titre_jeux: t('page.lesJeux'),
        nombre: t('nombre.jeux', { n: c.jeux.length }),
        jeux: c.jeux.map((j, i) => carteJeu(j, lang, t, { titreNiveau: 'h3', prioritaire: i < JAQUETTES_PRIORITAIRES })).join(''),
        autres: soeurs.length
          ? `<nav class="autres-categories" aria-labelledby="titre-autres">
      <h2 id="titre-autres">${echapper(t(titreSoeurs))}</h2>
      <p class="puces-liens">${soeurs.map(puce).join('')}</p>
    </nav>`
          : '',
      };
      await ecrire(dossierPublic, chemin, remplir(gabarits.categorie, valeurs, t, morceaux, 'gabarits/categorie.html'));
      // lastmod : jeu le plus récemment ajouté ou modifié, ou dernière retouche des textes (« maj »).
      const majTextes = typeof textes?.maj === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(textes.maj) ? textes.maj : '0000-00-00';
      const lastmodJeux = lastmodMax(c.jeux);
      pages.push({ chemin, lang, type: estEcole ? 'ecole' : 'categorie', indexable, lastmod: majTextes > lastmodJeux ? majTextes : lastmodJeux });
    }
  }

  // --- Accueils -------------------------------------------------------------
  const alternativesAccueil = Object.fromEntries(LANGUES.map((l) => [l, absolue(urlAccueil(l))]));
  for (const lang of LANGUES) {
    const { t, morceaux } = outils(lang);
    const chemin = urlAccueil(lang);
    const liste = jeuxDe(lang);
    // Derniers jeux ajoutés (et premières cartes de la grille) : sans les jeux pour adolescents.
    const derniers = liste.filter((j) => !pourAdos(j.ages)).sort(parDate).slice(0, NB_DERNIERS_JEUX);
    const groupe = (famille, titreCle) => {
      const liens = categoriesDe[lang].filter((c) => c.famille === famille)
        .map((c) => puceCategorie(c.famille, c.id, lang, t).replace('</a>', `<span class="puce-filtre-compte" aria-hidden="true">${new Intl.NumberFormat(lang).format(c.jeux.length)}</span></a>`));
      return liens.length ? `<h3>${echapper(t(titreCle))}</h3>\n      <p class="puces-liens">${liens.join('')}</p>` : '';
    };
    const plan = `<nav class="plan" aria-labelledby="titre-derniers">
    <h2 id="titre-derniers">${echapper(t('page.derniersJeux'))}</h2>
    <ul class="plan-derniers">${derniers.map((j) => `<li><a href="${echapper(urlJeu(j, lang))}">${echapper(textesLangue(j.fiche, lang).title || j.title)}</a></li>`).join('')}</ul>
    <h2>${echapper(t('page.toutesCategories'))}</h2>
      ${groupe('age', 'groupe.ages')}
      ${groupe('genre', 'groupe.genres')}
      ${groupe('univers', 'groupe.univers')}
      ${ecolesDe[lang].length ? `<h3>${echapper(t('groupe.ecole'))}</h3>
      <p class="puces-liens">${ecolesDe[lang].map((c) => puceEcole(c.id, lang)).join('')}</p>` : ''}
  </nav>`;
    // Présentation du site : les mots {profil}, {classement} et {amis} des
    // textes deviennent des liens vers ces pages (non indexées).
    const lien = (nom, href) => `<a href="${echapper(href)}">${echapper(t(`apropos.lien.${nom}`))}</a>`;
    const avecLiens = (cle) => echapper(t(cle, { profil: '%profil%', classement: '%classement%', amis: '%amis%' }))
      .replace('%profil%', lien('profil', urlProfil(lang)))
      .replace('%classement%', lien('classement', urlClassement(lang)))
      .replace('%amis%', lien('amis', urlAmis(lang)));
    const apropos = `<section class="a-propos" aria-labelledby="titre-a-propos">
    <h2 id="titre-a-propos">${echapper(t('apropos.titre'))}</h2>
    <p>${echapper(t('apropos.gratuit'))}</p>
    <p>${echapper(t('apropos.multi'))}</p>
    <p>${avecLiens('apropos.profil')}</p>
    <p>${echapper(t('apropos.horsLigne'))}</p>
  </section>`;
    const donneesSite = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: NOM_DU_SITE,
      url: absolue(chemin),
      inLanguage: HREFLANG[lang],
      description: t('meta.description'),
      publisher: { '@type': 'Organization', name: NOM_DU_SITE, url: adresseDuSite(), logo: absolue('/assets/icone-512.png') },
    };
    const valeurs = {
      lang: HREFLANG[lang],
      code_langue: lang,
      tete: tete({ lang, titre: t('meta.titre'), description: t('meta.description'), canonique: absolue(chemin), indexable: true, alternatives: alternativesAccueil, image: absolue(`/${IMAGE_SITE}`), imageAlt: NOM_DU_SITE, donnees: [donneesSite] }),
      accueils: JSON.stringify(Object.fromEntries(LANGUES.map((l) => [l, urlAccueil(l)]))),
      langues: liensLangues(lang, alternativesAccueil, t),
      // Premières cartes écrites dans la page : la grille a sa hauteur et ses
      // images dès le premier affichage ; app.js les remplace ensuite (même boîte).
      grille: derniers.map((j, i) => carteJeu(j, lang, t, { titreNiveau: 'h2', prioritaire: i < 2 })).join(''),
      apropos,
      plan,
    };
    await ecrire(dossierPublic, chemin, remplir(gabarits.accueil, valeurs, t, morceaux, 'gabarits/accueil.html'));
    pages.push({ chemin, lang, type: 'accueil', indexable: true, lastmod: lastmodMax(liste) });
  }

  // --- Page 404 (une par langue : Cloudflare sert la plus proche) -------------
  for (const lang of LANGUES) {
    const { t, morceaux } = outils(lang);
    const chemin = lang === 'fr' ? '/404.html' : `/${lang}/404.html`;
    const valeurs = {
      lang: HREFLANG[lang],
      tete: tete({ lang, titre: t('page.introuvableDocument'), description: t('page.introuvableTexte'), canonique: absolue(urlAccueil(lang)), indexable: false, alternatives: {}, image: absolue(`/${IMAGE_SITE}`), imageAlt: NOM_DU_SITE }),
      accueil: urlAccueil(lang),
      langues: '',
      categories: categoriesDe[lang].filter((c) => c.famille === 'age').map((c) => puceCategorie(c.famille, c.id, lang, t)).join(''),
    };
    const fichier = path.join(dossierPublic, chemin.replace(/^\//, ''));
    await mkdir(path.dirname(fichier), { recursive: true });
    await writeFile(fichier, remplir(gabarits.introuvable, valeurs, t, morceaux, 'gabarits/introuvable.html'), 'utf8');
  }

  // --- Pages légales (français et anglais) -----------------------------------
  // Les autres langues y mènent par le pied de page (version anglaise).
  const legal = await lireJson(path.join(dossierGabarits, 'textes', 'legal.json'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(legal.maj))) throw new Error('gabarits/textes/legal.json : « maj » doit être une date AAAA-MM-JJ');
  for (const page of PAGES_LEGALES) {
    const alternatives = Object.fromEntries(LANGUES_LEGALES.map((l) => [l, absolue(urlLegale(page, l))]));
    for (const lang of LANGUES_LEGALES) {
      const { t, morceaux } = outils(lang);
      const textes = legal.pages?.[page]?.[lang];
      if (!textes?.h1 || !textes.titre || !textes.description) throw new Error(`gabarits/textes/legal.json : textes de « ${page} » (${lang}) incomplets (h1, titre, description)`);
      const contenu = await readFile(path.join(dossierGabarits, 'legal', `${page}.${lang}.html`), 'utf8');
      const chemin = urlLegale(page, lang);
      const canonique = absolue(chemin);
      const fil = ariane([{ nom: t('page.accueil'), chemin: urlAccueil(lang) }, { nom: textes.h1, chemin }], t);
      const date = new Intl.DateTimeFormat(HREFLANG[lang], { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${legal.maj}T12:00:00Z`));
      const valeurs = {
        lang: HREFLANG[lang],
        tete: tete({ lang, titre: textes.titre, description: textes.description, canonique, indexable: true, alternatives, image: absolue(`/${IMAGE_SITE}`), imageAlt: NOM_DU_SITE, donnees: [fil.donnees] }),
        accueil: urlAccueil(lang),
        langues: liensLangues(lang, alternatives, t),
        ariane: fil.html,
        h1: textes.h1,
        maj: t('legal.maj', { date }),
        // Contenu écrit à la main dans gabarits/legal/ (HTML de confiance, versionné).
        contenu: contenu.trim(),
        autres: PAGES_LEGALES.filter((p) => p !== page)
          .map((p) => `<li><a href="${echapper(urlLegale(p, lang))}">${echapper(legal.pages[p][lang].h1)}</a></li>`).join(''),
      };
      await ecrire(dossierPublic, chemin, remplir(gabarits.legal, valeurs, t, morceaux, 'gabarits/legal.html'));
      pages.push({ chemin, lang, type: 'legal', indexable: true, lastmod: legal.maj });
    }
  }

  // --- Formulaire public de demandes (5 langues, non indexé) -------------------
  // Proposer un jeu, signaler un bug, demander une modification : public/proposer.js
  // l'anime et envoie à /api/demandes. Les messages du script (clés « proposer.* »)
  // sont écrits dans la page, dans sa langue.
  const alternativesProposer = Object.fromEntries(LANGUES.map((l) => [l, absolue(urlProposer(l))]));
  for (const lang of LANGUES) {
    const { t, morceaux } = outils(lang);
    const chemin = urlProposer(lang);
    const limites = { min: TITRE_MIN, max: TITRE_MAX };
    const limitesDescription = { min: DESCRIPTION_MIN, max: DESCRIPTION_MAX };
    // « profil.pseudoDefaut » : nom d'un joueur sans pseudo dans la ligne « Envoyé en tant que … ».
    const textes = Object.fromEntries(Object.keys(dicos.fr).filter((cle) => cle.startsWith('proposer.') || cle === 'profil.pseudoDefaut').map((cle) => [cle, t(cle)]));
    const fil = ariane([{ nom: t('page.accueil'), chemin: urlAccueil(lang) }, { nom: t('proposer.h1'), chemin }], t);
    const valeurs = {
      lang: HREFLANG[lang],
      code_langue: lang,
      tete: tete({ lang, titre: t('proposer.titreDocument'), description: t('proposer.meta'), canonique: absolue(chemin), indexable: false, alternatives: alternativesProposer, image: absolue(`/${IMAGE_SITE}`), imageAlt: NOM_DU_SITE }),
      accueil: urlAccueil(lang),
      langues: liensLangues(lang, alternativesProposer, t),
      ariane: fil.html,
      aide_titre: t('proposer.titreAide', limites),
      aide_description: t('proposer.descriptionAide', limitesDescription),
      titre_min: TITRE_MIN,
      titre_max: TITRE_MAX,
      description_max: DESCRIPTION_MAX,
      textes: JSON.stringify(textes).replace(/</g, '\\u003c'),
    };
    await ecrire(dossierPublic, chemin, remplir(gabarits.proposer, valeurs, t, morceaux, 'gabarits/proposer.html'));
  }

  // --- Profil joueur, classement et amis (5 langues, non indexés) -------------
  // Pages remplies dans le navigateur (public/profil-page.js, public/classement.js,
  // public/amis-page.js) d'après le profil gardé sur l'appareil et l'API ;
  // docs/cadrage-fidelisation.md, docs/consigne-amis.md.
  for (const [nomPage, url, cleTitre] of [['profil', urlProfil, 'profil.h1'], ['classement', urlClassement, 'classement.titre'], ['amis', urlAmis, 'amis.h1']]) {
    const alternativesPage = Object.fromEntries(LANGUES.map((l) => [l, absolue(url(l))]));
    for (const lang of LANGUES) {
      const { t, morceaux } = outils(lang);
      const chemin = url(lang);
      const fil = ariane([{ nom: t('page.accueil'), chemin: urlAccueil(lang) }, { nom: t(cleTitre), chemin }], t);
      const valeurs = {
        lang: HREFLANG[lang],
        code_langue: lang,
        tete: tete({ lang, titre: t(`${nomPage}.titreDocument`), description: t(`${nomPage}.meta`), canonique: absolue(chemin), indexable: false, alternatives: alternativesPage, image: absolue(`/${IMAGE_SITE}`), imageAlt: NOM_DU_SITE }),
        accueil: urlAccueil(lang),
        profil: urlProfil(lang),
        classement: urlClassement(lang),
        amis: urlAmis(lang),
        langues: liensLangues(lang, alternativesPage, t),
        ariane: fil.html,
      };
      await ecrire(dossierPublic, chemin, remplir(gabarits[nomPage], valeurs, t, morceaux, `gabarits/${nomPage}.html`));
    }
  }

  // --- Sitemap et robots.txt --------------------------------------------------
  const indexables = pages.filter((p) => p.indexable);
  // Fiches des jeux : leur jaquette (Google Images) quand c'est une image matricielle.
  const lignes = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'];
  for (const p of indexables) {
    const image = p.image ? `<image:image><image:loc>${echapper(p.image)}</image:loc></image:image>` : '';
    lignes.push(`  <url><loc>${echapper(absolue(p.chemin))}</loc><lastmod>${p.lastmod}</lastmod>${image}</url>`);
  }
  lignes.push('</urlset>');
  if (indexables.length > 45000) avertir(`sitemap : ${indexables.length} adresses ; au-delà de 50 000, il faudra un index de sitemaps`);
  await writeFile(path.join(dossierPublic, 'sitemap.xml'), `${lignes.join('\n')}\n`, 'utf8');
  // /api/ est fermé aux robots (quota d'appels), sauf les deux lectures dont
  // l'accueil a besoin pour s'afficher normalement quand Google le rend.
  await writeFile(path.join(dossierPublic, 'robots.txt'),
    `User-agent: *\nAllow: /\nAllow: /api/scores\nAllow: /api/tendances\nDisallow: /api/\nDisallow: /idees/\n\nSitemap: ${adresseDuSite()}sitemap.xml\n`, 'utf8');
  // Le formulaire /proposer/ n'est pas fermé aux robots : son « noindex » doit pouvoir être lu.

  // --- Redirections des catégories retirées (Cloudflare Pages : _redirects) ---
  // Chaque ancienne page de catégorie, dans chaque langue, avec et sans « / »
  // final, mène en 301, en un seul saut, à la catégorie la plus proche dans la
  // même langue (jamais à l'accueil : Google y voit une 404 déguisée).
  // Destination : DESTINATIONS_ANCIENNES s'il y en a une (autre famille), sinon
  // le remplaçant de ANCIENS_IDS ; « autre » n'a jamais eu de page : aucune
  // règle. Les tranches d'âge retirées (ANCIENNES_TRANCHES) aussi. Une
  // destination absente dans une langue (catégorie sans jeu) : pas de règle,
  // avec un avertissement.
  const redirections = [];
  const retirees = [
    ...Object.entries(ANCIENS_IDS).map(([famille, anciens]) => [famille, Object.entries(anciens)]),
    ['age', Object.entries(ANCIENNES_TRANCHES)],
  ];
  for (const [famille, paires] of retirees) {
    for (const [ancien, nouveau] of paires) {
      const [familleCible, idCible] = DESTINATIONS_ANCIENNES[`${famille}:${ancien}`] || [famille, nouveau];
      if (idCible === ID_AUTRE) continue;
      for (const lang of LANGUES) {
        if (!categorieExiste(familleCible, idCible, lang)) {
          avertir(`redirection de l'ancienne catégorie ${famille}:${ancien} (${lang}) : ${familleCible}:${idCible} n'a pas de page, règle non écrite`);
          continue;
        }
        const cible = urlCategorie(familleCible, idCible, lang);
        const source = urlCategorie(famille, ancien, lang, { ancienne: true });
        redirections.push(`${source} ${cible} 301`, `${source.replace(/\/$/, '')} ${cible} 301`);
      }
    }
  }

  // Catégories actuelles dont l'adresse a changé avec les slugs traduits
  // (/en/worlds/animaux/ → /en/worlds/animals/), avec et sans « / » final.
  for (const lang of LANGUES) {
    for (const c of categoriesDe[lang]) {
      const avant = urlCategorie(c.famille, c.id, lang, { ancienne: true });
      const apres = urlCategorie(c.famille, c.id, lang);
      if (avant !== apres) redirections.push(`${avant} ${apres} 301`, `${avant.replace(/\/$/, '')} ${apres} 301`);
    }
  }

  // Fiches des jeux : ancienne adresse avec l'identifiant (/en/games/<id>/) et
  // anciens slugs ("anciens_slugs" de game.json) → adresse du slug actuel. Forme
  // avec « / » seulement : c'est la seule que les pages et le sitemap ont publiée
  // (2 000 règles fixes au plus sur Cloudflare Pages).
  const pagesPubliees = new Set(pages.map((p) => p.chemin));
  for (const jeu of jeux) {
    for (const lang of languesDuJeu(jeu.fiche).filter((l) => l !== 'fr')) {
      const apres = urlJeu(jeu, lang);
      const anciens = Array.isArray(jeu.fiche.anciens_slugs?.[lang]) ? jeu.fiche.anciens_slugs[lang] : [];
      for (const avant of new Set([urlJeu(jeu.id, lang), ...anciens.map((s) => urlJeu(String(s), lang))])) {
        if (avant === apres) continue;
        if (pagesPubliees.has(avant)) { avertir(`${jeu.id} : l'ancienne adresse ${avant} est la page d'un autre jeu, pas de redirection`); continue; }
        redirections.push(`${avant} ${apres} 301`);
      }
    }
  }
  if (redirections.length > MAX_REDIRECTIONS) throw new Error(`_redirects : ${redirections.length} règles (Cloudflare Pages en accepte ${MAX_REDIRECTIONS}) : passer à des règles par motif ou à des « Bulk Redirects » Cloudflare`);
  if (redirections.length > ALERTE_REDIRECTIONS) avertir(`_redirects : ${redirections.length} règles sur ${MAX_REDIRECTIONS} permises par Cloudflare Pages`);
  await writeFile(path.join(dossierPublic, '_redirects'),
    `# Fichier généré par scripts/pages-seo.mjs (ne pas modifier) : anciennes adresses des catégories et des fiches.\n${redirections.join('\n')}\n`, 'utf8');

  // --- Nombre de fichiers publiés (limite Cloudflare Pages) -------------------
  const fichiers = await compterFichiers(dossierPublic);
  if (fichiers >= MAX_FICHIERS) throw new Error(`${fichiers} fichiers dans public/ : trop près de la limite de 20 000 de Cloudflare Pages (voir CLAUDE.md, section 3 : stockage R2)`);
  if (fichiers >= ALERTE_FICHIERS) avertir(`${fichiers} fichiers dans public/ : la limite de 20 000 de Cloudflare Pages approche (prévoir R2)`);

  return { pages, avertissements, fichiers };
}

export { IDS_GENRES, IDS_UNIVERS };
