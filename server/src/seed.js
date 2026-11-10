import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openDb, atomic, one } from './db.js';
import { migrate } from './migrate.js';
import { hashPassword } from './auth.js';
export async function seed(pool) {
  await migrate(pool);
  const hash = await hashPassword('EduShare123!');
  await atomic(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(208811,3)');
    const users = [
      ['Minh Anh', 'anh@edushare.local', 'student', 'VKU'],
      ['Hoàng Nam', 'nam@edushare.local', 'student', 'Đại học Bách khoa Đà Nẵng'],
      ['Quản trị viên', 'admin@edushare.local', 'admin', 'VKU'],
    ];
    for (const [name, email, role, school] of users) {
      const existing = await one(db, 'SELECT id FROM users WHERE lower(email)=lower($1)', [email]);
      if (existing) continue;
      const id = randomUUID();
      await db.query(
        'INSERT INTO users(id,name,email,password_hash,school,area,role,points,bio) VALUES($1,$2,$3,$4,$5,$6,$7,20,$8)',
        [
          id,
          name,
          email,
          hash,
          school,
          'Đà Nẵng',
          role,
          'Thích chia sẻ những cuốn sách hữu ích với cộng đồng sinh viên.',
        ],
      );
      await db.query(
        "INSERT INTO point_ledger(id,user_id,reason,delta,balance_after,note) VALUES($1,$2,'demo',20,20,'Điểm mẫu để trình diễn; không áp dụng cho đăng ký thật')",
        [randomUUID(), id],
      );
    }
    if ((await one(db, 'SELECT count(*)::int n FROM listings')).n > 0) return;
    const anh = (await one(db, 'SELECT id FROM users WHERE email=$1', [users[0][1]])).id;
    const nam = (await one(db, 'SELECT id FROM users WHERE email=$1', [users[1][1]])).id;
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

    for (const [owner, title, subject, kind, price, description, condition] of books) {
      const isAnh = owner === anh;
      await db.query(
        'INSERT INTO listings(id,owner_id,title,subject,kind,price,point_cost,description,condition,school,area,pickup_label,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
        [
          randomUUID(),
          owner,
          title,
          subject,
          kind,
          price,
          kind === 'free' ? 20 : 0,
          description,
          condition,
          isAnh ? 'VKU' : 'Đại học Bách khoa Đà Nẵng',
          'Đà Nẵng',
          isAnh ? 'Điểm hẹn mẫu — cổng trường VKU' : 'Điểm hẹn mẫu — cổng trường Bách khoa',
          isAnh ? 15.975 : 16.074,
          isAnh ? 108.252 : 108.15,
        ],
      );
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  try {
    await seed(db);
    console.log(
      'Dữ liệu mẫu PostgreSQL đã sẵn sàng. Tài khoản demo có 20 điểm mẫu; tài khoản đăng ký mới có 0 điểm.',
    );
  } finally {
    await db.end();
  }
}
