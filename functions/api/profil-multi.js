// ==========================================================================
// POST /api/profil-multi — résultats des manches en ligne (profil joueur)
// Appelé par le Worker multijoueur (multijoueur/src/partie.js), jamais par un
// navigateur : en multijoueur, c'est le serveur qui valide et enregistre le
// résultat (docs/cadrage-fidelisation.md, section 8).
//
// En-tête : Authorization: Bearer <MULTI_SECRET> (même secret dans Cloudflare
//           Pages et dans le Worker ; il signe aussi les tickets d'entrée).
// Corps : { "resultats": [ { "partie": "<nom de la partie>#<manche>", "profil": n,
//           "jeu": "<id>", "victoire": bool, "humains": n, "duree": s, "actions": n } ] }
// Chaque résultat n'est enregistré qu'une fois par manche et par joueur
// (multi_resultats) ; manche trop courte ou trop peu de coups : ignorée ;
// XP plafonnée par jour (public/profil-reglages.js).
//
// Réponse : { "ok": true, "statuts": ["ok" | "deja" | "court" | "inconnu" | "invalide", …] }
// ==========================================================================

import { json, bonSecret, lireJeux } from '../_commun.js';
import { preparerTablesProfil, appliquerResultatMulti } from '../_profil.js';

export async function onRequestPost({ request, env }) {
  if (!env.MULTI_SECRET || !env.DB) return json({ erreur: 'Indisponible.' }, 503);
  if (!(await bonSecret(request, env.MULTI_SECRET))) return json({ erreur: 'Accès refusé.' }, 401);
  let corps;
  try {
    corps = await request.json();
  } catch {
    return json({ erreur: 'Requête invalide.' }, 400);
  }
  const resultats = Array.isArray(corps?.resultats) ? corps.resultats.slice(0, 20) : [];
  try {
    await preparerTablesProfil(env);
    const catalogue = await lireJeux(env, request);
    const maintenant = Date.now();
    const statuts = [];
    for (const r of resultats) statuts.push(await appliquerResultatMulti(env, r, catalogue, maintenant));
    return json({ ok: true, statuts });
  } catch (erreur) {
    console.error('Résultats multijoueur non enregistrés :', erreur);
    return json({ erreur: 'Indisponible pour le moment.' }, 503);
  }
}
