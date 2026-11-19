# « Poussière d'Empire » — cadrage (conquête spatiale à cinq échelles, campagne solo contre des robots)

> État : **validé par le propriétaire le 16 novembre 2026** (réponses : 10 ans et +, badge donné pour l'acte 1, dézoom du lot 1 vers la silhouette ; les autres choix par défaut de la section 16 sont retenus). Lot 1 en cours sur la branche `poussiere-lot1`. **Révisé le 18 novembre 2026 après le premier essai du propriétaire : voir la section 17, qui l'emporte sur les sections 5 (acte 1), 6, 7 (missions des capacités), 11 et 15 pour les nombres.**
> À lire avec `docs/cadrage-temps-reel.md` (section 5 : contrat `jel-sim`), `docs/cadrage-dernier-sas.md` (section 4 : simulation solo au contrat `jel-sim` avec un pilote local), `docs/cadrage-fidelisation.md` (profil joueur), `CONSIGNES-JEU.md` et `CLAUDE.md`.
> Ce document sera versionné sous `docs/cadrage-poussiere-d-empire.md` (pull request 0, document seul). Les tailles et temps donnés ici sont des estimations ; chaque pull request de lot publiera les mesures.

## 1. Ce que demande le propriétaire

| Demande | Réponse (section) |
| --- | --- |
| Conquête de territoires façon Risk, dans l'espace, à échelles emboîtées ; mobile et PC ; conventions du site | un seul moteur de graphe pour les cinq échelles (4), 2D à zoom continu (10), fiche et jaquette aux règles du site (2, 15) |
| Exception au format mini-jeu : campagne longue, progression réelle et continue | 33 missions en 5 actes, 5 à 6 heures, 10 capacités permanentes (5, 7) ; écart avec `CONSIGNES-JEU.md` posé noir sur blanc (2) |
| 5 actes obligatoires, 5 à 8 missions chacun, objectif affiché avant de commencer | 8 + 7 + 7 + 6 + 5 missions, bandeau d'une ligne sur la carte (5) |
| Dézoom animé à chaque acte, carte de campagne allumée, capacités permanentes, « plus grand » visible dès l'acte 1 | section 6 et 7 |
| Temps réel, robots qui agissent sans attendre, retour visuel immédiat, pas de temps mort | tick de 100 ms, siège visible, écran de résultat de 4 s (8, 9) |
| Reprise exacte entre deux sessions ; profil du site (XP, badges) | sauvegarde au tick près par `save.js`, `reportEnd` et `reportComplete` (11) |
| Rendu : profondeur et échelle avant la technique, fluide au tactile, choix justifié | 2D canvas, caméra continue, budget de rendu chiffré (10) |
| Aucun code d'OpenFront ; solo contre des robots ; architecture prête pour le multijoueur | contrat `jel-sim` dès le lot 1, état séparé du rendu, ordres entiers (12) |
| Trois lots, une pull request par lot, sans fusion ; document de conception d'abord | section 15 |

Décisions prises par Claude (chacune justifiée dans sa section) :

- Nom **Poussière d'Empire**, identifiant `poussiere-d-empire` : chaque monde conquis devient une poussière quand on dézoome (3).
- **10 ans et +**, genre `strategie`, univers `espace` (3).
- Le combat est un **siège sur plusieurs ticks**, visible et renforçable, jamais un calcul instantané (4).
- Les routes de l'acte 2 ont une durée qui change avec les orbites, figée au départ de chaque flotte (5).
- Dès l'acte 3, un territoire coupé de sa capitale produit à moitié : « couper une route » a un effet économique (4).
- Dix capacités, dont une automatisation de l'expansion (Essaimage) pour les cartes de 120 territoires (7).
- Pas de triche des robots : handicaps en territoires et forces de départ, écrits dans les données (8).
- « Vent dans le dos » : +10 % de forces de départ par échec sur la même mission, 30 % au plus, sans effet sur les étoiles (13).
- Vitesse ×2 dans le menu de pause, solo seulement (9).
- Lot 1 publiable seul : 8 missions, 24 étoiles, badge « jeu terminé » donné pour l'acte 1, pas de champ `consignes` (11).
- Bac à sable hors des missions, sans étoiles (5, 11).
- Script de test dédié, sans toucher au script partagé `scripts/tester-temps-reel.mjs` (14).

## 2. Contraintes du site

- Un seul `games/poussiere-d-empire/index.html` de moins de 2 Mo (visé : 450 Ko), aucune ressource externe ni réseau, images en SVG ou dessinées en canvas, sons Web Audio (aucun son avant le premier geste, bouton son mémorisé), `alert`/`confirm`/`prompt`/`window.open` interdits.
- 5 langues : aucun mot en dur. Tout texte visible est en HTML avec `data-i18n` ou passe par `t()` ; **le canvas ne porte que des chiffres** (`JEL_I18N.nombre`) et des formes, jamais un mot : `check-i18n.js` passe sans surprise. Textes dans `i18n-jeu/<id>/fr.json` puis `en`, `es`, `pt`, `de`, assemblés par `node scripts/i18n-jeu.mjs --assembler <id>`. Noms de factions et de lieux : liste fermée traduite, aucun nom généré par syllabes.
- Sauvegarde par `public/save.js` seulement (`JEL_SAVE`, clé `save_poussiere-d-empire`, 100 000 caractères au plus, limite tenue par `play.js` et `save.js`) : la campagne et la mission en cours doivent y tenir ; fenêtre « Continuer / Nouvelle partie / Effacer la sauvegarde » au bouton « Jouer ».
- Profil joueur : XP du temps de jeu mesurée par le lanceur (rien à faire) ; `FMG.reportEnd` à chaque fin de mission ; `FMG.reportComplete({ stars, maxStars })` quand toutes les missions publiées sont gagnées, `maxStars` égal à `"etoiles"` de `game.json` (le serveur refuse un autre nombre, `functions/_profil.js`) ; aucun autre canal.
- Règle des 20 niveaux : `validate-games.mjs` ne compare `"niveaux"` et `window.JEL_NIVEAUX` qu'avec `"consignes": 2`. Le lot 1 n'a que 8 missions : pas de `consignes` au lot 1, posé à 2 au lot 2 (22 missions). `window.JEL_NIVEAUX = MISSIONS.length` dès le lot 1.
- `validate-games.mjs` refuse les blocs `jel-tr` et `jel-sim` sans `"temps_reel": true`. Le jeu est solo : la simulation vit dans `<script id="pe-sim">` et un pilote local la fait tourner, exactement comme `sas-sim` dans la version 1 du Dernier Sas.
- Jaquette `cover.webp` 600 × 800 sans texte ; textes de la page dans `game.json` aux bornes de `scripts/regles-seo.mjs` ; genre et univers dans les listes fermées de `public/taxonomie.js`.
- **Écart assumé avec `CONSIGNES-JEU.md`, section 2** (« un niveau dure 1 à 2 minutes », 20 niveaux) : les missions durent 2 à 15 minutes et le lot 1 en compte 8. Contrepartie : sauvegarde au tick près toutes les 30 s et à la fermeture, pause, vitesse ×2. À valider avec ce document, comme `sans_fin` l'a été pour Le Dernier Sas.
- Public : un jeu de moins de 13 ans interdit la violence réaliste et la peur. Ici, des forces chiffrées, des territoires qui changent de couleur, aucune mort montrée.

## 3. Le jeu

**Nom** : Poussière d'Empire (`poussiere-d-empire`) ; Empire Dust, Polvo de Imperio, Poeira de Império, Sternenstaub-Imperium. Aucun titre voisin parmi les 183 jeux.

**Pitch** : tu commences avec vingt escouades sur une planète inconnue et tu finis à la tête d'un empire qui compte les galaxies par milliers. À chaque échelle, les mêmes gestes : toucher un territoire, glisser vers un voisin, envoyer tes forces, assiéger, tenir, produire. Le décor, les rivaux et les enjeux grandissent à chaque acte, et tout ce que tu as pris avant reste là, réduit à un point lumineux dans ta capitale. La carte vit sans toi : les factions s'étendent pendant que tu hésites.

**Univers visuel** : un atlas céleste en aplats vectoriels sur l'indigo du site (design « Planètes »), territoires aux bords lumineux, chiffres en gros, trois couches d'étoiles en parallaxe. Ton calme et émerveillé (« chaque point est un monde ») : on annexe, on rallie, on tient ; on ne tue pas. Chaque faction a une couleur **et** un glyphe géométrique dessiné sur ses flottes et hachuré sur ses territoires (joueurs daltoniens), jamais une lettre ni un chiffre. Tout est inventé.

| Faction | Couleur, glyphe | Acte | Caractère |
| --- | --- | --- | --- |
| L'Aube (le joueur) | turquoise, disque | tous | colonie fondée par des « semeurs » ; son emblème gagne un anneau par acte fini |
| Les Cendrés | ocre rouille, triangle | 1 | prudents, fortifient |
| Les Pionniers | sable, petit carré | 1 | petite colonie opportuniste, ne vise que les neutres |
| La Guilde des Anneaux | ambre, anneau | 2 | marchands, aiment les géantes, lents et riches |
| Les Essaims | vert acide, trois points | 2 | pillards de la ceinture, rapides, défense faible |
| L'Hégémonie de Vair | violet, losange | 3 | empire déjà étendu, méthodique, forteresses, offensives annoncées |
| Les Veilleurs | bleu pâle, croissant | 3 | allié à défendre |
| Le Silence | gris nacré, hexagone | 4 | seul rival galactique, attaque par vagues annoncées |
| Les Lointains, la Marée, les Fileurs, l'Écho | 4 teintes, étoile, vague, double trait, double cercle | 5 | rivaux tirés d'une liste fermée, se battent aussi entre eux |

**Âge conseillé : `"ages": "10+"`.** Lecture de carte, production, défense, trajets, jusqu'à quatre rivaux et des missions de 5 à 15 minutes : hors de portée du public 7-9 ans des Petites Planètes (7+, un geste, deux camps). Rien n'impose le 13+ de Nova Dominion (chars, bombardiers) : conquête abstraite, aucune peur. Un 10+ reste visible dans les Nouveautés et les Tendances de l'accueil, ce qu'un 13+ perdrait. Catalogue lu le 16 novembre : la tuile 10-12 ans compte 14 jeux (9 en 10+, 5 en 12+) ; ce n'est plus un argument de rareté, mais ce public reste peu servi en jeux longs. Voisins de stratégie examinés : Conquête la MapMonde (10+, conquête de régions en temps réel, 24 niveaux, royaume médiéval), Vallée des Clans (8+), Ludus Coriovalli (10+, pions), Petites Planètes et Nova Dominion ; aucun ne joue sur des échelles emboîtées ni n'offre une campagne à capacités permanentes.

## 4. Règles de conquête communes aux cinq échelles

Un seul moteur : un graphe de territoires (nœuds) et de routes (arêtes). Les cinq actes ne changent que les données. Tick de 100 ms, délai d'entrée de 1 tick.

**Territoire** `i` : propriétaire `p[i]` (−1 neutre, 0 joueur, 1 à 5 rivaux), forces `f[i]` (entier, 0 à `cap`), accumulateur `acc[i]` (millièmes), bâtiment `b[i]` (0 rien, 1 fortin, 2 relais, 3 chantier), type `t[i]` (dans la carte). Un type donne `prod` (millièmes de force par tick), `def` (bonus de défense en %), `cap` (plafond de forces), `vit` (vitesse des routes qui en partent, en %).

**Production**, chaque tick, pour tout territoire possédé avec `f < cap` : `acc += prod × (100 + bonus) / 100` (division entière) ; tant que `acc ≥ 1000` : `f += 1`, `acc −= 1000`. Un neutre ne produit pas. Bonus de camp : Arrière-pays (+20 si tous les voisins sont à toi), Chantier (+60 sur le nœud), Sursaut (×3 pendant 100 ticks). **Ravitaillement** (dès l'acte 3, joueur et robots) : un territoire non relié à la capitale de son camp par ses propres territoires produit à moitié ; capitale perdue, tout le camp produit à moitié jusqu'à sa reprise (recalculé tous les 10 ticks).

**Voisinage et trajets** : deux territoires sont voisins s'ils partagent une arête (grille hexagonale à l'acte 1 ; ensuite routes tirées de la graine, 2 à 4 par nœud, graphe connexe garanti). Longueur d'une arête en ticks : `L = max(5, min(40, dist × 10 / V))`, `V` vitesse de l'échelle, puis `× 100 / vit` du nœud de départ et `/ 2` s'il porte un relais. À l'acte 2, `dist` est lue sur les positions courantes des corps (orbites qui tournent) et `L` **figée au départ** de la flotte : la durée s'affiche sur la route avant d'envoyer.

**Envoi** : ordre `[1, de, vers, pct]`, `pct ∈ {25, 50, 75, 100}` ; `n = max(1, f[de] × pct / 100)` forces partent, **il reste toujours 1 force** (garnison minimale). Une flotte `{ i, c, n, d, v, q, L }` avance d'un tick par tick (`q`), arrive quand `q = L`. Sans Transfert, `vers` doit être voisin ; avec, jusqu'à 3 arêtes à travers tes propres territoires (chemin le plus court, `L` = somme). Les flottes ne s'interceptent pas : tout se résout à l'arrivée, dans l'ordre des identifiants. Arrivée chez soi ou chez un allié : `f[vers] += n`.

**Siège** (arrivée sur un territoire neutre ou ennemi) : la flotte devient un siège `{ i, c, n }` (un par nœud et par camp ; une flotte suivante du même camp s'y ajoute). Chaque tick, avec `def = def du type + 50 si fortin` (0 pendant une Frappe de rupture) et `D = f[i] × (100 + def) / 100` :

```text
f[i] −= max(1, A × 10 / (100 + def))      l'assiégeant enlève 10 % de ses forces en points de défense
A    −= max(1, D × 12 / 100)              le défenseur enlève 12 % de sa défense effective
f[i] ≤ 0 : prise. p[i] = c, f[i] = max(1, A), acc = 0, fortin détruit, relais et chantier conservés ;
           les autres sièges du nœud continuent contre le nouveau maître.
A ≤ 0    : siège levé.
```

Repères : à forces égales en plaine, **le défenseur tient** (15 ticks, il garde environ 40 %) ; il faut 1,1 contre 1 pour prendre une plaine, 1,7 derrière un fortin (+50), 2,25 avec +100 (montagne fortifiée, station), 2,8 avec +150 ; 2 contre 1 en plaine prend en 6 ticks avec 82 % des forces (repères vérifiés par simulation de la formule, à 0,05 près) : concentrer paie, Rallier sert. Le territoire assiégé produit toujours : un siège trop faible s'enlise, des renforts des deux côtés s'ajoutent en cours de siège. Tout est additif, aucun carré : aucune limite d'entier.

**Autres ordres** : `[2, nœud, type]` construire (fortin 30, relais 50, chantier 60 forces du nœud, un bâtiment par nœud) ; `[3, nœud]` Rallier ; `[4, nœud]` Frappe de rupture ; `[5, a, b]` Pont stellaire ; `[6]` Sursaut ; `[7, 0|1]` Essaimage. Quatre entiers au plus. `valide` refuse sans erreur tout ordre d'une capacité absente du masque `tech` du camp.

**Objectifs** (type dans l'état, évalué par `fin`) : conquérir X % ou X territoires ; prendre une liste de nœuds ; atteindre un nœud (y poser une force) ; tenir des nœuds pendant T ; survivre T puis reprendre X % ; éliminer des camps ; couper (posséder des passages pendant T) ; course (prendre avant un rival). Défaite : plus aucun territoire, flotte ni siège au joueur, ou temps `tmax` écoulé (sauf « tenir » et « survivre », où c'est la victoire), ou allié à défendre tombé. **Étoiles** : 1 victoire, 2 sous le temps visé, 3 objectif secondaire affiché avant la mission (capitale jamais perdue, nœud précis pris, jamais sous un seuil de territoires…). Score d'un camp : `10 × territoires + forces / 10`.

## 5. Les cinq échelles

Chaque mission commence par un bandeau d'une ligne (objectif, secondaire, temps visé) posé sur la carte déjà générée, jamais un écran de texte. Durées visées pour un joueur moyen (2e étoile). Unités renommées par acte : escouade, flotte, armada, légion, essaim. Production ×2 par acte, formules inchangées.

**Acte 1, la planète** (version du lot 1, remplacée par la planète persistante de la section 17 ; 12 à 40 régions : grille hexagonale de rayon 2 à 4 avec des mers retirées ; 6 voisins au plus). Générateur (règles arrêtées au lot 1, après mesure des taux de victoire) : la capitale du joueur est en bas de la carte, les rivaux sont posés le plus loin possible d'elle, à 3 cases au moins les uns des autres et de la balise ; une mer n'est retirée que si elle ne crée ni déconnexion ni case d'articulation (un passage d'une seule case figeait des parties entières derrière une montagne fortifiée), le reste du quota en gardant seulement la connexité. Types : plaine (prod 100, def 0, cap 400), montagne (60, +50), cratère riche (160), calotte polaire (100, vit 50), capitale (250, +25, cap 600). Enjeu : dominer la planète face aux Cendrés ; tutoriel par l'action, une nouveauté par mission, graine fixe pour les missions 1 à 3.

| N° | Mission | Objectif affiché | Nouveauté, capacité | Durée |
| --- | --- | --- | --- | --- |
| 1 | Premiers pas | prendre 5 régions neutres (12 régions) | toucher puis glisser, production | 2 min |
| 2 | Les cratères | prendre les 3 cratères riches | types de terrain, pourcentage d'envoi | 3 min |
| 3 | La chaîne | prendre les 4 montagnes | défense, siège visible ; **Rallier** | 3 min |
| 4 | Face aux Cendrés | 60 % des régions contre les Cendrés (niv. 1) | un rival qui s'étend, perte de territoire | 4 min |
| 5 | Le siège | tenir la capitale 3 min contre des assauts à trois fois tes forces | flottes ennemies en route ; **Fortin** | 3 min |
| 6 | Le pôle | atteindre la balise au-delà de la calotte | routes lentes | 4 min |
| 7 | Deux fronts | éliminer les Cendrés pendant que les Pionniers grignotent | trois camps ; **Transfert** | 5 min |
| 8 | Maîtres de la planète | 40 régions : éliminer Cendrés (niv. 2) et Pionniers | tout se mélange ; **Arrière-pays** ; dézoom | 6 min |

**Acte 2, le système** (12 à 24 corps sur 4 à 6 orbites qui tournent : angle entier, un pas de la table de 64 directions tous les 20 à 60 ticks selon l'orbite). Types : planète tellurique (prod 200, def 0, cap 1 500), géante gazeuse (300, vit 50 : riche mais lente à quitter), ceinture d'astéroïdes (80, def −25, vit 200 : rapide mais indéfendable), lune glacée (60, +50), station orbitale (0, +100, vit 200 : plaque tournante), planète mère (400, +25, cap 2 000 : ta planète de l'acte 1). Rivaux : Guilde des Anneaux, Essaims.

| N° | Mission | Objectif affiché | Nouveauté, capacité | Durée |
| --- | --- | --- | --- | --- |
| 9 | Première orbite | prendre les 4 corps de l'orbite intérieure | trajets visibles, orbites qui tournent, durée affichée | 3 min |
| 10 | La géante | prendre la géante de la Guilde | caractères des corps | 5 min |
| 11 | La ceinture | tenir au moins 6 corps pendant 4 min face aux Essaims | ceinture rapide ; **Relais** | 5 min |
| 12 | Le comptoir | prendre la station (+100) | concentration, fenêtre de transfert | 5 min |
| 13 | Les lunes glacées | atteindre la lune lointaine avant la Guilde | course sur une même cible | 5 min |
| 14 | Blocus | posséder les 4 passages entre la Guilde et ses géantes pendant 2 min | objectif « couper » ; **Chantier** | 6 min |
| 15 | Le système entier | éliminer Guilde et Essaims (niv. 2) | dézoom | 8 min |

**Acte 3, les systèmes voisins** (40 à 80 systèmes reliés par des hyperlanes). Types : naine rouge (prod 200, +25), binaire (600), nébuleuse (300, vit 50), pulsar (400 ; ses routes se ferment 50 ticks toutes les 200, les flottes engagées attendent), relais (100, vit 200), forteresse (150, +100), système natal (800, +25). Règle nouvelle : le ravitaillement (section 4). L'Hégémonie de Vair tient 40 % de la carte au départ ; les Veilleurs sont un camp allié (tes flottes le renforcent, tu ne peux pas l'attaquer).

| N° | Mission | Objectif affiché | Nouveauté, capacité | Durée |
| --- | --- | --- | --- | --- |
| 16 | Le voisin | 60 % des systèmes | rival déjà étendu, ravitaillement | 6 min |
| 17 | Les binaires | prendre 3 systèmes binaires | nébuleuses ; **Frappe de rupture** | 6 min |
| 18 | Le système assiégé | les Veilleurs tiennent 5 min | défendre un allié | 6 min |
| 19 | Le pulsar | prendre le relais central malgré les routes qui se ferment | pulsar | 7 min |
| 20 | Couper la route | tenir 2 min les 2 hyperlanes du cœur de Vair (ses systèmes derrière produisent à moitié) | couper a un effet économique | 8 min |
| 21 | L'expédition | depuis un seul système, prendre et tenir 2 min la forteresse de Vair | forces finies loin de chez soi | 8 min |
| 22 | Le Vair s'effondre | éliminer l'Hégémonie (niv. 3) sur 80 systèmes | dézoom | 10 min |

**Acte 4, la galaxie** (60 à 120 secteurs le long de 3 à 5 bras spiraux, ponts rares entre bras, cœur relié à tous les bras). Types : bras dense (prod 800), bras clairsemé (400, vit 150), halo (300, +50), amas globulaire (300, +100), cœur galactique (2 400, +50, cap 10 000), capitale héritée. Un seul rival, le Silence, qui attaque toute sa frontière toutes les 90 s, annoncé 5 s avant (onde et son).

| N° | Mission | Objectif affiché | Nouveauté, capacité | Durée |
| --- | --- | --- | --- | --- |
| 23 | Le premier bras | prendre les 14 secteurs d'un bras | bras et halo, vagues annoncées | 8 min |
| 24 | Le pont | relier deux bras et tenir le pont 2 min | **Pont stellaire** | 8 min |
| 25 | L'amas | prendre l'amas globulaire | défendre à grande échelle | 10 min |
| 26 | Le cœur | prendre le cœur galactique | **Essaimage** | 10 min |
| 27 | Trois bras | 75 % de 120 secteurs contre le Silence (niv. 3) | | 12 min |
| 28 | Le Silence se tait | éliminer le Silence sur 120 secteurs | dézoom | 12 min |

**Acte 5, au-delà** (40, 80 ou 120 galaxies sur des filaments). Types : spirale (prod 1 600), elliptique (2 400, vit 50), naine (600, vit 200), amas de galaxies (1 200, +100), grand vide (arête de longueur 40). Jusqu'à 4 rivaux, tirés de la liste fermée, qui se battent aussi entre eux.

| N° | Mission | Objectif affiché | Nouveauté, capacité | Durée |
| --- | --- | --- | --- | --- |
| 29 | Un point parmi des milliers | 50 % de 40 galaxies contre 2 rivaux | rivaux entre eux ; **Sursaut** ; bac à sable débloqué | 10 min |
| 30 | Le filament | prendre les 8 galaxies d'un filament avant les rivaux | grands vides | 10 min |
| 31 | Les amas | prendre 3 amas contre 3 rivaux | | 12 min |
| 32 | Le grand vide | survivre 8 min avec une seule galaxie contre 4 rivaux, puis reprendre 30 % | | 12 min |
| 33 | L'horizon | 120 galaxies, 4 rivaux (niv. 3), élimination totale | fin de campagne, dézoom ultime | 15 min |

**Bac à sable** (hors missions, sans étoiles, débloqué à la mission 29) : taille 40 / 80 / 120, 1 à 4 rivaux, niveau 1 à 3, graine affichée pour rejouer la même carte. Il ne compte ni dans `niveaux` ni dans `etoiles` : un mode réglable ne doit pas peser sur le classement des étoiles.

## 6. Passage d'échelle et progression ressentie

> **Remplacé au lot 2 (voir section 18)** : plus d'héritage lié aux étoiles. La capitale d'un acte a les seules valeurs de son type ; une mission ne dépend que de son numéro. Le paragraphe suivant décrit l'intention de départ.

**Règle de passage** : à la victoire de la dernière mission d'un acte, toute la carte de l'acte devient un seul nœud de l'acte suivant, ta capitale, de type « capitale héritée » : `prod` de la capitale de la nouvelle échelle × (100 + étoiles de l'acte fini) / 100 (jusqu'à +24 %), `def +25`. Les capacités restent ; les rivaux vaincus disparaissent ; les nouveaux viennent des données de la mission. L'héritage est **figé au passage** : rejouer une mission d'un acte fini pour gagner des étoiles ne change pas un acte déjà commencé. Rejouer une mission se fait avec les capacités de sa fiche (celles gagnées avant elle), jamais celles acquises plus tard : les étoiles restent comparables.

**Dézoom animé** (4 s, un toucher pour passer ; 1 s en fondu si `prefers-reduced-motion`) : la carte finie est cuite dans un canvas hors écran ; la caméra s'éloigne (zoom de 1 à 0,03, courbe cubique) pendant que les trois couches d'étoiles glissent à des vitesses différentes et que la carte suivante apparaît en fondu ; l'image de l'ancienne carte rétrécit jusqu'au nœud qui devient la capitale, où elle se fige en médaillon ; un bandeau nomme l'échelle qui s'ouvre et le titre gagné (Gouverneur, Amiral, Consul stellaire, Régent galactique, Voix de l'Horizon). À la mission 33, le dézoom traverse les cinq cartes emboîtées (12 s). Un bouton « Revoir » sur la carte de campagne rejoue chaque dézoom. **Au lot 1**, la carte suivante est une silhouette du système tirée d'une table de `PE_DONNEES` (6 orbites, 14 corps gris, ta planète en turquoise), avec « Acte 2 : bientôt » : aucun générateur de l'acte 2 n'est requis.

**Ce qui reste visible réduit à un point** : chaque acte fini est gardé dans la campagne sous la forme `{ a, g, p, e }` (acte, graine, propriétaires finaux en base 36, un caractère par territoire, étoiles), 150 caractères au plus. La capitale héritée porte un médaillon : la carte précédente redessinée depuis cette chaîne et la graine, visible en zoomant ; au zoom normal, un point turquoise cerné d'un anneau par acte. Toucher la capitale ouvre « Mes mondes » : les cartes des actes précédents, emboîtées jusqu'à la première planète, sans aucune donnée de plus à sauvegarder.

**Carte de campagne** : une constellation de 33 étoiles en 5 groupes nommés (La planète, Le système, Les systèmes voisins, La galaxie, Au-delà), visibles dès le premier lancement ; mission gagnée allumée (teinte selon ses étoiles, temps affiché), mission en cours qui pulse, actes à venir en silhouette ; toucher une étoile allumée la rejoue (sélection des niveaux). Capacités gagnées alignées en haut, celles à venir en silhouette.

**Le plus grand dès l'acte 1**, par quatre moyens : le fond de la carte planétaire montre l'horizon courbe, le soleil et deux planètes sœurs qui dérivent en parallaxe, et un cargo de la Guilde passe au bord à chaque mission (rendu seul ; à la mission 8, un éclaireur se pose 20 s sur une région libre) ; un bouton **Horizon** (44 px, toujours visible) dézoome en 1,5 s vers la carte grisée de l'acte suivant (« Acte 2 · verrouillé ») et revient, et pincer au-delà du zoom minimal fait la même chose ; la carte de campagne montre les cinq actes ; l'écran de résultat affiche la **part de l'univers connu** (territoires conquis sur le produit des tailles des cinq échelles : environ 0,000 000 5 % après la mission 1, barre logarithmique à cinq graduations, nombre absurde qui grandit pourtant). Récompenses : 99 étoiles, 10 cartes de capacité, 5 titres sur l'écran titre, un anneau par acte sur l'emblème de l'Aube, médaillons « Mes mondes », et côté site le badge « jeu terminé », le total d'étoiles et le classement des étoiles sur la page du jeu.

## 7. Capacités permanentes

Masque de bits `tech` par camp dans l'état (rejeu et robots les voient). Une carte se retourne à l'écran de résultat quand elle est gagnée, puis une démonstration de 3 s au début de la mission suivante. Les robots reçoivent les capacités écrites dans la fiche de la mission (les actives seulement au niveau 3).

| Capacité | Gagnée à | Effet sur la façon de jouer |
| --- | --- | --- |
| Rallier | mission 3 | ordre `[3, n]` : chaque voisin possédé envoie 50 % vers `n`. Un geste remplace six envois, indispensable au-delà de dix territoires. |
| Fortin | mission 5 | bâtiment, 30 forces, défense +50 ; détruit à la prise. Tenir un col avec peu de forces, attaquer avec le reste. |
| Transfert | mission 7 | envoyer jusqu'à 3 arêtes à travers ses territoires. L'arrière renforce le front sans relais humain, dès 40 régions. |
| Arrière-pays | mission 8 | passif : +20 % de production aux territoires dont tous les voisins sont à toi. Un empire compact vaut plus qu'une dentelle. |
| Relais | mission 11 | bâtiment, 50 forces, routes qui partent du nœud deux fois plus rapides. On dessine ses axes. |
| Chantier | mission 14 | bâtiment, 60 forces, production +60 %. Choisir où investir. |
| Frappe de rupture | mission 17 | ordre `[4, n]`, recharge 60 s : la défense du nœud tombe à 0 pendant 10 s. Les forteresses deviennent prenables au bon moment. |
| Pont stellaire | mission 24 | ordre `[5, a, b]`, 150 forces, une fois par 30 s : nouvelle route entre deux de tes territoires (distance ≤ 1,5 × arête moyenne). Le joueur change la carte. L'arête vit dans l'état (`pont`), hachée et sauvegardée. |
| Essaimage | mission 26 | interrupteur `[7, 0|1]` : un territoire au plafond envoie seul 25 % vers son voisin neutre le plus faible (un envoi automatique par tick sur toute la carte). À 120 territoires, on dirige les fronts, pas chaque case. |
| Sursaut | mission 29 | ordre `[6]`, recharge 90 s : production ×3 pendant 10 s partout. Un bouton de renversement avant une offensive. |

## 8. IA des robots

`bot(etat, camp, niveau, alea) → ordres` (8 au plus), fonction pure, appelée comme le fait `Simulation.avancer` du moteur : au tick `k`, le camp `c` réfléchit si `(k + 3 × c) % 5 === 0` (un camp par tick, coût borné) ; les cadences ci-dessous comptent en **appels**, pas en ticks.

Décision en trois passes sur les nœuds possédés : **attaque** : pour chaque nœud avec `f > garnison` (`max(2, prud % de f)`) et chaque voisin non possédé, valeur `V = 2 × prod + 300 si cible de mission ou capitale + 50 × voisins déjà à moi`, coût `C = D × 110 / 100 + 2 × L` ; il attaque le meilleur `V / C` si `f − garnison ≥ D × ratio / 100 + 1`, avec le plus petit pourcentage qui suffit ; **défense** : si une flotte ou un siège ennemi menace mon nœud `j` au-delà de sa défense effective, Rallier sur `j` (avec la capacité) ou envoi de 50 % des voisins ; **logistique** : un nœud intérieur avec `f > 20` envoie 50 % vers le nœud de front le plus menacé (forces ennemies adjacentes + flottes en approche). Une mémoire de 4 entiers par camp (cible, ticks avant réévaluation) évite les revirements.

| Niveau | Ratio d'attaque | Décisions sautées (`alea`) | Portée | Actives |
| --- | --- | --- | --- | --- |
| 1 | 180 | une sur deux | 1 arête | non |
| 2 | 130 | une sur cinq | 1 arête | Rallier, Transfert |
| 3 | 110 | aucune | 2 arêtes | toutes : Frappe avant une forteresse, Sursaut quand trois attaques sont prêtes |

Personnalités (vecteurs de données dans `PE_DONNEES`) : Cendrés prudents (prud 30, fortin dès 40 forces) ; Pionniers (neutres et nœuds à `f ≤ 3` seulement) ; Guilde cupide (`V` pèse 4 × prod, décide une fois sur deux) ; Essaims (ratio −20, visent la ceinture) ; Hégémonie méthodique (front compact, chantiers, offensive de 100 % de trois systèmes toutes les 120 s annoncée 10 s avant) ; Silence cyclique (toute la frontière toutes les 90 s, annoncé 5 s avant) ; rivaux de l'acte 5 : une des quatre premières personnalités tirée de la graine. Garde-fous : aucun robot ne triche (pas de production cachée, pas de vision de plus, handicaps en territoires et forces de départ écrits dans la fiche) ; le niveau 1 attaque à 1,8 fois la défense et laisse des trous, le niveau 3 attaque à 1,1 mais se fait punir par une Frappe bien placée ; les taux de la section 13 le vérifient.

## 9. Dynamisme et retours visuels

- **Temps réel strict** : 10 ticks par seconde quoi qu'il arrive ; les robots décident toutes les 0,5 s ; la production défile sur chaque territoire ; les flottes glissent avec une traînée ; les sièges tournent. Une mission sans aucun ordre se perd en deux à quatre minutes contre un robot de niveau 2.
- **Retour immédiat** avant l'application de l'ordre (un tick plus tard) : toucher illumine le territoire et fait pulser ses voisins ; glisser trace une flèche avec le nombre qui va partir (rouge barrée hors voisinage) ; lâcher fait partir un fantôme de flotte à l'instant, remplacé par la vraie 100 ms après. Siège : anneau qui rétrécit, les deux nombres au centre (le joueur apprend la formule en la voyant). Conquête : éclat de particules de la couleur du vainqueur, compteur de territoires qui saute, carillon. Perte : bord rouge 600 ms puis recoloration, note grave. Attaque entrante : lisière qui pulse, flèche de bord d'écran vers la menace hors champ. Offensives annoncées : onde et son 5 à 10 s avant.
- Les effets viennent de `etat.ev`, le tableau d'événements du tick (conquête, perte, arrivée, siège, bâtiment, annonce) que `pas()` vide au début du tick puis remplit : déterministe, haché, lu par le rendu et jamais modifié par lui.
- **Enchaînement** : écran de résultat de 4 s (étoiles une à une, temps, carte de capacité, part de l'univers), « Mission suivante » actif dès la première image, départ automatique après 6 s sauf toucher ; la mission suivante est déjà générée (moins de 20 ms). Défaite : « Réessayer » relance en moins d'une seconde avec le vent dans le dos. Entre deux actes, le dézoom mène directement au bandeau de la première mission suivante.
- **Pause** : bouton visible, Échap ou P, automatique à `visibilitychange` ; menu Reprendre, Recommencer, Vitesse ×1 / ×2 (solo : le pilote joue deux ticks par 100 ms, la simulation ne change pas ; absente en ligne), Son, Accueil. Rien ne s'exécute en pause.
- Sons Web Audio courts (départ, arrivée, prise, perte, capacité, étoile), `AudioContext` créé au premier geste, choix mémorisé dans `options`.

## 10. Rendu et commandes

**Choix : 2D sur un seul canvas, caméra continue (x, y, zoom de 0,03 à 3), indices de profondeur par parallaxe.** Territoires en polygones (acte 1 : hexagones aux sommets tremblés, tremblement tiré de la graine côté rendu) puis en disques reliés par des routes (actes 2 à 5). Justifications : le sentiment d'échelle vient du zoom continu et du dézoom (une seule animation de caméra, la carte finie rétrécit jusqu'à devenir un nœud de la suivante), pas du relief ; au tactile, des cibles plates garantissent 44 px par un **zoom plancher calculé par carte** (44 px ÷ diamètre de la plus petite cellule) et une sélection au centroïde le plus proche à moins de 28 px, impossible sur une sphère 3D qui déforme les bords ; Les Petites Planètes (220 Ko) tourne en 2D à 60 images par seconde sur téléphone là où la 3D du Dernier Sas pèse 859 Ko pour un décor ; aucune bibliothèque. Le rendu interpole entre l'état du tick précédent et le courant (`alpha` = temps écoulé / 100 ms) ; les flottants n'existent que là.

**Budget de rendu** (cible ≤ 8 ms par image à ×4 de ralentissement du processeur dans Edge, soit 60 images par seconde sur un Android moyen) : couche statique (remplissages, lisières, hachures) cuite dans un canvas hors écran par palier de zoom et recuite seulement pour le territoire qui change (20 recuissons par seconde au plus) ; trois niveaux de détail selon la taille à l'écran (polygone + lisière + glyphe + nombre ; polygone + lisière ; disque de 3 à 8 px) ; flottes, lueurs et traînées en sprites précuits (zéro `shadowBlur`, zéro dégradé créé par image) ; ≤ 160 `fillText` ; ≤ 300 particules, réduites par paliers de 100 si deux images dépassent 20 ms ; ciel en trois canvas hors écran de 1 024² en parallaxe ; mouvements réduits : pas de parallaxe, pas de secousse, particules divisées par deux. Panneau de mesure (ms par image, ms par tick, sprites, particules) ouvert par trois touchers sur le numéro de version.

**Interface sur 390 × 844** : HUD en HTML au-dessus du canvas (boutons de 44 px, `data-i18n`) : en haut, bandeau objectif + chrono + compteur de territoires ; en bas, les quatre pourcentages 25 / 50 / 75 / 100 (le choisi reste), jusqu'à quatre boutons de capacité, Horizon, pause. Le canvas ne porte que la carte et les nombres. Paysage : la carte prend la largeur, les boutons passent à droite. Allemand à 360 px : boutons à retour de ligne, bandeau sur deux lignes.

**Commandes** : au doigt, toucher un territoire à soi puis glisser vers un voisin (ou toucher la cible), appui long pour construire, deux doigts pour pincer, glisser à vide pour déplacer ; à la souris, les mêmes gestes, molette pour zoomer, clic droit = envoyer 100 % ; au clavier, Tab et flèches entre territoires, Espace choisir, Entrée envoyer, 1 à 4 pourcentage, R rallier, F fortin, B bâtiment suivant, H Horizon, Échap ou P pause. Tutoriel animé des missions 1 à 3 : une main qui touche puis glisse, 3 étapes au plus ; chaque capacité est démontrée de la même façon à sa première apparition.

## 11. Persistance et profil joueur

**Sauvegarde** par `JEL_SAVE` seulement, une seule écriture structurée :

```text
{ v: 1, niveau: <première mission non gagnée, 1 à 33>, score: <total des meilleures étoiles>,
  options: { son, vitesse, aide },
  camp: { ver: 1, et: [33 entiers 0 à 3], ec: [33 échecs, 0 à 3], tech: <masque>, actes: [{ a, g, p, e }], titre: 0 à 5 },
  mission: null | { m, g, v: <vent>, k: <tick>, snap: <exporter(etat)>, h: <hachage FNV-1a> } }
```

La carte n'est jamais sauvegardée : `importer` la régénère depuis `m` et `g`, puis pose l'état par-dessus (`pont` compris). Taille estimée sur la pire carte (acte 4, 120 nœuds, 300 flottes, 60 sièges) : campagne ≤ 2 000 caractères, instantané ≈ 17 000 (8 tableaux de 120 entiers ≈ 4 000 ; flottes 300 × 35 ≈ 10 500 ; sièges, camps, objectif < 2 500), soit moins de 20 000 caractères, cinq fois sous la limite ; le test automatique exige < 25 000 et un repli existe : au-delà de 60 000, seule la campagne est écrite et la mission reprend au début. **Moments d'écriture** : au départ de la mission (`k = 0`), toutes les 30 s pendant la mission, à chaque fin de mission (campagne mise à jour, `mission` remise à `null`), à la fermeture par `surFermeture` ; jamais depuis l'écran titre, jamais avec un `niveau` inférieur à celui lu. **Reprise** : « Continuer » régénère la carte, restaure l'état au tick `k`, vérifie `h` (différent : la mission repart au début, campagne intacte). **Parcours des contrôles** : « Jouer » sans sauvegarde lance directement la mission 1 (pas la carte de campagne) ; « Continuer » ouvre directement la mission `niveau` ; une sauvegarde sans champ `camp` (celle que pose `tester-sauvegarde.mjs` : `{ v: 1, niveau: 3, score, options: {} }`) est lue comme « missions 1 à `niveau − 1` gagnées à 1 étoile » : le test passe.

**Profil du site** : `if (window.FMG) window.FMG.reportEnd({ completed, level: <mission 1 à 33> })` une fois, dans la fonction qui ouvre l'écran de résultat ; bac à sable : `reportEnd({ completed, level: <score du joueur> })`. `if (window.FMG) window.FMG.reportComplete({ stars: somme de camp.et, maxStars: 3 × MISSIONS.length })` à l'écran de victoire quand toutes les missions publiées ont été gagnées au moins une fois, puis à chaque nouvelle victoire (le site garde le meilleur).

| | Lot 1 | Lot 2 | Lot 3 |
| --- | --- | --- | --- |
| Missions publiées | 8 (acte 1) | 22 (actes 1 à 3) | 33 |
| `"niveaux"`, `window.JEL_NIVEAUX` | 8 | 22 | 33 |
| `"etoiles"` (`node scripts/etoiles-jeu.mjs <id> <n>`) | 24 | 66 | 99 |
| `"consignes"` | absent (8 < 20) | 2 | 2 |
| `"version"` (`node scripts/version-jeu.mjs <id>`) | 1 | 2 | 3 |
| `reportComplete` | 8 missions gagnées, `maxStars` 24 | 22, 66 | 33, 99 |
| Capacités livrées | 4 | 7 | 10 |
| Textes de la page (`regles` donne le nombre réel de missions, `presentation` les actes publiés) | écrits | réécrits, 5 langues, `i18n-jeu.mjs --meta`, `maj` | réécrits |

**Décision pour le lot 1, et sa justification** : le badge « jeu terminé » est donné pour l'acte 1 seul. Un lot « publiable seul » doit pouvoir être terminé par ses joueurs ; le serveur exige que `maxStars` égale le `etoiles` du catalogue et le lanceur re-télécharge le jeu à chaque `version`, donc client et catalogue restent d'accord ; `majBadges` (`functions/_profil.js`) n'ajoute que des badges, et le site garde le meilleur total d'étoiles : un joueur à 24 sur 24 garde son badge et continue à gagner 5 XP par étoile nouvelle aux lots suivants. L'alternative (appel seulement à la 33e mission) laisserait la page du jeu sans classement pendant deux lots.

## 12. Architecture

```text
index.html
├─ jel-i18n-textes, jel-i18n, jel-sauvegarde   (modules communs, posés par i18n-jeu.mjs)
├─ pe-outils     40 lignes recopiées à l'identique de public/temps-reel/moteur.js : tirer, aleaDe (mulberry32),
│                racineEntiere, sinus/cosinus (64 directions × 1024), hacher (FNV-1a double), copie → window.PE_OUTILS
│                var TR = window.JEL_TR || window.PE_OUTILS   (repli posé une fois, en tête du bloc)
├─ pe-donnees    window.PE_DONNEES, JSON strict : échelles et types, factions et personnalités, niveaux des robots,
│                capacités, 33 fiches de mission (graine, carte, camps, ctl, tech, départs, objectif, secondaire,
│                temps visé, tmax), silhouette de l'acte 2 (lot 1)
├─ pe-sim        window.JEL_SIM (alias PE_SIM) : contrat jel-sim complet + générateurs de cartes (hexagones, orbites,
│                hyperlanes, bras, filaments, carte « ligne » symétrique), tout tiré de alea
├─ pe-pilote     PiloteLocal : même interface que JEL_TR.Partie.local, boucle avancer() du moteur recopiée
│                (comme la PartieLocale du Dernier Sas en version 1, docs/cadrage-dernier-sas.md, section 4)
├─ pe-rendu      canvas : caméra, couches cuites, niveaux de détail, sprites, effets, dézoom
├─ pe-son        Web Audio
└─ pe-jeu        écrans HTML, carte de campagne, commandes, tutoriel, sauvegarde, FMG
```

Le bloc de simulation définit déjà `window.JEL_SIM` mais ne s'appelle pas `jel-sim`, et aucun bloc `jel-tr` n'est présent tant que `game.json` n'a pas `temps_reel: true` (`validate-games.mjs` les refuse sinon ; rien ne le recopie dans le Worker).

**Contrat** : `camps: 6`, `periodeBot: 5`, `reglages: { tickMs: 100, delaiEntree: 1 }`, `depart(graine, config)`, `valide`, `ordre`, `pas(etat, alea)`, `bot`, `fin`, `exporter`, `importer`, `empreinte` (tout sauf `m`), `essais: { ordres, variete, parties: 12, equite: 30 }`. `config` est la fiche de mission construite par `pe-jeu` depuis `PE_DONNEES` (`{ mission, graine, camps, ctl, tech: [par camp], depart: [territoires et forces], objectif, vent }`) ou `{ ligne: 1, ctl }` : carte symétrique par rotation centrale pour les duels entre robots et le test d'équité, livrée dès le lot 1.

**État**, entièrement entier, tableaux parallèles parcourus par index, aucune clé dynamique : `a` (hasard), `k`, `ctl[]`, `nn`, `p[] f[] acc[] b[] fer[] aff[] ang[] rav[]` (par nœud), `fl: [{ i, c, n, d, v, q, L }]`, `sg: [{ i, c, n }]`, `pont: [[a, b, L]]`, `nf`, `c: [{ t, r: [frappe, sursaut, pont], s, v, cap, mem: [4] }]`, `eq[]`, `o: { t, n, d, x, ok }`, `tmax`, `st: { perdus, capIntacte, maxT }`, `ev: []`, et `m` (la carte régénérée : `x[] y[] t[] ar vois`, exclue de l'empreinte et de l'export). Positions en unités de carte 0 à 4 096, angles sur 64 directions, aucune fonction trigonométrique ni `Math.random`, aucune horloge.

**Ordres** : `[type, a, b, c]`, 4 entiers au plus : 1 envoyer, 2 construire, 3 rallier, 4 frappe, 5 pont, 6 sursaut, 7 essaimage. Ordre du tick, identique à `Simulation.avancer` : ordres de contrôle, ordres humains (par camp puis séquence), robots `(k + 3 × camp) % 5`, puis `pas` : `ev` vidé, production, avancée des flottes, arrivées par identifiant croissant, sièges par identifiant, recharges et fermetures, ravitaillement (tous les 10 ticks), orbites, objectif, fin.

**Pilote local** (`pe-pilote`) : `local({ graine, config, snap })`, `ordonner(ordre)`, `pause(bool)`, `vitesse(1|2)`, `quitter()`, `etat`, `prec`, `alpha()`, `resultat`, `instantane()`, `hachage()` ; accumulateur en `requestAnimationFrame` (rattrapage de 10 ticks au plus : un onglet endormi reprend sans rejouer), file d'ordres appliquée au tick suivant, hachage tous les 50 ticks en mode test. Le test de la section 14 fait tourner le même journal dans `PiloteLocal` et dans `JEL_TR.Simulation` : hachages identiques, preuve que la boucle est bien celle du moteur.

**Rendu séparé** : `pe-rendu` ne lit que `partie.prec`, `partie.etat`, `partie.alpha()` et `etat.ev` ; il tient la caméra, les couches cuites, ses effets éphémères dans ses propres tableaux, le dézoom. Il ne modifie jamais l'état.

**Bascule multijoueur** (hors des trois lots, décision du propriétaire) : renommer `pe-sim` en `jel-sim`, ajouter `modes` (`1v1`, `ffa3`, `ffa4`, `2v2`, `coop2v2r`) et `cartes` (`planete`, `systeme`, `galaxie`, symétriques, 12 minutes au plus, score au temps), `"temps_reel": true` et `"places": 4` dans `game.json`, `jel-tr` recopié par `i18n-jeu.mjs`, `PiloteLocal` remplacé par `JEL_TR.Partie` (mêmes appels ; vitesse ×2 retirée en ligne), boutons `data-tr`. La simulation ne change pas d'une ligne : c'est le sens du contrat tenu dès le lot 1 et des tests de la section 14.

**Taille estimée** : simulation 70 Ko, données 40, rendu 90, jeu 70, textes des 5 langues 100, modules communs 70 : environ 450 Ko.

## 13. Équilibrage

**Courbe** : acte 1, missions 1 à 3 sans rival, 4 à 7 robot niveau 1 (Cendrés prudents : ils laissent des trous), 8 niveau 2 ; acte 2 niveau 2 avec deux rivaux complémentaires ; acte 3 niveau 2 puis 3, Hégémonie à 40 % des nœuds ; acte 4 niveau 3, un seul rival ; acte 5 niveau 2 puis 3, jusqu'à 4 rivaux. La difficulté vient du nombre de fronts et de la taille des cartes, jamais d'un bonus caché. Chaque nouveauté arrive seule la première fois, contre un rival faible. Campagne sans échec : 5 à 6 heures.

**Valeurs de départ** (dans `PE_DONNEES`, aucune constante dans le code) : mission 1 capitale 20, neutres 5 à 12 ; mission 4 capitale 30 contre une capitale rivale 25 et 2 régions en tout (capitale comprise : avec 3 régions, le rival produisait près du double dès le départ et le robot de niveau 2 à la place du joueur ne gagnait que 65 % des parties, 85 % avec 2) ; acte 2 planète mère 120, Guilde 3 corps dont une géante à 200, Essaims 4 astéroïdes à 40 ; acte 3 système natal 300, Hégémonie 32 systèmes à 80 ; acte 4 capitale héritée 600, Silence 20 secteurs à 150 ; acte 5 capitale 1 200. Vent dans le dos : forces de départ × (100 + 10 × échecs) / 100, 30 % au plus, dans `config` (déterministe), sans effet sur les étoiles. Temps visé (2e étoile) : 1,2 × la médiane du robot niveau 3 assis à la place du joueur.

**Méthode** : (1) le robot de contrôle joue chaque mission 20 fois avec un robot à la place du joueur : au niveau 2 il gagne ≥ 70 % (la mission est faisable par l'IA, donc par un humain qui lit la carte), au niveau 1 < 50 % dès l'acte 3 (la mission résiste) ; coût : environ 3 000 ticks × 0,3 ms × 20 = 20 s par mission, 11 minutes pour la campagne ; (2) duels entre robots sur la carte « ligne » : niveau 3 contre 1 ≥ 85 %, 2 contre 1 ≥ 65 %, 3 contre 2 ≥ 60 %, robots égaux 35 à 65 % pour le camp 0 ; (3) 500 graines par échelle : graphe connexe, capitale à 3 arêtes au moins de tout rival, plus petite cellule ≥ 44 px au zoom plancher ; (4) trois parties humaines par mission dans Edge à 390 px, écart entre temps humain et temps visé noté ; (5) au lot 3, passe globale : étoiles manquantes réparties sur tous les actes, aucune mission à 3 étoiles trop facile ni impossible. Le tableau des taux est joint à chaque pull request.

**Mise à jour après le lot 1 (17 novembre 2026, mesures du test `scripts/tester-poussiere-d-empire.mjs --missions`)** : (1) la mission 5 se gagnait sans aucun ordre (le robot de niveau 1 n'assiégeait jamais la capitale) ; son rival est devenu un assiégeant propre à la fiche : il n'attaque qu'en offensive, concentre ses forces sur la région la plus proche de la capitale du joueur (la pile grossit à vue) et, toutes les 40 s, annoncée 5 s avant (onde, son, événement `[8, camp, 50]`), jette toute cette tête de pont vers la capitale ; un joueur passif perd à chaque fois, un robot de niveau 2 gagne 75 %, un joueur qui garde sa capitale garnie et rallie à l'annonce gagne toujours ; (2) **2e étoile des missions à durée fixe** (objectifs « tenir », « survivre », « couper », dont la victoire tombe exactement à la fin du compte à rebours) : finir avec au moins autant de régions qu'au départ, au lieu du temps visé ; le secondaire de la mission 5 est « prendre le cratère riche le plus proche de la capitale » (celui « capitale jamais perdue » était automatique) ; (3) **temps visé** : 1,5 × la médiane des victoires du robot de niveau 2 à la place du joueur, bornée entre 50 % et 100 % de la durée du tableau de la section 5, arrondie à 10 s (la règle « 1,2 × médiane du robot 3 » donnait des temps hors de portée d'un enfant) ; `tmax` ≥ 3 × temps visé. Taux de victoire mesurés (20 parties par mission) avec un robot de niveau 2 à la place du joueur : 100, 100, 100, 85, 75, 80, 100, 85 % ; niveau 1 : 100, 100, 100, 20, 35, 0, 15, 30 %. Les parties humaines de la méthode (4) restent à faire par le propriétaire.

## 14. Tests et contrôles

**Script propre au jeu** : `scripts/tester-poussiere-d-empire.mjs` (Node seul, sans navigateur, ajouté à `validate.yml` pour les changements de `games/poussiere-d-empire/` et du script). Il lit les blocs `pe-outils`, `pe-donnees` et `pe-sim` dans `index.html`, charge `public/temps-reel/moteur.js` comme `window.JEL_TR`, et vérifie : mots interdits (la liste de `tester-temps-reel.mjs` : `Math.random`, `Date`, `performance`, `Math.sin`…, `**`, `document`, `parent`, `top`, `for…in`) ; rejeu identique de 3 parties de 6 000 ticks sous `JEL_TR.Simulation` (journaux rejoués deux fois et depuis un instantané, hachages égaux tous les 50 ticks), **et les mêmes journaux sous `PiloteLocal` avec `PE_OUTILS` seul** (hachages identiques : la copie des outils est exacte, la boucle est celle du moteur) ; `Number.isInteger` sur chaque nombre de l'état après chaque tick ; `importer(exporter(etat))` → même hachage, instantané de la pire carte < 25 000 caractères ; coût moyen d'un tick sur la plus grande carte avec 300 flottes et 5 robots de niveau 3 : **≤ 0,5 ms en Node** (facteur 4 à 6 vers un Android moyen) ; duels et équité sur la carte « ligne », variété des débuts ; `fin` jamais `null` au-delà de `tmax` ; la mission 1 gagnée par l'humain d'essai (`essais.ordres`) en moins de 3 000 ticks ; `--missions` : chaque mission 20 fois avec un robot à la place du joueur, taux et médiane imprimés ; `--cartes` : 500 graines par échelle. Le script partagé `tester-temps-reel.mjs` n'est pas modifié ; son option `--essai <fichier>` reste utilisable à la main sur le bloc extrait, puisque le bloc définit `window.JEL_SIM`, accepte `{ ligne: 1, ctl }` et fournit `essais`. À la bascule, `tester-temps-reel.mjs` sans option devra passer en entier.

**Contrôles du dépôt**, tous verts avant chaque pull request : `node scripts/validate-games.mjs poussiere-d-empire --jouer` (console, 390 × 844 au toucher, hors ligne, `FMG.reportEnd` et `reportComplete`, sauvegarde, jaquette, 2 Mo), `node scripts/tester-sauvegarde.mjs poussiere-d-empire --captures`, `node scripts/check-i18n.js poussiere-d-empire` (Edge par `CHROMIUM_PATH`), `node scripts/regles-seo.mjs poussiere-d-empire`, `node scripts/verifier-seo.mjs poussiere-d-empire`, `node scripts/controle-taxonomie.mjs`, puis le humanizer des descriptions (`description`, `description_seo`, `presentation`, 5 langues, `scripts/humanizer.mjs`, `.claude/skills/humanizer/`), résultat dans la pull request.

**Manuel dans Edge** : 390 × 844 au toucher, 360 px en allemand, 844 × 390 en paysage, 1 280 px à la souris et au clavier ; panneau de mesure à ×4 de ralentissement sur la plus grande carte (≤ 8 ms par image) ; dézoom sans chute sous 50 images par seconde ; reprise après fermeture de l'onglet au milieu d'une mission ; pause à l'écran caché ; aucun défilement de la page.

## 15. Découpage en lots

**Pull request 0** (branche `poussiere-cadrage`) : `docs/cadrage-poussiere-d-empire.md`, ce document. Attente de validation.

**Pull request 1, lot 1** (branche `poussiere-lot1`, jamais fusionnée par Claude) : `games/poussiere-d-empire/index.html` avec tous les blocs ; le moteur de conquête complet (production, trajets, sièges, bâtiments, les sept ordres, ravitaillement, orbites, objectifs, étoiles, fin : le contrat est figé dès ce lot, les capacités 5 à 10 existent dans la simulation et les données, verrouillées) ; le générateur hexagonal et la carte « ligne » ; robots de 3 niveaux avec les personnalités Cendrés et Pionniers ; les 8 missions de l'acte 1 ; Rallier, Fortin, Transfert, Arrière-pays ; écran titre (consigne d'une phrase, gros « Jouer » avec reprise, son, langue) ; tutoriel animé des missions 1 à 3 ; carte de campagne à 33 étoiles dont 25 en silhouette ; bouton Horizon vers la silhouette du système ; pause complète ; écrans de résultat avec `reportEnd`, `reportComplete` à l'acte 1 complet ; sauvegarde complète ; dézoom de fin d'acte vers la silhouette ; `i18n-jeu/poussiere-d-empire/{fr,en,es,pt,de}.json` assemblés ; `cover.webp` 600 × 800 sans texte (la planète turquoise à moitié conquise, le soleil, deux planètes sœurs, un anneau de l'emblème) par `jaquette-sans-texte.mjs` ; `game.json` : genre `strategie`, univers `["espace"]`, `ages` 10+, `niveaux` 8, `etoiles` 24, `version` 1, sans `consignes` ni `temps_reel` ; `scripts/tester-poussiere-d-empire.mjs` et sa ligne dans `validate.yml` ; section 14 de `CLAUDE.md` ; description de la pull request avec les mesures (ms par tick et par image, taille de l'instantané, taux des robots et des missions). **Publiable seul** : huit missions de 2 à 6 minutes, 24 étoiles, un acte entier qui se termine et donne le badge.

**Pull request 2, lot 2** (`poussiere-lot2`) : générateurs d'orbites et d'hyperlanes, Guilde, Essaims, Hégémonie, Veilleurs (camp allié), pulsar, missions 9 à 22, Relais, Chantier, Frappe de rupture, dézooms vers les actes 2 et 3 réels ; `niveaux` 22, `etoiles` 66, `consignes` 2, `version` 2, textes de la page réécrits ; tableau des taux.

**Pull request 3, lot 3** (`poussiere-lot3`) : bras et filaments, Silence et rivaux de l'acte 5, missions 23 à 33, Pont stellaire, Essaimage, Sursaut, bac à sable, dézoom ultime, équilibrage global ; `niveaux` 33, `etoiles` 99, `version` 3, textes réécrits. Un lot n'ajoute que des données, des générateurs et l'interface des nouveautés : aucune mission n'est codée à la main.

## 16. Risques, limites connues et questions pour le propriétaire

**Risques et parades** : (1) dérive de périmètre : tout est piloté par `PE_DONNEES`, une mission = une entrée JSON et ses textes ; (2) sauvegarde trop grosse : carte régénérée, test de taille, repli « campagne seule » au-delà de 60 000 ; (3) déterminisme cassé à la bascule : outils recopiés du moteur, double exécution `PiloteLocal` / `JEL_TR.Simulation` dès le lot 1 ; (4) coût du tick : tableaux parallèles sans allocation, un camp robot par tick, mesure imposée dans chaque pull request ; (5) rendu qui rame à 120 nœuds et 300 flottes : budget chiffré, niveaux de détail, réduction automatique ; (6) toucher imprécis : zoom plancher 44 px, centroïde à 28 px, glisser plutôt que viser ; (7) robots trop forts ou trop mous : bornes 70 % et 50 %, vent dans le dos ; (8) répétition entre actes : un type de territoire, une règle (orbites, ravitaillement, vagues, grands vides) et un objectif nouveaux par acte, relecture « 15 minutes » de chaque acte ; (9) public 10+ : vocabulaire d'annexion, jaquette sans violence, grille de `CONSIGNES-JEU.md` ; (10) allemand 30 % plus long : contrôle à 360 px.

**Limites connues** : pas de multijoueur dans les trois lots ; le bac à sable n'a ni étoiles ni classement ; un acte déjà commencé ne profite pas des étoiles gagnées en rejouant l'acte précédent ; les orbites qui tournent n'existent qu'à l'acte 2.

| Question | Choix par défaut retenu dans ce document |
| --- | --- |
| Âge conseillé : 10+ (visible dans Nouveautés et Tendances), ou 13+ ? | 10+ |
| Nom « Poussière d'Empire » ? | oui |
| Lot 1 : badge « jeu terminé » donné pour l'acte 1 seul, ou attendre la campagne complète ? | donné pour l'acte 1 (`etoiles` 24, puis 66 et 99) |
| Écart avec `CONSIGNES-JEU.md` (missions de 2 à 15 min, 8 missions au lot 1, pas de `consignes` avant le lot 2) accepté ? | oui, avec sauvegarde au tick près et vitesse ×2 |
| Vent dans le dos (+10 % de forces par échec, 30 % au plus) ? | oui, sans effet sur les étoiles |
| Lot 1 : le dézoom mène à une silhouette du système tirée des données, ou à la vraie carte générée de l'acte 2 ? | silhouette (le générateur d'orbites arrive au lot 2) |
| Script de test dédié ajouté à `validate.yml`, ou options ajoutées à `tester-temps-reel.mjs` ? | script dédié, script partagé intact |
| Bac à sable sans étoiles, débloqué dès la mission 29 ? | oui |
| Ravitaillement dès l'acte 3 (territoire coupé de la capitale à demi-production, capitale perdue : tout le camp) ? | oui, joueur et robots |
| Humanizer des descriptions avant chaque pull request ? | oui |

