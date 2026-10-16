CREATE TABLE "celesnity_app"."automation_workflows" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "trigger_type" VARCHAR(16) NOT NULL,
    "event_topic" VARCHAR(255),
    "schedule_cron" VARCHAR(255),
    "schedule_timezone" VARCHAR(64),
    "next_run_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_workflows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_workflows_organization_id_name_key"
ON "celesnity_app"."automation_workflows"("organization_id", "name");

CREATE INDEX "automation_workflows_organization_id_event_topic_idx"
ON "celesnity_app"."automation_workflows"("organization_id", "event_topic");

CREATE INDEX "automation_workflows_trigger_type_next_run_at_idx"
ON "celesnity_app"."automation_workflows"("trigger_type", "next_run_at");

ALTER TABLE "celesnity_app"."automation_workflows"
ADD CONSTRAINT "automation_workflows_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "celesnity_app"."automation_workflow_steps" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "agent_id" VARCHAR(255) NOT NULL,
    "input_template" JSONB NOT NULL,

    CONSTRAINT "automation_workflow_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_workflow_steps_workflow_id_order_key"
ON "celesnity_app"."automation_workflow_steps"("workflow_id", "order");

ALTER TABLE "celesnity_app"."automation_workflow_steps"
ADD CONSTRAINT "automation_workflow_steps_workflow_id_fkey"
FOREIGN KEY ("workflow_id") REFERENCES "celesnity_app"."automation_workflows"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "celesnity_app"."automation_workflow_runs" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "triggered_by" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "trigger_payload" JSONB NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "automation_workflow_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "automation_workflow_runs_workflow_id_started_at_idx"
ON "celesnity_app"."automation_workflow_runs"("workflow_id", "started_at");

ALTER TABLE "celesnity_app"."automation_workflow_runs"
ADD CONSTRAINT "automation_workflow_runs_workflow_id_fkey"
FOREIGN KEY ("workflow_id") REFERENCES "celesnity_app"."automation_workflows"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "celesnity_app"."automation_workflow_step_runs" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "agent_run_id" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
    "output" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "automation_workflow_step_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "automation_workflow_step_runs_run_id_idx"
ON "celesnity_app"."automation_workflow_step_runs"("run_id");

ALTER TABLE "celesnity_app"."automation_workflow_step_runs"
ADD CONSTRAINT "automation_workflow_step_runs_run_id_fkey"
FOREIGN KEY ("run_id") REFERENCES "celesnity_app"."automation_workflow_runs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "celesnity_app"."automation_workflow_step_runs"
ADD CONSTRAINT "automation_workflow_step_runs_step_id_fkey"
FOREIGN KEY ("step_id") REFERENCES "celesnity_app"."automation_workflow_steps"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
