---
name: codebase-orientation
description: Use when starting the first task in celesnity-web, when asked where code lives or how the app is wired, or before proposing any change whose blast radius is unknown
---

# Codebase Orientation

## Overview

`celesnity-web` is the Next.js front end of the Celesnity data platform. It talks
to one backend (`celesnity-core`, the "Core API") and is organized by Clean
Architecture layers, not by feature folders under `src/`.

Read this before editing so you place code in the right layer the first time.

## Map

```text
app/                     Frameworks & drivers: App Router, React, CSS, Tailwind
  _components/ui/        shadcn/ui, vendored, plus the workspace compositions on it
  _components/shared/    App-wide non-visual helpers (error-message, request-token, monitor-lifecycle)
  _components/layout/    App shell: workspace-shell, navigation, language-switcher
  _i18n/                 Dictionaries (en/vi), translate(), useTranslation()
  _stores/               Zustand stores (client interaction state only)
  (workspace)/<page>/    Route + page-local `_components/` for that page only
  api/, health/          Route handlers
di/                      Composition root: container, tokens, per-feature modules
src/entities/            Domain models, rules, application errors
src/application/         use-cases/ + repositories/ + services/ (ports)
src/interface-adapters/  controllers/ (validate + call one use case) + presenters/ (ViewModels)
src/infrastructure/      Core API client, generated OpenAPI types, DTO mapping, SSE, scheduler, env
tests/unit/<layer>/      Tests mirror the layers
skills/                  These procedures
```

## Where behavior lives

| Question                   | Answer                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| Which endpoint is called?  | `src/infrastructure/repositories/core-api-*.repository.ts`         |
| What does an operation do? | `src/application/use-cases/<feature>/*.use-case.ts`                |
| What can the UI see?       | `src/interface-adapters/presenters/*`                              |
| How does the UI call it?   | feature root in `app/(workspace)/<page>/_components/*-feature.tsx` |
| What is bound to what?     | `di/modules/*.module.ts` and `di/types.ts`                         |
| Why is my import rejected? | `eslint.config.mjs` (`boundaries/dependencies`)                    |

## Orientation procedure

1. Read `skills/clean-architecture/clean-architecture-guide.md` sections 3, 4,
   and 7 — structure, layer duties, allowed dependencies.
2. Find the vertical slice closest to the task and read it end to end: page →
   feature root → controller → use case → port → repository.
3. Read the matching tests under `tests/unit/` — they encode the contracts you
   must not break (HTTP paths, call order, cleanup, structure).
4. Confirm the baseline is green before touching anything: `npm test`.

## Commands

```bash
npm run dev            # http://localhost:3000, Core API at http://localhost:3001/api/v1
npm test               # 300+ unit tests, ~2s
npm run test:visual    # 11 screenshot comparisons against tests/visual/__screenshots__
npm run typecheck
npm run lint           # includes architecture boundaries
npm run format:check
npm run build          # standalone output
npm run api:generate   # regenerate OpenAPI types (Core API must be running)
```

## Common mistakes

- Searching `src/` for UI code. All React lives in `app/`.
- Assuming `app/_components/<feature>/` still exists. Page-specific components
  now live in `app/(workspace)/<page>/_components/`.
- Editing `src/infrastructure/api/generated/schema.d.ts` by hand. It is
  generated; run `npm run api:generate`.
- Looking for CSS Modules or component classes. Styling is Tailwind v4 only;
  `app/globals.css` holds tokens and base rules, nothing else.
- Proposing a "quick fix" in a React component for something that is a use-case
  rule. The boundary lint will reject it and the review will too.
