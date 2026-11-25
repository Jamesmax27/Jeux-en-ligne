// ==========================================================================
// rendu.js — dessine chaque image d'une vidéo (page ouverte par composition.mjs)
//
// Le « montage » reçu (/montage.json) est une liste de plans déjà résolus :
// textes remplis, images de jeu choisies, durées en images. Cette page ne
// décide rien : l'image n° i ne dépend que de i (aucune horloge, aucun
// hasard libre), donc la même recette redonne la même vidéo.
//
// Plans : « jeu » (gameplay filmé, plein écran, ou dans une fenêtre pour un
// rush d'ordinateur), « mur » (mur de jaquettes), « attente » (fausse fenêtre
// de téléchargement), « fin » (logo et adresse du site), « ciel » (fond seul).
// Gabarit commun : ciel étoilé du site, plaques de verre, Fredoka et Nunito.
// ==========================================================================

const M = await (await fetch('/montage.json')).json();
const L = M.largeur, H = M.hauteur, IPS = M.ips;
const G = M.gabarit, C = G.couleurs, Z = G.zone_sure;

const toile = document.getElementById('scene');
toile.width = L; toile.height = H;
const g = toile.getContext('2d', { alpha: false, willReadFrequently: true });
g.imageSmoothingQuality = 'high';

for (const [nom, fichier, graisses] of [['Fredoka', 'fredoka.woff2', '300 600'], ['Nunito', 'nunito.woff2', '200 1000']]) {
  document.fonts.add(await new FontFace(nom, `url(/site/polices/${fichier})`, { weight: graisses }).load());
}

// --- Petits outils ---------------------------------------------------------

const borne = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mel = (a, b, u) => a + (b - a) * u;
const sortieDouce = (u) => 1 - (1 - u) ** 3;
const entreeVive = (u) => u ** 3;
const entreeSortie = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - ((-2 * u + 2) ** 3) / 2);
const rebond = (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2;
const TOUR = Math.PI * 2;

function hasard(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const rvb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
const rgba = (hex, a) => { const [r, v, b] = rvb(hex); return `rgba(${r}, ${v}, ${b}, ${a})`; };
const couleur = (nom) => C[nom] || nom;

/** Luminance relative (WCAG) d'une couleur sRVB, composantes de 0 à 255. */
function luminance(r, v, b) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(v) + 0.0722 * f(b);
}
const contraste = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

// Images : celles du rush défilent (on n'en garde que quelques-unes), les autres restent.
const fixes = new Map(), roulantes = new Map();
function image(url, fixe = false) {
  const cache = fixe ? fixes : roulantes;
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then((r) => { if (!r.ok) throw new Error(`${url} : ${r.status}`); return r.blob(); }).then((b) => createImageBitmap(b));
    cache.set(url, p);
    if (!fixe && cache.size > 10) {
      const [vieille] = cache.keys();
      cache.get(vieille).then((b) => b.close()).catch(() => {});
      cache.delete(vieille);
    }
  }
  return p;
}
async function dessinSvg(source) { const im = new Image(); im.src = source; await im.decode(); return im; }

const LOGO = { embleme: await dessinSvg(M.logo.embleme), mot: await dessinSvg(M.logo.mot) };
const imageDuRush = (p, n) => image(`${p.rush}/${String(borne(n, 0, p.images - 1)).padStart(5, '0')}.jpg`);

function rectArrondi(x0, y0, x1, y1, r) { g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)); }

// --- Ciel du site : nuit indigo, planète lointaine, lueur violette, étoiles ---

const ETOILES = (() => {
  const r = hasard(M.graine || 7), liste = [];
  for (let k = 0; k < 240; k++) {
    liste.push({ x: r() * L, y: r() * H, r: 0.9 + r() * r() * 3.4, fond: 0.25 + r() * 0.75, phase: r() * TOUR, vitesse: 0.9 + r() * 2.4, lilas: r() < 0.22, croix: r() < 0.07 });
  }
  return liste;
})();

