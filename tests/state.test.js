import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from '../src/vendor/fflate.js';
import { defaults, readState, stateURL, validateClocks, clockTitle, decodeTokens } from '../src/state.js';
import { clockCatalog, CATALOG_VERSION } from '../src/catalog.js';
const catalog = clockCatalog(JSON.parse(await readFile(new URL('../data/clock-catalog-2026-10-14.json', import.meta.url))));
const base = 'https://example.com/time-dashboard/';
const packed = tokens => `${base}#v2.${CATALOG_VERSION}.${Buffer.from(gzipSync(new TextEncoder().encode(JSON.stringify(tokens)), { mtime: 0 })).toString('base64url')}`;
const sample = n => [...catalog.values()].slice(0, n).map((record, i) => ({ ...record, display: i % 2 ? 'digital' : 'analog', hours: i % 4 < 2 ? 24 : 12 }));

test('bare URLs use defaults and compact URLs keep subdirectory and unrelated queries', () => {
  assert.deepEqual(readState(`${base}?campaign=hello`).clocks, defaults());
  const url = stateURL(`${base}?v=1&clocks=old&campaign=hello#clocks`, defaults());
  assert.equal(new URL(url).pathname, '/time-dashboard/');
  assert.equal(new URL(url).searchParams.get('campaign'), 'hello');
  assert.equal(new URL(url).searchParams.has('clocks'), false);
  assert.match(new URL(url).hash, /^#v2\.2026-10-14\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(readState(url, catalog).clocks, defaults());
});
test('compact records preserve order and all format combinations and resolve catalog text', () => {
  const clocks = sample(100).reverse();
  const url = stateURL(base, clocks);
  assert.deepEqual(readState(url, catalog).clocks, clocks);
  assert.equal(stateURL(url, readState(url, catalog).clocks), url);
  assert.notEqual(stateURL(base, [...clocks].reverse()), url);
  assert.equal(clockTitle(defaults()[0]), 'Los Angeles, United States');
  const sao = { ...catalog.get(3448439), display: 'analog', hours: 24 };
  assert.equal(readState(stateURL(base, [sao]), catalog).clocks[0].label, 'São Paulo');
});
test('empty configuration is explicit and requires no catalog', () => {
  assert.deepEqual(readState(stateURL(base, [])).clocks, []);
  assert.deepEqual(decodeTokens(stateURL(base, [])), []);
});
test('1000 and larger dashboards round-trip in compact fragment URLs', () => {
  for (const n of [1000, 1001, 5000]) {
    const clocks = sample(n);
    const url = stateURL(base, clocks);
    assert.deepEqual(readState(url, catalog).clocks, clocks);
    if (n === 1000) assert.ok(url.length < 10000, `1000 clocks used ${url.length} characters`);
    assert.equal(new URL(url).search, '');
  }
});
test('malformed, corrupt, unknown, duplicate, and old records fail explicitly', () => {
  const invalid = [null, {}, [-1], [1.2], ['4'], [4, 5], [Number.MAX_SAFE_INTEGER + 1], [999999999]];
  for (const tokens of invalid) assert.equal(readState(packed(tokens), catalog).error, true);
  const valid = stateURL(base, defaults());
  for (const url of [base + '#oops', valid.replace('2026-10-14', '1999-01-01'), valid.slice(0, -8), base + '?v=1&clocks=[]', base + '#v2.2026-10-14.%%%%']) assert.equal(readState(url, catalog).error, true);
  const bytes = Buffer.from(new URL(valid).hash.split('.').at(-1), 'base64url');
  bytes[bytes.length - 8] ^= 1;
  assert.equal(readState(`${base}#v2.${CATALOG_VERSION}.${bytes.toString('base64url')}`, catalog).error, true);
  bytes.writeUInt32LE(0xffffffff, bytes.length - 4);
  assert.equal(readState(`${base}#v2.${CATALOG_VERSION}.${bytes.toString('base64url')}`, catalog).error, true);
  assert.equal(readState(valid).error, true);
});
test('clock validation still rejects invalid fields, settings, and duplicates', () => {
  const clock = defaults()[0];
  for (const records of [null, [null], [clock, clock], [{ ...clock, hours: 13 }], [{ ...clock, zone: 'Invalid/Zone' }], [{ ...clock, display: 'sun' }], [{ ...clock, extra: true }]]) assert.throws(() => validateClocks(records));
});

test('per-card designs survive sharing, formats, ordering, and 1000-clock links', () => {
  const clocks = sample(1000).map((clock, i) => ({ ...clock, design: i % 6 + (i % 2 ? 8 : 0) + (i % 3 ? 16 : 0) }));
  const normalized = validateClocks(clocks);
  const url = stateURL(base, clocks);
  assert.deepEqual(readState(url, catalog).clocks, normalized);
  assert.deepEqual(readState(stateURL(base, clocks.toReversed()), catalog).clocks, normalized.toReversed());
  assert.ok(url.length < 16000);
  for (const design of [-1, 6, 7, 30, 32, 1.5, '1', null]) {
    assert.throws(() => validateClocks([{ ...defaults()[0], design }]));
    assert.equal(readState(packed([[0, design]]), catalog).error, true);
  }
  for (const tokens of [[[0]], [[0, 1, 2]], [[0, 1], 0], [[[], 1]]]) assert.equal(readState(packed(tokens), catalog).error, true);
  assert.deepEqual(readState(packed([0, [5100016, 9]]), catalog).clocks.map(c => c.design || 0), [0, 9]);
});
