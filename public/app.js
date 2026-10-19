// ==========================================================================
// Jeux-en-ligne — catalogue (page d'accueil)
// Charge catalog.json (généré par scripts/build-catalog.mjs) et affiche les
// jaquettes. Aucune dépendance. Les données des jeux ne sont jamais injectées
// en HTML brut : tout passe par textContent (sécurité).
// ==========================================================================

const NOUVEAU_JOURS = 7; // un jeu est « nouveau » pendant 7 jours

const etat = {
  jeux: [],
  onglet: 'tous',   // 'tous' | 'nouveautes'
  etiquette: null,  // thème sélectionné, ou null
  texte: '',        // recherche
};

const el = {
  grille: document.getElementById('grille'),
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

// --- Filtrage et tri --------------------------------------------------------

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

  // Phase 1 : pas encore de votes → du plus récent au plus ancien.
  // Phase 2 : l'onglet « Tous » sera trié par score de Wilson.
  return [...liste].sort((a, b) => String(b.added).localeCompare(String(a.added)) || a.title.localeCompare(b.title, 'fr'));
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
  lien.append(jaquette, texte);
  lien.setAttribute('aria-label', `${jeu.title}. ${jeu.description}`);
  li.append(lien);
  return li;
}

function afficherGrille() {
  const liste = jeuxVisibles();
  el.grille.replaceChildren(...liste.map(creerCarte));

  el.compte.textContent = liste.length === 1 ? '1 jeu' : `${liste.length} jeux`;
  el.vide.hidden = liste.length > 0;
  if (liste.length === 0) {
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

// --- Démarrage --------------------------------------------------------------

async function demarrer() {
  try {
    const reponse = await fetch('catalog.json', { cache: 'no-cache' });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const catalogue = await reponse.json();
    etat.jeux = (catalogue.games || []).map((j) => ({ ...j, tags: Array.isArray(j.tags) ? j.tags : [] }));
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
}

demarrer();
