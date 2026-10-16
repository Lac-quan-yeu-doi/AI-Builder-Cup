ALTER TABLE "celesnity_app"."data_workflow_versions"
ADD COLUMN "pipeline_display_names" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "celesnity_app"."data_workflow_node_attempts"
ADD COLUMN "failure_kind" VARCHAR(16);
