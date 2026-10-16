# API v2 Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a versioned `/api/v2` contract with request correlation,
canonical routes, Swagger UI, and exported OpenAPI documentation while keeping
every `/api/v1` route available.

**Architecture:** Nest URI versioning changes the current global prefix from
`/api/v1` to `/api` and makes v1 the default. Existing controllers retain v1;
only routes whose public shape changes receive focused v2 adapters. Both
versions call the existing `RunManager`, authorization guard, runtime store,
and event hub.

**Tech Stack:** TypeScript 5.9, NestJS 11, Express adapter, class-validator,
Vitest, `@nestjs/swagger`, and the already-installed `yaml` package.

**Spec:** `docs/superpowers/specs/2026-09-25-api-v2-standardization-design.md`

## Global Constraints

- Preserve v1 paths, statuses, JSON bodies, run lifecycle, owner isolation,
  event IDs, replay behavior, and Core automation calls.
- V2 owns canonical paths and may add `request_id` fields; v1 receives the
  correlation response header only.
- Reuse `RunManager`; do not add a second runtime, persistence path, proxy,
  event store, or request-ID database column.
- Error codes remain lower snake case. Add new v2 codes only through the shared
  HTTP error helper and cover them with an HTTP contract test.
- Do not commit, push, create a branch, deploy, or change frontend/Core code.
- Use two-space TypeScript formatting, ESM `.js` local specifiers, immutable
  public DTO fields, and the repository's controlled test composition.

---

### Task 1: Enable URI versioning and request correlation

**Files:**
- Create: `src/presentation/http/common/request/request-context.ts`
- Create: `src/presentation/http/common/request/request-context.middleware.ts`
- Test: `src/tests/presentation/http/request-context.middleware.test.ts`
- Modify: `src/bootstrap/http-main.ts`
- Modify: `src/modules/http.module.ts`
- Modify: `src/presentation/http/common/errors/api-exception.filter.ts`
- Modify: `src/tests/presentation/http/api-exception.filter.test.ts`
- Modify: `src/tests/presentation/http/nest-http-adapter.test.ts`

**Consumes:** `configureHttpApplication()`, `ApiExceptionFilter`, and the
Express request/response passed to Nest middleware.

**Produces:** A request context attached to each HTTP request, a stable
`X-Request-Id` response header, `/api/v1` compatibility, and URI-versioned
route registration for v2 controllers.

- [x] **Step 1: Write failing middleware and adapter tests**

Create tests that prove all four cases:

```ts
expect(response.headers["x-request-id"]).toBe("frontend-request-1");
expect(generated.headers["x-request-id"]).toMatch(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
);
expect(error.headers["x-request-id"]).toBeDefined();
expect(await request(port, "/api/v1/not-found")).toMatchObject({ status: 404 });
```

The test host for `ApiExceptionFilter` must expose both `getRequest()` and
`getResponse()` so v2 errors can read the request context.

- [x] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npm test -- src/tests/presentation/http/request-context.middleware.test.ts src/tests/presentation/http/api-exception.filter.test.ts src/tests/presentation/http/nest-http-adapter.test.ts
```

Expected: FAIL because no request context, generated header, or URI versioning
exists.

- [x] **Step 3: Add the smallest request-context implementation**

In `request-context.ts`, define an Express-safe symbol key and helpers:

```ts
export interface RequestContext {
  readonly requestId: string;
  readonly apiVersion: "1" | "2" | undefined;
}

