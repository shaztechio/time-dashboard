# Vendored compression

`fflate.js` is the unmodified browser ES module from [fflate 0.8.3](https://github.com/101arrowz/fflate), distributed under the included MIT license (`fflate.LICENSE`). Source: npm package `fflate@0.8.3`, `esm/browser.js`.

The URL encoder/decoder imports only `gzipSync` and `gunzipSync`. Explicit catalog downloads use the browser's `DecompressionStream('gzip')` with ordinary JSON fallback instead; build-time gzip/Brotli generation uses Node's zlib. Files are served locally with the app; there are no CDN requests or install steps at runtime. The pinned version and license must be kept together when upgrading.
