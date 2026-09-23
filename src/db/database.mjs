import '../config/env.mjs';
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const defaultDatabasePath = resolve(projectRoot, '..', '.sana-hub-data', 'sana-hub.sqlite');
const migrations = [
  { version: 1, name: 'auth', sql: readFileSync(new URL('./migrations/001_auth.sql', import.meta.url), 'utf8') },
  { version: 2, name: 'product-data', sql: readFileSync(new URL('./migrations/002_product_data.sql', import.meta.url), 'utf8') },
];

export function resolveDatabasePath(value = process.env.DATABASE_PATH) {
  if (!value?.trim()) return defaultDatabasePath;
  return isAbsolute(value) ? resolve(value) : resolve(projectRoot, value);
}

export function runMigrations(db, now = () => new Date().toISOString()) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
  const applied = db.prepare('SELECT version FROM schema_migrations').all().map((row) => Number(row.version));
  const apply = db.transaction((migration) => {
    db.exec(migration.sql);
    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
      .run(migration.version, migration.name, now());
    db.pragma(`user_version = ${migration.version}`);
  });
  for (const migration of migrations) if (!applied.includes(migration.version)) apply(migration);
  return db.prepare('SELECT version, name, applied_at AS appliedAt FROM schema_migrations ORDER BY version').all();
}

export function createDatabase({ databasePath = resolveDatabasePath() } = {}) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (databasePath !== ':memory:') db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

export async function backupDatabase(db, destinationPath) {
  if (!db?.open) throw new Error('An open database is required');
  if (!destinationPath || destinationPath === ':memory:') throw new Error('A file destination is required');
  mkdirSync(dirname(resolve(destinationPath)), { recursive: true });
  await db.backup(resolve(destinationPath));
  const restored = new Database(resolve(destinationPath), { readonly: true });
  try {
    restored.pragma('foreign_keys = ON');
    const integrity = restored.pragma('integrity_check', { simple: true });
    const foreignKeys = restored.pragma('foreign_key_check');
    if (integrity !== 'ok' || foreignKeys.length) throw new Error('SQLite backup verification failed');
  } finally {
    restored.close();
  }
  return resolve(destinationPath);
}
