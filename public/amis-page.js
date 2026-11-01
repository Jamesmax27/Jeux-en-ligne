// ==========================================================================
// Free Micro Games — page des amis (/amis/, /en/friends/…, docs/consigne-amis.md)
//
// Ajouter un ami par son pseudo exact (pas de recherche), demandes reçues
// (accepter, refuser, bloquer), amis (en ligne d'abord, puis hors ligne :
// avatar, pseudo, niveau, statut, jeu en cours et bouton « Rejoindre » ;
// retirer, bloquer), demandes envoyées (annuler), joueurs bloqués (débloquer).
// Chargée tout de suite, puis actualisée toutes les 30 s tant que la page est
// visible ; « Actualiser » au plus toutes les 10 s (amis.js, actualisation).
// Page générée par scripts/pages-seo.mjs (gabarits/amis.html), non indexée.
// ==========================================================================

import * as R from './profil-reglages.js';
import { etat, rafraichir, pictoAvatar } from './profil.js';
import { liste, demander, repondre, actualisation, elementsPresence, annoncer } from './amis.js';
import { chargerTextes, t, langue, date } from './profil-textes.js';

const $ = (id) => document.getElementById(id);
let catalogue = new Map();
let dernier = null;          // dernière réponse de la liste (affichage après une action)

const nom = (p) => p.pseudo || t('profil.pseudoDefaut', { n: p.numero });
const titre = (fiche) => (fiche ? fiche.i18n?.[langue()]?.title || fiche.title : '');
// Ordre des amis : en jeu, puis en ligne, puis hors ligne ; à égalité, par nom.
const RANG_ETAT = { jeu: 0, site: 1, hors: 2 };

// Bouton d'action à deux temps quand il faut confirmer (retirer, bloquer).
function bouton(texte, { classe = 'bouton-secondaire', confirmer = null, aria, action }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `bouton ${classe} amis-action`;
  b.textContent = texte;
  if (aria) b.setAttribute('aria-label', aria);
  b.addEventListener('click', async () => {
    if (confirmer && b.dataset.confirme !== '1') { b.dataset.confirme = '1'; b.textContent = confirmer; return; }
    b.disabled = true;
    await action();
  });
  return b;
}

function ligne(p, { presence, actions = [], note = null }) {
  const li = document.createElement('li');
  li.className = 'amis-ligne';
  li.dataset.id = String(p.id);
  const avatar = document.createElement('span');
  avatar.className = 'classement-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = pictoAvatar(p.avatar);
  avatar.dataset.cadre = p.cadre;
  const texte = document.createElement('div');
  texte.className = 'amis-texte';
  const n = document.createElement('p');
  n.className = 'amis-nom';
  n.textContent = nom(p);
  const niv = document.createElement('span');
  niv.className = 'amis-niveau';
  niv.textContent = t('amis.niveau', { n: p.niveau });
  n.append(' ', niv);
  texte.append(n);
  let rejoindre = null;
  if (presence) {
    const el = elementsPresence({ ...p, nom: nom(p) }, { t, lang: langue(), catalogue, titre, presence });
    texte.append(el.statut);
    if (el.aide) texte.append(el.aide);
    rejoindre = el.bouton;
    li.dataset.etat = el.statut.dataset.etat;
  }
  if (note) {
    const s = document.createElement('span');
    s.className = 'amis-aide-rejoindre';
    s.textContent = note;
    texte.append(s);
  }
  const boutons = document.createElement('div');
  boutons.className = 'amis-boutons';
  if (rejoindre) boutons.append(rejoindre);
  boutons.append(...actions);
  li.append(avatar, texte, boutons);
  return li;
}

async function agir(action, p) {
  const r = await repondre(action, p.id);
  const statut = r.donnees?.statut;
  if (r.hors) $('amis-etat').textContent = t('amis.horsLigne');
  else if (!r.ok) $('amis-etat').textContent = t('amis.erreur');
  else if (statut && statut !== 'ok') $('amis-etat').textContent = t(`amis.demande.${statut}`, { n: R.AMIS_MAX });
  await charger(false);
}

