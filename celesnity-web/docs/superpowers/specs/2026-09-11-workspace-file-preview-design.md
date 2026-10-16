# Workspace Multi-File Preview Design

**Date:** 2026-09-11  
**Status:** Proposed for review  
**Scope:** Previewing files selected from the chat workspace sidebar in `celesnity-web`

## 1. Summary

The workspace sidebar currently opens every selected file through `RunFileViewer`. Text-like content is rendered in a read-only Monaco editor, while images and PDFs have dedicated branches and other content falls back to download-only. This design turns that viewer into a preview-first surface with explicit file-type renderers.

The first phase keeps the existing workspace tree and selected-file flow. Monaco remains available for source and plain text, but it is no longer the default representation for every file. The preview surface will support Markdown, JSON, CSV/TSV, raster images, PDFs, audio, video, and safe download fallback. Editing is explicitly out of scope.

A later phase may promote files to chat-stage artifacts so several previews can remain open as tabs or split panes. That is not required for the first release.

## 2. Goals and non-goals

### Goals

- Let users inspect common workspace artifacts without downloading them.
- Choose a renderer from MIME type first, with filename extension as a fallback.
- Preserve the current lazy-loading and download behavior for large or unsupported files.
- Make the viewer safe for untrusted workspace content.
- Keep renderer behavior isolated and independently testable.
- Reuse existing UI and dependency conventions where they fit.
- Give the sidebar enough metadata to communicate file type and preview availability.

### Non-goals

- Editing workspace files.
- Executing source code, scripts, notebooks, or HTML from the preview.
- Server-side conversion of DOCX, XLSX, PPTX, or archive formats.
- Building a full IDE or file comparison experience.
- Making every binary format previewable in the browser.
- Adding stage tabs or split-pane file comparison in the first phase.

## 3. User experience

The existing flow remains recognizable:

1. The user opens the Files workspace pane.
2. The tree displays folders and files with type-aware icons or badges when metadata is available.
3. The user selects a file.
4. The preview surface loads only that file's content.
5. A compact header shows the path, detected type, size when known, and actions for Back, Download, and any renderer-specific controls.
6. The user can return to the tree without losing the current tree state.

The preview header should communicate the selected artifact clearly:

```text
results.csv · CSV · 148 KB
[Back] [Download]
```

A failed preview must not remove the tree or make the workspace pane unusable. It shows an actionable error or download fallback and preserves the Download action whenever content can still be retrieved.

### Renderer behavior

| Content                                                                               | Default preview                                    | Secondary behavior                                    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| TypeScript, JavaScript, JSX/TSX, Python, SQL, shell, YAML, XML, TOML, CSS, plain text | Read-only Monaco with inferred language            | Word wrap, copy/select, Download                      |
| Markdown                                                                              | Rendered Markdown using the existing GFM renderer  | Source view using read-only Monaco                    |
| JSON                                                                                  | Expandable structured tree                         | Formatted raw text, copy, Download                    |
| CSV/TSV                                                                               | Scrollable table with a bounded row/column preview | Raw text, Download                                    |
| PNG, JPEG, GIF, WebP, BMP                                                             | Image preview with contain/actual-size controls    | Download                                              |
| PDF                                                                                   | Embedded browser PDF surface                       | Download; browser fallback message if embedding fails |
| Audio                                                                                 | Native audio controls                              | Download                                              |
| Video                                                                                 | Native video controls                              | Download                                              |
| SVG                                                                                   | Source view or download-only                       | Never inject as active HTML                           |
| HTML                                                                                  | Source view or download-only                       | Never execute workspace HTML                          |
| DOCX, XLSX, PPTX, ZIP, archives, unknown binary                                       | File metadata and download fallback                | No client-side conversion in MVP                      |

Markdown should reuse `react-markdown` and `remark-gfm`, which are already installed. The workspace renderer must use a safe component policy rather than copying a general document renderer blindly: raw HTML is not enabled, links are restricted to safe protocols, and external links open with `noopener noreferrer`. Workspace-relative links do not become arbitrary application navigations.

## 4. Architecture

### 4.1 Viewer boundary

`WorkspaceTreePane` remains responsible for tree loading, selection, refresh reconciliation, and navigation back to the tree. It should not contain format-specific rendering logic.

