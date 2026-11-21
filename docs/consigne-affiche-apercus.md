# Consigne : affiche et images du jeu d'un jeu existant

Consigne de l'agent du **rattrapage de nuit** (`.github/workflows/rattrapage-affiches.yml`, file : `scripts/rattrapage-affiches.mjs`). Elle donne aux jeux faits avant la règle de novembre 2026 ce que les nouveaux jeux ont dès leur fabrication : une affiche (`window.JEL_AFFICHE`, d'où sort la jaquette) et 3 images du jeu (`window.JEL_APERCU`), comme le décrit `CONSIGNES-JEU.md`, section 5.

Tu travailles dans le dépôt du site de mini-jeux Free Micro Games (public familial, enfants compris ; jeux « 13+ » pour adolescents). Toutes les commandes se lancent depuis la racine du dépôt. Réponds et commente en français. Ne touche qu'au jeu de ta mission.

Ta mission donne l'identifiant du jeu `<id>` et le travail à faire :
- **affiche+images** : parties A et B ;
- **images** : le jeu a déjà une affiche (`JEL_AFFICHE`) ; partie B seulement ;
- **image-ordi** : le jeu a déjà son affiche et ses images, mais sa 3e image a été prise sur un téléphone ; partie B', puis C.

## 0. Comprendre

1. Lis `CONSIGNES-JEU.md`, section 5 en entier (« L'affiche du jeu » et « Images du jeu ») et la section 1 (public, jeux 13+).
2. Regarde les modèles : `games/le-petit-sorcier-et-les-nuages/index.html` (fonctions `dessinerAffiche`, `demarrerAffiche`, `ouvrirApercu`, `SCENES_APERCU` et la fin du script « Démarrage ») et `games/les-bulles-du-lagon/index.html` (`ouvrirApercu`, `MOMENTS_APERCU`).
3. Lis `games/<id>/game.json` (âge `ages`, univers) et `games/<id>/index.html` en entier, pour comprendre le jeu : héros, menace, décor, niveaux, mécaniques qui arrivent au fil des niveaux, comment une partie se lance, l'interface pendant la partie, comment le démarrage est écrit. Regarde la jaquette actuelle (`games/<id>/cover.*`) avec Read.
4. Jeu multijoueur (`"multijoueur": true`) ou en temps réel (`"temps_reel": true`) : lis aussi la partie de `docs/multijoueur.md` ou de `docs/cadrage-temps-reel.md` qui parle du démarrage ; ne change rien aux règles (`jel-regles`, `jel-sim`), au moteur ni au salon.

## A. L'affiche (jaquette)

Ajoute au jeu, sans rien changer d'autre à son fonctionnement : quand `window.JEL_AFFICHE` est vrai (posé seulement par le robot), au démarrage, ne montrer ni écran titre, ni bouton, ni fenêtre, ni texte ; cacher le bouton de langue (`.jel-langue`, créé parfois après ton script avec un style en ligne : le cacher aussi par code, au chargement et un peu après) et tous les boutons ; ne lancer ni son, ni boucle de jeu, ni invitation multijoueur ; dessiner une scène composée plein écran (format 600 × 800), redessinée au redimensionnement (sur écran large, le décor continue jusqu'aux bords). Aucun texte, lettre ni chiffre dessiné (pas même sur un panneau). Aucune ressource externe. Pas d'emoji dans l'affiche (rendu différent selon les machines : redessine-les).

Composition, comme l'affiche d'un film :
- **jeu pour enfants** : film d'animation joyeux, lumineux, couleurs franches et gaies, rien d'effrayant ;
- **jeu 13+** : affiche de film d'horreur ou d'action pour ados, mais LISIBLE en petit : sujet et menace bien éclairés (lampe, lune, lueur, néon, éclair), une couleur vive qui tranche sur le sombre ; ni sang ni gore ;
- toujours : le héros en grand (35 à 60 % de la hauteur), expressif ; un moment d'action qui montre ce qu'on fait dans le jeu ; de la profondeur (premier plan coupé par les bords, sujet, fond) ; une vraie source de lumière ; l'essentiel entre 12 % et 75 % de la hauteur (le bas porte le bandeau du titre du site) ; mêmes personnages et même style que le jeu, dessinés plus grands et plus détaillés (réutilise ses fonctions de dessin).

