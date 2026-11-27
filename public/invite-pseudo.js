// ==========================================================================
// Free Micro Games — invitation à choisir un pseudo (accueil)
// (docs/cadrage-fidelisation.md, section 14.14 ; choix du propriétaire du
// 26 novembre 2026 : « planche C », accueil seulement, retour 3 jours après la croix)
//
// Un joueur qui n'a pas choisi de pseudo reste « Joueur <nombre> » partout
// (classement, amis, parties en ligne), et beaucoup ne savent pas que la
// pastille du haut (avatar et niveau) ouvre un menu.
// - Bannière fine en haut de l'accueil (#invite-pseudo, gabarits/accueil.html) :
//   son avatar, « Choisis ton pseudo », bouton « Choisir », croix.
// - « Choisir » ouvre la fenêtre (#invite-pseudo-fenetre) : saisie du pseudo
//   (mêmes règles et messages que la page du profil ; le serveur décide), puis
//   « Tout est dans ton avatar » : démonstration animée en CSS (un doigt touche
//   la pastille, le menu s'ouvre) et trois raccourcis (avatar, badges, classement).
// - Pseudo accepté : « Bienvenue, … ! », la fenêtre et la bannière se ferment,
//   puis le vrai menu de la pastille s'ouvre une fois (ouvrirMenu, profil-pastille.js).
// Quand : profil sans pseudo, venu INVITE_PSEUDO_JOURS jours différents (pas
// forcément de suite, jours de l'appareil). Les jours sont comptés sur toutes
// les pages (compterJour, appelé par la pastille) ; pour les joueurs venus avant
// cette bannière, on prend aussi leur record de jours de suite et les jours où
// ils ont commencé ou joué en dernier un jeu (état du profil).
// Croix : cachée INVITE_PSEUDO_RAPPEL_JOURS jours, puis elle revient, tant que
// le pseudo est « Joueur <nombre> » (aussi s'il y revient : retour au pseudo de
// départ, pseudo signalé). Jamais obligatoire, jamais ailleurs que sur l'accueil
// (ni dans le lanceur, ni pendant une partie). Un seul encart à la fois : elle
// passe avant « Installer l'appli » (installer.js attend la visite suivante).
// Stockage refusé : jamais montrée (la croix ne pourrait pas être retenue).
// Mémoire sur l'appareil (stockage technique, politique de cookies) :
// fmg-invite-pseudo = { jours, dernier: 'AAAA-MM-JJ', masqueeJusqua: ms, montree: bool }
// (montree : la bannière était là, sa place est gardée à la visite suivante par
// le script de tête de l'accueil, classe avec-invite-pseudo).
// ==========================================================================

import * as R from './profil-reglages.js';
import { etat, surChangement, jourLocal, nomAffiche, changerPseudo } from './profil.js';
import { peindreAvatar } from './avatars.js';
import { t, langue } from './profil-textes.js';
import { urlProfil, urlClassement } from './chemins.js';

const CLE = 'fmg-invite-pseudo';
const JOUR_MS = 86400000;
const DUREE_BIENVENUE = 1800;   // ms : « Bienvenue, … ! » reste affiché, puis le menu s'ouvre

// --- Mémoire ------------------------------------------------------------------------

function lire() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) || 'null');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

function ecrire(changements) {
  try { localStorage.setItem(CLE, JSON.stringify({ ...lire(), ...changements })); } catch { /* stockage refusé */ }
}

/** Visite du jour (toutes les pages, appelé par la pastille) : un jour compté une seule fois. */
export function compterJour() {
  const v = lire();
  const jour = jourLocal();
  if (v.dernier === jour) return;
  ecrire({ jours: (Number(v.jours) || 0) + 1, dernier: jour });
}

// Le stockage marche-t-il ? (compterJour a écrit le jour au chargement de la page.)
const stockageOk = () => !!lire().dernier;

/** Jours de visite connus : compte de l'appareil, record de jours de suite, jours des jeux joués. */
export function joursDeVisite(e) {
  const jours = new Set();
  for (const j of e?.jeux || []) {
    for (const ms of [j.premiere, j.derniere]) if (Number.isFinite(ms) && ms > 0) jours.add(jourLocal(new Date(ms)));
  }
  return Math.max(Number(lire().jours) || 0, Number(e?.serieRecord) || 0, jours.size);
}

/** La bannière peut-elle être montrée maintenant ? */
export function invitePermise(e = etat()) {
  if (!e || e.pseudo || !stockageOk()) return false;
  if (lire().masqueeJusqua > Date.now()) return false;
  return joursDeVisite(e) >= R.INVITE_PSEUDO_JOURS;
}

// --- Bannière et fenêtre ------------------------------------------------------------------

const racine = document.documentElement;
let banniere = null;
let fenetre = null;
let ouvrirMenuPastille = null;
let enCours = false;          // pseudo en cours d'envoi, ou « Bienvenue » affiché
const $ = (selecteur) => fenetre.querySelector(selecteur);

// Avatar, nom actuel, numéro du niveau, adresses des raccourcis.
function peindre() {
  const e = etat();
  if (!e) return;
  const moi = { avatar: e.avatar, cadre: e.cadre || 'aucun', niveau: e.niveau };
  peindreAvatar(banniere.querySelector('.invite-avatar'), moi);
  for (const s of ['.invite-tete-avatar', '.invite-demo-avatar', '.invite-reussi-avatar', '.invite-raccourci-avatar']) peindreAvatar($(s), moi);
  $('.invite-demo-niveau').textContent = String(e.niveau);
  $('.invite-actuel').textContent = t('invitePseudo.actuel', { nom: nomAffiche(e, t) });
  const lang = langue();
  const profil = urlProfil(lang);
  $('[data-invite-lien="avatar"]').href = `${profil}#bloc-apparence`;
  $('[data-invite-lien="badges"]').href = `${profil}#bloc-badges`;
  $('[data-invite-lien="classement"]').href = urlClassement(lang);
}

