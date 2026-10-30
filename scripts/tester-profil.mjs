#!/usr/bin/env node
// ==========================================================================
// tester-profil.mjs — tests du profil joueur (docs/cadrage-fidelisation.md),
// sans réseau.
//
//   node scripts/tester-profil.mjs
//
// Appelle les fonctions Cloudflare dans Node (functions/api/profil.js,
// classement.js, profil-multi.js, functions/_profil.js) avec une base SQLite
// en mémoire (scripts/d1-local.mjs) et une horloge simulée. Vérifie :
//   - code de sauvegarde : format, clé de contrôle, fautes de frappe, accents
//     et majuscules, génération aléatoire ;
//   - calcul d'expérience : courbe des niveaux, temps de jeu jamais plus long
//     que le temps écoulé, plafond du jour, série de jours (tolérance d'un jour
//     manqué, jour refusé), bonus du retour ;
//   - jeu terminé et étoiles : durée minimale, bonus une seule fois, meilleur
//     résultat sans cumul, étoiles ≤ possibles, nombre possible imposé par le
//     catalogue, plafond du jour, badges ;
//   - code de sauvegarde côté serveur : création limitée, restauration avec
//     Turnstile, essais ratés et blocage progressif ;
//   - pseudos : filtre, unicité, signalements ;
//   - multijoueur (anti-triche) : ticket signé (falsifié, expiré, autre jeu),
//     présence réelle (durée, coups), un seul enregistrement par manche,
//     secret obligatoire, plafond du jour, badges ;
//   - classement : ordre, niveau minimal, position hors du top, périmètre ;
//   - indicateurs de fidélisation et effacements quotidiens ;
//   - provenance (autre site refusé).
// Code de sortie 1 si un test échoue.
// ==========================================================================

import { baseD1 } from './d1-local.mjs';
import * as R from '../public/profil-reglages.js';
import { lireCode, nouveauCode, normaliserCode } from '../public/profil-code.js';
import { MOTS } from '../public/profil-mots.js';
import { signerTicket, verifierTicket } from '../multijoueur/src/ticket.js';
import { resultatsManche, nouveauSuivi } from '../multijoueur/src/profil.js';

const SITE = 'https://freemicrogames.com';
const JOUR = 86400000;

let echecs = 0;
function verifier(condition, message, detail) {
  if (condition) console.log(`  ✓ ${message}`);
  else { echecs++; console.log(`  ✗ ${message}${detail !== undefined ? ` — obtenu : ${JSON.stringify(detail)}` : ''}`); }
}

// --- Horloge simulée et Turnstile simulé -------------------------------------------

let maintenant = Date.UTC(2026, 10, 2, 10, 0, 0); // lundi 2 novembre 2026, 10:00 UTC
const vraiNow = Date.now;
Date.now = () => maintenant;
const avancer = (ms) => { maintenant += ms; };
const jourLocal = () => new Date(maintenant).toISOString().slice(0, 10);

const vraiFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).includes('challenges.cloudflare.com')) {
    const jeton = options.body.get('response');
    return new Response(JSON.stringify({ success: jeton.startsWith('ok-'), action: jeton.split('-')[1] }));
  }
  return vraiFetch(url, options);
};

const CATALOGUE = {
  games: [
    { id: 'robot-max', title: 'Robot Max', etoiles: 72 },
    { id: 'glissade', title: 'Glissade' },
    { id: 'sans-fin', title: 'Sans fin', sans_fin: true },
    { id: 'enclos-de-la-ferme', title: 'Enclos', multijoueur: true },
    ...Array.from({ length: 14 }, (_, i) => ({ id: `jeu-${i + 1}`, title: `Jeu ${i + 1}` })),
  ],
};

const DB = baseD1();
const env = {
  DB,
  IP_SALT: 'sel',
  TURNSTILE_SECRET: 'secret-turnstile',
  MULTI_SECRET: 'secret-multi',
  ASSETS: { fetch: async () => new Response(JSON.stringify(CATALOGUE)) },
};

const { onRequestPost: apiProfil } = await import('../functions/api/profil.js');
const { onRequestPost: apiClassement } = await import('../functions/api/classement.js');
const { onRequestPost: apiMulti } = await import('../functions/api/profil-multi.js');
const { tacheQuotidienneProfil } = await import('../functions/_profil.js');

