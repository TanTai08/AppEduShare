import { openDb } from './db.js';
import { createApp } from './app.js';
const db = openDb();
const port = Number(process.env.PORT || 4000);
const server = createApp(db).listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(`EduShare API: http://localhost:${port}/api/health`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
