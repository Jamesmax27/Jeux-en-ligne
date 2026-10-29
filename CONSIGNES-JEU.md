# Consignes pour créer un jeu

Règles obligatoires pour toute IA (ou personne) qui ajoute un jeu au site Free Micro Games.
Elles complètent la section 5 de `CLAUDE.md`. Les robots (`scripts/validate-games.mjs`, `scripts/check-i18n.js`, `scripts/verifier-seo.mjs`…) en vérifient une partie automatiquement ; la relecture de la section 7 vérifie le reste avant toute publication.

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
8. **Une progression sauvegardée avec le module commun `save.js`** (section 3, « Sauvegarde ») : reprise au dernier niveau, fenêtre « Continuer » / « Nouvelle partie » au lancement, bouton « Effacer la sauvegarde ». Les autres souvenirs du jeu (niveaux débloqués, étoiles, meilleur score) peuvent aussi aller dans `localStorage`, toujours dans `try { … } catch (e) { … }` : sans stockage, le jeu marche quand même.
9. **Une sélection des niveaux** : l'écran des niveaux montre ceux qui sont débloqués (avec leurs étoiles) et ceux qui restent fermés ; on peut rejouer n'importe quel niveau débloqué.
10. **Des sons générés avec Web Audio** (aucun fichier audio) pour les actions, réussites, erreurs et fins de niveau, avec un **bouton pour couper le son**, bien visible, dont le choix est mémorisé. Aucun son avant la première action du joueur.
11. **Des animations et des retours visuels soignés** : confettis, étoiles qui s'envolent, compteur qui défile, légère secousse… à chaque action, à chaque réussite et à chaque fin de niveau.
12. **Un écran de victoire et un écran de défaite** : à chaque fin de niveau et en fin de partie, bilan avec score, étoiles gagnées, record battu ou non, et boutons « Niveau suivant » (victoire) ou « Réessayer » (défaite), « Rejouer » et « Niveaux ». Chacun signale la fin au site avec `window.FMG.reportEnd` (section 3, « Fin de partie »).
13. **Une page du jeu bien renseignée (référencement)** : en plus du titre et de la description courte de la carte du catalogue, `game.json` donne dans les 5 langues les textes de la page du jeu : titre et description pour les moteurs de recherche, « À propos du jeu », « Comment jouer », compétences travaillées, texte de la jaquette (section 4). Ils sont écrits une fois le jeu terminé, d'après lui seul, et respectent les règles de `scripts/regles-seo.mjs`.

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
- **Suivi des parties : seulement `FMG.reportEnd` dans le jeu** (ci-dessous). Le lanceur place lui-même, en tête de chaque jeu (anciens comme nouveaux), le script commun de suivi (`SCRIPT_SUIVI` dans `public/suivi.js`), qui lui signale les erreurs JavaScript et fournit `window.FMG.reportEnd` ; il mesure aussi le temps de jeu et envoie le tout au site (« Tendances » de l'accueil, onglet « Stats » de la page privée). Le jeu ne contient donc **aucun code réseau** (`fetch`, `sendBeacon`… : bloqués par la règle de sécurité) et ne doit pas empêcher les erreurs d'arriver jusqu'à `window` (pas de `stopImmediatePropagation()` sur l'événement `error`) ; `window.onerror` reste utilisable.
- Code lisible et commenté en français.

### Fin de partie (obligatoire)

Le site compte, pour chaque jeu, les parties gagnées et le niveau atteint, afin de savoir quels jeux plaisent et lesquels sont trop durs. Le jeu le signale en **une ligne** à chaque écran de fin :

```js
if (window.FMG) window.FMG.reportEnd({ completed: true, level: niveau });   // écran de victoire
if (window.FMG) window.FMG.reportEnd({ completed: false, level: niveau });  // écran de défaite
```

