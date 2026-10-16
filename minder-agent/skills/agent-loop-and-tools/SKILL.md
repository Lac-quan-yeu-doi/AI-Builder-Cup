---
name: agent-loop-and-tools
description: Use when changing the ReAct/native agent loop, tool selection or dispatch, approvals, pauses, snapshots, or streamed lifecycle events
---

# Agent Loop and Tools

## Flow

```text
turn input → policy/tool definitions → model stream → assembled tool calls
→ policy/approval gate → dispatch → effects/tool results → next iteration
→ completion, pause, interruption, or snapshot
```

Start with `src/application/agent/execution/loop.ts` and the closest existing
test. The main seams are:

- `react-loop.ts`: orchestration and event sequencing
- `native-loop.ts`: native provider-agnostic loop
- `tool-selection.ts`: definitions and selection policy
- `tool-dispatch.ts`: execution and normalized results
- `loop-pauses.ts`: AskUser, plan, client-tool, and approval pauses
- `loop-outcomes.ts` and `react-loop-state.ts`: effects, restoration, and resume
- `lifecycle.ts`, `completion.ts`, and `pause.ts`: public event/outcome contracts

## Rules

- Keep model-provider details behind `ModelPort`/gateway adapters.
- Validate tool arguments and policy before dispatching any tool.
- Preserve tool-call IDs, ordering, event types, and terminal payloads.
- A pause must be resumable from persisted state; do not hide required state in
  a local closure.
- Effects update loop state deliberately: activated tools, todos, background
  tasks, snapshots, and continuation data must remain consistent.
- Interactive turns may ask or pause; autonomous turns must not invent a human
  confirmation path.

## Change procedure

1. Locate the behavior in `loop.ts`, then follow the actual branch into the
   ReAct/native loop, tool selection, dispatch, or pause module. Search the
   exported symbol's callers and its test with `rg -n`.
2. Keep model chunks separate from assembled tool calls. Only dispatch after
   arguments have been assembled, validated, and checked against policy and
   approval requirements.
3. Treat a pause as an outcome with saved continuation data. Confirm a resumed
   run uses the same tool-call ID and does not execute an approved mutating
   call twice.
4. Check the event sequence and final outcome in one focused test. For an
   HTTP-visible change, also check the run-manager and SSE boundary.

For example, an AskUser change belongs in `loop-pauses.ts` and the matching
`loop-pauses.test.ts`; the run manager must still expose a resumable pause.
Do not add a second decision in the HTTP controller.

## Verification

Add a focused regression test for changed stream, pause, approval, or resume
behavior. Run the actual matching test file, for example:

```bash
npm test -- src/tests/application/agent/execution/loop-pauses.test.ts
npm run check
npm run lint
```
