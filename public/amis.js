// ==========================================================================
// Free Micro Games — amis, présence et « Rejoindre », côté navigateur
// (docs/consigne-amis.md)
//
// - Appels à /api/amis (functions/api/amis.js) : liste d'amis et demandes,
//   demande par pseudo exact, accepter, refuser, retirer, bloquer, mode
//   invisible, classement entre amis. Le serveur décide de tout ; ici, on affiche.
// - Présence : un signal léger au serveur de présence (Worker multijoueur,
//   multijoueur/src/presence.js), seulement si le joueur a au moins un ami,
//   n'est pas invisible et que la page est visible (Page Visibility API) :
//   toutes les PRESENCE_INTERVALLE_S secondes, et tout de suite (à
//   PRESENCE_ECART_MIN_S près) quand l'état change : page du site, jeu ouvert
//   dans le lanceur, partie en ligne rejointe ou quittée. Aucun signal sur un
//   onglet caché, hors connexion, ou pendant PRESENCE_PAUSE_ERREUR_MIN minutes
//   après une panne (quota atteint : mode dégradé, le reste du site marche).
// - Actualisation des pages Amis et Classement entre amis : tout de suite à
//   l'ouverture, puis toutes les AMIS_ACTUALISER_S secondes tant que la page est
//   visible ; bouton « Actualiser » au plus toutes les AMIS_ACTUALISER_MIN_S
//   secondes (compte à rebours ; le serveur le vérifie aussi, par profil).
// Stockage sur l'appareil : « fmg-presence » (dernier signal, ticket de
// présence) ; rien d'autre.
// Utilisé par profil-pastille.js (toutes les pages), play.js (lanceur),
// amis-page.js, classement.js et profil-page.js.
// ==========================================================================

import * as R from './profil-reglages.js';
import { etat, jetonAppareil, majResumeAmis, surChangement, assurerProfil } from './profil.js';
import { ADRESSE_MULTI, SITES_MULTI } from './multijoueur/config.js';
import { urlLanceur } from './chemins.js';
import { jetonTurnstile } from './turnstile.js';

const ADRESSE = '/api/amis';
const CLE = 'fmg-presence';
const DELAI = 12000;
const VERIF_MS = 15000;          // l'onglet visible regarde toutes les 15 s s'il est temps d'envoyer un signal

// --- Appels à l'API --------------------------------------------------------------

async function appeler(corps) {
  if (navigator.onLine === false) return { hors: true, donnees: {} };
  const jeton = jetonAppareil() || (await assurerProfil(), jetonAppareil());
  if (!jeton) return { hors: true, donnees: {} };
  try {
    const reponse = await fetch(ADRESSE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...corps, jeton }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(DELAI) : undefined,
    });
    let donnees = null;
    try { donnees = await reponse.json(); } catch { /* vide */ }
    if (donnees?.resume) majResumeAmis(donnees.resume);
    return { statut: reponse.status, ok: reponse.ok, donnees: donnees || {} };
  } catch {
    return { hors: true, donnees: {} };
  }
}

/** Amis, demandes reçues et envoyées, joueurs bloqués ; presence : lire aussi la présence des amis. */
export function liste(presence = true) { return appeler({ action: 'liste', presence }); }

/** Demande d'ami au pseudo exact (Turnstile si le réglage AMIS_TURNSTILE le demande). */
export async function demander(pseudo) {
  let turnstileToken;
  if (R.AMIS_TURNSTILE) {
    try { turnstileToken = await jetonTurnstile('ami'); } catch { return { donnees: { statut: 'robot' } }; }
  }
  return appeler({ action: 'demander', pseudo, turnstileToken });
}

/** accepter, refuser, annuler, retirer, bloquer, debloquer : sur le profil « id ». */
export function repondre(action, id) { return appeler({ action, id }); }

/** Mode invisible (se montrer hors ligne). */
export async function changerInvisible(invisible) {
  const r = await appeler({ action: 'invisible', invisible });
  if (r.ok && invisible) await envoyerSignal({ etat: 'hors' }, true);   // disparaître tout de suite
  if (r.ok && !invisible) verifier();
  return r;
}

/** Classement entre amis (même calcul que le classement général). */
export function classementAmis(perimetre, periode, presence = true) {
  return appeler({ action: 'classement', perimetre, periode, presence });
}

/** Bouton « Rejoindre » touché (indicateur : utilisation du bouton). Ne bloque jamais. */
export function noterRejoindre(type) {
  const jeton = jetonAppareil();
  if (!jeton) return;
  try {
    navigator.sendBeacon(ADRESSE, new Blob([JSON.stringify({ action: 'rejoindre', jeton, type })], { type: 'application/json' }));
  } catch { /* tant pis */ }
}

// --- Présence ---------------------------------------------------------------------

// Serveur de présence : celui du multijoueur sur le vrai site, le serveur de test
// en local (scripts/serve.mjs), rien ailleurs (aperçus *.pages.dev).
function adressePresence() {
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return `${location.origin}/multi`;
  return SITES_MULTI.includes(location.hostname) ? ADRESSE_MULTI.replace(/^wss:/, 'https:') : null;
}

