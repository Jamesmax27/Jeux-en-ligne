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
// - Regroupements en tuiles (définis dans regroupements.js) : raccourcis
//   (au hasard, jeux aimés, hors ligne), âge, genres, univers et autres
//   thèmes. Combinables entre eux, avec le tri et avec la recherche ; chaque
//   tuile compte ses jeux. Un regroupement encore vide est grisé (« Bientôt »).
// - Sans API des scores (hors connexion…) : tri par nouveautés, sans compteurs.
// - Les jeux déjà gardés sur l'appareil portent un badge « Disponible hors ligne ».
// - Textes en 5 langues (langue.js, i18n/site/*.json). Le titre traduit du jeu
//   est affiché en bandeau sur sa jaquette (les jaquettes n'ont aucun texte).
//   Changer de langue ne change ni le tri, ni les votes, ni les filtres.
// ==========================================================================

import { votesEnAttente, envoyerEnAttente, mesVotes } from './votes.js';
import { activerHorsLigne, jeuxHorsLigne } from './hors-ligne.js';
import { GENRES_AFFICHAGE, UNIVERS, TRANCHES_AGE } from './regroupements.js';
import {
  t, getLang, demarrerLangue, surChangementLangue, majSeo,
  nomGenre, nomTag, titreJeu, descriptionJeu, jeuDisponible, jeuEnFrancais,
} from './langue.js';

const NOUVEAU_JOURS = 7;          // un jeu est « nouveau » pendant 7 jours
const NOUVEAUX_EN_TETE = 2;       // nouveautés intercalées en haut du tri « Mieux notés »
const ARCHIVE_VOTES_MIN = 30;     // archives : plus de 30 votes…
const ARCHIVE_SCORE_MAX = 0.2;    // … et un score inférieur à 0,2 (votes du monde entier)
const PAYS_VOTES_MIN = 20;        // sous 20 votes dans mon pays, classement Monde
const DELAI_SCORES = 4000;        // au-delà, on affiche sans attendre l'API

// Raccourcis du haut : des « collections » propres à l'appareil (noms : clés de traduction).
const COLLECTIONS = {
  aimes: { nom: 'collection.aimes', picto: '👍', teinte: 230, vide: 'collection.aimesVide' },
  'hors-ligne': { nom: 'collection.horsLigne', picto: '📶', teinte: 200, vide: 'collection.horsLigneVide' },
};

const SANS_VOTE = { up: 0, down: 0, score: 0, semaine: 0 };

