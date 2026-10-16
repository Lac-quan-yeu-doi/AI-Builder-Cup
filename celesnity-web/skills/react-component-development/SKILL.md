---
name: react-component-development
description: Use when creating or changing any React component in celesnity-web, deciding between an app-wide and a page-local component, or writing Tailwind classes and CSS Modules
---

# React Component Development

## Overview

`app/` is the outermost layer: rendering, interaction state, and cleanup. Two
questions decide everything — **who owns this component** and **where does its
data come from**.

## Where the file goes

| Reuse                                        | Location                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Visual primitive used by more than one page  | `app/_components/ui/` (Button, Card, Badge, `utils.ts`)                                    |
| Non-visual helper used by more than one page | `app/_components/shared/` (`error-message.ts`, `request-token.ts`, `monitor-lifecycle.ts`) |
| App shell / navigation / global chrome       | `app/_components/layout/`                                                                  |
| Anything only one route uses                 | `app/(workspace)/<page>/_components/`                                                      |

Rules:

- A page's `_components/` folder is private to that route. Importing
  `@/app/(workspace)/sql/_components/...` from another route fails
  `tests/unit/app/frameworks-layer.test.ts`. Promote the file to
  `app/_components/ui|shared|layout/` instead of reaching across routes.
- Do not create `index.ts` barrels; import the file directly.
- Underscore folders (`_components`, `_i18n`, `_stores`) are not routes.

## Component roles inside a page

```text
page.tsx                      Server component: metadata + renders the feature root
_components/x-feature.tsx     'use client'; resolves controllers via getInjection, freezes them
_components/x-screen.tsx      Owns UI state, loading/empty/error, calls controllers
_components/<piece>.tsx       Presentational leaves: props in, JSX out
_components/<x>-format.ts     Pure formatting helpers
```

Leaves must not resolve DI tokens, call controllers, or own transport lifecycle.

## Client vs server

- Default to a server component. Add `'use client'` only when the file uses
  state, effects, refs, browser APIs, event handlers, DI resolution, or Zustand.
- `'use client'` must be the first line of the file.
- Server components must not import `useTranslation`, a Zustand store, or a
  feature root's client-only helpers.

## Styling

**The design system styles the components; Tailwind lays out the page.** A
component's appearance comes from the vendored shadcn/ui component in
`app/_components/ui/` and the tokens in `app/globals.css`, never from a class
string in a screen. Tailwind utilities are for layout — grid, flex, gap,
breakpoints — and for the handful of composed surfaces the tokens cannot
express. There are no CSS Modules and no component classes.

- Use the semantic tokens: `bg-background`, `bg-card`, `bg-muted`, `bg-accent`,
  `bg-primary`, `bg-secondary`, `text-foreground`, `text-muted-foreground`,
  `text-primary`, `border-border`, `border-input`, `ring-ring`, plus
  `bg-destructive` for failure and `editor-chrome` / `editor-canvas` for the two
  Monaco surfaces.
- **No inline hex, ever.** The palette is near-neutral by construction, so a
  stray hex does not merely drift — it introduces a colour the skin does not
  have. A one-off tint goes through an alpha of an existing token
  (`bg-destructive/10`), not a new value.
- Status colour is `destructive` plus the three `status-*` scales
  (`bg-status-warning-light`, `text-status-warning-dark`, and so on): `-light`
  is a surface, the base is a border or a dot, `-dark` is text on the light
  surface. Prefer the `Badge` variants (`success`, `warning`, `danger`, `info`)
  over writing those classes by hand. Nothing borrows a raw Tailwind scale.
- `primary` is near-black, not blue. Blue reaches the screen through `ring-ring`
  for focus, `text-primary` for a link, and `bg-accent` / `bg-sidebar-selected`
  for hover and selection — which is the whole of what carries brand here. A
  screen that wants a blue button wants `primary` and is about to be wrong.
- Compose conditional classes with `cn()` from `app/_components/ui/utils.ts`.
  It runs `clsx` through `tailwind-merge`, so a caller's `p-5` beats a
  component's own `py-6` instead of both landing in the class list. Never build
  class names from runtime values (`text-${color}-500` does not survive the
  build).
- Do not add a `.module.css` or a global class. If you reach for one, the
  utility list is telling you to extract a component into `app/_components/ui/`.

### Two rules that break pixels if you ignore them

1. **Mobile-first breakpoints only.** Write the narrow value as the base and add
   `min-[761px]:` / `min-[901px]:` / `min-[1081px]:` for wider screens. A
   `max-[...]` variant loses to the unprefixed utility for the same property, so
   `px-12 max-[760px]:px-6` silently keeps 48px at 760px.
2. **One property, one owner.** Two utilities for the same declaration resolve in
   whichever order Tailwind emitted them, not the order you wrote — `flex` plus
   `max-*:hidden` is the classic trap. Set a property in one place.

