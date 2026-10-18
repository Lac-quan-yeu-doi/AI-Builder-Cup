# Cơ sở dữ liệu và danh mục

Module **Databases** (nhóm *Data*) là nơi bạn tạo database trong catalog của nền tảng, kết nối các nguồn dữ liệu bên ngoài, quét cấu trúc của chúng và xây pipeline đưa dữ liệu vào. Mọi thứ liên quan tới một database nằm gọn trong màn hình của database đó.

## 1. Danh sách database

Vào **Databases**. Trang liệt kê các database đã có với mô tả; dùng ô **Filter databases** để tìm nhanh.

Mọi tổ chức đều thấy sẵn ba database mẫu chỉ đọc: `demo` (khách hàng và đơn hàng), `demo1_home_appliance` (Demo Data 1, nhà máy tủ đông) và `demo2_coffee_capsules` (Demo Data 2, nhà máy viên nén cà phê). Bạn mở, xem trước dữ liệu và truy vấn được ngay mà không cần kết nối nguồn hay chạy pipeline. Tất cả đều là dữ liệu giả lập.

**Tạo database mới**
1. Bấm **Create database**.
2. Chọn **Catalog** (nơi database sẽ nằm).
3. Nhập **Database name**: chỉ dùng chữ cái, số và dấu gạch dưới, ví dụ `curated_sales`.
4. Nhập **Description** (tuỳ chọn) rồi lưu.
5. Bấm vào tên database để mở.

Bạn có thể sửa mô tả sau bằng **Edit description**.

## 2. Màn hình một database

Phía trên có hai nút: **Ask AI** mở trợ lý đã gắn sẵn phạm vi database này, **Open in SQL** mở trang Query với database này được chọn. Bên dưới là các tab:

| Tab | Nội dung |
| --- | --- |
| **Overview** | Thẻ *Step 1 of 3* dẫn bạn qua ba bước: Connect a source → Build a pipeline → Run the pipeline. Kèm tình trạng chung ("Everything is up to date") và *Recent activity*. |
| **Tables** | Các bảng trong database. Chọn một bảng để xem **Columns**, **Write history** (lịch sử ghi) và **Row preview** (vài dòng mẫu, giới hạn bởi máy chủ). |
| **Sources** | Các kết nối tới hệ thống nguồn (PostgreSQL, MySQL…). |
| **Pipelines** | Các pipeline đưa dữ liệu từ nguồn vào database. |
| **Runs** | Lịch sử chạy pipeline. |

## 3. Kết nối một nguồn dữ liệu

1. Mở tab **Sources**, bấm **New connection**.
2. Trong hộp *Register a data connection*, nhập **Service name** (tên gợi nhớ) và chọn **Database connector** (loại hệ thống nguồn).
3. Điền các trường của connector đó: máy chủ, cổng, tên database, tài khoản, mật khẩu.
4. Bấm **Test connection**. Chỉ khi báo thành công mới nên **Save service**.
5. Nguồn xuất hiện trong danh sách. Menu **More actions** của mỗi dòng có **Test connection**, **Edit**, **Archive** (lưu trữ, có hỏi lại).

> Mật khẩu được lưu an toàn ở máy chủ và không hiển thị lại. Muốn đổi, bấm **Edit** và nhập mật khẩu mới.

## 4. Quét cấu trúc nguồn (Metadata scan)

Sau khi kết nối, bấm vào nguồn để mở trang chi tiết với ba tab **Connection**, **Metadata scan**, **Discovered tables**.

1. Ở tab **Connection**, bấm **Test connection** một lần nữa; hệ thống yêu cầu kết nối đã được kiểm tra trước khi gán quét.
2. Sang tab **Metadata scan**, bấm **Assign a scan**. Nhập **Crawler name**, **Daily time** (giờ chạy hằng ngày) và **Timezone**, rồi **Assign crawler**.
3. Bấm **Scan now** để quét ngay thay vì chờ tới giờ.
4. Menu **More scan actions** cho phép **Pause**, **Resume**, **Edit schedule**, **Remove scan**. **Scan history** liệt kê các lần quét và kết quả.
5. Khi quét xong, tab **Discovered tables** hiện cây *Schemas and databases* → *Tables and views*. Chọn một bảng để xem Columns, Constraints, DDL và Properties.

## 5. Xây và chạy pipeline

1. Mở tab **Pipelines**, bấm **New pipeline**. Chọn **Data Catalog database** đích và nhập **Pipeline name**.
2. Canvas mở ra. Bên trái là **danh mục node** (có ô *Search nodes*): kéo node nguồn, biến đổi, đích vào canvas và nối chúng. Bấm một node để sửa thuộc tính ở bảng bên phải; **Preview data** cho xem dữ liệu đi qua node đó.
3. Chuyển sang chế độ **script** để xem mã PySpark được sinh ra (chỉ đọc).
4. Bấm **Validate** để kiểm tra lỗi, **Save** để lưu. Phải lưu trước khi **Run**.
5. Nếu có người khác vừa sửa cùng pipeline, hộp thoại xung đột hỏi **Keep editing** (giữ bản của bạn) hay **Reload saved version** (lấy bản đã lưu).

Danh sách pipeline có các thao tác **Duplicate** và **Archive**; pipeline chưa gắn database sẽ có nút **File under {database}** để xếp vào đúng chỗ.

## 6. Theo dõi các lần chạy (Runs)

Tab **Runs** liệt kê mọi lần chạy, lọc theo **All / Succeeded / Failed**. Bấm một lần chạy để xem **Overview** và **Logs**. Đang chạy thì có **Cancel**; đã chạy xong có **Rerun version** để chạy lại đúng phiên bản pipeline đó.

## 7. Quy trình gợi ý cho lần đầu

1. Create database → đặt tên → mở database.
2. Sources → New connection → Test connection → Save.
3. Mở nguồn → Test connection → Metadata scan → Assign a scan → Scan now.
4. Discovered tables: xác nhận thấy đúng bảng.
5. Pipelines → New pipeline → dựng → Validate → Save → Run.
6. Runs: chờ Succeeded → Tables: kiểm tra dữ liệu đã vào.

Bạn có thể làm đúng quy trình này với hướng dẫn từng bước **"Create a database and discover source schema"** trong nút **Tutorials**.
