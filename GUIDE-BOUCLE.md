# Boucle automatique de création de jeux — mise en route

## Comment ça marche

Chaque nuit, GitHub lance la boucle suivante pour **2 jeux**, l'un après l'autre, sans votre ordinateur :

1. **L'agent Claude** lit `CLAUDE.md`, `CONSIGNES-JEU.md` et `IDEES-JEUX.md`, prend la prochaine idée non cochée (une idée déjà prise par une pull request ouverte est sautée), écrit un **cahier de conception** (principe, niveaux, mécaniques, récompenses), puis code le jeu. Il note l'idée dans le `game.json` du jeu (champ `idee`) et ne modifie jamais `IDEES-JEUX.md`.
2. **Il joue à son jeu** avec le robot de contrôle (30 secondes au hasard, avec des captures d'écran qu'il regarde), puis se relit : « qu'est-ce qui manque pour qu'un enfant y joue 15 minutes ? ». Il corrige au maximum 5 fois.
3. **Un garde-fou** vérifie qu'il n'a touché qu'au dossier du nouveau jeu. Sinon, tout s'arrête.
4. **Le robot refait un contrôle final** dans un vrai navigateur et fabrique la jaquette.
5. **Une pull request** s'ouvre : c'est une proposition, rien n'est encore en ligne.
6. **Vous jouez à l'aperçu** Cloudflare, puis vous cliquez « Merge ». Le jeu est alors publié, et son idée est cochée dans `IDEES-JEUX.md`.

---

## Mise en place (une seule fois, environ 20 minutes)

### 1. Ajouter les fichiers au dépôt

Copiez le contenu du zip à la racine de votre dépôt, en remplaçant les fichiers existants :

```text
.github/workflows/nouveau-jeu.yml   la boucle nocturne
.github/workflows/validate.yml      le contrôle des propositions
scripts/validate-games.mjs          le robot de contrôle
CONSIGNES-JEU.md                    les règles de création
IDEES-JEUX.md                       la liste d'idées (à modifier à votre goût)
GUIDE-BOUCLE.md                     ce guide
package.json                        mis à jour
```

Relisez `IDEES-JEUX.md` et adaptez les idées. Faites ensuite « Commit to main » puis « Push origin » dans GitHub Desktop.

Le dossier `.github` est caché sous Windows : affichez les éléments masqués pour le copier.

### 2. Installer l'application Claude sur GitHub

1. Ouvrez https://github.com/apps/claude et cliquez sur **Install**.
2. Choisissez **Only select repositories**, puis cochez uniquement `Jeux-en-ligne`.
3. Validez.

### 3. Créer le jeton de votre abonnement Claude

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

### 4. Donner le jeton à GitHub

1. Sur github.com, ouvrez votre dépôt → **Settings** → **Secrets and variables** → **Actions**.
2. Cliquez sur **New repository secret**.
3. Nom : `CLAUDE_CODE_OAUTH_TOKEN`. Valeur : le jeton copié. Cliquez sur **Add secret**.

### 5. Autoriser GitHub à ouvrir des pull requests

1. Toujours dans **Settings** → **Actions** → **General**, descendez jusqu'à **Workflow permissions**.
2. Choisissez **Read and write permissions**.
3. Cochez **Allow GitHub Actions to create and approve pull requests**.
4. Cliquez sur **Save**.

### 6. Premier essai, sans attendre la nuit

1. Onglet **Actions** du dépôt → **Nouveau jeu** dans la liste de gauche.
2. Cliquez sur **Run workflow**, puis sur le bouton vert **Run workflow**.
3. Attendez la fin, en général 10 à 30 minutes : une coche verte apparaît.
4. Onglet **Pull requests** → ouvrez « Nouveau jeu : … ».

---

## Au quotidien : valider un jeu (5 minutes)

1. Ouvrez la pull request du jour.
2. Lisez le **cahier de conception** en haut de la pull request (et sa section « Relecture »), puis cliquez sur le lien d'**aperçu Cloudflare** (une adresse en `.pages.dev` propre à la proposition) et jouez quelques niveaux sur votre téléphone.
3. Le jeu vous plaît : **Merge pull request** → **Confirm merge**. Il est en ligne quelques minutes plus tard.
4. Le jeu ne vous plaît pas : **Close pull request**. Rien n'est publié et l'idée reste non cochée : elle sera retentée au prochain lancement. Pour l'abandonner, supprimez sa ligne dans `IDEES-JEUX.md`.

## Proposer une idée depuis mon téléphone

Un formulaire GitHub ajoute l'idée à `IDEES-JEUX.md` tout seul, sans ordinateur.

**Une seule fois :** sur github.com, ouvrez le dépôt → **Issues** → **Labels** → **New label**.
Nom : `idee-jeu`, puis **Create label**. Sans cette étiquette, le formulaire ne déclenche rien.

**À chaque idée :**

1. Sur le téléphone (application GitHub ou navigateur) : dépôt → **Issues** → **New issue** → **Nouvelle idée de jeu**.
2. Le titre de la demande devient le titre du jeu. Remplissez le principe, le genre et l'âge.
3. Cochez « Le fabriquer cette nuit en priorité » pour la placer en tête de liste ; sinon, elle s'ajoute à la fin.
4. Envoyez. Moins d'une minute plus tard, un commentaire confirme l'ajout et la demande se ferme.

