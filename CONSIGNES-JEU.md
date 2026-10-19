# Consignes pour créer un jeu

Règles obligatoires pour toute IA (ou personne) qui ajoute un jeu au site Jeux-en-ligne.
Elles complètent la section 5 de `CLAUDE.md`. Le robot `scripts/validate-games.mjs` en vérifie la plupart automatiquement.

## 1. Le public

- Enfants et familles, à partir de 4 ans selon le jeu. Jeux **éducatifs ou d'adresse**, toujours bienveillants.
- Tout le texte est en **français**, simple et sans faute. Phrases courtes pour les jeunes lecteurs.
- Interdit : violence réaliste, peur, moquerie, compétition humiliante, publicité, achat, lien externe, chat, collecte de données.
- Interdit : personnages, noms, logos ou univers existants (Pokémon, Mario, Disney…). Créations originales uniquement.

## 2. La qualité attendue

- **Compris en 10 secondes** : un écran d'accueil avec le titre, la règle en une ou deux phrases et un gros bouton « Jouer ».
- **Amusant tout de suite**, puis de plus en plus difficile (niveaux, vitesse ou nombre d'éléments).
- Un **score** ou une progression visible, et un écran de fin avec un bouton « Rejouer ».
- Retours visuels à chaque action (animation, couleur, petite récompense). Les sons sont facultatifs, générés en Web Audio, et jamais au démarrage sans action du joueur.
- Partie typique : 1 à 5 minutes.

## 3. Les règles techniques

- Un seul fichier `index.html` (HTML + CSS + JavaScript), **moins de 2 Mo**, avec `<html lang="fr">` et `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- **Aucune adresse Internet** dans le fichier : pas de CDN, pas de police Google, pas d'image en ligne. Images en SVG ou dessinées en canvas ; polices système (`system-ui, sans-serif`).
- Jouable **au doigt et au clavier/souris**. Cibles tactiles d'au moins 44 px.
- Pensé pour un **téléphone en portrait** (360 à 430 px de large), qui s'adapte aussi à l'ordinateur. Pas de défilement de la page pendant le jeu.
- Le jeu tourne dans un **cadre isolé** : `localStorage` peut être refusé. Tout accès au stockage est entouré de `try { … } catch (e) { … }`, et le jeu fonctionne sans sauvegarde.
- Interdits : `alert()`, `confirm()`, `prompt()`, `window.open()`, formulaires, fenêtres pop-up.
- Aucune erreur dans la console, au démarrage comme pendant la partie.
- Code lisible et commenté en français.

## 4. La fiche `game.json`

```json
{
  "id": "nom-du-dossier",
  "title": "Titre du jeu",
  "description": "Une phrase qui donne envie de jouer (10 à 200 caractères).",
  "genre": "adresse",
  "tags": ["animaux"],
  "ages": "6+",
  "author": "Claude (agent)",
  "added": "AAAA-MM-JJ",
  "version": 1
}
```

- `id` : minuscules sans accents, chiffres et tirets ; identique au nom du dossier.
- `genre` : **obligatoire**, un seul, choisi dans cette liste fermée (filtres « genre » du catalogue) :
  `adresse`, `réflexion`, `mémoire`, `quiz`, `rythme`, `création`, `course`, `puzzle`, `calcul`, `lecture`.
  La même liste figure dans `scripts/genres.mjs` : modifier les deux ensemble.
- `tags` : 1 à 5 thèmes, en minuscules, de préférence déjà utilisés sur le site : `chevaux`, `animaux`, `judo`, `espace`, `nature`, `géographie`, `sciences`…
- `ages` : âge minimum conseillé, au format `"6+"`.

## 5. La jaquette

- Image portrait 600 × 800 px : `cover.webp` (idéal, moins de 100 Ko), sinon `cover.png` ou `cover.jpg` (moins de 300 Ko).
- La boucle automatique la fabrique elle-même (capture de l'écran d'accueil du jeu) : l'écran d'accueil doit donc être beau et afficher le titre en grand.

## 6. Avant de proposer le jeu

```text
node scripts/validate-games.mjs --browser <id>
```

Le résultat doit être « Tout est bon ».
