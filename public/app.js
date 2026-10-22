// ==========================================================================
// Jeux-en-ligne — catalogue (page d'accueil)
// Charge catalog.json (généré par scripts/build-catalog.mjs) et affiche les
// jaquettes. Aucune dépendance. Les données des jeux ne sont jamais injectées
// en HTML brut : tout passe par textContent (sécurité).
//
// - Tri : Mieux notés (score de Wilson), Plus populaires (nombre de votes),
//   Populaires cette semaine, Nouveautés.
// - Portée : votes du monde entier, ou de mon pays (pays détecté par l'API ;
//   classement Monde tant que mon pays a moins de PAYS_VOTES_MIN votes).
// - Regroupements : tuiles des raccourcis (au hasard, jeux aimés, hors ligne)
//   et de l'âge, puis petites puces des genres et des univers (listes fermées
//   de taxonomie.js, dans leur ordre, chacune sur 2 rangées qui défilent si
//   elles ne tiennent pas). Combinables entre eux, avec le tri et avec la
//   recherche ; chaque tuile ou puce compte ses jeux. Un genre compte les jeux
//   dont c'est le genre principal ou secondaire. Un regroupement encore vide
//   est grisé (« Bientôt »).
// - Sans API des scores (hors connexion…) : tri par nouveautés, sans compteurs.
// - Les jeux déjà gardés sur l'appareil portent un badge « Disponible hors ligne ».
// - Tendances, en haut : les TENDANCES_NOMBRE jeux les plus joués des 7 derniers
//   jours (temps total, /api/tendances), sans tenir compte des filtres.
//   Cachées sans API ou tant qu'aucune partie n'est enregistrée.
// - Textes en 5 langues (langue.js, i18n/site/*.json). Le titre traduit du jeu
//   est affiché en bandeau sur sa jaquette (les jaquettes n'ont aucun texte).
//   Il y a un accueil par langue (/, /en/…, généré par scripts/pages-seo.mjs) :
//   changer de langue mène à l'accueil de cette langue.
// - Une carte mène à la fiche du jeu dans la langue de la page (chemins.js),
//   d'où le bouton « Jouer » ouvre le lanceur. « Au hasard » lance le jeu.
// - Adresses depuis la racine du site (/catalog.json, /api/…) : la page peut
//   être servie à /en/, /es/…
// ==========================================================================

import { votesEnAttente, envoyerEnAttente, mesVotes } from './votes.js';
import { activerHorsLigne, jeuxHorsLigne } from './hors-ligne.js';
import { GENRES, UNIVERS, IDS_GENRES, IDS_UNIVERS, TRANCHES_AGE, trancheDeAge } from './taxonomie.js';
import { urlJeu, urlLanceur } from './chemins.js';
import {
  t, getLang, demarrerLangue, surChangementLangue, majSeo,
  nomGenre, nomUnivers, titreJeu, descriptionJeu, jeuDisponible, jeuEnFrancais,
} from './langue.js';

const NOUVEAU_JOURS = 7;          // un jeu est « nouveau » pendant 7 jours
const NOUVEAUX_EN_TETE = 2;       // nouveautés intercalées en haut du tri « Mieux notés »
const ARCHIVE_VOTES_MIN = 30;     // archives : plus de 30 votes…
const ARCHIVE_SCORE_MAX = 0.2;    // … et un score inférieur à 0,2 (votes du monde entier)
const PAYS_VOTES_MIN = 20;        // sous 20 votes dans mon pays, classement Monde
const DELAI_SCORES = 4000;        // au-delà, on affiche sans attendre l'API
const TENDANCES_NOMBRE = 10;      // jeux montrés dans « Tendances »
const JAQUETTES_PRIORITAIRES = 4; // premières jaquettes de la grille chargées tout de suite

// Raccourcis du haut : des « collections » propres à l'appareil (noms : clés de traduction).
const COLLECTIONS = {
  aimes: { nom: 'collection.aimes', picto: '👍', teinte: 230, vide: 'collection.aimesVide' },
  'hors-ligne': { nom: 'collection.horsLigne', picto: '📶', teinte: 200, vide: 'collection.horsLigneVide' },
};

const SANS_VOTE = { up: 0, down: 0, score: 0, semaine: 0 };

