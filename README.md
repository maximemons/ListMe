# ListMe — Liste de courses

Une liste de courses partagée en direct, pensée pour le téléphone et utilisable sans réseau dans le magasin. Pas de compte : une liste se partage par son lien.

## Accueil

À la première visite (ou quand plus aucune liste n’est enregistrée sur l’appareil), un écran d’accueil propose :

- un champ « Code ou lien de la liste » : rempli, il rejoint une liste existante (le code est vérifié auprès du serveur) ; laissé vide, il crée une nouvelle liste ;
- « J’utilise déjà ListMe sur un autre appareil » : coller le lien « Mes appareils » récupère toutes vos listes et vos magasins.

Aucune liste vide n’est donc créée d’office. Le code d’une liste (20 caractères, majuscules et minuscules comptent) est affiché dans la fenêtre de partage.

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
- Appui long sur un article (clic droit sur ordinateur) : le renommer, modifier sa quantité, son rayon ou le supprimer.
  - Renommer « Zeste de citron » en « Citron » rattache l’article au produit du catalogue (et à son rayon). Si « Citron » est déjà dans la liste, les deux lignes sont regroupées.
  - Pour un produit ajouté par un utilisateur, la case « Retirer des suggestions » l’enlève aussi du catalogue.
- Ajouter un produit déjà présent additionne les quantités, y compris les poids et volumes (60 g + 200 g = 260 g).
- « Retirer les cochés » et « Vider la liste » (avec confirmation) ; les deux proposent d’annuler.
- La barre de progression indique combien d’articles sont déjà au caddie.

## Magasins et estimation du prix

- Le bouton magasin, sous le nom de la liste, ouvre la liste de vos magasins. Chaque magasin a un nom et une position GPS (bouton cible pour prendre la position actuelle, ou coordonnées collées depuis une carte, ex. `50.6366, 3.0699`).
- L’étoile désigne le magasin favori, sélectionné par défaut à l’ouverture d’une liste.
- Avec un magasin sélectionné, chaque article affiche son coût (ou « + prix » pour le saisir). Trois façons de saisir un prix :
  - **À l’unité** : prix d’un article, multiplié par la quantité ;
  - **En paquet** : prix et contenance du paquet (ex. 1,29 € le paquet de 1 kg). La liste demande 60 g de farine ? Il faut acheter 1 paquet de 1 kg : le coût compté est 1,29 € et la ligne affiche « À acheter : 1 × 1 kg ». Le prix au kilo (ou au litre) est indiqué ;
  - **Au poids** : prix au kilo ou au litre pour le vrac (ex. tomates à 2,99 €/kg, 1,5 kg demandés = 4,49 €).
  Pour un produit demandé au poids ou au volume, la saisie propose par défaut un paquet de 1 kg (ou 1 l).
- L’estimation du total s’affiche en haut à droite. Un `+` signale que certains articles n’ont pas encore de prix ; la toucher donne le détail (total, montant déjà au caddie, articles sans prix).
- Les prix sont enregistrés par magasin et réutilisés d’une liste à l’autre.
- À l’ouverture d’une liste, si l’appareil autorise la localisation et que le magasin le plus proche n’est pas celui sélectionné, une fenêtre propose de le choisir (une fois par liste et par session). La position de l’appareil n’est jamais envoyée au serveur ; seule celle des magasins est enregistrée.
- Les magasins (et leurs prix) sont aussi rattachés aux listes que vous ouvrez : les personnes avec qui une liste est partagée voient les mêmes magasins et les mêmes prix.

## Mes appareils

- « Mes listes » > « Retrouver sur un autre appareil » donne un lien personnel. L’ouvrir sur un autre téléphone ou ordinateur y synchronise toutes vos listes, vos magasins, leurs prix et votre magasin favori, dans les deux sens.
- On peut aussi coller ce lien dans la même fenêtre sur l’autre appareil.
- Retirer une liste ou supprimer un magasin s’applique à tous vos appareils.
- Ce lien donne accès à toutes vos listes : ne le transmettez qu’à vous-même ou à votre foyer.

## Listes et partage

- Le nom de la liste, en haut, ouvre « Mes listes » : changer de liste, en créer, renommer, retirer.
- Les listes sont gardées sur l’appareil (localStorage) et synchronisées avec vos autres appareils (voir « Mes appareils »).
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
spaces/{idEspace}               lists{idListe: nom|null}, stores{idMagasin: true|null}, favStore, updatedAt
```

Un prix vaut soit un nombre (prix à l’unité), soit `{ p, m, a, u }` : `m` = `unit`, `pack` (paquet de `a` g ou ml) ou `bulk` (prix pour `a` g ou ml, 1000 pour un prix au kg ou au litre), `u` = `g` ou `ml`.

## Sécurité

Sans authentification, la protection repose sur des identifiants aléatoires de 20 à 24 caractères : qui possède le lien d’une liste peut la lire et la modifier. Les règles empêchent de lister les listes, les magasins ou les espaces et limitent les champs acceptés. La clé `apiKey` présente dans `firebase-config.js` est prévue pour être publique ; ce sont les règles Firestore qui protègent les données.

Ne mettez aucune donnée personnelle ou confidentielle dans les noms de listes, de produits ou de magasins.