Element rules in `@layer base` (`a { color: inherit }`, `button { color: inherit }`)
are layered on purpose: unlayered element selectors beat **every** Tailwind
utility, which silently strips `text-*`, `font-*`, and `text-<color>` from every
button and link in the app.

### Shared primitives (`app/_components/ui/`)

**Never hand-roll a control that already lives here.** A screen that writes its
own `<input>`, `<button>`, tab bar or empty state is a bug, not a shortcut: that
is how six copies of the same eyebrow string and four subtly different empty
states got into the app.

The folder holds two kinds of file, and the difference matters when you change
one:

**Vendored** — copied verbatim from `minder-design-system/design-system/components`
(shadcn/ui `new-york-v4`) and re-pointed at `@/app/_components/ui/*`. Editing one
is allowed, but every edit is a merge conflict the next time the library is
re-vendored, so each carries a `Celesnity addition:` comment saying what changed
and why. Today that is four: `asChild` on `Card` and on `PaginationLink`, the
workspace status tones on `Badge`, and `type="button"` by default on `Button`.

`accordion` · `alert` · `alert-dialog` · `aspect-ratio` · `avatar` · `badge` ·
`breadcrumb` · `button` · `button-group` · `card` · `checkbox` · `collapsible` ·
`command` · `context-menu` · `dialog` · `dropdown-menu` · `empty` · `field` ·
`hover-card` · `input` · `input-group` · `item` · `kbd` · `label` · `menubar` ·
`native-select` · `navigation-menu` · `pagination` · `popover` · `progress` ·
`radio-group` · `resizable` · `scroll-area` · `select` · `separator` · `sheet` ·
`skeleton` · `slider` · `sonner` · `spinner` · `switch` · `table` · `tabs` ·
`textarea` · `toggle` · `toggle-group` · `tooltip` · `utils` (`cn`)

**Workspace compositions** — built on the primitives above, for patterns
shadcn/ui does not ship:

| File                    | Exports                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fields.tsx`            | `TextField`, `PasswordField`, `TextareaField`, `SelectField`, `FieldBlock` — a labelled control with the `id`/`htmlFor`/`aria-describedby` wiring done once, plus `hint`, `error` and `dirty` |
| `combobox.tsx`          | `Combobox`, `MultiCombobox` — type-to-filter pickers for lists a native `select` handles badly                                                                                                |
| `radio-group-field.tsx` | `RadioGroupField` — a labelled radio group from a data array                                                                                                                                  |
| `search-field.tsx`      | `SearchField` — magnifier, `type="search"`, clear control                                                                                                                                     |
| `password-input.tsx`    | `PasswordInput` — the reveal toggle shadcn/ui has no primitive for                                                                                                                            |
| `data-table.tsx`        | `DataTable` — sticky header, columns described as data                                                                                                                                        |
| `pager.tsx`             | `Pager` — page picker whose controls are real buttons, not anchors                                                                                                                            |
| `empty-state.tsx`       | `EmptyState` (fills a panel), `EmptyBlock` (dashed, sits inside one)                                                                                                                          |
| `page-alert.tsx`        | `PageAlert` (tone + dismiss), `InlineError`                                                                                                                                                   |

Icons come from `lucide-react`, imported directly by the screen that needs one:
icons are content, not chrome.

Extend the primitive when the design genuinely differs rather than
re-implementing it in a screen.

### The engine sits under the primitives, never in a screen

`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge` and `cmdk` are
imported **only** by files in `app/_components/ui/`. A screen importing Radix
directly is the same mistake as a screen calling the API directly, and
`tests/unit/app/frameworks-layer.test.ts` fails the build if one does.

**The tokens are the design system.** `app/globals.css` carries one palette: the
ChatGPT skin from `celesnity-product-design`'s `.shadcn-scope.chatgpt-brand`
block, which lifts its grey ramp, radius scale, elevation geometry and 4px
spacing base from `@openai/apps-sdk-ui@0.2.2`. Raw values live on `:root` (plus
`.dark`) and are mapped to Tailwind utilities through `@theme inline`.

There is no second, brand-specific layer. `primary` is near-black, `accent` is
the hover surface with 8% of the accent mixed in, `muted` is the quiet grey, and
`destructive` plus `status-*` are the status colours.

**Charts read the palette.** `--mchart-1..8` is the categorical ramp,
`--mseq-0..5` the sequential one (with `--mseq-ink-*` for the ink legible on each
step), `--mdiv-*` diverging, and `--mstatus-*` the three reserved status hues.
Assign categorical slots **1..N in order and never cycle** — the slot order _is_
the separation mechanism, and a ninth series folds into "Other" (`--mchart-8`).
These only work because charts render with Recharts, which draws DOM SVG and can
resolve a custom property; the Vega renderer they replaced drew to `<canvas>` and
could never read one.

Note the ramp itself has **not** been through the CVD/contrast validator — those
are OpenAI's hues ordered by eye, and the design system says so where it defines
them. The validated ramp is the Minder one in `minder-design-system`. Re-run the
validator before treating the categorical scale as an accessibility guarantee.

`--elevation-hairline` / `--elevation-100..400` are the shadow scale, exposed as
`shadow-hairline` / `shadow-100..400`. The hairline ring is the load-bearing one:
it is what lets a white card sit on a white page. Never hand-write a
`shadow-[0_8px_26px_...]`.

`--notebook-data` / `-filter` / `-summarize` (each with `-soft` and `-on`) tint
the three visual-query notebook steps. They deliberately do **not** reuse
`status-*`: a step is identity, not severity.

Dark is re-authored, not flipped: surfaces get _lighter_ as they rise — `#0d0d0d`
ground, `#181818` well, `#212121` card — so a raised surface cannot be made by
darkening one.

