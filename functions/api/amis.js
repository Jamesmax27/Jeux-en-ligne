// ==========================================================================
// POST /api/amis — amis, présence, classement entre amis (docs/consigne-amis.md)
//
// Corps JSON { "action": "...", "jeton": "...", ... } (jeton de l'appareil,
// comme /api/profil). Toute la logique est ici et dans functions/_amis.js :
// le navigateur (public/amis.js) ne fait qu'afficher.
//
//   liste       { presence }                 → { resume, moi, amis, recues, envoyees, bloques, presence, attendre? }
//   demander    { pseudo, turnstileToken? }  → { statut, ami? }        demande au pseudo exact
//   accepter    { id }                       → { statut }              demande reçue de « id »
//   refuser     { id }    annuler { id }     → { statut }              demande reçue / envoyée effacée
//   retirer     { id }                       → { statut }              plus amis
//   bloquer     { id }    debloquer { id }   → { statut }
//   invisible   { invisible }                → { resume }              se montrer hors ligne
//   ticket      {}                           → { ticket, expire }      ticket de présence (au moins un ami)
//   classement  { perimetre, periode, presence } → { lignes, debut, presence, attendre? }
//   rejoindre   { type }                     → 204                     bouton « Rejoindre » touché (indicateur)
//
// - Présence : lue au serveur de présence (Durable Object du Worker
//   multijoueur), seulement pour les amis acceptés et visibles du profil, contrôlés
//   dans D1 à chaque lecture ; au plus une lecture toutes les AMIS_ACTUALISER_MIN_S
//   secondes par profil (sinon presence: 'trop-tot' et attendre, en ms).
//   Serveur de présence absent ou quota atteint : presence: 'indisponible' (mode
//   dégradé : la liste d'amis et le classement restent).
// - Classement entre amis : gardé AMIS_CLASSEMENT_CACHE_S secondes dans le cache
//   de Cloudflare (clé : période, périmètre et groupe d'amis) ; la présence est relue.
// - Limites anti-abus (demandes) : functions/_amis.js. Provenance : seul le site
//   envoie (Origin, Sec-Fetch-Site), en JSON. Aperçus *.pages.dev : 503.
// Réponses : 200 JSON (statut dans le corps pour les demandes) ; 400 invalide ;
// 401 jeton inconnu ; 403 provenance ; 503 base indisponible (mode dégradé).
// ==========================================================================

import { json, empreinteVisiteur, lireJeux, verifierTurnstile } from '../_commun.js';
import { preparerTablesProfil, profilParJeton, perimetreValide, resumeAmis, compterEvenement } from '../_profil.js';
import {
  relations, demander, accepter, effacer, bloquer, debloquer, changerInvisible, ticketPresence,
  ajouterPresence, classementAmis, empreinteGroupe, debutPeriode,
} from '../_amis.js';
import * as R from '../../public/profil-reglages.js';

const TAILLE_MAX = 4096;

function origineRefusee(request) {
  const adresse = new URL(request.url);
  const origine = request.headers.get('Origin');
  if (origine && origine !== adresse.origin) return true;
  const provenance = request.headers.get('Sec-Fetch-Site');
  return !!provenance && provenance !== 'same-origin';
}

const idValide = (x) => Number.isSafeInteger(x) && x > 0;

// Le réglage « invisible » d'un ami n'est jamais envoyé : il paraît hors ligne, c'est tout.
const sansReglage = (liste) => liste.map(({ invisible, ...reste }) => reste);

