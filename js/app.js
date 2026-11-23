import { store } from './store.js';
import * as sync from './sync.js';
import { AISLES, PRODUCTS } from './products-data.js';

/* =========================================================================
   Constantes & icônes
   ========================================================================= */

const AISLE = Object.fromEntries(AISLES.map((a, i) => [a.id, { ...a, order: i }]));
const aisleOf = (id) => AISLE[id] || AISLE.autre;
const RESERVED_PARAMS = new Set(['list', 'name', 'items', 'add', 'fbclid', 'gclid']);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

const ICON = {
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="3"'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  trash: svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'),
  share: svg('<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8"/>'),
  star: svg('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>'),
  starFill: svg('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor"/>'),
  pin: svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  locate: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7"/>'),
  link: svg('<path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1"/>'),
};

/* =========================================================================
   Utilitaires texte
   ========================================================================= */

function normalize(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
const singular = (w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w);
const matchKey = (s) => normalize(s).split(' ').map(singular).join(' ');
const slug = (s) => normalize(s).replace(/ /g, '-').slice(0, 80) || 'produit';
const tidy = (s) => {
  const t = (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

function uid(n = 20) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => chars[x % chars.length]).join('');
}

function parseQty(v) {
  if (v == null) return 1;
  const t = String(v).trim();
  if (!t) return 1;
  if (/^\d+([.,]\d+)?$/.test(t)) {
    const n = parseFloat(t.replace(',', '.'));
    return n > 0 ? Math.round(n * 100) / 100 : 1;
  }
  return t.slice(0, 20);
}
const moneyFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const money = (n) => moneyFmt.format(n);
const fmtPrice = (n) => n.toFixed(2).replace('.', ',');
function parsePrice(v) {
  const t = String(v ?? '').replace(/€|\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) / 100 : NaN;
}
const fmtQty = (q) => (typeof q === 'number' ? String(q).replace('.', ',') : String(q));

/** « 2 baguettes », « baguettes x2 », « 3x tomates » → { name, qty } */
function parseEntry(text) {
  let name = (text || '').trim().replace(/\s+/g, ' ');
  let qty = 1;
  let m = name.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|×|\*)?\s+(.+)$/i);
  if (m) {
    qty = parseQty(m[1]);
    name = m[2];
  } else if ((m = name.match(/^(.+?)\s*(?:x|×|\*)\s*(\d+(?:[.,]\d+)?)$/i))) {
    name = m[1];
    qty = parseQty(m[2]);
  }
  return { name, qty };
}

/* =========================================================================
   Catalogue
   ========================================================================= */

const catalog = new Map(); // id -> produit
const catalogByKey = new Map(); // clé de correspondance (singulier) -> produit
const catalogByNorm = new Map(); // nom normalisé exact -> produit

function buildCatalog() {
  catalog.clear();
  catalogByKey.clear();
  catalogByNorm.clear();
  const add = (p) => {
    const prod = { ...p, norm: normalize(p.name), key: matchKey(p.name) };
    if (!AISLE[prod.aisle]) prod.aisle = 'autre';
    catalog.set(prod.id, prod);
    catalogByKey.set(prod.key, prod);
    catalogByNorm.set(prod.norm, prod);
  };
  for (const [aisle, names] of Object.entries(PRODUCTS)) {
    for (const name of names) add({ id: slug(name), name, aisle });
  }
  for (const p of Object.values(store.getProducts())) {
    if (p && p.name) add({ id: p.id || slug(p.name), name: p.name, aisle: p.aisle, custom: true });
  }
}

const findProduct = (name) => catalogByNorm.get(normalize(name)) || catalogByKey.get(matchKey(name)) || null;

function searchCatalog(query) {
  const nq = normalize(query);
  if (!nq) return [];
  const kq = matchKey(query);
  const words = kq.split(' ');
  const results = [];
  for (const p of catalog.values()) {
    let score = -1;
    if (p.norm === nq) score = 0;
    else if (p.key === kq) score = 0.5;
    else if (p.norm.startsWith(nq) || p.key.startsWith(kq)) score = 1;
    else if (p.norm.split(' ').some((w) => w.startsWith(nq))) score = 2;
    else if (p.norm.includes(nq)) score = 3;
    else if (nq.length >= 3 && words.every((w) => p.key.includes(w))) score = 4;
    if (score >= 0) results.push({ p, score });
  }
  results.sort(
    (a, b) => a.score - b.score || a.p.name.length - b.p.name.length || a.p.name.localeCompare(b.p.name, 'fr')
  );
  return results.slice(0, 8).map((r) => r.p);
}

