import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('frontend role comes from server auth without the legacy role switch', async () => {
  const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /role-switch/);
  assert.doesNotMatch(source, /data-role/);
  assert.doesNotMatch(source, /store\.currentRole/);
  assert.match(source, /\/api\/auth\/me/);
  assert.match(source, /\/api\/auth\/register/);
  assert.match(source, /\/api\/auth\/login/);
  assert.match(source, /user-\$\{auth\.user\.id\}/);
});
