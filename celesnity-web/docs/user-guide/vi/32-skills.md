# Skills của trợ lý

Một **skill** là một bản hướng dẫn ngắn dạy trợ lý AI cách làm một việc cụ thể theo cách của tổ chức bạn: ví dụ "cách tính doanh thu thuần", "mẫu báo cáo tuần", "quy ước đặt tên bảng". Khi câu hỏi của bạn khớp với mô tả của skill, trợ lý tự đọc skill đó trước khi trả lời. Module **Skills** nằm trong nhóm *Tools*.

## 1. Hai loại skill

| Loại | Ai tạo | Sửa được không |
| --- | --- | --- |
| **Project skills** | Người dùng trong tổ chức | Có: sửa và xoá. |
| **Global skills** | Có sẵn từ nền tảng | Chỉ đọc. |

## 2. Tạo một skill

1. Vào **Skills**, bấm **Create skill**.
2. **Name**: tên vĩnh viễn, chỉ dùng chữ thường, số và dấu gạch ngang (ví dụ `bao-cao-tuan`). Không đổi được sau khi tạo.
3. **Description**: một câu bắt đầu bằng *"Use when…"* (Dùng khi…), mô tả tình huống trợ lý nên áp dụng skill này. Đây là phần quan trọng nhất: trợ lý dựa vào câu này để quyết định có dùng skill hay không.
4. **Namespace** (tuỳ chọn): nhóm skill theo bộ phận hoặc chủ đề.
5. **Markdown body**: nội dung hướng dẫn, viết như bạn dặn một đồng nghiệp mới: các bước, quy ước, ví dụ, điều cần tránh.
6. Khung **How the agent sees this skill** cho xem đúng những gì trợ lý sẽ đọc. Kiểm tra rồi lưu.

## 3. Viết skill hiệu quả

- Một skill cho một việc. "Báo cáo tuần" và "đối chiếu tồn kho" là hai skill.
- Mở đầu bằng kết quả mong muốn, sau đó là các bước theo thứ tự.
- Nêu tên bảng, cột, công thức chính xác; trợ lý sẽ dùng nguyên văn.
- Ghi rõ điều **không** làm (ví dụ không cộng đơn đã huỷ).
- Ngắn hơn là tốt hơn; skill dài làm trợ lý bỏ sót.

## 4. Sửa, tìm và xoá

- Ô tìm kiếm lọc theo tên và mô tả.
- Bấm vào một project skill để sửa nội dung; lưu là có hiệu lực ngay cho các cuộc trò chuyện mới.
- **Delete** hỏi lại *"Delete this skill?"* trước khi xoá. Skill đã xoá không dùng được nữa nhưng các câu trả lời cũ không thay đổi.

## 5. Nhờ trợ lý viết skill

Nút **Assistant** trên trang Skills mở **Skill assistant** với vài gợi ý mở đầu. Bạn mô tả việc cần dạy, trợ lý soạn bản nháp skill, bạn duyệt rồi lưu. Cách này nhanh nhất khi bạn chưa quen định dạng.

## 6. Kiểm tra skill hoạt động

Vào **Home**, hỏi một câu đúng tình huống trong mô tả. Mở **View reasoning** của câu trả lời: nếu thấy bước *Reading skill: <tên>* nghĩa là skill đã được dùng.