- **Où** : dans la fonction qui fait passer le jeu à l'écran de victoire (niveau réussi, partie gagnée) ou de défaite (niveau raté, plus de vies, temps écoulé), **une fois** par fin, jamais dans une fonction de dessin appelée à chaque image. Un écran qui sert aux deux issues peut passer un booléen du jeu : `completed: gagne`.
- **`completed`** : `true` pour une réussite, `false` pour un échec. **`level`** : le numéro du niveau joué, à partir de 1 tel que le joueur le voit (`index + 1` si le code compte à partir de 0) ; jeu sans niveaux : le score ; rien de pertinent : `null`.
- **Jeu sans fin** (bac à sable, coloriage, partie infinie sans game over) : `completed: false, level: <score>` chaque fois que le score augmente (le lanceur garde la plus haute valeur), ou `completed: true, level: null` quand le joueur termine une création ou un objectif.
- Le récapitulatif final qui suit la victoire du dernier niveau ne fait pas de 2e appel. Appels répétés sans risque : le lanceur garde « terminé » dès une victoire et le plus haut niveau.
- **La garde `if (window.FMG)` est obligatoire, sur la même ligne** : ouvert seul (hors du lanceur), le jeu n'a pas `FMG`. Rien d'autre à écrire : pas de script à recopier, le lanceur fournit `FMG` à tous les jeux.
- **Contrôles** : `validate-games.mjs` vérifie qu'il y a au moins un appel, avec sa garde, et que le lanceur fournit `window.FMG` dans le jeu ; la relecture (section 7) vérifie qu'il est au bon endroit (victoire et défaite).

### Sauvegarde (obligatoire)

Tout jeu garde la progression du joueur sur l'appareil, sans compte ni serveur, avec le module commun **`public/save.js`** (`window.JEL_SAVE`). Dans le cadre isolé du site, le jeu n'a pas de stockage : le module passe par le lanceur, qui garde les données dans le `localStorage` du site sous la clé `save_<id>` ; ouvert seul, le jeu utilise directement `localStorage`.

- **Le module** est recopié dans `index.html` (`<script id="jel-sauvegarde">`, juste après le module de traduction `jel-i18n`, avant le code du jeu) par `node scripts/i18n-jeu.mjs --assembler <id>` (ou `node scripts/i18n-jeu.mjs <id>`). Ne jamais l'écrire ni le modifier à la main.
- **Données** : `{ niveau, score, options }` (+ champs propres au jeu si la reprise en a besoin). `niveau` = numéro, à partir de 1, du niveau où reprendre. Sauvegarde absente, illisible ou d'un autre format : valeurs par défaut.
- **Dans le code du jeu** (`const JEU = '<id>';`) :
  1. **Lancement** : le bouton « Jouer » de l'écran titre (et la touche qui fait la même chose) appelle `JEL_SAVE.reprise({ jeu: JEU, onContinuer: (d) => …, onNouvelle: () => … })`. S'il y a une sauvegarde, une fenêtre propose **« Continuer »** (directement au niveau `d.niveau`), **« Nouvelle partie »** (le parcours normal) et **« Effacer la sauvegarde »** (deux touchers) ; ses textes sont déjà traduits dans les 5 langues par le module. Sans sauvegarde, `onNouvelle()` est appelé tout de suite.
  2. **Fin de niveau** : à chaque niveau N réussi, `JEL_SAVE.save(JEU, { niveau: N + 1, score })`.
  3. **Fermeture de la page** : `JEL_SAVE.surFermeture(() => { if (<partie en cours>) JEL_SAVE.save(JEU, { niveau: <niveau en cours>, score }); })` (`visibilitychange`, `pagehide`, `beforeunload`). Jamais d'écriture depuis l'écran titre : elle écraserait une sauvegarde plus avancée.
  4. Jeu sans niveaux (partie sans fin) : `reprise({ …, sansNiveau: true })`, score et état de la partie sauvegardés par paliers et à la fermeture, sauvegarde effacée (`JEL_SAVE.clear(JEU)`) quand la partie est perdue.
  5. Facultatif : `JEL_SAVE.boutonEffacer({ jeu: JEU, conteneur })` place un bouton « Effacer la sauvegarde » sur l'écran titre (caché sans sauvegarde).
- **Contrôles** : `validate-games.mjs` vérifie que le module est présent, à jour et appelé (`reprise`, `save`, `surFermeture`) ; `node scripts/tester-sauvegarde.mjs <id> --captures` vérifie dans le lanceur que la sauvegarde est écrite à la fermeture, relue après rechargement (« Continuer » ramène au niveau sauvegardé) et effacée par le bouton.

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

### Jeux multijoueurs

