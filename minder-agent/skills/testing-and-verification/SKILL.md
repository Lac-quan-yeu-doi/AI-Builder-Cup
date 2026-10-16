---
name: testing-and-verification
description: Use when writing tests, fixing failures, selecting Vitest projects, or verifying a minder-agent change before delivery
---

# Testing and Verification

## Test placement

Test the layer that owns the behavior:

| Behavior | Test location |
| --- | --- |
| Pure policy/value | `src/tests/application` or domain-focused tests |
| Agent/runtime orchestration | `src/tests/application/agent` or `runtime` |
| Prisma/S3/MCP adapter | `src/tests/infrastructure` |
| HTTP/SSE contract | `src/tests/presentation/http` |
| Dependency direction | `src/tests/architecture` |
| Compatibility and release gates | `src/tests/compat`, `phase-*`, `release` |

Write the smallest failing regression test before changing non-trivial
behavior. Do not weaken a contract test to make an implementation pass.

## Select a check

1. Find the existing behavior test with `rg -n '<symbol-or-route>' src/tests`.
   Put a new assertion in that test unless a different layer owns the change.
2. Run that file once before editing if the current behavior is uncertain.
   For a behavior fix, write a focused assertion that fails for the reported
   case; then make it pass.
3. Use `npm test -- <test-file>` for one file or `npm run test:architecture`
   for dependency changes. `vitest.config.ts` assigns files to named projects;
   inspect it when a test is skipped or a project command surprises you.
4. Run `npm run check` and `npm run lint` for changed TypeScript. Add `build`,
   phase, or full-suite gates when the changed boundary or delivery request
   makes them useful. Run broad suites once, after focused checks are green.

Example: a run replay fix should exercise `src/tests/presentation/http/sse.test.ts`
or the route-level HTTP test and then the relevant run-manager test. A docs-only
skill edit needs skill validation and `git diff --check`, not a full runtime
suite.

## Configuration safety

- Register Nest explicitly in tests: `AppModule.register(...)` or
  `AppModule.registerCli(...)` with controlled `environment` and `factories`.
- Do not let a bare `AppModule` read a developer `.env` or connect to a local
  database.
- Prisma generation needs a `DATABASE_URL`; use a safe placeholder, never a
  real or shadow database.
- Phase-4 integration tests use only the throwaway `MINDER_TEST_DATABASE_URL`
  service.

## Verification ladder

```bash
npm test -- <focused-test-file>
npm run test:architecture
npm run check
npm run lint
npm run build
npm test
```

Available phase projects are `compat`, `phase-0`, `phase-1`, `phase-2`,
`phase-3`, `phase-4`, and `release`; use the narrowest relevant project first.
Report baseline failures separately from failures caused by the change.
Record the exact command and result; a passing unit test does not establish
that PostgreSQL recovery, container startup, or production rollout works.
