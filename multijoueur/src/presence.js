// ==========================================================================
// Présence des amis (docs/consigne-amis.md) : Durable Object unique « Presence »
// (nom « presence ») et ses deux adresses, servies par le Worker multijoueur.
//
//   POST /presence        signal du navigateur (public/amis.js), seulement
//                         quand la page est visible, toutes les 2 minutes et
//                         à chaque changement (jeu ouvert, partie en ligne…).
//                         Corps (texte JSON, sans pré-vol CORS) :
//                         { ticket, etat: 'site' | 'jeu' | 'hors', jeu, partie }
//                         ticket : ticket de présence signé par le site
//                         (src/ticket.js, jeu '@presence'), qui dit le profil.
//   POST /presence/lire   lecture par le site (functions/_amis.js, secret
//                         MULTI_SECRET) : { lecteur, ids } → { presences } ;
//                         le site n'y met que les amis acceptés du lecteur
//                         (contrôlés dans D1 à chaque lecture).
//
// Seul le dernier état de chaque profil est gardé (aucun historique) : en
// mémoire, recopié dans le stockage du Durable Object au plus toutes les
// PRESENCE_ECRITURE_S secondes (quelques milliers de lignes par jour au plus,
// quel que soit le nombre de joueurs), jamais dans D1. Un profil sans signal
// depuis PRESENCE_HORS_LIGNE_S est hors ligne (et oublié).
// Lecture : une fois toutes les AMIS_ACTUALISER_MIN_S secondes au plus par
// lecteur (bouton « Actualiser » vérifié ici, côté serveur, par profil).
// Réglages : public/profil-reglages.js.
// ==========================================================================

import { verifierTicket } from './ticket.js';
import {
  PRESENCE_HORS_LIGNE_S, PRESENCE_ECRITURE_S, PRESENCE_ECART_MIN_S, AMIS_ACTUALISER_MIN_S, AMIS_MAX,
} from '../../public/profil-reglages.js';

const TICKET_PRESENCE = '@presence';
const ID_JEU = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RE_PARTIE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CORPS_MAX = 2000;           // caractères d'un signal
const PROFILS_MAX = 50000;        // profils gardés en même temps au plus (les plus anciens sont oubliés)

function json(donnees, status = 200, entetes = {}) {
  return new Response(JSON.stringify(donnees), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...entetes } });
}

function stub(env) {
  return env.PRESENCE.get(env.PRESENCE.idFromName('presence'));
}

/**
 * Adresses /presence et /presence/lire du Worker. origines : sites permis
 * (en-tête Origin) pour le signal du navigateur. Renvoie une réponse, ou null
 * si le chemin n'est pas celui de la présence.
 */
