// ==========================================================================
// Profil joueur (fidélisation) — logique du serveur, partagée par
// functions/api/profil.js, profil-multi.js, classement.js, stats-jour.js et
// idees.js. Ce fichier n'exporte aucun onRequest… : il ne crée aucune adresse.
// Référence : docs/cadrage-fidelisation.md ; réglages : public/profil-reglages.js.
//
// La base D1 est la source de vérité : identifiant, pseudo, avatar, XP,
// niveau, badges, jeux joués et terminés, étoiles, série de jours, dernière
// visite. Le navigateur n'en garde qu'une copie (public/profil.js).
// Aucune donnée personnelle : un profil est un numéro, un pseudo (par défaut
// « Joueur <nombre> »), un avatar et des compteurs. Les appareils reliés au
// profil ne sont connus que par l'empreinte SHA-256 de leur jeton secret.
// Les limites anti-robots utilisent l'empreinte de l'adresse IP (comme les
// votes), jamais l'adresse elle-même.
//
// Tables (créées automatiquement par preparerTablesProfil ; référence :
// migrations/0002_profils.sql) :
//   profils              un profil par joueur
//   profils_appareils    jeton (empreinte) de chaque appareil → profil
//   profils_jeux         temps, fin et meilleures étoiles par profil et par jeu
//   profils_gains        gains par profil et par jour UTC (classements, plafonds)
//   profils_jours        jours de visite (jour de l'appareil) : série, indicateurs
//   multi_resultats      une ligne par manche en ligne et par joueur (anti-doublon)
//   profils_limites      traces des limites anti-robots (2 jours)
//   profils_blocages     blocages progressifs des essais de code
//   profils_signalements signalements de pseudos
//   profils_evenements   compteurs par jour (codes créés, restaurations, profils créés)
//   fidelisation_jour    indicateurs de fidélisation, un calcul par jour
//   amis, amis_reglages  amitiés, demandes, blocages, mode invisible (functions/_amis.js,
//                        docs/consigne-amis.md ; migrations/0003_amis.sql)
// ==========================================================================

import * as R from '../public/profil-reglages.js';
import { nouveauCode, lireCode } from '../public/profil-code.js';
import { pseudoInterdit } from './_pseudos-interdits.js';

const JOUR_MS = 86400000;
export const ID_JEU = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const JETON = /^[A-Za-z0-9_-]{32,80}$/;

// --- Tables ------------------------------------------------------------------

let tablesPretes = null;

export function preparerTablesProfil(env) {
  if (!tablesPretes) {
    tablesPretes = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS profils (
        id INTEGER PRIMARY KEY, code TEXT UNIQUE, numero INTEGER NOT NULL,
        pseudo TEXT, pseudo_norm TEXT UNIQUE, avatar TEXT NOT NULL DEFAULT 'chat', cadre TEXT NOT NULL DEFAULT 'aucun',
        xp INTEGER NOT NULL DEFAULT 0, niveau INTEGER NOT NULL DEFAULT 1, badges TEXT NOT NULL DEFAULT '[]',
        serie INTEGER NOT NULL DEFAULT 0, serie_record INTEGER NOT NULL DEFAULT 0, dernier_jour TEXT, premier_jour TEXT,
        multi TEXT NOT NULL DEFAULT '{}', cree_le INTEGER NOT NULL, vu_le INTEGER NOT NULL, sync_le INTEGER NOT NULL)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS profils_vu ON profils (vu_le)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS profils_appareils (
        jeton TEXT PRIMARY KEY, profil INTEGER NOT NULL, cree_le INTEGER NOT NULL) WITHOUT ROWID`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS profils_appareils_profil ON profils_appareils (profil, cree_le)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS profils_jeux (
        profil INTEGER NOT NULL, jeu TEXT NOT NULL, secondes INTEGER NOT NULL DEFAULT 0,
        premiere INTEGER NOT NULL, derniere INTEGER NOT NULL, termine INTEGER, etoiles INTEGER, etoiles_max INTEGER,
        PRIMARY KEY (profil, jeu)) WITHOUT ROWID`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS profils_gains (
        profil INTEGER NOT NULL, jour TEXT NOT NULL, secondes INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0,
        etoiles INTEGER NOT NULL DEFAULT 0, termines INTEGER NOT NULL DEFAULT 0, multi_xp INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (profil, jour)) WITHOUT ROWID`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS profils_gains_jour ON profils_gains (jour, profil, xp, etoiles)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS profils_jours (profil INTEGER NOT NULL, jour TEXT NOT NULL, PRIMARY KEY (profil, jour)) WITHOUT ROWID'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS profils_jours_jour ON profils_jours (jour, profil)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS multi_resultats (
        partie TEXT NOT NULL, profil INTEGER NOT NULL, jeu TEXT NOT NULL, jour TEXT NOT NULL,
        victoire INTEGER NOT NULL, humains INTEGER NOT NULL, duree INTEGER NOT NULL, actions INTEGER NOT NULL,
        xp INTEGER NOT NULL, cree_le INTEGER NOT NULL, PRIMARY KEY (partie, profil)) WITHOUT ROWID`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS multi_resultats_jeu ON multi_resultats (jeu, jour, profil, xp)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS profils_limites (visiteur TEXT NOT NULL, quoi TEXT NOT NULL, date INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS profils_limites_visiteur ON profils_limites (visiteur, quoi, date)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS profils_blocages (
        visiteur TEXT PRIMARY KEY, jusqu_a INTEGER NOT NULL, rang INTEGER NOT NULL, maj INTEGER NOT NULL) WITHOUT ROWID`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS profils_signalements (
        profil INTEGER NOT NULL, auteur INTEGER NOT NULL, date INTEGER NOT NULL, PRIMARY KEY (profil, auteur)) WITHOUT ROWID`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS profils_evenements (
        jour TEXT NOT NULL, type TEXT NOT NULL, nombre INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (jour, type)) WITHOUT ROWID`),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS fidelisation_jour (jour TEXT PRIMARY KEY, donnees TEXT NOT NULL, calcule_le INTEGER NOT NULL) WITHOUT ROWID'),
      // Amis (functions/_amis.js, docs/consigne-amis.md) : une ligne par profil et par autre profil.
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS amis (
        profil INTEGER NOT NULL, autre INTEGER NOT NULL, etat TEXT NOT NULL, cree_le INTEGER NOT NULL, maj_le INTEGER NOT NULL,
        PRIMARY KEY (profil, autre)) WITHOUT ROWID`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS amis_etat ON amis (etat, maj_le)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS amis_reglages (profil INTEGER PRIMARY KEY, invisible INTEGER NOT NULL DEFAULT 0, maj_le INTEGER NOT NULL) WITHOUT ROWID'),
    ]).catch((erreur) => {
      tablesPretes = null; // nouvel essai à la prochaine requête
      throw erreur;
    });
  }
  return tablesPretes;
}

