// ==========================================================================
// Comptoir de province (« Cités voisines » de Marmoria, docs/cadrage-marmoria.md,
// sections 16.7 et 23.15) : un Durable Object « Province » par province, nommé
// d'après son code de 6 caractères. De 2 à 4 joueurs y ont chacun une cité ;
// chacun joue sur son appareil, à sa vitesse ; le comptoir est la seule autorité
// sur les échanges entre eux. Aucune ville n'est simulée ici.
//
//   POST /province   corps : texte JSON (pas de pré-vol CORS), depuis le lanceur
//                    du site (public/province/lanceur.js), sites permis seulement.
//     { a: 'creer', jeu, carte, siege, ticket? }          → { code, siege, jeton, vue }
//     { a: 'rejoindre', code, siege?, ticket? }           → { siege, jeton, vue } | { erreur }
//     { a: 'lire', code }                                 → { etat, carte, libres, sieges }
//     { a: 'sync', code, siege, jeton, ops, accuse, infos?, signal?, ticket? }
//                                                         → { recu, sortie, vue }
//
// Opérations d'un joueur (ops), numérotées 1, 2, 3… par siège, appliquées une
// seule fois et dans l'ordre (un numéro déjà vu est ignoré : message en double ;
// un trou arrête la lecture : le joueur renverra la suite) :
//   { n, t: 'depot', g, q, p }        q charges du bien g posées à son étal, au prix p
//   { n, t: 'demande', d, b: {g: q} } caravane demandée à l'étal du voisin d (8 charges au plus)
//   { n, t: 'reprise', g }            reprend tout son étal du bien g
// Réponses du comptoir à un joueur (sortie), numérotées 1, 2, 3… par siège, gardées
// jusqu'à ce que le joueur en accuse réception (accuse = dernier numéro gardé
// dans sa ville enregistrée) :
//   { m, t: 'livraison', ref, d, l: [[g, q, p]…] }   ce que la caravane du voisin d apporte (payé à l'arrivée)
//   { m, t: 'paiement', de, l: [[g, q, p]…], s }      vente faite au voisin « de » : s deniers à recevoir
//   { m, t: 'reprise', l: [[g, q, p]…], raison? }     charges rendues (reprise, ou étal plein)
// Conservation : chaque charge posée est à l'étal, livrée ou rendue ; chaque
// livraison a son paiement du même montant (tests : scripts/tester-province.mjs).
//
// Stockage : une seule clé (« p »), écrite au plus une fois par requête et
// seulement si quelque chose a changé (visite comprise, au plus toutes les
// 15 minutes). Province sans aucune visite pendant 30 jours : effacée (alarme).
// Le jeton d'un siège n'est gardé que sous forme d'empreinte SHA-256.
// ==========================================================================

import { verifierTicket } from './ticket.js';

export const PROVINCE = {
  SIEGES: 4,
  CARTES: { marmoria: ['campanie', 'hispanie'] }, // provinces dessinées, par jeu
  CODE: /^[A-HJ-NP-Z2-9]{6}$/,                    // sans I, O, 0, 1 (confusions)
  ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  CARAVANE_MAX: 8,                                // charges par caravane
  ETAL_MAX: 400,                                  // charges à l'étal d'un siège, tous biens
  PRIX_MAX: 5000,                                 // deniers par charge
  OPS_MAX: 60,                                    // opérations lues par requête
  SORTIE_MAX: 500,                                // réponses gardées par siège
  EFFACEMENT_MS: 30 * 86400000,                   // sans visite : province effacée
  ABSENT_MS: 7 * 86400000,                        // voisin absent : une cité de l'ordinateur le remplace
  VISITE_ECRITURE_MS: 15 * 60000,                 // visite seule : écrite au plus toutes les 15 min
  SIGNAUX: ['cherche', 'vend', 'merci', 'aide', 'route'],
  SIGNAUX_GARDES: 3,
  EVENEMENTS_GARDES: 20,
  CORPS_MAX: 32000,
};

const RE_BIEN = /^[a-z_]{2,24}$/;
const RE_JEU = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RE_JETON = /^[0-9a-f]{32}$/;

