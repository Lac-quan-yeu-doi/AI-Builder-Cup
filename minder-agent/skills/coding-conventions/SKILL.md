---
name: coding-conventions
description: Use when writing or reviewing TypeScript, Nest, validation, errors, async behavior, or tests in minder-agent
---

# Coding conventions

The compiler and ESLint configuration are executable rules. Follow the closest existing vertical slice before introducing a new local pattern.

## Apply this guide

1. Read the implementation, every caller of the exported symbol, and its
   nearest test. Locate the owning layer using the table below.
2. Make the smallest change at the shared seam. Preserve public status,
   errors, event IDs, owner scope, and promise timing.
3. Add one focused check for a non-trivial branch or failure path. Run that
   check before the broader TypeScript gates.

For an optional property under `exactOptionalPropertyTypes`, construct the
object without the property when absent:

```ts
const result = {
  runId,
  ...(cursor === undefined ? {} : { cursor }),
};
```

Do not assign `cursor: undefined` unless the declared type explicitly allows
it. Use the same conditional shape when passing optional ports to a manager.

## TypeScript

- Use ESM imports with `.js` local specifiers and `import type` for type-only imports.
- Keep data contracts immutable with `readonly`; use discriminated unions for finite outcomes and states.
- With `exactOptionalPropertyTypes`, omit an optional property when it has no value. Do not assign `undefined` unless the contract explicitly permits it.
- With `noUncheckedIndexedAccess`, handle missing array and map values explicitly.
- Use `interface` for extendable ports and public object contracts; use `type` for unions, aliases, and mapped or conditional shapes.
- Keep async methods asynchronous on every outcome. Return rejected promises for async failures; do not introduce synchronous throws into an established promise contract.

## Boundaries and errors

- Validate untrusted HTTP, webhook, tool, and persistence input at its boundary before it reaches application behavior.
- Presentation translates domain/application outcomes into stable HTTP status codes and JSON error bodies. It does not access Prisma or other concrete adapters.
- Preserve existing error codes, event payloads, and response fields. Add a new explicit error code when a new client-visible failure is required.
- Authorize the owner before every owner-scoped read, mutation, replay, or stream. Do not rely on a client-supplied identifier as authorization.

## Nest and composition

- Keep decorators and controllers in presentation/modules. Keep provider construction in modules, bootstrap, or infrastructure composition.
- Inject ports or narrow application contracts. Do not import a concrete Prisma store, MCP client, or provider adapter into a controller or application use case.
- Use `@Optional()` only when the runtime deliberately supports an unavailable capability and the caller returns the established unavailable response.

For an HTTP feature, the controller validates/maps a request and calls an
application contract; `src/modules/` binds the contract to the implementation.
Follow an existing controller and module pair before adding decorators,
providers, or exception handling.

## Async runtime behavior

- Await persistence of lifecycle and terminal events before publishing them to live subscribers.
- Always close subscriptions and abort controllers on every terminal, disconnect, and error path.
- Preserve tool-call ordering and IDs. Parallel dispatch remains restricted to tools already classified as read-only.
- Persist enough state for every pause or continuation; do not leave resume-critical state in a local closure.

When changing a `Promise`-returning method, test the rejection through
`await`/`rejects` and check for accidental synchronous throws. This matters
for callers that attach rejection handling after invoking the method.

## Verification

- Add a focused regression test for non-trivial behavior changes in the layer that owns the behavior.
- Start with the relevant test or check. Avoid repeatedly running broad suites; run broader checks only when the change warrants them.
- Before claiming a change is complete, run the relevant type check and lint when they cover the changed source. Report pre-existing failures separately.

## General principles

Follow the current module, TypeScript compiler, ESLint rules, and architecture tests. Prefer explicit names and small cohesive functions over compressed logic. Reuse an existing port, mapper, parser, policy, or helper after checking its callers with `rg`.

One function performs one coherent operation. One file owns one primary responsibility, but may export related contracts and private helpers. Extract meaningful limits, retry rules, prompts, and operational settings into named constants, policies, manifests, or configuration; leave a local one-use value local. Do not add speculative abstractions.

Validate at trust boundaries and translate failures deliberately. Never swallow an error or replace it with a vague success response. Preserve public API, owner isolation, run lifecycle, and async behavior unless the task explicitly changes them.

## Repository layout

