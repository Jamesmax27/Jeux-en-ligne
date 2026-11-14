// ==========================================================================
// Free Micro Games — ligne d'un classement (rang, avatar, pseudo, niveau, points)
//
// Composant commun à la page du classement (classement.js) et au classement
// des étoiles de la page d'un jeu (classement-jeu.js) : mêmes classes CSS
// (bloc « classement » de style.css), médailles des 3 premiers, ligne du
// joueur mise en avant, bouton 🚩 pour signaler un pseudo (functions/api/profil.js).
// Les textes doivent être chargés avant (chargerTextes de profil-textes.js).
// ==========================================================================

import * as R from './profil-reglages.js';
import { signaler } from './profil.js';
import { peindreAvatar } from './avatars.js';
import { t } from './profil-textes.js';

export const MEDAILLES = { 1: 'or', 2: 'argent', 3: 'bronze' };

/** Pseudo affiché : celui du joueur, sinon « Joueur <nombre> ». */
export function nom(ligne) {
  return ligne.pseudo || t('profil.pseudoDefaut', { n: ligne.numero });
}

/**
 * <li> d'un joueur. ligne : { rang, id, pseudo, numero, avatar, cadre, niveau } ;
 * points : texte des points, déjà écrit ; moiId : profil de l'appareil ;
 * avantNom : élément placé avant le pseudo (couronne), facultatif.
 */
export function ligneClassement(ligne, { points, moiId = null, sansSignaler = false, avantNom = null } = {}) {
  const li = document.createElement('li');
  li.className = 'classement-ligne';
  if (MEDAILLES[ligne.rang]) li.classList.add(`medaille-${MEDAILLES[ligne.rang]}`);
  if (ligne.id === moiId) { li.classList.add('moi'); li.id = 'classement-ma-ligne'; }
  li.innerHTML = `<span class="classement-rang"></span><span class="classement-avatar" aria-hidden="true"></span>
    <span class="classement-nom"></span><span class="classement-niveau"></span><span class="classement-points"></span>`;
  li.querySelector('.classement-rang').textContent = t('classement.rang', { n: ligne.rang });
  peindreAvatar(li.querySelector('.classement-avatar'), { avatar: ligne.avatar, cadre: ligne.cadre, niveau: ligne.niveau });
  li.querySelector('.classement-nom').textContent = nom(ligne) + (ligne.id === moiId ? ` (${t('classement.toi')})` : '');
  if (avantNom) li.querySelector('.classement-nom').prepend(avantNom);
  li.querySelector('.classement-niveau').textContent = t('classement.niveau', { n: ligne.niveau });
  li.querySelector('.classement-points').textContent = points;
  if (ligne.id !== moiId && !sansSignaler) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'classement-signaler';
    b.textContent = '🚩';
    b.setAttribute('aria-label', t('classement.signalerAria', { nom: nom(ligne) }));
    b.title = t('classement.signaler');
    b.addEventListener('click', async () => {
      if (b.dataset.confirme !== '1') { b.dataset.confirme = '1'; b.textContent = t('classement.signalerConfirmer'); return; }
      b.disabled = true;
      const r = await signaler(ligne.id);
      b.textContent = r.ok ? t('classement.signale') : t(r.erreur === 'niveau' ? 'classement.signalerNiveau' : 'profil.erreur', { n: R.SIGNALER_NIVEAU_MIN });
    });
    li.append(b);
  }
  return li;
}
