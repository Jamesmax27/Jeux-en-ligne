# Publicité — préparée, désactivée

## État actuel

- **Désactivée** : `PUB_ACTIVE = false` dans `public/pub.js`. Rien n'est chargé ni affiché, aucun cookie n'est déposé.
- **Emplacements prévus** dans `public/index.html`, cachés pour l'instant :
  - `#pub` : un seul bloc, en bas du catalogue (après les archives, avant le pied de page), avec la mention « Publicité » ;
  - `#consentement` : le bandeau de consentement aux cookies.
- **Jamais de publicité dans le lanceur (`play.html`) ni dans les jeux.** La règle de sécurité des jeux (aucun accès réseau) l'empêche de toute façon.
- **Hors connexion** : aucune publicité.
- Aucun code de régie ni identifiant n'est présent : ils seront ajoutés avec votre compte.

## Ce qu'il vous faudra fournir

| Élément | Pourquoi | Où il ira |
| --- | --- | --- |
| **Un nom de domaine à vous** (`freemicrogames.com`), relié au projet Cloudflare Pages (onglet *Custom domains*) | Les régies refusent en général les adresses en `.pages.dev`. | Réglages Cloudflare |
| **Un compte chez une régie** qui accepte les sites fréquentés par des enfants et les annonces non personnalisées (par exemple Google AdSense, après validation du site) | C'est elle qui fournit et paie les annonces. | — |
| **Les identifiants donnés par la régie** : identifiant éditeur (chez Google : `ca-pub-…`), identifiant du bloc d'annonce, adresse du script | Ils désignent votre compte et l'emplacement. | `REGIE` dans `public/pub.js` |
| **La ligne `ads.txt`** donnée par la régie | Elle prouve que les annonces vendues sur votre site viennent bien de vous. | Fichier `public/ads.txt` |
| **Un outil de consentement aux cookies** : en Europe, Google exige un outil certifié (le sien, « Confidentialité et messages », est inclus dans AdSense) | Obligatoire en France (CNIL) avant tout cookie publicitaire. | `demanderConsentement()` dans `public/pub.js` |
| **Les champs [À COMPLÉTER] de la page « Mentions légales »** (`public/mentions-legales.html`, déjà en ligne) **et une page « Confidentialité »** (à créer) | Obligatoires : éditeur du site, hébergeur (Cloudflare), régie, cookies utilisés, comment retirer son consentement. | `public/mentions-legales.html` et nouvelle page du site |

## Réglages obligatoires (le public peut inclure des enfants)

- **Annonces non personnalisées uniquement** : aucun ciblage selon la navigation, même si le visiteur accepte les cookies.
- **Traitement « contenu destiné aux enfants »** activé chez la régie. Chez Google, il s'appelle *tag for child-directed treatment* (loi américaine COPPA). En Europe, le RGPD interdit le profilage des mineurs.
- **Catégories sensibles bloquées** dans la console de la régie : jeux d'argent, rencontres, alcool, contenus pour adultes, etc. Refuser aussi les formats envahissants (vidéo avec son, plein écran).
- **Refus des cookies** : aucun cookie. N'afficher qu'une annonce sans cookie si la régie le permet (chez Google : « annonces limitées »), sinon rien.

Vérifiez ces points dans les conditions de la régie choisie au moment de l'inscription : elles changent régulièrement.

## Activer la publicité, le jour venu

1. Remplir `REGIE` dans `public/pub.js` (adresse du script, identifiant éditeur, identifiant du bloc).
2. Compléter `demanderConsentement()` et `chargerAnnonce()` avec le code donné par la régie, en gardant les réglages ci-dessus (non personnalisé, public enfant).
3. Ajouter le fichier `public/ads.txt`.
4. Ajouter les styles de `.pub` et `.consentement` dans `public/style.css` (il n'y en a pas encore, pour ne rien changer à l'affichage).
5. Textes du site : rien à faire, ils ne promettent plus l'absence de publicité (branche `textes-coherence`). Ne jamais réintroduire « sans publicité » ou équivalent.
6. Mettre `PUB_ACTIVE = true` dans `public/pub.js`.
7. Augmenter `VERSION` dans `public/sw.js`, pour que les téléphones reçoivent la nouvelle version.
8. Mettre à jour `CLAUDE.md` (sections 4 et 12).
9. Commit, puis Push : vérifier sur le téléphone que le bandeau apparaît d'abord, puis l'annonce, en bas du catalogue seulement.

Pour couper la publicité à tout moment : remettre `PUB_ACTIVE = false`, puis Commit et Push.
