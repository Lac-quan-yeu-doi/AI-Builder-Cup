# Workspace Multi-File Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe preview-first file viewer to the celesnity-web workspace sidebar so common workspace artifacts are rendered by type instead of always opening in Monaco.

**Architecture:** Keep `WorkspaceTreePane` as the tree/selection owner and turn `RunFileViewer` into a shared loading shell. Add a pure preview-policy/classifier layer plus focused renderers for Markdown, JSON, CSV/TSV, media, and safe download fallback; Monaco remains the read-only renderer for source-like files. Stage tabs and split-pane file artifacts remain outside this Phase 1 plan.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, `@monaco-editor/react`, `react-markdown`, `remark-gfm`, existing Celesnity UI primitives, Vitest, Testing Library, and Playwright visual tests.

**Spec:** `docs/superpowers/specs/2026-09-11-workspace-file-preview-design.md`

## Global Constraints

- Preview-only: do not add workspace file editing.
- Preserve the existing authenticated `getWorkspaceFileContent(roomId, path)` fetch boundary.
- Preserve the current 2 MiB source-like inline cap; use 5 MiB for CSV/TSV and 20 MiB for raster images, PDFs, audio, and video.
- Do not fetch a known-over-limit file on mount; fetch it only after an explicit Download action.
- Use a specific supported MIME type first; treat generic `text/plain` and `application/octet-stream` as non-authoritative and refine with the filename extension.
- Do not enable raw Markdown HTML, execute HTML/source files, or render SVG as active inline markup.
- Use only already-installed runtime dependencies in Phase 1; implement the bounded CSV/TSV parser locally.
- Preserve existing Monaco, image, PDF, download, refresh, not-found, and object-URL cleanup behavior.
- Add English and Vietnamese translation keys together because `en` is the typed translation source of truth.
- Do not add stage tabs, split-pane file artifacts, or file comparison to Phase 1.
- Do not create commits unless the user explicitly requests them.

## File and responsibility map

Create these focused modules:

- `app/_components/chat/file-preview/file-preview.types.ts` — preview kinds, normalized content, renderer context, and policy result types.
- `app/_components/chat/file-preview/file-preview-policy.ts` — pure MIME/extension classification, language mapping, inline byte limits, and generic MIME normalization.
- `app/_components/chat/file-preview/delimited-text-parser.ts` — pure CSV/TSV parser with quoted-field handling and row/column bounds.
- `app/_components/chat/file-preview/markdown-file-preview.tsx` — safe rendered Markdown and source-mode controls.
- `app/_components/chat/file-preview/json-file-preview.tsx` — structured JSON tree and formatted raw fallback.
- `app/_components/chat/file-preview/delimited-file-preview.tsx` — bounded table display and raw fallback.
- `app/_components/chat/file-preview/media-file-preview.tsx` — image, PDF, audio, and video elements that consume viewer-owned object URLs.
- `app/_components/chat/file-preview/file-preview-body.tsx` — dispatches the normalized preview model to the correct renderer and owns shared preview controls.

Modify these existing files:

- `src/entities/models/workspace-tree.ts` — carry optional MIME metadata through workspace entries and materialized file nodes.
- `src/infrastructure/repositories/core-api-workspace-tree.repository.ts` — map optional MIME metadata from the Core API tree response.
- `app/(workspace)/chat/_components/stage/workspace-tree-pane.tsx` — pass MIME metadata into the existing `RunFileEntry` adapter and show type-aware file hints without changing tree selection behavior.
- `app/_components/chat/run-file-viewer.tsx` — retain the loading/download shell and delegate preview classification/rendering to the new modules.
- `app/_i18n/en.ts` and `app/_i18n/vi.ts` — add renderer labels, controls, parse notices, and safe fallback copy.

Extend these tests:

- `tests/unit/entities/workspace-tree.test.ts`
- `tests/unit/infrastructure/repositories/core-api-workspace-tree.repository.test.ts`
- `tests/unit/app/workspace-tree-pane.test.ts`
- `tests/unit/app/chat/run-file-viewer.test.ts`

Create these focused tests:

- `tests/unit/app/chat/file-preview-policy.test.ts`
- `tests/unit/app/chat/delimited-text-parser.test.ts`
- `tests/unit/app/chat/file-preview-body.test.tsx`