function ciel(i, { voile = 0, filante = false } = {}) {
  const t = i / IPS;
  let d = g.createLinearGradient(0, 0, 0, H);
  d.addColorStop(0, '#17133d'); d.addColorStop(0.5, C.nuit); d.addColorStop(1, C.nuit_profonde);
  g.fillStyle = d; g.fillRect(0, 0, L, H);
  d = g.createRadialGradient(L * 0.22, H * 1.03, 0, L * 0.22, H * 1.03, H * 0.62);
  d.addColorStop(0, 'rgba(124, 92, 255, 0.36)'); d.addColorStop(1, 'rgba(124, 92, 255, 0)');
  g.fillStyle = d; g.fillRect(0, 0, L, H);
  // Grande planète lointaine en haut à droite, avec son anneau.
  const px = L * 0.94 + Math.sin(t * 0.2) * 6, py = H * 0.075 + t * 2, pr = 300;
  d = g.createRadialGradient(px - pr * 0.5, py - pr * 0.45, pr * 0.05, px, py, pr);
  d.addColorStop(0, '#5346ad'); d.addColorStop(0.55, '#2c2469'); d.addColorStop(1, '#161240');
  g.fillStyle = d; g.beginPath(); g.arc(px, py, pr, 0, TOUR); g.fill();
  g.save(); g.translate(px, py); g.rotate(-0.34);
  g.strokeStyle = rgba(C.lavande, 0.3); g.lineWidth = 8;
  g.beginPath(); g.ellipse(0, 0, pr * 1.6, pr * 0.3, 0, 0.06 * Math.PI, 0.94 * Math.PI); g.stroke();
  g.restore();
  for (const e of ETOILES) {
    const y = (((e.y - t * 16 * e.fond) % H) + H) % H;
    const a = (0.4 + 0.6 * Math.sin(t * e.vitesse + e.phase) ** 2) * (0.45 + 0.55 * e.fond);
    g.fillStyle = e.lilas ? rgba(C.lavande, a) : rgba(C.craie, a);
    if (e.croix) { g.fillRect(e.x - 8, y - 1.5, 16, 3); g.fillRect(e.x - 1.5, y - 8, 3, 16); } else { g.beginPath(); g.arc(e.x, y, e.r, 0, TOUR); g.fill(); }
  }
  if (filante) {
    // Une étoile filante toutes les 2,4 s : trait or qui traverse le haut du ciel.
    const u = (t % 2.4) / 0.7;
    if (u < 1) {
      const n = Math.floor(t / 2.4), x = L * (0.15 + 0.5 * ((n * 0.37) % 1)) + u * 420, y = H * (0.2 + 0.12 * ((n * 0.61) % 1)) + u * 190;
      d = g.createLinearGradient(x - 170, y - 77, x, y);
      d.addColorStop(0, rgba(C.or, 0)); d.addColorStop(1, rgba(C.or, 0.85 * Math.sin(u * Math.PI)));
      g.strokeStyle = d; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - 170, y - 77); g.lineTo(x, y); g.stroke();
    }
  }
  if (voile) { g.fillStyle = rgba(C.nuit_profonde, voile); g.fillRect(0, 0, L, H); }
}

/** Voiles sombres en haut et en bas d'un plan de jeu : les textes s'y posent. */
function voiles() {
  let d = g.createLinearGradient(0, 0, 0, 800);
  d.addColorStop(0, rgba(C.nuit_profonde, 0.6)); d.addColorStop(1, rgba(C.nuit_profonde, 0));
  g.fillStyle = d; g.fillRect(0, 0, L, 800);
  d = g.createLinearGradient(0, 1040, 0, H);
  d.addColorStop(0, rgba(C.nuit_profonde, 0)); d.addColorStop(1, rgba(C.nuit_profonde, 0.66));
  g.fillStyle = d; g.fillRect(0, 1040, L, H - 1040);
}

// --- Textes ------------------------------------------------------------------

const RAPPORT = { textes: [] };
const miseEnPage = new Map();
const fonte = (st, taille) => `${st.graisse} ${taille}px "${G.polices[st.police]}", sans-serif`;

/** « mot *accent* mot » → lignes de mots, chaque mot en morceaux { t, accent }. */
function decouper(texte) {
  let accent = false;
  return String(texte).split('\n').map((ligne) => ligne.split(' ').filter(Boolean).map((brut) => {
    const morceaux = [];
    brut.split('*').forEach((m, k) => { if (k) accent = !accent; if (m) morceaux.push({ t: m, accent }); });
    return morceaux;
  }));
}
const clair = (mots) => mots.map((m) => m.map((s) => s.t).join('')).join(' ');

