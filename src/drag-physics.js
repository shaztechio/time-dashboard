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
const clamp = (value, max) => Math.max(-max, Math.min(max, value));

export function pointerMotion(x, y, time) {
  return { x, y, time, vx: 0, vy: 0 };
}

export function samplePointer(motion, x, y, time) {
  const elapsed = time - motion.time;
  if (elapsed <= 0) return;
  // Time-based filtering gives the same response across pointer polling rates.
  const dt = elapsed / 1000;
  const blend = 1 - Math.exp(-dt / .025);
  const previous = velocityAt(motion, time);
  motion.vx = previous.x + (clamp((x - motion.x) / dt, 6000) - previous.x) * blend;
  motion.vy = previous.y + (clamp((y - motion.y) / dt, 6000) - previous.y) * blend;
  Object.assign(motion, { x, y, time });
}

export function velocityAt(motion, time) {
  // Browsers stop sending movement events when the mouse stops. Let the last
  // sample fade rather than leaving the card tilted at an old velocity.
  const decay = Math.exp(-Math.max(0, time - motion.time - 35) / 65);
  return { x: motion.vx * decay, y: motion.vy * decay };
}

export function tiltTargets(velocity, grip) {
  // The card's center trails the grabbed point: horizontal and vertical motion
  // contribute according to their lever arms around that point.
  const length = Math.max(1, Math.hypot(grip.x, grip.y));
  const swing = (velocity.x * grip.y - velocity.y * grip.x) / length;
  return {
    x: 5 + clamp(velocity.y / 240, 9),
    y: -grip.x / length * 8 - clamp(velocity.x / 300, 9),
    z: Math.atan2(grip.x, grip.y) * 180 / Math.PI * .22 + clamp(swing / 85, 22),
  };
}

export function spring(axis, target, dt, stiffness = 240, damping = 25) {
  // Small substeps keep the same damping at 30, 60, and 120 Hz.
  const steps = Math.max(1, Math.ceil(dt * 120));
  const step = dt / steps;
  for (let i = 0; i < steps; i++) {
    axis.velocity += ((target - axis.value) * stiffness - axis.velocity * damping) * step;
    axis.value += axis.velocity * step;
  }
  return axis.value;
}
