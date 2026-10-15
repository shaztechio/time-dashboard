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
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = await mkdtemp(join(tmpdir(), 'clock-deployment-'));
let browser, server;
try {
  const previous = join(root, 'previous');
  await cp('dist', previous, { recursive: true });
  const oldManifest = JSON.parse(await readFile(join(previous, 'build-manifest.json')));
  const oldIndex = await readFile(join(previous, 'index.html'), 'utf8');
  // Build a real second release that changes an entry module, a transitive
  // dependency, and the stylesheet independently, while retaining release A.
  for (const file of ['scripts', 'src', 'data', 'index.html', 'styles.css', 'favicon.svg', 'social-preview.png', 'LICENSE', 'package.json']) {
    await cp(file, join(root, file), { recursive: true });
  }
  for (const [file, marker] of [
    ['src/app.js', "document.documentElement.dataset.entryRelease = 'B';\n"],
    ['src/state.js', "document.documentElement.dataset.dependencyRelease = 'B';\n"],
    ['styles.css', ':root { --release-probe: B; }\n'],
  ]) await writeFile(join(root, file), (await readFile(join(root, file), 'utf8')) + '\n' + marker);
  await promisify(execFile)(process.execPath, ['scripts/build.mjs'], { cwd: root, env: { ...process.env, PREVIOUS_SITE_DIR: previous } });
  const current = join(root, 'dist');
  const newManifest = JSON.parse(await readFile(join(current, 'build-manifest.json')));
  assert.notEqual(newManifest.revision, oldManifest.revision);
  for (const file of oldManifest.retainedAssets) {
    assert.deepEqual(await readFile(join(current, file)), await readFile(join(previous, file)), `Published asset changed: ${file}`);
  }
  await cp(current, join(root, 'app'), { recursive: true });
  server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, SERVE_DIR: root, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  const origin = await new Promise((resolve, reject) => {
    server.stdout.on('data', chunk => { const match = String(chunk).match(/Local: (http:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    server.on('error', reject); server.on('exit', code => reject(new Error(`Server exited ${code}`)));
  });
  browser = await chromium.launch({ headless: true });
  for (const staleHTML of [false, true]) {
    // Test a first visit with no service worker: this was the original hole.
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await context.route('**/*', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/app/' && staleHTML) return route.fulfill({ contentType: 'text/html', body: oldIndex });
      // Simulate an edge with stale responses at every old mutable asset URL.
      const source = path.slice('/app/'.length);
      if (path.startsWith('/app/') && /^(src\/.+\.js|styles\.css)$/.test(source) && !/\.[a-f0-9]{20}\./.test(source)) {
        return route.fulfill({ contentType: source.endsWith('.css') ? 'text/css' : 'text/javascript', body: 'throw new Error("stale unversioned asset")' });
      }
      return route.continue();
    });
    await page.goto(origin + '/app/');
    await page.waitForSelector('.clock-card');
    const release = await page.evaluate(() => ({
      entry: document.documentElement.dataset.entryRelease ?? 'A',
      dependency: document.documentElement.dataset.dependencyRelease ?? 'A',
      css: getComputedStyle(document.documentElement).getPropertyValue('--release-probe').trim() || 'A',
    }));
    const expected = staleHTML ? 'A' : 'B';
    assert.deepEqual(release, { entry: expected, dependency: expected, css: expected });
    assert.ok(requests.filter(url => /\.(js|css)$/.test(url)).every(url => url.includes(staleHTML ? oldManifest.revision : newManifest.revision)));
    await page.locator('#menu-toggle').click();
    await page.locator('[data-theme-choice="light"]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${staleHTML ? 'stale' : 'fresh'} HTML loads one complete release despite stale mutable assets, without a service worker.`);
  }
  // A cached older worker must install its own HTML snapshot successfully even
  // when the live entry page already belongs to B.
  await writeFile(join(root, 'app/sw.js'), await readFile(join(previous, 'sw.js')));
  for (const ext of ['.br', '.gz']) await rm(join(root, 'app/sw.js' + ext));
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin + '/app/');
  await page.waitForFunction(() => navigator.serviceWorker.controller && document.querySelector('#offline-status').textContent.includes('Ready offline'));
  await page.reload();
  await page.waitForSelector('.clock-card');
  assert.equal(await page.locator('html').getAttribute('data-entry-release'), null);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.clock-card');
  assert.equal(await page.locator('html').getAttribute('data-dependency-release'), null);
  await context.close();
  console.log('PASS stale worker installs its matching immutable HTML snapshot and serves a consistent release offline.');
} finally {
  await browser?.close(); server?.kill(); await rm(root, { recursive: true, force: true });
}