/** Devine un rayon à partir des mots déjà connus (« yaourt grec » → crèmerie). */
function guessAisle(name) {
  const tokens = matchKey(name).split(' ').filter((w) => w.length >= 4);
  if (!tokens.length) return null;
  const votes = {};
  for (const p of catalog.values()) {
    const words = p.key.split(' ');
    if (tokens.some((t) => words.includes(t))) votes[p.aisle] = (votes[p.aisle] || 0) + 1;
  }
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

function registerProduct(name, aisle, id = slug(name)) {
  const custom = store.getProducts();
  custom[id] = { id, name, aisle, updatedAt: Date.now() };
  store.saveProducts(custom);
  enqueue({
    op: 'set',
    path: ['products', id],
    data: { name, nameNorm: normalize(name), aisle, updatedAt: Date.now() },
    merge: true,
  });
  buildCatalog();
  return catalog.get(id);
}

function mergeRemoteProducts(remote) {
  const pending = store.pendingProductIds();
  const local = store.getProducts();
  const next = {};
  for (const p of remote) {
    if (p && typeof p.name === 'string') next[p.id] = { id: p.id, name: p.name, aisle: p.aisle, updatedAt: p.updatedAt || 0 };
  }
  for (const id of pending) if (local[id]) next[id] = local[id];
  store.saveProducts(next);
  buildCatalog();
}

/* =========================================================================
   État & listes
   ========================================================================= */

const state = {
  listId: null,
  items: {},
  unwatch: null,
  flashId: null,
  suggestions: [],
  activeIndex: -1,
  storeId: null, // magasin sélectionné pour l'estimation
  position: null, // dernière position connue de l'appareil (jamais envoyée au serveur)
  metaStoreIds: null, // magasins rattachés à la liste côté serveur (null = inconnu)
};
const storeWatchers = new Map();

function enqueue(op) {
  store.enqueue(op);
  sync.queueChanged();
}

const getList = (id = state.listId) => store.getLists().find((l) => l.id === id) || null;
const itemPath = (listId, itemId) => ['lists', listId, 'items', itemId];

function createList(name = 'Ma liste') {
  const list = { id: uid(20), name: tidy(name) || 'Ma liste', createdAt: Date.now() };
  store.upsertList(list);
  enqueue({
    op: 'set',
    path: ['lists', list.id],
    data: { name: list.name, createdAt: list.createdAt, updatedAt: Date.now() },
    merge: true,
  });
  return list;
}

function enqueueMeta(listId, patch) {
  const list = getList(listId);
  enqueue({
    op: 'set',
    path: ['lists', listId],
    data: { ...(list ? { name: list.name } : {}), ...patch, updatedAt: Date.now() },
    merge: true,
    combine: true,
  });
}

function openList(id, { propose = true } = {}) {
  if (state.unwatch) state.unwatch();
  state.unwatch = null;
  state.listId = id;
  state.items = store.getItems(id);
  state.metaStoreIds = null;
  state.storeId = initialStoreFor(id);
  store.setCurrentId(id);
  const url = new URL(location.href);
  url.search = `?list=${id}`;
  history.replaceState(null, '', url);
  render();
  attachWatchers();
  if (propose) proposeNearestStore();
}

function attachWatchers() {
  if (!sync.isReady() || !state.listId) return;
  if (state.unwatch) state.unwatch();
  const id = state.listId;
  state.unwatch = sync.watchList(id, {
    onItems: (remote) => {
      if (id === state.listId) mergeRemoteItems(remote);
    },
    onMeta: (meta) => {
      if (!meta || id !== state.listId) return;
      linkStoresWithList(id, Array.isArray(meta.storeIds) ? meta.storeIds : []);
      if (typeof meta.name !== 'string' || !meta.name || store.hasPending(['lists', id])) return;
      const list = getList(id);
      if (list && list.name !== meta.name) {
        store.upsertList({ ...list, name: meta.name });
        renderHeader();
      }
    },
  });
}

function fromRemote(r) {
  if (!r || typeof r.name !== 'string') return null;
  return {
    id: r.id,
    name: r.name,
    nameNorm: r.nameNorm || normalize(r.name),
    aisle: AISLE[r.aisle] ? r.aisle : 'autre',
    qty: typeof r.qty === 'number' || typeof r.qty === 'string' ? r.qty : 1,
    checked: !!r.checked,
    checkedAt: r.checkedAt || 0,
    createdAt: r.createdAt || 0,
    updatedAt: r.updatedAt || 0,
  };
}

function toRemote(i) {
  return {
    name: i.name,
    nameNorm: i.nameNorm || normalize(i.name),
    aisle: i.aisle,
    qty: i.qty,
    checked: !!i.checked,
    checkedAt: i.checkedAt || 0,
    createdAt: i.createdAt || Date.now(),
    updatedAt: i.updatedAt || Date.now(),
  };
}

/** Fusionne l'état serveur avec les modifications locales encore en attente. */
function mergeRemoteItems(remote) {
  const pending = store.pendingItemOps(state.listId);
  const next = {};
  for (const r of remote) {
    const it = fromRemote(r);
    if (it) next[it.id] = it;
  }
  for (const [id, op] of pending) {
    if (op.op === 'delete') delete next[id];
    else {
      const it = fromRemote({ id, ...op.data });
      if (it) next[id] = it;
    }
  }
  state.items = next;
  store.saveItems(state.listId, next);
  render();
}

/* =========================================================================
   Magasins & prix
   Un magasin : { id, name, lat, lng, prices: { [idProduit]: prixUnitaire|null } }
   Les magasins sont synchronisés dans Firestore (stores/{id}) et rattachés aux
   listes ouvertes (champ storeIds), si bien que les personnes avec qui une liste
   est partagée voient les mêmes magasins et les mêmes prix.
   Le magasin favori et la position de l'appareil restent sur l'appareil.
   ========================================================================= */

const sessionGet = (k) => {
  try { return sessionStorage.getItem(k); } catch { return null; }
};
const sessionSet = (k, v) => {
  try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* rien */ }
};

