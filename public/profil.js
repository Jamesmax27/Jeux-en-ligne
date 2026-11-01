// ==========================================================================
// Free Micro Games — profil joueur, côté navigateur (docs/cadrage-fidelisation.md)
//
// La base Cloudflare (D1, /api/profil) est la source de vérité ; ce module en
// garde une copie sur l'appareil (localStorage « fmg-profil ») pour un
// affichage immédiat, avec ce qui n'est pas encore envoyé : le temps de jeu
// en cours et les jeux terminés en attente. Aucun compte, aucune donnée
// personnelle : un jeton secret tiré au hasard par le serveur relie
// l'appareil à son profil ; le code de sauvegarde (4 mots) permet d'en relier
// un autre.
//
// Envois à la base (« sync ») : fin de jeu (FMG.reportComplete), passage de
// niveau, toutes les SYNC_MINUTES minutes de jeu, et à la fermeture de la page
// (navigator.sendBeacon) ; à l'ouverture d'une page, seulement s'il y a
// quelque chose à envoyer ou un nouveau jour (série de jours consécutifs).
// Sinon, simple relecture (sans écriture) au plus toutes les RAFRAICHIR_MINUTES.
// Hors connexion : tout attend sur l'appareil ; le serveur ne compte jamais
// plus de temps que le temps réellement écoulé.
//
// Utilisé par le lanceur (play.js : temps de jeu, jeu terminé, ticket
// multijoueur), la pastille (profil-pastille.js, toutes les pages), la page
// de profil (profil-page.js), le classement (classement.js), les amis
// (amis.js : jeton, résumé des amis dans l'état) et le catalogue (app.js :
// check vert des jeux terminés).
// ==========================================================================

import * as R from './profil-reglages.js';
import { jetonTurnstile } from './turnstile.js';

const ADRESSE = '/api/profil';
const CLE = 'fmg-profil';
const DELAI = 12000;                       // 12 s pour que l'API réponde
const TICK_MS = 10000;                     // le temps de jeu est compté toutes les 10 s
const ATTENTE_MAX_MS = 7 * 86400000;       // un « jeu terminé » refusé pour l'instant est réessayé 7 jours

// --- Copie locale ------------------------------------------------------------------

let memoire = null;   // { jeton, etat, attente: { temps: {jeu: s}, termines: [] }, majLe, syncLe, vu }

function vide() {
  return { jeton: null, etat: null, attente: { temps: {}, termines: [] }, majLe: 0, syncLe: 0, vu: null };
}

function lire() {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) {
      const d = JSON.parse(brut);
      if (d && typeof d === 'object') {
        memoire = { ...vide(), ...d, attente: { temps: {}, termines: [], ...(d.attente || {}) } };
        return memoire;
      }
    }
  } catch { /* stockage refusé ou illisible : copie en mémoire */ }
  if (!memoire) memoire = vide();
  return memoire;
}

function ecrire() {
  try { localStorage.setItem(CLE, JSON.stringify(memoire)); } catch { /* tant pis : la base garde l'essentiel */ }
}

// Autre onglet (lanceur ouvert à côté de l'accueil) : on relit sa copie.
addEventListener('storage', (e) => {
  if (e.key !== CLE) return;
  memoire = null;
  lire();
  prevenir(null);
});

const ecouteurs = new Set();
function prevenir(gains) {
  for (const f of ecouteurs) { try { f(memoire.etat, gains); } catch (e) { console.warn(e); } }
}

/** f(etat, gains) après chaque changement du profil (gains : réponse d'un envoi, ou null). */
export function surChangement(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); }

/** État du profil gardé sur l'appareil (null avant la première réponse du serveur). */
export function etat() { return lire().etat; }

/** Le profil existe-t-il sur cet appareil ? */
export function aUnProfil() { return !!lire().jeton; }

/** Jeton secret de l'appareil (pour les appels de amis.js), ou null. */
export function jetonAppareil() { return lire().jeton; }

/**
 * Résumé des amis renvoyé par /api/amis ({ amis, recues, invisible }) : rangé
 * avec la copie du profil (pastille, présence), sans attendre le prochain envoi.
 */
