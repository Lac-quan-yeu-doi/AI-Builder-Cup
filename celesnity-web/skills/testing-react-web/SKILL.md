---
name: testing-react-web
description: Use when writing or fixing tests, deciding which layer to test at, testing timers/SSE/races, or when coverage is requested
---

# Testing

## Overview

Vitest, one test tree mirroring the layers, no browser and no network. Tests are
written **before** the implementation they describe; that is how the existing
contracts (HTTP paths, call order, cleanup) got locked down.

```bash
npm test                                   # all 36 files, ~2s
npm run test:watch
npm run coverage
npx vitest run tests/unit/application       # one layer
npx vitest run tests/unit/app/internationalization.test.ts
```

## Conventions

- Files: `tests/unit/<layer>/…/*.test.ts` — **`.ts` only**. `vitest.config.mts`
  includes `tests/unit/**/*.test.ts`, and `tsconfig.json` typechecks
  `tests/**/*.ts`; a `.tsx` test is silently not run.
- React tests need `// @vitest-environment jsdom` as the first line (the default
  environment is `node`).
- Because tests are `.ts`, build elements with `createElement`; pass `children`
  through props and add a file-level
  `/* eslint-disable react/no-children-prop -- … */` (see
  `tests/unit/app/shared-ui-components.test.ts`).
- `restoreMocks: true` is already configured. Still `cleanup()` React renders and
  reset module-scoped stores in `afterEach`.

## What to test where

| Layer                            | Assert                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `entities`                       | Pure rules, status/terminal helpers, sanitization, error types                 |
| `application/use-cases`          | Input handling, output, dependency call order, monitor lifecycle (fake timers) |
| `infrastructure/repositories`    | Method, path, encoding, body, DTO→Entity mapping, error translation            |
| `interface-adapters/controllers` | Boundary validation, exactly one use-case call, ViewModel shape                |
| `interface-adapters/presenters`  | Field filtering, immutability, deep copies                                     |
| `di`                             | Token resolution + `typed-wiring.compile.ts` for compile-time misuse           |
| `app`                            | Controller wiring, loading/empty/error states, races, cleanup, i18n            |
| `tooling`                        | Alias resolution, architecture boundaries, standalone output                   |

Test the layer that owns the behavior. A use-case rule verified only through a
rendered screen is a slow test that fails for the wrong reasons.

## Patterns

**Fake the port, not the network:**

```ts
const repository: ConnectionRepository = {
  list: vi.fn().mockResolvedValue([connection]),
  ...
};
const useCase = createListConnectionsUseCase(repository);
```

**Fake transport for repositories:** assert the exact call, e.g.
`expect(transport.delete).toHaveBeenCalledWith('/connections/a%2Fb')`.

**Timers and streams:** `vi.useFakeTimers()`, advance explicitly, then assert the
monitor closed its transport and timer. Always test `close()` twice (reentrant),
selection change mid-flight, and unmount — those are the historical bug sources.

**Races:** resolve promises out of order and assert the stale response is
discarded (`app/_components/shared/request-token.ts`).

**Structure:** `tests/unit/app/frameworks-layer.test.ts` asserts the folder
contract (feature roots exist, app-wide vs route-local components, no
cross-route `_components` imports). Update it when you add a route.

## Visual regression suite (Playwright)

Styling has no meaningful unit test, so pixels are guarded by screenshots.

```bash
npm run test:visual              # build, serve on :3100, compare 11 screenshots
npm run test:visual:update       # accept new baselines (only when the change is intended)
npx playwright test --grep sql   # one screen
```

- `playwright.config.ts` builds and serves the **production** bundle (`next dev`
  adds HMR pixels and hydrates unreliably) with `NEXT_PUBLIC_CORE_API_URL=/api/v1`
  so the mock is same-origin.
- `tests/visual/core-api-mock.ts` fulfils every Core API call from
  `tests/visual/fixtures.ts`; nothing reaches the network. Add a fixture and a
  route match when you add an endpoint.
- Baselines live in `tests/visual/__screenshots__/`. Monaco regions are masked;
  the run is pinned to UTC + en-US so timestamps are stable.
- `reuseExistingServer` is off on purpose: a reused server would compare your new
  code against a stale bundle and report "no diff".
- A diff is a finding, not noise. Read
  `tests/visual/.artifacts/**/*-diff.png` before touching the baseline, and only
  run `--update-snapshots` once you can name the visual change you intended.

## Rules

- `window.localStorage` needs `NODE_OPTIONS=--no-experimental-webstorage` (set
  on the `test`/`test:watch`/`coverage` scripts in `package.json`). Node >=25
  ships its own Web Storage globals enabled by default, and jsdom detects that
  and declines to install a working `localStorage` of its own — every
  `@vitest-environment jsdom` file gets an `undefined` `window.localStorage`
  without the flag. See vitest-dev/vitest#8757.
- Never assert on implementation details a refactor should be free to change
  (internal helper names, private state).
- Never weaken a test to make a change pass. If a contract must change, change it
  deliberately and say so in the summary.
- No network, no real timers, no `EventSource` in tests — inject the port.
- A bug fix ships with a test that fails before the fix.

## Verify

```bash
npm test && npm run typecheck && npm run lint
```
