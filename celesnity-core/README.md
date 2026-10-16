# celesnity-core

The control plane for the Celesnity PoC: a NestJS modular monolith that manages PostgreSQL and MySQL
source connections, versions PySpark scripts, orchestrates Spark executions, and exposes
Iceberg catalog browsing and read-only SQL through Trino.

One codebase, two runtime processes:

| Process | Entry point                     | Responsibility                                                                                                        |
| ------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| API     | `dist/bootstrap/api-main.js`    | HTTP surface, Swagger, request handling                                                                               |
| Worker  | `dist/bootstrap/worker-main.js` | Relays outbox events, claims executions, schedules and consumes metadata crawler runs, submits to Spark, streams logs |

They share the domain and application layers and differ only in which composition root they
boot. In local Compose the worker uses Docker to submit inside the Spark container. In
Kubernetes it creates a short-lived driver Job through the namespaced Kubernetes API. The API
process does neither.

> **Security posture.** This is a **trusted-user** PoC. It executes arbitrary Python and SQL on
> the operator's behalf. There is no authentication or authorization layer. The API binds to
> loopback only (`API_BIND_ADDRESS=127.0.0.1`) and Trino is configured read-only. Do not expose
> this beyond a trusted host without adding an authentication layer in front of it.

For running the full stack, backups, resets, and troubleshooting, see
[`../RUNBOOK.md`](../RUNBOOK.md). This README covers the repository itself: how it is
structured and how to work in it.

## Architecture

Four production layers plus a mirrored test tree. The dependency rule is strict and points
inward — nothing in `domain` knows the layers outside it.

```
presentation ──┐                  controllers, DTOs, the global exception filter
               ├──> application   use cases, ports, port errors, DI tokens
infrastructure ┘        │         adapters, Prisma mappers, the schema and migrations
                        v
                     domain       aggregates, value objects, domain errors, vocabularies

modules                           one NestJS module per context — the composition root
bootstrap                         process entry points (api-main, worker-main)
```

- **`domain`** — aggregates, value objects, domain errors, and the status vocabularies. No
  framework, no persistence, no HTTP. Imports nothing but itself.
- **`application`** — use cases, the port interfaces they depend on, port errors, and DI
  tokens. Declares what it needs; never implements it.
- **`infrastructure`** — every adapter that satisfies a port (Prisma, MinIO, Trino, pg,
  Docker/Spark, Kubernetes/Spark), together with the Prisma schema and migrations those
  adapters are written against.
- **`presentation`** — controllers, request/response DTOs, and the one filter that turns a
  domain error into an HTTP response.
- **`modules`** — the composition root: one NestJS module per context, plus the global
  database module. Kept out of `infrastructure` because wiring is not an adapter. These
  modules are the only place allowed to name a concrete class from every layer at once, and
  putting them alongside the adapters made that privilege look like an infrastructure
  concern rather than the deliberate exception it is.
- **`bootstrap`** — the two process entry points and their app modules.

### Bounded contexts

Five contexts, each with the same internal shape across the layers it appears in:

| Context                   | Owns                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `connection-registry`     | PostgreSQL and MySQL source connections, credential encryption, destination policy, connection testing |
| `script-authoring`        | Scripts, immutable published versions, artifact storage and integrity                                  |
| `execution-orchestration` | Execution lifecycle, Spark submission, log capture                                                     |
| `query-workbench`         | Read-only SQL submission against Trino, result capping, cancellation                                   |
| `catalog-exploration`     | Iceberg catalog, namespace, table, snapshot, and preview browsing                                      |

### Connection Registry DBMS support

The registry currently exposes PostgreSQL and MySQL plugins behind the same
DBMS-neutral API. MySQL v1 is API-first and supports Basic Auth (`username` plus
password) with the five Connector/J TLS modes: `DISABLED`, `PREFERRED`, `REQUIRED`,
`VERIFY_CA`, and `VERIFY_IDENTITY`. The canonical stored configuration is
non-secret; passwords remain in the credential vault and are supplied only to the
probe or Spark execution descriptor.

MySQL cloud authentication, MariaDB, client certificates, and custom per-connection
CA material are intentionally outside this first scope. Node connection tests use
the runtime trust store; Spark/JVM execution requires its own JVM trust-store
configuration when a private CA is used.

### Directory layout

