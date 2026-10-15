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
import { pickerInstants, pickerValue, readTravelTime, travelURL } from '../src/travel-time.js';
test('frozen instant survives URLs, validation, and resume', () => {
  const date = new Date('2026-03-08T10:00:00Z');
  const url = travelURL('https://example.com/app/?other=yes#v2.payload', date);
  assert.equal(readTravelTime(url).getTime(), date.getTime());
  assert.equal(new URL(url).hash, '#v2.payload');
  assert.equal(readTravelTime(travelURL(url, null)), null);
  for (const value of ['invalid','2026-02-30T00:00:00Z','2026-10-15T99:00:00Z','']) assert.throws(() => readTravelTime(`https://example.com/?at=${value}`));
});
test('civil picker converts fractional offsets and rejects gaps and invalid dates', () => {
  assert.equal(pickerInstants('2026-10-15T09:30','Asia/Kolkata')[0].toISOString(), '2026-10-15T04:00:00.000Z');
  assert.equal(pickerInstants('2026-03-08T02:30','America/Los_Angeles').length, 0);
  assert.equal(pickerInstants('2026-02-30T12:00','UTC').length, 0);
  assert.equal(pickerValue(new Date('2026-10-15T04:00:15Z'),'Asia/Kolkata'), '2026-10-15T09:30:15');
});
test('repeated local times return both instants, including half-hour transitions', () => {
  assert.deepEqual(pickerInstants('2026-11-01T01:30','America/Los_Angeles').map(d=>d.toISOString()), ['2026-11-01T08:30:00.000Z','2026-11-01T09:30:00.000Z']);
  assert.deepEqual(pickerInstants('2026-04-05T01:45','Australia/Lord_Howe').map(d=>d.toISOString()), ['2026-04-04T14:45:00.000Z','2026-04-04T15:15:00.000Z']);
});