/** Place un texte : taille réduite si besoin, retours à la ligne, boîte dans la zone sûre. */
function placer(tx) {
  if (miseEnPage.has(tx.id)) return miseEnPage.get(tx.id);
  const st = { ...G.styles[tx.style], ...(tx.plaque !== undefined ? { plaque: tx.plaque } : {}), ...(tx.taille ? { taille: tx.taille } : {}), ...(tx.couleur ? { couleur: tx.couleur } : {}) };
  const margeX = st.plaque === 'pilule' ? 0.62 : st.plaque ? 0.46 : 0.1, margeY = st.plaque ? 0.3 : 0.08;
  const gauche = tx.alignement === 'gauche';
  const essai = (droite) => {
    const dispo = (larg) => (gauche ? droite - Z.gauche : 2 * Math.min(L / 2 - Z.gauche, droite - L / 2)) - 2 * margeX * larg;
    let taille = st.taille, lignes = decouper(tx.texte);
    const largeur = (mots) => g.measureText(clair(mots)).width;
    // 1. Tient-il en réduisant un peu les lettres ? (jusqu'à 76 % de la taille du style, jamais sous la taille lisible)
    const plancher = Math.max(st.taille * 0.76, Math.min(st.taille, G.lisibilite.taille_min));
    for (;;) {
      g.font = fonte(st, taille);
      if (Math.max(...lignes.map(largeur)) <= dispo(taille) || taille * 0.96 < plancher) break;
      taille = Math.floor(taille * 0.96);
    }
    // 2. Sinon, retour à la ligne entre deux mots.
    g.font = fonte(st, taille);
    const coupees = [];
    for (const mots of lignes) {
      let ligne = [];
      for (const mot of mots) {
        if (ligne.length && largeur([...ligne, mot]) > dispo(taille)) { coupees.push(ligne); ligne = [mot]; } else ligne.push(mot);
      }
      coupees.push(ligne);
    }
    lignes = coupees.map((mots) => ({ mots, largeur: largeur(mots) }));
    const l = Math.max(...lignes.map((x) => x.largeur)), h = lignes.length * taille * st.interligne;
    const pl = l + 2 * margeX * taille, ph = h + 2 * margeY * taille;
    const cx = gauche ? Z.gauche + pl / 2 : L / 2;
    let cy;
    if (typeof tx.position === 'number') cy = tx.position;
    else if (tx.position === 'haut') cy = Z.haut + 96 + ph / 2;
    else if (tx.position === 'bas') cy = Z.bas - 130 - ph / 2;
    else if (tx.position === 'pied') cy = Z.bas - ph / 2;
    else cy = (Z.haut + Z.bas) / 2;
    return { st, taille, lignes, l, h, cx, cy, boite: { x0: cx - pl / 2, y0: cy - ph / 2, x1: cx + pl / 2, y1: cy + ph / 2 } };
  };
  let mp = essai(Z.droite);
  if (mp.boite.y1 > Z.colonne_droite.depuis) mp = essai(Z.colonne_droite.droite); // colonne de boutons des applis
  miseEnPage.set(tx.id, mp);
  return mp;
}

function plaque(b, type, alpha) {
  g.save();
  g.globalAlpha *= alpha;
  const r = type === 'verre' ? 40 : 999;
  g.shadowColor = 'rgba(4, 2, 16, 0.6)'; g.shadowBlur = 36; g.shadowOffsetY = 12;
  if (type === 'pleine') {
    const d = g.createLinearGradient(0, b.y0, 0, b.y1);
    d.addColorStop(0, '#d8ceff'); d.addColorStop(1, C.lavande);
    g.fillStyle = d;
  } else g.fillStyle = 'rgba(16, 13, 40, 0.88)';
  rectArrondi(b.x0, b.y0, b.x1, b.y1, r); g.fill();
  g.shadowColor = 'transparent';
  if (type !== 'pleine') { g.lineWidth = 3; g.strokeStyle = rgba(C.lavande, 0.55); rectArrondi(b.x0 + 1.5, b.y0 + 1.5, b.x1 - 1.5, b.y1 - 1.5, r); g.stroke(); }
  g.restore();
}

