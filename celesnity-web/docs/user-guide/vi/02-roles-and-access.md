# Vai trò và quyền truy cập

Những gì bạn thấy và làm được trong Celesnity phụ thuộc vào hai thứ: **vai trò** của tài khoản trong tổ chức, và **nhóm truy cập** mà bạn thuộc về. Trang này giải thích cả hai để bạn biết vì sao một module không hiện, và phải xin gì khi cần thêm quyền.

## 1. Vai trò trong tổ chức

Mỗi tài khoản có đúng một vai trò do tổ chức cấu hình bên ngoài không gian làm việc:

| Vai trò | Có thể làm gì |
| --- | --- |
| **Organization owner** (chủ tổ chức) | Toàn quyền trong phạm vi chính sách triển khai cho phép. |
| **Organization admin** (quản trị viên) | Quyền rộng trong phạm vi chính sách triển khai cho phép. |
| **Data engineer** (kỹ sư dữ liệu) | Đọc và ghi trong không gian làm việc: kết nối nguồn, xây pipeline, chạy truy vấn, tạo biểu đồ. |
| **Analyst** (phân tích) | Đọc và ghi trong không gian làm việc, giống kỹ sư dữ liệu. |
| **Viewer** (chỉ xem) | Chỉ đọc: xem dữ liệu, biểu đồ, dashboard; không lưu hay thay đổi. |
| **Auditor** (kiểm toán) | Quyền chỉ đọc trong phạm vi chính sách triển khai cho phép. |

Không gian làm việc không còn màn hình Administration. Hãy liên hệ người quản lý bản triển khai khi cần đổi vai trò.

## 2. Nhóm truy cập và module hiển thị

Tổ chức của bạn có thể tạo **nhóm truy cập** và chọn **những module được hiển thị** cho mỗi nhóm. Bạn có thể thuộc nhiều nhóm; module hiện ra là hợp của tất cả các nhóm bạn thuộc.

Các module có thể bật/tắt theo nhóm:

- Home (trợ lý)
- Databases, Tables, Connections, Source schema, Crawler, Pipelines, Executions
- Streaming, Devices
- Plant model
- Query
- Analytics
- Automations

Khi bạn mở một trang mà nhóm không có, ứng dụng hiện **"Feature not available"** thay vì trang trắng.

## 3. Quyền trên dữ liệu (Catalog access)

Ngoài module, tổ chức có thể giới hạn **dữ liệu nào** bạn được đọc: theo catalog, schema hoặc từng bảng. Quy tắc này áp dụng cho cả bạn lẫn trợ lý AI khi trợ lý làm việc thay bạn. Nếu trợ lý trả lời rằng nó **không đọc được** một bảng ("access denied"), rất có thể bạn hoặc trợ lý chưa được cấp quyền trên bảng đó.

## 4. Xin thêm quyền

Gửi cho người hỗ trợ không gian làm việc ba thông tin:

1. Module bạn cần (ví dụ *Analytics*).
2. Việc bạn cần làm (xem hay chỉnh sửa).
3. Dữ liệu bạn cần đọc (catalog, schema hoặc bảng).

Họ có thể thêm bạn vào nhóm phù hợp hoặc tạo một quyền dữ liệu mới. Thay đổi có hiệu lực ở lần tải trang tiếp theo.

## 5. Bảo mật tài khoản

- Không chia sẻ tài khoản. Mỗi người một tài khoản để nhật ký kiểm toán ghi đúng ai làm gì.
- Nếu tổ chức bật MFA, bạn cần ứng dụng xác thực; mất điện thoại thì báo quản trị viên để được đặt lại.
- Đổi mật khẩu bất cứ lúc nào từ menu tài khoản.
