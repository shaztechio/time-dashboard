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
/* Build-generated worker. Catalogs are intentionally NOT precached. */
const REVISION = '__REVISION__';
const ASSETS = __ASSETS__;
const CATALOGS = __CATALOGS__;
const base = new URL(self.registration.scope);
const prefix = `world-clock-shell:${base.pathname}:`;
const shellName = prefix + REVISION;
const catalogName = `world-clock-catalogs:${base.pathname}`;
const assets = new Map(ASSETS.map(([path, hash]) => [new URL(path, base).href, hash]));
const catalogs = new Set(CATALOGS.map(path => new URL(path, base).href));
const index = new URL('__INDEX__', base).href;
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(shellName);
  try {
    // Verify a consistent build before installing, even during a partial deploy.
    await Promise.all([...assets].map(async ([url, expected]) => {
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok || response.redirected) throw new Error('Incomplete app download');
      const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
      const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== expected) throw new Error('Mixed app versions');
      await cache.put(url, response);
    }));
  } catch (error) { await caches.delete(shellName); throw error; }
  // Do not skipWaiting: existing tabs keep their matching assets until closed.
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith(prefix) && name !== shellName) await caches.delete(name);
  const cache = await caches.open(catalogName);
  for (const request of await cache.keys()) if (!catalogs.has(request.url)) await cache.delete(request);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== base.origin) return;
  const navigation = request.mode === 'navigate' && (url.pathname === base.pathname || url.pathname === new URL('index.html', base).pathname);
  if (navigation || assets.has(url.href)) {
    const key = navigation ? index : url.href;
    event.respondWith((async () => {
      try {
        const cached = await (await caches.open(shellName)).match(key);
        if (cached) return cached;
      } catch { /* Fall through when browser storage is unavailable. */ }
      return fetch(request);
    })());
  } else if (catalogs.has(url.href)) {
    event.respondWith((async () => {
      try {
        const cached = await (await caches.open(catalogName)).match(request);
        if (cached) return cached;
      } catch { /* Application also saves validated catalogs on first use. */ }
      return fetch(request);
    })());
  }
});
