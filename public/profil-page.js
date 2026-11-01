// ==========================================================================
// Free Micro Games — page de profil du joueur (/profil/, /en/profile/…)
//
// Affiche le profil gardé sur l'appareil (copie de la base, profil.js) puis
// le relit : avatar, pseudo (modifiable), niveau et expérience, rang de la
// semaine, série de jours consécutifs, étoiles, jeux joués (derniers d'abord,
// avec temps passé, étoiles, check vert et bouton « Rejouer »), badges,
// parties en ligne, amis (nombre, rang parmi eux cette semaine, mode
// invisible : docs/consigne-amis.md), choix de l'avatar et du cadre, code de
// sauvegarde (afficher, copier, ou relier cet appareil à un autre profil).
// Page générée par scripts/pages-seo.mjs (gabarits/profil.html), non indexée.
// ==========================================================================

import * as R from './profil-reglages.js';
import { lireCode } from './profil-code.js';
import {
  etat, rafraichir, surChangement, nomAffiche, pictoAvatar, demanderCode, restaurer, changerPseudo,
  changerApparence, classement, marquerTermines,
} from './profil.js';
import { chargerTextes, t, langue, date } from './profil-textes.js';
import { urlJeu, urlLanceur, urlClassement } from './chemins.js';
import { classementAmis, changerInvisible } from './amis.js';

const $ = (id) => document.getElementById(id);
let catalogue = new Map();

function titre(jeu, id) {
  if (!jeu) return id;
  return jeu.i18n?.[langue()]?.title || jeu.title;
}

function duree(secondes) {
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return t('profil.duree.minutes', { n: Math.max(1, minutes) });
  return t('profil.duree.heures', { h: Math.floor(minutes / 60), m: minutes % 60 });
}

function barre(element, valeur, max) {
  const pourcent = max > 0 ? Math.max(0, Math.min(100, Math.round((valeur / max) * 100))) : 0;
  element.setAttribute('aria-valuenow', String(pourcent));
  element.querySelector('span').style.width = `${pourcent}%`;
}

// --- Rendu ------------------------------------------------------------------------

