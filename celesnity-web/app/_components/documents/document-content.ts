import type { Locale } from '@/app/_i18n/locales';

export interface WorkspaceDocument {
  readonly slug: string;
  readonly title: string;
  /** GitHub-flavoured Markdown; rendered by `DocumentBody`. */
  readonly body: string;
}

/**
 * The guide, written per locale rather than through the translation dictionary.
 *
 * A dictionary entry is a phrase a screen interpolates; these are pages of
 * prose with headings, tables and code. Splitting them into keys would make
 * both unreadable, and a half-translated page is worse than an untranslated
 * one, so each locale carries whole documents.
 */
const vi: readonly WorkspaceDocument[] = [
  {
    slug: 'overview',
    title: 'Tổng quan',
    body: `# Celesnity hoạt động thế nào

Celesnity biến dữ liệu nằm rải rác ở nhiều hệ thống thành các bảng đọc được bằng SQL.

Mọi thứ xoay quanh một **database**. Đó là nơi chứa kết quả, và cũng là nơi bạn làm mọi bước để tạo ra kết quả đó.

## Bốn bước

1. **Kết nối nguồn** — trỏ tới PostgreSQL, MySQL, FTPS hoặc MQTT mà bạn muốn lấy dữ liệu.
2. **Quét metadata** — Celesnity đọc danh sách schema, bảng và cột của nguồn đó.
3. **Dựng pipeline** — kéo thả một đồ thị đọc từ nguồn, biến đổi, rồi ghi vào database.
4. **Chạy** — Spark thực thi, bảng xuất hiện trong database, Trino đọc được ngay.

Thứ tự này bắt buộc. Pipeline chỉ chọn được bảng nguồn sau khi lượt quét đã phát hiện ra bảng đó.

## Vì sao database đứng trước

Node đích của pipeline bắt buộc chọn một database đã tồn tại. Nên phải tạo database trước, rồi mọi thứ khác mới có chỗ để ghi vào.
`,
  },
  {
    slug: 'database',
    title: 'Database',
    body: `# Database

Một **database** trong Celesnity là một *namespace* Iceberg nằm trong catalog \`iceberg\`.

Tên gọi ở các tầng khác nhau, cùng một thứ:

| Nơi | Gọi là |
| --- | --- |
| Giao diện | Database |
| HTTP API | \`schema\` — \`/catalogs/:catalog/schemas\` |
| Node pipeline | \`databaseName\` |
| Trino SQL | \`iceberg.<database>.<bảng>\` |

Chỉ có **một** catalog là \`iceberg\`, cố định từ biến môi trường \`TRINO_CATALOG\`. Vì vậy thanh bên bỏ qua tầng catalog và liệt kê thẳng các database.

## Tạo database

Vào **Database → Tạo cơ sở dữ liệu**. Tên chỉ gồm chữ cái, chữ số và dấu gạch dưới.

\`information_schema\` và \`system\` là namespace hệ thống của Trino. Chúng không hiện ở đây vì pipeline không ghi vào đó được.

## Bên trong một database

| Tab | Nội dung |
| --- | --- |
| **Bảng** | Bảng Iceberg trong database, kèm cột, snapshot và bản xem trước |
| **Nguồn** | Các kết nối cấp dữ liệu cho database này |
| **Pipeline** | Đồ thị ghi vào database này |
| **Lượt chạy** | Lịch sử thực thi của những pipeline đó |
`,
  },
  {
    slug: 'source',
    title: 'Nguồn dữ liệu',
    body: `# Nguồn dữ liệu

Một **nguồn** là một kết nối đã lưu tới hệ thống bạn muốn lấy dữ liệu.

Hỗ trợ: **PostgreSQL**, **MySQL**, **FTPS**. Riêng **MQTT** đi qua mục Streaming vì nó ghi thẳng ra object storage chứ không phải bảng Iceberg.

## Kết nối

Trong database, vào tab **Nguồn → Thêm nguồn**. Điền host, cổng, tên database, tài khoản và chế độ SSL.

Mật khẩu được mã hoá và cất trong credential vault. Nó không bao giờ được trả lại qua API — kể cả khi bạn mở lại form để sửa.

## Kiểm tra kết nối

Bấm **Kiểm tra kết nối**. Celesnity mở một kết nối thật tới hệ thống đó và ghi lại kết quả.

Nguồn **bắt buộc phải xác minh thành công** trước khi gán được lượt quét metadata.

## Một nguồn, ba tab

| Tab | Trả lời câu hỏi |
| --- | --- |
| **Kết nối** | Nó trỏ đi đâu, xác minh lần cuối khi nào |
| **Quét metadata** | Quét theo lịch nào, chạy lần cuối ra sao |
| **Bảng đã phát hiện** | Lượt quét tìm được những gì |

## Một lưu ý về hostname

Nguồn được đọc bởi hai tiến trình khác nhau: API chạy trên máy bạn, còn Spark chạy trong container. Một hostname như \`127.0.0.1\` đúng với API nhưng vô nghĩa bên trong container, và ngược lại \`postgres\` chỉ resolve được trong mạng Docker.

Hãy chọn hostname mà **cả hai** đều gọi tới được, nếu không lượt quét sẽ chạy còn pipeline thì thất bại lúc kết nối.
`,
  },
  {
    slug: 'metadata-scan',
    title: 'Quét metadata',
    body: `# Quét metadata

Lượt quét đọc *cấu trúc* của nguồn — schema, bảng, cột, khoá — chứ không đọc dữ liệu trong bảng.

Mỗi nguồn có **đúng một** lượt quét.

## Vì sao cần

Khi cấu hình node nguồn của pipeline, bạn chọn bảng từ danh sách mà lượt quét đã phát hiện. Chưa quét thì danh sách rỗng và pipeline không dựng được.

## Lịch chạy

Đặt theo giờ trong ngày và múi giờ. Trong lúc một lượt đang chạy, lượt kế tiếp bị bỏ qua chứ không xếp chồng.

Bấm **Quét ngay** để chạy thủ công.

## Đọc kết quả

Mỗi lượt chạy ghi lại số phát hiện được và số thay đổi:

- **Phát hiện** — bao nhiêu schema, bảng, cột nhìn thấy được
- **Thay đổi** — bao nhiêu cái mới, sửa, không đổi, biến mất

Trạng thái **PARTIAL** nghĩa là một phần schema quét được, phần còn lại không — thường do thiếu quyền. Bảng đã lấy được vẫn dùng bình thường.
`,
  },
  {
    slug: 'pipeline',
    title: 'Pipeline',
    body: `# Pipeline

Một **pipeline** là đồ thị kéo thả, được biên dịch thành PySpark rồi chạy trên Spark.

## Ba loại node

| Loại | Ví dụ |
| --- | --- |
| **Nguồn** | Bảng PostgreSQL, bảng Iceberg có sẵn |
| **Biến đổi** | Lọc, chọn cột, đổi tên, gộp nhóm, bỏ trùng, SQL thủ công |
| **Đích** | Bảng Iceberg |

## Node đích

Node **Iceberg table** quyết định pipeline ghi vào đâu — chọn database và tên bảng. Ba chế độ:

- **Tạo mới** — tạo bảng chưa tồn tại
- **Có sẵn + Thêm** — nối thêm dòng vào bảng đang có
- **Có sẵn + Ghi đè** — thay toàn bộ nội dung

## Pipeline thuộc về database nào

Pipeline tạo từ trong một database sẽ thuộc về database đó ngay lập tức, kể cả khi chưa có node đích.

Ngoài ra, đích thực tế của nó là database mà node \`ICEBERG_TARGET\` chỉ định. Hai giá trị này thường trùng nhau; khi lệch, nghĩa là pipeline đã bị sửa để ghi sang chỗ khác.

## Biên dịch

Trước khi chạy, đồ thị được biên dịch thành một file PySpark và lưu lại. Chạy lại một phiên bản luôn thực thi đúng đoạn mã đã sinh ra cho phiên bản đó.
`,
  },
  {
    slug: 'run',
    title: 'Lượt chạy',
    body: `# Lượt chạy

Chạy một pipeline sẽ đưa một *execution* vào hàng đợi. Một worker nhận việc rồi gửi sang Spark.

## Vòng đời

\`QUEUED\` → \`PREPARING\` → \`RUNNING\` → \`SUCCEEDED\` hoặc \`FAILED\`

## Đọc log

Log của Spark được lưu vào object storage và xem được ở chi tiết lượt chạy. Đây là chỗ duy nhất cho biết vì sao một lượt chạy hỏng — thông báo lỗi ở màn danh sách chỉ là dòng tóm tắt.

## Thất bại không xoá dữ liệu cũ

Iceberg ghi theo snapshot. Một lượt chạy hỏng sẽ không commit snapshot mới, nên bảng vẫn giữ nguyên nội dung của lần chạy trước và Trino vẫn đọc được.

Đây là chỗ dễ hiểu nhầm nhất: **nhìn vào bảng thấy có dữ liệu không có nghĩa là lần chạy gần nhất đã thành công.** Hãy xem trạng thái lượt chạy cuối trước khi tin vào con số.
`,
  },
  {
    slug: 'table',
    title: 'Bảng và snapshot',
    body: `# Bảng và snapshot

Bảng trong database là **bảng Apache Iceberg**: file nằm trong object storage, còn danh mục ghi trong PostgreSQL, và Trino đọc chúng như bảng SQL bình thường.

## Xem một bảng

| Khối | Nội dung |
| --- | --- |
| **Cột** | Tên, kiểu, cho phép rỗng hay không |
| **Nguồn gốc** | Pipeline nào sinh ra bảng, đọc từ đâu, chạy lần cuối ra sao |
| **Snapshot** | Từng lần ghi, kèm thao tác và số dòng |
| **Xem trước** | Một ít dòng, giới hạn phía server |

## Snapshot

Mỗi lần pipeline ghi xong, Iceberg commit một snapshot mới thay vì sửa đè file cũ. Danh sách snapshot chính là lịch sử ghi của bảng đó.

## Truy vấn

Dùng **SQL** để truy vấn qua Trino, tên đầy đủ là \`iceberg.<database>.<bảng>\`. Truy vấn chỉ đọc và số dòng trả về bị giới hạn phía server.
`,
  },
];