```
src/
├── domain/<context>/           aggregates/ entities/ value-objects/ errors/ events/ policies/
├── application/<context>/      use-cases, interfaces/ (ports), errors/, read-models/, tokens.ts
├── application/shared/         ports and tokens every context uses (clock, id generator, unit of work, outbox)
├── infrastructure/             grouped by technology — see below
├── presentation/<context>/     controller, dto, response
├── presentation/http/          error registry + global exception filter
├── modules/                    one NestJS module per context, plus the global database module
├── bootstrap/                  api-main, worker-main, and their app modules
├── generated/prisma/           generated client — never edited by hand
└── tests/                      mirrors the layers above
```

`domain`, `application` and `presentation` are organised by bounded context.
`infrastructure` is organised by the technology it talks to, because that is the axis along
which it actually changes — swapping an object store or a query engine touches one folder, and
everything that speaks a given protocol sits together. Bounded context is the second level, so
a context's adapters remain identifiable and extractable.

```
src/infrastructure/
├── prisma/                     everything that reaches the database through the ORM
│   ├── schema.prisma           the schema — lives with the code written against it
│   ├── migrations/             ordered migrations, applied by `prisma migrate deploy`
│   ├── prisma.service.ts       owns the client; `client` resolves the ambient transaction
│   ├── prisma-transaction.context.ts   AsyncLocalStorage holding the active transaction
│   ├── prisma-unit-of-work.ts  IUnitOfWork: transaction + outbox staging in one commit
│   ├── prisma-error.ts         named Prisma error codes
│   ├── optimistic-concurrency.ts
│   ├── <context>/              repositories, readers, mappers, status boundaries
│   └── messaging/              outbox writer (staging) and outbox store (relay side)
├── postgres/                   the places that bypass the ORM for the pg driver
│   ├── postgres-connection-pool.factory.ts
│   ├── script-authoring/         session-scoped advisory lock
│   └── probe/                    dials caller-supplied external databases, never ours
├── messaging/                  integration event publisher
├── minio/                      client factory + one object store per context
├── trino/<context>/            statement clients and the gateways over them
├── spark/<context>/            submission gateway, JDBC URL construction
├── security/<context>/         credential vault, egress destination policy
├── system/                     clock and id generator
├── memory/<context>/           in-process stores
├── worker/<context>/           background loops: execution claiming, outbox relay
├── providers/<context>/        cross-context bridges — no technology of their own
└── configuration/              environment schema
```

The Prisma schema sits under `infrastructure/prisma` rather than in a top-level `prisma/`
directory. Persistence is an infrastructure concern, and the schema, its migrations, the
repositories, the mappers and the enum boundaries are one unit of change: adding a column
touches the schema, a migration and a mapper in the same commit.

Path aliases (`tsconfig.json`, mirrored in `jest.config.ts`): `@domain/*`, `@application/*`,
`@infrastructure/*`, `@modules/*`, `@presentation/*`, `@bootstrap/*`, `@generated/*`, and
`@tests/*` for shared test doubles. Relative imports across directories are avoided.

## Conventions

These are load-bearing. Following them keeps the layer boundaries meaningful.

**One error type per context, discriminated by a code.** Each context raises a single error
class carrying an enum code, with static factories rather than direct construction. Ports do
the same. There is no one-class-per-variant.

```ts
throw ScriptError.validation(ScriptMessage.archiveBeforeCreation);
throw ArtifactError.storageUnavailable();
if (ArtifactError.is(error, ArtifactErrorCode.INTEGRITY, ArtifactErrorCode.MISSING)) { … }
```

**Messages live in a catalogue, not at the `throw`.** Every context has a `*.messages.ts`
beside its `*.errors.ts`. Fixed messages are constants; anything naming a value or a bound is
a builder. Phrasings shared by all contexts live in `domain/shared/validation-messages.ts`.
These strings reach clients, so they are reviewed as a set.

**Closed vocabularies are string enums, declared once in `domain`.** Statuses, SSL modes, and
event names are enums whose member values are the persisted spellings. Nothing outside the
domain re-declares them; OpenAPI metadata and `Object.values` consume the enum itself.

**Database vocabularies meet domain vocabularies at an explicit boundary.** Each persisted
enum has a `*-status.boundary.ts` in `infrastructure` with exhaustive `Record` maps in both
directions, so a member added on either side fails the build at the boundary rather than
silently at runtime. Importing `@generated/prisma/*` is legal only in `infrastructure`.

**Repositories query; mappers translate.** A repository owns Prisma calls, transaction scope
and the optimistic-concurrency guards. It contains no field-by-field conversion. Every
aggregate has a mapper beside it exposing `toDomain(row)` and `toPersistence(aggregate)`, and
mappers consume the status boundaries rather than restating enum maps. Read projections get a
`*-view.mapper.ts` of their own when the projection carries logic — a derived flag, a
truncation, a fallback — and share the aggregate's mapper when it is only renaming and date
formatting.

