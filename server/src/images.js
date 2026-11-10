import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { one, all } from './db.js';
import { businessLock, fail } from './domain.js';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_IMAGE_BYTES / 3);
export async function prepareImage(base64) {
  if (typeof base64 !== 'string' || !base64.length || base64.length > MAX_BASE64_LENGTH)
    fail(413, 'Ảnh tối đa 5 MB.');
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
    fail(400, 'Dữ liệu ảnh base64 không hợp lệ.');
  const input = Buffer.from(base64, 'base64');
  if (!input.length || input.length > MAX_IMAGE_BYTES) fail(413, 'Ảnh tối đa 5 MB.');
  const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255;
  const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP';
  if (!jpeg && !png && !webp)
    fail(400, 'Chỉ hỗ trợ JPG, PNG hoặc WebP, không nhận SVG hoặc file giả ảnh.');
  let metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: 25000000, failOn: 'warning' }).metadata();
  } catch {
    fail(400, 'Không đọc được ảnh. Chọn JPG, PNG hoặc WebP hợp lệ, tối đa 25 megapixel.');
  }
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.pages > 1)
    fail(400, 'Chỉ hỗ trợ ảnh tĩnh JPG, PNG hoặc WebP.');
  try {
    // Decode and re-encode: normalize orientation, strip EXIF/GPS, discard trailing payloads.
    const full = await sharp(input, { limitInputPixels: 25000000, failOn: 'warning' })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(full.data)
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    if (full.data.length > 2 * 1024 * 1024 || thumbnail.length > 262144)
      fail(413, 'Ảnh sau nén vẫn quá lớn. Hãy chọn ảnh nhỏ hơn.');
    return { data: full.data, thumbnail, width: full.info.width, height: full.info.height };
  } catch (e) {
    if (e.status) throw e;
    fail(400, 'Ảnh bị hỏng hoặc không thể xử lý. Hãy chọn ảnh khác.');
  }
}
export async function storeImage(db, user, image) {
  await businessLock(db);
  await db.query(
    "DELETE FROM listing_images WHERE listing_id IS NULL AND created_at<now()-interval '24 hours'",
  );
  const pending = await one(
    db,
    'SELECT count(*)::int n FROM listing_images WHERE owner_id=$1 AND listing_id IS NULL',
    [user],
  );
  if (pending.n >= 20) fail(429, 'Bạn có quá nhiều ảnh chưa đăng. Xóa ảnh nháp hoặc thử lại sau.');
  return one(
    db,
    "INSERT INTO listing_images(id,owner_id,width,height,data,thumbnail) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,width,height,'/api/images/'||id AS url",
    [randomUUID(), user, image.width, image.height, image.data, image.thumbnail],
  );
}
export async function bindImages(db, user, listingId, imageIds) {
  if (imageIds === undefined) return; // Old clients editing text preserve existing photos.
  const selected = await all(
    db,
    'SELECT id,owner_id,listing_id FROM listing_images WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [imageIds],
  );
  if (selected.length !== imageIds.length)
    fail(400, 'Một ảnh không còn tồn tại. Vui lòng chọn và tải lại.');
  if (selected.some((i) => i.owner_id !== user || (i.listing_id && i.listing_id !== listingId)))
    fail(403, 'Bạn không được sử dụng ảnh của người khác hoặc ảnh thuộc tin khác.');
  await db.query('DELETE FROM listing_images WHERE listing_id=$1 AND NOT(id=ANY($2::uuid[]))', [
    listingId,
    imageIds,
  ]);
  // Clear positions before reordering to avoid unique-index collisions.
  await db.query('UPDATE listing_images SET listing_id=NULL,position=0 WHERE listing_id=$1', [
    listingId,
  ]);
  for (let index = 0; index < imageIds.length; index++)
    await db.query('UPDATE listing_images SET listing_id=$1,position=$2 WHERE id=$3', [
      listingId,
      index,
      imageIds[index],
    ]);
}
