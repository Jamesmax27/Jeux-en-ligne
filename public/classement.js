// ==========================================================================
// Free Micro Games — classement des joueurs (/classement/, /en/leaderboard/…)
//
// Deux choix en haut : périmètre (classement général du site, étoiles, ou un
// jeu multijoueur) et période (semaine ou mois, remis à zéro au début de
// chaque période). Top 100 : rang, avatar, pseudo, niveau, points ; or,
// argent et bronze pour les 3 premiers. Un joueur hors du top 100 voit
// d'abord sa propre position ; en la touchant, il ouvre le top 100.
// Chaque pseudo peut être signalé (🚩) : après plusieurs signalements de
// joueurs différents, il redevient « Joueur <nombre> » (functions/api/profil.js).
// Page générée par scripts/pages-seo.mjs (gabarits/classement.html), non indexée.
// ==========================================================================

import * as R from './profil-reglages.js';
import { classement, etat, rafraichir, pictoAvatar, signaler } from './profil.js';
import { chargerTextes, t, langue, date } from './profil-textes.js';

const $ = (id) => document.getElementById(id);
const MEDAILLES = { 1: 'or', 2: 'argent', 3: 'bronze' };

function nom(ligne) {
  return ligne.pseudo || t('profil.pseudoDefaut', { n: ligne.numero });
}

function points(perimetre, n) {
  return t(perimetre === 'etoiles' ? 'classement.pointsEtoiles' : 'classement.pointsXp', { n });
}

function ligneHtml(ligne, perimetre, moiId) {
  const li = document.createElement('li');
  li.className = 'classement-ligne';
  if (MEDAILLES[ligne.rang]) li.classList.add(`medaille-${MEDAILLES[ligne.rang]}`);
  if (ligne.id === moiId) { li.classList.add('moi'); li.id = 'classement-ma-ligne'; }
  li.innerHTML = `<span class="classement-rang"></span><span class="classement-avatar" aria-hidden="true"></span>
    <span class="classement-nom"></span><span class="classement-niveau"></span><span class="classement-points"></span>`;
  li.querySelector('.classement-rang').textContent = t('classement.rang', { n: ligne.rang });
  const avatar = li.querySelector('.classement-avatar');
  avatar.textContent = pictoAvatar(ligne.avatar);
  avatar.dataset.cadre = ligne.cadre;
  li.querySelector('.classement-nom').textContent = nom(ligne) + (ligne.id === moiId ? ` (${t('classement.toi')})` : '');
  li.querySelector('.classement-niveau').textContent = t('classement.niveau', { n: ligne.niveau });
  li.querySelector('.classement-points').textContent = points(perimetre, ligne.points);
  if (ligne.id !== moiId) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'classement-signaler';
    b.textContent = '🚩';
    b.setAttribute('aria-label', t('classement.signalerAria', { nom: nom(ligne) }));
    b.title = t('classement.signaler');
    b.addEventListener('click', async () => {
      if (b.dataset.confirme !== '1') { b.dataset.confirme = '1'; b.textContent = t('classement.signalerConfirmer'); return; }
      b.disabled = true;
      const r = await signaler(ligne.id);
      b.textContent = r.ok ? t('classement.signale') : t(r.erreur === 'niveau' ? 'classement.signalerNiveau' : 'profil.erreur', { n: R.SIGNALER_NIVEAU_MIN });
    });
    li.append(b);
  }
  return li;
}

async function charger() {
  const perimetre = $('classement-perimetre').value;
  const periode = $('classement-periode').value;
  const liste = $('classement-liste');
  const moiBouton = $('classement-moi');
  $('classement-etat').textContent = t('profil.chargement');
  liste.textContent = '';
  moiBouton.hidden = true;
  const r = await classement(perimetre, periode);
  if (r.erreur) { $('classement-etat').textContent = t(r.erreur === 'hors' ? 'profil.horsLigne' : 'profil.erreur'); return; }
  $('classement-aide').textContent = t(periode === 'mois' ? 'classement.depuisMois' : 'classement.depuisSemaine', { date: date(Date.parse(`${r.debut}T00:00:00Z`), { day: 'numeric', month: 'long' }) });
  $('classement-etat').textContent = r.top.length ? '' : t('classement.vide');
  const moiId = r.moi?.id ?? etat()?.id;
  for (const ligne of r.top) liste.append(ligneHtml(ligne, perimetre, moiId));
  const dansTop = r.top.some((l) => l.id === moiId);
  if (r.moi && !dansTop) {
    // Hors du top 100 : sa propre position d'abord ; le top s'ouvre en la touchant.
    moiBouton.hidden = false;
    moiBouton.textContent = r.moi.rang
      ? t('classement.maPosition', { n: r.moi.rang, points: points(perimetre, r.moi.points) })
      : t('classement.pasClasse', { n: R.CLASSEMENT_NIVEAU_MIN });
    if (r.top.length) {
      liste.hidden = true;
      moiBouton.setAttribute('aria-expanded', 'false');
      moiBouton.onclick = () => {
        liste.hidden = !liste.hidden;
        moiBouton.setAttribute('aria-expanded', String(!liste.hidden));
      };
    }
  } else {
    liste.hidden = false;
    moiBouton.onclick = null;
    if (dansTop) $('classement-ma-ligne')?.scrollIntoView({ block: 'nearest' });
  }
}

async function demarrer() {
  await chargerTextes();
  // Un choix par jeu multijoueur du catalogue.
  try {
    const c = await (await fetch('/catalog.json')).json();
    const lang = langue();
    for (const jeu of (c.games || []).filter((j) => j.multijoueur === true)) {
      const option = document.createElement('option');
      option.value = `multi:${jeu.id}`;
      option.textContent = t('classement.jeuMulti', { titre: jeu.i18n?.[lang]?.title || jeu.title });
      $('classement-perimetre').append(option);
    }
  } catch { /* hors connexion */ }
  const demande = new URLSearchParams(location.search).get('jeu');
  if (demande && [...$('classement-perimetre').options].some((o) => o.value === `multi:${demande}`)) $('classement-perimetre').value = `multi:${demande}`;
  $('classement-perimetre').addEventListener('change', charger);
  $('classement-periode').addEventListener('change', charger);
  await rafraichir();
  charger();
}

demarrer();
