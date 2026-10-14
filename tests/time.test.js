import test from 'node:test';
import assert from 'node:assert/strict';
import { timeAt, clockText, handAngles, orderedClocks, offsetText } from '../src/time.js';
import { defaults } from '../src/state.js';
const at = (zone, date) => timeAt(zone, new Date(date));
const fields = (p) => [p.hour, p.minute, p.second, p.offset];

test('Los Angeles spring gap and autumn repeated hour are correct', () => {
  assert.deepEqual(fields(at('America/Los_Angeles', '2026-03-08T09:59:59Z')), [1, 59, 59, -480]);
  assert.deepEqual(fields(at('America/Los_Angeles', '2026-03-08T10:00:00Z')), [3, 0, 0, -420]);
  assert.deepEqual(fields(at('America/Los_Angeles', '2026-11-01T08:59:59Z')), [1, 59, 59, -420]);
  assert.deepEqual(fields(at('America/Los_Angeles', '2026-11-01T09:00:00Z')), [1, 0, 0, -480]);
});
test('timezone abbreviations match the current offset and retain legitimate longer codes', () => {
  assert.equal(at('America/Los_Angeles', '2026-03-08T09:59:59Z').abbreviation, 'PST');
  assert.equal(at('America/Los_Angeles', '2026-03-08T10:00:00Z').abbreviation, 'PDT');
  assert.equal(at('UTC', '2026-01-01T00:00:00Z').abbreviation, 'UTC');
  assert.equal(at('Asia/Kolkata', '2026-01-01T00:00:00Z').abbreviation, 'IST');
  assert.equal(at('Asia/Shanghai', '2026-01-01T00:00:00Z').abbreviation, 'CST');
  assert.equal(at('Australia/Sydney', '2026-01-01T00:00:00Z').abbreviation, 'AEDT');
});
test('southern DST and a half-hour transition are correct', () => {
  assert.deepEqual(fields(at('Australia/Sydney', '2026-04-04T15:59:59Z')), [2, 59, 59, 660]);
  assert.deepEqual(fields(at('Australia/Sydney', '2026-04-04T16:00:00Z')), [2, 0, 0, 600]);
  assert.deepEqual(fields(at('Australia/Lord_Howe', '2026-10-03T15:29:59Z')), [1, 59, 59, 630]);
  assert.deepEqual(fields(at('Australia/Lord_Howe', '2026-10-03T15:30:00Z')), [2, 30, 0, 660]);
});
test('fractional offsets, midnight, noon, and analog hands', () => {
  const instant = '2026-01-01T00:00:00Z';
  assert.deepEqual(fields(at('Asia/Kolkata', instant)), [5, 30, 0, 330]);
  assert.deepEqual(fields(at('Asia/Kathmandu', instant)), [5, 45, 0, 345]);
  assert.deepEqual(clockText(at('UTC', instant), 24), { main: '00:00', seconds: '00', period: '' });
  assert.deepEqual(clockText(at('UTC', instant), 12), { main: '12:00', seconds: '00', period: 'AM' });
  assert.equal(clockText(at('UTC', '2026-01-01T12:00:00Z'), 12).period, 'PM');
  assert.deepEqual(handAngles({ hour: 15, minute: 30, second: 0 }), { hour: 105, minute: 180, second: 0 });
  assert.equal(offsetText(345), 'UTC +05:45');
  assert.equal(offsetText(-210), 'UTC −03:30');
});
test('sort includes date boundaries, stable ties, and changing DST offsets', () => {
  const instant = new Date('2026-01-01T12:00:00Z');
  const clocks = [{ id: 'z', zone: 'Pacific/Kiritimati' }, { id: 'b', zone: 'UTC' }, { id: 'a', zone: 'UTC' }, { id: 'x', zone: 'Etc/GMT+12' }];
  const ordered = orderedClocks(clocks, instant);
  assert.deepEqual(ordered.map((r) => r.clock.id), ['x', 'a', 'b', 'z']);
  assert.equal(ordered[3].time.day, 2);
  assert.deepEqual(orderedClocks(defaults(), instant).map((r) => r.clock.id), defaults().map((c) => c.id));
  const changing = [{ id: 'z', zone: 'America/Los_Angeles' }, { id: 'a', zone: 'Etc/GMT+7' }];
  assert.deepEqual(orderedClocks(changing, new Date('2026-03-08T10:00:00Z')).map((r) => r.clock.id), ['a', 'z']);
  assert.deepEqual(orderedClocks(changing, new Date('2026-03-08T09:59:59Z')).map((r) => r.clock.id), ['z', 'a']);
});
test('timestamps are read independently after suspension and milliseconds do not affect offset', () => {
  assert.equal(at('Asia/Kolkata', '2026-01-01T00:00:00.999Z').offset, 330);
  assert.equal(at('UTC', '2026-01-02T05:00:00Z').hour, 5);
});