function afficher() {
  const e = etat();
  if (!e) {
    $('profil-etat').textContent = navigator.onLine === false ? t('profil.horsLigne') : t('profil.chargement');
    return;
  }
  $('profil-etat').textContent = '';
  const badges = new Set(e.badges.map((b) => b.id));

  // Carte : avatar, nom, niveau, expérience.
  $('profil-avatar').textContent = pictoAvatar(e.avatar);
  $('profil-avatar').dataset.cadre = e.cadre;
  $('profil-nom').textContent = nomAffiche(e, t);
  $('profil-niveau').textContent = t('profil.niveau', { n: e.niveau });
  if (e.suivant) {
    barre($('profil-barre-xp'), e.xp - e.seuil, e.suivant - e.seuil);
    $('profil-barre-xp').setAttribute('aria-label', t('profil.xpAria'));
    $('profil-xp').textContent = t('profil.xp', { xp: e.xp, reste: e.suivant - e.xp, n: e.niveau + 1 });
  } else {
    barre($('profil-barre-xp'), 1, 1);
    $('profil-xp').textContent = t('profil.xpMax', { xp: e.xp });
  }

  // Série de jours consécutifs.
  const palier = R.PALIERS_SERIE.find((p) => p > e.serie);
  $('profil-serie').textContent = [
    t('profil.serie.actuelle', { n: e.serie }),
    t('profil.serie.record', { n: e.serieRecord }),
    palier ? t('profil.serie.prochain', { n: palier }) : '',
  ].filter(Boolean).join(' ');

  // Étoiles : total des jeux terminés qui ont des étoiles.
  const avecEtoiles = e.jeux.filter((j) => j.termine && j.max);
  const gagnees = avecEtoiles.reduce((s, j) => s + (j.etoiles || 0), 0);
  const possibles = avecEtoiles.reduce((s, j) => s + j.max, 0);
  $('profil-etoiles-texte').textContent = possibles ? t('profil.etoiles.total', { n: gagnees, max: possibles }) : t('profil.etoiles.aucune');
  barre($('profil-barre-etoiles'), gagnees, possibles);
  $('profil-barre-etoiles').setAttribute('aria-label', t('profil.etoiles.titre'));

  // Jeux joués, derniers d'abord.
  const liste = $('profil-jeux');
  liste.textContent = '';
  $('profil-jeux-vide').hidden = e.jeux.length > 0;
  for (const j of e.jeux) {
    const fiche = catalogue.get(j.id);
    const li = document.createElement('li');
    li.className = 'profil-jeu';
    li.dataset.jeu = j.id;
    const lien = document.createElement('a');
    lien.className = 'profil-jeu-lien';
    lien.href = urlJeu(j.id, langue());
    const jaquette = document.createElement('div');
    jaquette.className = 'jaquette';
    const img = document.createElement('img');
    img.src = fiche ? `/${fiche.cover}` : '/assets/sans-jaquette.svg';
    img.alt = '';
    img.width = 600;
    img.height = 800;
    img.loading = 'lazy';
    img.decoding = 'async';
    jaquette.append(img);
    lien.append(jaquette);
    const texte = document.createElement('div');
    texte.className = 'profil-jeu-texte';
    const h = document.createElement('h3');
    h.textContent = titre(fiche, j.id);
    const infos = document.createElement('p');
    infos.textContent = [
      j.termine ? t('profil.jeux.termine', { date: date(j.termine) }) : t('profil.jeux.enCours'),
      t('profil.jeux.temps', { duree: duree(j.secondes) }),
      j.max ? t('profil.jeux.etoiles', { n: j.etoiles || 0, max: j.max }) : '',
    ].filter(Boolean).join(' · ');
    texte.append(h, infos);
    if (j.termine) {
      const badge = document.createElement('p');
      badge.className = 'profil-jeu-badge';
      badge.textContent = t('profil.jeux.badge');
      texte.append(badge);
    }
    const rejouer = document.createElement('a');
    rejouer.className = 'bouton profil-rejouer';
    rejouer.href = urlLanceur(j.id, langue());
    rejouer.textContent = t('profil.jeux.rejouer');
    rejouer.setAttribute('aria-label', t('profil.jeux.rejouerAria', { titre: titre(fiche, j.id) }));
    li.append(lien, texte, rejouer);
    liste.append(li);
  }
  marquerTermines(liste, t('profil.termine'));

  // Badges : rares (débloqués en couleur, les autres grisés avec leur condition).
  const listeBadges = $('profil-badges');
  listeBadges.textContent = '';
  const termines = e.jeux.filter((j) => j.termine).length;
  $('profil-badges-resume').textContent = t('profil.badges.resume', { n: e.badges.length, termines });
  for (const b of R.listeBadges()) {
    const li = document.createElement('li');
    const obtenu = badges.has(b.id);
    li.className = `profil-badge famille-${b.famille}${obtenu ? ' obtenu' : ''}`;
    li.innerHTML = '<span class="profil-badge-picto" aria-hidden="true"></span><span class="profil-badge-nom"></span><span class="profil-badge-aide"></span>';
    li.querySelector('.profil-badge-picto').textContent = { collection: '🏆', etoiles: '⭐', serie: '🔥', niveau: '🎖️', multi: '🎮' }[b.famille];
    li.querySelector('.profil-badge-nom').textContent = t(`badge.${b.id}`);
    li.querySelector('.profil-badge-aide').textContent = obtenu ? t('profil.badges.obtenu') : t(`badge.${b.id}.aide`);
    listeBadges.append(li);
  }

  // Amis : nombre, mode invisible (le rang parmi les amis : afficherRangAmis).
  const amis = e.amis || { amis: 0, recues: 0, invisible: false };
  $('profil-amis-compte').textContent = t('profil.amis.compte', { n: amis.amis });
  $('profil-invisible').checked = amis.invisible;

  // Parties en ligne.
  $('profil-multi').textContent = e.multi.parties
    ? t('profil.multi.resume', { n: e.multi.parties, v: e.multi.victoires, h: e.multi.humains })
    : t('profil.multi.aucune');

  // Avatars et cadres : débloqués ou non.
  const choix = (conteneur, liste, actuel, champ) => {
    conteneur.textContent = '';
    for (const x of liste) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `profil-choix-bouton${champ === 'cadre' ? ' cadre' : ''}`;
      const libre = R.estDebloque(x, e.niveau, badges);
      b.disabled = !libre;
      b.setAttribute('aria-pressed', String(x.id === actuel));
      const nom = t(`${champ}.${x.id}`);
      const condition = x.badge ? t('profil.apparence.badge', { badge: t(`badge.${x.badge}`) }) : t('profil.apparence.niveau', { n: x.niveau });
      b.setAttribute('aria-label', libre ? nom : `${nom} — ${condition}`);
      b.title = libre ? nom : condition;
      if (champ === 'avatar') b.textContent = x.picto;
      else { b.dataset.cadre = x.id; b.textContent = pictoAvatar(e.avatar); }
      if (!libre) {
        const verrou = document.createElement('span');
        verrou.className = 'profil-verrou';
        verrou.textContent = x.badge ? '🔒' : String(x.niveau);
        b.append(verrou);
      }
      b.addEventListener('click', async () => {
        const r = await changerApparence({ [champ]: x.id });
        if (r.erreur) $('profil-etat').textContent = t(r.erreur === 'hors' ? 'profil.horsLigne' : 'profil.erreur');
      });
      li.append(b);
      conteneur.append(li);
    }
  };
  choix($('profil-avatars'), R.AVATARS, e.avatar, 'avatar');
  choix($('profil-cadres'), R.CADRES, e.cadre, 'cadre');
}

