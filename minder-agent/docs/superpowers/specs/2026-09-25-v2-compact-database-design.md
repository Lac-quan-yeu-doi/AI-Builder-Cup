# V2 Compact Database Design

## Goal and relationship to API v2

Make PostgreSQL persistence smaller and easier to maintain during the v2
delivery. This is a companion phase to
[`2026-09-25-api-v2-standardization-design.md`](2026-09-25-api-v2-standardization-design.md),
not a second database for `/api/v2`. Both API versions continue to use the
same run manager, Prisma store, authorization, and database. Implement this
phase after the v2 HTTP contract is stable so the two changes can be reviewed
independently.

## Target schema

| Remove | Source that remains | Public result |
| --- | --- | --- |
| `run_traces` | `run_events` keyed by `(run_id, seq)` | Trace keeps `seq`, `event`, `created_at`, and cursor order. `created_at` comes from the journal event. |
| `run_validations` | `runs.status`, `runs.error`, `runs.finished_at` | A finalized run has one `run_status` validation. |
| `run_reports` | `runs.response_text`, `runs.finished_at` | A finalized run has a report with `markdown`, derived `artifact_id`, UTF-8 `byte_size`, and `created_at`. |
| `sessions.app_state` | No runtime reader or writer | No public field changes. |
| `rooms.closed_at` | `rooms.status` | Room close behavior and response stay the same; closure time is no longer stored. |
| `agents.updated_at` | No application reader; current upserts do not maintain it | Agent responses stay the same. |
| `run_manifests.content_hash`, `manifest_name`, `source_path`, `yaml` | The corresponding string fields in `run_manifests.manifest` JSON | Manifest response fields remain, derived from the snapshot. The `run_manifests` table remains. |

Replace the partial `rooms_owner_key` index with one ordinary unique index
on `(owner, key)` represented in Prisma. A nullable `key` still allows rooms
without a key; non-null keys stay unique per owner. Do not change `runs.manifest_name`:
it is the run's selected agent name, not a duplicate snapshot column.

The Prisma schema has 20 models instead of 23. Keep `room_runs`,
`room_queue_items`, `agent_revisions`, approval execution claims, governance
records, file accesses, and their owner or recovery data. Leave
`minder_schema_migrations` untouched: do not drop, rename, alter, or use it as
the tracker for this phase.

## Read and write behavior

`RunEvidencePort` remains the application-facing evidence read contract and
the manifest snapshot writer. Its trace, validation, and report write methods
are removed. The durable adapter projects the three reads from `run_events`
and `runs` through typed Prisma queries. The runtime stops performing the
three best-effort duplicate writes. The manifest snapshot remains best-effort.
No new table, database view, generic projection framework, or v2-only store is
introduced.

Every evidence read first proves that the run belongs to the authenticated
owner via its session, as the existing repository does. A missing or foreign
run remains unavailable. Trace pagination uses `seq > cursor`, ascending
order, and `limit + 1` rows to compute `next_cursor`; no event ID or journal
payload changes. V1 keeps its existing query aliases; v2 uses its specified
`cursor` and `limit` parameters.

A run with `finished_at IS NULL` has no derived validation or report. A run
with `finished_at` has a `run_status` validation with `passed` equal to
`status === "completed"`, `details.status`, and optional `details.error`.
Its report uses `response_text`, `<run_id>:report`, UTF-8 byte length, and
`finished_at` for `created_at`. This also covers paused and recovered runs
that have `finished_at`; it mirrors the current `finalizeRun` boundary. The
manifest response includes a scalar metadata field only when its JSON field
is a string, matching the current recorder's extraction rule.

The agreed behavior change is that a formerly failed best-effort evidence
write no longer hides a trace event, validation, or report if the authoritative
run data exists. Trace `created_at` moves from the later trace write to the
journal write; validation/report `created_at` moves to `runs.finished_at`.
Existing response field names, error codes, owner checks, and v1/v2 routes
remain intact.

## Existing-data gate

Before any destructive migration, run read-only checks in the target schema:

- Every existing trace row must match a `run_events` row by `(run_id, seq)` and
  JSON payload. Extra journal events are expected because old trace writes
  were best-effort.
- Every validation row must be the current `run_status` projection. An
  independently named validation or conflicting details blocks deletion.
- Every report's markdown, artifact ID, and byte size must be derivable from
  its run. A non-derivable report blocks deletion.
- Every non-null manifest scalar must match the corresponding string in its
  JSON snapshot. A mismatch blocks column deletion.
- A non-null `sessions.app_state` value blocks deletion until its data has an
  explicit disposition. Document any external SQL consumers of the columns
  or tables slated for removal.

Take a verified backup or snapshot before applying the drop. If a check finds
independent data, stop and revise this design for that data; do not silently
discard it. The removed timestamps and unused columns are intentionally not
preserved in the active schema. A backup is the recovery source for them.

## Migration and deployment

The current `migratePrismaSchema()` reruns an embedded `CREATE TABLE IF NOT
EXISTS` baseline on startup. Update that baseline to the compact shape for
new databases, or dropped tables would reappear. Keep the historical baseline
SQL migration file as history. Use a separate, explicit, idempotent v2 compact
migration command for existing schemas; do not run destructive DDL as part of
normal application startup. Do not change `minder_schema_migrations`.

Deploy compact-schema application code and regenerated Prisma client first,
then wait until old application replicas have stopped before running the
one-time drop command. The new code must work while the old columns and tables
still exist. Confirm the preflight and backup, run the command against the
explicit configured schema, and inspect the resulting catalog. An old binary
cannot safely be restarted after the drop; rollback then requires restoring
the backup or reintroducing the old schema and data.

## Acceptance

- A new throwaway database starts directly with the compact 20-model shape.
- An existing throwaway database migrates without deleting runs, sessions,
  journal events, manifests, room state, approvals, or governance data.
- V1 and v2 evidence responses retain their fields and owner isolation;
  trace cursor replay remains ordered and complete.
- The three duplicate evidence writes and tables are gone; startup does not
  recreate them.
- The migration command is idempotent and aborts on non-derivable legacy data.
- `minder_schema_migrations` is unchanged.

## Out of scope

Do not add a request-ID database column, change run admission or SSE payloads,
normalize room membership against the agent configuration table, remove room
queue/history, or consolidate approval/governance audit records. These have
independent runtime meanings.
