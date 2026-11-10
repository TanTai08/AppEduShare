import pg from 'pg';
const { Pool } = pg;
export const DEFAULT_DATABASE_URL = 'postgresql://edushare:edushare_dev@localhost:5432/edushare';
export function openDb(
  connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  options = {},
) {
  return new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, ...options });
}
export const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
export const all = async (db, sql, args = []) => (await db.query(sql, args)).rows;
export async function atomic(pool, fn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const result = await fn(db);
      await db.query('COMMIT');
      return result;
    } catch (e) {
      await db.query('ROLLBACK');
      if (!['40P01', '40001'].includes(e.code) || attempt === 2) throw e;
    } finally {
      db.release();
    }
  }
}
