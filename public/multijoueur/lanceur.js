// ==========================================================================
// Free Micro Games — multijoueur, côté lanceur (utilisé par play.js)
//
// Un jeu multijoueur (game.json : "multijoueur": true) tourne dans le cadre
// isolé du lanceur, sans aucun accès au réseau. Quand il commence une partie
// en ligne, son moteur (moteur.js, window.JEL_MULTI) envoie au lanceur le
// message { type: 'jel-multi', op: 'rejoindre' } : c'est le lanceur qui ouvre
// la connexion WebSocket avec le Worker commun (adresse : config.js) et qui
// fait passer les messages dans les deux sens :
//   jeu → lanceur : op 'rejoindre' (avec proto), 'envoyer' (m), 'quitter' ;
//   lanceur → jeu : { type: 'jel-multi', m } (message du serveur), ou
//                   { type: 'jel-multi', etat: 'solo' | 'coupe', raison }.
// 'solo' : pas de partie en ligne (site de test, hors connexion, serveur
// absent ou complet) ; 'coupe' : connexion perdue en pleine partie. Dans les
// deux cas, le jeu continue contre des robots sur l'appareil.
//
// La règle du jeu (bloc jel-regles) est identifiée par son empreinte SHA-256 :
// le serveur refuse une version qu'il ne connaît pas (jeu mis à jour avant le
// Worker), et le jeu se joue alors contre des robots locaux.
// Rien de personnel n'est envoyé : l'identifiant du jeu, l'empreinte de ses
// règles, les coups joués et, si le joueur a un profil, un ticket d'entrée
// signé par le site après Turnstile (numéro du profil, jeu, expiration) :
// envoyé par le lanceur dès l'ouverture ({ t: 'profil', ticket }), il permet
// au serveur de créditer ce profil à la fin de chaque manche
// (docs/cadrage-fidelisation.md, section 8). Sans ticket, la partie se joue
// de la même façon, sans gain pour le profil.
//
// Amis (docs/consigne-amis.md, section 3) :
//   - « Rejoindre » : op 'rejoindre' avec partie (nom de la partie d'un ami,
//     donné au jeu par window.JEL_REJOINDRE) → &partie=<nom> dans l'adresse ;
//     verifierPartie(nom) dit avant d'ouvrir le jeu si elle a encore une place ;
//   - le serveur dit au lanceur dans quelle partie il est ({ t: 'fmg-partie' },
//     gardé ici, jamais transmis au jeu) : surPartie(nom, demandee) prévient
//     play.js (présence des amis, message si la partie de l'ami était pleine) ;
//   - pseudos des autres joueurs ({ t: 'noms' }) : traduits ici (nommer, pour
//     « Joueur 4821 ») avant d'être transmis au jeu.
// ==========================================================================

import { ADRESSE_MULTI, SITES_MULTI } from './config.js';

const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RE_PARTIE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DELAI_VERIFICATION = 5000;   // ms pour savoir si la partie d'un ami a une place
const RE_REGLES = /<script\b[^>]*\bid=["']jel-regles["'][^>]*>([\s\S]*?)<\/script>/i;
const MESSAGE_MAX = 4000;          // caractères d'un message du jeu vers le serveur
const RECU_MAX = 200000;           // caractères d'un message du serveur (état complet à l'arrivée)
const PING_MS = 25000;             // garde la connexion ouverte (réponse automatique du serveur)
const CACHE_MAX_MS = 60000;        // page cachée plus d'une minute : on rend sa place à un robot

// Texte des règles d'un jeu (bloc jel-regles), tel que le Worker l'empreinte
// (scripts/multijoueur.mjs) : fins de ligne en \n, sans espaces autour.
export function texteRegles(html) {
  const m = RE_REGLES.exec(String(html || ''));
  return m ? m[1].replace(/\r\n/g, '\n').trim() : null;
}

async function empreinte(texte) {
  if (!texte || !globalThis.crypto?.subtle) return null;
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

// Adresse du serveur pour ce site, ou null (partie contre des robots locaux).
// En test local seulement : ?multi=ws://localhost:<port> (serveur de test).
function adresseServeur() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local) {
    const essai = new URLSearchParams(location.search).get('multi') || '';
    return /^wss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[\w/-]*)?$/.test(essai) ? essai.replace(/\/$/, '') : null;
  }
  return SITES_MULTI.includes(location.hostname) ? ADRESSE_MULTI : null;
}

