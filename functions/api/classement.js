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
//   + couronnes: [{ id, rang }] pour le classement général : podium de la période
//   précédente (couronne or, argent ou bronze à côté du pseudo, COURONNE_CHAMPION).
// Le top (100 joueurs) est gardé 5 minutes dans le cache de Cloudflare ; la
// position du joueur (avec son jeton) est calculée à chaque demande.
// Profils de niveau inférieur à CLASSEMENT_NIVEAU_MIN : absents (robots).
//
// Classement des étoiles d'un jeu (page du jeu, docs/cadrage-fidelisation.md, section 14.10) :
// Corps : { "perimetre": "jeu:<id du jeu>", "jeton": "…" (facultatif) } ; jeu à étoiles seulement.
//   Meilleur nombre d'étoiles de chaque joueur dans ce jeu, sans période ni remise à zéro ;
//   à égalité, le premier arrivé à ce score, puis le numéro de profil (une place par joueur).
// Réponse : { perimetre, max, top: [{ rang, id, pseudo, numero, avatar, cadre, niveau, points }],
//   moi: { id, rang, points } | null } ; points ≤ max (étoiles possibles du jeu, catalog.json).
//   Top (100 joueurs) gardé 5 minutes dans le cache de Cloudflare ; la position d'un joueur
//   n'est calculée que s'il est hors du top, et gardée 5 minutes elle aussi.
//
// Historique des podiums (3 premiers du classement général de chaque semaine
// et de chaque mois terminés, docs/cadrage-fidelisation.md, section 14.9) :
// Corps : { "type": "historique", "periode": "semaine" | "mois", "avant": "AAAA-MM-JJ" (facultatif) }
// Réponse : { periode, periodes: [{ debut, fin, podium: [{ rang, id, pseudo, numero,
//   avatar, cadre, niveau, points }] }], suite: "AAAA-MM-JJ" | null }
//   (id null : profil effacé depuis). Gardé 1 heure dans le cache de Cloudflare.
// Les podiums manquants (tâche quotidienne pas passée) sont enregistrés au passage.
// ==========================================================================

import { json, lireJeux } from '../_commun.js';
import {
  preparerTablesProfil, profilParJeton, perimetreValide, debutPeriode, topClassement, rangDe,
  jeuAEtoiles, topClassementJeu, rangJeu,
  assurerPodiums, couronnesPrecedentes, historiquePodiums, periodePrecedente,
} from '../_profil.js';
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
  if (corps?.type === 'historique') return historique(request, env, waitUntil, periode, corps.avant);
  try {
    const catalogue = await lireJeux(env, request);
    if (typeof perimetre === 'string' && perimetre.startsWith('jeu:')) return await classementJeu(request, env, waitUntil, perimetre, catalogue, corps?.jeton);
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
    let couronnes = [];
    if (perimetre === 'general' && R.COURONNE_CHAMPION) {
      try {
        await assurerPodiums(env, maintenant);
        couronnes = await couronnesPrecedentes(env, periode, maintenant);
      } catch (erreur) {
        console.error('Podiums indisponibles :', erreur); // le classement s'affiche quand même, sans couronne
      }
    }
    return json({ perimetre, periode, debut, top, moi, couronnes });
  } catch (erreur) {
    console.error('Classement impossible :', erreur);
    return json({ erreur: 'Classement indisponible pour le moment.' }, 503);
  }
}

// Lecture dans le cache de Cloudflare, sinon calcul puis mise en cache (duree en secondes).
async function avecCache(adresse, duree, waitUntil, calculer) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const garde = cache ? await cache.match(adresse) : null;
  if (garde) return garde.json();
  const donnees = await calculer();
  if (cache) {
    const ecriture = cache.put(adresse, new Response(JSON.stringify(donnees), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${duree}` } }));
    if (typeof waitUntil === 'function') waitUntil(ecriture); else await ecriture;
  }
  return donnees;
}

// Classement des étoiles d'un jeu : appelé dans le try de onRequestPost (503 en cas d'erreur).
async function classementJeu(request, env, waitUntil, perimetre, catalogue, jeton) {
  if (!catalogue) return json({ erreur: 'Classement indisponible pour le moment.' }, 503);
  const jeu = jeuAEtoiles(perimetre, catalogue);
  if (!jeu) return json({ erreur: 'Classement inconnu.' }, 400);
  await preparerTablesProfil(env);
  const cle = (suite) => new Request(new URL(`/api/classement/jeu?j=${jeu.id}&max=${jeu.max}${suite}`, request.url));
  const top = await avecCache(cle(''), R.CLASSEMENT_JEU_CACHE_S, waitUntil, () => topClassementJeu(env, jeu.id, jeu.max));
  let moi = null;
  const profil = jeton ? await profilParJeton(env, jeton) : null;
  if (profil) {
    const ligne = top.find((l) => l.id === profil.id);
    const position = ligne
      ? { rang: ligne.rang, points: ligne.points }
      : await avecCache(cle(`&profil=${profil.id}`), R.CLASSEMENT_JEU_CACHE_S, waitUntil, () => rangJeu(env, jeu.id, jeu.max, profil));
    moi = { id: profil.id, ...position };
  }
  return json({ perimetre, max: jeu.max, top, moi });
}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

async function historique(request, env, waitUntil, periode, avant) {
  if (avant != null && (typeof avant !== 'string' || !JOUR.test(avant))) return json({ erreur: 'Requête invalide.' }, 400);
  try {
    const maintenant = Date.now();
    await assurerPodiums(env, maintenant);
    // Clé de cache propre à la dernière période terminée : un nouveau podium la change.
    const dernier = periodePrecedente(periode, debutPeriode(periode, maintenant));
    const cle = new Request(new URL(`/api/classement/historique?per=${periode}&dernier=${dernier}&avant=${avant || ''}`, request.url));
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const garde = cache ? await cache.match(cle) : null;
    if (garde) return json({ periode, ...(await garde.json()) });
    const donnees = await historiquePodiums(env, periode, avant || null);
    if (cache) {
      const ecriture = cache.put(cle, new Response(JSON.stringify(donnees), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${R.HISTORIQUE_CACHE_S}` } }));
      if (typeof waitUntil === 'function') waitUntil(ecriture); else await ecriture;
    }
    return json({ periode, ...donnees });
  } catch (erreur) {
    console.error('Historique des podiums impossible :', erreur);
    return json({ erreur: 'Historique indisponible pour le moment.' }, 503);
  }
}
