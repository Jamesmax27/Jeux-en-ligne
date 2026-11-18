-- ==========================================================================
-- Classements « Jeux terminés » et « Jeux terminés à 100 % » — RÉFÉRENCE :
-- cette instruction est lancée automatiquement par preparerTablesProfil
-- (functions/_profil.js, preparerClassementJeu) à la première requête ; rien à
-- lancer à la main. Base D1 « jeux-votes ».
-- Docs : docs/cadrage-fidelisation.md, section 14.11 ; réglages :
-- CLASSEMENT_PERIMETRES_JEUX et CLASSEMENT_PERIODES_JEUX de public/profil-reglages.js.
--
-- Aucune nouvelle table ni colonne : ces classements comptent les lignes de
-- profils_jeux, déjà tenue à jour par le profil joueur.
-- ==========================================================================

-- Index partiel et couvrant : seuls les jeux à étoiles terminés y sont, et le
-- calcul (par joueur, date, étoiles) se fait sans lire la table.
CREATE INDEX IF NOT EXISTS profils_jeux_termines ON profils_jeux (profil, termine, etoiles, etoiles_max, etoiles_le) WHERE termine IS NOT NULL AND etoiles_max > 0;
