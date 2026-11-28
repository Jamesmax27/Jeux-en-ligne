// ==========================================================================
// verification.mjs — contrôle d'une vidéo finie
//
//   format      MP4, H.264 (yuv420p), 1080 × 1920, 30 i/s, audio AAC stéréo 48 kHz
//   durée       2 à 3 s pour une accroche, 20 à 35 s pour une présentation
//   images      aucune image noire ; aucun plan de jeu figé (rush bloqué)
//   textes      dans la zone sûre, assez grands, assez contrastés, affichés
//               assez longtemps pour être lus (mesures prises au rendu)
//   son         présent, sans saturation
//
// Les seuils viennent du gabarit (marketing/videos/gabarit.json). Une planche
// de contrôle (images réparties sur la durée) est écrite pour le regard humain.
// ==========================================================================

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ErreurVideo, FORMAT, ffmpeg, lancer, trouverFfmpeg } from './commun.mjs';
import { EXPLOITABLE } from './capture.mjs';
import { mesurer, resumer } from './analyse.mjs';

/** Ce que ffprobe dit du fichier. */
export async function sonder(fichier) {
  const { ffprobe } = await trouverFfmpeg();
  if (!ffprobe) throw new ErreurVideo('ffprobe manque (il est livré avec ffmpeg) : donner son chemin dans FFPROBE_PATH.');
  const r = await lancer(ffprobe, ['-v', 'error', '-count_frames', '-show_format', '-show_streams', '-of', 'json', fichier]);
  if (r.code !== 0) throw new ErreurVideo(`ffprobe ne lit pas ${fichier} : ${r.erreurs.trim()}`);
  const d = JSON.parse(r.sortie);
  const v = d.streams.find((s) => s.codec_type === 'video') || {}, a = d.streams.find((s) => s.codec_type === 'audio') || {};
  const fraction = (t) => { const [n, q] = String(t || '0/1').split('/').map(Number); return q ? n / q : 0; };
  return {
    conteneur: d.format.format_name, duree: Number(d.format.duration), octets: Number(d.format.size), debit: Number(d.format.bit_rate),
    video: { codec: v.codec_name, profil: v.profile, largeur: v.width, hauteur: v.height, ips: fraction(v.avg_frame_rate), pixels: v.pix_fmt, images: Number(v.nb_read_frames || v.nb_frames) },
    audio: { codec: a.codec_name, frequence: Number(a.sample_rate), canaux: a.channels },
  };
}

/** Rectangle qui entoure une boîte tournée de `degres` autour de son centre. */
function boiteTournee(b, degres) {
  const r = (degres * Math.PI) / 180, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, l = b.x1 - b.x0, h = b.y1 - b.y0;
  const dl = (Math.abs(l * Math.cos(r)) + Math.abs(h * Math.sin(r))) / 2, dh = (Math.abs(l * Math.sin(r)) + Math.abs(h * Math.cos(r))) / 2;
  return { x0: cx - dl, y0: cy - dh, x1: cx + dl, y1: cy + dh };
}

/** Contrôle des textes dessinés (rapport du rendu) : zone sûre, taille, contraste, temps de lecture. */
export function controlerTextes(textes, gabarit, rotations = {}) {
  const z = gabarit.zone_sure, l = gabarit.lisibilite, problemes = [];
  for (const t of textes) {
    const b = t.tourne ? boiteTournee(t.boite, rotations[t.id] || 8) : t.boite;
    const ou = `« ${t.texte} »`;
    if (b.x0 < z.gauche - 1 || b.x1 > z.droite + 1 || b.y0 < z.haut - 1 || b.y1 > z.bas + 1) problemes.push(`${ou} sort de la zone sûre (boîte ${Math.round(b.x0)},${Math.round(b.y0)} → ${Math.round(b.x1)},${Math.round(b.y1)})`);
    else if (b.y1 > z.colonne_droite.depuis && b.x1 > z.colonne_droite.droite + 1) problemes.push(`${ou} passe sous la colonne de boutons de droite (x = ${Math.round(b.x1)} à y = ${Math.round(b.y1)})`);
    const mini = t.style === 'filigrane' ? l.taille_min_filigrane : l.taille_min;
    if (t.style !== 'logo' && t.taille < mini) problemes.push(`${ou} : lettres de ${t.taille} px (${mini} px au moins)`);
    if (t.contraste < l.contraste_min) problemes.push(`${ou} : contraste ${t.contraste} (${l.contraste_min} au moins)`);
    const mots = t.texte.split(/\s+/).filter(Boolean).length, besoin = l.secondes_min + l.secondes_par_mot * mots, affiche = t.images / FORMAT.ips;
    if (affiche + 1e-6 < besoin) problemes.push(`${ou} : affiché ${affiche.toFixed(2)} s (${besoin.toFixed(2)} s au moins pour ${mots} mot${mots > 1 ? 's' : ''})`);
  }
  return problemes;
}

/**
 * Contrôle complet d'une vidéo. `fiche` : ce que la fabrication a noté (type,
 * images, plans, textes). Renvoie { ok, sonde, controles: [{ nom, ok, detail }] }.
 */
