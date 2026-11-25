// ==========================================================================
// musique.mjs — musique originale des vidéos, fabriquée par le script
//
// Aucune piste du commerce, aucun échantillon : tout est calculé ici, note
// par note (oscillateurs, bruit, filtres, écho, réverbération), à partir
// d'une graine. La même recette redonne exactement la même musique.
//
// La musique suit le montage : une intro pendant l'accroche, le rythme qui
// démarre avec le premier plan de jeu (les coupes tombent sur les temps), un
// accord tenu sur l'écran de fin. Des bruitages marquent les coupes et les
// textes (souffle, impact, petit « pop »), mais la vidéo se comprend sans le son.
//
//   composer({ duree, bpm, depart, fin, coupes, accents, graine, ambiance })
//     → Float32Array stéréo entrelacée, 48 000 Hz
//   ecrireWav(fichier, echantillons)
// ==========================================================================

import { writeFile } from 'node:fs/promises';
import { hasard } from './commun.mjs';

export const FREQUENCE = 48000;
const TOUR = Math.PI * 2;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

/** Ambiances : tempo libre (donné par le rythme), couleur et jeu des instruments. */
const AMBIANCES = {
  // Vif et joueur : grosse caisse sur tous les temps, arpège rapide.
  arcade: { accords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], caisse: [0, 1, 2, 3], claque: [1, 3], charley: 0.5, basse: 'croches', arpege: 4, nappe: 0.2, melodie: 0.42 },
  // Posé et aérien : demi-temps, nappe large, arpège lent.
  planant: { accords: [[53, 57, 60, 64], [55, 59, 62], [57, 60, 64], [57, 60, 64, 67]], caisse: [0, 2.5], claque: [2], charley: 1, basse: 'tenue', arpege: 2, nappe: 0.3, melodie: 0.46 },
  // Tendu, qui monte : basse obstinée, charley serré, filtre qui s'ouvre.
  tension: { accords: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]], caisse: [0, 1.5, 2, 3.5], claque: [1, 3], charley: 0.25, basse: 'obstinee', arpege: 4, nappe: 0.18, melodie: 0.4, montee: true },
};
const GAMME = [57, 60, 62, 64, 67, 69, 72, 74, 76]; // la mineur pentatonique, deux octaves

class Piste {
  constructor(n) { this.g = new Float32Array(n); this.d = new Float32Array(n); this.n = n; }
  /** Ajoute un son mono `f(k)` (k = échantillon depuis le début du son) à l'instant t, placé à `pan` (-1 à 1). */
  poser(t, duree, pan, f) {
    const i0 = Math.round(t * FREQUENCE), n = Math.round(duree * FREQUENCE);
    const gg = Math.cos(((pan + 1) * Math.PI) / 4), gd = Math.sin(((pan + 1) * Math.PI) / 4);
    for (let k = 0; k < n; k++) {
      const i = i0 + k;
      if (i < 0) continue;
      if (i >= this.n) break;
      const v = f(k);
      this.g[i] += v * gg; this.d[i] += v * gd;
    }
  }
}

// Oscillateurs à bords adoucis (polyBLEP) : pas de sifflement d'aliasing.
function blep(phase, pas) {
  if (phase < pas) { const u = phase / pas; return u + u - u * u - 1; }
  if (phase > 1 - pas) { const u = (phase - 1) / pas; return u * u + u + u + 1; }
  return 0;
}
const scie = (phase, pas) => 2 * phase - 1 - blep(phase, pas);
const carre = (phase, pas) => (phase < 0.5 ? 1 : -1) + blep(phase, pas) - blep((phase + 0.5) % 1, pas);

/** Filtre passe-bas à deux pôles (état variable), coupure réglable à chaque échantillon. */
function passeBas(resonance = 0.7) {
  let bas = 0, bande = 0;
  return (x, coupure) => {
    const f = 2 * Math.sin(Math.PI * Math.min(0.24, coupure / FREQUENCE));
    bas += f * bande;
    const haut = x - bas - bande / resonance;
    bande += f * haut;
    return bas;
  };
}

