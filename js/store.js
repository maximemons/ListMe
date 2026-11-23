// Stockage local (localStorage) : source de vérité de l'interface.
// Toutes les modifications sont d'abord écrites ici, puis placées dans une
// file d'attente envoyée à Firestore dès que le réseau le permet.

const K = {
  lists: 'listme:lists',
  current: 'listme:current',
  items: (id) => `listme:items:${id}`,
  queue: 'listme:queue',
  products: 'listme:products',
  stores: 'listme:stores',
  favStore: 'listme:favStore',
  deadStores: 'listme:deadStores',
  space: 'listme:space',
  deadLists: 'listme:deadLists',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[ListMe] Écriture locale impossible', e);
  }
}

let seq = 0;
const opKey = (path) => path.join('/');

export const store = {
  /* ---- Listes ---- */
  getLists() {
    return read(K.lists, []);
  },
  upsertList(list) {
    const lists = this.getLists();
    const i = lists.findIndex((l) => l.id === list.id);
    if (i >= 0) lists[i] = { ...lists[i], ...list };
    else lists.push(list);
    write(K.lists, lists);
  },
  removeList(id) {
    write(K.lists, this.getLists().filter((l) => l.id !== id));
    try { localStorage.removeItem(K.items(id)); } catch { /* rien */ }
    if (this.getCurrentId() === id) this.setCurrentId(null);
  },
  getCurrentId() {
    return read(K.current, null);
  },
  setCurrentId(id) {
    write(K.current, id);
  },

  /* ---- Articles ---- */
  getItems(listId) {
    return read(K.items(listId), {});
  },
  saveItems(listId, items) {
    write(K.items(listId), items);
  },

  /* ---- Catalogue personnalisé ---- */
  getProducts() {
    return read(K.products, {});
  },
  saveProducts(products) {
    write(K.products, products);
  },

  /* ---- Magasins ---- */
  getStores() {
    return read(K.stores, {});
  },
  saveStores(stores) {
    write(K.stores, stores);
  },
  getFavStore() {
    return read(K.favStore, null);
  },
  setFavStore(id) {
    write(K.favStore, id);
  },
  getDeadStores() {
    return read(K.deadStores, []);
  },
  removeDeadStore(id) {
    write(K.deadStores, this.getDeadStores().filter((x) => x !== id));
  },
  addDeadStore(id) {
    const dead = this.getDeadStores();
    if (!dead.includes(id)) write(K.deadStores, [...dead, id].slice(-200));
  },

  /* ---- Espace personnel (synchronisation entre appareils) ---- */
  getSpaceId() {
    return read(K.space, null);
  },
  setSpaceId(id) {
    write(K.space, id);
  },
  getDeadLists() {
    return read(K.deadLists, []);
  },
  addDeadList(id) {
    const dead = this.getDeadLists();
    if (!dead.includes(id)) write(K.deadLists, [...dead, id].slice(-200));
  },
  removeDeadList(id) {
    write(K.deadLists, this.getDeadLists().filter((x) => x !== id));
  },

  /* ---- File d'attente de synchronisation ----
     Une seule opération est conservée par document : la plus récente.
     Les opérations sont idempotentes (set complet ou delete), on peut donc
     les rejouer sans risque. */
  getQueue() {
    return read(K.queue, []);
  },
  enqueue(op) {
    const key = opKey(op.path);
    const queue = this.getQueue();
    const prev = queue.find((o) => o.key === key);
    // combine : fusionne avec l'opération en attente sur le même document
    // (ex. renommer une liste puis lui rattacher un magasin).
    const data =
      op.combine && prev && prev.op === 'set' && prev.merge && op.op === 'set'
        ? { ...prev.data, ...op.data }
        : op.data;
    const { combine, ...rest } = op;
    const entry = { ...rest, data, key, ts: `${Date.now()}-${++seq}` };
    const q = queue.filter((o) => o.key !== key);
    q.push(entry);
    write(K.queue, q);
    return entry;
  },
  ack(ops) {
    const done = new Set(ops.map((o) => `${o.key}|${o.ts}`));
    write(K.queue, this.getQueue().filter((o) => !done.has(`${o.key}|${o.ts}`)));
  },
  hasPending(path) {
    const key = opKey(path);
    return this.getQueue().some((o) => o.key === key);
  },
  pendingItemOps(listId) {
    const map = new Map();
    for (const op of this.getQueue()) {
      const [a, b, c, id] = op.path;
      if (a === 'lists' && b === listId && c === 'items' && id) map.set(id, op);
    }
    return map;
  },
  pendingProductOps() {
    const map = new Map();
    for (const o of this.getQueue()) if (o.path[0] === 'products') map.set(o.path[1], o);
    return map;
  },
};
