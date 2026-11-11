# Indexation : audit et règles (novembre 2026)

Chantier « seo-indexation » : ce que les moteurs de recherche peuvent indexer,
comment les anciennes adresses sont redirigées, ce que contrôle le robot.
Générateur : `scripts/pages-seo.mjs` ; adresses : `public/chemins.js` ;
contrôle : `scripts/verifier-seo.mjs`.

## 1. Pages en noindex (audit du 11 novembre 2026)

| Famille d'adresses | Source du noindex | Voulu |
| --- | --- | --- |
| `/404.html`, `/en/404.html`… | meta `robots` (`gabarits/introuvable.html`) | oui |
| `/play`, `/play.html` (lanceur, `?id=…&lang=…`) | meta `robots` (`public/play.html`) + `X-Robots-Tag` (`public/_headers`) | oui |
| `/games/<id>/` (fichier brut du jeu) | `X-Robots-Tag` (`public/_headers`) | oui |
| `*.pages.dev` (préversions et adresse Cloudflare) | `X-Robots-Tag` (`public/_headers`, règles par hôte) | oui |
| `/proposer/`, `/en/suggest/`… (et `?jeu=…`) | meta `robots` (`pages-seo.mjs`, `indexable: false`) | oui |
| `/profil/`, `/classement/`, `/amis/` et leurs équivalents | meta `robots` (`pages-seo.mjs`) | oui |
| `/idees/` (page privée) | `Disallow` de `robots.txt`, Cloudflare Access | oui |
| catégorie de moins de 3 jeux, ou sans textes | meta `robots` (`categorieIndexable`) | oui (aucune aujourd'hui) |
| fiche d'un jeu dont les textes ne respectent pas `regles-seo.mjs` | meta `robots` (`jeu.conforme`) | oui (aucune aujourd'hui) |

Aucun accueil, aucune fiche de jeu, aucune catégorie de 3 jeux ou plus n'est en
noindex. Les 1 299 adresses « noindex » de Search Console sont surtout
`/play?id=…&lang=…` et `/proposer/?jeu=…` (un jeu × 5 langues chacune).

## 2. hreflang et Open Graph

- Accueils, fiches, catégories : 5 langues + `x-default` (version française),
  adresses absolues, réciproques, vers des pages en 200.
- Pages légales : n'existent qu'en français et en anglais → `fr`, `en`,
  `x-default` seulement (choix du propriétaire : déclarer `es`, `pt`, `de` vers
  la page anglaise serait faux pour Google).
- `og:locale:alternate` : une balise par autre langue de la page (4 sur les
  pages en 5 langues). Un outil qui n'affiche que la dernière balise de même
  nom montre seulement `de_DE` : ce n'est pas un défaut.

## 3. Redirections

Toutes en 301, en un seul saut, vers une page finale en 200, dans la même
langue. Fichier `public/_redirects`, écrit par `pages-seo.mjs` (Cloudflare
Pages : 2 000 règles fixes au plus).

### Anciennes catégories (choix du propriétaire du 11 novembre 2026)

Mêmes destinations dans les 5 langues (préfixes de `chemins.js`).

| Ancienne | Nouvelle |
| --- | --- |
| genres `reflexes`, `tir` | genre `arcade` |
| genre `labyrinthe` | genre `puzzle` |
| genre `observation` | genre `memoire` |
| genre `sport` | **univers `sport`** |
| genres `combat`, `role` | genre `aventure` |
| genres `defense`, `societe` | genre `strategie` |
| genre `gestion` | genre `simulation` |
| genres `construction`, `coloriage` | genre `creation` |
| univers `ferme`, `sauvages`, `compagnie` | univers `animaux` |
| univers `monstres`, `contes` | univers `fantasy` |
| univers `robots` | univers `espace` |
| univers `pirates` | univers `ocean` |
| univers `histoire`, `chevaliers` | univers `monde` |
| univers `corps` | univers `ville` |
| univers `fetes` | univers `nature` |
| univers `abstrait` | **genre `puzzle`** |
| âges `3-4`, `5-6` | âge `4-6` |
| âge `7-8` | âge `7-9` |
| âge `9-plus` | âge `10-12` |

