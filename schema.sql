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

-- --------------------------------------------------------------------------
-- Ajouts faits à la main dans la base en ligne (jeux-votes), sans migration
-- dans ce dépôt — rappel des colonnes utilisées par les fonctions :
--
--   votes.visiteur : empreinte SHA-256 de l'adresse IP + IP_SALT (jamais l'IP).
--
--   sessions (une ligne par partie, remplie par /api/session, lue par /api/tendances) :
--     id             identifiant (laissé à la base s'il est entier, sinon UUID)
--     jeu_id         id du jeu
--     debut          début de la partie (millisecondes si colonne numérique, sinon date ISO)
--     duree_secondes durée, de 2 s à 3 h
--     pays           request.cf.country, « XX » si inconnu
--     appareil       « mobile » ou « desktop »
--     erreur_js      première erreur JavaScript du jeu, ou NULL
--     visiteur       même empreinte que votes.visiteur
--
--   Index à créer à la main (console D1), pour que /api/tendances ne relise que
--   7 jours au lieu de toute la table, et pour l'effacement des parties de plus
--   de 13 mois (session.js) ; il contient toutes les colonnes lues par le calcul :
--     CREATE INDEX IF NOT EXISTS sessions_debut
--       ON sessions (debut, jeu_id, visiteur, duree_secondes, pays);
-- --------------------------------------------------------------------------
