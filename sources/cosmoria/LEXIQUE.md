# Cosmoria — lexique de l'univers

Cosmoria reprend le moteur de Marmoria (simulation, règles, chiffres : rien ne change) et le
transpose dans une colonie spatiale. **Les identifiants internes restent ceux de Marmoria**
(`temple_ceres`, `ble`, `prefet`, `ostie`…) : ce choix permet de reporter une correction du moteur
d'un jeu à l'autre. Ce lexique donne, pour chaque identifiant, ce que le joueur voit et lit.
Il fait foi pour les textes (5 langues) et pour les dessins.

## 1. L'univers en bref

- **Époque** : XXVe siècle. La Terre lance le programme **Cosmoria** : bâtir des colonies sur les
  mondes d'un système lointain. Le joueur est un **commandant** de colonie (tutoyé, sans genre marqué).
- **L'autorité** : « l'empereur » devient **le Conseil de la Terre** (dire « le Conseil », « la Terre »).
  « Rome » devient **la Terre**. La faveur de l'empereur devient **la confiance du Conseil**.
- **Arrivée des colons** : la « voie de Rome » devient **la piste de l'astroport** (les navettes de la
  Terre se posent hors de la carte ; les colons arrivent en convoi par cette piste).
- **Monnaie** : les deniers deviennent des **crédits**.
- **Dates** : « An {n} » (années 2401 à 2460). Les mois gardent leur nom habituel.
- **Dehors, l'air n'est pas respirable** : tout le monde porte une combinaison et un casque ; on vit
  sous des abris, des modules et des dômes. Ne jamais écrire que les gens se promènent tête nue dehors.
- **Trois mondes** (le climat des missions) : `centre` = **Rubra**, planète de roche rouille au ciel
  cuivré ; `nord` = **Borée**, lune de glace bleutée ; `aride` = **Ambre**, désert doré aux deux soleils.
- **Ton** : aventure spatiale optimiste, mots simples, phrases courtes, tutoiement. Pas de jargon
  technique inutile, pas de marque ni de nom d'œuvre existante (pas de Star Wars, Star Trek, Dune,
  Mars de tel film, etc.), pas d'anglicisme quand un mot français existe.
- **Pour les plus jeunes aussi (12 ans et +)** : combats entre gardes en armure et pillards, sans
  sang ni cruauté ; on « met en fuite », on « repousse », on « neutralise ».

## 2. Mots du jeu