export function requestContext(request: object): RequestContext | undefined;
export function requestId(request: object): string | undefined;
```

The middleware accepts a trimmed printable `X-Request-Id` of at most 128
characters, otherwise uses `randomUUID()`. It stores the immutable context on
the request and calls `response.setHeader("x-request-id", requestId)` before
`next()`.

Register the middleware through `HttpModule.configure()`. In
`configureHttpApplication()`, call:

```ts
app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
app.setGlobalPrefix("api", { exclude: /* existing operational paths */ });
```

Keep the existing health/metrics exclusions reachable at their current paths.
Add `x-request-id` to `allowedHeaders` and set
`exposedHeaders: ["x-request-id"]` in CORS.

`ApiExceptionFilter` reads the context. For a v2 request, it adds a generated
or supplied `request_id` to its normalized JSON error body; for v1 it preserves
the existing body exactly. The header remains present for both versions.

- [x] **Step 4: Run focused tests and inspect both versions**

Run the Step 2 command. Verify v1 URLs still pass, v2 error bodies carry
`request_id`, and every response has `X-Request-Id`.

---

### Task 2: Extract shared run admission mapping without changing v1 behavior

**Files:**
- Create: `src/presentation/http/runs/run-admission.service.ts`
- Test: `src/tests/presentation/http/run-admission.service.test.ts`
- Modify: `src/presentation/http/runs/turns.controller.ts`
- Modify: `src/presentation/http/rooms/rooms.controller.ts`
- Modify: `src/modules/http.module.ts`

**Consumes:** `RunManager.start()`, `parseRunContext()`, authenticated
`OwnerContext`, `TurnDto`, `ClientToolResultDto`, and request context.

**Produces:** One presentation-layer service for direct chat, webhook, client
tool-result, and room admission that passes owner, organization context,
manifest owner, delivery ID, and request ID consistently to the existing
runtime.

- [x] **Step 1: Characterize existing v1 admission behavior**

Write tests that use a fake `RunManager` and assert this exact input passed to
`start()`:

```ts
expect(runtime.start).toHaveBeenCalledWith(expect.objectContaining({
  key: "chat:one",
  owner: "alice",
  mode: "interactive",
  trigger: { source: "chat" },
  requestId: "frontend-request-1",
}));
```

Add parallel cases for `webhook:<source>`, `client_tool`, and `room`. Preserve
the current authenticated organization overwrite and verified automation
delegation behavior.

- [x] **Step 2: Run the characterization tests and verify failure**

Run:

```bash
npm test -- src/tests/presentation/http/run-admission.service.test.ts src/tests/presentation/http/http.test.ts src/tests/presentation/http/rooms-http.test.ts
```

Expected: FAIL because the shared admission service and `requestId` runtime
input do not yet exist.

- [x] **Step 3: Add a narrow shared admission service**

Add optional `requestId?: string` to `StartTurnInput`. Keep it at the
application contract only; do not add it to `RuntimeStore.createRun()`, Prisma,
or database schema. `RuntimeRunManager.start()` records it in its existing
structured admission debug log and continues its current run/event behavior.

Move the repeated mapping from `TurnsNestController.start()` into
`RunAdmissionService`. The service accepts already-validated presentation
values and calls `RunManager.start()` once. It maps expected
`RuntimeStoreError` cases to the same `ApiError` status/code currently exposed
by v1. Controllers keep route-specific validation and response formatting.

Replace the room controller's direct request-header read with the common
request context so its existing debug log obtains the same request ID.

- [x] **Step 4: Run the characterization and regression tests**

Run the Step 2 command. Confirm v1 body/status assertions remain unchanged and
the only added observable v1 behavior is `X-Request-Id`.

---

### Task 3: Add canonical v2 run, session, webhook, governance, and SSE routes

**Files:**
- Create: `src/presentation/http/v2/runs.controller.ts`
- Create: `src/presentation/http/v2/events.controller.ts`
- Create: `src/presentation/http/v2/governance.controller.ts`
- Create: `src/presentation/http/v2/contracts.ts`
- Test: `src/tests/presentation/http/v2-http.test.ts`
- Modify: `src/presentation/http/runs/runs.controller.ts`
- Modify: `src/presentation/http/agents/agents.controller.ts`
- Modify: `src/presentation/http/approvals/approvals.controller.ts`
- Modify: `src/presentation/http/rooms/rooms.controller.ts`
- Modify: `src/presentation/http/rooms/room-webhooks.controller.ts`
- Modify: `src/presentation/http/agents/manifests.controller.ts`
- Modify: `src/modules/http.module.ts`

**Consumes:** `RunAdmissionService`, `RunManager`, `OwnerAuthGuard`, existing
run/session/approval/room behavior, and `requestContext()`.

**Produces:** The canonical v2 paths, v2-only admission/error payloads, and a
v2 SSE connection metadata event while v1 routes remain unchanged.

- [x] **Step 1: Write v2 HTTP contract tests before routes**

Add one focused test for every changed route:

```ts
await request(server, "/api/v2/runs", { method: "POST", body: turn });
await request(server, "/api/v2/sessions/chat%3Aone");
await request(server, "/api/v2/sessions/chat%3Aone/tool-results", {
  method: "POST", body: toolResult,
});
await request(server, "/api/v2/webhooks/automation-workflow/runs", {
  method: "POST", headers: { authorization: "Bearer assertion" }, body: webhook,
});
await request(server, "/api/v2/agent-manifests/governance/validate", {
  method: "POST", body: { yaml },
});
```

Assert `202` admission with v2 `events_url`, `200` blocking completion when
`wait_ms` expires after terminal completion, `409` conflict with v2
`request_id`, and rejection of v1-only `after_seq`/`from` cursor aliases.

For v2 SSE, assert the first event is:

```text
event: stream_opened
data: {"request_id":"...","run_id":"...","cursor":"0"}
```

Then assert replayed runtime events preserve their existing IDs and ordering.

- [x] **Step 2: Run the v2 tests and verify failure**

Run:

```bash
npm test -- src/tests/presentation/http/v2-http.test.ts
```

Expected: FAIL with v2 routes unavailable.

- [x] **Step 3: Implement v2 adapters and dual-version unchanged routes**

Register `RunsV2Controller`, `EventsV2Controller`, and
`GovernanceV2Controller` in `HttpModule`. Each uses `@Version("2")`,
`@UseGuards(OwnerAuthGuard)`, and the existing injected ports.

Implement these canonical paths exactly:

```text
POST /api/v2/runs
GET  /api/v2/sessions/:sessionKey
POST /api/v2/sessions/:sessionKey/tool-results
POST /api/v2/webhooks/:source/runs
POST /api/v2/agent-manifests/governance/validate
SSE  /api/v2/runs/:runId/events?cursor=<event-id>
```

`POST /runs` owns optional `wait_ms`; it uses the same admission service and
returns the existing terminal run fields if the run completes before its
deadline. The v2 session tool-result controller takes `sessionKey` from the
path and rejects a body containing a mismatched `session_key`.

For unchanged public resources, add v2 version metadata to the existing
controllers rather than duplicate them. This covers agents, manifests,
approvals, rooms, room webhooks, workspace, MCP, skills, catalog, run status,
evidence, reports, files, validation, and governance reads. Rename only the
Nest parameter from `id` to `agentId` on the v2 rollback handler; the literal
path is still `/agents/:agentId/rollback`.

V2 trace, file, and governance-evidence readers accept only `cursor` and
`limit`. V1 keeps its aliases. V2 room streams accept `cursor` and
`Last-Event-ID`; v1 keeps `from` and `after_seq`.

- [x] **Step 4: Run v2 and existing HTTP tests**

Run:

```bash
npm test -- src/tests/presentation/http/v2-http.test.ts src/tests/presentation/http/http.test.ts src/tests/presentation/http/nest-http-adapter.test.ts src/tests/presentation/http/rooms-http.test.ts
```

Confirm v1 paths stay reachable, v2 has no legacy cursor aliases, and owner
isolation remains covered.

---

### Task 4: Document HTTP errors and v2 DTOs at the shared boundary

**Files:**
- Create: `src/presentation/http/v2/openapi-dtos.ts`
- Modify: `src/presentation/http/common/errors/api-error.ts`
- Modify: `src/presentation/http/common/errors/api-exception.filter.ts`
- Modify: `src/presentation/http/contracts/validation.ts`
- Modify: `src/presentation/http/v2/runs.controller.ts`
- Modify: `src/presentation/http/v2/events.controller.ts`
- Modify: `src/presentation/http/v2/governance.controller.ts`
- Test: `src/tests/presentation/http/v2-error-contract.test.ts`

**Consumes:** Existing lower-snake-case codes, `ApiError`, class-validator DTOs,
and v2 adapters.

**Produces:** Explicit v2 request/response schemas and a safe v2 error body.

- [x] **Step 1: Write failing v2 error and schema tests**

Test an invalid v2 run, missing caller, session conflict, missing run, and
unconfigured runtime. For each response assert a valid lower-snake-case code,
a `request_id` equal to `X-Request-Id`, and no raw exception message. Assert
the v1 equivalent still returns its original body.

- [x] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npm test -- src/tests/presentation/http/v2-error-contract.test.ts
```

