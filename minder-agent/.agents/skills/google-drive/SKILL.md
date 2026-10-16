---
name: google-drive
namespace: plugins.google-drive
description: >-
  Top-level router for Google Drive. Can search files, read spreadsheet data,
  and create new spreadsheets. For Docs/Slides/PDFs: search and metadata only,
  CANNOT read or extract their text content. Cannot edit or delete any file.
---

# Google Drive

Use this as the top-level router for Google file work. Start here for file
discovery and metadata tasks, then route to narrower sibling skills when the
task becomes specific to a file type.

## Available Tools

Celesnity currently exposes five Google Drive MCP tools through the
`google_drive` server. All operations are **read + create only** — existing
files are never modified or deleted.

| Tool | Purpose |
|---|---|
| `search_files` | Find files by name, kind, folder, or date |
| `get_file` | Retrieve one file's metadata |
| `get_spreadsheet_overview` | Spreadsheet structure: sheets, headers, sample rows |
| `read_spreadsheet_range` | Read computed cell values from one sheet |
| `create_spreadsheet` | Create a new spreadsheet (optionally copying an existing one) |

## Workflow

1. **Ground the target file first.**
   - If the user did not provide an exact file URL or ID, use `search_files`
     to identify the right file.
   - If the request starts as "find X and then work with it," do the Drive
     discovery step first instead of guessing the target.

2. **Stay in the base Google Drive workflow for Drive-native tasks.**
   - Use `search_files` and `get_file` for search, metadata inspection, and
     file discovery across all file types.
   - For version-history or revision requests, note that revision tools are
     not currently available. Tell the user plainly.

3. **Route to the narrowest sibling skill that matches the file type and job.**
   - Spreadsheet analysis, reading, creation, or consolidation:
     use `InvokeSkill("google-sheets")`.
   - Google Docs file found via search — read-only summary:
     use `InvokeSkill("google-docs")`.
   - Google Slides file found via search — read-only summary:
     use `InvokeSkill("google-slides")`.

## Routing Rules

- If the request is ambiguous between Drive and a file-type surface, use the
  file kind as the tie-breaker:
  - `spreadsheet` → Sheets skill
  - `document` → Docs skill
  - `presentation` → Slides skill
- If the user wants to find a file and then work with it, do both in one flow:
  Drive for discovery, then the file-type skill for the work.
- If the user wants a Google Workspace outcome but has not named a file type
  yet, start with Drive discovery instead of asking them to choose.

## Scope Limitations

Celesnity operates under `drive.readonly` + `drive.file` scopes:

| Capability | Status |
|---|---|
| Search all files | Available |
| Read file metadata | Available |
| Read spreadsheet data | Available |
| Create new spreadsheets | Available (app-created files) |
| Edit existing files | **Not available** |
| Delete / trash files | **Not available** |
| Share / change permissions | **Not available** |
| Export / download files | **Not available** |
| Move / rename files | **Not available** |

When the user asks for an unavailable operation, tell them plainly what is not
supported and suggest an alternative where possible (e.g., "I can create a new
spreadsheet with the updated data instead of editing the original").

## Write Safety

- Never claim you can edit, delete, or share an existing file.
- When creating a spreadsheet from a source (`source_file_id`), the original
  is untouched — only the copy is modified.
- Treat every user file as read-only unless creating a new one.

## Related Skills

- Sheets: `InvokeSkill("google-sheets")`
- Docs: `InvokeSkill("google-docs")`
- Slides: `InvokeSkill("google-slides")`
- Error handling: `InvokeSkill("google-sheets--error-handling")`