/**
 * La partie « nom » (d'un ami) du jeu peut-elle être rejointe ? Une lecture au
 * Worker (GET /partie). Renvoie 'ouverte', 'pleine', 'introuvable' (terminée),
 * 'complet' (serveur plein) ou 'indisponible' (pas de serveur ici, hors connexion, panne).
 */
export async function verifierPartie(jeuId, nom) {
  const adresse = adresseServeur();
  if (!adresse || !RE_PARTIE.test(nom || '') || !nom.startsWith(`${jeuId}.`) || navigator.onLine === false) return 'indisponible';
  try {
    const http = adresse.replace(/^ws/, 'http');
    const r = await fetch(`${http}/partie?jeu=${encodeURIComponent(jeuId)}&nom=${encodeURIComponent(nom)}`, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(DELAI_VERIFICATION) : undefined,
    });
    const d = r.ok ? await r.json() : null;
    return ['ouverte', 'pleine', 'introuvable', 'complet'].includes(d?.etat) ? d.etat : 'indisponible';
  } catch {
    return 'indisponible';
  }
}

// À appeler une fois le jeu chargé. jeu : fiche du catalogue ; html : code du
// jeu ; cadre : l'iframe ; ticket : fonction facultative qui renvoie (promesse)
// le ticket du profil joueur ou null ; nommer(n) : « Joueur <n> » dans la langue
// affichée ; surPartie(nom | null, demandee | null) : partie en ligne rejointe
// ou quittée. Renvoie { recevoir(message du jeu), fermer() }.
export function brancherMultijoueur({ jeu, html, cadre, ticket, nommer, surPartie }) {
  let ws = null;
  let ping = 0;
  let cacheeDepuis = 0;
  let minuteurCache = 0;
  let partieEnCours = null;           // nom de la partie en ligne (« fmg-partie » du serveur)

  const annoncerPartie = (nom, demandee) => {
    if (nom === partieEnCours) return;
    partieEnCours = nom;
    try { surPartie?.(nom, demandee); } catch (e) { console.warn(e); }
  };

  // Pseudos reçus du serveur → textes affichés par le jeu (pseudo choisi, sinon « Joueur <nombre> »).
  const textesNoms = (noms) => (Array.isArray(noms) ? noms : []).slice(0, 10).map((x) => {
    if (!x || typeof x !== 'object') return null;
    if (typeof x.p === 'string' && x.p) return x.p.slice(0, 40);
    return Number.isSafeInteger(x.u) && typeof nommer === 'function' ? nommer(x.u) : null;
  });

  const versJeu = (message) => {
    try { cadre.contentWindow?.postMessage({ type: 'jel-multi', ...message }, '*'); } catch { /* cadre rechargé */ }
  };

  function fermer() {
    clearInterval(ping);
    const socket = ws;
    ws = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      try { socket.close(1000, 'fin'); } catch { /* déjà fermée */ }
    }
    annoncerPartie(null, null);
  }

  async function rejoindre(proto, partie) {
    fermer();
    const adresse = adresseServeur();
    // Lanceur caché dans le cadre d'un autre site, ou piloté par une autre fenêtre : pas de partie en ligne.
    if (!adresse || window.top !== window || window.opener) return versJeu({ etat: 'solo', raison: 'site' });
    if (navigator.onLine === false) return versJeu({ etat: 'solo', raison: 'hors-ligne' });
    if (!jeu.multijoueur || !ID_VALIDE.test(jeu.id) || !Number.isInteger(proto)) return versJeu({ etat: 'solo', raison: 'jeu' });
    const regles = await empreinte(texteRegles(html));
    if (!regles) return versJeu({ etat: 'solo', raison: 'regles' });

    // Partie d'un ami (« Rejoindre ») : demandée au serveur, qui la donne si elle a encore une place.
    const demandee = typeof partie === 'string' && RE_PARTIE.test(partie) && partie.startsWith(`${jeu.id}.`) ? partie : null;
    let socket;
    try {
      socket = new WebSocket(`${adresse}/ws?jeu=${encodeURIComponent(jeu.id)}&regles=${regles}&proto=${proto}${demandee ? `&partie=${encodeURIComponent(demandee)}` : ''}`);
    } catch {
      return versJeu({ etat: 'solo', raison: 'reseau' });
    }
    ws = socket;
    let ouverte = false;
    // Ticket du profil, demandé en même temps que la connexion (Turnstile peut prendre quelques secondes) ;
    // seulement avec le vrai serveur (pas avec un serveur de test local, où Turnstile refuse le site).
    const avecTicket = typeof ticket === 'function' && adresse === ADRESSE_MULTI;
    const attenteTicket = avecTicket ? Promise.resolve().then(ticket).catch(() => null) : Promise.resolve(null);
    socket.onopen = () => {
      ouverte = true;
      ping = setInterval(() => { try { socket.send('ping'); } catch { /* fermée */ } }, PING_MS);
      attenteTicket.then((t) => {
        if (t && socket === ws && socket.readyState === 1) socket.send(JSON.stringify({ t: 'profil', ticket: t }));
      });
    };
    socket.onmessage = (e) => {
      if (socket !== ws || typeof e.data !== 'string' || e.data.length > RECU_MAX || e.data === 'pong') return;
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (!m || typeof m !== 'object') return;
      // Nom de la partie : pour le lanceur seulement (présence des amis), jamais pour le jeu.
      if (m.t === 'fmg-partie') {
        if (typeof m.nom === 'string' && RE_PARTIE.test(m.nom)) annoncerPartie(m.nom, demandee);
        return;
      }
      if (m.t === 'noms') { versJeu({ m: { t: 'noms', noms: textesNoms(m.noms) } }); return; }
      versJeu({ m });
    };
    socket.onclose = socket.onerror = () => {
      if (socket !== ws) return;
      fermer();
      versJeu({ etat: ouverte ? 'coupe' : 'solo', raison: 'reseau' });
    };
  }

  // Page cachée plus d'une minute (écran verrouillé, autre application) : la
  // connexion est fermée, un robot reprend la place ; le jeu continue en solo.
  function surVisibilite() {
    clearTimeout(minuteurCache);
    if (document.visibilityState !== 'hidden' || !ws) return;
    cacheeDepuis = Date.now();
    minuteurCache = setTimeout(() => {
      if (!ws || document.visibilityState !== 'hidden' || Date.now() - cacheeDepuis < CACHE_MAX_MS) return;
      fermer();
      versJeu({ etat: 'coupe', raison: 'cache' });
    }, CACHE_MAX_MS);
  }
  document.addEventListener('visibilitychange', surVisibilite);
  addEventListener('pagehide', fermer);

  return {
    recevoir(donnees) {
      if (donnees.op === 'rejoindre') rejoindre(donnees.proto, donnees.partie);
      else if (donnees.op === 'quitter') fermer();
      else if (donnees.op === 'envoyer' && ws?.readyState === 1) {
        let texte;
        try { texte = JSON.stringify(donnees.m); } catch { return; }
        if (typeof texte === 'string' && texte.length <= MESSAGE_MAX) ws.send(texte);
      }
    },
    fermer,
  };
}
