# EduShare — Mua bán & trao đổi tài liệu sinh viên

Tài liệu bàn giao: [Báo cáo Word](docs/EduShare_Bao_Cao_Do_An.docx) · [Slide PowerPoint](docs/EduShare_Thuyet_Trinh.pptx) · [Hướng dẫn bảo vệ](docs/KICH_BAN_DEMO.md).

Đồ án ứng dụng đa nền tảng bằng **React Native + Expo + TypeScript**, API **Node.js/Express**, cơ sở dữ liệu quan hệ **SQLite**. Giao diện tiếng Việt, chạy cục bộ bằng Visual Studio Code; có mã nguồn cho Android, iOS và web.

> Phạm vi: MVP học tập cho tài liệu bản giấy và giao nhận trực tiếp. Không có thanh toán trực tuyến, tải/bán PDF, xác minh email, khôi phục mật khẩu, thông báo đẩy hay phát hành ứng dụng lên cửa hàng. Nhắn tin sử dụng polling mỗi 4 giây. Các phần này được tách trong lộ trình mở rộng, không trình bày như chức năng đã có.

## 1. Yêu cầu

- Node.js **24 LTS** (Node 20 không có API SQLite tích hợp mà dự án sử dụng).
- Git và Visual Studio Code. `node --version` phải là `v24.x` hoặc mới hơn tương thích.
- Không cần cài MySQL, PostgreSQL, Docker hoặc dịch vụ đám mây để chạy bản này.
- Windows, macOS hoặc Linux. Các lệnh npm giống nhau trên PowerShell và Terminal.

## 2. Chạy nhanh trên VS Code

```bash
git clone https://github.com/TanTai08/AppEduShare.git
cd AppEduShare
code .
npm ci
```

Tạo file cấu hình từ mẫu, **không sửa tên biến**:

PowerShell (Windows):

```powershell
Copy-Item server/.env.example server/.env
Copy-Item apps/mobile/.env.example apps/mobile/.env
```

macOS/Linux:

```bash
cp server/.env.example server/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Sau đó, trong terminal ở thư mục gốc dự án:

```bash
npm run db:seed
npm run dev
```

- Web: **http://localhost:8081**.
- API kiểm tra: **http://localhost:4000/api/health**.
- Database tự tạo ở **server/data/edushare.sqlite**. Dữ liệu tồn tại sau khi tắt/chạy lại API.
- Dừng ứng dụng bằng `Ctrl+C`.
- Nếu Expo hỏi chọn cổng khác vì 8081 bận, dừng tiến trình cũ để giữ nguyên cấu hình CORS.

Lệnh seed có thể chạy lại: không đổi mật khẩu tài khoản đã có, không xóa dữ liệu. Chỉ tạo các tin mẫu khi bảng tin đăng rỗng.

## 3. Tài khoản demo

Chỉ xuất hiện sau `npm run db:seed`. Mật khẩu chung **`EduShare123!`**.

| Vai trò             | Email                |
| ------------------- | -------------------- |
| Sinh viên Minh Anh  | anh@edushare.local   |
| Sinh viên Hoàng Nam | nam@edushare.local   |
| Quản trị viên       | admin@edushare.local |

Đây là tài khoản giả lập dành cho máy cá nhân. Không chạy seed trên hệ thống công khai. Tài khoản mới đăng ký luôn có quyền sinh viên.

## 4. Chạy Android và iOS

API vẫn cần chạy trên máy tính: `npm run api`.

- **Android Emulator:** đặt `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000` trong `apps/mobile/.env`, chạy `npm run android` ở terminal thứ hai.
- **iOS Simulator trên macOS:** dùng `http://localhost:4000`, chạy `npm run ios`. Cần Xcode; không chạy iOS Simulator trên Windows.
- **Điện thoại thật:** cùng Wi-Fi với máy tính, đặt URL thành `http://<IPv4-LAN-của-máy>:4000`, chạy `npm run start -w apps/mobile` và dùng Expo Go hỗ trợ **SDK 58**. Cho phép cổng 4000 qua firewall trong mạng riêng nếu cần.
- Dự án đã nâng đồng bộ lên **Expo SDK 58**, React 19.3 và React Native 0.88 để mở bằng Expo Go SDK 58. Không nâng riêng React/React Native mà không nâng Expo đồng bộ. iPhone thật không hỗ trợ cài Expo Go SDK cũ qua App Store.
- Sau khi sửa `.env`, khởi động lại Expo; nếu cache cũ, chạy `npx expo start --clear` từ `apps/mobile`.

