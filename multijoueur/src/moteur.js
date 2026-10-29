// Moteur commun des jeux multijoueurs (public/multijoueur/moteur.js) : le même
// fichier que celui recopié dans chaque jeu, pour que le serveur et les
// appareils appliquent exactement les mêmes règles. Il se range dans
// globalThis.JEL_MULTI.
import '../../public/multijoueur/moteur.js';

export const { Arbitre, PROTOCOLE, problemesRegles } = globalThis.JEL_MULTI;
