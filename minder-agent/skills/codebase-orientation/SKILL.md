---
name: codebase-orientation
description: Use when starting work in minder-agent, locating behavior, or assessing the blast radius of a change
---

# Codebase Orientation

## Overview

`minder-agent` is a native TypeScript runtime replacing the former Rust service
incrementally. It exposes CLI and caller-scoped HTTP/SSE runs, an agent loop,
optional PostgreSQL durability, MCP/tool integrations, and Nest composition.

## Map

```text
src/domain/                 Pure values, entities, policies, runtime rules
src/application/            Use cases, orchestration, ports, runtime contracts
src/infrastructure/         Prisma, S3/local workspace, MCP, HTTP, tools, config
src/presentation/            CLI and native HTTP/SSE compatibility handlers
src/modules/                 Nest provider modules; concrete dependency wiring
src/bootstrap/               App entrypoints and controlled module registration
src/tests/architecture/      Dependency and persistence-boundary contracts
src/tests/<layer>/           Unit, integration, compatibility, and phase tests
```

## Find behavior

| Question | Start here |
| --- | --- |
| Agent execution | `src/application/agent/execution/` |
| Run admission/lifecycle | `src/application/runtime/execution/` |
| Runtime persistence | `src/application/runtime/execution/types.ts`, then `src/infrastructure/prisma/prisma-runtime-store.ts` |
| HTTP/SSE contract | `src/presentation/http/`, `src/presentation/http/sse/` |
| Concrete wiring | `src/infrastructure/composition/index.ts`, `src/modules/`, `src/bootstrap/` |
| Room lifecycle | `src/application/room/runtime/`, room ports, then room adapters |
| Boundary rules | `src/tests/architecture/` and `eslint.config.*` |

## Orientation procedure

1. Read the root `README.md` for the active runtime and `skills/README.md` for
   the other guides relevant to the task. Check `git status --short` so existing
   edits are not mistaken for yours.
2. Check `.ua/meta.json` against `git rev-parse HEAD`. Search
   `.ua/knowledge-graph.json` for the named route, class, or file to get a
   candidate path. The graph is only an index; open the current source.
3. Use `rg --files src` to locate files and `rg -n '<symbol-or-route>' src` to
   find definitions, imports, callers, and tests. Read the closest existing
   vertical slice from boundary → application → adapter/store → response or
   event. Include composition when a dependency is injected.
4. Record the contract that must survive: inputs, owner scope, status/error
   body, event order, and persistence behavior. Choose the owning layer before
   editing and run its narrowest relevant test afterward.

For example, a run-status change starts at
`src/presentation/http/runs/runs.controller.ts`, follows the `RunManager`
contract into `src/application/runtime/execution/`, and checks the matching
HTTP and run-manager tests. A file with a familiar name is not proof that it
owns the behavior.

## Commands

```bash
rg -n 'getRunStatus|runs/:runId/status' src
npm test -- src/tests/presentation/http/http.test.ts
npm run check
```

Replace the example test with the test for the changed behavior. Read
`skills/testing-and-verification/SKILL.md` before selecting broader gates.
Architecture tests and current imports, rather than filenames or the graph,
decide dependency direction.
