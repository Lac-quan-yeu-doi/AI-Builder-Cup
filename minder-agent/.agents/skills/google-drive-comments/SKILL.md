---
name: google-drive-comments
namespace: plugins.google-drive
description: >-
  Google Drive comments on Docs, Sheets, Slides, and Drive files. Currently
  not available — no comment tools are exposed.
---

# Google Drive Comments

This skill covers comment workflows for Google Drive files (Docs, Sheets,
Slides). Comment tools are **not currently available** in Celesnity.

## Status

| Operation | Status |
|---|---|
| Read comments on a file | **Not available** |
| Create a comment | **Not available** |
| Reply to a comment | **Not available** |
| Resolve a comment | **Not available** |

## When This Skill Is Invoked

If the user asks to read, create, or manage comments on a Google Drive file,
tell them plainly:

"Comment tools are not available yet. You can open the file directly in
Google Drive to view or add comments."

Provide the file link using `get_file` if you have the file ID.

## Future Capabilities

When comment tools become available, this skill will support:
- Reading comment threads on any Drive file
- Creating comments with evidence-backed location context
- Replying to existing comment threads
- Resolving comment threads
- Bulk comment operations