/** Dessine un texte du plan à l'image k du plan (entrée animée, sortie en fondu). */
function dessinerTexte(tx, k, plan) {
  if (k < tx.de || k >= tx.a) return;
  const mp = placer(tx), { st, taille, boite: b } = mp;
  const depuis = k - tx.de, n = tx.entree === 'frappe' ? 5 : 8, u = borne((depuis + 1) / n);
  let alpha = 1, echelle = 1, dx = 0, dy = 0;
  if (tx.entree === 'frappe') { echelle = mel(2.5, 1, entreeVive(u)); alpha = borne(u * 2.2); if (depuis >= n && depuis < n + 5) { const v = 1 - (depuis - n) / 5; dx = Math.sin(depuis * 2.7) * 11 * v; dy = Math.cos(depuis * 3.1) * 7 * v; } }
  else if (tx.entree === 'glisse') { dy = (1 - sortieDouce(u)) * 70; alpha = u; }
  else if (tx.entree === 'gauche') { dx = -(1 - sortieDouce(u)) * 140; alpha = u; }
  else if (tx.entree === 'fondu') alpha = u;
  else if (tx.entree === 'impact') echelle = mel(1.24, 1, sortieDouce(borne(depuis / 7))); // entier dès la première image
  else if (tx.entree !== 'aucune' && tx.entree !== 'compte' && tx.entree !== 'impact') { echelle = mel(0.55, 1, rebond(u)); alpha = borne(u * 2.4); } // « pop », par défaut
  if (tx.sortie !== false && tx.a < plan.fin - plan.debut) alpha *= borne((tx.a - k) / 4);
  // Nombre qui grimpe jusqu'à sa valeur (compteur de jeux).
  let lignes = mp.lignes;
  if (tx.entree === 'compte' && tx.valeur !== undefined) {
    const v = Math.round(mel(tx.valeur * (tx.depuis ?? 0.4), tx.valeur, sortieDouce(borne((depuis + 1) / (tx.dureeCompte || 18)))));
    g.font = fonte(st, taille);
    const mots = [[{ t: String(v), accent: false }]];
    lignes = [{ mots, largeur: g.measureText(String(v)).width }];
  }
  g.save();
  g.translate(mp.cx + dx, mp.cy + dy);
  if (tx.rotation) g.rotate((tx.rotation * Math.PI) / 180);
  g.scale(echelle, echelle);
  g.translate(-mp.cx, -mp.cy);
  g.globalAlpha = alpha;
  if (st.plaque) plaque(b, st.plaque, 1);

  // Contrôle de lisibilité, une fois le texte posé : fond réellement dessiné sous les lettres.
  const pose = k === Math.min(tx.a - 1, tx.de + n + 6);
  let fond = null;
  if (pose && st.plaque) {
    const x0 = Math.max(0, Math.round(mp.cx - mp.l / 2)), y0 = Math.max(0, Math.round(mp.cy - mp.h / 2));
    const d = g.getImageData(x0, y0, Math.min(L - x0, Math.round(mp.l)), Math.min(H - y0, Math.round(mp.h))).data;
    const lums = [];
    for (let q = 0; q < d.length; q += 4 * 7) lums.push(luminance(d[q], d[q + 1], d[q + 2]));
    lums.sort((x, y) => x - y);
    fond = st.plaque === 'pleine' ? lums[Math.floor(lums.length * 0.1)] : lums[Math.floor(lums.length * 0.9)]; // le pire dixième
  }

  g.font = fonte(st, taille);
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  const teinte = couleur(st.couleur), accent = st.couleur === 'or' ? C.craie : C.or;
  lignes.forEach((ligne, n2) => {
    let x = (tx.alignement === 'gauche' ? mp.cx - mp.l / 2 : mp.cx - ligne.largeur / 2);
    const y = mp.cy - mp.h / 2 + (n2 + 0.5) * taille * st.interligne + taille * 0.34;
    const espace = g.measureText(' ').width;
    ligne.mots.forEach((mot) => {
      for (const s of mot) {
        if (!st.plaque) {
          // Sans plaque : contour sombre épais et ombre, lisible sur n'importe quel jeu.
          g.shadowColor = 'rgba(4, 2, 16, 0.7)'; g.shadowBlur = taille * 0.16; g.shadowOffsetY = taille * 0.05;
          g.lineWidth = Math.max(6, taille * 0.12); g.strokeStyle = C.nuit_profonde;
          g.strokeText(s.t, x, y);
          g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
        }
        g.fillStyle = s.accent ? accent : teinte;
        g.fillText(s.t, x, y);
        x += g.measureText(s.t).width;
      }
      x += espace;
    });
  });
  g.restore();

  if (pose) {
    const lumTexte = Math.min(...[teinte, ...(mp.lignes.some((l) => l.mots.some((m) => m.some((s) => s.accent))) ? [accent] : [])].map((c) => luminance(...rvb(c))));
    const lumFond = st.plaque ? fond : luminance(...rvb(C.nuit_profonde)); // sans plaque : le contour sombre entoure chaque lettre
    RAPPORT.textes.push({
      id: tx.id, plan: plan.n, type: plan.type, texte: clair(mp.lignes.flatMap((l) => l.mots)), style: tx.style, taille,
      boite: { x0: Math.round(b.x0), y0: Math.round(b.y0), x1: Math.round(b.x1), y1: Math.round(b.y1) },
      contraste: Number(contraste(st.plaque === 'pleine' ? luminance(...rvb(teinte)) : lumTexte, lumFond).toFixed(1)),
      fond: st.plaque || 'contour', images: tx.a - tx.de, tourne: !!tx.rotation,
    });
  }
}

