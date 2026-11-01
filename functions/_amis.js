// ==========================================================================
// Amis, présence et classement entre amis — logique du serveur, utilisée par
// functions/api/amis.js (et par les tests, scripts/tester-amis.mjs). Ce
// fichier n'exporte aucun onRequest… : il ne crée aucune adresse.
// Référence : docs/consigne-amis.md ; réglages : public/profil-reglages.js.
//
// Une amitié relie deux profils anonymes (numéros de la table profils), sans
// aucune donnée personnelle. On ajoute un ami en tapant son pseudo exact
// (pas de recherche, pas de liste de joueurs) ; il accepte ou refuse.
// Tout est décidé ici : le navigateur ne fait qu'afficher.
//
// Tables (créées par preparerTablesProfil, functions/_profil.js ; référence :
// migrations/0003_amis.sql) :
//   amis           une ligne par profil et par autre profil, vue de ce profil :
//                  'envoyee' (demande envoyée), 'recue' (demande reçue),
//                  'ami' (amitié acceptée, les deux lignes), 'bloque' (j'ai
//                  bloqué l'autre ; sa ligne vers moi est effacée)
//   amis_reglages  réglages d'un profil : invisible (se montrer hors ligne)
// La présence (en ligne, en jeu, partie en cours) n'est jamais écrite dans D1 :
// elle vit dans le Durable Object « Presence » du Worker multijoueur
// (multijoueur/src/presence.js), lu ici en une seule requête pour toute la liste.
// ==========================================================================

import * as R from '../public/profil-reglages.js';
import { ID_JEU, formeUnique, compterLimite, noterLimite, compterEvenement, requetePoints, debutPeriode } from './_profil.js';
import { signerTicket } from '../multijoueur/src/ticket.js';

const HEURE_MS = 3600000;
const JOUR_MS = 86400000;
export const TICKET_PRESENCE = '@presence';                     // « jeu » du ticket de présence (jamais un vrai jeu)
export const RE_PARTIE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// --- Lecture ------------------------------------------------------------------

const resume = (l) => ({ id: l.id, pseudo: l.pseudo || null, numero: l.numero, avatar: l.avatar, cadre: l.cadre, niveau: R.niveauPourXp(l.xp) });

/** Ligne de la relation vue par « profil » vers « autre » (ou null). */
function lien(env, profil, autre) {
  return env.DB.prepare('SELECT etat, cree_le, maj_le FROM amis WHERE profil = ? AND autre = ?').bind(profil, autre).first();
}

/** Nombre de relations du profil par état : { ami, envoyee, recue, bloque }. */
export async function compter(env, id) {
  const { results } = await env.DB.prepare('SELECT etat, COUNT(*) AS n FROM amis WHERE profil = ? GROUP BY etat').bind(id).all();
  const c = { ami: 0, envoyee: 0, recue: 0, bloque: 0 };
  for (const l of results || []) c[l.etat] = l.n;
  return c;
}

/** Le profil s'est-il mis en mode invisible (se montrer hors ligne) ? */
export async function estInvisible(env, id) {
  const l = await env.DB.prepare('SELECT invisible FROM amis_reglages WHERE profil = ?').bind(id).first();
  return l?.invisible === 1;
}

/**
 * Toutes les relations du profil, avec le pseudo, l'avatar et le niveau de
 * l'autre : { amis, recues, envoyees, bloques } (chacune triée).
 * Pour chaque ami : invisible (son réglage, pour ne jamais lire sa présence).
 */
export async function relations(env, id) {
  const { results } = await env.DB.prepare(`SELECT a.autre, a.etat, a.maj_le, p.id, p.pseudo, p.numero, p.avatar, p.cadre, p.xp, COALESCE(r.invisible, 0) AS invisible
    FROM amis a JOIN profils p ON p.id = a.autre LEFT JOIN amis_reglages r ON r.profil = a.autre
    WHERE a.profil = ? ORDER BY a.maj_le DESC`).bind(id).all();
  const sortie = { amis: [], recues: [], envoyees: [], bloques: [] };
  const rubrique = { ami: 'amis', recue: 'recues', envoyee: 'envoyees', bloque: 'bloques' };
  for (const l of results || []) {
    const r = rubrique[l.etat];
    if (!r) continue;
    sortie[r].push({ ...resume(l), depuis: l.maj_le, ...(l.etat === 'ami' ? { invisible: l.invisible === 1 } : {}) });
  }
  return sortie;
}

