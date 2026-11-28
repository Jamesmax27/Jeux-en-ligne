// ==========================================================================
// horloge.mjs — horloge virtuelle injectée dans la page d'un jeu filmé
//
// Un jeu filmé « en direct » dans un navigateur sans écran saccade dès que la
// machine est lente (jeux 3D sur les machines de GitHub Actions) et ne donne
// jamais deux fois la même partie. Ici, le temps du jeu n'avance que quand le
// script de capture le demande : 1/60 s par pas, deux pas par image filmée.
// La vidéo est donc fluide quelle que soit la machine, et la même recette
// redonne la même partie (hasard du jeu fixé par une graine).
//
// La fonction ci-dessous est envoyée telle quelle dans la page (addInitScript),
// avant le code du jeu : elle ne doit rien utiliser de ce fichier. Le jeu
// lui-même n'est jamais modifié.
//
// Remplacés dans la page : requestAnimationFrame, setTimeout, setInterval,
// performance.now, Date, Math.random, requestFullscreen (sans effet). Les animations CSS suivent la même
// horloge (mises en pause puis avancées à la main). window.FMG (fourni par le
// lanceur sur le site) note ici les fins de partie, pour écarter les passages
// où le jeu montre un écran de défaite.
// ==========================================================================

export function horlogeVirtuelle({ graine, sauvegardes }) {
  const VraieDate = Date;
  const vraieImage = window.requestAnimationFrame.bind(window); // l'horloge réelle du navigateur, pour « souffle »
  const DEPART = 1795780800000; // 2026-11-27 12:00 UTC : une date fixe, la même à chaque capture
  let t = 0, suite = 1;
  const minuteries = new Map();
  let images = [];
  const erreurs = [], fins = [];

  try { for (const cle of Object.keys(sauvegardes || {})) localStorage.setItem(cle, sauvegardes[cle]); } catch { /* stockage refusé : le jeu part de zéro */ }

  performance.now = () => t;
  class DateVirtuelle extends VraieDate {
    constructor(...a) { if (a.length === 0) super(DEPART + t); else super(...a); }
    static now() { return DEPART + t; }
  }
  window.Date = DateVirtuelle;

  window.requestAnimationFrame = (f) => { const i = suite++; images.push({ i, f }); return i; };
  window.cancelAnimationFrame = (i) => { images = images.filter((x) => x.i !== i); };
  window.setTimeout = (f, d = 0, ...args) => { const i = suite++; minuteries.set(i, { t: t + Math.max(0, +d || 0), f, args, periode: 0 }); return i; };
  window.setInterval = (f, d = 0, ...args) => { const i = suite++; const periode = Math.max(1, +d || 0); minuteries.set(i, { t: t + periode, f, args, periode }); return i; };
  window.clearTimeout = window.clearInterval = (i) => { minuteries.delete(i); };

  // Hasard du jeu : mulberry32, même suite à chaque capture.
  let a = graine >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };

  // Plein écran : la capture est déjà « plein cadre ». Sans cela, un jeu qui le demande au
  // premier toucher fait passer le navigateur sans écran en 800 × 600 et sort du cadre filmé.
  const sansPleinEcran = () => Promise.resolve();
  Element.prototype.requestFullscreen = sansPleinEcran;
  if ('webkitRequestFullscreen' in Element.prototype) Element.prototype.webkitRequestFullscreen = sansPleinEcran;

  // Fins de partie signalées par le jeu (sur le site : public/suivi.js).
  window.FMG = {
    reportEnd: (o) => { fins.push({ t, gagne: !!(o && o.completed), niveau: o ? o.level : null }); },
    reportComplete: () => {},
  };
  window.addEventListener('error', (e) => { erreurs.push(String(e.message || e)); });

  // Animations et transitions CSS : prises en main à leur apparition, puis
  // avancées au rythme de l'horloge virtuelle.
  const suivies = new WeakMap();
  function synchroniserAnimations() {
    try {
      void document.documentElement.offsetHeight; // les transitions nées pendant ce pas existent maintenant
      for (const anim of document.getAnimations()) {
        if (!suivies.has(anim)) {
          if (anim.playState !== 'running') continue; // en pause par le jeu : laissée telle quelle
          suivies.set(anim, t);
          try { anim.pause(); } catch { continue; }
        }
        try { anim.currentTime = t - suivies.get(anim); } catch { /* animation retirée entre-temps */ }
      }
    } catch (e) { erreurs.push(`animations : ${e.message}`); }
  }

  function appeler(f, args) {
    try { if (typeof f === 'function') f(...args); } catch (e) { erreurs.push(String((e && e.message) || e)); }
  }

  window.__fmgHorloge = {
    /** Avance le temps du jeu de `pas` millisecondes : minuteries dues, puis une image. */
    avancer(pas) {
      const fin = t + pas;
      for (let garde = 0; garde < 10000; garde++) {
        let choix = null, numero = 0;
        for (const [i, m] of minuteries) {
          if (m.t <= fin && (!choix || m.t < choix.t || (m.t === choix.t && i < numero))) { choix = m; numero = i; }
        }
        if (!choix) break;
        t = Math.max(t, choix.t);
        if (choix.periode) choix.t += choix.periode; else minuteries.delete(numero);
        appeler(choix.f, choix.args);
      }
      t = fin;
      const lot = images;
      images = [];
      for (const x of lot) appeler(x.f, [t]);
      synchroniserAnimations();
    },
    /**
     * Laisse passer deux vraies images du navigateur. Chrome ne livre les mouvements du doigt
     * ou de la souris qu'au début de l'image suivante : sans cette pause après un geste, le
     * jeu les recevrait tantôt avant, tantôt après le pas de temps, et le même plan ne
     * redonnerait pas la même partie.
     */
    souffle() { return new Promise((ok) => vraieImage(() => vraieImage(() => ok()))); },
    /** État lu par la capture : temps, fins de partie, erreurs du jeu. */
    etat() { return { t, fins: fins.slice(), erreurs: erreurs.splice(0, 20), attente: images.length + minuteries.size }; },
  };
}

