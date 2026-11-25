#!/usr/bin/env node
// ==========================================================================
// video.mjs — chaîne de production des vidéos de promotion de Free Micro Games
// (TikTok, YouTube Shorts, Instagram Reels). Mode d'emploi : marketing/LISEZ-MOI.md
//
// UNE VIDÉO DE PRÉSENTATION, en une commande :
//
//   node scripts/videos/video.mjs presentation --accroche <id> --jeux <a,b,c…> --textes <variante>
//        [--rythme express|pose|crescendo] [--nom <nom>] [--musique <fichier de marketing/videos/musique/>]
//
//     --accroche   une accroche de marketing/videos/selection.json (ou « auto »)
//     --jeux       jeux à montrer, dans l'ordre (un jeu qui se filme mal est sauté)
//     --textes     variante de marketing/videos/textes/
//
// Autres commandes :
//   presentation <id>       vidéo décrite par marketing/videos/presentations/<id>.json
//   accroche <id> [<id>…]   une accroche seule (2 à 3 s), pour la revue
//   tout                    les accroches, les présentations de presentations/, contrôles, page de revue
//   apercu <id> [--images <s,s,…>]   quelques images d'une accroche ou d'une présentation, sans tout rendre
//   verifier                recontrôle les vidéos déjà produites
//   revue                   refait la page marketing/sorties/revue.html
//   jeux [--actualiser]     jeux classés d'après les votes et les jeux les plus joués du site
//   capturer <jeu>… [--brouillon] [--forcer] [--planche <n>]   filme le gameplay d'un jeu (rush)
//   explorer <jeu>…         boutons visibles après la préparation d'un plan de capture
//   nettoyer                efface les rushes gardés (marketing/sorties/rushes/)
//
// Tout est produit dans marketing/sorties/ (ignoré par git).
// Il faut : Node 18+, Playwright (CHROMIUM_PATH = Chrome ou Edge), ffmpeg.
// ==========================================================================

import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { ErreurVideo, FORMAT, SORTIES, SOURCES, dire, ecrireJson, ffmpeg, graineDe, lireJson, listerRecettes, ouvrirNavigateur, relatif, trouverFfmpeg } from './commun.mjs';
import { capturer, explorer } from './capture.mjs';
import { apercus, construire, lireAccroche, lireGabarit, lireSelection, rendre } from './composition.mjs';
import { actualiserPopularite, classerJeux } from './donnees.mjs';
import { ecrireRevue } from './revue.mjs';
import { planche, verifier } from './verification.mjs';

/** Planche de contrôle d'un rush : `n` images réparties sur toute la durée. */
export async function plancheDuRush(rush, sortie, n = 8) {
  await mkdir(path.dirname(sortie), { recursive: true });
  const pas = Math.max(1, Math.floor(rush.images / n));
  const paysage = rush.largeur > rush.hauteur;
  await ffmpeg(['-framerate', String(rush.ips || 30), '-start_number', '0', '-i', path.join(rush.dossier, '%05d.jpg'),
    '-vf', `select='not(mod(n\\,${pas}))',scale=${paysage ? 480 : 250}:-1,tile=${paysage ? 4 : n}x${paysage ? Math.ceil(n / 4) : 1}`, '-frames:v', '1', '-q:v', '4', sortie]);
  return sortie;
}

function lireArgs(argv) {
  const libres = [], options = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { libres.push(a); continue; }
    const [nom, valeur] = a.slice(2).split('=');
    if (valeur !== undefined) options[nom] = valeur;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) options[nom] = argv[++i];
    else options[nom] = true;
  }
  return { libres, options };
}

// --------------------------------------------------------------------------
// Fabrication d'une vidéo : montage, rendu, contrôles, fiche.
// --------------------------------------------------------------------------

const dossierDe = (type) => path.join(SORTIES, type === 'accroche' ? 'accroches' : 'presentations');

async function controler(fichier, fiche, gabarit) {
  const { ok, sonde, controles } = await verifier(fichier, fiche, gabarit);
  const image = await planche(fichier, path.join(SORTIES, 'controle', `${fiche.type}-${fiche.nom}.jpg`), fiche.images, fiche.type === 'accroche' ? 6 : 12);
  for (const c of controles) dire(`     ${c.ok ? '✓' : '✗'} ${c.nom} : ${c.detail}`);
  dire(`     planche : ${relatif(image)}`);
  return { ...fiche, ok, sonde, controles };
}

