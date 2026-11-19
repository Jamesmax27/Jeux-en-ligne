// ==========================================================================
// Free Micro Games — sauvegardes des jeux d'un appareil à l'autre
// (docs/cadrage-fidelisation.md, section 14.13 ; réglages : public/profil-reglages.js)
//
// La sauvegarde de chaque jeu reste dans le localStorage du site, sous
// « save_<id> » (écrite par le lanceur, public/play.js, d'après save.js).
// Ce module retient seulement, pour chaque jeu, où en est l'appareil par
// rapport au serveur (localStorage « fmg-sauvegardes ») :
//   b : version du serveur que l'appareil a reçue ou fait accepter en dernier ;
//   a : 1 si la sauvegarde a changé sur l'appareil depuis (à envoyer) ;
//   e : empreinte du dernier contenu envoyé sans réponse lue (sendBeacon,
//       réseau coupé) : le serveur reconnaît ainsi son propre envoi.
// Les envois partent avec ceux du profil (public/profil.js : « sync ») ; la
// lecture au lancement d'un jeu passe par profil.js (« sauvegarde »).
//
// Règle (choix du propriétaire, 19 novembre 2026), appliquée par le serveur
// (functions/_profil.js, fusionnerSauvegarde) :
//   - un seul appareil a changé la sauvegarde depuis la dernière synchronisation :
//     son contenu gagne, même plus bas (« Nouvelle partie »), effacement compris ;
//   - les deux ont changé (conflit) : la plus avancée gagne (niveau, puis
//     score, puis date) ; une sauvegarde qui existe bat un effacement.
//
// Aucun accès au navigateur en dehors des fonctions : le serveur importe aussi
// ce fichier (empreinteSauvegarde, lireRang).
// ==========================================================================

import * as R from './profil-reglages.js';

const CLE = 'fmg-sauvegardes';
const PREFIXE = 'save_';
const ID_JEU = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAUVEGARDE_MAX = 100000; // caractères (même limite que save.js et le lanceur)

// --- Outils communs (navigateur et serveur) ---------------------------------------------

