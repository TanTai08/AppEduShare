# EduShare 2 — API và sự kiện realtime

Base URL: `http://localhost:4000/api`. JSON UTF-8. Endpoint riêng tư dùng `Authorization: Bearer <token>`. Mọi ID là UUID. Lỗi có `{error: string}` và mã 400/401/403/404/409/413/429/500.

| Method    | Endpoint                      | Quyền / mục đích                                       |
| --------- | ----------------------------- | ------------------------------------------------------ |
| GET       | /health                       | Public, xác nhận engine PostgreSQL                     |
| POST      | /auth/register, /auth/login   | Public, tạo phiên                                      |
| POST      | /auth/logout                  | Thu hồi phiên và socket của phiên                      |
| GET/PATCH | /me                           | Hồ sơ riêng, bio; không nhận role/points               |
| GET       | /users/:id                    | Hồ sơ công khai, sao, nhận xét, tin active             |
| GET       | /wallet                       | Số dư, quy tắc, 100 bản ghi điểm gần nhất              |
| GET/POST  | /listings                     | Public đọc, đăng nhập để đăng                          |
| GET/PATCH | /listings/:id                 | Public đọc; chỉ chủ tin sửa active/hidden chưa bị khóa |
| POST      | /listings/:id/visibility      | Chủ tin ẩn/hiện, không vượt kiểm duyệt                 |
| POST      | /uploads/images               | Đăng nhập, tải ảnh nháp base64                         |
| DELETE    | /uploads/images/:id           | Chỉ chủ ảnh, chỉ xóa ảnh chưa gắn tin                   |
| GET       | /images/:id?size=thumb         | JPEG; ảnh nháp riêng, ảnh đã gắn tin công khai          |
| GET       | /my/listings                  | Tin của mình                                           |
| GET       | /favorites                    | Yêu thích riêng                                        |
| POST      | /favorites/:id                | Toggle yêu thích                                       |
| POST      | /conversations                | Tạo/lấy cuộc trò chuyện trước mua                      |
| GET       | /conversations                | 100 cuộc gần nhất, last_message và unread              |
| GET/POST  | /conversations/:id/messages   | Thành viên; phân trang/gửi tin                         |
| POST      | /conversations/:id/read       | Đánh dấu đã đọc                                        |
| GET/POST  | /transactions                 | Danh sách riêng / gửi yêu cầu                          |
| POST      | /transactions/:id/action      | accept/cancel/confirm                                  |
| POST      | /transactions/:id/reviews     | Thành viên, chỉ khi completed, mỗi bên một lần         |
| GET       | /notifications                | Thông báo riêng                                        |
| POST      | /notifications/read           | Đánh dấu tất cả đã đọc                                 |
| POST      | /reports                      | Báo cáo tin                                            |
| POST      | /support/chat                 | Public, trả lời FAQ có rate limit                      |
| GET/POST  | /support/tickets              | Phiếu riêng; admin xem tất cả                          |
| GET/POST  | /support/tickets/:id/messages | Chủ phiếu hoặc admin                                   |
| GET       | /admin                        | Admin, thống kê/báo cáo/tin                            |
| POST      | /admin/listings/:id/hide      | Khóa tin, hủy giao dịch liên quan, hoàn điểm, audit    |
| POST      | /admin/reports/:id/resolve    | Admin đóng báo cáo, audit                              |
| POST      | /admin/support/:id/resolve    | Admin đóng phiếu                                       |

## Payload chính

Đăng ký: `{name,email,password,school,area}`; mật khẩu 8–128 ký tự. Login: `{email,password}`. Trả `{token,user}`. User mới có 0 điểm. PATCH /me nhận `{name,school,area,bio}`.

Listing:

```json
{
  "title": "Giáo trình SQL",
  "description": "Sách gốc còn tốt, giao tại thư viện.",
  "subject": "CNTT",
  "school": "VKU",
  "area": "Đà Nẵng",
  "kind": "sell",
  "price": 50000,
  "condition": "Như mới",
  "pickup_label": "Thư viện trường",
  "image_ids": []
}
```

Kind sell/exchange/free; condition Mới/Như mới/Đã sử dụng. Giá sell >=1000 và nguyên; exchange/free giá 0. Server tự đặt point_cost=20 cho free; client không được gửi điểm tùy ý. UI nhập điểm giao nhận bằng văn bản, không còn bản đồ. API vẫn chấp nhận cặp latitude/longitude cũ để tương thích dữ liệu.

Danh sách: `/listings?q=SQL&area=Đà%20Nẵng&school=VKU&kind=sell&sort=price&limit=20&offset=0`; trả `{items,total}`, limit<=100, sort new/price.

