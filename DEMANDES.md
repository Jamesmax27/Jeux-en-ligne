# Demandes de modification d'un jeu

Pour faire corriger ou changer un jeu déjà publié, sans ordinateur : l'IA s'en occupe aussitôt, le vérifie comme la boucle de nuit et le met en ligne si tout est bon.

## Envoyer une demande

1. Ouvrez la page privée **`/idees`** du site (même connexion Cloudflare Access que pour les idées), onglet **« Modifier un jeu »** (lien direct : `/idees/#demande`).
2. Choisissez le jeu dans la liste (le catalogue publié) et décrivez la demande en quelques phrases : ce qui ne va pas ou ce qu'il faut changer, où, et ce que vous voulez à la place. Pas de type à choisir : l'IA classe la demande.
3. Envoyez. Le numéro de la demande s'affiche : c'est une issue GitHub « [Demande] <nom du jeu> », avec l'étiquette `demande-ia`.

## Ce qui se passe ensuite (`.github/workflows/demande-modification.yml`)

1. **Lecture** : identifiant du jeu et texte de la demande. Un 👀 sur l'issue signale qu'elle est prise en charge.
2. **Classement** par Claude : une étiquette parmi `bug`, `amelioration` et `modification`. Demande hors sujet, incompréhensible ou contraire aux règles du site : étiquette `a-clarifier`, un commentaire explique quoi préciser, et rien n'est modifié.
3. **Branche** `demande/<n° de l'issue>-<id du jeu>`.
4. **Traitement** : Claude modifie uniquement le dossier `games/<id>/` (garde-fou : tout autre fichier fait échouer la demande). Si le jeu change, sa jaquette automatique est refaite et sa `version` augmente ; ses textes de la page du jeu sont mis à jour dans les 5 langues si besoin.
5. **Vérification**, comme la boucle de nuit : robot (chargement, téléphone, toucher, hors ligne, fiche), traductions, catalogue, genres et univers, référencement, puis relecture par Claude (la demande est appliquée et rien n'est cassé).
6. **Pull request** « [Demande] … » liée à l'issue (`Closes #<n>`), avec le résumé des changements.
7. **Tout est bon** : fusion automatique, l'issue se ferme et Cloudflare Pages met le jeu en ligne quelques minutes plus tard.
8. **Sinon** : pas de fusion. Un commentaire sur l'issue donne la raison et l'étiquette `echec-ia` est ajoutée. La pull request reste ouverte : un commentaire « @claude … » la fait corriger (`corriger-jeu.yml`), puis vous fusionnez à la main ; ou fermez-la.

## Bon à savoir

- **File d'attente par jeu** : deux demandes sur le même jeu passent l'une après l'autre ; des jeux différents sont traités en même temps. GitHub ne garde qu'une demande en attente par jeu : si une troisième arrive pendant ce temps, celle qui attendait est arrêtée, avec un commentaire (`echec-ia`).
- **Relancer une demande** restée ouverte (`a-clarifier`, `echec-ia`) : corrigez si besoin le texte de l'issue, puis retirez et remettez l'étiquette `demande-ia`.
- **Fusion automatique** : la même variable que la boucle de nuit la coupe (`FUSION_AUTO` = `non`) ; les demandes réussies reçoivent alors l'étiquette `valide` et attendent un « Merge » à la main.
- **Qui peut** : seules les issues du propriétaire et des collaborateurs du dépôt sont traitées. Une issue ouverte à la main sur GitHub fonctionne aussi, avec l'étiquette `demande-ia` et les rubriques `### Jeu` (identifiant du jeu), `### Demande` et `### Auteur`, dans cet ordre.
- **Réglages** : aucun nouveau. Le formulaire passe par `functions/api/idees.js` (secrets Cloudflare `GITHUB_TOKEN`, `GITHUB_REPO`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` déjà utilisés par les idées) ; le workflow utilise le secret GitHub `CLAUDE_CODE_OAUTH_TOKEN` de la boucle de nuit. Les étiquettes sont créées par le workflow si elles manquent.
- **Consommation** : chaque demande fait travailler Claude trois fois (classement, modification, relecture) sur l'abonnement, et chaque fusion déclenche une publication Cloudflare.
- **Ce qui ne passe pas par ici** : un changement du site lui-même (catalogue, pages, styles) ou de plusieurs jeux à la fois. Ces demandes sont classées `a-clarifier`.