const storesMap = () => store.getStores();
const storeList = () =>
  Object.values(storesMap())
    .filter((s) => s && !s.loading && s.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
const getStore = (id) => {
  const s = id ? storesMap()[id] : null;
  return s && !s.loading ? s : null;
};
const currentStore = () => getStore(state.storeId);
const hasCoords = (s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lng);

function initialStoreFor(listId) {
  const chosen = sessionGet(`listme:store:${listId}`);
  if (chosen === 'none') return null;
  if (getStore(chosen)) return chosen;
  const fav = store.getFavStore();
  return getStore(fav) ? fav : null;
}

function selectStore(id) {
  state.storeId = getStore(id) ? id : null;
  sessionSet(`listme:store:${state.listId}`, state.storeId || 'none');
  render();
}

function storeRemote(s) {
  return {
    name: s.name,
    lat: hasCoords(s) ? s.lat : null,
    lng: hasCoords(s) ? s.lng : null,
    prices: s.prices || {},
    createdAt: s.createdAt || Date.now(),
    updatedAt: s.updatedAt || Date.now(),
  };
}

function saveStore(s) {
  const all = storesMap();
  const { loading, ...rest } = s;
  const next = { ...rest, updatedAt: Date.now() };
  all[next.id] = next;
  store.saveStores(all);
  // On envoie toujours le document complet (fusionné) : sûr même si la file
  // ne garde que la dernière opération par document.
  enqueue({ op: 'set', path: ['stores', next.id], data: storeRemote(next), merge: true });
  syncStoreWatchers();
  return next;
}

function createStore({ name, lat, lng }) {
  const s = saveStore({ id: uid(20), name, lat, lng, prices: {}, createdAt: Date.now() });
  if (state.metaStoreIds) linkStoresWithList(state.listId, state.metaStoreIds);
  return s;
}

function deleteStore(id) {
  const all = storesMap();
  delete all[id];
  store.saveStores(all);
  store.addDeadStore(id);
  enqueue({ op: 'delete', path: ['stores', id] });
  if (store.getFavStore() === id) store.setFavStore(null);
  if (state.storeId === id) selectStore(null);
  if (state.metaStoreIds?.includes(id)) {
    state.metaStoreIds = state.metaStoreIds.filter((x) => x !== id);
    enqueueMeta(state.listId, { storeIds: state.metaStoreIds });
  }
  syncStoreWatchers();
  render();
}

/** Récupère les magasins rattachés à la liste et y rattache les nôtres. */
function linkStoresWithList(listId, remoteIds) {
  const dead = new Set(store.getDeadStores());
  const all = storesMap();
  let changed = false;
  for (const id of remoteIds) {
    if (typeof id === 'string' && !dead.has(id) && !all[id]) {
      all[id] = { id, loading: true }; // chargé ensuite par syncStoreWatchers
      changed = true;
    }
  }
  if (changed) store.saveStores(all);
  const alive = remoteIds.filter((id) => !dead.has(id));
  const union = [...new Set([...alive, ...Object.keys(all)])].slice(0, 30);
  state.metaStoreIds = union;
  if (union.length !== remoteIds.length || union.some((id) => !remoteIds.includes(id))) {
    enqueueMeta(listId, { storeIds: union });
  }
  syncStoreWatchers();
}

function syncStoreWatchers() {
  if (!sync.isReady()) return;
  const ids = Object.keys(storesMap());
  for (const id of ids) {
    if (!storeWatchers.has(id)) storeWatchers.set(id, sync.watchDoc(['stores', id], (d) => onRemoteStore(id, d)));
  }
  for (const [id, unsub] of storeWatchers) {
    if (!ids.includes(id)) {
      unsub();
      storeWatchers.delete(id);
    }
  }
}

function onRemoteStore(id, data) {
  if (store.hasPending(['stores', id])) return;
  const all = storesMap();
  if (!data || typeof data.name !== 'string') {
    if (!all[id]) return;
    delete all[id];
    store.saveStores(all);
    store.addDeadStore(id);
    if (store.getFavStore() === id) store.setFavStore(null);
    if (state.storeId === id) state.storeId = null;
    syncStoreWatchers();
    render();
    return;
  }
  const wasLoading = !!all[id]?.loading;
  all[id] = {
    id,
    name: data.name,
    lat: Number.isFinite(data.lat) ? data.lat : null,
    lng: Number.isFinite(data.lng) ? data.lng : null,
    prices: data.prices && typeof data.prices === 'object' ? data.prices : {},
    createdAt: data.createdAt || 0,
    updatedAt: data.updatedAt || 0,
  };
  store.saveStores(all);
  if (wasLoading && !state.storeId && store.getFavStore() === id) state.storeId = id;
  render();
}

/* ---- Prix ---- */

const priceKey = (name) => findProduct(name)?.id || slug(name);

function priceOf(item, s = currentStore()) {
  const v = s?.prices?.[priceKey(item.name)];
  return typeof v === 'number' && v >= 0 ? v : null;
}

const lineTotal = (item, unit) => (typeof item.qty === 'number' ? unit * item.qty : unit);

function estimate() {
  const res = { total: 0, inCart: 0, missing: 0, priced: 0 };
  if (!currentStore()) return res;
  for (const it of Object.values(state.items)) {
    const p = priceOf(it);
    if (p == null) {
      res.missing += 1;
      continue;
    }
    const t = lineTotal(it, p);
    res.total += t;
    res.priced += 1;
    if (it.checked) res.inCart += t;
  }
  res.total = Math.round(res.total * 100) / 100;
  res.inCart = Math.round(res.inCart * 100) / 100;
  return res;
}

function setPrice(item, value) {
  const s = currentStore();
  if (!s) return;
  const prices = { ...(s.prices || {}) };
  prices[priceKey(item.name)] = value; // null = prix effacé
  saveStore({ ...s, prices });
  render();
}

/* ---- Géolocalisation ---- */

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const fmtDist = (km) => (km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`);

/** Accepte « 50.6292, 3.0573 », « 50,6292; 3,0573 » ou « 50,6292 3,0573 ». */
function parseCoords(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  let m = t.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) m = t.match(/^(-?\d{1,3}(?:,\d+)?)\s*[; ]\s*(-?\d{1,3}(?:,\d+)?)$/);
  if (!m) return undefined;
  const lat = Number(m[1].replace(',', '.'));
  const lng = Number(m[2].replace(',', '.'));
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

function getPosition(timeout = 10000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        state.position = { lat: p.coords.latitude, lng: p.coords.longitude };
        resolve(state.position);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout, maximumAge: 5 * 60 * 1000 }
    );
  });
}

/** À l'ouverture d'une liste : propose le magasin le plus proche s'il diffère du magasin choisi. */
async function proposeNearestStore() {
  const listId = state.listId;
  const located = storeList().filter(hasCoords);
  if (!located.length || !navigator.geolocation) return;
  const askedKey = `listme:geoAsked:${listId}`;
  if (sessionGet(askedKey)) return;
  sessionSet(askedKey, '1');

  const pos = await getPosition();
  if (!pos || listId !== state.listId) return;
  const ranked = located
    .map((s) => ({ s, d: distanceKm(pos, s) }))
    .sort((a, b) => a.d - b.d);
  const { s: nearest, d } = ranked[0];
  renderHeader();
  if (nearest.id === state.storeId) return;
  if (document.querySelector('dialog[open]')) return; // ne pas empiler sur une autre fenêtre

  const cur = currentStore();
  const fav = store.getFavStore();
  openSheet({
    title: 'Magasin le plus proche',
    body: `<p class="sheet-text">Vous êtes à <strong>${fmtDist(d)}</strong> de « <strong>${esc(nearest.name)}</strong> ». Utiliser ses prix pour estimer cette liste ?</p>
      <div class="stack">
        <button class="btn btn-primary" data-use>${ICON.pin} Choisir ${esc(nearest.name)}</button>
        <button class="btn btn-secondary" data-close>${cur ? `Garder ${esc(cur.name)}${cur.id === fav ? ' (favori)' : ''}` : 'Ne pas choisir de magasin'}</button>
      </div>`,
    onMount: ({ el, close }) =>
      el.querySelector('[data-use]').addEventListener('click', () => {
        close();
        selectStore(nearest.id);
        toast(`Prix de ${nearest.name}`);
      }),
  });
}

/* =========================================================================
   Articles
   ========================================================================= */

function putItem(item, listId = state.listId) {
  const next = { ...item, updatedAt: Date.now() };
  if (listId === state.listId) {
    state.items[next.id] = next;
    store.saveItems(listId, state.items);
  } else {
    const items = store.getItems(listId);
    items[next.id] = next;
    store.saveItems(listId, items);
  }
  store.enqueue({ op: 'set', path: itemPath(listId, next.id), data: toRemote(next) });
  sync.queueChanged();
  return next;
}

function addToList(product, qty = 1) {
  const norm = normalize(product.name);
  const existing = Object.values(state.items).find((i) => normalize(i.name) === norm);
  if (existing) {
    const next = { ...existing };
    if (existing.checked) {
      next.checked = false;
      next.checkedAt = 0;
      next.qty = qty;
    } else {
      next.qty = typeof existing.qty === 'number' && typeof qty === 'number' ? Math.round((existing.qty + qty) * 100) / 100 : qty;
    }
    return { item: putItem(next), merged: !existing.checked };
  }
  const item = {
    id: uid(16),
    name: product.name,
    nameNorm: normalize(product.name),
    aisle: product.aisle || 'autre',
    qty,
    checked: false,
    checkedAt: 0,
    createdAt: Date.now(),
  };
  return { item: putItem(item), merged: false };
}

function toggleItem(id) {
  const it = state.items[id];
  if (!it) return;
  putItem({ ...it, checked: !it.checked, checkedAt: it.checked ? 0 : Date.now() });
  render();
}

function changeQty(id, delta) {
  const it = state.items[id];
  if (!it) return;
  if (typeof it.qty !== 'number') return openEdit(id);
  const q = Math.round((it.qty + delta) * 100) / 100;
  if (q <= 0) return deleteItems([id], `${it.name} retiré de la liste`);
  putItem({ ...it, qty: q });
  render();
}

function deleteItems(ids, message) {
  const listId = state.listId;
  const removed = ids.map((id) => state.items[id]).filter(Boolean);
  if (!removed.length) return;
  for (const it of removed) {
    delete state.items[it.id];
    store.enqueue({ op: 'delete', path: itemPath(listId, it.id) });
  }
  store.saveItems(listId, state.items);
  sync.queueChanged();
  render();
  if (message) {
    toast(message, {
      action: 'Annuler',
      onAction: () => {
        removed.forEach((it) => putItem(it, listId));
        if (listId === state.listId) render();
      },
    });
  }
}

/* =========================================================================
   Ajout depuis la barre de recherche
   ========================================================================= */

async function submitEntry(text, chosen = null) {
  const { name, qty } = parseEntry(text);
  if (!name) return;
  let product = chosen || findProduct(name);
  if (!product) {
    const clean = tidy(name);
    const aisle = await askAisle(clean);
    if (!aisle) {
      input.focus();
      return;
    }
    product = registerProduct(clean, aisle);
  }
  const { item, merged } = addToList(product, qty);
  state.flashId = item.id;
  setTimeout(() => {
    if (state.flashId === item.id) state.flashId = null;
  }, 1200);
  input.value = '';
  $('#q-clear').hidden = true;
  closeSuggestions();
  render();
  if (merged) toast(`${item.name} : quantité passée à ${fmtQty(item.qty)}`);
  input.focus();
}

/* =========================================================================
   Import par paramètres d'URL
   ?lait=2&pain&pommes+de+terre=1,5    ou    ?items=Lait:2;Pain;Œufs:12
   ========================================================================= */

function readUrlParams() {
  const params = new URLSearchParams(location.search);
  const entries = [];
  for (const [k, v] of params) {
    if (k === 'items' || k === 'add') {
      for (const part of v.split(/[;,\n]/)) {
        const m = part.trim().match(/^(.+?)(?:\s*[:=*]\s*([^:=*]+))?$/);
        if (m && m[1].trim()) entries.push({ name: m[1].trim(), qty: parseQty(m[2]) });
      }
    } else if (!RESERVED_PARAMS.has(k) && !k.startsWith('utm_') && k.trim()) {
      entries.push({ name: k.trim(), qty: parseQty(v) });
    }
  }
  return { listId: params.get('list'), name: params.get('name'), entries };
}

async function importEntries(entries) {
  const unknown = entries.filter((e) => !findProduct(e.name));
  let remaining = unknown.length;
  for (const e of entries) {
    let product = findProduct(e.name);
    if (!product) {
      remaining -= 1;
      const clean = tidy(e.name);
      const aisle = await askAisle(clean, { importing: true, remaining });
      product = registerProduct(clean, aisle || 'autre');
    }
    addToList(product, e.qty);
  }
  render();
  toast(`${plural(entries.length, 'article ajouté', 'articles ajoutés')} depuis le lien`);
}

/* =========================================================================
   Rendu
   ========================================================================= */

const $ = (sel, el = document) => el.querySelector(sel);
const listEl = $('#list');
const input = $('#q');
const suggestEl = $('#suggest');

function render() {
  renderHeader();
  renderList();
}

function renderHeader() {
  const list = getList();
  $('#list-name').textContent = list ? list.name : 'Ma liste';
  document.title = list ? `${list.name} · ListMe` : 'ListMe';
  const items = Object.values(state.items);
  const done = items.filter((i) => i.checked).length;
  const total = items.length;
  $('#progress-fill').style.width = total ? `${(done / total) * 100}%` : '0';
  $('#progress-text').textContent = total ? `${done} / ${total}` : 'Liste vide';
  $('#progress').classList.toggle('is-complete', total > 0 && done === total);

  const s = currentStore();
  const fav = store.getFavStore();
  $('#store-name').textContent = s ? s.name : storeList().length ? 'Choisir un magasin' : 'Ajouter un magasin';
  $('#btn-store').classList.toggle('is-empty', !s);
  $('#store-fav').toggleAttribute('hidden', !s || s.id !== fav);
  const est = $('#estimate');
  if (s && total) {
    const e = estimate();
    est.hidden = false;
    est.textContent = e.priced ? `≈ ${money(e.total)}` : 'Prix à saisir';
    est.classList.toggle('is-partial', e.priced > 0 && e.missing > 0);
    est.setAttribute(
      'aria-label',
      e.priced
        ? `Estimation ${money(e.total)}${e.missing ? `, ${plural(e.missing, 'article', 'articles')} sans prix` : ''}`
        : 'Aucun prix saisi pour ce magasin'
    );
  } else {
    est.hidden = true;
  }
}

function explainEstimate() {
  const s = currentStore();
  if (!s) return openStores();
  const e = estimate();
  if (!e.priced) return toast(`Touchez « + prix » sur un article pour saisir son prix chez ${s.name}.`);
  let msg = `Estimation chez ${s.name} : ${money(e.total)}`;
  if (e.inCart) msg += `, dont ${money(e.inCart)} déjà au caddie`;
  msg += '.';
  if (e.missing) msg += ` ${plural(e.missing, 'article', 'articles')} sans prix.`;
  toast(msg);
}

function qtyControls(it) {
  if (typeof it.qty !== 'number') {
    return `<button class="qty-text" data-action="edit" aria-label="Modifier la quantité de ${esc(it.name)}">${esc(it.qty)}</button>`;
  }
  const decLabel = it.qty <= 1 ? `Retirer ${esc(it.name)}` : `Un ${esc(it.name)} de moins`;
  return `<div class="qty">
      <button data-action="dec" aria-label="${decLabel}">${it.qty <= 1 ? ICON.trash : ICON.minus}</button>
      <span class="qty-val">${fmtQty(it.qty)}</span>
      <button data-action="inc" aria-label="Un ${esc(it.name)} de plus">${ICON.plus}</button>
    </div>`;
}

function priceChip(it) {
  if (!currentStore()) return '';
  const p = priceOf(it);
  if (p == null) {
    return `<button class="price-chip is-empty" data-action="price" aria-label="Saisir le prix de ${esc(it.name)}">+ prix</button>`;
  }
  return `<button class="price-chip" data-action="price" aria-label="Prix de ${esc(it.name)} : ${money(lineTotal(it, p))}, modifier">${money(lineTotal(it, p))}</button>`;
}

function donePrice(it) {
  if (!currentStore()) return '';
  const p = priceOf(it);
  return p == null ? '' : `<span class="done-price">${money(lineTotal(it, p))}</span>`;
}

function itemRow(it, done) {
  const a = aisleOf(it.aisle);
  const flash = it.id === state.flashId ? ' is-flash' : '';
  const qtyBadge =
    typeof it.qty === 'number' ? (it.qty !== 1 ? `×${fmtQty(it.qty)}` : '') : esc(it.qty);
  return `<li class="item${flash}" data-id="${esc(it.id)}" style="--aisle:${a.color}">
      <button class="item-main" data-action="toggle" aria-pressed="${done}">
        <span class="check">${ICON.check}</span>
        <span class="item-name">${esc(it.name)}</span>
        ${done && qtyBadge ? `<span class="done-qty">${qtyBadge}</span>` : ''}
        ${done ? donePrice(it) : ''}
      </button>
      ${done ? '' : priceChip(it)}
      ${done ? '' : qtyControls(it)}
    </li>`;
}

function renderList() {
  const items = Object.values(state.items);
  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked).sort((a, b) => (b.checkedAt || 0) - (a.checkedAt || 0));

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">
        <div class="empty-mark" aria-hidden="true">🛒</div>
        <h2>Liste vide</h2>
        <p>Cherchez un produit dans la barre ci-dessus pour l’ajouter. Tapez « 2 baguettes » pour indiquer la quantité.</p>
      </div>`;
    return;
  }

  const groups = new Map();
  for (const it of todo) {
    const a = aisleOf(it.aisle);
    if (!groups.has(a.id)) groups.set(a.id, []);
    groups.get(a.id).push(it);
  }
  const ordered = [...groups.entries()].sort((x, y) => aisleOf(x[0]).order - aisleOf(y[0]).order);

  let html = '';
  if (!todo.length) {
    html += `<div class="all-done"><strong>Tout est dans le caddie.</strong> Retirez les articles cochés pour repartir d’une liste propre.</div>`;
  }
  for (const [aisleId, list] of ordered) {
    const a = aisleOf(aisleId);
    list.sort((x, y) => x.name.localeCompare(y.name, 'fr'));
    html += `<section class="group" aria-label="${esc(a.name)}">
        <h2 class="group-head" style="--aisle:${a.color}"><span class="group-emoji" aria-hidden="true">${a.emoji}</span>${esc(a.name)}<span class="count">${list.length}</span></h2>
        <ul class="items">${list.map((it) => itemRow(it, false)).join('')}</ul>
      </section>`;
  }
  if (done.length) {
    html += `<section class="done" aria-label="Dans le caddie">
        <div class="done-head">
          <h2>Dans le caddie <span class="count">${done.length}</span></h2>
          <button class="text-btn" data-action="clear-checked">Retirer les cochés</button>
        </div>
        <ul class="items">${done.map((it) => itemRow(it, true)).join('')}</ul>
      </section>`;
  }
  html += `<div class="list-actions">
      <button class="text-btn danger" data-action="clear-all">${ICON.trash} Vider la liste</button>
    </div>
    <p class="hint">Appui long sur un article pour changer sa quantité ou son rayon.</p>`;
  listEl.innerHTML = html;
}

