# Analytics, second pass — from folders to a library

Written 2026-09-16. Covers `/analytics` and the question builder's first screen.
The first pass fixed what was broken. This one argues the shape was wrong.

---

## 1. The argument

Both screens are organised around **containers**. Users think in **objects**.

`/analytics` is a file browser: a rail of collections on the left, a table of
whatever is inside the selected one on the right, and the collection's name as
the page title. That is a good tool for one job — *"put this somewhere"* — which
is the rarest thing anyone does here. It is a bad tool for the four jobs people
actually arrive with:

| Job                                          | Frequency | Served today |
| -------------------------------------------- | --------- | ------------ |
| Open the thing I was looking at yesterday    | constant  | no           |
| Find the dashboard another team uses         | often     | only if you know its folder |
| Check whether a number is still current      | often     | no           |
| Make a new chart                             | sometimes | yes          |
| Organise things                              | rarely    | yes          |

The cost is visible on screen. At the moment there is one collection, so the
240px rail holds a single link, and the `<h1>` beside it repeats that link's
text. The page spends its title, its breadcrumb and its entire left column
saying the same three words, and it spends none of them on the thing the user
came for.

The naming compounds it. The sidebar says **Our analytics**, the breadcrumb says
**Our analytics**, and the heading says **Your personal collection** — three
labels for one location, two of which are possessive about a workspace nobody
thinks of as owned.

The builder's first screen has the same disease in a different form: a
full-bleed canvas whose entire content is a 448×120px box in the top-left
corner, offering `catalog → schema → table`. It assumes you already know the
warehouse. It offers no recall of what you queried yesterday and no way to start
from a question that already exists — which is how most real questions get
written.

## 2. The move

**Demote the hierarchy from the primary axis to a filter. Promote the objects.**

Collections stop being *where you navigate* and become *how you narrow*. The
consequence is the whole point: once a collection is a filter rather than a
page, a row can finally say which collection it is in. Today it cannot, because
the collection is the page.

This is the same change Linear made to issues and Vercel made to deployments:
one ranked list, filtered, rather than a tree of pages.

## 3. What funds it

Nothing here needs Core. Both moves use fields already mapped and already
ignored:

- **`ChartCollection.chartCount`** — mapped in the repository, rendered nowhere.
  It turns a rail of names into a rail that tells you where the work is.
- **`ChartCollection.children`** — mapped, rendered nowhere. The rail nests.
- **`useDataSourceBrowser`** already exposes catalogs, schemas, tables and
  metadata. The browse dialog has no capability the page cannot host.

Recency is the one thing the server does not know. It becomes a persisted
Zustand store, the pattern `sidebar.store.ts` and `locale.store.ts` already use:
`persist` + `skipHydration` + rehydrate in an effect. Interface-only, and it
degrades to nothing on a fresh browser — which is why the library below it has
to be good on its own.

## 4. `/analytics` — the library

```
Analytics                                    [⌕ Search]      [New ▾]
┌── 240 ────────┐ ┌──────────────────────────────────────────────┐
│ All        37 │ │ Recent                                        │
│ Shared     24 │ │ [card] [card] [card] [card]                   │
│   Finance   8 │ │                                               │
│   Ops      11 │ │ [All] [Dashboards] [Questions]         37     │
│ Personal   13 │ │ ──────────────────────────────────────────    │
│               │ │ ▦ Ops overview          Ops · 2d              │
│ + Collection  │ │ ▤ Revenue by region     Finance · 5d          │
└───────────────┘ └──────────────────────────────────────────────┘
```

- **No container as `<h1>`.** The page is "Analytics". Where you are is the
  filter state, shown in the rail and the row metadata.
- **Rail = scope filter with counts**, nested, `All` at the top. Selecting one
  narrows the list; it does not change the page's identity.
- **Recents first**, hidden when empty.
- **Type filter** — dashboards are a different kind of thing and are looked for
  differently.
- **Every row names its collection.** This is the payoff of filtering.
- **Search covers the library**, not "this collection".
- `/analytics/collections/[id]` keeps working and sets the initial filter, so
  existing links survive.

**Naming:** nav and page become **Analytics**. The root collection is
**Shared**, the personal one is **Personal**. Two words, one meaning each.

## 5. The builder's first screen

```
[×] Untitled chart                        [View SQL] [Run] [Save]
────────────────────────────────────────────────────────────────
Pick a table to start from                   [⌕ Search everything]

Recent                     Browse
┌─────────────────────┐    iceberg › factory_silver
│ press_telemetry     │    ┌────────┬────────┬────────┐
│ factory_silver      │    │Catalogs│Schemas │Tables  │
└─────────────────────┘    └────────┴────────┴────────┘
────────────────────────────────────────────────────────────────
Then  ▢ Filter   ▢ Summarize   ▢ Sort & limit   → Visualize
```

- **The three Miller columns move onto the page.** The dialog's only unique
  capability was cross-level search; that becomes the page's search field. One
  picker instead of two.
- **Recent tables**, from the same store.
- **The steps ahead are visible, disabled.** Filter, Summarize, Sort appear only
  after a source is chosen today, so the shape of the task is hidden at exactly
  the moment you are deciding whether to take it on.

## 6. Scale

The capture harness grows a realistic org — nested collections, dozens of charts
and several dashboards, spread across them. A design judged against one
collection and three charts is not judged at all.

## 7. What this does not do

- No Core change, no new endpoint, no schema change.
- Nothing is removed except the browse dialog, whose every capability the page
  now holds.
- `chartCount` is Core's number; it is displayed, not computed.
