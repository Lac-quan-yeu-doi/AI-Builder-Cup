# V2 compact database rollout

This command removes the legacy `run_traces`, `run_validations`, and
`run_reports` tables, plus seven unused or duplicated columns. The service must
already be running the compact-schema application code, and this operation is
not part of startup.

## Before the rollout

1. Take and verify a backup or snapshot of the target schema.
2. Audit external SQL consumers of the tables and columns being removed.
3. Deploy Task 1 and Task 2 code to every replica. Wait for every old binary to
   stop before continuing; old binaries still expect the removed objects.
4. Confirm the target database and `MINDER_DATABASE_SCHEMA` explicitly. The
   command does not use a schema default.

## Apply the compaction

Run the command with the target connection, schema, and exact confirmation:

```bash
DATABASE_URL="$TARGET_DATABASE_URL" \
MINDER_DATABASE_SCHEMA="minder_agent" \
MINDER_COMPACT_V2_CONFIRM="COMPACT_MINDER_V2_SCHEMA" \
npm run db:compact:v2
```

Preflight checks compare legacy evidence and manifest metadata with their
authoritative run data. Any mismatch or non-null `sessions.app_state` stops the
transaction before DDL. The command prints only the schema name and result; it
does not print row contents. It is repeatable after a successful run.

## After the command

Inspect the configured schema catalog. Confirm these tables are absent:

- `run_traces`
- `run_validations`
- `run_reports`

Confirm these columns are absent: `sessions.app_state`, `rooms.closed_at`,
`agents.updated_at`, and `run_manifests.content_hash`,
`run_manifests.manifest_name`, `run_manifests.source_path`, and
`run_manifests.yaml`. Confirm `rooms_owner_key_unique` is an ordinary unique
index on `(owner, key)` and `minder_schema_migrations` is unchanged.

Smoke-test v1 and v2 evidence reads, room creation/close, and run event replay.
Keyed rooms should remain unique per owner; multiple keyless rooms should
remain valid.

## Rollback

An old application binary cannot be restarted against the compact schema.
Rollback requires restoring the verified backup or recreating the old schema
and data before any old binary is brought back.
