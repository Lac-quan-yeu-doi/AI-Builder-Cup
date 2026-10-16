# Recurring Rich Report Artifacts Design

**Date:** 2026-09-22  
**Status:** Proposed for implementation  
**Scope:** Automation workflows that create real Markdown reports with persisted chart previews and render those documents in run history

## 1. Summary

Each automation run should be able to execute the same trusted data path as an interactive agent run: discover the authorized warehouse scope, query real data, create a chart preview, and call `create_document` with Markdown plus the chart payload. The run history must retain the created document as a first-class artifact so selecting a completed run opens the same rich document renderer used by chat and the Documents screen.

The current failure is before document rendering: Core invokes the agent webhook without workflow delegation metadata, and minder-agent rejects MCP calls with `Trusted MCP room delegation metadata is required.` The fix is to propagate a typed, trusted automation context through the webhook and runtime, then persist the creating agent run ID when `create_document` runs.

## 2. Goals

- Make scheduled and test automation runs inherit the workflow's authorized data scope.
- Allow the agent to use real Trino/catalog, chart, and document tools in that scope.
- Preserve a new document snapshot for every successful report run.
- Preserve the chart preview payload inside the document, not as a transient chart-only UI state.
- Show created document artifacts in automation run history and open them with the existing rich Markdown/chart renderer.
- Keep interactive chat artifact behavior unchanged.
- Surface the response body for webhook failures so contract and permission errors are diagnosable.

## 3. Non-goals

- Replacing the existing agent or workflow execution model.
- Making a standalone chart persistence system required for reports.
- Parsing document IDs out of agent prose or step output.
- Adding a second Markdown/chart renderer.
- Creating mock data when warehouse access fails.
- Supporting arbitrary external workflow destinations or cross-tenant data access.

## 4. User flow

1. An administrator configures one concise workflow instruction, for example: “Create a real monthly revenue report for the last 12 complete months, include region breakdown, create a chart, and save one Markdown document.”
2. A scheduled or test run creates an automation run and invokes the configured agent step.
3. Core passes a trusted workflow/run/step context and the workflow's authorized data scope to minder-agent.
4. minder-agent starts the autonomous run with trusted room delegation metadata.
5. The agent discovers accessible data, queries it, creates a chart preview, and calls `create_document` with a matching `<chart-preview ... />` marker and `chart_previews` payload.
6. The document tool returns a normal document artifact and emits machine-readable artifact metadata containing the document ID, filename, and chart previews.
7. Core associates that document with the current automation run and step.
8. The run history shows a document artifact card. Selecting it opens the existing document viewer with rendered headings, tables, lists, and chart previews.
9. Every later run creates a new document snapshot; an earlier run remains immutable and points to its own document.

## 5. Architecture

### 5.1 Trusted workflow context

Add a typed automation context to the webhook request and runtime context. It contains only server-generated identifiers and display metadata:

```ts
type AutomationWorkflowRunContext = {
  kind: "automation-workflow";
  workflow_id: string;
  workflow_run_id: string;
  workflow_step_id: string;
  workflow_name?: string;
};
```

Core creates this context from the persisted workflow/run/step and sends it in the authenticated internal webhook body. Minder-agent accepts it only on the internal automation webhook path, validates the identifiers, stores it on the run context, and forwards it to the runtime without allowing the user input to override it.

The existing data scope remains the authorization boundary. The workflow must not be able to widen it through prompt text or arbitrary client input.

### 5.2 Trusted MCP delegation

The internal webhook must supply the room ID and verified caller subject required by the existing MCP controllers. The runtime stores those values as delegation metadata on the autonomous run, and the MCP manager forwards them to Trino, chart, and document tools. No MCP controller should be weakened to allow missing delegation metadata.

Use the existing room/run delegation model. If the automation path has no persisted room, create or resolve one deterministic machine room for the workflow run before starting the agent run; do not invent a second authorization mechanism.

### 5.3 Webhook contract

Extend the typed Core-to-agent request with a structured automation context and delegation fields. Keep `system_prompt` out of the webhook body unless the agent contract explicitly supports it; workflow instructions remain the agent input or the configured manifest prompt. The agent `TurnDto` must accept only the new validated internal fields and reject malformed or externally supplied delegation data.

When the agent webhook returns a non-2xx response, Core includes a bounded response body in the thrown error so the workflow run records the actual rejection reason.

### 5.4 Artifact persistence

Keep `Document.chartPreviews` as the canonical chart payload and persist the trusted minder-agent run ID that created the document on the document row. Core already records that same agent run ID on `AutomationWorkflowStepRun`, so run history can resolve documents through the existing step-run relation without a second association table or a prose parser.

The document action receives the trusted automation run ID from MCP request metadata, not from report prose or model arguments. Interactive documents leave this field null and keep their existing message-block artifact behavior. A single workflow run may produce multiple documents through multiple step runs; each document retains its creating agent run ID.

### 5.5 Run history API and UI

Extend the workflow run detail response with documents resolved by its step runs, containing the existing document response shape, including `chart_previews`. The web model maps those artifacts and the run detail panel renders an artifact card/list.

Selecting an automation document opens the existing `DocumentBody`/`ChartPreviewPane` path in the run-history side pane or dialog. Do not duplicate chart parsing or Markdown rendering. If the document is unavailable, show a recoverable error and retain the filename/ID.

## 6. Failure behavior

- Missing/invalid internal delegation metadata: fail the step with the exact trusted-delegation error; create no document.
- Catalog or table access failure: fail the step with the bounded warehouse error; create no mock document.
- Chart creation failure: fail the step unless the workflow instruction explicitly requests a text-only fallback.
- Document creation failure: fail the step and do not create an orphan run artifact association.
- Duplicate delivery: preserve existing workflow idempotency behavior.
- Existing older runs with no artifact association: continue to render their existing output and show no artifact card.

## 7. Testing strategy

- Core unit tests for webhook request serialization, bounded non-2xx response bodies, and workflow context propagation.
- Agent unit tests for webhook DTO validation, trusted context parsing, and delegation metadata reaching MCP calls.
- Core persistence tests for append-only run-document associations and organization scoping.
- Document MCP tests proving chart previews and automation association are retained while interactive message blocks still work.
- Controller/API tests for run detail artifact serialization.
- Web tests for mapping and rendering a document artifact with a chart preview, plus refresh/reload-safe artifact loading.
- One focused end-to-end smoke run using the existing single-step workflow with real connected data; no full-suite rerun unless a focused failure requires it.

## 8. Acceptance criteria

- The clean single-step test workflow can query the connected catalog without the trusted delegation error.
- A successful run creates a new Markdown document with a real chart preview payload.
- The workflow run detail response includes that document artifact.
- The automation UI shows and opens the document with a rendered chart, table, headings, and lists.
- Refreshing the automation page preserves the artifact because it is loaded from persisted run history, not browser state.
- A second run creates a distinct document snapshot and leaves the first run unchanged.
- No source commit is created as part of this work.
