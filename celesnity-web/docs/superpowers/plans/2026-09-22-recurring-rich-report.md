# Recurring Rich Report Artifacts Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with focused verification after each boundary. Do not commit unless the user explicitly requests it.

**Goal:** Make automation workflows create real rich Markdown report documents with persisted chart previews and show those document artifacts in automation run history.

**Architecture:** Propagate a server-generated workflow context and trusted automation delegation from celesnity-core through minder-agent. Persist the creating agent run ID on each generated document, resolve those documents through existing workflow step runs, expose the document response on run detail, and reuse celesnity-web's existing document/chart renderer.

**Tech Stack:** NestJS/TypeScript, Prisma, minder-agent runtime/MCP, Next.js/React, existing Markdown/GFM and chart preview components, Vitest/Jest repository tests.

**Spec:** `docs/superpowers/specs/2026-09-22-recurring-rich-report-design.md`

## Global constraints

- Preserve all existing dirty worktree changes; never reset, stash, or overwrite unrelated user edits.
- Do not commit source or documentation changes.
- Keep workflow data access bounded by the existing `data_scope` and authenticated organization context.
- Never weaken MCP controllers to accept missing delegation metadata.
- Do not parse document IDs from prose; use typed tool/runtime metadata.
- Reuse the existing document renderer and chart preview parser in celesnity-web.
- Every run is a new snapshot; do not overwrite the prior run's document.
- Do not create mock data or a text-only success document after a required data/chart failure.

## Task 1: Fix and test the internal webhook contract

**Files:**

- Modify: `celesnity-core/src/application/automation/interfaces/i-agent-webhook-client.ts`
- Modify: `celesnity-core/src/infrastructure/http/automation/agent-webhook.client.ts`
- Modify: `celesnity-core/src/application/automation-workflow/automation-workflow-dispatcher.ts`
- Modify: `minder-agent/src/presentation/http/contracts/validation.ts`
- Modify: `minder-agent/src/presentation/http/runs/turns.controller.ts`
- Modify: `minder-agent/src/domain/runtime/run-context.ts`
- Test: existing Core automation webhook client/dispatcher tests
- Test: existing agent webhook validation/controller/runtime-context tests

Steps:

1. Define one typed automation context with workflow ID, workflow run ID, and step ID.
2. Pass it from `dispatchStep` with the existing workflow data scope and authenticated caller subject.
3. Serialize only validated internal fields in the Core webhook body; remove or stop sending unsupported `system_prompt`.
4. Validate and parse those fields in the agent webhook DTO/controller.
5. Preserve the context through `RunContext` and autonomous runtime admission.
6. Pass trusted automation run and organization metadata so Core can authorize the run without weakening room delegation.
7. Include a bounded response body in Core webhook errors.
8. Add focused tests for valid propagation, malformed context rejection, and the former 400/room-delegation failures.

## Task 2: Trace artifact metadata from MCP document creation to Core

**Files:**

- Modify: `minder-agent/src/infrastructure/mcp/protocol/manager.ts`
- Modify: `minder-agent/src/infrastructure/mcp/protocol/tool.ts`
- Modify: `celesnity-core/src/presentation/document/document-mcp-tools.ts`
- Modify: `celesnity-core/src/application/document/document.actions.ts`
- Modify: `celesnity-core/src/application/document/document.use-cases.ts` only if the trusted context must be accepted at the use-case boundary
- Test: `minder-agent` MCP manager/tool tests
- Test: `celesnity-core/src/tests/presentation/document/document-mcp-tools.spec.ts`

Steps:

1. Confirm the existing MCP metadata path exposes the autonomous run context to the Core document action.
2. Extend the typed action actor/context only as needed to carry automation run and step IDs; keep interactive actors unchanged.
3. Keep `chart_previews` as the canonical stored payload and retain the existing document message block.
4. Return machine-readable document metadata that includes document ID, filename, and chart previews.
5. Test both interactive and automation-created documents, including a document with a real chart payload.

## Task 3: Persist document source runs in celesnity-core

**Files:**

