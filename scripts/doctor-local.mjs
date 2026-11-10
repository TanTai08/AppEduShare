import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (relative) => {
  const path = root + relative;
  if (!existsSync(path)) return null;
  try {
    return parseEnv(readFileSync(path, 'utf8'));
  } catch {
    console.log(`Không đọc được ${relative}. Kiểm tra cú pháp .env.`);
    return null;
  }
};
const backend = read('server/.env') || {};
console.log('EduShare — kiểm tra cấu hình cục bộ (không in mật khẩu/token)');
console.log(
  'server/.env:',
  existsSync(root + 'server/.env') ? 'có' : 'chưa có; dùng mặc định local',
);
if (backend.EXPO_PUBLIC_API_URL)
  console.log(
    'LƯU Ý: EXPO_PUBLIC_API_URL trong server/.env không cấu hình frontend. Sửa apps/mobile/.env hoặc dùng auto.',
  );
const environment = process.env.NODE_ENV || 'development';
const client = {};
for (const file of ['.env', `.env.${environment}`, '.env.local', `.env.${environment}.local`]) {
  const data = read('apps/mobile/' + file);
  if (data) {
    Object.assign(client, data);
    console.log('Expo đọc: apps/mobile/' + file);
  }
}
const keys = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_API_URL_ANDROID',
  'EXPO_PUBLIC_API_URL_IOS',
  'EXPO_PUBLIC_API_URL_WEB',
  'EXPO_PUBLIC_API_PORT',
];
for (const key of keys) {
  const value = process.env[key] ?? client[key];
  if (!value) continue;
  let label = 'cấu hình riêng/không hợp lệ (đã ẩn)';
  if (value === 'auto' || /^\d+$/.test(value)) label = value;
  else
    try {
      const u = new URL(value);
      if (
        ['http:', 'https:'].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash
      )
        label = u.origin + u.pathname;
    } catch {}
  console.log(key + ' = ' + label);
}
console.log(
  'Mặc định auto: web dùng host trình duyệt, Android Emulator dùng 10.0.2.2, điện thoại thật dùng host LAN của Metro.',
);
console.log(
  'Nếu .env.local hoặc biến môi trường đang ghi đè .env, hãy sửa đúng nguồn rồi khởi động lại Expo với --clear.',
);
const port = process.env.PORT || backend.PORT || '4000';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.log('PORT backend không hợp lệ.');
  process.exitCode = 1;
} else {
  const url = `http://localhost:${port}/api/health`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    if (response.ok && data.ok === true && data.database === 1 && data.engine === 'postgresql')
      console.log('API + PostgreSQL hoạt động:', url);
    else {
      console.log('Cổng API có phản hồi nhưng chưa phải EduShare PostgreSQL mới:', url);
      process.exitCode = 1;
    }
  } catch {
    console.log(
      'Không kiểm tra được API tại ' +
        url +
        '. Chạy npm run api ở terminal khác; nếu EADDRINUSE, kiểm tra API cũ trước khi bật thêm.',
    );
    process.exitCode = 1;
  }
}
