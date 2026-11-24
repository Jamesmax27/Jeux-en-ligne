# Cahier des charges — Marmoria, jeu de gestion de cité romaine

Rédigé le 24 novembre 2026 par le propriétaire du site. Le réalisé et les écarts de chaque lot sont tenus en fin de document (section 23).

## 1. Objet, périmètre et hypothèses

Marmoria est un city-builder solo en vue isométrique : le joueur gouverne des cités romaines au fil d'une campagne et doit atteindre, à chaque mission, cinq seuils (population, prospérité, culture, faveur, paix).

Il reprend les mécaniques du genre popularisé par Caesar III (1998) : besoins des habitations, marcheurs sur les routes, chaînes de production, commerce, défense. Tout le contenu visible est original : nom, graphismes, sons, textes, cartes et missions.

### 1.1 Hypothèses de cadrage

| Sujet | Hypothèse retenue | Statut |
| --- | --- | --- |
| Plateforme | Navigateur, HTML5 et JavaScript, hébergé sur Free Micro Games | Déduit du projet |
| Appareils | PC (souris, clavier) et mobile (tactile, format paysage) | Validé le 24 novembre 2026 |
| Mode de jeu | Solo, jouable hors ligne une fois la page chargée | À valider |
| Modèle économique | Gratuit, publicité du site, aucun achat en jeu | Déduit du site |
| Langues | Français, anglais, espagnol, portugais du Brésil, allemand | Consignes du site |
| Public | Ados et adultes, classé 13+ sur le site ; combats sans sang ni gore | Validé le 24 novembre 2026 |
| Durée | 30 min à 3 h par mission, 30 à 50 h pour la campagne | Estimation à valider |
| Nom | Marmoria, mot forgé sur le latin marmor, « marbre » ; le mot « Caesar » est exclu | Validé le 24 novembre 2026 |

### 1.2 Hors périmètre de la première version

- Multijoueur.
- Éditeur de cartes ouvert aux joueurs (un éditeur interne suffit pour produire les missions).
- Relief à plusieurs altitudes (falaises, plateaux).
- Voix enregistrées.
- Application mobile native.

### 1.3 Contraintes juridiques

Principe général, à faire confirmer par un juriste en cas de doute : les règles de jeu se reprennent, l'expression protégée s'écarte.

