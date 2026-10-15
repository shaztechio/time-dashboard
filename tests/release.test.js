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
import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintShell } from '../scripts/release.mjs';

const sources = () => new Map([
  ['index.html', '<script src="./src/theme.js"></script><script type="module" src="./src/app.js"></script><link href="./styles.css">'],
  ['src/theme.js', '/* pre-paint theme */'],
  ['src/app.js', "import './offline.js'; import { state } from './state.js';"],
  ['src/state.js', "import './app.js'; import { gzipSync } from './vendor/fflate.js'; export const state = 'A';"],
  ['src/vendor/fflate.js', 'export const gzipSync = () => {};'],
  ['src/offline.js', "new URL('../sw.js', import.meta.url); new URL('../data/cities.json', import.meta.url);"],
  ['styles.css', 'body { color: black }'],
]);
test('release fingerprint pins entry assets, side-effect imports, cycles, and vendor modules', () => {
  const release = fingerprintShell(sources(), 'worker');
  const html = release.files.get(release.index);
  for (const file of ['src/theme.js', 'src/app.js', 'styles.css']) assert.ok(html.includes(release.assets[file]));
  assert.ok(release.files.get(release.assets['src/app.js']).includes(`./state.${release.revision}.js`));
  assert.ok(release.files.get(release.assets['src/app.js']).includes(`./offline.${release.revision}.js`));
  assert.ok(release.files.get(release.assets['src/state.js']).includes(`./app.${release.revision}.js`));
  assert.ok(release.files.get(release.assets['src/state.js']).includes(`./vendor/fflate.${release.revision}.js`));
  assert.ok(release.files.get(release.assets['src/offline.js']).includes(`../sw.js?release=${release.revision}`));
  assert.ok(release.files.get(release.assets['src/offline.js']).includes('../data/cities.json'));
});
test('a transitive dependency or worker change gives every shell asset a new URL', () => {
  const before = fingerprintShell(sources(), 'worker');
  const changed = sources();
  changed.set('src/state.js', changed.get('src/state.js').replace("'A'", "'B'"));
  const after = fingerprintShell(changed, 'worker');
  for (const file of Object.keys(before.assets)) assert.notEqual(before.assets[file], after.assets[file]);
  assert.notEqual(before.revision, fingerprintShell(sources(), 'new worker').revision);
  assert.deepEqual(before, fingerprintShell(new Map([...sources()].reverse()), 'worker'));
});
test('unknown entry assets and module dependencies fail the build', () => {
  const broken = sources();
  broken.set('src/app.js', "import './missing.js';");
  assert.throws(() => fingerprintShell(broken, ''), /Unknown module/);
  broken.delete('src/app.js');
  assert.throws(() => fingerprintShell(broken, ''), /Unversioned entry asset/);
});