const enveloppe = (k, n, attaque, chute) => {
  const t = k / FREQUENCE, d = n / FREQUENCE;
  return Math.min(1, t / attaque) * Math.min(1, Math.max(0, (d - t) / chute));
};

// --- Instruments -------------------------------------------------------------

function grosseCaisse(p, t, force = 1) {
  // Corps qui descend de 190 à 56 Hz et claquement bref : audible aussi sur un haut-parleur de téléphone.
  p.poser(t, 0.3, 0, (k) => {
    const s = k / FREQUENCE;
    const phase = TOUR * (56 * s + (134 / 30) * (1 - Math.exp(-s * 30)));
    const corps = Math.sin(phase) * Math.exp(-s * 12) + 0.3 * Math.sin(2 * phase) * Math.exp(-s * 30);
    const clac = k < 140 ? 0.35 * Math.sin(TOUR * 1900 * s) * (1 - k / 140) : 0;
    return force * 0.7 * (corps + clac) * Math.min(1, s * 1200);
  });
}

function claque(p, t, rnd, force = 1) {
  const filtre = passeBas(1.2);
  p.poser(t, 0.22, 0.06, (k) => {
    const s = k / FREQUENCE, b = rnd() * 2 - 1;
    const corps = Math.sin(TOUR * 196 * s) * Math.exp(-s * 34) * 0.35;
    const souffle = (b - filtre(b, 1500)) * Math.exp(-s * 21) * 0.5;
    return force * (corps + souffle) * Math.min(1, s * 1500);
  });
}

function charley(p, t, rnd, force = 1, pan = 0.25) {
  let avant = 0;
  p.poser(t, 0.07, pan, (k) => {
    const b = rnd() * 2 - 1, haut = b - avant; avant = b; // passe-haut simple : ne garde que l'aigu
    return force * 0.2 * haut * Math.exp(-(k / FREQUENCE) * 75);
  });
}

function basse(p, t, duree, note, force = 1) {
  const f = midi(note), pas = f / FREQUENCE, filtre = passeBas(1.2), n = Math.round(duree * FREQUENCE);
  let phase = 0, phase2 = 0.3;
  p.poser(t, duree, 0, (k) => {
    phase = (phase + pas) % 1; phase2 = (phase2 + 2 * pas) % 1;
    const s = k / FREQUENCE, brut = 0.6 * scie(phase, pas) + 0.3 * carre(phase2, 2 * pas) + 0.3 * Math.sin(TOUR * f * s);
    return force * 0.36 * filtre(brut, 520 + 1700 * Math.exp(-s * 8)) * enveloppe(k, n, 0.006, 0.05);
  });
}

function nappe(p, t, duree, notes, force, ouverture = 1) {
  const n = Math.round(duree * FREQUENCE);
  notes.forEach((note, q) => {
    for (const [desaccord, pan] of [[-0.07, -0.7], [0.07, 0.7], [0, 0]]) {
      const f = midi(note + desaccord), pas = f / FREQUENCE, filtre = passeBas(0.8);
      let phase = (q * 0.31 + desaccord + 1) % 1;
      p.poser(t, duree, pan, (k) => {
        phase = (phase + pas) % 1;
        const s = k / FREQUENCE;
        return force * 0.3 * filtre(scie(phase, pas), (1500 + 800 * Math.sin(s * 0.9 + q)) * ouverture) * enveloppe(k, n, 0.3, 0.5);
      });
    }
  });
}

function pincement(p, t, note, force, pan) {
  const f = midi(note), pas = f / FREQUENCE, duree = 0.26, filtre = passeBas(1.4);
  let phase = 0;
  p.poser(t, duree, pan, (k) => {
    phase = (phase + pas) % 1;
    const s = k / FREQUENCE;
    return force * 0.36 * filtre(carre(phase, pas) * 0.6 + scie(phase, pas) * 0.4, 900 + 4200 * Math.exp(-s * 20)) * Math.exp(-s * 12) * Math.min(1, s * 600);
  });
}