## 17. Révision du 18 novembre 2026 : une planète persistante, 20 missions par acte, sons Kenney

**Retour du propriétaire après avoir joué le lot 1** : le jeu est agréable et les capacités qui s'ajoutent plaisent, mais la progression ne se voit pas sur la carte. Chaque mission avait sa propre petite carte, le joueur enchaînait des niveaux sans rien posséder. Il demande que les territoires conquis s'additionnent en une carte du monde qui grandit, une vingtaine de missions sur la planète, et de meilleurs sons tirés des packs Kenney de sa bibliothèque d'assets.

**Une planète par acte, la même pour tous, qui se remplit.** L'acte 1 se joue sur une seule planète (graine fixe, grille hexagonale de rayon 8, environ 180 régions) découpée en 24 provinces de 6 à 9 régions, numérotées du sud (province natale) vers le nord. Les Cendrés tiennent le nord avec leur capitale tout en haut, les Pionniers deux provinces du milieu. Chaque mission se joue sur cette planète, à la frontière de l'empire : sa zone active réunit les provinces cibles, les provinces rivales en jeu et les provinces du joueur qui les touchent. Le reste de la planète est dessiné autour, atténué, dans la couleur de son propriétaire. Gagner une mission donne au joueur ses provinces cibles, et la mission suivante commence avec cet empire agrandi. À la mission 20, la planète entière est turquoise et le dézoom part de la planète complète.

