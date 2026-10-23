// ==========================================================================
// Free Micro Games — formulaire public de demandes (/proposer/, /en/suggest/…)
//
// Page générée par scripts/pages-seo.mjs (gabarits/proposer.html) : ses textes
// sont déjà dans sa langue ; les messages de ce script sont dans le bloc
// <script id="proposer-textes"> (clés « proposer.* »).
//
// - Type de demande à choisir (rien n'est coché au départ) : nouveau jeu, bug,
//   modification. Pour un bug ou une modification, le jeu est obligatoire
//   (liste tirée de /catalog.json, titres dans la langue de la page) ;
//   ?jeu=<id> dans l'adresse le choisit d'avance.
// - Mêmes contrôles que le serveur (public/demandes-regles.js), puis jeton
//   Turnstile (action « demande ») et envoi à /api/demandes
//   (functions/api/demandes.js), qui crée l'issue GitHub modérée par l'IA.
// - Le champ « site » est un piège à robots, caché aux humains : jamais rempli ici.
// ==========================================================================

import {
  TYPES_AVEC_JEU, TITRE_MIN, TITRE_MAX, DESCRIPTION_MIN, DESCRIPTION_MAX,
  champInvalide, nettoyerTitre, nettoyerDescription,
} from '/demandes-regles.js';
import { jetonTurnstile } from '/turnstile.js';

const DELAI_ENVOI = 15000;

const formulaire = document.getElementById('formulaire-proposer');
const lang = formulaire?.dataset.lang || 'fr';

let textes = {};
try { textes = JSON.parse(document.getElementById('proposer-textes')?.textContent || '{}'); } catch { /* textes absents */ }

/** Texte de la page (clé « proposer.* »), avec ses {variables}. */
function t(cle, variables = {}) {
  const brut = textes[cle] ?? cle;
  return String(brut).replace(/\{(\w+)\}/g, (tout, nom) => (nom in variables ? String(variables[nom]) : tout));
}

if (formulaire) {
  const el = {
    types: [...formulaire.querySelectorAll('input[name="type"]')],
    champJeu: document.getElementById('proposer-champ-jeu'),
    jeu: document.getElementById('proposer-jeu'),
    titre: document.getElementById('proposer-titre'),
    description: document.getElementById('proposer-description'),
    compteur: document.getElementById('proposer-compteur'),
    piege: document.getElementById('proposer-site'),
    bouton: document.getElementById('proposer-envoyer'),
    message: document.getElementById('proposer-message'),
  };

  const jeuDemande = new URLSearchParams(location.search).get('jeu') || '';
  const typeChoisi = () => el.types.find((r) => r.checked)?.value || '';

  function afficher(texte, sorte) {
    el.message.textContent = texte;
    el.message.className = `message ${sorte}`;
  }

  // Champ du jeu : affiché seulement pour un bug ou une modification.
  // Exemple du champ description : selon le type choisi.
  function majType() {
    const type = typeChoisi();
    el.champJeu.hidden = !TYPES_AVEC_JEU.includes(type);
    el.description.placeholder = t(type ? `proposer.exemple.${type}` : 'proposer.exemple');
  }
  for (const r of el.types) r.addEventListener('change', majType);

  el.description.addEventListener('input', () => {
    el.compteur.textContent = `${el.description.value.length} / ${DESCRIPTION_MAX}`;
  });

  // Liste des jeux publiés, par ordre alphabétique dans la langue de la page.
  async function chargerJeux() {
    const vide = el.jeu.options[0];
    try {
      const reponse = await fetch('/catalog.json', { cache: 'no-cache' });
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      const jeux = ((await reponse.json()).games || [])
        .map((j) => ({ id: j.id, titre: j.i18n?.[lang]?.title || j.title }))
        .sort((a, b) => a.titre.localeCompare(b.titre, lang));
      for (const j of jeux) el.jeu.append(new Option(j.titre, j.id));
      vide.textContent = t('proposer.jeuChoisir');
      if (jeuDemande && jeux.some((j) => j.id === jeuDemande)) el.jeu.value = jeuDemande;
    } catch (erreur) {
      console.warn('Liste des jeux indisponible :', erreur);
      vide.textContent = t('proposer.jeuIndisponible');
    }
  }

  // Messages des erreurs renvoyées par le serveur (codes de functions/api/demandes.js).
  const MESSAGES_SERVEUR = {
    'limite-heure': 'proposer.erreur.limiteHeure',
    'limite-jour': 'proposer.erreur.limiteJour',
    robot: 'proposer.erreur.robot',
    refus: 'proposer.erreur.refus',
  };

  // Champ en cause : message et focus.
  function signalerChamp(champ) {
    const messages = {
      type: [t('proposer.erreur.type'), el.types[0]],
      jeu: [t('proposer.erreur.jeu'), el.jeu],
      titre: [t('proposer.erreur.titre', { min: TITRE_MIN, max: TITRE_MAX }), el.titre],
      description: [t('proposer.erreur.description', { min: DESCRIPTION_MIN, max: DESCRIPTION_MAX }), el.description],
    };
    const [texte, cible] = messages[champ] || [t('proposer.erreur.indisponible'), null];
    afficher(texte, 'erreur');
    cible?.focus();
  }

  formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    const demande = {
      type: typeChoisi(),
      jeu: el.jeu.value,
      titre: nettoyerTitre(el.titre.value),
      description: nettoyerDescription(el.description.value),
    };
    if (!TYPES_AVEC_JEU.includes(demande.type)) delete demande.jeu;
    const champ = champInvalide(demande);
    if (champ) {
      signalerChamp(champ);
      return;
    }
    if (navigator.onLine === false) {
      afficher(t('proposer.erreur.horsLigne'), 'erreur');
      return;
    }

    el.bouton.disabled = true;
    afficher(t('proposer.envoi'), 'ok');
    try {
      let jeton;
      try {
        jeton = await jetonTurnstile('demande', lang);
      } catch (erreur) {
        console.warn('Vérification anti-robot impossible :', erreur);
        afficher(t('proposer.erreur.robot'), 'erreur');
        return;
      }
      const reponse = await fetch('/api/demandes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...demande, site: el.piege.value, turnstileToken: jeton }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(DELAI_ENVOI) : undefined,
      });
      let corps = {};
      try { corps = await reponse.json(); } catch { /* réponse sans JSON */ }
      if (reponse.ok && corps.ok) {
        formulaire.reset();
        if (jeuDemande) el.jeu.value = jeuDemande;
        majType();
        el.compteur.textContent = `0 / ${DESCRIPTION_MAX}`;
        afficher(t('proposer.merci'), 'ok');
      } else if (corps.erreur === 'champ') {
        signalerChamp(corps.champ);
      } else {
        afficher(t(MESSAGES_SERVEUR[corps.erreur] || 'proposer.erreur.indisponible'), 'erreur');
      }
    } catch (erreur) {
      console.warn('Demande non envoyée :', erreur);
      afficher(t(navigator.onLine === false ? 'proposer.erreur.horsLigne' : 'proposer.erreur.indisponible'), 'erreur');
    } finally {
      el.bouton.disabled = false;
    }
  });

  majType();
  chargerJeux();
}
