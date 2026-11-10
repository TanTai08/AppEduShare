import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io as clientIo } from 'socket.io-client';
import { once } from 'node:events';
import { openDb, one, all, atomic, DEFAULT_DATABASE_URL } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { createHttpServer } from '../src/realtime.js';
let db, adminPool, http, io, base;
const schema = 'test_' + randomUUID().replaceAll('-', '');
before(async () => {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  adminPool = openDb(url);
  await adminPool.query(`CREATE SCHEMA ${schema}`);
  db = openDb(url, { options: `-c search_path=${schema}` });
  await migrate(db);
  await migrate(db);
  ({ server: http, io } = createHttpServer(db, { rateLimits: false }));
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  base = `http://127.0.0.1:${http.address().port}`;
});
after(async () => {
  if (io) await new Promise((r) => io.close(r));
  if (db) await db.end();
  if (adminPool) {
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminPool.end();
  }
});
async function call(path, method = 'GET', body, token) {
  const r = await fetch(base + '/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
let sequence = 0;
async function account() {
  const r = await call('/auth/register', 'POST', {
    name: 'Sinh viên ' + ++sequence,
    email: `student${sequence}@example.com`,
    password: 'Testing123!',
    school: 'VKU',
    area: 'Đà Nẵng',
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
async function listing(a, kind = 'sell') {
  const r = await call(
    '/listings',
    'POST',
    {
      title: 'Giáo trình Cơ sở dữ liệu',
      description: 'Sách gốc còn tốt, giao tại thư viện.',
      subject: 'CNTT',
      school: 'VKU',
      area: 'Đà Nẵng',
      kind,
      price: kind === 'sell' ? 50000 : 0,
      condition: 'Như mới',
      pickup_label: 'Thư viện',
      latitude: 16.06,
      longitude: 108.21,
    },
    a.token,
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
async function request(b, l, o) {
  const r = await call(
    '/transactions',
    'POST',
    { listing_id: l.id, ...(o ? { offered_listing_id: o.id } : {}) },
    b.token,
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
const action = (a, t, action) => call(`/transactions/${t.id}/action`, 'POST', { action }, a.token);
async function completed(s, b, l) {
  const t = await request(b, l);
  assert.equal((await action(s, t, 'accept')).status, 200);
  assert.equal((await action(b, t, 'confirm')).status, 200);
  assert.equal((await action(s, t, 'confirm')).status, 200);
  return t;
}
async function demoCredit(a, amount = 20) {
  await atomic(db, async (c) => {
    await c.query('UPDATE users SET points=$1 WHERE id=$2', [amount, a.user.id]);
    await c.query(
      "INSERT INTO point_ledger(id,user_id,reason,delta,balance_after,note) VALUES($1,$2,'demo',$3,$3,'Test fixture')",
      [randomUUID(), a.user.id, amount],
    );
  });
}
async function connect(a) {
  const s = clientIo(base, {
    auth: { token: a.token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  await once(s, 'connect');
  return s;
}
async function conversation(b, l) {
  const r = await call('/conversations', 'POST', { listing_id: l.id }, b.token);
  assert.equal(r.status, 201);
  return r.data;
}

test('PostgreSQL health, idempotent migration and initial zero wallet', async () => {
  assert.equal((await call('/health')).data.engine, 'postgresql');
  const a = await account();
  assert.equal(a.user.points, 0);
  assert.equal((await call('/wallet', 'GET', undefined, a.token)).data.balance, 0);
  assert.equal((await one(db, 'SELECT count(*)::int n FROM schema_migrations')).n, 1);
});
test('Auth: duplicate email, password hashing, revocation and private role', async () => {
  const a = await account();
  assert.equal(a.user.password_hash, undefined);
  assert.notEqual(
    (await one(db, 'SELECT password_hash FROM users WHERE id=$1', [a.user.id])).password_hash,
    'Testing123!',
  );
  assert.equal(
    (
      await call('/auth/register', 'POST', {
        name: 'Test',
        email: a.user.email.toUpperCase(),
        password: 'Testing123!',
        school: 'VKU',
        area: 'Huế',
      })
    ).status,
    409,
  );
  assert.equal(
    (await call('/auth/login', 'POST', { email: a.user.email, password: 'wrong' })).status,
    401,
  );
  assert.equal(
    (await call('/auth/login', 'POST', { email: a.user.email, password: 'Testing123!' })).status,
    200,
  );
  assert.equal(
    (await call('/me', 'PATCH', { name: 'Test', school: 'VKU', area: 'Huế', points: 999 }, a.token))
      .status,
    400,
  );
  assert.equal((await call('/admin', 'GET', undefined, a.token)).status, 403);
  await call('/auth/logout', 'POST', {}, a.token);
  assert.equal((await call('/me', 'GET', undefined, a.token)).status, 401);
});
test('Listing ownership, coordinates validation, search escaping, favorites and moderation flags', async () => {
  const a = await account(),
    b = await account(),
    l = await listing(a);
  assert.equal((await call(`/listings/${l.id}/visibility`, 'POST', {}, b.token)).status, 403);
  const body = {
    title: l.title,
    description: l.description,
    subject: l.subject,
    school: l.school,
    area: l.area,
    kind: l.kind,
    price: l.price,
    condition: l.condition,
    latitude: 91,
    longitude: 108,
  };
  assert.equal((await call('/listings', 'POST', body, a.token)).status, 400);
  assert.equal((await call('/listings?q=SQL')).status, 200);
  for (const q of ['%', '_', '!', "' OR 1=1 --"]) {
    const r = await call('/listings?q=' + encodeURIComponent(q));
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 0);
  }
  await call(`/favorites/${l.id}`, 'POST', {}, b.token);
  assert.equal((await call('/favorites', 'GET', undefined, b.token)).data.length, 1);
  await call(`/listings/${l.id}/visibility`, 'POST', {}, a.token);
  assert.equal((await call(`/listings/${l.id}`)).status, 404);
});
test('Chat exists BEFORE purchasing; membership, idempotency and cursor history', async () => {
  const s = await account(),
    b = await account(),
    x = await account(),
    l = await listing(s),
    c = await conversation(b, l);
  assert.equal(
    (await one(db, 'SELECT count(*)::int n FROM transactions WHERE listing_id=$1', [l.id])).n,
    0,
  );
  assert.equal((await call('/conversations', 'POST', { listing_id: l.id }, s.token)).status, 400);
  assert.equal(
    (await call(`/conversations/${c.id}/messages`, 'GET', undefined, x.token)).status,
    403,
  );
  const body = { body: 'Hỏi trước khi mua', client_id: randomUUID() };
  assert.equal((await call(`/conversations/${c.id}/messages`, 'POST', body, b.token)).status, 201);
  assert.equal((await call(`/conversations/${c.id}/messages`, 'POST', body, b.token)).status, 201);
  assert.equal(
    (await one(db, 'SELECT count(*)::int n FROM messages WHERE conversation_id=$1', [c.id])).n,
    1,
  );
  await call(
    `/conversations/${c.id}/messages`,
    'POST',
    { body: 'Sách vẫn còn', client_id: randomUUID() },
    s.token,
  );
  const page = (await call(`/conversations/${c.id}/messages?limit=1`, 'GET', undefined, b.token))
    .data;
  assert.equal(page.has_more, true);
  const previous = (
    await call(
      `/conversations/${c.id}/messages?before=${page.items[0].seq}`,
      'GET',
      undefined,
      b.token,
    )
  ).data;
  assert.equal(previous.items[0].body, body.body);
  assert.equal((await call('/conversations', 'GET', undefined, s.token)).data[0].unread, 1);
  await call(`/conversations/${c.id}/read`, 'POST', {}, s.token);
  assert.equal((await call('/conversations', 'GET', undefined, s.token)).data[0].unread, 0);
});
test('Socket.IO: authenticated private delivery, unauthorized socket denied, logout disconnects', async () => {
  const s = await account(),
    b = await account(),
    x = await account(),
    l = await listing(s),
    c = await conversation(b, l);
  const receiver = await connect(s),
    outsider = await connect(x);
  let leaked = 0;
  outsider.on('message:new', () => leaked++);
  try {
    const event = once(receiver, 'message:new');
    await call(
      `/conversations/${c.id}/messages`,
      'POST',
      { body: 'Realtime riêng tư', client_id: randomUUID() },
      b.token,
    );
    const [m] = await event;
    assert.equal(m.body, 'Realtime riêng tư');
    assert.equal(leaked, 0);
    const disconnected = once(receiver, 'disconnect');
    await call('/auth/logout', 'POST', {}, s.token);
    await disconnected;
    const invalid = clientIo(base, {
      auth: { token: 'invalid' },
      transports: ['websocket'],
      reconnection: false,
    });
    await once(invalid, 'connect_error');
    invalid.disconnect();
  } finally {
    receiver.disconnect();
    outsider.disconnect();
  }
});
test('Purchase: self-buy, duplicate, two confirmations, immutable price and exactly-once points', async () => {
  const s = await account(),
    b = await account(),
    l = await listing(s);
  assert.equal((await call('/transactions', 'POST', { listing_id: l.id }, s.token)).status, 400);
  const t = await request(b, l);
  assert.equal((await call('/transactions', 'POST', { listing_id: l.id }, b.token)).status, 409);
  assert.equal((await action(b, t, 'accept')).status, 403);
  await db.query('UPDATE listings SET price=60000 WHERE id=$1', [l.id]);
  assert.equal((await action(s, t, 'accept')).status, 409);
  await db.query('UPDATE listings SET price=50000 WHERE id=$1', [l.id]);
  assert.equal((await action(s, t, 'accept')).status, 200);
  await action(b, t, 'confirm');
  assert.equal(
    (await one(db, 'SELECT status FROM transactions WHERE id=$1', [t.id])).status,
    'accepted',
  );
  assert.equal((await action(b, t, 'cancel')).status, 409);
  await action(s, t, 'confirm');
  assert.equal((await action(s, t, 'confirm')).status, 409);
  for (const a of [s, b]) {
    assert.equal((await call('/wallet', 'GET', undefined, a.token)).data.balance, 10);
    assert.equal(
      (
        await one(
          db,
          "SELECT count(*)::int n FROM point_ledger WHERE user_id=$1 AND reason='earn'",
          [a.user.id],
        )
      ).n,
      1,
    );
  }
  assert.equal(
    (await one(db, 'SELECT status FROM listings WHERE id=$1', [l.id])).status,
    'completed',
  );
});
test('Competing acceptance: one reservation across concurrent connections', async () => {
  const s = await account(),
    a = await account(),
    b = await account(),
    l = await listing(s),
    t1 = await request(a, l),
    t2 = await request(b, l);
  const results = await Promise.all([action(s, t1, 'accept'), action(s, t2, 'accept')]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (
      await one(
        db,
        "SELECT count(*)::int n FROM transactions WHERE listing_id=$1 AND status='accepted'",
        [l.id],
      )
    ).n,
    1,
  );
});
test('Free book: insufficient points rolls back; reservation debits 20; cancellation refunds once', async () => {
  const s = await account(),
    b = await account(),
    l = await listing(s, 'free'),
    t = await request(b, l);
  assert.equal((await action(s, t, 'accept')).status, 409);
  assert.equal((await one(db, 'SELECT status FROM listings WHERE id=$1', [l.id])).status, 'active');
  await demoCredit(b);
  assert.equal((await action(s, t, 'accept')).status, 200);
  assert.equal((await call('/wallet', 'GET', undefined, b.token)).data.balance, 0);
  assert.equal((await action(b, t, 'cancel')).status, 200);
  assert.equal((await action(b, t, 'cancel')).status, 409);
  const wallet = (await call('/wallet', 'GET', undefined, b.token)).data;
  assert.equal(wallet.balance, 20);
  assert.equal(wallet.history.filter((p) => p.reason === 'refund').length, 1);
});
test('Free book concurrent redemptions never overspend wallet; completed gift does not mint points', async () => {
  const s1 = await account(),
    s2 = await account(),
    b = await account();
  await demoCredit(b);
  const l1 = await listing(s1, 'free'),
    l2 = await listing(s2, 'free'),
    t1 = await request(b, l1),
    t2 = await request(b, l2);
  const r = await Promise.all([action(s1, t1, 'accept'), action(s2, t2, 'accept')]);
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
  const winner = r[0].status === 200 ? t1 : t2,
    seller = r[0].status === 200 ? s1 : s2;
  await action(b, winner, 'confirm');
  await action(seller, winner, 'confirm');
  assert.equal((await call('/wallet', 'GET', undefined, b.token)).data.balance, 0);
  assert.equal((await call('/wallet', 'GET', undefined, seller.token)).data.balance, 0);
});
test('Points anti-repeat pair cooldown and daily cap', async () => {
  const seller = await account(),
    buyer = await account();
  await completed(seller, buyer, await listing(seller));
  await completed(seller, buyer, await listing(seller));
  assert.equal((await call('/wallet', 'GET', undefined, seller.token)).data.balance, 10);
  for (let i = 0; i < 3; i++) {
    const b = await account();
    await completed(seller, b, await listing(seller));
  }
  assert.equal((await call('/wallet', 'GET', undefined, seller.token)).data.balance, 30);
});
test('Exchange reserves and releases both books, cancels overlaps, never earns points', async () => {
  const a = await account(),
    b = await account(),
    c = await account(),
    la = await listing(a, 'exchange'),
    lb = await listing(b, 'exchange'),
    lc = await listing(c, 'exchange');
  assert.equal(
    (await call('/transactions', 'POST', { listing_id: la.id, offered_listing_id: lc.id }, b.token))
      .status,
    400,
  );
  const t = await request(b, la, lb),
    other = await request(c, lb, lc);
  await db.query("UPDATE listings SET kind='sell',price=50000 WHERE id=$1", [lb.id]);
  assert.equal((await action(a, t, 'accept')).status, 409);
  await db.query("UPDATE listings SET kind='exchange',price=0 WHERE id=$1", [lb.id]);
  assert.equal((await action(a, t, 'accept')).status, 200);
  assert.equal(
    (await one(db, 'SELECT status FROM transactions WHERE id=$1', [other.id])).status,
    'cancelled',
  );
  for (const l of [la, lb])
    assert.equal(
      (await one(db, 'SELECT status FROM listings WHERE id=$1', [l.id])).status,
      'reserved',
    );
  await action(b, t, 'cancel');
  for (const l of [la, lb])
    assert.equal(
      (await one(db, 'SELECT status FROM listings WHERE id=$1', [l.id])).status,
      'active',
    );
  const t2 = await request(b, la, lb);
  await action(a, t2, 'accept');
  await action(a, t2, 'confirm');
  await action(b, t2, 'confirm');
  assert.equal((await call('/wallet', 'GET', undefined, a.token)).data.balance, 0);
});
test('Public reputation: only completed participants review once; private fields hidden', async () => {
  const s = await account(),
    b = await account(),
    x = await account(),
    l = await listing(s),
    t = await request(b, l);
  assert.equal(
    (await call(`/transactions/${t.id}/reviews`, 'POST', { rating: 5, comment: 'Tốt' }, b.token))
      .status,
    409,
  );
  await action(s, t, 'accept');
  await action(s, t, 'confirm');
  await action(b, t, 'confirm');
  assert.equal(
    (
      await call(
        `/transactions/${t.id}/reviews`,
        'POST',
        { rating: 5, comment: 'Đúng hẹn' },
        x.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `/transactions/${t.id}/reviews`,
        'POST',
        { rating: 5, comment: 'Đúng hẹn' },
        b.token,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call(`/transactions/${t.id}/reviews`, 'POST', { rating: 5, comment: 'Lặp' }, b.token))
      .status,
    409,
  );
  const p = (await call(`/users/${s.user.id}`)).data;
  assert.equal(p.rating, 5);
  assert.equal(p.review_count, 1);
  assert.equal(p.completed_count, 1);
  for (const k of ['email', 'password_hash', 'points']) assert.equal(p[k], undefined);
});
test('Admin hides a reserved free book, refunds points, locks visibility and audits action', async () => {
  const admin = await account(),
    s = await account(),
    b = await account();
  await db.query("UPDATE users SET role='admin' WHERE id=$1", [admin.user.id]);
  await demoCredit(b);
  const l = await listing(s, 'free'),
    t = await request(b, l);
  await action(s, t, 'accept');
  await call('/reports', 'POST', { listing_id: l.id, reason: 'Nội dung sai' }, b.token);
  assert.equal((await call(`/admin/listings/${l.id}/hide`, 'POST', {}, admin.token)).status, 200);
  assert.equal((await call('/wallet', 'GET', undefined, b.token)).data.balance, 20);
  assert.equal((await call(`/listings/${l.id}/visibility`, 'POST', {}, s.token)).status, 403);
  assert.equal(
    (await one(db, 'SELECT count(*)::int n FROM audit_logs WHERE target_id=$1', [l.id])).n,
    1,
  );
});
test('Support FAQ and private human tickets with admin reply and closure', async () => {
  assert.equal(
    (await call('/support/chat', 'POST', { message: 'Cách đổi điểm miễn phí?' })).data.mode,
    'faq',
  );
  const a = await account(),
    b = await account(),
    admin = await account();
  await db.query("UPDATE users SET role='admin' WHERE id=$1", [admin.user.id]);
  const t = (
    await call(
      '/support/tickets',
      'POST',
      { subject: 'Cần hỗ trợ giao dịch', body: 'Tôi cần kiểm tra giao dịch đang chờ' },
      a.token,
    )
  ).data;
  assert.equal(
    (await call(`/support/tickets/${t.id}/messages`, 'GET', undefined, b.token)).status,
    403,
  );
  assert.equal(
    (
      await call(
        `/support/tickets/${t.id}/messages`,
        'POST',
        { body: 'Chúng tôi đã nhận yêu cầu' },
        admin.token,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call(`/support/tickets/${t.id}/messages`, 'GET', undefined, a.token)).data.length,
    2,
  );
  assert.equal((await call(`/admin/support/${t.id}/resolve`, 'POST', {}, admin.token)).status, 200);
  assert.equal(
    (await call(`/support/tickets/${t.id}/messages`, 'POST', { body: 'test' }, a.token)).status,
    409,
  );
});
test('Wallet accounting invariant matches ledger sums for all users', async () => {
  const inconsistent = await all(
    db,
    'SELECT u.id FROM users u LEFT JOIN point_ledger p ON p.user_id=u.id GROUP BY u.id HAVING u.points<>coalesce(sum(p.delta),0)',
  );
  assert.equal(inconsistent.length, 0);
});