**Ce que voit le joueur** : la carte de campagne est un plateau de conquête. La planète occupe presque tout l'écran, entourée d'un anneau qui se remplit avec la part conquise (régions, pourcentage, étoiles). Une route dorée relie les missions gagnées, en pointillés pour la suite, et un drapeau de l'Aube marque la mission en cours. La route est un arbre : chaque mission part d'une mission déjà faite dont la province touche la sienne, car l'ordre des numéros saute d'un front à l'autre et traverserait le globe. Les capacités sont des trésors posés sur la route. Toucher une étape ouvre sa fiche (province illuminée, objectif, étoiles, meilleur temps, récompense, « Jouer »). Une orbite part du globe et porte les quatre échelles suivantes en silhouettes verrouillées. **Chaque victoire passe par cette carte** (bouton « Voir ma conquête », ou retour automatique après 6 s) : la province s'allume, la route s'allonge, les compteurs montent en 1,4 s, puis « Jouer » lance la mission suivante. C'est un toucher de plus qu'au lot 1, choisi parce que voir l'empire grandir est le cœur de la demande du propriétaire. En mission, le HUD affiche la taille de l'empire.

**Ce qui ne change pas** : les règles de conquête (section 4), le contrat `jel-sim`, l'architecture (section 12), les règles d'étoiles et de temps visé arrêtées au lot 1 (section 13), le format de sauvegarde. La possession de la planète ne se sauvegarde pas : elle se déduit des missions gagnées, et les propriétaires au départ d'une mission ne dépendent que de son numéro (une mission rejouée reste comparable).

