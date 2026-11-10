# EduShare 2 — Kết nối sách, trao đổi tri thức

Ứng dụng đa nền tảng cho sinh viên: **Expo SDK 58 / React Native + TypeScript**, **Node.js / Express / Socket.IO**, **PostgreSQL 17**. Chạy trong Visual Studio Code trên Windows, macOS hoặc Linux.

[Báo cáo Word](docs/EduShare_Bao_Cao_Do_An.docx) · [Slide](docs/EduShare_Thuyet_Trinh.pptx) · [Database & ERD](docs/CO_SO_DU_LIEU.md) · [API](docs/API.md) · [Kiểm thử](docs/KIEM_THU.md) · [Kịch bản bảo vệ](docs/KICH_BAN_DEMO.md)

## Chức năng phiên bản 2

- **Chat realtime trước khi mua:** mở sách → Nhắn người bán. Hộp thư riêng, trạng thái kết nối, đang soạn tin, số tin chưa đọc, lịch sử phân trang và đồng bộ khi kết nối lại. Tin nhắn lưu PostgreSQL; cùng mã gửi lại không tạo tin trùng.
- **Ví điểm:** mua bán hoàn thành thưởng **10 điểm cho mỗi bên**; nhận sách miễn phí dùng **20 điểm**, trừ khi chủ sách chấp nhận, hoàn khi hủy. Đổi/tặng không sinh điểm. Mỗi cặp được thưởng một lần/24 giờ; mỗi người tối đa 30 điểm/ngày UTC. Điểm không đổi thành tiền.
- **Bản đồ điểm hẹn:** người bán chạm bản đồ để ghim hoặc nhập tọa độ, đặt tên điểm nhận; chi tiết sách có bản đồ và nút chỉ đường. Đây là vị trí công khai tự chọn, không theo dõi GPS liên tục.
- **Hồ sơ công khai:** giới thiệu, trường/khu vực, số giao dịch hoàn thành, số sao, số nhận xét và sách đang đăng. Chỉ thành viên giao dịch đã hoàn thành mới được đánh giá, mỗi bên một lần.
- **Hộp hỗ trợ:** trợ lý FAQ theo chủ đề và phiếu riêng để quản trị viên trả lời/đóng phiếu. FAQ không phải AI sinh và không gửi dữ liệu tới dịch vụ LLM.
- **Giao diện mới:** hộp thư, ví điểm, lối tắt giao dịch, nút hỗ trợ, điều hướng mobile 5 mục, safe area cho màn hình tai thỏ.
- Giữ đăng ký/đăng nhập, hồ sơ, tìm kiếm/lọc/yêu thích, đăng/sửa/ẩn tin, mua/đổi, giữ chỗ, xác nhận hai phía, báo cáo và kiểm duyệt.

Giá bán và hình thức được chụp lại khi gửi yêu cầu. Nếu chủ tin thay đổi chúng trước khi chấp nhận, người mua cần hủy và gửi yêu cầu mới. Khi một bên đã xác nhận giao nhận, hủy thông thường bị chặn; hãy gửi phiếu hỗ trợ. Quản trị có thể ẩn tin và hủy giao dịch liên quan, có audit log và hoàn điểm.

## 1. Yêu cầu cài đặt

- **Node.js 24 LTS**, Git và VS Code.
- **PostgreSQL 17+**: chọn Docker Desktop với `compose.yml`, hoặc PostgreSQL cài trực tiếp/managed PostgreSQL. Không cần cài cả hai cách.
- Với Docker Desktop Windows: bật WSL2/virtualization và đợi Docker Engine chạy.
- Expo Go **SDK 58** cho Android/iPhone; iPhone và máy tính cùng Wi-Fi khi chạy LAN.

SQLite cũ không còn là database chạy ứng dụng. File SQLite vẫn được giữ nguyên và có công cụ chuyển dữ liệu bên dưới.

## 2. Cài mới trên Windows PowerShell

```powershell
git clone https://github.com/TanTai08/AppEduShare.git
cd AppEduShare
code .
npm.cmd ci
npm.cmd run setup
```

Khởi động PostgreSQL (Docker Desktop phải đang chạy):

```powershell
npm.cmd run db:up
```

Đợi `docker compose ps` hiển thị **healthy**, rồi:

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