let ipCourante = '203.0.113.1';
async function appeler(fonction, corps, { ip = ipCourante, entetes = {} } = {}) {
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
const profil = (corps, o) => appeler(apiProfil, corps, o);

// ==========================================================================
console.log('Code de sauvegarde');
verifier(MOTS.length === 2048 && new Set(MOTS).size === 2048 && MOTS.every((m) => /^[a-z]{3,7}$/.test(m)), 'liste de 2 048 mots uniques, sans accent');
const codes = Array.from({ length: 200 }, nouveauCode);
verifier(codes.every((c) => lireCode(c).ok), 'les codes tirés au hasard sont valides');
verifier(new Set(codes).size === codes.length, 'codes tous différents (200 tirages)');
const c = codes[0];
const [m1, m2, m3, m4, cle] = c.split('-');
verifier(lireCode(c.toUpperCase().replace(/-/g, '  ')).ok, 'majuscules et espaces acceptés');
verifier(normaliserCode('Chat—Lune / Fusée_Pomme 12') === 'chat-lune-fusee-pomme-12', 'accents et séparateurs normalisés');
verifier(lireCode(`${m1}-${m2}-${m3}`).raison === 'format', 'trois mots : format refusé');
verifier(lireCode(`${m1}x-${m2}-${m3}-${m4}-${cle}`).raison === 'mot' && lireCode(`${m1}x-${m2}-${m3}-${m4}-${cle}`).position === 1, 'mot mal écrit repéré avec sa position');
const autreMot = MOTS[(MOTS.indexOf(m2) + 1) % MOTS.length];
verifier(lireCode(`${m1}-${autreMot}-${m3}-${m4}-${cle}`).raison === 'cle', 'mot remplacé par un autre mot de la liste : clé fausse');
let inversions = 0;
let detectees = 0;
for (const code of codes) {
  const [a, b, x, y, k] = code.split('-');
  if (a === b) continue;
  inversions++;
  if (lireCode(`${b}-${a}-${x}-${y}-${k}`).raison === 'cle') detectees++;
}
verifier(detectees / inversions > 0.95, `deux mots inversés détectés (${detectees}/${inversions})`);
verifier(lireCode(`${m1}-${m2}-${m3}-${m4}-${String((Number(cle) + 1) % 97).padStart(2, '0')}`).raison === 'cle', 'chiffres faux : clé refusée');

// ==========================================================================
console.log('Courbe des niveaux');
verifier(R.seuilNiveau(1) === 0 && R.seuilNiveau(5) === 160 && R.seuilNiveau(6) === 250 && R.seuilNiveau(7) === 370, 'seuils 1, 5, 6, 7', [1, 5, 6, 7].map(R.seuilNiveau));
verifier(R.niveauPourXp(0) === 1 && R.niveauPourXp(159) === 4 && R.niveauPourXp(160) === 5 && R.niveauPourXp(1e9) === R.NIVEAU_MAX, 'niveau d\'après l\'XP');
verifier(R.seuilNiveau(5) / R.XP_PAR_MINUTE <= 20, 'les 5 premiers niveaux en une séance (20 min de jeu au plus)');
verifier(R.seuilNiveau(20) > R.MINUTES_MAX_JOUR * R.XP_PAR_MINUTE * 5, 'le niveau 20 demande de revenir plusieurs jours');

// ==========================================================================
console.log('Création et temps de jeu');
const refuse = await profil({ action: 'creer', jour: jourLocal() }, { entetes: { Origin: 'https://autre-site.example' } });
verifier(refuse.statut === 403, 'envoi depuis un autre site refusé', refuse.statut);
const a = await profil({ action: 'creer', jour: jourLocal() });
verifier(a.statut === 200 && typeof a.jeton === 'string' && a.etat.niveau === 1 && a.etat.pseudo === null && a.etat.numero >= R.NUMERO_MIN, 'profil créé : niveau 1, pseudo par défaut', a);
const jetonA = a.jeton;
const ligneAppareil = await DB.prepare('SELECT jeton FROM profils_appareils').first();
verifier(ligneAppareil.jeton !== jetonA && ligneAppareil.jeton.length === 64, 'la base ne garde que l\'empreinte du jeton');
verifier((await profil({ action: 'etat', jeton: 'x'.repeat(40) })).statut === 401, 'jeton inconnu : 401');

avancer(60000);
let s = await profil({ action: 'sync', jeton: jetonA, jour: jourLocal(), temps: [{ jeu: 'robot-max', secondes: 3000 }] });
verifier(s.etat.jeux[0].secondes <= 60 + R.TOLERANCE_TEMPS_S && s.etat.xp === 2 * R.XP_PAR_MINUTE, 'temps déclaré ramené au temps écoulé (1 min + tolérance)', s.etat);
avancer(5 * 60000);
s = await profil({ action: 'sync', jeton: jetonA, jour: jourLocal(), temps: [{ jeu: 'robot-max', secondes: 180 }, { jeu: 'glissade', secondes: 120 }, { jeu: 'inconnu-xyz', secondes: 60 }] });
verifier(s.etat.jeux.length === 2 && s.etat.jeux.find((j) => j.id === 'glissade').secondes === 120, 'temps par jeu, jeu inconnu ignoré', s.etat.jeux);
verifier(s.etat.xp === 7 * R.XP_PAR_MINUTE, 'XP : 10 par minute', s.etat.xp);
avancer(3 * 3600000);
s = await profil({ action: 'sync', jeton: jetonA, jour: jourLocal(), temps: [{ jeu: 'glissade', secondes: 3 * 3600 }] });
verifier(s.etat.aujourdhui.secondes === R.MINUTES_MAX_JOUR * 60 && s.etat.xp === R.MINUTES_MAX_JOUR * R.XP_PAR_MINUTE, 'plafond du jour : 60 min d\'XP', s.etat.aujourdhui);
verifier(s.etat.jeux.find((j) => j.id === 'glissade').secondes > 3 * 3600 - 10, 'le temps au-delà du plafond reste noté par jeu');

// ==========================================================================
console.log('Jours consécutifs');
const jourPlus = (n) => new Date(Date.UTC(2026, 10, 2) + n * JOUR).toISOString().slice(0, 10);
verifier(s.etat.serie === 1 && s.etat.dernierJour === jourPlus(0), 'série de 1 jour à la création', [s.etat.serie, s.etat.dernierJour]);
s = await profil({ action: 'sync', jeton: jetonA, jour: jourPlus(5) });
verifier(s.gains.bienvenue === null && s.etat.serie === 1, 'jour trop loin de la date du serveur : refusé', s.gains);
maintenant = Date.UTC(2026, 10, 3, 9, 0);
s = await profil({ action: 'sync', jeton: jetonA, jour: jourPlus(1) });
verifier(s.etat.serie === 2 && s.gains.bienvenue.bonus === 2 * R.BONUS_SERIE_PAR_JOUR, 'lendemain : série de 2, bonus 20 XP', s.gains);
s = await profil({ action: 'sync', jeton: jetonA, jour: jourPlus(1) });
verifier(s.gains.bienvenue === null, 'même jour : pas de second bonus');
maintenant = Date.UTC(2026, 10, 5, 9, 0);
s = await profil({ action: 'sync', jeton: jetonA, jour: jourPlus(3) });
verifier(s.etat.serie === 3 && s.etat.badges.some((b) => b.id === 'serie-3') && s.gains.bienvenue.bonus === 3 * R.BONUS_SERIE_PAR_JOUR + R.BONUS_PALIER_SERIE, 'un jour manqué toléré : série de 3, badge et bonus du palier', s.gains);
maintenant = Date.UTC(2026, 10, 9, 9, 0);
s = await profil({ action: 'sync', jeton: jetonA, jour: jourPlus(7) });
verifier(s.etat.serie === 1 && s.etat.serieRecord === 3, 'trois jours manqués : nouvelle série, record gardé', [s.etat.serie, s.etat.serieRecord]);
s = await profil({ action: 'sync', jeton: jetonA, jour: jourPlus(6) });
verifier(s.etat.dernierJour === jourPlus(7), 'jour antérieur au dernier jour : ignoré');

// ==========================================================================
console.log('Jeu terminé et étoiles');
const b = await profil({ action: 'creer', jour: jourLocal() });
const jetonB = b.jeton;
avancer(30000);
s = await profil({ action: 'sync', jeton: jetonB, jour: jourLocal(), temps: [{ jeu: 'robot-max', secondes: 30 }], termines: [{ jeu: 'robot-max', etoiles: 50, max: 72 }] });
verifier(s.gains.termines[0].statut === 'trop-court' && !s.etat.jeux[0].termine, 'moins d\'une minute de jeu : « trop court »', s.gains.termines);
avancer(60000);
s = await profil({ action: 'sync', jeton: jetonB, jour: jourLocal(), temps: [{ jeu: 'robot-max', secondes: 60 }], termines: [{ jeu: 'robot-max', etoiles: 80, max: 72 }] });
verifier(s.gains.termines[0].statut === 'refuse', 'plus d\'étoiles que possible : refusé');
s = await profil({ action: 'sync', jeton: jetonB, jour: jourLocal(), termines: [{ jeu: 'robot-max', etoiles: 50, max: 60 }] });
verifier(s.gains.termines[0].statut === 'refuse', 'étoiles possibles différentes du catalogue (72) : refusé');
s = await profil({ action: 'sync', jeton: jetonB, jour: jourLocal(), termines: [{ jeu: 'robot-max' }] });
verifier(s.gains.termines[0].statut === 'refuse', 'jeu à étoiles sans étoiles : refusé');
const xpAvant = s.etat.xp;
s = await profil({ action: 'sync', jeton: jetonB, jour: jourLocal(), termines: [{ jeu: 'robot-max', etoiles: 50, max: 72 }] });
const fin = s.etat.jeux.find((j) => j.id === 'robot-max');
verifier(s.gains.termines[0].statut === 'ok' && fin.termine && fin.etoiles === 50 && fin.max === 72, 'jeu terminé : 50 / 72 étoiles', s.gains);
verifier(s.etat.xp - xpAvant === R.BONUS_TERMINE + 50 * R.XP_PAR_ETOILE, 'XP : bonus + 5 par étoile', s.etat.xp - xpAvant);
verifier(s.etat.badges.some((x) => x.id === 'collection-1') && s.etat.badges.some((x) => x.id === 'etoiles-50'), 'badges « premier jeu terminé » et « 50 étoiles »');
let x0 = s.etat.xp;
s = await profil({ action: 'sync', jeton: jetonB, jour: jourLocal(), termines: [{ jeu: 'robot-max', etoiles: 40, max: 72 }] });
verifier(s.gains.termines[0].statut === 'deja' && s.etat.xp === x0 && s.etat.jeux.find((j) => j.id === 'robot-max').etoiles === 50, 'rejouer moins bien : rien de plus, meilleur résultat gardé');
s = await profil({ action: 'sync', jeton: jetonB, jour: jourLocal(), termines: [{ jeu: 'robot-max', etoiles: 72, max: 72 }] });
verifier(s.etat.xp === x0 + 22 * R.XP_PAR_ETOILE && s.etat.jeux.find((j) => j.id === 'robot-max').etoiles === 72, 'rejouer mieux : seulement les étoiles en plus (sans cumul)', s.etat.xp - x0);
verifier(s.etat.badges.some((x) => x.id === 'etoiles-parfait'), 'badge « sans faute » (toutes les étoiles)');
x0 = s.etat.xp;
s = await profil({ action: 'sync', jeton: jetonB, jour: jourLocal(), termines: [{ jeu: 'sans-fin' }] });
verifier(s.gains.termines[0].statut === 'refuse', 'jeu « sans_fin » : refusé');
s = await profil({ action: 'sync', jeton: jetonB, jour: jourLocal(), temps: [{ jeu: 'glissade', secondes: 60 }] });
avancer(120000);
s = await profil({ action: 'sync', jeton: jetonB, jour: jourLocal(), temps: [{ jeu: 'glissade', secondes: 61 }], termines: [{ jeu: 'glissade' }] });
verifier(s.gains.termines[0].statut === 'ok' && s.etat.jeux.find((j) => j.id === 'glissade').max === null, 'jeu sans étoiles terminé (aucune étoile comptée)', s.gains.termines);
// Plafond du jour : 10 premières fins par jour.
for (let i = 1; i <= 14; i++) {
  avancer(70000);
  await profil({ action: 'sync', jeton: jetonB, jour: jourLocal(), temps: [{ jeu: `jeu-${i}`, secondes: 70 }] });
}
s = await profil({ action: 'sync', jeton: jetonB, jour: jourLocal(), termines: Array.from({ length: 14 }, (_, i) => ({ jeu: `jeu-${i + 1}` })) });
const plafond = s.gains.termines.filter((t) => t.statut === 'plafond').length;
verifier(plafond === 14 - (R.TERMINES_MAX_JOUR - 2) && s.etat.aujourdhui.termines === R.TERMINES_MAX_JOUR, `plafond de ${R.TERMINES_MAX_JOUR} jeux terminés par jour`, s.gains.termines.map((t) => t.statut));

// ==========================================================================
console.log('Code de sauvegarde (serveur)');
const code1 = await profil({ action: 'code', jeton: jetonB });
verifier(code1.statut === 200 && lireCode(code1.code).ok, 'code créé à la demande', code1);
verifier((await profil({ action: 'code', jeton: jetonB })).code === code1.code, 'le même code est redonné');
verifier((await profil({ action: 'restaurer', code: code1.code, turnstileToken: 'non' })).statut === 403, 'restauration sans Turnstile valide : refusée');
verifier((await profil({ action: 'restaurer', code: code1.code, turnstileToken: 'ok-vote' })).statut === 403, 'jeton Turnstile d\'une autre action : refusé');
const r1 = await profil({ action: 'restaurer', code: code1.code.toUpperCase(), turnstileToken: 'ok-code' }, { ip: '198.51.100.7' });
verifier(r1.statut === 200 && r1.etat.id === b.etat.id && r1.jeton !== jetonB, 'restauration : nouvel appareil relié au même profil', r1.statut);
const eB = await profil({ action: 'etat', jeton: jetonB });
verifier(eB.statut === 200, 'l\'ancien appareil garde son accès');
ipCourante = '192.0.2.50';
let dernier;
for (let i = 0; i < R.CODE_ESSAIS_RATES_HEURE; i++) dernier = await profil({ action: 'restaurer', code: nouveauCode(), turnstileToken: 'ok-code' });
verifier(dernier.statut === 429 && dernier.bloqueJusqua === maintenant + R.CODE_BLOCAGES_MINUTES[0] * 60000, `${R.CODE_ESSAIS_RATES_HEURE} essais ratés : blocage d'une heure`, dernier);
verifier((await profil({ action: 'restaurer', code: code1.code, turnstileToken: 'ok-code' })).statut === 429, 'pendant le blocage, même le bon code est refusé');
avancer(61 * 60000);
for (let i = 0; i < R.CODE_ESSAIS_RATES_HEURE; i++) dernier = await profil({ action: 'restaurer', code: 'mauvais-code', turnstileToken: 'ok-code' });
verifier(dernier.bloqueJusqua === maintenant + R.CODE_BLOCAGES_MINUTES[1] * 60000, 'récidive : blocage plus long (4 h)', dernier);
ipCourante = '203.0.113.9';
let limite = null;
for (let i = 0; i <= R.CODES_CREES_JOUR; i++) {
  const p = await profil({ action: 'creer', jour: jourLocal() });
  limite = await profil({ action: 'code', jeton: p.jeton });
}
verifier(limite.statut === 429, `création de codes limitée à ${R.CODES_CREES_JOUR} par adresse et par jour`, limite.statut);

// ==========================================================================
console.log('Pseudos');
ipCourante = '203.0.113.20';
let p = await profil({ action: 'pseudo', jeton: jetonA, pseudo: 'Lapin Bleu' });
verifier(p.statut === 200 && p.etat.pseudo === 'Lapin Bleu', 'pseudo accepté');
p = await profil({ action: 'pseudo', jeton: jetonB, pseudo: 'lapin-bleu' });
verifier(p.statut === 409 && p.raison === 'pris', 'pseudo déjà pris (sans tenir compte des majuscules et tirets)', p);
for (const [mauvais, raison] of [['M3rd3', 'grossier'], ['Admin', 'reserve'], ['Joueur4821', 'reserve'], ['ab', 'longueur'], ['tel0612345678', 'chiffres'], ['<b>x</b>', 'caracteres']]) {
  p = await profil({ action: 'pseudo', jeton: jetonB, pseudo: mauvais });
  verifier(p.statut === 400 && p.raison === raison, `« ${mauvais} » refusé (${raison})`, p);
}
// Signalements : 3 joueurs différents de niveau suffisant → pseudo par défaut.
const auteurs = [];
for (let i = 0; i < R.SIGNALEMENTS_MAX; i++) {
  const q = await profil({ action: 'creer', jour: jourLocal() });
  await DB.prepare('UPDATE profils SET xp = 1000, niveau = 7 WHERE id = ?').bind(q.etat.id).run();
  auteurs.push(q.jeton);
}
const novice = await profil({ action: 'creer', jour: jourLocal() });
verifier((await profil({ action: 'signaler', jeton: novice.jeton, cible: a.etat.id })).statut === 403, 'signalement refusé sous le niveau minimal');
for (const j of auteurs) await profil({ action: 'signaler', jeton: j, cible: a.etat.id });
await profil({ action: 'signaler', jeton: auteurs[0], cible: a.etat.id });
verifier((await profil({ action: 'etat', jeton: jetonA })).etat.pseudo === null, `${R.SIGNALEMENTS_MAX} signalements : le pseudo redevient « Joueur <nombre> »`);
p = await profil({ action: 'apparence', jeton: novice.jeton, avatar: 'dragon' });
verifier(p.statut === 400, 'avatar pas encore débloqué : refusé');
p = await profil({ action: 'apparence', jeton: auteurs[0], avatar: 'koala', cadre: 'bronze' });
verifier(p.statut === 200 && p.etat.avatar === 'koala' && p.etat.cadre === 'bronze', 'avatar et cadre débloqués : acceptés');

// ==========================================================================
console.log('Multijoueur : ticket et anti-triche');
const t1 = await profil({ action: 'ticket', jeton: jetonA, jeu: 'enclos-de-la-ferme', turnstileToken: 'ok-multi' });
verifier(t1.statut === 200 && typeof t1.ticket === 'string', 'ticket délivré après Turnstile', t1.statut);
verifier((await profil({ action: 'ticket', jeton: jetonA, jeu: 'robot-max', turnstileToken: 'ok-multi' })).statut === 400, 'pas de ticket pour un jeu qui n\'est pas multijoueur');
verifier((await profil({ action: 'ticket', jeton: jetonA, jeu: 'enclos-de-la-ferme', turnstileToken: 'non' })).statut === 403, 'pas de ticket sans Turnstile');
const lu = await verifierTicket('secret-multi', t1.ticket, 'enclos-de-la-ferme', maintenant);
verifier(lu?.profil === a.etat.id, 'ticket relu par le Worker : bon profil');
verifier(await verifierTicket('secret-multi', t1.ticket, 'autre-jeu', maintenant) === null, 'ticket d\'un autre jeu : refusé');
verifier(await verifierTicket('secret-multi', t1.ticket, 'enclos-de-la-ferme', maintenant + R.MULTI_TICKET_MINUTES * 60000 + 1) === null, 'ticket expiré : refusé');
verifier(await verifierTicket('autre-secret', t1.ticket, 'enclos-de-la-ferme', maintenant) === null, 'ticket signé avec un autre secret : refusé');
const [donnees, signature] = t1.ticket.split('.');
const falsifie = `${Buffer.from(JSON.stringify({ p: 1, j: 'enclos-de-la-ferme', e: maintenant + 1e9 })).toString('base64url')}.${signature}`;
verifier(await verifierTicket('secret-multi', falsifie, 'enclos-de-la-ferme', maintenant) === null && donnees, 'ticket modifié : refusé');
const forge = await signerTicket('secret-multi', { profil: 5, jeu: 'x', expiration: maintenant + 1000 });
verifier((await verifierTicket('secret-multi', forge, 'x', maintenant))?.profil === 5, 'signature et lecture symétriques');

const regles = { fin: (e) => (e.fini ? { classement: [1, 0, 2, 3], scores: [1, 2, 0, 0] } : null) };
const suivi = nouveauSuivi(1, maintenant - 120000);
suivi.actions = { cleA: 5, cleB: 1, cleC: 6 };
const sieges = ['cleA', 'cleC', null, 'cleB'];
const profils = (k) => ({ cleA: 11, cleB: 12, cleC: null }[k] ?? null);
let res = resultatsManche({ regles, etat: { fini: true }, sieges, profils, suivi, nom: 'enclos.uuid', jeu: 'enclos-de-la-ferme', maintenant });
verifier(res.length === 1 && res[0].profil === 11 && res[0].victoire === false && res[0].humains === 3 && res[0].partie === 'enclos.uuid#1', 'résultats : seuls les joueurs avec profil et assez de coups', res);
res = resultatsManche({ regles, etat: { fini: true }, sieges, profils, suivi: { ...suivi, debut: maintenant - 10000 }, nom: 'n', jeu: 'j', maintenant });
verifier(res.length === 0, 'manche trop courte : aucun résultat');
res = resultatsManche({ regles, etat: { fini: false }, sieges, profils, suivi, nom: 'n', jeu: 'j', maintenant });
verifier(res.length === 0, 'manche arrêtée sans résultat des règles : rien');
verifier(resultatsManche({ regles, etat: { fini: true }, sieges, profils, suivi: { ...suivi, rapportee: true }, nom: 'n', jeu: 'j', maintenant }).length === 0, 'une manche n\'est rapportée qu\'une fois');

const multi = (corps, secret = 'secret-multi') => appeler(apiMulti, corps, { entetes: { Authorization: `Bearer ${secret}` } });
const idA = a.etat.id;
const resultat = (n, extra = {}) => ({ partie: `p#${n}`, profil: idA, jeu: 'enclos-de-la-ferme', victoire: true, humains: 1, duree: 300, actions: 10, ...extra });
verifier((await multi({ resultats: [resultat(1)] }, 'mauvais')).statut === 401, 'résultats sans le bon secret : refusés');
const xpA = (await profil({ action: 'etat', jeton: jetonA })).etat.xp;
let m = await multi({ resultats: [resultat(1), resultat(1)] });
verifier(m.statuts[0] === 'ok' && m.statuts[1] === 'deja', 'un seul enregistrement par manche et par joueur', m.statuts);
let eA = (await profil({ action: 'etat', jeton: jetonA })).etat;
verifier(eA.xp === xpA + R.MULTI_XP_VICTOIRE_ROBOTS && eA.badges.some((x) => x.id === 'multi-robot') && eA.multi.robots === 1, 'victoire contre des robots : 20 XP et badge', eA.multi);
m = await multi({ resultats: [resultat(2, { duree: 5 }), resultat(3, { actions: 1 }), resultat(4, { jeu: 'robot-max' })] });
verifier(m.statuts.join() === 'court,court,inconnu', 'présence insuffisante ou jeu non multijoueur : ignorés', m.statuts);
m = await multi({ resultats: [resultat(5, { humains: 3 }), resultat(6, { humains: 2 })] });
eA = (await profil({ action: 'etat', jeton: jetonA })).etat;
verifier(eA.multi.humains === 2 && eA.multi.serie === 3 && eA.badges.some((x) => x.id === 'multi-serie') && eA.badges.some((x) => x.id === 'multi-victoires-3'), 'victoires contre de vrais joueurs, série de 3 : badges', eA.multi);
for (let i = 10; i < 30; i++) await multi({ resultats: [resultat(i, { humains: 2 })] });
const jourM = new Date(maintenant).toISOString().slice(0, 10);
const g = await DB.prepare('SELECT multi_xp FROM profils_gains WHERE profil = ? AND jour = ?').bind(idA, jourM).first();
verifier(g.multi_xp === R.MULTI_XP_MAX_JOUR, `plafond de ${R.MULTI_XP_MAX_JOUR} XP multijoueur par jour`, g);
m = await multi({ resultats: [resultat(40, { victoire: false })] });
eA = (await profil({ action: 'etat', jeton: jetonA })).etat;
verifier(eA.multi.serie === 0, 'défaite : la série de victoires repart de zéro');

// ==========================================================================
console.log('Classement');
const cl = await appeler(apiClassement, { perimetre: 'general', periode: 'semaine', jeton: jetonA });
verifier(cl.statut === 200 && cl.debut === '2026-11-09' && cl.top.length > 0, 'semaine : depuis le lundi', cl.debut);
verifier(cl.top.every((l, i) => i === 0 || cl.top[i - 1].points >= l.points), 'top rangé par points décroissants');
verifier(cl.top.every((l) => l.niveau >= R.CLASSEMENT_NIVEAU_MIN), `seuls les profils de niveau ${R.CLASSEMENT_NIVEAU_MIN} ou plus`);
verifier(cl.moi?.id === idA && cl.moi.rang === cl.top.find((l) => l.id === idA)?.rang, 'position du joueur = sa ligne du top', cl.moi);
const mois = await appeler(apiClassement, { perimetre: 'general', periode: 'mois', jeton: jetonB });
verifier(mois.debut === '2026-11-01' && mois.top.some((l) => l.id === b.etat.id), 'mois : depuis le 1er, gains de la semaine précédente compris');
const cm = await appeler(apiClassement, { perimetre: 'multi:enclos-de-la-ferme', periode: 'semaine', jeton: jetonA });
verifier(cm.top.length === 1 && cm.top[0].id === idA && cm.top[0].points === R.MULTI_XP_MAX_JOUR, 'classement d\'un jeu multijoueur', cm.top);
verifier((await appeler(apiClassement, { perimetre: 'multi:robot-max', periode: 'semaine' })).statut === 400, 'périmètre d\'un jeu non multijoueur : refusé');
const ce = await appeler(apiClassement, { perimetre: 'etoiles', periode: 'mois', jeton: jetonB });
verifier(ce.top[0]?.id === b.etat.id && ce.top[0].points === 72, 'classement des étoiles (brutes)', ce.top[0]);

// ==========================================================================
console.log('Indicateurs de fidélisation et effacements');
maintenant = Date.UTC(2026, 10, 10, 7, 0);
const jours = await tacheQuotidienneProfil(env, maintenant);
verifier(jours.includes('2026-11-09'), 'indicateurs calculés jusqu\'à la veille', jours);
const ind = JSON.parse((await DB.prepare("SELECT donnees FROM fidelisation_jour WHERE jour = '2026-11-03'").first()).donnees);
verifier(ind.actifs === 1 && ind.retour.j1.jour === '2026-11-02' && ind.retour.j1.taille === 1 && ind.retour.j1.revenus === 1, 'retour à 1 jour : le profil créé la veille est revenu', ind.retour.j1);
const ind9 = JSON.parse((await DB.prepare("SELECT donnees FROM fidelisation_jour WHERE jour = '2026-11-09'").first()).donnees);
verifier(ind9.retour.j7.jour === '2026-11-02' && ind9.retour.j7.revenus === 1, 'retour à 7 jours', ind9.retour.j7);
verifier(ind9.multi.manches > 0 && ind9.multi.contreRobots >= 1, 'parties en ligne comptées', ind9.multi);
verifier(ind9.codes.crees >= 1 && ind9.codes.restaurations === 1 && ind9.codes.profilsCrees >= 2, 'codes créés et restaurations comptés', ind9.codes);
maintenant += (R.PROFIL_INACTIF_JOURS + 1) * JOUR;
await tacheQuotidienneProfil(env, maintenant);
const restants = await DB.prepare('SELECT (SELECT COUNT(*) FROM profils) AS p, (SELECT COUNT(*) FROM profils_jeux) AS j, (SELECT COUNT(*) FROM profils_appareils) AS a').first();
verifier(restants.p === 0 && restants.j === 0 && restants.a === 0, 'profils inactifs depuis 2 ans effacés avec leurs données', restants);

Date.now = vraiNow;
console.log(echecs ? `\n${echecs} test(s) en échec.` : '\nProfil joueur : tout est bon.');
process.exit(echecs ? 1 : 0);
