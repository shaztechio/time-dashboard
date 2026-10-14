# Time Dashboard — Implemented Specification

Updated: 2026-10-15. Implemented locally; publishing is a separate action.

## Product

A mobile-friendly static world-clock dashboard. All state and behavior run in the browser; hosting serves static HTML, CSS, JavaScript, and city catalogs. No account, application server, runtime city API, or database is required.

- Four default clocks: Los Angeles, UTC, Kolkata, Shanghai, in that order.
- New clocks default to analog and 24-hour formatting and append to the current order.
- User-defined order is persistent. Earliest to latest and Latest to earliest explicitly sort by current UTC offset; ticks and daylight saving changes never reorder clocks automatically.
- Support 1,000 clocks with a soft cap: show a warning at 1,000 and in Add Clock when an addition reaches that threshold. Allow additions above it and preserve all records.
- Render detailed clocks only near the viewport, with a small buffer, and update only mounted cards. Preserve lightweight full-list layout slots for scrolling and keyboard access.

## Appearance and controls

Use an iOS World Clock-inspired interface, large clocks, centered text, rounded cards and pill buttons, and orange accents. Display the city/country once, followed by timezone abbreviation and numeric UTC offset. UTC is an explicit non-city reference.

Analog clocks maximize the dial and have no visible digital readout; retain a readable time description for assistive technology. Dials are light from 06:00 through 17:59 local time and dark otherwise, independently of page theme. This is a day/night convention, not a sunrise calculation. Digital clocks show seconds and the configured 12/24-hour format.

The page offers Copy times, Copy link, Add clock, explicit time sorting, and Restore defaults. Dark / Light / System is centered at the bottom of the page. System is the default and follows device appearance changes. Save only the theme preference locally; unavailable browser storage must not prevent use.

Tap anywhere on the front of a card to flip to its settings. The back contains the city name, a pill-shaped Done button with a subtle hover highlight, analog/digital and 12/24-hour controls, Move earlier/later, and Remove. Do not show a redundant Clock settings heading. Done, Escape, or tapping the settings background returns to the front. Controls and drag handles do not trigger a flip. Hidden faces are inert and excluded from the accessibility tree.

## Dragging and ordering

Drag a dedicated handle with mouse or touch. The actual card lifts above a moving placeholder, pivots around the grabbed point, trails the pointer slightly, and responds to timestamped pointer velocity in both axes. Handle direction reversals and decay stale velocity when the pointer stops. Use stable spring integration across frame rates.

Surrounding cards slide into the prospective positions, including between rows. The grid auto-scrolls near viewport edges and mounts newly visible cards without losing the dragged card. On release, commit one URL history entry and ease the card flat into its slot. Escape, pointer cancellation, resizing, and interruption cancel an active preview without changing its saved order. A drop outside the grid returns to its original slot.

Reduced-motion mode follows the pointer directly without tilt, neighbor animation, or animated settling. Arrow keys on a handle and Move earlier/later controls provide keyboard alternatives. Pointer clicks do not draw a handle focus outline; keyboard navigation retains visible focus. Full-array order remains authoritative even when most cards are not mounted.

## Adding cities

Load the packaged GeoNames search catalog on demand. Search names, regions, countries, timezone identifiers, aliases, and transliterations with accent-insensitive matching. Provide keyboard selection, clear duplicate indicators, empty results, and retry on catalog failure. Allow different cities sharing one timezone; disallow duplicate city IDs, including the UTC reference.

Use my timezone reads the browser's IANA timezone without geolocation permission or external lookups. Resolve canonical aliases, prefer the zone's named city (otherwise its largest matching city), and suggest it for confirmation. Show other matching cities, handle already-added and missing matches, and retain manual search. It is a timezone suggestion, not a claim about physical location.

## Timekeeping

Use the device clock and browser Intl/IANA timezone rules. Include fractional offsets, seasonal abbreviations, daylight saving transitions, date boundaries, and southern hemisphere transitions. Preserve legitimate abbreviations longer than three letters; use a numeric GMT fallback when no supported abbreviation is available.

Use one instant per tick, calculate each mounted zone once, and refresh after returning from suspension or a hidden page. Avoid DOM updates more often than once per second unless card settings or visible membership change. Explicit full-list operations such as sorting or copying may process every clock.

## URL state

The authoritative format is documented in [URL-FORMAT.md](URL-FORMAT.md):

```text
#v2.<catalog-version>.<gzip-base64url-payload>
```