Use the existing visual suite in `tests/visual/screens.spec.ts` for the final smoke coverage if its current chat/workspace fixture can exercise the preview states without introducing a new backend fixture.

---

### Task 1: Define the preview policy and normalized preview contracts

**Files:**

- Create: `app/_components/chat/file-preview/file-preview.types.ts`
- Create: `app/_components/chat/file-preview/file-preview-policy.ts`
- Test: `tests/unit/app/chat/file-preview-policy.test.ts`

**Interfaces:**

- Consumes: `RunFileContent` and `RunFileEntry` metadata from `src/entities/models/chat.ts`.
- Produces: `PreviewKind`, `PreviewPolicy`, `NormalizedMime`, and pure policy functions used by the viewer and all renderers.

Define these types and signatures:

```ts
export type PreviewKind =
  | 'text'
  | 'markdown'
  | 'json'
  | 'table'
  | 'image'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'source-only'
  | 'binary';

export interface PreviewPolicy {
  readonly kind: PreviewKind;
  readonly maxInlineBytes: number;
  readonly language?: string;
  readonly label: string;
}

export function previewPolicyFor(path: string, mimeType?: string): PreviewPolicy;
export function normalizeMimeType(mimeType: string | undefined): string | undefined;
export function isPreviewOverLimit(policy: PreviewPolicy, sizeBytes: number | undefined): boolean;
```

Use this exact precedence:

1. Normalize MIME by trimming parameters and lowercasing.
2. Treat `text/plain`, `application/octet-stream`, and missing MIME as generic.
3. Use specific supported MIME mappings for Markdown, JSON, CSV/TSV, images, PDF, audio, and video.
4. Use extension mappings when MIME is generic or missing, including `.md`, `.markdown`, `.json`, `.csv`, `.tsv`, `.svg`, `.html`, `.htm`, source extensions, and media extensions.
5. Return `source-only` for SVG and HTML.
6. Return `binary` for unknown/ambiguous formats.

Set policy limits as constants in this module: 2 MiB for `text`, `markdown`, `json`, and `source-only`; 5 MiB for `table`; 20 MiB for `image`, `pdf`, `audio`, and `video`; and no inline allowance for `binary`. Keep source-like `csv` and `txt` extension behavior distinct so CSV uses the table policy.

Add tests for:

```ts
it('uses a specific MIME over a misleading extension', () => {
  expect(previewPolicyFor('report.txt', 'application/pdf').kind).toBe('pdf');
});

it('uses an extension when the response MIME is generic', () => {
  expect(previewPolicyFor('notes.md', 'text/plain').kind).toBe('markdown');
});

it('classifies CSV and TSV with the table policy', () => {
  expect(previewPolicyFor('rows.csv', 'application/octet-stream').kind).toBe('table');
  expect(previewPolicyFor('rows.tsv', undefined).kind).toBe('table');
});

it('keeps active HTML and SVG out of the renderer set', () => {
  expect(previewPolicyFor('page.html').kind).toBe('source-only');
  expect(previewPolicyFor('icon.svg', 'image/svg+xml').kind).toBe('source-only');
});
```

Run: `npm test -- --run tests/unit/app/chat/file-preview-policy.test.ts`  
Expected: the new policy tests pass after the module is implemented.

### Task 2: Carry MIME metadata through the workspace tree

**Files:**

- Modify: `src/entities/models/workspace-tree.ts`
- Modify: `src/infrastructure/repositories/core-api-workspace-tree.repository.ts`
- Modify: `app/(workspace)/chat/_components/stage/workspace-tree-pane.tsx`
- Test: `tests/unit/entities/workspace-tree.test.ts`
- Test: `tests/unit/infrastructure/repositories/core-api-workspace-tree.repository.test.ts`
- Test: `tests/unit/app/workspace-tree-pane.test.ts`

**Interfaces:**

- Consumes: `PreviewPolicy` only for display hints; the tree remains independent of renderer components.
- Produces: `WorkspaceEntry.mimeType?: string`, `WorkspaceTreeNode.mimeType?: string`, and a `RunFileEntry` containing the workspace entry MIME when available.

Add `readonly mimeType?: string` to `WorkspaceEntry`, `WorkspaceTreeNode`, and the internal mutable tree node. Preserve the field only for file leaves; synthesized directories must not acquire a file MIME. Update `buildTree` and `materializeNode` so the MIME value survives nesting, sorting, and freezing without mutating caller input.