function json(donnees, status = 200, entetes = {}) {
  return new Response(JSON.stringify(donnees), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...entetes } });
}
function entier(x, min, max) { return Number.isSafeInteger(x) && x >= min && x <= max; }
function hex(octets) { return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join(''); }
async function empreinte(texte) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))); }
function nouveauJeton() { return hex(crypto.getRandomValues(new Uint8Array(16))); }
function nouveauCode() {
  const o = crypto.getRandomValues(new Uint8Array(6));
  let c = '';
  for (const x of o) c += PROVINCE.ALPHABET[x % PROVINCE.ALPHABET.length];
  return c;
}

/**
 * Adresse /province du Worker. Renvoie une réponse, ou null si le chemin n'est pas le sien.
 * origines : sites permis (en-tête Origin).
 */
export async function routeProvince(request, env, chemin, origines) {
  if (chemin !== '/province') return null;
  const origine = request.headers.get('Origin') || '';
  const cors = origines.includes(origine) ? { 'Access-Control-Allow-Origin': origine, Vary: 'Origin' } : {};
  if (request.method !== 'POST') return json({ erreur: 'methode' }, 405, cors);
  if (!origines.includes(origine)) return json({ erreur: 'site' }, 403);
  if (!env.PROVINCE) return json({ erreur: 'indisponible' }, 503, cors);
  let texte = '';
  try { texte = await request.text(); } catch { return json({ erreur: 'invalide' }, 400, cors); }
  if (texte.length > PROVINCE.CORPS_MAX) return json({ erreur: 'trop-long' }, 413, cors);
  let corps;
  try { corps = JSON.parse(texte); } catch { return json({ erreur: 'invalide' }, 400, cors); }
  if (!corps || typeof corps !== 'object') return json({ erreur: 'invalide' }, 400, cors);

  const appeler = async (code, action) => {
    const objet = env.PROVINCE.get(env.PROVINCE.idFromName(`province:${code}`));
    const r = await objet.fetch(new Request(`https://province/${action}`, { method: 'POST', body: JSON.stringify({ ...corps, code }) }));
    return { status: r.status, donnees: await r.json() };
  };
  try {
    if (corps.a === 'creer') {
      // Code tiré au hasard ; s'il existe déjà, un autre (5 essais).
      for (let essai = 0; essai < 5; essai++) {
        const r = await appeler(nouveauCode(), 'creer');
        if (r.status !== 409) return json(r.donnees, r.status, cors);
      }
      return json({ erreur: 'indisponible' }, 503, cors);
    }
    if (!['rejoindre', 'lire', 'sync'].includes(corps.a)) return json({ erreur: 'action' }, 400, cors);
    const code = String(corps.code || '').toUpperCase();
    if (!PROVINCE.CODE.test(code)) return json({ erreur: 'introuvable' }, 404, cors);
    const r = await appeler(code, corps.a);
    return json(r.donnees, r.status, cors);
  } catch {
    return json({ erreur: 'indisponible' }, 503, cors);
  }
}

export class Province {
  constructor(state, env) {
    this.state = state;
    this.env = env || {};
    this.p = undefined; // état chargé (null : province inexistante ou effacée)
  }

  async charger() {
    if (this.p === undefined) this.p = (await this.state.storage.get('p')) || null;
    return this.p;
  }

  // Écrit l'état ; programme l'effacement 30 jours après la dernière visite.
  async enregistrer() {
    const p = this.p;
    const derniere = Math.max(p.cree, ...p.sieges.filter(Boolean).map((s) => s.visite));
    const voulue = derniere + PROVINCE.EFFACEMENT_MS;
    // Alarme reprogrammée au plus une fois par jour (une écriture de plus).
    const alarme = !(p.alarme >= voulue - 86400000);
    if (alarme) p.alarme = voulue;
    await this.state.storage.put('p', p);
    if (alarme) await this.state.storage.setAlarm(voulue);
  }

