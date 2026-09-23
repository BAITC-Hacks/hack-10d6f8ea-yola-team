import { createHash, randomBytes, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return { passwordHash: Buffer.from(hash).toString('base64url'), passwordSalt: salt };
}

export async function verifyPassword(password, passwordSalt, expectedHash) {
  const actual = Buffer.from(await scrypt(password, passwordSalt, KEY_LENGTH));
  const expected = Buffer.from(expectedHash, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
