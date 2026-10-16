# Analytics redesign — plan

Written 2026-09-16, against `release/0.3.0-design` (`099cf8c`).
Scope: `/analytics` and everything it routes to. Interface and flow only —
no Core changes, no new endpoints, no schema changes.

Baseline gate before any edit: **253 files, 1555 tests, green.**

---

## 1. What this feature is

A Metabase-shaped self-serve BI surface inside a data-engineering workspace.
61 `.tsx` files, ~9,000 lines, four journeys:

| Journey      | Route                                | Files                              |
| ------------ | ------------------------------------ | ---------------------------------- |
| **Browse**   | `/analytics`, `/collections/[id]`    | `collection-browser-*`             |
| **Ask**      | `/charts/new`, `/charts/[id]/edit`   | `charts/_components/**` (~7k lines) |
| **Read**     | `/charts/[id]`                       | `saved-chart-*`                    |
| **Assemble** | `/dashboards/[id]`, `.../edit`       | `dashboards/[dashboardId]/**`      |

---

## 2. The one finding that organises the rest

**The feature already knows more than it shows.** Three times over, data that is
already fetched — already in React state — is dropped before it reaches a pixel.

1. **`description` and `provenance` come back on every chart** and
   `ChartSummary` keeps only `provenance`. The browse list renders icon + title
   + a `—`, so three charts named `… temperature by machine — 2026-09-02` are
   indistinguishable. The API is returning
   `"Bar chart of max temperature by machine on 2026-09-02 from
   factory_silver.press_telemetry"` for each of them, and we throw it away.

2. **`OutputColumn.family`** (`STRING | NUMBER | BOOLEAN | DATE | TIMESTAMP |
   UNKNOWN`) is carried through preview results and used for nothing. One field,
   used properly, fixes four separate complaints: no type icons in field
   pickers, `Average` offering you `Machine State`, numbers left-aligned in the
   results grid, and a chart type that never matches the data.

3. **The "Last edited by" column is always `—`.** It is also the reason
   `min-[1081px]` exists — a hand-written breakpoint whose only job is to hide a
   column that never has content.

This is the same move as `table-provenance.ts` in the database work: the answer
was already on the wire.

## 2b. The second palette

`app/globals.css:247-272` declares eighteen `--notebook-*` custom properties:

```
--notebook-data: #0075de;        --notebook-filter: #924ff7;
--notebook-summarize: #00a240;   (+ -soft and -on, light and dark)
```

Those are Metabase's brand hexes, hard-coded, forming a complete second palette
in a codebase whose rule 7 reads *"One palette: the ChatGPT skin."* Purple
appears nowhere else in the product. The `no-restricted-syntax` rule cannot see
them because they entered through a token name, which is exactly the failure its
own header comment warns about: *"the palette drifted back to a previous skin
once already because nothing mechanically stopped it."*

Sixteen files consume them, and the blue `Visualize` button they produce breaks
the skin's central rule — the CTA is near-black; blue is links, focus, selection.

---

## 3. Research → the decisions it settles

| Source                                             | Principle                                                              | What it decides here                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Metabase editor docs][mb-editor]                  | The tool picks the visualization; the user corrects it                 | Propose a type from the result shape instead of always landing on Table          |
| [NN/g, preattentive attributes][nng-dash]          | Length and 2-D position read instantly; area and angle do not          | Rank Bar/Line/Scatter above Pie/Area; keep all seven, weight them differently    |
| [NN/g, progressive disclosure][nng-pd]             | Frequent up front; rare behind a labelled door                         | Chart type is frequent → out of the floating pill, into the panel                |
| [Metabase collections][mb-collections]             | Trust signals rank content                                             | `provenance` is the trust signal we already have — surface "From chat"           |
| [Metabase dashboards][mb-dash]                     | Edit mode is a mode, entered by one control                            | Keep the mode; replace six unlabelled icons with three labelled ones             |
| [Data-table practice][pnp-tables]                  | Right-align numerals, tabular figures, 40–44px compact rows            | Results grid and browse list                                                      |
| Linear (via `redesign-handover.md`)                | "Structure should be felt, not seen"                                   | Notebook keeps its bands, loses its three colours                                |
| Vercel (via handover)                              | Denser, not roomier                                                    | Browse rows gain a description line at the same row height                       |
| Databricks (via handover)                          | Essential front and centre, enriched metadata to a side panel          | Saved chart: chart **or** data behind a switch, not both stacked                 |

[mb-editor]: https://www.metabase.com/docs/latest/questions/query-builder/editor
[mb-collections]: https://www.metabase.com/docs/latest/exploration-and-organization/collections
[mb-dash]: https://www.metabase.com/docs/latest/dashboards/introduction
[nng-dash]: https://www.nngroup.com/articles/dashboards-preattentive/
[nng-pd]: https://www.nngroup.com/articles/progressive-disclosure/
[pnp-tables]: https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables

---

## 4. Phases

### Phase 0 — Foundations

0.1 **Retire `--notebook-*`.** Delete all eighteen properties. Step identity moves
from hue to **label + icon**; bands share one neutral surface; the accent is
reserved for the chip you are actually manipulating. `NotebookStepBand` keeps its
`tone` prop so the sixteen call sites do not churn — `tone` now selects an icon.