  async alarm() {
    const p = await this.charger();
    if (!p) return;
    const derniere = Math.max(p.cree, ...p.sieges.filter(Boolean).map((s) => s.visite));
    if (Date.now() - derniere >= PROVINCE.EFFACEMENT_MS - 60000) {
      await this.state.storage.deleteAll();
      this.p = null;
      return;
    }
    p.alarme = derniere + PROVINCE.EFFACEMENT_MS;
    await this.state.storage.put('p', p);
    await this.state.storage.setAlarm(p.alarme);
  }

  async fetch(request) {
    const action = new URL(request.url).pathname.slice(1);
    let corps;
    try { corps = await request.json(); } catch { return json({ erreur: 'invalide' }, 400); }
    const maintenant = Date.now();
    await this.charger();
    if (action === 'creer') return this.creer(corps, maintenant);
    if (!this.p) return json({ erreur: 'introuvable' }, 404);
    if (action === 'lire') return json(this.lecturePublique(maintenant));
    if (action === 'rejoindre') return this.rejoindre(corps, maintenant);
    if (action === 'sync') return this.sync(corps, maintenant);
    return json({ erreur: 'action' }, 400);
  }

  // --- Création et arrivée ---------------------------------------------------
  async creer(corps, maintenant) {
    if (this.p) return json({ erreur: 'existe' }, 409);
    const jeu = String(corps.jeu || '');
    const cartes = RE_JEU.test(jeu) ? PROVINCE.CARTES[jeu] : null;
    if (!cartes || !cartes.includes(corps.carte)) return json({ erreur: 'carte' }, 400);
    const siege = entier(corps.siege, 0, PROVINCE.SIEGES - 1) ? corps.siege : 0;
    this.p = { v: 1, code: corps.code, jeu, carte: corps.carte, cree: maintenant, sieges: new Array(PROVINCE.SIEGES).fill(null), evenements: [], gagnee: null, alarme: 0 };
    const jeton = nouveauJeton();
    this.p.sieges[siege] = await this.nouveauSiege(jeton, corps.ticket, maintenant);
    await this.enregistrer();
    return json({ code: this.p.code, siege, jeton, vue: this.vue(siege, maintenant) });
  }

  async rejoindre(corps, maintenant) {
    const p = this.p, libres = [];
    p.sieges.forEach((s, k) => { if (!s) libres.push(k); });
    if (!libres.length) return json({ erreur: 'pleine' }, 409);
    const siege = entier(corps.siege, 0, PROVINCE.SIEGES - 1) && !p.sieges[corps.siege] ? corps.siege : libres[0];
    const jeton = nouveauJeton();
    p.sieges[siege] = await this.nouveauSiege(jeton, corps.ticket, maintenant);
    // Les voisins le verront à leur prochaine connexion (section 16.7).
    p.evenements.push({ t: maintenant, type: 'arrivee', siege });
    p.evenements = p.evenements.slice(-PROVINCE.EVENEMENTS_GARDES);
    await this.enregistrer();
    return json({ siege, jeton, vue: this.vue(siege, maintenant) });
  }

  async nouveauSiege(jeton, ticket, maintenant) {
    const s = { h: await empreinte(jeton), pseudo: null, numero: null, rejoint: maintenant, visite: maintenant, recu: 0, m: 0, sortie: [], etal: {}, infos: {}, signaux: [] };
    await this.lirePseudo(s, ticket);
    return s;
  }

  // Pseudo du profil, d'après le ticket signé par le site (filtré par lui) ; sinon inchangé.
  async lirePseudo(s, ticket) {
    if (!ticket || !this.env.MULTI_SECRET) return false;
    const t = await verifierTicket(this.env.MULTI_SECRET, ticket, this.p ? this.p.jeu : 'marmoria');
    if (!t) return false;
    const avant = `${s.pseudo}|${s.numero}`;
    s.pseudo = t.pseudo; s.numero = t.numero;
    return avant !== `${s.pseudo}|${s.numero}`;
  }

