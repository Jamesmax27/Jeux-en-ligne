// ==========================================================================
// POST /api/moderation — abus signalé par la modération IA
// (.github/workflows/moderation-demande.yml), jamais par un navigateur.
//
// En-tête : Authorization: Bearer <MODERATION_SECRET> (secret partagé :
//           même valeur dans Cloudflare et dans les secrets GitHub).
// Corps   : { "issue": <n° de l'issue>, "motif": "insulte" | "spam" }
//
// Retrouve l'empreinte de l'auteur de la demande (table demandes_issues) et lui
// compte un abus, daté du moment de la demande : 3 abus en 24 h → blocage de
// 7 jours ; abus après un blocage → bannissement (functions/_demandes.js).
//
// Réponse : { "ok": true, "etat": "bloque" | "banni" | null } ;
//           { "ok": true, "inconnue": true } si l'issue n'a pas d'auteur connu
//           (issue créée à la main, ou plus de 13 mois) ;
//           { "ok": true, "deja": true } si cet abus est déjà compté.
// ==========================================================================

import { json, bonSecret } from '../_commun.js';
import { MOTIFS_IA, preparerTables, auteurIssue, abusDejaNote, noterAbus } from '../_demandes.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ erreur: 'Méthode non autorisée.' }, 405, { Allow: 'POST' });
  if (!env.MODERATION_SECRET || !env.DB) {
    console.error('MODERATION_SECRET ou la base DB ne sont pas configurés.');
    return json({ erreur: 'Indisponible.' }, 503);
  }
  if (!(await bonSecret(request, env.MODERATION_SECRET))) return json({ erreur: 'Accès refusé.' }, 401);

  let corps;
  try {
    corps = await request.json();
  } catch {
    return json({ erreur: 'Requête invalide.' }, 400);
  }
  const issue = Number(corps?.issue);
  if (!Number.isInteger(issue) || issue <= 0) return json({ erreur: 'Numéro d\'issue invalide.' }, 400);
  if (!MOTIFS_IA.includes(corps?.motif)) return json({ erreur: 'Motif invalide.' }, 400);

  try {
    await preparerTables(env);
    const lien = await auteurIssue(env, issue);
    if (!lien) return json({ ok: true, inconnue: true });
    // Modération relancée sur la même issue : l'abus n'est compté qu'une fois.
    if (await abusDejaNote(env, issue)) return json({ ok: true, deja: true });
    const etat = await noterAbus(env, lien.visiteur, corps.motif, Number(lien.date), Date.now(), issue);
    return json({ ok: true, etat });
  } catch (erreur) {
    console.error('Abus non enregistré :', erreur);
    return json({ erreur: 'Indisponible.' }, 503);
  }
}
