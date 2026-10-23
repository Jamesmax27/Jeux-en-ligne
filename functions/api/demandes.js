// ==========================================================================
// POST /api/demandes — formulaire public (/proposer/, /en/suggest/…) :
// proposer un nouveau jeu, signaler un bug ou demander une modification.
// Ouvert à tous, sans compte.
//
// Corps : { "type": "nouveau" | "bug" | "modification", "jeu": "<id>" (bug et
//           modification), "titre": "...", "description": "...",
//           "site": "" (champ piège, toujours vide pour un humain),
//           "turnstileToken": "..." }
// Limites de longueur : public/demandes-regles.js (les mêmes que la page).
//
// Contrôles, dans cet ordre :
//   1. méthode POST, même origine, corps en JSON ;
//   2. empreinte de l'adresse IP (SHA-256 + IP_SALT, jamais l'adresse) :
//      empreinte bloquée ou bannie → message neutre, rien n'est transmis ;
//   3. champ piège rempli → un abus compté, fausse réponse « ok » ;
//   4. champs (type obligatoire, jeu publié pour un bug ou une modification,
//      longueurs) → 400 avec le champ en cause ;
//   5. limite de débit : ENVOIS_HEURE par heure, ENVOIS_JOUR par jour → 429 ;
//   6. Turnstile (action « demande ») ; jeton refusé → un abus compté, 403 ;
//   7. issue GitHub « [Public] … » (étiquettes demande-publique, en-attente-ia),
//      modérée ensuite par .github/workflows/moderation-demande.yml.
// Abus, blocages et format de l'issue : functions/_demandes.js.
//
// Réponse : { "ok": true } ou { "erreur": "<code>", "champ"?: "..." }.
// Codes d'erreur (traduits par la page, public/proposer.js) : requete,
// champ, limite-heure, limite-jour, robot, refus, indisponible, github.
// ==========================================================================

import { json, empreinteVisiteur, jeuExiste, verifierTurnstile, creerIssueGitHub } from '../_commun.js';
import { champInvalide, nettoyerTitre, nettoyerDescription, TYPES_AVEC_JEU } from '../../public/demandes-regles.js';
import {
  ETIQUETTES, ENVOIS_HEURE, ENVOIS_JOUR, preparerTables, etatBlocage, noterAbus,
  compterEnvois, noterEnvoi, purger, titreIssuePublique, corpsDemandePublique,
} from '../_demandes.js';

const PURGE_PROBABILITE = 0.05; // une demande sur 20 efface les vieilles lignes

export async function onRequest({ request, env, waitUntil }) {
  if (request.method !== 'POST') {
    return json({ erreur: 'requete' }, 405, { Allow: 'POST' });
  }
  // Envoi venu d'un autre site (formulaire caché…) : refusé.
  const origine = request.headers.get('Origin');
  if (origine && origine !== new URL(request.url).origin) return json({ erreur: 'requete' }, 403);
  if ((request.headers.get('Sec-Fetch-Site') || '') === 'cross-site') return json({ erreur: 'requete' }, 403);
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    return json({ erreur: 'requete' }, 400);
  }
  const longueur = Number(request.headers.get('Content-Length') || 0);
  if (longueur > 20000) return json({ erreur: 'requete' }, 413);

  let corps;
  try {
    corps = await request.json();
  } catch {
    return json({ erreur: 'requete' }, 400);
  }
  if (!corps || typeof corps !== 'object') return json({ erreur: 'requete' }, 400);

  if (!env.DB || !env.IP_SALT || !env.TURNSTILE_SECRET || !env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    console.error('Demandes publiques : DB, IP_SALT, TURNSTILE_SECRET, GITHUB_TOKEN ou GITHUB_REPO ne sont pas configurés.');
    return json({ erreur: 'indisponible' }, 503);
  }
  const visiteur = await empreinteVisiteur(request, env, 64);
  if (!visiteur) return json({ erreur: 'indisponible' }, 503);

  const maintenant = Date.now();
  try {
    await preparerTables(env);
    if (Math.random() < PURGE_PROBABILITE) waitUntil(purger(env, maintenant).catch((e) => console.error('Purge des demandes :', e)));

    // 2. Empreinte bloquée ou bannie : message neutre, sans détail.
    if (await etatBlocage(env, visiteur, maintenant)) return json({ erreur: 'refus' }, 403);

    // 3. Champ piège : invisible pour un humain, rempli par les robots.
    if (typeof corps.site === 'string' && corps.site.trim() !== '') {
      await noterAbus(env, visiteur, 'pot-de-miel', maintenant, maintenant);
      return json({ ok: true });
    }

    // 4. Champs.
    const demande = {
      type: corps.type,
      jeu: typeof corps.jeu === 'string' ? corps.jeu.trim() : '',
      titre: typeof corps.titre === 'string' ? corps.titre : '',
      description: typeof corps.description === 'string' ? corps.description : '',
    };
    const champ = champInvalide(demande);
    if (champ) return json({ erreur: 'champ', champ }, 400);
    if (TYPES_AVEC_JEU.includes(demande.type) && !(await jeuExiste(env, request, demande.jeu))) {
      return json({ erreur: 'champ', champ: 'jeu' }, 400);
    }

    // 5. Limite de débit (demandes transmises).
    const envois = await compterEnvois(env, visiteur, maintenant);
    if (envois.heure >= ENVOIS_HEURE) return json({ erreur: 'limite-heure' }, 429, { 'Retry-After': '3600' });
    if (envois.jour >= ENVOIS_JOUR) return json({ erreur: 'limite-jour' }, 429, { 'Retry-After': '86400' });

    // 6. Anti-robot. Jeton absent : simple erreur (script bloqué, réseau) ; jeton refusé : abus.
    const jeton = corps.turnstileToken;
    if (typeof jeton !== 'string' || !jeton || jeton.length > 2048) return json({ erreur: 'robot' }, 403);
    if (!(await verifierTurnstile(env.TURNSTILE_SECRET, jeton, request.headers.get('CF-Connecting-IP'), 'demande'))) {
      await noterAbus(env, visiteur, 'anti-robot', maintenant, maintenant);
      return json({ erreur: 'robot' }, 403);
    }

    // 7. Issue GitHub, modérée ensuite par l'IA.
    const numero = await creerIssueGitHub(env, {
      title: titreIssuePublique(demande.type, demande.titre),
      body: corpsDemandePublique({
        type: demande.type,
        jeu: demande.jeu,
        titre: nettoyerTitre(demande.titre),
        description: nettoyerDescription(demande.description),
        date: maintenant,
      }),
      labels: [ETIQUETTES.publique, ETIQUETTES.attenteIa],
    });
    if (!numero) return json({ erreur: 'github' }, 502);
    await noterEnvoi(env, visiteur, numero, maintenant);
    return json({ ok: true });
  } catch (erreur) {
    console.error('Demande publique impossible :', erreur);
    return json({ erreur: 'indisponible' }, 503);
  }
}