// --- Dates ---------------------------------------------------------------------

export const jourUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Jours entre deux dates « AAAA-MM-JJ » (b − a). */
export function ecartJours(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / JOUR_MS);
}

/** Jour de l'appareil acceptable : bien écrit et à un jour au plus de la date UTC (tous les fuseaux réels). */
export function jourAcceptable(jour, maintenant) {
  if (typeof jour !== 'string' || !JOUR.test(jour) || Number.isNaN(Date.parse(`${jour}T00:00:00Z`))) return false;
  return Math.abs(ecartJours(jourUTC(maintenant), jour)) <= 1;
}

/** Début de la période de classement (jour UTC « AAAA-MM-JJ ») : semaine (lundi) ou mois. */
export function debutPeriode(periode, maintenant) {
  const d = new Date(maintenant);
  if (periode === 'mois') return `${d.toISOString().slice(0, 7)}-01`;
  const recul = (d.getUTCDay() - R.CLASSEMENT_SEMAINE_DEBUT + 7) % 7;
  return jourUTC(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - recul * JOUR_MS);
}

// --- Empreintes ----------------------------------------------------------------

export async function empreinte(texte) {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fmg/profil/${texte}`));
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

/** Jeton secret d'un appareil : 32 octets tirés au hasard, en base64url. */
export function nouveauJeton() {
  const octets = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// --- Lecture ---------------------------------------------------------------------

export async function profilParJeton(env, jeton) {
  if (typeof jeton !== 'string' || !JETON.test(jeton)) return null;
  return env.DB.prepare(`SELECT p.* FROM profils_appareils a JOIN profils p ON p.id = a.profil WHERE a.jeton = ?`)
    .bind(await empreinte(jeton)).first();
}

async function jeuxDuProfil(env, id) {
  const { results } = await env.DB.prepare('SELECT * FROM profils_jeux WHERE profil = ?').bind(id).all();
  return new Map((results || []).map((r) => [r.jeu, { ...r }]));
}

async function gainsDuJour(env, id, jour) {
  const ligne = await env.DB.prepare('SELECT * FROM profils_gains WHERE profil = ? AND jour = ?').bind(id, jour).first();
  return ligne || { secondes: 0, xp: 0, etoiles: 0, termines: 0, multi_xp: 0 };
}

function lireJson(texte, defaut) {
  try { const v = JSON.parse(texte); return v && typeof v === 'object' ? v : defaut; } catch { return defaut; }
}

const lireBadges = (profil) => (Array.isArray(lireJson(profil.badges, [])) ? lireJson(profil.badges, []) : []);
const lireMulti = (profil) => ({ parties: 0, victoires: 0, humains: 0, robots: 0, serie: 0, serieMax: 0, ...lireJson(profil.multi, {}) });

/**
 * Résumé des amis d'un profil, gardé avec l'état sur l'appareil : nombre
 * d'amis (la présence n'est envoyée que s'il y en a au moins un), demandes
 * reçues sans réponse (pastille), mode invisible. Une seule lecture.
 */
export async function resumeAmis(env, id) {
  const l = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM amis WHERE profil = ?1 AND etat = 'ami') AS amis,
      (SELECT COUNT(*) FROM amis WHERE profil = ?1 AND etat = 'recue') AS recues,
      (SELECT invisible FROM amis_reglages WHERE profil = ?1) AS invisible`).bind(id).first();
  return { amis: l?.amis || 0, recues: l?.recues || 0, invisible: l?.invisible === 1 };
}

/** État public du profil, renvoyé au navigateur (public/profil.js le garde en cache). */
export function etatPublic(profil, jeux, gains, amis = null) {
  const niveau = R.niveauPourXp(profil.xp);
  return {
    id: profil.id,
    pseudo: profil.pseudo || null,
    numero: profil.numero,
    avatar: profil.avatar,
    cadre: profil.cadre,
    xp: profil.xp,
    niveau,
    seuil: R.seuilNiveau(niveau),
    suivant: niveau < R.NIVEAU_MAX ? R.seuilNiveau(niveau + 1) : null,
    badges: lireBadges(profil).map(([id, date]) => ({ id, date })),
    serie: profil.serie,
    serieRecord: profil.serie_record,
    dernierJour: profil.dernier_jour,
    multi: lireMulti(profil),
    aCode: !!profil.code,
    jeux: [...jeux.values()]
      .sort((a, b) => b.derniere - a.derniere)
      .map((j) => ({ id: j.jeu, secondes: j.secondes, premiere: j.premiere, derniere: j.derniere, termine: j.termine || null, etoiles: j.etoiles ?? null, max: j.etoiles_max ?? null })),
    aujourdhui: { jour: gains.jour || null, secondes: gains.secondes, xp: gains.xp, multiXp: gains.multi_xp, termines: gains.termines },
    amis: amis || { amis: 0, recues: 0, invisible: false },
  };
}

export async function etatComplet(env, profil, maintenant) {
  const jour = jourUTC(maintenant);
  const [jeux, gains, amis] = await Promise.all([jeuxDuProfil(env, profil.id), gainsDuJour(env, profil.id, jour), resumeAmis(env, profil.id)]);
  return etatPublic(profil, jeux, { ...gains, jour }, amis);
}

// --- Badges --------------------------------------------------------------------------

