import assert from 'node:assert/strict';
import test from 'node:test';
import { server } from '../server.mjs';

test('server returns stable 404, 405 and malformed JSON errors', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const missing = await fetch(`${base}/missing-file`);
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'Not found');

  const wrongMethod = await fetch(`${base}/`, { method: 'PUT' });
  assert.equal(wrongMethod.status, 405);
  assert.deepEqual(await wrongMethod.json(), { error: 'Method not allowed' });

  const malformed = await fetch(`${base}/api/ai/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'Malformed JSON payload' });
});
