-- ==========================================================================
-- 0002 — Profil joueur (fidélisation, docs/cadrage-fidelisation.md)
--
-- RÉFÉRENCE SEULEMENT : rien à lancer à la main. Ces tables sont créées
-- automatiquement par les fonctions (preparerTablesProfil, functions/_profil.js)
-- au premier appel de /api/profil, /api/classement, /api/profil-multi ou
-- /api/stats-jour. Même texte SQL que dans ce fichier.
-- Aucune donnée personnelle : un profil est un numéro, un pseudo, un avatar et
-- des compteurs ; les appareils ne sont connus que par l'empreinte SHA-256 de
-- leur jeton ; « visiteur » = empreinte de l'adresse IP + IP_SALT (jamais l'adresse).
-- Durées de conservation : public/profil-reglages.js (section « Conservation »).
-- ==========================================================================

-- Un profil par joueur.
CREATE TABLE IF NOT EXISTS profils (
  id INTEGER PRIMARY KEY,                     -- numéro public (classement, signalement, ticket multijoueur)
  code TEXT UNIQUE,                           -- code de sauvegarde (4 mots + clé), NULL tant qu'il n'est pas demandé
  numero INTEGER NOT NULL,                    -- nombre du pseudo par défaut (« Joueur 4821 »)
  pseudo TEXT,                                -- pseudo choisi (NULL = pseudo par défaut)
  pseudo_norm TEXT UNIQUE,                    -- forme comparée du pseudo (unicité)
  avatar TEXT NOT NULL DEFAULT 'chat',        -- AVATARS de public/profil-reglages.js
  cadre TEXT NOT NULL DEFAULT 'aucun',        -- CADRES
  xp INTEGER NOT NULL DEFAULT 0,              -- expérience totale
  niveau INTEGER NOT NULL DEFAULT 1,          -- niveau (recalculé d'après xp)
  badges TEXT NOT NULL DEFAULT '[]',          -- badges rares : JSON [[id, date ms], …]
  serie INTEGER NOT NULL DEFAULT 0,           -- jours consécutifs en cours
  serie_record INTEGER NOT NULL DEFAULT 0,    -- record de jours consécutifs
  dernier_jour TEXT,                          -- dernier jour de visite (jour de l'appareil, AAAA-MM-JJ)
  premier_jour TEXT,                          -- jour de création (indicateurs de retour)
  multi TEXT NOT NULL DEFAULT '{}',           -- compteurs multijoueur : JSON { parties, victoires, humains, robots, serie, serieMax }
  cree_le INTEGER NOT NULL,                   -- création (ms)
  vu_le INTEGER NOT NULL,                     -- dernière visite (ms) : profil effacé après 2 ans sans visite
  sync_le INTEGER NOT NULL                    -- dernier envoi (ms) : le temps déclaré ne peut pas dépasser le temps écoulé depuis
);
CREATE INDEX IF NOT EXISTS profils_vu ON profils (vu_le);

-- Appareils reliés à un profil (jeton secret de l'appareil, empreinte seulement ; 10 au plus par profil).
CREATE TABLE IF NOT EXISTS profils_appareils (jeton TEXT PRIMARY KEY, profil INTEGER NOT NULL, cree_le INTEGER NOT NULL) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS profils_appareils_profil ON profils_appareils (profil, cree_le);

-- Jeux joués : temps, fin (« jeu terminé »), meilleures étoiles.
CREATE TABLE IF NOT EXISTS profils_jeux (
  profil INTEGER NOT NULL, jeu TEXT NOT NULL, secondes INTEGER NOT NULL DEFAULT 0,
  premiere INTEGER NOT NULL, derniere INTEGER NOT NULL, termine INTEGER, etoiles INTEGER, etoiles_max INTEGER,
  PRIMARY KEY (profil, jeu)) WITHOUT ROWID;

-- Gains par profil et par jour UTC (classements de la semaine et du mois, plafonds du jour) ; 13 mois.
CREATE TABLE IF NOT EXISTS profils_gains (
  profil INTEGER NOT NULL, jour TEXT NOT NULL, secondes INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0,
  etoiles INTEGER NOT NULL DEFAULT 0, termines INTEGER NOT NULL DEFAULT 0, multi_xp INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profil, jour)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS profils_gains_jour ON profils_gains (jour, profil, xp, etoiles);

-- Jours de visite (jour de l'appareil) : indicateurs de retour ; 13 mois.
CREATE TABLE IF NOT EXISTS profils_jours (profil INTEGER NOT NULL, jour TEXT NOT NULL, PRIMARY KEY (profil, jour)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS profils_jours_jour ON profils_jours (jour, profil);

-- Manches en ligne (envoyées par le Worker multijoueur) : une ligne par manche et par joueur ; 13 mois.
CREATE TABLE IF NOT EXISTS multi_resultats (
  partie TEXT NOT NULL, profil INTEGER NOT NULL, jeu TEXT NOT NULL, jour TEXT NOT NULL,
  victoire INTEGER NOT NULL, humains INTEGER NOT NULL, duree INTEGER NOT NULL, actions INTEGER NOT NULL,
  xp INTEGER NOT NULL, cree_le INTEGER NOT NULL, PRIMARY KEY (partie, profil)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS multi_resultats_jeu ON multi_resultats (jeu, jour, profil, xp);

-- Limites anti-robots (profils et codes créés, essais de code ratés, pseudos changés) ; 2 jours.
CREATE TABLE IF NOT EXISTS profils_limites (visiteur TEXT NOT NULL, quoi TEXT NOT NULL, date INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS profils_limites_visiteur ON profils_limites (visiteur, quoi, date);

-- Blocages progressifs des essais de code (1 h, 4 h, 24 h, 7 jours).
CREATE TABLE IF NOT EXISTS profils_blocages (visiteur TEXT PRIMARY KEY, jusqu_a INTEGER NOT NULL, rang INTEGER NOT NULL, maj INTEGER NOT NULL) WITHOUT ROWID;

-- Signalements de pseudos (un par joueur et par pseudo signalé).
CREATE TABLE IF NOT EXISTS profils_signalements (profil INTEGER NOT NULL, auteur INTEGER NOT NULL, date INTEGER NOT NULL, PRIMARY KEY (profil, auteur)) WITHOUT ROWID;

-- Compteurs par jour : profils créés, codes créés, restaurations.
CREATE TABLE IF NOT EXISTS profils_evenements (jour TEXT NOT NULL, type TEXT NOT NULL, nombre INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (jour, type)) WITHOUT ROWID;

-- Indicateurs de fidélisation, un calcul par jour UTC (onglet « Stats » de /idees).
CREATE TABLE IF NOT EXISTS fidelisation_jour (jour TEXT PRIMARY KEY, donnees TEXT NOT NULL, calcule_le INTEGER NOT NULL) WITHOUT ROWID;
