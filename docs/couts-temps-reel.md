# Coûts du multijoueur en temps réel — Free Micro Games

> Compagnon de `docs/cadrage-temps-reel.md` (section 9). Rédigé le 12 novembre 2026.
> **Deux sortes de chiffres, toujours séparées** : **mesuré** (relevé par le Worker lui-même, sous `wrangler dev` sur la machine de développement, ou plus tard en ligne) et **estimé** (calculé à partir de la grille de Cloudflare et des mesures). Ce qui reste à mesurer en ligne est indiqué à la section 5.

## 1. Grille officielle de Cloudflare

Pages lues le 12 novembre 2026 (date de mise à jour affichée par chaque page) :

- [Durable Objects — Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) (18 octobre 2026)
- [Durable Objects — Limits](https://developers.cloudflare.com/durable-objects/platform/limits/) (7 novembre 2026)
- [Workers — Pricing](https://developers.cloudflare.com/workers/platform/pricing/) (2 octobre 2026)
- [Durable Objects — WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) (30 octobre 2026)
- [Realtime — TURN](https://developers.cloudflare.com/realtime/turn/) (25 septembre 2026)

| Ressource | Plan gratuit | Plan payant (5 $ par mois au minimum, tout le compte) |
| --- | --- | --- |
| Requêtes Durable Objects (requêtes HTTP, ouverture d'un WebSocket, alarmes) | 100 000 par jour | 1 million par mois, puis 0,15 $ le million |
| Message WebSocket **reçu** par un Durable Object | 1/20 de requête | idem |
| Message WebSocket **envoyé**, `ping` automatique (`setWebSocketAutoResponse`) | gratuit | gratuit |
| Durée (128 Mo facturés par objet éveillé, quelle que soit la mémoire utilisée) | 13 000 Go-s par jour | 400 000 Go-s par mois, puis 12,50 $ le million de Go-s (arrondi au million supérieur) |
| Lignes écrites (stockage SQLite) | 100 000 par jour | 50 millions par mois, puis 1 $ le million |
| Requêtes Workers (le site, ses fonctions et le Worker multijoueur partagent ce quota) | 100 000 par jour | 10 millions par mois, puis 0,30 $ le million |
| Temps de calcul d'un Durable Object | 30 s par requête ou message (remis à zéro à chaque message reçu) ; non facturé à part | idem |
| TURN de Cloudflare (non utilisé) | — | 0,05 $ par Go envoyé au client ; pas de franchise indiquée |

Ce qui commande les coûts : **`setTimeout` et `setInterval` empêchent l'hibernation**, et un objet qui ne peut pas hiberner paie sa durée. La boucle des ticks d'une partie relayée garde donc son Durable Object éveillé toute la partie : **une partie relayée paie toute sa durée**. Une partie en pair-à-pair ou contre le robot ne paie presque rien.

## 2. Mesuré (wrangler dev, 12 novembre 2026)

Le Duel écrit à la fin de chaque partie une ligne « `[temps réel] mesure` » dans les journaux du Worker : durée, messages reçus et envoyés, octets, ticks, écarts de hachage, reprises. `node scripts/tester-temps-reel.mjs --wrangler` les recopie dans `captures/temps-reel/mesures-wrangler.json`.

> Sous `wrangler dev`, rien n'est facturé et la durée d'éveil n'est pas mesurée par Cloudflare. Ce qui est mesuré ici, c'est **ce que fait le Worker** : nombre de messages, taille, durée de la partie. La durée facturée en ligne s'en déduit (section 3), puisque la minuterie garde l'objet éveillé.

Test 4 de `scripts/tester-temps-reel.mjs --wrangler --ticks 2000` (12 novembre 2026, `wrangler@4.155.0`, machine de développement) : quatre parties relayées en même temps, deux clients chacune, qui donnent un ordre environ toutes les 0,9 s chacun (plus souvent qu'un enfant : chiffres prudents) et un hachage tous les 50 ticks ; latence simulée de 0, 150 et 400 ms, avec coupures et reprises.

| Partie (mesuré) | Durée | Ticks | Messages reçus par le Duel | Octets reçus | Messages envoyés | Octets envoyés | Écarts | Reprises |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| latence 0 ms | 212 s | 2 120 | 330 | 11 526 | 4 043 | 106 484 | 0 | 0 |
| latence 150 ms, coupures | 211 s | 2 106 | 331 | 11 481 | 3 775 | 140 767 | 0 | 18 |
| latence 400 ms, coupures | 178 s (fin par conquête) | 1 779 | 307 | 10 291 | 3 305 | 151 949 | 0 | 47 |
| déconnexion de 12,5 s (test 5) | 210 s | 2 100 | 331 | 11 664 | 3 882 | 105 096 | 0 | 1 |

Ce que l'on en tire (mesuré) :

- **Messages reçus** (les seuls facturés, à 1/20 de requête) : environ **94 par minute** de partie relayée, pour deux joueurs.
- **Messages envoyés** (gratuits) : un paquet par tick et par joueur, soit environ 1 150 par minute. Environ 30 Ko envoyés par minute.
- **Calcul** : la simulation tourne sur le serveur sans retard : 2 000 ticks joués à l'heure, aucun écart de hachage.
- **Pair-à-pair** (test 3, navigateur) : le Duel ne reçoit que la signalisation (offre, réponse, candidats, « p2p », moins de 20 messages), puis plus rien. Aucune minuterie : il peut hiberner.
- **Contre le robot** (test 2) : aucune requête pendant la partie (vérifié dans le navigateur).

## 3. Estimé : une partie de 15 minutes

À partir des mesures ci-dessus (messages reçus par minute de partie relayée) et de la grille :

Hypothèses : partie de 15 min (le jeu en ligne s'arrête au plus tard à 10 min ; une partie relayée à 20 min) ; 2 connexions au Duel et 2 à la Rencontre ; 3 appels au Budget ; lignes écrites comptées dans le code (création, arrivées, mode, « prêts », fin, alarmes, Budget).

| Partie de 15 min (estimé) | Durée facturée | Requêtes Durable Objects | Requêtes Workers | Lignes écrites |
| --- | --- | --- | --- | --- |
| Contre le robot | 0 | 0 (2 avec la question « un joueur est disponible ? » à la fin) | 0 (1) | 0 |
| Recherche de 15 s sans adversaire | 0 à 2 Go-s (objet éveillé au plus pendant la recherche) | 1 à 3 | 1 | 0 |
| Pair-à-pair | 1 à 3 Go-s (recherche et signalisation, puis hibernation) | environ 10 | 4 | environ 8 |
| Relayée | **900 s × 0,125 Go = 112,5 Go-s** | environ 80 (1 410 messages reçus ÷ 20, plus les connexions et le Budget) | 4 | environ 12 |

La durée domine tout : une partie relayée de 15 min coûte autant de durée que 40 à 100 parties en pair-à-pair. Les messages reçus pèsent peu (environ 70 requêtes), et les messages envoyés ne coûtent rien.

**Nova Dominion** (jeu de stratégie, 12 novembre 2026) : mêmes ordres de grandeur. Une partie en ligne dure 15 minutes au plus (112,5 Go-s si elle est relayée) ; le Duel y fait tourner une simulation plus lourde, mais la durée facturée ne dépend pas du calcul (0,28 ms par tick mesurés dans Node, soit environ 3 ms de calcul par seconde de partie, loin des limites). Un ordre porte la liste des unités choisies : quelques centaines d'octets, toujours une seule requête facturée pour 20 messages reçus. Les instantanés (50 à 110 Ko) ne partent qu'à une reprise ou à un secours : la sortie ne coûte rien.

## 4. Estimé : parties possibles par jour

**Plan gratuit** (13 000 Go-s et 100 000 requêtes Durable Objects par jour, pour tout le compte) :

| Estimé, par jour | Parties de 15 min |
| --- | --- |
| Relayées, avec le réglage actuel (`BUDGET_RELAIS_GOS` = 6 000, refus au-delà de 80 % : 4 800 Go-s) | **≈ 42** |
| Relayées, si tout le plan gratuit leur était laissé (80 % de 13 000) | ≈ 92 |
| Pair-à-pair (limité par la durée de la recherche et de la signalisation) | plusieurs milliers (≈ 4 000 à 10 000) |
| Contre le robot | sans limite (rien sur le serveur) |

Les parties en ligne du jeu durent au plus 10 min : à 75 Go-s, le réglage actuel en permet ≈ 64 par jour. Une partie qui passe au relais en cours de route (secours) ne paie que la durée qui reste.

**Plan payant** (5 $ par mois au minimum pour tout le compte ; 400 000 Go-s et 1 million de requêtes par mois inclus) :

| Estimé, par mois | Coût du relais |
| --- | --- |
| jusqu'à ≈ 3 500 parties relayées de 15 min (≈ 115 par jour) | compris dans les 5 $ |
| ensuite, par partie relayée de 15 min | ≈ 0,0014 $ (112,5 Go-s × 12,50 $ par million) |
| exemple : 1 000 parties relayées par jour (≈ 3,4 millions de Go-s par mois) | ≈ 37,50 $ en plus des 5 $ (3 millions facturés, arrondi au million) |

Le pair-à-pair et le robot restent pratiquement gratuits dans les deux plans. La part de parties relayées dépend du taux de réussite du pair-à-pair (journalisé par le Budget, `/tr/etat`), inconnu tant que de vrais joueurs n'ont pas joué : sans TURN, entre un wifi et un réseau 4G, il peut descendre nettement sous 80 %.

## 5. À mesurer en ligne (propriétaire, après la fusion)

1. Jouer une vraie partie de 15 minutes à deux appareils. Pour obtenir une partie relayée, le plus simple est un téléphone en 4G contre un ordinateur derrière un réseau strict (entreprise, partage de connexion) : le pair-à-pair y échoue souvent. La console du lanceur (outils du navigateur) dit « mode pair-à-pair » ou « mode relayé ».
2. Tableau de bord Cloudflare → Workers & Pages → `fmg-multijoueur` → **Logs** : chercher `[temps réel] mesure` (durée, messages reçus, envoyés, ticks).
3. Même endroit → **Metrics** → Durable Objects : requêtes, **durée (Go-s)** et lignes écrites du jour, avant et après la partie.
4. `https://multi.freemicrogames.com/tr/etat` : compteurs du jour du Budget (`p2p`, `relais`, `secours`, `echec`, `refus`, `consomme` en Go-s estimés).
5. Relever aussi la **durée Durable Objects d'une journée ordinaire** (tour par tour, présence des amis) : c'est elle qui fixe la part des 13 000 Go-s laissée au relais (`BUDGET_RELAIS_GOS` dans `multijoueur/wrangler.toml`, 6 000 par défaut, refus au-delà de 80 %).

Ces relevés remplaceront les lignes « estimé » des sections 3 et 4.
