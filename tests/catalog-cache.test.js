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
import { gzipSync } from 'node:zlib';
import { fetchCatalogJSON } from '../src/catalog-cache.js';
const url = 'https://example.com/dashboard/data/cities-2026-10-14.json';
const expected = { cities: [['São Paulo', '東京']] };
const json = JSON.stringify(expected);
const validate = data => { if (!Array.isArray(data.cities)) throw new Error('Invalid catalog'); };

test('explicit gzip catalog loading and JSON fallbacks', async t => {
  const originalFetch = globalThis.fetch;
  const originalDecoder = globalThis.DecompressionStream;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.DecompressionStream = originalDecoder; });
  for (const scenario of ['gzip', 'decoded by host', '404', 'network failure', 'corrupt gzip', 'invalid schema', 'unsupported', 'source dev']) {
    await t.test(scenario, async () => {
      const requests = [];
      globalThis.DecompressionStream = scenario === 'unsupported' ? undefined : originalDecoder;
      globalThis.fetch = async input => {
        const requested = String(input); requests.push(requested);
        if (!requested.endsWith('.gz')) return new Response(json);
        if (scenario === 'network failure') throw new TypeError('Network failed');
        if (scenario === '404') return new Response('Not found', { status: 404 });
        if (scenario === 'corrupt gzip') return new Response(new Uint8Array([31,139,8]));
        if (scenario === 'invalid schema') return new Response(gzipSync('{}'));
        if (scenario === 'decoded by host') return new Response(json, { headers: { 'Content-Encoding': 'gzip' } });
        return new Response(gzipSync(json));
      };
      const result = await fetchCatalogJSON(url, validate, scenario !== 'source dev');
      assert.deepEqual(result.data, expected);
      assert.deepEqual(await result.response.json(), expected);
      const compressedOnly = ['gzip', 'decoded by host'].includes(scenario);
      assert.deepEqual(requests, compressedOnly ? [url + '.gz'] : ['unsupported', 'source dev'].includes(scenario) ? [url] : [url + '.gz', url]);
    });
  }
  globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
  await assert.rejects(fetchCatalogJSON(url, validate), /Could not load/);
});
