# Vendored compression

`fflate.js` is the browser ES module from [fflate 0.8.3](https://github.com/101arrowz/fflate), with the local security patch described below, distributed under the included MIT license (`fflate.LICENSE`). Source: npm package `fflate@0.8.3`, `esm/browser.js`.

Local security patch: `inflt` treats a fixed output buffer as a hard limit. It throws before a stored block, literal, or backreference would exceed that buffer. Upstream silently truncates compressed output while continuing to inflate it, allowing a forged gzip size and prefix CRC to bypass the URL decoder's size check. Preserve this patch (or equivalent bounded decompression) when upgrading, and run the forged-size and decoded-limit regressions in `tests/state.test.js`.

The URL encoder/decoder imports only `gzipSync` and `gunzipSync`. Explicit catalog downloads use the browser's `DecompressionStream('gzip')` with ordinary JSON fallback instead; build-time gzip/Brotli generation uses Node's zlib. Files are served locally with the app; there are no CDN requests or install steps at runtime. The pinned version and license must be kept together when upgrading.
