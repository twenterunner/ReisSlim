import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

test('Local static-server smoke test serves the application shell and modules', async () => {
  const config = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
  const build = config.match(/BUILD = '([^']+)'/)?.[1];
  assert.ok(build, 'Build number should be declared in config.js');
  const server = createServer(async (request, response) => {
    const path = request.url === '/' ? 'index.html' : request.url.split('?')[0].replace(/^\//, '');
    try { const content = await readFile(join(root, path)); response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); response.end(content); }
    catch { response.writeHead(404); response.end('not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const html = await fetch(`http://127.0.0.1:${port}/`).then(response => { assert.equal(response.status, 200); return response.text(); });
    assert.match(html, new RegExp(`app\\.js\\?v=${build}`));
    const module = await fetch(`http://127.0.0.1:${port}/itinerary-engine.js`).then(response => { assert.equal(response.status, 200); return response.text(); });
    assert.match(module, /buildItinerary/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