Tạo conversation: `{listing_id}`. Gửi message:

```json
{
  "body": "Mình muốn hỏi trước khi mua, sách còn không?",
  "client_id": "UUID tạo một lần cho lần gửi"
}
```

Gửi lại cùng sender/client_id và cùng nội dung trả bản đã lưu; đổi nội dung hoặc conversation với cùng mã bị từ chối. Không nhận sender_id từ client. GET messages nhận `before=<seq>` hoặc `after=<seq>` và `limit` (mặc định50, tối đa100); trả `{items,has_more}`. Không dùng đồng thời before/after.

Tạo transaction: `{listing_id,note,offered_listing_id?}`; offered bắt buộc với exchange. Action `{action:"accept"|"cancel"|"confirm"}`. Accept free cần đủ điểm; mọi thất bại rollback giữ chỗ và ví. Đánh giá `{rating:1..5,comment}`.

FAQ `{message}` trả `{answer,suggestions,mode:"faq"}`. Phiếu `{subject,body}`. Phản hồi phiếu `{body}`. Chưa có API LLM hoặc cam kết phản hồi tức thời từ admin.

## Tải và gắn ảnh

1. POST `/uploads/images` với `{base64:"..."}` (không có tiền tố data URL). Cần token; xác thực trước khi parse body, tối đa 20 lần/phút/IP. JSON tối đa 8 MB cho base64 của ảnh tối đa 5 MB. Chấp nhận ảnh tĩnh JPG/PNG/WebP, kiểm tra signature và giải mã, tối đa 25 megapixel; không nhận SVG/file giả ảnh.
2. Trả 201 `{id,url,width,height}`. Server xoay theo EXIF, bỏ metadata/GPS, nén JPEG tối đa 1600px và tạo thumbnail480px. Tối đa 20 ảnh chưa gắn tin/người; ảnh nháp quá 24 giờ được dọn ở lần upload tiếp theo.
3. POST/PATCH listing gửi `image_ids:["UUID",...]`, tối đa5, không trùng. Chỉ được dùng ảnh của mình và chưa gắn tin khác. Thứ tự là thứ tự hiển thị, ảnh đầu là ảnh bìa. Gắn ảnh và lưu tin trong cùng transaction, lỗi rollback. Bỏ trường này khi sửa giữ ảnh cũ; `[]` xóa mọi ảnh của tin.
4. Listing trả `images:[{id,url,width,height}]`, không trả dữ liệu BYTEA/base64. Ghép URL với gốc API (ví dụ `http://localhost:4000`), thêm `?size=thumb` để lấy ảnh thu nhỏ, mặc định size=full.
5. GET ảnh nháp cần Bearer token của chủ ảnh; người khác nhận404. Ảnh đã gắn tin có URL công khai, kể cả tin đã ẩn; cache1ngày, ETag/304. Ảnh nháp private/no-store. DELETE ảnh nháp của người khác bị403; ảnh không tồn tại hoặc đã gắn tin của mình trả `{deleted:false}`. Muốn xóa ảnh đã đăng, sửa `image_ids` của tin rồi lưu.

Các API JSON khác vẫn giới hạn64KB. Ảnh lưu trong PostgreSQL; bản backup database chứa cả ảnh.

## Socket.IO

Kết nối vào gốc URL API, không phải `/api` và không phải Metro:

```js
const socket = io(API_URL, { auth: { token } });
socket.on('message:new', (message) => {});
socket.emit('typing', { conversation_id });
```

| Sự kiện server → client | Dữ liệu                                               |
| ----------------------- | ----------------------------------------------------- |
| message:new             | Tin đã commit, có conversation_id, seq và sender_name |
| conversation:updated    | `{id}` khi tạo/đọc conversation                       |
| typing                  | `{conversation_id,name}`, chỉ thành viên được phát    |
| transaction:updated     | `{id}`, tải lại giao dịch                             |
| notification:new        | Thông báo riêng đã lưu                                |
| wallet:updated          | `{balance}`, tải lại ví                               |
| support:new             | `{ticket_id}`, tới chủ phiếu và admin                 |

Server tự gán room theo user sau xác thực. Client không nhận quyền join room bất kỳ. Logout ngắt socket ứng với token bị thu hồi. Socket xác thực thất bại nhận connect_error. Mất kết nối không mất tin vì REST có cursor và idempotency.

API mặc định giới hạn 300 request/phút/IP; login/register 30/15 phút, gửi tin60/phút, trợ giúp20/phút. Sau reverse proxy cần cấu hình trust proxy đúng hạ tầng. CORS là origin allowlist cho web/socket; native thường không có Origin. Không dùng CORS thay phân quyền.