export async function routePresence(request, env, chemin, origines) {
  if (chemin !== '/presence' && chemin !== '/presence/lire') return null;
  if (!env.PRESENCE || !env.MULTI_SECRET) return json({ erreur: 'indisponible' }, 503);

  if (chemin === '/presence/lire') {
    if (request.method !== 'POST' || request.headers.get('Authorization') !== `Bearer ${env.MULTI_SECRET}`) return json({ erreur: 'refusé' }, 403);
    let corps;
    try { corps = await request.json(); } catch { return json({ erreur: 'invalide' }, 400); }
    const ids = Array.isArray(corps?.ids) ? corps.ids.filter((x) => Number.isSafeInteger(x) && x > 0).slice(0, AMIS_MAX + 1) : [];
    if (!Number.isSafeInteger(corps?.lecteur)) return json({ erreur: 'invalide' }, 400);
    return stub(env).fetch('https://presence/lire', { method: 'POST', body: JSON.stringify({ lecteur: corps.lecteur, ids }) });
  }

  // Signal du navigateur : seulement depuis le site (le quota ne s'use pas ailleurs).
  const origine = request.headers.get('Origin') || '';
  if (!origines.includes(origine)) return json({ erreur: 'site non autorisé' }, 403);
  const cors = { 'Access-Control-Allow-Origin': origine, Vary: 'Origin' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Max-Age': '86400' } });
  if (request.method !== 'POST') return json({ erreur: 'POST attendu' }, 405, cors);
  let corps;
  try {
    const texte = await request.text();
    if (texte.length > CORPS_MAX) throw new Error('trop long');
    corps = JSON.parse(texte);
  } catch {
    return json({ erreur: 'invalide' }, 400, cors);
  }
  const ticket = await verifierTicket(env.MULTI_SECRET, corps?.ticket, TICKET_PRESENCE);
  if (!ticket) return json({ erreur: 'ticket' }, 401, cors);
  const etat = ['site', 'jeu', 'hors'].includes(corps.etat) ? corps.etat : null;
  if (!etat) return json({ erreur: 'invalide' }, 400, cors);
  const jeu = etat === 'jeu' && typeof corps.jeu === 'string' && ID_JEU.test(corps.jeu) ? corps.jeu : null;
  const partie = jeu && typeof corps.partie === 'string' && RE_PARTIE.test(corps.partie) && corps.partie.startsWith(`${jeu}.`) ? corps.partie : null;
  const reponse = await stub(env).fetch('https://presence/signal', {
    method: 'POST',
    body: JSON.stringify({ profil: ticket.profil, etat: jeu ? 'jeu' : (etat === 'hors' ? 'hors' : 'site'), jeu, partie }),
  });
  return new Response(null, { status: reponse.status === 200 ? 204 : reponse.status, headers: cors });
}

export class Presence {
  constructor(state) {
    this.state = state;
    this.carte = null;              // Map profil (texte) → { l: dernier signal (ms), e: 'site' | 'jeu', j: jeu, p: partie }
    this.lectures = new Map();      // lecteur → heure de sa dernière lecture (mémoire seulement)
    this.sale = false;              // changements pas encore recopiés dans le stockage
    this.ecritLe = 0;
  }

  async charger(maintenant) {
    if (this.carte) return;
    const garde = (await this.state.storage.get('presence')) || {};
    this.carte = new Map();
    for (const [id, p] of Object.entries(garde)) if (maintenant - p.l < PRESENCE_HORS_LIGNE_S * 1000) this.carte.set(id, p);
    this.ecritLe = maintenant;
  }

  // Recopie dans le stockage (une seule ligne) au plus toutes les PRESENCE_ECRITURE_S secondes.
  async sauverSiBesoin(maintenant) {
    if (!this.sale || maintenant - this.ecritLe < PRESENCE_ECRITURE_S * 1000) return;
    const limite = maintenant - PRESENCE_HORS_LIGNE_S * 1000;
    for (const [id, p] of this.carte) if (p.l < limite) this.carte.delete(id);
    for (const [lecteur, t] of this.lectures) if (maintenant - t > AMIS_ACTUALISER_MIN_S * 1000) this.lectures.delete(lecteur);
    await this.state.storage.put('presence', Object.fromEntries(this.carte));
    this.ecritLe = maintenant;
    this.sale = false;
  }

  async fetch(request) {
    const action = new URL(request.url).pathname.slice(1);
    let corps = {};
    try { corps = (await request.json()) || {}; } catch { /* corps vide */ }
    const maintenant = Date.now();
    await this.charger(maintenant);

    if (action === 'signal') {
      if (!Number.isSafeInteger(corps.profil)) return json({ erreur: 'invalide' }, 400);
      const id = String(corps.profil);
      const avant = this.carte.get(id);
      if (corps.etat === 'hors') {
        if (avant) { this.carte.delete(id); this.sale = true; }
      } else {
        // Signaux trop rapprochés (une page qui en enverrait en boucle) : ignorés.
        const meme = avant && avant.e === corps.etat && (avant.j || null) === (corps.jeu || null) && (avant.p || null) === (corps.partie || null);
        if (meme && maintenant - avant.l < (PRESENCE_ECART_MIN_S - 2) * 1000) {
          return json({ erreur: 'trop tôt' }, 429);
        }
        if (!avant && this.carte.size >= PROFILS_MAX) {
          const plusAncien = [...this.carte.entries()].sort((a, b) => a[1].l - b[1].l)[0];
          if (plusAncien) this.carte.delete(plusAncien[0]);
        }
        const p = { l: maintenant, e: corps.etat === 'jeu' ? 'jeu' : 'site' };
        if (p.e === 'jeu' && corps.jeu) p.j = corps.jeu;
        if (p.j && corps.partie) p.p = corps.partie;
        this.carte.set(id, p);
        this.sale = true;
      }
      await this.sauverSiBesoin(maintenant);
      return json({ ok: true });
    }

    if (action === 'lire') {
      if (!Number.isSafeInteger(corps.lecteur) || !Array.isArray(corps.ids)) return json({ erreur: 'invalide' }, 400);
      const precedente = this.lectures.get(corps.lecteur) || 0;
      const attendre = precedente + AMIS_ACTUALISER_MIN_S * 1000 - maintenant;
      if (attendre > 500) return json({ tropTot: true, attendre });
      this.lectures.set(corps.lecteur, maintenant);
      const limite = maintenant - PRESENCE_HORS_LIGNE_S * 1000;
      const presences = {};
      for (const brut of corps.ids) {
        const p = this.carte.get(String(brut));
        if (!p || p.l < limite) continue;
        presences[brut] = p.e === 'jeu' ? { etat: 'jeu', jeu: p.j || null, partie: p.p || null } : { etat: 'site' };
      }
      await this.sauverSiBesoin(maintenant);
      return json({ presences });
    }

    return json({ erreur: 'introuvable' }, 404);
  }
}
