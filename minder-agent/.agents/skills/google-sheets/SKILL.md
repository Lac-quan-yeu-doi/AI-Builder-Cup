---
name: google-sheets
namespace: plugins.google-drive
description: >-
  Read, analyze, consolidate, or create Google Sheets in the user's connected
  Drive. Use when the user wants to find a spreadsheet, inspect tabs or ranges,
  compare data, write summaries, or create new spreadsheets from existing ones.
---

# Google Sheets

Use this skill to keep spreadsheet work grounded in the exact spreadsheet,
sheet, range, and headers that matter.

### Clarification questions

- Ask for new spreadsheets or major analysis. Skip for simple lookups.
- Questions should cover topic, audience, and purpose and come before planning.
- Focus on consequential dimensions not stated or clearly implied.
- Once topic, audience, and purpose are clear, proceed without asking. Choose
  emphasis, format, length, style, and details. Use placeholders for missing facts.

## Purpose Of This File

This file covers:

1. Routing to the right spreadsheet workflow
2. Core rules and mandatory read order
3. Reference to detailed specs in `references/`

Detailed tool parameters, consolidation procedures, error codes, read safety,
formula guidance, and style defaults live in `references/`.

## Scope

Celesnity exposes five cloud file tools. All operations are **read + create
only** — existing files are never modified or deleted.

| Tool | Purpose |
|---|---|
| `search_files` | Find files by name, kind, folder, or date |
| `get_file` | Retrieve one file's metadata |
| `get_spreadsheet_overview` | Spreadsheet structure: sheets, headers, sample rows |
| `read_spreadsheet_range` | Read computed cell values from one sheet |
| `create_spreadsheet` | Create a new spreadsheet (optionally copying an existing one) |

## Default Routing

| User wants to… | Do this |
|---|---|
| Find a spreadsheet | `search_files` with words from the name and `kind: "spreadsheet"` |
| Understand a spreadsheet | `get_spreadsheet_overview` — always call this before reading |
| Read data | `read_spreadsheet_range` — one sheet at a time, only needed columns |
| Consolidate / merge data | Load `InvokeSkill("google-sheets--consolidation-workflow")` first |
| Create a new file | `create_spreadsheet` — with or without `source_file_id` |
| Summarize or analyze data | Overview → read relevant ranges → present findings |
| Compare spreadsheets | Overview both → read comparable ranges → present differences |
| Edit / delete a file | Explain you cannot; offer to create an updated copy instead |

## File Safety

Treat a provided Google Sheet as **read-only**. When a task uses the Sheet as
a reference, template, or data source, copy it with `create_spreadsheet` using
`source_file_id`, then apply changes on the copy only.

## Required Read Order

Before performing any spreadsheet task, read the relevant reference files:

| Task area | Required reference |
|---|---|
| Exact tool parameters, limits, return shapes | `InvokeSkill("google-sheets--tool-reference")` |
| Consolidation / merge / tổng hợp workflow | `InvokeSkill("google-sheets--consolidation-workflow")` |
| Error recovery | `InvokeSkill("google-sheets--error-handling")` |
| Safe reads: tab names, range bounding, pagination | `InvokeSkill("google-sheets--read-safety")` |
| Formula design for `create_spreadsheet` | `InvokeSkill("google-sheets--formula-patterns")` |
| Styling defaults for new spreadsheets | `InvokeSkill("google-sheets--style-profiles")` |
| Final quality check before reporting | `InvokeSkill("google-sheets--visual-quality")` |

Do not execute reads or creates until the relevant references are loaded.

## Connector Load Checklist

1. Confirm the exact target spreadsheet before reading. If the user only gives
   a title or keywords, use `search_files` to identify candidates.
2. Call `get_spreadsheet_overview` to learn sheet names, row counts, column
   counts, and headers.
3. Use exact sheet names from the overview. Sheet names are case-sensitive and
   may contain spaces.
4. Read only the columns and rows you need. Include the header row in the first
   page.
5. Use `nextOffset` for pagination. Stop once you have enough data.
6. Before creating a spreadsheet, confirm the source file ID and target sheet
   names match exactly.

## Core Rules

1. **Overview before reading.** Always call `get_spreadsheet_overview` before
   `read_spreadsheet_range`. It tells you sheet names, sizes, and headers.
2. **Read selectively.** Limit ranges to the columns and rows you need.
   Include the header row (`A1:…`) in the first page.
3. **Never modify originals.** Use `create_spreadsheet` with `source_file_id`
   to create a copy, then apply changes on the copy only.
4. **Lead with findings.** Name the file and sheet you used. Numbers before
   methodology.
5. **Handle auth errors.** If a tool returns `NOT_CONNECTED` or
   `NEEDS_REAUTH`, tell the user to sign in to Google Drive under Plugins
   and stop. Do not retry.

## Output Conventions

- Always reference the spreadsheet name, sheet name, and range when describing
  findings.
- For analysis tasks, present a compact summary with the key numbers first,
  then methodology.
- For consolidation results, state how many rows were added, skipped, and why.
- For comparisons, use a clear table showing differences.

## Canonical Workflow Bias

Prefer one simple proven workflow over a large tree of recovery branches.
When a task matches a known successful pattern, follow that pattern directly
instead of re-evaluating every possible fallback path.

For spreadsheet tasks, prefer this sequence:

1. Gather the required source material (search → overview → read).
2. Pick the correct routing from the table above.
3. Load relevant references.
4. Perform the task.
5. Report findings or provide the new spreadsheet link.
6. Stop once the workflow has succeeded.
