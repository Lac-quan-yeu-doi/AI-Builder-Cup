# API v2 Standardization Design

## Goal

Expose a documented, consistent `/api/v2` HTTP and SSE contract while keeping
`/api/v1` available for existing callers. Both versions use the same runtime,
authorization, persistence, request correlation, and error vocabulary.

## Scope

- Add Nest URI versioning with `/api` as the global prefix and `v1` as the
  default version, preserving each current v1 URL.
- Add the v2 routes used by chat, automation, rooms, approvals, governance,
  evidence, and SSE.
- Add request correlation for every HTTP response and run admission.
- Define one typed HTTP error-code vocabulary at the presentation boundary.
- Serve Swagger UI and its OpenAPI document for v2.
- Export the checked OpenAPI YAML file under `docs/api/openapi/`.
- Mark v1 operations deprecated in documentation. Do not remove v1 in this
  migration.

## Non-goals

- Change agent-loop behavior, run persistence semantics, owner isolation,
  authorization policy, event payloads, or tool execution.
- Remove v1 endpoints or require `celesnity-core` to deploy with v2.
- Add a second runtime coordinator, store, or error-handling path.

## Minimal design decisions

| Decision | Chosen implementation | Reason |
| --- | --- | --- |
| Version boundary | Nest URI versioning | It preserves `/api/v1` and exposes `/api/v2` without a reverse proxy or a second HTTP server. |
| Compatibility | Keep v1 controllers and bodies; mark them deprecated | Existing Core callers continue to work while frontend moves to v2. |
| Shared behavior | Reuse the existing `RunManager`; extract only repeated HTTP request-to-admission mapping | This prevents two lifecycle implementations while avoiding a broad controller rewrite. |
| Correlation durability | Header, admission response, structured logs, and v2 stream-open event | The run ID already links durable events and evidence. A database schema change for a second correlation key is deferred until searches by request ID are a measured need. |
| API documentation | One generated document with v1 and v2 operations | One Swagger UI and export command prevent two specifications from drifting. |
| Error vocabulary | Typed public error code at the shared HTTP boundary | It prevents new spelling drift without a service-wide rewrite of already-correct controller responses. |

## Versioning architecture

`configureHttpApplication()` will configure URI versioning before registering
the API document:

```text
global prefix: /api
default HTTP version: v1
v1 controllers: existing compatibility contract
v2 controllers: canonical contract
```

Existing controllers remain the v1 boundary. V2 controllers exist only where
the canonical path or request shape changes. Routes whose paths and contracts
already meet the standard are registered for both URI versions. A small
presentation-layer run-admission mapper owns the repeated request-to-start
translation so v1 and v2 cannot diverge in owner, context, trigger, or
runtime-start behavior.

The v2 module contains only public transport adaptation. It does not import
Prisma, model providers, workspace storage, or other concrete infrastructure.

## Canonical v2 routes

| Capability | v1 compatibility route | v2 route | Rule |
| --- | --- | --- | --- |
| Start a run | `POST /turns` | `POST /runs` | A run is the admitted resource. |
| Wait for a started run | `POST /turns/blocking` | `POST /runs` with optional `wait_ms` | `202` means still active; `200` contains a terminal run result. |
| Read session by key | `GET /sessions?key={key}` | `GET /sessions/{sessionKey}` | The session key is a member identifier. |
| Submit client tool result | `POST /client-tool-results` | `POST /sessions/{sessionKey}/tool-results` | The result belongs to a session. |
| Automation webhook admission | `POST /webhooks/{source}` | `POST /webhooks/{source}/runs` | A webhook creates or resumes a run. |
| Validate governance | `POST /agent-manifests/validate/governance` | `POST /agent-manifests/governance/validate` | The action follows its governance resource. |
| Restore an agent revision | `POST /agents/{id}/rollback` | `POST /agents/{agentId}/rollback` | The public path is unchanged; the named Nest parameter is precise. |
| Run trace and files | mixed `cursor` / `after_seq` | `?cursor={opaque}&limit={n}` | Cursor pagination only. |
| Run and room SSE | `from` / `after_seq` / `Last-Event-ID` | `Last-Event-ID`, or `?cursor={opaque}` on first connection | Event IDs remain the replay authority. |

V2 paths use lowercase plural nouns, named camel-case Nest parameters, and a
lowercase kebab-case action only where normal CRUD cannot describe the
operation. Response fields remain snake case.

### V2 admission behavior

`POST /api/v2/runs` accepts the current turn fields plus optional `wait_ms`.
`wait_ms` is an integer from `0` through `60_000`.

| Outcome | Status | Required response fields |
| --- | --- | --- |
| Run admitted and still active at the deadline | `202` | `run_id`, `session_id`, `events_url`, `request_id` |
| Run reached a terminal state before the deadline | `200` | `run_id`, `session_id`, `status`, `response_text`, `error`, `request_id` |
| Duplicate webhook delivery | `200` | `status: "duplicate_delivery"`, `request_id` |
| Active session or room conflict | `409` | `error`, `active_run_id` when available, `request_id` |