/** Badges mérités d'après les compteurs (ensemble d'id), voir listeBadges() des réglages. */
export function badgesMerites({ termines, etoiles, parfait, serieRecord, niveau, multi }) {
  const ids = new Set();
  for (const s of R.PALIERS_TERMINES) if (termines >= s) ids.add(`collection-${s}`);
  if (parfait) ids.add('etoiles-parfait');
  for (const s of R.PALIERS_ETOILES) if (etoiles >= s) ids.add(`etoiles-${s}`);
  for (const s of R.PALIERS_SERIE) if (serieRecord >= s) ids.add(`serie-${s}`);
  for (const s of R.PALIERS_NIVEAU) if (niveau >= s) ids.add(`niveau-${s}`);
  for (const s of R.PALIERS_MULTI_PARTIES) if (multi.parties >= s) ids.add(`multi-parties-${s}`);
  for (const s of R.PALIERS_MULTI_VICTOIRES) if (multi.victoires >= s) ids.add(`multi-victoires-${s}`);
  for (const s of R.PALIERS_MULTI_HUMAINS) if (multi.humains >= s) ids.add(`multi-humains-${s}`);
  if (multi.robots >= 1) ids.add('multi-robot');
  if (multi.serieMax >= R.SERIE_MULTI_VICTOIRES) ids.add('multi-serie');
  return ids;
}

function compteursJeux(jeux) {
  let termines = 0;
  let etoiles = 0;
  let parfait = false;
  for (const j of jeux.values()) {
    if (!j.termine) continue;
    termines++;
    if (Number.isInteger(j.etoiles_max) && j.etoiles_max > 0) {
      etoiles += j.etoiles || 0;
      if (j.etoiles >= j.etoiles_max) parfait = true;
    }
  }
  return { termines, etoiles, parfait };
}

/** Ajoute les badges mérités qui manquent ; renvoie { liste (JSON), nouveaux: [id] }. */
function majBadges(profil, merites, maintenant) {
  const liste = lireBadges(profil);
  const deja = new Set(liste.map(([id]) => id));
  const nouveaux = R.listeBadges().map((b) => b.id).filter((id) => merites.has(id) && !deja.has(id));
  for (const id of nouveaux) liste.push([id, maintenant]);
  return { liste: JSON.stringify(liste), nouveaux };
}

// --- Écritures communes ---------------------------------------------------------------

function ecrireGains(env, id, jour, g) {
  return env.DB.prepare(`INSERT INTO profils_gains (profil, jour, secondes, xp, etoiles, termines, multi_xp) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (profil, jour) DO UPDATE SET secondes = secondes + excluded.secondes, xp = xp + excluded.xp,
      etoiles = etoiles + excluded.etoiles, termines = termines + excluded.termines, multi_xp = multi_xp + excluded.multi_xp`)
    .bind(id, jour, g.secondes || 0, g.xp || 0, g.etoiles || 0, g.termines || 0, g.multi_xp || 0);
}

function ecrireJeu(env, id, j) {
  return env.DB.prepare(`INSERT INTO profils_jeux (profil, jeu, secondes, premiere, derniere, termine, etoiles, etoiles_max) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (profil, jeu) DO UPDATE SET secondes = excluded.secondes, derniere = excluded.derniere, termine = excluded.termine,
      etoiles = excluded.etoiles, etoiles_max = excluded.etoiles_max`)
    .bind(id, j.jeu, j.secondes, j.premiere, j.derniere, j.termine ?? null, j.etoiles ?? null, j.etoiles_max ?? null);
}

export function compterEvenement(env, type, maintenant, nombre = 1) {
  return env.DB.prepare(`INSERT INTO profils_evenements (jour, type, nombre) VALUES (?, ?, ?)
    ON CONFLICT (jour, type) DO UPDATE SET nombre = nombre + excluded.nombre`).bind(jourUTC(maintenant), type, nombre);
}

// --- Création ---------------------------------------------------------------------------

