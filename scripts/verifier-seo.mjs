#!/usr/bin/env node
// ==========================================================================
// verifier-seo.mjs — contrôle du référencement de tout le site (relançable)
//
//   node scripts/verifier-seo.mjs                  construit le site, puis contrôle tout
//   node scripts/verifier-seo.mjs <id> [<id>…]     idem, mais seules les erreurs qui
//                                                  touchent ces jeux bloquent (pull request
//                                                  d'un jeu) ; les autres deviennent « attention »
//   options :
//     --sans-build           contrôle public/ tel quel (le build vient d'être fait)
//     --en-ligne [adresse]   ajoute des contrôles HTTP du site publié (par défaut :
//                            SITE_URL ou https://freemicrogames.com/)
//     --echantillon N        en ligne : N adresses du sitemap au plus (défaut : toutes)
//     --json <fichier>       écrit aussi le rapport en JSON (ex. dans captures/)
//
// Ce qui est contrôlé (HTML tel qu'il est publié, sans exécuter de JavaScript) :
//   1. textes des jeux (scripts/regles-seo.mjs) et des catégories ;
//   2. chaque page indexable : <title> 50-60 caractères, meta description
//      140-160, un seul H1, viewport, <html lang>, canonical (absolue, égale à
//      l'adresse de la page), hreflang réciproques, Open Graph, JSON-LD lisible
//      (VideoGame et BreadcrumbList pour un jeu), images avec alt, width, height ;
//   3. fiche d'un jeu : bloc de texte de 150 à 300 mots, bouton Jouer, 4 à 6
//      jeux similaires ; catégorie : introduction et liste de jeux ;
//   4. titres et descriptions uniques, pas de phrase recopiée d'un jeu à l'autre ;
//   5. liens internes : chaque href/src mène à un fichier publié, sans adresse
//      redirigée (.html, /index.html, dossier sans « / » final) ;
//   6. sitemap.xml (pages indexables seulement, adresses finales, lastmod) et robots.txt ;
//   7. pages orphelines et profondeur : chaque page indexable reçoit un lien d'une
//      autre page indexable, et chaque jeu est à 3 clics au plus de l'accueil ;
//   8. nombre de fichiers publiés (limite de 20 000 de Cloudflare Pages).
// Pages exclues des contrôles d'indexation (mais leurs liens sont vérifiés) :
// celles en noindex (lanceur, 404, catégories de moins de
// 3 jeux), et la page privée /idees/.
//
// Sortie : « ERREUR : <page ou jeu> : <message> », « attention : … », puis un bilan.
// Code de sortie : 0 = bon (attentions permises), 1 = erreurs, 2 = panne de l'outil.
// Aucune dépendance : Node.js 18 ou plus.
// ==========================================================================

import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(RACINE, 'public');

const BORNES_TITRE = [50, 60];
const BORNES_DESCRIPTION = [140, 160];
const BLOC_MOTS = [150, 300];
const SIMILAIRES = [4, 6];
const INTRO_MOTS_MIN = 80;
const PROFONDEUR_MAX = 3;
const SUITE_ERREUR = 10;     // mots identiques à la suite entre deux jeux : texte recopié
const SUITE_ATTENTION = 8;
const POIDS_ATTENTION = 100 * 1024;
const POIDS_ERREUR = 500 * 1024;

// --------------------------------------------------------------------------
// Arguments
// --------------------------------------------------------------------------

const args = process.argv.slice(2);
const valeurOption = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const SANS_BUILD = args.includes('--sans-build');
const EN_LIGNE = args.includes('--en-ligne');
// L'adresse après --en-ligne est facultative : un identifiant de jeu n'en est pas une.
const ADRESSE_EN_LIGNE = /^https?:\/\//i.test(valeurOption('--en-ligne') || '') ? valeurOption('--en-ligne') : null;
const ECHANTILLON = Number(valeurOption('--echantillon')) || 0;
const FICHIER_JSON = valeurOption('--json');
const valeursOptions = new Set([ADRESSE_EN_LIGNE, valeurOption('--echantillon'), FICHIER_JSON].filter(Boolean));
const IDS = args.filter((a) => !a.startsWith('--') && !valeursOptions.has(a));

// --------------------------------------------------------------------------
// Rapport
// --------------------------------------------------------------------------

const rapport = [];
/** jeu : id du jeu concerné (en mode « <id> », seules ses erreurs bloquent). */
function signaler(niveau, sujet, message, jeu = null) {
  let n = niveau;
  if (n === 'erreur' && IDS.length && !(jeu && IDS.includes(jeu))) n = 'attention';
  rapport.push({ niveau: n, sujet, message, jeu });
}
const erreur = (sujet, message, jeu) => signaler('erreur', sujet, message, jeu);
const attention = (sujet, message, jeu) => signaler('attention', sujet, message, jeu);

function panne(message) {
  console.error(`Panne de l'outil de vérification : ${message}`);
  process.exit(2);
}

// --------------------------------------------------------------------------
// Lecture du HTML (pages générées et pages fixes du site : format connu)
// --------------------------------------------------------------------------

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decoder(texte) {
  return String(texte ?? '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (tout, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITES[e.toLowerCase()] ?? tout;
  });
}

