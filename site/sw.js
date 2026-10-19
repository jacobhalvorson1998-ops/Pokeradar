/* Network-first shell and snapshots: fast offline use without pinning old code. */
const PREFIX = `pokeradar-${new URL(self.registration.scope).pathname.replace(/[^a-z0-9]/gi, '_')}-`;
const CACHE = `${PREFIX}v9`;
const root = new URL(self.registration.scope);
const summaryPath = new URL('summary.json', root).pathname;
const shell = ['./', './index.html', './styles.css?v=9', './app.js?v=9', './lib/collection.mjs', './lib/vendor-ui.mjs', './lib/vendor.mjs', './lib/price-source.mjs', './lib/inventory.mjs', './manifest.webmanifest', './icon-192.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(shell.map(file => new Request(new URL(file, root), {cache: 'reload'})))).then(() => self.skipWaiting()));
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
  const supported = snapshot || detail || event.request.mode === 'navigate' || /\.(?:js|mjs|css|png|webmanifest)$/.test(url.pathname);
  if (!supported) return;
  // Refresh query strings share one offline snapshot; detail histories keep their own key.
  const cacheKey = snapshot ? new URL('summary.json', root).href : detail ? new URL(url.pathname,root).href : event.request;
  function offlineResponse(response) {
    if (!snapshot) return response;
    const headers = new Headers(response.headers);
    headers.set('X-Pokeradar-Cache', 'offline');
    return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(cacheKey);
    // Versioned shell modules are already refreshed by install. Serve them
    // immediately so a weak show connection cannot stall the lazy Vendor tab.
    if(saved&&!snapshot&&!detail&&event.request.mode!=='navigate')return saved;
    const controller=new AbortController();
    const timer=saved?setTimeout(()=>controller.abort(),3000):null;
    try {
      const response = await fetch(event.request, {cache: 'no-cache',signal:controller.signal});
      if(timer)clearTimeout(timer);
      if (response.ok) {
        // Keep at most 60 previously opened histories for poor-signal shows.
        event.waitUntil((async()=>{await cache.put(cacheKey,response.clone());if(detail){const keys=(await cache.keys()).filter(r=>new URL(r.url).pathname.startsWith(new URL('details/',root).pathname));await Promise.all(keys.slice(0,Math.max(0,keys.length-60)).map(key=>cache.delete(key)));}})().catch(()=>{}));
        return response;
      }
      const saved = await cache.match(cacheKey);
      return saved ? offlineResponse(saved) : response;
    } catch (error) {
      if(timer)clearTimeout(timer);
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
