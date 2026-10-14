import { readFile, writeFile } from 'node:fs/promises';
import { CATALOG_VERSION } from '../src/catalog.js';
const version = process.argv[2] || CATALOG_VERSION;
if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) throw new Error('Invalid snapshot');
const data = JSON.parse(await readFile(`data/cities-${version}.json`, 'utf8'));
if (!/^\d{4}-\d{2}-\d{2}$/.test(data.snapshot)) throw new Error('Invalid catalog snapshot');
const output = `data/clock-catalog-${data.snapshot}.json`;
const text = JSON.stringify({ version: data.snapshot, cities: data.cities.map(([id, name, , country, zone]) => [id, name, country, zone]) });
try {
  const existing = await readFile(output, 'utf8');
  if (JSON.stringify(JSON.parse(existing)) !== text) throw new Error(`Refusing to replace immutable catalog ${output}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(output, text, { flag: 'wx' });
}
console.log(`Clock lookup catalog ready: ${output}`);
