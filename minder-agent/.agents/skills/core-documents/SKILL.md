---
name: core-documents
description: Use when finding, reading, creating, or publishing documents and files with Celesnity Core document tools.
namespace: documents
---

# Core documents

Use the existing Core document tools. They are owner-scoped to the authenticated caller; do not ask for or supply organization IDs. A human uploads source documents. Agents can list and read those documents, and can create a new document from report text or a workspace file created in the current run.

## Find and read

- `list_documents({cursor?, limit?})` lists available documents. Follow the returned cursor when needed; the default page size is 50 and the maximum is 200.
- `get_document_text({document_id, start_page?, end_page?})` returns extracted text plus the original file as an embedded resource. Page bounds are 1-indexed and inclusive; omit both to read all pages, or request a narrow range for a large document.
- Check `extraction_status`. If it is `no_text_found`, say that text extraction found no readable text; do not infer the document contents. The embedded resource is the original file, not extracted text.

## Create a document or file

`create_document` accepts exactly one of:

- `content`: full plain-text or Markdown content. Supply a `filename`; `mime_type` may be `text/markdown` or `text/plain` and defaults to Markdown.
- `path`: a workspace-relative path to a file created during this run, such as `reports/summary.pdf`. `filename` is optional. Do not pass `mime_type` with `path`; Core reads the file using the trusted current run context.

Do not pass both `content` and `path`, or neither. Do not provide run or organization IDs; the runtime supplies trusted context. The path form supports generated files such as PDFs and other file types; use it when the user requests an actual file rather than a text document. Confirm the returned document artifact before claiming it was saved.

For a PDF report, invoke `pdf-report` for the generation and visual-verification steps, then publish the verified workspace PDF with `create_document({path, filename?})`. Do not describe Markdown or a chart preview as a PDF file.

## Few-shot patterns

**Read a saved report:** call `list_documents`, select the matching filename from returned results, then call `get_document_text` with its exact `document_id`. For a long PDF, request only the relevant page range.

**Publish a generated PDF:** after generating and checking `reports/monthly-summary.pdf`, call:

```json
{"path":"reports/monthly-summary.pdf","filename":"monthly-summary.pdf"}
```

Only when the user explicitly requests a short text or Markdown report, call:

```json
{"content":"# Summary\n\nVerified findings go here.","filename":"summary.md"}
```
