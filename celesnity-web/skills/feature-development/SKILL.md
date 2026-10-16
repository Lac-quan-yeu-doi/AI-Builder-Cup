---
name: feature-development
description: Use when adding a new operation, screen, or capability to celesnity-web, before writing any code for it
---

# Feature Development

## Overview

Build inside out: domain → port → use case → presenter/controller →
infrastructure → DI → UI. Each step has a test. If you start at the React
component you will end up with business logic in the wrong layer and a rejected
lint run.

## Checklist (create one todo per step)

1. **Name the operation.** One verb, one outcome: `archive-connection`,
   `preview-table`. If it needs "and", it is probably two operations.
2. **Domain vocabulary.** Add or extend a model in `src/entities/models/`, and
   errors in `src/entities/errors/application-errors.ts`. Only stable domain
   concepts — response-only fields belong to DTOs, render-only fields to
   ViewModels.
3. **Port.** Add the capability to the interface in
   `src/application/repositories/<x>.repository.interface.ts` (or
   `services/`). Signatures use Entity/Application types, never DTOs or
   `Response`.
4. **Use case.** New file
   `src/application/use-cases/<feature>/<operation>.use-case.ts`. Owns business
   validation, normalization, ordering. Factory style:
   `export const createXUseCase = (deps) => async (input) => …`. Write the test
   first — fake the port.
5. **Presenter + controller.** Extend the presenter if the UI needs new fields
   (return a fresh immutable ViewModel). Add
   `src/interface-adapters/controllers/<feature>/<operation>.controller.ts`; put
   boundary input schemas in that folder's `<feature>.schemas.ts` (Zod). One
   use-case call, presenter output.
6. **Infrastructure.** Implement the port method in
   `src/infrastructure/repositories/core-api-<x>.repository.ts`: correct method
   and path, encoded segments, request DTO mapping, response mapping, error
   translation. See `skills/api-integration/SKILL.md`.
7. **DI.** Add the token and return type to `di/types.ts`, bind repository, use
   case, and controller in `di/modules/<feature>.module.ts`. See
   `skills/dependency-injection/SKILL.md`.
8. **UI.** Feature root in `app/(workspace)/<page>/_components/<x>-feature.tsx`
   resolves controllers via `getInjection` and passes a frozen controller object
   to the screen. Page renders the feature root only. New shared primitive?
   `app/_components/ui/`. New page-only piece? that page's `_components/`.
9. **Strings.** Every user-visible string goes through the dictionaries — see
   `skills/internationalization/SKILL.md`.
10. **Tests at every boundary** — see `skills/testing-react-web/SKILL.md`:
    entity rule, use case (input/output/call order), repository (path, method,
    body, mapping, error translation), controller (validation, one call,
    ViewModel), DI token, UI state/lifecycle when there is a race or timer.
11. **Quality gate.** `npm test && npm run typecheck && npm run lint && npm run format:check && npm run build`

## Vertical slice to copy

Connections is the cleanest end-to-end example:

```text
src/entities/models/connection.ts
src/application/repositories/connection.repository.interface.ts
src/application/use-cases/connections/archive-connection.use-case.ts
src/interface-adapters/controllers/connections/
src/interface-adapters/presenters/connection.presenter.ts
src/infrastructure/repositories/core-api-connection.repository.ts
di/modules/connections.module.ts
app/(workspace)/connections/_components/connection-registry-feature.tsx
```

## Common mistakes

- Starting from the screen and "wiring it up later" — the layer you skipped ends
  up inside React.
- A controller that calls two use cases. Split the controller or move the
  orchestration into one use case.
- Monitoring (SSE + polling fallback + final snapshot) written inside a
  component. That orchestration belongs in an Application monitor; React only
  subscribes and cleans up.
- Adding a DI token without a test that resolves it.
