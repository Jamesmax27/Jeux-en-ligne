// ==========================================================================
// Free Micro Games — textes du profil joueur (pastille, page de profil, classement)
//
// Les pages générées (fiches, catégories, pages légales…) sont déjà écrites
// dans leur langue et ne chargent pas i18n/i18n.js : ce petit module lit les
// textes du site (i18n/site/<langue>.json, gardés hors ligne par sw.js) dans
// la langue de la page (<html lang>), ou dans celle du lanceur et de
// l'accueil quand i18n.js est là (window.JEL_I18N, changement de langue suivi).
// Mêmes règles que i18n.js : {variables}, pluriels { one, other }, repli en français.
// ==========================================================================

const LANGUES = ['fr', 'en', 'es', 'pt', 'de'];
const dicos = {};
const ecouteurs = new Set();

function code(valeur) {
  const c = String(valeur || '').trim().toLowerCase().split(/[-_]/)[0];
  return LANGUES.includes(c) ? c : 'fr';
}

/** Langue affichée : celle de i18n.js s'il est chargé, sinon celle de la page. */
export function langue() {
  return code(window.JEL_I18N?.getLang?.() || document.documentElement.lang);
}

async function charger(lang) {
  if (!dicos[lang]) {
    dicos[lang] = fetch(`/i18n/site/${lang}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  }
  return dicos[lang];
}

let actuels = { lang: 'fr', dico: {}, source: {} };

/** Charge les textes de la langue affichée (et le français en secours). */
export async function chargerTextes() {
  const lang = langue();
  const [dico, source] = await Promise.all([charger(lang), charger('fr')]);
  actuels = { lang, dico, source };
  return t;
}

function nombre(x) {
  try { return new Intl.NumberFormat(actuels.lang).format(x); } catch { return String(x); }
}

/** Texte traduit ; variables {nom} ; pluriel selon la variable n. */
export function t(cle, variables) {
  let valeur = actuels.dico[cle];
  let lang = actuels.lang;
  if (valeur === undefined) { valeur = actuels.source[cle]; lang = 'fr'; }
  if (valeur === undefined) return cle;
  if (valeur && typeof valeur === 'object') {
    const n = typeof variables?.n === 'number' ? variables.n : 0;
    let forme = 'other';
    try { forme = new Intl.PluralRules(lang).select(n); } catch { /* ancien navigateur */ }
    valeur = n === 0 && typeof valeur.zero === 'string' ? valeur.zero : (typeof valeur[forme] === 'string' ? valeur[forme] : valeur.other);
  }
  return String(valeur).replace(/\{(\w+)\}/g, (tout, nom) => {
    if (!variables || !Object.prototype.hasOwnProperty.call(variables, nom)) return tout;
    const v = variables[nom];
    return typeof v === 'number' ? nombre(v) : String(v);
  });
}

/** Date courte dans la langue affichée. */
export function date(ms, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  try { return new Intl.DateTimeFormat(actuels.lang, options).format(new Date(ms)); } catch { return new Date(ms).toISOString().slice(0, 10); }
}

/** f() après un changement de langue (lanceur, accueil). */
export function surChangementLangue(f) {
  ecouteurs.add(f);
}

if (window.JEL_I18N?.surChangement) {
  window.JEL_I18N.surChangement(async () => {
    await chargerTextes();
    for (const f of ecouteurs) f();
  });
} else {
  // i18n.js est chargé en « defer » : il peut arriver après ce module.
  addEventListener('DOMContentLoaded', () => {
    window.JEL_I18N?.surChangement?.(async () => {
      await chargerTextes();
      for (const f of ecouteurs) f();
    });
  });
}
