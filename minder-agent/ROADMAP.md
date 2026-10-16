# minder-agent roadmap

This is a proposed order of work, not a release schedule. The main run path is shown in the [architecture diagram](docs/minder-agent-architecture.html). Current implementation details remain in the [README](README.md).

## Now: make the existing service trustworthy at scale

### 1. Coordinate room runs across replicas

**Why:** A room actor limits concurrent runs within one service process, while the production Kubernetes configuration can run up to three replicas. Two replicas can each activate the same room and make admission decisions from their own local state.

**Scope:** Use PostgreSQL to coordinate room ownership or enforce room-wide admission and concurrency. Reuse the existing durable room queue and its claim operation where appropriate. Keep one actor per room as the local execution model.

**Done when:** Simultaneous requests to the same room on separate replicas respect `maxConcurrentRuns` and `maxQueued`; each run dispatches at most once; queued work survives a replica replacement; room events remain replayable in order.

**Starting points:** `src/application/room/runtime/room-runtime.ts`, `src/application/room/runtime/durable-registry.ts`, `src/infrastructure/prisma/repositories/room-queue.ts`, `k8s/overlays/gcp-prod/hpa.yaml`.

### 2. Report real HTTP outcomes in metrics

**Why:** The current request metric labels every non-operational response as route `unmatched` with status `404`, including successful responses. This makes error rates unreliable.

**Scope:** Record the completed response status and a bounded route label from the shared metrics middleware. Never use raw room or run IDs as metric labels.

**Done when:** Successful and failed requests appear under their actual status codes, route labels have bounded cardinality, and operational probe routes remain excluded as intended.

**Starting point:** `src/presentation/http/operations/operations.controller.ts`.

## Pi-inspired harness and agent-loop gaps

`minder-agent` already has a ReAct agent loop, durable run management, tool dispatch, and approval/resume paths. The missing Pi-inspired piece is a reusable harness that coordinates conversations, parallel named work lanes, loop controls, and lifecycle integrations around that existing machinery. Build on the current loop and run manager; do not create a competing loop.

### H1. Add named work lanes inside an agent session

**Pi pattern:** The local Pi harness exposes named lanes with their own branch tip, settings, operation state, and inbox. A lane can be inspected, driven, paused, or resumed through one harness API.

**Minder-agent gap:** Runs and rooms are persisted, but there is no equivalent named lane within a conversation. A room is a collaboration space and should not be repurposed as an individual agent lane.

**Smallest useful version:** Add an owner-scoped session with named lanes. Each lane references a conversation branch and has its own model/tool settings and active run. Expose a small application API for create, inspect, run, cancel, and resume; route execution through the existing `AgentLoop` and `RuntimeRunManager`.

**Done when:** Two lanes can try different approaches from the same earlier conversation without changing each other's history or settings; each run uses existing governance, approval, event, and persistence paths; access remains owner-scoped.

**Starting points:** `src/application/agent/execution/loop.ts`, `src/application/runtime/execution/runtime-run-manager.ts`, `src/application/runtime/execution/types.ts`, `src/presentation/http/runs/`.

### H2. Control a run while it is running (chat and automation)

**Pi pattern:** While a run is active, the harness accepts steering or follow-up input and decides whether it applies to the current turn or the next one. It can also abort the active operation and report the resulting state.

**Minder-agent gap:** The native controller has steering and follow-up queues, but they are process-local. `RunManager` can cancel queued runs, but does not expose cancellation of an active run or steering/follow-up through the HTTP API. As a result, a person chatting with an agent cannot stop or redirect an in-progress run through a common control surface.

**Smallest useful version:** Add owner-authorized run controls to the existing API for cancelling an active run and queuing `steer` or `follow-up` messages. Wire the chat client to show these actions and their accepted/completed outcome; let `celesnity-core` call the same controls for automation runs when needed. Persist accepted controls so they survive worker replacement. Treat resuming interrupted model/tool operations as a separate later step; never blindly replay a tool that may have caused an external side effect.

**Done when:** An authorized user can cancel an active chat run and see its terminal status, or queue a steering/follow-up message and see whether it was accepted and applied. Automation callers can use the same run-control contract without bypassing owner/organization authorization. Controls survive worker replacement and are applied at most once; side-effecting tools are never replayed just because a worker restarted.

