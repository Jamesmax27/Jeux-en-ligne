// ==========================================================================
// Free Micro Games — vérification anti-robot Cloudflare Turnstile (navigateur)
//
// Partagé par les votes (votes.js, action « vote ») et le formulaire public
// de demandes (proposer.js, action « demande »). Le script de Cloudflare n'est
// chargé qu'au moment d'envoyer (jamais au simple affichage d'une page).
// Le jeton est vérifié par le serveur (verifierTurnstile, functions/_commun.js).
//
// En cas d'échec, l'erreur porte un code (erreur.code), écrit dans la console
// par votes.js et proposer.js et affiché par le formulaire :
//   - le code numérique de Cloudflare (ex. 110200 : domaine non autorisé pour
//     cette clé, à ajouter dans Turnstile → widget → Hostname Management ;
//     liste : developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/) ;
//   - « chargement » (script de Cloudflare injoignable), « delai » (rien après
//     60 s), « expire » (jeton expiré), « rendu » (widget impossible à créer).
// ==========================================================================

const CLE_TURNSTILE = '0x4AAAAAAFbmqw7otWEol391';
const SCRIPT_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const DELAI_TURNSTILE = 60000;  // 60 s (le visiteur peut avoir une case à cocher)

let chargementTurnstile = null;

/** Erreur Turnstile avec son code (voir en tête du fichier). */
function echec(code, texte) {
  const erreur = new Error(`Turnstile : ${texte} (code ${code})`);
  erreur.code = String(code);
  return erreur;
}

// Langue de la case à cocher éventuelle : celle du site (portugais du Brésil).
function langueTurnstile(lang) {
  const l = lang || window.JEL_I18N?.getLang() || 'fr';
  return l === 'pt' ? 'pt-br' : l;
}

function chargerTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!chargementTurnstile) {
    chargementTurnstile = new Promise((resoudre, rejeter) => {
      const script = document.createElement('script');
      script.src = SCRIPT_TURNSTILE;
      script.async = true;
      script.onload = () => (window.turnstile ? resoudre(window.turnstile) : rejeter(echec('chargement', 'script sans Turnstile')));
      script.onerror = () => rejeter(echec('chargement', 'script injoignable'));
      document.head.append(script);
    }).catch((erreur) => {
      // Permet un nouvel essai plus tard (par exemple au retour du réseau).
      chargementTurnstile = null;
      document.querySelector(`script[src="${SCRIPT_TURNSTILE}"]`)?.remove();
      throw erreur;
    });
  }
  return chargementTurnstile;
}

/**
 * Un jeton Turnstile ne sert qu'une fois : on en demande un nouveau à chaque envoi.
 * Le cadre reste invisible, sauf si Cloudflare demande au visiteur de cocher une case.
 * action : « vote » ou « demande » (vérifiée par le serveur) ; lang : langue de la case.
 */
export async function jetonTurnstile(action, lang) {
  const turnstile = await chargerTurnstile();

  let zone = document.getElementById('zone-turnstile');
  if (!zone) {
    zone = document.createElement('div');
    zone.id = 'zone-turnstile';
    zone.className = 'zone-turnstile';
    document.body.append(zone);
  }

  return new Promise((resoudre, rejeter) => {
    let widget;
    let fini = false;
    const finir = (erreur, jeton) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      try { turnstile.remove(widget); } catch { /* déjà retiré */ }
      if (erreur) rejeter(erreur); else resoudre(jeton);
    };
    const minuteur = setTimeout(() => finir(echec('delai', 'délai dépassé')), DELAI_TURNSTILE);
    try {
      widget = turnstile.render(zone, {
        sitekey: CLE_TURNSTILE,
        action,
        appearance: 'interaction-only',
        language: langueTurnstile(lang),
        callback: (jeton) => finir(null, jeton),
        // Cloudflare donne le code de l'erreur ; « return true » : erreur prise en charge ici.
        'error-callback': (code) => { finir(echec(code || 'inconnu', 'erreur')); return true; },
        'expired-callback': () => finir(echec('expire', 'jeton expiré')),
      });
    } catch (erreur) {
      finir(echec('rendu', erreur?.message || 'widget impossible à créer'));
    }
  });
}
