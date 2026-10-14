// Stable indices are part of the compact URL format; append, never reorder.
export const PALETTES = ['Original', 'Ocean', 'Sage', 'Rose', 'Lavender', 'Sand'];
export const validDesign = value => Number.isInteger(value) && value >= 0 && value < 32 && value % 8 < PALETTES.length;
export function applyDesign(element, value = 0) {
  element.dataset.palette = String(value % 8);
  element.dataset.finish = value & 8 ? 'gradient' : 'solid';
  element.dataset.dial = value & 16 ? 'minimal' : 'classic';
}
