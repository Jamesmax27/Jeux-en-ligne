// ==========================================================================
// Jeux-en-ligne — lanceur de jeu (play.html?id=<id-du-jeu>)
// Trouve le jeu dans catalog.json et le charge dans le cadre isolé.
// Gère aussi les pouces 👍 / 👎 (voir votes.js).
// ==========================================================================

import { monVote, voter, votesEnAttente, envoyerEnAttente } from './votes.js';

const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const el = {
  titre: document.getElementById('titre-jeu'),
  cadre: document.getElementById('cadre-jeu'),
  scene: document.getElementById('scene'),
  pleinEcran: document.getElementById('plein-ecran'),
  votePlus: document.getElementById('vote-plus'),
  voteMoins: document.getElementById('vote-moins'),
  infoVote: document.getElementById('info-vote'),
  message: document.getElementById('message'),
  messageTitre: document.getElementById('message-titre'),
  messageTexte: document.getElementById('message-texte'),
};

function afficherMessage(titre, texte) {
  el.titre.textContent = 'Jeux-en-ligne';
  el.messageTitre.textContent = titre;
  el.messageTexte.textContent = texte;
  el.message.hidden = false;
  el.cadre.hidden = true;
}

// --- Plein écran (indisponible sur iPhone : le bouton reste alors caché) ----

if (document.fullscreenEnabled) {
  el.pleinEcran.hidden = false;
  el.pleinEcran.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.scene.requestFullscreen();
    } catch (e) {
      console.warn('Plein écran refusé :', e);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    el.pleinEcran.setAttribute('aria-label', document.fullscreenElement ? 'Quitter le plein écran' : 'Plein écran');
    el.cadre.focus();
  });
}

// --- Votes ------------------------------------------------------------------

let minuteurInfo;

function afficherInfoVote(texte) {
  el.infoVote.textContent = texte;
  el.infoVote.hidden = false;
  clearTimeout(minuteurInfo);
  minuteurInfo = setTimeout(() => { el.infoVote.hidden = true; }, 2500);
}

function afficherMonVote(valeur) {
  el.votePlus.setAttribute('aria-pressed', String(valeur === 1));
  el.voteMoins.setAttribute('aria-pressed', String(valeur === -1));
}

function activerVotes(gameId) {
  afficherMonVote(monVote(gameId));
  el.votePlus.hidden = false;
  el.voteMoins.hidden = false;

  const cliquer = async (pouce) => {
    // Même pouce une 2e fois = annulation ; l'autre pouce = remplacement.
    const valeur = monVote(gameId) === pouce ? 0 : pouce;
    afficherMonVote(valeur); // l'affichage change tout de suite, même hors ligne
    afficherInfoVote(valeur === 0 ? 'Vote annulé' : 'Merci pour ton vote !');
    const resultat = await voter(gameId, valeur);
    if (resultat === 'en-attente' && monVote(gameId) === valeur) {
      afficherInfoVote('Vote gardé : il sera envoyé plus tard');
    }
    el.cadre.focus(); // le clavier revient au jeu
  };
  el.votePlus.addEventListener('click', () => cliquer(1));
  el.voteMoins.addEventListener('click', () => cliquer(-1));
}

// --- Démarrage --------------------------------------------------------------

async function demarrer() {
  const id = new URLSearchParams(location.search).get('id') || '';
  if (!ID_VALIDE.test(id)) {
    afficherMessage('Jeu introuvable', 'Le lien de ce jeu est incorrect.');
    return;
  }

  let jeu;
  try {
    const reponse = await fetch('catalog.json', { cache: 'no-cache' });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const catalogue = await reponse.json();
    jeu = (catalogue.games || []).find((j) => j.id === id);
  } catch (erreur) {
    console.error('Impossible de charger le catalogue :', erreur);
    afficherMessage('Pas de connexion', 'Vérifie ta connexion, puis recharge la page.');
    return;
  }

  if (!jeu) {
    afficherMessage('Jeu introuvable', "Ce jeu n'existe pas ou a été retiré.");
    return;
  }

  document.title = `${jeu.title} — Jeux-en-ligne`;
  el.titre.textContent = jeu.title;
  el.cadre.title = jeu.title;
  el.cadre.addEventListener('load', () => el.cadre.focus(), { once: true });
  el.cadre.src = jeu.play; // ex. « games/saut-obstacles/?v=1 »
  activerVotes(jeu.id);

  // Votes restés en attente (hors ligne lors d'une visite précédente).
  if (votesEnAttente()) envoyerEnAttente();
}

demarrer();
