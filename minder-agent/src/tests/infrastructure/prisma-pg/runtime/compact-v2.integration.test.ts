import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { PrismaService } from "@infrastructure/prisma/prisma.service.js";
import { PrismaRuntimeStore } from "@infrastructure/prisma/prisma-runtime-store.js";
import { compactV2Schema } from "@infrastructure/prisma/schema/compact-v2.js";

const connectionString = process.env.MINDER_TEST_DATABASE_URL;
const describeDatabase = connectionString ? describe : describe.skip;
const CONFIRMATION = "COMPACT_MINDER_V2_SCHEMA";

interface LegacyDatabase {
  readonly schema: string;
  readonly client: PoolClient;
  readonly pool: Pool;
  readonly prisma: PrismaService;
  readonly ids: { readonly run: string; readonly session: string };
}

const databases: LegacyDatabase[] = [];

describeDatabase("compact v2 database migration", () => {
  afterEach(async () => {
    for (const database of databases.splice(0)) {
      await database.prisma.$disconnect();
      await database.client.query(`DROP SCHEMA "${database.schema}" CASCADE`);
      database.client.release();
      await database.pool.end();
    }
  });

  it("requires confirmation and leaves the legacy schema intact", async () => {
    const database = await createLegacyDatabase();

    await expect(
      compactV2Schema(database.prisma, database.schema, ""),
    ).rejects.toThrow("Refusing schema compaction");
    await expect(
      database.client.query("SELECT 1 FROM run_traces"),
    ).resolves.toBeDefined();
  });

  it("aborts on non-derivable evidence without dropping legacy objects", async () => {
    const database = await createLegacyDatabase();
    await database.client.query(
      'UPDATE run_traces SET event = \'{"type":"independent"}\'::jsonb',
    );

    await expect(
      compactV2Schema(database.prisma, database.schema, CONFIRMATION),
    ).rejects.toThrow("legacy run traces do not match the event journal");
    await expect(
      database.client.query("SELECT 1 FROM run_traces"),
    ).resolves.toBeDefined();
  });

  it("rejects a conflicting index with the compact index name", async () => {
    const database = await createLegacyDatabase();
    await database.client.query(
      "CREATE INDEX rooms_owner_key_unique ON rooms(owner)",
    );

    await expect(
      compactV2Schema(database.prisma, database.schema, CONFIRMATION),
    ).rejects.toThrow("Target schema is partial");
    await expect(
      database.client.query("SELECT 1 FROM run_traces"),
    ).resolves.toBeDefined();
  });

  it("blocks non-derivable validation, report, and manifest rows", async () => {
    const mutations = [
      {
        sql: 'UPDATE run_validations SET details = \'{"status":"independent"}\'::jsonb',
        message: "legacy validations are not derivable",
      },
      {
        sql: "UPDATE run_reports SET markdown = 'independent'",
        message: "legacy reports are not derivable",
      },
      {
        sql: "UPDATE run_manifests SET content_hash = 'independent'",
        message: "run manifest content_hash values do not match",
      },
    ];
    for (const mutation of mutations) {
      const database = await createLegacyDatabase();
      await database.client.query(mutation.sql);
      await expect(
        compactV2Schema(database.prisma, database.schema, CONFIRMATION),
      ).rejects.toThrow(mutation.message);
      await expect(
        database.client.query("SELECT 1 FROM run_reports"),
      ).resolves.toBeDefined();
    }
  });

  it("compacts derivable evidence, preserves authoritative rows, and is repeatable", async () => {
    const database = await createLegacyDatabase();
    await database.client.query(
      "UPDATE sessions SET app_state = '{\"legacy\":true}'::jsonb WHERE id = $1",
      [database.ids.session],
    );
    await expect(
      compactV2Schema(database.prisma, database.schema, CONFIRMATION),
    ).rejects.toThrow("sessions contain app_state data");
    await database.client.query(
      "UPDATE sessions SET app_state = NULL WHERE id = $1",
      [database.ids.session],
    );

    await compactV2Schema(database.prisma, database.schema, CONFIRMATION);
    await compactV2Schema(database.prisma, database.schema, CONFIRMATION);

    const removed = await database.client.query<{ count: string }>(
      `SELECT count(*) FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = ANY($2::text[])
       UNION ALL
       SELECT count(*) FROM information_schema.columns
        WHERE table_schema = $1 AND (table_name, column_name) IN (
          ('sessions', 'app_state'), ('rooms', 'closed_at'), ('agents', 'updated_at'),
          ('run_manifests', 'content_hash'), ('run_manifests', 'manifest_name'),
          ('run_manifests', 'source_path'), ('run_manifests', 'yaml')
        )`,
      [database.schema, ["run_traces", "run_validations", "run_reports"]],
    );
    expect(removed.rows.map((row) => Number(row.count))).toEqual([0, 0]);
    for (const table of [
      "runs",
      "sessions",
      "run_events",
      "run_manifests",
      "rooms",
      "agents",
      "run_approvals",
      "run_governance_policies",
      "run_governance_evidence",
      "minder_schema_migrations",
    ])
      await expect(
        database.client.query(`SELECT 1 FROM "${table}"`),
      ).resolves.toBeDefined();

    const preserved = await database.client.query<{ count: string }>(
      `SELECT count(*) FROM runs WHERE id = $1
       UNION ALL SELECT count(*) FROM sessions WHERE id = $2
       UNION ALL SELECT count(*) FROM run_events WHERE run_id = $1
       UNION ALL SELECT count(*) FROM run_manifests WHERE run_id = $1
       UNION ALL SELECT count(*) FROM run_approvals WHERE run_id = $1
       UNION ALL SELECT count(*) FROM run_governance_policies WHERE run_id = $1
       UNION ALL SELECT count(*) FROM run_governance_evidence WHERE run_id = $1
       UNION ALL SELECT count(*) FROM minder_schema_migrations WHERE version = 23`,
      [database.ids.run, database.ids.session],
    );
    expect(preserved.rows.map((row) => Number(row.count))).toEqual(
      Array(8).fill(1),
    );

    await database.client.query(
      `INSERT INTO rooms (id, owner, key, name, max_concurrent_runs, max_queued)
       VALUES ($1, 'owner-a', NULL, 'keyless one', 1, 1),
              ($2, 'owner-a', NULL, 'keyless two', 1, 1),
              ($3, 'owner-b', 'shared-key', 'other owner', 1, 1)`,
      [randomUUID(), randomUUID(), randomUUID()],
    );
    await expect(
      database.client.query(
        `INSERT INTO rooms (id, owner, key, name, max_concurrent_runs, max_queued)
         VALUES ($1, 'owner-a', 'room-key', 'duplicate', 1, 1)`,
        [randomUUID()],
      ),
    ).rejects.toThrow();
    await new PrismaRuntimeStore({
      prisma: database.prisma,
      schema: database.schema,
    }).migrate();
    await expect(
      database.client.query("SELECT 1 FROM run_traces"),
    ).rejects.toThrow();
  });

  it("creates all 20 Prisma model tables directly in the compact shape", async () => {
    const database = await createEmptyDatabase();
    const runtime = new PrismaRuntimeStore({
      prisma: database.prisma,
      schema: database.schema,
    });
    await runtime.migrate();
    const modelTables = [
      "sessions",
      "runs",
      "run_governance_policies",
      "run_governance_evidence",
      "trigger_deliveries",
      "run_events",
      "run_approvals",
      "run_approval_execution_claims",
      "run_file_accesses",
      "run_manifests",
      "skills",
      "agents",
      "agent_revisions",
      "rooms",
      "room_members",
      "room_runs",
      "room_webhooks",
      "room_queue_items",
      "room_events",
      "minder_schema_migrations",
    ];
    const tables = await database.client.query<{ count: string }>(
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2::text[])",
      [database.schema, modelTables],
    );
    expect(Number(tables.rows[0]?.count)).toBe(20);
    await runtime.migrate();
    const removed = await database.client.query<{
      tables: string;
      columns: string;
    }>(
      `SELECT
         (SELECT count(*) FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = ANY(ARRAY['run_traces', 'run_validations', 'run_reports'])) AS tables,
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = $1 AND (table_name, column_name) IN (
             ('sessions', 'app_state'), ('rooms', 'closed_at'), ('agents', 'updated_at'),
             ('run_manifests', 'content_hash'), ('run_manifests', 'manifest_name'),
             ('run_manifests', 'source_path'), ('run_manifests', 'yaml')
           )) AS columns`,
      [database.schema],
    );
    expect(removed.rows[0]).toEqual({ tables: "0", columns: "0" });
  });
});

