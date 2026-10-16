SET ROLE celesnity_app_owner;
SET search_path TO celesnity_app;

ALTER TABLE "executions"
  ADD COLUMN "workload_kind" VARCHAR(20) NOT NULL DEFAULT 'SCRIPT',
  ADD COLUMN "workload_version_number" INTEGER,
  ADD COLUMN "pipeline_id" UUID,
  ADD COLUMN "pipeline_version_id" UUID,
  ALTER COLUMN "script_id" DROP NOT NULL,
  ALTER COLUMN "script_version_id" DROP NOT NULL;

UPDATE "executions" AS execution
SET "workload_version_number" = version."version_number"
FROM "script_versions" AS version
WHERE version."id" = execution."script_version_id";

ALTER TABLE "executions"
  ALTER COLUMN "workload_version_number" SET NOT NULL;

ALTER TABLE "executions"
  ADD CONSTRAINT "executions_pipeline_id_fkey"
    FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "executions_pipeline_version_id_fkey"
    FOREIGN KEY ("pipeline_version_id") REFERENCES "pipeline_versions"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "executions_workload_shape_check" CHECK (
    ("workload_kind" = 'SCRIPT' AND "script_id" IS NOT NULL AND "script_version_id" IS NOT NULL AND "pipeline_id" IS NULL AND "pipeline_version_id" IS NULL)
    OR
    ("workload_kind" = 'PIPELINE' AND "script_id" IS NULL AND "script_version_id" IS NULL AND "pipeline_id" IS NOT NULL AND "pipeline_version_id" IS NOT NULL)
  );

CREATE INDEX "executions_pipeline_id_idx" ON "executions"("pipeline_id");

RESET ROLE;
