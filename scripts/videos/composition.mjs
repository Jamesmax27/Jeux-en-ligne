// ==========================================================================
// composition.mjs — d'une recette à un MP4
//
//   1. construire() : la recette (accroche, jeux, textes, rythme) devient un
//      « montage » : liste de plans datés à l'image près, textes remplis avec
//      les chiffres du dépôt, passages de gameplay choisis dans les rushes ;
//   2. rendre() : chaque image est dessinée dans un navigateur sans écran
//      (gabarit/rendu.js) et passée telle quelle à ffmpeg ;
//   3. la musique est composée pour ce montage (musique.mjs), ou prise dans
//      marketing/videos/musique/ ; ffmpeg assemble le tout en MP4 H.264 + AAC.
//
// Tout est écrit dans marketing/sorties/ (ignoré par git).
// ==========================================================================

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErreurVideo, FORMAT, JEUX, RACINE, SORTIES, SOURCES, dire, ecrireJson, ffmpeg, graineDe, hasard, lancer, lireJson, listerRecettes, relatif, trouverFfmpeg } from './commun.mjs';
import { EXPLOITABLE, capturer } from './capture.mjs';
import { meilleurPassage, resumer } from './analyse.mjs';
import { chiffres, classerJeux, lireJeu, lireJeux, lireLogo, remplir } from './donnees.mjs';
import { FREQUENCE, composer, ecrireWav } from './musique.mjs';

const { largeur: L, hauteur: H, ips: IPS } = FORMAT;
const DOSSIER_GABARIT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'gabarit');
const images = (secondes) => Math.round(secondes * IPS);

export const lireGabarit = () => lireJson(path.join(SOURCES, 'gabarit.json'));

/** Accroches retenues par le propriétaire (marketing/videos/selection.json, modifié à la main). */
export async function lireSelection() {
  const s = await lireJson(path.join(SOURCES, 'selection.json'));
  const connues = await listerRecettes(path.join(SOURCES, 'accroches'));
  const retenues = (s.accroches || []).filter((id) => typeof id === 'string');
  for (const id of retenues) if (!connues.includes(id)) throw new ErreurVideo(`selection.json : accroche inconnue « ${id} » (recettes : ${connues.join(', ')})`);
  if (!retenues.length) throw new ErreurVideo('selection.json : aucune accroche retenue (liste "accroches" vide)');
  return retenues;
}

export async function lireAccroche(id) {
  const recette = await lireJson(path.join(SOURCES, 'accroches', `${id}.json`));
  if (!Array.isArray(recette.plans) || !recette.plans.length) throw new ErreurVideo(`accroches/${id}.json : il faut au moins un plan`);
  return { id, ...recette };
}

// --------------------------------------------------------------------------
// 1. De la recette au montage
// --------------------------------------------------------------------------

/** Rushes des jeux d'une vidéo : filmés au besoin, avec les passages déjà montrés. */
class Rushes {
  constructor(navigateur, journal) { this.navigateur = navigateur; this.journal = journal; this.connus = new Map(); this.ecartes = []; }

  async de(cible) {
    if (!this.connus.has(cible)) {
      let rush;
      try { rush = await capturer(this.navigateur, cible, { journal: this.journal }); } catch (e) {
        if (!(e instanceof ErreurVideo)) throw e;
        rush = { cible, exploitable: false, raisons: [e.message] };
      }
      if (!rush.exploitable) this.ecartes.push({ jeu: cible, raison: rush.raisons.join(' ; ') });
      this.connus.set(cible, { ...rush, pris: [] });
    }
    return this.connus.get(cible);
  }

