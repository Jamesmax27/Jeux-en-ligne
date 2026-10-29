// ==========================================================================
// Demandes publiques (formulaire /proposer/) : limites, abus, blocages,
// format des issues GitHub et actions de la page privée /idees.
//
// Utilisé par functions/api/demandes.js (envoi public), functions/api/moderation.js
// (abus signalés par la modération IA), functions/api/idees.js (onglet
// « Demandes publiques ») et scripts/moderation.mjs (workflow de modération).
// Ce fichier n'exporte aucun onRequest… : il ne crée aucune adresse.
//
// Circuit complet : DEMANDES.md.
//   1. /api/demandes crée une issue « [Public] … » (étiquettes demande-publique
//      et en-attente-ia) ;
//   2. .github/workflows/moderation-demande.yml : l'IA la refuse (refuse-ia,
//      fermée) ou la valide (valide-ia, avis de l'IA ajouté en fin de corps) ;
//   3. /idees, onglet « Demandes publiques » : Accepter (accepte) → nouveau jeu :
//      l'issue devient une idée perso (idee-perso, fabriquée en priorité par la
//      boucle de nuit) ; bug ou modification : étiquette demande-ia (traitée
//      aussitôt par demande-modification.yml). Refuser : refuse-humain, fermée.
//
// Données gardées dans D1 (base DB ; tables créées ici si elles manquent,
// rappel dans schema.sql) — jamais d'adresse IP, seulement son empreinte
// (empreinteVisiteur, functions/_commun.js) :
//   demandes_envois   une ligne par demande transmise (limite de débit), 2 jours
//   demandes_issues   issue ↔ empreinte, pour relier un refus de l'IA à son
//                     auteur et pour « Refuser et bannir », 13 mois
//   demandes_abus     un abus par ligne (piège rempli, anti-robot refusé,
//                     insulte ou spam refusés par l'IA), 90 jours
//   demandes_blocages état d'une empreinte : bloque (jusqu'à une date), banni,
//                     libre (débloquée ou blocage passé : on se souvient du
//                     nombre de blocages pour la récidive)
// ==========================================================================

import { appelGitHub } from './_commun.js';
import { IDS_GENRES, IDS_UNIVERS, UNIVERS_MAX, AGES } from '../public/taxonomie.js';
import { nettoyerTitre, nettoyerDescription, TYPES_AVEC_JEU } from '../public/demandes-regles.js';

// --- Réglages ------------------------------------------------------------------

export const ENVOIS_HEURE = 3;            // demandes transmises par heure et par empreinte
export const ENVOIS_JOUR = 10;            // … et par jour (24 h glissantes)
export const ABUS_SEUIL = 3;              // abus en ABUS_FENETRE → blocage
export const ABUS_FENETRE = 24 * 3600000; // 24 h
export const BLOCAGE_DUREE = 7 * 86400000; // 7 jours
// Récidive : abus commis après le début d'un blocage (pendant ou après) qui
// mènent au bannissement définitif. 1 = le premier abus après un blocage.
export const RECIDIVE_SEUIL = 1;
// Abus que la modération IA peut signaler (functions/api/moderation.js).
export const MOTIFS_IA = ['insulte', 'spam'];

const GARDE_ENVOIS = 2 * 86400000;
const GARDE_ABUS = 90 * 86400000;
const GARDE_ISSUES = 395 * 86400000;      // 13 mois, comme les parties (politique de confidentialité)
const GARDE_LIBRES = 365 * 86400000;

// Étiquettes GitHub du circuit (créées par moderation-demande.yml si elles manquent).
export const ETIQUETTES = {
  publique: 'demande-publique',
  attenteIa: 'en-attente-ia',
  valideIa: 'valide-ia',
  refuseIa: 'refuse-ia',
  accepte: 'accepte',
  refuseHumain: 'refuse-humain',
  // Circuits existants rejoints après acceptation.
  ideePerso: 'idee-perso',        // boucle-de-nuit.yml, étape b
  demandeIa: 'demande-ia',        // demande-modification.yml
};

