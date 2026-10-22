// ==========================================================================
// Jeux-en-ligne — mode hors connexion, côté page (catalogue et lanceur)
//
// - Enregistre le service worker (sw.js), qui garde le site et les jeux ouverts.
// - Indique quels jeux sont déjà gardés sur l'appareil (badge du catalogue).
// Sans service worker (navigateur ancien, adresse en http:// hors localhost),
// le site fonctionne comme avant, simplement sans hors-ligne.
// ==========================================================================

/** Enregistre le service worker, une fois la page chargée pour ne pas la ralentir. */
export function activerHorsLigne() {
  if (!('serviceWorker' in navigator)) return;
  const enregistrer = () => {
    // Adresse depuis la racine : l'accueil existe aussi à /en/, /es/… (portée : tout le site).
    navigator.serviceWorker.register('/sw.js').catch((erreur) => {
      console.warn('Mode hors connexion indisponible :', erreur);
    });
  };
  if (document.readyState === 'complete') enregistrer();
  else addEventListener('load', enregistrer, { once: true });
}

/** Identifiants des jeux gardés sur l'appareil (Set). Ne lève jamais d'erreur. */
export async function jeuxHorsLigne() {
  const ids = new Set();
  try {
    for (const nom of await caches.keys()) {
      if (!nom.startsWith('jel-jeux-')) continue; // cache des jeux (voir sw.js)
      for (const requete of await (await caches.open(nom)).keys()) {
        const jeu = /\/games\/([a-z0-9-]+)\/(?:index\.html)?$/.exec(new URL(requete.url).pathname);
        if (jeu) ids.add(jeu[1]);
      }
    }
  } catch { /* pas de cache disponible (navigation privée, adresse non sécurisée…) */ }
  return ids;
}
