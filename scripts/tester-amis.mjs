#!/usr/bin/env node
// ==========================================================================
// tester-amis.mjs — tests des amis, de la présence et du classement entre
// amis (docs/consigne-amis.md), sans réseau.
//
//   node scripts/tester-amis.mjs
//
// Appelle les fonctions Cloudflare dans Node (functions/api/amis.js,
// profil.js, functions/_amis.js) avec une base SQLite en mémoire
// (scripts/d1-local.mjs), une horloge simulée et le vrai serveur de présence
// du Worker (multijoueur/src/presence.js) avec un faux stockage. Vérifie :
//   - amitié : pseudo exact seulement, pseudo et niveau requis pour demander,
//     acceptation obligatoire, demandes croisées, refus, annulation, retrait,
//     blocage (le bloqué ne peut plus demander ni voir), déblocage ;
//   - limites : essais par heure (pseudo inconnu compris), amis au plus,
//     demandes en attente, boîte de réception pleine ; demandes trop vieilles effacées ;
//   - présence : ticket seulement avec un ami, signal refusé d'un autre site
//     ou sans ticket valide, présence lue seulement pour les amis acceptés,
//     mode invisible, hors ligne après le délai, lecture au plus toutes les
//     10 s par profil, écritures du stockage regroupées, mode dégradé ;
//   - classement entre amis : moi et mes amis seulement, même calcul que le
//     classement général, points nuls compris ;
//   - résumé des amis dans le profil (pastille) et indicateurs quotidiens.
// Code de sortie 1 si un test échoue.
// ==========================================================================

import { baseD1 } from './d1-local.mjs';
import * as R from '../public/profil-reglages.js';
import { signerTicket } from '../multijoueur/src/ticket.js';

const SITE = 'https://freemicrogames.com';
const MULTI = 'https://multi.test';
const HEURE = 3600000;
const JOUR = 86400000;

let echecs = 0;
function verifier(condition, message, detail) {
  if (condition) console.log(`  ✓ ${message}`);
  else { echecs++; console.log(`  ✗ ${message}${detail !== undefined ? ` — obtenu : ${JSON.stringify(detail)}` : ''}`); }
}

// --- Horloge simulée, serveur de présence simulé -------------------------------------

let maintenant = Date.UTC(2026, 10, 2, 10, 0, 0); // lundi 2 novembre 2026
Date.now = () => maintenant;
const avancer = (ms) => { maintenant += ms; };

const { Presence, routePresence } = await import('../multijoueur/src/presence.js');
const stockage = new Map();
let ecrituresStockage = 0;
const objetPresence = new Presence({ storage: { get: async (k) => stockage.get(k), put: async (k, v) => { ecrituresStockage++; stockage.set(k, JSON.parse(JSON.stringify(v))); } } });
const envWorker = {
  MULTI_SECRET: 'secret-multi',
  PRESENCE: { idFromName: (n) => n, get: () => ({ fetch: (adresse, init) => objetPresence.fetch(new Request(adresse, init)) }) },
};
let presenceEnPanne = false;
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith(`${MULTI}/`)) {
    if (presenceEnPanne) return new Response('quota', { status: 503 });
    const chemin = new URL(url).pathname;
    return (await routePresence(new Request(url, options), envWorker, chemin, [SITE])) || new Response('?', { status: 404 });
  }
  return vraiFetch(url, options);
};
// Signal du navigateur au serveur de présence (comme public/amis.js).
const signal = (ticket, corps = {}, origine = SITE) => routePresence(new Request(`${MULTI}/presence`, {
  method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: origine }, body: JSON.stringify({ ticket, ...corps }),
}), envWorker, '/presence', [SITE]);

const CATALOGUE = {
  games: [
    { id: 'robot-max', title: 'Robot Max', etoiles: 72 },
    { id: 'enclos-de-la-ferme', title: 'Enclos', multijoueur: true, rejoindre: true },
  ],
};

const DB = baseD1();
const env = {
  DB,
  IP_SALT: 'sel',
  MULTI_SECRET: 'secret-multi',
  MULTI_API: MULTI,
  ASSETS: { fetch: async () => new Response(JSON.stringify(CATALOGUE)) },
};

