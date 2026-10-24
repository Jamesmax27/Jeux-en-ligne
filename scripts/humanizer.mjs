#!/usr/bin/env node
// Descriptions des jeux passées au skill « humanizer » (.claude/skills/humanizer) : préparation,
// contrôle, application. Seuls description, description_seo et presentation (5 langues) sont
// concernés ; titres, règles, compétences, texte de la jaquette et code ne sont jamais touchés.
// Utilisé par la boucle de nuit (étape « humanizer », après la vérification, avant la fusion) ;
// à lancer depuis la racine du dépôt.
//
//   node scripts/humanizer.mjs preparer <dossier> [--parts N] [id…]
//       écrit <dossier>/<langue>[.<k>].json : { "<id>": { titre, description, description_seo, presentation } }
//       (titre : contexte seulement, jamais réécrit ; sans id : tous les jeux)
//   node scripts/humanizer.mjs controler <dossier> [langue | langue.k …]
//       compare chaque <nom>.json à <nom>.sortie.json (mêmes ids, champs réécrits) et liste les refus
//   node scripts/humanizer.mjs appliquer <dossier> [--maj AAAA-MM-JJ]
//       range dans games/<id>/game.json les textes réécrits qui passent les contrôles ;
//       un texte refusé garde sa version d'origine. Seules les valeurs changent dans le fichier
//       (et "maj" avec --maj, pour un jeu déjà publié).
//
// Contrôles d'un texte réécrit (sinon il est refusé et l'original est gardé) :
//   - non vide, sans retour à la ligne ni espace en double ou en bord ;
//   - longueur à ±20 % de l'original (caractères) ; description : 200 caractères au plus ;
//   - mêmes nombres écrits en chiffres ; titre du jeu gardé s'il figurait dans l'original ;
//   - typographie de l'original reprise (apostrophe droite ou ’, guillemets droits) ; aucun tiret
//     long (— –) ; pas de guillemet droit (") absent de l'original ;
//   - aucun nouveau problème selon scripts/regles-seo.mjs (bornes, bloc de la page, marques,
//     formules toutes faites) ni doublon de description_seo avec un autre jeu.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RACINE = process.cwd();
const regles = await import(pathToFileURL(path.join(RACINE, 'scripts', 'regles-seo.mjs')).href);
const { LANGUES, longueur, problemesChamps, doublonsEntreJeux } = regles;

export const CHAMPS = ['description', 'description_seo', 'presentation'];
const ECART_MAX = 0.2;
const DESCRIPTION_MAX = 200;

const lireJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const cheminFiche = (id) => path.join(RACINE, 'games', id, 'game.json');
const textesDe = (fiche, lang) => (lang === 'fr' ? fiche : fiche.i18n?.[lang]) || {};
// JSON aux clés triées : deux fiches identiques à l'ordre des clés près donnent le même texte.
const canonique = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((c) => [c, x[c]])) : x));
const nombres = (t) => (String(t).match(/\d+(?:[.,]\d+)?/g) || []).sort().join(' ');
const sansAccents = (t) => String(t).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function arreter(message) {
  console.error(`✗ ${message}`);
  process.exit(2);
}

// ---------- preparer ----------