0.2 **A scoped lint ratchet.** Add the selectors the global rule is missing —
`font-[NNN]`, `tracking-[…]`, `leading-[…]`, `min-[…]`/`max-[…]`, `shadow-[…]`,
3-digit hex, stock Tailwind type steps — as an `eslint.config.mjs` block scoped
to `app/(workspace)/analytics/**` and `app/(workspace)/charts/**`. Widening the
glob is how the rest of the app-wide sweep lands later. Applying it globally now
would fail the gate on ~27 unrelated files.

0.3 **Stop hand-rolling primitives.** `ui/table` for the saved-chart grid,
`ui/tabs` (default segmented variant) for both hand-rolled tablists,
`ui/collapsible` for `<details>`, `ui/alert-dialog` for `window.confirm`, a real
dialog for `window.prompt`, `ui/native-select` for bare `<select>`.

### Phase 1 — Browse

- Carry `description` through `ChartSummary` and the presenter; render it as a
  single truncated line (`block truncate`, never `ItemDescription` — it is
  `line-clamp-2`).
- Drop the always-`—` "Last edited by" column, and `min-[1081px]` with it.
- `provenance` becomes a quiet badge when it is not `MANUAL`.
- Breadcrumb for nested collections; the nav renders the tree, not two links.
- One "create collection" control, not two.
- A real `EmptyState` with the two actual next actions.
- `min-[981px]` → `lg:`.

### Phase 2 — Ask

- **One header.** Merge `ChartBuilderHeader` and `QuestionBuilderSurface`'s
  second `<h1>`; the catalog/schema/table line becomes the subtitle.
- **Fix the browse dialog** rather than delete it — its cross-level search is a
  capability the inline picker lacks. Give it width so `iceberg` stops rendering
  as `iceb…`, and three honest Miller columns.
- **Notebook on-skin** per 0.1; near-black `Visualize`; per-step preview buttons
  get a real affordance and appear only when the step has content.
- **Field pickers show types** from `OutputColumn.family`, and numeric
  aggregations list numeric fields first.
- Off-grid: `min-[900px]` → `lg:`, `p-[14px]` → `p-4`, `min-h-[68px]` → `min-h-16`.

### Phase 3 — See (results surface)

- Chart type moves out of the floating bottom pill into the top of the left
  panel, always visible. The pill goes.
- `proposeVisualizationType(columns)` — a pure function over column families.
  Applied to the first result only; never overrides an explicit choice.
- Type picker ordered by readability, with shapes that cannot render the current
  result disabled and explained.
- Fix the duplicated `Columns` / `Columns` label; `Done` becomes secondary so
  `Save` is the only near-black CTA on screen.
- Results grid: right-aligned numerals, tabular figures, sticky header, compact
  rows, type hint in each column header.

### Phase 4 — Read (saved chart)

- Breadcrumb back to the collection.
- `text-heading-2`, not `text-3xl`.
- Chart and data behind a segmented switch instead of stacked forever.
- `ui/table`, `ui/collapsible`.
- `CHAT` renders as "From chat", not as an enum.
- `Refresh` demotes to an icon; `Edit` is the only CTA.

### Phase 5 — Assemble (dashboards)

**View:** `ui/tabs`; header hierarchy with `Edit` primary; filter bar showing the
active count and a reset; real `EmptyState`; breadcrumb; `gap-[6px]` → `gap-1.5`.

**Editor:** six unlabelled ghost icons collapse to `+ Add ▾` (Chart, Text,
Heading, Link, Section), `Filter`, and `⋯`. `window.prompt` → dialog,
`window.confirm` → `AlertDialog`. The editing bar stays a mode, on-skin, with
`Save` as the black CTA.

### Phase 6 — i18n, a11y, gate

- `useTranslation` through every screen touched; EN and VI keys under
  `analytics.*`. Today **60 of 61 files have no i18n at all**, in a product with
  an EN/VI switch in the sidebar.
- Roving tabindex and `aria-controls` arrive free with `ui/tabs`.
- Gate: `npm test` · `typecheck` · `lint` · `format:check` · `build` ·
  `test:visual`.

---

## 4b. Found in review

Three screens still looked broken after the phases above, and each had a cause
worth naming:

- **`/analytics/charts/[chartId]` and `/analytics/dashboards/[id]` had no
  padding** and clipped below the fold. Both used `PageContainer width="full"`,
  which supplies no padding and is `h-[calc(100vh-3.5rem)] overflow-hidden` —
  it exists for canvases that scroll themselves. They are `wide` now.
- **The entry screen's option cards clipped their descriptions.**
  `buttonVariants` carries `whitespace-nowrap`, so prose inside a `Button`
  cannot wrap. They are `Item`s, which is the primitive for media + title +
  description. The screen also had no baseline, which is why it shipped that
  way; it has two now.
- **Dashboard cards cut their charts off.** `ChartRenderPreview` asserted
  `min-h-64` plus `my-4` — 288px inside a six-row, 240px card with
  `overflow-hidden`. It takes a `fill` prop now, and the card is a flex column.

## 5. Scope notes

- **`ChartSummary.description`** touches `src/`, not Core. The field is already
  on the wire; this is presenter mapping, which is frontend.
- **Nothing is removed.** The browse dialog, all seven chart types, tabs,
  filters, version history, save-as-new and SQL mode all stay. Two controls
  merge (duplicate "create collection"), and one always-empty column goes.
- **12 visual baselines** cover the chart builder. Expect them to move; per the
  handover, delete and regenerate rather than trusting `--update-snapshots`.
