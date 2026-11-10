# Kịch bản chạy và bảo vệ đồ án (10–15 phút)

## Chuẩn bị

1. Cài Node 24; mở thư mục gốc trong VS Code.
2. `npm ci`, tạo hai file `.env` theo README.
3. `npm run db:seed` và `npm run dev`.
4. Mở localhost:8081 trong hai cửa sổ trình duyệt có phiên độc lập (thường + ẩn danh). Token web lưu trong sessionStorage, nên đăng nhập theo từng cửa sổ.
5. Đọc tên tài khoản demo trong README. Không dùng thông tin thật trong buổi trình diễn.

## Phần 1 — Khám phá (2 phút)

- Giới thiệu bài toán: tài liệu đã dùng còn giá trị, sinh viên cần tìm theo khu vực/trường.
- Tìm “Cơ sở dữ liệu”, lọc CNTT qua từ khóa, lọc Đà Nẵng và mua bán.
- Mở chi tiết; chỉ rõ ảnh bìa là hình minh họa, giá, tình trạng và người đăng.
- Thu nhỏ cửa sổ để trình diễn bố cục responsive. Không gọi đây là bằng chứng đã kiểm thử trên Android/iOS.

## Phần 2 — Mua tài liệu (4 phút)

1. Cửa sổ A: đăng nhập Minh Anh, chọn sách bán của Hoàng Nam, gửi lời nhắn và yêu cầu mua.
2. Cửa sổ B: đăng nhập Hoàng Nam, mở Giao dịch và chấp nhận.
3. Hai bên mở Tin nhắn; gửi địa điểm và thời gian hẹn. Tin tự cập nhật trong khoảng 4 giây.
4. Minh Anh xác nhận giao nhận: trạng thái vẫn đang giao nhận.
5. Hoàng Nam xác nhận: giao dịch mới hoàn thành.
6. Minh Anh đánh giá 5 sao; không thể gửi đánh giá lần hai.

Giải thích: đây là xác nhận giữa hai người, hệ thống không xác thực việc thanh toán hoặc giao hàng ngoài đời.

## Phần 3 — Trao đổi (3 phút)

- Minh Anh mở sách Tiếng Anh B1 của Hoàng Nam, chọn sách Python của mình để đề nghị đổi.
- Hoàng Nam chấp nhận: cả hai tin được giữ chỗ.
- Hủy để minh họa giải phóng cả hai tin, hoặc xác nhận hai bên để hoàn tất đổi.
- Nếu dữ liệu đã giao dịch ở buổi trước, đăng thêm hai tin mới, hình thức Trao đổi.

## Phần 4 — Quản trị (2 phút)

- Tài khoản sinh viên báo cáo một tin với lý do cụ thể.
- Đăng nhập admin, mở Quản trị, xem báo cáo.
- Ẩn tin; đánh dấu báo cáo đã xử lý.
- Chủ tin không thể tự hiện lại tin bị khóa.

## Phần 5 — Giải thích kỹ thuật (2 phút)

- Mở sơ đồ ERD, `schema.sql` và bài test cạnh tranh giữ chỗ.
- Chạy `npm test` để trình diễn kết quả thực tế.
- Mở GitHub Actions và lịch sử commit.
- Nêu giới hạn: SQLite một API instance, chat polling, chưa thanh toán/file số/email xác minh, chưa nghiệm thu native.

## Câu hỏi thường gặp

**Vì sao không Firebase?** Dữ liệu giao dịch có quan hệ rõ và cần cập nhật nguyên tử; SQL giúp mô hình hóa ràng buộc và báo cáo. SQLite giảm bước cài đặt khi chấm đồ án.

**Ngăn bán trùng như thế nào?** Kiểm tra trạng thái và giữ chỗ nằm trong `BEGIN IMMEDIATE`; các yêu cầu xung đột bị hủy trong cùng transaction.

**React có phải reactive programming không?** React cập nhật UI theo state; React Native là framework giao diện. Dự án không triển khai RxJS hay reactive streams phía server, nên không đồng nhất các khái niệm này.

**Có thể mở rộng nhiều trường không?** Đã có trường/khu vực dạng chuỗi. Bước tiếp theo là chuẩn hóa danh mục, xác minh sinh viên, nâng PostgreSQL và vận hành bảo mật.
