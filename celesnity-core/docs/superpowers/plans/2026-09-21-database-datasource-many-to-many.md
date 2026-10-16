# Database-to-Datasource Many-to-Many Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one datasource connection to be linked to zero, one, or many catalog databases, while keeping credentials, crawler state, and CDC configuration owned once by the datasource.

**Architecture:** Introduce an explicit database-service membership relationship. Core owns all membership rules through application ports and use cases; Prisma, catalog lookup, pipeline usage lookup, HTTP, and React remain adapters. Web calls focused membership use cases through controllers and repositories and renders explicit Add and Remove interactions.

**Tech Stack:** NestJS, TypeScript, Prisma/PostgreSQL, Jest, Next.js, React, Vitest, Testing Library, Tailwind/shadcn UI.

**Spec:** `docs/superpowers/specs/2026-09-21-database-datasource-many-to-many-design.md`

## Global Constraints

- Follow Clean Architecture dependency direction: domain <- application <- adapters/frameworks.
- Keep `DatabaseService` focused on the physical customer connection. Do not add membership persistence, catalog lookup, Prisma types, HTTP types, or React state to the aggregate.
- Keep membership business rules in application use cases behind narrow ports. Controllers map requests, Prisma adapters persist, and React components render state.
- Do not retain `database_services.database_name` as a second source of truth after the coordinated migration.
- Keep the source DBMS database name inside normalized PostgreSQL/MySQL connection config distinct from Celesnity catalog memberships. Removing the singular membership column must not alter the database name used to connect, crawl metadata, poll, or configure Debezium.
- Do not copy credentials, crawler records, CDC profiles, or Debezium connectors per membership.
- Obtain organization identity from authenticated context. Never accept `organizationId` from a request body, query, or route parameter.
- Never return credentials or raw connector configuration in list, membership, conflict, log, or error payloads.
- Use small files and focused names. Do not add a generic membership manager, utility dumping ground, or a god component.
- Reuse existing page envelopes, error mapping, dialogs, buttons, and list primitives instead of creating parallel conventions.
- Preserve unrelated Data Workflow and CDC work. Do not refactor those areas except for the minimum compatibility changes required by the new `databaseNames` response.
- Implement each behavior test-first. Run the focused red test, add the minimum implementation, then run the focused green test before moving on.
- No `celesnity-infra` source change is planned. Add one only if local migration/runtime evidence proves it is required.

## Review Focus

Review every task against these failure modes:

1. **Duplicate ownership:** datasource credentials, crawler state, or CDC state are accidentally copied per database.
2. **Tenant escape:** a datasource, database namespace, membership, or pipeline from another organization can be observed or linked.
3. **Split truth:** both the old singular `databaseName` column and the new memberships drive behavior.
4. **Unsafe detach/archive:** a membership is removed while a pipeline in that database uses it, or a linked datasource is archived.
5. **UI optimism:** the Web removes a row before Core confirms success or hides actionable pipeline conflicts.

---

## Before Execution: Continue on the Existing Data Workflow Branches

The user chose to ship shared datasource memberships together with Data Workflows. Continue directly on `feat/data-workflows` in both Core and Web. Do not create a new branch or worktree.

Both live branches already descend from `origin/release/0.4.0`. The worktrees contain many uncommitted workflow/CDC changes, including database-service files that this feature will also modify. Preserve those changes and create a clear checkpoint before membership work begins.

- [ ] Confirm Core and Web are both on `feat/data-workflows` and still descend from `origin/release/0.4.0`.
- [ ] Run the focused Data Workflow/CDC checks defined by the existing workflow implementation plan.
- [ ] Commit the current intended Data Workflow/CDC state in each repository before Task 1. Do not use stash, reset, checkout, or cleanup to manufacture a clean tree.
- [ ] Confirm `git status --short` is clean after those checkpoint commits.
- [ ] Keep datasource-membership work in separate logical commits using the commit boundaries below. This preserves review and rollback even though both features share one branch.
- [ ] When a database-service file contains CDC changes, integrate the membership behavior into the current version; never restore the release copy over newer CDC code.

## Task 1: Define Core Membership Contracts and Remove Membership from the Aggregate

**Files:**

