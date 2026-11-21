-- ==========================================================================
-- Sauvegardes des jeux d'un appareil à l'autre — RÉFÉRENCE : cette instruction
-- est lancée automatiquement par preparerTablesProfil (functions/_profil.js) à
-- la première requête ; rien à lancer à la main. Base D1 « jeux-votes ».
-- Docs : docs/cadrage-fidelisation.md, section 14.13 ; réglages : bloc
-- « Sauvegardes des jeux » de public/profil-reglages.js ; côté appareil :
-- public/sauvegardes-nuage.js.
--
-- Une ligne par profil et par jeu : le texte de save_<id> (NULL : sauvegarde
-- effacée), sa version (+1 à chaque changement accepté), le niveau et le score
-- lus dans la sauvegarde (départage d'un conflit) et la date du dernier changement.
-- Effacée avec le profil (2 ans sans visite, tacheQuotidienneProfil).
-- Table ordinaire (avec rowid) : une sauvegarde peut faire jusqu'à 64 000 caractères.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS profils_sauvegardes (
  profil INTEGER NOT NULL, jeu TEXT NOT NULL, version INTEGER NOT NULL, donnees TEXT,
  niveau INTEGER, score REAL, maj INTEGER NOT NULL, PRIMARY KEY (profil, jeu));