Extend the Core API DTO and `mapWorkspaceEntry` to map an optional `mimeType` response field. Keep responses without that field valid and omit the property in the mapped object when absent, matching the repository’s existing optional-field style.

Update `toRunFileEntry` in `workspace-tree-pane.tsx`:

```ts
function toRunFileEntry(entry: WorkspaceEntry): RunFileEntry {
  return {
    path: entry.path,
    accessType: 'read',
    toolName: 'workspace',
    accessedAt: entry.modifiedAt,
    available: true,
    ...(entry.sizeBytes === undefined ? {} : { sizeBytes: entry.sizeBytes }),
    ...(entry.mimeType === undefined ? {} : { mimeType: entry.mimeType }),
  };
}
```

Do not change selection state, refresh debouncing, optimistic changes, directory behavior, or the existing `RunFileViewer` key. Add tests proving MIME survives `buildTree`, repository mapping accepts both present and absent MIME, and selecting a workspace file still reaches the existing content controller.

Run:

```bash
npm test -- --run \
  tests/unit/entities/workspace-tree.test.ts \
  tests/unit/infrastructure/repositories/core-api-workspace-tree.repository.test.ts \
  tests/unit/app/workspace-tree-pane.test.ts
```

Expected: all existing tests and the new MIME-preservation assertions pass.

### Task 3: Implement the bounded CSV/TSV parser

**Files:**

- Create: `app/_components/chat/file-preview/delimited-text-parser.ts`
- Test: `tests/unit/app/chat/delimited-text-parser.test.ts`

**Interfaces:**

- Consumes: decoded text, delimiter, and row/column bounds.
- Produces: a pure `DelimitedTable` result used by the table renderer.

Define:

```ts
export interface DelimitedTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly truncated: boolean;
}

export interface DelimitedParseOptions {
  readonly delimiter: ',' | '\t';
  readonly maxRows: number;
  readonly maxColumns: number;
}

export function parseDelimitedText(source: string, options: DelimitedParseOptions): DelimitedTable;
```

Implement a small state-machine parser, not `source.split(',')`. It must support quoted fields, escaped quotes represented by `""`, delimiters and newlines inside quoted fields, empty fields, CRLF and LF line endings, and a final row without a trailing newline. Treat the first parsed row as headers; pad shorter rows with empty strings and truncate columns above `maxColumns`. Stop collecting rows after `maxRows` data rows and set `truncated` when additional records remain.

Add tests for:

```ts
expect(
  parseDelimitedText('name,notes\nAda,"a,b"', {
    delimiter: ',',
    maxRows: 2000,
    maxColumns: 100,
  }),
).toEqual({
  headers: ['name', 'notes'],
  rows: [['Ada', 'a,b']],
  truncated: false,
});
```

Also cover escaped quotes, multiline fields, tabs, empty cells, CRLF, column truncation, row truncation, and an empty source. Keep parser errors deterministic; malformed unterminated quotes should return the collected safe fields and mark the table as truncated/fallback-worthy rather than throw during rendering.

Run: `npm test -- --run tests/unit/app/chat/delimited-text-parser.test.ts`  
Expected: all parser edge-case tests pass.

### Task 4: Add focused preview renderers

**Files:**

- Create: `app/_components/chat/file-preview/markdown-file-preview.tsx`
- Create: `app/_components/chat/file-preview/json-file-preview.tsx`
- Create: `app/_components/chat/file-preview/delimited-file-preview.tsx`
- Create: `app/_components/chat/file-preview/media-file-preview.tsx`
- Create: `app/_components/chat/file-preview/file-preview-body.tsx`
- Test: `tests/unit/app/chat/file-preview-body.test.tsx`

**Interfaces:**

- Consumes: normalized `PreviewKind`, decoded text, Blob/object URL data, `Translator`, and callbacks supplied by `RunFileViewer`.
- Produces: read-only renderer UI with no file fetching and no ownership of the viewer’s fetch lifecycle.

Define a renderer context in `file-preview.types.ts`:

```ts
export interface FilePreviewContext {
  readonly path: string;
  readonly fileName: string;
  readonly kind: PreviewKind;
  readonly language?: string;
  readonly text?: string;
  readonly blob?: Blob;
  readonly objectUrl?: string;
  readonly t: Translator;
}
```