const etat = {
  tous: [],               // tout le catalogue (catalog.json)
  jeux: [],               // jeux proposés dans la langue courante
  genres: [],             // ordre des genres (catalog.json)
  scoresMonde: null,      // { gameId: { up, down, score, semaine } } ; null = API indisponible
  scoresPays: undefined,  // idem pour mon pays : undefined = pas chargé, null = indisponible
  pays: null,             // pays détecté par l'API (ex. « FR »), ou null
  horsLigne: new Set(),   // jeux gardés sur l'appareil
  aimes: new Set(),       // jeux que j'ai notés 👍 sur cet appareil
  tri: 'notes',           // 'notes' | 'votes' | 'semaine' | 'nouveautes'
  portee: 'monde',        // 'monde' | 'pays'
  collection: null,       // 'aimes' | 'hors-ligne' | null
  age: null,              // tranche d'âge (TRANCHES_AGE), ou null
  genre: null,            // genre sélectionné, ou null
  univers: null,          // univers sélectionné (UNIVERS), ou null
  etiquette: null,        // autre thème (tag hors univers), ou null
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
  autresThemes: document.getElementById('autres-themes'),
  toutVoir: document.querySelectorAll('.tout-voir'),
  langue: document.getElementById('langue'),
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

const nomUnivers = (u) => t(`univers.${u.id}`);
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

// « 6+ » → tranche « 5-6 » (TRANCHES_AGE) ; âge illisible → null.
function trancheAge(ages) {
  const age = parseInt(ages, 10);
  if (Number.isNaN(age)) return null;
  return TRANCHES_AGE.find((t) => age >= t.min && age <= t.max)?.id ?? null;
}

// Univers d'un jeu : ceux dont un tag correspond à son genre ou à l'un de ses tags.
function universDuJeu(jeu) {
  const mots = new Set([jeu.genre, ...jeu.tags].map((m) => m.normalize('NFC')));
  return UNIVERS.filter((u) => u.tags.some((t) => mots.has(t))).map((u) => u.id);
}

function dansCollection(jeu, collection) {
  return collection === 'aimes' ? etat.aimes.has(jeu.id) : etat.horsLigne.has(jeu.id);
}

// Le jeu passe-t-il tous les filtres choisis, sauf celui de la famille « sauf » ?
// (Sert aussi à compter les jeux de chaque tuile en tenant compte des autres filtres.)
function correspond(jeu, recherche, sauf = null) {
  if (sauf !== 'collection' && etat.collection && !dansCollection(jeu, etat.collection)) return false;
  if (sauf !== 'age' && etat.age && jeu.tranche !== etat.age) return false;
  if (sauf !== 'genre' && etat.genre && jeu.genre !== etat.genre) return false;
  if (sauf !== 'theme') {
    if (etat.univers && !jeu.univers.includes(etat.univers)) return false;
    if (etat.etiquette && !jeu.tags.includes(etat.etiquette)) return false;
  }
  return !recherche || jeu.texte.includes(recherche);
}

function rechercheNormalisee() {
  return normaliser(etat.texte).trim();
}

function filtreActif() {
  return !!(etat.collection || etat.age || etat.genre || etat.univers || etat.etiquette || rechercheNormalisee());
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

function creerCarte(jeu, scores) {
  const li = document.createElement('li');
  const titreAffiche = titreJeu(jeu);

  const lien = document.createElement('a');
  lien.className = 'carte';
  lien.href = `play.html?id=${encodeURIComponent(jeu.id)}`;

  const jaquette = document.createElement('div');
  jaquette.className = 'jaquette';

  const img = document.createElement('img');
  img.src = jeu.cover;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 600;
  img.height = 800;
  img.addEventListener('error', () => { img.src = 'assets/sans-jaquette.svg'; }, { once: true });
  jaquette.append(img);

  // Titre traduit, en bandeau sur le bas de la jaquette (elle ne contient aucun texte).
  const titre = document.createElement('h2');
  titre.className = 'carte-titre';
  titre.lang = getLang();
  titre.textContent = titreAffiche;
  jaquette.append(titre);

  if (estNouveau(jeu)) {
    const badge = document.createElement('span');
    badge.className = 'badge-nouveau';
    badge.textContent = t('carte.nouveau');
    jaquette.append(badge);
  }

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
  const themes = [jeu.genre, ...jeu.tags.filter((t) => t !== jeu.genre)].filter(Boolean).slice(0, 2);
  const enFrancais = jeuEnFrancais(jeu) ? `(${t('carte.enFrancais')})` : '';
  infos.textContent = [themes.map((m, i) => (i === 0 && m === jeu.genre ? nomGenre(m) : nomTag(m))).join(' · '), jeu.ages, enFrancais]
    .filter(Boolean).join(' — ');
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
  el.grille.replaceChildren(...liste.map((jeu) => creerCarte(jeu, scores)));
  el.grilleArchives.replaceChildren(...archives.map((jeu) => creerCarte(jeu, scores)));
  el.archives.hidden = archives.length === 0;

  const total = liste.length + archives.length;
  el.titre.textContent = filtreActif() ? t('resultats.trouves') : t('resultats.tous');
  el.compte.textContent = `· ${nombreDeJeux(total)}`;
  el.vide.hidden = total > 0;
  el.videTitre.textContent = t('vide.titre');
  el.videTexte.textContent = t('vide.texte');
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

// Choisit (ou retire, si déjà choisi) un filtre, puis met tout à jour.
// Univers et « autres thèmes » s'excluent : un seul thème à la fois.
function choisir(famille, valeur) {
  etat[famille] = etat[famille] === valeur ? null : valeur;
  if (famille === 'univers' && etat.univers) etat.etiquette = null;
  if (famille === 'etiquette' && etat.etiquette) etat.univers = null;
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
  if (jeu) location.href = `play.html?id=${encodeURIComponent(jeu.id)}`;
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

// Les regroupements qui ont des jeux d'abord, les vides (« Bientôt ») ensuite ;
// à l'intérieur, l'ordre des listes est gardé.
function pleinsDAbord(liste, total) {
  return [...liste.filter((x) => total(x) > 0), ...liste.filter((x) => total(x) === 0)];
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

  // Genres : la liste fermée (catalog.json), plus un genre inconnu éventuel.
  const presents = new Set(etat.jeux.map((j) => j.genre).filter(Boolean));
  const genres = compter('genre', (j) => (j.genre ? [j.genre] : []));
  const listeGenres = [...etat.genres, ...[...presents].filter((g) => !etat.genres.includes(g))];
  el.genres.replaceChildren(...pleinsDAbord(listeGenres, genres.total).map((genre) => {
    const affichage = GENRES_AFFICHAGE[genre] || { picto: '🎮', teinte: 230 };
    return creerTuile({
      cle: `genre:${genre}`, picto: affichage.picto, nom: nomGenre(genre), teinte: affichage.teinte,
      actif: etat.genre === genre, compte: genres.compte(genre), total: genres.total(genre),
      action: () => choisir('genre', genre),
    });
  }));

  // Univers.
  const univers = compter('theme', (j) => j.univers);
  el.univers.replaceChildren(...pleinsDAbord(UNIVERS, (u) => univers.total(u.id)).map((u) => creerTuile({
    cle: `univers:${u.id}`, picto: u.picto, nom: nomUnivers(u), teinte: u.teinte,
    actif: etat.univers === u.id, compte: univers.compte(u.id), total: univers.total(u.id),
    action: () => choisir('univers', u.id),
  })));

  // Autres thèmes : les tags rangés dans aucun univers (ni genres), en petites puces.
  const dejaRanges = new Set([...UNIVERS.flatMap((u) => u.tags), ...listeGenres]);
  const autres = compter('theme', (j) => j.tags.filter((t) => !dejaRanges.has(t.normalize('NFC'))));
  const tags = [...new Set(etat.jeux.flatMap((j) => j.tags))]
    .filter((tag) => autres.total(tag) > 0)
    .sort((a, b) => autres.total(b) - autres.total(a) || nomTag(a).localeCompare(nomTag(b), getLang()));
  el.autresThemes.replaceChildren(...tags.map((tag) => creerPuce(nomTag(tag), null, etat.etiquette === tag,
    () => choisir('etiquette', tag), t('tuile.aria', { nom: nomTag(tag), etat: nombreDeJeux(autres.compte(tag)) }))));
  el.autresThemes.hidden = tags.length === 0;

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
    ajouter(GENRES_AFFICHAGE[etat.genre]?.picto || '🎮', nomGenre(etat.genre), () => { etat.genre = null; });
  }
  if (etat.univers) {
    const u = UNIVERS.find((x) => x.id === etat.univers);
    ajouter(u.picto, nomUnivers(u), () => { etat.univers = null; });
  }
  if (etat.etiquette) ajouter('🏷️', nomTag(etat.etiquette), () => { etat.etiquette = null; });
  if (rechercheNormalisee()) {
    ajouter('🔎', t('filtres.recherche', { texte: etat.texte.trim() }), () => { etat.texte = ''; el.recherche.value = ''; });
  }
  for (const puce of actifs) puce.classList.add('puce-active');

  if (actifs.length > 1) {
    const tout = creerPuce(t('filtres.toutEffacer'), null, null, () => {
      Object.assign(etat, { collection: null, age: null, genre: null, univers: null, etiquette: null, texte: '' });
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

// « Tout voir » / « Réduire », selon l'état de la bande.
function afficherToutVoir() {
  el.toutVoir.forEach((bouton) => {
    const deplie = bouton.getAttribute('aria-expanded') === 'true';
    bouton.textContent = deplie ? t('groupe.reduire') : t('groupe.toutVoir');
  });
}

// --- Langue -----------------------------------------------------------------

function afficherSeo() {
  majSeo({ titre: t('meta.titre'), description: t('meta.description') });
}

// Jeux proposés dans la langue courante, avec leur texte de recherche
// (titre et description en français et dans la langue courante, noms affichés
// du genre, des tags et des univers).
function preparerJeux() {
  etat.jeux = etat.tous.filter(jeuDisponible);
  for (const jeu of etat.jeux) {
    const nomsUnivers = UNIVERS.filter((u) => jeu.univers.includes(u.id)).map(nomUnivers);
    jeu.texte = normaliser([
      jeu.title, jeu.description, titreJeu(jeu), descriptionJeu(jeu),
      jeu.genre, nomGenre(jeu.genre), ...jeu.tags, ...jeu.tags.map(nomTag), ...nomsUnivers,
    ].join(' '));
  }
}

surChangementLangue(() => {
  afficherSeo();
  afficherToutVoir();
  if (etat.erreur) {
    afficherErreurCatalogue();
    return;
  }
  preparerJeux();
  afficher();
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
    const adresse = pays ? `api/scores?pays=${encodeURIComponent(pays)}` : 'api/scores';
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

// « Tout voir » : la bande de tuiles qui défile devient une grille complète.
el.toutVoir.forEach((bouton) => {
  bouton.addEventListener('click', () => {
    const tuiles = document.getElementById(bouton.getAttribute('aria-controls'));
    const deplie = tuiles.classList.toggle('deplie');
    bouton.setAttribute('aria-expanded', String(deplie));
    afficherToutVoir();
  });
});

// Retour de la connexion : on récupère les votes s'ils manquaient.
addEventListener('online', async () => {
  if (etat.scoresMonde || etat.jeux.length === 0) return;
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
  const horsLigne = jeuxHorsLigne();
  const textes = demarrerLangue(el.langue);
  try {
    const reponse = await fetch('catalog.json', { cache: 'no-cache' });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const catalogue = await reponse.json();
    etat.tous = (catalogue.games || []).map((j) => {
      const jeu = {
        ...j,
        genre: typeof j.genre === 'string' ? j.genre : '',
        tags: Array.isArray(j.tags) ? j.tags.filter((t) => typeof t === 'string') : [],
      };
      jeu.tranche = trancheAge(jeu.ages);
      jeu.univers = universDuJeu(jeu);
      return jeu;
    });
    etat.genres = Array.isArray(catalogue.genres) ? catalogue.genres.filter((g) => typeof g === 'string') : [];
  } catch (erreur) {
    console.error('Impossible de charger le catalogue :', erreur);
    etat.erreur = true;
    await textes;
    afficherSeo();
    afficherToutVoir();
    afficherErreurCatalogue();
    return;
  }
  await textes;
  afficherSeo();
  afficherToutVoir();
  preparerJeux();
  const resultat = await scores;
  if (resultat) {
    etat.scoresMonde = resultat.scores;
    etat.pays = resultat.pays;
  }
  etat.horsLigne = await horsLigne;
  etat.aimes = jeuxAimes();
  afficher();

  // Votes restés en attente (faits hors ligne) : on retente l'envoi.
  if (votesEnAttente()) envoyerEnAttente();
}

activerHorsLigne();
demarrer();
