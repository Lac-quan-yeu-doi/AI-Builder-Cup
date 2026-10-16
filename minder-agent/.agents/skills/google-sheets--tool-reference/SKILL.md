---
name: google-sheets--tool-reference
namespace: plugins.google-drive
description: >-
  Detailed parameters, limits, and return shapes for each cloud file MCP tool.
  Load when you need exact argument names, types, or pagination details.
---

# Cloud File Tool Reference

## search_files

Find files in the user's connected cloud storage.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `query` | string | no | Text contained in the file name |
| `kind` | enum | no | `spreadsheet`, `document`, `presentation`, `pdf`, `folder`, `other` |
| `folder_id` | string | no | Only files directly inside this folder |
| `modified_after` | ISO datetime | no | Filter by modification date |
| `page_size` | integer | no | 1–50, default 20 |
| `page_token` | string | no | Continuation token from a previous page |

**Returns:** array of `{ id, name, kind, modifiedTime, link }`, newest first.
Pass `page_token` from the response to fetch the next page.

---

## get_file

Retrieve one file's metadata.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `file_id` | string | **yes** | The file to look up |

**Returns:** `{ id, name, kind, size, modifiedTime, revision, link, platformCreated }`.
`platformCreated` is `true` when this file was created by Minder, not the user.

---

## get_spreadsheet_overview

Understand a spreadsheet before reading it. **Always call this first.**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `file_id` | string | **yes** | The spreadsheet |
| `sample_rows` | integer | no | 0–20, default 5; sample rows per sheet |

**Returns:** per-sheet summary with `{ name, rows, columns, headers, sampleRows }`.
Use `headers` to decide which columns to read. Use `rows` to decide whether
you need pagination.

---

## read_spreadsheet_range

Read computed cell values from one sheet.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `file_id` | string | **yes** | The spreadsheet |
| `sheet` | string | **yes** | Sheet name exactly as in the overview |
| `range` | string | no | A1 range like `A1:F200` (no sheet name prefix) |
| `offset` | integer | no | Row offset for pagination, default 0 |
| `limit` | integer | no | 1–500, default 200 |

**Returns:** `{ rows, nextOffset }`. Pass `nextOffset` back as `offset` to
continue. Values are computed (not formulas). Dates arrive as ISO strings.
Merged cells repeat their value in every covered position.

**Tips:**
- Always include the header row (`A1:…`) in the first page.
- Read only the columns you need — e.g., `A1:C500` not the entire sheet.
- Stop paginating once you have enough data.
- See `InvokeSkill("google-sheets--read-safety")` for detailed safe-read
  patterns, tab name resolution, and recovery from failed reads.

---

## create_spreadsheet

Create a **new** spreadsheet. Existing files are never modified.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `name` | string | **yes** | Name of the new file |
| `source_file_id` | string | no | Copy this spreadsheet first, then apply sheets |
| `folder_id` | string | no | Place the new file in this folder |
| `sheets` | array | **yes** | Array of sheet objects (see below) |

**Sheet object:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | **yes** | Sheet name (must match an existing sheet when using `source_file_id` + `append`) |
| `mode` | enum | no | `replace` (default) or `append` |
| `rows` | array of arrays | **yes** | Cell values: string, number, boolean, or null |

**Modes:**
- `replace` — clear the sheet and write these rows (include headers).
- `append` — add rows after the last existing row (do NOT include headers).

**Returns:** `{ id, name, link }` — the new file's metadata.

**Tips:**
- Use `source_file_id` + `append` when adding rows to a copy of an existing file.
- Use `replace` when building a new summary or extract from scratch.
- Keep sheet payloads under a few hundred rows per call.
