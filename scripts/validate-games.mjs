#!/usr/bin/env node
// ==========================================================================
// validate-games.mjs — robot de contrôle qualité des jeux
//
//   node scripts/validate-games.mjs                 contrôle tous les jeux
//   node scripts/validate-games.mjs mon-jeu autre   contrôle seulement ceux-là
//   … --browser   lance aussi chaque jeu dans un vrai navigateur (Playwright),
//                 dans les mêmes conditions que sur le site (cadre isolé),
//                 au toucher sur téléphone, puis une 2e fois coupé du réseau
//   … --covers    fabrique cover.jpg par capture d'écran si la jaquette manque
//                 (textes masqués : la jaquette ne contient aucun texte)
//   … --jouer     (implique --browser) joue en plus 30 secondes au hasard sur
//                 téléphone et enregistre des captures d'écran dans captures/<id>/
//
// Jeux faits selon les consignes de 2026 (game.json : "consignes": 2, posé par
// la boucle de nuit) : au moins 20 niveaux, nombre déclaré dans game.json
// ("niveaux") ET donné par le jeu lui-même (window.JEL_NIVEAUX, lu dans le
// navigateur), présentation ("presentation"). Les jeux plus anciens, sans ce
// champ, ne sont pas concernés. Les textes de référencement de tous les jeux
// (présentation, règles, titre et description pour Google…) et leurs longueurs
// sont contrôlés par scripts/regles-seo.mjs et scripts/verifier-seo.mjs.
//
// Code de sortie : 0 = tout est bon, 1 = au moins une erreur.
// Utilisé par l'agent qui crée les jeux, et par GitHub Actions.
// Les modes --browser et --jouer nécessitent :  npm install --no-save playwright
//                                               npx playwright install chromium
// (ou CHROMIUM_PATH = chemin d'un navigateur Chromium déjà installé, ex. Edge)
// ==========================================================================