function preparer(dossier, args) {
  let parts = 1;
  const ids = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--parts') parts = Math.max(1, parseInt(args[++i], 10) || 1);
    else ids.push(args[i]);
  }
  const tous = fs.readdirSync(path.join(RACINE, 'games')).filter((d) => fs.existsSync(cheminFiche(d))).sort();
  const liste = ids.length ? ids : tous;
  for (const id of liste) if (!fs.existsSync(cheminFiche(id))) arreter(`jeu inconnu : ${id}`);
  fs.mkdirSync(dossier, { recursive: true });

  // Chaque valeur doit se retrouver telle quelle dans le fichier (remplacement exact à l'application).
  for (const id of liste) {
    const brut = fs.readFileSync(cheminFiche(id), 'utf8');
    const fiche = lireJson(cheminFiche(id));
    for (const lang of LANGUES) for (const champ of CHAMPS) {
      const v = textesDe(fiche, lang)[champ];
      if (typeof v !== 'string' || !v.trim()) continue;
      const n = brut.split(`"${champ}": ${JSON.stringify(v)}`).length - 1;
      if (n !== 1) console.warn(`! ${id} (${lang}) ${champ} : valeur trouvée ${n} fois dans game.json (ne pourra pas être remplacée)`);
    }
  }

  const taille = Math.ceil(liste.length / parts);
  for (const lang of LANGUES) {
    for (let k = 0; k < parts; k++) {
      const morceau = liste.slice(k * taille, (k + 1) * taille);
      if (!morceau.length) continue;
      const sortie = {};
      for (const id of morceau) {
        const fiche = lireJson(cheminFiche(id));
        const tx = textesDe(fiche, lang);
        if (lang !== 'fr' && !fiche.i18n?.[lang]) continue;
        sortie[id] = { titre: tx.title || fiche.title };
        for (const champ of CHAMPS) if (typeof tx[champ] === 'string' && tx[champ].trim()) sortie[id][champ] = tx[champ];
      }
      const nom = parts > 1 ? `${lang}.${k + 1}.json` : `${lang}.json`;
      fs.writeFileSync(path.join(dossier, nom), JSON.stringify(sortie, null, 2) + '\n', 'utf8');
      console.log(`✓ ${nom} : ${Object.keys(sortie).length} jeux`);
    }
  }
}

// ---------- contrôles ----------

/** Paires (original, réécrit) du dossier, filtrées par langue (« fr ») ou par fichier (« fr.1 »). */
function paires(dossier, filtres = []) {
  const liste = [];
  for (const nom of fs.readdirSync(dossier).sort()) {
    if (!nom.endsWith('.json') || nom.endsWith('.sortie.json')) continue;
    const lang = nom.split('.')[0];
    const radical = nom.replace(/\.json$/, '');
    if (!LANGUES.includes(lang) || (filtres.length && !filtres.includes(lang) && !filtres.includes(radical))) continue;
    const sortie = path.join(dossier, nom.replace(/\.json$/, '.sortie.json'));
    liste.push({ nom, lang, origine: lireJson(path.join(dossier, nom)), reecrit: fs.existsSync(sortie) ? lireJson(sortie) : null });
  }
  return liste;
}

/**
 * Typographie de l'original reprise telle quelle : apostrophe droite ou courbe, guillemets droits.
 * Un texte qui ne diffère que par ces signes redevient donc identique à l'original.
 */
