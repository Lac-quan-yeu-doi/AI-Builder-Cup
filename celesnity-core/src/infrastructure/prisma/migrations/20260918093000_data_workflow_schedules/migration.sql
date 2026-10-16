CREATE TABLE "celesnity_app"."data_workflow_schedules" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "workflow_id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "actor" VARCHAR(320) NOT NULL,
  "trigger_kind" VARCHAR(16) NOT NULL,
  "next_due_at" TIMESTAMPTZ(6) NOT NULL,
  "interval_anchor_at" TIMESTAMPTZ(6),
  "coalesced_from_at" TIMESTAMPTZ(6),
  "coalesced_through_at" TIMESTAMPTZ(6),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "superseded_at" TIMESTAMPTZ(6),
  "lease_owner" VARCHAR(160),
  "lease_token" UUID,
  "lease_expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_schedules_organization_id_fkey"
    FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_schedules_workflow_id_organization_id_fkey"
    FOREIGN KEY ("workflow_id", "organization_id")
    REFERENCES "celesnity_app"."data_workflows"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_schedules_workflow_id_version_id_organization_id_fkey"
    FOREIGN KEY ("workflow_id", "version_id", "organization_id")
    REFERENCES "celesnity_app"."data_workflow_versions"("workflow_id", "id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "data_workflow_schedules_id_organization_id_key"
  ON "celesnity_app"."data_workflow_schedules"("id", "organization_id");
CREATE UNIQUE INDEX "data_workflow_schedules_workflow_id_version_id_organization_id_key"
  ON "celesnity_app"."data_workflow_schedules"("workflow_id", "version_id", "organization_id");
CREATE INDEX "data_workflow_schedules_organization_id_workflow_id_enabled_idx"
  ON "celesnity_app"."data_workflow_schedules"("organization_id", "workflow_id", "enabled");
CREATE INDEX "data_workflow_schedules_global_due_claim_idx"
  ON "celesnity_app"."data_workflow_schedules"("next_due_at", "id")
  WHERE "enabled" = true AND "superseded_at" IS NULL;
