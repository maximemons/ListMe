// Synchronisation avec Firestore.
// Firebase est chargé dynamiquement : si le chargement échoue (pas de réseau,
// CDN injoignable), l'application continue de fonctionner en local et la file
// d'attente sera envoyée plus tard.
import { store } from './store.js';

const FS_URL = 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
const COMMIT_TIMEOUT = 15000;
const RETRY_EVERY = 20000;
const FATAL_CODES = new Set(['permission-denied', 'invalid-argument', 'failed-precondition', 'not-found']);

let db = null;
let fs = null;
let initDone = false;
let initPromise = null;
let flushing = false;
let flushTimer = null;
const statusListeners = new Set();
const readyListeners = new Set();

export function isReady() {
  return !!db;
}

export function status() {
  const pending = store.getQueue().length;
  if (!navigator.onLine) return { state: 'offline', pending };
  if (!initDone) return { state: 'connecting', pending };
  if (!db) return { state: 'local', pending };
  if (pending) return { state: flushing ? 'syncing' : 'pending', pending };
  return { state: 'synced', pending: 0 };
}

export function onStatus(fn) {
  statusListeners.add(fn);
  fn(status());
}

export function onReady(fn) {
  readyListeners.add(fn);
  if (db) fn();
}

function notify() {
  const s = status();
  statusListeners.forEach((fn) => fn(s));
}

export function initSync() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const cfg = await import('./firebase-config.js');
      fs = await import(FS_URL);
      db = cfg.db;
    } catch (e) {
      console.warn('[ListMe] Firebase indisponible, fonctionnement local', e);
      db = null;
      initPromise = null; // nouvel essai possible au retour du réseau
    }
    initDone = true;
    notify();
    if (db) {
      readyListeners.forEach((fn) => fn());
      flush();
    }
    return !!db;
  })();
  return initPromise;
}

window.addEventListener('online', () => {
  notify();
  if (!db) initSync();
  else flush();
});
window.addEventListener('offline', notify);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') flush();
});
setInterval(() => flush(), RETRY_EVERY);

/** À appeler après chaque ajout dans la file : met à jour le statut et planifie un envoi. */
export function queueChanged() {
  notify();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 250);
}

const ref = (path) => fs.doc(db, ...path);

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function applyToBatch(batch, op) {
  if (op.op === 'delete') batch.delete(ref(op.path));
  else batch.set(ref(op.path), op.data, { merge: !!op.merge });
}

export async function flush() {
  if (!db || flushing || !navigator.onLine) {
    notify();
    return;
  }
  flushing = true;
  notify();
  try {
    let queue = store.getQueue();
    while (queue.length) {
      const chunk = queue.slice(0, 400);
      try {
        const batch = fs.writeBatch(db);
        chunk.forEach((op) => applyToBatch(batch, op));
        await withTimeout(batch.commit(), COMMIT_TIMEOUT);
        store.ack(chunk);
      } catch (e) {
        if (!FATAL_CODES.has(e?.code)) throw e;
        // Une opération est refusée : on les envoie une par une et on écarte les fautives.
        for (const op of chunk) {
          try {
            const b = fs.writeBatch(db);
            applyToBatch(b, op);
            await withTimeout(b.commit(), COMMIT_TIMEOUT);
          } catch (err) {
            if (!FATAL_CODES.has(err?.code)) throw err;
            console.warn('[ListMe] Opération refusée par le serveur, ignorée', op, err);
          }
          store.ack([op]);
        }
      }
      queue = store.getQueue();
    }
  } catch (e) {
    console.info('[ListMe] Synchronisation reportée', e?.message || e);
  } finally {
    flushing = false;
    notify();
  }
}

/** Écoute en direct une liste. Les instantanés issus du cache sont ignorés :
    le localStorage fait foi tant que le serveur n'a pas répondu. */
export function watchList(listId, { onItems, onMeta }) {
  if (!db) return () => {};
  const unsubItems = fs.onSnapshot(
    fs.collection(db, 'lists', listId, 'items'),
    (snap) => {
      if (snap.metadata.fromCache) return;
      onItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (err) => console.warn('[ListMe] Écoute de la liste interrompue', err)
  );
  const unsubMeta = fs.onSnapshot(
    fs.doc(db, 'lists', listId),
    (snap) => {
      if (snap.metadata.fromCache) return;
      onMeta(snap.exists() ? snap.data() : null);
    },
    (err) => console.warn('[ListMe] Écoute des infos de liste interrompue', err)
  );
  return () => {
    unsubItems();
    unsubMeta();
  };
}

export function watchProducts(onProducts) {
  if (!db) return () => {};
  return fs.onSnapshot(
    fs.collection(db, 'products'),
    (snap) => {
      if (snap.metadata.fromCache) return;
      onProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (err) => console.warn('[ListMe] Écoute du catalogue interrompue', err)
  );
}

/** Écoute un document (magasins). `null` si le document n'existe pas côté serveur. */
export function watchDoc(path, onData) {
  if (!db) return () => {};
  return fs.onSnapshot(
    fs.doc(db, ...path),
    (snap) => {
      if (snap.metadata.fromCache) return;
      onData(snap.exists() ? snap.data() : null);
    },
    (err) => console.warn('[ListMe] Écoute interrompue', path.join('/'), err)
  );
}
