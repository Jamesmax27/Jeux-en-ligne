#!/usr/bin/env node
// ==========================================================================
// tester-sauvegardes-nuage.mjs — la progression des jeux suit-elle d'un
// appareil à l'autre ? (public/sauvegardes-nuage.js, docs/cadrage-fidelisation.md,
// section 14.13)
//
//   node scripts/tester-sauvegardes-nuage.mjs
//
// 1. Sans navigateur : le module de l'appareil (localStorage imité) — à
//    envoyer, limites de taille, Terres Cubiques ignoré, réponse appliquée,
//    écriture pendant l'envoi, réponse tardive, changement de profil.
// 2. Dans le navigateur : deux appareils (deux contextes Playwright) sur le
//    même profil, lanceur du site (public/play.html) servi par Playwright et
//    vraie API du profil (functions/api/profil.js, base SQLite en mémoire,
//    Turnstile imité). Le jeu est remplacé par une page minuscule qui envoie
//    les messages « jel-sauvegarde » comme save.js et montre ce que le lanceur
//    lui donne (window.JEL_SAUVEGARDES). Vérifie : sauvegarde envoyée, code de
//    sauvegarde saisi sur le 2e appareil (fusion : la plus avancée gagne),
//    « Continuer » au bon niveau au lancement, nouvelle partie plus basse
//    gardée, effacement qui suit, conflit hors ligne, envoi à la fermeture
//    (sendBeacon) reconnu, attente de 2 s au plus quand le serveur traîne,
//    aucune attente sans serveur.
// Nécessite Playwright (npm install --no-save playwright) et Chromium
// (npx playwright install chromium, ou CHROMIUM_PATH = chemin de Chrome/Edge).
// Code de sortie : 0 = tout est bon, 1 = au moins un problème.
// ==========================================================================

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseD1 } from './d1-local.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(RACINE, 'public');
const BASE = 'http://jel.test';
const JEU = 'jeu-test';

let echecs = 0;
function verifier(condition, message, detail) {
  if (condition) console.log(`  ✓ ${message}`);
  else { echecs++; console.log(`  ✗ ${message}${detail !== undefined ? ` — obtenu : ${JSON.stringify(detail)}` : ''}`); }
}
const sv = (niveau, score = 0, extra = {}) => JSON.stringify({ v: 1, niveau, score, options: {}, date: Date.now(), ...extra });

