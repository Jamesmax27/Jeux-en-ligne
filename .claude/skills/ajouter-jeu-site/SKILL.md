---
name: ajouter-jeu-site
description: Ajoute un jeu HTML à Free Micro Games (freemicrogames.com) depuis Claude Code, dans le dépôt local Jeux-en-ligne. Le jeu est mis aux règles (5 langues, sauvegarde save.js, 20 niveaux), reçoit une jaquette cover.webp sans texte et un game.json complet (genre, univers, âge, textes de référencement dans les 5 langues), passe tous les contrôles du dépôt sur la machine, puis part sur une branche jeu-manuel/<id> avec une pull request, que Claude fusionne une fois tous les contrôles verts (CLAUDE.md, section 12). À utiliser dès que l'utilisateur dit « ajoute ce jeu au site », « publie ce jeu », « pousse ce jeu sur mon site » ou équivalent dans Claude Code. Dans Claude Code, cette version passe avant la compétence claude.ai du même nom (anthropic-skills:ajouter-jeu-site).
---

# Ajouter un jeu à Free Micro Games (Claude Code, dépôt local)

Version de la compétence pour Claude Code, avec le dépôt ouvert sur la machine. La version pour claude.ai (connecteur GitHub seul) est dans `outils/ajouter-jeu-site/` ; les règles de fond sont les mêmes. Elles viennent du dépôt : si ce fichier contredit `CLAUDE.md`, `CONSIGNES-JEU.md` ou un script de `scripts/`, le dépôt a raison (le signaler à l'utilisateur).

## Contexte fixe

- Un jeu = un dossier `games/<id>/` qui contient exactement `index.html`, `cover.webp` et `game.json`. Tout le reste (catalogue, page du jeu dans les 5 langues, catégories, jeux similaires, sitemap) est généré au build : on n'écrit rien d'autre.
- Même méthode que la boucle de nuit (`CONSIGNES-JEU.md`, section 3, « Méthode de la boucle de nuit ») : les textes sont écrits dans `i18n-jeu/<id>/{fr,en,es,pt,de}.json` (dossier ignoré par git), puis rangés par `node scripts/i18n-jeu.mjs --assembler <id>`. Ce script crée le bloc `jel-i18n-textes`, recopie les modules `jel-i18n` (`public/i18n/i18n.js`) et `jel-sauvegarde` (`public/save.js`) et remplit les textes de `game.json`. Ne jamais écrire ces blocs ni ces champs à la main : un texte se corrige dans `i18n-jeu/<id>/*.json`, puis on relance `--assembler`.
- `idees.json` et `idees-archive.json` : lecture seule. Après la fusion, la boucle de nuit archive elle-même l'idée d'un jeu dont `game.json` porte `"idee"`.
- Contrôles dans un navigateur (Playwright) : si son Chromium manque, utiliser Edge, dans la même commande PowerShell que le contrôle : `$env:CHROMIUM_PATH = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"; node scripts/…`. La première ligne de `check-i18n.js` doit dire « avec navigateur » : sinon il a sauté cette partie sans échouer.
- git : si `git` n'est pas dans le PATH, prendre celui de GitHub Desktop (`Get-ChildItem "$env:LOCALAPPDATA\GitHubDesktop" -Recurse -Filter git.exe`, chemin en `…\cmd\git.exe`). Il n'a pas les identifiants GitHub : l'utilisateur envoie la branche (« Publish branch » dans GitHub Desktop), puis la pull request s'ouvre avec le connecteur GitHub (dépôt `Jamesmax27/Jeux-en-ligne`).

## Entrée

- Le jeu HTML : fichier sur le disque, fichier joint, artefact ou code de la conversation.
- Facultatif : titre, genre, univers, âge conseillé, idée d'origine, image de jaquette.

## Étapes

### 1. Préparer

- `git status` : copie de travail pas propre, ou pas sur `main` → demander à l'utilisateur avant de continuer (ne rien jeter).
- Comparer le dernier commit de `main` en local à celui de GitHub (connecteur, `list_commits` sur `main`). Si `main` local est en retard sur autre chose que `idees.json` et `idees-archive.json`, demander à l'utilisateur de faire « Pull origin » dans GitHub Desktop.
- Lire `CONSIGNES-JEU.md` en entier (minimum obligatoire, section 2 ; règles techniques, sauvegarde et langues, section 3 ; fiche, section 4 ; jaquette, section 5 ; contrôles, section 6 ; grille de validation, section 7), `public/taxonomie.js` (13 genres, 12 univers, tranches d'âge ; ce que regroupe chacun : `CONSIGNES-JEU.md`, section 4) et l'en-tête de `scripts/regles-seo.mjs` (`BORNES`, `BLOC_MOTS`, `MARQUES`).

### 2. Récupérer et lire le jeu

Prendre le code HTML complet et final (plusieurs versions : la dernière, à confirmer avec l'utilisateur). Lire tout le code : données des niveaux, gestes au doigt, touches du clavier, souris, calcul des étoiles, victoire et défaite, mécaniques qui arrivent au fil des niveaux. Ces faits serviront aux textes de l'étape 9.

### 3. Doublons et idée d'origine

- `node scripts/idees.mjs catalogue` (titres, genres et univers des jeux publiés) et `node scripts/idees.mjs archive` (idées déjà réalisées) : jeu très proche d'un jeu existant → demander avant de continuer.
- Chercher dans `idees.json` l'idée qui correspond au jeu, ou celle que l'utilisateur désigne :
  - trouvée : son `id` ira dans `"idee"`. Le genre, les genres secondaires, les univers et l'âge sont repris de l'idée : `ages`, sinon « Âge conseillé : N+ » à la fin de sa description (`idees.mjs controler` le vérifie) ;
  - statut `en_cours` : une tâche de la boucle de nuit fabrique déjà ce jeu → prévenir et demander ;
  - statut `en_attente` : prévenir que la boucle (00:17 et 05:17 UTC) peut choisir cette idée si la pull request n'est pas fusionnée avant son prochain passage.

### 4. Classement et écarts : une seule question

Proposer en une seule question, puis attendre la réponse :

- **titre** (60 caractères au plus) et **id** : minuscules sans accents, chiffres et tirets, absent de `games/`. Il ne changera plus : il est dans l'adresse de la page du jeu ;
- **genre** principal (un parmi les 13) ; **genres_secondaires** : 0 à 2 autres, seulement s'ils sont au cœur du jeu, jamais `autre` ; **univers** : 1 ou 2 parmi les 12 (`autre` seul si rien ne correspond : jamais affiché sur le site) ; **ages** : âge minimum, au format `"6+"`. Uniquement les identifiants de `public/taxonomie.js` : interdit d'en créer, et le champ `tags` n'existe plus ;
- `"non_traduisible": true` si le jeu repose sur des mots ou des lettres du français (l'interface reste traduite) ;
- les **écarts** avec le minimum obligatoire de `CONSIGNES-JEU.md`, section 2 : écran titre, 20 niveaux au moins, nouveautés au fil des niveaux, tutoriel animé, pause et Rejouer, tactile et clavier, étoiles, sauvegarde `save.js`, sélection des niveaux, sons Web Audio avec bouton pour couper, effets, écrans de victoire et de défaite. Proposer de compléter le jeu (conseillé) ou de le publier tel quel : c'est l'utilisateur qui décide. `"consignes": 2` seulement si tout le minimum est respecté.

### 5. Branche

`git checkout -b jeu-manuel/<id>` depuis `main`. Si la branche existe déjà (essai précédent), demander : la reprendre ou choisir un autre id.

### 6. Mettre le jeu aux règles

Garder le jeu de l'utilisateur : corriger et compléter, sans rien retirer de son contenu.

1. **`games/<id>/game.json`**, sans les textes (`--assembler` les ajoute et range les champs dans l'ordre) :

   ```json
   {
     "id": "<id>",
     "genre": "puzzle",
     "genres_secondaires": [],
     "univers": ["dinosaures"],
     "ages": "6+",
     "author": "Claude",
     "added": "AAAA-MM-JJ",
     "version": 1,
     "niveaux": 20,
     "consignes": 2,
     "idee": "id-de-l-idee"
   }
   ```

   `added` = date du jour (heure de Paris) ; `author` = `"Claude"` ou le nom donné par l'utilisateur ; `niveaux` = nombre réel de niveaux ; `consignes` et `idee` seulement si les étapes 4 et 3 les justifient ; `"non_traduisible": true` si besoin. Jamais `tags`, pas de `maj` pour un nouveau jeu.
2. **`games/<id>/index.html`** :
   - **Technique** : un seul fichier de moins de 2 Mo, `<html lang="fr">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, un `<title>`. Aucune adresse `http(s)://` (seuls les espaces de noms `http://www.w3.org/…` sont tolérés) ni `//…` : pas de CDN, de police ou d'image en ligne, ni de `fetch`, `XMLHttpRequest`, `sendBeacon` ou `WebSocket`. Pas d'`alert()`, `confirm()`, `prompt()`, `window.open()` ni de `<form>`. Tout accès à `localStorage` (ou `sessionStorage`, `indexedDB`) dans `try { … } catch (e) { … }`. Aucun code de suivi en dehors de `FMG.reportEnd` (ci-dessous) : le lanceur s'en charge (pas de `stopImmediatePropagation()` sur l'événement `error`).
   - **Jouabilité** : tout au doigt (cibles d'au moins 44 px) et au clavier ou à la souris ; pensé pour un téléphone en portrait (360 à 430 px de large) ; pas de défilement de la page pendant le jeu ; règles expliquées à l'écran au démarrage.
   - **Contenu** : adapté aux enfants, création originale (aucun personnage, nom, logo ou univers protégé), ni publicité, ni achat, ni lien, ni collecte de données. Aucune image avec du texte : ni lettre ni chiffre dessinés en SVG ou en canvas.
   - **Langues** : aucun texte visible en dur (HTML, JavaScript, canvas, messages, `aria-label`, `title`) : `t('cle', { variables })` (si `t` est déjà une variable du jeu : `const traduire = window.JEL_I18N.t;`) ou `data-i18n="cle"` (`data-i18n-html`, `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-aria`). Nombres avec `JEL_I18N.nombre(x)`, touches lues avec `event.code`. Pas de largeur fixe sur les boutons (l'allemand est environ 30 % plus long).
   - **Niveaux** : `window.JEL_NIVEAUX = NIVEAUX.length;`, tiré des données des niveaux (même nombre que `"niveaux"`).
   - **Sauvegarde** : `const JEU = '<id>';`. Le bouton « Jouer » de l'écran titre appelle `JEL_SAVE.reprise({ jeu: JEU, onContinuer: (d) => <reprise au niveau d.niveau>, onNouvelle: () => <début normal> })`. Chaque niveau N réussi appelle `JEL_SAVE.save(JEU, { niveau: N + 1, score })`. Et `JEL_SAVE.surFermeture(() => { if (<partie en cours>) JEL_SAVE.save(JEU, { niveau: <niveau en cours>, score }); })`. Jamais d'écriture depuis l'écran titre (jeu sans niveaux : `CONSIGNES-JEU.md`, « Sauvegarde »).
   - **Fin de partie** : dans la fonction qui passe à l'écran de victoire, `if (window.FMG) window.FMG.reportEnd({ completed: true, level: <numéro du niveau, à partir de 1> });` ; dans celle de l'écran de défaite, la même avec `completed: false`. Une fois par fin (pas dans une fonction de dessin appelée à chaque image), garde `if (window.FMG)` sur la même ligne ; jeu sans niveaux ou sans fin : `CONSIGNES-JEU.md`, « Fin de partie ». Le lanceur fournit `FMG` : rien à recopier.
3. **`i18n-jeu/<id>/fr.json`** : `{ "meta": { "title": "…", "description": "…" }, "textes": { "cle": "texte", "etoiles": { "one": "{n} étoile", "other": "{n} étoiles" } } }`. `description` = phrase courte et vivante de la carte du catalogue (10 à 200 caractères). Les autres champs de `meta` s'écrivent à l'étape 9.
4. `node scripts/i18n-jeu.mjs --assembler <id>` après chaque modification de `fr.json`. Le bloc créé porte `data-coin="haut-gauche"` (bouton de langue) : le changer si le bouton cache une commande (`haut-droite`, `bas-gauche`, `bas-droite`, `data-place="id…"`, ou `data-coin="aucun"` puis `JEL_I18N.creerSelecteur()`).

### 7. Jouer avec le robot et relire

- `node scripts/validate-games.mjs --jouer --covers <id>` : ouvre le jeu dans le lanceur (téléphone 390 × 844, au toucher, puis hors ligne), le joue 30 secondes au hasard, enregistre des captures dans `captures/<id>/` et crée une jaquette provisoire. Regarder chaque capture avec Read : rien de coupé, d'illisible ou de figé. Corriger, puis relancer jusqu'à « Tout est bon ».
- `node scripts/tester-sauvegarde.mjs <id> --captures`, jusqu'à « Sauvegarde : tout est bon ».
- Relire avec la grille de `CONSIGNES-JEU.md`, section 7 : les niveaux annoncés existent vraiment, la difficulté progresse, les nouveautés arrivent. Si le jeu a beaucoup changé, le montrer à l'utilisateur avant de continuer.

### 8. Jaquette

- Supprimer la jaquette provisoire (`games/<id>/cover.*`), puis lancer `node scripts/jaquette-sans-texte.mjs <id> --sortie cover.webp` : capture de l'écran titre, textes masqués, 600 × 800. Si l'écran titre ne suffit pas : `--clic "<sélecteur>"`, `--touche <touche>`, `--attendre <ms>`, `--cacher "<sélecteur>"`, `--fin`.
- La regarder avec Read : aucun texte (ni lettre ni chiffre), un vrai dessin. Moins de 100 Ko, sinon relancer avec `--qualite 70`.
- Image fournie par l'utilisateur : seulement si elle fait 600 × 800 et ne contient aucun texte ; la déposer sous `cover.webp` (moins de 100 Ko), ou `cover.png` ou `cover.jpg` (moins de 300 Ko).
- Un seul fichier `cover.*` dans le dossier.

### 9. Textes de la page du jeu (en français)

Compléter `meta` dans `i18n-jeu/<id>/fr.json`. Mêmes bornes, plus tard, dans chaque langue :

| Champ | Rôle | Bornes |
| --- | --- | --- |
| `title` | nom du jeu (carte, page du jeu) | 60 caractères au plus |
| `description` | phrase courte de la carte du catalogue | 10 à 200 caractères |
| `titre_seo` | balise `<title>` de la page du jeu, sans le nom du site | 50 à 60 caractères |
| `description_seo` | meta description (aussi pour le partage et les données structurées) | 140 à 160 caractères |
| `presentation` | « À propos du jeu » : principe, univers, ce qui rend le jeu amusant | 70 à 150 mots |
| `regles` | « Comment jouer » : but, gestes au doigt **et** touches du clavier ou souris, comment gagner les étoiles ou perdre, nombre réel de niveaux | 50 à 130 mots |
| `competences` | 2 à 4 compétences, séparées par des virgules, minuscule au début, sans point final | 20 à 160 caractères |
| `jaquette_alt` | ce que montre la jaquette de l'étape 8 (sans commencer par « Image de », « Jaquette »…) | 40 à 125 caractères |

Présentation + règles + compétences + ligne d'âge : **150 à 300 mots** dans chaque langue.

Rédaction :

- **D'après le jeu et son code** : nombre réel de niveaux (`window.JEL_NIVEAUX`), gestes et touches réellement gérés, étoiles telles que le code les calcule, âge de `ages`. Aucun chiffre, aucune fonction ni aucun mode absents du code.
- **Propre à ce jeu** : ni formule passe-partout (« plonge dans », « des heures de », « petits et grands », « toute la famille », « aventure inoubliable », « expérience unique », ni leurs équivalents dans les autres langues), ni phrase reprise d'un autre jeu (10 mots identiques à la suite sont refusés). `titre_seo` commence par le nom du jeu, puis dit ce qu'il est (genre, univers, âge, « gratuit »), sans se contenter de répéter `title`. `titre_seo` et `description_seo` diffèrent de ceux de tous les autres jeux, dans chaque langue.
- **Aucune marque** ni personnage protégé, même pour comparer (liste `MARQUES` de `scripts/regles-seo.mjs`).

Puis `node scripts/i18n-jeu.mjs --assembler <id>` et `node scripts/regles-seo.mjs <id>`, jusqu'à ce qu'il ne reste aucune ligne « ERREUR : <id> : fr : … » (les autres langues sont faites à l'étape 10).

### 10. Traductions

- Lire **seulement** `i18n-jeu/<id>/fr.json` (ne pas relire le code) et écrire `en.json` (anglais), `es.json` (espagnol neutre), `pt.json` (portugais du Brésil) et `de.json` (allemand). Exactement les mêmes clés, les mêmes `{variables}`, les pluriels `{ "one": …, "other": … }` gardés, et **toute** la `meta` traduite, avec les bornes de l'étape 9 dans chaque langue : reformuler pour les tenir, sans couper ni ajouter d'idée.
- Ton simple et vivant pour des enfants, tutoiement (du, tú, você), jamais de mot à mot. Touches : ZQSD en français, WASD dans les autres langues. Noms inventés adaptés s'ils doivent se comprendre ou faire sourire.
- `node scripts/i18n-jeu.mjs --assembler <id>`, puis :
  - `node scripts/check-i18n.js <id> --sans-site --rapport` jusqu'à « Traductions : tout est bon » (avec navigateur) ; relire aussi les textes en dur qu'il signale ;
  - `node scripts/regles-seo.mjs <id>` jusqu'à « Textes SEO : tout est bon » ;
  - `node scripts/verifier-seo.mjs <id>` (construit le site et contrôle la page du jeu dans les 5 langues) jusqu'à « Référencement : tout est bon ». Seules les lignes « ERREUR » qui citent ce jeu bloquent ; les lignes « attention » des autres jeux sont à ignorer.
- Toute correction se fait dans `i18n-jeu/<id>/*.json`, puis `--assembler`, jamais directement dans `index.html` ni `game.json`.

### 11. Humanizer des descriptions (s'il existe)

Seulement si `scripts/humanizer.mjs` et `.claude/skills/humanizer/SKILL.md` sont dans le dépôt. C'est la même étape que dans la boucle de nuit, et elle ne bloque jamais : en cas d'échec, on garde les textes d'origine.

1. `node scripts/humanizer.mjs preparer .humanizer <id>`.
2. Lire `.claude/skills/humanizer/SKILL.md` et l'appliquer (texte final seulement). Pour chaque langue, lire `.humanizer/<langue>.json` et écrire `.humanizer/<langue>.sortie.json` sous la forme `{ "<id>": { "description": "…", "description_seo": "…", "presentation": "…" } }` (`titre` sert de contexte, il n'est jamais réécrit). Chaque langue est réécrite dans sa langue, jamais traduite d'une autre. On garde le sens, chaque nombre, chaque nom et le titre du jeu, sans ajouter de fait. Même ton (tu, you, tú, você, du). Longueur à ±20 %, `description_seo` de 140 à 160 caractères, `presentation` de 70 à 150 mots, `description` de 200 caractères au plus. Un seul paragraphe, apostrophes et guillemets de l'original, aucun tiret long.
3. `node scripts/humanizer.mjs controler .humanizer` jusqu'à « 0 refusés ».
4. `node scripts/humanizer.mjs appliquer .humanizer` (sans `--maj` : le jeu est nouveau), puis `node scripts/regles-seo.mjs <id>`.

Le humanizer écrit directement dans `game.json`. Un `--assembler` lancé après remettrait les anciens textes : faire cette étape en dernier, ou la refaire après.

### 12. Contrôle final

Avec `CHROMIUM_PATH` si besoin, dans cet ordre :

```text
node scripts/validate-games.mjs --jouer <id>
node scripts/check-i18n.js <id> --rapport
node scripts/tester-sauvegarde.mjs <id>
node scripts/controle-taxonomie.mjs <id>
node scripts/verifier-seo.mjs <id>
node scripts/idees.mjs controler <id>        (seulement avec "idee" ; après verifier-seo, qui construit le catalogue)
```

Tout doit être bon. Puis `git status` : seuls `games/<id>/index.html`, `games/<id>/cover.webp` et `games/<id>/game.json` sont nouveaux. Tout autre changement ne s'enregistre pas. Une page de `public/` encore suivie par git et régénérée par le build se remet comme avant (`git checkout -- <fichier>`). Pour le reste, le signaler à l'utilisateur.

### 13. Publier

1. Enregistrer ces trois fichiers seulement, en un commit « Ajout manuel : <titre> » sur `jeu-manuel/<id>`.
2. Demander à l'utilisateur de cliquer « Publish branch » dans GitHub Desktop, et attendre sa réponse.
3. Ouvrir la pull request avec le connecteur GitHub : base `main`, branche `jeu-manuel/<id>`, titre « Nouveau jeu : <titre> (<id>) », description :

   ```markdown
   ## <titre> (`<id>`)

   <description du catalogue>

   - Genre : <genre> (secondaires : <…>) · univers : <…> · âge : <ages>
   - Niveaux : <n> (`window.JEL_NIVEAUX`) · consignes 2 : <oui / non, écarts : …>
   - Idée d'origine : `<id de l'idée>` (archivée par la boucle de nuit après la fusion) / aucune
   - Fichiers : `games/<id>/index.html`, `games/<id>/cover.webp`, `games/<id>/game.json`, rien d'autre

   ### Ce qui a été changé dans le jeu
   - … (textes passés en 5 langues, sauvegarde, corrections techniques, compléments)

   ### Contrôles lancés en local
   - validate-games --jouer, check-i18n (5 langues, avec navigateur), tester-sauvegarde, controle-taxonomie, regles-seo, verifier-seo<, idees controler> : tout est bon
   - Humanizer des descriptions : <n textes réécrits / pas disponible>

   ### À vérifier en jouant
   - … (points incertains)

   ### Avant la fusion
   Le contrôle **« Contrôle des jeux »** (`validate.yml`) doit être **vert**. Claude fusionne ensuite la pull request (CLAUDE.md, section 12).
   La page du jeu dans les 5 langues, les pages de catégories, les jeux similaires et le sitemap sont générés au build : cette pull request ne touche que `games/<id>/`.
   ```

4. Donner le lien de la pull request à l'utilisateur. Suivre les contrôles avec le connecteur (`pull_request_read`, `get_check_runs`). Quand tous sont terminés et verts (« Contrôle des jeux » compris), et qu'aucune pull request de la boucle de nuit n'est ouverte, fusionner la pull request avec le connecteur (`merge_pull_request`, sans redemander : autorisation du propriétaire, CLAUDE.md section 12) et le dire à l'utilisateur. Si l'utilisateur a demandé de ne pas fusionner, s'arrêter là. Revenir ensuite sur `main` (`git checkout main`).

Contrôle rouge : lire le rapport avec le connecteur, revenir sur `jeu-manuel/<id>`, corriger seulement `games/<id>/` par un nouveau commit, puis demander à l'utilisateur de cliquer « Push origin ».

### Mettre à jour un jeu déjà publié

Même méthode, sur une branche `jeu-manuel/<id>`. Ne changer ni `id` ni `added`.

- **Textes de la fiche seulement** (le jeu ne change pas) : écrire les champs à changer dans `i18n-jeu/<id>/<langue>.json` sous la forme `{ "meta": { "champ": "…" } }`, puis `node scripts/i18n-jeu.mjs --meta <id>`. Il pose `maj` à la date du jour et ne touche ni `index.html` ni `version`.
- **Jeu modifié** : `i18n-jeu/<id>/` n'existe plus pour un jeu publié. Modifier le bloc `jel-i18n-textes` de `index.html` dans les 5 langues (mêmes clés), puis `node scripts/i18n-jeu.mjs <id>` (modules à jour). Augmenter `version` de 1 (aussi pour une nouvelle jaquette), poser `"maj"` = date du jour, et remettre à jour les textes de la page s'ils ne décrivent plus le jeu.
- Mêmes contrôles qu'à l'étape 12. Autre voie : l'onglet « Modifier un jeu » de la page privée `/idees`, traité par `demande-modification.yml`.

## Interdits

- Créer ou modifier autre chose que `games/<id>/` (`index.html`, `cover.*`, `game.json`) : jamais `public/` (dont `catalog.json` et les pages générées), `gabarits/`, `scripts/`, les workflows, `idees.json`, `idees-archive.json`, `CLAUDE.md`, ni les autres jeux.
- Pousser sur `main` ; fusionner une pull request dont un contrôle est rouge ou pas terminé, ou qui n'est pas celle de ce jeu ; fermer une pull request sans accord.
- Créer un genre ou un univers, utiliser un champ `tags`.
- Toucher aux réglages Cloudflare, aux secrets, aux clés Turnstile, au nom de domaine, aux votes ou à la base D1.
- Mettre dans un jeu de la publicité, un traceur, un lien externe, un achat ou une collecte de données.