Implement the renderers with these rules:

- `MarkdownFilePreview` uses `react-markdown` and `remark-gfm`. Do not enable raw HTML. Use explicit safe link/image URL handling. Provide rendered/source mode state; source mode delegates to the existing read-only Monaco styling without editing.
- `JsonFilePreview` calls `JSON.parse` once, renders primitives/arrays/objects through a small recursive read-only tree, and shows formatted raw JSON when requested. Invalid JSON displays the raw text and a translated parse notice rather than throwing.
- `DelimitedFilePreview` calls `parseDelimitedText` with `maxRows: 2000` and `maxColumns: 100`, renders a horizontally scrollable semantic table, displays a truncation notice, and offers raw text when parsing is not usable.
- `MediaFilePreview` renders raster images, PDFs, audio, and video only from the object URL supplied by the viewer. Use native controls for audio/video, an iframe for PDF, and no active SVG branch. Do not create or revoke object URLs inside this component.
- `FilePreviewBody` dispatches only on the already-normalized kind. It must render `source-only` through read-only source text and `binary` through the existing translated download-only empty state.

Keep controls keyboard-accessible with button labels and `aria-pressed` for mode toggles. Use existing Button, EmptyBlock, Spinner, and table/UI conventions instead of introducing a new component library.

Add component tests that mock Monaco as the current viewer test does and verify Markdown output, source toggle, JSON valid/invalid states, CSV table/truncation, image/PDF/audio/video element selection, source-only HTML/SVG behavior, and binary fallback. Test that renderers do not invoke the content controller.

Run: `npm test -- --run tests/unit/app/chat/file-preview-body.test.tsx`  
Expected: renderer tests pass in jsdom with Monaco and media elements mocked where necessary.

### Task 5: Refactor RunFileViewer into the universal loading shell

**Files:**

- Modify: `app/_components/chat/run-file-viewer.tsx`
- Modify: `tests/unit/app/chat/run-file-viewer.test.ts`

**Interfaces:**

- Consumes: `previewPolicyFor`, `FilePreviewBody`, `RunFileContent`, `RunFileEntry`, and the existing content/download callbacks.
- Produces: the same `RunFileViewerProps` public API and existing behavior for all callers.

Remove the local `Preview` union, extension language map, and MIME branching from `run-file-viewer.tsx`. Keep the public props and the shared fetch state in this file. Compute an entry policy before fetching:

```ts
const entryPolicy = previewPolicyFor(entry.path, entry.mimeType);
const overCap = isPreviewOverLimit(entryPolicy, entry.sizeBytes);
```

After fetching, recompute the policy with the response MIME. If the response Blob exceeds the response policy limit, retain the Blob for Download and render the download-only state. Otherwise decode text once for text-like kinds, parse JSON/CSV through the renderer adapter boundary, or create one object URL for image/PDF/audio/video. Pass the normalized context to `FilePreviewBody`.

Preserve these lifecycle invariants:

- Known-over-limit entries never call `getRunFileContent` during mount.
- Download fetches an over-limit entry exactly once and reuses its Blob on later clicks.
- A selected-entry change cancels stale rendering through the existing `active` guard.
- Every object URL is revoked before replacement and on unmount.
- A NotFoundError remains a translated not-found state.
- The Download button remains visible for every state where content can be retrieved.
- The existing `run-inspector-modal` and automation workflow callers require no prop changes.

Update the viewer header to include the detected type and size when available, while retaining Back and Download labels. Use the existing `INLINE_MAX_BYTES` behavior for source-like files and the new policy limits for other kinds.

Extend `run-file-viewer.test.ts` rather than replacing it. Keep all current tests and add tests for per-kind size gates, generic MIME extension refinement, Markdown/JSON/CSV/media routing, and object URL cleanup. Confirm existing run-inspector behavior remains compatible because `RunFileEntry.mimeType` is already optional.

Run:

```bash
npm test -- --run tests/unit/app/chat/run-file-viewer.test.ts
```

Expected: existing and new viewer tests pass, including the no-fetch-on-over-cap assertion.

### Task 6: Add localized sidebar hints and preview copy

**Files:**