Capture de contrôle (ne touche jamais à la jaquette `cover.*`) :
`node scripts/jaquette-sans-texte.mjs <id> --affiche --largeur 600 --hauteur 800 --sortie ../../.rattrapage/affiches/<id>.png`
(le chemin de sortie part du dossier du jeu ; crée d'abord `.rattrapage/affiches/`). Il faut : luminosité ≥ 45, contraste ≥ 22, image occupée ≥ 20 %, aucun bouton visible. Regarde l'image avec Read en te demandant si, en petit (200 px de large) dans une grille de jaquettes, elle donne plus envie de cliquer que la jaquette actuelle ; reprends-la (3 fois au plus) sinon.

Puis écris le texte de la jaquette (ce que montre l'affiche) dans les 5 langues, dans `.rattrapage/alts/<id>.json`, sous cette forme exacte :
`{ "<id>": { "fr": "…", "en": "…", "es": "…", "pt": "…", "de": "…" } }`
Chaque texte : 40 à 120 caractères (compte-les avec node : `[...texte].length` ; au-delà de 125, le jeu est refusé), une phrase descriptive sans point final, sans commencer par « Image », « Jaquette », « Affiche » ni leur traduction ; espagnol neutre, portugais du Brésil. Pour un jeu « non_traduisible », les 5 langues quand même. N'écris ce fichier que pour le travail **affiche+images**.

## B. Les images du jeu (page du jeu)

Ajoute au jeu, sans rien changer d'autre à son fonctionnement : quand `window.JEL_APERCU` vaut 1, 2 ou 3 (posé seulement par le robot), au démarrage, ne montrer ni écran titre, ni fenêtre « Continuer », ni tutoriel, ni fenêtre ; ouvrir directement une vraie partie avec sa vraie interface (score, vies, jauges, boutons de commande…) : 1 = premier niveau déjà en action, 2 = un niveau du milieu, 3 = un niveau avancé avec une mécanique, un ennemi ou un décor qu'on ne voit pas au début. Les images 1 et 2 sont capturées sur un téléphone (390 × 844), l'image 3 sur un écran d'ordinateur (1280 × 720) : regarde-la bien, le jeu doit y remplir toute la largeur, lisible, sans colonne de téléphone entre deux bandes vides (sinon, en mode `JEL_APERCU = 3`, élargis le décor ou la zone de jeu). Pose un moment vivant et lisible (héros placé, plusieurs éléments du jeu en vue, score plausible ; hasard à graine fixe pour que la capture soit toujours la même), laisse tourner une seconde au plus si besoin, puis fige le jeu sans fenêtre de pause, pour que rien ne se gagne ni ne se perde avant la capture (2,5 s). Aucun son ; rien d'écrit dans la sauvegarde (ni `JEL_SAVE.save`, ni écriture à la fermeture, ni `FMG`). Les textes de l'interface s'afficheront en anglais (c'est voulu). Jeu multijoueur ou temps réel : partie solo contre les robots, sans réseau.

Capture : `node scripts/apercus-jeu.mjs <id>` : écrit `apercu-1.webp` à `apercu-3.webp` dans `games/<id>/` et doit finir par « Images du jeu : tout est bon ». Regarde les 3 images avec Read : un parent qui découvre la page comprend-il tout de suite à quoi on joue ? Les 3 moments sont-ils vraiment différents et donnent-ils envie ? Reprends sinon (3 fois au plus). Un jeu très sombre peut éclaircir un peu sa scène en mode `JEL_APERCU` seulement.

## B'. La 3e image sur ordinateur (travail **image-ordi**)

Le jeu a déjà `JEL_APERCU` : lance `node scripts/apercus-jeu.mjs <id>` (il refait les 3 images, la 3e sur un écran de 1280 × 720). Regarde `games/<id>/apercu-3.webp` avec Read. S'il remplit toute la largeur, lisible, c'est fini. Sinon (colonne de téléphone entre deux bandes vides, scène minuscule, décor coupé), adapte le mode `JEL_APERCU = 3` seulement : élargis la zone de jeu ou prolonge le décor du jeu sur les côtés, puis relance la capture. Ne touche ni à l'affiche, ni aux images 1 et 2 (elles doivent rester identiques), ni au fonctionnement normal.

## C. Vérifier et finir

- Vérifie que la page s'ouvre sans erreur JavaScript : sans `JEL_AFFICHE` ni `JEL_APERCU` (démarrage normal intact : écran titre, « Jouer » qui lance la partie), avec `JEL_AFFICHE`, et avec `JEL_APERCU` = 1, 2, 3 : petit script Playwright dans `/tmp/verifs/` (hors du dépôt ; `require` de playwright par `createRequire` depuis le `package.json` du dépôt, `page.on('pageerror')`, jeu servi par un petit serveur sur un port pris au hasard), lancé par `node /tmp/verifs/<fichier>`.
- Ne lance ni `validate-games.mjs`, ni serveur sur le port 8123, ni `npm run dev` : le rattrapage fait tous les contrôles après toi. Ne modifie que `games/<id>/index.html`, les 3 images `apercu-*.webp` et `.rattrapage/alts/<id>.json` ; jamais `game.json`, la jaquette, `version`, ni un autre jeu. Ni commit ni push.
- Si le jeu ne s'y prête vraiment pas, ou si tu n'arrives pas au résultat, arrête-toi proprement (remets le jeu comme avant : `git checkout -- games/<id>` et supprime les `apercu-*.webp` ajoutés) et dis pourquoi.

**Réponse finale : 3 lignes au plus** — ce que montre l'affiche ; ce que montrent les 3 images ; « tout est bon » ou la difficulté qui reste.
