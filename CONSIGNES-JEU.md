# Consignes pour créer un jeu

Règles obligatoires pour toute IA (ou personne) qui ajoute un jeu au site Jeux-en-ligne.
Elles complètent la section 5 de `CLAUDE.md`. Le robot `scripts/validate-games.mjs` en vérifie une partie automatiquement ; la relecture de la section 7 vérifie le reste avant toute publication.

## 1. Le public

- Enfants et familles, à partir de 4 ans selon le jeu. Jeux **éducatifs ou d'adresse**, toujours bienveillants.
- Tout le texte est écrit d'abord en **français**, simple et sans faute (phrases courtes pour les jeunes lecteurs), puis traduit en anglais, espagnol, portugais (Brésil) et allemand (section 3, « Langues »).
- Interdit : violence réaliste, peur, moquerie, compétition humiliante, publicité, achat, lien externe, chat, collecte de données.
- Interdit : personnages, noms, logos ou univers existants (Pokémon, Mario, Disney…). Créations originales uniquement.

## 2. Le contenu et la qualité attendus

### Minimum obligatoire (chaque nouveau jeu)

Un nouveau jeu est **complet et travaillé, jamais un simple prototype** : il doit occuper un enfant **au moins 15 minutes**. La qualité et la richesse du jeu passent avant tout : ne jamais réduire le contenu, les textes, les niveaux ou le gameplay pour aller plus vite. Il contient obligatoirement :