export function majResumeAmis(resume) {
  lire();
  if (!memoire.etat || !resume || typeof resume !== 'object') return;
  const avant = JSON.stringify(memoire.etat.amis || null);
  memoire.etat.amis = { amis: resume.amis || 0, recues: resume.recues || 0, invisible: resume.invisible === true };
  if (JSON.stringify(memoire.etat.amis) === avant) return;
  ecrire();
  prevenir(null);
}

/** Identifiants des jeux terminés (copie locale). */
export function jeuxTermines() {
  return new Set((lire().etat?.jeux || []).filter((j) => j.termine).map((j) => j.id));
}

/** Jour de l'appareil, « AAAA-MM-JJ » (série de jours consécutifs, réglage FUSEAU). */
export function jourLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date de la dernière visite vue par la pastille (message de bienvenue, nouveautés). */
export function derniereVisite() { return lire().vu; }
export function noterVisite(date) { lire().vu = date; ecrire(); }

// --- Appels à l'API -----------------------------------------------------------------

async function appeler(corps) {
  if (navigator.onLine === false) return { hors: true };
  try {
    const reponse = await fetch(ADRESSE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout ? AbortSignal.timeout(DELAI) : undefined,
    });
    let donnees = null;
    try { donnees = await reponse.json(); } catch { /* réponse vide */ }
    return { statut: reponse.status, ok: reponse.ok, donnees: donnees || {} };
  } catch (erreur) {
    return { hors: true, erreur };
  }
}

function garderEtat(nouvel) {
  if (!nouvel) return;
  memoire.etat = nouvel;
  memoire.majLe = Date.now();
}

let creation = null;

/** Crée le profil s'il n'existe pas encore (dès la première visite). Ne lève jamais d'erreur. */
export function assurerProfil() {
  lire();
  if (memoire.jeton) return Promise.resolve(memoire.etat);
  if (!creation) {
    creation = (async () => {
      const r = await appeler({ action: 'creer', jour: jourLocal() });
      if (r.ok && r.donnees.jeton) {
        lire();
        memoire.jeton = r.donnees.jeton;
        memoire.syncLe = Date.now();
        garderEtat(r.donnees.etat);
        ecrire();
        prevenir(null);
      }
      return memoire.etat;
    })().finally(() => { creation = null; });
  }
  return creation;
}

// Jeton inconnu du serveur (base remise à zéro) : un nouveau profil sera créé.
function oublierJeton() {
  memoire.jeton = null;
  memoire.etat = null;
  ecrire();
}

const aEnvoyer = () => {
  const a = lire().attente;
  return Object.values(a.temps).some((s) => s > 0) || a.termines.length > 0;
};
const nouveauJour = () => !!memoire.etat && memoire.etat.dernierJour !== jourLocal();

let envoi = null;
let encore = false;

/**
 * Envoie ce qui attend (temps, jeux terminés, nouveau jour) et relit le profil.
 * Un seul envoi à la fois ; renvoie les gains de l'envoi (ou null).
 */
export function synchroniser() {
  if (envoi) { encore = true; return envoi; }
  envoi = (async () => {
    let gains = null;
    do {
      encore = false;
      gains = (await envoyerUneFois()) || gains;
    } while (encore);
    return gains;
  })().finally(() => { envoi = null; });
  return envoi;
}

