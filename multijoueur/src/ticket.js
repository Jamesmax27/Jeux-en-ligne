// ==========================================================================
// Ticket d'entrée d'une partie en ligne (profil joueur, docs/cadrage-fidelisation.md)
//
// Partagé par le site (functions/api/profil.js : création, après Turnstile)
// et le Worker multijoueur (src/partie.js : contrôle). Le ticket relie un
// vrai joueur de la partie à son profil, pour que le serveur multijoueur
// crédite le bon profil à la fin de chaque manche, sans jamais connaître le
// jeton secret de l'appareil.
//
// Forme : <données en base64url>.<signature HMAC-SHA256 en base64url>
//   données : { p: numéro du profil, j: id du jeu, e: expiration (ms) }
// Clé : secret MULTI_SECRET, le même dans Cloudflare Pages et dans le Worker.
// ==========================================================================

const encodeur = new TextEncoder();

function base64url(octets) {
  let binaire = '';
  for (const o of new Uint8Array(octets)) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function depuisBase64url(texte) {
  const b64 = texte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(texte.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function cle(secret) {
  return crypto.subtle.importKey('raw', encodeur.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Ticket signé pour le profil `profil` et le jeu `jeu`, valable jusqu'à `expiration` (ms). */
export async function signerTicket(secret, { profil, jeu, expiration }) {
  const donnees = base64url(encodeur.encode(JSON.stringify({ p: profil, j: jeu, e: expiration })));
  const signature = await crypto.subtle.sign('HMAC', await cle(secret), encodeur.encode(donnees));
  return `${donnees}.${base64url(signature)}`;
}

/** { profil, jeu } si le ticket est bien signé, pour ce jeu et pas expiré ; sinon null. */
export async function verifierTicket(secret, ticket, jeu, maintenant = Date.now()) {
  if (!secret || typeof ticket !== 'string' || ticket.length > 600) return null;
  const [donnees, signature, reste] = ticket.split('.');
  if (!donnees || !signature || reste !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await cle(secret), depuisBase64url(signature), encodeur.encode(donnees));
    if (!ok) return null;
    const d = JSON.parse(new TextDecoder().decode(depuisBase64url(donnees)));
    if (!Number.isSafeInteger(d.p) || d.p <= 0 || d.j !== jeu || !(d.e > maintenant)) return null;
    return { profil: d.p, jeu: d.j };
  } catch {
    return null;
  }
}
