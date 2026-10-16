# Agent instructions — Celesnity Web

Next.js 16 + React 19 data-engineering workspace on Clean Architecture with
lint-enforced layer boundaries. The procedures live in `skills/`; read the
matching `SKILL.md` before editing code.

## Skill routing

| Trigger                                                                                | Read and follow                               |
| -------------------------------------------------------------------------------------- | --------------------------------------------- |
| `$orient`, orientation, "explain the codebase", first task in this repo                | `skills/codebase-orientation/SKILL.md`        |
| `$arch`, architecture, layers, boundaries, "which layer", boundary lint error          | `skills/clean-architecture/SKILL.md`          |
| `$feature`, new feature, new operation, new screen                                     | `skills/feature-development/SKILL.md`         |
| `$api`, Core API, OpenAPI, `api:generate`, DTO, repository, SSE                        | `skills/api-integration/SKILL.md`             |
| `$di`, dependency injection, ioctopus, container token                                 | `skills/dependency-injection/SKILL.md`        |
| `$component`, component, Tailwind, styling, CSS, layout looks wrong, `app/_components` | `skills/react-component-development/SKILL.md` |
| `$route`, page, route, layout, metadata, App Router                                    | `skills/routing-and-pages/SKILL.md`           |
| `$state`, state management, Zustand, store, global state                               | `skills/state-management/SKILL.md`            |
| `$i18n`, translations, locale, Vietnamese, hardcoded UI string                         | `skills/internationalization/SKILL.md`        |
| `$test`, tests, Vitest, coverage                                                       | `skills/testing-react-web/SKILL.md`           |
| `$debug`, bug, failing test, hydration error, race, leak                               | `skills/debugging-react-web/SKILL.md`         |
| `$refactor`, refactoring, renaming, moving files                                       | `skills/safe-refactoring/SKILL.md`            |
| `$review`, code review, PR review, "check my changes"                                  | `skills/code-review/SKILL.md`                 |
| `$ship`, commit, branch, PR, release                                                   | `skills/git-delivery/SKILL.md`                |
| `$a11y`, accessibility, keyboard, screen reader, contrast, ARIA                        | `skills/ui-accessibility/SKILL.md`            |

If several apply, read all of them; architecture rules win over convenience.

- When the user mentions `$changelog`, a changelog, release notes, the user
  guide, handover documentation, or when you have just finished any change a
  user can see or feel, read and follow `skills/changelog-and-user-guide/SKILL.md`.

## Non-negotiables

1. **Dependency direction** (lint-enforced by `eslint-plugin-boundaries`):
   `app → di/controllers/presenters/entities`,
   `controllers → use-cases/presenters/entities`,
   `use-cases → ports/entities`, `infrastructure → ports/entities`,
   `entities → entities`.
2. **React never calls the API.** UI calls controllers resolved through DI.
3. **Quality gate before claiming done:** `npm test`, `npm run typecheck`,
   `npm run lint`, `npm run format:check`, `npm run build`, and
   `npm run test:visual` for anything that can move pixels.
4. **Node >= 22.** TypeScript strict; no `any`, no non-null assertions.
   Styling is Tailwind v4 only — no CSS Modules, no new global classes, and
   mobile-first `min-[...]` breakpoints.
5. Never commit or push unless the user asks.
6. **A user-visible change is not done until it is recorded.** In the same
   commit or PR, add one entry to `data/changelogs/<YYYY-MM>.json` (both `vi`
   and `en`, written for the user) and update the module's page in
   `docs/user-guide/vi/` **and** `docs/user-guide/en/`. Credit the entry to
   the developer you are working for, resolved from `git config user.email`
   through `data/changelogs/authors.json`, never to an AI assistant. Follow
   `skills/changelog-and-user-guide/SKILL.md`;
   `tests/unit/app/internal-routes.test.ts` validates both. Refactors, tests,
   tooling and internal renames are exempt.
