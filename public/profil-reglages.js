// ==========================================================================
// Free Micro Games — réglages du profil joueur (fidélisation)
//
// FICHIER UNIQUE DE CONFIGURATION : toutes les valeurs réglables du profil
// (expérience, niveaux, déblocages, badges, jours consécutifs, multijoueur,
// anti-robots, classement, pseudos, conservation) sont ici, et seulement ici.
// On peut les changer sans toucher au reste du code. Référence :
// docs/cadrage-fidelisation.md.
//
// Lu par :
//   - le navigateur (public/profil.js, profil-pastille.js, profil-page.js,
//     classement.js) : affichage, estimation du niveau avant l'envoi ;
//   - le serveur (functions/_profil.js, functions/api/profil*.js,
//     functions/api/classement.js) : c'est lui qui calcule et qui décide ;
//   - le Worker multijoueur (multijoueur/src/profil.js) : durée minimale et
//     minimum d'actions d'une manche ;
//   - les tests (scripts/tester-profil.mjs).
// Un changement de valeur vaut pour les prochains gains : rien n'est recalculé
// en arrière (l'expérience déjà gagnée reste acquise). Seuls la courbe des
// niveaux et les déblocages s'appliquent tout de suite à tous les profils
// (le niveau est recalculé d'après l'expérience à chaque envoi).
// ==========================================================================

// --- Expérience (XP) : temps de jeu ---------------------------------------
export const XP_PAR_MINUTE = 10;              // XP par minute de jeu (jeu affiché et visible dans le lanceur)
export const MINUTES_MAX_JOUR = 60;           // minutes de jeu qui rapportent de l'XP par jour (UTC) ; au-delà, le temps est noté mais ne rapporte rien
export const TOLERANCE_TEMPS_S = 60;          // secondes acceptées en plus du temps réellement écoulé depuis l'envoi précédent (horloges, envoi tardif)
export const SECONDES_MAX_ENVOI = 3 * 3600;   // secondes de jeu déclarées au plus dans un seul envoi (au-delà : ramenées à ce plafond)

// --- Expérience : jeu terminé et étoiles -----------------------------------
export const BONUS_TERMINE = 100;             // XP de la première fois qu'un jeu est terminé (rejouer ne le redonne pas)
export const XP_PAR_ETOILE = 5;               // XP par étoile gagnée en plus du meilleur résultat déjà enregistré pour ce jeu
export const TERMINES_MAX_JOUR = 10;          // jeux terminés pour la première fois acceptés par jour (UTC) ; les suivants attendent le lendemain
export const DUREE_MIN_TERMINE_S = 60;        // temps de jeu total minimal sur un jeu (secondes) avant d'accepter « terminé »
export const ETOILES_MAX_JEU = 1500;          // étoiles possibles au plus pour un jeu qui ne déclare pas "etoiles" dans game.json

// --- Niveaux ----------------------------------------------------------------
// XP totale pour atteindre les premiers niveaux : niveau 1 = 0, niveau 2 = 20…
// Les 5 premiers s'atteignent en une séance (environ 16 minutes de jeu).
export const NIVEAUX_PREMIERS = [0, 20, 50, 100, 160];
export const NIVEAU_HAUSSE = 30;              // au-delà, chaque niveau demande 30 XP de plus que le précédent (6e : +90, 7e : +120…)
export const NIVEAU_MAX = 100;                // niveau le plus haut

// --- Synchronisation avec la base ------------------------------------------
export const SYNC_MINUTES = 5;                // envoi toutes les 5 minutes de jeu (et aussi : fin de jeu, passage de niveau, fermeture de la page)
export const RAFRAICHIR_MINUTES = 30;         // relecture du profil (sans écriture) au plus toutes les 30 min sur une page sans rien à envoyer
export const APPAREILS_MAX = 10;              // appareils reliés à un même profil par le code de sauvegarde (le plus ancien est oublié au-delà)

