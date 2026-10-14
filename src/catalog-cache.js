// A first visit can fetch a catalog before the worker controls the page. Saving
// here as well ensures that first successful download is available offline.
const enabled = () => typeof document !== 'undefined' && !!document.querySelector('meta[name="offline-enabled"]');
const cacheName = `world-clock-catalogs:${new URL('../', import.meta.url).pathname}`;
export async function catalogJSON(url, validate) {
  let cache;
  if (enabled() && 'caches' in globalThis) {
    try { cache = await caches.open(cacheName); } catch { /* Storage is optional. */ }
  }
  if (cache) {
    try {
      const cached = await cache.match(url);
      if (cached) {
        const data = await cached.json();
        validate(data);
        return data;
      }
    } catch { await cache.delete(url).catch(() => {}); }
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load the city catalog');
  const data = await response.clone().json();
  validate(data);
  if (cache) await cache.put(url, response).catch(() => {});
  return data;
}