async function envoyerUneFois() {
  await assurerProfil();
  lire();
  if (!memoire.jeton) return null;
  const temps = Object.entries(memoire.attente.temps).filter(([, s]) => s > 0).map(([jeu, s]) => ({ jeu, secondes: Math.min(Math.round(s), R.SECONDES_MAX_ENVOI) }));
  const termines = memoire.attente.termines.map(({ jeu, etoiles, max }) => ({ jeu, etoiles, max }));
  const r = await appeler({ action: 'sync', jeton: memoire.jeton, jour: jourLocal(), temps, termines });
  lire();
  if (r.statut === 401 && r.donnees.inconnu) { oublierJeton(); return null; }
  if (!r.ok) return null;
  // Temps envoyé : retiré de l'attente (le temps compté pendant l'envoi reste).
  for (const { jeu, secondes } of temps) {
    const reste = (memoire.attente.temps[jeu] || 0) - secondes;
    if (reste > 0.5) memoire.attente.temps[jeu] = reste; else delete memoire.attente.temps[jeu];
  }
  // Jeux terminés : gardés seulement si le serveur dit « pas encore » (trop court, plafond du jour).
  const statuts = new Map((r.donnees.gains?.termines || []).map((t) => [t.jeu, t.statut]));
  const limite = Date.now() - ATTENTE_MAX_MS;
  memoire.attente.termines = memoire.attente.termines.filter((t) => {
    const envoye = termines.some((e) => e.jeu === t.jeu && e.etoiles === t.etoiles && e.max === t.max);
    if (!envoye) return true;
    return ['trop-court', 'plafond'].includes(statuts.get(t.jeu)) && t.le > limite;
  });
  memoire.syncLe = Date.now();
  garderEtat(r.donnees.etat);
  ecrire();
  prevenir(r.donnees.gains || null);
  return r.donnees.gains || null;
}

/** Envoi de dernière minute (page fermée ou cachée) : navigator.sendBeacon, réponse non lue. */
function envoyerEnPartant() {
  lire();
  if (!memoire.jeton || !aEnvoyer() || navigator.onLine === false) return;
  const temps = Object.entries(memoire.attente.temps).filter(([, s]) => s >= 1).map(([jeu, s]) => ({ jeu, secondes: Math.min(Math.round(s), R.SECONDES_MAX_ENVOI) }));
  const termines = memoire.attente.termines.map(({ jeu, etoiles, max }) => ({ jeu, etoiles, max }));
  const corps = JSON.stringify({ action: 'sync', jeton: memoire.jeton, jour: jourLocal(), temps, termines });
  try {
    if (navigator.sendBeacon(ADRESSE, new Blob([corps], { type: 'application/json' }))) {
      // Le temps est parti ; les jeux terminés restent jusqu'à un envoi confirmé
      // (le serveur ne compte jamais deux fois la même fin).
      memoire.attente.temps = {};
      memoire.syncLe = Date.now();
      ecrire();
    }
  } catch { /* le prochain envoi s'en chargera */ }
}

/**
 * À l'ouverture d'une page : crée le profil si besoin, envoie ce qui attend
 * ou le nouveau jour ; sinon relit le profil s'il est ancien. Renvoie les gains (ou null).
 */
export async function rafraichir() {
  lire();
  if (!memoire.jeton) {
    await assurerProfil();
    lire();
    if (memoire.etat && nouveauJour()) return synchroniser();
    return null;
  }
  if (aEnvoyer() || nouveauJour() || !memoire.etat) return synchroniser();
  if (Date.now() - memoire.majLe > R.RAFRAICHIR_MINUTES * 60000) {
    const r = await appeler({ action: 'etat', jeton: memoire.jeton });
    lire();
    if (r.statut === 401 && r.donnees.inconnu) oublierJeton();
    else if (r.ok) { garderEtat(r.donnees.etat); ecrire(); prevenir(null); }
  }
  return null;
}

// --- Lanceur : temps de jeu et « jeu terminé » ---------------------------------------

let jeuSuivi = null;
let depuisEnvoi = 0;     // secondes comptées depuis le dernier envoi
let dernierTick = 0;

/** XP estimée (avant envoi) : celle du serveur + le temps qui attend, plafond du jour compris. */
export function xpEstimee() {
  const e = lire().etat;
  if (!e) return 0;
  const enAttente = Object.values(memoire.attente.temps).reduce((s, x) => s + x, 0);
  const deja = e.aujourdhui?.jour === new Date().toISOString().slice(0, 10) ? e.aujourdhui.secondes || 0 : 0;
  const credite = Math.max(0, Math.min(enAttente, R.MINUTES_MAX_JOUR * 60 - deja));
  return e.xp + (Math.floor((deja + credite) / 60) - Math.floor(deja / 60)) * R.XP_PAR_MINUTE;
}

