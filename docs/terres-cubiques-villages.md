# Terres Cubiques : villageois autonomes (cadrage et avancement)

Consigne du propriétaire du 16 novembre 2026 : des villages vivants (métiers, économie, 30 bâtiments construits bloc par bloc, naissances, dialogues cohérents, réputation, caravanes), une carte agrandie, 5 emplacements de sauvegarde et un mode test, en 13 étapes, chacune jouable et testée avant la suivante. Ce document résume les choix retenus et l'état du chantier. Toute IA qui touche à `games/terres-cubiques/` le lit d'abord.

## 1. Choix du propriétaire (étape 1, 16 novembre 2026)

- **Multijoueur hors périmètre.** Le salon par code n'existe que dans claude.ai (`window.claude.use('room')`). Sur freemicrogames.com, le jeu est solo. Les villages ne sont pas synchronisés entre joueurs, mais le salon claude.ai doit continuer à marcher (graine, modifications de blocs, créatures de l'hôte).
- **Pont IndexedDB dans le lanceur** pour les 5 emplacements, l'export et l'import : le cadre isolé du site n'a ni IndexedDB ni téléchargement, et `JEL_SAVE` est limité à 100 000 caractères.
- **Monde quasi infini par morceaux.** Une ancienne partie garde son terrain d'origine au centre ; le reste est généré autour.

