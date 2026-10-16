# UI/UX redesign — what shipped

Mockup that drove it: `docs/mockup/celesnity-workspace.html` (mở bằng trình duyệt,
⌘B để thu gọn sidebar).

Hai commit ở `celesnity-web` (branch `refactor/design-system`) và một ở
`celesnity-core` (branch `feat/pipeline-target-database`).

---

## 1. Vấn đề

`workspace-navigation.ts` khai **10 điểm đến ngang hàng** trên một thanh header
56px. Năm trong số đó — database service, metadata crawler, catalog, pipeline,
script — là _các bước của cùng một công việc_, nhưng được bày ra như _10 nơi
ngang nhau_. Không chỗ nào trong UI nói rằng phải quét metadata xong thì pipeline
mới đọc được nguồn. Dưới 1400px nhãn bị ẩn, còn lại 10 icon không chú thích.

Thêm hai chỗ: `app/page.tsx` redirect vào `/database-services` — màn đầu tiên là
một danh sách CRUD connector rỗng. Và bảy màn mở đầu bằng tiêu đề
`clamp(2.4rem, 5vw, 4.45rem)` (tới **71px**) kèm eyebrow và một đoạn mô tả, tốn
khoảng **250px** phía trên mỗi màn.

---

## 2. Đã làm

### Sidebar thay cho header

`workspace-shell.tsx` viết lại: **268px**, thu gọn còn **56px** icon rail, phím
tắt **⌘B / Ctrl+B**, trạng thái lưu qua `sidebar.store.ts` (`skipHydration` +
rehydrate trong effect, theo đúng pattern của `locale.store.ts`).

Một `<aside>` phục vụ cả hai bề rộng — dưới 761px là overlay trượt từ trái — nên
không điểm đến nào bị nhân đôi cho screen reader. Việc thu gọn là CSS
(`min-[761px]:hidden` trên nhãn), nên rail thu gọn ở desktop không làm hỏng
overlay trên màn hẹp.

Điều hướng gom thành nhóm, nhóm dữ liệu xếp theo thứ tự công việc thật:

```
Trang chủ
DỮ LIỆU   Database ─ analytics, raw …   Nguồn dữ liệu   Streaming   Pipeline   Script
CÔNG CỤ   SQL   Lượt chạy
          Quản trị
```

Dưới mục **Database** là chính các database. Cây catalog cũ mở đầu bằng một tầng
không bao giờ rẽ nhánh — `listCatalogs()` hard-code trả về đúng một phần tử từ
`TRINO_CATALOG` — nên rail bỏ tầng đó.

### Từ vựng khớp với model của Core

`Catalog` → **Database**, `Database Services` → **Nguồn dữ liệu**,
`Metadata Crawler` → **Quét metadata**, `Executions` → **Lượt chạy**,
`Chat` → **Trang chủ**. Đủ cả `en` và `vi`.

`app/page.tsx` giờ redirect vào `/chat`.

### PageBar thay hero

`app/_components/ui/page-bar.tsx` — thanh 48px: tên màn, số đếm, hành động chính.
Áp cho 7 màn. Bảy câu tiêu đề cũ là **chuỗi tiếng Anh hardcode trong JSX**, không
đi qua `t()`, nên chuyển sang VI vẫn ra tiếng Anh; giờ đọc từ dictionary.

### Màn database

`/databases/[database]` — tab **Bảng** mặc định, rồi **Pipeline** và **Nguồn**.
Bảng đứng trước vì xem database có gì là lý do người ta mở nó; pipeline sinh ra
chúng và nguồn mà pipeline đọc là đường "thêm bảng vào đây".

Một pipeline thuộc về database khi node `ICEBERG_TARGET` của nó chỉ định database
đó. Bản nháp chưa có target thì **không thuộc về đâu**, chứ không thuộc về tất cả.

### Quét metadata gộp vào Nguồn

Mỗi nguồn hiện trạng thái lượt quét gần nhất, số bảng phát hiện được, và link vào
danh sách đó; chưa gán thì hiện cách gán. Bằng chứng hai màn là một đối tượng:
cột đầu của bảng crawler chính là `item.databaseService.name`, và
`DatabaseMetadataCrawler.databaseServiceId` là `@unique`.

`Quét metadata` rời khỏi sidebar. `/metadata-crawler` vẫn phục vụ luồng gán và
danh sách bảng đã phát hiện.

### Core

Branch `feat/pipeline-target-database`, commit `265aa1a`:

- `summarizePipelineGraph` (domain) đọc `databaseName` của node `ICEBERG_TARGET`
  và các connection id mà node nguồn resolve qua — cùng quy ước `resourceId` mà
  graph validator và compiler đang dùng. `PipelineSummaryResponseDto` trả thêm
  `targetDatabase` và `sourceConnectionIds`, nên nhóm pipeline theo database
  không còn cần `GET /pipelines/:id` cho từng dòng.
- `GET /catalogs/:catalog/schemas?writable=true` trả `listWritableSchemas`. Bộ
  lọc này đã có sẵn nhưng chỉ node-catalog với tới được, nên cây catalog vẫn hiện
  `information_schema` và `system` như thể chúng là database.

---

## 3. Lỗi có sẵn phát hiện được khi làm

1. `PageContainer` và ba quy tắc trong chat trừ đi 56px cho thanh header — thanh
   đó không còn trên desktop, mọi màn full-height sẽ hụt.
2. Banner lỗi đăng xuất dùng `danger-line` / `danger-surface` / `danger-ink` —
   **không token nào định nghĩa**, nên thông báo đó bấy lâu không có màu.
3. `listPipelinesQuerySchema` chặn `pageSize` ở 100; màn database ban đầu xin 200
   và bị từ chối. Phát hiện nhờ chụp màn hình bản build thật.

Cả ba đã sửa.

---

## 4. Kiểm chứng

|                         | celesnity-web                     | celesnity-core  |
| ----------------------- | --------------------------------- | --------------- |
| `typecheck`             | ✓                                 | ✓               |
| `lint` (gồm boundaries) | ✓                                 | ✓               |
| `format:check`          | ✓                                 | ✓               |
| `build`                 | ✓                                 | —               |
| unit                    | **574 / 575**                     | **1224 / 1224** |
| visual (Playwright)     | **22 / 22**, baseline đã cập nhật | —               |

Hai suite còn đỏ đều **đã đỏ từ trước**, không liên quan:
`chat-screen > accumulates token totals` (web) và
`src/tests/application/chart/chart.use-cases.spec.ts` (core — file rỗng còn sót
lại sau khi module chart bị bỏ).

---

## 5. Còn lại

- **`npm run api:generate`** khi Core mới chạy được: `targetDatabase` và
  `sourceConnectionIds` hiện đọc qua index kèm chú thích ở
  `core-api-pipeline.repository.ts` vì OpenAPI types trong repo có trước chúng.
- **Lọc `?writable=true`** chưa được web gọi — cây catalog vẫn hiện
  `information_schema` và `system`. Đổi một chỗ trong
  `core-api-catalog.repository.ts` là xong.
- **⌘K command palette** — chưa làm.
- **Canvas pipeline** vẫn là route riêng `/pipelines/[pipelineId]`, chưa nhúng
  vào màn database.
