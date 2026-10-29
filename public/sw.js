// ==========================================================================
// Jeux-en-ligne — service worker (mode hors connexion)
//
// Ce qui est gardé sur l'appareil :
//   - la « coquille » du site (accueil, lanceur, styles, scripts, logo) et le
//     catalogue, dès la première visite ;
//   - chaque jeu ouvert au moins une fois, avec sa jaquette ;
//   - les jaquettes affichées dans le catalogue, au fur et à mesure (le
//     catalogue n'est jamais pré-téléchargé en entier).
//
// Stratégies :
//   - réseau d'abord, copie gardée en secours : coquille et catalog.json.
//     En ligne, on a donc toujours la dernière version (scripts et styles
//     revérifiés à chaque fois, malgré le cache de 4 h du navigateur) ;
//   - cache d'abord : jeux et jaquettes. Leur adresse contient la version
//     (?v=…) : une nouvelle version est téléchargée et remplace l'ancienne ;
//   - /api/scores et /api/tendances ne sont pas gardés : sans réseau, le
//     catalogue trie par nouveautés, sans compteurs de votes ni Tendances ;
//   - pages générées (accueils /en/…, fiches des jeux /jeux/<id>/…, catégories,
//     pages légales /mentions-legales/, /en/privacy-policy/…, formulaire
//     /proposer/, /en/suggest/…) :
//     réseau d'abord, avec une copie des pages visitées (PAGES_GARDEES au plus).
//     Hors connexion, une fiche jamais visitée mène au lanceur du jeu (le jeu
//     s'ouvre s'il a déjà été joué), une autre page à l'accueil.
//
// VERSION : à augmenter quand la liste COQUILLE change, ou pour obliger tous
// les appareils à re-télécharger la coquille. Les jeux gardés ne sont pas
// touchés : ils ont leur propre cache, indépendant de VERSION.
// ==========================================================================

const VERSION = 'v15';
const CACHE_COQUILLE = `jel-coquille-${VERSION}`;
const CACHE_DONNEES = 'jel-donnees-v2';     // catalog.json (v1 gardait aussi les scores)
const CACHE_JEUX = 'jel-jeux-v1';           // jeux ouverts + leur jaquette (lu par hors-ligne.js)
const CACHE_JAQUETTES = 'jel-jaquettes-v1'; // jaquettes vues dans le catalogue
const CACHE_PAGES = 'jel-pages-v1';         // pages générées visitées (fiches, catégories, accueils)
const LIMITE_JAQUETTES = 300;               // au-delà, les plus anciennes sont effacées
const PAGES_GARDEES = 60;                   // idem pour les pages générées
const DELAI_RESEAU = 3000;                  // ms : au-delà, la copie gardée est servie

// Fichiers de la coquille, relatifs au dossier du site.
// Les textes des 5 langues sont petits : tous gardés, pour changer de langue hors connexion.
const COQUILLE = [
  './', 'play.html', 'style.css', 'app.js', 'play.js', 'votes.js', 'turnstile.js', 'suivi.js', 'hors-ligne.js', 'taxonomie.js', 'chemins.js', 'pub.js',
  'consentement.js', 'mesure.js', 'langue.js', 'i18n/i18n.js', 'proposer.js', 'demandes-regles.js',
  'multijoueur/lanceur.js', 'multijoueur/config.js',
  'i18n/site/fr.json', 'i18n/site/en.json', 'i18n/site/es.json', 'i18n/site/pt.json', 'i18n/site/de.json',
  'manifest.webmanifest', 'assets/logo.svg', 'assets/sans-jaquette.svg',
];

// Cloudflare Pages sert play.html à l'adresse « play » et l'accueil à « / » :
// les deux formes d'adresse mènent à la même copie.
const PAGES = new Map([
  ['', './'], ['index.html', './'], ['play.html', 'play.html'], ['play', 'play.html'],
]);

const RACINE = new URL('./', self.location).href; // dossier du site, ex. https://exemple.pages.dev/
const BASE = new URL(RACINE).pathname;            // ex. « / »
const URL_CATALOGUE = new URL('catalog.json', RACINE).href;

