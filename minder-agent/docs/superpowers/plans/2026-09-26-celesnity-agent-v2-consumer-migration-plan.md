# Celesnity Minder Agent API v2 Consumer Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all Minder Agent calls from Celesnity Core and Web to `/api/v2`, while keeping Minder Agent v1 available to other callers.

**Architecture:** Keep the existing direct HTTP clients and Web repositories. Change the few route/body/cursor contracts that differ in v2, point each upstream base URL at `/api/v2`, and add the v2 health alias needed by Web. Core's own public `/api/v1` API remains unchanged.

**Tech Stack:** TypeScript, NestJS, Next.js, fetch, Kubernetes Kustomize, Minder Agent OpenAPI.

**Spec:** [../specs/2026-09-25-celesnity-agent-v2-consumer-migration-design.md](../specs/2026-09-25-celesnity-agent-v2-consumer-migration-design.md)

## Global Constraints

- Move every Minder Agent HTTP call made by `celesnity-core` and `celesnity-web` to `/api/v2`.
- Keep Minder Agent's `/api/v1` compatibility API available for other callers.
- Continue using the existing `AgentApi*` repositories in Web and HTTP clients in Core.
- Keep Web's browser-facing same-origin `/api/agent` proxy and `NEXT_PUBLIC_AGENT_API_URL` unchanged.
- Leave Core's own `/api/v1` API and its generated OpenAPI types unchanged.
- Preserve the existing uncommitted changes in Core and Web.
- Do not add or run tests as part of this request.

---

## File Map

### `minder-agent`

- `src/presentation/http/operations/operations.controller.ts` — expose v2 health response using the existing health result and classify it as operational.
- `src/bootstrap/http-main.ts` — exclude the explicit `/api/v2/healthz` alias from the global prefix, matching existing explicit versioned operational routes.
- `src/presentation/http/openapi/document.ts` — do not mark the health alias as owner-authenticated.
- `docs/api/openapi/minder-agent.yaml` — generated public OpenAPI snapshot; update through the export command.

### `celesnity-core`

- `src/infrastructure/configuration/environment.ts` — normalize `MINDER_AGENT_URL` to exactly one `/api/v2` suffix.
- `src/infrastructure/http/automation/agent-webhook.client.ts` — use the v2 webhook run-admission path.
- `src/infrastructure/http/automation-workflow/agent-run-files.client.ts` — existing run file paths use the v2 base.
- `src/infrastructure/http/automation-workflow/agent-run-status.client.ts` — existing run status path uses the v2 base.
- `src/infrastructure/http/automation-workflow/agent-transcript.client.ts` — existing session transcript path uses the v2 base.
- `src/infrastructure/http/automation-workflow/agent-workspace-tree.client.ts` — existing room workspace paths use the v2 base.
- `src/infrastructure/http/skill/minder-agent-skill.client.ts` — existing skill paths use the v2 base.
- `.env.example`, `k8s/overlays/gcp/dev/config/core-config.yaml`, and `k8s/overlays/gcp/prod/config/core-config.yaml` — set the Minder Agent upstream URL to `/api/v2`.
- Existing contract assertions in `src/tests/infrastructure/configuration/minder-agent-environment.spec.ts`, `src/tests/infrastructure/http/automation/agent-webhook.client.spec.ts`, and `src/tests/infrastructure/http/minder-agent-skill.client.spec.ts` — update only expectations that encode the migrated URL or route.

### `celesnity-web`

- `src/infrastructure/repositories/agent-api-chat.repository.ts` — change session lookup, event cursors, and run trace pagination.
- `src/infrastructure/repositories/agent-api-chart-encoding-suggestion.repository.ts` — use v2 blocking run admission and response fields.
- `src/infrastructure/repositories/agent-api-governance.repository.ts` — use the canonical governance validation path.
- `app/_components/chat/parse-sse-stream.ts` — ignore the ID-free `stream_opened` metadata event as a chat/runtime event.
- `app/_components/chat/use-resilient-stream.ts` — describe the reconnect token as a v2 cursor/event ID.
- `.env.example`, `scripts/local-environment.mjs`, `playwright.config.ts`, and dev/prod `web-config.yaml` — set server-side `AGENT_API_URL` to `/api/v2`; keep `NEXT_PUBLIC_AGENT_API_URL` as `/api/agent`.
- Existing contract assertions in `tests/unit/infrastructure/repositories/agent-api-chat.repository.test.ts`, `tests/unit/infrastructure/repositories/agent-api-chart-encoding-suggestion.repository.test.ts`, and `tests/unit/app/agent-api-route.test.ts` — update only expectations and fixtures that encode the migrated contract.