// ==========================================================================
// 1. Module de l'appareil, sans navigateur
// ==========================================================================
console.log('Module de l\'appareil (sans navigateur)');
{
  const magasin = new Map();
  globalThis.localStorage = {
    getItem: (k) => (magasin.has(k) ? magasin.get(k) : null),
    setItem: (k, v) => { magasin.set(k, String(v)); },
    removeItem: (k) => { magasin.delete(k); },
    key: (i) => [...magasin.keys()][i] ?? null,
    get length() { return magasin.size; },
  };
  const R = await import('../public/profil-reglages.js');
  const N = await import('../public/sauvegardes-nuage.js');

  magasin.set('save_ancien', sv(4));
  magasin.set('save_terres-cubiques', sv(1));
  magasin.set('fmg-profil', '{}');
  verifier(N.enAttente(), 'sauvegardes déjà sur l\'appareil : à envoyer au premier passage');
  let liste = N.aEnvoyer();
  verifier(liste.length === 1 && liste[0].jeu === 'ancien' && liste[0].base === 0, 'Terres Cubiques reste sur l\'appareil, les autres partent avec la version 0', liste);
  N.noter('terres-cubiques');
  verifier(N.aEnvoyer().every((a) => a.jeu !== 'terres-cubiques'), 'écriture de Terres Cubiques : jamais envoyée');

  N.noterEnvoi(liste);
  verifier(N.aEnvoyer()[0].envoye === N.empreinteSauvegarde(sv(4)) || N.aEnvoyer()[0].envoye?.length > 0, 'contenu envoyé : empreinte gardée jusqu\'à la réponse');
  N.appliquer([{ jeu: 'ancien', statut: 'ok', version: 1 }], liste);
  verifier(!N.enAttente(), 'réponse « ok » : plus rien à envoyer');

  // Écriture pendant l'envoi : la nouvelle sauvegarde reste à envoyer, sur la nouvelle version.
  magasin.set('save_ancien', sv(5)); N.noter('ancien');
  liste = N.aEnvoyer();
  magasin.set('save_ancien', sv(6)); N.noter('ancien');
  N.appliquer([{ jeu: 'ancien', statut: 'ok', version: 2 }], liste);
  liste = N.aEnvoyer();
  verifier(liste.length === 1 && liste[0].base === 2 && JSON.parse(liste[0].donnees).niveau === 6, 'le jeu a écrit pendant l\'envoi : la nouvelle sauvegarde part sur la version 2', liste);

  // Conflit perdu : la sauvegarde du serveur remplace celle de l'appareil.
  const gagnante = sv(9);
  let remplaces = N.appliquer([{ jeu: 'ancien', statut: 'perdu', version: 3, donnees: gagnante }], liste);
  verifier(remplaces[0] === 'ancien' && magasin.get('save_ancien') === gagnante && !N.enAttente(), 'conflit perdu : sauvegarde du serveur recopiée sur l\'appareil');
  // Effacement venu du serveur.
  remplaces = N.appliquer([{ jeu: 'ancien', statut: 'perdu', version: 4, donnees: null }], [{ jeu: 'ancien', base: 3, lire: true }]);
  verifier(remplaces[0] === 'ancien' && !magasin.has('save_ancien'), 'effacement du serveur : sauvegarde retirée de l\'appareil');
  // Réponse tardive (le jeu a déjà démarré) : rien n'est recopié, la version reste à relire.
  magasin.set('save_autre', sv(2));
  N.appliquer([{ jeu: 'autre', statut: 'ok', version: 1 }], [{ jeu: 'autre', base: 0, donnees: magasin.get('save_autre') }]);
  remplaces = N.appliquer([{ jeu: 'autre', statut: 'perdu', version: 5, donnees: sv(8) }], [{ jeu: 'autre', base: 1, lire: true }], { tardive: true });
  verifier(!remplaces.length && JSON.parse(magasin.get('save_autre')).niveau === 2 && N.articleLancement('autre').base === 1, 'réponse arrivée après le démarrage du jeu : rien de recopié, relue au lancement suivant');
  verifier(N.articleLancement('terres-cubiques') === null, 'lancement de Terres Cubiques : pas de lecture du serveur');
  // Refus : la sauvegarde reste sur l'appareil, sans être renvoyée.
  magasin.set('save_inconnu', sv(1)); N.noter('inconnu');
  liste = N.aEnvoyer();
  N.appliquer([{ jeu: 'inconnu', statut: 'refuse', version: 0 }], liste);
  verifier(!N.enAttente() && magasin.has('save_inconnu'), 'sauvegarde refusée : gardée sur l\'appareil, pas renvoyée');

  // Tailles : trop grosse pour le serveur, limite d'un envoi, envoi de fermeture.
  magasin.set('save_gros', sv(1, 0, { carte: 'x'.repeat(R.SAUVEGARDE_SERVEUR_MAX) })); N.noter('gros');
  verifier(N.aEnvoyer().length === 0 && !N.enAttente(), `plus de ${R.SAUVEGARDE_SERVEUR_MAX} caractères : reste sur l'appareil`);
  for (let i = 0; i < 25; i++) { magasin.set(`save_j${i}`, sv(i + 1, 0, { remplissage: 'y'.repeat(3000) })); N.noter(`j${i}`); }
  verifier(N.aEnvoyer().length === R.SAUVEGARDES_PAR_ENVOI, `au plus ${R.SAUVEGARDES_PAR_ENVOI} sauvegardes par envoi`);
  const beacon = N.aEnvoyer(10000);
  verifier(beacon.length === 3, 'envoi de fermeture : seulement ce qui tient dans la place donnée', beacon.length);

  // Changement de profil : tout repart, sans version connue.
  N.oublier();
  liste = N.aEnvoyer(1e9);
  verifier(liste.every((a) => a.base === 0) && liste.some((a) => a.jeu === 'autre'), 'nouveau profil : toutes les sauvegardes repartent avec la version 0');
  delete globalThis.localStorage;
}

// ==========================================================================
// 2. Deux appareils dans le navigateur
// ==========================================================================
let playwright;
try { playwright = await import('playwright'); }
catch {
  console.error('Playwright manque : npm install --no-save playwright');
  process.exit(1);
}

// Serveur imité : vraie fonction du profil, base en mémoire, Turnstile imité.
const CATALOGUE = { games: [{ id: JEU, title: 'Jeu de test', version: 1, play: `games/${JEU}/?v=1`, cover: '', genre: 'arcade', univers: ['espace'], ages: '6+' }] };
const env = {
  DB: baseD1(),
  IP_SALT: 'sel',
  TURNSTILE_SECRET: 'secret',
  ASSETS: { fetch: async () => new Response(JSON.stringify(CATALOGUE)) },
};
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).includes('challenges.cloudflare.com')) {
    const jeton = options.body.get('response');
    return new Response(JSON.stringify({ success: jeton.startsWith('ok-'), action: jeton.split('-')[1] }));
  }
  return vraiFetch(url, options);
};
const { onRequestPost: apiProfil } = await import('../functions/api/profil.js');
const versionServeur = async () => env.DB.prepare('SELECT version, donnees FROM profils_sauvegardes WHERE jeu = ?').bind(JEU).first();

