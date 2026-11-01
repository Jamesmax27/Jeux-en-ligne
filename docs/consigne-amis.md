# Free Micro Games – Consigne : système d'amis, présence, rejoindre et classement entre amis

Il ajoute une fonctionnalité par-dessus le profil joueur déjà en production.

## 0. Consignes pour Claude Code

- Lire d'abord docs/cadrage-fidelisation.md et docs/consigne-refonte-visuelle.md, puis le code en production du profil joueur (identifiant anonyme, pseudo unique vérifié serveur, tables D1, fichier de configuration unique, pages profil et classement, Worker et Durable Objects des jeux multijoueurs). S'appuyer sur l'existant, ne rien réinventer.
- Implémenter l'ensemble de ce document en une passe, sans question intermédiaire ; trancher seul les points ouverts de la section 7 avec un choix raisonnable.
- Ajouter les nouvelles valeurs réglables (limites, délais, durées) dans le fichier de configuration existant, commentées ligne par ligne.
- Respecter la direction visuelle déjà en place (spatial, jeu vidéo, sobre) pour tout nouvel écran ou composant ; réutiliser les composants existants.
- Ne pas modifier le comportement des fonctionnalités existantes (votes, catalogue, boucle de nuit, expérience, badges, code de sauvegarde, classement général) au-delà de ce qui est demandé ici.
- Livrer des tests serveur pour la logique d'amitié, de présence et de classement entre amis.
- Conserver ce document dans le dépôt sous docs/consigne-amis.md et le mettre à jour si un choix s'écarte de ce qui est écrit.

## 1. Principes

- Toujours aucune authentification, aucune donnée personnelle : l'amitié relie deux identifiants anonymes, via le pseudo unique déjà en place.
- Ajout d'un ami en saisissant son pseudo exact. L'autre joueur reçoit une demande et l'accepte ou la refuse ; aucune amitié n'existe sans acceptation. Pas d'ajout automatique, pas de suggestion d'amis.
- Chaque joueur peut retirer un ami ou bloquer un pseudo (le bloqué ne peut plus envoyer de demande et ne voit plus la présence).
- Limites : nombre maximal d'amis, nombre maximal de demandes en attente envoyées, limite de demandes par heure. Valeurs dans le fichier de configuration.
- Le pseudo étant la seule clé d'ajout, la recherche n'existe pas : pas de liste publique de joueurs, pas de recherche partielle, pas de parcours de pseudos.
- La liste d'amis suit le joueur par le code de sauvegarde, comme le reste du profil : elle est en base D1, pas seulement en cache.

## 2. Liste d'amis et présence

- Une page Amis, accessible depuis le menu de la pastille de profil (troisième entrée : Mon profil, Classement, Amis), avec un indicateur sur la pastille quand une demande est en attente.
- La page affiche : les amis en ligne en premier, puis hors ligne ; pour chacun : avatar, pseudo, niveau, statut (en ligne, en jeu, hors ligne), et le jeu en cours quand il y en a un, avec un bouton Rejoindre.
- Présence : le site envoie un signal léger au serveur à intervalle régulier tant que l'onglet est actif, avec le jeu ouvert s'il y en a un. Un joueur est considéré hors ligne après un délai sans signal. Intervalle et délai dans la configuration ; viser un coût négligeable en requêtes.
- Les signaux de présence ne sont pas historisés : seul le dernier état est conservé. Aucun historique de qui a joué à quoi et quand.
- Confidentialité : la présence et le jeu en cours ne sont visibles que par les amis acceptés. Un réglage dans le profil permet de se montrer hors ligne (mode invisible).
- Actualisation de l'affichage : la page Amis et le classement entre amis se chargent immédiatement à l'ouverture, puis s'actualisent automatiquement toutes les 30 secondes tant que la page est visible (suspendu quand l'onglet est masqué, relancé dès qu'il redevient visible).
- Bouton Actualiser : déclenche une actualisation immédiate, mais au maximum une fois toutes les 10 secondes. Un appui pendant ce délai ne déclenche aucune requête (bouton grisé ou compte à rebours discret). Cette limite est appliquée côté navigateur et vérifiée côté serveur par identifiant. Valeurs 30 s et 10 s dans le fichier de configuration.

## 3. Rejoindre un ami dans son jeu

