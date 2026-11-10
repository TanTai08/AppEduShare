# Trạng thái EduShare 2 và lộ trình

## Đã hiện thực

- PostgreSQL: schema có version, pool, transactions, prepared queries, compose local và import SQLite chỉ đọc.
- Socket.IO: xác thực, room riêng, chat trước mua, typing, unread, cursor, idempotency, reconnect/catch-up.
- Điểm: +10 mỗi bên cho completed sell; 20 nhận free; trừ ở accept, refund khi hủy, sổ điểm, unique và cap/cooldown.
- Bản đồ: Leaflet đóng gói, pin, tọa độ thủ công, điểm hẹn công khai, link chỉ đường, attribution.
- Hồ sơ public: bio, sao, nhận xét theo giao dịch, số lần hoàn thành; ẩn dữ liệu riêng tư.
- Hỗ trợ: FAQ, phiếu riêng, admin reply/resolve.
- UI: hộp thư, ví, lối tắt, nút hỗ trợ, safe area và điều hướng mobile.

## Việc người dùng cần thực hiện để chạy bản mới

1. Cập nhật Git, npm ci; mở Docker Desktop hoặc PostgreSQL native.
2. Thêm DATABASE_URL vào server/.env. Chọn import dữ liệu cũ hoặc seed database mới.
3. Giữ EXPO_PUBLIC_API_URL theo thiết bị, chạy API và Expo, kiểm tra health.
4. Nghiệm thu trên iPhone/Android: safe area, bàn phím, Socket.IO reconnect, WebView map và quyền mạng.
5. Chọn tile provider được phép và cấu hình attribution/quota nếu OpenStreetMap công cộng không phù hợp.
6. Điền thông tin cá nhân/giảng viên, cập nhật kết quả chạy trên máy trong báo cáo.

## Phát triển sau phiên bản này

| Ưu tiên | Hạng mục                           | Tiêu chí nghiệm thu                                                             |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| P1      | Email xác minh/reset, đổi mật khẩu | Token dùng một lần, hết hạn, giới hạn gửi                                       |
| P1      | Ảnh thật                           | Kiểm tra MIME/signature/dung lượng, lưu trữ có phân quyền                       |
| P1      | Chống gian lận điểm                | Theo dõi bất thường, giới hạn tài khoản và quy trình tranh chấp                 |
| P1      | Đo tải PostgreSQL                  | Giảm phạm vi advisory lock khi có số liệu, giữ bất biến bằng test nhiều kết nối |
| P1      | Nhiều Node instances               | Socket.IO Redis adapter, invalidation phiên trên mọi instance                   |
| P2      | Push khi app đóng                  | Token thiết bị, tùy chọn nhận, retry/idempotency                                |
| P2      | Bot AI có căn cứ                   | RAG từ tài liệu trợ giúp, kiểm soát dữ liệu, fallback và đánh giá câu trả lời   |
| P2      | Danh mục chuẩn/tìm không dấu       | Danh mục trường/môn, chỉ mục phù hợp                                            |
| P3      | Thanh toán/file số                 | Quyền phân phối, webhook xác minh, hoàn tiền, truy cập file riêng tư            |

Không gọi các hạng mục trong bảng này là đã có. Đo tải, bảo mật độc lập và nghiệm thu native vẫn là bước triển khai thực tế.