const { onRequestPost: apiProfil } = await import('../functions/api/profil.js');
const { onRequestPost: apiAmis } = await import('../functions/api/amis.js');
const { tacheQuotidienneProfil, calculerFidelisation } = await import('../functions/_profil.js');

async function appeler(fonction, corps, { ip = '203.0.113.1', entetes = {} } = {}) {
  const requete = new Request(`${SITE}/api/x`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, Origin: SITE, ...entetes },
    body: JSON.stringify(corps),
  });
  const r = await fonction({ request: requete, env, waitUntil: () => {} });
  let donnees = null;
  try { donnees = await r.json(); } catch { /* vide */ }
  return { statut: r.status, ...donnees };
}
const amis = (jeton, corps, o) => appeler(apiAmis, { jeton, ...corps }, o);

// Profils de test : pseudo choisi, niveau 4 (100 XP), sauf indication contraire.
async function joueur(pseudo, { niveau = true, ip } = {}) {
  const r = await appeler(apiProfil, { action: 'creer', jour: '2026-11-02' }, { ip: ip || `198.51.100.${Math.floor(Math.random() * 200) + 1}` });
  if (pseudo) await appeler(apiProfil, { action: 'pseudo', jeton: r.jeton, pseudo }, { ip: `192.0.2.${Math.floor(Math.random() * 200) + 1}` });
  if (niveau) await DB.prepare('UPDATE profils SET xp = 100, niveau = 4 WHERE id = ?').bind(r.etat.id).run();
  return { jeton: r.jeton, id: r.etat.id, pseudo };
}

const lea = await joueur('Léa');
const tom = await joueur('Tom Pouce');
const zoe = await joueur('Zoé');
const sansPseudo = await joueur(null);
const debutant = await joueur('Petit Nouveau', { niveau: false });

// ==========================================================================
console.log('Demandes d\'ami');
verifier((await amis(sansPseudo.jeton, { action: 'demander', pseudo: 'Léa' })).statut === 'pseudo-requis', 'sans pseudo choisi : demande impossible (le receveur doit savoir qui demande)');
verifier((await amis(debutant.jeton, { action: 'demander', pseudo: 'Léa' })).statut === 'niveau', `niveau ${R.AMIS_NIVEAU_MIN} requis pour demander (profils de robots écartés)`);
verifier((await amis(lea.jeton, { action: 'demander', pseudo: 'Lé' })).statut === 'inconnu', 'pseudo partiel : inconnu (pas de recherche partielle)');
verifier((await amis(lea.jeton, { action: 'demander', pseudo: 'Joueur 1234' })).statut === 'inconnu', 'pseudo par défaut : pas une clé d\'ajout');
verifier((await amis(lea.jeton, { action: 'demander', pseudo: 'léa' })).statut === 'soi-meme', 'soi-même refusé');
let r = await amis(lea.jeton, { action: 'demander', pseudo: 'TOM-POUCE' });
verifier(r.statut === 'envoyee' && r.ami?.id === tom.id, 'pseudo exact, sans tenir compte des majuscules, espaces et tirets : demande envoyée', r);
verifier((await amis(lea.jeton, { action: 'demander', pseudo: 'Tom Pouce' })).statut === 'deja-envoyee', 'demande déjà envoyée');
let lt = await amis(tom.jeton, { action: 'liste', presence: false });
verifier(lt.recues.length === 1 && lt.recues[0].id === lea.id && lt.amis.length === 0, 'Tom voit la demande reçue, sans amitié avant acceptation', lt);
verifier(lt.resume?.recues === 1, 'résumé : 1 demande en attente (indicateur de la pastille)', lt.resume);
const etatTom = await appeler(apiProfil, { action: 'etat', jeton: tom.jeton });
verifier(etatTom.etat?.amis?.recues === 1 && etatTom.etat.amis.amis === 0, 'l\'état du profil porte le résumé des amis (pastille)', etatTom.etat?.amis);
verifier((await amis(zoe.jeton, { action: 'accepter', id: lea.id })).statut === 'introuvable', 'accepter sans demande reçue : refusé');
verifier((await amis(tom.jeton, { action: 'accepter', id: lea.id })).statut === 'ok', 'Tom accepte');
let ll = await amis(lea.jeton, { action: 'liste', presence: false });
verifier(ll.amis.length === 1 && ll.amis[0].id === tom.id && ll.amis[0].pseudo === 'Tom Pouce' && ll.envoyees.length === 0, 'Léa et Tom sont amis (les deux côtés)', ll);
verifier(!('invisible' in ll.amis[0]), 'le réglage « invisible » d\'un ami n\'est jamais envoyé');
verifier((await amis(lea.jeton, { action: 'demander', pseudo: 'Tom Pouce' })).statut === 'deja-ami', 'déjà amis');