**Starting points:** `src/application/agent/execution/native-agent.ts`, `src/application/runtime/execution/run-manager.ts`, `src/application/runtime/execution/runtime-run-manager.ts`, `src/presentation/http/runs/`, `../celesnity-web/src/infrastructure/repositories/agent-api-chat.repository.ts`, `../celesnity-core/src/infrastructure/worker/automation-workflow/automation-workflow-step-poller.ts`.

### H3. Add a small typed lifecycle hook surface

**Pi pattern:** The harness lets trusted extensions participate at points around prompt preparation, model requests, tool execution, and turn completion.

**Minder-agent gap:** There is no general typed hook surface around the ReAct loop. Integrations otherwise need to fork loop code or add special cases to runtime composition.

**Smallest useful version:** Add only the hooks required by a concrete integration, such as before model request, before/after tool execution, and after turn completion. Register trusted application callbacks at startup; keep authorization, tool policy, and approval checks inside the core execution path. Do not load arbitrary tenant code in the service process.

**Done when:** A trusted integration can add bounded behavior without forking the loop; hook order, timeout, and failure behavior are defined; a failed hook cannot bypass tool policy or approval.

**Starting points:** `src/application/agent/execution/react-loop.ts`, `src/application/agent/execution/tool-dispatch.ts`, runtime composition under `src/application/runtime/`.

### H4. Make loop behavior reusable as a conformance check

**Pi pattern:** Pi tests its harness and session implementations against shared behavior, including operation control and session persistence.

**Minder-agent gap:** There are loop and persistence tests, but no single compact contract that future loop implementations or adapters must satisfy.

**Smallest useful version:** Define a focused set of scenarios against the existing `AgentLoop` contract: streamed response, tool result, abort, approval pause/resume, queued steering, event order, and read-only parallel tool dispatch. Reuse current test fakes and stores instead of adding a new testing framework.

**Done when:** The same scenarios can run against the native loop and any future implementation, and failures identify which observable behavior changed.

**Starting points:** `src/application/agent/execution/loop.ts`, `src/application/agent/execution/react-loop.ts`, `src/application/agent/execution/tool-dispatch.ts`, existing tests under `src/tests/application/agent/execution/`.

## Next: recommended new feature

### 3. Agent evaluation cases

**User value:** Before changing an agent configuration or model, run a small set of representative tasks and spot regressions in completion, tool use, or other checkable behavior. Review answer quality manually.

**Smallest useful version:** A local command reads checked-in cases, runs them through the existing runtime, and produces a per-case pass/fail summary plus a JSON result that can be compared with a previous run. Cases can assert terminal status and selected tool or event behavior. Include the run ID and existing trace/report location for failures. Real model calls are explicit; the first version needs no dashboard, new database tables, or model-based grader.

**Done when:** A maintainer can run the same cases against two configurations, compare outcomes, and identify the run behind each failure. At least one case covers a tool call and one covers a rejected or interrupted run.

**Depends on:** Existing run evidence. Room coordination is required before using room cases to judge multi-replica behavior.

**Starting points:** `src/application/runtime/execution/`, `src/presentation/http/runs/runs.controller.ts`, `src/tests/presentation/http/production-integration.test.ts`.

## Next: make long conversations easier to work with

### 4. Protect long conversations from context overflow

**Pi pattern:** Pi summarizes older messages when the conversation approaches the model's context limit, keeps recent messages, and retains the original session entries.

**Minder-agent gap:** A context compaction planner exists, but the interactive and autonomous turn configurations currently disable compaction.

**Smallest useful version:** Enable compaction at a safe threshold. Summarize older turns, retain recent turns, and keep the full original event history available to the owner. Allow an operator or user to supply short guidance about what a summary must preserve.

**Done when:** Long conversations continue without failing only because the provider context window filled; compaction never drops the original transcript or breaks pending tool/approval state; owners can inspect the original history.

**Starting points:** `src/application/context/compaction/`, `src/application/agent/execution/interactive-turn.ts`, `src/application/agent/execution/autonomous-turn.ts`.

### 5. Branch a conversation to try another approach

**Pi pattern:** Pi lets a user continue from an earlier point while preserving the previous path as a separate branch.

