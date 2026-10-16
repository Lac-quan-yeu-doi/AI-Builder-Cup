# Agent event stream routing

## Evidence

The October 1, 11:27 development incident used room `3ffec8ad-4a60-4b6f-8c4f-f85964154c20` and run `0cde01dd-014c-4de2-9ffd-14fbcfa24dca`.

- Browser/Web request `075fadbe-4c82-4886-9973-a096ba0ef554` opened `/api/agent/rooms/.../events` at 04:27:15 UTC. GCP recorded `backend_timeout` at 30.032854 seconds on the ordinary Web backend; Cloud Armor accepted it. Web recorded cancellation at 04:27:45.187 UTC.
- The browser resumed the same run at cursor `:43`; the Agent completed that run at 04:28:05.971 UTC. This is evidence of interruption and recovery, not a failed run.
- Message-block request `3e4c811a-8ab0-4ee9-82ff-d49e563f3415` completed normally at 240 seconds. The sampled Core 499 was separately correlated to a room change and correctly classified INFO/client_disconnected.

## Change and boundaries

A dedicated `celesnity-web-agent-stream` Service selects existing Web pods. Development and production overlays give it a 300-second backend policy, matching health checks, existing Cloud Armor, request logging and connection draining. Requests under `/api/agent/rooms` and `/api/agent/runs` with `Accept: text/event-stream` select this backend. GKE prefix/header matching chooses transport policy only; the existing Web session, workspace policy, assertion exchange and Agent owner authorization remain authoritative. JSON requests continue on the ordinary 30-second backend. Message-block routing remains separate.

Existing Agent subscriptions send 15-second keepalives and release observers on closure. The inspected live event hub caps each observer queue at 256 events and requests replay on overflow; this is an event-count limit, not a byte or connection limit. The Web proxy propagates abort and uses pull-based reads. The client resumes with the last run/event cursor. No Agent code, quota, replica count or run timeout changes are included. Current message-block admission quotas do not apply to Agent observers; this change does not claim they do.

The 300-second limit is finite. A longer run can still encounter a gateway interruption and briefly show Reconnecting, then resume. This is not the message-block 240-second planned rotation protocol. The change removes the confirmed 30-second cutoff; it does not promise uninterrupted connections for arbitrarily long runs or address catalog-tool failures.

## Validation and release

Routing regressions fail on the prior manifests and cover both environments, ordinary requests, Cloud Armor, health target and existing pod selectors. Render both overlays with `kubectl kustomize`. A simulated 300-second interruption checks cursor resumption, unchanged room/run and one send, plus cleanup on unmount. Simulation does not prove GCP behavior.

Local validation: 58 focused tests passed, including the six routing regressions and simulated long-stream recovery. Both overlays rendered and their Service/backend/health references were checked. Typecheck, production build, changed-file lint/formatting, and four existing browser lifecycle checks passed. The full suite passed 2,289 tests with the same four baseline failures in DI registration, client-tool parsing and architecture tests. Whole-repository lint (39 errors, seven warnings) and formatting (nine files) still fail outside this patch.

After separately authorized development deployment, inspect Accepted/Reconciled route status, attached health/backend policies and the actual GCP backend timeout. Observe one run over 30 seconds and another over 300 seconds. Correlate browser/Web/Agent and LB records: no cutoff at 30 seconds, cursor resumption at the finite deadline, unchanged run identity, terminal completion, and observer cleanup on navigation. Keep production activation separate. No live resources have been modified by the local patch.
