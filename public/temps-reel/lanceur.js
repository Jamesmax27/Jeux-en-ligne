// ==========================================================================
// Free Micro Games — jeux en temps réel, côté lanceur (utilisé par play.js)
// Cadrage : docs/cadrage-temps-reel.md (sections 3 à 7).
//
// Le jeu tourne dans le cadre isolé du lanceur, sans aucun accès au réseau.
// Son moteur (public/temps-reel/moteur.js, window.JEL_TR) parle au lanceur par
// postMessage (type 'jel-tr') ; c'est le lanceur qui fait tout le réseau :
//
//   jeu → lanceur : op 'chercher' (recherche d'un adversaire), 'pret' (jeu prêt
//                   à jouer la partie trouvée), 'ordre' { seq, o }, 'hash' { k, h },
//                   'snap' { snap } (réponse à une demande), 'reprise' { depuis }
//                   (paquet manquant), 'fin', 'quitter', 'attente' (joueurs en recherche)
//   lanceur → jeu : { etat: 'attente', n }, { etat: 'trouve', camp, graine, config },
//                   { etat: 'mode', mode }, { etat: 'solo', raison } (pas de partie en
//                   ligne : robot), { etat: 'coupe', raison } (plus de réseau en pleine
//                   partie : robot), { paquet }, { snap }, { demande: 'snap' }
//
// Déroulé (en ligne seulement : freemicrogames.com, SITES_MULTI de config.js) :
//  1. Recherche : WebSocket vers la Rencontre du jeu (/tr/ws), 15 s au plus (le
//     compte à rebours est dans le jeu). Rien n'est ouvert à l'ouverture du site.
//  2. Adversaire trouvé : WebSocket vers le Duel (/tr/duel), qui fait passer
//     l'offre et les candidats WebRTC (STUN public, pas de TURN). DataChannel
//     ouvert → pair-à-pair ; sinon, au bout de 5 s → relais par le Duel.
//  3. Pair-à-pair : le camp 0 est le PAIR HORLOGE (cadenceur du moteur) ; l'autre
//     ne lui envoie que ses ordres (et un signe de vie toutes les 2 s). Hachages
//     comparés entre les pairs ; écart → instantané du pair horloge.
//  4. Pair-à-pair coupé en pleine partie → secours : le Duel devient l'horloge à
//     partir de l'instantané d'un appareil. Plus rien du tout → le jeu continue
//     seul contre le robot (« coupe »).
//
// Journal des connexions (console, préfixe « [temps réel] ») et compteurs du jour
// au Worker (Budget : pair-à-pair réussi, relayé, secours, échec, refus).
// Rien de personnel n'est envoyé : l'identifiant du jeu, l'empreinte de sa
// simulation et les ordres joués. En pair-à-pair, chaque appareil voit
// l'adresse IP publique de l'autre (WebRTC ; politique de confidentialité).
//
// Essais en local seulement (localhost) : ?multi=ws://localhost:<port> vise un
// serveur de test, &p2p=non force l'échec du pair-à-pair.
// ==========================================================================

import './moteur.js';
import { ADRESSE_MULTI, SITES_MULTI } from '../multijoueur/config.js';