- Modify: `app/(workspace)/chat/_components/stage/workspace-tree-pane.tsx`
- Modify: `app/_i18n/en.ts`
- Modify: `app/_i18n/vi.ts`
- Test: `tests/unit/app/workspace-tree-pane.test.ts`
- Test: `tests/unit/app/chat/file-preview-body.test.tsx`

**Interfaces:**

- Consumes: `previewPolicyFor` and optional `WorkspaceTreeNode.mimeType`.
- Produces: type-aware file hints, localized renderer controls, parse notices, size/fallback messages, and accessible labels.

Add a small type hint next to file rows only when it improves recognition without displacing the change badge. Use the same policy classification for the hint and viewer so the sidebar does not claim a preview type different from the content surface. Keep directories unchanged.

Add matching English and Vietnamese keys for:

- Preview modes: rendered, source, raw, copy, copied.
- File types: Markdown, JSON, table, image, PDF, audio, video, source, binary.
- Parse states: invalid JSON and invalid CSV/TSV.
- Table metadata: row/column counts and truncation.
- Media controls and browser fallback.
- Preview unavailable/too large and safe source-only notices.

Do not hard-code new user-facing strings in renderer components. Use `Translator` keys and preserve the existing `Dictionary` typing contract.

Extend tests to assert a MIME-bearing tree entry remains selectable, its accessible label still uses the existing `Open {path}` wording, and the preview controls render translated labels in the English test dictionary.

Run:

```bash
npm test -- --run \
  tests/unit/app/workspace-tree-pane.test.ts \
  tests/unit/app/chat/file-preview-body.test.tsx
```

Expected: all localization and accessible-label assertions pass in both existing test setup and type checking.

### Task 7: Run integrated validation and visual smoke coverage

**Files:**

- Modify: `tests/visual/screens.spec.ts` only if an existing workspace fixture needs a stable preview assertion.
- No application-code changes should be made in this task.

**Interfaces:**

- Consumes: all Phase 1 modules and tests from Tasks 1–6.
- Produces: verified working preview foundation with no stage-tab scope leakage.

Run the focused unit suite first:

```bash
npm test -- --run \
  tests/unit/app/chat/file-preview-policy.test.ts \
  tests/unit/app/chat/delimited-text-parser.test.ts \
  tests/unit/app/chat/file-preview-body.test.tsx \
  tests/unit/app/chat/run-file-viewer.test.ts \
  tests/unit/app/workspace-tree-pane.test.ts \
  tests/unit/entities/workspace-tree.test.ts \
  tests/unit/infrastructure/repositories/core-api-workspace-tree.repository.test.ts
```

Then run repository validation:

```bash
npm run typecheck
npm run lint
npm run format:check
```

If the existing visual fixture can open workspace files, add assertions for the tree plus one text/Markdown/table/media/fallback state without masking the new renderer surface. Otherwise record that the visual suite cannot exercise authenticated workspace content locally and rely on the component tests; do not invent a network fixture in this task.

Finally run the complete test suite:

```bash
npm test
```

Review the final diff for these invariants: no file editing was introduced, no stage reducer changes were made, no existing run-file caller lost compatibility, no unsafe HTML/SVG execution path exists, and all existing user work in the repository remains untouched. Do not commit or push.

## Execution order

Execute Tasks 1 through 7 in order. Tasks 1–3 establish pure contracts and parsing behavior before UI work. Task 4 creates renderers against those contracts. Task 5 integrates them into the existing shared viewer while preserving lifecycle behavior. Task 6 adds user-facing copy and tree hints. Task 7 validates the complete Phase 1 surface and checks that Phase 2/3 concerns did not leak into the implementation.

## Completion criteria

The implementation is ready for review when:

1. Common source, Markdown, JSON, CSV/TSV, raster image, PDF, audio, and video files preview safely from the workspace sidebar.
2. HTML, SVG, office, archive, unknown, and over-limit files use a clear download/source fallback.
3. Existing Monaco, image, PDF, download, refresh, not-found, and object-URL behavior remains covered and passing.
4. MIME metadata is preserved through the workspace tree when the API provides it, while absent metadata remains compatible.
5. The focused tests, full tests, typecheck, lint, and format checks pass, or any environment blocker is explicitly reported with command output.
6. No application code was changed for stage tabs, editing, server-side conversion, or file comparison.
