import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareCities, searchCities, citiesInZone, utc, alreadyAdded, cityClock } from '../src/search.js';
import { defaults, validateClocks } from '../src/state.js';
const data = JSON.parse(await readFile(new URL('../data/cities.json', import.meta.url)));
const cities = prepareCities([utc, ...data.cities.map(([id, name, region, country, zone, population, aliases]) => ({ id: `geonames:${id}`, name, region, country, zone, population, aliases }))]);

test('packaged catalog covers the world and has unique, valid clock records', () => {
  assert.ok(cities.length > 20000);
  assert.equal(new Set(cities.map((city) => city.id)).size, cities.length);
  for (const city of cities) validateClocks([cityClock(city)]);
});
test('search handles accents, aliases, regional context, and UTC', () => {
  assert.equal(searchCities(cities, 'sao paulo')[0].name, 'São Paulo');
  assert.equal(searchCities(cities, 'BOMBAY')[0].name, 'Mumbai');
  assert.equal(searchCities(cities, 'Coordinated Universal Time')[0].id, 'utc');
  assert.ok(searchCities(cities, 'London United Kingdom').some((city) => city.id === 'geonames:2643743'));
  assert.equal(searchCities(cities, 'zzzzzzzzzzzz').length, 0);
  assert.equal(searchCities(cities, 'san').length, 20);
  assert.equal(searchCities(cities, '')[0].id, 'utc');
});
test('preset duplicate detection still permits other cities in the same zone', () => {
  const la = searchCities(cities, 'Los Angeles').find((city) => city.id === 'geonames:5368361');
  const sf = searchCities(cities, 'San Francisco').find((city) => city.id === 'geonames:5391959');
  assert.equal(alreadyAdded(la, defaults()), true);
  assert.equal(alreadyAdded(sf, defaults()), false);
  assert.equal(la.zone, sf.zone);
});
test('device timezone matches canonical aliases and prefers the named city', () => {
  assert.equal(citiesInZone(cities, 'Asia/Singapore')[0].name, 'Singapore');
  assert.equal(citiesInZone(cities, 'US/Pacific')[0].name, 'Los Angeles');
  assert.equal(citiesInZone(cities, 'Asia/Calcutta')[0].name, 'Kolkata');
  assert.equal(citiesInZone(cities, 'Etc/UTC')[0].id, 'utc');
  assert.deepEqual(citiesInZone(cities, 'Etc/GMT+12'), []);
  assert.deepEqual(citiesInZone(cities, 'invalid'), []);
});