  /**
   * Passage de `n` images du rush : la seconde demandée (`debut`), sinon un des
   * « moments » notés dans le plan de capture, sinon le plus vivant. null si
   * rien d'exploitable ne reste.
   */
  async passage(cible, n, debut) {
    const rush = await this.de(cible);
    if (!rush.exploitable) return null;
    const m = rush.mesures, limite = rush.limite ?? Infinity, fin = Math.min(m.n, Math.floor(limite * IPS));
    const libre = (d) => d >= 0 && d + n <= fin && !rush.pris.some(([a, b]) => d < b && d + n > a);
    const bon = (d) => { const r = resumer(m, d, d + n); return r.noirMax <= EXPLOITABLE.noirMax && r.figeMax <= EXPLOITABLE.figeMax && r.mouvement >= EXPLOITABLE.mouvementMin; };
    let depart = null;
    if (typeof debut === 'number') {
      if (!libre(images(debut))) throw new ErreurVideo(`${cible} : pas de passage de ${(n / IPS).toFixed(1)} s à partir de ${debut} s (rush de ${(fin / IPS).toFixed(1)} s utilisables)`);
      depart = images(debut);
    } else {
      const plan = existsSync(path.join(SOURCES, 'captures', `${cible}.json`)) ? await lireJson(path.join(SOURCES, 'captures', `${cible}.json`)) : {};
      for (const s of plan.moments || []) if (depart === null && libre(images(s)) && bon(images(s))) depart = images(s);
      if (depart === null) {
        const auto = meilleurPassage(m, n / IPS, { limite, exclus: rush.pris });
        if (auto && bon(auto.debut)) depart = auto.debut;
      }
    }
    if (depart === null) return null;
    rush.pris.push([depart, depart + n]);
    return { rush, depart };
  }
}

/** Textes d'un plan : variables remplies, secondes changées en images, identifiants. */
function preparerTextes(liste, variables, dureePlan, prefixe, accents, debutPlan) {
  return (liste || []).map((t, k) => {
    const texte = remplir(t.texte, variables, prefixe);
    const de = images(t.de || 0), a = t.jusqu !== undefined ? images(t.jusqu) : dureePlan;
    if (t.son) accents.push({ t: (debutPlan + de) / IPS, son: t.son });
    const { de: _d, jusqu: _j, son: _s, texte: _t, ...reste } = t;
    return { id: `${prefixe}-t${k}`, ...reste, texte, de, a: Math.min(a, dureePlan), ...(t.entree === 'compte' && /^\d+$/.test(texte) ? { valeur: Number(texte) } : {}) };
  });
}

/** Jaquettes du mur : jeux qui conviennent au public visé, mélangés par la graine, en colonnes. */
async function colonnesDuMur(graine, colonnes = 4, parColonne = 11) {
  const { lignes } = await classerJeux();
  const bons = lignes.filter((j) => !j.ecart && j.jaquette);
  const rnd = hasard(graine);
  const melange = bons.map((j) => [rnd(), j.id]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).slice(0, colonnes * parColonne);
  if (melange.length < colonnes * 5) throw new ErreurVideo(`Mur de jaquettes : seulement ${melange.length} jaquettes utilisables`);
  const sortie = Array.from({ length: colonnes }, () => []);
  melange.forEach((id, k) => sortie[k % colonnes].push(`/jaquette/${id}`));
  return sortie;
}

/**
 * Construit le montage d'une vidéo.
 *   type        'accroche' (l'accroche seule) ou 'presentation'
 *   accroche    identifiant de recette (marketing/videos/accroches/<id>.json)
 *   jeux        liste ordonnée de jeux (présentation) ; un jeu inexploitable est sauté
 *   textes      identifiant de variante (marketing/videos/textes/<id>.json)
 *   rythme      nom d'un rythme du gabarit
 */
