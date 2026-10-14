import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';

const root = resolve(process.env.SERVE_DIR || '.');
const production = !!process.env.SERVE_DIR;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
function encodings(header = '') {
  const entries = new Map(header.split(',').map(entry => {
    const [name, ...options] = entry.trim().toLowerCase().split(';');
    const q = options.find(option => option.trim().startsWith('q='));
    return [name, q ? Number(q.trim().slice(2)) : 1];
  }));
  return ['br', 'gzip'].map(name => ({ name, q: entries.get(name) ?? entries.get('*') ?? 0 })).filter(item => item.q > 0).sort((a,b) => b.q-a.q);
}
const server = createServer(async (req, res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    const url = new URL(req.url, 'http://localhost');
    let file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) {
      if (!url.pathname.endsWith('/')) { res.writeHead(308, { Location: url.pathname + '/' + url.search }).end(); return; }
      file = resolve(file, 'index.html');
    }
    const compressible = /\.(html|css|js|json|svg)$/.test(file);
    let body;
    let encoding;
    if (production && compressible) for (const candidate of encodings(req.headers['accept-encoding'])) {
      try { body = await readFile(file + (candidate.name === 'br' ? '.br' : '.gz')); encoding = candidate.name; break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    body ??= await readFile(file);
    const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
    const immutable = production && /[/\\](cities|clock-catalog)-\d{4}-\d{2}-\d{2}\.json$/.test(file);
    const headers = { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', ETag: etag };
    if (compressible) headers.Vary = 'Accept-Encoding';
    if (encoding) headers['Content-Encoding'] = encoding;
    if (req.headers['if-none-match']?.split(',').some(value => value.trim().replace(/^W\//,'') === etag || value.trim() === '*')) { res.writeHead(304, headers).end(); return; }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) { res.writeHead(['ENOENT','ENOTDIR'].includes(error.code) ? 404 : 500, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Could not serve this file'); }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${server.address().port}`));