/** Crée un profil et le premier appareil. Renvoie { jeton, profil }. */
export async function creerProfil(env, { jour }, maintenant) {
  const jeton = nouveauJeton();
  const numero = R.NUMERO_MIN + (crypto.getRandomValues(new Uint32Array(1))[0] % (R.NUMERO_MAX - R.NUMERO_MIN + 1));
  const premier = jourAcceptable(jour, maintenant) ? jour : null;
  const ligne = await env.DB.prepare(`INSERT INTO profils (numero, cree_le, vu_le, sync_le, dernier_jour, premier_jour, serie, serie_record)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
    .bind(numero, maintenant, maintenant, maintenant, premier, premier || jourUTC(maintenant), premier ? 1 : 0, premier ? 1 : 0).first();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO profils_appareils (jeton, profil, cree_le) VALUES (?, ?, ?)').bind(await empreinte(jeton), ligne.id, maintenant),
    ...(premier ? [env.DB.prepare('INSERT OR IGNORE INTO profils_jours (profil, jour) VALUES (?, ?)').bind(ligne.id, premier)] : []),
    compterEvenement(env, 'profil', maintenant),
  ]);
  return { jeton, profil: ligne };
}

/** Relie un nouvel appareil au profil (code de sauvegarde). Garde APPAREILS_MAX appareils. */
export async function ajouterAppareil(env, profilId, maintenant) {
  const jeton = nouveauJeton();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO profils_appareils (jeton, profil, cree_le) VALUES (?, ?, ?)').bind(await empreinte(jeton), profilId, maintenant),
    env.DB.prepare(`DELETE FROM profils_appareils WHERE profil = ? AND jeton NOT IN
      (SELECT jeton FROM profils_appareils WHERE profil = ? ORDER BY cree_le DESC LIMIT ?)`).bind(profilId, profilId, R.APPAREILS_MAX),
    compterEvenement(env, 'restauration', maintenant),
  ]);
  return jeton;
}

/** Code de sauvegarde du profil (créé s'il n'existe pas). */
export async function codeDuProfil(env, profil, maintenant) {
  if (profil.code) return { code: profil.code, nouveau: false };
  for (let essai = 0; essai < 5; essai++) {
    const code = nouveauCode();
    try {
      const r = await env.DB.prepare('UPDATE profils SET code = ? WHERE id = ? AND code IS NULL').bind(code, profil.id).run();
      if (r.meta?.changes === 1) {
        await compterEvenement(env, 'code', maintenant).run();
        return { code, nouveau: true };
      }
      const relu = await env.DB.prepare('SELECT code FROM profils WHERE id = ?').bind(profil.id).first();
      if (relu?.code) return { code: relu.code, nouveau: false };
    } catch (erreur) {
      if (!/UNIQUE/i.test(String(erreur?.message || erreur))) throw erreur; // code déjà pris : on en tire un autre
    }
  }
  throw new Error('code de sauvegarde impossible à créer');
}

/** Profil d'un code tapé (déjà contrôlé par lireCode). */
export function profilParCode(env, code) {
  return env.DB.prepare('SELECT * FROM profils WHERE code = ?').bind(code).first();
}

export { lireCode };

// --- Synchronisation ------------------------------------------------------------------------

function entier(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max ? v : null;
}

/**
 * Applique un envoi du navigateur : jour de visite (série), temps de jeu,
 * jeux terminés et étoiles. catalogue : Map id → entrée de catalog.json.
 * corps : { jour, temps: [{ jeu, secondes }], termines: [{ jeu, etoiles, max }] }.
 * Renvoie { etat, gains }.
 */
export async function synchroniser(env, profil, corps, catalogue, maintenant) {
  const jourU = jourUTC(maintenant);
  const [jeux, gainsJour, amis] = await Promise.all([jeuxDuProfil(env, profil.id), gainsDuJour(env, profil.id, jourU), resumeAmis(env, profil.id)]);
  const ajout = { secondes: 0, xp: 0, etoiles: 0, termines: 0, multi_xp: 0 };
  const modifies = new Set();
  const p = { ...profil };
  const gains = { xp: 0, niveauAvant: R.niveauPourXp(profil.xp), niveau: 0, badges: [], termines: [], bienvenue: null };
  const connu = (id) => typeof id === 'string' && ID_JEU.test(id) && (!catalogue || catalogue.has(id));

  // 1. Jour de visite : série de jours consécutifs, bonus du retour quotidien.
  let nouveauJour = false;
  if (jourAcceptable(corps.jour, maintenant) && (!p.dernier_jour || corps.jour > p.dernier_jour)) {
    const ecart = p.dernier_jour ? ecartJours(p.dernier_jour, corps.jour) : null;
    p.serie = ecart !== null && ecart <= 1 + R.JOURS_MANQUES_TOLERES ? p.serie + 1 : 1;
    p.serie_record = Math.max(p.serie_record, p.serie);
    let bonus = p.serie >= 2 ? Math.min(p.serie * R.BONUS_SERIE_PAR_JOUR, R.BONUS_SERIE_MAX) : 0;
    if (R.PALIERS_SERIE.includes(p.serie)) bonus += R.BONUS_PALIER_SERIE;
    ajout.xp += bonus;
    p.dernier_jour = corps.jour;
    nouveauJour = true;
    gains.bienvenue = { serie: p.serie, bonus, absence: ecart };
  }

  // 2. Temps de jeu : jamais plus que le temps écoulé depuis l'envoi précédent ;
  //    XP plafonnée par jour (MINUTES_MAX_JOUR).
  const temps = (Array.isArray(corps.temps) ? corps.temps : []).slice(0, 50)
    .map((t) => ({ jeu: t?.jeu, secondes: entier(t?.secondes, 1, R.SECONDES_MAX_ENVOI) }))
    .filter((t) => connu(t.jeu) && t.secondes);
  const declare = temps.reduce((s, t) => s + t.secondes, 0);
  if (declare > 0) {
    const ecoule = Math.max(0, (maintenant - profil.sync_le) / 1000) + R.TOLERANCE_TEMPS_S;
    const reel = Math.min(declare, ecoule, R.SECONDES_MAX_ENVOI);
    for (const t of temps) {
      const s = Math.floor((t.secondes * reel) / declare);
      if (s <= 0) continue;
      const j = jeux.get(t.jeu) || { jeu: t.jeu, secondes: 0, premiere: maintenant, derniere: maintenant, termine: null, etoiles: null, etoiles_max: null };
      j.secondes += s;
      j.derniere = maintenant;
      jeux.set(t.jeu, j);
      modifies.add(t.jeu);
    }
    const credite = Math.max(0, Math.min(Math.floor(reel), R.MINUTES_MAX_JOUR * 60 - gainsJour.secondes));
    ajout.secondes += credite;
    ajout.xp += (Math.floor((gainsJour.secondes + credite) / 60) - Math.floor(gainsJour.secondes / 60)) * R.XP_PAR_MINUTE;
  }

  // 3. Jeux terminés (message « jeu terminé » du jeu, FMG.reportComplete) et étoiles.
  for (const t of (Array.isArray(corps.termines) ? corps.termines : []).slice(0, 20)) {
    const resultat = { jeu: typeof t?.jeu === 'string' ? t.jeu.slice(0, 80) : '', statut: 'refuse', xp: 0 };
    gains.termines.push(resultat);
    if (!connu(t?.jeu)) continue;
    const fiche = catalogue?.get(t.jeu) || {};
    if (fiche.sans_fin === true) continue;
    const declareMax = Number.isInteger(fiche.etoiles) && fiche.etoiles > 0 ? fiche.etoiles : null;
    let max = t.max == null ? null : entier(t.max, 1, R.ETOILES_MAX_JEU);
    let etoiles = t.etoiles == null ? null : entier(t.etoiles, 0, R.ETOILES_MAX_JEU);
    if ((t.max != null && max === null) || (t.etoiles != null && etoiles === null) || (max === null) !== (etoiles === null)) continue;
    if (declareMax !== null && max !== declareMax) continue;     // le jeu déclare ses étoiles possibles : elles doivent correspondre
    if (max !== null && etoiles > max) continue;                // jamais plus d'étoiles que possible
    const j = jeux.get(t.jeu) || { jeu: t.jeu, secondes: 0, premiere: maintenant, derniere: maintenant, termine: null, etoiles: null, etoiles_max: null };
    if (!j.termine) {
      if (j.secondes < R.DUREE_MIN_TERMINE_S) { resultat.statut = 'trop-court'; continue; }
      if (gainsJour.termines + ajout.termines >= R.TERMINES_MAX_JOUR) { resultat.statut = 'plafond'; continue; }
      j.termine = maintenant;
      ajout.termines++;
      resultat.xp += R.BONUS_TERMINE;
      resultat.statut = 'ok';
    } else {
      resultat.statut = 'deja';
    }
    if (max !== null) {
      if (j.etoiles_max !== max) j.etoiles_max = max;            // nombre d'étoiles du jeu changé : on garde le meilleur, borné
      const avant = Math.min(j.etoiles || 0, max);
      const gain = Math.max(0, etoiles - avant);
      j.etoiles = Math.max(avant, etoiles);
      ajout.etoiles += gain;
      resultat.xp += gain * R.XP_PAR_ETOILE;
    }
    j.derniere = maintenant;
    jeux.set(t.jeu, j);
    modifies.add(t.jeu);
    ajout.xp += resultat.xp;
  }

  // 4. Niveau et badges.
  p.xp = profil.xp + ajout.xp;
  p.niveau = R.niveauPourXp(p.xp);
  const merites = badgesMerites({ ...compteursJeux(jeux), serieRecord: p.serie_record, niveau: p.niveau, multi: lireMulti(p) });
  const badges = majBadges(p, merites, maintenant);
  p.badges = badges.liste;
  gains.xp = ajout.xp;
  gains.niveau = p.niveau;
  gains.badges = badges.nouveaux;

  // 5. Écritures (une transaction).
  const ecritures = [
    env.DB.prepare(`UPDATE profils SET xp = ?, niveau = ?, badges = ?, serie = ?, serie_record = ?, dernier_jour = ?, vu_le = ?, sync_le = ? WHERE id = ?`)
      .bind(p.xp, p.niveau, p.badges, p.serie, p.serie_record, p.dernier_jour, maintenant, maintenant, p.id),
    ...[...modifies].map((id) => ecrireJeu(env, p.id, jeux.get(id))),
  ];
  if (ajout.xp || ajout.secondes || ajout.etoiles || ajout.termines) ecritures.push(ecrireGains(env, p.id, jourU, ajout));
  if (nouveauJour) ecritures.push(env.DB.prepare('INSERT OR IGNORE INTO profils_jours (profil, jour) VALUES (?, ?)').bind(p.id, p.dernier_jour));
  await env.DB.batch(ecritures);

  const total = { ...gainsJour, jour: jourU };
  for (const k of Object.keys(ajout)) total[k] = (total[k] || 0) + ajout[k];
  return { etat: etatPublic(p, jeux, total, amis), gains };
}

// --- Apparence, pseudo -------------------------------------------------------------------------

export function choixPermis(liste, id, profil) {
  const badges = new Set(lireBadges(profil).map(([b]) => b));
  return R.estDebloque(liste.find((x) => x.id === id), R.niveauPourXp(profil.xp), badges);
}

const FORMES_PAR_DEFAUT = /^(joueur|joueuse|player|jugador|jugadora|jogador|jogadora|spieler|spielerin)\d*$/;

/** Forme comparée pour l'unicité : minuscules, sans accents, lettres et chiffres seulement. */
export function formeUnique(pseudo) {
  return String(pseudo).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
}

/**
 * Pseudo proposé : null s'il est accepté (avec { pseudo, norme }), sinon la raison :
 * 'longueur', 'caracteres', 'chiffres', 'grossier', 'reserve'. L'unicité est vérifiée à l'écriture.
 */
export function controlerPseudo(brut) {
  const pseudo = String(brut ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if ([...pseudo].length < R.PSEUDO_MIN || [...pseudo].length > R.PSEUDO_MAX) return { raison: 'longueur' };
  if (!/^[\p{L}\p{N}](?:[\p{L}\p{N} _-]*[\p{L}\p{N}])?$/u.test(pseudo)) return { raison: 'caracteres' };
  if (new RegExp(`\\d{${R.PSEUDO_CHIFFRES_MAX + 1}}`).test(pseudo)) return { raison: 'chiffres' };
  const norme = formeUnique(pseudo);
  if (norme.length < R.PSEUDO_MIN || FORMES_PAR_DEFAUT.test(norme)) return { raison: 'reserve' };
  const interdit = pseudoInterdit(pseudo);
  if (interdit) return { raison: interdit === 'reserve' ? 'reserve' : 'grossier' };
  return { raison: null, pseudo, norme };
}

// --- Limites anti-robots (empreinte de l'adresse) ------------------------------------------------

export async function compterLimite(env, visiteur, quoi, depuis) {
  if (!visiteur) return 0;
  const ligne = await env.DB.prepare('SELECT COUNT(*) AS n FROM profils_limites WHERE visiteur = ? AND quoi = ? AND date >= ?').bind(visiteur, quoi, depuis).first();
  return ligne?.n || 0;
}

export function noterLimite(env, visiteur, quoi, maintenant) {
  return env.DB.prepare('INSERT INTO profils_limites (visiteur, quoi, date) VALUES (?, ?, ?)').bind(visiteur || 'inconnu', quoi, maintenant);
}

/** Blocage en cours des essais de code : date de fin (ms) ou 0. */
export async function blocageCode(env, visiteur, maintenant) {
  if (!visiteur) return 0;
  const ligne = await env.DB.prepare('SELECT jusqu_a FROM profils_blocages WHERE visiteur = ?').bind(visiteur).first();
  return ligne && ligne.jusqu_a > maintenant ? ligne.jusqu_a : 0;
}

/**
 * Essai de code raté : noté ; au-delà de CODE_ESSAIS_RATES_HEURE dans l'heure, blocage
 * de plus en plus long (CODE_BLOCAGES_MINUTES). Renvoie la fin du blocage (ms) ou 0.
 */
export async function essaiRate(env, visiteur, maintenant) {
  await noterLimite(env, visiteur, 'code-rate', maintenant).run();
  if (!visiteur) return 0;
  const rates = await compterLimite(env, visiteur, 'code-rate', maintenant - 3600000);
  if (rates < R.CODE_ESSAIS_RATES_HEURE) return 0;
  const ligne = await env.DB.prepare('SELECT rang, maj FROM profils_blocages WHERE visiteur = ?').bind(visiteur).first();
  const oublie = !ligne || maintenant - ligne.maj > R.CODE_BLOCAGE_OUBLI_JOURS * JOUR_MS;
  const rang = oublie ? 0 : Math.min(ligne.rang + 1, R.CODE_BLOCAGES_MINUTES.length - 1);
  const jusqua = maintenant + R.CODE_BLOCAGES_MINUTES[rang] * 60000;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO profils_blocages (visiteur, jusqu_a, rang, maj) VALUES (?, ?, ?, ?)
      ON CONFLICT (visiteur) DO UPDATE SET jusqu_a = excluded.jusqu_a, rang = excluded.rang, maj = excluded.maj`).bind(visiteur, jusqua, rang, maintenant),
    env.DB.prepare("DELETE FROM profils_limites WHERE visiteur = ? AND quoi = 'code-rate'").bind(visiteur),
  ]);
  return jusqua;
}