**Nombre de missions** : 20 par acte, soit 100 missions pour la campagne complète (confirmé par le propriétaire le 18 novembre 2026). Acte 1 : missions 1 à 20 (tableau ci-dessous). Les tableaux des actes 2 à 5 de la section 5 gardent leurs thèmes et seront étendus à 20 missions chacun au début des lots 2 et 3. Capacités renumérotées : Rallier 3, Fortin 6, Transfert 10, Arrière-pays 15, Relais 25, Chantier 32, Frappe de rupture 47, Pont stellaire 66, Essaimage 71, Sursaut 85.

| N° | Mission | Objectif | Rivaux | Nouveauté, capacité |
| --- | --- | --- | --- | --- |
| 1 | Premiers pas | prendre toute la province natale | — | toucher, glisser, production |
| 2 | Les cratères | prendre la province riche en cratères | — | terrains, pourcentage |
| 3 | La chaîne | prendre la province des montagnes | — | défense, siège ; Rallier |
| 4 | Les Pionniers | atteindre une balise avant les Pionniers | Pionniers | premier rival |
| 5 | Premier contact | 60 % de la zone | Cendrés | perte de territoire |
| 6 | Le siège | tenir 3 min contre des offensives annoncées | Cendrés assiégeants | Fortin |
| 7 | Le col | prendre la province du col | Cendrés | |
| 8 | La calotte sud | atteindre la balise au-delà de la calotte | — | routes lentes |
| 9 | Deux fronts | prendre une province disputée | Pionniers et Cendrés | deux rivaux |
| 10 | La fin des Pionniers | éliminer les Pionniers | Pionniers | Transfert |
| 11 | Les plaines fertiles | posséder n régions sur deux provinces | Cendrés | logistique |
| 12 | Contre-attaque | tenir 3 min contre une offensive plus forte | Cendrés assiégeants | |
| 13 | La mer intérieure | prendre les provinces du rivage | Cendrés | longues routes |
| 14 | Le cratère géant | prendre la province du grand cratère | Cendrés | |
| 15 | La ligne de crête | 60 % de la zone | Cendrés | Arrière-pays |
| 16 | Les glaces du nord | atteindre la balise de la calotte nord | Cendrés | |
| 17 | Le bastion | prendre la province fortifiée des Cendrés | Cendrés | |
| 18 | Tenir la ligne | tenir 3 min contre la grande offensive | Cendrés assiégeants | |
| 19 | Le cœur des Cendrés | prendre la province de leur capitale | Cendrés | |
| 20 | Maîtres de la planète | éliminer les Cendrés | Cendrés | dézoom vers le système |