async function createLegacyDatabase(): Promise<LegacyDatabase> {
  if (!connectionString)
    throw new Error("MINDER_TEST_DATABASE_URL is required.");
  const schema = `compact_v2_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const ids = { session: randomUUID(), run: randomUUID() };
  const database: LegacyDatabase = {
    schema,
    client,
    pool,
    prisma: new PrismaService({ datasourceUrl: connectionString, schema }),
    ids,
  };
  databases.push(database);

  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}", public`);
  const baseline = await readFile(
    new URL(
      "../../../../infrastructure/prisma/migrations/20260920000000_baseline/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await client.query(baseline);
  const event = { type: "text", data: "hello" };
  const response = "héllo";
  await client.query(
    `INSERT INTO sessions (id, key, mode, history, owner, app_state)
     VALUES ($1, 'session', 'interactive', '[]'::jsonb, 'owner-a', NULL)`,
    [ids.session],
  );
  await client.query(
    `INSERT INTO runs (id, session_id, status, mode, trigger_source, input, response_text, finished_at)
     VALUES ($1, $2, 'completed', 'interactive', 'test', 'input', $3, '2026-09-20T00:00:00Z')`,
    [ids.run, ids.session, response],
  );
  await client.query(
    "INSERT INTO run_events (run_id, seq, event) VALUES ($1, 1, $2)",
    [ids.run, event],
  );
  await client.query(
    "INSERT INTO run_traces (run_id, seq, event, created_at) VALUES ($1, 1, $2, '2026-09-20T00:00:00Z')",
    [ids.run, event],
  );
  await client.query(
    `INSERT INTO run_validations (run_id, name, passed, details, created_at)
     VALUES ($1, 'run_status', TRUE, '{"status":"completed"}', '2026-09-20T00:00:00Z')`,
    [ids.run],
  );
  await client.query(
    `INSERT INTO run_reports (run_id, markdown, artifact_id, byte_size, created_at)
     VALUES ($1, $2, $3, $4, '2026-09-20T00:00:00Z')`,
    [
      ids.run,
      response,
      `${ids.run}:report`,
      Buffer.byteLength(response, "utf8"),
    ],
  );
  await client.query(
    `INSERT INTO run_manifests (run_id, manifest, content_hash, manifest_name, source_path, yaml, created_at)
     VALUES ($1, $2, 'hash', 'planner', 'agents/planner.yaml', 'name: planner', '2026-09-20T00:00:00Z')`,
    [
      ids.run,
      {
        manifestHash: "hash",
        manifestName: "planner",
        manifestSourcePath: "agents/planner.yaml",
        manifestYaml: "name: planner",
      },
    ],
  );
  await client.query(
    `INSERT INTO rooms (id, owner, key, name, max_concurrent_runs, max_queued)
     VALUES ($1, 'owner-a', 'room-key', 'Room', 1, 3)`,
    [randomUUID()],
  );
  await client.query(
    `INSERT INTO agents (owner, id, name, execution_strategy, config_hash)
     VALUES ('owner-a', 'planner', 'planner', 'react', 'hash')`,
  );
  await client.query(
    `INSERT INTO run_approvals (id, owner, run_id, tool_call_id, action, arguments_hash, preview, status, created_at, expires_at)
     VALUES ($1, 'owner-a', $2, 'call-1', 'write_file', 'hash', 'report.md', 'pending', now(), now() + interval '5 minutes')`,
    [randomUUID(), ids.run],
  );
  await client.query(
    `INSERT INTO run_governance_policies (run_id, owner, revision_hash, summary, admitted_at)
     VALUES ($1, 'owner-a', 'hash', '{}', now())`,
    [ids.run],
  );
  await client.query(
    `INSERT INTO run_governance_evidence (id, run_id, owner, seq, kind, detail, at)
     VALUES ($1, $2, 'owner-a', 1, 'test', '{}', now())`,
    [randomUUID(), ids.run],
  );
  await client.query(
    "INSERT INTO minder_schema_migrations (version) VALUES (23)",
  );
  await database.prisma.$connect();
  return database;
}

async function createEmptyDatabase(): Promise<LegacyDatabase> {
  if (!connectionString)
    throw new Error("MINDER_TEST_DATABASE_URL is required.");
  const schema = `compact_v2_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const database: LegacyDatabase = {
    schema,
    client,
    pool,
    prisma: new PrismaService({ datasourceUrl: connectionString, schema }),
    ids: { session: randomUUID(), run: randomUUID() },
  };
  databases.push(database);
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}", public`);
  await database.prisma.$connect();
  return database;
}
