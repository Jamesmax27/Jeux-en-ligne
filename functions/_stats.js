// ==========================================================================
// Statistiques des jeux : calcul par jour (table game_stats_daily) et lecture
// pour l'onglet « Stats » de la page privée /idees.
// Utilisé par functions/api/stats-jour.js (tâche planifiée, une fois par jour)
// et par functions/api/idees.js ({ "type": "stats" }, même accès que /idees).
// Ce fichier n'exporte aucun onRequest… : il ne crée aucune adresse.
//
// Données brutes : table « sessions » (une ligne par session, remplie par
// /api/session ; colonnes des statistiques : COLONNES_STATS de
// functions/_commun.js). Seules les lignes envoyées par le lanceur actuel
// (visitor_id renseigné) comptent : les anciennes lignes (avant octobre 2026)
// n'ont ni fin de partie ni relance, elles ne servent qu'aux Tendances.
// Une session = les lignes de mêmes visitor_id, started_at et jeu_id (le
// joueur qui revient sur la page peu après ajoute une ligne, public/suivi.js) :
//   - lancement : la session (jour et heure : début de sa première ligne) ;
//   - durée : somme de ses lignes, 2 h au plus ;
//   - abandon rapide : durée de moins de 10 s (sessions de moins de 2 s : jamais envoyées) ;
//   - relance : is_replay ; terminée : game_completed (victoire signalée par le jeu).
// Votes du jour : votes (👍, 👎) dont la date (created_at, date du dernier
// vote) tombe ce jour-là, lus au moment du calcul. Un vote changé plus tard
// compte aussi le jour du changement.
//
// game_stats_daily : une ligne par jeu et par jour UTC (jeux lancés ou votés
// ce jour-là), gardée sans limite ; game_stats_days : jours déjà calculés
// (« done »), ou antérieurs aux statistiques (« before »). Un jour est calculé
// quand ses sessions ne peuvent plus changer : MARGE après minuit (une session
// peut se prolonger quelques heures, voir suivi.js). Les jours manquants (tâche
// planifiée qui n'est pas passée) sont rattrapés au passage suivant, ou à
// l'ouverture de l'onglet « Stats ».
// Écritures : une ligne par jeu actif et par jour (+ une pour le jour), dans
// des tables WITHOUT ROWID (aucun index en plus de la clé).
// ==========================================================================

import { lireFormatSessions, valeurDebut, CONSERVATION_SESSIONS_JOURS } from './_commun.js';

const JOUR_MS = 86400000;
const HEURE_MS = 3600000;
const MARGE_MS = 6 * HEURE_MS;       // une session se prolonge 3 h au plus après son lancement, + 2 h de jeu, + envoi
const DUREE_SESSION_MAX = 2 * 3600;  // secondes (même plafond que suivi.js)
const ABANDON_RAPIDE_S = 10;
const RATTRAPAGE_JOURS = CONSERVATION_SESSIONS_JOURS - 2; // au-delà, les sessions brutes sont effacées

export const PERIODES = { '24h': 1, '7j': 7, '30j': 30 };

const jourTexte = (ms) => new Date(ms).toISOString().slice(0, 10);
const msDebut = (v) => (typeof v === 'number' ? v : Date.parse(v));

// --- Tables ----------------------------------------------------------------------

let tablesPretes = null;

export function preparerTablesStats(env) {
  if (!tablesPretes) {
    tablesPretes = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS game_stats_daily (
        game_id TEXT NOT NULL, day TEXT NOT NULL,
        launches INTEGER NOT NULL DEFAULT 0, median_duration INTEGER, avg_duration REAL,
        quick_quit_count INTEGER NOT NULL DEFAULT 0, replay_count INTEGER NOT NULL DEFAULT 0,
        completed_count INTEGER NOT NULL DEFAULT 0,
        thumbs_up INTEGER NOT NULL DEFAULT 0, thumbs_down INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (game_id, day)) WITHOUT ROWID`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS game_stats_days (
        day TEXT PRIMARY KEY, status TEXT NOT NULL, computed_at INTEGER NOT NULL) WITHOUT ROWID`),
    ]).catch((erreur) => {
      tablesPretes = null; // nouvel essai à la prochaine requête
      throw erreur;
    });
  }
  return tablesPretes;
}

// --- Sessions regroupées ------------------------------------------------------------