function attributs(balise) {
  const a = {};
  for (const m of balise.matchAll(/([\w:-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    if (m.index === 0) continue; // nom de la balise
    a[m[1].toLowerCase()] = decoder(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return a;
}

/** Toutes les balises ouvrantes <nom …> avec leurs attributs. */
function balises(html, nom) {
  return [...html.matchAll(new RegExp(`<${nom}\\b[^>]*>`, 'gi'))].map((m) => ({ ...attributs(m[0]), _index: m.index }));
}

/** Contenu des éléments <nom>…</nom> (non imbriqués). */
function contenus(html, nom) {
  return [...html.matchAll(new RegExp(`<${nom}\\b[^>]*>([\\s\\S]*?)</${nom}>`, 'gi'))].map((m) => m[1]);
}

const texteDe = (fragment) => decoder(String(fragment).replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const longueur = (t) => [...String(t)].length;

function compterMots(texte, lang) {
  try {
    let n = 0;
    for (const s of new Intl.Segmenter(lang, { granularity: 'word' }).segment(texte)) if (s.isWordLike) n++;
    return n;
  } catch {
    return texte.split(/\s+/).filter(Boolean).length;
  }
}

function mots(texte, lang) {
  try {
    return [...new Intl.Segmenter(lang, { granularity: 'word' }).segment(texte.toLowerCase())].filter((s) => s.isWordLike).map((s) => s.segment);
  } catch {
    return texte.toLowerCase().split(/\W+/).filter(Boolean);
  }
}

// --------------------------------------------------------------------------
// Adresses ↔ fichiers de public/ (règles de Cloudflare Pages)
// --------------------------------------------------------------------------

function estFichier(f) {
  try { return statSync(f).isFile(); } catch { return false; }
}
function estDossier(f) {
  try { return statSync(f).isDirectory(); } catch { return false; }
}

/** Chemin d'adresse (« /jeux/x/ ») → fichier publié, ou { redirige } / null. */
function resoudre(chemin) {
  let p;
  try { p = decodeURIComponent(chemin.split(/[?#]/)[0]); } catch { return null; }
  if (p.endsWith('/index.html')) return { redirige: `${p.slice(0, -'index.html'.length)}` };
  if (p.endsWith('.html') && p !== '/404.html' && !/^\/(?:en|es|pt|de)\/404\.html$/.test(p)) return { redirige: p.slice(0, -5) };
  const local = path.join(PUBLIC, p);
  if (!local.startsWith(PUBLIC)) return null;
  if (p.endsWith('/')) return estFichier(path.join(local, 'index.html')) ? { fichier: path.join(local, 'index.html') } : null;
  if (estFichier(local)) return { fichier: local };
  if (estDossier(local) && estFichier(path.join(local, 'index.html'))) return { redirige: `${p}/` };
  if (!path.extname(p) && estFichier(`${local}.html`)) return { fichier: `${local}.html` };
  return null;
}

/** Fichier de public/ → chemin d'adresse servi par Cloudflare. */
function adresseDe(fichier) {
  const rel = path.relative(PUBLIC, fichier).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  if (/(^|\/)404\.html$/.test(rel)) return `/${rel}`;
  return `/${rel.replace(/\.html$/, '')}`;
}

async function fichiersHtml(dossier, liste = []) {
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    const chemin = path.join(dossier, e.name);
    if (e.isDirectory()) {
      if (dossier === PUBLIC && (e.name === 'games' || e.name === 'idees')) continue;
      await fichiersHtml(chemin, liste);
    } else if (e.name.endsWith('.html')) {
      liste.push(chemin);
    }
  }
  return liste;
}

async function compterFichiers(dossier) {
  let n = 0;
  for (const e of await readdir(dossier, { withFileTypes: true })) n += e.isDirectory() ? await compterFichiers(path.join(dossier, e.name)) : 1;
  return n;
}

// --------------------------------------------------------------------------
// Programme
// --------------------------------------------------------------------------

async function principal() {
  // Modules du site (mêmes règles et mêmes adresses que le générateur).
  let regles, pagesSeo, chemins, taxonomie;
  try {
    regles = await import(pathToFileURL(path.join(RACINE, 'scripts', 'regles-seo.mjs')).href);
    pagesSeo = await import(pathToFileURL(path.join(RACINE, 'scripts', 'pages-seo.mjs')).href);
    chemins = await import(pathToFileURL(path.join(RACINE, 'public', 'chemins.js')).href);
    taxonomie = await import(pathToFileURL(path.join(RACINE, 'public', 'taxonomie.js')).href);
  } catch (e) {
    panne(`modules illisibles (${e.message})`);
  }
  const SITE = pagesSeo.adresseDuSite();
  const { LANGUES, HREFLANG } = chemins;

  // 0. Construction du site.
  if (!SANS_BUILD) {
    const build = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'build-catalog.mjs')], { encoding: 'utf8' });
    if (build.status !== 0) panne(`le build a échoué :\n${build.stdout || ''}${build.stderr || ''}`);
  }
  if (!existsSync(path.join(PUBLIC, 'catalog.json')) || !existsSync(path.join(PUBLIC, 'sitemap.xml'))) panne('public/ n\'est pas construit (lancer node scripts/build-catalog.mjs)');

  let catalogue;
  try {
    catalogue = JSON.parse(await readFile(path.join(PUBLIC, 'catalog.json'), 'utf8'));
  } catch (e) {
    panne(`catalog.json illisible (${e.message})`);
  }
  const jeuxPublies = new Map((catalogue.games || []).map((j) => [j.id, j]));
  const inconnus = IDS.filter((id) => !existsSync(path.join(RACINE, 'games', id, 'game.json')));
  if (inconnus.length) panne(`jeu(x) introuvable(s) dans games/ : ${inconnus.join(', ')}`);
  for (const id of IDS) if (!jeuxPublies.has(id)) erreur(id, 'jeu absent du catalogue construit (refusé par le build : voir son journal)', id);

  // 1. Textes des jeux et des catégories.
  const fiches = [];
  for (const nom of (await readdir(path.join(RACINE, 'games'), { withFileTypes: true })).filter((e) => e.isDirectory() && !/^[._]/.test(e.name)).map((e) => e.name)) {
    try {
      fiches.push({ id: nom, ...JSON.parse((await readFile(path.join(RACINE, 'games', nom, 'game.json'), 'utf8')).replace(/^﻿/, '')) });
    } catch (e) {
      erreur(nom, `game.json illisible (${e.message})`, nom);
    }
  }
  const ficheDe = new Map(fiches.map((f) => [f.id, f]));
  for (const f of fiches) {
    for (const p of regles.problemesChamps(f)) signaler(p.niveau, f.id, `${p.lang} : ${p.message}`, f.id);
  }
  for (const p of regles.doublonsEntreJeux(fiches)) erreur(p.id, `${p.lang} : ${p.message}`, p.id);
  const clesCat = regles.clesCategories(taxonomie);
  for (const lang of LANGUES) {
    let textes = null;
    try { textes = JSON.parse((await readFile(path.join(RACINE, 'gabarits', 'textes', `categories.${lang}.json`), 'utf8')).replace(/^﻿/, '')); } catch { /* signalé ci-dessous */ }
    for (const p of regles.problemesCategories(textes, lang, clesCat)) signaler(p.niveau, `catégories ${lang}`, `${p.cle} : ${p.message}`);
  }

  // Phrases recopiées d'un jeu à l'autre, langue par langue. On ne compte que les
  // mots de 3 lettres ou plus (les touches « z q s d », « w a s d »… ne comptent
  // pas). Présentation : une suite de SUITE_ERREUR mots identiques = erreur, de
  // SUITE_ATTENTION mots = attention. Règles : les commandes se décrivent souvent
  // pareil d'un jeu à l'autre, une suite de SUITE_ERREUR mots = attention seulement.
  for (const lang of LANGUES) {
    const suitesDe = (champ, taille) => {
      const suites = new Map(); // suite de mots → jeux qui la contiennent
      for (const f of fiches) {
        const m = mots(regles.textesLangue(f, lang)[champ], lang).filter((x) => x.length >= 3 && !/^\d+$/.test(x));
        for (let i = 0; i + taille <= m.length; i++) {
          const cle = m.slice(i, i + taille).join(' ');
          if (!suites.has(cle)) suites.set(cle, new Set());
          suites.get(cle).add(f.id);
        }
      }
      return suites;
    };
    const dejaSignales = new Set();
    for (const [champ, taille, signalerSuite] of [
      ['presentation', SUITE_ERREUR, erreur], ['presentation', SUITE_ATTENTION, attention], ['regles', SUITE_ERREUR, attention],
    ]) {
      for (const [suite, jeux] of suitesDe(champ, taille)) {
        if (jeux.size < 2) continue;
        const liste = [...jeux].sort();
        if (dejaSignales.has(liste.join('|'))) continue;
        dejaSignales.add(liste.join('|'));
        for (const id of liste) {
          signalerSuite(id, `${lang} : texte commun avec ${liste.filter((x) => x !== id).join(', ')} (« ${suite}… ») : chaque jeu doit avoir son propre texte`, id);
        }
      }
    }
  }

  // 2. Pages HTML publiées.
  const fichiers = await fichiersHtml(PUBLIC);
  const pages = new Map(); // adresse → infos
  for (const fichier of fichiers) {
    const html = await readFile(fichier, 'utf8');
    const adresse = adresseDe(fichier);
    const tete = (/<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html) || [])[1] || '';
    const metas = balises(tete, 'meta');
    const robots = (metas.find((m) => m.name === 'robots')?.content || '').toLowerCase();
    const est404 = /404\.html$/.test(adresse);
    const prive = adresse.startsWith('/idees/');
    pages.set(adresse, {
      adresse, fichier, html, tete, metas, poids: Buffer.byteLength(html),
      indexable: !robots.includes('noindex') && !est404 && !prive,
      liens: balises(html, 'a').map((a) => a.href).filter((h) => h !== undefined),
      jeu: null, type: 'autre',
    });
  }

  // Type de chaque page (jeu, catégorie, accueil), d'après les adresses de chemins.js.
  for (const lang of LANGUES) {
    const accueil = pages.get(chemins.urlAccueil(lang));
    if (accueil) accueil.type = 'accueil';
    else erreur(chemins.urlAccueil(lang), `accueil ${lang} absent`);
  }
  for (const [id, jeu] of jeuxPublies) {
    const langues = regles.languesDuJeu(ficheDe.get(id) || jeu);
    for (const lang of langues) {
      const p = pages.get(chemins.urlJeu(id, lang));
      if (!p) { erreur(chemins.urlJeu(id, lang), `page du jeu absente (${lang})`, id); continue; }
      Object.assign(p, { type: 'jeu', jeu: id, lang });
    }
  }
  // « autre » n'a jamais de page (public/taxonomie.js) : une page à son adresse serait une erreur.
  const FAMILLES = [
    ...taxonomie.IDS_GENRES.filter((id) => id !== taxonomie.ID_AUTRE).map((id) => ['genre', id]),
    ...taxonomie.IDS_UNIVERS.filter((id) => id !== taxonomie.ID_AUTRE).map((id) => ['univers', id]),
    ...taxonomie.TRANCHES_AGE.map((t) => ['age', t.id]),
  ];
  for (const lang of LANGUES) {
    for (const [famille, id] of FAMILLES) {
      const p = pages.get(chemins.urlCategorie(famille, id, lang));
      if (p) Object.assign(p, { type: 'categorie', famille, idCategorie: id, lang });
      const membres = [...jeuxPublies.values()].filter((j) => regles.languesDuJeu(ficheDe.get(j.id) || j).includes(lang) && (
        famille === 'genre' ? (j.genre === id || (j.genres_secondaires || []).includes(id))
          : famille === 'univers' ? (j.univers || []).includes(id)
            : taxonomie.trancheDeAge(j.ages) === id));
      if (membres.length && !p) erreur(chemins.urlCategorie(famille, id, lang), `page de catégorie absente (${membres.length} jeu(x))`);
      if (!membres.length && p) erreur(p.adresse, 'page de catégorie sans aucun jeu');
    }
  }
  for (const p of pages.values()) {
    if (p.type === 'autre' && /^\/(?:en\/|es\/|pt\/|de\/)?(?:jeux|games|juegos|jogos|spiele)\//.test(p.adresse)) erreur(p.adresse, 'page d\'un jeu qui n\'est pas (ou plus) au catalogue');
  }
  for (const lang of LANGUES) {
    for (const famille of ['genre', 'univers']) {
      const adresse = chemins.urlCategorie(famille, taxonomie.ID_AUTRE, lang);
      if (pages.has(adresse)) erreur(adresse, '« autre » ne doit pas avoir de page de catégorie');
    }
  }

  // Contrôles de chaque page.
  const absolueVersChemin = (href) => {
    try {
      const u = new URL(href);
      return u.origin === new URL(SITE).origin ? u.pathname + u.search : null;
    } catch { return null; }
  };
  // Lien d'une page (relatif ou absolu) → chemin sur le site, ou null (lien illisible ou externe).
  const cheminDuLien = (href, adressePage) => {
    try { return absolueVersChemin(new URL(href, new URL(adressePage.replace(/^\//, ''), SITE)).href); } catch { return null; }
  };
  for (const p of pages.values()) {
    const jeu = p.jeu;
    const sujet = p.adresse;
    if (p.poids > POIDS_ERREUR) erreur(sujet, `page de ${Math.round(p.poids / 1024)} Ko (500 Ko au plus)`, jeu);
    else if (p.poids > POIDS_ATTENTION) attention(sujet, `page de ${Math.round(p.poids / 1024)} Ko`, jeu);

    // Images : alt, width et height.
    for (const img of balises(p.html, 'img')) {
      if (img.alt === undefined) erreur(sujet, `image sans attribut alt (${img.src})`, jeu);
      else if (!img.alt.trim() && p.indexable) erreur(sujet, `image avec un alt vide (${img.src})`, jeu);
      if (!img.width || !img.height) attention(sujet, `image sans width/height (${img.src})`, jeu);
    }
    // Scripts bloquants dans <head>.
    for (const s of balises(p.tete, 'script')) {
      if (s.src && s.defer === undefined && s.async === undefined && s.type !== 'module') erreur(sujet, `script bloquant dans <head> (${s.src}) : ajouter defer`, jeu);
    }
    if (!p.metas.some((m) => m.name === 'viewport' && /width=device-width/.test(m.content || ''))) erreur(sujet, 'meta viewport absente', jeu);

    if (!p.indexable) continue;

    // Titre, description, H1, langue.
    const titres = contenus(p.tete, 'title').map(texteDe);
    if (titres.length !== 1) erreur(sujet, `${titres.length} balise(s) <title> (une seule attendue)`, jeu);
    p.titre = titres[0] || '';
    const n = longueur(p.titre);
    if (n < BORNES_TITRE[0] || n > BORNES_TITRE[1]) erreur(sujet, `<title> de ${n} caractères (attendu : ${BORNES_TITRE[0]} à ${BORNES_TITRE[1]}) : « ${p.titre} »`, jeu);
    const descriptions = p.metas.filter((m) => m.name === 'description');
    if (descriptions.length !== 1) erreur(sujet, `${descriptions.length} meta description (une seule attendue)`, jeu);
    p.description = (descriptions[0]?.content || '').trim();
    const d = longueur(p.description);
    if (d < BORNES_DESCRIPTION[0] || d > BORNES_DESCRIPTION[1]) erreur(sujet, `meta description de ${d} caractères (attendu : ${BORNES_DESCRIPTION[0]} à ${BORNES_DESCRIPTION[1]})`, jeu);
    const h1 = contenus(p.html, 'h1').map(texteDe);
    if (h1.length !== 1) erreur(sujet, `${h1.length} titre(s) H1 (un seul attendu)`, jeu);
    else if (!h1[0]) erreur(sujet, 'H1 vide', jeu);
    const langPage = (/<html\b[^>]*\blang="([^"]+)"/i.exec(p.html) || [])[1];
    const langAttendue = HREFLANG[/^\/(en|es|pt|de)\//.exec(p.adresse)?.[1] || 'fr'];
    if (langPage !== langAttendue) erreur(sujet, `<html lang="${langPage || ''}"> (attendu : « ${langAttendue} »)`, jeu);

    // Canonical.
    const canoniques = balises(p.tete, 'link').filter((l) => (l.rel || '').toLowerCase() === 'canonical');
    const attendue = new URL(p.adresse.replace(/^\//, ''), SITE).href;
    if (canoniques.length !== 1) erreur(sujet, `${canoniques.length} balise(s) canonical (une seule attendue)`, jeu);
    else if (canoniques[0].href !== attendue) erreur(sujet, `canonical « ${canoniques[0].href} » (attendu : « ${attendue} »)`, jeu);
    p.canonique = canoniques[0]?.href;

    // hreflang : cibles existantes et réciproques.
    p.alternatives = balises(p.tete, 'link').filter((l) => (l.rel || '').toLowerCase() === 'alternate' && l.hreflang);
    if (p.alternatives.length) {
      const codes = p.alternatives.map((l) => l.hreflang);
      if (!codes.includes('x-default')) erreur(sujet, 'hreflang x-default absent', jeu);
      if (!codes.includes(langAttendue)) erreur(sujet, `hreflang de la page elle-même (${langAttendue}) absent`, jeu);
    }

    // Open Graph.
    const og = (prop) => p.metas.find((m) => m.property === prop)?.content;
    for (const prop of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'og:type', 'og:locale']) {
      if (!og(prop)) erreur(sujet, `balise ${prop} absente`, jeu);
    }
    if (og('og:url') && og('og:url') !== attendue) erreur(sujet, 'og:url différent de la canonical', jeu);
    if (!p.metas.some((m) => m.name === 'twitter:card')) attention(sujet, 'balise twitter:card absente', jeu);
    const image = og('og:image');
    if (image) {
      const chemin = absolueVersChemin(image);
      if (!chemin) erreur(sujet, `og:image hors du site ou relative (${image})`, jeu);
      else if (!resoudre(chemin)?.fichier) erreur(sujet, `og:image introuvable (${chemin})`, jeu);
      else if (/\.svg(?:\?|$)/i.test(chemin)) erreur(sujet, 'og:image en SVG (refusé par les réseaux sociaux)', jeu);
    }

    // Données structurées (JSON-LD).
    const blocs = [];
    for (const brut of [...p.html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])) {
      try { blocs.push(JSON.parse(brut)); } catch (e) { erreur(sujet, `JSON-LD illisible (${e.message})`, jeu); }
    }
    p.ldjson = blocs;
    const types = blocs.map((b) => b['@type']);
    if (JSON.stringify(blocs).match(/"(?:aggregateRating|review)"/)) erreur(sujet, 'JSON-LD : note ou avis (aggregateRating, review) interdits : rien ne doit être inventé', jeu);
    const fil = blocs.find((b) => b['@type'] === 'BreadcrumbList');
    if (fil) {
      const elements = fil.itemListElement || [];
      elements.forEach((e, i) => {
        if (e.position !== i + 1) erreur(sujet, `fil d'Ariane (JSON-LD) : position ${e.position} au lieu de ${i + 1}`, jeu);
        const c = absolueVersChemin(e.item);
        if (!c || !resoudre(c)?.fichier) erreur(sujet, `fil d'Ariane (JSON-LD) : page introuvable (${e.item})`, jeu);
      });
      if (elements.at(-1)?.item !== attendue) erreur(sujet, 'fil d\'Ariane (JSON-LD) : le dernier élément doit être la page elle-même', jeu);
      const visibles = (/<nav class="ariane"[\s\S]*?<\/nav>/.exec(p.html) || [''])[0];
      const nomsVisibles = contenus(visibles, 'li').map(texteDe);
      if (nomsVisibles.join(' › ') !== elements.map((e) => e.name).join(' › ')) erreur(sujet, 'fil d\'Ariane visible différent du JSON-LD', jeu);
    }

    // Selon le type de page.
    if (p.type === 'jeu') {
      const fiche = ficheDe.get(jeu) || {};
      const vg = blocs.find((b) => b['@type'] === 'VideoGame');
      if (!vg) erreur(sujet, 'JSON-LD VideoGame absent', jeu);
      else {
        for (const champ of ['name', 'description', 'image', 'url']) if (!vg[champ]) erreur(sujet, `JSON-LD VideoGame : « ${champ} » absent`, jeu);
        if (vg.url !== attendue) erreur(sujet, 'JSON-LD VideoGame : url différente de la canonical', jeu);
        if (vg.isAccessibleForFree !== true || String(vg.offers?.price) !== '0') erreur(sujet, 'JSON-LD VideoGame : gratuité (isAccessibleForFree, offers.price 0) absente', jeu);
        const age = regles.ageMinimum(fiche.ages);
        if (age !== null && vg.audience?.suggestedMinAge !== age) erreur(sujet, `JSON-LD VideoGame : âge (${vg.audience?.suggestedMinAge}) différent de game.json (${age})`, jeu);
      }
      const etapes = (fil?.itemListElement || []).length;
      if (etapes < 2 || etapes > 3) erreur(sujet, 'fil d\'Ariane Accueil › Catégorie › Jeu absent', jeu);
      else if (etapes === 2) attention(sujet, 'fil d\'Ariane sans catégorie (le jeu n\'est dans aucune catégorie)', jeu);
      const section = (/<section class="fiche-texte"[\s\S]*?<\/section>/.exec(p.html) || [''])[0];
      const motsBloc = compterMots(texteDe(section.replace(/<h2\b[\s\S]*?<\/h2>/gi, ' ')), p.lang);
      if (motsBloc < BLOC_MOTS[0] || motsBloc > BLOC_MOTS[1]) erreur(sujet, `bloc de texte de ${motsBloc} mots (attendu : ${BLOC_MOTS[0]} à ${BLOC_MOTS[1]})`, jeu);
      if (!p.liens.some((h) => h === chemins.urlLanceur(jeu, p.lang))) erreur(sujet, 'bouton « Jouer » vers le lanceur absent', jeu);
      const similaires = (/<section class="similaires"[\s\S]*?<\/section>/.exec(p.html) || [''])[0];
      const liensSim = [...new Set(balises(similaires, 'a').map((a) => a.href))];
      if (liensSim.length < SIMILAIRES[0] || liensSim.length > SIMILAIRES[1]) erreur(sujet, `${liensSim.length} jeu(x) similaire(s) (attendu : ${SIMILAIRES[0]} à ${SIMILAIRES[1]})`, jeu);
      if (liensSim.includes(p.adresse)) erreur(sujet, 'le jeu figure dans ses propres jeux similaires', jeu);
    } else if (p.type === 'categorie') {
      const intro = (/<div class="categorie-intro">([\s\S]*?)<\/div>/.exec(p.html) || [])[1] || '';
      const n2 = compterMots(texteDe(intro), p.lang);
      if (n2 < INTRO_MOTS_MIN) erreur(sujet, `introduction de ${n2} mots (${INTRO_MOTS_MIN} au moins)`);
      if (!types.includes('CollectionPage')) erreur(sujet, 'JSON-LD CollectionPage absent');
    } else if (p.type === 'accueil') {
      if (!types.includes('WebSite')) erreur(sujet, 'JSON-LD WebSite absent');
    }
  }

  // hreflang réciproques (sur les pages indexables).
  for (const p of pages.values()) {
    if (!p.indexable || !p.alternatives?.length) continue;
    for (const l of p.alternatives) {
      if (l.hreflang === 'x-default') continue;
      const c = absolueVersChemin(l.href);
      const cible = c && pages.get(c);
      if (!cible) { erreur(p.adresse, `hreflang ${l.hreflang} : page introuvable (${l.href})`, p.jeu); continue; }
      if (!cible.indexable) attention(p.adresse, `hreflang ${l.hreflang} vers une page non indexée (${c})`, p.jeu);
      else if (!cible.alternatives?.some((x) => absolueVersChemin(x.href) === p.adresse)) erreur(p.adresse, `hreflang ${l.hreflang} : ${c} ne renvoie pas vers cette page`, p.jeu);
    }
  }

  // 4. Titres et descriptions uniques entre pages indexables.
  for (const champ of ['titre', 'description']) {
    const vus = new Map();
    for (const p of pages.values()) {
      if (!p.indexable || !p[champ]) continue;
      const cle = p[champ].toLowerCase();
      if (vus.has(cle)) erreur(p.adresse, `${champ === 'titre' ? '<title>' : 'meta description'} identique à celle de ${vus.get(cle).adresse}`, p.jeu || vus.get(cle).jeu);
      else vus.set(cle, p);
    }
  }

  // 5. Liens internes et ressources (toutes les pages HTML, y compris les pages fixes).
  for (const p of pages.values()) {
    const refs = [
      ...p.liens.map((h) => ['lien', h]),
      ...balises(p.html, 'img').map((i) => ['image', i.src]),
      ...balises(p.html, 'script').filter((s) => s.src).map((s) => ['script', s.src]),
      ...balises(p.html, 'link').filter((l) => /stylesheet|icon|manifest|apple-touch-icon/.test(l.rel || '')).map((l) => ['ressource', l.href]),
    ];
    for (const [nature, href] of refs) {
      if (!href || href.startsWith('#') || /^(?:mailto|tel|javascript|data):/i.test(href)) continue;
      let u;
      try { u = new URL(href, new URL(p.adresse.replace(/^\//, ''), SITE)); } catch { erreur(p.adresse, `${nature} illisible (${href})`, p.jeu); continue; }
      if (u.origin !== new URL(SITE).origin) {
        if (p.type !== 'autre') erreur(p.adresse, `${nature} vers un autre site (${href})`, p.jeu);
        continue;
      }
      const r = resoudre(u.pathname);
      if (!r) erreur(p.adresse, `${nature} cassé : ${u.pathname} n'existe pas (404)`, p.jeu);
      else if (r.redirige) erreur(p.adresse, `${nature} vers une adresse redirigée (${u.pathname} → ${r.redirige})`, p.jeu);
      if (u.pathname === '/play' || u.pathname === '/play.html') {
        const id = u.searchParams.get('id');
        if (id && !jeuxPublies.has(id)) erreur(p.adresse, `lien vers un jeu inconnu (${id})`, p.jeu);
      }
    }
  }

  // 6. Sitemap et robots.txt.
  const sitemap = await readFile(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
  const entrees = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: decoder((/<loc>([\s\S]*?)<\/loc>/.exec(m[1]) || [])[1] || '').trim(),
    lastmod: ((/<lastmod>([\s\S]*?)<\/lastmod>/.exec(m[1]) || [])[1] || '').trim(),
  }));
  if (!/<urlset\b/.test(sitemap)) erreur('sitemap.xml', 'balise <urlset> absente');
  const dansSitemap = new Set();
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  for (const e of entrees) {
    const c = absolueVersChemin(e.loc);
    if (!c) { erreur('sitemap.xml', `adresse hors du site (${e.loc})`); continue; }
    if (dansSitemap.has(c)) erreur('sitemap.xml', `adresse en double (${c})`);
    dansSitemap.add(c);
    const p = pages.get(c);
    if (/\.html$|\?/.test(c)) erreur('sitemap.xml', `adresse redirigée ou avec paramètres (${c})`, p?.jeu);
    if (!p) erreur('sitemap.xml', `adresse sans page (${c})`);
    else if (!p.indexable) erreur('sitemap.xml', `page non indexée (noindex) dans le sitemap (${c})`, p.jeu);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.lastmod)) erreur('sitemap.xml', `lastmod absent ou mal écrit pour ${c}`, p?.jeu);
    else if (e.lastmod > demain) erreur('sitemap.xml', `lastmod dans le futur pour ${c}`, p?.jeu);
  }
  for (const p of pages.values()) if (p.indexable && !dansSitemap.has(p.adresse)) erreur(p.adresse, 'page indexable absente du sitemap', p.jeu);
  const robots = existsSync(path.join(PUBLIC, 'robots.txt')) ? await readFile(path.join(PUBLIC, 'robots.txt'), 'utf8') : '';
  if (!robots) erreur('robots.txt', 'fichier absent');
  if (!robots.includes(`Sitemap: ${SITE}sitemap.xml`)) erreur('robots.txt', `ligne « Sitemap: ${SITE}sitemap.xml » absente`);
  if (!/^Disallow:\s*\/api\/\s*$/m.test(robots)) erreur('robots.txt', 'ligne « Disallow: /api/ » absente');
  for (const m of robots.matchAll(/^Disallow:\s*(\S+)/gm)) {
    if (/^\/(?:$|jeux|games|genres|univers|ages|en|es|pt|de|assets|style\.css)/.test(m[1])) erreur('robots.txt', `« Disallow: ${m[1]} » empêche l'exploration de pages ou de ressources du site`);
  }

  // 7. Pages orphelines et profondeur (liens <a> du HTML, depuis l'accueil « / »).
  const entrants = new Map();
  for (const p of pages.values()) {
    if (!p.indexable) continue;
    for (const h of new Set(p.liens)) {
      const c = cheminDuLien(h, p.adresse);
      if (!c || c === p.adresse) continue;
      const cle = c.split('?')[0];
      if (!entrants.has(cle)) entrants.set(cle, new Set());
      entrants.get(cle).add(p.adresse);
    }
  }
  const profondeur = new Map([['/', 0]]);
  const file = ['/'];
  while (file.length) {
    const ici = file.shift();
    const p = pages.get(ici);
    if (!p) continue;
    for (const h of p.liens) {
      const c = cheminDuLien(h, ici)?.split('?')[0];
      if (!c || profondeur.has(c) || !pages.has(c)) continue;
      profondeur.set(c, profondeur.get(ici) + 1);
      file.push(c);
    }
  }
  for (const p of pages.values()) {
    if (!p.indexable || p.adresse === '/') continue;
    if (!entrants.get(p.adresse)?.size) erreur(p.adresse, 'page orpheline : aucune autre page indexable ne la lie', p.jeu);
    const prof = profondeur.get(p.adresse);
    if (prof === undefined) erreur(p.adresse, 'page inaccessible depuis l\'accueil en suivant les liens', p.jeu);
    else if (p.type === 'jeu' && prof > PROFONDEUR_MAX) erreur(p.adresse, `jeu à ${prof} clics de l'accueil (${PROFONDEUR_MAX} au plus)`, p.jeu);
  }

  // 8. Nombre de fichiers publiés.
  const nbFichiers = await compterFichiers(PUBLIC);
  if (nbFichiers >= pagesSeo.MAX_FICHIERS) erreur('public/', `${nbFichiers} fichiers (limite de Cloudflare Pages : 20 000)`);
  else if (nbFichiers >= pagesSeo.ALERTE_FICHIERS) attention('public/', `${nbFichiers} fichiers : la limite de 20 000 de Cloudflare Pages approche`);
  if (/pages\.dev/.test(SITE)) erreur('adresse du site', `${SITE} : canonical et sitemap visent pages.dev (en noindex) au lieu du domaine`);

  // Contrôles en ligne (facultatifs).
  if (EN_LIGNE) await controlerEnLigne({ entrees, jeuxPublies, chemins, SITE });

  // Bilan.
  const erreurs = rapport.filter((r) => r.niveau === 'erreur');
  const attentions = rapport.filter((r) => r.niveau === 'attention');
  for (const r of rapport) console.log(`${r.niveau === 'erreur' ? 'ERREUR' : 'attention'} : ${r.sujet} : ${r.message}`);
  const indexables = [...pages.values()].filter((p) => p.indexable).length;
  console.log(erreurs.length
    ? `\n${erreurs.length} erreur(s) à corriger${attentions.length ? `, ${attentions.length} attention(s)` : ''}.`
    : `\nRéférencement : tout est bon (${pages.size} pages, dont ${indexables} indexables ; ${jeuxPublies.size} jeux ; ${entrees.length} adresses dans le sitemap${attentions.length ? ` ; ${attentions.length} attention(s)` : ''}).`);
  if (FICHIER_JSON) {
    await mkdir(path.dirname(path.resolve(FICHIER_JSON)), { recursive: true });
    await writeFile(FICHIER_JSON, JSON.stringify({ site: SITE, ids: IDS, pages: pages.size, indexables, sitemap: entrees.length, fichiers: nbFichiers, problemes: rapport }, null, 2), 'utf8');
  }
  process.exit(erreurs.length ? 1 : 0);
}

// --------------------------------------------------------------------------
// Contrôles HTTP du site publié (comportements de Cloudflare impossibles à
// vérifier dans le dépôt : statut de 404.html, en-têtes de _headers, « / » final)
// --------------------------------------------------------------------------

async function controlerEnLigne({ entrees, jeuxPublies, chemins, SITE }) {
  const base = ADRESSE_EN_LIGNE ? (ADRESSE_EN_LIGNE.endsWith('/') ? ADRESSE_EN_LIGNE : `${ADRESSE_EN_LIGNE}/`) : SITE;
  const sujet = (c) => `en ligne ${c}`;
  const demander = async (chemin, methode = 'GET') => {
    try {
      return await fetch(new URL(chemin.replace(/^\//, ''), base), { method: methode, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    } catch (e) {
      return { status: 0, erreur: e.message, headers: new Headers() };
    }
  };
  const liste = ECHANTILLON ? entrees.slice(0, ECHANTILLON) : entrees;
  for (let i = 0; i < liste.length; i += 4) {
    await Promise.all(liste.slice(i, i + 4).map(async (e) => {
      const chemin = new URL(e.loc).pathname;
      const r = await demander(chemin);
      if (r.status !== 200) { erreur(sujet(chemin), `statut ${r.status || r.erreur} (200 attendu, sans redirection)`); return; }
      const html = await r.text();
      const canonique = (/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1];
      if (canonique !== e.loc) erreur(sujet(chemin), `canonical servie « ${canonique} » différente du sitemap`);
      if (/noindex/i.test(r.headers.get('x-robots-tag') || '')) erreur(sujet(chemin), 'en-tête X-Robots-Tag: noindex sur une page du sitemap');
    }));
  }
  const inconnue = await demander(`/page-introuvable-${Date.now()}/`);
  if (inconnue.status !== 404) erreur(sujet('/page-introuvable-…/'), `statut ${inconnue.status} au lieu de 404 (404.html servi ?)`);
  const premier = [...jeuxPublies.values()][0];
  if (premier) {
    const brut = await demander(`/games/${premier.id}/`);
    if (!/noindex/i.test(brut.headers.get('x-robots-tag') || '')) erreur(sujet(`/games/${premier.id}/`), 'X-Robots-Tag: noindex absent sur le fichier brut du jeu');
    const jaquette = await demander(`/${premier.cover.split('?')[0]}`, 'HEAD');
    if (/noindex/i.test(jaquette.headers.get('x-robots-tag') || '')) erreur(sujet(premier.cover), 'la jaquette ne doit pas être en noindex (image de partage)');
    const lanceur = await demander(`/play?id=${premier.id}`);
    if (!/noindex/i.test(lanceur.headers.get('x-robots-tag') || '')) attention(sujet('/play'), 'X-Robots-Tag: noindex absent sur le lanceur (la meta robots suffit)');
    const sansBarre = await demander(chemins.urlJeu(premier.id, 'fr').replace(/\/$/, ''));
    if (![301, 308].includes(sansBarre.status)) attention(sujet(chemins.urlJeu(premier.id, 'fr')), `adresse sans « / » final : statut ${sansBarre.status} (redirection attendue)`);
  }
  const robots = await demander('/robots.txt');
  if (robots.status !== 200 || !(await robots.text()).includes(`${SITE}sitemap.xml`)) erreur(sujet('/robots.txt'), 'robots.txt absent ou sans le sitemap du domaine');
}

principal().catch((e) => panne(e.stack || e.message));
