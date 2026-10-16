# Scripts

Module **Scripts** (nhóm *Tools*) dành cho người muốn viết tay mã PySpark thay vì kéo thả pipeline. Mỗi script gắn với một **kết nối nguồn** đang hoạt động, được lưu theo phiên bản và có thể chạy ngay từ ứng dụng.

## 1. Điều kiện trước

Bạn cần ít nhất **một kết nối nguồn đang hoạt động** (xem *Cơ sở dữ liệu và danh mục → Kết nối một nguồn dữ liệu*). Không có kết nối thì nút tạo script bị khoá.

## 2. Tạo script

1. Vào **Scripts**, bấm **New script** (hoặc **Create script draft**).
2. Nhập **Script name** và chọn **Active connection** (kết nối mà script sẽ đọc dữ liệu).
3. Viết **Description** ngắn: script làm gì, đầu ra ở đâu.
4. Viết mã trong ô soạn thảo Python. Nút **Load source** chèn sẵn đoạn mã đọc dữ liệu từ kết nối đã chọn để bạn không phải viết phần kết nối.
5. Bấm **Save** để lưu bản nháp, hoặc **Save & Run** để lưu và chạy ngay.

## 3. Theo dõi kết quả

Sau khi chạy, kết quả và nhật ký hiện ở bảng bên dưới. Script lỗi sẽ dừng và ghi rõ dòng lỗi; sửa rồi **Save & Run** lại.

## 4. Lịch sử bất biến (Immutable history)

Mỗi lần lưu tạo một phiên bản không thể sửa, để truy vết đúng mã nào đã tạo ra dữ liệu nào. Phần **Immutable history** ghi:

| Cột | Ý nghĩa |
| --- | --- |
| **Bucket** / **Object key** | Nơi bản mã được lưu trong kho đối tượng. |
| **SHA-256** | Mã băm để đối chiếu nội dung không bị thay đổi. |
| **Published** | Thời điểm lưu. |

Bạn có thể mở lại một phiên bản cũ để xem, nhưng không sửa đè lên nó; sửa sẽ tạo phiên bản mới.

## 5. Khi nào dùng Scripts thay vì Pipelines

- Dùng **Pipelines** khi luồng dữ liệu diễn tả được bằng các node chuẩn (đọc, lọc, nối, ghi) và cần chạy lại định kỳ.
- Dùng **Scripts** khi cần logic đặc thù, thư viện Python riêng, hoặc thử nghiệm nhanh một phép biến đổi.

## 6. Lưu ý

- Script chạy với quyền dữ liệu của kết nối đã chọn.
- Viewer chỉ đọc được script và lịch sử, không tạo hay chạy.