// --- Plans -------------------------------------------------------------------

/** Gameplay filmé : plein écran (rush de téléphone) ou dans une fenêtre (rush d'ordinateur). */
async function planJeu(p, k, i) {
  const im = await imageDuRush(p, p.depart + k);
  imageDuRush(p, p.depart + k + 1).catch(() => {}); // la suivante se prépare
  if (p.paysage) {
    ciel(i);
    const l = 980, h = Math.round((l * 9) / 16), barre = 70, x0 = (L - l) / 2, y0 = 540, u = sortieDouce(borne((k + 1) / 9));
    g.save();
    g.translate(L / 2, y0 + (h + barre) / 2); g.scale(mel(0.86, 1, u), mel(0.86, 1, u)); g.translate(-L / 2, -(y0 + (h + barre) / 2));
    g.shadowColor = 'rgba(30, 14, 100, 0.9)'; g.shadowBlur = 60; g.shadowOffsetY = 24;
    g.fillStyle = C.surface; rectArrondi(x0, y0, x0 + l, y0 + barre + h, 30); g.fill();
    g.shadowColor = 'transparent';
    for (let q = 0; q < 3; q++) { g.fillStyle = rgba(C.craie_douce, 0.55); g.beginPath(); g.arc(x0 + 44 + q * 34, y0 + barre / 2, 9, 0, TOUR); g.fill(); }
    g.fillStyle = rgba(C.nuit_profonde, 0.8); rectArrondi(x0 + 170, y0 + 14, x0 + l - 40, y0 + barre - 14, 21); g.fill();
    g.fillStyle = C.craie_douce; g.font = `800 28px "${G.polices.texte}"`; g.textBaseline = 'middle';
    g.fillText(M.site, x0 + 196, y0 + barre / 2 + 1);
    g.save(); rectArrondi(x0, y0 + barre, x0 + l, y0 + barre + h, 0); g.clip(); g.drawImage(im, x0, y0 + barre, l, h); g.restore();
    g.lineWidth = 3; g.strokeStyle = rgba(C.lavande, 0.5); rectArrondi(x0 + 1.5, y0 + 1.5, x0 + l - 1.5, y0 + barre + h - 1.5, 30); g.stroke();
    g.restore();
    return;
  }
  // Coup de zoom à l'entrée, puis image nette, pixel pour pixel.
  const z = 1 + (p.entree === 'zoom' ? 0.34 * (1 - sortieDouce(borne(k / 8))) : p.entree === 'coupe' ? 0.07 * (1 - sortieDouce(borne(k / 9))) : 0);
  const l = L * z, h = H * z;
  g.drawImage(im, (L - l) / 2, (H - h) / 2, l, h);
  voiles();
}