1. **Un écran titre** : le titre en grand, des consignes claires en une ou deux phrases et un gros bouton « Jouer ». Il sert aussi de jaquette (section 5).
2. **Au moins 20 niveaux** (les jeux publiés avant 2026-10-23 en ont 10), de difficulté progressive : les premiers se réussissent du premier coup, les derniers demandent de l'entraînement. Le jeu donne son nombre réel de niveaux, tiré de ses données : `window.JEL_NIVEAUX = NIVEAUX.length;` (même nombre que `"niveaux"` dans `game.json` : le robot les compare).
3. **De vraies nouveautés au fil des niveaux** : une nouveauté (mécanique, obstacle, ennemi, objectif, règle, type de carte…) apparaît au moins tous les 2 ou 3 niveaux, puis se mélange aux précédentes. Pas de niveaux copiés les uns sur les autres.
4. **Un tutoriel animé au début** : une courte démonstration montre le geste à faire (main ou flèche animée), en 3 étapes au plus, et se passe d'un toucher. Chaque nouvelle mécanique est présentée de la même façon à sa première apparition.
5. **Pause et Rejouer** : un bouton pause toujours visible pendant la partie (et la touche Échap ou P) fige tout (temps, mouvements, sons) et propose « Reprendre », « Recommencer » et « Accueil ». Le jeu se met aussi en pause tout seul quand l'écran est caché (`visibilitychange`). Même un jeu sans chrono a ce menu.
6. **Des contrôles tactiles et clavier** : tout se joue au doigt (cibles d'au moins 44 px) et aussi au clavier (flèches, Espace, Entrée) ou à la souris.
7. **Un score ou des étoiles par niveau** : 1 à 3 étoiles selon la réussite (ou médailles, objets à collectionner…).
8. **Une progression sauvegardée** (niveaux débloqués, étoiles, meilleur score) dans `localStorage`, toujours dans `try { … } catch (e) { … }` : sans stockage, le jeu marche quand même.
9. **Une sélection des niveaux** : l'écran des niveaux montre ceux qui sont débloqués (avec leurs étoiles) et ceux qui restent fermés ; on peut rejouer n'importe quel niveau débloqué.
10. **Des sons générés avec Web Audio** (aucun fichier audio) pour les actions, réussites, erreurs et fins de niveau, avec un **bouton pour couper le son**, bien visible, dont le choix est mémorisé. Aucun son avant la première action du joueur.
11. **Des animations et des retours visuels soignés** : confettis, étoiles qui s'envolent, compteur qui défile, légère secousse… à chaque action, à chaque réussite et à chaque fin de niveau.
12. **Un écran de victoire et un écran de défaite** : à chaque fin de niveau et en fin de partie, bilan avec score, étoiles gagnées, record battu ou non, et boutons « Niveau suivant » (victoire) ou « Réessayer » (défaite), « Rejouer » et « Niveaux ».
13. **Une présentation riche** dans `game.json` : quelques phrases (principe, objectif, ce qui rend le jeu amusant), en plus de la description courte de la carte du catalogue (section 4).

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

### Langues (obligatoire)

Le site et chaque jeu existent en **5 langues** : français (langue source), anglais, espagnol (neutre), portugais (Brésil), allemand. Détails et exemples : `I18N.md`.

- **Aucun texte en dur** : tout texte visible (HTML, JavaScript, canvas, messages de fin, `aria-label`, `title`) passe par `t('cle', { variables })` ou par un attribut `data-i18n="cle"` (`data-i18n-html`, `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-aria`).
- Dans le `<head>`, juste après `<title>` et avant tout autre script :
  ```html
  <script type="application/json" id="jel-i18n-textes" data-coin="haut-gauche">{ "fr": {…}, "en": {…}, "es": {…}, "pt": {…}, "de": {…} }</script>
  <script id="jel-i18n"></script>
  ```
  puis `node scripts/i18n-jeu.mjs <id>` remplit le second bloc avec le module commun (`public/i18n/i18n.js`).
- Les 5 langues ont **exactement les mêmes clés**, aucune valeur vide, les mêmes `{variables}`. Pluriel : `{ "one": "{n} étoile", "other": "{n} étoiles" }` (variable `n`). Nombres : `JEL_I18N.nombre(x)`.
- Les attributs `data-i18n` sont appliqués au chargement de la page : un élément que le script remplit lui-même au démarrage reste vide dans le HTML, sans `data-i18n`.
- Si le code utilise déjà `t` comme variable (temps, tour…), prendre l'alias `const traduire = window.JEL_I18N.t;`.
- **Bouton de langue** : ajouté tout seul dans le coin `data-coin` (`haut-gauche`, `haut-droite`, `bas-gauche`, `bas-droite`) ; ou `data-place="id1 id2"` pour le mettre dans des éléments du jeu (accueil, pause) ; ou `data-coin="aucun"` et `JEL_I18N.creerSelecteur({ conteneur })` pour le placer soi-même. Il ne cache aucune commande.
- **Ton** : simple, pour enfants, tutoiement (du, tú, você) ; textes courts. L'allemand est environ 30 % plus long : boutons qui peuvent passer à la ligne, pas de largeur fixe. Noms inventés : les adapter s'ils doivent se comprendre ou faire sourire ; noms de marque : jamais traduits.
- **Touches** : lire `event.code` (position de la touche) ; écrire ZQSD en français, WASD dans les autres langues.
- Jeu qui repose sur des mots ou des lettres du français : `"non_traduisible": true` dans `game.json` (l'interface reste traduite, le catalogue indique « en français »).

**Méthode de la boucle de nuit (recommandée pour tout nouveau jeu)** : les textes sont écrits à part, un fichier par langue, dans `i18n-jeu/<id>/` (dossier ignoré par git) :

```json
{ "meta":   { "title": "…", "description": "…", "presentation": "…" },
  "textes": { "cle": "texte", "etoiles": { "one": "{n} étoile", "other": "{n} étoiles" } } }
```

1. Créer le jeu complet en français, avec tous ses textes dans `fr.json`. Après chaque modification : `node scripts/i18n-jeu.mjs --assembler <id>` (range les textes dans `index.html`, crée au besoin le bloc et le module commun, recopie `meta` dans `game.json`).
2. Le jeu terminé, écrire `en.json`, `es.json`, `pt.json` et `de.json` en lisant **seulement** `fr.json` (pas de relecture du code) : mêmes clés, mêmes `{variables}`, meta comprise. Ton simple et vivant, pas de mot à mot.
3. `node scripts/i18n-jeu.mjs --assembler <id>` puis `node scripts/check-i18n.js <id> --sans-site` jusqu'à « tout est bon ». Une erreur de traduction se corrige dans les fichiers `.json`, jamais dans le code du jeu.

## 4. La fiche `game.json`

```json
{
  "id": "nom-du-dossier",
  "title": "Titre du jeu",
  "description": "Une phrase qui donne envie de jouer (10 à 200 caractères).",
  "presentation": "Trois à six phrases : le principe, l'objectif et ce qui rend le jeu amusant (150 à 1 200 caractères).",
  "i18n": {
    "en": { "title": "Game title", "description": "One sentence that makes you want to play.", "presentation": "…" },
    "es": { "title": "…", "description": "…", "presentation": "…" },
    "pt": { "title": "…", "description": "…", "presentation": "…" },
    "de": { "title": "…", "description": "…", "presentation": "…" }
  },
  "genre": "adresse",
  "tags": ["animaux"],
  "ages": "6+",
  "author": "Claude (agent)",
  "added": "AAAA-MM-JJ",
  "version": 1,
  "niveaux": 20,
  "consignes": 2
}
```

- `id` : minuscules sans accents, chiffres et tirets ; identique au nom du dossier.
- `title`, `description` et `presentation` restent en français ; `i18n` donne leur traduction dans les 4 autres langues (obligatoire). `description` : courte phrase de la carte du catalogue ; `presentation` : texte riche et attrayant, utilisé comme description de la page du jeu (référencement).
- `niveaux` : nombre de niveaux du jeu (20 au moins), égal à `window.JEL_NIVEAUX`.
- `consignes` : `2` pour les jeux faits selon ces consignes (posé automatiquement par la boucle de nuit) ; le robot applique alors les règles des nouveaux jeux (20 niveaux, présentation). Les jeux plus anciens n'ont pas ce champ.
- `genre` : **obligatoire**, un seul, choisi dans cette liste fermée (filtres « genre » du catalogue) :
  `adresse`, `action`, `plateforme`, `course`, `sport`, `rythme`, `aventure`, `réflexion`, `stratégie`, `puzzle`, `mémoire`, `observation`, `quiz`, `calcul`, `lecture`, `création`, `simulation`.
  (`action` : jeu rapide où l'on esquive et réagit vite, sans violence ; `observation` : cherche-et-trouve, différences ; `simulation` : soigner un animal, cuisiner, tenir une ferme…)
  La même liste figure dans `scripts/genres.mjs` : modifier les deux ensemble.
- `tags` : 1 à 5 thèmes, en minuscules. Ils rangent le jeu dans les **univers** du catalogue (liste dans `public/regroupements.js`) : utiliser de préférence un tag déjà prévu, par exemple `chevaux`, `animaux`, `judo`, `nature`, `mer`, `espace`, `géographie`, `lecture`, `calcul`, `sciences`, `formes`, `couleurs`, `cubes`, `labyrinthe`, `musique`, `véhicules`, `dinosaures`, `magie`, `fantastique`, `cuisine`, `histoire`, `métiers`, `noël`, `arcade`. Un tag rangé dans aucun univers apparaît seulement dans « Autres thèmes ».
- `ages` : âge minimum conseillé, au format `"6+"` (tuiles d'âge du catalogue : 3-4 ans, 5-6 ans, 7-8 ans, 9 ans et +).
- `idee` : rempli par la boucle de nuit, `id` de l'idée de `idees.json` réalisée par ce jeu (à la fusion, l'idée passe dans `idees-archive.json`). Ne pas le modifier. Facultatif pour un jeu créé à la main.
- Jeu de la boucle de nuit : `genre` et `tags` sont ceux de l'idée (si l'idée n'a pas de tags, l'agent les choisit). La vérification refuse un jeu dont l'entrée du catalogue ne correspond pas.

## 5. La jaquette et les images

- Image portrait 600 × 800 px : `cover.webp` (idéal, moins de 100 Ko), sinon `cover.png` ou `cover.jpg` (moins de 300 Ko).
- La boucle automatique la fabrique elle-même (capture de l'écran d'accueil du jeu, **textes masqués**) : la jaquette ne contient **aucun texte**, car le site affiche le titre traduit en HTML. L'écran d'accueil doit donc avoir un beau dessin, pas seulement du texte.
- **Aucune image ne contient de texte** : ni la jaquette, ni les dessins du jeu (SVG, canvas) ; pas de titre, de lettre ni de chiffre dessinés. Les textes sont toujours écrits par `t()` (section 3), pour être traduits.
- Jaquette faite à la main : sans aucun texte, ou `node scripts/jaquette-sans-texte.mjs <id>`. Si la relecture voit du texte sur la jaquette d'un jeu par ailleurs bon, la boucle refait seulement la jaquette avec ce script.

## 6. Avant de proposer le jeu

```text
node scripts/validate-games.mjs --jouer <id>
node scripts/check-i18n.js <id> --rapport
```

Le robot ouvre le jeu dans un vrai navigateur, le joue 30 secondes au hasard et enregistre des captures d'écran dans `captures/<id>/` : regardez-les. Le résultat doit être « Tout est bon ». La vérification des traductions ouvre le jeu dans les 5 langues : elle doit finir par « tout est bon » ; relisez aussi les textes en dur qu'elle signale. Vérifiez ensuite la grille de la section 7, point par point.

## 7. Grille de validation

Avant d'être publié, chaque jeu de la boucle de nuit passe par la vérification automatique (`boucle-de-nuit.yml`, étape d) : le robot, puis un relecteur Claude qui suit cette grille. **Le jeu n'est publié que si tous les points bloquants sont respectés.** Sinon, la pull request est fermée et l'idée remise en attente : un nouveau jeu sera créé à un prochain passage (3 jeux refusés au plus par idée).

### Contrôles automatiques (robot)

| Point | Bloquant si… |
| --- | --- |
| Chargement | le jeu ne s'ouvre pas dans le lanceur, ou l'écran reste vide |
| Console | une erreur apparaît au démarrage ou pendant 30 secondes de partie au hasard |
| Téléphone | une erreur survient pendant la partie au toucher, sur un écran de 390 × 844 |
| Hors ligne | le jeu tente un appel réseau, ou ne marche pas avec le navigateur coupé du réseau |
| Fichiers | `game.json` incomplet ou invalide, jaquette absente ou trop lourde, `index.html` de plus de 2 Mo, fichier en trop |
| Niveaux | (jeux `"consignes": 2`) moins de 20 niveaux, `window.JEL_NIVEAUX` absent ou différent de `"niveaux"` dans `game.json`, présentation absente ou trop courte |
| Catalogue | le jeu manque au catalogue construit, ou son genre et ses tags ne sont pas ceux de son idée (`scripts/idees.mjs controler`) |
| Traductions | `scripts/check-i18n.js` signale une erreur : langue incomplète, clé manquante, valeur vide, `{variables}` différentes, titre, description ou présentation non traduits, erreur dans une des 5 langues (boucle de nuit et `validate.yml`) |

### Relecture (Claude)

Points bloquants, vérifiés dans le code et sur les captures d'écran du robot :

1. **Écran titre** : titre, consignes claires en une ou deux phrases, gros bouton « Jouer ».
2. **Tutoriel** : démonstration animée du geste au début, et à l'arrivée de chaque nouvelle mécanique.
3. **Pause et Rejouer** : bouton pause visible (et touche Échap ou P) qui fige vraiment le jeu ; « Rejouer » en fin de niveau et en fin de partie.
4. **Progression** : au moins 20 niveaux réellement différents (lus dans le code, pas seulement annoncés), et la difficulté augmente réellement.
5. **Mécaniques** : de vraies nouveautés (mécaniques, obstacles, ennemis, objectifs) au fil des niveaux, qui se combinent.
6. **Jeu complet** : un vrai jeu travaillé et riche, pas un prototype ni un jeu simpliste (niveaux copiés, écrans ou fonctions manquants, contenu maigre).
7. **Récompenses et progression** : score ou étoiles par niveau, progression et record sauvegardés dans `localStorage` à l'intérieur de `try { … } catch (e) { … }`, sélection des niveaux débloqués.
8. **Contrôles** : jouable entièrement au doigt, et au clavier ou à la souris ; cibles tactiles d'au moins 44 px.
9. **Son** : sons Web Audio, bouton pour couper le son visible et mémorisé, aucun son avant la première action.
10. **Effets et fins de niveau** : retours visuels soignés ; écran de victoire et écran de défaite avec score, étoiles, record, « Niveau suivant » ou « Réessayer », et « Rejouer ».
11. **Écran de téléphone** : sur les captures, rien de coupé, de caché ou d'illisible ; pas de défilement de la page.
12. **Contenu** : adapté aux enfants, en français sans faute, création originale ; ni publicité, ni lien, ni achat, ni collecte de données (section 1).
13. **Langues** : aucun texte en dur ; les 5 langues présentes, justes et au ton enfant ; bouton de langue visible sans gêner le jeu ; rien ne déborde en allemand ; aucune image du jeu avec du texte (sections 3 et 5).

À part, non bloquant pour le jeu : **la jaquette** ne contient aucun texte, aucune lettre, aucun chiffre. Sinon, la boucle refait seulement la jaquette (section 5).

Conseils (non bloquants, notés dans la relecture) : amusant dès la première minute, variété d'un niveau à l'autre, de quoi jouer 15 minutes.
