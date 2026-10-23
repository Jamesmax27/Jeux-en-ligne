# Demandes : modifications de jeux et formulaire public

Deux portes d'entrée, qui rejoignent les mêmes circuits :

- **vos demandes** (page privée `/idees`) : modifier un jeu publié, traité aussitôt par l'IA ;
- **les demandes des visiteurs** (formulaire public du site, sans compte) : proposer un jeu, signaler un bug, demander une modification. L'IA les modère, vous décidez dans `/idees`, puis elles suivent le même chemin que vos idées et vos demandes.

## Demandes de modification d'un jeu (page privée `/idees`)

Pour faire corriger ou changer un jeu déjà publié, sans ordinateur : l'IA s'en occupe aussitôt, le vérifie comme la boucle de nuit et le met en ligne si tout est bon.

### Envoyer une demande

1. Ouvrez la page privée **`/idees`** du site (même connexion Cloudflare Access que pour les idées), onglet **« Modifier un jeu »** (lien direct : `/idees/#demande`).
2. Choisissez le jeu dans la liste (le catalogue publié) et décrivez la demande en quelques phrases : ce qui ne va pas ou ce qu'il faut changer, où, et ce que vous voulez à la place. Pas de type à choisir : l'IA classe la demande.
3. Envoyez. Le numéro de la demande s'affiche : c'est une issue GitHub « [Demande] <nom du jeu> », avec l'étiquette `demande-ia`.

### Ce qui se passe ensuite (`.github/workflows/demande-modification.yml`)