// --- Multijoueur -----------------------------------------------------------------------------------

/**
 * Résultat d'une manche en ligne, envoyé par le Worker multijoueur (jamais par
 * le navigateur). r : { partie, profil, jeu, victoire, humains, duree, actions }.
 * Renvoie 'ok', 'deja' (déjà enregistré), 'court' (présence insuffisante),
 * 'inconnu' (profil ou jeu) ou 'invalide'.
 */
export async function appliquerResultatMulti(env, r, catalogue, maintenant) {
  if (!r || typeof r.partie !== 'string' || !r.partie || r.partie.length > 200) return 'invalide';
  if (!Number.isSafeInteger(r.profil) || r.profil <= 0 || typeof r.jeu !== 'string' || !ID_JEU.test(r.jeu)) return 'invalide';
  const humains = entier(r.humains, 1, 10);
  const duree = entier(r.duree, 0, 24 * 3600);
  const actions = entier(r.actions, 0, 100000);
  if (humains === null || duree === null || actions === null || typeof r.victoire !== 'boolean') return 'invalide';
  if (catalogue && catalogue.get(r.jeu)?.multijoueur !== true) return 'inconnu';
  if (duree < R.MULTI_DUREE_MIN_S || actions < R.MULTI_ACTIONS_MIN) return 'court';

  const profil = await env.DB.prepare('SELECT * FROM profils WHERE id = ?').bind(r.profil).first();
  if (!profil) return 'inconnu';
  if (await env.DB.prepare('SELECT 1 AS oui FROM multi_resultats WHERE partie = ? AND profil = ?').bind(r.partie, r.profil).first()) return 'deja';

  const jourU = jourUTC(maintenant);
  const gainsJour = await gainsDuJour(env, profil.id, jourU);
  const bareme = r.victoire ? (humains >= 2 ? R.MULTI_XP_VICTOIRE_HUMAINS : R.MULTI_XP_VICTOIRE_ROBOTS) : R.MULTI_XP_PARTICIPATION;
  const xp = Math.max(0, Math.min(bareme, R.MULTI_XP_MAX_JOUR - gainsJour.multi_xp));

  const multi = lireMulti(profil);
  multi.parties++;
  if (r.victoire) {
    multi.victoires++;
    if (humains >= 2) multi.humains++; else multi.robots++;
    multi.serie++;
    multi.serieMax = Math.max(multi.serieMax, multi.serie);
  } else {
    multi.serie = 0;
  }
  const p = { ...profil, xp: profil.xp + xp, multi: JSON.stringify(multi) };
  p.niveau = R.niveauPourXp(p.xp);
  const jeux = await jeuxDuProfil(env, profil.id);
  const merites = badgesMerites({ ...compteursJeux(jeux), serieRecord: p.serie_record, niveau: p.niveau, multi });
  p.badges = majBadges(p, merites, maintenant).liste;

  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO multi_resultats (partie, profil, jeu, jour, victoire, humains, duree, actions, xp, cree_le)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(r.partie, profil.id, r.jeu, jourU, r.victoire ? 1 : 0, humains, duree, actions, xp, maintenant),
    env.DB.prepare('UPDATE profils SET xp = ?, niveau = ?, badges = ?, multi = ? WHERE id = ?').bind(p.xp, p.niveau, p.badges, p.multi, p.id),
    ...(xp ? [ecrireGains(env, profil.id, jourU, { xp, multi_xp: xp })] : []),
  ]);
  return 'ok';
}

