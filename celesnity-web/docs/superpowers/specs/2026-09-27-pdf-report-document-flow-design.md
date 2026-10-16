# Generic File Document Flow Design

**Date:** 2026-09-27  
**Status:** Approved in chat; implementation and validation in progress  
**Scope:** Publish any regular file created in Minder Agent's sandbox as a Celesnity document; preview supported types and download any type in the chat sidebar, Documents, and automation run history

## 1. Outcome

An agent creates report text or a file in its current sandbox workspace. It calls the existing `create_document` tool with either text or a workspace-relative path to any regular file. Core verifies the agent's run and organization, retrieves the file through the existing Agent run-files API, stores original bytes, and extracts text where supported. The existing `get_document_text` tool returns extracted text and the original file as an embedded resource. Web exposes one `getDocumentContent` controller that returns text for text-like MIME types and original bytes for other types. Browser-supported types use safe previews; other types download.

The requested local proof starts `docker-compose.yaml`, creates a test skill through Web's Skills UI, and uses it in an automation that produces and publishes a PDF report. The same publication path supports arbitrary file types. A second run must produce a separate document.

## 2. Current System and Reuse Decisions

| Existing part                                   | Current behavior                                                                              | Design use                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Core `DocumentUseCases.upload`                  | Stores any MIME type up to 20 MiB; extracts PDF pages and text-like formats                   | Ingest any published file while retaining original bytes                     |
| Core `create_document` MCP tool                 | Saves text/Markdown and chart previews                                                        | Normalize the existing contract to accept either text or a sandbox file path |
| Core document model                             | Has nullable `sourceRunId`                                                                    | Relate any published file to the creating Agent run without a migration      |
| Core `AgentRunFilesClient`                      | Retrieves authorized Agent run-file content as a stream                                       | Fetch the file named by `create_document`                                    |
| Agent `GET /runs/:runId/files/content`          | Authorizes run ownership, rejects traversal and final-file symlinks, and caps files at 10 MiB | Serve a sandbox file to Core after strengthening canonical path confinement  |
| Agent sandbox and `pdf-report` skill            | Render PDFs with Typst and keep them in `reports/`                                            | Keep PDF as a concrete example; publish files through the generic contract   |
| Web `CoreApiClient.stream` and run-file preview | Fetch authenticated binary responses and display safe previews                                | Reuse for stored document files                                              |
| Web chat `DocumentBlockPane`                    | Opens document message blocks through text retrieval                                          | Use the unified content controller for text or files                         |
| Automation run detail                           | Resolves documents by the step's Agent run ID                                                 | Show published files without changing the run response shape                 |

The effective publish size limit is **10 MiB**, because the Agent run-file endpoint enforces that limit before Core's 20 MiB document limit. A PDF that exceeds it fails publication with a clear tool error. No PDF bytes are placed in a prompt, skill body, or MCP JSON argument.

## 3. Scope

### Required

1. An interactive or automation agent can publish any completed regular sandbox file into Documents.
2. The chat artifact sidebar, Documents, and automation run detail render PDFs and browser-supported files from stored content, including when extraction returns `no_text_found`; other formats remain downloadable.
3. Automation run detail shows the published PDF after a page refresh, and repeated runs retain distinct artifacts.
4. The local Compose test creates a skill in Web and exercises the actual render, publish, persist, and view path.
5. Existing Markdown documents, embedded chart previews, human uploads, PDF rendering, and extracted-text access continue to work.

### Outside this change

- A new renderer, OCR service, public MinIO URL, or second artifact table.
- Automatic conversion of every Markdown report to PDF.
- A model-visible tool argument containing base64 file data.
- Rendering active or executable content from arbitrary formats.

## 4. End-to-End Sequence

1. A user starts an Agent run or fires an automation workflow whose Agent step requests a PDF report.
2. The Agent uses its existing sandbox tools to write `reports/<unique-name>.<extension>` in the active workspace. A failed generation step stops the publish attempt.
3. The Agent checks the file exists, is non-empty, and is below 10 MiB, then calls `create_document` with either `content` or `path` and an optional display filename.
4. Core's document MCP endpoint authenticates the Agent request and uses the current room-run or automation-run delegation path to establish a `DOCUMENTS` write context.
5. Core derives the source Agent run ID from that verified context and asks its existing `AgentRunFilesClient` for the named file. The client sends Core's current principal assertion to Agent.
6. Agent verifies access to that run and reads only a regular file whose canonical path remains inside that run's workspace. Core also validates the relative path and bounds the returned stream to 10 MiB.
7. Core calls `DocumentUseCases.upload` with the returned MIME type, bytes, display filename, and verified source Agent run ID. It extracts PDF pages and text-like content, stores other files without extracted text, and saves original bytes in MinIO with a document row in Postgres.
8. The tool returns `DocumentResponse` and the existing document message-block shape with the new document ID. Automation's existing run-detail query finds the row through `sourceRunId`.
9. Web calls its single `getDocumentContent` controller. Based on MIME type, the repository fetches extracted text from `/text` or original bytes from `/content`; each view renders text or a safe preview/download.

