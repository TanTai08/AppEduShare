import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp, findSession, allowedOrigins } from './app.js';
import { tokenHash } from './auth.js';
import { participant } from './domain.js';
import { socketOriginAllowed } from './socket-origin.js';
export function createHttpServer(db, { rateLimits = true } = {}) {
  let io;
  const events = (e) => {
    if (e.event === 'session:revoked') {
      for (const socket of io.sockets.sockets.values())
        if (socket.data.tokenHash === e.data.token_hash) socket.disconnect(true);
      return;
    }
    let target = io;
    for (const u of e.users) target = target.to('user:' + u);
    if (e.admins) target = target.to('admins');
    target.emit(e.event, e.data);
  };
  const server = createServer(createApp(db, { rateLimits, events }));
  io = new Server(server, {
    maxHttpBufferSize: 16384,
    cors: { origin: allowedOrigins() },
    allowRequest: (req, cb) => cb(null, socketOriginAllowed(req, allowedOrigins())),
  });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const user = typeof token === 'string' && (await findSession(db, token));
      if (!user) return next(new Error('Vui lòng đăng nhập lại.'));
      socket.data.user = user;
      socket.data.token = token;
      socket.data.tokenHash = tokenHash(token);
      next();
    } catch {
      next(new Error('Không thể xác thực kết nối.'));
    }
  });
  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join('user:' + user.id);
    if (user.role === 'admin') socket.join('admins');
    let lastTyping = 0;
    socket.on('typing', async (data) => {
      if (Date.now() - lastTyping < 1000) return;
      lastTyping = Date.now();
      try {
        if (
          !data ||
          typeof data.conversation_id !== 'string' ||
          !(await findSession(db, socket.data.token))
        )
          return;
        const c = await participant(db, data.conversation_id, user);
        socket
          .to('user:' + (c.buyer_id === user.id ? c.seller_id : c.buyer_id))
          .emit('typing', { conversation_id: c.id, name: user.name });
      } catch {
        /* Never broadcast unauthorized typing events. */
      }
    });
  });
  const timer = setInterval(async () => {
    for (const socket of io.sockets.sockets.values()) {
      try {
        if (!(await findSession(db, socket.data.token))) socket.disconnect(true);
      } catch {
        socket.disconnect(true);
      }
    }
  }, 30000);
  timer.unref();
  server.on('close', () => clearInterval(timer));
  return { server, io, events };
}
