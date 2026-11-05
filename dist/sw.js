// Service worker: cache-first offline support. The build script replaces
// the asset list and version; in development it simply caches as it goes.
const VERSION = '2.4.0-4da271b436';
const ASSETS = ["./","app.4a9618e5ac.js","assets/fonts/alchemist-pixel.ttf","assets/icons/icon-192.png","assets/icons/icon-512.png","assets/ingredients/README.md","assets/ingredients/biomes/chronoglass.json","assets/ingredients/biomes/chronoglass.png","assets/ingredients/biomes/crags.json","assets/ingredients/biomes/crags.png","assets/ingredients/biomes/forest.json","assets/ingredients/biomes/forest.png","assets/ingredients/biomes/ghostglass.json","assets/ingredients/biomes/ghostglass.png","assets/ingredients/biomes/meadow.json","assets/ingredients/biomes/meadow.png","assets/ingredients/biomes/moonfen.json","assets/ingredients/biomes/moonfen.png","assets/ingredients/biomes/morphgrove.json","assets/ingredients/biomes/morphgrove.png","assets/ingredients/biomes/netherwood.json","assets/ingredients/biomes/netherwood.png","assets/ingredients/biomes/quarry.json","assets/ingredients/biomes/quarry.png","assets/ingredients/biomes/river.json","assets/ingredients/biomes/river.png","assets/ingredients/biomes/skyshard.json","assets/ingredients/biomes/skyshard.png","assets/ingredients/biomes/veil.json","assets/ingredients/biomes/veil.png","assets/ingredients/icons-atlas.json","assets/ingredients/icons-atlas.png","assets/ingredients/manifest.json","assets/ingredients/wilds-atlas.json","assets/ingredients/wilds-atlas.png","index.html","manifest.webmanifest","studio-worker.js","styles/main.785b4f68dc.css"];
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