Un jeu multijoueur (à plusieurs en ligne, robots aux places vides) suit **toutes** les règles de ce document, plus celles de **`docs/multijoueur.md`**, à lire en entier avant d'écrire le cahier de conception. L'essentiel :

- `game.json` : `"multijoueur": true` et `"places"` (2 à 10, le même nombre que `places` dans les règles du jeu).
- Règles du jeu dans `<script id="jel-regles">` (`window.JEL_REGLES` : fonctions pures, au tour par tour, sans `Date` ni `Math.random`, hasard par `alea`), après le moteur commun `<script id="jel-multi">` (recopié par `node scripts/i18n-jeu.mjs --assembler <id>`, jamais à la main) et avant le code du jeu. Le jeu n'a toujours **aucun code réseau** : c'est le lanceur qui se connecte au serveur.
- Écran titre : « Jouer » (le premier bouton : 20 niveaux solo contre des robots, sauvegarde) et « Avec d'autres joueurs » (`data-multi="jouer"`, partie en ligne créée par `JEL_MULTI.creer`). Jouable entièrement hors ligne contre les robots.
- Robots crédibles et battables ; places montrées par une couleur ou un animal avec « Toi », robot ou vrai joueur ; **aucun nom tapé, aucun message entre joueurs**.
- Contrôle : `node scripts/tester-multijoueur.mjs <id> --navigateur` jusqu'à « Multijoueur : tout est bon », et regarder les captures de `captures/multijoueur/<id>/`.

**Méthode de la boucle de nuit (recommandée pour tout nouveau jeu)** : les textes sont écrits à part, un fichier par langue, dans `i18n-jeu/<id>/` (dossier ignoré par git) :

```json
{ "meta":   { "title": "…", "description": "…", "titre_seo": "…", "description_seo": "…",
              "presentation": "…", "regles": "…", "competences": "…", "jaquette_alt": "…" },
  "textes": { "cle": "texte", "etoiles": { "one": "{n} étoile", "other": "{n} étoiles" } } }
```