export async function construire({ type, nom, accroche, jeux = [], textes, rythme, graine, navigateur, journal = dire }) {
  const gabarit = await lireGabarit();
  const variables = await chiffres();
  const rushes = new Rushes(navigateur, journal);
  const recetteAccroche = await lireAccroche(accroche);
  const semence = graine ?? graineDe(nom);
  const plans = [], accents = [], coupes = [];
  const globaux = [];
  let curseur = 0;

  // a) L'accroche : ses plans, tels que la recette les décrit.
  for (const [k, def] of recetteAccroche.plans.entries()) {
    const n = images(def.duree), prefixe = `accroche-${k}`;
    const { textes: tx, duree: _d, jeu, debut, chute, ...reste } = def;
    const plan = { ...reste, n: plans.length, debut: curseur, fin: curseur + n, origine: 'accroche' };
    if (def.type === 'jeu') {
      const p = await rushes.passage(jeu, n, debut === 'auto' ? undefined : debut);
      if (!p) throw new ErreurVideo(`Accroche « ${accroche} » : le jeu ${jeu} ne donne pas ${def.duree} s de gameplay exploitable (${(await rushes.de(jeu)).raisons?.join(' ; ') || 'aucun passage assez vivant'})`);
      Object.assign(plan, planDeJeu(p, jeu), { sansFiligrane: true, entree: def.entree || (k ? 'zoom' : 'aucune') });
    } else if (def.type === 'mur') {
      plan.colonnes = await colonnesDuMur(graineDe(`${accroche}-mur`));
    } else if (def.type === 'attente') {
      plan.titre = remplir(def.titre || '', variables, prefixe);
      plan.genre = def.genre || 'telechargement';
      if (chute !== undefined) plan.chute = images(chute);
    } else if (def.type !== 'ciel') throw new ErreurVideo(`Accroche « ${accroche} » : type de plan inconnu « ${def.type} »`);
    plan.textes = preparerTextes(tx, variables, n, prefixe, accents, curseur);
    if (k) coupes.push(curseur / IPS);
    plans.push(plan);
    curseur += n;
  }
  const finAccroche = curseur;
  const dureeAccroche = finAccroche / IPS;
  if (dureeAccroche < gabarit.durees.accroche[0] || dureeAccroche > gabarit.durees.accroche[1]) {
    throw new ErreurVideo(`Accroche « ${accroche} » : ${dureeAccroche.toFixed(2)} s (attendu : ${gabarit.durees.accroche.join(' à ')} s)`);
  }

  let musique = { bpm: 110, depart: dureeAccroche, fin: null, ambiance: 'arcade' };
  const montres = [];
  // Textes de l'accroche posés par-dessus plusieurs de ses plans (accroche en rafale).
  globaux.push(...preparerTextes(recetteAccroche.textes, variables, finAccroche, 'accroche-g', accents, 0));

  if (type !== 'accroche') { // présentation (20 à 35 s) ou bande-annonce (8 à 15 s) : même fabrication, rythmes différents
    const r = gabarit.rythmes[rythme];
    if (!r || !r.plans) throw new ErreurVideo(`Rythme inconnu « ${rythme} » (gabarit.json : ${Object.keys(gabarit.rythmes).filter((x) => x !== '_').join(', ')})`);
    const variante = await lireJson(path.join(SOURCES, 'textes', `${textes}.json`));
    const temps = 60 / r.bpm;
    const imageDuTemps = (b) => finAccroche + Math.round(b * temps * IPS);

    // b) Le montage : un plan par case du rythme ; les jeux passent à tour de rôle.
    const file = [];
    for (const id of jeux) { const rush = await rushes.de(id); if (rush.exploitable) file.push(id); }
    if (!file.length) throw new ErreurVideo(`Aucun des jeux demandés n'est exploitable : ${rushes.ecartes.map((e) => `${e.jeu} (${e.raison})`).join(' ; ')}`);
    let battement = 0, tour = 0;
    const courts = [];
    for (const [k, duree] of r.plans.entries()) {
      const debut = imageDuTemps(battement), fin = imageDuTemps(battement + duree), n = fin - debut;
      // Le jeu suivant dans la file ; s'il n'a plus de passage de cette longueur, on essaie les autres.
      let choix = null;
      for (let essai = 0; essai < file.length && !choix; essai++) {
        const id = file[(tour + essai) % file.length];
        const p = await rushes.passage(id, n);
        if (p) { choix = { id, p }; tour = tour + essai + 1; }
      }
      if (!choix) throw new ErreurVideo(`Plan ${k + 1} du montage (${(n / IPS).toFixed(1)} s) : plus aucun passage exploitable dans ${file.join(', ')}. Ajouter des jeux ou choisir un rythme plus court.`);
      const fiche = await lireJeu(choix.id.split('@')[0]);
      const court = n / IPS < 1.5;
      const vars = { ...variables, titre: titreCourt(fiche.titre), titre_complet: fiche.titre, rang: k + 1 };
      const tx = [];
      // Texte du haut et pastille du bas : un par plan, dans l'ordre de la variante (ou à tour de rôle).
      const pris = (liste) => (Array.isArray(liste) && liste.length ? (variante.en_boucle ? liste[k % liste.length] : liste[k]) : undefined);
      const legende = pris(variante.legendes);
      const pastille = variante.etiquettes === false ? null : Array.isArray(variante.etiquettes) ? pris(variante.etiquettes) : '{titre}';
      if (legende && !court) tx.push({ texte: legende, style: variante.style_legende || 'titre', position: 'haut', de: 5 / IPS, entree: k % 2 ? 'glisse' : 'pop', son: 'pop' });
      if (pastille && !court) tx.push({ texte: pastille, style: 'etiquette', position: 'pied', alignement: 'gauche', de: 3 / IPS, entree: 'gauche' });
      const plan = { type: 'jeu', n: plans.length, debut, fin, origine: 'montage', entree: k === 0 ? 'zoom' : r.transition, ...planDeJeu(choix.p, choix.id) };
      plan.textes = preparerTextes(tx, vars, n, `plan-${k}`, accents, debut);
      if (court) courts.push(plan);
      plans.push(plan);
      coupes.push(debut / IPS);
      if (!montres.includes(choix.id)) montres.push(choix.id);
      battement += duree;
    }
    const finMontage = imageDuTemps(battement);

    // c) L'écran de fin : logo, adresse du site, appel à l'action.
    const finVideo = imageDuTemps(battement + r.fin);
    const f = variante.fin || {};
    const txFin = [
      { texte: '{site}', style: 'adresse', position: 800, de: 0.4, entree: 'pop', son: 'cloche' },
      { texte: f.appel || 'Joue maintenant', style: 'bouton', position: 985, de: 0.8, entree: 'pop', son: 'pop' },
      ...(f.detail ? [{ texte: f.detail, style: 'petit', position: 1135, de: 1.15, entree: 'glisse' }] : []),
    ];
    const planFin = { type: 'fin', n: plans.length, debut: finMontage, fin: finVideo, origine: 'fin', entree: 'coupe', jaquettes: [...new Set(montres.map((id) => id.split('@')[0]))].slice(0, 3).map((id) => `/jaquette/${id}`) };
    planFin.textes = preparerTextes(txFin, variables, finVideo - finMontage, 'fin', accents, finMontage);
    plans.push(planFin);
    coupes.push(finMontage / IPS);
    curseur = finVideo;
    musique = { bpm: r.bpm, depart: dureeAccroche, fin: finMontage / IPS, ambiance: r.ambiance || 'arcade' };

    // Plans très courts de la fin du montage : un seul texte par-dessus toute la rafale.
    if (courts.length && variante.rafale) {
      const de = courts[0].debut, a = courts[courts.length - 1].fin;
      globaux.push(...preparerTextes([{ texte: variante.rafale, style: variante.style_legende || 'titre', position: 'haut', de: 4 / IPS, entree: 'pop', son: 'pop' }], variables, a - de, 'rafale', accents, de)
        .map((t) => ({ ...t, de: t.de + de, a })));
    }
  }

  const total = curseur;
  const montage = {
    nom, type, largeur: L, hauteur: H, ips: IPS, images: total, graine: semence, gabarit,
    site: variables.site, logo: await lireLogo(), plans, textes: globaux,
    filigrane: type !== 'accroche' ? { texte: variables.site, de: finAccroche, a: plans[plans.length - 1].debut } : null,
  };
  return {
    montage,
    son: { duree: total / IPS, ...musique, coupes, accents, graine: semence },
    recette: { type, nom, accroche, ...(type !== 'accroche' ? { jeux, textes, rythme } : {}) },
    jeuxMontres: montres, ecartes: rushes.ecartes, chiffres: variables,
  };
}

