# Vai trò và quyền truy cập

Những gì bạn thấy và làm được trong Celesnity phụ thuộc vào hai thứ: **vai trò** của tài khoản trong tổ chức, và **nhóm truy cập** mà bạn thuộc về. Trang này giải thích cả hai để bạn biết vì sao một module không hiện, và phải xin gì khi cần thêm quyền.

## 1. Vai trò trong tổ chức

Mỗi tài khoản có đúng một vai trò do quản trị viên đặt khi mời:

| Vai trò | Có thể làm gì |
| --- | --- |
| **Organization owner** (chủ tổ chức) | Toàn quyền, kể cả mời thành viên, tạo nhóm, cấp quyền dữ liệu và quản lý trợ lý. |
| **Organization admin** (quản trị viên) | Như chủ tổ chức trong phần Administration. |
| **Data engineer** (kỹ sư dữ liệu) | Đọc và ghi trong không gian làm việc: kết nối nguồn, xây pipeline, chạy truy vấn, tạo biểu đồ. |
| **Analyst** (phân tích) | Đọc và ghi trong không gian làm việc, giống kỹ sư dữ liệu. |
| **Viewer** (chỉ xem) | Chỉ đọc: xem dữ liệu, biểu đồ, dashboard; không lưu hay thay đổi. |
| **Auditor** (kiểm toán) | Chỉ xem thông tin tổ chức và nhật ký kiểm toán; không vào dữ liệu làm việc. |

Trong ứng dụng, vai trò thể hiện rõ nhất ở **Administration**: chỉ chủ tổ chức và quản trị viên thấy đủ các tab; các vai trò khác chỉ thấy tab Overview kèm ghi chú chỉ đọc.

## 2. Nhóm truy cập và module hiển thị

Quản trị viên tạo **nhóm** (group) và với mỗi nhóm chọn **những module được hiển thị** ("Visible workspace features"). Bạn có thể thuộc nhiều nhóm; module hiện ra là hợp của tất cả các nhóm bạn thuộc.

Các module có thể bật/tắt theo nhóm:

- Home (trợ lý, Skills, Plugins)
- Databases, Tables, Connections, Source schema, Crawler, Pipelines, Executions
- Streaming, Devices
- Plant model
- Query
- Analytics
- Automations
- Documents
- Guide
- Administration

Nếu nhóm chưa được cấu hình lần nào, quản trị viên sẽ thấy nhãn **"Unrestricted until saved"**: nhóm đó tạm thời thấy mọi thứ cho tới khi được lưu lần đầu.

Khi bạn mở một trang mà nhóm không có, ứng dụng hiện **"Feature not available"** thay vì trang trắng.

## 3. Quyền trên dữ liệu (Catalog access)

Ngoài module, quản trị viên có thể giới hạn **dữ liệu nào** bạn được đọc: theo catalog, schema hoặc từng bảng. Quy tắc này áp dụng cho cả bạn lẫn trợ lý AI khi trợ lý làm việc thay bạn. Nếu trợ lý trả lời rằng nó **không đọc được** một bảng ("access denied"), rất có thể bạn hoặc trợ lý chưa được cấp quyền trên bảng đó.

## 4. Xin thêm quyền

Gửi cho quản trị viên ba thông tin:

1. Module bạn cần (ví dụ *Analytics*).
2. Việc bạn cần làm (xem hay chỉnh sửa).
3. Dữ liệu bạn cần đọc (catalog, schema hoặc bảng).

Quản trị viên sẽ thêm bạn vào nhóm phù hợp hoặc tạo một quyền dữ liệu mới. Thay đổi có hiệu lực ngay ở lần tải trang tiếp theo.

## 5. Bảo mật tài khoản

- Không chia sẻ tài khoản. Mỗi người một tài khoản để nhật ký kiểm toán ghi đúng ai làm gì.
- Nếu tổ chức bật MFA, bạn cần ứng dụng xác thực; mất điện thoại thì báo quản trị viên để được đặt lại.
- Đổi mật khẩu bất cứ lúc nào từ menu tài khoản.
