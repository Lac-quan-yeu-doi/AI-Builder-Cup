# Celesnity Minder Agent API v2 Consumer Migration Design

## Goal

Move every Minder Agent HTTP call made by `celesnity-core` and `celesnity-web`
to `/api/v2`, using their existing client and repository structure. Keep
Minder Agent's `/api/v1` compatibility API available for other callers.

## Scope

- Migrate all direct Minder Agent business API calls in Core and Web, including
  chat runs and events, sessions, skills, manifests, governance, MCP, workspace,
  run status and files, reports, approvals, room operations, and webhook
  admission.
- Update the existing upstream URL configuration: Core's `MINDER_AGENT_URL`
  and Web's server-side `AGENT_API_URL` will resolve to the Minder Agent
  `/api/v2` base. Keep Web's browser-facing same-origin `/api/agent` proxy and
  `NEXT_PUBLIC_AGENT_API_URL` unchanged.
- Add a `/api/v2/healthz` operational alias in Minder Agent because Web's health
  check is also sent through its configured Agent API base. Keep existing root
  and v1 health aliases.
- Leave Core's own `/api/v1` API, its generated OpenAPI types, and its
  `rooms/:roomId/agent-runs` endpoints unchanged; those are Core contracts, not
  Minder Agent requests.
- Preserve both existing uncommitted changes in Core and Web; they are not part
  of this migration.

## Direct-client approach

Continue using the existing `AgentApi*` repositories in Web and HTTP clients in
Core. Do not add a generated client, shared package, proxy layer, or new generic
transport abstraction. Keep DTO mapping within its current infrastructure
boundaries and use Minder Agent's maintained OpenAPI YAML as the source of truth
for the public v2 contract.

## Repository deliverables

This is a cross-repository migration. The implementation must include direct
source/configuration changes in both consumer repositories, not only a Minder
Agent contract update:

| Repository | Required changes |
| --- | --- |
| `celesnity-web` | Migrate Agent repositories and SSE consumers; update the upstream `AGENT_API_URL` examples/defaults and dev/prod configuration; keep the browser-facing `/api/agent` proxy URL stable. |
| `celesnity-core` | Migrate Agent HTTP clients and URL normalization; update `MINDER_AGENT_URL` examples and dev/prod configuration; preserve its own public `/api/v1` API. |
| `minder-agent` | Add the v2 health alias required by the Web health check and update the maintained OpenAPI contract. Keep existing v1 routes operational. |

The design document lives in `minder-agent` because it owns the Minder Agent
HTTP contract. Its location does not narrow the implementation scope above.

## Endpoint changes

### Web

- Change `POST /turns/blocking` to `POST /runs` with `wait_ms`; map both the
  terminal `200` response and the still-running `202` response to the existing
  chart suggestion behavior.
- Change `GET /sessions?key=...` to
  `GET /sessions/{encodedSessionKey}`.
- Change run-event resumption from `from` to v2 `cursor` and room-event
  resumption from `after_seq` to v2 `cursor` or `Last-Event-ID`. Treat
  `stream_opened` as connection metadata, not a runtime/chat event, and resume
  using the last runtime event ID. Omit the v1 `include=deltas` query because
  the v2 room stream rejects unsupported query keys and emits runtime events by default.
- Change run-trace pagination from `after_seq` to `cursor`; keep using
  `next_cursor` returned by the API.
- Change governance validation to
  `POST /agent-manifests/governance/validate`.
- Move all other existing Agent repository calls to the v2 base. Their route
  suffixes are already supported by v2.

### Core

- Change webhook admission from `POST /webhooks/{source}` to
  `POST /webhooks/{source}/runs`.
- Move existing Agent manifest, skills, run status/files, session transcript,
  and room workspace clients to the v2 base. Their route suffixes are already
  supported by v2.
- Keep Agent request authentication, caller identity, delivery IDs, owner
  scoping, and response mapping intact.

## Configuration and documentation

Update Core's URL normalization, environment examples, and dev/prod deployment
configuration to `/api/v2`. Update Web's local environment defaults, examples,
and dev/prod deployment configuration to `/api/v2`. Update only documentation
that describes these consumers' Minder Agent URLs; references to Core's own
`/api/v1` routes remain as written.

## Compatibility and errors

Minder Agent continues serving v1 and v2 concurrently. The consumers switch to
v2 without a compatibility fallback to v1. Preserve existing owner/caller
headers and use the v2 response/error contract, including `X-Request-Id` and
`request_id` when supplied by Minder Agent. Do not expose transport DTOs beyond
the existing repository boundaries.

## Verification boundaries

Check changed client and configuration paths against
`docs/api/openapi/minder-agent.yaml`, then use each repository's existing
typecheck/build and deployment-render checks. No test additions or test runs
are part of this design request.

## Out of scope

- Removing or changing Minder Agent v1 routes.
- Migrating Celesnity Core's public API to v2.
- Generating or publishing a shared Agent client package.
- Changing Web's browser-facing same-origin proxy URL.
- Changing runtime, authorization, persistence, event payload, or room behavior
  beyond the transport adaptations required by v2.