- Create: `src/application/database-service/interfaces/i-database-service-membership-repository.ts`
- Create: `src/application/database-service/interfaces/i-database-catalog-reader.ts`
- Create: `src/application/database-service/interfaces/i-database-source-usage-reader.ts`
- Create: `src/application/database-service/read-models/database-service-membership.ts`
- Modify: `src/application/database-service/interfaces/index.ts`
- Modify: `src/application/database-service/tokens.ts`
- Modify: `src/application/database-service/read-models/database-service.view.ts`
- Modify: `src/domain/database-service/aggregates/database-service.ts`
- Modify: `src/tests/domain/database-service/aggregates/database-service.spec.ts`
- Create: `src/tests/application/database-service/database-service-membership.contract.spec.ts`

- [ ] Write a failing aggregate test proving `DatabaseService` creation and rehydration no longer accept or expose a singular database name.
- [ ] Write a failing contract test that locks the narrow application ports to these responsibilities:

```ts
export interface IDatabaseServiceMembershipRepository {
  listDatabaseNames(databaseServiceId: string): Promise<readonly string[]>;
  listDatabaseServiceIds(databaseName: string): Promise<readonly string[]>;
  exists(databaseServiceId: string, databaseName: string): Promise<boolean>;
  hasAny(databaseServiceId: string): Promise<boolean>;
  lockExisting(databaseServiceId: string, databaseName: string): Promise<boolean>;
  attach(databaseServiceId: string, databaseName: string, createdAt: Date): Promise<void>;
  detach(databaseServiceId: string, databaseName: string): Promise<void>;
}

export interface IDatabaseCatalogReader {
  exists(databaseName: string): Promise<boolean>;
}

export interface DatabaseSourcePipelineUsage {
  readonly id: string;
  readonly name: string;
}

export interface IDatabaseSourceUsageReader {
  listUsingPipelines(
    databaseName: string,
    databaseServiceId: string,
  ): Promise<readonly DatabaseSourcePipelineUsage[]>;
}
```

- [ ] Run the red tests:

```powershell
npm test -- --runInBand src/tests/domain/database-service/aggregates/database-service.spec.ts src/tests/application/database-service/database-service-membership.contract.spec.ts
```

Expected: failure because the aggregate still owns `databaseName` and the ports do not exist.

- [ ] Remove `databaseName` from the aggregate state, create/rehydrate inputs, getters, and mutators.
- [ ] Add `databaseNames: readonly string[]` to `DatabaseServiceView`. Keep it a read projection; do not add it to the domain aggregate.
- [ ] Add explicit DI tokens for the three new outbound ports and export the interfaces from the existing barrel.
- [ ] Run the focused tests again and confirm they pass.
- [ ] Run `npm run typecheck` and use the compiler output to enumerate the remaining singular-field adapters that later tasks must update; do not mask them with optional compatibility fields inside the domain.
- [ ] Commit:

```powershell
git add src/application/database-service src/domain/database-service src/tests/application/database-service src/tests/domain/database-service
git commit -m "refactor: separate datasource membership contracts"
```

## Task 2: Add the Membership Table and Tenant-Safe Persistence Adapters

**Files:**

- Modify: `src/infrastructure/prisma/schema.prisma`
- Create: `src/infrastructure/prisma/migrations/20260921140000_database_service_memberships/migration.sql`
- Create: `src/infrastructure/prisma/database-service/prisma-database-service-membership.repository.ts`
- Modify: `src/infrastructure/prisma/database-service/database-service.mapper.ts`
- Modify: `src/infrastructure/prisma/database-service/prisma-database-service.repository.ts`
- Modify: `src/infrastructure/prisma/database-service/prisma-database-service.reader.ts`
- Modify: `src/tests/infrastructure/prisma/database-service/database-service.mapper.spec.ts`
- Create: `src/tests/infrastructure/prisma/database-service/database-service-membership.repository.spec.ts`
- Create: `src/tests/infrastructure/prisma/database-service/database-service-membership-migration.spec.ts`

- [ ] Write a failing schema/migration contract test that proves the migration:
  - creates `database_service_memberships`;
  - uses `(organization_id, database_name, database_service_id)` as the unique identity;
  - adds a tenant-safe foreign key to `(database_service_id, organization_id)`;
  - backfills every non-blank legacy `database_name` with `ON CONFLICT DO NOTHING`;
  - verifies the backfill before dropping `database_services.database_name`;
  - removes the old singular index and column.
- [ ] Write failing repository tests for idempotent attach/detach, sorted database-name listing, database-scoped datasource listing, available listing, tenant scoping, and transaction-scoped membership locking.
- [ ] Run the red tests:

```powershell
npm test -- --runInBand src/tests/infrastructure/prisma/database-service/database-service-membership-migration.spec.ts src/tests/infrastructure/prisma/database-service/database-service-membership.repository.spec.ts src/tests/infrastructure/prisma/database-service/database-service.mapper.spec.ts
```

- [ ] Add the Prisma model and relations. Keep `database_name` off `DatabaseService` after migration; the join table is authoritative.
- [ ] Implement the repository with organization-scoped queries. Treat Prisma unique conflicts during attach as idempotent success; do not catch unrelated database failures.
- [ ] Implement `lockExisting` with a transaction-scoped row lock on the exact organization/database/datasource membership. Both detach and pipeline save must lock the same row before checking or writing; a plain Read Committed transaction without this shared lock does not prevent the race.
- [ ] Update the reader so:
  - `listActive({ databaseName })` joins through memberships;
  - no database filter still returns every active datasource in the organization;
  - each view contains unique, lexicographically sorted `databaseNames`;
  - candidate reads exclude only membership in the selected database and still include unassigned or differently linked datasources.
- [ ] Update aggregate persistence mapping to remove the singular column and keep credentials untouched.
- [ ] Run `npm run prisma:validate`.
- [ ] Run the focused tests again and confirm they pass.
- [ ] Commit:

```powershell
git add src/infrastructure/prisma src/tests/infrastructure/prisma/database-service
git commit -m "feat: persist shared datasource memberships"
```

## Task 3: Implement Catalog Validation and Pipeline Usage Adapters

**Files:**

- Create: `src/infrastructure/providers/database-service/database-catalog.reader.ts`
- Create: `src/infrastructure/prisma/database-service/prisma-database-source-usage.reader.ts`
- Create: `src/tests/infrastructure/providers/database-service/database-catalog.reader.spec.ts`
- Create: `src/tests/infrastructure/prisma/database-service/database-source-usage.reader.spec.ts`
- Use: `src/application/catalog-exploration/interfaces/i-catalog-reader.ts`
- Use: `src/domain/pipeline-authoring/models/pipeline-graph-summary.ts`

- [ ] Write a failing adapter test proving the catalog adapter returns true only for an organization-visible database namespace and translates catalog-unavailable failures through the existing categorized error vocabulary.
- [ ] Write a failing usage-reader test with these fixtures:
  - pipeline in `kasadata` references datasource A;
  - pipeline in `analytics` references datasource A;
  - pipeline in `kasadata` references datasource B.

  The reader must return only the visible pipeline in the requested database that references the requested datasource.
- [ ] Run the red tests:

```powershell
npm test -- --runInBand src/tests/infrastructure/providers/database-service/database-catalog.reader.spec.ts src/tests/infrastructure/prisma/database-service/database-source-usage.reader.spec.ts
```

- [ ] Implement `DatabaseCatalogReader` as a narrow adapter around the existing catalog-exploration port. Do not make application/database-service import Trino or SQL types.
- [ ] Implement `PrismaDatabaseSourceUsageReader` by selecting safe pipeline identity plus graph JSON and using `summarizePipelineGraph`; do not duplicate graph traversal rules in the adapter.
- [ ] Scope both adapters through the authenticated organization context already used by their infrastructure layer.
- [ ] Run the focused tests again and confirm they pass.
- [ ] Commit:

```powershell
git add src/infrastructure/providers/database-service src/infrastructure/prisma/database-service src/tests/infrastructure/providers/database-service src/tests/infrastructure/prisma/database-service
git commit -m "feat: add datasource membership validation adapters"
```

## Task 4: Implement Membership Use Cases and Transactional Guards

**Files:**

- Create: `src/application/database-service/database-service-membership.use-cases.ts`
- Modify: `src/application/database-service/database-service.use-cases.ts`
- Modify: `src/domain/database-service/errors/connection.errors.ts`
- Modify: `src/tests/application/database-service/database-service.use-cases.spec.ts`
- Create: `src/tests/application/database-service/database-service-membership.use-cases.spec.ts`
- Modify: `src/tests/application/database-service/database-membership.spec.ts`

