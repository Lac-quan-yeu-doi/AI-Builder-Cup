---
name: http-sse-contracts
description: Use when naming or changing native HTTP routes, Nest adaptation, authentication guards, status/replay endpoints, SSE streams, or room events
---

# HTTP and SSE Contracts

## Request path

```text
Nest/native adapter → presentation handler → auth/owner resolution
→ application RunManager/port → JSON or SSE response
```

Nest controllers live in feature directories under `src/presentation/http/`,
such as `runs/`, `rooms/`, and `agents/`. Transport contracts are under
`src/presentation/http/contracts/`; shared SSE framing is under
`src/presentation/http/sse/`. `src/modules/http.module.ts` and infrastructure
composition wire dependencies outside the controllers.

## Trace an endpoint change

1. Find its decorator in the feature controller, then read the matching
   contract/DTO, owner guard, application call, and HTTP test. Search for the
   route and response fields across clients before renaming either.
2. Decide whether the route is an immediate read/mutation or admitted work.
   Preserve the existing status and body for current routes; use `202` only
   when completion is observed later.
3. For SSE, read `runs/events.controller.ts` or `rooms/room-events.ts` plus
   `sse/sse.ts`. Check how a cursor is parsed, which events are replayed, when
   live subscription begins, and how disconnect/terminal cleanup occurs.
4. Update the exact HTTP test. For a stream, assert event ID, event type,
   payload, replay without duplicates, and cross-owner denial.

Example: a run-status field added in `runs.controller.ts` also needs its
`contracts/runs.ts` shape and a test in `src/tests/presentation/http/`.
Keep the status URL and the `202` turn admission response compatible.

## Contract rules

- Authenticate and resolve the caller before reading or mutating owner-scoped
  state.
- Preserve existing status codes, error names, JSON shapes, event names, event
  IDs, replay cursors, and `202` admission semantics.
- HTTP `202` means admitted, not completed. Completion is observed through
  status or events.
- SSE must replay from the requested cursor, avoid duplicate events, emit
  keepalives while a run is active, and close subscriptions in all paths.
- Keep long-running streams abortable on request/response close.
- Do not import Prisma or concrete repositories into compatibility controllers;
  inject application ports and managers.

## API endpoint naming

The Nest service owns the `api` prefix and URI versioning in
`src/bootstrap/http-main.ts`. New public clients use canonical `/api/v2`
routes; set controller version `2` and do not repeat `api/v2` in a controller
path. Preserve `/api/v1` compatibility routes and their contracts.

| Part | Convention for new routes | Existing examples |
| --- | --- | --- |
| Collection | Lowercase plural resource noun | `/api/v2/rooms`, `/api/v2/agents` |
| Member | Collection plus a named route parameter | `/api/v2/runs/:runId` |
| Nested resource | Parent resource, member ID, child collection; prefer no more than three resource levels | `/api/v2/rooms/:roomId/members` |
| Business action | `POST` and a lowercase kebab-case action suffix only when CRUD does not describe it | `/api/v2/rooms/:roomId/close` |
| Path spelling | Lowercase kebab case; no camel case, underscores, or RPC verbs | `/client-tool-results`, not `/clientToolResults` or `/getRuns` |

Use `GET` for reads, `POST` for resource creation or non-CRUD actions,
`PUT` for replacement, `PATCH` for partial updates, and `DELETE` for removal.
Keep the HTTP method and path together as one public contract. Do not rename
current compatibility routes merely to make them more REST-like.

Route parameters stay camelCase in Nest (`:runId`, `:roomId`). Public JSON
bodies and query parameters preserve the repository's existing snake-case
contract where applicable (`run_id`, `session_key`, `include_closed`). For
v2 pagination use `cursor` and `limit`; for v2 streams use `cursor` or
`Last-Event-ID`. Legacy `after_seq` and `from` aliases belong to v1 only.
For a new query parameter, use a lowercase descriptive name
and preserve the exact spelling in its DTO, controller, response, tests, and
client code.

Avoid deep nesting, redundant words, and generic verb paths. A route that
changes a run or room lifecycle may use a clear action suffix; a normal CRUD
operation should be expressed by its method and resource path. Health,
metrics, webhook ingress, and other operational or compatibility endpoints are
explicit exceptions and must retain their established shape.

The maintained OpenAPI contract is `docs/api/openapi/minder-agent.yaml`.
Regenerate it with `npm run openapi:export` after changing public routes or
DTOs, and update matching HTTP contract tests.

## API response and error contract

The public API returns its resource payload directly. Do not add a global
`{ success, data, error, meta }` envelope. V2 run admission responses,
including accepted, terminal, and duplicate-delivery results, and v2 JSON
errors include `request_id` matching the `X-Request-Id` response header; v1
bodies remain unchanged.
Every response returns `X-Request-Id`; clients may supply it on requests.