// --- Jours consécutifs (série) ---------------------------------------------
// Jour : celui de l'appareil du joueur (son fuseau horaire). Le serveur
// n'accepte qu'un jour à moins d'un jour de la date UTC (tous les fuseaux
// réels) et jamais un jour antérieur au dernier jour noté.
export const FUSEAU = 'appareil';             // 'appareil' (jour local du joueur) ; seule valeur prise en charge
export const JOURS_MANQUES_TOLERES = 1;       // jours sans visite tolérés entre deux visites sans casser la série (le jour manqué ne compte pas)
export const BONUS_SERIE_PAR_JOUR = 10;       // XP du retour quotidien : 10 × nombre de jours de la série…
export const BONUS_SERIE_MAX = 70;            // … plafonné à 70 XP (série de 7 jours ou plus)
export const PALIERS_SERIE = [3, 7, 14, 30];  // séries qui donnent un badge (serie-3, serie-7…)
export const BONUS_PALIER_SERIE = 50;         // XP en plus le jour où un palier de série est atteint

// --- Badges rares (en plus du badge de chaque jeu terminé) -----------------
export const PALIERS_TERMINES = [1, 5, 10, 25, 50, 100];   // jeux terminés : badges collection-1, collection-5…
export const PALIERS_ETOILES = [50, 200, 500, 1000];       // étoiles au total (meilleur résultat de chaque jeu) : etoiles-50…
export const PALIERS_NIVEAU = [10, 25, 50];                // niveaux : niveau-10…
// Le badge « etoiles-parfait » : toutes les étoiles d'un jeu.

// --- Multijoueur --------------------------------------------------------------
// Une manche en ligne terminée rapporte de l'XP ; le résultat est envoyé par le
// serveur multijoueur (jamais par le navigateur), une seule fois par manche et par joueur.
export const MULTI_XP_VICTOIRE_HUMAINS = 60;  // victoire dans une manche avec au moins un autre vrai joueur
export const MULTI_XP_VICTOIRE_ROBOTS = 20;   // victoire contre des robots seulement
export const MULTI_XP_PARTICIPATION = 5;      // manche jouée sans gagner
export const MULTI_XP_MAX_JOUR = 300;         // XP multijoueur au plus par jour (UTC), contre les parties vides relancées en boucle
export const MULTI_DUREE_MIN_S = 45;          // manche plus courte (secondes) : ignorée
export const MULTI_ACTIONS_MIN = 3;           // coups joués soi-même au moins dans la manche (pas ceux du robot à sa place) : sinon ignorée
export const MULTI_TICKET_MINUTES = 30;       // durée de validité du ticket d'entrée (Turnstile vérifié) qui relie la partie au profil
export const PALIERS_MULTI_VICTOIRES = [1, 3, 5, 10];      // victoires (toutes) : multi-victoires-1…
export const PALIERS_MULTI_HUMAINS = [1, 3, 5, 10];        // victoires contre de vrais joueurs : multi-humains-1…
export const PALIERS_MULTI_PARTIES = [1, 10, 50];          // manches jouées, gagnées ou non : multi-parties-1…
export const SERIE_MULTI_VICTOIRES = 3;                    // victoires d'affilée pour le badge multi-serie
// Le badge « multi-robot » : première victoire contre des robots.

// --- Code de sauvegarde et anti-robots ---------------------------------------
// « Adresse » = empreinte anonyme de l'adresse IP (jamais l'adresse elle-même).
export const CODE_MOTS = 4;                   // mots du code (tirés d'une liste de 2 048 : public/profil-mots.js)
export const CODE_ESSAIS_RATES_HEURE = 5;     // essais ratés de code par adresse et par heure avant un blocage
export const CODE_BLOCAGES_MINUTES = [60, 240, 1440, 10080]; // durée des blocages successifs : 1 h, 4 h, 24 h, puis 7 jours
export const CODE_BLOCAGE_OUBLI_JOURS = 7;    // sans nouvel échec pendant 7 jours, le blocage suivant redevient le premier
export const CODES_CREES_JOUR = 10;           // codes de sauvegarde créés au plus par adresse et par jour
export const PROFILS_CREES_JOUR = 60;         // profils créés au plus par adresse et par jour (une école partage souvent une adresse)
export const PSEUDOS_CHANGES_JOUR = 10;       // changements de pseudo au plus par adresse et par jour

