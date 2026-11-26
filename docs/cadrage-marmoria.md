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

- Multijoueur, sauf le mode « Cités voisines » du lot 6 (section 16.7, décision du 25 novembre 2026) : ni ville partagée, ni partie en temps réel.
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

Ce cahier couvre environ 70 types de bâtiments, 35 types de marcheurs, 20 niveaux d'habitation et 17 cartes : un périmètre de production de studio. Le développer d'un bloc échouera. Le cahier impose donc 5 lots, chacun jouable et testable seul (section 21), plus un sixième, à plusieurs, ajouté le 25 novembre 2026. Le lot 1 livre une petite ville vivante, sans commerce ni armée.

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
3. À chaque intersection, il choisit une direction au hasard, sans demi-tour sauf en impasse. *Modifié le 26 novembre 2026 (section 23.16) : il va vers le bâtiment qui a le plus besoin de lui, le plus proche d'abord ; seul le préfet sans cible patrouille encore au hasard.*
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

Extension réalisée au lot 4 : une pyramide des âges (naissances, vieillissement, décès) module le taux de 40 % ; la santé et la nourriture modifient natalité et mortalité (section 23.9, écart 3).

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

- Compteur de risque de 0 à 100 par bâtiment. Hausse quotidienne selon le type : 1 pour tentes et cabanes, 0,6 pour ateliers et entrepôts, 0,3 pour le reste, 0 pour routes, jardins, murailles, aqueducs et tout bâtiment qui se passe de route (puits, fontaines, réservoirs, statues, oracle ; décision du 25 novembre 2026, section 23.7).
- Coefficient de climat par mission : 0,75 au nord, 1 au centre, 1,5 en zone aride.
- Le passage d'un préfet remet le compteur à 0.
- Au-delà de 80, le bâtiment prend feu chaque jour avec une probabilité de (risque − 80) %.
- Un bâtiment en feu est détruit et brûle 20 jours. Chaque jour, il a 10 % de chances d'enflammer chaque bâtiment voisin.
- Le préfet le plus proche, à 15 cases au plus, court vers le feu et l'éteint en 2 jours.
- Les habitants d'une maison brûlée deviennent sans-abri.

### 10.2 Effondrement

- Compteur de dommages de 0 à 100, hausse quotidienne de 0,3 pour tous les bâtiments sauf tentes, routes, jardins, murailles, aqueducs et bâtiments qui se passent de route (puits, fontaines, réservoirs, statues, oracle) : loin d'une route, aucun ingénieur ne peut les atteindre (décision du 25 novembre 2026, section 23.7).
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
- *Modifié le 26 novembre 2026 (section 23.16) : chaque douzième s'accumule dans la maison (un an au plus) et le percepteur prélève tous les arriérés à son passage.*
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

### 16.7 Mode « Cités voisines » (lot 6)

Seul mode à plusieurs du jeu, choisi par le propriétaire le 25 novembre 2026 et développé après le lot 5. Il ne touche ni la campagne ni la construction libre.

**Principe**

- De 2 à 4 joueurs forment une province. Chacun gouverne sa propre cité, sur sa propre carte et sur son propre appareil, à sa vitesse, pause comprise.
- Sur la carte de l'Empire de chacun, les autres joueurs sont des cités partenaires : on ouvre une route vers eux, puis on leur vend et on leur achète avec les statuts de la section 12.2, comme à une cité de l'ordinateur.
- Les joueurs n'ont pas besoin d'être en ligne en même temps : une province se joue sur plusieurs jours, chacun à son heure.

**Calendriers indépendants : le comptoir de province**

Chaque cité garde son propre calendrier ; aucune horloge n'est partagée. Les échanges passent par un comptoir de province que tient le serveur commun du site.

- Vente : une caravane (ou un navire) qui part vers les voisins sort les charges des entrepôts et les dépose à l'étal de la cité, au comptoir. Elles restent à elle jusqu'à leur achat ; elle peut les reprendre avec sa caravane suivante.
- Achat : une caravane qui arrive d'un voisin apporte, dans la limite de 8 charges, ce que les étals des voisins offrent parmi les biens que la cité importe. La cité paie à l'arrivée.
- Paiement : le vendeur reçoit l'argent à sa prochaine connexion, au poste « Ventes aux voisins ».
- Prix entre joueurs : la moyenne du prix d'importation et du prix d'exportation (section 20.6), par exemple 160 deniers pour une charge de poterie. Le vendeur gagne plus et l'acheteur paie moins qu'avec une cité de l'ordinateur.
- Plafond : 40 charges par bien, par voisin et par année de la cité qui achète.

**Ce que garantit le comptoir**

- Il est la seule autorité. Chaque dépôt, achat ou paiement est une opération numérotée, appliquée une seule fois, même si le message arrive deux fois ou après une coupure. Aucune charge ni aucun denier n'y est créé ou perdu.
- Ce qu'une cité reçoit entre dans sa simulation comme une commande datée (section 19.1, point 4) : le déterminisme et la sauvegarde restent tenus.
- Le serveur ne garde que le comptoir : étals, soldes, statuts du commerce, pseudos et avancement affiché, quelques kilo-octets par province. La ville de chaque joueur reste sur son appareil.
- Le jeu n'a toujours aucun accès réseau (section 19.1, point 7) : le lanceur du site fait le lien, comme pour les autres jeux à plusieurs.
- Hors connexion, ou quota du serveur atteint : les routes vers les voisins sont fermées, comme pour l'événement « route fermée », et la cité continue avec les cités de l'ordinateur. Ce qu'elle a déposé reste au comptoir.

**Provinces et cartes**

- Cartes dessinées pour ce mode et complémentaires : chaque cité manque de matières qu'un voisin a en abondance (argile, olives, marbre, fer, poisson). L'échange entre joueurs rapporte ainsi plus que celui avec l'ordinateur.
- Deux provinces de 4 cités au lot 6. Les cités de l'ordinateur y restent, avec des quotas plus bas.
- Place libre, ou voisin absent depuis plus de 7 jours : sur les cartes des autres, une cité de l'ordinateur prend sa place (biens et quotas fixes, section 12.1), et son étal reste en vente. Le joueur reprend sa place à son retour. Le serveur ne simule aucune ville.

**Rejoindre, voir les voisins**