**Persistence shapes are derived from `schema.prisma`, never hand-written.** `infrastructure/prisma/schema.prisma`
is the single definition of every table. Column selections are declared once in the mapper as
`as const satisfies <Model>Select` and exported for the repository to query with; the row type
is then derived with `<Model>GetPayload<{ select: typeof SELECTION }>`. Write shapes derive
from `<Model>Model` via `Omit`/`Pick`, overriding only JSON columns, which Prisma reads as
`JsonValue` but writes as `InputJsonValue`. Declaring a row interface by hand is what this
replaces: it silently drifts from the schema, whereas a derived type fails to compile the
moment a column is renamed or retyped.

Do not intersect `Prisma.<Model>UpdateManyMutationInput` with `Prisma.<Model>CreateManyInput`
to describe a shared shape. Update inputs admit `{ set: … }` wrappers, so the intersection
produces uninhabitable types. Derive from the model instead — plain scalars satisfy both.

The only hand-written row shapes left are the raw-SQL result types in
`postgres/execution-orchestration/pg-execution.dispatcher.ts`, which Prisma cannot type, and
the JSON _content_ shape in `execution.mapper.ts`, which the schema only types as `Json?`.

**`prisma/` and `postgres/` are separated by how they reach the database, not by what they
store.** Anything going through the generated client lives under `prisma/`. Four operations
cannot go through it — skip-locked queue claiming (`FOR UPDATE SKIP LOCKED`), a session-scoped
advisory lock (`pg_advisory_xact_lock`), the pool factory serving both, and the probe that
dials a caller-supplied external database — so they use the `pg` driver directly and live under
`postgres/`. Those four are the only files in the tree that import `pg`, which is what makes
the split checkable rather than aspirational.

**Guarded writes say what they mean.** A guarded update is an `updateMany` whose `where`
repeats the state the aggregate was loaded in, and the affected-row count is the signal. Call
sites use `guardHeld(result)` / `guardLost(result)` from `prisma/optimistic-concurrency.ts`
rather than a bare `count === 1`, because the comparison encodes optimistic concurrency and
reads like a sanity check. The guard itself differs per aggregate — status, revision, or
`updatedAt` — so only the verdict is shared. Where two repositories need the _same_ guard, the
`where` clause is built once: `activeScriptAtRevision` serves both the metadata and publication
paths.

Prisma error codes are named in `infrastructure/prisma/prisma-error.ts` and matched with
`hasPrismaErrorCode(error, ...codes)`. Matching is structural rather than `instanceof`, since
only the `code` field is contractual.

**Adapters with no context are declared once.** `SystemClock` and `RandomUuidGenerator` back
the shared `IClock` and `IIdGenerator` ports from `application/shared`, and each module still
binds its own instance. The `pg` pools and MinIO clients come from
`PostgresConnectionPoolFactory` and `MinioClientFactory`, which own the connection string,
timeouts and shutdown. The pool factory hands out a _separate_ pool per workload on purpose:
the publication lock holds its connection for a whole publish, so sharing one pool would let
slow publishes starve the execution dispatcher.

**Ports declare; infrastructure implements.** A port file holds one interface and its
parameter and result types — no DI tokens, no errors, no value objects. Tokens live in
`application/<context>/tokens.ts`. Nothing under `application` uses `implements I*`.

**Modules bind adapters uniformly.** Every port binds with
`{ provide: TOKEN, useExisting: Adapter }`. A `useFactory` appears only where an undecorated
application class must be composed positionally.

**Controllers route; they do not translate errors.** No `try`/`catch` in any controller. A
single `DomainExceptionFilter` consults `presentation/http/error-http.registry.ts` — the only
file that names HTTP status classes — and renders `application/problem+json`. An error with no
mapping becomes a generic 500 that leaks nothing.

**Rules live in objects.** Business rules belong to value objects and collaborators, not
exported free functions. `TextGuard`, `SecretRedactor`, `ConnectionDetailsAssembler`, and the
value objects under `domain/*/value-objects/` are the pattern.

## Getting started

Requires Node 22+. The infrastructure stack (PostgreSQL, MinIO, Spark, Trino) must be running
first — see [`../RUNBOOK.md`](../RUNBOOK.md) section 1.