// cachee : la page vient d'être cachée (le dernier morceau visible compte encore).
function compter(cachee = false) {
  const maintenant = Date.now();
  if (!jeuSuivi || (!cachee && document.visibilityState === 'hidden') || !dernierTick) { dernierTick = maintenant; return; }
  const secondes = Math.min((maintenant - dernierTick) / 1000, TICK_MS / 1000 * 3);
  dernierTick = maintenant;
  if (secondes <= 0) return;
  lire();
  memoire.attente.temps[jeuSuivi] = (memoire.attente.temps[jeuSuivi] || 0) + secondes;
  depuisEnvoi += secondes;
  ecrire();
  const niveauEstime = R.niveauPourXp(xpEstimee());
  if (depuisEnvoi >= R.SYNC_MINUTES * 60 || (memoire.etat && niveauEstime > memoire.etat.niveau)) {
    depuisEnvoi = 0;
    synchroniser();
  }
}

/** À appeler par le lanceur quand le jeu est affiché : compte le temps de jeu visible. */
export function suivreTemps(jeuId) {
  if (jeuSuivi || window.top !== window || window.opener) return;
  jeuSuivi = jeuId;
  dernierTick = Date.now();
  assurerProfil();
  setInterval(() => compter(), TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      compter(true);
      dernierTick = 0;
      envoyerEnPartant();
    } else {
      dernierTick = Date.now();
    }
  });
  addEventListener('pagehide', () => { compter(true); dernierTick = 0; envoyerEnPartant(); });
}

/**
 * Message « jeu terminé » du jeu (FMG.reportComplete, message « jel-termine »).
 * stars / maxStars : null pour un jeu sans étoiles. Envoyé tout de suite.
 */
export function noterTermine(jeuId, stars, maxStars) {
  compter(); // temps joué jusqu'ici (relit puis écrit la copie locale : à faire avant de la modifier)
  lire();
  const avec = Number.isInteger(stars) && Number.isInteger(maxStars) && maxStars > 0;
  const fin = { jeu: jeuId, etoiles: avec ? Math.max(0, Math.min(stars, maxStars)) : null, max: avec ? maxStars : null, le: Date.now() };
  memoire.attente.termines = memoire.attente.termines.filter((t) => t.jeu !== jeuId).concat(fin);
  ecrire();
  return synchroniser();
}

/** Ticket d'entrée d'une partie en ligne (Turnstile « multi ») ; null sans profil ou en cas d'échec. */
export async function ticketMulti(jeuId) {
  await assurerProfil();
  lire();
  if (!memoire.jeton) return null;
  try {
    const turnstileToken = await jetonTurnstile('multi');
    const r = await appeler({ action: 'ticket', jeton: memoire.jeton, jeu: jeuId, turnstileToken });
    return r.ok ? r.donnees.ticket || null : null;
  } catch (erreur) {
    console.warn('Ticket multijoueur non obtenu (la partie se joue quand même) :', erreur);
    return null;
  }
}

// --- Page de profil et classement --------------------------------------------------------

/** Code de sauvegarde : { code } ou { erreur, statut }. */
export async function demanderCode() {
  await assurerProfil();
  if (!memoire.jeton) return { erreur: 'hors', statut: 0 };
  const r = await appeler({ action: 'code', jeton: memoire.jeton });
  if (r.hors) return { erreur: 'hors', statut: 0 };
  if (!r.ok) return { erreur: r.statut === 429 ? 'limite' : 'serveur', statut: r.statut };
  if (memoire.etat) { memoire.etat.aCode = true; ecrire(); }
  return { code: r.donnees.code };
}

/**
 * Relie cet appareil au profil d'un code (Turnstile « code ») : la progression
 * de cet appareil est remplacée par celle du code. Renvoie { ok } ou { erreur, raison, bloqueJusqua }.
 */
