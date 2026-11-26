#!/usr/bin/env node
// ==========================================================================
// tester-invite-pseudo.mjs — bannière « Choisis ton pseudo » de l'accueil
// (public/invite-pseudo.js, docs/cadrage-fidelisation.md, section 14.14)
//
//   node scripts/tester-invite-pseudo.mjs [--captures] [--sans-build]
//
// Construit le site (node scripts/build-catalog.mjs, sauf --sans-build), puis,
// dans le navigateur, sert public/ avec la vraie API du profil
// (functions/api/profil.js, base SQLite en mémoire) et vérifie :
// - jours de visite : rien aux jours 1 et 2 (un jour compté une fois, sur
//   toutes les pages), la bannière au 3e ; un habitué (record de 3 jours de
//   suite) la voit tout de suite ;
// - place gardée à la visite suivante : même hauteur que la vraie bannière ;
// - fenêtre : nom actuel, démonstration animée, fermeture sans valider (la
//   bannière reste), pseudo trop court, pseudo déjà pris, pseudo accepté
//   (« Bienvenue », tout se ferme, le menu de la pastille s'ouvre, plus de
//   bannière ensuite) ;
// - croix : cachée, encore cachée 2 jours plus tard, de retour au bout de 3 jours ;
// - jamais sur la page d'un jeu ni dans le lanceur ; jamais en même temps que
//   « Installer l'appli » (iPhone imité), dont la place n'est pas gardée ;
// - téléphone 390 px, 360 px en allemand, ordinateur 1 280 px (pas de
//   débordement), mouvement réduit (démonstration figée), stockage refusé
//   (rien d'affiché, aucune erreur).
// --captures : images dans captures/invite-pseudo/ (bannière, fenêtre, trois
// moments de la démonstration, bienvenue, menu ouvert).
// Nécessite Playwright (npm install --no-save playwright) et Chromium
// (npx playwright install chromium, ou CHROMIUM_PATH = chemin de Chrome/Edge).
// Code de sortie : 0 = tout est bon, 1 = au moins un problème.
// ==========================================================================

import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseD1 } from './d1-local.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(RACINE, 'public');
const CAPTURES = path.join(RACINE, 'captures', 'invite-pseudo');
const BASE = 'http://jel.test';
const AVEC_CAPTURES = process.argv.includes('--captures');
const JOUR_MS = 86400000;

let echecs = 0;
function verifier(condition, message, detail) {
  if (condition) console.log(`  ✓ ${message}`);
  else { echecs++; console.log(`  ✗ ${message}${detail !== undefined ? ` — obtenu : ${JSON.stringify(detail)}` : ''}`); }
}

if (!process.argv.includes('--sans-build')) {
  console.log('Construction du site…');
  execFileSync(process.execPath, [path.join(RACINE, 'scripts', 'build-catalog.mjs')], { cwd: RACINE, stdio: 'ignore' });
}
if (!existsSync(path.join(PUBLIC, 'index.html'))) {
  console.error('public/index.html manque : lancer node scripts/build-catalog.mjs');
  process.exit(1);
}
const R = await import('../public/profil-reglages.js');
const textes = JSON.parse(await readFile(path.join(PUBLIC, 'i18n', 'site', 'fr.json'), 'utf8'));
const CATALOGUE = await readFile(path.join(PUBLIC, 'catalog.json'), 'utf8');
const unJeu = JSON.parse(CATALOGUE).games.find((j) => existsSync(path.join(PUBLIC, 'jeux', j.id, 'index.html')));

let playwright;
try { playwright = await import('playwright'); }
catch {
  console.error('Playwright manque : npm install --no-save playwright');
  process.exit(1);
}

// Serveur imité : fichiers de public/, vraie fonction du profil, base en mémoire.
const env = { DB: baseD1(), IP_SALT: 'sel', ASSETS: { fetch: async () => new Response(CATALOGUE) } };
const { onRequestPost: apiProfil } = await import('../functions/api/profil.js');
async function appelApi(corps, ip = '192.0.2.1') {
  const r = await apiProfil({
    request: new Request(`${BASE}/api/profil`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE, 'CF-Connecting-IP': ip }, body: JSON.stringify(corps) }),
    env, waitUntil: () => {},
  });
  let donnees = {};
  try { donnees = await r.json(); } catch { /* réponse vide */ }
  return { statut: r.status, donnees };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const navigateur = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let ipSuivante = 10;

