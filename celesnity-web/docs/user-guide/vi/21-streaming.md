# Streaming và thiết bị

Module **Streaming** (nhóm *Data*) nhận dữ liệu thời gian thực từ thiết bị qua giao thức MQTT. Bạn đăng ký một **adapter** (điểm tiếp nhận), cấp thông tin kết nối cho thiết bị, rồi quản lý các thiết bị gửi dữ liệu về ngay trong ứng dụng.

## 1. Đăng ký adapter MQTT

1. Vào **Streaming**. Trang **MQTT streaming** có biểu mẫu **Register MQTT adapter**.
2. Nhập **Tenant storage key**: tiền tố `tnt_` mà mọi dữ liệu thô của adapter này sẽ được lưu dưới đó. Đặt một lần, không đổi sau này.
3. Nhập **Tenant name** và **Adapter name** (tên gợi nhớ, ví dụ *Line A sensors*).
4. Bấm **Register adapter**.
5. Thẻ thông tin kết nối hiện ra: **MQTT broker URL**, **Topic filter**, **Username**, **Password**.

> **Sao chép mật khẩu ngay.** Ứng dụng ghi rõ *"Copy this password now. It will not be shown again."* Lưu vào nơi an toàn rồi bấm **I saved the credential**.

Đưa bốn thông tin trên cho người cấu hình thiết bị hoặc gateway. Thiết bị chỉ cần gửi đúng topic với đúng tài khoản là dữ liệu sẽ vào.

## 2. Quản lý các adapter đã đăng ký

Danh sách **Registered adapters** có các thao tác cho từng adapter:

| Thao tác | Khi nào dùng |
| --- | --- |
| **Pause / Resume** | Tạm dừng nhận dữ liệu (ví dụ khi bảo trì) rồi mở lại. |
| **Rotate credential** | Cấp mật khẩu mới khi nghi ngờ lộ; ứng dụng hỏi lại trước khi đổi. Thiết bị phải được cập nhật mật khẩu mới. |
| **Archive** | Ngừng hẳn adapter. Dữ liệu đã nhận vẫn còn. |

Bấm vào tên adapter để mở phần **Device Management**.

## 3. Quản lý thiết bị (Device Management)

Phần này có sáu tab:

- **Overview**: tổng quan số thiết bị, tình trạng, cảnh báo.
- **Device registry**: danh sách thiết bị (gateway và cảm biến). Đăng ký thiết bị mới; với từng thiết bị có **Activate** (kích hoạt), **Suspend** (tạm ngưng), **Retire** (cho nghỉ), **Replace sensor** (thay cảm biến hỏng bằng cái mới mà vẫn giữ lịch sử).
- **Health & monitoring**: tình trạng kết nối và các cảnh báo. Bấm **Acknowledge** để ghi nhận đã biết, **Clear** để đóng cảnh báo.
- **Remote configuration**: gửi cấu hình xuống thiết bị bằng **Push configuration**; có thể lưu **template** để dùng lại cho nhiều thiết bị.
- **Firmware & OTA**: tải lên bản phần mềm mới (**Upload release**), triển khai cho một thiết bị (**Deploy firmware**), hoặc chạy chiến dịch theo đợt.
- **Provisioning**: quy trình đưa thiết bị mới vào hoạt động.

## 4. Cập nhật phần mềm thiết bị theo đợt (staged rollout)

Để tránh cập nhật toàn bộ thiết bị cùng lúc:

1. Ở tab **Firmware & OTA**, **Upload release**: chọn tệp firmware, ghi phiên bản đích và dòng máy tương thích. Hệ thống tự tính chữ ký và mã kiểm tra.
2. Bấm **Create campaign**: đặt tên, chọn bản firmware, số thiết bị **canary** (đợt thử) và **batch size** (kích thước mỗi đợt).
3. **Start canary**: cập nhật đợt thử trước. Theo dõi tiến độ từng thiết bị.
4. Nếu đợt thử ổn, **Advance batch** để sang đợt tiếp theo. Có vấn đề thì **Abort** để dừng chiến dịch; thiết bị chưa cập nhật vẫn chạy bản cũ.
5. **Deployment history** ghi lại tiến độ từng lần triển khai.

## 5. Quy trình gợi ý

Register adapter → sao chép thông tin kết nối → cấu hình thiết bị gửi dữ liệu → mở adapter → Device registry: đăng ký và Activate thiết bị → theo dõi ở Health & monitoring → khi cần, Push configuration hoặc Deploy firmware.

## 6. Lưu ý

- Chỉ vai trò có quyền ghi (Data engineer, Analyst, quản trị) mới đăng ký adapter hoặc thay đổi thiết bị; Viewer chỉ xem.
- Tab thiết bị có thể bị tắt riêng cho nhóm của bạn (quyền *Devices*), ngay cả khi bạn thấy Streaming.