// --- Classement ----------------------------------------------------------------------------------------

/**
 * Points de la période par profil. perimetre : 'general' (XP gagnée),
 * 'etoiles' (étoiles gagnées) ou 'multi:<id du jeu>' (XP des manches en ligne de ce jeu).
 * Renvoie { sql, valeurs } d'une sous-requête (profil, points).
 */
export function requetePoints(perimetre, debut) {
  if (perimetre === 'general') return { sql: 'SELECT profil, SUM(xp) AS points FROM profils_gains WHERE jour >= ? GROUP BY profil', valeurs: [debut] };
  if (perimetre === 'etoiles') return { sql: 'SELECT profil, SUM(etoiles) AS points FROM profils_gains WHERE jour >= ? GROUP BY profil', valeurs: [debut] };
  const jeu = perimetre.slice('multi:'.length);
  return { sql: 'SELECT profil, SUM(xp) AS points FROM multi_resultats WHERE jeu = ? AND jour >= ? GROUP BY profil', valeurs: [jeu, debut] };
}

export function perimetreValide(perimetre, catalogue) {
  if (perimetre === 'general' || perimetre === 'etoiles') return true;
  if (typeof perimetre !== 'string' || !perimetre.startsWith('multi:')) return false;
  const jeu = perimetre.slice('multi:'.length);
  return ID_JEU.test(jeu) && (!catalogue || catalogue.get(jeu)?.multijoueur === true);
}

