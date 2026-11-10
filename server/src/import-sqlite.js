import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { openDb, one, atomic } from './db.js';
import { migrate } from './migrate.js';
export async function importSqlite(source, pool) {
  if (!existsSync(source)) throw new Error('Không tìm thấy file SQLite nguồn.');
  const sqlite = new DatabaseSync(source, { readOnly: true });
  try {
    await migrate(pool);
    return await atomic(pool, async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(208811,2)');
      await db.query('LOCK TABLE users IN EXCLUSIVE MODE');
      if ((await one(db, 'SELECT count(*)::int n FROM users')).n > 0)
        throw new Error(
          'PostgreSQL đã có người dùng. Chỉ import vào database rỗng; không ghi đè hoặc gộp tự động.',
        );
      const insert = async (table, values) => {
        const keys = Object.keys(values);
        await db.query(
          `INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_, i) => '$' + (i + 1)).join(',')})`,
          Object.values(values),
        );
      };
      const read = (table) => sqlite.prepare(`SELECT * FROM ${table}`).all();
      const counts = {};
      for (const u of read('users')) await insert('users', { ...u, bio: '', points: 0 });
      counts.users = read('users').length;
      for (const s of read('sessions')) await insert('sessions', s);
      for (const l of read('listings'))
        await insert('listings', {
          ...l,
          moderated: !!l.moderated,
          point_cost: l.kind === 'free' ? 20 : 0,
          pickup_label: '',
          latitude: null,
          longitude: null,
        });
      counts.listings = read('listings').length;
      for (const f of read('favorites')) await insert('favorites', f);
      const conversationMap = new Map();
      for (const t of read('transactions')) {
        const c = await one(
          db,
          `INSERT INTO conversations(id,listing_id,buyer_id,seller_id,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(listing_id,buyer_id) DO UPDATE SET listing_id=EXCLUDED.listing_id RETURNING id`,
          [randomUUID(), t.listing_id, t.buyer_id, t.seller_id, t.created_at],
        );
        conversationMap.set(t.id, c.id);
        const l = await one(db, 'SELECT kind,price,point_cost FROM listings WHERE id=$1', [
          t.listing_id,
        ]);
        await insert('transactions', {
          ...t,
          buyer_confirmed: !!t.buyer_confirmed,
          seller_confirmed: !!t.seller_confirmed,
          conversation_id: c.id,
          kind: l.kind,
          price: l.price,
          point_cost: l.point_cost,
          points_spent: 0,
          completed_at: t.status === 'completed' ? t.created_at : null,
        });
      }
      counts.transactions = read('transactions').length;
      const messages = sqlite.prepare('SELECT * FROM messages ORDER BY created_at,rowid').all();
      for (const m of messages) {
        const { transaction_id, ...rest } = m;
        await insert('messages', {
          ...rest,
          conversation_id: conversationMap.get(transaction_id),
          client_id: m.id,
        });
      }
      counts.messages = messages.length;
      for (const table of ['reviews', 'reports', 'notifications']) {
        const rows = read(table);
        for (const row of rows) await insert(table, row);
        counts[table] = rows.length;
      }
      return counts;
    });
  } finally {
    sqlite.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = resolve(process.argv[2] || './data/edushare.sqlite'),
    db = openDb();
  try {
    console.log('Import thành công (SQLite nguồn giữ nguyên):', await importSqlite(source, db));
  } catch (e) {
    console.error('Import thất bại, đã rollback:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
