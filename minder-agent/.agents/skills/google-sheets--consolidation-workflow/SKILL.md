---
name: google-sheets--consolidation-workflow
namespace: plugins.google-drive
description: >-
  Step-by-step procedure for merging (tổng hợp) data from one or more source
  spreadsheets into a target spreadsheet. Load when the user asks to
  consolidate, merge, combine, or tổng hợp spreadsheet data.
---

# Consolidation Workflow

Use this workflow when the user asks to merge, consolidate, or "tổng hợp" data
from one or more source files (A) into a target file (B). The original files
are never changed — a copy of B is created with the new data appended.

## Prerequisites

- You already have file IDs for A and B (from `search_files` or a user link).
- You have called `get_spreadsheet_overview` for both files.
- Read `InvokeSkill("google-sheets--read-safety")` before range reads.

## Step 1: Map columns

Compare headers between A and B. Map each column in A to the corresponding
column in B **by meaning**, not by position. Column order may differ.

State the mapping in one short list:

```
A "Ngày"       → B "Date"
A "Số lượng"   → B "Quantity"
A "Đơn giá"    → B "Unit Price"
A "Ghi chú"    → (no match in B — will be skipped)
```

If a critical column cannot be mapped, ask the user before proceeding.

## Step 2: Identify new rows

Read the relevant columns from A. Then read enough of B (the ID or date
column) to determine which rows already exist.

- Use a **date column** or a **unique ID column** to detect duplicates.
- Only collect rows that B does not already contain.
- If no reliable dedup column exists, tell the user and ask which column to
  use, or whether to append all rows.

## Step 3: Validate formats

Before building the output rows, check:

| Check | Action |
|---|---|
| Number in A, text in B | Convert to number |
| Different date formats | Normalize to B's format (ISO or locale) |
| Missing values | Use `null` — do not invent data |
| Extra columns in A | Skip unless the user asked for them |

## Step 4: Create the consolidated copy

Call `create_spreadsheet` with:

```
source_file_id: <B's file ID>
name: "<B name> - <YYYY-MM-DD>"
sheets:
  - name: <target sheet name>
    mode: append
    rows: <new rows in B's column order>
```

**Important:**
- `mode: "append"` — adds rows after B's existing data.
- Do NOT include the header row in `rows` when appending.
- Rows must follow B's column order, not A's.
- The original B is untouched — only the copy is modified.

## Step 5: Report

Tell the user:

1. The new file's **name and link**.
2. How many rows were **added** per sheet.
3. How many rows were **skipped** (duplicates) and why.
4. Any columns from A that were **not mapped**.

## Multi-source consolidation

When merging from multiple source files (A₁, A₂, …) into one target B:

1. Overview all source files first.
2. Confirm all source files share compatible headers.
3. Process each source file's new rows, deduplicating against B **and**
   against previously processed sources.
4. Combine all new rows into a single `create_spreadsheet` call.

## Edge cases

| Situation | Action |
|---|---|
| B is empty (no data rows) | Use `mode: "replace"`, include header row |
| A has multiple sheets | Ask user which sheet(s) to consolidate |
| B has multiple target sheets | Map each source sheet to its target; one sheet object per target |
| Row count > 500 | Split into multiple `create_spreadsheet` calls or warn about truncation |
| User says "update" or "edit" | Explain you create a copy; offer the consolidation workflow |
