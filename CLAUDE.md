# Contexte du projet — Site de mini-jeux « Free Micro Games »

> Nom du site : **Free Micro Games** (nom court « Micro Games »), domaine **freemicrogames.com**. Anciennement « Jeux-en-ligne » : le dépôt GitHub et quelques identifiants techniques gardent l'ancien nom (ne pas toucher au préfixe de `vote.js`, qui change les empreintes des votants).

> Ce fichier donne à toute IA (Claude Code, Claude, autres agents) le contexte nécessaire pour travailler sur ce dépôt.
> À placer à la racine du dépôt. Claude Code le lit automatiquement sous le nom `CLAUDE.md` ; pour d'autres IA, une copie nommée `AGENTS.md` peut être ajoutée.

## 1. Le projet en bref

- **Objectif** : un site web qui héberge une collection de mini-jeux HTML (créés par Claude et, plus tard, par des IA automatiques), présentés sous forme de catalogue avec jaquettes.
- **Public** : familial, enfants compris (dont des jeux sur les chevaux et le judo). Tout contenu doit être adapté aux enfants.
- **Langues** : le site et tous les jeux sont écrits en **français** (langue source) et traduits en **anglais, espagnol (neutre), portugais (Brésil) et allemand** (voir `I18N.md`).
- **Usage principal** : smartphone (Android et iPhone), sans installation d'application. L'ordinateur doit aussi fonctionner.
- **Ambition** : environ 100 jeux au départ, puis 1 000 à 2 000 jeux ajoutés au fil des mois, en grande partie par des IA.

## 2. Fonctionnalités attendues

