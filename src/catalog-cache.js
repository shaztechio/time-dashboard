/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// A first visit can fetch a catalog before the worker controls the page. Saving
// here as well ensures that first successful download is available offline.
const enabled = () => typeof document !== 'undefined' && !!document.querySelector('meta[name="offline-enabled"]');
const cacheName = `world-clock-catalogs:${new URL('../', import.meta.url).pathname}`;

export async function fetchCatalogJSON(url, validate, compressed = true) {
  if (compressed && typeof DecompressionStream === 'function') {
    try {
      const gzipURL = new URL(url);
      gzipURL.pathname += '.gz';
      const response = await fetch(gzipURL);
      if (!response.ok) throw new Error('Could not load compressed catalog');
      const bytes = new Uint8Array(await response.arrayBuffer());
      // Static hosts normally serve .gz as a file. Some instead set
      // Content-Encoding: gzip, in which case fetch has already decoded it.
      const body = bytes[0] === 0x1f && bytes[1] === 0x8b
        ? new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
        : bytes;
      const decoded = new Response(body, { headers: { 'Content-Type': 'application/json' } });
      const data = await decoded.clone().json();
      validate(data);
      return { data, response: decoded };
    } catch { /* Missing, corrupt or unsupported gzip: try ordinary JSON. */ }
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load the city catalog');
  const data = await response.clone().json();
  validate(data);
  return { data, response };
}

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
  // Build output includes gzip files; source development uses the raw catalogs.
  const { data, response } = await fetchCatalogJSON(url, validate, enabled());
  // Store decoded, validated JSON at the canonical URL. Existing offline caches
  // remain compatible, and subsequent visits need neither a fetch nor inflation.
  if (cache) await cache.put(url, response).catch(() => {});
  return data;
}