- [ ] Write failing tests for `DatabaseServiceMembershipUseCases`:
  - available list excludes a datasource already linked to the selected database;
  - attach rejects an absent catalog database with `DATABASE_NOT_FOUND`;
  - attach rejects an absent, archived, or cross-organization datasource as `DATABASE_SERVICE_NOT_FOUND`;
  - repeated attach succeeds without duplicate state;
  - detach ignores a missing membership;
  - detach removes only the selected membership;
  - a current-database pipeline blocks detach with `DATASOURCE_USED_BY_PIPELINES` and safe `{ id, name }` details;
  - another-database pipeline does not block detach.
- [ ] Add failing existing-use-case tests proving:
  - create with `initialDatabaseName` validates the catalog and creates datasource plus membership in one unit of work;
  - failure rolls both writes back;
  - differing `databaseName` compatibility alias and `initialDatabaseName` fail validation;
  - archive fails with `DATASOURCE_STILL_LINKED` while any membership exists;
  - archive retains current behavior after the last membership is removed.
- [ ] Run the red tests:

```powershell
npm test -- --runInBand src/tests/application/database-service/database-service-membership.use-cases.spec.ts src/tests/application/database-service/database-service.use-cases.spec.ts src/tests/application/database-service/database-membership.spec.ts
```

- [ ] Implement one focused `DatabaseServiceMembershipUseCases` class with `listAvailable`, `attach`, and `detach`. It orchestrates ports only and contains no Prisma, HTTP, or catalog SQL.
- [ ] Extend `DatabaseServiceUseCases.create` only for atomic initial membership coordination and `archive` only for the membership guard. Do not move unrelated connection verification logic.
- [ ] Add structured domain/application errors with safe details. Keep connection configuration and credentials out of error construction.
- [ ] Ensure transaction boundaries cover:
  - datasource create plus initial membership;
  - membership row lock, usage check, and detach;
  - membership check plus archive.
- [ ] Run the focused tests again and confirm they pass.
- [ ] Commit:

```powershell
git add src/application/database-service src/domain/database-service src/tests/application/database-service
git commit -m "feat: enforce datasource membership rules"
```

## Task 5: Prevent Pipelines from Referencing Unlinked Datasources

**Files:**

- Create: `src/application/pipeline-authoring/interfaces/i-pipeline-source-membership-reader.ts`
- Modify: `src/application/pipeline-authoring/tokens.ts`
- Modify: `src/application/pipeline-authoring/pipeline-authoring.use-cases.ts`
- Create: `src/infrastructure/prisma/pipeline-authoring/prisma-pipeline-source-membership.reader.ts`
- Modify: `src/tests/application/pipeline-authoring/pipeline-authoring.use-cases.spec.ts`
- Create: `src/tests/infrastructure/prisma/pipeline-authoring/pipeline-source-membership.reader.spec.ts`

- [ ] Write failing application tests proving create and update reject a graph whose source datasource is not linked to the pipeline's `databaseName`.
- [ ] Add positive tests for a linked source and a graph with multiple sources where every source is linked.
- [ ] Add a test proving one missing membership rejects the entire save before repository persistence.
- [ ] Run the red tests:

```powershell
npm test -- --runInBand src/tests/application/pipeline-authoring/pipeline-authoring.use-cases.spec.ts src/tests/infrastructure/prisma/pipeline-authoring/pipeline-source-membership.reader.spec.ts
```

- [ ] Define a pipeline-authoring-owned port that locks and verifies memberships for `(databaseName, databaseServiceIds[])`. This avoids coupling pipeline authoring to a Prisma repository from another context.
- [ ] Reuse `summarizePipelineGraph(graph).sourceConnectionIds` in the application service and lock every membership in stable datasource-ID order inside the same unit-of-work boundary as pipeline persistence. Stable ordering prevents deadlocks when graphs contain several sources.
- [ ] Implement the Prisma adapter against the membership table with organization scope and the same row-lock semantics used by detach. If detach commits first, pipeline save sees a missing membership and fails; if pipeline save locks first, detach waits and then observes the new pipeline usage.
- [ ] Return the existing pipeline validation shape with a precise source-node/membership issue; do not leak database rows.
- [ ] Run the focused tests again and confirm they pass.
- [ ] Commit:

```powershell
git add src/application/pipeline-authoring src/infrastructure/prisma/pipeline-authoring src/tests/application/pipeline-authoring src/tests/infrastructure/prisma/pipeline-authoring
git commit -m "feat: validate pipeline datasource memberships"
```

## Task 6: Expose the Core HTTP Contract and Wire Dependencies

**Files:**

