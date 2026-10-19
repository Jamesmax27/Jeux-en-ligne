// ==========================================================================
// Jeux-en-ligne — catalogue (page d'accueil)
// Charge catalog.json (généré par scripts/build-catalog.mjs) et affiche les
// jaquettes. Aucune dépendance. Les données des jeux ne sont jamais injectées
// en HTML brut : tout passe par textContent (sécurité).
// Les scores viennent de /api/scores ; sans réseau, on reprend les derniers
// scores connus (ou aucun) : le catalogue reste toujours utilisable.
// ==========================================================================

import { votesEnAttente, envoyerEnAttente } from './votes.js';

const NOUVEAU_JOURS = 7;          // un jeu est « nouveau » pendant 7 jours
const NOUVEAUX_EN_TETE = 2;       // nombre de nouveautés intercalées en haut des Populaires
const ARCHIVE_VOTES_MIN = 30;     // archives : plus de 30 votes…
const ARCHIVE_SCORE_MAX = 0.2;    // … et un score inférieur à 0,2
const DELAI_SCORES = 4000;        // au-delà, on affiche sans attendre l'API
const CLE_SCORES = 'jel-scores';  // derniers scores reçus, pour le hors-ligne

const etat = {
  jeux: [],
  scores: {},           // { gameId: { up, down, score } }
  onglet: 'populaires', // 'populaires' | 'nouveautes'
  etiquette: null,      // thème sélectionné, ou null
  texte: '',            // recherche
};