## 5. Contracts and Component Changes

### 5.1 Existing document tools

Keep the current Core `document-mcp` tool set. Normalize `create_document` so the model supplies exactly one of these forms:

```json
{"content":"# Report\\n\\nText body","filename":"monthly-revenue.md","mime_type":"text/markdown"}
{"path":"reports/monthly-revenue-2026-09.csv","filename":"Monthly revenue - September 2026.csv"}
```

For the text form, `filename` and `content` are required and `mime_type` supports the existing Markdown/plain text values. For the file form, `path` must identify a regular file relative to the current run workspace; `filename` is optional and defaults to the path basename. Core derives MIME type from the Agent response. Reject requests with both or neither `content` and `path`, invalid path syntax, and `mime_type` on the file form. The tool never accepts an organization ID, authoritative run ID, storage key, URL, or file bytes from the model.

Both forms go through the same `document.create` action, audit path, and `workspace:write` permission classification. The existing `McpAuthenticationGuard` accepts verified workload identity in production and the configured shared secret in local development. Authentication alone grants no document access: `DocumentMcpController` then uses `runForFeature` to validate a registered interactive run or `runForAutomation` to verify that the Agent run belongs to the organization and configured agent. The resulting authenticated context supplies the PDF's source run ID. A model supplied `run_id` is audit context, not authority for file retrieval or document ownership.

Success retains the existing document metadata and `message_block`. Extend the existing `get_document_text` response with an embedded resource containing original bytes and actual MIME type for all document types. Do not add a new MCP tool.

### 5.2 File transfer and ingestion

The existing `create_document` handler uses `IAgentRunFilesClient.getFileContent(sourceRunId, path, false)` under the verified context when `path` is supplied. It rejects a missing response/body, zero-byte files, and streams exceeding 10 MiB even if `Content-Length` is absent or wrong. It preserves the returned MIME type, defaulting to `application/octet-stream`. `get_document_text` uses the same authorized lookup to include original bytes for all file types. A failed Agent request must surface a concise diagnostic in the MCP result.

Agent's shared workspace reader currently checks the requested path lexically and rejects a symlink only at the final component. Before this route serves publishable bytes, resolve the file to a canonical path and require that it remains beneath the canonical workspace root; read that resolved regular file. This closes the parent-directory symlink path as well as the final-file case without changing the sandbox's execution rules.

Add optional trusted `sourceRunId` to `UploadDocumentInput` and persist it in the document returned by `DocumentUseCases.upload`. Human `POST /documents` supplies no source run ID. Core extracts PDF pages and UTF-8 text-like content; other MIME types are stored without text. A PDF with no extractable text remains viewable from its original bytes.

Reuse `AgentRunFilesClient` in `DocumentModule`; no new Agent binary upload route, storage table, or database migration is needed. Agent's workspace read check changes only to enforce canonical confinement for the existing run-file endpoint.

### 5.3 Original file content API

Add human-facing `GET /api/v1/documents/:documentId/content` under the existing `DOCUMENTS` feature gate. Look up the document through the organization-scoped document repository before reading its storage key. Read original bytes from `IDocumentStorage`/MinIO and return the stored MIME type. Use `Content-Disposition: inline` only for known safe browser-preview types (PDF, plain text, raster images); return other formats as attachments with a sanitized filename.

- `Cache-Control: private, no-store`

An unknown or other-organization ID returns the existing document-not-found response. A missing object is a server-side storage failure, not an empty PDF. This route does not expose a public storage URL. Existing metadata and `/text` routes keep their response shapes.

### 5.4 Shared Web document content and Documents pane

Merge text and binary retrieval behind one `getDocumentContent` Web controller. Given the document MIME type, the repository requests `/text` for text-like types and `/content` for other types, returning a discriminated text/file result. Documents renders Markdown and plain text from that result; file results pass to the generic preview/download component. Revoke Blob URLs on close or unmount.

Keep Markdown, GFM, chart previews, and plain-text rendering. File previews follow the existing workspace file MIME policy; unknown, unsafe, or over-limit formats use download fallback. PDF display does not depend on extraction status.

### 5.5 Chat artifact sidebar

Both forms of `create_document` emit the same document message-block metadata, including `document_id`, filename, and MIME type. Chat calls the same `getDocumentContent` controller used elsewhere. Text results preserve Markdown/chart and plain-text rendering; file results use the generic safe preview with download fallback.

### 5.6 Automation artifact pane

The existing run-detail response includes `documents`, with `mime_type` already mapped by Web. The automation pane uses the same `getDocumentContent` controller and generic preview/download component as Documents. Preserve the Markdown renderer and browser PDF export button for Markdown documents. A newly published file appears in the run artifact list after reload through the persisted `sourceRunId` association.

The run-detail query should retain organization scope when resolving documents from step Agent run IDs. The controller must reject a run outside the caller's organization before exposing its document IDs or content. No new automation response field is required.