/** Mur de jaquettes qui défile, penché : la quantité de jeux en une image. */
async function planMur(p, k, i) {
  ciel(i);
  const t = k / IPS, lw = 300, lh = 400, esp = 22, colonnes = p.colonnes.length;
  // Défilement : très vite au début, puis lent, comme une roue qui se pose.
  const course = (s) => 240 * s + (2300 - 240) * 0.36 * (1 - Math.exp(-s / 0.36));
  const vitesse = 240 + (2300 - 240) * Math.exp(-t / 0.36);
  const largeur = colonnes * lw + (colonnes - 1) * esp;
  const passes = vitesse > 800 ? [[-vitesse / IPS * 0.55, 0.38], [0, 1]] : [[0, 1]];
  g.save();
  g.translate(L / 2, H / 2); g.rotate(-0.15); g.scale(1.16, 1.16);
  for (const [trainee, alpha] of passes) {
    for (let c = 0; c < colonnes; c++) {
      const liste = p.colonnes[c], pas = lh + esp, tour = liste.length * pas, sens = c % 2 ? 1 : -1;
      const decalage = sens * (course(t) * (0.82 + 0.12 * c) + trainee) + c * 137;
      const x = -largeur / 2 + c * (lw + esp);
      for (let r = 0; r < liste.length; r++) {
        const y = ((((r * pas + decalage) % tour) + tour) % tour) - tour / 2;
        if (y < -H / 2 - lh - 260 || y > H / 2 + 260) continue;
        const im = await image(liste[r], true);
        g.save(); g.globalAlpha = alpha;
        rectArrondi(x, y, x + lw, y + lh, 26); g.clip(); g.drawImage(im, x, y, lw, lh);
        g.restore();
        if (alpha === 1) { g.lineWidth = 3; g.strokeStyle = 'rgba(242, 239, 250, 0.16)'; rectArrondi(x + 1.5, y + 1.5, x + lw - 1.5, y + lh - 1.5, 26); g.stroke(); }
      }
    }
  }
  g.restore();
  // Le centre s'assombrit : le nombre s'y lit, les jaquettes restent vives autour.
  const d = g.createRadialGradient(L / 2, 770, 60, L / 2, 770, 1000);
  d.addColorStop(0, rgba(C.nuit_profonde, 0.74)); d.addColorStop(0.4, rgba(C.nuit_profonde, 0.42)); d.addColorStop(1, rgba(C.nuit_profonde, 0.08));
  g.fillStyle = d; g.fillRect(0, 0, L, H);
}

/** Fausse fenêtre de téléchargement qui n'avance pas, puis tombe (accroche « immédiateté »). */
function planAttente(p, k, i) {
  ciel(i);
  const t = k / IPS, chute = p.chute !== undefined ? Math.max(0, k - p.chute) : 0;
  const cx = L / 2, cy = 740, l = 800, h = 470, grand = 1.16; // fenêtre agrandie : elle occupe la zone sûre
  g.save();
  g.translate(cx + (chute ? Math.sin(chute * 1.9) * 16 * Math.max(0, 1 - chute / 6) : 0), cy + chute * chute * 9);
  g.rotate(chute * 0.022);
  g.scale(grand, grand);
  g.shadowColor = 'rgba(4, 2, 16, 0.6)'; g.shadowBlur = 50; g.shadowOffsetY = 20;
  g.fillStyle = 'rgba(26, 22, 56, 0.96)'; rectArrondi(-l / 2, -h / 2, l / 2, h / 2, 48); g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 3; g.strokeStyle = rgba(C.lavande, 0.4); rectArrondi(-l / 2 + 1.5, -h / 2 + 1.5, l / 2 - 1.5, h / 2 - 1.5, 48); g.stroke();
  // Icône : carré arrondi et flèche vers le bas.
  const ix = -l / 2 + 70, iy = -h / 2 + 64, ic = 132;
  g.fillStyle = rgba(C.lavande, 0.16); rectArrondi(ix, iy, ix + ic, iy + ic, 30); g.fill();
  g.strokeStyle = C.lavande; g.lineWidth = 12; g.lineCap = 'round'; g.lineJoin = 'round';
  const saut = Math.sin(t * 5) * 5;
  g.beginPath(); g.moveTo(ix + ic / 2, iy + 30 + saut); g.lineTo(ix + ic / 2, iy + 84 + saut); g.moveTo(ix + ic / 2 - 26, iy + 60 + saut); g.lineTo(ix + ic / 2, iy + 86 + saut); g.lineTo(ix + ic / 2 + 26, iy + 60 + saut); g.moveTo(ix + 34, iy + 106); g.lineTo(ix + ic - 34, iy + 106); g.stroke();
  // Titre de la fenêtre, à droite de l'icône.
  g.fillStyle = C.craie; g.font = `800 60px "${G.polices.texte}"`; g.textBaseline = 'middle';
  g.fillText(p.titre, ix + ic + 40, iy + ic / 2 + 2);
  if (k === 6) {
    const lt = g.measureText(p.titre).width * grand, x0 = cx + (ix + ic + 40) * grand, y0 = cy + (iy + ic / 2 - 36) * grand;
    RAPPORT.textes.push({ id: `${p.n}-titre`, plan: p.n, type: 'attente', texte: p.titre, style: 'fenetre', taille: Math.round(60 * grand), boite: { x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x0 + lt), y1: Math.round(y0 + 72 * grand) }, contraste: Number(contraste(luminance(...rvb(C.craie)), luminance(26, 22, 56)).toFixed(1)), fond: 'verre', images: p.chute ?? (p.fin - p.debut), tourne: false });
  }
  // Barre qui n'avance presque pas.
  const bx = -l / 2 + 70, by = h / 2 - 118, bl = l - 140, bh = 30, plein = 0.05 + 0.012 * Math.sin(t * 2.2) + 0.004 * t;
  g.fillStyle = 'rgba(242, 239, 250, 0.13)'; rectArrondi(bx, by, bx + bl, by + bh, 15); g.fill();
  g.fillStyle = C.lavande; rectArrondi(bx, by, bx + Math.max(bh, bl * plein), by + bh, 15); g.fill();
  // Trois points d'attente.
  for (let q = 0; q < 3; q++) { g.fillStyle = rgba(C.craie_douce, 0.35 + 0.65 * (Math.floor(t * 4) % 3 === q ? 1 : 0)); g.beginPath(); g.arc(bx + 12 + q * 34, by + 74, 9, 0, TOUR); g.fill(); }
  g.restore();
}

