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
import { pointerMotion, samplePointer, velocityAt, tiltTargets, spring } from '../src/drag-physics.js';

const grip = { x: -130, y: 200 };
function move(speed, hz = 120, duration = 500) {
  const motion = pointerMotion(0, 0, 0);
  for (let t = 1000 / hz; t <= duration + .001; t += 1000 / hz) samplePointer(motion, speed * t / 1000, 0, t);
  return motion;
}
test('swing reflects pointer speed and direction, including vertical motion', () => {
  const rest = tiltTargets({ x: 0, y: 0 }, grip).z;
  const slow = tiltTargets(velocityAt(move(200), 500), grip).z;
  const fast = tiltTargets(velocityAt(move(1200), 500), grip).z;
  assert.ok(fast > slow && slow > rest);
  assert.ok(tiltTargets(velocityAt(move(-1200), 500), grip).z < rest);
  assert.ok(tiltTargets({ x: 0, y: 1000 }, grip).z > rest);
  assert.ok(tiltTargets({ x: 0, y: -1000 }, grip).z < rest);
});
test('reversing the pointer changes momentum and stopping removes stale velocity', () => {
  const motion = move(1000);
  for (let t = 510; t <= 600; t += 10) samplePointer(motion, 500 - (t - 500), 0, t);
  assert.ok(velocityAt(motion, 600).x < -900);
  assert.ok(Math.abs(velocityAt(motion, 1100).x) < 1);
});
test('velocity and spring response are consistent across event and frame rates', () => {
  const velocities = [30, 60, 120, 240].map(hz => velocityAt(move(800, hz), 500).x);
  assert.ok(Math.max(...velocities) - Math.min(...velocities) < 1);
  const positions = [30, 60, 120].map(hz => {
    const axis = { value: 0, velocity: 0 };
    for (let i = 0; i < hz; i++) spring(axis, 20, 1 / hz, 220, 18);
    return axis.value;
  });
  assert.ok(Math.max(...positions) - Math.min(...positions) < .001);
});
