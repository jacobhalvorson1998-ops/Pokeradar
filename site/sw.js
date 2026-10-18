/* Network-first shell and snapshots: fast offline use without pinning old code. */
const PREFIX = `pokeradar-${new URL(self.registration.scope).pathname.replace(/[^a-z0-9]/gi, '_')}-`;
const CACHE = `${PREFIX}v4`;
const root = new URL(self.registration.scope);
const summaryPath = new URL('summary.json', root).pathname;
const shell = ['./', './index.html', './styles.css?v=4', './app.js?v=4', './manifest.webmanifest', './icon-192.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(shell)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  // Other applications on this origin may have their own caches.
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
  const snapshot = url.pathname === summaryPath;
  const detail = url.pathname.startsWith(new URL('details/', root).pathname);
  const supported = snapshot || detail || event.request.mode === 'navigate' || /\.(?:js|css|png|webmanifest)$/.test(url.pathname);
  if (!supported) return;
  // Refresh query strings share one offline snapshot; detail histories keep their own key.
  const cacheKey = snapshot ? new URL('summary.json', root).href : event.request;
  function offlineResponse(response) {
    if (!snapshot) return response;
    const headers = new Headers(response.headers);
    headers.set('X-Pokeradar-Cache', 'offline');
    return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        // Detail files stay uncached: one history per opened card, no unbounded cache growth.
        if (!detail) event.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
        return response;
      }
      const saved = await cache.match(cacheKey);
      return saved ? offlineResponse(saved) : response;
    } catch (error) {
      const saved = await cache.match(cacheKey);
      if (saved) return offlineResponse(saved);
      if (event.request.mode === 'navigate' && (url.pathname === root.pathname || url.pathname === new URL('index.html', root).pathname)) {
        const index = await cache.match(new URL('index.html', root));
        if (index) return index;
      }
      throw error;
    }
  })());
});
