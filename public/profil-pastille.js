// ==========================================================================
// Free Micro Games — pastille du profil joueur (toutes les pages du site)
//
// Petite pastille dans le coin haut de l'écran (en-tête des pages, barre du
// lanceur) : avatar et niveau du joueur. Un toucher ouvre un petit menu à trois
// entrées : « Mon profil », « Classement » et « Amis » (docs/cadrage-fidelisation.md,
// sections 2 et 8 ; docs/consigne-amis.md, section 2). Un point doré sur la
// pastille signale une demande d'ami en attente ; une annonce le dit aussi,
// une fois, quand une nouvelle demande arrive.
// Sur les pages du site (pas le lanceur, qui le fait lui-même), elle annonce la
// présence « en ligne » aux amis (amis.js : seulement avec au moins un ami,
// page visible).
// Elle crée aussi le profil dès la première visite, envoie ce qui attend
// (profil.js), affiche les gains (niveau, badges, jeu terminé), le message de
// bienvenue au retour d'un jour à l'autre (accueil) et le check vert des jeux
// terminés sur les vignettes de la page.
// Chargée par toutes les pages générées (scripts/pages-seo.mjs) et par le lanceur.
// ==========================================================================

import {
  etat, rafraichir, surChangement, marquerTermines, nomAffiche, pictoAvatar, derniereVisite, noterVisite,
} from './profil.js';
import { chargerTextes, t, langue, surChangementLangue } from './profil-textes.js';
import { urlProfil, urlClassement, urlAmis, urlJeu } from './chemins.js';
import { annoncer as annoncerPresence } from './amis.js';

const DUREE_TOAST = 4500;
let bouton = null;
let menu = null;

function creerPastille() {
  const lanceur = document.querySelector('.barre-jeu');
  const entete = document.querySelector('.entete-haut');
  const boite = document.createElement('div');
  boite.className = 'pastille-profil';
  boite.innerHTML = `
    <button type="button" class="pastille-bouton" aria-haspopup="true" aria-expanded="false">
      <span class="pastille-avatar" aria-hidden="true"></span><span class="pastille-niveau" aria-hidden="true"></span>
      <span class="pastille-demande" aria-hidden="true" hidden></span>
    </button>
    <div class="pastille-menu" role="menu" hidden>
      <a role="menuitem" class="pastille-lien" data-lien="profil"></a>
      <a role="menuitem" class="pastille-lien" data-lien="classement"></a>
      <a role="menuitem" class="pastille-lien" data-lien="amis"></a>
    </div>`;
  if (lanceur) {
    boite.classList.add('dans-lanceur');
    lanceur.insertBefore(boite, document.getElementById('plein-ecran') || null);
  } else if (entete) {
    entete.insertBefore(boite, entete.querySelector('.entete-langue, .langues') || null);
  } else {
    boite.classList.add('flottante');
    document.body.append(boite);
  }
  bouton = boite.querySelector('.pastille-bouton');
  menu = boite.querySelector('.pastille-menu');
  const fermer = () => { menu.hidden = true; bouton.setAttribute('aria-expanded', 'false'); };
  bouton.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    bouton.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) menu.querySelector('a')?.focus();
  });
  document.addEventListener('click', (e) => { if (!boite.contains(e.target)) fermer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { fermer(); bouton.focus(); } });
}

function afficher() {
  if (!bouton) return;
  const e = etat();
  const lang = langue();
  const avatar = bouton.querySelector('.pastille-avatar');
  avatar.textContent = pictoAvatar(e?.avatar);
  avatar.dataset.cadre = e?.cadre || 'aucun';
  bouton.querySelector('.pastille-niveau').textContent = e ? String(e.niveau) : '·';
  // Demandes d'ami en attente : point doré sur la pastille, nombre dans le menu.
  const demandes = e?.amis?.recues || 0;
  bouton.querySelector('.pastille-demande').hidden = !demandes;
  const aria = e ? t('profil.pastilleAria', { nom: nomAffiche(e, t), n: e.niveau }) : t('profil.pastille');
  bouton.setAttribute('aria-label', demandes ? `${aria} · ${t('amis.pastilleDemandes', { n: demandes })}` : aria);
  bouton.title = bouton.getAttribute('aria-label');
  const [profil, classement, amis] = menu.querySelectorAll('a');
  profil.href = urlProfil(lang);
  profil.textContent = t('profil.monProfil');
  classement.href = urlClassement(lang);
  classement.textContent = t('classement.titre');
  amis.href = urlAmis(lang);
  amis.textContent = demandes ? t('amis.menuDemandes', { n: demandes }) : t('amis.menu');
  amis.classList.toggle('avec-demande', !!demandes);
  marquerTermines(document, t('profil.termine'));
  signalerDemandes(demandes);
}