1. **Lecture** : identifiant du jeu et texte de la demande. Un 👀 sur l'issue signale qu'elle est prise en charge.
2. **Classement** par Claude : une étiquette parmi `bug`, `amelioration` et `modification`. Demande hors sujet, incompréhensible ou contraire aux règles du site : étiquette `a-clarifier`, un commentaire explique quoi préciser, et rien n'est modifié.
3. **Branche** `demande/<n° de l'issue>-<id du jeu>`.
4. **Traitement** : Claude modifie uniquement le dossier `games/<id>/` (garde-fou : tout autre fichier fait échouer la demande). Si le jeu change, sa jaquette automatique est refaite et sa `version` augmente ; ses textes de la page du jeu sont mis à jour dans les 5 langues si besoin.
5. **Vérification**, comme la boucle de nuit : robot (chargement, téléphone, toucher, hors ligne, fiche), traductions, catalogue, genres et univers, référencement, puis relecture par Claude (la demande est appliquée et rien n'est cassé).
6. **Pull request** « [Demande] … » liée à l'issue (`Closes #<n>`), avec le résumé des changements.
7. **Tout est bon** : fusion automatique, l'issue se ferme et Cloudflare Pages met le jeu en ligne quelques minutes plus tard.
8. **Sinon** : pas de fusion. Un commentaire sur l'issue donne la raison et l'étiquette `echec-ia` est ajoutée. La pull request reste ouverte : un commentaire « @claude … » la fait corriger (`corriger-jeu.yml`), puis vous fusionnez à la main ; ou fermez-la.

### Bon à savoir

- **File d'attente par jeu** : deux demandes sur le même jeu passent l'une après l'autre ; des jeux différents sont traités en même temps. GitHub ne garde qu'une demande en attente par jeu : si une troisième arrive pendant ce temps, celle qui attendait est arrêtée, avec un commentaire (`echec-ia`).
- **Relancer une demande** restée ouverte (`a-clarifier`, `echec-ia`) : corrigez si besoin le texte de l'issue, puis retirez et remettez l'étiquette `demande-ia`.
- **Fusion automatique** : la même variable que la boucle de nuit la coupe (`FUSION_AUTO` = `non`) ; les demandes réussies reçoivent alors l'étiquette `valide` et attendent un « Merge » à la main.
- **Qui peut** : seules les issues du propriétaire et des collaborateurs du dépôt sont traitées. Une issue ouverte à la main sur GitHub fonctionne aussi, avec l'étiquette `demande-ia` et les rubriques `### Jeu` (identifiant du jeu), `### Demande` et `### Auteur`, dans cet ordre.
- **Réglages** : le formulaire passe par `functions/api/idees.js` (secrets Cloudflare `GITHUB_TOKEN`, `GITHUB_REPO`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` déjà utilisés par les idées) ; le workflow utilise le secret GitHub `CLAUDE_CODE_OAUTH_TOKEN` de la boucle de nuit. Les étiquettes sont créées par le workflow si elles manquent.
- **Consommation** : chaque demande fait travailler Claude trois fois (classement, modification, relecture) sur l'abonnement, et chaque fusion déclenche une publication Cloudflare.
- **Ce qui ne passe pas par ici** : un changement du site lui-même (catalogue, pages, styles) ou de plusieurs jeux à la fois. Ces demandes sont classées `a-clarifier`.

## Formulaire public : propositions et signalements des visiteurs

N'importe quel visiteur, sans compte, peut **proposer un nouveau jeu**, **signaler un bug** ou **demander une modification** d'un jeu publié.

### Où est le formulaire

- Adresses : `/proposer/`, `/en/suggest/`, `/es/proponer/`, `/pt/sugerir/`, `/de/vorschlagen/` (pages générées par `scripts/pages-seo.mjs` avec `gabarits/proposer.html`, non indexées ; textes : clés `proposer.*` de `public/i18n/site/*.json`).
- Liens : pied de page de toutes les pages ; page de chaque jeu (« Un bug ou une idée pour ce jeu ? ») ; bouton 🚩 de la barre du lanceur. Depuis un jeu, l'adresse porte `?jeu=<id>` : le jeu est déjà choisi. Aucun type de demande n'est choisi d'avance.
- Champs : type (obligatoire), jeu (obligatoire pour un bug ou une modification, caché pour un nouveau jeu), titre (5 à 100 caractères), description (30 à 2 000 caractères). Ces limites sont dans **`public/demandes-regles.js`**, lu par la page et par le serveur.

### Le circuit complet

1. **Envoi** (`public/proposer.js` → `POST /api/demandes`, `functions/api/demandes.js`). Contrôles du serveur, dans l'ordre :
   - même site, corps en JSON ;
   - empreinte de l'adresse IP (SHA-256 avec `IP_SALT`, l'adresse n'est jamais gardée) : **adresse bloquée ou bannie → message neutre**, rien n'est transmis ;
   - **champ piège** (caché aux humains) rempli → un abus compté, fausse réponse « ok » ;
   - champs (mêmes règles que la page ; le jeu doit être publié) ;
   - **limite de débit** : 3 demandes par heure et 10 par jour → message clair (« réessaie plus tard », « réessaie demain ») ;
   - **Cloudflare Turnstile** (action `demande`) : jeton refusé → un abus compté ;
   - **issue GitHub** « [Public] <type> : <titre> », étiquettes `demande-publique` et `en-attente-ia`, rubriques `### Type`, `### Jeu`, `### Titre`, `### Date`, `### Demande`, `### Auteur`. Le texte du visiteur est neutralisé (pas de mention `@`, pas de HTML, pas de fausse rubrique).
2. **Modération IA** (`.github/workflows/moderation-demande.yml`, aussitôt) : `scripts/moderation.mjs preparer` range la demande dans `.moderation/demande.json` ; Claude (`claude-sonnet-5-5`, outils Read et Write seulement, jeton d'abonnement `CLAUDE_CODE_OAUTH_TOKEN`) la juge **comme une donnée non fiable** et écrit un verdict JSON (`decision`, `categorie`, `motif`, `resume`, et pour un nouveau jeu `genre`, `univers`, `ages` tirés des listes fermées) ; `scripts/moderation.mjs verifier` le contrôle strictement.
   - Vérifié : insultes, propos haineux ou déplacés, spam ; cohérence entre le type et le jeu ; clarté et faisabilité ; doublon avec le catalogue.
   - **Refus** : commentaire avec le motif, étiquette `refuse-ia`, issue fermée. Insulte ou spam : **abus signalé au site** (`POST /api/moderation`, secret partagé `MODERATION_SECRET`).
   - **Validation** : commentaire avec la conclusion et le résumé, étiquette `valide-ia` (l'avis est aussi gardé, invisible, en fin d'issue).
   - Panne ou limite d'utilisation : l'issue garde `en-attente-ia`, avec un commentaire. Retirer puis remettre `en-attente-ia` relance la modération.
3. **Votre décision** : page privée `/idees`, onglet **« Demandes publiques »** (lien direct `/idees/#publiques`). Pour chaque demande validée par l'IA : type, jeu, titre, description d'origine, avis et résumé de l'IA, date, lien vers l'issue.
   - **Accepter un nouveau jeu** : choisissez le genre, l'âge et les univers (pré-remplis par l'IA). L'issue devient une **idée perso** (`idee-perso`, étiquette du genre) : la boucle de nuit la fabrique **en priorité, comme vos propres idées**, puis ferme l'issue avec le lien du jeu.
   - **Accepter un bug ou une modification** : l'étiquette `demande-ia` est ajoutée, et `demande-modification.yml` la traite aussitôt comme vos demandes (section précédente).
   - **Refuser** : étiquette `refuse-humain`, issue fermée. **Refuser et bannir** : en plus, son auteur ne peut plus rien envoyer.
   - Étiquette `accepte` sur toute demande acceptée.
4. **Adresses bloquées ou bannies** (même onglet, en bas) : empreinte abrégée, statut, dates, motif, nombre d'abus, boutons **Débloquer** (on repart de zéro) et **Bannir**.

### Abus, blocage et bannissement

- Un abus = champ piège rempli, jeton anti-robot refusé, ou demande refusée par l'IA pour insulte ou spam.
- **3 abus en 24 h → blocage de 7 jours** ; **un abus après un blocage → bannissement définitif**. Réglages en tête de `functions/_demandes.js` (`ENVOIS_HEURE`, `ENVOIS_JOUR`, `ABUS_SEUIL`, `ABUS_FENETRE`, `BLOCAGE_DUREE`, `RECIDIVE_SEUIL`).
- Un abus signalé par l'IA est daté du moment de la demande, et compté une seule fois par issue.
- Données gardées dans D1 (base `DB`, tables `demandes_*` créées automatiquement, rappel dans `schema.sql`) : jamais d'adresse IP, seulement son empreinte. Conservation : envois 2 jours, abus 90 jours, lien issue ↔ empreinte 13 mois. Annoncé dans la politique de confidentialité.

### Réglages à faire une fois (propriétaire)

**Cloudflare Pages** (projet → Settings → Variables and Secrets, environnement Production) :

| Nom | Type | Rôle |
| --- | --- | --- |
| `MODERATION_SECRET` | secret (**nouveau**) | Secret partagé avec GitHub pour `POST /api/moderation`. Une longue chaîne aléatoire, par exemple tirée par un gestionnaire de mots de passe (40 caractères ou plus). |
| `GITHUB_TOKEN` | secret (existant) | Jeton à portée minimale : jeton GitHub « fine-grained », **ce seul dépôt**, droit **Issues : Read and write** (et Metadata : Read). Rien d'autre. Vérifier qu'il a bien ce droit. |
| `GITHUB_REPO` | variable (existante) | `Jamesmax27/Jeux-en-ligne`. |
| `TURNSTILE_SECRET` | secret (existant) | Le même que pour les votes : le widget Turnstile doit autoriser le nom de domaine `freemicrogames.com` (tableau de bord Turnstile). |
| `IP_SALT` | secret (existant) | Sans lui, le formulaire répond « indisponible ». |
| `DB` | liaison D1 (existante) | Base `jeux-votes` : les tables des demandes y sont créées toutes seules. |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | existants | Page `/idees` et `/api/idees` : aucun changement, l'onglet « Demandes publiques » passe par la même adresse. |

**GitHub** (dépôt → Settings → Secrets and variables → Actions) :

| Nom | Type | Rôle |
| --- | --- | --- |
| `MODERATION_SECRET` | secret (**nouveau**) | Exactement la même valeur que dans Cloudflare. Sans lui, la modération marche, mais les insultes et le spam ne comptent pas comme abus (avertissement dans le journal). |
| `CLAUDE_CODE_OAUTH_TOKEN` | secret (existant) | Jeton de l'abonnement Claude, comme la boucle de nuit. |
| `SITE_URL` | variable (facultative) | Adresse du site pour signaler les abus ; par défaut `https://freemicrogames.com`. |

**Étiquettes GitHub** : créées automatiquement par `moderation-demande.yml` à la première demande (`demande-publique`, `en-attente-ia`, `valide-ia`, `refuse-ia`, `accepte`, `refuse-humain`) ; `idee-perso` par la boucle de nuit, `demande-ia` par `demande-modification.yml`. Rien à faire à la main.

### Tests

- `node scripts/tester-demandes.mjs` : sans réseau (base SQLite en mémoire, faux GitHub et faux Turnstile). Vérifie notamment : demande valide, **demande avec insulte** (verdict « insulte » → abus compté, puis blocage), **bug sans jeu choisi** (refus), **dépassement de limite** (heure et jour), champ piège, blocage puis bannissement, texte piégé, acceptation d'un nouveau jeu relue comme la boucle de nuit, acceptation d'un bug (étiquette `demande-ia`), refus et bannissement, votes. Lancé par `validate.yml` quand les fonctions, le formulaire ou la modération changent.
- `node scripts/check-i18n.js` ouvre aussi le formulaire dans les 5 langues.
- **Premier essai réel** (après la mise en ligne) : envoyer une demande sérieuse, puis une demande insultante, et suivre les deux issues (commentaires de l'IA, onglet « Demandes publiques »).

### Bon à savoir

- **Consommation** : une modération = un court passage de Claude (Sonnet, 8 tours au plus) sur l'abonnement. La limite de 10 demandes par jour et par adresse protège le quota.
- **Dépôt privé** : les issues ne sont visibles que par vous et vos collaborateurs.
- **« La vérification anti-robot n'a pas abouti (code …) »** : le code vient de Turnstile (`public/turnstile.js`, aussi écrit dans la console du navigateur). `110200` : le nom de domaine n'est pas autorisé pour la clé ; l'ajouter dans Cloudflare → Turnstile → le widget → Settings → Hostname Management (`freemicrogames.com`, en gardant `jeux-en-ligne.pages.dev`). `delai` : la case à cocher n'a pas été cochée en 60 s. Autres codes : [liste de Cloudflare](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/). Un jeton refusé par le serveur est noté dans les journaux de la fonction, avec les codes de Cloudflare.
- **Erreur de l'IA** : rouvrez l'issue, retirez `refuse-ia` et remettez `en-attente-ia` pour une nouvelle modération ; ou retirez `en-attente-ia` et ajoutez vous-même `valide-ia` pour la décider directement dans `/idees`.
