# Consignes pour créer un jeu

Règles obligatoires pour toute IA (ou personne) qui ajoute un jeu au site Jeux-en-ligne.
Elles complètent la section 5 de `CLAUDE.md`. Le robot `scripts/validate-games.mjs` en vérifie une partie automatiquement ; la relecture de la section 7 vérifie le reste avant toute publication.

## 1. Le public

- Enfants et familles, à partir de 4 ans selon le jeu. Jeux **éducatifs ou d'adresse**, toujours bienveillants.
- Tout le texte est en **français**, simple et sans faute. Phrases courtes pour les jeunes lecteurs.
- Interdit : violence réaliste, peur, moquerie, compétition humiliante, publicité, achat, lien externe, chat, collecte de données.
- Interdit : personnages, noms, logos ou univers existants (Pokémon, Mario, Disney…). Créations originales uniquement.

## 2. Le contenu et la qualité attendus

### Minimum obligatoire (chaque nouveau jeu)

Un nouveau jeu doit occuper un enfant **au moins 15 minutes**. Il contient obligatoirement :

1. **Un écran d'accueil** : le titre en grand, la règle en une ou deux phrases et un gros bouton « Jouer ». Il sert aussi de jaquette (section 5).
2. **Au moins 10 niveaux ou vagues**, de difficulté progressive : les premiers se réussissent du premier coup, les derniers demandent de l'entraînement.
3. **Plusieurs mécaniques qui se combinent** : une nouveauté (obstacle, bonus, règle, ennemi, type de carte…) apparaît tous les 2 ou 3 niveaux, puis se mélange aux précédentes.
4. **Un tutoriel animé au début** : une courte démonstration montre le geste à faire (main ou flèche animée), en 3 étapes au plus, et se passe d'un toucher. Chaque nouvelle mécanique est présentée de la même façon à sa première apparition.
5. **Pause et Rejouer** : un bouton pause toujours visible pendant la partie (et la touche Échap ou P) fige tout (temps, mouvements, sons) et propose « Reprendre », « Recommencer » et « Accueil ». Le jeu se met aussi en pause tout seul quand l'écran est caché (`visibilitychange`). Même un jeu sans chrono a ce menu.
6. **Des contrôles tactiles et clavier** : tout se joue au doigt (cibles d'au moins 44 px) et aussi au clavier (flèches, Espace, Entrée) ou à la souris.
7. **Un score et des récompenses** : 1 à 3 étoiles par niveau selon la réussite (ou médailles, objets à collectionner…).
8. **Un record sauvegardé** (meilleur score, étoiles, niveaux atteints) dans `localStorage`, toujours dans `try { … } catch (e) { … }` : sans stockage, le jeu marche quand même.
9. **Des sons générés avec Web Audio** (aucun fichier audio) pour les actions, réussites, erreurs et fins de niveau, avec un **bouton pour couper le son**, bien visible, dont le choix est mémorisé. Aucun son avant la première action du joueur.
10. **Des animations et des effets de réussite** : confettis, étoiles qui s'envolent, compteur qui défile, légère secousse… à chaque réussite et à chaque fin de niveau.
11. **Un écran de fin avec bilan** : à chaque fin de niveau et en fin de partie, score, étoiles gagnées, record battu ou non, et boutons « Niveau suivant » et « Rejouer ».

### Le ressenti

- **Compris en 10 secondes**, grâce à l'écran d'accueil et au tutoriel.
- **Amusant tout de suite**, puis de plus en plus riche.
- Un retour visuel et sonore à chaque action.
- Un niveau dure 1 à 2 minutes ; l'enfant peut s'arrêter et reprendre plus tard grâce à la sauvegarde.

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
  `adresse`, `plateforme`, `course`, `sport`, `rythme`, `aventure`, `réflexion`, `stratégie`, `puzzle`, `mémoire`, `observation`, `quiz`, `calcul`, `lecture`, `création`, `simulation`.
  (`observation` : cherche-et-trouve, différences ; `simulation` : soigner un animal, cuisiner, tenir une ferme…)
  La même liste figure dans `scripts/genres.mjs` : modifier les deux ensemble.
- `tags` : 1 à 5 thèmes, en minuscules. Ils rangent le jeu dans les **univers** du catalogue (liste dans `public/regroupements.js`) : utiliser de préférence un tag déjà prévu, par exemple `chevaux`, `animaux`, `judo`, `nature`, `mer`, `espace`, `géographie`, `lecture`, `calcul`, `sciences`, `formes`, `couleurs`, `cubes`, `labyrinthe`, `musique`, `véhicules`, `dinosaures`, `magie`, `fantastique`, `cuisine`, `histoire`, `métiers`, `noël`, `arcade`. Un tag rangé dans aucun univers apparaît seulement dans « Autres thèmes ».
- `ages` : âge minimum conseillé, au format `"6+"` (tuiles d'âge du catalogue : 3-4 ans, 5-6 ans, 7-8 ans, 9 ans et +).
- `idee` : rempli par la boucle automatique, titre de la ligne de `IDEES-JEUX.md` réalisée par ce jeu. Ne pas le modifier. Facultatif pour un jeu créé à la main.

## 5. La jaquette

- Image portrait 600 × 800 px : `cover.webp` (idéal, moins de 100 Ko), sinon `cover.png` ou `cover.jpg` (moins de 300 Ko).
- La boucle automatique la fabrique elle-même (capture de l'écran d'accueil du jeu) : l'écran d'accueil doit donc être beau et afficher le titre en grand.

## 6. Avant de proposer le jeu

```text
node scripts/validate-games.mjs --jouer <id>
```

Le robot ouvre le jeu dans un vrai navigateur, le joue 30 secondes au hasard et enregistre des captures d'écran dans `captures/<id>/` : regardez-les. Le résultat doit être « Tout est bon ». Vérifiez ensuite la grille de la section 7, point par point.

## 7. Grille de validation

Avant d'être publié, chaque jeu de la boucle automatique passe par la validation automatique (`valider-jeu.yml`) : le robot, puis un relecteur Claude qui suit cette grille. **Le jeu n'est publié que si tous les points bloquants sont respectés.** Sinon, l'agent reçoit la liste des points à corriger (2 corrections au plus), puis la proposition est abandonnée.

### Contrôles automatiques (robot)

| Point | Bloquant si… |
| --- | --- |
| Chargement | le jeu ne s'ouvre pas dans le lanceur, ou l'écran reste vide |
| Console | une erreur apparaît au démarrage ou pendant 30 secondes de partie au hasard |
| Téléphone | une erreur survient pendant la partie au toucher, sur un écran de 390 × 844 |
| Hors ligne | le jeu tente un appel réseau, ou ne marche pas avec le navigateur coupé du réseau |
| Fichiers | `game.json` incomplet ou invalide, jaquette absente ou trop lourde, `index.html` de plus de 2 Mo, fichier en trop |

### Relecture (Claude)

Points bloquants, vérifiés dans le code et sur les captures d'écran du robot :

1. **Accueil** : titre, règle en une ou deux phrases, gros bouton « Jouer ».
2. **Tutoriel** : démonstration animée du geste au début, et à l'arrivée de chaque nouvelle mécanique.
3. **Pause et Rejouer** : bouton pause visible (et touche Échap ou P) qui fige vraiment le jeu ; « Rejouer » en fin de niveau et en fin de partie.
4. **Progression** : au moins 10 niveaux ou vagues, et la difficulté augmente réellement d'après le code.
5. **Mécaniques** : plusieurs mécaniques qui apparaissent au fil des niveaux et se combinent.
6. **Récompenses et record** : score, étoiles (ou équivalent), meilleur score ou progression sauvegardés dans `localStorage` à l'intérieur de `try { … } catch (e) { … }`.
7. **Contrôles** : jouable entièrement au doigt, et au clavier ou à la souris ; cibles tactiles d'au moins 44 px.
8. **Son** : sons Web Audio, bouton pour couper le son visible et mémorisé, aucun son avant la première action.
9. **Effets et bilan** : effets de réussite ; écran de bilan avec score, étoiles, record, « Niveau suivant » et « Rejouer ».
10. **Écran de téléphone** : sur les captures, rien de coupé, de caché ou d'illisible ; pas de défilement de la page.
11. **Contenu** : adapté aux enfants, en français sans faute, création originale ; ni publicité, ni lien, ni achat, ni collecte de données (section 1).

Conseils (non bloquants, notés dans la relecture) : amusant dès la première minute, variété d'un niveau à l'autre, de quoi jouer 15 minutes.
