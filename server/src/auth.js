import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(':');
  const hash = await scrypt(password, salt, 64);
  return timingSafeEqual(hash, Buffer.from(hex, 'hex'));
}
export const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
export function session(db, user) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(
    tokenHash(token),
    user.id,
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  );
  const { password_hash, ...safe } = user;
  return { token, user: safe };
}
