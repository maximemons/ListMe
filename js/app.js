import { store } from './store.js';
import * as sync from './sync.js';
import { AISLES, PRODUCTS } from './products-data.js';

/* =========================================================================
   Constantes & icônes
   ========================================================================= */

const AISLE = Object.fromEntries(AISLES.map((a, i) => [a.id, { ...a, order: i }]));
const aisleOf = (id) => AISLE[id] || AISLE.autre;
const RESERVED_PARAMS = new Set(['list', 'name', 'items', 'add', 'space', 'fbclid', 'gclid']);
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
  // Poids ou volume : « 500 g de farine », « 1,5 kg pommes », « lait 1 l »
  const unit = '(kg|g|mg|l|dl|cl|ml)';
  let w = name.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*${unit}\\.?\\s+(?:de |d['’])?(.+)$`, 'i'));
  if (w) return { name: w[3], qty: `${w[1].replace('.', ',')} ${w[2].toLowerCase()}` };
  w = name.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*${unit}\\.?$`, 'i'));
  if (w) return { name: w[1], qty: `${w[2].replace('.', ',')} ${w[3].toLowerCase()}` };
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
  const pending = store.pendingProductOps();
  const local = store.getProducts();
  const next = {};
  for (const p of remote) {
    if (p && typeof p.name === 'string') next[p.id] = { id: p.id, name: p.name, aisle: p.aisle, updatedAt: p.updatedAt || 0 };
  }
  for (const [id, op] of pending) {
    if (op.op === 'delete') delete next[id];
    else if (local[id]) next[id] = local[id];
  }
  store.saveProducts(next);
  buildCatalog();
}

/** Retire un produit ajouté par un utilisateur (les produits du catalogue de base restent). */
function removeCustomProduct(id) {
  const custom = store.getProducts();
  if (!custom[id]) return;
  delete custom[id];
  store.saveProducts(custom);
  enqueue({ op: 'delete', path: ['products', id] });
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

function createList(name = 'Ma liste', { auto = false } = {}) {
  const list = { id: uid(20), name: tidy(name) || 'Ma liste', createdAt: Date.now(), ...(auto ? { auto: true } : {}) };
  store.upsertList(list);
  if (!auto) pushSpace();
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
  hideWelcome();
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
  pushSpace();
  return s;
}

function deleteStore(id) {
  const all = storesMap();
  delete all[id];
  store.saveStores(all);
  store.addDeadStore(id);
  enqueue({ op: 'delete', path: ['stores', id] });
  if (store.getFavStore() === id) store.setFavStore(null);
  pushSpace({ withFav: true });
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
  if (changed) {
    store.saveStores(all);
    pushSpace();
  }
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

/* ---- Quantités au poids / volume ---- */

const UNIT_BASE = { kg: ['g', 1000], g: ['g', 1], mg: ['g', 0.001], l: ['ml', 1000], dl: ['ml', 100], cl: ['ml', 10], ml: ['ml', 1] };
const MEASURE_RE = /^(\d+(?:[.,]\d+)?)\s*(kg|g|mg|l|dl|cl|ml)\.?$/i;
const frNum = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

/** « 60 g », « 1,5 kg », « 250 g + 1 » → { base: 'g'|'ml', value } ou null. */
function parseMeasure(q) {
  if (typeof q !== 'string') return null;
  let base = null;
  let value = 0;
  for (const part of q.split('+')) {
    const m = part.trim().match(MEASURE_RE);
    if (!m) continue;
    const [b, f] = UNIT_BASE[m[2].toLowerCase()];
    if (base && base !== b) continue;
    base = b;
    value += parseFloat(m[1].replace(',', '.')) * f;
  }
  return base ? { base, value } : null;
}

function formatMeasure(value, base) {
  if (base === 'g') return value >= 1000 ? `${frNum(value / 1000)} kg` : `${frNum(Math.ceil(value))} g`;
  if (value >= 1000) return `${frNum(value / 1000)} l`;
  if (value >= 10 && value % 10 === 0) return `${frNum(value / 10)} cl`;
  return `${frNum(value)} ml`;
}

/** Additionne deux quantités : 2 + 1, « 60 g » + « 200 g ». Sinon la nouvelle remplace l'ancienne. */
function combineQty(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.round((a + b) * 100) / 100;
  const ma = parseMeasure(a);
  const mb = parseMeasure(b);
  if (ma && mb && ma.base === mb.base) return formatMeasure(ma.value + mb.value, ma.base);
  return b;
}

/* ---- Prix ----
   Un prix enregistré pour un produit dans un magasin peut être :
   - un nombre (ancien format) : prix à l'unité ;
   - { p, m: 'unit' }          : prix à l'unité ;
   - { p, m: 'pack', a, u }    : prix d'un paquet de a grammes (u = 'g') ou millilitres (u = 'ml') ;
   - { p, m: 'bulk', a, u }    : prix au poids (vrac), p pour a g ou ml (a = 1000 : prix au kg / au litre). */

function priceEntry(item, s = currentStore()) {
  const v = s?.prices?.[priceKey(item.name)];
  if (typeof v === 'number' && v >= 0) return { p: v, m: 'unit' };
  if (!v || typeof v !== 'object' || typeof v.p !== 'number' || v.p < 0) return null;
  const m = v.m === 'pack' || v.m === 'bulk' ? v.m : 'unit';
  const a = Number(v.a) > 0 ? Number(v.a) : 0;
  if (m !== 'unit' && !a) return { p: v.p, m: 'unit' };
  return { p: v.p, m, a, u: v.u === 'ml' ? 'ml' : 'g' };
}

/** Coût d'une ligne : { cost, buy } où buy décrit ce qu'il faut acheter (« 1 × 1 kg »). */
function lineCost(item, e) {
  if (!e) return null;
  const n = typeof item.qty === 'number' ? item.qty : 1;
  if (e.m === 'unit') return { cost: e.p * n, buy: '' };
  const need = parseMeasure(item.qty);
  const fits = need && need.base === e.u;
  if (e.m === 'pack') {
    const count = fits ? Math.max(1, Math.ceil(need.value / e.a - 1e-9)) : n;
    return { cost: e.p * count, buy: `${frNum(count)} × ${formatMeasure(e.a, e.u)}` };
  }
  const amount = fits ? need.value : e.a * n;
  return { cost: (e.p * amount) / e.a, buy: fits ? '' : formatMeasure(amount, e.u) };
}

const perRef = (e) => `${money((e.p / e.a) * 1000)}/${e.u === 'ml' ? 'l' : 'kg'}`;

function estimate() {
  const res = { total: 0, inCart: 0, missing: 0, priced: 0 };
  if (!currentStore()) return res;
  for (const it of Object.values(state.items)) {
    const c = lineCost(it, priceEntry(it));
    if (!c) {
      res.missing += 1;
      continue;
    }
    res.total += c.cost;
    res.priced += 1;
    if (it.checked) res.inCart += c.cost;
  }
  res.total = Math.round(res.total * 100) / 100;
  res.inCart = Math.round(res.inCart * 100) / 100;
  return res;
}

function setPrice(item, entry) {
  const s = currentStore();
  if (!s) return;
  const prices = { ...(s.prices || {}) };
  prices[priceKey(item.name)] = entry; // null = prix effacé
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
  if (!listId) return;
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
   Espace personnel : retrouver ses listes, magasins et favori sur tous ses appareils
   Document spaces/{id} : { lists: {idListe: nom|null}, stores: {idMagasin: true|null}, favStore }
   (null = supprimé). Chaque appareil possède un espace ; ouvrir le lien
   « ?space=ID » sur un autre appareil le rattache au même espace.
   ========================================================================= */

const SPACE_RE = /^[A-Za-z0-9_-]{16,64}$/;
let unwatchSpace = null;

function spaceId() {
  let id = store.getSpaceId();
  if (!id) {
    id = uid(24);
    store.setSpaceId(id);
    pushSpace({ withFav: true });
    queueMicrotask(watchSpace);
  }
  return id;
}

const isAutoEmpty = (l) => l.auto && !Object.keys(l.id === state.listId ? state.items : store.getItems(l.id)).length;

function spaceData({ withFav = false } = {}) {
  const lists = {};
  for (const l of store.getLists()) if (!isAutoEmpty(l)) lists[l.id] = l.name;
  for (const id of store.getDeadLists()) if (!(id in lists)) lists[id] = null;
  const stores = {};
  for (const id of Object.keys(storesMap())) stores[id] = true;
  for (const id of store.getDeadStores()) if (!(id in stores)) stores[id] = null;
  const data = { lists, stores, updatedAt: Date.now() };
  if (withFav) data.favStore = store.getFavStore() || null;
  return data;
}

/** Envoie l'état complet de l'appareil (fusionné côté serveur, sans effacer les ajouts des autres appareils). */
function pushSpace(opts) {
  enqueue({ op: 'set', path: ['spaces', spaceId()], data: spaceData(opts), merge: true, combine: true });
}

function setFavorite(id) {
  store.setFavStore(id || null);
  pushSpace({ withFav: true });
}

function watchSpace() {
  if (!sync.isReady() || !store.getSpaceId()) return;
  unwatchSpace?.();
  const sid = spaceId();
  unwatchSpace = sync.watchDoc(['spaces', sid], (data) => {
    if (sid === store.getSpaceId()) onRemoteSpace(sid, data);
  });
}

function onRemoteSpace(sid, data) {
  if (store.hasPending(['spaces', sid])) return; // nos modifications partent d'abord
  if (!data) return pushSpace({ withFav: true });

  let needPush = false;
  let changed = false;
  const remoteLists = data.lists && typeof data.lists === 'object' ? data.lists : {};
  const deadLists = new Set(store.getDeadLists());
  let currentRemoved = false;

  for (const [id, name] of Object.entries(remoteLists)) {
    const local = getList(id);
    if (name === null) {
      if (local) {
        store.removeList(id);
        if (id === state.listId) currentRemoved = true;
        changed = true;
      }
      store.addDeadList(id);
    } else if (typeof name === 'string' && !local) {
      if (deadLists.has(id)) needPush = true; // supprimée ici : notre suppression l'emporte
      else {
        store.upsertList({ id, name, createdAt: Date.now() });
        changed = true;
      }
    }
  }
  for (const l of store.getLists()) if (!(l.id in remoteLists) && !isAutoEmpty(l)) needPush = true;

  const remoteStores = data.stores && typeof data.stores === 'object' ? data.stores : {};
  const deadStores = new Set(store.getDeadStores());
  const all = storesMap();
  for (const [id, alive] of Object.entries(remoteStores)) {
    if (alive === null) {
      if (all[id]) {
        delete all[id];
        if (store.getFavStore() === id) store.setFavStore(null);
        if (state.storeId === id) state.storeId = null;
        changed = true;
      }
      store.addDeadStore(id);
    } else if (!all[id]) {
      if (deadStores.has(id)) needPush = true;
      else {
        all[id] = { id, loading: true };
        changed = true;
      }
    }
  }
  store.saveStores(all);
  for (const id of Object.keys(all)) if (!(id in remoteStores)) needPush = true;

  if ('favStore' in data) {
    const fav = typeof data.favStore === 'string' && all[data.favStore] ? data.favStore : null;
    if (fav !== store.getFavStore()) {
      store.setFavStore(fav);
      if (!state.storeId && fav && !sessionGet(`listme:store:${state.listId}`)) state.storeId = fav;
      changed = true;
    }
  } else if (store.getFavStore()) {
    pushSpace({ withFav: true });
  }

  if (needPush) pushSpace();
  if (currentRemoved || !state.listId) {
    // Liste courante retirée ailleurs, ou appareil sur l'écran d'accueil qui récupère ses listes.
    const next = store.getLists()[0];
    if (next) openList(next.id, { propose: !currentRemoved });
    else if (currentRemoved) showWelcome({ message: 'Cette liste a été retirée de vos appareils.' });
  } else if (changed) {
    render();
  }
  syncStoreWatchers();
}

function joinSpace(id) {
  if (!SPACE_RE.test(id) || id === store.getSpaceId()) return false;
  store.setSpaceId(id);
  pushSpace(); // ajoute ce que l'appareil possède déjà, sans toucher au favori de l'espace
  watchSpace();
  return true;
}

function spaceUrl() {
  return `${baseUrl()}?space=${spaceId()}`;
}

function openDevices() {
  const url = spaceUrl();
  openSheet({
    title: 'Mes appareils',
    body: `<p class="sheet-text">Ouvrez ce lien sur votre autre téléphone ou ordinateur : vos listes, vos magasins, leurs prix et votre magasin favori y seront synchronisés.</p>
      <div class="copy-field"><input class="text" readonly value="${esc(url)}" aria-label="Lien de synchronisation">
        <button class="icon-btn" data-copy="${esc(url)}" aria-label="Copier le lien">${ICON.copy}</button></div>
      <div class="stack">
        ${navigator.share ? `<button class="btn btn-primary" data-native>${ICON.share} Envoyer le lien</button>` : `<button class="btn btn-primary" data-copy="${esc(url)}">${ICON.copy} Copier le lien</button>`}
      </div>
      <p class="sheet-note">Ce lien donne accès à toutes vos listes et vos magasins : gardez-le pour vous et votre foyer. Pour partager une seule liste, utilisez le bouton de partage de la liste.</p>
      <details class="more">
        <summary>${ICON.link} J’ai un lien venant d’un autre appareil</summary>
        <form class="stack" data-join novalidate>
          <input class="text" name="link" placeholder="https://…/?space=…" autocomplete="off" aria-label="Lien de synchronisation de l’autre appareil">
          <small class="field-error" data-error hidden></small>
          <button class="btn btn-secondary" type="submit">Synchroniser cet appareil</button>
        </form>
      </details>`,
    onMount: ({ el, close }) => {
      el.addEventListener('click', async (e) => {
        const copyBtn = e.target.closest('[data-copy]');
        if (copyBtn) toast((await copyText(copyBtn.dataset.copy)) ? 'Lien copié' : 'Copie impossible, sélectionnez le lien');
        if (e.target.closest('[data-native]')) {
          try {
            await navigator.share({ title: 'ListMe : mes appareils', url });
          } catch { /* partage annulé */ }
        }
      });
      el.querySelector('[data-join]').addEventListener('submit', (e) => {
        e.preventDefault();
        const raw = e.target.elements.link.value.trim();
        let id = raw;
        try {
          id = new URL(raw).searchParams.get('space') || '';
        } catch { /* identifiant collé seul */ }
        const err = el.querySelector('[data-error]');
        if (!SPACE_RE.test(id)) {
          err.textContent = 'Lien non reconnu. Copiez-le depuis « Mes appareils » sur l’autre appareil.';
          err.hidden = false;
          return;
        }
        if (id === store.getSpaceId()) {
          err.textContent = 'Cet appareil est déjà synchronisé avec ce lien.';
          err.hidden = false;
          return;
        }
        joinSpace(id);
        close();
        toast('Appareil synchronisé. Vos listes et magasins arrivent.');
      });
      el.querySelectorAll('input[readonly]').forEach((i) => i.addEventListener('focus', () => i.select()));
    },
  });
}

/* =========================================================================
   Accueil : rejoindre une liste avec son code, ou en créer une nouvelle.
   Affiché quand l'appareil n'a aucune liste : plus de liste vide créée d'office.
   ========================================================================= */

const LIST_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const fmtCode = (id) => id.replace(/(.{4})(?=.)/g, '$1 ');

/** Lien ou code saisi → { listId } ou { spaceId } ou { error }. */
function parseJoinInput(raw) {
  const t = (raw || '').trim();
  if (!t) return {};
  try {
    const url = new URL(t);
    const list = url.searchParams.get('list');
    const space = url.searchParams.get('space');
    if (list && LIST_ID_RE.test(list)) return { listId: list };
    if (space && SPACE_RE.test(space)) return { spaceId: space };
    return { error: 'Ce lien ne contient pas de code de liste. Copiez-le depuis le bouton de partage de la liste.' };
  } catch {
    const code = t.replace(/[\s.]/g, '');
    if (LIST_ID_RE.test(code)) return { listId: code };
    return { error: 'Code non reconnu. Il se trouve dans le bouton de partage de la liste (20 caractères).' };
  }
}

/** true / false si le serveur répond, null si impossible de vérifier (hors ligne). */
async function checkListExists(id) {
  if (!navigator.onLine) return null;
  await sync.initSync();
  if (!sync.isReady()) return null;
  return new Promise((resolve) => {
    let done = false;
    let unsub = () => {};
    const finish = (v) => {
      if (done) return;
      done = true;
      setTimeout(() => unsub(), 0);
      resolve(v);
    };
    unsub = sync.watchDoc(['lists', id], (d) => finish(!!d));
    setTimeout(() => finish(null), 6000);
  });
}

function joinList(id) {
  if (!getList(id)) store.upsertList({ id, name: 'Liste partagée', createdAt: Date.now() });
  store.removeDeadList(id);
  pushSpace();
  openList(id);
}

let welcomeTimer = null;

function showWelcome({ message = '' } = {}) {
  if (state.unwatch) state.unwatch();
  state.unwatch = null;
  state.listId = null;
  state.items = {};
  store.setCurrentId(null);
  history.replaceState(null, '', location.pathname);
  render();

  const el = $('#welcome');
  el.innerHTML = `<div class="welcome-card">
      <div class="welcome-mark" aria-hidden="true">${ICON.check}</div>
      <h1 id="welcome-title">ListMe</h1>
      <p class="welcome-lead">${esc(message || 'Rejoignez une liste existante avec son code, ou commencez une nouvelle liste.')}</p>
      <form class="stack" data-welcome novalidate>
        <label class="field"><span>Code ou lien de la liste</span>
          <input class="text" name="code" placeholder="Ex. AbCd EfGh IjKl MnOp QrSt" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <small class="field-help">Le code s’obtient avec le bouton de partage de la liste. Laissez vide pour créer une nouvelle liste.</small>
        <small class="field-error" data-error hidden></small>
        <button class="btn btn-primary" type="submit" data-submit>Créer une nouvelle liste</button>
      </form>
      <details class="more welcome-more">
        <summary>${ICON.link} J’utilise déjà ListMe sur un autre appareil</summary>
        <p class="sheet-note">Sur l’autre appareil : « Mes listes », puis « Retrouver sur un autre appareil ». Collez ici le lien obtenu pour récupérer toutes vos listes et vos magasins.</p>
        <form class="stack" data-space novalidate>
          <input class="text" name="link" placeholder="https://…/?space=…" autocomplete="off" aria-label="Lien de vos autres appareils">
          <small class="field-error" data-space-error hidden></small>
          <button class="btn btn-secondary" type="submit">Récupérer mes listes</button>
        </form>
      </details>
    </div>`;
  el.hidden = false;
  document.body.classList.add('has-welcome');

  const form = el.querySelector('[data-welcome]');
  const input = form.elements.code;
  const submit = form.querySelector('[data-submit]');
  const error = form.querySelector('[data-error]');
  const showError = (msg) => {
    error.textContent = msg;
    error.hidden = !msg;
  };
  input.addEventListener('input', () => {
    showError('');
    submit.textContent = input.value.trim() ? 'Rejoindre la liste' : 'Créer une nouvelle liste';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = parseJoinInput(input.value);
    if (res.error) return showError(res.error);
    if (res.spaceId) return startSpaceJoin(el, res.spaceId);
    if (!res.listId) {
      openList(createList('Ma liste').id);
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Recherche de la liste…';
    const exists = await checkListExists(res.listId);
    submit.disabled = false;
    submit.textContent = 'Rejoindre la liste';
    if (exists === false) return showError('Aucune liste ne correspond à ce code. Vérifiez les majuscules et minuscules.');
    joinList(res.listId);
    if (exists === null) toast('Liste ajoutée. Son contenu s’affichera dès le retour du réseau.');
  });

  el.querySelector('[data-space]').addEventListener('submit', (e) => {
    e.preventDefault();
    const res = parseJoinInput(e.target.elements.link.value);
    const err = el.querySelector('[data-space-error]');
    const id = res.spaceId;
    if (!id) {
      err.textContent = res.listId
        ? 'C’est un lien de liste : collez-le dans le champ du haut.'
        : 'Lien non reconnu. Copiez-le depuis « Retrouver sur un autre appareil ».';
      err.hidden = false;
      return;
    }
    startSpaceJoin(el, id);
  });
}

function startSpaceJoin(el, id) {
  const err = el.querySelector('[data-space-error]') || el.querySelector('[data-error]');
  if (!navigator.onLine) {
    err.textContent = 'Une connexion est nécessaire pour récupérer vos listes.';
    err.hidden = false;
    return;
  }
  if (id !== store.getSpaceId()) joinSpace(id);
  else watchSpace();
  el.querySelector('.welcome-card').classList.add('is-waiting');
  el.querySelector('.welcome-lead').textContent = 'Récupération de vos listes et magasins…';
  clearTimeout(welcomeTimer);
  welcomeTimer = setTimeout(() => {
    if (state.listId) return;
    el.querySelector('.welcome-card').classList.remove('is-waiting');
    el.querySelector('.welcome-lead').textContent = 'Aucune liste trouvée pour ce lien pour le moment. Vérifiez le lien ou créez une nouvelle liste.';
  }, 12000);
}

function hideWelcome() {
  clearTimeout(welcomeTimer);
  const el = $('#welcome');
  if (el && !el.hidden) {
    el.hidden = true;
    el.innerHTML = '';
  }
  document.body.classList.remove('has-welcome');
}

/* =========================================================================
   Articles
   ========================================================================= */

function putItem(item, listId = state.listId) {
  const next = { ...item, updatedAt: Date.now() };
  const list = getList(listId);
  if (list?.auto) {
    store.upsertList({ ...list, auto: false });
    queueMicrotask(() => pushSpace());
  }
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
      next.qty = combineQty(existing.qty, qty);
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
  return { listId: params.get('list'), name: params.get('name'), space: params.get('space'), entries };
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
  const c = lineCost(it, priceEntry(it));
  if (!c) {
    return `<button class="price-chip is-empty" data-action="price" aria-label="Saisir le prix de ${esc(it.name)}">+ prix</button>`;
  }
  return `<button class="price-chip" data-action="price" aria-label="Prix de ${esc(it.name)} : ${money(c.cost)}${c.buy ? `, ${c.buy}` : ''}, modifier">${money(c.cost)}</button>`;
}

function donePrice(it) {
  if (!currentStore()) return '';
  const c = lineCost(it, priceEntry(it));
  return c ? `<span class="done-price">${money(c.cost)}</span>` : '';
}

/** Ligne secondaire sous le nom : ce qu'il faut acheter pour un produit vendu en paquet. */
function buyHint(it) {
  if (!currentStore()) return '';
  const e = priceEntry(it);
  if (!e || e.m !== 'pack') return '';
  const c = lineCost(it, e);
  return c?.buy ? `<span class="item-sub">À acheter : ${esc(c.buy)}</span>` : '';
}

function itemRow(it, done) {
  const a = aisleOf(it.aisle);
  const flash = it.id === state.flashId ? ' is-flash' : '';
  const qtyBadge =
    typeof it.qty === 'number' ? (it.qty !== 1 ? `×${fmtQty(it.qty)}` : '') : esc(it.qty);
  return `<li class="item${flash}" data-id="${esc(it.id)}" style="--aisle:${a.color}">
      <button class="item-main" data-action="toggle" aria-pressed="${done}">
        <span class="check">${ICON.check}</span>
        <span class="item-text"><span class="item-name">${esc(it.name)}</span>${done ? '' : buyHint(it)}</span>
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
    <p class="hint">Appui long sur un article (clic droit sur ordinateur) pour le renommer, changer sa quantité ou son rayon.</p>`;
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
    body: `<p class="sheet-text">Toute personne qui ouvre ce lien, ou saisit le code de la liste à l’accueil de ListMe, la voit et la modifie en direct avec vous.</p>
      <div class="list-code">
        <span>Code de la liste</span>
        <strong>${esc(fmtCode(list.id))}</strong>
        <button class="icon-btn" data-copy="${esc(list.id)}" aria-label="Copier le code">${ICON.copy}</button>
      </div>
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
          const what = copyBtn.dataset.copy.startsWith('http') ? 'Lien copié' : 'Code copié';
          toast((await copyText(copyBtn.dataset.copy)) ? what : 'Copie impossible, sélectionnez le texte');
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
          <button class="icon-btn" data-forget="${esc(l.id)}" aria-label="Retirer ${esc(l.name)} de mes listes">${ICON.trash}</button>
        </li>`;
    })
    .join('');
  openSheet({
    title: 'Mes listes',
    body: `<ul class="lists">${rows}</ul>
      <div class="stack">
        <button class="btn btn-primary" data-new>${ICON.plus} Nouvelle liste</button>
        <button class="btn btn-secondary" data-devices>${ICON.link} Retrouver sur un autre appareil</button>
      </div>`,
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
        } else if ('devices' in b.dataset) {
          close();
          openDevices();
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
  store.upsertList({ ...getList(id), auto: false });
  pushSpace();
  renderHeader();
}

async function forgetList(id) {
  const list = getList(id);
  if (!list) return;
  const ok = await confirmSheet(
    'Retirer cette liste ?',
    `« ${list.name} » sera retirée de vos appareils. Elle reste accessible à toute personne qui possède son lien.`,
    'Retirer la liste'
  );
  if (!ok) return;
  store.removeList(id);
  store.addDeadList(id);
  pushSpace();
  if (id === state.listId) {
    const next = store.getLists()[0];
    if (next) openList(next.id);
    else showWelcome();
  }
  toast('Liste retirée de vos appareils');
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
  const empty = `<p class="sheet-text">Enregistrez vos magasins avec leur position GPS : vous pourrez y saisir les prix et estimer le coût de la liste avant d’y aller.</p>
    <p class="sheet-note">Vos magasins sont déjà enregistrés sur un autre appareil ? <button class="link-btn" type="button" data-devices>Synchroniser cet appareil</button></p>`;
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
          setFavorite(store.getFavStore() === id ? null : id);
          close();
          openStores();
          renderHeader();
        } else if (b.dataset.editStore) {
          close();
          openStoreForm(b.dataset.editStore);
        } else if ('devices' in b.dataset) {
          close();
          openDevices();
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
        if (form.fav.checked) {
          if (fav !== saved.id) setFavorite(saved.id);
        } else if (fav === saved.id) setFavorite(null);
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
  const existing = priceEntry(it, s);
  const need = parseMeasure(it.qty);
  const base = existing?.u || need?.base || 'g';
  // Valeurs par défaut : paquet de 1 kg (ou 1 l) quand la liste demande un poids ou un volume.
  let mode = existing?.m || (need ? 'pack' : 'unit');
  const packUnit = base === 'ml' ? (existing?.a && existing.a < 1000 ? 'cl' : 'l') : existing?.a && existing.a < 1000 ? 'g' : 'kg';
  const packAmount = existing?.m === 'pack' ? (packUnit === 'kg' || packUnit === 'l' ? existing.a / 1000 : packUnit === 'cl' ? existing.a / 10 : existing.a) : 1;
  const unitOptions = (selected) =>
    ['g', 'kg', 'cl', 'l', 'ml'].map((u) => `<option value="${u}"${u === selected ? ' selected' : ''}>${u}</option>`).join('');
  const needText = need ? formatMeasure(need.value, need.base) : typeof it.qty === 'number' ? `${fmtQty(it.qty)}` : esc(it.qty);

  openSheet({
    title: it.name,
    body: `<p class="sheet-text">Prix chez <strong>${esc(s.name)}</strong>, réutilisé pour les prochaines listes. Quantité demandée : <strong>${needText}</strong>.</p>
      <form class="stack" data-form novalidate>
        <div class="segmented" role="radiogroup" aria-label="Mode de vente">
          <button type="button" role="radio" data-mode="unit">À l’unité</button>
          <button type="button" role="radio" data-mode="pack">En paquet</button>
          <button type="button" role="radio" data-mode="bulk">Au poids</button>
        </div>
        <div class="price-line">
          <div class="price-field">
            <input class="text" name="price" inputmode="decimal" value="${existing ? fmtPrice(existing.p) : ''}" placeholder="0,00" autocomplete="off" aria-label="Prix en euros">
            <span aria-hidden="true">€</span>
          </div>
          <div class="price-ref" data-show="pack">
            <span>le paquet de</span>
            <input class="text small" name="amount" inputmode="decimal" value="${frNum(packAmount)}" autocomplete="off" aria-label="Contenance du paquet">
            <select class="text small" name="unit" aria-label="Unité">${unitOptions(packUnit)}</select>
          </div>
          <div class="price-ref" data-show="bulk">
            <span>le</span>
            <select class="text small" name="bulkUnit" aria-label="Unité de prix">
              <option value="kg"${base !== 'ml' ? ' selected' : ''}>kilo</option>
              <option value="l"${base === 'ml' ? ' selected' : ''}>litre</option>
            </select>
          </div>
        </div>
        <p class="price-breakdown" data-breakdown aria-live="polite"></p>
        <small class="field-error" data-error hidden></small>
        <button class="btn btn-primary" type="submit">Enregistrer le prix</button>
        ${existing ? `<button class="btn btn-secondary is-danger" type="button" data-clear>Effacer le prix</button>` : ''}
      </form>`,
    onMount: ({ el, close }) => {
      const form = el.querySelector('[data-form]');
      const f = form.elements;
      const out = el.querySelector('[data-breakdown]');
      const error = el.querySelector('[data-error]');

      const readEntry = () => {
        const p = parsePrice(f.price.value);
        if (p == null || Number.isNaN(p)) return { error: 'Saisissez un montant, par exemple 1,29.' };
        if (mode === 'unit') return { p, m: 'unit' };
        if (mode === 'bulk') return { p, m: 'bulk', a: 1000, u: f.bulkUnit.value === 'l' ? 'ml' : 'g' };
        const amount = parsePrice(f.amount.value);
        if (!amount) return { error: 'Indiquez la contenance du paquet, par exemple 1 kg ou 500 g.' };
        const [u, factor] = UNIT_BASE[f.unit.value];
        return { p, m: 'pack', a: amount * factor, u };
      };

      const refresh = () => {
        el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
        el.querySelectorAll('[data-show]').forEach((x) => (x.hidden = x.dataset.show !== mode));
        const e = readEntry();
        if (e.error) {
          out.textContent = mode === 'pack' ? 'Prix du paquet et contenance : le nombre de paquets à acheter est calculé.' : '';
          return;
        }
        const c = lineCost(it, e);
        if (e.m === 'unit') {
          out.textContent = typeof it.qty === 'number' && it.qty !== 1 ? `${fmtQty(it.qty)} × ${money(e.p)} = ${money(c.cost)}` : `${money(c.cost)}`;
        } else if (e.m === 'pack') {
          const needs = need && need.base === e.u ? `${formatMeasure(need.value, need.base)} demandés : ` : '';
          out.textContent = `${needs}${c.buy} = ${money(c.cost)} (soit ${perRef(e)})`;
        } else {
          const amount = need && need.base === e.u ? formatMeasure(need.value, need.base) : c.buy;
          out.textContent = `${amount} à ${perRef(e)} = ${money(c.cost)}`;
        }
      };

      el.querySelectorAll('[data-mode]').forEach((b) =>
        b.addEventListener('click', () => {
          mode = b.dataset.mode;
          refresh();
        })
      );
      form.addEventListener('input', () => {
        error.hidden = true;
        refresh();
      });
      form.addEventListener('change', refresh);
      refresh();
      setTimeout(() => {
        f.price.focus();
        f.price.select();
      }, 30);

      el.querySelector('[data-clear]')?.addEventListener('click', () => {
        setPrice(it, null);
        close();
      });
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const e = readEntry();
        if (e.error) {
          error.textContent = e.error;
          error.hidden = false;
          return;
        }
        setPrice(it, e);
        close();
      });
    },
  });
}

function openEdit(id) {
  const it = state.items[id];
  if (!it) return;
  let aisle = it.aisle;
  let aisleTouched = false;
  const product = findProduct(it.name);
  const isCustom = !!product?.custom;
  openSheet({
    title: 'Modifier l’article',
    body: `<form class="stack" data-form novalidate>
        <label class="field"><span>Produit</span>
          <input class="text" name="itemName" value="${esc(it.name)}" maxlength="60" autocomplete="off" autocapitalize="sentences" required></label>
        ${isCustom ? `<label class="toggle" data-forget-row hidden><input type="checkbox" name="forget" checked>
          <span>Retirer « ${esc(it.name)} » des suggestions</span></label>` : ''}
        <label class="field"><span>Quantité</span>
          <input class="text" name="qty" value="${esc(fmtQty(it.qty))}" maxlength="20" autocomplete="off" placeholder="1, 2, 500 g…"></label>
        <div class="field"><span>Rayon</span>${aisleChips(aisle, null)}</div>
        <button class="btn btn-primary" type="submit">Enregistrer</button>
        <button class="btn btn-secondary is-danger" type="button" data-delete>${ICON.trash} Supprimer l’article</button>
      </form>`,
    onMount: ({ el, close }) => {
      const form = el.querySelector('[data-form]');
      const f = form.elements;
      const chips = el.querySelectorAll('[data-aisle]');
      const pressChip = (id2) => chips.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.aisle === id2)));
      chips.forEach((b) =>
        b.addEventListener('click', () => {
          aisle = b.dataset.aisle;
          aisleTouched = true;
          pressChip(aisle);
        })
      );
      // En renommant, le rayon suit le produit du catalogue (« Zeste de citron » → « Citron »).
      f.itemName.addEventListener('input', () => {
        const renamed = normalize(f.itemName.value) !== normalize(it.name);
        el.querySelector('[data-forget-row]')?.toggleAttribute('hidden', !renamed);
        const p = findProduct(f.itemName.value);
        if (p && !aisleTouched) {
          aisle = p.aisle;
          pressChip(aisle);
        }
      });
      el.querySelector('[data-delete]').addEventListener('click', () => {
        close();
        deleteItems([id], `${it.name} supprimé`);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const cur = state.items[id];
        if (!cur) return close();
        const qty = parseQty(f.qty.value);
        const typed = tidy(f.itemName.value) || cur.name;
        const renamed = normalize(typed) !== normalize(cur.name);

        if (!renamed) {
          putItem({ ...cur, qty, aisle });
          if (aisle !== cur.aisle) registerProduct(product ? product.name : cur.name, aisle, product ? product.id : slug(cur.name));
          render();
          return close();
        }

        const target = findProduct(typed);
        const newName = target ? target.name : typed;
        if (!target) registerProduct(newName, aisle);
        else if (aisleTouched && aisle !== target.aisle) registerProduct(target.name, aisle, target.id);
        if (isCustom && f.forget?.checked) removeCustomProduct(product.id);

        const other = Object.values(state.items).find((i) => i.id !== cur.id && normalize(i.name) === normalize(newName));
        if (other) {
          putItem({ ...other, qty: other.checked ? qty : combineQty(other.qty, qty), checked: false, checkedAt: 0, aisle });
          delete state.items[cur.id];
          store.saveItems(state.listId, state.items);
          enqueue({ op: 'delete', path: itemPath(state.listId, cur.id) });
          toast(`Regroupé avec ${other.name}`);
        } else {
          putItem({ ...cur, name: newName, nameNorm: normalize(newName), qty, aisle });
          toast(`Renommé en ${newName}`);
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
  let lastPointerType = 'mouse';
  listEl.addEventListener('pointerdown', (e) => {
    lastPointerType = e.pointerType;
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
    const row = e.target.closest('.item');
    if (!row) return;
    e.preventDefault();
    // Clic droit sur ordinateur (l'appui long sur mobile est géré plus haut).
    if (lastPointerType === 'mouse' && !e.target.closest('.qty, .price-chip')) openEdit(row.dataset.id);
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

  const { listId, name, space, entries } = readUrlParams();
  let id = null;
  const joined = space ? joinSpace(space) : false;
  if (store.getLists().length || Object.keys(storesMap()).length) spaceId();

  if (listId && /^[A-Za-z0-9_-]{8,64}$/.test(listId)) {
    // Liste partagée : on l'ajoute localement sans écraser son nom côté serveur.
    if (!getList(listId)) {
      store.upsertList({ id: listId, name: name ? tidy(name) : 'Liste partagée', createdAt: Date.now() });
      store.removeDeadList(listId);
      pushSpace();
    }
    id = listId;
  } else if (name && entries.length) {
    id = createList(name).id;
  } else {
    id = store.getCurrentId();
    if (!getList(id)) id = store.getLists()[0]?.id || null;
    // Un lien d'ajout sans liste sur un appareil neuf : la liste aura du contenu, on la crée.
    if (!id && entries.length) id = createList('Ma liste').id;
  }
  if (id) openList(id, { propose: false });
  else showWelcome();
  if (!id && joined) startSpaceJoin($('#welcome'), store.getSpaceId());

  if (entries.length) await importEntries(entries);

  if (joined) toast('Appareil synchronisé. Vos listes et magasins arrivent.');

  sync.onReady(() => {
    attachWatchers();
    watchSpace();
    syncStoreWatchers();
    sync.watchProducts(mergeRemoteProducts);
  });
  sync.initSync();
  proposeNearestStore();
}

boot();
