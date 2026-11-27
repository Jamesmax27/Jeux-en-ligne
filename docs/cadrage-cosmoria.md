# Cosmoria — colonie spatiale sur le moteur de Marmoria

> Toute IA qui touche à `games/cosmoria/`, `sources/cosmoria/` ou `scripts/tester-cosmoria.mjs` lit d'abord ce document, puis `sources/cosmoria/LEXIQUE.md`. Les règles du jeu (formules, barèmes, missions, marcheurs, commerce, armée, « Cités voisines ») sont celles de Marmoria : elles sont décrites dans `docs/cadrage-marmoria.md` et ne sont pas répétées ici.

## 1. Objet

Demande du propriétaire du 27 novembre 2026 : « faire la même chose que Marmoria, dans l'univers de la science-fiction, en respectant le même principe : une base spatiale sur une planète, des cosmonautes, des dômes, très joli à voir, 100 % complet », avec carte blanche.

Cosmoria est donc un second city-builder, frère de Marmoria :

- **même moteur** : la simulation, les données chiffrées, les 17 missions, le joueur automatique et les tests sont une copie de ceux de Marmoria ;
- **nouvel habillage, entièrement refait** : tous les dessins, le rendu (ciel étoilé, trois mondes), l'interface (tableau de bord sombre, cartes holographiques), les timbres de la musique et les 1 317 textes dans les 5 langues.

Fiche : genre `simulation`, genre secondaire `strategie`, univers `espace`, âge `12+` (combats entre gardes en armure et pillards, sans sang ; même complexité que Marmoria).

## 2. Le choix de fond : les identifiants du moteur ne changent pas

Dans `sim.js`, `donnees.json`, `exemples.js`, les clés des textes et les tests, un noyau de l'Intelligence Florea s'appelle toujours `temple_ceres`, les céréales `ble`, l'agent de sécurité `prefet`, la mission Alba Prima `ostie`. **C'est voulu.** Les deux jeux gardent ainsi une simulation comparable ligne à ligne :

```bash
# Ce qui sépare les deux moteurs (attendu : les préfixes MM_/CM_, mm-/cm-, le nom du jeu)
git diff --no-index sources/marmoria/sim.js sources/cosmoria/sim.js
git diff --no-index sources/marmoria/exemples.js sources/cosmoria/exemples.js
```

Une correction du moteur faite dans un jeu se reporte dans l'autre par ce même diff. `sources/cosmoria/LEXIQUE.md` donne, pour chaque identifiant, ce que le joueur voit et lit ; il fait foi pour les textes et pour les dessins. Ne pas renommer les identifiants.

