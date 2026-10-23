#!/usr/bin/env node
// ==========================================================================
// serve.mjs — petit serveur local pour tester le site sur votre ordinateur.
//   npm run dev   → construit le catalogue puis ouvre http://localhost:8080
// Pour tester sur votre téléphone (même Wi-Fi) : utilisez l'adresse
// « Réseau » affichée au démarrage.
// Reproduit la règle de sécurité des jeux (aucun accès Internet), comme en ligne,
// et les adresses de Cloudflare Pages : « /play » sert play.html, un dossier sert
// son index.html, une adresse inconnue reçoit 404.html avec le code 404.
// L'API des votes n'existe pas en local ; celle du suivi des parties répond à vide.
// TENDANCES_EXEMPLE=1 : /api/tendances renvoie les 12 premiers jeux du catalogue
// (pour voir la bande « Tendances » ; sans la variable, elle reste cachée).
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

const CSP_JEUX = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; worker-src blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    // Suivi des parties (functions/api/) : en local, rien n'est enregistré et
    // les Tendances sont vides (la section reste cachée), sauf TENDANCES_EXEMPLE=1.
    if (url.pathname === '/api/session') { res.writeHead(204).end(); return; }
    if (url.pathname === '/api/tendances') {
      let jeux = [];
      if (process.env.TENDANCES_EXEMPLE === '1') {
        const catalogue = JSON.parse(await readFile(path.join(RACINE, 'catalog.json'), 'utf8'));
        jeux = (catalogue.games || []).slice(0, 12).map((j) => ({ id: j.id }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ jours: 7, jeux }));
      return;
    }

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
