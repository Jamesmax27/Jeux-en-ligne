// ==========================================================================
// Free Micro Games — jeux en temps réel, côté lanceur (utilisé par play.js)
// Cadrage : docs/cadrage-temps-reel.md (sections 3 à 7).
//
// Le jeu tourne dans le cadre isolé du lanceur, sans aucun accès au réseau.
// Son moteur (public/temps-reel/moteur.js, window.JEL_TR) parle au lanceur par
// postMessage (type 'jel-tr') ; c'est le lanceur qui fait tout le réseau :
//
//   jeu → lanceur : op 'chercher' { proto, config: { mode, carte, niveau } } (recherche),
//                   'lancer' (partie à plus de 2 : commencer avec les joueurs réunis), 'pret' (jeu prêt
//                   à jouer la partie trouvée), 'ordre' { seq, o }, 'hash' { k, h },
//                   'snap' { snap } (réponse à une demande), 'reprise' { depuis }
//                   (paquet manquant), 'fin', 'quitter', 'attente' (joueurs en recherche)
//   lanceur → jeu : { etat: 'attente', n, max }, { etat: 'trouve', camp, graine, config, humains },
//                   { etat: 'mode', mode }, { etat: 'solo', raison } (pas de partie en
//                   ligne : robot), { etat: 'coupe', raison, retour } (plus de réseau en
//                   pleine partie : robot ; retour = on essaie encore de se reconnecter),
//                   { etat: 'reseau', qui: 'moi' | 'adversaire', camp, ok, fin } (bandeau),
//                   { paquet }, { snap }, { demande: 'snap' }
//
// Déroulé (en ligne seulement : freemicrogames.com, SITES_MULTI de config.js) :
//  1. Recherche : WebSocket vers la Rencontre du jeu (/tr/ws), dans le mode, sur
//     la carte et avec le niveau de robots choisis ; 15 s au plus (le compte à
//     rebours est dans le jeu). Rien n'est ouvert à l'ouverture du site.
//  2. Partie trouvée (2 à 8 vrais joueurs) : WebSocket vers le Duel (/tr/duel),
//     qui fait passer les offres et candidats WebRTC (STUN public, pas de TURN).
//     Tous les DataChannel ouverts → pair-à-pair ; sinon, au bout de 5 s →
//     relais par le Duel, pour tout le monde.
//  3. Pair-à-pair EN ÉTOILE : le camp 0 (premier arrivé) est le PAIR HORLOGE
//     (cadenceur du moteur), relié à chacun des autres ; les autres ne sont
//     reliés qu'à lui et ne lui envoient que leurs ordres (et un signe de vie
//     chaque seconde). Hachages comparés par le pair horloge ; écart →
//     instantané du pair horloge.
//  4. Coupures (écran en veille, passage du wifi à la 4G, réseau perdu) :
//     - la connexion au Duel est surveillée (battement toutes les 4 s, et en
//       relais un paquet tous les 100 ms) : une connexion muette est fermée et
//       rouverte aussitôt ;
//     - reconnexion tout de suite quand le réseau revient (événement « online »)
//       ou quand l'écran se rallume, sinon essais rapprochés pendant 3 minutes ;
//     - à la reconnexion : instantané de la partie et ordres suivants (relais),
//       ou passage au relais si le lien pair-à-pair est mort (secours) ;
//     - le jeu affiche un bandeau (« moi » ou « adversaire ») tant que dure le
//       problème ; au bout de 12 s sans réseau, la partie continue contre le robot
//       sur l'appareil, et revient dans la vraie partie dès la reconnexion ;
//     - de l'autre côté, le camp absent est tenu par le robot au bout de 10 s et
//       revient au joueur dès son retour.
//
// Journal des connexions (console, préfixe « [temps réel] ») et compteurs du jour
// au Worker (Budget : pair-à-pair réussi, relayé, secours, échec, refus).
// Rien de personnel n'est envoyé : l'identifiant du jeu, l'empreinte de sa
// simulation et les ordres joués. En pair-à-pair, chaque appareil voit
// l'adresse IP publique de l'autre (WebRTC ; politique de confidentialité).
//
// Essais en local seulement (localhost) : ?multi=ws://localhost:<port> vise un
// serveur de test, &p2p=non force l'échec du pair-à-pair, et window.__fmgTempsReel
// (scripts/tester-temps-reel.mjs) rend le réseau muet quelques secondes (couper(ms))
// sans fermer les connexions, comme un passage du wifi à la 4G ou un écran en veille.
// ==========================================================================

import './moteur.js';
import { ADRESSE_MULTI, SITES_MULTI } from '../multijoueur/config.js';

