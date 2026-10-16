# Database-to-Datasource Many-to-Many Design

**Branch:** `feat/data-workflows`

**Baseline:** `release/0.4.0`

**Status:** Approved in conversation.

## Problem

`DatabaseService` currently stores one optional `databaseName`. The database
page sends that name to `GET /database-services`, and Core filters directly on
`database_services.database_name`. This models one datasource as belonging to
at most one Iceberg database.

The model no longer matches the product requirement. A customer may want to
reuse one physical datasource connection in several catalog databases without
duplicating its credential, metadata crawler, CDC profile, or Debezium
connector. It also hides legacy connections whose `database_name` is null from
every database-scoped Sources page. The local `KasaDev` connection is one such
record: it is active and verified, but it cannot appear under `kasadata` until
the user can explicitly link it.

The database page must support both creating a datasource for the current
database and attaching an existing datasource. Removing a datasource from one
database must remove only that association.

## Goals

- Allow one datasource to be linked to zero, one, or many Iceberg databases.
- Keep datasource connection details, credentials, verification, metadata
  crawler, and CDC configuration global to the datasource.
- Let a database-scoped Sources page create a new datasource or attach an
  existing one.
- Let a database remove its association without changing other associations or
  archiving the datasource.
- Prevent removing an association while a pipeline in that database still uses
  the datasource.
- Prevent archiving a datasource while any database association remains.
- Backfill the current single-database field without losing legacy unassigned
  datasources.
- Preserve organization isolation and Clean Architecture boundaries.

## Non-goals

- Copying a datasource, credential, crawler, CDC profile, or connector per
  database.
- Giving each database a different credential for the same datasource.
- Adding per-membership schema, table, CDC, or crawler configuration.
- Automatically attaching every unassigned legacy datasource to a database.
- Changing pipeline target ownership or `pipelines.database_name`.
- Changing workflow graph semantics; workflows continue to run published
  pipelines by ID.
- Implementing a new global datasource-management surface in this delivery.

## Domain Model

`DatabaseService` remains the aggregate for a physical customer connection. It
owns the connector type, normalized non-secret configuration, encrypted
credential reference, verification state, archive state, crawler relationship,
and CDC profile. It no longer owns a singular database name.

Database membership is a separate relationship:

```text
Database namespace N
        |
        | database_service_memberships
        |
DatabaseService N
```

The persistence model is:

```text
database_service_memberships
- organization_id       uuid
- database_name         varchar(120)
- database_service_id   uuid
- created_at            timestamptz
```

The primary or unique key is
`(organization_id, database_name, database_service_id)`. The membership has a
tenant-safe foreign key to `(database_service_id, organization_id)` on
`database_services`. Indexes support both database-scoped listing and checking
whether a datasource has any membership:

- `(organization_id, database_name, database_service_id)`
- `(organization_id, database_service_id, database_name)`

`database_name` names an Iceberg/Trino namespace rather than a row owned by
Core, so it has no database foreign key. The application validates that the
namespace exists through a catalog reader before creating a membership.

## Domain Rules

### Attach

- The datasource and database must belong to the authenticated organization.
- The datasource must be active. Verification status does not control
  membership; untested and failed datasources may be attached and remain
  visibly marked as such.
- The target database namespace must exist.
- Attaching an existing membership is idempotent and returns success without
  inserting a duplicate row.

### Detach

- Detaching removes only the membership for the selected database.
- Core checks whether any active pipeline filed under that database references
  the datasource ID. If so, detaching fails with
  `DATASOURCE_USED_BY_PIPELINES` and includes safe pipeline identity details for
  the UI.
- Other memberships, the datasource, credential, crawler, CDC profile,
  connector, and pipeline records remain unchanged.
- Detaching a missing membership is idempotent.

### Archive

- Database-scoped UI does not offer datasource archive; it offers **Remove from
  this database**.
- The existing global archive operation checks membership usage first.
- A datasource with one or more memberships cannot be archived and returns
  `DATASOURCE_STILL_LINKED`.
- A datasource with no memberships follows the existing archive behavior.

### Pipeline usage

Pipeline membership remains represented by `pipelines.database_name`. Source
nodes continue to reference a datasource through `databaseServiceId`. A
`DatabaseSourceUsageReader` port answers whether a datasource is referenced by
any active pipeline in a given database. The detach use case depends on this
port rather than reading pipeline persistence directly.

## Application Boundaries

The database-service context gains these ports:

- `IDatabaseServiceMembershipRepository`
  - list memberships for a datasource;
  - list datasource IDs for a database;
  - test membership existence;
  - attach idempotently;
  - detach idempotently.
