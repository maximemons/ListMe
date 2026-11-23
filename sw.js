// Service worker ListMe : rend l'application disponible hors ligne.
// Incrémenter VERSION à chaque mise en ligne pour rafraîchir le cache.
const VERSION = 'listme-v1.0.0';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/store.js',
  './js/sync.js',
  './js/products-data.js',
  './js/firebase-config.js',
  './manifest.webmanifest',
  './favicon.ico',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

// Modules Firebase pré-chargés : l'app démarre même sans réseau.
const CDN = [
  'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js',
];

const RUNTIME_HOSTS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(SHELL);
      await Promise.all(CDN.map((url) => cache.add(new Request(url, { mode: 'cors' })).catch(() => {})));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

// Pages : réseau d'abord (3 s max), sinon index.html en cache, quels que soient les paramètres.
async function handleNavigation(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await Promise.race([fetch(request), timeout(3000)]);
    if (response.ok) cache.put('./index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

// Fichiers du site : cache immédiat, mise à jour en arrière-plan.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

// CDN (Firebase, polices) : cache d'abord.
async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(handleNavigation(request));
  } else if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  } else if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
  // Tout le reste (Firestore notamment) passe directement par le réseau.
});