/** Empreinte courte d'un contenu de sauvegarde (FNV-1a 32 bits + longueur) ; « x » = effacée. */
export function empreinteSauvegarde(texte) {
  if (typeof texte !== 'string') return 'x';
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(36)}.${texte.length.toString(36)}`;
}

/**
 * Rang d'une sauvegarde pour départager un conflit : { niveau, score, date },
 * lus comme save.js les lit ; null si le texte n'est pas une sauvegarde de save.js.
 */
export function lireRang(texte) {
  if (typeof texte !== 'string') return null;
  let d;
  try { d = JSON.parse(texte); } catch { return null; }
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.v !== 1) return null;
  const niveau = Number.isInteger(d.niveau) && d.niveau >= 1 ? d.niveau : 1;
  const score = typeof d.score === 'number' && Number.isFinite(d.score) ? d.score : 0;
  const date = typeof d.date === 'number' && Number.isFinite(d.date) ? d.date : 0;
  return { niveau, score, date };
}

/** Ce jeu garde-t-il sa sauvegarde sur l'appareil seulement ? */
export const horsNuage = (jeu) => R.SAUVEGARDES_HORS_NUAGE.includes(jeu);

// --- Copie locale ---------------------------------------------------------------------------

function lireSuivi() {
  try {
    const d = JSON.parse(localStorage.getItem(CLE) || 'null');
    if (d && typeof d === 'object' && d.jeux && typeof d.jeux === 'object') return d;
  } catch { /* stockage refusé ou illisible */ }
  return { jeux: {}, vu: false };
}

function ecrireSuivi(s) {
  try { localStorage.setItem(CLE, JSON.stringify(s)); } catch { /* tant pis : tout repartira au prochain envoi */ }
}

function lireSave(jeu) {
  try { const v = localStorage.getItem(PREFIXE + jeu); return typeof v === 'string' ? v : null; } catch { return null; }
}

function ecrireSave(jeu, valeur) {
  try {
    if (valeur === null) localStorage.removeItem(PREFIXE + jeu);
    else if (typeof valeur === 'string' && valeur.length <= SAUVEGARDE_MAX) localStorage.setItem(PREFIXE + jeu, valeur);
    else return false;
    return true;
  } catch { return false; }
}

// Première fois sur cet appareil (ou après un changement de profil) : toutes les
// sauvegardes déjà présentes sont à envoyer, sans version connue du serveur.
function preparer(s) {
  if (s.vu) return s;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i);
      if (!cle || !cle.startsWith(PREFIXE)) continue;
      const jeu = cle.slice(PREFIXE.length);
      if (!ID_JEU.test(jeu) || horsNuage(jeu) || s.jeux[jeu]) continue;
      s.jeux[jeu] = { b: 0, a: 1 };
    }
  } catch { /* stockage refusé */ }
  s.vu = true;
  ecrireSuivi(s);
  return s;
}

/** Le lanceur a écrit ou effacé la sauvegarde de ce jeu : elle est à envoyer. */
export function noter(jeu) {
  if (!ID_JEU.test(jeu) || horsNuage(jeu)) return;
  const s = lireSuivi();
  s.jeux[jeu] = { ...(s.jeux[jeu] || { b: 0 }), a: 1 };
  ecrireSuivi(s);
}

/** Y a-t-il des sauvegardes à envoyer ? */
export function enAttente() {
  const s = preparer(lireSuivi());
  return Object.values(s.jeux).some((x) => x.a);
}

// Article envoyé au serveur pour un jeu à envoyer (contenu actuel de l'appareil).
function article(s, jeu) {
  const x = s.jeux[jeu];
  const donnees = lireSave(jeu);
  return { jeu, base: x.b || 0, donnees, ...(x.e ? { envoye: x.e } : {}) };
}

/**
 * Sauvegardes à joindre à un envoi : [{ jeu, base, donnees, envoye? }], au plus
 * SAUVEGARDES_PAR_ENVOI et « taille » caractères. Les contenus envoyés sont
 * notés (empreinte e) : sans réponse, le serveur reconnaîtra son propre envoi.
 * Une sauvegarde trop grosse pour le serveur reste sur l'appareil.
 */
export function aEnvoyer(taille = R.SAUVEGARDES_TAILLE_ENVOI) {
  const s = preparer(lireSuivi());
  const liste = [];
  let total = 0;
  for (const jeu of Object.keys(s.jeux)) {
    if (!s.jeux[jeu].a) continue;
    if (horsNuage(jeu)) { delete s.jeux[jeu]; continue; }
    const a = article(s, jeu);
    const longueur = a.donnees ? a.donnees.length : 0;
    if (longueur > R.SAUVEGARDE_SERVEUR_MAX) { s.jeux[jeu].a = 0; continue; }
    if (liste.length >= R.SAUVEGARDES_PAR_ENVOI || total + longueur > taille) continue;
    total += longueur;
    liste.push(a);
  }
  ecrireSuivi(s);
  return liste;
}

/** Les articles sont partis (ou vont partir) : leur empreinte est gardée jusqu'à la réponse. */
export function noterEnvoi(liste) {
  if (!liste.length) return;
  const s = lireSuivi();
  for (const a of liste) if (s.jeux[a.jeu]) s.jeux[a.jeu].e = empreinteSauvegarde(a.donnees);
  ecrireSuivi(s);
}

/**
 * Article de la lecture au lancement d'un jeu : la sauvegarde de l'appareil si
 * elle attend d'être envoyée, sinon seulement la version connue (lire: true).
 * null si le jeu garde sa sauvegarde sur l'appareil.
 */
export function articleLancement(jeu) {
  if (!ID_JEU.test(jeu) || horsNuage(jeu)) return null;
  const s = preparer(lireSuivi());
  const x = s.jeux[jeu];
  if (x?.a) {
    const a = article(s, jeu);
    if ((a.donnees?.length || 0) > R.SAUVEGARDE_SERVEUR_MAX) return null;
    return a;
  }
  return { jeu, base: x?.b || 0, lire: true };
}

/**
 * Réponse du serveur : [{ jeu, statut, version, donnees? }] pour les articles
 * « envoyes » (même ordre ou non). statut :
 *   ok        contenu de l'appareil gardé (ou déjà identique) : version notée ;
 *   perdu     le serveur garde une autre sauvegarde (donnees : texte, ou null = effacée),
 *             recopiée sur l'appareil si celui-ci n'a pas écrit entre-temps ;
 *   refuse    jeu inconnu ou sauvegarde illisible : elle reste sur l'appareil ;
 *   reessayer écriture concurrente d'un autre appareil : renvoyée au prochain envoi.
 * tardive : la réponse arrive après le démarrage du jeu (le jeu tourne déjà
 * avec la sauvegarde de l'appareil) : rien n'est recopié, la lecture suivante s'en chargera.
 * Renvoie la liste des jeux dont la sauvegarde de l'appareil a été remplacée.
 */
export function appliquer(resultats, envoyes, { tardive = false } = {}) {
  if (!Array.isArray(resultats)) return [];
  const parJeu = new Map(envoyes.map((a) => [a.jeu, a]));
  const s = lireSuivi();
  const remplaces = [];
  for (const r of resultats) {
    const envoye = parJeu.get(r?.jeu);
    if (!envoye) continue;
    const x = s.jeux[r.jeu] || (s.jeux[r.jeu] = { b: 0, a: 0 });
    const actuel = lireSave(r.jeu);
    // L'appareil a-t-il écrit depuis que l'article est parti ?
    const inchange = envoye.lire ? !x.a : actuel === envoye.donnees;
    if (r.statut === 'refuse') {
      if (inchange) { x.a = 0; delete x.e; }
      continue;
    }
    if (r.statut === 'reessayer' || !Number.isInteger(r.version) || r.version < 0) continue;
    if (r.statut === 'ok') {
      x.b = r.version;
      delete x.e;
      if (inchange) x.a = 0;
      continue;
    }
    if (r.statut !== 'perdu' || tardive) continue;
    if (!inchange) {
      // Le jeu a écrit pendant l'envoi : sa nouvelle sauvegarde partira sur cette version.
      x.b = r.version;
      delete x.e;
      continue;
    }
    const donnees = typeof r.donnees === 'string' ? r.donnees : null;
    if (donnees !== actuel && !ecrireSave(r.jeu, donnees)) continue;
    if (donnees !== actuel) remplaces.push(r.jeu);
    x.b = r.version;
    x.a = 0;
    delete x.e;
  }
  ecrireSuivi(s);
  return remplaces;
}

/**
 * Nouveau profil sur cet appareil (code de sauvegarde saisi, profil recréé) :
 * plus aucune version connue ; toutes les sauvegardes de l'appareil repartent,
 * fusionnées avec celles du profil (la plus avancée de chaque jeu gagne).
 */
export function oublier() {
  ecrireSuivi({ jeux: {}, vu: false });
}
