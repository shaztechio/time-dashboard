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
import { mkdir, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { defaults, stateURL, readState } from '../src/state.js';

import { clockCatalog } from '../src/catalog.js';
const lookup = clockCatalog(JSON.parse(await readFile(new URL('../data/clock-catalog-2026-10-14.json', import.meta.url))));
const savedClocks = url => readState(url, lookup).clocks;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const testBase = new URL(process.env.TEST_URL || 'http://127.0.0.1:4173/');
testBase.searchParams.set('view', 'standard');
const base = testBase.href;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
const page = await context.newPage();
const errors = [];
const requests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => requests.push(request.url()));
await mkdir('test-results', { recursive: true });
const cards = page.locator('.clock-card');
async function count(expected) { await page.waitForFunction((n) => document.querySelectorAll('.clock-slot').length === n, expected); }
async function test(name, run) {
  const start = performance.now();
  await run();
  console.log(`PASS ${name} (${Math.round(performance.now() - start)}ms)`);
}
async function search(query) {
  await page.locator('#add-clock').click();
  await page.locator('#city-search').fill(query);
  await page.waitForFunction(() => !document.querySelector('#search-status').textContent.includes('Loading'));
}
try {
  await test('defaults, ticking, stable history, and desktop layout', async () => {
    await page.goto(base);
    await count(4);
    assert.deepEqual(await cards.locator('h3').allTextContents(), ['Los Angeles, United States', 'UTC', 'Kolkata, India', 'Shanghai, China']);
    assert.equal(await cards.first().getAttribute('data-hours'), '24');
    assert.deepEqual(await cards.evaluateAll(els => els.map(el => el.dataset.display)), ['analog', 'analog', 'analog', 'analog']);
    assert.equal(await cards.first().locator('.time-display').evaluate(el => el.getBoundingClientRect().width <= 1), true);
    assert.equal(await cards.first().locator('h3').evaluate(el => getComputedStyle(el).textAlign), 'center');
    assert.equal(requests.some((url) => /\/cities-[0-9-]+\.json/.test(url)), false);
    const before = await cards.first().locator('.time-seconds').textContent();
    const history = await page.evaluate(() => window.history.length);
    await page.waitForFunction((value) => document.querySelector('.time-seconds').textContent !== value, before);
    assert.equal(await page.evaluate(() => window.history.length), history);
    const boxes = await cards.evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().top));
    assert.equal(new Set(boxes).size, 1);
    await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  });
  await test('custom order, drag/keyboard controls, explicit sorts, URL and history', async () => {
    const initial = await cards.evaluateAll(els => els.map(el => el.dataset.id));
    await cards.first().locator('.reorder-handle').press('ArrowRight');
    const moved = [initial[1], initial[0], ...initial.slice(2)];
    assert.deepEqual(await cards.evaluateAll(els => els.map(el => el.dataset.id)), moved);
    assert.deepEqual(savedClocks(page.url()).map(c => c.id), moved);
    await page.goBack();
    await page.waitForFunction(id => document.querySelector('.clock-card').dataset.id === id, initial[0]);
    await page.goForward();
    await page.waitForFunction(id => document.querySelector('.clock-card').dataset.id === id, moved[0]);
    await page.reload();
    await count(4);
    assert.deepEqual(await cards.evaluateAll(els => els.map(el => el.dataset.id)), moved);
    const from = await cards.first().locator('.reorder-handle').boundingBox();
    const neighbor = page.locator(`.clock-card[data-id="${moved[1]}"]`);
    const neighborBefore = await neighbor.boundingBox();
    const to = await cards.last().boundingBox();
    const history = await page.evaluate(() => window.history.length);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.waitForFunction(() => {
      const card = document.querySelector('.dragging');
      return card && parseFloat(card.style.getPropertyValue('--drag-x')) > 100 && Math.abs(parseFloat(card.style.getPropertyValue('--tilt-z'))) > 1;
    });
    assert.equal(await page.locator('.card-placeholder').count(), 1);
    await page.waitForFunction(left => Math.abs(document.querySelector('.card-placeholder').getBoundingClientRect().left - left) < 1, to.x);
    assert.ok((await neighbor.boundingBox()).x < neighborBefore.x - 100, 'neighbor slides into the vacated slot before release');
    assert.equal(await page.evaluate(() => window.history.length), history);
    await page.screenshot({ path: 'test-results/dragging.png' });
    await page.mouse.up();
    assert.equal(await page.locator('.settling').count(), 1);
    await page.waitForSelector('.dragging', { state: 'detached' });
    assert.equal(await page.locator('.dragging, .card-placeholder').count(), 0);
    assert.deepEqual(await cards.evaluateAll(els => els.map(el => el.dataset.id)), [...moved.slice(1), moved[0]]);
    assert.equal(await page.evaluate(() => window.history.length), history + 1);
    await cards.last().click({ position: { x: 80, y: 170 } });
    await cards.last().getByRole('button', { name: 'Move earlier', exact: false }).click();
    const custom = await cards.evaluateAll(els => els.map(el => el.dataset.id));
    assert.deepEqual(custom, [moved[1], moved[2], moved[0], moved[3]]);
    const second = await cards.first().locator('.time-seconds').textContent();
    await page.waitForFunction(value => document.querySelector('.time-seconds').textContent !== value, second);
    assert.deepEqual(await cards.evaluateAll(els => els.map(el => el.dataset.id)), custom);
    await page.locator('#sort-descending').click();
    assert.deepEqual(await cards.evaluateAll(els => els.map(el => el.dataset.id)), [...initial].reverse());
    await page.locator('#sort-ascending').click();
    assert.deepEqual(await cards.evaluateAll(els => els.map(el => el.dataset.id)), initial);
    await page.goto(base);
    await count(4);
  });
  await test('drag cancellation and flat movement with reduced motion', async () => {
    const before = page.url();
    const handle = cards.first().locator('.reorder-handle');
    const from = await handle.boundingBox();
    const x = from.x + from.width / 2;
    const y = from.y + from.height / 2;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 110, y + 70, { steps: 6 });
    await page.waitForFunction(() => document.querySelector('.dragging')?.style.getPropertyValue('--drag-x') === '110px');
    assert.equal(await page.locator('.dragging').evaluate(el => el.style.getPropertyValue('--tilt-z')), '0deg');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.equal(await page.locator('.dragging, .card-placeholder').count(), 0);
    assert.equal(page.url(), before);
    assert.equal(await cards.first().evaluate(el => el.style.position), '');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });
  await test('live rearrangement across rows, reverse dragging, and cancellation', async () => {
    await page.setViewportSize({ width: 768, height: 1400 });
    const initial = await cards.evaluateAll(els => els.map(el => el.dataset.id));
    const source = await cards.last().locator('.reorder-handle').boundingBox();
    const destination = await cards.first().boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(destination.x + destination.width / 2, destination.y + 160, { steps: 15 });
    await page.waitForFunction(top => Math.abs(document.querySelector('.card-placeholder').getBoundingClientRect().top - top) < 1, destination.y);
    const second = await page.locator('.dragging .time-seconds').textContent();
    await page.waitForFunction(value => document.querySelector('.dragging .time-seconds').textContent !== value, second);
    assert.ok(Math.abs((await page.locator('.card-placeholder').boundingBox()).y - destination.y) < 1);
    await page.mouse.up();
    await page.waitForSelector('.dragging', { state: 'detached' });
    assert.deepEqual(await cards.evaluateAll(els => els.map(el => el.dataset.id)), [initial[3], ...initial.slice(0, 3)]);
    const saved = page.url();
    const handle = await cards.first().locator('.reorder-handle').boundingBox();
    const last = await cards.last().boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width / 2, last.y + 160, { steps: 15 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.equal(page.url(), saved);
    assert.deepEqual(await cards.evaluateAll(els => els.map(el => el.dataset.id)), [initial[3], ...initial.slice(0, 3)]);
    assert.equal(await page.locator('.card-placeholder, .dragging').count(), 0);
    await page.goto(base);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await count(4);
  });
  await test('independent formats, browser Back/Forward, and fresh URL load', async () => {
    const beforeFlip = page.url();
    assert.equal(await cards.first().locator('.card-back').evaluate(el => el.inert), true);
    await cards.first().click({ position: { x: 80, y: 170 } });
    assert.equal(page.url(), beforeFlip);
    assert.equal(await cards.first().locator('.card-front').evaluate(el => el.inert), true);
    await cards.first().getByRole('button', { name: 'Digital', exact: true }).click();
    assert.equal(await cards.first().getAttribute('data-flipped'), 'true');
    await cards.first().getByRole('button', { name: '12-hour', exact: true }).click();
    await page.screenshot({ path: 'test-results/settings.png', fullPage: true });
    await cards.first().locator('.settings-city').click();
    assert.equal(await cards.first().locator('.flip-open').evaluate(el => el === document.activeElement), true);
    assert.equal(await cards.first().getAttribute('data-display'), 'digital');
    assert.equal(await cards.first().getAttribute('data-hours'), '12');
    assert.equal(await cards.nth(1).getAttribute('data-display'), 'analog');
    const url = page.url();
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('.clock-card').dataset.hours === '24');
    await page.goForward();
    await page.waitForFunction(() => document.querySelector('.clock-card').dataset.hours === '12');
    const fresh = await browser.newPage();
    await fresh.goto(url);
    await fresh.waitForSelector('.clock-card[data-display="digital"][data-hours="12"]');
    await fresh.close();
    await page.screenshot({ path: 'test-results/mixed.png', fullPage: true });
  });
  await test('keyboard city selection, aliases, and duplicates', async () => {
    await search('Tokyo');
    assert.equal(await page.locator('#city-search').evaluate((el) => el === document.activeElement), true);
    await page.locator('#city-search').press('ArrowDown');
    await page.locator('#city-search').press('Enter');
    assert.equal(await page.locator('#city-dialog input[name="display"][value="analog"]').isChecked(), true);
    await page.locator('#confirm-add').click();
    await count(5);
    assert.equal(await page.locator('.clock-card[data-id="geonames:1850147"]').getAttribute('data-display'), 'analog');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'geonames:1850147');
    await search('Los Angeles');
    assert.equal(await page.locator('.city-option').first().getAttribute('aria-disabled'), 'true');
    await page.locator('#city-search').fill('Bombay');
    assert.match(await page.locator('.city-option').first().textContent(), /Mumbai/);
    await page.locator('#city-search').fill('zzzzzzzzz');
    assert.equal(await page.locator('.city-option').count(), 0);
    await page.locator('#city-search').press('Escape');
    assert.equal(await page.locator('#add-clock').evaluate((el) => el === document.activeElement), true);
  });
  await test('adding beyond eight, removal, empty-state URL, and restoring defaults', async () => {
    for (const city of ['London', 'Paris', 'Singapore', 'New York']) {
      await search(city);
      await page.locator('.city-option').first().click();
      await page.locator('#confirm-add').click();
    }
    await count(9);
    assert.equal(await page.locator('#add-clock').isDisabled(), false);
    const nineURL = page.url();
    await page.reload();
    await count(9);
    console.log(`Nine-clock link length: ${nineURL.length} characters`);
    while (await page.locator('.clock-slot').count()) {
      await page.locator('.clock-slot').first().scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.clock-slot .clock-card'));
      await cards.first().locator('.flip-open').click();
      await cards.first().locator('.remove').click();
    }
    assert.equal(await page.locator('#empty').isVisible(), true);
    assert.deepEqual(savedClocks(page.url()), []);
    await page.reload();
    await page.waitForSelector('#empty', { state: 'visible' });
    await page.locator('#restore').click();
    await count(4);
  });
  await test('copy times follows custom order, leaves URL intact, and offers manual fallback', async () => {
    await cards.first().locator('.reorder-handle').press('ArrowRight');
    const titles = await cards.locator('h3').allTextContents();
    const url = page.url();
    await page.evaluate(() => {
      window.copiedTimes = '';
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedTimes = text; } }, configurable: true });
    });
    await page.locator('#copy-times').click();
    const copied = await page.evaluate(() => window.copiedTimes);
    assert.deepEqual(copied.split('\n').map(line => line.split(' — ')[0]), titles);
    assert.match(copied, /\d{2}:\d{2}:\d{2}.*UTC/);
    assert.equal(page.url(), url);
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('Unavailable')); });
    await page.locator('#copy-times').click();
    await page.waitForSelector('#share-dialog[open]');
    assert.equal(await page.locator('#share-title').textContent(), 'Cities and times');
    assert.deepEqual((await page.locator('#share-url').inputValue()).split('\n').map(line => line.split(' — ')[0]), titles);
    assert.equal(await page.locator('#share-url').evaluate(el => el.selectionEnd === el.value.length && el.selectionStart === 0), true);
    await page.locator('#close-share').click();
  });
  await test('invalid links, safe text rendering, and clipboard fallback', async () => {
    await page.goto(`${base}&v=99&clocks=[]`);
    await count(4);
    assert.equal(await page.locator('#notice').isVisible(), true);
    assert.ok(page.url().includes('v=99'));
    const clocks = defaults();
    clocks[0].place = '<img src=x onerror=alert(1)>';
    await page.goto(stateURL(base, clocks));
    await count(4);
    assert.equal(await cards.first().locator('h3').textContent(), 'Los Angeles, United States'); // URL labels are resolved from the trusted catalog.
    assert.equal(await cards.locator('img').count(), 0);
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('Unavailable')) }, configurable: true }); });
    await page.locator('#copy-link').click();
    await page.waitForSelector('#share-dialog[open]');
    assert.equal(await page.locator('#share-title').textContent(), 'Your dashboard link');
    assert.match(new URL(await page.locator('#share-url').inputValue()).hash, /^#v2\./);
    await page.locator('#close-share').click();
  });
  await test('search failure leaves clocks live and can retry', async () => {
    await page.route('**/data/cities-*.json', (route) => route.abort());
    await page.goto(base);
    await count(4);
    await page.locator('#add-clock').click();
    await page.waitForSelector('#search-error', { state: 'visible' });
    assert.equal(await cards.count(), 4);
    await page.unroute('**/data/cities-*.json');
    await page.locator('#retry-search').click();
    await page.waitForFunction(() => document.querySelector('#search-status').textContent.includes('places'));
    await page.locator('#city-search').fill('London');
    await page.screenshot({ path: 'test-results/search.png', fullPage: true });
    await page.locator('#cancel-dialog').click();
  });
  await test('320px mobile layout, touch controls, reduced motion, and dialog', async () => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(base);
    await count(4);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const boxes = await cards.evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().left));
    assert.equal(new Set(boxes).size, 1);
    await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
    await cards.first().locator('.flip-open').click();
    assert.equal(await cards.first().locator('.card-front').evaluate(el => el.inert), true);
    await cards.first().locator('.flip-close').press('Escape');
    assert.equal(await cards.first().getAttribute('data-flipped'), 'false');
    await search('sao paulo');
    assert.match(await page.locator('.city-option').first().textContent(), /São Paulo/);
    assert.equal(await page.locator('#confirm-add').isVisible(), true);
    assert.equal(await page.evaluate(() => document.querySelector('dialog[open]').scrollWidth <= innerWidth), true);
    await page.screenshot({ path: 'test-results/mobile-search.png', fullPage: true });
    await page.locator('#close-dialog').click();
    await page.setViewportSize({ width: 768, height: 900 });
    const tablet = await page.locator('.clock-slot').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    assert.equal(new Set(tablet).size, 2);
  });
  await test('device timezone suggestion, adding, duplicates, and missing city', async () => {
    for (const [zone, city] of [['Asia/Singapore', 'Singapore'], ['America/Los_Angeles', 'Los Angeles'], ['Etc/GMT+12', null]]) {
      const localContext = await browser.newContext({ timezoneId: zone, viewport: { width: 900, height: 1000 } });
      const local = await localContext.newPage();
      local.on('pageerror', error => errors.push(error.message));
      await local.goto(base);
      await local.locator('#add-clock').click();
      await local.locator('#use-timezone').click();
      await local.waitForFunction(() => !document.querySelector('#use-timezone').disabled);
      if (zone === 'Asia/Singapore') {
        assert.match(await local.locator('#selection').textContent(), /Selected: Singapore/);
        assert.equal(await local.locator('#confirm-add').isEnabled(), true);
        await local.screenshot({ path: 'test-results/timezone.png', fullPage: true });
        await local.locator('#confirm-add').click();
        await local.waitForSelector('.clock-card[data-id="geonames:1880252"]');
        const records = savedClocks(local.url());
        assert.equal(records.at(-1).zone, zone);
        await local.locator('#add-clock').click();
        await local.locator('#use-timezone').click();
        await local.waitForFunction(() => !document.querySelector('#use-timezone').disabled);
        assert.match(await local.locator('#timezone-status').textContent(), /already added/);
      } else if (city) {
        assert.match(await local.locator('#timezone-status').textContent(), /Los Angeles is already added/);
        assert.equal(await local.locator('#confirm-add').isDisabled(), true);
      } else {
        assert.match(await local.locator('#timezone-status').textContent(), /No matching city/);
        assert.equal(await local.locator('#confirm-add').isDisabled(), true);
      }
      await local.locator('#city-search').fill('Tokyo');
      assert.match(await local.locator('.city-option').first().textContent(), /Tokyo/);
      await localContext.close();
    }
  });
  await test('theme modes, persistence, system changes, and pill-shaped Done', async () => {
    const themes = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1440, height: 1100 } });
    const local = await themes.newPage();
    local.on('pageerror', error => errors.push(error.message));
    await local.goto(base);
    assert.equal(await local.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await local.locator('[data-theme-choice="system"]').getAttribute('aria-pressed'), 'true');
    const url = local.url();
    await local.locator('[data-theme-choice="light"]').click();
    assert.equal(await local.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await local.locator('html').evaluate(el => getComputedStyle(el).colorScheme), 'light');
    assert.equal(local.url(), url);
    await local.reload();
    assert.equal(await local.locator('[data-theme-choice="light"]').getAttribute('aria-pressed'), 'true');
    await local.locator('.flip-open').first().click();
    assert.equal(await local.locator('.card-back h4').count(), 0);
    const done = local.locator('.flip-close').first();
    assert.equal(await done.evaluate(el => getComputedStyle(el).borderRadius), await local.locator('#copy-link').evaluate(el => getComputedStyle(el).borderRadius));
    await done.hover();
    await local.screenshot({ path: 'test-results/light-theme.png', fullPage: true });
    await done.click();
    await local.locator('#add-clock').click();
    await local.locator('#city-search').fill('Tokyo');
    await local.waitForSelector('.city-option');
    await local.screenshot({ path: 'test-results/light-dialog.png' });
    await local.locator('#close-dialog').click();
    await local.locator('[data-theme-choice="dark"]').click();
    await local.emulateMedia({ colorScheme: 'light' });
    assert.equal(await local.locator('html').getAttribute('data-theme'), 'dark');
    await local.locator('.flip-open').first().click();
    await done.hover();
    await local.screenshot({ path: 'test-results/dark-theme.png' });
    await done.click();
    await local.locator('[data-theme-choice="system"]').click();
    assert.equal(await local.locator('html').getAttribute('data-theme'), 'light');
    await local.emulateMedia({ colorScheme: 'dark' });
    await local.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await local.emulateMedia({ colorScheme: 'light' });
    await local.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await local.setViewportSize({ width: 320, height: 740 });
    assert.equal(await local.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await local.screenshot({ path: 'test-results/light-mobile.png', fullPage: true });
    await themes.close();
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } }));
    const fallback = await blocked.newPage();
    fallback.on('pageerror', error => errors.push(error.message));
    await fallback.goto(base);
    await fallback.locator('[data-theme-choice="dark"]').click();
    assert.equal(await fallback.locator('html').getAttribute('data-theme'), 'dark');
    await blocked.close();
  });
  await test('static subdirectory deployment, compact links, and timezone codes', async () => {
    const old = defaults();
    old[0].label = 'Pacific Time';
    old[2].label = 'India Time';
    old[3].label = 'China Time';
    await page.goto(stateURL(new URL('dist/', base).href, old));
    await count(4);
    assert.deepEqual(await cards.locator('h3').allTextContents(), ['Los Angeles, United States', 'UTC', 'Kolkata, India', 'Shanghai, China']);
    assert.match(await cards.first().locator('.zone-code').textContent(), /^P[SD]T$/);
    assert.equal(await cards.nth(2).locator('.zone-code').textContent(), 'IST');
    assert.equal(await cards.nth(3).locator('.zone-code').textContent(), 'CST');
    await search('Singapore');
    await page.locator('.city-option').first().click();
    await page.locator('#confirm-add').click();
    await count(5);
    assert.equal(new URL(page.url()).pathname, '/dist/');
    assert.ok((await cards.locator('h3').allTextContents()).includes('Singapore'));
    await page.reload();
    await count(5);
  });
  assert.deepEqual(errors, []);
  assert.equal(requests.some((url) => !url.startsWith(new URL(base).origin)), false);
  console.log('All browser checks passed; no page errors or external runtime requests.');
} finally { await browser.close(); }
