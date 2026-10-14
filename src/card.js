import { clockText, handAngles, offsetText } from './time.js';
import { clockTitle } from './state.js';

export function createCard(clock, onChange, onRemove, onMove) {
  const card = document.createElement('article');
  card.className = 'clock-card';
  card.tabIndex = -1;
  card.dataset.id = clock.id;
  card.dataset.flipped = 'false';
  // The template is constant; URL-provided values are assigned as text only.
  card.innerHTML = `<div class="card-rotator">
    <div class="card-front">
      <div class="card-top"><h3 class="city-title"></h3><button class="flip-open icon-button" aria-label="Clock settings" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button></div>
      <button class="reorder-handle icon-button" title="Drag to reorder, or use arrow keys" aria-label="Reorder clock"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01"/></svg></button>
      <div class="zone-line"><span class="zone-code"></span><span class="zone-offset"></span></div>
      <div class="clock-face"><svg class="analog" viewBox="0 0 200 200" aria-hidden="true"><circle class="dial" cx="100" cy="100" r="98"/><g class="ticks"></g><g class="numerals"></g><line class="hand hour-hand" x1="100" y1="110" x2="100" y2="53"/><line class="hand minute-hand" x1="100" y1="115" x2="100" y2="31"/><line class="hand second-hand" x1="100" y1="120" x2="100" y2="16"/><circle class="pin" cx="100" cy="100" r="4"/><circle class="pin-center" cx="100" cy="100" r="1.5"/></svg>
      <div class="time-display"><span class="time-main"></span><span class="time-seconds"></span><span class="time-period"></span></div></div>
      <p class="clock-date"></p>
    </div>
    <div class="card-back" inert aria-hidden="true">
      <div class="card-top"><button class="flip-close button secondary">Done</button></div>
      <p class="settings-city"></p>
      <div class="setting"><span class="setting-label">Appearance</span><div class="segments mode-switch" role="group" aria-label="Clock style"><button data-mode="digital" aria-pressed="false">Digital</button><button data-mode="analog" aria-pressed="true">Analog</button></div></div>
      <div class="setting"><span class="setting-label">Hour format</span><div class="segments" role="group" aria-label="Hour format"><button data-hours="12" aria-pressed="false">12-hour</button><button data-hours="24" aria-pressed="true">24-hour</button></div></div>
      <div class="move-controls" role="group" aria-label="Clock position"><button data-move="-1">← Move earlier</button><button data-move="1">Move later →</button></div>
      <button class="remove"><span aria-hidden="true">−</span> Remove clock</button>
    </div>
  </div>`;
  const svgNode = (name, attributes, parent) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    parent.append(node);
    return node;
  };
  for (let i = 0; i < 60; i++) {
    svgNode('line', { x1: 100, y1: 8, x2: 100, y2: i % 5 === 0 ? 17 : 12, transform: `rotate(${i * 6} 100 100)`, class: i % 5 === 0 ? 'major-tick' : 'minor-tick' }, card.querySelector('.ticks'));
  }
  for (let i = 1; i <= 12; i++) {
    const angle = i * Math.PI / 6;
    const node = svgNode('text', { x: 100 + Math.sin(angle) * 70, y: 100 - Math.cos(angle) * 70, 'dominant-baseline': 'central', 'text-anchor': 'middle' }, card.querySelector('.numerals'));
    node.textContent = i;
  }
  const front = card.querySelector('.card-front');
  const back = card.querySelector('.card-back');
  function flip(open) {
    const from = open ? front : back;
    const to = open ? back : front;
    to.inert = false;
    to.removeAttribute('aria-hidden');
    card.dataset.flipped = String(open);
    card.querySelector('.flip-open').setAttribute('aria-expanded', String(open));
    (open ? card.querySelector('.flip-close') : card.querySelector('.flip-open')).focus({ preventScroll: true });
    from.inert = true;
    from.setAttribute('aria-hidden', 'true');
  }
  card.querySelector('.flip-open').addEventListener('click', () => flip(true));
  card.querySelector('.flip-close').addEventListener('click', () => flip(false));
  // The front uses a full-face native button, so taps and Enter/Space work alike.
  // On the settings face, background taps flip back without hijacking controls.
  back.addEventListener('click', (event) => {
    if (!event.target.closest('button, input, label, select, textarea, a')) flip(false);
  });
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && card.dataset.flipped === 'true') { event.preventDefault(); flip(false); }
  });
  card.querySelector('.remove').addEventListener('click', () => onRemove(clock.id));
  for (const button of card.querySelectorAll('[data-mode]')) button.addEventListener('click', () => onChange(clock.id, { display: button.dataset.mode }));
  for (const button of card.querySelectorAll('button[data-hours]')) button.addEventListener('click', () => onChange(clock.id, { hours: Number(button.dataset.hours) }));
  for (const button of card.querySelectorAll('[data-move]')) button.addEventListener('click', () => onMove(clock.id, Number(button.dataset.move)));
  card.querySelector('.reorder-handle').addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      onMove(clock.id, ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
    }
  });
  return card;
}
function setText(element, text) { if (element.textContent !== text) element.textContent = text; }
export function updateCard(card, clock, time) {
  const title = clockTitle(clock);
  card.dataset.display = clock.display;
  card.dataset.hours = clock.hours;
  card.dataset.daylight = String(time.hour >= 6 && time.hour < 18);
  card.setAttribute('aria-label', `${title} clock`);
  setText(card.querySelector('.city-title'), title);
  setText(card.querySelector('.settings-city'), title);
  setText(card.querySelector('.zone-code'), time.abbreviation);
  setText(card.querySelector('.zone-offset'), offsetText(time.offset));
  card.querySelector('.zone-line').title = clock.zone;
  card.querySelector('.flip-open').setAttribute('aria-label', `Settings for ${title}`);
  card.querySelector('.reorder-handle').setAttribute('aria-label', `Reorder ${title}. Drag or use arrow keys`);
  card.querySelector('.remove').setAttribute('aria-label', `Remove ${title}`);
  const { main, seconds, period } = clockText(time, clock.hours);
  setText(card.querySelector('.time-main'), main);
  setText(card.querySelector('.time-seconds'), `:${seconds}`);
  setText(card.querySelector('.time-period'), period);
  card.querySelector('.time-display').setAttribute('aria-label', `${main}:${seconds}${period ? ` ${period}` : ''}`);
  setText(card.querySelector('.clock-date'), time.date);
  for (const button of card.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === clock.display));
  for (const button of card.querySelectorAll('button[data-hours]')) button.setAttribute('aria-pressed', String(Number(button.dataset.hours) === clock.hours));
  if (clock.display === 'analog') {
    for (const [hand, angle] of Object.entries(handAngles(time))) card.querySelector(`.${hand}-hand`).setAttribute('transform', `rotate(${angle} 100 100)`);
  }
}
