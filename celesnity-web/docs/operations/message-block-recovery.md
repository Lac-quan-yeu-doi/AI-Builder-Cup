# Message-block disconnect classification and replay recovery

## Evidence and scope

The September 30 controlled development test distinguished two outcomes:

| Case           | Correlated request                     | Evidence                                                                                                                                                                                                     |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Navigation     | `f6cfa3ea-6639-484c-a7ab-44ae57752de7` | Web observed cancellation after 92.398 seconds at 11:45:03.102 UTC; Core recorded 499 two milliseconds later after an upstream 200. The load balancer recorded `client_disconnected_after_partial_response`. |
| Untouched chat | `063d64ce-34aa-4abb-8fc2-c839ab32495f` | Web completed after 240.274 seconds, Core recorded 200, and the load balancer recorded `response_sent_by_backend`.                                                                                           |

These are historical observations, not proof that the new code is deployed. They establish that consumer cancellation can produce Core's synthetic 499 even though HTTP headers were 200. They do not establish that all disconnects are intentional or that all 499s share this cause.

The recovery approach follows DeerFlow's separation of durable producers from stream observers and explicit replay-gap restoration, reviewed at commit `5b83cb502c967e2952d32155a21c01ee739f1660`: [memory bridge](https://github.com/bytedance/deer-flow/blob/5b83cb502c967e2952d32155a21c01ee739f1660/backend/packages/harness/deerflow/runtime/stream_bridge/memory.py), [thread restoration](https://github.com/bytedance/deer-flow/blob/5b83cb502c967e2952d32155a21c01ee739f1660/frontend/src/core/threads/hooks.ts). This change uses the existing room state and block history APIs; it adds no Redis, migration, timeout increase or capacity increase.

## Server-owned classification

Only an authenticated, admitted message-block response registers lifecycle metadata. Request headers, URLs and client telemetry cannot opt into INFO severity.

| Completion                                               | HTTP accounting status       | Response status                   | Outcome / severity                          |
| -------------------------------------------------------- | ---------------------------- | --------------------------------- | ------------------------------------------- |
| Consumer closes an admitted stream                       | 499                          | 200                               | `client_disconnected`, INFO                 |
| Planned four-minute rotation                             | 200                          | 200                               | `rotation`, INFO                            |
| Invalid cursor on an open stream                         | 200                          | 200                               | `cursor_reset`, INFO                        |
| Read failure, oversized frame, slow consumer             | Preserve existing accounting | Usually 200 once headers are sent | `error`, `oversized`, `slow_consumer`, WARN |
| Authentication/admission rejection or unrelated endpoint | Preserve existing accounting | Actual rejection status           | Existing WARN/ERROR policy                  |

Both finish/close orders record completion once. Failure reasons are set before transport termination, including before an error frame is sent, so consumer closure cannot turn a known server failure into an INFO completion. Slot and timer cleanup remain independent of log severity. Pending Prisma reads retain their read lease until settling; disconnect schedules no further reads and never invokes durable-run cancellation.

## Replay contract and orchestration

An omitted cursor requests available history. A supplied empty, malformed, missing or inaccessible anchor is invalid. Core checks the anchor in the authenticated organization and requested room, with one uniform classification that does not reveal ownership:

- History: HTTP 409 through existing problem details, `code: MESSAGE_BLOCK_CURSOR_INVALID`.
- Open SSE: `event: stream_reset`, `data: {"code":"MESSAGE_BLOCK_CURSOR_INVALID","recovery":"reload_room_state"}`, then normal HTTP completion. No block cursor is advanced.

Each tab has its own subscription, room generation and delivered cursor. Infrastructure owns backoff and the five-failure budget. The shared restoration operation reloads authoritative session/run state and missed history, deduplicates by block ID, and returns `{cursor, resume}` through service/use-case/controller interfaces. A reset clears only that room's cursor. A reset arriving during incremental restoration escalates the same operation to full replay, so focus, visibility and send also wait for it. Generation checks discard results after room change or unmount.

Unexpected reconnect restores before reopening; idle rooms pause, while active runs and pending approval/input continue observation. At most two consecutive stream-reset recoveries are allowed; the third uses the existing reconnect error. Valid blocks reset that reset budget; heartbeats or blocks reset transport failures. Expired authentication follows existing sign-in recovery. Restoration never sends an old prompt, creates a new room, starts a new run or cancels another observer's run.

## Correlating browser, Web, Core and load balancer

Browser connections generate a fresh `X-Request-Id`, forwarded through Web to Core and returned with the response. Browser telemetry uses the existing `/api/client-logs` transport and includes subscription/request IDs, duration, retry count and bounded reasons. `close(reason?)` accepts `unmount`, `room_change`, `replacement` or `manual_reconnect`; these remain client-reported evidence, not server authority. No prompt, block payload, cookie or credential is added to these events. Metrics keep bounded close reasons and no room/user labels.

