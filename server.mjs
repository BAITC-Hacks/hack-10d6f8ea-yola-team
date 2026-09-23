import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

createServer(async (request, response) => {
  const requested = decodeURIComponent((request.url || '/').split('?')[0]);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const filePath = normalize(join(root, relative));
  if (!filePath.startsWith(root)) { response.writeHead(403); response.end('Forbidden'); return; }
  try { const body = await readFile(filePath); response.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream' }); response.end(body); }
  catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found'); }
}).listen(port, () => console.log(`Sana Hub: http://localhost:${port}`));