- `IDatabaseCatalogReader`
  - verify that an organization-visible database namespace exists.
- `IDatabaseSourceUsageReader`
  - list active pipelines in a database that reference a datasource.

The application layer gains focused use cases:

- `ListAvailableDatabaseServicesUseCase`
- `AttachDatabaseServiceUseCase`
- `DetachDatabaseServiceUseCase`

Creation remains coordinated by `DatabaseServiceUseCases.create`. When an
initial database is supplied, the use case validates it and commits the new
datasource plus membership in one unit of work. The datasource aggregate does
not receive or retain the database name.

Archive obtains membership usage through the membership repository before
mutating the datasource aggregate. Presentation and infrastructure layers do
not implement these business rules independently.

## HTTP Contract

### List linked datasources

The current contract remains:

```http
GET /api/v1/database-services?databaseName=kasadata
```

Core implements this filter through the membership table. Without
`databaseName`, the endpoint continues to list all active datasources in the
organization.

### List available datasources

```http
GET /api/v1/database-services/available?databaseName=kasadata&search=kasa&page=1
```

The response uses the existing page envelope. It includes active datasources
that are not already linked to the selected database. Datasources linked to
other databases remain candidates. The result exposes safe connection summary,
verification status, and `databaseNames`; it never exposes credentials.

### Attach and detach

```http
PUT    /api/v1/database-services/:databaseServiceId/memberships/:databaseName
DELETE /api/v1/database-services/:databaseServiceId/memberships/:databaseName
```

Both route parameters are URL encoded. `PUT` and `DELETE` are idempotent.

### Create and attach atomically

The create request accepts `initialDatabaseName`:

```json
{
  "name": "Customer Postgres",
  "initialDatabaseName": "kasadata",
  "connectorType": "POSTGRESQL",
  "details": {}
}
```

During the compatibility window, Core may accept the released `databaseName`
field as an alias. If both fields are supplied and differ, validation fails.
Web sends only `initialDatabaseName` after this feature ships.

### Datasource response

The singular optional `databaseName` field is replaced with:

```json
{
  "databaseNames": ["kasadata", "analytics"]
}
```

Names are unique and sorted for deterministic responses.

### Errors

- `DATABASE_NOT_FOUND` — target catalog database does not exist or is not
  visible to the organization.
- `DATABASE_SERVICE_NOT_FOUND` — datasource does not exist, is archived, or is
  outside the organization.
- `DATASOURCE_USED_BY_PIPELINES` — detach is blocked. Details contain only
  pipeline IDs and names that the caller may see.
- `DATASOURCE_STILL_LINKED` — archive is blocked until all memberships are
  removed.

No error response contains connection credentials or connector configuration.

## Web Experience

The database Sources tab has one primary action: **Add datasource**. The empty
state uses the same action.

Selecting it opens a choice dialog with two actions:

1. **Create new datasource** opens the existing connection form. Saving calls
   the atomic create flow with the current database as
   `initialDatabaseName`.
2. **Choose existing datasource** opens a searchable list from the `available`
   endpoint.

Each available datasource row shows name, connector type, safe endpoint
summary, verification status, and how many databases currently use it. It has
an explicit **Add** button rather than a checkbox. A successful add removes the
row from the candidate list and refreshes the Sources tab.

The linked Sources list displays `Shared with N databases` when the datasource
has more than one membership. Its database-scoped destructive action is
**Remove from this database**. A confirmation dialog explains that the shared
connection remains available elsewhere.

When removal is blocked by pipelines, the dialog shows the safe pipeline list
returned by Core and directs the user to replace or remove those source nodes.
The UI does not optimistically remove the datasource before Core confirms the
operation.

Datasource detail routes remain database scoped, so navigation retains the
database from which the user opened the datasource. Shared crawler and CDC
configuration are presented as datasource-level settings; changing them affects
every database using that datasource.

## Persistence Migration

The migration performs these steps in order:

1. Create `database_service_memberships` with tenant-safe constraints and
   indexes.
2. Insert one membership for each active or archived datasource whose existing
   `database_name` is non-null and non-blank.
3. Use `ON CONFLICT DO NOTHING` so rerun or partially repaired environments do
   not create duplicate memberships.
4. Verify that every non-null legacy value has a matching membership before
   dropping `database_services.database_name`.
5. Drop the old index and singular column so the membership table is the only
   source of truth.

Datasources with a null legacy value remain unassigned. They are returned by
the available-datasource endpoint for every database to which they are not
already linked. This makes `KasaDev` selectable for `kasadata` without changing
or re-entering its connection details.