// Âges permis pour une idée : bornes de la liste AGES de public/taxonomie.js
// (mêmes valeurs que la page /idees et le formulaire GitHub), de 4+ à 13+.
export const AGE_MIN = parseInt(AGES[0], 10);
export const AGE_MAX = parseInt(AGES[AGES.length - 1], 10);

// --- Tables D1 -------------------------------------------------------------------

let tablesPretes = null;

/** Crée les tables si elles manquent (une fois par instance). */
export function preparerTables(env) {
  if (!tablesPretes) {
    tablesPretes = env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS demandes_envois (visiteur TEXT NOT NULL, date INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS demandes_envois_visiteur ON demandes_envois (visiteur, date)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS demandes_issues (issue INTEGER PRIMARY KEY, visiteur TEXT NOT NULL, date INTEGER NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS demandes_abus (visiteur TEXT NOT NULL, date INTEGER NOT NULL, motif TEXT NOT NULL, issue INTEGER)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS demandes_abus_visiteur ON demandes_abus (visiteur, date)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS demandes_blocages (
        visiteur TEXT PRIMARY KEY, statut TEXT NOT NULL, debut INTEGER, jusqu_a INTEGER, motif TEXT,
        abus INTEGER NOT NULL DEFAULT 0, blocages INTEGER NOT NULL DEFAULT 0, maj INTEGER NOT NULL)`),
    ]).catch((erreur) => {
      tablesPretes = null; // nouvel essai à la prochaine requête
      throw erreur;
    });
  }
  return tablesPretes;
}

// --- Blocages et abus ------------------------------------------------------------

/** « banni », « bloque » (blocage en cours) ou null. */
export async function etatBlocage(env, visiteur, maintenant = Date.now()) {
  const ligne = await env.DB.prepare('SELECT statut, jusqu_a FROM demandes_blocages WHERE visiteur = ?').bind(visiteur).first();
  if (!ligne) return null;
  if (ligne.statut === 'banni') return 'banni';
  if (ligne.statut === 'bloque' && Number(ligne.jusqu_a) > maintenant) return 'bloque';
  return null;
}

/**
 * Compte un abus de cette empreinte, daté de dateAbus (moment de la demande en
 * cause : une insulte envoyée avant un blocage et refusée par l'IA après n'est
 * pas une récidive). Puis :
 *   - déjà bloquée une fois et RECIDIVE_SEUIL abus depuis le début du dernier
 *     blocage → bannie définitivement ;
 *   - sinon ABUS_SEUIL abus sur ABUS_FENETRE → bloquée BLOCAGE_DUREE.
 * issue : numéro de l'issue en cause (abus signalé par la modération IA).
 * Renvoie le nouvel état : « banni », « bloque » ou null.
 */
export async function noterAbus(env, visiteur, motif, dateAbus = Date.now(), maintenant = Date.now(), issue = null) {
  await env.DB.prepare('INSERT INTO demandes_abus (visiteur, date, motif, issue) VALUES (?, ?, ?, ?)').bind(visiteur, dateAbus, motif, issue).run();
  const ligne = await env.DB.prepare('SELECT * FROM demandes_blocages WHERE visiteur = ?').bind(visiteur).first();
  const total = Number(ligne?.abus || 0) + 1;

  if (ligne?.statut === 'banni') {
    await env.DB.prepare('UPDATE demandes_blocages SET abus = ?, maj = ? WHERE visiteur = ?').bind(total, maintenant, visiteur).run();
    return 'banni';
  }

  if (Number(ligne?.blocages || 0) > 0 && ligne.debut != null) {
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM demandes_abus WHERE visiteur = ? AND date >= ?').bind(visiteur, ligne.debut).first();
    if (Number(n) >= RECIDIVE_SEUIL) {
      await env.DB.prepare('UPDATE demandes_blocages SET statut = ?, jusqu_a = NULL, motif = ?, abus = ?, maj = ? WHERE visiteur = ?')
        .bind('banni', `récidive (${motif})`, total, maintenant, visiteur).run();
      return 'banni';
    }
  }

  const enCours = ligne?.statut === 'bloque' && Number(ligne.jusqu_a) > maintenant;
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM demandes_abus WHERE visiteur = ? AND date > ?').bind(visiteur, maintenant - ABUS_FENETRE).first();
  if (!enCours && Number(n) >= ABUS_SEUIL) {
    await env.DB.prepare(`INSERT INTO demandes_blocages (visiteur, statut, debut, jusqu_a, motif, abus, blocages, maj)
        VALUES (?, 'bloque', ?, ?, ?, ?, 1, ?)
        ON CONFLICT (visiteur) DO UPDATE SET statut = 'bloque', debut = excluded.debut, jusqu_a = excluded.jusqu_a,
          motif = excluded.motif, abus = excluded.abus, blocages = demandes_blocages.blocages + 1, maj = excluded.maj`)
      .bind(visiteur, maintenant, maintenant + BLOCAGE_DUREE, `${ABUS_SEUIL} abus en 24 h (${motif})`, total, maintenant).run();
    return 'bloque';
  }

  await env.DB.prepare(`INSERT INTO demandes_blocages (visiteur, statut, abus, blocages, maj) VALUES (?, 'libre', ?, 0, ?)
      ON CONFLICT (visiteur) DO UPDATE SET abus = excluded.abus, maj = excluded.maj`).bind(visiteur, total, maintenant).run();
  return enCours ? 'bloque' : null;
}

/** Bannissement à la main (page /idees). */
export async function bannir(env, visiteur, motif, maintenant = Date.now()) {
  await env.DB.prepare(`INSERT INTO demandes_blocages (visiteur, statut, debut, motif, abus, blocages, maj)
      VALUES (?, 'banni', ?, ?, 0, 0, ?)
      ON CONFLICT (visiteur) DO UPDATE SET statut = 'banni', jusqu_a = NULL, motif = excluded.motif, maj = excluded.maj`)
    .bind(visiteur, maintenant, motif, maintenant).run();
}

/** Déblocage à la main : on repart de zéro (abus et blocages oubliés). */
export async function debloquer(env, visiteur, maintenant = Date.now()) {
  await env.DB.batch([
    env.DB.prepare(`UPDATE demandes_blocages SET statut = 'libre', debut = NULL, jusqu_a = NULL, motif = 'débloquée à la main',
      abus = 0, blocages = 0, maj = ? WHERE visiteur = ?`).bind(maintenant, visiteur),
    env.DB.prepare('DELETE FROM demandes_abus WHERE visiteur = ?').bind(visiteur),
  ]);
}

/** Empreintes bloquées (blocage en cours) ou bannies, les plus récentes d'abord. */
export async function listerBlocages(env, maintenant = Date.now()) {
  const { results } = await env.DB.prepare(`SELECT visiteur, statut, debut, jusqu_a, motif, abus, maj FROM demandes_blocages
      WHERE statut = 'banni' OR (statut = 'bloque' AND jusqu_a > ?) ORDER BY maj DESC LIMIT 200`).bind(maintenant).all();
  return results || [];
}

// --- Limite de débit ---------------------------------------------------------------

/** Demandes transmises dans la dernière heure et les dernières 24 h. */
export async function compterEnvois(env, visiteur, maintenant = Date.now()) {
  const ligne = await env.DB.prepare(`SELECT SUM(date > ?) AS heure, COUNT(*) AS jour FROM demandes_envois
      WHERE visiteur = ? AND date > ?`).bind(maintenant - 3600000, visiteur, maintenant - 86400000).first();
  return { heure: Number(ligne?.heure || 0), jour: Number(ligne?.jour || 0) };
}

/** Enregistre une demande transmise (issue créée) et son lien avec l'empreinte. */
export async function noterEnvoi(env, visiteur, issue, maintenant = Date.now()) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO demandes_envois (visiteur, date) VALUES (?, ?)').bind(visiteur, maintenant),
    env.DB.prepare('INSERT OR REPLACE INTO demandes_issues (issue, visiteur, date) VALUES (?, ?, ?)').bind(issue, visiteur, maintenant),
  ]);
}

/** Empreinte et date de la demande d'une issue, ou null. */
export async function auteurIssue(env, issue) {
  return env.DB.prepare('SELECT visiteur, date FROM demandes_issues WHERE issue = ?').bind(issue).first();
}

/** Un abus a-t-il déjà été compté pour cette issue (modération relancée) ? */
export async function abusDejaNote(env, issue) {
  return !!(await env.DB.prepare('SELECT 1 AS oui FROM demandes_abus WHERE issue = ? LIMIT 1').bind(issue).first());
}

/** Efface ce qui a dépassé sa durée de conservation. */
export async function purger(env, maintenant = Date.now()) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM demandes_envois WHERE date < ?').bind(maintenant - GARDE_ENVOIS),
    env.DB.prepare('DELETE FROM demandes_abus WHERE date < ?').bind(maintenant - GARDE_ABUS),
    env.DB.prepare('DELETE FROM demandes_issues WHERE date < ?').bind(maintenant - GARDE_ISSUES),
    env.DB.prepare("DELETE FROM demandes_blocages WHERE statut = 'libre' AND maj < ?").bind(maintenant - GARDE_LIBRES),
  ]);
}

// --- Format des issues ---------------------------------------------------------------

/**
 * Texte d'un visiteur rendu inoffensif dans une issue GitHub : pas de mention
 * (@nom), pas de balise ni de commentaire HTML (il ne peut pas imiter l'avis de
 * l'IA), pas de ligne qui ressemble à une rubrique (« ### … ») ou à la fin du
 * corps (« --- ») : les workflows lisent ces repères.
 */
export function neutraliser(texte) {
  return String(texte ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@/g, '@​')
    .replace(/^([ \t]*)#/gm, '$1\\#')
    .replace(/^([ \t]*)([-_*=]{3,}[ \t]*)$/gm, '$1\\$2');
}

// Opération inverse (affichage dans /idees, texte de l'idée transmise à la boucle de nuit).
export function retablir(texte) {
  return String(texte ?? '')
    .replace(/@​/g, '@')
    .replace(/^([ \t]*)\\#/gm, '$1#')
    .replace(/^([ \t]*)\\([-_*=]{3,}[ \t]*)$/gm, '$1$2')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const NOMS_TYPES = { nouveau: 'Nouveau jeu', bug: 'Bug', modification: 'Modification' };

// Le titre d'une issue est du texte brut (pas de Markdown, pas de mention) : il n'est pas neutralisé.
export const titreIssuePublique = (type, titre) => `[Public] ${NOMS_TYPES[type]} : ${nettoyerTitre(titre)}`;

/**
 * Corps de l'issue d'une demande publique. « Demande » doit rester juste avant
 * « Auteur » : demande-modification.yml lit le texte entre les deux, et
 * l'identifiant du jeu sur la première ligne de « Jeu ».
 */
export function corpsDemandePublique({ type, jeu, titre, description, date }) {
  const t = neutraliser(nettoyerTitre(titre));
  return [
    '### Type', '', type, '',
    '### Jeu', '', TYPES_AVEC_JEU.includes(type) ? jeu : '_Aucun (nouveau jeu)_', '',
    '### Titre', '', t, '',
    '### Date', '', new Date(date).toISOString().replace(/\.\d{3}Z$/, 'Z'), '',
    '### Demande', '', `**${t}**`, '', neutraliser(nettoyerDescription(description)), '',
    '### Auteur', '', 'Visiteur anonyme (formulaire public)', '',
    '---',
    "_Demande envoyée depuis le formulaire public du site. L'IA la modère (moderation-demande.yml), puis elle attend une validation dans la page privée /idees (onglet « Demandes publiques »)._",
  ].join('\n');
}

// Avis de l'IA, ajouté en fin de corps par moderation-demande.yml : JSON en
// base64 (UTF-8) dans un commentaire HTML, invisible sur GitHub.
const RE_MODERATION = /<!--\s*moderation-ia:([A-Za-z0-9+/=]+)\s*-->/;

export function blocModeration(avis) {
  const octets = new TextEncoder().encode(JSON.stringify(avis));
  let binaire = '';
  for (const o of octets) binaire += String.fromCharCode(o);
  return `<!-- moderation-ia:${btoa(binaire)} -->`;
}

export function lireModeration(corps) {
  const m = RE_MODERATION.exec(String(corps ?? ''));
  if (!m) return null;
  try {
    const octets = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(octets));
  } catch {
    return null;
  }
}

/**
 * Lecture du corps d'une issue publique (format de corpsDemandePublique).
 * Les textes rendus sont ceux du visiteur (retablir). Les rubriques absentes
 * donnent des chaînes vides.
 */
export function lireDemandePublique(corps) {
  const texte = String(corps ?? '').replace(/\r\n?/g, '\n');
  const entetes = [...texte.matchAll(/^###[ \t]*(Type|Jeu|Titre|Date|Demande|Auteur)[ \t]*$/gm)];
  const rubrique = (nom) => {
    const k = entetes.findIndex((m) => m[1] === nom);
    if (k < 0) return '';
    const fin = k + 1 < entetes.length ? entetes[k + 1].index : texte.length;
    return texte.slice(entetes[k].index + entetes[k][0].length, fin).replace(/\n-{3,}[ \t]*\n[\s\S]*$/, '').trim();
  };
  const premiere = (t) => (t.split('\n').find((l) => l.trim()) || '').trim();
  const titre = premiere(rubrique('Titre'));
  let description = rubrique('Demande');
  const enGras = `**${titre}**`;
  if (titre && description.startsWith(enGras)) description = description.slice(enGras.length).trim();
  const type = premiere(rubrique('Type'));
  const jeu = premiere(rubrique('Jeu'));
  return {
    type,
    jeu: TYPES_AVEC_JEU.includes(type) ? jeu : '',
    titre: retablir(titre),
    description: retablir(description),
    date: premiere(rubrique('Date')),
    moderation: lireModeration(texte),
  };
}

// --- Idée de jeu (format lu par la boucle de nuit) -------------------------------------

/**
 * Corps d'une issue « idee-perso » (page /idees ou demande publique acceptée).
 * « Description » doit rester juste avant « Auteur » : la boucle de nuit
 * (boucle-de-nuit.yml, étape b) lit le texte entre les deux.
 */
export function corpsIdee({ genre, ages, univers, description, auteur, pied }) {
  return [
    '### Genre', '', genre, '',
    '### Âge', '', ages, '',
    '### Univers', '', univers.length ? univers.join(', ') : '_Aucun univers_', '',
    '### Description', '', description || '_Aucune description_', '',
    '### Auteur', '', auteur, '',
    '---',
    pied || '_Idée envoyée depuis la page privée /idees. La boucle de nuit la fabrique en priorité, puis ferme cette issue avec le lien de la pull request du jeu._',
  ].join('\n');
}

/**
 * Contrôle du classement d'une idée (genre, âge « N+ », univers) : listes
 * fermées de public/taxonomie.js, mêmes règles que scripts/controle-taxonomie.mjs.
 * Renvoie null si tout est bon, sinon le message d'erreur.
 */
export function problemeClassement({ genre, ages, univers }) {
  if (!IDS_GENRES.includes(genre)) return 'Genre inconnu.';
  const age = /^\d{1,2}\+$/.test(String(ages ?? '')) ? parseInt(ages, 10) : NaN;
  if (!(age >= AGE_MIN && age <= AGE_MAX)) return `Choisis un âge conseillé, de ${AGE_MIN}+ à ${AGE_MAX}+.`;
  if (!Array.isArray(univers) || univers.some((u) => !IDS_UNIVERS.includes(u))) return 'Univers inconnu.';
  if (new Set(univers).size !== univers.length || univers.length > UNIVERS_MAX) return `${UNIVERS_MAX} univers au plus, sans doublon.`;
  if (univers.includes('autre') && univers.length > 1) return "L'univers « Autre » ne se combine pas avec un autre univers.";
  return null;
}

// --- Actions de la page privée /idees (onglet « Demandes publiques ») ---------------------

const nomEtiquette = (l) => (typeof l === 'string' ? l : l?.name);

/**
 * Demandes validées par l'IA et en attente d'une décision, plus le nombre de
 * demandes encore en modération. titreDe(id) : titre d'un jeu publié (ou null).
 */
export async function listerPubliques(env, titreDe) {
  const lister = (etiquette) => appelGitHub(env, 'GET',
    `/issues?state=open&labels=${ETIQUETTES.publique},${etiquette}&sort=created&direction=asc&per_page=100`);
  const [validees, enAttente] = await Promise.all([lister(ETIQUETTES.valideIa), lister(ETIQUETTES.attenteIa)]);
  if (!validees.ok || !enAttente.ok) return null;
  const demandes = [];
  for (const issue of validees.donnees || []) {
    if (issue.pull_request) continue;
    const d = lireDemandePublique(issue.body);
    demandes.push({
      numero: issue.number,
      url: issue.html_url,
      creee: issue.created_at,
      ...d,
      titreJeu: d.jeu ? (await titreDe(d.jeu)) || d.jeu : '',
    });
  }
  return { demandes, enModeration: (enAttente.donnees || []).filter((i) => !i.pull_request).length };
}

// Issue publique ouverte et validée par l'IA, sinon un message d'erreur.
async function issueAValider(env, numero) {
  if (!Number.isInteger(numero) || numero <= 0) return { erreur: 'Numéro de demande invalide.', statut: 400 };
  const r = await appelGitHub(env, 'GET', `/issues/${numero}`);
  if (!r.ok) return { erreur: 'Demande introuvable sur GitHub.', statut: r.statut === 404 ? 404 : 502 };
  const issue = r.donnees;
  const etiquettes = (issue.labels || []).map(nomEtiquette);
  if (!etiquettes.includes(ETIQUETTES.publique) || issue.pull_request) return { erreur: "Ce n'est pas une demande publique.", statut: 400 };
  if (issue.state !== 'open' || !etiquettes.includes(ETIQUETTES.valideIa)) {
    return { erreur: 'Cette demande a déjà été traitée : recharge la liste.', statut: 409 };
  }
  return { issue, etiquettes };
}

const commenter = (env, numero, texte) => appelGitHub(env, 'POST', `/issues/${numero}/comments`, { body: texte });
const retirerEtiquette = (env, numero, nom) => appelGitHub(env, 'DELETE', `/issues/${numero}/labels/${encodeURIComponent(nom)}`);

/**
 * Accepter une demande validée par l'IA.
 * - nouveau jeu : l'issue devient une idée perso (titre « Idée : … », corps au
 *   format de la boucle de nuit, étiquettes idee-perso et le genre) ;
 *   classement { genre, ages, univers } choisi dans /idees (proposé par l'IA) ;
 * - bug ou modification : étiquette demande-ia, qui lance aussitôt
 *   demande-modification.yml (le corps est déjà à son format).
 * Renvoie { ok } ou { erreur, statut }.
 */
export async function accepterPublique(env, { numero, classement, auteur }) {
  const v = await issueAValider(env, numero);
  if (v.erreur) return v;
  const d = lireDemandePublique(v.issue.body);

  if (d.type === 'nouveau') {
    const { genre, ages, univers } = classement || {};
    const probleme = problemeClassement({ genre, ages, univers });
    if (probleme) return { erreur: probleme, statut: 400 };
    const garder = v.etiquettes.filter((e) => ![ETIQUETTES.valideIa, ETIQUETTES.attenteIa, ETIQUETTES.ideePerso].includes(e) && !IDS_GENRES.includes(e));
    const corps = corpsIdee({
      genre, ages, univers,
      // Le texte du visiteur reste neutralisé (il est relu par les agents de nuit).
      description: neutraliser(d.description),
      auteur: `Visiteur anonyme (formulaire public, demande acceptée par ${auteur})`,
      pied: "_Proposition du formulaire public, acceptée dans /idees. La boucle de nuit la fabrique en priorité, comme les idées perso, puis ferme cette issue avec le lien de la pull request du jeu._",
    });
    const avis = d.moderation ? `\n${blocModeration(d.moderation)}` : '';
    const r = await appelGitHub(env, 'PATCH', `/issues/${numero}`, {
      title: `Idée : ${nettoyerTitre(d.titre)}`,
      body: corps + avis,
      labels: [...garder, ETIQUETTES.accepte, ETIQUETTES.ideePerso, genre],
    });
    if (!r.ok) return { erreur: "L'issue n'a pas pu être modifiée sur GitHub. Réessaie plus tard.", statut: 502 };
    await commenter(env, numero, `✅ **Acceptée** par ${auteur} : elle rejoint la file des idées perso (genre \`${genre}\`, âge ${ages}${univers.length ? `, univers ${univers.map((u) => `\`${u}\``).join(', ')}` : ''}). La boucle de nuit la fabriquera en priorité.`);
    return { ok: true };
  }

  if (TYPES_AVEC_JEU.includes(d.type)) {
    // D'abord accepte, puis demande-ia : c'est l'ajout de demande-ia qui lance le traitement.
    const r1 = await appelGitHub(env, 'POST', `/issues/${numero}/labels`, { labels: [ETIQUETTES.accepte] });
    if (!r1.ok) return { erreur: "L'issue n'a pas pu être modifiée sur GitHub. Réessaie plus tard.", statut: 502 };
    await retirerEtiquette(env, numero, ETIQUETTES.valideIa);
    await commenter(env, numero, `✅ **Acceptée** par ${auteur} : transmise à l'IA de modification des jeux (demande-modification.yml). Le résultat arrivera en commentaire.`);
    const r2 = await appelGitHub(env, 'POST', `/issues/${numero}/labels`, { labels: [ETIQUETTES.demandeIa] });
    if (!r2.ok) return { erreur: "Acceptée, mais l'étiquette demande-ia n'a pas pu être ajoutée : ajoute-la à la main sur GitHub.", statut: 502 };
    return { ok: true };
  }

  return { erreur: 'Type de demande illisible : à traiter à la main sur GitHub.', statut: 400 };
}

/**
 * Refuser une demande validée par l'IA (étiquette refuse-humain, issue fermée).
 * bannir : l'empreinte de son auteur est en plus bannie définitivement.
 */
export async function refuserPublique(env, { numero, bannir: aBannir, auteur }) {
  const v = await issueAValider(env, numero);
  if (v.erreur) return v;
  let banni = false;
  if (aBannir) {
    const lien = await auteurIssue(env, numero);
    if (lien?.visiteur) {
      await bannir(env, lien.visiteur, `banni à la main (demande #${numero})`);
      banni = true;
    }
  }
  const r = await appelGitHub(env, 'POST', `/issues/${numero}/labels`, { labels: [ETIQUETTES.refuseHumain] });
  if (!r.ok) return { erreur: "L'issue n'a pas pu être modifiée sur GitHub. Réessaie plus tard.", statut: 502 };
  await retirerEtiquette(env, numero, ETIQUETTES.valideIa);
  await commenter(env, numero, `❌ **Refusée** par ${auteur}${banni ? ' ; son auteur ne peut plus envoyer de demande.' : '.'}`);
  await appelGitHub(env, 'PATCH', `/issues/${numero}`, { state: 'closed', state_reason: 'not_planned' });
  return { ok: true, banni, auteurInconnu: !!aBannir && !banni };
}