function voix(p, t, duree, note, force) {
  const f = midi(note), n = Math.round(duree * FREQUENCE);
  p.poser(t, duree, -0.12, (k) => {
    const s = k / FREQUENCE, vibrato = 1 + 0.004 * Math.sin(TOUR * 5.2 * s) * Math.min(1, s * 4);
    const ph = TOUR * f * vibrato * s;
    return force * 0.5 * (Math.sin(ph) + 0.4 * Math.sin(2 * ph) + 0.2 * Math.sin(3 * ph) + 0.08 * Math.sin(4 * ph)) * enveloppe(k, n, 0.012, 0.09) * (0.55 + 0.45 * Math.exp(-s * 5));
  });
}

function cloche(p, t, note, force, pan = 0) {
  const f = midi(note);
  p.poser(t, 1.6, pan, (k) => {
    const s = k / FREQUENCE;
    return force * 0.22 * (Math.sin(TOUR * f * s) * Math.exp(-s * 3.2) + 0.45 * Math.sin(TOUR * f * 2.76 * s) * Math.exp(-s * 6) + 0.2 * Math.sin(TOUR * f * 5.4 * s) * Math.exp(-s * 11)) * Math.min(1, s * 500);
  });
}

// --- Bruitages ---------------------------------------------------------------

function impact(p, t, rnd, force = 1) {
  const filtre = passeBas(0.9);
  p.poser(t, 0.9, 0, (k) => {
    const s = k / FREQUENCE;
    const phase = TOUR * (38 * s + (95 / 14) * (1 - Math.exp(-s * 14)));
    return force * (0.85 * Math.sin(phase) * Math.exp(-s * 4.2) + 0.5 * filtre(rnd() * 2 - 1, 2600 * Math.exp(-s * 5) + 200) * Math.exp(-s * 6)) * Math.min(1, s * 800);
  });
}

function souffle(p, t, duree, rnd, force = 1, monte = true) {
  // Bruit filtré dont la hauteur glisse : finit pile sur la coupe (t + duree).
  const filtreBas = passeBas(2.4), n = Math.round(duree * FREQUENCE);
  let pan = -0.6;
  for (const sens of [-1, 1]) {
    p.poser(t, duree, pan * sens, (k) => {
      const u = k / n, f = monte ? 350 * 9 ** u : 3200 * 0.11 ** u;
      return force * 0.3 * filtreBas(rnd() * 2 - 1, f) * (monte ? u * u : (1 - u) ** 2) * Math.min(1, (n - k) / 400);
    });
  }
}

function pop(p, t, force = 1, grave = false) {
  p.poser(t, 0.09, 0.1, (k) => {
    const s = k / FREQUENCE, f = (grave ? 520 : 880) * (1 + 3.5 * s);
    return force * 0.3 * Math.sin(TOUR * f * s) * Math.exp(-s * 46) * Math.min(1, s * 1200);
  });
}

function refus(p, t, force = 1) {
  // Deux notes graves qui descendent : « non ».
  [[0, 196], [0.13, 147]].forEach(([dt, f]) => {
    const pas = f / FREQUENCE, filtre = passeBas(1);
    let phase = 0;
    p.poser(t + dt, 0.16, 0, (k) => { phase = (phase + pas) % 1; const s = k / FREQUENCE; return force * 0.3 * filtre(carre(phase, pas), 1500) * Math.min(1, s * 400) * Math.min(1, (0.16 - s) * 40); });
  });
}

function tic(p, t, force = 1) {
  p.poser(t, 0.03, -0.1, (k) => { const s = k / FREQUENCE; return force * 0.2 * Math.sin(TOUR * 2100 * s) * Math.exp(-s * 150); });
}

// --- Effets ------------------------------------------------------------------

/** Écho stéréo qui passe d'un côté à l'autre. */
function echo(piste, temps, retour = 0.34, niveau = 0.3) {
  const n = piste.n, d = Math.round(temps * FREQUENCE), g = new Float32Array(n), dr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const eg = i >= d ? piste.d[i - d] + retour * dr[i - d] : 0, ed = i >= d ? piste.g[i - d] + retour * g[i - d] : 0;
    g[i] = eg; dr[i] = ed;
  }
  for (let i = 0; i < n; i++) { piste.g[i] += niveau * g[i]; piste.d[i] += niveau * dr[i]; }
}