const etat = {
  tous: [],               // tout le catalogue (catalog.json)
  jeux: [],               // jeux proposés dans la langue courante
  scoresMonde: null,      // { gameId: { up, down, score, semaine } } ; null = API indisponible
  scoresPays: undefined,  // idem pour mon pays : undefined = pas chargé, null = indisponible
  pays: null,             // pays détecté par l'API (ex. « FR »), ou null
  tendances: null,        // [{ id, sessions, tempsTotal, tempsMoyen }] ; null = API indisponible
  horsLigne: new Set(),   // jeux gardés sur l'appareil
  aimes: new Set(),       // jeux que j'ai notés 👍 sur cet appareil
  tri: 'notes',           // 'notes' | 'votes' | 'semaine' | 'nouveautes'
  portee: 'monde',        // 'monde' | 'pays'
  collection: null,       // 'aimes' | 'hors-ligne' | null
  age: null,              // tranche d'âge (TRANCHES_AGE), ou null
  genre: null,            // genre sélectionné (GENRES), ou null
  univers: null,          // univers sélectionné (UNIVERS), ou null
  texte: '',              // recherche
  erreur: false,          // le catalogue n'a pas pu être chargé
};

const el = {
  grille: document.getElementById('grille'),
  archives: document.getElementById('archives'),
  grilleArchives: document.getElementById('grille-archives'),
  compte: document.getElementById('compte'),
  note: document.getElementById('note-tri'),
  vide: document.getElementById('vide'),
  videTitre: document.getElementById('vide-titre'),
  videTexte: document.getElementById('vide-texte'),
  recherche: document.getElementById('recherche'),
  tri: document.getElementById('tri'),
  portee: document.getElementById('portee'),
  porteeChoix: document.querySelectorAll('#portee button'),
  resultats: document.getElementById('resultats'),
  titre: document.getElementById('titre-texte'),
  actifs: document.getElementById('filtres-actifs'),
  raccourcis: document.getElementById('raccourcis'),
  ages: document.getElementById('ages'),
  genres: document.getElementById('genres'),
  univers: document.getElementById('univers'),
  langue: document.getElementById('langue'),
  tendances: document.getElementById('tendances'),
  tendancesListe: document.getElementById('tendances-liste'),
};

// --- Outils ----------------------------------------------------------------

