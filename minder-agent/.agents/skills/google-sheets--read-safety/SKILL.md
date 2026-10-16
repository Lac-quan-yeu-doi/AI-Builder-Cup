---
name: google-sheets--read-safety
namespace: plugins.google-drive
description: >-
  Safe practices for reading spreadsheet data: tab name resolution, range
  bounding, pagination, and recovery patterns. Load before reading ranges
  from an existing Google Sheet.
---

# Read Safety

When to read: before `read_spreadsheet_range` calls against an existing
Google Sheet.

## Rules

- Call `get_spreadsheet_overview` before any range read. Record visible sheet
  names, row counts, column counts, and headers.
- Use exact sheet names from the overview. Do not assume `Sheet1`, `Sheet2`,
  localized default names, or title-derived tab names.
- Sheet names are case-sensitive and may contain spaces.
- If a spreadsheet has exactly one sheet, you may infer that sheet for reading
  after the overview confirms it.
- Read only the columns you need — e.g., `A1:C500` not the entire sheet.
- Include the header row (`A1:…`) in the first page so column meanings are
  clear.
- Use `limit` to control page size (max 500 rows per call).
- Stop paginating once `nextOffset` is absent (end of data) or you have enough
  data.
- Prefer targeted reads (specific columns, bounded rows) over full-sheet dumps.

## Pagination Pattern

```
Page 1: read_spreadsheet_range(file_id, sheet, "A1:F500", offset=0, limit=200)
Page 2: read_spreadsheet_range(file_id, sheet, "A1:F500", offset=200, limit=200)
…until nextOffset is absent
```

## Recovery Patterns

| Problem | Action |
|---|---|
| Sheet name not found | Re-check the overview. Compare against exact visible names. |
| Empty result (0 rows) | Confirm the sheet exists and has data in the overview. Tell the user if empty. |
| Range too large | Shrink to header plus likely data columns, then page through bounded chunks. |
| Merged cells | Values repeat in every covered cell. Do not double-count merged regions. |
| Dates as numbers | Some spreadsheets store dates as serial numbers. If values look like 5-digit numbers where dates are expected, note this to the user. |
| `nextOffset` absent but expecting more | You have reached the end of data. Do not retry. |

## Anti-Patterns

- Do not read an entire sheet when you only need a few columns.
- Do not guess sheet names — always use the overview.
- Do not retry the same failed range. Re-check the overview and adjust.
- Do not paginate beyond what you need for the task.