- Web: **http://localhost:8081**.
- API: **http://localhost:4000/api/health** → `{"ok":true,"database":1,"engine":"postgresql"}`.
- Realtime dùng cùng địa chỉ/cổng API, không phải cổng Metro.
- Dừng Node/Expo bằng Ctrl+C. Dừng PostgreSQL bằng `docker compose stop`; chạy lại bằng `npm run db:up`. Không dùng `docker compose down -v` nếu muốn giữ dữ liệu.

Trên macOS/Linux dùng `npm` thay `npm.cmd`, `cp` thay `Copy-Item`.

## 3. Cập nhật dự án đang có (Windows)

Dừng API và Expo cũ, mở terminal VS Code:

```powershell
cd D:\EDUSHARE\AppEduShare
git pull --ff-only
npm.cmd ci
```

Mở `server/.env` và thêm/sửa dòng sau (giữ các dòng cấu hình khác):

```env
DATABASE_URL=postgresql://edushare:edushare_dev@localhost:5432/edushare
```

Mật khẩu trên chỉ dành cho PostgreSQL local do compose tạo. Nếu tự cài PostgreSQL, thay user/password/host/port/database theo cài đặt thật; ký tự đặc biệt trong mật khẩu phải URL-encode. Không gửi connection string chứa mật khẩu vào chat hoặc commit Git.

Chạy `npm.cmd run db:up` và đợi PostgreSQL healthy, sau đó **chọn đúng một phương án**:

**A. Giữ dữ liệu SQLite cũ:** dừng API cũ, sao lưu toàn bộ `server/data/` (gồm WAL/SHM nếu còn). Database PostgreSQL đích phải chưa có người dùng:

```powershell
npm.cmd run db:migrate
npm.cmd run db:import:sqlite
```

Công cụ mặc định đọc `server/data/edushare.sqlite` ở chế độ chỉ đọc, giữ ID, password hash, phiên, tin đăng, yêu thích, giao dịch, đánh giá, báo cáo, thông báo và chuyển chat cũ thành cuộc trò chuyện. Người dùng có 0 điểm khởi đầu; không thưởng hồi tố cho giao dịch cũ. Giao dịch miễn phí đã chấp nhận trước chuyển đổi được giữ nguyên, không trừ điểm hồi tố. File nguồn không bị xóa. Đích đã có người dùng thì import bị từ chối; lỗi giữa chừng rollback toàn bộ. Không chạy seed trước import.

**B. Bắt đầu bằng dữ liệu mẫu mới:**

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
```

Sau đó chạy API và Expo như mục 5. Không cần xóa file `.env` hoặc file SQLite. Nếu đã seed nhưng muốn import, hãy tạo **database PostgreSQL rỗng khác**, không xóa dữ liệu đang có.

## 4. Không dùng Docker

Cài PostgreSQL từ https://www.postgresql.org/download/windows/ rồi dùng pgAdmin tạo user và database riêng. Đặt `DATABASE_URL` trong `server/.env`, chạy `npm run db:migrate`, rồi seed hoặc import như trên. Không chạy `db:up` trong trường hợp này.

Kết nối cloud PostgreSQL cần cấu hình TLS theo nhà cung cấp; không tắt xác thực chứng chỉ. Chỉ Node API giữ thông tin database. Điện thoại không kết nối trực tiếp tới PostgreSQL.

## 5. Chạy trên web, Android và iPhone

Terminal 1, tại thư mục gốc:

```powershell
npm.cmd run api
```

Frontend đọc **`apps/mobile/.env`**. Backend đọc **`server/.env`**; đặt EXPO_PUBLIC_API_URL ở backend không cấu hình được Expo.

Bản sửa kết nối hỗ trợ tự chọn URL khi chạy phát triển:

```env
EXPO_PUBLIC_API_URL=auto
EXPO_PUBLIC_API_PORT=4000
```

| Nền tảng                   | URL auto trong phát triển                             |
| -------------------------- | ----------------------------------------------------- |
| Web trên máy tính          | `http://<host-trình-duyệt>:4000`, thường là localhost |
| Android Emulator / Pixel 7 | `http://10.0.2.2:4000`                                |
| iOS Simulator              | `http://localhost:4000`                               |
| iPhone / Android thật      | `http://<IP-LAN-của-Metro>:4000`                      |

Các URL loopback cũ trong biến chung (localhost/10.0.2.2) được hiệu chỉnh theo nền tảng ở chế độ phát triển. URL remote/tùy chỉnh không bị sửa. Nếu dùng adb reverse hoặc cần cấu hình riêng, đặt biến theo nền tảng; biến này được giữ nguyên:

```env
# Chỉ bật biến cần dùng:
# EXPO_PUBLIC_API_URL_ANDROID=http://10.0.2.2:4000
# EXPO_PUBLIC_API_URL_IOS=http://192.168.1.169:4000
# EXPO_PUBLIC_API_URL_WEB=http://localhost:4000
```

Nếu Expo chạy qua tunnel, API vẫn cần URL riêng truy cập được từ điện thoại. Bản native phát hành cần URL API HTTPS tường minh; auto chỉ hỗ trợ phát triển. Web production không cấu hình URL dùng API cùng origin, nên hosting phải định tuyến /api và Socket.IO tới server.

Terminal 2:

```powershell
# iPhone/Android thật: quét QR, cho phép Local Network
npm.cmd run start -w apps/mobile -- --clear --lan
# Hoặc Android Emulator đã bật:
npm.cmd run android -w apps/mobile -- --clear
# Hoặc web:
npm.cmd run web -w apps/mobile
```

Kiểm tra `/api/health` bằng Safari/Chrome trên thiết bị trước khi đăng nhập. Khi đổi `.env`, dừng và khởi động Expo lại. Cổng 4000 phục vụ API + Socket.IO; cổng 8081 chỉ tải mã Expo. Chỉ cho phép Node qua firewall trong mạng riêng khi cần, không tắt toàn bộ firewall.

Nếu Expo Go SDK 58 yêu cầu đăng nhập, dùng cùng tài khoản Expo trên điện thoại và CLI. Windows lỗi tự mở trình duyệt thì:

```powershell
npx.cmd expo login --no-browser
npx.cmd expo whoami
```

Tài khoản chỉ có đăng nhập liên kết có thể cần browser flow: trong PowerShell đặt `$env:BROWSER="none"`, chạy `npx.cmd expo login`, mở **URL mới** in trong terminal trên trình duyệt cùng máy; giữ CLI chờ callback. Sau đó `Remove-Item Env:BROWSER`. Không dùng URL từ lần chạy đã dừng. Đây là tài khoản Expo, khác tài khoản EduShare.

### Chẩn đoán lỗi fetch / cổng 4000

Trong màn hình đăng nhập hoặc khi trang chủ báo lỗi, mở phần **Kết nối máy chủ**: xem nền tảng, URL thực tế và nhấn **Kiểm tra API**. Nút này kiểm tra cả health và engine PostgreSQL. Lỗi timeout, không kết nối, trả HTML do nhầm Metro và HTTP sai mật khẩu được phân biệt.

Trong PowerShell tại thư mục gốc:

```powershell
npm.cmd run setup
npm.cmd run doctor:local
```

setup chỉ tạo .env còn thiếu, không ghi đè file hiện có. doctor:local kiểm tra API trên máy tính, chỉ ra vị trí cấu hình/biến ghi đè và cảnh báo EXPO_PUBLIC_API_URL đặt nhầm ở server. Nó không in DATABASE_URL, mật khẩu hoặc token. Kiểm tra trên máy tính không chứng minh máy ảo/điện thoại truy cập được; dùng nút trong app hoặc mở đúng URL health trên thiết bị.

Nếu .env.local, .env.development.local hoặc biến môi trường đang ghi đè .env, sửa đúng nguồn rồi chạy lại Expo với --clear. Với PowerShell mới luôn cd vào thư mục có package.json trước khi chạy npm. VS Code có task riêng chạy API, Pixel Android và chẩn đoán.

API bị chiếm cổng sẽ báo rõ EADDRINUSE thay vì stack trace không xử lý; không tự tắt chương trình khác hoặc đổi cổng ngầm. Chỉ giữ một terminal API. Nếu cần thay PORT backend, đổi EXPO_PUBLIC_API_PORT hoặc URL frontend tương ứng.

## 6. Demo và kiểm tra database

Sau seed, ba tài khoản dùng mật khẩu **`EduShare123!`**:

| Tài khoản            | Vai trò   |
| -------------------- | --------- |
| anh@edushare.local   | Minh Anh  |
| nam@edushare.local   | Hoàng Nam |
| admin@edushare.local | Quản trị  |

Tài khoản demo **mới tạo** có 20 điểm mẫu ghi rõ trong sổ điểm, để thử nhận sách. Đăng ký bình thường có 0 điểm. Seed chạy lại không ghi đè mật khẩu/số dư hoặc tạo thưởng lặp. Không chạy seed trên server công khai.

