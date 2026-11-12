# Multijoueur en temps réel — cadrage (prototype : stratégie temps réel 1 contre 1)

> État : **proposition à valider par le propriétaire** (12 novembre 2026). Aucun code n'est écrit avant sa validation.
> À lire avec `docs/multijoueur.md` (multijoueur tour par tour, qui doit continuer à marcher sans régression) et `CLAUDE.md`.
> Coûts mesurés : `docs/couts-temps-reel.md`, rédigé à l'étape 6 (section 12), une fois une vraie partie de 15 minutes mesurée.
>
> **Décisions du propriétaire (12 novembre 2026)** : pair-à-pair accepté, avec l'adresse IP visible par l'autre joueur et un paragraphe dans la politique de confidentialité (section 11, point 1) ; prototype « Petites planètes » (vaisseaux-graines qui colonisent des planètes et leurs lunes, univers `espace`, genre `strategie`, 7+) ; jeu publié dans le catalogue dès la fusion (section 11, point 7).

## 1. Le multijoueur existant, en résumé

Lu dans `docs/multijoueur.md`, `multijoueur/src/*.js`, `public/multijoueur/*.js` et `public/play.js`.

| Brique | Ce qu'elle fait aujourd'hui |
| --- | --- |
| Worker `fmg-multijoueur` (`multijoueur/src/index.js`) | `GET /etat`, `GET /ws` (contrôle du site d'origine, du jeu, de l'empreinte SHA-256 des règles et du `PROTOCOLE`), `GET /partie` (rejoindre un ami), `/presence`. Domaine `multi.freemicrogames.com`, déployé depuis `main` par `multijoueur.yml`. |
| Durable Object « Accueil » (`accueil.js`, un seul) | Répartit les joueurs : partie du jeu la plus remplie sans être pleine, sinon nouvelle partie ; limite globale `MAX_JOUEURS` (80). Une écriture par appel. |
| Durable Object « Partie » (`partie.js`, un par partie) | L'arbitre. WebSocket **Hibernation** (`acceptWebSocket`, `ping`/`pong` automatique), **aucune minuterie**, une seule alarme (temps laissé à un joueur, salon de 90 s, veille de 15 min). Une ligne écrite par message reçu. Limites : 4 000 caractères par message, 30 messages par 10 s. Plus aucun joueur → `deleteAll`. Ticket signé (profil, pseudo) et résultats de manche envoyés au site. |
| Durable Object « Presence » (`presence.js`) | Présence des amis (hors sujet ici, mais il consomme le même quota). |
| Moteur commun `jel-multi` (`public/multijoueur/moteur.js`, protocole 2) | Le **même fichier** tourne dans le jeu, dans le Worker et dans les tests. `Arbitre` : places, robots, coups, manches, salon et chef. `Partie` (côté jeu) : connexion par le lanceur, repli en solo après 6 s, bascule en solo au même point si la connexion coupe. Hasard reproductible `mulberry32`, graine envoyée avec chaque coup. |
| Règles d'un jeu (`jel-regles`) | Fonctions pures `depart`, `aQui`, `valide`, `jouer`, `bot`, `fin`, état en JSON, recopiées dans le Worker par `scripts/multijoueur.mjs` (`src/jeux.js`, empreinte comparée à la connexion). |
| Robots | Toute place vide est un robot, dès le salon. Un arrivant prend la place d'un robot, un partant la rend. Le serveur calcule d'un coup tous les coups des robots jusqu'au tour d'un vrai joueur, les appareils les affichent espacés de `delaiBot`. |
| Lanceur (`public/multijoueur/lanceur.js`) | Le jeu, dans un cadre isolé sans aucun accès réseau (`CSP_JEU` : `connect-src 'none'`), demande la connexion par `postMessage` (`jel-multi`). Le lanceur ouvre le WebSocket, passe les messages dans les deux sens, ferme la connexion après 60 s de page cachée. Sites permis : `SITES_MULTI` de `config.js` ; ailleurs, robots locaux. |
| Contrôles | `scripts/tester-multijoueur.mjs` : règles pures, parties simulées, Worker avec de faux Durable Objects, `--navigateur` (faux serveur). Aucun test avec `wrangler dev` aujourd'hui ; `wrangler` n'est pas installé dans le dépôt (`npx` au déploiement). |

Pourquoi ce modèle ne suffit pas au temps réel : il ne connaît que des coups à tour de rôle (`aQui` désigne une seule place) et n'a aucune horloge (c'est ce qui le rend presque gratuit). Une stratégie temps réel demande une horloge commune à 10 ticks par seconde et des ordres simultanés.

## 2. Principes retenus