// Demandes croisées : Zoé demande Léa, puis Léa demande Zoé → acceptée.
await amis(zoe.jeton, { action: 'demander', pseudo: 'Léa' });
r = await amis(lea.jeton, { action: 'demander', pseudo: 'Zoé' });
verifier(r.statut === 'acceptee', 'demande à quelqu\'un qui m\'avait demandé : vaut acceptation', r);
verifier((await amis(lea.jeton, { action: 'retirer', id: zoe.id })).statut === 'ok' && (await amis(zoe.jeton, { action: 'liste', presence: false })).amis.length === 0, 'retirer un ami : plus amis des deux côtés');

// Refus, annulation.
await amis(zoe.jeton, { action: 'demander', pseudo: 'Tom Pouce' });
verifier((await amis(tom.jeton, { action: 'refuser', id: zoe.id })).statut === 'ok' && (await amis(zoe.jeton, { action: 'liste', presence: false })).envoyees.length === 0, 'refus : la demande disparaît des deux côtés');
await amis(zoe.jeton, { action: 'demander', pseudo: 'Tom Pouce' });
verifier((await amis(zoe.jeton, { action: 'annuler', id: tom.id })).statut === 'ok' && (await amis(tom.jeton, { action: 'liste', presence: false })).recues.length === 0, 'annuler une demande envoyée');

// Blocage.
await amis(zoe.jeton, { action: 'demander', pseudo: 'Tom Pouce' });
verifier((await amis(tom.jeton, { action: 'bloquer', id: zoe.id })).statut === 'ok', 'Tom bloque Zoé (depuis sa demande)');
let lz = await amis(zoe.jeton, { action: 'liste', presence: false });
verifier(lz.envoyees.length === 0 && lz.amis.length === 0, 'Zoé ne voit plus rien de Tom (et ne sait pas qu\'elle est bloquée)', lz);
verifier((await amis(zoe.jeton, { action: 'demander', pseudo: 'Tom Pouce' })).statut === 'indisponible', 'le bloqué ne peut plus envoyer de demande (réponse neutre)');
verifier((await amis(tom.jeton, { action: 'liste', presence: false })).bloques.some((b) => b.id === zoe.id), 'Tom voit Zoé dans ses joueurs bloqués');
verifier((await amis(tom.jeton, { action: 'demander', pseudo: 'Zoé' })).statut === 'bloque-par-toi', 'Tom doit débloquer Zoé avant de lui demander');
verifier((await amis(tom.jeton, { action: 'debloquer', id: zoe.id })).statut === 'ok', 'déblocage');
verifier((await amis(zoe.jeton, { action: 'demander', pseudo: 'Tom Pouce' })).statut === 'envoyee', 'après déblocage, Zoé peut de nouveau demander');
await amis(tom.jeton, { action: 'refuser', id: zoe.id });
verifier((await amis(tom.jeton, { action: 'bloquer', id: sansPseudo.id })).statut === 'introuvable', 'on ne bloque qu\'un joueur avec qui on a une relation (pas de parcours des profils)');
verifier((await amis(tom.jeton, { action: 'accepter', id: 'x' })).statut === 400, 'identifiant invalide : 400');
verifier((await appeler(apiAmis, { action: 'liste', jeton: 'faux'.repeat(10) })).statut === 401, 'jeton inconnu : 401');
verifier((await appeler(apiAmis, { action: 'liste', jeton: lea.jeton }, { entetes: { Origin: 'https://autre.example' } })).statut === 403, 'autre site : refusé');

