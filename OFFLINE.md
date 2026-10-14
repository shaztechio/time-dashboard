# Catalog compression, caching, and offline use

## Build and preview

Run `npm run build`, then `PORT=4174 npm run preview`. Deploy the complete `dist/` directory over HTTPS (localhost also supports service workers). Plain `npm run dev` deliberately leaves persistent catalog caching and worker registration disabled, so local edits and error tests are not hidden behind old cached files.

The build emits:

- Immutable `data/cities-2026-10-14.json` search data and supported `data/clock-catalog-*.json` lookup snapshots.
- Precompressed `.br` and `.gz` sidecars for JSON, JavaScript, CSS, HTML, and SVG assets.
- `sw.js` with a content-derived revision and SHA-256 hashes of the app files.
- `_headers` for hosts that support that format, and `build-manifest.json` with compression sizes and included assets.

The current search data is 5,335,953 bytes raw, 2,145,547 bytes gzip, or 1,470,602 bytes Brotli. The lookup is 1,707,251 bytes raw, 486,766 bytes gzip, or 351,092 bytes Brotli. These are build measurements. The production app explicitly requests the gzip files, so catalog compression does not depend on server negotiation.

## Hosting headers and compression

The included production preview server negotiates Brotli/gzip from `Accept-Encoding`, uses `Vary: Accept-Encoding`, serves correct `Content-Type` and `Content-Encoding`, and supplies representation-specific ETags with conditional 304 responses. Uncompressed responses remain available. The development server also supplies ETags but always revalidates resources.

| Resource | Cache-Control |
| --- | --- |
| Versioned catalog JSON and `.json.gz` files | `public, max-age=31536000, immutable` |
| HTML, service worker, unversioned JS/CSS | `no-cache` (with ETag validation) |

Never modify an already published catalog filename. Generate a new dated snapshot and update the current catalog version in the app. Keep supported lookup snapshots available for older v2 links. Search generation uses exclusive creation to prevent accidental overwrite; lookup generation also rejects replacing existing content.

**GitHub Pages:** build with `npm run build` and publish the complete `dist/` directory, including `.json.gz` files, using a Pages Actions artifact. No custom headers, proxy, or compression settings are required. GitHub Pages controls HTTP cache headers and does not apply `_headers`. The production loader fetches the versioned `.json.gz` files directly and inflates them with `DecompressionStream('gzip')`. Browsers without that API, missing files, corrupt gzip, or invalid catalog data fall back to the ordinary JSON URL. Both files must be deployed. Source development continues to use plain JSON because compressed files are generated only at build time.

A `.gz` file can be served as an ordinary binary file without a `Content-Encoding` header. The loader also handles hosts that set `Content-Encoding: gzip`: fetch has already decoded the HTTP response, so the loader checks the gzip signature before attempting inflation. Decoded and validated JSON is cached under its canonical `.json` URL. This preserves existing caches, avoids duplicate compressed/decompressed cache entries, and avoids inflating the catalog again on each visit. Search remains lazy. This behavior needs no service-worker change; the worker continues to serve canonical cached JSON and the first compressed request passes through to the host.

For other hosts, `_headers` can apply the generated root-relative rules; prefix paths when deploying under a subdirectory. Server/CDN compression and custom cache headers are optional optimizations. Negotiating the `.br`/`.gz` sidecars under original HTML/JS/CSS/JSON URLs still requires host configuration; merely uploading them does not activate negotiation. Never serve compressed bytes as ordinary JSON without the matching Content-Encoding header. The explicit `.json.gz` catalog route is different: the application decodes that file itself.

For nginx with static compression modules, for example, enable `gzip_static on` and `brotli_static on`, and apply the cache policies above. Module availability depends on that host; automatic CDN compression is also suitable. Do not rewrite missing JSON or worker requests to HTML.

## Runtime caching

The app caches validated successful catalogs in Cache Storage under a deployment-scoped name. Reading happens cache-first, then network. This also saves downloads that finish before the service worker first takes control. Invalid cached JSON is removed and retried; failed responses are not cached. Storage failures fall back to normal network loading without breaking the dashboard.

Search remains lazy: opening Add Clock downloads the search snapshot once, including Use my timezone. The service worker installation never downloads it. The smaller lookup is loaded by nonempty saved dashboards and by the default production dashboard. This makes links produced by editing default clocks reloadable offline even if search was never opened. Adding from an empty dashboard also loads its lookup before enabling search results.

Cached raw data still needs parsing and search preparation after a reload; caching reduces network work, not that CPU cost. The existing in-memory catalog prevents repeated parsing within one page visit. No catalog or search index is stored in synchronous localStorage.

## Offline behavior

Once the footer says **Ready offline**, the app files are installed. Clocks, formats, reordering, theme choices, Time Travel, and existing saved links work offline when their lookup snapshot has been downloaded. Search and adding cities work offline after Add Clock has successfully loaded once. An uncached catalog still needs connectivity; the app provides a retry message instead of claiming it is available offline.

The worker serves only this deployment's known files and root/index navigations. Query parameters and fragments stay in the browser URL, so layout, frozen time, and clock order survive offline reload. Root and subdirectory deployments are supported. External requests and unrelated navigations are not cached.

Browsers may evict site data, private browsing may restrict storage, and users can clear caches. Offline use is therefore conditional on retained data, not a permanent storage guarantee. The app remains usable online when service workers or Cache Storage are unavailable.

## Updates and cache cleanup

Installation fetches the complete app shell and verifies every file against its build hash. A partial or mixed deployment fails installation and leaves the previous working worker intact. The worker does not call skipWaiting: open tabs retain the version they started with. The footer announces an installed update and asks users to close all dashboard tabs and reopen. Reloading a still-controlled tab alone may not activate a waiting worker.

Once the new worker activates, it deletes only this deployment's old app-shell caches and removes catalog cache entries not in the current supported list. Supported lookup versions and the current search snapshot survive app updates. Scope-specific cache names prevent cleanup from affecting another dashboard deployed on the same origin. Keep old assets available during deployment and upload atomically where possible.

To inspect or reset offline storage, use browser developer tools → Application → Service Workers / Cache Storage. Clearing site data removes offline files, not clock settings encoded in a saved URL.

## Verification

After building, run `npm run test:offline` with Playwright available (or set `PLAYWRIGHT_MODULE`). It starts an isolated production fixture and checks explicit gzip downloads without Content-Encoding, no duplicate raw catalog downloads, canonical decoded caching, Brotli/gzip negotiation, ETags/304, cache policy, lazy downloads, first-visit lookup caching, offline links/search/add/Time Travel, subdirectory scope, corrupt-cache recovery, failed installation, waiting upgrades, activation cleanup, and unavailable-storage fallback.

Background: [MDN HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching), [MDN service-worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), and [Content-Encoding](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Encoding).
