---
name: google-slides
namespace: plugins.google-drive
description: >-
  Search and find Google Slides by name in Drive (metadata and link only —
  CANNOT read, extract, or summarize slide content). No editing, creating,
  or exporting.
---

# Google Slides

Use this skill when the user's task involves Google Slides presentations.
Celesnity can **discover and identify** Slides through Drive search, but
cannot read slide content, edit, create, or export presentations.

## Available Operations

| Operation | Status | Tool |
|---|---|---|
| Find a presentation by name | Available | `search_files` with `kind: "presentation"` |
| Get presentation metadata | Available | `get_file` |
| Read slide content | **Not available** | — |
| Edit slides | **Not available** | — |
| Create new presentation | **Not available** | — |
| Export presentation | **Not available** | — |

## Workflow

1. If the user asks about a Google Slides file, use `search_files` with
   `kind: "presentation"` to find it.
2. Use `get_file` to retrieve metadata (name, modified date, link).
3. Provide the file link so the user can open it directly in Google Slides.

## Scope Limitations

Celesnity's cloud file tools are currently focused on **spreadsheet**
workflows. For Google Slides:

- You can find and identify presentations in Drive.
- You **cannot** read slide content, speaker notes, or structure.
- You **cannot** create, edit, or export presentations.

When the user asks for an unsupported Slides operation, tell them plainly:
"I can find Google Slides presentations in your Drive, but I cannot read or
edit their content yet. Here is the link so you can open it directly."

## Future Capabilities

When Slides tools become available, this skill will be expanded with:
- Presentation reading and summarization
- Slide creation and editing workflows
- Template-based deck generation
- Export to PDF and other formats

See `InvokeSkill("google-sheets--error-handling")` for authentication error
handling — the same error codes apply to all cloud file operations.
