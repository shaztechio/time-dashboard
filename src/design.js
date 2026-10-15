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
// Stable indices are part of the compact URL format; append, never reorder.
export const PALETTES = ['Original', 'Ocean', 'Sage', 'Rose', 'Lavender', 'Sand'];
export const validDesign = value => Number.isInteger(value) && value >= 0 && value < 32 && value % 8 < PALETTES.length;
export function applyDesign(element, value = 0) {
  element.dataset.palette = String(value % 8);
  element.dataset.finish = value & 8 ? 'gradient' : 'solid';
  element.dataset.dial = value & 16 ? 'minimal' : 'classic';
}
