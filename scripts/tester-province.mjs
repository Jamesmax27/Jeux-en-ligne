#!/usr/bin/env node
// ==========================================================================
// tester-province.mjs — tests du comptoir de province des « Cités voisines »
// de Marmoria (multijoueur/src/province.js ; docs/cadrage-marmoria.md,
// sections 16.7 et 23.15), sans réseau ni Cloudflare : le Durable Object
// tourne avec un faux stockage, et des appareils simulés jouent le protocole.
//
//   node scripts/tester-province.mjs            tests (≈ 5 s)
//   node scripts/tester-province.mjs --cout     ajoute l'estimation du coût sur le serveur
//
// Contrôles : création, arrivée, province pleine, jeton et site refusés ;
// 10 000 échanges entre 4 cités avec messages perdus à l'aller ou au retour,
// envois en double et rechargements d'une ville enregistrée plus tôt : aucune
// charge ni aucun denier créé ou perdu ; signaux de la liste fixe ; voisin
// absent ; objectif commun ; effacement après 30 jours sans visite.
// Code de sortie : 0 = tout est bon, 1 = au moins un échec.
// ==========================================================================

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { routeProvince, Province, PROVINCE } = await import(pathToFileURL(path.join(RACINE, 'multijoueur', 'src', 'province.js')).href);
const { signerTicket } = await import(pathToFileURL(path.join(RACINE, 'multijoueur', 'src', 'ticket.js')).href);
const args = process.argv.slice(2);

let echecs = 0, reussites = 0;
function ok(cond, msg) {
  if (cond) { reussites++; return true; }
  echecs++; console.log(`  ÉCHEC : ${msg}`);
  return false;
}
function section(t) { console.log(`\n— ${t}`); }

// --- Horloge et faux Durable Objects -------------------------------------------
let horloge = Date.UTC(2026, 10, 26, 12, 0, 0);
Date.now = () => horloge;
const ORIGINE = 'https://freemicrogames.com';

function fauxStockage(compte) {
  const donnees = new Map();
  return {
    alarme: null,
    get: async (k) => (donnees.has(k) ? structuredClone(donnees.get(k)) : undefined),
    put: async (k, v) => { compte.ecritures++; donnees.set(k, structuredClone(v)); },
    deleteAll: async () => { compte.ecritures++; donnees.clear(); },
    async setAlarm(t) { compte.ecritures++; this.alarme = t; },
    taille: () => donnees.size,
  };
}
function monter(envPlus = {}) {
  const compte = { requetes: 0, ecritures: 0 };
  const objets = new Map();
  const env = {
    MULTI_SECRET: 'secret-test',
    PROVINCE: {
      idFromName: (n) => n,
      get: (n) => ({
        fetch: async (req) => {
          compte.requetes++;
          if (!objets.has(n)) objets.set(n, new Province({ storage: fauxStockage(compte) }, env));
          return objets.get(n).fetch(req);
        },
      }),
    },
    ...envPlus,
  };
  const appel = async (corps, origine = ORIGINE) => {
    const r = await routeProvince(new Request('https://multi.freemicrogames.com/province', {
      method: 'POST', headers: { Origin: origine, 'Content-Type': 'text/plain' }, body: JSON.stringify(corps),
    }), env, '/province', [ORIGINE]);
    return { status: r.status, d: await r.json(), cors: r.headers.get('Access-Control-Allow-Origin') };
  };
  return { env, objets, compte, appel };
}