/** Titre d'un jeu sans son sous-titre (« Gloups, le trou noir de la ville » → « Gloups ») : il doit se lire en 2 secondes. */
export function titreCourt(titre) {
  const court = String(titre).split(/\s*[:,–—]\s+/)[0].trim();
  return court.length >= 4 ? court : titre;
}

function planDeJeu({ rush, depart }, cible) {
  return {
    jeu: cible, rush: `/rush/${path.relative(path.join(SORTIES, 'rushes'), rush.dossier).split(path.sep).join('/')}`,
    depart, images: rush.images, paysage: rush.largeur > rush.hauteur,
  };
}

// --------------------------------------------------------------------------
// 2. Du montage aux images, puis au MP4
// --------------------------------------------------------------------------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };

/** Petit serveur local : la page de rendu y lit le montage, les polices, les rushes, et y dépose ses images. */
async function serveurDeRendu(montage, surImage) {
  const sous = (racine, relatifDemande) => { const f = path.resolve(racine, relatifDemande); return f.startsWith(path.resolve(racine) + path.sep) ? f : null; };
  const serveur = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'POST' && url.pathname === '/trame') {
        const morceaux = [];
        for await (const m of req) morceaux.push(m);
        await surImage(Number(url.searchParams.get('i')), Buffer.concat(morceaux));
        res.writeHead(204).end();
        return;
      }
      if (url.pathname === '/montage.json') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(montage)); return; }
      let fichier = null;
      const chemin = decodeURIComponent(url.pathname);
      if (chemin.startsWith('/gabarit/')) fichier = sous(DOSSIER_GABARIT, chemin.slice(9));
      else if (chemin.startsWith('/site/polices/')) fichier = sous(path.join(RACINE, 'public', 'assets', 'polices'), chemin.slice(14));
      else if (chemin.startsWith('/rush/')) fichier = sous(path.join(SORTIES, 'rushes'), chemin.slice(6));
      else if (chemin.startsWith('/jaquette/')) fichier = (await lireJeux()).find((j) => j.id === chemin.slice(10))?.jaquette || null;
      if (!fichier || !existsSync(fichier)) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream', 'Content-Length': (await stat(fichier)).size });
      createReadStream(fichier).pipe(res);
    } catch (e) { res.writeHead(500).end(String(e.message)); }
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  return { adresse: `http://127.0.0.1:${serveur.address().port}`, fermer: () => new Promise((ok) => serveur.close(ok)) };
}

