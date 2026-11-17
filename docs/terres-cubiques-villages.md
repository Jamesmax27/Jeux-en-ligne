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

- `SIM` : rayon de simulation 48 blocs, mesuré depuis le bord du village (centre moins son rayon R de 14 ou 18 blocs : ses chantiers et sa forêt dépassent le plateau ; depuis l'étape 4), décisions toutes les 0,5 à 1 s, 4 calculs de chemin par tick au plus, 20 villageois actifs par village, mémoire de 10 événements.
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

## 7. Construction autonome (étape 4)

Tout est dans la section « Construction autonome » du code (après « Vie des villages »).

- **Gabarits** (`GABARITS`) : 5 bâtiments décrits couche par couche, avec une lettre par sorte de bloc. Ce sont la maison (2 lits), le puits, la cabane de bûcheron (porte, coffre), la ferme (parcelles) et l'entrepôt. Les murs, le toit et le sol prennent les matériaux du biome du village, avec 3 variantes (`styleBat`). Les 25 autres bâtiments viendront à l'étape 7.
- **Emplacement** (`siteBat`) : autour du village, hors des maisons, des routes, du champ, de l'eau et des blocs du joueur. Le terrain doit être presque plat (2 blocs d'écart au plus). Il est aplani avant les murs, et un chemin relie la porte à la place.
- **Planificateur** (`planifier`, toutes les 30 s de simulation, un chantier à la fois) : par ordre de priorité, le logement (plus d'habitants que de lits, `PLAFOND_MAISONS` maisons au plus), la nourriture (une ferme si les repas manquent), la production (une cabane s'il y a un bûcheron, un entrepôt quand le stock dépasse 160), puis les services (un puits). Un bâtiment qui n'a pas d'emplacement laisse sa place au suivant. Une maison se bâtit sur le plateau du village s'il reste de la place, sinon autour.
- **Bâtisseur** (`construire`) : il va chercher au stock commun les matériaux des 40 blocs suivants (24 unités au plus, `coutBloc` : un demi de bois ou une pierre par bloc), puis pose un bloc toutes les 0,6 s. Il travaille de devant la porte, ou à côté du bloc, et ne se laisse jamais enfermer. Un villageois ou un animal qui gêne est poussé dehors, mais un joueur, son cheval et les autres joueurs sont attendus. Dans un village sans bâtisseur, les autres adultes (sauf les gardes) bâtissent à sa place.
- **Pause** : s'il manque un matériau, le chantier s'arrête et l'étiquette le dit. Le besoin de ce matériau devient maximal, ce qui envoie le bûcheron ou le mineur le chercher. Le chantier reprend dès la livraison.
- **Progression visible** : un contour doré au sol et une étiquette au-dessus du chantier (« Cabane de bûcheron · 42 % », en rouge pendant une pause). Elle n'apparaît qu'à moins de 40 blocs, et seulement si le chantier est dans le champ de la caméra. Un message s'affiche près du village au début et à la fin du chantier, et le journal du mode test les note.
- **Blocs** : chaque bloc posé a l'origine `village`. Un bloc du joueur n'est jamais remplacé (le chantier le contourne).
- **Sauvegarde** : le chantier en cours (type, sol, variante, avancement, matériaux déjà apportés) et les bâtiments finis (`vie.bats`, parcelles des fermes `vie.champs`, que les fermiers sèment et récoltent).

## 8. Échanges et marché (étape 6)

Tout est dans la section « Échanges et marché » du code. Les réglages sont dans `VALEURS_TROC` et `ECHANGE`. Le `TROC` d'avant, celui des échanges avec le joueur (demande #347), ne change pas.

