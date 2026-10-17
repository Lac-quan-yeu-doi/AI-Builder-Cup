# Mô hình nhà máy

Module **Plant model** (nhóm *Data*) mô tả nhà máy của bạn dưới dạng một cây các đối tượng: khu vực, dây chuyền, máy, cảm biến… kèm thuộc tính của từng loại và các tuyến quy trình giữa chúng. Có mô hình rồi, dữ liệu vận hành, dashboard và trợ lý AI đều hiểu "máy ép số 3 ở dây chuyền A" là gì.

## 1. Tạo nhà máy

1. Vào **Plant model**. Trang liệt kê các nhà máy (site) đã có.
2. Bấm **Create plant**, nhập **Name** và **Code** (mã ngắn, không đổi sau này), rồi lưu.
3. Bấm vào nhà máy để mở. Ứng dụng đưa bạn tới tab **Overview**.

Mỗi nhà máy có bốn tab: **Overview**, **Model**, **Dashboards**, **Configure**. Nút **Ask Minder** mở trợ lý chuyên về mô hình nhà máy, biết cấu trúc của chính nhà máy này.

### Tạo nhà máy từ video đi xưởng

1. Ở **Mô hình nhà máy**, bấm **Tạo từ video đi xưởng**.
2. Thả vào một video quay xưởng bằng điện thoại, dài một đến ba phút. Đi sát từng máy và nhãn của máy.
3. Bấm **Dựng mô hình xưởng**. Gemini mất khoảng nửa phút để trả về khu vực, line và máy nhìn thấy được, kèm luồng vật liệu giữa chúng.
4. Kiểm tra kết quả ở tab **Bản sao số**. Bấm vào một máy để xem khung hình trong video nơi máy xuất hiện và phát video từ thời điểm đó. Luồng nét đứt là luồng Gemini giả định chứ không nhìn thấy. **Kỹ sư cần xác nhận** liệt kê những gì camera bỏ sót.
5. Sửa **Tên** và **Mã** nếu cần, rồi bấm **Tạo nhà máy**. Mô hình được lưu thành bản nháp, chỉnh sửa và xuất bản như mọi nhà máy khác.

**Xem mẫu** hiện câu trả lời đã ghi sẵn cho một video công khai về line ép viên thức ăn, không cần tải gì lên.

## 2. Định nghĩa loại đối tượng (Node types)

Trước khi thêm máy móc, hãy định nghĩa **loại đối tượng** dùng chung:

1. Trong tab **Model**, mở **Node types** và bấm **Add node type** (ví dụ *Dây chuyền*, *Máy ép*, *Cảm biến nhiệt*).
2. Với mỗi loại, **Add property** để khai báo thuộc tính (công suất, số hiệu, ngưỡng cảnh báo…). Mỗi thuộc tính có kiểu dữ liệu.
3. Thuộc tính có thể **gắn với Data Catalog** ("Read-only Data Catalog binding"): giá trị được đọc từ một bảng/cột trong catalog thay vì nhập tay, nên luôn cập nhật.

Bạn cũng có thể bắt đầu từ **Templates** (mẫu dựng sẵn) nếu tổ chức đã có.

## 3. Dựng cây đối tượng

1. Bấm **New node** để thêm một đối tượng.
2. Ở bảng **Inspector** bên phải, chọn **Node type**, đặt tên, chọn **Parent / container** (đối tượng chứa nó) và **Routing role** (vai trò trong tuyến quy trình: nguồn, trung gian, đích…).
3. Điền giá trị các thuộc tính của loại đó.
4. Lặp lại cho tới khi cây phản ánh đúng nhà máy: khu vực → dây chuyền → máy → cảm biến.

Mẹo: đặt tên đúng như cách mọi người gọi ngoài xưởng; trợ lý và dashboard sẽ dùng đúng tên đó.

### Ghi lại kinh nghiệm sửa máy

Tab **Sửa máy** biến một lần sửa của thợ giỏi thành hướng dẫn cho thợ tiếp theo.

1. Bấm **Ghi lại một lần sửa**. Chọn máy, đặt tên lỗi và tên thợ, rồi thả video sửa máy có âm thanh vào. Thợ nên vừa làm vừa nói, đọc to mọi thông số, và nói lý do khi làm theo cách riêng.
2. Gemini viết quy trình: các bước kèm giây diễn ra, dụng cụ, vật tư, thông số và bước an toàn. Chỗ nào thợ làm mà không giải thích, Gemini viết sẵn câu hỏi để hỏi lại.
3. Ở tab **Quy trình**, xác nhận từng thông số Gemini nghe được và từng bước an toàn, rồi gõ hoặc đọc câu trả lời của thợ giỏi cho các câu hỏi vì sao. Nút **Duyệt và xuất bản** dùng được khi đã xác nhận đủ; duyệt cũng xuất bản hướng dẫn thành skill cho trợ lý.
4. **Sửa theo hướng dẫn** dẫn thợ đi từng bước. Bật **Rảnh tay** để nghe đọc từng bước và trả lời bằng giọng nói: "tiếp", "quay lại", "cho xem", hoặc bất kỳ câu hỏi nào về bước đó. Bước an toàn cần kiểm tra bằng ảnh hoặc xác nhận trước khi làm tiếp.
5. **Truyền kinh nghiệm** so các lần sửa có hướng dẫn với thời gian của thợ giỏi, và liệt kê những bước thợ làm khác mà vẫn sửa được máy; **Cập nhật bước này** tạo bản nháp sửa đổi mới.
6. **So sánh thợ giỏi** nhận video của thợ thứ hai sửa cùng lỗi và chỉ ra hai người khác nhau ở đâu, vì sao điều đó quan trọng.

Trong lúc Core chưa có endpoint, hướng dẫn và video được lưu trong trình duyệt đã ghi lại chúng.

## 4. Lưu và phát hành phiên bản

- **Save** lưu bản nháp; bạn có thể quay lại sửa tiếp.
- **Publish version** tạo một phiên bản chính thức mà các module khác dùng. Nút này bị khoá khi mô hình còn lỗi kiểm tra (thiếu loại, thiếu cha, thuộc tính bắt buộc bỏ trống); sửa hết lỗi rồi phát hành.
- **Versions** liệt kê các phiên bản đã phát hành; **Compare latest versions** cho thấy khác biệt giữa hai bản gần nhất.

## 5. Gắn dashboard cho nhà máy

Tab **Dashboards** liên kết nhà máy với các dashboard trong Analytics:

- **New dashboard**: tạo dashboard mới gắn sẵn với nhà máy.
- **Associate**: gắn một dashboard đã có.
- **Make default**: chọn dashboard hiện mặc định ở tab Overview.
- **Edit layout**: mở trình chỉnh sửa dashboard của Analytics.

## 6. Cấu hình

Tab **Configure** chứa các thiết lập riêng của nhà máy (đơn vị, múi giờ, nguồn dữ liệu vận hành). Chỉ quản trị viên hoặc kỹ sư phụ trách nên thay đổi.

## 7. Quy trình gợi ý

Create plant → Model: Add node type và thuộc tính → New node theo cây → Save → Publish version → Dashboards: New dashboard hoặc Associate → Overview để xem tổng quan.
