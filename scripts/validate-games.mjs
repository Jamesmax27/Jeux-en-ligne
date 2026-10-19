#!/usr/bin/env node
// ==========================================================================
// validate-games.mjs — robot de contrôle qualité des jeux
//
//   node scripts/validate-games.mjs                 contrôle tous les jeux
//   node scripts/validate-games.mjs mon-jeu autre   contrôle seulement ceux-là
//   … --browser   lance aussi chaque jeu dans un vrai navigateur (Playwright),
//                 dans les mêmes conditions que sur le site (cadre isolé)
//   … --covers    fabrique cover.jpg par capture d'écran si la jaquette manque
//
// Code de sortie : 0 = tout est bon, 1 = au moins une erreur.
// Utilisé par l'agent qui crée les jeux, et par GitHub Actions.
// Le mode --browser nécessite :  npm install --no-save playwright
//                                npx playwright install chromium
// ==========================================================================

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENRES } from './genres.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_JEUX = path.join(RACINE, 'games');

const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const JAQUETTES = ['cover.webp', 'cover.png', 'cover.jpg', 'cover.jpeg', 'cover.svg'];
const FICHIERS_AUTORISES = new Set(['index.html', 'game.json', ...JAQUETTES]);
const TAILLE_MAX_JEU = 2 * 1024 * 1024;
const TAILLE_MAX_JAQUETTE = 300 * 1024;
const PORT_TEST = 8123;

const args = process.argv.slice(2);
const avecNavigateur = args.includes('--browser');
const avecJaquettes = args.includes('--covers');
const idsDemandes = args.filter((a) => !a.startsWith('--'));

const erreurs = new Map();       // id → [messages]
const avertissements = new Map();
function erreur(id, msg) { (erreurs.get(id) || erreurs.set(id, []).get(id)).push(msg); }
function avertir(id, msg) { (avertissements.get(id) || avertissements.set(id, []).get(id)).push(msg); }

// --------------------------------------------------------------------------
// 1. Contrôles statiques (fichiers, fiche, contenu)
// --------------------------------------------------------------------------

function dateValide(texte) {
  if (typeof texte !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texte)) return false;
  const t = Date.parse(texte + 'T00:00:00Z');
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === texte;
}

async function controlerFiche(id, dossier) {
  const chemin = path.join(dossier, 'game.json');
  if (!existsSync(chemin)) return erreur(id, 'game.json manquant');
  let f;
  try { f = JSON.parse(await readFile(chemin, 'utf8')); }
  catch (e) { return erreur(id, `game.json illisible : ${e.message}`); }

  if (f.id !== id) erreur(id, `game.json : "id" doit valoir "${id}" (nom du dossier)`);
  if (typeof f.title !== 'string' || f.title.trim().length < 2 || f.title.length > 60) erreur(id, 'game.json : "title" obligatoire, 60 caractères maximum');
  if (typeof f.description !== 'string' || f.description.trim().length < 10 || f.description.length > 200) erreur(id, 'game.json : "description" obligatoire, 10 à 200 caractères');
  if (!GENRES.includes(f.genre)) erreur(id, `game.json : "genre" obligatoire, au choix : ${GENRES.join(', ')}`);
  if (!Array.isArray(f.tags) || f.tags.length < 1 || f.tags.length > 5) erreur(id, 'game.json : "tags" doit contenir 1 à 5 thèmes');
  else if (f.tags.some((t) => typeof t !== 'string' || t !== t.trim().toLowerCase() || !t)) erreur(id, 'game.json : les "tags" doivent être en minuscules');
  if (typeof f.ages !== 'string' || !/^\d{1,2}\+$/.test(f.ages)) erreur(id, 'game.json : "ages" au format "6+"');
  if (typeof f.author !== 'string' || !f.author.trim()) erreur(id, 'game.json : "author" obligatoire');
  if (!dateValide(f.added)) erreur(id, 'game.json : "added" doit être une date AAAA-MM-JJ');
  else if (Date.parse(f.added) > Date.now() + 86400000) erreur(id, 'game.json : "added" est dans le futur');
  if (!Number.isInteger(f.version) || f.version < 1) erreur(id, 'game.json : "version" doit être un entier ≥ 1');
}

