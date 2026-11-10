import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openDb, atomic } from './db.js';
export async function migrate(pool) {
  await atomic(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(208811,1)');
    await db.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    if (!(await db.query('SELECT 1 FROM schema_migrations WHERE version=1')).rowCount) {
      await db.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
      await db.query('INSERT INTO schema_migrations(version) VALUES(1)');
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  try {
    await migrate(db);
    console.log('PostgreSQL migration v1 hoàn tất.');
  } finally {
    await db.end();
  }
}
