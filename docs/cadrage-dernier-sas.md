# « Le Dernier Sas » — cadrage (jeu de tir en vue subjective, solo puis coopération à 4)

> État : décisions du propriétaire prises le 12 novembre 2026 (cahier des charges « Défense du bunker » et réponses ci-dessous). Jeu solo publié le 13 novembre 2026 ; **coopération en ligne à 2, 3 ou 4 faite le 14 novembre 2026** (section 7).
> À lire avec `docs/cadrage-temps-reel.md` (moteur temps réel), `CONSIGNES-JEU.md` et `CLAUDE.md`.

## 1. Ce que veut le propriétaire

Un jeu de tir à la première personne, en 3D, dans le navigateur : on défend le sas d'un bunker contre des vagues d'aliens insectoïdes qui arrivent en masse, de plus en plus nombreux et coriaces. Entre deux vagues, on achète tourelles, soins et objets. Seul ou à 2, 3 ou 4 en coopération (la coopération est la priorité du propriétaire).

Décisions du propriétaire (12 novembre 2026) :

| Sujet | Décision |
| --- | --- |
| Public | **13 ans et +** (ambiance sombre, giclées vertes ; règles « 13+ » de `CONSIGNES-JEU.md`) |
| Titre | **Le Dernier Sas** (`le-dernier-sas`) |
| Forme d'une partie | **Survie sans fin** seulement (vagues de plus en plus dures, record) : exception à la règle des 20 niveaux, donc pas de `"consignes": 2`, et `"sans_fin": true` |
| Coopération | **Partie rapide** (recherche automatique de 15 s) **et partie privée** (code de salon à 4 caractères) |
| Économie en coopération | **Mixte** : chacun sa bourse (crédits des aliens qu'il tue), prime de fin de vague partagée à parts égales |
| Publication | **Dès que le solo est prêt** ; la coopération arrive par une mise à jour |
| Images et modèles | Bibliothèque locale d'assets (packs Kenney, CC0) permise |

Choix de Claude (annoncés au propriétaire) : le moteur temps réel existant est étendu de 2 à 4 joueurs, sans nouvelle couche réseau ; commandes tactiles dès le départ (règle du site) ; V1 à V3 du cahier des charges (solo, coopération, boss, capacités, déblocages permanents), les PNJ alliés (V4) viendront plus tard.

Hors périmètre pour l'instant : PNJ alliés recrutables, plusieurs zones du bunker, bouton « Rejoindre » d'un ami, classement par jeu, crédit d'expérience des manches en ligne, pseudos des joueurs.

## 2. Contraintes du site

- Un seul fichier `games/le-dernier-sas/index.html` de moins de 2 Mo, sans aucune ressource externe ; 5 langues ; sauvegarde `save.js` ; `FMG.reportEnd` ; jaquette sans texte ; clavier-souris **et** tactile ; portrait de téléphone d'abord.
- Le cadre du jeu autorise déjà le verrouillage du pointeur (`allow-pointer-lock` dans `public/play.html`).
- 3D : **moteur WebGL2 maison** (pas de Three.js : aucune dépendance, taille maîtrisée), modèles en aplats de couleur, rendu par instances (des dizaines d'aliens, 60 images par seconde).
- Modèles : armes du « Blaster Kit », décors et tourelles du « Space Kit », portes et structures du « Space Station Kit » (Kenney, CC0), convertis en un bloc binaire compact (`sas-modeles` : positions sur 16 bits, normales, couleurs par sommet). Les aliens sont modélisés par le code (aucun pack n'en propose). Crédits en commentaire dans le fichier.
- Sons : Web Audio seulement (règle du site ; pas de fichier audio).

## 3. Le jeu

**Boucle** : préparation (boutique, 45 s au plus, bouton « Lancer la vague ») → vague → prime et retour à la préparation. Défaite : le sas est détruit, ou tous les joueurs sont à terre. Pas de victoire : on vise la plus haute vague et le meilleur score.

**Carte** : une esplanade de 48 m sur 60 m au fond d'un canyon. Au sud, la façade du bunker et son sas (l'objectif, avec ses points de vie). Au nord, trois galeries d'où sortent les aliens ; une quatrième brèche, près du sas, s'ouvre par surprise dans certaines vagues. Rochers et caisses (obstacles), 6 emplacements de tourelle, 4 emplacements de barricade.

**Joueur** : 100 points de vie (régénération lente hors combat), sprint, 5 armes, grenades, mines, kits de soins, 4 capacités à temps de recharge. Seul, une seconde chance par vague : mis à terre, il se relève près du sas au bout de 4 secondes ; la deuxième fois, la partie est perdue. Les aliens des 4 premières vagues font moins mal (le temps d'apprendre).

| Arme | Rôle | Obtention |
| --- | --- | --- |
| Pistolet blaster | précis, munitions infinies | au départ |
| Fusil d'assaut | automatique | boutique |
| Fusil à dispersion | 8 plombs, de près | boutique (grade 2) |
| Fusil de précision | traverse 3 aliens | boutique (grade 4) |
| Lance-plasma | explosion de zone | boutique (grade 6) |

**Aliens** (définis dans les données de la simulation) :

| Type | Rôle | Arrive |
| --- | --- | --- |
| Rampant | petit, rapide, en nuée, au corps à corps | vague 1 |
| Guerrier | plus résistant ; à partir de la vague 8, il mue à mi-vie et se met à cracher (effet de surprise) | vague 3 |
| Cracheur | tire de loin un projectile esquivable | vague 4 (en fin de vague, par surprise) |
| Blindé | gros, lent, carapace frontale (il faut le contourner ou viser haut) | vague 7 |
| Bombardier | court vers les tourelles et le sas, explose (et blesse aussi les aliens autour de lui) | vague 9 |
| Matriarche (boss) | 3 phases : pond des rampants, crache en salves, charge le sas | toutes les 5 vagues |

Cibles : le sas d'abord, les tourelles et barricades sur le chemin, les joueurs proches. Les 20 premières vagues sont écrites à la main (composition, rythme, galeries, événements : brèche, nuit, ruée) ; au-delà, elles sont calculées (toujours plus dures). Mise à l'échelle en coopération : nombre d'aliens × (1 + 0,6 × (joueurs − 1)), gros aliens un peu plus résistants.

**Boutique** (préparation seulement) : armes, munitions, kit de soins, grenades, mines, tourelle mitrailleuse, tourelle lourde, amélioration des tourelles (3 niveaux), barricade, réparation du sas.

**Capacités** (temps de recharge, débloquées par le grade) : bouclier, frappe aérienne, ralentissement, soin de zone.

**Progression permanente** : chaque partie rapporte de l'expérience ; les **grades** (10) débloquent pour les parties suivantes armes, tourelles, objets et capacités. Gardée dans la sauvegarde du jeu (`JEL_SAVE`), avec le record et les réglages.

**Sauvegarde** : à chaque vague gagnée, la partie solo est gardée (vague, score et état de la partie) : « Continuer » reprend à la préparation de la vague suivante. Les parties en ligne ne sont pas reprises.

**Site** : `"ages": "13+"`, genre `arcade`, genre secondaire `strategie`, univers `espace`, `"sans_fin": true`. `FMG.reportEnd({ completed: false, level: <vague> })` à chaque vague gagnée et à la défaite.

## 4. Architecture du fichier

```text
index.html
├─ jel-i18n-textes, jel-i18n, jel-sauvegarde     (modules communs, posés par i18n-jeu.mjs)
├─ jel-tr           moteur temps réel du site (recopié par i18n-jeu.mjs, depuis la version coopérative)
├─ sas-modeles      modèles 3D convertis (JSON + base64)
├─ jel-sim          la simulation : fonctions pures (contrat jel-sim), données d'équilibrage en tête
├─ sas-gl           moteur de rendu WebGL2 (instances, particules, ciel, sol)
├─ sas-creatures    modèles des aliens fabriqués par le code
├─ sas-son          sons Web Audio
└─ script du jeu    commandes, caméra, interface, boutique, effets, sauvegarde
```

**La simulation suit dès la version solo le contrat `jel-sim`** du moteur temps réel (`depart`, `valide`, `ordre`, `pas`, `bot`, `fin`, hasard tiré de l'état, aucune horloge, aucun accès à la page) : la version coopérative ne réécrit rien, elle branche la même simulation sur `JEL_TR`. En version solo (versions 1 et 2 du jeu), le bloc s'appelait `sas-sim` et un petit pilote local (même interface que `JEL_TR.Partie`) le faisait tourner ; depuis la version 3, c'est le bloc `jel-sim` et le moteur `JEL_TR` le fait tourner, seul comme en ligne.

- Tick de 50 ms (20 par seconde), délai d'entrée d'un tick ; rendu interpolé entre deux ticks.
- Nombres à virgule avec seulement + − × ÷ et les fonctions garanties (`JEL_TR.flottant`), comme Nova Dominion.
- Données d'équilibrage (`DONNEES` en tête du bloc : armes, aliens, tourelles, boutique, vagues) : un objet au format JSON, modifiable sans toucher au code.

## 5. Un jeu de tir dans un moteur à ticks

Le cadrage du temps réel écartait les jeux de tir (latence). Trois règles les rendent possibles ici, parce qu'on tire sur des aliens tenus par la simulation et jamais sur un autre joueur :

1. **Le joueur est maître de son corps.** Son appareil le déplace et l'oriente sans attendre ; il envoie sa position à la simulation (ordre `BOUGER`, 10 fois par seconde au plus), qui refuse seulement l'impossible (vitesse, murs). Les autres joueurs le voient avec un léger retard, lissé.
2. **Le tireur a raison.** L'appareil du tireur calcule lui-même qui est touché, sur ce qu'il voit (ordre `TIRER` : arme et aliens touchés, zone haute ou non). La simulation vérifie le plausible (arme, cadence, munitions, portée) et applique les dégâts. L'effet du tir (éclair, impact) est immédiat ; les dégâts arrivent un à quatre ticks plus tard.
3. **Tout le reste est dans la simulation** : aliens, tourelles, projectiles, explosions, économie, vagues. Tous les appareils voient donc les mêmes aliens aux mêmes endroits.

Ordres (entiers) : `BOUGER [1, x, y, lacet, sprint]`, `TIRER [2, arme, touche…]`, `EXPLOSIF [3, arme, x, y]`, `ARME [4, n]`, `RECHARGER [5]`, `ACHETER [6, article, emplacement]`, `OBJET [7, type, x, y]` (grenade, mine, kit, capacités), `PRET [8]`.

Robot d'un camp (`ctl` ≠ 0, joueur absent en ligne) : le personnage se replie près du sas et tire sur l'alien le plus proche. La triche est sans enjeu (coopération contre des aliens).

## 6. Commandes

- **Ordinateur** : déplacement ZQSD / WASD (lu par `event.code`) ou flèches, souris pour viser (pointeur verrouillé), clic pour tirer, R recharger, 1 à 5 armes (ou molette), G grenade, T mine, H kit de soins, C V F X capacités, Maj sprint, B boutique, Entrée lancer la vague, Échap ou P pause.
- **Tactile** : manette virtuelle à gauche, glisser à droite pour viser, bouton de tir (tir automatique quand le viseur est sur un alien, réglable), boutons recharger, arme suivante, grenade, kit, capacités. Portrait et paysage.

## 7. Coopération en ligne (fait le 14 novembre 2026)

Le moteur temps réel du site savait déjà réunir 2 à 8 camps, relier les joueurs en étoile, mettre un robot à une place libre et faire repartir une partie (`docs/cadrage-temps-reel.md`, section 16) : l'ancienne « pull request 2 » n'a pas été nécessaire. Le jeu s'y branche ; le détail du moteur (code de salon, ordres groupés, contrôles) est dans `docs/cadrage-temps-reel.md`, **section 17**.

**Ce que voit le joueur**

- Écran titre : « Jouer » (seul, inchangé, partie gardée) et « Jouer en ligne » : **Partie rapide** (recherche de 15 s), **Créer une partie privée** (un code de 4 caractères s'affiche en très gros), **Rejoindre avec un code** (pavé de touches à l'écran : aucun texte libre).
- Salon : joueurs réunis sur 4, « Lancer avec n joueurs » dès 2 (n'importe quel membre), « Jouer avec des robots maintenant », « Annuler ». À 4, la partie commence d'elle-même.
- Quatre personnages dans toutes les parties en ligne : les places libres sont tenues par des **robots coéquipiers** (niveau moyen), qui gardent le sas, achètent un fusil et une tourelle, tirent, relèvent un joueur à terre. Hors connexion ou sans personne : la partie se joue sur l'appareil avec trois robots.
- En partie : coéquipiers de couleur avec leur étiquette (« Joueur 2 », « Robot 3 »), liste de l'équipe et de sa vie, tirs visibles, radar ; **réanimation** : rester 3 s près d'un coéquipier à terre (anneau rouge au sol, jauge) ; à terre, on attend 40 s au plus d'être relevé, sinon on revient à la vague suivante ; la partie est perdue quand le sas tombe ou que plus personne n'est debout.
- **Économie mixte** : chacun sa bourse (crédits des aliens qu'il tue) ; la prime de fin de vague grandit avec l'équipe et se partage à parts égales ; chacun achète pour lui (armes, objets) ou pour tous (tourelles, barricades, réparation du sas).
- Pas de pause en ligne : le menu s'ouvre, la partie continue ; « Quitter la partie » laisse la place à un robot. Dans la boutique, le compte à rebours continue ; la vague part quand tout le monde est prêt.
- Fin : bilan par joueur (score, aliens abattus), expérience et grade comme seul. Le record de l'écran titre reste celui des parties jouées seul. Une partie en ligne n'est pas gardée pour « Continuer ».

**Dans la simulation** (`jel-sim`) : mode `coop` (4 camps, une seule équipe), `depart` lit `config.camps` et `config.ctl`, échelle des vagues fixée au départ (`etat.ech` : joueur 1, robot 0,5 ; aliens × (1 + 0,6 × (échelle − 1)), sas et gros aliens plus solides, prime plus grosse), seconde chance réservée au jeu seul, robot coéquipier (achats, réanimation, grenades au niveau 3, chasse aux derniers aliens), `fin` sans équipe gagnante, `essais` pour le robot de contrôle. Correction au passage : un gros alien pouvait rester coincé derrière un rocher (il glisse maintenant du côté qui le rapproche de sa cible).

**Dans le jeu** : la classe `PartieLocale` a disparu ; deux parties `JEL_TR` (celle du joueur, la démonstration de l'écran titre) ; `ordonner()` applique tout de suite un ordre quand le temps est arrêté (boutique d'une partie sur l'appareil) ; sauvegarde par l'instantané du moteur (`VERSION_ETAT` 2 : une partie gardée par la version 2 du jeu reprend au début de sa vague).

**Limites connues** : une partie en ligne s'arrête sur le serveur au bout de 20 minutes (chacun continue avec des robots) ; pas de pseudo ; pas de reconnexion automatique à un salon privé pendant l'attente ; essai sur de vrais téléphones à faire.

## 8. Critères d'acceptation

- Solo : 50 aliens à l'écran à 60 images par seconde sur un ordinateur moyen ; 20 vagues écrites jouables de bout en bout, puis vagues calculées ; achats, tourelles, boss, capacités, grades ; tous les contrôles du site verts (`validate-games --jouer`, `check-i18n`, `tester-sauvegarde`, `controle-taxonomie`, `verifier-seo`).
- Coopération : 4 joueurs voient les mêmes aliens aux mêmes endroits (hachages identiques) ; le départ ou la coupure d'un joueur, pair horloge compris, ne casse pas la partie ; les deux jeux à 2 joueurs passent leurs tests inchangés.

## 9. Découpage

1. **Pull request 1 — jeu solo** (`dernier-sas-solo`, fusionnée le 13 novembre 2026) : `games/le-dernier-sas/`, ce document, `CLAUDE.md`.
2. **Interface tactile** (`dernier-sas-mobile`, 14 novembre 2026) : boutons agrandis, plein écran, aide à la visée ; version 2.
3. **Coopération** (`dernier-sas-coop`, 14 novembre 2026, par-dessus la précédente) : `"temps_reel": true`, blocs `jel-tr` et `jel-sim`, menus et salon, code de salon dans le moteur, réanimation, textes, robot de contrôle, politique de confidentialité ; version 3. Le moteur à 4 joueurs prévu en pull request à part existait déjà (modes à plusieurs du 12 novembre).
