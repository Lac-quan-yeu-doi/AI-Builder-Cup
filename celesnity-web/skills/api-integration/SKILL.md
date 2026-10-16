---
name: api-integration
description: Use when calling a Core API endpoint, regenerating OpenAPI types, mapping DTOs, translating HTTP errors, or wiring SSE progress streams with polling fallback
---

# Core API Integration

## Overview

All network access lives in `src/infrastructure`. A repository implements an
Application port, reaches the network through the `GeneratedApiTransport` port,
maps DTOs to Entities, and translates transport errors before they cross inward.
Nothing outside `src/infrastructure` may know about DTOs, URLs, or `CoreApiError`.

Requests go **straight from the browser** to the Core API — there is no BFF, no
route handler, and no server action in front of it. Base URL:
`NEXT_PUBLIC_CORE_API_URL`, default `http://localhost:3001/api/v1`
(`src/infrastructure/configuration/public-environment.ts`). `CoreApiClient` sends
`credentials: 'include'` by default, so the Core API must allow the web origin
explicitly in CORS — a wildcard origin will not work.

## Files

```text
src/infrastructure/api/core-api-client.ts        request() + get/post/patch/delete sugar, CoreApiError
src/infrastructure/api/generated-api.ts          GeneratedApiTransport port + CoreApiPath
src/infrastructure/api/generated/schema.d.ts     GENERATED — never hand-edit
src/infrastructure/api/translate-core-api-error.ts  HTTP status -> application error
src/infrastructure/api/dto-mapper.ts             generic mapDtos() helper — currently unused
src/infrastructure/repositories/core-api-*.repository.ts   port impl + its DTO mapping
src/infrastructure/services/event-source-*.service.ts      SSE progress
src/infrastructure/services/browser-scheduler.service.ts   timers
```

## The transport port is `request()` only

`GeneratedApiTransport` exposes exactly one method:

```ts
request<TResponse>(path: CoreApiPath | string, init?: RequestInit): Promise<TResponse>
```

`CoreApiClient` also has `get/post/patch/delete`, but repositories depend on the
**port**, not the class. Calling `this.transport.delete(...)` does not typecheck.
Pass the method through `init` instead.

`CoreApiClient.request` already handles, so do not re-implement it:

- `Accept: application/json`, and `Content-Type: application/json` when a body is present
- `204` → resolves to `undefined`
- non-2xx → reads RFC-7807 problem details and throws `CoreApiError(status, detail ?? title ?? fallback)`
- telemetry: `core_api_request_started | _completed | _failed` with a client
  `requestId`, `durationMs`, and the backend's `X-Request-Id` when returned

## Adding an endpoint call

1. **Regenerate types** if the Core API changed (it must be running):

   ```bash
   npm run api:generate    # reads http://localhost:3001/api/docs-json
   ```

2. **Write the repository test first**
   (`tests/unit/infrastructure/repositories/core-api-*.repository.test.ts`) with a
   fake transport asserting method, path, encoding, body, mapping, and error
   translation.
3. **Implement the port method.** Wrap the transport once in a private
   `request()` so every method shares one error-translation point:

   ```ts
   export class CoreApiConnectionRepository implements ConnectionRepository {
     public constructor(private readonly transport: GeneratedApiTransport) {}

     public async list(): Promise<readonly DataConnection[]> {
       const response = await this.request<DataConnectionResponseDto[]>('/connections', {
         method: 'GET',
       });
       return response.map(mapConnection);
     }

     public archive(id: string): Promise<void> {
       return this.request<void>(connectionPath(id), { method: 'DELETE' });
     }

     private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
       try {
         return await this.transport.request<TResponse>(path, init);
       } catch (error) {
         throw translateCoreApiError(error);
       }
     }
   }

   function connectionPath(id: string): string {
     return `/connections/${encodeURIComponent(id)}`;
   }
   ```

   - Encode every dynamic path segment with `encodeURIComponent`, via a
     `<domain>Path(id)` helper when the path is reused.
   - Serialize bodies with `JSON.stringify` in `init.body`.
   - Copy any array you hand out after sorting or reversing (`.slice()`) so no
     caller mutates a response you also cached.

