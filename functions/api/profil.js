// ==========================================================================
// POST /api/profil — profil joueur (fidélisation, docs/cadrage-fidelisation.md)
//
// Corps JSON { "action": "...", ... } ; « jeton » = jeton secret de l'appareil
// (créé ici, gardé par public/profil.js ; la base n'en garde que l'empreinte).
//
//   creer      { jour }                      → { jeton, etat }   nouveau profil (« Joueur <nombre> »)
//   etat       { jeton }                     → { etat }          lecture seule
//   sync       { jeton, jour, temps, termines } → { etat, gains } temps de jeu, série, jeux terminés et étoiles
//   code       { jeton }                     → { code }          code de sauvegarde (créé à la première demande)
//   restaurer  { code, turnstileToken }      → { jeton, etat }   relie cet appareil au profil du code
//   pseudo     { jeton, pseudo }             → { etat } | { erreur, raison }
//   apparence  { jeton, avatar, cadre }      → { etat }
//   ticket     { jeton, jeu, turnstileToken } → { ticket }       entrée d'une partie en ligne (multijoueur)
//   signaler   { jeton, cible }              → { ok }            signaler le pseudo du profil « cible »
//
// - Turnstile (secret TURNSTILE_SECRET) : « restaurer » (action « code ») et
//   « ticket » (action « multi »).
// - Limites par empreinte d'adresse (functions/_profil.js, réglages :
//   public/profil-reglages.js) : profils créés, codes créés, essais de code
//   ratés (blocage progressif), changements de pseudo.
// - Provenance : seul le site envoie (en-têtes Origin et Sec-Fetch-Site), en
//   JSON ; « sync » arrive aussi par navigator.sendBeacon à la fermeture de la page.
// - Aperçus <branche>.<projet>.pages.dev : rien n'est écrit (503).
// Réponses : 200 JSON ; 400 données invalides ; 401 jeton inconnu ({ inconnu: true }) ;
// 403 provenance ou anti-robot ; 409 pseudo déjà pris ; 429 limite ; 503 base absente.
// ==========================================================================

import { json, empreinteVisiteur, lireJeux, verifierTurnstile } from '../_commun.js';
import {
  preparerTablesProfil, profilParJeton, etatComplet, creerProfil, synchroniser, codeDuProfil, lireCode,
  profilParCode, ajouterAppareil, controlerPseudo, choixPermis, compterLimite, noterLimite, blocageCode,
  essaiRate, ID_JEU,
} from '../_profil.js';
import { signerTicket } from '../../multijoueur/src/ticket.js';
import * as R from '../../public/profil-reglages.js';

const TAILLE_MAX = 16384;
const JOUR_MS = 86400000;

function origineRefusee(request) {
  const adresse = new URL(request.url);
  const origine = request.headers.get('Origin');
  if (origine && origine !== adresse.origin) return true;
  const provenance = request.headers.get('Sec-Fetch-Site');
  return !!provenance && provenance !== 'same-origin';
}

