# Biểu đồ, bảng và tài liệu trong trò chuyện

Ngoài câu chữ, trợ lý có thể tạo ra **biểu đồ**, **bảng dữ liệu** và **tài liệu báo cáo** ngay trong cuộc trò chuyện. Trang này hướng dẫn cách yêu cầu, đọc, chỉnh sửa và giữ lại chúng.

## 1. Yêu cầu một biểu đồ

Chỉ cần nói rõ bạn muốn biểu đồ gì. Trợ lý sẽ tự chọn loại phù hợp nếu bạn không nói:

- **So sánh** giữa các nhóm: biểu đồ cột.
- **Xu hướng** theo thời gian: biểu đồ đường.
- **Tỷ trọng** của một tổng: biểu đồ tròn.
- **Tương quan** hai đại lượng: biểu đồ điểm.

Ví dụ: _"Vẽ số đơn hàng theo tháng trong iceberg.demo"_, _"Top 5 quán theo doanh thu, dạng cột"_, _"Tỷ trọng doanh thu theo kênh bán"_.

Với câu hỏi chỉ cần **một con số** ("tổng doanh thu năm nay là bao nhiêu?"), trợ lý trả lời bằng chữ và in đậm con số, không vẽ biểu đồ.

## 2. Thẻ biểu đồ trong câu trả lời

Trong lúc biểu đồ đang được vẽ, một **khung giữ chỗ** xuất hiện đúng kích thước; khi dữ liệu về, biểu đồ thay vào đúng vị trí đó. Thẻ biểu đồ gồm:

| Thành phần                     | Ý nghĩa                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| Tiêu đề và mô tả               | Do trợ lý đặt theo câu hỏi của bạn.                                                     |
| Nút **Chart / Table**          | Đổi giữa biểu đồ và bảng số liệu gốc mà biểu đồ được vẽ từ đó.                          |
| Nút **Open in the side panel** | Chuyển bảng bên phải sang biểu đồ này. Viền thẻ đổi màu khi biểu đồ này đang hiện ở đó. |
| Rê chuột lên biểu đồ           | Hiện giá trị từng điểm.                                                                 |

Thẻ ghi _"This query came back with no rows."_ nghĩa là truy vấn đúng nhưng không có dữ liệu khớp. Hãy nới điều kiện (khoảng thời gian, bộ lọc) rồi hỏi lại.

### Bảng bên phải: mỗi biểu đồ một nút ngay dưới tiêu đề

Ngay khi trợ lý vẽ xong một biểu đồ, bảng bên phải **tự mở** và hiện biểu đồ đó; bạn không cần bấm gì. Mọi biểu đồ của cuộc trò chuyện xếp thành một **hàng nút ngay dưới tiêu đề bảng**, đánh số theo thứ tự tạo ra (1, 2, 3…); nút của biểu đồ đang xem được tô đậm. Bấm một nút: bảng chuyển sang biểu đồ đó **và** cuộc trò chuyện cuộn tới đúng đoạn có biểu đồ đó, nên bạn đọc lại được câu hỏi và nhận xét đi kèm mà không phải tìm. Trong bảng có câu tóm tắt số liệu, nút **Show query** (xem truy vấn), số dòng và nút **Keep** để lưu (xem mục 4). Dấu **X** trên một nút đóng biểu đồ đó khỏi bảng: nó không tự mở lại, còn biểu đồ mới vẫn mở. Mở lại một cuộc trò chuyện cũ, hàng nút của nó được dựng lại đầy đủ.

## 3. Chỉnh sửa biểu đồ bằng câu hỏi tiếp theo

Bạn không cần vẽ lại từ đầu. Hỏi tiếp bằng lời, ví dụ:

- _"Đổi sang biểu đồ cột."_
- _"Chỉ tính các đơn đã giao."_
- _"Thêm đường tổng của ba quán."_
- _"Gom theo quý thay vì tháng."_

Trợ lý tạo **một biểu đồ mới** trong câu trả lời mới; biểu đồ cũ vẫn giữ nguyên phía trên để bạn so sánh. Muốn quay lại phiên bản trước, cuộn lên và dùng nó.

## 4. Lưu biểu đồ

Biểu đồ trong trò chuyện là **bản xem trước**: nó chưa có trong Analytics và không dùng được cho dashboard cho tới khi bạn lưu.

1. Chọn biểu đồ ở bảng bên phải (tự hiện khi vẽ xong; hoặc bấm nút của nó ngay dưới tiêu đề bảng, hoặc **Open in the side panel** trên thẻ).
2. Bấm **Keep** ở cuối bảng: lưu một chạm vào bộ sưu tập cá nhân của bạn. Sau đó nút ghi _Kept in_ kèm tên bộ sưu tập; bấm vào để mở biểu đồ trong Analytics.

Không lưu được khi:

- Thẻ báo _"This preview reached the analytical limit."_: dữ liệu quá lớn nên bản xem trước bị cắt. Hãy thu hẹp câu hỏi (thêm bộ lọc, gom nhóm) rồi hỏi lại.
- Bảng bên phải báo _Too large to keep_: tương tự.

Khi lưu, hệ thống **chạy lại truy vấn** để lấy dữ liệu đầy đủ, nên biểu đồ đã lưu luôn phản ánh dữ liệu mới nhất mỗi khi mở.

## 5. Bảng dữ liệu

Khi kết quả là một bảng (danh sách, top N…), câu trả lời có thẻ **Table** kèm số dòng. Bấm để mở trên bảng bên phải; ở đó có **Show query** để xem truy vấn đã chạy. Bảng quá dài sẽ hiện _"N of M rows"_: chỉ một phần được hiển thị.

## 6. Tài liệu và báo cáo

Khi bạn yêu cầu **một báo cáo đáng giữ lại** ("viết báo cáo tuần và lưu lại"), trợ lý tạo một **tài liệu** (định dạng Markdown), có thể nhúng biểu đồ vừa vẽ. Tài liệu hiện dưới dạng thẻ **Document**; bấm để đọc trên bảng bên phải, có nút **Download PDF**. Tài liệu cũng xuất hiện trong module **Documents**.

Bạn cũng có thể **đính kèm PDF** vào câu hỏi (nút + → Attach a file) để trợ lý đọc và trả lời dựa trên nội dung tệp đó.

## 7. Nguồn trích dẫn

Khi trợ lý dựa vào một biểu đồ đã lưu hoặc một tài liệu, câu trả lời có phần **Sources**. Bấm nguồn để mở đúng biểu đồ hoặc trang tài liệu đó. Bản xem trước chưa lưu không được trích dẫn.
