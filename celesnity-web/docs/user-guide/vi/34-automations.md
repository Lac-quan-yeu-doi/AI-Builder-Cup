# Tự động hoá

Module **Automations** (nhóm *Tools*) cho phép bạn xâu chuỗi nhiều lượt làm việc của trợ lý AI thành một **workflow** chạy tự động khi có sự kiện hoặc theo lịch. Ví dụ: mỗi sáng 7 giờ, tính chỉ số hôm qua, viết báo cáo, lưu thành tài liệu.

## 1. Tạo workflow

1. Vào **Automations**, bấm **New workflow**.
2. Nhập **Name**.
3. Chọn **Trigger type**:
   - **Event**: chạy khi có sự kiện. Nhập **Event topic** (tên sự kiện). Nút **Event topic assistant** liệt kê các topic đang có; bấm **Use topic** để chọn.
   - **Schedule**: chạy theo lịch. Nhập **Cron expression** (ví dụ `0 7 * * 1-5` là 7:00 các ngày trong tuần) và **Timezone**.
4. Lưu. Workflow mới ở trạng thái tắt cho tới khi bạn bật.

Danh sách workflow có menu: **Open**, **Rename**, **Duplicate**, **Enable / Disable**, **Remove**.

## 2. Thêm các bước

Mở workflow, bấm **Add step** cho từng bước. Ở bảng **Step** bên phải:

| Trường | Ý nghĩa |
| --- | --- |
| **Agent** | Trợ lý nào thực hiện bước này. |
| **Input template** | Nội dung yêu cầu gửi cho trợ lý. Có thể chèn dữ liệu của trigger và kết quả bước trước bằng biến, ví dụ `{{ trigger.plant }}` hoặc `{{ steps.1.output }}`. |
| **System prompt** | Chỉ dẫn nền cho bước này (giọng văn, giới hạn, định dạng đầu ra). |
| **Remove step** | Xoá bước. |

Các bước chạy **tuần tự**: bước sau nhận được kết quả của bước trước.

## 3. Khai báo trường của trigger

Để dùng dữ liệu đi kèm sự kiện trong template, khai báo ở **Trigger fields**: bấm **Add trigger field**, đặt tên và kiểu, rồi **Save trigger fields**. Khi chạy thử, ứng dụng hỏi giá trị cho đúng các trường này.

## 4. Chạy thử

Bấm **Test fire**. Nhập giá trị cho các trigger field rồi chạy. Tuỳ chọn **Force failure at step** cho phép cố ý làm một bước lỗi để xem workflow xử lý ra sao. Kết quả hiện trong **Run history**.

## 5. Bật và theo dõi

- **Enable** để workflow bắt đầu chạy theo sự kiện hoặc lịch; **Disable** để tạm dừng.
- **Run history** liệt kê từng lần chạy với trạng thái. Bấm để xem **Run details**: từng bước, thời gian, kết quả.
- Trong Run details:
  - **Retry from step**: chạy lại từ bước bị lỗi, không phải từ đầu.
  - **Show files**: các tệp bước đó tạo ra.
  - Tài liệu do workflow tạo được liệt kê kèm nút **Download PDF**.

## 6. Bảng bên phải

Trang workflow có hai tab ở bảng bên phải: **Chat** (trợ lý workflow: hỏi về workflow này, nhờ sửa template) và **Step** (thuộc tính bước đang chọn).

## 7. Quy trình gợi ý

New workflow → Add step (một hoặc nhiều) → Add trigger field → Save trigger fields → Test fire → xem Run history → Enable.

## 8. Lưu ý

- Workflow chạy với quyền của trợ lý được chọn; nếu bước cần hành động phải duyệt, lần chạy sẽ chờ tới khi có người duyệt trong Home.
- Biểu đồ mà workflow tạo được nhúng vào tài liệu của lần chạy đó; mở tài liệu để xem.
