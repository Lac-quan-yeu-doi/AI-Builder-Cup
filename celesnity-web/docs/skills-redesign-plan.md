# Skills redesign — plan

Written 2026-09-16, against `release/0.3.0-design` (`099cf8c`).
Scope: `/skills` and the four files under it. Interface and flow only —
no Core changes, no agent changes, no schema changes.

Baseline gate: **253 files, 1571 tests, green** (`npm test -- --maxWorkers=2`).

---

## 1. What this feature is

A skill library and authoring surface. Five files, 822 lines, one route.

| File                        | Lines | Job                                                      |
| --------------------------- | ----- | -------------------------------------------------------- |
| `skills-screen.tsx`         | 556   | Everything: list, detail, form, create, delete, state    |
| `skills-chat-panel.tsx`     | 133   | The docked assistant, thread keyed to the selected skill |
| `skill-markdown-editor.tsx` | 101   | CodeMirror markdown editor with skin tokens              |
| `skills-feature.tsx`        | 17    | DI resolution                                            |
| `page.tsx`                  | 15    | Metadata, full-width container                           |

Four journeys: **find** a skill, **read** one, **author** one, **delete** one.
A fifth arrives through the assistant, which can write skills itself and
refreshes the list when it does.

The model is four fields: `name`, `description`, `namespace`, `body`, plus a
`source` of `project` or `global` assigned by the backend. Global skills are
read-only.

---

## 2. The one finding that organises the rest

**The product tells the user the wrong thing about its most important field.**

A skill's `description` is the routing key. It is how the agent decides whether
to load the skill at all. Our own agent says so in two places:

`celesnity-agent/.../minder-skills/src/tool.rs:153`, the schema the model reads
when it writes a skill:

> "One line, no newlines. State when this skill should be used, e.g. 'Use when
> the user asks for a breakdown of revenue by quarter.'"

`celesnity-agent/.../minder-skills/src/loader.rs:74-82`, `build_index()`, which
composes the only view of the library the agent ever sees:

```rust
lines.push(format!("- **{}**{}", skill.name, desc));   // desc = " — {description}"
```

That index is the whole basis for skill selection. The body loads later, and
only if the description won.

`app/_i18n/en.ts:1666`, the hint a human reads under the same field:

> "One short line shown in the list. No line breaks."

The agent is told the description decides when the skill fires. The person is
told it is a caption. A user who follows our hint writes `Yield report`, and the
skill never runs. Nothing in the UI says otherwise, nothing validates it, and an
empty description is accepted silently — `loader.rs:76` then emits a bare
`- **name**` with no guidance attached at all.

This is the same shape as `table-provenance.ts` and `OutputColumn.family` in the
two previous redesigns. Those threw away data that was already on the wire. This
one throws away **meaning** that is already in the backend contract.

Everything below follows from taking the description seriously.

## 2b. The field with no consumer

`namespace` is stored, validated for newlines, and read by nothing. It does not
reach `build_index()`, it is not in the frontmatter the agent routes on, and
`propose_skill` passes `""` for it. It exists to group skills for humans.

Today it is rendered as a monospace line on **every** row, which is the loudest
possible treatment for a field whose only job is grouping. It should become the
grouping.

## 2c. The layout

`skills-screen.tsx:220-221` carries `min-[1080px]` on the outer flex and
`min-[1081px]` on the inner grid. One pixel apart, on nested elements. At exactly
1080px the shell turns into a row while the grid is still one column. Neither is
on the breakpoint scale (`lg` 1024, `xl` 1280).

The grid is `minmax(0,0.7fr) minmax(0,1.3fr)`, so the list takes 35% of what is
left after the 400px assistant dock. Measured at 1440px with the dock open, the
list column renders at roughly 140px and the page subtitle wraps to six lines.

---

## 3. Research → the decisions it settles

| Source                                 | What it does                                                                                             | What it decides here                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Claude skills][claude-skills]         | Groups into **Personal skills / Shared with you / Organization skills**; row is name + description + `⋯` | Group by `source`. Row carries the description. Per-row `⋯`                 |
| [Claude Code skills][cc-skills]        | Descriptions always load; bodies load on demand. A good description states the use case and the triggers | The list is the description tier. Rewrite the hint to say what the field is |
| [ChatGPT plugins][gpt-plugins]         | Directory tabbed by provenance, `Installed` row, search across all, detail page per entry                | Provenance grouping is the convergent answer. Search is table stakes        |
| [VS Code extensions][vscode-ext]       | One `Installed` list, search box above it, `⋯` per row                                                   | Search sits above the list, not in a toolbar                                |
| [NN/g, progressive disclosure][nng-pd] | Frequent up front, rare behind a labelled door                                                           | Search appears past a threshold. Namespace collapses into a group header    |
| [NN/g, modals][nng-modal]              | A modal suits one short focused job and is wrong for a long form                                         | Creation stays inline. Delete becomes an `AlertDialog`                      |
| Linear (via `redesign-handover.md`)    | "Don't compete for attention you haven't earned"                                                         | The idle right pane stops being a 400px filled box                          |
| Vercel (via handover)                  | Denser, not roomier                                                                                      | Rows, two lines, at one height                                              |
| Databricks (via handover)              | Essential front and centre, enriched metadata to a side panel                                            | Delete the "Skill configuration" block; it restates two facts already shown |

