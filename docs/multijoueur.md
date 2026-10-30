# Jeux multijoueurs — Free Micro Games

Ce document décrit le multijoueur du site : architecture, Worker Cloudflare commun, règles des robots et de l'arbitre, étiquette « Multi », rubrique « Multijoueur » du catalogue et consignes de la boucle de nuit. **Toute IA qui crée, modifie ou vérifie un jeu multijoueur le lit en entier**, en plus de `CLAUDE.md` et de `CONSIGNES-JEU.md` (qui restent valables pour tout jeu : 5 langues, sauvegarde, fin de partie, référencement…).

## 1. En bref

- Un jeu multijoueur est un jeu du site comme les autres : un seul `index.html` dans `games/<id>/`, hébergé sur Cloudflare Pages, jouable **entièrement hors ligne contre des robots**.
- En ligne, il se joue à plusieurs **sans compte ni pseudo ni discussion** : de vrais joueurs remplacent des robots. Les joueurs se retrouvent d'abord dans un **salon d'attente** où toutes les places vides sont tenues par des robots ; le premier arrivé (le « chef ») lance la partie quand il veut, avec 1 à N vrais joueurs (sur 4 places : 1 joueur et 3 robots, 2 et 2, 3 et 1, ou 4 joueurs). Sans lancement, elle part seule au bout de 90 s.
- Le serveur est **un seul Worker Cloudflare commun** à tous les jeux multijoueurs (`multijoueur/`), sur le même compte que le site et la base des votes (pas de Firebase). Il fait tourner **un Durable Object par partie** : c'est l'arbitre. Joueurs et serveur se parlent par WebSocket.
- Seules les **actions** des joueurs circulent (« je pose la clôture n° 12 »), jamais l'état complet du jeu en continu. Le même code de règles tourne sur le serveur et sur chaque appareil. Ils arrivent donc tous au même état.
- Jeux **au tour par tour** (ou par manches) : c'est ce qui tient dans le plan gratuit de Cloudflare (section 7).

## 2. Architecture

```text
 Téléphone du joueur                                              Cloudflare (même compte)
 ┌──────────────────────────────────────────────┐
 │ Lanceur /play (play.js)                      │   WebSocket     ┌─────────────────────────────────────┐
 │  multijoueur/lanceur.js ── connexion ────────┼───────────────▶ │ Worker fmg-multijoueur              │
 │        ▲ messages « jel-multi »              │ wss://multi.    │  src/index.js : contrôles, répartit │
 │        ▼ (postMessage)                       │ freemicrogames  │        │                            │
 │ ┌──────────────────────────────────────────┐ │ .com/ws         │        ▼                            │
 │ │ Jeu (cadre isolé, AUCUN accès réseau)    │ │                 │  Accueil (Durable Object unique)    │
 │ │  jel-multi  : moteur commun (JEL_MULTI)  │ │                 │   répartition, limite MAX_JOUEURS   │
 │ │  jel-regles : règles du jeu (JEL_REGLES) │ │                 │        │                            │
 │ │  code du jeu : écran, sons, robots locaux│ │                 │        ▼                            │
 │ └──────────────────────────────────────────┘ │                 │  Partie (1 Durable Object / partie) │
 └──────────────────────────────────────────────┘                 │   Arbitre : robots, coups, manches  │
                                                                  └─────────────────────────────────────┘
```

- **Le jeu n'a toujours aucun accès réseau** (règle `CSP_JEU`). Comme pour la sauvegarde, c'est le **lanceur** qui fait le lien : le moteur du jeu lui envoie `{ type: 'jel-multi', op: 'rejoindre' }`, et le lanceur ouvre la connexion. Il ne se connecte qu'à ce moment-là, au lancement d'une partie en ligne, **jamais à l'ouverture du site**.
- **L'adresse du Worker est dans un seul fichier** : `public/multijoueur/config.js` (`ADRESSE_MULTI`, et `SITES_MULTI`, les sites d'où l'on se connecte). Ailleurs (aperçus `*.pages.dev`, test local), le jeu joue contre des robots locaux. En test local seulement, `play.html?id=<id>&multi=ws://localhost:<port>` vise un serveur de test.
- **Mêmes règles partout** : le Worker recopie au déploiement le bloc `jel-regles` de chaque jeu multijoueur (`scripts/multijoueur.mjs` → `multijoueur/src/jeux.js`). Le lanceur envoie l'empreinte SHA-256 de ses règles ; si elle diffère (jeu mis à jour avant le Worker), le serveur refuse et le jeu se joue contre des robots locaux.
- **Repli** : serveur absent, complet (`MAX_JOUEURS`), hors connexion, règles différentes → robots sur l'appareil, sans erreur ni attente de plus de 6 s. Connexion perdue en pleine partie → la partie **continue sur l'appareil au même point**, les autres places tenues par des robots locaux.

