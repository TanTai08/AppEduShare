import { randomUUID } from 'node:crypto';
import { openDb, atomic } from './db.js';
import { hashPassword } from './auth.js';
const db = openDb();
const users = [
  ['Minh Anh', 'anh@edushare.local', 'student', 'VKU'],
  ['Hoàng Nam', 'nam@edushare.local', 'student', 'Đại học Bách khoa Đà Nẵng'],
  ['Quản trị viên', 'admin@edushare.local', 'admin', 'VKU'],
];
const hash = await hashPassword('EduShare123!');
atomic(db, () => {
  for (const [name, email, role, school] of users)
    db.prepare(
      'INSERT OR IGNORE INTO users(id,name,email,password_hash,school,area,role) VALUES (?,?,?,?,?,?,?)',
    ).run(randomUUID(), name, email, hash, school, 'Đà Nẵng', role);
  if (db.prepare('SELECT count(*) n FROM listings').get().n === 0) {
    const anh = db.prepare('SELECT id FROM users WHERE email=?').get(users[0][1]).id;
    const nam = db.prepare('SELECT id FROM users WHERE email=?').get(users[1][1]).id;
    const books = [
      [
        nam,
        'Giáo trình Cấu trúc dữ liệu & Giải thuật',
        'CNTT',
        'sell',
        65000,
        'Giáo trình bản in, có ghi chú các bài tập quan trọng. Hẹn giao tại thư viện trường.',
        'Như mới',
      ],
      [
        nam,
        'Giải tích 1 — Tuyển tập bài tập',
        'Toán học',
        'sell',
        45000,
        'Tuyển tập bài tập giải tích dùng cho học kỳ đầu. Sách còn đầy đủ trang.',
        'Đã sử dụng',
      ],
      [
        nam,
        'Tiếng Anh B1 — Sách luyện thi',
        'Ngoại ngữ',
        'exchange',
        0,
        'Muốn đổi lấy sách tiếng Anh giao tiếp hoặc sách kỹ năng học tập.',
        'Như mới',
      ],
      [
        anh,
        'Nhập môn Lập trình Python',
        'CNTT',
        'exchange',
        0,
        'Sách nhập môn lập trình. Muốn đổi lấy tài liệu tiếng Anh B1.',
        'Như mới',
      ],
      [
        anh,
        'Giáo trình Kinh tế vi mô',
        'Kinh tế',
        'free',
        0,
        'Tặng lại giáo trình cho bạn sinh viên cần học môn kinh tế. Nhận trực tiếp.',
        'Đã sử dụng',
      ],
      [
        nam,
        'Cơ sở dữ liệu — Mô hình & SQL',
        'CNTT',
        'sell',
        70000,
        'Tài liệu thực hành SQL và mô hình quan hệ, sách gốc đã qua sử dụng.',
        'Như mới',
      ],
      [
        anh,
        'Xác suất thống kê ứng dụng',
        'Toán học',
        'sell',
        40000,
        'Sách có ví dụ thống kê ứng dụng và các bài tập ôn thi cuối kỳ.',
        'Đã sử dụng',
      ],
      [
        nam,
        'Mạng máy tính căn bản',
        'CNTT',
        'free',
        0,
        'Tặng sách cũ còn dùng tốt, ưu tiên các bạn sinh viên năm hai.',
        'Đã sử dụng',
      ],
    ];
    for (const [owner, title, subject, kind, price, description, condition] of books)
      db.prepare(
        'INSERT INTO listings(id,owner_id,title,subject,kind,price,description,condition,school,area) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        randomUUID(),
        owner,
        title,
        subject,
        kind,
        price,
        description,
        condition,
        owner === anh ? 'VKU' : 'Đại học Bách khoa Đà Nẵng',
        'Đà Nẵng',
      );
  }
});
db.close();
console.log(
  'Dữ liệu demo đã sẵn sàng (không ghi đè dữ liệu hiện có). Xem tài khoản demo trong README.',
);