// Jeu imité : envoie ses sauvegardes comme save.js (message au lanceur) et
// garde dans le titre ce que le lanceur lui a donné.
const JEU_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>test</title></head><body>
<script>
  window.donnee = (window.JEL_SAUVEGARDES || {})['save_${JEU}'] ?? null;
  window.ecrire = (valeur) => window.parent.postMessage({ type: 'jel-sauvegarde', cle: 'save_${JEU}', valeur }, '*');
</script><p>jeu de test</p></body></html>`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

// Un appareil : un contexte de navigateur, avec son adresse IP, et des réglages de l'API (lenteur, panne).
async function appareil(navigateur, ip) {
  const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR', serviceWorkers: 'block' });
  const reglage = { lenteurSauvegarde: 0, panne: false, beacons: 0 };
  // Turnstile imité : un jeton « ok-<action> », accepté par le faux vérificateur ci-dessus.
  await contexte.addInitScript(() => {
    window.turnstile = { render: (zone, o) => { setTimeout(() => o.callback(`ok-${o.action}`), 10); return 1; }, remove() {} };
  });
  await contexte.route(`${BASE}/**`, async (route) => {
    const requete = route.request();
    const url = new URL(requete.url());
    let p = decodeURIComponent(url.pathname);
    if (p === '/catalog.json') return route.fulfill({ status: 200, contentType: TYPES['.json'], body: JSON.stringify(CATALOGUE) });
    if (p === '/api/profil') {
      if (reglage.panne) return route.fulfill({ status: 503, body: '' });
      const corps = requete.postData() || '';
      let action = null;
      try { action = JSON.parse(corps).action; } catch { /* corps illisible */ }
      if (action === 'sauvegarde' && reglage.lenteurSauvegarde) await new Promise((ok) => setTimeout(ok, reglage.lenteurSauvegarde));
      const r = await apiProfil({
        request: new Request(`${BASE}/api/profil`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE, 'CF-Connecting-IP': ip }, body: corps }),
        env, waitUntil: () => {},
      });
      return route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text() });
    }
    if (p.startsWith('/api/')) return route.fulfill({ status: 503, body: '' });
    if (p.startsWith(`/games/${JEU}/`)) return route.fulfill({ status: 200, contentType: TYPES['.html'], body: JEU_HTML });
    if (p === '/play') p = '/play.html';
    const fichier = path.join(PUBLIC, p.endsWith('/') ? p + 'index.html' : p);
    if (!fichier.startsWith(PUBLIC) || !existsSync(fichier)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(fichier)] || 'application/octet-stream', body: await readFile(fichier) });
  });
  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  // sendBeacon compté (pour l'essai de l'envoi à la fermeture).
  page.on('request', (r) => { if (r.url().endsWith('/api/profil') && r.resourceType() === 'ping') reglage.beacons++; });
  const cadre = () => page.frames().find((f) => f.url() === 'about:srcdoc');
  const a = {
    contexte, page, reglage, erreurs,
    // Ouvre le jeu dans le lanceur ; renvoie le temps mis et la sauvegarde donnée au jeu.
    async lancer() {
      const debut = Date.now();
      await page.goto(`${BASE}/play?id=${JEU}&lang=fr`);
      await page.waitForFunction(() => {
        const f = document.querySelector('#cadre-jeu');
        return f && f.srcdoc && f.srcdoc.includes('jeu de test');
      }, null, { timeout: 15000 });
      const duree = Date.now() - debut;
      await page.waitForTimeout(200);
      const donnee = await cadre()?.evaluate(() => window.donnee);
      return { duree, niveau: donnee ? JSON.parse(donnee).niveau : null };
    },
    ecrire: (valeur) => cadre().evaluate((v) => window.ecrire(v), valeur),
    profil: (f, arg) => page.evaluate(f, arg),
    sync: () => page.evaluate(() => import('/profil.js').then((m) => m.synchroniser())),
    locale: () => page.evaluate((c) => localStorage.getItem(c), `save_${JEU}`),
  };
  return a;
}