async function controlerJeu(id, dossier) {
  const chemin = path.join(dossier, 'index.html');
  if (!existsSync(chemin)) return erreur(id, 'index.html manquant');

  const taille = (await stat(chemin)).size;
  if (taille > TAILLE_MAX_JEU) erreur(id, `index.html trop lourd (${(taille / 1048576).toFixed(2)} Mo, maximum 2 Mo)`);

  const html = await readFile(chemin, 'utf8');
  if (!/<html[\s>]/i.test(html)) erreur(id, 'index.html : balise <html> absente');
  if (!/<html[^>]*\blang\s*=\s*["']?fr/i.test(html)) avertir(id, 'index.html : ajouter lang="fr" sur la balise <html>');
  // Guillemets facultatifs : <meta name=viewport …> est du HTML valide.
  if (!/name\s*=\s*["']?viewport\b/i.test(html)) erreur(id, 'index.html : balise <meta name="viewport"> absente (affichage mobile)');

  // Aucune adresse Internet, sauf les espaces de noms SVG/XML du W3C.
  const adresses = [...html.matchAll(/https?:\/\/[^\s"'<>)`]+/gi)]
    .map((m) => m[0])
    .filter((u) => !/^https?:\/\/www\.w3\.org\//i.test(u));
  if (adresses.length) erreur(id, `adresse(s) externe(s) interdite(s) : ${[...new Set(adresses)].slice(0, 3).join(', ')}`);
  if (/(?:src|href)\s*=\s*["']?\/\//i.test(html)) erreur(id, 'ressource externe interdite (adresse commençant par //)');

  if (/(?:^|[^.\w$])(?:window\.)?(alert|confirm|prompt)\s*\(/m.test(html)) erreur(id, 'alert(), confirm() et prompt() sont interdits : afficher les messages dans la page');
  if (/\bwindow\.open\s*\(/.test(html)) erreur(id, 'window.open() est interdit');
  if (/<form\b/i.test(html)) avertir(id, 'formulaire détecté : les envois de formulaire sont bloqués sur le site');
  if (/\b(localStorage|sessionStorage|indexedDB)\b/.test(html) && !/\btry\s*\{/.test(html)) {
    erreur(id, 'stockage local utilisé sans try/catch : le jeu plantera dans le cadre isolé du site');
  }
}

async function controlerDossier(id) {
  const dossier = path.join(DOSSIER_JEUX, id);
  if (!existsSync(dossier)) return erreur(id, `dossier games/${id}/ introuvable`);
  if (!ID_VALIDE.test(id)) erreur(id, 'nom de dossier invalide : minuscules sans accents, chiffres et tirets uniquement');

  const entrees = await readdir(dossier, { withFileTypes: true });
  for (const e of entrees) {
    if (e.isDirectory()) erreur(id, `sous-dossier interdit : ${e.name}/ (tout doit tenir dans index.html)`);
    else if (!FICHIERS_AUTORISES.has(e.name)) erreur(id, `fichier non autorisé : ${e.name}`);
  }

  await controlerFiche(id, dossier);
  await controlerJeu(id, dossier);

  const jaquette = JAQUETTES.find((n) => existsSync(path.join(dossier, n)));
  if (jaquette) {
    const t = (await stat(path.join(dossier, jaquette))).size;
    if (t > TAILLE_MAX_JAQUETTE) erreur(id, `jaquette trop lourde (${Math.round(t / 1024)} Ko, maximum 300 Ko)`);
  } else if (!avecJaquettes) {
    erreur(id, 'jaquette manquante (cover.webp, cover.png ou cover.jpg)');
  }
}

// --------------------------------------------------------------------------
// 2. Test dans un vrai navigateur (même cadre isolé que sur le site)
// --------------------------------------------------------------------------

async function attendreServeur(url, essais = 50) {
  for (let i = 0; i < essais; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* pas encore prêt */ }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('le serveur de test ne démarre pas');
}

async function testerNavigateur(ids) {
  let playwright;
  try { playwright = await import('playwright'); }
  catch {
    console.error('\nLe mode --browser nécessite Playwright :\n  npm install --no-save playwright\n  npx playwright install chromium\n');
    process.exit(1);
  }

  // Le site doit être construit pour que play.html trouve les jeux.
  const build = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'build-catalog.mjs')], { encoding: 'utf8' });
  if (build.status !== 0) { console.error(build.stdout, build.stderr); process.exit(1); }
  const catalogue = JSON.parse(await readFile(path.join(RACINE, 'public', 'catalog.json'), 'utf8'));
  const publies = new Set(catalogue.games.map((g) => g.id));

  const serveur = spawn(process.execPath, [path.join(RACINE, 'scripts', 'serve.mjs')], {
    env: { ...process.env, PORT: String(PORT_TEST) }, stdio: 'ignore',
  });
  const base = `http://localhost:${PORT_TEST}`;
  const navigateur = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

  try {
    await attendreServeur(`${base}/`);
    for (const id of ids) {
      if (!publies.has(id)) { erreur(id, 'le jeu n\'apparaît pas dans le catalogue construit'); continue; }

      const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await contexte.newPage();
      const problemes = [];
      page.on('pageerror', (e) => problemes.push(`erreur JavaScript : ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const t = m.text();
        if (/Content Security Policy/i.test(t)) problemes.push(`ressource bloquée : ${t.slice(0, 160)}`);
        else problemes.push(`erreur console : ${t.slice(0, 160)}`);
      });

      await page.goto(`${base}/play.html?id=${id}`);
      await page.waitForTimeout(2500);
      // Le lanceur affiche le jeu via srcdoc : son cadre a pour adresse about:srcdoc.
      const cadre = page.frames().find((f) => f.url() === 'about:srcdoc');
      if (!cadre) {
        erreur(id, 'le jeu ne se charge pas dans le lanceur');
      } else {
        const visible = await cadre.evaluate(() => {
          const b = document.body;
          if (!b) return false;
          const texte = b.innerText.trim().length > 0;
          const dessin = [...document.querySelectorAll('canvas, svg, img')].some((e) => e.getBoundingClientRect().width > 20);
          return texte || dessin;
        }).catch(() => false);
        if (!visible) erreur(id, 'écran vide au démarrage');

        // Un toucher au centre puis un peu de jeu, pour détecter les erreurs au lancement.
        const boite = await page.locator('#cadre-jeu').boundingBox();
        if (boite) {
          await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);
          await page.waitForTimeout(400);
          await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height * 0.7);
          await page.keyboard.press('Space');
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(1500);
        }
        const debordement = await cadre.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2).catch(() => false);
        if (debordement) avertir(id, 'la page déborde en largeur sur téléphone (défilement horizontal)');
      }
      for (const p of [...new Set(problemes)].slice(0, 5)) erreur(id, p);
      await contexte.close();

      // Jaquette automatique (capture du jeu au démarrage, format portrait 600 × 800).
      const dossier = path.join(DOSSIER_JEUX, id);
      if (avecJaquettes && !erreurs.has(id) && !JAQUETTES.some((n) => existsSync(path.join(dossier, n)))) {
        const ctxJaquette = await navigateur.newContext({ viewport: { width: 600, height: 800 }, deviceScaleFactor: 1 });
        const pj = await ctxJaquette.newPage();
        await pj.goto(`${base}/games/${id}/`);
        await pj.waitForTimeout(1500);
        await pj.screenshot({ path: path.join(dossier, 'cover.jpg'), type: 'jpeg', quality: 80 });
        await ctxJaquette.close();
        console.log(`  🖼  ${id} : jaquette cover.jpg créée automatiquement`);
      }
    }
  } finally {
    await navigateur.close();
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
  if (ids.length === 0) { console.log('Aucun jeu à contrôler.'); return; }

  for (const id of ids) await controlerDossier(id);
  const sansErreur = ids.filter((id) => !erreurs.has(id));
  if (avecNavigateur && sansErreur.length) await testerNavigateur(sansErreur);

  console.log(`\nContrôle de ${ids.length} jeu(x) :`);
  for (const id of ids) {
    const e = erreurs.get(id) || [];
    const a = avertissements.get(id) || [];
    console.log(`\n${e.length ? '✗' : '✓'} ${id}`);
    for (const m of e) console.log(`    ERREUR : ${m}`);
    for (const m of a) console.log(`    attention : ${m}`);
  }
  const nbErreurs = [...erreurs.values()].reduce((n, l) => n + l.length, 0);
  console.log(nbErreurs ? `\n${nbErreurs} erreur(s) à corriger.\n` : '\nTout est bon.\n');
  process.exit(nbErreurs ? 1 : 0);
}

main().catch((e) => { console.error('Le contrôle a échoué :', e); process.exit(1); });