function lireGlobal() {
  try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return memoireGlobale; }
}
let memoireGlobale = {};
function ecrireGlobal(g) {
  memoireGlobale = g;
  try { localStorage.setItem(CLE, JSON.stringify(g)); } catch { /* stockage refusé : en mémoire */ }
}

let etatOnglet = null;        // { etat: 'site' | 'jeu', jeu, partie } de cet onglet
let dernierEnvoye = null;     // dernier état envoyé par cet onglet (texte JSON)
let minuteur = 0;
let demarre = false;

function peutSignaler() {
  if (!R.PRESENCE_ACTIVE || !etatOnglet || !adressePresence()) return false;
  const e = etat();
  if (!jetonAppareil() || !e?.amis || e.amis.amis < 1 || e.amis.invisible) return false;
  if (document.visibilityState === 'hidden' || navigator.onLine === false) return false;
  // Comme le suivi des parties : rien depuis le cadre d'un autre site ou une fenêtre pilotée.
  return window.top === window && !window.opener;
}

async function ticketPresence() {
  const g = lireGlobal();
  if (g.ticket && g.ticketExp - Date.now() > 3600000) return g.ticket;
  const r = await appeler({ action: 'ticket' });
  if (!r.ok || !r.donnees.ticket) {
    if (!r.hors && r.statut >= 500) ecrireGlobal({ ...lireGlobal(), pause: Date.now() + R.PRESENCE_PAUSE_ERREUR_MIN * 60000 });
    return null;
  }
  ecrireGlobal({ ...lireGlobal(), ticket: r.donnees.ticket, ticketExp: r.donnees.expire });
  return r.donnees.ticket;
}

// Envoie un signal (sans attendre de contenu dans la réponse). force : même invisible (« hors »).
async function envoyerSignal(etatSignal, force = false) {
  const adresse = adressePresence();
  if (!adresse || (!force && !peutSignaler())) return false;
  const ticket = await ticketPresence();
  if (!ticket) return false;
  ecrireGlobal({ ...lireGlobal(), le: Date.now() });
  try {
    const r = await fetch(`${adresse}/presence`, {
      method: 'POST',
      mode: 'cors',
      keepalive: true,
      // text/plain : requête simple, sans pré-vol CORS (une seule requête par signal).
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ ticket, ...etatSignal }),
    });
    if (r.status === 401) ecrireGlobal({ ...lireGlobal(), ticket: null, ticketExp: 0 });
    else if (r.status >= 500) ecrireGlobal({ ...lireGlobal(), pause: Date.now() + R.PRESENCE_PAUSE_ERREUR_MIN * 60000 });
    return r.ok;
  } catch {
    ecrireGlobal({ ...lireGlobal(), pause: Date.now() + R.PRESENCE_PAUSE_ERREUR_MIN * 60000 });
    return false;
  }
}

// Est-il temps d'envoyer un signal ? (changement d'état, ou intervalle écoulé)
async function verifier() {
  clearTimeout(minuteur);
  if (!peutSignaler()) return;
  const g = lireGlobal();
  const maintenant = Date.now();
  if (g.pause > maintenant) return;
  const cle = JSON.stringify(etatOnglet);
  const ecoule = maintenant - (g.le || 0);
  if (cle === dernierEnvoye && ecoule < R.PRESENCE_INTERVALLE_S * 1000 - 3000) return;
  if (ecoule < R.PRESENCE_ECART_MIN_S * 1000) {
    minuteur = setTimeout(verifier, R.PRESENCE_ECART_MIN_S * 1000 - ecoule + 50);
    return;
  }
  dernierEnvoye = cle;
  await envoyerSignal(etatOnglet);
}

/**
 * État de présence de cet onglet : { etat: 'site' } (page du site) ou
 * { etat: 'jeu', jeu, partie } (lanceur ; partie : partie en ligne en cours).
 * Un changement part tout de suite (à PRESENCE_ECART_MIN_S près).
 */
export function annoncer(nouvel) {
  etatOnglet = nouvel && nouvel.etat === 'jeu'
    ? { etat: 'jeu', jeu: nouvel.jeu, ...(nouvel.partie ? { partie: nouvel.partie } : {}) }
    : { etat: 'site' };
  if (!demarre) {
    demarre = true;
    setInterval(() => { if (document.visibilityState === 'visible') verifier(); }, VERIF_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifier(); else clearTimeout(minuteur); });
    addEventListener('online', verifier);
    surChangement(() => verifier());
  }
  verifier();
}

// --- Affichage commun (page Amis, classement entre amis) ---------------------------

/**
 * Lien du bouton « Rejoindre » d'un ami en jeu, ou null :
 * { href, type: 'partie' (même partie en ligne) | 'multi' (jeu multijoueur pas
 * encore adapté : le jeu seulement) | 'solo' }.
 */