Use the response shapes already established by the matching controller and
contract file. Public fields use snake case: `run_id`, `session_id`,
`events_url`, `active_run_id`, and `next_cursor`. Omit optional fields when
they do not apply; do not fill them with invented empty objects.

| Outcome | Current response rule |
| --- | --- |
| Synchronous read or completed mutation | Return the resource/result body with `200 OK`, unless the established route uses another documented success code. |
| New persistent resource | Use `201 Created` when the current route creates the resource synchronously. |
| Accepted agent, room, webhook, or background work | Use `202 Accepted`; include the existing run/session/event location fields. Acceptance is not completion. |
| Successful deletion without a representation | Use `204 No Content`. |
| Duplicate delivery | Preserve the established idempotent `200` status and body fields; v2 adds `request_id`. |
| Client, authorization, missing-resource, or lifecycle conflict | Return the matching `4xx` status; do not encode it as `200` with a false success flag. |
| Unexpected server failure | The exception filter returns `500` with `{ "error": "internal_error" }`. |

Errors use a stable lower-snake-case `error` code and may add safe fields such
as `detail` or `active_run_id`. Examples include `invalid_turn`,
`missing_caller_id`, `permission_denied`, `run_not_found`, `session_busy`, and
`runtime_not_configured`. Choose a precise code based on the current error
vocabulary; do not invent uppercase domain codes or expose provider, database,
filesystem, secret, token, or stack details.

Treat expected validation, authorization, absence, and conflict outcomes as
explicit HTTP responses. Use `400` for invalid input, `401` for missing or
invalid authentication, `403` for denied access, `404` for an unavailable or
unauthorized resource where the contract intentionally hides it, `409` for a
state conflict, `413` for an oversized payload, and `503` for an unavailable
optional runtime capability. Let the shared exception filter normalize invalid
JSON and unexpected failures.

For v2 history and evidence, accept only `cursor` and `limit`, and return
`next_cursor` only when more records exist. For v2 run streams, accept
`cursor` or `Last-Event-ID`; emit an ID-free `stream_opened` metadata event
before runtime events, preserving runtime event IDs. V1 keeps its existing
aliases. Do not introduce offset
`page`, `pageSize`, total-count, or pagination-envelope fields into an existing
cursor endpoint without a versioned contract change.

When adding or changing a public response, update the response DTO/mapper,
controller, HTTP contract test, and every known client together. Test the
success status/body, relevant validation or business failure status/body,
owner isolation, and—when work is asynchronous—the `202` admission followed
by status or SSE completion.

## Error-code vocabulary

`ApiError` and `ApiExceptionFilter` define the current error boundary. An
error response is a lower-snake-case string in `{ "error": "..." }`, with an
optional safe `detail` or contract-specific field. Do not replace this with
uppercase module/status codes such as `AUTH_401` or `SYS_500`, and do not add a
second global error registry unless a service-wide migration requires one.

Choose a code from the established vocabulary when it fits. For a new code,
name the failed condition rather than its implementation:

| Category | Pattern | Existing examples | Typical status |
| --- | --- | --- | --- |
| Invalid input | `invalid_<subject>` | `invalid_turn`, `invalid_pagination`, `invalid_workspace_path` | `400` |
| Missing required identity or input | `missing_<subject>` | `missing_caller_id` | `401` for authentication, otherwise `400` |
| Missing resource | `<resource>_not_found` | `run_not_found`, `agent_manifest_not_found` | `404` |
| Access denied | `<subject>_forbidden` or established access code | `permission_denied`, `agent_manifest_forbidden` | `403` |
| State conflict | `<resource>_busy`, `<resource>_closed`, or `<subject>_conflict` | `session_busy`, `room_closed`, `agent_name_conflict` | `409` |
| Optional capability unavailable | `<capability>_not_configured` or `<capability>_unavailable` | `runtime_not_configured`, `mcp_server_unavailable` | `503` |
| Payload limit | `payload_too_large` or resource-specific established code | `payload_too_large`, `file_too_large` | `413` |
| Unexpected failure | `internal_error` | `internal_error` | `500` |

Business validation and lifecycle conflicts are expected client-visible
failures in this service. Return the applicable `4xx` status and stable error
code; do not send `200 OK` with a false-success payload. The shared exception
filter owns malformed JSON (`invalid_json`), oversized payloads
(`payload_too_large`), and unhandled failures (`internal_error`). Controllers
must not expose raw provider, database, filesystem, secret, token, or stack
errors through `detail`.

Every new public error code needs a focused HTTP contract test for its status
and response body. Preserve the code once released. If it is renamed or
removed, treat that as a client-facing API migration and update all callers,
documentation, and compatibility tests together.

## Testing

Use the existing request harness and test exact responses. For stream changes,
cover initial replay, live events, terminal events, cursor replay, keepalive,
disconnect, and owner isolation. Run:

```bash
npm test -- src/tests/presentation/http/<relevant-test>.test.ts
npm run test:phase-3
npm run test:architecture
```