// Un appareil : un contexte de navigateur avec sa propre adresse IP.
async function appareil({ largeur = 390, hauteur = 844, locale = 'fr-FR', ua, mouvementReduit = false, sansStockage = false } = {}) {
  const telephone = largeur < 720;
  const contexte = await navigateur.newContext({
    viewport: { width: largeur, height: hauteur }, isMobile: telephone, hasTouch: telephone, locale,
    serviceWorkers: 'block', reducedMotion: mouvementReduit ? 'reduce' : 'no-preference', ...(ua ? { userAgent: ua } : {}),
  });
  const ip = `203.0.113.${ipSuivante++}`;
  await contexte.addInitScript((refus) => {
    if (refus) Object.defineProperty(window, 'localStorage', { get() { throw new Error('stockage refusé'); } });
    // Au chargement de la page (avant les réponses du serveur) : place gardée ou non.
    document.addEventListener('DOMContentLoaded', () => {
      const b = document.getElementById('invite-pseudo');
      const racine = document.documentElement;
      window.etatAuChargement = {
        invite: racine.classList.contains('avec-invite-pseudo'),
        installer: racine.classList.contains('avec-installer'),
        hauteur: b ? b.getBoundingClientRect().height : null,
        visible: b ? !b.hidden : null,
      };
    });
  }, sansStockage);
  await contexte.route(`${BASE}/**`, async (route) => {
    const requete = route.request();
    const url = new URL(requete.url());
    let p = decodeURIComponent(url.pathname);
    if (p === '/api/profil') {
      const r = await apiProfil({
        request: new Request(`${BASE}/api/profil`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE, 'CF-Connecting-IP': ip }, body: requete.postData() || '' }),
        env, waitUntil: () => {},
      });
      return route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text() });
    }
    if (p.startsWith('/api/')) return route.fulfill({ status: 503, body: '' });
    if (p === '/play') p = '/play.html';
    const fichier = path.join(PUBLIC, p.endsWith('/') ? `${p}index.html` : p);
    if (!fichier.startsWith(PUBLIC) || !existsSync(fichier)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(fichier)] || 'application/octet-stream', body: await readFile(fichier) });
  });
  // Turnstile et services extérieurs : jamais appelés pendant ces essais.
  await contexte.route(/^https?:\/\/(?!jel\.test)/, (route) => route.abort());
  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  const a = {
    contexte, page, erreurs,
    async ouvrir(chemin = '/') {
      await page.goto(`${BASE}${chemin}`);
      if (sansStockage) { await page.waitForTimeout(1500); return; }
      await page.waitForFunction(() => {
        try { return !!JSON.parse(localStorage.getItem('fmg-profil') || '{}').etat; } catch { return false; }
      }, null, { timeout: 15000 });
      await page.waitForFunction(() => document.querySelector('.pastille-niveau')?.textContent !== '·', null, { timeout: 15000 });
      await page.waitForTimeout(300);
    },
    memoire: () => page.evaluate(() => JSON.parse(localStorage.getItem('fmg-invite-pseudo') || 'null')),
    poser: (valeur) => page.evaluate((v) => localStorage.setItem('fmg-invite-pseudo', JSON.stringify(v)), valeur),
    visible: () => page.evaluate(() => { const b = document.getElementById('invite-pseudo'); return !!b && !b.hidden; }),
    installerVisible: () => page.evaluate(() => { const b = document.getElementById('installer-banniere'); return !!b && !b.hidden; }),
    fenetreOuverte: () => page.evaluate(() => document.getElementById('invite-pseudo-fenetre')?.open === true),
    message: () => page.evaluate(() => document.querySelector('#invite-pseudo-fenetre .invite-message').textContent),
    profil: () => page.evaluate(() => JSON.parse(localStorage.getItem('fmg-profil') || '{}').etat),
    async capture(nom, options = {}) {
      if (!AVEC_CAPTURES) return;
      await mkdir(CAPTURES, { recursive: true });
      await page.screenshot({ path: path.join(CAPTURES, `${nom}.png`), ...options });
    },
  };
  return a;
}