In Grafana/container logs, correlate `message_block_stream_started`, `message_block_stream_connected`, `message_block_stream_closed`, `message_block_stream_recovery` and `message_block_stream_failed` with Web's `core_proxy_stream_*` and Core's `http_request_completed` / `message_block_stream_*`. Client close hints can be lost on navigation; do not infer intent from their absence. For admitted disconnects, filter `outcome="client_disconnected"` separately from actual stream errors while keeping status-499 HTTP metrics visible.

## Local validation and delivery

Changes are prepared in Core and Web on `codex/message-block-recovery`, from clean `release/0.5.0` checkouts. Commits, pushes, merges and deployment are separate. The October bilingual changelog entry is a local release candidate; confirm its merge/deploy date before publishing it.

The real-query test requires a fresh disposable PostgreSQL database named `message_block_recovery_test` on localhost. It refuses application database names and existing fixture schemas. Example using a disposable PostgreSQL container, never the workspace database:

```sh
MESSAGE_BLOCK_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:TEST_PORT/message_block_recovery_test npx jest --runInBand src/tests/infrastructure/prisma/message-block/prisma-message-block-cursors.database.spec.ts
```

October 1 local results:

| Gate                                                                      | Result                                                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Core targeted lifecycle/cursor/controller regressions                     | Initial implementation: 57 passed; review: 21 lifecycle and eight isolated PostgreSQL cases passed          |
| Core full Jest suite                                                      | 349 suites / 2,760 tests passed; eleven opt-in cases skipped in the default run                             |
| Web targeted recovery, interfaces, proxy, history and release-note checks | Initial implementation: nine files / 92 passed; review: 39 hook/transport recovery tests passed             |
| Web full Vitest suite                                                     | 2,238 passed; four pre-existing failures                                                                    |
| Core and Web typechecks and production builds                             | Passed                                                                                                      |
| Changed-file lint, formatting and whitespace                              | Passed                                                                                                      |
| Browser lifecycle checks on a production Next build                       | Four passed: capacity recovery, ten-minute idle restoration, expired sign-in, cursor reset/recovered cursor |

The four Web full-suite failures reproduce in an untouched archive of the starting `fd6846d0` checkout using the same installed dependencies: PDF rendering in `chat-block-pane`, `documents-screen` and `chat/run-file-viewer`, and the chat screen's import of plugin route-local components in `frameworks-layer`. This change leaves those unrelated files unchanged. The browser fixture was updated to handle the current deterministic session URL; it had still mocked only the former session lookup endpoint.

Whole-repository lint/formatting remain red on unrelated existing files: Core has 22 lint errors and 95 formatting violations; Web has 11 lint errors, seven warnings and six formatting violations. The changed TypeScript files pass lint, and every changed file passes Prettier. These failures are release gates to review separately, not evidence that development has recovered.

Regression tests were added before implementation for admitted-disconnect severity, browser request-ID propagation, invalid-cursor signaling and recovery. Coverage includes real HTTP closure and one-time slot/accounting release, both finish/close orders, cancellation before upstream headers, pending-read cleanup, server failures despite client close hints, separate rooms and three observers of one pending run, focus/send/reset coalescing, stale room-switch restoration, repeated resets, authentication failure and retry exhaustion. Existing rotation, heartbeat, slow-consumer, frame and admission tests remain passing. Restoration also preserves the existing regression preventing old unmatched artifacts from attaching to a new turn's optimistic empty assistant message.

The disposable database container was removed after validation. No existing local database was changed. Local tests do not prove development recovery.

## October 1 implementation review

The follow-up review reproduced and fixed two timing defects with failing tests before changing production code:

- A database read failure at 239 seconds with a backpressured error frame could be overwritten by the 240-second rotation deadline. The lifecycle now preserves known failure reasons across disconnect, rotation and shutdown. The regression verifies the close remains `error`, no rotation event is emitted, and slots/timers are released.
- An idle state snapshot requested during recovery could resolve after a new send was accepted, clear its active run and pause observation. A run-state revision now rejects stale snapshots; recovery also checks current run activity before pausing. The regression forces the send/recovery ordering and verifies observation continues without repeating the send.

An additional isolated PostgreSQL regression verifies that three blocks with identical publication timestamps are replayed once each using the actual Prisma cursor query. All eight isolated database cases pass. This review adds no timeout, capacity or infrastructure changes.

## Separately authorized rollout and live acceptance

1. Deploy Core's additive classification/reset contract first, keeping current routing, limits and security policies. Old clients can still receive ordinary blocks and rotations.
2. Deploy Web's recovery consumer after Core readiness. Keep the current 300-second stream backend and 30-second ordinary backend unchanged.
3. Repeat the navigation/untouched experiment with fresh request IDs. Correlate browser telemetry, Web, Core and LB records. Navigation must release promptly and log INFO 499/200; untouched rotation must complete 200 at 240 seconds.
4. Confirm missing-cursor recovery retrieves state/history and keeps the same room/run identity. Test three independent tabs, focus/send/reset races, idle resumption after ten minutes, pending interactions and an active run across rotations, expired sign-in and exhausted retries.
5. Verify admission/read slots return to zero after observer cleanup and no recurring 30-second message-block `backend_timeout` appears. This live experiment remains pending until deployment is authorized.
