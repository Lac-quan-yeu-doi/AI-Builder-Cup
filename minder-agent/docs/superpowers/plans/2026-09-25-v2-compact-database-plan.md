# V2 Compact Database Implementation Plan

> **For agentic workers:** Implement this plan task by task after the API v2 contract is stable. This document is a future engineering plan; no database change has been run while writing it. Checkboxes track future work.

**Goal:** Remove three duplicate run-evidence tables and seven redundant or unused columns while keeping one owner-scoped persistence path for both API versions.

**Architecture:** `run_events` supplies trace records; `runs` supplies validation and report projections; `run_manifests.manifest` supplies manifest metadata. Runtime code stops duplicate writes. A separate operator command performs guarded destructive DDL after the new code is deployed; the startup baseline creates the compact schema for fresh databases.

**Tech Stack:** TypeScript 5.9, NestJS 11, Prisma 6, PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-v2-compact-database-design.md`

## Global Constraints

- Run this phase after the API v2 route/response work in `docs/superpowers/plans/2026-09-25-api-v2-standardization-plan.md`; do not create a v2-only store.
- Preserve v1 and v2 URL, JSON field, error-code, owner-isolation, SSE event ID, replay, and run-lifecycle contracts except for the evidence availability and timestamps explicitly changed in the spec.
- Keep `run_manifests`, `room_runs`, `room_queue_items`, `agent_revisions`, approvals, governance, and file-access records.
- Do not alter, drop, rename, or use `minder_schema_migrations` for tracking.
- Do not run destructive SQL at application startup. Production application persistence remains typed Prisma; raw SQL stays inside migration tooling.
- Use an explicitly configured target schema, a verified backup, and a throwaway database for migration tests. Never use a developer `.env` for tests.
- Preserve unrelated working-tree changes. Do not commit, push, branch, open a PR, merge, tag, or deploy unless the user explicitly asks.

## File map

| File | Responsibility |
| --- | --- |
| `src/application/shared/ports/observability/evidence.ts` | Retain manifest write/read and three evidence reads; remove duplicate write operations. |
| `src/application/runtime/execution/runtime-run-manager.ts` | Keep a best-effort manifest snapshot; stop trace/validation/report writes. |
| `src/application/runtime/governance/evidence-recorder.ts` | Delete after its remaining manifest behavior moves into the run manager. |
| `src/infrastructure/prisma/repositories/evidence.ts` | Authorize the run and project trace, validation, report, and manifest metadata through typed Prisma. |
| `src/infrastructure/prisma/repositories/rooms.ts` | Close rooms by `status` only. |
| `src/infrastructure/prisma/schema.prisma` | Describe the compact runtime schema and ordinary room-key uniqueness. |
| `src/infrastructure/prisma/migration-sql.ts` | Create only the compact shape on a new database; retain the migration-table definition unchanged. |
| `src/infrastructure/prisma/schema/compact-v2.ts` | Guard and apply the one-time existing-database drop in the migration boundary. |
| `src/bootstrap/compact-v2-cli.ts`, `package.json` | Expose an explicit operator command; never call it during normal startup. |
| `docs/operations/v2-compact-database.md` | Document preflight, backup, rollout, execution, catalog checks, and rollback. |

---

### Task 1: Read evidence from authoritative run data

**Files:**
- Modify: `src/application/shared/ports/observability/evidence.ts`
- Modify: `src/application/runtime/execution/runtime-run-manager.ts`
- Delete: `src/application/runtime/governance/evidence-recorder.ts`
- Modify: `src/infrastructure/prisma/repositories/evidence.ts`
- Modify: `src/tests/application/runtime/evidence-recorder.test.ts` (replace with a focused run-manager evidence test)
- Modify: `src/tests/infrastructure/prisma-pg/runtime/prisma-repositories.test.ts`
- Modify: `src/tests/presentation/http/http.test.ts`

**Interfaces:** `RunEvidencePort` keeps `saveManifest`, `getManifest`, `listTrace`, `listValidations`, and `getReport`. Remove `appendTrace`, `recordValidation`, and `saveReport`. No controller gains a Prisma dependency.

- [ ] **Step 1: Characterize current observable behavior.** In the focused repository and HTTP tests, assert owner isolation, the trace page boundary (`seq > cursor`, ascending, `next_cursor` when more rows exist), validation and report shapes, and that unfinished runs have no validation/report. Add a run with a journal event but no old trace row: its trace must now include that event. Add a finalized run with no old report row: its report must now exist.
- [ ] **Step 2: Run only those focused tests to establish the expected failures.** Start the throwaway service with `rtk proxy docker compose -f docker-compose.test.yml up -d --wait`, then run `rtk proxy env MINDER_TEST_DATABASE_URL='postgres://minder:minder@127.0.0.1:5433/minder_test' npm test -- src/tests/infrastructure/prisma-pg/runtime/prisma-repositories.test.ts src/tests/presentation/http/http.test.ts src/tests/application/runtime/evidence-recorder.test.ts`. Expect the new projection cases to fail before changing reads; do not count skipped database tests as a pass.
- [ ] **Step 3: Replace the three Prisma reads.** Authorize `runId` through its session owner before querying. For trace, query `runEvent.findMany` with `seq > parsed cursor`, `orderBy: { seq: "asc" }`, and `take: Math.min(Math.max(limit, 1), 500) + 1`; map `event` and `createdAt` without changing `seq`. For validation/report, read the authorized `run`; return `[]`/`undefined` when `finishedAt === null`. Otherwise construct exactly:

  ```ts
  {
    name: "run_status",
    passed: run.status === "completed",
    details: {
      status: run.status,
      ...(run.error === null ? {} : { error: run.error }),
    },
    createdAt: run.finishedAt.toISOString(),
  }
  // report: markdown = run.responseText;
  // artifactId = `${run.id}:report`;
  // byteSize = Buffer.byteLength(run.responseText, "utf8");
  // createdAt = run.finishedAt.toISOString().
  ```

- [ ] **Step 4: Remove duplicate writes.** Remove the three write methods from the port and adapter. Remove the `RuntimeRunManager` calls to `trace()` and `complete()` after journal writes/finalization. Keep journal-before-publish ordering. Move the remaining best-effort manifest snapshot into one private run-manager method that calls `saveManifest` and logs errors through the existing `debugLog` callback; preserve the current `manifestHash` → `contentHash`, `manifestName`, `manifestSourcePath` → `sourcePath`, and `manifestYaml` → `yaml` extraction until Task 2 removes those database fields. Remove `RuntimeEvidenceRecorder` and its test once the focused run-manager test covers this behavior. Keep both current manifest call sites (direct and queued admission).
- [ ] **Step 5: Verify this code against the old schema.** Run the focused tests from Step 2, the relevant runtime-run-manager test, `rtk npm run check`, and `rtk npm run lint`. The application must work while legacy evidence tables still exist. Do not drop any table in this task.

**Review gate:** Both API versions still authorize first and emit the same field names. Trace reads the journal, including a previously omitted best-effort trace event. No runtime code writes `run_traces`, `run_validations`, or `run_reports`.

---

### Task 2: Remove redundant column use from application code

**Files:**
- Modify: `src/application/shared/ports/observability/evidence.ts`
- Modify: `src/infrastructure/prisma/repositories/evidence.ts`
- Modify: `src/infrastructure/prisma/repositories/rooms.ts`
- Modify: `src/infrastructure/prisma/schema.prisma`
- Modify: `src/tests/infrastructure/prisma-pg/runtime/prisma-repositories.test.ts`
- Modify: `src/tests/infrastructure/prisma-pg/runtime/prisma-room-repositories.test.ts`
- Modify: `src/tests/presentation/http/http.test.ts`

**Interfaces:** `RunManifestRecord` retains the public scalar metadata fields, but the database stores only `manifest` and `createdAt`. `RunEvidencePort.saveManifest` may accept its existing record shape; it must ignore the redundant scalar values when writing.

- [ ] **Step 1: Add focused tests.** A manifest JSON snapshot containing string `manifestHash`, `manifestName`, `manifestSourcePath`, and `manifestYaml` must return `content_hash`, `manifest_name`, `source_path`, and `yaml`. Null or non-string JSON values omit the corresponding response field. Closing a room still returns `status: "closed"`; a second owner cannot close it. Keyed rooms stay unique per owner and multiple keyless rooms remain valid.
- [ ] **Step 2: Update the adapter and room close path.** In `PrismaRunEvidencePort`, write only `runId`, `manifest`, and `createdAt`; derive scalar metadata from the stored JSON using the current `typeof value === "string"` rule. In `PrismaRoomRepository.close`, update only `status`. Do not remove `runs.manifest_name`.
- [ ] **Step 3: Update Prisma's target shape and regenerate its client with a safe placeholder URL.** Delete models `RunTrace`, `RunValidation`, `RunReport`; remove `Session.appState`, `Room.closedAt`, `Agent.updatedAt`, and the four `RunManifest` scalar fields. Add `@@unique([owner, key], map: "rooms_owner_key_unique")` to `Room`. Leave `MinderSchemaMigration` untouched. Generate with `rtk proxy env DATABASE_URL='postgres://minder:minder@127.0.0.1:5433/minder_test' npx prisma generate --schema src/infrastructure/prisma/schema.prisma`; generation need not connect to this placeholder.
- [ ] **Step 4: Verify compatibility with the old physical schema.** Run focused repository, room, HTTP, and type/lint checks. A generated Prisma client with fewer fields must work while the old database still has extra columns/tables. Do not run the destructive migration yet.

**Review gate:** The application references none of the columns or Prisma models slated for removal. Existing rooms, agents, sessions, manifests, and evidence endpoints remain readable.

---

### Task 3: Add a guarded, explicit compact-schema migration

**Files:**
- Create: `src/infrastructure/prisma/schema/compact-v2.ts`
- Create: `src/bootstrap/compact-v2-cli.ts`
- Modify: `src/infrastructure/prisma/migration-sql.ts`
- Modify: `package.json`
- Create: `src/tests/infrastructure/prisma-pg/runtime/compact-v2.integration.test.ts`
- Create: `docs/operations/v2-compact-database.md`

**Interfaces:** Export `compactV2Schema(prisma: PrismaService, schema: string, confirmation: string): Promise<void>` from the migration boundary. Add `npm run db:compact:v2` as an explicit CLI, requiring `DATABASE_URL`, `MINDER_DATABASE_SCHEMA`, and `MINDER_COMPACT_V2_CONFIRM=COMPACT_MINDER_V2_SCHEMA`. No runtime module imports this function.

- [ ] **Step 1: Write throwaway-database migration tests.** Start from the old 23-model schema in an isolated test schema using the historical `src/infrastructure/prisma/migrations/20260920000000_baseline/migration.sql`. Insert matching run/event/manifest/evidence rows, a session, a keyed and keyless room, an agent, and approval/governance rows. Assert that a missing confirmation or a non-derivable trace/report/validation/manifest row aborts without dropping anything. Assert that a non-null `sessions.app_state` aborts. Assert the successful command leaves all authoritative rows, removes exactly the listed tables/columns, preserves nullable room-key behavior, and succeeds a second time.
- [ ] **Step 2: Make preflight part of the same migration transaction.** Use `normalizeDatabaseSchema` and `quoteIdentifier` from `database-config.ts` and set the target schema locally before any query. First reject a partial target shape: either all legacy objects exist or the full compact shape exists. If already compact, return successfully. Otherwise fail if any of these read-only mismatch counts is non-zero; do not print row content:

  ```sql
  SELECT count(*) FROM run_traces t
  LEFT JOIN run_events e ON e.run_id = t.run_id AND e.seq = t.seq
  WHERE e.run_id IS NULL OR t.event IS DISTINCT FROM e.event;

  SELECT count(*) FROM run_validations v JOIN runs r ON r.id = v.run_id
  WHERE v.name <> 'run_status'
     OR v.passed IS DISTINCT FROM (r.status = 'completed')
     OR v.details IS DISTINCT FROM
       (jsonb_build_object('status', r.status) ||
        CASE WHEN r.error IS NULL THEN '{}'::jsonb
             ELSE jsonb_build_object('error', r.error) END);

  SELECT count(*) FROM run_reports p JOIN runs r ON r.id = p.run_id
  WHERE p.markdown IS DISTINCT FROM r.response_text
     OR p.artifact_id IS DISTINCT FROM (r.id::text || ':report')
     OR p.byte_size IS DISTINCT FROM octet_length(convert_to(r.response_text, 'UTF8'));

  SELECT count(*) FROM sessions WHERE app_state IS NOT NULL;
  ```

  For each of the four manifest scalar columns, compare the column to the
  corresponding JSON string (`manifestHash`, `manifestName`,
  `manifestSourcePath`, `manifestYaml`) with `IS DISTINCT FROM`; treat null or
  non-string JSON as absent. A mismatch blocks deletion. Also check for any
  validation/report with `runs.finished_at IS NULL`.

- [ ] **Step 3: Apply only the targeted DDL, with no `CASCADE`.** After all preflight checks pass, run the equivalent of:

  ```sql
  DROP TABLE IF EXISTS run_traces;
  DROP TABLE IF EXISTS run_validations;
  DROP TABLE IF EXISTS run_reports;
  ALTER TABLE sessions DROP COLUMN IF EXISTS app_state;
  ALTER TABLE rooms DROP COLUMN IF EXISTS closed_at;
  ALTER TABLE agents DROP COLUMN IF EXISTS updated_at;
  ALTER TABLE run_manifests DROP COLUMN IF EXISTS content_hash,
    DROP COLUMN IF EXISTS manifest_name,
    DROP COLUMN IF EXISTS source_path,
    DROP COLUMN IF EXISTS yaml;
  CREATE UNIQUE INDEX IF NOT EXISTS rooms_owner_key_unique ON rooms(owner, key);
  DROP INDEX IF EXISTS rooms_owner_key;
  ```

  Keep `minder_schema_migrations` and its SQL definition byte-for-byte unchanged.
  The transaction must roll back if any statement fails.

- [ ] **Step 4: Update the startup baseline for fresh databases.** Remove the three table definitions and seven column definitions from `PRISMA_BASELINE_MIGRATION_SQL`; replace its partial room-key index with `rooms_owner_key_unique ON rooms(owner, key)`. Do not edit the historical `src/infrastructure/prisma/migrations/20260920000000_baseline/migration.sql`. A fresh startup must make the compact schema directly; a subsequent startup must not recreate deleted objects.
- [ ] **Step 5: Expose an operator-only command and runbook.** The CLI requires the three explicit environment values in the interface block, calls `compactV2Schema`, prints the schema name and a pass/fail result without row content, and disconnects Prisma in `finally`. The runbook requires a verified backup, an audit of external SQL consumers, rollout of Task 1–2 code to every replica, old-replica drain, the explicit migration, catalog checks, and smoke reads for v1/v2 evidence, rooms, and run replay. State clearly that old binaries cannot be rolled back after the drop without restoring the backup or schema/data.
- [ ] **Step 6: Verify once in throwaway environments.** Run the focused migration integration test with `MINDER_TEST_DATABASE_URL`, then `rtk npm run test:architecture`, `rtk npm run check`, `rtk npm run lint`, and `rtk npm run build`. Start a fresh throwaway schema and an upgraded throwaway schema; in both, confirm 20 Prisma models' tables are present, removed objects are absent after repeated startup, and `minder_schema_migrations` remains unchanged. Do not point this check at a real database.

**Review gate:** The migration is explicit, repeatable, and aborts before destructive DDL on independent evidence. It neither touches `minder_schema_migrations` nor runs from service startup.

## Delivery handoff

The implementation is ready for a future deployment decision only after all three review gates pass and the operator has a verified backup of the actual target schema. Writing this plan does not authorize running the migration, deploying, or committing.
