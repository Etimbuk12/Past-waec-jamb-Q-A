const CACHE = 'oxbridge-v1';
const BASE_PATH = '/Past-waec-jamb-Q-A';   // Change only if your folder name changes

const ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/icon-192.png`,
  `${BASE_PATH}/icon-512.png`
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      // Return cached version if available
      if (cachedResponse) return cachedResponse;

      // Try network
      return fetch(e.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        caches.open(CACHE).then(cache => {
          cache.put(e.request, responseClone);
        });

        return networkResponse;
      }).catch(() => {
        // Fallback when offline or error
        return caches.match(`${BASE_PATH}/index.html`);
      });
    })
  );
});
