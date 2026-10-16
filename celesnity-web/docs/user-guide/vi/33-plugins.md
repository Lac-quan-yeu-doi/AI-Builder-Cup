# Plugins và Google Drive

Module **Plugins** (nhóm *Tools*) liệt kê các ứng dụng bên ngoài mà trợ lý AI có thể đăng nhập và làm việc thay bạn. Hiện tại có **Google Drive**: sau khi bạn kết nối, trợ lý đọc được tệp trong Drive của bạn và tạo tệp mới khi bạn yêu cầu.

## 1. Kết nối Google Drive

1. Vào **Plugins**. Dòng **Google Drive** ghi trạng thái **Needs sign-in** khi chưa kết nối.
2. Bấm **Sign in**. Một cửa sổ Google mở ra: chọn tài khoản và chấp nhận quyền mà Celesnity xin.
3. Sau khi Google xác nhận, bạn được đưa về trang Plugins; tài khoản vừa kết nối hiện trong **Connected accounts**.
4. Muốn thêm tài khoản khác (ví dụ Drive dùng chung của phòng), bấm **Connect another account**.

Kết nối là **của riêng bạn**: đồng nghiệp không dùng được Drive của bạn qua trợ lý.

## 2. Dùng Google Drive trong trò chuyện

1. Vào **Home**, gõ **@** trong ô nhập và chọn **Google Drive**.
2. Nêu yêu cầu, ví dụ: *"@Google Drive tìm file kế hoạch Q4 và tóm tắt phần ngân sách"*, hoặc *"@Google Drive tạo file báo cáo tuần này từ số liệu vừa tính"*.
3. Trợ lý liệt kê hoặc đọc tệp, rồi trả lời. Khi tạo tệp, trợ lý báo tên và vị trí tệp mới.

Bạn cũng có thể hỏi *"trong Drive của tôi có tệp nào về hợp đồng không?"* mà không cần gõ @; trợ lý sẽ dùng plugin khi thấy phù hợp.

## 3. Trợ lý được và không được làm gì

| Được | Không được |
| --- | --- |
| Liệt kê thư mục và tệp | Sửa nội dung tệp có sẵn |
| Đọc nội dung tệp | Xoá tệp |
| Tạo tệp mới | Chia sẻ tệp cho người khác |

Giới hạn này là cố định để tệp của bạn không bị thay đổi ngoài ý muốn.

## 4. Ngắt kết nối

Ở **Connected accounts**, bấm **Disconnect** cạnh tài khoản. Trợ lý lập tức mất quyền truy cập Drive đó. Bạn cũng có thể thu hồi quyền từ trang bảo mật của tài khoản Google.

## 5. Sự cố thường gặp

| Bạn thấy | Làm gì |
| --- | --- |
| Đăng nhập Google xong nhưng vẫn *Needs sign-in* | Tải lại trang Plugins. Nếu vẫn vậy, cửa sổ Google có thể đã bị trình duyệt chặn; cho phép cửa sổ bật lên rồi thử lại. |
| Trợ lý nói không tìm thấy tệp | Kiểm tra tên tệp và tài khoản đã kết nối có đúng là tài khoản chứa tệp không. |
| Lỗi hết hạn đăng nhập | Bấm **Disconnect** rồi **Sign in** lại. |
