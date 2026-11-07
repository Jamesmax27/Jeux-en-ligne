-- ==========================================================================
-- Podiums (historique des 3 premiers du classement général) — RÉFÉRENCE :
-- ces tables sont créées automatiquement par preparerTablesProfil
-- (functions/_profil.js) à la première requête ; rien à lancer à la main.
-- Base D1 « jeux-votes ». Aucune table existante n'est modifiée.
-- Docs : docs/cadrage-fidelisation.md, section 14.9 ; réglages : bloc
-- « Podiums » de public/profil-reglages.js.
--
-- À la fin de chaque semaine (lundi 00:00 UTC) et de chaque mois, les 3
-- premiers du classement général (XP de la période, profils de niveau 2 ou
-- plus) sont enregistrés une fois pour toutes, par la tâche quotidienne
-- (/api/stats-jour) ou, si elle n'est pas passée, par /api/classement.
-- Les gains par jour (profils_gains) sont effacés après 13 mois : seuls ces
-- podiums gardent la trace des périodes plus anciennes.
-- ==========================================================================

-- Une ligne par joueur du podium.
--   periode  'semaine' ou 'mois'
--   debut    premier jour de la période (« AAAA-MM-JJ », UTC : lundi ou 1er du mois)
--   place    ordre dans la période (1, 2, 3… ; plus de 3 lignes en cas d'égalité,
--            PODIUM_LIGNES_MAX au plus)
--   rang     place du classement, 1 à 3 (égalité de points : même rang)
--   profil   numéro du profil ; NULL quand le profil a été effacé (2 ans sans
--            visite) : « Ancien joueur » dans l'historique, aucun trophée transmis
--   points   XP gagnée sur la période
-- Trophées et badges du profil (podium-semaine-1…, podiums-3…, cadre « Couronne »)
-- sont tirés de cette table à chaque envoi du profil.
CREATE TABLE IF NOT EXISTS podiums (
  periode TEXT NOT NULL,
  debut TEXT NOT NULL,
  place INTEGER NOT NULL,
  rang INTEGER NOT NULL,
  profil INTEGER,
  points INTEGER NOT NULL,
  PRIMARY KEY (periode, debut, place)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS podiums_profil ON podiums (profil);

-- Périodes déjà enregistrées, même sans aucun joueur classé (évite de les recalculer).
CREATE TABLE IF NOT EXISTS podiums_periodes (
  periode TEXT NOT NULL,
  debut TEXT NOT NULL,
  calcule_le INTEGER NOT NULL,
  PRIMARY KEY (periode, debut)
) WITHOUT ROWID;
