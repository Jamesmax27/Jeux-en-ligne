// ==========================================================================
// Free Micro Games — classement des étoiles d'un jeu (page du jeu)
//
// Bloc « Classement des étoiles » des pages des jeux à étoiles
// (gabarits/morceaux/classement-jeu.html) : meilleur nombre d'étoiles de
// chaque joueur dans ce jeu, « obtenues / maximum », du plus grand au plus
// petit, sans remise à zéro. À égalité, le premier arrivé à ce score passe
// devant (calcul du serveur : functions/_profil.js, topClassementJeu).
//
// Économie : une seule requête (POST /api/classement, périmètre « jeu:<id> »),
// envoyée seulement quand le bloc approche de l'écran ; elle rapporte le top
// 100 entier, et les pages (CLASSEMENT_JEU_PAR_PAGE joueurs) se tournent sans
// nouvelle requête. Le joueur voit toujours sa position : sa ligne dans le
// top, ou sa place au-dessus de la liste s'il est plus loin.
// Hors ligne ou serveur indisponible : un message, nouvel essai au retour du
// réseau ; rien d'autre sur la page n'en dépend (le jeu reste jouable).
// Docs : docs/cadrage-fidelisation.md, section 14.10.
// ==========================================================================

import * as R from './profil-reglages.js';
import { classement, etat } from './profil.js';
import { chargerTextes, t } from './profil-textes.js';
import { ligneClassement } from './classement-ligne.js';

const bloc = document.getElementById('classement-jeu');
const $ = (id) => document.getElementById(`classement-jeu-${id}`);
const PAR_PAGE = R.CLASSEMENT_JEU_PAR_PAGE;

let donnees = null;   // dernière réponse du serveur
let page = 0;         // page affichée (à partir de 0)
let enCours = false;
let demande = false;  // le bloc a approché de l'écran : le classement est voulu

const texteEtoiles = (n, max) => t('classementJeu.points', { n, max });

function afficherPage() {
  const { top, max } = donnees;
  const moiId = donnees.moi?.id ?? etat()?.id ?? null;
  const pages = Math.max(1, Math.ceil(top.length / PAR_PAGE));
  page = Math.min(Math.max(page, 0), pages - 1);
  const liste = $('liste');
  liste.textContent = '';
  for (const ligne of top.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE)) {
    liste.append(ligneClassement(ligne, { points: texteEtoiles(ligne.points, max), moiId }));
  }
  $('pages').hidden = pages < 2;
  $('page').textContent = t('classementJeu.page', { n: page + 1, total: pages });
  $('precedent').disabled = page === 0;
  $('suivant').disabled = page === pages - 1;
}

// Position du joueur, au-dessus de la liste : dans le top, elle mène à sa ligne ;
// plus loin, elle donne sa place ; sans étoiles ici, elle dit comment entrer.
function afficherMoi() {
  const { top, max, moi } = donnees;
  const bouton = $('moi');
  bouton.hidden = !moi;
  if (!moi) return;
  const rangTop = top.findIndex((l) => l.id === moi.id);
  bouton.classList.toggle('fixe', rangTop < 0);
  bouton.onclick = null;
  if (rangTop >= 0) {
    bouton.textContent = t('classementJeu.maPositionTop', { n: moi.rang, points: texteEtoiles(moi.points, max) });
    bouton.onclick = () => {
      page = Math.floor(rangTop / PAR_PAGE);
      afficherPage();
      document.getElementById('classement-ma-ligne')?.scrollIntoView({ block: 'nearest' });
    };
  } else if (moi.rang) {
    bouton.textContent = t('classementJeu.maPosition', { n: moi.rang, points: texteEtoiles(moi.points, max) });
  } else {
    bouton.textContent = t('classementJeu.pasClasse', { n: R.CLASSEMENT_NIVEAU_MIN });
  }
}

async function charger() {
  if (!demande || enCours || donnees) return;
  enCours = true;
  await chargerTextes();
  $('etat').textContent = t('classementJeu.chargement');
  const r = await classement(`jeu:${bloc.dataset.jeu}`);
  enCours = false;
  if (r.erreur || !Array.isArray(r.top)) {
    $('etat').textContent = t(r.erreur === 'hors' ? 'classementJeu.horsLigne' : 'classementJeu.indisponible');
    return;
  }
  const max = Number.isInteger(r.max) && r.max > 0 ? r.max : Number(bloc.dataset.max) || 0;
  // Jamais plus que le maximum du jeu, quoi que réponde le serveur.
  const borne = (n) => Math.max(0, Math.min(Number(n) || 0, max));
  donnees = { max, top: r.top.map((l) => ({ ...l, points: borne(l.points) })), moi: r.moi ? { ...r.moi, points: borne(r.moi.points) } : null };
  $('etat').textContent = donnees.top.length ? '' : t('classementJeu.vide');
  const dansTop = donnees.moi ? donnees.top.findIndex((l) => l.id === donnees.moi.id) : -1;
  page = dansTop >= 0 ? Math.floor(dansTop / PAR_PAGE) : 0;   // ouvert sur la page du joueur
  afficherMoi();
  afficherPage();
}

if (bloc) {
  $('precedent').addEventListener('click', () => { page--; afficherPage(); });
  $('suivant').addEventListener('click', () => { page++; afficherPage(); });
  window.addEventListener('online', charger);   // nouvel essai au retour du réseau
  if ('IntersectionObserver' in window) {
    const veille = new IntersectionObserver((vues) => {
      if (!vues.some((v) => v.isIntersecting)) return;
      veille.disconnect();
      demande = true;
      charger();
    }, { rootMargin: '300px 0px' });
    veille.observe(bloc);
  } else {
    demande = true;
    charger();
  }
}
