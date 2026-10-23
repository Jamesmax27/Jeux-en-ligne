// ==========================================================================
// Free Micro Games — règles du formulaire public de demandes
// (proposer un jeu, signaler un bug, demander une modification)
//
// Fichier partagé par la page (public/proposer.js) et par le serveur
// (functions/api/demandes.js, functions/_demandes.js) : les mêmes limites
// sont vérifiées des deux côtés. Pour changer une limite, la changer ici.
// ==========================================================================

// Types de demande, dans l'ordre d'affichage du formulaire.
//   nouveau      : proposer un nouveau jeu (pas de jeu à choisir)
//   bug          : quelque chose ne marche pas dans un jeu publié
//   modification : changer ou améliorer un jeu publié
export const TYPES_DEMANDE = ['nouveau', 'bug', 'modification'];

// Types qui portent sur un jeu publié : le choix du jeu est alors obligatoire.
export const TYPES_AVEC_JEU = ['bug', 'modification'];

// Longueurs permises, en caractères (après suppression des espaces au début et à la fin).
export const TITRE_MIN = 5;
export const TITRE_MAX = 100;
export const DESCRIPTION_MIN = 30;
export const DESCRIPTION_MAX = 2000;

// Identifiant d'un jeu (nom de son dossier games/<id>/).
export const ID_JEU = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Titre : une seule ligne, espaces regroupés. */
export const nettoyerTitre = (texte) => String(texte ?? '').replace(/\s+/g, ' ').trim();

/** Description : fins de ligne unifiées, pas plus de 2 lignes vides de suite. */
export const nettoyerDescription = (texte) => String(texte ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/**
 * Contrôle d'une demande (navigateur et serveur).
 * Renvoie null si tout est bon, sinon le nom du champ en cause :
 * « type », « jeu », « titre » ou « description ».
 * (Le serveur vérifie en plus que le jeu est publié.)
 */
export function champInvalide({ type, jeu, titre, description }) {
  if (!TYPES_DEMANDE.includes(type)) return 'type';
  if (TYPES_AVEC_JEU.includes(type) && (typeof jeu !== 'string' || !ID_JEU.test(jeu) || jeu.length > 80)) return 'jeu';
  const t = nettoyerTitre(titre);
  if (t.length < TITRE_MIN || t.length > TITRE_MAX) return 'titre';
  const d = nettoyerDescription(description);
  if (d.length < DESCRIPTION_MIN || d.length > DESCRIPTION_MAX) return 'description';
  return null;
}
