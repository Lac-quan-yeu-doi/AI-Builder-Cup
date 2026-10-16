# Truy vấn SQL

Module **Query** (nhóm *Tools*) là nơi viết và chạy câu lệnh SQL trực tiếp trên dữ liệu của tổ chức. Dùng khi bạn muốn kiểm tra nhanh một con số, xem vài dòng dữ liệu, hoặc thử câu truy vấn trước khi biến nó thành biểu đồ.

## 1. Màn hình

| Vùng | Ý nghĩa |
| --- | --- |
| **Database** | Chọn database bạn muốn truy vấn. Mở từ màn hình một database (nút *Open in SQL*) thì ô này đã được chọn sẵn. |
| Ô soạn thảo | Viết câu SQL. Có tô màu cú pháp. |
| **Run query** / **Cancel** | Chạy hoặc huỷ câu đang chạy. |
| **History** | Các câu đã chạy trước đó; bấm để lấy lại. |
| Kết quả | Bảng kết quả, có báo khi bị cắt bớt vì vượt giới hạn dòng. |
| Thống kê | *Processed rows* (số dòng đã xử lý), *Peak memory* (bộ nhớ đỉnh), thời gian chạy. |

## 2. Chạy một truy vấn

1. Chọn **Database**.
2. Viết câu SELECT, ví dụ:
   ```sql
   SELECT order_month, COUNT(*) AS orders
   FROM orders
   GROUP BY order_month
   ORDER BY order_month
   ```
3. Bấm **Run query** (hoặc phím tắt hiển thị trên nút).
4. Đọc trạng thái, thời gian và cột kết quả bên dưới. Kéo ngang để xem hết cột.

Hướng dẫn từng bước **"Run your first SQL query"** trong nút **Tutorials** đưa bạn qua đúng các bước này.

## 3. Giới hạn cần biết

- Chỉ **đọc**: các câu lệnh tạo, sửa, xoá dữ liệu bị từ chối. Muốn ghi dữ liệu, dùng Pipelines hoặc Scripts.
- **Giới hạn số dòng** ở phía máy chủ: kết quả dài sẽ bị cắt và có nhãn báo. Thêm điều kiện lọc hoặc `LIMIT` để lấy đúng phần bạn cần.
- Câu chạy quá lâu có thể bị máy chủ dừng; **Cancel** để dừng sớm.
- Bạn chỉ thấy các bảng mà quyền dữ liệu của bạn cho phép. Lỗi *access denied* nghĩa là cần xin quyền (xem *Vai trò và quyền truy cập*).

## 4. Từ truy vấn tới biểu đồ

Khi câu truy vấn đã đúng:

- Sao chép câu lệnh sang **Analytics → New → SQL query** để vẽ và lưu thành biểu đồ, hoặc
- Dán vào **Home** kèm yêu cầu *"vẽ biểu đồ từ truy vấn này"* để trợ lý vẽ giúp.

## 5. Mẹo

- Đặt tên cột rõ ràng bằng `AS` (ví dụ `AS doanh_thu`); tên đó sẽ thành nhãn trên biểu đồ.
- Dùng **History** để quay lại câu đã chạy tốt thay vì gõ lại.
- Với bảng lớn, luôn thử với `LIMIT 100` trước.