The migration requires a coordinated local deployment in which old Core
binaries are not running after the singular column is dropped. A future
zero-downtime hosted rollout may split expand and contract into separate
releases, but that deployment work is outside this local-first delivery.

## Concurrency and Transactions

- New datasource plus initial membership is one database transaction.
- The membership unique key is authoritative under concurrent attach requests.
- Attach translates a unique conflict into idempotent success.
- Detach checks pipeline usage and removes the membership within the same Core
  transaction boundary. Pipeline creation or update must validate membership
  before persisting a source reference, preventing a new reference from racing
  a detach.
- Archive checks for membership inside its transaction before updating the
  datasource archive state.

## Security and Tenant Isolation

- Organization identity comes from the authenticated request context, never
  from a request body or query parameter.
- Every membership query includes `organization_id`.
- The composite datasource foreign key prevents linking a datasource from a
  different organization.
- Database validation uses organization-visible catalog namespaces.
- Candidate lists and pipeline-usage details contain only resources visible to
  the caller.
- Credentials remain write-only and are never copied into membership rows,
  responses, logs, or errors.

## Compatibility

- Pipeline graphs keep their existing `databaseServiceId` source references.
- `pipelines.database_name` remains unchanged.
- Metadata crawler ownership remains one crawler per datasource according to
  the current crawler contract.
- CDC connection profiles and Debezium connector reconciliation remain keyed by
  datasource ID, so one connector can trigger workflows associated with any
  database that uses the datasource.
- Existing database-scoped list callers retain the `databaseName` query.
- Web and Core deploy together for the response change from `databaseName` to
  `databaseNames`.

## Verification

### Core domain and application

- Attach validates database and datasource organization scope.
- Repeated attach succeeds with one membership row.
- Detach removes only the selected membership.
- Detach is blocked when a pipeline in that database references the datasource.
- A pipeline in another database does not block detaching the current database.
- Archive is blocked while any membership exists and succeeds after the last
  membership is removed.
- Create with `initialDatabaseName` commits datasource and membership together
  and rolls both back on failure.

### Core persistence and HTTP

- Database-scoped list joins through memberships.
- Available list excludes current memberships and includes unassigned or
  differently assigned datasources.
- Migration backfills non-null legacy values, preserves null legacy sources,
  and removes the singular column.
- Composite constraints reject cross-organization memberships.
- Responses return sorted `databaseNames` and no singular `databaseName`.
- New error codes map to stable HTTP 404 or 409 responses.

### Web

- **Add datasource** presents Create new and Choose existing.
- Create new sends `initialDatabaseName` and renders the returned datasource.
- Choose existing searches candidates and adds a row through the membership
  controller.
- Existing linked datasources do not appear as candidates.
- Shared usage count renders correctly.
- Remove confirmation unlinks only after server success.
- Pipeline-usage conflict keeps the datasource visible and presents actionable
  pipeline information.
- Database-scoped pages expose no global archive action.

### End-to-end

1. Attach the existing unassigned `KasaDev` datasource to `kasadata`; it appears
   without re-entering credentials.
2. Attach the same datasource to a second database; both pages show it and only
   one credential, crawler, and CDC profile exist.
3. Remove it from one database; the other membership and connection remain.
4. Confirm removal is blocked while a pipeline in that database uses it.
5. Confirm archive is blocked until all memberships are removed.
6. Run a pipeline and a CDC-triggered workflow after sharing the datasource to
   prove runtime references remain valid.

## Repository Responsibilities

### `celesnity-core`

- Prisma schema and migration.
- Membership domain/application ports and use cases.
- Catalog and pipeline-usage adapters.
- Database-service list, candidate, attach, detach, create, and archive rules.
- HTTP contracts and error mapping.

### `celesnity-web`

- Replace the singular datasource membership model with `databaseNames`.
- Add repository/controller/use-case methods for candidates, attach, and detach.
- Implement the Add datasource choice flow and existing-source picker.
- Replace database-scoped archive with remove and conflict presentation.
- Update database counts, source detail navigation, translations, and tests.

### `celesnity-infra`

No source change is expected. The feature uses the existing Core PostgreSQL
database and deployment topology. Infra changes are required only if runtime
verification discovers a real migration-ordering issue.

## Implementation Order

1. Core migration and membership persistence adapters.
2. Core application rules and HTTP contracts.
3. Web contracts, repositories, and controllers.
4. Web Add new, Choose existing, and Remove flows.
5. Focused Core/Web tests and local end-to-end verification with `KasaDev`.

