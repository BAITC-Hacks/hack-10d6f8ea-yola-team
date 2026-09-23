import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDatabase } from '../src/db/database.mjs';
import { createAuthService } from '../src/services/auth-service.mjs';
import { cookieFrom, createTestApp, jsonRequest } from './helpers/auth-fixture.mjs';

test('registration, login, profile and logout use a secure server session', async (t) => {
  const { base, db } = await createTestApp(t);
  const password = 'correct-horse-42';
  const register = await fetch(`${base}/api/auth/register`, jsonRequest('POST', { email: 'Owner@Example.com', password, role: 'business' }));
  assert.equal(register.status, 201);
  const setCookie = register.headers.get('set-cookie');
  assert.match(setCookie, /sana_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\//i);
  assert.doesNotMatch(setCookie, /Secure/i);
  const registrationBody = await register.json();
  assert.equal(registrationBody.user.email, 'owner@example.com');
  assert.equal(registrationBody.user.role, 'business');
  assert.equal(registrationBody.user.profile, null);
  assert.doesNotMatch(JSON.stringify(registrationBody), /password|salt|token/i);

  const storedUser = db.prepare('SELECT * FROM users WHERE email = ?').get('owner@example.com');
  assert.notEqual(storedUser.password_hash, password);
  assert.ok(storedUser.password_hash.length > 40);
  assert.ok(storedUser.password_salt.length > 10);
  const rawToken = decodeURIComponent(cookieFrom(register).split('=')[1]);
  const storedSession = db.prepare('SELECT token_hash FROM sessions WHERE user_id = ?').get(storedUser.id);
  assert.notEqual(storedSession.token_hash, rawToken);
  assert.equal(storedSession.token_hash.length, 64);

  const duplicate = await fetch(`${base}/api/auth/register`, jsonRequest('POST', { email: 'OWNER@example.com', password, role: 'business' }));
  assert.equal(duplicate.status, 409);

  const wrongEmail = await fetch(`${base}/api/auth/login`, jsonRequest('POST', { email: 'missing@example.com', password }));
  const wrongPassword = await fetch(`${base}/api/auth/login`, jsonRequest('POST', { email: 'owner@example.com', password: 'wrong-password' }));
  assert.equal(wrongEmail.status, 401);
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(await wrongEmail.json(), await wrongPassword.json());

  const registrationCookie = cookieFrom(register);
  const profile = { name: 'Айдар', company: 'Astana Coffee', industry: 'HoReCa', contact: 'aidar@example.com', interactionFormat: 'Еженедельный созвон' };
  const saveProfile = await fetch(`${base}/api/auth/profile`, jsonRequest('PUT', profile, registrationCookie));
  assert.equal(saveProfile.status, 200);
  assert.deepEqual((await saveProfile.json()).user.profile, profile);

  const firstLogout = await fetch(`${base}/api/auth/logout`, jsonRequest('POST', {}, registrationCookie));
  assert.equal(firstLogout.status, 200);
  const login = await fetch(`${base}/api/auth/login`, jsonRequest('POST', { email: 'owner@example.com', password }));
  assert.equal(login.status, 200);
  const loginCookie = cookieFrom(login);
  const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: loginCookie } });
  const meBody = await me.json();
  assert.equal(meBody.user.role, 'business');
  assert.deepEqual(meBody.user.profile, profile);

  const logout = await fetch(`${base}/api/auth/logout`, jsonRequest('POST', {}, loginCookie));
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  const afterLogout = await fetch(`${base}/api/auth/me`, { headers: { Cookie: loginCookie } });
  assert.deepEqual(await afterLogout.json(), { user: null });
});

test('business and student roles come from the server', async (t) => {
  const { base } = await createTestApp(t);
  const business = await fetch(`${base}/api/auth/register`, jsonRequest('POST', { email: 'business@example.com', password: 'password-123', role: 'business' }));
  assert.equal((await business.json()).user.role, 'business');
  const student = await fetch(`${base}/api/auth/register`, jsonRequest('POST', { email: 'student@example.com', password: 'password-123', role: 'student' }));
  assert.equal((await student.json()).user.role, 'student');
});

test('profile persists after database reinitialization', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sana-hub-persist-'));
  const databasePath = join(directory, 'auth.sqlite');
  t.after(() => rm(directory, { recursive: true, force: true }));
  let db = createDatabase({ databasePath });
  let service = createAuthService({ db });
  const registered = await service.register({ email: 'student@example.com', password: 'password-123', role: 'student' });
  const profile = { name: 'Дана', team: 'Data Team', skills: 'Python, ML', technologies: 'FastAPI', interests: 'Retail AI', portfolio: 'https://example.com/dana' };
  service.updateProfile(registered.token, profile);
  db.close();

  db = createDatabase({ databasePath });
  service = createAuthService({ db });
  const loggedIn = await service.login({ email: 'student@example.com', password: 'password-123' });
  assert.equal(loggedIn.user.role, 'student');
  assert.deepEqual(loggedIn.user.profile, profile);
  db.close();
});

test('expired sessions are ignored and removed', async (t) => {
  let timestamp = 1_700_000_000_000;
  const { db, authService } = await createTestApp(t, { now: () => timestamp, sessionTtlMs: 1000 });
  const registered = await authService.register({ email: 'expiry@example.com', password: 'password-123', role: 'business' });
  assert.equal(authService.userForToken(registered.token).role, 'business');
  timestamp += 1001;
  assert.equal(authService.userForToken(registered.token), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
});
