import {
  normalizeDatabaseSchema,
  quoteIdentifier,
} from "../database-config.js";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma.service.js";

const CONFIRMATION = "COMPACT_MINDER_V2_SCHEMA";

interface Shape {
  readonly legacyTables: number;
  readonly legacyColumns: number;
  readonly legacyIndex: number;
  readonly legacySchemaTables: number;
  readonly compactSchemaTables: number;
  readonly compactIndexName: number;
  readonly compactIndex: number;
  readonly rooms: number;
}

export async function compactV2Schema(
  prisma: PrismaService,
  schema: string,
  confirmation: string,
): Promise<void> {
  if (confirmation !== CONFIRMATION)
    throw new Error(
      `Refusing schema compaction without confirmation ${CONFIRMATION}.`,
    );
  const targetSchema = normalizeDatabaseSchema(schema);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL search_path TO ${quoteIdentifier(targetSchema)}, public`,
    );
    const [shape] = await tx.$queryRawUnsafe<Shape[]>(
      `SELECT
         (SELECT count(*)::int FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = ANY(ARRAY['run_traces', 'run_validations', 'run_reports'])) AS "legacyTables",
         (SELECT count(*)::int FROM information_schema.columns
           WHERE table_schema = $1 AND (table_name, column_name) IN (
             ('sessions', 'app_state'), ('rooms', 'closed_at'), ('agents', 'updated_at'),
             ('run_manifests', 'content_hash'), ('run_manifests', 'manifest_name'),
             ('run_manifests', 'source_path'), ('run_manifests', 'yaml')
           )) AS "legacyColumns",
         (SELECT count(*)::int FROM pg_indexes
           WHERE schemaname = $1 AND indexname = 'rooms_owner_key'
             AND indexdef LIKE '% WHERE (key IS NOT NULL)%') AS "legacyIndex",
         (SELECT count(*)::int FROM pg_indexes
           WHERE schemaname = $1 AND indexname = 'rooms_owner_key_unique'
             AND indexdef LIKE '%CREATE UNIQUE INDEX%'
             AND indexdef LIKE '%USING btree (owner, key)%'
             AND indexdef NOT LIKE '% WHERE %') AS "compactIndex",
         (SELECT count(*)::int FROM pg_indexes
           WHERE schemaname = $1 AND indexname = 'rooms_owner_key_unique') AS "compactIndexName",
         (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = $1
           AND table_name = ANY(ARRAY[
             'sessions', 'runs', 'run_governance_policies', 'run_governance_evidence',
             'trigger_deliveries', 'run_events', 'run_approvals',
             'run_approval_execution_claims', 'run_file_accesses', 'run_manifests',
             'run_traces', 'run_validations', 'run_reports', 'skills', 'agents',
             'agent_revisions', 'rooms', 'room_members', 'room_runs', 'room_webhooks',
             'room_queue_items', 'room_events', 'minder_schema_migrations'
           ])) AS "legacySchemaTables",
         (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = $1
           AND table_name = ANY(ARRAY[
             'sessions', 'runs', 'run_governance_policies', 'run_governance_evidence',
             'trigger_deliveries', 'run_events', 'run_approvals',
             'run_approval_execution_claims', 'run_file_accesses', 'run_manifests',
             'skills', 'agents', 'agent_revisions', 'rooms', 'room_members', 'room_runs',
             'room_webhooks', 'room_queue_items', 'room_events', 'minder_schema_migrations'
           ])) AS "compactSchemaTables",
         (SELECT count(*)::int FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = 'rooms') AS rooms`,
      targetSchema,
    );

    if (!shape) throw new Error("Could not inspect target schema shape.");
    const compactObjectsAbsent =
      shape.legacyTables === 0 && shape.legacyColumns === 0;
    if (
      compactObjectsAbsent &&
      shape.compactIndex === 1 &&
      shape.compactIndexName === 1 &&
      shape.compactSchemaTables === 20 &&
      shape.legacyIndex === 0 &&
      shape.rooms === 1
    )
      return;
    if (
      shape.legacyTables !== 3 ||
      shape.legacyColumns !== 7 ||
      shape.legacyIndex !== 1 ||
      shape.legacySchemaTables !== 23 ||
      shape.compactIndexName !== 0 ||
      shape.rooms !== 1
    )
      throw new Error(
        "Target schema is partial; expected the complete legacy or compact shape.",
      );

    await tx.$executeRawUnsafe(
      `LOCK TABLE sessions, runs, run_events, run_traces, run_validations,
       run_reports, run_manifests, rooms, agents IN SHARE MODE`,
    );

    await assertNoMismatches(
      tx,
      "legacy run traces do not match the event journal",
      `SELECT count(*)::int AS count FROM run_traces t
       LEFT JOIN run_events e ON e.run_id = t.run_id AND e.seq = t.seq
       WHERE e.run_id IS NULL OR t.event IS DISTINCT FROM e.event`,
    );
    await assertNoMismatches(
      tx,
      "legacy validations are not derivable from finalized runs",
      `SELECT count(*)::int AS count FROM run_validations v
       JOIN runs r ON r.id = v.run_id
       WHERE r.finished_at IS NULL OR v.name <> 'run_status'
          OR v.passed IS DISTINCT FROM (r.status = 'completed')
          OR v.details IS DISTINCT FROM
            (jsonb_build_object('status', r.status) ||
             CASE WHEN r.error IS NULL THEN '{}'::jsonb
                  ELSE jsonb_build_object('error', r.error) END)`,
    );
    await assertNoMismatches(
      tx,
      "legacy reports are not derivable from finalized runs",
      `SELECT count(*)::int AS count FROM run_reports p
       JOIN runs r ON r.id = p.run_id
       WHERE r.finished_at IS NULL
          OR p.markdown IS DISTINCT FROM r.response_text
          OR p.artifact_id IS DISTINCT FROM (r.id::text || ':report')
          OR p.byte_size IS DISTINCT FROM octet_length(convert_to(r.response_text, 'UTF8'))`,
    );
    await assertNoMismatches(
      tx,
      "sessions contain app_state data",
      "SELECT count(*)::int AS count FROM sessions WHERE app_state IS NOT NULL",
    );
    for (const [column, field] of [
      ["content_hash", "manifestHash"],
      ["manifest_name", "manifestName"],
      ["source_path", "manifestSourcePath"],
      ["yaml", "manifestYaml"],
    ] as const) {
      await assertNoMismatches(
        tx,
        `run manifest ${column} values do not match their snapshots`,
        `SELECT count(*)::int AS count FROM run_manifests
         WHERE ${column} IS DISTINCT FROM
           CASE WHEN jsonb_typeof(manifest->'${field}') = 'string'
                THEN manifest->>'${field}' ELSE NULL END`,
      );
    }

    await tx.$executeRawUnsafe("DROP TABLE IF EXISTS run_traces");
    await tx.$executeRawUnsafe("DROP TABLE IF EXISTS run_validations");
    await tx.$executeRawUnsafe("DROP TABLE IF EXISTS run_reports");
    await tx.$executeRawUnsafe(
      "ALTER TABLE sessions DROP COLUMN IF EXISTS app_state",
    );
    await tx.$executeRawUnsafe(
      "ALTER TABLE rooms DROP COLUMN IF EXISTS closed_at",
    );
    await tx.$executeRawUnsafe(
      "ALTER TABLE agents DROP COLUMN IF EXISTS updated_at",
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE run_manifests
       DROP COLUMN IF EXISTS content_hash,
       DROP COLUMN IF EXISTS manifest_name,
       DROP COLUMN IF EXISTS source_path,
       DROP COLUMN IF EXISTS yaml`,
    );
    await tx.$executeRawUnsafe(
      "CREATE UNIQUE INDEX IF NOT EXISTS rooms_owner_key_unique ON rooms(owner, key)",
    );
    await tx.$executeRawUnsafe("DROP INDEX IF EXISTS rooms_owner_key");
  });
}

async function assertNoMismatches(
  tx: Prisma.TransactionClient,
  message: string,
  query: string,
): Promise<void> {
  const [result] = await tx.$queryRawUnsafe<{ count: number }[]>(query);
  if (!result || Number(result.count) !== 0) throw new Error(message);
}
