-- ==========================================================================
-- Migration 0001 — statistiques des jeux (octobre 2026)
--
-- RIEN À FAIRE À LA MAIN en temps normal : les fonctions appliquent elles-mêmes
-- cette migration au premier appel (lireFormatSessions dans functions/_commun.js
-- pour les colonnes, preparerTablesStats dans functions/_stats.js pour les
-- tables). Ce fichier sert de référence, ou pour l'appliquer d'avance dans la
-- console D1 (base jeux-votes → Console) ; chaque ALTER TABLE ne s'exécute
-- qu'une fois (une 2e fois : « duplicate column name », sans conséquence).
--
-- ALTER TABLE … ADD COLUMN ne réécrit aucune ligne : aucune écriture comptée
-- pour les lignes existantes, qui prennent les valeurs par défaut (NULL ou 0).
-- Les statistiques ignorent ces anciennes lignes (visitor_id NULL) ; les
-- Tendances les lisent comme avant.
-- ==========================================================================

-- Table sessions (une ligne par session, ou par morceau de session si le
-- joueur revient sur la page peu après : mêmes visitor_id et started_at).
ALTER TABLE sessions ADD COLUMN visitor_id TEXT;                            -- identifiant anonyme tiré au hasard par l'appareil (public/suivi.js)
ALTER TABLE sessions ADD COLUMN started_at INTEGER;                         -- lancement de la session, horloge de l'appareil (ms)
ALTER TABLE sessions ADD COLUMN game_completed INTEGER NOT NULL DEFAULT 0;  -- 1 si le jeu a signalé une victoire (FMG.reportEnd)
ALTER TABLE sessions ADD COLUMN max_level INTEGER;                          -- plus haut niveau (ou score) signalé par le jeu, NULL sinon
ALTER TABLE sessions ADD COLUMN is_replay INTEGER NOT NULL DEFAULT 0;       -- 1 si le même jeu a été lancé moins de 30 min plus tôt sur l'appareil

-- Statistiques par jeu et par jour UTC, gardées sans limite (calculées par
-- /api/stats-jour, voir functions/_stats.js). WITHOUT ROWID : une seule
-- écriture par ligne (pas d'index en plus de la clé).
CREATE TABLE IF NOT EXISTS game_stats_daily (
  game_id          TEXT    NOT NULL,
  day              TEXT    NOT NULL,            -- « AAAA-MM-JJ » (UTC)
  launches         INTEGER NOT NULL DEFAULT 0,  -- sessions commencées ce jour-là
  median_duration  INTEGER,                     -- secondes
  avg_duration     REAL,                        -- secondes
  quick_quit_count INTEGER NOT NULL DEFAULT 0,  -- sessions de moins de 10 s
  replay_count     INTEGER NOT NULL DEFAULT 0,  -- relances (is_replay)
  completed_count  INTEGER NOT NULL DEFAULT 0,  -- sessions avec une victoire signalée
  thumbs_up        INTEGER NOT NULL DEFAULT 0,  -- 👍 datés de ce jour (votes.created_at)
  thumbs_down      INTEGER NOT NULL DEFAULT 0,  -- 👎 datés de ce jour
  PRIMARY KEY (game_id, day)
) WITHOUT ROWID;

-- Jours déjà calculés (« done ») ou antérieurs aux statistiques (« before »).
CREATE TABLE IF NOT EXISTS game_stats_days (
  day         TEXT    PRIMARY KEY,              -- « AAAA-MM-JJ » (UTC)
  status      TEXT    NOT NULL,                 -- done | before
  computed_at INTEGER NOT NULL                  -- date du calcul (ms)
) WITHOUT ROWID;

-- Index sessions_debut : déjà conseillé pour les Tendances (schema.sql). Il
-- évite de relire toute la table à chaque calcul, au prix d'une écriture de
-- plus par session enregistrée ou effacée. À créer à la main, APRÈS le premier
-- effacement des sessions de plus de 60 jours (sa création écrit une fois une
-- entrée par ligne existante : vérifier d'abord SELECT COUNT(*) FROM sessions;
-- au-delà de 50 000 lignes, attendre le lendemain de la première tâche
-- planifiée, qui efface les sessions de plus de 60 jours) :
--   CREATE INDEX IF NOT EXISTS sessions_debut
--     ON sessions (debut, jeu_id, visiteur, duree_secondes, pays);
