ALTER TABLE "celesnity_app"."agent_automations"
  ALTER COLUMN "event_topic" DROP NOT NULL;

ALTER TABLE "celesnity_app"."agent_automations"
  ADD COLUMN "trigger_type" VARCHAR(16) NOT NULL DEFAULT 'EVENT',
  ADD COLUMN "schedule_cron" VARCHAR(255),
  ADD COLUMN "schedule_timezone" VARCHAR(64),
  ADD COLUMN "next_run_at" TIMESTAMPTZ(6);

CREATE INDEX "agent_automations_trigger_type_next_run_at_idx"
ON "celesnity_app"."agent_automations"("trigger_type", "next_run_at");