// Lignes de sessions dont le début est dans [de, a) (ms), regroupées en sessions.
// Renvoie [{ jeu, debut (ms, première ligne), duree, termine, relance }].
async function lireSessions(env, format, de, a) {
  const { results } = await env.DB.prepare(
    `SELECT jeu_id, debut, duree_secondes, visitor_id, started_at, game_completed, is_replay
     FROM sessions
     WHERE debut >= ? AND debut < ? AND visitor_id IS NOT NULL`
  ).bind(valeurDebut(format, de), valeurDebut(format, a)).all();
  const groupes = new Map();
  for (const l of results || []) {
    const cle = `${l.visitor_id}|${l.started_at}|${l.jeu_id}`;
    const debut = msDebut(l.debut);
    const g = groupes.get(cle);
    if (!g) {
      groupes.set(cle, { jeu: String(l.jeu_id), debut, duree: Number(l.duree_secondes) || 0, termine: !!l.game_completed, relance: !!l.is_replay });
    } else {
      g.debut = Math.min(g.debut, debut);
      g.duree += Number(l.duree_secondes) || 0;
      g.termine ||= !!l.game_completed;
      g.relance ||= !!l.is_replay;
    }
  }
  return [...groupes.values()].map((g) => ({ ...g, duree: Math.min(g.duree, DUREE_SESSION_MAX) }));
}