- Quand un ami est en jeu, le bouton Rejoindre ouvre le même jeu directement.
- Jeux multijoueurs : le bouton doit amener dans la même partie ou le même salon que l'ami, pas seulement dans le jeu. Chaque jeu multijoueur a sa propre façon de rejoindre (code de salon, identifiant de partie, lien) : définir une interface commune côté site, par exemple un champ identifiant de session que le jeu transmet au site via le signal de présence, et que le site renvoie au jeu dans l'adresse d'ouverture. Chaque jeu multijoueur existant est adapté pour lire cet identifiant à l'ouverture et rejoindre la bonne partie.
- Si la partie est pleine, terminée ou introuvable, afficher un message clair et proposer d'ouvrir le jeu quand même.
- Jeux solo : le bouton ouvre simplement le jeu ; afficher que l'ami y joue en ce moment, sans promesse de retrouvailles.
- La boucle de nuit et l'ajout manuel sont mis à jour : tout nouveau jeu multijoueur doit exposer son identifiant de session via l'interface commune ; l'agent de vérification le contrôle.
- Le passage par Turnstile à l'entrée d'une partie multijoueur reste en place.
- Déploiement progressif : il n'est pas obligatoire d'adapter tous les jeux multijoueurs d'un coup. Le bouton Rejoindre ouvre le jeu pour tous ; il ne promet la même partie que pour les jeux déjà adaptés, et l'indique clairement sinon. Commencer par un ou deux jeux multijoueurs pour valider le mécanisme, puis étendre. Le compte rendu liste les jeux adaptés et ceux restant à faire.
- Affichage des pseudos dans les jeux multijoueurs : actuellement, certains jeux n'affichent que « Joueur » ou un numéro pour les autres participants. Le serveur transmet le pseudo de chaque joueur présent (déjà connu via l'identifiant anonyme transmis à l'entrée de la partie), et chaque jeu multijoueur l'affiche à la place du libellé générique : dans la liste des participants, sur les avatars ou unités en jeu quand c'est pertinent, et dans le message de fin de partie. Appliquer cette règle à tous les jeux multijoueurs existants et l'ajouter aux consignes de la boucle de nuit pour les futurs jeux.

## 4. Classement entre amis

- Dans la page Classement existante, ajouter un périmètre Amis aux sélecteurs actuels (général, par jeu multijoueur) en gardant les périodes semaine et mois.
- Le classement entre amis inclut le joueur lui-même et ses amis acceptés, triés selon le même mode de calcul que le classement général.
- Chaque ligne affiche en plus le statut de présence et, pour les amis en jeu, le jeu en cours avec le même bouton Rejoindre que dans la page Amis.
- Un résumé court dans la page de profil : rang parmi les amis cette semaine, lien vers le classement.

## 5. Serveur, données et anti-abus