**Lots (remplace le tableau de la section 11)** : lot 1 = acte 1, `niveaux` 20, `etoiles` 60, `"consignes": 2` (les 20 niveaux sont atteints), badge « jeu terminé » à la fin de l'acte 1 ; lot 2 = actes 2 et 3, 60 missions, 180 étoiles ; lot 3 = actes 4 et 5, 100 missions, 300 étoiles. Les règles de la section 11 sur `reportComplete` restent les mêmes.

**Fin de l'acte 1 durcie (demande du propriétaire)** : sur 20 parties, le robot de niveau 2 à la place du joueur gagne les missions 16 à 20 à 90, 85, 80, 85 et 75 %, le robot de niveau 1 à 60, 50, 30, 30 et 30 % (95 à 100 % avant). Les rivaux sont plus forts, disposent du Fortin, la mission 18 a des offensives plus rapprochées et la mission 19 un robot de niveau 3. Le test refuse désormais un robot de niveau 1 au-dessus de 70 % sur ces cinq missions, sauf la mission 17 (85 %) : après l'essai du propriétaire, qui ne la gagnait pas en 10 parties, ses régions rivales passent de 12 à 10 forces (robot de niveau 2 : 100 %, robot de niveau 1 : 75 %, et 99 % et 81 % sur 100 autres graines).

