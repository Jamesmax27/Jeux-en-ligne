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

-- L'ancien index votes_pays (country, game_id) servait au classement « Mon pays »,
-- retiré en octobre 2026 : il ne sert plus à rien et peut être supprimé de la
-- base en ligne (console D1 : DROP INDEX IF EXISTS votes_pays;).

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

-- --------------------------------------------------------------------------
-- Formulaire public de demandes (/proposer/) : limite de débit, abus et
-- blocages. Rien à faire à la main : ces tables sont créées automatiquement
-- par les fonctions (preparerTables, functions/_demandes.js) si elles
-- manquent. Toutes les colonnes « visiteur » sont l'empreinte de l'adresse IP
-- (comme votes.visiteur, réseau /64 en IPv6), jamais l'adresse elle-même.
-- --------------------------------------------------------------------------

-- Une ligne par demande transmise à GitHub (3 par heure, 10 par jour) ; effacée après 2 jours.
CREATE TABLE IF NOT EXISTS demandes_envois (visiteur TEXT NOT NULL, date INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS demandes_envois_visiteur ON demandes_envois (visiteur, date);

-- Issue GitHub ↔ empreinte de son auteur (abus signalé par la modération IA,
-- « Refuser et bannir ») ; effacée après 13 mois.
CREATE TABLE IF NOT EXISTS demandes_issues (issue INTEGER PRIMARY KEY, visiteur TEXT NOT NULL, date INTEGER NOT NULL);

-- Un abus par ligne (pot-de-miel, anti-robot, insulte, spam), avec l'issue en cause s'il y en a une ; effacé après 90 jours.
CREATE TABLE IF NOT EXISTS demandes_abus (visiteur TEXT NOT NULL, date INTEGER NOT NULL, motif TEXT NOT NULL, issue INTEGER);
CREATE INDEX IF NOT EXISTS demandes_abus_visiteur ON demandes_abus (visiteur, date);

-- État d'une empreinte : « bloque » (jusqu'à jusqu_a), « banni », « libre » (débloquée ou blocage passé).
CREATE TABLE IF NOT EXISTS demandes_blocages (
  visiteur TEXT PRIMARY KEY, statut TEXT NOT NULL, debut INTEGER, jusqu_a INTEGER, motif TEXT,
  abus INTEGER NOT NULL DEFAULT 0, blocages INTEGER NOT NULL DEFAULT 0, maj INTEGER NOT NULL
);
