# Đề cương thuyết trình EduShare

Thời lượng đề xuất 10–15 phút, xen kẽ demo chạy thật. File `EduShare_Thuyet_Trinh.pptx` trong cùng thư mục có thể chỉnh sửa.

1. **Tên đề tài** — Ứng dụng mua bán và trao đổi tài liệu sinh viên; họ tên, lớp, giảng viên cần điền.
2. **Bài toán** — Tin đăng phân tán, khó lọc theo trường/môn/khu vực, yêu cầu trùng tài liệu.
3. **Mục tiêu & phạm vi** — Bán/đổi/tặng tài liệu bản giấy; giao nhận trực tiếp; không thu tiền trong ứng dụng.
4. **Công nghệ** — React Native + Expo + TypeScript; Node/Express; SQLite; GitHub Actions.
5. **Kiến trúc & dữ liệu** — UI → REST API → SQLite; 9 bảng và các quan hệ quan trọng.
6. **Giao diện** — Ảnh desktop và mobile web; nói rõ chưa phải kiểm thử native.
7. **Luồng giao dịch** — Pending → accepted → xác nhận hai phía → completed; nhánh hủy.
8. **Chống bán trùng & phân quyền** — Transaction nguyên tử, kiểm tra chủ tin/thành viên, khóa tin vi phạm.
9. **Demo** — Hai tài khoản mua sách, chat, xác nhận và đánh giá; theo KICH_BAN_DEMO.md.
10. **Kiểm thử** — HTTP integration, typecheck, web export, browser hai phiên; không khẳng định hiệu năng chưa đo.
11. **Giới hạn & hướng phát triển** — Kiểm thử native, ảnh thật, email, PostgreSQL, WebSocket, thanh toán sau.
12. **Bàn giao & trao đổi** — GitHub, README, SQL, báo cáo, kiểm thử; mời câu hỏi.

Nội dung slide phải được người trình bày rà soát theo phiên bản mã nguồn cuối cùng và kết quả chạy trên máy của mình.
