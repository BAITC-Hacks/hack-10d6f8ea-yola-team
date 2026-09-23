import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../../src/db/database.mjs';
import { createAuthService } from '../../src/services/auth-service.mjs';
import { createProductService } from '../../src/services/product-service.mjs';
import { createAppServer } from '../../server.mjs';

export async function createTestApp(t, serviceOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'sana-hub-auth-'));
  const databasePath = join(directory, 'auth.sqlite');
  const db = createDatabase({ databasePath });
  const authService = createAuthService({ db, ...serviceOptions });
  const productService = createProductService({ db });
  const server = createAppServer({ authService, productService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    db.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { base: `http://127.0.0.1:${server.address().port}`, databasePath, db, authService, productService, server };
}

export function cookieFrom(response) {
  return String(response.headers.get('set-cookie') || '').split(';')[0];
}

export function jsonRequest(method, body, cookie = '') {
  return { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) };
}