async function afficherRang() {
  const r = await classement('general', 'semaine');
  const p = $('profil-rang');
  if (r.erreur || !r.moi?.rang) { p.hidden = true; return; }
  p.hidden = false;
  p.textContent = '';
  const a = document.createElement('a');
  a.href = urlClassement(langue());
  a.textContent = t('profil.rang', { n: r.moi.rang });
  p.append(a);
}

// Rang parmi les amis cette semaine (classement entre amis, sans présence), avec un lien.
async function afficherRangAmis() {
  const p = $('profil-amis-rang');
  if (!etat()?.amis?.amis) { p.hidden = true; return; }
  const r = await classementAmis('general', 'semaine', false);
  const moi = r.ok ? r.donnees.lignes?.find((l) => l.id === r.donnees.moi) : null;
  if (!moi) { p.hidden = true; return; }
  p.hidden = false;
  p.textContent = '';
  const a = document.createElement('a');
  a.href = `${urlClassement(langue())}?portee=amis`;
  a.textContent = t('profil.amis.rang', { n: moi.rang });
  p.append(a);
}

function brancherInvisible() {
  $('profil-invisible').addEventListener('change', async (ev) => {
    const voulu = ev.target.checked;
    $('profil-amis-message').textContent = t('profil.envoi');
    const r = await changerInvisible(voulu);
    if (!r.ok) {
      ev.target.checked = !voulu;
      $('profil-amis-message').textContent = t(r.hors ? 'profil.horsLigne' : 'profil.erreur');
      return;
    }
    $('profil-amis-message').textContent = '';
  });
}

// --- Pseudo ------------------------------------------------------------------------------