1. **Catalogue** (page d'accueil) : grille de jaquettes ; un clic lance le jeu.
2. **Jeu jouable hors ligne** : une fois ouvert (ou téléchargé), un jeu fonctionne sans connexion.
3. **Votes** : pouce en l'air / pouce en bas sur chaque jeu ; un vote par jeu et par appareil, modifiable ou annulable.
4. **Classement** : les jeux les mieux notés en haut, les moins bien notés descendent (et passent en « Archives » si très mal notés).
5. **Nouveautés** : les jeux récents sont mis en avant pour récolter leurs premiers votes.
6. **Ajout continu de jeux** par des IA via des pull requests contrôlées automatiquement.

## 3. Architecture technique (décidée)

| Brique | Choix |
| --- | --- |
| Code et jeux | Dépôt GitHub : https://github.com/Jamesmax27/Jeux-en-ligne |
| Hébergement | Cloudflare Pages, déploiement automatique à chaque push sur `main` |
| Serveur de votes et suivi des parties | Cloudflare Pages Functions (`functions/api/`) |
| Base de données | Cloudflare D1 (SQLite), liée au projet sous le nom `DB` |
| Anti-robot | Cloudflare Turnstile (sur le premier vote d'un appareil) |
| Hors ligne | PWA : `manifest.webmanifest` + service worker `sw.js` |
| Contrôle qualité | GitHub Actions + Playwright |
| Stockage futur (> ~6 000 jeux) | Cloudflare R2 |

**Pas de framework, pas d'étape de compilation lourde.** Site en HTML, CSS et JavaScript simples (modules ES). Node.js n'est utilisé que pour les scripts de `scripts/`.

## 4. Structure du dépôt

```text
Jeux-en-ligne/
├─ public/                  site visible (dossier publié par Cloudflare Pages)
│  ├─ index.html            accueil (catalogue) — GÉNÉRÉ depuis gabarits/accueil.html, ne pas modifier
│  ├─ play.html             lanceur de jeu (/play?id=<id-du-jeu>&lang=<langue>, non indexé)
│  ├─ app.js, style.css
│  ├─ chemins.js            adresses des pages dans les 5 langues (site et scripts)
│  ├─ sw.js                 service worker (hors ligne)
│  ├─ manifest.webmanifest
│  ├─ catalog.json          GÉNÉRÉ par scripts/build-catalog.mjs — ne pas modifier à la main
│  └─ jeux/, genres/, univers/, ages/, en/, es/, pt/, de/, 404.html, sitemap.xml, robots.txt
│                           GÉNÉRÉS par scripts/pages-seo.mjs (pages pour les moteurs de recherche)
├─ gabarits/                modèles des pages générées (voir « Référencement » ci-dessous)
│  ├─ accueil.html, jeu.html, categorie.html, introuvable.html, morceaux/
│  └─ textes/categories.<langue>.json   textes des 54 pages de catégories
├─ games/                   un dossier par jeu (copié dans public/ au build)
│  └─ <id-du-jeu>/
│     ├─ index.html
│     ├─ cover.webp
│     └─ game.json
├─ functions/
│  ├─ _commun.js            outils communs (empreinte visiteur, jeux publiés, format de la table sessions)
│  └─ api/
│     ├─ vote.js            POST /api/vote
│     ├─ scores.js          GET  /api/scores
│     ├─ session.js         POST /api/session (temps de jeu d'une partie)
│     ├─ tendances.js       GET  /api/tendances (jeux les plus joués sur 7 jours)
│     └─ idees.js           POST /api/idees (page privée /idees : idées de jeux et demandes de modification)
├─ scripts/
│  ├─ build-catalog.mjs     lit games/*/game.json → public/catalog.json (+ copie des jeux) puis appelle pages-seo.mjs
│  ├─ pages-seo.mjs         génère accueils, pages des jeux, catégories, 404, sitemap.xml, robots.txt (gabarits/)
│  ├─ regles-seo.mjs        règles des textes de référencement (game.json, catégories) ; CLI de contrôle
│  ├─ verifier-seo.mjs      vérification relançable de tout le site (npm run seo)
│  ├─ controle-taxonomie.mjs genres et univers des jeux et des idées : listes fermées de public/taxonomie.js
│  ├─ icones/               icônes des genres, univers, âges et raccourcis : sources/*.svg + generer.mjs (→ bloc de public/style.css)
│  ├─ idees.mjs             file d'idées de la boucle de nuit (choix, archivage, contrôles)
│  └─ validate-games.mjs    contrôle qualité des jeux
├─ idees.json               idées à fabriquer (« en_attente », « en_cours »)
├─ idees-archive.json       idées réalisées (« faite », avec jeu_id)
├─ schema.sql               structure de la base D1
├─ CONSIGNES-JEU.md         règles que doit suivre toute IA qui crée un jeu
├─ CLAUDE.md                ce fichier
└─ .github/workflows/validate.yml
```

Réglages Cloudflare Pages : build command `node scripts/build-catalog.mjs`, output directory `public`.

Autres fichiers ajoutés en phase 1 :
- `public/play.js` : script du lanceur ; `public/assets/` : logo et jaquette par défaut.
- `public/taxonomie.js` : **fichier de référence unique** des genres (26) et des univers (24), listes fermées dans l'ordre d'affichage (identifiant court sans accents, libellé, libellé court, pictogramme, teinte), et tranches d'âge. Lu par le site, les scripts et la boucle de nuit.
- `public/_headers` : en-têtes Cloudflare (dont la règle de sécurité des jeux : aucun accès réseau).
- `scripts/serve.mjs` : serveur de test local (applique la même règle de sécurité).
- `package.json` : `npm run build` (construit) et `npm run dev` (construit + serveur sur http://localhost:8080).
- `.gitignore` : `public/games/`, `public/catalog.json` et toutes les pages générées (dont `public/index.html`) ne sont jamais versionnés.

Fichiers ajoutés en phase 3 (hors ligne) :
- `public/sw.js` : service worker ; `public/hors-ligne.js` : enregistrement du service worker et liste des jeux gardés sur l'appareil (badge du catalogue).
- `public/manifest.webmanifest` et icônes tirées de `logo.svg` : `public/assets/icone-192.png`, `icone-512.png`, `icone-masquable-512.png` (Android), `apple-touch-icon.png` (iPhone).

Fichiers ajoutés pour la validation automatique et la publicité :
- `.github/workflows/boucle-de-nuit.yml` : boucle de nuit complète (idéation, choix, fabrication, vérification, fusion, archivage des idées) ; voir section 10.
- `public/pub.js` : publicité préparée mais **désactivée** (`PUB_ACTIVE = false`), un seul emplacement en bas du catalogue, jamais dans les jeux ; `PUBLICITE.md` : ce qu'il faut fournir pour l'activer.

Fichiers ajoutés pour les 5 langues (détails dans `I18N.md`) :
- `public/i18n/i18n.js` : module commun de traduction (site et jeux, recopié dans chaque jeu) ; `public/i18n/site/{fr,en,es,pt,de}.json` : textes du site (dont les intitulés `page.*` des pages générées) ; `public/langue.js` : langue, sélecteur, noms traduits du catalogue.
- `scripts/check-i18n.js` : vérification des traductions (bloquante dans `validate.yml`) ; `scripts/i18n-jeu.mjs` : recopie le module commun dans les jeux, `--assembler` et `--meta` rangent les textes d'un jeu ; `scripts/jaquette-sans-texte.mjs` : jaquette sans texte.

Référencement (SEO, octobre 2026) — tout est produit au build, pour tout jeu publié, quelle que soit sa source :
- Pages statiques dans les 5 langues (adresses : `public/chemins.js`) : accueils `/`, `/en/`, `/es/`, `/pt/`, `/de/` ; page de chaque jeu `/jeux/<id>/`, `/en/games/<id>/`, `/es/juegos/<id>/`, `/pt/jogos/<id>/`, `/de/spiele/<id>/` (gabarit unique `gabarits/jeu.html`) ; catégories `/genres/<id>/`, `/univers/<id>/`, `/ages/<3-4|5-6|7-8|9-plus>/` et leurs équivalents (`/en/genres/`, `/en/worlds/`, `/en/ages/`…) ; page 404 par langue.
- Chaque page : `<title>`, meta description, canonical, hreflang (x-default = français), Open Graph, JSON-LD (VideoGame et BreadcrumbList pour un jeu, sans note inventée), un seul H1, fil d'Ariane, jeux similaires (6), liens « Derniers jeux ajoutés » et « Toutes les catégories » sur l'accueil.
- `sitemap.xml` (pages indexables seulement, `lastmod` = `maj` sinon `added`) et `robots.txt`. Adresse du site : `SITE_URL` (facultative, jamais en `*.pages.dev`), sinon `https://freemicrogames.com/`.
- Une page de jeu dont les textes ne respectent pas `scripts/regles-seo.mjs` est en `noindex` et hors du sitemap ; une catégorie est indexée à partir de 3 jeux. Sur Cloudflare, un jeu ajouté depuis `REGLES_SEO_DEPUIS` (`scripts/regles-seo.mjs`) sans textes conformes n'est pas publié.
- Ne sont pas indexés : le lanceur, les mentions légales, les pages 404, le fichier brut des jeux (`/games/<id>/`, en-tête `X-Robots-Tag` dans `public/_headers`) et les adresses `*.pages.dev`.
- Contrôle : `node scripts/verifier-seo.mjs [<id>…]` (`npm run seo`), bloquant à l'étape d de la boucle et dans `validate.yml`.

Fichiers ajoutés pour les mentions légales :
- `public/mentions-legales.html` (informations de l'éditeur et de l'hébergeur, écrites une seule fois dans la page ; champs `[À COMPLÉTER : …]` à remplir par le propriétaire) et `public/mentions-legales.js` (langue, SEO) ; intitulés traduits : clés `legal.*` de `public/i18n/site/*.json`. Lien dans le pied de page de l'accueil.

Fichiers ajoutés pour le suivi des parties et les Tendances (section 7) :
- `public/suivi.js` : suivi des parties côté lanceur, et script commun `SCRIPT_ERREURS` placé par le lanceur en tête de chaque jeu.
- `functions/_commun.js`, `functions/api/session.js`, `functions/api/tendances.js`.

Le lanceur lit le jeu à l'adresse `games/<id>/?v=<version>` (Cloudflare retire `index.html` des adresses), puis l'affiche dans le cadre via `srcdoc` (voir section 6). Augmenter `version` dans `game.json` quand `index.html` ou la jaquette changent (les appareils re-téléchargent alors le jeu). Une retouche des seuls textes de `game.json` met à jour `maj` (date du jour, posée par `node scripts/i18n-jeu.mjs --meta <id>`) sans toucher à `version`.

Le build est tolérant : un jeu invalide est ignoré avec un message, il ne bloque jamais la publication des autres. Les ressources externes détectées dans un jeu produisent un avertissement.

## 5. Format standard d'un jeu (règle absolue)

Chaque jeu = un dossier `games/<id>/` contenant **exactement** :

| Fichier | Règles |
| --- | --- |
| `index.html` | Jeu complet dans un seul fichier : CSS, JS, images (SVG inline ou base64), sons (base64 ou Web Audio). **Aucune ressource externe** (pas de CDN, pas de police Google, pas d'appel réseau). Moins de 2 Mo. |
| `cover.webp` | Jaquette portrait 600 × 800 px (ratio 3:4), moins de 100 Ko, **sans aucun texte** (le site affiche le titre traduit en bandeau). Acceptés aussi en dépannage : `cover.png`, `cover.jpg`, `cover.svg`. Sans jaquette, une image par défaut s'affiche. |
| `game.json` | Fiche du jeu (voir ci-dessous). |

```json
{
  "id": "saut-obstacles",
  "title": "Saut d'obstacles",
  "description": "Ton poney galope, tape pour sauter les barres !",
  "titre_seo": "Saut d'obstacles : jeu de poney gratuit dès 6 ans",
  "description_seo": "Meta description de la page du jeu, 140 à 160 caractères.",
  "presentation": "« À propos du jeu » : principe, univers, ce qui rend le jeu amusant (70 à 150 mots).",
  "regles": "« Comment jouer » : but, geste au doigt et touches du clavier, étoiles, nombre réel de niveaux (50 à 130 mots).",
  "competences": "précision, sens du rythme, connaissance des chevaux",
  "jaquette_alt": "Un poney brun saute une barre rouge et blanche dans une prairie ensoleillée",
  "i18n": {
    "en": { "title": "Show Jumping", "description": "Your pony gallops: tap to jump over the bars!", "titre_seo": "…", "description_seo": "…", "presentation": "…", "regles": "…", "competences": "…", "jaquette_alt": "…" },
    "es": { "title": "…", "description": "…", "titre_seo": "…", "…": "…" },
    "pt": { "title": "…", "description": "…", "titre_seo": "…", "…": "…" },
    "de": { "title": "…", "description": "…", "titre_seo": "…", "…": "…" }
  },
  "genre": "arcade",
  "genres_secondaires": ["sport"],
  "univers": ["chevaux"],
  "ages": "6+",
  "author": "Claude",
  "added": "2026-10-03",
  "maj": "2026-10-03",
  "version": 1,
  "niveaux": 20,
  "consignes": 2
}
```

- `id` : minuscules, chiffres et tirets uniquement ; identique au nom du dossier ; unique.
- **Genres et univers : listes fermées de `public/taxonomie.js`** (détail dans `CONSIGNES-JEU.md`, section 4). On écrit les identifiants. **Interdit de créer un genre ou un univers** (décision du propriétaire seulement) ; « `autre` » seulement si rien ne correspond.
- `genre` : le genre principal, un seul (26 possibles). `genres_secondaires` : 0 à 2 autres genres. Les filtres de genre du catalogue montrent le genre principal et les secondaires.
- `univers` : 1 ou 2 (24 possibles). L'ancien champ `tags` n'existe plus : il est refusé par le robot.
- Les textes sont en français à la racine ; `i18n` donne leur traduction dans les 4 autres langues (obligatoire). `title` (60 caractères au plus) et `description` (phrase courte de la carte du catalogue). Textes de la page du jeu (référencement, tous les jeux) : `titre_seo` (balise `<title>`, 50 à 60 caractères), `description_seo` (meta description, 140 à 160 caractères), `presentation` (70 à 150 mots), `regles` (50 à 130 mots), `competences` (2 à 4, 20 à 160 caractères), `jaquette_alt` (40 à 125 caractères) ; bloc affiché de 150 à 300 mots par langue ; écrits d'après le code du jeu, sans marque ni formule passe-partout. Règles : `scripts/regles-seo.mjs` (source unique) et `CONSIGNES-JEU.md`, section 4. `maj` (facultatif) : date de la dernière modification (sitemap). Facultatif : `"non_traduisible": true` (jeu de mots ou de lettres en français : seule l'interface est traduite).
- Nouveaux jeux (`"consignes": 2`, posé par la boucle de nuit) : au moins 20 niveaux, nombre dans `"niveaux"` et donné par le jeu (`window.JEL_NIVEAUX`) ; le robot vérifie les deux. Les jeux plus anciens (10 niveaux) n'ont pas ce champ.

**Langues (règle absolue pour tout nouveau jeu, détails dans `CONSIGNES-JEU.md`, section 3) :**
- Aucun texte en dur : tout texte visible passe par `t('cle', { variables })` (canvas compris) ou `data-i18n="cle"` (`-html`, `-placeholder`, `-title`, `-aria`).
- Dans le `<head>`, après `<title>` : le bloc `<script type="application/json" id="jel-i18n-textes" data-coin="…">` avec les textes complets en `fr`, `en`, `es`, `pt`, `de` (mêmes clés, mêmes `{variables}`), puis `<script id="jel-i18n"></script>` rempli par `node scripts/i18n-jeu.mjs <id>`.
- Méthode recommandée (boucle de nuit) : textes écrits dans `i18n-jeu/<id>/fr.json` (puis `en.json`, `es.json`, `pt.json`, `de.json`, traduits d'après `fr.json` seul), rangés dans le jeu et sa fiche par `node scripts/i18n-jeu.mjs --assembler <id>`.
- Aucune image avec du texte (jaquette, dessins du jeu) : pas de titre, de lettre ni de chiffre dessinés.
- Bouton de langue : `data-coin` (coin de l'écran), `data-place="id…"` (dans des éléments du jeu) ou `data-coin="aucun"` + `JEL_I18N.creerSelecteur()`.
- Avant la pull request : `node scripts/check-i18n.js <id>` doit afficher « tout est bon », puis `node scripts/verifier-seo.mjs <id>` « Référencement : tout est bon ».

**Exigences de jouabilité :**
- Jouable au doigt (tactile) **et** au clavier/souris.
- S'adapte à l'écran (portrait mobile en priorité), pas de défilement de la page pendant le jeu.
- Fonctionne même si `localStorage` est indisponible (le jeu est dans une iframe sandbox) : entourer tout accès au stockage de `try/catch`.
- Pas de `alert()`, `confirm()`, `prompt()`, ni de pop-up, ni d'ouverture de nouvelle fenêtre.
- Règles du jeu expliquées à l'écran en quelques mots au démarrage.

**Interdits de contenu :**
- Violence réaliste, peur intense, contenu inadapté aux enfants.
- Publicité, achat, collecte de données, chat entre joueurs, liens vers l'extérieur.
- Personnages, noms, logos ou univers protégés (Pokémon, Mario, Disney, etc.). Uniquement des créations originales.

## 6. Lanceur de jeu

- `play.js` lit `games/<id>/?v=<version>` puis l'affiche dans une iframe `sandbox="allow-scripts"` (sans `allow-same-origin`) via `srcdoc`, en plaçant en tête la règle de sécurité `CSP_JEU`. Raison : un tel cadre échappe au service worker ; chargé par son adresse, le jeu ne marcherait pas hors ligne.
- Langue : le lanceur ajoute `window.JEL_LANG` au début du `srcdoc` (le cadre isolé n'a pas de stockage) ; un changement de langue dans le jeu (message `jel-langue`) est enregistré et relance le jeu.
- Suivi des parties : le lanceur ajoute aussi, avant le code du jeu, `SCRIPT_ERREURS` (`public/suivi.js`), qui lui transmet les erreurs JavaScript du jeu (message `jel-erreur`) ; c'est le lanceur qui mesure la durée et l'envoie (les jeux n'ont aucun accès réseau). Aucun jeu ne contient donc de code de suivi.
- On y arrive par le bouton « Jouer » de la page du jeu (`/play?id=<id>&lang=<langue>`) ; le lanceur n'est pas indexé (`noindex`).
- Barre supérieure : retour (vers la page du jeu dans la langue choisie ; vers l'accueil si on est arrivé hors ligne sans cette page), plein écran, 👍, 👎.
- Vote : toucher le même pouce une 2e fois annule ; toucher l'autre remplace.
- Au retour au catalogue après ≥ 1 minute de jeu, proposer discrètement de voter.

## 7. Votes et base de données

Base D1 `jeux-votes`, deux tables (rappel dans `schema.sql`) :
- `votes` : `game_id`, `voter`, `value` (1 / -1), `country`, `created_at`, `visiteur` ; clé primaire `(game_id, voter)`. Les totaux sont calculés à la lecture (pas de table `scores`).
- `sessions` (créée à la main, sans migration dans le dépôt) : `id`, `jeu_id`, `debut`, `duree_secondes`, `pays`, `appareil`, `erreur_js`, `visiteur`. Ses types sont lus une fois par instance (`lireFormatSessions` dans `functions/_commun.js`).

- `POST /api/vote` (`functions/api/vote.js`) : corps `{ "gameId": "...", "value": 1 | -1 | 0, "voterId": "...", "turnstileToken": "..." }`. `0` = annulation (la ligne est supprimée). Jeton Turnstile vérifié à **chaque** vote (secret `TURNSTILE_SECRET`, action `vote`). Renvoie les nouveaux totaux du jeu.
- `GET /api/scores` (`functions/api/scores.js`) : renvoie `{ "<gameId>": { "up": n, "down": n, "score": x, "semaine": n }, ... }` (`semaine` = votes des 7 derniers jours, votes modifiés compris), cache 5 minutes. Filtre pays optionnel : `?pays=FR`. L'en-tête `X-Pays` donne le pays détecté du visiteur (absent s'il est inconnu).
- `voter` : empreinte SHA-256 d'un identifiant aléatoire (UUID) créé par le navigateur et conservé localement. Aucun compte, aucun e-mail, aucune adresse IP enregistrée.
- `country` : en-tête `CF-IPCountry` (« XX » si inconnu). `created_at` : date du dernier vote en millisecondes.
- Navigateur (`public/votes.js`) : le vote est enregistré d'abord sur l'appareil, puis envoyé ; sans réseau ou si l'API ne répond pas, il reste en file d'attente et part au retour du réseau ou à la visite suivante. Turnstile n'est chargé qu'au moment d'envoyer un vote.
- Catalogue sans API (hors connexion, API en panne) : tri par nouveautés, sans compteurs de votes ; le site reste utilisable. Les votes reviennent dès le retour du réseau.
- `visiteur` (votes et sessions) : empreinte SHA-256 de `CF-Connecting-IP` + secret `IP_SALT` (`crypto.subtle`, `empreinteVisiteur` dans `functions/_commun.js`) ; l'adresse IP brute n'est jamais enregistrée. `null` si le secret manque. Elle ne change rien au comptage des votes.
- À faire : limite de débit (~30 votes par heure et par adresse IP), proposition de vote au retour au catalogue.

**Suivi des parties et Tendances** :
- Lanceur (`public/suivi.js`) : une partie commence à l'ouverture du jeu (ou au retour sur la page) et se termine quand la page est cachée ou quittée (`visibilitychange`, `pagehide`) ; elle est alors envoyée par `navigator.sendBeacon` à `/api/session` avec la première erreur JavaScript du jeu. Parties de moins de 2 s, de plus de 3 h ou faites hors connexion : non envoyées.
- `POST /api/session` (`functions/api/session.js`) : corps `{ "jeuId": "...", "duree": secondes, "erreur": "..." | null }`. Vérifie le jeu (catalogue) et la durée (entier de 2 s à 3 h) ; `debut` = maintenant − durée (horloge du serveur) ; `pays` = `request.cf.country` (« XX » si inconnu) ; `appareil` = `mobile` ou `desktop` (User-Agent) ; `visiteur` (ci-dessus). Répond 204.
- `GET /api/tendances` (`functions/api/tendances.js`) : `{ "jours": 7, "jeux": [ { "id", "sessions", "tempsTotal", "tempsMoyen" } ] }`, jeux classés par temps total joué sur 7 jours (secondes, 50 au plus), cache 5 minutes.
- Le service worker laisse passer `/api/*` directement au réseau (`addRoutes`, Chrome et Edge) : sinon, la durée envoyée en quittant la page se perd.
- Ces données ne suppriment ni ne déplacent aucun jeu : elles servent seulement à la section « Tendances ».

## 8. Classement

Score = **borne inférieure de l'intervalle de Wilson** (z = 1,96) :

```
n = up + down ; p = up / n
score = (p + z²/(2n) − z·√(p(1−p)/n + z²/(4n²))) / (1 + z²/n)     (score = 0 si n = 0)
```

Exemples de référence (pour les tests) : 90/10 → 0,826 ; 1/0 → 0,207 ; 20/30 → 0,276.

Menu de tri du catalogue (égalités départagées par le score, puis le nombre de votes, puis la date) :
- **Mieux notés** (par défaut) : score décroissant, avec quelques jeux de moins de 7 jours intercalés en haut.
- **Plus populaires** : nombre total de votes (👍 + 👎).
- **Populaires cette semaine** : nombre de votes des 7 derniers jours.
- **Nouveautés** : tous les jeux, du plus récent au plus ancien (badge « Nouveau » pendant 7 jours).

- Portée : **Monde** ou **Mon pays** (pays donné par l'en-tête `X-Pays`). Si mon pays a moins de 20 votes en tout, le classement Monde est affiché, avec une phrase d'explication.
- **Tendances** tout en haut de l'accueil (sous la recherche) : les 10 jeux les plus joués des 7 derniers jours (`/api/tendances`, réglage `TENDANCES_NOMBRE` dans `public/app.js`), en une bande de cartes qui défile, avec leur rang, le temps total joué, le nombre de parties et le temps moyen. Indépendantes des filtres ; cachées sans API ou tant qu'aucune partie n'est enregistrée.
- **Regroupements** en haut de l'accueil (listes dans `public/taxonomie.js`), combinables entre eux, avec le tri et la recherche ; chacun compte ses jeux (selon les autres filtres) :
  - tuiles des raccourcis : 🎲 **Au hasard** (lance un jeu parmi ceux affichés), 👍 **J'ai aimé** (mes votes 👍 sur l'appareil), 📶 **Hors ligne** (jeux gardés sur l'appareil) ;
  - tuiles d'**âge** (d'après `ages`) : 3-4 ans, 5-6 ans, 7-8 ans, 9 ans et + ;
  - puces des **genres** (26, liste fermée ; un jeu y figure par son genre principal et ses genres secondaires) : 2 rangées de 13 ;
  - puces des **univers** (24, liste fermée ; champ `univers`, 1 ou 2 par jeu) : 2 rangées de 12.
  - Puces compactes (icône de 28 px — 30 px sur ordinateur — au-dessus du libellé court et du nombre de jeux selon les autres filtres, sans retour à la ligne ; libellé complet en bulle d'aide), dans l'ordre de `taxonomie.js`, sur téléphone comme sur ordinateur ; une rangée qui ne tient pas défile horizontalement (téléphone, allemand). Zone de toucher de 44 px de haut. Un regroupement encore vide reste à sa place, grisé en pointillés (« Bientôt »). Les filtres choisis sont rappelés au-dessus des jeux (✕ pour retirer, « Tout effacer »).
- Chaque jaquette affiche ses compteurs 👍 et 👎 (portée choisie). Sans API : tri par nouveautés, sans compteurs.
- Un accueil par langue (`/`, `/en/`…, généré depuis `gabarits/accueil.html`) : la langue est celle de l'adresse ; changer de langue mène à l'accueil de l'autre langue. Une carte mène à la page du jeu (puis « Jouer ») ; « Au hasard » lance directement le jeu. Les 12 jeux les plus récents et les liens vers toutes les catégories non vides sont écrits dans la page (lisibles sans JavaScript).
- **Archives** : jeux avec plus de 30 votes et un score inférieur à 0,2 (seuils ajustables, votes du monde entier), affichés en bas.

Réglages dans `public/app.js` : `NOUVEAUX_EN_TETE` (2 nouveautés placées en 2e et 4e position de « Mieux notés »), `ARCHIVE_VOTES_MIN`, `ARCHIVE_SCORE_MAX`, `PAYS_VOTES_MIN`.

## 9. Hors ligne (PWA)

- Au premier chargement : mise en cache du catalogue, du lanceur, des styles et scripts.
- Jaquettes : mises en cache au fur et à mesure qu'elles sont affichées.
- Jeux : mis en cache à leur première ouverture, ou via le bouton « Rendre disponible hors ligne ».
- **Ne jamais pré-télécharger tout le catalogue.**
- Stratégie : « réseau d'abord » pour `catalog.json` (avec repli sur le cache), « cache d'abord » pour les jeux et jaquettes (avec contrôle de `version`). `/api/scores` et `/api/tendances` ne sont pas gardés : hors connexion, le catalogue trie par nouveautés, sans compteurs ni Tendances.
- La coquille (pages, CSS, JS, logo) est aussi en « réseau d'abord » (copie gardée servie après 3 s sans réponse) : les mises à jour du site arrivent dès la visite suivante.
- Caches (`public/sw.js`) : `jel-coquille-<VERSION>` (`v9`), `jel-donnees-v2` (catalogue), `jel-jeux-v1` (jeux ouverts et leur jaquette), `jel-jaquettes-v1` (jaquettes vues, 300 au plus), `jel-pages-v1` (pages générées visitées : accueils, pages des jeux, catégories ; 60 au plus). Augmenter `VERSION` dans `sw.js` quand la liste de la coquille change ; les jeux gardés sont conservés.
- Hors ligne, la page d'un jeu jamais visitée mène au lanceur (le jeu s'ouvre s'il a déjà été joué), une autre page générée à l'accueil gardé. Le service worker est enregistré aussi par les pages générées, et le lanceur relit le jeu quand il prend la main : un jeu ouvert une fois en arrivant par sa page est bien gardé.
- Hors connexion, un vote affiche « Pas de connexion : ton vote sera envoyé plus tard » ; un jeu jamais ouvert affiche une explication au lieu d'une erreur.

## 10. Ajout de jeux par des IA

**Catalogue de référence** : tous les jeux publiés (y compris ceux d'avant la boucle) sont les dossiers `games/*/` ; leur fiche `game.json` est leur entrée de catalogue (genre et univers obligatoires, listes fermées de `public/taxonomie.js`), et `public/catalog.json` en est tiré au build. Une pull request de jeu ne touche que `games/<id>/` : jamais de conflit sur le catalogue.

**File d'idées** (`scripts/idees.mjs`, détails en tête du fichier) :
- `idees.json` : idées `en_attente` ou `en_cours` ; `idees-archive.json` : idées `faite` avec `jeu_id`.
- Champs : `id`, `titre`, `description`, `genre`, `genres_secondaires` (facultatif, 0 à 2), `univers` (0 à 2 ; vide = l'agent créateur choisit), `ages` (facultatif, « 6+ » : âge conseillé, imposé au jeu fabriqué), `source` (`humain` / `agent`), `date_ajout`, `statut`, `jeu_id` (`null` tant que le jeu n'est pas publié) ; `essais` (facultatif) compte les jeux refusés : à 3, l'idée n'est plus choisie. Genres et univers : uniquement les identifiants de `public/taxonomie.js` (une idée hors liste arrête la boucle avec un message).
- Ordre de fabrication : idées `humain` (celles du propriétaire, toujours prioritaires) dans l'ordre du fichier, puis idées `agent`. Un jeu est relié à son idée par le champ `idee` de son `game.json` (= `id` de l'idée).
- Ajout humain : à la main dans `idees.json`, ou formulaire « Nouvelle idée de jeu » (`idee-jeu.yml`).

**Boucle de nuit** (`.github/workflows/boucle-de-nuit.yml`, 00:00 et 05:00 UTC, ou à la main ; un seul passage à la fois) :
1. a) **Idéation** : moins de 15 idées en attente → un agent lit `public/taxonomie.js`, `node scripts/idees.mjs catalogue` (titre, genres et univers des jeux, effectifs par genre et univers, combinaisons genre × univers déjà couvertes), `idees.json` et les titres de l'archive, puis propose des idées riches (source `agent`) : genres et univers choisis **uniquement** dans les listes fermées (interdit d'en créer), en privilégiant les combinaisons genre × univers encore peu couvertes. Il n'écrit que `nouvelles-idees.json` ; une idée hors liste est refusée à l'étape b.
2. b) **Choix** : idées mises à jour (jeu publié → archive ; `en_cours` sans pull request ouverte → `en_attente`), idées de l'agent ajoutées après contrôle, puis 5 idées `en_cours`. Enregistré sur `main`.
3. c) **Fabrication** : une tâche par idée, en parallèle (5 au plus) : jeu complet de 20 niveaux au moins, écrit en français avec ses textes dans `i18n-jeu/<id>/fr.json`, puis traduit dans la même session (`en.json`, `es.json`, `pt.json`, `de.json`, d'après `fr.json` seul) ; textes assemblés (`i18n-jeu.mjs --assembler`), traductions contrôlées par `check-i18n.js` (bloquant ; une seule réparation ciblée des fichiers de textes si besoin, sans toucher au code) ; textes de la page du jeu (titre et description pour Google, présentation, règles, compétences, texte de la jaquette) écrits d'après le jeu fini et son code, traduits, contrôlés par `regles-seo.mjs` puis `verifier-seo.mjs` (non bloquant à ce stade, résultat dans la description de la pull request) ; jaquette sans texte, `game.json` avec le genre, les univers et l'âge de l'idée et `"consignes": 2`, pull request (branche `nouveau-jeu/n<n° du passage>/<id de l'idée>` ; le `n` évite les anciennes branches `nouveau-jeu/2`, `nouveau-jeu/3`…).
4. d) **Vérification** de chaque pull request de la boucle dont l'idée est `en_cours` (y compris celles restées ouvertes) : robot (`validate-games.mjs --jouer` : chargement, console, téléphone 390 × 844 au toucher, hors ligne, fiche, nombre de niveaux, jaquette, taille ; `check-i18n.js` : 5 langues ; `idees.mjs controler` : entrée du catalogue ; `controle-taxonomie.mjs` : genres et univers dans les listes fermées ; `verifier-seo.mjs` : textes et page du jeu, bloquant), puis relecture par Claude avec la grille de `CONSIGNES-JEU.md` (section 7 : jeu complet et non simpliste, jaquette sans texte, page du jeu fidèle au code). Le résumé du passage donne la raison de chaque refus. Jaquette avec du texte sur un jeu bon : seule la jaquette est refaite (`jaquette-sans-texte.mjs`) et enregistrée sur la branche avant la fusion. Puis, une pull request à la fois : tout est bon → fusion (branche mise à jour si `main` a bougé) ; sinon → commentaire, fermeture, idée remise `en_attente` (+1 essai). Vérification interrompue (limite d'utilisation…) : rien n'est décidé, reprise au passage suivant.
5. e) **Mise à jour** : idées des jeux fusionnés → `idees-archive.json` (`faite`, `jeu_id`). Enregistré sur `main`. Cloudflare Pages publie à chaque fusion.

Seules les étapes b et e (et `idee-jeu.yml`) écrivent dans `idees.json` et `idees-archive.json`, jamais les tâches parallèles ; ces enregistrements portent `[CF-Pages-Skip]` (pas de build Cloudflare). Fusion automatique désactivable : variable GitHub `FUSION_AUTO` = `non` (les jeux validés reçoivent l'étiquette `valide` et attendent une fusion à la main). Corrections à la demande : commentaire `@claude` du propriétaire (`corriger-jeu.yml`). Une pull request ouverte ou fusionnée par le robot (jeton `GITHUB_TOKEN`) ne déclenche aucun autre workflow : toute la séquence tient donc dans `boucle-de-nuit.yml`.

**Demandes de modification d'un jeu publié** (`.github/workflows/demande-modification.yml`, mode d'emploi : `DEMANDES.md`) : onglet « Modifier un jeu » de la page privée `/idees` (même accès Cloudflare Access, même fonction `functions/api/idees.js` avec `"type": "demande"`) → issue « [Demande] <titre du jeu> », étiquette `demande-ia`, rubriques `### Jeu`, `### Demande`, `### Auteur`. Traitée aussitôt, une demande à la fois par jeu (`concurrency` `demande-<id>`) : Claude classe (`bug`, `amelioration`, `modification` ; `a-clarifier` → commentaire et arrêt), modifie uniquement `games/<id>/` sur la branche `demande/<n° issue>-<id>` (garde-fou), vérifications de l'étape d de la boucle (robot, traductions, catalogue, taxonomie, référencement, relecture), pull request `Closes #<n>`, fusion si tout est bon (`FUSION_AUTO` respectée) ; sinon commentaire et étiquette `echec-ia`, pull request laissée ouverte.

**Autre IA ou personne** : lire ce fichier, `CONSIGNES-JEU.md` et `public/catalog.json` (doublons de concept et de titre), créer `games/<id>/` conforme à la section 5 sur une branche dédiée, ouvrir une **pull request** (jamais de push direct sur `main`). `validate.yml` vérifie : présence et format des fichiers, aucune URL `http(s)://` externe, tailles, ouverture sans erreur console dans Playwright, genres et univers (`controle-taxonomie.mjs`), puis les traductions (`check-i18n.js`, bloquant), le référencement (`verifier-seo.mjs`, bloquant : textes de la page du jeu et pages du site) et le bloc d'icônes généré (`scripts/icones/generer.mjs --verifier`). La compétence Claude « ajouter-jeu-site » (`outils/ajouter-jeu-site/`, paquet `outils/ajouter-jeu-site-v2.zip`) suit les mêmes règles. Il ne lance que ce qui est utile selon les fichiers modifiés (jeux modifiés seulement ; tous les jeux si un outil de contrôle change ; catalogue et lanceur avec un seul jeu si seuls les textes du site ou la taxonomie changent ; rien pour la documentation), avec le Chrome déjà présent sur la machine de GitHub (détail en tête de `validate.yml`). Fusion à la main.

## 11. Conventions de code

- JavaScript moderne, sans dépendance côté client. Fichiers commentés en français.
- Interface pensée mobile d'abord : 2 colonnes de jaquettes sur téléphone, 4 à 6 sur ordinateur ; images en `loading="lazy"` (sauf les toutes premières, chargées tout de suite), avec `alt`, `width` et `height`.
- Adresses des pages et des fichiers du site depuis la racine (`/catalog.json`, `/api/…`, `/style.css`) : l'accueil existe aussi à `/en/`, `/es/`… ; les adresses des pages viennent de `public/chemins.js`.
- Accessibilité : boutons d'au moins 44 px, textes lisibles, contrastes suffisants.
- Sécurité : en-tête `Content-Security-Policy` interdisant aux jeux tout accès réseau ; ne jamais exécuter de code venant de `game.json`. La même règle figure dans `public/_headers`, `scripts/serve.mjs` et `public/play.js` (`CSP_JEU`) : les garder identiques.
- Respect des limites gratuites Cloudflare : 20 000 fichiers par site, 25 Mio par fichier, 100 000 appels de fonctions par jour.

## 12. Ce que les IA ne doivent pas faire

- Modifier les réglages Cloudflare, les secrets, les clés Turnstile ou le nom de domaine.
- Pousser directement sur `main`, fusionner des pull requests autrement que par la vérification de la boucle de nuit (`boucle-de-nuit.yml`) ou des demandes de modification (`demande-modification.yml`), ou supprimer des jeux existants.
- Écrire dans `idees.json` ou `idees-archive.json` depuis une tâche de fabrication de jeu (réservé aux étapes b et e de la boucle et au formulaire d'idées).
- Modifier `public/catalog.json` à la main.
- Créer un genre ou un univers, ou en utiliser un hors des listes de `public/taxonomie.js` (jeux comme idées) : ces listes ne changent que sur décision du propriétaire.
- Ajouter des traceurs, des comptes utilisateurs ou une collecte de données personnelles (seul existe le suivi anonyme des parties décidé par le propriétaire, section 7 : ne pas l'étendre sans son accord).
- Mettre de la publicité ailleurs que dans l'emplacement prévu (`public/pub.js`, en bas du catalogue), ou l'activer : c'est une décision du propriétaire (voir `PUBLICITE.md`).

## 13. Feuille de route

- **Phase 1** — Premier site en ligne : structure du dépôt, jeux existants convertis, catalogue, lanceur, déploiement Cloudflare Pages.
- **Phase 2** — Votes et classement : D1, fonctions `vote` / `scores`, pouces, tri Wilson, Nouveautés, Archives.
- **Phase 3** — Hors ligne : manifest, service worker, bouton hors ligne, votes en attente.
- **Phase 4** — Croissance automatique : garde-fous, bouton « Signaler », mentions légales, `CONSIGNES-JEU.md`, robot de contrôle, IA productrices.
- **Plus tard** : catalogue paginé (~500 jeux), stockage R2 (~6 000 jeux), page « au hasard », recommandations.

## 14. État actuel

- [ ] Phase 1 — fichiers créés (catalogue avec recherche, onglets Tous / Nouveautés, filtres par thème ; lanceur avec plein écran ; build ; jeu d'exemple `pommes-du-poney`). Reste : intégrer les jeux existants et publier sur Cloudflare Pages.
- [ ] Phase 2 — fichiers créés (`functions/api/vote.js`, `functions/api/scores.js`, `public/votes.js`, `schema.sql` ; pouces dans le lanceur ; onglet Populaires trié par Wilson avec nouveautés intercalées ; Archives). Reste : tester en ligne, limite de débit par IP, proposition de vote au retour au catalogue.
- [ ] Phase 3 — fichiers créés (`public/sw.js`, `public/hors-ligne.js`, manifeste et icônes ; jeux affichés via `srcdoc` ; badge « Disponible hors ligne » ; messages clairs pour les votes et les jeux non gardés). Testé dans Chrome (serveur local et redirections façon Cloudflare). Tuile « Hors ligne » dans le catalogue. Reste : tester sur téléphone une fois en ligne, bouton « Rendre disponible hors ligne ».
- [ ] Phase 4
- Catalogue amélioré — fichiers modifiés (menu de tri à 4 choix, portée Monde / Mon pays, filtres par genre et par thème, compteurs 👍 👎 ; champ `genre` dans `game.json` et `scripts/genres.mjs` ; `semaine` et `X-Pays` dans `/api/scores`). Reste : tester en ligne avec de vrais votes (en local, l'API n'existe pas).
- Regroupements en tuiles — fait (`public/regroupements.js`, accueil refait : raccourcis Au hasard / J'ai aimé / Hors ligne, âge, 16 genres dont 6 nouveaux — `plateforme`, `sport`, `aventure`, `stratégie`, `observation`, `simulation` —, 21 univers, autres thèmes ; regroupements vides grisés « Bientôt » ; `mesVotes()` dans `votes.js` ; coquille `v2` dans `sw.js`). Testé dans Chromium (téléphone et ordinateur). Reste : tester sur téléphone une fois en ligne.
- Accueil compact — `style.css` seul (en-tête, tuiles, titres de groupes, tri et marges réduits ; regroupements et style inchangés, commandes toujours ≥ 44 px, champ de recherche et menu de tri à 16 px pour éviter le zoom de l'iPhone). Sur téléphone, la 1re jaquette passe d'environ 1 170 px à 780 px du haut : visible sur les grands téléphones, encore juste sous l'écran sur iPhone (Safari). Piste si besoin : genres et univers sur une seule rangée sur téléphone.
- Design « Galaxie » — fait (`style.css` réécrit, fonctionnement inchangé). Toujours sombre : bleu nuit `#0b1020`, gris ardoise, blanc cassé `#eceae4`, un seul accent bleu lavande `#a8b3f0` (couleurs en variables dans `:root`). Champ d'étoiles fixe en CSS (`body::before` / `::after`, scintillement léger coupé si mouvements réduits). Logo planète à anneau : `assets/logo.svg` (sur fond, sert aussi aux icônes PNG) et copie sans fond dans l'en-tête de `index.html`. Pouces dessinés au trait (SVG dans `play.html`, masque CSS pour les compteurs des jaquettes). Boutons et puces d'au moins 44 px.
- Idées depuis le téléphone — fichiers créés (`.github/ISSUE_TEMPLATE/idee-jeu.yml`, `.github/workflows/idee-jeu.yml`, section dans `GUIDE-BOUCLE.md`). Reste : créer l'étiquette `idee-jeu` sur GitHub et faire un premier essai.
- Corrections par commentaire — fichier créé (`.github/workflows/corriger-jeu.yml`, section dans `GUIDE-BOUCLE.md`). Reste : premier essai sur une vraie pull request.
- Jeux plus complets — minimum obligatoire dans `CONSIGNES-JEU.md` (10 niveaux, tutoriel animé, étoiles, record, sons coupables, effets, bilan, mécaniques combinées) ; agent créateur : cahier de conception (description de la pull request), partie au hasard avec captures (`validate-games.mjs --jouer`, captures dans `captures/`, ignoré par git), relecture « 15 minutes », `claude-opus-5-5`, 150 tours. `validate-games.mjs` : premier test au toucher, appels réseau détectés, 2e ouverture du jeu navigateur coupé du réseau.
- Boucle de nuit et file d'idées JSON — fait : `boucle-de-nuit.yml` (remplace `nouveau-jeu.yml`, `valider-jeu.yml` et `cocher-idee.yml` ; étapes a à e de la section 10, 2 passages par nuit, 5 jeux en parallèle, fusions une par une), `scripts/idees.mjs`, `idees.json` et `idees-archive.json` (migrés depuis l'ancien `IDEES-JEUX.md`, supprimé) ; `idee-jeu.yml` écrit dans `idees.json` (champ « Thèmes » ajouté au formulaire) ; `corriger-jeu.yml` ne sert plus qu'aux commentaires `@claude`. Plus de correction automatique : un jeu refusé est fermé et son idée remise en attente (3 refus au plus). Tous les jeux du catalogue ont un genre et des tags. Reste : premier passage réel (lancement manuel de « Boucle de nuit », 1 jeu), surveiller la consommation de l'abonnement Claude (5 agents en parallèle) et le quota de 500 builds Cloudflare par mois (une publication par jeu fusionné).
- Consignes — minimum obligatoire complété (écran d'accueil, pause et Rejouer, contrôles tactiles et clavier) et grille de validation (`CONSIGNES-JEU.md`, section 7), commune à l'agent créateur, au correcteur et au relecteur.
- Taxonomie genres et univers — fait (branche `taxonomie`, 22 octobre 2026) : listes fermées de 26 genres et 24 univers dans un seul fichier de référence, `public/taxonomie.js` (remplace `scripts/genres.mjs` et `public/regroupements.js`) ; libellés complets et courts en 5 langues (`genre.<id>`, `genre.<id>.court`, `univers.<id>`…) ; champ `tags` supprimé (remplacé par `univers`), `genres_secondaires` (0 à 2) ajouté ; 32 jeux, 15 idées et l'archive reclassés ; « Autres thèmes » et « Tout voir » retirés ; puces compactes sur 2 rangées (13 + 13 genres, 12 + 12 univers) qui défilent si besoin (coquille `v6`) ; `scripts/controle-taxonomie.mjs` (bloquant dans la boucle de nuit, étape d, et dans `validate.yml`) ; formulaire d'idées avec listes Genre et Univers. Reste : relire le reclassement, tester sur téléphone une fois en ligne.
- Publicité — préparée, **désactivée** : `public/pub.js` (`PUB_ACTIVE = false`, aucun code de régie), emplacements cachés `#pub` (bas du catalogue) et `#consentement` dans l'accueil (aujourd'hui `gabarits/accueil.html`), `pub.js` ajouté à la coquille (`VERSION` `v3` dans `sw.js`), `PUBLICITE.md`. Reste : domaine, compte régie, identifiants, outil de consentement, pages légales.

- Internationalisation (5 langues) — fait sur la branche `i18n` : module `public/i18n/i18n.js`, textes du site, sélecteur de langue (en-tête et dans chaque jeu), SEO (`hreflang`, `sitemap.xml`), 29 jeux traduits, jaquettes refaites sans texte (titre traduit affiché en bandeau par le site), `check-i18n.js` bloquant dans `validate.yml`, règles dans `CONSIGNES-JEU.md`. Reste : régler `SITE_URL` avec le nom de domaine. Détails : `I18N.md`.
- Traduction et qualité dans la boucle de nuit — fait (branche `boucle-traduction-qualite`) : nouveaux jeux de 20 niveaux au moins (`"consignes": 2`, `window.JEL_NIVEAUX` vérifié par le robot), présentation riche dans `game.json` (meta description de la page du jeu), textes écrits dans `i18n-jeu/<id>/*.json` puis assemblés (`i18n-jeu.mjs --assembler`), traduction dans la même session d'après `fr.json` seul, `check-i18n.js` bloquant avec une seule réparation ciblée, jaquette avec texte refaite seule après la relecture. Reste : premier passage réel de la boucle (lancement manuel, 1 jeu) une fois fusionné.
- Suivi des parties et Tendances — fait : `public/suivi.js` (durée et erreurs JS, script d'erreurs placé par le lanceur dans tous les jeux), `functions/api/session.js`, `functions/api/tendances.js`, `functions/_commun.js` (dont `jeuExiste`, sorti de `vote.js`), colonne `visiteur` remplie par `vote.js`, section « Tendances » de l'accueil (5 langues), `/api/*` hors du service worker (coquille `v5`), règle dans `CONSIGNES-JEU.md`. Testé en local (Chrome : téléphone et ordinateur ; fonctions sur une base SQLite de test, table `sessions` avec `id` entier ou texte). Reste : vérifier en ligne que les sessions arrivent dans D1 ; pistes : index sur `sessions (debut)` si la table grossit, limite de débit contre les fausses sessions, mention du suivi dans les pages légales.

- Textes du site et mentions légales — fait (branche `textes-coherence`) : textes relus dans les 5 langues autour d'un même message (mini-jeux gratuits ; un jeu ouvert une fois avec Internet s'enregistre sur l'appareil et se rejoue hors ligne) ; toute promesse « sans publicité » retirée (ne jamais la réintroduire) ; vocabulaire unique par langue (hors ligne / offline / sin conexión / offline / offline ; gratuit / free / gratis / grátis / kostenlos) ; page « Mentions légales » (LCEN) en 5 langues, liée depuis le pied de page, gardée hors ligne (coquille `v7`), dans `sitemap.xml` et testée par `check-i18n.js`. Reste : remplir les champs `[À COMPLÉTER]` de `public/mentions-legales.html`, page « Confidentialité ».

- Design « Constellation manette » et nouveau nom — fait (branche `design-free-micro-games`, 22 octobre 2026), remplace le design « Galaxie » ci-dessus. Nom **Free Micro Games** (en-tête, titres, `manifest.webmanifest` avec `short_name` « Micro Games », clés `site.nom`, `meta.titre`, `legal.titreDocument`, `legal.description`, `jeu.titrePage`, `jeu.titreDocument` des 5 langues), domaine `freemicrogames.com` dans les mentions légales. Palette : nuit `#0b1020`, nuit profonde `#070a14`, surface `#161f38`, orbite `#5a6688` (contours), craie `#eceae4`, craie douce `#a3adc2`, lavande `#a8b3f0` (ce qu'on touche), or `#f2d27a` (ce qui brille, rare) ; variables renommées dans `:root` (`--nuit`, `--craie`, `--lavande`…). Logo : manette lavande dont les boutons sont une planète or à anneau et une étoile, mot-symbole dessiné (le nom reste en texte `sr-only`) ; `assets/logo.svg` et icônes PNG refaits. Fond : constellation de manette derrière l'en-tête et petites étoiles « pixel ». Jaquettes sans boîte, titre en bandeau ; teintes OKLCH des genres et univers dans `taxonomie.js` (6 familles de genres). 58 icônes dessinées (genres, univers, âges, raccourcis, titre Tendances) peintes en CSS à partir de `data-cle` (l'emoji de `taxonomie.js` reste en repli), animées au survol, au focus et à l'apparition d'un choix ; sources et générateur dans `scripts/icones/` (`node scripts/icones/generer.mjs` réécrit le bloc généré de `style.css`). Page privée `public/idees/` passée aux nouvelles couleurs. Aucun JavaScript du site modifié (sauf `VERSION` `v8` dans `sw.js`). Reste : régler `SITE_URL` sur `https://freemicrogames.com/` dans Cloudflare, renommer le dépôt GitHub si souhaité (voir la pull request), tester sur téléphone.

- Référencement (SEO) — fait (branche `seo`, 22 octobre 2026), décisions du propriétaire : pages statiques dans les 5 langues, une carte du catalogue ouvre la page du jeu, compétences en texte libre, `pac-monde` renommé « Glouton des labyrinthes » (l'identifiant et l'adresse `/jeux/pac-monde/` restent). Générateur `scripts/pages-seo.mjs` (gabarits dans `gabarits/`, adresses dans `public/chemins.js`) appelé par le build : accueils, pages des 38 jeux et des catégories dans les 5 langues (420 pages, 310 indexées), 404, `sitemap.xml` avec `lastmod`, `robots.txt` ; textes de référencement des 38 jeux écrits d'après leur code (5 langues), contre-vérifiés par un second agent pour 27 d'entre eux (la relecture des 11 autres — pac-monde, poings-de-pierre, potager-express, pouvoirs-elementaires, quelle-heure-est-il, rallye-des-tracteurs, slalom-des-flocons, tatami-des-petits-judokas, terres-cubiques, toilettage-tactile, tresors-caches-du-recif — a été interrompue par la limite d'utilisation : à relire) ; textes des 54 catégories (5 langues) ; règles `scripts/regles-seo.mjs` ; vérification `scripts/verifier-seo.mjs` (`npm run seo`), bloquante dans la boucle de nuit (étape d) et `validate.yml` ; prompts de la boucle, `corriger-jeu.yml`, formulaires d'idées (âge structuré `ages`), compétence `ajouter-jeu-site` v2 ; lanceur et fichiers bruts des jeux en `noindex`, vraie page 404, hors ligne des pages générées (coquille `v9`, cache `jel-pages-v1`). Accueil : 12 cartes écrites dans la page et places réservées (décalage au chargement passé d'environ 0,9 à 0,03 sur téléphone en réseau lent). Reste (propriétaire) : vérifier freemicrogames.com dans Google Search Console et Bing Webmaster Tools et y soumettre `/sitemap.xml` ; `SITE_URL` facultative (jamais en `*.pages.dev`) ; rendre « Contrôle des jeux » obligatoire dans la protection de `main` ; remplir les mentions légales ; réinstaller la compétence v2 dans claude.ai ; fusionner quand aucune pull request de la boucle n'est ouverte (un jeu fusionné entre-temps sans textes de référencement ferait échouer `verifier-seo`) ; ne fusionner qu'avec le domaine freemicrogames.com actif (les adresses `*.pages.dev` sont en `noindex`). Piste : adresse `/jeux/glouton-des-labyrinthes/` pour `pac-monde` (décision du propriétaire, à faire avant l'indexation).

- Demandes de modification par l'IA — fait (branche `demandes-ia`, 23 octobre 2026) : onglet « Modifier un jeu » de `public/idees/index.html` (jeu choisi dans le catalogue publié, texte libre), `functions/api/idees.js` (`"type": "demande"` ; `titreJeu` et `creerIssueGitHub` dans `functions/_commun.js`), `.github/workflows/demande-modification.yml`, `DEMANDES.md` ; étiquettes `demande-ia`, `bug`, `amelioration`, `modification`, `a-clarifier`, `echec-ia` créées par le workflow. Page et API restent sous `/idees` et `/api/idees` : aucun réglage Cloudflare Access à changer. Reste : premier essai réel d'une demande qui modifie un jeu.

Jeux existants à intégrer en priorité : série de jeux sur les chevaux (saut d'obstacles, toilettage, habillage de poney, cross, dressage en rythme, quiz du cavalier) et « Quiz du judoka ».

*Mettre à jour la section 14 à chaque étape terminée.*