Pack ordered city IDs and format flags into an integer array, gzip the JSON, and base64url-encode it without padding. Names, countries, and zones come from an immutable versioned static lookup catalog. The fragment is not sent to the host in HTTP requests. No v1 compatibility is required or implemented.

Preserve order, settings, and an explicit empty list across sharing, reload, Back, Forward, and direct fragment navigation. Reject malformed payloads, unavailable versions, unknown/duplicate cities, unsupported zones, and excessive decoded buffers with an explanatory notice. Keep the original URL when falling back to defaults so the user can retry a transient lookup failure. Apply catalog results only if the navigation is still current.

Copy link uses the same encoder. Copy times creates a single-instant text snapshot of the full ordered list, including offscreen cities, local dates, selected hour formats, timezone abbreviations, and offsets. If clipboard access fails, show selectable text for manual copying. Disable Copy times for an empty dashboard.

## Accessibility and responsive layout

Support 320 px phones, tablets, and desktop layouts with no horizontal overflow. Provide labeled controls, semantic lists, accessible city search, keyboard ordering, visible keyboard focus, and non-disruptive action/error announcements. Do not announce every time tick as a live region. Unmounted slots are keyboard reachable and materialize their cards when focused. Keep focused cards mounted until focus leaves.

## Validation and delivery

- Unit tests: URL packing/compression/validation, 1,000+ record round-trips, catalog integrity, search, duplicate handling, timezone suggestions, DST, fractional offsets, time text, and drag motion.
- Browser tests: desktop/mobile layout, card settings, theme modes and storage failures, search and retries, copy fallbacks, custom order, pointer/keyboard dragging, cancellation, and history.
- Scale tests: real 1,000-clock fragment navigation and reload, bounded mounted cards and time formatting, middle/end scrolling, drag auto-scroll across virtualized rows, full-state edits/order/copy/sort, fresh shared links, 1,001 clocks, soft-cap warning transitions, and mobile width.
- Build: verify matching search/current lookup catalogs, retain supported immutable lookup versions and vendored license, then copy static assets to `dist/`.

The local browser checks do not replace testing the final deployed URL and real mobile/Safari/Firefox behavior. No deployment or external publication is implied by implementation.

## Time Travel

- A Time Travel toolbar button opens a date/time dialog with Freeze now, a timezone selector (device, UTC, dashboard zones), and elapsed ±1 hour / ±24 hour shortcuts.
- Set time & freeze pauses every clock at one shared instant. Cancel makes no change. Reject nonexistent local times during DST jumps and offer both occurrences for repeated local times, labeled with offsets.
- Show a persistent frozen banner with the exact UTC instant, blue card outlines, and a Frozen label on each visible card. Adjust time reopens the picker. Return to now resumes live time.
- Use the selected instant for dates, hands, digital displays, DST offsets, explicit sorting, and copied times. Newly mounted and added clocks use it too. Preserve virtualization and avoid formatting an unchanged frozen clock every second.
- Persist the optional instant as `at=YYYY-MM-DDTHH:mm:ssZ` alongside the v2 fragment. Reload, sharing, and browser history preserve it. Removing `at` restores live mode. Keep the picker timezone local to the editing session.

## Mini cards

Provide a page-wide Standard cards / Mini cards selector above the clocks. Mini view uses smaller cards in a denser responsive grid, with two columns on phones. Retain all clock controls, readable digital displays, scrollable settings backs, and Time Travel indicators. Recompute virtualized row geometry and drag targets for the selected layout. Default to mini cards. Persist standard view as `view=standard`, including reload, shared links, and Back/Forward; missing values and existing `view=mini` links use mini cards.

## Offline and catalog caching

Production builds emit versioned immutable search/lookup catalogs, Brotli/gzip variants, host header rules, and a revisioned app-shell service worker. Fetch production catalogs as explicit `.json.gz` files with browser decompression and ordinary JSON fallback, so GitHub Pages needs no custom server settings. Cache validated decoded JSON at the canonical URL to reuse existing offline caches. Save catalogs on successful first use, never preload the full search catalog during installation. Keep default and saved dashboards reloadable offline after their lookup is saved; search requires one successful online load. Validate app-shell hashes before installing and preserve active tabs until they close; clean up only obsolete caches belonging to this deployment. Storage/worker failures preserve online behavior. Development mode disables persistent offline behavior. See OFFLINE.md for the deployment contract and validation suite.
