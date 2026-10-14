import { readFile, writeFile } from 'node:fs/promises';
import { supportsZone } from '../src/state.js';
import { normalize } from '../src/search.js';

const [citiesFile, regionsFile, snapshot] = process.argv.slice(2);
if (!citiesFile || !regionsFile || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot ?? '')) {
  console.error('Usage: npm run catalog -- cities15000.txt admin1CodesASCII.txt YYYY-MM-DD');
  process.exit(1);
}
const regions = new Map((await readFile(regionsFile, 'utf8')).trim().split('\n').map((line) => { const row = line.split('\t'); return [row[0], row[1]]; }));
const countries = new Intl.DisplayNames(['en'], { type: 'region' });
const extraAliases = { '1275004': ['Calcutta', 'India Time'], '1796236': ['China Time'], '5368361': ['LA', 'Pacific Time'], '1850147': ['Tokyo', '東京'], '2988507': ['Paris'], '1880252': ['Singapore', '新加坡'], '1275339': ['Bombay'], '1277333': ['Bangalore'], '1816670': ['Peking'], '292223': ['Dubai'] };
const cities = [];
for (const line of (await readFile(citiesFile, 'utf8')).trim().split('\n')) {
  const row = line.split('\t');
  const [id, name, ascii, alternates] = row;
  const zone = row[17];
  if (!id || !name || name.length > 100 || !zone || !supportsZone(zone)) continue;
  const region = regions.get(`${row[8]}.${row[10]}`) ?? '';
  const country = countries.of(row[8]);
  if ([...new Set([region, country].filter(Boolean))].join(', ').length > 160) continue;
  // Bound alias payload while retaining transliterations and curated common names.
  const aliases = [...new Set([...(extraAliases[id] ?? []), ascii, ...alternates.split(',')].filter((alias) => alias && alias.length <= 60 && normalize(alias) !== normalize(name)))].slice(0, 12);
  cities.push([Number(id), name, region, country, zone, Number(row[14]) || 0, aliases]);
}
cities.sort((a, b) => b[5] - a[5]);
const payload = { version: 1, snapshot, source: 'https://download.geonames.org/export/dump/', license: 'CC BY 4.0', fields: ['id', 'name', 'region', 'country', 'zone', 'population', 'aliases'], cities };
await writeFile('data/cities.json', JSON.stringify(payload));
console.log(`Generated ${cities.length} searchable cities (${(Buffer.byteLength(JSON.stringify(payload)) / 1024 / 1024).toFixed(2)} MiB).`);
