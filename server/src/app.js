import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { one, all, atomic } from './db.js';
import { hashPassword, verifyPassword, session, tokenHash } from './auth.js';
import {
  fail,
  POINT_RULES,
  ids,
  businessLock,
  notify,
  conversation,
  participant,
  pointChange,
  cancel,
  reward,
  LISTING_SELECT,
  SAFE_USER,
  publicProfile,
} from './domain.js';
import { supportAnswer } from './support.js';
import { prepareImage, storeImage, bindImages, MAX_BASE64_LENGTH } from './images.js';
import {
  CATEGORY_IDS,
  classifierInfo,
  classifyDocument,
  inputHash,
  bindClassification,
} from './classifier.js';
const text = (min = 1, max = 200) => z.string().trim().min(min).max(max);
const listingSchema = z
  .object({
    title: text(3, 150),
    description: text(10, 3000),
    subject: text(2, 100),
    category: z.enum(['', ...CATEGORY_IDS]).optional(),
    classification_id: z.uuid().optional(),
    school: text(2, 150),
    area: text(2, 100),
    kind: z.enum(['sell', 'exchange', 'free']),
    price: z.number().int().min(0).max(100000000),
    condition: z.enum(['Mới', 'Như mới', 'Đã sử dụng']),
    pickup_label: text(0, 200).default(''),
    image_ids: z
      .array(z.uuid())
      .max(5)
      .refine((ids) => new Set(ids).size === ids.length, 'Ảnh bị trùng.')
      .optional(),
    latitude: z.number().finite().min(-90).max(90).nullable().default(null),
    longitude: z.number().finite().min(-180).max(180).nullable().default(null),
  })
  .strict()
  .superRefine((b, ctx) => {
    if ((b.latitude === null) !== (b.longitude === null))
      ctx.addIssue({ code: 'custom', message: 'Cần đủ kinh độ và vĩ độ.' });
    if (b.kind === 'sell' && b.price < 1000)
      ctx.addIssue({ code: 'custom', message: 'Giá bán tối thiểu 1.000đ.' });
  });
export const allowedOrigins = () =>
  (process.env.CORS_ORIGINS || 'http://localhost:8081,http://localhost:19006')
    .split(',')
    .map((s) => s.trim());