const TR = globalThis.JEL_TR;
const ID_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RE_SIM = /<script\b[^>]*\bid=["']jel-sim["'][^>]*>([\s\S]*?)<\/script>/i;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];
const DELAI_P2P_MS = 5000;          // DataChannel pas ouvert : relais
const VIE_MS = 2000;                // signe de vie du pair non horloge
const SILENCE_HORLOGE_MS = 3000;    // plus aucun paquet du pair horloge : secours
const ABSENCE_MS = 10000;           // pair silencieux : son camp passe au robot (pair horloge)
const SECOURS_MAX_MS = 6000;        // le Duel n'a pas repris la partie : on continue seul
const PING_MS = 25000;
const RECENTS_MAX = 600;            // paquets gardés par le pair horloge (60 s), pour la reprise du pair
const MESSAGE_MAX = 1000;
const RECU_MAX = 200000;
const NIVEAU_RELAIS = 2;            // robot moyen à la place d'un pair absent

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
      phase: 'recherche',             // recherche | duel | jeu | secours | fini
      wsR: null, wsD: null, pc: null, dc: null, dcOuvert: false,
      camp: 0, duel: null, jeton: null, graine: 0, config: null,
      mode: null, cad: null, minuteurCad: 0, t0: 0, kDebut: 0,
      jeuPret: false, pairPret: false, demarre: false,
      dernierK: 0, recents: [], hashesMoi: new Map(), hashesPair: new Map(),
      dernierPair: 0, robotPair: false, attenteSnapPair: false,
      minuteurs: [], icesEnAttente: [], reconnexions: 0,
    };
  }

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
    for (const ws of [q.wsR, q.wsD]) {
      if (!ws) continue;
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try { ws.close(1000, 'fin'); } catch { /* fermée */ }
    }
    try { q.dc?.close(); } catch { /* fermé */ }
    try { q.pc?.close(); } catch { /* fermée */ }
  }

  // Plus de partie en ligne : avant la partie → robot ; pendant → le jeu continue seul.
  function abandonner(raison) {
    const enJeu = p && (p.phase === 'jeu' || p.phase === 'secours');
    journal('abandon', raison, enJeu ? '(la partie continue contre le robot)' : '');
    fermer();
    versJeu({ etat: enJeu ? 'coupe' : 'solo', raison });
  }

  const envoyerD = (m) => {
    const ws = p?.wsD;
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(m)); return true; } catch { return false; }
  };
  const envoyerPair = (m) => {
    const dc = p?.dc;
    if (!dc || dc.readyState !== 'open') return false;
    try { dc.send(JSON.stringify(m)); return true; } catch { return false; }
  };

  // --- 1. Recherche ---------------------------------------------------------

  async function chercher() {
    fermer();
    const adresse = adresseServeur();
    if (!adresse || window.top !== window || window.opener) return versJeu({ etat: 'solo', raison: 'site' });
    if (navigator.onLine === false) return versJeu({ etat: 'solo', raison: 'hors-ligne' });
    if (!jeu.temps_reel || !ID_VALIDE.test(jeu.id)) return versJeu({ etat: 'solo', raison: 'jeu' });
    const sim = await empreinte(texteSim(html));
    if (!sim) return versJeu({ etat: 'solo', raison: 'jeu' });
    p = nouvelle();
    const q = p;
    let ws;
    try { ws = new WebSocket(`${adresse}/tr/ws?jeu=${encodeURIComponent(jeu.id)}&sim=${sim}&proto=${TR.PROTOCOLE}`); }
    catch { abandonner('reseau'); return; }
    q.wsR = ws;
    q.adresse = adresse;
    ws.onmessage = (e) => {
      if (p !== q || typeof e.data !== 'string' || e.data === 'pong' || e.data.length > RECU_MAX) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'attente') versJeu({ etat: 'attente', n: Number.isInteger(m.n) ? m.n : 0 });
      else if (m.t === 'trouve' && typeof m.duel === 'string' && RE_UUID.test(String(m.jeton))) {
        Object.assign(q, { camp: m.camp === 1 ? 1 : 0, duel: m.duel, jeton: m.jeton, graine: m.graine >>> 0, config: m.config || {} });
        ws.onclose = ws.onerror = null;
        try { ws.close(1000, 'trouve'); } catch { /* fermée */ }
        q.wsR = null;
        journal('adversaire trouvé', `camp ${q.camp}`);
        ouvrirDuel();
      } else if (m.t === 'refus') abandonner(m.raison || 'refus');
    };
    ws.onclose = ws.onerror = () => { if (p === q && q.phase === 'recherche') abandonner('reseau'); };
  }

  // --- 2. Duel : signalisation, choix du mode -------------------------------

  function ouvrirDuel(reprise = false) {
    const q = p;
    if (!q) return;
    let ws;
    try { ws = new WebSocket(`${q.adresse}/tr/duel?nom=${encodeURIComponent(q.duel)}&jeton=${q.jeton}`); }
    catch { if (!reprise) abandonner('reseau'); return; }
    q.wsD = ws;
    if (!reprise) q.phase = 'duel';
    ws.onopen = () => {
      if (p !== q) return;
      q.reconnexions = 0;
      if (!q.ping) q.ping = minuterie(() => { try { q.wsD?.send('ping'); } catch { /* fermée */ } }, PING_MS, true);
      if (reprise) {
        // Retour après une coupure du relais : instantané et ordres manqués.
        if (q.mode === 'relais') envoyerD({ t: 'reprise', depuis: q.dernierK });
        return;
      }
      versJeu({ etat: 'trouve', camp: q.camp, graine: q.graine, config: q.config });
      if (p2pPermis() && typeof RTCPeerConnection === 'function') demarrerP2P();
      else { journal('pair-à-pair non tenté'); envoyerD({ t: 'relais' }); }
    };
    ws.onmessage = (e) => {
      if (p !== q || typeof e.data !== 'string' || e.data === 'pong' || e.data.length > RECU_MAX) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      surDuel(m);
    };
    ws.onclose = ws.onerror = () => {
      if (p !== q || q.wsD !== ws) return;
      q.wsD = null;
      if (q.mode === 'p2p' && q.dcOuvert) { reconnecterDuel(); return; }       // le pair-à-pair continue
      if (q.mode === 'relais' && q.demarre && q.reconnexions < 4) { reconnecterDuel(); return; }
      abandonner('reseau');
    };
  }

  function reconnecterDuel() {
    const q = p;
    q.reconnexions += 1;
    const attente = Math.min(8000, 1000 * 2 ** (q.reconnexions - 1));
    minuterie(() => { if (p === q && !q.wsD) ouvrirDuel(true); }, attente);
  }

  function surDuel(m) {
    const q = p;
    switch (m.t) {
      case 'sdp': surSdp(m.d); return;
      case 'ice':
        if (!q.pc || !m.d) return;
        if (q.pc.remoteDescription) q.pc.addIceCandidate(m.d).catch(() => {});
        else q.icesEnAttente.push(m.d);
        return;
      case 'mode':
        if (m.mode === 'p2p') {
          if (q.mode === 'p2p') return;
          q.mode = 'p2p';
          journal('mode pair-à-pair');
        } else if (m.mode === 'relais') {
          q.mode = 'relais';
          journal(m.secours ? 'secours : partie reprise par le serveur' : 'mode relayé (pair-à-pair non établi)');
          if (!m.secours) { try { q.dc?.close(); } catch { /* */ } try { q.pc?.close(); } catch { /* */ } q.dc = null; q.pc = null; q.dcOuvert = false; }
        }
        versJeu({ etat: 'mode', mode: q.mode });
        if (q.phase === 'duel') q.phase = 'jeu';
        signalerPret();
        return;
      case 'refus':
        journal('refus du serveur', m.raison);
        if (q.phase === 'secours' || q.demarre) abandonner(m.raison || 'refus');
        else { fermer(); versJeu({ etat: 'solo', raison: m.raison || 'refus' }); }
        return;
      case 'k':
        if (q.mode === 'relais') { q.demarre = true; recevoirPaquet(m); }
        return;
      case 'snap':
        if (m.snap && Number.isInteger(m.snap.k)) {
          q.dernierK = m.snap.k;
          if (q.phase === 'secours') { q.phase = 'jeu'; q.demarre = true; }
          versJeu({ snap: m.snap });
        }
        return;
      case 'demande-snap':
        q.attenteSnapDuel = true;
        versJeu({ demande: 'snap' });
        return;
      default:
        return;
    }
  }

  // --- WebRTC -----------------------------------------------------------------

  async function demarrerP2P() {
    const q = p;
    let pc;
    try { pc = new RTCPeerConnection({ iceServers: ICE }); } catch { envoyerD({ t: 'relais' }); return; }
    q.pc = pc;
    q.debutP2P = performance.now();
    pc.onicecandidate = (e) => { if (e.candidate && p === q) envoyerD({ t: 'ice', d: e.candidate.toJSON() }); };
    minuterie(() => {
      if (p !== q || q.dcOuvert || q.mode) return;
      journal('pair-à-pair non établi en 5 s : relais demandé');
      envoyerD({ t: 'relais' });
    }, DELAI_P2P_MS);
    if (q.camp === 0) {
      brancherDC(pc.createDataChannel('fmg', { ordered: true }));
      try {
        await pc.setLocalDescription(await pc.createOffer());
        envoyerD({ t: 'sdp', d: pc.localDescription.toJSON() });
      } catch { envoyerD({ t: 'relais' }); }
    } else {
      pc.ondatachannel = (e) => brancherDC(e.channel);
    }
  }

  async function surSdp(desc) {
    const q = p;
    if (!q?.pc || !desc) return;
    try {
      await q.pc.setRemoteDescription(desc);
      for (const c of q.icesEnAttente.splice(0)) q.pc.addIceCandidate(c).catch(() => {});
      if (desc.type === 'offer') {
        await q.pc.setLocalDescription(await q.pc.createAnswer());
        envoyerD({ t: 'sdp', d: q.pc.localDescription.toJSON() });
      }
    } catch { envoyerD({ t: 'relais' }); }
  }

  function brancherDC(dc) {
    const q = p;
    q.dc = dc;
    dc.onopen = () => {
      if (p !== q) return;
      q.dcOuvert = true;
      q.dernierPair = performance.now();
      journal(`DataChannel ouvert en ${Math.round(performance.now() - q.debutP2P)} ms`);
      envoyerD({ t: 'p2p' });
      signalerPret();
    };
    dc.onmessage = (e) => {
      if (p !== q || typeof e.data !== 'string' || e.data.length > RECU_MAX) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      surPair(m);
    };
    dc.onclose = () => { if (p === q && q.dcOuvert) { q.dcOuvert = false; surPerteP2P('fermé'); } };
  }

  // --- 3. Partie --------------------------------------------------------------

  // Prêt à jouer : relais → au Duel ; pair-à-pair → au pair horloge (ou départ de l'horloge).
  function signalerPret() {
    const q = p;
    if (!q || !q.jeuPret || !q.mode || q.phase === 'secours') return;
    if (q.mode === 'relais') { if (!q.pretEnvoye) { q.pretEnvoye = envoyerD({ t: 'pret' }); } return; }
    if (q.mode === 'p2p' && q.dcOuvert) {
      if (q.camp === 1) {
        if (!q.pretEnvoye) q.pretEnvoye = envoyerPair({ t: 'pret' });
        if (!q.vie) q.vie = minuterie(() => envoyerPair({ t: 'vie' }), VIE_MS, true);
        if (!q.guet) q.guet = minuterie(guetterHorloge, 500, true);
        q.dernierPair = performance.now();
      } else if (q.pairPret) demarrerHorloge(0);
    }
  }

  // Pair horloge : cadenceur du moteur, un paquet par tick vers le jeu et vers le pair.
  function demarrerHorloge(depart) {
    const q = p;
    if (q.demarre) return;
    q.demarre = true;
    q.cad = new TR.Cadenceur({
      camps: 2, delai: TR.REGLAGES.delaiEntree, depart,
      envoyer: (paquet) => {
        q.recents.push(paquet);
        if (q.recents.length > RECENTS_MAX) q.recents.shift();
        q.dernierK = paquet.k;
        envoyerPair(paquet);
        versJeu({ paquet });
      },
    });
    q.t0 = performance.now();
    q.kDebut = depart;
    q.dernierPair = performance.now();
    journal('horloge démarrée (pair horloge)');
    q.minuteurCad = setInterval(battre, 25);
  }

  function battre() {
    const q = p;
    if (!q?.cad) return;
    const tick = TR.REGLAGES.tickMs, maintenant = performance.now();
    let dus = q.kDebut + Math.floor((maintenant - q.t0) / tick) - q.cad.k;
    // Onglet en arrière-plan (minuteries ralenties) : on rattrape les ticks dus ; au-delà de 60 s
    // (appareil endormi), l'horloge repart d'ici plutôt que d'envoyer une avalanche de paquets.
    if (dus > 600) { q.t0 = maintenant - (q.cad.k - q.kDebut) * tick; dus = 1; }
    while (dus-- > 0) q.cad.pas();
    if (!q.robotPair && maintenant - q.dernierPair > ABSENCE_MS) {
      journal('pair silencieux : son camp passe au robot');
      q.cad.controle(1, NIVEAU_RELAIS);
      q.robotPair = true;
    }
  }

  // Pair non horloge : plus de paquets → secours.
  function guetterHorloge() {
    const q = p;
    if (q && q.mode === 'p2p' && q.phase === 'jeu' && q.demarre && performance.now() - q.dernierPair > SILENCE_HORLOGE_MS) surPerteP2P('silence');
  }

  function surPair(m) {
    const q = p;
    q.dernierPair = performance.now();
    if (q.camp === 0) {
      if (q.robotPair && q.cad && m.t !== 'pret') { q.cad.controle(1, 0); q.robotPair = false; journal('pair revenu : il reprend la main'); }
      if (m.t === 'pret') { q.pairPret = true; signalerPret(); }
      else if (m.t === 'o' && q.cad && Array.isArray(m.o)) q.cad.recevoir(1, m.seq, m.o);
      else if (m.t === 'h' && Number.isInteger(m.k)) { q.hashesPair.set(m.k, m.h); comparer(m.k); }
      else if (m.t === 'reprise') envoyerSnapAuPair();
    } else {
      if (m.t === 'k') { q.demarre = true; recevoirPaquet(m); }
      else if (m.t === 'snap' && m.snap) { q.dernierK = m.snap.k; versJeu({ snap: m.snap }); }
      else if (m.t === 'journal' && Array.isArray(m.paquets)) for (const x of m.paquets) recevoirPaquet(x);
    }
  }

  function recevoirPaquet(paquet) {
    if (!paquet || !Number.isInteger(paquet.k) || !Array.isArray(paquet.o)) return;
    if (paquet.k > p.dernierK) p.dernierK = paquet.k;
    versJeu({ paquet: { t: 'k', k: paquet.k, o: paquet.o } });
  }

  function comparer(k) {
    const q = p;
    const a = q.hashesMoi.get(k), b = q.hashesPair.get(k);
    if (!a || !b) return;
    q.hashesMoi.delete(k); q.hashesPair.delete(k);
    if (a !== b) {
      console.warn('[temps réel] désynchronisation', JSON.stringify({ k, horloge: a, pair: b, ordres: q.recents.slice(-50) }));
      envoyerSnapAuPair();
    }
  }

  function envoyerSnapAuPair() {
    p.attenteSnapPair = true;
    versJeu({ demande: 'snap' });
  }

  // Instantané donné par le jeu (réponse à une demande).
  function snapDuJeu(snap) {
    const q = p;
    if (!q || !snap || !Number.isInteger(snap.k)) return;
    if (q.attenteSnapDuel) {
      q.attenteSnapDuel = false;
      try { q.wsD?.send(JSON.stringify({ t: 'snap', snap })); } catch { /* fermée */ }
    }
    if (q.attenteSnapPair) {
      q.attenteSnapPair = false;
      envoyerPair({ t: 'snap', snap });
      envoyerPair({ t: 'journal', paquets: q.recents.filter((x) => x.k > snap.k) });
    }
  }

  // --- 4. Pair-à-pair coupé : secours par le Duel -----------------------------

  function surPerteP2P(raison) {
    const q = p;
    if (!q || q.mode !== 'p2p' || q.phase === 'secours' || q.fini) return;
    journal(`pair-à-pair perdu (${raison}) : secours demandé au serveur`);
    q.phase = 'secours';
    clearInterval(q.minuteurCad);
    q.cad = null;
    try { q.dc?.close(); } catch { /* fermé */ }
    if (!envoyerD({ t: 'secours', k: q.dernierK })) { abandonner('reseau'); return; }
    minuterie(() => { if (p === q && q.phase === 'secours') abandonner('secours'); }, SECOURS_MAX_MS);
  }

  return {
    recevoir(d) {
      switch (d.op) {
        case 'chercher': chercher(); return;
        case 'attente': compter(); return;
        case 'quitter': {
          // Partie finie : on laisse 3 s au pair pour recevoir les derniers paquets avant de fermer.
          const q = p;
          if (q?.fini) { q.cad = null; clearInterval(q.minuteurCad); setTimeout(() => { if (p === q) fermer(); }, 3000); return; }
          if (q?.mode === 'p2p' && q.demarre) envoyerD({ t: 'fin' });
          fermer();
          return;
        }
        case 'pret':
          if (p) { p.jeuPret = true; signalerPret(); }
          return;
        case 'ordre': {
          const q = p;
          if (!q || !Number.isInteger(d.seq) || !TR.ordreBienForme(d.o)) return;
          if (q.mode === 'p2p' && q.camp === 0 && q.cad) q.cad.recevoir(0, d.seq, d.o);
          else if (q.mode === 'p2p' && q.camp === 1) envoyerPair({ t: 'o', seq: d.seq, o: d.o });
          else if (q.mode === 'relais' && JSON.stringify(d.o).length < MESSAGE_MAX) envoyerD({ t: 'o', seq: d.seq, o: d.o });
          return;
        }
        case 'hash': {
          const q = p;
          if (!q || !Number.isInteger(d.k) || typeof d.h !== 'string') return;
          if (q.mode === 'p2p' && q.camp === 0) { q.hashesMoi.set(d.k, d.h); comparer(d.k); }
          else if (q.mode === 'p2p') envoyerPair({ t: 'h', k: d.k, h: d.h });
          else if (q.mode === 'relais') envoyerD({ t: 'h', k: d.k, h: d.h });
          return;
        }
        case 'snap': snapDuJeu(d.snap); return;
        case 'reprise':
          if (p?.mode === 'relais') envoyerD({ t: 'reprise', depuis: d.depuis });
          else if (p?.mode === 'p2p' && p.camp === 1) envoyerPair({ t: 'reprise', depuis: d.depuis });
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
      const r = await fetch(`${adresse.replace(/^ws/, 'http')}/tr/attente?jeu=${encodeURIComponent(jeu.id)}`, {
        signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
      });
      const x = r.ok ? await r.json() : null;
      versJeu({ etat: 'attente', n: Number.isInteger(x?.enRecherche) ? x.enRecherche : 0 });
    } catch {
      versJeu({ etat: 'attente', n: 0 });
    }
  }
}