4. **Map at the bottom of the repository file.** Module-level `map*` functions,
   one per DTO, not methods and not exported:

   ```ts
   function mapConnection(dto: DataConnectionResponseDto): DataConnection { ... }
   ```

   - Direction naming: `mapXRequest` for domain → DTO, `mapX` for DTO → domain.
   - Translate backend enums explicitly (`'SUCCEEDED' → 'succeeded'`), never cast.
   - `exactOptionalPropertyTypes` is on: add optional keys with
     `...(value ? { value } : {})`, never assign `undefined`.
   - When a DTO field is typed `Record<string, unknown>` (the API is
     DBMS-neutral for connection config), validate it at runtime in a
     `decode*()` function and throw on mismatch — do not cast.
   - Sanitize anything that can carry credentials with
     `sanitizeVerificationMessage` from `src/entities/models/connection.ts`
     before it enters an Entity.
   - Once a domain needs more than ~4 mapping functions, extract them to
     `src/infrastructure/repositories/<domain>-api.mapper.ts` with its own
     `<domain>-api.mapper.test.ts`. Keep them in `infrastructure` — they import
     generated DTO types. `api/dto-mapper.ts` is a generic helper nothing uses;
     do not route mapping through it.

5. **Translate errors** with `translateCoreApiError`: 404 → `NotFoundError`,
   409 → `ConflictError`, other `CoreApiError` → `RemoteServiceError` with
   `exposeMessage: true`, unknown/network → `RemoteServiceError` with
   `exposeMessage: false`. Only exposable messages may be shown verbatim in the UI.
6. **Wire it** through use case → controller → DI module → feature root.

## Streaming (SSE) and polling

Transport belongs to infrastructure; orchestration belongs to the Application
monitor; React only subscribes and releases.

- `event-source-execution-progress.service.ts` /
  `event-source-query-progress.service.ts` own `EventSource`. They build the URL
  from `publicEnvironment.coreApiUrl` and take an injectable factory
  (`createEventSource`) so tests never touch the real `EventSource`; when the
  global is missing they return a no-op subscription instead of throwing.
- `browser-scheduler.service.ts` owns timers (`every(intervalMs, task)`).
- The monitor use case (`monitor-execution.use-case.ts`, `monitor-query.use-case.ts`)
  prefers SSE, falls back to polling (`POLL_INTERVAL_MS` — 3000 ms executions,
  1500 ms queries), coalesces refreshes behind a `refreshing` flag, loads one
  final snapshot on a terminal status, and releases the subscription
  (`.close()`), the `ScheduledTask` (`.cancel()`), and every callback in `close()`.
  The two monitors report the transport differently — executions emit
  `onMode('idle' | 'streaming' | 'polling')`, queries emit optional
  `onChannel('streaming' | 'polling')`. Match whichever the domain already uses;
  do not rename one to match the other without updating its hook and tests.
- In React, keep the handle in a ref and release it with `releaseMonitor` from
  `app/_components/shared/monitor-lifecycle.ts` (returns `null` so it reads as
  `ref.current = releaseMonitor(ref.current)`).

Never put `setInterval`, `EventSource`, or `subscribeToProgress` in a component —
`tests/unit/app/frameworks-layer.test.ts` fails the build if you do.

## Rules

- No `fetch` outside `src/infrastructure`.
- No DTO type outside `src/infrastructure`; repositories return Entities or
  `void`, never `Response`, `CoreApiError`, or a DTO.
- Repositories depend on `GeneratedApiTransport`, never on `CoreApiClient`.
- Credentials never travel back out: do not read a password field off a response
  DTO, and never widen a ViewModel to carry one.
- Stale-response protection for concurrent UI requests uses
  `isCurrentRequestToken` from `app/_components/shared/request-token.ts`, not
  repository-level state.

## Verify

```bash
npx vitest run tests/unit/infrastructure
npm run typecheck && npm run lint
```
