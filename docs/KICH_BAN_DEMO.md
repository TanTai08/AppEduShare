# Kịch bản bảo vệ EduShare 2 (15–20 phút)

## Chuẩn bị

PostgreSQL healthy, `npm ci`, `npm run db:seed` cho database demo mới, API và Expo/web đang chạy. Không seed vào database chứa dữ liệu thật. Mở ba phiên trình duyệt độc lập cho Minh Anh, Hoàng Nam và admin. Tài khoản/mật khẩu trong README. Mỗi demo account mới có 20 điểm mẫu, đăng ký mới có 0 điểm.

## 1. Khám phá và hỏi trước khi mua

- Minh Anh tìm một cuốn sách bán của Hoàng Nam, mở chi tiết và xem hồ sơ/sao.
- Nhấn **Nhắn người bán** trước khi gửi bất kỳ yêu cầu mua nào.
- Hoàng Nam mở **Tin nhắn**, xem người hỏi và trả lời.
- Minh Anh nhìn thấy câu trả lời ngay, không nhấn làm mới. Nêu rõ Socket.IO phát sau khi DB lưu tin.
- Tắt/kết nối lại mạng có kiểm soát để kiểm tra trạng thái kết nối; dùng Đồng bộ lịch sử nếu cần. Không tuyên bố hỗ trợ gửi ngoại tuyến tự động.

## 2. Mua, hoàn thành và điểm

- Minh Anh gửi yêu cầu mua. Hoàng Nam chấp nhận.
- Minh Anh xác nhận giao nhận: chưa hoàn thành.
- Hoàng Nam xác nhận: hoàn thành và mỗi bên +10 điểm (nếu chưa chạm giới hạn thưởng).
- Mở Ví điểm: từ 20 điểm mẫu lên 30, có dòng thưởng và số dư sau từng thay đổi.
- Minh Anh đánh giá 5 sao, ghi nhận xét. Mở hồ sơ Hoàng Nam để xem số sao và giao dịch.

## 3. Nhận sách bằng điểm và hoàn điểm

- Minh Anh yêu cầu sách free của Hoàng Nam, giá 0đ, phí nhận 20 điểm.
- Khi người đăng chấp nhận: số dư giảm 20; sách được giữ chỗ.
- Hủy trước xác nhận: hoàn 20 điểm đúng một lần, tin trở lại active.
- Có thể dùng tài khoản mới 0 điểm để minh họa accept bị từ chối, không làm mất sách/điểm.

## 4. Ghim và chỉ đường

- Hoàng Nam đăng sách, nhập tên điểm hẹn công khai.
- Chạm bản đồ ghim, kiểm tra lat/lon đổi, lưu tin.
- Mở chi tiết, thấy điểm hẹn và nhấn Chỉ đường để mở bản đồ ngoài.
- Tiles cần Internet/nhà cung cấp cho phép. Nếu bị giới hạn, trình diễn nhập tọa độ và chỉ đường; báo đúng điều kiện kiểm thử, không coi ảnh nền lỗi là bản đồ đã nghiệm thu.

## 5. Hỗ trợ và quản trị

- Nhấn nút Hỗ trợ, hỏi cách nhận điểm. Giải thích đây là FAQ, chưa dùng LLM.
- Tạo phiếu riêng. Admin mở Hỗ trợ, trả lời phiếu; chủ phiếu nhận cập nhật khi đang kết nối.
- Admin đóng phiếu, không gửi thêm vào phiếu đã đóng.
- Báo cáo/ẩn một tin khác; nếu đang giữ chỗ free, kiểm tra hoàn điểm và audit log.

## 6. Giải thích kỹ thuật

- Mở ERD và pgAdmin: conversations khác transactions, point_ledger khác số dư tổng hợp.
- Chạy npm test, chỉ ra test cạnh tranh giữ chỗ, không đủ điểm, refund một lần, quyền socket và import.
- Mở GitHub Actions, trình bày kết quả thực tế.
- Nêu giới hạn: giao nhận/thanh toán ngoài đời chưa được xác thực; chống tích điểm giả còn cơ bản; một Node instance; chưa nghiệm thu native đầy đủ.

## Dữ liệu cũ

Demo import ở database PostgreSQL rỗng riêng, không dùng bản đã seed. Giữ file SQLite nguồn và kiểm tra đăng nhập/chat sau chuyển đổi. Import lần hai bị từ chối để tránh nhân đôi dữ liệu.
