// Cache-first for the pinned Pyodide CDN release — the SymPy engine's
// ~12MB of wasm/wheels then loads from disk on repeat visits instead of
// the network. App.svelte registers this.
const CACHE = 'pyodide-v0.29.0';

const isEngineAsset = (url) =>
  (url.hostname === 'cdn.jsdelivr.net' &&
    url.pathname.startsWith('/pyodide/')) ||
  // The frozen engine memory image (~22MB) the worker restores at boot —
  // same-origin so the CDN check alone would miss it.
  (url.origin === self.location.origin &&
    url.pathname.endsWith('/engine.snapshot.gz'));

self.addEventListener('fetch', (e) => {
  let url;
  try {
    url = new URL(e.request.url);
  } catch {
    return;
  }
  if (!isEngineAsset(url) || e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) await cache.put(e.request, res.clone());
      return res;
    }),
  );
});
