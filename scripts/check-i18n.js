#!/usr/bin/env node
// ==========================================================================
// check-i18n.js — vérification des traductions (site et jeux), sans dépendance
//
//   node scripts/check-i18n.js                 site + tous les jeux
//   node scripts/check-i18n.js mon-jeu autre   site + seulement ces jeux
//   … --statique     sans navigateur (vérifications statiques seulement)
//   … --rapport      affiche le détail des textes en dur suspects
//   … --sans-site    sans tester le catalogue et le lanceur dans le navigateur
//
// Bloquant (code de sortie 1) :
//   - JSON invalide ; fichier de langue sans exactement les mêmes clés que fr ;
//     valeur vide ; {variables} différentes d'une langue à l'autre ; pluriel
//     sans forme « other » ;
//   - site : genre, univers ou tranche d'âge sans nom (genres et univers :
//     libellé et libellé court ; en français, ceux de public/taxonomie.js) ;
//   - jeu : titre ou description manquant dans une des 5 langues (game.json),
//     ainsi que la présentation ("presentation") dès qu'elle existe en
//     français (obligatoire pour les jeux "consignes": 2) ;
//     bloc de textes (jel-i18n-textes) ou module commun (jel-i18n) absent ou
//     pas à jour ; clé utilisée par le jeu (t('…'), data-i18n…) absente du
//     français ;
//   - navigateur (si disponible) : erreur JavaScript, clé manquante ou
//     <html lang> faux au chargement d'un jeu, du catalogue ou du lanceur,
//     dans chacune des 5 langues.
// Non bloquant (rapport) : textes en dur restants (recherche heuristique dans
// le HTML et le JavaScript des jeux), CSS de bouton à
// largeur fixe ou sans retour à la ligne, textes qui débordent (navigateur,
// en allemand surtout). Rapport complet : i18n-rapport.txt (ignoré par git).
//
// Navigateur : Playwright (npm install --no-save playwright), avec Chromium
// (npx playwright install chromium) ou CHROMIUM_PATH = chemin d'un Chromium
// déjà installé (ex. Edge). Sans navigateur : vérification statique seulement.
// ==========================================================================

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_JEUX = path.join(RACINE, 'games');
const DOSSIER_SITE = path.join(RACINE, 'public', 'i18n', 'site');
const MODULE_COMMUN = path.join(RACINE, 'public', 'i18n', 'i18n.js');
const LANGUES = ['fr', 'en', 'es', 'pt', 'de'];
const FORMES_PLURIEL = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const PORT_TEST = 8124;

const args = process.argv.slice(2);
const statique = args.includes('--statique');
const rapportComplet = args.includes('--rapport');
const sansSite = args.includes('--sans-site');
const idsDemandes = args.filter((a) => !a.startsWith('--'));

const erreurs = new Map();       // sujet → [messages]
const avertissements = new Map();
const suspects = new Map();      // jeu → [textes en dur suspects]
function erreur(sujet, msg) { (erreurs.get(sujet) || erreurs.set(sujet, []).get(sujet)).push(msg); }
function avertir(sujet, msg) { (avertissements.get(sujet) || avertissements.set(sujet, []).get(sujet)).push(msg); }

// --------------------------------------------------------------------------
// 1. Fichiers de langue : mêmes clés, valeurs non vides, mêmes {variables}
// --------------------------------------------------------------------------

function variables(valeur) {
  const textes = typeof valeur === 'string' ? [valeur] : Object.values(valeur || {});
  const noms = new Set();
  for (const texte of textes) for (const m of String(texte).matchAll(/\{(\w+)\}/g)) noms.add(m[1]);
  return [...noms].sort().join(',');
}