// ==========================================================================
console.log('Limites');
const spam = await joueur('Spammeur', { ip: '203.0.113.9' });
let statuts = [];
for (let i = 0; i < R.AMIS_ESSAIS_HEURE + 2; i++) statuts.push((await amis(spam.jeton, { action: 'demander', pseudo: `inconnu${i}x` }, { ip: '203.0.113.9' })).statut);
verifier(statuts.slice(0, R.AMIS_ESSAIS_HEURE).every((s) => s === 'inconnu') && statuts.slice(R.AMIS_ESSAIS_HEURE).every((s) => s === 'limite-heure'), `${R.AMIS_ESSAIS_HEURE} essais par heure, pseudos inconnus compris (pas de parcours des pseudos)`, statuts);
avancer(HEURE + 1000);
verifier((await amis(spam.jeton, { action: 'demander', pseudo: 'Léa' }, { ip: '203.0.113.9' })).statut === 'envoyee', 'une heure plus tard : de nouveau permis');
await amis(lea.jeton, { action: 'refuser', id: spam.id });

// Amis au plus, demandes en attente au plus, boîte pleine (lignes posées directement).
const plein = await joueur('Plein Amis');
const remplir = async (id, etat, n, base) => {
  for (let i = 0; i < n; i++) {
    const autre = base + i;
    await DB.prepare('INSERT INTO profils (id, numero, cree_le, vu_le, sync_le) VALUES (?, 1000, ?, ?, ?)').bind(autre, maintenant, maintenant, maintenant).run();
    await DB.prepare('INSERT INTO amis (profil, autre, etat, cree_le, maj_le) VALUES (?, ?, ?, ?, ?)').bind(id, autre, etat, maintenant, maintenant).run();
  }
};
await remplir(plein.id, 'ami', R.AMIS_MAX, 100000);
verifier((await amis(plein.jeton, { action: 'demander', pseudo: 'Léa' })).statut === 'limite-amis', `${R.AMIS_MAX} amis au plus`);
verifier((await amis(lea.jeton, { action: 'demander', pseudo: 'Plein Amis' })).statut === 'indisponible', 'joueur qui a déjà le maximum d\'amis : demande impossible (réponse neutre)');
const attente = await joueur('Attente Max');
await remplir(attente.id, 'envoyee', R.AMIS_ATTENTE_MAX, 200000);
verifier((await amis(attente.jeton, { action: 'demander', pseudo: 'Léa' })).statut === 'limite-attente', `${R.AMIS_ATTENTE_MAX} demandes en attente au plus`);
const boite = await joueur('Boite Pleine');
await remplir(boite.id, 'recue', R.AMIS_RECUES_MAX, 300000);
verifier((await amis(lea.jeton, { action: 'demander', pseudo: 'Boite Pleine' })).statut === 'indisponible', `boîte de ${R.AMIS_RECUES_MAX} demandes pleine : réponse neutre`);

