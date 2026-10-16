# Redesign handover — celesnity-web

Written 2026-09-16. Everything below is committed on `release/0.3.0-design`
(`52cd650`). Start a new session by reading this, then `CLAUDE.md` and the
`skills/` entries it routes to.

---

## 1. The one finding that explains most of it

**The app is off-grid.** Almost every value is hand-picked rather than taken
from the scale `app/globals.css` already defines:

| Measured across `app/`                                                | Count                          | What the scale says                                |
| --------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------- |
| `font-[650]` / `font-[750]` / `font-[850]`                            | **93**                         | Weight stops at **600**; none of these three exist |
| distinct hand-written `tracking-[…]`                                  | **10**                         | Each type step carries its own                     |
| distinct hand-written `leading-[…]`                                   | **10**                         | Each type step carries its own                     |
| off-4px spacing (`p-[18px]`, `gap-[9px]`, `mt-[7px]`, `size-[23px]`…) | dozens                         | 4px base                                           |
| hand-written `min-[…]` breakpoints in one container                   | **5** (961/981/1080/1081/1201) | `md:` `lg:` `xl:`                                  |
| uppercase eyebrow labels                                              | **47**, in 8 spellings         | should be one component                            |

Premium interfaces read that way because they have **rhythm** — few values,
repeated. Nothing here lines up because nothing shares a value.

**The lint rule has a hole.** `eslint.config.mjs:174-179` catches `text-[13px]`
but **not** `font-[750]`, `p-[18px]`, `tracking-[…]`, `leading-[…]`, stock
`text-sm`, `max-[…]:`, `shadow-[…]`, or 3-digit hex. Its own header comment
warns "the palette drifted back to a previous skin once already because nothing
mechanically stopped it" — this is that hole.

**This sweep has NOT been done.** It was scoped out deliberately: it touches
~100 files across chat, plant-model, administration and more, none of which the
database work was about. It is the single highest-value remaining change.

---

## 2. Design rules that decided things

From research, and now load-bearing in this codebase:

- **Linear**: _"Don't compete for attention you haven't earned"_ and
  _"structure should be felt not seen"_ — they found separators "quietly
  proliferated… sometimes appearing without clear reason" and deleted them.
- **Vercel** made its deployments list **denser**, not roomier.
- **Databricks** moved enriched metadata to a side panel and kept "essential
  column information front and center".
- **Fivetran** lists connections as sortable rows, not one panel each.

House rules that fell out of applying them here:

1. **Rows, not cards, for lists of like things.** `app/_components/ui/item.tsx`
   is the vocabulary (`Item`, `ItemContent`, `ItemTitle`, `ItemActions`).
2. **Outcomes rank above identifiers.** Status, name, duration stay; UUIDs,
   exit codes and resource profiles go behind a disclosure.
3. **Chrome recedes.** One CTA per screen. A control appears when it earns its
   place (search shows past 8 items).
4. **Nothing leaves reach** — actions move behind `⋯`, never away.
5. **Silence is the healthy state.** The Overview health strip reports only
   problems, by name.

### The design system's own answers

- **Tabs**: the canonical variant is **`default`** — the segmented pill on
  `bg-muted`, active trigger on `bg-background` with `shadow-sm`. That is what
  `minder-design-system/app/design-system/general/sections-navigation.tsx:181`
  uses. The `line` variant exists but has to be overridden to sit anywhere
  useful (`after:bottom-[-5px]`). **If you find yourself overriding a component
  that hard, you picked the wrong one.**
- **The skin's idiom is filled surfaces, not rules.** `celesnity-product-design`
  README: _"the CTA is neutral; blue is only links, focus and selection"_.
  ChatGPT itself uses no underline tabs anywhere — selection is always a
  rounded filled surface.

---

## 3. Traps that cost time

- **`ItemDescription` is `line-clamp-2`**, which beats `truncate`. For a
  one-line row use a plain `<span className="block truncate …">`.
  `line-clamp-none` makes it _worse_ — it sets `overflow: visible`.
- **`overflow-x-auto` needs `min-w-0`** on a flex/grid child, or the element
  grows to fit its content and widens the whole page. This caused a
  page-level horizontal scroll at 375px.
- **`title` on a button becomes its accessible name**, beating the content. A
  run row announced a UUID to screen readers. Put the tooltip on an inner span.
- **`--update-snapshots` does not rewrite a passing baseline.** With
  `maxDiffPixelRatio: 0.002`, a small fix can leave the suite green over a
  picture of the bug. Delete the `.png` and regenerate when you changed the
  render but the baseline did not move.
- **Prettier globs miss `[database]` paths** — format those via
  `--stdin-filepath`.
- **`npm test`, never bare `npx vitest`**, or whole files fail oddly.
- **Visual specs break on copy changes** — they wait on text (`settle(page, …)`)
  and select by accessible name.