```bash
npm ci
cp .env.example .env          # defaults suit local use
npm run prisma:generate       # generate the client into src/generated/prisma
npm run prisma:migrate:deploy # apply celesnity_app migrations
npm run build
npm run start                 # API on http://127.0.0.1:3001, Swagger at /api/docs
npm run start:worker          # in a second terminal
```

or
cd ../celesnity-core
cp .env.example .env # optional

# Apply celesnity_app migrations from the HOST against the infra Postgres.

# Local Compose does not run migrations; use the host-published port 15432.
# GCP deployment instead runs the version-pinned migration, bootstrap, and
# authorization-readiness Jobs before rolling out API and worker.

npm ci
cd ../celesnity-web && npm run local:env && cd ../celesnity-core
DATABASE_URL="postgresql://celesnity:celesnity_dev_password@localhost:15432/celesnity?schema=celesnity_app" \
npm run prisma:migrate:deploy
# Local authentication seed tooling was retired with the authorization cutover.
# Use an approved Identity Platform tenant/owner and the Core bootstrap workflow.

# Build the image and start the API + worker. They join the celesnity-core network

# and attach to the infra celesnity-poc network for service-name resolution.

# (The infra stack from step 1 must be up first so the external network exists.)

# The API mounts the gcloud ADC JSON named by GOOGLE_APPLICATION_CREDENTIALS_HOST

# read-only for local Identity Platform token verification. Run

# `gcloud auth application-default login` first, then set it to an absolute path:

# Windows PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS_HOST = "$env:APPDATA\gcloud\application_default_credentials.json"

# macOS/Linux: export GOOGLE_APPLICATION_CREDENTIALS_HOST="$HOME/.config/gcloud/application_default_credentials.json"

# Put the same non-secret path in Core's untracked `.env` for later Compose runs.

# Load Core's auth settings first, then Infra's connector settings. Passing only

# Infra's file replaces Compose's default .env input and silently drops Core's

# local auth mode and signing key.

docker compose --env-file .env --env-file ../celesnity-infra/local/.env up -d --build --wait

Run exactly one worker at a time. Two workers compete for the same execution claims.

For watch-mode development use `npm run start:dev` and `npm run start:worker:dev`.

## Commands

| Command                         | Purpose                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `npm test`                      | Run the suite (21 files, 481 tests)                             |
| `npm run test:watch`            | Watch mode                                                      |
| `npm run test:cov`              | Coverage, excluding generated code and the test tree            |
| `npm run typecheck`             | `tsc --noEmit` over `src`, tests included                       |
| `npm run lint`                  | ESLint, including the layer-boundary rules                      |
| `npm run format`                | Prettier over `src` and root config, plus `prisma format`       |
| `npm run format:check`          | Verify formatting without writing                               |
| `npm run build`                 | `nest build` then `tsc-alias` to rewrite path aliases in `dist` |
| `npm run prisma:generate`       | Regenerate the Prisma client                                    |
| `npm run prisma:migrate:deploy` | Apply migrations                                                |
| `npm run prisma:validate`       | Validate the schema                                             |

Before opening a change, run `npm run typecheck && npm run lint && npm test && npm run build`.

## Testing

Jest with `ts-jest`. Specifications live in `src/tests/`, mirroring the layer they cover, so
the production directories hold production code only. `jest.config.ts` still matches
`*.spec.ts` anywhere, so a misplaced spec runs rather than being silently skipped.

Everything is in-process — no database, no network, no Docker. Collaborators are hand-written
fakes rather than mocking-framework doubles. Three kinds of test carry most of the weight:

- **Characterization tests** pin behaviour that predates a refactor, including its quirks, so a
  change that alters observable behaviour fails loudly.
- **End-to-end HTTP tests** (`src/tests/presentation/http/`) drive real Nest applications
  through supertest and assert status codes and response bodies. These are the regression gate
  for anything touching error translation. One application is built per controller and reused
  across cases; building one per assertion was measurably flaky.
- **Boundary tests** assert the domain and database vocabularies agree, and that the published
  OpenAPI enums have not moved.

`src/tests/modules/module-wiring.spec.ts` compiles the real NestJS modules with
`PrismaService` stubbed, so a broken DI graph fails in CI rather than at boot.

## Configuration

Every variable is validated at startup by `infrastructure/configuration/environment.ts`; the
process refuses to boot on a missing or malformed value. `.env.example` documents the full set
with local defaults. The groups are:

- **Process** — `NODE_ENV`, `PORT`, `API_BIND_ADDRESS`, `WEB_ORIGIN`
- **PostgreSQL** — `DATABASE_URL` (schema `celesnity_app`)
- **Object storage** — `MINIO_*`, `SCRIPT_SOURCE_MAX_BYTES`
- **Credentials** — `CONNECTION_CREDENTIAL_KEYS` (a versioned keyring; keep old versions for
  decryption during rotation), `CONNECTION_CREDENTIAL_ACTIVE_KEY_VERSION`
- **Destination policy** — `CONNECTION_ALLOW_PRIVATE_DESTINATIONS`, `CONNECTION_ALLOWED_HOSTS`,
  `CONNECTION_TEST_TIMEOUT_MS`
- **Execution** — `EXECUTION_*`, `SPARK_*`
- **Trino** — `TRINO_*`, `CATALOG_PREVIEW_MAX_ROWS`, `SQL_*`

The credential key in `.env.example` is a development value. Replace it in every deployed
environment.

## API surface

All routes are prefixed `/api/v1`. Swagger UI is served at `/api/docs` when the API is running.

```
GET    /health/live                                       liveness
GET    /health/ready                                      readiness

POST   /connection-tests                                  test unsaved connection details
GET    /connections                                       list active connections
POST   /connections                                       create
GET    /connections/:id                                   read
PATCH  /connections/:id                                   update
DELETE /connections/:id                                   archive
POST   /connections/:id/test                              test and record

GET    /scripts                                           list active scripts
POST   /scripts                                           create a draft
GET    /scripts/:id                                       read
PATCH  /scripts/:id                                       update metadata
POST   /scripts/:id/versions                              publish an immutable version
GET    /scripts/:id/versions                              list versions
GET    /scripts/:id/versions/:version/source              read and integrity-check a source
POST   /scripts/:id/versions/:version/executions          queue a Spark execution

GET    /executions                                        list recent executions
GET    /executions/:id                                    read
POST   /executions/:id/cancel                             request cancellation
GET    /executions/:id/logs                               read the redacted log
GET    /executions/:id/events                             SSE progress stream

POST   /sql-executions                                    submit a read-only statement
GET    /sql-executions                                    history
GET    /sql-executions/:id                                read status, columns, rows, stats
POST   /sql-executions/:id/cancel                         request cancellation
GET    /sql-executions/:id/events                         SSE progress stream

GET    /catalogs                                          list the configured catalog
GET    /catalogs/:catalog/schemas                         list namespaces
GET    /catalogs/:catalog/schemas/:schema/tables          list tables and views
GET    /catalogs/:catalog/schemas/:schema/tables/:table/columns    column metadata
GET    /catalogs/:catalog/schemas/:schema/tables/:table/snapshots  Iceberg snapshots
GET    /catalogs/:catalog/schemas/:schema/tables/:table/preview    capped row preview
```

Errors are returned as `application/problem+json` with `type`, `title`, `status`, `detail`,
`instance`, and `timestamp`. Secrets are redacted from every field, and any unmapped error
becomes a 500 whose detail is a fixed generic string.

## Layer enforcement

`eslint.config.mjs` enforces the dependency rule mechanically. `src/domain/**` and
`src/application/**` may not import `@nestjs/*`, `@prisma/*`, `express`, `minio`, `pg`,
`@infrastructure/*`, or `@presentation/*`. Files under `src/tests/**` are exempt, since a
specification legitimately reaches across layers to stub a collaborator.

Three further rules hold in the current tree but are upheld by review rather than by lint:
`presentation` does not import `@infrastructure/*`, `domain` does not import `@application/*`,
and no class under `application` declares `implements I*`.

`modules/*` does import `@presentation/*`, and that is correct rather than a
violation: a NestJS module is the wiring point, so it necessarily names the controllers it
registers. Any rule added here has to exempt that directory.

## Docker

`Dockerfile` is a four-stage build producing `celesnity/core:0.1.0`. It compiles with dev
dependencies, installs production dependencies separately, and copies a static Docker CLI into
the runtime image for the local Compose worker's `docker cp` and `docker exec`. Kubernetes uses
the in-cluster API and does not mount a container-runtime socket. The default command is the API;
`compose.yaml` overrides it for the worker.

Migrations are **not** run by the containers. Apply them from the host against the published
PostgreSQL port before starting the stack — see [`../RUNBOOK.md`](../RUNBOOK.md).

## Related

- [`../RUNBOOK.md`](../RUNBOOK.md) — running, inspecting, backing up, resetting, troubleshooting
- `../celesnity-infra` — PostgreSQL, MinIO, Spark, Trino
- `../celesnity-sample` — optional sample source database
- `../celesnity-web` — Next.js workspace