const TR = globalThis.JEL_TR;
const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RE_SIM = /<script\b[^>]*\bid=["']jel-sim["'][^>]*>([\s\S]*?)<\/script>/i;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];
const DELAI_P2P_MS = 5000;          // DataChannel pas ouvert : relais
const VIE_MS = 1000;                // signe de vie du pair non horloge
const SILENCE_PAIR_MS = 3000;       // plus rien de l'autre appareil : bandeau (et secours côté pair non horloge)
const ABSENCE_MS = 10000;           // pair silencieux : son camp passe au robot (pair horloge)
const SECOURS_MAX_MS = 6000;        // le Duel n'a pas repris la partie : on attend le réseau
const PING_MS = 4000;               // battement de la connexion au Duel (réponse automatique, gratuite)
const MUET_RELAIS_MS = 3000;        // relais : plus aucun paquet → connexion morte
const MUET_MS = 12000;              // sinon : plus aucune réponse au battement → connexion morte
const GEL_MS = 8000;                // partie figée faute de réseau : elle continue contre le robot
const RECONNEXION_MAX_MS = 180000;  // on cherche à se reconnecter pendant 3 minutes au plus
const DELAIS_RECONNEXION = [300, 1000, 2000, 3000];
const RECENTS_MAX = 600;            // paquets gardés par le pair horloge (60 s), pour la reprise du pair
const MESSAGE_MAX = 2500;            // un ordre (un jeu de stratégie envoie la liste des unités choisies)
const RECU_MAX = 1000000;           // un message reçu (instantané d'un jeu de stratégie : 100 à 300 Ko)
const MORCEAU = 16000;              // lien direct : un message plus long part en morceaux (Safari : 64 Ko au plus)
const NIVEAU_RELAIS = 2;            // robot moyen à la place d'un pair absent
const RE_CHOIX = /^[a-z0-9*]{1,16}$/;

// Texte de la simulation d'un jeu (bloc jel-sim), tel que le Worker l'empreinte
// (scripts/multijoueur.mjs) : fins de ligne en \n, sans espaces autour.
export function texteSim(html) {
  const m = RE_SIM.exec(String(html || ''));
  return m ? m[1].replace(/\r\n/g, '\n').trim() : null;
}

async function empreinte(texte) {
  if (!texte || !globalThis.crypto?.subtle) return null;
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

const local = () => ['localhost', '127.0.0.1'].includes(location.hostname);

// Adresse du serveur pour ce site, ou null (partie contre le robot).
function adresseServeur() {
  if (local()) {
    const essai = new URLSearchParams(location.search).get('multi') || '';
    return /^wss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[\w/-]*)?$/.test(essai) ? essai.replace(/\/$/, '') : null;
  }
  return SITES_MULTI.includes(location.hostname) ? ADRESSE_MULTI : null;
}

const p2pPermis = () => !(local() && new URLSearchParams(location.search).get('p2p') === 'non');
const maintenant = () => performance.now();

function journal(...x) { try { console.info('[temps réel]', ...x); } catch { /* console absente */ } }

/**
 * À appeler une fois le jeu chargé. jeu : fiche du catalogue ; html : code du
 * jeu ; cadre : l'iframe. Renvoie { recevoir(message du jeu), fermer() }.
 */
export function brancherTempsReel({ jeu, html, cadre }) {
  let p = null;                       // partie en cours de mise en place ou de jeu (voir nouvelle())

  const versJeu = (m) => {
    try { cadre.contentWindow?.postMessage({ type: 'jel-tr', ...m }, '*'); } catch { /* cadre rechargé */ }
  };

  function nouvelle() {
    return {
      phase: 'recherche',             // recherche | duel | jeu | secours
      wsR: null, wsD: null,
      liens: new Map(),               // pair-à-pair : camp → lien (pair horloge : un par joueur ; sinon : le camp 0)
      camp: 0, duel: null, jeton: null, graine: 0, config: null, humains: [0, 1], systeme: 2,
      mode: null, cad: null, minuteurCad: 0, t0: 0, kDebut: 0,
      jeuPret: false, demarre: false, fini: false,
      dernierK: 0, recents: [], hashesMoi: new Map(),
      attenteSnapPairs: new Set(), attenteSnapDuel: false,
      autresEnPanne: new Set(),       // camps dont le problème de réseau est affiché dans le jeu (bandeau)
      vuD: 0,                         // dernier message (ou battement) reçu du Duel
      panne: 0,                       // début du problème de réseau de cet appareil (0 : aucun)
      coupe: false,                   // le jeu continue contre le robot en attendant la reconnexion
      besoinSecours: false,           // lien pair-à-pair mort : secours à demander dès la reconnexion
      debutReco: 0, essai: 0, minuteurReco: 0, minuteurGel: 0,
      minuteurs: [],
    };
  }

  // Lien direct avec un autre appareil (pair-à-pair).
  function nouveauLien(camp) {
    return { camp, pc: null, dc: null, ouvert: false, ices: [], pret: false, pretEnvoye: false, dernier: 0, robot: false, hashes: new Map(), morceaux: null, muet: false, debut: 0 };
  }
  const liensDe = (q) => [...q.liens.values()];
  const lienOuvert = (q) => liensDe(q).some((l) => l.ouvert);
  const tousOuverts = (q) => q.liens.size > 0 && liensDe(q).every((l) => l.ouvert);
  const fermerLiens = (q) => {
    for (const l of liensDe(q)) { try { l.dc?.close(); } catch { /* fermé */ } try { l.pc?.close(); } catch { /* fermée */ } }
    q.liens.clear();
  };

  function minuterie(f, ms, repete = false) {
    const id = repete ? setInterval(f, ms) : setTimeout(f, ms);
    p?.minuteurs.push(id);
    return id;
  }

  function fermer() {
    if (!p) return;
    const q = p;
    p = null;
    for (const id of q.minuteurs) { clearTimeout(id); clearInterval(id); }
    clearInterval(q.minuteurCad);
    clearTimeout(q.minuteurReco);
    clearTimeout(q.minuteurGel);
    for (const ws of [q.wsR, q.wsD]) {
      if (!ws) continue;
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try { ws.close(1000, 'fin'); } catch { /* fermée */ }
    }
    fermerLiens(q);
  }

  // Plus de partie en ligne : avant la partie → robot ; pendant → le jeu continue seul, sans retour.
  function abandonner(raison) {
    const q = p;
    const enJeu = q && (q.phase === 'jeu' || q.phase === 'secours');
    journal('abandon', raison, enJeu ? '(la partie continue contre le robot)' : '');
    if (enJeu && q.panne) versJeu({ etat: 'reseau', qui: 'moi', ok: false, fin: true });
    fermer();
    versJeu({ etat: enJeu ? 'coupe' : 'solo', raison, retour: false });
  }

  // Essais en local : réseau muet jusqu'à cette heure (rien n'entre, rien ne sort, rien ne s'ouvre).
  const muet = () => !!p && p.muetJusqua > maintenant();
  const wsOuvert = (ws) => !!ws && ws.readyState === 1;
  const envoyerD = (m) => {
    const ws = p?.wsD;
    if (!wsOuvert(ws) || muet()) return false;
    try { ws.send(JSON.stringify(m)); return true; } catch { return false; }
  };
  // Un message à un autre appareil (lien direct).
  const envoyerLien = (lien, m) => {
    const dc = lien?.dc;
    if (!dc || dc.readyState !== 'open' || muet()) return false;
    try {
      const t = JSON.stringify(m);
      if (t.length <= MORCEAU) { dc.send(t); return true; }
      // Long message (instantané) : en morceaux numérotés, recollés à l'arrivée.
      const id = (p.morceauId = (p.morceauId || 0) + 1), n = Math.ceil(t.length / MORCEAU);
      for (let i = 0; i < n; i++) dc.send(JSON.stringify({ t: 'morceau', id, i, n, d: t.slice(i * MORCEAU, (i + 1) * MORCEAU) }));
      return true;
    } catch { return false; }
  };
  // Pair horloge : à tous les autres appareils ; sinon : au pair horloge.
  const envoyerPair = (m) => {
    let ok = false;
    for (const l of liensDe(p)) if (envoyerLien(l, m)) ok = true;
    return ok;
  };
  // Morceaux reçus d'un appareil : le message entier, une fois tous arrivés (sinon null).
  const recoller = (lien, m) => {
    if (!Number.isInteger(m.id) || !Number.isInteger(m.i) || !Number.isInteger(m.n) || m.n < 1 || m.n > Math.ceil(RECU_MAX / MORCEAU) || typeof m.d !== 'string') return null;
    if (!lien.morceaux || lien.morceaux.id !== m.id) lien.morceaux = { id: m.id, n: m.n, parts: [], recus: 0 };
    const r = lien.morceaux;
    if (m.i < 0 || m.i >= r.n || r.parts[m.i] !== undefined) return null;
    r.parts[m.i] = m.d; r.recus += 1;
    if (r.recus < r.n) return null;
    lien.morceaux = null;
    try { return JSON.parse(r.parts.join('')); } catch { return null; }
  };
  // La connexion au Duel répond-elle encore ?
  const duelVivant = () => !!p && wsOuvert(p.wsD) && maintenant() - p.vuD < MUET_MS;

  // --- 1. Recherche ---------------------------------------------------------

  let derniersChoix = {};             // mode, carte et niveau de la dernière recherche (« Un joueur est disponible »)

  async function chercher(d) {
    fermer();
    const adresse = adresseServeur();
    if (!adresse || window.top !== window || window.opener) return versJeu({ etat: 'solo', raison: 'site' });
    if (navigator.onLine === false) return versJeu({ etat: 'solo', raison: 'hors-ligne' });
    if (!jeu.temps_reel || !ID_VALIDE.test(jeu.id)) return versJeu({ etat: 'solo', raison: 'jeu' });
    // Un jeu gardé sur l'appareil avec un ancien moteur : partie contre le robot (il sera mis à jour).
    if (d && d.proto !== undefined && d.proto !== TR.PROTOCOLE) return versJeu({ etat: 'solo', raison: 'jeu' });
    const sim = await empreinte(texteSim(html));
    if (!sim) return versJeu({ etat: 'solo', raison: 'jeu' });
    const choix = d && d.config && typeof d.config === 'object' ? d.config : {};
    derniersChoix = {};
    let params = '';
    for (const cle of ['mode', 'carte', 'niveau']) {
      const v = String(choix[cle] ?? '');
      if (RE_CHOIX.test(v)) { derniersChoix[cle] = v; params += `&${cle}=${encodeURIComponent(v)}`; }
    }
    p = nouvelle();
    const q = p;
    let ws;
    try { ws = new WebSocket(`${adresse}/tr/ws?jeu=${encodeURIComponent(jeu.id)}&sim=${sim}&proto=${TR.PROTOCOLE}${params}`); }
    catch { abandonner('reseau'); return; }
    q.wsR = ws;
    q.adresse = adresse;
    ws.onmessage = (e) => {
      if (p !== q || typeof e.data !== 'string' || e.data === 'pong' || e.data.length > RECU_MAX) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'attente') versJeu({ etat: 'attente', n: Number.isInteger(m.n) ? m.n : 0, max: Number.isInteger(m.max) ? m.max : 2 });
      else if (m.t === 'trouve' && typeof m.duel === 'string' && RE_UUID.test(String(m.jeton))) {
        const humains = Array.isArray(m.humains) && m.humains.length >= 2 && m.humains.every((c) => Number.isInteger(c) && c >= 0 && c < TR.CAMPS_MAX) ? m.humains : [0, 1];
        const camp = humains.includes(m.camp) ? m.camp : 0;
        Object.assign(q, { camp, humains, systeme: Number.isInteger(m.systeme) ? m.systeme : 2, duel: m.duel, jeton: m.jeton, graine: m.graine >>> 0, config: m.config || {} });
        ws.onclose = ws.onerror = null;
        try { ws.close(1000, 'trouve'); } catch { /* fermée */ }
        q.wsR = null;
        journal('partie trouvée', `camp ${q.camp} sur ${humains.length} joueurs`);
        ouvrirDuel(false);
        minuterie(surveiller, 500, true);
      } else if (m.t === 'refus') abandonner(m.raison || 'refus');
    };
    ws.onclose = ws.onerror = () => { if (p === q && q.phase === 'recherche') abandonner('reseau'); };
  }

  // --- 2. Duel : signalisation, choix du mode, reconnexions -----------------

  function ouvrirDuel(reprise) {
    const q = p;
    if (!q || q.fini) return;
    if (muet()) { planifierReconnexion(); return; }
    let ws;
    try { ws = new WebSocket(`${q.adresse}/tr/duel?nom=${encodeURIComponent(q.duel)}&jeton=${q.jeton}`); }
    catch { if (reprise) planifierReconnexion(); else abandonner('reseau'); return; }
    q.wsD = ws;
    if (!reprise) q.phase = 'duel';
    ws.onopen = () => {
      if (p !== q || q.wsD !== ws) return;
      q.vuD = maintenant();
      if (!q.ping) q.ping = minuterie(() => { try { if (wsOuvert(q.wsD) && !muet()) q.wsD.send('ping'); } catch { /* fermée */ } }, PING_MS, true);
      if (reprise) return;            // la suite dépend de l'état du Duel (message « bienvenue »)
      versJeu({ etat: 'trouve', camp: q.camp, graine: q.graine, config: q.config, humains: q.humains });
      if (p2pPermis() && typeof RTCPeerConnection === 'function') demarrerP2P();
      else { journal('pair-à-pair non tenté'); envoyerD({ t: 'relais' }); }
    };
    ws.onmessage = (e) => {
      if (p !== q || q.wsD !== ws || typeof e.data !== 'string' || e.data.length > RECU_MAX || muet()) return;
      q.vuD = maintenant();
      if (e.data === 'pong') return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      surDuel(m, reprise);
    };
    ws.onclose = ws.onerror = (e) => {
      if (p !== q || q.wsD !== ws) return;
      q.wsD = null;
      q.derniereFermeture = e && e.code ? `${e.code} ${e.reason || ''}`.trim() : 'erreur';
      if (q.fini) return;
      if (!q.demarre && !q.mode && q.phase === 'duel') { abandonner('reseau'); return; }   // avant la partie : robot
      journal(`connexion au serveur perdue (${q.derniereFermeture}) : reconnexion`);
      // Relais : la partie est figée tant que la connexion manque. Pair-à-pair : elle continue
      // tant que le lien direct tient (la connexion au Duel ne sert qu'aux secours).
      if (q.mode === 'relais' || !lienOuvert(q)) panneMoi();
      planifierReconnexion();
    };
  }

  // Essais de reconnexion rapprochés (300 ms, 1 s, 2 s, puis toutes les 3 s), pendant 3 minutes.
  function planifierReconnexion(tout = false) {
    const q = p;
    if (!q || q.fini || wsOuvert(q.wsD) || (q.wsD && q.wsD.readyState === 0)) return;
    if (tout) { clearTimeout(q.minuteurReco); q.minuteurReco = 0; q.essai = 0; }
    if (q.minuteurReco) return;
    if (!q.debutReco) q.debutReco = maintenant();
    if (maintenant() - q.debutReco > RECONNEXION_MAX_MS) { renoncer(); return; }
    const attente = tout ? 0 : DELAIS_RECONNEXION[Math.min(q.essai, DELAIS_RECONNEXION.length - 1)];
    q.essai += 1;
    q.minuteurReco = setTimeout(() => {
      q.minuteurReco = 0;
      if (p !== q || q.fini) return;
      if (navigator.onLine === false) { planifierReconnexion(); return; }    // on attend « online »
      ouvrirDuel(true);
    }, attente);
  }

  // Trois minutes sans réseau : la partie reste contre le robot sur l'appareil.
  function renoncer() {
    const q = p;
    if (!q) return;
    journal('reconnexion impossible : la partie reste contre le robot');
    versJeu({ etat: 'reseau', qui: 'moi', ok: false, fin: true });
    if (!q.coupe) versJeu({ etat: 'coupe', raison: 'reseau', retour: false });
    fermer();
  }

  // Problème de réseau sur cet appareil : bandeau, puis, si la partie reste figée, robot en attendant.
  function panneMoi() {
    const q = p;
    if (!q || q.panne || q.fini) return;
    q.panne = maintenant();
    versJeu({ etat: 'reseau', qui: 'moi', ok: false });
    // Le pair horloge n'est jamais figé : il est l'horloge (le camp absent passe au robot).
    const fige = q.mode === 'relais' || q.camp !== 0 || !q.demarre;
    if (!fige) return;
    clearTimeout(q.minuteurGel);
    q.minuteurGel = setTimeout(() => {
      if (p !== q || !q.panne || q.coupe || q.fini) return;
      q.coupe = true;
      journal('toujours pas de réseau : la partie continue contre le robot en attendant');
      versJeu({ etat: 'coupe', raison: 'reseau', retour: true });
    }, GEL_MS);
  }

  function finPanne() {
    const q = p;
    if (!q || !q.panne) return;
    q.panne = 0;
    q.debutReco = 0;
    q.essai = 0;
    clearTimeout(q.minuteurGel);
    journal('réseau retrouvé');
    versJeu({ etat: 'reseau', qui: 'moi', ok: true });
  }

  // Surveillance (toutes les 500 ms) : connexion au Duel muette, silence de l'autre appareil.
  function surveiller() {
    const q = p;
    if (!q || q.fini || q.phase === 'recherche') return;
    const t = maintenant();
    if (wsOuvert(q.wsD)) {
      const relaisEnCours = q.mode === 'relais' && q.demarre && !q.coupe && q.phase === 'jeu';
      if (t - q.vuD > (relaisEnCours ? MUET_RELAIS_MS : MUET_MS)) {
        journal('connexion au serveur muette : on la rouvre');
        const ws = q.wsD;
        try { ws.close(4000, 'muette'); } catch { /* fermée */ }
        ws.onclose?.();
      }
    }
    // Secours en attente (lien direct mort pendant une coupure) : il part dès que la connexion répond.
    if (q.besoinSecours && wsOuvert(q.wsD) && !muet() && t - q.vuD < MUET_MS) {
      q.besoinSecours = false;
      q.phase = 'secours';
      envoyerD({ t: 'secours', k: q.dernierK });
      minuterie(() => { if (p === q && q.phase === 'secours') panneMoi(); }, SECOURS_MAX_MS);
    }
    if (q.mode === 'p2p' && q.demarre && q.phase === 'jeu') {
      const muets = liensDe(q).filter((l) => !l.muet && !l.parti && t - l.dernier > SILENCE_PAIR_MS);
      const vivant = liensDe(q).some((l) => t - l.dernier <= SILENCE_PAIR_MS);
      if (!muets.length) q.sonde = 0;
      else if (vivant) {
        // Pair horloge : un autre appareil répond encore, c'est donc ce joueur-là qui a un problème.
        for (const l of muets) signalerMuet(l);
      } else if (!q.sonde) {
        // Plus aucun appareil ne répond : est-ce eux, ou nous ? Battement immédiat vers le serveur.
        q.sonde = t;
        try { if (wsOuvert(q.wsD) && !muet()) q.wsD.send('ping'); } catch { /* fermée */ }
      } else if (t - q.sonde > 1500) {
        const nousRepondons = wsOuvert(q.wsD) && q.vuD > q.sonde;
        q.sonde = 0;
        if (nousRepondons) for (const l of muets) signalerMuet(l);
        else { for (const l of muets) l.muet = true; panneMoi(); }
        if (q.camp !== 0) surPerteP2P('silence');          // le pair horloge ne répond plus : secours
      }
    }
  }

  // Un autre appareil se tait : bandeau ; le pair horloge prévient aussi les autres joueurs.
  function signalerMuet(lien) {
    const q = p;
    lien.muet = true;
    annoncerAutre(lien.camp, false);
    if (q.camp === 0) for (const l of liensDe(q)) if (l !== lien) envoyerLien(l, { t: 'reseau', camp: lien.camp, ok: false });
  }

  // Bandeau « un autre joueur a un problème de réseau » : on garde la liste, pour l'effacer quand le
  // serveur reprend la partie (il annonce lui-même ensuite les problèmes qu'il voit).
  function annoncerAutre(camp, ok) {
    const q = p;
    if (!q) return;
    if (ok) { if (!q.autresEnPanne.delete(camp)) return; } else q.autresEnPanne.add(camp);
    versJeu({ etat: 'reseau', qui: 'adversaire', camp, ok });
  }
  function oublierAutres() {
    const q = p;
    for (const camp of [...q.autresEnPanne]) annoncerAutre(camp, true);
  }

  // Écran rallumé, réseau revenu : on vérifie tout de suite.
  function verifierMaintenant() {
    const q = p;
    if (!q || q.fini || q.phase === 'recherche' || document.visibilityState === 'hidden') return;
    if (!wsOuvert(q.wsD)) planifierReconnexion(true);
    else if (maintenant() - q.vuD > PING_MS + 1500) { try { q.wsD.send('ping'); } catch { /* fermée */ } }
    surveiller();
  }
  addEventListener('online', verifierMaintenant);
  document.addEventListener('visibilitychange', verifierMaintenant);
  if (local()) {
    globalThis.__fmgTempsReel = {
      // Réseau muet pendant ms, puis « online » (le réseau revient).
      couper(ms) {
        if (!p) return false;
        p.muetJusqua = maintenant() + ms;
        setTimeout(() => dispatchEvent(new Event('online')), ms + 20);
        return true;
      },
      etat: () => (p ? { mode: p.mode, phase: p.phase, camp: p.camp, humains: p.humains, panne: !!p.panne, coupe: p.coupe, dcOuvert: lienOuvert(p), liens: p.liens.size, ws: wsOuvert(p.wsD) } : null),
    };
  }

  // Le Duel a repris la partie (relais) : ce lanceur n'est plus l'horloge et ferme les liens directs.
  function adopterRelais() {
    const q = p;
    clearInterval(q.minuteurCad);
    q.cad = null;
    fermerLiens(q);
    q.mode = 'relais';
    q.pretEnvoye = true;
    versJeu({ etat: 'mode', mode: 'relais' });
  }

  function surDuel(m, reprise) {
    const q = p;
    switch (m.t) {
      case 'bienvenue':
        // Première connexion : le relais a pu être décidé avant notre arrivée (annonce manquée).
        if (!reprise) { if (m.mode === 'relais' && !q.mode) surDuel({ t: 'mode', mode: 'relais' }, false); return; }
        journal('reconnecté au serveur', `(mode ${m.mode || 'aucun'})`);
        q.debutReco = 0; q.essai = 0;
        if (m.mode === 'relais') {
          if (q.mode !== 'relais') adopterRelais();
          // Instantané et ordres manqués (ou, si le serveur attend un état, il nous le demande).
          envoyerD({ t: 'reprise', depuis: q.dernierK });
        } else if (m.mode === 'p2p') {
          if ((q.camp !== 0 && !lienOuvert(q)) || q.besoinSecours) { q.besoinSecours = false; q.phase = 'secours'; envoyerD({ t: 'secours', k: q.dernierK }); }
          else finPanne();
        } else if (m.mode === 'refus') abandonner('refus');
        return;
      case 'sdp': surSdp(q.liens.get(q.camp === 0 ? m.de : 0), m.d); return;
      case 'ice': {
        const lien = q.liens.get(q.camp === 0 ? m.de : 0);
        if (!lien?.pc || !m.d) return;
        if (lien.pc.remoteDescription) lien.pc.addIceCandidate(m.d).catch(() => {});
        else lien.ices.push(m.d);
        return;
      }
      case 'mode':
        if (m.mode === 'p2p') {
          if (q.mode === 'p2p') return;
          q.mode = 'p2p';
          journal('mode pair-à-pair');
        } else if (m.mode === 'relais') {
          if (q.mode === 'p2p') { adopterRelais(); journal('secours : partie reprise par le serveur'); }
          else {
            q.mode = 'relais';
            journal('mode relayé (pair-à-pair non établi)');
            fermerLiens(q);
            versJeu({ etat: 'mode', mode: 'relais' });
          }
          if (m.secours) q.phase = 'secours';
        }
        if (m.mode === 'p2p') versJeu({ etat: 'mode', mode: 'p2p' });
        if (q.phase === 'duel') q.phase = 'jeu';
        signalerPret();
        return;
      case 'refus':
        journal('refus du serveur', m.raison);
        if (q.phase === 'secours' || q.demarre) abandonner(m.raison || 'refus');
        else { fermer(); versJeu({ etat: 'solo', raison: m.raison || 'refus' }); }
        return;
      case 'k':
        // Le serveur cadence alors qu'on se croit en pair-à-pair : on a manqué le passage au relais
        // (coupure) ; on l'adopte et on redemande l'état.
        if (q.mode === 'p2p') { journal('le serveur a repris la partie pendant la coupure'); adopterRelais(); envoyerD({ t: 'reprise', depuis: q.dernierK }); return; }
        if (q.mode === 'relais' && !q.coupe) { q.demarre = true; finPanne(); recevoirPaquet(m); }
        return;
      case 'snap':
        if (m.snap && Number.isInteger(m.snap.k)) {
          q.dernierK = m.snap.k;
          q.phase = 'jeu';
          q.demarre = true;
          q.coupe = false;            // le jeu revient dans la vraie partie (moteur : revenirEnLigne)
          finPanne();
          oublierAutres();
          versJeu({ snap: m.snap });
        }
        return;
      case 'demande-snap':
        // Un jeu qui a continué seul contre le robot n'a plus l'état de la vraie partie : il ne répond pas.
        if (q.coupe) return;
        q.attenteSnapDuel = true;
        versJeu({ demande: 'snap' });
        return;
      case 'reseau':
        if (Number.isInteger(m.camp) && m.camp !== q.camp) {
          journal(m.ok ? `réseau du camp ${m.camp} revenu` : `problème de réseau chez le camp ${m.camp}`);
          annoncerAutre(m.camp, m.ok === true);
        }
        return;
      default:
        return;
    }
  }

  // --- WebRTC -----------------------------------------------------------------

  // Pair horloge (camp 0) : un lien vers chacun des autres joueurs ; les autres : un lien vers lui.
  async function demarrerP2P() {
    const q = p;
    q.debutP2P = maintenant();
    minuterie(() => {
      if (p !== q || tousOuverts(q) || q.mode) return;
      journal(`pair-à-pair non établi en 5 s (${liensDe(q).filter((l) => l.ouvert).length} lien(s) ouvert(s) sur ${q.liens.size}) : relais demandé`);
      envoyerD({ t: 'relais' });
    }, DELAI_P2P_MS);
    const autres = q.camp === 0 ? q.humains.filter((c) => c !== 0) : [0];
    for (const camp of autres) {
      const lien = nouveauLien(camp);
      q.liens.set(camp, lien);
      let pc;
      try { pc = new RTCPeerConnection({ iceServers: ICE }); } catch { envoyerD({ t: 'relais' }); return; }
      lien.pc = pc;
      pc.onicecandidate = (e) => { if (e.candidate && p === q) envoyerD({ t: 'ice', d: e.candidate.toJSON(), vers: camp }); };
      if (q.camp === 0) {
        brancherDC(lien, pc.createDataChannel('fmg', { ordered: true }));
        try {
          await pc.setLocalDescription(await pc.createOffer());
          envoyerD({ t: 'sdp', d: pc.localDescription.toJSON(), vers: camp });
        } catch { envoyerD({ t: 'relais' }); }
      } else {
        pc.ondatachannel = (e) => brancherDC(lien, e.channel);
      }
    }
  }

  async function surSdp(lien, desc) {
    if (!lien?.pc || !desc) return;
    try {
      await lien.pc.setRemoteDescription(desc);
      for (const c of lien.ices.splice(0)) lien.pc.addIceCandidate(c).catch(() => {});
      if (desc.type === 'offer') {
        await lien.pc.setLocalDescription(await lien.pc.createAnswer());
        envoyerD({ t: 'sdp', d: lien.pc.localDescription.toJSON(), vers: lien.camp });
      }
    } catch { envoyerD({ t: 'relais' }); }
  }

  function brancherDC(lien, dc) {
    const q = p;
    lien.dc = dc;
    dc.onopen = () => {
      if (p !== q || q.liens.get(lien.camp) !== lien) return;
      lien.ouvert = true;
      lien.dernier = maintenant();
      journal(`DataChannel ouvert avec le camp ${lien.camp} en ${Math.round(maintenant() - q.debutP2P)} ms`);
      if (tousOuverts(q)) envoyerD({ t: 'p2p' });
      signalerPret();
    };
    dc.onmessage = (e) => {
      if (p !== q || typeof e.data !== 'string' || e.data.length > RECU_MAX || muet()) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m && m.t === 'morceau') { m = recoller(lien, m); if (!m) { lien.dernier = maintenant(); return; } }
      if (m) surPair(lien, m);
    };
    dc.onclose = () => {
      if (p !== q || lien.dc !== dc || !lien.ouvert) return;
      lien.ouvert = false;
      if (lien.parti) return;                              // ce joueur est parti : rien à faire
      journal(`lien direct avec le camp ${lien.camp} fermé`);
      // Un joueur qui perd le pair horloge demande le secours ; le pair horloge continue (le camp
      // de l'absent passe au robot) et attend que le Duel reprenne la partie quand l'autre revient.
      if (q.camp !== 0) surPerteP2P('fermé');
    };
  }

  // --- 3. Partie --------------------------------------------------------------

  // Prêt à jouer : relais → au Duel ; pair-à-pair → au pair horloge (ou départ de l'horloge quand tous sont prêts).
  function signalerPret() {
    const q = p;
    if (!q || !q.jeuPret || !q.mode || q.phase === 'secours') return;
    if (q.mode === 'relais') { if (!q.pretEnvoye) { q.pretEnvoye = envoyerD({ t: 'pret' }); } return; }
    if (q.mode === 'p2p' && tousOuverts(q)) {
      if (q.camp !== 0) {
        const lien = q.liens.get(0);
        if (!lien.pretEnvoye) lien.pretEnvoye = envoyerLien(lien, { t: 'pret' });
        if (!q.vie) q.vie = minuterie(() => envoyerPair({ t: 'vie' }), VIE_MS, true);
        lien.dernier = maintenant();
      } else if (liensDe(q).every((l) => l.pret)) demarrerHorloge(0);
    }
  }

  // Pair horloge : cadenceur du moteur, un paquet par tick vers le jeu et vers le pair.
  function demarrerHorloge(depart) {
    const q = p;
    if (q.demarre) return;
    q.demarre = true;
    const camps = Array.isArray(q.config && q.config.ctl) ? q.config.ctl.length : 2;
    q.cad = new TR.Cadenceur({
      camps, systeme: q.systeme, delai: TR.REGLAGES.delaiEntree, depart,
      envoyer: (paquet) => {
        q.recents.push(paquet);
        if (q.recents.length > RECENTS_MAX) q.recents.shift();
        q.dernierK = paquet.k;
        envoyerPair(paquet);
        versJeu({ paquet });
      },
    });
    q.t0 = maintenant();
    q.kDebut = depart;
    for (const l of liensDe(q)) l.dernier = maintenant();
    journal(`horloge démarrée (pair horloge, ${q.liens.size + 1} joueurs)`);
    q.minuteurCad = setInterval(battre, 25);
  }

  function battre() {
    const q = p;
    if (!q?.cad) return;
    const tick = TR.REGLAGES.tickMs, t = maintenant();
    let dus = q.kDebut + Math.floor((t - q.t0) / tick) - q.cad.k;
    // Onglet en arrière-plan (minuteries ralenties) : on rattrape les ticks dus ; au-delà de 60 s
    // (appareil endormi), l'horloge repart d'ici plutôt que d'envoyer une avalanche de paquets.
    if (dus > 600) { q.t0 = t - (q.cad.k - q.kDebut) * tick; dus = 1; }
    while (dus-- > 0) q.cad.pas();
    for (const l of liensDe(q)) {
      if (!l.robot && t - l.dernier > ABSENCE_MS) {
        journal(`camp ${l.camp} silencieux : il passe au robot`);
        q.cad.controle(l.camp, NIVEAU_RELAIS);
        l.robot = true;
      }
    }
  }

  function surPair(lien, m) {
    const q = p;
    lien.dernier = maintenant();
    if (lien.muet) {
      lien.muet = false;
      annoncerAutre(lien.camp, true);
      if (q.camp === 0) for (const l of liensDe(q)) if (l !== lien) envoyerLien(l, { t: 'reseau', camp: lien.camp, ok: true });
      finPanne();
    }
    if (q.camp === 0) {
      if (lien.robot && !lien.parti && q.cad && m.t !== 'pret') { q.cad.controle(lien.camp, 0); lien.robot = false; journal(`camp ${lien.camp} revenu : il reprend la main`); }
      if (m.t === 'quitte') {
        lien.parti = true;
        if (q.cad && !lien.robot) { q.cad.controle(lien.camp, NIVEAU_RELAIS); lien.robot = true; }
        journal(`camp ${lien.camp} a quitté la partie : le robot prend sa place`);
        return;
      }
      if (m.t === 'pret') { lien.pret = true; signalerPret(); }
      else if (m.t === 'o' && q.cad && Array.isArray(m.o)) q.cad.recevoir(lien.camp, m.seq, m.o);
      else if (m.t === 'h' && Number.isInteger(m.k)) { lien.hashes.set(m.k, m.h); comparer(lien, m.k); }
      else if (m.t === 'reprise') envoyerSnapAuPair(lien);
    } else {
      if (m.t === 'k') { q.demarre = true; recevoirPaquet(m); }
      else if (m.t === 'snap' && m.snap) { q.dernierK = m.snap.k; versJeu({ snap: m.snap }); }
      else if (m.t === 'journal' && Array.isArray(m.paquets)) for (const x of m.paquets) recevoirPaquet(x);
      else if (m.t === 'reseau' && Number.isInteger(m.camp) && m.camp !== q.camp) annoncerAutre(m.camp, m.ok === true);
    }
  }

  function recevoirPaquet(paquet) {
    if (!paquet || !Number.isInteger(paquet.k) || !Array.isArray(paquet.o)) return;
    if (paquet.k > p.dernierK) p.dernierK = paquet.k;
    versJeu({ paquet: { t: 'k', k: paquet.k, o: paquet.o } });
  }

  // Pair horloge : hachage d'un joueur comparé au sien (au même tick).
  function comparer(lien, k) {
    const q = p;
    const a = q.hashesMoi.get(k), b = lien.hashes.get(k);
    if (!a || !b) return;
    lien.hashes.delete(k);
    if (a !== b) {
      console.warn('[temps réel] désynchronisation', JSON.stringify({ k, camp: lien.camp, horloge: a, pair: b, ordres: q.recents.slice(-50) }));
      envoyerSnapAuPair(lien);
    }
  }

  function envoyerSnapAuPair(lien) {
    p.attenteSnapPairs.add(lien.camp);
    versJeu({ demande: 'snap' });
  }

  // Instantané donné par le jeu (réponse à une demande).
  function snapDuJeu(snap) {
    const q = p;
    if (!q || !snap || !Number.isInteger(snap.k)) return;
    if (q.attenteSnapDuel) {
      q.attenteSnapDuel = false;
      if (!q.coupe) envoyerD({ t: 'snap', snap });
    }
    for (const camp of q.attenteSnapPairs) {
      const lien = q.liens.get(camp);
      envoyerLien(lien, { t: 'snap', snap });
      envoyerLien(lien, { t: 'journal', paquets: q.recents.filter((x) => x.k > snap.k) });
    }
    q.attenteSnapPairs.clear();
  }

  // --- 4. Pair-à-pair coupé (un joueur perd le pair horloge) : secours par le Duel

  function surPerteP2P(raison) {
    const q = p;
    if (!q || q.mode !== 'p2p' || q.phase === 'secours' || q.fini || q.camp === 0) return;
    journal(`lien direct perdu (${raison}) : secours demandé au serveur`);
    q.phase = 'secours';
    fermerLiens(q);
    if (!envoyerD({ t: 'secours', k: q.dernierK })) {
      // Pas de connexion au serveur non plus : le secours partira à la reconnexion.
      q.besoinSecours = true;
      panneMoi();
      planifierReconnexion(true);
      return;
    }
    minuterie(() => { if (p === q && q.phase === 'secours') panneMoi(); }, SECOURS_MAX_MS);
  }

  return {
    recevoir(d) {
      switch (d.op) {
        case 'chercher': chercher(d); return;
        case 'lancer':
          // Partie à plus de 2 : la Rencontre commence avec les joueurs réunis (ou répond « personne »).
          if (p?.phase === 'recherche' && wsOuvert(p.wsR)) { try { p.wsR.send(JSON.stringify({ t: 'lancer' })); } catch { /* fermée */ } }
          return;
        case 'attente': compter(); return;
        case 'quitter': {
          // Partie finie : on laisse 3 s à l'autre pour recevoir les derniers paquets avant de fermer.
          const q = p;
          if (q?.fini) { q.cad = null; clearInterval(q.minuteurCad); setTimeout(() => { if (p === q) fermer(); }, 3000); return; }
          if (q && q.demarre && !q.coupe) {
            // Départ en pleine partie : les autres continuent, un robot prend la place tout de suite.
            if (q.mode === 'p2p' && q.camp !== 0) envoyerPair({ t: 'quitte' });
            envoyerD({ t: 'quitte' });
          }
          fermer();
          return;
        }
        case 'pret':
          if (p) { p.jeuPret = true; signalerPret(); }
          return;
        case 'ordre': {
          const q = p;
          if (!q || q.coupe || !Number.isInteger(d.seq) || !TR.ordreBienForme(d.o)) return;
          if (q.mode === 'p2p' && q.camp === 0 && q.cad) q.cad.recevoir(0, d.seq, d.o);
          else if (q.mode === 'p2p' && q.camp !== 0) envoyerPair({ t: 'o', seq: d.seq, o: d.o });
          else if (q.mode === 'relais' && JSON.stringify(d.o).length < MESSAGE_MAX) envoyerD({ t: 'o', seq: d.seq, o: d.o });
          return;
        }
        case 'hash': {
          const q = p;
          if (!q || q.coupe || !Number.isInteger(d.k) || typeof d.h !== 'string') return;
          if (q.mode === 'p2p' && q.camp === 0) {
            q.hashesMoi.set(d.k, d.h);
            if (q.hashesMoi.size > 40) q.hashesMoi.delete(q.hashesMoi.keys().next().value);
            for (const l of liensDe(q)) comparer(l, d.k);
          }
          else if (q.mode === 'p2p') envoyerPair({ t: 'h', k: d.k, h: d.h });
          else if (q.mode === 'relais') envoyerD({ t: 'h', k: d.k, h: d.h });
          return;
        }
        case 'snap': snapDuJeu(d.snap); return;
        case 'reprise':
          if (p?.mode === 'relais') envoyerD({ t: 'reprise', depuis: d.depuis });
          else if (p?.mode === 'p2p' && p.camp !== 0) envoyerPair({ t: 'reprise', depuis: d.depuis });
          return;
        case 'fin':
          if (!p) return;
          p.fini = true;
          if (p.mode === 'p2p') envoyerD({ t: 'fin' });
          return;
        default:
      }
    },
    fermer,
  };

  // Joueurs en recherche (fin d'une partie contre le robot) : une seule lecture.
  async function compter() {
    const adresse = adresseServeur();
    if (!adresse || navigator.onLine === false) return versJeu({ etat: 'attente', n: 0 });
    try {
      const mode = derniersChoix.mode ? `&mode=${encodeURIComponent(derniersChoix.mode)}` : '';
      const r = await fetch(`${adresse.replace(/^ws/, 'http')}/tr/attente?jeu=${encodeURIComponent(jeu.id)}${mode}`, {
        signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
      });
      const x = r.ok ? await r.json() : null;
      versJeu({ etat: 'attente', n: Number.isInteger(x?.enRecherche) ? x.enRecherche : 0 });
    } catch {
      versJeu({ etat: 'attente', n: 0 });
    }
  }
}