**Sons** : effets tirés des packs Kenney CC0 de la bibliothèque locale (Sci-Fi Sounds, Interface Sounds, Digital Audio, Music Jingles), intégrés en OGG dans le bloc `pe-son` ; la synthèse Web Audio du lot 1 reste le repli d'un navigateur qui ne lit pas l'OGG.

## 18. Lot 2 : décisions prises pendant la réalisation (18 novembre 2026)

**Capitale sans héritage.** La règle de la section 6 (production de la capitale × (100 + étoiles) / 100, défense +25, « figée au passage ») est abandonnée : elle ferait dépendre une mission de l'historique du joueur, ce que la section 17 interdit. La capitale d'un acte a les valeurs de son type dans `echelles`, sans bonus. Le passage d'échelle reste visible : dézoom, médaillon de l'acte précédent sur la capitale.

**Objectif « couper » (type 8).** Tous les passages (`sel: 'passages'`, ou `{ sel, dans }`) doivent être tenus sans interruption pendant `d` ticks. Un passage perdu n'échoue pas la mission : le compte repart de `d` entier, et l'affichage avec lui. Choix fait à la mesure : un compte qui se contenterait de s'arrêter laissait gagner en reprenant le passage au dernier moment ; un échec immédiat punissait un simple raid.

**Orbites de l'acte 2.** Les périodes vont de 60 ticks (orbite intérieure) à 240 ticks (orbite extérieure) par pas de 1/64 de tour, au lieu de 120 à 240 : avec l'ancienne plage, les orbites voisines se décalaient de moins d'un pas en trois minutes et aucune route ne changeait vraiment. Chaque mission a un **alignement** : au tick `alignement` de la fiche (par défaut, la moitié de la durée visée), tous les corps reviennent à l'angle 0, celui de la carte du système (`m.ph`, décalage du temps des orbites : `ang = ⌊(k + ph) / per⌋ mod 64`). Les routes entre deux orbites raccourcissent donc jusqu'à l'alignement puis s'allongent, d'environ ×1,5 à ×2 sur une mission. C'est la « fenêtre de transfert ». La durée d'un trajet reste lue au départ puis figée.