const STATUS = {
  connecting: { label: () => 'Connexion…', text: 'Connexion au serveur en cours.' },
  synced: { label: () => 'À jour', text: 'Tout est enregistré et partagé en direct.' },
  syncing: { label: () => 'Envoi…', text: 'Envoi des modifications en cours.' },
  pending: {
    label: (n) => `${n} en attente`,
    text: 'Des modifications attendent d’être envoyées. Nouvel essai automatique.',
  },
  offline: {
    label: (n) => (n ? `Hors ligne (${n})` : 'Hors ligne'),
    text: 'Pas de réseau. Vos coches sont gardées sur ce téléphone et seront envoyées dès le retour du réseau.',
  },
  local: {
    label: () => 'Local',
    text: 'Serveur injoignable. La liste fonctionne sur ce téléphone et se synchronisera plus tard.',
  },
};

function renderStatus(s) {
  const el = $('#sync-status');
  const def = STATUS[s.state] || STATUS.connecting;
  el.dataset.state = s.state;
  el.textContent = def.label(s.pending);
  el.setAttribute('aria-label', `Synchronisation : ${def.label(s.pending)}`);
}

/* =========================================================================
   Autocomplétion
   ========================================================================= */

function inListLabel(product) {
  const norm = normalize(product.name);
  const it = Object.values(state.items).find((i) => normalize(i.name) === norm);
  if (!it) return '';
  if (it.checked) return '<span class="s-badge is-done">déjà au caddie</span>';
  return `<span class="s-badge">dans la liste${typeof it.qty === 'number' ? ` ×${fmtQty(it.qty)}` : ''}</span>`;
}

