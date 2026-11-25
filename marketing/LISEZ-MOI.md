# Vidéos de promotion (TikTok, YouTube Shorts, Instagram Reels)

Chaîne de production réutilisable : à partir de recettes versionnées, un script filme le vrai gameplay des jeux du dépôt, monte la vidéo, compose la musique et sort un MP4 prêt à publier.

- Format de toutes les vidéos : vertical 9:16, **1080 × 1920, 30 images par seconde, MP4 H.264 + audio AAC**.
- Rien n'est inventé : les titres des jeux, les jaquettes et le logo sont lus dans le dépôt (`games/*/game.json`, `gabarits/morceaux/logo.html`).
- **Aucun nombre de jeux à l'écran** (total, multijoueurs, nouveautés…) : le catalogue grandit chaque nuit, le chiffre serait faux dès le lendemain (décision du propriétaire). L'abondance se montre, elle ne se chiffre pas ; une recette qui écrit `{nb_jeux}` est refusée.
- Musique originale, calculée par le script (ou piste déposée dans `marketing/videos/musique/`).
- Aucun jeu n'est modifié. Les vidéos produites vont dans `marketing/sorties/`, ignoré par git.

## 1. La commande

Une vidéo de présentation à partir d'une accroche, d'une liste de jeux et d'une variante de texte :

```
node scripts/videos/video.mjs presentation --accroche mur-de-jeux --jeux toboggan-turbo,les-fleches-qui-bougent,bouge-l-eau --textes direct
```

| Option | Rôle |
| --- | --- |
| `--accroche <id>` | accroche du début, prise dans `marketing/videos/selection.json` (`auto` : chacune à son tour) |
| `--jeux <a,b,c>` | jeux montrés, dans l'ordre ; un jeu qui se filme mal est sauté et signalé |
| `--textes <variante>` | textes à l'écran : fichier de `marketing/videos/textes/` (`direct`, `defi`, `titres`) |
| `--rythme <nom>` | `express` (6 plans courts, par défaut), `pose` (4 plans longs) ou `crescendo` (plans de plus en plus courts) : `rythmes` de `gabarit.json` |
| `--nom <nom>` | nom du fichier produit (par défaut : accroche, textes et rythme accolés) |
| `--musique <fichier>` | piste de `marketing/videos/musique/` à la place de la musique générée |

Résultat : `marketing/sorties/presentations/<nom>.mp4`, sa fiche `<nom>.json` (recette, déroulé, contrôles) et la page de revue mise à jour.

Autres commandes (`node scripts/videos/video.mjs <commande>`, ou `npm run video -- <commande>`) :