[claude-skills]: https://support.claude.com/en/articles/12512180-use-skills-in-claude
[cc-skills]: https://code.claude.com/docs/en/skills
[gpt-plugins]: https://learn.chatgpt.com/docs/plugins
[vscode-ext]: https://code.visualstudio.com/docs/configure/extensions/extension-marketplace
[nng-pd]: https://www.nngroup.com/articles/progressive-disclosure/
[nng-modal]: https://www.nngroup.com/articles/modal-nonmodal-dialog/

**Where the references stop being useful.** Claude and ChatGPT both ship an
enable/disable toggle and an install flow. We have neither concept: every skill
in the store is live, and `SkillSummary` has no enabled field. Adding one is a
backend change and is out of scope. Their grouping, row shape and `⋯` transfer.
Their toggle does not.

---

## 4. Phases

### Phase 0 — Foundations

0.1 **On-scale layout.** `min-[1080px]` and `min-[1081px]` both go.

_Revised during implementation._ `xl:` was the wrong instrument. Measured at
1440px with the dock open, the content area is **740px**, and every viewport
rule confident enough to split it left the editor around 400px wide. The split
is now a **container query** on the element that survives the dock
(`@[52rem]/skills`), so two columns appear when two columns fit and the page
stacks when they do not. The height model follows the same query: stacked, the
library is capped at `50svh` and scrolls itself so the editor below stays
reachable.

0.2 **Stop hand-rolling primitives.** `PageAlert` for the error banner and the
success notice, `AlertDialog` for delete in place of `window.confirm`, `Item`
for the list rows, `SearchField` for the filter, `EmptyState` for the idle right
pane, `DropdownMenu` for the row `⋯`.

0.3 **On-scale type.** `text-xl` / `text-lg` / `text-sm` / `text-xs` and the
hand-written `tracking-tight` / `tracking-wide` become steps: `text-heading-2`,
`text-title`, `text-body-sm`, `text-caption`, `text-label`.

0.4 **Source stops being a status colour.** The `Project` badge uses the
`success` variant today, which is green. Project-versus-global is identity, not
success — the same argument that retired `--notebook-*` in the analytics work.
`Project` becomes `secondary`, `Global` becomes `outline`.

0.5 **Confirm the editor in dark mode.** _Checked, and left alone._ The editor
package ships dark defaults and a `[data-theme="light"] .atomic-cm-editor` block
that re-maps its variables on the editor element itself, which beats anything
inherited from our wrapper. So the attribute decides the editor's colours, not
our 18 `--atomic-editor-*` properties. Pinning it to `light` is correct today
because nothing in the app ever applies the `.dark` class: the dark token blocks
in `globals.css` exist, and no theme switcher sets them. The pin becomes a bug
the day one lands. `app/_components/chat/file-preview/markdown-file-preview.tsx`
carries the same line and the same future.

### Phase 1 — Find

- **Grouped by source.** Two sections, `Project skills` and `Global skills`,
  each with its own count. Project first: it is the only one you can edit.
- **Namespace stops being a browsing axis.** The per-row monospace line goes and
  nothing replaces it. A namespace sub-level was built and then cut on review: it
  is free text with no consumer in the agent, and splitting a handful of skills
  across two or three of them spends more headings than it saves scanning. It
  stays on the form and stays searchable.
- **`SearchField` above the list**, appearing past 8 skills, matching on name,
  description and namespace. Empty result gets its own message with a clear
  control.
- **Rows carry the description at two lines**, not one truncated grey line. A
  skill with no description renders a named warning instead of blank space,
  because an undescribed skill cannot be routed to.
- **Per-row `⋯`** with Delete, so deletion does not require selecting the skill
  first. Global rows have no menu.
- **A real `EmptyState`** with the two actual next actions: create one, or ask
  the assistant to draft one.

### Phase 2 — Read and author

- **One header, not two.** The page `h1` and the detail `h2` both render a title
  today, side by side. The detail pane keeps the skill name; the page title moves
  to the list pane header alone.
- **The description gets promoted.** It leads the metadata block, its hint states
  what the field actually decides, and it carries an example. A character counter
  appears as it approaches the one-line budget.
- **`name` stops pretending to be editable** after creation. In view mode it
  renders as text with a copy affordance, not a disabled input with a hint
  explaining why it is disabled.
