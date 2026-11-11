#!/usr/bin/env node
// ==========================================================================
// indexnow.mjs — prévient Bing (et les autres moteurs IndexNow) des pages
// nouvelles ou modifiées, pour qu'ils les explorent tout de suite
//
//   node scripts/indexnow.mjs <id> [<id>…]   fiches de ces jeux (5 langues) + accueils
//   node scripts/indexnow.mjs --sitemap      toutes les adresses du sitemap publié
//   options :
//     --attendre    attend (15 min au plus) que la première fiche réponde 200 sur
//                   le site : Cloudflare publie quelques minutes après la fusion
//     --essai       affiche les adresses sans rien envoyer
//
// Protocole : https://www.indexnow.org/documentation — un appel POST à
// api.indexnow.org avec la clé du site ; la clé est publique, dans le fichier
// public/<clé>.txt (Bing le lit pour vérifier que l'appel vient du site).
// Appelé par la boucle de nuit après les fusions (jamais bloquant). Rien n'est
// envoyé d'autre que des adresses publiques du site.
// Aucune dépendance : Node.js 18 ou plus suffit.
// ==========================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUES, urlJeu, urlAccueil } from '../public/chemins.js';

export const CLE_INDEXNOW = '2771c4fea4893910576cf88146ca69f5';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://freemicrogames.com/';
const LOT_MAX = 10000; // adresses par appel (limite du protocole)

const args = process.argv.slice(2);
const ESSAI = args.includes('--essai');

async function adresses() {
  if (args.includes('--sitemap')) {
    const xml = await (await fetch(new URL('sitemap.xml', SITE), { signal: AbortSignal.timeout(30000) })).text();
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  }
  const liste = LANGUES.map((l) => new URL(urlAccueil(l).slice(1), SITE).href);
  for (const id of args.filter((a) => !a.startsWith('--'))) {
    let fiche;
    try { fiche = JSON.parse((await readFile(path.join(RACINE, 'games', id, 'game.json'), 'utf8')).replace(/^﻿/, '')); } catch { console.log(`attention : ${id} : game.json illisible, ignoré`); continue; }
    const langues = Array.isArray(fiche.langues) && fiche.langues.length ? LANGUES.filter((l) => l === 'fr' || fiche.langues.includes(l)) : LANGUES;
    for (const l of langues) liste.push(new URL(urlJeu(fiche, l).slice(1), SITE).href);
  }
  return liste;
}

async function attendre(adresse) {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(adresse, { method: 'HEAD', signal: AbortSignal.timeout(15000) })).status === 200) return true; } catch { /* pas encore */ }
    await new Promise((r) => setTimeout(r, 30000));
  }
  return false;
}

async function principal() {
  const liste = [...new Set(await adresses())];
  if (!liste.length) { console.log('Aucune adresse à envoyer.'); return; }
  if (ESSAI) { console.log(liste.join('\n')); return; }
  if (args.includes('--attendre')) {
    const premiere = liste.find((a) => /\/(jeux|games|juegos|jogos|spiele)\//.test(a)) || liste[0];
    if (!(await attendre(premiere))) console.log(`attention : ${premiere} ne répond pas encore 200 : envoi quand même`);
  }
  const hote = new URL(SITE).host;
  for (let i = 0; i < liste.length; i += LOT_MAX) {
    const lot = liste.slice(i, i + LOT_MAX);
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: hote, key: CLE_INDEXNOW, keyLocation: `${SITE}${CLE_INDEXNOW}.txt`, urlList: lot }),
      signal: AbortSignal.timeout(30000),
    });
    // 200 ou 202 : reçu. 403 : clé introuvable sur le site ; 422 : adresse hors du site ; 429 : trop d'appels.
    console.log(`IndexNow : ${lot.length} adresse(s) envoyée(s), réponse ${r.status}`);
    if (![200, 202].includes(r.status)) process.exitCode = 1;
  }
}

principal().catch((e) => { console.error(`IndexNow : ${e.message}`); process.exit(1); });