// Pages générées par scripts/pages-seo.mjs (adresses : chemins.js) :
// accueil d'une langue, fiche d'un jeu, page d'une catégorie.
const RE_ACCUEIL_LANGUE = /^(?:en|es|pt|de)\/$/;
const RE_FICHE = /^(?:(en|es|pt|de)\/)?(?:jeux|games|juegos|jogos|spiele)\/([a-z0-9-]+)\/$/;
const RE_CATEGORIE = /^(?:(?:en|es|pt|de)\/)?(?:genres|generos|spielarten|univers|worlds|mundos|welten|ages|edades|idades|alter)\/[^/]+\/$/;
// Pages légales (français et anglais) : mêmes règles que les autres pages générées.
const RE_LEGALE = /^(?:mentions-legales|confidentialite|conditions-utilisation|cookies|en\/(?:legal-notice|privacy-policy|terms-of-use|cookie-policy))\/$/;
// Formulaire public de demandes (l'envoi demande une connexion ; la page reste lisible).
const RE_PROPOSER = /^(?:proposer|en\/suggest|es\/proponer|pt\/sugerir|de\/vorschlagen)\/$/;

// --- Installation et mise à jour ---------------------------------------------

self.addEventListener('install', (event) => {
  // Les appels à l'API (votes, scores, suivi des parties) vont directement au
  // réseau, sans passer par ce service worker : sinon, la durée de partie
  // envoyée en quittant le jeu (sendBeacon, voir suivi.js) peut se perdre.
  // (Chrome et Edge ; ailleurs, le filtre « fetch » ci-dessous les laisse passer.)
  if (event.addRoutes && typeof URLPattern === 'function') {
    event.addRoutes({ condition: { urlPattern: new URLPattern({ pathname: `${BASE}api/*` }) }, source: 'network' })
      .catch((erreur) => console.warn('Routes du service worker refusées :', erreur));
  }
  event.waitUntil((async () => {
    const coquille = await caches.open(CACHE_COQUILLE);
    const donnees = await caches.open(CACHE_DONNEES);
    const telecharger = async (cache, chemin) => {
      const adresse = new URL(chemin, RACINE).href;
      const reponse = await fetch(adresse, { cache: 'reload' });
      if (!reponse.ok) throw new Error(`${chemin} : HTTP ${reponse.status}`);
      await cache.put(adresse, await copiePropre(reponse));
    };
    // Tout ou rien : s'il manque un fichier, l'ancienne version reste en place.
    await Promise.all([
      ...COQUILLE.map((chemin) => telecharger(coquille, chemin)),
      telecharger(donnees, 'catalog.json'),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Efface les caches des versions précédentes.
    const actuels = new Set([CACHE_COQUILLE, CACHE_DONNEES, CACHE_JEUX, CACHE_JAQUETTES, CACHE_PAGES]);
    for (const nom of await caches.keys()) {
      if (nom.startsWith('jel-') && !actuels.has(nom)) await caches.delete(nom);
    }
    await self.clients.claim();
  })());
});

// --- Aiguillage des requêtes ---------------------------------------------------

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return; // les votes (POST) passent tels quels
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return; // Turnstile, etc.
  const chemin = url.pathname.slice(BASE.length);

  const jeuDemande = /^games\/([a-z0-9-]+)\/(?:index\.html)?$/.exec(chemin);
  if (jeuDemande) {
    event.respondWith(jeu(event, jeuDemande[1]));
  } else if (/^games\/[a-z0-9-]+\/cover\.(?:webp|png|jpe?g|svg)$/.test(chemin)) {
    event.respondWith(jaquette(event));
  } else if (chemin === 'catalog.json') {
    event.respondWith(reseauDabord(event, CACHE_DONNEES, URL_CATALOGUE));
  } else if (RE_ACCUEIL_LANGUE.test(chemin) || RE_FICHE.test(chemin) || RE_CATEGORIE.test(chemin) || RE_LEGALE.test(chemin) || RE_PROPOSER.test(chemin)) {
    event.respondWith(pageGeneree(event, chemin));
  } else {
    const cle = cleCoquille(chemin);
    if (cle) event.respondWith(reseauDabord(event, CACHE_COQUILLE, cle));
  }
});

