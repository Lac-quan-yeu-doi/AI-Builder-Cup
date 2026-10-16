# Generic File Document Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let interactive and automation agents publish any regular sandbox file as a durable Document, preview supported types, and download all types in chat, Documents, and automation run detail.

**Architecture:** Core normalizes the existing `create_document` tool to accept report text or a workspace file path, derives the source run from trusted delegation, fetches the file through the existing Agent run files client, and stores original bytes while extracting supported text. Core serves organization-scoped original bytes. Web uses one `getDocumentContent` controller that returns extracted text or file bytes based on MIME type. Agent confines run file reads to canonical workspace paths.

**Tech Stack:** NestJS, Prisma, MinIO, MCP, React/Next.js, TypeScript, Vitest/Jest, Docker Compose.

**Spec:** `celesnity-web/docs/superpowers/specs/2026-09-27-pdf-report-document-flow-design.md`

## Global Constraints

- Source must be a workspace-relative regular file in the trusted Agent run; the Agent endpoint imposes a 10 MiB ceiling.
- Core ingestion remains limited to 20 MiB and 200 pages; no schema migration or new dependency is needed.
- Only trusted delegation supplies organization and source run IDs. Never accept either as an MCP tool argument.
- Reuse existing `DOCUMENTS` authorization, action audit, repository scoping, and PDF/text extraction.
- Preserve Markdown, chart previews, human uploads, and existing run file behavior.
- Keep changes local and uncommitted. Run focused checks, then the requested Compose flow.

---

### Task 1: Confine Agent run file reads

**Files:** Modify `minder-agent/src/infrastructure/workspace/storage/s3-workspace.ts`; test `minder-agent/src/tests/infrastructure/workspace/s3-workspace.test.ts`.

**Interfaces:** `S3WorkspaceProvider.readSession(owner, sessionKey, path, maxBytes)` retains its signature and 10 MiB endpoint ceiling.

- [x] Add a test that creates a symlinked parent directory pointing outside a hydrated workspace, then checks that `readSession` rejects its child PDF.
- [x] Run `rtk npm test -- src/tests/infrastructure/workspace/s3-workspace.test.ts` in `minder-agent`; expect the new case to fail.
- [x] In `readWorkspace`, resolve the root and target with `realpath`, reject when the canonical target is outside the canonical root, and read the canonical target. Keep final file symlinks rejected and existing size check.
- [x] Run the focused test and `rtk npm run check` in `minder-agent`.

### Task 2: Store and serve original file bytes in Core

**Files:** Modify `celesnity-core/src/application/document/document.use-cases.ts`, `src/application/document/interfaces/i-document-storage.ts`, `src/infrastructure/minio/document/minio-document-storage.ts`, `src/presentation/document/document.controller.ts`; test `src/tests/application/document/document.use-cases.spec.ts` and `src/tests/presentation/document/document.controller.spec.ts` if present.

**Interfaces:** `UploadDocumentInput` gains `sourceRunId?: string`; `DocumentUseCases.getContent(id): Promise<{document: Document; bytes: Uint8Array}>`; `IDocumentStorage.get(storageKey): Promise<Uint8Array>`; `GET /api/v1/documents/:documentId/content` returns the stored MIME type and safe inline/attachment disposition.

- [x] Add focused use case tests for `sourceRunId` persistence, organization scoped lookup before byte fetch, and PDF byte retrieval.
- [x] Extend `upload` to copy `sourceRunId` into the persisted model and add `getContent` using `getOrThrow` before storage access.
- [x] Add MinIO `getObject` streaming into a bounded byte array using the existing 20 MiB ceiling.
- [x] Add the feature guarded content route with an inline, sanitized `Content-Disposition` filename and `application/pdf` response.
- [x] Run the focused Core document tests and `rtk npm run typecheck`.

### Task 3: Normalize the existing Core document MCP tools

**Files:** Modify `celesnity-core/src/application/document/document.actions.ts`, `src/presentation/document/document-mcp-tools.ts`, `src/presentation/document/document-mcp.controller.ts`, `src/application/administration/mcp-operation-policy.ts`, `src/modules/document.module.ts`; test `src/tests/presentation/document/document-mcp-tools.spec.ts`, `src/tests/presentation/document/document-mcp.controller.spec.ts`, `src/tests/application/administration/mcp-operation-policy.spec.ts`.

