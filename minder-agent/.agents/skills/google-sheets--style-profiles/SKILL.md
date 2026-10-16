---
name: google-sheets--style-profiles
namespace: plugins.google-drive
description: >-
  Default styling conventions for new Google Sheets. Load when creating a
  spreadsheet and the user has not provided explicit style direction.
---

# Google Sheets Style Profiles

When to read: before creating a Google Sheet when the user has not provided
explicit style direction.

## Precedence

1. User style instructions, attached templates, or explicit examples win.
2. Existing spreadsheet style wins when copying from a source file.
3. Task-specific needs can upgrade the style, for example dashboards,
   executive reports, or financial models.
4. If none of the above applies, use the default profile below.

## Default Profile

Use this when styling is unspecified and the final artifact is a new Google
Sheet created via `create_spreadsheet`:

- Keep the sheet close to native Google Sheets defaults.
- White grid with black text.
- Include a header row with bold text.
- Use clear, descriptive column headers.
- Dates in ISO format (YYYY-MM-DD) or the user's locale format.
- Numbers with appropriate decimal places for the data type.
- Currency values with 2 decimal places.
- Percentage values with 1-2 decimal places.

## Avoid Unless Requested

- Dark title bands or colored banded rows.
- Heavy theme accents or branding colors.
- Dashboard-style cards or report panels.
- Complex conditional formatting.
- Merged cells (they complicate data processing).

## Data Organization

- Place headers in row 1.
- One record per row, one field per column.
- No blank rows between data records.
- Group related sheets logically (e.g., "Summary" before "Details").
- Use clear sheet names that describe the content.