console.log('Deux appareils sur le même profil (navigateur)');
const navigateur = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const pc = await appareil(navigateur, '203.0.113.10');
  const tel = await appareil(navigateur, '198.51.100.20');

  // Premier appareil : partie jusqu'au niveau 5, envoyée avec le profil.
  let l = await pc.lancer();
  verifier(l.niveau === null, 'premier lancement sur le PC : aucune sauvegarde');
  await pc.page.waitForFunction(() => JSON.parse(localStorage.getItem('fmg-profil') || '{}').jeton, null, { timeout: 10000 });
  await pc.ecrire(sv(5, 120));
  await pc.sync();
  let serveur = await versionServeur();
  verifier(serveur?.version === 1 && JSON.parse(serveur.donnees).niveau === 5, 'sauvegarde du PC envoyée au serveur', serveur);
  const { code } = await pc.profil(() => import('/profil.js').then((m) => m.demanderCode()));
  verifier(typeof code === 'string' && code.split('-').length >= 5, 'code de sauvegarde obtenu', code);

  // Deuxième appareil : il avait sa propre partie (niveau 2), puis on y tape le code.
  l = await tel.lancer();
  await tel.page.waitForFunction(() => JSON.parse(localStorage.getItem('fmg-profil') || '{}').jeton, null, { timeout: 10000 });
  await tel.ecrire(sv(2, 10));
  const restauration = await tel.profil((c) => import('/profil.js').then((m) => m.restaurer(c)), code);
  verifier(restauration?.ok === true, 'code saisi sur le téléphone', restauration);
  await tel.sync();
  verifier(JSON.parse(await tel.locale() || 'null')?.niveau === 5, 'après le code : la partie la plus avancée (niveau 5 du PC) remplace celle du téléphone');
  l = await tel.lancer();
  verifier(l.niveau === 5, 'lancement sur le téléphone : « Continuer » au niveau 5', l);

  // Nouvelle partie sur le téléphone (niveau 1) : un seul appareil a joué, elle est gardée.
  await tel.ecrire(sv(1, 0));
  await tel.sync();
  serveur = await versionServeur();
  verifier(JSON.parse(serveur.donnees).niveau === 1, 'nouvelle partie plus basse sur le téléphone : gardée par le serveur', serveur);
  await pc.sync(); // le PC apprend qu'il y a maintenant 2 appareils (à son prochain envoi)
  l = await pc.lancer();
  verifier(l.niveau === 1, 'lancement sur le PC : la nouvelle partie du téléphone (niveau 1)', l);

  // Effacement sur le PC : suit sur le téléphone.
  await pc.ecrire(null);
  await pc.sync();
  l = await tel.lancer();
  verifier(l.niveau === null && (await tel.locale()) === null, 'sauvegarde effacée sur le PC : effacée aussi sur le téléphone', l);

  // Conflit : le PC joue hors ligne (niveau 8) pendant que le téléphone joue (niveau 3).
  l = await pc.lancer();
  await pc.contexte.setOffline(true);
  await pc.ecrire(sv(8, 300));
  await pc.sync();
  await tel.ecrire(sv(3, 40));
  await tel.sync();
  verifier(JSON.parse((await versionServeur()).donnees).niveau === 3, 'pendant la coupure : le téléphone a envoyé son niveau 3');
  await pc.contexte.setOffline(false);
  await pc.sync();
  verifier(JSON.parse((await versionServeur()).donnees).niveau === 8, 'retour du réseau : conflit, la partie la plus avancée (niveau 8 du PC) gagne');
  l = await tel.lancer();
  verifier(l.niveau === 8, 'lancement sur le téléphone : niveau 8', l);

  // Envoi à la fermeture (sendBeacon, réponse non lue) puis nouvelle partie plus basse : pas de faux conflit.
  await tel.ecrire(sv(10, 500));
  const beaconsAvant = tel.reglage.beacons;
  await tel.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await tel.page.waitForTimeout(800);
  verifier(tel.reglage.beacons > beaconsAvant && JSON.parse((await versionServeur()).donnees).niveau === 10, 'page cachée : la sauvegarde part avec l\'envoi de fermeture', tel.reglage.beacons);
  await tel.ecrire(sv(1, 0));
  await tel.sync();
  verifier(JSON.parse((await versionServeur()).donnees).niveau === 1, 'nouvelle partie juste après un envoi de fermeture : gardée (le serveur reconnaît l\'envoi précédent)');

  // Serveur lent : le jeu démarre au bout de 2 s au plus, avec la sauvegarde de l'appareil.
  tel.reglage.lenteurSauvegarde = 6000;
  l = await tel.lancer();
  verifier(l.duree < 4500 && l.niveau === 1, `serveur lent : le jeu démarre quand même (${l.duree} ms), avec la sauvegarde de l'appareil`, l);
  tel.reglage.lenteurSauvegarde = 0;
  tel.reglage.panne = true;
  l = await tel.lancer();
  verifier(l.duree < 2500 && l.niveau === 1, `serveur en panne : aucune attente (${l.duree} ms)`, l);
  tel.reglage.panne = false;

  verifier(!pc.erreurs.length && !tel.erreurs.length, 'aucune erreur JavaScript', [...pc.erreurs, ...tel.erreurs]);
} finally {
  await navigateur.close();
}

console.log(echecs ? `\n${echecs} test(s) en échec.` : '\nSauvegardes d\'un appareil à l\'autre : tout est bon.');
process.exit(echecs ? 1 : 0);
