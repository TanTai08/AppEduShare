# Lộ trình hoàn thiện và nghiệm thu

## Những bước đã có trong repository

| Bước              | Sản phẩm bàn giao                                                     |
| ----------------- | --------------------------------------------------------------------- |
| Phân tích yêu cầu | Phạm vi, tác nhân, quy tắc nghiệp vụ trong báo cáo                    |
| Thiết kế          | Sơ đồ kiến trúc, ERD, vòng đời giao dịch                              |
| Database          | SQL có khóa ngoại, index, kiểm tra và seed idempotent                 |
| Backend           | API xác thực, tin đăng, giao dịch, tin nhắn, đánh giá, quản trị       |
| Frontend          | React Native/Expo với bố cục desktop và điện thoại                    |
| Kiểm thử          | Test tích hợp HTTP, typecheck và web build; kết quả trong KIEM_THU.md |
| Tài liệu          | Hướng dẫn VS Code, API, database, kịch bản bảo vệ                     |
| Quản lý mã        | GitHub, lockfile npm và workflow CI                                   |

## Việc người nộp cần thực hiện

1. Điền trường/khoa, họ tên, mã sinh viên, lớp, giảng viên và học kỳ trong báo cáo.
2. Chạy trên máy của mình theo README, chụp kết quả thực tế; không dùng số liệu kiểm thử giả lập như số liệu người dùng thật.
3. Chạy Android Emulator hoặc thiết bị Android; kiểm thử iOS nếu có macOS/Xcode. Ghi model thiết bị, hệ điều hành và kết quả.
4. Rà soát format báo cáo theo mẫu của trường, bổ sung nhận xét và phần công việc cá nhân thực tế.
5. Thực hiện kịch bản demo; tạo slide từ đề cương đã cung cấp.

## Mở rộng sau MVP

| Ưu tiên | Hạng mục                           | Tiêu chí hoàn thành                                             |
| ------- | ---------------------------------- | --------------------------------------------------------------- |
| P1      | Xác minh email, đổi/reset mật khẩu | Token một lần có hạn dùng, email thử nghiệm và giới hạn gửi     |
| P1      | Tải ảnh thật                       | Kiểm tra MIME/chữ ký file, giới hạn dung lượng, xóa ảnh mồ côi  |
| P1      | Audit log và quản lý tài khoản     | Ghi người thao tác, thời điểm, lý do; quy trình khóa/mở rõ ràng |
| P1      | Trang hóa dữ liệu                  | Cursor cho chat, tải thêm tin, chỉ số không bỏ sót/trùng        |
| P1      | Kiểm thử native                    | Luồng chính trên Android/iOS, bàn phím, safe area, mạng yếu     |
| P2      | PostgreSQL và nhiều API instance   | Migration, row locks, kiểm thử cạnh tranh và khôi phục backup   |
| P2      | WebSocket/SSE                      | Xác thực kênh riêng, reconnect, chống gửi trùng                 |
| P2      | Thông báo đẩy                      | Quyền thiết bị, token push, tùy chọn nhận thông báo             |
| P2      | Danh mục trường/môn chuẩn hóa      | Khóa ngoại, tìm kiếm không dấu và gợi ý nhập                    |
| P3      | File số hợp pháp                   | Quyền phân phối, file riêng tư, URL ký hạn dùng, thu hồi quyền  |
| P3      | Thanh toán trực tuyến              | Sandbox gateway, webhook xác minh, idempotency, hoàn tiền       |
| P3      | Giao vận và khoảng cách            | Quyền vị trí, điểm hẹn công khai, bảo vệ địa chỉ cá nhân        |

Thời gian ước lượng bản mở rộng phải được lập sau khi chốt nhóm, ngân sách và yêu cầu nghiệm thu; không xem các hạng mục trên là đã triển khai.