Seules différences de données avec Marmoria : les années des missions (2401 à 2455 selon l'échelon, 2412 et 2418 pour les secteurs partagés), posées dans `donnees.json`. Tout le reste de `donnees.json` est identique (contrôlé à la création).

## 3. L'univers en bref

XXVe siècle. La Terre lance le programme Cosmoria ; le joueur commande une colonie pour **le Conseil de la Terre** (l'empereur de Marmoria). Les colons arrivent par **la piste de l'astroport**, vivent d'abord sous des **abris gonflables**, puis dans des capsules, des modules, des habitats, des **dômes**, des résidences et enfin des **arcologies** (20 niveaux). Dehors, l'air n'est pas respirable : tous les personnages portent combinaison et casque. Les dieux deviennent **les Cinq Intelligences** (Florea, Maréo, Nexus, Bastion, Harmonia), honorées dans des **noyaux**. Les deniers sont des **crédits**. Trois mondes, d'après le climat de la mission : `centre` = **Rubra** (roche rouille, mer turquoise, arbres à résine lumineux), `nord` = **Borée** (glace), `aride` = **Ambre** (désert doré). Le détail, nom par nom, est dans le lexique.

## 4. Organisation du code

| Fichier | Rôle | Par rapport à Marmoria |
| --- | --- | --- |
| `sources/cosmoria/donnees.json` | Règles chiffrées, missions | identique, sauf les années |
| `sources/cosmoria/sim.js`, `exemples.js` | Simulation, villes d'exemple, joueur automatique | identiques, aux préfixes près |
| `sources/cosmoria/dessins/01-outils.js` | Couleurs, mondes, géométrie isométrique, boîte à outils (coques, modules, voûtes, dômes, lueurs, panneaux solaires, hologrammes…), cache des images | **nouveau** |
| `sources/cosmoria/dessins/02-terrain.js` | Sol des trois mondes, mer, rivages, passerelles, esplanades, arbres, rochers | **nouveau** |
| `sources/cosmoria/dessins/03-habitations.js` | Les 20 niveaux d'habitation | **nouveau** |
| `sources/cosmoria/dessins/04-batiments-a.js` | Eau, alimentation, industrie, stockage, enseignes, piles de marchandises | **nouveau** |
| `sources/cosmoria/dessins/05-batiments-b.js` | Santé, Intelligences, éducation, spectacles, administration, embellissement, sécurité, défense, épaves, incendies | **nouveau** |
| `sources/cosmoria/dessins/06-personnages.js` | Colons en combinaison (un métier = une tenue), véhicules, escouades et pillards | **nouveau** |
| `sources/cosmoria/dessins/07-public.js` | Icônes d'arrêt, images des biens, ciel étoilé, `CM_DESSINS` | **nouveau** |
| `sources/cosmoria/rendu.js` | Rendu isométrique | adapté : monde de la mission, ciel étoilé et tranche de la carte, tirs laser, zoom jusqu'à ×3 |
| `sources/cosmoria/interface.js` | Écrans, menus, saisie | adapté : icônes, carte du secteur en hologramme, carte de la campagne (trois mondes), couleurs, affiche |
| `sources/cosmoria/audio.js` | Sons et musique | partitions gardées, instruments de synthèse |
| `sources/cosmoria/gabarit.html` | Page et styles | tableau de bord sombre aux lueurs cyan |
| `sources/cosmoria/textes/*.json` | Textes des 5 langues et fiche (`meta`) | **réécrits** d'après le lexique |
| `sources/cosmoria/assembler.mjs` | Produit `games/cosmoria/index.html` (recopie `dessins/*.js` à la suite) | adapté |
| `sources/cosmoria/outils/planche.mjs` | Planche-contact des dessins, sans le jeu (outil de travail) | **nouveau** |
| `sources/cosmoria/outils/capture.mjs` | Capture du jeu assemblé : écran titre, aperçus, affiche (outil de travail) | **nouveau** |
| `scripts/tester-cosmoria.mjs` | Tests de la simulation, lus dans le jeu assemblé | identique, aux préfixes près |

Après toute modification : `node sources/cosmoria/assembler.mjs`, puis `node scripts/tester-cosmoria.mjs` et les contrôles du site. On ne modifie jamais `games/cosmoria/index.html` à la main ; le contrôle « Contrôle des jeux » réassemble le jeu et refuse un `games/cosmoria/` qui ne correspond pas aux sources.

Outils de dessin (navigateur : Playwright, sinon Edge) :

```bash
node sources/cosmoria/outils/planche.mjs planche.png --z 2 --cols 4 terrain:rubra b:hopital h:12:2 m:prefet u:legionnaire:rome
node sources/cosmoria/outils/capture.mjs vue.png --apercu 3            # colonie d'exemple en pleine partie
node sources/cosmoria/outils/capture.mjs affiche.png --affiche --l 600 --h 800
```

## 5. Intégration au site

- **Dérogations** (`scripts/derogations-jeux.mjs`) : celles de Marmoria, puisque c'est le même jeu sous un autre habillage, comme demandé par le propriétaire le 27 novembre 2026 : pas de limite de poids (repère 4 Mo), 17 cartes au lieu de 20 niveaux (`niveaux` 17, `etoiles` 51), jeu en paysage, jeu à plusieurs par le comptoir de province.
- **Contrôle automatique** (`.github/workflows/validate.yml`) : étape « Contrôler Cosmoria » (tests de la simulation, jeu assemblé à jour des sources), déclenchée par `games/cosmoria/`, `sources/cosmoria/` et `scripts/tester-cosmoria.mjs`.
- **« Colonies voisines »** (2 à 4 joueurs) : même comptoir que les « Cités voisines » de Marmoria (`multijoueur/src/province.js`, `public/province/lanceur.js`). Le Worker connaît Cosmoria par `PROVINCE.CARTES.cosmoria` ; les deux secteurs gardent les identifiants `campanie` (Bassin d'Opale) et `hispanie` (Plateau d'Ambre). Politique de confidentialité (fr, en) complétée.
- **Sauvegarde, langues, fin de partie, étoiles, affiche et aperçus** : comme Marmoria (`docs/cadrage-marmoria.md`, section 19.6).

## 6. Direction artistique

- Dessin vectoriel par le code, isométrie 2:1, case de 64 × 32, lumière du nord-ouest. Aucun texte, aucune image embarquée. Les images sont rendues une fois par zoom et par densité d'écran (plafond de 5 millions de points par image), donc nettes jusqu'au zoom ×3 et sur les écrans denses.
- Les constructions sont claires (coque blanche `C.coque`) sur un sol coloré ; chaque catégorie a sa couleur d'accent (ceinture du bâtiment et enseigne lumineuse à pictogramme) : alimentation vert, eau bleu, industrie orange, santé turquoise, Intelligences violet, éducation cyan, spectacles rose, administration bleu roi, sécurité rouge, maintenance jaune, défense rouge sombre.
- Les lumières (fenêtres, néons, balises, cœurs des noyaux, hologrammes) se dessinent avec `lampe`, `lueur`, `neon` et `eclat` de `01-outils.js`.
- Verre : `dome(…, { verre: true })` et `voute(…, { verre: true })` ; on peint l'intérieur avant le verre.
- Un nouveau bâtiment : un peintre `PE.<id>(ctx, P, t, etat)` et sa hauteur `HAUT.<id>` ; on peint du fond vers l'avant, puis on le regarde avec la planche-contact.

## 7. Réalisé le 27 novembre 2026

- Copie du moteur de Marmoria (préfixes `CM_`, `cm-`), 403 contrôles du moteur repris.
- Dessins refaits : terrain des trois mondes, 20 habitations, 80 bâtiments, 33 marcheurs, 8 unités et camps, icônes, 16 biens, ciel étoilé.
- Interface, cartes, musique et textes (français réécrit, puis anglais, espagnol, portugais du Brésil, allemand).
- Reste : essais du propriétaire (jeu, musique à l'oreille, téléphone en paysage, « Colonies voisines » à deux appareils) ; l'équilibrage est celui de Marmoria.
