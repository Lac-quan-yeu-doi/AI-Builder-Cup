---
name: google-sheets--formula-patterns
namespace: plugins.google-drive
description: >-
  Google Sheets formula syntax, shape heuristics, and rollout discipline.
  Load when the user asks to create a spreadsheet with formulas or when
  discussing formula design.
---

# Formula Patterns

When to read: when creating a spreadsheet that should contain formulas, or
when the user asks about formula design.

Celesnity can include formulas in `create_spreadsheet` cell values. This
reference refreshes exact syntax and formula-shape choices.

## Formula Shape Heuristics

- Use a **row formula** when the logic is local to one row and should copy down.
- Use a **spill formula** when one anchor cell should populate the whole output region.
- Prefer `XLOOKUP` for straightforward exact lookups when available.
- If using `VLOOKUP`, explicitly pass `FALSE` for exact match behavior.
- Use `FILTER` when the output should be the original rows or columns that
  satisfy conditions.
- Use `MAP` with `LAMBDA` for per-item transformations that would be awkward
  as a plain spill formula.

## High-Value Syntax Reminders

### ARRAYFORMULA

```gs
=ARRAYFORMULA(IF(A2:A="", "", IF(E2:E>=90, "On track", "At risk")))
```

One anchor formula fills an output column.

### FILTER

```gs
=FILTER(A2:D, D2:D="Open", A2:A<>"")
```

Conditions must match the length of the filtered range. Returns `#N/A` if
no values satisfy the conditions.

### XLOOKUP

```gs
=XLOOKUP(A2, Lookup!A:A, Lookup!D:D, "")
```

`lookup_range` must be a single row or column. Use `missing_value` for a
cleaner fallback than raw `#N/A`.

### VLOOKUP

```gs
=IFNA(VLOOKUP(A2, Lookup!A:D, 4, FALSE), "")
```

Always use `FALSE` for `is_sorted` for exact-match behavior.

### MAP

```gs
=MAP(A2:A, LAMBDA(item, JOIN("-", SPLIT(item, ","))))
```

Each mapped value must resolve to a single value, not another array.

## Applying Formulas In create_spreadsheet

When using `create_spreadsheet` with `mode: "replace"`, you can include
formula strings as cell values. The formula will be evaluated in the new
spreadsheet.

Tips:
- Reference sheets and ranges that exist in the new spreadsheet.
- If copying from a source (`source_file_id`), formulas referencing existing
  sheets will resolve against the copy.
- Test formula references against the overview of the source file before
  including them.

## Official References

- Google Sheets function list: https://support.google.com/docs/table/25273?hl=en
- ARRAYFORMULA: https://support.google.com/docs/answer/3093275?hl=en
- FILTER: https://support.google.com/docs/answer/3093197?hl=en
- XLOOKUP: https://support.google.com/docs/answer/12405947?hl=en
- VLOOKUP: https://support.google.com/docs/answer/3093318?hl=en
- MAP: https://support.google.com/docs/answer/12568985?hl=en
