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
import { readCompactControls } from './state.js';
// Keep one set of controls and listeners, returning them to their desktop slots.
export function setupMobileMenu({ onCompactChange }) {
  const menu = document.querySelector('#mobile-menu');
  const toggle = document.querySelector('#menu-toggle');
  const compactToggle = document.querySelector('#controls-toggle');
  const mobile = matchMedia('(max-width: 640px)');
  let compact = readCompactControls(location.href);
  const controls = [
    ['.toolbar-actions', '#menu-actions'],
    ['.travel-actions', '#menu-travel'],
    ['.view-controls', '#menu-view'],
    ['.sort-controls', '#menu-sort'],
    ['.theme-controls', '#menu-theme'],
    ['#restore', '#menu-restore'],
  ].map(([selector, destination]) => {
    const element = document.querySelector(selector);
    const slot = document.createComment(`Desktop position: ${selector}`);
    element.before(slot);
    return { element, slot, destination: document.querySelector(destination) };
  });
  function close() {
    menu.close();
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus({ preventScroll: true });
  }
  function relocate() {
    const focused = document.activeElement;
    const wasOpen = menu.open;
    const useMenu = mobile.matches || compact;
    if (wasOpen) close();
    document.body.dataset.compactControls = String(compact);
    compactToggle.setAttribute('aria-pressed', String(compact));
    compactToggle.title = compact ? 'Show controls' : 'Hide controls';
    for (const { element, slot, destination } of controls) {
      if (useMenu) destination.append(element);
      else slot.after(element);
    }
    if (!useMenu && (wasOpen || focused === toggle)) {
      const target = controls.some(({ element }) => element.contains(focused))
        ? focused : document.querySelector('#time-travel');
      target.focus({ preventScroll: true });
    } else if (useMenu && (controls.some(({ element }) => element.contains(focused)) || (mobile.matches && focused === compactToggle))) {
      toggle.focus({ preventScroll: true });
    }
  }
  compactToggle.addEventListener('click', () => {
    if (!onCompactChange(!compact)) return;
    compact = !compact;
    relocate();
  });
  function syncLocation() {
    const next = readCompactControls(location.href);
    if (next !== compact) {
      compact = next;
      relocate();
    }
  }
  window.addEventListener('popstate', syncLocation);
  window.addEventListener('hashchange', syncLocation);
  toggle.addEventListener('click', () => {
    menu.showModal();
    toggle.setAttribute('aria-expanded', 'true');
  });
  document.querySelector('#close-menu').addEventListener('click', close);
  menu.addEventListener('cancel', event => { event.preventDefault(); close(); });
  menu.addEventListener('close', () => toggle.setAttribute('aria-expanded', 'false'));
  menu.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')].filter(button => button.getClientRects().length);
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  menu.addEventListener('click', event => {
    if (event.target !== menu) return;
    const rect = menu.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  // Close before action handlers run so dialogs return focus to the hamburger.
  menu.addEventListener('click', event => {
    if (event.target.closest('#add-clock, #time-travel, #adjust-time, #resume-time, #copy-times, #copy-link, #restore')) close();
  }, { capture: true });
  mobile.addEventListener('change', relocate);
  relocate();
}