/** Fabrique une vidéo et la contrôle. Renvoie sa fiche (aussi écrite à côté du MP4). */
async function fabriquer(navigateur, demande) {
  const gabarit = await lireGabarit();
  dire(`\n▶ ${demande.type === 'accroche' ? 'Accroche' : 'Présentation'} « ${demande.nom} »`);
  const plan = await construire({ ...demande, navigateur });
  const fichier = path.join(dossierDe(demande.type), `${demande.nom}.mp4`);
  const rendu = await rendre(navigateur, plan, fichier, { piste: demande.musique || null });
  const fiche = {
    nom: demande.nom, type: demande.type, recette: { ...plan.recette, ...(demande.musique ? { musique: demande.musique } : {}) },
    source: demande.type === 'accroche' ? await lireJson(path.join(SOURCES, 'accroches', `${demande.accroche}.json`)) : null,
    images: plan.montage.images, jeuxMontres: plan.jeuxMontres, ecartes: plan.ecartes, chiffres: plan.chiffres,
    musique: { ...(demande.musique ? { piste: demande.musique } : { generee: true, bpm: plan.son.bpm, ambiance: plan.son.ambiance, graine: plan.son.graine }), ...rendu.son },
    plans: plan.montage.plans.map((p) => ({ type: p.type, debut: p.debut, fin: p.fin, origine: p.origine, ...(p.jeu ? { jeu: p.jeu, depart: p.depart } : {}), textes: (p.textes || []).map((t) => ({ id: t.id, texte: t.texte, ...(t.rotation ? { rotation: t.rotation } : {}) })) })),
    textes: rendu.textes,
  };
  for (const e of plan.ecartes) dire(`     ⚠ jeu écarté : ${e.jeu} — ${e.raison}`);
  const complete = await controler(fichier, fiche, gabarit);
  await ecrireJson(fichier.replace(/\.mp4$/, '.json'), complete);
  dire(`  ${complete.ok ? '✓' : '✗'} ${relatif(fichier)} (${complete.sonde.duree.toFixed(1)} s)`);
  return complete;
}

async function demandeDePresentation(libres, options) {
  let recette = {}, nom = options.nom;
  if (libres[0]) {
    recette = await lireJson(path.join(SOURCES, 'presentations', `${libres[0]}.json`));
    nom = nom || libres[0];
  }
  const jeux = options.jeux ? String(options.jeux).split(',').map((x) => x.trim()).filter(Boolean) : recette.jeux;
  const textes = options.textes || recette.textes, rythme = options.rythme || recette.rythme || 'express', musique = options.musique || recette.musique;
  let accroche = options.accroche || recette.accroche;
  if (!accroche || !jeux?.length || !textes) {
    throw new ErreurVideo('Il faut une accroche, des jeux et une variante de texte :\n  node scripts/videos/video.mjs presentation --accroche <id> --jeux <a,b,c> --textes <variante> [--rythme express|pose|crescendo] [--nom <nom>]\n  ou : node scripts/videos/video.mjs presentation <id>   (marketing/videos/presentations/<id>.json)');
  }
  const retenues = await lireSelection();
  nom = nom || `${accroche}--${textes}--${rythme}`;
  if (accroche === 'auto') accroche = retenues[graineDe(nom) % retenues.length];
  if (!retenues.includes(accroche)) throw new ErreurVideo(`L'accroche « ${accroche} » n'est pas retenue dans marketing/videos/selection.json (retenues : ${retenues.join(', ')})`);
  if (!existsSync(path.join(SOURCES, 'textes', `${textes}.json`))) throw new ErreurVideo(`Variante de texte inconnue « ${textes} » (${(await listerRecettes(path.join(SOURCES, 'textes'))).join(', ')})`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(nom)) throw new ErreurVideo(`Nom de vidéo « ${nom} » : minuscules, chiffres et tirets seulement`);
  return { type: 'presentation', nom, accroche, jeux, textes, rythme, musique };
}

// --------------------------------------------------------------------------
// Commandes
// --------------------------------------------------------------------------