Expected: FAIL because v2 response DTOs and version-aware error output are not
complete.

- [x] **Step 3: Add explicit public DTOs and error typing**

Define v2-only classes for `CreateRunRequest`, `SubmitToolResultRequest`,
`StartedRunResponse`, `CompletedRunResponse`, `DuplicateDeliveryResponse`,
`ApiErrorV2Response`, and `StreamOpenedEvent`. Each property uses
class-validator and `@ApiProperty`/`@ApiPropertyOptional` metadata with the
public snake-case spelling.

Make `ApiErrorBody.error` a public lower-snake-case type used by new v2
controllers. Do not create runtime constants or a second registry: the shared
filter remains the one normalization point and existing v1 controller strings
remain behavior-compatible. New v2 codes must be added to the type and the
corresponding test in the same task.

- [x] **Step 4: Run the focused tests**

Run the Step 2 command and the Task 1 exception-filter test. Confirm the v2
body is exact and v1 error snapshots are unchanged.

---

### Task 5: Serve Swagger and export the checked OpenAPI document

**Files:**
- Create: `src/presentation/http/openapi/document.ts`
- Create: `src/bootstrap/openapi-cli.ts`
- Create: `docs/api/openapi/minder-agent.yaml`
- Test: `src/tests/presentation/http/openapi.test.ts`
- Modify: `src/bootstrap/http-main.ts`
- Modify: `src/presentation/http/v2/openapi-dtos.ts`
- Modify: `src/presentation/http/v2/*.controller.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Consumes:** Nest URI versioning, public v1/v2 controllers, v2 DTO metadata,
`Yaml.stringify()`, and controlled `AppModule.register()` composition.

**Produces:** Swagger UI at `/api/docs`, JSON at `/api/docs/openapi.json`, and
a checked YAML snapshot generated from the same document.

- [x] **Step 1: Write failing Swagger/OpenAPI tests**

Test the following observable behavior:

```ts
expect((await request(port, "/api/docs")).status).toBe(200);
const document = await fetch(`http://127.0.0.1:${port}/api/docs/openapi.json`)
  .then((response) => response.json());
