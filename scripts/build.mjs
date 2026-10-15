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
import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { digest as hash, fingerprintShell } from './release.mjs';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { CATALOG_VERSION, CATALOG_VERSIONS } from '../src/catalog.js';
const searchPath = `data/cities-${CATALOG_VERSION}.json`;
const search = JSON.parse(await readFile(searchPath, 'utf8'));
const lookup = JSON.parse(await readFile(`data/clock-catalog-${CATALOG_VERSION}.json`, 'utf8'));
if (search.snapshot !== CATALOG_VERSION || JSON.stringify(lookup.cities) !== JSON.stringify(search.cities.map(([id, name, , country, zone]) => [id, name, country, zone]))) throw new Error('Search and URL lookup catalogs must match the current catalog version');
const catalogs = [searchPath, ...CATALOG_VERSIONS.map(version => `data/clock-catalog-${version}.json`)];
for (const file of catalogs) await readFile(file);
const output = resolve('dist');
const previous = process.env.PREVIOUS_SITE_DIR ? resolve(process.env.PREVIOUS_SITE_DIR) : null;
if (previous === output || previous?.startsWith(output + sep)) throw new Error('Previous site must be outside dist');
await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'data'), { recursive: true });
for (const file of ['LICENSE', 'src/vendor/fflate.LICENSE', 'src/vendor/README.md', 'data/ATTRIBUTION.md', ...catalogs]) await cp(file, resolve(output, file), { recursive: true });
const defaultSiteURL = 'https://shaztechio.github.io/time-dashboard/';
const siteURL = new URL(process.env.SITE_URL || defaultSiteURL);
if (!['https:', 'http:'].includes(siteURL.protocol) || siteURL.username || siteURL.password) throw new Error('SITE_URL must be an HTTP(S) URL without credentials');
// Pages may report HTTP until HTTPS enforcement is enabled for a new domain.
siteURL.protocol = 'https:';
siteURL.search = ''; siteURL.hash = '';
if (!siteURL.pathname.endsWith('/')) siteURL.pathname += '/';
const escapedSiteURL = siteURL.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const index = (await readFile('index.html', 'utf8')).replaceAll(defaultSiteURL, escapedSiteURL).replace('</head>', '  <meta name="offline-enabled" content="true">\n</head>');

async function filesAt(dir, prefix = '') {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + item.name;
    if (item.isDirectory()) files.push(...await filesAt(resolve(dir, item.name), path + '/'));
    else files.push(path);
  }
  return files.sort();
}
const template = await readFile('scripts/sw-template.js', 'utf8');
const sources = new Map([['index.html', index]]);
for (const file of ['styles.css', 'favicon.svg', 'social-preview.png', ...(await filesAt('src')).filter(file => file.endsWith('.js')).map(file => 'src/' + file)]) {
  sources.set(file, await readFile(file));
}
const release = fingerprintShell(sources, template + JSON.stringify(catalogs) + await readFile('scripts/release.mjs', 'utf8') + await readFile('scripts/build.mjs', 'utf8'));
const retained = new Set();
// Carry published files forward verbatim. A stale HTML response must still be
// able to fetch its exact module graph after GitHub Pages replaces the site.
if (previous) {
  const manifest = JSON.parse(await readFile(resolve(previous, 'build-manifest.json'), 'utf8'));
  for (const file of new Set([...(manifest.retainedAssets ?? []), ...manifest.shell, ...(!manifest.assets ? ['social-preview.png'] : [])])) {
    if (file === 'index.html') continue; // Only the entry document is mutable.
    if (!/^(?:src\/)?[a-zA-Z0-9_./-]+\.(?:html|js|css|svg|png)$/.test(file) || file.split('/').includes('..') || file.startsWith('/') || file === 'sw.js') throw new Error(`Invalid retained asset: ${file}`);
    const bytes = await readFile(resolve(previous, file));
    if (release.files.has(file) && hash(release.files.get(file)) !== hash(bytes)) throw new Error(`Immutable asset changed: ${file}`);
    await mkdir(dirname(resolve(output, file)), { recursive: true });
    await writeFile(resolve(output, file), bytes);
    retained.add(file);
  }
}
for (const [file, bytes] of release.files) {
  await mkdir(dirname(resolve(output, file)), { recursive: true });
  await writeFile(resolve(output, file), bytes);
  retained.add(file);
}
await writeFile(resolve(output, 'index.html'), release.files.get(release.index));
const shell = [...release.files].map(([file, bytes]) => [file, hash(bytes)]);
const revision = release.revision;
await writeFile(resolve(output, 'sw.js'), template.replace('__REVISION__', revision).replace('__ASSETS__', JSON.stringify(shell)).replace('__CATALOGS__', JSON.stringify(catalogs)).replace('__INDEX__', release.index));
const files = await filesAt(output);
const manifest = { revision, index: release.index, assets: release.assets, shell: shell.map(([file]) => file), retainedAssets: [...retained].sort(), catalogs, compression: {} };
for (const file of files.filter(file => /\.(json|html|js|css|svg)$/.test(file))) {
  const raw = await readFile(resolve(output, file));
  const br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
  const gzip = gzipSync(raw, { level: 9 });
  await writeFile(resolve(output, file + '.br'), br);
  await writeFile(resolve(output, file + '.gz'), gzip);
  manifest.compression[file] = { raw: raw.length, br: br.length, gzip: gzip.length };
}
await writeFile(resolve(output, 'build-manifest.json'), JSON.stringify(manifest, null, 2));
// Hosts supporting _headers can apply this directly when deployed at their root.
const immutable = [...retained].filter(file => /\.[a-f0-9]{20}\./.test(file));
const headers = ['/', '/index.html', '/sw.js', ...[...retained].filter(file => !immutable.includes(file)).map(file => '/' + file)].map(path => `${path}\n  Cache-Control: no-cache`).concat([...immutable, ...catalogs.flatMap(path => [path, path + '.gz'])].map(path => `/${path}\n  Cache-Control: public, max-age=31536000, immutable\n  Vary: Accept-Encoding`));
await writeFile(resolve(output, '_headers'), headers.join('\n\n') + '\n');
console.log(`Static site ready in dist/ (${revision}); offline shell and Brotli/gzip variants included.`);
