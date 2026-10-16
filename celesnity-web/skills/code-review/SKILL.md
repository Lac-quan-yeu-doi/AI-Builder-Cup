---
name: code-review
description: Use when reviewing a diff, a branch, or a pull request in celesnity-web, or when asked to check changes before they are shipped
---

# Code Review

## Overview

Review in one direction: does each change sit in the layer that owns it, and is
the contract it touches still proven by a test? Style is already enforced by
Prettier and ESLint — spend the review on placement, contracts, and lifecycle.

## Procedure

1. Read the diff scope: `git status && git diff --stat && git diff`.
2. Run the gate yourself; do not trust the description:

   ```bash
   npm test && npm run typecheck && npm run lint && npm run format:check && npm run build
   ```

3. Walk the vertical slice the change touches (page → feature root → controller →
   use case → port → repository) and check each item below.
4. Report findings ordered by severity, each with file, line, and the concrete
   failure it causes. Say plainly when something is fine.

## Checklist

**Architecture**

- [ ] Business rules in entities/use cases, not in React or repositories
- [ ] Controller validates input and calls exactly one use case
- [ ] No use case calling another use case
- [ ] Presenter returns a fresh immutable ViewModel; no credentials, DTOs, or
      shared references
- [ ] Infrastructure errors translated before crossing inward
- [ ] DI token, return type, and dependency order correct; only controllers
      resolved in `app/`
- [ ] No boundary rule disabled anywhere in the diff

**UI**

- [ ] App-wide vs route-local component placement is right; no cross-route
      `_components` import
- [ ] `'use client'` present where required and absent where not
- [ ] Loading, empty, error, and partial-success states handled
- [ ] Timers, subscriptions, and monitors released on unmount and on re-selection
- [ ] Every user-visible string is a dictionary key present in `en` **and** `vi`
- [ ] Tailwind classes are static and use theme tokens
- [ ] Keyboard reachable, labelled controls, no color-only status

**Tests**

- [ ] New behavior tested at the layer that owns it
- [ ] Bug fix has a test that fails without the fix
- [ ] No assertion was weakened, skipped, or deleted to make the suite pass
- [ ] Structural tests updated when routes or folders changed

**Hygiene**

- [ ] Diff contains only what the task needs — no drive-by reformatting
- [ ] No `console.log`, `.only`, `.skip`, `any`, `@ts-ignore`, or dead code
- [ ] Generated files (`schema.d.ts`) not hand-edited
- [ ] Secrets and connection credentials absent from code, tests, and logs

## Severity

| Level      | Examples                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Blocking   | Boundary violation, credential exposure, missing cleanup causing leaks, weakened test, failing gate     |
| Should fix | Wrong layer for a helper, missing error/empty state, untranslated string, missing test for new behavior |
| Nit        | Naming, ordering, comment wording — mark as optional                                                    |

Do not approve work whose gate you have not seen pass.