Đây là mã nguồn đa nền tảng; kiểm chứng Android/iOS trên thiết bị và ký ứng dụng là bước nghiệm thu riêng, chưa có APK/IPA phát hành trong repository.

### Cập nhật từ bản SDK 54 và kết nối iPhone

Trong PowerShell, dừng Expo cũ bằng Ctrl+C rồi chạy:

```powershell
cd D:\EDUSHARE\AppEduShare
git pull --ff-only
npm.cmd ci
```

Giữ cấu hình cá nhân trong `apps/mobile/.env` (file này không bị Git ghi đè). Dùng `ipconfig` tìm IPv4 Wi-Fi của máy tính rồi đặt:

```env
EXPO_PUBLIC_API_URL=http://<IPv4-LAN-của-máy>:4000
```

Chạy API ở terminal thứ nhất: `npm.cmd run api`. Trên Safari iPhone, mở `http://<IPv4-LAN-của-máy>:4000/api/health`; cần thấy `{"ok":true,"database":1}` trước khi đăng nhập.

Chạy Expo ở terminal thứ hai:

```powershell
cd D:\EDUSHARE\AppEduShare
npm.cmd run start -w apps/mobile -- --clear --lan
```

Quét QR bằng Camera iPhone để mở trong Expo Go, cho phép quyền Local Network. iPhone và máy tính cần cùng mạng Wi-Fi không chặn kết nối giữa thiết bị. Không dùng `localhost` hoặc `10.0.2.2` cho API trên iPhone. Đường dẫn Expo cổng 8081 tải mã ứng dụng; API cổng 4000 phải truy cập được riêng.

Nếu có chỉnh sửa mã nguồn chưa commit, Git có thể từ chối pull; lưu thay đổi trước khi cập nhật, không dùng reset để xóa chúng. `npm ci` thay thư viện cài đặt theo lockfile; không xóa database hoặc file `.env`. Không cần chạy lại seed để nâng SDK.

## 5. Chức năng đã triển khai

- Đăng ký/đăng nhập/đăng xuất, phiên hết hạn 7 ngày, chỉnh sửa hồ sơ.
- Đăng/sửa/ẩn/hiện tin, ba hình thức bán/đổi/tặng, kiểm tra dữ liệu.
- Tìm theo tên hoặc môn học; lọc trường, khu vực và hình thức; sắp xếp mới nhất/giá.
- Lưu yêu thích, chi tiết tài liệu, xem điểm và nhận xét người đăng.
- Gửi yêu cầu mua/nhận/đổi một tài liệu lấy một tài liệu.
- Người đăng chấp nhận; giữ chỗ nguyên tử; tự hủy yêu cầu trùng tài liệu khác.
- Hủy giao dịch và trả tài liệu về trạng thái sẵn sàng.
- Cả hai bên xác nhận giao nhận mới hoàn thành; mỗi bên đánh giá một lần.
- Nhắn tin riêng theo giao dịch, thông báo trong app và đánh dấu đã đọc.
- Báo cáo tin đăng; quản trị xem thống kê, ẩn tin vi phạm, xử lý báo cáo.
- Quản trị ẩn tin sẽ hủy giao dịch đang mở liên quan và khóa việc chủ tin tự hiện lại.

Ảnh bìa hiện tại là hình minh họa tạo bằng giao diện, không phải ảnh chụp tài liệu thực tế. Chưa có tải ảnh hoặc đính kèm file.

## 6. Kiểm tra và xuất web

