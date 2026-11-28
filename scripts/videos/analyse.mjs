// ==========================================================================
// analyse.mjs — mesures d'une suite d'images ou d'une vidéo
//
// Sert deux fois : pour juger un rush (le jeu filmé est-il exploitable ?) et
// pour contrôler une vidéo finie (images noires, images figées). ffmpeg
// réduit chaque image à une vignette grise de 64 × 64 ; le reste est calculé
// ici : luminosité, contraste et écart avec l'image précédente.
// ==========================================================================

import path from 'node:path';
import { FORMAT, ffmpeg } from './commun.mjs';

const COTE = 64;

/** Seuils communs (unités : niveaux de gris de 0 à 255, sur la vignette). */
export const SEUILS = {
  // Image « noire » : sombre et plate, ou aplat d'une seule couleur.
  noirLuminosite: 14, noirContraste: 7, platContraste: 2.5,
  // Deux images de suite « identiques » : écart moyen inférieur à ce seuil.
  figeEcart: 0.06,
};

/**
 * Mesure chaque image. `entree` : un dossier d'images 00000.jpg… ou un fichier vidéo.
 * Renvoie { n, ips, luminosite[], contraste[], ecart[] } (ecart[0] = 0).
 */
export async function mesurer(entree, { ips = FORMAT.ips, images = false } = {}) {
  const source = images ? ['-framerate', String(ips), '-start_number', '0', '-i', path.join(entree, '%05d.jpg')] : ['-i', entree];
  const { sortie } = await ffmpeg([...source, '-an', '-vf', `scale=${COTE}:${COTE}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { binaire: true });
  const taille = COTE * COTE, n = Math.floor(sortie.length / taille);
  const luminosite = new Array(n), contraste = new Array(n), ecart = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const d = i * taille;
    let s = 0, s2 = 0, e = 0;
    for (let k = 0; k < taille; k++) {
      const v = sortie[d + k];
      s += v; s2 += v * v;
      if (i) e += Math.abs(v - sortie[d - taille + k]);
    }
    const m = s / taille;
    luminosite[i] = m;
    contraste[i] = Math.sqrt(Math.max(0, s2 / taille - m * m));
    if (i) ecart[i] = e / taille;
  }
  return { n, ips, luminosite, contraste, ecart };
}

const estNoire = (m, i) => (m.luminosite[i] < SEUILS.noirLuminosite && m.contraste[i] < SEUILS.noirContraste) || m.contraste[i] < SEUILS.platContraste;

/** Suites d'images qui vérifient `test`, en secondes : [{ debut, duree }]. */
function suites(m, test, de = 0, a = m.n) {
  const liste = [];
  let depart = -1;
  for (let i = de; i <= a; i++) {
    const oui = i < a && test(i);
    if (oui && depart < 0) depart = i;
    if (!oui && depart >= 0) { liste.push({ debut: depart / m.ips, duree: (i - depart) / m.ips }); depart = -1; }
  }
  return liste;
}

/** Résumé d'un passage [de, a[ (en images) : noir, figé, mouvement. */
export function resumer(m, de = 0, a = m.n) {
  const noires = suites(m, (i) => estNoire(m, i), de, a);
  const figees = suites(m, (i) => i > de && m.ecart[i] < SEUILS.figeEcart, de, a);
  const ecarts = m.ecart.slice(de + 1, a).sort((x, y) => x - y);
  const mediane = ecarts.length ? ecarts[Math.floor(ecarts.length / 2)] : 0;
  const somme = (l) => l.reduce((s, x) => s + x.duree, 0);
  return {
    images: a - de,
    duree: (a - de) / m.ips,
    mouvement: Number(mediane.toFixed(3)),
    noir: Number(somme(noires).toFixed(2)),
    noirMax: Number(Math.max(0, ...noires.map((x) => x.duree)).toFixed(2)),
    fige: Number(somme(figees).toFixed(2)),
    figeMax: Number(Math.max(0, ...figees.map((x) => x.duree)).toFixed(2)),
    luminosite: Number((m.luminosite.slice(de, a).reduce((s, x) => s + x, 0) / Math.max(1, a - de)).toFixed(1)),
    noires, figees,
  };
}

/**
 * Meilleur passage de `duree` secondes dans un rush : le plus de mouvement,
 * sans image noire ni passage figé, et avant `limite` (seconde de la première
 * fin de partie : au-delà, le jeu montre un écran de défaite ou de victoire).
 * `exclus` : passages [image de début, image de fin[ à ne pas reprendre.
 * Renvoie { debut (image), note, resume } ; null si le rush est trop court.
 */
export function meilleurPassage(m, duree, { limite = Infinity, pas = 3, exclus = [] } = {}) {
  const n = Math.round(duree * m.ips);
  const fin = Math.min(m.n, Math.floor(limite * m.ips));
  if (fin < n) return null;
  let meilleur = null;
  for (let d = 0; d + n <= fin; d += pas) {
    if (exclus.some(([e0, e1]) => d < e1 && d + n > e0)) continue; // passage déjà montré dans cette vidéo
    let note = 0, calme = 0, pireCalme = 0, noir = 0;
    for (let i = d + 1; i < d + n; i++) {
      note += Math.min(m.ecart[i], 12);           // un flash plein écran ne vaut pas plus qu'un beau mouvement
      if (m.ecart[i] < SEUILS.figeEcart) { calme++; pireCalme = Math.max(pireCalme, calme); } else calme = 0;
      if (estNoire(m, i)) noir++;
    }
    note = note / n - 4 * (pireCalme / m.ips) - 8 * (noir / m.ips);
    if (!meilleur || note > meilleur.note + 1e-9) meilleur = { debut: d, note };
  }
  if (!meilleur) return null;
  return { ...meilleur, note: Number(meilleur.note.toFixed(3)), resume: resumer(m, meilleur.debut, meilleur.debut + n) };
}
