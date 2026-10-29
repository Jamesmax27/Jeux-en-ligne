// ==========================================================================
// Free Micro Games — Worker multijoueur commun à tous les jeux multijoueurs
// (déploiement : .github/workflows/multijoueur.yml ; explications :
// docs/multijoueur.md).
//
//   GET /etat   version déployée, protocole, jeux connus (sans rien appeler)
//   GET /ws?jeu=<id>&regles=<empreinte>&proto=<n>   connexion WebSocket d'un
//               joueur, ouverte par le lanceur du site au lancement d'une
//               partie en ligne (jamais à l'ouverture du site)
// Le préfixe /multi est aussi accepté (/multi/ws…), pour une route sur le
// domaine du site.
//
// Pour une connexion : site d'origine permis (ORIGINES), jeu connu, règles
// identiques à celles du Worker (empreinte), même protocole ; puis l'accueil
// (Durable Object unique, accueil.js) choisit la partie : une partie de ce jeu
// qui a encore une place de robot à donner, sinon une nouvelle. La partie
// (un Durable Object par partie, partie.js) arbitre tout : robots, coups,
// manches. Limite globale de vrais joueurs connectés : MAX_JOUEURS (80 par
// défaut, wrangler.toml). Toute réponse autre qu'une connexion acceptée fait
// jouer le jeu contre des robots sur l'appareil.
// ==========================================================================

import { JEUX, ORIGINES, VERSION } from './jeux.js';
import { PROTOCOLE } from './moteur.js';
import { appelerAccueil } from './accueil.js';

export { Partie } from './partie.js';
export { Accueil } from './accueil.js';

const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_JOUEURS = 80;

function texte(contenu, status) {
  return new Response(contenu, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function entier(valeur, defaut) {
  const n = parseInt(valeur, 10);
  return Number.isInteger(n) && n >= 0 ? n : defaut;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const chemin = url.pathname.replace(/^\/multi(?=\/|$)/, '') || '/';

    if (chemin === '/etat') {
      return new Response(JSON.stringify({ version: VERSION, protocole: PROTOCOLE, jeux: Object.keys(JEUX).sort() }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (chemin !== '/ws') return texte('Introuvable', 404);
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return texte('Connexion WebSocket attendue', 426);

    // Seul le site peut ouvrir une partie (un autre site ne peut pas user le quota).
    const origines = env.ORIGINES ? String(env.ORIGINES).split(',').map((o) => o.trim()).filter(Boolean) : ORIGINES;
    if (!origines.includes(request.headers.get('Origin') || '')) return texte('Site non autorisé', 403);

    const jeu = url.searchParams.get('jeu') || '';
    const fiche = ID_VALIDE.test(jeu) && Object.prototype.hasOwnProperty.call(JEUX, jeu) ? JEUX[jeu] : null;
    if (!fiche) return texte('Jeu inconnu', 404);
    // Jeu mis à jour sur le site avant le Worker (ou l'inverse) : ses règles diffèrent, pas de partie en ligne.
    if (url.searchParams.get('regles') !== fiche.empreinte) return texte('Règles différentes', 409);
    if (Number(url.searchParams.get('proto')) !== PROTOCOLE) return texte('Protocole différent', 409);

    const max = entier(env.MAX_JOUEURS, MAX_JOUEURS);
    // 2 essais : une partie peut s'être remplie entre le choix de l'accueil et l'arrivée du joueur.
    for (let essai = 0; essai < 2; essai++) {
      const place = await appelerAccueil(env, 'placer', { jeu, places: fiche.regles.places, max });
      if (!place?.nom) return texte(place?.complet ? 'Complet' : 'Indisponible', 503);
      const cible = new URL('https://partie/ws');
      cible.searchParams.set('jeu', jeu);
      cible.searchParams.set('nom', place.nom);
      let reponse = null;
      try {
        const partie = env.PARTIE.get(env.PARTIE.idFromName(place.nom));
        reponse = await partie.fetch(new Request(cible, request));
      } catch {
        reponse = null;
      }
      if (reponse?.status === 101) return reponse;
      await appelerAccueil(env, 'annuler', { nom: place.nom }); // place réservée mais pas prise
      if (reponse?.status !== 409) break;
    }
    return texte('Indisponible', 503);
  },
};