/** Réverbération simple (4 peignes et 2 passe-tout par côté). */
function reverberation(piste, niveau = 0.2) {
  const cote = (source, decalage) => {
    const n = source.length, sortie = new Float32Array(n);
    for (const [retard, retour] of [[1557, 0.8], [1617, 0.79], [1491, 0.81], [1422, 0.8]]) {
      const d = retard + decalage, tampon = new Float32Array(d);
      let amorti = 0;
      for (let i = 0, q = 0; i < n; i++, q = (q + 1) % d) {
        const lu = tampon[q];
        amorti = lu * 0.72 + amorti * 0.28; // les aigus s'éteignent plus vite
        tampon[q] = source[i] + amorti * retour;
        sortie[i] += lu * 0.25;
      }
    }
    for (const retard of [225, 556]) {
      const d = retard + decalage, tampon = new Float32Array(d);
      for (let i = 0, q = 0; i < n; i++, q = (q + 1) % d) {
        const lu = tampon[q], entree = sortie[i];
        tampon[q] = entree + lu * 0.5;
        sortie[i] = lu - entree * 0.5;
      }
    }
    return sortie;
  };
  const rg = cote(piste.g, 0), rd = cote(piste.d, 23);
  for (let i = 0; i < piste.n; i++) { piste.g[i] += niveau * rg[i]; piste.d[i] += niveau * rd[i]; }
}

// --- La musique ----------------------------------------------------------------

/**
 * duree   secondes de vidéo ;  bpm  tempo ;  depart  seconde du premier temps (fin de l'accroche) ;
 * fin     seconde où commence l'écran de fin (null : pas d'écran de fin, accroche seule) ;
 * coupes  secondes des changements de plan ;  accents  [{ t, son }] (impact, pop, frappe, refus, compte, cloche) ;
 * sansMusique  true : les bruitages seuls (une piste fournie remplace la musique).
 */
