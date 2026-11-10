import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
let db, server, base;
before(async () => {
  db = openDb(':memory:');
  server = createApp(db, { rateLimits: false }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  db.close();
});
async function call(path, method = 'GET', body, token) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
let sequence = 0;
async function account() {
  const r = await call('/auth/register', 'POST', {
    name: 'Sinh viên thử nghiệm',
    email: `student${++sequence}@example.com`,
    password: 'Testing123!',
    school: 'VKU',
    area: 'Đà Nẵng',
  });
  assert.equal(r.status, 201);
  return r.data;
}
async function listing(account, kind = 'sell') {
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
    },
    account.token,
  );
  assert.equal(r.status, 201);
  return r.data;
}
async function request(buyer, item, offered) {
  const r = await call(
    '/transactions',
    'POST',
    {
      listing_id: item.id,
      ...(offered ? { offered_listing_id: offered.id } : {}),
      note: 'Hẹn tại thư viện',
    },
    buyer.token,
  );
  assert.equal(r.status, 201);
  return r.data;
}
async function action(account, tx, action) {
  return call(`/transactions/${tx.id}/action`, 'POST', { action }, account.token);
}

test('Health and database available', async () => {
  const r = await call('/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.database, 1);
});
test('Register, case-insensitive duplicate, password hashing, login, logout revokes session', async () => {
  const a = await account();
  assert.equal(a.user.password_hash, undefined);
  assert.equal(
    db
      .prepare('SELECT password_hash FROM users WHERE id=?')
      .get(a.user.id)
      .password_hash.includes('Testing123!'),
    false,
  );
  const duplicate = await call('/auth/register', 'POST', {
    name: 'Test',
    email: a.user.email.toUpperCase(),
    password: 'Testing123!',
    school: 'VKU',
    area: 'Đà Nẵng',
  });
  assert.equal(duplicate.status, 409);
  assert.equal(
    (await call('/auth/login', 'POST', { email: a.user.email, password: 'wrong' })).status,
    401,
  );
  assert.equal(
    (await call('/auth/login', 'POST', { email: a.user.email, password: 'Testing123!' })).status,
    200,
  );
  assert.equal((await call('/auth/logout', 'POST', {}, a.token)).status, 200);
  assert.equal((await call('/me', 'GET', undefined, a.token)).status, 401);
});
test('Invalid payloads and role escalation rejected', async () => {
  assert.equal(
    (await call('/auth/register', 'POST', { name: 'A', email: 'invalid', password: 'x' })).status,
    400,
  );
  const a = await account();
  assert.equal(
    (
      await call(
        '/me',
        'PATCH',
        { name: 'Test', school: 'VKU', area: 'Huế', role: 'admin' },
        a.token,
      )
    ).status,
    400,
  );
  assert.equal((await call('/admin', 'GET', undefined, a.token)).status, 403);
  assert.equal((await call('/listings', 'POST', {})).status, 401);
  assert.equal((await call('/listings?limit=-1')).status, 400);
});
test('Search treats wildcard and SQL fragments as literal input', async () => {
  for (const q of ['%', '_', '!', "' OR 1=1 --"]) {
    const r = await call('/listings?q=' + encodeURIComponent(q));
    assert.equal(r.status, 200);
    assert.equal(r.data.items.length, 0);
  }
});
test('Ownership, profile update, filters, edit, hide and favorites', async () => {
  const a = await account(),
    b = await account(),
    l = await listing(a);
  assert.equal((await call(`/listings/${l.id}/visibility`, 'POST', {}, b.token)).status, 403);
  const edit = {
    title: 'Sách SQL thực hành',
    description: 'Sách thực hành SQL còn mới, đủ trang.',
    subject: 'SQL',
    school: 'VKU',
    area: 'Huế',
    kind: 'sell',
    price: 60000,
    condition: 'Mới',
  };
  assert.equal((await call(`/listings/${l.id}`, 'PATCH', edit, a.token)).status, 200);
  assert.equal(
    (await call('/listings?q=SQL&area=Huế&school=VKU&kind=sell')).data.items.some(
      (x) => x.id === l.id,
    ),
    true,
  );
  assert.equal((await call(`/favorites/${l.id}`, 'POST', {}, b.token)).data.saved, true);
  assert.equal((await call('/favorites', 'GET', undefined, b.token)).data.length, 1);
  assert.equal((await call(`/listings/${l.id}/visibility`, 'POST', {}, a.token)).status, 200);
  assert.equal((await call(`/listings/${l.id}`)).status, 404);
  assert.equal((await call('/favorites', 'GET', undefined, b.token)).data.length, 0);
  assert.equal(
    (await call('/me', 'PATCH', { name: 'Tên mới', school: 'VKU', area: 'Huế' }, a.token)).data
      .name,
    'Tên mới',
  );
});
test('Purchase: self-purchase, duplicate requests, access control, two-sided completion and review', async () => {
  const seller = await account(),
    buyer = await account(),
    outsider = await account(),
    l = await listing(seller);
  assert.equal(
    (await call('/transactions', 'POST', { listing_id: l.id }, seller.token)).status,
    400,
  );
  const tx = await request(buyer, l);
  assert.equal(
    (await call('/transactions', 'POST', { listing_id: l.id }, buyer.token)).status,
    409,
  );
  assert.equal((await action(buyer, tx, 'accept')).status, 403);
  assert.equal(
    (await call(`/transactions/${tx.id}/messages`, 'GET', undefined, outsider.token)).status,
    403,
  );
  assert.equal(
    (await call(`/transactions/${tx.id}/messages`, 'POST', { body: 'Xin chào' }, buyer.token))
      .status,
    201,
  );
  assert.equal(
    (await call(`/transactions/${tx.id}/messages`, 'GET', undefined, seller.token)).data[0].body,
    'Xin chào',
  );
  assert.equal(
    (await call(`/transactions/${tx.id}/reviews`, 'POST', { rating: 5, comment: '' }, buyer.token))
      .status,
    409,
  );
  assert.equal((await action(seller, tx, 'accept')).status, 200);
  assert.equal((await action(buyer, tx, 'confirm')).status, 200);
  assert.equal(
    db.prepare('SELECT status FROM transactions WHERE id=?').get(tx.id).status,
    'accepted',
  );
  assert.equal((await action(buyer, tx, 'confirm')).status, 409);
  assert.equal((await action(seller, tx, 'confirm')).status, 200);
  assert.equal(db.prepare('SELECT status FROM listings WHERE id=?').get(l.id).status, 'completed');
  assert.equal((await action(buyer, tx, 'cancel')).status, 409);
  assert.equal(
    (
      await call(
        `/transactions/${tx.id}/reviews`,
        'POST',
        { rating: 5, comment: 'Rất tốt' },
        buyer.token,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call(`/transactions/${tx.id}/reviews`, 'POST', { rating: 5, comment: '' }, buyer.token))
      .status,
    409,
  );
  assert.equal(
    (await call(`/transactions/${tx.id}/messages`, 'POST', { body: 'Sau khi đóng' }, buyer.token))
      .status,
    409,
  );
  assert.equal((await call(`/listings/${l.id}`)).data.owner_rating, 5);
});
test('Competing accepts reserve once and notify losing buyer', async () => {
  const s = await account(),
    a = await account(),
    b = await account(),
    l = await listing(s),
    t1 = await request(a, l),
    t2 = await request(b, l);
  const result = await Promise.all([action(s, t1, 'accept'), action(s, t2, 'accept')]);
  assert.deepEqual(result.map((x) => x.status).sort(), [200, 409]);
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM transactions WHERE listing_id=? AND status='accepted'")
      .get(l.id).n,
    1,
  );
  assert.equal((await call('/notifications', 'GET', undefined, b.token)).data.length > 0, true);
});
test('Exchange validates ownership and reserves/releases both listings', async () => {
  const a = await account(),
    b = await account(),
    c = await account(),
    la = await listing(a, 'exchange'),
    lb = await listing(b, 'exchange'),
    lc = await listing(c, 'exchange');
  assert.equal((await call('/transactions', 'POST', { listing_id: la.id }, b.token)).status, 400);
  assert.equal(
    (await call('/transactions', 'POST', { listing_id: la.id, offered_listing_id: lc.id }, b.token))
      .status,
    400,
  );
  const tx = await request(b, la, lb);
  assert.equal((await action(a, tx, 'accept')).status, 200);
  for (const l of [la, lb])
    assert.equal(db.prepare('SELECT status FROM listings WHERE id=?').get(l.id).status, 'reserved');
  assert.equal((await action(b, tx, 'cancel')).status, 200);
  for (const l of [la, lb])
    assert.equal(db.prepare('SELECT status FROM listings WHERE id=?').get(l.id).status, 'active');
});
test('Exchange acceptance cancels overlapping reverse-side requests', async () => {
  const a = await account(),
    b = await account(),
    c = await account(),
    la = await listing(a, 'exchange'),
    lb = await listing(b, 'exchange'),
    lc = await listing(c, 'exchange');
  const t1 = await request(b, la, lb),
    t2 = await request(c, lb, lc);
  await action(a, t1, 'accept');
  assert.equal(
    db.prepare('SELECT status FROM transactions WHERE id=?').get(t2.id).status,
    'cancelled',
  );
});
test('Admin moderation cancels reserved transaction, releases other book, locks visibility and resolves reports', async () => {
  const admin = await account(),
    a = await account(),
    b = await account();
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.user.id);
  const la = await listing(a, 'exchange'),
    lb = await listing(b, 'exchange'),
    tx = await request(b, la, lb);
  await action(a, tx, 'accept');
  assert.equal(
    (
      await call(
        '/reports',
        'POST',
        { listing_id: la.id, reason: 'Nội dung không phù hợp' },
        b.token,
      )
    ).status,
    201,
  );
  const panel = await call('/admin', 'GET', undefined, admin.token);
  assert.equal(panel.status, 200);
  const report = panel.data.reports.find((r) => r.listing_id === la.id);
  assert.equal((await call(`/admin/listings/${la.id}/hide`, 'POST', {}, admin.token)).status, 200);
  assert.equal(
    db.prepare('SELECT status FROM transactions WHERE id=?').get(tx.id).status,
    'cancelled',
  );
  assert.equal(db.prepare('SELECT status FROM listings WHERE id=?').get(lb.id).status, 'active');
  assert.equal((await call(`/listings/${la.id}/visibility`, 'POST', {}, a.token)).status, 403);
  assert.equal(
    (await call(`/admin/reports/${report.id}/resolve`, 'POST', {}, admin.token)).status,
    200,
  );
  assert.equal(
    db.prepare('SELECT status FROM reports WHERE id=?').get(report.id).status,
    'resolved',
  );
});
test('Notifications can only be marked read for current user and expired sessions fail', async () => {
  const a = await account(),
    b = await account(),
    l = await listing(a);
  await request(b, l);
  assert.equal((await call('/notifications/read', 'POST', {}, b.token)).status, 200);
  assert.equal(
    (await call('/notifications', 'GET', undefined, a.token)).data.some((n) => !n.read_at),
    true,
  );
  db.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').run(b.user.id);
  assert.equal((await call('/me', 'GET', undefined, b.token)).status, 401);
});