/** Top de la période : [{ rang, id, pseudo, numero, avatar, cadre, niveau, points }]. */
export async function topClassement(env, perimetre, debut) {
  const { sql, valeurs } = requetePoints(perimetre, debut);
  const { results } = await env.DB.prepare(`SELECT p.id, p.pseudo, p.numero, p.avatar, p.cadre, p.xp, g.points
    FROM (${sql}) g JOIN profils p ON p.id = g.profil
    WHERE g.points > 0 AND p.niveau >= ? ORDER BY g.points DESC, p.id LIMIT ?`).bind(...valeurs, R.CLASSEMENT_NIVEAU_MIN, R.CLASSEMENT_TAILLE).all();
  let rang = 0;
  let precedent = null;
  return (results || []).map((l, i) => {
    if (l.points !== precedent) { rang = i + 1; precedent = l.points; }
    return { rang, id: l.id, pseudo: l.pseudo || null, numero: l.numero, avatar: l.avatar, cadre: l.cadre, niveau: R.niveauPourXp(l.xp), points: l.points };
  });
}

/** Position du profil : { rang, points } (rang null s'il n'a rien gagné sur la période ou n'a pas le niveau). */
export async function rangDe(env, perimetre, debut, profil) {
  const { sql, valeurs } = requetePoints(perimetre, debut);
  const mien = await env.DB.prepare(`SELECT points FROM (${sql}) WHERE profil = ?`).bind(...valeurs, profil.id).first();
  const points = mien?.points || 0;
  if (points <= 0 || R.niveauPourXp(profil.xp) < R.CLASSEMENT_NIVEAU_MIN) return { rang: null, points };
  const devant = await env.DB.prepare(`SELECT COUNT(*) AS n FROM (${sql}) g JOIN profils p ON p.id = g.profil WHERE g.points > ? AND p.niveau >= ?`)
    .bind(...valeurs, points, R.CLASSEMENT_NIVEAU_MIN).first();
  return { rang: (devant?.n || 0) + 1, points };
}

// --- Indicateurs de fidélisation (calcul quotidien, /api/stats-jour) -------------------------------------

const TRANCHES_SERIE = [[1, 1], [2, 2], [3, 6], [7, 13], [14, 29], [30, Infinity]];
const TRANCHES_NIVEAU = [[1, 1], [2, 4], [5, 9], [10, 19], [20, 29], [30, Infinity]];

function repartir(lignes, tranches, cle) {
  return tranches.map(([a, b]) => ({ de: a, a: Number.isFinite(b) ? b : null, n: lignes.filter((l) => l[cle] >= a && l[cle] <= b).reduce((s, l) => s + l.n, 0) }));
}

/** Indicateurs d'un jour UTC terminé (« AAAA-MM-JJ »), rangés dans fidelisation_jour. */
export async function calculerFidelisation(env, jour) {
  const lire = (sql, ...v) => env.DB.prepare(sql).bind(...v).first();
  const tous = async (sql, ...v) => (await env.DB.prepare(sql).bind(...v).all()).results || [];
  const veille = (n) => jourUTC(Date.parse(`${jour}T00:00:00Z`) - n * JOUR_MS);
  const cohorte = async (n) => {
    const debut = veille(n);
    const l = await lire(`SELECT COUNT(*) AS taille, SUM(EXISTS (SELECT 1 FROM profils_jours j WHERE j.profil = p.id AND j.jour > p.premier_jour AND j.jour <= ?)) AS revenus
      FROM profils p WHERE p.premier_jour = ?`, jour, debut);
    return { jour: debut, taille: l?.taille || 0, revenus: l?.revenus || 0 };
  };
  const debutMois = veille(29);
  const actifs = await lire('SELECT COUNT(*) AS n FROM profils_jours WHERE jour = ?', jour);
  const nouveaux = await lire('SELECT COUNT(*) AS n FROM profils WHERE premier_jour = ?', jour);
  const series = await tous('SELECT p.serie, COUNT(*) AS n FROM profils_jours j JOIN profils p ON p.id = j.profil WHERE j.jour = ? GROUP BY p.serie', jour);
  const niveaux = await tous(`SELECT p.niveau, COUNT(*) AS n FROM profils p WHERE EXISTS (SELECT 1 FROM profils_jours j WHERE j.profil = p.id AND j.jour >= ? AND j.jour <= ?) GROUP BY p.niveau`, debutMois, jour);
  const termines = await lire(`SELECT COUNT(DISTINCT p.id) AS joueurs, (SELECT COUNT(*) FROM profils_jeux t WHERE t.termine IS NOT NULL AND t.profil IN
      (SELECT DISTINCT profil FROM profils_jours WHERE jour >= ? AND jour <= ?)) AS termines
    FROM profils p WHERE EXISTS (SELECT 1 FROM profils_jours j WHERE j.profil = p.id AND j.jour >= ? AND j.jour <= ?)`, debutMois, jour, debutMois, jour);
  const evenements = Object.fromEntries((await tous('SELECT type, nombre FROM profils_evenements WHERE jour = ?', jour)).map((e) => [e.type, e.nombre]));
  const multi = await lire('SELECT COUNT(*) AS manches, SUM(humains < 2) AS robots, COUNT(DISTINCT profil) AS joueurs FROM multi_resultats WHERE jour = ?', jour);
  const semaine = debutPeriode('semaine', Date.parse(`${jour}T12:00:00Z`));
  const classement = await lire(`SELECT COUNT(*) AS n FROM (SELECT profil, SUM(xp) AS s FROM profils_gains WHERE jour >= ? AND jour <= ? GROUP BY profil) g
    JOIN profils p ON p.id = g.profil WHERE g.s > 0 AND p.niveau >= ?`, semaine, jour, R.CLASSEMENT_NIVEAU_MIN);
  const joueurs30 = termines?.joueurs || 0;
  // Amis (docs/consigne-amis.md) : profils venus dans les 30 derniers jours, nombre d'amis de chacun.
  const amis = await lire(`SELECT COUNT(*) AS joueurs, SUM(n > 0) AS avecAmi, SUM(n) AS amis FROM (
      SELECT p.id, (SELECT COUNT(*) FROM amis a WHERE a.profil = p.id AND a.etat = 'ami') AS n FROM profils p
      WHERE EXISTS (SELECT 1 FROM profils_jours j WHERE j.profil = p.id AND j.jour >= ? AND j.jour <= ?))`, debutMois, jour);
  const joueursAmis = amis?.joueurs || 0;
  const donnees = {
    actifs: actifs?.n || 0,
    nouveaux: nouveaux?.n || 0,
    retour: { j1: await cohorte(1), j7: await cohorte(7), j30: await cohorte(30) },
    series: repartir(series.map((s) => ({ serie: s.serie, n: s.n })), TRANCHES_SERIE, 'serie'),
    serieMoyenne: (() => { const n = series.reduce((s, l) => s + l.n, 0); return n ? series.reduce((s, l) => s + l.serie * l.n, 0) / n : 0; })(),
    niveaux: repartir(niveaux.map((l) => ({ niveau: l.niveau, n: l.n })), TRANCHES_NIVEAU, 'niveau'),
    niveauMoyen: (() => { const n = niveaux.reduce((s, l) => s + l.n, 0); return n ? niveaux.reduce((s, l) => s + l.niveau * l.n, 0) / n : 0; })(),
    termines: { joueurs30, parJoueur: joueurs30 ? (termines.termines || 0) / joueurs30 : 0 },
    codes: { crees: evenements.code || 0, restaurations: evenements.restauration || 0, profilsCrees: evenements.profil || 0 },
    multi: { manches: multi?.manches || 0, contreRobots: multi?.robots || 0, joueurs: multi?.joueurs || 0 },
    classement: { presentsSemaine: classement?.n || 0 },
    amis: {
      avecAmi: amis?.avecAmi || 0,                                        // profils des 30 derniers jours qui ont au moins un ami
      part: joueursAmis ? (amis.avecAmi || 0) / joueursAmis : 0,           // … rapportés à tous les profils des 30 derniers jours
      parJoueur: joueursAmis ? (amis.amis || 0) / joueursAmis : 0,         // nombre moyen d'amis par profil (30 derniers jours)
      demandes: evenements['ami-demande'] || 0,                           // demandes envoyées ce jour
      acceptees: evenements['ami-accepte'] || 0,                          // demandes acceptées ce jour
      rejoindre: evenements.rejoindre || 0,                               // boutons « Rejoindre » touchés ce jour (tous jeux)
      rejoindrePartie: evenements['rejoindre-partie'] || 0,               // … dont vers la partie en ligne d'un ami
    },
  };
  await env.DB.prepare(`INSERT INTO fidelisation_jour (jour, donnees, calcule_le) VALUES (?, ?, ?)
    ON CONFLICT (jour) DO UPDATE SET donnees = excluded.donnees, calcule_le = excluded.calcule_le`).bind(jour, JSON.stringify(donnees), Date.now()).run();
  return donnees;
}