## Tasks

### Task 1: Add the Minder Agent v2 health alias

**Files:**
- Modify: `minder-agent/src/presentation/http/operations/operations.controller.ts`
- Modify: `minder-agent/src/bootstrap/http-main.ts`
- Modify: `minder-agent/src/presentation/http/openapi/document.ts`
- Regenerate: `minder-agent/docs/api/openapi/minder-agent.yaml`

**Interfaces:**
- Consumes: existing `OperationsController.health()` response `{ status: "ok" }`.
- Produces: `GET /api/v2/healthz`, returning the same body as root and v1 health aliases.

- [ ] Add a `GET api/v2/healthz` operational handler that delegates to the existing `health()` method.
- [ ] Add `/api/v2/healthz` to the `OPERATIONAL_ROUTES` set so the operations middleware continues to exclude it from unmatched-route metrics.
- [ ] Add `api/v2/healthz` to `setGlobalPrefix(..., { exclude })` so the explicit path is not prefixed twice.
- [ ] Exempt `/api/v2/healthz` from the generated owner security requirement in `createOpenApiDocument()`.
- [ ] Regenerate the OpenAPI file from source with `npm run openapi:export` in `minder-agent` and confirm `/api/v2/healthz` is present.
- [ ] Run `npm run build` in `minder-agent`.

### Task 2: Migrate Core's direct Minder Agent clients and URL

**Files:**
- Modify: `celesnity-core/src/infrastructure/configuration/environment.ts`
- Modify: `celesnity-core/src/infrastructure/http/automation/agent-webhook.client.ts`
- Modify: the five Core Agent HTTP clients listed in the File Map
- Modify: Core `.env.example` and the dev/prod `core-config.yaml` files

**Interfaces:**
- Consumes: Minder Agent v2 routes documented by `minder-agent/docs/api/openapi/minder-agent.yaml`.
- Produces: every Core Agent client receives a base ending in `/api/v2`; webhook admission posts to `/webhooks/{source}/runs`.

- [ ] Change URL normalization to replace a trailing v1 or v2 prefix with exactly `/api/v2`; for a bare origin append `/api/v2`.

```ts
const origin = value.replace(/\/api\/v[12]$/u, "");
return `${origin}/api/v2`;
```

- [ ] Change the webhook URL from `/webhooks/${request.source}` to `/webhooks/${request.source}/runs`; preserve the body, delivery ID, and authentication headers.
- [ ] Update `.env.example` and both Core Kubernetes config maps to use the `/api/v2` base.
- [ ] Confirm no client bypasses normalized `MINDER_AGENT_URL`; use `rg -n 'MINDER_AGENT_URL|/webhooks/' src/infrastructure` in `celesnity-core`.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm run build` in `celesnity-core`.
- [ ] Render both Core overlays with `kubectl kustomize k8s/overlays/gcp/dev` and `kubectl kustomize k8s/overlays/gcp/prod`; confirm the rendered Minder Agent URLs end in `/api/v2`.

### Task 3: Migrate Web's v2 route and SSE behavior

**Files:**
- Modify: `celesnity-web/src/infrastructure/repositories/agent-api-chat.repository.ts`
- Modify: `celesnity-web/src/infrastructure/repositories/agent-api-chart-encoding-suggestion.repository.ts`
- Modify: `celesnity-web/src/infrastructure/repositories/agent-api-governance.repository.ts`
- Modify: `celesnity-web/app/_components/chat/parse-sse-stream.ts`
- Modify: `celesnity-web/app/_components/chat/use-resilient-stream.ts`

**Interfaces:**
- Consumes: the existing `GeneratedApiTransport`, the current Chat/Chart/Governance application ports, and Minder Agent v2 request/response contracts.
- Produces: existing application entities and chat behavior backed by v2 requests; no v2 transport DTO escapes its repository.

- [ ] Change session lookup to `/sessions/${encodeURIComponent(sessionKey)}`.
- [ ] Change run-event `from` to `cursor`, room-event `after_seq` to `cursor`, and run-trace `after_seq` to `cursor`; preserve `limit=500` for trace pagination. Omit the v1-only `include=deltas` room-event query because v2 rejects it.
- [ ] Change governance validation to `/agent-manifests/governance/validate`.
- [ ] Change chart inference admission to `POST /runs` with `wait_ms: 60000`; read terminal text from `response_text`, and preserve the current error behavior if the run returns `202` without a completed result.

```ts
body: JSON.stringify({
  session_key: `chart-encodings-${crypto.randomUUID()}`,
  agent: AGENT_NAME,
  input: buildPrompt(input),
  wait_ms: 60_000,
})
```

- [ ] In the SSE parser, do not pass `stream_opened` to chat/runtime event callbacks; keep runtime event IDs as the reconnect cursor.
- [ ] Update the reconnect-stream comments from `after_seq` to v2 cursor/event ID terminology; retain the current string token storage because v2 cursors are opaque strings.
- [ ] Confirm all remaining Web Agent repository paths are unchanged suffixes supported by v2; do not change Core API paths that also contain `/api/v1`.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm run build` in `celesnity-web`.