async function ouvrirPage(navigateur, adresse) {
  const contexte = await navigateur.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  await page.goto(`${adresse}/gabarit/rendu.html`);
  await page.waitForFunction(() => window.pret === true, null, { timeout: 60000 }).catch(() => { throw new ErreurVideo(`La page de rendu ne démarre pas : ${erreurs.join(' | ') || 'délai dépassé'}`); });
  return { page, contexte, erreurs };
}

/** Musique du montage, mise au bon niveau (-14 LUFS, crête à -1 dB) : fichier WAV. */
export async function sonoriser(son, piste, fichierWav) {
  const brut = fichierWav.replace(/\.wav$/, '.brut.wav');
  await ecrireWav(brut, composer({ ...son, sansMusique: !!piste }));
  let entrees = ['-i', brut], filtre = '[0:a]anull[m]';
  if (piste) {
    // Piste fournie par le propriétaire : coupée à la durée, fondue à la fin, bruitages par-dessus.
    const fichier = path.join(SOURCES, 'musique', piste);
    if (!existsSync(fichier)) throw new ErreurVideo(`Piste introuvable : marketing/videos/musique/${piste}`);
    entrees = ['-i', fichier, '-i', brut];
    filtre = `[0:a]aresample=${FREQUENCE},aformat=channel_layouts=stereo,atrim=0:${son.duree},afade=t=out:st=${Math.max(0, son.duree - 0.6)}:d=0.6,apad=whole_dur=${son.duree}[p];[p][1:a]amix=inputs=2:duration=first:normalize=0[m]`;
  }
  // Niveau mesuré (EBU R 128), puis gain fixe : pas de pompage.
  const { ffmpeg: prog } = await trouverFfmpeg();
  const mesure = await lancer(prog, ['-hide_banner', '-nostats', ...entrees, '-filter_complex', `${filtre};[m]ebur128=framelog=quiet[o]`, '-map', '[o]', '-f', 'null', '-']);
  const lufs = Number((/I:\s+(-?[\d.]+) LUFS/.exec(mesure.erreurs.slice(mesure.erreurs.lastIndexOf('Summary'))) || [])[1]);
  // Gain borné (une accroche seule, presque sans musique, ne doit pas être gonflée) et limiteur
  // à -3 dB : l'encodage AAC ajoute jusqu'à 2 dB de crête (mesuré).
  const gain = Number.isFinite(lufs) && lufs > -60 ? Math.max(-12, Math.min(8, -14 - lufs)) : 0;
  await ffmpeg([...entrees, '-filter_complex', `${filtre};[m]volume=${gain.toFixed(2)}dB,alimiter=limit=0.7:level=false,atrim=0:${son.duree}[o]`, '-map', '[o]', '-ar', String(FREQUENCE), '-ac', '2', '-c:a', 'pcm_s16le', fichierWav]);
  await rm(brut, { force: true });
  return { lufs: Number.isFinite(lufs) ? Number((lufs + gain).toFixed(1)) : null, gain: Number(gain.toFixed(1)) };
}