// --- Demandes ---------------------------------------------------------------------

/**
 * Demande d'ami au pseudo exact « pseudo ». Renvoie { statut, ami? } :
 *   'envoyee'      demande envoyée ; 'acceptee' : l'autre avait déjà demandé, vous voilà amis ;
 *   'pseudo-requis' (il faut un pseudo à soi), 'niveau', 'limite-heure', 'inconnu'
 *   (aucun joueur avec ce pseudo), 'soi-meme', 'deja-ami', 'deja-envoyee',
 *   'bloque-par-toi', 'limite-amis', 'limite-attente', 'indisponible' (ce
 *   joueur ne peut pas recevoir de demande : il t'a bloqué, il a trop de
 *   demandes ou d'amis — sans dire lequel).
 * Chaque essai compte dans les limites par heure, même un pseudo inconnu :
 * on ne peut pas parcourir les pseudos.
 */
export async function demander(env, moi, pseudo, visiteur, maintenant) {
  if (!moi.pseudo) return { statut: 'pseudo-requis' };
  if (R.niveauPourXp(moi.xp) < R.AMIS_NIVEAU_MIN) return { statut: 'niveau' };
  const depuis = maintenant - HEURE_MS;
  const parProfil = `profil:${moi.id}`;
  if ((await compterLimite(env, parProfil, 'ami', depuis)) >= R.AMIS_ESSAIS_HEURE) return { statut: 'limite-heure' };
  if (visiteur && (await compterLimite(env, visiteur, 'ami', depuis)) >= R.AMIS_ESSAIS_HEURE_ADRESSE) return { statut: 'limite-heure' };
  await env.DB.batch([noterLimite(env, parProfil, 'ami', maintenant), ...(visiteur ? [noterLimite(env, visiteur, 'ami', maintenant)] : [])]);

  const norme = formeUnique(typeof pseudo === 'string' ? pseudo.slice(0, 64) : '');
  if (norme.length < R.PSEUDO_MIN) return { statut: 'inconnu' };
  const cible = await env.DB.prepare('SELECT * FROM profils WHERE pseudo_norm = ?').bind(norme).first();
  if (!cible) return { statut: 'inconnu' };
  if (cible.id === moi.id) return { statut: 'soi-meme' };

  const [mien, sien] = await Promise.all([lien(env, moi.id, cible.id), lien(env, cible.id, moi.id)]);
  if (mien?.etat === 'ami') return { statut: 'deja-ami' };
  if (mien?.etat === 'envoyee') return { statut: 'deja-envoyee' };
  if (mien?.etat === 'bloque') return { statut: 'bloque-par-toi' };
  if (sien?.etat === 'bloque') return { statut: 'indisponible' };
  // L'autre m'avait déjà demandé : ma demande vaut acceptation.
  if (mien?.etat === 'recue') {
    const r = await accepter(env, moi, cible.id, maintenant);
    return r.statut === 'ok' ? { statut: 'acceptee', ami: resume(cible) } : r;
  }
  const [miens, siens] = await Promise.all([compter(env, moi.id), compter(env, cible.id)]);
  if (miens.ami >= R.AMIS_MAX) return { statut: 'limite-amis' };
  if (miens.envoyee >= R.AMIS_ATTENTE_MAX) return { statut: 'limite-attente' };
  if (siens.recue >= R.AMIS_RECUES_MAX || siens.ami >= R.AMIS_MAX) return { statut: 'indisponible' };
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO amis (profil, autre, etat, cree_le, maj_le) VALUES (?, ?, 'envoyee', ?, ?)
      ON CONFLICT (profil, autre) DO UPDATE SET etat = 'envoyee', cree_le = excluded.cree_le, maj_le = excluded.maj_le`).bind(moi.id, cible.id, maintenant, maintenant),
    env.DB.prepare(`INSERT INTO amis (profil, autre, etat, cree_le, maj_le) VALUES (?, ?, 'recue', ?, ?)
      ON CONFLICT (profil, autre) DO UPDATE SET etat = 'recue', cree_le = excluded.cree_le, maj_le = excluded.maj_le`).bind(cible.id, moi.id, maintenant, maintenant),
    compterEvenement(env, 'ami-demande', maintenant),
  ]);
  return { statut: 'envoyee', ami: resume(cible) };
}

/** J'accepte la demande reçue de « autre ». Renvoie { statut: 'ok' | 'introuvable' | 'limite-amis' | 'limite-autre' }. */
export async function accepter(env, moi, autre, maintenant) {
  const mien = await lien(env, moi.id, autre);
  if (mien?.etat !== 'recue') return { statut: 'introuvable' };
  const [miens, siens] = await Promise.all([compter(env, moi.id), compter(env, autre)]);
  if (miens.ami >= R.AMIS_MAX) return { statut: 'limite-amis' };
  if (siens.ami >= R.AMIS_MAX) return { statut: 'limite-autre' };
  await env.DB.batch([
    env.DB.prepare("UPDATE amis SET etat = 'ami', maj_le = ? WHERE profil = ? AND autre = ?").bind(maintenant, moi.id, autre),
    env.DB.prepare(`INSERT INTO amis (profil, autre, etat, cree_le, maj_le) VALUES (?, ?, 'ami', ?, ?)
      ON CONFLICT (profil, autre) DO UPDATE SET etat = 'ami', maj_le = excluded.maj_le`).bind(autre, moi.id, maintenant, maintenant),
    compterEvenement(env, 'ami-accepte', maintenant),
  ]);
  return { statut: 'ok' };
}

/**
 * Efface la relation entre moi et « autre » (les deux lignes) si la mienne est
 * dans l'un des états permis : refuser (reçue), annuler (envoyée), retirer (ami).
 */
export async function effacer(env, moi, autre, etats) {
  const mien = await lien(env, moi.id, autre);
  if (!mien || !etats.includes(mien.etat)) return { statut: 'introuvable' };
  await env.DB.batch([
    env.DB.prepare('DELETE FROM amis WHERE profil = ? AND autre = ?').bind(moi.id, autre),
    env.DB.prepare("DELETE FROM amis WHERE profil = ? AND autre = ? AND etat != 'bloque'").bind(autre, moi.id),
  ]);
  return { statut: 'ok' };
}

/**
 * Je bloque « autre » (un joueur avec qui j'ai une relation : ami, demande
 * reçue ou envoyée) : l'amitié ou la demande disparaît, il ne voit plus ma
 * présence et ne peut plus m'envoyer de demande (il ne sait pas qu'il est bloqué).
 */
export async function bloquer(env, moi, autre, maintenant) {
  const mien = await lien(env, moi.id, autre);
  if (!mien) return { statut: 'introuvable' };
  if (mien.etat === 'bloque') return { statut: 'ok' };
  await env.DB.batch([
    env.DB.prepare("UPDATE amis SET etat = 'bloque', maj_le = ? WHERE profil = ? AND autre = ?").bind(maintenant, moi.id, autre),
    env.DB.prepare("DELETE FROM amis WHERE profil = ? AND autre = ? AND etat != 'bloque'").bind(autre, moi.id),
  ]);
  return { statut: 'ok' };
}

export async function debloquer(env, moi, autre) {
  const r = await env.DB.prepare("DELETE FROM amis WHERE profil = ? AND autre = ? AND etat = 'bloque'").bind(moi.id, autre).run();
  return { statut: r.meta?.changes ? 'ok' : 'introuvable' };
}

export function changerInvisible(env, moi, invisible, maintenant) {
  return env.DB.prepare(`INSERT INTO amis_reglages (profil, invisible, maj_le) VALUES (?, ?, ?)
    ON CONFLICT (profil) DO UPDATE SET invisible = excluded.invisible, maj_le = excluded.maj_le`).bind(moi.id, invisible ? 1 : 0, maintenant).run();
}

// --- Présence (Durable Object du Worker multijoueur) -------------------------------

/** Ticket de présence (signé, PRESENCE_TICKET_HEURES) : le navigateur le présente au serveur de présence. */
export function ticketPresence(env, profil, maintenant) {
  return signerTicket(env.MULTI_SECRET, { profil: profil.id, jeu: TICKET_PRESENCE, expiration: maintenant + R.PRESENCE_TICKET_HEURES * HEURE_MS });
}

/**
 * Présence des profils « ids » (amis acceptés et visibles du lecteur, contrôlés
 * par l'appelant), en une seule requête au serveur de présence.
 * Renvoie { presences: { <id>: { etat: 'site' | 'jeu', jeu, partie } } },
 * { tropTot: true, attendre } (lecture à moins de AMIS_ACTUALISER_MIN_S de la
 * précédente, contrôlé par profil) ou null (présence indisponible : mode dégradé).
 */
export async function lirePresences(env, lecteur, ids) {
  if (!R.PRESENCE_ACTIVE || !env.MULTI_SECRET) return null;
  try {
    const base = String(env.MULTI_API || 'https://multi.freemicrogames.com').replace(/\/+$/, '');
    const reponse = await fetch(`${base}/presence/lire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.MULTI_SECRET}` },
      body: JSON.stringify({ lecteur, ids }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined,
    });
    if (!reponse.ok) return null;
    const d = await reponse.json();
    if (d?.tropTot) return { tropTot: true, attendre: Number(d.attendre) || R.AMIS_ACTUALISER_MIN_S * 1000 };
    return d && typeof d.presences === 'object' ? { presences: d.presences } : null;
  } catch (erreur) {
    console.warn('Présence des amis indisponible :', erreur?.message || erreur);
    return null;
  }
}

/**
 * Ajoute la présence aux amis (liste de relations().amis ou lignes du
 * classement), seulement pour les amis acceptés visibles. catalogue : jeux
 * publiés (un jeu inconnu n'est pas montré). Renvoie l'état de la présence :
 * 'ok', 'trop-tot' (avec attendre) ou 'indisponible'.
 */
export async function ajouterPresence(env, lecteur, amis, catalogue) {
  const visibles = amis.filter((a) => !a.invisible).map((a) => a.id);
  // Un ami en mode invisible paraît simplement hors ligne (sa présence n'est jamais lue).
  for (const a of amis) if (a.invisible) a.presence = { etat: 'hors' };
  if (!visibles.length) return { presence: 'ok' };
  const lu = await lirePresences(env, lecteur, visibles);
  if (!lu) return { presence: 'indisponible' };
  if (lu.tropTot) return { presence: 'trop-tot', attendre: lu.attendre };
  for (const a of amis) {
    if (a.invisible) continue;
    const p = lu.presences[String(a.id)];
    if (!p || (p.etat !== 'site' && p.etat !== 'jeu')) { a.presence = { etat: 'hors' }; continue; }
    const jeu = p.etat === 'jeu' && typeof p.jeu === 'string' && ID_JEU.test(p.jeu) && (!catalogue || catalogue.has(p.jeu)) ? p.jeu : null;
    const partie = jeu && typeof p.partie === 'string' && RE_PARTIE.test(p.partie) && p.partie.startsWith(`${jeu}.`) ? p.partie : null;
    a.presence = jeu ? { etat: 'jeu', jeu, ...(partie ? { partie } : {}) } : { etat: 'site' };
  }
  return { presence: 'ok' };
}

// --- Classement entre amis ------------------------------------------------------------

/**
 * Classement de la période entre le profil et ses amis acceptés, avec le même
 * calcul que le classement général (requetePoints) : tout le groupe, points
 * nuls compris (on connaît ses amis : pas de niveau minimal).
 * Renvoie [{ rang, id, pseudo, numero, avatar, cadre, niveau, points, invisible }].
 */
export async function classementAmis(env, moi, perimetre, debut, membres) {
  const ids = [moi.id, ...membres.map((m) => m.id)];
  const { sql, valeurs } = requetePoints(perimetre, debut);
  const marques = ids.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(`SELECT p.id, p.pseudo, p.numero, p.avatar, p.cadre, p.xp, COALESCE(g.points, 0) AS points
    FROM profils p LEFT JOIN (${sql}) g ON g.profil = p.id WHERE p.id IN (${marques}) ORDER BY points DESC, p.id`).bind(...valeurs, ...ids).all();
  const invisibles = new Set(membres.filter((m) => m.invisible).map((m) => m.id));
  let rang = 0;
  let precedent = null;
  return (results || []).map((l, i) => {
    if (l.points !== precedent) { rang = i + 1; precedent = l.points; }
    return { rang, ...resume(l), points: l.points, ...(l.id !== moi.id ? { ami: true, invisible: invisibles.has(l.id) } : {}) };
  });
}

/** Empreinte courte d'une liste d'identifiants (clé du cache du classement entre amis). */
export async function empreinteGroupe(ids) {
  const texte = [...ids].sort((a, b) => a - b).join(',');
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fmg/amis/${texte}`));
  return [...new Uint8Array(octets)].slice(0, 12).map((o) => o.toString(16).padStart(2, '0')).join('');
}

export { debutPeriode, JOUR_MS };