// --- Pages générées : réseau d'abord, copie des pages visitées -----------------

async function pageGeneree(event, chemin) {
  const cle = new URL(chemin, RACINE).href; // sans paramètres
  const reponse = await reseauDabord(event, CACHE_PAGES, cle, limiterPages);
  if (reponse.type !== 'error') return reponse;
  // Hors connexion, page jamais visitée : la fiche mène au lanceur (le jeu
  // s'ouvre s'il est déjà gardé ; « depuis » : son bouton retour mène alors à
  // l'accueil, la fiche n'étant pas disponible), une autre page à l'accueil
  // de sa langue s'il a été visité, sinon à l'accueil de la coquille.
  const fiche = RE_FICHE.exec(chemin);
  if (fiche) {
    const lanceur = new URL('play', RACINE);
    lanceur.searchParams.set('id', fiche[2]);
    lanceur.searchParams.set('lang', fiche[1] || 'fr');
    lanceur.searchParams.set('depuis', 'hors-ligne');
    return Response.redirect(lanceur.href, 302);
  }
  const langue = /^(en|es|pt|de)\//.exec(chemin)?.[1];
  const accueilLangue = langue && await caches.match(new URL(`${langue}/`, RACINE).href, { cacheName: CACHE_PAGES });
  return accueilLangue || (await caches.match(new URL('./', RACINE).href, { cacheName: CACHE_COQUILLE })) || reponse;
}

async function limiterPages(cache) {
  const cles = await cache.keys();
  for (const ancienne of cles.slice(0, Math.max(0, cles.length - PAGES_GARDEES))) await cache.delete(ancienne);
}

function cleCoquille(chemin) {
  if (PAGES.has(chemin)) return new URL(PAGES.get(chemin), RACINE).href;
  if (COQUILLE.includes(chemin)) return new URL(chemin, RACINE).href;
  return null;
}

// --- Réseau d'abord (coquille, catalogue) --------------------------------------

// apresMiseEnCache(cache) : facultatif, appelé après chaque copie (ex. limiter la place).
// Scripts, styles et images de la coquille : toujours revérifiés auprès du serveur
// (cache: 'no-cache' ; réponse 304, légère, s'ils n'ont pas changé). Cloudflare les
// fait garder 4 heures par le navigateur (réglage « Browser Cache TTL » du domaine,
// qui l'emporte sur public/_headers) alors que les pages sont toujours fraîches :
// sans cela, après une mise en ligne, une page neuve tournait avec l'ancien app.js
// ou l'ancien style.css, et la mise en page cassait. Les pages (navigations) sont
// déjà servies fraîches.
async function reseauDabord(event, nomCache, cle, apresMiseEnCache = null) {
  const cache = await caches.open(nomCache);
  const requete = event.request.mode === 'navigate' ? event.request : new Request(event.request, { cache: 'no-cache' });
  const reseau = fetch(requete);

  // La copie gardée est mise à jour à chaque réponse correcte, même arrivée en retard.
  // Copie faite tout de suite (la page va lire l'original) ; put remet la clé en fin
  // de liste : les pages vues il y a le plus longtemps partent d'abord.
  event.waitUntil(reseau.then(async (reponse) => {
    if (reponse.ok && reponse.type === 'basic') {
      const copie = reponse.clone();
      await cache.put(cle, await copiePropre(copie));
      if (apresMiseEnCache) await apresMiseEnCache(cache);
    }
  }).catch(() => { /* hors connexion : rien à mettre à jour */ }));

  // Réseau trop lent ou absent : on sert la copie gardée.
  const reponse = await Promise.race([reseau, attendre(DELAI_RESEAU)]).catch(() => null);
  if (reponse && (reponse.ok || reponse.type === 'opaqueredirect')) return reponse;
  const copie = await cache.match(cle);
  if (copie) return copie;
  return reponse || reseau.catch(() => Response.error());
}