expect(document.paths["/api/v2/runs"].post).toBeDefined();
expect(document.paths["/api/v1/turns"].post.deprecated).toBe(true);
expect(document.components.schemas.ApiErrorV2Response).toBeDefined();
```

Read the checked YAML with `yaml.parse()` and assert it has the same sorted
path keys as the served document.

- [x] **Step 2: Run the OpenAPI test and verify failure**

Run:

```bash
npm test -- src/tests/presentation/http/openapi.test.ts
```

Expected: FAIL because Swagger is not installed or configured.

- [x] **Step 3: Add Swagger setup and deterministic export**

Install the compatible Nest package:

```bash
npm install @nestjs/swagger
```

Create a `createOpenApiDocument(app)` factory that builds the title, API
description, `2.0.0` version, owner authentication scheme, tags, response
header component, and controller metadata after URI versioning is configured.
Set `operationIdFactory` to a stable method-and-version name.

Call `SwaggerModule.setup("docs", app, documentFactory, {
  useGlobalPrefix: true,
  jsonDocumentUrl: "docs/openapi.json",
})` in HTTP bootstrap. Mark v1 operations deprecated through their controller
or method decorators; tag v2 operations by resource.

`openapi-cli.ts` creates the controlled application, serializes the factory
output with `YAML.stringify()`, writes
`docs/api/openapi/minder-agent.yaml`, and closes the application in `finally`.
Add this package script:

```json
"openapi:export": "tsx src/bootstrap/openapi-cli.ts"
```

- [x] **Step 4: Export and verify the document**

Run:

```bash
npm run openapi:export
npm test -- src/tests/presentation/http/openapi.test.ts
```

Confirm the checked YAML has no localhost server URL, secret, token, provider
configuration, or developer database data.

---

### Task 6: Update standards and run the focused verification ladder

**Files:**
- Create: `docs/api/migration-v1-to-v2.md`
- Modify: `skills/http-sse-contracts/SKILL.md`
- Modify: `README.md`
- Modify: `docs/api/openapi/minder-agent.yaml`
- Test: `src/tests/presentation/http/v2-http.test.ts`
- Test: `src/tests/presentation/http/openapi.test.ts`

**Consumes:** The exported OpenAPI document and verified v1/v2 contracts.

**Produces:** One frontend/QA migration reference and updated repository-local
rules that require v2 for new clients.

- [x] **Step 1: Document exact migration mapping**

`docs/api/migration-v1-to-v2.md` must list each changed route from Task 3,
the changed query field, v2 error `request_id`, v2 SSE `stream_opened` event,
the Swagger URL, and the rule that v1 is deprecated but supported. Link the
OpenAPI YAML and include a one-page request/response example for
`POST /api/v2/runs`.

Update `skills/http-sse-contracts/SKILL.md` so new endpoints use v2 canonical
paths, `cursor`/`limit`, and the request-correlation rule. Update `README.md`
with local Swagger and OpenAPI export commands.

- [x] **Step 2: Run focused HTTP and document checks**

Run:

```bash
npm test -- src/tests/presentation/http/v2-http.test.ts src/tests/presentation/http/v2-error-contract.test.ts src/tests/presentation/http/openapi.test.ts
git diff --check
```

- [x] **Step 3: Run the required quality gates once**

Run:

```bash
npm run test:architecture
npm run check
npm run lint
npm run build
npm run openapi:export
git diff --check
```

Report focused failures separately from pre-existing failures. Do not run the
full Vitest suite unless a changed gate requires it or the user requests it.

## Follow-up persistence plan

After this API v2 plan passes its contract gates, use the separate
[`v2 compact database plan`](2026-09-25-v2-compact-database-plan.md) for
the database cleanup. It applies one shared storage model to v1 and v2 and
does not change the scope of the HTTP tasks above.