- Modify: `src/presentation/database-service/database-service.dto.ts`
- Modify: `src/presentation/database-service/database-service.response.ts`
- Modify: `src/presentation/database-service/database-service.mapper.ts`
- Modify: `src/presentation/database-service/database-service.controller.ts`
- Modify: `src/presentation/http/error-http.registry.ts`
- Modify: `src/modules/database-service.module.ts`
- Modify: `src/modules/pipeline-authoring.module.ts`
- Modify: `src/tests/presentation/database-service/connection.controller.spec.ts`
- Modify: `src/tests/presentation/http/error-http-mapping.spec.ts`
- Modify: `src/tests/modules/module-wiring.spec.ts`

- [ ] Write failing controller tests for:
  - `GET /api/v1/database-services?databaseName=kasadata`;
  - `GET /api/v1/database-services/available?databaseName=kasadata&search=kasa&page=1`;
  - idempotent `PUT /api/v1/database-services/:id/memberships/:databaseName`;
  - idempotent `DELETE /api/v1/database-services/:id/memberships/:databaseName`;
  - create accepts `initialDatabaseName`, temporarily accepts matching legacy `databaseName`, and rejects differing values;
  - response has sorted `databaseNames` and no singular `databaseName`;
  - encoded database names are decoded once and validated.
- [ ] Add failing HTTP error tests mapping `DATABASE_NOT_FOUND` and `DATABASE_SERVICE_NOT_FOUND` to 404, and `DATASOURCE_USED_BY_PIPELINES` and `DATASOURCE_STILL_LINKED` to 409.
- [ ] Add failing module-wiring tests for every new port and adapter.
- [ ] Run the red tests:

```powershell
npm test -- --runInBand src/tests/presentation/database-service/connection.controller.spec.ts src/tests/presentation/http/error-http-mapping.spec.ts src/tests/modules/module-wiring.spec.ts
```

- [ ] Add DTO validation for database names, pagination, and search using existing decorators and limits.
- [ ] Keep controllers limited to request mapping, use-case calls, and response mapping. Do not query memberships or pipelines in the controller.
- [ ] Map only safe pipeline identity details into 409 responses.
- [ ] Register the new adapters and tokens without introducing circular module imports. Use exported application ports where cross-context wiring is needed.
- [ ] Run the focused tests again and confirm they pass.
- [ ] Run Core validation:

```powershell
npm run prisma:validate
npm run typecheck
npm run lint -- --quiet
```

- [ ] Commit:

```powershell
git add src/presentation src/modules src/tests/presentation src/tests/modules
git commit -m "feat: expose datasource membership API"
```

## Task 7: Keep Data Workflow and CDC Source Selection Compatible

**Core files:**

- Modify: `src/application/data-workflow-watch-source/read-models/watch-source-catalog.view.ts`
- Modify: `src/infrastructure/data-workflow-watch-source/watch-source-access.adapter.ts`
- Modify: `src/tests/application/data-workflow-watch-source/watch-source-catalog.spec.ts`
- Modify: `src/tests/presentation/data-workflow-watch-source/watch-source.controller.spec.ts`

**Web files:**

- Modify: `src/entities/models/data-workflow-watch-source.ts`
- Modify: `src/infrastructure/repositories/data-workflow-api.mapper.ts`
- Modify: `app/(workspace)/data-workflows/_components/schedule-trigger-panel.tsx`
- Modify: `tests/unit/app/schedule-trigger-panel.test.tsx`
- Modify: `tests/unit/infrastructure/repositories/data-workflow-api.mapper.test.ts`

- [ ] Write failing Core tests proving Watch Source datasource summaries return sorted `databaseNames` from memberships and no longer read the removed singular column.
- [ ] Add a Core regression test proving CDC connection details still come from the datasource's normalized source connection config. Catalog memberships must not replace the PostgreSQL/MySQL source database name used by Debezium.
- [ ] Write failing Web mapper and panel tests for an unassigned datasource, one membership, and multiple memberships.
- [ ] For a shared datasource, derive the existing database-scoped CDC setup link from the first sorted membership and label it as shared. Do not invent a second CDC profile or choose a source database from catalog membership.
- [ ] Run the red tests:

```powershell
# celesnity-core
npm test -- --runInBand src/tests/application/data-workflow-watch-source/watch-source-catalog.spec.ts src/tests/presentation/data-workflow-watch-source/watch-source.controller.spec.ts

# celesnity-web
npx vitest run tests/unit/app/schedule-trigger-panel.test.tsx tests/unit/infrastructure/repositories/data-workflow-api.mapper.test.ts
```

