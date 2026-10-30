// ==========================================================================
// POST /api/classement — classement des joueurs (page /classement/, …)
//
// Corps : { "perimetre": "general" | "etoiles" | "multi:<id du jeu>",
//           "periode": "semaine" | "mois", "jeton": "…" (facultatif) }
//   general : XP gagnée sur la période ; etoiles : étoiles gagnées sur la
//   période (meilleurs résultats améliorés) ; multi:<jeu> : XP des manches en
//   ligne de ce jeu multijoueur.
// Période : semaine en cours (depuis lundi, UTC) ou mois en cours : remise à
// zéro automatique au début de chaque période.
//
// Réponse : { perimetre, periode, debut, top: [{ rang, id, pseudo, numero,
//   avatar, cadre, niveau, points }], moi: { id, rang, points } | null }
// Le top (100 joueurs) est gardé 5 minutes dans le cache de Cloudflare ; la
// position du joueur (avec son jeton) est calculée à chaque demande.
// Profils de niveau inférieur à CLASSEMENT_NIVEAU_MIN : absents (robots).
// ==========================================================================

import { json, lireJeux } from '../_commun.js';
import { preparerTablesProfil, profilParJeton, perimetreValide, debutPeriode, topClassement, rangDe } from '../_profil.js';
import * as R from '../../public/profil-reglages.js';

export async function onRequestPost({ request, env, waitUntil }) {
  let corps;
  try {
    corps = await request.json();
  } catch {
    return json({ erreur: 'Requête invalide.' }, 400);
  }
  const perimetre = corps?.perimetre || 'general';
  const periode = R.CLASSEMENT_PERIODES.includes(corps?.periode) ? corps.periode : R.CLASSEMENT_PERIODES[0];
  if (!env.DB) return json({ erreur: 'Classement indisponible.' }, 503);
  try {
    const catalogue = await lireJeux(env, request);
    if (!perimetreValide(perimetre, catalogue)) return json({ erreur: 'Classement inconnu.' }, 400);
    await preparerTablesProfil(env);
    const maintenant = Date.now();
    const debut = debutPeriode(periode, maintenant);

    // Top : cache de Cloudflare (clé propre à la période), 5 minutes.
    const cle = new Request(new URL(`/api/classement?p=${encodeURIComponent(perimetre)}&d=${debut}&per=${periode}`, request.url));
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    let top = null;
    const garde = cache ? await cache.match(cle) : null;
    if (garde) top = await garde.json();
    else {
      top = await topClassement(env, perimetre, debut);
      if (cache) {
        const reponse = new Response(JSON.stringify(top), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${R.CLASSEMENT_CACHE_S}` } });
        const ecriture = cache.put(cle, reponse);
        if (typeof waitUntil === 'function') waitUntil(ecriture); else await ecriture;
      }
    }

    let moi = null;
    const profil = corps?.jeton ? await profilParJeton(env, corps.jeton) : null;
    if (profil) moi = { id: profil.id, ...(await rangDe(env, perimetre, debut, profil)) };
    return json({ perimetre, periode, debut, top, moi });
  } catch (erreur) {
    console.error('Classement impossible :', erreur);
    return json({ erreur: 'Classement indisponible pour le moment.' }, 503);
  }
}
