---
name: ajouter-jeu-site
description: Publie sur Free Micro Games, le site de mini-jeux de Jérémy (freemicrogames.com ; dépôt GitHub Jamesmax27/Jeux-en-ligne, déployé sur Cloudflare Pages), un jeu HTML créé dans n'importe quelle conversation. À utiliser dès que l'utilisateur dit « pousse ce jeu sur mon site », « ajoute ce jeu au site », « publie ce jeu » ou équivalent. Prépare le seul dossier du jeu dans games/ (jeu en 5 langues, jaquette sans texte, game.json avec genre, univers, âge, traductions et textes de référencement) sur une branche jeu-manuel/…, puis ouvre une pull request via le connecteur GitHub, sans jamais fusionner.
---

# Publier un jeu HTML sur Free Micro Games (version 2)

## Contexte fixe

- Dépôt : `Jamesmax27/Jeux-en-ligne`, branche principale `main`. Site : **Free Micro Games** (freemicrogames.com), publié par Cloudflare Pages à chaque fusion sur `main`. Public familial, enfants compris.
- Un jeu = un dossier `games/<id>/` qui contient exactement `index.html`, une jaquette `cover.*` et `game.json`. Les fiches `games/*/game.json` sont le catalogue de référence.
- **Tout le reste est généré au build** : `public/catalog.json`, la page du jeu dans les 5 langues, les pages de catégories (genres, univers, âges), les jeux similaires, le sitemap et `robots.txt`. On n'écrit rien d'autre que `games/<id>/`.
- Les idées de jeux (`idees.json`, `idees-archive.json`) appartiennent à la boucle de nuit : lecture seule. Après la fusion, la boucle archive elle-même l'idée d'un jeu dont `game.json` porte le champ `"idee"`.
- Tous les accès au dépôt passent par le connecteur GitHub (lecture de fichiers, création de branche, commit, pull request). Sans connecteur, ou sans droit d'écriture sur le dépôt, le dire et s'arrêter.
- Si l'outil d'exécution de code est disponible, s'en servir pour compter et contrôler (étapes 7 et 8). Sinon, compter à la main avec une marge et le dire à l'utilisateur.

## Entrée

- Le jeu HTML : artefact, fichier joint ou code de la conversation en cours.
- Facultatif : titre, genre, univers, âge conseillé, idée d'origine, jaquette.

## Étapes

### 1. Lire les règles du dépôt, avant tout

Lire sur `main`, via le connecteur, sans rien supposer :

