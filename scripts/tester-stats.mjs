#!/usr/bin/env node
// ==========================================================================
// tester-stats.mjs — tests des statistiques de jeu (collecte, calcul par jour,
// onglet « Stats »), sans réseau.
//
//   node scripts/tester-stats.mjs                    serveur seulement (SQLite)
//   node scripts/tester-stats.mjs --navigateur [id…] + lanceur dans Chromium :
//        script commun présent dans le jeu, FMG.reportEnd → un seul envoi,
//        relance, retour sur la page (même session) ; id par défaut :
//        pommes-du-poney (le lanceur est le même pour tous les jeux)
//
// Serveur : appelle les fonctions Cloudflare dans Node (functions/api/session.js,
// stats-jour.js, tendances.js, idees.js, functions/_stats.js) avec une base
// SQLite en mémoire (node:sqlite, même SQL que D1), dans les deux formats de la
// table « sessions » créée à la main (id entier et début en millisecondes, ou
// id texte et début en date ISO). Vérifie : ajout automatique des colonnes sans
// toucher aux anciennes lignes, anciennes lignes toujours lues par les
// Tendances, corps d'un ancien lanceur accepté, données invalides refusées,
// durée plafonnée à 2 h, regroupement des morceaux d'une session (y compris à
// cheval sur minuit), calcul par jour (lancements, médiane, abandons, relances,
// terminées, votes), jours « before », rattrapage sans double calcul,
// effacement à 60 jours, lecture des 3 périodes, accès protégé.
// Navigateur : nécessite Playwright et Chromium (CHROMIUM_PATH = Edge possible).
// Code de sortie 1 si un test échoue.
// ==========================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://freemicrogames.com';
const JOUR = 86400000;
const args = process.argv.slice(2);

let echecs = 0;
function verifier(condition, message, detail) {
  if (condition) console.log(`  ✓ ${message}`);
  else { echecs++; console.log(`  ✗ ${message}${detail !== undefined ? ` — obtenu : ${JSON.stringify(detail)}` : ''}`); }
}

// --- Base D1 simulée (SQLite) ---------------------------------------------------

