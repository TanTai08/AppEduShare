# Biên bản kiểm thử EduShare 2

## AI phân loại tài liệu — 11/11/2026

- **56 tests đạt:33server +23frontend**, gồm7test mới:3test inference/parity và4test API/quyền/feedback/rollback/category thủ công/client cũ. Không gộp72mẫu đánh giá ML vào số unit/integration tests.
- Mô hình huấn luyện thật bằng scikit-learn trên480mẫu tổng hợp, chọn cấu hình theo validation, test top1Accuracy87,5%, macro-F1=0,8771. Chi tiết và giới hạn trong AI_PHAN_LOAI.md; train.py --verify tái hiện trọng số đã lưu.
- Browser thật: gợi ý từ API → chưa tự áp dụng → người dùng xác nhận → lưu/hiển thị nhóm; môn học giữ nguyên; ca mơ hồ cho chọn thủ công. Phản hồi API trễ sau khi đổi nội dung bị bỏ. Giả lập API503 vẫn chọn nhóm và đăng được. Không có lỗi JavaScript.
- Screenshot web: docs/images/ai/suggestion-desktop.png và suggestion-mobile.png; không phải nghiệm thu native.
- Migration3 thêm category/ai_classifications, chạy lặp không lỗi. Kiểm tra client cũ giữ nhóm khi sửa, từ chối gợi ý của người khác/đầu vào đã đổi/ID đã dùng; rollback không tạo tin mồ côi. Feedback lưu hash, không ghi bản nháp tên/mô tả vào bảng AI.
- Các biên bản bên dưới là lịch sử trước AI; số test và số bảng trong đó không mô tả bản mới nhất.


## Cập nhật ảnh tài liệu và bỏ bản đồ — 11/11/2026

- **49 tests đạt: 26 backend PostgreSQL + 23 frontend.** TypeScript, web export, SDK dependency check và iOS/Android Hermes export đạt.
- Thêm5 test backend: xác thực và định dạng ảnh; pending private/public sau khi gắn tin; nén JPEG/thumbnail và bỏ EXIF; quyền sở hữu/không gắn ảnh tin khác và rollback; sửa thứ tự/giữ ảnh với client cũ/xóa ảnh/giới hạn5; dọn ảnh nháp. Các assertion được nhóm trong5 test.
- Browser tự động: đăng nhập → chọn2 file → xem trước → xóa/chọn lại → đổi ảnh bìa → đăng → xem bìa/gallery2ảnh → sửa bỏ1ảnh → còn1ảnh. Các request ảnh trả200, không có lỗi JavaScript. Form không còn iframe/ô kinh/vĩ độ, chi tiết dùng điểm giao nhận văn bản.
- Ảnh minh chứng: `docs/images/photos/form-preview.png`, `detail-mobile.png`; dùng ảnh fixture tự tạo, không phải ảnh sách của người dùng. Đây là browser/mobile viewport, chưa phải nghiệm thu thư viện ảnh/quyền trên Pixel7/iPhone thật.
- Migration v2 thêm bảng listing_images; kiểm thử migration chạy lặp và các nghiệp vụ cũ vẫn đạt. Không cần reset/seed/import database đang có dữ liệu.
- Map/Leaflet/WebView và các biến cấu hình tiles đã gỡ. Phần bản đồ trong các biên bản bên dưới ghi lại phiên bản lịch sử, không áp dụng cho bản hiện tại.


Ngày 10/11/2026. Linux, Node24.22.1, PostgreSQL17 qua Docker, Expo58.0.23, React Native0.88.1, TypeScript6.0.3. Kết quả là môi trường phát triển, không thay thế nghiệm thu trên thiết bị người dùng.

## Bản sửa WebSocket Origin Android — 11/11/2026

Đã tái hiện handshake bị từ chối khi client gửi Origin bằng địa chỉ API (giống mặc định WebSocketModule của React Native Android). HTTP gửi tin không bị ảnh hưởng nên UI có thể vẫn hiển thị tin đã lưu trong khi trạng thái realtime reconnect.