function updateSuggestions() {
  const { name } = parseEntry(input.value);
  $('#q-clear').hidden = !input.value;
  if (!name) return closeSuggestions();
  const results = searchCatalog(name);
  const exact = !!findProduct(name);
  state.suggestions = results.map((p) => ({ type: 'product', product: p }));
  if (!exact && name.length >= 2) state.suggestions.push({ type: 'new', name: tidy(name) });
  state.activeIndex = -1;
  if (!state.suggestions.length) return closeSuggestions();
  // Le premier produit qui commence par la saisie est présélectionné : Entrée l'ajoute.
  const first = results[0];
  const nq = normalize(name);
  const preselect = first && (first.norm.startsWith(nq) || first.key.startsWith(matchKey(name)));

  suggestEl.innerHTML = state.suggestions
    .map((s, i) => {
      if (s.type === 'new') {
        return `<li role="option" id="opt-${i}" data-index="${i}" class="s-new" aria-selected="false">
            <span class="s-emoji" aria-hidden="true">＋</span>
            <span class="s-text"><span class="s-name">Ajouter « ${esc(s.name)} »</span><span class="s-aisle">Nouveau produit, choix du rayon ensuite</span></span>
          </li>`;
      }
      const a = aisleOf(s.product.aisle);
      return `<li role="option" id="opt-${i}" data-index="${i}" aria-selected="false">
          <span class="s-emoji" aria-hidden="true">${a.emoji}</span>
          <span class="s-text"><span class="s-name">${esc(s.product.name)}</span><span class="s-aisle">${esc(a.name)}</span></span>
          ${inListLabel(s.product)}
        </li>`;
    })
    .join('');
  suggestEl.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  if (preselect) setActive(0);
}

function closeSuggestions() {
  suggestEl.hidden = true;
  suggestEl.innerHTML = '';
  state.suggestions = [];
  state.activeIndex = -1;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function setActive(i) {
  const n = state.suggestions.length;
  if (!n) return;
  state.activeIndex = (i + n) % n;
  suggestEl.querySelectorAll('[role=option]').forEach((li, idx) => {
    li.setAttribute('aria-selected', String(idx === state.activeIndex));
    if (idx === state.activeIndex) li.scrollIntoView({ block: 'nearest' });
  });
  input.setAttribute('aria-activedescendant', `opt-${state.activeIndex}`);
}

function pickSuggestion(i) {
  const s = state.suggestions[i];
  if (!s) return;
  if (s.type === 'new') submitEntry(input.value, null);
  else submitEntry(input.value, s.product);
}

/* =========================================================================
   Feuilles (dialogues) & toasts
   ========================================================================= */

function openSheet({ title, body, onMount }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.innerHTML = `<div class="sheet-inner">
      <header class="sheet-head"><h2>${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Fermer">${ICON.x}</button></header>
      <div class="sheet-body">${body}</div>
    </div>`;
  document.body.append(dlg);
  let result = null;
  let resolve;
  const done = new Promise((r) => (resolve = r));
  dlg.addEventListener('close', () => {
    dlg.remove();
    resolve(result);
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  });
  const api = {
    el: dlg,
    done,
    close(value = null) {
      result = value;
      if (dlg.open) dlg.close();
    },
  };
  dlg.showModal();
  onMount?.(api);
  return api;
}

function aisleChips(selected, suggested) {
  return `<div class="aisle-grid">${AISLES.map(
    (a) => `<button type="button" class="aisle-chip${a.id === suggested ? ' is-suggested' : ''}" data-aisle="${a.id}" aria-pressed="${a.id === selected}" style="--c:${a.color}">
        <span aria-hidden="true">${a.emoji}</span>${esc(a.name)}</button>`
  ).join('')}</div>`;
}

function askAisle(name, { importing = false, remaining = 0 } = {}) {
  const suggested = guessAisle(name);
  const body = `<p class="sheet-text">« <strong>${esc(name)}</strong> » n’est pas encore dans le catalogue. Dans quel rayon le trouve-t-on ? Il sera proposé directement la prochaine fois.</p>
    ${aisleChips(null, suggested)}
    ${importing ? `<p class="sheet-note">${remaining ? `Encore ${plural(remaining, 'produit', 'produits')} à classer après celui-ci. ` : ''}Fermer cette fenêtre range le produit dans « Autre ».</p>` : ''}`;
  return openSheet({
    title: 'Nouveau produit',
    body,
    onMount: ({ el, close }) => {
      el.querySelectorAll('[data-aisle]').forEach((b) => b.addEventListener('click', () => close(b.dataset.aisle)));
      (el.querySelector('.is-suggested') || el.querySelector('[data-aisle]'))?.focus();
    },
  }).done;
}

function promptSheet(title, value = '', cta = 'Enregistrer') {
  return openSheet({
    title,
    body: `<form class="stack" data-form>
        <input class="text" name="v" maxlength="60" value="${esc(value)}" placeholder="Nom de la liste" required autocomplete="off">
        <button class="btn btn-primary" type="submit">${esc(cta)}</button>
      </form>`,
    onMount: ({ el, close }) => {
      const form = el.querySelector('[data-form]');
      setTimeout(() => {
        form.v.focus();
        form.v.select();
      }, 30);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = form.v.value.trim();
        if (v) close(v);
      });
    },
  }).done;
}

