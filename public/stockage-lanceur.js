// ==========================================================================
// stockage-lanceur.js — côté lanceur du module de stockage des jeux (public/stockage.js)
//
// Le jeu, dans son cadre isolé, n'a ni IndexedDB ni téléchargement : il demande
// au lanceur, par message { type: "jel-stockage", id, op, … }. Le lanceur garde
// les données dans l'IndexedDB du site, base « fmg-jeux », magasin « donnees »,
// sous la clé « <id du jeu>/<clé> » : un jeu ne lit et n'écrit que ses clés.
//   get, set, del, liste   lire, écrire, effacer, lister
//   persister              navigator.storage.persist() (le navigateur garde les données du site)
//   place                  navigator.storage.estimate()
//   exporter               fichier proposé au téléchargement (juste après un geste du joueur)
// Réponse : { ok: true, valeur } ou { ok: false, err } (« plein », « trop-gros », « cle »…).
// Données gardées sur l'appareil : voir les politiques de confidentialité et de cookies.
// ==========================================================================

const BASE = 'fmg-jeux';
const MAGASIN = 'donnees';
const TAILLE_MAX = 20 * 1024 * 1024; // caractères par valeur (même limite que stockage.js)
const RE_CLE = /^[\w.-]{1,80}$/;
const RE_JEU = /^[a-z0-9-]{1,80}$/;
const ECART_EXPORT = 1500; // ms entre deux fichiers proposés

let base = null;
let dernierExport = 0;

function ouvrir() {
  if (base) return base;
  base = new Promise((ok, ko) => {
    try {
      const r = indexedDB.open(BASE, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
      r.onblocked = () => ko(new Error('base bloquée'));
    } catch (e) { ko(e); }
  });
  base.catch(() => { base = null; }); // nouvel essai à la demande suivante
  return base;
}

function transaction(ecrire, travail) {
  return ouvrir().then((db) => new Promise((ok, ko) => {
    const t = db.transaction(MAGASIN, ecrire ? 'readwrite' : 'readonly');
    let resultat = null;
    const r = travail(t.objectStore(MAGASIN));
    if (r) r.onsuccess = () => { resultat = r.result; };
    t.oncomplete = () => ok(resultat);
    t.onerror = t.onabort = () => ko(t.error || new Error('transaction'));
  }));
}

function code(e) { return e && e.name === 'QuotaExceededError' ? 'plein' : 'erreur'; }

// Nom de fichier sûr : lettres, chiffres, « - », « _ », « . » ; une extension courte obligatoire.
function nomSur(nom) {
  const propre = String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^[.-]+/, '').slice(0, 80);
  return /\.[a-z0-9]{1,16}$/i.test(propre) ? propre : null;
}

function exporter(nom, valeur, mime) {
  const sur = nomSur(nom);
  if (!sur) return { ok: false, err: 'nom' };
  if (typeof valeur !== 'string' || valeur.length > TAILLE_MAX) return { ok: false, err: 'trop-gros' };
  if (navigator.userActivation && !navigator.userActivation.isActive) return { ok: false, err: 'geste' };
  const maintenant = Date.now();
  if (maintenant - dernierExport < ECART_EXPORT) return { ok: false, err: 'trop-vite' };
  dernierExport = maintenant;
  const type = /^[\w.+-]+\/[\w.+-]+$/.test(mime || '') ? mime : 'application/octet-stream';
  const url = URL.createObjectURL(new Blob([valeur], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = sur; a.hidden = true;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return { ok: true, valeur: true };
}

// Traite une demande d'un jeu ; renvoie la réponse à poster au cadre.
export async function traiterStockage(d, jeuId) {
  if (!jeuId || !RE_JEU.test(jeuId)) return { ok: false, err: 'jeu' };
  const op = d.op;
  try {
    if (op === 'persister') return { ok: true, valeur: navigator.storage?.persist ? await navigator.storage.persist() : false };
    if (op === 'place') {
      const e = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
      return { ok: true, valeur: e ? { utilise: e.usage || 0, quota: e.quota || 0 } : null };
    }
    if (op === 'exporter') return exporter(d.nom, d.valeur, d.mime);
    const prefixe = `${jeuId}/`;
    if (op === 'liste') {
      const cles = await transaction(false, (m) => m.getAllKeys(IDBKeyRange.bound(prefixe, `${prefixe}￿`)));
      return { ok: true, valeur: (cles || []).map((k) => String(k).slice(prefixe.length)) };
    }
    if (typeof d.cle !== 'string' || !RE_CLE.test(d.cle)) return { ok: false, err: 'cle' };
    const cle = prefixe + d.cle;
    if (op === 'get') {
      const v = await transaction(false, (m) => m.get(cle));
      return { ok: true, valeur: typeof v === 'string' ? v : null };
    }
    if (op === 'set') {
      if (typeof d.valeur !== 'string') return { ok: false, err: 'valeur' };
      if (d.valeur.length > TAILLE_MAX) return { ok: false, err: 'trop-gros' };
      await transaction(true, (m) => m.put(d.valeur, cle));
      return { ok: true, valeur: true };
    }
    if (op === 'del') {
      await transaction(true, (m) => m.delete(cle));
      return { ok: true, valeur: true };
    }
    return { ok: false, err: 'op' };
  } catch (e) {
    return { ok: false, err: code(e) };
  }
}
