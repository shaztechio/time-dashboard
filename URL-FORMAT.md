# Compact URL format (v2)

Implemented 2026-10-15. Clock state lives in the URL fragment, independently of the device's theme preference. The old v1 query format is intentionally unsupported.

## URL shape

```text
https://example.com/time-dashboard/#v2.2026-10-14.<payload>
```

- `v2` is the format version.
- `2026-10-14` identifies an immutable city lookup catalog, not the current date.
- `payload` is UTF-8 JSON compressed with gzip, then encoded as unpadded base64url (`A–Z`, `a–z`, `0–9`, `_`, `-`).
- The fragment is handled in the browser. It is not included in the HTTP request to the static server, so a large clock configuration does not enlarge that request's path or headers.
- Existing unrelated query parameters and the deployment path are preserved. Obsolete `v` and `clocks` query parameters are removed when writing a link. The fragment belongs exclusively to dashboard state; the skip-to-clocks control uses focus rather than modifying it.

## Records and ordering

The decompressed JSON is a flat array of nonnegative safe integers, in displayed order. One integer represents one clock:

```js
token = cityId * 4 + displayBit + hourBit;
// cityId: 0 for UTC, otherwise the stable GeoNames numeric ID
// displayBit: 0 = analog, 1 = digital
// hourBit:    0 = 24-hour, 2 = 12-hour
```

Decode the ID using `Math.floor(token / 4)`, display using `token % 2`, and hours using `token & 2`. Settings occupy only the low two bits; both display modes retain their selected hour format.

Examples before compression:

```json
[21473444,0,5100016,7184944]
```

This represents Los Angeles, UTC, Kolkata, and Shanghai, all analog/24-hour. `[]` represents an explicitly empty dashboard; it is encoded and compressed normally. No configured fragment means the four default clocks.

Names, countries, and IANA zones are resolved from `data/clock-catalog-2026-10-14.json`, with rows `[id, name, country, zone]`. UTC is built in. Labels and zone strings are not repeated in the URL. The searchable catalog includes additional region names and aliases, but those are not required to restore a dashboard.

## Encoding and decoding

Use `stateURL(baseURL, clocks)` from `src/state.js` rather than concatenating fragment text. It validates records, maps internal preset aliases to GeoNames IDs, packs the integers, and produces a deterministic gzip stream (`level: 6`, `mtime: 0`). Compression is provided by the bundled, MIT-licensed fflate 0.8.3 browser module; there are no runtime CDN requests or native compression API requirements.

`decodeTokens(url)` validates and unpacks a fragment. `loadClockCatalog(version)` asynchronously loads and caches the corresponding static lookup file. `readState(url, catalog)` resolves records and validates IANA zones using the browser. Nonempty saved links require the lookup catalog; bare defaults and empty dashboards do not. Catalog failures show an explanatory notice and defaults while preserving the original link so reloading can retry it.

The decoder checks syntax, known versions, gzip headers, CRC32, integer types, duplicate IDs, missing cities, and supported time zones. It accepts the gzip header variant emitted by this encoder (DEFLATE with no optional header fields); arbitrary gzip options and concatenated members are outside the format. There is a 512 KiB fragment-text limit and a 1 MiB decoded-buffer limit to bound resource use. These are defensive byte limits, not the 1,000-clock warning threshold.

Malformed or unsupported links display defaults with an error notice and are not silently rewritten. Opening a v1 query link displays an explicit unsupported-format notice. No v1 decoder or migration is shipped.

## Persistence and browser navigation

Committed changes write one `history.pushState` entry. Drag previews do not change the URL; release commits the full array order. Back, Forward, direct fragment navigation, reload, and Copy link restore the same IDs, order, and format settings. A request generation counter prevents a late catalog response from overwriting a newer navigation or edit.

The theme remains a per-device preference in local storage and is not shared in clock links. Copy times exports a single-instant text snapshot of the full ordered state, including offscreen clocks.

## Catalog lifecycle

Lookup files are immutable. `node scripts/build-clock-catalog.mjs` derives the current snapshot from `data/cities.json` and refuses to overwrite an existing file with different content. The build verifies that the current search catalog and lookup records match and that every supported lookup version is present.

When updating city data, generate a new dated lookup file, set `CATALOG_VERSION` in `src/catalog.js` to that version, and keep previous versions explicitly listed in `CATALOG_VERSIONS` along with their lookup files. This preserves existing v2 links. Unknown catalog versions fail clearly rather than interpreting IDs through a different snapshot.

## Scale and soft cap

At 1,000 clocks, the dashboard displays a persistent warning. Add Clock also warns when the next addition reaches the threshold. Users may continue above 1,000; the count is not truncated on encoding or decoding. Distinct-city validation still prevents duplicate clocks for the same city.

One lightweight layout slot per clock preserves page height and ordered keyboard access. Detailed card DOM is created only within the viewport plus a 400 px buffer. Offscreen cards are unmounted, except for a focused or actively dragged card. Ticks update only mounted cards, once per second, sharing time calculations for matching zones. Scrolling schedules rendering on animation frames. Layout adapts to one, two, or four columns.

Drag hit-testing uses full-list grid coordinates, and all reordering uses the complete state array. Dragging across newly mounted rows, keyboard moves at the end of a 1,000-clock list, explicit sorting, and copying all clocks are covered by the scale browser test. Sorting, copying, and URL encoding necessarily process the full configuration; they are not performed every tick.

Run `npm run test:scale` with Playwright installed and the development server running. Results and screenshots are written to `test-results/`. Browser and clipboard/tool URL limits still vary; a compact fragment removes the HTTP request-size problem but does not promise unlimited sharing through every third-party application.

## Time Travel extension

An optional query parameter freezes the entire dashboard at a single UTC instant:

```text
?at=2026-11-01T09%3A30%3A00Z#v2.2026-10-14.<payload>
```

`at` is a strict ISO UTC timestamp, `YYYY-MM-DDTHH:mm:ssZ`, with years 1000–9999, second precision, and a valid calendar date. Missing `at` means live time. Invalid values show the existing invalid-link notice and live defaults. This small, fixed-size parameter leaves the compact clock payload unchanged and does not introduce a request-size problem. Unlike the fragment, it is sent to the static host.

Freezing, setting a time, and returning to now each create a history entry; returning to now removes `at`. Clock mutations retain it. Copy link includes it, and Copy times and sorting use the selected instant. The picker timezone is only an editing aid and is not persisted; the frozen UTC instant uniquely determines every city's time and seasonal offset. Day shortcuts represent exactly 24 elapsed hours, even across daylight-saving changes.

## Card size extension

The optional `view=mini` query parameter selects the compact card layout for the entire dashboard. Missing or unrecognized values use standard cards. Switching back to standard removes the parameter. Changing size creates one history entry and preserves the clock fragment and optional frozen `at` instant. Clock edits and Copy link retain the selected view.
