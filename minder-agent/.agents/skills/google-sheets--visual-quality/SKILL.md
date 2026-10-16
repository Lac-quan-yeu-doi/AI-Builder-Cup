---
name: google-sheets--visual-quality
namespace: plugins.google-drive
description: >-
  Final quality checklist before reporting spreadsheet results to the user.
  Load before finalizing any spreadsheet creation or data analysis task.
---

# Spreadsheet Visual Quality

When to read: before finalizing any Google Sheet created or analyzed.

## Scope

- **Analysis / read task:** verify the data you read is complete and the
  summary accurately reflects the source.
- **New spreadsheet:** verify structure, data completeness, and that the
  created file matches the user's request.
- **Consolidation:** verify row counts, dedup results, and column mapping
  accuracy.

## Final Checklist

1. **File identity:** confirm the spreadsheet name and link are correct.
2. **Sheet names:** verify target sheets exist and are spelled correctly.
3. **Data completeness:**
   - For reads: did you capture all relevant rows? Check `nextOffset`.
   - For creates: do all sheets have the expected row counts?
4. **Column accuracy:**
   - Headers match the source or user request.
   - Data types are consistent within columns (numbers, dates, text).
   - No shifted columns or misaligned data.
5. **Formula integrity** (if applicable):
   - Formulas reference correct sheets and ranges.
   - No broken references to sheets that don't exist in the new file.
6. **Dedup accuracy** (for consolidation):
   - Duplicates were correctly identified and skipped.
   - The dedup column was appropriate.
7. **No fabricated data:**
   - Every number in your response traces to a cell you actually read.
   - Missing values are reported as missing, not filled in.

## Reporting

- Always include the file name and link in your final answer.
- State the sheet name and range you worked with.
- For analysis: lead with findings, then methodology.
- For creation: state what was created, how many rows/sheets, and the link.
- For errors: state what went wrong and what the user can do.

## Anti-Patterns

- Do not report data you did not actually read from the spreadsheet.
- Do not claim a create succeeded without checking the response for the new
  file's ID and link.
- Do not present partial data as complete without noting the limitation.