Déjà dans le jeu avant ce chantier (demande publique #347, 15 novembre 2026) : les artisans coupent du bois, les villages bâtissent 2 ou 3 maisons de plus, des bébés naissent, les fermiers font se reproduire les animaux, et un troc existe pour chaque métier (`VIL_ECO`, `vilGrow`, `TROC`). Ce code est gardé ; les étapes suivantes le remplaceront peu à peu.

## 2. Monde par morceaux (étape 2)

- Morceaux de 16 × 16 colonnes sur 64 blocs de haut, générés à la demande à partir de la graine : même graine, même terrain. Coordonnées toujours positives, centre `ORIG` = 32 768, bord à `RAYON_MONDE` = 30 000 blocs du centre. Au-delà, les nombres à virgule de la carte graphique ne seraient plus assez précis : c'est la raison de ce bord, même si chaque morceau est maillé en coordonnées locales.
- Clé d'un bloc : `I(x,y,z) = x*4194304 + z*64 + y` (entier exact) ; elle sert pour les modifications, les portes, les coffres, les lumières et les cultures. Clé d'un morceau : `CK(cx,cz)`.
- Génération (`baseOf`) : relief et biomes selon la formule d'origine, rivières (biome `RIVER`), galeries (cases de 64 × 64), minerais (avec fer et charbon garantis en profondeur), arbres, plantes et donjons. Réglages regroupés dans `GEN`.
- **Ancienne zone** (parties d'avant ce chantier, champ `lg`) : `generateLegacy` est l'ancien générateur recopié tel quel. Il produit les mêmes tirages, dans le même ordre, et ne doit jamais être modifié. Son monde de 256 × 256 est recopié en `LO … LO+255`. L'essai compare l'empreinte de chaque morceau à `scripts/terres-cubiques/ancienne-partie.json`, une partie faite par l'ancien jeu.
- Villages : au plus un par case de 256 × 256, à 200 blocs au moins l'un de l'autre (`findVillageSite`). Le plan est bâti à la demande par `buildVillage` sur les morceaux concernés, puis les différences sont rangées par morceau (`VSTAMP`).
- Mémoire : morceaux chargés autour du joueur (`GEN.donneesMin`), libérés au-delà. Les animaux loin de tout joueur s'endorment (`SLEEP`) et se réveillent à son retour.
- Modifications : `edits` (classe `Modifs`), rangées par morceau, avec l'**origine de chaque bloc** (`ORIGINE.joueur`, `village`, `nature`). Un villageois ne doit jamais toucher un bloc posé par un joueur.
- Sauvegarde au format 3 (`serialize`) ; une sauvegarde au format 2 est convertie à la lecture (`migrateV2`).

## 3. Emplacements de sauvegarde (étape 2)

- `public/stockage.js` (`window.JEL_STOCK`, bloc `jel-stockage`), côté lanceur `public/stockage-lanceur.js` : IndexedDB du site, base `fmg-jeux`, clé `terres-cubiques/<clé>`.
- `partie-1` … `partie-5` : partie complète, compressée (gzip en base 64, préfixe `gz:`). `index` : nom, date, temps de jeu, villageois connus, mode, marque « Test », date du dernier export de chaque emplacement.
- `JEL_SAVE` ne garde que l'étape atteinte et l'emplacement. Une copie réduite du monde n'y est écrite que si aucun stockage ne marche.
- Fichier exporté `.terrescubiques` : `{ format: 'terres-cubiques', version, nom, date, partie }` compressé. À l'import, tout est vérifié avant d'écrire ; une partie au format 2 est convertie ; un emplacement occupé demande confirmation.
- L'ancienne sauvegarde unique est rangée dans l'emplacement 1 au premier lancement (`migrerAncienne`).

## 4. Mode test (étape 2)

`?debug=1` tapé dans l'adresse de la page du jeu : le lanceur transmet `window.JEL_DEBUG`, rien d'autre ne l'active. Le panneau (`dbgMaj`) contient :

- la vitesse des villages (×1, ×2, ×5, ×10) ;
- les étiquettes des villageois (`e.dbg = { action, score, manque }` quand l'IA l'indique) ;
- les ressources des villages ;
- la carte des morceaux chargés et le rayon de simulation ;
- le nombre d'images par seconde et de villageois actifs ;
- un journal exportable.

Le mode test ne donne aucun avantage au joueur. Une partie jouée en mode test garde la marque « Test » pour toujours (`partieTest`). Sur ordinateur, le panneau reste cliquable pendant la pause, car la souris est verrouillée pendant le jeu.

## 5. Villages par proximité et fiches (étape 2)

- `SIM` : rayon de simulation 48 blocs, décisions toutes les 0,5 à 1 s, 4 calculs de chemin par tick au plus, 20 villageois actifs par village, mémoire de 10 événements.
- Hors du rayon, le village est **figé** (aucun calcul). Au retour d'un joueur, chacun est remis à sa place de l'heure (`vilRattrapage`, premier rattrapage). Les villageois apparaissent à moins de 112 blocs et sont rangés au-delà de 160 (`ACTIVATION`).
- Fiche de chaque villageois (`village.pop`, sauvegarde `vp`) :
  - prénom (liste `PRENOMS`, plus de 100) ;
  - âge (`enfant`, `ado`, `adulte`, `ancien`) et date de naissance en jours du jeu (`jourJeu`) ;
  - métier (`METIERS`, 16 métiers ; les 4 premiers correspondent aux villageois actuels) ;
  - maison et famille (parents, conjoint, enfants) ;
  - inventaire, humeur (0 à 100) et mémoire (`souvenir`).
- Nom de village : syllabes tirées de la graine (`villageNom`).

## 6. Étapes

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Analyse et rapport | fait (16/11) |
| 2 | Carte agrandie, 5 emplacements, mode test, proximité et modèle de données | fait (16/11, branche `terres-cubiques-monde-infini`) |
| 3 | Métiers, récolte, stocks, décisions (IA utilitaire), gestion durable des ressources | à faire |
| 4 | Construction autonome (5 bâtiments) avec progression visible | à faire |
| 5 | Synchronisation multijoueur | hors périmètre (choix du 16/11) |
| 6 à 12 | Échanges, 25 autres bâtiments, naissances et nouveaux villages, dialogues, interaction, réputation, caravanes, fiches et carte, sauvegarde complète et rattrapage, optimisation | à faire |

## 7. Essais

- `node scripts/tester-terres-cubiques.mjs` (dans `validate.yml` quand ce jeu change) : ancienne partie identique, nouveau monde, voyage de 1 000 blocs, IndexedDB, proximité, fiches, export et import, mode test.
- `node scripts/tester-stockage.mjs` : pont de stockage dans le lanceur.
- Contrôles habituels : `validate-games.mjs --jouer`, `tester-sauvegarde.mjs`, `check-i18n.js`, `verifier-seo.mjs`.
