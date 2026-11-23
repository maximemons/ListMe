# ListMe — Liste de courses

Une liste de courses partagée en direct, pensée pour le téléphone et utilisable sans réseau dans le magasin. Pas de compte : une liste se partage par son lien.

## Ajouter des produits

- La barre de recherche propose les produits d’un catalogue d’environ 860 références, classées par rayon. La recherche ignore les accents, les majuscules et le pluriel.
- La quantité se tape avec le produit : `2 baguettes`, `baguettes x2` ou `3x tomates`.
- Entrée ajoute la suggestion présélectionnée (le premier produit qui commence par la saisie).
- Un produit inconnu déclenche le choix de son rayon (un rayon probable est mis en avant). Il est ensuite enregistré dans le catalogue partagé et proposé directement la fois suivante.
- Ajouter un produit déjà présent augmente sa quantité.

## Ajouter par un lien

Tous les paramètres de l’adresse sont lus comme des articles, au format `produit=quantité` :

```
index.html?lait=2&pain&pommes+de+terre=1.5&oeufs=12
```

Ou en une seule fois avec `items` (séparateurs `;` ou `,`, quantité après `:`) :

```
index.html?items=Lait:2;Pain;Œufs:12;Lessive:1
```

- Sans quantité, la quantité vaut 1. Une quantité non numérique (`500g`) est conservée telle quelle.
- `list=ID` ajoute les articles à cette liste (et l’ouvre). Sans `list`, ils vont dans la liste courante.
- `name=Apéro` avec des articles et sans `list` crée une nouvelle liste portant ce nom.
- Les produits inconnus sont classés un par un ; fermer la fenêtre les range dans « Autre ».
- Paramètres ignorés : `list`, `name`, `fbclid`, `gclid`, `utm_*`.

La fenêtre de partage génère aussi un « lien d’ajout » contenant les articles restants de la liste.

## Pendant les courses

- Toucher un article le coche : il descend dans « Dans le caddie », barré. Le toucher à nouveau le remet dans la liste.
- Les boutons − / + changent la quantité ; à 1, − devient une corbeille.
- Appui long sur un article : modifier la quantité, le prix, le rayon (le catalogue est mis à jour) ou le supprimer.
- « Retirer les cochés » et « Vider la liste » (avec confirmation) ; les deux proposent d’annuler.
- La barre de progression indique combien d’articles sont déjà au caddie.

## Magasins et estimation du prix

- Le bouton magasin, sous le nom de la liste, ouvre la liste de vos magasins. Chaque magasin a un nom et une position GPS (bouton cible pour prendre la position actuelle, ou coordonnées collées depuis une carte, ex. `50.6366, 3.0699`).
- L’étoile désigne le magasin favori, sélectionné par défaut à l’ouverture d’une liste.
- Avec un magasin sélectionné, chaque article affiche son prix (ou « + prix » pour le saisir). Le prix saisi est un prix unitaire, multiplié par la quantité.
- L’estimation du total s’affiche en haut à droite. Un `+` signale que certains articles n’ont pas encore de prix ; la toucher donne le détail (total, montant déjà au caddie, articles sans prix).
- Les prix sont enregistrés par magasin et réutilisés d’une liste à l’autre.
- À l’ouverture d’une liste, si l’appareil autorise la localisation et que le magasin le plus proche n’est pas celui sélectionné, une fenêtre propose de le choisir (une fois par liste et par session). La position de l’appareil n’est jamais envoyée au serveur ; seule celle des magasins est enregistrée.
- Les magasins (et leurs prix) sont rattachés aux listes que vous ouvrez : les personnes avec qui une liste est partagée voient les mêmes magasins et les mêmes prix. Le favori reste propre à chaque appareil.

## Listes et partage

- Le nom de la liste, en haut, ouvre « Mes listes » : changer de liste, en créer, renommer, retirer de l’appareil.
- Les listes restent sur l’appareil (localStorage).
- Le bouton de partage fournit le lien de la liste. Toute personne qui l’ouvre voit et modifie la même liste, en direct.

## Hors ligne

- Un service worker met en cache l’application et les modules Firebase : une fois ouverte une première fois, elle démarre sans réseau.
- Chaque modification est enregistrée immédiatement sur l’appareil puis placée dans une file d’attente, envoyée à Firestore dès que le réseau revient (au retour en ligne, au retour sur l’onglet et toutes les 20 secondes).
- L’indicateur en haut montre l’état : « À jour », « n en attente », « Hors ligne (n) » ou « Local » (serveur injoignable).
- En cas de modifications simultanées sur un même article, la dernière arrivée l’emporte.

## Structure

```
ListMe/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js              # interface, catalogue, magasins, prix
│   ├── store.js            # stockage local et file d'attente
│   ├── sync.js             # synchronisation Firestore
│   ├── products-data.js    # rayons et catalogue de base
│   └── firebase-config.js  # configuration Firebase
├── sw.js                   # service worker (hors ligne)
├── manifest.webmanifest    # installation sur l'écran d'accueil
├── firestore.rules         # règles de sécurité à publier
├── favicon.ico
└── icons/
```

## Mise en place

1. Dans la console Firebase du projet `listme-101f2`, créer la base **Firestore** (mode production).
2. Onglet **Règles** : coller le contenu de `firestore.rules` et publier.
3. Héberger le dossier sur un serveur HTTPS (GitHub Pages convient). Le service worker et la géolocalisation exigent HTTPS ou `localhost`.
4. En local : `python3 -m http.server` dans le dossier, puis `http://localhost:8000`.

À chaque mise en ligne, incrémenter `VERSION` dans `sw.js` pour que les téléphones récupèrent la nouvelle version.

## Données Firestore

```
products/{idProduit}            name, nameNorm, aisle, updatedAt
lists/{idListe}                 name, storeIds, createdAt, updatedAt
lists/{idListe}/items/{idItem}  name, nameNorm, aisle, qty, checked, checkedAt, createdAt, updatedAt
stores/{idMagasin}              name, lat, lng, prices{idProduit: prix}, createdAt, updatedAt
```

## Sécurité

Sans authentification, la protection repose sur des identifiants aléatoires de 20 caractères : qui possède le lien d’une liste peut la lire et la modifier. Les règles empêchent de lister les listes ou les magasins et limitent les champs acceptés. La clé `apiKey` présente dans `firebase-config.js` est prévue pour être publique ; ce sont les règles Firestore qui protègent les données.

Ne mettez aucune donnée personnelle ou confidentielle dans les noms de listes, de produits ou de magasins.