export function composer({ duree, bpm = 110, depart = 0, fin = null, coupes = [], accents = [], graine = 1, ambiance = 'arcade', sansMusique = false }) {
  const n = Math.round(duree * FREQUENCE);
  const a = AMBIANCES[ambiance] || AMBIANCES.arcade;
  const rnd = hasard(graine), bruit = hasard(graine + 101);
  const temps = 60 / bpm, mesure = 4 * temps;
  const rythme = new Piste(n), grave = new Piste(n), fond = new Piste(n), aigu = new Piste(n), effets = new Piste(n);
  const finMontage = fin ?? duree;
  const frappes = []; // instants des grosses caisses : la nappe et la basse s'effacent dessous

  if (!sansMusique) {
    // 1. Intro (pendant l'accroche) : nappe qui s'ouvre et arpège discret, sans batterie.
    if (depart > 0.4) {
      nappe(fond, 0, depart + 0.3, a.accords[0], a.nappe * 0.9, 0.8);
      const pasIntro = temps / 2;
      for (let t = depart - Math.floor(depart / pasIntro) * pasIntro, q = 0; t < depart - 0.01; t += pasIntro, q++) {
        pincement(aigu, t, a.accords[0][q % a.accords[0].length] + 12, 0.5 + 0.5 * (t / depart), q % 2 ? 0.4 : -0.4);
      }
      souffle(effets, Math.max(0, depart - 0.9), Math.min(0.9, depart), bruit, 0.9, true);
    }

    // 2. Montage : la batterie démarre sur le premier plan de jeu.
    const mesures = Math.max(0, Math.ceil((finMontage - depart) / mesure - 1e-6));
    // Mélodie : un motif de deux mesures tiré de la graine, repris et varié (A A' B A').
    const motif = (variante) => {
      const r = hasard(graine * 31 + variante), notes = [];
      let degre = 3 + Math.floor(r() * 3);
      for (let pas = 0; pas < 16; pas++) {
        if (pas % 2 === 1 && r() < 0.62) continue;         // surtout sur les croches
        if (pas % 4 !== 0 && r() < 0.3) continue;          // des silences
        degre = Math.min(GAMME.length - 1, Math.max(1, degre + Math.round((r() - 0.5) * 3.2)));
        notes.push({ pas, degre, longue: r() < 0.3 });
      }
      return notes;
    };
    const motifs = [motif(1), motif(2)];
    for (let m = 0; m < mesures; m++) {
      const t0 = depart + m * mesure, accord = a.accords[m % a.accords.length], dernier = m === mesures - 1;
      const montee = a.montee ? 0.55 + 0.45 * (m / Math.max(1, mesures - 1)) : 1;
      for (const pos of a.caisse) { const t = t0 + pos * temps; if (t < finMontage - 0.02) { grosseCaisse(rythme, t); frappes.push(t); } }
      for (const pos of a.claque) { const t = t0 + pos * temps; if (t < finMontage - 0.02) claque(rythme, t, bruit, 0.9); }
      for (let pos = 0; pos < 4 - 1e-9; pos += a.charley) {
        const t = t0 + pos * temps, contre = Math.abs((pos % 1) - 0.5) < 0.01;
        if (t < finMontage - 0.02) charley(rythme, t, bruit, (contre ? 1 : 0.55) * montee, contre ? 0.3 : -0.2);
      }
      if (dernier && fin !== null) for (let q = 0; q < 8; q++) claque(rythme, t0 + 3 * temps + (q * temps) / 8, bruit, 0.35 + 0.06 * q); // roulement vers la fin
      // Basse
      const fondamentale = 40 + (((accord[0] - 40) % 12) + 12) % 12; // entre mi 2 et ré dièse 3 : un téléphone la fait encore entendre
      if (a.basse === 'tenue') { basse(grave, t0, 2 * temps * 0.96, fondamentale, 1.1); basse(grave, t0 + 2.5 * temps, 1.4 * temps, fondamentale, 0.9); }
      else for (let q = 0; q < 8; q++) {
        const note = a.basse === 'obstinee' ? fondamentale + (q === 3 || q === 6 ? 12 : 0) : fondamentale + (q === 7 ? 7 : 0);
        basse(grave, t0 + (q * temps) / 2, (temps / 2) * 0.86, note, q % 2 ? 0.8 : 1);
      }
      nappe(fond, t0, mesure * 1.04, accord, a.nappe, montee);
      // Arpège
      const pasArpege = temps / a.arpege, suite = [0, 1, 2, 1, 0, 2, 1, 2];
      for (let q = 0; q < 4 * a.arpege; q++) {
        const note = accord[suite[q % suite.length] % accord.length] + 12 + (q % 8 >= 6 ? 12 : 0);
        pincement(aigu, t0 + q * pasArpege, note, (q % a.arpege === 0 ? 0.85 : 0.55) * montee, q % 2 ? 0.45 : -0.45);
      }
      // Mélodie (pas pendant la première mesure : elle laisse entrer le rythme)
      if (m >= 1 || mesures <= 2) {
        const phrase = motifs[Math.floor(m / 2) % 4 === 2 ? 1 : 0];
        for (const note of phrase.filter((x) => Math.floor(x.pas / 8) === m % 2)) {
          const t = t0 + ((note.pas % 8) * temps) / 2;
          const hauteur = GAMME[note.degre] + (Math.floor(m / 2) % 2 && note.pas === 0 ? 0 : 0) + 12;
          if (t < finMontage - 0.05) voix(aigu, t, (note.longue ? 1.5 : 0.8) * (temps / 2) * 1.6, hauteur, a.melodie);
        }
      }
    }

    // 3. Écran de fin : la batterie s'arrête, l'accord de départ reste et s'éteint.
    if (fin !== null && duree - fin > 0.3) {
      const tonique = a.accords[0];
      nappe(fond, fin, duree - fin, [tonique[0], tonique[1], tonique[2], tonique[0] + 12], a.nappe * 1.25);
      basse(grave, fin, Math.min(2.4, duree - fin), tonique[0] - 12, 1.1);
      grosseCaisse(rythme, fin, 1); frappes.push(fin);
      [0, 2, 1, 2, 3].forEach((q, k) => cloche(aigu, fin + 0.02 + k * temps * 0.5, [tonique[0], tonique[1], tonique[2], tonique[0] + 12][q] + 12, 0.8 - k * 0.1, k % 2 ? 0.4 : -0.4));
    }
  }

  // 4. Bruitages : coupes et textes.
  for (const t of coupes) { if (t > 0.3) souffle(effets, t - 0.26, 0.26, bruit, 0.55, true); }
  if (!sansMusique && depart > 0.05 && depart < duree - 0.1) impact(effets, depart, bruit, 0.75);
  for (const acc of accents) {
    if (acc.t < 0 || acc.t > duree - 0.02) continue;
    if (acc.son === 'impact') impact(effets, acc.t, bruit, 1);
    else if (acc.son === 'frappe') { impact(effets, acc.t, bruit, 0.7); pop(effets, acc.t, 0.8, true); }
    else if (acc.son === 'refus') refus(effets, acc.t, 1);
    else if (acc.son === 'cloche') cloche(effets, acc.t, 81, 0.9);
    else if (acc.son === 'compte') { for (let q = 0; q < 14; q++) tic(effets, acc.t + q * 0.042 * (1 + q * 0.04), 0.6 + 0.03 * q); pop(effets, acc.t + 0.62, 0.9); }
    else if (acc.son === 'souffle') souffle(effets, acc.t - 0.3, 0.3, bruit, 0.7, true);
    else pop(effets, acc.t, 0.8);
  }

  // 5. Mélange : la nappe et la basse s'effacent un instant sous chaque grosse caisse.
  frappes.sort((x, y) => x - y);
  let prochaine = 0;
  const creux = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) {
    const t = i / FREQUENCE;
    while (prochaine < frappes.length && frappes[prochaine] <= t) prochaine++;
    const depuis = prochaine ? t - frappes[prochaine - 1] : 9;
    creux[i] = 1 - 0.55 * Math.exp(-depuis * 14);
  }
  echo(aigu, temps * 0.75, 0.32, 0.28);
  const melange = new Piste(n);
  for (let i = 0; i < n; i++) {
    melange.g[i] = aigu.g[i] + fond.g[i] * creux[i] + effets.g[i] * 0.9;
    melange.d[i] = aigu.d[i] + fond.d[i] * creux[i] + effets.d[i] * 0.9;
  }
  reverberation(melange, 0.22);
  const sortie = new Float32Array(n * 2);
  let crete = 0;
  for (let i = 0; i < n; i++) {
    const t = i / FREQUENCE, fondu = Math.min(1, t / 0.012) * Math.min(1, (duree - t) / 0.3);
    // Écrêtage doux : aucun échantillon ne dépasse, même quand tout joue ensemble.
    const g = Math.tanh((melange.g[i] + rythme.g[i] + grave.g[i] * creux[i]) * 0.9) * fondu;
    const d = Math.tanh((melange.d[i] + rythme.d[i] + grave.d[i] * creux[i]) * 0.9) * fondu;
    sortie[2 * i] = g; sortie[2 * i + 1] = d;
    crete = Math.max(crete, Math.abs(g), Math.abs(d));
  }
  const gain = crete > 0 ? Math.min(4, 0.89 / crete) : 1; // crête à -1 dB
  for (let i = 0; i < sortie.length; i++) sortie[i] *= gain;
  return sortie;
}

/** Fichier WAV 16 bits stéréo. */
export async function ecrireWav(fichier, echantillons) {
  const donnees = Buffer.alloc(echantillons.length * 2);
  for (let i = 0; i < echantillons.length; i++) donnees.writeInt16LE(Math.round(Math.max(-1, Math.min(1, echantillons[i])) * 32767), i * 2);
  const tete = Buffer.alloc(44);
  tete.write('RIFF', 0); tete.writeUInt32LE(36 + donnees.length, 4); tete.write('WAVEfmt ', 8);
  tete.writeUInt32LE(16, 16); tete.writeUInt16LE(1, 20); tete.writeUInt16LE(2, 22);
  tete.writeUInt32LE(FREQUENCE, 24); tete.writeUInt32LE(FREQUENCE * 4, 28); tete.writeUInt16LE(4, 32); tete.writeUInt16LE(16, 34);
  tete.write('data', 36); tete.writeUInt32LE(donnees.length, 40);
  await writeFile(fichier, Buffer.concat([tete, donnees]));
}
