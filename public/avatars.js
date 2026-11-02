// ==========================================================================
// Free Micro Games — avatars dessinés, auras des rangs et cadres
// (design « Planètes douces », docs/cadrage-fidelisation.md, section 14)
//
// peindreAvatar(element, { avatar, cadre, niveau, aura, anime }) remplit un
// élément (pastille, carte du profil, ligne du classement ou des amis,
// boutons de choix) avec trois couches :
//   1. l'aura du rang (seulement si aura : true, page de profil) : lueur,
//      lunes en orbite, anneau de planète… de plus en plus riche avec le rang ;
//   2. le dessin de l'avatar (public/avatars-dessins.js), découpé en disque,
//      sur le même fond pour tous : une petite planète lilas éclairée en haut
//      à gauche (choix du propriétaire, novembre 2026 ; le fond sombre propre
//      à chaque dessin est remplacé à l'affichage) ;
//   3. le cadre (anneau et sa petite lune), par-dessus.
// Couches 1 et 3 : SVG débordant de l'élément (170 % et 132 % de sa taille),
// placés par public/style.css (bloc « Avatars »). Les mouvements (orbites,
// scintillement) ne jouent que sur un élément « anime », jamais si l'appareil
// demande moins de mouvement. Tout le dessin est écrit ici : aucune donnée
// venant du serveur n'entre dans le SVG (seulement des identifiants connus).
// Rangs, avatars et cadres débloqués : public/profil-reglages.js.
// ==========================================================================

import * as R from './profil-reglages.js';
import { DESSINS } from './avatars-dessins.js';

// Dégradés et étincelle communs, posés une fois dans la page.
const DEFS = `<defs>
<radialGradient id="fmg-g-lilas"><stop offset="55%" stop-color="#c4b5fd" stop-opacity=".55"/><stop offset="100%" stop-color="#c4b5fd" stop-opacity="0"/></radialGradient>
<radialGradient id="fmg-g-or"><stop offset="55%" stop-color="#ffd88a" stop-opacity=".6"/><stop offset="100%" stop-color="#ffd88a" stop-opacity="0"/></radialGradient>
<radialGradient id="fmg-g-cosmos"><stop offset="50%" stop-color="#ff9ad5" stop-opacity=".55"/><stop offset="75%" stop-color="#a78bfa" stop-opacity=".35"/><stop offset="100%" stop-color="#7fe3f5" stop-opacity="0"/></radialGradient>
<linearGradient id="fmg-l-braise" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset=".5" stop-color="#ff8a3d"/><stop offset="1" stop-color="#e8434f"/></linearGradient>
<linearGradient id="fmg-l-plasma" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fe3f5"/><stop offset=".5" stop-color="#c4b5fd"/><stop offset="1" stop-color="#ff8fd8"/></linearGradient>
<linearGradient id="fmg-l-nebuleuse" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#6d7cff"/><stop offset=".5" stop-color="#c084fc"/><stop offset="1" stop-color="#ff9ad5"/></linearGradient>
<linearGradient id="fmg-l-nova" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6dc"/><stop offset=".5" stop-color="#ffd88a"/><stop offset="1" stop-color="#ffb347"/></linearGradient>
<linearGradient id="fmg-l-cosmique" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7fe3f5"/><stop offset=".35" stop-color="#c4b5fd"/><stop offset=".7" stop-color="#ff9ad5"/><stop offset="1" stop-color="#ffd88a"/></linearGradient>
<radialGradient id="fmg-planete" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#b3a6f5"/><stop offset=".55" stop-color="#7d6fd0"/><stop offset="1" stop-color="#5546a8"/></radialGradient>
<symbol id="fmg-eclat" viewBox="-10 -10 20 20"><path d="M0 -10 Q1.2 -1.2 10 0 Q1.2 1.2 0 10 Q-1.2 1.2 -10 0 Q-1.2 -1.2 0 -10 Z"/></symbol>
</defs>`;

const eclat = (x, y, taille, couleur, classe = '') => `<use href="#fmg-eclat" x="${x}" y="${y}" width="${taille}" height="${taille}" fill="${couleur}"${classe ? ` class="${classe}"` : ''}/>`;

