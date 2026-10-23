# Free Micro Games (anciennement Jeux-en-ligne) — mise en place de la phase 1

Ce dossier contient tout le site de la phase 1 : catalogue avec jaquettes, recherche, thèmes, lanceur de jeu et un jeu d'exemple (« Pommes du poney »).
Votes et mode hors ligne arriveront en phases 2 et 3.

---

## 1. Copier les fichiers dans votre dépôt

1. Décompressez le fichier .zip.
2. Ouvrez le dossier de votre dépôt `Jeux-en-ligne` sur votre ordinateur (celui cloné avec GitHub Desktop).
3. Copiez-y **tout le contenu** du dossier décompressé, y compris le fichier caché `.gitignore`.
   - Windows : dans l'Explorateur, menu Affichage → cochez « Éléments masqués » pour voir `.gitignore`.
   - Mac : dans le Finder, touches Cmd + Maj + . pour afficher les fichiers cachés.
4. Si votre dépôt contenait déjà des jeux (fichiers .html à la racine), ne les supprimez pas : vous les rangerez à l'étape 3.

Vous devez obtenir :

```text
Jeux-en-ligne/
├─ CLAUDE.md
├─ LISEZ-MOI.md
├─ package.json
├─ .gitignore
├─ games/
│  └─ pommes-du-poney/   (index.html, cover.webp, game.json)
├─ gabarits/             (modèles des pages générées : accueil, page d'un jeu, catégorie, 404)
├─ public/               (play.html, app.js, play.js, style.css, _headers, assets/ ;
│                         l'accueil index.html et les pages des jeux sont générés au build)
└─ scripts/              (build-catalog.mjs, pages-seo.mjs, verifier-seo.mjs, serve.mjs…)
```

## 2. Tester sur votre ordinateur

1. Ouvrez le dossier `Jeux-en-ligne` dans VS Code (Fichier → Ouvrir le dossier).
2. Ouvrez un terminal : menu Terminal → Nouveau terminal.
3. Tapez la commande suivante, puis Entrée :

   ```text
   npm run dev
   ```

4. Ouvrez http://localhost:8080 dans votre navigateur : le catalogue s'affiche avec « Pommes du poney ».
5. Pour tester sur votre téléphone, connecté au même Wi-Fi : ouvrez l'adresse « Réseau » affichée dans le terminal (du type http://192.168.1.20:8080).
6. Pour arrêter le serveur : Ctrl + C dans le terminal.

Si `npm` est inconnu, Node.js n'est pas installé : installez la version LTS depuis nodejs.org, puis fermez et rouvrez VS Code.

## 3. Ajouter vos jeux existants

Pour **chaque jeu** :

1. Créez un dossier dans `games/` avec un nom court en minuscules et tirets, par exemple `games/saut-obstacles/`.
2. Mettez-y le fichier du jeu, **renommé `index.html`**.
3. Copiez-y le `game.json` de `pommes-du-poney`, puis modifiez-le :
   - `"id"` : exactement le nom du dossier (`"saut-obstacles"`) ;
   - `"title"`, `"description"`, `"ages"` ;
   - `"genre"`, `"genres_secondaires"` et `"univers"` : uniquement des identifiants des listes de `public/taxonomie.js` (par ex. `"arcade"`, `[]`, `["chevaux"]`) ; vérifier avec `npm run taxonomie` ;
   - `"added"` : date d'ajout au format `AAAA-MM-JJ` ;
   - `"version"` : `1` (augmentez-la à chaque modification du jeu).
4. Ajoutez une jaquette `cover.webp` (portrait 600 × 800 px). En attendant, un `cover.png` ou `cover.jpg` fonctionne aussi. Sans jaquette, une image par défaut s'affiche.
5. Relancez `npm run dev` et vérifiez que le jeu s'ouvre.

**Important — jeux venant d'un artefact Claude :**
- Le jeu doit tenir dans **un seul fichier HTML, sans lien vers Internet**. Le site bloque volontairement tout ce qui vient de l'extérieur (bibliothèques CDN, polices Google, images en ligne).
- Si un jeu reste blanc, c'est presque toujours ça. Le terminal l'indique par un avertissement « semble charger une ressource externe ».
- Pour un artefact en React, demandez à Claude : « Convertis ce jeu en un seul fichier HTML autonome, sans CDN ni ressource externe, conforme au CLAUDE.md ».
- Les sauvegardes (record, progression) peuvent ne pas être conservées dans le site : c'est normal pour l'instant. Le jeu doit simplement continuer de fonctionner sans elles.

## 4. Envoyer sur GitHub

Dans GitHub Desktop :
1. Vérifiez la liste des fichiers modifiés (les dossiers `public/games/` et `public/catalog.json` n'y figurent pas : c'est voulu, ils sont recréés automatiquement).
2. Écrivez un résumé, par exemple « Phase 1 : catalogue et lanceur ».
3. Cliquez sur **Commit to main**, puis sur **Push origin**.