`RunFileViewer` should become the shared file-loading shell, still usable by run-inspector and automation flows. Its responsibilities are:

- Apply the known-size preview gate before fetching.
- Fetch content and retain the Blob for Download.
- Normalize response metadata.
- Classify the content into a preview kind.
- Render loading, not-found, error, and download-only states.
- Revoke object URLs when a preview is replaced or unmounted.

The format-specific branches should be extracted behind a small preview model/registry boundary. A renderer receives normalized content and display metadata and returns a read-only preview. Renderers must not fetch files themselves.

Conceptually:

```text
WorkspaceTreePane
  -> RunFileViewer
       -> load + size gate
       -> classifyFile(path, mimeType, size)
       -> PreviewRenderer
            text/code
            markdown
            json
            delimited table
            image
            pdf
            media
            binary fallback
```

The classifier is a pure function so precedence is deterministic and testable:

1. Enforce the known size limit.
2. Prefer a specific supported response MIME type.
3. Treat generic MIME values such as `text/plain` and `application/octet-stream` as non-authoritative and use the filename extension to refine the preview kind.
4. Use the filename extension when MIME is missing.
5. Treat ambiguous or unsafe formats as source/download fallback.

### 4.2 Workspace metadata

The current `WorkspaceEntry` has no MIME metadata, while `RunFileContent` receives `mimeType` only after the content request. The workspace tree contract should add optional metadata without making older API responses invalid:

```ts
interface WorkspaceEntry {
  readonly path: string;
  readonly isDir: boolean;
  readonly sizeBytes?: number;
  readonly modifiedAt: string;
  readonly mimeType?: string;
}
```

The client may use the extension as an immediate icon/classification hint, then refine the viewer from the content response. When the Core API can provide MIME metadata reliably, the tree should return it so the sidebar can show type information and avoid misleading text icons before selection.

`RunFileContent.mimeType` remains authoritative for the fetched response. MIME parameters such as `text/plain; charset=utf-8` must be normalized for classification without losing the original value for diagnostics.

### 4.3 Preview model

The viewer should distinguish load state from preview kind. A normalized preview model should cover:

- `text`: source value plus Monaco language.
- `markdown`: source value for rendered/source modes.
- `json`: parsed value plus original/pretty source, with an invalid-JSON fallback to text.
- `table`: bounded columns and rows plus raw source when parsing fails.
- `image`, `pdf`, and `media`: Blob-backed object URL and metadata.
- `binary`: reason and Download availability.

The model must never require a renderer to reinterpret the raw response Blob. Text extraction, parsing, and object URL ownership belong to the viewer/preview adapter layer.

## 5. Limits and loading policy

Preview limits prevent accidental large downloads and expensive browser work. The existing 2 MiB inline cap remains the default for source-like content.

Initial limits:

- Source text, Markdown, JSON: 2 MiB.
- CSV/TSV: 5 MiB and a bounded displayed row count of 2,000 rows.
- Raster images and PDFs: 20 MiB.
- Audio and video: 20 MiB for inline preview.
- SVG and HTML: source-only preview up to 2 MiB; larger files use download-only fallback.
- Office files, archives, and unknown binary: download-only regardless of size.

These limits are client-side preview limits, not upload or storage limits. If the tree supplies a size above the relevant limit, the viewer must not fetch content on mount. Download fetches the file only after an explicit user action, preserving the current behavior.

For files without a reliable size, the viewer may fetch once and switch to download-only if the returned Blob exceeds the renderer limit. The already fetched Blob may still be used for Download.

CSV/TSV parsing must stop at the display bound and must correctly handle quoted fields, escaped quotes, delimiters inside quoted fields, and newlines inside quoted fields. The raw source remains available when parsing fails. No CSV dependency is currently installed, so the MVP uses an isolated local parser module with these behaviors and dedicated unit tests.

## 6. Safety requirements

Workspace files are untrusted content. The preview system must enforce these rules:

- Do not enable `rehype-raw` or otherwise inject Markdown HTML into the DOM.
- Restrict Markdown link and image protocols to an explicit safe allowlist.
- Do not execute HTML, JavaScript, shell scripts, notebooks, or other source files.
- Do not render SVG as active inline markup. Use source or download fallback.
- Use `URL.createObjectURL` only for the intended image/PDF/media element and revoke every URL during replacement and unmount.
- Keep external link targets on `noopener noreferrer`.
- Treat unknown MIME values as unsupported rather than guessing an executable format.
- Preserve authenticated fetch boundaries; the viewer must not construct direct unauthenticated file URLs.
- Show a safe fallback if a browser cannot embed a PDF or play media.

## 7. Error and empty states

The viewer distinguishes:

- Loading: spinner and accessible status message.
- Not found: file no longer exists; offer Back and no misleading preview.
- Preview too large: explain that inline preview is disabled and keep Download.
- Invalid JSON: show raw text with a non-blocking “could not parse as JSON” notice.
- Invalid CSV/TSV: show raw text with a parsing notice and Download.
- Unsupported binary: show type/size metadata and Download.
- Browser media/PDF failure: show a browser-support message and Download.
- Network/remote failure: show an error and Retry where retrying is meaningful.

Refreshing the workspace tree must preserve the selected file when its path still exists. If it has been deleted, the viewer returns to the tree and displays the existing change/reconciliation state.

## 8. Stage integration follow-up

The first phase keeps workspace files inside the existing `workspace` artifact. The existing chat stage already supports tabs, splits, and maximization, but arbitrary file artifacts would require stable IDs, per-file loading state, and a way to render a file without coupling the tree selection to the stage active tab.

A later phase can add:

- Open in new tab.
- Open beside/right or below.
- Close/pin preview tabs.
- Reopen recently viewed files for the current room.
- Compare two text-like files in split panes.

Those actions should build on the same classifier and preview renderer contract rather than create a second file viewer.

## 9. Testing strategy

### Pure classification and parsing tests

- MIME takes precedence over extension when valid.
- Extension fallback handles supported source, Markdown, JSON, CSV/TSV, image, PDF, and media types.
- Generic or unknown MIME values fall back safely.
- Size thresholds prevent inline loading at the boundary.
- JSON parses into structured data and invalid JSON falls back to raw text.
- CSV/TSV handles quoted delimiters, escaped quotes, multiline fields, empty cells, headers, and row limits.

### Viewer component tests

Extend the existing `run-file-viewer` coverage for:

- Markdown rendered mode and source toggle.
- JSON structured mode and invalid-JSON fallback.
- CSV/TSV table mode and parser fallback.
- Raster image, PDF, audio, and video object URL handling.
- SVG/HTML/unknown binary download fallback.
- Per-renderer size gates without an unnecessary mount fetch.
- Download reuse of an already fetched Blob.
- URL revocation on replacement and unmount.
- Loading, not-found, and error states.
- Accessible labels for path, renderer controls, and status messages.

### Workspace and repository tests

- Workspace tree entries preserve optional MIME metadata.
- Repository maps MIME metadata when present and remains compatible when absent.
- Workspace selection still refreshes and reconciles created/modified/deleted entries.
- Selecting a file invokes the content controller only once for an inline preview.
- A deleted selected file returns the user to the tree safely.

### Validation

The implementation should pass the affected Vitest tests, `npm run typecheck`, `npm run lint`, and `npm run format:check`. A focused visual smoke test should verify the tree, preview header, Markdown, table, image, PDF, and download fallback states.

## 10. Delivery phases

### Phase 1: Universal preview foundation

- Add the shared classifier and preview model.
- Preserve existing Monaco, image, PDF, size, and download behavior.
- Add Markdown, JSON, CSV/TSV, audio, video, and safe binary fallback renderers.
- Add optional MIME metadata to workspace entries and repository mapping.
- Add localization strings and focused tests.

### Phase 2: Preview polish

- Add renderer-specific controls such as source/raw toggle, image zoom, copy, and table metadata.
- Improve type-aware file icons and badges in the tree.
- Add focused visual coverage and responsive behavior for narrow panes.

### Phase 3: Multi-file stage workflow

- Add “open in new tab” and “open beside” actions.
- Represent workspace files as stable stage artifacts.
- Reuse the Phase 1 renderer registry for tab and split-pane content.

Phase 1 is complete when users can select the supported common formats from the workspace sidebar, receive the correct safe preview or download fallback, and existing text/image/PDF/download behavior remains intact.