export async function findSession(db, token) {
  return token
    ? one(
        db,
        'SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>$2',
        [tokenHash(token), Date.now()],
      )
    : null;
}
export function createApp(pool, { rateLimits = true, events = () => {} } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: (o, cb) => cb(null, !o || allowedOrigins().includes(o)) }));
  const parseJson = express.json({ limit: '64kb' });
  app.use((req, res, next) =>
    req.path.replace(/\/$/, '') === '/api/uploads/images' ? next() : parseJson(req, res, next),
  );
  const limiter = (limit, windowMs = 60000) =>
    rateLimits
      ? rateLimit({
          windowMs,
          limit,
          standardHeaders: 'draft-8',
          legacyHeaders: false,
          message: { error: 'Thao tác quá nhanh. Vui lòng thử lại sau.' },
        })
      : (req, res, next) => next();
  app.use('/api', limiter(300));
  const loginLimit = limiter(30, 15 * 60000);
  const messageLimit = limiter(60);
  const helpLimit = limiter(20);
  const auth = async (req, res, next) => {
    req.token = req.headers.authorization?.replace(/^Bearer /, '');
    req.user = await findSession(pool, req.token);
    if (!req.user) fail(401, 'Vui lòng đăng nhập lại.');
    next();
  };
  const admin = (req, res, next) => {
    if (req.user.role !== 'admin') fail(403, 'Chỉ quản trị viên được truy cập.');
    next();
  };
  const write = async (fn) => {
    const queue = [];
    const result = await atomic(pool, (db) => {
      queue.length = 0;
      return fn(db, queue);
    });
    for (const e of queue) events(e);
    return result;
  };
  const getListing = (db, id) => one(db, 'SELECT * FROM listings WHERE id=$1', [id]);
  const txFor = async (db, req) => {
    const t = await one(db, 'SELECT * FROM transactions WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!t) fail(404, 'Không tìm thấy giao dịch.');
    if (![t.buyer_id, t.seller_id].includes(req.user.id))
      fail(403, 'Bạn không thuộc giao dịch này.');
    return t;
  };
  app.get('/api/ai/categories', (req, res) => res.json(classifierInfo()));
  app.post('/api/ai/classify', auth, limiter(10), async (req, res) => {
    const b = z
      .object({ title: text(3, 150), description: text(0, 3000).default('') })
      .strict()
      .parse(req.body);
    if ((b.title + b.description).length < 10)
      fail(400, 'Nhập tên và mô tả rõ hơn (tổng ít nhất 10 ký tự) để AI gợi ý.');
    const result = classifyDocument(b.title, b.description);
    const id = randomUUID();
    await write(async (db) => {
      await db.query(
        "DELETE FROM ai_classifications WHERE user_id=$1 AND listing_id IS NULL AND created_at<now()-interval '30 days'",
        [req.user.id],
      );
      await db.query(
        'INSERT INTO ai_classifications(id,user_id,input_hash,model_version,predicted_category,suggestions,abstained) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          id,
          req.user.id,
          inputHash(b.title, b.description),
          result.model_version,
          result.predicted_category,
          JSON.stringify(result.suggestions),
          result.abstained,
        ],
      );
    });
    res.json({ ...result, classification_id: id });
  });
  app.post(
    '/api/uploads/images',
    auth,
    limiter(20),
    express.json({ limit: '8mb' }),
    async (req, res) => {
      const b = z
        .object({ base64: z.string().min(4).max(MAX_BASE64_LENGTH) })
        .strict()
        .parse(req.body);
      const image = await prepareImage(b.base64);
      const saved = await write((db) => storeImage(db, req.user.id, image));
      res.status(201).json(saved);
    },
  );
  app.delete('/api/uploads/images/:id', auth, async (req, res) => {
    const photo = await one(pool, 'SELECT owner_id FROM listing_images WHERE id=$1', [
      req.params.id,
    ]);
    if (!photo) return res.json({ deleted: false });
    if (photo.owner_id !== req.user.id) fail(403, 'Bạn không sở hữu ảnh này.');
    const result = await pool.query(
      'DELETE FROM listing_images WHERE id=$1 AND owner_id=$2 AND listing_id IS NULL RETURNING id',
      [req.params.id, req.user.id],
    );
    res.json({ deleted: result.rowCount > 0 });
  });
  app.get('/api/images/:id', async (req, res) => {
    const size = z.enum(['full', 'thumb']).default('full').parse(req.query.size);
    const photo = await one(
      pool,
      `SELECT owner_id,listing_id,mime_type,${size === 'thumb' ? 'thumbnail' : 'data'} AS bytes FROM listing_images WHERE id=$1`,
      [req.params.id],
    );
    if (!photo) fail(404, 'Không tìm thấy ảnh.');
    if (!photo.listing_id) {
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      const user = await findSession(pool, token);
      if (!user || user.id !== photo.owner_id) fail(404, 'Không tìm thấy ảnh.');
    }
    const etag = '"' + req.params.id + '-' + size + '"';
    res.set({
      'Content-Type': photo.mime_type,
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': photo.listing_id ? 'public, max-age=86400' : 'private, no-store',
      ETag: etag,
    });
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.send(photo.bytes);
  });
  app.get('/api/health', async (req, res) =>
    res.json({ ok: true, database: (await one(pool, 'SELECT 1 ok')).ok, engine: 'postgresql' }),
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
    const hash = await hashPassword(b.password);
    const u = await one(
      pool,
      'INSERT INTO users(id,name,email,password_hash,school,area) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [randomUUID(), b.name, b.email, hash, b.school, b.area],
    );
    res.status(201).json(await session(pool, u));
  });
  app.post('/api/auth/login', loginLimit, async (req, res) => {
    const b = z.object({ email: z.email(), password: z.string().min(1).max(128) }).parse(req.body);
    const u = await one(pool, 'SELECT * FROM users WHERE lower(email)=lower($1)', [b.email]);
    if (!u || !(await verifyPassword(b.password, u.password_hash)))
      fail(401, 'Email hoặc mật khẩu không đúng.');
    res.json(await session(pool, u));
  });
  app.post('/api/auth/logout', auth, async (req, res) => {
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(req.token)]);
    events({
      users: [req.user.id],
      event: 'session:revoked',
      data: { token_hash: tokenHash(req.token) },
    });
    res.json({ ok: true });
  });
  app.get('/api/me', auth, async (req, res) =>
    res.json(await one(pool, `SELECT ${SAFE_USER} FROM users WHERE id=$1`, [req.user.id])),
  );
  app.patch('/api/me', auth, async (req, res) => {
    const b = z
      .object({
        name: text(2, 80),
        school: text(2, 150),
        area: text(2, 100),
        bio: text(0, 500).default(''),
      })
      .strict()
      .parse(req.body);
    res.json(
      await one(
        pool,
        `UPDATE users SET name=$1,school=$2,area=$3,bio=$4 WHERE id=$5 RETURNING ${SAFE_USER}`,
        [b.name, b.school, b.area, b.bio, req.user.id],
      ),
    );
  });
  app.get('/api/users/:id', async (req, res) => res.json(await publicProfile(pool, req.params.id)));
  app.get('/api/wallet', auth, async (req, res) =>
    res.json({
      balance: (await one(pool, 'SELECT points FROM users WHERE id=$1', [req.user.id])).points,
      rules: POINT_RULES,
      history: await all(
        pool,
        'SELECT * FROM point_ledger WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 100',
        [req.user.id],
      ),
    }),
  );
  app.get('/api/listings', async (req, res) => {
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
    const param = (v) => {
      args.push(v);
      return '$' + args.length;
    };
    const like = (v) => '%' + v.replace(/[!%_]/g, '!$&') + '%';
    if (q.q) {
      const p = param(like(q.q));
      where.push(`(l.title ILIKE ${p} ESCAPE '!' OR l.subject ILIKE ${p} ESCAPE '!')`);
    }
    if (q.area) where.push(`l.area ILIKE ${param(like(q.area))} ESCAPE '!'`);
    if (q.school) where.push(`l.school ILIKE ${param(like(q.school))} ESCAPE '!'`);
    if (q.kind) where.push(`l.kind=${param(q.kind)}`);
    const clause = where.join(' AND ');
    const total = (
      await one(pool, `SELECT count(*)::int total FROM listings l WHERE ${clause}`, args)
    ).total;
    res.json({
      items: await all(
        pool,
        `${LISTING_SELECT} WHERE ${clause} ORDER BY ${q.sort === 'price' ? 'l.price ASC,' : ''}l.created_at DESC,l.id LIMIT ${param(q.limit)} OFFSET ${param(q.offset)}`,
        args,
      ),
      total,
    });
  });
  app.get('/api/my/listings', auth, async (req, res) =>
    res.json(
      await all(pool, `${LISTING_SELECT} WHERE l.owner_id=$1 ORDER BY l.created_at DESC`, [
        req.user.id,
      ]),
    ),
  );
  app.get('/api/listings/:id', async (req, res) => {
    const item = await one(pool, `${LISTING_SELECT} WHERE l.id=$1`, [req.params.id]);
    if (!item || item.status === 'hidden') fail(404, 'Tin đăng không tồn tại hoặc đã bị ẩn.');
    const p = await publicProfile(pool, item.owner_id);
    res.json({ ...item, reviews: p.reviews });
  });
  app.post('/api/listings', auth, async (req, res) => {
    const b = listingSchema.parse(req.body);
    const result = await write(async (db) => {
      await businessLock(db);
      const id = randomUUID();
      await db.query(
        'INSERT INTO listings(id,owner_id,title,description,subject,school,area,kind,price,point_cost,condition,pickup_label,latitude,longitude,category) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
        [
          id,
          req.user.id,
          b.title,
          b.description,
          b.subject,
          b.school,
          b.area,
          b.kind,
          b.kind === 'sell' ? b.price : 0,
          b.kind === 'free' ? POINT_RULES.redeem : 0,
          b.condition,
          b.pickup_label,
          b.latitude,
          b.longitude,
          b.category || '',
        ],
      );
      await bindImages(db, req.user.id, id, b.image_ids);
      await bindClassification(db, req.user.id, id, b, b.category || '');
      return one(db, `${LISTING_SELECT} WHERE l.id=$1`, [id]);
    });
    res.status(201).json(result);
  });
  app.patch('/api/listings/:id', auth, async (req, res) => {
    const b = listingSchema.parse(req.body);
    const result = await write(async (db) => {
      await businessLock(db);
      const l = await getListing(db, req.params.id);
      if (!l) fail(404, 'Không tìm thấy tin đăng.');
      if (l.owner_id !== req.user.id || l.moderated) fail(403, 'Bạn không có quyền sửa tin này.');
      if (!['active', 'hidden'].includes(l.status))
        fail(409, 'Tin đang giao dịch hoặc đã hoàn thành.');
      await db.query(
        'UPDATE listings SET title=$1,description=$2,subject=$3,school=$4,area=$5,kind=$6,price=$7,point_cost=$8,condition=$9,pickup_label=$10,latitude=$11,longitude=$12,category=$14 WHERE id=$13',
        [
          b.title,
          b.description,
          b.subject,
          b.school,
          b.area,
          b.kind,
          b.kind === 'sell' ? b.price : 0,
          b.kind === 'free' ? POINT_RULES.redeem : 0,
          b.condition,
          b.pickup_label,
          b.latitude,
          b.longitude,
          l.id,
          b.category ?? l.category,
        ],
      );
      await bindImages(db, req.user.id, l.id, b.image_ids);
      await bindClassification(db, req.user.id, l.id, b, b.category ?? l.category);
      return one(db, `${LISTING_SELECT} WHERE l.id=$1`, [l.id]);
    });
    res.json(result);
  });
  app.post('/api/listings/:id/visibility', auth, async (req, res) => {
    await write(async (db) => {
      await businessLock(db);
      const l = await getListing(db, req.params.id);
      if (!l) fail(404, 'Không tìm thấy tin đăng.');
      if (l.owner_id !== req.user.id || l.moderated)
        fail(403, 'Bạn không có quyền đổi trạng thái tin này.');
      if (!['active', 'hidden'].includes(l.status))
        fail(409, 'Tin đang giao dịch hoặc đã hoàn thành.');
      await db.query('UPDATE listings SET status=$1 WHERE id=$2', [
        l.status === 'active' ? 'hidden' : 'active',
        l.id,
      ]);
    });
    res.json({ ok: true });
  });
  app.get('/api/favorites', auth, async (req, res) =>
    res.json(
      await all(
        pool,
        `${LISTING_SELECT} JOIN favorites f ON f.listing_id=l.id WHERE f.user_id=$1 AND l.status<>'hidden' ORDER BY l.created_at DESC`,
        [req.user.id],
      ),
    ),
  );
  app.post('/api/favorites/:id', auth, async (req, res) => {
    const l = await getListing(pool, req.params.id);
    if (!l || l.status === 'hidden') fail(404, 'Tin không tồn tại.');
    const deleted = await pool.query(
      'DELETE FROM favorites WHERE user_id=$1 AND listing_id=$2 RETURNING *',
      [req.user.id, l.id],
    );
    if (!deleted.rowCount)
      await pool.query('INSERT INTO favorites VALUES($1,$2) ON CONFLICT DO NOTHING', [
        req.user.id,
        l.id,
      ]);
    res.json({ saved: !deleted.rowCount });
  });
  // Conversations can start before any purchase request exists.
  app.post('/api/conversations', auth, async (req, res) => {
    const b = z.object({ listing_id: z.uuid() }).parse(req.body);
    const l = await getListing(pool, b.listing_id);
    if (!l || l.status === 'hidden') fail(404, 'Tin không tồn tại.');
    if (l.owner_id === req.user.id) fail(400, 'Không thể tự nhắn cho mình.');
    const c = await conversation(pool, l, req.user.id);
    events({ users: [c.buyer_id, c.seller_id], event: 'conversation:updated', data: { id: c.id } });
    res.status(201).json(c);
  });
  app.get('/api/conversations', auth, async (req, res) =>
    res.json(
      await all(
        pool,
        `SELECT c.*,l.title,l.status listing_status,b.name buyer_name,s.name seller_name,
 (SELECT body FROM messages WHERE conversation_id=c.id ORDER BY seq DESC LIMIT 1) last_message,
 coalesce((SELECT created_at FROM messages WHERE conversation_id=c.id ORDER BY seq DESC LIMIT 1),c.created_at) updated_at,
 (SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>$1 AND m.created_at>CASE WHEN c.buyer_id=$1 THEN c.buyer_read_at ELSE c.seller_read_at END) unread
 FROM conversations c JOIN listings l ON l.id=c.listing_id JOIN users b ON b.id=c.buyer_id JOIN users s ON s.id=c.seller_id WHERE c.buyer_id=$1 OR c.seller_id=$1 ORDER BY updated_at DESC LIMIT 100`,
        [req.user.id],
      ),
    ),
  );
  app.get('/api/conversations/:id/messages', auth, async (req, res) => {
    await participant(pool, req.params.id, req.user);
    const q = z
      .object({
        before: z.string().regex(/^\d+$/).optional(),
        after: z.string().regex(/^\d+$/).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    if (q.before && q.after) fail(400, 'Chọn before hoặc after.');
    const args = [req.params.id],
      clause = q.before ? 'AND seq<$2' : q.after ? 'AND seq>$2' : '';
    if (q.before || q.after) args.push(q.before || q.after);
    args.push(q.limit + 1);
    const rows = await all(
      pool,
      `SELECT m.*,u.name sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE conversation_id=$1 ${clause} ORDER BY seq ${q.after ? 'ASC' : 'DESC'} LIMIT $${args.length}`,
      args,
    );
    const has_more = rows.length > q.limit;
    const data = rows.slice(0, q.limit);
    if (!q.after) data.reverse();
    res.json({ items: data, has_more });
  });
  app.post('/api/conversations/:id/read', auth, async (req, res) => {
    const c = await participant(pool, req.params.id, req.user);
    const column = c.buyer_id === req.user.id ? 'buyer_read_at' : 'seller_read_at';
    await pool.query(`UPDATE conversations SET ${column}=now() WHERE id=$1`, [c.id]);
    events({ users: [req.user.id], event: 'conversation:updated', data: { id: c.id } });
    res.json({ ok: true });
  });
  app.post('/api/conversations/:id/messages', auth, messageLimit, async (req, res) => {
    const b = z
      .object({ body: text(1, 2000), client_id: z.uuid() })
      .strict()
      .parse(req.body);
    const message = await write(async (db, queue) => {
      const c = await participant(db, req.params.id, req.user);
      const l = await getListing(db, c.listing_id);
      if (l.status === 'hidden') fail(409, 'Tin đăng đã bị ẩn; cuộc trò chuyện chỉ đọc.');
      const m = await one(
        db,
        'INSERT INTO messages(id,conversation_id,sender_id,body,client_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(sender_id,client_id) DO NOTHING RETURNING *',
        [randomUUID(), c.id, req.user.id, b.body, b.client_id],
      );
      if (!m) {
        const existing = await one(
          db,
          'SELECT * FROM messages WHERE sender_id=$1 AND client_id=$2',
          [req.user.id, b.client_id],
        );
        if (existing.conversation_id !== c.id || existing.body !== b.body)
          fail(409, 'Mã tin nhắn đã được sử dụng.');
        return { ...existing, sender_name: req.user.name };
      }
      const result = { ...m, sender_name: req.user.name };
      queue.push({ users: [c.buyer_id, c.seller_id], event: 'message:new', data: result });
      await notify(
        db,
        queue,
        c.buyer_id === req.user.id ? c.seller_id : c.buyer_id,
        `${req.user.name}: ${b.body.slice(0, 80)}`,
      );
      return result;
    });
    res.status(201).json(message);
  });
  app.post('/api/transactions', auth, async (req, res) => {
    const b = z
      .object({
        listing_id: z.uuid(),
        offered_listing_id: z.uuid().optional(),
        note: text(0, 1000).default(''),
      })
      .strict()
      .parse(req.body);
    const result = await write(async (db, queue) => {
      await businessLock(db);
      const l = await getListing(db, b.listing_id);
      if (!l || l.status !== 'active') fail(409, 'Tài liệu không còn sẵn sàng.');
      if (l.owner_id === req.user.id) fail(400, 'Không thể giao dịch với chính mình.');
      if (l.kind === 'exchange') {
        const o = b.offered_listing_id && (await getListing(db, b.offered_listing_id));
        if (!o || o.owner_id !== req.user.id || o.status !== 'active' || o.kind !== 'exchange')
          fail(400, 'Chọn tài liệu Trao đổi đang hoạt động của bạn.');
      } else if (b.offered_listing_id) fail(400, 'Tin này không nhận tài liệu đổi.');
      const c = await conversation(db, l, req.user.id);
      const t = await one(
        db,
        'INSERT INTO transactions(id,listing_id,buyer_id,seller_id,offered_listing_id,conversation_id,kind,price,point_cost,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
        [
          randomUUID(),
          l.id,
          req.user.id,
          l.owner_id,
          b.offered_listing_id || null,
          c.id,
          l.kind,
          l.price,
          l.point_cost,
          b.note,
        ],
      );
      await notify(db, queue, l.owner_id, `${req.user.name} gửi yêu cầu: ${l.title}`, t.id);
      queue.push({ users: [req.user.id, l.owner_id], event: 'transaction:updated', data: t });
      return t;
    });
    res.status(201).json(result);
  });
  app.get('/api/transactions', auth, async (req, res) =>
    res.json(
      await all(
        pool,
        `SELECT t.*,l.title,b.name buyer_name,s.name seller_name,o.title offered_title,(SELECT rating FROM reviews WHERE transaction_id=t.id AND author_id=$1) my_rating FROM transactions t JOIN listings l ON l.id=t.listing_id JOIN users b ON b.id=t.buyer_id JOIN users s ON s.id=t.seller_id LEFT JOIN listings o ON o.id=t.offered_listing_id WHERE t.buyer_id=$1 OR t.seller_id=$1 ORDER BY t.created_at DESC LIMIT 100`,
        [req.user.id],
      ),
    ),
  );
  app.post('/api/transactions/:id/action', auth, async (req, res) => {
    const { action } = z
      .object({ action: z.enum(['accept', 'cancel', 'confirm']) })
      .parse(req.body);
    await write(async (db, queue) => {
      await businessLock(db);
      const t = await txFor(db, req);
      if (action === 'cancel') {
        if (t.buyer_confirmed || t.seller_confirmed)
          fail(409, 'Một bên đã xác nhận giao nhận. Vui lòng tạo phiếu hỗ trợ.');
        await cancel(db, queue, t);
        return;
      }
      if (action === 'accept') {
        if (req.user.id !== t.seller_id) fail(403, 'Chỉ người đăng được chấp nhận.');
        if (t.status !== 'pending') fail(409, 'Yêu cầu không còn chờ.');
        const books = await all(
          db,
          'SELECT * FROM listings WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [ids(t)],
        );
        if (books.length !== ids(t).length || books.some((l) => l.status !== 'active'))
          fail(409, 'Một tài liệu không còn sẵn sàng.');
        const l = books.find((x) => x.id === t.listing_id);
        const offered = books.find((x) => x.id === t.offered_listing_id);
        if (
          t.kind === 'exchange' &&
          (!offered || offered.owner_id !== t.buyer_id || offered.kind !== 'exchange')
        )
          fail(409, 'Tài liệu đề nghị không còn ở hình thức Trao đổi. Hãy gửi lại yêu cầu.');
        if (l.kind !== t.kind || l.price !== t.price || l.point_cost !== t.point_cost)
          fail(409, 'Thông tin giá/hình thức đã đổi. Hãy hủy và gửi lại yêu cầu.');
        if (t.kind === 'free') {
          await pointChange(
            db,
            queue,
            t.buyer_id,
            t.id,
            'redeem',
            -t.point_cost,
            'Đổi điểm nhận sách miễn phí',
          );
          await db.query('UPDATE transactions SET points_spent=$1 WHERE id=$2', [
            t.point_cost,
            t.id,
          ]);
        }
        await db.query("UPDATE listings SET status='reserved' WHERE id=ANY($1::uuid[])", [ids(t)]);
        await db.query("UPDATE transactions SET status='accepted' WHERE id=$1", [t.id]);
        const competing = await all(
          db,
          "SELECT * FROM transactions WHERE status='pending' AND id<>$1 AND (listing_id=ANY($2::uuid[]) OR offered_listing_id=ANY($2::uuid[]))",
          [t.id, ids(t)],
        );
        for (const p of competing)
          await cancel(db, queue, p, 'Yêu cầu đã hủy vì sách được giữ cho giao dịch khác.');
      } else {
        if (t.status !== 'accepted') fail(409, 'Giao dịch chưa được chấp nhận.');
        const col = req.user.id === t.buyer_id ? 'buyer_confirmed' : 'seller_confirmed';
        if (t[col]) fail(409, 'Bạn đã xác nhận giao nhận.');
        const updated = await one(
          db,
          `UPDATE transactions SET ${col}=true WHERE id=$1 RETURNING *`,
          [t.id],
        );
        if (updated.buyer_confirmed && updated.seller_confirmed) {
          await db.query(
            "UPDATE transactions SET status='completed',completed_at=now() WHERE id=$1",
            [t.id],
          );
          await db.query("UPDATE listings SET status='completed' WHERE id=ANY($1::uuid[])", [
            ids(t),
          ]);
          await reward(db, queue, updated);
        }
      }
      for (const u of [t.buyer_id, t.seller_id])
        await notify(
          db,
          queue,
          u,
          action === 'accept' ? 'Yêu cầu đã được chấp nhận.' : 'Đã cập nhật xác nhận giao nhận.',
          t.id,
        );
      queue.push({
        users: [t.buyer_id, t.seller_id],
        event: 'transaction:updated',
        data: { id: t.id },
      });
    });
    res.json({ ok: true });
  });
  app.post('/api/transactions/:id/reviews', auth, async (req, res) => {
    const b = z
      .object({ rating: z.number().int().min(1).max(5), comment: text(0, 1000) })
      .parse(req.body);
    await write(async (db, queue) => {
      const t = await txFor(db, req);
      if (t.status !== 'completed') fail(409, 'Chỉ đánh giá sau khi hoàn thành.');
      await db.query(
        'INSERT INTO reviews(id,transaction_id,author_id,target_id,rating,comment) VALUES($1,$2,$3,$4,$5,$6)',
        [
          randomUUID(),
          t.id,
          req.user.id,
          t.buyer_id === req.user.id ? t.seller_id : t.buyer_id,
          b.rating,
          b.comment,
        ],
      );
    });
    res.status(201).json({ ok: true });
  });
  app.get('/api/notifications', auth, async (req, res) =>
    res.json(
      await all(
        pool,
        'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
        [req.user.id],
      ),
    ),
  );
  app.post('/api/notifications/read', auth, async (req, res) => {
    await pool.query(
      'UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',
      [req.user.id],
    );
    res.json({ ok: true });
  });
  app.post('/api/reports', auth, async (req, res) => {
    const b = z.object({ listing_id: z.uuid(), reason: text(5, 1000) }).parse(req.body);
    await pool.query('INSERT INTO reports(id,reporter_id,listing_id,reason) VALUES($1,$2,$3,$4)', [
      randomUUID(),
      req.user.id,
      b.listing_id,
      b.reason,
    ]);
    res.status(201).json({ ok: true });
  });
  app.post('/api/support/chat', helpLimit, (req, res) => {
    const b = z.object({ message: text(1, 1000) }).parse(req.body);
    res.json(supportAnswer(b.message));
  });
  app.get('/api/support/tickets', auth, async (req, res) =>
    res.json(
      await all(
        pool,
        `SELECT t.*,u.name user_name FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE t.user_id=$1 OR $2='admin' ORDER BY created_at DESC LIMIT 100`,
        [req.user.id, req.user.role],
      ),
    ),
  );
  app.post('/api/support/tickets', auth, helpLimit, async (req, res) => {
    const b = z.object({ subject: text(3, 150), body: text(5, 2000) }).parse(req.body);
    const ticket = await write(async (db, queue) => {
      const t = await one(
        db,
        'INSERT INTO support_tickets(id,user_id,subject) VALUES($1,$2,$3) RETURNING *',
        [randomUUID(), req.user.id, b.subject],
      );
      await db.query(
        'INSERT INTO support_messages(id,ticket_id,sender_id,body) VALUES($1,$2,$3,$4)',
        [randomUUID(), t.id, req.user.id, b.body],
      );
      queue.push({
        users: [req.user.id],
        admins: true,
        event: 'support:new',
        data: { ticket_id: t.id },
      });
      return t;
    });
    res.status(201).json(ticket);
  });
  const supportFor = async (db, req) => {
    const t = await one(db, 'SELECT * FROM support_tickets WHERE id=$1', [req.params.id]);
    if (!t) fail(404, 'Không tìm thấy phiếu.');
    if (t.user_id !== req.user.id && req.user.role !== 'admin')
      fail(403, 'Không được xem phiếu của người khác.');
    return t;
  };
  app.get('/api/support/tickets/:id/messages', auth, async (req, res) => {
    await supportFor(pool, req);
    res.json(
      await all(
        pool,
        'SELECT m.*,u.name sender_name,u.role FROM support_messages m JOIN users u ON u.id=m.sender_id WHERE ticket_id=$1 ORDER BY m.created_at,m.id LIMIT 200',
        [req.params.id],
      ),
    );
  });
  app.post('/api/support/tickets/:id/messages', auth, messageLimit, async (req, res) => {
    const b = z.object({ body: text(1, 2000) }).parse(req.body);
    const m = await write(async (db, queue) => {
      const t = await supportFor(db, req);
      if (t.status === 'resolved') fail(409, 'Phiếu đã đóng.');
      const m = await one(
        db,
        'INSERT INTO support_messages(id,ticket_id,sender_id,body) VALUES($1,$2,$3,$4) RETURNING *',
        [randomUUID(), t.id, req.user.id, b.body],
      );
      queue.push({
        users: [t.user_id],
        admins: true,
        event: 'support:new',
        data: { ticket_id: t.id },
      });
      return m;
    });
    res.status(201).json(m);
  });
  app.post('/api/admin/support/:id/resolve', auth, admin, async (req, res) => {
    const t = await supportFor(pool, req);
    await pool.query("UPDATE support_tickets SET status='resolved' WHERE id=$1", [t.id]);
    events({ users: [t.user_id], admins: true, event: 'support:new', data: { ticket_id: t.id } });
    res.json({ ok: true });
  });
  app.get('/api/admin', auth, admin, async (req, res) =>
    res.json({
      stats: {
        users: (await one(pool, 'SELECT count(*)::int n FROM users')).n,
        listings: (await one(pool, 'SELECT count(*)::int n FROM listings')).n,
        completed: (
          await one(pool, "SELECT count(*)::int n FROM transactions WHERE status='completed'")
        ).n,
        reports: (await one(pool, "SELECT count(*)::int n FROM reports WHERE status='open'")).n,
      },
      reports: await all(
        pool,
        'SELECT r.*,l.title,u.name reporter_name FROM reports r JOIN listings l ON l.id=r.listing_id JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 100',
      ),
      listings: await all(pool, `${LISTING_SELECT} ORDER BY l.created_at DESC LIMIT 100`),
    }),
  );
  app.post('/api/admin/reports/:id/resolve', auth, admin, async (req, res) => {
    const r = await pool.query("UPDATE reports SET status='resolved' WHERE id=$1 RETURNING id", [
      req.params.id,
    ]);
    if (!r.rowCount) fail(404, 'Không tìm thấy báo cáo.');
    await pool.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [
      randomUUID(),
      req.user.id,
      'resolve_report',
      req.params.id,
    ]);
    res.json({ ok: true });
  });
  app.post('/api/admin/listings/:id/hide', auth, admin, async (req, res) => {
    await write(async (db, queue) => {
      await businessLock(db);
      const l = await getListing(db, req.params.id);
      if (!l) fail(404, 'Tin không tồn tại.');
      const affected = await all(
        db,
        "SELECT * FROM transactions WHERE (listing_id=$1 OR offered_listing_id=$1) AND status IN ('pending','accepted')",
        [l.id],
      );
      for (const t of affected)
        await cancel(db, queue, t, 'Giao dịch bị hủy do tin đăng bị kiểm duyệt.');
      await db.query("UPDATE listings SET status='hidden',moderated=true WHERE id=$1", [l.id]);
      await db.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [
        randomUUID(),
        req.user.id,
        'hide_listing',
        l.id,
      ]);
    });
    res.json({ ok: true });
  });
  app.use((req, res) => res.status(404).json({ error: 'Đường dẫn không tồn tại.' }));
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error:
          'Dữ liệu không hợp lệ: ' +
          err.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; '),
      });
    if (err.code === '23505')
      return res.status(409).json({ error: 'Email, yêu cầu hoặc đánh giá đã tồn tại.' });
    if (['22P02', '23503', '23514', '22003'].includes(err.code))
      return res.status(400).json({ error: 'Dữ liệu tham chiếu hoặc giá trị không hợp lệ.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu quá lớn.' });
    if (err instanceof SyntaxError && err.status === 400)
      return res.status(400).json({ error: 'JSON không hợp lệ.' });
    if (!err.status) console.error(err);
    res
      .status(err.status || 500)
      .json({ error: err.status ? err.message : 'Lỗi máy chủ. Vui lòng thử lại.' });
  });
  return app;
}