const el = {
  grille: document.getElementById('grille'),
  archives: document.getElementById('archives'),
  grilleArchives: document.getElementById('grille-archives'),
  compte: document.getElementById('compte'),
  vide: document.getElementById('vide'),
  videTitre: document.getElementById('vide-titre'),
  videTexte: document.getElementById('vide-texte'),
  recherche: document.getElementById('recherche'),
  etiquettes: document.getElementById('etiquettes'),
  onglets: document.querySelectorAll('.onglet'),
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

function scoreDe(jeu) {
  return etat.scores[jeu.id] || { up: 0, down: 0, score: 0 };
}

function estArchive(jeu) {
  const s = scoreDe(jeu);
  return s.up + s.down > ARCHIVE_VOTES_MIN && s.score < ARCHIVE_SCORE_MAX;
}

function parDate(a, b) {
  return String(b.added).localeCompare(String(a.added)) || a.title.localeCompare(b.title, 'fr');
}

// Score de Wilson décroissant ; à égalité, le plus de votes, puis le plus récent.
function parScore(a, b) {
  const sa = scoreDe(a);
  const sb = scoreDe(b);
  return sb.score - sa.score || (sb.up + sb.down) - (sa.up + sa.down) || parDate(a, b);
}

// Quelques nouveautés remontées en 2e et 4e position, pour récolter leurs premiers votes.
function intercalerNouveautes(liste) {
  const nouveaux = liste.filter(estNouveau).sort(parDate).slice(0, NOUVEAUX_EN_TETE);
  const resultat = liste.filter((j) => !nouveaux.includes(j));
  nouveaux.forEach((jeu, i) => resultat.splice(Math.min(1 + i * 2, resultat.length), 0, jeu));
  return resultat;
}

// --- Filtrage et tri --------------------------------------------------------

// Renvoie { principaux, archives } ; les archives ne concernent que l'onglet Populaires.
function jeuxVisibles() {
  const recherche = normaliser(etat.texte).trim();
  let liste = etat.jeux;

  if (etat.onglet === 'nouveautes') {
    liste = liste.filter(estNouveau);
  }
  if (etat.etiquette) {
    liste = liste.filter((j) => j.tags.includes(etat.etiquette));
  }
  if (recherche) {
    liste = liste.filter((j) =>
      normaliser([j.title, j.description, ...j.tags].join(' ')).includes(recherche)
    );
  }

  if (etat.onglet === 'nouveautes') {
    return { principaux: [...liste].sort(parDate), archives: [] };
  }

  const archives = liste.filter(estArchive).sort(parScore);
  const principaux = intercalerNouveautes(liste.filter((j) => !estArchive(j)).sort(parScore));
  return { principaux, archives };
}

// --- Affichage --------------------------------------------------------------

function creerCarte(jeu) {
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

  const texte = document.createElement('div');
  texte.className = 'carte-texte';

  const titre = document.createElement('h2');
  titre.className = 'carte-titre';
  titre.textContent = jeu.title;

  const infos = document.createElement('p');
  infos.className = 'carte-infos';
  infos.textContent = [jeu.tags.slice(0, 2).map(majuscule).join(' · '), jeu.ages].filter(Boolean).join(' — ');
  texte.append(titre, infos);

  const { up } = scoreDe(jeu);
  if (up > 0) {
    const pouces = document.createElement('p');
    pouces.className = 'carte-pouces';
    pouces.textContent = `👍 ${up}`;
    pouces.setAttribute('aria-label', up === 1 ? '1 personne aime ce jeu' : `${up} personnes aiment ce jeu`);
    texte.append(pouces);
  }

  lien.append(jaquette, texte);
  lien.setAttribute('aria-label', `${jeu.title}. ${jeu.description}`);
  li.append(lien);
  return li;
}

function afficherGrille() {
  const { principaux: liste, archives } = jeuxVisibles();
  el.grille.replaceChildren(...liste.map(creerCarte));
  el.grilleArchives.replaceChildren(...archives.map(creerCarte));
  el.archives.hidden = archives.length === 0;

  const total = liste.length + archives.length;
  el.compte.textContent = total === 1 ? '1 jeu' : `${total} jeux`;
  el.vide.hidden = total > 0;
  if (total === 0) {
    if (etat.onglet === 'nouveautes' && !etat.texte && !etat.etiquette) {
      el.videTitre.textContent = 'Pas de nouveauté cette semaine';
      el.videTexte.textContent = 'Reviens bientôt : de nouveaux jeux arrivent régulièrement.';
    } else {
      el.videTitre.textContent = 'Aucun jeu trouvé';
      el.videTexte.textContent = 'Essaie un autre mot ou un autre thème.';
    }
  }
}

function afficherEtiquettes() {
  // Les thèmes sont triés du plus fréquent au moins fréquent.
  const compte = new Map();
  for (const jeu of etat.jeux) {
    for (const tag of jeu.tags) compte.set(tag, (compte.get(tag) || 0) + 1);
  }
  const tags = [...compte.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .map(([tag]) => tag);

  el.etiquettes.hidden = tags.length === 0;
  el.etiquettes.replaceChildren(...tags.map((tag) => {
    const b = document.createElement('button');
    b.className = 'puce';
    b.type = 'button';
    b.textContent = majuscule(tag);
    b.setAttribute('aria-pressed', String(etat.etiquette === tag));
    b.addEventListener('click', () => {
      etat.etiquette = etat.etiquette === tag ? null : tag;
      afficherEtiquettes();
      afficherGrille();
    });
    return b;
  }));
}

// --- Événements -------------------------------------------------------------

el.onglets.forEach((bouton) => {
  bouton.addEventListener('click', () => {
    etat.onglet = bouton.dataset.onglet;
    el.onglets.forEach((b) => b.setAttribute('aria-selected', String(b === bouton)));
    afficherGrille();
  });
});

el.recherche.addEventListener('input', () => {
  etat.texte = el.recherche.value;
  afficherGrille();
});

// --- Scores -----------------------------------------------------------------

function scoresValides(donnees) {
  const scores = {};
  if (!donnees || typeof donnees !== 'object') return scores;
  for (const [id, s] of Object.entries(donnees)) {
    const up = Number(s?.up) || 0;
    const down = Number(s?.down) || 0;
    const score = Number(s?.score) || 0;
    scores[id] = { up, down, score };
  }
  return scores;
}

function scoresMemorises() {
  try {
    return scoresValides(JSON.parse(localStorage.getItem(CLE_SCORES) || '{}'));
  } catch {
    return {};
  }
}

// Ne lève jamais d'erreur : en cas de souci, renvoie les derniers scores connus.
async function chargerScores() {
  try {
    const reponse = await fetch('api/scores', {
      signal: AbortSignal.timeout ? AbortSignal.timeout(DELAI_SCORES) : undefined,
    });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const scores = scoresValides(await reponse.json());
    try { localStorage.setItem(CLE_SCORES, JSON.stringify(scores)); } catch { /* stockage indisponible */ }
    return scores;
  } catch (erreur) {
    console.warn('Scores indisponibles, derniers scores connus utilisés :', erreur);
    return scoresMemorises();
  }
}

// --- Démarrage --------------------------------------------------------------

async function demarrer() {
  const scores = chargerScores(); // en parallèle du catalogue
  try {
    const reponse = await fetch('catalog.json', { cache: 'no-cache' });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const catalogue = await reponse.json();
    etat.jeux = (catalogue.games || []).map((j) => ({ ...j, tags: Array.isArray(j.tags) ? j.tags : [] }));
    etat.scores = await scores;
  } catch (erreur) {
    console.error('Impossible de charger le catalogue :', erreur);
    el.compte.textContent = '';
    el.vide.hidden = false;
    el.videTitre.textContent = 'Le catalogue ne se charge pas';
    el.videTexte.textContent = 'Vérifie ta connexion, puis recharge la page.';
    return;
  }
  afficherEtiquettes();
  afficherGrille();

  // Votes restés en attente (faits hors ligne) : on retente l'envoi.
  if (votesEnAttente()) envoyerEnAttente();
}

demarrer();