**Durée affichée.** Le canvas ne porte que des chiffres et des formes : en visant, et sur les routes du nœud sélectionné, une étiquette donne la durée en secondes (petite horloge), avec un triangle turquoise si la route raccourcit dans les 30 secondes qui viennent, doré si elle s'allonge.

**Cadrage des cartes de l'espace.** Quand la zone ne tient pas à l'écran au zoom plancher (44 px entre voisins), la caméra se pose sur l'action : la fenêtre qui montre le plus de fronts, puis la base, les cibles et les nœuds du joueur. Au départ d'une mission, un survol d'environ 2 secondes montre toute la zone puis descend sur l'action ; déplacer ou zoomer la carte le termine aussitôt, toucher un nœud le laisse finir, et il est supprimé si les mouvements sont réduits.

**Garde d'un objectif.** `fiche.garde` : forces de départ des nœuds de l'objectif tenus par un rival, pour qu'un objectif ne tombe pas au premier envoi.

**Cartes des actes 2 et 3.** Même principe que la planète de l'acte 1 : une carte par acte, gardée d'une mission à l'autre, et une mission qui ne dépend que de son numéro (la propriété se déduit des missions gagnées, le format de sauvegarde ne change pas). Acte 2 : système de 150 corps sur 7 orbites, 24 domaines ; la Guilde des Anneaux tient 8 domaines et les Essaims 6, dont toute la ceinture. Acte 3 : amas de 182 systèmes, 24 secteurs ; l'Hégémonie de Vair tient 10 secteurs et les Veilleurs 3. Les dézooms passent par ces vraies cartes, puis par une silhouette de galaxie après l'acte 3.

