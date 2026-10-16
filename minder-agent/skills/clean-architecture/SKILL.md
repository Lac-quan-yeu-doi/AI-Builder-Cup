---
name: clean-architecture
description: Use when deciding layer placement, reviewing SOLID boundaries, or fixing dependency-direction and architecture errors in minder-agent
---

# Clean Architecture

## Dependency direction

Dependencies point inward:

```text
domain ← application ← presentation
                    ← infrastructure
composition/bootstrap → every concrete layer
```

- `src/domain` contains pure rules and values. It does not import Nest,
  Prisma, infrastructure, presentation, or process-specific adapters.
- `src/application` owns orchestration and ports. It may depend on domain and
  shared port contracts, not concrete infrastructure or Nest.
- `src/infrastructure` implements application ports: Prisma, S3/local storage,
  MCP, HTTP clients, tools, telemetry, and configuration.
- `src/presentation` validates transport input, calls application contracts,
  and formats HTTP/SSE/CLI output. Prefer injected repositories and managers;
  do not reach into Prisma or infrastructure directly.
- `src/modules`, `src/bootstrap`, and infrastructure composition are the
  composition root. Concrete classes belong there.

## Placement decisions

| Code | Place it in |
| --- | --- |
| Pure business rule or value | `src/domain` |
| Run/agent orchestration or use-case behavior | `src/application` |
| Capability required from outside | Application port/interface |
| Prisma, S3, MCP, filesystem, HTTP, env | `src/infrastructure` |
| HTTP/SSE/CLI parsing and response mapping | `src/presentation` |
| Concrete implementation binding | Composition/modules/bootstrap |

## Work through a boundary change

1. Find the current call path with `rg -n '<exported-symbol>' src` and read its
   callers. Locate the existing port or mapper before adding one.
2. Put a rule that needs no I/O in domain; put sequencing and decisions in
   application. If application needs I/O, describe the smallest capability in
   an application port and implement it in infrastructure.
3. Map HTTP/CLI input and output in presentation. Bind concrete implementations
   in `src/modules/`, `src/bootstrap/`, or `src/infrastructure/composition/`.
4. Check the same path with an in-memory/fake implementation and, if relevant,
   the real adapter test. Preserve the exported async and response contracts.

Example: if run admission needs a stored value, the application manager calls
a store capability from `src/application/runtime/execution/types.ts`;
`src/infrastructure/prisma/prisma-runtime-store.ts` implements it. A controller
does not query Prisma to make the admission decision. Reuse an existing store
method when its semantics fit; do not create a port for a local pure helper.

## SOLID rules that matter here

- Keep one run coordinator. `RuntimeRunManager` owns shared run behavior;
  in-memory callers should use its compatibility facade, not a second copy.
- Prefer narrow capability interfaces over optional methods on a large store.
- Keep parsing, watching, persistence, SSE streaming, and orchestration at
  separate behavior seams.
- Delete wrapper classes that only bind a closure; return the handler directly.
- Preserve async contracts. A method returning `Promise<T>` must still reject
  asynchronously rather than throwing synchronously.

## Verify boundary changes

```bash
npm run test:architecture
npm run check
npm run lint
```

Never disable a boundary rule to make an import pass. Move the code or inject a
port instead. `src/tests/architecture/layer-imports.test.ts` states the
enforced import boundaries; inspect it when a placement choice is unclear.