function mediane(valeurs) {
  if (!valeurs.length) return null;
  const v = [...valeurs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

// Médiane pondérée de médianes ([[mediane, poids]]) : estimation de la médiane
// d'une période à partir des médianes de chaque jour, pondérées par les lancements.
function medianePonderee(couples) {
  const v = couples.filter(([m, p]) => m != null && p > 0).sort((a, b) => a[0] - b[0]);
  const total = v.reduce((n, [, p]) => n + p, 0);
  if (!total) return null;
  let cumul = 0;
  for (const [m, p] of v) {
    cumul += p;
    if (cumul * 2 >= total) return m;
  }
  return v[v.length - 1][0];
}

// Compteurs d'un ensemble de sessions.
function compter(sessions) {
  const durees = sessions.map((s) => s.duree);
  return {
    launches: sessions.length,
    median_duration: mediane(durees),
    avg_duration: sessions.length ? durees.reduce((a, b) => a + b, 0) / sessions.length : null,
    quick_quit_count: sessions.filter((s) => s.duree < ABANDON_RAPIDE_S).length,
    replay_count: sessions.filter((s) => s.relance).length,
    completed_count: sessions.filter((s) => s.termine).length,
  };
}

const parJeu = (sessions) => {
  const m = new Map();
  for (const s of sessions) (m.get(s.jeu) || m.set(s.jeu, []).get(s.jeu)).push(s);
  return m;
};

// Votes dont la date tombe dans [de, a) : Map jeu → { up, down }.
async function lireVotes(env, de, a) {
  const { results } = await env.DB.prepare(
    `SELECT game_id, SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) AS down
     FROM votes WHERE created_at >= ? AND created_at < ? GROUP BY game_id`
  ).bind(de, a).all();
  return new Map((results || []).map((l) => [String(l.game_id), { up: Number(l.up) || 0, down: Number(l.down) || 0 }]));
}

// --- Calcul par jour -------------------------------------------------------------------

// Dernier jour UTC (minuit, ms) dont les sessions ne peuvent plus changer.
const dernierJourComplet = (maintenant) => Math.floor((maintenant - MARGE_MS) / JOUR_MS) * JOUR_MS - JOUR_MS;

// Calcule un jour (minuit UTC, ms). Renvoie le nombre de sessions du jour, ou
// null (rien d'écrit) si le jour n'en a aucune et que siVide est faux.
async function calculerJour(env, format, jour, { siVide }) {
  // Fenêtre élargie : les lignes d'une session qui chevauche minuit sont lues
  // avec elle ; la session compte pour le jour de sa première ligne.
  const toutes = await lireSessions(env, format, jour - MARGE_MS, jour + JOUR_MS + MARGE_MS);
  const sessions = toutes.filter((s) => s.debut >= jour && s.debut < jour + JOUR_MS);
  if (!sessions.length && !siVide) return null;
  const votes = await lireVotes(env, jour, jour + JOUR_MS);
  const jeux = parJeu(sessions);
  const ids = new Set([...jeux.keys(), ...votes.keys()]);
  const jourTxt = jourTexte(jour);
  const instructions = [env.DB.prepare('DELETE FROM game_stats_daily WHERE day = ?').bind(jourTxt)];
  for (const id of ids) {
    const c = compter(jeux.get(id) || []);
    const v = votes.get(id) || { up: 0, down: 0 };
    instructions.push(env.DB.prepare(
      `INSERT INTO game_stats_daily (game_id, day, launches, median_duration, avg_duration, quick_quit_count,
         replay_count, completed_count, thumbs_up, thumbs_down) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, jourTxt, c.launches, c.median_duration, c.avg_duration, c.quick_quit_count,
      c.replay_count, c.completed_count, v.up, v.down));
  }
  instructions.push(env.DB.prepare('INSERT OR REPLACE INTO game_stats_days (day, status, computed_at) VALUES (?, ?, ?)')
    .bind(jourTxt, 'done', Date.now()));
  await env.DB.batch(instructions);
  return sessions.length;
}

/**
 * Calcule les jours complets pas encore calculés (au plus `max`, du plus ancien
 * au plus récent, sur les RATTRAPAGE_JOURS derniers jours). Les jours qui
 * précèdent la première session au format actuel sont notés « before » (rien à
 * calculer). Renvoie la liste des jours calculés.
 */
export async function calculerJoursManquants(env, { max = RATTRAPAGE_JOURS, maintenant = Date.now() } = {}) {
  const format = await lireFormatSessions(env);
  if (!format.stats) return [];
  await preparerTablesStats(env);
  const dernier = dernierJourComplet(maintenant);
  const premier = dernier - (RATTRAPAGE_JOURS - 1) * JOUR_MS;
  const { results } = await env.DB.prepare('SELECT day FROM game_stats_days WHERE day >= ?').bind(jourTexte(premier)).all();
  const faits = new Set((results || []).map((l) => l.day));
  let demarre = !!(await env.DB.prepare("SELECT 1 AS ok FROM game_stats_days WHERE status = 'done' LIMIT 1").first());
  const avant = [];
  const calcules = [];
  for (let jour = premier; jour <= dernier && calcules.length < max; jour += JOUR_MS) {
    if (faits.has(jourTexte(jour))) continue;
    const n = await calculerJour(env, format, jour, { siVide: demarre });
    if (n === null) { avant.push(jourTexte(jour)); continue; }
    if (!demarre && avant.length) {
      const maintenantMs = Date.now();
      await env.DB.batch(avant.map((j) => env.DB.prepare('INSERT OR REPLACE INTO game_stats_days (day, status, computed_at) VALUES (?, ?, ?)').bind(j, 'before', maintenantMs)));
    }
    demarre = true;
    calcules.push(jourTexte(jour));
  }
  return calcules;
}

/**
 * Efface les sessions brutes de plus de CONSERVATION_SESSIONS_JOURS jours, EFFACEMENT_MAX lignes
 * au plus par passage (chaque ligne effacée compte comme une écriture D1 : un retard
 * exceptionnel est rattrapé sur plusieurs jours sans épuiser la limite quotidienne).
 * Renvoie le nombre de lignes effacées.
 */
export const EFFACEMENT_MAX = 10000;

export async function effacerSessionsAnciennes(env, maintenant = Date.now(), max = EFFACEMENT_MAX) {
  const format = await lireFormatSessions(env);
  const r = await env.DB.prepare('DELETE FROM sessions WHERE rowid IN (SELECT rowid FROM sessions WHERE debut < ? LIMIT ?)')
    .bind(valeurDebut(format, maintenant - CONSERVATION_SESSIONS_JOURS * JOUR_MS), max).run();
  return r?.meta?.changes ?? 0;
}

// --- Lecture pour l'onglet « Stats » -------------------------------------------------

const vide = () => ({ launches: 0, median_duration: null, quick_quit_count: 0, replay_count: 0, completed_count: 0, thumbs_up: 0, thumbs_down: 0 });

// 24 heures : sessions brutes (médiane exacte), heure par heure.
async function lire24h(env, format, maintenant) {
  const fin = maintenant;
  const milieu = fin - 24 * HEURE_MS;
  const debut = milieu - 24 * HEURE_MS;
  const sessions = await lireSessions(env, format, debut - MARGE_MS, fin);
  const actuelles = sessions.filter((s) => s.debut >= milieu && s.debut < fin);
  const precedentes = sessions.filter((s) => s.debut >= debut && s.debut < milieu);
  const [votesActuels, votesPrecedents] = await Promise.all([lireVotes(env, milieu, fin), lireVotes(env, debut, milieu)]);

  const resume = (liste, votes) => {
    const total = { ...compter(liste), thumbs_up: 0, thumbs_down: 0 };
    for (const v of votes.values()) { total.thumbs_up += v.up; total.thumbs_down += v.down; }
    delete total.avg_duration;
    return total;
  };
  const jeux = {};
  const jeuxActuels = parJeu(actuelles);
  const jeuxPrecedents = parJeu(precedentes);
  for (const id of new Set([...jeuxActuels.keys(), ...votesActuels.keys(), ...jeuxPrecedents.keys()])) {
    const c = compter(jeuxActuels.get(id) || []);
    delete c.avg_duration;
    const v = votesActuels.get(id) || { up: 0, down: 0 };
    jeux[id] = { ...c, thumbs_up: v.up, thumbs_down: v.down, precedent_launches: (jeuxPrecedents.get(id) || []).length };
  }
  const courbe = [];
  const debutHeure = Math.floor(milieu / HEURE_MS) * HEURE_MS + HEURE_MS;
  for (let h = debutHeure - HEURE_MS; h < fin; h += HEURE_MS) {
    courbe.push({ x: new Date(Math.max(h, milieu)).toISOString(), launches: actuelles.filter((s) => s.debut >= h && s.debut < h + HEURE_MS).length });
  }
  // Période précédente comparable seulement si les statistiques existaient déjà au début.
  const premierJour = await env.DB.prepare("SELECT MIN(day) AS j FROM game_stats_days WHERE status = 'done'").first();
  const comparable = !!premierJour?.j && premierJour.j < jourTexte(debut);
  return {
    du: new Date(milieu).toISOString(), au: new Date(fin).toISOString(),
    global: resume(actuelles, votesActuels),
    precedent: comparable ? resume(precedentes, votesPrecedents) : null,
    jeux, courbe, jours: { attendus: 1, calcules: 1 },
  };
}

// 7 ou 30 jours : statistiques par jour (game_stats_daily), jours complets.
async function lireJours(env, nbJours, maintenant) {
  const dernier = dernierJourComplet(maintenant);
  const premier = dernier - (nbJours - 1) * JOUR_MS;
  const premierPrecedent = premier - nbJours * JOUR_MS;
  const [{ results: lignes }, { results: jours }] = await Promise.all([
    env.DB.prepare('SELECT * FROM game_stats_daily WHERE day >= ? AND day <= ?').bind(jourTexte(premierPrecedent), jourTexte(dernier)).all(),
    env.DB.prepare("SELECT day FROM game_stats_days WHERE status = 'done' AND day >= ? AND day <= ?").bind(jourTexte(premierPrecedent), jourTexte(dernier)).all(),
  ]);
  const faits = new Set((jours || []).map((l) => l.day));
  const debutActuel = jourTexte(premier);

  const cumuler = (liste) => {
    const t = vide();
    for (const l of liste) {
      t.launches += l.launches; t.quick_quit_count += l.quick_quit_count; t.replay_count += l.replay_count;
      t.completed_count += l.completed_count; t.thumbs_up += l.thumbs_up; t.thumbs_down += l.thumbs_down;
    }
    t.median_duration = medianePonderee(liste.map((l) => [l.median_duration, l.launches]));
    return t;
  };
  const actuelles = (lignes || []).filter((l) => l.day >= debutActuel);
  const precedentes = (lignes || []).filter((l) => l.day < debutActuel);
  const jeux = {};
  const groupe = (liste) => {
    const m = new Map();
    for (const l of liste) (m.get(l.game_id) || m.set(l.game_id, []).get(l.game_id)).push(l);
    return m;
  };
  const jeuxActuels = groupe(actuelles);
  const jeuxPrecedents = groupe(precedentes);
  for (const id of new Set([...jeuxActuels.keys(), ...jeuxPrecedents.keys()])) {
    jeux[id] = { ...cumuler(jeuxActuels.get(id) || []), precedent_launches: cumuler(jeuxPrecedents.get(id) || []).launches };
  }
  const courbe = [];
  let calcules = 0;
  let calculesPrecedents = 0;
  for (let j = premierPrecedent; j <= dernier; j += JOUR_MS) {
    const txt = jourTexte(j);
    const fait = faits.has(txt);
    if (j >= premier) {
      if (fait) calcules++;
      courbe.push({ x: txt, launches: fait ? actuelles.filter((l) => l.day === txt).reduce((n, l) => n + l.launches, 0) : null });
    } else if (fait) calculesPrecedents++;
  }
  return {
    du: debutActuel, au: jourTexte(dernier),
    global: cumuler(actuelles),
    precedent: calculesPrecedents === nbJours ? cumuler(precedentes) : null,
    jeux, courbe, jours: { attendus: nbJours, calcules },
  };
}

/** Données de l'onglet « Stats » pour une période ('24h', '7j' ou '30j'). */
export async function lireStats(env, periode, maintenant = Date.now()) {
  const format = await lireFormatSessions(env);
  if (!format.stats) throw new Error('colonnes des statistiques absentes de la table sessions');
  await preparerTablesStats(env);
  // Jours manquants (tâche planifiée pas encore passée) : rattrapés ici, 7 au plus par ouverture.
  const rattrapes = await calculerJoursManquants(env, { max: 7, maintenant });
  const donnees = periode === '24h' ? await lire24h(env, format, maintenant) : await lireJours(env, PERIODES[periode], maintenant);
  return { periode, ...donnees, rattrapes: rattrapes.length };
}
