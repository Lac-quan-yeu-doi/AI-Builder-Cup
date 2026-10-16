// Embedded copy of the CLI migration so compiled runtime output needs no SQL asset.
export const PRISMA_BASELINE_MIGRATION_SQL = String.raw`DO $$
DECLARE
  configured_schema text := btrim(split_part(current_setting('search_path'), ',', 1), ' "');
BEGIN
  IF configured_schema IN ('', '$user', 'public') THEN
    RAISE EXCEPTION 'Prisma migration requires a configured database schema';
  END IF;
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', configured_schema);
  PERFORM set_config('search_path', format('%I, public', configured_schema), false);
END
$$;
CREATE TABLE IF NOT EXISTS sessions (id UUID PRIMARY KEY, key TEXT NOT NULL, mode TEXT NOT NULL, history JSONB NOT NULL DEFAULT '[]'::jsonb, pending_question JSONB, pending_client_tool JSONB, pending_plan JSONB, pending_approval JSONB, loop_snapshot JSONB, turns INTEGER NOT NULL DEFAULT 0, owner TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS sessions_owner_key ON sessions(owner, key);
CREATE TABLE IF NOT EXISTS runs (id UUID PRIMARY KEY, session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, status TEXT NOT NULL, mode TEXT NOT NULL, trigger_source TEXT NOT NULL, delivery_id TEXT, input TEXT NOT NULL, manifest_name TEXT, manifest_owner TEXT, data_scope JSONB, context JSONB, delegation JSONB, response_text TEXT NOT NULL DEFAULT '', error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ);
CREATE UNIQUE INDEX IF NOT EXISTS uq_run_active ON runs(session_id) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_runs_session_created ON runs(session_id, created_at DESC);
CREATE TABLE IF NOT EXISTS run_events (run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE, seq INTEGER NOT NULL, event JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (run_id, seq));
CREATE TABLE IF NOT EXISTS run_governance_policies (run_id UUID PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE, owner TEXT NOT NULL, revision_hash TEXT NOT NULL, policy JSONB, summary JSONB NOT NULL, admitted_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS run_governance_evidence (id UUID PRIMARY KEY, run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE, owner TEXT NOT NULL, seq BIGINT NOT NULL, kind TEXT NOT NULL, detail JSONB NOT NULL, at TIMESTAMPTZ NOT NULL, UNIQUE(run_id, seq));
CREATE TABLE IF NOT EXISTS trigger_deliveries (source TEXT NOT NULL, delivery_id TEXT NOT NULL, claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(source, delivery_id));
CREATE TABLE IF NOT EXISTS run_approvals (id UUID PRIMARY KEY, owner TEXT NOT NULL, run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE, tool_call_id TEXT NOT NULL, action TEXT NOT NULL, arguments_hash TEXT NOT NULL, preview TEXT NOT NULL, status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL, decided_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS run_approval_execution_claims (approval_id UUID PRIMARY KEY REFERENCES run_approvals(id) ON DELETE CASCADE, owner TEXT NOT NULL, run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE, state TEXT NOT NULL, claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS run_file_accesses (run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE, path TEXT NOT NULL, operation TEXT NOT NULL, at TIMESTAMPTZ NOT NULL, PRIMARY KEY(run_id, path, operation, at));
CREATE TABLE IF NOT EXISTS run_manifests (run_id UUID PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE, manifest JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS skills (owner TEXT NOT NULL, name TEXT NOT NULL, namespace TEXT NOT NULL, description TEXT, body TEXT NOT NULL, hash TEXT NOT NULL, source TEXT NOT NULL, read_only BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(owner, name));
CREATE TABLE IF NOT EXISTS agents (owner TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, display_name TEXT, system_prompt TEXT, model TEXT, tool_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb, skills JSONB NOT NULL DEFAULT '[]'::jsonb, max_steps INTEGER, execution_strategy TEXT NOT NULL, config_hash TEXT NOT NULL, archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(owner, id));
CREATE UNIQUE INDEX IF NOT EXISTS agents_owner_name ON agents(owner, name);
CREATE TABLE IF NOT EXISTS agent_revisions (owner TEXT NOT NULL, agent_id TEXT NOT NULL, version INTEGER NOT NULL, snapshot JSONB NOT NULL, config_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(owner, agent_id, version));
CREATE TABLE IF NOT EXISTS rooms (id UUID PRIMARY KEY, owner TEXT NOT NULL, key TEXT, name TEXT NOT NULL, max_concurrent_runs INTEGER NOT NULL, max_queued INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS rooms_owner_key_unique ON rooms(owner, key);
CREATE TABLE IF NOT EXISTS room_members (room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, agent_name TEXT NOT NULL, PRIMARY KEY(room_id, agent_name));
CREATE TABLE IF NOT EXISTS room_runs (room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(room_id, run_id));
CREATE TABLE IF NOT EXISTS room_webhooks (id UUID PRIMARY KEY, owner TEXT NOT NULL, room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, agent_name TEXT NOT NULL, source TEXT NOT NULL, secret_ref TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS room_queue_items (room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE, payload JSONB NOT NULL, position INTEGER NOT NULL, state TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(room_id, run_id));
CREATE TABLE IF NOT EXISTS room_events (room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, seq BIGINT NOT NULL, event JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(room_id, seq));
CREATE TABLE IF NOT EXISTS minder_schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
`;