// ==========================================================================
console.log('Présence');
verifier((await amis(zoe.jeton, { action: 'ticket' })).statut === 409, 'pas d\'ami : pas de ticket de présence (aucun signal envoyé)');
const tLea = await amis(lea.jeton, { action: 'ticket' });
const tTom = await amis(tom.jeton, { action: 'ticket' });
verifier(typeof tLea.ticket === 'string' && tLea.expire === maintenant + R.PRESENCE_TICKET_HEURES * HEURE, 'ticket de présence pour un joueur qui a un ami', tLea);
verifier((await signal(tLea.ticket, { etat: 'site' }, 'https://autre.example')).status === 403, 'signal d\'un autre site refusé');
verifier((await signal('faux.ticket', { etat: 'site' })).status === 401, 'signal sans ticket valide refusé');
const ticketJeu = await signerTicket('secret-multi', { profil: lea.id, jeu: 'enclos-de-la-ferme', expiration: maintenant + HEURE });
verifier((await signal(ticketJeu, { etat: 'site' })).status === 401, 'un ticket d\'entrée de partie ne vaut pas ticket de présence');
const partie = 'enclos-de-la-ferme.0123abcd-0123-4567-89ab-0123456789ab';
verifier((await signal(tLea.ticket, { etat: 'jeu', jeu: 'enclos-de-la-ferme', partie })).status === 204, 'Léa signale qu\'elle joue en ligne');
let vue = await amis(tom.jeton, { action: 'liste', presence: true });
verifier(vue.presence === 'ok' && vue.amis[0].presence?.etat === 'jeu' && vue.amis[0].presence.jeu === 'enclos-de-la-ferme' && vue.amis[0].presence.partie === partie, 'Tom voit Léa en jeu, avec sa partie (bouton « Rejoindre »)', vue.amis[0]);
verifier((await amis(tom.jeton, { action: 'liste', presence: true })).presence === 'trop-tot', `deuxième lecture à moins de ${R.AMIS_ACTUALISER_MIN_S} s : refusée par le serveur (par profil)`);
avancer(R.AMIS_ACTUALISER_MIN_S * 1000);
// Zoé, qui n'est pas amie de Léa, ne peut pas voir sa présence : elle n'est dans aucune de ses listes.
const vueZoe = await amis(zoe.jeton, { action: 'liste', presence: true });
verifier(!JSON.stringify(vueZoe).includes(partie), 'un non-ami ne voit jamais la présence (contrôle à chaque lecture)');
// Signal d'un joueur hors de la liste demandée : jamais renvoyé, même si l'appelant demande son numéro.
const lu = await (await routePresence(new Request(`${MULTI}/presence/lire`, { method: 'POST', headers: { Authorization: 'Bearer secret-multi' }, body: JSON.stringify({ lecteur: zoe.id, ids: [tom.id] }) }), envWorker, '/presence/lire', [SITE])).json();
verifier(!lu.presences?.[lea.id], 'le serveur de présence ne renvoie que les profils demandés par le site');
verifier((await routePresence(new Request(`${MULTI}/presence/lire`, { method: 'POST', body: '{}' }), envWorker, '/presence/lire', [SITE])).status === 403, 'lecture de la présence sans le secret du site : refusée');

// Invisible.
await amis(lea.jeton, { action: 'invisible', invisible: true });
avancer(R.AMIS_ACTUALISER_MIN_S * 1000);
vue = await amis(tom.jeton, { action: 'liste', presence: true });
verifier(vue.amis[0].presence?.etat === 'hors', 'Léa en mode invisible : hors ligne pour ses amis (vérifié par le serveur)', vue.amis[0]);
verifier((await amis(lea.jeton, { action: 'ticket' })).statut === 409, 'mode invisible : pas de ticket de présence');
await amis(lea.jeton, { action: 'invisible', invisible: false });

// Hors ligne après le délai.
avancer(R.PRESENCE_HORS_LIGNE_S * 1000 + 1000);
vue = await amis(tom.jeton, { action: 'liste', presence: true });
verifier(vue.amis[0].presence?.etat === 'hors', `sans signal depuis ${R.PRESENCE_HORS_LIGNE_S} s : hors ligne`, vue.amis[0]);
await signal(tLea.ticket, { etat: 'site' });
avancer(R.AMIS_ACTUALISER_MIN_S * 1000);
vue = await amis(tom.jeton, { action: 'liste', presence: true });
verifier(vue.amis[0].presence?.etat === 'site', 'signal « site » : en ligne, sans jeu');
await signal(tLea.ticket, { etat: 'hors' });
avancer(R.AMIS_ACTUALISER_MIN_S * 1000);
verifier((await amis(tom.jeton, { action: 'liste', presence: true })).amis[0].presence?.etat === 'hors', 'signal « hors » : hors ligne tout de suite');

// Signaux rapprochés et écritures du stockage regroupées (jamais D1).
const avantEcritures = ecrituresStockage;
let refusRapproches = 0;
for (let i = 0; i < 20; i++) {
  avancer(1000);
  const s = await signal(tTom.ticket, { etat: 'site' });
  if (s.status === 429) refusRapproches++;
}
verifier(refusRapproches >= 15, 'signaux identiques à moins de quelques secondes : ignorés', refusRapproches);
verifier(ecrituresStockage - avantEcritures <= 1, `état recopié dans le stockage au plus toutes les ${R.PRESENCE_ECRITURE_S} s`, ecrituresStockage - avantEcritures);
const lignesD1 = await DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name LIKE '%presence%'").first();
verifier(lignesD1.n === 0, 'aucune table de présence dans D1');