- **The "Skill configuration" block goes.** `Source` is already a badge in the
  same header, and `Instruction state` says `Empty` or `Ready` about an editor
  that is visible immediately below it.
- **The editor gets the freed vertical space** and keeps its stats line.

### Phase 3 — Create and delete

- **Cancel returns you to where you were.** Today it drops you on the empty
  state. It restores the previously selected skill.
- **Name validates as you type**, against the pattern the backend enforces, with
  the rule stated once rather than only after a failed submit.
- **Delete is an `AlertDialog`** naming the skill, with the destructive action
  labelled `Delete skill` rather than `OK`.

### Phase 4 — Assistant

- **It becomes a toggle, closed by default.** `/skills` passed `defaultOpen: true`
  and was the only surface that arrived with the 400px dock already taking half
  the width. `/databases` has always used `defaultOpen: false` plus a button; this
  now matches, and Cmd+J still works.
- The scope chip already names the open skill. The panel's empty state gains the
  one missing link: after the assistant writes a skill the list refreshes, but
  nothing selects it. Selecting the newly written skill closes that loop.

### Phase 5 — i18n, a11y, gate

- New keys under `skills.*` in EN and VI. The existing 61 keys stay.
- `aria-current` on the selected row, which `aria-pressed` on a `<button>`
  announces less clearly for a navigation-shaped choice.
- Group headings become real headings so the list is navigable by heading.
- **A visual baseline for `/skills`, which does not exist today.** Add the route
  to `tests/visual/screens.spec.ts` and a `**/api/agent/skills` fixture to
  `tests/visual/core-api-mock.ts`, which has no skills mock at all.
- Update `tests/unit/app/skills-screen.test.tsx` (13 tests) for the new roles.
- Gate: `npm test -- --maxWorkers=2` · `typecheck` · `lint` · `format:check` ·
  `build` · `test:visual`.

---

## 5. Scope notes

- **Nothing is removed.** Create, edit, delete, the global read-only path, the
  markdown editor, the assistant panel, namespace and the body stats all stay.
  One redundant block goes (`Skill configuration`) and one duplicated title
  merges.
- **No backend or data change.** No new field, no new endpoint, no migration.
  Every improvement reads what `SkillSummary` and `SkillDetail` already carry.
- **The enable/disable toggle both references ship is deliberately absent.** It
  needs a field the model does not have.
- **`skills/react-component-development/SKILL.md` documents `--notebook-*`**,
  which the uncommitted analytics work deleted. Stale, and not this plan's to
  fix.

---

## 6. What shipped

| Surface                 | Before                                                          | After                                                                                       |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Library**             | one flat list, source badge and namespace repeated on every row | grouped by source, then namespace; count per group                                          |
| **Finding**             | nothing                                                         | `SearchField` past 8 skills, over name, description and namespace                           |
| **Row**                 | hand-rolled button, description truncated to one grey line      | `Item`, description at two lines, `⋯` menu                                                  |
| **Undescribed skill**   | blank second line                                               | named warning: the agent has only the name to go on                                         |
| **Description**         | hinted as "one short line shown in the list"                    | hinted as what decides when the agent uses the skill, with a live preview of the index line |
| **Name**                | disabled input plus a hint explaining the disabling             | the pane's heading                                                                          |
| **Skill configuration** | a `dl` restating source and "Empty / Ready"                     | gone                                                                                        |
| **Delete**              | `window.confirm`                                                | `AlertDialog`, also reachable from the row `⋯`                                              |
| **Cancel**              | dropped you on the empty state                                  | returns to the skill you had open                                                           |
| **Errors**              | two hand-rolled tinted divs, one of them rendered twice         | `PageAlert`, once, in the region that caused it                                             |
| **Layout**              | `min-[1080px]` and `min-[1081px]`, list at 35%                  | container query, list floored at 280px                                                      |
| **Landmarks**           | a second `<main>` nested inside the shell's                     | one                                                                                         |
| **Visual baselines**    | none                                                            | four: desktop, detail, filtered, 390px                                                      |

**The index preview is the one genuinely new idea.** `build_index()` composes
`- **{name}** — {description}` and the agent chooses from that line alone. The
form now renders that line as it will be written, from two fields already in the
form. See `app/(workspace)/skills/_components/skill-index-preview.tsx`.

### Files

```
app/(workspace)/skills/_components/
  skills-screen.tsx        state, layout, delete dialog
  skill-library.tsx        search, source grouping, rows     (new)
  skill-grouping.ts        filter + group + unroutable check (new)
  skill-detail-pane.tsx    metadata, editor, actions         (new)
  skill-index-preview.tsx  the agent's view of the skill     (new)
  skill-markdown-editor.tsx
tests/visual/              fixtures.ts, core-api-mock.ts, screens.spec.ts
```
