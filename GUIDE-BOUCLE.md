# Boucle de nuit — création automatique de jeux

## Comment ça marche

Deux fois par nuit (vers 1 h et 6 h du matin à Paris en hiver, 2 h et 7 h en été), GitHub lance la **boucle de nuit**, sans votre ordinateur. Chaque passage suit 5 étapes :

1. **Idées** : s'il reste moins de 15 idées en attente dans `idees.json`, un agent Claude en propose de nouvelles. Il lit un résumé du catalogue (titre, genres et univers de chaque jeu, âges déjà couverts) et vise les genres, les univers et surtout les combinaisons genre × univers qui ont peu de jeux. Il choisit uniquement dans les listes fermées de `public/taxonomie.js` : une idée avec un genre ou un univers inventé est refusée. Il donne aussi l'âge conseillé (champ `ages`, « 6+ »). Ces idées ont la source `agent`.
2. **Choix** : 5 idées passent « en cours » : d'abord celles de votre page privée `/idees` (la plus ancienne en tête ; y compris les propositions des visiteurs que vous y avez acceptées), puis vos autres idées (source `humain`), dans l'ordre de la liste, puis celles de l'agent. Vos idées restent toujours prioritaires.
3. **Fabrication** : 5 agents créent les 5 jeux en même temps. Chacun écrit un cahier de conception, code le jeu, y joue avec le robot (captures d'écran), se relit, puis écrit les **textes de la page du jeu** d'après le jeu fini (titre et description pour Google, « À propos du jeu », « Comment jouer », compétences, texte de la jaquette), les traduit avec le reste du jeu, les contrôle (`scripts/regles-seo.mjs`, puis `scripts/verifier-seo.mjs`) et ouvre une **pull request**. La fiche du jeu reprend le genre, les univers et l'âge de l'idée. La description de la pull request indique si le référencement est conforme ; s'il ne l'est pas, elle est ouverte quand même et c'est la vérification qui refusera le jeu. Rien n'est encore en ligne.
4. **Vérification** : pour chaque pull request, le robot rejoue le jeu (chargement, erreurs, téléphone, toucher, hors ligne, fiche du catalogue, genres et univers dans les listes, traductions, référencement de la page du jeu), puis Claude le relit avec la grille de `CONSIGNES-JEU.md` (section 7), dont le point « Page du jeu » : textes fidèles au jeu, sans promesse fausse ni texte passe-partout. Le résultat arrive en commentaire.
   - **Tout est bon** : la pull request est fusionnée. Le jeu est en ligne quelques minutes plus tard, avec sa page dans les 5 langues.
   - **Sinon** : la pull request est fermée et l'idée revient en attente ; un nouveau jeu sera tenté à un prochain passage. Au 3e jeu refusé pour la même idée, celle-ci est mise de côté.
5. **Mise à jour** : les idées des jeux publiés passent dans `idees-archive.json` (statut `faite`, avec le nom du jeu).

Un passage dure en général 1 h 30 à 4 h. Si le premier n'est pas fini à l'heure du second, le second attend.

**Le référencement en bref** : chaque jeu a sa page (`/jeux/<id>/`, `/en/games/<id>/`…), générée à chaque publication à partir de sa fiche `game.json`. Ses textes ont des longueurs à respecter dans les 5 langues (détail dans `CONSIGNES-JEU.md`, section 4). Un jeu ajouté depuis le 24 octobre 2026 dont les textes ne sont pas conformes n'est pas publié : c'est pourquoi la vérification le refuse avant.

---

## La file d'idées

Deux fichiers à la racine du dépôt :

| Fichier | Contenu |
| --- | --- |
| `idees.json` | les idées à fabriquer : `"en_attente"` ou `"en_cours"` (en fabrication) |
| `idees-archive.json` | les idées réalisées : `"faite"`, avec `"jeu_id"` (le dossier du jeu) |

Une idée ressemble à ceci :

```json
{
  "id": "coloriage-magique",
  "titre": "Coloriage magique",
  "description": "Colorie un dessin case par case en suivant les numéros. Âge conseillé : 4+.",
  "genre": "coloriage",
  "genres_secondaires": ["calcul"],
  "univers": ["abstrait"],
  "ages": "4+",
  "source": "humain",
  "date_ajout": "2026-10-19",
  "statut": "en_attente",
  "jeu_id": null
}
```

- `id` : minuscules sans accents, chiffres et tirets, unique.
- **Genres et univers : uniquement ceux des listes fermées** de `public/taxonomie.js` (26 genres, 24 univers ; détail dans `CONSIGNES-JEU.md`, section 4). On écrit l'**identifiant** (`coloriage`, `abstrait`…), jamais un mot inventé : sinon la boucle s'arrête avec un message d'erreur. « `autre` » seulement si rien ne correspond.
- `genre` : le genre principal, un seul.
- `genres_secondaires` (facultatif) : 0 à 2 autres genres. Absent : l'agent créateur en ajoute s'il le juge utile.
- `univers` : 0 à 2 univers. Liste vide `[]` : l'agent les choisit.
- `ages` : l'âge conseillé, sous la forme `"6+"`. Le jeu reprendra exactement cet âge (la vérification refuse un jeu qui en a un autre). Sans ce champ, il est lu à la fin de la description (« Âge conseillé : 6+. »), comme pour les idées plus anciennes ; sans l'un ni l'autre, l'agent créateur le choisit.
- Rien à écrire pour Google : le titre et la description pour les moteurs de recherche, le texte de la page du jeu, les compétences et le texte de la jaquette sont rédigés par l'agent créateur d'après le jeu fini.
- `"essais"` (s'il apparaît) : nombre de jeux refusés pour cette idée. À 3, elle n'est plus choisie.
- `"issue"` (s'il apparaît) : numéro de la demande GitHub d'où vient l'idée (page privée `/idees`).

**Modifier la file à la main** : ouvrez `idees.json`, ajoutez, supprimez ou déplacez des idées (l'ordre de la liste est l'ordre de fabrication), puis « Commit to main » et « Push origin » dans GitHub Desktop. Ne touchez pas aux idées `"en_cours"` pendant qu'une boucle tourne. Pour vérifier le fichier sur votre PC : `npm run idees` (et `npm run taxonomie` pour les genres et univers).

**Changer la liste des genres ou des univers** (décision du propriétaire seulement) : modifier `public/taxonomie.js`, les libellés dans les 5 fichiers `public/i18n/site/*.json` (`genre.<id>` et `genre.<id>.court`, idem `univers.`) et les listes du formulaire `.github/ISSUE_TEMPLATE/idee-jeu.yml`, puis `npm run taxonomie` doit afficher « tout est bon ».

---

## Mise en place

Les réglages de l'ancienne boucle restent valables (jeton Claude, application Claude, permissions). Pour une installation neuve :

### 1. Installer l'application Claude sur GitHub

1. Ouvrez https://github.com/apps/claude et cliquez sur **Install**.
2. Choisissez **Only select repositories**, puis cochez uniquement `Jeux-en-ligne`.
3. Validez.

### 2. Créer le jeton de votre abonnement Claude

Ce jeton permet à GitHub d'utiliser votre abonnement Claude. Il est valable un an.

1. Ouvrez **PowerShell** (menu Démarrer → tapez « PowerShell »).
2. Installez Claude Code :

   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```

3. Fermez et rouvrez PowerShell, puis tapez :

   ```powershell
   claude setup-token
   ```

4. Une page s'ouvre dans le navigateur : acceptez. Le jeton s'affiche dans PowerShell.
5. **Copiez-le** (il n'est enregistré nulle part) et ne le partagez avec personne.

### 3. Donner le jeton à GitHub

1. Sur github.com, ouvrez votre dépôt → **Settings** → **Secrets and variables** → **Actions**.
2. Cliquez sur **New repository secret**.
3. Nom : `CLAUDE_CODE_OAUTH_TOKEN`. Valeur : le jeton copié. Cliquez sur **Add secret**.

### 4. Autoriser GitHub à ouvrir des pull requests

1. Toujours dans **Settings** → **Actions** → **General**, descendez jusqu'à **Workflow permissions**.
2. Choisissez **Read and write permissions**.
3. Cochez **Allow GitHub Actions to create and approve pull requests**.
4. Cliquez sur **Save**.

### 5. Premier essai, sans attendre la nuit

1. Onglet **Actions** du dépôt → **Créer des jeux (boucle de nuit)** dans la liste de gauche.
2. Cliquez sur **Run workflow**, choisissez **1** jeu pour ce premier essai, puis le bouton vert **Run workflow**.
3. Attendez la fin (1 à 2 heures) : une coche verte apparaît.
4. Onglet **Pull requests** → filtre « Closed » : « Nouveau jeu : … » est fusionnée (pastille violette) ou fermée, avec un commentaire qui explique pourquoi.

---

## Au quotidien : suivre les jeux (2 minutes)

- **Ce qui s'est passé cette nuit** : onglet **Actions** → **Créer des jeux (boucle de nuit)** → le dernier passage. Le résumé en bas de page liste chaque pull request : fusionnée, refusée, ou en attente. Pour une pull request refusée, il donne directement la raison : les 3 premiers problèmes (plus le premier problème de référencement s'il n'en fait pas partie), puis « (+ N autre(s)) ». Un avertissement signale aussi, dès la fabrication, un jeu dont les textes de référencement ne sont pas conformes.
- **Jeux fusionnés** (onglet Pull requests, filtre « Closed », pastille violette) : ils sont en ligne. Le commentaire donne la grille point par point et quelques conseils.
- **Jeux refusés** (pull request fermée, pastille rouge) : le commentaire liste tous les problèmes ; ceux du référencement commencent par « Référencement : ». L'idée est déjà remise en attente.
- **« ⚠️ Vérification interrompue »** (limite d'utilisation de l'abonnement, panne…) : rien n'est décidé, la pull request reste ouverte et sera vérifiée au passage suivant. Pour ne pas attendre : **Actions** → **Créer des jeux (boucle de nuit)** → **Run workflow** avec **0** jeu.

## Fusion automatique : la couper ou la remettre

Elle est **active** par défaut. Pour revenir à une fusion manuelle :

1. Sur github.com, dépôt → **Settings** → **Secrets and variables** → **Actions** → onglet **Variables**.
2. **New repository variable** : nom `FUSION_AUTO`, valeur `non`, puis **Add variable**.

Les jeux validés reçoivent alors l'étiquette `valide` et restent ouverts : à vous de cliquer « Merge ». Leur idée est archivée au passage suivant. Les jeux refusés sont toujours fermés. Pour remettre la fusion automatique : supprimez la variable.

Si une règle de protection de `main` exige une relecture humaine, la boucle ne peut pas fusionner : les jeux validés reçoivent l'étiquette `valide` et un commentaire vous demande de cliquer « Merge ».

## Proposer une idée depuis mon téléphone

Un formulaire GitHub ajoute l'idée à `idees.json` tout seul, sans ordinateur.

**Une seule fois :** sur github.com, ouvrez le dépôt → **Issues** → **Labels** → **New label**.
Nom : `idee-jeu`, puis **Create label**. Sans cette étiquette, le formulaire ne déclenche rien.

**À chaque idée :**

1. Sur le téléphone (application GitHub ou navigateur) : dépôt → **Issues** → **New issue** → **Nouvelle idée de jeu**.
2. Le titre de la demande devient le titre du jeu. Remplissez le principe, le genre, l'âge et, si vous voulez, 1 ou 2 univers (listes déroulantes : rien d'autre n'est possible ; 3 univers cochés = idée refusée avec un message). Le champ « Compétences travaillées » est facultatif : quelques mots, ajoutés à la description comme simple indication.
3. Cochez « Le fabriquer cette nuit en priorité » pour la placer en tête de la file ; sinon, elle s'ajoute à la fin des idées humaines (toujours avant celles de l'agent).
4. Envoyez. Moins d'une minute plus tard, un commentaire confirme l'ajout et la demande se ferme.

Bon à savoir :

- Rien à écrire pour Google : les textes de la page du jeu (titre et description pour les moteurs de recherche, présentation, règles, compétences, texte de la jaquette) sont rédigés d'après le jeu fini.
- L'âge choisi est rangé dans le champ `ages` de l'idée : le jeu aura exactement cet âge.
- Seules vos demandes (et celles des collaborateurs du dépôt) sont traitées. Les autres restent ouvertes, sans effet.
- Une idée dont le titre existe déjà (idée prévue, idée réalisée ou jeu du site) n'est pas ajoutée.
- Rien ne se passe ? Onglet **Actions** → **Idée de jeu** → cliquez sur le passage en rouge.

### Depuis la page privée `/idees` du site

La page `/idees` (protégée par Cloudflare Access, absente du catalogue et des moteurs de recherche) envoie aussi une idée : titre, genre, **âge** (obligatoire : 4+, 5+, 6+, 7+, 8+, 10+ ou 12+), **univers** (facultatif, 2 au plus ; « Autre » seul) et description. Elle crée une demande GitHub avec l'étiquette `idee-perso`. Au passage suivant, la boucle l'ajoute à `idees.json` (avec son âge et ses univers) et la fabrique **avant toutes les autres** ; la demande se ferme avec le lien de la pull request du jeu. Une valeur illisible (âge, univers hors liste) est écartée avec un message, l'idée est gardée.

### Idées des visiteurs (formulaire public)

Les visiteurs proposent des jeux avec le formulaire public du site (`/proposer/`). L'IA les modère, puis vous les acceptez ou les refusez dans l'onglet **« Demandes publiques »** de `/idees`. Une proposition acceptée devient une idée perso (étiquette `idee-perso`, avec le genre, l'âge et les univers choisis en l'acceptant) : la boucle la fabrique au même rang que vos idées de `/idees`. Mode d'emploi : `DEMANDES.md`.

## Faire modifier un jeu déjà publié

Onglet **« Modifier un jeu »** de la page privée `/idees` : choisissez le jeu, décrivez la demande, envoyez. L'IA la classe, modifie le jeu, le vérifie comme la boucle de nuit et le met en ligne si tout est bon. Les bugs et modifications signalés par les visiteurs (formulaire public) suivent le même chemin une fois acceptés dans l'onglet « Demandes publiques ». Mode d'emploi : `DEMANDES.md`.

## Faire corriger un jeu proposé

Quand une pull request de jeu est ouverte (fusion automatique coupée, vérification interrompue, ou jeu proposé par quelqu'un d'autre), vous pouvez demander une correction en commentaire, même depuis le téléphone.

1. Ouvrez la pull request du jeu et écrivez un commentaire qui contient `@claude`, suivi de votre demande.
   Exemple : « @claude les ballons vont trop vite au niveau 1, et ajoute un petit son quand on gagne ».
2. Envoyez. Un 👀 apparaît sur votre commentaire : la demande est prise en compte.
3. Après 10 à 30 minutes, Claude répond avec un résumé des changements, et la correction est ajoutée à la pull request.
4. Pull request de la boucle : elle sera revérifiée au passage suivant (ou tout de suite : **Run workflow** avec **0** jeu).

Bon à savoir :

- Seuls les commentaires des comptes Jamesmax27 et celest27 déclenchent une correction (liste dans `corriger-jeu.yml`). Le compte celest27 doit être collaborateur du dépôt avec l'accès en écriture, sinon Claude refuse la demande.
- Claude ne peut modifier que le dossier du jeu de la pull request. La jaquette automatique est refaite ; une jaquette faite à la main est gardée.
- Si le jeu change (règles, touches, niveaux, écran titre…), ou si vous le demandez, Claude met aussi à jour les textes de la page du jeu dans les 5 langues (`node scripts/i18n-jeu.mjs --meta`, qui pose la date de modification `maj`), puis contrôle le référencement.
- Référencement non conforme : la correction est refusée pour un jeu de la boucle ou un jeu ajouté depuis le 24 octobre 2026 ; pour un jeu plus ancien, elle est ajoutée quand même, avec une ligne ℹ️ (sa page reste seulement hors des moteurs de recherche). Une panne du contrôle ne bloque jamais.
- Si le contrôle qualité échoue encore après 3 essais, rien n'est ajouté : la réponse donne le rapport.
- Une demande à la fois par pull request : la suivante attend la fin de la précédente.
- Comme la boucle de nuit, chaque correction consomme votre abonnement Claude.

## Commandes utiles

| Je veux… | Je fais… |
| --- | --- |
| Proposer une idée depuis mon téléphone | Issues → New issue → Nouvelle idée de jeu |
| Ajouter, retirer ou réordonner des idées | Modifier `idees.json`, puis Commit + Push |
| Retenter une idée mise de côté | Dans `idees.json`, remplacer `"essais": 3` par `"essais": 0` |
| Lancer la boucle sans attendre la nuit | Actions → Créer des jeux (boucle de nuit) → Run workflow (1 à 5 jeux) |
| Revérifier les pull requests en attente | Actions → Créer des jeux (boucle de nuit) → Run workflow → 0 jeu |
| Faire corriger un jeu proposé | Commentaire « @claude … » dans sa pull request |
| Couper la fusion automatique | Variable `FUSION_AUTO` = `non` (voir plus haut) |
| Mettre la boucle en pause | Actions → Créer des jeux (boucle de nuit) → menu « … » → **Disable workflow** |
| Comprendre un échec | Actions → cliquer sur le passage en rouge → lire l'étape en échec |
| Vérifier `idees.json` sur mon PC | `npm run idees` |
| Contrôler un jeu sur mon PC | `npm run check` (ou `npm run check -- mon-jeu`) |
| Voir un jeu joué au hasard, avec captures | `npm run check -- --jouer mon-jeu` (captures dans `captures/mon-jeu/`) |
| Contrôler les textes de la page d'un jeu | `npm run seo-textes -- mon-jeu` (sans rien construire ; `npm run seo-textes -- --categories` pour les pages de catégories) |
| Contrôler le référencement de tout le site | `npm run seo` (construit le site, puis contrôle toutes les pages, le sitemap et robots.txt) ; `npm run seo -- mon-jeu` : seules les erreurs de ce jeu bloquent |
| Contrôler le site en ligne | `node scripts/verifier-seo.mjs --en-ligne` (ajoute des contrôles sur https://freemicrogames.com/) |

## Bon à savoir

- **Consommation** : chaque passage fait travailler jusqu'à 11 agents Claude (1 pour les idées, 5 créateurs en même temps, 5 relecteurs), deux fois par nuit, sur votre abonnement. Si la limite d'utilisation est atteinte, les jeux en cours échouent ou leur vérification est interrompue : rien n'est perdu, les idées reviennent en attente. Si cela arrive souvent, réduisez le nombre de jeux : remplacez `nombre="${NOMBRE_MANUEL:-5}"` par `:-2` dans `boucle-de-nuit.yml`, ou retirez l'une des deux lignes `cron`.
- **Minutes GitHub** : gratuites et illimitées pour un dépôt public ; pour un dépôt privé, le quota mensuel du compte s'applique (Settings → Billing).
- **Publications Cloudflare** : chaque jeu fusionné déclenche une publication du site (500 par mois avec l'offre gratuite, soit environ 10 par nuit au maximum ici). Les mises à jour de la file d'idées n'en déclenchent pas (`[CF-Pages-Skip]` dans leur message).
- **Heure** : lignes `cron` de `boucle-de-nuit.yml`, en heure UTC (`0 0` = 1 h à Paris l'hiver). GitHub démarre parfois les tâches planifiées avec un peu de retard.
- **Sécurité** : l'agent des idées ne peut écrire que sa liste de propositions, contrôlée ensuite (genre et univers dans les listes fermées, doublons, longueur). Les agents créateurs ne peuvent que lire, écrire des fichiers et lancer le robot et les contrôles (traductions, référencement) : un garde-fou refuse tout ce qui sort du dossier du nouveau jeu. Le relecteur ne peut que lire et écrire son verdict. Seule la boucle fusionne, et seulement une pull request qui ajoute un seul nouveau jeu sans toucher au reste.
- **Jeton** : il expire au bout d'un an. Refaites alors les étapes 2 et 3 de la mise en place.
