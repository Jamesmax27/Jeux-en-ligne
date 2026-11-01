-- ==========================================================================
-- Amis (docs/consigne-amis.md) — RÉFÉRENCE : ces tables sont créées
-- automatiquement par preparerTablesProfil (functions/_profil.js) à la
-- première requête ; rien à lancer à la main. Base D1 « jeux-votes ».
-- Aucune table existante n'est modifiée.
--
-- La présence (en ligne, en jeu, partie en cours) n'est PAS ici : elle vit
-- dans le Durable Object « Presence » du Worker multijoueur
-- (multijoueur/src/presence.js), seulement le dernier état de chaque
-- profil, quelques minutes, jamais écrit dans D1.
-- ==========================================================================

-- Une ligne par profil et par autre profil, vue de ce profil :
--   'envoyee'  demande envoyée (l'autre a une ligne 'recue')
--   'recue'    demande reçue
--   'ami'      amitié acceptée (une ligne de chaque côté)
--   'bloque'   j'ai bloqué l'autre (sa ligne vers moi est effacée : il ne voit
--              plus rien et ne peut plus m'envoyer de demande)
-- Demande sans réponse effacée après AMIS_DEMANDE_JOURS (30) ; tout est effacé
-- avec le profil (2 ans sans visite). Un profil retrouvé par le code de
-- sauvegarde garde ses amis (ils sont attachés au numéro du profil).
CREATE TABLE IF NOT EXISTS amis (
  profil  INTEGER NOT NULL,      -- numéro du profil (profils.id)
  autre   INTEGER NOT NULL,      -- numéro de l'autre profil
  etat    TEXT NOT NULL,         -- 'envoyee' | 'recue' | 'ami' | 'bloque'
  cree_le INTEGER NOT NULL,      -- première demande (ms)
  maj_le  INTEGER NOT NULL,      -- dernier changement d'état (ms)
  PRIMARY KEY (profil, autre)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS amis_etat ON amis (etat, maj_le);   -- effacement des vieilles demandes

-- Réglages du profil pour les amis : mode invisible (se montrer hors ligne).
CREATE TABLE IF NOT EXISTS amis_reglages (
  profil    INTEGER PRIMARY KEY,
  invisible INTEGER NOT NULL DEFAULT 0,   -- 1 : les amis voient ce profil hors ligne, sa présence n'est jamais lue
  maj_le    INTEGER NOT NULL
) WITHOUT ROWID;

-- Limites anti-abus des demandes : table existante profils_limites (quoi = 'ami',
-- visiteur = empreinte de l'adresse, ou 'profil:<numéro>'), 2 jours.
-- Indicateurs : table existante profils_evenements (types 'ami-demande',
-- 'ami-accepte', 'rejoindre', 'rejoindre-partie'), résumés chaque jour dans
-- fidelisation_jour (champ « amis »).
