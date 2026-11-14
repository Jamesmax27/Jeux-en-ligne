-- ==========================================================================
-- Classement des étoiles par jeu (page de chaque jeu à étoiles) — RÉFÉRENCE :
-- ces instructions sont lancées automatiquement par preparerTablesProfil
-- (functions/_profil.js, preparerClassementJeu) à la première requête ; rien à
-- lancer à la main. Base D1 « jeux-votes ».
-- Docs : docs/cadrage-fidelisation.md, section 14.10 ; réglages :
-- CLASSEMENT_JEU_* de public/profil-reglages.js.
--
-- Aucune nouvelle table : le classement lit profils_jeux (meilleures étoiles de
-- chaque profil dans chaque jeu), déjà tenue à jour par le profil joueur.
-- ==========================================================================

-- Date (ms) à laquelle le joueur a atteint son meilleur nombre d'étoiles :
-- départage des égalités (le premier arrivé passe devant). N'est écrite que
-- quand les étoiles augmentent. ADD COLUMN ne réécrit aucune ligne.
ALTER TABLE profils_jeux ADD COLUMN etoiles_le INTEGER;

-- Étoiles gagnées avant cette colonne : date de la fin du jeu (une seule fois,
-- par l'instance qui a ajouté la colonne). Sans date, un joueur passe devant
-- ceux qui ont une date, à étoiles égales.
UPDATE profils_jeux SET etoiles_le = termine WHERE etoiles > 0 AND etoiles_le IS NULL AND termine IS NOT NULL;

-- Index du classement, dans son ordre (étoiles décroissantes, date, profil) :
-- le top 100 d'un jeu se lit sans tri, la position d'un joueur ne lit que les
-- joueurs placés devant lui. Partiel : seules les lignes avec des étoiles y sont.
CREATE INDEX IF NOT EXISTS profils_jeux_etoiles ON profils_jeux (jeu, etoiles DESC, etoiles_le, profil) WHERE etoiles > 0;
