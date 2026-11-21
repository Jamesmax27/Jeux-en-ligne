#!/usr/bin/env node
// ==========================================================================
// rattrapage-affiches.mjs — file du rattrapage de nuit des affiches et des
// images du jeu des jeux existants (.github/workflows/rattrapage-affiches.yml).
//
// Décision du propriétaire (19-21 novembre 2026) : chaque jeu du site reçoit
// une affiche (window.JEL_AFFICHE, d'où sort sa jaquette) et ses 3 images du
// jeu (window.JEL_APERCU : 2 sur téléphone, la 3e sur ordinateur). Les jeux
// faits avant cette règle sont repris quelques-uns par nuit, automatiquement.
//
//   node scripts/rattrapage-affiches.mjs liste <n> [--exclure id,id…]
//        → JSON des <n> prochains jeux : [{ "id", "travail" }]
//          travail : "affiche+images" (rien n'est fait), "images" (affiche
//          déjà là), "image-ordi" (images déjà là, mais la 3e est encore au
//          format téléphone : la refaire sur un écran d'ordinateur)
//   node scripts/rattrapage-affiches.mjs reste    → nombre de jeux à reprendre (et détail)
//   node scripts/rattrapage-affiches.mjs finir <id>
//        → après l'agent : jaquette tirée de l'affiche (600 × 800, une jaquette
//          SVG est remplacée), texte de la jaquette rangé dans les 5 langues
//          (.rattrapage/alts/<id>.json, i18n-jeu.mjs --meta), version +1
//
// Jeux jamais repris automatiquement (EXCLUS) : ils demandent l'accord ou le
// regard du propriétaire ; ils sont cités dans l'issue de fin.
// ==========================================================================

import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JEUX = path.join(RACINE, 'games');
const LANGUES = ['fr', 'en', 'es', 'pt', 'de'];

// Terres Cubiques : son test (tester-terres-cubiques.mjs) est instable sur GitHub ;
// Poussière d'Empire : ses changements ne sont fusionnés qu'avec l'accord du propriétaire.
export const EXCLUS = ['terres-cubiques', 'poussiere-d-empire'];
// Jeux ajoutés depuis la règle (affiche et images faites à la fabrication).
const DEPUIS = '2026-11-21';

/** Largeur et hauteur d'une image WebP (en-tête VP8, VP8L ou VP8X) ; null si illisible. */
function tailleWebp(b) {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const type = b.toString('ascii', 12, 16);
  if (type === 'VP8X') return { largeur: 1 + b.readUIntLE(24, 3), hauteur: 1 + b.readUIntLE(27, 3) };
  if (type === 'VP8 ') return { largeur: b.readUInt16LE(26) & 0x3fff, hauteur: b.readUInt16LE(28) & 0x3fff };
  if (type === 'VP8L') { const v = b.readUInt32LE(21); return { largeur: 1 + (v & 0x3fff), hauteur: 1 + ((v >> 14) & 0x3fff) }; }
  return null;
}

/** Ce qu'il reste à faire pour un jeu (null : rien). */
async function travailDe(id) {
  const dossier = path.join(JEUX, id);
  const fiche = JSON.parse(await readFile(path.join(dossier, 'game.json'), 'utf8'));
  if (String(fiche.added || '') >= DEPUIS) return null;
  const html = await readFile(path.join(dossier, 'index.html'), 'utf8');
  if (!/\bJEL_AFFICHE\b/.test(html)) return 'affiche+images';
  if (!/\bJEL_APERCU\b/.test(html) || !existsSync(path.join(dossier, 'apercu-3.webp'))) return 'images';
  const t = tailleWebp(await readFile(path.join(dossier, 'apercu-3.webp')));
  if (t && t.largeur <= t.hauteur) return 'image-ordi';
  return null;
}

/** Tous les jeux à reprendre, dans l'ordre : rien de fait, puis images, puis 3e image. */
async function file({ exclure = [] } = {}) {
  const ids = (await readdir(JEUX, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const ordre = { 'affiche+images': 0, images: 1, 'image-ordi': 2 };
  const liste = [];
  for (const id of ids) {
    if (EXCLUS.includes(id) || exclure.includes(id) || !existsSync(path.join(JEUX, id, 'game.json'))) continue;
    const travail = await travailDe(id);
    if (travail) liste.push({ id, travail });
  }
  return liste.sort((a, b) => ordre[a.travail] - ordre[b.travail] || a.id.localeCompare(b.id));
}

/** Après l'agent : jaquette, texte de la jaquette (5 langues), version. */
async function finir(id) {
  const dossier = path.join(JEUX, id);
  const node = (...args) => execFileSync('node', args, { cwd: RACINE, stdio: 'inherit' });
  const alts = path.join(RACINE, '.rattrapage', 'alts', `${id}.json`);
  if (existsSync(alts)) {
    // Jaquette tirée de l'affiche, au format du site ; une jaquette SVG laisse la place à un JPEG.
    if (existsSync(path.join(dossier, 'cover.svg'))) await rm(path.join(dossier, 'cover.svg'));
    node('scripts/jaquette-sans-texte.mjs', id, '--affiche', '--largeur', '600', '--hauteur', '800');
    const textes = JSON.parse(await readFile(alts, 'utf8'))[id] || {};
    for (const l of LANGUES) {
      const n = [...(textes[l] || '')].length;
      if (n < 40 || n > 125) throw new Error(`${id} : texte de la jaquette ${l} de ${n} caractères (40 à 125)`);
    }
    const dossierTextes = path.join(RACINE, 'i18n-jeu', id);
    await mkdir(dossierTextes, { recursive: true });
    for (const l of LANGUES) await writeFile(path.join(dossierTextes, `${l}.json`), JSON.stringify({ meta: { jaquette_alt: textes[l] } }, null, 2));
    node('scripts/i18n-jeu.mjs', '--meta', id);
    await rm(dossierTextes, { recursive: true, force: true });
  }
  node('scripts/version-jeu.mjs', id);
}

async function principal() {
  const [commande, arg] = process.argv.slice(2);
  const i = process.argv.indexOf('--exclure');
  const exclure = i > 0 ? String(process.argv[i + 1] || '').split(',').filter(Boolean) : [];
  if (commande === 'liste') {
    console.log(JSON.stringify((await file({ exclure })).slice(0, Math.max(0, Number(arg) || 0))));
  } else if (commande === 'reste') {
    const l = await file();
    const compte = (t) => l.filter((x) => x.travail === t).length;
    console.log(`${l.length} jeu(x) à reprendre : ${compte('affiche+images')} affiche + images, ${compte('images')} images seules, ${compte('image-ordi')} 3e image sur ordinateur ; exclus : ${EXCLUS.join(', ')}`);
  } else if (commande === 'finir' && arg) {
    await finir(arg);
  } else {
    console.log('Usage : node scripts/rattrapage-affiches.mjs liste <n> [--exclure id,id] | reste | finir <id>');
    process.exit(1);
  }
}

principal().catch((e) => { console.error(e.message); process.exit(1); });
