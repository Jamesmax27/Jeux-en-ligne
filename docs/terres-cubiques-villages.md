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

## 6. Métiers, stocks et décisions (étape 3)

Tout est dans la section « Vie des villages » du code. Les réglages sont dans `DURABLE`, `CIBLES`, `REPAS`, `CHAINES`, `METIERS_ORDRE` et `LOOK`.

- **Stock commun** (`vie.stock`, sauvegarde `vv`) et sac de chaque villageois (`fiche.inv`). Un villageois livre au stock quand son sac est plein. Les anciens compteurs de la demande #347 (bois et repas) passent par ce stock.
- **Métiers** : un village donne les métiers dans l'ordre de `METIERS_ORDRE`. Le pêcheur n'existe que s'il y a de l'eau. Un enfant devenu adulte prend le premier métier manquant. Il y a 8 tenues (`LOOK`).
- **Décisions** (`candidats`, `choisirAction`) : toutes les 0,5 à 1 s, chaque action reçoit un score, et le villageois prend la meilleure. Le score tient compte du métier et du besoin du village (stock sous sa cible). La gestion durable passe avant le reste. Un métier dont le village n'a pas besoin se repose (« promener »). Le mode test affiche l'action, le score et la ressource qui manque.
- **Actions** : livrer, couper, cueillir et replanter, semer et récolter, miner, nourrir, abattre, tondre, pêcher, transformer, construire (chantier de la demande #347), patrouiller (les gardes aussi la nuit), service, attendre, promener.
- **Chaînes** (`CHAINES`) : farine, pain, fer, outils, charbon de bois, pierre taillée, tissu, poterie. Elles se font pour l'instant à l'atelier de la place ; les bâtiments prévus viendront aux étapes 4 et 7.
- **Chemins** : A* sur le terrain (marches d'un bloc, chutes de 3 au plus, ni eau ni porte fermée), `SIM.chemins` calculs par image au plus, mis en cache 20 s. Un villageois coincé passe la marche. En fin de travail, il revient au village par un chemin (`vieRetour`).
- **Gestion durable** (consigne, section 6 bis) :
  - **bois** : jamais sous `DURABLE.arbres` arbres adultes autour du village, en comptant les coupes en cours. Tout arbre abattu donne des pousses, replantées aussitôt dans la zone forestière (`foret`). Une pousse devient un arbre en un jour du jeu (`POUSSES`, `pousser`), même pendant l'absence du joueur. Le joueur trouve aussi des pousses dans les feuilles.
  - **cultures** : chaque récolte est ressemée aussitôt, et `DURABLE.graines` graines restent toujours en réserve.
  - **animaux** : le couple de chaque espèce n'est jamais abattu. L'éleveur nourrit les animaux avec du blé du stock pour qu'ils se reproduisent.
  - **pierre et minerais** : une mine en escalier puis en galerie (`planMine`). Elle ne creuse jamais vers l'eau, ni dans un bloc d'un joueur, ni sous une maison.
  - **charbon** : le charbon de bois remplace le charbon de mine.
  - **impasse** : si rien n'avance pendant `DURABLE.impasse` s, le village passe en « rétablissement » (scores de plantation et de récolte relevés) et le journal le note.
  - **consommation** : un repas par habitant et par jour, sinon l'humeur baisse. Une naissance demande aussi des réserves de nourriture.
- **Blocs du joueur** : un villageois ne coupe, ne mine et ne récolte jamais un bloc d'origine `joueur`, même un arbre né d'une pousse plantée par le joueur.

## 7. Étapes

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Analyse et rapport | fait (16/11) |
| 2 | Carte agrandie, 5 emplacements, mode test, proximité et modèle de données | fait (16/11, branche `terres-cubiques-monde-infini`) |
| 3 | Métiers, récolte, stocks, décisions (IA utilitaire), gestion durable des ressources | fait (16/11, branche `terres-cubiques-etape-3`) |
| 4 | Construction autonome (5 bâtiments) avec progression visible | à faire |
| 5 | Synchronisation multijoueur | hors périmètre (choix du 16/11) |
| 6 à 12 | Échanges, 25 autres bâtiments, naissances et nouveaux villages, dialogues, interaction, réputation, caravanes, fiches et carte, sauvegarde complète et rattrapage, optimisation | à faire |

## 8. Essais

- `node scripts/tester-terres-cubiques.mjs` (dans `validate.yml` quand ce jeu change) : ancienne partie identique, nouveau monde, voyage de 1 000 blocs, IndexedDB, proximité, fiches, export et import, mode test, vie des villages en vitesse ×10 (métiers, stock, seuil des arbres, champ ressemé, pousse qui grandit, blocs du joueur intacts).
- `node scripts/tester-stockage.mjs` : pont de stockage dans le lanceur.
- Contrôles habituels : `validate-games.mjs --jouer`, `tester-sauvegarde.mjs`, `check-i18n.js`, `verifier-seo.mjs`.