function confirmSheet(title, text, cta) {
  return openSheet({
    title,
    body: `<p class="sheet-text">${esc(text)}</p>
      <div class="stack">
        <button class="btn btn-danger" data-yes>${esc(cta)}</button>
        <button class="btn btn-secondary" data-close>Annuler</button>
      </div>`,
    onMount: ({ el, close }) => el.querySelector('[data-yes]').addEventListener('click', () => close(true)),
  }).done.then((v) => v === true);
}

let toastTimer = null;
function toast(message, { action, onAction } = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  el.hidden = false;
  if (action) {
    el.querySelector('button').addEventListener('click', () => {
      el.hidden = true;
      onAction?.();
    });
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? 5500 : 3000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/* =========================================================================
   Écrans secondaires
   ========================================================================= */

function baseUrl() {
  return `${location.origin}${location.pathname}`;
}

function openShare() {
  const list = getList();
  if (!list) return;
  const shareUrl = `${baseUrl()}?list=${list.id}`;
  const todo = Object.values(state.items).filter((i) => !i.checked);
  const importUrl = todo.length
    ? `${baseUrl()}?items=${encodeURIComponent(todo.map((i) => (i.qty === 1 ? i.name : `${i.name}:${i.qty}`)).join(';'))}`
    : '';
  openSheet({
    title: 'Partager la liste',
    body: `<p class="sheet-text">Toute personne qui ouvre ce lien voit la liste et la modifie en direct avec vous.</p>
      <div class="copy-field"><input class="text" readonly value="${esc(shareUrl)}" aria-label="Lien de partage">
        <button class="icon-btn" data-copy="${esc(shareUrl)}" aria-label="Copier le lien">${ICON.copy}</button></div>
      <div class="stack">
        ${navigator.share ? `<button class="btn btn-primary" data-native>${ICON.share} Envoyer le lien</button>` : `<button class="btn btn-primary" data-copy="${esc(shareUrl)}">${ICON.copy} Copier le lien</button>`}
      </div>
      ${importUrl ? `<details class="more">
        <summary>${ICON.link} Lien d’ajout des articles</summary>
        <p class="sheet-note">Ce lien ajoute les ${plural(todo.length, 'article restant', 'articles restants')} à la liste de la personne qui l’ouvre, sans partager celle-ci.</p>
        <div class="copy-field"><input class="text" readonly value="${esc(importUrl)}" aria-label="Lien d’ajout">
          <button class="icon-btn" data-copy="${esc(importUrl)}" aria-label="Copier le lien d’ajout">${ICON.copy}</button></div>
      </details>` : ''}`,
    onMount: ({ el }) => {
      el.addEventListener('click', async (e) => {
        const copyBtn = e.target.closest('[data-copy]');
        if (copyBtn) {
          toast((await copyText(copyBtn.dataset.copy)) ? 'Lien copié' : 'Copie impossible, sélectionnez le lien');
        }
        if (e.target.closest('[data-native]')) {
          try {
            await navigator.share({ title: `ListMe : ${list.name}`, text: `Ma liste de courses « ${list.name} »`, url: shareUrl });
          } catch { /* partage annulé */ }
        }
      });
      el.querySelectorAll('input[readonly]').forEach((i) => i.addEventListener('focus', () => i.select()));
    },
  });
}

function openLists() {
  const rows = store
    .getLists()
    .map((l) => {
      const items = l.id === state.listId ? state.items : store.getItems(l.id);
      const left = Object.values(items).filter((i) => !i.checked).length;
      return `<li class="list-row${l.id === state.listId ? ' is-current' : ''}">
          <button class="list-open" data-open="${esc(l.id)}" ${l.id === state.listId ? 'aria-current="true"' : ''}>
            <span class="list-row-name">${esc(l.name)}</span>
            <small>${left ? `${left} à acheter` : 'Rien à acheter'}</small>
          </button>
          <button class="icon-btn" data-rename="${esc(l.id)}" aria-label="Renommer ${esc(l.name)}">${ICON.edit}</button>
          <button class="icon-btn" data-forget="${esc(l.id)}" aria-label="Retirer ${esc(l.name)} de cet appareil">${ICON.trash}</button>
        </li>`;
    })
    .join('');
  openSheet({
    title: 'Mes listes',
    body: `<ul class="lists">${rows}</ul>
      <div class="stack"><button class="btn btn-primary" data-new>${ICON.plus} Nouvelle liste</button></div>`,
    onMount: ({ el, close }) => {
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.open) {
          close();
          openList(b.dataset.open);
        } else if (b.dataset.rename) {
          close();
          renameList(b.dataset.rename);
        } else if (b.dataset.forget) {
          close();
          forgetList(b.dataset.forget);
        } else if ('new' in b.dataset) {
          close();
          const name = await promptSheet('Nouvelle liste', '', 'Créer la liste');
          if (name) openList(createList(name).id);
        }
      });
    },
  });
}

async function renameList(id) {
  const list = getList(id);
  if (!list) return;
  const name = await promptSheet('Renommer la liste', list.name, 'Renommer');
  if (!name || tidy(name) === list.name) return;
  const clean = tidy(name);
  store.upsertList({ ...list, name: clean });
  enqueueMeta(id, { name: clean });
  renderHeader();
}

async function forgetList(id) {
  const list = getList(id);
  if (!list) return;
  const ok = await confirmSheet(
    'Retirer cette liste ?',
    `« ${list.name} » sera retirée de cet appareil. Elle reste accessible à toute personne qui possède son lien.`,
    'Retirer de cet appareil'
  );
  if (!ok) return;
  store.removeList(id);
  if (id === state.listId) {
    const next = store.getLists()[0] || createList('Ma liste');
    openList(next.id);
  }
  toast('Liste retirée de cet appareil');
}

