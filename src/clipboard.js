import { clockTitle } from './state.js';
import { timeAt, clockText, offsetText } from './time.js';

// Use one instant for the entire snapshot, including clocks across midnight.
export function clocksText(clocks, instant = new Date()) {
  return clocks.map(clock => {
    const time = timeAt(clock.zone, instant);
    const text = clockText(time, clock.hours);
    const local = `${text.main}:${text.seconds}${text.period ? ` ${text.period}` : ''}`;
    return `${clockTitle(clock)} — ${local} ${time.abbreviation} (${offsetText(time.offset)}) — ${time.date}`;
  }).join('\n');
}
