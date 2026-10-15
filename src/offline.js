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
const status = document.querySelector('#offline-status');
if (document.querySelector('meta[name="offline-enabled"]')) {
  status.hidden = false;
  if (!('serviceWorker' in navigator) || !isSecureContext) {
    status.textContent = 'Offline use requires a supported browser and HTTPS.';
  } else {
    status.textContent = 'Preparing offline access…';
    const start = async () => {
      try {
        const registration = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { updateViaCache: 'none' });
        function update() {
          status.textContent = registration.waiting ? 'Update ready — close all dashboard tabs and reopen to update.'
            : registration.active ? 'Ready offline · search is saved after first use' : 'Preparing offline access…';
        }
        function watch() {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'redundant' && !registration.active) status.textContent = 'Offline setup failed. Reload online to retry.';
            else update();
          });
        }
        registration.addEventListener('updatefound', watch);
        navigator.serviceWorker.addEventListener('controllerchange', update);
        watch(); update();
        navigator.serviceWorker.ready.then(update);
      } catch { status.textContent = 'Offline setup unavailable. You can still use the dashboard online.'; }
    };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
  }
}
