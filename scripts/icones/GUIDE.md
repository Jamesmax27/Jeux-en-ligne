# Guide des icônes des regroupements

Ce guide fixe le style, l'outillage et les règles des icônes des regroupements de l'accueil : tuiles des raccourcis et des âges, puces des genres et des univers, titre « Tendances ». Les 35 icônes actuelles (toutes les clés de `public/taxonomie.js`, après le regroupement d'octobre 2026) donnent le niveau attendu ; parmi les 9 qui ont servi de modèles, il reste `hasard`, `age:3-4`, `genre:puzzle`, `genre:musique`, `univers:chevaux`, `univers:ocean`, `univers:espace` et `tendances` (`genre:reflexes` a été retiré avec son genre).

Toutes les commandes se lancent depuis la racine du dépôt, avec Node 18 ou plus (aucun paquet npm, sauf Playwright pour les captures de la planche).

## 1. L'idée

**Des autocollants à deux couches : une masse colorée, un trait craie par-dessus. Le trait mène, la couleur suit.**

- **La masse** (`fond`) est la silhouette pleine de l'objet. Elle prend la teinte de la puce : chaque genre et chaque univers a sa couleur, déjà validée.
- **Le trait** (`trait`) dessine le contour et un ou deux détails, en craie. Il est rond, régulier et d'une seule épaisseur.
- **Les trous** percés dans la masse montrent la nuit : yeux, points du dé, hublot, truffe. Ce sont eux qui donnent le caractère, avec un contraste maximal.
- **L'extra** est un petit détail en craie ou lavande : étincelles, notes, bulles, flamme, traits de vitesse. Il n'existe que pendant l'animation et naît derrière l'icône. (L'or est accepté dans les sources mais le générateur le peint en craie : sur le site, l'or des regroupements est réservé à l'étincelle d'une puce ou d'une tuile choisie.)
- **Au survol, au focus ou au choix**, l'icône fait un geste court (0,5 à 0,7 s). La couleur suit le trait avec un léger retard, et ce décalage donne de la souplesse. C'est la signature de toute la série.

Sobre au repos, vivante quand on la touche. Pas de dégradé, pas d'ombre, pas de lueur.

## 2. Fichiers et commandes

| Fichier | Rôle |
|---|---|
| `scripts/icones/sources/<slug>.svg` | une source par clé ; **c'est le seul fichier qu'un dessinateur écrit** |
| `scripts/icones/generer.mjs` | contrôle les sources et écrit leur CSS dans `public/style.css`, entre les repères `/* DÉBUT DU BLOC GÉNÉRÉ : icônes … */` et `/* FIN DU BLOC GÉNÉRÉ : icônes */` |
| `scripts/icones/planche.mjs` | planche de contrôle (HTML + PNG) avec les vraies classes du site, dans `captures/icones/` (ignoré par git) |
| `public/style.css` (entre les repères) | généré : ne jamais le modifier à la main |

La section « Icônes : la langue du logo », juste après le bloc dans `style.css` (petite constellation au survol, étincelle or de l'état choisi), est écrite à la main : le générateur n'y touche pas.

**Nom du fichier** (slug) : c'est la clé `data-cle` posée par `app.js`, avec « : » remplacé par « -- » et « + » par « plus ». Par exemple :
- `genre--memoire.svg`
- `univers--ville.svg`
- `age--9plus.svg`
- `collection--hors-ligne.svg`
- `hasard.svg`
- `tendances.svg` (titre « Tendances »)

**Commandes** :

```powershell
# Contrôle des sources (✗ = source refusée, ! = avertissement) et de style.css
# (à jour ou non) ; n'écrit rien ; code de sortie 1 en cas de problème
node scripts/icones/generer.mjs --verifier

# Contrôle des sources et réécriture du bloc des icônes dans public/style.css
# (rien n'est écrit si une source est refusée)
node scripts/icones/generer.mjs

# Planche de contrôle : captures/icones/planche.html, planche.png, planche-anim.png
node scripts/icones/planche.mjs

# Planche de quelques icônes seulement : captures/icones/planche-<lot>.*
node scripts/icones/planche.mjs --lot nouveaux --cles "genre:memoire,genre:quiz"
#   « préfixe* » accepté :  --cles "univers:*"

# Même planche en réglages « ordinateur », pixels réels (le cas le plus dur pour 16 px)
node scripts/icones/planche.mjs --lot nouveaux-pc --cles "genre:memoire" --dpr 1 --largeur 1000
```

La planche construit le CSS en mémoire à partir des sources : elle montre les icônes telles qu'elles seront, sans rien écrire dans `public/`. Ses captures demandent Playwright (`npm install --no-save playwright`, puis `npx playwright install chromium`), ou Chrome ou Edge installés ; sans eux, `--html-seul` produit seulement la page HTML, à ouvrir dans un navigateur. Regarder **toujours** les deux PNG (états et milieu d'animation) avant de publier.

## 3. Ajouter l'icône d'un nouveau genre ou univers

Un genre ou un univers n'est créé que sur décision du propriétaire (liste fermée de `public/taxonomie.js`). Une fois la clé ajoutée à `taxonomie.js`, sa puce affiche son emoji : l'icône est facultative et peut venir plus tard.

1. Choisir une métaphore distincte de toutes celles de la section 12, et une animation de la section 9.
2. Écrire `scripts/icones/sources/<slug>.svg` (format en section 4), par exemple `genre--enigmes.svg` pour la clé `genre:enigmes`.
3. `node scripts/icones/generer.mjs --verifier` : aucune erreur, aucun avertissement.
4. `node scripts/icones/planche.mjs --lot nouveau --cles "genre:enigmes"` : regarder les deux PNG (liste de contrôle de la section 13).
5. `node scripts/icones/generer.mjs` : le bloc de `public/style.css` est réécrit.
6. Ajouter la ligne de la nouvelle clé au tableau de la section 12.

Un fichier dont le nom ne correspond à aucune clé de `taxonomie.js` est refusé (et rien n'est écrit) : créer la clé d'abord.

## 4. Format d'une source

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-anim="sautiller"
     data-origine="12 21" data-origine-extra="20 10">
  <!-- Ce que c'est, en une ligne. -->
  <g id="fond">
    <path d="…"/>                                   <!-- masses, en noir, remplies -->
    <path fill-rule="evenodd" d="… contour … trou"/><!-- trou = la nuit apparaît -->
  </g>
  <g id="trait">
    <path d="…"/>                                   <!-- traits : rien à préciser -->
    <circle cx="14" cy="10" r="1.1" fill="#000" stroke="none"/>  <!-- un point plein -->
  </g>
  <g id="extra">                                    <!-- facultatif -->
    <path d="…" fill="#eceae4"/>                    <!-- craie #eceae4 ou lavande #a8b3f0 -->
  </g>
</svg>
```

- **`data-anim`** (obligatoire) : un nom de la bibliothèque (section 9).
- **`data-origine`** (facultatif) : le pivot de l'animation, en coordonnées de la grille. Par défaut, c'est celui de l'animation. Il sert à faire tourner une note autour de sa base, ou une médaille autour de son ruban.
- **`data-origine-extra`** (facultatif) : le point d'où naît l'extra (bouche du poisson, tuyère de la fusée). Par défaut, c'est le centre.
- **Groupe `trait`** : le générateur pose lui-même `fill="none" stroke="#000" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"`. Ne pas répéter ces réglages et ne jamais changer l'épaisseur. Les points pleins portent `fill="#000" stroke="none"`.
- **Groupe `fond`** : le générateur pose `fill="#000"`. Pour percer, utiliser `fill-rule="evenodd"`, avec le contour et le trou dans le même chemin.
- **`transform` sur un groupe** : permis. La fusée est dessinée debout, puis tournée de 45°. Mettre alors le même `transform` sur `fond`, `trait` et `extra`.
- **`<defs>`** à la racine : recopié dans chaque calque. À éviter sauf besoin réel.
- **Interdits**, refusés par le générateur :
  - les éléments `<text>`, `<image>`, `<script>`, `<style>` et `<foreignObject>` ;
  - les attributs `on…` ;
  - les ressources externes.
- **À éviter**, signalés par un avertissement :
  - les dégradés, filtres et motifs ;
  - l'attribut `style=` ;
  - toute couleur autre que le noir dans `fond` et `trait` ;
  - dans `extra`, toute couleur autre que craie `#eceae4`, lavande `#a8b3f0` ou or `#f2d27a` (peint en craie).
- **Rester compact** : coordonnées à une décimale, commandes relatives, le même chemin pour le contour du fond et celui du trait. Chaque icône pèse environ 2 Ko dans le CSS.

## 5. Grille et géométrie

- **Grille** de 24 × 24 unités. **Zone utile de 2 à 22**, trait compris : le centre du trait reste entre 2,9 et 21,1. L'extra peut aller de 0 à 24, puisqu'il s'envole et se fait couper au bord.
- **Centre optique en (12, 12)**. La masse principale mesure 16 à 19 unités dans sa plus grande dimension : ni timbre-poste, ni bord à bord.
- **Ce qui avance regarde à droite**, vers le libellé : cheval, poisson, voiture, fusée en diagonale vers le haut à droite.
- **Vue simple** : de face ou de profil. Une seule exception, le dé en perspective (une tuile de 24 px au moins).
- **Arrondis partout** : angles des chemins adoucis, aucune pointe plus fine que l'épaisseur du trait.

## 6. Trait, masse, détails

- **Une seule épaisseur : 1,75** (1,17 px à 16 px, 1,75 px à 24 px, 3,5 px à 48 px). Les bouts et les angles sont ronds.
- **La masse est la silhouette entière**, pas un détail coloré. Le trait la contourne, à cheval sur son bord. Les modèles ne font jamais de masse décalée du trait au repos.
- **Détails intérieurs : deux au plus** (une ouïe, un hublot, la limite de la crinière).
  - Les points (yeux, narine) sont des disques pleins de rayon 0,75 à 1,2.
  - Les trous de la masse ont un rayon de 1,15 à 2.
- **Petits aplats craie** permis dans le trait, par exemple le museau de l'ours. Ils doivent rester petits : la couleur doit dominer.
- **Écarts** : 2 unités de vide au moins entre deux traits parallèles, sinon ils se collent à 16 px. Aucun détail de moins de 1,5 unité.

## 7. Lisibilité à 16 px (puces des genres et des univers)

- **Test du noir** : remplie en noir, la silhouette seule doit suffire à un enfant de 4 ans pour dire ce que c'est.
- **Contrôle** sur `captures/icones/planche-<lot>.png`, colonne « normal », et sur la planche `--dpr 1 --largeur 1000`. Si un détail fait du bruit à 16 px, on l'enlève : la même icône sert aussi à 24 et 48 px.
- **Ni texte, ni lettre, ni chiffre**, avec trois exceptions :
  - « Mots » : une forme de lettre abstraite ;
  - « Calcul » : les signes + − × ;
  - « Quiz » : le signe ?.
  Les âges se disent avec des objets (doudou, cerf-volant, vélo, planche à roulettes).
- **Deux icônes ne se ressemblent jamais** : voir le tableau des métaphores (section 12) avant de dessiner.

## 8. Couleurs (posées par le CSS, jamais dans les sources)

| Contexte | Taille | Masse (`fond`) | Trait |
|---|---|---|---|
| Puce de genre | 16 px | `oklch(.72 (--c + .035) --teinte)` : teinte de la puce, un peu plus vive que son nombre | craie `#eceae4` |
| Puce d'univers | 16 px | idem (le `--c` des univers est plus faible : couleurs plus éteintes) | craie |
| Raccourcis (au hasard, j'ai aimé, hors ligne) | 24 px (26 px sur ordinateur) | lavande `#a8b3f0` (ce qu'on touche) | craie |
| Âges | 24 px (26 px) | une teinte par tranche, du chaud au froid (on grandit), `oklch(.76 .085 h)` : 3-4 ans h 28 (pêche), 5-6 ans h 82 (miel), 7-8 ans h 152 (menthe), 9 ans et + h 236 (ciel) | craie |
| Titre « Tendances » | 20 px | or `#f2d27a` (ce qui brille) | craie |

L'icône d'une tuile mesure 24 px, mais seuls 20 px comptent dans la hauteur (marge de −2 px). Les tuiles et les puces gardent exactement leur taille : 34 px pour les puces, sur une ligne par groupe qui défile si elle ne tient pas.

## 9. Bibliothèque d'animations (`data-anim`)

Il y a trois `@keyframes` par animation : `ico-<nom>-trait` (mène), `ico-<nom>-fond` (suit, environ 5 % plus tard et un peu moins loin) et `ico-<nom>-extra`. Les déplacements sont exprimés en % de l'icône, pour avoir la même allure à 16 et à 48 px. Aucune animation ne tourne en boucle. Elles sont définies dans `generer.mjs` (`ANIMATIONS`).

| Nom | Durée | Geste | Pivot par défaut | Extra (où le dessiner) | Pour |
|---|---|---|---|---|---|
| `sautiller` | 560 ms | s'écrase, bondit (−24 %), retombe en souplesse | bas (50 % 92 %) | **éclat** à l'atterrissage | personnages, animaux, doudous, objets mous |
| `galoper` | 660 ms | se cabre deux fois (−10°, −7°) en se balançant | bas (50 % 90 %) | **traînée** : naît à `data-origine-extra` et file vers la gauche | chevaux, véhicules, course |
| `osciller` | 720 ms | balancement amorti (−14°, +11°, −7°…) | bas (50 % 100 %) ; à régler avec `data-origine` | **montée** : naît à `data-origine-extra` et monte | notes, cerf-volant, fleurs, médaille, cintre |
| `tourner` | 700 ms | prend son élan, un tour complet en l'air, retombe | centre | **éclat** à l'atterrissage | dé, ballon, roue, globe, labyrinthe |
| `decoller` | 720 ms | recule comme un ressort, s'élance en haut à droite (+16 %), revient | 50 % 70 % | **suit** l'icône depuis `data-origine-extra` (flamme), puis s'éteint | fusée, avion, flèche, coup de poing, planche à roulettes |
| `nager` | 720 ms | ondule d'avant en arrière | centre | **montée** depuis `data-origine-extra` (bulles) | poisson, bateau, loupe qui balaie, crayon qui gribouille |
| `pulser` | 620 ms | double battement ; la couleur gonfle plus que le trait | 50 % 55 % | **éclat** au premier battement | cœur, pouce, bouclier, potion, étoile |
| `emboiter` | 640 ms | se soulève en pivotant, s'enclenche avec un « clic » | centre | **éclat** au moment du clic | puzzle, blocs, cartes, pansement |
| `secouer` | 520 ms | tremblement électrique ; la couleur tremble à contretemps (petit effet « bug » de jeu vidéo) | centre | **clignote** 3 fois en place | réflexes, cible, monstre, lion qui rugit |
| `scintiller` | 700 ms | presque immobile : gonfle à peine en tournant un peu | centre | **éclat** lent (s'installe, puis s'envole) | magie, livre, château, temple, ville, ce qui ne bouge pas |

**Où dessiner l'extra** selon son comportement :
- **Éclat** : l'image grandit depuis le centre (de 70 % à environ 165 %) ; les éléments sortent de la boîte et se font couper. Les placer dans la couronne extérieure, à plus de 7 unités du centre (coins, bords). Un ou deux éléments par côté, trois en tout au plus.
- **Montée** et **traînée** : l'image naît à `data-origine-extra`, puis se déplace (vers le haut, ou vers la gauche) et disparaît. Dessiner les éléments à leur place de départ, près de ce point.
- **Suit** : l'image accompagne le geste. La dessiner collée à l'objet (la flamme sous la tuyère) et poser `data-origine-extra` au point d'attache.
- **Clignote** : 2 ou 3 étincelles à leur place définitive.

L'extra se dessine **derrière** l'icône : la masse et le trait passent devant. Sur une puce choisie (fond clair), il est masqué ; seule l'icône bouge.

**Étincelle type** (étoile à 4 branches de rayon r, centrée en (x, y)) :
`M{x} {y−r}q0 {r} {r} {r}-{r} 0-{r} {r} 0-{r}-{r}-{r} {r} 0 {r}-{r}Z` (exemple : `M3 1.4q0 2 2 2-2 0-2 2 0-2-2-2 2 0 2-2Z`). Rayon de 1,2 à 2.

## 10. États

| État | Puce (genre, univers) | Tuile (raccourci, âge) |
|---|---|---|
| Normal | masse dans la teinte, trait craie | masse lavande ou teinte d'âge, trait craie |
| Survol (souris seulement) ou focus clavier | le contour de la puce s'éclaire (style.css) et l'icône joue son animation, une fois | le liseré s'éclaire, l'icône s'anime |
| Choisie (`aria-pressed="true"`) | la puce se remplit de sa teinte claire ; l'icône passe en trait nuit sur une masse plus soutenue, `oklch(.6 (--c + .08) --teinte)`. L'animation se joue une fois à l'apparition (app.js recrée la puce à chaque clic), sans extra | surface choisie, anneau lavande, coche ; l'icône garde ses couleurs et s'anime une fois |
| « 0 jeu » (`.puce-zero`, `.tuile-zero`) | trait craie douce, masse à 45 % ; anime encore au survol | idem |
| Bientôt (`.puce-bientot`, `.tuile-bientot`, `disabled`) | gris ardoise (masse `#323c5a`, trait craie faible), immobile | idem ; mais « J'ai aimé » et « Hors ligne » vides restent normaux (c'est une invitation), immobiles |
| Mouvements réduits | immobile, pas d'extra | idem |
| Couleurs forcées (contraste élevé de Windows) | masse `GrayText`, trait `CanvasText` | idem |

**Repli** : une clé sans source garde son emoji, sans rien à faire. Il en va de même pour tout le bloc dans un navigateur sans masques CSS (`@supports`). L'emoji reste aussi dans les puces des filtres choisis, au-dessus des jeux : ce ne sont pas des icônes.

## 11. Originalité (règle absolue)

- **Créations originales seulement.** Aucun personnage, vaisseau, logo ou forme protégée :
  - pas d'envahisseur pixelisé ni de Pac-Man ;
  - pas de champignon à pois, de Pokéball ou de brique à tenons façon jouet de construction ;
  - pas de manette d'une marque reconnaissable (ni boutons △○✕□, ni forme de manette de console connue) ;
  - pas de tête de mort pour les pirates (public de 3 ans).
- **Pas de violence ni de peur** : le gant de boxe reste rond et gai ; le monstre est mignon.

## 12. Métaphores : une par clé, toutes différentes

Métaphores prévues au départ pour chaque clé. Une icône a pu s'en écarter un peu au dessin : en cas de doute, regarder la planche. Toute nouvelle icône doit rester distincte de toutes les lignes ci-dessous (et y être ajoutée).

**Raccourcis et âges (tuiles)**

| Clé | Métaphore | Animation |
|---|---|---|
| `hasard` | dé en perspective, points percés (1 dessus, 2 à gauche, 3 à droite) | tourner |
| `collection:aimes` | pouce levé, même dessin que le pouce de vote du lanceur | pulser |
| `collection:hors-ligne` | téléphone avec une flèche qui descend dedans (jeu gardé sur l'appareil) ; jamais de signal barré | sautiller |
| `collection:multi` | deux petits joueurs côte à côte (tête ronde, épaules) ; ni manette ni écran | sautiller |
| `age:3-4` | doudou ours : yeux et truffe percés, museau craie | sautiller |
| `age:5-6` | cerf-volant en losange, queue à nœuds (pivot en bas de la ficelle) | osciller |
| `age:7-8` | vélo de profil, deux roues | galoper |
| `age:9+` | planche à roulettes de profil, nez relevé | decoller |

**Genres**

| Clé | Métaphore | Animation |
|---|---|---|
| `genre:puzzle` | pièce de puzzle : deux tenons, une encoche | emboiter |
| `genre:memoire` | grille 2 × 2 de tuiles carrées : deux montrent la même étoile (une paire trouvée), deux sont de dos | pulser |
| `genre:quiz` | bulle de dialogue ronde avec un « ? » au trait | osciller |
| `genre:mots` | une grande forme de lettre abstraite (un « A » géométrique) posée sur une ligne d'écriture | sautiller |
| `genre:calcul` | signes + et − (et ×) en gros, sans chiffres | tourner |
| `genre:arcade` | manche à boule sur son socle, un bouton rond | osciller (pivot au socle) |
| `genre:plateforme` | deux plateformes en escalier et une petite bille en plein saut | sautiller |
| `genre:course` | drapeau à damier qui flotte | nager |
| `genre:aventure` | carte au trésor roulée aux bouts, chemin en pointillé, croix | osciller |
| `genre:strategie` | pion d'échecs (silhouette classique) | sautiller |
| `genre:simulation` | pansement en diagonale | emboiter |
| `genre:creation` | robe sur un cintre (pivot au crochet) | osciller |
| `genre:musique` | deux croches liées | osciller |
| `genre:autre` | manette générique et simple (croix et deux ronds, aucune forme de console connue) | secouer |

**Univers**

| Clé | Métaphore | Animation |
|---|---|---|
| `univers:animaux` | empreinte de patte : coussinet arrondi et quatre doigts ovales séparés (regroupe la ferme, les animaux sauvages et de compagnie) | sautiller |
| `univers:chevaux` | tête de profil, crinière en mèches, encolure arrondie (ce n'est pas un cavalier d'échecs) | galoper |
| `univers:dinosaures` | dinosaure à long cou, de profil | galoper |
| `univers:ocean` | poisson rond, ouïe, bulles | nager |
| `univers:espace` | fusée ronde en diagonale, hublot percé, flamme | decoller |
| `univers:fantasy` | baguette magique à étoile | scintiller |
| `univers:nature` | arbre rond sur son tronc | osciller |
| `univers:cuisine` | cupcake et sa cerise | sautiller |
| `univers:vehicules` | petite voiture de profil | galoper |
| `univers:sport` | médaille et son ruban (pivot en haut) | osciller |
| `univers:monde` | globe terrestre de bureau, incliné sur son pied (différent du globe au trait du bouton de langue) | tourner |
| `univers:ville` | trois immeubles à fenêtres | scintiller |
| `univers:autre` | trois étincelles de tailles différentes | scintiller |

## 13. Avant de publier

- [ ] `node scripts/icones/generer.mjs --verifier` n'affiche aucune erreur ni aucun avertissement pour mes sources.
- [ ] Sur `captures/icones/planche-<lot>.png`, à 16 px :
  - la silhouette est reconnaissable ;
  - rien ne bave ;
  - les trous se voient.
- [ ] À 48 px, l'icône est belle : courbes propres, pas de bosse ni de pointe accidentelle.
- [ ] Mon icône ne ressemble à aucune autre.
- [ ] Les quatre états se lisent sur la planche :
  - choisie : trait nuit sur la teinte claire ;
  - « 0 jeu » ;
  - « Bientôt ».
- [ ] Sur `captures/icones/planche-<lot>-anim.png` :
  - le geste se comprend à 25, 50 et 75 % ;
  - l'extra apparaît là où il faut ;
  - rien ne reste visible à la fin.
- [ ] Aucune lettre ni aucun chiffre, sauf les exceptions de la section 7.
- [ ] Rien de protégé, rien d'effrayant.
- [ ] `node scripts/icones/generer.mjs` lancé : le bloc de `public/style.css` est à jour (`--verifier` le confirme).
- [ ] Je n'ai écrit que dans `scripts/icones/sources/` (et, par le générateur, entre les repères de `public/style.css`).
