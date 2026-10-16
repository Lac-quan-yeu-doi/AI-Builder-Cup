---
name: google-docs
namespace: plugins.google-drive
description: >-
  Search and find Google Docs by name in Drive (metadata and link only —
  CANNOT read, extract, or summarize text content). No editing, creating,
  or exporting.
---

# Google Docs

Use this skill when the user's task involves Google Docs files. Celesnity can
**discover and identify** Docs through Drive search, but cannot read document
content, edit, create, or export Google Docs.

## Available Operations

| Operation | Status | Tool |
|---|---|---|
| Find a Doc by name | Available | `search_files` with `kind: "document"` |
| Get Doc metadata | Available | `get_file` |
| Read Doc content | **Not available** | — |
| Edit Doc content | **Not available** | — |
| Create new Doc | **Not available** | — |
| Export Doc | **Not available** | — |

## Workflow

1. If the user asks about a Google Doc, use `search_files` with
   `kind: "document"` to find it.
2. Use `get_file` to retrieve metadata (name, modified date, link).
3. Provide the file link so the user can open it directly in Google Docs.

## Scope Limitations

Celesnity's cloud file tools are currently focused on **spreadsheet**
workflows. For Google Docs:

- You can find and identify Docs files in Drive.
- You **cannot** read the document text or structure.
- You **cannot** create, edit, summarize, or export Docs.

When the user asks for an unsupported Docs operation, tell them plainly:
"I can find Google Docs in your Drive, but I cannot read or edit their
content yet. Here is the link so you can open it directly."

## Future Capabilities

When Docs editing tools become available, this skill will be expanded with:
- Document reading and summarization
- Content creation and editing workflows
- Template-based document generation
- Export to PDF and other formats

See `InvokeSkill("google-sheets--error-handling")` for authentication error
handling — the same error codes apply to all cloud file operations.
