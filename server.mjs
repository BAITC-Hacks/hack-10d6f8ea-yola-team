import './src/config/env.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './src/db/database.mjs';
import { analyzeTask } from './src/services/ai-server.mjs';
import { handleAuthRequest } from './src/services/auth-http.mjs';
import { createAuthService } from './src/services/auth-service.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const publicFiles = new Set([
  'index.html', 'styles.css', 'question-states.css', 'onboarding.css', 'success.css', 'marketplace.css', 'card-change.css',
  'src/app.js', 'src/data.js', 'src/models.js', 'src/store.js',
  'src/services/ai.js', 'src/services/scoring.js', 'src/services/marketplace.js', 'src/services/card-change.js',
]);

export const sendJson = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 200_000) throw new HttpError(413, 'Request body is too large');
  }
  try { return JSON.parse(body || '{}'); } catch { throw new HttpError(400, 'Malformed JSON payload'); }
}

export function createAppServer({ authService, production = process.env.NODE_ENV === 'production' } = {}) {
  if (!authService) throw new Error('createAppServer requires authService');
  return createServer(async (request, response) => {
    let pathname = '/';
    try {
      pathname = new URL(request.url || '/', 'http://localhost').pathname;
      if (await handleAuthRequest({ request, response, pathname, service: authService, readJson, sendJson, production })) return;
      if (request.method === 'POST' && pathname === '/api/ai/analyze') {
        const payload = await readJson(request);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return sendJson(response, 400, { error: 'Invalid JSON payload' });
        return sendJson(response, 200, await analyzeTask(payload));
      }
      if (pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'Not found' });
      if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed' });
      const requested = decodeURIComponent(pathname);
      const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
      if (!publicFiles.has(relative)) throw new HttpError(404, 'Not found');
      const filePath = normalize(join(root, relative));
      if (!filePath.startsWith(root)) throw new HttpError(403, 'Forbidden');
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (pathname.startsWith('/api/')) return sendJson(response, error.status || 500, { error: error.status ? error.message : 'Server request failed safely' });
      response.writeHead(error.status || 404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.status === 403 ? 'Forbidden' : 'Not found');
    }
  });
}

if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  const database = createDatabase();
  const authService = createAuthService({ db: database });
  const server = createAppServer({ authService });
  server.listen(port, () => console.log(`Sana Hub: http://localhost:${port} | AI: ${process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? `OpenAI/${process.env.OPENAI_MODEL}` : 'fallback (set OPENAI_API_KEY and OPENAI_MODEL to enable OpenAI)'}`));
  const shutdown = () => server.close(() => { database.close(); process.exit(0); });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
