import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDb, one, DEFAULT_DATABASE_URL } from '../src/db.js';
import { importSqlite } from '../src/import-sqlite.js';
test('SQLite migration preserves users, transactions, chat and source; refuses a second import', async () => {
  const root = mkdtempSync(join(tmpdir(), 'edushare-import-')),
    source = join(root, 'legacy.sqlite'),
    legacy = new DatabaseSync(source);
  legacy.exec(readFileSync(new URL('../migrations/legacy-sqlite.sql', import.meta.url), 'utf8'));
  const seller = randomUUID(),
    buyer = randomUUID(),
    book = randomUUID(),
    tx = randomUUID(),
    msg = randomUUID();
  for (const [id, name] of [
    [seller, 'Người bán'],
    [buyer, 'Người mua'],
  ])
    legacy
      .prepare('INSERT INTO users(id,name,email,password_hash,school,area) VALUES(?,?,?,?,?,?)')
      .run(id, name, id + '@test.local', 'preserved-hash', 'VKU', 'Đà Nẵng');
  legacy
    .prepare(
      "INSERT INTO listings(id,owner_id,title,description,subject,school,area,kind,price,condition,status) VALUES(?,?,?,?,?,?,?,'sell',50000,'Như mới','completed')",
    )
    .run(book, seller, 'Sách SQL', 'Sách nguồn còn tốt', 'CNTT', 'VKU', 'Đà Nẵng');
  legacy
    .prepare(
      "INSERT INTO transactions(id,listing_id,buyer_id,seller_id,status,buyer_confirmed,seller_confirmed) VALUES(?,?,?,?,'completed',1,1)",
    )
    .run(tx, book, buyer, seller);
  legacy
    .prepare('INSERT INTO messages(id,transaction_id,sender_id,body) VALUES(?,?,?,?)')
    .run(msg, tx, buyer, 'Hẹn giao tại trường');
  legacy.close();
  const schema = 'import_' + randomUUID().replaceAll('-', ''),
    url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const admin = openDb(url);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const db = openDb(url, { options: `-c search_path=${schema}` });
  try {
    const counts = await importSqlite(source, db);
    assert.equal(counts.users, 2);
    assert.equal(counts.transactions, 1);
    assert.equal(counts.messages, 1);
    const u = await one(db, 'SELECT * FROM users WHERE id=$1', [seller]);
    assert.equal(u.password_hash, 'preserved-hash');
    assert.equal(u.points, 0);
    assert.equal(
      (await one(db, 'SELECT status FROM transactions WHERE id=$1', [tx])).status,
      'completed',
    );
    assert.equal(
      (await one(db, 'SELECT body FROM messages WHERE id=$1', [msg])).body,
      'Hẹn giao tại trường',
    );
    await assert.rejects(importSqlite(source, db), /đã có người dùng/);
    assert.equal((await one(db, 'SELECT count(*)::int n FROM users')).n, 2);
    const check = new DatabaseSync(source, { readOnly: true });
    assert.equal(check.prepare('SELECT count(*) n FROM messages').get().n, 1);
    check.close();
  } finally {
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    rmSync(root, { recursive: true });
  }
});