// Vérifie un dictionnaire { fr: {…}, en: {…}, … } ; renvoie la liste des clés fr.
function verifierDictionnaires(sujet, dicos) {
  const fr = dicos.fr;
  if (!fr || typeof fr !== 'object' || Array.isArray(fr)) {
    erreur(sujet, 'textes français (fr) absents');
    return [];
  }
  const clesFr = Object.keys(fr);
  for (const lang of LANGUES) {
    const d = dicos[lang];
    if (!d || typeof d !== 'object' || Array.isArray(d)) { erreur(sujet, `langue « ${lang} » absente`); continue; }
    const cles = new Set(Object.keys(d));
    const manquantes = clesFr.filter((c) => !cles.has(c));
    const enTrop = [...cles].filter((c) => !(c in fr));
    if (manquantes.length) erreur(sujet, `${lang} : ${manquantes.length} clé(s) manquante(s) : ${manquantes.slice(0, 6).join(', ')}${manquantes.length > 6 ? '…' : ''}`);
    if (enTrop.length) erreur(sujet, `${lang} : ${enTrop.length} clé(s) en trop (absentes de fr) : ${enTrop.slice(0, 6).join(', ')}${enTrop.length > 6 ? '…' : ''}`);
    for (const [cle, valeur] of Object.entries(d)) {
      if (typeof valeur === 'string') {
        if (!valeur.trim()) erreur(sujet, `${lang} : valeur vide pour « ${cle} »`);
      } else if (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) {
        const formes = Object.keys(valeur);
        if (!('other' in valeur)) erreur(sujet, `${lang} : pluriel sans forme « other » pour « ${cle} »`);
        for (const f of formes) {
          if (!FORMES_PLURIEL.has(f)) erreur(sujet, `${lang} : forme de pluriel inconnue « ${f} » pour « ${cle} »`);
          else if (typeof valeur[f] !== 'string' || !valeur[f].trim()) erreur(sujet, `${lang} : valeur vide pour « ${cle}.${f} »`);
        }
      } else {
        erreur(sujet, `${lang} : valeur invalide pour « ${cle} » (texte ou pluriel attendu)`);
      }
      if (cle in fr && variables(valeur) !== variables(fr[cle])) {
        erreur(sujet, `${lang} : variables différentes de fr pour « ${cle} » ({${variables(valeur)}} au lieu de {${variables(fr[cle])}})`);
      }
      if (cle in fr && (typeof valeur === 'object') !== (typeof fr[cle] === 'object')) {
        erreur(sujet, `${lang} : « ${cle} » doit être ${typeof fr[cle] === 'object' ? 'un pluriel' : 'un texte'} comme en fr`);
      }
    }
  }
  return clesFr;
}

async function lireJson(sujet, chemin) {
  try {
    return JSON.parse(await readFile(chemin, 'utf8'));
  } catch (e) {
    erreur(sujet, `${path.relative(RACINE, chemin)} : JSON invalide (${e.message})`);
    return null;
  }
}

async function verifierSite() {
  const sujet = 'site';
  const dicos = {};
  for (const lang of LANGUES) {
    const chemin = path.join(DOSSIER_SITE, `${lang}.json`);
    if (!existsSync(chemin)) { erreur(sujet, `fichier public/i18n/site/${lang}.json absent`); continue; }
    dicos[lang] = await lireJson(sujet, chemin);
  }
  if (LANGUES.some((l) => !dicos[l])) return;
  verifierDictionnaires(sujet, dicos);

  // Noms des regroupements du catalogue (listes de public/taxonomie.js) : libellé
  // complet et libellé court de chaque genre et univers ; le français reprend
  // exactement ceux de taxonomie.js. Les autres langues ont les mêmes clés (ci-dessus).
  const { GENRES, UNIVERS, TRANCHES_AGE } = await import(pathToFileURL(path.join(RACINE, 'public', 'taxonomie.js')).href);
  const fr = dicos.fr;
  for (const [famille, liste] of [['genre', GENRES], ['univers', UNIVERS]]) {
    for (const x of liste) {
      for (const [cle, attendu] of [[`${famille}.${x.id}`, x.libelle], [`${famille}.${x.id}.court`, x.court]]) {
        if (!(cle in fr)) erreur(sujet, `${famille} « ${x.id} » sans nom (clé ${cle})`);
        else if (fr[cle] !== attendu) erreur(sujet, `fr : « ${cle} » doit valoir « ${attendu} » (public/taxonomie.js)`);
      }
    }
  }
  for (const a of TRANCHES_AGE) {
    if (!(`age.${a.id}` in fr) || !(`age.${a.id}.aide` in fr)) erreur(sujet, `tranche d'âge « ${a.id} » sans nom (clés age.${a.id} et age.${a.id}.aide)`);
  }
}