export async function onRequestPost({ request, env }) {
  if (origineRefusee(request)) return json({ erreur: 'Origine refusée.' }, 403);
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return json({ erreur: 'Requête invalide.' }, 400);
  if (/^[^.]+\.[^.]+\.pages\.dev$/.test(new URL(request.url).hostname)) return json({ erreur: 'Profil indisponible sur un aperçu.' }, 503);
  if (!env.DB) {
    console.error('La base DB n\'est pas configurée.');
    return json({ erreur: 'Profil indisponible pour le moment.' }, 503);
  }

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
    const action = corps.action;
    const visiteur = await empreinteVisiteur(request, env);
    const ip = request.headers.get('CF-Connecting-IP');

    if (action === 'creer') {
      if ((await compterLimite(env, visiteur, 'profil', maintenant - JOUR_MS)) >= R.PROFILS_CREES_JOUR) return json({ erreur: 'Trop de profils créés.' }, 429);
      const { jeton, profil } = await creerProfil(env, { jour: corps.jour }, maintenant);
      await noterLimite(env, visiteur, 'profil', maintenant).run();
      return json({ jeton, etat: await etatComplet(env, profil, maintenant) });
    }

    if (action === 'restaurer') {
      const fin = await blocageCode(env, visiteur, maintenant);
      if (fin) return json({ erreur: 'Trop d\'essais.', bloqueJusqua: fin }, 429);
      const jetonTurnstile = corps.turnstileToken;
      if (typeof jetonTurnstile !== 'string' || !jetonTurnstile || jetonTurnstile.length > 2048) return json({ erreur: 'Vérification anti-robot manquante.' }, 403);
      if (!env.TURNSTILE_SECRET) return json({ erreur: 'Indisponible pour le moment.' }, 503);
      if (!(await verifierTurnstile(env.TURNSTILE_SECRET, jetonTurnstile, ip, 'code'))) return json({ erreur: 'Vérification anti-robot échouée.' }, 403);
      const lu = lireCode(corps.code);
      const profil = lu.ok ? await profilParCode(env, lu.code) : null;
      if (!profil) {
        const bloque = await essaiRate(env, visiteur, maintenant);
        return json({ erreur: 'Code inconnu.', raison: lu.ok ? 'inconnu' : lu.raison, ...(bloque ? { bloqueJusqua: bloque } : {}) }, bloque ? 429 : 400);
      }
      const jeton = await ajouterAppareil(env, profil.id, maintenant);
      return json({ jeton, etat: await etatComplet(env, profil, maintenant) });
    }

    // Toutes les autres actions demandent le jeton d'un appareil.
    const profil = await profilParJeton(env, corps.jeton);
    if (!profil) return json({ erreur: 'Profil inconnu.', inconnu: true }, 401);

    if (action === 'etat') return json({ etat: await etatComplet(env, profil, maintenant) });

    if (action === 'sync') {
      const catalogue = await lireJeux(env, request);
      return json(await synchroniser(env, profil, corps, catalogue, maintenant));
    }

    if (action === 'code') {
      if (!profil.code && (await compterLimite(env, visiteur, 'code', maintenant - JOUR_MS)) >= R.CODES_CREES_JOUR) return json({ erreur: 'Trop de codes créés.' }, 429);
      const { code, nouveau } = await codeDuProfil(env, profil, maintenant);
      if (nouveau) await noterLimite(env, visiteur, 'code', maintenant).run();
      return json({ code });
    }

    if (action === 'pseudo') {
      if ((await compterLimite(env, visiteur, 'pseudo', maintenant - JOUR_MS)) >= R.PSEUDOS_CHANGES_JOUR) return json({ erreur: 'Trop de changements.', raison: 'limite' }, 429);
      if (corps.pseudo === null || corps.pseudo === '') {
        await env.DB.prepare('UPDATE profils SET pseudo = NULL, pseudo_norm = NULL WHERE id = ?').bind(profil.id).run();
      } else {
        const c = controlerPseudo(corps.pseudo);
        if (c.raison) return json({ erreur: 'Pseudo refusé.', raison: c.raison }, 400);
        try {
          await env.DB.prepare('UPDATE profils SET pseudo = ?, pseudo_norm = ? WHERE id = ?').bind(c.pseudo, c.norme, profil.id).run();
        } catch (erreur) {
          if (/UNIQUE/i.test(String(erreur?.message || erreur))) return json({ erreur: 'Pseudo déjà pris.', raison: 'pris' }, 409);
          throw erreur;
        }
        await env.DB.prepare('DELETE FROM profils_signalements WHERE profil = ?').bind(profil.id).run();
      }
      await noterLimite(env, visiteur, 'pseudo', maintenant).run();
      const relu = await env.DB.prepare('SELECT * FROM profils WHERE id = ?').bind(profil.id).first();
      return json({ etat: await etatComplet(env, relu, maintenant) });
    }

    if (action === 'apparence') {
      const avatar = typeof corps.avatar === 'string' ? corps.avatar : profil.avatar;
      const cadre = typeof corps.cadre === 'string' ? corps.cadre : profil.cadre;
      if (!choixPermis(R.AVATARS, avatar, profil) || !choixPermis(R.CADRES, cadre, profil)) return json({ erreur: 'Pas encore débloqué.' }, 400);
      await env.DB.prepare('UPDATE profils SET avatar = ?, cadre = ? WHERE id = ?').bind(avatar, cadre, profil.id).run();
      return json({ etat: await etatComplet(env, { ...profil, avatar, cadre }, maintenant) });
    }

    if (action === 'ticket') {
      const jeu = corps.jeu;
      if (typeof jeu !== 'string' || !ID_JEU.test(jeu)) return json({ erreur: 'Jeu invalide.' }, 400);
      const catalogue = await lireJeux(env, request);
      if (catalogue && catalogue.get(jeu)?.multijoueur !== true) return json({ erreur: 'Jeu inconnu.' }, 400);
      if (!env.MULTI_SECRET || !env.TURNSTILE_SECRET) return json({ erreur: 'Indisponible pour le moment.' }, 503);
      const jetonTurnstile = corps.turnstileToken;
      if (typeof jetonTurnstile !== 'string' || !jetonTurnstile || jetonTurnstile.length > 2048) return json({ erreur: 'Vérification anti-robot manquante.' }, 403);
      if (!(await verifierTurnstile(env.TURNSTILE_SECRET, jetonTurnstile, ip, 'multi'))) return json({ erreur: 'Vérification anti-robot échouée.' }, 403);
      const ticket = await signerTicket(env.MULTI_SECRET, { profil: profil.id, jeu, expiration: maintenant + R.MULTI_TICKET_MINUTES * 60000 });
      return json({ ticket });
    }

    if (action === 'signaler') {
      const cible = corps.cible;
      if (!Number.isSafeInteger(cible) || cible <= 0 || cible === profil.id) return json({ erreur: 'Requête invalide.' }, 400);
      if (R.niveauPourXp(profil.xp) < R.SIGNALER_NIVEAU_MIN) return json({ erreur: 'Niveau insuffisant.', raison: 'niveau' }, 403);
      const r = await env.DB.prepare('INSERT OR IGNORE INTO profils_signalements (profil, auteur, date) VALUES (?, ?, ?)').bind(cible, profil.id, maintenant).run();
      if (r.meta?.changes) {
        const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM profils_signalements WHERE profil = ?').bind(cible).first();
        // Assez de joueurs différents : le pseudo redevient « Joueur <nombre> ».
        if (n >= R.SIGNALEMENTS_MAX) {
          await env.DB.batch([
            env.DB.prepare('UPDATE profils SET pseudo = NULL, pseudo_norm = NULL WHERE id = ?').bind(cible),
            env.DB.prepare('DELETE FROM profils_signalements WHERE profil = ?').bind(cible),
          ]);
        }
      }
      return json({ ok: true });
    }

    return json({ erreur: 'Action inconnue.' }, 400);
  } catch (erreur) {
    console.error('Profil : erreur', erreur);
    return json({ erreur: 'Profil indisponible pour le moment.' }, 503);
  }
}
