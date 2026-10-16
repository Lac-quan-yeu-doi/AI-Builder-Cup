# Phân tích: biểu đồ và dashboard

Module **Analytics** (nhóm *Data*) là thư viện biểu đồ và dashboard của tổ chức. Bạn tạo biểu đồ bằng cách hỏi câu hỏi (không cần SQL) hoặc viết SQL, lưu vào bộ sưu tập, rồi ghép nhiều biểu đồ thành dashboard có bộ lọc.

## 1. Thư viện (Our analytics)

Trang đầu liệt kê mọi thứ đã lưu. Bên trên có:

- Nút **New** với bốn lựa chọn: **Question** (câu hỏi), **SQL query**, **Dashboard**, **Collection** (bộ sưu tập).
- Phạm vi: **Everything**, **Shared** (dùng chung), **Personal** (của tôi), **Recent**.
- Lọc theo loại: All / Dashboards / Questions, và ô **Search charts and dashboards**.

Mỗi dòng có menu **Rename**, **Move** (chuyển bộ sưu tập), **Archive**. Biểu đồ được lưu từ trò chuyện có nhãn **From chat**.

**Bộ sưu tập** là thư mục. Bộ sưu tập cá nhân chỉ bạn thấy; bộ sưu tập dùng chung do quản trị viên cấp quyền xem hoặc chỉnh sửa.

## 2. Tạo biểu đồ từ câu hỏi (không cần SQL)

1. **New → Question**. Màn hình hỏi *How do you want to start?*; chọn **New question**.
2. Đi qua các bước ở bảng bên trái:
   - **Data**: chọn bảng nguồn.
   - **Join**: nối thêm bảng khác nếu cần.
   - **Filter**: lọc dòng (khoảng ngày, trạng thái…).
   - **Summarize**: chọn phép tính (tổng, đếm, trung bình) và cột nhóm.
   - **Sort and limit**: sắp xếp và giới hạn số dòng.
3. Bấm **Run preview** để xem dữ liệu.
4. Chọn **Chart type**: Table, Number, Bar, Line, Area, Pie, Scatter. Gán cột cho từng trục ở bảng bên phải; **Visualize** để vẽ.
5. Bấm **Save**: nhập tiêu đề, mô tả và chọn bộ sưu tập đích.

## 3. Tạo biểu đồ từ SQL

1. **New → SQL query** (hoặc **New SQL query** ở màn hình bắt đầu).
2. Chọn catalog và schema, viết câu SELECT. Bấm **Run preview** để kiểm tra kết quả.
3. Chọn loại biểu đồ, gán cột, **Visualize**, rồi **Save** như trên.

Truy vấn chỉ được **đọc** dữ liệu; câu lệnh ghi hoặc xoá bị từ chối.

## 4. Xem và cập nhật biểu đồ đã lưu

Mở một biểu đồ:

- Nút **Chart / Data** đổi giữa hình và số liệu.
- **Refresh** chạy lại truy vấn để lấy dữ liệu mới.
- **Edit** mở lại trình dựng để sửa câu hỏi, bộ lọc hoặc loại biểu đồ. Lưu bằng **Save** (ghi đè, tạo phiên bản mới) hoặc **Save as new** (tạo biểu đồ khác).
- **Version history (N)** liệt kê các lần lưu; **Restore** quay về một phiên bản cũ.

Biểu đồ kiểu cũ (từ bản trước) có nút **Convert to canonical chart** để chuyển sang định dạng mới trước khi dùng trên dashboard.

## 5. Dashboard

**Tạo và chỉnh sửa**
1. **New → Dashboard**, đặt tên, chọn bộ sưu tập.
2. Trong trình chỉnh sửa, nút **Add** cho thêm: **Chart** (chọn từ thư viện), **Heading**, **Text**, **Link**, **Section** (bố cục có sẵn: *2 × 2 grid*, *Hero with rail*, *Four-card strip*). Nút **Filter** thêm bộ lọc dùng chung cho các biểu đồ.
3. Kéo để sắp xếp và đổi kích thước các ô.
4. Dashboard có thể có nhiều **tab**: **Add tab**, **Rename tab**, **Duplicate**, **Move left / Move right**, **Delete**.
5. Bấm **Save**. Rời trang khi chưa lưu, ứng dụng hỏi *Discard your changes?* với **Keep editing** / **Discard**. **Save as copy** tạo bản sao.

**Xem**
- **Refresh dashboard** làm mới mọi biểu đồ.
- **Enter fullscreen** cho màn hình trình chiếu.
- Bộ lọc ở đầu trang áp dụng cho các biểu đồ đã gắn; **Reset** đưa về mặc định.
- **Edit** mở lại trình chỉnh sửa (nếu bạn có quyền).

## 6. Quy trình gợi ý

New → Question hoặc SQL query → Run preview → chọn loại biểu đồ → Visualize → Save vào bộ sưu tập → New → Dashboard → Add chart và Filter → Save → chia sẻ đường dẫn dashboard cho đồng nghiệp.

## 7. Lưu ý

- Biểu đồ từ trò chuyện (xem *Biểu đồ, bảng và tài liệu trong trò chuyện*) sau khi lưu xuất hiện ở đây với nhãn *From chat* và dùng được cho dashboard như mọi biểu đồ khác.
- Viewer xem được dashboard nhưng không lưu hay chỉnh sửa.
- Dữ liệu hiển thị tuân theo quyền dữ liệu của bạn; hai người có thể thấy số liệu khác nhau trên cùng dashboard nếu quyền khác nhau.