const en: readonly WorkspaceDocument[] = [
  {
    slug: 'overview',
    title: 'Overview',
    body: `# How Celesnity works

Celesnity turns data scattered across systems into tables you can query with SQL.

Everything is organised around a **database**. It holds the results, and it is also where you do every step that produces them.

## Four steps

1. **Connect a source** — point at the PostgreSQL, MySQL, FTPS or MQTT system you want data from.
2. **Scan its metadata** — Celesnity reads that source's schemas, tables and columns.
3. **Build a pipeline** — a graph that reads the source, transforms it, and writes into the database.
4. **Run it** — Spark executes, the table appears in the database, and Trino can read it immediately.

The order is not optional. A pipeline can only pick a source table once a scan has discovered it.

## Why the database comes first

A pipeline's target node has to pick a database that already exists. So the database is created first, and everything else has somewhere to write to.
`,
  },
  {
    slug: 'database',
    title: 'Database',
    body: `# Database

A **database** in Celesnity is an Iceberg *namespace* inside the \`iceberg\` catalog.

One thing, named differently at each layer:

| Where | Called |
| --- | --- |
| This interface | Database |
| HTTP API | \`schema\` — \`/catalogs/:catalog/schemas\` |
| Pipeline node | \`databaseName\` |
| Trino SQL | \`iceberg.<database>.<table>\` |

There is exactly **one** catalog, \`iceberg\`, fixed by the \`TRINO_CATALOG\` setting. The sidebar therefore skips the catalog level and lists databases directly.

## Creating one

Go to **Databases → Create database**. Names take letters, digits and underscores only.

\`information_schema\` and \`system\` are Trino's own namespaces. They are not offered here because a pipeline cannot write into them.

## Inside a database

| Tab | Holds |
| --- | --- |
| **Tables** | The Iceberg tables, with columns, snapshots and a preview |
| **Sources** | The connections feeding this database |
| **Pipelines** | The graphs that write into it |
| **Runs** | The execution history of those pipelines |
`,
  },
  {
    slug: 'source',
    title: 'Sources',
    body: `# Sources

A **source** is a saved connection to the system you are taking data from.

Supported: **PostgreSQL**, **MySQL**, **FTPS**. **MQTT** goes through Streaming instead, because it writes to object storage rather than to an Iceberg table.

## Connecting

From inside a database, open the **Sources** tab and choose **New source**. Fill in the host, port, database, user and SSL mode.

The password is encrypted into the credential vault. It is never returned by the API — not even when you reopen the form to edit it.

## Testing

Press **Test connection**. Celesnity opens a real connection to the system and records the outcome.

A source **must verify successfully** before a metadata scan can be assigned to it.

## One source, three tabs

| Tab | Answers |
| --- | --- |
| **Connection** | Where it points, and when it last verified |
| **Metadata scan** | What schedule it runs on, and how the last run went |
| **Discovered tables** | What the scan found |

## A note about hostnames

A source is reached by two different processes: the API on your machine, and Spark inside a container. A hostname like \`127.0.0.1\` is right for the API and meaningless inside the container; \`postgres\` resolves only on the Docker network.

Pick a hostname **both** can reach, or the scan will succeed while the pipeline fails at connection time.
`,
  },
  {
    slug: 'metadata-scan',
    title: 'Metadata scan',
    body: `# Metadata scan

A scan reads a source's *structure* — schemas, tables, columns, keys. It does not read the rows.

Each source has exactly **one** scan.

## Why it is needed

When you configure a pipeline's source node, you pick a table from what the scan discovered. Without a scan that list is empty and the pipeline cannot be built.

## Schedule

Set a time of day and a timezone. While a run is in progress the next one is skipped rather than queued behind it.

Press **Scan now** to run it by hand.

## Reading the result

Every run records what it saw and what changed:

- **Discovered** — how many schemas, tables and columns were visible
- **Changes** — how many were created, updated, unchanged or have disappeared

A **PARTIAL** status means some schemas were scanned and others were not, usually for lack of permission. What was collected is still usable.
`,
  },
  {
    slug: 'pipeline',
    title: 'Pipelines',
    body: `# Pipelines

A **pipeline** is a graph you build on a canvas, compiled to PySpark and run on Spark.

## Three kinds of node

| Kind | Examples |
| --- | --- |
| **Source** | A PostgreSQL table, an existing Iceberg table |
| **Transform** | Filter, select fields, rename, aggregate, drop duplicates, manual SQL |
| **Target** | An Iceberg table |

## The target node

The **Iceberg table** node decides where the pipeline writes — a database and a table name. Three modes:

- **Create new** — creates a table that does not exist yet
- **Existing + Append** — adds rows to a table already there
- **Existing + Overwrite** — replaces the contents entirely

## Which database a pipeline belongs to

A pipeline created inside a database belongs to it immediately, even before it has a target node.

Separately, where it actually writes is the database its \`ICEBERG_TARGET\` node names. The two usually agree; when they differ, the pipeline has been edited to write somewhere else.

## Compilation

Before running, the graph is compiled into a PySpark file and stored. Re-running a version always executes exactly the code that version produced.
`,
  },
  {
    slug: 'run',
    title: 'Runs',
    body: `# Runs

Running a pipeline queues an *execution*. A worker claims it and submits it to Spark.

## Lifecycle

\`QUEUED\` → \`PREPARING\` → \`RUNNING\` → \`SUCCEEDED\` or \`FAILED\`

## Reading the log

Spark's output is stored in object storage and shown on the execution detail. It is the only place that says why a run failed — the message on the list is a one-line summary.

## A failure does not erase the previous data

Iceberg writes in snapshots. A failed run commits no new snapshot, so the table keeps what the previous run wrote and Trino still reads it.

This is the easiest thing to misread: **a table having data does not mean the latest run succeeded.** Check the last run's status before trusting the numbers.
`,
  },
  {
    slug: 'table',
    title: 'Tables and snapshots',
    body: `# Tables and snapshots

A table in a database is an **Apache Iceberg table**: files in object storage, a catalog in PostgreSQL, and Trino reading them as ordinary SQL tables.

## Looking at one

| Block | Shows |
| --- | --- |
| **Columns** | Name, type, whether nulls are allowed |
| **Lineage** | Which pipeline produced it, what it read, how the last run went |
| **Snapshots** | Every write, with its operation and row counts |
| **Preview** | A sample of rows, capped by the server |

## Snapshots

Each time a pipeline finishes writing, Iceberg commits a new snapshot rather than overwriting the old files. The snapshot list is that table's write history.

## Querying

Use **SQL** to query through Trino; the full name is \`iceberg.<database>.<table>\`. Queries are read-only and the row count is capped server-side.
`,
  },
];

const byLocale: Readonly<Record<Locale, readonly WorkspaceDocument[]>> = { en, vi };

export function workspaceDocuments(locale: Locale): readonly WorkspaceDocument[] {
  return byLocale[locale];
}