---

## 4. What shipped (four surfaces)

| Surface       | Before                                         | After                                                                |
| ------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| **Overview**  | did not exist                                  | new default tab: problems → tables with provenance → recent activity |
| **Tables**    | Columns → raw Iceberg dump → Preview           | Preview → Columns → history behind a disclosure                      |
| **Sources**   | five-band panel each                           | one row; `⋯` for Test/Edit/Archive; pager added                      |
| **Pipelines** | narrow cards in a grid                         | rows; name is the link; right-aligned columns                        |
| **Runs**      | tall cards, 6 fields, 3 same-minute timestamps | rows grouped by day, with duration; status filter                    |
| **Shell**     | flow rail with arrows                          | segmented subtabs; sidebar `+` removed                               |

**Table provenance is the one genuinely new idea.** The Spark runtime stamps
every Iceberg commit with `app-name = pipeline-{id}-v{n}`; the snapshot also
carries `total-records` and `committed_at`. So table → pipeline → version → when
is free, from data the Tables tab already fetches.
See `app/(workspace)/databases/[database]/_components/table-provenance.ts`.

---

## 5. Open work, roughly by value

1. **The grid sweep + lint hole** (§1). Mechanical, low risk, biggest visual
   payoff, unblocks everything else landing on a clean grid.
2. **Extract the eyebrow component** — 47 uses, 8 spellings.
3. **~120 more untranslated strings** outside the database container:
   `pipeline-canvas-screen`, `node-palette`, `node-property-panel`,
   `node-preview-panel`, `pipeline-node-card`, `execution-detail`,
   `execution-logs`, `database-service-form`, `verification-result`.
4. **Canvas**: two always-expanded text inputs in the toolbar should be an
   editable title; properties and issues are mutually exclusive
   (`activePanel` is one value) and that is exactly the pair a failed Save
   sends you between.
5. **Two hand-rolled tablists** with no roving tabindex or `aria-controls`
   (canvas `Visual|Script`, run `Overview|Logs`); **a hand-rolled modal** with
   no focus trap (`run-inspector-modal.tsx`).
6. **~30 sites hand-roll a primitive that exists** — `PageAlert`, `EmptyState`,
   `Button`, `Tabs`, `Badge`, `Card`, `DataTable`, `Dialog`, `Pager`,
   `NativeSelect`.
7. `error` is never reset in `source-metadata-explorer-screen.tsx`.
8. `database-screen.tsx:206` throws an English `Error` that reaches the user.
9. Two crawler-status tone maps disagree on `RUNNING`
   (`source-scan-summary.tsx:24` warning vs `metadata-crawler-status-badge.tsx:17` info).

---

## 6. Core-side defects (frontend cannot fix)

1. **Spark commits data and metadata to S3 without advancing the
   `iceberg_tables` pointer, and the run still reports SUCCEEDED.** Verified:
   parquet and metadata `00001`/`00002` written today, catalog pointer still on
   yesterday's `00000-…`. This is why the Overview flags tables as behind.
2. **Pausing a metadata crawler hides its whole snapshot** — `hasSnapshot:
false`, every count zero, Discovered tables empty. Resuming restores it.
   Pausing a _schedule_ should not hide data already collected.
3. **`PipelineSummary.lastRunAt` is never populated**, so every pipeline row
   says "never run".
4. **`CATALOG_ACCESS_DENIED` is returned for "unresolvable"**, which reads as a
   permission problem. Also: pass the **Trino** catalog name (`iceberg`), not
   the JDBC identity (`celesnity`) — the wrong one yields 502 then 403.
5. **Iceberg `CREATE_NEW` targets are one-shot** — the second run fails
   `TABLE_OR_VIEW_ALREADY_EXISTS` with no way out from the UI. `APPEND` is then
   blocked by a validator comparing Postgres `character varying` against
   Iceberg `string` as if one type system.

---

## 7. Where things are

```
app/(workspace)/databases/[database]/_components/
  database-screen.tsx        shell, tabs, loaders
  database-subtabs.tsx       the segmented tab bar
  database-overview.tsx      the default tab
  table-provenance.ts        app-name parsing + behind-version check
  database-flow-stage.ts     next-step ordering (the rail's remains)
app/_components/execution/   runs list, detail, grouping, status badge
app/_components/database-service/  sources list, screen, form
app/_components/catalog/table-detail.tsx   the Tables detail panel
app/_components/pipeline/pipelines-screen.tsx
```

Gate, in order: `npm test` · `npm run typecheck` · `npm run lint` ·
`npm run format:check` · `npm run build` · `npm run test:visual`.

Full written plan, including the competitive research: `~/.claude/plans/purrfect-tinkering-mccarthy.md`.