- Toute la logique d'amitié (demande, acceptation, refus, retrait, blocage) est validée côté serveur ; le navigateur ne fait qu'afficher.
- Nouvelles tables D1 : relations d'amitié avec état (en attente, acceptée, bloquée) et horodatage, et présence (dernier signal, jeu en cours, identifiant de session). Nommage et structure à préciser dans le compte rendu. Le stockage de la présence peut utiliser un Durable Object ou KV si c'est plus adapté que D1 ; justifier le choix.
- Limiter les demandes d'ami par adresse et par identifiant (anti-spam), et appliquer Turnstile à l'envoi d'une demande si les limites simples ne suffisent pas.
- Un joueur ne peut voir la présence que d'identifiants avec lesquels une amitié acceptée existe ; vérifier côté serveur à chaque lecture.
- Indicateurs à ajouter à la base statistique existante : nombre d'amis par joueur, demandes envoyées et acceptées, utilisation du bouton Rejoindre, part de joueurs avec au moins un ami.
- Maîtrise du nombre de requêtes (le site est sur l'offre gratuite Cloudflare : 100 000 requêtes Workers par jour, et D1 renvoie des erreurs au-delà de ses quotas quotidiens de lecture et d'écriture) :
  - Signal de présence envoyé uniquement quand l'onglet est visible (Page Visibility API), suspendu sinon ; intervalle long par défaut (au moins 2 minutes, réglable dans la configuration), et un signal immédiat seulement lors des changements d'état (ouverture ou fermeture d'un jeu, entrée dans une partie).
  - Présence stockée dans un Durable Object ou en mémoire côté serveur, jamais écrite dans D1 à chaque signal. D1 ne reçoit que les données durables (amitiés, demandes, blocages).
  - Lecture de la présence des amis regroupée en une seule requête pour toute la liste, rafraîchie seulement quand la page Amis ou le classement entre amis est ouvert et visible ; pas d'interrogation en arrière-plan sur les autres pages.
  - Le classement entre amis est calculé à la demande et mis en cache quelques minutes, pas recalculé à chaque affichage.
  - Fournir dans le compte rendu une estimation chiffrée du nombre de requêtes Workers et d'écritures D1 par heure de jeu et par joueur actif, et le seuil approximatif de joueurs simultanés supporté par l'offre gratuite.
  - Prévoir un mode dégradé : si un quota est atteint, la présence et le classement entre amis se désactivent proprement avec un message discret, sans casser le reste du site.
  - Signaler dans le compte rendu le moment où le passage à l'offre payante Workers deviendrait nécessaire.

## 6. Points ouverts à trancher

- Valeurs exactes : nombre maximal d'amis, demandes en attente, limite par heure, intervalle de signal de présence, délai avant hors ligne.
- Mécanisme précis de l'interface commune de session pour rejoindre une partie, et liste des jeux multijoueurs existants à adapter.
- Choix du stockage de la présence (D1, KV ou Durable Object).
- Notification d'une demande reçue : indicateur sur la pastille seulement, ou aussi message à l'ouverture du site.
- Que devient une amitié si un joueur restaure son profil sur un autre appareil via le code de sauvegarde (attendu : elle suit, car en base).

## 7. Compte rendu attendu

- Pour chaque point ouvert, le choix retenu et pourquoi.
- Tables ou stockages créés, avec leur structure.
- Description de l'interface commune de session et liste des jeux multijoueurs adaptés.
- Captures sur mobile de la page Amis, du classement entre amis et du bouton Rejoindre.
- Liste de ce qui a été volontairement laissé de côté.

## 8. Implémentation et choix retenus (1er novembre 2026)

Référence pour toute évolution des amis : la garder à jour si un choix change. **Toutes les valeurs réglables sont dans `public/profil-reglages.js`**, bloc « Amis, présence, rejoindre » (commentées ligne par ligne). Le document `docs/consigne-refonte-visuelle.md` cité en section 0 n'existe pas dans le dépôt : la direction visuelle suivie est celle du design « Planètes » de `public/style.css` (plaques de verre, avatars à cadres, boutons et liserés existants ; or pour « en jeu », vert pour « en ligne »).

### 8.1 Points ouverts tranchés (section 6)

| Point ouvert | Choix retenu et pourquoi |
| --- | --- |
| Limites | 50 amis (`AMIS_MAX`), 20 demandes envoyées en attente (`AMIS_ATTENTE_MAX`), 50 reçues en attente au plus (`AMIS_RECUES_MAX`, au-delà réponse neutre), 10 essais de demande par heure et par profil, 30 par adresse (une école partage une adresse) — pseudo inconnu compris, pour qu'on ne puisse pas parcourir les pseudos. Demande possible à partir du niveau 2 et avec un pseudo choisi (celui qui reçoit doit savoir qui demande ; les profils créés par des robots restent au niveau 1). Demande sans réponse effacée au bout de 30 jours. Turnstile prévu mais coupé (`AMIS_TURNSTILE = false`) : ces limites suffisent tant qu'aucun abus n'est vu. |
| Présence | Signal toutes les 2 minutes de page visible (`PRESENCE_INTERVALLE_S` = 120), tout de suite à chaque changement (jeu ouvert ou fermé, partie en ligne rejointe ou quittée), jamais deux à moins de 10 s ; hors ligne après 5 minutes sans signal (`PRESENCE_HORS_LIGNE_S` = 300, 2,5 intervalles : un signal perdu ne fait pas clignoter). Aucun signal pour un joueur sans ami ni en mode invisible : la présence ne coûte rien à la grande majorité des joueurs. |
| Actualisation | 30 s tant que la page Amis ou le classement entre amis est visible, « Actualiser » au plus toutes les 10 s : bouton grisé avec compte à rebours, aucune requête pendant le délai ; le serveur de présence refuse aussi, par profil, une lecture à moins de 10 s de la précédente (la liste reste, la présence est relue après le délai). |
| Interface commune de session | Voir 8.3 : l'identifiant de session est le nom de la partie donné par le Worker ; le lanceur le met dans la présence et le rend au jeu par `&rejoindre=` puis `window.JEL_REJOINDRE` ; le jeu lit `JEL_MULTI.invitation()`. |
| Stockage de la présence | **Durable Object** « Presence » du Worker multijoueur existant (un seul objet). D1 est exclu (une écriture par signal) ; KV aussi (1 000 écritures par jour seulement sur l'offre gratuite, et lectures à cohérence lente). Un Durable Object garde tout en mémoire, répond en une requête pour toute la liste, et ne recopie son état dans son stockage qu'au plus toutes les 30 s (2 880 lignes par jour au plus, quel que soit le nombre de joueurs). Placé dans le Worker déjà déployé : aucun réglage de Cloudflare Pages à changer. |
| Notification d'une demande | Point doré sur la pastille + nombre dans le menu (« Amis · 2 demandes ») + une annonce (toast) une seule fois quand le nombre de demandes augmente, à l'ouverture de n'importe quelle page. Pas de notification hors du site. |
| Code de sauvegarde | Les amitiés sont attachées au numéro du profil dans D1 : elles suivent le profil restauré sur un autre appareil. L'ancien profil de cet appareil (s'il en avait un) garde les siennes jusqu'à son effacement (2 ans sans visite). |
| Classement entre amis | Un troisième choix « Parmi : Tous les joueurs / Mes amis » sur la page Classement, combinable avec les périmètres existants (général, étoiles, chaque jeu multijoueur) et les périodes. Même calcul (`requetePoints`), mais tout le groupe est montré, points nuls compris et sans niveau minimal (on connaît ses amis). Calculé à la demande, gardé 3 minutes dans le cache de Cloudflare (clé : groupe d'amis, périmètre, période) ; la présence est relue à part. |
| Mode invisible | Case « Me montrer hors ligne » dans la page de profil (bloc « Amis »), gardée dans D1 (`amis_reglages`) : vérifiée par le serveur à chaque lecture (la présence d'un ami invisible n'est jamais lue, il paraît hors ligne, sans que ses amis sachent qu'il est invisible) ; le navigateur n'envoie plus de signal et efface tout de suite le sien. |
| Blocage | Possible depuis une demande reçue, un ami ou une demande envoyée (on ne bloque que quelqu'un qu'on connaît : pas de parcours des profils). Le bloqué ne sait pas qu'il l'est : ses demandes reçoivent la même réponse neutre qu'une boîte pleine (« ne peut pas recevoir de demande pour le moment »). |

### 8.2 Tables et stockages

- **D1** (créées par `preparerTablesProfil`, `functions/_profil.js` ; structure commentée : `migrations/0003_amis.sql`) :
  - `amis (profil, autre, etat, cree_le, maj_le)`, clé `(profil, autre)`, une ligne par sens : `envoyee` / `recue` (demande), `ami` (deux lignes), `bloque` (une ligne, celle du bloqueur) ; index `amis_etat (etat, maj_le)`.
  - `amis_reglages (profil, invisible, maj_le)`.
  - Tables existantes réutilisées sans changement de structure : `profils_limites` (`quoi = 'ami'`, par adresse et par `profil:<n>`), `profils_evenements` (`ami-demande`, `ami-accepte`, `rejoindre`, `rejoindre-partie`), `fidelisation_jour` (champ `amis`).
- **Durable Object « Presence »** (`multijoueur/src/presence.js`, liaison `PRESENCE`, migration `v2` de `multijoueur/wrangler.toml`) : une carte en mémoire `profil → { l: dernier signal (ms), e: 'site' | 'jeu', j: jeu, p: partie }`, recopiée au plus toutes les 30 s dans une seule clé `presence` de son stockage ; entrées de plus de 5 minutes oubliées ; dernière lecture de chaque lecteur en mémoire seulement (limite des 10 s). Aucun historique.
- **Navigateur** : `fmg-presence` (ticket de présence signé, 12 h, et heure du dernier signal), `fmg-amis-vues` (demandes déjà annoncées) ; résumé `amis: { amis, recues, invisible }` dans la copie du profil `fmg-profil`.
- Adresses : `POST /api/amis` (site, `functions/api/amis.js`) ; `POST /presence` (navigateur → Worker, ticket signé `MULTI_SECRET`, requête simple sans pré-vol CORS) ; `POST /presence/lire` (site → Worker, `Authorization: Bearer MULTI_SECRET`) ; `GET /partie?jeu=&nom=` (lanceur → Worker : la partie d'un ami a-t-elle une place ?).

### 8.3 Interface commune de session et « Rejoindre »

1. Le Worker nomme chaque partie `<jeu>.<uuid>` (accueil). À l'arrivée d'un joueur, `partie.js` envoie au lanceur `{ t: 'fmg-partie', nom }` (jamais transmis au jeu) ; le lanceur (`public/multijoueur/lanceur.js`) le donne à `play.js`, qui l'ajoute à la présence (`{ etat: 'jeu', jeu, partie }`, signal immédiat ; retiré quand la connexion se ferme).
2. Chez l'ami, `public/amis.js` (`lienRejoindre`) fait le bouton : jeu `"multijoueur"` et `"rejoindre": true` avec une partie → `/play?id=<jeu>&lang=<l>&rejoindre=<nom>` (« Tu arriveras dans la même partie ») ; jeu multijoueur pas encore adapté → le jeu seul (« ne sait pas encore t'emmener dans sa partie ») ; jeu solo → le jeu seul (« Léa y joue en ce moment », sans promesse).
3. Le lanceur vérifie la partie (`GET /partie`). Ouverte → il pose `window.JEL_REJOINDRE = { partie }` au début du jeu ; pleine, terminée, serveur absent ou plein → message clair, « Ouvrir le jeu quand même » ou « Retour à mes amis ».
4. Le jeu, à la fin de son initialisation : `if (window.JEL_MULTI && window.JEL_MULTI.invitation()) lancerEnLigne();`. Le moteur (`jel-multi` v3) ajoute la partie à sa demande de connexion (une seule fois) ; le Worker la donne si elle a encore une place (`prefere` de l'accueil), sinon une autre partie du jeu, et le lanceur prévient le joueur.
5. Turnstile à l'entrée d'une partie : inchangé (ticket du profil demandé à chaque connexion).

**Pseudos** : le ticket d'entrée signé par le site contient maintenant le pseudo (et le nombre du pseudo par défaut). `partie.js` envoie à chaque changement `{ t: 'noms', noms }` ; le lanceur traduit « Joueur 4821 » ; le moteur expose `partie.sieges()[s].nom`. Un ancien moteur ignore ces messages : `PROTOCOLE` reste 2.

**Jeux adaptés** (1er novembre 2026) — pseudos des autres joueurs et « Rejoindre » (même partie) : les 13 jeux multijoueurs. Ordre : `enclos-de-la-ferme` et `parking-des-voitures-cachees` d'abord (validation du mécanisme), puis les 11 autres le même jour, après la mise en ligne : `concours-des-pizzaiolos`, `la-course-des-bebes-dinos`, `la-course-du-puits-noir`, `la-fuite-du-bois-pendu`, `la-veillee-des-portraits-maudits`, `le-casse-de-la-tour-opaline`, `le-choeur-de-la-crypte`, `le-radeau-des-rations`, `les-derniers-jours-du-cratere`, `marche-aux-devinettes`, `station-hades-oxygene-compte` (`"rejoindre": true`, appel à `JEL_MULTI.invitation()` à la fin de l'initialisation). Un jeu multijoueur sans `"rejoindre"` ouvre simplement le jeu, et la page Amis le dit. Nouveaux jeux : `"rejoindre": true` obligatoire depuis `REJOINDRE_DEPUIS` (`validate-games.mjs`), consignes de la boucle de nuit, relecture et compétence `ajouter-jeu-site` mises à jour.

### 8.4 Requêtes et quotas (offre gratuite)

Hypothèses : un « joueur actif » a au moins un ami (les autres n'envoient aucun signal) ; une heure de jeu visible ; 3 minutes par heure sur la page Amis ou le classement entre amis.

| Par joueur actif et par heure | Requêtes Workers (site + Worker) | Requêtes Durable Objects | Écritures D1 |
| --- | --- | --- | --- |
| Signaux de présence (30 + ~4 changements) | ~34 | ~34 | 0 |
| Page Amis ou classement entre amis (6 actualisations : site puis Worker) | ~12 | ~6 | 0 |
| Ticket de présence (une fois toutes les 12 h) | < 0,1 | 0 | 0 |
| Demandes, acceptations, blocages (quelques-unes par semaine) | ~0,1 | 0 | ~0,3 (2 à 3 lignes par action) |
| **Total amis** | **≈ 46** | **≈ 40** | **≈ 0** |
| Pour comparer : profil existant (envoi toutes les 5 min, parties) | ≈ 15 | — | ≈ 40 lignes |

- Stockage du Durable Object : 120 lignes écrites par heure au plus, pour tout le site (une toutes les 30 s), soit 2 880 par jour : sans rapport avec le nombre de joueurs.
- **Seuil de l'offre gratuite** : 100 000 requêtes Workers par jour (fonctions du site et Worker ensemble), 100 000 requêtes Durable Objects par jour (partagées avec les parties en ligne). Avec ≈ 61 requêtes Workers par heure de jeu d'un joueur qui a des amis (46 + 15), on tient environ **1 600 heures de jeu par jour** de ces joueurs : **≈ 70 joueurs simultanés en continu**, ou **≈ 250 au moment de pointe** si l'essentiel du trafic tient en 6 heures. Les joueurs sans ami ne coûtent que les ≈ 15 requêtes par heure du profil : environ 6 600 heures de jeu par jour.
- **Passage à l'offre payante Workers** (5 $ par mois, 10 millions de requêtes par mois puis 0,30 $ par million ; Durable Objects compris) : nécessaire quand le tableau de bord Cloudflare montre régulièrement plus de **70 000 requêtes Workers par jour** (marge de 30 % pour les pointes) ou plus de 70 000 requêtes Durable Objects par jour, soit ordre de grandeur **1 000 heures de jeu par jour de joueurs ayant des amis**. Premiers réglages possibles avant de payer : `PRESENCE_INTERVALLE_S` à 300 (≈ 2,5 fois moins de signaux), `AMIS_ACTUALISER_S` à 60. Décision du propriétaire.
- **Mode dégradé** : serveur de présence en panne ou quota atteint → la liste d'amis et le classement restent, avec « Impossible de savoir qui est en ligne pour le moment » et des statuts « Présence indisponible » ; le navigateur cesse d'envoyer des signaux pendant 15 minutes (`PRESENCE_PAUSE_ERREUR_MIN`). Base indisponible (503) → message « Tes amis sont indisponibles » et plus d'actualisation automatique ; rien d'autre du site n'en dépend. `PRESENCE_ACTIVE = false` coupe toute la présence d'un coup. Limite connue : si le quota des fonctions du site est atteint, c'est tout `/api/` qui échoue (votes, profil compris), comme avant.

### 8.5 Laissé de côté (volontairement)

- Turnstile à l'envoi d'une demande (prêt, coupé : `AMIS_TURNSTILE`).
- Notification hors du site (aucune notification du téléphone, aucun e-mail) ; pas de message entre amis, pas d'invitation envoyée à un ami (on le rejoint, il ne nous appelle pas).
- Signal « hors ligne » à la fermeture de la page (un ami paraît encore en ligne jusqu'à 5 minutes) : il coûterait une requête par page quittée.
- Liaison directe du site au Durable Object (« service binding » de Cloudflare Pages, réglage du propriétaire) : elle économiserait une requête Workers par lecture de la présence.
- Rangs bronze, argent, or entre amis (les médailles du classement existant s'appliquent aussi au groupe).

### 8.6 Tests

`node scripts/tester-amis.mjs` (amitiés, limites, présence, invisible, délais, 10 s par profil, écritures regroupées, mode dégradé, classement entre amis, indicateurs, effacements ; dans `validate.yml`) ; `node scripts/tester-multijoueur.mjs` (Worker : nom de la partie, pseudos, partie d'un ami rejointe ou pleine, `/partie` ; moteur : `noms`, `invitation()` ; `--navigateur` : pseudos reçus par chaque jeu, « Rejoindre » ouvert tout seul dans le salon, partie pleine → message) ; `node scripts/tester-profil.mjs` inchangé et vert.