function afficher(d) {
  dernier = d;
  const lang = langue();
  $('amis-etat').textContent = '';
  $('amis-pseudo-requis').hidden = !!d.moi?.pseudo;
  $('amis-invisible').hidden = !d.resume?.invisible;
  $('amis-presence').hidden = d.presence !== 'indisponible';

  // Demandes reçues.
  const recues = $('amis-recues');
  recues.textContent = '';
  $('bloc-recues').hidden = !d.recues.length;
  for (const p of d.recues) {
    recues.append(ligne(p, {
      actions: [
        bouton(t('amis.accepter'), { classe: '', aria: t('amis.actionAria', { action: t('amis.accepter'), nom: nom(p) }), action: () => agir('accepter', p) }),
        bouton(t('amis.refuser'), { aria: t('amis.actionAria', { action: t('amis.refuser'), nom: nom(p) }), action: () => agir('refuser', p) }),
        bouton(t('amis.bloquer'), { classe: 'bouton-secondaire amis-discret', confirmer: t('amis.bloquerConfirmer'), aria: t('amis.actionAria', { action: t('amis.bloquer'), nom: nom(p) }), action: () => agir('bloquer', p) }),
      ],
    }));
  }

  // Amis : en jeu, puis en ligne, puis hors ligne.
  const amis = [...d.amis].sort((a, b) => (RANG_ETAT[a.presence?.etat] ?? 3) - (RANG_ETAT[b.presence?.etat] ?? 3) || nom(a).localeCompare(nom(b), lang));
  const cible = $('amis-liste');
  cible.textContent = '';
  $('amis-compte').textContent = amis.length ? t('amis.liste.compte', { n: amis.length, max: R.AMIS_MAX }) : t('amis.liste.vide');
  for (const p of amis) {
    cible.append(ligne(p, {
      presence: d.presence === 'non-demandee' ? 'trop-tot' : d.presence,
      actions: [
        bouton(t('amis.retirer'), { classe: 'bouton-secondaire amis-discret', confirmer: t('amis.retirerConfirmer'), aria: t('amis.actionAria', { action: t('amis.retirer'), nom: nom(p) }), action: () => agir('retirer', p) }),
        bouton(t('amis.bloquer'), { classe: 'bouton-secondaire amis-discret', confirmer: t('amis.bloquerConfirmer'), aria: t('amis.actionAria', { action: t('amis.bloquer'), nom: nom(p) }), action: () => agir('bloquer', p) }),
      ],
    }));
  }

  // Demandes envoyées et joueurs bloqués.
  const envoyees = $('amis-envoyees');
  envoyees.textContent = '';
  $('bloc-envoyees').hidden = !d.envoyees.length;
  for (const p of d.envoyees) {
    envoyees.append(ligne(p, { note: t('amis.envoyees.attente'), actions: [bouton(t('amis.annuler'), { aria: t('amis.actionAria', { action: t('amis.annuler'), nom: nom(p) }), action: () => agir('annuler', p) })] }));
  }
  const bloques = $('amis-bloques');
  bloques.textContent = '';
  $('bloc-bloques').hidden = !d.bloques.length;
  for (const p of d.bloques) {
    bloques.append(ligne(p, { actions: [bouton(t('amis.debloquer'), { aria: t('amis.actionAria', { action: t('amis.debloquer'), nom: nom(p) }), action: () => agir('debloquer', p) })] }));
  }
  if (d.presence === 'ok') $('amis-maj').textContent = t('amis.majLe', { heure: date(Date.now(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
}

// Une lecture : liste et présence (presence = false après une action : la présence
// a été lue il y a peu, le serveur refuserait une lecture si rapprochée).
async function charger(presence = true) {
  const r = await liste(presence);
  if (r.hors) { $('amis-etat').textContent = t('amis.horsLigne'); return {}; }
  if (!r.ok) {
    $('amis-etat').textContent = t('amis.erreur');
    return r.statut >= 500 ? { arreter: true } : {};    // base indisponible (quota) : plus d'actualisation automatique
  }
  // Après une action : la présence déjà affichée est gardée.
  if (!presence && dernier) {
    const avant = new Map(dernier.amis.map((a) => [a.id, a.presence]));
    for (const a of r.donnees.amis) a.presence = avant.get(a.id) || { etat: 'hors' };
    r.donnees.presence = dernier.presence === 'non-demandee' ? 'trop-tot' : dernier.presence;
  }
  afficher(r.donnees);
  return r.donnees.presence === 'trop-tot' ? { attendre: r.donnees.attendre } : {};
}

function brancherFormulaire() {
  const form = $('amis-form');
  const champ = $('amis-pseudo');
  const message = $('amis-form-message');
  champ.maxLength = 32;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pseudo = champ.value.trim();
    if (!pseudo) { message.textContent = t('amis.demande.vide'); return; }
    message.textContent = t('profil.envoi');
    const r = await demander(pseudo);
    if (r.hors) { message.textContent = t('amis.horsLigne'); return; }
    const statut = r.donnees?.statut;
    if (!statut) { message.textContent = t('amis.erreur'); return; }
    const ami = r.donnees.ami ? nom(r.donnees.ami) : pseudo;
    message.textContent = t(`amis.demande.${statut}`, {
      nom: ami,
      n: statut === 'limite-attente' ? R.AMIS_ATTENTE_MAX : statut === 'niveau' ? R.AMIS_NIVEAU_MIN : R.AMIS_MAX,
    });
    if (statut === 'envoyee' || statut === 'acceptee') { champ.value = ''; await charger(false); }
  });
}

async function demarrer() {
  await chargerTextes();
  annoncer({ etat: 'site' });
  try {
    const c = await (await fetch('/catalog.json')).json();
    catalogue = new Map((c.games || []).map((j) => [j.id, j]));
  } catch { /* hors connexion : sans les titres des jeux */ }
  brancherFormulaire();
  await rafraichir();
  if (!etat() && navigator.onLine === false) { $('amis-etat').textContent = t('amis.horsLigne'); return; }
  actualisation(() => charger(true), { bouton: $('amis-actualiser'), t });
}

demarrer();
