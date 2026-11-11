# Mots-clés visés par les pages de catégorie et d'école

> **Statut : validé par le propriétaire le 11 novembre 2026.** Textes écrits le
> même jour dans `gabarits/textes/categories.<langue>.json` et
> `gabarits/textes/ecole.<fr|en|de>.json` (contrôle : `node scripts/regles-seo.mjs --categories`).
> Dans l'introduction et les réponses, `{n}` est remplacé au build par le nombre
> de jeux de la page (jamais un nombre écrit en dur : la boucle de nuit en ajoute chaque nuit).
>
> **Aucun mot-clé n'a de donnée de volume** (ni Search Console, ni outil de
> mots-clés consulté) : **tous sont des hypothèses**, tirées du vocabulaire courant
> des recherches de jeux pour enfants dans chaque langue. Pour les confirmer :
> Search Console → Performances → Requêtes (après quelques semaines
> d'indexation), ou l'outil de planification de mots-clés de Google Ads.

## 1. Règles communes (choix du propriétaire du 11 novembre 2026)

- **Titre** (`<title>`) : « Jeux de <thème> gratuits | Free Micro Games », adapté
  par langue, **sans** « en ligne pour enfants » :
  - fr : `Jeux de <thème> gratuits | Free Micro Games`
  - en : `Free <Theme> Games | Free Micro Games`
  - es : `Juegos de <tema> gratis | Free Micro Games`
  - pt : `Jogos de <tema> grátis | Free Micro Games`
  - de : `<Thema>-Spiele kostenlos | Free Micro Games`
  Longueur : 30 à 60 caractères (le contrôle passe son minimum de 50 à 30 pour
  les seules pages de catégorie et d'école).
- **H1** : le mot-clé principal en clair, sans le nom du site (« Jeux de chevaux
  gratuits », « Free Horse Games »…), unique sur le site.
- **Meta description** : 140 à 160 caractères, unique, avec le mot-clé principal
  et une raison concrète de cliquer (nombre de jeux, âge, sans inscription).
- **Introduction** : 120 à 200 mots au-dessus de la grille, écrite d'après les
  jeux réellement présents dans la catégorie (pas de phrase passe-partout,
  `verifier-seo.mjs` refuse les suites de mots recopiées d'une page à l'autre).
- **Questions-réponses** (3 à 5, en bas de page, aussi en JSON-LD `FAQPage`) :
  choisies parmi « À partir de quel âge ? », « Est-ce gratuit ? », « Faut-il
  s'inscrire ? », « Peut-on jouer hors ligne ? », « Sur téléphone ? » ; réponses
  courtes et propres à la catégorie (âges réels de ses jeux, multijoueur s'il y
  en a, etc.), jamais copiées à l'identique d'une page à l'autre.
- **« pour enfants »** n'est plus dans le titre ; il peut rester dans le H1, la
  description ou l'introduction, **sauf** pour la page 13+ et dans les phrases qui
  parlent de jeux 13+ (on dira « ados » ou « dès 13 ans »).

## 2. Genres (13)

Mot-clé principal en gras (il donne le titre et le H1), puis 2 à 3 mots-clés
secondaires (description, introduction). **Tous : hypothèses.**

| Genre | fr | en | es | pt | de |
| --- | --- | --- | --- | --- | --- |
| arcade | **jeux d'arcade** ; jeux d'adresse, jeux de réflexes | **arcade games** ; reflex games, skill games for kids | **juegos de arcade** ; juegos de habilidad, de reflejos | **jogos de arcade** ; jogos de habilidade, de reflexo | **Arcade-Spiele** ; Geschicklichkeitsspiele, Reaktionsspiele |
| puzzle | **jeux de logique** ; jeux de puzzle, casse-tête, labyrinthes | **puzzle games** ; logic games, brain games for kids, maze games | **juegos de lógica** ; puzles, rompecabezas, laberintos | **jogos de lógica** ; quebra-cabeça, labirinto | **Logikspiele** ; Puzzlespiele, Knobelspiele, Labyrinth |
| memoire | **jeux de mémoire** ; memory, jeux d'observation, objets cachés | **memory games** ; matching games, hidden object games | **juegos de memoria** ; memorama, encontrar objetos | **jogos de memória** ; jogo da memória, encontrar objetos | **Gedächtnisspiele** ; Memory, Suchspiele |
| quiz | **quiz pour enfants** ; jeux de culture générale, devinettes | **quiz games for kids** ; trivia games, riddles | **juegos de preguntas** ; trivia para niños, adivinanzas | **quiz infantil** ; jogos de perguntas, adivinhas | **Quizspiele für Kinder** ; Wissensspiele, Rätsel |
| mots | **jeux de mots** ; jeux de lettres, jeux de lecture, alphabet | **word games** ; spelling games, alphabet games, reading games | **juegos de palabras** ; juegos de letras, abecedario | **jogos de palavras** ; jogos de letras, alfabeto | **Wortspiele** ; Buchstabenspiele, Lesespiele, ABC |
| calcul | **jeux de calcul** ; jeux de maths, tables de multiplication, compter | **math games** ; counting games, multiplication games, addition | **juegos de matemáticas** ; juegos de cálculo, tablas de multiplicar, contar | **jogos de matemática** ; tabuada, jogos de contar | **Rechenspiele** ; Mathespiele, Einmaleins, Zählen |
| plateforme | **jeux de plateforme** ; jeux de saut, jeux de course et saut | **platform games** ; jumping games, platformer | **juegos de plataformas** ; juegos de saltar | **jogos de plataforma** ; jogos de pular | **Jump-and-Run-Spiele** ; Plattformspiele, Hüpfspiele |
| course | **jeux de course** ; jeux de voiture, de vitesse, de glisse | **racing games** ; car games, speed games | **juegos de carreras** ; juegos de coches / de autos | **jogos de corrida** ; jogos de carro | **Rennspiele** ; Autospiele |
| aventure | **jeux d'aventure** ; jeux d'exploration, jeux de rôle | **adventure games** ; exploration games, RPG for kids | **juegos de aventura** ; juegos de exploración, de rol | **jogos de aventura** ; jogos de exploração, RPG | **Abenteuerspiele** ; Entdeckerspiele, Rollenspiele |
| strategie | **jeux de stratégie** ; jeux de société, tower defense, réflexion | **strategy games** ; board games, tower defense | **juegos de estrategia** ; juegos de mesa, defensa de torres | **jogos de estratégia** ; jogos de tabuleiro, tower defense | **Strategiespiele** ; Brettspiele, Tower Defense |
| simulation | **jeux de simulation** ; jeux de gestion, jeux de soin, vétérinaire | **simulation games** ; management games, pet care games, doctor games | **juegos de simulación** ; juegos de gestión, de cuidar animales | **jogos de simulação** ; jogos de gerenciar, cuidar de animais | **Simulationsspiele** ; Managementspiele, Tierpflege-Spiele |
| creation | **jeux de création** ; jeux d'habillage, coloriage, dessin, construction | **creative games** ; dress up games, coloring games, building games | **juegos de crear** ; vestir, colorear, construir | **jogos de criar** ; vestir, colorir, construir | **Kreativspiele** ; Anziehspiele, Malspiele, Bauspiele |
| musique | **jeux de musique** ; jeux de rythme, jeux musicaux | **music games** ; rhythm games, musical games for kids | **juegos de música** ; juegos de ritmo, musicales | **jogos de música** ; jogos de ritmo, musicais | **Musikspiele** ; Rhythmusspiele |

## 3. Univers (12)

| Univers | fr | en | es | pt | de |
| --- | --- | --- | --- | --- | --- |
| animaux | **jeux d'animaux** ; jeux de ferme, animaux sauvages, animaux de compagnie | **animal games** ; farm games, pet games, zoo games | **juegos de animales** ; juegos de granja, mascotas | **jogos de animais** ; jogos de fazenda, bichos de estimação | **Tierspiele** ; Bauernhofspiele, Haustierspiele |
| chevaux | **jeux de chevaux** ; jeux de poney, équitation, jeu de cheval gratuit | **horse games** ; pony games, horse riding games | **juegos de caballos** ; juegos de ponis, de equitación | **jogos de cavalo** ; jogos de pônei, hipismo | **Pferdespiele** ; Ponyspiele, Reitspiele |
| dinosaures | **jeux de dinosaures** ; jeux de dino, T-rex, préhistoire | **dinosaur games** ; dino games, T-rex games | **juegos de dinosaurios** ; juegos de dinos | **jogos de dinossauro** ; jogos de dino | **Dinosaurier-Spiele** ; Dino-Spiele |
| ocean | **jeux de la mer** ; jeux de pirates, de poissons, sous-marins | **ocean games** ; pirate games, fish games, underwater games | **juegos del mar** ; juegos de piratas, de peces | **jogos do mar** ; jogos de pirata, de peixes | **Meeresspiele** ; Piratenspiele, Unterwasserspiele |
| nature | **jeux de nature** ; jeux de saisons, jardin, Noël et fêtes | **nature games** ; garden games, seasonal games, holiday games | **juegos de naturaleza** ; jardín, estaciones, fiestas | **jogos de natureza** ; jardim, estações, festas | **Naturspiele** ; Gartenspiele, Jahreszeiten, Feste |
| fantasy | **jeux de magie** ; jeux de sorcières, de monstres, contes, fées | **magic games** ; fantasy games, monster games, fairy tale games | **juegos de magia** ; juegos de monstruos, cuentos, hadas | **jogos de magia** ; jogos de monstros, contos de fadas | **Zauberspiele** ; Fantasy-Spiele, Monsterspiele, Märchenspiele |
| espace | **jeux de l'espace** ; jeux de planètes, fusées, robots | **space games** ; planet games, rocket games, robot games | **juegos del espacio** ; planetas, cohetes, robots | **jogos do espaço** ; planetas, foguetes, robôs | **Weltraumspiele** ; Planetenspiele, Raketenspiele, Roboterspiele |
| monde | **jeux de géographie et d'histoire** ; drapeaux, pays, chevaliers, Antiquité | **geography games** ; history games, flags, countries, knights | **juegos de geografía** ; historia, banderas, países, caballeros | **jogos de geografia** ; história, bandeiras, países, cavaleiros | **Geografiespiele** ; Geschichtsspiele, Flaggen, Länder, Ritter |
| ville | **jeux de métiers** ; jeux de pompiers, docteur, boulanger, ville | **jobs games** ; firefighter games, doctor games, city games | **juegos de oficios** ; bomberos, médicos, ciudad | **jogos de profissões** ; bombeiro, médico, cidade | **Berufe-Spiele** ; Feuerwehrspiele, Arztspiele, Stadtspiele |
| vehicules | **jeux de véhicules** ; jeux de voitures, camions, tracteurs, trains | **vehicle games** ; car games, truck games, tractor games, train games | **juegos de vehículos** ; coches/autos, camiones, tractores, trenes | **jogos de veículos** ; carros, caminhões, tratores, trens | **Fahrzeugspiele** ; Autospiele, Lkw-Spiele, Traktorspiele, Zugspiele |
| sport | **jeux de sport** ; football, judo, gym, ski | **sports games** ; soccer games, judo, gymnastics | **juegos de deportes** ; fútbol, judo, gimnasia | **jogos de esporte** ; futebol, judô, ginástica | **Sportspiele** ; Fußballspiele, Judo, Turnen |
| cuisine | **jeux de cuisine** ; jeux de pâtisserie, de restaurant, de pizza | **cooking games** ; baking games, restaurant games, pizza games | **juegos de cocina** ; repostería, restaurante, pizzas | **jogos de culinária** ; jogos de cozinhar, confeitaria, restaurante | **Kochspiele** ; Backspiele, Restaurantspiele |

Remarques :
- `monde` regroupe « Monde et histoire » : le mot-clé principal proposé est la
  géographie (drapeaux, pays : recherches scolaires fréquentes), l'histoire en second.
- `fantasy` (« Magie et monstres ») contient aussi des jeux 13+ (horreur) : les
  textes parleront de magie et de monstres « pour tous les âges », la page 13+
  restant la seule tournée vers les ados.
- `course` (« Course ») et `vehicules` partagent « jeux de voiture » : il reste
  secondaire sur les deux pages, pour qu'elles ne se concurrencent pas.

## 4. Âges (4)

| Tranche | fr | en | es | pt | de |
| --- | --- | --- | --- | --- | --- |
| 4-6 | **jeux pour enfants de 4 à 6 ans** ; jeux maternelle, jeux éducatifs 5 ans | **games for kids ages 4-6** ; preschool games, kindergarten games | **juegos para niños de 4 a 6 años** ; juegos de preescolar | **jogos para crianças de 4 a 6 anos** ; jogos educativos infantis | **Spiele für Kinder ab 4 Jahren** ; Kindergarten-Spiele, Vorschulspiele |
| 7-9 | **jeux pour enfants de 7 à 9 ans** ; jeux éducatifs 8 ans | **games for kids ages 7-9** ; games for 8 year olds | **juegos para niños de 7 a 9 años** | **jogos para crianças de 7 a 9 anos** | **Spiele für Kinder ab 7 Jahren** ; Spiele für 8-Jährige |
| 10-12 | **jeux pour enfants de 10 à 12 ans** ; jeux pour préados | **games for kids ages 10-12** ; games for tweens | **juegos para niños de 10 a 12 años** | **jogos para crianças de 10 a 12 anos** | **Spiele für Kinder ab 10 Jahren** |
| 13+ | **jeux pour ados** ; jeux d'horreur gratuits, jeux de frissons | **games for teens** ; free horror games, scary games | **juegos para adolescentes** ; juegos de terror gratis | **jogos para adolescentes** ; jogos de terror grátis | **Spiele für Jugendliche** ; Horrorspiele kostenlos, Gruselspiele |

Titres des âges (le modèle « Jeux de <thème> » ne s'y prête pas) : fr
`Jeux pour enfants de 4 à 6 ans gratuits | Free Micro Games` (57), page 13+ :
`Jeux pour ados gratuits | Free Micro Games` ; mêmes formes dans les autres langues.

## 5. Pages école (tâche 7)

Français : programme du cycle 2 et du cycle 3 (calcul, lecture, mots, logique).
Anglais : « grade » des États-Unis. Allemand : Klasse 1 à 4 (Grundschule).
Espagnol et portugais : pas de pages école (pages d'âge seulement).

| Page | Adresse | Mot-clé principal | Secondaires |
| --- | --- | --- | --- |
| CP | `/ecole/cp/` | **jeux éducatifs CP** | jeux CP lecture, calcul CP, jeux 6 ans |
| CE1 | `/ecole/ce1/` | **jeux éducatifs CE1** | jeux de maths CE1, lecture CE1, tables d'addition |
| CE2 | `/ecole/ce2/` | **jeux éducatifs CE2** | jeux de maths CE2, tables de multiplication CE2 |
| CM1 | `/ecole/cm1/` | **jeux éducatifs CM1** | jeux de maths CM1, conjugaison, fractions |
| CM2 | `/ecole/cm2/` | **jeux éducatifs CM2** | jeux de maths CM2, révisions sixième |
| Grade 1 | `/en/school/1st-grade/` | **1st grade games** | 1st grade math games, first grade reading games |
| Grade 2 | `/en/school/2nd-grade/` | **2nd grade games** | 2nd grade math games, spelling games |
| Grade 3 | `/en/school/3rd-grade/` | **3rd grade games** | 3rd grade math games, multiplication games |
| Grade 4 | `/en/school/4th-grade/` | **4th grade games** | 4th grade math games, fractions |
| Grade 5 | `/en/school/5th-grade/` | **5th grade games** | 5th grade math games |
| Klasse 1 | `/de/schule/klasse-1/` | **Lernspiele 1. Klasse** | Mathe 1. Klasse, Lesen lernen |
| Klasse 2 | `/de/schule/klasse-2/` | **Lernspiele 2. Klasse** | Mathe 2. Klasse, Einmaleins |
| Klasse 3 | `/de/schule/klasse-3/` | **Lernspiele 3. Klasse** | Mathe 3. Klasse |
| Klasse 4 | `/de/schule/klasse-4/` | **Lernspiele 4. Klasse** | Mathe 4. Klasse |

Correspondance avec l'âge des jeux (âge minimum de `"ages"`, et champ
`"classes"` de `game.json` pour affiner) : CP / Grade 1 / Klasse 1 = 6 ans,
CE1 / Grade 2 / Klasse 2 = 7 ans, CE2 / Grade 3 / Klasse 3 = 8 ans,
CM1 / Grade 4 / Klasse 4 = 9 ans, CM2 / Grade 5 = 10 ans. Une page école n'est
publiée (et indexée) qu'avec au moins 3 jeux et ses textes validés.

## 6. Points validés

1. Les mots-clés principaux (en gras) de chaque page, et les adaptations par langue.
2. Les formes de titre par langue (section 1) et celles des âges (section 4).
3. Le mot-clé principal de `monde` (géographie plutôt qu'histoire) et de `puzzle`
   (« jeux de logique » en français plutôt que « jeux de puzzle »).
4. Les adresses des pages école (section 5).