### 5.7 Skill used for the local proof

Update Agent's existing read-only global `pdf-report` skill to instruct the agent to call `create_document` with a workspace-relative path only after generation and file-size checks. Keep PDF report generation as a concrete example of the generic file contract. The separate **test skill** is created after Compose starts through Web's Skills UI, for example `pdf-report-smoke` in the `documents` namespace. Its body asks the agent to query an accessible real dataset, render a small PDF report with a table and chart, create the document from its path, and return the document ID. Enable that project skill for the test agent through the existing skill allowlist/configuration path.

If the connected dataset or feature grant is unavailable, the smoke run must report that failure. It must not substitute made-up data or claim the document flow passed. The skill created in Web is local test data, separate from the repository's global skill definition.

## 6. Error Behavior and Trust Boundaries

| Condition                                                                                             | Required behavior                                                                |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Missing room/run registration or invalid automation association                                       | Delegation rejects the tool before file access                                   |
| Agent lacks `DOCUMENTS` write feature or service permission                                           | Delegation rejects and records the denied authorization decision                 |
| Absolute/traversal path, a symlink in any path component, missing file, directory, or wrong run owner | Tool fails; no Core document is created                                          |
| Empty file, invalid PDF content, over 10 MiB, or over 200 PDF pages                                   | Tool fails with the existing document/transfer error; no document row is created |
| Agent file request or MinIO write fails                                                               | Tool fails and reports the dependency error; no success artifact is emitted      |
| File extraction yields `no_text_found`                                                                | Original bytes remain available; `/text` reports its extraction status           |
| User requests another organization's document content                                                 | Core returns not found without exposing bytes or storage keys                    |
| Web selection changes while content loads                                                             | Ignore the stale result and revoke any Blob URL it created                       |

Core may leave an unreferenced MinIO object if storage succeeds and the subsequent database insert fails, as the current upload ordering already permits. This change must not return or display that object as a document. Storage cleanup can be addressed separately if that failure is observed.

## 7. Verification and Local Acceptance

### Focused checks

- **Core:** MCP permission mapping and both delegation paths; path/size/stream failures; PDF upload with trusted `sourceRunId`; organization-scoped content read; existing human upload and Markdown `create_document` behavior.
- **Agent:** Run-file endpoint canonical confinement, including symlinked parent directories; owner authorization; 10 MiB boundary; renderer output remains a readable PDF.
- **Web:** Unified `getDocumentContent` dispatch for text and file MIME types; PDF preview in chat `DocumentBlockPane`, Documents, and automation detail; authenticated content retrieval; stale-selection handling; URL cleanup; preserved Markdown/chart rendering and arbitrary-file download fallback.

### Compose smoke sequence

1. Run `rtk docker compose up -d --build --wait` from the workspace root. Confirm persistent services are healthy with `rtk docker compose ps -a`, and inspect migration/init one-shot logs.
2. Sign in to Web at port 3000. Confirm the test organization has Core's `DOCUMENTS`, `AUTOMATIONS`, and any data features needed by the report. Confirm the Skills screen is available through Web's current `HOME` navigation gate; Core has no separate `SKILLS` workspace feature.
3. In Web's Skills UI, create and save `documents/pdf-report-smoke`; enable it for the test agent and confirm the agent profile can see the existing `create_document` tool with its generic file path option.
4. Run the skill once in interactive chat. Confirm `create_document` returns a document ID and its document message block opens the original PDF in the chat artifact sidebar. Confirm `get_document_text` returns extracted text and an embedded PDF resource.
5. Create or reuse a one-step automation, invoke the same skill, and include a small real query and chart. Confirm the run completes and `create_document` returns a second document ID.
6. Confirm Core's document API reports `application/pdf`, a nonzero page count, and extracted text or an explicit `no_text_found` status. Confirm the automation document's persisted `sourceRunId` matches the step's Agent run ID with a scoped database check; run detail also confirms the association by returning the document. Fetch `/documents/:id/content` as the same user and verify the returned bytes open as a PDF. Also publish a CSV and verify `text/csv` metadata, text content, and original embedded bytes.
7. Refresh Documents and automation run detail. Confirm both panes render the original PDF. Run the automation again and confirm a third, distinct document ID appears without changing the first automation run's artifact.
8. Attempt a cross-organization content and run-detail fetch, plus a missing-file create; confirm these are denied and no extra document is created. Record unrelated stack or feature-grant failures separately.

The local smoke skill and workflow may remain as test data for repeatable checks. Source commits, pushes, and deployment are outside this acceptance run.

## 8. Completion Criteria

The change is complete when the chat artifact sidebar and Documents pane render PDFs, automation creates and renders a PDF report, an agent publishes sandbox files into Documents, `getDocumentContent` serves text and binary content through one Web flow, and the Web-created skill verifies PDF and non-PDF publication. Focused checks must pass, and artifacts must remain visible after refresh.