1. Créer le jeu complet en français, avec tous ses textes dans `fr.json` (dans `meta`, d'abord `title` et `description`). Après chaque modification : `node scripts/i18n-jeu.mjs --assembler <id>` (range les textes dans `index.html`, crée au besoin le bloc et le module commun, recopie `meta` dans `game.json`).
2. Le jeu terminé et relu, écrire dans la `meta` de `fr.json` les textes de la page du jeu (`titre_seo`, `description_seo`, `presentation`, `regles`, `competences`, `jaquette_alt` : section 4), d'après le jeu fabriqué et son code. Puis `--assembler` et `node scripts/regles-seo.mjs <id>`, jusqu'à ce qu'il ne reste aucune ligne « ERREUR : <id> : fr : … ».
3. Écrire `en.json`, `es.json`, `pt.json` et `de.json` en lisant **seulement** `fr.json` (pas de relecture du code) : mêmes clés, mêmes `{variables}`, **toute** la meta traduite, avec les mêmes bornes de longueur dans chaque langue (reformuler, sans couper ni ajouter d'idée). Ton simple et vivant, pas de mot à mot.
4. `node scripts/i18n-jeu.mjs --assembler <id>`, puis `node scripts/check-i18n.js <id> --sans-site` jusqu'à « tout est bon », `node scripts/regles-seo.mjs <id>` jusqu'à « Textes SEO : tout est bon », et enfin `node scripts/verifier-seo.mjs <id>` jusqu'à « Référencement : tout est bon » (section 6). Une erreur de traduction ou de référencement se corrige dans les fichiers `.json`, jamais dans le code du jeu ni directement dans `game.json`.

**Retoucher seulement les textes de la fiche d'un jeu publié** (le jeu ne change pas) : écrire les champs à changer dans `i18n-jeu/<id>/<langue>.json` sous la forme `{ "meta": { "champ": "…" } }` (un champ absent ne change pas), puis `node scripts/i18n-jeu.mjs --meta <id>` : il range la meta dans `game.json` et pose `"maj"` à la date du jour, sans toucher à `index.html`. Ensuite, mêmes contrôles qu'au point 4.

## 4. La fiche `game.json`

```json
{
  "id": "nom-du-dossier",
  "title": "Titre du jeu",
  "description": "Une phrase qui donne envie de jouer (10 à 200 caractères).",
  "titre_seo": "Titre du jeu : ce qu'est le jeu, pour qui (50 à 60 caractères)",
  "description_seo": "Ce qu'on fait dans ce jeu et ce qui le rend amusant (140 à 160 caractères).",
  "presentation": "« À propos du jeu » : principe, univers, ce qui rend le jeu amusant (70 à 150 mots).",
  "regles": "« Comment jouer » : but, geste au doigt et touches du clavier, étoiles, nombre réel de niveaux (50 à 130 mots).",
  "competences": "logique, mémoire visuelle, anticipation",
  "jaquette_alt": "Ce que montre le dessin de la jaquette (40 à 125 caractères).",
  "i18n": {
    "en": { "title": "…", "description": "…", "titre_seo": "…", "description_seo": "…", "presentation": "…", "regles": "…", "competences": "…", "jaquette_alt": "…" },
    "es": { "title": "…", "description": "…", "titre_seo": "…", "description_seo": "…", "presentation": "…", "regles": "…", "competences": "…", "jaquette_alt": "…" },
    "pt": { "title": "…", "description": "…", "titre_seo": "…", "description_seo": "…", "presentation": "…", "regles": "…", "competences": "…", "jaquette_alt": "…" },
    "de": { "title": "…", "description": "…", "titre_seo": "…", "description_seo": "…", "presentation": "…", "regles": "…", "competences": "…", "jaquette_alt": "…" }
  },
  "genre": "puzzle",
  "genres_secondaires": ["aventure"],
  "univers": ["dinosaures"],
  "ages": "6+",
  "author": "Claude (agent)",
  "added": "AAAA-MM-JJ",
  "version": 1,
  "niveaux": 20,
  "consignes": 2
}
```

- `id` : minuscules sans accents, chiffres et tirets ; identique au nom du dossier. Il ne change jamais : il sert dans l'adresse de la page du jeu (`/jeux/<id>/`, `/en/games/<id>/`…).
- Les textes restent en français à la racine ; `i18n` donne leur traduction dans les 4 autres langues (obligatoire). `title` (60 caractères au plus) : titre de la carte et de la page du jeu. `description` (10 à 200 caractères) : phrase courte de la carte du catalogue, reprise en accroche sous le titre de la page.
- `niveaux` : nombre de niveaux du jeu (20 au moins), égal à `window.JEL_NIVEAUX`.
- `multijoueur` et `places` (jeu multijoueur seulement, section 3 « Jeux multijoueurs ») : `true` et le nombre fixe de places, de 2 à 10. Ils donnent l'étiquette « Multi » de la jaquette et la rubrique « Multijoueur » du catalogue. Un jeu de la boucle de nuit est multijoueur si et seulement si son idée l'est.
- `consignes` : `2` pour les jeux faits selon ces consignes (posé automatiquement par la boucle de nuit) ; le robot applique alors les règles des nouveaux jeux (20 niveaux, présentation obligatoire). Les jeux plus anciens n'ont pas ce champ.
- `version` : à augmenter quand `index.html` ou la jaquette changent (le numéro est dans leur adresse : les téléphones reprennent alors la nouvelle copie). Une retouche des seuls textes de `game.json` ne la change pas : elle met à jour `maj`.
- `maj` (facultatif, racine seulement) : date de la dernière modification du jeu ou de ses textes, `AAAA-MM-JJ`, jamais avant `added` ni dans le futur. Elle sert de date de mise à jour au sitemap (sinon `added`). `node scripts/i18n-jeu.mjs --meta <id>` la pose tout seul ; après une modification du jeu, la mettre à la date du jour.
- **Genres et univers : listes fermées.** Elles sont dans un seul fichier de référence, `public/taxonomie.js` (identifiant court sans accents, libellé affiché) ; on écrit dans `game.json` les **identifiants**, jamais un libellé ni un mot inventé. **Interdit de créer un genre ou un univers** : seul le propriétaire du site modifie ces listes. « `autre` » seulement si rien ne correspond : il n'est jamais affiché sur le site (ni filtre, ni page), le jeu reste trouvable par ses autres genres et univers. Le robot (`scripts/controle-taxonomie.mjs`, `validate-games.mjs`) refuse toute autre valeur, et les anciens identifiants retirés en octobre 2026 (`reflexes`, `tir`, `ferme`, `abstrait`…, table `ANCIENS_IDS` de `taxonomie.js`).
- `genre` : **obligatoire**, le genre principal (le cœur du jeu : comment on joue), un seul identifiant parmi les 13 (entre parenthèses, ce que chacun regroupe) :
  `puzzle` (puzzles, casse-tête, logique, labyrinthes), `memoire` (mémoire, paires, objets cachés, différences, observation), `quiz` (quiz et culture), `mots` (mots et lettres), `calcul` (calcul et nombres), `arcade` (arcade, réflexes, clic rapide, visée et tir sur cible), `plateforme` (plateforme), `course` (course, glisse, épreuves de vitesse), `aventure` (aventure, exploration, jeu de rôle et progression, combats d'adresse), `strategie` (stratégie, défense de tour, jeux de société et de cartes), `simulation` (simulation, soin, gestion et tycoon), `creation` (habillage, coloriage, dessin, bac à sable et construction), `musique` (musique et rythme), `autre` (rien d'autre ne correspond).
  Contenu pour enfants dans tous les genres : visée et duels sans violence réaliste (viser des cibles, endormir, esquiver).
- `genres_secondaires` : 0 à 2 autres genres de la même liste, seulement s'ils sont vraiment au cœur du jeu (liste vide `[]` sinon), différents du genre principal ; jamais `autre`. Le filtre d'un genre montre aussi les jeux où il est secondaire.
- `univers` : **obligatoire**, 1 ou 2 identifiants parmi les 12 (de quoi parle le jeu : son décor, ses personnages) :
  `animaux` (animaux de la ferme, sauvages, de compagnie ; pas les chevaux), `chevaux` (chevaux et poneys), `dinosaures` (dinosaures et préhistoire), `ocean` (océan, mer, plage, pirates), `nature` (nature, jardin, insectes, saisons et fêtes du calendrier), `fantasy` (magie, fées, dragons, monstres, contes et légendes), `espace` (espace, robots, futur), `monde` (pays, drapeaux, histoire, chevaliers et Moyen Âge), `ville` (ville et métiers, dont les métiers de la santé et le corps humain), `vehicules` (véhicules), `sport` (sport), `cuisine` (cuisine et nourriture), `autre` (seul : jeu sans décor figuratif, formes et couleurs).
- Le champ `tags` n'existe plus (remplacé par `univers`) : une fiche qui le garde est refusée.
- `ages` : âge minimum conseillé, au format `"6+"` (tuiles d'âge du catalogue : 3-4 ans, 5-6 ans, 7-8 ans, 9 ans et + ; pages d'âge du site ; « Conseillé dès 6 ans » sur la page du jeu). C'est le seul champ d'âge.
- `idee` : rempli par la boucle de nuit, `id` de l'idée de `idees.json` réalisée par ce jeu (à la fusion, l'idée passe dans `idees-archive.json`). Ne pas le modifier. Facultatif pour un jeu créé à la main.
- Jeu de la boucle de nuit : `genre`, `genres_secondaires`, `univers` et `ages` sont ceux de l'idée (si l'idée ne donne pas d'univers, de genres secondaires ou d'âge, l'agent les choisit). La vérification refuse un jeu dont l'entrée du catalogue ne correspond pas à son idée, ou qui sort des listes.
- **Idées de jeux** (`idees.json`, agent d'idéation) : mêmes listes, mêmes règles, âge dans le champ `ages` (« 6+ ») ; privilégier les combinaisons genre × univers encore peu couvertes par les jeux existants (`node scripts/idees.mjs catalogue` les liste). Les idées ajoutées par le propriétaire (source `humain`) restent toujours fabriquées en premier.

### Textes de la page du jeu (référencement)

Chaque jeu a sa page, générée au build dans les 5 langues (gabarit unique `gabarits/jeu.html`, adresses `/jeux/<id>/`, `/en/games/<id>/`…) : c'est elle que trouvent les moteurs de recherche, et son bouton « Jouer » ouvre le lanceur. Ses textes viennent de `game.json`, en français à la racine et traduits dans `i18n` :

| Champ | Où il apparaît | Bornes (dans chaque langue) | Ce qu'il dit |
| --- | --- | --- | --- |
| `titre_seo` | titre de l'onglet et du résultat de recherche (`<title>`), sans le nom du site | 50 à 60 caractères | commence par le nom du jeu, puis ce qu'il est (genre, univers ou âge) ; différent de `title` |
| `description_seo` | description du résultat de recherche, du partage sur les réseaux et des données structurées | 140 à 160 caractères | ce qu'on fait dans ce jeu et ce qui le rend amusant |
| `presentation` | « À propos du jeu » | 70 à 150 mots | principe, univers, ce qui rend le jeu amusant |
| `regles` | « Comment jouer » | 50 à 130 mots | le but ; le geste au doigt **et** les touches du clavier (ou la souris) ; comment on gagne des étoiles et comment on perd ; le nombre réel de niveaux |
| `competences` | « Ce que le jeu fait travailler : » | 20 à 160 caractères | 2 à 4 compétences séparées par des virgules, minuscule au début (sauf les noms en allemand), sans point final |
| `jaquette_alt` | texte de remplacement de la jaquette (lecteurs d'écran, recherche d'images) | 40 à 125 caractères | ce que montre le dessin, sans commencer par « Image de… » ni « Jaquette… » |

- Bloc de texte affiché (présentation + règles + compétences + ligne d'âge) : **150 à 300 mots** dans chaque langue.
- `titre_seo` et `description_seo` sont **uniques** : aucun autre jeu n'a les mêmes, dans aucune langue.
- Tout est tiré du jeu réellement fabriqué et de son code : nombre réel de niveaux (`window.JEL_NIVEAUX`), gestes et touches réellement gérés, étoiles telles que le code les calcule, âge de `ages`. Les textes décrivent **ce** jeu, et lui seul.
- Interdits : marque ou personnage existant, même pour comparer (liste `MARQUES` de `scripts/regles-seo.mjs`) ; formule passe-partout (« plonge dans », « des heures de », « petits et grands », « toute la famille »…) ; promesse fausse (mode, fonction ou contenu absent du jeu) ; chiffre non vérifié dans le code ; phrase reprise d'un autre jeu (dans la présentation, 10 mots identiques à la suite sont refusés ; dans les règles, où les commandes se décrivent souvent pareil, c'est un simple avertissement).
- Exemples : `titre_seo` « Potager Express : jeu de gestion de ferme gratuit dès 6 ans » ; `competences` « gestion de l'argent, organisation, rapidité de réaction » ; `jaquette_alt` « Carotte, tomate, fraise, potiron, maïs et salade dans six parcelles en bois, avec une poule, un lapin et une vache au soleil ».
- Règles et bornes : un seul fichier, `scripts/regles-seo.mjs`. En cas de doute, c'est lui qui a raison. `node scripts/regles-seo.mjs <id>` contrôle ces champs ; `node scripts/verifier-seo.mjs <id>` construit le site et contrôle la page du jeu (section 6).
- Un jeu dont les textes ne sont pas conformes a une page cachée aux moteurs de recherche (`noindex`, hors du sitemap). S'il a été ajouté à partir du 24 octobre 2026 (`REGLES_SEO_DEPUIS` dans `scripts/regles-seo.mjs`), il n'est **pas publié** du tout.

## 5. La jaquette et les images

- Image portrait 600 × 800 px : `cover.webp` (idéal, moins de 100 Ko), sinon `cover.png` ou `cover.jpg` (moins de 300 Ko).
- La boucle automatique la fabrique elle-même, d'après le jeu terminé (capture de l'écran d'accueil du jeu, **textes masqués** ; une jaquette provisoire faite pendant la fabrication par `--covers` est remplacée) : la jaquette ne contient **aucun texte**, car le site affiche le titre traduit en HTML. L'écran d'accueil doit donc avoir un beau dessin, pas seulement du texte.
- **Aucune image ne contient de texte** : ni la jaquette, ni les dessins du jeu (SVG, canvas) ; pas de titre, de lettre ni de chiffre dessinés. Les textes sont toujours écrits par `t()` (section 3), pour être traduits.
- Jaquette faite à la main : sans aucun texte, ou `node scripts/jaquette-sans-texte.mjs <id>`. Si la relecture voit du texte sur la jaquette d'un jeu par ailleurs bon, la boucle refait seulement la jaquette avec ce script.
- La jaquette sert aussi d'image de partage de la page du jeu (réseaux sociaux) si elle est en `.webp`, `.png` ou `.jpg` ; une jaquette `.svg` est alors remplacée par l'icône du site. Son texte de remplacement est `jaquette_alt` (section 4) : il décrit le dessin de l'écran d'accueil, d'après lequel la jaquette automatique est faite.

## 6. Avant de proposer le jeu

```text
node scripts/validate-games.mjs --jouer <id>      (ajouter --covers si le jeu n'a pas encore de jaquette)
node scripts/check-i18n.js <id> --rapport
node scripts/tester-sauvegarde.mjs <id> --captures (sauvegarde : écriture, reprise, effacement)
node scripts/regles-seo.mjs <id>                   (textes de la page du jeu, sans construire le site)
node scripts/verifier-seo.mjs <id>                 (construit le site, puis contrôle la page du jeu)
node scripts/tester-multijoueur.mjs <id> --navigateur  (jeu multijoueur seulement : docs/multijoueur.md)
```

Le robot ouvre le jeu dans un vrai navigateur, le joue 30 secondes au hasard et enregistre des captures d'écran dans `captures/<id>/` : regardez-les. Le résultat doit être « Tout est bon ». La vérification des traductions ouvre le jeu dans les 5 langues : elle doit finir par « tout est bon » ; relisez aussi les textes en dur qu'elle signale. Les textes de la page du jeu doivent donner « Textes SEO : tout est bon », puis le contrôle du référencement « Référencement : tout est bon » : seules les lignes « ERREUR » qui citent votre jeu bloquent, les lignes « attention » sur d'autres jeux sont à ignorer. Raccourcis : `npm run seo-textes -- <id>` et `npm run seo -- <id>`. Vérifiez ensuite la grille de la section 7, point par point.

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
| Niveaux | (jeux `"consignes": 2`) moins de 20 niveaux, `window.JEL_NIVEAUX` absent ou différent de `"niveaux"` dans `game.json`, présentation absente |
| Catalogue | le jeu manque au catalogue construit, ou son genre, ses univers et son âge ne sont pas ceux de son idée (`scripts/idees.mjs controler`) |
| Genres et univers | un genre, un genre secondaire ou un univers hors des listes fermées de `public/taxonomie.js`, ou l'ancien champ `tags` (`scripts/controle-taxonomie.mjs`) |
| Sauvegarde | module `save.js` absent, pas à jour ou pas appelé (`validate-games.mjs`), ou `scripts/tester-sauvegarde.mjs` signale un problème : rien d'écrit à la fermeture, pas de fenêtre « Continuer » avec une sauvegarde, « Continuer » qui ne ramène pas au niveau sauvegardé, effacement sans effet |
| Fin de partie | aucun appel à `window.FMG.reportEnd`, ou un appel sans la garde `if (window.FMG)` sur la même ligne (`validate-games.mjs`, section 3 « Fin de partie ») |
| Traductions | `scripts/check-i18n.js` signale une erreur : langue incomplète, clé manquante, valeur vide, `{variables}` différentes, titre, description ou présentation non traduits, erreur dans une des 5 langues (boucle de nuit et `validate.yml`) |
| Multijoueur | (jeu `"multijoueur": true`) `"places"` absent ou hors de 2 à 10, moteur `jel-multi` absent ou pas à jour, règles `jel-regles` absentes, impures (réseau, page, `Date`, `Math.random`…) ou différentes d'un appareil à l'autre, manche sans fin, remplacement robot / joueur ou départ d'un joueur qui casse la partie, robots imbattables ou toujours pareils, Worker qui refuse le jeu, jeu qui ne passe pas en ligne avec le faux serveur ou ne continue pas après une coupure (`scripts/tester-multijoueur.mjs <id> --navigateur`, `validate-games.mjs`) ; ou jeu multijoueur alors que son idée ne l'est pas, ou l'inverse (`scripts/idees.mjs controler`) |
| Référencement | `scripts/verifier-seo.mjs <id>` signale une erreur sur ce jeu : texte de la page manquant ou hors bornes dans une des 5 langues (section 4), bloc de texte hors de 150 à 300 mots, marque protégée, titre ou description identique à celui d'un autre jeu, phrase de 10 mots reprise d'un autre jeu, page du jeu mal construite (titre, description, H1, liens, jeux similaires…) (boucle de nuit et `validate.yml`) |

### Relecture (Claude)

Points bloquants, vérifiés dans le code et sur les captures d'écran du robot :

1. **Écran titre** : titre, consignes claires en une ou deux phrases, gros bouton « Jouer ».
2. **Tutoriel** : démonstration animée du geste au début, et à l'arrivée de chaque nouvelle mécanique.
3. **Pause et Rejouer** : bouton pause visible (et touche Échap ou P) qui fige vraiment le jeu ; « Rejouer » en fin de niveau et en fin de partie.
4. **Progression** : au moins 20 niveaux réellement différents (lus dans le code, pas seulement annoncés), et la difficulté augmente réellement.
5. **Mécaniques** : de vraies nouveautés (mécaniques, obstacles, ennemis, objectifs) au fil des niveaux, qui se combinent.
6. **Jeu complet** : un vrai jeu travaillé et riche, pas un prototype ni un jeu simpliste (niveaux copiés, écrans ou fonctions manquants, contenu maigre).
7. **Récompenses et progression** : score ou étoiles par niveau, sélection des niveaux débloqués ; sauvegarde avec `save.js` (section 3) : « Continuer » / « Nouvelle partie » au bouton Jouer, sauvegarde à chaque fin de niveau et à la fermeture (seulement pendant une partie) ; record et autres données dans `localStorage` à l'intérieur de `try { … } catch (e) { … }`.
8. **Contrôles** : jouable entièrement au doigt, et au clavier ou à la souris ; cibles tactiles d'au moins 44 px.
9. **Son** : sons Web Audio, bouton pour couper le son visible et mémorisé, aucun son avant la première action.
10. **Effets et fins de niveau** : retours visuels soignés ; écran de victoire et écran de défaite avec score, étoiles, record, « Niveau suivant » ou « Réessayer », et « Rejouer ». Chaque écran de fin appelle `window.FMG.reportEnd` (section 3, « Fin de partie ») au bon endroit, une fois par fin : `completed: true` à la victoire, `false` à la défaite, `level` = numéro du niveau joué (à partir de 1) ou score.
11. **Écran de téléphone** : sur les captures, rien de coupé, de caché ou d'illisible ; pas de défilement de la page.
12. **Contenu** : adapté aux enfants, en français sans faute, création originale ; ni publicité, ni lien, ni achat, ni collecte de données (section 1).
13. **Langues** : aucun texte en dur ; les 5 langues présentes, justes et au ton enfant ; bouton de langue visible sans gêner le jeu ; rien ne déborde en allemand ; aucune image du jeu avec du texte (sections 3 et 5).
14. **Page du jeu** : les textes de référencement de `game.json` (`titre_seo`, `description_seo`, `presentation`, `regles`, `competences` ; en français, et au moins les nombres dans les traductions) sont fidèles au code : règles et gestes réels (doigt et clavier), nombre réel de niveaux, étoiles, âge cohérent avec `ages`. Ils décrivent **ce** jeu (pas un texte passe-partout), sans promesse fausse (mode, fonction ou contenu absent du jeu) ni marque ou personnage existant (section 4). Les longueurs sont déjà contrôlées par le robot.
15. **Multijoueur** (jeu `"multijoueur": true`, `docs/multijoueur.md` section 9, captures de `captures/multijoueur/<id>/`) : au tour par tour ; robots crédibles et battables ; places montrées avec « Toi », robot ou vrai joueur, sans nom tapé ni message libre ; arrivée et départ d'un vrai joueur visibles ; messages traduits (recherche de joueurs, robots locaux, connexion perdue) ; lisible et fluide sur téléphone avec toutes les places occupées ; 20 niveaux solo jouables hors ligne.

À part, non bloquant pour le jeu : **la jaquette** ne contient aucun texte, aucune lettre, aucun chiffre. Sinon, la boucle refait seulement la jaquette (section 5).

Conseils (non bloquants, notés dans la relecture) : amusant dès la première minute, variété d'un niveau à l'autre, de quoi jouer 15 minutes ; texte de la jaquette (`jaquette_alt`) qui correspond bien à ce qu'elle montre.