/** Calcule les jours manquants (jusqu'à la veille, 30 au plus) puis efface ce qui a dépassé sa durée de conservation. */
export async function tacheQuotidienneProfil(env, maintenant) {
  await preparerTablesProfil(env);
  const hier = jourUTC(maintenant - JOUR_MS);
  const dernier = await env.DB.prepare('SELECT MAX(jour) AS jour FROM fidelisation_jour').first();
  const premier = await env.DB.prepare('SELECT MIN(premier_jour) AS jour FROM profils').first();
  const jours = [];
  // Premier calcul : depuis le premier jour d'un profil (30 jours au plus) ; ensuite, la suite.
  let jour = dernier?.jour ? jourUTC(Date.parse(`${dernier.jour}T00:00:00Z`) + JOUR_MS) : (premier?.jour && premier.jour < hier ? premier.jour : hier);
  if (ecartJours(jour, hier) > 29) jour = jourUTC(Date.parse(`${hier}T00:00:00Z`) - 29 * JOUR_MS);
  while (jour <= hier) {
    await calculerFidelisation(env, jour);
    jours.push(jour);
    jour = jourUTC(Date.parse(`${jour}T00:00:00Z`) + JOUR_MS);
  }
  const limiteGains = jourUTC(maintenant - R.GAINS_JOURS_GARDES * JOUR_MS);
  const inactif = maintenant - R.PROFIL_INACTIF_JOURS * JOUR_MS;
  const anciens = 'SELECT id FROM profils WHERE vu_le < ?';
  await env.DB.batch([
    env.DB.prepare('DELETE FROM profils_gains WHERE jour < ?').bind(limiteGains),
    env.DB.prepare('DELETE FROM profils_jours WHERE jour < ?').bind(limiteGains),
    env.DB.prepare('DELETE FROM multi_resultats WHERE jour < ?').bind(limiteGains),
    env.DB.prepare('DELETE FROM profils_limites WHERE date < ?').bind(maintenant - R.LIMITES_JOURS_GARDES * JOUR_MS),
    env.DB.prepare('DELETE FROM profils_blocages WHERE jusqu_a < ? AND maj < ?').bind(maintenant, maintenant - R.CODE_BLOCAGE_OUBLI_JOURS * JOUR_MS),
    env.DB.prepare(`DELETE FROM profils_jeux WHERE profil IN (${anciens})`).bind(inactif),
    env.DB.prepare(`DELETE FROM profils_gains WHERE profil IN (${anciens})`).bind(inactif),
    env.DB.prepare(`DELETE FROM profils_jours WHERE profil IN (${anciens})`).bind(inactif),
    env.DB.prepare(`DELETE FROM multi_resultats WHERE profil IN (${anciens})`).bind(inactif),
    env.DB.prepare(`DELETE FROM profils_appareils WHERE profil IN (${anciens})`).bind(inactif),
    env.DB.prepare(`DELETE FROM profils_signalements WHERE profil IN (${anciens}) OR auteur IN (${anciens})`).bind(inactif, inactif),
    // Amis : demandes restées sans réponse, puis relations et réglages des profils effacés.
    env.DB.prepare("DELETE FROM amis WHERE etat IN ('envoyee', 'recue') AND maj_le < ?").bind(maintenant - R.AMIS_DEMANDE_JOURS * JOUR_MS),
    env.DB.prepare(`DELETE FROM amis WHERE profil IN (${anciens}) OR autre IN (${anciens})`).bind(inactif, inactif),
    env.DB.prepare(`DELETE FROM amis_reglages WHERE profil IN (${anciens})`).bind(inactif),
    env.DB.prepare('DELETE FROM profils WHERE vu_le < ?').bind(inactif),
  ]);
  return jours;
}
