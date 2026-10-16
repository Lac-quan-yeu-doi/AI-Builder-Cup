CREATE TABLE "celesnity_app"."data_workflows" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "draft" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "published_version" INTEGER,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflows_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "data_workflows_id_organization_id_key"
  ON "celesnity_app"."data_workflows"("id", "organization_id");
CREATE INDEX "data_workflows_organization_id_updated_at_idx"
  ON "celesnity_app"."data_workflows"("organization_id", "updated_at");

CREATE TABLE "celesnity_app"."data_workflow_versions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "workflow_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "graph_snapshot" JSONB NOT NULL,
  "trigger_snapshot" JSONB NOT NULL,
  "published_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_versions_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_versions_workflow_id_organization_id_fkey"
    FOREIGN KEY ("workflow_id", "organization_id")
    REFERENCES "celesnity_app"."data_workflows"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "data_workflow_versions_id_organization_id_key"
  ON "celesnity_app"."data_workflow_versions"("id", "organization_id");
CREATE UNIQUE INDEX "data_workflow_versions_workflow_id_id_organization_id_key"
  ON "celesnity_app"."data_workflow_versions"("workflow_id", "id", "organization_id");
CREATE UNIQUE INDEX "data_workflow_versions_workflow_id_version_number_key"
  ON "celesnity_app"."data_workflow_versions"("workflow_id", "version_number");
CREATE INDEX "data_workflow_versions_organization_id_published_at_idx"
  ON "celesnity_app"."data_workflow_versions"("organization_id", "published_at");

CREATE TABLE "celesnity_app"."data_workflow_runs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "workflow_id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "actor" VARCHAR(320) NOT NULL,
  "delegation" JSONB,
  "parameters" JSONB NOT NULL,
  "trigger_context" JSONB NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "lease_owner" VARCHAR(160),
  "lease_token" UUID,
  "lease_expires_at" TIMESTAMPTZ(6),
  "next_reconciliation_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_runs_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_runs_workflow_id_organization_id_fkey"
    FOREIGN KEY ("workflow_id", "organization_id")
    REFERENCES "celesnity_app"."data_workflows"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_runs_workflow_id_version_id_organization_id_fkey"
    FOREIGN KEY ("workflow_id", "version_id", "organization_id")
    REFERENCES "celesnity_app"."data_workflow_versions"("workflow_id", "id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "data_workflow_runs_id_organization_id_key"
  ON "celesnity_app"."data_workflow_runs"("id", "organization_id");
CREATE INDEX "data_workflow_runs_organization_id_status_next_reconciliation_at_idx"
  ON "celesnity_app"."data_workflow_runs"("organization_id", "status", "next_reconciliation_at");
CREATE INDEX "data_workflow_runs_global_due_claim_idx"
  ON "celesnity_app"."data_workflow_runs"("next_reconciliation_at", "created_at", "id")
  WHERE "status" IN ('QUEUED', 'RUNNING');
CREATE UNIQUE INDEX "data_workflow_runs_one_active_per_workflow"
  ON "celesnity_app"."data_workflow_runs"("organization_id", "workflow_id")
  WHERE "status" IN ('QUEUED', 'RUNNING');

CREATE UNIQUE INDEX "executions_id_organization_id_key"
  ON "celesnity_app"."executions"("id", "organization_id");

CREATE TABLE "celesnity_app"."data_workflow_node_attempts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "node_id" VARCHAR(255) NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "state" VARCHAR(16) NOT NULL,
  "execution_id" UUID,
  "error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_node_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_node_attempts_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_node_attempts_run_id_organization_id_fkey"
    FOREIGN KEY ("run_id", "organization_id")
    REFERENCES "celesnity_app"."data_workflow_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_node_attempts_execution_id_organization_id_fkey"
    FOREIGN KEY ("execution_id", "organization_id")
    REFERENCES "celesnity_app"."executions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "data_workflow_node_attempts_run_id_node_id_attempt_number_key"
  ON "celesnity_app"."data_workflow_node_attempts"("run_id", "node_id", "attempt_number");
CREATE UNIQUE INDEX "data_workflow_node_attempts_id_organization_id_key"
  ON "celesnity_app"."data_workflow_node_attempts"("id", "organization_id");
CREATE UNIQUE INDEX "data_workflow_node_attempts_id_organization_id_run_id_key"
  ON "celesnity_app"."data_workflow_node_attempts"("id", "organization_id", "run_id");
CREATE UNIQUE INDEX "data_workflow_node_attempts_execution_id_organization_id_key"
  ON "celesnity_app"."data_workflow_node_attempts"("execution_id", "organization_id");
CREATE INDEX "data_workflow_node_attempts_organization_id_run_id_idx"
  ON "celesnity_app"."data_workflow_node_attempts"("organization_id", "run_id");

CREATE TABLE "celesnity_app"."data_workflow_retry_acknowledgements" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "node_attempt_id" UUID NOT NULL,
  "node_id" VARCHAR(255) NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "approved_by" VARCHAR(320) NOT NULL,
  "acknowledgement_signal" BOOLEAN NOT NULL,
  "purpose" VARCHAR(80) NOT NULL,
  "acknowledged_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_retry_acknowledgements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_retry_acknowledgements_organization_id_fkey"
    FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_retry_acknowledgements_run_id_organization_id_fkey"
    FOREIGN KEY ("run_id", "organization_id")
    REFERENCES "celesnity_app"."data_workflow_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_retry_acknowledgements_node_attempt_id_organization_id_run_id_fkey"
    FOREIGN KEY ("node_attempt_id", "organization_id", "run_id")
    REFERENCES "celesnity_app"."data_workflow_node_attempts"("id", "organization_id", "run_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "data_workflow_retry_acknowledgements_node_attempt_id_organization_id_run_id_key"
  ON "celesnity_app"."data_workflow_retry_acknowledgements"("node_attempt_id", "organization_id", "run_id");
CREATE INDEX "data_workflow_retry_acknowledgements_organization_id_run_id_acknowledged_at_idx"
  ON "celesnity_app"."data_workflow_retry_acknowledgements"("organization_id", "run_id", "acknowledged_at");

CREATE FUNCTION "celesnity_app"."reject_data_workflow_retry_acknowledgement_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Data workflow retry acknowledgements are immutable.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "data_workflow_retry_acknowledgements_immutable"
  BEFORE UPDATE OR DELETE ON "celesnity_app"."data_workflow_retry_acknowledgements"
  FOR EACH ROW EXECUTE FUNCTION "celesnity_app"."reject_data_workflow_retry_acknowledgement_mutation"();

CREATE TABLE "celesnity_app"."data_workflow_edge_states" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "edge_id" VARCHAR(255) NOT NULL,
  "state" VARCHAR(16) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_edge_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_edge_states_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_edge_states_run_id_organization_id_fkey"
    FOREIGN KEY ("run_id", "organization_id")
    REFERENCES "celesnity_app"."data_workflow_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "data_workflow_edge_states_run_id_edge_id_key"
  ON "celesnity_app"."data_workflow_edge_states"("run_id", "edge_id");
CREATE INDEX "data_workflow_edge_states_organization_id_run_id_idx"
  ON "celesnity_app"."data_workflow_edge_states"("organization_id", "run_id");

CREATE FUNCTION "celesnity_app"."reject_data_workflow_version_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Data workflow versions are immutable.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "data_workflow_versions_immutable"
  BEFORE UPDATE OR DELETE ON "celesnity_app"."data_workflow_versions"
  FOR EACH ROW EXECUTE FUNCTION "celesnity_app"."reject_data_workflow_version_mutation"();