function openStores() {
  const fav = store.getFavStore();
  const pos = state.position;
  const rows = storeList()
    .map((s) => {
      const dist = pos && hasCoords(s) ? `à ${fmtDist(distanceKm(pos, s))}` : hasCoords(s) ? 'Position enregistrée' : 'Sans position GPS';
      const nPrices = Object.values(s.prices || {}).filter((v) => typeof v === 'number').length;
      const isFav = s.id === fav;
      return `<li class="list-row${s.id === state.storeId ? ' is-current' : ''}">
          <button class="list-open" data-select="${esc(s.id)}" ${s.id === state.storeId ? 'aria-current="true"' : ''}>
            <span class="list-row-name">${esc(s.name)}</span>
            <small>${dist}, ${plural(nPrices, 'prix', 'prix')}</small>
          </button>
          <button class="icon-btn fav-btn${isFav ? ' is-fav' : ''}" data-fav="${esc(s.id)}" aria-pressed="${isFav}" aria-label="${isFav ? 'Retirer le favori' : `Définir ${esc(s.name)} comme favori`}">${isFav ? ICON.starFill : ICON.star}</button>
          <button class="icon-btn" data-edit-store="${esc(s.id)}" aria-label="Modifier ${esc(s.name)}">${ICON.edit}</button>
        </li>`;
    })
    .join('');
  const empty = `<p class="sheet-text">Enregistrez vos magasins avec leur position GPS : vous pourrez y saisir les prix et estimer le coût de la liste avant d’y aller.</p>`;
  openSheet({
    title: 'Magasins',
    body: `${rows ? `<ul class="lists">${rows}
        <li class="list-row${!state.storeId ? ' is-current' : ''}"><button class="list-open" data-select=""><span class="list-row-name">Aucun magasin</span><small>Pas d’estimation de prix</small></button></li>
      </ul>
      <p class="sheet-note">L’étoile désigne le magasin favori, choisi par défaut à l’ouverture d’une liste.</p>` : empty}
      <div class="stack"><button class="btn btn-primary" data-new-store>${ICON.plus} Ajouter un magasin</button></div>`,
    onMount: ({ el, close }) => {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.select !== undefined) {
          close();
          selectStore(b.dataset.select || null);
        } else if (b.dataset.fav) {
          const id = b.dataset.fav;
          store.setFavStore(store.getFavStore() === id ? null : id);
          close();
          openStores();
          renderHeader();
        } else if (b.dataset.editStore) {
          close();
          openStoreForm(b.dataset.editStore);
        } else if ('newStore' in b.dataset) {
          close();
          openStoreForm(null);
        }
      });
    },
  });
}

function openStoreForm(id) {
  const s = id ? getStore(id) : null;
  const isFav = s ? store.getFavStore() === s.id : !store.getFavStore();
  const coords = s && hasCoords(s) ? `${s.lat}, ${s.lng}` : '';
  openSheet({
    title: s ? 'Modifier le magasin' : 'Nouveau magasin',
    body: `<form class="stack" data-form novalidate>
        <label class="field"><span>Nom</span>
          <input class="text" name="name" maxlength="60" value="${esc(s?.name || '')}" placeholder="Ex. Carrefour Euralille" autocomplete="off" required></label>
        <div class="field"><label for="store-coords"><span>Position GPS</span></label>
          <div class="copy-field">
            <input class="text" id="store-coords" name="coords" value="${esc(coords)}" placeholder="50.6366, 3.0699" autocomplete="off" inputmode="decimal">
            <button class="icon-btn" type="button" data-locate aria-label="Utiliser ma position actuelle">${ICON.locate}</button>
          </div>
          <small class="field-help">Touchez la cible quand vous êtes dans le magasin, ou collez les coordonnées copiées depuis une carte (appui long sur le lieu).</small>
          <small class="field-error" data-error hidden></small>
        </div>
        <label class="toggle"><input type="checkbox" name="fav" ${isFav ? 'checked' : ''}> <span>Magasin favori (choisi par défaut)</span></label>
        <button class="btn btn-primary" type="submit">${s ? 'Enregistrer' : 'Ajouter le magasin'}</button>
        ${s ? `<button class="btn btn-secondary is-danger" type="button" data-delete>${ICON.trash} Supprimer le magasin</button>` : ''}
      </form>`,
    onMount: ({ el, close }) => {
      const form = el.querySelector('[data-form]');
      const error = el.querySelector('[data-error]');
      const showError = (msg) => {
        error.textContent = msg;
        error.hidden = !msg;
      };
      if (!s) setTimeout(() => form.elements.name.focus(), 30);
      el.querySelector('[data-locate]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        showError('');
        const pos = await getPosition(15000);
        btn.disabled = false;
        if (pos) form.coords.value = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        else showError('Position indisponible. Autorisez la localisation pour ce site ou saisissez les coordonnées.');
      });
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        const ok = await confirmSheet(
          'Supprimer ce magasin ?',
          `« ${s.name} » et ses prix seront supprimés, y compris pour les personnes avec qui vos listes sont partagées.`,
          'Supprimer le magasin'
        );
        if (ok) {
          deleteStore(s.id);
          toast('Magasin supprimé');
        }
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = tidy(form.elements.name.value);
        if (!name) return showError('Indiquez le nom du magasin.');
        const c = parseCoords(form.coords.value);
        if (c === undefined) return showError('Coordonnées non reconnues. Format attendu : 50.6366, 3.0699');
        const saved = s
          ? saveStore({ ...s, name, lat: c ? c.lat : null, lng: c ? c.lng : null })
          : createStore({ name, lat: c ? c.lat : null, lng: c ? c.lng : null });
        const fav = store.getFavStore();
        if (form.fav.checked) store.setFavStore(saved.id);
        else if (fav === saved.id) store.setFavStore(null);
        close();
        if (!s) selectStore(saved.id);
        else render();
        toast(s ? 'Magasin enregistré' : `${saved.name} ajouté`);
      });
    },
  });
}

function openPrice(id) {
  const it = state.items[id];
  const s = currentStore();
  if (!it || !s) return;
  const p = priceOf(it, s);
  const multi = typeof it.qty === 'number' && it.qty !== 1;
  openSheet({
    title: it.name,
    body: `<p class="sheet-text">Prix unitaire chez <strong>${esc(s.name)}</strong>. Il sera réutilisé pour les prochaines listes.</p>
      <form class="stack" data-form>
        <div class="price-field">
          <input class="text" name="price" inputmode="decimal" value="${p != null ? fmtPrice(p) : ''}" placeholder="0,00" autocomplete="off" aria-label="Prix unitaire en euros">
          <span aria-hidden="true">€</span>
        </div>
        ${multi ? `<p class="sheet-note" data-total></p>` : ''}
        <small class="field-error" data-error hidden></small>
        <button class="btn btn-primary" type="submit">Enregistrer le prix</button>
        ${p != null ? `<button class="btn btn-secondary is-danger" type="button" data-clear>Effacer le prix</button>` : ''}
      </form>`,
    onMount: ({ el, close }) => {
      const form = el.querySelector('[data-form]');
      const totalEl = el.querySelector('[data-total]');
      const error = el.querySelector('[data-error]');
      const updateTotal = () => {
        if (!totalEl) return;
        const v = parsePrice(form.price.value);
        totalEl.textContent = Number.isFinite(v) && v != null ? `${fmtQty(it.qty)} × ${money(v)} = ${money(v * it.qty)}` : `Quantité : ${fmtQty(it.qty)}`;
      };
      updateTotal();
      form.price.addEventListener('input', updateTotal);
      setTimeout(() => {
        form.price.focus();
        form.price.select();
      }, 30);
      el.querySelector('[data-clear]')?.addEventListener('click', () => {
        setPrice(it, null);
        close();
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = parsePrice(form.price.value);
        if (Number.isNaN(v)) {
          error.textContent = 'Saisissez un montant, par exemple 2,49.';
          error.hidden = false;
          return;
        }
        setPrice(it, v);
        close();
      });
    },
  });
}

