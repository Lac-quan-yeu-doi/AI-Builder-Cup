---
name: typst
description: Use when writing or compiling Typst documents, styling layouts, or diagnosing Typst errors.
namespace: documents
---
# Typst

Use this skill when authoring or debugging Typst documents. The runner has Typst 0.15.1, Pandoc, Python 3, and Matplotlib. Its workspace is offline; do not rely on network access, package search helpers, or packages that are not already cached.

## Compile

~~~bash
typst compile reports/document.typ reports/document.pdf
typst compile reports/document.md reports/document.pdf
typst compile reports/document.typ reports/page-{p}.png -f png
typst fonts
~~~

Use an explicit output path. The regular compile command handles document compilation; Markdown input is converted to Typst. Keep source files and chart-generation scripts in the workspace. Use compile for one-shot output; watch is a persistent process and should be stopped when no longer needed.

## Minimal syntax

~~~typst
= Document title

Introductory paragraph with *strong* and _emphasized_ text.

== Section

- First item
- Second item

Numbered list:
+ One
+ Two

Inline math: $ alpha + beta = gamma $
~~~

Top-level text is markup. Prefix an expression with # to enter code mode. Define values with #let, conditions with #if, and loops with #for. Wrap generated markup in square brackets, for example: #let label = [Quarterly results]. Use #include to insert document content and #import to use definitions from another file.

Relative imports and image paths resolve from the current source file. Keep imported files and images within the workspace and use relative paths for report assets.

## Tables and figures

Use native Typst tables. The table content is filled row by row, left to right:

~~~typst
#table(
  columns: (1fr, auto),
  table.header([*Metric*], [*Value*]),
  [Alpha], [12],
  [Beta], [19],
)
~~~

Use table.header for column labels, explicit column sizing for wide data, and align per column where useful. Avoid inserting Markdown pipe-table syntax into a .typ file; compile a .md source when using Markdown tables.

For charts, generate a PNG or SVG with Matplotlib and place the script and image under reports/. Reference it from the document with a relative path:

~~~typst
#figure(
  image("charts/summary.png", width: 85%),
  caption: [Summary by category],
)
~~~

Use captions and labels when figures need to be referenced. Check that chart labels and legends remain readable at the rendered size.

## Layout and styling

Typst set rules change defaults for following content; show rules transform selected elements. Put rules before the content they affect.

~~~typst
#set page(paper: "a4", margin: 20mm)
#set text(size: 10pt)
#set par(leading: 0.7em)
#show heading.where(level: 1): set text(size: 20pt, weight: "bold")
~~~

Use local rules for a specific element when possible. Use typst fonts to see available families; a font name that is not installed falls back or produces a warning. Page and typography defaults may be supplied by the compile environment, so add document-wide overrides only when the user asks for them.

## Verify and troubleshoot

After compiling, check the exit status and confirm the PDF exists, is non-empty, and is below the 10 MiB download limit. If pdftotext is available, inspect the extracted text for expected headings, table labels, and values. If a preview tool is available, inspect rendered pages for clipped text, broken tables, unreadable chart labels, or source syntax printed as plain text.

- Unknown variable: check spelling and define it before use.
- File not found: check the path relative to the importing or including source file and confirm --root includes it.
- Unknown font: choose a name from typst fonts or use an installed fallback.
- Content/string mismatch: use content syntax such as [#value] to place a value in markup.
- A set/show rule has no effect: move it before the content it targets.
- Unexpected argument: named arguments use a colon, such as func(name: value).

For current CLI options, use typst compile --help. Do not invent data, citations, or chart values; use the supplied source values and state limitations clearly.