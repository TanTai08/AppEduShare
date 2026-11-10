# API EduShare

Base URL cục bộ: `http://localhost:4000/api`. Request/response dùng JSON UTF-8. Các endpoint riêng tư yêu cầu header `Authorization: Bearer <token>` từ login/register. Không đưa token vào URL.

| Method    | Đường dẫn                  | Quyền      | Mục đích                                       |
| --------- | -------------------------- | ---------- | ---------------------------------------------- |
| GET       | /health                    | Công khai  | Kiểm tra API và DB                             |
| POST      | /auth/register             | Công khai  | Tạo tài khoản student và phiên                 |
| POST      | /auth/login                | Công khai  | Xác thực và tạo phiên                          |
| POST      | /auth/logout               | Đăng nhập  | Thu hồi phiên hiện tại                         |
| GET/PATCH | /me                        | Đăng nhập  | Xem/sửa name, school, area                     |
| GET       | /listings                  | Công khai  | Danh sách đang active                          |
| GET       | /listings/:id              | Công khai  | Chi tiết tin không hidden, nhận xét người đăng |
| POST      | /listings                  | Đăng nhập  | Đăng tin                                       |
| PATCH     | /listings/:id              | Chủ tin    | Sửa tin active/hidden chưa bị khóa             |
| POST      | /listings/:id/visibility   | Chủ tin    | Ẩn/hiện tin chưa bị khóa                       |
| GET       | /my/listings               | Đăng nhập  | Tin của chính mình                             |
| GET       | /favorites                 | Đăng nhập  | Danh sách yêu thích                            |
| POST      | /favorites/:id             | Đăng nhập  | Toggle yêu thích                               |
| POST      | /transactions              | Đăng nhập  | Gửi yêu cầu mua/đổi/nhận                       |
| GET       | /transactions              | Đăng nhập  | Giao dịch của mình                             |
| POST      | /transactions/:id/action   | Thành viên | accept/cancel/confirm                          |
| GET/POST  | /transactions/:id/messages | Thành viên | Đọc/gửi tin nhắn                               |
| POST      | /transactions/:id/reviews  | Thành viên | Đánh giá sau completed                         |
| GET       | /notifications             | Đăng nhập  | Tối đa 100 thông báo của mình                  |
| POST      | /notifications/read        | Đăng nhập  | Đánh dấu tất cả đã đọc                         |
| POST      | /reports                   | Đăng nhập  | Báo cáo tin đăng                               |
| GET       | /admin                     | Admin      | Thống kê, 100 báo cáo/tin mới nhất             |
| POST      | /admin/reports/:id/resolve | Admin      | Đóng báo cáo                                   |
| POST      | /admin/listings/:id/hide   | Admin      | Khóa tin vi phạm, hủy giao dịch mở             |

## Payload

Đăng ký:

```json
{
  "name": "Nguyễn Văn A",
  "email": "a@example.com",
  "password": "Password123!",
  "school": "VKU",
  "area": "Đà Nẵng"
}
```

Đăng nhập: `{"email":"a@example.com","password":"Password123!"}`. Cả hai trả `{ "token": "...", "user": {...} }`; không trả password_hash.

Tạo/sửa tài liệu (PATCH nhận đủ các trường như POST):

```json
{
  "title": "Giáo trình SQL",
  "description": "Sách gốc còn tốt, giao tại thư viện.",
  "subject": "CNTT",
  "school": "VKU",
  "area": "Đà Nẵng",
  "kind": "sell",
  "price": 50000,
  "condition": "Như mới"
}
```

`kind`: sell/exchange/free. `condition`: Mới/Như mới/Đã sử dụng. Giá bán tối thiểu 1000 VNĐ, tối đa 100000000; đổi/tặng được lưu giá 0.

Tìm kiếm: `/listings?q=SQL&area=Đà%20Nẵng&school=VKU&kind=sell&sort=price&limit=20&offset=0`. sort: new/price. Kết quả `{items: [...], total: number}`; các danh sách riêng tư khác trả mảng.

Yêu cầu: `{"listing_id":"UUID","note":"Hẹn thư viện chiều thứ sáu"}`. Với trao đổi, bổ sung `"offered_listing_id":"UUID tài liệu trao đổi của mình"`.

Thao tác: `{"action":"accept"}` hoặc cancel/confirm. Chỉ seller được accept. confirm là cờ riêng của từng bên, không đồng nghĩa đã thanh toán.

Tin nhắn: `{"body":"Chào bạn, sách còn không?"}`. Đánh giá: `{"rating":5,"comment":"Giao sách đúng hẹn"}`. Báo cáo: `{"listing_id":"UUID","reason":"Mô tả sai về tài liệu"}`.

## Mã lỗi

| Mã  | Ý nghĩa                                             |
| --- | --------------------------------------------------- |
| 400 | Dữ liệu/JSON không hợp lệ hoặc yêu cầu trái quy tắc |
| 401 | Không có phiên, phiên hết hạn, sai mật khẩu         |
| 403 | Không có quyền thao tác hoặc tin bị quản trị khóa   |
| 404 | Không tìm thấy hoặc tin đã ẩn                       |
| 409 | Trạng thái thay đổi, yêu cầu trùng, đánh giá trùng  |
| 413 | JSON vượt 64 KB                                     |
| 429 | Quá giới hạn yêu cầu                                |
| 500 | Lỗi máy chủ, không trả chi tiết nội bộ cho client   |

Lỗi nghiệp vụ có dạng `{"error":"Thông báo tiếng Việt"}`. Middleware rate-limit chung có thể trả văn bản; client cần xử lý tổng quát khi nâng cấp. Login/register giới hạn 30 request/15 phút theo IP; API chung 240 request/phút. Môi trường sau reverse proxy cần cấu hình `trust proxy` phù hợp hệ thống thực tế, không bật tin mọi proxy tùy tiện.
