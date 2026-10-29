// ==========================================================================
// Free Micro Games — adresse du serveur multijoueur (fichier unique)
//
// Le Worker Cloudflare commun à tous les jeux multijoueurs (dossier
// multijoueur/ du dépôt, docs/multijoueur.md). C'est le lanceur (play.js,
// multijoueur/lanceur.js) qui s'y connecte, au lancement d'un jeu
// multijoueur seulement, jamais à l'ouverture du site : les jeux, eux,
// n'ont aucun accès au réseau.
//
// Lu aussi par scripts/multijoueur.mjs : les sites permis sont recopiés dans
// le Worker, qui refuse les connexions venues d'ailleurs (en-tête Origin).
// ==========================================================================

// Adresse du Worker (domaine personnalisé de Cloudflare, voir multijoueur/wrangler.toml).
export const ADRESSE_MULTI = 'wss://multi.freemicrogames.com';

// Sites d'où le lanceur se connecte. Ailleurs (aperçus *.pages.dev, test local),
// les jeux multijoueurs se jouent contre des robots sur l'appareil.
export const SITES_MULTI = ['freemicrogames.com', 'www.freemicrogames.com'];