**Objectif « tenir tant que l'allié vit » (type 10).** La chute de la capitale de l'allié fait perdre la mission (raison 4). L'élimination complète de l'allié, prévue au départ, laissait gagner sans jouer tant qu'il lui restait un nœud isolé.

**Robots.** Le robot de référence (niveau 2) peut utiliser la Frappe si elle est dans sa technologie, pour mesurer les missions de l'acte 3 comme un joueur qui l'a gagnée à la mission 47. Les robots de niveau 3 jouent aussi le Relais et le Chantier. À la mission 38, la Guilde garde sa capitale (personnalité propre) ; sinon une attaque directe finissait la mission.

**Objectifs secondaires.** Un secondaire perdu dès les premières secondes quoi que fasse le joueur rendait l'étoile inaccessible : la mission 58 demande maintenant de ne jamais perdre sa base, et les seuils de pertes des missions 29, 52, 54 et 55 sont relevés.

**Mesures à la fin du lot** (`tester-poussiere-d-empire.mjs --missions`, 20 parties par mission et par robot). Le robot de niveau 2 gagne 75 à 100 % des missions 21 à 60. Le robot de niveau 1 reste à 70 % au plus sur les missions 33 à 40 et à 50 % au plus sur les missions 45 à 60. Un joueur qui ne donne aucun ordre perd toutes les missions à rival (5 parties chacune).

**Limites connues.** Ces mesures viennent de robots et leurs graines ont servi au réglage. Sur 100 autres graines, le robot de niveau 2 tombe à 66 % sur la mission 51 (objectif 70 %), 72 % sur la 44 et 77 % sur la 31. Plusieurs missions se terminent en 32 à 44 secondes pour lui (24, 26, 34, 36, 44, 45, 49, 54), sous les 3 à 8 minutes visées pour un joueur ; la durée humaine n'est pas mesurée. La mission 47 se gagne encore par une attaque directe, en 37 secondes pour un joueur simulé très rapide. À revoir au lot 3 avec l'équilibrage global, d'après de vraies parties.

## 19. Lot 3 : décisions prises pendant la réalisation (19 novembre 2026)

Le lot 3 termine la campagne : actes 4 et 5, missions 61 à 100, 300 étoiles, bac à sable. `version` 5 dans `game.json`, parce que le lot 2 en est à la version 4 sur sa branche : sans ce saut, les appareils ne retéléchargeraient pas le jeu.

**Cartes.** Même principe qu'aux actes précédents : une carte par acte, gardée d'une mission à l'autre, 24 provinces. Acte 4 : une galaxie de 238 nœuds, quatre bras spiraux autour d'un cœur, avec le Silence au cœur et dans le bras opposé. Acte 5 : une toile cosmique de 264 galaxies, des superamas reliés par des filaments, de grands vides franchis par quelques routes de 40 ticks au moins, et quatre rivaux aux coins (les Lointains, la Marée, les Fileurs, l'Écho), qui se battent aussi entre eux. Les zones de mission vont de 19 à 105 nœuds à l'acte 4 et de 22 à 90 à l'acte 5.

**Essaimage (écart au cadrage, section 7, et au contrat du lot 3).** La règle prévue, « un nœud au plafond envoie 25 % vers son voisin neutre le plus faible », ne faisait presque rien : le plafond était rarement atteint et 25 % ne prenaient aucun neutre. Allumé, l'Essaimage ralentissait même le joueur. Nouvelle règle : un nœud qui peut prendre seul son voisin neutre le plus faible y envoie la défense du neutre × 130 %, en gardant au moins 25 % de ses forces. Au plus un envoi par camp et par tick, un neutre déjà visé est laissé de côté, et seuls 12 nœuds sont examinés par tick, ce qui borne le coût (`PE_DONNEES.essaim`). À la mission 72, allumé seul pendant 5 minutes, il fait passer de 9 à 16 ou 18 territoires. Aux missions 74, 81 et 84, où les neutres sont bien plus forts que les nœuds du joueur, il ne déclenche aucun envoi en 5 minutes s'il est seul à jouer.

**Rivaux de niveau 3.** Aux actes 4 et 5, leur ratio d'attaque passe de 110 à 180 (`ratioGrand`) : à 1,1 contre 1, un siège coûtait presque tout l'assaillant et le rival s'effondrait en moins d'une minute, plus faible qu'au niveau 2. Les actes 1 à 3 gardent 110. Les fiches 76 à 80 et 96 à 100 ont été réglées de nouveau en conséquence.

**Garde du trône.** Quand le seul objectif d'une mission est la capitale d'un rival (91, 96, 97), un rival de niveau 2 ou 3 n'en retire plus aucune force. Si des forces ennemies à 3 arêtes dépassent 70 % de sa défense, il la rallie et y fait couler ses réserves (`PE_DONNEES.garde`). Avant, la capitale se vidait toute seule et une pile lancée en ligne droite gagnait en 24 à 36 secondes, souvent avec 3 étoiles.

**Joueur ciblé (nouveau contrôle).** Le joueur glouton du contrat ne suit pas de chemin et ne voyait pas ces victoires éclair. Le test `--missions` joue donc aussi un joueur « ciblé » : un geste toutes les 1,3 s, 100 % de sa plus grosse pile, sur le plus court chemin vers l'objectif. Sur les missions à rival, hors les 3 premières de chaque acte, il ne doit gagner aucune partie en moins de 20 % de la durée visée (60 s au moins). Les fiches 71, 74, 84, 85 et 91 ont été réglées pour cela. Dans la vraie interface, à 390 px et au toucher, le même geste ne gagne plus les missions 74, 85, 91, 96 et 97 en 45 secondes.

**Commandes.** Fortin, Relais et Chantier passent derrière un bouton « Bâtir » : la barre garde des boutons de 44 px à 360 px, en paysage et à 1 280 px. La touche B construit sur le territoire choisi ; sans territoire choisi, elle ouvre le tiroir. Quand la zone est coupée en deux (mission 67), les anneaux dorés du Pont ne montrent que les nœuds dont le pont réunit les deux rives ; les autres ponts restent permis.

**Cadrage et repères.** Au départ, la caméra cherche une fenêtre qui montre à la fois un front et la pile qui porte au moins le quart des forces du joueur. Si les deux ne tiennent pas dans la même fenêtre au zoom plancher, elle garde le front, et un triangle turquoise au bord de la zone libre indique la base. Les flèches rouges de menace pointaient à l'opposé de la menace et flottaient au milieu de l'écran en paysage : elles longent maintenant le bord de la zone libre, HUD déduit, et pointent vers la menace.

**Bac à sable.** Débloqué par la victoire de la mission 81, hors missions, sans étoiles. Réglages à gros boutons : 40, 80 ou 120 galaxies, 1 à 4 rivaux, niveau 1 à 3. La graine est affichée ; « Rejouer cette carte » la reprend, « Nouvelle carte » en tire une depuis l'état du jeu. `JEL_SIM.configBac` fabrique une carte en toile et l'objectif « éliminer tout le monde », avec la technologie du joueur figée au lancement. La partie reprend exactement grâce à `mission: { bac, k, snap, h }` dans la sauvegarde. La fin appelle `FMG.reportEnd` avec le score, jamais `reportComplete`, et le record par taille reste dans `options`.

**Fin de campagne.** Mission 100 : dézoom ultime à travers les cinq cartes emboîtées (environ 12 s, un toucher pour passer, version courte si les mouvements sont réduits), puis écran « Voix de l'Horizon ». `reportComplete` part quand les 100 missions sont gagnées, avec `maxStars` 300.

**Mission 17.** Le lot 3 était parti d'avant l'allègement demandé par le propriétaire. Il est rétabli (régions rivales à 10 forces, 85 % au plus pour le robot de niveau 1). L'acte 1 reste par ailleurs identique à cette référence : fiches, cartes et 124 parties rejouées au même hachage.

**Retouches des actes 2 et 3.** Seuls les nombres des fiches 24, 26, 31, 34, 36, 44, 45, 47, 49, 51 et 54 ont changé.

**Mesures à la fin du lot** (robots à la place du joueur).

| Série | Missions | Robot de niveau 2 : minimum | Moyenne |
| --- | --- | --- | --- |
| R, réglage (20 parties) | 21 à 60 | 75 % (mission 58) | 94 % |
| R, réglage (20 parties) | 61 à 100 | 75 % (mission 80) | 94 % |
| C, contrôle (100 parties) | 21 à 60 | 77 % (mission 33) | 94 % |
| C, contrôle (100 parties) | 61 à 100 | **55 % (mission 99)** | 92 % sans la mission 99 |

Sur 61 à 100 en série R : robot de niveau 1 à 50 % au plus (hors missions sans rival et 3 premières de chaque acte), joueur sans ordre battu sur toutes les missions à rival, secondaire réussi au moins une fois sur chaque mission. Le coût de la simulation est de 0,031 ms par tick avec des robots de niveau 3 et l'instantané le plus lourd fait 14 094 caractères. Rendu dans Edge, à 120 nœuds et environ 230 flottes (300 flottes non atteintes) : médiane de 2,1 ms par image, 95e centile de 6,1 ms au plus.

**Limites connues.**

- Personne n'a joué ces 40 missions pour de vrai : ni humain, ni vrai téléphone, ni son. Toutes les difficultés viennent de robots.
- La mission 99 tombe à 55 % sur la série de contrôle, sous les 65 % visés. Conformément au contrat, cette série n'a servi à aucun réglage et rien n'a été retouché après sa lecture : à reprendre après un essai réel.
- Les missions 78 et 80 sont très contrastées : le robot y gagne vite ou se fait éliminer, et leur médiane reste proche de 60 s (654 et 635 ticks).
- Plusieurs missions restent courtes pour un robot au regard des 6 à 10 minutes visées pour un joueur ; la durée humaine n'est pas mesurée.
- Sur les missions 65, 71 et 83, à 390 px, aucune route de front n'est entièrement visible au départ : on voit les nœuds du joueur, pas encore ce qu'ils peuvent prendre.
- L'Essaimage n'agit pas tant que les nœuds du joueur restent plus faibles que les neutres voisins.