// Met en minuscules et retire les accents : « Équitation » → « equitation »
function normaliser(texte) {
  return String(texte ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function joursDepuis(dateIso) {
  const t = Date.parse(dateIso);
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86400000;
}

function estNouveau(jeu) {
  return joursDepuis(jeu.added) < NOUVEAU_JOURS;
}

// « FR » → « France » (nom du pays dans la langue du site).
function nomPays(code) {
  try {
    return new Intl.DisplayNames([getLang()], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

const nomAge = (tranche) => t(`age.${tranche.id}`);

// Jeux que j'ai notés 👍 sur cet appareil.
function jeuxAimes() {
  return new Set(Object.entries(mesVotes()).filter(([, v]) => v === 1).map(([id]) => id));
}

function totalVotes(scores) {
  return Object.values(scores).reduce((n, s) => n + s.up + s.down, 0);
}

// --- Scores pris en compte --------------------------------------------------

// Mon pays seulement s'il a assez de votes ; sinon le monde entier.
function paysRetenu() {
  return etat.portee === 'pays' && etat.scoresPays && totalVotes(etat.scoresPays) >= PAYS_VOTES_MIN;
}

// Scores du tri et des compteurs (null = API indisponible).
function scoresAffiches() {
  return paysRetenu() ? etat.scoresPays : etat.scoresMonde;
}

// Sans API, seul le tri par nouveautés a un sens.
function triEffectif() {
  return etat.scoresMonde ? etat.tri : 'nouveautes';
}

// Les archives se décident sur les votes du monde entier.
function estArchive(jeu) {
  const s = etat.scoresMonde?.[jeu.id];
  return !!s && s.up + s.down > ARCHIVE_VOTES_MIN && s.score < ARCHIVE_SCORE_MAX;
}

// --- Tri ---------------------------------------------------------------------

// Départage final par le titre français : le même ordre dans toutes les langues.
function parDate(a, b) {
  return String(b.added).localeCompare(String(a.added)) || a.title.localeCompare(b.title, 'fr');
}

// En cas d'égalité, on départage par le score, puis le nombre de votes, puis la date.
function comparateur(tri, scores) {
  const s = (jeu) => scores?.[jeu.id] || SANS_VOTE;
  const total = (jeu) => s(jeu).up + s(jeu).down;
  switch (tri) {
    case 'notes':
      return (a, b) => s(b).score - s(a).score || total(b) - total(a) || parDate(a, b);
    case 'votes':
      return (a, b) => total(b) - total(a) || s(b).score - s(a).score || parDate(a, b);
    case 'semaine':
      return (a, b) => s(b).semaine - s(a).semaine || s(b).score - s(a).score || total(b) - total(a) || parDate(a, b);
    default:
      return parDate;
  }
}

// Quelques nouveautés remontées en 2e et 4e position, pour récolter leurs premiers votes.
function intercalerNouveautes(liste) {
  const nouveaux = liste.filter(estNouveau).sort(parDate).slice(0, NOUVEAUX_EN_TETE);
  const resultat = liste.filter((j) => !nouveaux.includes(j));
  nouveaux.forEach((jeu, i) => resultat.splice(Math.min(1 + i * 2, resultat.length), 0, jeu));
  return resultat;
}

// --- Regroupements ---------------------------------------------------------

// Identifiants valides d'une liste du catalogue (taxonomie.js), sans doublon.
function idsValides(liste, permis) {
  return Array.isArray(liste) ? [...new Set(liste.filter((x) => permis.includes(x)))] : [];
}

function dansCollection(jeu, collection) {
  return collection === 'aimes' ? etat.aimes.has(jeu.id) : etat.horsLigne.has(jeu.id);
}

// Le jeu passe-t-il tous les filtres choisis, sauf celui de la famille « sauf » ?
// (Sert aussi à compter les jeux de chaque tuile en tenant compte des autres filtres.)
function correspond(jeu, recherche, sauf = null) {
  if (sauf !== 'collection' && etat.collection && !dansCollection(jeu, etat.collection)) return false;
  if (sauf !== 'age' && etat.age && jeu.tranche !== etat.age) return false;
  if (sauf !== 'genre' && etat.genre && !jeu.genres.includes(etat.genre)) return false;
  if (sauf !== 'univers' && etat.univers && !jeu.univers.includes(etat.univers)) return false;
  return !recherche || jeu.texte.includes(recherche);
}

function rechercheNormalisee() {
  return normaliser(etat.texte).trim();
}

function filtreActif() {
  return !!(etat.collection || etat.age || etat.genre || etat.univers || rechercheNormalisee());
}

// --- Filtrage et tri --------------------------------------------------------

// Renvoie { principaux, archives } (archives : seulement quand les votes sont connus).
function jeuxVisibles() {
  const recherche = rechercheNormalisee();
  const liste = etat.jeux.filter((j) => correspond(j, recherche));

  const tri = triEffectif();
  const comparer = comparateur(tri, scoresAffiches());
  const archives = liste.filter(estArchive).sort(comparer);
  let principaux = liste.filter((j) => !estArchive(j)).sort(comparer);
  if (tri === 'notes') principaux = intercalerNouveautes(principaux);
  return { principaux, archives };
}

// --- Affichage --------------------------------------------------------------

// Jaquette d'une carte : image, titre traduit en bandeau, badge « Nouveau ».
// prioritaire : jaquette visible dès l'arrivée (chargée tout de suite, pas en différé).
// Texte alternatif : le titre (le lien de la carte a son propre aria-label, plus complet).
function creerJaquette(jeu, prioritaire = false) {
  const jaquette = document.createElement('div');
  jaquette.className = 'jaquette';

  const img = document.createElement('img');
  img.src = `/${jeu.cover}`;
  img.alt = titreJeu(jeu);
  if (prioritaire) img.fetchPriority = 'high';
  else img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 600;
  img.height = 800;
  img.addEventListener('error', () => { img.src = '/assets/sans-jaquette.svg'; }, { once: true });
  jaquette.append(img);

  // Titre traduit, en bandeau sur le bas de la jaquette (elle ne contient aucun texte).
  const titre = document.createElement('h2');
  titre.className = 'carte-titre';
  titre.lang = getLang();
  titre.textContent = titreJeu(jeu);
  jaquette.append(titre);

  if (estNouveau(jeu)) {
    const badge = document.createElement('span');
    badge.className = 'badge-nouveau';
    badge.textContent = t('carte.nouveau');
    jaquette.append(badge);
  }
  return jaquette;
}

function creerCarte(jeu, scores, prioritaire = false) {
  const li = document.createElement('li');
  const titreAffiche = titreJeu(jeu);

  const lien = document.createElement('a');
  lien.className = 'carte';
  lien.href = urlJeu(jeu.id, getLang());

  const jaquette = creerJaquette(jeu, prioritaire);

  const horsLigne = etat.horsLigne.has(jeu.id);
  if (horsLigne) {
    const badge = document.createElement('span');
    badge.className = 'badge-hors-ligne';
    badge.textContent = t('carte.horsLigne');
    jaquette.append(badge);
  }

  const texte = document.createElement('div');
  texte.className = 'carte-texte';

  const infos = document.createElement('p');
  infos.className = 'carte-infos';
  // Genre principal et premier univers, en libellés courts.
  const themes = [jeu.genre && nomGenre(jeu.genre, true), jeu.univers[0] && nomUnivers(jeu.univers[0], true)].filter(Boolean);
  const enFrancais = jeuEnFrancais(jeu) ? `(${t('carte.enFrancais')})` : '';
  infos.textContent = [themes.join(' · '), jeu.ages, enFrancais].filter(Boolean).join(' — ');
  texte.append(infos);

  // Compteurs de pouces, seulement quand l'API répond (jamais hors connexion).
  // Le pouce lui-même est dessiné par style.css (.pouce-haut, .pouce-bas).
  let votes = '';
  if (scores) {
    const { up, down } = scores[jeu.id] || SANS_VOTE;
    const pouces = document.createElement('p');
    pouces.className = 'carte-pouces';
    const haut = document.createElement('span');
    haut.className = 'pouce-haut';
    haut.textContent = String(up);
    const bas = document.createElement('span');
    bas.className = 'pouce-bas';
    bas.textContent = String(down);
    pouces.append(haut, bas);
    texte.append(pouces);
    votes = t('carte.votesAria', { up, down });
  }

  lien.append(jaquette, texte);
  lien.setAttribute('aria-label', [`${titreAffiche}.`, descriptionJeu(jeu), enFrancais, votes, horsLigne && t('carte.horsLigneAria')].filter(Boolean).join(' '));
  li.append(lien);
  return li;
}

function afficherGrille() {
  const scores = scoresAffiches();
  const { principaux: liste, archives } = jeuxVisibles();
  el.grille.replaceChildren(...liste.map((jeu, i) => creerCarte(jeu, scores, i < JAQUETTES_PRIORITAIRES)));
  el.grilleArchives.replaceChildren(...archives.map((jeu) => creerCarte(jeu, scores)));
  el.archives.hidden = archives.length === 0;

  const total = liste.length + archives.length;
  el.titre.textContent = filtreActif() ? t('resultats.trouves') : t('resultats.tous');
  el.compte.textContent = `· ${nombreDeJeux(total)}`;
  el.vide.hidden = total > 0;
  el.videTitre.textContent = t('vide.titre');
  el.videTexte.textContent = t('vide.texte');
}

// --- Tendances --------------------------------------------------------------

// 40 → « 40 s » ; 75 → « 1 min » ; 8 100 → « 2 h 15 min »
function formaterDuree(secondes) {
  if (secondes < 60) return t('duree.secondes', { n: Math.max(1, Math.round(secondes)) });
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return t('duree.minutes', { n: minutes });
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  return min ? t('duree.heuresMinutes', { h, min }) : t('duree.heures', { h });
}

// Carte compacte : jaquette avec son rang, temps total joué, parties et temps moyen.
function creerCarteTendance(jeu, tendance, rang) {
  const li = document.createElement('li');
  const lien = document.createElement('a');
  lien.className = 'carte carte-tendance';
  lien.href = urlJeu(jeu.id, getLang());

  const jaquette = creerJaquette(jeu);
  const numero = document.createElement('span');
  numero.className = 'tendance-rang';
  numero.textContent = String(rang);
  jaquette.append(numero);

  const total = formaterDuree(tendance.tempsTotal);
  const parties = t('tendances.parties', { n: tendance.sessions });
  const moyenne = t('tendances.moyenne', { duree: formaterDuree(tendance.tempsMoyen) });

  const texte = document.createElement('div');
  texte.className = 'carte-texte';
  const temps = document.createElement('p');
  temps.className = 'tendance-temps';
  temps.textContent = total;
  const detail = document.createElement('p');
  detail.className = 'carte-infos';
  detail.textContent = `${parties} · ${moyenne}`;
  texte.append(temps, detail);

  lien.append(jaquette, texte);
  lien.setAttribute('aria-label', t('tendances.carteAria', { titre: titreJeu(jeu), rang, total, parties, moyenne }));
  li.append(lien);
  return li;
}

// Les premiers jeux des tendances proposés dans la langue courante.
function afficherTendances() {
  const parId = new Map(etat.jeux.map((jeu) => [jeu.id, jeu]));
  const liste = (etat.tendances || [])
    .filter((x) => parId.has(x.id) && x.tempsTotal > 0)
    .slice(0, TENDANCES_NOMBRE);
  el.tendancesListe.replaceChildren(...liste.map((x, i) => creerCarteTendance(parId.get(x.id), x, i + 1)));
  el.tendances.hidden = liste.length === 0;
  // Place gardée à la prochaine visite (script de tête de l'accueil), ou rendue.
  // Sans réponse de l'API (hors connexion…), on ne change pas ce qui est noté.
  if (etat.tendances) {
    try { localStorage.setItem('tendances', liste.length ? '1' : '0'); } catch { /* stockage refusé */ }
  }
  if (!liste.length) document.documentElement.classList.remove('avec-tendances');
}

// Menu de tri : sans API, seules les « Nouveautés » restent possibles.
function afficherTri() {
  const avecVotes = !!etat.scoresMonde;
  for (const option of el.tri.options) option.disabled = !avecVotes && option.value !== 'nouveautes';
  el.tri.value = triEffectif();
}

// Choix Monde / Mon pays : seulement si l'API répond et que le pays est connu.
function afficherPortee() {
  el.portee.hidden = !(etat.scoresMonde && etat.pays);
  el.porteeChoix.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.portee === etat.portee)));
}

// Petite phrase sous le nombre de jeux, quand le classement mérite une explication.
function afficherNote() {
  let note = '';
  if (!etat.scoresMonde) {
    note = navigator.onLine === false ? t('note.horsConnexion') : t('note.votesIndisponibles');
  } else if (etat.portee === 'pays' && etat.pays) {
    const pays = nomPays(etat.pays);
    if (etat.scoresPays === undefined) note = t('note.chargementPays', { pays });
    else if (etat.scoresPays === null) note = t('note.paysIndisponible');
    else if (!paysRetenu()) note = t('note.paysPeuDeVotes', { min: PAYS_VOTES_MIN, pays });
    else note = t('note.paysSeul', { pays });
  }
  el.note.textContent = note;
  el.note.hidden = !note;
}

function afficher() {
  afficherTri();
  afficherPortee();
  afficherNote();
  rafraichir();
}

// « 0 jeu », « 1 jeu », « 2 jeux » (pluriels selon la langue)
function nombreDeJeux(n) {
  return t('nombre.jeux', { n });
}

// Tuile d'un regroupement. compte : jeux avec les autres filtres choisis ;
// total : jeux du catalogue entier (0 = regroupement encore vide, grisé).
function creerTuile({ cle, picto, nom, teinte, actif, compte, total, vide = t('tuile.bientot'), aide, action }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tuile';
  b.dataset.cle = cle;
  if (teinte !== undefined) b.style.setProperty('--teinte', teinte);

  const icone = document.createElement('span');
  icone.className = 'tuile-picto';
  icone.setAttribute('aria-hidden', 'true');
  icone.textContent = picto;

  const titre = document.createElement('span');
  titre.className = 'tuile-nom';
  titre.lang = getLang();
  titre.textContent = nom;

  const sous = document.createElement('span');
  sous.className = 'tuile-compte';
  b.append(icone, titre, sous);

  if (actif !== undefined) b.setAttribute('aria-pressed', String(actif));
  if (total === 0) {
    b.disabled = true;
    b.classList.add('tuile-bientot');
    sous.textContent = vide;
    b.setAttribute('aria-label', t('tuile.aria', { nom, etat: vide.toLocaleLowerCase(getLang()) }));
  } else if (compte !== undefined) {
    sous.textContent = nombreDeJeux(compte);
    if (compte === 0 && !actif) b.classList.add('tuile-zero');
    b.setAttribute('aria-label', t('tuile.aria', { nom: aide || nom, etat: nombreDeJeux(compte) }));
  } else {
    sous.textContent = aide;
  }
  b.addEventListener('click', action);
  return b;
}

function creerPuce(texte, picto, actif, action, etiquetteAria) {
  const b = document.createElement('button');
  b.className = 'puce';
  b.type = 'button';
  if (picto) {
    const icone = document.createElement('span');
    icone.className = 'puce-picto';
    icone.setAttribute('aria-hidden', 'true');
    icone.textContent = picto;
    b.append(icone);
  }
  b.append(texte);
  if (actif !== null) b.setAttribute('aria-pressed', String(actif));
  if (etiquetteAria) b.setAttribute('aria-label', etiquetteAria);
  b.addEventListener('click', action);
  return b;
}

// Petite puce d'un genre ou d'un univers : pictogramme, libellé court et nombre
// de jeux (selon les autres filtres), sans retour à la ligne ; libellé complet
// dans la bulle d'aide et pour les lecteurs d'écran. total = 0 : regroupement
// encore vide, grisé, sans nombre.
function creerPuceFiltre({ cle, picto, nom, nomComplet, teinte, actif, compte, total, action }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'puce-filtre';
  b.dataset.cle = cle;
  b.style.setProperty('--teinte', teinte);

  const icone = document.createElement('span');
  icone.className = 'puce-filtre-picto';
  icone.setAttribute('aria-hidden', 'true');
  icone.textContent = picto;

  const texte = document.createElement('span');
  texte.lang = getLang();
  texte.textContent = nom;
  b.append(icone, texte);
  b.setAttribute('aria-pressed', String(actif));

  let etatTexte = nombreDeJeux(compte);
  if (total === 0) {
    b.disabled = true;
    b.classList.add('puce-bientot');
    etatTexte = t('tuile.bientot').toLocaleLowerCase(getLang());
  } else {
    const nombre = document.createElement('span');
    nombre.className = 'puce-filtre-compte';
    nombre.setAttribute('aria-hidden', 'true');
    nombre.textContent = window.JEL_I18N.nombre(compte);
    b.append(nombre);
    if (compte === 0 && !actif) b.classList.add('puce-zero');
  }
  b.title = t('tuile.aria', { nom: nomComplet, etat: etatTexte });
  b.setAttribute('aria-label', b.title);
  b.addEventListener('click', action);
  return b;
}

// Répartit les puces sur les 2 rangées du groupe (13 + 13 genres, 12 + 12 univers).
// Les rangées restent en place : chacune garde sa position de défilement.
function remplirRangees(groupe, puces) {
  const [haut, bas] = groupe.querySelectorAll('.rangee');
  const moitie = Math.ceil(puces.length / 2);
  haut.replaceChildren(...puces.slice(0, moitie));
  bas.replaceChildren(...puces.slice(moitie));
}

// Choisit (ou retire, si déjà choisi) un filtre, puis met tout à jour.
function choisir(famille, valeur) {
  etat[famille] = etat[famille] === valeur ? null : valeur;
  rafraichir();
  if (etat[famille]) montrerResultats();
}

// Après le choix d'une tuile, fait défiler jusqu'aux jeux s'ils sont hors de vue.
function montrerResultats() {
  if (el.resultats.getBoundingClientRect().top < innerHeight * 0.7) return;
  const doux = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.resultats.scrollIntoView({ behavior: doux ? 'smooth' : 'auto', block: 'start' });
}

// Lance un jeu au hasard parmi ceux affichés (donc en respectant les filtres).
function jouerAuHasard() {
  const { principaux } = jeuxVisibles();
  const liste = principaux.length ? principaux : etat.jeux;
  const jeu = liste[Math.floor(Math.random() * liste.length)];
  if (jeu) location.href = urlLanceur(jeu.id, getLang());
}

// Nombre de jeux par valeur, en tenant compte des autres filtres (compte)
// et sur le catalogue entier (total).
function compter(famille, valeursDuJeu) {
  const recherche = rechercheNormalisee();
  const compte = new Map();
  const total = new Map();
  for (const jeu of etat.jeux) {
    const valeurs = valeursDuJeu(jeu);
    const retenu = correspond(jeu, recherche, famille);
    for (const v of valeurs) {
      total.set(v, (total.get(v) || 0) + 1);
      if (retenu) compte.set(v, (compte.get(v) || 0) + 1);
    }
  }
  return { compte: (v) => compte.get(v) || 0, total: (v) => total.get(v) || 0 };
}

function afficherRegroupements() {
  // Les tuiles sont recréées : on rend le focus clavier à celle qui l'avait.
  const cleFocus = document.activeElement?.dataset?.cle;

  // Raccourcis : au hasard, jeux aimés, jeux hors ligne.
  const collections = compter('collection', (j) => Object.keys(COLLECTIONS).filter((c) => dansCollection(j, c)));
  el.raccourcis.replaceChildren(
    creerTuile({
      cle: 'hasard', picto: '🎲', nom: t('raccourci.hasard'), teinte: 265, aide: t('raccourci.hasardAide'),
      total: etat.jeux.length, vide: t('raccourci.aucunJeu'), action: jouerAuHasard,
    }),
    ...Object.entries(COLLECTIONS).map(([id, c]) => creerTuile({
      cle: `collection:${id}`, picto: c.picto, nom: t(c.nom), teinte: c.teinte, vide: t(c.vide),
      actif: etat.collection === id, compte: collections.compte(id), total: collections.total(id),
      action: () => choisir('collection', id),
    })),
  );

  // Âge conseillé.
  const ages = compter('age', (j) => (j.tranche ? [j.tranche] : []));
  el.ages.replaceChildren(...TRANCHES_AGE.map((tr) => creerTuile({
    cle: `age:${tr.id}`, picto: tr.picto, nom: nomAge(tr), aide: t(`age.${tr.id}.aide`),
    actif: etat.age === tr.id, compte: ages.compte(tr.id), total: ages.total(tr.id),
    action: () => choisir('age', tr.id),
  })));

  // Genres (principal ou secondaire) et univers : listes fermées de taxonomie.js, dans leur ordre.
  const genres = compter('genre', (j) => j.genres);
  remplirRangees(el.genres, GENRES.map((g) => creerPuceFiltre({
    cle: `genre:${g.id}`, picto: g.picto, nom: nomGenre(g.id, true), nomComplet: nomGenre(g.id), teinte: g.teinte,
    actif: etat.genre === g.id, compte: genres.compte(g.id), total: genres.total(g.id),
    action: () => choisir('genre', g.id),
  })));

  const univers = compter('univers', (j) => j.univers);
  remplirRangees(el.univers, UNIVERS.map((u) => creerPuceFiltre({
    cle: `univers:${u.id}`, picto: u.picto, nom: nomUnivers(u.id, true), nomComplet: nomUnivers(u.id), teinte: u.teinte,
    actif: etat.univers === u.id, compte: univers.compte(u.id), total: univers.total(u.id),
    action: () => choisir('univers', u.id),
  })));

  if (cleFocus) document.querySelector(`[data-cle="${CSS.escape(cleFocus)}"]`)?.focus();
}

// Filtres choisis, rappelés au-dessus des jeux : une puce ✕ pour retirer chacun.
function afficherFiltresActifs() {
  const actifs = [];
  const ajouter = (picto, nom, retirer) => actifs.push(
    creerPuce(nom, picto, null, () => { retirer(); rafraichir(); }, t('filtres.retirer', { nom })),
  );
  if (etat.collection) {
    const c = COLLECTIONS[etat.collection];
    ajouter(c.picto, t(c.nom), () => { etat.collection = null; });
  }
  if (etat.age) {
    const tr = TRANCHES_AGE.find((x) => x.id === etat.age);
    ajouter(tr.picto, nomAge(tr), () => { etat.age = null; });
  }
  if (etat.genre) {
    const g = GENRES.find((x) => x.id === etat.genre);
    ajouter(g.picto, nomGenre(g.id), () => { etat.genre = null; });
  }
  if (etat.univers) {
    const u = UNIVERS.find((x) => x.id === etat.univers);
    ajouter(u.picto, nomUnivers(u.id), () => { etat.univers = null; });
  }
  if (rechercheNormalisee()) {
    ajouter('🔎', t('filtres.recherche', { texte: etat.texte.trim() }), () => { etat.texte = ''; el.recherche.value = ''; });
  }
  for (const puce of actifs) puce.classList.add('puce-active');

  if (actifs.length > 1) {
    const tout = creerPuce(t('filtres.toutEffacer'), null, null, () => {
      Object.assign(etat, { collection: null, age: null, genre: null, univers: null, texte: '' });
      el.recherche.value = '';
      rafraichir();
    });
    tout.classList.add('puce-effacer');
    actifs.push(tout);
  }
  el.actifs.replaceChildren(...actifs);
  el.actifs.hidden = actifs.length === 0;
}

// Tout ce qui dépend des filtres : tuiles (et leurs comptes), rappel des filtres, jeux.
function rafraichir() {
  if (etat.erreur) return;
  afficherRegroupements();
  afficherFiltresActifs();
  afficherGrille();
}

// --- Langue -----------------------------------------------------------------

function afficherSeo() {
  majSeo({ titre: t('meta.titre'), description: t('meta.description') });
}

// Jeux proposés dans la langue courante, avec leur texte de recherche
// (titre et description en français et dans la langue courante, noms affichés
// des genres et des univers, complets et courts).
function preparerJeux() {
  etat.jeux = etat.tous.filter(jeuDisponible);
  for (const jeu of etat.jeux) {
    jeu.texte = normaliser([
      jeu.title, jeu.description, titreJeu(jeu), descriptionJeu(jeu),
      ...jeu.genres.flatMap((g) => [nomGenre(g), nomGenre(g, true)]),
      ...jeu.univers.flatMap((u) => [nomUnivers(u), nomUnivers(u, true)]),
    ].join(' '));
  }
}

surChangementLangue(() => {
  afficherSeo();
  if (etat.erreur) {
    afficherErreurCatalogue();
    return;
  }
  preparerJeux();
  afficher();
  afficherTendances();
});

// --- Scores -----------------------------------------------------------------

function scoresValides(donnees) {
  const scores = {};
  if (!donnees || typeof donnees !== 'object') return scores;
  for (const [id, s] of Object.entries(donnees)) {
    scores[id] = {
      up: Number(s?.up) || 0,
      down: Number(s?.down) || 0,
      score: Number(s?.score) || 0,
      semaine: Number(s?.semaine) || 0,
    };
  }
  return scores;
}

// Ne lève jamais d'erreur. Renvoie { scores, pays }, ou null si l'API ne répond pas.
async function chargerScores(pays) {
  // Hors connexion : pas de votes, même si le navigateur en garde une copie récente.
  if (navigator.onLine === false) return null;
  try {
    const adresse = pays ? `/api/scores?pays=${encodeURIComponent(pays)}` : '/api/scores';
    const reponse = await fetch(adresse, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(DELAI_SCORES) : undefined,
    });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const paysDetecte = reponse.headers.get('X-Pays') || '';
    return {
      scores: scoresValides(await reponse.json()),
      pays: /^[A-Z]{2}$/.test(paysDetecte) ? paysDetecte : null,
    };
  } catch (erreur) {
    console.warn('Scores indisponibles :', erreur);
    return null;
  }
}

// Ne lève jamais d'erreur. Renvoie la liste des tendances, ou null si l'API ne répond pas.
async function chargerTendances() {
  if (navigator.onLine === false) return null;
  try {
    const reponse = await fetch('/api/tendances', {
      signal: AbortSignal.timeout ? AbortSignal.timeout(DELAI_SCORES) : undefined,
    });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const donnees = await reponse.json();
    return (Array.isArray(donnees?.jeux) ? donnees.jeux : [])
      .filter((x) => typeof x?.id === 'string')
      .map((x) => ({
        id: x.id,
        sessions: Number(x.sessions) || 0,
        tempsTotal: Number(x.tempsTotal) || 0,
        tempsMoyen: Number(x.tempsMoyen) || 0,
      }));
  } catch (erreur) {
    console.warn('Tendances indisponibles :', erreur);
    return null;
  }
}

// --- Événements -------------------------------------------------------------

el.tri.addEventListener('change', () => {
  etat.tri = el.tri.value;
  afficher();
});

el.porteeChoix.forEach((bouton) => {
  bouton.addEventListener('click', async () => {
    etat.portee = bouton.dataset.portee;
    afficher();
    // Votes de mon pays : chargés à la première demande seulement.
    if (etat.portee === 'pays' && etat.scoresPays === undefined) {
      const resultat = await chargerScores(etat.pays);
      etat.scoresPays = resultat ? resultat.scores : null;
      afficher();
    }
  });
});

el.recherche.addEventListener('input', () => {
  etat.texte = el.recherche.value;
  rafraichir();
});

// Retour de la connexion : on récupère les votes et les tendances s'ils manquaient.
addEventListener('online', async () => {
  if (etat.jeux.length === 0) return;
  if (!etat.tendances) {
    chargerTendances().then((tendances) => {
      etat.tendances = tendances;
      afficherTendances();
    });
  }
  if (etat.scoresMonde) return;
  const resultat = await chargerScores();
  if (!resultat) return;
  etat.scoresMonde = resultat.scores;
  etat.pays = resultat.pays;
  afficher();
});

// Retour avec le bouton « Précédent » : la page réapparaît telle quelle,
// alors qu'un jeu vient peut-être d'être gardé hors ligne.
addEventListener('pageshow', async (evenement) => {
  if (!evenement.persisted || etat.jeux.length === 0) return;
  etat.horsLigne = await jeuxHorsLigne();
  etat.aimes = jeuxAimes();
  rafraichir();
});

// --- Démarrage --------------------------------------------------------------

function afficherErreurCatalogue() {
  el.compte.textContent = '';
  el.vide.hidden = false;
  el.videTitre.textContent = t('catalogue.erreurTitre');
  el.videTexte.textContent = t('catalogue.erreurTexte');
}

async function demarrer() {
  const scores = chargerScores(); // en parallèle du catalogue et des textes
  const tendances = chargerTendances();
  const horsLigne = jeuxHorsLigne();
  const textes = demarrerLangue(el.langue);
  try {
    const reponse = await fetch('/catalog.json', { cache: 'no-cache' });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const catalogue = await reponse.json();
    // Seuls les identifiants des listes fermées (taxonomie.js) sont gardés.
    etat.tous = (catalogue.games || []).map((j) => {
      const genre = IDS_GENRES.includes(j.genre) ? j.genre : '';
      const jeu = {
        ...j,
        genre,
        genres: idsValides([genre, ...(Array.isArray(j.genres_secondaires) ? j.genres_secondaires : [])], IDS_GENRES),
        univers: idsValides(j.univers, IDS_UNIVERS),
      };
      jeu.tranche = trancheDeAge(jeu.ages);
      return jeu;
    });
  } catch (erreur) {
    console.error('Impossible de charger le catalogue :', erreur);
    etat.erreur = true;
    await textes;
    afficherSeo();
    afficherErreurCatalogue();
    return;
  }
  await textes;
  afficherSeo();
  preparerJeux();
  const resultat = await scores;
  if (resultat) {
    etat.scoresMonde = resultat.scores;
    etat.pays = resultat.pays;
  }
  etat.horsLigne = await horsLigne;
  etat.aimes = jeuxAimes();
  afficher();

  // Les tendances s'ajoutent en haut dès qu'elles arrivent, sans retarder le catalogue.
  etat.tendances = await tendances;
  afficherTendances();

  // Votes restés en attente (faits hors ligne) : on retente l'envoi.
  if (votesEnAttente()) envoyerEnAttente();
}

activerHorsLigne();
demarrer();