export async function onRequestPost({ request, env, waitUntil }) {
  if (origineRefusee(request)) return json({ erreur: 'Origine refusée.' }, 403);
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return json({ erreur: 'Requête invalide.' }, 400);
  if (/^[^.]+\.[^.]+\.pages\.dev$/.test(new URL(request.url).hostname)) return json({ erreur: 'Amis indisponibles sur un aperçu.' }, 503);
  if (!env.DB) return json({ erreur: 'Amis indisponibles pour le moment.' }, 503);

  let corps;
  try {
    const texte = await request.text();
    if (texte.length > TAILLE_MAX) throw new Error('trop long');
    corps = JSON.parse(texte) || {};
  } catch {
    return json({ erreur: 'Requête invalide.' }, 400);
  }

  const maintenant = Date.now();
  try {
    await preparerTablesProfil(env);
    const moi = await profilParJeton(env, corps.jeton);
    if (!moi) return json({ erreur: 'Profil inconnu.', inconnu: true }, 401);
    const action = corps.action;
    const avecResume = async (donnees) => json({ ...donnees, resume: await resumeAmis(env, moi.id) });

    if (action === 'liste') {
      const [r, catalogue] = await Promise.all([relations(env, moi.id), corps.presence ? lireJeux(env, request) : null]);
      let presence = { presence: 'non-demandee' };
      if (corps.presence) presence = await ajouterPresence(env, moi.id, r.amis, catalogue);
      return avecResume({ moi: { pseudo: !!moi.pseudo, niveau: R.niveauPourXp(moi.xp) }, ...r, amis: sansReglage(r.amis), ...presence });
    }

    if (action === 'demander') {
      if (R.AMIS_TURNSTILE) {
        const jeton = corps.turnstileToken;
        if (!env.TURNSTILE_SECRET || typeof jeton !== 'string' || !jeton || jeton.length > 2048
          || !(await verifierTurnstile(env.TURNSTILE_SECRET, jeton, request.headers.get('CF-Connecting-IP'), 'ami'))) {
          return json({ statut: 'robot' });
        }
      }
      const visiteur = await empreinteVisiteur(request, env);
      return avecResume(await demander(env, moi, corps.pseudo, visiteur, maintenant));
    }

    if (['accepter', 'refuser', 'annuler', 'retirer', 'bloquer', 'debloquer'].includes(action)) {
      if (!idValide(corps.id) || corps.id === moi.id) return json({ erreur: 'Requête invalide.' }, 400);
      let r;
      if (action === 'accepter') r = await accepter(env, moi, corps.id, maintenant);
      else if (action === 'refuser') r = await effacer(env, moi, corps.id, ['recue']);
      else if (action === 'annuler') r = await effacer(env, moi, corps.id, ['envoyee']);
      else if (action === 'retirer') r = await effacer(env, moi, corps.id, ['ami']);
      else if (action === 'bloquer') r = await bloquer(env, moi, corps.id, maintenant);
      else r = await debloquer(env, moi, corps.id);
      return avecResume(r);
    }

    if (action === 'invisible') {
      await changerInvisible(env, moi, corps.invisible === true, maintenant);
      return avecResume({ statut: 'ok' });
    }

    if (action === 'ticket') {
      if (!R.PRESENCE_ACTIVE || !env.MULTI_SECRET) return json({ erreur: 'Présence indisponible.' }, 503);
      const resume = await resumeAmis(env, moi.id);
      if (resume.amis < 1 || resume.invisible) return json({ erreur: 'Pas de présence à montrer.', resume }, 409);
      const ticket = await ticketPresence(env, moi, maintenant);
      return json({ ticket, expire: maintenant + R.PRESENCE_TICKET_HEURES * 3600000, resume });
    }

    if (action === 'classement') {
      const perimetre = corps.perimetre || 'general';
      const periode = R.CLASSEMENT_PERIODES.includes(corps.periode) ? corps.periode : R.CLASSEMENT_PERIODES[0];
      const catalogue = await lireJeux(env, request);
      if (!perimetreValide(perimetre, catalogue)) return json({ erreur: 'Classement inconnu.' }, 400);
      const debut = debutPeriode(periode, maintenant);
      const { amis } = await relations(env, moi.id);
      // Calculé à la demande puis gardé quelques minutes (clé : période, périmètre, groupe d'amis).
      const groupe = await empreinteGroupe([moi.id, ...amis.map((a) => a.id)]);
      const cle = new Request(new URL(`/api/amis/classement?g=${groupe}&p=${encodeURIComponent(perimetre)}&d=${debut}&per=${periode}`, request.url));
      const cache = typeof caches !== 'undefined' ? caches.default : null;
      let lignes = null;
      const garde = cache ? await cache.match(cle) : null;
      if (garde) lignes = await garde.json();
      else {
        lignes = await classementAmis(env, moi, perimetre, debut, amis);
        if (cache) {
          const ecriture = cache.put(cle, new Response(JSON.stringify(lignes), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${R.AMIS_CLASSEMENT_CACHE_S}` } }));
          if (typeof waitUntil === 'function') waitUntil(ecriture); else await ecriture;
        }
      }
      // Réglage invisible relu (il peut avoir changé depuis la mise en cache).
      const invisibles = new Set(amis.filter((a) => a.invisible).map((a) => a.id));
      for (const l of lignes) if (l.ami) l.invisible = invisibles.has(l.id);
      let presence = { presence: 'non-demandee' };
      if (corps.presence) presence = await ajouterPresence(env, moi.id, lignes.filter((l) => l.ami), catalogue);
      return json({ perimetre, periode, debut, moi: moi.id, lignes: sansReglage(lignes), ...presence });
    }

    if (action === 'rejoindre') {
      const types = [compterEvenement(env, 'rejoindre', maintenant)];
      if (corps.type === 'partie') types.push(compterEvenement(env, 'rejoindre-partie', maintenant));
      await env.DB.batch(types);
      return new Response(null, { status: 204 });
    }

    return json({ erreur: 'Action inconnue.' }, 400);
  } catch (erreur) {
    console.error('Amis : erreur', erreur);
    return json({ erreur: 'Amis indisponibles pour le moment.' }, 503);
  }
}
