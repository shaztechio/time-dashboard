# URL configuration at 1,000 clocks — historical analysis

**Decision implemented 2026-10-15:** use compact packed IDs/settings, gzip compression, and a URL fragment. Add a 1,000-clock soft-cap warning and virtualized clock rendering. See [the v2 format](URL-FORMAT.md) and [SPEC.md](SPEC.md). The historical measurements below describe the former v1 implementation.

The current format also supports per-card design codes, page-wide mini/standard layout, and frozen Time Travel instants. The figures below predate those additions and are not exact current URL-size or DOM-count promises. Mini cards are now the default; the scale suite explicitly selects standard cards.

The first v2 browser run opened 1,000 clocks normally with HTTP 200 using a 5,501-character link, mounted 12 clock cards, created 2,579 total DOM elements, and made 11 time-formatting calls during the observed tick. It also opened a fresh 1,001-clock link. These are local Chromium measurements, not cross-device guarantees. Reproduce with `npm run test:scale`; current output is in `test-results/scale-results.json`.

The sections below are historical: measured 2026-10-14 against the former v1 implementation. Their recommendations have been superseded by the implemented decision above.

## Historical conclusion

The application can encode and parse 1,000 clocks, but the former v1 percent-encoded JSON query is not a reliable shareable URL at that scale. An already-loaded page can save a long URL with the History API; opening or refreshing that same URL sends it to the HTTP server, which can reject it before the application loads. Removing the application clock cap does not remove transport limits.

## Measurements

Sample: the first 1,000 distinct cities in the bundled catalog, all analog/24-hour, encoded with the application's serializer. Sizes vary with city names and settings; these are sample measurements, not universal boundaries. KB below means 1,000 bytes.

| Clocks | Full local URL | Local HTTP result |
| --- | ---: | --- |
| 50 | 10,184 bytes | 200 |
| 100 | 20,451 bytes | 431 |
| 1,000 | 206,385 bytes | 431 |

The 1,000-record JSON alone was 127,489 bytes. Encoding took approximately 9.5 ms and parsing 5.7 ms on this development machine. Parsing is not the primary obstacle.

The local server uses Node's HTTP defaults. Node documents a default 16 KiB maximum header size in its [HTTP API](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html). Hosted deployments have their own limits: for example, [Cloudflare rejects URIs longer than 32 KB](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-414/). A browser's ability to retain a URL therefore does not establish that it can be opened through a deployment's complete request path.

## Rendering cost

To isolate rendering from the HTTP rejection, a headless Chromium test intercepted only the document request and supplied the local HTML, retaining the full query and loading normal assets. The page rendered all 1,000 cards in approximately 1.4 seconds, creating 123,100 DOM elements. A performance observer recorded an initial 685 ms long task and subsequent long tasks of approximately 55–86 ms around clock updates. This is one desktop run, not a mobile performance guarantee; rendering all cards is already capable of noticeable stalls.

## Historical options

Approximate payload sizes for that same 1,000-city sample:

| Representation | Size |
| --- | ---: |
| Former v1 full JSON query URL | 206.4 KB |
| Full JSON compressed with gzip and encoded as base64url | 26.6 KB |
| Compact ID/settings JSON query | 19.9 KB |
| Compact ID/settings tokens | 9.7 KB |
| Compact ID/settings data compressed with gzip and encoded as base64url | 5.2 KB |

The alternative sizes are prototypes for comparison, not implemented URL contracts. Compressed payload lengths exclude the short URL/version envelope. Gzip content encoding on the HTTP response does not compress the request URL; compression here must happen in the application before constructing the link.

For a query-based v2, store stable city IDs and display/hour flags in array order, omitting repeated labels, country names, and zone strings. Resolve them from a versioned city catalog, handle missing IDs explicitly, and retain v1 decoding. Compress and base64url-encode the compact data if needed. This sample becomes roughly 5.2 KB, but that is not a guarantee for arbitrary configurations or all hosts. Unlike v1's self-contained records, ID-based restoration needs the catalog on initial load.

Alternatively, store the compressed configuration in a URL fragment (`#...`). [Fragments are not sent to the server](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment), avoiding the HTTP request-target limit while keeping client-side restoration and sharing. Browser and sharing-tool limits still apply.

For a deliberate 1,000-clock target, also render only visible cards plus a small buffer, update only those cards, and compute shared zone times once per tick. Reordering must operate on the full state array independently of rendered cards. Test the final encoded link through the intended hosting provider and on mobile before promising support.

Original recommendation: compact versioned IDs/settings with compression for continued query compatibility; a fragment offers more transport headroom if query storage is optional. Pair either with rendering improvements. At the time of this analysis, the implementation retained v1 and made no 1,000-clock reliability guarantee.