Plus aucune ancienne catégorie ne mène à l'accueil ; `genres/autre` et
`univers/autre` n'ont jamais eu de page : pas de règle (404).
Exceptions de famille : `DESTINATIONS_ANCIENNES` de `pages-seo.mjs`.

### Autres familles (comportement de Cloudflare, vérifié en ligne)

| Adresse | Réponse | Remarque |
| --- | --- | --- |
| `http://freemicrogames.com/…` | 301 → `https://` | réglage Cloudflare |
| `https://freemicro.games/` | 301 → `https://freemicrogames.com/` | réglage Cloudflare |
| `www.freemicrogames.com`, `www.freemicro.games` | aucun DNS | **propriétaire** : enregistrement `www` + redirection 301 |
| `jeux-en-ligne.pages.dev` | 200 + `X-Robots-Tag: noindex` | une 301 n'est possible qu'avec une « Bulk Redirect » Cloudflare (propriétaire) ; `_redirects` ne sait pas filtrer par hôte |
| `/?lang=xx`, `/en/?lang=xx`… | 200, canonical vers l'accueil, redirection JavaScript | une vraie 301 demande une « Redirect Rule » Cloudflare (propriétaire) ; `_redirects` ne lit pas les paramètres |
| `/mentions-legales`, `/mentions-legales?lang=xx` | 308 → `/mentions-legales/` (paramètre gardé), canonical sans paramètre | automatique (Cloudflare), un saut |
| `/play.html?id=…` | 308 → `/play?id=…` (noindex) | automatique (Cloudflare), un saut |
| `/jeux/<id>` (sans « / ») | 308 → `/jeux/<id>/` | automatique (Cloudflare), un saut |

Google traite 308 comme 301. Le contrôle (`verifier-seo.mjs`) refuse tout lien
interne, canonical, hreflang, `og:url` ou adresse du sitemap qui mène à une
adresse redirigée.

## 4. Slugs traduits (tâche 5)

- Fiches : `/jeux/<id>/` en français (inchangé), `/en/games/<slug>/`,
  `/es/juegos/<slug>/`, `/pt/jogos/<slug>/`, `/de/spiele/<slug>/` ; slugs dans
  `"slugs"` de `game.json`, recopiés dans `catalog.json`, tirés du titre traduit
  par `scripts/slugs-jeux.mjs` (appelé par `i18n-jeu.mjs --assembler` et `--meta`,
  et par la boucle de nuit), posés une fois et jamais changés ; contrôlés par
  `validate-games.mjs` (présents, bien écrits, uniques).
- Catégories : `SLUGS_CATEGORIES` de `public/chemins.js` (`/en/worlds/animals/`,
  `/de/spielarten/logik/`, `/es/edades/13-mas/`…) ; en français, l'identifiant.
- L'identifiant du jeu (dossier, D1, profil, `/play?id=`) ne change pas.
- Anciennes adresses → 301 vers la nouvelle, en un saut (`_redirects`) :
  fiches (forme avec « / », la seule publiée), catégories (avec et sans « / »).
  `anciens_slugs` (facultatif) garde la redirection d'un slug changé.
- Navigateur : les liens viennent de `urlJeu(jeu, lang)` (entrée du catalogue) ;
  les cartes portent `data-jeu` (check vert « terminé » de `profil.js`) ; hors
  ligne, `sw.js` retrouve l'identifiant d'un slug dans le catalogue gardé.
- Limite Cloudflare Pages : 2 000 redirections fixes ; le build s'arrête au-delà
  et prévient à partir de 1 800 (`MAX_REDIRECTIONS` de `pages-seo.mjs`).
  Novembre 2026 : 1 066 règles (628 de fiches, le reste pour les catégories) ;
  un nouveau jeu n'en ajoute aucune.
