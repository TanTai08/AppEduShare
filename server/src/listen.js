export function listenApi(server, port, host) {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    return Promise.reject(new Error('PORT phải là số nguyên từ 1 đến 65535.'));
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server.address());
    };
    server.once('error', onError);
    server.once('listening', onListening);
    try {
      server.listen(port, host);
    } catch (error) {
      server.off('error', onError);
      server.off('listening', onListening);
      reject(error);
    }
  });
}
export function startupMessage(error, port) {
  if (error.code === 'EADDRINUSE')
    return `Cổng ${port} đang có tiến trình sử dụng. Không bật thêm API thứ hai. Mở http://localhost:${port}/api/health; nếu cần khởi động lại, dừng đúng terminal API cũ bằng Ctrl+C rồi chạy npm run api. Không tắt tất cả tiến trình Node.`;
  if (error.code === 'EACCES')
    return `Không có quyền mở cổng ${port}. Kiểm tra PORT trong server/.env hoặc tiến trình đang giữ cổng.`;
  return 'Không khởi động được API. ' + (error.message || 'Kiểm tra PORT/HOST trong server/.env.');
}