Five tokens sit outside the palette on purpose. `editor-canvas` is Monaco's own
`vs-dark` background — it has to match the editor's theme, not ours;
`editor-chrome` is the skin's dark `card` for the header above it;
`editor-ink` / `editor-ink-muted` are the ink on those two surfaces, for the same
reason; and `sidebar-selected` is a Celesnity addition, since the skin has no
"the row you are on" token.

**Type, radius and breakpoints are scales too — colour is one family of four.**

- **Type:** `text-display-1/2`, `text-heading-1/2/3`, `text-title`, `text-body-lg/md/sm`,
  `text-label`, `text-caption`, `text-micro`. Each step carries its **own line-height,
  weight and tracking** — that is the difference from a hand-written `text-[13px]`, which
  sets font-size only and leaves line-height to inheritance. Never hand-write a size.
- **Weight stops at 600.** The skin has no bold display weight; `font-semibold` is the top.
- **Radius:** `rounded-2xs/xs/sm/md/lg/xl/2xl/3xl/4xl/full` — 2/4/6/8/10/12/16/20/24/pill.
  `md` is the default button and input; `2xl` is a card; `4xl` is the composer.
- **Breakpoints:** `xs` 380, `sm` **576** (not Tailwind's 640), `md` 768, `lg` 1024,
  `xl` 1280, `2xl` 1536. Mobile-first only.
- **Spacing** needs no token block: OpenAI configures `--spacing: 0.25rem`, which is already
  Tailwind's 4px base.

**The `tailwind-merge` trap — read this before adding any custom utility.** `text-*` is
ambiguous in Tailwind: it is both font-size and colour. `tailwind-merge` tells them apart
from a built-in list of scale names, and a custom step like `text-body-sm` is not on it —
so it is classified as a _colour_, and any `text-foreground` later in the same `cn()` call
is treated as a conflict and **silently removes the size**. No error, no warning; the
element just inherits 16px. `app/_components/ui/utils.ts` registers the type and radius
scales with `extendTailwindMerge` for exactly this reason. Any new custom `text-*` or
`rounded-*` value must be added there or it will not survive `cn()`.

**This is enforced, not trusted.** `eslint.config.mjs` rejects a literal hex, a raw
Tailwind colour scale, a hand-written `text-[...]` or `rounded-[...]`, and any weight above
600 — anywhere in `app/` or `src/`, exempting `app/_components/ui/` (whose vendored source
legitimately carries `text-white` on a destructive fill). The palette drifted back to a
previous skin once because nothing stopped it and no test noticed.

There is no webfont. `--font-sans` is the platform system stack, which is what
the skin's own type is; see the note in `app/layout.tsx`.

Change the design in the token block, not in a component.

### Two behaviours that must stay overridden

- `Button` defaults to `type="button"`. A bare `<button>` inside a `<form>`
  submits it, and the workspace forms carry Cancel and Test-connection controls
  beside the submit.
- A busy action sets `aria-busy` and renders `<Spinner />` beside its label.
  `disabled` alone announces "unavailable" rather than "working".

### Dialogs make the page behind them inert

Radix's `DialogContent` marks every sibling `aria-hidden`, so an error raised by
a dialog's own action must be rendered **inside** the dialog. The list screens
gate their page-level `PageAlert` on the dialog being closed and render an
`InlineError` in the dialog footer instead.

## Props and types

- Props interfaces are `readonly` and named `<Component>Props`.
- Accept ViewModels from presenters — never Entities or DTOs.
- Prefer explicit union props (`tone: 'primary' | 'danger'`) over booleans that
  multiply.
- No `any`, no non-null assertion, no `dangerouslySetInnerHTML`.

## Checklist

- [ ] Right folder (app-wide vs page-local)
- [ ] `'use client'` only if genuinely needed
- [ ] Strings come from the dictionaries (`skills/internationalization/SKILL.md`)
- [ ] Loading, empty, and error states handled
- [ ] Timers/subscriptions released in `useEffect` cleanup
- [ ] Accessible (`skills/ui-accessibility/SKILL.md`)
- [ ] Test added (`skills/testing-react-web/SKILL.md`)
- [ ] `npm run lint && npm run typecheck && npm test`
- [ ] `npm run test:visual` — screenshots unchanged, or updated deliberately
