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
// - Filtres par genre et par thème, combinables entre eux, avec le tri et
//   avec la recherche.
// - Sans API des scores (hors connexion…) : tri par nouveautés, sans compteurs.
// - Les jeux déjà gardés sur l'appareil portent un badge « Disponible hors ligne ».
// ==========================================================================

import { votesEnAttente, envoyerEnAttente } from './votes.js';
import { activerHorsLigne, jeuxHorsLigne } from './hors-ligne.js';

const NOUVEAU_JOURS = 7;          // un jeu est « nouveau » pendant 7 jours
const NOUVEAUX_EN_TETE = 2;       // nouveautés intercalées en haut du tri « Mieux notés »
const ARCHIVE_VOTES_MIN = 30;     // archives : plus de 30 votes…
const ARCHIVE_SCORE_MAX = 0.2;    // … et un score inférieur à 0,2 (votes du monde entier)
const PAYS_VOTES_MIN = 20;        // sous 20 votes dans mon pays, classement Monde
const DELAI_SCORES = 4000;        // au-delà, on affiche sans attendre l'API

// Pictogrammes des genres (liste fermée : scripts/genres.mjs).
const PICTOS_GENRES = {
  'adresse': '🎯', 'réflexion': '🧠', 'mémoire': '🃏', 'quiz': '❓', 'rythme': '🥁',
  'création': '🎨', 'course': '🏁', 'puzzle': '🧩', 'calcul': '🔢', 'lecture': '📖',
};

const SANS_VOTE = { up: 0, down: 0, score: 0, semaine: 0 };