function openEdit(id) {
  const it = state.items[id];
  if (!it) return;
  let aisle = it.aisle;
  openSheet({
    title: it.name,
    body: `<form class="stack" data-form>
        <label class="field"><span>Quantité</span>
          <input class="text" name="qty" value="${esc(fmtQty(it.qty))}" maxlength="20" autocomplete="off" placeholder="1, 2, 500 g…"></label>
        ${currentStore() ? `<label class="field"><span>Prix unitaire chez ${esc(currentStore().name)}</span>
          <div class="price-field"><input class="text" name="price" inputmode="decimal" value="${priceOf(it) != null ? fmtPrice(priceOf(it)) : ''}" placeholder="0,00" autocomplete="off"><span aria-hidden="true">€</span></div></label>` : ''}
        <div class="field"><span>Rayon</span>${aisleChips(aisle, null)}</div>
        <button class="btn btn-primary" type="submit">Enregistrer</button>
        <button class="btn btn-secondary is-danger" type="button" data-delete>${ICON.trash} Supprimer l’article</button>
      </form>`,
    onMount: ({ el, close }) => {
      const chips = el.querySelectorAll('[data-aisle]');
      chips.forEach((b) =>
        b.addEventListener('click', () => {
          aisle = b.dataset.aisle;
          chips.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        })
      );
      el.querySelector('[data-delete]').addEventListener('click', () => {
        close();
        deleteItems([id], `${it.name} supprimé`);
      });
      el.querySelector('[data-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        const cur = state.items[id];
        if (!cur) return close();
        putItem({ ...cur, qty: parseQty(e.target.qty.value), aisle });
        if (e.target.price && currentStore()) {
          const v = parsePrice(e.target.price.value);
          if (!Number.isNaN(v) && v !== priceOf(cur)) setPrice(cur, v);
        }
        if (aisle !== cur.aisle) {
          const p = findProduct(cur.name);
          registerProduct(p ? p.name : cur.name, aisle, p ? p.id : slug(cur.name));
        }
        render();
        close();
      });
    },
  });
}

/* =========================================================================
   Événements
   ========================================================================= */

function bindEvents() {
  const form = $('#add-form');
  input.addEventListener('input', updateSuggestions);
  input.addEventListener('focus', () => input.value && updateSuggestions());
  input.addEventListener('blur', () => setTimeout(closeSuggestions, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(state.activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(state.activeIndex - 1);
    } else if (e.key === 'Escape') {
      closeSuggestions();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.activeIndex >= 0) pickSuggestion(state.activeIndex);
    else submitEntry(input.value);
  });
  $('#q-clear').addEventListener('click', () => {
    input.value = '';
    closeSuggestions();
    $('#q-clear').hidden = true;
    input.focus();
  });
  // pointerdown + preventDefault : le champ garde le focus, le clavier reste ouvert.
  suggestEl.addEventListener('pointerdown', (e) => e.preventDefault());
  suggestEl.addEventListener('click', (e) => {
    const li = e.target.closest('[data-index]');
    if (li) pickSuggestion(Number(li.dataset.index));
  });

  $('#btn-share').addEventListener('click', openShare);
  $('#btn-lists').addEventListener('click', openLists);
  $('#btn-store').addEventListener('click', openStores);
  $('#estimate').addEventListener('click', explainEstimate);
  $('#sync-status').addEventListener('click', () => {
    const s = sync.status();
    if (s.state === 'local' && navigator.onLine) {
      toast(STATUS.local.text, { action: 'Recharger', onAction: () => location.reload() });
    } else {
      toast((STATUS[s.state] || STATUS.connecting).text);
    }
    sync.flush();
  });

  // Liste : délégation + appui long pour modifier.
  let pressTimer = null;
  let pressStart = null;
  let suppressClick = false;
  listEl.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.item');
    suppressClick = false;
    if (!row || e.target.closest('.qty, .price-chip')) return;
    pressStart = { x: e.clientX, y: e.clientY };
    pressTimer = setTimeout(() => {
      suppressClick = true;
      navigator.vibrate?.(15);
      openEdit(row.dataset.id);
    }, 550);
  });
  const cancelPress = () => clearTimeout(pressTimer);
  listEl.addEventListener('pointerup', cancelPress);
  listEl.addEventListener('pointercancel', cancelPress);
  listEl.addEventListener('pointermove', (e) => {
    if (pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) cancelPress();
  });
  listEl.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.item')) e.preventDefault();
  });

  listEl.addEventListener('click', async (e) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const row = btn.closest('.item');
    const id = row?.dataset.id;
    switch (btn.dataset.action) {
      case 'toggle': {
        if (row.classList.contains('is-leaving')) return;
        row.classList.add('is-leaving');
        navigator.vibrate?.(8);
        setTimeout(() => toggleItem(id), reducedMotion ? 0 : 200);
        break;
      }
      case 'inc':
        changeQty(id, 1);
        break;
      case 'dec':
        changeQty(id, -1);
        break;
      case 'edit':
        openEdit(id);
        break;
      case 'price':
        openPrice(id);
        break;
      case 'clear-checked': {
        const ids = Object.values(state.items).filter((i) => i.checked).map((i) => i.id);
        deleteItems(ids, `${plural(ids.length, 'article coché retiré', 'articles cochés retirés')}`);
        break;
      }
      case 'clear-all': {
        const ids = Object.keys(state.items);
        if (!ids.length) return;
        const ok = await confirmSheet(
          'Vider la liste ?',
          `Les ${plural(ids.length, 'article', 'articles')} seront supprimés pour toutes les personnes qui partagent la liste.`,
          'Tout supprimer'
        );
        if (ok) deleteItems(ids, 'Liste vidée');
        break;
      }
    }
  });
}

/* =========================================================================
   Démarrage
   ========================================================================= */

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[ListMe] Service worker non enregistré', e));
  }
}

async function boot() {
  buildCatalog();
  bindEvents();
  registerServiceWorker();
  sync.onStatus(renderStatus);

  const { listId, name, entries } = readUrlParams();
  let id = null;

  if (listId && /^[A-Za-z0-9_-]{8,64}$/.test(listId)) {
    // Liste partagée : on l'ajoute localement sans écraser son nom côté serveur.
    if (!getList(listId)) store.upsertList({ id: listId, name: name ? tidy(name) : 'Liste partagée', createdAt: Date.now() });
    id = listId;
  } else if (name && entries.length) {
    id = createList(name).id;
  } else {
    id = store.getCurrentId();
    if (!getList(id)) id = store.getLists()[0]?.id || createList('Ma liste').id;
  }
  openList(id, { propose: false });

  if (entries.length) await importEntries(entries);

  sync.onReady(() => {
    attachWatchers();
    syncStoreWatchers();
    sync.watchProducts(mergeRemoteProducts);
  });
  sync.initSync();
  proposeNearestStore();
}

boot();