- [ ] Update the Watch Source read projection and adapter to use memberships while preserving datasource-level CDC ownership and table metadata behavior.
- [ ] Update the Web entity, mapper, and link derivation without adding membership rules to the React component.
- [ ] Run the focused tests again and confirm they pass.
- [ ] Commit in each affected repository with the same intent:

```powershell
git add src/application/data-workflow-watch-source src/infrastructure/data-workflow-watch-source src/tests/application/data-workflow-watch-source src/tests/presentation/data-workflow-watch-source
git commit -m "refactor: keep watch sources compatible with shared memberships"
```

```powershell
git add src/entities/models/data-workflow-watch-source.ts src/infrastructure/repositories/data-workflow-api.mapper.ts "app/(workspace)/data-workflows/_components/schedule-trigger-panel.tsx" tests/unit/app/schedule-trigger-panel.test.tsx tests/unit/infrastructure/repositories/data-workflow-api.mapper.test.ts
git commit -m "refactor: render shared workflow datasources"
```

## Task 8: Update Web Entities, Use Cases, Repository, and Controllers

**Files:**

- Modify: `src/entities/models/database-service.ts`
- Modify: `src/application/repositories/database-service.repository.interface.ts`
- Modify: `src/application/use-cases/database-services/normalize-database-service-input.ts`
- Create: `src/application/use-cases/database-services/list-available-database-services.use-case.ts`
- Create: `src/application/use-cases/database-services/attach-database-service.use-case.ts`
- Create: `src/application/use-cases/database-services/detach-database-service.use-case.ts`
- Modify: `src/infrastructure/repositories/database-service-api.mapper.ts`
- Modify: `src/infrastructure/repositories/core-api-database-service.repository.ts`
- Modify: `src/interface-adapters/controllers/database-services/database-service.schemas.ts`
- Modify: `src/interface-adapters/presenters/database-service.presenter.ts`
- Create: `src/interface-adapters/controllers/database-services/list-available-database-services.controller.ts`
- Create: `src/interface-adapters/controllers/database-services/attach-database-service.controller.ts`
- Create: `src/interface-adapters/controllers/database-services/detach-database-service.controller.ts`
- Modify: `di/modules/database-services.module.ts`
- Modify: `di/types.ts`
- Create: `tests/unit/application/use-cases/database-services/database-service-membership.use-cases.test.ts`
- Modify: `tests/unit/infrastructure/repositories/core-api-database-service.repository.test.ts`
- Create: `tests/unit/interface-adapters/controllers/database-services/database-service-membership.controller.test.ts`
- Modify: `tests/unit/di/container.test.ts`
- Modify: `tests/unit/tooling/architecture-boundaries.test.ts`

- [ ] Write failing entity/mapper tests replacing `databaseName?: string` with `databaseNames: readonly string[]` and replacing create input membership with `initialDatabaseName?: string`.
- [ ] Write failing use-case tests proving input trimming/validation, delegation, and typed conflict propagation without UI concerns.
- [ ] Write failing repository tests for the exact available, attach, and detach URLs with URL-encoded database names.
- [ ] Write failing controller and DI tests for the focused use cases.
- [ ] Extend the architecture-boundary test so React/app files cannot import the Core API repository directly and infrastructure cannot import app components.
- [ ] Run the red Web tests:

```powershell
npx vitest run tests/unit/application/use-cases/database-services/database-service-membership.use-cases.test.ts tests/unit/infrastructure/repositories/core-api-database-service.repository.test.ts tests/unit/interface-adapters/controllers/database-services/database-service-membership.controller.test.ts tests/unit/di/container.test.ts tests/unit/tooling/architecture-boundaries.test.ts
```

- [ ] Implement the Web contracts with focused methods:

```ts
listAvailable(query: DatabaseServiceListQuery & { databaseName: string }): Promise<DatabaseServiceListPage>;
attach(id: string, databaseName: string): Promise<void>;
detach(id: string, databaseName: string): Promise<void>;
```

- [ ] Parse Core responses at the infrastructure boundary. Keep API casing, status codes, and raw error bodies out of entities and components.
- [ ] Map 409 conflict details into a typed controller result containing safe pipeline IDs/names for the removal dialog.
- [ ] Run the focused tests again and confirm they pass.
- [ ] Commit in `celesnity-web`:

```powershell
git add src di tests/unit/application tests/unit/infrastructure tests/unit/interface-adapters tests/unit/di tests/unit/tooling
git commit -m "feat: add datasource membership web contracts"
```

## Task 9: Build the Add Datasource and Choose Existing Flow

**Files:**

- Create: `app/_components/database-service/add-database-source-dialog.tsx`
- Create: `app/_components/database-service/existing-database-source-picker.tsx`
- Modify: `app/_components/database-service/database-services-screen.tsx`
- Modify: `app/_components/database-service/database-service-form.tsx`
- Modify: `app/_i18n/en.ts`
- Modify: `app/_i18n/vi.ts`
- Create: `tests/unit/app/add-database-source-dialog.test.tsx`
- Create: `tests/unit/app/existing-database-source-picker.test.tsx`
- Modify: `tests/unit/app/database-services-screen.test.tsx`

- [ ] Write failing component tests proving:
  - database-scoped **Add datasource** opens a two-choice dialog;
  - **Create new datasource** opens the existing form and submits `initialDatabaseName` from page context;
  - **Choose existing datasource** loads candidates only after the choice is opened;
  - search and pagination call the candidate controller;
  - each row has an explicit **Add** button, not a checkbox;
  - a successful Add removes the candidate and refreshes the linked list;
  - a failed Add keeps the candidate visible and shows an inline error;
  - the global datasource page retains its existing create behavior.
- [ ] Run the red tests:

```powershell
npx vitest run tests/unit/app/add-database-source-dialog.test.tsx tests/unit/app/existing-database-source-picker.test.tsx tests/unit/app/database-services-screen.test.tsx
```

- [ ] Implement `AddDatabaseSourceDialog` as a presentational choice surface with callbacks only.
- [ ] Implement `ExistingDatabaseSourcePicker` with explicit loading, empty, error, search, pagination, and per-row pending states. Keep fetching in controller/use-case callbacks supplied by the screen.
- [ ] Refactor `DatabaseServicesScreen` into small handlers/hooks where necessary; do not place API calls or membership rules inside list-row JSX.
- [ ] Ensure create uses the current route database as immutable context rather than a user-editable membership field.
- [ ] Add English and Vietnamese copy for add, choose, shared count, failure, and empty states.
- [ ] Run the focused tests again and confirm they pass.
- [ ] Commit in `celesnity-web`:

```powershell
git add app/_components/database-service app/_i18n tests/unit/app
git commit -m "feat: add existing datasource picker"
```

## Task 10: Replace Database-Scoped Archive with Safe Remove

**Files:**

- Modify: `app/_components/database-service/database-service-list.tsx`
- Modify: `app/_components/database-service/database-services-screen.tsx`
- Modify: `app/(workspace)/databases/[database]/_components/database-screen.tsx`
- Modify: `app/_i18n/en.ts`
- Modify: `app/_i18n/vi.ts`
- Modify: `tests/unit/app/database-services-screen.test.tsx`
- Modify: `tests/unit/app/database-screen.test.ts`
- Create: `tests/unit/app/remove-database-source-dialog.test.tsx`

- [ ] Write failing UI tests proving:
  - a datasource linked to two databases renders `Shared with 2 databases`;
  - a database-scoped row exposes **Remove from this database**, not Archive;
  - confirmation explains the connection remains available to other databases;
  - the row stays visible while detach is pending;
  - the row disappears only after successful Core confirmation;
  - a `DATASOURCE_USED_BY_PIPELINES` conflict keeps the row and shows safe pipeline names with actionable guidance;
  - a generic failure keeps the row and supports retry;
  - the global surface still owns the archive action and Core can reject it while linked.
- [ ] Run the red tests:

```powershell
npx vitest run tests/unit/app/remove-database-source-dialog.test.tsx tests/unit/app/database-services-screen.test.tsx tests/unit/app/database-screen.test.ts
```

- [ ] Implement the remove confirmation as a focused component or a small state machine inside the screen. Do not optimistically mutate the linked list.
- [ ] Derive the shared count from `databaseNames.length`; never issue a separate credential/source copy count.
- [ ] Preserve database-scoped source detail navigation and make shared crawler/CDC ownership clear in helper copy.
- [ ] Run the focused tests again and confirm they pass.
- [ ] Run Web validation:

