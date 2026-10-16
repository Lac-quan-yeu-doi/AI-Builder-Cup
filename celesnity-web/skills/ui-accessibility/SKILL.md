---
name: ui-accessibility
description: Use when building or changing any interactive UI, form, dialog, table, status indicator, or live-updating region, and when an eslint-plugin-jsx-a11y rule fires
---

# UI Accessibility

## Overview

This workspace is keyboard-heavy: trees, editors, tables, and long-running jobs.
Accessibility here is mostly four things — reachable controls, named controls,
status that is not only color, and updates that are announced.

`eslint-config-next` runs `jsx-a11y`; a passing lint is the floor, not the goal.

## Non-negotiables

1. **Semantic element first.** `button` for actions, `a`/`Link` for navigation,
   `label` bound to its input, `table`/`th` for tabular data. A `div` with
   `onClick` is a defect.
2. **Every control has an accessible name** — visible text, or a translated
   `aria-label` (never a hardcoded English string; see
   `skills/internationalization/SKILL.md`).
3. **Keyboard reachable and operable.** Tab order follows visual order; Enter and
   Space activate; Escape closes dialogs and menus; focus never gets trapped by
   accident, and never disappears after an action.
4. **Visible focus.** Keep the shared focus styles (`:focus-visible` in
   `app/globals.css`, `focus-visible:outline-*` on the `ui/` primitives). Never
   `outline: none` without a replacement.
5. **Status is never color alone.** Execution and query states carry text or an
   icon plus color — see `execution-status-badge.tsx` and `status-badge.tsx`.
6. **Announce async change.** Loading, error, and progress regions that update
   without navigation need `role="status"` / `aria-live="polite"`
   (`role="alert"` for failures), and disabled buttons need
   `aria-busy` while a request is in flight.
7. **Decoration is hidden.** Purely visual marks (`status-dot`, the nav
   two-letter mark) get `aria-hidden="true"`.

## Patterns for this app

| Element                                        | Requirement                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Navigation                                     | `<nav aria-label={t('nav.label')}>`, current page marked with `aria-current="page"`                                             |
| Forms (connections)                            | `label` per field, errors linked with `aria-describedby`, `aria-invalid` on the field, focus moved to the first error on submit |
| Dialogs                                        | `role="dialog" aria-modal="true"`, labelled by its heading, focus in on open and returned on close, Escape closes               |
| Tree (catalog)                                 | `aria-expanded` on expandable nodes, `aria-selected` on the selection, arrow-key traversal preserved                            |
| Result grid                                    | Real `table` with `th scope="col"`; caption or `aria-label` describing the query result                                         |
| Monaco editors (`sql-editor`, `python-editor`) | Labelled container; do not remove the editor's own keyboard handling; provide a documented way out of the editor                |
| Long-running jobs                              | Progress text in a live region, plus a real Cancel button — not only a spinner                                                  |

## Checks before finishing

- [ ] Tab through the changed screen: every control reachable, focus visible,
      order sensible
- [ ] Operate it with keyboard only, including cancel and close paths
- [ ] Zoom to 200%: nothing clipped or overlapping
- [ ] Contrast: body text and status text meet 4.5:1 against their token
      background (`text-ink-muted` on `bg-surface-muted` is the risky pair)
- [ ] Screen-reader pass on the region you changed (VoiceOver: `Cmd+F5`)
- [ ] `npm run lint` clean, tests query by role/label
      (`getByRole('button', { name })`) rather than by class

## Common mistakes

- `div`/`span` with `onClick` and no `role`, `tabIndex`, or key handler.
- `placeholder` used instead of a `label`.
- Status conveyed only by a colored dot.
- `aria-label` written in English while the UI is Vietnamese.
- Spinner replacing the whole screen so focus is lost on every refresh.
- Removing focus outlines to match a design mock.
