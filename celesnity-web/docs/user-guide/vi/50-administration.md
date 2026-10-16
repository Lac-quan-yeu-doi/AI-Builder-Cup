# Quản trị tổ chức và phân quyền

Module **Administration** (cuối thanh bên) là nơi chủ tổ chức và quản trị viên quản lý thành viên, nhóm truy cập, quyền trên dữ liệu và các trợ lý AI. Các vai trò khác chỉ thấy tab **Overview** kèm ghi chú chỉ đọc.

## 1. Overview

Thông tin tổ chức và phiên đăng nhập hiện tại. Nút **Enable MFA** bật xác thực hai lớp **cho toàn bộ thành viên**; ứng dụng hỏi lại _"Require MFA for everyone?"_ vì sau khi bật, không tắt được từ đây. Hãy báo trước cho mọi người cài ứng dụng xác thực.

## 2. Members: mời và quản lý thành viên

**Mời thành viên**

1. Bấm **Invite member**.
2. Nhập **email** và chọn **vai trò** (xem _Vai trò và quyền truy cập_).
3. Ứng dụng tạo **đường dẫn thiết lập tài khoản**, chỉ hiển thị **một lần**; sao chép và gửi cho người được mời. Đường dẫn hết hạn sau **72 giờ**; quá hạn thì mời lại.

**Quản lý**

- Đổi **vai trò** hoặc **trạng thái** (kích hoạt / tạm khoá) ngay trên dòng thành viên.
- **Remove account permanently** xoá hẳn tài khoản; có hỏi lại. Nhật ký kiểm toán vẫn giữ các hành động cũ của người đó.

## 3. Groups: nhóm và module hiển thị

Nhóm quyết định **ai thấy module nào**.

1. Bấm **Create group**, đặt tên và mô tả.
2. Chọn nhóm, dùng **Add to group** để thêm thành viên; **Remove from group** để bỏ.
3. Trong **Visible workspace features**, tích các module nhóm được thấy (Home, Databases, Tables, Connections, Source schema, Crawler, Pipelines, Executions, Streaming, Devices, Plant model, Query, Analytics, Automations, Documents, Guide, Administration).
4. Bấm **Save feature visibility**.

Nhóm chưa lưu lần nào hiện nhãn **Unrestricted until saved**: tạm thời thấy mọi thứ. Hãy lưu ngay sau khi tạo để tránh cấp thừa quyền.

Một người thuộc nhiều nhóm thấy **hợp** của các nhóm.

## 4. Catalog access: quyền trên dữ liệu

Tab này giới hạn dữ liệu nào một người, một nhóm, một trợ lý hoặc một danh tính dịch vụ được đọc.

**Tạo một quyền (grant)**

1. Chọn **Principal type**: member (thành viên), group (nhóm), agent (trợ lý) hoặc service identity (danh tính dịch vụ), rồi chọn đối tượng cụ thể.
2. Chọn **Resource type** và nhập **Resource name** theo dạng `catalog`, `catalog.schema` hoặc `catalog.schema.table`.
3. Chọn **Permissions** (ví dụ đọc) và **Effect** (cho phép hoặc từ chối).
4. Tích **Include descendant resources** nếu quyền áp dụng cho mọi thứ bên trong (mọi schema của catalog, mọi bảng của schema).
5. Bấm **Create grant**. Xoá bằng **Delete** trên dòng tương ứng.

Quyền **từ chối** thắng quyền **cho phép** khi trùng nhau. Trợ lý AI cũng cần quyền: nếu người dùng được đọc một bảng nhưng trợ lý thì không, trợ lý sẽ báo _access denied_ khi làm thay họ.

### Danh tính dịch vụ

Chủ sở hữu và quản trị viên tổ chức có thể chọn **Danh tính dịch vụ** trong **Loại chủ thể** ở phần quyền dữ liệu. Chọn **Bộ thực thi nền** cho pipeline và tác vụ nền, hoặc **Danh tính dịch vụ trợ lý** cho dịch vụ trợ lý. Mỗi lựa chọn hiển thị trạng thái bật hoặc tắt. Chọn tài nguyên và các quyền cần thiết, rồi tạo quyền. Các quyền hiện có của dịch vụ được hiển thị và có thể thu hồi bằng nút xóa.

Quyền dữ liệu không bật dịch vụ đang tắt hoặc thay đổi quyền không gian làm việc. Trợ lý theo tên vẫn có quyền riêng và quyền được ủy nhiệm vẫn bị giới hạn bởi quyền của người yêu cầu. Danh tính dịch vụ được tách khỏi người dùng trong phần thành viên.

Chi tiết lần chạy hiển thị **Chạy dưới danh tính** khi Core cung cấp thông tin này. Lỗi truy cập nguồn có liên kết **Quản lý quyền dữ liệu (quản trị viên tổ chức)**. Với bộ thực thi nền, hãy cấp quyền phù hợp cho nguồn và đích; `DESCRIBE` cho phép đọc cấu trúc nguồn nhưng riêng quyền này không bảo đảm pipeline thành công. Chạy lại sau khi sửa quyền cần thiết.

## 5. Agents: quản lý trợ lý AI

Tab **Agent management** liệt kê các trợ lý của tổ chức.

- **New agent** tạo trợ lý mới. Cấu hình viết dạng **YAML** trong ô soạn thảo: tên, mô tả, hướng dẫn hệ thống, các công cụ được dùng.
- **Auto-approved actions**: những hành động trợ lý được làm mà không cần người duyệt. Chỉ thêm khi thật cần.
- **Validate** kiểm tra cấu hình trước khi **Save manifest** lưu. **Copy YAML** sao chép để sao lưu hoặc dùng cho tổ chức khác. **Delete** xoá trợ lý.

Trợ lý mặc định (_chat-assistant_) đã được cấu hình sẵn; chỉ sửa khi hiểu rõ hệ quả.

## 6. Quy trình gợi ý khi nhận bàn giao

1. Overview: kiểm tra thông tin tổ chức, cân nhắc **Enable MFA**.
2. Groups: tạo các nhóm theo bộ phận và lưu **feature visibility** cho từng nhóm.
3. Members: mời thành viên với vai trò phù hợp, thêm vào nhóm.
4. Catalog access: cấp quyền dữ liệu cho nhóm và cho trợ lý.
5. Kiểm tra bằng cách đăng nhập một tài khoản Viewer và xem đúng những gì mong đợi.

## 7. Nhật ký kiểm toán

Mọi thay đổi ở đây (mời, đổi vai trò, tạo quyền, sửa trợ lý) được ghi vào nhật ký kiểm toán cùng người thực hiện và thời điểm. Vai trò **Auditor** được xem nhật ký này mà không cần quyền chỉnh sửa.