// Huit étincelles sur un cercle de rayon r (centre 50, 50), couleurs en boucle.
function couronneEclats(r, taille, couleurs) {
  let s = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x = Math.round((50 + r * Math.cos(a) - taille / 2) * 10) / 10;
    const y = Math.round((50 + r * Math.sin(a) - taille / 2) * 10) / 10;
    s += eclat(x, y, taille, couleurs[i % couleurs.length]);
  }
  return s;
}

// --- Auras des rangs (viewBox -35 -35 170 170 ; l'avatar occupe 0..100) ------------

const AURAS = {
  apprenti: '',
  explorateur: '<circle cx="50" cy="50" r="76" fill="url(#fmg-g-lilas)" opacity=".7"/>',
  aventurier: `<circle cx="50" cy="50" r="78" fill="url(#fmg-g-lilas)"/>
<circle cx="50" cy="50" r="66" fill="none" stroke="#c4b5fd" stroke-opacity=".35" stroke-width="1.2"/>
<g class="av-tourne"><circle cx="50" cy="50" r="70.5" fill="none"/><circle cx="116" cy="50" r="4.5" fill="#c4b5fd"/></g>`,
  heros: `<circle cx="50" cy="50" r="80" fill="url(#fmg-g-or)" class="av-pulse"/>
<circle cx="50" cy="50" r="66" fill="none" stroke="#ffd88a" stroke-opacity=".4" stroke-width="1.2"/>
<g class="av-tourne av-vite"><circle cx="50" cy="50" r="71" fill="none"/><circle cx="-16" cy="50" r="5" fill="#ffd88a"/></g>`,
  champion: `<circle cx="50" cy="50" r="80" fill="url(#fmg-g-lilas)"/>
<circle cx="50" cy="50" r="62" fill="none" stroke="#c4b5fd" stroke-opacity=".35" stroke-width="1.2"/>
<circle cx="50" cy="50" r="76" fill="none" stroke="#ffd88a" stroke-opacity=".3" stroke-width="1.2"/>
<g class="av-tourne av-vite"><circle cx="50" cy="50" r="66" fill="none"/><circle cx="112" cy="50" r="4" fill="#c4b5fd"/></g>
<g class="av-tourne av-lent av-inverse"><circle cx="50" cy="50" r="80" fill="none"/><circle cx="50" cy="126" r="4" fill="#ffd88a"/></g>
${eclat(-26, 0, 12, '#fff', 'av-scint')}${eclat(108, -24, 12, '#ffd88a', 'av-scint av-d1')}${eclat(114, 92, 10, '#fff', 'av-scint av-d2')}${eclat(-22, 96, 10, '#ffd88a', 'av-scint av-d3')}`,
  legende: `<circle cx="50" cy="50" r="84" fill="url(#fmg-g-or)" class="av-pulse"/>
<ellipse cx="50" cy="50" rx="90" ry="22" fill="none" stroke="#ffd88a" stroke-opacity=".35" stroke-width="1.5" transform="rotate(-16 50 50)"/>
<ellipse cx="50" cy="50" rx="80" ry="19" fill="none" stroke="#ffd88a" stroke-width="3.5" transform="rotate(-16 50 50)"/>
${eclat(-24, -14, 14, '#fff', 'av-scint')}${eclat(110, -20, 12, '#ffd88a', 'av-scint av-d2')}${eclat(104, 106, 12, '#fff', 'av-scint av-d1')}`,
  titan: `<circle cx="50" cy="50" r="84" fill="url(#fmg-g-cosmos)"/>
<g class="av-tourne av-lent"><circle cx="50" cy="50" r="70" fill="none" stroke="#c4b5fd" stroke-width="3.2" stroke-dasharray="0.1 7" stroke-linecap="round"/></g>
<g class="av-tourne av-lent av-inverse"><circle cx="50" cy="50" r="80" fill="none" stroke="#ffd88a" stroke-width="2.4" stroke-dasharray="0.1 11" stroke-linecap="round"/></g>
<g class="av-tourne"><circle cx="50" cy="50" r="64.5" fill="none"/><circle cx="111" cy="50" r="3.5" fill="#ffd88a"/><circle cx="19.5" cy="102.8" r="3.5" fill="#7fe3f5"/><circle cx="19.5" cy="-2.8" r="3.5" fill="#ff9ad5"/></g>
<circle cx="50" cy="50" r="56" fill="none" stroke="#7fe3f5" stroke-opacity=".25" stroke-width="3"/>`,
  cosmique: `<circle cx="50" cy="50" r="86" fill="url(#fmg-g-cosmos)" class="av-pulse"/>
<circle cx="50" cy="50" r="62" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>
<g class="av-tourne av-lent"><circle cx="50" cy="50" r="79" fill="none"/>${couronneEclats(72, 12, ['#ffd88a', '#fff', '#ff9ad5', '#fff'])}</g>`,
};

