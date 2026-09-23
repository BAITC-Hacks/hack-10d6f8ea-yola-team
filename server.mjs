import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTask } from './src/services/ai-server.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const sendJson = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 200_000) throw new HttpError(413, 'Request body is too large');
  }
  try { return JSON.parse(body || '{}'); } catch { throw new HttpError(400, 'Malformed JSON payload'); }
}

export const server = createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/api/ai/analyze') {
      const payload = await readJson(request);
      if (!payload || typeof payload !== 'object') return sendJson(response, 400, { error: 'Invalid JSON payload' });
      return sendJson(response, 200, await analyzeTask(payload));
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed' });
    const requested = decodeURIComponent((request.url || '/').split('?')[0]);
    const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
    const filePath = normalize(join(root, relative));
    if (!filePath.startsWith(root)) { response.writeHead(403); response.end('Forbidden'); return; }
    const body = await readFile(filePath); response.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) { if (request.url === '/api/ai/analyze') sendJson(response, error.status || 500, { error: error.status ? error.message : 'AI service failed safely' }); else { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found'); } }
});

if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  server.listen(port, () => console.log(`Sana Hub: http://localhost:${port} | AI: ${process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? `OpenAI/${process.env.OPENAI_MODEL}` : 'fallback (set OPENAI_API_KEY and OPENAI_MODEL to enable OpenAI)'}`));
}