- **Table de troc** (`VALEURS_TROC`) : une valeur fixe en « parts » pour chaque ressource. Par exemple, le bois et le blé valent 1, le pain 2, la farine 3, le fer 6 et les outils 14.
- **Échange entre villageois** (`pisteTroc`, `trocAction`) : une ressource manque au travail d'un villageois (entrée d'une de ses chaînes ou matériau du chantier), et le stock n'en a plus. Il va alors voir le villageois le plus proche qui en porte dans son sac, c'est-à-dire le producteur avant sa livraison (40 blocs au plus). Le porteur s'arrête et l'attend. Les bulles montrent la demande, puis l'accord ou le refus, puis le remerciement, avec le nom de la ressource.
- **Paiement** (`payer`) : en marchandises du sac de même valeur, sauf ce que le payeur vient de recevoir et ce dont ses chaînes ont besoin. Ce qui reste devient une dette (`fiche.dettes`), rendue sur la production suivante (`reglerDettes` après une transformation) ou à la livraison suivante.
- **Refus** (`refusTroc`) : le porteur refuse s'il en a besoin lui-même (entrée de ses chaînes, matériaux du bâtisseur), si son humeur est sous `ECHANGE.humeurMin`, ou si le demandeur lui doit déjà `ECHANGE.detteMax` parts. Le demandeur refusé perd un peu d'humeur et attend `ECHANGE.attente` s avant de redemander. Un échange réussi rend les deux plus contents.
- **Marché** (gabarit `marche` : deux étals sous une toile rayée, comptoirs et coffres) : le planificateur le bâtit quand le village a 3 métiers différents (`ECHANGE.metiers`). Un adulte devient alors marchand s'il n'y en a pas (`nommerMarchand` : un métier en double, sinon le moins urgent). Le marchand range sur les étals (`vie.etal`) ce que le stock a au-delà de 2 fois sa cible. Il ramène au stock ce dont le village manque, et le reste du temps il tient son étal.
- **Achat au marché** : quand personne ne porte la ressource qui manque, le villageois va au marché. Il la prend sur l'étal en payant en marchandises, et le marché fait crédit du reste. Il attend le marchand s'il n'est pas à son étal. Si la place derrière les étals est inaccessible, le marchand se tient devant, du côté des clients.
- Les échanges avec le joueur et les caravanes (étape 10) passeront par ces étals et cette table.
- **Sauvegarde** : étals et compteurs des échanges (`vie.etal`, `vie.troc`), dettes de chaque villageois (13ᵉ champ de la fiche). Le mode test affiche les étals et les compteurs (échanges, refus, achats au marché), et le journal note chaque échange.

## 9. Les 30 bâtiments (étape 7)

Tout est dans la section « Les 30 bâtiments » du code. Pour ajouter un bâtiment, il suffit d'ajouter un gabarit dans `GABARITS`, sa catégorie dans `ROLE_BAT`, son déclencheur dans `souhaits` et son nom `bat.<id>` dans les 5 langues.

- **Gabarits** : 30 bâtiments décrits couche par couche, une lettre par sorte de bloc (la légende est en tête de la section). Les matériaux suivent le biome, en 3 variantes. Le contrôle des dimensions de chaque couche est fait par l'essai (section 9).
  - Logements : abri de fondation, maison simple, maison familiale (4 lits), grande maison à étage (6 lits), maison des anciens.
  - Nourriture : ferme et champs, moulin, boulangerie, grange, cabane de pêcheur avec son ponton, écurie et enclos.
  - Production : cabane de bûcheron, entrepôt, scierie, carrière (une fosse avec un escalier taillé dans la paroi, pour en ressortir), atelier du tailleur de pierre, entrée de mine, forge, four à charbon, ateliers du tisserand et du potier.
  - Services : puits, place du village, marché, magasin général, auberge, église, école, mairie, tour de guet et palissade.
- **Planificateur** (`souhaits`) : il suit l'ordre de priorité de la consigne (logement, nourriture, production, services) et ses déclencheurs. Par exemple :
  - le logement choisit son type : des anciens sans maison → maison des anciens, plus de 12 habitants → grande maison, des enfants → maison familiale ;
  - le moulin vient quand le blé s'entasse, la scierie quand le bois dépasse 2 fois sa cible ;
  - l'église vient à 10 habitants, l'école à 3 enfants, la tour après une attaque ou à 12 habitants ;
  - un seul chantier à la fois, et un bâtiment sans place laisse la sienne au suivant.

  L'abri de fondation servira à la fondation des nouveaux villages (étape 8).
- **Emplacement** (`siteBat`) : l'écart entre deux bâtiments dépend de leur taille. Le sol devant la porte doit être au niveau du bâtiment (1 bloc d'écart au plus, sans eau). Les sites s'éloignent quand le village grandit, et la cabane de pêcheur se bâtit près du point de pêche.
- **Rôle de chaque bâtiment** :
  - **lits** des logements comptés dans la population possible (`litsBats`) ;
  - **chaînes** de production faites devant leur atelier (moulin, boulangerie, forge, four, ateliers), deux fois plus lentes à l'atelier de la place tant qu'il n'est pas bâti ;
  - **scierie** : les blocs de planches coûtent deux fois moins de bois ;
  - **carrière, entrée de mine, ponton** : une chance sur deux d'une pierre, d'un minerai ou d'un poisson de plus ;
  - **écurie** : 4 animaux de plus au plus ;
  - **grange et entrepôt** : dépôts plus proches (la grange pour les récoltes) ;
  - **église, auberge, magasin** : lieux de travail du prêtre, de l'aubergiste et du marchand sans marché ;
  - **tour de guet** : une ronde des gardes sur trois y passe ;
  - **école** : les enfants y vont la moitié de la journée.

  Les villageois n'ouvrent pas les portes : ils travaillent devant (`porteBat`). Si une porte est inaccessible, ils retombent sur l'atelier ou le dépôt de la place.