1. **La partie contre un robot est le cas normal.** Elle tourne à 100 % sur l'appareil, sans aucune requête pendant la partie, et démarre en moins de 16 s (15 s de recherche au plus), tout de suite hors connexion.
2. **Une seule simulation déterministe**, la même partout : sur l'appareil, chez l'autre joueur et dans le Durable Object en mode relayé. Seuls les ordres circulent.
3. **Une seule horloge par partie, à trois endroits possibles** (idée centrale du cadrage) : un « cadenceur » unique, écrit une fois dans le moteur commun, qui numérote les ticks, horodate les ordres (tick courant + délai d'entrée) et diffuse un paquet par tick. Il tourne :
   - sur l'appareil en partie contre le robot ;
   - chez l'un des deux joueurs en pair-à-pair (le « pair horloge ») ;
   - dans le Durable Object en mode relayé.
   Le code des clients est donc le même dans les trois cas : ils reçoivent des paquets de ticks et les jouent. C'est ce qui rend la bascule pair-à-pair → relayé invisible pour le joueur, et c'est ce que les tests rejouent.
4. **Le robot fait partie de la simulation.** Le camp tenu par un robot est un champ de l'état (`controle[camp]` : humain ou niveau du robot) ; à chaque tick concerné, la simulation calcule elle-même les ordres du robot avec son propre hasard. Aucun ordre de robot ne passe sur le réseau. Passer un camp au robot (ou le rendre à un humain) est un ordre de contrôle horodaté par le cadenceur : tout le monde bascule au même tick.
5. **Rien ne change pour le tour par tour** : nouveaux fichiers, nouvelles adresses (`/tr/…`), nouvelles classes de Durable Objects ; `moteur.js`, `partie.js`, `accueil.js` et leur `PROTOCOLE` ne bougent pas (section 13).

## 3. Architecture

```text
 Téléphone A                                        Cloudflare (Worker fmg-multijoueur, déjà déployé)
 ┌────────────────────────────────────────┐
 │ Lanceur /play                          │  WebSocket    ┌──────────────────────────────────────┐
 │  temps-reel/lanceur.js ────────────────┼─────────────▶ │ /tr/ws    → « Rencontre » (1 par jeu)│
 │   - WebSocket rencontre et duel        │  (hiberne)    │            recherche, compteur,      │
 │   - RTCPeerConnection + DataChannel ◀──┼──┐            │            appariement               │
 │        ▲ postMessage « jel-tr »        │  │            │ /tr/duel  → « Duel » (1 par partie)  │
 │        ▼                               │  │ pair-à-    │            signalisation WebRTC,     │
 │ ┌────────────────────────────────────┐ │  │ pair       │            relais + cadenceur,       │
 │ │ Jeu (cadre isolé, aucun réseau)    │ │  │ (STUN      │            journal, instantanés      │
 │ │  jel-tr  : moteur temps réel       │ │  │ public)    │ « Budget » (1 seul) : consommation   │
 │ │  jel-sim : simulation + robot      │ │  │            │            du jour, seuil de 80 %    │
 │ │  rendu requestAnimationFrame       │ │  │            └──────────────────────────────────────┘
 │ └────────────────────────────────────┘ │  │
 └────────────────────────────────────────┘  │
 Téléphone B (même chose) ◀──────────────────┘
```

- **Le jeu reste sans réseau.** Comme pour le tour par tour, le lanceur fait tout le réseau : WebSocket, et maintenant `RTCPeerConnection` (le cadre isolé ne doit pas ouvrir de connexion lui-même). Le jeu et le lanceur se parlent par `postMessage` (`type: 'jel-tr'`) ; ce passage coûte une fraction de milliseconde.
- **Même Worker, nouvelles classes** : `Rencontre`, `Duel` et `Budget` s'ajoutent dans `multijoueur/wrangler.toml` (migration `v3`, `new_sqlite_classes`). Un seul domaine, un seul déploiement. Revers : un déploiement coupe aussi les parties temps réel relayées (elles continuent alors contre le robot, section 7).
- **STUN public** : `stun:stun.cloudflare.com:3478` (gratuit), puis `stun:stun.l.google.com:19302` en secours. Pas de TURN (décision du propriétaire, section 11).

### Fichiers

| Fichier | Rôle |
| --- | --- |
| `public/temps-reel/moteur.js` (`jel-tr`, `window.JEL_TR`) | moteur commun : entiers (`racineEntiere`, `div`, sinus entier sur 64 directions), hasard gardé dans l'état (`tirer`, `aleaDe`), hachage (`hacher`), contrôle « état entier » (`premierFlottant`), `Simulation` (tick, journal, instantanés, hachages), `Cadenceur` (l'horloge), `Partie` côté jeu (recherche, partie contre le robot, en ligne, reprise, bascule). Recopié dans le jeu par `scripts/i18n-jeu.mjs` (bloc `jel-tr`, après `jel-sauvegarde`), importé par le lanceur, le Worker et les tests. |
| `public/temps-reel/lanceur.js` | côté lanceur (`play.js`) : WebSocket de recherche et de duel, WebRTC, pair horloge, bascule vers le relais, secours, journal des connexions (console « [temps réel] »). |
| `games/<id>/index.html`, bloc `jel-sim` (`window.JEL_SIM`) | la simulation du jeu et son robot (fonctions pures, section 5), recopiée dans le Worker. |
| `multijoueur/src/temps-reel/routes.js` | adresses `/tr/ws`, `/tr/duel`, `/tr/attente`, `/tr/etat` (contrôles du site, du jeu, de l'empreinte, du protocole). |
| `multijoueur/src/temps-reel/rencontre.js`, `duel.js`, `budget.js` | les trois nouveaux Durable Objects (migration `v3` de `wrangler.toml`). |
| `multijoueur/src/temps-reel/moteur-tr.js` | importe le moteur commun pour le Worker. |
| `multijoueur/src/jeux.js` | GÉNÉRÉ par `scripts/multijoueur.mjs` : en plus des règles du tour par tour (`JEUX`), les simulations des jeux temps réel et leur empreinte (`JEUX_TR`) ; ignoré par git. |
| `scripts/tester-temps-reel.mjs` | les tests obligatoires (section 10). |
| `docs/couts-temps-reel.md` | coûts mesurés et estimés. |

Fiche du jeu (`game.json`) : `"temps_reel": true`, **sans** `"multijoueur"` ni `"places"`, pour que les outils du tour par tour (`jel-regles`, `data-multi`, Worker, idées) l'ignorent. C'est `scripts/build-catalog.mjs` qui écrit dans `catalog.json` `"multijoueur": true, "temps_reel": true, "places": 2` : étiquette « Multi », rubrique « Multijoueur », données structurées `MultiPlayer`. `validate-games.mjs` vérifie le moteur `jel-tr` à jour, le bloc `jel-sim` avant le code du jeu, `JEL_TR.creer`, les boutons `data-tr="jouer"` (« Jouer en ligne ») et `data-tr="robot"` (« Jouer contre un robot maintenant », `partie.jouerRobot()`), et l'absence de code réseau. Pas de classement par jeu pour l'instant (`public/classement.js` écarte les jeux temps réel).

## 4. Parcours du joueur

```text
Écran titre ── « Jouer » ─────────────────────────────▶ parcours solo (20 niveaux contre le robot, sauvegarde)
           └── « Jouer en ligne » ──┬─ hors connexion, site de test, serveur absent ──▶ partie contre le robot (tout de suite)
                                    └─ recherche (15 s au plus, RECHERCHE_MS)
                                         │  « 2 joueurs cherchent »  ·  compte à rebours  ·  [Jouer contre un robot maintenant]
                                         ├─ adversaire trouvé ──▶ connexion pair-à-pair (5 s au plus) ──▶ partie en ligne
                                         │                          └─ échec ──▶ partie relayée par le Durable Object
                                         │                                       (refusée au-delà de 80 % du budget :
                                         │                                        message clair, partie contre le robot)
                                         └─ personne au bout de 15 s ──▶ partie contre le robot (aucune connexion ensuite)
Fin de partie contre le robot ── une seule lecture GET /tr/attente ──▶ « Un joueur est disponible, l'affronter ? »
```

- **Recherche** : le lanceur ouvre un WebSocket vers la « Rencontre » du jeu. Le compte à rebours tourne sur l'appareil ; la Rencontre envoie le nombre de joueurs en recherche **seulement quand il change** (message sortant, non facturé). À la fin des 15 s, ou au clic sur « Jouer contre un robot maintenant », le lanceur ferme la connexion et la partie contre le robot démarre aussitôt. Délai total : 15 s + moins d'une seconde.
- **Aucun humain n'arrive en cours de partie contre le robot** : la connexion est fermée pendant toute la partie (aucune requête, vérifié par le test 2).
- **Fin de partie contre le robot** : une seule requête `GET /tr/attente?jeu=<id>` (`{ "enRecherche": n }`). Si `n > 0` : « Un joueur est disponible, l'affronter ? » ; oui → recherche normale (l'appariement est alors presque immédiat). Hors connexion : rien n'est proposé.
- **Partie contre le robot, choix du niveau** : facile, moyen, difficile, proposé avant la recherche (et repris si personne n'est trouvé). Le parcours solo de 20 niveaux (règle du site) monte la force et varie les cartes.
- Partie en ligne : durée maximale `DUREE_MAX_MS` (20 min ; le jeu est pensé pour 8 à 12 min) ; au bout, victoire aux points.

## 5. Simulation déterministe (commune à tous les modes)

### Contrat de la simulation (`jel-sim`)

```js
window.JEL_SIM = {
  camps: 2,
  periodeBot: 5,                                      // un robot réfléchit tous les 5 ticks (0,5 s)
  reglages: { tickMs: 100, delaiEntree: 2 },          // tick fixe et délai d'entrée N (paramétrables)
  depart(graine, config) { … return etat; },          // état de départ (config : carte du niveau, ou { ligne: 1 } en ligne)
  valide(etat, camp, ordre) { … return true; },       // ordre [type, a, b, c] permis ? (sinon ignoré, sans erreur)
  ordre(etat, camp, ordre) { … },                     // applique un ordre validé
  pas(etat, alea) { … },                              // avance d'un tick
  bot(etat, camp, niveau, alea) { … return [ordres]; },// robot (niveau 1, 2, 3) : appelé par le moteur dans le tick
  fin(etat) { … return null; },                       // null, ou { gagnant, scores, raison }
};
```

Le moteur, pas le jeu, fait la boucle (`Simulation.avancer`). Chaque tick, dans cet ordre fixe : ordres de contrôle (le camp « système » change `etat.ctl`), ordres des humains triés par camp puis numéro de séquence (ignorés si le camp est tenu par un robot ou si `valide` les refuse), robots dans l'ordre des camps, puis `pas`. Le moteur tient `etat.k` (tick) et `etat.ctl` (0 = humain, 1 à 3 = robot), hache l'état tous les 50 ticks, garde le journal et deux instantanés (un tous les 300 ticks). Le jeu ne fait que dessiner.

### Règles strictes (vérifiées par le robot de contrôle)

- **Interdits dans `jel-sim`** : `Math.random`, `Date`, `performance`, `setTimeout`, `requestAnimationFrame`, `Math.sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow`, `hypot` (leurs résultats varient d'un moteur JavaScript à l'autre), accès à la page, au stockage, au réseau, `eval`. Le hasard passe uniquement par `alea()` (`mulberry32`, déjà utilisé par `jel-multi`), dont la graine est fixée au début de la partie et avancée seulement dans `tick`.
- **État entièrement entier** : positions en virgule fixe (1/256 de case), vitesses, compteurs, tout en entiers 32 bits (`| 0`, `Math.imul`, division suivie de `Math.trunc`, racine carrée entière `racineEntiere()` du moteur, comparaisons de distances au carré). Contrôle automatique : après chaque tick des tests, **chaque nombre de l'état doit vérifier `Number.isInteger`** ; un flottant égaré est trouvé au tick près.
- **Ordre garanti** : l'état ne contient que des tableaux et des objets à clés fixes ; on parcourt les tableaux par index, jamais `for…in` ni `Object.keys` sur des données. Entités numérotées par un compteur croissant de l'état.
- **Ordre de traitement des ordres** : par tick, puis par camp, puis par numéro de séquence (le cadenceur fournit la liste déjà triée ; le moteur la retrie par sécurité). Les robots jouent après les humains, dans l'ordre des camps.
- **Hachage** : FNV-1a 32 bits (deux passes, 64 bits en tout) sur une écriture canonique de l'état, calculé tous les 50 ticks (`HASH_TOUS`).
- **Rendu séparé** : le jeu dessine en `requestAnimationFrame` en interpolant entre l'état du tick précédent et celui du tick courant (`alpha = temps écoulé / tickMs`) ; les flottants sont permis dans le rendu, jamais dans l'état.
- **Retour visuel immédiat** : sélection, marqueur de destination, fantôme de bâtiment s'affichent au toucher, avant que l'ordre soit appliqué (N ticks plus tard, plus le trajet réseau).

### Ordres

Le joueur envoie `[type, a, b, c]` (4 entiers au plus, `type ≥ 1`, ex. `[1, 3, 7, 50]` : envoyer la moitié des vaisseaux de la planète 3 vers la 7 ; `[2, 4, 1]` : construire une usine sur la 4) avec son numéro de séquence ; le cadenceur en fait `[camp, seq, type, a, b, c]`. Le type 0 est réservé aux ordres de contrôle du camp système (`[camps, n, 0, camp, niveau]` : camp passé au robot `niveau`, ou rendu à l'humain avec 0). Taille d'un message : quelques dizaines d'octets.

## 6. Le cadenceur et le réseau

### Le cadenceur (même code dans les trois modes)

À chaque tick `k` (minuterie de `tickMs`, recalée sur l'horloge réelle pour ne pas dériver) :
1. un ordre reçu pendant le tick `k` reçoit le tick d'application `k + N` et attend ;
2. au tick `k`, il diffuse le paquet `{ t: 'k', k, o: [[camp, seq, type, a, b, c], …] }` des ordres arrivés à échéance (liste vide s'il n'y a rien) ;
3. un numéro de séquence déjà vu (ordre en double ou rejoué) est ignoré.

Les clients jouent le tick `k` dès qu'ils ont reçu le paquet `k` (avec une petite réserve d'un ou deux paquets pour lisser les à-coups du réseau). L'horloge ne ralentit jamais pour attendre un joueur lent : c'est le cadenceur qui décide, comme demandé (« si un joueur n'a rien envoyé, le tick part avec une liste vide »).

### Mode pair-à-pair (tentative 1)

1. La Rencontre apparie deux joueurs, tire la graine (`crypto.getRandomValues`), crée le « Duel » (nom aléatoire, deux jetons à usage unique) et envoie à chacun `{ t: 'trouve', duel, jeton, camp, graine, config }`.
2. Chaque lanceur ouvre un WebSocket vers le Duel (hibernation). Le camp 0 crée l'offre WebRTC ; offres et candidats ICE transitent par le Duel (une dizaine de messages en tout).
3. DataChannel ouvert des deux côtés (fiable et ordonné) → `{ t: 'p2p' }` au Duel, qui n'a plus rien à faire et **hiberne** (les WebSocket restent ouverts, `ping` automatique gratuit, pour la reprise et la bascule).
4. **Le camp 0 est le pair horloge** : il fait tourner le cadenceur, l'autre joueur lui envoie seulement ses ordres. Les deux appliquent les mêmes ordres au même tick.
5. Les hachages des 50 ticks sont comparés directement entre les pairs.

Écart avec le lockstep « symétrique » classique : là, chaque pair devrait envoyer un message à chaque tick, même vide, pour que l'autre sache qu'il peut avancer. Avec un pair horloge, seul l'horloge envoie un paquet par tick, et ces messages ne passent pas par Cloudflare (gratuits). L'autre joueur n'envoie qu'en cas d'ordre, comme demandé. Le pair horloge a un trajet réseau en moins pour ses propres ordres ; avec un délai d'entrée de 2 ou 3 ticks, l'écart ressenti est faible, et il est le même qu'en mode relayé pour les deux joueurs.

### Mode relayé (bascule)

- Pas de DataChannel au bout de 5 s (`DELAI_P2P_MS`) → le Duel envoie `{ t: 'mode', mode: 'relais' }` aux deux. Il demande d'abord une place au Budget (section 9) ; refus → `{ t: 'refus', raison: 'budget' }` et le joueur voit « Le serveur est très demandé aujourd'hui : tu joues contre un robot ».
- **La boucle de ticks du Durable Object démarre seulement quand les deux joueurs ont envoyé `{ t: 'pret' }`**, et s'arrête à la fin de la partie (ou après `DUREE_MAX_MS`). C'est la seule minuterie active de tout le Worker, et seulement pendant une partie relayée.
- Le Duel fait tourner **la simulation elle-même** (le bloc `jel-sim` recopié, comme `jel-regles` aujourd'hui). Pourquoi : il devient l'arbitre en cas d'écart de hachage (à deux joueurs, sans arbitre, on ne sait pas qui a raison), il fournit l'instantané de reprise sans le demander à un client, et il peut passer un camp au robot. Coût : du calcul (non facturé pour un Durable Object, qui paie la durée, déjà due à cause de la minuterie) ; une simulation de stratégie de cette taille prend de l'ordre de 0,1 à 0,5 ms par tick (à mesurer).
- Clients → serveur : seulement des ordres `{ t: 'o', seq, o }` et un hachage tous les 50 ticks. Serveur → clients : un paquet par tick (non facturé).

### Bascule en cours de partie

- **Le pair-à-pair coupe** (DataChannel fermé, ou plus aucun paquet du pair horloge depuis 3 s) : chaque lanceur envoie `{ t: 'secours' }` au Duel. Si le Budget le permet, le Duel passe en relais, demande l'état aux appareils (`demande-snap`), repart du premier instantané reçu et l'envoie aux deux (`snap`), puis cadence lui-même. Le joueur voit au plus un court arrêt. Le Duel n'a pas repris la partie en 6 s, ou la refuse : chacun continue seul contre le robot (`coupe`), au même tick.
- **Le pair horloge disparaît** : même chemin (secours). Le Duel repart de l'instantané de l'autre joueur et le camp absent passe au robot au bout de 10 s.
- **Le pair non horloge se tait** (aucun ordre ni signe de vie depuis 10 s) : le pair horloge passe son camp au robot ; au premier message, le joueur reprend la main.
- **Fin de partie** : le lanceur garde la connexion 3 s, pour que l'autre reçoive les derniers paquets, sans déclencher de secours.

### Messages (protocole temps réel 1)

| Sens | Message | Rôle |
| --- | --- | --- |
| client → Rencontre | connexion `/tr/ws?jeu=&sim=<empreinte de jel-sim>&proto=` (ouvrir = chercher), `annuler` | recherche |
| Rencontre → client | `attente { n }`, `trouve { duel, jeton, camp, graine, config }`, `refus { raison }` | compteur, appariement |
| client ↔ Duel | connexion `/tr/duel?nom=&jeton=`, `sdp`, `ice`, `p2p`, `relais`, `pret` | signalisation, choix du mode |
| Duel → client | `bienvenue`, `mode { mode, secours }`, `refus { raison }` (`budget`, `adversaire`, `secours`), `k { k, o }` (relais), `snap { snap }`, `demande-snap`, `fin { resultat }` | relais, reprise, secours |
| client → Duel | `o { seq, o }`, `h { k, h }`, `reprise { depuis }`, `secours { k }`, `snap { snap }`, `fin` | ordres, contrôle, reconnexion, secours |
| pair ↔ pair | `k` (horloge → pair), `o`, `h`, `vie`, `pret`, `reprise` (pair → horloge), `snap`, `journal { paquets }` (horloge → pair) | sur le DataChannel |
| jeu → lanceur | `jel-tr`, `op` : `chercher`, `pret`, `ordre { seq, o }`, `hash { k, h }`, `snap`, `reprise { depuis }`, `fin`, `quitter`, `attente` | passage dans le cadre isolé |
| lanceur → jeu | `jel-tr` : `etat` (`attente`, `trouve`, `mode`, `solo`, `coupe`), `paquet`, `snap`, `demande: 'snap'` | |

Limites (Duel et Rencontre) : 1 000 caractères par message de joueur (un instantané envoyé par le pair horloge : 64 Ko), 60 messages par 10 s, au-delà la connexion est fermée ; ordres invalides ignorés par `valide`. Le protocole a son propre numéro (`PROTOCOLE_TR`), indépendant du `PROTOCOLE` du tour par tour.

## 7. Désynchronisation, déconnexion, reprise

- **Contrôle** : hachage tous les 50 ticks. En relayé, chaque client envoie le sien au Duel, qui le compare au sien. En pair-à-pair, l'autre joueur l'envoie au pair horloge.
- **Écart** : journal détaillé (tick, deux hachages, 50 derniers ordres, résumé de l'état) dans la console du lanceur et dans les journaux du Worker (`observability` déjà activé), puis **resynchronisation par instantané** : la référence (Duel en relayé, pair horloge en pair-à-pair) envoie `snap` ; le client remplace son état et rejoue les ordres suivants.
- **Journal et instantanés** : chaque horloge garde en mémoire le journal des ordres de la partie et un instantané tous les 300 ticks (30 s ; `INSTANTANE_TOUS`), les deux derniers seulement. Rien n'est écrit dans le stockage à chaque tick (le Duel relayé est éveillé de toute façon) ; une ligne au début et une à la fin de partie.
- **Reconnexion** : `reprise { depuis }` → dernier instantané + ordres suivants, rejoués en accéléré jusqu'au tick courant (50 ticks par image au plus, pour ne jamais geler l'affichage).
- **Joueur absent** : au-delà de `ABSENCE_MAX_MS` (10 s, paramétrable) sans nouvelles, l'horloge émet l'ordre de contrôle « camp → robot » (niveau moyen). À son retour, le joueur reprend la main par un nouvel ordre de contrôle. Le lanceur ferme aujourd'hui la connexion après 60 s de page cachée (`CACHE_MAX_MS`) : pour le temps réel, on garde la connexion et c'est l'horloge qui décide.
- **Onglet en arrière-plan, téléphone en veille** : le cadre isolé est ralenti par le navigateur (minuteries à 1 par seconde, plus rien en veille). Au retour, le moteur rattrape les ticks en retard en accéléré (même règle de 50 ticks par image) ; la connexion perdue entre-temps passe par la reprise. Contre le robot, la page cachée **met la partie en pause** (comme le solo existant).
- **Déploiement du Worker ou Duel perdu** : les clients ne reçoivent plus de paquets ; au bout de `ABSENCE_MAX_MS`, chacun continue seul contre le robot depuis son dernier tick (comme le tour par tour aujourd'hui).

## 8. Les robots

- Trois niveaux, `facile`, `moyen`, `difficile`, réglés par des paramètres (temps de réaction en ticks, nombre d'ordres par minute, part d'erreurs, qualité du choix des cibles) et par des **profils de stratégie** tirés au début de la partie avec `alea` : expansion rapide, défense puis contre-attaque, harcèlement. Un même niveau ne joue donc pas deux fois de la même façon.
- Le robot ne voit que ce qu'un joueur voit et ne réagit qu'avec retard : il doit être battable par un enfant attentif au niveau facile, et tenir tête à un adulte au niveau difficile.
- Un seul robot, trois usages : partie contre le robot, camp d'un joueur parti (ordre de contrôle), tests automatiques (partie robot contre robot rejouée).
- Le robot est appelé dans `tick` tous les `k` ticks (ex. tous les 5 ticks), pour limiter le calcul sur les petits téléphones.
- Contrôles automatiques : robot difficile gagne au moins 80 % contre facile, moyen au moins 65 % contre facile, difficile au moins la moitié du temps contre moyen ; équité des deux camps (35 à 65 % entre robots égaux) ; deux parties de graines différentes ne donnent pas la même suite d'ordres. Mesuré sur la carte en ligne (12 novembre 2026, 80 parties par paire) : difficile contre facile 89 %, moyen contre facile 94 %, difficile contre moyen 57 %, camp 0 contre camp 1 entre deux robots moyens 57 % (100 parties). Sur les petites cartes du début du parcours solo, le difficile est plus fragile : le parcours compense par les vaisseaux de départ.

## 9. Coûts et garde-fous

Grille officielle de Cloudflare, relue le 12 novembre 2026 : [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) (mise à jour du 18 octobre 2026), [Limits](https://developers.cloudflare.com/durable-objects/platform/limits/) (7 novembre 2026), [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) (2 octobre 2026), [WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) (30 octobre 2026), [TURN](https://developers.cloudflare.com/realtime/turn/) (25 septembre 2026).

| Ressource | Gratuit | Payant (5 $ par mois, minimum du compte) |
| --- | --- | --- |
| Requêtes Durable Objects (HTTP, connexions WebSocket, alarmes) | 100 000 par jour | 1 million par mois, puis 0,15 $ le million |
| Message WebSocket reçu | 1/20 de requête ; envoyés et `ping` automatiques gratuits | idem |
| Durée (128 Mo facturés par objet éveillé, quelle que soit la mémoire utilisée) | 13 000 Go-s par jour | 400 000 Go-s par mois, puis 12,50 $ le million de Go-s (arrondi au million supérieur) |
| Lignes écrites (SQLite) | 100 000 par jour | 50 millions par mois, puis 1 $ le million |
| Requêtes Workers (le site, ses fonctions et le Worker multijoueur partagent ce quota) | 100 000 par jour | 10 millions par mois, puis 0,30 $ le million |
| TURN Cloudflare | — | 0,05 $ par Go sortant (pas de franchise indiquée) |

Ce que dit la documentation et qui commande le cadrage : **`setTimeout` et `setInterval` empêchent l'hibernation** ; un objet qui ne peut pas hiberner paie sa durée. Une partie relayée paie donc toute sa durée. Une partie en pair-à-pair ne paie presque rien.

### Estimations (à remplacer par des mesures dans `docs/couts-temps-reel.md`)

| Partie de 15 min | Durée facturée | Requêtes | Lignes écrites |
| --- | --- | --- | --- |
| Contre le robot | 0 | 0 (une lecture `/tr/attente` à la fin : 2) | 0 |
| Recherche de 15 s sans adversaire | ≈ 2 Go-s (objet éveillé pendant la recherche) | ≈ 3 | 0 |
| Pair-à-pair | ≈ 3 Go-s (recherche et signalisation) | ≈ 8 | ≈ 3 |
| Relayée | 900 s × 0,125 Go = **≈ 112,5 Go-s** | ≈ 50 (≈ 1 000 messages reçus ÷ 20) | ≈ 3 |

Ordres de grandeur (estimés) :
- **Gratuit** : 13 000 ÷ 112,5 ≈ 115 parties relayées de 15 min par jour **si rien d'autre ne consommait de durée** ; au seuil de 80 %, ≈ 90. Les parties en pair-à-pair et contre le robot ne sont pratiquement pas limitées (des milliers par jour).
- **Payant** : 400 000 Go-s inclus ≈ 3 500 parties relayées de 15 min par mois ; ensuite ≈ 0,0014 $ par partie relayée (1 000 parties relayées par jour ≈ 40 $ par mois en plus des 5 $).
- Inconnue à lever avant de régler le budget : **la durée déjà consommée chaque jour par « Partie » et surtout « Presence »** (reçoit des requêtes HTTP de tous les joueurs qui ont un ami ; s'il ne s'endort jamais, il pourrait consommer à lui seul l'essentiel des 13 000 Go-s). À relever dans le tableau de bord Cloudflare (Workers → fmg-multijoueur → Durable Objects → Duration) par le propriétaire, ou par l'API d'analyse avec un jeton en lecture (décision du propriétaire).

### Garde-fous

- Rencontre et signalisation en **WebSocket Hibernation**, sans minuterie ; alarme seulement pour fermer une recherche ou un Duel abandonnés (`INACTIF_MS`, 2 min) et pour la durée maximale d'une partie.
- Boucle de ticks du Duel : démarre quand les deux joueurs sont prêts, s'arrête à la fin de partie, à `DUREE_MAX_MS`, ou quand plus aucun joueur n'est connecté depuis `ABSENCE_MAX_MS`.
- Les clients n'envoient un message au serveur **que s'il y a un ordre** (plus un hachage tous les 50 ticks, soit 5 s).
- **Budget** (Durable Object unique, deux lignes écrites par partie relayée) : chaque Duel réserve `DUREE_MAX_MS × 0,125 Go` au démarrage du relais et rend le reste à la fin. Remise à zéro à 00:00 UTC. Seuil : 80 % de `BUDGET_RELAIS_GOS` (part des 13 000 Go-s réservée au temps réel, réglée d'après la consommation relevée ci-dessus). Au-delà : plus de nouvelle partie relayée, les parties en cours ne sont jamais coupées, le pair-à-pair reste permis. C'est **notre propre comptage, une estimation prudente** : Cloudflare ne donne pas la consommation en direct au Worker.
- Le tour par tour garde ses propres limites (`MAX_JOUEURS`). Une limite gratuite dépassée ne coûte rien : les appels échouent jusqu'à minuit UTC et les jeux passent aux robots locaux.

## 10. Tests obligatoires (`scripts/tester-temps-reel.mjs`)

| N° | Test | Comment |
| --- | --- | --- |
| 1 | Déterminisme | Node, sans réseau : une partie robot contre robot de 6 000 ticks, journal enregistré, rejouée deux fois (et une troisième en sautant par un instantané) → hachages identiques à chaque contrôle et à la fin ; état entièrement entier à chaque tick ; mots interdits absents de `jel-sim`. |
| 2 | Joueur seul | Playwright (Edge, `CHROMIUM_PATH`) : faux serveur sans autre joueur → partie contre le robot en moins de 16 s ; puis réseau coupé → partie contre le robot tout de suite ; **aucune requête pendant la partie** (journal des requêtes du navigateur). |
| 3 | Pair-à-pair | Deux pages du navigateur sur la machine, serveur `wrangler dev` : DataChannel ouvert, partie jouée ; puis pair-à-pair forcé en échec (aucun serveur ICE, candidats bloqués par un crochet de test) → relais au bout de 5 s, partie identique pour le joueur. |
| 4 | Deux clients, 2 000 ticks | Deux clients Node (WebSocket intégré à Node 22) contre `wrangler dev`, par un mandataire qui ajoute 0, 150 et 400 ms de latence, de la gigue et des pertes simulées (le WebSocket est sur TCP : une perte devient un retard ou une coupure, le mandataire fait les deux) → aucun écart de hachage sur 2 000 ticks. |
| 5 | Déconnexion | Coupure d'un client : son camp passe au robot au bout de `ABSENCE_MAX_MS`, la partie continue ; reconnexion : instantané + journal, le joueur reprend la main, hachages identiques. Même chose quand le pair horloge disparaît. |
| — | Non-régression | `tester-multijoueur.mjs` (et `--navigateur`) inchangé et vert ; robot des jeux, traductions, sauvegarde, référencement. |

`wrangler dev` n'est pas installé dans le dépôt : il sera lancé par `npx wrangler@<version fixée>` (téléchargé une fois), sans rien déployer.

## 11. Risques et points à décider

1. **Adresse IP visible par l'autre joueur — accepté par le propriétaire le 12 novembre 2026** (paragraphe à ajouter aux politiques de confidentialité et de cookies, fr et en, à l'étape 7). Le pair-à-pair WebRTC échange les adresses publiques des deux appareils (c'est son principe ; les adresses locales sont masquées par le navigateur). Sur un site pour enfants qui annonce n'enregistrer aucune adresse IP, c'est un changement à écrire dans la politique de confidentialité, et à accepter ou non. Alternatives : relayé seulement (plus cher, section 9), ou TURN Cloudflare imposé (`iceTransportPolicy: 'relay'`, adresse cachée, ≈ 0,05 $ par Go : une partie de 15 min fait de l'ordre de quelques Mo, soit une fraction de centime, mais il faut le plan payant ou un moyen de paiement).
2. **Taux de réussite du pair-à-pair sans TURN.** Entre un wifi et un réseau 4G (souvent derrière un NAT d'opérateur strict), le STUN seul échoue souvent. Les chiffres publics habituels tournent autour de 80 % de réussite tous réseaux confondus, moins sur mobile. Le relais servira donc souvent, et c'est lui qui coûte. Le taux réel sera journalisé (pair-à-pair réussi, échoué, relayé ; compteurs du jour dans le Budget, lisibles par `/etat`).
3. **Pièges du déterminisme** : fonctions mathématiques non garanties, flottants cachés (une division sans `Math.trunc`), tri avec un comparateur incomplet. Parades : liste de mots interdits, contrôle « état entier » à chaque tick, hachage, tests de rejeu.
4. **Navigateurs mobiles** : minuteries ralenties en arrière-plan, WebSocket coupé en veille, iPhone qui suspend la page. Parades : rattrapage accéléré, reprise par instantané, robot à la place de l'absent.
5. **Trou existant à vérifier (hors périmètre, à signaler)** : `connect-src 'none'` n'empêche pas un jeu d'ouvrir lui-même une connexion WebRTC dans son cadre isolé. À vérifier dans Chrome, Edge, Firefox et Safari, puis à fermer si possible (directive `webrtc 'block'` de CSP, si elle est prise en charge).
6. **Triche** : en lockstep, chaque appareil connaît tout l'état (on peut lire le jeu de l'adversaire). Acceptable pour un mini-jeu familial ; les ordres impossibles sont ignorés par `valide`.
7. **Test sur deux vrais téléphones** : il faut le Worker en ligne, donc une fusion sur `main` (`multijoueur.yml`). Décision du propriétaire : le jeu est publié dans le catalogue dès la fusion. Tant que l'essai sur deux téléphones n'est pas fait, une panne du mode en ligne reste sans gravité : la partie contre le robot (le cas normal) marche sans serveur.
8. **Quota des requêtes Workers partagé** avec le site (votes, sessions, profil) : la recherche et la signalisation y ajoutent quelques requêtes par partie, négligeables.

## 12. Plan par étapes

**État au 12 novembre 2026** (le propriétaire a demandé d'enchaîner les étapes sans s'arrêter) : étapes 1 à 7 faites, tests 1 à 5 verts (`node scripts/tester-temps-reel.mjs petites-planetes --tout`). Reste, après la fusion : l'essai du propriétaire sur deux téléphones (wifi et 4G, 10 min, pair-à-pair et relais) et la mesure d'une vraie partie de 15 min en ligne (`docs/couts-temps-reel.md`, section 5).

1. **Moteur et simulation, hors réseau** : `public/temps-reel/moteur.js` (entiers, hasard, hachage, cadenceur local, boucle, rattrapage, journal, instantanés), simulation et robot du prototype, jeu jouable contre le robot (3 niveaux, parcours solo de 20 niveaux, tactile portrait et paysage, 5 langues, sauvegarde). Test 1.
2. **Parcours de recherche** dans le jeu et le lanceur, avec un faux serveur : compte à rebours, compteur, « Jouer contre un robot maintenant », démarrage automatique, hors connexion, proposition de fin de partie. Test 2.
3. **Worker** : Rencontre, Duel en mode relayé (cadenceur et simulation dans le Durable Object), Budget, `/tr/attente` ; migration `v3` ; `scripts/multijoueur.mjs` complété. Tests avec de faux Durable Objects, puis test 4 avec `wrangler dev`. Non-régression du tour par tour.
4. **Pair-à-pair** : WebRTC dans le lanceur, signalisation par le Duel, hibernation, pair horloge, bascule vers le relais au bout de 5 s et en cours de partie, journal des connexions. Test 3.
5. **Désynchronisation, déconnexion, reprise, prise de relais par le robot**. Test 5.
6. **Mesure des coûts** : instrumentation (durée d'éveil, messages reçus et envoyés, lignes écrites, CPU par tick) mesurée sous `wrangler dev`, puis sur une vraie partie de 15 min une fois en ligne ; rédaction de `docs/couts-temps-reel.md` (mesuré et estimé séparés).
7. **Intégration** : `validate-games.mjs` (branche `"temps_reel"`), `docs/multijoueur.md` (renvoi), `CONSIGNES-JEU.md` (court paragraphe), politique de confidentialité (fr, en) selon la décision du point 11.1, `CLAUDE.md` section 14, pull request. Puis essai du propriétaire sur deux téléphones (wifi et 4G, 10 min, pair-à-pair et relayé).

## 13. Non-régression du tour par tour

- Aucun changement de `public/multijoueur/moteur.js`, `lanceur.js`, `multijoueur/src/partie.js`, `accueil.js`, ni de leur protocole ; les adresses `/ws`, `/partie`, `/etat`, `/presence` gardent leur comportement (`/etat` gagne seulement une ligne `tempsReel`).
- Nouvelle migration `v3` qui **ajoute** des classes, sans toucher `v1` et `v2`.
- `play.js` : le branchement temps réel est choisi par `jeu.temps_reel` ; les jeux tour par tour gardent exactement le chemin actuel.
- `tester-multijoueur.mjs --navigateur` relancé à chaque étape.

## 14. Plus tard : ce que la boucle de nuit devra changer pour valider des jeux temps réel

Rien n'est changé maintenant (ni l'idéation, ni la fabrication, ni la vérification). Pour que l'agent vérificateur puisse valider un jeu temps réel fabriqué par la boucle :

- **Idéation et choix** : un type d'idée `"temps_reel": true` et un quota propre (variable `TEMPS_REEL_BOUCLE`, comme `MULTI_BOUCLE`), seulement après la validation du prototype par le propriétaire ; genres compatibles (stratégie, arcade sans tir).
- **Fabrication** : l'agent créateur lit ce document et suit le contrat `jel-sim` de la section 5 ; le prototype sert de modèle ; `tester-temps-reel.mjs <id> --navigateur` jusqu'à « Temps réel : tout est bon ».
- **Vérification (étape d)** : `tester-temps-reel.mjs <id>` bloquant : mots interdits, état entier à chaque tick, rejeu identique, robots des trois niveaux (battables et variés), partie contre le robot sans réseau en moins de 16 s, deux clients simulés sur 2 000 ticks avec latence, déconnexion et reprise ; captures sur téléphone en portrait et en paysage. Le relecteur ajoute un point « Temps réel » à sa grille (`CONSIGNES-JEU.md`, section 7) : lisibilité au doigt, retour visuel immédiat des ordres, fluidité de l'interpolation, robots crédibles.
- **Déploiement** : `multijoueur.yml` relancé après fusion (le Worker recopie le bloc `jel-sim`), comme pour le tour par tour.
- **Coût** : chaque nouveau jeu temps réel partage le même Budget ; le bilan quotidien du Budget (parties relayées, taux de pair-à-pair) rejoint l'onglet « Stats » de `/idees`.

## 15. Hors périmètre

- Jeux de tir et d'action rapide (latence, prédiction et correction : architecture différente, à cadrer plus tard).
- Plus de 2 joueurs, spectateurs, parties entre amis par le bouton « Rejoindre » (possible plus tard avec le même Duel).
- Serveur TURN payant.