### Fichiers

| Fichier | Rôle |
| --- | --- |
| `public/multijoueur/moteur.js` | moteur commun (`JEL_MULTI`) : arbitre, robots, partie côté jeu. Recopié dans chaque jeu multijoueur (`<script id="jel-multi">`) par `node scripts/i18n-jeu.mjs` ; importé tel quel par le Worker |
| `public/multijoueur/lanceur.js` | côté lanceur : connexion WebSocket, passage des messages, empreinte des règles |
| `public/multijoueur/config.js` | **adresse du Worker** et sites permis (fichier unique) |
| `multijoueur/wrangler.toml` | réglages du Worker : nom, domaine `multi.freemicrogames.com`, `MAX_JOUEURS`, Durable Objects |
| `multijoueur/src/index.js` | entrée du Worker : `/etat`, `/ws` (site permis, jeu connu, règles et protocole identiques) |
| `multijoueur/src/accueil.js` | Durable Object « Accueil » : répartit les joueurs, limite globale |
| `multijoueur/src/partie.js` | Durable Object « Partie » : l'arbitre d'une partie |
| `multijoueur/src/jeux.js` | GÉNÉRÉ (ignoré par git) : règles des jeux multijoueurs, empreintes, version |
| `scripts/multijoueur.mjs` | écrit `jeux.js` ; `--liste`, `--version` |
| `scripts/tester-multijoueur.mjs` | robot de contrôle (section 9) |
| `.github/workflows/multijoueur.yml` | déploiement du Worker (section 10) |

## 3. Format d'un jeu multijoueur

Tout ce que demande `CONSIGNES-JEU.md` reste obligatoire. En plus :

**`game.json`** : `"multijoueur": true` et `"places": N` (2 à 10), le même nombre que dans les règles.

```json
{ "id": "…", "…": "…", "multijoueur": true, "places": 4, "niveaux": 20, "consignes": 2 }
```

**`index.html`**, dans le `<head>`, dans cet ordre, avant tout autre script :

1. `jel-i18n-textes` et `jel-i18n` (traductions), puis `jel-sauvegarde` (sauvegarde) : comme tout jeu ;
2. `<script id="jel-multi">` : le moteur commun, **recopié par `node scripts/i18n-jeu.mjs --assembler <id>`** (jamais à la main), dès que `game.json` contient `"multijoueur": true` ;
3. `<script id="jel-regles">` : **les règles du jeu**, écrites par l'agent (ci-dessous) ;
4. le code du jeu (écrans, dessin, sons…).

### Les règles (`jel-regles`)

```js
window.JEL_REGLES = {
  places: 4,              // PLACES : nombre de places de la partie, 2 à 10 — la seule constante
  delaiBot: 700,          // ms entre deux coups affichés (200 à 3000)
  delaiJoueur: 20000,     // ms laissées à un vrai joueur avant que son robot joue (5000 à 60000)
  pauseManche: 6000,      // ms entre deux manches en solo, ou après une coupure du réseau (2000 à 30000)
  attenteSalon: 90000,    // ms avant que le salon d'attente lance seul la manche (20000 à 300000)
  remplacement: 'tour',   // 'tour' : un arrivant prend la place d'un robot tout de suite ; 'manche' : à la manche suivante
  forceEnLigne: 0.6,      // force des robots en ligne (0 à 1)
  depart(alea, places, options) { … return etat; },   // état de départ d'une manche
  aQui(etat) { … return place; },                     // place qui doit jouer (0 à places − 1)
  valide(etat, place, action) { … return true; },     // action permise ?
  jouer(etat, place, action, alea) { … return etat; },// nouvel état
  bot(etat, place, alea, force) { … return action; }, // coup d'un robot (toujours une action valide)
  fin(etat) { … return null; },                       // null, ou { classement: [places du 1er au dernier], scores: [un nombre par place] }
};
```

