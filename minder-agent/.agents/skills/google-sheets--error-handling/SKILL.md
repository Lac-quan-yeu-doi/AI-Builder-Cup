---
name: google-sheets--error-handling
namespace: plugins.google-drive
description: >-
  Common cloud file tool errors and recovery actions. Load when a tool call
  fails or returns an unexpected error code.
---

# Error Handling

These error codes and recovery actions apply to **all** cloud file tool
operations — not just spreadsheet work. The google-drive, google-docs, and
google-slides skills share the same error surface.

## Authentication errors

| Error code | Meaning | Action |
|---|---|---|
| `NOT_CONNECTED` | User has not connected Google Drive | Tell the user: "Please sign in to Google Drive under **Plugins** to continue." Stop — do not retry. |
| `NEEDS_REAUTH` | Token expired or permissions revoked | Same message as above. The user must re-authorize. |
| `FORBIDDEN` | User does not have access to this file | Tell the user you cannot access the file. Ask them to check sharing settings or provide a different file. |

**Rule:** After any auth error, do not attempt other cloud file tool calls in
the same turn. The user must take action first.

## File errors

| Error code | Meaning | Action |
|---|---|---|
| `NOT_FOUND` | File ID does not exist or was deleted | Ask the user to verify the file. Use `search_files` to find alternatives. |
| `NOT_A_SPREADSHEET` | File exists but is not a spreadsheet | Tell the user the file type. Suggest using `get_file` to check the kind. |
| `RATE_LIMITED` | Too many requests to the storage provider | Wait briefly, then retry once. If it fails again, tell the user. |

## Data errors

| Situation | Action |
|---|---|
| Sheet name not found | Re-check the overview. Sheet names are case-sensitive and may contain spaces. |
| Empty sheet (0 rows) | Tell the user the sheet is empty. Do not fabricate data. |
| Range out of bounds | The API returns only the rows/columns that exist — no error, just fewer results. Check if `nextOffset` is absent (end of data). |
| Merged cells | Values repeat in every covered cell. Do not double-count merged regions. |
| Dates as numbers | Some spreadsheets store dates as serial numbers. If values look like 5-digit numbers where dates are expected, note this to the user. |

## Create errors

| Situation | Action |
|---|---|
| `source_file_id` not found | The source file was deleted or you do not have access. Verify with `get_file`. |
| Sheet name mismatch in append mode | The sheet name in `sheets[].name` must exactly match an existing sheet in the source. Re-check the overview. |
| Payload too large | Keep each `create_spreadsheet` call under ~500 rows per sheet. Split into multiple calls or reduce columns. |

## General recovery pattern

1. Read the error code and message carefully.
2. If it is an auth error → stop and inform the user.
3. If it is a data/file error → try to self-correct (re-check overview, fix
   sheet name, adjust range).
4. Retry at most **once** for the same error. If it persists, tell the user
   what went wrong and what they can do.
5. Never silently skip errors. Always report what happened.
