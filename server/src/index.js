import { openDb } from './db.js';
import { migrate } from './migrate.js';
import { createHttpServer } from './realtime.js';
const db = openDb();
try {
  await migrate(db);
} catch (e) {
  console.error(
    'Không kết nối/khởi tạo được PostgreSQL. Kiểm tra DATABASE_URL và chạy npm run db:up.',
  );
  await db.end();
  process.exit(1);
}
const { server, io } = createHttpServer(db);
const port = Number(process.env.PORT || 4000);
server.listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(`EduShare API + realtime: http://localhost:${port}/api/health (PostgreSQL)`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    io.close(() =>
      server.close(async () => {
        await db.end();
        process.exit(0);
      }),
    );
  });
