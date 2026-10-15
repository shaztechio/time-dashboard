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
import { createHash } from 'node:crypto';
import { posix } from 'node:path';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// One fingerprint covers the whole graph, including cycles between modules.
// Relative directories stay intact so catalog URLs and worker scope are stable.
export function fingerprintShell(sources, salt) {
  const entries = [...sources].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const revision = digest(JSON.stringify(entries.map(([file, bytes]) => [file, digest(bytes)])) + salt).slice(0, 20);
  const assets = Object.fromEntries(entries.map(([file]) => {
    const extension = posix.extname(file);
    return [file, `${file.slice(0, -extension.length)}.${revision}${extension}`];
  }));
  const files = new Map();
  for (const [file, bytes] of entries) {
    let content = bytes;
    if (file.endsWith('.js')) {
      content = bytes.toString().replace(/(\b(?:from\s*|import\s*)['"])(\.{1,2}\/[^'"]+\.js)(['"])/g, (match, before, specifier, after) => {
        const dependency = posix.normalize(posix.join(posix.dirname(file), specifier));
        if (!assets[dependency]) throw new Error(`Unknown module ${specifier} in ${file}`);
        const relative = posix.relative(posix.dirname(file), assets[dependency]);
        return before + (relative.startsWith('.') ? relative : './' + relative) + after;
      });
      // A new document bypasses a CDN's previous worker response. The worker
      // still has a stable URL per installed release for automatic update checks.
      content = content.replace("'../sw.js'", `'../sw.js?release=${revision}'`);
    } else if (file === 'index.html') {
      content = bytes.toString().replace(/((?:src|href)="\.\/)([^"]+)(")/g, (match, before, path, after) => {
        if (!assets[path]) throw new Error(`Unversioned entry asset: ${path}`);
        return before + assets[path] + after;
      }).replaceAll('social-preview.png', assets['social-preview.png'] ?? 'social-preview.png');
    }
    files.set(assets[file], content);
  }
  return { revision, assets, files, index: assets['index.html'] };
}
