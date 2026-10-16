---
name: pdf-report
description: Use when a user requests a report, a real PDF file, or a PDF version of a saved report.
namespace: documents
---
Whenever the user asks to create, write, or generate a report as an artifact—including simply asking to "create a report" without naming a format—produce and publish a real PDF by default. A Markdown file, plain-text document, or chat response does not satisfy that request. Use another format only when the user explicitly requests it. For a quick answer without a report artifact request, answer in chat and do not create a file.

Render the report in the sandbox and publish the actual PDF file. A create_document text document, PDF-ready Markdown, or conversion instructions do not satisfy the request. Use the existing Bash tool and installed Typst compiler; do not install packages or add another document tool.

When the user asks for a PDF after a Markdown report was saved, reuse that report's content, figures, and data. If the report body is not available in this conversation, retrieve the saved report with list_documents and get_document_text. Keep the same findings and figures; do not rerun queries unless the source data is missing or the user asks for refreshed data. Write a native Typst source file, compile it to PDF, inspect the output, then publish the generated PDF with create_document using its workspace path. Return the PDF document artifact and its citation. Do not stop after saving another Markdown document. Do not offer Markdown conversion instructions instead of creating the PDF. If a required sandbox tool is unavailable or fails, report the specific tool error and do not claim the PDF was created.

Focus on clear structure, accurate content, readable tables, and useful figures. Offer the finished PDF document as the report artifact.

Workflow:
1. Create reports/ and reports/charts/ as needed. Save the Typst source and assets under reports/, compile to a new reports/<slug>.pdf, and publish that PDF. Never overwrite an existing report or source file unless the user asks.
2. When a user requests live Trino data, query it first with the available Trino tools. Do not use Bash to connect to a database. Include the returned column names and row values verbatim; if access or the query fails, report that and do not substitute synthetic data.
3. If this conversation already has a successful preview_chart result for the requested report, reuse its output_schema, rows, and visualization_definition as the chart source. Rows are positional and match output_schema order; map visualization fields through output_schema. Use those exact rows to render the chart with Matplotlib rather than describing the preview or substituting data. Reuse preview rows only when truncated is false, display_truncated is false, and row_count equals rows.length. Otherwise rerun the matching data query with Trino to obtain complete rows before charting.
4. For charts, use the installed Python 3 and Matplotlib; save the PNG and its generation script under reports/charts/ and reference the PNG from the report. Check that the chart image exists and is non-empty before compiling.
5. For Typst output, use native Typst syntax, not Markdown. Resolve image paths relative to its .typ entrypoint. For example:
   #set page(paper: "a4", margin: 20mm)
   = Report title
   == Metrics
   #table(columns: 2, [Metric], [Value], [Alpha], [12])
   #figure(image("charts/chart.png", width: 85%), caption: [Chart caption])
   Use the actual queried rows in the table. Put every dynamic table value in its own Typst content cell, including dates, numbers, and strings with spaces, e.g. `#table(columns: 3, [Month], [Category], [Revenue], [2026-08], [Office Supplies], [18695.34])`. Never paste CSV rows or unquoted values directly into `#table`; separate cells with commas and omit a trailing comma after the last cell. Markdown headings, pipe tables, and Markdown image syntax in a .typ file may compile as ordinary text instead of rendering as intended.
6. Compile the native Typst source with typst compile reports/<slug>.typ reports/<slug>.pdf.
7. Check the command exit status and that the deliverable exists, is non-empty, and is under 10 MiB. Confirm expected content with an available format-specific inspection tool when practical. If compilation fails, inspect the compiler error, fix the Typst source, and recompile without rerunning the data query.
8. Call the existing create_document with path reports/<slug>.pdf and optional filename after validation. Use the returned document artifact as the finished deliverable; if publishing fails, report the error and retain the run file path for troubleshooting. Only publish text or Markdown instead when the user explicitly requested that format.

Use a clear title, date, section headings, readable tables, and captions. Do not invent facts, results, or citations; use supplied evidence and identify gaps. The sandbox has no network access. Bash runs without an automatic time limit, so keep commands focused and cancel a stuck run. Workspace content is retained; offer the requested file as the finished deliverable.