// --- Classement ------------------------------------------------------------------
export const CLASSEMENT_PERIODES = ['semaine', 'mois'];    // périodes proposées ; la première est celle par défaut
export const CLASSEMENT_SEMAINE_DEBUT = 1;    // jour de remise à zéro de la semaine (UTC) : 1 = lundi
export const CLASSEMENT_TAILLE = 100;         // joueurs affichés (top 100)
export const CLASSEMENT_CACHE_S = 300;        // le top est recalculé au plus toutes les 5 minutes
export const CLASSEMENT_ETOILES = 'brut';     // classement « Étoiles » : étoiles gagnées sur la période ('brut'), pas un pourcentage
export const CLASSEMENT_NIVEAU_MIN = 2;       // niveau minimal pour apparaître dans un classement (écarte les profils créés par des robots)

// --- Pseudos ---------------------------------------------------------------------
export const PSEUDO_MIN = 3;                  // caractères au moins
export const PSEUDO_MAX = 16;                 // caractères au plus
export const PSEUDO_CHIFFRES_MAX = 4;         // chiffres d'affilée au plus (pas de numéro de téléphone)
export const SIGNALEMENTS_MAX = 3;            // signalements de joueurs différents avant que le pseudo redevienne « Joueur <nombre> »
export const SIGNALER_NIVEAU_MIN = 3;         // niveau minimal pour signaler un pseudo
export const NUMERO_MIN = 1000;               // nombre du pseudo par défaut (« Joueur 4821 ») : de…
export const NUMERO_MAX = 99999;              // … à

// --- Conservation ------------------------------------------------------------------
export const GAINS_JOURS_GARDES = 400;        // gains par jour (classements) gardés 13 mois, puis effacés
export const PROFIL_INACTIF_JOURS = 730;      // profil sans aucune visite depuis 2 ans : effacé avec tout ce qui s'y rattache
export const LIMITES_JOURS_GARDES = 2;        // traces des limites anti-robots (créations, essais) gardées 2 jours

// --- Avatars et cadres (déblocages) --------------------------------------------------
// avatar : { id, picto, niveau } (niveau requis) ou { id, picto, badge } (badge requis).
// L'identifiant ne change jamais (il est gardé dans la base) ; le picto peut changer.
export const AVATARS = [
  { id: 'chat', picto: '🐱', niveau: 1 },
  { id: 'chien', picto: '🐶', niveau: 1 },
  { id: 'lapin', picto: '🐰', niveau: 1 },
  { id: 'poussin', picto: '🐥', niveau: 1 },
  { id: 'poisson', picto: '🐟', niveau: 1 },
  { id: 'tortue', picto: '🐢', niveau: 1 },
  { id: 'cheval', picto: '🐴', niveau: 2 },
  { id: 'renard', picto: '🦊', niveau: 3 },
  { id: 'panda', picto: '🐼', niveau: 4 },
  { id: 'grenouille', picto: '🐸', niveau: 5 },
  { id: 'hibou', picto: '🦉', niveau: 6 },
  { id: 'koala', picto: '🐨', niveau: 7 },
  { id: 'pingouin', picto: '🐧', niveau: 8 },
  { id: 'tigre', picto: '🐯', niveau: 10 },
  { id: 'dauphin', picto: '🐬', niveau: 12 },
  { id: 'robot', picto: '🤖', niveau: 14 },
  { id: 'lion', picto: '🦁', niveau: 16 },
  { id: 'fusee', picto: '🚀', niveau: 18 },
  { id: 'dinosaure', picto: '🦖', niveau: 20 },
  { id: 'licorne', picto: '🦄', niveau: 25 },
  { id: 'dragon', picto: '🐉', niveau: 30 },
  { id: 'extraterrestre', picto: '👽', niveau: 40 },
  { id: 'couronne', picto: '👑', niveau: 50 },
  { id: 'arc-en-ciel', picto: '🌈', badge: 'serie-7' },
  { id: 'soleil', picto: '🌞', badge: 'serie-30' },
  { id: 'etoile', picto: '🌟', badge: 'etoiles-parfait' },
  { id: 'trophee', picto: '🏆', badge: 'collection-10' },
  { id: 'manette', picto: '🎮', badge: 'multi-victoires-1' },
  { id: 'medaille', picto: '🏅', badge: 'multi-humains-5' },
];