/** Écran de fin : emblème et mot-symbole du site ; l'adresse et l'appel à l'action sont des textes. */
function planFin(p, k, i) {
  ciel(i, { filante: true });
  const t = k / IPS, u = borne((k + 1) / 12), e = mel(0.4, 1, rebond(u)), cy = 470 + Math.sin(t * 1.7) * 9;
  const d = g.createRadialGradient(L / 2, cy, 20, L / 2, cy, 420);
  d.addColorStop(0, rgba(C.lavande, 0.3 * borne(k / 10))); d.addColorStop(1, rgba(C.lavande, 0));
  g.fillStyle = d; g.fillRect(0, 0, L, 1000);
  const l = 430 * e, h = l * (LOGO.embleme.height / LOGO.embleme.width);
  g.save(); g.globalAlpha = borne((k + 1) / 5); g.drawImage(LOGO.embleme, L / 2 - l / 2, cy - h / 2, l, h); g.restore();
  const v = sortieDouce(borne((k - 5) / 9)), ml = 700, mh = ml * (LOGO.mot.height / LOGO.mot.width);
  g.save(); g.globalAlpha = v; g.drawImage(LOGO.mot, L / 2 - ml / 2, 668 + (1 - v) * 40, ml, mh); g.restore();
  // Sous la zone sûre (là où les applis posent leurs boutons) : les jaquettes des jeux montrés, qui flottent.
  (p.dessins || []).forEach((im, q) => {
    const n = p.dessins.length, w = sortieDouce(borne((k - 10 - q * 4) / 12)), lj = 264, hj = 352;
    const x = L / 2 + (q - (n - 1) / 2) * 300, y = 1545 + (1 - w) * 260 + Math.sin(t * 1.3 + q * 2.1) * 12 + Math.abs(q - (n - 1) / 2) * 34;
    g.save();
    g.globalAlpha = w;
    g.translate(x, y); g.rotate(((q - (n - 1) / 2) * 7 * Math.PI) / 180 + Math.sin(t * 0.9 + q) * 0.012);
    g.shadowColor = 'rgba(30, 14, 100, 0.9)'; g.shadowBlur = 40; g.shadowOffsetY = 18;
    g.fillStyle = C.surface; rectArrondi(-lj / 2, -hj / 2, lj / 2, hj / 2, 26); g.fill();
    g.shadowColor = 'transparent';
    g.save(); rectArrondi(-lj / 2, -hj / 2, lj / 2, hj / 2, 26); g.clip(); g.drawImage(im, -lj / 2, -hj / 2, lj, hj); g.restore();
    g.lineWidth = 3; g.strokeStyle = 'rgba(242, 239, 250, 0.2)'; rectArrondi(-lj / 2 + 1.5, -hj / 2 + 1.5, lj / 2 - 1.5, hj / 2 - 1.5, 26); g.stroke();
    g.restore();
  });
  if (k === 24) RAPPORT.textes.push({ id: `${p.n}-mot`, plan: p.n, type: 'fin', texte: 'Free Micro Games (mot-symbole du site)', style: 'logo', taille: Math.round(mh), boite: { x0: L / 2 - ml / 2, y0: 668, x1: L / 2 + ml / 2, y1: Math.round(668 + mh) }, contraste: Number(contraste(luminance(...rvb(C.craie)), luminance(...rvb(C.nuit))).toFixed(1)), fond: 'ciel', images: p.fin - p.debut, tourne: false });
}

