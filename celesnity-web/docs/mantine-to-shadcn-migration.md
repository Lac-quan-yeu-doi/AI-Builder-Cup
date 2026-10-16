# Mantine → shadcn/ui migration

celesnity-web dropped `@mantine/core` and adopted the shadcn/ui library vendored
from `minder-design-system`. Every screen now renders design-system components.

## What changed

### Dependencies

Removed `@mantine/core`, `@mantine/hooks`. Added `radix-ui`,
`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `cmdk`,
`sonner`, `next-themes`, `react-resizable-panels`, and the dev-only `shadcn`
(for `shadcn/tailwind.css`) and `tw-animate-css`.

### Palette (`app/globals.css`)

`app/mantine-theme.ts` is gone, and so is the Celesnity green palette. The
workspace now runs on **shadcn/ui's `neutral` base**, verbatim from
`https://ui.shadcn.com/r/colors/neutral.json` — byte-for-byte the set
`minder-design-system` ships, so a component can move between the two apps
without a re-theme. Raw values on `:root` (plus `.dark`), mapped to Tailwind
through `@theme inline`. `--radius: 0.625rem`, the stock value.

Every Celesnity token was retired and its ~640 call sites remapped:

| Retired                           | Now                                                     |
| --------------------------------- | ------------------------------------------------------- |
| `surface`, `surface-raised`       | `card`                                                  |
| `surface-muted`, `surface-sunken` | `muted`                                                 |
| `surface-hover`, `brand-soft`     | `accent`                                                |
| `ink`, `ink-strong`, `ink-label`  | `foreground`                                            |
| `ink-muted`, `ink-faint`          | `muted-foreground`                                      |
| `line`, `line-soft`               | `border`                                                |
| `brand`                           | `primary` (now near-black, not green)                   |
| `field-line`                      | `input`                                                 |
| `danger-*`                        | `destructive`, with alphas for the soft surfaces        |
| `success-*`                       | Tailwind `emerald`                                      |
| `warning-*`                       | Tailwind `amber`                                        |
| `sidebar-*`                       | shadcn's own sidebar tokens (were unused by any screen) |

About 120 hardcoded hex values and every green-tinted `rgb()` shadow went with
them. The chat landing hero's green ambient gradient is now a neutral wash.

`neutral` defines exactly one status colour, `destructive`. Success, warning and
the informational tone borrow Tailwind's own `emerald` / `amber` / `blue`
scales — the same mechanism the palette uses for its chart ramp
(`--chart-1: var(--color-blue-300)`), not a new brand palette. They are reachable
as `Badge` variants `success` / `warning` / `danger` / `info`; the old `brand`
variant is gone, since with a neutral `accent` and `primary` it had become
indistinguishable from `secondary`.

Two tokens deliberately sit outside the palette: `editor-canvas` (`#1e1e1e`) is
Monaco's own `vs-dark` background — it has to match the editor's theme, not
ours — and `editor-chrome` is the neutral `card` at dark lightness for the header
above it.

**Not** taken from minder-design-system: the typeface. It uses Inter; this app
keeps self-hosted Roboto, which carries the `vietnamese` subset the workspace
dictionary needs.

The `@layer theme, base, mantine, components, utilities;` declaration is gone —
it existed to keep Tailwind's preflight off Mantine's controls.

### `app/_components/ui/`

The Mantine wrapper layer was replaced wholesale. See the README in that folder
for the vendored-vs-composed split and the four documented edits to vendored
files.

| Was                                       | Now                                                              |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `classNames()` in `class-names.ts`        | `cn()` in `utils.ts` — clsx through tailwind-merge               |
| `Button` (`tone`, `loading`, `component`) | `Button` (`variant`, `asChild`) + `<Spinner />` at the call site |
| `IconButton`                              | `Button size="icon-sm" aria-label=…`                             |
| `LinkButton`                              | `Button variant="link"`                                          |
| `Panel` (`component="aside"`)             | `Card` (`asChild` + the landmark element)                        |
| `Modal` (`opened`/`onClose`)              | `Dialog` + `DialogContent`/`Header`/`Title`                      |
| `TextInput` / `Textarea` / `Select`       | `TextField` / `TextareaField` / `SelectField` in `fields.tsx`    |
| `SearchableSelect` / `MultiSelect`        | `Combobox` / `MultiCombobox` — Popover + Command                 |
| `Field`                                   | `FieldBlock` (`aria-labelledby` on the group)                    |
| `Radio`/`RadioGroup`                      | `RadioGroupField`                                                |
| `Menu`                                    | `DropdownMenu`                                                   |
| `SegmentedControl`                        | `ToggleGroup`                                                    |
| `Pagination`                              | `Pager` — real buttons, not anchors                              |
| `CountPill` / `ShimmerLine`               | `Badge variant="secondary"` / `Skeleton`                         |
| `PageAlert` / `InlineError`               | `page-alert.tsx`, on shadcn `Alert`                              |
| `Typography`, `SelectableRow`             | Deleted — screens compose these directly                         |
| `icons.tsx`                               | `lucide-react`                                                   |

## Behaviour differences worth knowing

Three came out of the migration and are load-bearing:

1. **`Button` defaults to `type="button"`.** shadcn's is a bare `<button>`,
   which submits the surrounding form. Mantine's did not. The workspace forms
   carry Cancel and Test-connection controls beside the submit, so the default
   is restored in the vendored component.
2. **A dialog makes the page behind it inert.** Radix marks every sibling of
   `DialogContent` `aria-hidden`, so an error raised by a dialog's own action is
   invisible if it renders on the page. The pipelines, database-services and
   metadata-crawler screens now gate their page-level `PageAlert` on the dialog
   being closed and render an `InlineError` inside the dialog instead. Under
   Mantine those errors were merely awkward; under Radix they were unreachable.
3. **`loading` is gone from `Button`.** A busy action sets `disabled` +
   `aria-busy` and renders `<Spinner />` beside its label at the call site.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run format:check` — clean.
- `npm test` — 546/547. The one failure,
  `chat-screen.test.ts > accumulates token totals across events`, **fails on
  `HEAD` too** (verified in a worktree at `1eeb626`): it asserts on an
  intermediate SSE frame that both frames may overtake. Pre-existing, unrelated.
- `npm run build` — clean.
- `npm run test:visual` — 21/21 after regenerating baselines. The baselines were
  **already stale before this work**: `f1ada05` (2026-08-17) generated them, and
  `e808390` (2026-08-19) added the Metadata Crawler nav item and raised the nav
  label breakpoint from `min-[1141px]` to `min-[1321px]` without a regen.
  The spec's Monaco mask now also covers the editor's region wrapper: it only
  listed `.monaco-editor`, which does not exist until Monaco mounts, so a slow
  capture baked the "Loading…" placeholder into the baseline.

## Follow-ups not done here

- The vendored `select` (Radix), `sheet`, `menubar`, `navigation-menu`,
  `resizable`, `slider`, `accordion`, `command` and friends are present but
  unused. They are library surface, not dead code — delete them if you would
  rather keep the folder minimal.
- Dark mode ships as a token block only; nothing toggles `.dark` yet.
- With a greyscale palette the page ground (`background`) and the card surface
  are both white, so panels are separated by their border alone. That is how the
  stock `neutral` base looks; if the screens need more separation, change
  `--background` in one place.
- `Toaster` (`sonner`) is mounted in `app/layout.tsx` but no screen calls
  `toast()` — several screens still render their own inline banners.
