import './src/config/env.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './src/db/database.mjs';
import { analyzeTask } from './src/services/ai-server.mjs';
import { handleAuthRequest } from './src/services/auth-http.mjs';
import { createAuthService } from './src/services/auth-service.mjs';
import { handleProductRequest } from './src/services/product-http.mjs';
import { createProductService } from './src/services/product-service.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const publicFiles = new Set([
  'index.html', 'styles.css', 'question-states.css', 'onboarding.css', 'success.css', 'marketplace.css', 'card-change.css',
  'src/app.js', 'src/api.js', 'src/models.js',
  'src/services/ai.js', 'src/services/scoring.js', 'src/services/marketplace.js', 'src/services/card-change.js',
]);
const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const sendJson = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 200_000) throw new HttpError(413, 'Request body is too large');
  }
  try { return JSON.parse(body || '{}'); } catch { throw new HttpError(400, 'Malformed JSON payload'); }
}

function validateMutation(request, pathname) {
  if (!pathname.startsWith('/api/') || !mutationMethods.has(request.method || '')) return;
  const contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) throw new HttpError(415, 'Content-Type application/json is required');
  const origin = String(request.headers.origin || '');
  const configuredOrigin = String(process.env.APP_ORIGIN || '').replace(/\/$/, '');
  const requestOrigin = request.headers.host ? `http://${request.headers.host}` : '';
  if (origin && origin !== (configuredOrigin || requestOrigin)) throw new HttpError(403, 'Origin is not allowed');
  if (request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site request is not allowed');
}

function createRateLimiter(now = () => Date.now()) {
  const entries = new Map();
  return (request, pathname) => {
    const settings = pathname === '/api/ai/analyze' ? { limit: 20, windowMs: 60_000 }
      : ['/api/auth/login', '/api/auth/register'].includes(pathname) ? { limit: 30, windowMs: 15 * 60_000 } : null;
    if (!settings) return;
    const key = `${request.socket.remoteAddress || 'unknown'}:${pathname}`;
    const current = entries.get(key);
    const time = now();
    const bucket = !current || current.resetAt <= time ? { count: 0, resetAt: time + settings.windowMs } : current;
    bucket.count += 1;
    entries.set(key, bucket);
    if (bucket.count > settings.limit) throw new HttpError(429, 'Слишком много запросов. Повторите позже.');
  };
}

export function createAppServer({ authService, productService, aiAnalyze = analyzeTask, production = process.env.NODE_ENV === 'production' } = {}) {
  if (!authService) throw new Error('createAppServer requires authService');
  if (!productService) throw new Error('createAppServer requires productService');
  const rateLimit = createRateLimiter();
  return createServer(async (request, response) => {
    let pathname = '/';
    try {
      pathname = new URL(request.url || '/', 'http://localhost').pathname;
      validateMutation(request, pathname);
      rateLimit(request, pathname);
      if (await handleAuthRequest({ request, response, pathname, service: authService, readJson, sendJson, production })) return;
      if (await handleProductRequest({ request, response, pathname, authService, productService, analyzeTask: aiAnalyze, readJson, sendJson })) return;
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
      if (pathname.startsWith('/api/')) {
        const payload = { error: error.status ? error.message : 'Server request failed safely' };
        if (error.status && error.details) payload.details = error.details;
        return sendJson(response, error.status || 500, payload);
      }
      response.writeHead(error.status || 404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.status === 403 ? 'Forbidden' : 'Not found');
    }
  });
}

if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  const database = createDatabase();
  const authService = createAuthService({ db: database });
  const productService = createProductService({ db: database });
  const server = createAppServer({ authService, productService });
  server.listen(port, () => console.log(`Sana Hub: http://localhost:${port} | AI: ${process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? `OpenAI/${process.env.OPENAI_MODEL}` : 'fallback (set OPENAI_API_KEY and OPENAI_MODEL to enable OpenAI)'}`));
  const shutdown = () => server.close(() => { database.close(); process.exit(0); });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