| Path | Contains | Must not contain |
| --- | --- | --- |
| `src/domain/` | Pure entities, values, policies, and runtime rules | Nest, Prisma, HTTP, filesystem, provider, or process imports |
| `src/application/` | Use cases, orchestration, ports, run/session/room behavior | Concrete infrastructure or Nest dependencies |
| `src/infrastructure/` | Prisma, MCP, model/provider, workspace, configuration, storage, and HTTP port implementations | Transport policy or duplicated domain rules |
| `src/presentation/` | CLI and HTTP/SSE validation, authentication adaptation, request mapping, and response/event formatting | Direct Prisma or provider access |
| `src/modules/`, `src/bootstrap/` | Nest modules, dependency binding, application startup, controlled test composition | Business rules |
| `src/tests/` | Tests grouped by owning layer and test project | Production-only composition assumptions |

Trace a change from boundary to application contract to adapter/store to observable response or event. `RuntimeRunManager` is the shared run coordinator; do not create another lifecycle implementation for an in-memory or transport-specific path.

## Naming and formatting

| Item | Convention | Examples |
| --- | --- | --- |
| File and directory | Lowercase kebab case | `runtime-run-manager.ts`, `safe-path.ts` |
| Role file | Established suffix | `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.repository.ts`, `*.store.ts`, `*.mapper.ts`, `*.port.ts`, `*.dto.ts` |
| Test | `<subject>.test.ts` under its owning `src/tests/<layer>/` area | `agent-loop.test.ts` |
| Class, interface, type, enum | PascalCase | `RuntimeRunManager`, `RunManager` |
| Function, method, parameter, local value | camelCase | `getAuthorizedRun`, `manifestOwner` |
| Private field | `private` or `private readonly` plus camelCase | `private readonly runtime` |
| Fixed policy/configuration constant | UPPER_SNAKE_CASE | `MAX_ITERATIONS`, `AUTONOMOUS_SYSTEM_PROMPT` |
| Environment variable and Nest token | UPPER_SNAKE_CASE | `MINDER_TEST_DATABASE_URL`, `RUN_MANAGER` |
| Boolean | `is`, `has`, `can`, `should`, or `include` prefix | `isError`, `includePlanReview` |

Avoid mutable global state. Module-level state is acceptable only when its lifetime and isolation are deliberate; runtime and request state belongs in a coordinator, store, or injected service. Application ports already using the pattern may use an `I` prefix, such as `IAgentWebhookClient`; ordinary data shapes do not.

The current code models finite states with string unions. Prefer a union over a new `enum`; if compatibility requires an enum, use a PascalCase enum name and UPPER_SNAKE_CASE members. Keep TypeScript names camelCase, map public HTTP fields to established snake case such as `session_key`, `run_id`, and `events_url`, and preserve public error/event names.

Use two spaces, never tabs. Keep spaces after commas and operators, and separate meaningful logic blocks with blank lines. The repository has ESLint but no configured Prettier; match nearby formatting and do not introduce a formatter without an explicit task.

## Comments, documentation, and API errors

Comment non-obvious decisions, security boundaries, recovery behavior, and compatibility constraints. Explain why, keep comments current, and delete redundant comments. Keep `README.md` accurate for runtime setup and standard commands.

Existing documentation includes `docs/operations/` and architecture diagrams in `docs/`. For new maintained documentation, use `docs/api/` for response/error/OpenAPI material, `docs/setup/` for local setup, `docs/architecture/` for diagrams and ADRs, and `docs/operations/` for deployment and rollback. Add `API_RESPONSE_GUIDELINE.md` or `ERROR_CODES.md` only when a public API contract needs maintained QA/client reference; never add empty placeholders.

Presentation maps application outcomes to stable HTTP status codes and JSON bodies. Current errors commonly expose `error` and sometimes `detail`; preserve this shape. Do not expose raw provider, database, filesystem, token, secret, or stack details. The API does not universally expose `trace_id`; do not add one as an incidental error change.

## Testing and delivery

Add a focused regression test for each non-trivial behavior change in its owning layer. Cover success plus relevant failure, authorization, replay, pause/resume, or persistence behavior. Use ports and controlled fakes; do not require a ceremonial unit test for every service.

Start with the narrowest relevant test or check. The suite is large, so do not repeatedly rerun broad suites. For changed TypeScript source, normally run the focused test, `npm run check`, and `npm run lint`; broaden verification when risk warrants it and report baseline failures separately.

Use short imperative Conventional Commit-style messages when committing locally:

```text
feat(runtime): add active run controls
fix(sse): preserve replay cursor after reconnect
refactor(session): isolate transcript mapping
```

The scope is optional when it does not improve clarity. Follow `skills/git-delivery/SKILL.md` and `AGENTS.md`; do not commit, push, merge, tag, or deploy without explicit authorization.