  // --- Synchronisation d'un siège --------------------------------------------
  async sync(corps, maintenant) {
    const p = this.p, k = corps.siege;
    if (!entier(k, 0, PROVINCE.SIEGES - 1) || !p.sieges[k] || !RE_JETON.test(String(corps.jeton || ''))) return json({ erreur: 'refuse' }, 403);
    const s = p.sieges[k];
    if (await empreinte(corps.jeton) !== s.h) return json({ erreur: 'refuse' }, 403);
    let change = false;

    // Réponses déjà gardées par le joueur : oubliées.
    if (entier(corps.accuse, 0, Number.MAX_SAFE_INTEGER)) {
      const avant = s.sortie.length;
      s.sortie = s.sortie.filter((o) => o.m > corps.accuse);
      if (s.sortie.length !== avant) change = true;
    }
    // Opérations, dans l'ordre, une seule fois chacune.
    const ops = Array.isArray(corps.ops) ? corps.ops.slice(0, PROVINCE.OPS_MAX) : [];
    ops.sort((a, b) => (a && b ? a.n - b.n : 0));
    for (const op of ops) {
      if (!op || !Number.isSafeInteger(op.n)) break;
      if (op.n <= s.recu) continue;       // déjà appliquée (message en double)
      if (op.n !== s.recu + 1) break;     // trou : la suite viendra au prochain envoi
      this.appliquer(k, op);
      s.recu = op.n;
      change = true;
    }
    // Ce que les voisins voient de cette cité, et les signaux.
    if (corps.infos && typeof corps.infos === 'object') change = this.lireInfos(s, corps.infos) || change;
    if (corps.signal && typeof corps.signal === 'object') change = this.lireSignal(s, corps.signal, maintenant) || change;
    if (corps.ticket) change = (await this.lirePseudo(s, corps.ticket)) || change;
    if (maintenant - s.visite >= PROVINCE.VISITE_ECRITURE_MS) change = true;
    s.visite = maintenant;
    change = this.verifierVictoire(maintenant) || change;
    if (change) await this.enregistrer();
    return json({ recu: s.recu, sortie: s.sortie, vue: this.vue(k, maintenant) });
  }

  // Une opération valide modifie le comptoir ; une opération mal formée est
  // comptée comme lue (numéro consommé) sans rien changer.
  appliquer(k, op) {
    const p = this.p, s = p.sieges[k];
    const repondre = (siege, contenu) => {
      const c = p.sieges[siege];
      c.m += 1;
      c.sortie.push({ m: c.m, ...contenu });
      if (c.sortie.length > PROVINCE.SORTIE_MAX) c.sortie.splice(0, c.sortie.length - PROVINCE.SORTIE_MAX);
    };
    if (op.t === 'depot') {
      if (!RE_BIEN.test(String(op.g)) || !entier(op.q, 1, PROVINCE.CARAVANE_MAX) || !entier(op.p, 1, PROVINCE.PRIX_MAX)) return;
      const total = Object.values(s.etal).reduce((n, lots) => n + lots.reduce((a, l) => a + l[0], 0), 0);
      if (total + op.q > PROVINCE.ETAL_MAX) {   // étal plein : les charges reviennent
        repondre(k, { t: 'reprise', l: [[op.g, op.q, op.p]], raison: 'plein' });
        return;
      }
      const lots = s.etal[op.g] || (s.etal[op.g] = []);
      const der = lots[lots.length - 1];
      if (der && der[1] === op.p) der[0] += op.q; else lots.push([op.q, op.p]);
      return;
    }
    if (op.t === 'demande') {
      if (!entier(op.d, 0, PROVINCE.SIEGES - 1) || op.d === k || !op.b || typeof op.b !== 'object') { repondre(k, { t: 'livraison', ref: op.n, d: op.d, l: [] }); return; }
      const vendeur = p.sieges[op.d], l = [];
      let reste = PROVINCE.CARAVANE_MAX;
      for (const g of Object.keys(op.b).sort()) {
        if (!RE_BIEN.test(g) || !vendeur) continue;
        let voulu = Number.isSafeInteger(op.b[g]) && op.b[g] > 0 ? Math.min(reste, op.b[g]) : 0;
        const lots = vendeur.etal[g] || [];
        while (voulu > 0 && lots.length) {
          const pris = Math.min(voulu, lots[0][0]);
          l.push([g, pris, lots[0][1]]);
          lots[0][0] -= pris; voulu -= pris; reste -= pris;
          if (lots[0][0] === 0) lots.shift();
        }
        if (!lots.length) delete vendeur.etal[g];
      }
      repondre(k, { t: 'livraison', ref: op.n, d: op.d, l });
      if (l.length) repondre(op.d, { t: 'paiement', de: k, l, s: l.reduce((a, x) => a + x[1] * x[2], 0) });
      return;
    }
    if (op.t === 'reprise') {
      if (!RE_BIEN.test(String(op.g)) || !s.etal[op.g]) return;
      const l = s.etal[op.g].map((x) => [op.g, x[0], x[1]]);
      delete s.etal[op.g];
      repondre(k, { t: 'reprise', l });
    }
  }