- Province privée, rejointe par un code ou par une invitation depuis la page Amis du site ; pas de province publique au hasard (décision du propriétaire, 26 novembre 2026).
- On rejoint en cours de route, sans salon d'attente : un joueur crée la province et commence seul, ses voisins étant des cités de l'ordinateur ; un ami la rejoint plus tard, à n'importe quel moment, et prend une cité libre de la province. Un message prévient alors les joueurs déjà présents, à leur prochaine connexion s'ils ne sont pas en ligne (décision du propriétaire, 26 novembre 2026).
- Chaque joueur voit de ses voisins : le pseudo de leur profil, leur population, leurs cotes et leur dernière visite. Aucun texte libre (règle du site) ; une liste fixe de signaux permet de se coordonner (« Je cherche du vin », « J'ai du marbre à vendre »).
- Une province sans aucune visite pendant 30 jours est effacée du serveur.

**Fin et récompenses**

- Objectif commun (décision du propriétaire, 26 novembre 2026) : la province gagne quand chaque cité active atteint ses seuils ; la part de chacun est affichée (ventes aux voisins, population). La fin est signalée par `FMG.reportEnd`, comme une mission.
- Aucune récompense du profil joueur liée au commerce entre joueurs : seul le temps de jeu compte, comme en solo. Le serveur ne refait pas la simulation des villes : un appareil modifié pourrait déposer des charges inventées. Les provinces privées et le plafond de 40 charges limitent l'effet de cette triche à la province touchée.

**Coût sur le serveur (estimation à mesurer au lot 6)**

Une opération par caravane, soit au plus 3 messages par minute et par joueur à la vitesse ×4. Les écritures sont groupées : au plus une par minute et par province active. 25 provinces de 4 joueurs actifs une heure par jour font environ 18 000 messages, 900 requêtes, et de 1 500 à 6 000 lignes écrites selon que les voisins jouent ensemble ou à des heures différentes : loin des limites gratuites (100 000 requêtes et 100 000 lignes par jour, `docs/multijoueur.md`, section 7).

**Côté site**

- `game.json` : `"multijoueur": true` (étiquette « Multi » et rubrique « Multijoueur ») et `"places": 4`.
- Quatrième dérogation (section 19.6), à coder dans le robot du site avant la demande de fusion : le robot contrôle le lien avec le comptoir au lieu des moteurs tour par tour ou temps réel.
- Nouveau Durable Object « Province » dans le Worker commun, déployé par `multijoueur.yml` ; `docs/multijoueur.md` complété.
- Politiques de confidentialité et de cookies : comptoir gardé 30 jours après la dernière visite, pseudos visibles par les voisins.

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
- Musique : motifs courts générés par le code, 4 ambiances (petite ville, grande ville, menace, combat). Qualité à juger au lot 5 ; repli possible sur les seules ambiances. Refaite le 26 novembre 2026 (section 23.13) : quatre morceaux écrits, instruments antiques imités, toujours sans fichier audio.
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
7. Aucun appel réseau en jeu : tous les fichiers sont locaux. Au lot 6, les échanges entre cités voisines passent par le lanceur du site, jamais par le jeu (section 16.7).
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

Le lot 6 demandera une quatrième dérogation (section 16.7) : un jeu marqué multijoueur qui n'utilise ni le moteur tour par tour du site ni son moteur temps réel.

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

Le développement suit 6 lots dans l'ordre (le lot 6, à plusieurs, est ajouté le 25 novembre 2026). Un lot ne démarre qu'une fois les critères du précédent atteints. Cinq est un plancher : en dessous, un lot devient trop gros pour être validé en une fois.

| Lot | Contenu | Critères d'acceptation |
| --- | --- | --- |
| 1. Ville vivante | Socle : carte isométrique, caméra, zoom, rotation, tracé et placement, boucle à pas fixe, commandes, graine, sauvegarde, PC et tactile en paysage, dessins par le code. Jeu : logements de niveau 1 à 6, immigrants, eau, ferme à blé, grenier, marché, marcheurs errants et à destination, préfets, ingénieurs, feu, effondrement, main-d'œuvre, forum et impôts, petit temple, théâtre et colonie d'acteurs, barrières, panneaux d'information, calques eau, feu, dommages. Site : écran titre, pause, son, sélection des missions, étoiles, 5 langues. Tutoriels des échelons 1 et 2 | Même état après 10 000 ticks pour une même graine et les mêmes commandes ; état identique après sauvegarde puis chargement ; cibles de la section 19.3 tenues sur une carte 160×160 remplie ; un joueur qui découvre le jeu termine les deux tutoriels sans aide ; contrôles du site au vert, dérogations de la section 19.6 appliquées ; `index.html` mesuré, repère de 1 Mo |
| 2. Économie | Toutes les fermes, pêche, extraction, ateliers, entrepôts et consignes ; biens dans les marchés ; niveaux 7 à 12 ; attractivité ; éducation, santé ; amphithéâtre, colisée ; temples des cinq dieux, sans humeur ni effets ; 6 conseillers (travail, finances, population, santé, éducation, divertissement) ; calques restants ; construction libre | Une insula de prestige (niveau 12) atteinte en construction libre ; un scénario de test par chaîne de production ; `index.html` mesuré, repère de 1,8 Mo |
| 3. Commerce et empereur | Carte de l'Empire, caravanes, quais, navires ; demandes, faveur, tribut, dette ; cinq cotes, victoire et défaite ; cinq dieux, fêtes ; événements ; 5 conseillers (commerce, impérial, cotes, religion, en chef) ; missions Ravenne, Narbo et Massalia | Les trois missions se gagnent en difficulté normale ; un test par formule de cote ; `index.html` mesuré, repère de 2,6 Mo |
| 4. Guerre et patriciens | Fortifications, caserne, académie, forts, 3 unités, commandement, combat ; 5 archétypes ennemis, invasions ; demandes de troupes ; destitution ; conseiller militaire ; niveaux 13 à 20 ; hippodrome, sénat, résidences ; pyramide des âges ; épidémies ; criminalité et émeutes ; niveaux de difficulté ; fortune du gouverneur ; missions Aquilée et Vindobona | Une invasion de 50 ennemis se joue aux cibles de performance ; un palais impérial (niveau 20) atteint en construction libre ; 10 000 habitants aux cibles de performance ; les deux missions se gagnent en difficulté normale ; `index.html` mesuré, repère de 3,4 Mo |
| 5. Campagne et finitions | Les 10 cartes restantes ; équilibrage ; dates cibles des étoiles ; musique synthétisée ; affiche et aperçus ; aide intégrée ; textes de la page du jeu dans les 5 langues | La campagne se termine par les deux branches ; aucune chaîne non traduite ; tous les contrôles du site au vert ; `index.html` mesuré, repère de 4 Mo |
| 6. Cités voisines | Mode à plusieurs de la section 16.7 : provinces de 2 à 4 joueurs, comptoir sur le serveur commun du site, cartes de deux provinces, cités de l'ordinateur aux places libres, province privée par code et par invitation d'un ami, carte de l'Empire et conseiller du commerce adaptés | Une province de 2 joueurs, sur deux appareils, à des vitesses différentes et avec un joueur absent 3 jours, atteint son objectif ; aucune charge ni aucun denier créé ou perdu sur 10 000 échanges simulés avec coupures, messages en double et rechargements ; déterminisme et sauvegarde tenus avec les commandes du comptoir ; coût sur le serveur mesuré pour 100 joueurs actifs par jour, dans le plan gratuit ; dérogation codée côté site ; contrôles du site au vert ; `index.html` mesuré, repère de 4,3 Mo |

### 21.1 Règles de conduite

- Chaque lot livre une version jouable, ses tests au vert, le poids de `index.html` et la liste des écarts avec ce cahier.
- Une consigne par lot pour l'IA de développement : elle cite les sections concernées, fixe le besoin et les critères, laisse les choix techniques ouverts.
- À l'intérieur d'un lot, l'IA de développement avance par étapes vérifiables et enregistre chaque étape.
- Après chaque lot, une séance de jeu réelle ; l'équilibrage ne touche que les fichiers de données.
- Toute règle modifiée en cours de route est reportée dans ce cahier.

### 21.2 Durée

Je n'ai aucune base fiable pour chiffrer la durée des lots avec un développement par IA. Mesurer le temps réel du lot 1, puis extrapoler : les lots 1 et 4 sont les plus gros.

## 22. Risques et décisions à valider

Les dix décisions de cadrage sont prises, avec trois dérogations aux consignes du site (une quatrième viendra au lot 6). Restent ouverts : les images embarquées, la date de publication et quatre points du mode « Cités voisines », à trancher au début du lot 6.

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
| 10 | Multijoueur | Mode « Cités voisines » (section 16.7), au lot 6, après le lot 5 (décision du 25 novembre 2026) |

Les dérogations aux consignes du site figurent en section 19.6.

### 22.2 Points ouverts

| Point | Options | Recommandation |
| --- | --- | --- |
| Images embarquées | Dessin par le code seul ; images pour une partie des bâtiments | Essai sur 10 bâtiments avant le lot 2 (section 18.4) |
| Publication | Attendre le lot 5 ; publier dès le lot 3 | La dérogation sur les niveaux rend possible une publication anticipée ; à décider à la fin du lot 3 |
| Objectif d'une province (lot 6) | Commun : la province gagne quand chaque cité active atteint ses seuils ; course : la première cité à ses seuils gagne ; les deux, au choix du créateur de la province | Commun, avec la part de chacun affichée (ventes aux voisins, population) : le commerce entre joueurs profite alors à tous |
| Rejoindre une province (lot 6) | Code et amis seulement ; aussi des provinces publiques au hasard | Code et amis seulement : une province dure des jours, et des inconnus l'abandonneraient |
| Signaux entre voisins (lot 6) | Aucun ; liste fixe de demandes (« Je cherche du vin », « J'ai du marbre à vendre ») | Liste fixe : seule façon de se coordonner sans texte libre |
| Durée de vie d'une province (lot 6) | 30 jours sans visite ; une durée fixe | 30 jours sans aucune visite |

Décisions du propriétaire du 26 novembre 2026 : publication après ses propres essais du lot 5 ; lot 6 : objectif commun, province rejointe par un code ou par la page Amis, à n'importe quel moment de la partie (un message prévient les voisins), liste fixe de signaux, effacement après 30 jours sans visite (section 16.7).

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
| Provinces abandonnées en cours de route (lot 6) | Élevé | Cité de l'ordinateur à la place d'un voisin absent ; objectif atteignable par les cités restées actives |
| Mode « Cités voisines » dépendant du serveur commun et de son quota | Moyen | Routes vers les voisins fermées hors connexion ou quota atteint, partie solo intacte ; écritures groupées |
| Triche sur le comptoir (lot 6) | Faible, provinces privées | Plafond de 40 charges, aucune récompense du profil liée au commerce entre joueurs |

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

### 23.4 Lot 2 « Économie » (24 novembre 2026)

Livré :

- Production : fermes à légumes, fruits, porcs, olives et raisin (les deux dernières dans l'industrie), quai de pêche (sur la rive ; son bateau gagne par l'eau le banc de poissons le plus proche, y pêche 20 jours et rapporte une charge), carrière d'argile (près de l'eau), camp de bûcherons (près des arbres), mine de fer et carrière de marbre (près des rochers), ateliers de poterie, de mobilier, pressoir, cave et atelier d'armes (1 charge de matière donne 1 charge de bien, 4 par an, 2 charges de matière en attente au plus). Bancs de poissons dans les données de la carte (`poissons`, 3 par carte).
- Stockage : entrepôt de 8 emplacements de 4 charges (un bien par emplacement), consignes par produit des greniers et des entrepôts (accepter, refuser, aller chercher, vider), plafond par bien en quarts de l'entrepôt, charretier qui approvisionne les ateliers, vide ou va chercher. Le livreur sert d'abord un atelier demandeur, puis un grenier, puis un entrepôt ; une charge sans preneur revient à son point de départ.
- Marchés : biens réclamés par les maisons desservies (poterie, mobilier, huile au lot 2), produit interdit depuis le panneau, acheteuse qui vise le produit qui manque le plus.
- Maisons : niveaux 7 à 12, agrandissement en 2 × 2 au niveau 10 (maisons voisines du même niveau, zones vides, jardins), division à la descente, biens en réserve (4 mois, 1 unité par case et par mois).
- Attractivité : grille de −100 à +100, émise par chaque bâtiment (« +4 sur 3 » : 4, 2, 1), exigée par les maisons (seuils du tableau 5.2) ; places pavées (sur une route), jardins, trois statues.
- Services : école, bibliothèque, académie, barbier, bains (dans le rayon d'un réservoir plein), médecin, hôpital ; amphithéâtre (acteurs et gladiateurs : 10 points par type, 20 au plus), colisée (gladiateurs et lions : 12, 25 avec les deux), école de gladiateurs, maison des lions ; temples de Neptune, Mercure, Mars et Vénus, grands temples des cinq dieux et oracle (2 charges de marbre prises à l'entrepôt à la pose), sans humeur ni effets des dieux.
- Santé de la ville (section 9.4) chaque mois, épidémies.
- Priorités de main-d'œuvre par catégorie (1 à 9).
- Interface : panneaux des nouveaux bâtiments (production, matière en attente, bateau, emplacements, consignes et plafonds touchés pour passer au réglage suivant, produits interdits au marché, artistes en scène, canalisations), maison (attractivité, biens en réserve, place pour s'agrandir), conseillers en 7 onglets (Cité, Travail avec priorités et salaire, Finances, Population avec la courbe des 24 derniers mois et les habitants par niveau, Santé, Éducation, Spectacles), calques nourriture, divertissement, éducation, santé, religion, impôts, attractivité (couleur de chaque case), problèmes, entrepôts dans le calque « Stocks ».
- Construction libre (écran depuis la sélection des missions) : carte d'une mission ouverte, fonds de 10 000, 30 000 ou 100 000 deniers, incendies et effondrements au choix, tous les bâtiments, aucun objectif.
- Dessins : environ 45 bâtiments, maisons 7 à 12, 13 marcheurs (dont le bateau et le lion), places pavées, icônes d'arrêt « pas de matière », « aucun banc de poissons », « hors du rayon d'un réservoir ».
- Textes : 226 clés de plus dans les 5 langues.
- Ville d'exemple du lot 2 (`exemples.js`, niveau 4) : cité de Pompéi en construction libre, quartier de prestige fermé par des barrières, entouré de places, de jardins, de statues, de temples, des bains, de la bibliothèque et des spectacles ; elle remplace la troisième ville embarquée (affiche, troisième aperçu, fond de l'écran titre).
- Mode test (`?debug=1`) : `MM_DEBUG.ville(n)` ouvre une ville d'exemple comme une vraie partie.
- Fiche du jeu réécrite dans les 5 langues (présentation, descriptions, texte de la jaquette : l'affiche montre maintenant les temples de Cérès et de Vénus de la cité du lot 2) ; `version` 3.

Mesures (sous Node, PC de développement) :

| Critère (section 21) | Résultat |
| --- | --- |
| Insula de prestige (niveau 12) en construction libre | Atteinte au mois 25 par le joueur automatique (`tester-marmoria.mjs`, section « insula de prestige »), sur Pompéi, sans incendie. |
| Un scénario de test par chaîne | Argile → poterie, bois → mobilier, olives → huile, raisin → vin, fer → armes, marbre (et grand temple), légumes, fruits, porc, poisson : chacun livre son produit en 12 à 14 mois ; rendements exacts au jour près (8 et 4 charges par an). Tests aussi des consignes, du plafond, de l'interdiction au marché, de l'agrandissement, de la division, de l'attractivité, des priorités et de la santé. |
| Déterminisme et sauvegarde | Tenus, aussi pour une ville du lot 2 ; une sauvegarde du lot 1 (version 1) se charge et continue. |
| Cibles 19.3 sur 160 × 160 remplie | 0,93 ms par tick en moyenne (lot 1 : 0,74 ms ; cible 4 ms), 18 ms au pire sur des ticks quelconques (ramasse-miettes). Le calcul quotidien de l'attractivité de toute la carte prend 0,5 ms. |
| Poids de `index.html` | 1 078 Ko (lot 1 : 758 Ko), dont 3 villes d'exemple et les textes des 5 langues (repère du lot 2 : 1,8 Mo). |
| Contrôles du site | `validate-games --jouer` (téléphone 844 × 390, ordinateur : 100 % de la largeur, affiche, 3 images du jeu), `tester-sauvegarde`, `tester-stockage`, `check-i18n` (5 langues, 637 clés), `controle-taxonomie`, `regles-seo`, `verifier-seo` : tout est bon. Interface essayée dans Chromium, sur ordinateur (1 280 × 720) et sur téléphone en paysage au toucher (844 × 390) : panneaux, conseillers, calques, construction libre, sans erreur dans la console. |

Écarts avec ce cahier (à valider ; les valeurs sont dans `donnees.json`) :

1. Attractivité des maisons (5.3) : le cahier ne donne que les deux bouts (« −2 sur 2 » pour la tente, « +6 sur 4 » pour le palais). Retenu : tente −1 sur 1, cabane et masure 0, casa +1 sur 1, insula +2 sur 2, villa +4 sur 3, palais +6 sur 4. À −2 sur 2, une tente au milieu d'un pâté de tentes recevait −16 et ne passait jamais le niveau 2 (seuil −10) ; à −1 sur 1, un pâté monte du bord vers le centre.
2. Attractivité recalculée sur toute la carte chaque jour et après chaque construction, plutôt que dans la seule zone touchée : 0,5 ms sur la plus grande carte. Elle est gardée dans la sauvegarde. Un bâtiment ne compte pas pour lui-même ; une maison de plusieurs cases prend la moyenne de ses cases.
3. Attractivité sans effet dans les deux missions tutorielles (Ostie, Pompéi), validées au lot 1 sans elle ; elle s'applique en construction libre et dans les missions suivantes. Le panneau de la maison l'affiche avec la mention « sans effet dans cette mission ».
4. Niveaux des maisons arrêtés à 12 au lot 2 (`maison.niveauMax`) : les patriciens (13 à 20) viennent au lot 3.
5. Agrandissement : carrés essayés dans un ordre fixe (la maison en haut à gauche, puis à droite, en bas…). Faute de place, la maison attend (le panneau dit « De la place pour s'agrandir »). À la descente sous le niveau 10, l'insula redevient quatre maisons d'une case de niveau 9, habitants et réserves partagés.
6. Grands temples et oracle : les 2 charges de marbre sont prises à l'entrepôt au moment de la pose (rendues à l'annulation) ; il n'y a pas encore de chantier livré par les charretiers.
7. Oracle : sans marcheur, il ne donne pas d'accès aux dieux aux maisons ; sa couverture servira à la satisfaction des dieux (lot 3).
8. Acheteuse du marché (7.4) : elle choisit d'abord le produit qui manque le plus au marché (rapporté à son seuil : 400 unités par aliment, 200 par bien ; à égalité, celui acheté il y a le plus longtemps), puis va au dépôt le plus proche qui en a. En allant simplement au dépôt le plus proche, elle rapportait toujours du blé et jamais la poterie de l'entrepôt.
9. Vendeuse : elle part même quand le marché est vide, pour relever les biens que les maisons réclament (mémoire de 48 jours).
10. Une maison achète les biens de son niveau et du suivant (sans quoi elle ne pourrait jamais monter) et consomme chaque mois 1 unité par case de chaque bien qu'elle a.
11. Nourriture et entrepôts : une ferme livre d'abord un grenier, un entrepôt seulement si aucun grenier ne l'accepte.
12. Production : la progression du jour est arrondie au-dessus et le reste reporté, pour tomber juste à 8 charges par an (extraction, blé) et 4 (atelier) ; la ferme à blé du lot 1 produit donc 8 charges au lieu de 7,7.
13. Pêche : le cahier ne chiffre pas le voyage. Retenu : 20 jours de pêche au banc, 80 cases de portée ; un quai proche d'un banc rapporte 7 à 8 charges par an.
14. « Près de l'eau, des arbres, des rochers » : à 1 case ou moins de l'emprise. Quai : un côté entier de l'emprise donne sur l'eau.
15. Santé (9.4) : la variété alimentaire compte plein à 3 aliments. Épidémies seulement dans une partie avec risques où médecin ou hôpital peuvent être bâtis (sinon Pompéi en subirait sans pouvoir s'en protéger).
16. Corrigé au passage (lot 1) : une charge en route vers un grenier disparu ou plein était perdue, et la place réservée dans le grenier ne se libérait pas si le livreur disparaissait ; la charge revient maintenant à son point de départ et la réservation est toujours libérée.
17. Le calque criminalité attend la criminalité (lot 3).

Constats de jeu (joueur automatique, à confirmer par une séance réelle) :

- Le marché est souvent le goulot : son acheteuse rapporte une charge (100 unités) par trajet, alors que 1 000 habitants mangent 500 unités par mois. Un marché a besoin d'un grenier à quelques cases ; c'est la règle du cahier (7.4), à expliquer dans l'aide.
- Les errants allant au hasard (4.2), les maisons de niveau 9 à 12 perdent par moments un service et redescendent, sauf si leurs services sont regroupés et retenus par des barrières (4.4) : c'est ce que fait la ville d'exemple. Le niveau 12 est atteint, puis tenu par intermittence.

Publication : toujours pas avant la décision de la section 22.2 (fin du lot 3).

### 23.5 Retours du propriétaire : aqueducs et réservoirs (24 novembre 2026)

Signalé : « problèmes visuels avec les aqueducs et les réservoirs ». Défauts trouvés et corrigés (`version` 4) :

1. L'aqueduc ne connaissait que deux directions : coudes, embranchements en T et croix restaient disjoints. Il se dessine maintenant comme les routes, d'après ses voisins reliés (aqueduc ou réservoir) dans les 4 directions de l'affichage : une pile au centre de chaque case, un bras vers chaque voisin, une arche à cheval sur la limite des cases.
2. Le canal était peint au niveau du sol, au pied des piles, et le dessus restait vide (des murs creux avec une bande bleue en bas). Le canal court maintenant au sommet, d'un seul tenant, rebord de pierre et eau.
3. Tous les aqueducs montraient de l'eau dès qu'un réservoir de la ville était plein, même ceux qui n'étaient reliés à rien. Seuls ceux reliés, de proche en proche, à un réservoir plein sont en eau (`MM_SIM.aqueducsEnEau`, lecture seule) ; les autres montrent un canal sec.
4. Le réservoir paraissait enfoncé dans le sol : son dallage était peint après ses murs et les recouvrait. C'est désormais un bassin de pierre à pilastres, à la hauteur du canal de l'aqueduc (qui s'y déverse au niveau du rebord), eau sous le rebord, fond de terre sèche quand il est vide.
5. Au-dessus d'une route, l'aqueduc droit passe sur une seule grande arche, et la rue reste visible dessous.
6. Le calque « Eau » montre maintenant les canalisations (section 17.3) : l'aqueduc à plat, bleu en eau, gris à sec.

Vérifié dans Chromium : coudes, T, croix, croisement de route, réservoir vide et aqueduc sec, dans les 4 rotations, aux zooms 0,5 et 2, icônes du menu « Eau », calque « Eau » ; aucune erreur dans la console. Contrôles du site et tests de la simulation verts ; images du jeu refaites.

### 23.6 Lot 3 « Commerce et empereur » (24 novembre 2026)

Livré :

- Carte de l'Empire, dans l'onglet « Commerce » du conseiller. La Méditerranée est dessinée par le code. On y voit Rome, la ville et 5 à 7 cités partenaires par mission, dont une cachée qu'un événement fait apparaître. Les routes terrestres sont en trait plein, les maritimes en pointillés, et l'or marque une route où passe un convoi. La fiche d'une cité donne le type de route, les biens qu'elle vend et achète (prix, échanges de l'année et quota) et le coût d'ouverture. Sous la carte, les cités sont aussi en gros boutons de 44 px.
- Commerce : quatre statuts par bien.
  - Aucun.
  - Acheter, jusqu'à n charges.
  - Vendre, en gardant n charges.
  - Réserver : le bien n'est plus consommé, transformé ni vendu.

  Chaque bien a un réglage de 0 à 32 charges (4 au départ).

  Caravanes : une tous les 2 mois par route terrestre ouverte. Elle arrive par la route de Rome, échange 8 charges au plus dans les 3 entrepôts les plus proches de l'entrée, puis repart.

  Navires : un tous les 2 mois par route maritime. Le navire attend au point de mer de la carte, puis accoste à un quai de commerce libre (nouveau bâtiment de 3 × 3 cases, sur la rive, 12 employés). Ses 3 dockers font la navette avec les entrepôts. Le navire repart après 12 charges, après 40 jours, ou après 3 jours sans rien à échanger.

  Les quotas par cité et par bien (paliers 15, 25 et 40) repartent à zéro en janvier. Chaque charge est payée ou encaissée sur-le-champ (postes « Ventes » et « Achats »).
- Empereur et gouverneur (sections 11.4 à 11.6 et 14.5) :
  - faveur : départ à 50, érosion de −2 en janvier, −5 si le trésor est négatif en fin d'année, −5 pour un secours ;
  - demandes : biens ou deniers, rappels à 6 mois et à 1 mois de l'échéance, puis 12 mois de retard avant d'être tenues pour ignorées (−8) ;
  - expédition depuis le conseiller impérial ;
  - présents : 10, 25 ou 50 % de la fortune du gouverneur, pour +2, +5 ou +10, moitié moins dans les 12 mois qui suivent un présent ;
  - salaire du gouverneur : 10 deniers par rang au plus, réglable ;
  - fortune gardée d'une mission à l'autre, même après une défaite ; elle peut renflouer le trésor ;
  - tribut de janvier, intérêts de 10 % sur la dette, destitution.
- Cotes (section 14) :
  - culture : calculée chaque mois, au prorata de la couverture ;
  - prospérité : calculée en janvier, plafonnée par la qualité de l'habitat ;
  - paix : +5 par année sans incident ;
  - faveur et population ;
  - victoire dès que les cinq seuils sont atteints ensemble ; défaites : ville anéantie, destitution.
- Dieux (section 9.1) :
  - satisfaction de 0 à 100, qui se rapproche d'un point par mois de la part de la population couverte par leurs lieux de culte ;
  - jalousie (−20) ;
  - avertissement sous 20, colère sous 10 (la satisfaction remonte alors à 30), bienfait au-dessus de 90 (24 mois au moins entre deux bienfaits) ;
  - les dix effets du tableau ;
  - fêtes petite, grande et grandiose (la grandiose prend 2 charges de vin), préparées pendant 2 mois ;
  - option « Bienfaits et colères des dieux » en construction libre.
- Événements (section 15.2) : salaire de Rome, prix d'un bien, quota d'une cité, route fermée puis rouverte, nouvelle cité, mauvaise récolte, site d'extraction perdu, tremblement de terre (bande de cases fixée par la mission) et demandes de l'empereur. Chaque mission les déclare dans ses données (11 à 13 événements), à date fixe ou dans une fenêtre tirée avec la graine. Chacun laisse un message dans le journal.
- Conseillers : 11 onglets.
  - « En chef » : une ligne par domaine, en vert, en orange ou en rouge.
  - « Cotes » : valeur, seuil, facteur le plus limitant en une phrase, points de culture par composante, plafond de la prospérité.
  - « Empereur », « Commerce » et « Dieux ».
  - « Finances » : les 12 postes, pour l'année en cours et l'année passée.

  L'onglet de l'empereur n'apparaît qu'avec l'empereur, celui du commerce qu'avec des cités partenaires. Sur un écran bas (téléphone en paysage), les onglets tiennent sur une ligne qui défile.
- Missions :
  - Ravenne : 120 × 120, 5 cités par la terre, industrie et premières demandes ;
  - Narbo : commerce maritime, 6 cités ;
  - Massalia : pêche et exportation, 7 cités.

  Chacune a sa présentation, ses cités, ses demandes, ses événements et les seuils de la section 16.2. Ostie et Pompéi restent sans empereur ni cotes.
- Dessins : quai de commerce (dallage sur l'eau, entrepôt, grue), navire marchand, caravane (mules bâtées), docker. Les marcheurs du commerce apparaissent dans le calque « Stocks ».
- Sauvegarde en version 3 ; une sauvegarde des lots 1 et 2 est complétée au chargement.
- Gouverneur automatique des missions (`exemples.js`). Il pose des quartiers de 4 × 2 pâtés fermés par des barrières, un bloc de logistique, et des lots d'industrie près de leur source. Il construit par étapes, dans l'ordre du jeu, puis gère le commerce, les demandes, les fêtes, les présents, l'impôt et les salaires. Les réglages de chaque mission sont dans `PLANS_MISSIONS`.
- Mode test (`?debug=1` dans l'adresse du lanceur) : toutes les missions jouables sont ouvertes, sans gagner les précédentes (`version` 6) ; `MM_DEBUG.importer(texte)` ouvre une sauvegarde exportée, `MM_DEBUG.info(id)` le panneau d'un bâtiment.
- Textes : 228 clés de plus dans les 5 langues (865 en tout). La fiche du jeu annonce maintenant 5 missions, le commerce, les dieux et l'empereur. `version` 5.

Mesures (sous Node, PC de développement) :

| Critère (section 21) | Résultat |
| --- | --- |
| Les trois missions gagnées en difficulté normale | **Ravenne** : gagnée par le gouverneur automatique au mois 84, sur 126 pour l'étoile de la date. 2 étoiles : un secours de l'empereur reçu. 2 030 habitants, culture 49, prospérité 15, paix 35, faveur 47. **Narbo** : gagnée au mois 118, sur 177. 2 étoiles : un secours reçu. 2 492 habitants, culture 79, prospérité 25, paix 50, faveur 54. **Massalia : non gagnée** : au mois 360, 1 404 habitants pour 3 500 (au plus 1 946, au mois 273) et prospérité 14 pour 35 (au plus 22). Culture (90), paix (100) et faveur (56) sont atteintes. Voir « Massalia » ci-dessous. |
| Un test par formule de cote | `tester-marmoria.mjs`, section « les cinq cotes ». Population (sans-abri exclus). Culture : points au prorata de la capacité, personnel exigé. Prospérité : bénéfice, chômage, salaire, habitat, alimentation et plafond de l'habitat. Paix : +5 par an, rien l'année d'un incident. Faveur : érosion, trésor négatif, secours, demande dans le délai, en retard, ignorée, présents et leur moitié dans les 12 mois. Plus des tests du tribut, des intérêts, de la destitution, du commerce (caravane, navire, quotas, réservation), des dieux, des fêtes et de chaque événement. |
| Déterminisme et sauvegarde | Tenus, aussi pour une partie de mission avec commerce, demandes et dieux ; les sauvegardes des versions 1 et 2 se chargent. |
| Cibles de la section 19.3, carte 160 × 160 remplie | 0,86 ms par tick en moyenne (lot 2 : 0,93 ms ; cible 4 ms), 18,7 ms au pire. |
| Poids de `index.html` | 1 287 Ko (lot 2 : 1 078 Ko), repère du lot 3 : 2,6 Mo. |
| Contrôles du site | `validate-games --jouer` (téléphone 844 × 390, ordinateur : 100 % de la largeur occupée, affiche, 3 images du jeu), `tester-sauvegarde`, `check-i18n` (5 langues, 865 clés, avec navigateur), `controle-taxonomie`, `regles-seo`, `verifier-seo` : tout est bon. Dans ce conteneur, `check-i18n` signale une erreur du lanceur dans ses essais du site (« Service worker is disabled… »), identique avec un autre jeu : elle vient du Chromium installé ici, pas de Marmoria. Interface essayée dans Chromium avec des parties des trois missions : en français sur ordinateur (1 280 × 720), en allemand sur téléphone en paysage (844 × 390). Les 11 onglets, la carte, la fiche d'une cité, les réglages des biens, le quai de commerce, un entrepôt et le journal s'affichent sans erreur dans la console et sans texte non traduit. |

Écarts avec ce cahier (à valider ; les valeurs sont dans `donnees.json`) :

1. Tribut (11.5) : le « bénéfice hors constructions » est calculé sans le secours de l'empereur ni les dons du gouverneur. Sinon, Rome reprenait chaque janvier 25 % de son propre secours. Calcul : impôts et ventes, moins les dépenses autres que les constructions. Le plancher reste population / 20.
2. Destitution (2.4) : sans les légions, qui arrivent au lot 4. Après 12 mois de suite à une faveur de 10 ou moins, la mission est perdue. Le conseiller impérial affiche le compte à rebours et un message le rappelle chaque mois.
3. Demandes (15.1) : une demande de nourriture compte aussi les greniers, puisqu'une ferme livre d'abord le grenier (écart 11 du lot 2). Une demande en retard reste ouverte 12 mois (`retardMois`) avant d'être tenue pour ignorée. Une demande de deniers est payée par le trésor (poste « Envois à l'empereur »). Les demandes de troupes attendent le lot 4.
4. Mars : son bienfait (la prochaine invasion perd la moitié de ses troupes) et sa colère (moral des légions) sont gardés dans l'état de la partie. Ils restent sans effet jusqu'à l'armée du lot 4.
5. Paix : seul le « +5 par année sans incident » joue. Émeutes et invasions viennent au lot 4.
6. Prospérité : le « +2 » de l'habitat (30 % des habitants en villa ou palais) et le « +1 » de l'hippodrome sont impossibles avant le lot 4 (niveaux 13 à 20, hippodrome). La prospérité gagne donc au mieux +8 par an.
7. Caravanes (12.3) : les « 3 entrepôts les plus proches sur son trajet » sont les 3 entrepôts en service les plus proches de l'entrée, en distance par la route. La caravane passe les barrières, comme un marcheur à destination : sans cela, elle ne voyait pas un entrepôt situé au-delà de l'entrée d'un quartier fermé.
8. Navires (12.4) : le cahier ne dit pas quand un navire repart sans avoir échangé. Retenu : après 3 jours sans charge possible. Il attend au large au point de mer fixé par la carte (`mer`). La règle du pont bas est sans objet tant que le jeu n'a pas de ponts.
9. Statuts (12.2) : réglage de 0 à 32 charges, 4 au départ. Un bien réservé n'est plus pris par les marchés, les maisons ni les ateliers.
10. Fêtes (9.1) : la grandiose prend 2 charges de vin à l'entrepôt ; sans elles, elle est refusée.
11. Bienfait de Mercure : un grenier et un entrepôt sont remplis avec les biens qu'ils acceptent ; colère : le grenier et l'entrepôt les plus pleins sont vidés.
12. Conseiller en chef : le cahier n'en fixe pas le contenu. Retenu : 9 lignes (population, emploi, nourriture, santé, dieux, finances, empereur, commerce, objectifs), chacune en vert, orange ou rouge.
13. Erratum de la section 23.4, écart 4 : les niveaux 13 à 20 arrivent au lot 4 (« Guerre et patriciens »), pas au lot 3.

Massalia, le critère non atteint :

- Le plafond de la prospérité est la valeur moyenne de la maison de chaque habitant (14.2). Un seuil de 35 exige donc que toute la ville, en moyenne, vive en casa (niveaux 7 et 8), le seuil du repère 11.2. Les villes du gouverneur automatique restent surtout faites de tentes, de cabanes et de masures. À Massalia, au mois 300, 1 918 habitants, dont 428 en casa et 138 en insula : plafond 17. À Ravenne et à Narbo, les seuils de 10 et 25 passent.
- Sans les niveaux 13 à 20 (lot 4), la prospérité gagne au mieux 8 points par an, et seulement pour une ville qui garde un bénéfice. Atteindre 35 prend donc au moins 5 années sans faute, avec des quartiers de casae bien desservis.
- Rien ne montre qu'un joueur ne peut pas la gagner : le gouverneur automatique ne sait pas faire monter de grands quartiers au-delà du niveau 6 (constat déjà fait au lot 2). Rien ne montre non plus qu'il le peut. Ma confiance qu'un joueur la gagne en l'état est faible.
- Trois voies, au choix du propriétaire : jouer Massalia et juger (recommandé, aucun réglage à changer) ; baisser la prospérité de Massalia à 25 et sa population à 3 000 (`donnees.json`, objectifs de la mission) ; ou faire écrire au gouverneur automatique des quartiers de casae, ce qui prend du temps sans rien prouver pour un joueur. Le test laisse Massalia en mesure seule, sans bloquer.

Constats de jeu (gouverneur automatique, à confirmer par une séance réelle) :

- Les deux missions gagnées reçoivent chacune le secours de l'empereur au moins une fois : les premières années coûtent plus qu'elles ne rapportent. La deuxième étoile demande un départ plus prudent.
- Le commerce porte le budget : à Narbo, les ventes rapportent de 3 500 à 4 900 deniers par an, contre 1 000 à 2 200 pour l'impôt, avec deux routes ouvertes (Tolosa par la terre, Tarraco par la mer).
- Dans la partie de Narbo observée, les dieux sans temple restent vers 28 (la jalousie les tire vers le bas) : ils lancent des avertissements sans tomber en colère tant que le gouverneur organise des fêtes.

Publication (section 22.2) : c'est la fin du lot 3, la décision revient au propriétaire. Le jeu se joue de bout en bout sur 5 missions sans guerre. Il reste une mission non éprouvée (Massalia) et aucune séance de jeu réelle du lot 3.

### 23.7 Retours du propriétaire : bâtiments sans route (25 novembre 2026)

Signalé : « Les puits, les fontaines et les réservoirs ne sont pas censés être sensibles aux dommages. Contrôler l'ensemble de ces points, surtout les bâtiments qui n'ont pas besoin d'accès à la route. »

Constat, bâtiment par bâtiment : douze types se posent sans route (`sansRoute` dans `donnees.json`). Cinq ne prenaient aucun risque : route, barrière, aqueduc, jardin, place. Sept s'usaient pourtant de 0,3 par jour :
- le puits, la fontaine et le réservoir ;
- les trois statues ;
- l'oracle, qui pouvait en plus brûler.

Un préfet ou un ingénieur sert les bâtiments à 2 cases ou moins de sa route. Posé plus loin, un de ces bâtiments finissait donc par s'effondrer sans que le joueur puisse rien y faire.

Corrigé (`version` 7) :

1. Règle (sections 10.1 et 10.2) : un bâtiment qui se passe de route ne brûle pas et ne s'abîme pas. Les 7 types ci-dessus passent à 0 pour le feu et les dommages.
2. Garde-fou : la validation des données refuse désormais un bâtiment sans route qui aurait un risque de feu ou de dommages. Un oubli dans une future mission ne passera pas.
3. Anciennes sauvegardes : le compteur d'un bâtiment qui n'est exposé à aucun risque revient à zéro chaque jour. Un puits déjà abîmé ne s'effondre donc plus.
4. Interface : le panneau d'un bâtiment n'affiche que les risques qu'il court. Un puits n'affiche ni feu ni dommages ; une maison affiche maintenant ses dommages en plus du feu, sauf les tentes, qui ne s'usent pas. Les calques « Feu » et « Dommages » ne colorent que les bâtiments exposés.
5. Tests (`tester-marmoria.mjs`) :
   - aucun bâtiment sans route n'a de risque dans les données ;
   - des données fautives sont refusées ;
   - un puits, une fontaine, un réservoir, une statue et un oracle posés loin de toute route, et marqués très abîmés, restent debout deux ans, et leurs compteurs reviennent à zéro ;
   - une préfecture s'use toujours de 0,3 par jour.

Contrôlé au passage, sans changement nécessaire :
- les bâtiments qui exigent une route s'usent tous de 0,3 par jour ; les ateliers, greniers et entrepôts brûlent à 0,6 ;
- les tentes ne s'usent pas et brûlent à 1, comme les cabanes ;
- une maison peut être à 2 cases d'une route, et un préfet ou un ingénieur sert justement jusqu'à 2 cases de sa route ; les grands bâtiments sont servis dès qu'une de leurs cases est à portée ;
- un bâtiment qui exige une route et qui l'a perdue reste exposé aux risques : son panneau le signale (« pas de route »), et une route reconstruite permet de le servir de nouveau.

Effet sur le gouverneur automatique (simulation déterministe, mais une ville sans effondrement de puits suit une autre histoire) :
- Ravenne est gagnée au mois 96 (84 avant), toujours avec 2 étoiles ;
- Narbo est gagnée au mois 178 (118 avant), avec 1 étoile : la date cible est de 177 ;
- Massalia n'est toujours pas gagnée.

La règle rend le jeu plus facile : ce retard vient du chemin pris par le gouverneur automatique, que le moindre changement modifie. Le critère du lot 3 reste tenu, puisque Ravenne et Narbo sont toujours gagnées.

### 23.8 Retours du propriétaire : relogement, fontaines, stocks du marché, personnages (25 novembre 2026)

Quatre demandes, `version` 8.

**1. Relogement des habitants qui doivent partir.** « Ceux qui partent parce que leur maison redescend doivent, s'il y a de la place dans une maison proche, y revenir en quelques secondes. »

- Avant : chaque groupe allait dans la première maison libre de la liste, dans l'ordre de construction, souvent à l'autre bout de la ville. Les places retenues par des immigrants en route ne comptaient pas comme libres, et faute de place les habitants quittaient la ville.
- Maintenant : chaque groupe marche vers la maison la plus proche à pied qui a de la place, et le groupe se répartit si une seule maison ne suffit pas. Une place retenue par des immigrants encore en route compte comme libre : les habitants passent avant eux, et l'immigrant qui trouve la maison pleine cherche ailleurs. Ils ne quittent la ville que si aucune maison n'a de place.
- Valable pour tous les départs forcés : maison qui redescend, se divise, brûle, s'effondre ou perd sa route.
- Test : une maison redescend avec 2 habitants de trop ; une maison à 3 cases a 6 places, toutes retenues par des immigrants ; une autre, plus loin, est vide. Les 2 habitants entrent dans la maison proche en moins de 10 secondes de jeu à vitesse ×1, la maison lointaine reste vide, et personne n'est perdu.
- Effet sur le gouverneur automatique, sur 5 parties décalées par mission (victoires en 200 mois ou moins) :

| Version | Ravenne | Narbo |
| --- | --- | --- |
| Avant (`version` 7) | 1 sur 5 | 4 sur 5 |
| Maison la plus proche, places des immigrants exclues | 1 sur 5 | 2 sur 5 |
| Retenue : maison la plus proche, places des immigrants comprises | 4 sur 5 | 4 sur 5 |

La variante qui excluait les places des immigrants laissait partir plus d'habitants que l'ancienne règle ; elle est écartée. Dans la partie de référence du test, Ravenne est gagnée au mois 109 et Narbo au mois 226 : un seul échantillon, qui ne mesure pas la difficulté.

**2. Fontaines sans route.** « Les fontaines ne doivent pas avoir besoin d'une route pour que des employés y travaillent. »

- Avant : une fontaine ne recevait du personnel que si une route reliée aux maisons passait à 2 cases ou moins.
- Maintenant : tout bâtiment qui se passe de route reçoit ses employés sans condition de route. Parmi eux, seule la fontaine emploie du personnel.
- Test : une fontaine posée à plus de 3 cases de toute route reçoit ses 4 employés.

**3. Stocks du marché en images.** « Il y a écrit blé, légumes : il faudrait des images. »

- 16 images de biens dessinées par le code (`imageBien` de `dessins.js`), reconnaissables à la forme autant qu'à la couleur : gerbe de blé, chou et carottes, pomme et poire, jambon, poisson, rameau d'olivier, grappe, motte d'argile, rondins, lingots, bloc de marbre, vase, siège, amphore d'huile, amphore et coupe de vin, bouclier et glaive.
- Marché : les étals deviennent des vignettes. Chacune montre l'image, la quantité et une jauge jusqu'au seuil d'achat, avec un liseré doré et l'étiquette « Réclamé » quand les maisons le demandent, et le bouton « Interdire ». Clé `info.reclame` dans les 5 langues.
- Greniers, entrepôts et commerce : l'image précède le nom de chaque bien.

**4. Personnages reconnaissables.** « Tête ronde et objet : on ne les reconnaît pas. »

- Tous les marcheurs sont redessinés. Ils ont des jambes en marche et des sandales, une tunique ou une robe ombrée et ceinturée, deux bras, une tête de trois quarts (cheveux, œil, nez, parfois une barbe), et surtout une coiffe et un objet propres à chaque métier (`ALLURES` et `personnage` de `dessins.js`) :

| Marcheur | Ce qui le distingue |
| --- | --- |
| Préfet | casque de bronze à cimier blanc, seau d'eau |
| Ingénieur | bonnet de cuir, maillet sur l'épaule |
| Prêtre | robe blanche à liseré d'or, tête voilée, coupe fumante |
| Vendeuse | robe orange, foulard, panier plein sur la tête |
| Acheteuse | robe verte, panier au bras |
| Percepteur | toge, bourse d'or, tablette |
| Acteur et comédien | masque tragique ou comique tenu près du visage |
| Instituteur | tablette de cire |
| Bibliothécaire | brassée de rouleaux |
| Professeur | robe blanche, barbe grise, grand bâton |
| Médecin | bâton au serpent, sacoche |
| Chirurgien | tunique blanche, trousse |
| Barbier | tablier, rasoir, serviette |
| Employé des bains | serviette sur l'épaule, flacon d'huile |
| Immigrant | chapeau de voyage, cape, baluchon |
| Émigrant | capuche grise, baluchon |
| Sans-abri | haillons, pieds nus, ballot |
| Lutteur | torse nu, bouclier rond |
| Gladiateur | casque à grille, bouclier rouge, glaive |
| Dompteur | bonnet rouge, fouet |
| Livreur, charretier, docker | charrette à bras, bonnet |
| Muletier de la caravane | chapeau de voyage |

- Les personnages passent de 22 × 30 à 26 × 36 pixels, pour que la coiffe et les outils levés tiennent.
- Images du jeu refaites. Contrôlé sur une planche de tous les marcheurs, aux zooms 1 et 2,5 et dans les deux sens de marche, puis sur la carte d'une partie de Narbo aux zooms 1 et 2,2.


### 23.9 Lot 4 « Guerre et patriciens » (25 novembre 2026)

Le lot démarre sans que Massalia soit gagnée par le gouverneur automatique (critère du lot 3, section 23.6) : le propriétaire a demandé de poursuivre.

Livré :

- **Patriciens** (5.2, 11.2). Niveaux 13 à 20 : villas (13 à 16) et palais (17 à 20) dessinés. Au passage de 12 à 13, la maison perd ses habitants en trop, qui repartent chercher un logement. Agrandissement à 3 × 3 au niveau 15 et à 4 × 4 au niveau 19, sur des maisons vides ou des jardins ; l'ancienne emprise reste dans le nouveau carré. Les patriciens ne travaillent pas ; impôt à 12 pour les villas, 30 pour les palais.
- **Sénat** (5 × 5, un par ville, deux percepteurs à la fois, cotes dans son panneau), **résidence du gouverneur** en trois tailles (une seule par ville, toutes tailles confondues), **hippodrome** et **fabrique de chars** (un hippodrome par ville, 30 points de divertissement, aurige errant).
- **Pyramide des âges** (6.3). Dix tranches de dix ans pour toute la ville. Les immigrants arrivent avec un profil fixe. Chaque mois, chaque tranche vieillit d'un cent-vingtième ; la mortalité suit la santé, la natalité la santé et la nourriture. Un enfant ne naît que dans une maison qui a de la place. Le conseiller de la population montre la pyramide et la part d'âge actif.
- **Criminalité** (10.3). Compteur par maison, hausse mensuelle de (50 − humeur) / 5 sous 50, doublée pour tentes et cabanes. Un préfet retire 10 points à chaque passage. Voleurs (50 à 200 deniers volés au forum ou au sénat le plus proche, poste « Vols » du budget) et émeutiers (jusqu'à 3 incendies). Un préfet arrête tout criminel à 2 cases ou moins. Paix −5 par émeute, 20 au plus par an. Calque « Criminalité ».
- **Difficulté** (2.5) : facile, normale, difficile, choisie à la présentation des missions à partir de l'échelon 3 et gardée dans les options.
- **Armée** (13) :
  - muraille (tracée comme une route), tour collée à une muraille, porte fortifiée posée en travers d'une route (les habitants passent, l'ennemi doit l'abattre) ;
  - caserne (une recrue tous les 8 jours de travail plein ; un légionnaire prend une charge d'armes, livrée comme une matière d'atelier), académie militaire (+1 d'entraînement au passage de la recrue), 3 forts de 16 soldats (légionnaires, lanceurs de javelots, cavaliers), 6 au plus ;
  - commandement : toucher le fort ou un de ses soldats, puis « Envoyer » et un point de la carte ; formation en ligne, en colonne ou en carré ; « Rentrer au fort ». Les soldats engagent seuls tout ennemi à 4 cases ou moins ; au fort, ils défendent aussi le fort lui-même ;
  - combat : un coup toutes les 20 ticks, dégâts × (1 + 0,1 × entraînement), tour à 8 points toutes les 40 ticks et 6 cases de portée, points de structure ;
  - cinq archétypes ennemis, six factions et les légions de l'empereur ; l'ennemi suit un champ de distances vers sa cible et abat ce qui lui barre la route ; retraite à 70 % de pertes ;
  - invasions annoncées 12 et 3 mois avant, armée en marche sur la carte de l'Empire, paix (−1 par bâtiment détruit, 30 au plus ; +5 pour une invasion repoussée sans perte de bâtiment), entraînement +1 aux soldats qui ont combattu ;
  - Mars : son bienfait coupe de moitié la prochaine invasion, sa colère met le moral des cohortes à 0 pendant 6 mois ;
  - demandes de troupes (13.7) : une cohorte part de 6 à 12 mois, l'issue suit son effectif et son entraînement ;
  - destitution avec les légions (2.4) : après 12 mois de faveur à 10 ou moins, elles arrivent 3 mois plus tard ; si elles atteignent la ville, la mission est perdue ; repoussées, la faveur remonte à 20.
- **Conseiller militaire** (17.4) : menaces annoncées, cohortes (effectif, moral, entraînement, ordre, boutons), armes à la caserne, cohortes parties. Le conseiller impérial envoie une cohorte pour une demande de troupes.
- **Missions** Aquilée (échelon 4, Gaulois puis Germains, 5 invasions de 12 à 40, une demande de troupes) et Vindobona (échelon 5, Germains, 5 invasions de 12 à 50, deux demandes de troupes), chacune avec ses cités, ses demandes et ses événements.
- **Gouverneur automatique militaire** (`exemples.js`) : casernes, forts tournés vers les points d'invasion, préfet et ingénieur à côté de chaque bâtiment militaire, temple de Mars dès le premier quartier ; pendant une invasion, toutes les cohortes marchent sur l'ennemi le plus proche du centre (`piloterArmee`, appelé chaque jour) ; il envoie la cohorte la plus forte aux demandes de troupes.
- Dessins : villas, palais, sénat, résidences, hippodrome (piste, spina, quadriges), fabrique de chars, murailles reliées, tour, porte, caserne, académie, forts (palissade, tours d'angle, étendard à la couleur de l'arme), soldats et guerriers des six factions (cheval, éléphant, bélier), barres de vie, javelots et flèches.
- Sauvegarde en version 4 ; une sauvegarde des lots 1 à 3 est complétée. Le champ de distances des ennemis est sauvegardé pendant une invasion : une partie rechargée en plein combat continue à l'identique.
- Textes : 140 clés de plus dans les 5 langues (1 006 en tout) ; la fiche du jeu annonce sept missions et l'armée.

Mesures (sous Node, PC de développement) :

| Critère (section 21) | Résultat |
| --- | --- |
| Invasion de 50 ennemis aux cibles de performance | 50 Gaulois contre deux cohortes, sur toute l'invasion (1 644 ticks) : 0,30 ms par tick en moyenne, 6,0 ms au pire (cible 4 ms). 38 ennemis tués, 12 soldats morts, aucun bâtiment détruit ; les 12 survivants repartent. |
| Palais impérial (niveau 20) en construction libre | Atteint par les règles de montée, au jour 37 d'un quartier de 16 logements entouré de places, d'un anneau de 12 grandes statues, de la résidence-palais et du sénat (attractivité 93) ; agrandissements 2 × 2, 3 × 3 puis 4 × 4. Dans ce test, les services, les biens et l'eau sont fournis chaque jour par le test, pas par les marcheurs : la montée par les vrais marcheurs n'est pas démontrée. Voir l'écart 12. |
| 10 000 habitants aux cibles de performance | Carte de 160 × 160 couverte de tentes : 12 209 habitants, 4 298 bâtiments, 386 marcheurs, 0,96 ms par tick en moyenne, 23 ms au pire (cible 4 ms). La ville du lot 2 (33 794 habitants, 672 marcheurs) : 0,94 ms. |
| Les deux missions gagnées en difficulté normale | **Aquilée** : gagnée par le gouverneur automatique dans 2 départs sur 3 au rang 3 (mois 244 et 225 ; le troisième reste à 2 639 habitants, prospérité 0 et faveur 40) ; sur un échantillon de 8 parties (rangs 2 et 3, quatre décalages de ses tours), 5 victoires, du mois 207 au mois 261. Toujours 1 étoile : un secours de l'empereur reçu. Les 5 invasions sont repoussées dans toutes les parties. Le test exige 2 victoires sur 3 départs. **Vindobona : non gagnée** : au mois 240, 1 304 habitants pour 3 500 ; paix 100, faveur 57, culture 59, prospérité 10 ; les 5 invasions (jusqu'à 50 Germains) repoussées. Même limite que Massalia (23.6) : le gouverneur automatique ne dépasse pas 2 500 habitants environ ; ici, il manque de bras pour les services, qui ouvrent les quartiers suivants. Le test mesure Vindobona sans bloquer. |
| Poids de `index.html` | 1 473 Ko (lot 3 : 1 287 Ko), repère du lot 4 : 3,4 Mo. |
| Contrôles du site | `validate-games --jouer`, `tester-sauvegarde`, `check-i18n` (5 langues, 1 006 clés), `controle-taxonomie`, `regles-seo`, `verifier-seo` : tout est bon. Interface parcourue dans Chromium (français sur ordinateur, allemand sur téléphone en paysage) : combat, panneau du fort, ordre donné au doigt, conseiller militaire, carte de l'Empire avec une armée annoncée, calque de criminalité, scène de tous les nouveaux bâtiments ; aucune erreur dans la console ni texte non traduit. |

Écarts avec ce cahier (à valider ; les valeurs sont dans `donnees.json`) :

1. Hippodrome (9.2) : 9 × 9 cases au lieu de 15 × 5. Le moteur ne pose que des emprises carrées ; 81 cases, contre 75. La piste est dessinée en ovale allongé.
2. Criminalité (10.3) : quand l'humeur atteint 50, la criminalité baisse de 2 points par mois (le cahier ne dit pas comment elle redescend sans préfet). Tirages mensuels : un voleur avec une chance de (criminalité − 50) %, un émeutier de (criminalité − 70) % ; 4 criminels par mois au plus. Sans forum ni sénat, le voleur ne trouve rien à voler. L'émeutier vise le bâtiment inflammable le plus proche.
3. Pyramide des âges (6.3) : la part de travailleurs vaut 40 % × (part d'âge actif de la ville / part d'âge actif du profil des immigrants), pour garder l'équilibre des lots 1 à 3 ; d'âge actif = 20 à 49 ans. Profil des immigrants, mortalité et natalité dans `regles.ages`.
4. Difficulté (2.5) : la « force des ennemis » joue sur leur nombre (× 0,7 en facile, × 1,3 en difficile).
5. Armes : seuls les légionnaires prennent une charge d'armes, comme l'écrit le tableau 13.1 ; javelots et cavaliers n'en demandent pas.
6. Soldats au fort : ils se tiennent en formation sur la place d'armes, devant le fort, et engagent aussi tout ennemi à 4 cases du fort. Sans cela, un ennemi arrivé de l'autre côté abattait le fort sous leurs yeux.
7. Contact = les 8 cases voisines ; portée des tireurs mesurée en ligne droite. Ennemis et soldats se croisent sans collision. Un bâtiment coûte 1 + ses points de structure / 5 cases de détour dans le champ de l'ennemi ; les ruines se traversent.
8. Points de structure (13.4) : 100 pour tout bâtiment que le cahier ne cite pas.
9. Invasions : une à la fois (la suivante attend un mois) ; au bout de 48 jours, les survivants repartent.
10. Moral : −8 par soldat tué, +5 par jour au fort.
11. Demandes de troupes : force de la cohorte = somme de (1 + 0,1 × entraînement) ; victoire si elle atteint la force demandée ; pertes 20 % ou 50 % ; défaite −4 de faveur. Les légions de l'empereur comptent 40 soldats ; la mission est perdue quand elles frappent un bâtiment de la ville (fortifications exceptées), d'abord la résidence, le sénat ou le forum.
12. Palais impérial : voir les mesures. Construire un quartier complet (vin, hôpital, académie, cinq temples, théâtre, amphithéâtre, colisée et hippodrome qui couvrent les mêmes maisons, attractivité 90) avec le gouverneur automatique demande un plan dédié que je n'ai pas écrit.
13. Fonds et routes des missions militaires : Aquilée part avec 10 000 deniers et la route de Vérone (acheteuse d'armes) ouverte ; Vindobona avec 12 000 deniers et celle de Carnuntum. Repère de la section 16.3 : environ 7 000. La défense (caserne, forts à 1 000) coûte plus de 2 000 deniers avant la première invasion.
14. Une tour se passe de route ; elle reçoit ses gardes du réservoir unique de main-d'œuvre, et ne prend ni feu ni dommages (règle des bâtiments sans route, 23.7).

Constats (gouverneur automatique) :

- Sans préfecture posée tout de suite à côté des ateliers, l'argent parti dans l'armée les laissait brûler au bout de 11 mois ; sans ingénieur à côté, les forts posés loin de la ville s'effondraient.
- Les rochers (fer) d'Aquilée et la carrière d'argile de Vindobona étaient d'abord sur le chemin des envahisseurs : ils les détruisaient. Les cartes les placent maintenant du côté de la ville.
- Avec Mars hors des premiers temples, sa colère mettait le moral des cohortes à 0 juste avant une invasion.

### 23.10 Retours du propriétaire : graphisme et colons (25 novembre 2026)

Demande : améliorer la qualité graphique des bâtiments et du paysage, et faire arriver les colons de façon plus visible.

- Terrain : l'herbe varie en grandes nappes plus claires ou plus sombres (plus de damier), avec des brins, des taches de couleur, quelques fleurs et cailloux. Les prairies fertiles montrent des sillons et des épis. L'eau a un dégradé, des vaguelettes qui glissent et un reflet ; une rive de sable bordée d'écume longe toute terre.
- Arbres en grappes de feuillage éclairées par le soleil du nord-ouest, tronc et branches, ombre au sol ; quelques cyprès. Rochers à facettes, mousse, ombre.
- Routes bordées de pierres et pavées de dalles en quinconce ; la voie de Rome a de grandes dalles.
- Tous les bâtiments : liseré d'ombre au pied des murs, arête éclairée en haut, rangs de tuiles et faîtière sur les toits, ombre portée au sol (vers le bas à droite de l'écran, plus longue pour un bâtiment plus grand). Ces changements passent par les outils de dessin communs : aucun bâtiment n'a été redessiné un par un.
- Colons : chaque groupe d'immigrants arrive en chariot bâché tiré par un bœuf, un colon à pied à côté ; le dessin est 1,3 fois plus grand qu'un marcheur. La règle ne change pas : un chariot porte un groupe de 4 personnes au plus (section 6.1).
- Les images de la page du jeu et l'affiche n'ont pas été refaites : elles le seront au lot 5 (« affiche et aperçus »).

### 23.11 Lot 5 « Campagne et finitions » (25 novembre 2026)

Livré :

- **Les 10 dernières cartes** (16.1 à 16.3), toutes jouables : la campagne compte ses 17 cartes.

  | Éch. | Province paisible | Province militaire |
  | --- | --- | --- |
  | 6 | **Éphèse** : port, peu de prairies (blé par la mer), marbre ; 7 cités, épidémie | **Burdigala** : vignes sur peu de prairies, Garonne ; Gaulois puis Germains (5 invasions, 14 à 52), 2 demandes de troupes |
  | 7 | **Alexandrie** : climat aride, prairies le long du Nil seulement, blé de Memphis ; feu plus rapide | **Leptis Magna** : aride, olives ; cavaliers numides par le sud (5 invasions, 16 à 56) |
  | 8 | **Corinthe** : deux séismes qui rasent une zone de la ville ; marbre, poterie | **Colonia Agrippina** : le Rhin ne se franchit que par le pont de la voie de Rome ; Germains (6 invasions, 20 à 90) |
  | 9 | **Antioche** : carte de 160 × 160, quartiers patriciens, hippodrome, un séisme | **Palmyre** : oasis aride sur un oued, 160 × 160 ; Parthes (6 invasions, 20 à 84) |
  | 10 | **Athènes** : 160 × 160, tous les systèmes, deux petites incursions germaniques, un séisme | **Eburacum** : 160 × 160, forêts ; Pictes (6 invasions, 20 à 90), 3 demandes de troupes |

  Chaque carte a ses cités partenaires (6 ou 7, dont une qui apparaît en cours de partie), ses demandes de l'empereur, ses aléas (mauvaise récolte, route fermée, hausse des prix et des salaires de Rome, quotas) et sa présentation dans les 5 langues ; 43 cités nouvelles nommées dans les 5 langues.
- **Climat aride** (Alexandrie, Leptis Magna, Palmyre) : sol de sable, touffes sèches et palmiers à la place de l'herbe et des arbres, mini-carte ocre ; le feu y gagne plus vite (règle `feu.climats` existante).
- **Fin de campagne** (16.6) : la campagne est terminée quand les 10 échelons sont gagnés, par l'une ou l'autre province. L'écran de victoire l'annonce (rang de Princeps, étoiles sur 51) et propose de rejouer l'autre province d'un échelon ; la liste des missions l'indique. `FMG.reportComplete` part à ce moment, puis à chaque victoire suivante (le site garde le meilleur total). Avant ce lot, il ne partait que si les 17 cartes étaient gagnées. Après une victoire, « Mission suivante » propose l'échelon suivant dans la même province.
- **Musique** (18.5) : motifs composés au fil de l'eau par Web Audio, sans fichier, en quatre ambiances choisies d'après la ville : petite ville (lyre en pentatonique), grande ville dès 1 500 habitants (lyre, aulos, nappe, mode mixolydien), menace quand une armée arrive dans 3 mois ou moins (bourdon grave, notes rares, mode phrygien), combat tant que des ennemis sont sur la carte (tambours, ostinato). L'ambiance change en fin de phrase. Réglage « Musique » dans les options, indépendant du son ; rien ne joue hors d'une partie.
- **Aide intégrée** (17.6), depuis la pause, la liste des missions et le panneau de chaque bâtiment (« Fiche d'aide ») :
  - 16 fiches « Comment ça marche » : premiers pas, routes et marcheurs, maisons, eau, nourriture, main-d'œuvre, industrie, feu et crime, finances, dieux, spectacles et santé, commerce, empereur, critères de victoire, armée, patriciens ;
  - une fiche par bâtiment constructible (74), écrite d'après ses données : catégorie, taille, coût, personnel, accès, terrain, production, matière, marcheur, dieu, capacité, marbre, niveau de maison qui en a besoin, attractivité, risques d'incendie et d'effondrement.
- **Affiche et images du jeu** refaites avec le graphisme du lot 4 ; la troisième ville d'exemple (affiche, image 3, fond de l'écran titre) reçoit un rempart et quatre tours à l'ouest.
- **Page du jeu** : présentation mise à jour dans les 5 langues (17 cartes sur 10 échelons, choix d'une province dès le quatrième).
- Textes : 132 clés de plus dans les 5 langues (1 138 en tout).
- Tests : section « Lot 5 » de `scripts/tester-marmoria.mjs` (17 missions jouables, deux provinces par échelon dès le 4e, seuils et dates cibles croissants, au moins 4 biens vendables par carte, voie maritime pour chaque cité de la mer, chaque entrée d'invasion reliée à la ville à pied, zones de séisme dans la carte, 24 à 26 mois de gouverneur automatique par carte sans erreur ni invariant rompu, première invasion arrivée sur chaque carte militaire, séisme de Corinthe qui rase sa zone). En mode test (`?debug=1`), `MM_DEBUG.gagner()` et `MM_DEBUG.gagnees()` permettent d'essayer les écrans de fin.

Mesures :

| Critère (section 21) | Résultat |
| --- | --- |
| La campagne se termine par les deux branches | **Vérifié dans le jeu, pas en jouant** : dans Chromium (français sur ordinateur, allemand sur téléphone en paysage), avec 9 échelons gagnés par la branche militaire puis une victoire à Eburacum, et de même par la branche paisible jusqu'à Athènes, l'écran annonce la fin de campagne et `FMG.reportComplete` part avec 23 étoiles sur 51. **Aucune des 10 cartes n'a été gagnée par le gouverneur automatique** : sur 25 ans de jeu, il ne dépasse pas 1 050 habitants (Éphèse) et perd 6 cartes sur 10 (destitution, ou ville anéantie à Burdigala). C'était déjà sa limite à l'échelon 5 (23.6, 23.9). Que ces cartes se gagnent reste à vérifier en jouant. |
| Aucune chaîne non traduite | `check-i18n` : 5 langues, 1 138 clés ; interface parcourue dans Chromium (90 fiches d'aide ouvertes une à une, écrans de fin, cartes arides) sans erreur ni avertissement dans la console. |
| Tous les contrôles du site au vert | En local : `tester-marmoria --perf` (344 contrôles), `validate-games --jouer`, `tester-sauvegarde`, `check-i18n` (partie jeu), `controle-taxonomie`, `regles-seo`, `verifier-seo` : tout est bon. La partie « site » de `check-i18n` signale 5 erreurs `serviceWorker` dans le lanceur, identiques avec un autre jeu (`pommes-du-poney`) : elles viennent du Chromium de l'environnement de test (déjà vu au lot 1). |
| `index.html` mesuré, repère de 4 Mo | 1 622 Ko (lot 4 : 1 484 Ko après le graphisme). |
| Performances sur les cartes de 160 × 160 | 160 mois du gouverneur automatique, un seul processus : pire tick 27 ms à Palmyre (invasions parthes), 7 ms à Antioche ; la ville du lot 2 sur 160 × 160 reste sous 1 ms par tick en moyenne (`--perf`). |
| Dates cibles des étoiles | Voir l'écart 2. |

Écarts avec ce cahier (à valider ; les valeurs sont dans `donnees.json`) :

1. **Seuils de prospérité des provinces paisibles 8 à 10** abaissés de 65, 70 et 75 à 60, 62 et 65. Le plafond de la prospérité est la valeur moyenne de la maison de chaque habitant (14.2) : une ville toute en insulae plafonne à 55. Pour 75, il faudrait 44 % des habitants en palais, ou 80 % en villas, et les patriciens ne travaillent pas : la ville d'Athènes (10 000 habitants) manquerait de bras. À 65, 22 % des habitants en palais suffisent. Calcul d'ordre de grandeur, pas une partie jouée : à revoir après une séance de jeu. Les provinces militaires gardent 45, 50 et 60.
2. **Dates cibles** (troisième étoile) : 288, 324, 360, 396 et 432 mois pour les échelons 6 à 10, prolongées de la pente des échelons 3 à 5 (126 à 240 mois). La règle « 1,5 fois une partie de référence » ne peut pas s'appliquer : aucune partie de référence n'est gagnée.
3. **Climat aride** : seulement un feu plus rapide et des prairies rares ; aucune règle de plus sur la nourriture (« nourriture importée » vient de la carte : à Alexandrie, Leptis Magna et Palmyre, 350 à 450 cases de prairie contre 1 000 à 1 400 ailleurs).
4. **Tailles des cartes** : 120 × 120 pour les échelons 6 à 8, 160 × 160 pour les échelons 9 et 10 (seules tailles du moteur : 80, 120, 160).
5. **Fonds de départ** : 7 500, 7 000, 6 500, 6 000 et 5 000 deniers en province paisible (repère 16.3) ; 10 000 à 12 000 en province militaire, comme Aquilée et Vindobona (écart 13 du lot 4).
6. **Séismes** : zones fixes de 13 × 9 cases près du centre de la carte, où passe la voie de Rome. Un joueur qui bâtit ailleurs peut n'y rien perdre.
7. **Athènes** : deux petites incursions germaniques (16 et 30 guerriers) pour que « tous les systèmes » comprenne l'armée.
8. **Fiches d'aide des bâtiments** : la phrase de description déjà écrite pour chaque bâtiment, suivie de ses données ; pas de texte rédigé à la main bâtiment par bâtiment.
9. **Musique** : sa qualité n'a pas été jugée à l'oreille (les essais tournent sans haut-parleur) ; repli prévu par le cahier : le réglage « Musique » la coupe, les effets restent.
10. **Image 3 et affiche** : la ville du lot 2 avec ses insulae, plus un rempart hors du cadre de l'image. Une ville de fin de campagne (villas, palais, forts, hippodrome) demanderait un plan de construction automatique que je n'ai pas écrit (même limite que l'écart 12 du lot 4).

Constats :

- Le gouverneur automatique ne prouve plus rien à partir de l'échelon 5 : son plan pose des quartiers de tentes et de cabanes, son économie ne dépasse pas 2 500 habitants, et les cartes des échelons 6 à 10 partent avec moins d'argent. Le rendre capable de les gagner (quartiers d'insulae puis de patriciens, achats de nourriture planifiés) serait un chantier à part.
- Chaque carte a au moins 4 biens à vendre aux cités visibles dès le départ, d'après son terrain (prairies, rive, arbres, rochers, bancs de poissons) : la carte elle-même ne bloque pas l'économie.

### 23.12 Suites du lot 5 (26 novembre 2026)

Décisions du propriétaire, prises sur questionnaire :

- Seuils de prospérité des provinces paisibles 8 à 10 : 60, 62 et 65 gardés (écart 1 du lot 5).
- Massalia et Vindobona : seuils inchangés jusqu'aux essais du propriétaire.
- Publication : après ses essais (Éphèse, Leptis Magna, musique, aide sur téléphone).
- Lot 6 : voir les sections 16.7 et 22.2.

Fait le même jour :

- Images du jeu de la page : un jeu qui se joue en paysage a ses 3 images en paysage (dérogation, section 19.6), alors que la page attendait 2 captures de téléphone en portrait. Sur ordinateur, les deux premières faisaient 196 × 91 px ; sur téléphone, chacune débordait de l'écran (725 px pour 390). Nouvelle disposition `tout-paysage` (`scripts/pages-seo.mjs`, `public/style.css`) : sur téléphone, une image à la fois (337 × 156 px à 390 px de large) et le bord de la suivante ; dès 720 px, les trois sur une ligne, à la même hauteur. Les autres jeux gardent leur disposition.
- Humanizer (`.claude/skills/humanizer`, `scripts/humanizer.mjs`) : 10 textes réécrits sur 15 (la description du catalogue et une phrase de la présentation, dans les 5 langues), les 5 descriptions pour Google gardées ; contrôles du script passés. Les textes sont aussi rangés dans `sources/marmoria/textes/*.json`, sinon l'assemblage suivant les remettrait.

### 23.13 Musique plus romaine (26 novembre 2026)

Retour du propriétaire : musique « trop basique », à rendre « beaucoup plus romaine ». La bibliothèque Kenney n'a pas de musique antique (ses musiques sont de courts jingles, et le site kenney.nl n'est pas joignable depuis l'environnement de travail) ; choix du propriétaire sur questionnaire : refaire la synthèse.

Réalisé (`sources/marmoria/audio.js`, toujours sans fichier audio) :

- Quatre morceaux écrits à la main au lieu de notes tirées au hasard, en parties de 4 mesures, avec plusieurs passages qui changent l'instrument du chant :
  - petite ville : ré dorien, 72 à la noire, forme A A' B A' (16 mesures, 53 s) ; passages : aulos et bourdon, cithare seule, aulos avec arpèges et sistres ;
  - grande ville : sol mixolydien, 96, forme A A' B A' (40 s) ; hydraulis, cithare grattée, tambour sur cadre en rythme de danse, sistres ; un passage où l'hydraulis chante, un autre avec fanfares de cornu ;
  - menace : mi phrygien, 60, 8 mesures ; bourdon d'orgue grave, cœur qui bat au tambour, appels de cornu au loin (plus de salle), aulos qui descend d'une octave au second passage ;
  - combat : mi phrygien dominant, 132, 8 mesures ; tambours en doubles croches, grosse caisse, sistres à contretemps, appels de cuivres, appuis de cuivres au second passage.
- Instruments imités : cithare par synthèse de Karplus-Strong (corde rendue une fois par hauteur à 22 050 Hz et gardée, caisse de bois) ; aulos double (anche nasale jouée liée, mordants, glissés, coups de langue, vibrato tardif, souffle ; second tuyau en bourdon) ; hydraulis (jeux de flûtes, attaque soufflée, tremblement de l'eau) ; cornu et tuba (deux sonneurs, note prise par-dessous, embouchure qui s'ouvre) ; tympanum (doum, tek, tek léger), grosse caisse, sistre, crotales.
- Salle : réverbération d'une cour de marbre (réponse calculée de 2,3 s, premières réflexions, graves coupés à l'envoi).
- Étape, victoire et défaite jouées par les mêmes instruments (cithare ; fanfare de cornu sur les harmoniques de do ; appel grave qui descend), hors du réglage « Musique ».
- L'ambiance change à la fin d'une mesure ; à la sortie d'une partie, la musique s'arrête en moins d'une demi-seconde (sources programmées arrêtées), les effets continuent.
- API inchangée pour l'interface (`musique`, `musiqueActive`, `ambiance`) ; `MM_AUDIO.partitions()` lit les morceaux pour les tests. `version` 12.

Mesures (rendu hors ligne dans Chromium, 44,1 kHz) :

| Critère | Résultat |
| --- | --- |
| Niveau moyen à la sortie | −33 dB (petite ville), −31 dB (grande ville), −32,5 dB (menace), −30 dB (combat) ; crête 0,46 au plus |
| Équilibre | chant vers −36 dB, accompagnement vers −40 dB, réverbération 9 dB sous le son direct |
| Calcul audio | 5 % (petite ville) à 9 % (combat) d'un cœur de serveur à 2,1 GHz, dont la moitié pour la salle |
| Arrêt et changements | petite ville → combat à la fin de la mesure, arrêt complet en 0,5 s, reprise sans erreur |

Tests : section « Musique » de `scripts/tester-marmoria.mjs` (quatre morceaux, mesures de 8 croches, cuivres en mesures complètes, notes dans le mode, tessiture du chant, un accord par mesure, passages aux voix valides).

Reste : écoute du propriétaire (un extrait de 3 minutes lui a été envoyé) et essai sur téléphone ; sur un téléphone d'entrée de gamme, le calcul audio peut atteindre 20 à 30 % d'un cœur (estimation, à mesurer) ; si la musique saccade, retirer la salle ou réduire la polyphonie.

### 23.14 Publication et téléphone en paysage (26 novembre 2026)

- **Publié** sur décision du propriétaire (« On peut publier le jeu ») : pull request Jamesmax27/Jeux-en-ligne#444 fusionnée (commit `5fbd4b6`), contrôles verts, aucune pull request de la boucle de nuit ouverte.
- Retour du propriétaire après un essai : « ça va pas ». Cause trouvée en rejouant dans le lanceur du site : sur un téléphone en paysage, la barre du site et celle du navigateur laissent au jeu 260 à 300 px de haut (iPhone SE 263, iPhone 13 285, Pixel 7 303), alors que le jeu avait été réglé sur 390 px. La fiche de la mission débordait (« Commencer » sous le bord, à faire défiler), les boutons « Passer » / « Suivant » de la prise en main sortaient de l'écran sur iPhone SE, et le bouton du son sortait à droite sur iPhone 13 (750 px de large).
- Correction (`sources/marmoria/gabarit.html`, `version` 13) : les boutons d'une carte restent collés à son bas quand son texte défile ; sous 340 px de haut, cartes, titres, textes et démonstrations des gestes resserrés ; jusqu'à 820 px de large, la date et les loupes se cachent (on zoome en pinçant).
- Vérifié dans le lanceur local, iPhone SE, iPhone 13 et Pixel 7 en paysage, iPhone 13 en portrait, ordinateur : écran titre, fiche de la mission, trois écrans de prise en main, barre du haut, pause, chaque bouton visible et touchable sans défiler.
- Reste : sur iPhone, le bouton plein écran du lanceur ne cache pas la barre du navigateur (Safari ne le permet pas sur iPhone) ; l'appli installée sur l'écran d'accueil donne environ 50 px de plus.

### 23.15 Lot 6 « Cités voisines » : conception retenue et avancement (commencé le 26 novembre 2026)

Lancé à la demande du propriétaire (« s'il y a d'autres choses à faire dans la suite, lance-le »), après la publication. Règles : section 16.7 ; décisions du 26 novembre : section 22.2. Branche `marmoria-lot6`, pull request en brouillon, jamais fusionnée sans l'accord du propriétaire.

**Serveur (fait, étape 1)** : `multijoueur/src/province.js`, Durable Object « Province » du Worker multijoueur, un par province, nommé d'après un code de 6 caractères sans I, O, 0 ni 1.
- Adresse `POST /province`, corps en texte JSON (pas de pré-vol CORS), sites permis seulement. Actions : `creer` (jeu, carte, siège choisi), `rejoindre` (code, siège souhaité, sinon le premier libre ; 409 si pleine), `lire` (lecture publique : places libres), `sync` (siège, jeton, opérations, accusé, avancement, signal).
- Opérations d'un joueur, numérotées par siège, appliquées une seule fois et dans l'ordre : `depot` (q charges du bien g à son étal, au prix p), `demande` (caravane demandée à l'étal du voisin d, 8 charges au plus, lots les plus anciens d'abord), `reprise` (tout son étal d'un bien). Réponses gardées jusqu'à l'accusé du joueur : `livraison` (ce que la caravane apporte, payé à l'arrivée), `paiement` (vente faite à un voisin), `reprise` (charges rendues, ou étal plein : 400 charges au plus par siège).
- Le jeton d'un siège n'est gardé que sous forme d'empreinte SHA-256 ; le pseudo vient du ticket signé du site (comme le multijoueur). Signaux : liste fixe (`cherche`, `vend` avec un bien, `merci`, `aide`, `route`), 3 gardés par siège. Avancement visible des voisins : population, quatre cotes, objectif atteint, ventes, mois de jeu.
- Objectif commun : la province est gagnée quand chaque cité active (visite depuis moins de 7 jours) a atteint ses seuils. Voisin absent depuis plus de 7 jours : `actif` faux, une cité de l'ordinateur prend sa place chez les autres, son étal reste en vente.
- Stockage : une clé, écrite au plus une fois par requête et seulement si quelque chose a changé (visite seule : au plus toutes les 15 minutes). Effacement 30 jours après la dernière visite (alarme reprogrammée au plus une fois par jour).
- `scripts/tester-province.mjs` : 32 contrôles, dont 10 000 échanges entre 4 cités avec requêtes perdues, réponses perdues, doublons, trous et rechargements d'une ville enregistrée plus tôt (aucune charge ni aucun denier créé ou perdu) ; `--cout` : 25 provinces de 4 joueurs actifs une heure par jour font environ 9 200 requêtes au comptoir (autant au Worker) et 6 300 lignes écrites par jour, moins de 10 % des limites gratuites. Les requêtes du Worker comptent dans les 100 000 requêtes par jour du compte, partagées avec les fonctions du site.

**Lanceur (fait, étape 2)** : `public/province/lanceur.js`, branché par `play.js` pour un jeu `"province": true` (catalogue : `multijoueur`, `province`, `places`). Messages `jel-province` du jeu (`creer`, `rejoindre`, `lire`, `sync`), réponse avec le même `id`. Ticket du profil joint à la création, à l'arrivée et une fois par visite. Hors du site (aperçus, test local sans `?multi=`) : erreur `hors-site`. Coquille `v27`.

**Règle de sûreté côté jeu** : le jeu n'envoie que les opérations contenues dans sa ville enregistrée, et n'accuse que les réponses qu'elle contient. Avant chaque envoi : la ville est enregistrée (clé `province-<code>` de `JEL_STOCK`), les opérations et l'accusé sont lus dans l'état enregistré au même instant. Une ville relue plus ancienne renvoie des opérations déjà vues (ignorées) et reçoit de nouveau les réponses non accusées : rien n'est perdu ni doublé (c'est ce que simule `tester-province.mjs`).

**Jeu (étapes 3 à 6, faites le 26 novembre 2026 ; liste d'origine ci-dessous)**
3. Simulation : `e.province` (code, siège, jeton, numéro suivant, opérations à envoyer, dernière réponse appliquée, vue des voisins, en ligne ou non, réserve d'attente) ; commandes `province-sync` (réponses du comptoir et vue des voisins) et `province-reseau` (routes fermées hors connexion) ; cités voisines de la carte de l'Empire (une par siège, avec des biens et quotas d'ordinateur pour quand le siège est libre ou son joueur absent) ; caravane de la province qui prend aux entrepôts les biens « exporter » et les dépose à l'étal (prix = moyenne des prix d'importation et d'exportation, section 20.6) ; demande d'achat périodique à l'étal de chaque voisin actif pour les biens « importer » (plafond de 40 charges par bien, par voisin et par année) ; caravane de livraison qui décharge et paie à l'arrivée (ce qui ne tient pas dans les entrepôts attend dans une réserve) ; paiement au poste « Ventes aux voisins » ; objectif de la cité signalé au comptoir, victoire quand la province gagne. Tests : déterminisme et sauvegarde avec ces commandes.
4. Cartes : deux provinces de 4 cités (Campanie, Hispanie), complémentaires (chacune manque d'une ou deux matières qu'une voisine a en abondance : argile, olives, marbre, fer, poisson), cités de l'ordinateur à quotas bas, seuils de chaque cité.
5. Interface : bouton « Cités voisines » de l'écran titre ; créer (province, cité), rejoindre (pavé du code, cité libre), mes provinces ; panneau de la province (code à partager, voisins : pseudo, population, cotes, dernière visite, étal, signaux ; envoi d'un signal) ; voisins sur la carte de l'Empire et dans le conseiller du commerce ; messages (arrivée d'un voisin, route fermée hors connexion, province gagnée) ; textes dans les 5 langues ; synchronisation toutes les 45 s de jeu visible et 3 s après une nouvelle opération.
6. Site : quatrième dérogation (jeu `"province"`, multijoueur sans moteur du site) dans `scripts/derogations-jeux.mjs` et `validate-games.mjs` ; bouton « Rejoindre » de la page Amis (présence : code de la province) ; politiques de confidentialité et de cookies (fr, en) ; `docs/multijoueur.md` ; essai à deux appareils, coût mesuré, `index.html` mesuré (repère 4,3 Mo).

Réalisé (étapes 3 à 6) :
- Simulation (`sim.js`) et données (`voisinages`, `missionsVoisinage` de `donnees.json` : les 8 cités, hors de la campagne et de ses 17 cartes ; règle `voisinPlafond` de 40 charges) comme prévu ci-dessus ; poste « Ventes aux voisins » du budget.
- Cartes : chaque cité n'a pas certains bâtiments de production (sa liste `batiments`), ses voisines les ont : Capua (blé, vin, argile ; sans marbre, fer, poisson), Puteoli (poisson, fer), Nola (marbre, olives), Salernum (bois, poisson, vin), Saguntum (poisson, vin), Valentia (blé, olives, argile), Dertosa (bois, argile), Ilerda (fer, marbre). Objectifs de chaque cité : 2 000 habitants, culture 30, prospérité 15, paix 25, faveur 40 ; aucune date limite ni étoile. Deux cités de l'ordinateur par province (quotas de 5 à 8 charges).
- Interface : bouton « Cités voisines » de l'écran titre ; mes provinces (continuer), créer (province, cité), rejoindre (champ du code, cités libres et prises) ; bouton « Province » de la barre (code à partager, en ligne ou non, objectifs, ventes et achats, réserve, chaque voisin : population, cotes, objectifs, dernière visite, étal, signaux ; envoi d'un signal de la liste fixe) ; voisins nommés avec leur joueur sur la carte de l'Empire et dans la fiche d'une cité (étal et prix entre joueurs) ; messages (livraison, paiement, arrivée d'un voisin, étal plein, hors connexion, objectifs, province gagnée) ; écran de victoire de la province avec la part de chacun (`FMG.reportEnd`) ; une cité de province ne s'enregistre que dans sa province (pas de copie automatique ni d'emplacement manuel) ; synchronisation toutes les 45 s de jeu visible et 3 s après une opération ; 99 clés de textes dans les 5 langues.
- Site : dérogation `province` ; `validate-games.mjs` (champ `province`, 2 à 4 `places`) ; catalogue (`multijoueur`, `province`, `rejoindre`) ; « Rejoindre » de la page Amis (`<jeu>.province-<code>` dans la présence) ; pas de classement des manches pour Marmoria ; JSON-LD multijoueur ; politique de confidentialité (fr, en, mise à jour du 26 novembre) ; `docs/multijoueur.md`, section 14 ; `validate.yml` et `multijoueur.yml` lancent `tester-province.mjs`.

Mesures et essais :

| Critère (section 21) | Résultat |
| --- | --- |
| Province de 2 joueurs sur deux appareils | Essai dans le lanceur local avec un comptoir local : création (Capua), arrivée par le code sur un second appareil (Puteoli), chacun voit l'autre ; par la page Amis (« Rejoindre ») : choix de la cité libre. Essai réel sur le site : après la fusion (le Worker se redéploie seul), à faire par le propriétaire |
| Vitesses différentes, joueur absent 3 jours | Simulé (`tester-marmoria`, 24 mois à des rythmes alternés) ; absence de plus de 7 jours : cité de l'ordinateur (`tester-province`) |
| Aucune charge ni aucun denier créé ou perdu sur 10 000 échanges | `tester-province.mjs` : 10 000 opérations, 8 % de requêtes perdues, 8 % de réponses perdues, 10 % de doublons, trous, 3 % de rechargements : conservation exacte |
| Déterminisme et sauvegarde avec les commandes du comptoir | Sauvegarde relue en cours d'échange, invariants tenus (`tester-marmoria`, section « Lot 6 ») |
| Coût pour 100 joueurs actifs par jour | ≈ 9 200 requêtes au comptoir (autant au Worker) et 6 300 lignes écrites, moins de 10 % des limites gratuites ; les requêtes du Worker comptent dans les 100 000 requêtes par jour du compte, avec les fonctions du site |
| `index.html` | 1 729 Ko (repère 4,3 Mo) |

Écarts :
1. Une cité de province vit sur un seul appareil (stockage du jeu, IndexedDB du site) : la synchronisation des sauvegardes d'un appareil à l'autre ne la suit pas. Changer d'appareil, c'est reprendre une autre cité libre.
2. Les cartes complémentaires sont faites en retirant des bâtiments de production à chaque cité, pas en dessinant des terrains à la main.
3. Toutes les routes vers les voisins sont terrestres (caravanes), même entre deux ports.
4. La reprise de son étal (opération `reprise`) existe sur le serveur, mais l'interface ne la propose pas encore : un bien qui n'est plus « exporter » reste à l'étal jusqu'à son achat.
5. Pas d'aide intégrée propre au mode (le panneau de la province et les messages l'expliquent).

Publication (26 novembre 2026, demande du propriétaire « publier tout seul, tout ») : pull request #457 fusionnée (commit `5145078`), contrôles verts ; site publié par Cloudflare Pages ; Worker multijoueur redéployé par `multijoueur.yml` (contrôle du comptoir de province vert, déploiement et vérification de l'adresse réussis). Reste : essai réel à deux appareils sur freemicrogames.com.


### 23.16 Retours du propriétaire : marcheurs, impôt, commerce, calques, campagne et tutoriels (26 novembre 2026)

Demandes du propriétaire après ses essais (26 novembre 2026), toutes faites dans la même pull request :

1. **Marcheurs plus intelligents** (règles 4.2.3 et 4.2.4 modifiées) : un errant ne choisit plus sa direction au hasard. À chaque étape, il cherche, dans ses pas restants, le bâtiment qui a le plus besoin de son service, et y va par le plus court chemin en servant tout ce qu'il croise. Le plus proche passe devant à besoin égal (score = besoin × (1 − 0,5 × distance / pas restants) ; recherche arrêtée dès qu'une cible est trouvée à 8 pas). Besoin : compteur de service bas (moins de 36 jours sur 48) pour les maisons habitées ; risque d'incendie ou criminalité pour le préfet, dommages pour l'ingénieur (dès 10 % du seuil) ; nourriture et biens que le marché peut donner pour la vendeuse (un bien sans stock compte à moitié, tant que la demande n'est pas relevée) ; mois d'impôt dus pour le percepteur. Une rue sans besoin n'est plus parcourue : sans cible, l'errant rentre et le suivant attend 3 fois plus longtemps. Le préfet, lui, patrouille au hasard sans cible (il doit pouvoir courir aux incendies) et ne recherche qu'après 6 pas. Un bâtiment déjà visé par un autre marcheur du même service lui est laissé ; un marcheur ne revise pas un bâtiment visé pendant sa tournée. Réglages : `regles.guidage` de `donnees.json`.
2. **Impôt au passage du percepteur** (règle 11.2 modifiée) : chaque mois, une maison habitée ajoute l'impôt du mois, au taux du mois, à ses arriérés (`du` en deniers, `dm` en mois), un an au plus (`regles.impot.arrieresMois` = 12) ; le percepteur prélève tous les arriérés en passant. Six mois sans passage : six mois prélevés ; un mois plus tard : un mois. Une maison vidée perd ses arriérés ; deux maisons qui fusionnent les additionnent. Pièce et somme montent au-dessus de la maison (`e._gains`, hors sauvegarde) ; arriérés dans le panneau d'une maison et dans le conseiller des finances.
3. **Commerce** : bouton « Commerce » (amphore) dans la barre du haut, carte de l'Empire en grand, dessinée à la taille de l'écran ; à côté de chaque cité, les images des biens qu'elle achète (flèche verte) et vend (flèche bleue), étiquettes placées sans se chevaucher quand c'est possible ; à droite, la fiche de la cité touchée (ouverture de la route) et les réglages des biens. L'onglet Commerce du Gouvernement ouvre la même carte. Les cités de l'ordinateur et les places de voisins libres ouvrent leurs routes comme avant. La date et les loupes se cachent jusqu'à 900 px de large (820 avant), pour faire place au bouton.
4. **Calques** : le bâtiment qui porte le service du calque reste dessiné tel quel (préfecture sur « Feu » et « Criminalité », poste d'ingénieur sur « Dommages », forum et sénat sur « Impôts », greniers, marchés, fermes et pêche sur « Nourriture », temples, écoles, santé, spectacles, eau, entrepôts sur « Stocks », embellissements sur « Attractivité »).
5. **Menu** : une catégorie à un seul choix (zone de logement, déblayer) prend l'outil d'un clic, sans sous-menu ni message ; un second clic le repose.
6. **Carte de la campagne** : l'Europe romaine, Rome au centre ; chaque mission à la place de sa ville, reliée par une route courbe à la mission qui l'ouvre (or si faite, tirets qui avancent si ouverte, pointillés pâles sinon) ; gagnée (or et étoiles), ouverte (anneau qui bat), fermée (grise) ; le chiffre est l'échelon ; toucher une ville ouvre sa présentation ; « Prochaine mission » et les autres boutons à droite ; la liste d'avant reste à un bouton. Ostie et Rome, Corinthe et Athènes sont un peu écartées pour rester lisibles. Mers et côtes au-delà de la Méditerranée (Atlantique, Manche, mer du Nord, Baltique, mer Noire, Bretagne, Irlande) dessinées à grands traits.
7. **Tutoriels des bâtiments** : dans la campagne, chaque bâtiment jamais lu porte la marque « Nouveau » dans le menu ; le toucher ouvre d'abord sa fiche : à quoi il sert (texte du bâtiment), ce qu'il faut faire (étapes tirées de ses données : où le poser, route, employés, ce qu'il lui faut, ce qu'il produit et pour qui, quel bâtiment le complète), « Le construire », « Suivant ». Au début d'une mission, l'écran « Nouveaux bâtiments » les présente (« Les découvrir un par un » ou « Plus tard »), après l'aide aux gestes. Ostie a son propre tutoriel pas à pas : ses bâtiments comptent comme lus. Fiches lues gardées dans la progression (`vus`). Pas de marque en construction libre ni en province.

Mesures (contrôles et essais du 26 novembre 2026) :

| Mesure | Avant | Après |
| --- | --- | --- |
| Gouverneur automatique, Ravenne gagnée | mois 152 | mois 125 |
| Narbo gagnée | mois 274 | mois 154 |
| Aquilée (3 départs) | 2 gagnées | 3 gagnées |
| Massalia (non gagnée), habitants | 1 458 | 2 928 |
| 6 villes d'exemple sur 3 ans : incendies | 228 | 119 |
| Jours de bâtiments au-delà de 60 de risque (2e et 3e années) | 1 893 | 321 |
| Maisons recensées pour l'impôt | 73 % | 98 % |
| Habitants (moyenne des 6 villes) | 724 | 700 |
| Tick sur la carte de 160 × 160 remplie | 0,78 ms | 0,88 ms |
| `index.html` | 1 729 Ko | 1 805 Ko |

Écarts :
1. Les arriérés d'impôt sont plafonnés à un an (choix de Claude) : sans plafond, un quartier jamais visité rapporterait autant qu'un quartier bien servi, et le percepteur ne servirait plus qu'à encaisser plus tôt.
2. Le préfet sans cible garde la patrouille au hasard : il doit rester dans les rues pour courir aux incendies (section 10.1).
3. Les fiches de tutoriel sont écrites à partir des données des bâtiments et de phrases types (une par genre de bâtiment), pas bâtiment par bâtiment : elles restent justes si les données changent, mais leurs phrases sont génériques.
4. Ravenne présente 48 bâtiments nouveaux à un joueur qui n'a fait qu'Ostie et Pompéi : l'écran les montre tous, la marque « Nouveau » permet de les lire au moment de les bâtir.
