# Celesnity Web — agent instructions

Next.js 16 + React 19 data-engineering workspace built on Clean Architecture with
enforced dependency boundaries. Skills in `skills/` hold the working procedures.
Read the matching `SKILL.md` **before** editing code — do not reconstruct a
convention from memory.

## Skill routing

- When the user mentions `$orient`, orientation, "where do I start", "explain the
  codebase", or you are touching this repo for the first time in a session, read
  and follow `skills/codebase-orientation/SKILL.md`.
- When the user mentions `$arch`, architecture, layers, boundaries, "which layer
  does this belong in", entities, use cases, presenters, or a
  `boundaries/dependencies` lint error, read and follow
  `skills/clean-architecture/SKILL.md`.
- When the user mentions `$feature`, a new feature, a new operation, a new
  endpoint-backed screen, or "add X to the workspace", read and follow
  `skills/feature-development/SKILL.md`.
- When the user mentions `$api`, the Core API, OpenAPI, `npm run api:generate`,
  DTO mapping, repositories, SSE, or HTTP error translation, read and follow
  `skills/api-integration/SKILL.md`.
- When the user mentions `$di`, dependency injection, ioctopus, a container
  token, or wiring a controller, read and follow
  `skills/dependency-injection/SKILL.md`.
- When the user mentions `$component`, a component, Tailwind, styling, CSS, a
  layout that looks wrong, shared vs page-specific components, or
  `app/_components`, read and follow
  `skills/react-component-development/SKILL.md`.
- When the user mentions `$route`, a page, a route, a layout, metadata, the App
  Router, or a route group, read and follow `skills/routing-and-pages/SKILL.md`.
- When the user mentions `$state`, state management, Zustand, a store, global
  state, or "share state between components", read and follow
  `skills/state-management/SKILL.md`.
- When the user mentions `$i18n`, i18n, internationalization, translations,
  Vietnamese, locale, or a hardcoded UI string, read and follow
  `skills/internationalization/SKILL.md`.
- When the user mentions `$test`, tests, Vitest, coverage, or "write a test for
  this", read and follow `skills/testing-react-web/SKILL.md`.
- When the user mentions `$debug`, a bug, a failing test, a hydration error, a
  race, a leak, or unexpected UI behavior, read and follow
  `skills/debugging-react-web/SKILL.md`.
- When the user mentions `$refactor`, refactoring, renaming, moving files, or
  "clean this up", read and follow `skills/safe-refactoring/SKILL.md`.
- When the user mentions `$review`, a code review, a PR review, or "check my
  changes", read and follow `skills/code-review/SKILL.md`.
- When the user mentions `$ship`, committing, a branch, a PR, or a release, read
  and follow `skills/git-delivery/SKILL.md`.
- When the user mentions `$a11y`, accessibility, a screen reader, keyboard
  navigation, contrast, or ARIA, read and follow
  `skills/ui-accessibility/SKILL.md`.

- When the user mentions `$changelog`, a changelog, release notes, the user
  guide, handover documentation, or when you have just finished any change a
  user can see or feel, read and follow `skills/changelog-and-user-guide/SKILL.md`.

If several apply, read all of them; architecture rules win over convenience.

## Non-negotiables

1. **Dependency direction.** `app → di/controllers/presenters/entities`,
   `controllers → use-cases/presenters/entities`, `use-cases → ports/entities`,
   `infrastructure → ports/entities`, `entities → entities`. Enforced by
   `eslint-plugin-boundaries`, not by convention.
2. **React never calls the API.** UI talks to controllers resolved through DI.
3. **Quality gate before claiming done:** `npm test`, `npm run typecheck`,
   `npm run lint`, `npm run format:check`, `npm run build`, and
   `npm run test:visual` for anything that can move pixels.
4. **Node >= 22.** TypeScript strict; no `any`, no non-null assertions.
5. **Shared components before new markup.** `app/_components/ui/` owns every
   button, input, select, tab bar, table, dialog and empty state. It holds the
   shadcn/ui library vendored from `minder-design-system`, plus the workspace
   compositions built on it. A screen that hand-rolls a control is a bug.
   `radix-ui`, `cva`, `clsx`, `tailwind-merge` and `cmdk` are imported **only**
   by that folder — never by a screen; a test enforces this.
6. **The design system styles components, Tailwind lays out pages.** Component
   appearance belongs in the vendored component and the token block in
   `app/globals.css`, never in a class string on a screen. Tailwind is for grid,
   flex, gap and mobile-first `min-[...]` breakpoints (a `max-[...]` variant
   loses to the base utility). No CSS Modules and no new global classes.
   Editing a vendored file is allowed but must carry a `Celesnity addition:`
   comment — it is a merge conflict the next time the library is re-vendored.
7. **One palette: the ChatGPT skin, from `celesnity-product-design`.** OpenAI's
   grey ramp, radius scale and elevation, with Minder blue as the accent. The
   CTA is near-black — blue carries links, focus and selection only. No inline
   hex in a screen: a one-off tint goes through an alpha of an existing token
   (`bg-destructive/10`). `destructive` plus the three `status-*` scales are the
   status colours; nothing borrows a raw Tailwind scale. Charts read
   `--mchart-*` / `--mseq-*` / `--mstatus-*`; elevation reads
   `shadow-hairline` / `shadow-100..400`. Type, radius and breakpoints are scales
   too: use a step (`text-body-sm`, `rounded-md`, `md:`), never a hand-written
   `text-[13px]` or `min-[761px]:`. Weight stops at 600. A lint rule enforces all
   of this — it is not a convention. Change the design in the token block in `app/globals.css`,
   never in a component.
8. Never commit or push unless the user asks.
9. **A user-visible change is not done until it is recorded.** Anything a
   person can see or feel (new or moved control, changed flow, fixed bug,
   changed assistant behaviour, changed limit or permission) gets, in the same
   commit or PR: one entry in `data/changelogs/<YYYY-MM>.json` (both `vi` and
   `en`, written for the user) and an update to the module's page in
   `docs/user-guide/vi/` **and** `docs/user-guide/en/`. Credit the entry to
   the developer you are working for, resolved from `git config user.email`
   through `data/changelogs/authors.json`, never to an AI assistant. Follow
   `skills/changelog-and-user-guide/SKILL.md`;
   `tests/unit/app/internal-routes.test.ts` validates both. Refactors, tests,
   tooling and internal renames are exempt.
