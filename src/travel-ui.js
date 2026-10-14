import { pickerValue, pickerInstants } from './travel-time.js';
import { timeAt, offsetText } from './time.js';
import { clockTitle } from './state.js';

export function setupTimeTravel({ getInstant, getClocks, setInstant }) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#travel-dialog');
  const field = $('#travel-datetime');
  const zone = $('#travel-zone');
  const occurrence = $('#travel-occurrence');
  let candidates = [];
  let draft;
  let opener;
  function validate() {
    candidates = pickerInstants(field.value, zone.value);
    occurrence.replaceChildren();
    candidates.forEach((instant, index) => {
      const time = timeAt(zone.value, instant);
      occurrence.add(new Option(`${index === 0 ? 'First' : 'Second'} occurrence · ${time.abbreviation} · ${offsetText(time.offset)}`, String(index)));
    });
    $('#travel-fold').hidden = candidates.length < 2;
    $('#travel-error').hidden = candidates.length > 0;
    $('#travel-apply').disabled = candidates.length === 0;
    $('#travel-preview').textContent = candidates.length ? `${candidates[0].toISOString().slice(0,19).replace('T', ' ')} UTC` : 'Choose a valid date and time.';
    draft = candidates[0] ?? draft;
  }
  function fill(instant) {
    field.value = pickerValue(instant, zone.value);
    validate();
    const index = candidates.findIndex(candidate => candidate.getTime() === Math.floor(instant.getTime()/1000)*1000);
    occurrence.value = String(Math.max(0, index));
    selectOccurrence();
  }
  function selectOccurrence() {
    draft = candidates[Number(occurrence.value)] ?? draft;
    if (candidates.length) $('#travel-preview').textContent = `${draft.toISOString().slice(0,19).replace('T', ' ')} UTC`;
  }
  function open() {
    opener = document.activeElement;
    const device = new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const zones = new Map([[device, `Your timezone · ${device.replaceAll('_',' ')}`], ['UTC', 'UTC']]);
    for (const clock of getClocks()) if (!zones.has(clock.zone)) zones.set(clock.zone, `${clockTitle(clock)} · ${clock.zone.replaceAll('_',' ')}`);
    const previous = zone.value;
    zone.replaceChildren(...[...zones].map(([value,label]) => new Option(label,value)));
    zone.value = zones.has(previous) ? previous : device;
    fill(getInstant());
    dialog.showModal();
    field.focus();
  }
  function close() { dialog.close(); opener?.focus(); }
  $('#time-travel').addEventListener('click', open);
  $('#adjust-time').addEventListener('click', open);
  $('#close-travel').addEventListener('click', close);
  $('#cancel-travel').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  field.addEventListener('input', validate);
  zone.addEventListener('change', () => fill(draft));
  occurrence.addEventListener('change', selectOccurrence);
  $('#freeze-now').addEventListener('click', () => { if (setInstant(new Date())) close(); });
  $('#resume-time').addEventListener('click', () => setInstant(null));
  for (const button of dialog.querySelectorAll('[data-time-shift]')) button.addEventListener('click', () => {
    const next = new Date(draft.getTime() + Number(button.dataset.timeShift) * 3600000);
    if (next.getUTCFullYear() >= 1000 && next.getUTCFullYear() <= 9999) fill(next);
  });
  $('#travel-form').addEventListener('submit', event => {
    event.preventDefault();
    if (candidates.length && setInstant(draft)) close();
  });
}
