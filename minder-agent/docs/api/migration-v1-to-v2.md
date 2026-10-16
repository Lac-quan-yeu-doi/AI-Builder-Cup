# HTTP API v1 to v2 migration

Use `/api/v2` for new clients. `/api/v1` is deprecated and remains supported with its existing paths, status codes, JSON bodies, and event replay behavior. Unchanged resources keep their route suffix under `/api/v2` (agents, manifests, approvals, rooms, room webhooks, workspace, MCP, skills, catalog, run status, evidence, reports, files, validation, and governance reads).

## Changed routes

| v1 | v2 | Change |
| --- | --- | --- |
| `POST /api/v1/turns` | `POST /api/v2/runs` | Starts a run; `202` returns a v2 `events_url` and `Content-Location`. |
| `POST /api/v1/turns/blocking` | `POST /api/v2/runs` with `wait_ms` in the JSON body | Returns `200` with the terminal run when it finishes before the deadline, or the normal `202` admission. |
| `GET /api/v1/sessions?key=<session-key>` | `GET /api/v2/sessions/:sessionKey` | URL-encode the session key as a path segment. |
| `POST /api/v1/client-tool-results` | `POST /api/v2/sessions/:sessionKey/tool-results` | Move `session_key` to the path. An optional body `session_key` must match it. |
| `POST /api/v1/webhooks/:source` | `POST /api/v2/webhooks/:source/runs` | Same webhook admission and optional `X-Delivery-Id` deduplication; accepted responses point to v2 events. |
| `POST /api/v1/agent-manifests/validate/governance` | `POST /api/v2/agent-manifests/governance/validate` | Path is reordered; validation returns `200 OK` because it does not create a resource. |
| `GET /api/v1/runs/:runId/events` | `GET /api/v2/runs/:runId/events?cursor=<event-id>` | Use `cursor` or `Last-Event-ID` to resume; v2 rejects `after_seq` and `from`. |

Agent configuration request and response fields in v2 use snake case (for
example, `display_name`, `tool_allowlist`, and `execution_strategy`). The v1
agent configuration body keeps its existing camel case fields. Creating a
skill at `POST /api/v2/skills` returns `409 skill_name_conflict` when that
name already exists; use `PUT /api/v2/skills/:name` to replace it. V1 keeps its
existing behavior.

For v2 run trace, files, and governance evidence pages, send only `cursor` and `limit`; the response includes `next_cursor` when another page exists. V2 room event streams resume with `cursor` or `Last-Event-ID`. Existing v1 query aliases remain available where supported on v1 routes. V2 returns `400` (`invalid_cursor` or `invalid_pagination`) for unsupported query keys.

## Correlation and errors

Optionally send `X-Request-Id`; the server returns `X-Request-Id` on every response. If it is absent or invalid, the server generates one. V2 success admission responses (`202` accepted, terminal `200`, and duplicate-delivery `200`) include `request_id` matching that response header. V2 JSON errors also include a lower snake case `error` and matching `request_id`; v1 JSON bodies stay as they are. Keep the response header when reporting failures. A mismatched tool-result session key returns `400` with `session_key_mismatch`; a busy session returns `409` with `session_busy`.

The first v2 run SSE frame is a `stream_opened` event with `request_id`, `run_id`, and the resume `cursor`. Its event ID equals that cursor, so it does not advance replay. Runtime events follow with their existing event IDs and order. Resume using the last event ID.

```text
event: stream_opened
id: 0
data: {"request_id":"example-1","run_id":"<run-id>","cursor":"0"}

event: text
id: 1
data: {"type":"text","data":"..."}
```

## One-page run example

With the service running locally, start a run using the same owner credentials for admission, status, and events:

```http
POST /api/v2/runs HTTP/1.1
Host: 127.0.0.1:8080
Content-Type: application/json
X-Caller-Id: demo-user
X-Request-Id: example-1

{"session_key":"chat:demo","input":"Summarize the repository"}
```

```http
HTTP/1.1 202 Accepted
X-Request-Id: example-1
Content-Location: /api/v2/runs/<run-id>
Content-Type: application/json

{"run_id":"<run-id>","session_id":"<session-id>","events_url":"/api/v2/runs/<run-id>/events","request_id":"example-1"}
```

Read `GET /api/v2/runs/<run-id>/status`, or connect to the returned `events_url?cursor=0`. Send the same owner credentials on follow-up requests. Add `wait_ms` (an integer from 0 to 60000) to the request body when the client can wait for a terminal `200`; a still-active run returns the `202` admission shown above.

Local Swagger UI: `http://127.0.0.1:8080/api/docs`; JSON: `http://127.0.0.1:8080/api/docs/openapi.json`. The exported contract is [minder-agent.yaml](openapi/minder-agent.yaml).