Server được sửa để chấp nhận đúng host/cổng API ngoài allowlist web; không mở wildcard hoặc tin forwarded host. **44 test đạt: 21 backend + 23 frontend.** Test mới kiểm tra client giả lập header native nhận tin riêng realtime; từ chối origin lạ, sai cổng/null và forwarded host giả; token sai vẫn bị chặn kể cả same-origin. TypeScript và web export đạt. Đây là kiểm thử giao thức trên server, chưa phải chạy trên máy Pixel 7 của người dùng.

## Bản sửa thiếu native ExpoCrypto — 11/11/2026

- Bỏ static import/dependency expo-crypto, thay client_id của chat bằng mã UUID không bí mật tạo trong JavaScript. Không thay đổi cơ chế mật khẩu/token server.
- Thêm test chạy khi global crypto không tồn tại; test API PostgreSQL gửi/nhận lại tin sử dụng chính helper mới để kiểm tra hợp đồng UUID và idempotency.
- **41 test đạt: 18 backend + 23 frontend**. TypeScript, SDK check, export web/iOS/Android đạt.
- Browser kiểm tra đăng nhập và gửi tin với mã mới; lỗi mạng giữ nội dung và trạng thái nút gửi được khôi phục; retry giữ cùng client_id, người bán nhận realtime.
- Bundling không thay thế nghiệm thu native. Cần cập nhật code/thư viện, xóa Metro cache bằng --clear và thử lại trong Expo Go trên Pixel 7 của người dùng.

## Bản sửa kết nối Pixel 7 / web / iPhone

Ngày 10/11/2026, sau bản EduShare 2: **40 test đạt (18 backend + 22 frontend)**. Phần frontend kiểm tra tự chọn API cho Android Studio Emulator, iOS Simulator, điện thoại thật theo Metro LAN, web theo host trình duyệt; hiệu chỉnh cấu hình localhost/10.0.2.2 cũ; giữ override riêng và URL remote; chặn cấu hình chứa credentials; phân biệt timeout/canceled/HTTP401/HTML và JSON hỏng.

Backend bổ sung test bind cổng đã chiếm: API thứ hai báo lỗi có hướng dẫn, không làm dừng API thứ nhất. Chạy thực tế index.js cũng trả lỗi đã xử lý khi cổng bận. doctor:local kiểm tra health/PostgreSQL thành công mà không in mật khẩu. TypeScript, SDK check và native export iOS/Android đạt.

Browser kiểm tra ô URL thực tế, nút Kiểm tra API, health thành công, mô phỏng mất mạng, khôi phục rồi kiểm tra lại; sai mật khẩu vẫn báo HTTP401 đúng và đăng nhập hợp lệ thành công. Không ghi nhận pageerror. Đây chưa phải nghiệm thu kết nối trên Pixel 7 của người dùng; đường mạng/firewall ở máy Windows vẫn cần kiểm tra bằng health trên thiết bị.

Các kết quả 16 nhóm bên dưới là bản baseline trước khi thêm test kết nối. CI hiện chạy cả 44 test qua npm run check.

## Kiểm tra tự động

| Kiểm tra                            | Kết quả                                   |
| ----------------------------------- | ----------------------------------------- |
| npm ci                              | Cài sạch từ lockfile thành công           |
| expo install --check                | Thư viện tương thích SDK58                |
| expo-doctor                         | 20/20 mục đạt                             |
| npm run typecheck                   | Đạt                                       |
| npm test                            | **16/16 nhóm đạt**                        |
| npm run build:web                   | Đạt                                       |
| npm run build:native -w apps/mobile | iOS và Android export/Hermes bytecode đạt |

Tests dùng PostgreSQL thật, HTTP và Socket.IO thật, schema tạm được tạo/xóa riêng. Không dùng giả lập SQLite cho test PostgreSQL. Mỗi nhóm chứa nhiều assertion.

