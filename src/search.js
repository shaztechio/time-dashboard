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
import { cityIdentity, supportsZone } from './state.js';
export const utc = { id: 'utc', name: 'UTC', region: '', country: '', zone: 'UTC', aliases: ['Coordinated Universal Time'], population: 0 };
export const normalize = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function prepareCities(cities) {
  return cities.map((city) => ({ ...city, terms: [city.name, ...(city.aliases ?? [])].map(normalize), context: normalize(`${city.name} ${city.region} ${city.country} ${city.zone}`) }));
}
export function searchCities(cities, query, limit = 20) {
  const needle = normalize(query);
  if (!needle) {
    const popular = ['utc', 'geonames:2643743', 'geonames:5128581', 'geonames:1850147', 'geonames:1880252', 'geonames:2147714', 'geonames:2988507'];
    return popular.map((id) => cities.find((city) => city.id === id)).filter((city) => city && supportsZone(city.zone));
  }
  const words = needle.split(' ');
  const matches = [];
  for (const city of cities) {
    const score = city.terms.some((term) => term === needle) ? 0
      : city.terms.some((term) => term.startsWith(needle)) ? 1
      : city.terms.some((term) => term.includes(needle)) || words.every((word) => city.context.includes(word)) ? 2 : -1;
    if (score >= 0) matches.push({ city, score });
  }
  matches.sort((a, b) => a.score - b.score || b.city.population - a.city.population || a.city.id.localeCompare(b.city.id));
  const results = [];
  for (const { city } of matches) {
    if (supportsZone(city.zone)) results.push(city);
    if (results.length === limit) break;
  }
  return results;
}
export function alreadyAdded(city, clocks) { return clocks.some((clock) => cityIdentity(clock) === city.id); }
export function citiesInZone(cities, zone) {
  const canonical = new Map();
  const resolve = value => {
    if (!canonical.has(value)) {
      try { canonical.set(value, new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone); }
      catch { canonical.set(value, null); }
    }
    return canonical.get(value);
  };
  const target = resolve(zone);
  if (!target) return [];
  const name = normalize(target.split('/').at(-1));
  return cities.filter(city => resolve(city.zone) === target).sort((a, b) => {
    const aNamed = a.terms.includes(name);
    const bNamed = b.terms.includes(name);
    return Number(bNamed) - Number(aNamed) || b.population - a.population || a.id.localeCompare(b.id);
  }).slice(0, 20);
}
export function cityClock(city, display = 'analog', hours = 24) {
  return { id: city.id, label: city.name, place: [...new Set([city.region, city.country].filter(Boolean))].join(', '), zone: city.zone, display, hours };
}
