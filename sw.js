// Ox-Bridge service worker
// Rules: (1) the app page and its files are NETWORK-FIRST, so a new deploy shows up
// straight away and the cache is only used when offline or the network is very slow;
// (2) requests to other websites (the API on Render, fonts, CDNs) are never touched or
// cached, so scores, streaks, leaderboard and questions are always live data;
// (3) bump CACHE below whenever you change this file's cached-file list.
const CACHE = 'oxbridge-v5';
const SHELL = '/index.html';                     // the app page, stored under one fixed key
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];
const SLOW_NETWORK_MS = 5000;                    // after this long, show the saved copy while the new one downloads

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // add files one by one: a missing icon must not make the whole install fail
      Promise.all(ASSETS.map(url => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))   // remove every old cache
      .then(() => self.clients.claim())
  );
});

// The page can ask a waiting worker to take over at once
self.addEventListener('message', event => {
  const d = event.data;
  if(d === 'SKIP_WAITING' || (d && d.type === 'SKIP_WAITING')) self.skipWaiting();
});

// Where a file is stored: the app page always under SHELL, everything else by its path (no ?query)
function cacheKey(url){
  if(url.pathname === '/' || url.pathname === SHELL) return SHELL;
  return url.origin + url.pathname;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;                              // sending data (login, answers...) is never touched
  const url = new URL(req.url);
  if(url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if(url.origin !== self.location.origin) return;               // API, fonts, CDNs: straight to the network, never cached
  if(url.searchParams.has('_c')) return;                        // the page's own "is there a new version?" check
  if(req.headers.has('range')) return;                          // audio/video seeking

  const key = cacheKey(url);

  // cache:'no-cache' = always ask the server if there is a newer copy (a quick 304 when nothing changed),
  // so the browser's own HTTP cache can never hand back an old index.html
  const network = fetch(req, { cache: 'no-cache' }).then(res => {
    if(res && res.ok && res.type === 'basic'){
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(key, copy)).catch(() => {});
    }
    return res;
  });

  const fromCache = () => caches.match(key).then(hit => hit || (req.mode === 'navigate' ? caches.match(SHELL) : undefined));

  event.respondWith(
    Promise.race([
      network,
      new Promise(resolve => setTimeout(() => resolve(null), SLOW_NETWORK_MS))
    ]).then(res => {
      if(res) return res;                                       // normal case: the fresh copy from the network
      return fromCache().then(hit => hit || network);           // very slow network: saved copy now, fresh one keeps downloading
    }).catch(() =>
      fromCache().then(hit => hit || Response.error())          // offline: saved copy if we have one
    )
  );
  event.waitUntil(network.catch(() => null));                   // keep the worker alive until the cache is refreshed
});

// Fires even when the app/tab is completely closed - this is the actual
// mechanism that makes a push notification appear on the device.
self.addEventListener('push', event => {
  let data = {};
  try{ data = event.data ? event.data.json() : {}; }
  catch(e){ data = { body: event.data ? event.data.text() : '' }; }   // plain-text payloads still work
  event.waitUntil(
    self.registration.showNotification(data.title || 'Ox-Bridge', {
      body: data.body || 'You have something waiting for you today!',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || SHELL }
    })
  );
});

// Tapping the notification opens the app, or brings it to the front if it is already open.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || SHELL;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for(const c of list){
        if('focus' in c){
          const goesElsewhere = target !== SHELL && target !== '/' && 'navigate' in c;
          return c.focus().then(w => (goesElsewhere && w && w.navigate) ? w.navigate(target).catch(() => null) : w);
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
                      