| Marmoria | Cosmoria |
| --- | --- |
| cité, ville | colonie (« ta colonie ») |
| gouverneur | commandant |
| empereur, César | le Conseil de la Terre (« le Conseil ») |
| Rome | la Terre |
| Empire | la Fédération (« les colonies de la Fédération ») |
| carte de l'Empire | carte du secteur |
| province | secteur |
| citoyens, habitants | colons, habitants |
| plébéiens / patriciens | colons / notables |
| immigrants / émigrants | arrivants / partants |
| deniers | crédits |
| trésor | trésorerie (« les crédits de la colonie ») |
| tribut | contribution versée à la Terre |
| route | passerelle (dalle lumineuse où circulent les colons) |
| voie de Rome | piste de l'astroport |
| barrière de circulation | portique de circulation |
| incendie | incendie (court-circuit, surchauffe) |
| effondrement, dommages | avarie, usure (un bâtiment mal entretenu « cède ») |
| ruines, gravats | épave, débris |
| les dieux | les Cinq Intelligences (les grandes IA de la colonie) |
| religion | lien avec les Intelligences (catégorie : « Intelligences ») |
| temple / grand temple | noyau / grand noyau (un noyau par Intelligence) |
| prêtre | médiateur |
| colère d'un dieu | l'Intelligence se braque, coupe ses services |
| bienfait d'un dieu | faveur de l'Intelligence |
| fête, festival | fête des Lumières (grande fête de la colonie) |
| oracle | oracle quantique |
| invasion | raid, attaque |
| légion, cohorte | escouade |
| fort | base (d'escouade) |
| secours de l'empereur | aide d'urgence de la Terre |
| destitution, disgrâce | révocation, le Conseil te retire le commandement |
| Cités voisines (jeu à plusieurs) | Colonies voisines |
| province à plusieurs | secteur partagé |
| caravane | convoi (de rovers) |
| navire marchand | cargo (aéroglisseur marchand) |
| étal, comptoir de province | comptoir du secteur |

Rangs (10, du plus bas au plus haut) : `citoyen` Colon · `scribe` Cadet · `edile` Lieutenant ·
`questeur` Intendant · `tribun` Capitaine · `preteur` Commandant · `legat` Préfet stellaire ·
`consul` Gouverneur · `proconsul` Haut-gouverneur · `princeps` Régent de Cosmoria.

## 3. Les Cinq Intelligences (identifiants des dieux)

| Id | Nom | Domaine | Couleur |
| --- | --- | --- | --- |
| `ceres` | **Florea** | cultures et récoltes | vert |
| `neptune` | **Maréo** | mers, pêche, cargos | bleu |
| `mercure` | **Nexus** | commerce, entrepôts, convois | ambre |
| `mars` | **Bastion** | défense, escouades | rouge |
| `venus` | **Harmonia** | bonne humeur, santé, vie de famille | rose |

On dit « l'Intelligence Florea », « le noyau de Florea », « Florea est satisfaite / contrariée ».
Elles ne sont pas des dieux : ce sont les grandes IA qui veillent sur la colonie ; les colons
aiment les savoir écoutées (les médiateurs font le lien).

## 4. Terrain

| Id | Cosmoria |
| --- | --- |
| herbe (sol constructible) | sol nu (régolithe) |
| prairie (terre fertile) | sol fertile (mousse terraformée) |
| arbres | arbres à résine (grands végétaux lumineux de la planète) |
| rochers | rochers |
| eau | mer, lac (eau salée de la planète) |
| rivage | rivage |
| sable / palmiers (climat aride) | dunes d'Ambre / cactus-cristal |

## 5. Biens

| Id | Cosmoria | Remarque |
| --- | --- | --- |
| `ble` | céréales | serre à céréales |
| `legumes` | légumes | serre potagère |
| `fruits` | fruits | verger sous dôme |
| `porc` | protéines | ferme à protéines (cuves de culture) |
| `poisson` | poisson | pêché dans les mers de la planète |
| `olives` | fibres | champ de fibres, matière des vêtements |
| `raisin` | baies | plantation de baies, matière du nectar |
| `argile` | silice | sable de silice dragué près de l'eau |
| `bois` | résine | récoltée sur les arbres à résine |
| `fer` | métal | mine de métal |
| `marbre` | cristal | mine de cristal ; sert aux grands noyaux et à l'oracle |
| `poterie` | céramique | vaisselle et carreaux |
| `mobilier` | mobilier | meubles imprimés en résine |
| `huile` | vêtements | tissés avec les fibres |
| `vin` | nectar | boisson de fête tirée des baies |
| `armes` | armes | équipement des escouades |

## 6. Bâtiments

| Id | Nom dans Cosmoria | À quoi il ressemble |
| --- | --- | --- |
| `logement` | Zone d'habitation | parcelle balisée où s'installent les arrivants |
| `deblayer` | Déblayer | |
| `route` | Passerelle | dalles claires bordées de lumières |
| `barriere` | Portique de circulation | arche lumineuse qui retient les marcheurs errants |
| `puits` | Foreuse à glace | petite foreuse : eau de base |
| `fontaine` | Borne d'eau pure | borne-fontaine reliée à une station de pompage |
| `reservoir` | Station de pompage | grande cuve près de l'eau |
| `aqueduc` | Pipeline | tuyau surélevé |
| `ferme_ble` | Serre à céréales | |
| `ferme_legumes` | Serre potagère | |
| `ferme_fruits` | Verger sous dôme | |
| `ferme_porcs` | Ferme à protéines | cuves de culture |
| `quai_peche` | Ponton de pêche | avec sa barge de pêche |
| `quai_commerce` | Quai des cargos | |
| `grenier` | Silo à vivres | |
| `marche` | Marché | halle sous verrière |
| `ferme_olives` | Champ de fibres | |
| `ferme_vigne` | Plantation de baies | |
| `carriere_argile` | Drague à silice | près de l'eau |
| `camp_bucherons` | Récolteur de résine | près des arbres à résine |
| `mine_fer` | Mine de métal | près des rochers |
| `carriere_marbre` | Mine de cristal | près des rochers |
| `atelier_poterie` | Atelier de céramique | |
| `atelier_mobilier` | Atelier de mobilier | imprimantes à meubles |
| `pressoir` | Atelier de couture | fibres → vêtements |
| `cave` | Fabrique de nectar | baies → nectar |
| `atelier_armes` | Armurerie | métal → armes |
| `entrepot` | Entrepôt | hangar à conteneurs |
| `barbier` | Salon de coiffure | |
| `bains` | Thermes | bains chauds sous dôme (ont besoin d'eau) |
| `medecin` | Infirmerie | |
| `hopital` | Hôpital | |
| `temple_<id>` | Noyau de Florea / Maréo / Nexus / Bastion / Harmonia | petit pavillon autour d'un cœur lumineux |
| `grand_temple_<id>` | Grand noyau de … | grande flèche de cristal |
| `oracle` | Oracle quantique | |
| `ecole` | École | |
| `bibliotheque` | Médiathèque | |
| `academie` | Institut des sciences | |
| `theatre` | Holothéâtre | scène d'hologrammes |
| `amphitheatre` | Arène | combats de robots téléguidés (personne n'est blessé) |
| `colisee` | Xénodrome | grand stade des créatures apprivoisées de la planète |
| `colonie_acteurs` | Studio des artistes | forme les artistes de l'holothéâtre |
| `ecole_gladiateurs` | Atelier des robots d'arène | prépare les robots de l'arène |
| `maison_lions` | Ménagerie | élève les créatures du xénodrome (les « pattes-douces ») |
| `hippodrome` | Circuit antigrav | courses de bolides flottants |
| `fabrique_chars` | Atelier des bolides | |
| `forum` | Bureau de la colonie | administration et impôts |
| `senat` | Palais du Conseil | grand siège de la colonie |
| `residence_maison` | Quartiers du commandant (module) | |
| `residence_villa` | Quartiers du commandant (résidence) | |
| `residence_palais` | Quartiers du commandant (tour) | |
| `jardin` | Jardin sous cloche | |
| `place` | Esplanade | |
| `statue_petite` | Petit monument | hologramme |
| `statue_moyenne` | Monument | obélisque lumineux |
| `statue_grande` | Grand monument | fusée des pionniers |
| `prefecture` | Poste de sécurité | |
| `ingenieur` | Atelier de maintenance | |
| `muraille` | Rempart d'énergie | |
| `tour` | Tourelle | |
| `porte` | Sas fortifié | |
| `caserne` | Caserne | |
| `academie_militaire` | Académie de défense | |
| `fort_legionnaires` | Base des gardes blindés | |
| `fort_javelots` | Base des tireurs | |
| `fort_cavaliers` | Base des motos-jets | |
| `ruines` | Épave | |
| `gravats` | Débris | |

## 7. Habitations (20 niveaux)

1 Petit abri gonflable · 2 Grand abri gonflable · 3 Petite capsule · 4 Grande capsule ·
5 Petit module · 6 Grand module · 7 Petit habitat · 8 Grand habitat · 9 Petit dôme ·
10 Dôme familial · 11 Grand dôme · 12 Dôme-jardin · 13 Petite résidence · 14 Résidence ·
15 Grande résidence · 16 Résidence de prestige · 17 Petite arcologie · 18 Arcologie ·
19 Grande arcologie · 20 Arcologie stellaire. Terrain vague : « Parcelle libre ».

Groupes : `tente` abri · `cabane` capsule · `masure` module · `casa` habitat · `insula` dôme ·
`villa` résidence (notables) · `palais` arcologie (notables).

## 8. Personnages et véhicules (marcheurs)

| Id | Cosmoria |
| --- | --- |
| `immigrant` | Arrivants (convoi de colons avec leur rover) |
| `emigrant` | Partant |
| `sansabri` | Sans-abri |
| `livreur` | Livreur (chariot flottant) |
| `charretier` | Transporteur |
| `bateau` | Barge de pêche |
| `caravane` | Convoi marchand (rover) |
| `navire` | Cargo |
| `docker` | Manutentionnaire |
| `acheteuse` | Acheteuse du marché |
| `vendeuse` | Vendeuse du marché |
| `prefet` | Agent de sécurité |
| `ingenieur` | Technicien |
| `percepteur` | Percepteur |
| `pretre` | Médiateur |
| `instituteur` | Instituteur |
| `bibliothecaire` | Archiviste |
| `professeur` | Chercheur |
| `barbier` | Coiffeur |
| `employe_bains` | Employé des thermes |
| `medecin` | Médecin |
| `chirurgien` | Chirurgien |
| `acteur` | Artiste (en route vers l'holothéâtre) |
| `comedien` | Holo-artiste (en tournée dans les rues) |
| `gladiateur` | Robot d'arène |
| `lutteur` | Champion d'arène (pilote en tournée) |
| `lion` | Patte-douce (créature apprivoisée) |
| `dompteur` | Dresseur |
| `char` | Bolide antigrav |
| `aurige` | Pilote de bolide |
| `recrue` | Recrue |
| `voleur` | Voleur |
| `emeutier` | Émeutier |

Unités du joueur : `legionnaire` Garde blindé · `javelot` Tireur · `cavalier` Pilote de moto-jet.
Ennemis : `legere` Pillard · `lourde` Brute blindée · `tireur` Tireur embusqué ·
`cavalerie` Motard pillard · `siege` Marcheur de siège (gros robot bélier).
Factions : `gaulois` Pillards des canyons · `germains` Clans du givre · `carthaginois` Flotte corsaire ·
`numides` Nomades des dunes · `parthes` Francs-tireurs d'Ambre · `pictes` Hurleurs de Borée ·
`rome` Forces de la Terre (quand le Conseil révoque le commandant).

## 9. Missions (17 cartes, 10 échelons)

Les noms sont des noms propres : **identiques dans les 5 langues**.

| Id | Nom | Monde | Voie | Idée du lieu |
| --- | --- | --- | --- | --- |
| `ostie` | Alba Prima | Rubra | tutoriel 1 | premier camp au bord de la mer de Rubra |
| `pompei` | Vesper | Rubra | tutoriel 2 | plaine au pied d'un vieux volcan endormi |
| `ravenne` | Lagunaris | Rubra | paisible | colonie de lagune, premiers échanges |
| `narbo` | Meridia | Rubra | paisible | carrefour des convois du sud |
| `aquilee` | Aquilon | Borée | militaire | avant-poste de glace, premiers raids |
| `massalia` | Port-Thalassa | Rubra | paisible | grand port des cargos |
| `vindobona` | Vindara | Borée | militaire | forteresse du fleuve gelé |
| `ephese` | Ephyra | Rubra | paisible | colonie savante, culture |
| `burdigala` | Burgalis | Rubra | militaire | plaines à baies et nectar, raids des canyons |
| `alexandrie` | Solara | Ambre | paisible | cité-phare du désert doré |
| `leptis` | Ambrea | Ambre | militaire | oasis fortifiée |
| `corinthe` | Isthmia | Rubra | paisible | isthme entre deux mers, commerce |
| `colonia` | Nivalis | Borée | militaire | colonie-frontière sous la neige |
| `antioche` | Orontis | Rubra | paisible | métropole des notables |
| `palmyre` | Miragia | Ambre | militaire | cité des mirages, convois du désert |
| `athenes` | Sophia | Rubra | paisible | capitale du savoir, dernière épreuve |
| `eburacum` | Ultima | Borée | militaire | dernière base au bout du monde connu |

Secteurs à plusieurs (« Colonies voisines ») : `campanie` **Bassin d'Opale** · `hispanie` **Plateau d'Ambre**.
Leurs 8 colonies et les ~70 autres colonies de la carte du secteur (`cite.*`) reçoivent des noms
propres inventés, courts, de consonance latine ou spatiale, identiques dans les 5 langues
(ex. Novaria, Celestia Minor, Port-Lumen, Halcyon, Tessara, Virelia). `cite.rome` = « la Terre »
(traduit : Earth, la Tierra, a Terra, die Erde).

## 10. Choix de vocabulaire des textes (à garder dans toute retouche)

- **Habitation** partout pour les logis de la colonie (jamais « maison ») ; « logement » seulement dans « chercher un logement ». Catégorie du menu : « Habitations ».
- **Liaison** pour une route commerciale (« liaison maritime », « Par la piste (convois) », « Par la mer (cargos) »), pour ne pas la confondre avec les passerelles.
- **Les cultures** pour les fermes en général ; la cote « Culture » reste au singulier.
- Panneau **Commandement** (ex « Gouvernement »), onglets « Colonie », « Résumé », « Conseil », « Intelligences », « Défense ».
- **Gardes** pour les soldats, « hors de combat » pour les pertes, « Défense » pour l'armée.
- Les Intelligences sont au féminin, sans adjectif accordé juste après la variable `{dieu}` : « {dieu} s'impatiente », « {dieu} se braque », « Faveur de … ».
- Eau : « eau de foreuse » et « eau pure (borne) » ; « station » pour la station de pompage.
- À plusieurs : la **vitrine** est l'étal d'un joueur, le **comptoir du secteur** est le serveur commun.
- « Dons au Conseil », « aide d'urgence de la Terre », « avarie » (le bâtiment « cède »), « séisme ».
- Les phrases à variables évitent les accords risqués : « {n} charges ({bien}) », « Raid ! {faction} : {n} ennemis… ».
- Noms des mondes (`monde.*`) : Rubra partout ; Borée / Boreas / Bóreas ; Ambre / Amber / Ámbar / Âmbar.
