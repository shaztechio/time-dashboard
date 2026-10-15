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
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
const base = process.env.TEST_URL || 'http://127.0.0.1:4173/';
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', { recursive: true });
const openMenu = () => page.locator('#menu-toggle').click();
try {
  await page.goto(base);
  await page.waitForSelector('.clock-card');
  for (const width of [320, 390, 640]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.locator('#add-clock').isVisible(), false);
    assert.equal(await page.locator('.theme-controls').isVisible(), false);
    assert.ok((await page.locator('#clocks').boundingBox()).y < 130);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await openMenu();
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'true');
    for (const selector of ['#add-clock', '#copy-times', '#copy-link', '#time-travel', '.view-controls', '.sort-controls', '.theme-controls', '#restore']) {
      assert.equal(await page.locator(`#mobile-menu ${selector}`).isVisible(), true);
    }
    assert.equal(await page.locator('#menu-travel').isVisible(), false);
    await page.locator('#close-menu').focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#restore').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#close-menu').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#menu-toggle').evaluate(el => el === document.activeElement), true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile-showcase.png', fullPage: true });
  await openMenu();
  await page.screenshot({ path: 'test-results/mobile-menu.png' });
  await page.locator('[data-theme-choice="light"]').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.screenshot({ path: 'test-results/mobile-menu-light.png' });
  await page.locator('button[data-card-view="standard"]').click();
  assert.equal(await page.locator('body').getAttribute('data-card-view'), 'standard');
  await page.locator('#sort-descending').click();
  assert.match(await page.locator('.clock-slot').first().getAttribute('aria-label'), /Beijing/);
  await page.locator('#add-clock').click();
  assert.equal(await page.locator('#mobile-menu').isVisible(), false);
  assert.equal(await page.locator('#city-dialog').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#menu-toggle').evaluate(el => el === document.activeElement), true);
  await openMenu();
  await page.locator('#time-travel').click();
  await page.locator('#freeze-now').click();
  assert.equal(await page.locator('#frozen-banner').isVisible(), true);
  assert.equal(await page.locator('#resume-time').isVisible(), false);
  await openMenu();
  assert.equal(await page.locator('#resume-time').isVisible(), true);
  await page.locator('#resume-time').click();
  assert.equal(await page.locator('#frozen-banner').isVisible(), false);
  assert.equal(await page.locator('#menu-toggle').evaluate(el => el === document.activeElement), true);
  await openMenu();
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.waitForFunction(() => document.querySelector('.site-header #add-clock'));
  assert.equal(await page.locator('#mobile-menu').isVisible(), false);
  assert.equal(await page.locator('#menu-toggle').isVisible(), false);
  assert.equal(await page.locator('footer .theme-controls').isVisible(), true);
  assert.equal(await page.locator('.dashboard-bottom #restore').isVisible(), true);
  await page.locator('#add-clock').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#add-clock').evaluate(el => el === document.activeElement), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('#mobile-menu #add-clock'));
  assert.equal(await page.locator('#menu-toggle').evaluate(el => el === document.activeElement), true);
  assert.deepEqual(errors, []);
  console.log('PASS mobile menu: responsive layout, controls, themes, keyboard focus, dialogs, Time Travel, and desktop restoration.');
} finally { await browser.close(); }