  lireInfos(s, infos) {
    const propre = {};
    if (entier(infos.pop, 0, 1e7)) propre.pop = infos.pop;
    if (infos.cotes && typeof infos.cotes === 'object') {
      propre.cotes = {};
      for (const c of ['culture', 'prosperite', 'paix', 'faveur']) if (entier(infos.cotes[c], 0, 100)) propre.cotes[c] = infos.cotes[c];
    }
    if (typeof infos.objectif === 'boolean') propre.objectif = infos.objectif;
    if (entier(infos.ventes, 0, 1e9)) propre.ventes = infos.ventes;
    if (entier(infos.mois, 0, 1e6)) propre.mois = infos.mois;
    const avant = JSON.stringify(s.infos);
    s.infos = propre;
    return JSON.stringify(propre) !== avant;
  }

  // Liste fixe de signaux (« Je cherche du vin », « J'ai du marbre à vendre »…) : aucun texte libre.
  lireSignal(s, signal, maintenant) {
    if (!PROVINCE.SIGNAUX.includes(signal.s)) return false;
    const b = signal.b === undefined || signal.b === null ? null : String(signal.b);
    if (b !== null && !RE_BIEN.test(b)) return false;
    s.signaux = s.signaux.filter((x) => !(x.s === signal.s && x.b === b));
    s.signaux.push({ s: signal.s, b, t: maintenant });
    s.signaux = s.signaux.slice(-PROVINCE.SIGNAUX_GARDES);
    return true;
  }

  // Objectif commun : la province gagne quand chaque cité active a atteint ses seuils.
  verifierVictoire(maintenant) {
    const p = this.p;
    if (p.gagnee) return false;
    const actifs = p.sieges.filter((s) => s && maintenant - s.visite < PROVINCE.ABSENT_MS);
    if (actifs.length && actifs.every((s) => s.infos.objectif === true)) { p.gagnee = maintenant; return true; }
    return false;
  }

  // --- Vues --------------------------------------------------------------------
  // Ce qu'un joueur voit de sa province : ses voisins (pseudo, avancement, étal, signaux).
  vue(moi, maintenant) {
    const p = this.p;
    return {
      code: p.code,
      carte: p.carte,
      gagnee: p.gagnee,
      maintenant,
      evenements: p.evenements,
      sieges: p.sieges.map((s, k) => {
        if (!s) return { siege: k, pris: false };
        const etal = {};
        for (const [g, lots] of Object.entries(s.etal)) etal[g] = lots.reduce((a, l) => a + l[0], 0);
        return {
          siege: k, pris: true, moi: k === moi, pseudo: s.pseudo, numero: s.numero,
          rejoint: s.rejoint, visite: s.visite, actif: maintenant - s.visite < PROVINCE.ABSENT_MS,
          infos: s.infos, signaux: s.signaux, etal,
        };
      }),
    };
  }

  // Lecture sans jeton (écran « Rejoindre », page Amis) : places libres seulement.
  lecturePublique(maintenant) {
    const p = this.p, libres = p.sieges.map((s, k) => (s ? -1 : k)).filter((k) => k >= 0);
    return {
      etat: libres.length ? 'ouverte' : 'pleine',
      carte: p.carte,
      libres,
      sieges: p.sieges.map((s) => (s ? { pseudo: s.pseudo, numero: s.numero, actif: maintenant - s.visite < PROVINCE.ABSENT_MS } : null)),
    };
  }
}
