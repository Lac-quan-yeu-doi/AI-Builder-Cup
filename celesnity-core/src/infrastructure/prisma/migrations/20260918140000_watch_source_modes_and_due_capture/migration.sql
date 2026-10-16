ALTER TABLE "celesnity_app"."data_workflow_watch_sources"
  ADD COLUMN "next_capture_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "last_capture_at" TIMESTAMPTZ(6);

DROP INDEX "celesnity_app"."data_workflow_watch_sources_organization_id_enabled_updated_at_idx";
DROP INDEX "celesnity_app"."data_workflow_watch_sources_global_claim_idx";

CREATE INDEX "data_workflow_watch_sources_organization_id_enabled_next_capture_at_id_idx"
  ON "celesnity_app"."data_workflow_watch_sources"("organization_id", "enabled", "next_capture_at", "id");

CREATE INDEX "data_workflow_watch_sources_global_claim_idx"
  ON "celesnity_app"."data_workflow_watch_sources"("enabled", "next_capture_at", "lease_expires_at", "id")
  WHERE "enabled" = TRUE;