**Smallest useful version:** Create a new owner-scoped session from a selected user turn or completed run, record its parent, and leave the original conversation unchanged. Start a new run on the branch; never replay previous tool calls or side effects.

**Done when:** The user can compare the original and alternate answers, each branch has its own run history, and access checks remain owner-scoped.

**Starting points:** `src/application/runtime/execution/types.ts`, `src/application/runtime/execution/runtime-run-manager.ts`, `src/application/room/runtime/room-runtime.ts`.

### 6. Export a run transcript

**Pi pattern:** Pi exports sessions as readable HTML or structured JSONL.

**Smallest useful version:** Let an authorized owner download one run or room conversation as Markdown or JSON. Include timestamps and tool/event summaries, and redact secrets by default. Do not add public share links in the first version.

**Done when:** An owner can save and review a conversation outside the app; exports preserve event order, identify redacted values, and cannot expose another owner's data.

**Starting points:** `src/presentation/http/rooms/rooms.controller.ts`, `src/presentation/http/runs/runs.controller.ts`, `src/application/runtime/execution/types.ts`.

## Next: help operators understand real runs

### 7. Searchable run history

**User value:** Find a failed or stalled task without knowing its run ID, even when it happened in another room.

**Smallest useful version:** Add an owner-scoped, paginated run list for PostgreSQL mode. Filter by status, agent, room, and time. Return summaries that link to the existing status, trace, and report endpoints; keep full event payloads out of the list.

**Done when:** An operator can find a run across rooms, open its existing evidence, and never see another owner's runs. Results remain bounded when the database contains many runs.

**Starting points:** `src/presentation/http/runs/runs.controller.ts`, `src/infrastructure/prisma/prisma-runtime-store.ts`.

### 8. Token and cost overview

**User value:** See which agents use the most model capacity and understand the cost of a run before changing its limits.

**Smallest useful version:** Show recorded input and output tokens per run and aggregate them by agent over a selected period. Show an estimated cost only when model pricing is configured; distinguish missing usage data from zero usage. Reuse the existing token events and governance budget data.

**Done when:** Totals reconcile with recorded run usage, an owner can see only their own data, and estimated costs are clearly labeled.

**Starting points:** `src/application/runtime/governance/governed-context.ts`, `src/presentation/http/runs/runs.controller.ts`.

## Later: build on run history and evaluations

### 9. Safe new attempt after a failed run

Let an authorized operator start a fresh run from a failed or interrupted run without retyping the task. Link the two runs and preserve the original evidence. Give the new attempt a new run ID, and require fresh approval for actions with side effects; never replay a previous tool call automatically.

### 10. Agent change gate

Require selected evaluation cases to pass before promoting a new agent manifest or model configuration. Keep the decision and its run evidence visible to the operator. Build this only after the local evaluation format and results are stable.

### 11. Turn failed production runs into evaluation cases

Let an authorized operator save a redacted failure as a reusable case. Preserve owner isolation and require a human to review inputs before a case is added. This turns observed failures into regression checks without collecting every run by default.

## Candidate requiring a separate product plan

### 12. Answers grounded in organization documents

Let an agent search documents it is authorized to read and cite the file and location used in its answer. Start with one document type and a small pilot. Upload, extraction, search, access control, and revocation span other services, so plan that work with the document workspace before adding retrieval tools to this runtime. A revoked document must disappear from both search results and agent answers.

## Research references

The Pi ideas above were checked against the local reference snapshot at `.references/pi` commit `002fc8385` and Pi's current documentation. Pi's session guide covers branching, context compaction, and transcript export; its extension guide notes that extensions run with the process's permissions. For this multi-tenant service, prefer explicit owner-scoped capabilities over loading arbitrary tenant code into the runtime.

The harness comparison also used `.references/pi/packages/agent/src/harness/agent-harness.ts`, `.references/pi/packages/agent/src/harness/runtime/lane.ts`, and `.references/pi/packages/agent/src/agent-loop.ts`. Treat those as design references, not a requirement to port Pi's full surface.

- [Pi: Sessions and Context](https://pi.dev/docs/latest/sessions)
- [Pi: How Pi Works](https://pi.dev/docs/latest/how-pi-works)
- [Pi: SDK and agent harness](https://pi.dev/docs/latest/sdk)
- [Pi: Extensions and runtime permissions](https://pi.dev/docs/latest/extensions)
