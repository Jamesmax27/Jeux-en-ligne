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
// Troisième choix, « Parmi » : tous les joueurs, ou mes amis (docs/consigne-amis.md,
// section 4) : moi et mes amis acceptés, même calcul, avec le statut de chacun
// et le bouton « Rejoindre » ; actualisé toutes les 30 s tant que la page est
// visible, « Actualiser » au plus toutes les 10 s (amis.js). ?portee=amis l'ouvre.
// Classement général : couronne or, argent ou bronze à côté du pseudo des 3
// premiers de la période précédente,
// et sous la liste l'historique des podiums (3 premiers de chaque semaine ou de
// chaque mois terminés, selon la période choisie ; « Voir plus » pour les plus
// anciens). Docs : docs/cadrage-fidelisation.md, section 14.9.
// Page générée par scripts/pages-seo.mjs (gabarits/classement.html), non indexée.
// ==========================================================================

import * as R from './profil-reglages.js';
import { classement, etat, rafraichir, signaler, historiquePodiums } from './profil.js';
import { peindreAvatar, COURONNE_SVG } from './avatars.js';
import { chargerTextes, t, langue, date, titrePeriode } from './profil-textes.js';
import { classementAmis, actualisation, elementsPresence, annoncer } from './amis.js';

let catalogue = new Map();
let suiviAmis = null;     // actualisation du classement entre amis (amis.js)
const titreJeu = (fiche) => (fiche ? fiche.i18n?.[langue()]?.title || fiche.title : '');

const $ = (id) => document.getElementById(id);
const MEDAILLES = { 1: 'or', 2: 'argent', 3: 'bronze' };

function nom(ligne) {
  return ligne.pseudo || t('profil.pseudoDefaut', { n: ligne.numero });
}

function points(perimetre, n) {
  return t(perimetre === 'etoiles' ? 'classement.pointsEtoiles' : 'classement.pointsXp', { n });
}