export function harmoniser(avant, apres) {
  if (typeof apres !== 'string') return apres;
  let t = apres;
  if (avant.includes("'") && !avant.includes('’')) t = t.replace(/’/g, "'");
  else if (avant.includes('’') && !avant.includes("'")) t = t.replace(/'/g, '’');
  if (avant.includes('"') && !/[„“”«»]/.test(avant)) t = t.replace(/[„“”]/g, '"');
  return t;
}

/** Contrôles propres à un texte (sans regles-seo). Renvoie la liste des raisons de refus. */
function controlerTexte(champ, avant, apres, titre) {
  const raisons = [];
  if (typeof apres !== 'string' || !apres.trim()) return ['texte vide ou absent'];
  if (/[\r\n]/.test(apres)) raisons.push('retour à la ligne');
  if (/\s{2,}|^\s|\s$/.test(apres)) raisons.push('espace en double ou en bord');
  const la = longueur(avant), lb = longueur(apres);
  if (Math.abs(lb - la) > la * ECART_MAX) raisons.push(`longueur ${lb} car. au lieu de ${la} (±20 % : ${Math.ceil(la * (1 - ECART_MAX))} à ${Math.floor(la * (1 + ECART_MAX))})`);
  if (champ === 'description' && lb > DESCRIPTION_MAX) raisons.push(`${lb} caractères (${DESCRIPTION_MAX} au plus)`);
  if (nombres(avant) !== nombres(apres)) raisons.push(`nombres changés : [${nombres(avant)}] → [${nombres(apres)}]`);
  if (titre && sansAccents(avant).includes(sansAccents(titre)) && !sansAccents(apres).includes(sansAccents(titre))) raisons.push(`titre « ${titre} » retiré`);
  if (/[—–]/.test(apres)) raisons.push('tiret long (— ou –)');
  if (apres.includes('"') && !avant.includes('"')) raisons.push('guillemet droit (") absent de l\'original');
  return raisons;
}

/**
 * Verdict de chaque texte réécrit : { id, lang, champ, avant, apres, raisons[] }.
 * Les problèmes regles-seo sont comparés avant/après sur la fiche complète.
 */
function verdicts(dossier, langues = []) {
  const resultats = [];
  const fiches = new Map();
  const fiche = (id) => {
    if (!fiches.has(id)) fiches.set(id, lireJson(cheminFiche(id)));
    return fiches.get(id);
  };
  for (const { nom, lang, origine, reecrit } of paires(dossier, langues)) {
    if (!reecrit) { console.warn(`! ${nom} : pas de fichier réécrit (${nom.replace(/\.json$/, '.sortie.json')})`); continue; }
    for (const [id, orig] of Object.entries(origine)) {
      const neuf = reecrit[id];
      const f = fiche(id);
      const copie = structuredClone(f);
      const cible = lang === 'fr' ? copie : copie.i18n[lang];
      const lignes = [];
      for (const champ of CHAMPS) {
        if (typeof orig[champ] !== 'string') continue;
        const avant = textesDe(f, lang)[champ];
        if (avant !== orig[champ]) { lignes.push({ champ, avant, apres: neuf?.[champ], raisons: ['game.json a changé depuis la préparation'] }); continue; }
        const apres = harmoniser(avant, neuf?.[champ]);
        const raisons = neuf ? controlerTexte(champ, avant, apres, orig.titre) : ['jeu absent du fichier réécrit'];
        if (!raisons.length) cible[champ] = apres;
        lignes.push({ champ, avant, apres, raisons });
      }
      // regles-seo : problèmes nouveaux après réécriture, attribués à leur champ (bloc → presentation).
      const cle = (p) => `${p.niveau}|${p.champ}|${p.message.replace(/\d+ (mots|caractères)/, '#')}`;
      const avantSeo = new Set(problemesChamps(f).filter((p) => p.lang === lang).map(cle));
      for (const p of problemesChamps(copie).filter((q) => q.lang === lang)) {
        if (avantSeo.has(cle(p))) continue;
        const champ = p.champ === 'bloc' ? 'presentation' : p.champ;
        const ligne = lignes.find((l) => l.champ === champ);
        if (ligne && !ligne.raisons.length) ligne.raisons.push(`regles-seo : ${p.message}`);
      }
      for (const l of lignes) resultats.push({ id, lang, ...l });
    }
  }
  // Doublons de description_seo avec les autres jeux (textes acceptés seulement).
  const toutes = fs.readdirSync(path.join(RACINE, 'games')).filter((d) => fs.existsSync(cheminFiche(d))).map((d) => structuredClone(fiche(d)));
  for (const r of resultats) {
    if (r.champ !== 'description_seo' || r.raisons.length || r.apres === r.avant) continue;
    const f = toutes.find((x) => x.id === r.id);
    (r.lang === 'fr' ? f : f.i18n[r.lang]).description_seo = r.apres;
  }
  const doublons = doublonsEntreJeux(toutes).filter((p) => p.champ === 'description_seo');
  for (const p of doublons) {
    const r = resultats.find((x) => x.id === p.id && x.lang === p.lang && x.champ === 'description_seo' && !x.raisons.length && x.apres !== x.avant);
    if (r) r.raisons.push(`regles-seo : ${p.message}`);
  }
  return resultats;
}

function controler(dossier, langues) {
  const res = verdicts(dossier, langues);
  const refus = res.filter((r) => r.raisons.length);
  const changes = res.filter((r) => !r.raisons.length && r.apres !== r.avant);
  for (const r of refus) console.log(`✗ ${r.id} (${r.lang}) ${r.champ} : ${r.raisons.join(' ; ')}`);
  console.log(`\n${res.length} textes : ${changes.length} réécrits acceptés, ${res.length - changes.length - refus.length} inchangés, ${refus.length} refusés.`);
  process.exitCode = refus.length ? 1 : 0;
}

// ---------- appliquer ----------

function appliquer(dossier, args) {
  const i = args.indexOf('--maj');
  const maj = i >= 0 ? args[i + 1] : null;
  if (maj !== null && !/^\d{4}-\d{2}-\d{2}$/.test(maj || '')) arreter('--maj : date AAAA-MM-JJ attendue');
  const res = verdicts(dossier);
  const parJeu = new Map();
  for (const r of res) {
    if (r.raisons.length || r.apres === r.avant) continue;
    if (!parJeu.has(r.id)) parJeu.set(r.id, []);
    parJeu.get(r.id).push(r);
  }
  const refus = res.filter((r) => r.raisons.length);
  for (const r of refus) console.log(`✗ ${r.id} (${r.lang}) ${r.champ} : original gardé (${r.raisons.join(' ; ')})`);

  let ecrits = 0, textes = 0;
  for (const [id, liste] of parJeu) {
    const chemin = cheminFiche(id);
    const brutOrigine = fs.readFileSync(chemin, 'utf8');
    let brut = brutOrigine;
    const attendu = lireJson(chemin);
    let erreur = null;
    for (const r of liste) {
      const ancien = `"${r.champ}": ${JSON.stringify(r.avant)}`;
      const morceaux = brut.split(ancien);
      if (morceaux.length !== 2) { erreur = `${r.champ} (${r.lang}) trouvé ${morceaux.length - 1} fois`; break; }
      brut = morceaux.join(`"${r.champ}": ${JSON.stringify(r.apres)}`);
      (r.lang === 'fr' ? attendu : attendu.i18n[r.lang])[r.champ] = r.apres;
    }
    if (!erreur && maj && attendu.maj !== maj) {
      if (typeof attendu.maj === 'string') {
        const m = brut.split(`"maj": ${JSON.stringify(attendu.maj)}`);
        if (m.length !== 2) erreur = '"maj" introuvable';
        else brut = m.join(`"maj": ${JSON.stringify(maj)}`);
      } else {
        const m = brut.split(`"added": ${JSON.stringify(attendu.added)}`);
        const fin = brut.includes('\r\n') ? '\r\n' : '\n';
        if (m.length !== 2) erreur = '"added" introuvable (pour placer "maj")';
        else brut = m.join(`"added": ${JSON.stringify(attendu.added)},${fin}  "maj": ${JSON.stringify(maj)}`);
      }
      attendu.maj = maj;
    }
    // Le fichier écrit doit relire exactement la fiche attendue (rien d'autre n'a bougé).
    if (!erreur) {
      try {
        if (canonique(JSON.parse(brut.replace(/^﻿/, ''))) !== canonique(attendu)) erreur = 'relecture différente de la fiche attendue';
      } catch (e) {
        erreur = `JSON illisible après remplacement (${e.message})`;
      }
    }
    if (erreur) { console.log(`✗ ${id} : rien écrit, originaux gardés (${erreur})`); continue; }
    fs.writeFileSync(chemin, brut, 'utf8');
    ecrits++;
    textes += liste.length;
  }
  console.log(`\n✓ ${textes} textes réécrits rangés dans ${ecrits} fiches ; ${refus.length} textes refusés (originaux gardés).`);
}

// ---------- ligne de commande ----------

const [commande, dossier, ...reste] = process.argv.slice(2);
if (!commande || !dossier) arreter('usage : node humanizer.mjs preparer|controler|appliquer <dossier> […]');
if (commande === 'preparer') preparer(path.resolve(dossier), reste);
else if (commande === 'controler') controler(path.resolve(dossier), reste);
else if (commande === 'appliquer') appliquer(path.resolve(dossier), reste);
else arreter(`commande inconnue : ${commande}`);