- `CLAUDE.md` : surtout la section 5 (format d'un jeu, langues, jouabilité, interdits de contenu), puis les sections 10 à 12 (ajout par une IA, interdits).
- `CONSIGNES-JEU.md` en entier : minimum obligatoire (section 2), règles techniques et langues (section 3), fiche `game.json` (section 4), jaquette (section 5), grille de validation (section 7).
- `public/taxonomie.js` : les 26 genres et les 24 univers (listes fermées, identifiants exacts), les tranches d'âge.
- `scripts/regles-seo.mjs` : bornes et interdits des textes de référencement. C'est la source unique : si ses valeurs diffèrent du tableau de l'étape 7, le fichier a raison.
- `public/i18n/i18n.js` : le module commun de traduction, à recopier tel quel dans le jeu.
- `public/save.js` : le module commun de sauvegarde, à recopier tel quel dans le jeu (`CONSIGNES-JEU.md`, section 3 « Sauvegarde »).
- La liste des dossiers de `games/`, et un ou deux `game.json` récents comme modèle de forme (sans en reprendre les phrases).

Si un de ces fichiers manque ou contredit cette compétence, le dépôt a raison : le signaler à l'utilisateur et suivre le dépôt.

### 2. Récupérer le jeu

Identifier le code HTML complet et final dans la conversation. S'il y a plusieurs versions, prendre la dernière et la confirmer à l'utilisateur.

Lire tout le code : les niveaux (données réelles), les gestes au doigt, les touches du clavier, la souris, les conditions d'étoiles, de victoire et de défaite, les mécaniques qui apparaissent au fil des niveaux. Ces faits servent aux textes de l'étape 7.

### 3. Doublons et idée d'origine

- Comparer titre et concept avec les jeux publiés (`title` des `games/*/game.json`) et les titres de `idees-archive.json`. Jeu très proche d'un jeu existant : demander avant de continuer.
- Chercher dans `idees.json` (lecture seule) l'idée qui correspond au jeu, ou celle que l'utilisateur désigne :
  - trouvée : son `id` ira dans `"idee"` de `game.json` ; le genre, les genres secondaires, les univers (si l'idée en donne) et l'âge (`ages`, sinon « Âge conseillé : N+ » à la fin de sa description) sont repris de l'idée ;
  - statut `en_cours` : une tâche de la boucle de nuit fabrique déjà ce jeu. Prévenir et demander avant de continuer ;
  - statut `en_attente` : prévenir que la boucle de nuit (00:00 et 05:00 UTC) peut choisir cette idée si la pull request n'est pas fusionnée avant son prochain passage.
- Ne jamais écrire dans `idees.json` ni dans `idees-archive.json`.

### 4. Classement et écarts : une seule question

Proposer en une seule question, puis attendre la validation :

- **titre** (60 caractères au plus) et **id** : minuscules sans accents, chiffres et tirets, absent de `games/` (il donne aussi le nom de la branche `jeu-manuel/<id>`) ;
- **genre** principal : un identifiant parmi les 26 ; **genres_secondaires** : 0 à 2 autres, seulement s'ils sont au cœur du jeu, jamais `autre` ;
- **univers** : 1 ou 2 identifiants parmi les 24 (`autre` seul, si rien ne correspond) ;
- **ages** : âge minimum conseillé, au format `"6+"` ;
- `"non_traduisible": true` si le jeu repose sur des mots ou des lettres du français (l'interface reste traduite) ;
- les **écarts** avec le minimum obligatoire de `CONSIGNES-JEU.md`, section 2 (écran titre, 20 niveaux au moins, tutoriel animé, pause et Rejouer, étoiles, sauvegarde, sélection des niveaux, sons Web Audio avec bouton pour couper, effets, écrans de victoire et de défaite), et la proposition : compléter le jeu, ou le publier tel quel. C'est l'utilisateur qui décide.

Genres et univers : **uniquement** les identifiants de `public/taxonomie.js`. Interdit de créer un genre ou un univers. Le champ `tags` n'existe plus.

### 5. Mettre le jeu aux règles (`index.html`)

Garder le jeu de l'utilisateur : corriger et compléter, sans rien retirer de son contenu.

- **Technique** : un seul fichier de moins de 2 Mo, `<html lang="fr">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`. Aucune adresse `http(s)://` (seuls les espaces de noms `http://www.w3.org/…` sont tolérés) ni `//…` : pas de CDN, de police ou d'image en ligne, ni de `fetch`, `XMLHttpRequest`, `sendBeacon` ou `WebSocket`. Pas de `alert()`, `confirm()`, `prompt()`, `window.open()`, ni de `<form>`. Tout accès à `localStorage` (ou `sessionStorage`, `indexedDB`) dans `try { … } catch (e) { … }` : le jeu tourne dans un cadre isolé et doit marcher sans stockage. Aucun code de suivi : le lanceur du site s'en charge (ne pas arrêter les erreurs avec `stopImmediatePropagation()`).
- **Jouabilité** : tout au doigt (cibles d'au moins 44 px) **et** au clavier ou à la souris ; pensé pour un téléphone en portrait (360 à 430 px de large) ; pas de défilement de la page pendant le jeu ; règles expliquées à l'écran au démarrage.
- **Contenu** : adapté aux enfants, création originale (aucun personnage, nom, logo ou univers protégé), ni publicité, ni achat, ni lien, ni collecte de données. Aucune image avec du texte : ni lettre ni chiffre dessinés en SVG ou en canvas.
- **Langues** (`CONSIGNES-JEU.md`, section 3) :
  - aucun texte visible en dur : HTML, JavaScript, canvas, messages, `aria-label` et `title` passent par `t('cle', { variables })` ou `data-i18n="cle"` (`data-i18n-html`, `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-aria`) ; si `t` est déjà une variable du jeu, prendre `const traduire = window.JEL_I18N.t;` ;
  - dans le `<head>`, juste après `<title>` et avant tout autre script, le bloc `<script type="application/json" id="jel-i18n-textes" data-coin="haut-gauche">{ "fr": {…}, "en": {…}, "es": {…}, "pt": {…}, "de": {…} }</script>` : mêmes clés dans les 5 langues, aucune valeur vide, mêmes `{variables}`, pluriels `{ "one": "…", "other": "…" }` (variable `n`) ; dans ce JSON, `<` s'écrit `<` ;
  - juste après, `<script id="jel-i18n">` … `</script>` contenant la **copie exacte et complète** de `public/i18n/i18n.js` lu à l'étape 1 (ni résumé, ni retouche) ;
  - bouton de langue : `data-coin` (`haut-gauche`, `haut-droite`, `bas-gauche`, `bas-droite`), ou `data-place="id…"` (dans des éléments du jeu), ou `data-coin="aucun"` puis `JEL_I18N.creerSelecteur()` ; il ne cache aucune commande ;
  - traductions en anglais, espagnol neutre, portugais du Brésil et allemand : ton simple pour enfants, tutoiement (du, tú, você), pas de mot à mot ; l'allemand est environ 30 % plus long (pas de largeur fixe sur les boutons) ; touches lues avec `event.code`, ZQSD écrit en français et WASD dans les autres langues.
- **Niveaux** : le jeu donne son nombre réel de niveaux, tiré de ses données : `window.JEL_NIVEAUX = NIVEAUX.length;` (même nombre que `"niveaux"` dans `game.json`).
- **Sauvegarde (obligatoire)** : juste après le module `jel-i18n`, `<script id="jel-sauvegarde">` … `</script>` contenant la **copie exacte et complète** de `public/save.js` lu à l'étape 1. Dans le code du jeu (`const JEU = '<id>';`) : le bouton « Jouer » de l'écran titre appelle `JEL_SAVE.reprise({ jeu: JEU, onContinuer: (d) => <reprise au niveau d.niveau>, onNouvelle: () => <début normal> })` (« Continuer » / « Nouvelle partie » / « Effacer la sauvegarde », textes déjà traduits) ; chaque niveau N réussi appelle `JEL_SAVE.save(JEU, { niveau: N + 1, score })` ; `JEL_SAVE.surFermeture(() => { if (<partie en cours>) JEL_SAVE.save(JEU, { niveau: <niveau en cours>, score }); })`. Le robot vérifie que le module est à jour et que ces trois appels existent.

Si les changements sont importants, montrer le jeu final à l'utilisateur (artefact) avant de le publier.

### 6. La jaquette

- Le connecteur ne transporte que du texte : dessiner une jaquette **`cover.svg`** (`width="600" height="800" viewBox="0 0 600 800"`) d'après l'écran d'accueil et l'univers du jeu, de moins de 100 Ko, sans aucune ressource externe.
- **Aucun texte** : ni élément `<text>`, ni titre, ni lettre, ni chiffre dessinés. Le site affiche le titre traduit en bandeau.
- Si l'utilisateur fournit une image (600 × 800, sans texte) : publier quand même `cover.svg`, puis lui indiquer comment la déposer sur la branche depuis le site GitHub (« Add file » puis « Upload files », sous le nom `cover.webp`, et supprimer `cover.svg`).

### 7. La fiche `game.json`

Fiche complète, JSON indenté de 2 espaces, champs dans cet ordre :

```json
{
  "id": "mon-jeu",
  "title": "…",
  "description": "…",
  "titre_seo": "…",
  "description_seo": "…",
  "presentation": "…",
  "regles": "…",
  "competences": "…",
  "jaquette_alt": "…",
  "i18n": {
    "en": { "title": "…", "description": "…", "titre_seo": "…", "description_seo": "…", "presentation": "…", "regles": "…", "competences": "…", "jaquette_alt": "…" },
    "es": { "…": "les mêmes 8 champs" },
    "pt": { "…": "les mêmes 8 champs" },
    "de": { "…": "les mêmes 8 champs" }
  },
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

- `id` = nom du dossier ; `added` = date du jour (heure de Paris) ; `version` = 1 ; `author` = `"Claude"` (ou le nom donné par l'utilisateur).
- `niveaux` = nombre réel de niveaux (`window.JEL_NIVEAUX`). `"consignes": 2` **seulement** si le jeu respecte tout le minimum de `CONSIGNES-JEU.md` (section 2), dont 20 niveaux au moins : le robot l'exige alors. Sinon, pas de champ `consignes`.
- `idee` seulement si le jeu vient d'une idée de `idees.json` (étape 3). `"non_traduisible": true` seulement si besoin (étape 4).
- Jamais de `tags`. Pas de `maj` pour un nouveau jeu.

**Textes** : français à la racine, traductions dans `i18n.en`, `i18n.es`, `i18n.pt` et `i18n.de`. Mêmes bornes dans **chaque** langue :

| Champ | Rôle | Bornes |
| --- | --- | --- |
| `title` | nom du jeu (carte, page du jeu) | 60 caractères au plus |
| `description` | phrase courte de la carte du catalogue | 10 à 200 caractères |
| `titre_seo` | balise `<title>` complète de la page du jeu, sans le nom du site | 50 à 60 caractères |
| `description_seo` | meta description (aussi pour le partage et les données structurées) | 140 à 160 caractères |
| `presentation` | « À propos du jeu » : principe, univers, ce qui rend le jeu amusant | 70 à 150 mots |
| `regles` | « Comment jouer » : but, gestes au doigt **et** touches du clavier ou souris, comment gagner les étoiles ou perdre, nombre réel de niveaux | 50 à 130 mots |
| `competences` | 2 à 4 compétences, séparées par des virgules, minuscule au début, sans point final | 20 à 160 caractères |
| `jaquette_alt` | ce que montre la jaquette (sans commencer par « image de », « jaquette »…) | 40 à 125 caractères |

Le bloc affiché sur la page (présentation + règles + compétences + ligne d'âge) fait **150 à 300 mots** dans chaque langue. Les caractères se comptent en points de code, espaces compris ; les mots, comme `Intl.Segmenter`.

Rédaction :

- **D'après le code du jeu** : nombre réel de niveaux, gestes, touches, étoiles, mécaniques et nouveautés effectivement programmés. Aucun chiffre ni aucune fonction absents du code.
- **Propre à ce jeu** : ni formule passe-partout (« plonge dans », « des heures de », « petits et grands », « toute la famille », « aventure inoubliable », « expérience unique », ni leurs équivalents dans les autres langues), ni phrase reprise d'un autre jeu. `titre_seo` et `description_seo` diffèrent de ceux de tous les autres jeux, dans chaque langue : commencer `titre_seo` par le nom du jeu, puis dire ce qu'il est (genre, univers, âge, « gratuit »), sans se contenter de répéter `title`.
- **Aucune marque** ni personnage protégé, même pour comparer (« comme Pac-Man ») : voir la liste `MARQUES` de `scripts/regles-seo.mjs`.
- `jaquette_alt` décrit la jaquette réellement dessinée à l'étape 6.
- Traductions : rédigées dans chaque langue avec les mêmes faits et le même ton, puis recomptées (l'allemand dépasse souvent).

Depuis le 24 octobre 2026 (`REGLES_SEO_DEPUIS` dans `scripts/regles-seo.mjs`), un jeu dont ces textes ne respectent pas les règles n'est **pas publié**, même fusionné.

### 8. Vérifier avant de pousser

Avec l'outil d'exécution de code :

1. Recréer un petit dépôt local : `site/scripts/regles-seo.mjs` (copie exacte du fichier du dépôt) et `site/games/<id>/game.json`, puis lancer `node site/scripts/regles-seo.mjs <id>`. Le résultat doit être « Textes SEO : tout est bon » (code de sortie 0) ; corriger les textes et relancer jusque-là. Ce contrôle local ne voit pas les autres jeux : les doublons de `titre_seo` et `description_seo` restent à éviter par la rédaction (étape 7).
2. Contrôler `index.html` par un petit script : bloc `jel-i18n-textes` lisible en JSON ; 5 langues avec exactement les mêmes clés, aucune valeur vide, mêmes `{variables}` ; toutes les clés utilisées par `t('…')` et `data-i18n*` présentes ; module `jel-i18n` identique à `public/i18n/i18n.js` ; module `jel-sauvegarde` identique à `public/save.js`, placé juste après, et appels `JEL_SAVE.reprise(`, `JEL_SAVE.save(` et `JEL_SAVE.surFermeture(` présents ; `window.JEL_NIVEAUX` présent et égal à `"niveaux"` ; aucune adresse `http(s)://` hors `www.w3.org` ; ni `alert(`, `confirm(`, `prompt(` ou `window.open(` ; moins de 2 Mo.

Comptage, si `regles-seo.mjs` est introuvable (Node) :

```js
const caracteres = (s) => [...s].length;
const mots = (s, lang) => [...new Intl.Segmenter(lang, { granularity: 'word' }).segment(s)].filter((x) => x.isWordLike).length;
```

Sans outil de code : compter à la main avec une marge (par exemple `titre_seo` vers 55 caractères, `description_seo` vers 150) et faire les mêmes contrôles en relisant.

Dans tous les cas : `game.json` valide, genres et univers dans les listes, dossier limité à `index.html`, `cover.svg` et `game.json`, aucune fonction du jeu cassée par la traduction. Signaler tout problème restant et proposer une correction.

### 9. Publier

1. Créer la branche `jeu-manuel/<id>` depuis la dernière version de `main`. Si elle existe déjà (essai précédent), demander : la reprendre (même pull request) ou choisir un autre id.
2. Pousser **en un seul commit**, « Ajout manuel : <titre> », les seuls fichiers `games/<id>/index.html`, `games/<id>/cover.svg` et `games/<id>/game.json`.
3. Ouvrir une pull request vers `main`, titre « Nouveau jeu : <titre> (<id>) », avec cette description :

   ```markdown
   ## <titre> (`<id>`)

   <description du catalogue>

   - Genre : <genre> (secondaires : <…>) · univers : <…> · âge : <ages>
   - Niveaux : <n> (`window.JEL_NIVEAUX`) · consignes 2 : <oui / non, écarts : …>
   - Idée d'origine : `<id de l'idée>` (archivée par la boucle de nuit après la fusion) / aucune
   - Fichiers : `games/<id>/index.html`, `games/<id>/cover.svg`, `games/<id>/game.json`, rien d'autre

   ### Ce qui a été changé dans le jeu
   - … (textes passés en 5 langues, corrections techniques, compléments)

   ### À vérifier
   - … (points incertains ; jaquette SVG dessinée à la main, à remplacer si besoin par une capture sans texte : `node scripts/jaquette-sans-texte.mjs <id> --sortie cover.webp`, puis supprimer `cover.svg`)

   ### Avant la fusion
   Le contrôle **« Contrôle des jeux »** (`validate.yml`) doit être **vert** : jeu ouvert dans un vrai navigateur, genres et univers, référencement (`scripts/verifier-seo.mjs`), traductions dans les 5 langues. La fusion est faite à la main par le propriétaire.
   La page du jeu dans les 5 langues, les pages de catégories, les jeux similaires et le sitemap sont générés automatiquement au build : cette pull request ne touche que `games/<id>/`.
   Correction : nouveau commit sur la branche `jeu-manuel/<id>`, ou commentaire `@claude …` dans cette pull request.
   ```

4. Ne pas fusionner. Donner le lien de la pull request à l'utilisateur et lui rappeler d'attendre que « Contrôle des jeux » soit vert.

Si l'utilisateur revient avec un contrôle rouge : lire le rapport du contrôle via le connecteur, puis corriger seulement `games/<id>/` par un nouveau commit sur la même branche.

### Mettre à jour un jeu déjà publié

Même méthode, sur une branche `jeu-manuel/<id>` : ne changer ni `id` ni `added`, augmenter `version` de 1, poser `"maj"` = date du jour (juste après `added`), et remettre à jour les textes de référencement s'ils ne décrivent plus le jeu.

## Interdits

- Créer ou modifier autre chose que `games/<id>/` (`index.html`, `cover.*`, `game.json`) : jamais `public/` (dont `catalog.json` et les pages générées), `gabarits/`, `scripts/`, les workflows, `idees.json`, `idees-archive.json`, `CLAUDE.md`, ni les autres jeux.
- Pousser sur `main`, fusionner une pull request (même avec un contrôle vert) ou la fermer sans accord.
- Créer un genre ou un univers, utiliser un champ `tags`.
- Toucher aux réglages Cloudflare, aux secrets, aux clés Turnstile, au nom de domaine, aux votes ou à la base D1.
- Mettre dans un jeu de la publicité, un traceur, un lien externe, un achat ou une collecte de données.
