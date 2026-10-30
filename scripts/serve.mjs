#!/usr/bin/env node
// ==========================================================================
// serve.mjs — petit serveur local pour tester le site sur votre ordinateur.
//   npm run dev   → construit le catalogue puis ouvre http://localhost:8080
// Pour tester sur votre téléphone (même Wi-Fi) : utilisez l'adresse
// « Réseau » affichée au démarrage.
// Reproduit la règle de sécurité des jeux (aucun accès Internet) et l'interdiction
// d'afficher le lanceur dans le cadre d'un autre site, comme en ligne,
// et les adresses de Cloudflare Pages : « /play » sert play.html, un dossier sert
// son index.html, une adresse inconnue reçoit 404.html avec le code 404, et les
// redirections de public/_redirects (adresses exactes, écrites par le build) s'appliquent.
// L'API des votes n'existe pas en local ; celle du suivi des parties répond à vide.
// TENDANCES_EXEMPLE=1 : /api/tendances renvoie les 24 premiers jeux du catalogue
// (pour voir la bande « Tendances » ; sans la variable, elle reste cachée).
//   PowerShell : $env:TENDANCES_EXEMPLE='1'; npm run dev
//   bash       : TENDANCES_EXEMPLE=1 npm run dev
// ==========================================================================

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Redirections de public/_redirects (« /source /cible 301 », une par ligne, # = commentaire).
async function redirection(chemin) {
  const texte = await readFile(path.join(RACINE, '_redirects'), 'utf8').catch(() => '');
  for (const ligne of texte.split(/\r?\n/)) {
    const [source, cible, code] = ligne.trim().split(/\s+/);
    if (source && !source.startsWith('#') && source === chemin && cible) return { cible, code: Number(code) || 302 };
  }
  return null;
}

const CSP_JEUX = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; worker-src blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";

// Profil joueur et classement (functions/api/profil.js, classement.js) : en
// local, les vraies fonctions tournent avec une base SQLite en mémoire
// (scripts/d1-local.mjs), vidée à l'arrêt du serveur. Sans TURNSTILE_SECRET ni
// MULTI_SECRET : code de sauvegarde à retrouver et ticket multijoueur
// indisponibles (503), le reste marche ; sans adresse IP : pas de limite par
// adresse (créations de profils, de codes…).
let apiLocale = null;
async function appelerApiLocale(req, res, url) {
  if (!apiLocale) {
    apiLocale = (async () => {
      const { baseD1 } = await import('./d1-local.mjs');
      const fonctions = path.join(RACINE, '..', 'functions', 'api');
      const charger = async (nom) => (await import(new URL(`file:///${path.join(fonctions, nom).replace(/\\/g, '/')}`).href)).onRequestPost;
      return {
        env: {
          DB: baseD1(),
          IP_SALT: 'sel-local',
          ASSETS: { fetch: async () => new Response(await readFile(path.join(RACINE, 'catalog.json'))) },
        },
        '/api/profil': await charger('profil.js'),
        '/api/classement': await charger('classement.js'),
      };
    })();
  }
  const api = await apiLocale;
  const corps = await new Promise((ok) => { const morceaux = []; req.on('data', (m) => morceaux.push(m)); req.on('end', () => ok(Buffer.concat(morceaux))); });
  // Sans adresse IP (pas d'en-tête CF-Connecting-IP en local) : pas d'empreinte, donc
  // pas de limite par adresse (le robot ouvre chaque jeu dans un navigateur neuf).
  const entetes = { ...req.headers };
  const requete = new Request(new URL(url.pathname, `http://${req.headers.host}`), { method: req.method, headers: entetes, body: req.method === 'POST' ? corps : undefined });
  const reponse = await api[url.pathname]({ request: requete, env: api.env, waitUntil: () => {} });
  res.writeHead(reponse.status, Object.fromEntries(reponse.headers)).end(Buffer.from(await reponse.arrayBuffer()));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/profil' || url.pathname === '/api/classement') {
      if (req.method !== 'POST') { res.writeHead(405).end(); return; }
      await appelerApiLocale(req, res, url);
      return;
    }

    // Suivi des parties (functions/api/) : en local, rien n'est enregistré et
    // les Tendances sont vides (la section reste cachée), sauf TENDANCES_EXEMPLE=1.
    if (url.pathname === '/api/session') { res.writeHead(204).end(); return; }
    if (url.pathname === '/api/tendances') {
      let jeux = [];
      if (process.env.TENDANCES_EXEMPLE === '1') {
        const catalogue = JSON.parse(await readFile(path.join(RACINE, 'catalog.json'), 'utf8'));
        jeux = (catalogue.games || []).slice(0, 24).map((j) => ({ id: j.id }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ jours: 7, jeux }));
      return;
    }

    const redirige = await redirection(url.pathname);
    if (redirige) { res.writeHead(redirige.code, { Location: redirige.cible }).end(); return; }

    let chemin = path.normalize(path.join(RACINE, decodeURIComponent(url.pathname)));
    if (!chemin.startsWith(RACINE)) { res.writeHead(403).end(); return; }

    let infos = await stat(chemin).catch(() => null);
    if (infos?.isDirectory()) {
      chemin = path.join(chemin, 'index.html');
      infos = await stat(chemin).catch(() => null);
    }
    // Adresse sans extension (« /play », « /mentions-legales ») : la page .html du même nom.
    if (!infos && !path.extname(chemin)) {
      chemin += '.html';
      infos = await stat(chemin).catch(() => null);
    }
    let statut = 200;
    if (!infos) {
      // Page 404 de la langue (/en/404.html…), sinon celle de la racine.
      const langue = /^\/(en|es|pt|de)\//.exec(url.pathname)?.[1];
      chemin = [langue && path.join(RACINE, langue, '404.html'), path.join(RACINE, '404.html')].filter(Boolean).find((c) => existsSync(c));
      if (!chemin) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable'); return; }
      statut = 404;
    }

    const entetes = {
      'Content-Type': TYPES[path.extname(chemin).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    };
    if (url.pathname.startsWith('/games/')) entetes['Content-Security-Policy'] = CSP_JEUX;
    // Lanceur : jamais dans le cadre d'un autre site, ni piloté par une fenêtre
    // d'un autre site qui l'aurait ouvert (comme public/_headers).
    if (url.pathname === '/play' || url.pathname === '/play.html') {
      entetes['X-Frame-Options'] = 'SAMEORIGIN';
      entetes['Content-Security-Policy'] = "frame-ancestors 'self'";
      entetes['Cross-Origin-Opener-Policy'] = 'same-origin';
    }

    res.writeHead(statut, entetes).end(await readFile(chemin));
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, () => {
  console.log(`\nSite de test lancé :`);
  console.log(`  Ordinateur : http://localhost:${PORT}`);
  for (const liste of Object.values(networkInterfaces())) {
    for (const a of liste || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Réseau     : http://${a.address}:${PORT}  (téléphone sur le même Wi-Fi)`);
    }
  }
  console.log('\nCtrl + C pour arrêter.\n');
});
