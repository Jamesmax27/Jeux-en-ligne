// ==========================================================================
// commun.mjs — outils partagés de la chaîne vidéo (marketing/LISEZ-MOI.md)
//
// Dossiers, lecture des recettes, navigateur (Playwright), ffmpeg, hasard
// reproductible. Aucune dépendance npm obligatoire en dehors de Playwright,
// déjà utilisé par les contrôles du dépôt (CHROMIUM_PATH = Chrome ou Edge).
// ==========================================================================

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Sources versionnées : recettes, sélection, textes, plans de capture, musique fournie. */
export const SOURCES = path.join(RACINE, 'marketing', 'videos');
/** Tout ce qui est produit (vidéos, rushes, page de revue) : ignoré par git. */
export const SORTIES = path.join(RACINE, 'marketing', 'sorties');
export const JEUX = path.join(RACINE, 'games');

/** Format commun à toutes les vidéos (TikTok, YouTube Shorts, Instagram Reels). */
export const FORMAT = { largeur: 1080, hauteur: 1920, ips: 30 };

export class ErreurVideo extends Error {}

export async function lireJson(fichier) {
  let texte;
  try { texte = await readFile(fichier, 'utf8'); } catch { throw new ErreurVideo(`Fichier introuvable : ${path.relative(RACINE, fichier)}`); }
  try { return JSON.parse(texte); } catch (e) { throw new ErreurVideo(`JSON illisible : ${path.relative(RACINE, fichier)} (${e.message})`); }
}

export async function ecrireJson(fichier, donnees) {
  await mkdir(path.dirname(fichier), { recursive: true });
  await writeFile(fichier, `${JSON.stringify(donnees, null, 2)}\n`);
}

/** Identifiants des fichiers <id>.json d'un dossier de recettes, triés. */
export async function listerRecettes(dossier) {
  if (!existsSync(dossier)) return [];
  return (await readdir(dossier)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}

export const empreinte = (...morceaux) => {
  const h = createHash('sha256');
  for (const m of morceaux) h.update(typeof m === 'string' || Buffer.isBuffer(m) ? m : JSON.stringify(m));
  return h.digest('hex').slice(0, 16);
};

/** Hasard reproductible (mulberry32) : la même graine redonne la même suite. */
export function hasard(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine entière tirée d'un texte (identifiant de recette, de jeu…). */
export const graineDe = (texte) => parseInt(createHash('sha256').update(String(texte)).digest('hex').slice(0, 8), 16);

// --------------------------------------------------------------------------
// Navigateur : Playwright, comme les autres scripts du dépôt.
// --------------------------------------------------------------------------

export async function chargerPlaywright() {
  try { return await import('playwright'); } catch { /* pas dans node_modules du dépôt */ }
  try { return createRequire(import.meta.url)('playwright'); } catch { /* pas installé globalement non plus */ }
  throw new ErreurVideo([
    'Playwright manque. Dans le dossier du dépôt :',
    '  npm install --no-save playwright',
    '  npx playwright install chromium     (ou CHROMIUM_PATH = chemin de Chrome ou Edge)',
  ].join('\n'));
}

export async function ouvrirNavigateur() {
  const { chromium } = await chargerPlaywright();
  const options = {
    // WebGL sans carte graphique (machines de GitHub Actions) : rendu logiciel accepté.
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required'],
  };
  if (process.env.CHROMIUM_PATH) options.executablePath = process.env.CHROMIUM_PATH;
  return chromium.launch(options);
}

// --------------------------------------------------------------------------
// ffmpeg et ffprobe : FFMPEG_PATH / FFPROBE_PATH, sinon le PATH, sinon le
// paquet npm facultatif « ffmpeg-static » (ffmpeg seul).
// --------------------------------------------------------------------------

const AIDE_FFMPEG = [
  'ffmpeg manque (encodage H.264 + AAC). Pour l\'installer :',
  '  Windows : winget install --id Gyan.FFmpeg -e     (puis rouvrir le terminal)',
  '  Linux   : sudo apt-get install -y ffmpeg',
  '  macOS   : brew install ffmpeg',
  'ou donner son chemin : FFMPEG_PATH et FFPROBE_PATH.',
].join('\n');

/** Lance un programme ; renvoie { code, sortie, erreurs } (sortie en Buffer). */
export function lancer(programme, args, { entree = null, binaire = false } = {}) {
  return new Promise((resoudre, rejeter) => {
    const p = spawn(programme, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const sortie = [], erreurs = [];
    p.stdout.on('data', (d) => sortie.push(d));
    p.stderr.on('data', (d) => erreurs.push(d));
    p.on('error', rejeter);
    p.on('close', (code) => resoudre({
      code,
      sortie: binaire ? Buffer.concat(sortie) : Buffer.concat(sortie).toString('utf8'),
      erreurs: Buffer.concat(erreurs).toString('utf8'),
    }));
    if (entree) p.stdin.end(entree); else p.stdin.end();
  });
}

let outils = null;
export async function trouverFfmpeg() {
  if (outils) return outils;
  const essayer = async (prog) => { try { return (await lancer(prog, ['-version'])).code === 0; } catch { return false; } };
  let ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  if (!(await essayer(ffmpeg))) {
    ffmpeg = null;
    try {
      const statique = createRequire(path.join(RACINE, 'package.json'))('ffmpeg-static');
      if (statique && await essayer(statique)) ffmpeg = statique;
    } catch { /* paquet facultatif absent */ }
  }
  if (!ffmpeg) throw new ErreurVideo(AIDE_FFMPEG);
  let ffprobe = process.env.FFPROBE_PATH || (path.isAbsolute(ffmpeg) ? path.join(path.dirname(ffmpeg), `ffprobe${path.extname(ffmpeg)}`) : 'ffprobe');
  if (!(await essayer(ffprobe))) ffprobe = (await essayer('ffprobe')) ? 'ffprobe' : null;
  outils = { ffmpeg, ffprobe };
  return outils;
}

/** ffmpeg avec message d'erreur lisible. */
export async function ffmpeg(args, options) {
  const { ffmpeg: prog } = await trouverFfmpeg();
  const r = await lancer(prog, ['-hide_banner', '-loglevel', 'error', '-y', ...args], options);
  if (r.code !== 0) throw new ErreurVideo(`ffmpeg a échoué (${args.slice(0, 6).join(' ')}…) :\n${r.erreurs.trim().split('\n').slice(-6).join('\n')}`);
  return r;
}

export const relatif = (fichier) => path.relative(RACINE, fichier).split(path.sep).join('/');
export const dire = (...a) => console.log(...a);