export function lienRejoindre(presence, fiche, lang) {
  if (!presence || presence.etat !== 'jeu' || !fiche) return null;
  const href = urlLanceur(fiche.id, lang);
  if (fiche.multijoueur === true && fiche.rejoindre === true && presence.partie) {
    return { href: `${href}&rejoindre=${encodeURIComponent(presence.partie)}`, type: 'partie' };
  }
  return { href, type: fiche.multijoueur === true ? 'multi' : 'solo' };
}

/**
 * Statut et bouton « Rejoindre » d'un ami : éléments à poser dans sa ligne.
 * t : textes (profil-textes.js) ; catalogue : Map id → fiche ; titre(fiche).
 * Renvoie { statut: <span>, aide: <span> | null, bouton: <a> | null }.
 */
export function elementsPresence(ami, { t, lang, catalogue, titre, presence }) {
  const p = ami.presence;
  const statut = document.createElement('span');
  statut.className = 'amis-statut';
  let aide = null;
  let bouton = null;
  if (presence !== 'ok' || !p) {
    statut.dataset.etat = 'inconnu';
    statut.textContent = presence === 'trop-tot' ? t('amis.statut.attente') : t('amis.statut.inconnu');
    return { statut, aide, bouton };
  }
  const fiche = p.jeu ? catalogue.get(p.jeu) : null;
  statut.dataset.etat = p.etat === 'jeu' && fiche ? 'jeu' : p.etat === 'hors' ? 'hors' : 'site';
  if (statut.dataset.etat === 'jeu') statut.textContent = t('amis.statut.jeu', { titre: titre(fiche) });
  else statut.textContent = t(statut.dataset.etat === 'hors' ? 'amis.statut.hors' : 'amis.statut.site');
  const lien = lienRejoindre(p, fiche, lang);
  if (lien) {
    bouton = document.createElement('a');
    bouton.className = 'bouton amis-rejoindre';
    bouton.href = lien.href;
    bouton.dataset.type = lien.type;
    bouton.textContent = t('amis.rejoindre');
    bouton.setAttribute('aria-label', t('amis.rejoindreAria', { nom: ami.nom, titre: titre(fiche) }));
    bouton.addEventListener('click', () => noterRejoindre(lien.type));
    aide = document.createElement('span');
    aide.className = 'amis-aide-rejoindre';
    aide.textContent = t(`amis.rejoindre.${lien.type}`, { nom: ami.nom });
  }
  return { statut, aide, bouton };
}

/**
 * Actualisation d'une page (Amis, classement entre amis) : charger() tout de
 * suite, puis toutes les AMIS_ACTUALISER_S secondes tant que la page est
 * visible (arrêt quand l'onglet est caché, reprise dès son retour). Le bouton
 * « Actualiser » relance au plus toutes les AMIS_ACTUALISER_MIN_S secondes ;
 * pendant ce délai, il est grisé avec un compte à rebours et ne fait aucune
 * requête. charger() renvoie { attendre } quand le serveur a refusé une
 * lecture trop rapprochée : nouvel essai après ce délai.
 * Renvoie { relancer(), arreter() }.
 */
export function actualisation(charger, { bouton, t }) {
  let dernier = 0;
  let minuteurAuto = 0;
  let minuteurBouton = 0;
  let actif = true;
  let enCours = false;

  const majBouton = () => {
    if (!bouton) return;
    clearTimeout(minuteurBouton);
    const reste = Math.ceil((dernier + R.AMIS_ACTUALISER_MIN_S * 1000 - Date.now()) / 1000);
    bouton.disabled = reste > 0 || enCours;
    bouton.textContent = reste > 0 ? t('amis.actualiserDans', { n: reste }) : t('amis.actualiser');
    if (reste > 0) minuteurBouton = setTimeout(majBouton, 1000);
  };

  const programmer = (ms) => {
    clearTimeout(minuteurAuto);
    if (actif && document.visibilityState === 'visible') minuteurAuto = setTimeout(lancer, ms);
  };

  async function lancer() {
    if (!actif || enCours) return;
    clearTimeout(minuteurAuto);
    enCours = true;
    dernier = Date.now();
    majBouton();
    let r = null;
    try { r = await charger(); } catch (e) { console.warn(e); }
    enCours = false;
    majBouton();
    if (r?.arreter) { actif = false; return; }              // panne : plus d'actualisation automatique
    programmer(r?.attendre ? Math.max(1000, r.attendre) : R.AMIS_ACTUALISER_S * 1000);
  }

  bouton?.addEventListener('click', () => {
    if (Date.now() - dernier < R.AMIS_ACTUALISER_MIN_S * 1000) return;   // aucune requête pendant le délai
    actif = true;
    lancer();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { clearTimeout(minuteurAuto); return; }
    if (!actif) return;
    const ecoule = Date.now() - dernier;
    if (ecoule >= R.AMIS_ACTUALISER_S * 1000) lancer(); else programmer(R.AMIS_ACTUALISER_S * 1000 - ecoule);
  });
  lancer();
  return {
    // Autre choix affiché (période, périmètre) : nouvelle lecture tout de suite.
    forcer() { actif = true; lancer(); },
    arreter() { actif = false; clearTimeout(minuteurAuto); },
  };
}