// cadre (contour de l'avatar dans la pastille et le classement) : mêmes règles.
// couleur : contour dessiné (variables CSS de public/style.css, --cadre-<id>).
export const CADRES = [
  { id: 'aucun', niveau: 1 },
  { id: 'bronze', niveau: 5 },
  { id: 'argent', niveau: 15 },
  { id: 'or', niveau: 30 },
  { id: 'arc-en-ciel', badge: 'serie-14' },
  { id: 'etoile', badge: 'etoiles-500' },
  { id: 'diamant', niveau: 60 },
];

// ==========================================================================
// Calculs tirés des réglages (même résultat dans le navigateur et le serveur).
// ==========================================================================

/** XP totale nécessaire pour atteindre le niveau n (1 → 0). */
export function seuilNiveau(n) {
  const niveau = Math.max(1, Math.min(NIVEAU_MAX, Math.floor(n)));
  if (niveau <= NIVEAUX_PREMIERS.length) return NIVEAUX_PREMIERS[niveau - 1];
  const k = NIVEAUX_PREMIERS.length;
  let seuil = NIVEAUX_PREMIERS[k - 1];
  let hausse = NIVEAUX_PREMIERS[k - 1] - NIVEAUX_PREMIERS[k - 2];
  for (let i = k + 1; i <= niveau; i++) {
    hausse += NIVEAU_HAUSSE;
    seuil += hausse;
  }
  return seuil;
}

/** Niveau correspondant à une XP totale. */
export function niveauPourXp(xp) {
  let n = 1;
  while (n < NIVEAU_MAX && seuilNiveau(n + 1) <= xp) n++;
  return n;
}

/** Badges rares possibles, dans l'ordre d'affichage : [{ id, famille, seuil? }]. */
export function listeBadges() {
  return [
    ...PALIERS_TERMINES.map((s) => ({ id: `collection-${s}`, famille: 'collection', seuil: s })),
    { id: 'etoiles-parfait', famille: 'etoiles' },
    ...PALIERS_ETOILES.map((s) => ({ id: `etoiles-${s}`, famille: 'etoiles', seuil: s })),
    ...PALIERS_SERIE.map((s) => ({ id: `serie-${s}`, famille: 'serie', seuil: s })),
    ...PALIERS_NIVEAU.map((s) => ({ id: `niveau-${s}`, famille: 'niveau', seuil: s })),
    ...PALIERS_MULTI_PARTIES.map((s) => ({ id: `multi-parties-${s}`, famille: 'multi', seuil: s })),
    ...PALIERS_MULTI_VICTOIRES.map((s) => ({ id: `multi-victoires-${s}`, famille: 'multi', seuil: s })),
    ...PALIERS_MULTI_HUMAINS.map((s) => ({ id: `multi-humains-${s}`, famille: 'multi', seuil: s })),
    { id: 'multi-robot', famille: 'multi' },
    { id: 'multi-serie', famille: 'multi', seuil: SERIE_MULTI_VICTOIRES },
  ];
}

/** L'élément (avatar ou cadre) est-il débloqué pour ce niveau et ces badges (ensemble d'id) ? */
export function estDebloque(element, niveau, badges) {
  if (!element) return false;
  if (element.badge) return badges.has(element.badge);
  return niveau >= (element.niveau || 1);
}
