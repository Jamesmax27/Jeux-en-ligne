-- ==========================================================================
-- Structure de la base D1 (liée au projet Cloudflare Pages sous le nom DB).
-- La table existe déjà en ligne : ce fichier sert de référence et pour
-- recréer une base de test :
--   npx wrangler d1 execute <nom-de-la-base> --local --file=schema.sql
-- ==========================================================================

CREATE TABLE IF NOT EXISTS votes (
  game_id    TEXT    NOT NULL,                              -- id du jeu (nom du dossier games/<id>)
  voter      TEXT    NOT NULL,                              -- empreinte SHA-256 anonyme du votant
  value      INTEGER NOT NULL CHECK (value IN (-1, 1)),     -- 1 = 👍, -1 = 👎 (une annulation supprime la ligne)
  country    TEXT,                                          -- pays (en-tête CF-IPCountry), « XX » si inconnu
  created_at INTEGER NOT NULL,                              -- date du dernier vote, en millisecondes
  PRIMARY KEY (game_id, voter)
);

-- Accélère /api/scores?pays=FR
CREATE INDEX IF NOT EXISTS votes_pays ON votes (country, game_id);