function brancherPseudo() {
  const form = $('profil-pseudo');
  const champ = $('profil-pseudo-champ');
  const message = $('profil-pseudo-message');
  champ.maxLength = R.PSEUDO_MAX;
  champ.minLength = R.PSEUDO_MIN;
  const ouvrir = (oui) => {
    form.hidden = !oui;
    $('profil-pseudo-modifier').hidden = oui;
    message.textContent = '';
    if (oui) { champ.value = etat()?.pseudo || ''; champ.focus(); }
  };
  $('profil-pseudo-modifier').addEventListener('click', () => ouvrir(true));
  $('profil-pseudo-annuler').addEventListener('click', () => ouvrir(false));
  const envoyer = async (valeur) => {
    message.textContent = t('profil.envoi');
    const r = await changerPseudo(valeur);
    if (r.ok) { ouvrir(false); return; }
    message.textContent = t(r.erreur === 'hors' ? 'profil.horsLigne' : `profil.pseudo.erreur.${r.raison}`, { min: R.PSEUDO_MIN, max: R.PSEUDO_MAX });
  };
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const valeur = champ.value.trim();
    if ([...valeur].length < R.PSEUDO_MIN || [...valeur].length > R.PSEUDO_MAX) {
      message.textContent = t('profil.pseudo.erreur.longueur', { min: R.PSEUDO_MIN, max: R.PSEUDO_MAX });
      return;
    }
    envoyer(valeur);
  });
  $('profil-pseudo-defaut').addEventListener('click', () => envoyer(null));
}

// --- Code de sauvegarde ---------------------------------------------------------------------

function brancherCode() {
  const message = $('profil-code-message');
  $('profil-code-afficher').addEventListener('click', async () => {
    message.textContent = t('profil.envoi');
    const r = await demanderCode();
    if (r.erreur) { message.textContent = t(r.erreur === 'hors' ? 'profil.horsLigne' : r.erreur === 'limite' ? 'profil.code.limite' : 'profil.erreur'); return; }
    message.textContent = '';
    $('profil-code').hidden = false;
    $('profil-code-texte').textContent = r.code;
  });
  $('profil-code-copier').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('profil-code-texte').textContent);
      message.textContent = t('profil.code.copie');
    } catch {
      message.textContent = t('profil.code.copieImpossible');
    }
  });

  const form = $('profil-restaurer');
  const champ = $('profil-restaurer-champ');
  const retour = $('profil-restaurer-message');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    // Contrôle à la saisie (format, mots, clé), avant tout envoi.
    const lu = lireCode(champ.value);
    if (!lu.ok) {
      retour.textContent = t(`profil.code.erreur.${lu.raison}`, { n: lu.position || 0 });
      return;
    }
    const remplace = !!etat() && (etat().xp > 0 || etat().jeux.length > 0);
    if (remplace && form.dataset.confirme !== lu.code) {
      form.dataset.confirme = lu.code;
      retour.textContent = t('profil.code.confirmer');
      return;
    }
    retour.textContent = t('profil.envoi');
    const r = await restaurer(lu.code);
    if (r.ok) {
      champ.value = '';
      delete form.dataset.confirme;
      retour.textContent = t('profil.code.restaure');
      afficherRang();
      return;
    }
    if (r.erreur === 'bloque' && r.bloqueJusqua) retour.textContent = t('profil.code.bloque', { heure: date(r.bloqueJusqua, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) });
    else retour.textContent = t({ code: 'profil.code.erreur.inconnu', robot: 'profil.code.erreur.robot', hors: 'profil.horsLigne' }[r.erreur] || 'profil.erreur');
  });
}

// --- Démarrage ----------------------------------------------------------------------------------

async function demarrer() {
  await chargerTextes();
  try {
    const c = await (await fetch('/catalog.json')).json();
    catalogue = new Map((c.games || []).map((j) => [j.id, j]));
  } catch { /* hors connexion : identifiants à la place des titres */ }
  brancherPseudo();
  brancherCode();
  brancherInvisible();
  afficher();
  surChangement(() => afficher());
  await rafraichir();
  afficher();
  afficherRang();
  afficherRangAmis();
}

demarrer();