// --- Cache d'abord (jeux et jaquettes) -----------------------------------------

async function jeu(event, id) {
  const cache = await caches.open(CACHE_JEUX);
  const copie = await cache.match(event.request);
  if (copie) return copie;
  try {
    const reponse = await fetch(event.request);
    if (reponse.ok && reponse.type === 'basic') event.waitUntil(garderJeu(cache, id, event.request.url, reponse.clone()));
    return reponse;
  } catch {
    // Hors connexion, version demandée absente : une version plus ancienne vaut mieux que rien.
    return (await cache.match(event.request, { ignoreSearch: true })) || Response.error();
  }
}

async function garderJeu(cache, id, adresse, reponse) {
  try {
    await cache.put(adresse, await copiePropre(reponse));
    await effacerAutresVersions(cache, adresse);

    // Sa jaquette aussi, pour qu'il garde son image dans le catalogue hors connexion.
    const adresseJaquette = await jaquetteDuJeu(id);
    if (adresseJaquette) {
      const image = (await caches.match(adresseJaquette)) || (await fetch(adresseJaquette));
      if (image.ok) {
        await cache.put(adresseJaquette, await copiePropre(image));
        await effacerAutresVersions(cache, adresseJaquette);
      }
    }
  } catch (erreur) {
    console.warn('Jeu non gardé pour le hors-ligne :', erreur);
  }
}

// Adresse de la jaquette d'un jeu, d'après le catalogue gardé.
// Seule une image du dossier du jeu est acceptée (la jaquette par défaut fait partie de la coquille).
async function jaquetteDuJeu(id) {
  const reponse = await caches.match(URL_CATALOGUE, { cacheName: CACHE_DONNEES });
  if (!reponse) return null;
  const catalogue = await reponse.json();
  const fiche = (Array.isArray(catalogue.games) ? catalogue.games : []).find((j) => j.id === id);
  if (typeof fiche?.cover !== 'string') return null;
  const adresse = new URL(fiche.cover, RACINE);
  const dossierJeu = `${BASE}games/${id}/`;
  return adresse.origin === self.location.origin && adresse.pathname.startsWith(dossierJeu) ? adresse.href : null;
}

async function jaquette(event) {
  const copie = await caches.match(event.request);
  if (copie) return copie;
  try {
    const reponse = await fetch(event.request);
    if (reponse.ok && reponse.type === 'basic') event.waitUntil(garderJaquette(event.request.url, reponse.clone()));
    return reponse;
  } catch {
    // Sans réponse, la page affiche la jaquette par défaut.
    return (await caches.match(event.request, { ignoreSearch: true })) || Response.error();
  }
}

async function garderJaquette(adresse, reponse) {
  try {
    const cache = await caches.open(CACHE_JAQUETTES);
    await cache.put(adresse, await copiePropre(reponse));
    await effacerAutresVersions(cache, adresse);
    // Place limitée : les jaquettes vues il y a le plus longtemps s'en vont.
    const cles = await cache.keys();
    for (const ancienne of cles.slice(0, Math.max(0, cles.length - LIMITE_JAQUETTES))) await cache.delete(ancienne);
  } catch (erreur) {
    console.warn('Jaquette non gardée :', erreur);
  }
}

// --- Outils ------------------------------------------------------------------

// Efface les autres versions (?v=…) d'un même fichier.
async function effacerAutresVersions(cache, adresse) {
  for (const requete of await cache.keys(adresse, { ignoreSearch: true })) {
    if (requete.url !== adresse) await cache.delete(requete);
  }
}

// Une réponse obtenue après une redirection ne peut pas servir une page :
// on en garde une copie « propre ».
async function copiePropre(reponse) {
  if (!reponse.redirected) return reponse;
  return new Response(await reponse.blob(), {
    status: reponse.status,
    statusText: reponse.statusText,
    headers: reponse.headers,
  });
}

function attendre(ms) {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}