Xem database bằng **pgAdmin** hoặc extension PostgreSQL của VS Code:

- Host `localhost`, port `5432`, database `edushare`, user `edushare`, mật khẩu local theo cấu hình compose.
- Xem `public.users`, `listings`, `conversations`, `messages`, `transactions`, `point_ledger`, `reviews`, `support_tickets`...
- Schema chuẩn: `server/src/schema.sql`; migrations có version và khóa để chạy an toàn khi nhiều API cùng khởi động.

## 7. Bản đồ và quyền riêng tư

Leaflet 1.9.4 được đóng gói cùng ứng dụng (giữ BSD license), không tải script từ CDN lúc chạy. Tiles OpenStreetMap cần Internet và tuân thủ https://operations.osmfoundation.org/policies/tiles/. Giữ attribution; không tải hàng loạt hoặc prefetch để dùng offline. Native WebView gửi User-Agent nhận diện ứng dụng. Dịch vụ tiles công cộng có thể giới hạn; khi triển khai nhiều người dùng cần nhà cung cấp tiles và điều khoản phù hợp.

Có thể cấu hình `EXPO_PUBLIC_MAP_TILE_URL` và `EXPO_PUBLIC_MAP_ATTRIBUTION` trong `apps/mobile/.env` theo một provider bạn được phép sử dụng, rồi khởi động lại Expo. Nếu provider cần map key public, giới hạn key theo ứng dụng/domain và quota; không đặt secret backend trong biến EXPO_PUBLIC.

Điểm hẹn công khai là do người đăng chọn. Không lưu lịch sử GPS, không tự lấy vị trí nhà. Nếu tiles không tải, có thể nhập tọa độ và mở đường đi trong ứng dụng bản đồ ngoài. Bản đồ ngoài tự xác định điểm xuất phát nếu người dùng cho phép.

## 8. Kiểm thử và build

PostgreSQL cần đang chạy; test tạo **schema tạm riêng** và xóa schema đó sau khi xong, không truncate bảng ứng dụng. Nếu server dùng user hạn quyền, tạo database test và cấu hình `TEST_DATABASE_URL` với quyền tạo schema.

```powershell
npm.cmd test
# Bao gồm test backend PostgreSQL và 22 test kết nối frontend
npm.cmd run check
npm.cmd run check:sdk -w apps/mobile
npm.cmd run build:native -w apps/mobile
```

GitHub Actions có PostgreSQL service, kiểm tra SDK, TypeScript, tests và export web/iOS/Android. Export native không phải APK/IPA; vẫn cần nghiệm thu trên điện thoại. Web build ở `apps/mobile/dist`; native ở `dist-native`, đều không commit.

## 9. Cấu trúc, sao lưu và giới hạn

```text
apps/mobile/                 Giao diện Expo, API client, Socket.IO, bản đồ
server/src/                  Express, nghiệp vụ điểm/giao dịch, realtime, SQL
server/test/                 Kiểm thử HTTP + sockets + PostgreSQL + import
server/migrations/           Schema SQLite lịch sử chỉ dùng công cụ chuyển đổi
docs/                        Báo cáo, slide, ERD, ảnh chạy thật và hướng dẫn
compose.yml                  PostgreSQL cục bộ + persistent volume
```

Sao lưu PostgreSQL bằng `pg_dump`/pgAdmin; thử khôi phục vào database khác. File SQLite cũ không phải backup của PostgreSQL mới. Không commit `.env`, database dump, token, thông tin cá nhân hoặc mật khẩu thật.

Hiện API realtime phù hợp **một Node instance**; nhiều instance cần Socket.IO adapter (ví dụ Redis). Các chuyển trạng thái marketplace dùng transaction PostgreSQL và advisory lock ngắn chung để bảo toàn điểm/giữ chỗ; đây là lựa chọn đúng đắn cho quy mô đồ án, cần đo tải và tối ưu khóa khi mở rộng.

Chưa có thanh toán/giữ tiền, bán PDF, tải ảnh thật, email xác minh/reset hoặc push notification khi app đóng. Chatbot là FAQ có chuyển tiếp người hỗ trợ, chưa dùng LLM. Điểm/sao không chứng minh việc thanh toán/giao nhận ngoài đời; cơ chế giới hạn điểm giảm lạm dụng nhưng chưa thay thế chống gian lận thực tế. Có phân trang chat; các danh sách khác hiện giới hạn số bản ghi, chưa phải hệ thống quy mô lớn.
