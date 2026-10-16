import type { Pool, PoolClient } from "pg";

const CORE_TABLES = [
  "run_events",
  "run_approval_execution_claims",
  "run_approvals",
  "run_reports",
  "run_validations",
  "run_traces",
  "run_manifests",
  "agent_revisions",
  "room_events",
  "room_queue_items",
  "room_webhooks",
  "room_members",
  "run_file_accesses",
  "run_governance_policies",
  "run_governance_evidence",
  "runs",
  "sessions",
  "blackboard",
  "rooms",
  "agents",
  "trigger_deliveries",
  "skills",
  "minder_schema_migrations",
] as const;

export interface ResetMinderSchemaOptions {
  readonly confirmation?: string;
  readonly expectedConfirmation?: string;
}

export async function resetMinderSchema(
  pool: Pool,
  options: ResetMinderSchemaOptions = {},
): Promise<void> {
  const expected = options.expectedConfirmation ?? "DROP_MINDER_RUST_DATA";
  if (options.confirmation !== expected)
    throw new Error(
      `Refusing to reset Minder tables without confirmation ${expected}.`,
    );
  const client = await pool.connect();
  try {
    await assertNoExternalForeignKeys(client);
    await client.query("BEGIN");
    for (const table of CORE_TABLES)
      await client.query(`DROP TABLE IF EXISTS public."${table}"`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function assertNoExternalForeignKeys(client: PoolClient): Promise<void> {
  const result = await client.query<{
    constraint_name: string;
    table_name: string;
    referenced_table_name: string;
  }>(
    `SELECT c.conname AS constraint_name,
            quote_ident(n.nspname) || '.' || quote_ident(t.relname) AS table_name,
            quote_ident(rn.nspname) || '.' || quote_ident(rt.relname) AS referenced_table_name
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_class rt ON rt.oid = c.confrelid
       JOIN pg_namespace rn ON rn.oid = rt.relnamespace
      WHERE c.contype = 'f'
        AND ((n.nspname = 'public' AND t.relname = ANY($1))
          OR (rn.nspname = 'public' AND rt.relname = ANY($1)))
        AND NOT (n.nspname = 'public' AND t.relname = ANY($1)
             AND rn.nspname = 'public' AND rt.relname = ANY($1))`,
    [CORE_TABLES],
  );
  if (result.rows.length > 0) {
    const details = result.rows
      .map(
        (row) =>
          `${row.constraint_name} (${row.table_name} -> ${row.referenced_table_name})`,
      )
      .join(", ");
    throw new Error(
      `Refusing to reset Minder tables because external foreign keys exist: ${details}`,
    );
  }
}