// Mode dégradé.
presenceEnPanne = true;
avancer(R.AMIS_ACTUALISER_MIN_S * 1000);
vue = await amis(tom.jeton, { action: 'liste', presence: true });
verifier(vue.statut === 200 && vue.presence === 'indisponible' && vue.amis.length === 1, 'serveur de présence en panne : la liste d\'amis reste, présence « indisponible »', vue);
presenceEnPanne = false;

// ==========================================================================
console.log('Classement entre amis');
await DB.prepare("INSERT INTO profils_gains (profil, jour, xp, etoiles) VALUES (?, '2026-11-02', 300, 4), (?, '2026-11-02', 120, 9), (?, '2026-11-02', 999, 0)").bind(tom.id, lea.id, zoe.id).run();
avancer(R.AMIS_ACTUALISER_MIN_S * 1000);
let c = await amis(lea.jeton, { action: 'classement', perimetre: 'general', periode: 'semaine', presence: true });
verifier(c.lignes?.length === 2 && c.lignes[0].id === tom.id && c.lignes[1].id === lea.id && c.lignes[0].points === 300, 'moi et mes amis seulement, triés par XP de la période (Zoé, non amie, absente)', c.lignes);
verifier(c.lignes?.[0].presence?.etat && !c.lignes[1].presence, 'présence des amis sur leur ligne (pas sur la mienne)');
c = await amis(lea.jeton, { action: 'classement', perimetre: 'etoiles', periode: 'mois', presence: false });
verifier(c.lignes?.[0].id === lea.id && c.lignes[0].points === 9, 'périmètre « étoiles » : même calcul que le classement général', c.lignes);
c = await amis(lea.jeton, { action: 'classement', perimetre: 'multi:enclos-de-la-ferme', periode: 'semaine', presence: false });
verifier(c.lignes?.length === 2 && c.lignes.every((l) => l.points === 0), 'jeu multijoueur sans manche : tout le groupe, à zéro', c.lignes);
verifier((await amis(lea.jeton, { action: 'classement', perimetre: 'multi:robot-max', periode: 'semaine' })).statut === 400, 'périmètre d\'un jeu non multijoueur : refusé');

// ==========================================================================
console.log('Indicateurs et effacements');
await amis(zoe.jeton, { action: 'demander', pseudo: 'Léa' });
await amis(lea.jeton, { action: 'rejoindre', type: 'partie' });
const d = await calculerFidelisation(env, '2026-11-02');
verifier(d.amis && d.amis.demandes >= 1 && d.amis.acceptees >= 1 && d.amis.rejoindre >= 1 && d.amis.rejoindrePartie >= 1, 'indicateurs : demandes envoyées, acceptées, boutons « Rejoindre »', d.amis);
verifier(d.amis.avecAmi >= 2 && d.amis.part > 0 && d.amis.parJoueur > 0, 'indicateurs : joueurs avec au moins un ami, part, amis par joueur', d.amis);
avancer((R.AMIS_DEMANDE_JOURS + 1) * JOUR);
await tacheQuotidienneProfil(env, maintenant);
const vieilles = await DB.prepare("SELECT COUNT(*) AS n FROM amis WHERE profil = ? AND etat = 'recue' AND autre = ?").bind(lea.id, zoe.id).first();
verifier(vieilles.n === 0, `demande sans réponse depuis ${R.AMIS_DEMANDE_JOURS} jours : effacée`);
const amitie = await DB.prepare("SELECT COUNT(*) AS n FROM amis WHERE etat = 'ami' AND ((profil = ? AND autre = ?) OR (profil = ? AND autre = ?))").bind(lea.id, tom.id, tom.id, lea.id).first();
verifier(amitie.n === 2, 'l\'amitié reste (elle suit le profil, y compris par le code de sauvegarde)');

console.log(echecs ? `\n${echecs} test(s) en échec.` : '\nAmis : tout est bon.');
process.exit(echecs ? 1 : 0);
