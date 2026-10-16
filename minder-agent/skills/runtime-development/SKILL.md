---
name: runtime-development
description: Use when changing agent execution, run admission, runtime stores, approvals, rooms, event replay, or HTTP/SSE lifecycle behavior
---

# Runtime Development

## Core flow

Trace this path before changing runtime behavior:

```text
HTTP/CLI boundary
  → RunManager / room coordinator
  → RuntimeRunManager
  → RuntimeStore + agent loop
  → journal/live hub
  → replay/SSE/status response
```

For HTTP runs, start at `src/presentation/http/runs/turns.controller.ts` or
`runs.controller.ts`; for rooms, start at
`src/presentation/http/rooms/rooms.controller.ts`. Follow the `RunManager`
calls through `src/application/runtime/execution/runtime-run-manager.ts` or
the room actor, then check `src/infrastructure/composition/runtime.ts` to see
which store and loop are active. `InMemoryRunManager` extends the shared
manager; the durable composition supplies `PrismaRuntimeStore`.

## Contracts

- `src/application/runtime/execution/types.ts` defines runtime state and store
  capabilities. Add a narrow capability contract when a new operation needs
  one; do not add another optional method to the base store casually.
- `RuntimeRunManager` is the shared coordinator for admission, dispatch,
  interruption, approvals, plan resume, snapshots, governance, and finalization.
- `InMemoryRunManager` is a compatibility facade for the in-memory store, not a
  second runtime implementation.
- `PrismaRuntimeStore` is the durable adapter. Keep Prisma details out of
  application and presentation code.
- Owner/session/run authorization must remain enforced before reads, replay,
  room events, or mutations.

## Agent loop seams

Keep these responsibilities separate:

- manifest parsing/loading/watching under `src/application/agent/configuration/`
- pause decisions under `src/application/agent/execution/loop-pauses.ts`
- restored loop state/effects under `loop-outcomes.ts`
- model/tool sequencing in the ReAct loop and tool dispatcher

When changing a pause, approval, snapshot, or terminal event, test both the
event payload and the resumed/continued behavior.

## Persistence and HTTP rules

- Journal terminal and lifecycle events before broadcasting them.
- Preserve replay cursor semantics and SSE keepalive behavior.
- Keep room repositories behind ports and owner-isolated.
- Use controlled in-memory dependencies for compatibility tests; use the
  throwaway PostgreSQL service only for phase-4 integration tests.

## Change procedure

1. Identify the exact transition: admission, running, pause, resume,
   interruption, or completion. Read the current state and event types in
   `types.ts`, and search all callers of the method being changed.
2. Make the transition in the shared manager or room coordinator. Keep owner
   authorization before state access. Persist state and journal events before
   making them visible through the live hub.
3. Check both observations of the transition: immediate HTTP response/status
   and replayed/live SSE. A `202` only confirms admission. For a pause, verify
   the call ID and the state required after process restart.
4. Test the in-memory path with a focused application or HTTP test. If durable
   behavior changes, add or run a phase-4 test against a throwaway database.

Example: a new terminal event needs one stable event payload, a persisted
journal entry, a live publication, replay from the preceding cursor, and a
terminal status. Read `skills/http-sse-contracts/SKILL.md` and
`skills/persistence-and-prisma/SKILL.md` for those boundaries.