Bon à savoir :

- Seules vos demandes (et celles des collaborateurs du dépôt) sont traitées. Les autres restent ouvertes, sans effet.
- Une idée dont le titre figure déjà dans la liste n'est pas ajoutée une deuxième fois.
- Rien ne se passe ? Onglet **Actions** → **Idée de jeu** → cliquez sur le passage en rouge.

## Faire corriger un jeu proposé

Un jeu proposé ne vous convient pas tout à fait ? Demandez la correction en commentaire, même depuis le téléphone.

1. Ouvrez la pull request du jeu et écrivez un commentaire qui contient `@claude`, suivi de votre demande.
   Exemple : « @claude les ballons vont trop vite au niveau 1, et ajoute un petit son quand on gagne ».
2. Envoyez. Un 👀 apparaît sur votre commentaire : la demande est prise en compte.
3. Après 10 à 30 minutes, Claude répond avec un résumé des changements. La correction est ajoutée à la pull request et l'aperçu Cloudflare se met à jour.
4. Rejouez à l'aperçu, puis **Merge**, ou une nouvelle demande `@claude`.

Bon à savoir :

- Seuls les commentaires de votre compte (Jamesmax27) déclenchent une correction.
- Claude ne peut modifier que le dossier du jeu de la pull request. La jaquette automatique est refaite ; une jaquette faite à la main est gardée.
- Si le contrôle qualité échoue encore après 3 essais, rien n'est ajouté : la réponse donne le rapport.
- Une demande à la fois par pull request : la suivante attend la fin de la précédente.
- Comme la boucle de nuit, chaque correction consomme votre abonnement Claude.

## Commandes utiles

| Je veux… | Je fais… |
| --- | --- |
| Proposer une idée depuis mon téléphone | Issues → New issue → Nouvelle idée de jeu |
| Faire corriger un jeu proposé | Commentaire « @claude … » dans sa pull request |
| Créer plusieurs jeux d'un coup | Actions → Nouveau jeu → Run workflow → « Nombre de jeux » (1 à 5) |
| Imposer une idée précise | Actions → Nouveau jeu → Run workflow → remplir le champ « Idée imposée » (pour le 1er jeu) |
| Changer l'ordre des idées | Modifier `IDEES-JEUX.md`, puis Commit + Push |
| Mettre la boucle en pause | Actions → Nouveau jeu → menu « … » → **Disable workflow** |
| Comprendre un échec | Actions → cliquer sur le passage en rouge → lire l'étape en échec |
| Contrôler un jeu sur mon PC | `npm run check` (ou `npm run check -- mon-jeu`) |
| Voir un jeu joué au hasard, avec captures | `npm run check -- --jouer mon-jeu` (captures dans `captures/mon-jeu/`) |

## Bon à savoir

- **Coûts** : la boucle consomme votre abonnement Claude, comme une conversation, et des minutes GitHub Actions, gratuites dans la limite du quota mensuel de votre compte. Avec 2 jeux par nuit sur le modèle le plus performant, la consommation est réelle : surveillez la première semaine (votre abonnement Claude, et GitHub, menu Settings → Billing).
- **Modèle et durée** : la boucle utilise le modèle Claude le plus performant (`claude-fable-5-1`) et jusqu'à 150 tours. Un jeu prend 30 à 90 minutes et consomme nettement plus qu'avant. Si votre abonnement n'a pas accès à ce modèle, ou si la limite d'utilisation est atteinte trop vite, remplacez `claude-fable-5-1` par `claude-opus-5-5` dans `nouveau-jeu.yml`.
- **Plusieurs jeux d'un coup** : les jeux sont créés l'un après l'autre (un seul agent à la fois), 30 à 90 minutes chacun. Si l'un échoue, par exemple parce que la limite d'utilisation de l'abonnement est atteinte, les suivants sont quand même tentés ; ceux déjà terminés gardent leur pull request.
- **Liste d'idées sans conflit** : les pull requests de jeux ne modifient jamais `IDEES-JEUX.md`. Chaque jeu note son idée dans son `game.json` (champ `idee`), et la ligne est cochée sur `main` au moment de la fusion. Vous pouvez donc modifier la liste à tout moment, même avec des pull requests ouvertes.
- **Heure** : la boucle démarre à 01:23 UTC, soit vers 3 h du matin à Paris, et peut durer jusqu'à 4 heures avec 2 jeux. L'heure se règle à la ligne `cron` de `nouveau-jeu.yml`, le nombre de jeux de la nuit à la ligne `NOMBRE`.
- **Sécurité** : l'agent ne peut que lire, écrire des fichiers et lancer le robot de contrôle. Il ne peut ni publier, ni toucher aux autres jeux ou au site.
- **Jeton** : il expire au bout d'un an. Refaites alors les étapes 3 et 4.
- **Étapes suivantes du plan** : des agents spécialisés (idées, testeur, relecteur), une fois la qualité des premiers jeux vérifiée.