// Petite couronne (or, argent, bronze : place de la période précédente), avec son texte pour les lecteurs d'écran.
function couronne(periode, rang) {
  const span = document.createElement('span');
  span.className = `classement-couronne couronne-${MEDAILLES[rang]}`;
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${COURONNE_SVG}</svg>`;
  const texte = t(periode === 'mois' ? 'classement.couronne.mois' : 'classement.couronne.semaine', { place: t(`classement.place.${rang}`) });
  span.title = texte;
  const lu = document.createElement('span');
  lu.className = 'sr-only';
  lu.textContent = texte;
  span.append(lu);
  return span;
}

// Podium de la période précédente : Map id → rang (1 à 3), meilleure place si un joueur apparaît deux fois.
function lireCouronnes(liste) {
  const m = new Map();
  for (const x of Array.isArray(liste) ? liste : []) if (MEDAILLES[x.rang] && !(m.get(x.id) <= x.rang)) m.set(x.id, x.rang);
  return m;
}

function ligneHtml(ligne, perimetre, moiId, { sansSignaler = false, couronnes = null, periode = 'semaine' } = {}) {
  const li = document.createElement('li');
  li.className = 'classement-ligne';
  if (MEDAILLES[ligne.rang]) li.classList.add(`medaille-${MEDAILLES[ligne.rang]}`);
  if (ligne.id === moiId) { li.classList.add('moi'); li.id = 'classement-ma-ligne'; }
  li.innerHTML = `<span class="classement-rang"></span><span class="classement-avatar" aria-hidden="true"></span>
    <span class="classement-nom"></span><span class="classement-niveau"></span><span class="classement-points"></span>`;
  li.querySelector('.classement-rang').textContent = t('classement.rang', { n: ligne.rang });
  peindreAvatar(li.querySelector('.classement-avatar'), { avatar: ligne.avatar, cadre: ligne.cadre, niveau: ligne.niveau });
  li.querySelector('.classement-nom').textContent = nom(ligne) + (ligne.id === moiId ? ` (${t('classement.toi')})` : '');
  if (couronnes?.has(ligne.id)) li.querySelector('.classement-nom').prepend(couronne(periode, couronnes.get(ligne.id)));
  li.querySelector('.classement-niveau').textContent = t('classement.niveau', { n: ligne.niveau });
  li.querySelector('.classement-points').textContent = points(perimetre, ligne.points);
  if (ligne.id !== moiId && !sansSignaler) {
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

// Classement entre amis : moi et mes amis, avec leur statut et « Rejoindre ».
async function chargerAmis() {
  const perimetre = $('classement-perimetre').value;
  const periode = $('classement-periode').value;
  const liste = $('classement-liste');
  const r = await classementAmis(perimetre, periode, true);
  if (r.hors) { $('classement-etat').textContent = t('amis.horsLigne'); return {}; }
  if (!r.ok) { $('classement-etat').textContent = t('amis.erreur'); return r.statut >= 500 ? { arreter: true } : {}; }
  const d = r.donnees;
  $('classement-etat').textContent = '';
  $('classement-aide').textContent = t(periode === 'mois' ? 'classement.depuisMois' : 'classement.depuisSemaine', { date: date(Date.parse(`${d.debut}T00:00:00Z`), { day: 'numeric', month: 'long' }) });
  $('classement-amis-vide').hidden = d.lignes.some((l) => l.ami);
  $('classement-presence').hidden = d.presence !== 'indisponible';
  liste.hidden = false;
  liste.textContent = '';
  const couronnes = lireCouronnes(d.couronnes);
  for (const ligne of d.lignes) {
    const li = ligneHtml(ligne, perimetre, d.moi, { sansSignaler: true, couronnes, periode });
    if (ligne.ami) {
      const el = elementsPresence({ ...ligne, nom: nom(ligne) }, { t, lang: langue(), catalogue, titre: titreJeu, presence: d.presence });
      const bloc = document.createElement('span');
      bloc.className = 'classement-presence';
      bloc.append(el.statut);
      if (el.bouton) bloc.append(el.bouton);
      li.classList.add('avec-presence');
      li.append(bloc);
    }
    liste.append(li);
  }
  if (d.presence === 'ok') $('classement-maj').textContent = t('amis.majLe', { heure: date(Date.now(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
  return d.presence === 'trop-tot' ? { attendre: d.attendre } : {};
}

// --- Historique des podiums (classement général) -------------------------------------

let historiqueDemande = 0; // dernier chargement demandé (une réponse plus ancienne est ignorée)

function periodeHtml(periode, p, moiId) {
  const li = document.createElement('li');
  li.className = 'historique-periode';
  const h = document.createElement('h3');
  h.textContent = titrePeriode(periode, p.debut);
  const podium = document.createElement('ol');
  podium.className = 'historique-podium';
  for (const x of p.podium) {
    const place = document.createElement('li');
    place.className = `historique-place medaille-${MEDAILLES[x.rang]}`;
    if (x.id !== null && x.id === moiId) place.classList.add('moi');
    place.innerHTML = `<span class="historique-medaille" aria-hidden="true"></span><span class="sr-only historique-place-texte"></span>
      <span class="classement-avatar" aria-hidden="true"></span><span class="classement-nom"></span><span class="classement-points"></span>`;
    place.querySelector('.historique-medaille').textContent = { 1: '🥇', 2: '🥈', 3: '🥉' }[x.rang];
    place.querySelector('.historique-place-texte').textContent = `${t(`classement.place.${x.rang}`)} : `;
    if (x.id === null) {
      place.classList.add('ancien');
      peindreAvatar(place.querySelector('.classement-avatar'), { avatar: 'chat', cadre: 'aucun' });
      place.querySelector('.classement-nom').textContent = t('classement.historique.ancien');
    } else {
      peindreAvatar(place.querySelector('.classement-avatar'), { avatar: x.avatar, cadre: x.cadre, niveau: x.niveau });
      place.querySelector('.classement-nom').textContent = nom(x) + (x.id === moiId ? ` (${t('classement.toi')})` : '');
    }
    place.querySelector('.classement-points').textContent = points('general', x.points);
    podium.append(place);
  }
  li.append(h, podium);
  return li;
}

async function chargerHistorique({ suite = null } = {}) {
  const bloc = $('classement-historique');
  const general = $('classement-perimetre').value === 'general';
  bloc.hidden = !general;
  if (!general) return;
  const periode = $('classement-periode').value;
  const liste = $('historique-liste');
  const plus = $('historique-plus');
  const demande = ++historiqueDemande;
  $('titre-historique').textContent = t(periode === 'mois' ? 'classement.historique.mois' : 'classement.historique.semaine');
  if (!suite) { liste.textContent = ''; $('historique-etat').textContent = t('profil.chargement'); }
  plus.hidden = true;
  const r = await historiquePodiums(periode, suite);
  if (demande !== historiqueDemande) return; // choix changé entre-temps
  if (r.erreur) { $('historique-etat').textContent = t(r.erreur === 'hors' ? 'profil.horsLigne' : 'profil.erreur'); return; }
  const moiId = etat()?.id ?? null;
  for (const p of r.periodes) liste.append(periodeHtml(periode, p, moiId));
  $('historique-etat').textContent = liste.children.length ? '' : t('classement.historique.vide');
  plus.hidden = !r.suite;
  plus.onclick = () => chargerHistorique({ suite: r.suite });
}

async function charger() {
  chargerHistorique();
  const amis = $('classement-portee').value === 'amis';
  $('classement-amis-barre').hidden = !amis;
  $('classement-moi').hidden = true;
  $('classement-amis-vide').hidden = true;
  $('classement-presence').hidden = true;
  if (amis) {
    $('classement-etat').textContent = t('profil.chargement');
    $('classement-liste').textContent = '';
    if (suiviAmis) suiviAmis.forcer();
    else suiviAmis = actualisation(chargerAmis, { bouton: $('classement-actualiser'), t });
    return;
  }
  suiviAmis?.arreter();
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
  const couronnes = lireCouronnes(r.couronnes);
  for (const ligne of r.top) liste.append(ligneHtml(ligne, perimetre, moiId, { couronnes, periode }));
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
  annoncer({ etat: 'site' });
  try {
    const c = await (await fetch('/catalog.json')).json();
    const lang = langue();
    catalogue = new Map((c.games || []).map((j) => [j.id, j]));
    for (const jeu of (c.games || []).filter((j) => j.multijoueur === true)) {
      const option = document.createElement('option');
      option.value = `multi:${jeu.id}`;
      option.textContent = t('classement.jeuMulti', { titre: jeu.i18n?.[lang]?.title || jeu.title });
      $('classement-perimetre').append(option);
    }
  } catch { /* hors connexion */ }
  const demande = new URLSearchParams(location.search).get('jeu');
  if (demande && [...$('classement-perimetre').options].some((o) => o.value === `multi:${demande}`)) $('classement-perimetre').value = `multi:${demande}`;
  if (new URLSearchParams(location.search).get('portee') === 'amis') $('classement-portee').value = 'amis';
  $('classement-perimetre').addEventListener('change', charger);
  $('classement-periode').addEventListener('change', charger);
  $('classement-portee').addEventListener('change', charger);
  await rafraichir();
  charger();
}

demarrer();
