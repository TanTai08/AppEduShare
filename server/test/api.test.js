import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { io as clientIo } from 'socket.io-client';
import { once } from 'node:events';
import { openDb, one, all, atomic, DEFAULT_DATABASE_URL } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { createHttpServer } from '../src/realtime.js';
import { createClientMessageId } from '../../apps/mobile/lib/clientMessageId.ts';
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
  assert.equal((await one(db, 'SELECT count(*)::int n FROM schema_migrations')).n, 3);
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
  const body = { body: 'Hỏi trước khi mua', client_id: createClientMessageId() };
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
async function socketWithOrigin(account, origin, extraHeaders = {}) {
  const socket = clientIo(base, {
    auth: { token: account.token },
    transports: ['websocket'],
    reconnection: false,
    timeout: 1500,
    autoConnect: false,
    extraHeaders: { Origin: origin, ...extraHeaders },
  });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', (error) => {
      socket.disconnect();
      reject(error);
    });
    socket.connect();
  });
  return socket;
}
test('Android default API Origin connects and receives private realtime messages', async () => {
  const seller = await account(),
    buyer = await account(),
    book = await listing(seller),
    c = await conversation(buyer, book);
  const receiver = await socketWithOrigin(seller, base);
  try {
    const incoming = once(receiver, 'message:new');
    const sent = await call(
      `/conversations/${c.id}/messages`,
      'POST',
      { body: 'Native Android origin test', client_id: randomUUID() },
      buyer.token,
    );
    assert.equal(sent.status, 201);
    const [message] = await incoming;
    assert.equal(message.body, 'Native Android origin test');
  } finally {
    receiver.disconnect();
  }
});
test('WebSocket still rejects unrelated Origin, wrong port and untrusted forwarded host', async () => {
  const a = await account();
  for (const origin of ['https://untrusted.example', 'http://127.0.0.1:1', 'null'])
    await assert.rejects(socketWithOrigin(a, origin, { 'X-Forwarded-Host': 'untrusted.example' }));
});
test('Same API Origin does not bypass session authentication', async () => {
  await assert.rejects(socketWithOrigin({ token: 'invalid' }, base), /Vui lòng đăng nhập lại/);
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

const photoListingBody = {
  title: 'Tài liệu có ảnh chụp',
  description: 'Sách gốc chụp rõ tình trạng và nội dung.',
  subject: 'CNTT',
  school: 'VKU',
  area: 'Đà Nẵng',
  kind: 'sell',
  price: 45000,
  condition: 'Như mới',
  pickup_label: 'Thư viện trường',
};
async function uploadPhoto(user, base64) {
  const image =
    base64 ||
    (await sharp({ create: { width: 72, height: 48, channels: 3, background: '#397D66' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
      .then((b) => b.toString('base64')));
  return call('/uploads/images', 'POST', { base64: image }, user.token);
}
test('Photo uploads validate auth, actual bytes, size and reject SVG/corrupted files', async () => {
  const a = await account();
  assert.equal((await call('/uploads/images', 'POST', { base64: 'AAAA' })).status, 401);
  for (const base64 of [
    'not base64!',
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString(
      'base64',
    ),
    Buffer.from([255, 216, 255, 0, 1, 2, 3]).toString('base64'),
  ])
    assert.equal((await uploadPhoto(a, base64)).status, 400);
  assert.equal(
    (await uploadPhoto(a, Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64'))).status,
    413,
  );
});
test('Photos preview privately, bind in order, serve safe JPEG/thumbnail and strip EXIF', async () => {
  const a = await account(),
    b = await account(),
    r1 = await uploadPhoto(a),
    r2 = await uploadPhoto(a);
  assert.equal(r1.status, 201, JSON.stringify(r1.data));
  assert.equal(r2.status, 201);
  const p1 = r1.data,
    p2 = r2.data;
  assert.equal((await fetch(base + p1.url)).status, 404);
  assert.equal(
    (await fetch(base + p1.url, { headers: { Authorization: 'Bearer ' + b.token } })).status,
    404,
  );
  assert.equal(
    (await fetch(base + p1.url, { headers: { Authorization: 'Bearer ' + a.token } })).status,
    200,
  );
  const created = await call(
    '/listings',
    'POST',
    { ...photoListingBody, image_ids: [p2.id, p1.id] },
    a.token,
  );
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.deepEqual(
    created.data.images.map((i) => i.id),
    [p2.id, p1.id],
  );
  assert.equal(
    (await call('/listings?q=' + encodeURIComponent(photoListingBody.title))).data.items.find(
      (l) => l.id === created.data.id,
    ).images[0].id,
    p2.id,
  );
  const full = await fetch(base + p1.url);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'image/jpeg');
  assert.equal(full.headers.get('cross-origin-resource-policy'), 'cross-origin');
  const metadata = await sharp(Buffer.from(await full.arrayBuffer())).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
  assert.ok(metadata.width <= 1600 && metadata.height <= 1600);
  const thumbnail = await fetch(base + p1.url + '?size=thumb');
  assert.equal(thumbnail.status, 200);
  const thumb = await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata();
  assert.ok(thumb.width <= 480 && thumb.height <= 480);
  assert.equal(
    (await call(`/uploads/images/${p1.id}`, 'DELETE', undefined, a.token)).data.deleted,
    false,
  );
});
test('Photo ownership, cross-listing reuse and partial failure roll back the listing', async () => {
  const a = await account(),
    b = await account(),
    image = (await uploadPhoto(a)).data;
  const before = (await one(db, 'SELECT count(*)::int n FROM listings')).n;
  assert.equal(
    (await call('/listings', 'POST', { ...photoListingBody, image_ids: [image.id] }, b.token))
      .status,
    403,
  );
  assert.equal((await one(db, 'SELECT count(*)::int n FROM listings')).n, before);
  assert.equal(
    (await call(`/uploads/images/${image.id}`, 'DELETE', undefined, b.token)).status,
    403,
  );
  const book = (
    await call('/listings', 'POST', { ...photoListingBody, image_ids: [image.id] }, a.token)
  ).data;
  assert.equal(
    (await call('/listings', 'POST', { ...photoListingBody, image_ids: [image.id] }, a.token))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        `/listings/${book.id}`,
        'PATCH',
        { ...photoListingBody, image_ids: [randomUUID()] },
        a.token,
      )
    ).status,
    400,
  );
  assert.equal((await call(`/listings/${book.id}`)).data.images[0].id, image.id);
});
test('Photo edit: reorder/cover, legacy text edits preserve, explicit empty removes; limit five', async () => {
  const a = await account(),
    p1 = (await uploadPhoto(a)).data,
    p2 = (await uploadPhoto(a)).data;
  assert.equal(
    (
      await call(
        '/listings',
        'POST',
        { ...photoListingBody, image_ids: Array.from({ length: 6 }, () => randomUUID()) },
        a.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (await call('/listings', 'POST', { ...photoListingBody, image_ids: [p1.id, p1.id] }, a.token))
      .status,
    400,
  );
  const book = (
    await call('/listings', 'POST', { ...photoListingBody, image_ids: [p1.id, p2.id] }, a.token)
  ).data;
  let result = await call(
    `/listings/${book.id}`,
    'PATCH',
    { ...photoListingBody, image_ids: [p2.id, p1.id] },
    a.token,
  );
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.data.images.map((i) => i.id),
    [p2.id, p1.id],
  );
  result = await call(
    `/listings/${book.id}`,
    'PATCH',
    { ...photoListingBody, title: 'Sửa tên không đổi ảnh' },
    a.token,
  );
  assert.equal(result.data.images.length, 2);
  result = await call(
    `/listings/${book.id}`,
    'PATCH',
    { ...photoListingBody, image_ids: [] },
    a.token,
  );
  assert.equal(result.data.images.length, 0);
  assert.equal((await fetch(base + p1.url)).status, 404);
});
test('Pending photo deletion and cleanup never remove attached listing photos', async () => {
  const a = await account(),
    pending = (await uploadPhoto(a)).data,
    used = (await uploadPhoto(a)).data;
  await call('/listings', 'POST', { ...photoListingBody, image_ids: [used.id] }, a.token);
  await db.query(
    "UPDATE listing_images SET created_at=now()-interval '2 days' WHERE id=ANY($1::uuid[])",
    [[pending.id, used.id]],
  );
  const fresh = (await uploadPhoto(a)).data;
  assert.equal(
    (await one(db, 'SELECT count(*)::int n FROM listing_images WHERE id=$1', [pending.id])).n,
    0,
  );
  assert.equal((await fetch(base + used.url)).status, 200);
  assert.equal(
    (await call(`/uploads/images/${fresh.id}`, 'DELETE', undefined, a.token)).data.deleted,
    true,
  );
  assert.equal((await fetch(base + fresh.url)).status, 404);
});

const classifierInput = {
  title: 'Giáo trình Java và lập trình hướng đối tượng',
  description: 'Class, kế thừa, interface và bài tập viết chương trình Java.',
};
const listingBody = (input = classifierInput) => ({
  ...input,
  subject: 'Lập trình',
  school: 'VKU',
  area: 'Đà Nẵng',
  kind: 'sell',
  price: 40000,
  condition: 'Như mới',
  pickup_label: 'Thư viện',
});

test('AI classification requires login, validates input and reports honest model provenance', async () => {
  const info = await call('/ai/categories');
  assert.equal(info.status, 200);
  assert.equal(info.data.ready, true);
  assert.equal(info.data.categories.length, 8);
  assert.equal(info.data.dataset_source, 'authored_synthetic_demo');
  assert.equal((await call('/ai/classify', 'POST', classifierInput)).status, 401);
  const a = await account();
  for (const body of [
    { title: 'abc' },
    { ...classifierInput, category: 'luat' },
    { ...classifierInput, title: 'x'.repeat(151) },
    { ...classifierInput, description: 'x'.repeat(3001) },
  ])
    assert.equal((await call('/ai/classify', 'POST', body, a.token)).status, 400);
  const prediction = await call('/ai/classify', 'POST', classifierInput, a.token);
  assert.equal(prediction.status, 200);
  assert.equal(prediction.data.predicted_category, 'cntt');
  assert.equal(prediction.data.abstained, false);
  assert.equal(prediction.data.suggestions.length, 3);
  const row = await one(db, 'SELECT * FROM ai_classifications WHERE id=$1', [
    prediction.data.classification_id,
  ]);
  assert.equal(row.user_id, a.user.id);
  assert.equal(row.listing_id, null);
  assert.equal(row.input_hash.length, 64);
  assert.equal(row.title, undefined); // Request log stores hash, not unpublished input text.
});

test('AI suggestion can be confirmed or corrected, and feedback commits with the listing', async () => {
  const a = await account();
  const suggestion = await call('/ai/classify', 'POST', classifierInput, a.token);
  const saved = await call(
    '/listings',
    'POST',
    {
      ...listingBody(),
      category: 'kinh_te',
      classification_id: suggestion.data.classification_id,
    },
    a.token,
  );
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  assert.equal(saved.data.category, 'kinh_te'); // Human decides; model never overwrites chosen category.
  const feedback = await one(db, 'SELECT * FROM ai_classifications WHERE id=$1', [
    suggestion.data.classification_id,
  ]);
  assert.equal(feedback.predicted_category, 'cntt');
  assert.equal(feedback.confirmed_category, 'kinh_te');
  assert.equal(feedback.listing_id, saved.data.id);
  assert.equal((await call('/listings/' + saved.data.id)).data.category, 'kinh_te');
  assert.equal(
    (await call('/listings', 'POST', { ...listingBody(), category: 'imaginary' }, a.token)).status,
    400,
  );
  const again = await call(
    '/listings',
    'POST',
    {
      ...listingBody(),
      category: 'cntt',
      classification_id: suggestion.data.classification_id,
    },
    a.token,
  );
  assert.equal(again.status, 409);
  const count = await one(db, 'SELECT count(*)::int n FROM listings WHERE owner_id=$1', [
    a.user.id,
  ]);
  assert.equal(count.n, 1); // Failed provenance binding rolled back the insert.
});

test('AI feedback rejects another owner or changed input and rolls back listing edits', async () => {
  const a = await account(),
    b = await account();
  const suggestion = await call('/ai/classify', 'POST', classifierInput, a.token);
  assert.equal(
    (
      await call(
        '/listings',
        'POST',
        {
          ...listingBody(),
          category: 'cntt',
          classification_id: suggestion.data.classification_id,
        },
        b.token,
      )
    ).status,
    403,
  );
  const existing = await listing(a);
  const edited = await call(
    '/listings/' + existing.id,
    'PATCH',
    {
      ...listingBody({ ...classifierInput, title: 'Giáo trình Marketing căn bản' }),
      category: 'kinh_te',
      classification_id: suggestion.data.classification_id,
    },
    a.token,
  );
  assert.equal(edited.status, 409);
  const current = await call('/listings/' + existing.id);
  assert.equal(current.data.title, existing.title);
  assert.equal(current.data.category, '');
  assert.equal(
    (
      await one(db, 'SELECT listing_id FROM ai_classifications WHERE id=$1', [
        suggestion.data.classification_id,
      ])
    ).listing_id,
    null,
  );
});

test('Manual categories work without AI; legacy edits preserve the selected category', async () => {
  const a = await account();
  const saved = await call('/listings', 'POST', { ...listingBody(), category: 'cntt' }, a.token);
  assert.equal(saved.status, 201);
  assert.equal(
    (await call('/listings/' + saved.data.id, 'PATCH', listingBody(), a.token)).data.category,
    'cntt',
  );
  assert.equal(
    (await call('/listings/' + saved.data.id, 'PATCH', { ...listingBody(), category: '' }, a.token))
      .data.category,
    '',
  );
  const unknown = await call(
    '/ai/classify',
    'POST',
    { title: 'Sách còn mới', description: 'Mình bán lại, nhận tại trường' },
    a.token,
  );
  assert.equal(unknown.data.abstained, true);
  assert.equal(unknown.data.predicted_category, null);
  const manual = await call(
    '/listings',
    'POST',
    {
      ...listingBody({ title: 'Sách còn mới', description: 'Mình bán lại, nhận tại trường' }),
      category: 'xa_hoi',
      classification_id: unknown.data.classification_id,
    },
    a.token,
  );
  assert.equal(manual.status, 201);
  assert.equal(manual.data.category, 'xa_hoi');
});
