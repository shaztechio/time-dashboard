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
import { defaults, readState, stateURL, clockTitle, decodeTokens, SOFT_CLOCK_LIMIT } from './state.js';
import { loadClockCatalog, CATALOG_VERSION } from './catalog.js';
import { catalogJSON } from './catalog-cache.js';
import './offline.js';
import { orderedClocks, timeAt } from './time.js';
import { createCard, updateCard } from './card.js';
import { utc, prepareCities, searchCities, citiesInZone, alreadyAdded, cityClock } from './search.js';
import { clocksText } from './clipboard.js';
import { pointerMotion, samplePointer, velocityAt, tiltTargets, spring } from './drag-physics.js';
import { readTravelTime, travelURL } from './travel-time.js';
import { setupTimeTravel } from './travel-ui.js';
import { setupMobileMenu } from './mobile-menu.js';

const $ = (selector) => document.querySelector(selector);
const grid = $('#clocks');
const dialog = $('#city-dialog');
const input = $('#city-search');
const results = $('#city-results');
const cards = new Map();
const slots = new Map();
const painted = new WeakMap();
let clockById = new Map();
let layout = { columns: 4, width: 0, height: 440, gap: 18 };
let viewportFrame = 0;
let locationRequest = 0;
let loadingLocation = false;
let activeLocation = '';
let frozenAt = null;
const currentInstant = () => frozenAt ?? new Date();
const todayFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
let clocks = [];
let catalog;
let catalogPromise;
let catalogFailed = false;
let resultCities = [];
let selected = null;
let activeIndex = -1;
let timezoneCities = null;
let timezoneRequest = 0;
let opener;
let toastTimer;

