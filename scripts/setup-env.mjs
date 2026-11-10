import { copyFileSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
for (const folder of ['server', 'apps/mobile']) {
  const destination = fileURLToPath(new URL(`../${folder}/.env`, import.meta.url));
  try {
    copyFileSync(destination + '.example', destination, constants.COPYFILE_EXCL);
    console.log(`Đã tạo ${folder}/.env từ mẫu.`);
  } catch (error) {
    if (error.code === 'EEXIST') console.log(`Giữ ${folder}/.env hiện có (không ghi đè).`);
    else throw error;
  }
}
console.log(
  'Frontend dùng API auto trong phát triển. Nếu điện thoại thật không nhận IP LAN, cấu hình apps/mobile/.env.',
);