function montrer() {
  peindre();
  if (!banniere.hidden) return;
  banniere.hidden = false;
  racine.classList.remove('avec-invite-pseudo'); // place gardée : la vraie bannière la prend
  ecrire({ montree: true });
  // « Installer l'appli » laisse la place (installer.js).
  document.dispatchEvent(new CustomEvent('fmg-invite-pseudo'));
}

function cacher() {
  banniere.hidden = true;
  racine.classList.remove('avec-invite-pseudo');
  if (lire().montree) ecrire({ montree: false });
}

function decider() {
  if (enCours) return;
  if (invitePermise()) montrer();
  else cacher();
}

function ouvrirFenetre() {
  peindre();
  $('.invite-form').hidden = false;
  $('.invite-reussi').hidden = true;
  $('.invite-message').textContent = '';
  const champ = $('#invite-pseudo-champ');
  champ.value = '';
  if (typeof fenetre.showModal === 'function') {
    if (!fenetre.open) fenetre.showModal();
  } else {
    fenetre.setAttribute('open', ''); // très vieux navigateur : fenêtre simple
  }
  // Ordinateur : curseur dans le champ. Téléphone : la fenêtre d'abord, le
  // clavier en cacherait la moitié (il s'ouvre quand on touche le champ).
  if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) champ.focus();
}

function fermerFenetre() {
  if (typeof fenetre.close === 'function') { if (fenetre.open) fenetre.close(); }
  else fenetre.removeAttribute('open');
}

// Texte d'un refus du serveur (raisons de controlerPseudo, functions/_profil.js).
function texteRefus(r) {
  const variables = { min: R.PSEUDO_MIN, max: R.PSEUDO_MAX };
  if (r.erreur === 'hors') return t('profil.horsLigne');
  const cle = `profil.pseudo.erreur.${r.raison}`;
  const texte = t(cle, variables);
  return texte === cle ? t('profil.pseudo.erreur.serveur') : texte;
}

async function valider(ev) {
  ev.preventDefault();
  if (enCours) return;
  const champ = $('#invite-pseudo-champ');
  const message = $('.invite-message');
  const bouton = $('.invite-form [type="submit"]');
  const valeur = champ.value.trim().replace(/\s+/g, ' ');
  const n = [...valeur].length;
  if (n < R.PSEUDO_MIN || n > R.PSEUDO_MAX) {
    message.textContent = t('profil.pseudo.erreur.longueur', { min: R.PSEUDO_MIN, max: R.PSEUDO_MAX });
    champ.focus();
    return;
  }
  enCours = true;
  bouton.disabled = true;
  message.textContent = t('profil.envoi');
  const r = await changerPseudo(valeur);
  bouton.disabled = false;
  if (!r.ok) {
    enCours = false;
    message.textContent = texteRefus(r);
    champ.focus();
    return;
  }
  // Accepté : « Bienvenue, … ! », puis tout se ferme et le vrai menu s'ouvre.
  $('.invite-actuel').textContent = '';
  $('.invite-reussi-texte').textContent = t('invitePseudo.bienvenue', { pseudo: etat()?.pseudo || valeur });
  $('.invite-form').hidden = true;
  $('.invite-reussi').hidden = false;
  setTimeout(() => {
    fermerFenetre();
    enCours = false;
    cacher();
    if (ouvrirMenuPastille) ouvrirMenuPastille();
  }, DUREE_BIENVENUE);
}

function brancher() {
  banniere.addEventListener('click', (e) => {
    const b = e.target.closest('[data-invite]');
    if (!b) return;
    if (b.dataset.invite === 'choisir') ouvrirFenetre();
    else if (b.dataset.invite === 'masquer') {
      ecrire({ masqueeJusqua: Date.now() + R.INVITE_PSEUDO_RAPPEL_JOURS * JOUR_MS });
      cacher();
    }
  });
  fenetre.addEventListener('click', (e) => {
    if (e.target.closest('[data-invite="fermer"]')) { fermerFenetre(); return; }
    // Clic sur le fond (en dehors de la boîte) : on ferme, sauf pendant l'envoi.
    if (e.target === fenetre && !enCours) {
      const r = fenetre.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fermerFenetre();
    }
  });
  $('.invite-form').addEventListener('submit', valider);
  const champ = $('#invite-pseudo-champ');
  champ.maxLength = R.PSEUDO_MAX;
  champ.minLength = R.PSEUDO_MIN;
}

/**
 * Accueil seulement (appelé par profil-pastille.js quand #invite-pseudo est dans
 * la page). ouvrirMenu : ouvre le menu de la pastille (après un pseudo accepté).
 */
export function demarrer({ ouvrirMenu } = {}) {
  banniere = document.getElementById('invite-pseudo');
  fenetre = document.getElementById('invite-pseudo-fenetre');
  if (!banniere || !fenetre) return;
  ouvrirMenuPastille = ouvrirMenu || null;
  brancher();
  decider();                       // copie du profil gardée sur l'appareil : tout de suite
  surChangement(() => decider());  // puis après chaque réponse du serveur (pseudo choisi ailleurs…)
}