function announce(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}
function measureLayout() {
  const style = getComputedStyle(grid);
  const columns = style.gridTemplateColumns.split(' ').length;
  const gap = parseFloat(style.columnGap) || 0;
  const width = (grid.clientWidth - gap * (columns - 1)) / columns;
  const miniExtraHeight = parseFloat(style.getPropertyValue('--mini-card-extra-height')) || 100;
  const height = document.body.dataset.cardView === 'mini' ? Math.max(280, width + miniExtraHeight) : Math.max(440, width + 132);
  layout = { columns, gap, width, height };
  grid.style.setProperty('--card-height', `${height}px`);
}
function viewportIndices(order) {
  const rect = grid.getBoundingClientRect();
  const stride = layout.height + layout.gap;
  const first = Math.max(0, Math.floor((-rect.top - 400) / stride));
  const last = Math.max(0, Math.ceil((innerHeight - rect.top + 400) / stride));
  const indices = [];
  for (let i = first * layout.columns; i < Math.min(order.length, last * layout.columns); i++) indices.push(i);
  return indices;
}
function mountVisible() {
  const order = drag?.moved ? drag.order : clocks.map(clock => clock.id);
  const keep = new Set(viewportIndices(order).map(index => order[index]));
  const focusedId = document.activeElement?.closest('.clock-card')?.dataset.id;
  if (focusedId && clockById.has(focusedId)) keep.add(focusedId);
  if (drag) keep.add(drag.id);
  for (const [id, card] of cards) {
    if (!keep.has(id)) {
      card.remove(); cards.delete(id);
      const slot = slots.get(id);
      if (slot) slot.tabIndex = 0;
    }
  }
  for (const id of keep) {
    const clock = clockById.get(id);
    const slot = slots.get(id);
    if (!clock || !slot || cards.has(id)) continue;
    const card = createCard(clock, changeClock, removeClock, moveClock);
    cards.set(id, card);
    slot.removeAttribute('tabindex');
    slot.append(card);
  }
}
function tick() {
  const now = currentInstant();
  document.body.classList.toggle('time-frozen', frozenAt !== null);
  $('#frozen-banner').hidden = frozenAt === null;
  $('#time-travel').setAttribute('aria-pressed', String(frozenAt !== null));
  grid.setAttribute('aria-label', frozenAt ? 'Clocks, time frozen' : 'Clocks');
  if (frozenAt) {
    $('#frozen-instant').textContent = `${frozenAt.toISOString().slice(0,19).replace('T', ' ')} UTC`;
    $('#frozen-instant').dateTime = frozenAt.toISOString();
  }
  $('#utc-today').textContent = todayFormatter.format(now);
  $('#utc-today').dateTime = now.toISOString().slice(0, 10);
  mountVisible();
  const times = new Map();
  try {
    for (const [id, card] of cards) {
      const clock = clockById.get(id);
      if (!clock) continue;
      const previous = painted.get(card);
      const second = Math.floor(now.getTime() / 1000);
      if (previous?.clock !== clock || previous.second !== second) {
        if (!times.has(clock.zone)) times.set(clock.zone, timeAt(clock.zone, now));
        updateCard(card, clock, times.get(clock.zone));
        painted.set(card, { clock, second });
      }
      const index = Number(slots.get(id).dataset.index);
      card.querySelector('[data-move="-1"]').disabled = index === 0;
      card.querySelector('[data-move="1"]').disabled = index === clocks.length - 1;
    }
  } catch {
    $('#notice').textContent = 'Your browser could not display these time zones. Please update your browser and try again.';
    $('#notice').hidden = false;
  }
}
function scheduleViewport() {
  if (!viewportFrame) viewportFrame = requestAnimationFrame(() => { viewportFrame = 0; tick(); });
}
function focusClock(id) {
  const slot = slots.get(id);
  if (!slot) return;
  slot.scrollIntoView({ block: 'nearest' });
  tick();
  cards.get(id)?.focus({ preventScroll: true });
}
function render() {
  const focused = document.activeElement;
  clockById = new Map(clocks.map(clock => [clock.id, clock]));
  for (const [id, slot] of slots) if (!clockById.has(id)) { slot.remove(); slots.delete(id); cards.get(id)?.remove(); cards.delete(id); }
  clocks.forEach((clock, index) => {
    let slot = slots.get(clock.id);
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'clock-slot';
      slot.dataset.id = clock.id;
      slot.tabIndex = 0;
      slot.setAttribute('role', 'listitem');
      slots.set(clock.id, slot);
    }
    slot.dataset.index = index;
    slot.setAttribute('aria-label', `${clockTitle(clock)}, clock ${index + 1} of ${clocks.length}`);
    slot.setAttribute('aria-posinset', index + 1);
    slot.setAttribute('aria-setsize', clocks.length);
    if (!drag?.moved && grid.children[index] !== slot) grid.insertBefore(slot, grid.children[index] ?? null);
  });
  $('#clock-count').textContent = `${clocks.length} ${clocks.length === 1 ? 'clock' : 'clocks'}`;
  $('#empty').hidden = clocks.length > 0 || loadingLocation;
  $('#copy-times').disabled = clocks.length === 0 || loadingLocation;
  $('#copy-link').disabled = loadingLocation;
  $('#add-clock').disabled = loadingLocation;
  $('#restore').disabled = loadingLocation;
  $('#time-travel').disabled = loadingLocation;
  $('#adjust-time').disabled = loadingLocation;
  $('#resume-time').disabled = loadingLocation;
  $('#controls-toggle').disabled = loadingLocation;
  for (const button of document.querySelectorAll('button[data-card-view]')) button.disabled = loadingLocation;
  $('#sort-ascending').disabled = clocks.length < 2 || loadingLocation;
  $('#sort-descending').disabled = clocks.length < 2 || loadingLocation;
  $('#scale-warning').hidden = clocks.length < SOFT_CLOCK_LIMIT;
  grid.inert = loadingLocation;
  grid.setAttribute('aria-busy', String(loadingLocation));
  measureLayout();
  tick();
  if (focused?.isConnected && focused !== document.body && focused !== document.activeElement) focused.focus({ preventScroll: true });
}
function commit(next, message) {
  if (drag && !drag.settling) clearDrag();
  let url;
  try { url = travelURL(stateURL(location.href, next), frozenAt); }
  catch (error) { announce(error.message); return false; }
  if (url === location.href) return true;
  try { history.pushState(null, '', url); }
  catch { announce('The browser could not save this link. Please try a shorter configuration.'); return false; }
  locationRequest++;
  activeLocation = url;
  clocks = next;
  $('#notice').hidden = true;
  render();
  if (message) announce(message);
  return true;
}
async function loadLocation() {
  const url = location.href;
  if (url === activeLocation) return;
  activeLocation = url;
  applyCardView(new URL(url).searchParams.get('view') === 'standard' ? 'standard' : 'mini');
  const request = ++locationRequest;
  if (drag) clearDrag();
  if (dialog.open) closeDialog();
  $('#travel-dialog').close();
  try {
    frozenAt = readTravelTime(url);
    const tokens = decodeTokens(url);
    // The production default dashboard also needs its lookup saved before a
    // later edit turns the bare URL into a compact link that is opened offline.
    loadingLocation = tokens !== null ? tokens.length > 0 : !!document.querySelector('meta[name="offline-enabled"]');
    if (loadingLocation) {
      $('#notice').textContent = 'Loading your clocks…';
      $('#notice').hidden = false;
      render();
    }
    const lookup = loadingLocation ? await loadClockCatalog(new URL(url).hash.split('.')[1]) : null;
    if (request !== locationRequest) return;
    const state = readState(url, lookup);
    clocks = state.clocks;
    $('#notice').hidden = !state.error;
    if (state.error) $('#notice').textContent = `${state.message} Showing default clocks.`;
  } catch (error) {
    if (request !== locationRequest) return;
    clocks = defaults();
    frozenAt = null;
    $('#notice').textContent = `${error.message} Showing default clocks. Reload to retry your saved link.`;
    $('#notice').hidden = false;
  }
  loadingLocation = false;
  render();
}
function applyCardView(view) {
  document.body.dataset.cardView = view;
  for (const button of document.querySelectorAll('button[data-card-view]')) button.setAttribute('aria-pressed', String(button.dataset.cardView === view));
}
for (const button of document.querySelectorAll('button[data-card-view]')) button.addEventListener('click', () => {
  const view = button.dataset.cardView;
  if (document.body.dataset.cardView === view) return;
  if (drag) clearDrag();
  try {
    const url = new URL(travelURL(stateURL(location.href, clocks), frozenAt));
    if (view === 'standard') url.searchParams.set('view', 'standard'); else url.searchParams.delete('view');
    history.pushState(null, '', url);
    locationRequest++;
    activeLocation = url.href;
    applyCardView(view);
    render();
  } catch { announce('The browser could not save the card view. Please try again.'); }
});
function changeClock(id, patch) {
  const clock = clocks.find((item) => item.id === id);
  if (Object.entries(patch).every(([key, value]) => clock[key] === value)) return;
  commit(clocks.map((item) => item.id === id ? { ...item, ...patch } : item), `${clockTitle(clock)} updated`);
}
function removeClock(id) {
  const label = clockTitle(clocks.find((clock) => clock.id === id));
  const order = clocks.map(clock => clock.id);
  const index = order.indexOf(id);
  commit(clocks.filter((clock) => clock.id !== id), `${label} removed`);
  const next = order[index + 1] ?? order[index - 1];
  if (next) focusClock(next); else $('#add-clock').focus();
}
$('.skip-link').addEventListener('click', () => grid.focus());
$('#restore').addEventListener('click', () => { commit(defaults(), 'Default clocks restored'); });
function moveClock(id, destination) {
  const from = clocks.findIndex((clock) => clock.id === id);
  const to = typeof destination === 'number' ? from + destination : clocks.findIndex((clock) => clock.id === destination);
  if (from < 0 || to < 0 || to >= clocks.length || from === to) return;
  const next = [...clocks];
  const [clock] = next.splice(from, 1);
  next.splice(to, 0, clock);
  if (commit(next, `${clockTitle(clock)} moved to position ${to + 1}`)) focusClock(id);
}
for (const direction of ['ascending', 'descending']) {
  $(`#sort-${direction}`).addEventListener('click', () => {
    const sorted = orderedClocks(clocks, currentInstant()).map(({ clock }) => clock);
    if (direction === 'descending') sorted.reverse();
    commit(sorted, direction === 'ascending' ? 'Sorted earliest to latest' : 'Sorted latest to earliest');
  });
}
// Move the actual card above the grid; a placeholder preserves its layout slot.
// Commit only on drop so a drag creates one history entry.
let drag = null;
function clearDrag() {
  const previous = drag;
  drag = null;
  if (!previous) return;
  const restoreFocus = document.activeElement === previous.handle;
  cancelAnimationFrame(previous.frame);
  previous.settleAnimation?.cancel();
  for (const animation of previous.shifts?.values() ?? []) animation.cancel();
  if (previous.placeholder) {
    previous.placeholder.classList.remove('card-placeholder');
    previous.placeholder.append(previous.card);
  }
  for (const card of cards.values()) card.classList.remove('dragging', 'settling');
  for (const property of ['position', 'left', 'top', 'width', 'height', 'transform-origin', '--drag-x', '--drag-y', '--tilt-x', '--tilt-y', '--tilt-z']) previous.card.style.removeProperty(property);
  document.body.classList.remove('is-dragging');
  if (previous.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
  render();
  if (restoreFocus && previous.handle.isConnected) previous.handle.focus({ preventScroll: true });
}
// Ignore the temporary FLIP translation when hit-testing layout slots. Otherwise
// cards moving under a stationary pointer could repeatedly change the target.
function dropTarget(x, y) {
  const bounds = grid.getBoundingClientRect();
  if (x < bounds.left - 40 || x > bounds.right + 40 || y < bounds.top - 40 || y > bounds.bottom + 40) return null;
  const column = Math.max(0, Math.min(layout.columns - 1, Math.floor((x - bounds.left + layout.gap / 2) / (layout.width + layout.gap))));
  const row = Math.max(0, Math.floor((y - bounds.top + layout.gap / 2) / (layout.height + layout.gap)));
  return Math.min(drag.order.length - 1, row * layout.columns + column);
}
function previewOrder(index) {
  const from = drag.order.indexOf(drag.id);
  if (index === null || index === from) return;
  const others = [...cards.keys()].filter(id => id !== drag.id).map(id => slots.get(id));
  const before = new Map(others.map(card => [card, card.getBoundingClientRect()]));
  for (const animation of drag.shifts.values()) animation.cancel();
  drag.shifts.clear();
  drag.order.splice(from, 1);
  drag.order.splice(index, 0, drag.id);
  // Only move the placeholder: leave the captured card attached and untouched.
  const nextId = drag.order[index + 1];
  grid.insertBefore(drag.placeholder, nextId ? slots.get(nextId) : null);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const card of others) {
    const after = card.getBoundingClientRect();
    const old = before.get(card);
    const x = old.left - after.left;
    const y = old.top - after.top;
    if (Math.abs(x) + Math.abs(y) < .5) continue;
    const animation = card.animate([
      { transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' },
    ], { duration: 280, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    drag.shifts.set(card, animation);
  }
}
function updateDrag() {
  if (!drag?.moved || drag.settling) return;
  previewOrder(dropTarget(drag.clientX, drag.clientY));
}
function finishDrag(event) {
  if (!drag || drag.settling || event.pointerId !== drag.pointerId) return;
  if (!drag.moved) { clearDrag(); return; }
  const target = dropTarget(event.clientX, event.clientY);
  // Dropping outside the grid returns the card to its original position.
  previewOrder(target ?? clocks.findIndex(clock => clock.id === drag.id));
  const current = drag;
  current.settling = true;
  cancelAnimationFrame(current.frame);
  if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
  const next = current.order.map(id => clockById.get(id));
  if (!commit(next, `${clockTitle(next.find(clock => clock.id === current.id))} moved to position ${current.order.indexOf(current.id) + 1}`)) { clearDrag(); return; }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { clearDrag(); return; }
  const destination = current.placeholder.getBoundingClientRect();
  const x = destination.left - parseFloat(current.card.style.left);
  const y = destination.top - parseFloat(current.card.style.top);
  current.settleAnimation = current.card.animate([
    { transform: getComputedStyle(current.card).transform, filter: getComputedStyle(current.card).filter },
    { transform: `translate3d(${x}px, ${y}px, 0)`, filter: 'drop-shadow(0 0 0 transparent)' },
  ], { duration: 340, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards' });
  current.card.classList.add('settling');
  current.settleAnimation.onfinish = () => { if (drag === current) clearDrag(); };
}
function autoScroll(now) {
  if (!drag?.moved) return;
  const dt = Math.max(0, Math.min((now - (drag.lastFrame ?? now - 16)) / 1000, .064));
  drag.lastFrame = now;
  const x = drag.clientX - drag.x;
  const y = drag.clientY - drag.y;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion = drag.motion;
  const followX = reduce ? x : spring(motion.x, x, dt, 420, 37);
  const followY = reduce ? y : spring(motion.y, y, dt, 420, 37);
  const tilt = tiltTargets(velocityAt(drag.pointer, now), drag.grip);
  const rx = reduce ? 0 : spring(motion.rx, tilt.x, dt, 240, 20);
  const ry = reduce ? 0 : spring(motion.ry, tilt.y, dt, 240, 20);
  const rz = reduce ? 0 : spring(motion.rz, tilt.z, dt, 220, 18);
  for (const [name, value, unit] of [['--drag-x', followX, 'px'], ['--drag-y', followY, 'px'], ['--tilt-x', rx, 'deg'], ['--tilt-y', ry, 'deg'], ['--tilt-z', rz, 'deg']]) drag.card.style.setProperty(name, `${value}${unit}`);
  if (drag.clientY < 65) window.scrollBy(0, -12);
  else if (drag.clientY > innerHeight - 65) window.scrollBy(0, 12);
  tick();
  updateDrag();
  drag.frame = requestAnimationFrame(autoScroll);
}
grid.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.reorder-handle');
  if (!handle || event.button !== 0 || drag) return;
  event.preventDefault();
  handle.classList.add('pointer-focus');
  handle.focus({ preventScroll: true });
  const card = handle.closest('.clock-card');
  drag = { handle, card, pointerId: event.pointerId, id: card.dataset.id, x: event.clientX, y: event.clientY, clientX: event.clientX, clientY: event.clientY, moved: false, frame: 0 };
  drag.pointer = pointerMotion(event.clientX, event.clientY, event.timeStamp);
  handle.setPointerCapture(event.pointerId);
});
grid.addEventListener('pointermove', (event) => {
  if (!drag || drag.settling || event.pointerId !== drag.pointerId) return;
  const samples = event.getCoalescedEvents?.() ?? [];
  for (const sample of samples.length ? samples : [event]) samplePointer(drag.pointer, sample.clientX, sample.clientY, sample.timeStamp);
  drag.clientX = event.clientX;
  drag.clientY = event.clientY;
  if (!drag.moved) {
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    const rect = drag.card.getBoundingClientRect();
    drag.order = clocks.map(clock => clock.id);
    drag.shifts = new Map();
    drag.placeholder = slots.get(drag.id);
    drag.placeholder.classList.add('card-placeholder');
    grid.append(drag.card);
    drag.handle.classList.add('pointer-focus');
    drag.handle.focus({ preventScroll: true });
    drag.handle.setPointerCapture(drag.pointerId);
    Object.assign(drag.card.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    drag.card.style.transformOrigin = `${drag.x - rect.left}px ${drag.y - rect.top}px`;
    drag.grip = { x: rect.left + rect.width / 2 - drag.x, y: rect.top + rect.height / 2 - drag.y };
    drag.motion = Object.fromEntries(['x', 'y', 'rx', 'ry', 'rz'].map((key) => [key, { value: 0, velocity: 0 }]));
    drag.card.classList.add('dragging');
    document.body.classList.add('is-dragging');
    drag.moved = true;
    drag.frame = requestAnimationFrame(autoScroll);
  }
  updateDrag();
});
grid.addEventListener('pointerup', finishDrag);
grid.addEventListener('pointercancel', clearDrag);
grid.addEventListener('focusout', event => event.target.classList.remove('pointer-focus'));
grid.addEventListener('keydown', event => event.target.classList.remove('pointer-focus'));
grid.addEventListener('lostpointercapture', () => { if (drag && !drag.settling && !drag.handle.hasPointerCapture(drag.pointerId)) clearDrag(); });
grid.addEventListener('dragstart', (event) => { if (event.target.closest('.reorder-handle')) event.preventDefault(); });
window.addEventListener('blur', clearDrag);
window.addEventListener('resize', clearDrag);
window.addEventListener('popstate', clearDrag);
grid.addEventListener('keydown', (event) => { if (event.key === 'Escape' && drag) clearDrag(); });
window.addEventListener('popstate', loadLocation);
window.addEventListener('hashchange', loadLocation);
window.addEventListener('scroll', scheduleViewport, { passive: true });
new ResizeObserver(() => { measureLayout(); scheduleViewport(); }).observe(grid);
grid.addEventListener('focusin', event => {
  if (event.target.classList.contains('clock-slot')) {
    focusClock(event.target.dataset.id);
    cards.get(event.target.dataset.id)?.querySelector('.flip-open').focus({ preventScroll: true });
  }
});
window.addEventListener('pageshow', tick);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
setInterval(() => { if (!document.hidden) tick(); }, 1000);

async function loadCatalog() {
  if (catalog) return catalog;
  if (catalogPromise) return catalogPromise;
  $('#search-status').textContent = 'Loading cities…';
  catalogFailed = false;
  $('#search-error').hidden = true;
  catalogPromise = (async () => {
    try {
      if (document.querySelector('meta[name="offline-enabled"]')) await loadClockCatalog();
      const data = await catalogJSON(new URL(`../data/cities-${CATALOG_VERSION}.json`, import.meta.url), data => {
        if (data.snapshot !== CATALOG_VERSION || !Array.isArray(data.cities) || data.version !== 1) throw new Error('Invalid search catalog');
      });
      catalog = prepareCities([utc, ...data.cities.map(([id, name, region, country, zone, population, aliases]) => ({ id: `geonames:${id}`, name, region, country, zone, population, aliases }))]);
      if (dialog.open) showResults();
      return catalog;
    } catch {
      catalogFailed = true;
      if (dialog.open) {
        $('#search-status').textContent = 'Could not load cities';
        $('#search-error p').textContent = 'We couldn’t load the city list. Connect once and retry to save search for offline use. Your existing clocks are still available.';
        $('#search-error').hidden = false;
      }
      return null;
    } finally { catalogPromise = null; }
  })();
  return catalogPromise;
}
function openDialog() {
  resetTimezone();
  opener = document.activeElement;
  $('#city-form').reset();
  selected = null;
  $('#selection').textContent = 'Select a city to continue';
  $('#confirm-add').disabled = true;
  $('#search-error').hidden = true;
  $('#add-scale-warning').hidden = clocks.length < SOFT_CLOCK_LIMIT - 1;
  dialog.showModal();
  showResults();
  input.focus();
  loadCatalog();
}
function closeDialog() { resetTimezone(); dialog.close(); opener?.focus(); }
function resetTimezone() {
  timezoneRequest++;
  timezoneCities = null;
  $('#use-timezone').disabled = false;
  $('#timezone-status').textContent = 'Uses your device’s timezone, not your location.';
}
$('#use-timezone').addEventListener('click', async () => {
  const request = ++timezoneRequest;
  const button = $('#use-timezone');
  const status = $('#timezone-status');
  button.disabled = true;
  selected = null;
  $('#confirm-add').disabled = true;
  $('#selection').textContent = 'Select a city to continue';
  status.textContent = 'Finding your timezone…';
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) throw new Error('No timezone');
    const cities = await loadCatalog();
    if (request !== timezoneRequest || !dialog.open) return;
    if (!cities) { status.textContent = 'Could not load cities. Retry the city list, then try again.'; return; }
    timezoneCities = citiesInZone(cities, zone);
    input.value = zone;
    showResults();
    if (!timezoneCities.length) {
      status.textContent = `Your timezone is ${zone}. No matching city is available; search for a city instead.`;
    } else if (alreadyAdded(timezoneCities[0], clocks)) {
      status.textContent = `${zone} — ${timezoneCities[0].name} is already added. You can select another city in this timezone.`;
    } else {
      choose(0, true);
      status.textContent = `${zone} — suggested city, based on your device’s timezone.`;
    }
  } catch {
    if (request === timezoneRequest) status.textContent = 'Your timezone could not be detected. Search for a city instead.';
  } finally {
    if (request === timezoneRequest) button.disabled = false;
  }
});
$('#add-clock').addEventListener('click', openDialog);
$('#empty-add').addEventListener('click', openDialog);
$('#close-dialog').addEventListener('click', closeDialog);
$('#cancel-dialog').addEventListener('click', closeDialog);
dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
$('#retry-search').addEventListener('click', loadCatalog);
function setActive(index) {
  activeIndex = index;
  [...results.children].forEach((element, i) => element.classList.toggle('active', i === index));
  if (index >= 0 && results.children[index]) {
    input.setAttribute('aria-activedescendant', results.children[index].id);
    results.children[index].scrollIntoView({ block: 'nearest' });
  } else input.removeAttribute('aria-activedescendant');
}
function showResults() {
  resultCities = timezoneCities ?? searchCities(catalog ?? prepareCities([utc]), input.value);
  results.replaceChildren();
  input.removeAttribute('aria-activedescendant');
  activeIndex = -1;
  $('#results-label').textContent = timezoneCities ? 'YOUR TIMEZONE' : input.value.trim() ? 'SEARCH RESULTS' : 'POPULAR PLACES';
  $('#search-status').textContent = catalog ? (resultCities.length ? `${resultCities.length} places` : 'No cities found. Try another name.') : catalogFailed ? 'Could not load cities' : 'Loading cities…';
  for (const [index, city] of resultCities.entries()) {
    const option = document.createElement('div');
    option.className = 'city-option';
    option.dataset.cityId = city.id;
    option.id = `city-option-${index}`;
    option.setAttribute('role', 'option');
    const added = alreadyAdded(city, clocks);
    option.setAttribute('aria-disabled', String(added));
    option.setAttribute('aria-selected', String(city.id === selected?.id));
    const info = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = city.name;
    const context = document.createElement('span'); context.textContent = [...new Set([city.region, city.country].filter(Boolean))].join(', ') || 'Coordinated Universal Time';
    const zone = document.createElement('small'); zone.textContent = city.zone;
    info.append(name, context, zone);
    const status = document.createElement('span'); status.className = 'result-indicator'; status.textContent = added ? 'Added' : selected?.id === city.id ? '✓' : '＋';
    option.append(info, status);
    option.addEventListener('click', () => { if (!added) { choose(index); input.focus(); } });
    results.append(option);
  }
}
function choose(index, fromTimezone = false) {
  const city = resultCities[index];
  if (!city || alreadyAdded(city, clocks)) return;
  if (!fromTimezone) { timezoneRequest++; $('#use-timezone').disabled = false; }
  selected = city;
  $('#selection').textContent = `Selected: ${city.name} · ${city.zone}`;
  $('#confirm-add').disabled = false;
  showResults();
  setActive(index);
}
input.addEventListener('input', () => {
  resetTimezone();
  selected = null;
  $('#confirm-add').disabled = true;
  $('#selection').textContent = 'Select a city to continue';
  showResults();
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeDialog();
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    if (['Home', 'End'].includes(event.key) && activeIndex < 0) return;
    event.preventDefault();
    if (!resultCities.length) return;
    let index = event.key === 'Home' ? 0 : event.key === 'End' ? resultCities.length - 1 : activeIndex + (event.key === 'ArrowDown' ? 1 : -1);
    setActive((index + resultCities.length) % resultCities.length);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (activeIndex >= 0) choose(activeIndex);
  }
});
$('#city-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!selected || alreadyAdded(selected, clocks)) return;
  const data = new FormData(event.currentTarget);
  const clock = cityClock(selected, data.get('display'), Number(data.get('hours')));
  if (!commit([...clocks, clock], `${clockTitle(clock)} added`)) return;
  closeDialog();
  focusClock(clock.id);
});
async function copyText(text, kind) {
  const link = kind === 'link';
  try { await navigator.clipboard.writeText(text); announce(link ? 'Link copied' : 'Cities and times copied'); }
  catch {
    $('#share-title').textContent = link ? 'Your dashboard link' : 'Cities and times';
    $('#share-dialog label').textContent = link ? 'Copy this link to share your clocks' : 'Copy these cities and times';
    $('#share-dialog .helper').textContent = link ? 'Anyone with this link can open the same clocks and settings.' : 'A snapshot of the current times, in your clock order.';
    $('#close-share').setAttribute('aria-label', link ? 'Close link dialog' : 'Close times dialog');
    $('#share-url').value = text;
    $('#share-dialog').showModal();
    $('#share-url').focus();
    $('#share-url').select();
  }
}
$('#copy-link').addEventListener('click', () => copyText(travelURL(stateURL(location.href, clocks), frozenAt), 'link'));
$('#copy-times').addEventListener('click', () => copyText(clocksText(clocks, currentInstant()), 'times'));
$('#close-share').addEventListener('click', () => $('#share-dialog').close());
setupTimeTravel({ getInstant: currentInstant, getClocks: () => clocks, setInstant(instant) {
  try {
    const url = travelURL(stateURL(location.href, clocks), instant);
    history.pushState(null, '', url);
    locationRequest++;
    activeLocation = url;
    frozenAt = readTravelTime(url);
    $('#notice').hidden = true;
    tick();
    announce(frozenAt ? 'All clocks frozen at the selected time' : 'Clocks are live again');
    if (!frozenAt) $('#time-travel').focus();
    return true;
  } catch (error) { announce(error.message); return false; }
} });
setupMobileMenu({ onCompactChange(compactControls) {
  if (loadingLocation) return false;
  if (drag) clearDrag();
  try {
    const url = travelURL(stateURL(location.href, clocks, { compactControls }), frozenAt);
    history.pushState(null, '', url);
    locationRequest++;
    activeLocation = url;
    $('#notice').hidden = true;
    return true;
  } catch { announce('The browser could not save the controls setting. Please try again.'); return false; }
} });
loadLocation();
