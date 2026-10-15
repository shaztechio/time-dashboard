# Time Dashboard

A static world-clock dashboard with a 1,000-clock soft cap, independent analog/digital and 12/24-hour settings, daylight saving support, and shareable URL configuration. Built with HTML, CSS, and JavaScript modules; a vendored compression module and no application server.

Documentation reviewed against the implementation on 2026-10-15.

## Run locally

Requires Node.js 22 or newer. No package installation is needed to run the app or unit tests. Browser tests use the pinned Playwright development dependency installed with `npm ci`.

```sh
npm run dev
```

Open [the local dashboard](http://127.0.0.1:4173). Use `PORT=8080 npm run dev` to choose another port. The development server binds to loopback only. Opening `index.html` directly with `file://` is unsupported.

## Features

- Los Angeles, UTC, Kolkata, and Shanghai by default, in that initial order. New clocks are appended to your custom order.
- iOS-inspired cards with a single city/country title and time-zone abbreviation. Tap anywhere on a card to flip to settings; tap the settings background, **Done**, or Escape to return. The palette button opens a separate design panel; other controls and drag handles do not trigger the general settings flip.
- Choose **Dark**, **Light**, or **System** at the bottom of the page. System follows device appearance changes and is the default; the choice is saved on this device when browser storage is available. Clock dial day/night colors still follow each city's local hour. Card backs show the city and a pill-shaped Done button without a redundant settings heading.
- Search 34,162 cities using names, regional qualifiers, transliterations, and selected aliases; UTC is also searchable.
- **Use my timezone** in Add Clock suggests a city matching the device's timezone, without location permission or external lookups. Confirm with Add clock, or choose another matching city. It detects existing cities and leaves search available when there is no match.
- Add/remove clocks, switch each clock’s display and hour format, restore defaults, and copy a shareable link.
- **Copy times** copies one line per city in the displayed order, with its current time, zone abbreviation, UTC offset, and local date. It respects each clock's 12/24-hour setting and provides selectable text if clipboard access is unavailable.
- Keyboard-accessible city picker, responsive cards, and centered text. Analog is the default, with a large dial and no visible digital readout (readable time remains available to screen readers).
- Drag a card’s grip to reorder with mouse or touch, use arrow keys on the grip, or use Move earlier/later in settings. The **Earliest to latest** and **Latest to earliest** buttons sort once; clocks never auto-reorder.
- While dragging, the actual card lifts, trails the pointer slightly, and tilts around the grabbed corner with spring motion. Other cards slide aside around a moving placeholder. On release, the card settles into its new slot; Escape cancels. Reduced-motion mode keeps movement direct and flat, with immediate reordering.
- Browser Back/Forward restores dashboard changes. Empty dashboards can also be shared.
- Saved links load a compact versioned city lookup. Search downloads a separate catalog with aliases only when needed.
- Only clocks near the viewport are mounted and updated. At 1,000 clocks a warning appears; you can continue adding more.

## Card size

Choose **Standard cards** or **Mini cards** above the clocks. Mini cards show a denser grid, including two columns on phones, while retaining analog/digital displays, flip settings, dragging, and Time Travel. City names reserve the same two-line space and are vertically centered, keeping clock faces aligned even when names wrap. Settings on mini-card backs scroll when needed. Mini cards are the default. The `view=standard` query parameter saves the larger layout in copied links and browser history; omitting it uses mini cards. Existing `view=mini` links still work. Run `npm run test:mini` for browser checks.

## Card designs

Click the subtle, desaturated **🎨 palette button at the bottom-left of a card's front** to flip to its design settings. Click elsewhere on the front for the usual clock settings.

- Choose **Original, Ocean, Sage, Rose, Lavender, or Sand**. Each palette has coordinated light and dark variants that follow the page's Dark / Light / System setting.
- Choose a **Solid** or **Gradient** background and a **Classic** or **Minimal** analog dial. Minimal hides the numerals and small tick marks. The dial still switches between day and night colors according to the city's local time.
- A preview shows the selected palette and background. Choices save immediately to the URL for that clock, survive reordering and reloads, and are included in Copy link. Dial choices are retained while using a digital display.
- **Reset design** restores that card's original palette, solid background, and classic dial. **Done**, Escape, or the back's background returns to the front.
- Mini-card palettes show swatches only, with tooltips and accessible names. Standard cards also show the color names. The back scrolls when controls do not fit.

The page-wide **Restore defaults** replaces the clock list, order, formats, and designs with the four original clocks. It retains the selected card size, page appearance, and any frozen Time Travel instant.

Card designs are shared dashboard settings; the page's light/dark appearance is a separate preference saved on the device.

## Time Travel

Select **Time Travel** to freeze now or choose a date, time, and timezone. The picker starts in your device's timezone and also offers UTC and the zones on your dashboard. Hour/day shortcuts adjust the selected instant by elapsed hours. **Set time & freeze** applies it to every clock; Cancel leaves the dashboard unchanged.

A blue banner, outlined cards, and “Frozen” labels distinguish paused clocks. **Adjust time** reopens the picker; **Return to now** resumes live updates. Clock dates, DST offsets, sorting, and Copy times all use the same selected instant, including newly added and offscreen cards. DST gaps are rejected; repeated times offer both occurrences with their UTC offsets.

Frozen instants are saved in the optional `at` query parameter alongside the compact v2 fragment, so copied links and reloads preserve Time Travel. Browser Back/Forward restores previous instants. Run `npm run test:travel` for the browser checks.

## URL format

The URL is the persistent clock configuration; no account is used. Clock order, display formats, and card designs are stored in the fragment; card size and Time Travel use query parameters. The page appearance preference is stored locally, and downloaded app/catalog files are cached for offline use:

```text
#v2.2026-10-14.<gzip-base64url-payload>
```

The payload stores an ordered array of packed city IDs and display/hour flags, with optional compact per-card design codes. Names and zones come from an immutable static lookup catalog. Fragment data is not sent in HTTP requests, so large dashboards can reload without enlarging the server request URL. An early 1,000-clock test link used approximately 5.5 KB; actual length varies with city IDs, formats, and card designs.

See [URL-FORMAT.md](URL-FORMAT.md) for the exact encoding, versioning, validation, catalog lifecycle, and rendering behavior. The old v1 query format is intentionally unsupported. Malformed links show defaults and an explanatory notice while preserving the original URL. The earlier [scale analysis](URL-SCALE-ANALYSIS.md) records why the format changed.

Time zones use the browser’s IANA data and the device clock. Keep the browser/OS current for government changes to time-zone rules. Live links record settings; Time Travel links also record the frozen timestamp. Full behavior and validation rules are in [SPEC.md](SPEC.md).

Abbreviations use Intl plus explicit names for common zones where Intl otherwise provides an offset. Some legitimate abbreviations have four letters (such as AEDT); zones without a supported abbreviation keep the browser’s numeric GMT form rather than inventing a code. Analog faces use a light dial from 06:00 to 17:59 local time and a dark dial otherwise; this is a visual convention, not a sunrise calculation.

## Verify

```sh
npm test
npm run build
```

Unit tests cover the catalog, search, duplicates, URL serialization and validation (including card designs and 1,000+ clocks), explicit gzip loading and JSON fallbacks, drag physics, Time Travel, fractional offsets, local dates, and northern/southern DST transitions (including Lord Howe’s half-hour shift).

The browser suite uses Playwright as an optional development tool. Install the locked development dependencies and Chromium, and start `npm run dev` in another terminal:

```sh
npm ci
npx playwright install chromium
npm run build
npm run test:browser
npm run test:scale
npm run test:travel
npm run test:mini
npm run test:design
npm run test:offline
```

Alternatively, set `PLAYWRIGHT_MODULE` to an absolute path to an existing Playwright ESM entry point. `TEST_URL` overrides the local URL for interaction, scale, travel, mini, and design suites. The interaction suite also requests its `dist/` subdirectory, so point it at the source development server after building. The offline suite creates its own temporary production server from `dist/` and does not use `TEST_URL`. Screenshots are saved under ignored `test-results/`.

The scale suite opens real 1,000-clock links, verifies bounded rendering and ticking, scrolls and drags through newly mounted rows, and adds past the warning threshold.

The design suite checks separate settings panels, shared design state, reset/history, light/dark variants, accessible focus, and mini/standard palette labels. The mini suite checks layout, dragging, history, mobile sizing, and 1,000 frozen clocks; the travel suite checks frozen instants and DST-aware editing. The offline suite verifies compressed downloads, lazy caching, offline use, and safe worker updates.

The interaction suite checks desktop/mobile layout, keyboard selection, format changes, shared links in a fresh context, history, adding beyond eight clocks, custom ordering, empty states, safe URL text, search errors/retry, and clipboard fallback. Chromium automation does not replace physical-device or VoiceOver/Safari/Firefox testing.

## Pull request checks

The [PR checks workflow](.github/workflows/ci.yml) runs for pull requests and can also be started manually. It uses Node.js 22 and `npm ci` with the committed lockfile. The **Unit tests and production build** job runs unit tests and builds `dist/`. Six independent Chromium jobs cover interactions (`browser`), 1,000-clock behavior (`scale`), Time Travel (`travel`), mini cards (`mini`), card designs (`design`), and offline use (`offline`). Browser jobs build their own production assets and start a local development server when needed; the offline suite starts its own isolated server.

Screenshots and logs are uploaded as per-suite artifacts for seven days, including on failure. New pushes to a PR cancel its superseded check run; one failed browser suite does not cancel the others. PR checks use read-only repository permissions, require no deployment secrets, and do not publish the site. Pages deployment remains a separate workflow for pushes to `main`. These checks run automatically; requiring them before merge is a separate repository protection setting.

## Static deployment

The repository uses [GitHub Pages](https://shaztechio.github.io/time-dashboard/) with the [Deploy GitHub Pages workflow](.github/workflows/pages.yml). Every push to `main` runs the unit tests, builds the production site with Node.js 22, and publishes only `dist/`. You can also run the workflow manually from the repository's Actions tab. GitHub Pages must use **GitHub Actions** as its publishing source.

```sh
npm run build
```

Upload the contents of `dist/` to any HTTP(S) static host. The build validates catalog consistency, copies the application and supported data snapshots, generates compressed files and a revisioned service worker, and emits a build manifest and optional host header rules. It does not deploy or require a bundler. No route rewrites, secrets, server functions, or runtime API calls are needed. Root URLs and subdirectory URLs such as `/time-dashboard/` both work; preserve the trailing slash for directory URLs and serve standard JavaScript/JSON MIME types.

The build includes Brotli/gzip variants, cache-header rules, and an offline service worker. The versioned search catalog is loaded only when Add Clock opens and is cached after first use (2.05 MiB explicit gzip download). Production dashboards also save their smaller lookup catalog for offline links. App files are installed for offline reload, with safe updates and scoped cache cleanup. Run `PORT=4174 npm run preview` to verify the built site locally. GitHub Pages needs no custom headers or compression settings: publish the complete `dist/` directory. The app explicitly fetches `.json.gz` catalogs, decompresses them in the browser, and falls back to ordinary JSON when needed. Server-negotiated compression for other assets and custom cache headers remain optional optimizations. See [OFFLINE.md](OFFLINE.md) for deployment, offline limits, update behavior, and tests.

For the planned `timedashboard.app` custom domain, use the [Cloudflare DNS import file and setup instructions](dns/README.md). Importing DNS and configuring the Pages custom domain are separate from publishing the build.

## Link previews

The HTML includes OpenGraph and Twitter large-image metadata with a 1200 × 630 PNG preview, title, description, and canonical URL. These tags are present before JavaScript runs. Pages builds take their absolute URLs from the configured Pages `base_url`; after changing the custom domain, rerun the deployment workflow to update the tags. Local builds default to the GitHub Pages URL; override it with `SITE_URL=https://timedashboard.app/ npm run build`.

The preview is intentionally generic: URL fragments containing personal clock settings never reach a social crawler. Edit `assets/social-preview.svg`, then run `npm ci`, `npx playwright install chromium`, and `npm run social:preview` to regenerate the checked-in `social-preview.png`. Regular builds copy the PNG without requiring a browser.

## Refresh city data

Download and extract `cities15000.zip` and download `admin1CodesASCII.txt` from the [GeoNames exports](https://download.geonames.org/export/dump/). Then run:

```sh
npm run catalog -- /path/to/cities15000.txt /path/to/admin1CodesASCII.txt YYYY-MM-DD
node scripts/build-clock-catalog.mjs YYYY-MM-DD
# Update the supported/current versions in src/catalog.js; retain older lookup files.
npm test
npm run build
```

Use the actual download date as `YYYY-MM-DD`. Generation filters unsupported zones, retains up to 12 aliases per city, and resolves English country names using Node’s Intl data. The packaged catalog records its source, date, schema, and license. Review catalog changes before publishing an update; coverage reflects the source’s population threshold and capitals, not every settlement.

The page footer credits [shaztech.io](https://shaztech.io/) as the maker and links to GeoNames and its data license.

GeoNames data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [data attribution](data/ATTRIBUTION.md) for modifications and source details.

Compression uses locally vendored [fflate 0.8.3](https://github.com/101arrowz/fflate), under its included [MIT license](src/vendor/fflate.LICENSE). No CDN is contacted.

## Documentation

- [SPEC.md](SPEC.md): implemented behavior and interaction requirements.
- [URL-FORMAT.md](URL-FORMAT.md): saved clock records, design flags, view and frozen-time parameters, validation, and catalog versions.
- [OFFLINE.md](OFFLINE.md): build output, GitHub Pages hosting, explicit gzip downloads, cache lifecycle, and offline/update behavior.
- [URL-SCALE-ANALYSIS.md](URL-SCALE-ANALYSIS.md): historical v1 measurements and the decision to use compact fragments and virtualized rendering.

When changing a feature, update its README instructions and specification, plus the URL or offline document when persistence or loading changes. Keep documented commands aligned with `package.json`; distinguish historical measurements from current guarantees.

## License

Original project source code and documentation are licensed under [Apache-2.0](LICENSE). Source files carry Apache-2.0 notices, `package.json` declares the license, and production builds include the root `LICENSE` file.

Third-party material retains its own license: vendored fflate remains [MIT](src/vendor/fflate.LICENSE), and GeoNames-derived city catalogs remain [CC BY 4.0](data/ATTRIBUTION.md). Their existing notices and attribution are preserved.