function baseD1() {
  const db = new DatabaseSync(':memory:');
  const instruction = (sql, valeurs = []) => ({
    bind: (...v) => instruction(sql, v),
    first: async () => db.prepare(sql).get(...valeurs) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...valeurs) }),
    run: async () => { const r = db.prepare(sql).run(...valeurs); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return {
    sqlite: db,
    prepare: (sql) => instruction(sql),
    batch: async (liste) => {
      db.exec('BEGIN');
      try {
        const r = [];
        for (const i of liste) r.push(await i.run());
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

const CATALOGUE = { games: [{ id: 'pommes-du-poney', title: 'Les pommes du poney' }, { id: 'robot-max', title: 'Robot Max' }, { id: 'glissade', title: 'Glissade' }] };

function environnement(DB) {
  return {
    DB,
    IP_SALT: 'sel-de-test',
    STATS_SECRET: 'secret-stats',
    ASSETS: { fetch: async () => new Response(JSON.stringify(CATALOGUE), { headers: { 'Content-Type': 'application/json' } }) },
  };
}

// Les modules gardent des caches par instance (format de la table, tables
// prêtes), comme sur Cloudflare : chaque format de table est donc testé dans
// son propre processus (voir le programme principal).
async function modules() {
  return {
    session: await import('../functions/api/session.js'),
    statsJour: await import('../functions/api/stats-jour.js'),
    tendances: await import('../functions/api/tendances.js'),
    idees: await import('../functions/api/idees.js'),
    stats: await import('../functions/_stats.js'),
  };
}

function requeteSession(corps, ip = '203.0.113.7') {
  return new Request(`${SITE}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, 'Sec-Fetch-Site': 'same-origin', Origin: SITE },
    body: JSON.stringify(corps),
  });
}

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

async function testerServeur(formatTexte) {
  console.log(`\nTable sessions : id ${formatTexte ? 'texte, début en date ISO' : 'entier, début en millisecondes'}`);
  const DB = baseD1();
  const env = environnement(DB);
  const db = DB.sqlite;
  db.exec((await readFile(path.join(RACINE, 'schema.sql'), 'utf8')).replace(/--.*$/gm, ''));
  db.exec('ALTER TABLE votes ADD COLUMN visiteur TEXT');
  db.exec(formatTexte
    ? 'CREATE TABLE sessions (id TEXT PRIMARY KEY, jeu_id TEXT NOT NULL, debut TEXT NOT NULL, duree_secondes INTEGER NOT NULL, pays TEXT, appareil TEXT, erreur_js TEXT, visiteur TEXT)'
    : 'CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, jeu_id TEXT NOT NULL, debut INTEGER NOT NULL, duree_secondes INTEGER NOT NULL, pays TEXT, appareil TEXT, erreur_js TEXT, visiteur TEXT)');
  db.exec('CREATE INDEX sessions_debut ON sessions (debut, jeu_id, visiteur, duree_secondes, pays)');
  const debutVal = (ms) => (formatTexte ? new Date(ms).toISOString() : ms);
  let n = 0;
  const ancienne = (jeu, ms, duree, visiteur) => db.prepare(
    `INSERT INTO sessions (${formatTexte ? 'id, ' : ''}jeu_id, debut, duree_secondes, pays, appareil, erreur_js, visiteur) VALUES (${formatTexte ? '?, ' : ''}?, ?, ?, 'FR', 'mobile', NULL, ?)`
  ).run(...(formatTexte ? [`ancienne-${++n}`] : []), jeu, debutVal(ms), duree, visiteur);

  // Anciennes lignes (avant les statistiques) : 3 joueurs différents sur robot-max hier, pour les Tendances.
  const maintenant = Date.now();
  const minuit = Math.floor(maintenant / JOUR) * JOUR;
  for (let j = 2; j <= 6; j++) for (const v of ['v1', 'v2', 'v3']) ancienne('robot-max', minuit - j * JOUR + 10 * 3600000, 300, v);
  ancienne('robot-max', maintenant - 70 * JOUR, 100, 'v1'); // plus de 60 jours : à effacer
  const avant = db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;

  const m = await modules();
  const appeler = (corps, ip) => m.session.onRequestPost({ request: requeteSession(corps, ip), env, waitUntil: () => {} });

  // 1. Corps actuel : colonnes ajoutées automatiquement, ligne complète.
  let r = await appeler({ jeuId: 'pommes-du-poney', duree: 45, erreur: null, visitorId: UUID_A, startedAt: maintenant - 45000, completed: true, level: 7, replay: false });
  verifier(r.status === 204, 'session au nouveau format enregistrée (204)', r.status);
  const colonnes = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
  verifier(['visitor_id', 'started_at', 'game_completed', 'max_level', 'is_replay'].every((c) => colonnes.includes(c)), 'colonnes visitor_id, started_at, game_completed, max_level, is_replay ajoutées', colonnes);
  const anciennes = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE visitor_id IS NULL AND game_completed = 0 AND is_replay = 0 AND max_level IS NULL AND started_at IS NULL').get().n;
  verifier(anciennes === avant, `les ${avant} anciennes lignes gardent leurs valeurs et prennent les valeurs par défaut`, anciennes);
  const nouvelle = db.prepare('SELECT * FROM sessions WHERE visitor_id = ?').get(UUID_A);
  verifier(nouvelle && nouvelle.game_completed === 1 && nouvelle.max_level === 7 && nouvelle.is_replay === 0 && nouvelle.started_at === maintenant - 45000 && nouvelle.duree_secondes === 45 && nouvelle.visiteur,
    'valeurs enregistrées (terminé, niveau 7, pas de relance, lancement, durée, empreinte)', nouvelle);

  // 2. Ancien lanceur (sans statistiques) : accepté, ignoré par les statistiques.
  r = await appeler({ jeuId: 'pommes-du-poney', duree: 30, erreur: null });
  verifier(r.status === 204, 'corps d\'un ancien lanceur toujours accepté', r.status);

  // 3. Refus et plafond.
  r = await appeler({ jeuId: 'pommes-du-poney', duree: 30, visitorId: 'pas-un-uuid', startedAt: 1 });
  verifier(r.status === 400, 'identifiant visiteur invalide refusé (400)', r.status);
  r = await appeler({ jeuId: 'pommes-du-poney', duree: 30, visitorId: UUID_A, startedAt: 1, level: 'trois' });
  verifier(r.status === 400, 'niveau invalide refusé (400)', r.status);
  r = await appeler({ jeuId: 'pommes-du-poney', duree: 3 * 3600 + 1, visitorId: UUID_A, startedAt: 1 });
  verifier(r.status === 400, 'durée de plus de 3 h refusée (400)', r.status);
  r = await appeler({ jeuId: 'pommes-du-poney', duree: 2 * 3600 + 500, visitorId: UUID_C, startedAt: 5, completed: false, level: null, replay: true });
  const plafonnee = db.prepare('SELECT duree_secondes FROM sessions WHERE visitor_id = ?').get(UUID_C)?.duree_secondes;
  verifier(plafonnee === 7200, 'durée plafonnée à 2 h', plafonnee);
  db.prepare('DELETE FROM sessions WHERE visitor_id IN (?, ?)').run(UUID_A, UUID_C);

  // 4. Les Tendances lisent toujours les anciennes lignes.
  const t = await m.tendances.onRequestGet({ request: new Request(`${SITE}/api/tendances`), env, waitUntil: () => {} });
  const tj = await t.json();
  verifier(t.status === 200 && tj.jeux.some((j) => j.id === 'robot-max'), 'Tendances : anciennes lignes toujours comptées', tj);

  // 5. Calcul par jour. Jour J = avant-hier (complet quelle que soit l'heure, marge de 6 h).
  const J = minuit - 2 * JOUR;
  const ligne = (jeu, ms, duree, visiteur, lancement, termine, niveau, relance) => db.prepare(
    `INSERT INTO sessions (${formatTexte ? 'id, ' : ''}jeu_id, debut, duree_secondes, pays, appareil, erreur_js, visiteur, visitor_id, started_at, game_completed, max_level, is_replay)
     VALUES (${formatTexte ? '?, ' : ''}?, ?, ?, 'FR', 'mobile', NULL, 'emp', ?, ?, ?, ?, ?)`
  ).run(...(formatTexte ? [`n-${++n}`] : []), jeu, debutVal(ms), duree, visiteur, lancement, termine, niveau, relance);
  // robot-max : 4 sessions — 5 s (abandon rapide), 60 s (terminée), 100 s + 20 s (même session, retour sur la page, relance), 200 s.
  ligne('robot-max', J + 3600000, 5, UUID_A, 1, 0, null, 0);
  ligne('robot-max', J + 7200000, 60, UUID_A, 2, 1, 4, 0);
  ligne('robot-max', J + 10800000, 100, UUID_B, 3, 0, 2, 1);
  ligne('robot-max', J + 11000000, 20, UUID_B, 3, 1, 3, 1);
  ligne('robot-max', J + 20 * 3600000, 200, UUID_C, 4, 0, null, 0);
  // Session commencée à 23 h 30 la veille de J, continuée après minuit : compte pour la veille, pas pour J.
  ligne('glissade', J - 1800000, 600, UUID_A, 5, 0, null, 0);
  ligne('glissade', J + 600000, 300, UUID_A, 5, 1, 9, 0);
  // Session commencée à 23 h 50 le jour J, continuée après minuit : compte pour J.
  ligne('glissade', J + JOUR - 600000, 400, UUID_B, 6, 0, null, 0);
  ligne('glissade', J + JOUR + 300000, 100, UUID_B, 6, 1, 2, 0);
  // Votes du jour J.
  db.prepare('INSERT INTO votes (game_id, voter, value, country, created_at) VALUES (?, ?, ?, ?, ?)').run('robot-max', 'a', 1, 'FR', J + 5000);
  db.prepare('INSERT INTO votes (game_id, voter, value, country, created_at) VALUES (?, ?, ?, ?, ?)').run('robot-max', 'b', 1, 'FR', J + 6000);
  db.prepare('INSERT INTO votes (game_id, voter, value, country, created_at) VALUES (?, ?, ?, ?, ?)').run('robot-max', 'c', -1, 'FR', J + 7000);
  db.prepare('INSERT INTO votes (game_id, voter, value, country, created_at) VALUES (?, ?, ?, ?, ?)').run('glissade', 'a', 1, 'FR', J + JOUR + 1000);

  // Accès : sans secret, refusé.
  r = await m.statsJour.onRequest({ request: new Request(`${SITE}/api/stats-jour`, { method: 'POST' }), env });
  verifier(r.status === 401, '/api/stats-jour sans secret refusé (401)', r.status);
  r = await m.statsJour.onRequest({ request: new Request(`${SITE}/api/stats-jour`, { method: 'POST', headers: { Authorization: 'Bearer faux' } }), env });
  verifier(r.status === 401, '/api/stats-jour avec un mauvais secret refusé (401)', r.status);
  r = await m.statsJour.onRequest({ request: new Request(`${SITE}/api/stats-jour`, { method: 'POST', headers: { Authorization: 'Bearer secret-stats' } }), env });
  const rj = await r.json();
  const jourJ = new Date(J).toISOString().slice(0, 10);
  const veille = new Date(J - JOUR).toISOString().slice(0, 10);
  verifier(r.status === 200 && rj.jours.includes(jourJ) && rj.jours.includes(veille), 'tâche planifiée : jours calculés', rj);
  verifier(rj.effacees === 1, 'sessions de plus de 60 jours effacées (1)', rj.effacees);

  const statJ = (jeu) => db.prepare('SELECT * FROM game_stats_daily WHERE game_id = ? AND day = ?').get(jeu, jourJ);
  const robot = statJ('robot-max');
  verifier(robot && robot.launches === 4, 'robot-max : 4 lancements (les 2 morceaux d\'une session comptent pour 1)', robot);
  verifier(robot && robot.median_duration === 90 && Math.abs(robot.avg_duration - 96.25) < 0.01, 'robot-max : durée médiane 90 s, moyenne 96,25 s', robot && [robot.median_duration, robot.avg_duration]);
  verifier(robot && robot.quick_quit_count === 1 && robot.replay_count === 1 && robot.completed_count === 2, 'robot-max : 1 abandon rapide, 1 relance, 2 terminées', robot);
  verifier(robot && robot.thumbs_up === 2 && robot.thumbs_down === 1, 'robot-max : 2 👍, 1 👎', robot);
  const glisse = statJ('glissade');
  verifier(glisse && glisse.launches === 1 && glisse.median_duration === 500 && glisse.completed_count === 1, 'glissade : session à cheval sur minuit comptée une fois, le jour de son début (500 s, terminée)', glisse);
  const glisseVeille = db.prepare('SELECT * FROM game_stats_daily WHERE game_id = ? AND day = ?').get('glissade', veille);
  verifier(glisseVeille && glisseVeille.launches === 1 && glisseVeille.median_duration === 900, 'glissade : la session de 23 h 30 compte pour la veille (900 s)', glisseVeille);
  const avantJ = db.prepare("SELECT COUNT(*) AS n FROM game_stats_days WHERE status = 'before'").get().n;
  verifier(avantJ > 0 && !db.prepare("SELECT 1 FROM game_stats_daily WHERE day < ?").get(veille), 'jours sans nouvelles sessions avant les statistiques : notés « before », sans ligne', avantJ);

  // Rattrapage : un 2e passage ne recalcule rien.
  const ecritures = db.prepare('SELECT COUNT(*) AS n FROM game_stats_daily').get().n;
  r = await m.statsJour.onRequest({ request: new Request(`${SITE}/api/stats-jour`, { method: 'POST', headers: { Authorization: 'Bearer secret-stats' } }), env });
  const rj2 = await r.json();
  verifier(rj2.jours.length === 0 && db.prepare('SELECT COUNT(*) AS n FROM game_stats_daily').get().n === ecritures, '2e passage : rien à recalculer', rj2);
  // Écritures : une ligne par jeu actif et par jour.
  verifier(ecritures <= 4, `écritures du calcul : ${ecritures} lignes pour 2 jours et 2 jeux`, ecritures);

  // 6. Lecture des 3 périodes.
  const s7 = await m.stats.lireStats(env, '7j');
  verifier(s7.global.launches === 6 && s7.jours.attendus === 7 && s7.courbe.length === 7 && s7.precedent === null, '7 jours : 6 lancements, 7 points, pas de période précédente comparable', { l: s7.global.launches, j: s7.jours, p: s7.precedent });
  verifier(s7.jeux['robot-max']?.launches === 4 && s7.jeux['robot-max'].thumbs_up === 2, '7 jours : détail de robot-max', s7.jeux['robot-max']);
  const s30 = await m.stats.lireStats(env, '30j');
  verifier(s30.global.launches === 6 && s30.courbe.length === 30, '30 jours : 6 lancements, 30 points', s30.global.launches);
  ligne('robot-max', maintenant - 3600000, 40, UUID_A, 99, 1, 12, 1);
  const s24 = await m.stats.lireStats(env, '24h');
  verifier(s24.global.launches === 1 && s24.global.completed_count === 1 && s24.global.replay_count === 1 && s24.global.median_duration === 40, '24 heures : sessions brutes', s24.global);
  verifier(s24.courbe.length >= 24 && s24.courbe.reduce((a, p) => a + p.launches, 0) === 1, '24 heures : courbe heure par heure', s24.courbe.length);

  // 7. L'onglet « Stats » est derrière Cloudflare Access, comme le reste de /idees.
  r = await m.idees.onRequest({ request: new Request(`${SITE}/api/idees`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'stats', periode: '7j' }) }), env });
  verifier(r.status === 403, '/api/idees { type: "stats" } sans connexion Access refusé (403)', r.status);
}

// --- Lanceur dans le navigateur ---------------------------------------------------------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const BASE = 'http://localhost:8124';

async function testerNavigateur(ids) {
  let playwright;
  try { playwright = await import('playwright'); }
  catch { console.error('Playwright manque : npm install --no-save playwright'); process.exit(1); }
  const navigateur = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    for (const id of ids) {
      console.log(`\nLanceur : ${id}`);
      const fiche = JSON.parse(await readFile(path.join(RACINE, 'games', id, 'game.json'), 'utf8'));
      const catalogue = { games: [{ ...fiche, play: `games/${id}/?v=${fiche.version}`, cover: '' }] };
      const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR' });
      const envois = [];
      await contexte.route(`${BASE}/**`, async (route) => {
        const url = new URL(route.request().url());
        let p = decodeURIComponent(url.pathname);
        if (p === '/api/session') { envois.push(JSON.parse(route.request().postData() || 'null')); return route.fulfill({ status: 204, body: '' }); }
        if (p.startsWith('/api/')) return route.fulfill({ status: 503, body: '' });
        if (p === '/catalog.json') return route.fulfill({ status: 200, contentType: TYPES['.json'], body: JSON.stringify(catalogue) });
        let fichier;
        if (p.startsWith(`/games/${id}/`)) fichier = path.join(RACINE, 'games', id, p.slice(`/games/${id}/`.length) || 'index.html');
        else fichier = path.join(RACINE, 'public', p === '/play' ? 'play.html' : (p.endsWith('/') ? p + 'index.html' : p));
        if (!fichier.startsWith(RACINE) || !existsSync(fichier)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ status: 200, contentType: TYPES[path.extname(fichier)] || 'application/octet-stream', body: await readFile(fichier) });
      });
      const page = await contexte.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(e.message));
      const cadre = () => page.frames().find((f) => f.url() === 'about:srcdoc');
      const cacher = () => page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const montrer = () => page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await page.goto(`${BASE}/play.html?id=${id}&lang=fr`);
      await page.waitForTimeout(1500);
      const present = await cadre()?.evaluate(() => typeof window.FMG?.reportEnd === 'function').catch(() => false);
      verifier(present, 'window.FMG.reportEnd présent dans le jeu (script commun du lanceur)');
      await cadre()?.evaluate(() => {
        window.FMG.reportEnd({ completed: false, level: 2 });
        window.FMG.reportEnd({ completed: true, level: 5 });
        window.FMG.reportEnd({ completed: false, level: 3 });
        window.FMG.reportEnd('n\'importe quoi');
      });
      await page.waitForTimeout(1200);
      await cacher();
      await page.waitForTimeout(400);
      verifier(envois.length === 1, 'page cachée : un seul envoi', envois.length);
      const e1 = envois[0] || {};
      verifier(/^[0-9a-f-]{36}$/.test(e1.visitorId) && Number.isInteger(e1.startedAt) && e1.duree >= 2, 'envoi : identifiant anonyme, lancement, durée', e1);
      verifier(e1.completed === true && e1.level === 5 && e1.replay === false && e1.jeuId === id, 'envoi : terminée (une victoire), niveau maximal 5, pas de relance', e1);

      // Retour sur la page peu après : même session (même lancement), seul le temps joué ensuite est envoyé.
      await montrer();
      await page.waitForTimeout(2300);
      await cacher();
      await page.waitForTimeout(400);
      const e2 = envois[1] || {};
      verifier(envois.length === 2 && e2.startedAt === e1.startedAt && e2.visitorId === e1.visitorId && e2.completed === true && e2.duree >= 2 && e2.duree <= 4, 'retour sur la page : même session, temps ajouté seulement', e2);

      // Nouveau lancement du même jeu moins de 30 min après : relance, même identifiant.
      await page.reload();
      await page.waitForTimeout(2300);
      await cacher();
      await page.waitForTimeout(400);
      const e3 = envois.at(-1) || {};
      verifier(e3.replay === true && e3.visitorId === e1.visitorId && e3.startedAt !== e1.startedAt && e3.completed === false && e3.level === null, 'relance détectée, même identifiant, nouvelle session', e3);
      const stockage = await page.evaluate(() => [localStorage.getItem('fmg-visiteur'), localStorage.getItem('fmg-lancements')]);
      verifier(stockage[0] && stockage[1], 'stockage : fmg-visiteur et fmg-lancements', stockage);

      // Cookies refusés : identifiant à usage unique, rien de gardé, pas de relance.
      await page.evaluate(() => localStorage.setItem('fmg-consentement', JSON.stringify({ choix: 'refuse', date: Date.now() })));
      await page.reload();
      await page.waitForTimeout(2300);
      const refuse = await page.evaluate(() => window.FMG_CONSENTEMENT?.choix?.());
      await cacher();
      await page.waitForTimeout(400);
      const e4 = envois.at(-1) || {};
      const apres = await page.evaluate(() => [localStorage.getItem('fmg-visiteur'), localStorage.getItem('fmg-lancements')]);
      verifier(refuse !== 'refuse' || (e4.visitorId !== e1.visitorId && e4.replay === false && !apres[0] && !apres[1]), `cookies refusés (choix lu : ${refuse}) : identifiant à usage unique, rien de gardé`, { e4, apres });
      verifier(!erreurs.length, 'aucune erreur JavaScript', erreurs);
      await contexte.close();
    }
  } finally {
    await navigateur.close();
  }
}

// --- Programme principal ------------------------------------------------------------------

const format = args.find((a) => a.startsWith('--format='))?.slice(9);
if (format) {
  await testerServeur(format === 'texte');
  process.exit(echecs ? 1 : 0);
}
for (const f of ['nombre', 'texte']) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--format=${f}`], { stdio: 'inherit' });
  if (r.status !== 0) echecs++;
}
if (args.includes('--navigateur')) {
  const ids = args.filter((a) => !a.startsWith('--'));
  await testerNavigateur(ids.length ? ids : ['pommes-du-poney']);
}
console.log(echecs ? `\n${echecs} test(s) en échec.` : '\nStatistiques : tout est bon.');
process.exit(echecs ? 1 : 0);