| Commande | Effet |
| --- | --- |
| `tout` (ou `npm run videos`) | les accroches, les vidéos de `presentations/`, les contrôles, la page de revue |
| `presentation <id>` | la vidéo décrite par `marketing/videos/presentations/<id>.json` |
| `accroche [<id>…]` | les accroches seules (2 à 3 s chacune), pour les comparer |
| `apercu <id> [--images 0,1.5,20]` | quelques images d'une accroche ou d'une présentation, sans tout rendre (mise au point d'une recette) |
| `verifier` | recontrôle les vidéos déjà produites |
| `revue` | refait `marketing/sorties/revue.html` |
| `jeux [--actualiser]` | jeux classés d'après les votes et les jeux les plus joués du site |
| `capturer <jeu> [--brouillon] [--forcer]` | filme un jeu seul (rush) et écrit une planche de contrôle |
| `explorer <jeu>` | liste les boutons visibles après la préparation d'un plan de capture |
| `nettoyer` | efface les rushes gardés |

## 2. Installation

Il faut Node 18 ou plus, un navigateur Chromium piloté par Playwright (comme pour les contrôles du dépôt) et ffmpeg.

**Windows (PowerShell, dans le dossier du dépôt)**

```
npm install --no-save playwright
winget install --id Gyan.FFmpeg -e
$env:CHROMIUM_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
node scripts/videos/video.mjs tout
```

Après `winget`, rouvrir le terminal pour que `ffmpeg` soit trouvé. Sans `winget` : télécharger ffmpeg, puis donner les chemins dans `FFMPEG_PATH` et `FFPROBE_PATH`. Sans Edge ni Chrome : `npx playwright install chromium` (et ne pas poser `CHROMIUM_PATH`).

**Linux (et plus tard GitHub Actions)**

```
npm install --no-save playwright
sudo apt-get install -y ffmpeg
CHROMIUM_PATH="$(command -v google-chrome)" node scripts/videos/video.mjs tout
```

Dans un workflow : mêmes trois lignes après `actions/checkout` et `actions/setup-node`, puis `actions/upload-artifact` sur `marketing/sorties/presentations/*.mp4`. Le rendu est logiciel (aucune carte graphique requise) ; compter 5 à 8 minutes par vidéo de présentation sur une machine de GitHub, plus 1 à 3 minutes par jeu à filmer la première fois.

## 3. Les accroches

Une accroche dure 2 à 3 secondes et doit arrêter le défilement dès la première image. Chacune est une **recette** (`marketing/videos/accroches/<id>.json`), jamais un MP4 enregistré : la même recette redonne la même accroche.

| Accroche | Angle | Pourquoi |
| --- | --- | --- |
| `mur-de-jeux` | la quantité | un mur de vraies jaquettes qui défile : l'abondance se voit en une image, sans chiffre qui se périme |
| `zero-attente` | l'immédiateté | on casse l'attente d'un téléchargement pour montrer qu'ici un clic suffit |
| `en-pleine-action` | le gameplay spectaculaire | on entre au milieu d'un vrai jeu, le texte crée la surprise (« ça tourne dans un navigateur ? ») |

**Choisir celles qu'on garde** : ouvrir `marketing/sorties/revue.html`, puis modifier à la main la liste de `marketing/videos/selection.json`. Une vidéo de présentation ne peut commencer que par une accroche de cette liste ; n'importe laquelle convient, rien n'est à refaire à la main.

Format d'une recette : une liste de `plans`, chacun avec sa `duree` (secondes) et ses `textes`.

- Types de plan : `mur` (jaquettes qui défilent), `attente` (fausse fenêtre de téléchargement, `titre`, `chute` = seconde où elle tombe), `jeu` (gameplay : `jeu`, `debut` en secondes ou `"auto"`), `ciel` (fond étoilé seul).
- Texte : `texte` (`*mot*` = mot en or, `\n` = retour à la ligne, `{site}` = adresse du site), `style` (`geant`, `choc`, `titre`, `legende`, `etiquette`, `petit` : tailles dans `gabarit.json`), `position` (hauteur du centre en pixels, ou `haut`, `bas`, `pied`), `de` et `jusqu` (secondes dans le plan), `entree` (`pop`, `frappe`, `glisse`, `gauche`, `fondu`, `impact`, `aucune`), `son` (`pop`, `frappe`, `impact`, `refus`, `cloche`), `rotation`.

## 4. Les vidéos de présentation

Structure : accroche → montage de gameplay → écran de fin (logo, `freemicrogames.com`, appel à l'action). Durée : 20 à 35 secondes.

- **Recettes** : `marketing/videos/presentations/<id>.json` = `{ "accroche", "jeux", "textes", "rythme" }`, les mêmes réglages que la commande.
- **Textes** (`marketing/videos/textes/<variante>.json`) : `legendes` (texte du haut de chaque plan, dans l'ordre), `etiquettes` (pastille du bas ; par défaut le titre du jeu), `en_boucle`, `rafale` (texte posé sur les plans très courts), `fin` (`appel`, `detail`). Variables : `{titre}` (titre du jeu montré, sans son sous-titre), `{titre_complet}`, `{rang}` (numéro du plan), `{site}`.
- **Rythmes** (`gabarit.json`) : tempo de la musique, durée de chaque plan en temps (les coupes tombent sur les temps), transition (`coupe`, `zoom`, `glisse`), ambiance de la musique (`arcade`, `planant`, `tension`).
- **Gabarit graphique** (`marketing/videos/gabarit.json`) : couleurs et polices du site (ciel indigo, lilas, or, Fredoka et Nunito), styles de texte, zone sûre, seuils de lisibilité. Les textes restent dans la zone sûre : TikTok, Reels et Shorts recouvrent le haut, le bas et, dans la moitié basse, une colonne de boutons à droite.

## 5. Les jeux

**Choix.** `node scripts/videos/video.mjs jeux` classe les jeux d'après `marketing/videos/popularite.json` : votes du site (`/api/scores`, score de Wilson) et jeux les plus joués (`/api/tendances`). `--actualiser` refait le relevé (il faut le réseau). `marketing/videos/jeux.json` écarte les jeux pensés pour les jeunes enfants (`age_min`), avec des `exceptions` et des jeux `ecartes` motivés.

**Capture.** Le jeu est ouvert seul dans un navigateur sans écran, en français, avec une horloge virtuelle : chaque image filmée vaut 1/30 s de jeu quelle que soit la vitesse de la machine, et le hasard du jeu est fixé par une graine. Le même plan redonne donc la même partie. Un **plan de capture** (`marketing/videos/captures/<jeu>.json`) dit comment arriver en pleine partie et quoi faire pendant qu'on filme ; le format est décrit en tête de `scripts/videos/capture.mjs`. Sans plan, un plan passe-partout est essayé (bouton « Jouer », gestes au hasard).

Écrire un plan :

1. `node scripts/videos/video.mjs explorer <jeu>` : boutons visibles et image de l'écran après la préparation ;
2. `node scripts/videos/video.mjs capturer <jeu> --brouillon` : la même partie filmée vite, avec une planche à regarder ; corriger les gestes et recommencer ;
3. `node scripts/videos/video.mjs capturer <jeu> --forcer` : le rush final, puis noter dans le plan `note` (ce qu'on voit) et `moments` (secondes des meilleurs passages) ; ces deux champs ne font pas refilmer le jeu.

Conseils tirés des premiers plans : préférer le clavier quand le jeu le permet (plans plus courts) ; partir loin des boutons pour un glissé ; viser un niveau du milieu avec `sauvegarde` ; le brouillon ne donne pas de verdict (il ne garde qu'une image sur trois), seul le rush final dit s'il est exploitable.

Un rush est refusé s'il montre des images noires, une image figée plus de 0,7 s ou presque aucun mouvement, ou si la partie finit trop tôt ; le montage passe alors au jeu suivant et le signale.

## 6. La musique

Par défaut, la musique est composée par `scripts/videos/musique.mjs` pour le montage (intro pendant l'accroche, rythme dès le premier plan de jeu, accord tenu sur l'écran de fin), avec des bruitages sur les coupes et les textes. Pour utiliser une piste à soi : la déposer dans `marketing/videos/musique/` et ajouter `--musique <fichier>` (ou `"musique"` dans la recette). Elle est coupée à la durée, fondue à la fin et mise au même niveau (-14 LUFS).

## 7. Contrôles et revue

Chaque vidéo est contrôlée à la fabrication (`verifier` les refait) :

| Contrôle | Règle |
| --- | --- |
| format | MP4, H.264 yuv420p, 1080 × 1920, 30 i/s, AAC stéréo 48 kHz |
| durée | 2 à 3 s (accroche), 20 à 35 s (présentation) |
| images noires | aucune |
| images figées | aucun plan de jeu arrêté plus de 0,7 s, aucune image arrêtée plus de 1 s ailleurs |
| textes | dans la zone sûre, 46 px au moins, contraste de 4,5 au moins, affichés assez longtemps pour être lus |
| son | présent, sans saturation |

Une planche d'images par vidéo est écrite dans `marketing/sorties/controle/`. La page `marketing/sorties/revue.html` montre toutes les vidéos côte à côte avec leur durée, leur recette, leur déroulé et leurs contrôles.

## 8. Fichiers

```text
marketing/
├─ LISEZ-MOI.md               ce mode d'emploi
├─ videos/                    sources versionnées
│  ├─ accroches/<id>.json     recettes des accroches
│  ├─ selection.json          accroches retenues (à modifier à la main)
│  ├─ presentations/<id>.json recettes des vidéos de présentation
│  ├─ textes/<variante>.json  variantes de texte
│  ├─ captures/<jeu>.json     plans de capture des jeux
│  ├─ gabarit.json            gabarit graphique, rythmes, seuils
│  ├─ jeux.json               règles de choix des jeux
│  ├─ popularite.json         relevé des votes et des jeux les plus joués
│  └─ musique/                pistes fournies (facultatif)
└─ sorties/                   tout ce qui est produit (ignoré par git)
scripts/videos/
├─ video.mjs                  la commande
├─ capture.mjs, horloge.mjs   capture du gameplay
├─ composition.mjs            de la recette au MP4
├─ gabarit/rendu.html, .js    dessin de chaque image
├─ musique.mjs                musique et bruitages
├─ analyse.mjs, verification.mjs, revue.mjs, donnees.mjs, commun.mjs
```

## 9. Limites connues

- La capture ne filme pas le son des jeux : la bande-son est la musique de la vidéo.
- Un jeu réglé sur l'horloge du son, ou qui charge ses images en plusieurs fois, peut ne pas se filmer à l'identique ; il est alors écarté par les contrôles ou à écarter dans `jeux.json`.
- Sans plan de capture écrit pour lui, un jeu est joué au hasard : le résultat est rarement flatteur.
- Un jeu lent ou vu de très loin (tour par tour, plateau entier à l'écran) est refusé par le contrôle du mouvement, même bien joué.
- D'une machine à l'autre, le dessin des polices et le rendu 3D peuvent différer de quelques pixels : même montage, mêmes textes, mêmes passages, mais pas le même fichier à l'octet près.
- Les votes du site sont encore peu nombreux : le classement des jeux bouge vite, refaire le relevé avant une nouvelle série.