Contraintes, vérifiées par le robot :

- **Fonctions pures** : elles ne lisent que leurs arguments. Pas de `Date`, pas de `Math.random` (le hasard passe **uniquement** par `alea()`, donné par l'arbitre et reproductible), pas de minuterie, pas d'accès à la page, au stockage, au réseau ni aux autres modules (`document`, `parent`, `fetch`, `localStorage`, `JEL_SAVE`, `FMG`…), pas d'`eval`. Code en **mode strict** (le Worker l'exécute dans un module).
- **État et actions en JSON** (nombres, textes, listes, objets) : l'état fait moins de 100 Ko, une action moins de 4 Ko. `jouer` peut modifier l'état reçu (c'est une copie) et le renvoyer.
- **Tour par tour** : `aQui` désigne une seule place à la fois. Un jeu à choix simultanés ou en temps réel n'est pas permis (il faudrait une boucle sur le serveur : quota, section 7).
- `depart(alea, places, options)` : `options` vaut `{ manche: n }` en ligne (le jeu peut s'en servir pour varier le terrain), et ce que le jeu choisit en solo (ex. `{ niveau: 7 }`).
- `bot` renvoie toujours une action valide ; `fin` renvoie un résultat dès que la manche est finie.

### La partie, côté jeu

```js
const partie = JEL_MULTI.creer({
  regles: window.JEL_REGLES,
  enLigne: true,                 // false : directement contre des robots sur l'appareil
  force: 0.4,                    // force des robots locaux (solo)
  options: { niveau: 3 },        // options des manches locales (solo)
  enchainer: false,              // solo à niveaux : pas de manche suivante automatique
  surEvenement(e) { … },         // voir ci-dessous
});
partie.lancer();
```

- **Événements** (`e.type`) : `mode` (`connexion` → « Recherche de joueurs… », `en-ligne`, `solo` avec `e.raison`) ; `debut` (arrivée dans une partie, le plus souvent dans le salon : `partie.etat` peut être `null`) ; `salon` (salon d'attente, avant la 1re manche et après chacune ; `e.reste` : ms avant le lancement automatique) ; `manche` (nouvelle manche) ; `action` (`e.siege`, `e.action`, `e.avant`, `e.apres`, `e.moi`, `e.auto` : robot qui a joué à la place d'un joueur trop long) ; `fin` (`e.resultat` de `fin`) ; `sieges` (un vrai joueur arrive ou part, ou le chef change) ; `refus`.
- **Lecture** : `partie.etat`, `partie.siege` (place du joueur de l'appareil, −1 s'il attend), `partie.sieges()` (`[{ humain, moi, chef }]`), `partie.chef` (place du chef), `partie.estChef()`, `partie.mode`, `partie.phase` (`attente`, `salon`, `jeu`, `pause`), `partie.monTour()`.
- **Commandes** : `partie.jouer(action)` (seulement quand `monTour()` ; l'action est jouée à son retour, comme celles des autres), `partie.lancerManche()` (le chef, dans le salon), `partie.pause(true|false)`, `partie.recommencer(options)` (solo : niveau suivant, rejouer), `partie.quitter()`.
- Les coups des autres arrivent **un par un, espacés de `delaiBot`** : le jeu anime chaque événement `action`.
- En solo, les mêmes événements arrivent, produits par un arbitre sur l'appareil.

### Écrans et contenu

- **Écran titre** : le bouton « Jouer » (le premier de l'écran, avec `JEL_SAVE.reprise`) lance le parcours solo de **20 niveaux au moins** contre des robots de plus en plus forts (règles de `CONSIGNES-JEU.md` : niveaux, étoiles, sauvegarde, tutoriel). Un second bouton, **« Avec d'autres joueurs »**, porte `data-multi="jouer"` (repère du robot de contrôle) et mène au salon d'attente de la partie en ligne (terrains variés tirés par l'arbitre).
- **Salon d'attente** (en ligne) : les places (vrais joueurs et robots), le chef bien repéré, les arrivées et départs en direct, le compte à rebours du lancement automatique ; pour le chef, un gros bouton **« Lancer la partie »** avec `data-multi="lancer"` qui appelle `partie.lancerManche()` ; pour les autres, « le premier joueur arrivé lance la partie ». Après chaque manche : classement, puis le salon (« Lancer la manche suivante » pour le chef).
- **Places** : chacune est montrée par une couleur ou un animal dessiné, avec un petit pictogramme « robot » ou « joueur » et « Toi » pour le joueur de l'appareil. **Aucun nom tapé, aucune discussion, aucun message libre** : les joueurs ne peuvent rien s'écrire.
- Messages traduits (5 langues) pour : recherche de joueurs ; salon (chef ou non, lancement automatique dans N s) ; « Personne n'est disponible : tu joues contre des robots » ; « Connexion perdue : la partie continue contre des robots » ; un joueur arrive ou part ; robot qui a joué à la place d'un joueur trop long.
- **Lisible et fluide sur téléphone avec toutes les places occupées** (390 × 844) : tour en cours bien visible, scores de chaque place, rien de coupé.
- **Pause** : en solo, elle fige tout ; en ligne, la partie continue sur le serveur (après `delaiJoueur`, le robot joue pour le joueur) : le menu le dit.
- `FMG.reportEnd` à chaque fin de manche (en ligne aussi) : `completed: true` si le joueur gagne la manche, `false` sinon ; `level` = niveau ou terrain.
- `FMG.reportComplete({ stars, maxStars })` (« jeu terminé », `CONSIGNES-JEU.md`) : seulement pour le parcours solo, quand ses 20 niveaux ont tous été gagnés ; jamais pour une manche en ligne (c'est le serveur qui crédite les manches en ligne au profil, section 12).

## 4. Les robots

- **Toutes les places vides sont des robots**, dès le salon d'attente : le chef peut lancer à tout moment, même seul.
- Un vrai joueur qui arrive **prend la place d'un robot** : dans le salon, tout de suite ; pendant une manche, tout de suite aussi (`remplacement: 'tour'`, entre deux coups : l'arbitre ne s'arrête jamais au milieu d'un coup) ou à la manche suivante (`'manche'`, si une arrivée en cours de manche casserait le jeu). Il reprend le score de la place.
- Un vrai joueur qui part (page fermée, réseau perdu, page cachée plus d'une minute) **rend sa place à un robot**, qui continue.
- **Crédibles** : ils jouent des coups sensés, pas toujours les mêmes (le hasard `alea` les fait varier), avec un temps de réflexion affiché (`delaiBot`). **Battables** : `force` (0 à 1) dose leurs erreurs ; à `forceEnLigne`, un joueur attentif gagne souvent. En solo, la force grandit avec les niveaux.
- Le robot de contrôle vérifie qu'un joueur qui joue au mieux gagne au moins une manche sur 10, et que les robots ne jouent pas toujours pareil.

## 5. L'arbitre

- **Le Durable Object de la partie est l'arbitre** (`Arbitre` de `moteur.js`, utilisé par `partie.js`) : il fait jouer les robots, reçoit les actions des joueurs, les contrôle (`valide`, tour du joueur, numéro du coup) et les renvoie à tous, avec la graine du hasard du coup.
- **Salon et chef** : avant chaque manche, l'arbitre ouvre un salon d'attente. Le chef est le premier vrai joueur arrivé encore présent : lui seul peut lancer la manche (message `lancer`). S'il part, le joueur arrivé juste après lui devient chef. Sans lancement, la manche part seule au bout de `attenteSalon` (90 s), pour qu'un chef parti ne bloque personne.
- **Aucun joueur n'est l'hôte** : le chef ne fait que lancer ; le départ de n'importe qui n'interrompt jamais la partie.
- **Pas de boucle** : dès que c'est aux robots, l'arbitre calcule tous leurs coups d'un coup, jusqu'au tour d'un vrai joueur. Les appareils les affichent ensuite un par un, espacés de `delaiBot`. La seule minuterie est une alarme : temps laissé à un vrai joueur (`delaiJoueur`, puis son robot joue, coup marqué `auto`), lancement automatique du salon (`attenteSalon`), ou veille de 15 min. Les robots ne font donc jamais plus de quelques mises à jour par seconde à l'écran, et aucune sur le serveur entre deux messages.
- **Manches** : en ligne, chaque manche finie ramène au salon ; en solo, elles suivent les niveaux (ou s'enchaînent après `pauseManche` quand le serveur ne répond pas).
- **Table pleine** : quand toutes les places sont prises par de vrais joueurs, le joueur suivant ouvre automatiquement une nouvelle partie (l'accueil la crée).
- **Fin** : plus aucun vrai joueur connecté → l'alarme et le stockage de la partie sont effacés (`deleteAll`), le Durable Object est libéré, l'accueil oublie la partie.

## 6. Messages (protocole 2)

Serveur → joueurs : `bienvenue` (une fois, à l'arrivée : place, places des vrais joueurs, chef, état complet), `salon` (chef, temps avant le lancement automatique), `manche` (graine et options), `action` (place, action, graine, `auto`), `sieges` (avec la place du chef), `place` (place attribuée à un joueur qui attendait), `refus`. Joueur → serveur : `action` (numéro du coup attendu, action), `lancer` (le chef, dans le salon) et `resync` (état redemandé après un message perdu). `ping` reçoit `pong` sans réveiller le Durable Object. Un changement de format augmente `PROTOCOLE` dans `moteur.js` (le serveur refuse alors les anciennes copies : robots locaux).

## 7. Quota gratuit de Cloudflare

Chiffres du plan Workers Free, lus dans la documentation Cloudflare le 29 octobre 2026 (pages « Durable Objects : Pricing » et « Limits ») :

| Ressource | Limite par jour (remise à zéro à 00:00 UTC) |
| --- | --- |
| Requêtes Durable Objects (HTTP, WebSocket, alarmes) | 100 000 ; un message WebSocket **reçu** compte pour 1/20 de requête, les messages envoyés et les ping automatiques ne comptent pas |
| Durée (temps en mémoire, 128 Mo par objet) | 13 000 Go-s, soit environ 28 heures d'objet en mémoire |
| Lignes écrites (stockage SQLite) | 100 000 ; stockage total 5 Go |

Ce que le multijoueur fait pour rester dedans :

- **Hibernation WebSocket** (`acceptWebSocket`) : entre deux messages, l'objet n'est pas facturé, les connexions restent ouvertes. Aucune minuterie (`setTimeout`/`setInterval`), seulement une alarme, avancée seulement quand elle doit sonner plus tôt.
- Par connexion : environ 4 requêtes (accueil, partie, deux comptes à l'accueil). Par coup d'un vrai joueur : 1/20 de requête et 1 ligne écrite (état de l'arbitre). Par partie en cours : environ 3 alarmes par minute au plus (1 requête et 1 ligne chacune). Les coups des robots ne coûtent rien de plus.
- **Limite globale de vrais joueurs connectés** : `MAX_JOUEURS` dans `multijoueur/wrangler.toml` (80 par défaut). Au-delà, le jeu se joue contre des robots locaux.
- **Plan gratuit** : une limite dépassée ne coûte rien. Les appels échouent jusqu'à minuit UTC, et les jeux passent alors aux robots locaux.
- Ordre de grandeur : 300 parties d'un quart d'heure par jour, avec 10 coups de vrai joueur par minute, font 45 000 coups, soit environ 60 000 lignes écrites et 17 000 requêtes. **Les lignes écrites sont la limite la plus proche** (100 000 par jour) : de l'ordre de 500 parties d'un quart d'heure par jour. Au-delà, il faudra écrire l'état moins souvent (piste : seulement aux fins de manche et aux arrivées) ou passer au plan payant (décision du propriétaire).

## 8. Étiquette « Multi » et rubrique « Multijoueur »

- `game.json` : `"multijoueur": true` et `"places"`, recopiés dans `public/catalog.json` par `scripts/build-catalog.mjs`.
- **Étiquette « Multi »** en haut à gauche de la jaquette, sur le même modèle que « Nouveau » en haut à droite (`.badge-multi` de `public/style.css`, `app.js`, clé `carte.multi`) ; « Jeu multijoueur. » est lu par les lecteurs d'écran (`carte.multiAria`). Comme « Nouveau », elle n'est pas sur la première ligne de l'accueil (jaquettes seules).
- **Rubrique « Multijoueur »** dans la ligne des raccourcis, juste à droite de « Hors ligne » (collection `multi` de `app.js`, icône `collection:multi`, clés `collection.multi` et `collection.multiVide`) : elle liste les jeux marqués multijoueurs. Les 4 raccourcis tiennent dans la moitié gauche de l'écran sur ordinateur (tuiles de 124 px).

## 9. Contrôles (critères de validation)

`node scripts/tester-multijoueur.mjs [<id>…] [--navigateur]` (sans réseau ni Cloudflare : le Worker tourne avec de faux Durable Objects) :

| Critère | Comment |
| --- | --- |
| Jouable entièrement hors ligne contre les robots | `validate-games.mjs` (jeu ouvert seul, réseau coupé) ; parties simulées sans serveur |
| 2 à 10 places | `places` des règles, égal à `"places"` de `game.json` |
| Règles pures et identiques partout | mots interdits, état refait sur un « appareil » à partir des seuls messages = état du serveur |
| Remplacement robot ↔ joueur dans les deux sens | arrivée d'un 2e joueur, table pleine, départs |
| Salon d'attente | pas de manche avant le lancement, seul le chef lance, retour au salon après la manche, nouveau chef au départ du premier, lancement automatique ; dans le navigateur : salon à l'arrivée, salon plein, bouton `data-multi="lancer"` du chef |
| Le départ de n'importe quel joueur n'interrompt pas la partie | départs pendant la manche, robot à la place d'un joueur trop long |
| Robots crédibles et battables | victoires d'un joueur fort, variété des coups |
| Lisible et fluide sur téléphone avec toutes les places occupées | `--navigateur` : faux serveur, table remplie de vrais joueurs, captures dans `captures/multijoueur/<id>/`, coupure du réseau (le jeu doit continuer en solo) ; puis relecture des captures |
| Worker | sites permis, règles et protocole identiques, répartition, `MAX_JOUEURS`, partie libérée |

`validate-games.mjs` vérifie aussi `"multijoueur"` et `"places"`, le moteur `jel-multi` à jour, les règles `jel-regles` avant le code du jeu, `JEL_MULTI.creer`, le bouton `data-multi="jouer"` et le bouton du chef `data-multi="lancer"` (`partie.lancerManche()`).

## 10. Déploiement du Worker

- `.github/workflows/multijoueur.yml` : à chaque envoi sur `main` qui touche `multijoueur/`, `public/multijoueur/`, les jeux ou ces scripts, et à la main. Comme le site sur Cloudflare Pages, le Worker se publie donc depuis `main`. Il écrit `jeux.js`, lance le contrôle, compare la version à celle en ligne (`/etat`) et ne déploie que si elle a changé (un déploiement coupe les parties en cours : les jeux continuent alors sur l'appareil).
- La boucle de nuit relance ce workflow après ses fusions (une fusion par le robot ne déclenche pas les autres workflows).
- Secrets GitHub nécessaires : `CLOUDFLARE_API_TOKEN` (jeton « Edit Cloudflare Workers ») et `CLOUDFLARE_ACCOUNT_ID`. Sans eux, le workflow s'arrête avec un avertissement, sans erreur.
- Premier déploiement : il crée le Worker `fmg-multijoueur`, ses deux Durable Objects et le domaine `multi.freemicrogames.com` (enregistrement DNS posé par Cloudflare). Vérification : `https://multi.freemicrogames.com/etat` répond `{"version":…,"protocole":1,"jeux":[…]}`.

## 11. Boucle de nuit

- **Jeu pilote** : `games/enclos-de-la-ferme/` (« Les Enclos de la ferme », 4 places : on pose des clôtures à tour de rôle, fermer un enclos y met son animal et fait rejouer ; 20 niveaux solo). C'est le modèle à suivre : règles et terrains dans `jel-regles`, places et messages, bouton `data-multi="jouer"`.
- Chaque passage fabrique 5 jeux. **La variable GitHub `MULTI_BOUCLE` donne le nombre de jeux multijoueurs par passage**, de 0 à 5 (ex. `2` : 2 jeux multijoueurs et 3 jeux solo). Elle se pose **une fois le jeu pilote validé par Jérémy**, et se change à tout moment sans toucher au code : dépôt GitHub → **Settings** → **Secrets and variables** → **Actions** → onglet **Variables** → `MULTI_BOUCLE`. Variable absente, `0` ou illisible : la boucle ne fabrique que des jeux solo, comme avant. Passage lancé à la main avec moins de 5 jeux : en proportion, arrondi (2 sur 5 → 1 sur 3, aucun sur 1).
- **Idéation** : avec `MULTI_BOUCLE` = N, l'agent propose environ N idées multijoueurs sur 5, au tour par tour, pensées pour « robots + vrais joueurs » : champ `"multijoueur": true` et `"places"` (2 à 10) de l'idée. La file garde 3 × N idées multijoueurs en attente (3 passages d'avance), même au-delà des 15 idées habituelles (`idees.mjs manque-multi N`, `ajouter … --multi N`).
- **Choix** (`node scripts/idees.mjs choisir 5 --multi N`) : les idées du propriétaire d'abord (elles comptent dans le quota), puis des idées multijoueurs jusqu'à N en tout et des autres sur les places restantes (dans l'ordre de fabrication habituel ; à défaut d'idées d'un type, l'autre complète ; quota des jeux 13+ : `ADOS_BOUCLE`, CLAUDE.md section 10).
- **Fabrication** : l'agent d'un jeu multijoueur lit ce document et suit les sections 3 et 4 ; il lance `node scripts/tester-multijoueur.mjs <id> --navigateur` jusqu'à « Multijoueur : tout est bon » et regarde les captures.
- **Vérification** (étape d) : `tester-multijoueur.mjs <id> --navigateur` est bloquant pour un jeu multijoueur, et le relecteur vérifie la grille de la section 9 (captures comprises). `idees.mjs controler` refuse un jeu dont le caractère multijoueur ne correspond pas à son idée.
- **Après les fusions** : déploiement du Worker relancé (section 10).

## 12. Données personnelles

- Aucune donnée personnelle : ni compte, ni pseudo, ni message entre joueurs. Le lanceur envoie l'identifiant du jeu, l'empreinte de ses règles et les coups joués.
- **Profil joueur** (`docs/cadrage-fidelisation.md`, section 8) : si le joueur a un profil, le lanceur demande au site un **ticket** (`POST /api/profil` `ticket`, après Turnstile, action `multi`) et l'envoie en premier message (`{ t: 'profil', ticket }`), sans attendre (la partie commence de toute façon). Le ticket, signé avec le secret `MULTI_SECRET` (`multijoueur/src/ticket.js`), contient le numéro du profil, le jeu et une expiration (30 min) ; `partie.js` le vérifie et range le numéro avec la connexion. Ce message n'est jamais transmis à l'arbitre : le protocole du moteur ne change pas. À la fin de chaque manche (retour au salon), `partie.js` calcule le résultat de chaque vrai joueur assis relié à un profil (`multijoueur/src/profil.js` : victoire = 1re place du classement des règles, nombre de vrais joueurs, durée, coups joués soi-même) et l'envoie au site (`POST https://freemicrogames.com/api/profil-multi`, `Authorization: Bearer <MULTI_SECRET>`, adresse : variable `SITE_API` de `wrangler.toml`), qui l'enregistre une seule fois par manche et par joueur. Manche de moins de 45 s ou moins de 3 coups joués soi-même : ignorée. Sans `MULTI_SECRET` (secret à poser dans Cloudflare Pages et dans le Worker : `npx wrangler secret put MULTI_SECRET`), les parties marchent comme avant, sans rien créditer.
- Le Worker ne garde que l'état de la partie en cours (places, coups), effacé dès que le dernier joueur part. L'accueil ne garde que le nombre de joueurs par partie. Aucune adresse IP n'est enregistrée par le site (Cloudflare la voit, comme pour toute page).
- Rien n'est écrit sur l'appareil pour le multijoueur. Politiques de confidentialité et de cookies : paragraphe « Parties à plusieurs ».

## 13. Limites et pistes

- Jeux au tour par tour seulement (temps réel : boucle sur le serveur, hors quota gratuit).
- Pas de choix de partie ni d'invitation d'un ami (pas de code de partie) : les joueurs d'un même jeu se retrouvent au hasard.
- Pas de limite par adresse IP (un abus remplirait au pire `MAX_JOUEURS`, puis tout le monde jouerait contre des robots locaux) ; piste : règle de limite de débit de Cloudflare sur `multi.freemicrogames.com/ws`.
- Un déploiement du Worker coupe les parties en cours (elles continuent sur l'appareil).