// Hasard reproductible.
function hasard(graine) {
  let s = graine >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// ==========================================================================
section('Création, arrivée, refus');
{
  const { appel, objets, env } = monter();
  const c = await appel({ a: 'creer', jeu: 'marmoria', carte: 'campanie', siege: 2 });
  ok(c.status === 200 && PROVINCE.CODE.test(c.d.code) && c.d.siege === 2 && /^[0-9a-f]{32}$/.test(c.d.jeton), 'création : code de 6 caractères, siège choisi, jeton');
  ok(c.cors === ORIGINE, 'réponse lisible par le site (CORS)');
  const code = c.d.code;
  ok((await appel({ a: 'creer', jeu: 'marmoria', carte: 'atlantide', siege: 0 })).status === 400, 'carte inconnue refusée');
  ok((await appel({ a: 'creer', jeu: 'autre-jeu', carte: 'campanie', siege: 0 })).status === 400, 'jeu sans province refusé');
  ok((await appel({ a: 'lire', code }, 'https://autre-site.example')).status === 403, 'autre site refusé');
  const l = await appel({ a: 'lire', code: code.toLowerCase() });
  ok(l.status === 200 && l.d.etat === 'ouverte' && l.d.libres.join() === '0,1,3', 'lecture publique : places libres (code en minuscules accepté)');
  ok((await appel({ a: 'lire', code: 'ZZZZZZ' })).status === 404, 'province inconnue');
  // Pseudo du profil par le ticket signé du site.
  const ticket = await signerTicket('secret-test', { profil: 42, jeu: 'marmoria', expiration: horloge + 60000, pseudo: 'Capitaine Comète' });
  const r1 = await appel({ a: 'rejoindre', code, siege: 2, ticket });
  ok(r1.status === 200 && r1.d.siege === 0, 'siège pris : le premier libre est donné');
  ok(r1.d.vue.sieges[0].pseudo === 'Capitaine Comète', 'pseudo du profil lu dans le ticket');
  ok(r1.d.vue.evenements.some((e) => e.type === 'arrivee' && e.siege === 0), 'arrivée annoncée aux voisins');
  await appel({ a: 'rejoindre', code });
  await appel({ a: 'rejoindre', code });
  const plein = await appel({ a: 'rejoindre', code });
  ok(plein.status === 409 && plein.d.erreur === 'pleine', 'cinquième joueur : province pleine');
  ok((await appel({ a: 'lire', code })).d.etat === 'pleine', 'lecture publique : pleine');
  const mauvais = await appel({ a: 'sync', code, siege: 2, jeton: '0'.repeat(32), ops: [], accuse: 0 });
  ok(mauvais.status === 403, 'mauvais jeton refusé');
  const etat = await objets.get(`province:${code}`).state.storage.get('p');
  ok(!JSON.stringify(etat).includes(c.d.jeton), 'jeton jamais gardé en clair');
  void env;
}

// ==========================================================================
// Appareils simulés : chacun a des entrepôts, un trésor, ses opérations à
// envoyer et la dernière réponse appliquée. Comme le jeu, il n'envoie que ce
// qui est dans sa ville enregistrée, et n'accuse que ce qu'elle contient.
class Appareil {
  constructor(siege, jeton, biens) {
    this.siege = siege; this.jeton = jeton;
    this.vive = { stock: Object.fromEntries(biens.map((g) => [g, 60])), tresor: 10000, n: 0, sortie: [], m: 0 };
    this.enregistree = structuredClone(this.vive);
  }
  produire(alea, biens, voisins) {
    const v = this.vive, x = alea();
    v.n += 1;
    if (x < 0.5) {                                       // dépôt d'une caravane
      const g = biens[Math.floor(alea() * biens.length)], q = 1 + Math.floor(alea() * 8);
      if (v.stock[g] < q) { v.n -= 1; return; }
      v.stock[g] -= q;
      v.sortie.push({ n: v.n, t: 'depot', g, q, p: 100 + biens.indexOf(g) * 20 });
    } else if (x < 0.95) {                               // caravane demandée à un voisin
      const d = voisins[Math.floor(alea() * voisins.length)], b = {};
      for (let k = 0; k < 2; k++) b[biens[Math.floor(alea() * biens.length)]] = 1 + Math.floor(alea() * 6);
      v.sortie.push({ n: v.n, t: 'demande', d, b });
    } else {                                              // reprise d'un étal
      v.sortie.push({ n: v.n, t: 'reprise', g: biens[Math.floor(alea() * biens.length)] });
    }
  }
  enregistrer() { this.enregistree = structuredClone(this.vive); }
  recharger() { this.vive = structuredClone(this.enregistree); }       // ville enregistrée relue (onglet fermé…)
  requete(code) { return { a: 'sync', code, siege: this.siege, jeton: this.jeton, ops: this.enregistree.sortie, accuse: this.enregistree.m }; }
  recevoir(r) {
    const v = this.vive;
    v.sortie = v.sortie.filter((o) => o.n > r.recu);
    for (const o of r.sortie) {
      if (o.m <= v.m) continue;
      v.m = o.m;
      if (o.t === 'livraison') for (const [g, q, p] of o.l) { v.stock[g] = (v.stock[g] || 0) + q; v.tresor -= q * p; }
      else if (o.t === 'paiement') v.tresor += o.s;
      else if (o.t === 'reprise') for (const [g, q] of o.l) v.stock[g] = (v.stock[g] || 0) + q;
    }
  }
}

section('10 000 échanges avec coupures, doublons et rechargements : rien n\'est créé ni perdu');
{
  const { appel, objets, compte } = monter();
  const biens = ['vin', 'huile', 'poterie', 'marbre', 'fer', 'poisson'];
  const c = await appel({ a: 'creer', jeu: 'marmoria', carte: 'hispanie', siege: 0 });
  const code = c.d.code;
  const apps = [new Appareil(0, c.d.jeton, biens)];
  for (let k = 1; k < 4; k++) { const r = await appel({ a: 'rejoindre', code }); apps.push(new Appareil(r.d.siege, r.d.jeton, biens)); }
  const total = () => {
    const t = { tresor: 0 };
    for (const g of biens) t[g] = 0;
    for (const a of apps) { t.tresor += a.vive.tresor; for (const g of biens) t[g] += a.vive.stock[g] || 0; }
    return t;
  };
  const depart = total();
  const alea = hasard(2026);
  let echanges = 0, perdusAller = 0, perdusRetour = 0, doublons = 0, recharges = 0, trous = 0;
  while (echanges < 10000) {
    const a = apps[Math.floor(alea() * apps.length)];
    const voisins = apps.map((x) => x.siege).filter((s) => s !== a.siege);
    const nb = 1 + Math.floor(alea() * 4);
    for (let k = 0; k < nb; k++) a.produire(alea, biens, voisins);
    echanges += nb;
    // Une fois sur dix, la ville n'est pas encore enregistrée : les nouvelles opérations attendent.
    if (alea() < 0.9) a.enregistrer();
    const x = alea();
    if (x < 0.08) { perdusAller++; }                                         // requête perdue en route
    else {
      const req = a.requete(code);
      // Une fois sur vingt, une opération est envoyée seule et hors d'ordre (trou).
      if (req.ops.length > 2 && alea() < 0.05) { req.ops = req.ops.slice(1); trous++; }
      const r = await appel(req);
      if (alea() < 0.1) { doublons++; await appel(req); }                    // même requête reçue deux fois
      if (x < 0.16) perdusRetour++;                                          // réponse perdue au retour
      else a.recevoir(r.d);
    }
    if (alea() < 0.03) { a.recharger(); recharges++; }                       // onglet fermé : ville enregistrée relue
    horloge += 20000;
  }
  // Fin : chaque appareil enregistre et se synchronise sans coupure jusqu'à ce que tout soit livré et accusé.
  for (let tour = 0; tour < 6; tour++) for (const a of apps) { a.enregistrer(); a.recevoir((await appel(a.requete(code))).d); }
  const p = await objets.get(`province:${code}`).state.storage.get('p');
  const fin = total();
  const etals = {};
  for (const g of biens) etals[g] = 0;
  for (const s of p.sieges) for (const [g, lots] of Object.entries(s.etal)) for (const l of lots) etals[g] += l[0];
  console.log(`  ${echanges} opérations : ${perdusAller} requêtes perdues, ${perdusRetour} réponses perdues, ${doublons} doublons, ${trous} trous, ${recharges} rechargements`);
  ok(biens.every((g) => fin[g] + etals[g] === depart[g]), `charges conservées (${biens.map((g) => `${g} ${depart[g]} = ${fin[g]} + ${etals[g]} à l'étal`).join(' ; ')})`);
  ok(fin.tresor === depart.tresor, `deniers conservés (${depart.tresor} au départ, ${fin.tresor} à la fin)`);
  ok(apps.every((a) => a.vive.sortie.length === 0), 'toutes les opérations appliquées');
  ok(p.sieges.every((s) => s.sortie.length === 0), 'toutes les réponses accusées');
  const ventes = apps.reduce((n, a) => n + a.vive.m, 0);
  ok(ventes > 2000, `échanges réellement faits (${ventes} réponses du comptoir)`);
  console.log(`  ${compte.requetes} requêtes au comptoir, ${compte.ecritures} écritures`);
}

// ==========================================================================
section('Étal, signaux, voisin absent, objectif commun');
{
  const { appel } = monter();
  const c = await appel({ a: 'creer', jeu: 'marmoria', carte: 'campanie', siege: 0 });
  const code = c.d.code, j0 = c.d.jeton;
  const r = await appel({ a: 'rejoindre', code });
  const j1 = r.d.jeton;
  // Étal plein : les charges reviennent.
  const ops = [];
  for (let n = 1; n <= 51; n++) ops.push({ n, t: 'depot', g: 'vin', q: 8, p: 150 });
  const s1 = await appel({ a: 'sync', code, siege: 0, jeton: j0, ops: ops.slice(0, 60), accuse: 0 });
  ok(s1.d.recu === 51 && s1.d.vue.sieges[0].etal.vin === 400, 'étal plafonné à 400 charges');
  ok(s1.d.sortie.length === 1 && s1.d.sortie[0].t === 'reprise' && s1.d.sortie[0].raison === 'plein', 'charges de trop rendues');
  // Demande à soi-même ou mal formée : livraison vide, rien ne bouge.
  const s2 = await appel({ a: 'sync', code, siege: 0, jeton: j0, ops: [{ n: 52, t: 'demande', d: 0, b: { vin: 4 } }], accuse: 1 });
  ok(s2.d.sortie.length === 1 && s2.d.sortie[0].l.length === 0 && s2.d.vue.sieges[0].etal.vin === 400, 'demande à son propre étal : rien');
  // Achat par le voisin : FIFO, 8 charges au plus, paiement au vendeur.
  const s3 = await appel({ a: 'sync', code, siege: 1, jeton: j1, ops: [{ n: 1, t: 'demande', d: 0, b: { vin: 20 } }], accuse: 0 });
  const liv = s3.d.sortie[0];
  ok(liv.t === 'livraison' && liv.l.length === 1 && liv.l[0][1] === 8 && liv.l[0][2] === 150, 'caravane d\'un voisin : 8 charges au plus');
  const s4 = await appel({ a: 'sync', code, siege: 0, jeton: j0, ops: [], accuse: 2 });
  ok(s4.d.sortie.length === 1 && s4.d.sortie[0].t === 'paiement' && s4.d.sortie[0].s === 1200 && s4.d.sortie[0].de === 1, 'vendeur payé à sa prochaine connexion (8 × 150)');
  // Signaux : liste fixe seulement, 3 gardés.
  for (const sig of [{ s: 'cherche', b: 'vin' }, { s: 'vend', b: 'marbre' }, { s: 'merci' }, { s: 'aide' }, { s: 'insulte' }, { s: 'vend', b: '<b>' }]) {
    await appel({ a: 'sync', code, siege: 1, jeton: j1, ops: [], accuse: 1, signal: sig });
  }
  const v = (await appel({ a: 'sync', code, siege: 0, jeton: j0, ops: [], accuse: 3 })).d.vue;
  ok(v.sieges[1].signaux.length === 3 && v.sieges[1].signaux.every((x) => PROVINCE.SIGNAUX.includes(x.s)), 'signaux de la liste fixe, 3 gardés');
  // Voisin absent depuis 8 jours.
  horloge += 8 * 86400000;
  const v2 = (await appel({ a: 'sync', code, siege: 0, jeton: j0, ops: [], accuse: 3 })).d.vue;
  ok(v2.sieges[1].actif === false && v2.sieges[0].actif === true, 'voisin absent depuis plus de 7 jours : remplacé par une cité de l\'ordinateur');
  // Objectif commun : seules les cités actives comptent.
  const v3 = (await appel({ a: 'sync', code, siege: 0, jeton: j0, ops: [], accuse: 3, infos: { pop: 4200, objectif: true, ventes: 1200, cotes: { culture: 40, prosperite: 30, paix: 60, faveur: 70 } } })).d.vue;
  ok(v3.gagnee > 0, 'objectif commun atteint quand chaque cité active a ses seuils');
  ok(v3.sieges[0].infos.pop === 4200 && v3.sieges[0].infos.cotes.paix === 60, 'avancement visible des voisins (population, cotes)');
}

// ==========================================================================
section('Effacement après 30 jours sans visite');
{
  const { appel, objets } = monter();
  const c = await appel({ a: 'creer', jeu: 'marmoria', carte: 'campanie', siege: 0 });
  const o = objets.get(`province:${c.d.code}`);
  const prevue = o.state.storage.alarme;
  ok(prevue === horloge + PROVINCE.EFFACEMENT_MS, 'effacement programmé 30 jours après la dernière visite');
  horloge += 20 * 86400000;
  await appel({ a: 'sync', code: c.d.code, siege: 0, jeton: c.d.jeton, ops: [], accuse: 0 });
  ok(o.state.storage.alarme === horloge + PROVINCE.EFFACEMENT_MS, 'une visite repousse l\'effacement');
  horloge = o.state.storage.alarme;
  await o.alarm();
  ok(o.state.storage.taille() === 0, 'province effacée du serveur');
  ok((await appel({ a: 'lire', code: c.d.code })).status === 404, 'province effacée : introuvable');
}

// ==========================================================================
if (args.includes('--cout')) {
  section('Coût sur le serveur : 100 joueurs actifs une heure par jour (25 provinces de 4)');
  // Un appareil se synchronise toutes les 60 s de jeu visible, et 5 s après
  // chaque caravane (au plus 3 par minute à la vitesse ×4) : on compte 1,5
  // envoi par minute en moyenne, la moitié avec des opérations.
  const { appel, compte } = monter();
  const alea = hasard(7);
  const biens = ['vin', 'huile', 'poterie', 'marbre'];
  for (let pr = 0; pr < 25; pr++) {
    const c = await appel({ a: 'creer', jeu: 'marmoria', carte: 'campanie', siege: 0 });
    const apps = [new Appareil(0, c.d.jeton, biens)];
    for (let k = 1; k < 4; k++) { const r = await appel({ a: 'rejoindre', code: c.d.code }); apps.push(new Appareil(r.d.siege, r.d.jeton, biens)); }
    for (let minute = 0; minute < 60; minute++) {
      for (const a of apps) {
        const envois = alea() < 0.5 ? 1 : 2;
        for (let e = 0; e < envois; e++) {
          if (alea() < 0.5) a.produire(alea, biens, apps.map((x) => x.siege).filter((s) => s !== a.siege));
          a.enregistrer();
          a.recevoir((await appel(a.requete(c.d.code))).d);
        }
      }
      horloge += 60000;
    }
  }
  console.log(`  ${compte.requetes} requêtes Durable Objects (et autant de requêtes au Worker), ${compte.ecritures} lignes écrites ; limites gratuites : 100 000 et 100 000 par jour`);
  ok(compte.requetes < 30000 && compte.ecritures < 30000, 'moins de 30 % des limites gratuites');
}

console.log(`\nProvince : ${reussites} contrôles réussis, ${echecs} échec(s).`);
if (echecs) { console.log('Province : il reste des problèmes.'); process.exit(1); }
console.log('Province : tout est bon.');
