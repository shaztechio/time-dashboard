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
import { timeAt } from './time.js';
const pad = n => String(n).padStart(2, '0');
export function readTravelTime(url) {
  const value = new URL(url).searchParams.get('at');
  if (value === null) return null;
  if (!/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) throw new Error('Invalid frozen time in this link.');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().replace('.000Z', 'Z') !== value) throw new Error('Invalid frozen time in this link.');
  return date;
}
export function travelURL(url, instant) {
  const next = new URL(url);
  if (instant === null) next.searchParams.delete('at');
  else {
    next.searchParams.set('at', instant.toISOString().replace(/\.\d{3}Z$/, 'Z'));
    readTravelTime(next);
  }
  return next.href;
}
export function pickerValue(instant, zone) {
  const p = timeAt(zone, instant);
  return `${String(p.year).padStart(4, '0')}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}
// Find every real instant matching a civil time, including both sides of a DST fold.
export function pickerInstants(value, zone) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return [];
  const normalized = value.length === 16 ? `${value}:00` : value;
  const wall = new Date(`${normalized}Z`);
  if (!Number.isFinite(wall.getTime()) || wall.toISOString().slice(0,19) !== normalized) return [];
  const offsets = new Set();
  for (let hours = -48; hours <= 48; hours += 6) offsets.add(timeAt(zone, new Date(wall.getTime() + hours * 3600000)).offset);
  return [...offsets].map(offset => new Date(wall.getTime() - offset * 60000))
    .filter(instant => pickerValue(instant, zone) === normalized).sort((a,b) => a - b);
}