// Troisième jour de visite : deux jours déjà comptés, le dernier avant aujourd'hui.
const DEUX_JOURS = { jours: 2, dernier: '2000-01-02' };
// Moment de la démonstration (ms de sa boucle de 6 s) : toutes ses animations figées à cet instant.
const figerDemo = (page, ms) => page.evaluate((t) => {
  for (const a of document.querySelector('#invite-pseudo-fenetre .invite-demo').getAnimations({ subtree: true })) { a.pause(); a.currentTime = t; }
}, ms);

try {
  // Un autre joueur a déjà pris « Lina ».
  const lina = await appelApi({ action: 'creer', jour: '2026-11-26' }, '192.0.2.50');
  const linaPseudo = await appelApi({ action: 'pseudo', jeton: lina.donnees.jeton, pseudo: 'Lina' }, '192.0.2.50');
  verifier(linaPseudo.statut === 200, 'préparation : un autre joueur s\'appelle « Lina »', linaPseudo);

  console.log('Jours de visite (téléphone 390 px, français)');
  const tel = await appareil();
  await tel.ouvrir('/');
  verifier(!(await tel.visible()), 'jour 1 : pas de bannière');
  verifier((await tel.memoire())?.jours === 1, 'jour 1 compté', await tel.memoire());
  await tel.ouvrir('/');
  verifier((await tel.memoire())?.jours === 1, 'deuxième visite du même jour : toujours 1 jour', await tel.memoire());
  await tel.poser({ jours: 1, dernier: '2000-01-01' });
  await tel.ouvrir('/');
  verifier((await tel.memoire())?.jours === 2 && !(await tel.visible()), 'jour 2 : pas encore de bannière', await tel.memoire());
  await tel.poser(DEUX_JOURS);
  await tel.ouvrir('/');
  verifier(await tel.visible(), 'jour 3 : la bannière « Choisis ton pseudo » apparaît');
  verifier((await tel.memoire())?.montree === true, 'jour 3 : sa place sera gardée à la visite suivante', await tel.memoire());
  verifier(await tel.page.evaluate(() => document.querySelector('#invite-pseudo .invite-avatar')?.classList.contains('avatar')), 'jour 3 : l\'avatar du joueur est dans la bannière');
  const titreBanniere = await tel.page.textContent('#invite-pseudo-banniere-titre');
  verifier(titreBanniere === textes['invitePseudo.titre'], 'texte de la bannière en français', titreBanniere);
  await tel.capture('1-banniere-telephone', { clip: { x: 0, y: 0, width: 390, height: 300 } });

  // Visite suivante : place gardée dès le chargement, à la hauteur de la vraie bannière.
  await tel.ouvrir('/');
  const charge = await tel.page.evaluate(() => window.etatAuChargement);
  const hauteurReelle = await tel.page.evaluate(() => document.getElementById('invite-pseudo').getBoundingClientRect().height);
  verifier(charge.invite && !charge.installer && !charge.visible, 'visite suivante : place gardée par le script de tête, avant les scripts', charge);
  verifier(Math.abs(charge.hauteur - hauteurReelle) < 0.5 && hauteurReelle >= 64, `place gardée = hauteur de la bannière (${hauteurReelle} px) : rien ne bouge`, { charge, hauteurReelle });
  verifier(await tel.page.evaluate(() => !document.documentElement.classList.contains('avec-invite-pseudo')), 'bannière montrée : la place gardée est rendue');

  console.log('Fenêtre');
  await tel.page.click('[data-invite="choisir"]');
  verifier(await tel.fenetreOuverte(), '« Choisir » ouvre la fenêtre');
  const actuel = await tel.page.textContent('.invite-actuel');
  const etatTel = await tel.profil();
  // Le numéro est écrit à la française (« Joueur 63 914 ») : on compare ses chiffres.
  const [avantNom, apresNom] = textes['invitePseudo.actuel'].split('{nom}');
  const nomActuel = actuel.startsWith(avantNom) && actuel.endsWith(apresNom) ? actuel.slice(avantNom.length, actuel.length - apresNom.length) : '';
  verifier(nomActuel.startsWith('Joueur ') && nomActuel.replace(/\D/g, '') === String(etatTel.numero), 'la fenêtre rappelle le nom actuel « Joueur <nombre> »', actuel);
  const animations = await tel.page.evaluate(() => document.querySelector('#invite-pseudo-fenetre .invite-demo').getAnimations({ subtree: true }).length);
  verifier(animations >= 6, 'démonstration animée (doigt, pastille, menu, 3 lignes)', animations);
  const liens = await tel.page.evaluate(() => [...document.querySelectorAll('[data-invite-lien]')].map((a) => a.getAttribute('href')));
  verifier(liens[0] === '/profil/#bloc-apparence' && liens[1] === '/profil/#bloc-badges' && liens[2] === '/classement/', 'raccourcis : avatar, badges, classement', liens);
  await tel.capture('2-fenetre-telephone');
  for (const [nom, ms] of [['3-demo-toucher', 1560], ['4-demo-menu', 2700], ['5-demo-classement', 4800]]) {
    await figerDemo(tel.page, ms);
    if (AVEC_CAPTURES) await tel.page.locator('#invite-pseudo-fenetre .invite-demo').screenshot({ path: path.join(CAPTURES, `${nom}.png`) });
  }
  await tel.page.click('#invite-pseudo-fenetre [data-invite="fermer"]');
  verifier(!(await tel.fenetreOuverte()) && await tel.visible(), 'fenêtre fermée sans valider : la bannière reste');

  await tel.page.click('[data-invite="choisir"]');
  await tel.page.fill('#invite-pseudo-champ', 'ab');
  await tel.page.click('#invite-pseudo-fenetre [type="submit"]');
  const courtAttendu = textes['profil.pseudo.erreur.longueur'].replace('{min}', R.PSEUDO_MIN).replace('{max}', R.PSEUDO_MAX);
  verifier(await tel.message() === courtAttendu, 'pseudo trop court : message', await tel.message());
  await tel.page.fill('#invite-pseudo-champ', 'Lina');
  await tel.page.click('#invite-pseudo-fenetre [type="submit"]');
  await tel.page.waitForFunction((envoi) => document.querySelector('#invite-pseudo-fenetre .invite-message').textContent !== envoi, textes['profil.envoi']);
  verifier(await tel.message() === textes['profil.pseudo.erreur.pris'], 'pseudo déjà pris : message du serveur', await tel.message());
  await tel.capture('6-erreur-telephone');
  await tel.page.fill('#invite-pseudo-champ', '  Capitaine  ');
  await tel.page.click('#invite-pseudo-fenetre [type="submit"]');
  await tel.page.waitForFunction(() => !document.querySelector('#invite-pseudo-fenetre .invite-reussi').hidden, null, { timeout: 10000 });
  const bienvenue = await tel.page.textContent('.invite-reussi-texte');
  verifier(bienvenue === textes['invitePseudo.bienvenue'].replace('{pseudo}', 'Capitaine'), 'pseudo accepté : « Bienvenue, Capitaine ! »', bienvenue);
  await tel.capture('7-bienvenue-telephone');
  await tel.page.waitForFunction(() => !document.getElementById('invite-pseudo-fenetre').open, null, { timeout: 5000 });
  const apres = await tel.page.evaluate(() => ({
    menu: !document.querySelector('.pastille-menu').hidden,
    nom: document.querySelector('.pastille-tete-nom').textContent,
    banniere: !document.getElementById('invite-pseudo').hidden,
  }));
  verifier(apres.menu && !apres.banniere, 'ensuite : fenêtre et bannière fermées, le menu de la pastille s\'ouvre', apres);
  verifier(apres.nom === 'Capitaine', 'le menu montre le nouveau pseudo', apres.nom);
  await tel.capture('8-menu-ouvert-telephone', { clip: { x: 0, y: 0, width: 390, height: 520 } });
  verifier((await tel.profil()).pseudo === 'Capitaine', 'pseudo enregistré dans le profil');
  await tel.poser({ ...(await tel.memoire()), jours: 9, dernier: '2000-01-03' });
  await tel.ouvrir('/');
  verifier(!(await tel.visible()) && (await tel.memoire())?.montree === false, 'avec un pseudo : plus de bannière ni de place gardée', await tel.memoire());
  verifier(!tel.erreurs.length, 'aucune erreur JavaScript', tel.erreurs);
  await tel.contexte.close();

  console.log('Croix : retour au bout de 3 jours');
  const croix = await appareil();
  await croix.ouvrir('/');
  await croix.poser(DEUX_JOURS);
  await croix.ouvrir('/');
  verifier(await croix.visible(), 'jour 3 : bannière');
  const avant = Date.now();
  await croix.page.click('[data-invite="masquer"]');
  const m = await croix.memoire();
  const attendu = avant + R.INVITE_PSEUDO_RAPPEL_JOURS * JOUR_MS;
  verifier(!(await croix.visible()) && Math.abs(m.masqueeJusqua - attendu) < 60000 && m.montree === false, `croix : cachée ${R.INVITE_PSEUDO_RAPPEL_JOURS} jours`, m);
  await croix.ouvrir('/');
  const chargeCroix = await croix.page.evaluate(() => window.etatAuChargement);
  verifier(!(await croix.visible()) && !chargeCroix.invite, 'même jour : toujours cachée, aucune place gardée', chargeCroix);
  await croix.poser({ ...m, masqueeJusqua: Date.now() + JOUR_MS });
  await croix.ouvrir('/');
  verifier(!(await croix.visible()), '2 jours après la croix : toujours cachée');
  await croix.poser({ ...m, masqueeJusqua: Date.now() - 1000 });
  await croix.ouvrir('/');
  verifier(await croix.visible(), '3 jours après la croix : elle revient');

  console.log('Autres pages');
  await croix.poser({ jours: 5, dernier: '2000-01-04' });
  await croix.ouvrir(`/jeux/${unJeu.id}/`);
  verifier(!(await croix.page.$('#invite-pseudo, .invite-banniere')), `page d'un jeu (${unJeu.id}) : pas de bannière`);
  verifier((await croix.memoire())?.jours === 6, 'page d\'un jeu : le jour de visite est compté', await croix.memoire());
  await croix.ouvrir(`/play?id=${unJeu.id}&lang=fr`);
  verifier(!(await croix.page.$('#invite-pseudo, .invite-banniere')), 'lanceur : pas de bannière');
  verifier(!croix.erreurs.length, 'aucune erreur JavaScript', croix.erreurs);
  await croix.contexte.close();

  console.log('Habitué (record de 3 jours de suite)');
  const habitue = await appareil();
  await habitue.ouvrir('/');
  verifier(!(await habitue.visible()), 'premier jour compté sur cet appareil : pas de bannière');
  await env.DB.prepare('UPDATE profils SET serie_record = 3 WHERE id = ?').bind((await habitue.profil()).id).run();
  await habitue.page.evaluate(() => import('/profil.js').then((m) => m.synchroniser()));
  await habitue.page.waitForTimeout(300);
  verifier(await habitue.visible(), 'record de 3 jours de suite (joueur d\'avant la bannière) : elle apparaît sans attendre');
  await habitue.contexte.close();

  console.log('Avec « Installer l\'appli » (iPhone imité)');
  const iphone = await appareil({ ua: IPHONE });
  await iphone.ouvrir('/');
  verifier(await iphone.installerVisible() && !(await iphone.visible()), 'jour 1 : « Installer l\'appli » seule');
  await iphone.poser(DEUX_JOURS);
  await iphone.ouvrir('/');
  verifier(await iphone.visible() && !(await iphone.installerVisible()), 'jour 3 : « Choisis ton pseudo » prend la place, une seule bannière');
  verifier((await iphone.page.evaluate(() => JSON.parse(localStorage.getItem('fmg-installer') || '{}'))).montree === true, '« Installer l\'appli » garde sa mémoire (elle attend)');
  await iphone.ouvrir('/');
  const chargeIphone = await iphone.page.evaluate(() => window.etatAuChargement);
  verifier(chargeIphone.invite && !chargeIphone.installer, 'visite suivante : seule la place du pseudo est gardée', chargeIphone);
  verifier(await iphone.visible() && !(await iphone.installerVisible()), 'visite suivante : toujours une seule bannière');
  await iphone.page.click('[data-invite="masquer"]');
  verifier(!(await iphone.installerVisible()), 'croix du pseudo : « Installer l\'appli » attend la visite suivante');
  await iphone.ouvrir('/');
  verifier(await iphone.installerVisible() && !(await iphone.visible()), 'visite suivante : « Installer l\'appli » revient');
  verifier(!iphone.erreurs.length, 'aucune erreur JavaScript', iphone.erreurs);
  await iphone.contexte.close();

  console.log('Allemand, 360 px');
  const de = await appareil({ largeur: 360, hauteur: 780, locale: 'de-DE' });
  await de.ouvrir('/de/');
  await de.poser(DEUX_JOURS);
  await de.ouvrir('/de/');
  const textesDe = JSON.parse(await readFile(path.join(PUBLIC, 'i18n', 'site', 'de.json'), 'utf8'));
  verifier(await de.visible() && await de.page.textContent('#invite-pseudo-banniere-titre') === textesDe['invitePseudo.titre'], 'bannière en allemand');
  const deborde = await de.page.evaluate(() => {
    const b = document.getElementById('invite-pseudo');
    return { page: document.documentElement.scrollWidth > innerWidth, banniere: b.scrollWidth > b.clientWidth };
  });
  verifier(!deborde.page && !deborde.banniere, 'rien ne déborde à 360 px', deborde);
  await de.capture('9-banniere-allemand-360', { clip: { x: 0, y: 0, width: 360, height: 300 } });
  await de.page.click('[data-invite="choisir"]');
  const debordeFenetre = await de.page.evaluate(() => {
    const f = document.getElementById('invite-pseudo-fenetre');
    return [...f.querySelectorAll('.invite-demo-ligne, .invite-raccourcis a, .invite-saisie')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim());
  });
  verifier(!debordeFenetre.length, 'fenêtre à 360 px : textes entiers', debordeFenetre);
  await figerDemo(de.page, 2700);
  await de.capture('10-fenetre-allemand-360');
  verifier(!de.erreurs.length, 'aucune erreur JavaScript', de.erreurs);
  await de.contexte.close();

  console.log('Ordinateur, 1 280 px');
  const ordi = await appareil({ largeur: 1280, hauteur: 800 });
  await ordi.ouvrir('/');
  await ordi.poser(DEUX_JOURS);
  await ordi.ouvrir('/');
  verifier(await ordi.visible(), 'bannière sur ordinateur');
  await ordi.capture('11-banniere-ordinateur', { clip: { x: 0, y: 0, width: 1280, height: 330 } });
  await ordi.page.click('[data-invite="choisir"]');
  verifier(await ordi.page.evaluate(() => document.activeElement?.id === 'invite-pseudo-champ'), 'ordinateur : le curseur est dans le champ');
  await figerDemo(ordi.page, 2700);
  await ordi.capture('12-fenetre-ordinateur');
  await ordi.contexte.close();

  console.log('Mouvement réduit');
  const calme = await appareil({ mouvementReduit: true });
  await calme.ouvrir('/');
  await calme.poser(DEUX_JOURS);
  await calme.ouvrir('/');
  await calme.page.click('[data-invite="choisir"]');
  const fige = await calme.page.evaluate(() => {
    const demo = document.querySelector('#invite-pseudo-fenetre .invite-demo');
    return { animations: demo.getAnimations({ subtree: true }).length, menu: getComputedStyle(demo.querySelector('.invite-demo-menu')).opacity };
  });
  verifier(fige.animations === 0 && fige.menu === '1', 'démonstration figée, menu ouvert', fige);
  await calme.contexte.close();

  console.log('Stockage refusé');
  const refus = await appareil({ sansStockage: true });
  await refus.ouvrir('/');
  await refus.page.waitForTimeout(1500);
  verifier(!(await refus.visible()), 'pas de bannière (la croix ne pourrait pas être retenue)');
  verifier(!refus.erreurs.length, 'aucune erreur JavaScript', refus.erreurs);
  await refus.contexte.close();
} finally {
  await navigateur.close();
}

console.log(echecs ? `\n${echecs} problème(s).` : '\nInvitation au pseudo : tout est bon.');
if (AVEC_CAPTURES) console.log(`Captures : ${CAPTURES}`);
process.exit(echecs ? 1 : 0);