**Interfaces:** Existing `create_document` accepts exactly one of text `{filename, content, mime_type?, chart_previews?}` or any regular workspace file `{path, filename?}`. Existing `get_document_text` returns extracted text and an embedded original-file resource for all types. Both keep their existing tool names.

- [x] Test `create_document` rejects both/neither content and path, accepts each valid form, retains write audit, and returns the existing document message block.
- [x] Test `get_document_text` returns original bytes and the stored MIME type as an embedded resource.
- [x] Route arbitrary file paths through the existing `document.create` action and trusted delegated run; cap fetched bytes at 10 MiB and persist trusted `sourceRunId`.
- [x] Keep `create_document` as the only document write tool; do not register another Core tool.
- [x] Run focused MCP tests and `rtk npm run typecheck`.

### Task 4: Update Agent PDF skill guidance

**Files:** Modify `minder-agent/src/infrastructure/composition/report-skills.ts`; test `minder-agent/src/tests/infrastructure/composition/tools.test.ts`.

**Interfaces:** The existing global `pdf-report` skill instructs the agent to compile and validate the PDF, then invoke `create_document` with `path: reports/<slug>.pdf`.

- [x] Assert the skill uses the existing create operation with the PDF path in the focused skill test.
- [x] Update the skill after its validation step to call `create_document` with the PDF path and return the resulting document artifact.
- [x] Run the focused skill test and Agent typecheck.

### Task 5: Merge text and file retrieval in Web

**Files:** Modify `celesnity-web/src/application/repositories/document.repository.interface.ts`, `src/infrastructure/repositories/core-api-document.repository.ts`, `src/di/modules/documents.module.ts`, `src/di/types.ts`; create a document content use case and controller in the existing `src/application/use-cases/documents/` and `src/interface-adapters/controllers/documents/` directories; test the matching repository and controller unit tests.

**Interfaces:** Keep only `getDocumentContent`. It accepts document ID and MIME type, returning a text result for text-like formats or a Blob file result for other formats; the repository uses `/text` or `/content` as needed.

- [x] Add a focused repository test for authenticated binary transport and a failure response.
- [x] Remove the separate Web `getDocumentText` use case/controller and DI binding; dispatch both text and file retrieval through `getDocumentContent`.
- [x] Run focused Web document tests and `rtk npm run typecheck`.

### Task 6: Render generic content in all three Web hosts

**Files:** Modify `celesnity-web/app/(workspace)/chat/_components/stage/block-pane.tsx`, `app/(workspace)/documents/_components/documents-screen.tsx`, `app/(workspace)/automations/[workflowId]/_components/automation-workflow-detail-screen.tsx`, and their feature wiring files. Reuse `app/_components/chat/file-preview/media-file-preview.tsx` PDF iframe pattern. Test matching `tests/unit/app/` view tests.

**Interfaces:** Each host receives the same content controller. Text results use the existing Markdown/text/chart renderer; file results use the workspace MIME policy and fall back to download for unknown, unsafe, or over-limit formats.

- [x] Add focused view cases for text and file dispatch, PDF preview, download fallback, URL revocation, and `no_text_found` preview.
- [x] Wire the new controller into all three host feature entry points and add the PDF branch.
- [x] Run focused view tests, Web typecheck, lint, and formatting check.

### Task 7: Local Compose proof through Web

**Files:** Use root `docker-compose.yaml`; no checked-in test skill file. Record observed results in this plan or a companion verification note.

- [x] Rebuilt the Compose stack with `rtk docker compose up -d --build`; all persistent services are healthy and the migration/init/seed jobs exited successfully.
- [x] Created `pdf-report-smoke` through the Web Skills UI. The interactive run invoked it; the automation run only listed the global skill.
- [ ] Interactive Agent queried Trino but did not create/publish a PDF. Independently uploaded a valid PDF through Web and verified the inline PDF frame in Documents.
- [ ] Automation published a CSV via `create_document`; its text rendered in Documents. The PDF publish attempt hit the Agent governance budget, so repeated PDF automation/detail rendering remains unverified.
- [ ] Cross-organization and missing/oversized-file UI checks remain unverified; focused unit coverage verifies bounded file ingestion and organization-scoped retrieval.

## Self review

- [x] Confirm Tasks 1-7 cover every required and failure path in the spec.
- [x] Reconciled the implementation with the approved interfaces; Web keeps `getDocumentContent` as its only document-content controller.
- [x] Inspected changes in Core, Web, and Agent; left them uncommitted.