1. Health PostgreSQL, migration idempotent, người mới có 0 điểm.
2. Auth: email trùng, băm mật khẩu, logout, chặn sửa điểm/role.
3. Tin đăng: quyền, tọa độ, wildcard tìm kiếm, yêu thích và ẩn tin.
4. Chat trước khi có transaction: membership, gửi lại không trùng, cursor, unread/read.
5. Socket: private delivery, socket token sai bị từ chối, logout ngắt phiên.
6. Mua: không tự mua/trùng, snapshot giá thay đổi phải gửi lại, hai xác nhận, thưởng một lần.
7. Hai kết nối cùng chấp nhận: chỉ một giữ được sách.
8. Free: thiếu điểm rollback; trừ20; hủy hoàn20 một lần.
9. Đồng thời nhận hai sách chỉ đủ một: không vượt số dư; free hoàn thành không sinh điểm.
10. Cap/cooldown: một cặp thưởng một lần/24h, tối đa30 điểm/ngày/người.
11. Exchange: quyền tài liệu; thay đổi hình thức trước accept bị chặn; giữ/giải phóng hai sách và hủy giao nhau; không sinh điểm.
12. Uy tín: chỉ completed participant đánh giá một lần; public profile không lộ dữ liệu riêng.
13. Admin ẩn free reserved: hoàn điểm, khóa tự hiện, audit.
14. FAQ và phiếu: riêng tư, admin trả lời/đóng, chặn gửi sau đóng.
15. Invariant: số dư bằng tổng ledger của mọi user.
16. Import SQLite: giữ ID/hash/giao dịch/chat, nguồn không sửa, từ chối import lần hai.

## Browser test

Chromium, frontend build thật, API PostgreSQL riêng, hai browser contexts đăng nhập Minh Anh/Hoàng Nam:

- Trang chủ desktop1440×1100 và mobile web390×844 tải được.
- Mở hồ sơ người đăng trước khi gửi yêu cầu.
- Nhắn người bán trước mua; người bán trả lời, người mua thấy ngay không refresh.
- Gửi yêu cầu, accept và cập nhật trạng thái realtime.
- Hai phía xác nhận, đánh giá, xem dòng thưởng và số dư trong ví.
- Nhận free, accept trừ20 và hủy hoàn điểm.
- FAQ trả lời, tạo phiếu hỗ trợ riêng qua UI; admin phản hồi và đóng phiếu, người gửi thấy cập nhật realtime.
- Map click thay đổi lat/lon, lưu listing, xem detail và nút chỉ đường.
- Không có JavaScript pageerror trong các luồng đã chạy.

Ảnh minh chứng web trong docs/images/v2. Những ảnh bản đầu trong docs/images là lịch sử. Không gọi viewport mobile web là kiểm thử iPhone native.

## Giới hạn bản đồ trong môi trường test

Chromium của môi trường kiểm thử không nhận CA proxy khi tải CDN. Leaflet đã được đóng gói cục bộ để không cần CDN. Các request tiles kiểm thử được chuyển qua HTTPS client của môi trường với xác thực chứng chỉ vẫn bật; **không dùng ignoreHTTPSErrors hoặc tắt TLS**.

OpenStreetMap public trả ảnh báo giới hạn/block từ IP proxy dùng chung. Vì vậy chỉ xác nhận điều khiển chọn/lưu tọa độ và link chỉ đường; **chưa xác nhận ảnh nền tiles hiển thị đầy đủ trên mạng người dùng**. Không lưu ảnh tiles lỗi làm minh chứng bản đồ thành công. Cần thử trên điện thoại hoặc cấu hình tile provider được phép qua EXPO_PUBLIC_MAP_TILE_URL và EXPO_PUBLIC_MAP_ATTRIBUTION. Native gửi User-Agent nhận diện; attribution được giữ trên map.

## Phụ thuộc và điều kiện vận hành

npm audit --omit=dev: **5 moderate, 0 high, 0 critical** tại thời điểm kiểm tra. Rà soát lại theo lockfile trước triển khai; không chạy audit fix --force để nâng/hạ SDK tùy tiện.

Chưa có: kiểm thử native thực tế đầy đủ, tải lớn/nhiều Node instances, pentest độc lập, accessibility toàn diện hoặc khảo sát người dùng. Push khi app đóng, thanh toán, file số, email xác minh/reset và LLM chưa trong phạm vi.

CI có PostgreSQL service và chạy SDK check, typecheck, tests, web/native export. Trạng thái thực tế xem tab Actions trên GitHub; kết quả cục bộ không tự chứng minh CI đã đạt.
