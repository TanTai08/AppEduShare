export function supportAnswer(message) {
  const q = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase();
  const answers = [
    [
      /tai anh|hinh anh|chon anh|anh tai lieu|photo/,
      'Khi đăng hoặc sửa tin, chọn tối đa 5 ảnh JPG/PNG/WebP, mỗi ảnh tối đa 5 MB. Xem trước, xóa hoặc chọn ảnh bìa trước khi lưu. Ảnh được kiểm tra và nén ở server. Bạn có thể dùng điện thoại hoặc máy tính để chọn ảnh.',
    ],
    [
      /diem|point|mien phi|doi sach/,
      'Mỗi giao dịch mua bán được cả hai bên xác nhận hoàn thành sẽ thưởng 10 điểm cho mỗi bên. Nhận sách miễn phí cần 20 điểm: trừ khi người bán chấp nhận, hoàn lại nếu hủy. Đổi/tặng không sinh điểm. Để hạn chế tích điểm giả, mỗi cặp chỉ được thưởng 1 lần/24 giờ và mỗi người tối đa 30 điểm/ngày UTC. Xem Ví điểm để đối chiếu lịch sử.',
    ],
    [
      /chat|nhan tin|realtime|lien he/,
      'Mở chi tiết sách rồi chọn “Nhắn người bán” để hỏi trước khi mua. Tin nhắn được lưu và cập nhật realtime khi có kết nối. Nếu mất mạng, ứng dụng tải lại lịch sử khi kết nối trở lại.',
    ],
    [
      /map|ban do|vi tri|chi duong|dia chi/,
      'Bản đồ đã được bỏ. Người bán ghi địa điểm giao nhận bằng chữ khi đăng sách. Bạn mở chi tiết và nhắn người bán để thống nhất giờ nhận; nên hẹn tại thư viện hoặc cổng trường.',
    ],
    [
      /danh gia|uy tin|sao/,
      'Mở hồ sơ người bán để xem số sao, nhận xét và số giao dịch hoàn thành. Chỉ người tham gia giao dịch đã hoàn thành được đánh giá, mỗi bên một lần. Sao thể hiện nhận xét cộng đồng, không phải bảo đảm giao dịch.',
    ],
    [
      /huy|hoan|tranh chap|lua dao/,
      'Bạn có thể hủy giao dịch chưa hoàn thành trong mục Giao dịch; điểm đã trừ sẽ được hoàn. Nếu một bên đã xác nhận giao nhận, hãy tạo yêu cầu hỗ trợ để quản trị xem xét. Với tin vi phạm, dùng nút Báo cáo trong chi tiết sách.',
    ],
    [
      /dang tin|dang sach|ban sach/,
      'Nhấn “Đăng sách”, nhập tên, mô tả, môn, giá hoặc hình thức đổi/miễn phí, thêm ảnh và ghi địa điểm giao nhận bằng chữ. Tin miễn phí có mức nhận 20 điểm. Chỉ đăng tài liệu bạn có quyền chuyển nhượng.',
    ],
    [
      /mat khau|dang nhap|tai khoan/,
      'Dùng tài khoản EduShare để đăng nhập ứng dụng; tài khoản Expo chỉ dùng chạy dự án. Nếu không đăng nhập được, kiểm tra email, mật khẩu và kết nối API. Bản này chưa có khôi phục mật khẩu qua email; tạo phiếu hỗ trợ nếu cần.',
    ],
  ];
  const match = answers.find(([pattern]) => pattern.test(q));
  return {
    answer:
      match?.[1] ||
      'Mình là trợ lý hướng dẫn tự động theo nội dung trợ giúp, chưa phải mô hình AI sinh. Mình hỗ trợ về điểm, mua/đổi sách, chat, ảnh tài liệu và uy tín. Nếu cần xử lý trường hợp cụ thể, hãy tạo phiếu để quản trị viên trả lời.',
    suggestions: [
      'Cách nhận điểm',
      'Nhắn tin trước khi mua',
      'Cách thêm ảnh tài liệu',
      'Gửi yêu cầu hỗ trợ',
    ],
    mode: 'faq',
  };
}