// --- Cadres (viewBox -16 -16 132 132) ------------------------------------------------
// av-trait : épaisseur de l'anneau, réglée par la taille de l'avatar (--trait-cadre).

const anneau = (couleur, classe = 'av-trait') => `<circle cx="50" cy="50" r="51" fill="none" stroke="${couleur}" class="${classe}"/>`;
const lune = (couleur) => `<circle cx="86" cy="14" r="5" fill="${couleur}" class="av-lune"/>`;
const ARC_EN_CIEL = ['#ff9a9a', '#ffd88a', '#8fe3b0', '#8fd3f5', '#c4b5fd', '#ff9ad5'];

const CADRES = {
  aucun: anneau('#5a6688', 'av-trait av-fin'),
  bronze: anneau('#d39a66') + lune('#d39a66'),
  argent: anneau('#d7deea') + lune('#d7deea'),
  or: '<circle cx="50" cy="50" r="55" fill="none" stroke="#ffd88a" stroke-opacity=".3" stroke-width="5"/>' + anneau('#ffd88a') + lune('#ffd88a'),
  braise: anneau('url(#fmg-l-braise)')
    + '<circle cx="50" cy="-4" r="2.2" fill="#ffd23f" class="av-scint"/><circle cx="34" cy="-1" r="1.6" fill="#ff8a3d" class="av-scint av-d1"/><circle cx="66" cy="-1" r="1.8" fill="#ff8a3d" class="av-scint av-d2"/>'
    + lune('#ff8a3d'),
  eclair: anneau('#ffe066') + '<path d="M89 1 L79 16 L85.5 16 L80.5 29 L93 12 L86.5 12 L91 1 Z" fill="#ffe066" class="av-lune av-scint"/>',
  diamant: '<circle cx="50" cy="50" r="54.5" fill="none" stroke="#9fe8f7" stroke-opacity=".35" stroke-width="1.5"/>' + anneau('#9fe8f7')
    + '<path d="M86 5 L94 14 L86 23 L78 14 Z" fill="#9fe8f7" class="av-lune"/><path d="M86 5 L86 23 M78 14 L94 14" stroke="#e6fbff" stroke-width="1"/>',
  plasma: '<circle cx="50" cy="50" r="56" fill="none" stroke="#7fe3f5" stroke-opacity=".25" stroke-width="3"/>'
    + `<g class="av-tourne av-vite">${anneau('url(#fmg-l-plasma)', 'av-trait av-gras')}</g>`,
  nebuleuse: anneau('url(#fmg-l-nebuleuse)', 'av-trait av-epais')
    + eclat(4, 10, 12, '#fff', 'av-scint') + eclat(88, 70, 10, '#ff9ad5', 'av-scint av-d1') + eclat(76, -2, 9, '#fff', 'av-scint av-d2'),
  supernova: '<circle cx="50" cy="50" r="57" fill="none" stroke="#fff4d6" stroke-opacity=".4" stroke-width="2" class="av-pulse"/>'
    + anneau('url(#fmg-l-nova)', 'av-trait av-gras')
    + '<path d="M50 -10 L50 -3 M50 103 L50 110 M-10 50 L-3 50 M103 50 L110 50" stroke="#ffd88a" stroke-width="3" stroke-linecap="round"/>',
  cosmique: anneau('url(#fmg-l-cosmique)', 'av-trait av-gras')
    + `<g class="av-tourne av-lent"><circle cx="50" cy="50" r="63" fill="none"/>${eclat(103, 45, 10, '#ffd88a')}${eclat(74, 95.2, 10, '#fff')}${eclat(16, 95.2, 10, '#ff9ad5')}${eclat(-13, 45, 10, '#7fe3f5')}${eclat(16, -5.2, 10, '#fff')}${eclat(74, -5.2, 10, '#c4b5fd')}</g>`,
  'arc-en-ciel': ARC_EN_CIEL.map((c, i) => `<circle cx="50" cy="50" r="51" fill="none" stroke="${c}" class="av-trait" stroke-dasharray="53.4 266.9" stroke-dashoffset="${(-i * 53.4).toFixed(1)}" transform="rotate(-90 50 50)"/>`).join('')
    + lune('#8fd3f5'),
  etoile: '<circle cx="50" cy="50" r="55" fill="none" stroke="#ffd88a" stroke-opacity=".25" stroke-width="6"/>' + anneau('#fff0c2') + eclat(77, 5, 18, '#ffd88a', 'av-lune'),
};

