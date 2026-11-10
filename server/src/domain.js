import { randomUUID } from 'node:crypto';
import { one, all } from './db.js';
export function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
export const POINT_RULES = { earn: 10, redeem: 20, dailyCap: 30, pairHours: 24 };
export const ids = (t) => [t.listing_id, t.offered_listing_id].filter(Boolean);
export async function businessLock(db) {
  // Serialize short marketplace transitions across API instances. PostgreSQL-scoped,
  // released on commit/rollback. Chat/profile reads and writes remain concurrent.
  await db.query('SELECT pg_advisory_xact_lock(208811,2)');
}
export async function notify(db, queue, user, body, tx = null) {
  const n = await one(
    db,
    'INSERT INTO notifications(id,user_id,body,transaction_id) VALUES($1,$2,$3,$4) RETURNING *',
    [randomUUID(), user, body, tx],
  );
  queue.push({ users: [user], event: 'notification:new', data: n });
}
export async function conversation(db, listing, buyer) {
  return one(
    db,
    `INSERT INTO conversations(id,listing_id,buyer_id,seller_id) VALUES($1,$2,$3,$4)
 ON CONFLICT(listing_id,buyer_id) DO UPDATE SET listing_id=EXCLUDED.listing_id RETURNING *`,
    [randomUUID(), listing.id, buyer, listing.owner_id],
  );
}
export async function participant(db, id, user) {
  const c = await one(db, 'SELECT * FROM conversations WHERE id=$1', [id]);
  if (!c) fail(404, 'Không tìm thấy cuộc trò chuyện.');
  if (![c.buyer_id, c.seller_id].includes(user.id))
    fail(403, 'Bạn không thuộc cuộc trò chuyện này.');
  return c;
}
export async function pointChange(db, queue, user, tx, reason, delta, note) {
  if (
    await one(
      db,
      'SELECT id FROM point_ledger WHERE user_id=$1 AND transaction_id=$2 AND reason=$3',
      [user, tx, reason],
    )
  )
    return;
  const wallet = await one(db, 'SELECT points FROM users WHERE id=$1 FOR UPDATE', [user]);
  if (wallet.points + delta < 0)
    fail(409, `Chưa đủ điểm. Bạn cần ${-delta} điểm để nhận sách này.`);
  const balance = wallet.points + delta;
  await db.query('UPDATE users SET points=$1 WHERE id=$2', [balance, user]);
  await db.query(
    'INSERT INTO point_ledger(id,user_id,transaction_id,reason,delta,balance_after,note) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [randomUUID(), user, tx, reason, delta, balance, note],
  );
  queue.push({ users: [user], event: 'wallet:updated', data: { balance } });
}
export async function cancel(db, queue, t, note = 'Giao dịch đã hủy.') {
  if (!['pending', 'accepted'].includes(t.status)) fail(409, 'Giao dịch đã kết thúc.');
  if (t.status === 'accepted') {
    await db.query(
      "UPDATE listings SET status='active' WHERE id=ANY($1::uuid[]) AND status='reserved'",
      [ids(t)],
    );
    if (t.points_spent)
      await pointChange(
        db,
        queue,
        t.buyer_id,
        t.id,
        'refund',
        t.points_spent,
        'Hoàn điểm do hủy giao dịch',
      );
  }
  await db.query("UPDATE transactions SET status='cancelled' WHERE id=$1", [t.id]);
  for (const u of [t.buyer_id, t.seller_id]) await notify(db, queue, u, note, t.id);
  queue.push({
    users: [t.buyer_id, t.seller_id],
    event: 'transaction:updated',
    data: { id: t.id },
  });
}
export async function reward(db, queue, t) {
  if (t.kind !== 'sell') return;
  for (const user of [t.buyer_id, t.seller_id]) {
    const pair = await one(
      db,
      `SELECT p.id FROM point_ledger p JOIN transactions x ON x.id=p.transaction_id
   WHERE p.user_id=$1 AND p.reason='earn' AND p.created_at>now()-interval '24 hours'
   AND ((x.buyer_id=$2 AND x.seller_id=$3) OR (x.buyer_id=$3 AND x.seller_id=$2)) LIMIT 1`,
      [user, t.buyer_id, t.seller_id],
    );
    const earned = await one(
      db,
      "SELECT coalesce(sum(delta),0)::int total FROM point_ledger WHERE user_id=$1 AND reason='earn' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
      [user],
    );
    if (!pair && earned.total < POINT_RULES.dailyCap)
      await pointChange(
        db,
        queue,
        user,
        t.id,
        'earn',
        POINT_RULES.earn,
        'Thưởng giao dịch mua bán hoàn thành',
      );
  }
}
export const LISTING_SELECT = `SELECT l.*,u.name owner_name,
 (SELECT round(avg(rating),1)::float FROM reviews WHERE target_id=l.owner_id) owner_rating,
 (SELECT count(*)::int FROM reviews WHERE target_id=l.owner_id) owner_review_count
 FROM listings l JOIN users u ON u.id=l.owner_id`;
export const SAFE_USER = 'id,name,email,school,area,bio,role,points,created_at';
export async function publicProfile(db, id) {
  const profile = await one(
    db,
    `SELECT id,name,school,area,bio,created_at,
  (SELECT round(avg(rating),1)::float FROM reviews WHERE target_id=u.id) rating,
  (SELECT count(*)::int FROM reviews WHERE target_id=u.id) review_count,
  (SELECT count(*)::int FROM transactions WHERE status='completed' AND (buyer_id=u.id OR seller_id=u.id)) completed_count
  FROM users u WHERE id=$1`,
    [id],
  );
  if (!profile) fail(404, 'Không tìm thấy người dùng.');
  const reviews = await all(
    db,
    `SELECT r.id,r.rating,r.comment,r.created_at,a.name author_name,a.id author_id,l.title
 FROM reviews r JOIN users a ON a.id=r.author_id JOIN transactions t ON t.id=r.transaction_id JOIN listings l ON l.id=t.listing_id
 WHERE target_id=$1 ORDER BY r.created_at DESC LIMIT 50`,
    [id],
  );
  const listings = await all(
    db,
    `${LISTING_SELECT} WHERE l.owner_id=$1 AND l.status='active' ORDER BY l.created_at DESC LIMIT 60`,
    [id],
  );
  return {
    ...profile,
    reviews,
    listings,
    badge:
      profile.review_count >= 5 && profile.rating >= 4.5
        ? 'Được cộng đồng đánh giá cao'
        : profile.review_count
          ? 'Đã có đánh giá giao dịch'
          : 'Thành viên mới',
  };
}