/** Adresse du site en petit, en haut de la zone sûre, pendant tout le montage. */
function filigrane(i) {
  const f = M.filigrane;
  if (!f || i < f.de || i >= f.a) return;
  const st = G.styles.filigrane, a = borne((i - f.de + 1) / 8) * 0.92;
  g.save();
  g.font = fonte(st, st.taille); g.textBaseline = 'middle';
  const lt = g.measureText(f.texte).width, le = 62, he = le * (LOGO.embleme.height / LOGO.embleme.width), total = le + 14 + lt, x = (L - total) / 2, y = Z.haut + 34;
  g.globalAlpha = a;
  // Petite plaque sombre : l'adresse reste lisible même par-dessus l'interface claire d'un jeu.
  g.fillStyle = 'rgba(16, 13, 40, 0.78)'; rectArrondi(x - 22, y - 34, x + total + 24, y + 34, 34); g.fill();
  g.drawImage(LOGO.embleme, x, y - he / 2, le, he);
  g.fillStyle = couleur(st.couleur); g.fillText(f.texte, x + le + 14, y + 2);
  g.restore();
  if (i === f.de + 10) RAPPORT.textes.push({ id: 'filigrane', plan: -1, type: 'filigrane', texte: f.texte, style: 'filigrane', taille: st.taille, boite: { x0: Math.round(x - 22), y0: Math.round(y - 34), x1: Math.round(x + total + 24), y1: Math.round(y + 34) }, contraste: Number(contraste(luminance(...rvb(couleur(st.couleur))), luminance(70, 66, 100)).toFixed(1)), fond: 'pilule', images: f.a - f.de, tourne: false });
}

async function dessinerPlan(p, k, i) {
  if (p.type === 'jeu') await planJeu(p, k, i);
  else if (p.type === 'mur') await planMur(p, k, i);
  else if (p.type === 'attente') planAttente(p, k, i);
  else if (p.type === 'fin') planFin(p, k, i);
  else ciel(i, { voile: p.voile || 0 });
  for (const tx of p.textes || []) dessinerTexte(tx, k, p);
  if (p.type === 'jeu' && !p.sansFiligrane) filigrane(i);
}

/** Dessine l'image n° i de la vidéo. */
async function dessiner(i) {
  const n = M.plans.findIndex((p) => i >= p.debut && i < p.fin), p = M.plans[n], k = i - p.debut, avant = M.plans[n - 1];
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  if (p.entree === 'glisse' && avant && k < 8) {
    // Le plan suivant pousse le précédent vers le haut.
    const u = entreeSortie((k + 1) / 9);
    g.save(); g.translate(0, -H * u); await dessinerPlan(avant, avant.fin - avant.debut - 1, avant.fin - 1); g.restore();
    g.save(); g.translate(0, H * (1 - u)); await dessinerPlan(p, k, i); g.restore();
  } else await dessinerPlan(p, k, i);
  for (const tx of M.textes || []) dessinerTexte(tx, i, MONTAGE);
  // Éclair lilas sur une coupe : le changement de plan se sent, même sans le son.
  if (n > 0 && p.entree !== 'glisse' && p.entree !== 'fondu' && k < 5) { g.fillStyle = rgba(C.lavande, 0.5 * (1 - k / 5) ** 2); g.fillRect(0, 0, L, H); }
  if (p.entree === 'fondu' && avant && k < 8) { g.fillStyle = rgba(C.nuit_profonde, 0.9 * (1 - (k + 1) / 9)); g.fillRect(0, 0, L, H); }
}

/** Faux plan qui couvre toute la vidéo : pour les textes posés par-dessus plusieurs plans. */
const MONTAGE = { n: -2, type: 'montage', debut: 0, fin: M.images };

// Jaquettes du mur : chargées une fois pour toutes.
for (const p of M.plans) {
  if (p.type === 'mur') await Promise.all(p.colonnes.flat().map((u) => image(u, true)));
  if (p.type === 'fin' && p.jaquettes) p.dessins = await Promise.all(p.jaquettes.map((u) => image(u, true)));
}

/** Rend les images [de, a[ et les envoie une à une au script (qui les passe à ffmpeg). */
window.rendre = async (de, a) => {
  for (let i = de; i < a; i++) {
    await dessiner(i);
    const r = await fetch(`/trame?i=${i}`, { method: 'POST', body: g.getImageData(0, 0, L, H).data });
    if (!r.ok) throw new Error(`image ${i} refusée (${r.status})`);
  }
  return RAPPORT;
};
/** Une seule image, en JPEG (planches de contrôle). */
window.apercu = async (i) => { await dessiner(i); return toile.toDataURL('image/jpeg', 0.9); };
window.pret = true;