let defsPoses = false;
function poserDefs() {
  if (defsPoses || !document.body) return;
  defsPoses = true;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'avatar-defs');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = DEFS;
  document.body.prepend(svg);
}

// Fond de chaque dessin (son premier cercle) remplacé par la planète lilas commune.
const FOND = /^<circle cx="50" cy="50" r="50" fill="#[0-9a-f]{3,6}"\/>/i;
const PLANETE = '<circle cx="50" cy="50" r="50" fill="url(#fmg-planete)"/>';
const dessin = (id) => DESSINS[id].replace(FOND, PLANETE);

const svg = (classe, vue, contenu) => `<svg class="${classe}" viewBox="${vue}" aria-hidden="true" focusable="false">${contenu}</svg>`;

/** L'avatar a-t-il un dessin ? (sinon : son emoji, en secours). */
export function aUnDessin(id) {
  return Object.prototype.hasOwnProperty.call(DESSINS, id);
}

/**
 * Remplit « element » avec l'avatar.
 * avatar : identifiant (AVATARS) ; inconnu → le premier.
 * cadre : identifiant (CADRES), ou null pour aucun anneau (choix des avatars).
 * niveau : niveau du joueur (rang, aura et lueur) ; null → pas de lueur.
 * aura : aura complète du rang (page de profil). anime : orbites et scintillements.
 */
export function peindreAvatar(element, { avatar, cadre = 'aucun', niveau = null, aura = false, anime = false } = {}) {
  poserDefs();
  const fiche = R.AVATARS.find((a) => a.id === avatar) || R.AVATARS[0];
  const rang = niveau == null ? null : R.rangPourNiveau(niveau);
  element.classList.add('avatar');
  element.classList.toggle('anime', !!anime);
  element.classList.toggle('avec-aura', !!(aura && rang && AURAS[rang.id]));
  element.dataset.avatar = fiche.id;
  if (rang) element.dataset.rang = rang.id; else delete element.dataset.rang;
  if (cadre) element.dataset.cadre = CADRES[cadre] ? cadre : 'aucun'; else delete element.dataset.cadre;
  const couches = [];
  if (aura && rang && AURAS[rang.id]) couches.push(svg('avatar-aura', '-35 -35 170 170', AURAS[rang.id]));
  couches.push(aUnDessin(fiche.id)
    ? svg('avatar-dessin', '0 0 100 100', dessin(fiche.id))
    : `<span class="avatar-picto">${fiche.picto}</span>`);
  if (cadre) couches.push(svg('avatar-cadre', '-16 -16 132 132', CADRES[cadre] || CADRES.aucun));
  element.innerHTML = couches.join('');
}

/** Cadres dessinés (contrôle : chaque cadre des réglages en a un). */
export const CADRES_DESSINES = Object.keys(CADRES);
/** Rangs ayant une entrée d'aura (contrôle). */
export const RANGS_DESSINES = Object.keys(AURAS);
