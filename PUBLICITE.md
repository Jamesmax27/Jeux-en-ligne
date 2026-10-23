# Publicité — préparée, désactivée

## État actuel

- **Désactivée** : `PUB_ACTIVE = false` dans `public/pub.js`. Rien n'est chargé ni affiché, aucun cookie publicitaire n'est déposé.
- **Emplacement prévu** dans l'accueil, caché pour l'instant : `#pub`, un seul bloc, en bas du catalogue (après les archives, avant les liens « Derniers jeux ajoutés » et le pied de page), avec la mention « Publicité ». Sa source est le gabarit `gabarits/accueil.html` (l'accueil `public/index.html` et ceux des autres langues, `/en/`…, sont générés à partir de lui à chaque build).
- **Jamais de publicité dans le lanceur (`play.html`), dans les jeux, ni sur les pages des jeux et des catégories.** La règle de sécurité des jeux (aucun accès réseau) l'empêche de toute façon dans les jeux.
- **Hors connexion** : aucune publicité.
- **Déjà en place** (branche `pages-legales-cookies`) :
  - bandeau de consentement aux cookies sur toutes les pages générées (`public/consentement.js`, `gabarits/morceaux/consentement.html`) : boutons Accepter / Refuser de même taille, lien vers la politique de cookies, choix gardé 6 mois, lien « Réglages des cookies » dans le pied de page ;
  - **Google Consent Mode v2** : tout refusé par défaut (`ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`) ; accepter accorde `ad_storage`, `ad_user_data` et `analytics_storage` (Google Analytics 4, `public/mesure.js`, chargé seulement après l'accord) ; `ad_personalization` reste **toujours** refusé ; refuser efface les cookies AdSense et Google Analytics du site ;
  - code AdSense dans `pub.js` (chargé seulement après le choix du visiteur) : `requestNonPersonalizedAds = 1`, `data-restrict-data-processing="1"` (annonces non personnalisées) et `data-tag-for-age-treatment="1"` (traitement « enfant » ; Google a abandonné `tag_for_child_directed_treatment` au profit de ce réglage, qui lui est équivalent : aide AdSense 3248194 et 9598414) ;
  - pages légales en français et en anglais : mentions légales, confidentialité, conditions d'utilisation, cookies (cookies AdSense `__gads`, `__gpi`, `__eoi` déjà décrits).
- Aucun identifiant AdSense n'est présent : ils seront ajoutés avec votre compte.

## Ce qu'il reste à fournir

| Élément | Pourquoi | Où il ira |
| --- | --- | --- |
| **Le compte AdSense validé** pour freemicrogames.com | C'est lui qui fournit et paie les annonces. | — |
| **L'identifiant éditeur** (`ca-pub-…`) et **l'identifiant du bloc d'annonce** (`data-ad-slot`) | Ils désignent votre compte et l'emplacement. | `REGIE` dans `public/pub.js` |
| **La ligne `ads.txt`** donnée par AdSense | Elle prouve que les annonces vendues sur votre site viennent bien de vous. | Fichier `public/ads.txt` |
| **Une plateforme de consentement certifiée par Google (TCF)** pour l'Europe | Google l'exige pour servir des annonces AdSense dans l'Espace économique européen, au Royaume-Uni et en Suisse. Le bandeau du site transmet bien le choix par Consent Mode, mais il n'est pas certifié TCF. La plus simple : le message de consentement intégré à AdSense (« Confidentialité et messages »). | Console AdSense ; garder alors un seul bandeau (retirer le nôtre ou le réserver aux pays hors Europe) et mettre à jour la politique de cookies |
| **La boîte e-mail contact@freemicrogames.com** | Adresse donnée dans toutes les pages légales (droits RGPD, signalements). | Chez votre fournisseur de domaine ou d'e-mail |

## Réglages obligatoires (le public peut inclure des enfants)

- **Annonces non personnalisées uniquement** : aucun ciblage selon la navigation, même si le visiteur accepte les cookies (déjà dans `pub.js` et `consentement.js`).
- **Traitement « enfant »** (`data-tag-for-age-treatment="1"`, déjà dans `pub.js`). En Europe, le RGPD interdit le profilage des mineurs ; aux États-Unis, la loi COPPA protège les moins de 13 ans.
- **Catégories sensibles bloquées** dans la console AdSense : jeux d'argent, rencontres, alcool, contenus pour adultes, etc. Refuser aussi les formats envahissants (vidéo avec son, plein écran, annonces automatiques).
- **Refus des cookies** : aucun cookie publicitaire (Consent Mode, `ad_storage` refusé).

Vérifiez ces points dans les conditions d'AdSense au moment de l'inscription : elles changent régulièrement.

## Activer la publicité, le jour venu

1. Remplir `REGIE` dans `public/pub.js` (identifiant éditeur `ca-pub-…`, identifiant du bloc).
2. Ajouter le fichier `public/ads.txt`.
3. Régler la plateforme de consentement certifiée pour l'Europe (voir le tableau ci-dessus).
4. Ajouter les styles de `.pub` dans `public/style.css` (il n'y en a pas encore, pour ne rien changer à l'affichage).
5. Textes du site : rien à faire, ils ne promettent pas l'absence de publicité. Ne jamais réintroduire « sans publicité » ou équivalent.
6. Mettre `PUB_ACTIVE = true` dans `public/pub.js`.
7. Augmenter `VERSION` dans `public/sw.js`, pour que les téléphones reçoivent la nouvelle version.
8. Mettre à jour `CLAUDE.md` (sections 4, 12 et 14) et, si besoin, les politiques de confidentialité et de cookies (`gabarits/legal/`, date `maj` de `gabarits/textes/legal.json`).
9. Commit, puis Push : vérifier sur le téléphone que le bandeau apparaît d'abord, puis l'annonce, en bas du catalogue seulement.

Pour couper la publicité à tout moment : remettre `PUB_ACTIVE = false`, puis Commit et Push.