export async function verifier(fichier, fiche, gabarit) {
  const controles = [];
  const noter = (nom, problemes, detail = '') => controles.push({ nom, ok: problemes.length === 0, detail: problemes.length ? problemes.join(' ; ') : detail });
  const sonde = await sonder(fichier);

  // 1. Format
  const f = [];
  if (!/mp4/.test(sonde.conteneur)) f.push(`conteneur ${sonde.conteneur}`);
  if (sonde.video.codec !== 'h264') f.push(`vidéo ${sonde.video.codec}`);
  if (sonde.video.largeur !== FORMAT.largeur || sonde.video.hauteur !== FORMAT.hauteur) f.push(`${sonde.video.largeur} × ${sonde.video.hauteur}`);
  if (Math.abs(sonde.video.ips - FORMAT.ips) > 0.01) f.push(`${sonde.video.ips} i/s`);
  if (sonde.video.pixels !== 'yuv420p') f.push(`pixels ${sonde.video.pixels}`);
  if (sonde.audio.codec !== 'aac') f.push(`audio ${sonde.audio.codec || 'absent'}`);
  if (sonde.audio.frequence !== 48000 || sonde.audio.canaux !== 2) f.push(`audio ${sonde.audio.frequence} Hz, ${sonde.audio.canaux} canal(aux)`);
  noter('format', f, `MP4 H.264 ${sonde.video.profil}, ${sonde.video.largeur} × ${sonde.video.hauteur}, ${sonde.video.ips} i/s, AAC ${sonde.audio.frequence} Hz stéréo, ${(sonde.octets / 1048576).toFixed(1)} Mo`);

  // 2. Durée
  const [mini, maxi] = gabarit.durees[fiche.type];
  const d = [];
  if (sonde.duree < mini - 0.02 || sonde.duree > maxi + 0.05) d.push(`${sonde.duree.toFixed(2)} s (attendu : ${mini} à ${maxi} s)`);
  if (sonde.video.images !== fiche.images) d.push(`${sonde.video.images} images au lieu de ${fiche.images}`);
  noter('durée', d, `${sonde.duree.toFixed(2)} s, ${sonde.video.images} images`);

  // 3. Images noires, plans figés
  const m = await mesurer(fichier);
  const tout = resumer(m);
  noter('images noires', tout.noires.map((x) => `${x.duree.toFixed(2)} s à ${x.debut.toFixed(2)} s`), `aucune (luminosité moyenne ${tout.luminosite})`);
  const figes = [];
  let pire = 0;
  for (const p of fiche.plans.filter((x) => x.type === 'jeu')) {
    const r = resumer(m, p.debut, Math.min(m.n, p.fin));
    pire = Math.max(pire, r.figeMax);
    if (r.figeMax > EXPLOITABLE.figeMax) figes.push(`${p.jeu} figé ${r.figeMax} s (plan de ${(p.debut / FORMAT.ips).toFixed(1)} à ${(p.fin / FORMAT.ips).toFixed(1)} s)`);
  }
  // Hors des plans de jeu (mur, fenêtre, écran de fin), une image arrêtée plus d'une seconde serait une panne du rendu.
  for (const x of tout.figees) if (x.duree > 1) figes.push(`image arrêtée ${x.duree.toFixed(2)} s à ${x.debut.toFixed(2)} s`);
  noter('images figées', figes, `aucune (plus long arrêt dans un plan de jeu : ${pire} s)`);

  // 4. Textes
  const rotations = Object.fromEntries(fiche.plans.flatMap((p) => (p.textes || []).filter((t) => t.rotation).map((t) => [t.id, t.rotation])));
  noter('textes', controlerTextes(fiche.textes, gabarit, rotations), `${fiche.textes.length} textes dans la zone sûre, ${Math.min(...fiche.textes.map((t) => t.taille))} px au moins, contraste ${Math.min(...fiche.textes.map((t) => t.contraste))} au moins`);

  // 5. Son
  const { ffmpeg: prog } = await trouverFfmpeg();
  const vol = await lancer(prog, ['-hide_banner', '-nostats', '-i', fichier, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
  const moyen = Number((/mean_volume:\s*(-?[\d.]+) dB/.exec(vol.erreurs) || [])[1]), crete = Number((/max_volume:\s*(-?[\d.]+) dB/.exec(vol.erreurs) || [])[1]);
  const s = [];
  if (!Number.isFinite(moyen) || moyen < -45) s.push(`presque muet (${moyen} dB en moyenne)`);
  if (crete > -0.3) s.push(`crête à ${crete} dB (saturation possible)`);
  noter('son', s, `niveau moyen ${moyen} dB, crête ${crete} dB`);

  return { ok: controles.every((c) => c.ok), sonde, controles };
}

/** Planche de contrôle : `n` images réparties sur la vidéo, pour la regarder d'un coup d'œil. */
export async function planche(fichier, sortie, images, n = 12) {
  await mkdir(path.dirname(sortie), { recursive: true });
  const pas = Math.max(1, Math.floor(images / n));
  const colonnes = Math.min(n, 6);
  await ffmpeg(['-i', fichier, '-an', '-vf', `select='not(mod(n\\,${pas}))',scale=270:-1,tile=${colonnes}x${Math.ceil(n / colonnes)}:padding=6:color=0x08071a`, '-frames:v', '1', '-q:v', '3', sortie]);
  return sortie;
}
