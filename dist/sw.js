// Service worker: cache-first offline support. The build script replaces
// the asset list and version; in development it simply caches as it goes.
const VERSION = '2.3.0-a88f8725db';
const ASSETS = ["./","app.59a19065e6.js","assets/fonts/alchemist-pixel.ttf","assets/icons/icon-192.png","assets/icons/icon-512.png","index.html","manifest.webmanifest","studio-worker.js","styles/main.ef91b40794.css"];
// The origin may be shared — <owner>.github.io hosts every Pages site of an
// account, and a branch deploy exposes this game both at the root and at
// /dist/ — so cache names carry this worker's scope, and each worker only
// reads and cleans up its own caches.
const PREFIX = 'alchemist-shop:' + self.registration.scope + ':';
const CACHE = PREFIX + VERSION;
const LEGACY = 'alchemist-shop-'; // cache names used before scoping

self.addEventListener('install', (e) => {
  // 'reload' bypasses the browser's HTTP cache: static hosts such as GitHub
  // Pages let files be cached for minutes, and precaching a stale index.html
  // next to a new bundle would pin the old version
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => (k.startsWith(PREFIX) && k !== CACHE) || k.startsWith(LEGACY)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => {
      // revalidate with the server (a 304 when unchanged) rather than trusting the HTTP cache
      const net = fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      // dev: network first (fresh code); release: cache first (instant offline)
      return VERSION === 'dev' ? net.then((r) => r || hit) : hit || net;
    }),
  );
});