/**
 * Rend le montage en MP4 (1080 × 1920, 30 i/s, H.264 + AAC). Renvoie le
 * rapport des textes dessinés (boîtes, tailles, contrastes) pour le contrôle.
 */
export async function rendre(navigateur, { montage, son }, fichier, { piste = null, journal = dire } = {}) {
  await mkdir(path.dirname(fichier), { recursive: true });
  const wav = fichier.replace(/\.mp4$/, '.wav');
  const niveau = await sonoriser(son, piste, wav);

  const { ffmpeg: prog } = await trouverFfmpeg();
  const encodeur = spawn(prog, ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${L}x${H}`, '-r', String(IPS), '-i', 'pipe:0', '-i', wav,
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-maxrate', '14M', '-bufsize', '28M', '-profile:v', 'high', '-level:v', '4.2', '-g', String(IPS * 2),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k', '-ar', String(FREQUENCE), '-ac', '2',
    '-frames:v', String(montage.images), '-t', String(montage.images / IPS), '-movflags', '+faststart', fichier], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let plainte = '';
  encodeur.stderr.on('data', (d) => { plainte += d; });
  const termine = once(encodeur, 'close');
  let attendu = 0;
  const debut = Date.now();
  const serveur = await serveurDeRendu(montage, async (i, octets) => {
    if (i !== attendu) throw new Error(`image ${i} reçue, ${attendu} attendue`);
    if (octets.length !== L * H * 4) throw new Error(`image ${i} : ${octets.length} octets`);
    attendu++;
    if (!encodeur.stdin.write(octets)) await once(encodeur.stdin, 'drain');
  });
  let rapport;
  try {
    const { page, contexte, erreurs } = await ouvrirPage(navigateur, serveur.adresse);
    try {
      rapport = await page.evaluate(([de, a]) => window.rendre(de, a), [0, montage.images]);
      if (erreurs.length) throw new ErreurVideo(`Erreur dans la page de rendu : ${erreurs.slice(0, 3).join(' | ')}`);
    } finally { await contexte.close(); }
  } finally {
    encodeur.stdin.end();
    await serveur.fermer();
  }
  const [code] = await termine;
  await rm(wav, { force: true });
  if (code !== 0) throw new ErreurVideo(`ffmpeg a échoué pendant l'encodage :\n${plainte.trim().split('\n').slice(-6).join('\n')}`);
  journal(`  🎞  ${relatif(fichier)} : ${montage.images} images (${(montage.images / IPS).toFixed(1)} s) rendues en ${Math.round((Date.now() - debut) / 1000)} s`);
  return { textes: rapport.textes, son: niveau };
}

/** Images isolées d'un montage (planche de contrôle, mise au point d'une recette), sans encoder. */
export async function apercus(navigateur, montage, numeros) {
  const serveur = await serveurDeRendu(montage, async () => {});
  try {
    const { page, contexte } = await ouvrirPage(navigateur, serveur.adresse);
    try {
      const sorties = [];
      for (const i of numeros) sorties.push(Buffer.from((await page.evaluate((n) => window.apercu(n), i)).split(',')[1], 'base64'));
      return sorties;
    } finally { await contexte.close(); }
  } finally { await serveur.fermer(); }
}

export { JEUX };