// --------------------------------------------------------------------------
// 2. Jeux : fiche traduite, textes du jeu, module commun, clés utilisées
// --------------------------------------------------------------------------

const RE_BLOC_TEXTES = /<script\b[^>]*\bid=["']jel-i18n-textes["'][^>]*>([\s\S]*?)<\/script>/i;
const RE_BLOC_MODULE = /<script\b[^>]*\bid=["']jel-i18n["'][^>]*>([\s\S]*?)<\/script>/i;

// Code du jeu sans le bloc de textes ni le module commun.
function codeDuJeu(html) {
  return html.replace(RE_BLOC_TEXTES, '').replace(RE_BLOC_MODULE, '');
}

// Clés écrites en toutes lettres dans le code : t('…'), JEL_I18N.t('…'), traduire('…')
// (alias de t() dans un jeu où « t » est déjà une variable), data-i18n…="…".
function clesUtilisees(code) {
  const cles = new Set();
  for (const m of code.matchAll(/(?:^|[^\w$.])(?:JEL_I18N\.t|t|traduire)\(\s*(['"])([^'"\\]+)\1\s*[,)]/g)) cles.add(m[2]);
  for (const m of code.matchAll(/\bdata-i18n(?:-html|-placeholder|-title|-aria)?\s*=\s*(['"])([^'"]+)\1/g)) cles.add(m[2]);
  return cles;
}

async function verifierJeu(id, moduleCommun) {
  const dossier = path.join(DOSSIER_JEUX, id);
  const sujet = id;

  // --- Fiche : titre et description dans les 5 langues ---
  const fiche = await lireJson(sujet, path.join(dossier, 'game.json'));
  if (fiche) {
    if (typeof fiche.title !== 'string' || !fiche.title.trim()) erreur(sujet, 'game.json : "title" (français) manquant');
    if (typeof fiche.description !== 'string' || !fiche.description.trim()) erreur(sujet, 'game.json : "description" (français) manquante');
    for (const lang of LANGUES.filter((l) => l !== 'fr')) {
      const t = fiche.i18n?.[lang];
      if (typeof t?.title !== 'string' || !t.title.trim()) erreur(sujet, `game.json : "i18n.${lang}.title" manquant`);
      if (typeof t?.description !== 'string' || !t.description.trim()) erreur(sujet, `game.json : "i18n.${lang}.description" manquante`);
      else if (t.description.length > 200) erreur(sujet, `game.json : "i18n.${lang}.description" dépasse 200 caractères`);
      if (typeof t?.title === 'string' && t.title.length > 60) erreur(sujet, `game.json : "i18n.${lang}.title" dépasse 60 caractères`);
      // Présentation (quelques phrases, nouveaux jeux) : traduite dès qu'elle existe en français.
      if (typeof fiche.presentation === 'string' && fiche.presentation.trim()) {
        if (typeof t?.presentation !== 'string' || !t.presentation.trim()) erreur(sujet, `game.json : "i18n.${lang}.presentation" manquante`);
        else if (t.presentation.length > 1200) erreur(sujet, `game.json : "i18n.${lang}.presentation" dépasse 1 200 caractères`);
      }
    }
    if (Number(fiche.consignes) >= 2 && (typeof fiche.presentation !== 'string' || !fiche.presentation.trim())) {
      erreur(sujet, 'game.json : "presentation" (français) manquante (obligatoire pour les nouveaux jeux)');
    }
    if (fiche.langues !== undefined && (!Array.isArray(fiche.langues) || !fiche.langues.length || fiche.langues.some((l) => !LANGUES.includes(l)))) {
      erreur(sujet, `game.json : "langues" doit être une liste parmi ${LANGUES.join(', ')}`);
    }
    if (fiche.non_traduisible !== undefined && typeof fiche.non_traduisible !== 'boolean') erreur(sujet, 'game.json : "non_traduisible" doit valoir true ou false');
  }

  // --- index.html : bloc de textes et module commun ---
  const cheminHtml = path.join(dossier, 'index.html');
  if (!existsSync(cheminHtml)) { erreur(sujet, 'index.html manquant'); return null; }
  const html = await readFile(cheminHtml, 'utf8');
  const bloc = RE_BLOC_TEXTES.exec(html);
  const module = RE_BLOC_MODULE.exec(html);
  if (!bloc) {
    erreur(sujet, 'index.html : bloc <script type="application/json" id="jel-i18n-textes"> absent (textes du jeu en 5 langues)');
    return { fiche, html };
  }
  if (!module) erreur(sujet, 'index.html : module commun <script id="jel-i18n"> absent (copie de public/i18n/i18n.js)');
  else if (module[1].replace(/\r\n/g, '\n').trim() !== moduleCommun.replace(/\r\n/g, '\n').trim()) erreur(sujet, 'index.html : module commun pas à jour : lancer node scripts/i18n-jeu.mjs (ou recopier public/i18n/i18n.js)');
  if (module && bloc.index > module.index) erreur(sujet, 'index.html : le bloc jel-i18n-textes doit être placé avant le module commun jel-i18n');
  if (module) {
    const premierScript = /<script\b(?![^>]*\bid=["']jel-i18n(?:-textes)?["'])(?![^>]*type=["']application\/json)[^>]*>/i.exec(html);
    if (premierScript && premierScript.index < module.index) erreur(sujet, 'index.html : le module commun jel-i18n doit être chargé avant le code du jeu');
  }

  let dicos;
  try {
    dicos = JSON.parse(bloc[1]);
  } catch (e) {
    erreur(sujet, `bloc jel-i18n-textes : JSON invalide (${e.message})`);
    return { fiche, html };
  }
  const clesFr = new Set(verifierDictionnaires(sujet, dicos));
  if (/<\/script/i.test(bloc[1])) erreur(sujet, 'bloc jel-i18n-textes : « </script » interdit dans les textes (écrire \\u003c/script)');

  // --- Clés utilisées par le code, absentes du français ---
  const code = codeDuJeu(html);
  const absentes = [...clesUtilisees(code)].filter((c) => !clesFr.has(c));
  if (absentes.length) erreur(sujet, `clé(s) utilisée(s) dans le jeu mais absente(s) de fr : ${absentes.slice(0, 8).join(', ')}${absentes.length > 8 ? '…' : ''}`);

  // --- Mise en page : boutons à largeur fixe ou sans retour à la ligne ---
  for (const m of code.matchAll(/([^{}<>]*\bbutton\b[^{}<>]*|[^{}<>]*\.(?:btn|bouton)[\w-]*[^{}<>]*)\{([^}]*)\}/gi)) {
    const regles = m[2];
    if (/(?:^|;)\s*white-space\s*:\s*nowrap/i.test(regles)) avertir(sujet, `CSS « ${m[1].trim().slice(0, 50)} » : white-space: nowrap (un texte long ne passera pas à la ligne)`);
    if (/(?:^|;)\s*width\s*:\s*\d+(?:\.\d+)?px/i.test(regles)) avertir(sujet, `CSS « ${m[1].trim().slice(0, 50)} » : largeur fixe en px (préférer min-width ou max-width)`);
  }

  chercherTextesEnDur(id, code, clesFr);
  return { fiche, html };
}

// --------------------------------------------------------------------------
// 3. Recherche heuristique des textes en dur restants (rapport, non bloquant)
// --------------------------------------------------------------------------

const LETTRES = /\p{L}{2,}/u;
const MOTS = /\p{L}{2,}[^\p{L}]+\p{L}{2,}/u;           // au moins deux mots

function ligneDe(code, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (code.charCodeAt(i) === 10) n++;
  return n;
}

function chercherTextesEnDur(id, code, clesFr = new Set()) {
  // Clés construites dans le code, ex. t('pays.' + nom) : « nom » est alors un identifiant, pas un texte.
  const prefixes = [...new Set([...code.matchAll(/(?:^|[^\w$.])(?:t|traduire)\(\s*['`"]([\w.-]+\.)['`"]\s*\+/g)].map((m) => m[1]))];
  const estCle = (texte) => prefixes.some((p) => clesFr.has(p + texte.replace(/\\(.)/g, '$1')));
  const trouves = [];
  const noter = (index, texte, ou) => trouves.push(`ligne ${ligneDe(code, index)} (${ou}) : ${texte.replace(/\s+/g, ' ').trim().slice(0, 70)}`);

  // HTML : textes entre balises, hors <script>, <style> et commentaires,
  // dont la balise ouvrante n'a pas d'attribut data-i18n.
  const blanc = (m) => m.replace(/[^\n]/g, ' ');
  const masque = code.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, blanc)
    // contenu d'un élément déjà traduit (data-i18n, data-i18n-html) : <br>, <b>… compris
    .replace(/(<([a-zA-Z][\w-]*)\b[^>]*\bdata-i18n(?:-html)?\s*=[^>]*>)([\s\S]*?)(<\/\2>)/g, (m, o, b, dedans, f) => o + blanc(dedans) + f);
  for (const m of masque.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>([^<]+)/g)) {
    const [, balise, attributs, texte] = m;
    if (!LETTRES.test(texte.replace(/&#?\w+;/g, ' ')) || /^(script|style)$/i.test(balise)) continue;
    if (/^\s*[IVX]{1,4}\s*$/.test(texte)) continue;                                // « II » : symbole de pause
    if (/\bdata-i18n(?:-html)?\s*=/.test(attributs)) continue;
    noter(m.index, texte, `HTML <${balise}>`);
  }
  for (const m of masque.matchAll(/<[a-zA-Z][\w-]*\b([^>]*)>/g)) {
    for (const [attribut, cle] of [['placeholder', 'placeholder'], ['title', 'title'], ['aria-label', 'aria'], ['alt', 'alt']]) {
      const a = new RegExp(`\\b${attribut}\\s*=\\s*(["'])([^"']*)\\1`).exec(m[1]);
      if (a && LETTRES.test(a[2]) && !new RegExp(`\\bdata-i18n-${cle}\\s*=`).test(m[1])) noter(m.index, a[2], `attribut ${attribut}`);
    }
  }

  // JavaScript : chaînes d'au moins deux mots (ou avec accents) hors t(…),
  // hors console, police, couleurs, sélecteurs CSS et clés de traduction.
  for (const s of code.matchAll(/<script\b(?![^>]*type=["']application\/json)[^>]*>([\s\S]*?)<\/script>/gi)) {
    // Commentaires retirés (même longueur, pour garder les numéros de ligne).
    const js = s[1].replace(/\/\*[\s\S]*?\*\//g, blanc).replace(/(^|[^:\\'"`])(\/\/[^\n]*)/gm, (m, avant, com) => avant + blanc(com));
    const debut = s.index + s[0].indexOf(js);
    for (const m of js.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
      const texte = m[2].replace(/\$\{[^}]*\}/g, ' ').replace(/<[^>]*>?/g, ' ')   // sans ${…} ni balises HTML,
        .replace(/[\w:-]+\s*=\s*(?:"[^"]*"?|'[^']*'?)/g, ' ')                       // ni attributs (x="…"),
        .replace(/\[[^\]]*\]/g, ' ').replace(/\b[a-z]+\/[a-z0-9+.-]+\b/g, ' ');     // ni sélecteurs [data-x], ni types MIME
      if (/^\s*(?:https?:|data:|blob:)/.test(texte) || /^\s*(?:var|calc|url|hsla?|rgba?)\(/.test(texte)) continue;
      if (!LETTRES.test(texte)) continue;
      if (!MOTS.test(texte) && !/[àâäçéèêëîïôöùûüÿœæ]/i.test(texte)) continue;
      const avant = js.slice(Math.max(0, m.index - 40), m.index);
      if (/^@[\w.]+$/.test(texte.trim()) || /class=\s*$/.test(avant)) continue;          // pseudo (@nom), classes CSS
      const ligne = js.slice(js.lastIndexOf('\n', m.index) + 1, m.index);
      if (/(?:^|[^\w$])(?:t|traduire)\(\s*$|JEL_I18N\.\w+\(\s*$/.test(avant)) continue;   // t('…')
      if (/console\.\w+\(|font\s*=|font:|\.font\b|querySelector|getElementById|matchMedia|addEventListener|createElement|classList|setAttribute\(\s*['"](?:class|style|id|role)/.test(ligne)) continue;
      if (/^\s*[\w.-]+\s*$/.test(texte) || texte === 'use strict' || estCle(m[2])) continue;          // clé ou identifiant
      if (/^[\s\w#.,:;()%+\-*/>=!~[\]"'@-]*$/.test(texte) && !MOTS.test(texte.replace(/[#.][\w-]+/g, ''))) continue;
      if (/\b(?:px|rem|em|vh|vw|rgba?|hsla?|deg|ms)\b|#[0-9a-f]{3,8}\b|^\s*\d/.test(texte) && !/[àâäçéèêëîïôöùûüÿœæ]/i.test(texte)) continue;
      if (/^(?:bold|normal|italic|\d{3})\b|\bsans-serif\b|\bsystem-ui\b|\bmonospace\b/.test(texte)) continue;
      if (/\$\{[^}]*\bt\(/.test(texte) && !/>[^<${}]*\p{L}{2,}[^<${}]*</u.test(texte.replace(/\$\{[^}]*\}/g, ''))) continue;
      noter(debut + m.index, texte, 'JavaScript');
    }
  }
  if (trouves.length) suspects.set(id, trouves);
}

// --------------------------------------------------------------------------
// 4. Navigateur : chaque jeu (et le site) dans les 5 langues
// --------------------------------------------------------------------------

async function ouvrirNavigateur() {
  if (statique) return null;
  let playwright;
  try { playwright = await import('playwright'); } catch { return null; }
  try {
    return await playwright.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  } catch {
    return null;
  }
}

// Le jeu tel que le lanceur l'affiche : langue transmise par window.JEL_LANG.
function avecLangue(html, lang) {
  const debut = /^\uFEFF?(?:\s|<!--[\s\S]*?-->)*(?:<!doctype[^>]*>)?/i.exec(html)[0];
  return `${debut}<script>window.JEL_LANG=${JSON.stringify(lang)};</script>${html.slice(debut.length)}`;
}

// Textes visibles qui débordent de leur boîte ou de l'écran.
async function debordements(page) {
  return page.evaluate(() => {
    const L = window.innerWidth;
    const resultat = [];
    for (const el of document.querySelectorAll('button, a, h1, h2, h3, p, span, div, label, li')) {
      if (el.closest('.jel-langue')) continue;
      // Dans une zone qui défile (onglets, liste…), sortir de l'écran est voulu.
      let defile = false;
      for (let a = el.parentElement; a && !defile; a = a.parentElement) {
        const s = getComputedStyle(a);
        defile = /auto|scroll/.test(s.overflowX + s.overflowY) && (a.scrollWidth > a.clientWidth + 2 || a.scrollHeight > a.clientHeight + 2);
      }
      if (defile) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.offsetParent === null) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const texte = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (!/\p{L}{2,}/u.test(texte)) continue;
      // Texte coupé exprès par le jeu (« … », nombre de lignes limité) : pas un débordement.
      const coupeVoulue = style.textOverflow === 'ellipsis' || (style.webkitLineClamp && style.webkitLineClamp !== 'none');
      const deborde = !coupeVoulue && el.scrollWidth > el.clientWidth + 2 && /hidden|clip/.test(style.overflowX + style.overflow);
      const horsEcran = r.right > L + 2 || r.left < -2;
      if (deborde || horsEcran) resultat.push(texte.slice(0, 40));
    }
    return [...new Set(resultat)].slice(0, 4);
  }).catch(() => []);
}

async function testerJeux(navigateur, jeux) {
  for (const { id, html } of jeux) {
    for (const lang of LANGUES) {
      const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, offline: true });
      const page = await contexte.newPage();
      const problemes = [];
      page.on('pageerror', (e) => problemes.push(`erreur JavaScript : ${e.message}`));
      page.on('console', (m) => {
        const texte = m.text();
        if (m.type() === 'error') problemes.push(`erreur console : ${texte.slice(0, 140)}`);
        else if (/^\[i18n\]/.test(texte)) problemes.push(texte.slice(0, 140));
      });
      try {
        await page.setContent(avecLangue(html, lang), { waitUntil: 'load', timeout: 15000 });
        await page.waitForTimeout(1200);
        const htmlLang = await page.evaluate(() => document.documentElement.lang);
        if (htmlLang !== lang) problemes.push(`<html lang> vaut « ${htmlLang} » au lieu de « ${lang} »`);
        const selecteur = await page.evaluate(() => !!document.querySelector('.jel-langue')).catch(() => false);
        if (!selecteur && lang === 'fr') avertir(id, 'aucun sélecteur de langue visible dans le jeu');
        const deborde = await debordements(page);
        if (deborde.length) avertir(id, `${lang} : texte qui déborde ou sort de l'écran : ${deborde.map((t) => `« ${t} »`).join(', ')}`);
      } catch (e) {
        problemes.push(`le jeu ne se charge pas (${e.message.split('\n')[0]})`);
      }
      for (const p of [...new Set(problemes)].slice(0, 4)) erreur(id, `${lang} : ${p}`);
      await contexte.close();
    }
  }
}

async function attendreServeur(url, essais = 60) {
  for (let i = 0; i < essais; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* pas encore prêt */ }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('le serveur de test ne démarre pas');
}

// Catalogue et lanceur dans les 5 langues (site construit puis servi en local).
async function testerSite(navigateur, idExemple) {
  const build = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'build-catalog.mjs')], { encoding: 'utf8' });
  if (build.status !== 0) { erreur('site', `la construction du catalogue a échoué : ${build.stderr.slice(0, 200)}`); return; }
  const serveur = spawn(process.execPath, [path.join(RACINE, 'scripts', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT_TEST) }, stdio: 'ignore' });
  const base = `http://localhost:${PORT_TEST}`;
  try {
    await attendreServeur(`${base}/`);
    const pages = [['catalogue', '/'], ['mentions légales', '/mentions-legales.html'], ...(idExemple ? [['lanceur', `/play.html?id=${idExemple}`]] : [])];
    for (const [nom, chemin] of pages) {
      for (const lang of LANGUES) {
        const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
        const page = await contexte.newPage();
        const problemes = [];
        page.on('pageerror', (e) => problemes.push(`erreur JavaScript : ${e.message}`));
        page.on('console', (m) => {
          const texte = m.text();
          if (/^\[i18n\]/.test(texte)) problemes.push(texte.slice(0, 140));
          else if (m.type() === 'error' && !/api\/(?:scores|vote)|404|Failed to load resource/i.test(texte)) problemes.push(`erreur console : ${texte.slice(0, 140)}`);
        });
        try {
          await page.goto(`${base}${chemin}${chemin.includes('?') ? '&' : '?'}lang=${lang}`);
          await page.waitForTimeout(nom === 'catalogue' ? 5000 : 2500);
          const infos = await page.evaluate(() => ({
            lang: document.documentElement.lang,
            hreflang: document.querySelectorAll('link[rel="alternate"][hreflang]').length,
            largeur: document.documentElement.scrollWidth > window.innerWidth + 2,
          }));
          if (infos.lang !== lang) problemes.push(`<html lang> vaut « ${infos.lang} »`);
          if (infos.hreflang !== LANGUES.length + 1) problemes.push(`${infos.hreflang} liens hreflang au lieu de ${LANGUES.length + 1}`);
          if (infos.largeur) avertir('site', `${nom} (${lang}) : la page déborde en largeur sur téléphone`);
        } catch (e) {
          problemes.push(`la page ne se charge pas (${e.message.split('\n')[0]})`);
        }
        for (const p of [...new Set(problemes)].slice(0, 4)) erreur('site', `${nom} (${lang}) : ${p}`);
        await contexte.close();
      }
    }
  } finally {
    serveur.kill();
  }
}

// --------------------------------------------------------------------------
// Programme principal
// --------------------------------------------------------------------------

async function main() {
  let ids = idsDemandes;
  if (ids.length === 0) {
    ids = (await readdir(DOSSIER_JEUX, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map((e) => e.name).sort();
  }
  const moduleCommun = await readFile(MODULE_COMMUN, 'utf8');

  const jeux = [];
  for (const id of ids) {
    if (!existsSync(path.join(DOSSIER_JEUX, id))) { erreur(id, `dossier games/${id}/ introuvable`); continue; }
    const resultat = await verifierJeu(id, moduleCommun);
    if (resultat?.html && !erreurs.has(id)) jeux.push({ id, html: resultat.html });
  }
  await verifierSite();

  const navigateur = await ouvrirNavigateur();
  if (navigateur) {
    try {
      await testerJeux(navigateur, jeux);
      if (!sansSite) await testerSite(navigateur, jeux[0]?.id);
    } finally {
      await navigateur.close();
    }
  } else {
    console.log(statique ? '\n(--statique : test dans le navigateur ignoré)' : '\nAucun navigateur disponible (Playwright) : vérification statique seulement.');
  }

  // --- Compte rendu ---
  const sujets = ['site', ...ids];
  const lignesRapport = [];
  console.log(`\nTraductions : site + ${ids.length} jeu(x), langues ${LANGUES.join(', ')}${navigateur ? ', avec navigateur' : ''}`);
  for (const sujet of sujets) {
    const e = erreurs.get(sujet) || [];
    const a = avertissements.get(sujet) || [];
    const s = suspects.get(sujet) || [];
    console.log(`\n${e.length ? '✗' : '✓'} ${sujet}${s.length ? `  (${s.length} texte(s) en dur suspect(s))` : ''}`);
    for (const m of e) console.log(`    ERREUR : ${m}`);
    for (const m of a) console.log(`    attention : ${m}`);
    if (rapportComplet) for (const m of s) console.log(`    en dur ? ${m}`);
    if (s.length) lignesRapport.push(`## ${sujet}`, ...s.map((m) => `- ${m}`), '');
  }
  await writeFile(path.join(RACINE, 'i18n-rapport.txt'),
    `Textes en dur suspects (recherche heuristique, à vérifier à la main)\n\n${lignesRapport.join('\n') || 'Aucun.\n'}`, 'utf8');
  const nbErreurs = [...erreurs.values()].reduce((n, l) => n + l.length, 0);
  const nbSuspects = [...suspects.values()].reduce((n, l) => n + l.length, 0);
  console.log(`\nTextes en dur suspects : ${nbSuspects} (détail : i18n-rapport.txt${rapportComplet ? '' : ', ou --rapport'}).`);
  console.log(nbErreurs ? `${nbErreurs} erreur(s) de traduction à corriger.\n` : 'Traductions : tout est bon.\n');
  process.exit(nbErreurs ? 1 : 0);
}

main().catch((e) => { console.error('La vérification des traductions a échoué :', e); process.exit(1); });