import { readdir, readFile, stat, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { problemesClassementJeu, RAPPEL_LISTES } from './controle-taxonomie.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_JEUX = path.join(RACINE, 'games');

const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const JAQUETTES = ['cover.webp', 'cover.png', 'cover.jpg', 'cover.jpeg', 'cover.svg'];
const FICHIERS_AUTORISES = new Set(['index.html', 'game.json', ...JAQUETTES]);
const TAILLE_MAX_JEU = 2 * 1024 * 1024;
const TAILLE_MAX_JAQUETTE = 300 * 1024;
const PORT_TEST = 8123;
// Consignes de 2026 (game.json "consignes": 2) : voir CONSIGNES-JEU.md.
const NIVEAUX_MIN = 20;
const fiches = new Map();        // id → contenu de game.json (pour le test dans le navigateur)
const consignes2 = (id) => Number(fiches.get(id)?.consignes) >= 2;

const args = process.argv.slice(2);
const avecPartie = args.includes('--jouer');                     // partie au hasard + captures
const avecNavigateur = args.includes('--browser') || avecPartie;
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
  // Genre, genres secondaires et univers : listes fermées de public/taxonomie.js.
  const classement = problemesClassementJeu(f);
  for (const p of classement) erreur(id, `game.json : ${p}`);
  if (classement.length) erreur(id, `game.json : listes permises (public/taxonomie.js) — ${RAPPEL_LISTES}`);
  if (typeof f.ages !== 'string' || !/^\d{1,2}\+$/.test(f.ages)) erreur(id, 'game.json : "ages" au format "6+"');
  if (typeof f.author !== 'string' || !f.author.trim()) erreur(id, 'game.json : "author" obligatoire');
  if (!dateValide(f.added)) erreur(id, 'game.json : "added" doit être une date AAAA-MM-JJ');
  else if (Date.parse(f.added) > Date.now() + 86400000) erreur(id, 'game.json : "added" est dans le futur');
  if (!Number.isInteger(f.version) || f.version < 1) erreur(id, 'game.json : "version" doit être un entier ≥ 1');
  fiches.set(id, f);

  // Consignes de 2026 : jeu riche (20 niveaux au moins) et présentation (sa
  // longueur et les autres textes de la page du jeu : scripts/regles-seo.mjs).
  if (f.consignes !== undefined && (!Number.isInteger(f.consignes) || f.consignes < 1)) erreur(id, 'game.json : "consignes" doit être un entier (2 pour les nouveaux jeux)');
  if (Number(f.consignes) >= 2) {
    if (!Number.isInteger(f.niveaux) || f.niveaux < NIVEAUX_MIN) erreur(id, `game.json : "niveaux" doit indiquer le nombre de niveaux du jeu, ${NIVEAUX_MIN} au moins`);
    if (typeof f.presentation !== 'string' || !f.presentation.trim()) {
      erreur(id, 'game.json : "presentation" obligatoire (« À propos du jeu », 70 à 150 mots : voir CONSIGNES-JEU.md)');
    }
  }
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

// Le jeu affiche-t-il quelque chose (texte ou dessin) ?
async function ecranVisible(cadre) {
  return cadre.evaluate(() => {
    const b = document.body;
    if (!b) return false;
    const texte = b.innerText.trim().length > 0;
    const dessin = [...document.querySelectorAll('canvas, svg, img')].some((e) => e.getBoundingClientRect().width > 20);
    return texte || dessin;
  }).catch(() => false);
}

// Requêtes réseau (http, https, ws) : seules celles vers le site de test sont permises.
function estReseau(url) { return /^(?:https?|wss?):/i.test(url); }

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

      const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'fr-FR' });
      const page = await contexte.newPage();
      const problemes = [];
      page.on('pageerror', (e) => problemes.push(`erreur JavaScript : ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const t = m.text();
        if (/Content Security Policy/i.test(t)) problemes.push(`ressource bloquée : ${t.slice(0, 160)}`);
        else problemes.push(`erreur console : ${t.slice(0, 160)}`);
      });
      page.on('request', (r) => {
        if (estReseau(r.url()) && !r.url().startsWith(`${base}/`)) problemes.push(`appel réseau externe interdit : ${r.url().slice(0, 120)}`);
      });

      await page.goto(`${base}/play.html?id=${id}`);
      await page.waitForTimeout(2500);
      // Le lanceur affiche le jeu via srcdoc : son cadre a pour adresse about:srcdoc.
      const cadre = page.frames().find((f) => f.url() === 'about:srcdoc');
      if (!cadre) {
        erreur(id, 'le jeu ne se charge pas dans le lanceur');
      } else {
        if (!(await ecranVisible(cadre))) erreur(id, 'écran vide au démarrage');

        // Consignes de 2026 : le jeu donne lui-même son nombre réel de niveaux.
        if (consignes2(id)) {
          const n = await cadre.evaluate(() => window.JEL_NIVEAUX).catch(() => undefined);
          const annonce = fiches.get(id).niveaux;
          if (!Number.isInteger(n)) erreur(id, 'window.JEL_NIVEAUX absent : le jeu doit donner son nombre réel de niveaux (ex. window.JEL_NIVEAUX = NIVEAUX.length)');
          else if (n < NIVEAUX_MIN) erreur(id, `le jeu n'a que ${n} niveaux (window.JEL_NIVEAUX) : ${NIVEAUX_MIN} au moins`);
          else if (n !== annonce) erreur(id, `nombre de niveaux différent : ${n} dans le jeu (window.JEL_NIVEAUX), ${annonce} dans game.json ("niveaux")`);
        }

        // Un toucher au centre puis un peu de jeu, pour détecter les erreurs au lancement.
        const boite = await page.locator('#cadre-jeu').boundingBox();
        if (boite) {
          await page.touchscreen.tap(boite.x + boite.width / 2, boite.y + boite.height / 2);
          await page.waitForTimeout(400);
          await page.touchscreen.tap(boite.x + boite.width / 2, boite.y + boite.height * 0.7);
          await page.keyboard.press('Space');
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(1500);
        }
        const debordement = await cadre.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2).catch(() => false);
        if (debordement) avertir(id, 'la page déborde en largeur sur téléphone (défilement horizontal)');
      }
      for (const p of [...new Set(problemes)].slice(0, 5)) erreur(id, p);
      await contexte.close();

      await testerHorsLigne(navigateur, id);
      if (avecPartie) await jouerPartie(navigateur, base, id);

      // Jaquette automatique : capture du jeu au démarrage, format portrait 600 × 800,
      // SANS AUCUN TEXTE (le site affiche le titre traduit par-dessus) : voir jaquette-sans-texte.mjs.
      const dossier = path.join(DOSSIER_JEUX, id);
      if (avecJaquettes && !erreurs.has(id) && !JAQUETTES.some((n) => existsSync(path.join(dossier, n)))) {
        const { capturerSansTexte, convertir } = await import('./jaquette-sans-texte.mjs');
        const png = await capturerSansTexte(navigateur, `${base}/games/${id}/?lang=fr`);
        await writeFile(path.join(dossier, 'cover.jpg'), await convertir(navigateur, png, 'jpeg', 80));
        console.log(`  🖼  ${id} : jaquette cover.jpg (sans texte) créée automatiquement`);
      }
    }
  } finally {
    await navigateur.close();
    serveur.kill();
  }
}

