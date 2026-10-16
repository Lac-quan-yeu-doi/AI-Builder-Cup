# Hỏi đáp với trợ lý (Home)

**Home** là nơi bạn trò chuyện với trợ lý AI của Celesnity. Bạn hỏi bằng ngôn ngữ tự nhiên; trợ lý tự tìm bảng phù hợp, chạy truy vấn, vẽ biểu đồ và trả lời kèm nhận xét. Bạn không cần biết SQL.

## 1. Màn hình bắt đầu

Khi chưa có cuộc trò chuyện, màn hình hỏi **"What can I help you analyze?"** và có:

- **Ô nhập câu hỏi** ở giữa.
- **Suggested**: bốn gợi ý bắt đầu nhanh: _Explore my data catalog_, _Help me write a SQL query_, _Build a data pipeline_, _Visualize my data_. Bấm một gợi ý là gửi ngay.
- **Recent**: các cuộc trò chuyện gần đây, bấm để mở lại.

Dòng trạng thái phía trên cho biết **"Connected to workspace data"** khi trợ lý sẵn sàng. Nếu thấy **"Chat service is unavailable"**, hãy chờ một lát rồi tải lại; nếu vẫn vậy, báo quản trị viên.

## 2. Ô nhập câu hỏi

| Thành phần                      | Ý nghĩa                                                                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Asking about: All databases** | Phạm vi dữ liệu. Mặc định trợ lý được đọc mọi database; chọn một database cụ thể khi bạn chỉ quan tâm dữ liệu đó. Không đổi được trong lúc trợ lý đang trả lời.                                             |
| **Agent**                       | Chọn trợ lý nào sẽ trả lời (chỉ hiện khi tổ chức có nhiều trợ lý). Chỉ chọn được trước tin nhắn đầu tiên; sau đó cuộc trò chuyện gắn với trợ lý đó.                                                         |
| Nút **+** ("Add to message")    | _Attach a file_: đính kèm PDF vào tin nhắn (chưa đính kèm được ở tin nhắn đầu tiên). _Open a workspace panel_: mở nhanh bảng bên phải: Workspace files, Charts, Automations, Application state, Agent info. |
| Gõ **/**                        | Danh sách lệnh nhanh, cùng bốn gợi ý ở trên.                                                                                                                                                                |
| Gõ **@**                        | Nhắc tới plugin đã kết nối (hiện tại là _Google Drive_) để trợ lý làm việc với tệp trong đó.                                                                                                                |
| **Enter** hoặc nút mũi tên      | Gửi. Shift+Enter để xuống dòng.                                                                                                                                                                             |

Mẹo hỏi cho hiệu quả: nêu rõ **bảng hoặc chủ đề**, **khoảng thời gian**, và **dạng kết quả** bạn muốn (con số, bảng, biểu đồ). Ví dụ: _"Doanh thu theo tháng của quán Ba Ghiền năm 2026, vẽ biểu đồ cột và nhận xét 2 câu."_

## 3. Đọc một câu trả lời

Một câu trả lời thường có các phần sau, từ trên xuống:

1. **View reasoning · N steps**: bấm để xem trợ lý đã làm những bước gì (liệt kê bảng, chạy truy vấn, vẽ biểu đồ). Mỗi bước được gọi bằng tên dễ hiểu.
2. **Biểu đồ / bảng / tài liệu** mà trợ lý tạo ra, hiện ngay trong cuộc trò chuyện (xem trang _Biểu đồ, bảng và tài liệu trong trò chuyện_).
3. **Câu mở đầu** ("Tôi sẽ liệt kê các bảng rồi tính doanh thu…") và **câu trả lời** ở đoạn tiếp theo.
4. **Sources (N)**: nguồn mà câu trả lời dựa vào, nếu có.
5. **Ask more about this**: vài câu hỏi tiếp theo gợi ý; bấm để gửi.
6. **Hàng nút**: _Copy answer_ (sao chép), _Regenerate answer_ (trả lời lại đúng câu hỏi đó, chỉ có ở câu trả lời mới nhất), _View run details_ (chi tiết kỹ thuật của lượt chạy). Các nút Share, Good answer, Poor answer sẽ có ở bản sau.

Trong lúc trợ lý còn làm việc, một thẻ **"Thinking…"** hiện bước đang chạy và số giây đã trôi qua, nằm ngay dưới phần chữ đã có. Khi thẻ biến mất và hàng nút hiện ra nghĩa là câu trả lời đã xong.

## 4. Khi trợ lý hỏi lại hoặc xin phép

- **Câu hỏi làm rõ**: trợ lý hiện câu hỏi kèm vài lựa chọn. Bấm một lựa chọn, hoặc gõ câu trả lời của riêng bạn vào ô nhập (lúc này ô nhập ghi _"Answer to carry on"_).
- **Xin phép thực hiện hành động** ("Waiting for you"): trợ lý mô tả hành động, dữ liệu vào/ra và lý do. Bấm **Approve** để cho phép hoặc **Reject** để từ chối. Hành động ghi rõ _cannot be undone_ thì hãy đọc kỹ trước khi duyệt.
- **Yêu cầu duyệt từ hệ thống** ("Waiting for your approval"): tương tự, với **Approve / Deny**. Yêu cầu quá hạn sẽ báo _"Approval request expired"_; hỏi lại để trợ lý tạo yêu cầu mới.

## 5. Cuộc trò chuyện và bảng bên phải

- **Conversations** (góc trên trái vùng chat): tạo **New conversation**, tìm kiếm, mở lại cuộc trò chuyện cũ. Mỗi cuộc trò chuyện có địa chỉ riêng, có thể gửi cho đồng nghiệp có quyền.
- **Show conversation timeline**: dòng thời gian các lượt hỏi/đáp, tiện khi cuộc trò chuyện dài.
- **Bảng bên phải (stage)**: nơi mở biểu đồ, bảng, tài liệu, thông tin trợ lý, nhật ký chạy. Mỗi mục là một tab; menu **More** của tab cho phép _Split right_, _Split down_, _Maximize_, _Close other tabs_, _Close pane_. Nút **Hide the stage / Show the stage** ẩn hiện cả bảng.
- Khi mở lại cuộc trò chuyện cũ, các biểu đồ trước đó vẫn ở trong lời trả lời; bấm nút mở để đưa lên bảng bên phải.

Mỗi tab giữ cuộc trò chuyện và vị trí cập nhật riêng. Đóng một tab giải phóng kết nối nhưng không dừng lượt trả lời của trợ lý. Cuộc trò chuyện đang nghỉ tạm dừng cập nhật ở lần đổi kết nối bốn phút tiếp theo; khi bạn quay lại tab hoặc gửi tin nhắn mới, hệ thống khôi phục trạng thái và kết quả bị bỏ lỡ trước. Nếu không thể tiếp tục từ vị trí cũ, hệ thống tự tải lại cùng cuộc trò chuyện mà không gửi lại câu hỏi trước đó. Lượt đang chạy và các câu hỏi hoặc yêu cầu duyệt đang chờ vẫn nhận cập nhật. Nếu khôi phục nhiều lần không thành công, bấm **Retry**; phiên đăng nhập hết hạn sẽ đưa bạn về trang đăng nhập.

## 6. Lỗi thường gặp

| Bạn thấy                                                                 | Nghĩa là                                          | Làm gì                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| _That run failed._                                                       | Lượt trả lời bị lỗi.                              | Bấm **Try again**.                                                                              |
| _Connection lost_                                                        | Mất kết nối tới máy chủ giữa chừng.               | Bấm **Retry**; câu trả lời đang dở sẽ được nối tiếp.                                            |
| Gửi tin nhắn báo lỗi nhưng tin nhắn xuất hiện khi mở lại cuộc trò chuyện | Yêu cầu có thể đã hoàn tất trước khi mất kết nối. | Mở lại cuộc trò chuyện và kiểm tra tin nhắn mới nhất trước khi gửi lại để tránh tạo lượt trùng. |
| Trợ lý nói _access denied_ với một bảng                                  | Bạn hoặc trợ lý chưa được cấp quyền đọc bảng đó.  | Xin quyền theo trang _Vai trò và quyền truy cập_.                                               |
| Câu trả lời sai bảng hoặc quá rộng                                       | Phạm vi dữ liệu để "All databases".               | Chọn đúng database ở ô _Asking about_ rồi hỏi lại.                                              |

Cập nhật của trợ lý có thể tiếp tục quá 30 giây trên cùng kết nối. Lượt trả lời dài vẫn có thể hiện **Đang kết nối lại…** trong thời gian ngắn khi kết nối kết thúc; cùng lượt trả lời sẽ tiếp tục từ cập nhật đã nhận gần nhất. Bạn không cần gửi lại câu hỏi.
