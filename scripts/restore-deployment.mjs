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
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const destination = resolve(process.env.PREVIOUS_SITE_DIR || 'previous-site');
const gh = args => execFileSync('gh', args, { encoding: 'utf8' });
const runs = JSON.parse(gh(['run', 'list', '--workflow', 'pages.yml', '--branch', 'main', '--status', 'success', '--limit', '1', '--json', 'databaseId']));
await mkdir(destination, { recursive: true });
if (!runs.length) {
  await writeFile(resolve(destination, 'build-manifest.json'), JSON.stringify({ shell: [], assets: {} }));
  console.log('First deployment: no previous assets to retain.');
} else {
  const id = String(runs[0].databaseId);
  const { artifacts } = JSON.parse(gh(['api', `repos/${process.env.GH_REPO}/actions/runs/${id}/artifacts`]));
  const archive = artifacts.find(artifact => artifact.name === 'site-assets' && !artifact.expired);
  const legacy = artifacts.find(artifact => artifact.name === 'github-pages' && !artifact.expired);
  if (!archive && !legacy) throw new Error('Previous deployment archive is unavailable. Restore its published assets before deploying; refusing to remove URLs still used by cached pages.');
  gh(['run', 'download', id, '--name', archive ? 'site-assets' : 'github-pages', '--dir', destination]);
  if (!archive) execFileSync('tar', ['-xf', resolve(destination, 'artifact.tar'), '-C', destination]);
  console.log(`Restored published assets from deployment ${id}.`);
}
