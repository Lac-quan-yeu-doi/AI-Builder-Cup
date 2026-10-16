---
name: safe-refactoring
description: Use when moving or renaming files, extracting or promoting components, splitting a large file, or changing structure without changing behavior
---

# Safe Refactoring

## Overview

A refactor changes structure and nothing else. The test suite must be green
before and after, with the same assertions — if you had to edit test
expectations, it was a behavior change, so say so explicitly.

## Procedure

1. **Green baseline:** `npm test`. Never start from red.
2. **Small commit-sized steps.** Move one folder or extract one component at a
   time. Structural moves and behavior edits never share a step.
3. **Move with git so history survives:**

   ```bash
   git mv app/_components/<feature> "app/(workspace)/<page>/_components"
   ```

4. **Update every reference.** Search before you assume:

   ```bash
   grep -rn "old-path\|OldName" --include="*.ts" --include="*.tsx" app di src tests
   ```

   Import paths are alias-based (`@/app/...`, `@/src/...`); tests also reference
   paths as strings inside `vi.mock(...)` and inside structural tests
   (`tests/unit/app/frameworks-layer.test.ts`,
   `tests/unit/tooling/*.test.ts`) — a plain rename tool will miss those.

5. **Re-run the gate:** `npm test && npm run typecheck && npm run lint && npm run format:check && npm run build`
6. **Report** what moved, what did not, and anything left intentionally
   incomplete.

## Common refactors here

| Goal                             | Move                                                                        |
| -------------------------------- | --------------------------------------------------------------------------- |
| Component now used by two routes | route `_components/` → `app/_components/ui/` (visual) or `shared/` (helper) |
| Component only used by one route | `app/_components/` → `app/(workspace)/<page>/_components/`                  |
| Business rule found in React     | component → use case (+ port if it needs I/O)                               |
| Formatting found in a use case   | use case → presenter or the page's `*-format.ts`                            |
| Duplicate logic in two use cases | private pure helper in the same feature folder — never a use-case call      |
| DTO shape leaking inward         | mapping into `src/infrastructure/api/dto-mapper.ts`                         |

## Rules

- Structure changes never relax the boundary lint. If the move needs a rule
  disabled, the destination is wrong.
- Do not "tidy while passing through": no drive-by renames, reformatting, or
  Tailwind rewrites of untouched screens. They hide the real diff.
- Keep public names stable unless renaming is the point of the task; if you
  rename, update `di/types.ts` tokens and their tests together.
- Deleting a file: prove nothing imports it (`grep`), then delete it and its test.
- Empty folders do not survive git. A structural convention needs at least one
  real file plus a structural test.

## Verify

```bash
npm test          # same assertions as before, still green
npm run lint      # boundaries intact
npm run build     # route table unchanged unless routes were the point
git status        # only intended paths moved
```
