import { randomUUID } from 'node:crypto';
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from './auth-crypto.mjs';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(['business', 'student']);
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_SALT = 'invalid-user-salt';
const DUMMY_HASH = Buffer.alloc(64).toString('base64url');
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function requireText(value, label, { required = true, max = 1000 } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text) throw new AuthError(400, `${label}: обязательное поле.`);
  if (text.length > max) throw new AuthError(400, `${label}: слишком длинное значение.`);
  return text;
}

function validateProfile(role, input) {
  const name = requireText(input?.name, 'Имя', { max: 120 });
  if (role === 'business') {
    return {
      name,
      company: requireText(input?.company, 'Компания', { max: 200 }),
      industry: requireText(input?.industry, 'Отрасль', { max: 200 }),
      contact: requireText(input?.contact, 'Контакт', { max: 254 }),
      interactionFormat: requireText(input?.interactionFormat, 'Формат взаимодействия'),
      team: '', skills: '', technologies: '', interests: '', portfolio: '',
    };
  }
  const portfolio = requireText(input?.portfolio, 'Портфолио', { required: false, max: 500 });
  if (portfolio) {
    try {
      const url = new URL(portfolio);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      throw new AuthError(400, 'Портфолио должно быть корректной http(s)-ссылкой.');
    }
  }
  return {
    name,
    company: '', industry: '', contact: '', interactionFormat: '',
    team: requireText(input?.team, 'Команда', { required: false, max: 200 }),
    skills: requireText(input?.skills, 'Навыки'),
    technologies: requireText(input?.technologies, 'Технологии'),
    interests: requireText(input?.interests, 'Интересы'),
    portfolio,
  };
}

export function createAuthService({ db, now = () => Date.now(), sessionTtlMs = Number(process.env.SESSION_TTL_MS) || DEFAULT_SESSION_TTL_MS } = {}) {
  if (!db) throw new Error('Auth service requires a database');
  if (!Number.isFinite(sessionTtlMs) || sessionTtlMs <= 0) throw new Error('SESSION_TTL_MS must be a positive number');

  const findUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');
  const findProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?');
  const insertUser = db.prepare('INSERT INTO users (email, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insertSession = db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)');
  const findSession = db.prepare(`SELECT sessions.token_hash, sessions.expires_at, users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?`);
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const deleteExpiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  const upsertProfile = db.prepare(`
    INSERT INTO profiles (user_id, name, company, industry, contact, interaction_format, team, skills, technologies, interests, portfolio, updated_at)
    VALUES (@userId, @name, @company, @industry, @contact, @interactionFormat, @team, @skills, @technologies, @interests, @portfolio, @updatedAt)
    ON CONFLICT(user_id) DO UPDATE SET
      name = excluded.name, company = excluded.company, industry = excluded.industry,
      contact = excluded.contact, interaction_format = excluded.interaction_format,
      team = excluded.team, skills = excluded.skills, technologies = excluded.technologies,
      interests = excluded.interests, portfolio = excluded.portfolio, updated_at = excluded.updated_at
  `);
  const updateUserTimestamp = db.prepare('UPDATE users SET updated_at = ? WHERE id = ?');

  function safeProfile(row, role) {
    if (!row) return null;
    if (role === 'business') return { name: row.name, company: row.company || '', industry: row.industry || '', contact: row.contact || '', interactionFormat: row.interaction_format || '' };
    return { name: row.name, team: row.team || '', skills: row.skills || '', technologies: row.technologies || '', interests: row.interests || '', portfolio: row.portfolio || '' };
  }

  function safeUser(row) {
    if (!row) return null;
    return { id: Number(row.id), email: row.email, role: row.role, createdAt: row.created_at, updatedAt: row.updated_at, profile: safeProfile(findProfile.get(row.id), row.role) };
  }

  function createSession(userId) {
    const token = createSessionToken();
    const tokenHash = hashSessionToken(token);
    const createdAt = new Date(now()).toISOString();
    const expiresAt = now() + sessionTtlMs;
    deleteExpiredSessions.run(now());
    insertSession.run(randomUUID(), userId, tokenHash, expiresAt, createdAt);
    return { token, expiresAt };
  }

  async function register(input = {}) {
    if (!isRecord(input)) throw new AuthError(400, 'JSON payload должен быть объектом.');
    const email = normalizeEmail(input.email);
    const password = typeof input.password === 'string' ? input.password : '';
    const role = input.role;
    if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new AuthError(400, 'Укажите корректный email.');
    if (password.length < 8 || password.length > 1024) throw new AuthError(400, 'Пароль должен содержать минимум 8 символов.');
    if (!ROLES.has(role)) throw new AuthError(400, 'Выберите роль business или student.');
    const { passwordHash, passwordSalt } = await hashPassword(password);
    const timestamp = new Date(now()).toISOString();
    let userId;
    try {
      userId = Number(insertUser.run(email, passwordHash, passwordSalt, role, timestamp, timestamp).lastInsertRowid);
    } catch (error) {
      if (String(error.code).includes('CONSTRAINT') || String(error.message).includes('users.email')) throw new AuthError(409, 'Аккаунт с таким email уже существует.');
      throw error;
    }
    const session = createSession(userId);
    return { user: safeUser(findUserById.get(userId)), ...session };
  }

  async function login(input = {}) {
    if (!isRecord(input)) throw new AuthError(400, 'JSON payload должен быть объектом.');
    const email = normalizeEmail(input.email);
    const password = typeof input.password === 'string' ? input.password : '';
    const row = findUserByEmail.get(email);
    const valid = row
      ? await verifyPassword(password, row.password_salt, row.password_hash)
      : await verifyPassword(password, DUMMY_SALT, DUMMY_HASH);
    if (!row || !valid) throw new AuthError(401, 'Неверный email или пароль.');
    const session = createSession(row.id);
    return { user: safeUser(row), ...session };
  }

  function userForToken(token) {
    if (typeof token !== 'string' || !token) return null;
    const tokenHash = hashSessionToken(token);
    deleteExpiredSessions.run(now());
    const row = findSession.get(tokenHash);
    if (!row || row.expires_at <= now()) {
      deleteSession.run(tokenHash);
      return null;
    }
    return safeUser(row);
  }

  function logout(token) {
    if (typeof token !== 'string' || !token) return false;
    if (!userForToken(token)) return false;
    return deleteSession.run(hashSessionToken(token)).changes > 0;
  }

  function updateProfile(token, input) {
    const user = userForToken(token);
    if (!user) throw new AuthError(401, 'Требуется вход в аккаунт.');
    if (!isRecord(input)) throw new AuthError(400, 'JSON payload должен быть объектом.');
    const profile = validateProfile(user.role, input);
    const updatedAt = new Date(now()).toISOString();
    const save = db.transaction(() => {
      upsertProfile.run({ userId: user.id, ...profile, updatedAt });
      updateUserTimestamp.run(updatedAt, user.id);
    });
    save();
    return safeUser(findUserById.get(user.id));
  }

  return { register, login, userForToken, logout, updateProfile, sessionTtlMs };
}
