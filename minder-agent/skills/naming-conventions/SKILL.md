---
name: naming-conventions
description: Use when naming files, TypeScript symbols, API fields, environment variables, database records, or tests in minder-agent
---

# Naming conventions

Follow the closest existing vertical slice when an established public name conflicts with a convention below. Public HTTP/SSE compatibility names must not be renamed casually.

## Choose a name

1. Search the nearby module for the same role (`rg --files` and `rg -n`).
   Reuse a public name or established suffix before inventing a new one.
2. Name the concept by its job, not its implementation: `runId` identifies a
   run, `resourceOwner` identifies the owner being checked, and a `*.mapper.ts`
   file converts between representations.
3. If a name crosses HTTP, event, database, or persisted-state boundaries,
   inspect its contract and callers. Keep an established spelling even if a
   new local name would look cleaner.

Example: a new `POST /api/v1/rooms/:roomId/close` handler can use camelCase
`roomId` in TypeScript while preserving any established snake-case JSON/event
fields. Do not rename an existing `run_id` response field to `runId`.

## Files and paths

- Use lowercase kebab case for directories and implementation files: `runtime-run-manager.ts`, `safe-path.ts`.
- Use purpose suffixes for framework and boundary files: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.repository.ts`, `*.store.ts`, `*.mapper.ts`, `*.port.ts`, and `*.dto.ts`.
- Put tests beside the layer they verify under `src/tests/`; name them `<subject>.test.ts`.
- Use `index.ts` only as a deliberate public barrel. Do not create a barrel for one private implementation.

## TypeScript symbols

- Use PascalCase for classes, interfaces, types, enums, and branded domain constructors: `RuntimeRunManager`, `RunManager`, `RunStatus`.
- Use camelCase for functions, methods, properties, local values, and injected dependencies: `getAuthorizedRun`, `manifestOwner`.
- Prefix a TypeScript interface with `I` only when it names an application port or a deliberate injectable contract already using that style: `IAgentWebhookClient`. Do not add the prefix to ordinary data shapes.
- Use UPPER_SNAKE_CASE for fixed policy constants, injection tokens, and
  environment variables: `RUN_MANAGER`, `MINDER_TEST_DATABASE_URL`. Leave a
  one-use local `const` in camelCase.
- Keep common protocol acronyms uppercase in type names: `HTTP`, `SSE`, `MCP`, `URL`, `ID`. Preserve established spelling in existing symbols.

## Boundary names

- Use camelCase inside TypeScript. Map HTTP JSON fields to snake case at presentation boundaries: `session_key`, `run_id`, `events_url`.
- Name new API collections with lowercase plural nouns and use lowercase kebab case for a non-CRUD action suffix. Read `skills/http-sse-contracts/SKILL.md` before changing a route; existing endpoint paths are compatibility contracts.
- Name finite state values with lowercase snake case when they cross persistence or HTTP boundaries: `awaiting_approval`, `awaiting_client_tool`.
- Preserve existing Prisma model, column, and migration names. A database
  rename needs a migration and mapper review, not just a TypeScript rename.
- Give owner-scoped identifiers a precise role: `owner`, `resourceOwner`, `manifestOwner`, `organizationId`, `runId`, `sessionId`. Do not replace these with a generic `id` once more than one identifier is in scope.
- Name booleans as a question or capability: `isError`, `includePlanReview`, `canDispatch`.

## Tests and evidence

- Name a test after observable behavior, not its implementation detail.
- Use a stable fixture name that states its role, such as `owner`, `otherOwner`, `run`, or `pausedRun`; avoid anonymous values once a test has multiple actors.