- Exclus : le nom « Caesar », les graphismes, sons, musiques, textes, cartes et scénarios du jeu d'origine.
- Les noms historiques (villes, dieux, magistratures romaines) sont libres.
- [Julius](https://github.com/bvschaik/julius) et [Augustus](https://flathub.org/apps/com.github.keriew.augustus) sont des réimplémentations open source du jeu d'origine. Julius est sous licence AGPL-3.0 et exige les fichiers du jeu d'origine. Leur code documente les mécaniques exactes ; en copier du code placerait le jeu sous AGPL. Consigne pour l'IA de développement : aucune copie de code de ces projets.

### 1.4 Ampleur réelle du projet

Ce cahier couvre environ 70 types de bâtiments, 35 types de marcheurs, 20 niveaux d'habitation et 17 cartes : un périmètre de production de studio. Le développer d'un bloc échouera. Le cahier impose donc 5 lots, chacun jouable et testable seul (section 21). Le lot 1 livre une petite ville vivante, sans commerce ni armée.

## 2. Boucle de jeu, victoire et défaite

Le joueur trace la ville, répond aux besoins des habitants, puis réinvestit impôts et recettes du commerce pour faire monter les habitations en niveau jusqu'aux seuils de la mission.

### 2.1 Boucle principale

1. Le joueur trace des zones de logement reliées à la route d'entrée ; des immigrants arrivent.
2. Les habitants fournissent la main-d'œuvre des bâtiments.
3. Les bâtiments produisent biens et services, portés aux maisons par les marcheurs.
4. Chaque besoin satisfait fait évoluer la maison : plus d'habitants, plus d'impôts.
5. L'argent finance de nouveaux bâtiments, le commerce et la défense.
6. Les cinq cotes montent ; la mission est gagnée quand tous les seuils sont atteints.

### 2.2 Le temps

- Simulation à pas fixe : 20 ticks par seconde à vitesse normale.
- 1 jour = 50 ticks, 1 mois = 16 jours, 1 an = 12 mois. À vitesse normale, un mois dure 40 s et une année 8 min.
- Vitesses : pause, ×0,5, ×1, ×2, ×4. La construction reste possible en pause.
- La date s'affiche en mois et année ; chaque mission fixe sa date de départ.

### 2.3 Victoire

- La victoire est proposée dès que les cinq seuils sont atteints en même temps.
- Le joueur choisit alors : mission suivante, ou continuer à gouverner 2 ou 5 ans.
- Une mission peut porter une limite de temps (paramètre de données, absent par défaut).

### 2.4 Défaite

| Cas | Règle |
| --- | --- |
| Destitution | Faveur ≤ 10 pendant 12 mois consécutifs : les légions impériales arrivent, la mission est perdue à leur entrée en ville |
| Ville anéantie | Population à 0 et trésor au plafond de dette : aucune reconstruction possible |
| Délai dépassé | Limite de temps de la mission atteinte sans les cinq seuils |

Après une défaite, le joueur rejoue la mission ou charge une sauvegarde.

### 2.5 Difficulté

Trois niveaux : facile, normal, difficile. Le niveau règle par coefficients les fonds de départ, la force des ennemis, la vitesse de dégradation des bâtiments, l'érosion de la faveur et l'exigence des dieux. Les coefficients vivent dans les fichiers de données.

## 3. Carte, terrain et construction

La carte est une grille de cases carrées vue en isométrie ; chaque bâtiment occupe un carré de cases et la plupart exigent une route adjacente pour fonctionner.

### 3.1 Grille et caméra

- Tailles de carte : 80×80 (petite), 120×120 (moyenne), 160×160 (grande). Sur mobile, 120×120 au plus, à confirmer par les mesures du lot 1.
- Projection isométrique 2:1, case de base de 64×32 px au zoom 1.
- Zoom progressif de ×0,5 à ×2 (pincement, molette, boutons ; décision du 24 novembre 2026, au lieu de 3 paliers), défilement libre, mini-carte cliquable.
- Rotation par quarts de tour. Les sprites restent identiques dans les 4 orientations ; seuls l'ordre d'affichage et les coordonnées changent.

### 3.2 Types de terrain

| Terrain | Constructible | Rôle |
| --- | --- | --- |
| Herbe | Oui | Terrain par défaut |
| Prairie fertile | Oui | Seul terrain acceptant les fermes ; fertilité de 30 à 100 % |
| Arbres | Après déblaiement | Requis à 2 cases ou moins d'un camp de bûcherons |
| Rochers | Non | Requis à 2 cases ou moins d'une mine de fer ou d'une carrière de marbre |
| Eau (rivière, lac, mer) | Ponts seulement | Alimente les réservoirs, la pêche, les navires ; requise à 2 cases ou moins d'une carrière d'argile |
| Rive droite | Quais seulement | Bord terre-eau rectiligne sur la longueur du quai |
| Route d'entrée et de sortie | Fixe | Voie de Rome : immigrants, émigrants, caravanes |
| Points d'invasion | Invisibles | Cases de bord d'où arrivent les ennemis |

Une carte maritime ajoute un point d'entrée et un point de sortie des navires.

### 3.3 Règles de placement

- Tracé au glisser pour les routes, aqueducs, murailles, zones de logement, jardins et le déblaiement. Placement unitaire pour le reste.
- Aperçu vert ou rouge avant validation ; le coût total s'affiche pendant le tracé.
- Accès routier : au moins une case de route touche un côté du bâtiment (les diagonales ne comptent pas).
- Sans route : puits, réservoirs, aqueducs, fontaines, jardins, statues, murailles, tours, forts.
- Une zone de logement doit se trouver à 2 cases ou moins d'une route.
- La construction reste autorisée tant que le trésor dépasse le plafond de dette (−5 000 deniers).
- Déblaiement : 2 deniers par case ; retire arbres, bâtiments et ruines, sans remboursement.
- Annulation : la dernière action de construction s'annule pendant 10 s, avec remboursement intégral.
- Ponts : posés en ligne droite d'une rive à l'autre. Le pont bas bloque les navires, le pont haut les laisse passer.

### 3.4 Ruines

Un incendie laisse des ruines, un effondrement des gravats. Les deux bloquent la construction jusqu'au déblaiement. Les routes survivent aux incendies et aux effondrements.

## 4. Marcheurs et circulation

Les marcheurs portent tous les services et tous les biens : un bâtiment n'agit que là où son marcheur passe. Le tracé des routes décide donc de la réussite d'une ville, et ce système est le cœur du jeu.

### 4.1 Deux familles

| Famille | Déplacement | Exemples |
| --- | --- | --- |
| Errants (services) | Au hasard le long des routes, puis retour | Préfet, ingénieur, vendeuse, prêtre, médecin, percepteur |
| À destination | Plus court chemin vers une cible | Livreur, acheteuse de marché, immigrant, caravane, soldat |

### 4.2 Règles du marcheur errant

1. Un bâtiment de service émet un marcheur dès qu'il a du personnel. Le suivant part après le retour du précédent et un délai qui s'allonge si le personnel manque.
2. Le marcheur part d'une case de route adjacente. Les départs successifs alternent entre les sorties possibles.
3. À chaque intersection, il choisit une direction au hasard, sans demi-tour sauf en impasse.
4. Après sa portée (26 cases par défaut, réglable par type), il rentre par le plus court chemin et continue de servir sur le retour.
5. À chaque case parcourue, il sert tous les bâtiments situés à 2 cases ou moins.
6. Servir une maison remet au maximum le compteur du service concerné (48 jours). Le compteur perd 1 par jour ; le service est acquis tant qu'il dépasse 0.

### 4.3 Règles du marcheur à destination

- Le chemin se calcule sur le réseau routier. Quittent la route : immigrants, émigrants, soldats, ennemis, préfet courant vers un incendie.
- Sans destination valide (entrepôt plein, aucun preneur), le marcheur attend dans son bâtiment et la production se bloque. Le panneau d'information du bâtiment en donne la raison.
- Route coupée en chemin : recalcul. Sans chemin, retour au bâtiment d'origine.
- Les marcheurs se croisent sans collision, hors combat.

### 4.4 Barrières de circulation (retenues)

Une barrière est une case de route qui arrête les errants et laisse passer les marcheurs à destination. Elle corrige le défaut le plus frustrant du genre : des services qui partent se perdre dans les quartiers industriels. Augustus l'a ajoutée au jeu d'origine sous le nom de roadblocks.

### 4.5 Catalogue des marcheurs

| Marcheur | Issu de | Famille | Effet |
| --- | --- | --- | --- |
| Immigrant | Bord de carte | Destination | Occupe un logement libre |
| Émigrant, sans-abri | Maison | Destination | Cherche un logement, sinon quitte la carte |
| Livreur | Ferme, extraction, atelier, entrepôt, grenier, quai | Destination | Transporte 1 charge |
| Acheteuse de marché | Marché | Destination | Rapporte nourriture et biens des greniers et entrepôts |
| Vendeuse de marché | Marché | Errant | Distribue nourriture et biens aux maisons |
| Préfet | Préfecture | Errant | Baisse le risque d'incendie, éteint les feux, arrête les criminels |
| Ingénieur | Poste d'ingénieur | Errant | Remet à zéro les dommages |
| Percepteur | Forum, sénat | Errant | Recense les maisons pour l'impôt |
| Prêtre | Temple | Errant | Donne accès à son dieu |
| Acteur, gladiateur, dompteur, aurige | École de formation | Destination puis errant | Rejoint un lieu de spectacle, qui diffuse ensuite le divertissement |
| Instituteur, bibliothécaire, professeur | École, bibliothèque, académie | Errant | Éducation |
| Barbier, employé des bains, médecin, chirurgien | Bâtiment de santé | Errant | Santé |
| Caravane | Bord de carte | Destination | Commerce avec les entrepôts |
| Navire marchand | Bord de mer | Destination | Accoste aux quais de commerce |
| Bateau de pêche | Quai de pêche | Destination | Aller-retour vers un banc de poissons |
| Recrue, soldat | Caserne, fort | Destination | Rejoint son fort, obéit aux ordres |
| Ennemi | Point d'invasion | Destination | Attaque bâtiments et soldats |
| Voleur, émeutier | Maison | Destination | Vole le trésor, incendie des bâtiments |

### 4.6 Vitesses et limite

Vitesse de base : 1 case toutes les 15 ticks ; 20 ticks pour un livreur chargé et les unités lentes, 10 pour les unités rapides. La simulation supporte 1 500 marcheurs simultanés sur une grande carte (cible de performance en section 19).

## 5. Habitations

Une maison évolue seule, de la tente au palais, tant que tous les besoins du niveau suivant sont satisfaits ; elle régresse quand un besoin acquis disparaît.

### 5.1 Règles d'évolution

- Le joueur trace des zones de logement d'une case. Les immigrants y montent une petite tente.
- Chaque jour, la maison compare ses besoins acquis à ceux du niveau suivant. Tous satisfaits 2 jours de suite : elle monte d'un niveau.
- Un besoin du niveau courant manquant 8 jours de suite : elle descend d'un niveau. Les habitants en trop deviennent sans-abri.
- Les besoins se cumulent : le niveau N exige tous ceux des niveaux inférieurs.
- Agrandissement (niveaux 10, 15 et 19) : la maison absorbe des maisons voisines de même niveau, des zones vides ou des jardins formant le carré requis.
- Stocks : la vendeuse remplit la réserve de la maison, limitée à 4 mois de consommation.
- Consommation mensuelle : 0,5 unité de nourriture par habitant, et 1 unité de chaque bien requis par case occupée. Une charge vaut 100 unités.
- Une maison sans route à 2 cases ou moins se vide en un mois.

### 5.2 Les 20 niveaux

Les niveaux 1 à 12 logent des plébéiens, qui travaillent. Les niveaux 13 à 20 logent des patriciens, qui ne travaillent pas et paient l'essentiel de l'impôt. Au passage du niveau 12 au niveau 13, la maison perd plus de la moitié de ses habitants, qui repartent chercher un logement.

| Niv. | Nom | Emprise | Habitants | Besoin ajouté | Attractivité min. |
| --- | --- | --- | --- | --- | --- |
| 1 | Petite tente | 1×1 | 4 | Aucun | Aucune |
| 2 | Grande tente | 1×1 | 6 | Eau (puits ou fontaine) | −10 |
| 3 | Petite cabane | 1×1 | 8 | Nourriture, 1 type | −5 |
| 4 | Grande cabane | 1×1 | 10 | Religion, 1 dieu | 0 |
| 5 | Petite masure | 1×1 | 12 | Eau de fontaine | 5 |
| 6 | Grande masure | 1×1 | 14 | Divertissement 10 | 10 |
| 7 | Petite casa | 1×1 | 16 | École | 15 |
| 8 | Grande casa | 1×1 | 18 | Bains, poterie | 20 |
| 9 | Petite insula | 1×1 | 20 | Divertissement 25, barbier | 25 |
| 10 | Insula moyenne | 2×2 | 80 | Mobilier, nourriture 2 types | 30 |
| 11 | Grande insula | 2×2 | 88 | Huile, médecin, 2 dieux | 35 |
| 12 | Insula de prestige | 2×2 | 96 | Divertissement 35, bibliothèque | 40 |
| 13 | Petite villa | 2×2 | 40 | Vin, hôpital, 3 dieux | 48 |
| 14 | Villa moyenne | 2×2 | 44 | Divertissement 45, académie | 54 |
| 15 | Grande villa | 3×3 | 90 | Nourriture 3 types | 60 |
| 16 | Villa de prestige | 3×3 | 100 | Divertissement 55, 4 dieux | 66 |
| 17 | Petit palais | 3×3 | 110 | Divertissement 65 | 72 |
| 18 | Palais moyen | 3×3 | 120 | 5 dieux | 78 |
| 19 | Grand palais | 4×4 | 180 | Divertissement 80 | 84 |
| 20 | Palais impérial | 4×4 | 200 | Divertissement 90 | 90 |

Cette progression suit la structure habituelle du genre. Les valeurs sont des points de départ à régler par tests ; je ne les ai pas comparées à celles du jeu d'origine.

### 5.3 Attractivité

- Chaque bâtiment émet une valeur d'attractivité, positive ou négative, qui décroît avec la distance.
- L'attractivité d'une case est la somme des contributions reçues, bornée entre −100 et +100.
- Le calcul se met à jour à chaque construction ou destruction, uniquement dans la zone touchée.
- Sources positives : jardins, places, statues, temples, lieux de spectacle, écoles, bains, sénat, résidence du gouverneur, villas et palais.
- Sources négatives : extraction, ateliers, entrepôts, greniers, caserne, forts, tentes et cabanes, ruines, marché (léger).

Les valeurs par bâtiment figurent en section 20.

## 6. Population, emploi et main-d'œuvre

La population vient de l'immigration, attirée par les logements libres et retenue par l'humeur de la ville. Les plébéiens forment un réservoir de main-d'œuvre unique pour toute la ville.

### 6.1 Immigration et émigration

- Places libres = capacité totale des maisons − population.
- Chaque mois, si l'humeur atteint 50 et qu'il reste des places : arrivée de min(places libres, 10 % de la population + 20) immigrants.
- Les immigrants entrent par la route de Rome et marchent vers une maison qui a de la place. Ils y entrent depuis une route à 2 cases ou moins, ou depuis sa case : un bâtiment voisin ne bloque jamais une tente vide (décision du 24 novembre 2026). Les sans-abri font de même ; ceux qui partent sortent par cette route.
- Humeur sous 40 : 5 % de la population émigre chaque mois, en commençant par les maisons de plus bas niveau.
- Humeur sous 20 : des émeutiers apparaissent (section 10).

### 6.2 Humeur de la ville

L'humeur va de 0 à 100, démarre à 60 et varie chaque mois selon ce barème.

| Facteur | Variation mensuelle |
| --- | --- |
| Chômage | +1 jusqu'à 5 % ; 0 de 5 à 15 % ; −2 de 15 à 25 % ; −4 au-delà |
| Salaire par rapport à Rome | +1 par tranche de 2 deniers au-dessus (max +3) ; −1 par tranche de 2 deniers en dessous (max −5) |
| Taux d'impôt | +1 jusqu'à 6 % ; 0 de 7 à 9 % ; −1 par tranche de 2 points à partir de 10 % |
| Pénurie alimentaire | −3 si plus de 10 % des maisons manquent de nourriture |
| Habitat précaire | −1 si plus de la moitié des habitants vivent sous la tente |
| Fêtes et faveur de Vénus | Bonus ponctuels (section 9) |

### 6.3 Main-d'œuvre

- Travailleurs disponibles : 40 % de la population plébéienne.
- Réservoir unique : tout bâtiment relié par la route à au moins une maison y accède. Le jeu d'origine exigeait des logements proches de chaque bâtiment ; le réservoir unique retire cette contrainte peu lisible.
- Chaque bâtiment a un effectif requis (section 20).
- Un bâtiment pourvu à X % tourne à X % : production et fréquence des marcheurs. Sous 20 %, il s'arrête.
- En pénurie, la répartition suit les priorités fixées par le joueur chez le conseiller du travail. Sans priorité, elle est proportionnelle.
- Neuf catégories de priorité : alimentation, industrie et commerce, ingénierie, eau, préfectures, militaire, divertissement, santé et éducation, administration et religion.

Extension prévue au lot 4 : une pyramide des âges (naissances, vieillissement, décès) remplace le taux fixe de 40 %. La santé et la nourriture modifient alors natalité et mortalité.

### 6.4 Chômage

Taux de chômage = (travailleurs − emplois pourvus) / travailleurs. Il pèse sur l'humeur, la criminalité (section 10) et la prospérité (section 14).

### 6.5 Salaires

- Le joueur fixe le salaire en deniers pour 10 travailleurs et par an. Valeur de départ : le salaire de Rome, 30 deniers.
- Masse salariale mensuelle = emplois pourvus × salaire / 120.
- Le salaire de Rome change au fil d'événements (section 15).

## 7. Eau, nourriture et distribution

L'eau se diffuse par rayon autour des puits et des fontaines. La nourriture suit une chaîne ferme, grenier, marché, maisons, entièrement portée par des marcheurs.

### 7.1 Eau

| Bâtiment | Condition | Effet |
| --- | --- | --- |
| Puits | Aucune | Eau de puits dans un rayon de 2 cases |
| Réservoir | Touche l'eau, ou relié par aqueduc à un réservoir plein | Alimente les canalisations dans un rayon de 10 cases |
| Aqueduc | Tracé continu entre deux réservoirs | Transporte l'eau ; croise une route à angle droit |
| Fontaine | Dans le rayon d'un réservoir plein, avec du personnel | Eau de fontaine dans un rayon de 4 cases (3 en sous-effectif) |

Les bains exigent aussi le rayon d'un réservoir plein. La couverture en eau est statique : aucun marcheur.

### 7.2 Production alimentaire

- Cinq aliments : blé, légumes, fruits, porc, poisson. Chaque mission n'en autorise qu'une partie.
- Les fermes (3×3) se posent sur la prairie fertile.
- Progression quotidienne d'une ferme = rythme de base × taux d'effectif × fertilité du sol. À 100 %, la ferme sort 1 charge, qu'un livreur porte au grenier le plus proche qui l'accepte.
- Rendement de départ à plein effectif et fertilité 100 % : 8 charges par an pour le blé, 6 pour les autres.
- Repère d'équilibrage : un habitant mange 6 unités par an. Une ferme à blé nourrit donc environ 130 habitants, une autre ferme environ 100.
- Quai de pêche (rive) : son bateau rejoint un banc de poissons de la carte et rapporte 1 charge par voyage.

### 7.3 Greniers

- Emprise 3×3, capacité de 2 400 unités (24 charges), nourriture seulement.
- Consigne par aliment : accepter, refuser, aller chercher, vider.
- « Aller chercher » envoie les livreurs du grenier prendre l'aliment dans d'autres greniers ou entrepôts.

### 7.4 Marchés

- Emprise 2×2, deux marcheurs.
- L'acheteuse va au grenier ou à l'entrepôt le plus proche qui détient un produit demandé, à 40 cases de route au plus. Elle rapporte 1 charge par trajet.
- La vendeuse, errante, remplit la réserve de chaque maison croisée jusqu'à 4 mois de consommation, dans la limite du stock du marché.
- Le marché achète tous les aliments disponibles, et les biens exigés par au moins une maison qu'il dessert.
- Le joueur peut interdire un produit à un marché donné depuis son panneau d'information.

### 7.5 Pénurie

Une maison dont la réserve de nourriture tombe à 0 perd le besoin « nourriture » et régresse après 8 jours. La part des maisons en pénurie pèse sur l'humeur (section 6.2) et sur la santé (section 9.4).

## 8. Industrie et stockage

Cinq chaînes transforment une matière première en bien fini ; tout maillon absent de la province se comble par l'importation.

### 8.1 Chaînes de production

| Matière première | Site de production | Atelier | Bien fini | Usage |
| --- | --- | --- | --- | --- |
| Argile | Carrière d'argile, près de l'eau | Atelier de poterie | Poterie | Maisons dès le niveau 8, export |
| Bois | Camp de bûcherons, près des arbres | Atelier de mobilier | Mobilier | Maisons dès le niveau 10, export |
| Olives | Oliveraie, sur prairie fertile | Pressoir | Huile | Maisons dès le niveau 11, export |
| Raisin | Vignoble, sur prairie fertile | Cave | Vin | Maisons dès le niveau 13, grandes fêtes, export |
| Fer | Mine de fer, près des rochers | Atelier d'armes | Armes | Caserne, demandes de l'empereur, export |
| Marbre | Carrière de marbre, près des rochers | Aucun | Marbre | Grands temples, oracles, export |

### 8.2 Règles de production

- Un site de matière première sort 8 charges par an à plein effectif.
- Un atelier consomme 1 charge de matière pour produire 1 charge de bien, au rythme de 4 charges par an. Un site alimente donc deux ateliers.
- Un atelier garde 2 charges de matière en attente au plus.
- Le livreur d'un producteur sert d'abord un atelier demandeur, sinon un entrepôt qui accepte le bien.
- Les données de chaque mission fixent les matières disponibles sur place.

### 8.3 Entrepôts

- Emprise 3×3, 8 emplacements de 4 charges, un seul type de bien par emplacement : 32 charges au total.
- Consigne par bien : accepter, refuser, aller chercher, vider.
- Plafond par bien : quart, moitié, trois quarts ou totalité de l'entrepôt.
- Les livreurs de l'entrepôt approvisionnent les ateliers en matière, la caserne en armes et les chantiers de temples en marbre.
- Les caravanes et les quais de commerce n'échangent qu'avec les entrepôts.
- Un entrepôt stocke aussi la nourriture destinée au commerce.

### 8.4 Blocages toujours expliqués

Tout bâtiment à l'arrêt affiche sa cause dans son panneau d'information et par une icône au-dessus de lui : pas de route, pas de personnel, pas de matière première, stock plein sans preneur. Cette règle vaut pour tous les bâtiments du jeu.

## 9. Services urbains

Quatre familles de services font monter les maisons au-delà de la cabane et alimentent la cote de culture : religion, divertissement, éducation, santé. Tous passent par des marcheurs errants (section 4.2).

### 9.1 Religion

| Dieu | Domaine | Bienfait | Colère |
| --- | --- | --- | --- |
| Cérès | Agriculture | Récolte immédiate dans toutes les fermes | Les fermes perdent la récolte en cours |
| Neptune | Mer | Recettes du commerce maritime doublées 12 mois | Navires coulés, quais à l'arrêt 6 mois |
| Mercure | Commerce | Un grenier et un entrepôt remplis | Un grenier et un entrepôt vidés |
| Mars | Guerre | La prochaine invasion perd la moitié de ses troupes | Moral des légions à 0 pendant 6 mois |
| Vénus | Amour | Humeur +10 | Humeur −10 |

- Trois lieux de culte : petit temple (couvre 750 habitants), grand temple (1 500), oracle (500 pour chacun des cinq dieux). Temples et grands temples sont dédiés à un dieu.
- Satisfaction de chaque dieu, de 0 à 100. Sa cible mensuelle vaut la part de la population couverte par ses lieux de culte, plafonnée à 100. La satisfaction se rapproche de la cible d'un point par mois.
- Jalousie : un dieu qui a moins de temples que tous les autres voit sa cible baisser de 20.
- Fêtes, organisées chez le conseiller religieux pour un dieu choisi : petite (+5), grande (+10), grandiose (+15, consomme du vin). Coût : 5, 10 ou 15 deniers pour 100 habitants, 50 au minimum. Deux mois de préparation, une fête à la fois.
- Sous 20 : avertissement. Sous 10 : colère, puis la satisfaction remonte à 30. Au-dessus de 90 : bienfait, 24 mois au plus tôt après le précédent.
- Une maison compte les dieux distincts dont un prêtre est passé récemment.
- Option de partie : effets des dieux activés ou non.

### 9.2 Divertissement

| Lieu | Emprise | Artistes requis | Formés par | Points |
| --- | --- | --- | --- | --- |
| Théâtre | 2×2 | Acteurs | Colonie d'acteurs | 15 |
| Amphithéâtre | 3×3 | Acteurs, gladiateurs | Colonie d'acteurs, école de gladiateurs | 10 par type, 20 au plus |
| Colisée | 5×5 | Gladiateurs, lions | École de gladiateurs, maison des lions | 12 pour un type, 25 pour les deux |
| Hippodrome | 15×5 | Auriges | Fabrique de chars | 30 |

- Une école forme un artiste à intervalle régulier ; il rejoint le lieu de spectacle le plus proche qui en manque.
- Un lieu donne un spectacle pendant 32 jours après l'arrivée d'un artiste. Pendant ce temps, ses errants donnent ses points aux maisons croisées.
- Le divertissement d'une maison est la somme des points des lieux dont le compteur est actif : 90 au plus.
- Un seul hippodrome par ville.

### 9.3 Éducation

École (2×2), bibliothèque (2×2) et académie (3×3) émettent chacune un errant qui valide le besoin correspondant des maisons croisées.

### 9.4 Santé

- Barbier (1×1), bains (2×2, sur canalisations), médecin (1×1) et hôpital (3×3) émettent chacun un errant.
- Santé de la ville, de 0 à 100, recalculée chaque mois : part des maisons couvertes par un médecin ou un hôpital (50 points), par des bains (20), variété alimentaire (20), absence de pénurie (10).
- Sous 30 : chaque mois, 5 % de risque d'épidémie. Une à trois maisons sans médecin ni hôpital perdent alors leurs habitants et restent vides 2 mois.

## 10. Sécurité urbaine

Chaque bâtiment accumule un risque d'incendie et des dommages ; seuls les passages réguliers des préfets et des ingénieurs les ramènent à zéro.

### 10.1 Incendie

- Compteur de risque de 0 à 100 par bâtiment. Hausse quotidienne selon le type : 1 pour tentes et cabanes, 0,6 pour ateliers et entrepôts, 0,3 pour le reste, 0 pour routes, jardins, murailles, aqueducs, puits.
- Coefficient de climat par mission : 0,75 au nord, 1 au centre, 1,5 en zone aride.
- Le passage d'un préfet remet le compteur à 0.
- Au-delà de 80, le bâtiment prend feu chaque jour avec une probabilité de (risque − 80) %.
- Un bâtiment en feu est détruit et brûle 20 jours. Chaque jour, il a 10 % de chances d'enflammer chaque bâtiment voisin.
- Le préfet le plus proche, à 15 cases au plus, court vers le feu et l'éteint en 2 jours.
- Les habitants d'une maison brûlée deviennent sans-abri.

### 10.2 Effondrement

- Compteur de dommages de 0 à 100, hausse quotidienne de 0,3 pour tous les bâtiments sauf tentes, routes, jardins, murailles et aqueducs.
- Le passage d'un ingénieur le remet à 0.
- Au-delà de 80, même tirage que pour le feu ; le bâtiment devient un tas de gravats.

### 10.3 Criminalité

- Niveau de criminalité de 0 à 100 par maison, recalculé chaque mois.
- Hausse mensuelle : (50 − humeur) / 5 quand l'humeur est sous 50, doublée pour les tentes et cabanes.
- Le passage d'un préfet retire 10 points.
- Au-delà de 50 : la maison peut émettre un voleur, qui dérobe de 50 à 200 deniers au forum ou au sénat le plus proche.
- Au-delà de 80 avec une humeur sous 20 : la maison émet un émeutier, qui incendie jusqu'à 3 bâtiments.
- Un préfet qui croise un voleur ou un émeutier l'arrête.
- Chaque émeute fait baisser la cote de paix (section 14).

## 11. Finances et administration

Le trésor se compte en deniers. L'impôt des maisons recensées et l'exportation sont les deux recettes durables ; tout le reste coûte.

### 11.1 Postes du budget

- Recettes : impôts, exportations, secours de l'empereur.
- Dépenses : constructions, importations, salaires, tribut annuel, intérêts de la dette, fêtes, salaire du gouverneur, vols.

### 11.2 Impôt

- Une maison paie seulement si un percepteur est passé dans les 48 derniers jours.
- Impôt annuel d'une maison = habitants × coefficient de niveau × taux en % / 20, prélevé par douzièmes chaque mois.
- Coefficients : tentes 1, cabanes 1, masures 2, casae 3, insulae 5, villas 12, palais 30.
- Taux réglable de 0 à 25 %, 7 % au départ. Son effet sur l'humeur figure en section 6.2.
- Repère : 2 500 habitants en casae à 7 % rapportent environ 2 600 deniers par an, pour une masse salariale d'environ 3 000.

### 11.3 Bâtiments d'administration

| Bâtiment | Emprise | Rôle |
| --- | --- | --- |
| Forum | 2×2 | 1 percepteur |
| Sénat | 5×5, unique | 2 percepteurs, forte attractivité, affichage des cotes |
| Résidence du gouverneur | 3×3, 4×4 ou 5×5 | Forte attractivité ; une seule par ville |

### 11.4 Dette et secours

- Chaque mission fixe les fonds de départ.
- Le trésor peut descendre jusqu'à −5 000 deniers. À ce plafond, toute construction est refusée.
- Premier passage sous 0 : l'empereur verse un secours unique de 4 000 deniers et la faveur perd 5 points.
- Trésor négatif en fin d'année : intérêts de 10 % de la dette, et perte de faveur (section 14).

### 11.5 Tribut

Chaque janvier, la ville verse à Rome le plus grand de deux montants : 25 % du bénéfice de l'année écoulée hors constructions, ou population / 20 deniers.

### 11.6 Gouverneur

- Le gouverneur reçoit un salaire mensuel prélevé sur le trésor, plafonné à 10 deniers par rang atteint. Le joueur peut le baisser.
- Sa fortune personnelle se conserve d'une mission à l'autre.
- Elle sert à offrir des présents à l'empereur (section 14) ou à renflouer le trésor.

## 12. Commerce et carte de l'Empire

Le commerce comble les manques de la province et finance la ville : le joueur ouvre des routes vers des cités partenaires, puis règle bien par bien ce qu'il importe et exporte.

### 12.1 Carte de l'Empire

- Écran dédié montrant Rome, la ville du joueur et 5 à 8 cités partenaires par mission.
- Fiche d'une cité : type de route (terre ou mer), coût d'ouverture (500 à 3 000 deniers), biens achetés, biens vendus, quota annuel par bien (15, 25 ou 40 charges).
- Ouvrir une route est un paiement unique. Une route maritime exige un quai de commerce en service.
- La carte montre aussi les armées en approche (section 13).

### 12.2 Réglages par bien

Chez le conseiller du commerce, chaque bien reçoit un statut :

- Ne pas échanger (défaut).
- Importer, jusqu'à un stock cible en charges.
- Exporter, en conservant un stock minimal en charges.
- Réserver : le bien n'est plus consommé ni exporté. Sert à préparer une demande de l'empereur.

### 12.3 Caravanes

- Chaque route terrestre ouverte envoie une caravane tous les 2 mois par la route de Rome.
- Elle visite les 3 entrepôts les plus proches sur son trajet, échange 8 charges au plus, puis repart.
- Chaque charge échangée est payée ou encaissée sur-le-champ.

### 12.4 Navires

- Chaque route maritime ouverte envoie un navire tous les 2 mois. Il accoste à un quai de commerce libre, sinon il attend au large.
- Capacité de 12 charges. Les 3 livreurs du quai font la navette avec les entrepôts.
- Le navire repart une fois ses échanges terminés, ou après 40 jours.
- Un pont bas sur son trajet lui interdit l'accès.

### 12.5 Prix et quotas

- Chaque bien a un prix d'importation et un prix d'exportation plus bas (section 20).
- Le quota annuel d'une cité pour un bien se remet à zéro chaque janvier.
- Des événements modifient prix et quotas, ou ferment une route quelques mois (section 15).

## 13. Militaire

Les missions militaires subissent des invasions datées et annoncées ; le joueur les repousse avec des cohortes qu'il commande directement et des fortifications.

### 13.1 Bâtiments militaires

| Bâtiment | Emprise | Rôle |
| --- | --- | --- |
| Caserne | 3×3 | Forme 1 recrue tous les 8 jours ; chaque légionnaire consomme 1 charge d'armes |
| Académie militaire | 3×3 | Les recrues y passent et gagnent 1 niveau d'entraînement |
| Fort | 4×4 | Abrite une cohorte de 16 soldats d'un seul type ; 6 forts au plus |
| Muraille | 1×1 | Bloque les ennemis |
| Tour | 2×2 | Collée à une muraille, tire à 6 cases |
| Porte fortifiée | 2×2 | Fait passer une route à travers la muraille |

### 13.2 Unités du joueur

| Unité | Rôle | Points de vie | Dégâts par coup | Portée | Vitesse |
| --- | --- | --- | --- | --- | --- |
| Légionnaire | Mêlée lourde | 100 | 10 | Contact | Lente |
| Lanceur de javelots | Tir | 60 | 6 | 5 cases | Moyenne |
| Cavalier | Harcèlement | 80 | 8 | Contact | Rapide |

### 13.3 Commandement

- Un appui sur le fort ou sur l'étendard sélectionne la cohorte.
- Ordres : aller à une case, changer de formation (ligne, colonne, carré), rentrer au fort.
- Les soldats engagent seuls tout ennemi à 4 cases ou moins.
- Moral de 0 à 100 : il baisse avec les pertes et remonte au fort. Sous 20, la cohorte rentre au fort sans ordre.
- La caserne remplace les soldats tués tant qu'elle a des armes. Niveau d'entraînement : 0 à la sortie de la caserne, +1 après l'académie, +1 par invasion repoussée, 3 au plus.

### 13.4 Combat

- Un combattant frappe toutes les 20 ticks (1 s à vitesse normale).
- Dégâts infligés = dégâts de base × (1 + 0,1 × niveau d'entraînement).
- Une tour inflige 8 points toutes les 40 ticks.
- Chaque bâtiment a des points de structure : 100 pour une maison, 300 pour une muraille, 500 pour une tour ou un fort.

### 13.5 Ennemis

Cinq archétypes : infanterie légère, infanterie lourde, tireurs, cavalerie, unité de siège (éléphants ou chars, dégâts doublés contre les murailles). Une faction est un habillage et un dosage de ces archétypes : Carthaginois, Gaulois, Germains, Numides, Parthes, Pictes.

| Archétype | Points de vie | Dégâts par coup | Portée | Vitesse |
| --- | --- | --- | --- | --- |
| Infanterie légère | 50 | 6 | Contact | Moyenne |
| Infanterie lourde | 90 | 9 | Contact | Lente |
| Tireurs | 40 | 5 | 5 cases | Moyenne |
| Cavalerie | 70 | 8 | Contact | Rapide |
| Unité de siège | 250 | 15 | Contact | Lente |

- Les ennemis entrent par un point d'invasion et marchent vers leur cible prioritaire.
- Cible selon la faction : bâtiment le plus proche, greniers et entrepôts, ou soldats.
- L'invasion prend fin quand tous les ennemis sont morts ou qu'ils ont perdu 70 % de leur effectif ; les survivants quittent alors la carte.

### 13.6 Invasions

- Chaque mission décrit ses invasions : date, faction, effectif (8 à 150), point d'entrée.
- Trois annonces : 12 mois avant, 3 mois avant, à l'arrivée. L'armée en approche se voit sur la carte de l'Empire.
- Chaque bâtiment détruit par l'ennemi fait baisser la cote de paix (section 14).

### 13.7 Demandes de troupes

L'empereur peut demander des cohortes pour défendre une cité de l'Empire. Les cohortes envoyées quittent la carte de 6 à 12 mois. L'issue se calcule sur leur effectif et leur entraînement, puis modifie la faveur. Un refus coûte de la faveur.

## 14. Les cinq critères

Le nombre d'habitants et quatre cotes notées de 0 à 100 décident de la victoire. Chaque cote suit une formule fixe, que le conseiller des cotes explique au joueur.

### 14.1 Population

Nombre d'habitants logés. Les sans-abri ne comptent pas.

### 14.2 Prospérité

Recalculée chaque janvier, sur l'année écoulée.

| Condition | Variation |
| --- | --- |
| Recettes supérieures aux dépenses | +5, sinon −3 |
| Chômage | +1 sous 5 % ; −1 au-dessus de 15 % |
| Salaire | +1 s'il dépasse celui de Rome d'au moins 2 deniers ; −1 s'il est inférieur |
| Habitat | +2 si 30 % des habitants vivent en villa ou palais ; −2 si 30 % vivent en tente ou cabane |
| Alimentation | +1 si la moitié des maisons reçoit 2 types d'aliments |
| Hippodrome en activité | +1 |

La prospérité est plafonnée par la qualité de l'habitat : moyenne par habitant de la valeur de sa maison (tente 5, cabane 10, masure 20, casa 35, insula 55, villa 80, palais 100).

### 14.3 Culture

Recalculée chaque mois. Chaque composante rapporte ses points au prorata de sa couverture : capacité totale des bâtiments / population, plafonnée à 1.

| Composante | Capacité par bâtiment | Points max |
| --- | --- | --- |
| Religion | Petit temple 750, grand temple 1 500, oracle 500 | 30 |
| Théâtres | 500 | 25 |
| Bibliothèques | 800 | 20 |
| Écoles | 750 | 15 |
| Académies | 1 000 | 10 |

Seuls comptent les bâtiments en service, avec du personnel.

### 14.4 Paix

- Démarre à 0, sauf valeur fixée par la mission.
- +5 chaque janvier après une année sans incident.
- −5 par émeute, 20 points au plus par an.
- −1 par bâtiment détruit par l'ennemi, 30 points au plus par invasion.
- +5 pour une invasion repoussée sans bâtiment détruit.

### 14.5 Faveur de l'empereur

| Événement | Variation |
| --- | --- |
| Départ de mission | 50, sauf valeur fixée par la mission |
| Érosion, chaque janvier | −2 |
| Trésor négatif en fin d'année | −5 |
| Secours impérial reçu | −5 |
| Demande satisfaite dans le délai | +5 à +10 selon la demande |
| Demande satisfaite en retard | +2 |
| Demande ignorée, troupes refusées | −8 |
| Présent modeste, généreux, somptueux | +2, +5, +10 pour 10, 25, 50 % de la fortune du gouverneur |

Un second présent dans les 12 mois rapporte moitié moins.

### 14.6 Conseiller des cotes

Pour chaque cote, l'écran affiche la valeur, le seuil de la mission et le facteur le plus limitant en une phrase, par exemple « La culture manque de bibliothèques ».

## 15. Événements et demandes de l'empereur

Chaque mission porte un script d'événements datés. Ils obligent la ville à garder des marges : stocks, trésor, troupes.

### 15.1 Demandes de l'empereur

- Une demande précise un bien, une quantité (5 à 40 charges) et un délai (12 à 24 mois). Elle peut aussi porter sur des deniers ou des troupes.
- Le joueur expédie depuis l'écran du conseiller impérial dès que ses entrepôts contiennent la quantité demandée.
- Rappels à 6 mois et à 1 mois de l'échéance.
- Effets sur la faveur : section 14.5.

### 15.2 Catalogue des événements

| Événement | Effet | Annonce |
| --- | --- | --- |
| Invasion | Voir section 13 | 12 mois et 3 mois avant |
| Salaire de Rome | Hausse ou baisse de 1 à 4 deniers | À la date |
| Prix d'un bien | Hausse ou baisse de 10 à 30 deniers | À la date |
| Quota d'une cité | Passage au palier supérieur ou inférieur | À la date |
| Route commerciale fermée | Aucun échange pendant 3 à 12 mois | À la date |
| Nouvelle cité partenaire | Une route devient ouvrable | À la date |
| Mauvaise récolte | Fertilité divisée par 2 pendant 12 mois | À la date |
| Site d'extraction perdu | Une mine ou une carrière est détruite | Aucune |
| Tremblement de terre | Détruit les bâtiments d'une bande de cases définie par la mission | Aucune |
| Épidémie | Voir section 9.4 | Aucune |
| Humeur d'un dieu | Bienfait ou colère, section 9.1 | Avertissement sous 20 |

### 15.3 Format et messages

- Tous les événements se déclarent dans les données de la mission : type, date fixe ou fenêtre aléatoire, paramètres. Aucun événement codé en dur.
- Chaque événement crée un message dans le journal, avec un bouton qui centre la caméra sur le lieu concerné.
- Un réglage met le jeu en pause à chaque message critique (invasion, incendie majeur, demande impériale).

## 16. Campagne et modes de jeu

La campagne compte 10 échelons, et chaque échelon gagné donne un rang. Les trois premiers imposent leur carte ; les sept suivants offrent le choix entre une province paisible et une province militaire, soit 17 cartes au total. Ce format déroge à la règle des 20 niveaux du site (section 19.6).

### 16.1 Progression

| Éch. | Rang gagné | Province paisible | Province militaire | L'échelon introduit |
| --- | --- | --- | --- | --- |
| 1 | Citoyen | Ostie |  | Logements, eau, nourriture (tutoriel) |
| 2 | Scribe | Pompéi |  | Préfets, ingénieurs, religion, divertissement, impôts (tutoriel) |
| 3 | Édile | Ravenne |  | Industrie, entrepôts, commerce terrestre, demandes de l'empereur |
| 4 | Questeur | Narbo | Aquilée | Commerce maritime ; premières invasions et murailles |
| 5 | Tribun | Massalia | Vindobona | Pêche et exportation ; cohortes complètes |
| 6 | Préteur | Éphèse | Burdigala | Culture élevée ; terres fertiles rares |
| 7 | Légat | Alexandrie | Leptis Magna | Climat aride, nourriture importée ; cavalerie numide |
| 8 | Consul | Corinthe | Colonia Agrippina | Tremblements de terre ; grandes invasions germaniques |
| 9 | Proconsul | Antioche | Palmyre | Quartiers patriciens ; armées parthes |
| 10 | Princeps | Athènes | Eburacum | Tous les systèmes, seuils maximaux |

Villes et rangs sont des noms historiques. Aucune de ces villes ne figure dans la campagne du jeu d'origine, d'après mon souvenir de celle-ci ; à vérifier avant de figer la liste.

### 16.2 Objectifs par échelon

Quand deux valeurs figurent, la première vaut pour la province paisible, la seconde pour la militaire.

| Éch. | Population | Culture | Prospérité | Paix | Faveur |
| --- | --- | --- | --- | --- | --- |
| 1 | 150 |  |  |  |  |
| 2 | 600 |  |  |  |  |
| 3 | 2 000 | 30 | 10 | 10 | 40 |
| 4 | 2 500 | 40 / 30 | 25 / 15 | 20 / 30 | 45 |
| 5 | 3 500 | 45 / 35 | 35 / 20 | 25 / 40 | 50 |
| 6 | 4 500 | 55 / 40 | 45 / 30 | 30 / 45 | 55 |
| 7 | 5 500 | 60 / 45 | 55 / 35 | 35 / 50 | 60 |
| 8 | 7 000 | 65 / 50 | 65 / 45 | 40 / 55 | 65 |
| 9 | 8 500 | 70 / 55 | 70 / 50 | 45 / 60 | 70 |
| 10 | 10 000 | 75 / 60 | 75 / 60 | 50 / 60 | 80 |

### 16.3 Données d'une mission

Une mission est un fichier de données qui contient :

- la carte : terrain, prairies fertiles, entrée et sortie de route, voie maritime, bancs de poissons, points d'invasion ;
- les bâtiments autorisés, les aliments et les matières premières disponibles ;
- les fonds de départ (repère : 8 000 deniers à l'échelon 1, 5 000 à l'échelon 10), la date de départ, le climat, les cotes initiales ;
- les cinq seuils de victoire et la limite de temps éventuelle ;
- les cités partenaires, leurs biens, quotas et coûts d'ouverture ;
- le script d'événements : demandes, invasions, aléas ;
- les textes de présentation et de victoire, par clés de traduction.

### 16.4 Tutoriels

Les échelons 1 et 2 guident le joueur pas à pas. Chaque étape affiche une consigne mesurable (« Tracez 10 cases de logement »), débloque les bâtiments suivants une fois atteinte, et reste consultable dans le journal.

### 16.5 Autres modes

- Construction libre : toute carte déjà débloquée, fonds au choix, invasions et effets des dieux activables, aucun seuil.
- Poursuite après victoire : 2 ou 5 ans de plus sur la même ville.

### 16.6 Progression enregistrée

Le jeu conserve les cartes gagnées, le rang, la fortune du gouverneur et les étoiles de chaque carte.

| Étoiles | Condition |
| --- | --- |
| 1 | Mission gagnée, quelle que soit la difficulté |
| 2 | Gagnée sans avoir reçu le secours de l'empereur |
| 3 | En plus, gagnée avant la date cible de la mission |

La date cible vaut 1,5 fois la durée d'une partie de référence en difficulté normale : la troisième étoile reste accessible sans optimisation poussée. Chaque carte donne jusqu'à 3 étoiles, soit 51 au total. La campagne est terminée quand les 10 échelons sont gagnés ; rejouer un échelon dans l'autre province ajoute les étoiles de sa carte.

## 17. Interface et commandes

L'écran de jeu tient en trois zones : une barre d'état en haut, le menu de construction (latéral, sur PC comme sur mobile) et la carte. Le détail passe par les panneaux d'information, les calques et les conseillers.

### 17.1 Écran de jeu

- Barre d'état : trésor, population, date, vitesse et pause, menu.
- Menu de construction en 12 catégories : logement, déblaiement, routes et ponts, eau, alimentation, industrie et stockage, santé, religion, éducation, divertissement, administration et embellissement, sécurité et militaire.
- Chaque bâtiment du menu affiche son coût. Les bâtiments non autorisés par la mission sont masqués.
- Accès permanents : mini-carte, calques, conseillers, carte de l'Empire, journal, rotation, zoom.

### 17.2 Panneau d'information

- Ouverture : clic droit sur PC, appui long sur mobile.
- Bâtiment : nom, état (en service, ou à l'arrêt avec sa cause), effectif pourvu sur effectif requis, stocks, avancement de la production, consignes.
- Maison : niveau, habitants, réserves, besoins satisfaits, et la liste exacte de ce qui manque pour monter d'un niveau.
- Marcheur : type, origine, destination.

### 17.3 Calques

Un calque aplatit les bâtiments et remplace chaque maison par une colonne dont la hauteur et la couleur indiquent le niveau de couverture. Seuls les marcheurs du service concerné restent visibles.

| Calque | Affiche |
| --- | --- |
| Eau | Canalisations, portée des puits et fontaines |
| Feu, dommages, criminalité | Compteur de risque par bâtiment |
| Problèmes | Bâtiments à l'arrêt et leur cause |
| Stocks | Remplissage des greniers, marchés et entrepôts (décision du 24 novembre 2026) |
| Nourriture | Réserve des maisons en mois |
| Divertissement | Points par maison, total ou par type de lieu |
| Éducation | École, bibliothèque, académie |
| Santé | Barbier, bains, médecin, hôpital |
| Religion | Nombre de dieux accessibles par maison |
| Impôts | Maisons recensées ou non |
| Attractivité | Valeur par case |

### 17.4 Conseillers

| Conseiller | Contenu | Actions |
| --- | --- | --- |
| En chef | Une ligne par domaine, en vert, orange ou rouge | Aucune |
| Travail | Emplois par catégorie, chômage, salaire | Priorités, salaire |
| Militaire | Cohortes, moral, invasions annoncées | Rappel au fort, envoi de troupes |
| Impérial | Faveur, demandes, fortune du gouverneur | Expédier, offrir un présent, salaire du gouverneur |
| Cotes | Les cinq critères face aux seuils | Aucune |
| Commerce | Stocks, statut et prix par bien | Réglages par bien, carte de l'Empire |
| Population | Historique, répartition par niveau de maison, immigration | Aucune |
| Santé | Santé de la ville, couverture par bâtiment | Aucune |
| Éducation | Couverture par bâtiment | Aucune |
| Divertissement | Couverture par lieu, artistes disponibles | Aucune |
| Religion | Satisfaction des cinq dieux | Organiser une fête |
| Finances | Budget de l'année en cours et de la précédente | Taux d'impôt |

### 17.5 Commandes

| Action | PC | Mobile |
| --- | --- | --- |
| Déplacer la carte | Flèches, touches configurables, bords de l'écran | Glisser à un doigt sans outil, à deux doigts avec un outil |
| Zoomer | Molette | Pincer |
| Poser ou tracer | Clic gauche, glisser | Glisser, puis boutons Valider et Annuler |
| Information | Clic droit | Appui long |
| Quitter l'outil | Clic droit, Échap | Bouton Annuler |
| Pause, vitesse, rotation | P ou Échap, + et −, R | Boutons de la barre d'état |

Sur mobile, aucun paiement ne part avant l'appui sur Valider. Le jeu se joue en paysage. Téléphone tenu en portrait, l'affichage pivote d'un quart de tour : le joueur tient son téléphone à l'horizontale, même si la rotation automatique est désactivée. À ma connaissance, le cadre isolé du site ne permet pas au jeu de verrouiller lui-même l'orientation. Les cibles tactiles font au moins 44 px. Échap annule d'abord l'outil en cours, puis ouvre la pause.

### 17.6 Écrans hors partie

- Écran titre : titre, consigne en deux phrases, bouton Jouer, bouton du son, bouton de langue, mention « Conseillé dès 13 ans ».
- Jouer ouvre la fenêtre commune du site, Continuer ou Nouvelle partie, puis la sélection des missions avec rang et étoiles.
- Pause, par un bouton toujours visible ou par P ou Échap : reprendre, recommencer, accueil. Pause automatique quand l'onglet est masqué.
- Options : langue, son, pause sur message critique, difficulté, effets des dieux, vitesse de défilement.
- Écran de mission : présentation, seuils, choix de la province, étoiles déjà obtenues.
- Écrans de victoire et de défaite : bilan, étoiles, mission suivante ou réessayer.
- Construction libre et chargement d'une ville, depuis la sélection des missions.
- Aide intégrée : une fiche par bâtiment et par mécanique.

### 17.7 Lisibilité

Les calques doublent toujours la couleur par la hauteur des colonnes ou par une icône. Aucun texte sous 14 px sur mobile.

## 18. Graphismes, audio et langues

Tous les graphismes sont dessinés par le code et tous les sons sont synthétisés, comme le demandent les consignes du site. La dérogation de poids accordée à ce jeu rouvre une option : des images embarquées dans le fichier (section 18.4).

### 18.1 Inventaire graphique

| Famille | Quantité estimée | Détail |
| --- | --- | --- |
| Terrain | 40 | Herbe, prairie, arbres, rochers, eau, rives, routes et aqueducs par type de jonction, murailles |
| Bâtiments | 70 | Dont 20 animés (ateliers, fontaine, marché) |
| Maisons | 20 | Un dessin par niveau, variantes par paramètres |
| Marcheurs | 35 types | Silhouettes à 4 directions, marche en 2 à 4 poses ; combat pour soldats et ennemis |
| Ruines, feu, gravats | 10 | Feu animé |
| Interface | 100 | Icônes de menu, portraits des conseillers, carte de l'Empire |

### 18.2 Direction artistique

- Dessin vectoriel en canvas ou SVG, isométrie 2:1, même source de lumière partout.
- Chaque dessin est une fonction paramétrée (taille, couleurs, état), rendue une fois dans un cache d'images au lancement puis réutilisée.
- Lisible au zoom ×0,5 sur téléphone : silhouettes et couleurs de toit distinctes par catégorie de bâtiment.
- Aucun texte dans les dessins.

### 18.3 Affiche et aperçus

- Affiche : quand `window.JEL_AFFICHE` est vrai, le jeu dessine une scène de ville sans interface ni texte. Le site en tire la jaquette.
- Aperçus : quand `window.JEL_APERCU` vaut 1, 2 ou 3, le jeu s'ouvre en pleine partie sur une ville de début, de milieu, puis de fin de campagne.
- Les deux aperçus de téléphone se capturent en paysage, en 844 × 390 : adaptation à prévoir dans le script du site.
- Ces deux modes exigent des villes d'exemple embarquées dans les données.

### 18.4 Images embarquées (option)

La dérogation de poids permet de remplacer une partie des dessins par des images encodées dans `index.html`. Un essai sur 10 bâtiments, avant le lot 2, tranche entre le dessin par le code seul et les images embarquées. L'option demande une dérogation de plus, à la règle du site sur les images, et ajoute de 2 à 4 Mo (estimation).

### 18.5 Audio

- Tous les sons sont générés avec Web Audio ; aucun fichier audio.
- Effets : construction, destruction, incendie, alerte, victoire, interface.
- Ambiances synthétisées selon ce que montre l'écran : marché, atelier, eau, foule.
- Musique : motifs courts générés par le code, 4 ambiances (petite ville, grande ville, menace, combat). Qualité à juger au lot 5 ; repli possible sur les seules ambiances.
- Bouton pour couper le son, visible et mémorisé. Aucun son avant la première action du joueur.

### 18.6 Langues

- Cinq langues : français (langue source), anglais, espagnol, portugais du Brésil, allemand.
- Textes dans le bloc commun du site (`jel-i18n-textes`), lus par `t()` ; mêmes clés dans les 5 langues.
- Aucune phrase assemblée par concaténation : des gabarits à variables. Nombres formatés par le module commun.
- Le nom du jeu, Marmoria, reste identique dans toutes les langues.
- Volume estimé : 1 500 chaînes, soit environ 500 Ko pour les 5 langues.

## 19. Architecture technique

Trois exigences sont imposées : une simulation déterministe à pas fixe, séparée de l'affichage, dont toutes les règles chiffrées vivent dans des fichiers de données. Les autres choix reviennent à l'IA de développement, qui les justifie.

Schéma (dans le document d'origine) : architecture en 3 couches, données, sauvegarde, tests.

L'interface envoie des commandes, la simulation applique les règles lues dans les fichiers de données, le rendu lit l'état sans le modifier. Les tests pilotent la simulation seule, sans affichage.

### 19.1 Exigences imposées

1. Séparation en trois couches : simulation, rendu, interface. La simulation ignore l'écran et tourne seule dans les tests.
2. Pas fixe de 20 ticks par seconde à vitesse normale. La vitesse de jeu change le nombre de ticks par image, jamais la durée d'un tick.
3. Déterminisme : le générateur aléatoire à graine fait partie de l'état. Même graine et mêmes commandes donnent le même état.
4. Commandes : toute action du joueur est un objet sérialisable appliqué à un tick donné. L'interface ne modifie jamais l'état directement.
5. Données : bâtiments, biens, niveaux de maison, marcheurs, barèmes et missions vivent dans des fichiers validés au chargement. Aucun chiffre de règle dans le code.
6. État entièrement sérialisable, avec un numéro de version.
7. Aucun appel réseau en jeu : tous les fichiers sont locaux.
8. Bibliothèques tierces admises sous licence permissive (MIT, BSD, Apache). GPL et AGPL exclues.

### 19.2 Choix ouverts et recommandations

| Sujet | Recommandation |
| --- | --- |
| Langage | TypeScript ou JavaScript en modules, assemblés en un seul fichier |
| Rendu | Canvas 2D limité à la zone visible ; WebGL si la cible de performance n'est pas tenue |
| Recherche de chemin | Parcours en largeur sur le graphe des routes, cache invalidé à chaque modification de route |
| Stockage de la carte | Un tableau typé par couche : terrain, bâtiment, route, eau, attractivité |
| Cartes des missions | Encodage compact par plages répétées, dans les données |
| Assemblage | Un script produit `index.html` et les fichiers de textes par langue ; les scripts du site y recopient ensuite les modules communs |

### 19.3 Performances cibles

Scène de référence : carte 120×120, 5 000 habitants, 600 marcheurs.

| Mesure | Cible |
| --- | --- |
| Images par seconde | 60 sur PC, 30 sur téléphone de milieu de gamme |
| Durée d'un tick | 4 ms sur PC, 10 ms sur mobile |
| Chargement initial | 8 s en 4G, cache d'images compris |
| Poids de `index.html` | Aucune limite imposée ; repère de 4 Mo sans images embarquées |
| Taille d'une ville sauvegardée | 1 Mo |

Ces cibles sont des hypothèses à confirmer par mesure dès le lot 1.

Budget de poids indicatif, mesuré à chaque lot :

| Poste | Budget |
| --- | --- |
| Code : simulation, rendu, interface, dessins | 1 800 Ko |
| Textes des 5 langues | 500 Ko |
| Cartes et données | 600 Ko |
| Modules communs du site | 100 Ko |
| Marge | 1 000 Ko |

Je ne sais pas chiffrer le poids final avec fiabilité : mon estimation tourne autour de 2 Mo. Le propriétaire du site n'impose aucune limite quand le besoin le justifie ; les 4 Mo servent de repère. Le poids reste mesuré à chaque lot, car il pèse sur le temps de chargement en 4G, et tout dépassement du repère est signalé avec sa raison.

### 19.4 Sauvegarde

- Le jeu tourne dans un cadre isolé sans stockage propre : toute sauvegarde passe par les modules communs du site.
- Progression (missions gagnées, étoiles, rang, fortune, options) : module `JEL_SAVE`, avec sa fenêtre Continuer ou Nouvelle partie.
- Villes : module `JEL_STOCK`, 3 sauvegardes automatiques tournantes et 5 emplacements manuels numérotés.
- Sauvegarde automatique chaque année de jeu et à la fermeture de la page.
- Export par fichier après un geste du joueur. L'import d'un fichier n'apparaît pas dans le module du site : à étudier.
- Chaque sauvegarde porte sa version. Une sauvegarde ancienne est migrée, ou refusée avec un message ; elle ne fait jamais planter le jeu.
- Sans stockage disponible, le jeu reste jouable, sans sauvegarde.

### 19.5 Tests

- Tests unitaires : chaque formule de ce cahier a au moins un test.
- Scénarios déterministes : graine et script de commandes, puis valeurs attendues après N ticks.
- Endurance : 50 années de jeu à vitesse maximale sans affichage, sans exception.
- Invariants vérifiés à chaque tick en mode test : aucun stock négatif, aucun marcheur hors carte, population égale à la somme des maisons.
- Mesure automatisée de la scène de référence.
- Outils de mise au point cachés : ajouter des fonds, accélérer ×20, déclencher un événement, afficher chemins et compteurs.

Le choix des outils de test revient à l'IA de développement.

### 19.6 Intégration au site

Le fichier `CONSIGNES-JEU.md` du dépôt du site fait foi, sauf sur les trois dérogations listées plus bas. Règles suivies :

- Un seul fichier `index.html`, sans adresse Internet ni code réseau ; dessins en SVG ou canvas, sons en Web Audio.
- Code lisible et commenté en français.
- Fin de mission signalée par `FMG.reportEnd` ; campagne terminée signalée par `FMG.reportComplete`.
- Écran titre avec la mention « Conseillé dès 13 ans », tutoriel animé, pause, sélection des niveaux, bouton du son, écrans de victoire et de défaite.
- Affiche (`JEL_AFFICHE`) et trois aperçus (`JEL_APERCU`).
- À l'ordinateur en 1366 × 768, le jeu occupe au moins 70 % de la largeur.
- Interdits : `alert`, `confirm`, `prompt`, formulaires. Aucun champ de saisie dans le jeu.
- Fiche `game.json` : genre `simulation`, genre secondaire `strategie`, univers `monde`, âge `13+`.

Trois dérogations décidées par le propriétaire du site le 24 novembre 2026. Chacune doit être codée dans le robot de validation du site avant la première demande de fusion, qui serait refusée sans cela.

| Règle du site | Dérogation pour ce jeu | À adapter côté site |
| --- | --- | --- |
| `index.html` de moins de 2 Mo | Aucune limite si le besoin le justifie ; repère de 4 Mo | Contrôle « Fichiers » |
| 20 niveaux au moins | 17 cartes en 10 échelons ; `window.JEL_NIVEAUX` et `niveaux` valent 17, `etoiles` vaut 51 | Contrôle « Niveaux » |
| Téléphone en portrait d'abord | Jeu en paysage | Essai tactile et aperçus de téléphone en 844 × 390 |

Deux écarts assumés avec le ressenti décrit par les consignes : une mission dure de 30 minutes à 3 heures, et le jeu demande plus de 10 secondes pour être compris. Les deux tutoriels compensent le second.

## 20. Tables de données

Ces tables sont le contenu initial des fichiers de données. Toutes les valeurs sont des points de départ à régler par tests de jeu, lot après lot.

Lecture de la colonne Attractivité : « +4 sur 3 » signifie +4 au contact du bâtiment, avec une décroissance linéaire jusqu'à 0 à 3 cases. Les coûts sont en deniers.

### 20.1 Infrastructures et embellissement

| Élément | Emprise | Coût | Effectif | Attractivité |
| --- | --- | --- | --- | --- |
| Route | 1×1 | 4 | 0 | 0 |
| Place pavée | 1×1 | 15 | 0 | +4 sur 2 |
| Barrière de circulation | 1×1 | 10 | 0 | 0 |
| Pont bas | Par case | 40 | 0 | 0 |
| Pont haut | Par case | 100 | 0 | 0 |
| Zone de logement | 1×1 | 10 | 0 | De −2 sur 2 (tente) à +6 sur 4 (palais) |
| Jardin | 1×1 | 12 | 0 | +3 sur 3 |
| Petite statue | 1×1 | 12 | 0 | +3 sur 3 |
| Statue moyenne | 2×2 | 60 | 0 | +10 sur 4 |
| Grande statue | 3×3 | 150 | 0 | +14 sur 5 |

### 20.2 Eau, alimentation et stockage

| Bâtiment | Emprise | Coût | Effectif | Attractivité |
| --- | --- | --- | --- | --- |
| Puits | 1×1 | 5 | 0 | −1 sur 1 |
| Fontaine | 1×1 | 15 | 4 | 0 |
| Réservoir | 3×3 | 80 | 0 | −6 sur 3 |
| Aqueduc | 1×1 | 8 | 0 | −2 sur 1 |
| Ferme (blé, légumes, fruits, porcs, olives, vigne) | 3×3 | 40 | 10 | −2 sur 2 |
| Quai de pêche | 2×2 | 60 | 6 | −8 sur 3 |
| Grenier | 3×3 | 100 | 6 | −4 sur 3 |
| Marché | 2×2 | 40 | 5 | −2 sur 2 |
| Entrepôt | 3×3 | 70 | 6 | −5 sur 3 |
| Quai de commerce | 3×3 | 100 | 12 | −8 sur 3 |

### 20.3 Industrie

| Bâtiment | Emprise | Coût | Effectif | Attractivité |
| --- | --- | --- | --- | --- |
| Carrière d'argile | 2×2 | 40 | 10 | −3 sur 2 |
| Camp de bûcherons | 2×2 | 40 | 10 | −3 sur 2 |
| Mine de fer | 2×2 | 50 | 10 | −6 sur 3 |
| Carrière de marbre | 2×2 | 50 | 10 | −6 sur 3 |
| Atelier (poterie, mobilier, pressoir, cave, armes) | 2×2 | 50 | 10 | −4 sur 2 |

### 20.4 Services

| Bâtiment | Emprise | Coût | Effectif | Attractivité |
| --- | --- | --- | --- | --- |
| Préfecture | 1×1 | 30 | 6 | −2 sur 2 |
| Poste d'ingénieur | 1×1 | 30 | 5 | 0 |
| Barbier | 1×1 | 25 | 2 | +2 sur 2 |
| Bains | 2×2 | 50 | 10 | +4 sur 3 |
| Médecin | 1×1 | 30 | 5 | 0 |
| Hôpital | 3×3 | 300 | 30 | −1 sur 2 |
| École | 2×2 | 50 | 10 | −2 sur 2 |
| Bibliothèque | 2×2 | 75 | 20 | +4 sur 3 |
| Académie | 3×3 | 100 | 30 | +4 sur 3 |
| Petit temple | 2×2 | 50 | 2 | +4 sur 3 |
| Grand temple | 3×3 | 150 et 2 charges de marbre | 5 | +8 sur 4 |
| Oracle | 2×2 | 200 et 2 charges de marbre | 0 | +8 sur 4 |
| Théâtre | 2×2 | 50 | 8 | +2 sur 2 |
| Colonie d'acteurs | 3×3 | 50 | 5 | +2 sur 2 |
| Amphithéâtre | 3×3 | 100 | 12 | +4 sur 3 |
| École de gladiateurs | 3×3 | 75 | 8 | −3 sur 2 |
| Colisée | 5×5 | 500 | 25 | −3 sur 3 |
| Maison des lions | 3×3 | 75 | 8 | −3 sur 2 |
| Hippodrome | 15×5 | 2 500 | 150 | −3 sur 3 |
| Fabrique de chars | 3×3 | 75 | 10 | −3 sur 2 |

### 20.5 Administration et militaire

| Bâtiment | Emprise | Coût | Effectif | Attractivité |
| --- | --- | --- | --- | --- |
| Forum | 2×2 | 75 | 6 | +3 sur 2 |
| Sénat | 5×5 | 400 | 30 | +8 sur 4 |
| Résidence, maison | 3×3 | 150 | 0 | +12 sur 3 |
| Résidence, villa | 4×4 | 400 | 0 | +20 sur 4 |
| Résidence, palais | 5×5 | 700 | 0 | +28 sur 5 |
| Muraille | 1×1 | 12 | 0 | 0 |
| Tour | 2×2 | 150 | 6 | −6 sur 3 |
| Porte fortifiée | 2×2 | 100 | 3 | −4 sur 3 |
| Caserne | 3×3 | 150 | 10 | −6 sur 3 |
| Académie militaire | 3×3 | 1 000 | 20 | −3 sur 3 |
| Fort | 4×4 | 1 000 | 0 | −20 sur 6 |

### 20.6 Prix des biens

Prix en deniers par charge.

| Bien | Importation | Exportation |
| --- | --- | --- |
| Blé | 30 | 20 |
| Légumes | 40 | 28 |
| Fruits | 40 | 28 |
| Porc | 45 | 32 |
| Poisson | 45 | 32 |
| Olives | 45 | 30 |
| Raisin | 45 | 30 |
| Argile | 40 | 25 |
| Bois | 50 | 35 |
| Fer | 60 | 40 |
| Marbre | 200 | 140 |
| Poterie | 180 | 140 |
| Mobilier | 200 | 150 |
| Huile | 180 | 140 |
| Vin | 220 | 160 |
| Armes | 250 | 180 |

Repère d'équilibrage : un atelier exporte 4 charges par an, soit 560 à 720 deniers, pour 30 deniers de salaires. Les quotas des cités partenaires sont donc le vrai frein du commerce, et leur réglage pèse plus que celui des prix.

## 21. Phasage et critères d'acceptation

Le développement suit 5 lots dans l'ordre. Un lot ne démarre qu'une fois les critères du précédent atteints. Cinq est un plancher : en dessous, un lot devient trop gros pour être validé en une fois.

| Lot | Contenu | Critères d'acceptation |
| --- | --- | --- |
| 1. Ville vivante | Socle : carte isométrique, caméra, zoom, rotation, tracé et placement, boucle à pas fixe, commandes, graine, sauvegarde, PC et tactile en paysage, dessins par le code. Jeu : logements de niveau 1 à 6, immigrants, eau, ferme à blé, grenier, marché, marcheurs errants et à destination, préfets, ingénieurs, feu, effondrement, main-d'œuvre, forum et impôts, petit temple, théâtre et colonie d'acteurs, barrières, panneaux d'information, calques eau, feu, dommages. Site : écran titre, pause, son, sélection des missions, étoiles, 5 langues. Tutoriels des échelons 1 et 2 | Même état après 10 000 ticks pour une même graine et les mêmes commandes ; état identique après sauvegarde puis chargement ; cibles de la section 19.3 tenues sur une carte 160×160 remplie ; un joueur qui découvre le jeu termine les deux tutoriels sans aide ; contrôles du site au vert, dérogations de la section 19.6 appliquées ; `index.html` mesuré, repère de 1 Mo |
| 2. Économie | Toutes les fermes, pêche, extraction, ateliers, entrepôts et consignes ; biens dans les marchés ; niveaux 7 à 12 ; attractivité ; éducation, santé ; amphithéâtre, colisée ; temples des cinq dieux, sans humeur ni effets ; 6 conseillers (travail, finances, population, santé, éducation, divertissement) ; calques restants ; construction libre | Une insula de prestige (niveau 12) atteinte en construction libre ; un scénario de test par chaîne de production ; `index.html` mesuré, repère de 1,8 Mo |
| 3. Commerce et empereur | Carte de l'Empire, caravanes, quais, navires ; demandes, faveur, tribut, dette ; cinq cotes, victoire et défaite ; cinq dieux, fêtes ; événements ; 5 conseillers (commerce, impérial, cotes, religion, en chef) ; missions Ravenne, Narbo et Massalia | Les trois missions se gagnent en difficulté normale ; un test par formule de cote ; `index.html` mesuré, repère de 2,6 Mo |
| 4. Guerre et patriciens | Fortifications, caserne, académie, forts, 3 unités, commandement, combat ; 5 archétypes ennemis, invasions ; demandes de troupes ; destitution ; conseiller militaire ; niveaux 13 à 20 ; hippodrome, sénat, résidences ; pyramide des âges ; épidémies ; criminalité et émeutes ; niveaux de difficulté ; fortune du gouverneur ; missions Aquilée et Vindobona | Une invasion de 50 ennemis se joue aux cibles de performance ; un palais impérial (niveau 20) atteint en construction libre ; 10 000 habitants aux cibles de performance ; les deux missions se gagnent en difficulté normale ; `index.html` mesuré, repère de 3,4 Mo |
| 5. Campagne et finitions | Les 10 cartes restantes ; équilibrage ; dates cibles des étoiles ; musique synthétisée ; affiche et aperçus ; aide intégrée ; textes de la page du jeu dans les 5 langues | La campagne se termine par les deux branches ; aucune chaîne non traduite ; tous les contrôles du site au vert ; `index.html` mesuré, repère de 4 Mo |

### 21.1 Règles de conduite

- Chaque lot livre une version jouable, ses tests au vert, le poids de `index.html` et la liste des écarts avec ce cahier.
- Une consigne par lot pour l'IA de développement : elle cite les sections concernées, fixe le besoin et les critères, laisse les choix techniques ouverts.
- À l'intérieur d'un lot, l'IA de développement avance par étapes vérifiables et enregistre chaque étape.
- Après chaque lot, une séance de jeu réelle ; l'équilibrage ne touche que les fichiers de données.
- Toute règle modifiée en cours de route est reportée dans ce cahier.

### 21.2 Durée

Je n'ai aucune base fiable pour chiffrer la durée des lots avec un développement par IA. Mesurer le temps réel du lot 1, puis extrapoler : les lots 1 et 4 sont les plus gros.

## 22. Risques et décisions à valider

Les neuf décisions de cadrage sont prises, avec trois dérogations aux consignes du site. Deux points restent ouverts : les images embarquées et la date de publication.

### 22.1 Décisions

| N° | Sujet | Décision du 24 novembre 2026 |
| --- | --- | --- |
| 1 | Appareils | Mobile et PC dès le lot 1 ; paysage sur téléphone |
| 2 | Format du livrable | Un seul fichier `index.html` ; aucune limite de poids si le besoin le justifie |
| 3 | Public | Ados et adultes, combats sans sang ; classé `13+` sur le site |
| 4 | Circulation et main-d'œuvre | Barrières de circulation et réservoir unique retenus |
| 5 | Taille de carte | 120×120 au plus sur mobile, 160×160 sur PC, à confirmer par les mesures du lot 1 |
| 6 | Graphismes | Dessin par le code au lot 1 ; images embarquées en option, après un essai sur 10 bâtiments |
| 7 | Campagne | 17 cartes en 10 échelons, choix de la province à partir du quatrième, un rang gagné par échelon ; dérogation à la règle des 20 niveaux |
| 8 | Étoiles | 3 étoiles par carte, la troisième accessible sans optimisation poussée (section 16.6) |
| 9 | Nom | Marmoria, « la cité de marbre ». Aucun homonyme exact dans mes recherches du 24 novembre 2026, qui ne valent pas recherche de marque |

Les dérogations aux consignes du site figurent en section 19.6.

### 22.2 Points ouverts

| Point | Options | Recommandation |
| --- | --- | --- |
| Images embarquées | Dessin par le code seul ; images pour une partie des bâtiments | Essai sur 10 bâtiments avant le lot 2 (section 18.4) |
| Publication | Attendre le lot 5 ; publier dès le lot 3 | La dérogation sur les niveaux rend possible une publication anticipée ; à décider à la fin du lot 3 |

### 22.3 Risques

| Risque | Niveau | Parade |
| --- | --- | --- |
| Le projet s'arrête avant le lot 5 | Élevé | Chaque lot est jouable ; le lot 3 forme déjà un jeu de gestion complet sans guerre et peut être publié |
| Équilibrage faux au départ | Certain | Aucune valeur de ce cahier n'a été testée en jeu ; réglage par données, outils de mise au point, séance de jeu par lot |
| Dérogations absentes du robot du site | Moyen | Les coder côté site avant la première demande de fusion (section 19.6) |
| Poids et temps de chargement | Moyen | Poids mesuré à chaque lot face au repère de 4 Mo ; cible de chargement de la section 19.3 |
| Interface trop dense sur un téléphone en paysage | Moyen | Menu latéral, panneaux repliables, test sur téléphone à chaque lot |
| Dessins par le code trop schématiques | Moyen | Essai d'images embarquées avant le lot 2 |
| Performances sur mobile | Moyen | Mesure dès le lot 1 ; réduction de la taille de carte et du nombre de marcheurs |
| Dérive entre le code et ce cahier | Moyen | Un test par formule ; liste des écarts à chaque lot |
| Sauvegardes effacées par le navigateur | Moyen | Export par fichier ; stockage persistant demandé par le module du site |
| Ressemblance jugée excessive avec le jeu d'origine | Faible si la section 1.3 est respectée | Nom, dessins, textes, cartes et campagne originaux |

### 22.4 Ce que ce cahier ne fixe pas

- Le dessin des 17 cartes : à produire avec un éditeur interne, du lot 1 au lot 5.
- Les textes de mission, d'aide et de la page du jeu.
- Le détail des appels aux modules communs du site : `CONSIGNES-JEU.md` fait foi.

### 22.5 Fiabilité de ce cahier

Les mécaniques décrites viennent de ma connaissance du genre. Je ne les ai pas vérifiées ligne à ligne contre le jeu d'origine. Les formules et les valeurs sont des propositions cohérentes entre elles, sans garantie d'équilibre. Deux points ont été vérifiés le 24 novembre 2026 : les faits sur Julius et Augustus (section 1.3), en ligne, et les contraintes du site, lues dans `CONSIGNES-JEU.md` et `I18N.md` du dépôt.


## 23. Réalisation

Le jeu se développe dans `sources/marmoria/` et s'assemble dans `games/marmoria/` (section 23.1). Chaque lot ajoute ici ce qu'il livre, ses mesures et ses écarts avec ce cahier.

### 23.1 Organisation du code

| Fichier | Rôle |
| --- | --- |
| `sources/marmoria/donnees.json` | Toutes les règles chiffrées : temps, barèmes, 20 niveaux de maison, bâtiments, marcheurs, prix, rangs, difficultés, 17 missions (cartes, objectifs, tutoriels). Validées au chargement (`MM_SIM.charger`). |
| `sources/marmoria/sim.js` | Simulation à pas fixe, déterministe (hasard à graine dans l'état), sans page ni horloge ; commandes sérialisables (`appliquer`), état sérialisable versionné (`exporter`, `importer`, `empreinte`). |
| `sources/marmoria/exemples.js` | Villes d'exemple bâties par commandes (affiche, aperçus, écran titre) et « joueur raisonnable » (tests). |
| `sources/marmoria/dessins.js` | Tous les dessins, par le code, en cache par zoom ; aucun texte. |
| `sources/marmoria/rendu.js` | Rendu isométrique Canvas 2D limité à la zone visible, rotation, zoom, calques, mini-carte. Lit l'état sans le modifier. |
| `sources/marmoria/audio.js` | Sons Web Audio synthétisés. |
| `sources/marmoria/interface.js` | Écrans, barre d'état, menus, panneaux, saisie (souris, clavier, doigt), tutoriels, sauvegardes. N'agit sur l'état que par des commandes. |
| `sources/marmoria/gabarit.html` | Page et styles ; un bloc `<script id="mm-…">` par couche. |
| `sources/marmoria/textes/*.json` | Textes des 5 langues et textes de la fiche (`meta`), rangés par `scripts/i18n-jeu.mjs`. |
| `sources/marmoria/assembler.mjs` | Produit `games/marmoria/index.html` : recopie les couches, bâtit les 3 villes d'exemple en Node, range les textes et les modules communs du site, mesure le poids. |
| `scripts/tester-marmoria.mjs` | Tests de la simulation seule (section 19.5), lus dans le jeu assemblé. |
| `scripts/derogations-jeux.mjs` | Les trois dérogations de la section 19.6, lues par les robots du site. |

Après toute modification : `node sources/marmoria/assembler.mjs`, puis `node scripts/tester-marmoria.mjs` et les contrôles du site. Le contrôle « Contrôle des jeux » réassemble le jeu et refuse un `games/marmoria/` qui ne correspond pas aux sources.

### 23.2 Lot 1 « Ville vivante » (24 novembre 2026)

Livré :

- Socle : carte isométrique 2:1 (cases de 64 × 32), caméra, zoom ×0,5 / ×1 / ×2 (molette, pincement, boutons), rotation par quarts de tour (R), tracé au glisser (routes, aqueducs, logements, déblaiement) et pose unitaire, aperçu vert ou rouge avec le coût, annulation de la dernière construction pendant 10 s, boucle à pas fixe de 20 ticks par seconde et vitesses pause, ×0,5, ×1, ×2, ×4, commandes, graine, sauvegarde ; PC (souris, clavier, défilement par les bords) et tactile en paysage (glisser puis Valider ou Annuler, deux doigts, appui long), téléphone tenu en portrait pivoté d'un quart de tour ; dessins par le code.
- Jeu : logements des niveaux 1 à 6 (les besoins des niveaux 7 à 20 sont dans les données), immigrants, émigrants, sans-abri, eau (puits, réservoir, aqueduc, fontaine), ferme à blé, grenier, marché (acheteuse et vendeuse), marcheurs errants et à destination, barrières de circulation, préfets, ingénieurs, feu et propagation, effondrement, ruines et gravats, main-d'œuvre en réservoir unique, forum et impôts, salaires, humeur, petit temple de Cérès, théâtre et colonie d'acteurs, panneaux d'information (bâtiment avec sa cause d'arrêt, maison avec ce qui manque pour monter, marcheur, terrain), icônes d'arrêt au-dessus des bâtiments, calques eau, feu, dommages, mini-carte, journal avec « Aller voir », panneau « Gouvernement » (objectifs, humeur détaillée, travail, impôt et salaire réglables, budget).
- Site : écran titre (consigne en deux phrases, Jouer, son, langue, « Conseillé dès 13 ans »), fenêtre Continuer / Nouvelle partie / Effacer la sauvegarde (`JEL_SAVE`), sélection des 17 missions avec rang et étoiles (15 « en préparation »), présentation de mission, pause automatique quand l'onglet est caché, options, villes enregistrées par `JEL_STOCK` (3 automatiques tournantes chaque année et à la fermeture, 5 emplacements, export d'un fichier), prise en main animée en 3 étapes, tutoriels des missions 1 (9 étapes) et 2 (7 étapes) avec consignes mesurables, main animée et déblocages, victoire (étoiles, `FMG.reportEnd`, `FMG.reportComplete` quand les 17 cartes sont gagnées) et défaite (ville anéantie, délai), 5 langues, affiche (`JEL_AFFICHE`), trois aperçus (`JEL_APERCU`), mode de mise au point (`?debug=1` : `MM_DEBUG`).

Mesures (sous Node, PC de développement) :

| Critère (section 21) | Résultat |
| --- | --- |
| Même état après 10 000 ticks, même graine et mêmes commandes | Tenu (`tester-marmoria.mjs`) |
| État identique après sauvegarde puis chargement | Tenu : sauvegarde au tick 5 000, chargement, 5 000 ticks, même empreinte qu'en continu |
| Cibles 19.3 sur 160 × 160 remplie | 33 200 habitants, 4 298 bâtiments, 804 marcheurs : 0,74 ms par tick en moyenne (cible 4 ms), 12 ms au pire (début de jour : main-d'œuvre, eau, immigration, étalés sur des ticks différents). Images par seconde sur téléphone : à mesurer sur un vrai appareil. |
| Tutoriels terminés sans aide | Un joueur automatique gagne Ostie (3 étoiles) et Pompéi ; à confirmer par une séance de jeu réelle. |
| Endurance | 50 années sans exception ni invariant violé (7 s). |
| Taille d'une ville sauvegardée | Environ 100 Ko (cible 1 Mo). |
| Poids de `index.html` | 758 Ko, dont 3 villes d'exemple et les textes des 5 langues (repère du lot 1 : 1 Mo). |
| Contrôles du site | `validate-games --jouer` (téléphone 844 × 390, ordinateur : 100 % de la largeur, affiche, 3 images du jeu), `tester-sauvegarde`, `tester-stockage`, `check-i18n` (5 langues), `controle-taxonomie`, `regles-seo`, `verifier-seo` : tout est bon. |

Écarts avec ce cahier (à valider ; les valeurs sont dans `donnees.json`) :

1. Humeur (6.2) : le barème est appliqué chaque mois, puis l'humeur revient de 10 % vers 60 (`humeur.retour`). Sans ce rappel, l'humeur ne fait qu'accumuler les malus et toute ville finit sous 40. Le barème ne s'applique qu'à partir de 200 habitants (`humeur.populationMin`) : sans emplois au départ, le chômage à 100 % coupait l'immigration au 3e mois. Pompéi ignore le chômage (`humeurIgnore`) : sans industrie (lot 2), 40 % de travailleurs ne trouvent pas d'emploi.
2. Pénurie (6.2, 7.5) : ne comptent que les maisons dont le niveau exige de la nourriture (cabanes et au-delà) et dont la réserve est vide ; une tente n'en « manque » pas.
3. Propagation du feu (10.1) : 3 % par jour et par voisin au lieu de 10 %. À 10 %, un feu non éteint en 20 jours touche presque sûrement chaque voisin (88 %) : les tests ont vu des villes entières brûler.
4. Ostie n'a ni feu ni effondrement (`risques: false`) : préfets et ingénieurs arrivent à la mission 2, comme le prévoit la section 16.1.
5. Attractivité (5.3) : prévue au lot 2 ; les seuils d'attractivité des maisons ne sont pas encore exigés (les valeurs sont déjà dans les données).
6. Main-d'œuvre (6.3) : sans écran de priorités (lot 2), la répartition est proportionnelle. Un bâtiment posé sans route (fontaine) accède à la main-d'œuvre par une route à 2 cases ou moins.
7. Ferme : ses 9 cases doivent être en prairie fertile ; sa fertilité est la moyenne des 9.
8. Aqueduc : il peut passer sur une route sans contrôle de l'angle droit.
9. Cartes : décrites dans les données par une graine et des paramètres (mer, rivière, prairies, rochers, voie de Rome) au lieu d'un encodage par plages ; l'éditeur interne reste à faire. Ostie et Pompéi font 80 × 80.
10. Immigration (6.1) : le quota mensuel arrive jour après jour (groupes de 4 au plus) plutôt qu'en une fois, vers la maison libre la plus proche de la voie de Rome.
11. Secours de l'empereur (11.4) : versé au premier trésor négatif (il conditionne la 2e étoile) ; la perte de faveur viendra avec la faveur, au lot 3.
12. Zoom ×3 : réservé à l'affiche, jamais en jeu.
13. Import d'un fichier de ville : non fait (le cahier le laisse à étudier) ; l'export l'est.
14. Page du jeu : les deux aperçus de téléphone sont capturés en 844 × 390 (dérogation) ; la bande d'images de la page, prévue pour des images de téléphone en portrait, est à adapter avant la publication.

Publication : le jeu n'est pas publié au lot 1. La pull request reste ouverte jusqu'à la décision de la section 22.2 (fin du lot 3).

### 23.3 Retours du propriétaire du 24 novembre 2026

1. **Zoom progressif** (sections 3.1 et 17.5) : le pincement suit l'écart des deux doigts, la molette et le pavé tactile zooment en continu, les boutons par crans de 25 %, de ×0,5 à ×2. Les dessins restent en cache à 4 résolutions (×0,5, ×1, ×2, ×3 pour l'affiche) : chaque image prend la résolution juste au-dessus du zoom affiché. Les cases d'herbe, de prairie et d'eau débordent très légèrement, pour qu'aucun liseré n'apparaisse entre elles aux zooms intermédiaires.
2. **Tentes inaccessibles** (section 6.1) : un immigrant devait marcher jusque sur la case de sa maison ; une tente entourée d'autres bâtiments (le milieu d'un pâté) ne recevait donc jamais personne. On entre maintenant depuis une route à 2 cases ou moins (la distance déjà exigée pour poser un logement). Effet mesuré sur la ville d'exemple de 2 ans : 1 386 habitants au lieu de 394. Test ajouté : un pâté de 3 × 3 logements est entièrement habité.
3. **Stocks visibles sans clic** :
   - sur le dessin même : le grenier laisse voir son tas de grain dans une grande ouverture de façade et aligne un sac devant sa porte par quart de remplissage ; le marché aligne 4 cagettes devant ses étals, pleines ou vides (5 états : vide, un quart, moitié, trois quarts, plein) ; l'entrepôt du lot 2 suivra le même principe ;
   - nouveau calque « Stocks » : bâtiments aplatis, une colonne par grenier et par marché, d'autant plus haute et verte qu'il est plein, rouge quand il est presque vide ; seuls les livreurs, acheteuses et vendeuses restent visibles.
4. Corrigé au passage : les colonnes des calques feu et dommages sortaient noires (couleur mal formée).
5. Affiche : son héros est désormais toujours le temple (le forum ou le temple changeait selon la ville d'exemple) ; texte de la jaquette réécrit dans les 5 langues. `version` 2.