// Hors ligne : le jeu seul (sans le site autour), navigateur coupé du réseau.
// Il doit s'afficher et réagir sans erreur, sans tenter le moindre appel réseau.
async function testerHorsLigne(navigateur, id) {
  const html = await readFile(path.join(DOSSIER_JEUX, id, 'index.html'), 'utf8');
  const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'fr-FR', offline: true });
  const page = await contexte.newPage();
  const problemes = [];
  page.on('pageerror', (e) => problemes.push(`hors ligne : erreur JavaScript : ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problemes.push(`hors ligne : erreur console : ${m.text().slice(0, 160)}`); });
  page.on('request', (r) => { if (estReseau(r.url())) problemes.push(`hors ligne : appel réseau interdit : ${r.url().slice(0, 120)}`); });

  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(1500);
    if (!(await ecranVisible(page.mainFrame()))) problemes.push('hors ligne : écran vide au démarrage');
    await page.touchscreen.tap(195, 422);
    await page.waitForTimeout(400);
    await page.touchscreen.tap(195, 590);
    await page.keyboard.press('Space');
    await page.waitForTimeout(1000);
  } catch (e) {
    problemes.push(`hors ligne : le jeu ne se charge pas (${e.message.split('\n')[0]})`);
  }
  for (const p of [...new Set(problemes)].slice(0, 3)) erreur(id, p);
  await contexte.close();
}

// --------------------------------------------------------------------------
// 3. Partie au hasard (--jouer) : 30 s d'actions variées sur téléphone, avec
//    des captures d'écran à regarder ensuite (captures/<id>/, ignoré par git).
// --------------------------------------------------------------------------

async function jouerPartie(navigateur, base, id) {
  const dossier = path.join(RACINE, 'captures', id);
  await rm(dossier, { recursive: true, force: true });
  await mkdir(dossier, { recursive: true });
  const problemes = [];
  let nbCaptures = 0;
  const surveiller = (page) => {
    page.on('pageerror', (e) => problemes.push(`erreur JavaScript pendant la partie : ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') problemes.push(`erreur console pendant la partie : ${m.text().slice(0, 160)}`); });
  };
  const capturer = async (page, nom) => { await page.screenshot({ path: path.join(dossier, nom) }); nbCaptures++; };

  // Téléphone : accueil, démarrage (tutoriel attendu), puis 100 actions au hasard (≈ 30 s).
  const tel = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'fr-FR' });
  const page = await tel.newPage();
  surveiller(page);
  await page.goto(`${base}/play.html?id=${id}`);
  await page.waitForTimeout(2000);
  await capturer(page, '1-accueil.png');
  const boite = await page.locator('#cadre-jeu').boundingBox();
  if (boite) {
    // Démarrer : bouton « Jouer » (ou équivalent) s'il existe, sinon un toucher au centre.
    const cadre = page.frames().find((f) => f.url() === 'about:srcdoc');
    const bouton = cadre?.getByRole('button', { name: /jouer|commencer|c.est parti|démarrer|play|jugar|jogar|spielen/i }).first();
    if (bouton && await bouton.isVisible().catch(() => false)) await bouton.tap().catch(() => bouton.click());
    else await page.touchscreen.tap(boite.x + boite.width / 2, boite.y + boite.height / 2);
    await page.waitForTimeout(2500);
    await capturer(page, '2-debut.png');

    // Hasard reproductible : la même partie à chaque lancement.
    let graine = 42;
    const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
    const touches = ['Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    for (let i = 1; i <= 100; i++) {
      const x = boite.x + boite.width * (0.1 + 0.8 * hasard());
      const y = boite.y + boite.height * (0.1 + 0.85 * hasard());
      const r = hasard();
      if (r < 0.55) await page.touchscreen.tap(x, y);
      else if (r < 0.8) {                       // glissé
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + (hasard() - 0.5) * 240, y + (hasard() - 0.5) * 240, { steps: 6 });
        await page.mouse.up();
      } else await page.keyboard.press(touches[Math.floor(hasard() * touches.length)]);
      await page.waitForTimeout(300);
      if (i % 25 === 0) await capturer(page, `${2 + i / 25}-partie-${Math.round(i * 0.3)}s.png`);
    }
  }
  await tel.close();

  // Ordinateur : la mise en page doit aussi tenir sur grand écran.
  const pc = await navigateur.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' });
  const pagePc = await pc.newPage();
  surveiller(pagePc);
  await pagePc.goto(`${base}/play.html?id=${id}`);
  await pagePc.waitForTimeout(2000);
  await capturer(pagePc, '7-ordinateur.png');
  await pc.close();

  for (const p of [...new Set(problemes)].slice(0, 5)) erreur(id, p);
  console.log(`  📸 ${id} : ${nbCaptures} captures dans captures/${id}/`);
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
