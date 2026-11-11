# EduShare document classifier

Mô hình TF-IDF + Logistic Regression đã được huấn luyện; Node API nạp `artifacts/model.json` để suy luận, không cần Python lúc chạy app.

Hướng dẫn dữ liệu, huấn luyện lại, đánh giá, API và giới hạn: [docs/AI_PHAN_LOAI.md](../docs/AI_PHAN_LOAI.md).

- Taxonomy: 8 nhóm trong `categories.json`.
- Dữ liệu: 480 mẫu **tổng hợp do trợ lý biên soạn**, không phải dữ liệu sinh viên thực.
- Split theo chủ đề: train336 / validation72 / test72; 160 nhóm chủ đề không trùng giữa các tập.
- Test top1: Accuracy87,5%, macro-F1=0,8771. Không suy ra chất lượng vận hành thực tế.
- Huấn luyện: Python3.12, `pip install -r ai/requirements.txt`, `python ai/train.py`.
- Tái hiện: `python ai/train.py --verify`; biểu đồ: `python ai/plot_report.py`.
- Không dùng `build_demo_data.py` nếu muốn giữ CSV đã bổ sung dữ liệu thực; lệnh này ghi đè bộ demo.