const etat = {
  jeux: [],
  genres: [],             // ordre des genres (catalog.json)
  scoresMonde: null,      // { gameId: { up, down, score, semaine } } ; null = API indisponible
  scoresPays: undefined,  // idem pour mon pays : undefined = pas chargé, null = indisponible
  pays: null,             // pays détecté par l'API (ex. « FR »), ou null
  horsLigne: new Set(),   // jeux gardés sur l'appareil
  tri: 'notes',           // 'notes' | 'votes' | 'semaine' | 'nouveautes'
  portee: 'monde',        // 'monde' | 'pays'
  genre: null,            // genre sélectionné, ou null
  etiquette: null,        // thème sélectionné, ou null
  texte: '',              // recherche
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
  genres: document.getElementById('genres'),
  separateur: document.getElementById('separateur'),
  etiquettes: document.getElementById('etiquettes'),
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

function majuscule(mot) {
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}

// « FR » → « France » (nom du pays en français).
function nomPays(code) {
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
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

// --- Filtrage et tri --------------------------------------------------------

// Renvoie { principaux, archives } (archives : seulement quand les votes sont connus).
function jeuxVisibles() {
  const recherche = normaliser(etat.texte).trim();
  let liste = etat.jeux;

  if (etat.genre) {
    liste = liste.filter((j) => j.genre === etat.genre);
  }
  if (etat.etiquette) {
    liste = liste.filter((j) => j.tags.includes(etat.etiquette));
  }
  if (recherche) {
    liste = liste.filter((j) =>
      normaliser([j.title, j.description, j.genre, ...j.tags].join(' ')).includes(recherche)
    );
  }

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

  if (estNouveau(jeu)) {
    const badge = document.createElement('span');
    badge.className = 'badge-nouveau';
    badge.textContent = 'Nouveau';
    jaquette.append(badge);
  }

  const horsLigne = etat.horsLigne.has(jeu.id);
  if (horsLigne) {
    const badge = document.createElement('span');
    badge.className = 'badge-hors-ligne';
    badge.textContent = 'Disponible hors ligne';
    jaquette.append(badge);
  }

  const texte = document.createElement('div');
  texte.className = 'carte-texte';

  const titre = document.createElement('h2');
  titre.className = 'carte-titre';
  titre.textContent = jeu.title;

  const infos = document.createElement('p');
  infos.className = 'carte-infos';
  const themes = [jeu.genre, ...jeu.tags.filter((t) => t !== jeu.genre)].filter(Boolean).slice(0, 2);
  infos.textContent = [themes.map(majuscule).join(' · '), jeu.ages].filter(Boolean).join(' — ');
  texte.append(titre, infos);

  // Compteurs de pouces, seulement quand l'API répond (jamais hors connexion).
  let votes = '';
  if (scores) {
    const { up, down } = scores[jeu.id] || SANS_VOTE;
    const pouces = document.createElement('p');
    pouces.className = 'carte-pouces';
    const haut = document.createElement('span');
    haut.textContent = `👍 ${up}`;
    const bas = document.createElement('span');
    bas.textContent = `👎 ${down}`;
    pouces.append(haut, bas);
    texte.append(pouces);
    votes = `${up} j'aime, ${down} je n'aime pas.`;
  }

  lien.append(jaquette, texte);
  lien.setAttribute('aria-label', [`${jeu.title}.`, jeu.description, votes, horsLigne && '(disponible hors ligne)'].filter(Boolean).join(' '));
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
  el.compte.textContent = total === 1 ? '1 jeu' : `${total} jeux`;
  el.vide.hidden = total > 0;
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
    note = navigator.onLine === false
      ? 'Hors connexion : jeux du plus récent au plus ancien, sans les votes.'
      : 'Votes indisponibles pour le moment : jeux du plus récent au plus ancien.';
  } else if (etat.portee === 'pays' && etat.pays) {
    const pays = nomPays(etat.pays);
    if (etat.scoresPays === undefined) note = `Chargement des votes de ton pays (${pays})…`;
    else if (etat.scoresPays === null) note = 'Votes de ton pays indisponibles : classement Monde affiché.';
    else if (!paysRetenu()) note = `Moins de ${PAYS_VOTES_MIN} votes dans ton pays (${pays}) pour l'instant : classement Monde affiché.`;
    else note = `Votes de ton pays uniquement (${pays}).`;
  }
  el.note.textContent = note;
  el.note.hidden = !note;
}

function afficher() {
  afficherTri();
  afficherPortee();
  afficherNote();
  afficherGrille();
}

function creerPuce(texte, picto, actif, action) {
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
  b.setAttribute('aria-pressed', String(actif));
  b.addEventListener('click', action);
  return b;
}

function afficherFiltres() {
  // Genres présents dans le catalogue, dans l'ordre de la liste fermée.
  const presents = new Set(etat.jeux.map((j) => j.genre).filter(Boolean));
  const genres = [...etat.genres.filter((g) => presents.has(g)), ...[...presents].filter((g) => !etat.genres.includes(g))];
  el.genres.replaceChildren(...genres.map((genre) => creerPuce(majuscule(genre), PICTOS_GENRES[genre], etat.genre === genre, () => {
    etat.genre = etat.genre === genre ? null : genre;
    afficherFiltres();
    afficherGrille();
  })));

  // Thèmes : les tags qui ne sont pas des genres, du plus fréquent au moins fréquent.
  const nomsGenres = new Set([...etat.genres, ...presents]);
  const compte = new Map();
  for (const jeu of etat.jeux) {
    for (const tag of jeu.tags) if (!nomsGenres.has(tag)) compte.set(tag, (compte.get(tag) || 0) + 1);
  }
  const tags = [...compte.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .map(([tag]) => tag);
  el.etiquettes.replaceChildren(...tags.map((tag) => creerPuce(majuscule(tag), null, etat.etiquette === tag, () => {
    etat.etiquette = etat.etiquette === tag ? null : tag;
    afficherFiltres();
    afficherGrille();
  })));

  el.genres.hidden = genres.length === 0;
  el.etiquettes.hidden = tags.length === 0;
  el.separateur.hidden = genres.length === 0 || tags.length === 0;
}

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
  afficherGrille();
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
  afficherGrille();
});

// --- Démarrage --------------------------------------------------------------

async function demarrer() {
  const scores = chargerScores(); // en parallèle du catalogue
  const horsLigne = jeuxHorsLigne();
  try {
    const reponse = await fetch('catalog.json', { cache: 'no-cache' });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const catalogue = await reponse.json();
    etat.jeux = (catalogue.games || []).map((j) => ({
      ...j,
      genre: typeof j.genre === 'string' ? j.genre : '',
      tags: Array.isArray(j.tags) ? j.tags : [],
    }));
    etat.genres = Array.isArray(catalogue.genres) ? catalogue.genres.filter((g) => typeof g === 'string') : [];
  } catch (erreur) {
    console.error('Impossible de charger le catalogue :', erreur);
    el.compte.textContent = '';
    el.vide.hidden = false;
    el.videTitre.textContent = 'Le catalogue ne se charge pas';
    el.videTexte.textContent = 'Vérifie ta connexion, puis recharge la page.';
    return;
  }
  const resultat = await scores;
  if (resultat) {
    etat.scoresMonde = resultat.scores;
    etat.pays = resultat.pays;
  }
  etat.horsLigne = await horsLigne;
  afficherFiltres();
  afficher();

  // Votes restés en attente (faits hors ligne) : on retente l'envoi.
  if (votesEnAttente()) envoyerEnAttente();
}

activerHorsLigne();
demarrer();
