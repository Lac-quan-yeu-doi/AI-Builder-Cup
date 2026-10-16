ALTER TABLE "celesnity_app"."data_workflow_schedules"
  ADD COLUMN "coalesced_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "celesnity_app"."data_workflow_schedules"
  ADD CONSTRAINT "data_workflow_schedules_coalesced_count_check" CHECK ("coalesced_count" >= 0);