- Modify: `celesnity-core/src/domain/document/models/document.ts`
- Modify: `celesnity-core/src/application/document/document.use-cases.ts`
- Modify: `celesnity-core/src/application/document/document.actions.ts`
- Modify: `celesnity-core/src/infrastructure/prisma/schema.prisma`
- Create: `celesnity-core/src/infrastructure/prisma/migrations/20260922010000_document_source_run/migration.sql`
- Modify: `celesnity-core/src/infrastructure/prisma/document/prisma-document.repository.ts`
- Modify: `celesnity-core/src/infrastructure/prisma/automation-workflow/prisma-automation-workflow-run.repository.ts`
- Modify: `celesnity-core/src/application/automation-workflow/interfaces/i-automation-workflow-run.repository.ts`
- Modify: `celesnity-core/src/application/automation-workflow/automation-workflow.use-cases.ts`
- Modify: `celesnity-core/src/modules/automation-workflow.module.ts`
- Test: document/repository/use-case tests for source run IDs and organization-scoped lookup

Steps:

1. Add a nullable source agent run ID to the document model and migration.
2. Thread the trusted source run ID from the MCP document context into `createFromText`.
3. Add a typed run repository query that resolves documents whose source runs belong to the requested workflow run.
4. Enforce organization scoping through the existing Prisma organization boundary and workflow ownership.
5. Verify multiple documents in one run and repeated runs preserve distinct snapshots.

## Task 4: Expose artifacts from the automation run API

**Files:**

- Modify: `celesnity-core/src/presentation/automation-workflow/automation-workflow.dto.ts`
- Modify: `celesnity-core/src/presentation/automation-workflow/automation-workflow.controller.ts`
- Modify: `celesnity-core/src/application/automation-workflow/automation-workflow.use-cases.ts`
- Test: `celesnity-core/src/tests/presentation/automation-workflow/automation-workflow.controller.spec.ts`

Steps:

1. Extend run detail only with persisted document artifacts; leave lightweight run-list responses unchanged.
2. Serialize the existing document response shape, including `chart_previews`.
3. Return an empty artifact list for older runs.
4. Add controller tests for one and multiple artifacts and missing document behavior.

## Task 5: Render automation document artifacts in celesnity-web

**Files:**

- Modify: `celesnity-web/src/entities/models/automation-workflow.ts`
- Modify: `celesnity-web/src/infrastructure/repositories/automation-workflow-api.mapper.ts`
- Modify: `celesnity-web/src/infrastructure/repositories/core-api-automation-workflow.repository.ts`
- Modify: `celesnity-web/app/(workspace)/automations/[workflowId]/_components/automation-workflow-detail-screen.tsx`
- Reuse: `celesnity-web/app/_components/documents/document-body.tsx`
- Reuse: `celesnity-web/app/_components/chat/artifact-card.tsx` patterns where appropriate
- Modify: `celesnity-web/app/_i18n/en.ts` and `celesnity-web/app/_i18n/vi.ts` only if new labels are needed
- Test: automation workflow model/mapper/detail-screen tests

Steps:

1. Map the run artifact response into a typed web document model.
2. Add document artifact cards below the existing step outputs in run detail.
3. Open the selected artifact in the existing rich document viewer, preserving chart previews and safe Markdown rendering.
4. Keep the artifact loaded from the run-detail API so refresh/reopen does not depend on React state or the original chat message.
5. Add loading, missing-document, and empty-state handling without changing existing run polling.

## Task 6: Focused verification and real workflow smoke test

**Files:**

- Modify only if a focused check exposes a defect.

Steps:

1. Run Core focused automation/document/Prisma tests.
2. Run minder-agent focused webhook/runtime/MCP tests.
3. Run web focused automation/document renderer tests and typecheck/build checks appropriate to the repository.
4. Start or reuse the local stack only as needed.
5. Trigger the existing one-step `Report-smoke-test-clean` workflow with the real-data instruction.
6. Confirm the run succeeds, a new document ID and chart payload are returned, the run detail API exposes the artifact, and the automation UI renders it after refresh.
7. Trigger a second run and confirm it creates a distinct snapshot.
8. Report unrelated baseline failures separately and leave all changes uncommitted.

## Completion checklist

- [ ] Trusted workflow context and delegation reach MCP tools.
- [ ] Real data and chart calls succeed in the smoke workflow.
- [ ] Documents are persisted with chart previews.
- [ ] Document source run IDs are persisted and scoped through workflow step runs.
- [ ] Run history API returns artifacts.
- [ ] Automation UI renders artifacts after refresh.
- [ ] Focused verification evidence is recorded.
- [ ] No commit was created.
