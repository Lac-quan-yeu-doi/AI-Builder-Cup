---
name: debugging-react-web
description: Use when a test fails, the UI misbehaves, a hydration error appears, data goes stale, a monitor leaks, or a boundary/type error is not obvious — before proposing a fix
---

# Debugging

## Overview

Find the layer that owns the behavior, reproduce it in a test at that layer, then
fix it. No speculative edits: if you cannot make it fail on demand, you cannot
know you fixed it.

## Procedure

1. **Reproduce.** `npm test` for the baseline, then narrow:
   `npx vitest run tests/unit/<layer> -t "part of the name"`.
2. **Locate the owner** using the symptom table below. Read that file plus its
   test before editing.
3. **Write the failing test** at that layer. It must fail for the reported reason.
4. **Fix the cause**, not the symptom. Adding a guard in React for a use-case bug
   moves the bug.
5. **Re-run the gate:** `npm test && npm run typecheck && npm run lint`.
6. **Check the class of bug**: if it was an ordering, cleanup, or stale-response
   bug, look for the same pattern in the other features (executions and queries
   share monitor shapes).

## Symptom → owner

| Symptom                                                       | Look at                                                                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Hydration mismatch / "text content did not match"             | Persisted store hydrating on first render (`skipHydration` + effect rehydrate), or `Date`/random in render |
| Duplicate polling, events after close, missing final snapshot | Monitor use case in `src/application/use-cases/*/monitor-*.use-case.ts` and its `close()`                  |
| Stale data after a fast selection change                      | `app/_components/shared/request-token.ts` usage in the screen                                              |
| Wrong or missing error text                                   | `translate-core-api-error.ts` (classification) then `app/_components/shared/error-message.ts` (display)    |
| 404/409 shown as a generic failure                            | Error translated too late or re-wrapped in the repository                                                  |
| Value renders as `undefined`                                  | Presenter did not map the field, or the ViewModel type widened without mapping                             |
| UI mutates data seen elsewhere                                | Presenter returned a shared reference instead of a deep copy                                               |
| `boundaries/dependencies` lint error                          | Wrong layer for that code — `skills/clean-architecture/SKILL.md`                                           |
| DI "no binding" or `never` type at bind                       | `skills/dependency-injection/SKILL.md`                                                                     |
| Tailwind class has no effect                                  | Class built from a runtime string, or the token is missing from `@theme` in `app/globals.css`              |
| A new test file never runs                                    | Named `.tsx`, or outside `tests/unit/**/*.test.ts`                                                         |
| React test throws on `useState`/`window`                      | Missing `// @vitest-environment jsdom` or missing `'use client'`                                           |

## Tools

- `npx vitest run <file> -t "<name>"` — single test.
- `npm run typecheck` — often names the real cause of a confusing runtime error.
- Client telemetry: `src/infrastructure/observability/client-telemetry.ts` records
  Core API events; `app/api/client-logs/route.ts` receives them. Use these
  instead of adding `console.log` to components.
- Reading the Core API contract: `src/infrastructure/api/generated/schema.d.ts`.

## Rules

- One hypothesis at a time. Revert a failed attempt before trying the next.
- Never "fix" a test by loosening its assertion.
- Never leave debug logging, `.only`, or `.skip` in the tree.
- If the root cause is in the Core API, say so instead of compensating in the UI —
  a workaround in the web app hides a contract bug.