### Task 4: Point Web's upstream configuration at v2

**Files:**
- Modify: `celesnity-web/.env.example`
- Modify: `celesnity-web/scripts/local-environment.mjs`
- Modify: `celesnity-web/playwright.config.ts`
- Modify: `celesnity-web/k8s/overlays/gcp/dev/config/web-config.yaml`
- Modify: `celesnity-web/k8s/overlays/gcp/prod/config/web-config.yaml`

**Interfaces:**
- Consumes: server-side `AGENT_API_URL` consumed by the existing `/api/agent` proxy.
- Produces: Minder Agent requests proxied to `/api/v2`, while browser code continues using `/api/agent`.

- [ ] Update only Agent upstream values from `/api/v1` to `/api/v2`; leave `CORE_API_URL` on `/api/v1`.
- [ ] Update the `.env.example` comment to identify `/api/v2` as the configured Minder Agent base.
- [ ] Keep `NEXT_PUBLIC_AGENT_API_URL`, `cloudbuild.yaml`'s `_AGENT_API_URL`, and the proxy route shape unchanged.
- [ ] Update the existing Agent proxy URL expectation and chart-inference permission case in `tests/unit/app/agent-api-route.test.ts` to use the v2 base and `/runs` path.
- [ ] Render both Web overlays with `kubectl kustomize k8s/overlays/gcp/dev` and `kubectl kustomize k8s/overlays/gcp/prod`; confirm `AGENT_API_URL` ends in `/api/v2` and `CORE_API_URL` still ends in `/api/v1`.

### Task 5: Cross-repository final review

**Files:**
- Review only: all files listed above plus `minder-agent/docs/api/openapi/minder-agent.yaml`

**Interfaces:**
- Consumes: completed Task 1–4 changes.
- Produces: verified route/config coverage for all direct Minder Agent calls.

- [ ] Search both consumers for direct Minder Agent URLs and old changed routes; distinguish Agent calls from Core, Kubernetes API, and other `/api/v1` calls.
- [ ] Confirm all Agent upstream configuration values use `/api/v2`, while Core API configuration remains `/api/v1` and browser Agent URL remains `/api/agent`.
- [ ] Confirm the Minder Agent OpenAPI YAML contains the health alias and the existing v2 route contracts used by both consumers.
- [ ] Inspect `git status --short` separately in all three repositories; keep the pre-existing Web proxy and Core controller changes out of this task's scope.

## Execution Notes

- Do not replace every `/api/v1` string globally. Core's own HTTP API, Kubernetes endpoints, and compatibility references are outside this Agent-client migration.
- Do not add fallback retries against v1. The Minder Agent server already supports both versions concurrently.
- Do not commit, push, merge, deploy, or edit the existing unrelated Core/Web changes without explicit user authorization.
- Do not add test cases or run tests. Update existing assertions only where their expected URL, path, query, or response shape changes under v2.
