import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestApp } from './helpers/auth-fixture.mjs';

test('server returns stable 404, 405 and malformed JSON errors', async (t) => {
  const { base } = await createTestApp(t);

  const missing = await fetch(`${base}/missing-file`);
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'Not found');

  const wrongMethod = await fetch(`${base}/`, { method: 'PUT' });
  assert.equal(wrongMethod.status, 405);
  assert.deepEqual(await wrongMethod.json(), { error: 'Method not allowed' });

  const malformed = await fetch(`${base}/api/ai/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(malformed.status, 401);
  assert.deepEqual(await malformed.json(), { error: 'Требуется вход в аккаунт.' });

  const malformedPublic = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(malformedPublic.status, 400);
  assert.deepEqual(await malformedPublic.json(), { error: 'Malformed JSON payload' });

  const secret = await fetch(`${base}/.env`);
  assert.equal(secret.status, 404);
  const serverSource = await fetch(`${base}/server.mjs`);
  assert.equal(serverSource.status, 404);
});
