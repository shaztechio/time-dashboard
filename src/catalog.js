import { catalogJSON } from './catalog-cache.js';
export const CATALOG_VERSION = '2026-10-14';
export const CATALOG_VERSIONS = [CATALOG_VERSION];
export function clockCatalog(data, version = CATALOG_VERSION) {
  if (!CATALOG_VERSIONS.includes(version) || data.version !== version || !Array.isArray(data.cities)) throw new Error('Unsupported city catalog');
  const records = new Map([[0, { id: 'utc', label: 'UTC', place: '', zone: 'UTC' }]]);
  for (const [id, label, country, zone] of data.cities) records.set(id, { id: `geonames:${id}`, label, place: country, zone });
  return records;
}
const pending = new Map();
export function loadClockCatalog(version = CATALOG_VERSION) {
  if (!CATALOG_VERSIONS.includes(version)) return Promise.reject(new Error('Unsupported city catalog'));
  if (!pending.has(version)) pending.set(version, catalogJSON(new URL(`../data/clock-catalog-${version}.json`, import.meta.url), data => clockCatalog(data, version))
    .then(data => clockCatalog(data, version)).catch(error => { pending.delete(version); throw error; }));
  return pending.get(version);
}
