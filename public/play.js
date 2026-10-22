// ==========================================================================
// Jeux-en-ligne — lanceur de jeu (play.html?id=<id-du-jeu>)
// Trouve le jeu dans catalog.json et le charge dans le cadre isolé.
// Gère aussi les pouces 👍 / 👎 (voir votes.js) et la langue :
// - la langue du site est transmise au jeu (window.JEL_LANG, voir i18n/i18n.js),
//   car le cadre isolé n'a pas accès au stockage du site ;
// - le bouton de langue du jeu envoie un message « jel-langue » : le lanceur
//   enregistre le choix (partagé avec le catalogue) et relance le jeu.
// ==========================================================================

import { monVote, voter, votesEnAttente, envoyerEnAttente } from './votes.js';
import { activerHorsLigne } from './hors-ligne.js';
import {
  t, getLang, demarrerLangue, surChangementLangue, majSeo,
  titreJeu, descriptionJeu, jeuEnFrancais, jeuDisponible,
} from './langue.js';

const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Règle de sécurité des jeux : aucun accès réseau.
// Identique à celle de public/_headers et de scripts/serve.mjs.
const CSP_JEU = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; worker-src blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";

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

let jeuCourant = null;   // fiche du jeu affiché (catalog.json)
let htmlJeu = null;      // code du jeu, gardé pour le relancer dans une autre langue
let message = null;      // { titre, texte } : clés du message affiché à la place du jeu

function afficherMessage(titre, texte) {
  message = { titre, texte };
  el.titre.textContent = t('site.nom');
  el.messageTitre.textContent = t(titre);
  el.messageTexte.textContent = t(texte);
  el.message.hidden = false;
  el.cadre.hidden = true;
}

// Textes du lanceur qui dépendent de la langue (titre, plein écran, SEO).
function afficherTextes() {
  if (jeuCourant) {
    const titre = titreJeu(jeuCourant);
    el.titre.textContent = titre;
    el.cadre.title = titre;
    majSeo({ titre: t('jeu.titreDocument', { titre }), description: descriptionJeu(jeuCourant) });
  } else {
    el.cadre.title = t('jeu.cadre');
    majSeo({ titre: t('jeu.titrePage'), description: t('meta.description') });
    if (message) afficherMessage(message.titre, message.texte);
    else el.titre.textContent = t('jeu.chargement');
  }
  el.pleinEcran.setAttribute('aria-label', document.fullscreenElement ? t('jeu.quitterPleinEcran') : t('jeu.pleinEcran'));
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
    el.pleinEcran.setAttribute('aria-label', document.fullscreenElement ? t('jeu.quitterPleinEcran') : t('jeu.pleinEcran'));
    el.cadre.focus();
  });
}

// --- Votes ------------------------------------------------------------------

let minuteurInfo;

function afficherInfoVote(texte, duree = 2500) {
  el.infoVote.textContent = texte;
  el.infoVote.hidden = false;
  clearTimeout(minuteurInfo);
  minuteurInfo = setTimeout(() => { el.infoVote.hidden = true; }, duree);
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
    const horsConnexion = navigator.onLine === false;
    if (horsConnexion) {
      // Pas d'erreur : le vote est gardé sur l'appareil et partira au retour du réseau.
      afficherInfoVote(valeur === 0 ? t('vote.annulationPlusTard') : t('vote.plusTard'), 4000);
    } else {
      afficherInfoVote(valeur === 0 ? t('vote.annule') : t('vote.merci'));
    }
    const resultat = await voter(gameId, valeur);
    if (!horsConnexion && resultat === 'en-attente' && monVote(gameId) === valeur) {
      afficherInfoVote(t('vote.garde'), 4000);
    }
    el.cadre.focus(); // le clavier revient au jeu
  };
  el.votePlus.addEventListener('click', () => cliquer(1));
  el.voteMoins.addEventListener('click', () => cliquer(-1));
}

// --- Chargement du jeu --------------------------------------------------------
// Le lanceur lit lui-même le fichier du jeu, puis l'affiche dans le cadre isolé
// (srcdoc). Un cadre sandbox sans allow-same-origin échappe en effet au service
// worker : chargé par son adresse, le jeu ne pourrait pas marcher hors connexion.
// Lu ici, il passe par le service worker et reste jouable sans réseau.

// Ajoute la règle de sécurité avant tout le code du jeu (juste après <!doctype>,
// pour ne pas changer son mode d'affichage), puis la langue choisie sur le site.
function proteger(html) {
  const debut = /^﻿?(?:\s|<!--[\s\S]*?-->)*(?:<!doctype[^>]*>)?/i.exec(html)[0];
  const langue = `<script>window.JEL_LANG=${JSON.stringify(getLang())};</script>`;
  return `${debut}<meta http-equiv="Content-Security-Policy" content="${CSP_JEU}">${langue}${html.slice(debut.length)}`;
}

function afficherJeu() {
  el.cadre.addEventListener('load', () => el.cadre.focus(), { once: true });
  el.cadre.srcdoc = proteger(htmlJeu);
}

async function chargerJeu(jeu) {
  const reponse = await fetch(jeu.play); // ex. « games/saut-obstacles/?v=1 »
  if (!reponse.ok) throw Object.assign(new Error(`HTTP ${reponse.status}`), { statut: reponse.status });
  htmlJeu = await reponse.text();
  afficherJeu();
}

// Le bouton de langue du jeu : on enregistre le choix et on relance le jeu.
addEventListener('message', (evenement) => {
  if (evenement.source !== el.cadre.contentWindow) return;
  const donnees = evenement.data;
  if (!donnees || donnees.type !== 'jel-langue' || typeof donnees.lang !== 'string') return;
  window.JEL_I18N.setLang(donnees.lang).then(() => {
    if (htmlJeu) afficherJeu();
  });
});

surChangementLangue(afficherTextes);

// --- Démarrage --------------------------------------------------------------

async function demarrer() {
  await demarrerLangue(null);
  afficherTextes();

  const id = new URLSearchParams(location.search).get('id') || '';
  if (!ID_VALIDE.test(id)) {
    afficherMessage('jeu.introuvable', 'jeu.lienIncorrect');
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
    afficherMessage('jeu.pasDeConnexion', 'jeu.verifieConnexion');
    return;
  }

  if (!jeu) {
    afficherMessage('jeu.introuvable', 'jeu.introuvableTexte');
    return;
  }

  jeuCourant = jeu;
  afficherTextes();
  try {
    await chargerJeu(jeu);
  } catch (erreur) {
    console.error('Impossible de charger le jeu :', erreur);
    jeuCourant = null;
    if (erreur.statut === 404) {
      afficherMessage('jeu.introuvable', 'jeu.introuvableTexte');
    } else if (navigator.onLine === false) {
      afficherMessage('jeu.pasHorsLigne', 'jeu.pasHorsLigneTexte');
    } else {
      afficherMessage('jeu.neSeChargePas', 'jeu.reessaie');
    }
    return;
  }
  activerVotes(jeu.id);

  // Jeu dont le contenu (mots, lettres…) reste en français : on le signale.
  if (jeuEnFrancais(jeu) || !jeuDisponible(jeu)) afficherInfoVote(t('jeu.enFrancais'), 4000);

  // Votes restés en attente (hors ligne lors d'une visite précédente).
  if (votesEnAttente()) envoyerEnAttente();
}

activerHorsLigne();
demarrer();