- **Aide de chantier** : dans un village sans bâtisseur, un seul adulte (le métier le moins indispensable, jamais un garde) bâtit avec la même priorité qu'un bâtisseur (`aideChantier`). Avant, tous les adultes pouvaient aider, mais avec une priorité si faible que le chantier n'avançait presque pas.

## 10. Familles, naissances et nouveaux villages (étape 8)

Tout est dans la section « Familles, naissances et nouveaux villages » du code. Les réglages sont dans `VIE_FAMILLE`.

- **Âges** (`vieFamille`, une fois par jour du jeu ; un jour dure 12 minutes) : l'âge se compte en jours depuis la naissance.
  - Un bébé qui a grandi devient adolescent apprenti pendant 1 jour. Il prend un métier qui manque au village, sinon celui d'un parent, et il est un peu plus petit qu'un adulte.
  - Il devient ensuite adulte, puis ancien à 60 jours.
  - Les anciens meurent entre 75 et 90 jours. C'est un événement discret : le villageois quitte la scène, ses proches (conjoint, parents, enfants) gardent un souvenir de deuil et perdent un peu d'humeur, un message s'affiche près du village, et le journal le note. Un mort ou un parti ne réapparaît jamais.
  - Les habitants d'une partie déjà commencée ont de 20 à 59 jours : les premiers anciens viennent donc après quelques heures de jeu.
- **Mariages** : un adulte célibataire épouse un autre adulte célibataire du village, à condition qu'il ne soit pas de sa famille proche (une chance sur trois par jour). S'ils vivent chez d'autres adultes, le couple est « sans foyer » : le planificateur lui bâtit alors d'abord un logement, et il y emménage dès qu'il est fini (« enfant qui part fonder sa maison »).
- **Logements** : la maison familiale, la grande maison, la maison des anciens et l'abri sont de vraies maisons (`ajouterLogement`). Ils ont une porte, une place intérieure, un chemin jusqu'à la place et un nombre de lits ; on y dort et on y naît. Ils sont rejoués au chargement dans l'ordre de construction (`eco.h`, avec leur type).
- **Naissances** (`coupleParent`) : il faut un couple d'adultes présents, un lit libre dans leur maison (sinon dans une maison bâtie) et de la nourriture. Il y a un délai d'un jour entre deux naissances d'un même couple, et de 120 s de simulation entre deux naissances d'un village.
- **Plafond et nouveaux villages** (`fonderVillage`) : au-delà de 18 habitants (26 pour une ville), un groupe de 2 à 4 adultes part fonder un village. Les conditions :
  - au plus un départ tous les 3 jours, quand la nourriture suit ;
  - les colons sont un couple sans foyer d'abord, puis les plus jeunes ;
  - le dernier bâtisseur ne part jamais.

  Le site est un terrain plat, à 100-170 blocs, à 120 blocs au moins de tout autre village. Les colons disent au revoir, s'éloignent vers leur nouveau village et quittent la scène. Ils emportent du bois, de la pierre, du pain, des graines et des pousses.
- **Village fondé** (`COLONIES`, sauvegarde `vc`) : il est gardé dans la sauvegarde avec ses colons. Il prend corps quand un joueur approche et que son terrain est chargé (`installerColonie`) :
  - l'abri de fondation y est placé en chantier, et c'est aussitôt la maison des colons ;
  - les colons prennent les premiers métiers de la liste et bâtissent l'abri ;
  - puis le village vit comme les autres (planificateur, métiers, échanges).
- **Mode test** : la population de chaque village s'affiche (enfants, adolescents, adultes, anciens, couples, sans foyer, plafond), et le journal note les passages d'âge, les décès, les mariages, les emménagements et les départs de colons.

## 11. Dialogues (étape 9)

Tout est dans la section « Dialogues » du code. Les textes sont des clés `dlg.<catégorie>.<n>` dans les 5 langues, et les noms des métiers des clés `metier.<id>`.

- **Banque** (`REPLIQUES`) : 200 répliques en données, chacune de la forme `[id, conditions, clé du texte, variables]`. Il y en a au moins 15 par catégorie :
  - salutations ;
  - travail de chaque métier ;
  - chantier avec la progression réelle ;
  - manque de ressource ;
  - échanges (demande, accord, refus, remerciement) ;
  - famille ;
  - vie du village ;
  - danger ;
  - humeur ;
  - rumeurs ;
  - réactions aux actions du joueur ;
  - réponses de conversation.

  Les conditions portent sur : métier, action en cours, âge, humeur, heure, météo, événement récent de la mémoire du villageois (`evt`) ou du village (`vevt`), familiarité avec le joueur (`fam` : inconnu, connu, ami), action récente du joueur (`joueur` : aide, bloc cassé, cadeau, échange), chantier (`prog`, `manque`, `logement`) et bâtiments présents. Les variables sont `{nom}`, `{metier}`, `{ressource}`, `{batiment}`, `{voisin}`, `{enfant}`, `{quantite}`, `{progression}`, `{village}` et `{lieu}`.
