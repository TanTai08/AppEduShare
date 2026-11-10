# Biên bản kiểm thử phiên bản 1.0

Ngày: **10/11/2026**. Môi trường: Linux, Node **24.22.1**, npm **11.9.0**, Expo **54.0.38**, React Native **0.81.5**. Đây là kết quả chạy trong môi trường phát triển của phiên làm việc; cần chạy lại trên máy nộp bài.

## Kiểm tra tự động

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | Đạt, không có lỗi TypeScript |
| `npm test` | **11/11 nhóm test đạt** |
| `npm run build:web` | Đạt, Expo export tạo bundle web |
| `npm run check` | Đạt cả ba bước trên |

API tests dùng database trong bộ nhớ và server HTTP trên cổng tạm. Không yêu cầu seed hoặc server đang chạy. Mỗi nhóm có nhiều assertion; không đồng nhất số nhóm với số request/assertion.

1. Health check và kết nối DB.
2. Đăng ký, email trùng, băm mật khẩu, login, logout thu hồi phiên.
3. Payload sai, chặn tự nâng quyền, endpoint admin và limit sai.
4. Tìm kiếm xử lý `%`, `_`, `!` và chuỗi SQL như dữ liệu thường.
5. Quyền sở hữu, sửa hồ sơ, lọc, sửa/ẩn tin và yêu thích.
6. Mua: tự mua, yêu cầu trùng, quyền chat, xác nhận hai phía, đánh giá.
7. Hai yêu cầu chấp nhận cạnh tranh: chỉ một giữ được tài liệu, người còn lại nhận thông báo.
8. Đổi: xác thực tài liệu đề nghị, giữ chỗ và giải phóng cả hai tài liệu.
9. Chấp nhận đổi hủy yêu cầu pending giao nhau ở phía tài liệu được đề nghị.
10. Admin: ẩn tin hủy giao dịch, trả tài liệu còn lại, khóa tự hiện và xử lý báo cáo.
11. Thông báo cách ly theo người nhận và từ chối phiên hết hạn.

## Kiểm thử trình duyệt

Chromium headless, hai browser context độc lập, frontend web build thật và API dùng dữ liệu mẫu cục bộ:

- Trang chủ tải đủ 8 tài liệu mẫu; không có JavaScript `pageerror`.
- Kiểm tra bố cục desktop **1440×1050** và mobile web **390×844**.
- Đăng nhập Minh Anh và Hoàng Nam ở hai phiên khác nhau.
- Tìm “Cơ sở dữ liệu”, mở chi tiết, gửi yêu cầu mua và chấp nhận.
- Gửi tin nhắn từ người mua; người bán thấy tin qua giao diện chat.
- Người mua xác nhận trước: giao dịch vẫn chờ phía còn lại.
- Người bán xác nhận: hoàn thành; người mua gửi đánh giá và thấy trạng thái đã đánh giá.
- Không ghi nhận pageerror trong luồng trên.

Ảnh kết quả nằm trong `docs/images/`. Script browser được dùng trong phiên kiểm chứng; kiểm thử browser chưa tích hợp vào GitHub Actions. Kịch bản thao tác bằng tay có trong KICH_BAN_DEMO.md.

## Kiểm tra phụ thuộc

`npm audit --omit=dev` tại thời điểm kiểm tra báo **14 advisory: 2 high, 11 moderate, 1 low, 0 critical**. Các high nằm ở dependency công cụ build: `image-size` dùng bởi Metro và `postcss` dùng bởi Expo Metro config. Những package Expo CLI/config liên quan tạo thêm advisory bắc cầu. Đây không phải bằng chứng API bị khai thác, cũng không phải chứng nhận an toàn.

Ứng dụng hiện không nhận tải ảnh/CSS từ người dùng. Chỉ build từ mã nguồn và tài nguyên tin cậy; không mở Metro dev server ra Internet. Cần nâng Expo/Metro đồng bộ hoặc áp dụng bản vá tương thích rồi kiểm thử web/native trước khi vận hành công khai. Không dùng `npm audit fix --force` để tự hạ/nâng SDK mà chưa kiểm tra tương thích. Rà soát lại advisory theo lockfile ở thời điểm triển khai.

## Chưa kiểm chứng

- Android/iOS trên emulator hoặc thiết bị thật, APK/IPA có chữ ký.
- Hiệu năng tải lớn, nhiều API instance, khả năng chịu tải mạng chậm dài hạn.
- Đánh giá accessibility toàn diện và bảo mật độc lập.
- CI trên GitHub cho đến khi workflow chạy xong; xem tab Actions để biết trạng thái thực tế.
- Thanh toán, file số, email xác minh/reset và push notification vì chưa có trong phạm vi.

Kết quả không thay thế nghiệm thu trên thiết bị và môi trường thực tế của người dùng.
