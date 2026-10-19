// Cache-first for the pinned Pyodide CDN release — the SymPy engine's
// ~12MB of wasm/wheels then loads from disk on repeat visits instead of
// the network. App.svelte registers this.
const CACHE = 'pyodide-v0.29.0';

const isCdnAsset = (url) =>
  url.hostname === 'cdn.jsdelivr.net' &&
  url.pathname.startsWith('/pyodide/');

// The frozen engine memory image (~16MB gz) the worker restores at
// boot — same-origin so the CDN check alone would miss it. Its bytes
// change whenever the snapshot is regenerated, so cache-first would pin
// a stale image forever (a mismatched image crashes post-restore with
// 'table index is out of bounds'): fetch fresh, cache as offline
// fallback.
const isSnapshot = (url) =>
  url.origin === self.location.origin &&
  url.pathname.endsWith('/engine.snapshot.gz');

const cacheFirst = (request) =>
  caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(request);
    if (hit) return hit;
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  });

const networkFirst = (request) =>
  caches.open(CACHE).then(async (cache) => {
    try {
      const res = await fetch(request);
      if (res.ok) await cache.put(request, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(request);
      if (hit) return hit;
      throw err;
    }
  });

// Take over on update without waiting for every tab to close — a
// correctness fix in this file (like the snapshot rule above) shouldn't
// sit behind the old worker until the last client unloads.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(self.clients.claim()),
);

self.addEventListener('fetch', (e) => {
  let url;
  try {
    url = new URL(e.request.url);
  } catch {
    return;
  }
  if (e.request.method !== 'GET') return;
  if (isCdnAsset(url)) {
    e.respondWith(cacheFirst(e.request));
  } else if (isSnapshot(url)) {
    e.respondWith(networkFirst(e.request));
  }
});
