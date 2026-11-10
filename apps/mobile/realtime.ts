import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL, getToken, User } from './api';
export function useRealtime(user: User | null) {
  const [socket, setSocket] = useState<Socket | null>(null),
    [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!user || !API_URL) {
      setSocket(null);
      setConnected(false);
      return;
    }
    const connection = io(API_URL, {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    setSocket(connection);
    connection.on('connect', () => setConnected(true));
    connection.on('disconnect', () => setConnected(false));
    connection.on('connect_error', () => setConnected(false));
    return () => {
      connection.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user?.id]);
  return { socket, connected };
}
