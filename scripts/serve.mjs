#!/usr/bin/env node
// ==========================================================================
// serve.mjs — petit serveur local pour tester le site sur votre ordinateur.
//   npm run dev   → construit le catalogue puis ouvre http://localhost:8080
// Pour tester sur votre téléphone (même Wi-Fi) : utilisez l'adresse
// « Réseau » affichée au démarrage.
// Reproduit la règle de sécurité des jeux (aucun accès Internet), comme en ligne.
// ==========================================================================

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
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
};

const CSP_JEUX = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; worker-src blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let chemin = path.normalize(path.join(RACINE, decodeURIComponent(url.pathname)));
    if (!chemin.startsWith(RACINE)) { res.writeHead(403).end(); return; }

    let infos = await stat(chemin).catch(() => null);
    if (infos?.isDirectory()) {
      chemin = path.join(chemin, 'index.html');
      infos = await stat(chemin).catch(() => null);
    }
    if (!infos) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable'); return; }

    const entetes = {
      'Content-Type': TYPES[path.extname(chemin).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    };
    if (url.pathname.startsWith('/games/')) entetes['Content-Security-Policy'] = CSP_JEUX;

    res.writeHead(200, entetes).end(await readFile(chemin));
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
