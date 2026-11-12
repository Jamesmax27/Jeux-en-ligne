// Moteur commun des jeux en temps réel (public/temps-reel/moteur.js) : le même
// fichier que celui recopié dans chaque jeu (bloc jel-tr), pour que le Durable
// Object d'une partie relayée joue exactement la même simulation que les deux
// téléphones. Il se range dans globalThis.JEL_TR.
import '../../../public/temps-reel/moteur.js';

export const { Simulation, Cadenceur, PROTOCOLE: PROTOCOLE_TR, REGLAGES, hacher, configMode, modeDe, placesHumaines, campsDe } = globalThis.JEL_TR;