## 5. Publier sur Cloudflare Pages

1. Connectez-vous sur dash.cloudflare.com.
2. Menu **Workers & Pages** → **Create** → onglet **Pages** → **Connect to Git**. Les intitulés peuvent varier légèrement selon les mises à jour de Cloudflare.
3. Autorisez l'accès à GitHub et choisissez le dépôt **Jeux-en-ligne**.
4. Réglages de construction :

   | Champ | Valeur |
   | --- | --- |
   | Production branch | `main` |
   | Framework preset | `None` |
   | Build command | `node scripts/build-catalog.mjs` |
   | Build output directory | `public` |

5. Cliquez sur **Save and Deploy**. Après une à deux minutes, le site est en ligne à une adresse du type `jeux-en-ligne.pages.dev`.
6. Ouvrez cette adresse sur votre téléphone et lancez un jeu.

À partir de là, **chaque Push sur GitHub republie le site automatiquement**.

## 6. Ajouter un jeu plus tard (routine)

1. Créez son dossier dans `games/` (étape 3).
2. Testez avec `npm run dev`.
3. Commit + Push : le site est à jour une à deux minutes plus tard.

## 7. Propositions et signalements des visiteurs (formulaire public)

N'importe quel visiteur, sans compte, peut proposer un nouveau jeu, signaler un bug ou demander une modification depuis le formulaire public (`/proposer/` et ses équivalents dans les 4 autres langues ; liens dans le pied de page, sur la page de chaque jeu et dans la barre du lanceur, avec le jeu déjà choisi).

Le circuit complet :

1. **Envoi** : le site vérifie la demande (champs, champ piège, anti-robot Cloudflare Turnstile, 3 demandes par heure et 10 par jour au plus par adresse IP, adresses bloquées), puis crée une issue privée sur GitHub (étiquettes `demande-publique` et `en-attente-ia`).
2. **Modération par l'IA** (`.github/workflows/moderation-demande.yml`) : insultes, spam, cohérence avec le jeu choisi, clarté, doublon. Refus → issue fermée (`refuse-ia`), et un abus compté si c'est une insulte ou du spam. Validation → `valide-ia`.
3. **Votre décision** dans la page privée `/idees`, onglet **« Demandes publiques »** : Accepter, Refuser, ou Refuser et bannir. Un nouveau jeu accepté rejoint vos idées perso, fabriquées en priorité par la boucle de nuit ; un bug ou une modification acceptés sont traités aussitôt par l'IA de modification des jeux.
4. **Abus** : 3 abus en 24 h bloquent une adresse 7 jours, une récidive la bannit ; la liste des adresses bloquées, avec Débloquer et Bannir, est dans le même onglet.

À faire une fois : créer le secret **`MODERATION_SECRET`** (même valeur dans Cloudflare Pages et dans les secrets GitHub Actions) et vérifier que le jeton `GITHUB_TOKEN` de Cloudflare a le droit « Issues : lecture et écriture ». Les étiquettes GitHub et les tables de la base sont créées automatiquement. Marche à suivre détaillée, liste complète des réglages et tests : **`DEMANDES.md`** (section « Formulaire public »).

## En cas de problème

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| Le jeu n'apparaît pas dans le catalogue | `game.json` absent ou incorrect | Lisez le message « Jeux ignorés » dans le terminal ou dans le journal de build Cloudflare |
| Le jeu s'ouvre sur un écran blanc | Ressource externe bloquée | Faites convertir le jeu en fichier autonome (voir étape 3) |
| La jaquette ne s'affiche pas | Fichier mal nommé | Nommez-le exactement `cover.webp` (ou `cover.png` / `cover.jpg`) |
| L'ancienne version du jeu s'affiche | Cache du navigateur | Augmentez `"version"` dans `game.json` |
| Le build Cloudflare échoue | Réglages incorrects | Vérifiez la commande de build et le dossier `public` (étape 5) |
| Le formulaire public répond « indisponible » | Secret ou liaison manquants | Vérifiez `IP_SALT`, `TURNSTILE_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO` et la base `DB` dans Cloudflare (étape 7) |
| « Vérification anti-robot … (code 110200) » sur le formulaire ou votes jamais comptés | Domaine non autorisé pour la clé Turnstile | Cloudflare → Turnstile → le widget → Settings → Hostname Management : ajouter `freemicrogames.com` (garder `jeux-en-ligne.pages.dev`) |
| Une demande reste « en-attente-ia » | Modération en panne (limite d'utilisation de Claude…) | Lisez le commentaire de l'issue, puis retirez et remettez l'étiquette `en-attente-ia` |