// Annonce d'une nouvelle demande d'ami : une fois par hausse du nombre (pas à chaque page).
const CLE_DEMANDES = 'fmg-amis-vues';
function signalerDemandes(n) {
  let vues = 0;
  try { vues = Number(localStorage.getItem(CLE_DEMANDES)) || 0; } catch { /* stockage refusé */ }
  if (n > vues && !document.body.classList.contains('page-amis')) toast(t('amis.toast.demandes', { n }));
  if (n !== vues) { try { localStorage.setItem(CLE_DEMANDES, String(n)); } catch { /* tant pis */ } }
}

// --- Annonces (niveau, badges, jeu terminé) ----------------------------------------

let zoneToasts = null;
function toast(texte) {
  if (!zoneToasts) {
    zoneToasts = document.createElement('div');
    zoneToasts.className = 'profil-toasts';
    zoneToasts.setAttribute('role', 'status');
    zoneToasts.setAttribute('aria-live', 'polite');
    document.body.append(zoneToasts);
  }
  const p = document.createElement('p');
  p.className = 'profil-toast';
  p.textContent = texte;
  zoneToasts.append(p);
  setTimeout(() => p.classList.add('part'), DUREE_TOAST);
  setTimeout(() => p.remove(), DUREE_TOAST + 600);
}

function annoncer(gains) {
  if (!gains) return;
  for (const f of gains.termines || []) {
    if (f.statut === 'ok') toast(t('profil.toast.termine', { xp: f.xp }));
    else if (f.statut === 'deja' && f.xp > 0) toast(t('profil.toast.etoiles', { xp: f.xp }));
  }
  if (gains.niveau > gains.niveauAvant) toast(t('profil.toast.niveau', { n: gains.niveau }));
  for (const b of gains.badges || []) toast(t('profil.toast.badge', { badge: t(`badge.${b}`) }));
  if (gains.bienvenue) bienvenue(gains.bienvenue);
}

// --- Bienvenue au retour (accueil) -----------------------------------------------------

async function bienvenue({ serie, bonus }) {
  const accueil = document.getElementById('vitrine');
  if (!accueil) {
    if (bonus) toast(t('profil.toast.serie', { n: serie, xp: bonus }));
    return;
  }
  const precedente = derniereVisite();
  noterVisite(new Date().toISOString().slice(0, 10));
  let nouveaux = [];
  if (precedente) {
    try {
      const catalogue = await (await fetch('/catalog.json')).json();
      nouveaux = (catalogue.games || []).filter((j) => j.added > precedente && !String(j.ages || '').startsWith('13'))
        .sort((a, b) => (a.added < b.added ? 1 : -1));
    } catch { /* hors connexion : sans la liste */ }
  }
  const carte = document.createElement('section');
  carte.className = 'bienvenue';
  carte.setAttribute('aria-label', t('profil.bienvenue.titre'));
  const lang = langue();
  const titre = (j) => j.i18n?.[lang]?.title || j.title;
  carte.innerHTML = `
    <button type="button" class="bienvenue-fermer" aria-label="${t('profil.fermer')}">✕</button>
    <h2></h2>
    <p class="bienvenue-serie"></p>
    <p class="bienvenue-nouveaux" hidden></p>
    <ul class="bienvenue-jeux"></ul>`;
  carte.querySelector('h2').textContent = t('profil.bienvenue.titre');
  carte.querySelector('.bienvenue-serie').textContent = serie >= 2
    ? t('profil.bienvenue.serie', { n: serie, xp: bonus })
    : t('profil.bienvenue.nouvelleSerie');
  if (nouveaux.length) {
    const texte = carte.querySelector('.bienvenue-nouveaux');
    texte.hidden = false;
    texte.textContent = t('profil.bienvenue.nouveaux', { n: nouveaux.length });
    const liste = carte.querySelector('.bienvenue-jeux');
    for (const j of nouveaux.slice(0, 6)) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = urlJeu(j.id, lang);
      a.innerHTML = `<img src="/${j.cover}" alt="" width="600" height="800" loading="lazy" decoding="async"><span></span>`;
      a.querySelector('span').textContent = titre(j);
      li.append(a);
      liste.append(li);
    }
  }
  carte.querySelector('.bienvenue-fermer').addEventListener('click', () => carte.remove());
  accueil.parentNode.insertBefore(carte, accueil);
}

// --- Démarrage ----------------------------------------------------------------------------

async function demarrer() {
  await chargerTextes();
  creerPastille();
  afficher();
  surChangement((e, gains) => { afficher(); annoncer(gains); });
  surChangementLangue(afficher);
  // Le catalogue de l'accueil se remplit après : check vert sur les nouvelles cartes.
  let prevu = false;
  new MutationObserver(() => {
    if (prevu) return;
    prevu = true;
    requestAnimationFrame(() => { prevu = false; marquerTermines(document, t('profil.termine')); });
  }).observe(document.body, { childList: true, subtree: true });
  if (!derniereVisite()) noterVisite(new Date().toISOString().slice(0, 10));
  await rafraichir();
  // Présence « en ligne » pour les amis (le lanceur annonce lui-même « en jeu »).
  if (!document.querySelector('.barre-jeu')) annoncerPresence({ etat: 'site' });
}

demarrer();