/**
 * Éléments visibles qu'on peut toucher (boutons du jeu), avec leur texte et
 * leur centre : sert à suivre une étape { "clic": "Jouer" } d'un plan de
 * capture, et à la commande « explorer ». Envoyée telle quelle dans la page.
 */
export function elementsTouchables({ texte, selecteur }) {
  const norme = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = (el) => {
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    if (r.width < 8 || r.height < 8 || st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.05 || st.pointerEvents === 'none') return null;
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return null;
    let dessus = document.elementFromPoint(x, y);
    // Fenêtres du module de sauvegarde : dans un arbre fantôme (shadow DOM) ouvert.
    while (dessus && dessus.shadowRoot) { const dedans = dessus.shadowRoot.elementFromPoint(x, y); if (!dedans || dedans === dessus) break; dessus = dedans; }
    if (!dessus || !(dessus === el || el.contains(dessus) || dessus.contains(el))) return null; // caché sous une fenêtre
    return { x, y, l: Math.round(r.width), h: Math.round(r.height) };
  };
  const racines = [document];
  for (let i = 0; i < racines.length; i++) for (const el of racines[i].querySelectorAll('*')) if (el.shadowRoot) racines.push(el.shadowRoot);
  const motif = selecteur || 'button, [role="button"], a[href], input[type="button"], input[type="submit"], [data-action], [data-multi], [onclick], label';
  const tous = racines.flatMap((r) => [...r.querySelectorAll(motif)]);
  const liste = [];
  for (const el of tous) {
    if (el.closest('.jel-langue')) continue; // bouton de langue du module commun
    const place = visible(el);
    if (!place) continue;
    const libelle = (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').replace(/\s+/g, ' ').trim();
    liste.push({ ...place, texte: libelle.slice(0, 60), id: el.id || '', classe: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').slice(0, 40) });
  }
  if (texte === undefined || texte === null) return liste;
  const cible = norme(texte);
  const exacts = liste.filter((e) => norme(e.texte) === cible);
  const debuts = liste.filter((e) => norme(e.texte).startsWith(cible));
  const dedans = liste.filter((e) => norme(e.texte).includes(cible));
  const choix = (exacts.length ? exacts : debuts.length ? debuts : dedans).sort((p, q) => p.texte.length - q.texte.length);
  return choix.slice(0, 1);
}
