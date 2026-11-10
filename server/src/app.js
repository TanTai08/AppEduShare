import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { atomic } from './db.js';
import { hashPassword, verifyPassword, session, tokenHash } from './auth.js';

const text = (min = 1, max = 200) => z.string().trim().min(min).max(max);
const listingSchema = z
  .object({
    title: text(3, 150),
    description: text(10, 3000),
    subject: text(2, 100),
    school: text(2, 150),
    area: text(2, 100),
    kind: z.enum(['sell', 'exchange', 'free']),
    price: z.number().int().min(0).max(100000000),
    condition: z.enum(['Mới', 'Như mới', 'Đã sử dụng']),
  })
  .strict();
const publicUser = 'id,name,email,school,area,role,created_at';
const listingSelect = `SELECT l.*, u.name owner_name,
 (SELECT round(avg(rating),1) FROM reviews WHERE target_id=l.owner_id) owner_rating
 FROM listings l JOIN users u ON u.id=l.owner_id`;
function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}

export function createApp(db, { rateLimits = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  const origins = (
    process.env.CORS_ORIGINS || 'http://localhost:8081,http://localhost:19006'
  ).split(',');
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || origins.includes(origin)) }));
  app.use(express.json({ limit: '64kb' }));
  if (rateLimits)
    app.use(
      '/api',
      rateLimit({ windowMs: 60000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false }),
    );
  const loginLimit = rateLimits
    ? rateLimit({
        windowMs: 15 * 60000,
        limit: 30,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Thử lại sau 15 phút.' },
      })
    : (req, res, next) => next();
  const auth = (req, res, next) => {
    const raw = req.headers.authorization?.replace(/^Bearer /, '');
    const user =
      raw &&
      db
        .prepare(
          `SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`,
        )
        .get(tokenHash(raw), Date.now());
    if (!user) return res.status(401).json({ error: 'Vui lòng đăng nhập lại.' });
    req.user = user;
    req.token = raw;
    next();
  };
  const admin = (req, res, next) =>
    req.user.role === 'admin'
      ? next()
      : res.status(403).json({ error: 'Chỉ quản trị viên được truy cập.' });
  const getListing = (id) => db.prepare('SELECT * FROM listings WHERE id=?').get(id);
  const getTx = (req) => {
    const t = db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id);
    if (!t) fail(404, 'Không tìm thấy giao dịch.');
    if (![t.buyer_id, t.seller_id].includes(req.user.id))
      fail(403, 'Bạn không thuộc giao dịch này.');
    return t;
  };
  const notify = (user, body, tx = null) =>
    db
      .prepare('INSERT INTO notifications(id,user_id,body,transaction_id) VALUES (?,?,?,?)')
      .run(randomUUID(), user, body, tx);
  const ids = (t) => [t.listing_id, t.offered_listing_id].filter(Boolean);
  const unlock = (t) =>
    ids(t).forEach((id) =>
      db.prepare("UPDATE listings SET status='active' WHERE id=? AND status='reserved'").run(id),
    );
  app.get('/api/health', (req, res) =>
    res.json({ ok: true, database: db.prepare('SELECT 1 AS ok').get().ok }),
  );
  app.post('/api/auth/register', loginLimit, async (req, res) => {
    const b = z
      .object({
        name: text(2, 80),
        email: z
          .email()
          .max(150)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(8).max(128),
        school: text(2, 150),
        area: text(2, 100),
      })
      .strict()
      .parse(req.body);
    if (db.prepare('SELECT id FROM users WHERE email=?').get(b.email))
      fail(409, 'Email đã được sử dụng.');
    const hash = await hashPassword(b.password);
    // Recheck after asynchronous scrypt to handle concurrent registration.
    if (db.prepare('SELECT id FROM users WHERE email=?').get(b.email))
      fail(409, 'Email đã được sử dụng.');
    const id = randomUUID();
    db.prepare(
      'INSERT INTO users(id,name,email,password_hash,school,area) VALUES (?,?,?,?,?,?)',
    ).run(id, b.name, b.email, hash, b.school, b.area);
    res.status(201).json(session(db, db.prepare('SELECT * FROM users WHERE id=?').get(id)));
  });
  app.post('/api/auth/login', loginLimit, async (req, res) => {
    const b = z
      .object({
        email: z.email().transform((v) => v.toLowerCase()),
        password: z.string().min(1).max(128),
      })
      .parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(b.email);
    if (!user || !(await verifyPassword(b.password, user.password_hash)))
      fail(401, 'Email hoặc mật khẩu không đúng.');
    res.json(session(db, user));
  });
  app.post('/api/auth/logout', auth, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(req.token));
    res.json({ ok: true });
  });
  app.get('/api/me', auth, (req, res) =>
    res.json(db.prepare(`SELECT ${publicUser} FROM users WHERE id=?`).get(req.user.id)),
  );
  app.patch('/api/me', auth, (req, res) => {
    const b = z
      .object({ name: text(2, 80), school: text(2, 150), area: text(2, 100) })
      .strict()
      .parse(req.body);
    db.prepare('UPDATE users SET name=?,school=?,area=? WHERE id=?').run(
      b.name,
      b.school,
      b.area,
      req.user.id,
    );
    res.json(db.prepare(`SELECT ${publicUser} FROM users WHERE id=?`).get(req.user.id));
  });
  app.get('/api/listings', (req, res) => {
    const q = z
      .object({
        q: z.string().max(150).default(''),
        area: z.string().max(100).default(''),
        school: z.string().max(150).default(''),
        kind: z.enum(['sell', 'exchange', 'free']).optional(),
        sort: z.enum(['new', 'price']).default('new'),
        limit: z.coerce.number().int().min(1).max(100).default(60),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const where = ["l.status='active'"],
      args = [];
    const like = (v) => `%${v.replace(/[!%_]/g, '!$&')}%`;
    if (q.q) {
      where.push("(l.title LIKE ? ESCAPE '!' OR l.subject LIKE ? ESCAPE '!')");
      args.push(like(q.q), like(q.q));
    }
    if (q.area) {
      where.push("l.area LIKE ? ESCAPE '!'");
      args.push(like(q.area));
    }
    if (q.school) {
      where.push("l.school LIKE ? ESCAPE '!'");
      args.push(like(q.school));
    }
    if (q.kind) {
      where.push('l.kind=?');
      args.push(q.kind);
    }
    const clause = where.join(' AND ');
    res.json({
      items: db
        .prepare(
          `${listingSelect} WHERE ${clause} ORDER BY ${q.sort === 'price' ? 'l.price ASC,' : ''} l.created_at DESC,l.id LIMIT ? OFFSET ?`,
        )
        .all(...args, q.limit, q.offset),
      total: db.prepare(`SELECT count(*) total FROM listings l WHERE ${clause}`).get(...args).total,
    });
  });
  app.get('/api/my/listings', auth, (req, res) =>
    res.json(
      db.prepare(`${listingSelect} WHERE l.owner_id=? ORDER BY l.created_at DESC`).all(req.user.id),
    ),
  );
  app.get('/api/listings/:id', (req, res) => {
    const item = db.prepare(`${listingSelect} WHERE l.id=?`).get(req.params.id);
    if (!item || item.status === 'hidden') fail(404, 'Tin đăng không tồn tại hoặc đã bị ẩn.');
    res.json({
      ...item,
      reviews: db
        .prepare(
          'SELECT r.rating,r.comment,u.name FROM reviews r JOIN users u ON u.id=r.author_id WHERE r.target_id=? ORDER BY r.created_at DESC LIMIT 10',
        )
        .all(item.owner_id),
    });
  });
  app.post('/api/listings', auth, (req, res) => {
    const b = listingSchema.parse(req.body);
    if (b.kind === 'sell' && b.price < 1000) fail(400, 'Giá bán tối thiểu 1.000đ.');
    const id = randomUUID();
    db.prepare(
      'INSERT INTO listings(id,owner_id,title,description,subject,school,area,kind,price,condition) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      id,
      req.user.id,
      b.title,
      b.description,
      b.subject,
      b.school,
      b.area,
      b.kind,
      b.kind === 'sell' ? b.price : 0,
      b.condition,
    );
    res.status(201).json(getListing(id));
  });
  app.patch('/api/listings/:id', auth, (req, res) => {
    const l = getListing(req.params.id);
    if (!l) fail(404, 'Không tìm thấy tin đăng.');
    if (l.owner_id !== req.user.id) fail(403, 'Bạn không sở hữu tài liệu này.');
    if (l.moderated) fail(403, 'Tin đăng bị quản trị viên khóa.');
    if (!['active', 'hidden'].includes(l.status))
      fail(409, 'Không thể sửa tin đang giao dịch hoặc đã hoàn thành.');
    const b = listingSchema.parse(req.body);
    if (b.kind === 'sell' && b.price < 1000) fail(400, 'Giá bán tối thiểu 1.000đ.');
    db.prepare(
      'UPDATE listings SET title=?,description=?,subject=?,school=?,area=?,kind=?,price=?,condition=? WHERE id=?',
    ).run(
      b.title,
      b.description,
      b.subject,
      b.school,
      b.area,
      b.kind,
      b.kind === 'sell' ? b.price : 0,
      b.condition,
      l.id,
    );
    res.json(getListing(l.id));
  });
  app.post('/api/listings/:id/visibility', auth, (req, res) => {
    const l = getListing(req.params.id);
    if (!l) fail(404, 'Không tìm thấy tin đăng.');
    if (l.owner_id !== req.user.id) fail(403, 'Bạn không sở hữu tài liệu này.');
    if (l.moderated) fail(403, 'Tin đăng bị quản trị viên khóa.');
    if (!['active', 'hidden'].includes(l.status))
      fail(409, 'Tin đang giao dịch hoặc đã hoàn thành.');
    db.prepare('UPDATE listings SET status=? WHERE id=?').run(
      l.status === 'active' ? 'hidden' : 'active',
      l.id,
    );
    res.json({ ok: true });
  });
  app.get('/api/favorites', auth, (req, res) =>
    res.json(
      db
        .prepare(
          `${listingSelect} JOIN favorites f ON f.listing_id=l.id WHERE f.user_id=? AND l.status<>'hidden' ORDER BY l.created_at DESC`,
        )
        .all(req.user.id),
    ),
  );
  app.post('/api/favorites/:id', auth, (req, res) => {
    const l = getListing(req.params.id);
    if (!l || l.status === 'hidden') fail(404, 'Không tìm thấy tin đăng.');
    const exists = db
      .prepare('SELECT 1 FROM favorites WHERE user_id=? AND listing_id=?')
      .get(req.user.id, l.id);
    if (exists)
      db.prepare('DELETE FROM favorites WHERE user_id=? AND listing_id=?').run(req.user.id, l.id);
    else db.prepare('INSERT INTO favorites VALUES (?,?)').run(req.user.id, l.id);
    res.json({ saved: !exists });
  });
  app.post('/api/transactions', auth, (req, res) => {
    const b = z
      .object({
        listing_id: z.uuid(),
        offered_listing_id: z.uuid().optional(),
        note: text(0, 1000).default(''),
      })
      .strict()
      .parse(req.body);
    const id = atomic(db, () => {
      const l = getListing(b.listing_id);
      if (!l || l.status !== 'active') fail(409, 'Tài liệu không còn sẵn sàng.');
      if (l.owner_id === req.user.id) fail(400, 'Không thể giao dịch với chính mình.');
      if (l.kind === 'exchange') {
        const offer = b.offered_listing_id && getListing(b.offered_listing_id);
        if (
          !offer ||
          offer.owner_id !== req.user.id ||
          offer.status !== 'active' ||
          offer.kind !== 'exchange'
        )
          fail(400, 'Chọn tài liệu trao đổi đang hoạt động của bạn.');
      } else if (b.offered_listing_id) fail(400, 'Tin mua hoặc tặng không nhận tài liệu đổi.');
      if (
        db
          .prepare(
            "SELECT id FROM transactions WHERE listing_id=? AND buyer_id=? AND status IN ('pending','accepted')",
          )
          .get(l.id, req.user.id)
      )
        fail(409, 'Bạn đã có yêu cầu cho tài liệu này.');
      const id = randomUUID();
      db.prepare(
        'INSERT INTO transactions(id,listing_id,buyer_id,seller_id,offered_listing_id,note) VALUES (?,?,?,?,?,?)',
      ).run(id, l.id, req.user.id, l.owner_id, b.offered_listing_id || null, b.note);
      notify(l.owner_id, `${req.user.name} gửi yêu cầu: ${l.title}`, id);
      return id;
    });
    res.status(201).json({ id });
  });
  app.get('/api/transactions', auth, (req, res) =>
    res.json(
      db
        .prepare(
          `SELECT t.*,l.title,l.kind,l.price,b.name buyer_name,s.name seller_name,o.title offered_title,
 (SELECT rating FROM reviews WHERE transaction_id=t.id AND author_id=?) my_rating
 FROM transactions t JOIN listings l ON l.id=t.listing_id JOIN users b ON b.id=t.buyer_id JOIN users s ON s.id=t.seller_id LEFT JOIN listings o ON o.id=t.offered_listing_id
 WHERE t.buyer_id=? OR t.seller_id=? ORDER BY t.created_at DESC`,
        )
        .all(req.user.id, req.user.id, req.user.id),
    ),
  );
  app.post('/api/transactions/:id/action', auth, (req, res) => {
    const { action } = z
      .object({ action: z.enum(['accept', 'cancel', 'confirm']) })
      .parse(req.body);
    atomic(db, () => {
      const t = getTx(req),
        other = t.buyer_id === req.user.id ? t.seller_id : t.buyer_id;
      if (action === 'accept') {
        if (req.user.id !== t.seller_id) fail(403, 'Chỉ người đăng được chấp nhận.');
        if (t.status !== 'pending') fail(409, 'Yêu cầu không còn chờ xử lý.');
        if (ids(t).some((id) => getListing(id)?.status !== 'active'))
          fail(409, 'Một tài liệu đã được giữ chỗ hoặc bị ẩn.');
        ids(t).forEach((id) =>
          db.prepare("UPDATE listings SET status='reserved' WHERE id=?").run(id),
        );
        db.prepare("UPDATE transactions SET status='accepted' WHERE id=?").run(t.id);
        // Cancel every pending request overlapping either side of this exchange.
        const pending = db
          .prepare("SELECT * FROM transactions WHERE status='pending' AND id<>?")
          .all(t.id);
        pending
          .filter((p) => ids(p).some((id) => ids(t).includes(id)))
          .forEach((p) => {
            db.prepare("UPDATE transactions SET status='cancelled' WHERE id=?").run(p.id);
            notify(p.buyer_id, 'Yêu cầu đã hủy vì tài liệu được giữ cho giao dịch khác.', p.id);
          });
      } else if (action === 'cancel') {
        if (!['pending', 'accepted'].includes(t.status))
          fail(409, 'Không thể hủy giao dịch đã kết thúc.');
        if (t.status === 'accepted') unlock(t);
        db.prepare("UPDATE transactions SET status='cancelled' WHERE id=?").run(t.id);
      } else {
        if (t.status !== 'accepted') fail(409, 'Giao dịch chưa được chấp nhận.');
        const col = req.user.id === t.buyer_id ? 'buyer_confirmed' : 'seller_confirmed';
        if (t[col]) fail(409, 'Bạn đã xác nhận nhận/giao tài liệu.');
        db.prepare(`UPDATE transactions SET ${col}=1 WHERE id=?`).run(t.id);
        const updated = db.prepare('SELECT * FROM transactions WHERE id=?').get(t.id);
        if (updated.buyer_confirmed && updated.seller_confirmed) {
          db.prepare("UPDATE transactions SET status='completed' WHERE id=?").run(t.id);
          ids(t).forEach((id) =>
            db.prepare("UPDATE listings SET status='completed' WHERE id=?").run(id),
          );
        }
      }
      notify(
        other,
        `Giao dịch được cập nhật: ${action === 'accept' ? 'đã chấp nhận' : action === 'cancel' ? 'đã hủy' : 'đã xác nhận giao nhận'}.`,
        t.id,
      );
    });
    res.json({ ok: true });
  });
  app.get('/api/transactions/:id/messages', auth, (req, res) => {
    getTx(req);
    res.json(
      db
        .prepare(
          'SELECT m.*,u.name sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.transaction_id=? ORDER BY m.created_at,m.rowid LIMIT 500',
        )
        .all(req.params.id),
    );
  });
  app.post('/api/transactions/:id/messages', auth, (req, res) => {
    const t = getTx(req),
      b = z.object({ body: text(1, 2000) }).parse(req.body);
    if (['cancelled', 'completed'].includes(t.status))
      fail(409, 'Cuộc trò chuyện đã đóng sau khi giao dịch kết thúc.');
    atomic(db, () => {
      db.prepare('INSERT INTO messages(id,transaction_id,sender_id,body) VALUES (?,?,?,?)').run(
        randomUUID(),
        t.id,
        req.user.id,
        b.body,
      );
      notify(
        t.buyer_id === req.user.id ? t.seller_id : t.buyer_id,
        `${req.user.name}: ${b.body.slice(0, 80)}`,
        t.id,
      );
    });
    res.status(201).json({ ok: true });
  });
  app.post('/api/transactions/:id/reviews', auth, (req, res) => {
    const t = getTx(req),
      b = z
        .object({ rating: z.number().int().min(1).max(5), comment: text(0, 1000) })
        .parse(req.body);
    if (t.status !== 'completed') fail(409, 'Chỉ đánh giá sau khi cả hai xác nhận hoàn thành.');
    if (
      db
        .prepare('SELECT id FROM reviews WHERE transaction_id=? AND author_id=?')
        .get(t.id, req.user.id)
    )
      fail(409, 'Bạn đã đánh giá giao dịch này.');
    db.prepare(
      'INSERT INTO reviews(id,transaction_id,author_id,target_id,rating,comment) VALUES (?,?,?,?,?,?)',
    ).run(
      randomUUID(),
      t.id,
      req.user.id,
      t.buyer_id === req.user.id ? t.seller_id : t.buyer_id,
      b.rating,
      b.comment,
    );
    res.status(201).json({ ok: true });
  });
  app.get('/api/notifications', auth, (req, res) =>
    res.json(
      db
        .prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100')
        .all(req.user.id),
    ),
  );
  app.post('/api/notifications/read', auth, (req, res) => {
    db.prepare(
      "UPDATE notifications SET read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND read_at IS NULL",
    ).run(req.user.id);
    res.json({ ok: true });
  });
  app.post('/api/reports', auth, (req, res) => {
    const b = z.object({ listing_id: z.uuid(), reason: text(5, 1000) }).parse(req.body);
    if (!getListing(b.listing_id)) fail(404, 'Tin đăng không tồn tại.');
    db.prepare('INSERT INTO reports(id,reporter_id,listing_id,reason) VALUES (?,?,?,?)').run(
      randomUUID(),
      req.user.id,
      b.listing_id,
      b.reason,
    );
    res.status(201).json({ ok: true });
  });
  app.get('/api/admin', auth, admin, (req, res) =>
    res.json({
      stats: {
        users: db.prepare('SELECT count(*) n FROM users').get().n,
        listings: db.prepare('SELECT count(*) n FROM listings').get().n,
        completed: db.prepare("SELECT count(*) n FROM transactions WHERE status='completed'").get()
          .n,
        reports: db.prepare("SELECT count(*) n FROM reports WHERE status='open'").get().n,
      },
      reports: db
        .prepare(
          'SELECT r.*,l.title,u.name reporter_name FROM reports r JOIN listings l ON l.id=r.listing_id JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 100',
        )
        .all(),
      listings: db.prepare(`${listingSelect} ORDER BY l.created_at DESC LIMIT 100`).all(),
    }),
  );
  app.post('/api/admin/reports/:id/resolve', auth, admin, (req, res) => {
    if (!db.prepare('SELECT id FROM reports WHERE id=?').get(req.params.id))
      fail(404, 'Báo cáo không tồn tại.');
    db.prepare("UPDATE reports SET status='resolved' WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/admin/listings/:id/hide', auth, admin, (req, res) => {
    const l = getListing(req.params.id);
    if (!l) fail(404, 'Tin đăng không tồn tại.');
    atomic(db, () => {
      const affected = db
        .prepare(
          "SELECT * FROM transactions WHERE (listing_id=? OR offered_listing_id=?) AND status IN ('pending','accepted')",
        )
        .all(l.id, l.id);
      affected.forEach((t) => {
        if (t.status === 'accepted') unlock(t);
        db.prepare("UPDATE transactions SET status='cancelled' WHERE id=?").run(t.id);
        notify(t.buyer_id, 'Giao dịch bị hủy do tin đăng bị kiểm duyệt.', t.id);
        notify(t.seller_id, 'Giao dịch bị hủy do tin đăng bị kiểm duyệt.', t.id);
      });
      db.prepare("UPDATE listings SET status='hidden',moderated=1 WHERE id=?").run(l.id);
    });
    res.json({ ok: true });
  });
  app.use((req, res) => res.status(404).json({ error: 'Đường dẫn không tồn tại.' }));
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json({
          error:
            'Dữ liệu không hợp lệ: ' +
            err.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; '),
        });
    if (err.type === 'entity.too.large')
      return res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn.' });
    if (err instanceof SyntaxError && err.status === 400)
      return res.status(400).json({ error: 'JSON không hợp lệ.' });
    if (!err.status) console.error(err);
    res
      .status(err.status || 500)
      .json({ error: err.status ? err.message : 'Lỗi máy chủ. Vui lòng thử lại.' });
  });
  return app;
}