```bash
npm test
npm run typecheck
npm run build:web
# Kiểm tra tương thích SDK và đóng gói mã iOS/Android:
npm run check:sdk -w apps/mobile
npm run build:native -w apps/mobile
# hoặc chạy tất cả:
npm run check
```

Web build nằm ở `apps/mobile/dist/`. Đây là frontend tĩnh; vẫn phải chạy API riêng. Khi triển khai cần build với `EXPO_PUBLIC_API_URL` trỏ đến API HTTPS, cấu hình `CORS_ORIGINS` đúng domain và giữ database trên ổ đĩa bền vững. Không đóng gói DB vào hosting tĩnh.

Bundle native nằm ở `apps/mobile/dist-native/`; đây là mã đóng gói để kiểm chứng bundler, không phải file cài đặt APK/IPA. Expo Go SDK 58 tải mã từ Metro khi chạy `npm run start -w apps/mobile`.

## 7. Cấu trúc

```text
apps/mobile/       React Native, giao diện và API client TypeScript
server/src/        Express, xác thực, schema SQL, seed
server/test/       Kiểm thử tích hợp HTTP với database trong bộ nhớ
docs/              Báo cáo đồ án, sơ đồ, API, kịch bản demo và kiểm thử
.github/workflows/ CI: typecheck, test, web build
.vscode/           Tasks và cấu hình debug
```

Tài liệu cần đọc: [Báo cáo đồ án](docs/BAO_CAO_DO_AN.md), [thiết kế dữ liệu](docs/CO_SO_DU_LIEU.md), [API](docs/API.md), [kịch bản bảo vệ](docs/KICH_BAN_DEMO.md), [kiểm thử](docs/KIEM_THU.md), [lộ trình](docs/LO_TRINH.md).

## 8. Cơ sở dữ liệu và sao lưu

Schema gốc: `server/src/schema.sql`. API dùng foreign keys, prepared statements và transaction `BEGIN IMMEDIATE` khi giữ chỗ. Không dùng SQLite từ trình duyệt; client chỉ truy cập qua API.

Để xem dữ liệu, dùng extension SQLite của VS Code mở `server/data/edushare.sqlite` sau khi seed. Để sao lưu đơn giản, **tắt API trước**, rồi sao chép toàn bộ `server/data/` sang nơi an toàn (kể cả file WAL/SHM nếu còn). Không đưa DB chứa tài khoản hoặc tin nhắn lên GitHub.

SQLite phù hợp bản đồ án và một API instance. Khi nhiều API instance hoặc lượng ghi lớn, chuyển PostgreSQL; cần viết migration và thay adapter truy vấn, không chỉ đổi chuỗi kết nối.

## 9. Đẩy lên GitHub và làm việc tiếp

Repository: https://github.com/TanTai08/AppEduShare

```bash
git checkout -b feature/ten-chuc-nang
# chỉnh sửa và kiểm tra
npm run check
git add .
git commit -m "feat: mo ta thay doi"
git push -u origin feature/ten-chuc-nang
```

Mở pull request về `main`; xem kết quả ở tab Actions. `.gitignore` loại trừ `.env`, database, node_modules và build. Chỉ các file `.env.example` chứa cấu hình mẫu được đưa lên Git.

## 10. Giới hạn khi đưa vào sử dụng thực

Cần thêm HTTPS, sao lưu tự động, email xác minh/reset mật khẩu, quản lý tài khoản vi phạm, nhật ký quản trị, phân trang chat, phát hiện spam, lưu trữ ảnh có kiểm soát và quy trình giải quyết tranh chấp trước khi vận hành công khai. Phiên web lưu trong sessionStorage để demo; cần đánh giá mô hình cookie HttpOnly khi triển khai web production. Phiên native lưu trong SecureStore.

Tài liệu báo cáo có chỗ trống cho họ tên, lớp, giảng viên và đơn vị. Người nộp cần điền và rà soát nội dung, kết quả chạy trên máy và quy định trình bày của trường.
