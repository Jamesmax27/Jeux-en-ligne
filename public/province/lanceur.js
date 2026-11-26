// ==========================================================================
// Free Micro Games — comptoir de province, côté lanceur (« Cités voisines » de
// Marmoria : docs/cadrage-marmoria.md, sections 16.7 et 23.15 ; serveur :
// multijoueur/src/province.js).
//
// Le jeu n'a aucun accès réseau : il envoie au lanceur des messages
//   { type: 'jel-province', id, op: 'creer' | 'rejoindre' | 'lire' | 'sync', … }
// et reçoit { type: 'jel-province', id, ok: true, donnees } ou
// { type: 'jel-province', id, ok: false, erreur }.
// Le lanceur ajoute le ticket du profil joueur (pseudo affiché aux voisins) à la
// création, à l'arrivée et au premier envoi de chaque visite, puis transmet au
// Worker multijoueur (POST /province, texte JSON : pas de pré-vol CORS).
// Ailleurs que sur le site (aperçus *.pages.dev, test local sans ?multi=…) :
// erreur « hors-site », et le jeu ferme les routes vers les voisins.
// Rien n'est gardé sur l'appareil par ce module : le jeton du siège est dans la
// ville enregistrée du jeu.
// ==========================================================================

import { ADRESSE_MULTI, SITES_MULTI } from '../multijoueur/config.js';

const OPS = ['creer', 'rejoindre', 'lire', 'sync'];
const DELAI_MS = 8000;          // réponse du serveur attendue au plus
const TICKET_MAX_MS = 4000;     // ticket du profil attendu au plus à la création et à l'arrivée

// Adresse HTTP du Worker pour ce site, ou null. En test local seulement :
// ?multi=ws://localhost:<port> (serveur de test), comme pour le tour par tour.
export function adresseProvince(lieu = location) {
  const local = ['localhost', '127.0.0.1'].includes(lieu.hostname);
  let base = null;
  if (local) {
    const essai = new URLSearchParams(lieu.search).get('multi') || '';
    if (/^wss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[\w/-]*)?$/.test(essai)) base = essai.replace(/\/$/, '');
  } else if (SITES_MULTI.includes(lieu.hostname)) base = ADRESSE_MULTI;
  return base ? `${base.replace(/^ws/, 'http')}/province` : null;
}

/**
 * Branche le comptoir pour le jeu affiché. cadre : l'iframe du jeu ;
 * ticket() : promesse du ticket signé du profil (ou null).
 * Renvoie { recevoir(message), fermer() }.
 */
export const RE_PROVINCE_AMI = /^[a-z0-9]+(?:-[a-z0-9]+)*\.province-([A-HJ-NP-Z2-9]{6})$/;

export function brancherProvince({ jeu, cadre, ticket, surProvince }) {
  const adresse = adresseProvince();
  let ticketVisite = null;   // ticket déjà envoyé pendant cette visite (une fois suffit)
  let ferme = false;
  let annoncee = null;       // province annoncée aux amis (présence), une fois par code

  const repondre = (id, contenu) => {
    if (!ferme && cadre.contentWindow) cadre.contentWindow.postMessage({ type: 'jel-province', id, ...contenu }, '*');
  };

  async function ticketAvant(attente) {
    if (typeof ticket !== 'function') return null;
    try {
      return await Promise.race([ticket(), new Promise((ok) => setTimeout(() => ok(null), attente))]);
    } catch {
      return null;
    }
  }

  async function envoyer(corps) {
    const arret = new AbortController();
    const minuterie = setTimeout(() => arret.abort(), DELAI_MS);
    try {
      const r = await fetch(adresse, { method: 'POST', body: JSON.stringify(corps), signal: arret.signal, credentials: 'omit' });
      const donnees = await r.json().catch(() => ({}));
      return r.ok ? { ok: true, donnees } : { ok: false, erreur: donnees.erreur || `http-${r.status}` };
    } catch {
      return { ok: false, erreur: navigator.onLine === false ? 'hors-ligne' : 'injoignable' };
    } finally {
      clearTimeout(minuterie);
    }
  }

  async function recevoir(m) {
    const id = m.id;
    if (!OPS.includes(m.op)) { repondre(id, { ok: false, erreur: 'op' }); return; }
    if (!adresse) { repondre(id, { ok: false, erreur: 'hors-site' }); return; }
    if (navigator.onLine === false) { repondre(id, { ok: false, erreur: 'hors-ligne' }); return; }
    const corps = { a: m.op, jeu: jeu.id };
    for (const k of ['code', 'carte', 'siege', 'jeton', 'ops', 'accuse', 'infos', 'signal']) if (m[k] !== undefined) corps[k] = m[k];
    if (m.op === 'creer' || m.op === 'rejoindre') {
      const t = await ticketAvant(TICKET_MAX_MS);
      if (t) { corps.ticket = t; ticketVisite = t; }
    } else if (m.op === 'sync' && !ticketVisite) {
      // Premier envoi de la visite : le ticket est demandé sans faire attendre l'envoi ;
      // il partira avec le suivant s'il n'est pas encore là.
      ticketVisite = 'attente';
      ticketAvant(15000).then((t) => { ticketVisite = t || null; }).catch(() => { ticketVisite = null; });
    } else if (m.op === 'sync' && ticketVisite !== 'attente' && ticketVisite !== 'envoye') {
      corps.ticket = ticketVisite;
      ticketVisite = 'envoye';
    }
    const r = await envoyer(corps);
    // Province en cours (créée, rejointe ou jouée) : les amis voient « Rejoindre » sur la page Amis.
    const code = r.ok ? (r.donnees.code || corps.code) : null;
    if (code && m.op !== 'lire' && code !== annoncee && typeof surProvince === 'function') { annoncee = code; surProvince(`${jeu.id}.province-${code}`); }
    repondre(id, r);
  }

  return {
    recevoir(m) { recevoir(m).catch(() => repondre(m.id, { ok: false, erreur: 'injoignable' })); },
    fermer() { ferme = true; },
  };
}