`events_url` always contains the public v2 path. The v1 admission response
keeps its existing fields and URL version.

## Request correlation

An HTTP middleware creates an immutable request context for each request.

1. Accept an inbound `X-Request-Id` when it is a trimmed printable token no
   longer than 128 characters and contains no control characters.
2. Generate a UUID when the header is absent or invalid.
3. Set `X-Request-Id` on every HTTP response, including JSON, file downloads,
   error responses, and SSE handshakes.
4. Add `X-Request-Id` to the CORS allowed and exposed headers.
5. Pass the value as `requestId` through all run admission paths and include
   it in structured admission logs.

V2 admission responses include `request_id`. V2 SSE emits one non-persisted
`stream_opened` event before replay, with `request_id`, `run_id`, and the
effective cursor. Persisted runtime events retain their current event IDs and
payloads; the durable `run_id` remains the correlation key for evidence.

The context is read from the Nest request rather than repeatedly reading raw
headers in controllers. Existing manifest and room audit logging uses this
same value.

## Error contract

The API retains lower-snake-case errors and normal HTTP status meanings. V2
errors have this body:

```json
{
  "error": "session_busy",
  "request_id": "a UUID",
  "detail": "optional safe client message"
}
```

`detail` remains optional and cannot expose provider, database, filesystem,
token, secret, or stack information. V1 receives the correlation header and
keeps its documented JSON error body. V2 adds `request_id` to its JSON error
body.

`ApiErrorCode` is a typed union constructed from the existing public codes.
`ApiError` and `ApiExceptionFilter` remain the single error boundary. The
migration replaces controller-local error literals with the typed vocabulary;
it does not introduce status-prefixed or uppercase codes.

## Swagger and OpenAPI

Add `@nestjs/swagger` and expose one document containing the compatibility and
canonical contracts:

| Artifact | Location |
| --- | --- |
| Swagger UI | `/api/docs` |
| Runtime OpenAPI JSON | `/api/docs/openapi.json` |
| Checked generated YAML | `docs/api/openapi/minder-agent.yaml` |
| Export command | `npm run openapi:export` |

The document uses explicit public DTO and response models. Each operation
declares its tag, caller authentication, request schema, success statuses,
error statuses, `X-Request-Id` response header, cursor parameters where used,
and SSE replay behavior where relevant. V1 operations appear as deprecated
compatibility entries; v2 operations use the canonical tags and descriptions.

The document defines reusable components for owner authentication,
`X-Request-Id`, `ApiErrorV2`, admission responses, cursor parameters, and
SSE replay instructions. It does not claim that Swagger UI can execute SSE;
the stream operation documents the connection and event contract.

`openapi:export` boots the application with controlled in-memory composition,
creates the document after URI versioning is configured, writes the YAML, and
does not contact a developer database or provider. A contract test asserts the
served JSON and checked YAML describe the same v1 and v2 route set.

## Security and lifecycle invariants

- Resolve and authorize the owner before every run, session, room, file,
  evidence, approval, or event-stream operation.
- Preserve `202 Accepted` as run admission, replay ordering, terminal events,
  event IDs, cursor behavior, and subscriber cleanup.
- Apply correlation context without treating a caller-supplied request ID as
  authorization or idempotency.
- Keep current webhook assertions, automation organization checks, and owner
  isolation intact for both versions.

## Verification

The implementation adds focused tests for:

1. v1 URL preservation and v2 canonical route behavior.
2. Shared v1/v2 admission mapping, including owner and organization isolation.
3. Generated and supplied `X-Request-Id` values on JSON, errors, downloads,
   and SSE handshakes.
4. Error body status, code, safe detail, and request ID.
5. V2 cursor and SSE replay semantics.
6. Swagger UI, OpenAPI JSON, exported YAML, schemas, deprecation markers, and
   documented v1 and v2 route set.

Run focused presentation tests first, then `npm run test:architecture`,
`npm run check`, `npm run lint`, and the relevant build/OpenAPI export check.

## Delivery sequence

1. Configure URI versioning and request correlation, with tests proving the
   existing v1 routes remain reachable.
2. Add v2 admission, session, tool-result, webhook, governance, cursor, and
   SSE adapters. Each route delegates to the existing `RunManager` behavior.
3. Add typed v2 response/error DTOs and focused HTTP/SSE contract tests.
4. Add Swagger decorators, document setup, and the controlled export command.
5. Export the checked YAML, run the verification ladder, and hand the v2 base
   URL and route table to frontend consumers.

The migration intentionally does not add a request-ID database column, a new
event store, a generic API wrapper, a second error registry, a reverse proxy,
or a second agent runtime. Add durable request-ID search only when support
work demonstrates that the existing run ID and structured admission logs are
insufficient.

## Follow-up persistence phase

After the API v2 contract is stable, the separate
[`v2 compact database design`](2026-09-25-v2-compact-database-design.md)
consolidates duplicate evidence storage for both API versions. It is not part
of this HTTP standardization migration.
