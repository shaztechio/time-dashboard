import test from 'node:test';
import assert from 'node:assert/strict';
import { clocksText } from '../src/clipboard.js';
import { defaults } from '../src/state.js';

test('copy snapshot preserves order, hour formats, seasonal zones, and local dates', () => {
  const clocks = defaults();
  clocks[0].hours = 12;
  const text = clocksText([clocks[3], clocks[0], clocks[1]], new Date('2026-07-01T23:05:06Z'));
  assert.equal(text, [
    'Shanghai, China — 07:05:06 CST (UTC +08:00) — Thu, 2 Jul 2026',
    'Los Angeles, United States — 4:05:06 PM PDT (UTC −07:00) — Wed, 1 Jul 2026',
    'UTC — 23:05:06 UTC (UTC +00:00) — Wed, 1 Jul 2026',
  ].join('\n'));
  assert.equal(clocksText([], new Date('2026-07-01T23:05:06Z')), '');
});
