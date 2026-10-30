# Cadrage fidélisation et profil joueur

Objectif : inciter les joueurs à revenir régulièrement sur le site, sans compte ni authentification, sans code de suivi dans les jeux (sauf un seul message de fin).

## 0\. Consignes pour Claude Code

* Contexte technique : site statique sur Cloudflare Pages (dépôt Jamesmax27/Jeux-en-ligne), base D1 déjà en place (votes, durées de session), Turnstile déjà intégré pour les votes, jeux multijoueurs sur Cloudflare Worker + Durable Objects, boucle de nuit (agents d'idéation, génération, vérification) qui ajoute des jeux HTML.
* Objectif : implémenter l'ensemble de ce document en une seule passe, sans poser de questions intermédiaires.
* Points ouverts et valeurs à définir (section 12) : les trancher soi-même avec un choix raisonnable, ne pas bloquer dessus.
* Toutes les valeurs réglables (points par minute, bonus, seuils de niveaux, paliers, plafonds, limites anti-robots, durées minimales, règle du jour manqué, fuseau horaire, mode de calcul des classements) sont regroupées dans un seul fichier de configuration, commenté ligne par ligne, modifiable sans toucher au reste du code.
* À la fin, fournir un compte rendu listant chaque point ouvert et le choix retenu, les tables créées ou modifiées, le format exact du message de fin de jeu, et la liste des jeux existants mis à jour.
* Ne pas modifier le comportement des fonctionnalités existantes (votes, catalogue, boucle de nuit) au-delà de ce qui est demandé ici.
* Livrer des tests pour la logique serveur (validation du code de sauvegarde, calcul d'expérience, anti-triche multijoueur, contrôle des étoiles).
* Conserver ce document dans le dépôt, sous docs/cadrage-fidelisation.md, et le garder comme référence pour toutes les évolutions futures du profil joueur ; le mettre à jour si un choix d'implémentation s'écarte de ce qui est écrit ici.

## 1\. Principes

* Aucune authentification, aucune donnée personnelle collectée.
* Un identifiant anonyme aléatoire est créé dès la première visite et envoyé à la base Cloudflare, avec un pseudo par défaut (par exemple "Joueur" suivi d'un nombre aléatoire).
* La base Cloudflare (D1) est la source de vérité pour tout ce qui apparaît dans le profil ou le classement : identifiant, pseudo, avatar, expérience, niveau, badges, jeux joués et terminés, étoiles par jeu, série de jours consécutifs, date de dernière visite.
* Le navigateur (localStorage) sert de cache : copie de ces données pour l'affichage immédiat, plus le compteur de temps en cours et les réglages d'interface, qui restent uniquement en local.
* Synchronisation vers la base aux moments clés : fin de jeu, passage de niveau, toutes les cinq minutes de jeu, et à la fermeture de la page.
* Conséquence acceptée : ce qui reste uniquement en cache est perdu lors d'un changement d'appareil ; le code de sauvegarde ne restaure que ce qui est en base.
* La logique d'expérience reste dans le site, autour du jeu (cadre d'affichage), pas dans les jeux.
* Les défis du jour sont volontairement mis de côté : à réfléchir plus tard.

## 2\. Pastille de profil

* Petite pastille en coin d'écran, visible sur tout le site, qui affiche l'avatar et le niveau.
* Un clic ouvre la page de profil.

## 3\. Code de sauvegarde (changement d'appareil)

* Depuis le profil, le joueur peut afficher et copier son code de sauvegarde, puis le saisir sur un autre appareil pour retrouver sa progression.
* Format : 4 mots simples tirés d'une liste d'environ 2 000 mots, séparés par des tirets (exemple : chat-lune-fusée-pomme). Facile à lire, dicter et recopier, sans confusion entre 0 et O.
* Environ 16 000 milliards de combinaisons, plus une petite clé de contrôle qui détecte les fautes de frappe.
* Le code ne contient pas la progression : il sert uniquement de clé. La progression (niveau, expérience, jeux joués, jeux terminés, badges, avatar) est stockée de façon anonyme dans la base de données Cloudflare déjà en place, et retrouvée via ce code.
* Codes tirés avec un générateur aléatoire sécurisé, jamais construits à partir du pseudo ou d'un compteur.
* Limite acceptée : quelqu'un qui partage son code donne accès à sa progression ; impact faible car aucune donnée personnelle.

### Protection contre les robots et la force brute

* Réutiliser Turnstile (déjà en place pour les votes) : le contrôle anti-robot doit être passé pour valider un code saisi.
* Limiter les essais ratés par adresse (par exemple 5 par heure), avec un blocage temporaire de plus en plus long si les échecs continuent.
* Limiter la création de nouveaux codes par adresse, pour éviter qu'un robot remplisse la base.
* Les valeurs exactes des limites sont à régler à l'implémentation.

## 4\. Expérience, niveaux et déblocages

* Expérience commune à tout le site (pas propre à chaque jeu).
* Sources d'expérience : temps passé sur le site (mesuré par le site) et bonus de complétion d'un jeu.
* Niveaux progressifs : les premiers sont rapides et faciles (les cinq premiers atteignables en une session), puis de plus en plus longs, avec des paliers qui demandent de revenir sur plusieurs jours.
* Déblocages proposés (à affiner) :

  * Avatars et accessoires pour la pastille de profil.
  * Jeux bonus ou modes difficiles réservés aux niveaux élevés.
  * Badges de collection : un par jeu terminé, et des badges rares pour des exploits.

## 5\. Message "jeu terminé"

* Chaque jeu envoie un seul message standard au site, uniquement quand tout le jeu est terminé (par exemple les 20 niveaux sur 20).
* Aucun autre code de suivi dans les jeux : le temps passé est mesuré par le site.
* Le message contient aussi les étoiles obtenues et les étoiles possibles (voir section 11). Une seule ligne à ajouter en fin de jeu ; l'agent de génération de nuit l'inclut automatiquement dans les nouveaux jeux.
* Le site attribue alors un badge de complétion et un bonus d'expérience.
* Rejouer un jeu déjà terminé ne redonne pas le bonus.
* Les jeux existants devront être mis à jour pour envoyer ce message.

## 6\. Page de profil

* Liste des jeux auxquels le joueur a déjà joué, avec pour chacun : statut terminé ou non, badge de complétion, temps passé, bouton pour rejouer.
* Tri : derniers jeux joués en premier.
* Accès au code de sauvegarde, avatar, niveau et badges.

## 7\. Check vert "terminé"

* Petit check vert sur la vignette de chaque jeu terminé, à la fois dans le catalogue et dans la page de profil.
* Le catalogue lit la liste des jeux terminés dans le navigateur ; elle suit le joueur grâce au code de sauvegarde.

## 8\. Multijoueur : progression et classement

### Expérience multijoueur

* Même expérience commune que pour le reste du site : une partie multijoueur terminée rapporte de l'expérience.
* Un seul envoi de données, à la fin de la partie (pas à chaque action, élimination ou bot battu).
* Le message de fin contient : le jeu, le résultat, le nombre de vrais joueurs présents, la durée.
* Barème : une victoire contre de vrais joueurs rapporte plus qu'une victoire contre des bots ; jouer sans gagner rapporte un petit bonus de participation.
* Plafond d'expérience multijoueur par jour, pour éviter de relancer des parties vides contre des bots en boucle.
* Badges propres au multijoueur : paliers de victoires à 1, 3, 5 et 10 victoires ; paliers de parties jouées (victoire ou non) à 1, 10 et 50 parties ; première victoire contre un bot ; série de victoires. Les victoires contre de vrais joueurs comptent dans des badges distincts et valent plus que celles contre des bots. Paliers à ajuster.

### Anti-triche

* En multijoueur, c'est le serveur Cloudflare qui valide et enregistre le résultat, jamais le navigateur du joueur.
* Chaque partie a un identifiant unique créé par le serveur ; un résultat n'est enregistré qu'une seule fois par partie et par joueur (bloque les renvois multiples).
* Le serveur vérifie la présence réelle du joueur : durée minimale et minimum d'actions ; les parties trop courtes sont ignorées.
* Plafonds d'expérience quotidiens et Turnstile à l'entrée d'une partie.
* Jeux solo : le message "jeu terminé" vient du navigateur et peut être falsifié par un tricheur motivé. Limitation par durée minimale et plafond quotidien, sans empêcher totalement ; risque jugé faible car l'enjeu est un badge.

### Classement

* Aucun ajout sur la page principale (déjà chargée) : le classement est une page à part.
* Accès depuis la pastille de profil, via un petit menu à deux entrées : "Mon profil" et "Classement".
* Deux sélecteurs en haut : périmètre (classement général du site, ou classement d'un jeu multijoueur) et période (semaine ou mois).
* Affichage du top 100 : pseudo, avatar, niveau.
* Un joueur en dehors du top 100 voit sa propre position ; en cliquant dessus, il peut consulter le top 100.
* Rappel de rang dans la page de profil (par exemple "42e cette semaine"), avec lien vers le classement complet.
* Remise à zéro périodique (semaine ou mois) ; idée de rangs par jeu (bronze, argent, or) à confirmer.

### Pseudos

* Pseudo par défaut attribué à la création du profil ("Joueur" suivi d'un nombre aléatoire), modifiable depuis la page de profil.
* Le nouveau pseudo est vérifié côté serveur avant acceptation : unicité dans la base, et filtre de mots interdits (public d'enfants).
* Contrôle à la saisie et sur le serveur, pas seulement dans le navigateur.
* À régler : listes de mots interdits en plusieurs langues (public international), gestion des contournements (chiffres, accents, espaces), possibilité de signaler un pseudo.

## 9\. Retour quotidien et jours consécutifs

* Le site détecte qu'un joueur est revenu d'un jour à l'autre grâce à la date de dernière visite stockée avec sa progression (navigateur, et base via le code de sauvegarde).
* La page de profil affiche la série en cours : nombre de jours consécutifs et record personnel.
* Le joueur gagne des récompenses en fonction des jours consécutifs : bonus d'expérience qui grandit avec la série, et paliers de badges ou de déblocages (par exemple 3, 7, 14 et 30 jours).
* Message de bienvenue au retour : ce qui a été gagné et ce qui est nouveau depuis la dernière visite.
* Un bloc "nouveautés" met en avant les jeux ajoutés par la boucle de nuit.
* Règles à définir : ce qui arrive quand un jour est manqué (remise à zéro, ou tolérance d'un jour), et le fuseau horaire utilisé pour définir un jour.

## 10\. Indicateurs de fidélisation

* Objectif : savoir quelles mécaniques font réellement revenir les joueurs.
* Les indicateurs alimentent la base statistique déjà en place (votes et durée de session), pour être corrélés avec les données existantes.
* Taux de retour à 1 jour, 7 jours et 30 jours.
* Longueur des séries de jours consécutifs.
* Niveau moyen et répartition des joueurs par niveau.
* Nombre de jeux terminés par joueur.
* Utilisation du code de sauvegarde (créations et restaurations).
* Pour le multijoueur : parties jouées, part de parties contre des bots, présence dans le classement.
* Données anonymes, rattachées à l'identifiant aléatoire du joueur, sans donnée personnelle.
* À définir : comment les indicateurs sont croisés avec la base existante, et à quelle fréquence ils sont mis à jour.

## 11\. Étoiles

* Beaucoup de jeux donnent 1, 2 ou 3 étoiles à la fin de chaque niveau ou partie. Le site remonte le total d'étoiles gagnées par jeu.
* Le message "jeu terminé" (section 5) transporte deux nombres en plus : les étoiles obtenues et les étoiles possibles dans ce jeu (par exemple 45 sur 60). Toujours un seul envoi par jeu, à la fin.
* Pour chaque jeu, le site garde le meilleur résultat : si le joueur rejoue pour s'améliorer, le total est remplacé par le meilleur score, sans cumul.
* Page de profil : un total général en haut, "étoiles gagnées / étoiles possibles" sur l'ensemble des jeux terminés (par exemple 45 / 60), avec une barre de progression qui se remplit.
* Chaque jeu de la liste du profil affiche aussi ses propres étoiles (par exemple 18 / 60).
* Le total d'étoiles peut alimenter un classement à part (section 8) et donner de l'expérience.
* Les jeux sans système d'étoiles n'envoient rien et ne comptent pas dans le total.
* Contrôle de cohérence côté serveur : le nombre d'étoiles obtenues ne peut pas dépasser le nombre possible.
* À définir : barème d'expérience par étoile, mode de calcul du classement (étoiles brutes ou pourcentage), jeux existants à mettre à jour pour envoyer les étoiles.

### Jeux futurs et ajout manuel

* Jeux générés par la boucle de nuit : la consigne donnée à l'agent de génération impose d'intégrer le système d'étoiles (1 à 3 par niveau ou partie) et d'envoyer le message de fin avec étoiles obtenues et possibles. L'agent de vérification contrôle sa présence avant la fusion.
* Ajout manuel d'un jeu : le formulaire ou la procédure d'ajout prend en compte les étoiles, avec un champ pour le nombre d'étoiles possibles et une vérification que le jeu envoie bien le message de fin.
* Jeux sans étoiles : cas accepté, ils n'envoient rien et ne comptent pas dans le total.
* À vérifier : si les jeux déjà en ligne ou en cours de génération intègrent déjà les étoiles, et lesquels doivent être mis à jour.

## 12\. Points ouverts

* Défis du jour : à réfléchir plus tard.
* Détail des déblocages par niveau (avatars, jeux bonus, badges rares).
* Courbe d'expérience exacte (points par minute, bonus de complétion, seuils de niveaux).
* Réglage précis des limites anti-robots (nombre d'essais, durée de blocage).
* Adaptation des jeux déjà en ligne pour le message "jeu terminé".
* Multijoueur : valeurs exactes du barème d'expérience, du plafond quotidien, de la durée minimale et du minimum d'actions.
* Classement : choix semaine ou mois, rangs bronze/argent/or, durée de conservation des anciens classements.
* Pseudos : choix et maintenance de la liste de mots interdits.
* Jours consécutifs : règle en cas de jour manqué, fuseau horaire, valeur des récompenses par palier.
* Indicateurs : liaison exacte avec la base statistique existante et fréquence de mise à jour.
* Étoiles : barème d'expérience par étoile, classement en étoiles brutes ou en pourcentage ; vérifier quels jeux existants intègrent déjà les étoiles et les mettre à jour ; mise à jour des consignes de la boucle de nuit et du formulaire d'ajout manuel.
* Format exact du message de fin de jeu et mécanisme de transmission entre le jeu (dans son cadre) et le site : à concevoir, en une seule ligne ajoutable à n'importe quel jeu HTML.
* Multijoueur : comment le serveur relie une partie à l'identifiant anonyme du joueur (transmis à l'entrée de la partie) pour créditer le bon profil.
* Nom et structure des nouvelles tables de la base D1.

## 13\. Découpage proposé en étapes

Ordre proposé, à ajuster. Les jeux multijoueurs sont déjà en cours de déploiement : l'étape 4 ne concerne que la gestion du profil côté multijoueur.

1. Pastille de profil, expérience commune, niveaux, temps passé, message "jeu terminé", badge de complétion, total d'étoiles dans le profil et check vert dans le catalogue et le profil.
2. Code de sauvegarde (4 mots, stockage anonyme dans la base Cloudflare) avec protection anti-robots : Turnstile, limites d'essais, limite de création de codes.
3. Jours consécutifs et récompenses, message de bienvenue, bloc nouveautés, indicateurs de fidélisation reliés à la base statistique.
4. Profil côté multijoueur : message de fin de partie envoyé par le serveur, expérience et badges multijoueur, anti-triche, pseudos filtrés, classement top 100.


## 14. Implémentation et choix retenus (30 octobre 2026)

Document de référence pour toute évolution du profil joueur : le garder à jour si un choix change. **Toutes les valeurs réglables sont dans `public/profil-reglages.js`** (un seul fichier, commenté ligne par ligne, lu par le site, le serveur, le Worker multijoueur et les tests).

### 14.1 Points ouverts tranchés (section 12)

| Point ouvert | Choix retenu |
| --- | --- |
| Défis du jour | Mis de côté, comme demandé (rien n'est construit). |
| Courbe d'expérience | 10 XP par minute de jeu (jeu visible dans le lanceur), 60 minutes comptées par jour (UTC). Niveaux : 0, 20, 50, 100, 160 XP pour les niveaux 1 à 5 (les 5 premiers en une séance d'environ 16 min), puis chaque niveau demande 30 XP de plus que le précédent (6e : 250, 7e : 370…, 20e : 5 110), 100 niveaux au plus. Le plafond du jour oblige à revenir plusieurs jours pour les paliers. |
| Bonus de complétion, étoiles | 100 XP la première fois qu'un jeu est terminé (jamais redonné), 5 XP par étoile gagnée en plus du meilleur résultat déjà enregistré ; 10 premières fins acceptées par jour, les suivantes attendent le lendemain ; 60 s de jeu au moins sur le jeu avant d'accepter « terminé ». |
| Déblocages | 29 avatars (dessins emoji) : 6 au départ, puis aux niveaux 2 à 50, et 6 liés à des badges (série de 7 et 30 jours, « sans faute », 10 jeux terminés, première victoire en ligne, 5 victoires contre de vrais joueurs) ; 7 cadres d'avatar (bronze niv. 5, argent 15, or 30, diamant 60, arc-en-ciel avec la série de 14 jours, étoilé avec 500 étoiles). **Jeux bonus et modes difficiles réservés aux niveaux élevés : pas construits** (aucun jeu bonus n'existe encore ; à ajouter avec le premier, par exemple un champ `niveau_requis` dans `game.json` vérifié par le lanceur). |
| Badges | Un badge par jeu terminé (affiché dans « Mes jeux »), plus 30 badges rares : jeux terminés (1, 5, 10, 25, 50, 100), étoiles (50, 200, 500, 1 000, « sans faute » = toutes les étoiles d'un jeu), séries (3, 7, 14, 30 jours), niveaux (10, 25, 50), multijoueur (manches jouées 1, 10, 50 ; victoires 1, 3, 5, 10 ; victoires contre de vrais joueurs 1, 3, 5, 10 ; première victoire contre des robots ; 3 victoires d'affilée). |
| Limites anti-robots | Code de sauvegarde : Turnstile à chaque essai, 5 essais ratés par heure et par adresse, puis blocages de 1 h, 4 h, 24 h, 7 jours (remis à zéro après 7 jours sans échec). 10 codes créés par adresse et par jour, 60 profils créés par adresse et par jour (une école partage souvent une adresse), 10 changements de pseudo. « Adresse » = empreinte de l'adresse IP (/64 en IPv6) avec `IP_SALT`, jamais l'adresse. |
| Message « jeu terminé » des jeux existants | Les 101 jeux ont été mis à jour (section 14.4). |
| Multijoueur : barème | Victoire avec au moins un autre vrai joueur : 60 XP ; victoire contre des robots seulement : 20 XP ; manche jouée sans gagner : 5 XP ; 300 XP multijoueur au plus par jour ; manche de moins de 45 s ou avec moins de 3 coups joués soi-même : ignorée. |
| Classement | Semaine (depuis le lundi, UTC) et mois (depuis le 1er), au choix en haut de la page, remis à zéro au début de chaque période ; périmètres : général (XP de la période), étoiles (étoiles gagnées sur la période, en nombre brut et non en pourcentage), et un par jeu multijoueur (XP de ses manches en ligne). Rangs or, argent, bronze : les 3 premiers de chaque classement (médailles). Profils de niveau 1 absents (robots). Gains par jour gardés 13 mois : les anciens classements pourraient être recalculés, seule la période en cours est affichée. |
| Pseudos | 3 à 16 lettres, chiffres, espaces, tirets ou soulignés ; pas plus de 4 chiffres d'affilée ; unique (sans tenir compte des majuscules, accents, espaces et tirets) ; formes « Joueur1234 », « Player12 »… réservées ; liste de mots interdits en 5 langues (`functions/_pseudos-interdits.js` : racines interdites partout, mots courts interdits seulement en mot entier, noms réservés ; normalisation des accents, chiffres et symboles de contournement, lettres répétées, lettres isolées recollées). Signalement depuis le classement (niveau 3 au moins) : 3 joueurs différents → le pseudo redevient « Joueur <nombre> ». Le pseudo par défaut est traduit (« Player 4821 », « Jugador 4821 »…). |
| Jours consécutifs | Jour = celui de l'appareil du joueur (son fuseau) ; le serveur refuse un jour à plus d'un jour de la date UTC ou antérieur au dernier jour noté. Un jour manqué est toléré (la série continue, le jour manqué ne compte pas) ; au-delà, nouvelle série. Bonus du retour : 10 XP × jours de la série (70 au plus), +50 XP aux paliers 3, 7, 14 et 30 jours (badge à chaque palier). |
| Indicateurs | Calculés chaque jour par `/api/stats-jour` (même tâche planifiée que les statistiques des jeux, 06:37 UTC), table `fidelisation_jour` dans la même base D1, mêmes jours UTC que `game_stats_daily` (on les rapproche par la date) ; onglet « Stats » de `/idees`, bloc « Fidélisation ». Retour à 1 jour = profils créés la veille revenus ce jour ; retour à 7 (30) jours = profils créés 7 (30) jours plus tôt revenus au moins une fois depuis. |
| Format du message de fin | `if (window.FMG) window.FMG.reportComplete({ stars: <obtenues>, maxStars: <possibles> });` (jeu sans étoiles : `reportComplete({})`). Voir 14.2. |
| Lien partie multijoueur ↔ profil | Ticket signé (section 14.3). |
| Tables D1 | Voir 14.5. |

### 14.2 Message « jeu terminé »

- Une ligne dans le jeu : `if (window.FMG) window.FMG.reportComplete({ stars, maxStars });`, quand **tous les niveaux ont été gagnés au moins une fois** ; `stars` = somme des meilleures étoiles de chaque niveau, gardées dans la sauvegarde `JEL_SAVE` ; `maxStars` = étoiles possibles, égal au champ `"etoiles"` de `game.json` (posé par `node scripts/etoiles-jeu.mjs <id> <n>`). Jeu sans étoiles : `reportComplete({})` ; jeu qui ne se termine jamais : aucun appel et `"sans_fin": true`.
- **Écart avec la section 5** (« un seul envoi ») : après la fin du jeu, chaque nouvelle victoire d'un niveau renvoie le message avec le total à jour, pour que « le meilleur résultat » de la section 11 puisse s'améliorer quand le joueur rejoue. Le serveur ne redonne jamais le bonus de fin et ne garde que le meilleur total (sans cumul) ; le lanceur n'envoie pas deux fois le même total.
- Transmission : `window.FMG.reportComplete` est fourni à tous les jeux par le lanceur (`SCRIPT_SUIVI`, `public/suivi.js`) → message `jel-termine` → `public/profil.js` (`noterTermine`) → envoi immédiat à `/api/profil` (`sync`). Le serveur vérifie : jeu publié et pas « sans fin », `maxStars` égal à `"etoiles"` du catalogue, `stars` ≤ `maxStars`, 60 s de jeu au moins sur ce jeu, plafond du jour. Refus provisoire (« trop court », plafond) : le navigateur réessaie pendant 7 jours.
- Contrôles : `validate-games.mjs` (appel, garde, accord avec `"etoiles"` / `"sans_fin"`), consignes et relecture de la boucle de nuit, compétence `ajouter-jeu-site` (le nombre d'étoiles possibles est demandé à l'utilisateur).

### 14.3 Multijoueur

- Turnstile à l'entrée : en ouvrant une partie en ligne, le lanceur demande au site un ticket (`/api/profil`, action `ticket`, Turnstile action `multi`), signé HMAC avec le secret `MULTI_SECRET` (numéro du profil, jeu, 30 min de validité), et l'envoie au Worker dès l'ouverture de la connexion. La partie démarre sans attendre : sans ticket (Turnstile refusé, pas de profil), elle se joue normalement, sans rien créditer.
- Le Worker (`multijoueur/src/partie.js`, `profil.js`, `ticket.js`) observe l'arbitre sans changer son protocole : début de manche, coups joués par chaque vrai joueur (pas ceux du robot à sa place), fin de manche (retour au salon). Il envoie alors le résultat de chaque joueur assis relié à un profil (`partie#manche`, profil, jeu, victoire = 1re place des règles, vrais joueurs présents, durée, coups) à `POST /api/profil-multi` (secret `MULTI_SECRET`). Le site l'enregistre une seule fois par manche et par joueur (`multi_resultats`), revérifie durée et coups, applique le barème et le plafond du jour.

### 14.4 Jeux mis à jour

Les 101 jeux appellent `reportComplete` (ou sont marqués `"sans_fin"`), avec `"etoiles"` dans `game.json`, `version` augmentée et `maj` au 30 octobre 2026. Quand un jeu ne gardait ses étoiles que dans son propre `localStorage` (qui ne marche pas dans le cadre du site), elles ont été ajoutées à ses données `JEL_SAVE`. Liste et cas particuliers : compte rendu de la pull request.

### 14.5 Tables D1

Créées automatiquement par `preparerTablesProfil` (`functions/_profil.js`) ; structure commentée : `migrations/0002_profils.sql`. `profils` (un par joueur : numéro, code, pseudo, avatar, cadre, XP, niveau, badges rares, série, dernier jour, compteurs multijoueur), `profils_appareils` (empreinte SHA-256 du jeton secret de chaque appareil, 10 par profil), `profils_jeux` (temps, fin, meilleures étoiles par jeu), `profils_gains` (gains par jour UTC : classements, plafonds), `profils_jours` (jours de visite), `multi_resultats`, `profils_limites`, `profils_blocages`, `profils_signalements`, `profils_evenements` (profils, codes, restaurations par jour), `fidelisation_jour`. Aucune table existante n'est modifiée.

### 14.6 Autres choix et écarts

- **Temps passé** : compté seulement quand un jeu est affiché et visible dans le lanceur (pas sur les pages du catalogue, pour ne pas récompenser une page oubliée ouverte). Le serveur ne compte jamais plus que le temps réellement écoulé depuis l'envoi précédent (+ 60 s), ce qui neutralise aussi deux onglets ouverts en même temps.
- **Envois à la base** : fin de jeu, passage de niveau (estimé sur l'appareil), toutes les 5 minutes de jeu, page cachée ou fermée (`sendBeacon`) ; à l'ouverture d'une page, seulement s'il y a quelque chose à envoyer ou un nouveau jour (sinon simple relecture, sans écriture, au plus toutes les 30 min) : quelques lignes écrites par joueur actif toutes les 5 minutes, loin de la limite gratuite de D1.
- **Code de sauvegarde** : 4 mots d'une liste de 2 048 mots français simples **sans accents** (`public/profil-mots.js` : « fusee » et non « fusée » ; un accent tapé est accepté) puis 2 chiffres de clé de contrôle (ex. `chat-lune-fusee-pomme-37`). Le code n'est créé qu'à la première demande (page « Mon profil »). Le retrouver relie l'appareil au profil : la progression de cet appareil est remplacée (le joueur est prévenu et doit confirmer). Chaque appareil a son propre jeton secret ; la base n'en garde que l'empreinte.
- **Bienvenue** : sur l'accueil, au premier passage d'un nouveau jour (série, bonus, nouveaux jeux depuis la dernière visite, sans les jeux 13+) ; ailleurs, une simple annonce. Le bloc « Nouveautés » existant de l'accueil met déjà en avant les jeux de la boucle de nuit.
- **Pastille** : dans l'en-tête de toutes les pages générées (coin haut droit, avant le choix de langue) et dans la barre du lanceur ; menu « Mon profil » / « Classement ». Pages `/profil/` et `/classement/` (5 langues, non indexées, `public/chemins.js`).
- **Check vert** : sur toute vignette d'un jeu terminé (catalogue, Nouveautés, Tendances, pages des catégories et des jeux similaires, « Mes jeux » du profil), d'après la copie du profil gardée sur l'appareil.
- **Profils inactifs** : effacés après 2 ans sans visite (avec tout ce qui s'y rattache) ; gains par jour, jours de visite et manches : 13 mois.
- **Consentement** : le profil est un service que le joueur utilise (comme la sauvegarde des jeux) ; il marche que les cookies soient acceptés ou refusés. Politiques de confidentialité, de cookies et conditions d'utilisation (fr, en) mises à jour.
- **En local** (`npm run dev`) : la vraie API du profil tourne dans `scripts/serve.mjs` avec une base SQLite en mémoire (sans Turnstile : code de sauvegarde à retrouver et ticket multijoueur indisponibles).
- **Tests** : `node scripts/tester-profil.mjs` (code de sauvegarde, expérience, séries, étoiles, anti-triche multijoueur, classement, indicateurs), dans `validate.yml`.

### 14.7 À faire par le propriétaire

- Poser le secret `MULTI_SECRET` (une même valeur longue et aléatoire) dans Cloudflare Pages (variables du projet) **et** dans le Worker (`npx wrangler secret put MULTI_SECRET` dans `multijoueur/`, ou tableau de bord) : sans lui, les manches en ligne ne créditent rien (le reste du profil marche).
- Dans Turnstile, rien à changer : les nouvelles actions (`code`, `multi`) utilisent la même clé.
- Réinstaller la compétence `outils/ajouter-jeu-site-v2.zip` dans claude.ai.
