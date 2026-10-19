# Contexte du projet — Site de mini-jeux « Jeux-en-ligne »

> Ce fichier donne à toute IA (Claude Code, Claude, autres agents) le contexte nécessaire pour travailler sur ce dépôt.
> À placer à la racine du dépôt. Claude Code le lit automatiquement sous le nom `CLAUDE.md` ; pour d'autres IA, une copie nommée `AGENTS.md` peut être ajoutée.

## 1. Le projet en bref

- **Objectif** : un site web qui héberge une collection de mini-jeux HTML (créés par Claude et, plus tard, par des IA automatiques), présentés sous forme de catalogue avec jaquettes.
- **Public** : familial, enfants compris (dont des jeux sur les chevaux et le judo). Tout contenu doit être adapté aux enfants.
- **Langue** : tout le site et tous les jeux sont en **français**.
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
| Serveur de votes | Cloudflare Pages Functions (`functions/api/`) |
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
│  ├─ index.html            catalogue
│  ├─ play.html             lanceur de jeu (?id=<id-du-jeu>)
│  ├─ app.js, style.css
│  ├─ sw.js                 service worker (hors ligne)
│  ├─ manifest.webmanifest
│  └─ catalog.json          GÉNÉRÉ par scripts/build-catalog.mjs — ne pas modifier à la main
├─ games/                   un dossier par jeu (copié dans public/ au build)
│  └─ <id-du-jeu>/
│     ├─ index.html
│     ├─ cover.webp
│     └─ game.json
├─ functions/api/
│  ├─ vote.js               POST /api/vote
│  └─ scores.js             GET  /api/scores
├─ scripts/
│  ├─ build-catalog.mjs     lit games/*/game.json → public/catalog.json (+ copie des jeux)
│  ├─ genres.mjs            liste fermée des genres (identique à CONSIGNES-JEU.md)
│  └─ validate-games.mjs    contrôle qualité des jeux
├─ schema.sql               structure de la base D1
├─ CONSIGNES-JEU.md         règles que doit suivre toute IA qui crée un jeu
├─ CLAUDE.md                ce fichier
└─ .github/workflows/validate.yml
```

Réglages Cloudflare Pages : build command `node scripts/build-catalog.mjs`, output directory `public`.

Autres fichiers ajoutés en phase 1 :
- `public/play.js` : script du lanceur ; `public/assets/` : logo et jaquette par défaut.
- `public/_headers` : en-têtes Cloudflare (dont la règle de sécurité des jeux : aucun accès réseau).
- `scripts/serve.mjs` : serveur de test local (applique la même règle de sécurité).
- `package.json` : `npm run build` (construit) et `npm run dev` (construit + serveur sur http://localhost:8080).
- `.gitignore` : `public/games/` et `public/catalog.json` sont générés, jamais versionnés.

Fichiers ajoutés en phase 3 (hors ligne) :
- `public/sw.js` : service worker ; `public/hors-ligne.js` : enregistrement du service worker et liste des jeux gardés sur l'appareil (badge du catalogue).
- `public/manifest.webmanifest` et icônes tirées de `logo.svg` : `public/assets/icone-192.png`, `icone-512.png`, `icone-masquable-512.png` (Android), `apple-touch-icon.png` (iPhone).

Le lanceur lit le jeu à l'adresse `games/<id>/?v=<version>` (Cloudflare retire `index.html` des adresses), puis l'affiche dans le cadre via `srcdoc` (voir section 6). Augmenter `version` dans `game.json` à chaque modification d'un jeu.

Le build est tolérant : un jeu invalide est ignoré avec un message, il ne bloque jamais la publication des autres. Les ressources externes détectées dans un jeu produisent un avertissement.

## 5. Format standard d'un jeu (règle absolue)

Chaque jeu = un dossier `games/<id>/` contenant **exactement** :

| Fichier | Règles |
| --- | --- |
| `index.html` | Jeu complet dans un seul fichier : CSS, JS, images (SVG inline ou base64), sons (base64 ou Web Audio). **Aucune ressource externe** (pas de CDN, pas de police Google, pas d'appel réseau). Moins de 2 Mo. |
| `cover.webp` | Jaquette portrait 600 × 800 px (ratio 3:4), moins de 100 Ko. Acceptés aussi en dépannage : `cover.png`, `cover.jpg`, `cover.svg`. Sans jaquette, une image par défaut s'affiche. |
| `game.json` | Fiche du jeu (voir ci-dessous). |

```json
{
  "id": "saut-obstacles",
  "title": "Saut d'obstacles",
  "description": "Ton poney galope, tape pour sauter les barres !",
  "genre": "adresse",
  "tags": ["chevaux"],
  "ages": "6+",
  "author": "Claude",
  "added": "2026-10-03",
  "version": 1
}
```

- `id` : minuscules, chiffres et tirets uniquement ; identique au nom du dossier ; unique.
- `genre` : un seul, dans la liste fermée de `CONSIGNES-JEU.md` (reprise dans `scripts/genres.mjs`). Sert aux filtres par genre du catalogue. Une ancienne fiche sans `genre` : le build le déduit des `tags`, avec un avertissement.
- `tags` : des thèmes, choisis de préférence dans la liste existante (voir `catalog.json`).

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
- Barre supérieure : retour au catalogue, plein écran, 👍, 👎.
- Vote : toucher le même pouce une 2e fois annule ; toucher l'autre remplace.
- Au retour au catalogue après ≥ 1 minute de jeu, proposer discrètement de voter.

## 7. Votes et base de données

Une seule table, `votes` (structure complète dans `schema.sql`) : `game_id`, `voter`, `value` (1 / -1), `country`, `created_at` ; clé primaire `(game_id, voter)`. Les totaux sont calculés à la lecture (pas de table `scores`).

- `POST /api/vote` (`functions/api/vote.js`) : corps `{ "gameId": "...", "value": 1 | -1 | 0, "voterId": "...", "turnstileToken": "..." }`. `0` = annulation (la ligne est supprimée). Jeton Turnstile vérifié à **chaque** vote (secret `TURNSTILE_SECRET`, action `vote`). Renvoie les nouveaux totaux du jeu.
- `GET /api/scores` (`functions/api/scores.js`) : renvoie `{ "<gameId>": { "up": n, "down": n, "score": x, "semaine": n }, ... }` (`semaine` = votes des 7 derniers jours, votes modifiés compris), cache 5 minutes. Filtre pays optionnel : `?pays=FR`. L'en-tête `X-Pays` donne le pays détecté du visiteur (absent s'il est inconnu).
- `voter` : empreinte SHA-256 d'un identifiant aléatoire (UUID) créé par le navigateur et conservé localement. Aucun compte, aucun e-mail, aucune adresse IP enregistrée.
- `country` : en-tête `CF-IPCountry` (« XX » si inconnu). `created_at` : date du dernier vote en millisecondes.
- Navigateur (`public/votes.js`) : le vote est enregistré d'abord sur l'appareil, puis envoyé ; sans réseau ou si l'API ne répond pas, il reste en file d'attente et part au retour du réseau ou à la visite suivante. Turnstile n'est chargé qu'au moment d'envoyer un vote.
- Catalogue sans API (hors connexion, API en panne) : tri par nouveautés, sans compteurs de votes ; le site reste utilisable. Les votes reviennent dès le retour du réseau.
- À faire : limite de débit (~30 votes par heure et par adresse IP), proposition de vote au retour au catalogue.

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
- Filtres par **genre** (champ `genre`) et par **thème** (`tags`), combinables entre eux, avec le tri et la recherche.
- Chaque jaquette affiche ses compteurs 👍 et 👎 (portée choisie). Sans API : tri par nouveautés, sans compteurs.
- À faire : onglet **Hors ligne** (jeux déjà en cache sur l'appareil).
- **Archives** : jeux avec plus de 30 votes et un score inférieur à 0,2 (seuils ajustables, votes du monde entier), affichés en bas.

Réglages dans `public/app.js` : `NOUVEAUX_EN_TETE` (2 nouveautés placées en 2e et 4e position de « Mieux notés »), `ARCHIVE_VOTES_MIN`, `ARCHIVE_SCORE_MAX`, `PAYS_VOTES_MIN`.

## 9. Hors ligne (PWA)

- Au premier chargement : mise en cache du catalogue, du lanceur, des styles et scripts.
- Jaquettes : mises en cache au fur et à mesure qu'elles sont affichées.
- Jeux : mis en cache à leur première ouverture, ou via le bouton « Rendre disponible hors ligne ».
- **Ne jamais pré-télécharger tout le catalogue.**
- Stratégie : « réseau d'abord » pour `catalog.json` (avec repli sur le cache), « cache d'abord » pour les jeux et jaquettes (avec contrôle de `version`). `/api/scores` n'est pas gardé : hors connexion, le catalogue trie par nouveautés, sans compteurs.
- La coquille (pages, CSS, JS, logo) est aussi en « réseau d'abord » (copie gardée servie après 3 s sans réponse) : les mises à jour du site arrivent dès la visite suivante.
- Caches (`public/sw.js`) : `jel-coquille-<VERSION>`, `jel-donnees-v2` (catalogue), `jel-jeux-v1` (jeux ouverts et leur jaquette), `jel-jaquettes-v1` (jaquettes vues, 300 au plus). Augmenter `VERSION` dans `sw.js` quand la liste de la coquille change ; les jeux gardés sont conservés.
- Hors connexion, un vote affiche « Pas de connexion : ton vote sera envoyé plus tard » ; un jeu jamais ouvert affiche une explication au lieu d'une erreur.

## 10. Ajout de jeux par des IA

1. L'IA lit ce fichier, `CONSIGNES-JEU.md` et `public/catalog.json` (pour éviter les doublons de concept et de titre).
2. Elle crée un nouveau dossier `games/<id>/` conforme à la section 5, sur une branche dédiée.
3. Elle ouvre une **pull request** ; elle ne pousse jamais directement sur `main`.
4. Le workflow `validate.yml` vérifie : présence et format des 3 fichiers, unicité de l'`id`, aucune URL `http(s)://` externe dans `index.html`, tailles maximales, ouverture sans erreur console dans Playwright (+ capture d'écran utilisable comme jaquette si `cover.webp` manque).
5. Fusion : manuelle par le propriétaire pour les ~100 premiers jeux, puis automatique si le contrôle est au vert.

## 11. Conventions de code

- JavaScript moderne, sans dépendance côté client. Fichiers commentés en français.
- Interface pensée mobile d'abord : 2 colonnes de jaquettes sur téléphone, 4 à 6 sur ordinateur ; images en `loading="lazy"`.
- Accessibilité : boutons d'au moins 44 px, textes lisibles, contrastes suffisants.
- Sécurité : en-tête `Content-Security-Policy` interdisant aux jeux tout accès réseau ; ne jamais exécuter de code venant de `game.json`. La même règle figure dans `public/_headers`, `scripts/serve.mjs` et `public/play.js` (`CSP_JEU`) : les garder identiques.
- Respect des limites gratuites Cloudflare : 20 000 fichiers par site, 25 Mio par fichier, 100 000 appels de fonctions par jour.

## 12. Ce que les IA ne doivent pas faire

- Modifier les réglages Cloudflare, les secrets, les clés Turnstile ou le nom de domaine.
- Pousser directement sur `main`, fusionner leurs propres pull requests (tant que la fusion automatique n'est pas activée par le propriétaire), ou supprimer des jeux existants.
- Modifier `public/catalog.json` à la main.
- Ajouter des traceurs, de la publicité, des comptes utilisateurs ou une collecte de données personnelles.

## 13. Feuille de route

- **Phase 1** — Premier site en ligne : structure du dépôt, jeux existants convertis, catalogue, lanceur, déploiement Cloudflare Pages.
- **Phase 2** — Votes et classement : D1, fonctions `vote` / `scores`, pouces, tri Wilson, Nouveautés, Archives.
- **Phase 3** — Hors ligne : manifest, service worker, bouton hors ligne, votes en attente.
- **Phase 4** — Croissance automatique : garde-fous, bouton « Signaler », mentions légales, `CONSIGNES-JEU.md`, robot de contrôle, IA productrices.
- **Plus tard** : catalogue paginé (~500 jeux), stockage R2 (~6 000 jeux), page « au hasard », recommandations.

## 14. État actuel

- [ ] Phase 1 — fichiers créés (catalogue avec recherche, onglets Tous / Nouveautés, filtres par thème ; lanceur avec plein écran ; build ; jeu d'exemple `pommes-du-poney`). Reste : intégrer les jeux existants et publier sur Cloudflare Pages.
- [ ] Phase 2 — fichiers créés (`functions/api/vote.js`, `functions/api/scores.js`, `public/votes.js`, `schema.sql` ; pouces dans le lanceur ; onglet Populaires trié par Wilson avec nouveautés intercalées ; Archives). Reste : tester en ligne, limite de débit par IP, proposition de vote au retour au catalogue.
- [ ] Phase 3 — fichiers créés (`public/sw.js`, `public/hors-ligne.js`, manifeste et icônes ; jeux affichés via `srcdoc` ; badge « Disponible hors ligne » ; messages clairs pour les votes et les jeux non gardés). Testé dans Chrome (serveur local et redirections façon Cloudflare). Reste : tester sur téléphone une fois en ligne, onglet « Hors ligne » et bouton « Rendre disponible hors ligne ».
- [ ] Phase 4
- Catalogue amélioré — fichiers modifiés (menu de tri à 4 choix, portée Monde / Mon pays, filtres par genre et par thème, compteurs 👍 👎 ; champ `genre` dans `game.json` et `scripts/genres.mjs` ; `semaine` et `X-Pays` dans `/api/scores`). Reste : tester en ligne avec de vrais votes (en local, l'API n'existe pas).
- Design « Galaxie » — fait (`style.css` réécrit, fonctionnement inchangé). Toujours sombre : bleu nuit `#0b1020`, gris ardoise, blanc cassé `#eceae4`, un seul accent bleu lavande `#a8b3f0` (couleurs en variables dans `:root`). Champ d'étoiles fixe en CSS (`body::before` / `::after`, scintillement léger coupé si mouvements réduits). Logo planète à anneau : `assets/logo.svg` (sur fond, sert aussi aux icônes PNG) et copie sans fond dans l'en-tête de `index.html`. Pouces dessinés au trait (SVG dans `play.html`, masque CSS pour les compteurs des jaquettes). Boutons et puces d'au moins 44 px.
- Idées depuis le téléphone — fichiers créés (`.github/ISSUE_TEMPLATE/idee-jeu.yml`, `.github/workflows/idee-jeu.yml`, section dans `GUIDE-BOUCLE.md`). Reste : créer l'étiquette `idee-jeu` sur GitHub et faire un premier essai.
- Corrections par commentaire — fichier créé (`.github/workflows/corriger-jeu.yml`, section dans `GUIDE-BOUCLE.md`). Reste : premier essai sur une vraie pull request.
- Plusieurs jeux par lancement — `nouveau-jeu.yml` (entrée « nombre » 1 à 5, matrice, une pull request par jeu, jeux créés l'un après l'autre (`max-parallel: 1`, `fail-fast: false`), 2 la nuit et 1 à 5 à la main, idées déjà prises par une pull request ouverte sautées) et `cocher-idee.yml` (idée cochée sur main à la fusion). Les pull requests de jeux ne modifient jamais `IDEES-JEUX.md` : l'idée est notée dans `game.json` (champ `idee`, garanti par le workflow). Lecture de l'ancien repère `<!-- idee: … -->` des descriptions gardée en secours pour les pull requests créées avant ce champ : à retirer quand elles seront toutes fusionnées ou fermées.
- Jeux plus complets — minimum obligatoire dans `CONSIGNES-JEU.md` (10 niveaux, tutoriel animé, étoiles, record, sons coupables, effets, bilan, mécaniques combinées) ; `nouveau-jeu.yml` : cahier de conception (description de la pull request), partie au hasard avec captures (`validate-games.mjs --jouer`, captures dans `captures/`, ignoré par git), relecture « 15 minutes », Claude Fable 5.1, 150 tours, 120 minutes. Reste : juger le premier jeu produit.

Jeux existants à intégrer en priorité : série de jeux sur les chevaux (saut d'obstacles, toilettage, habillage de poney, cross, dressage en rythme, quiz du cavalier) et « Quiz du judoka ».

*Mettre à jour la section 14 à chaque étape terminée.*
