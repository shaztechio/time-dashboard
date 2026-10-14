import { gzipSync, gunzipSync } from './vendor/fflate.js';
import { CATALOG_VERSION, CATALOG_VERSIONS } from './catalog.js';
export const SOFT_CLOCK_LIMIT = 1000;
const MAX_DECODED_BYTES = 1024 * 1024;
const MAX_FRAGMENT_CHARS = 512 * 1024;
export const PRESET_CITIES = {
  'preset:pacific': 'geonames:5368361',
  'preset:india': 'geonames:1275004',
  'preset:china': 'geonames:1796236',
};
export const cityIdentity = (clock) => PRESET_CITIES[clock.id] ?? clock.id;
export const defaults = () => [
  { id: 'geonames:5368361', label: 'Los Angeles', place: 'United States', zone: 'America/Los_Angeles', display: 'analog', hours: 24 },
  { id: 'utc', label: 'UTC', place: '', zone: 'UTC', display: 'analog', hours: 24 },
  { id: 'geonames:1275004', label: 'Kolkata', place: 'India', zone: 'Asia/Kolkata', display: 'analog', hours: 24 },
  { id: 'geonames:1796236', label: 'Shanghai', place: 'China', zone: 'Asia/Shanghai', display: 'analog', hours: 24 },
];
export function clockTitle(clock) {
  if (clock.id === 'utc') return 'UTC';
  // Old links retain their fields; preset place already contains city/country.
  if (PRESET_CITIES[clock.id]) return clock.place || clock.label.replace(/ Time$/, '');
  const country = clock.place.split(', ').at(-1);
  return country && country !== clock.label ? `${clock.label}, ${country}` : clock.label;
}
const keys = ['id', 'label', 'place', 'zone', 'display', 'hours'];
const supported = new Map();
export function supportsZone(zone) {
  if (!supported.has(zone)) {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); supported.set(zone, true); }
    catch { supported.set(zone, false); }
    if (supported.size > 512) supported.delete(supported.keys().next().value);
  }
  return supported.get(zone);
}
function boundedString(value, max, empty = false) {
  return typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0) && !/[\u0000-\u001f\u007f]/.test(value);
}
export function validateClocks(clocks) {
  if (!Array.isArray(clocks)) throw new Error('Invalid clocks');
  const ids = new Set();
  return clocks.map((clock) => {
    if (!clock || typeof clock !== 'object' || Array.isArray(clock) || Object.keys(clock).length !== keys.length || keys.some((key) => !Object.hasOwn(clock, key))) throw new Error('Invalid clock fields');
    if (!boundedString(clock.id, 80) || !/^(utc|preset:(pacific|india|china)|geonames:[1-9][0-9]*)$/.test(clock.id)) throw new Error('Invalid clock ID');
    if (!boundedString(clock.label, 100) || !boundedString(clock.place, 160, true)) throw new Error('Invalid label');
    if (!boundedString(clock.zone, 100) || !/^(UTC|[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)+)$/.test(clock.zone) || !supportsZone(clock.zone)) throw new Error('Unsupported time zone');
    if (clock.id === 'utc' && clock.zone !== 'UTC') throw new Error('Invalid UTC clock');
    if (!['analog', 'digital'].includes(clock.display) || ![12, 24].includes(clock.hours)) throw new Error('Invalid clock format');
    const id = cityIdentity(clock);
    if (ids.has(id)) throw new Error('Duplicate city');
    ids.add(id);
    return Object.fromEntries(keys.map((key) => [key, clock[key]]));
  });
}
// CRC validation also detects truncated/corrupted compressed links.
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
function base64url(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function decodeTokens(url) {
  const parsed = new URL(url);
  if (!parsed.hash || parsed.hash === '#clocks') {
    if (parsed.searchParams.has('v') || parsed.searchParams.has('clocks')) throw new Error('This older link format is no longer supported.');
    return null;
  }
  const match = /^#v2\.([0-9]{4}-[0-9]{2}-[0-9]{2})\.([A-Za-z0-9_-]+)$/.exec(parsed.hash);
  if (!match || parsed.hash.length > MAX_FRAGMENT_CHARS) throw new Error('Invalid or oversized clock link.');
  if (!CATALOG_VERSIONS.includes(match[1])) throw new Error('This link needs an unavailable city catalog.');
  const bytes = Uint8Array.from(atob(match[2].replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  if (bytes.length < 18 || bytes[0] !== 31 || bytes[1] !== 139 || bytes[2] !== 8 || bytes[3] !== 0) throw new Error('Invalid compressed clock link.');
  const trailer = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 8, 8);
  const size = trailer.getUint32(4, true);
  if (size > MAX_DECODED_BYTES) throw new Error('Clock link exceeds the decoded size limit.');
  const raw = gunzipSync(bytes, { out: new Uint8Array(size) });
  if (raw.length !== size || crc32(raw) !== trailer.getUint32(0, true)) throw new Error('Clock link is corrupted.');
  const tokens = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  if (!Array.isArray(tokens)) throw new Error('Invalid clock records.');
  const seen = new Set();
  for (const token of tokens) {
    if (!Number.isSafeInteger(token) || token < 0) throw new Error('Invalid clock record.');
    const id = Math.floor(token / 4);
    if (seen.has(id)) throw new Error('Duplicate city in clock link.');
    seen.add(id);
  }
  return tokens;
}
export function readState(url, catalog) {
  try {
    const tokens = decodeTokens(url);
    if (tokens === null) return { clocks: defaults(), error: false };
    const records = tokens.map(token => {
      const id = Math.floor(token / 4);
      const record = catalog?.get(id);
      if (!record) throw new Error(`City ${id} is not in this link's catalog.`);
      return { ...record, display: token % 2 ? 'digital' : 'analog', hours: (token & 2) ? 12 : 24 };
    });
    return { clocks: validateClocks(records), error: false };
  } catch (error) { return { clocks: defaults(), error: true, message: error.message }; }
}
export function stateURL(url, clocks) {
  const parsed = new URL(url);
  const tokens = validateClocks(clocks).map(clock => {
    const identity = cityIdentity(clock);
    const id = identity === 'utc' ? 0 : Number(identity.split(':')[1]);
    const token = id * 4 + (clock.display === 'digital' ? 1 : 0) + (clock.hours === 12 ? 2 : 0);
    if (!Number.isSafeInteger(token)) throw new Error('Invalid city ID.');
    return token;
  });
  const raw = new TextEncoder().encode(JSON.stringify(tokens));
  if (raw.length > MAX_DECODED_BYTES) throw new Error('Clock link exceeds the decoded size limit.');
  parsed.searchParams.delete('v');
  parsed.searchParams.delete('clocks');
  parsed.hash = `v2.${CATALOG_VERSION}.${base64url(gzipSync(raw, { level: 6, mtime: 0 }))}`;
  if (parsed.hash.length > MAX_FRAGMENT_CHARS) throw new Error('Clock link is too large.');
  return parsed.href;
}