const commandes = {
  async presentation(libres, options) {
    const demande = await demandeDePresentation(libres, options);
    await trouverFfmpeg();
    const navigateur = await ouvrirNavigateur();
    try { const fiche = await fabriquer(navigateur, demande); await ecrireRevue(); return fiche.ok; } finally { await navigateur.close(); }
  },

  async accroche(libres) {
    const ids = libres.length ? libres : await listerRecettes(path.join(SOURCES, 'accroches'));
    await trouverFfmpeg();
    const navigateur = await ouvrirNavigateur();
    let ok = true;
    try {
      for (const id of ids) { await lireAccroche(id); ok = (await fabriquer(navigateur, { type: 'accroche', nom: id, accroche: id })).ok && ok; }
      await ecrireRevue();
    } finally { await navigateur.close(); }
    return ok;
  },

  /** Tout ce qui est décrit dans marketing/videos/ : accroches, présentations, contrôles, revue. */
  async tout() {
    await trouverFfmpeg();
    const navigateur = await ouvrirNavigateur();
    const fiches = [];
    try {
      for (const id of await listerRecettes(path.join(SOURCES, 'accroches'))) fiches.push(await fabriquer(navigateur, { type: 'accroche', nom: id, accroche: id }));
      for (const id of await listerRecettes(path.join(SOURCES, 'presentations'))) fiches.push(await fabriquer(navigateur, await demandeDePresentation([id], {})));
    } finally { await navigateur.close(); }
    const revue = await ecrireRevue();
    const ecartes = new Map(fiches.flatMap((f) => f.ecartes).map((e) => [e.jeu, e.raison]));
    dire(`\n${fiches.length} vidéos : ${fiches.filter((f) => f.ok).length} bonnes, ${fiches.filter((f) => !f.ok).length} à reprendre.`);
    for (const [jeu, raison] of ecartes) dire(`  jeu écarté : ${jeu} — ${raison}`);
    dire(`Page de revue : ${revue.chemin}`);
    return fiches.every((f) => f.ok);
  },

  /** Quelques images d'une vidéo, sans la rendre en entier : pour mettre au point une recette. */
  async apercu(libres, options) {
    const estAccroche = !options.presentation && existsSync(path.join(SOURCES, 'accroches', `${libres[0]}.json`));
    const demande = estAccroche ? { type: 'accroche', nom: libres[0], accroche: libres[0] } : await demandeDePresentation(libres, options);
    await trouverFfmpeg();
    const navigateur = await ouvrirNavigateur();
    try {
      const { montage } = await construire({ ...demande, navigateur });
      const total = montage.images, n = Number(options.nombre) || 6;
      const numeros = options.images ? String(options.images).split(',').map((x) => Math.min(total - 1, Math.round(Number(x) * FORMAT.ips))) : Array.from({ length: n }, (_, q) => Math.round(((q + 0.5) * total) / n));
      const dossier = path.join(SORTIES, 'controle', 'apercu');
      await rm(dossier, { recursive: true, force: true });
      await mkdir(dossier, { recursive: true });
      const { writeFile } = await import('node:fs/promises');
      const jpegs = await apercus(navigateur, montage, numeros);
      for (const [q, jpeg] of jpegs.entries()) await writeFile(path.join(dossier, `${String(q).padStart(5, '0')}.jpg`), jpeg);
      const sortie = path.join(SORTIES, 'controle', `apercu-${demande.nom}.jpg`);
      await ffmpeg(['-framerate', '1', '-start_number', '0', '-i', path.join(dossier, '%05d.jpg'), '-vf', `scale=${options.grand ? 540 : 270}:-1,tile=${jpegs.length}x1:padding=6:color=0x08071a`, '-frames:v', '1', '-q:v', '3', sortie]);
      dire(`Aperçu de « ${demande.nom} » aux secondes ${numeros.map((i) => (i / FORMAT.ips).toFixed(1)).join(', ')} : ${relatif(sortie)}`);
    } finally { await navigateur.close(); }
    return true;
  },

  async verifier() {
    const gabarit = await lireGabarit();
    let ok = true, n = 0;
    for (const type of ['accroche', 'presentation']) {
      for (const id of await listerRecettes(dossierDe(type))) {
        const fichier = path.join(dossierDe(type), `${id}.mp4`);
        if (!existsSync(fichier)) continue;
        dire(`\n▶ ${type} « ${id} »`);
        const fiche = await controler(fichier, await lireJson(fichier.replace(/\.mp4$/, '.json')), gabarit);
        await ecrireJson(fichier.replace(/\.mp4$/, '.json'), fiche);
        ok = fiche.ok && ok; n++;
      }
    }
    if (!n) throw new ErreurVideo('Aucune vidéo à contrôler dans marketing/sorties/ : lancer d\'abord « tout » ou « presentation ».');
    await ecrireRevue();
    dire(ok ? `\nContrôle des vidéos : tout est bon (${n} vidéos).` : '\nContrôle des vidéos : au moins une vidéo est à reprendre.');
    return ok;
  },

  async revue() {
    const r = await ecrireRevue();
    dire(`Page de revue : ${r.chemin} (${r.accroches} accroches, ${r.presentations} présentations)`);
    return true;
  },

  async jeux(libres, options) {
    if (options.actualiser) { const p = await actualiserPopularite(); dire(`Relevé du ${p.releve} enregistré dans marketing/videos/popularite.json`); }
    const { releve, source, lignes } = await classerJeux();
    dire(`Jeux classés d'après le relevé du ${releve}\n(${source})\nJ = parmi les plus joués ; ✗ = écarté par marketing/videos/jeux.json ; ● = plan de capture écrit\n`);
    for (const l of lignes.filter((x) => x.score > 0 || x.plusJoue).slice(0, Number(options.nombre) || 40)) {
      const plan = existsSync(path.join(SOURCES, 'captures', `${l.id}.json`)) ? '●' : ' ';
      dire(`${l.ecart ? '✗' : '✓'} ${plan} ${l.score.toFixed(3)}  ${`${l.pour}/${l.contre}`.padEnd(5)} ${l.plusJoue ? 'J' : ' '}  ${l.id.padEnd(42)} ${l.ages.padEnd(4)} ${l.genre.padEnd(11)}${l.ecart ? `— ${l.ecart}` : ''}`);
    }
    return true;
  },

  async explorer(libres) {
    const navigateur = await ouvrirNavigateur();
    try {
      for (const cible of libres) {
        const image = path.join(SORTIES, 'explorer', `${cible.replace('@', '--')}.jpg`);
        const { elements, etat } = await explorer(navigateur, cible, image);
        dire(`\n${cible} — après la préparation (t = ${(etat.t / 1000).toFixed(1)} s, fins : ${JSON.stringify(etat.fins)}, erreurs : ${JSON.stringify(etat.erreurs)})`);
        for (const e of elements) dire(`  [${(e.x / 405).toFixed(2)}, ${(e.y / 720).toFixed(2)}] ${e.l}×${e.h}  « ${e.texte} »${e.id ? `  #${e.id}` : ''}${e.classe ? `  .${e.classe.split(' ').join('.')}` : ''}`);
        dire(`  image : ${relatif(image)}`);
      }
    } finally { await navigateur.close(); }
    return true;
  },

  async capturer(libres, options) {
    await trouverFfmpeg();
    const navigateur = await ouvrirNavigateur();
    let ok = true;
    try {
      for (const cible of libres) {
        const rush = await capturer(navigateur, cible, { forcer: !!options.forcer, brouillon: !!options.brouillon });
        const n = Number(options.planche) || 10;
        const image = await plancheDuRush(rush, path.join(SORTIES, 'controle', 'rushes', `${cible.replace('@', '--')}${rush.brouillon ? '--brouillon' : ''}.jpg`), n);
        dire(`  ${rush.brouillon ? '•' : rush.exploitable ? '✓' : '✗'} ${cible}${rush.brouillon ? ' (brouillon, sans verdict)' : ''} : ${JSON.stringify(rush.resume)} fins ${JSON.stringify(rush.fins)}${rush.erreurs.length ? ` erreurs ${JSON.stringify(rush.erreurs)}` : ''}${rush.raisons.length ? `\n    inexploitable : ${rush.raisons.join(' ; ')}` : ''}\n    planche (${n} images, une toutes les ${(rush.images / rush.ips / n).toFixed(2)} s) : ${relatif(image)}`);
        ok = rush.exploitable && ok;
      }
    } finally { await navigateur.close(); }
    return ok;
  },

  async nettoyer() {
    await rm(path.join(SORTIES, 'rushes'), { recursive: true, force: true });
    dire('Rushes effacés (marketing/sorties/rushes/) : ils seront refilmés à la prochaine vidéo.');
    return true;
  },
};

async function principal() {
  const [commande, ...reste] = process.argv.slice(2);
  if (!commandes[commande]) {
    dire(`Commandes : ${Object.keys(commandes).join(', ')}\nExemple : node scripts/videos/video.mjs presentation --accroche mur-de-jeux --jeux toboggan-turbo,poings-de-pierre --textes direct\nMode d'emploi : marketing/LISEZ-MOI.md (format des vidéos : ${FORMAT.largeur} × ${FORMAT.hauteur}, ${FORMAT.ips} i/s)`);
    process.exit(commande ? 1 : 0);
  }
  const { libres, options } = lireArgs(reste);
  const ok = await commandes[commande](libres, options);
  process.exit(ok ? 0 : 1);
}

principal().catch((e) => {
  console.error(e instanceof ErreurVideo ? `\n✗ ${e.message}` : e);
  process.exit(1);
});