export async function restaurer(code) {
  let turnstileToken;
  try { turnstileToken = await jetonTurnstile('code'); } catch { return { erreur: 'robot' }; }
  const r = await appeler({ action: 'restaurer', code, turnstileToken });
  if (r.hors) return { erreur: 'hors' };
  if (!r.ok) return { erreur: r.statut === 429 ? 'bloque' : r.statut === 403 ? 'robot' : r.statut === 400 ? 'code' : 'serveur', raison: r.donnees.raison, bloqueJusqua: r.donnees.bloqueJusqua };
  memoire = { ...vide(), jeton: r.donnees.jeton, syncLe: Date.now(), vu: lire().vu };
  garderEtat(r.donnees.etat);
  ecrire();
  prevenir(null);
  return { ok: true };
}

/** Nouveau pseudo (null : revenir à « Joueur <nombre> »). Renvoie { ok } ou { erreur, raison }. */
export async function changerPseudo(pseudo) {
  await assurerProfil();
  const r = await appeler({ action: 'pseudo', jeton: memoire.jeton, pseudo });
  if (r.hors) return { erreur: 'hors' };
  if (!r.ok) return { erreur: 'refuse', raison: r.donnees.raison || 'serveur' };
  garderEtat(r.donnees.etat);
  ecrire();
  prevenir(null);
  return { ok: true };
}

/** Avatar et cadre (débloqués). */
export async function changerApparence({ avatar, cadre }) {
  await assurerProfil();
  const r = await appeler({ action: 'apparence', jeton: memoire.jeton, avatar, cadre });
  if (!r.ok) return { erreur: r.hors ? 'hors' : 'refuse' };
  garderEtat(r.donnees.etat);
  ecrire();
  prevenir(null);
  return { ok: true };
}

/** Signale le pseudo d'un autre joueur (classement). */
export async function signaler(cible) {
  if (!lire().jeton) return { erreur: 'profil' };
  const r = await appeler({ action: 'signaler', jeton: memoire.jeton, cible });
  if (!r.ok) return { erreur: r.hors ? 'hors' : r.donnees.raison || 'serveur' };
  return { ok: true };
}

/** Classement : { top, moi, debut } ou { erreur }. */
export async function classement(perimetre, periode) {
  if (navigator.onLine === false) return { erreur: 'hors' };
  try {
    const reponse = await fetch('/api/classement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ perimetre, periode, jeton: lire().jeton || undefined }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(DELAI) : undefined,
    });
    if (!reponse.ok) return { erreur: 'serveur' };
    return await reponse.json();
  } catch {
    return { erreur: 'hors' };
  }
}

// --- Affichage commun -----------------------------------------------------------------------

/** Pseudo affiché : le pseudo choisi, sinon « Joueur <nombre> » dans la langue de la page. */
export function nomAffiche(e, t) {
  if (!e) return '';
  return e.pseudo || t('profil.pseudoDefaut', { n: e.numero });
}

/** Picto de l'avatar (réglages), ou celui par défaut. */
export function pictoAvatar(id) {
  return (R.AVATARS.find((a) => a.id === id) || R.AVATARS[0]).picto;
}

const RE_FICHE = /^\/(?:(?:en|es|pt|de)\/)?(?:jeux|games|juegos|jogos|spiele)\/([a-z0-9-]+)\/$/;

/**
 * Check vert sur la vignette des jeux terminés : toute carte (lien .carte vers
 * la fiche d'un jeu, ou élément [data-jeu]) dans « racine ». etiquette : texte
 * lu par les lecteurs d'écran (« Terminé »).
 */
export function marquerTermines(racine, etiquette) {
  const termines = jeuxTermines();
  for (const carte of (racine || document).querySelectorAll('a.carte, [data-jeu]')) {
    let id = carte.dataset.jeu;
    if (!id && carte.getAttribute('href')) {
      try { id = RE_FICHE.exec(new URL(carte.getAttribute('href'), location.href).pathname)?.[1]; } catch { id = null; }
    }
    const zone = carte.querySelector('.jaquette') || carte;
    const existant = zone.querySelector(':scope > .badge-termine');
    if (id && termines.has(id)) {
      if (!existant) {
        const badge = document.createElement('span');
        badge.className = 'badge-termine';
        badge.setAttribute('role', 'img');
        badge.setAttribute('aria-label', etiquette);
        badge.title = etiquette;
        badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        zone.append(badge);
      }
    } else if (existant) {
      existant.remove();
    }
  }
}