```powershell
npm run typecheck
npm run lint
npx vitest run tests/unit/app/database-services-screen.test.tsx tests/unit/app/database-screen.test.ts tests/unit/app/add-database-source-dialog.test.tsx tests/unit/app/existing-database-source-picker.test.tsx tests/unit/app/remove-database-source-dialog.test.tsx tests/unit/application/use-cases/database-services/database-service-membership.use-cases.test.ts tests/unit/infrastructure/repositories/core-api-database-service.repository.test.ts tests/unit/interface-adapters/controllers/database-services/database-service-membership.controller.test.ts tests/unit/di/container.test.ts tests/unit/tooling/architecture-boundaries.test.ts
```

- [ ] Commit in `celesnity-web`:

```powershell
git add app src tests
git commit -m "feat: manage shared datasources from database pages"
```

## Task 11: Verify Migration, Cross-Repository Behavior, and Regression Boundaries

**Files:**

- Modify only failing tests or production files directly related to this feature.
- Do not change `celesnity-infra` unless runtime evidence identifies a real deployment-order issue.

- [ ] Start from a local database snapshot containing:
  - one datasource with `database_name = 'kasadata'`;
  - one datasource with `database_name = NULL` such as `KasaDev`;
  - one datasource linked to a pipeline.
- [ ] Apply the new migration once and inspect counts:
  - the non-null legacy datasource has exactly one membership;
  - `KasaDev` has zero memberships and remains active;
  - no datasource, credential, crawler, or CDC profile row is duplicated;
  - the singular column is gone.
- [ ] Re-run deployment/migration resolution using the repository's supported Prisma workflow and confirm no P3009 failure is introduced.
- [ ] Run the complete relevant Core suite:

```powershell
npm test -- --runInBand src/tests/domain/database-service src/tests/application/database-service src/tests/application/pipeline-authoring src/tests/infrastructure/prisma/database-service src/tests/infrastructure/prisma/pipeline-authoring src/tests/infrastructure/providers/database-service src/tests/presentation/database-service src/tests/presentation/http src/tests/modules/module-wiring.spec.ts
npm run prisma:validate
npm run typecheck
npm run lint -- --quiet
npm run build
```

- [ ] Run the complete relevant Web suite:

```powershell
npx vitest run tests/unit/app/database-services-screen.test.tsx tests/unit/app/database-screen.test.ts tests/unit/app/add-database-source-dialog.test.tsx tests/unit/app/existing-database-source-picker.test.tsx tests/unit/app/remove-database-source-dialog.test.tsx tests/unit/application/use-cases/database-services tests/unit/infrastructure/repositories/core-api-database-service.repository.test.ts tests/unit/interface-adapters/controllers/database-services tests/unit/di/container.test.ts tests/unit/tooling/architecture-boundaries.test.ts
npm run typecheck
npm run lint
npm run build
```

- [ ] Perform the local E2E scenario:
  1. Open `kasadata > Sources` and choose existing `KasaDev`.
  2. Confirm it appears without re-entering credentials.
  3. Link the same datasource to a second database and confirm both pages show one shared datasource.
  4. Confirm only one credential, crawler, CDC profile, and Debezium connector identity remains.
  5. Create or update a pipeline in `kasadata` using the datasource.
  6. Confirm removal from `kasadata` is blocked and safe pipeline names are shown.
  7. Remove the pipeline reference, detach from `kasadata`, and confirm the second membership remains.
  8. Confirm archive remains blocked until the final membership is removed.
  9. Run a pipeline and a CDC-triggered workflow after sharing to prove existing runtime IDs still resolve.
- [ ] Review the final diff specifically against the five Review Focus failure modes.
- [ ] Confirm no response, log, test snapshot, or error includes connection strings or credentials.
- [ ] Commit any evidence-driven fixes in the repository they belong to, using a focused message.

## Completion Criteria

- Core and Web remain on `feat/data-workflows`, whose base includes `origin/release/0.4.0`, and the datasource-membership commits are reviewable separately from the preceding workflow/CDC checkpoint commits.
- All focused and build checks above pass with captured output.
- Database membership has one persistence source of truth.
- Domain and application layers have no Prisma, Nest, HTTP, React, or Trino implementation dependencies.
- Database-scoped UI supports Create new, Choose existing, and Remove from this database.
- A datasource can be shared without duplicating credentials, crawler state, CDC profile, or connector identity.
- Detach, archive, and pipeline-save races are covered by application tests and transactional persistence behavior.
- The local E2E scenario passes without mutating customer datasource data.