- **Choix** (`choisirReplique`) : parmi les répliques dont toutes les conditions sont vraies et toutes les variables connues, on prend la plus spécifique, c'est-à-dire celle qui a le plus de conditions. Un événement vécu, une action du joueur, une rumeur ou la ressource précise qui manque comptent double (`POIDS_COND`) : un villageois parle de son bébé plutôt que de son âge. Jamais une des 5 dernières dites dans le village (`DLG.recents`). Une réplique ne peut donc pas contredire ce que fait le villageois.
- **Quand on parle** :
  - **Salutation** à l'approche du joueur ou quand il parle à un villageois. La familiarité grandit à chaque rencontre et est gardée dans la fiche. Ce que le joueur vient de faire (aider pendant une attaque, casser un bloc du village, faire un cadeau, échanger) passe avant le bonjour.
  - **En travaillant**, quand un joueur est à moins de 16 blocs (`DLG.proche`), toutes les 25 à 45 s au plus, et une réplique toutes les 6 s au plus par village : le travail, ce qui manque, le chantier, l'humeur, le village, le danger.
  - **Sur la place**, deux villageois bavardent (2 à 4 répliques), seulement près d'un joueur. Une rumeur tirée de la vraie mémoire d'un voisin (mariage, naissance, deuil, échange, bâtiment construit…) ouvre la conversation, la réponse a le même ton (joyeux, triste, neutre), puis vient un au revoir.
  - **Au moment des événements** : naissance, mariage, deuil, emménagement, enfant devenu grand, bâtiment fini, échanges entre villageois.
- **Textes** : écrits en français sans accord en genre, puisque les fiches ne disent pas si un villageois est une femme ou un homme. Le nom d'un bâtiment sert d'étiquette (« Moulin : 40 % »). Les 4 autres langues ont été traduites d'après le français, avec les mêmes variables ; l'essai vérifie ces variables dans les 5 langues.
- Les anciennes bulles fixes restent en repli, ainsi que pour le salon de claude.ai : un invité ne voit que les bulles numérotées.

## 12. Étapes

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Analyse et rapport | fait (16/11) |
| 2 | Carte agrandie, 5 emplacements, mode test, proximité et modèle de données | fait (16/11, branche `terres-cubiques-monde-infini`) |
| 3 | Métiers, récolte, stocks, décisions (IA utilitaire), gestion durable des ressources | fait (16/11, branche `terres-cubiques-etape-3`) |
| 4 | Construction autonome (5 bâtiments) avec progression visible | fait (16/11, branche `terres-cubiques-etape-4`) |
| 5 | Synchronisation multijoueur | hors périmètre (choix du 16/11) |
| 6 | Échanges et marché | fait (16/11, branche `terres-cubiques-etape-6`) |
| 7 | Les 25 autres bâtiments (24, le marché étant fait à l'étape 6) | fait (17/11, branche `terres-cubiques-etape-7`) |
| 8 | Naissances, croissance, nouvelles maisons, plafond de population et nouveaux villages | fait (17/11, branche `terres-cubiques-etape-8`) |
| 9 | Dialogues complets | fait (17/11, branche `terres-cubiques-etape-9`) |
| 10 à 12 | interaction, réputation, caravanes, fiches et carte, sauvegarde complète et rattrapage, optimisation | à faire |

## 13. Essais

- `node scripts/tester-terres-cubiques.mjs` (dans `validate.yml` quand ce jeu change) : ancienne partie identique, nouveau monde, voyage de 1 000 blocs, IndexedDB, proximité, fiches, export et import, mode test, vie des villages en vitesse ×10 (métiers, stock, seuil des arbres, champ ressemé, pousse qui grandit, blocs du joueur intacts), construction en vitesse ×10 (cabane bâtie bloc par bloc avec son étiquette, pause faute de bois puis reprise, planificateur, chantier relu après rechargement), échanges en vitesse ×10 (troc avec dette puis remboursement, refus, marché bâti avec son marchand, étals, achat au marché, relecture), les 30 bâtiments (24 gabarits posés et reliés par un chemin, sortie de la carrière, effets, meunier au moulin, tour après une attaque, carrière bâtie par l'aide de chantier). Sur GitHub, les échecs sont aussi écrits dans le résumé du job.
- `node scripts/tester-stockage.mjs` : pont de stockage dans le lanceur.
- Contrôles habituels : `validate-games.mjs --jouer`, `tester-sauvegarde.mjs`, `check-i18n.js`, `verifier-seo.mjs`.
