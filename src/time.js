const cache = new Map();
function formatter(zone, kind) {
  const key = `${zone}:${kind}`;
  if (!cache.has(key)) {
    const options = kind === 'abbreviation' ? { timeZoneName: 'short' } : kind === 'date'
      ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
      : { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
    cache.set(key, new Intl.DateTimeFormat(kind === 'abbreviation' ? 'en-US' : 'en-GB', { timeZone: zone, ...options }));
    if (cache.size > 128) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}
const pad = (n) => String(n).padStart(2, '0');
export function timeAt(zone, instant) {
  const parts = Object.fromEntries(formatter(zone, 'parts').formatToParts(instant).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
  const local = new Date(0);
  local.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  local.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  const offset = Math.round((local.getTime() - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
  return { ...parts, offset, abbreviation: zoneAbbreviation(zone, instant, offset), date: formatter(zone, 'date').format(instant) };
}
// Intl may return numeric GMT offsets for these common English abbreviations.
// Browser-computed offsets remain authoritative, including all DST transitions.
const shortNames = {
  'Asia/Kolkata': { 330: 'IST' }, 'Asia/Calcutta': { 330: 'IST' },
  'Asia/Shanghai': { 480: 'CST' }, 'Asia/Taipei': { 480: 'CST' },
  'Asia/Tokyo': { 540: 'JST' }, 'Asia/Seoul': { 540: 'KST' },
  'Asia/Singapore': { 480: 'SGT' }, 'Asia/Hong_Kong': { 480: 'HKT' },
  'Asia/Kathmandu': { 345: 'NPT' }, 'Asia/Katmandu': { 345: 'NPT' },
  'Europe/London': { 0: 'GMT', 60: 'BST' },
  'Australia/Sydney': { 600: 'AEST', 660: 'AEDT' },
  'Australia/Melbourne': { 600: 'AEST', 660: 'AEDT' },
  'Australia/Perth': { 480: 'AWST' },
  'Pacific/Auckland': { 720: 'NZST', 780: 'NZDT' },
};
export function zoneAbbreviation(zone, instant, offset) {
  return shortNames[zone]?.[offset] ?? formatter(zone, 'abbreviation').formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value ?? 'UTC';
}
export function clockText(parts, hours) {
  const hour = hours === 12 ? parts.hour % 12 || 12 : pad(parts.hour);
  return { main: `${hour}:${pad(parts.minute)}`, seconds: pad(parts.second), period: hours === 12 ? (parts.hour < 12 ? 'AM' : 'PM') : '' };
}
export function offsetText(offset) {
  return offset === 0 ? 'UTC +00:00' : `UTC ${offset < 0 ? '−' : '+'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}
export function handAngles(parts) {
  return { hour: (parts.hour % 12) * 30 + parts.minute / 2 + parts.second / 120, minute: parts.minute * 6 + parts.second / 10, second: parts.second * 6 };
}
export function orderedClocks(clocks, instant) {
  return clocks.map((clock) => ({ clock, time: timeAt(clock.zone, instant) })).sort((a, b) => a.time.offset - b.time.offset || (a.clock.id < b.clock.id ? -1 : a.clock.id > b.clock.id ? 1 : 0));
}
