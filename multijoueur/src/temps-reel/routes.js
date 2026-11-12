// ==========================================================================
// Adresses temps réel du Worker multijoueur (docs/cadrage-temps-reel.md) :
//
//   GET /tr/ws?jeu=<id>&sim=<empreinte>&proto=<n>    WebSocket : recherche d'un
//              adversaire (Rencontre du jeu). Ouvert par le lanceur du site au
//              clic sur « Jouer en ligne », jamais à l'ouverture du site.
//   GET /tr/duel?nom=<partie>&jeton=<jeton>          WebSocket : la partie
//              (Duel) ; signalisation WebRTC, puis relais si besoin.
//   GET /tr/attente?jeu=<id>    { enRecherche: n } (fin d'une partie contre le robot)
//   GET /tr/etat                compteurs du jour du Budget (parties relayées,
//              pair-à-pair réussis, échecs, refus) : aucune donnée personnelle
//
// Contrôles : site d'origine permis (comme /ws), jeu temps réel connu,
// simulation identique à celle du Worker (empreinte SHA-256 du bloc jel-sim),
// même protocole. Toute autre réponse fait jouer le jeu contre le robot.
// ==========================================================================

import { JEUX_TR } from '../jeux.js';
import { PROTOCOLE_TR } from './moteur-tr.js';
import { appelerBudget } from './budget.js';

const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function texte(contenu, status) {
  return new Response(contenu, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function json(x, entetes = {}) {
  return new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...entetes } });
}

const jeuConnu = (jeu) => ID_VALIDE.test(jeu) && Object.prototype.hasOwnProperty.call(JEUX_TR, jeu);

export function infosTempsReel() {
  return { protocole: PROTOCOLE_TR, jeux: Object.keys(JEUX_TR).sort() };
}

/** Réponse pour une adresse /tr/…, ou null si le chemin n'est pas le sien. */
export async function routeTempsReel(request, env, chemin, origines) {
  if (!chemin.startsWith('/tr/')) return null;
  const url = new URL(request.url);
  const origine = request.headers.get('Origin') || '';
  const cors = origines.includes(origine) ? { 'Access-Control-Allow-Origin': origine, Vary: 'Origin' } : {};

  if (chemin === '/tr/attente') {
    const jeu = url.searchParams.get('jeu') || '';
    if (!jeuConnu(jeu) || !env.RENCONTRE) return json({ enRecherche: 0 }, cors);
    try {
      const r = await env.RENCONTRE.get(env.RENCONTRE.idFromName(`rencontre:${jeu}`)).fetch('https://rencontre/compter');
      const d = r.ok ? await r.json() : null;
      return json({ enRecherche: Number.isInteger(d?.n) ? d.n : 0 }, cors);
    } catch {
      return json({ enRecherche: 0 }, cors);
    }
  }

  if (chemin === '/tr/etat') {
    const d = env.BUDGET ? await appelerBudget(env, 'etat') : null;
    return json({ ...infosTempsReel(), jour: d }, { 'Access-Control-Allow-Origin': '*' });
  }

  if (chemin !== '/tr/ws' && chemin !== '/tr/duel') return texte('Introuvable', 404);
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return texte('Connexion WebSocket attendue', 426);
  if (!origines.includes(origine)) return texte('Site non autorisé', 403);
  if (!env.RENCONTRE || !env.DUEL) return texte('Indisponible', 503);

  if (chemin === '/tr/ws') {
    const jeu = url.searchParams.get('jeu') || '';
    if (!jeuConnu(jeu)) return texte('Jeu inconnu', 404);
    if (url.searchParams.get('sim') !== JEUX_TR[jeu].empreinte) return texte('Simulation différente', 409);
    if (Number(url.searchParams.get('proto')) !== PROTOCOLE_TR) return texte('Protocole différent', 409);
    const cible = new URL('https://rencontre/ws');
    cible.searchParams.set('jeu', jeu);
    return env.RENCONTRE.get(env.RENCONTRE.idFromName(`rencontre:${jeu}`)).fetch(new Request(cible, request));
  }

  // /tr/duel : le nom de la partie commence par l'id du jeu (donné par la Rencontre).
  const nom = url.searchParams.get('nom') || '';
  const jeton = url.searchParams.get('jeton') || '';
  const point = nom.indexOf('.');
  if (point < 1 || !jeuConnu(nom.slice(0, point)) || !RE_UUID.test(nom.slice(point + 1)) || !RE_UUID.test(jeton)) return texte('Partie inconnue', 404);
  const cible = new URL('https://duel/ws');
  cible.searchParams.set('jeton', jeton);
  return env.DUEL.get(env.DUEL.idFromName(nom)).fetch(new Request(cible, request));
}
