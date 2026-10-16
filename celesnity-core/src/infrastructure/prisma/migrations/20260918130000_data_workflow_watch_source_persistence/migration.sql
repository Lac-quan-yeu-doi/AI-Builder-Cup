CREATE UNIQUE INDEX "database_services_id_organization_id_key"
  ON "celesnity_app"."database_services"("id", "organization_id");

CREATE TABLE "celesnity_app"."data_workflow_watch_sources" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "database_service_id" UUID NOT NULL,
  "adapter_key" VARCHAR(80) NOT NULL,
  "adapter_version" VARCHAR(80) NOT NULL,
  "trigger" JSONB NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "lease_owner" VARCHAR(160),
  "lease_token" UUID,
  "lease_expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_watch_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_watch_sources_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_sources_database_service_id_organization_id_fkey"
    FOREIGN KEY ("database_service_id", "organization_id") REFERENCES "celesnity_app"."database_services"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "data_workflow_watch_sources_id_organization_id_key"
  ON "celesnity_app"."data_workflow_watch_sources"("id", "organization_id");
CREATE INDEX "data_workflow_watch_sources_organization_id_enabled_updated_at_idx"
  ON "celesnity_app"."data_workflow_watch_sources"("organization_id", "enabled", "updated_at");
CREATE INDEX "data_workflow_watch_sources_global_claim_idx"
  ON "celesnity_app"."data_workflow_watch_sources"("enabled", "lease_expires_at", "updated_at", "id")
  WHERE "enabled" = TRUE;

CREATE TABLE "celesnity_app"."data_workflow_watch_source_subscriptions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "watch_source_id" UUID NOT NULL,
  "workflow_id" UUID NOT NULL,
  "workflow_version_id" UUID NOT NULL,
  "workflow_run_id" UUID,
  "actor" VARCHAR(320) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_watch_source_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_watch_source_subscriptions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_subscriptions_watch_source_id_organization_id_fkey"
    FOREIGN KEY ("watch_source_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_watch_sources"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_subscriptions_workflow_id_workflow_version_id_organization_id_fkey"
    FOREIGN KEY ("workflow_id", "workflow_version_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_versions"("workflow_id", "id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "data_workflow_watch_source_subscriptions_id_organization_id_key"
  ON "celesnity_app"."data_workflow_watch_source_subscriptions"("id", "organization_id");
CREATE UNIQUE INDEX "data_workflow_watch_source_subscriptions_source_workflow_version_key"
  ON "celesnity_app"."data_workflow_watch_source_subscriptions"("watch_source_id", "workflow_id", "workflow_version_id", "organization_id");
CREATE INDEX "data_workflow_watch_source_subscriptions_organization_id_source_enabled_idx"
  ON "celesnity_app"."data_workflow_watch_source_subscriptions"("organization_id", "watch_source_id", "enabled");

CREATE TABLE "celesnity_app"."data_workflow_watch_source_checkpoints" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "watch_source_id" UUID NOT NULL,
  "schema_name" VARCHAR(255) NOT NULL,
  "table_name" VARCHAR(255) NOT NULL,
  "opaque_checkpoint" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "established_at" TIMESTAMPTZ(6) NOT NULL,
  "advanced_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_watch_source_checkpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_watch_source_checkpoints_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_checkpoints_watch_source_id_organization_id_fkey"
    FOREIGN KEY ("watch_source_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_watch_sources"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "data_workflow_watch_source_checkpoints_id_organization_id_key"
  ON "celesnity_app"."data_workflow_watch_source_checkpoints"("id", "organization_id");
CREATE UNIQUE INDEX "data_workflow_watch_source_checkpoints_source_relation_key"
  ON "celesnity_app"."data_workflow_watch_source_checkpoints"("watch_source_id", "schema_name", "table_name", "organization_id");
CREATE INDEX "data_workflow_watch_source_checkpoints_organization_id_source_idx"
  ON "celesnity_app"."data_workflow_watch_source_checkpoints"("organization_id", "watch_source_id");

CREATE TABLE "celesnity_app"."data_workflow_watch_source_notification_batches" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "watch_source_id" UUID NOT NULL,
  "capture_key" VARCHAR(512) NOT NULL,
  "captured_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_watch_source_notification_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_watch_source_notification_batches_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_notification_batches_watch_source_id_organization_id_fkey"
    FOREIGN KEY ("watch_source_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_watch_sources"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "data_workflow_watch_source_notification_batches_id_organization_id_key"
  ON "celesnity_app"."data_workflow_watch_source_notification_batches"("id", "organization_id");
CREATE UNIQUE INDEX "data_workflow_watch_source_notification_batches_source_capture_key"
  ON "celesnity_app"."data_workflow_watch_source_notification_batches"("watch_source_id", "capture_key", "organization_id");
CREATE INDEX "data_workflow_watch_source_notification_batches_organization_id_captured_at_idx"
  ON "celesnity_app"."data_workflow_watch_source_notification_batches"("organization_id", "captured_at");

CREATE TABLE "celesnity_app"."data_workflow_watch_source_notifications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "watch_source_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "schema_name" VARCHAR(255) NOT NULL,
  "table_name" VARCHAR(255) NOT NULL,
  "change_types" TEXT[] NOT NULL,
  "checkpoint_fingerprint" VARCHAR(255) NOT NULL,
  "idempotency_key" VARCHAR(768) NOT NULL,
  "adapter_key" VARCHAR(80) NOT NULL,
  "adapter_version" VARCHAR(80) NOT NULL,
  "captured_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_watch_source_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_watch_source_notifications_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_notifications_watch_source_id_organization_id_fkey"
    FOREIGN KEY ("watch_source_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_watch_sources"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_notifications_batch_id_organization_id_fkey"
    FOREIGN KEY ("batch_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_watch_source_notification_batches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "data_workflow_watch_source_notifications_id_organization_id_key"
  ON "celesnity_app"."data_workflow_watch_source_notifications"("id", "organization_id");
CREATE UNIQUE INDEX "data_workflow_watch_source_notifications_source_idempotency_key"
  ON "celesnity_app"."data_workflow_watch_source_notifications"("watch_source_id", "idempotency_key", "organization_id");
CREATE INDEX "data_workflow_watch_source_notifications_organization_id_source_captured_at_idx"
  ON "celesnity_app"."data_workflow_watch_source_notifications"("organization_id", "watch_source_id", "captured_at");

CREATE TABLE "celesnity_app"."data_workflow_watch_source_delivery_assignments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "notification_id" UUID NOT NULL,
  "workflow_id" UUID NOT NULL,
  "workflow_version_id" UUID NOT NULL,
  "workflow_run_id" UUID,
  "status" VARCHAR(16) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "lease_owner" VARCHAR(160),
  "lease_token" UUID,
  "lease_expires_at" TIMESTAMPTZ(6),
  "delivered_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_watch_source_delivery_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_watch_source_delivery_assignments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_delivery_assignments_subscription_id_organization_id_fkey"
    FOREIGN KEY ("subscription_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_watch_source_subscriptions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_delivery_assignments_notification_id_organization_id_fkey"
    FOREIGN KEY ("notification_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_watch_source_notifications"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_delivery_assignments_workflow_id_workflow_version_id_org_fkey"
    FOREIGN KEY ("workflow_id", "workflow_version_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_versions"("workflow_id", "id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_delivery_assignments_workflow_run_id_organization_id_fkey"
    FOREIGN KEY ("workflow_run_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "data_workflow_watch_source_delivery_assignments_id_organization_id_key"
  ON "celesnity_app"."data_workflow_watch_source_delivery_assignments"("id", "organization_id");
CREATE UNIQUE INDEX "data_workflow_watch_source_delivery_assignments_subscription_notification_key"
  ON "celesnity_app"."data_workflow_watch_source_delivery_assignments"("subscription_id", "notification_id", "organization_id");
CREATE INDEX "data_workflow_watch_source_delivery_assignments_organization_id_status_created_at_idx"
  ON "celesnity_app"."data_workflow_watch_source_delivery_assignments"("organization_id", "status", "created_at");
CREATE INDEX "data_workflow_watch_assignments_global_claim_idx"
  ON "celesnity_app"."data_workflow_watch_source_delivery_assignments"("status", "lease_expires_at", "created_at", "id")
  WHERE "status" IN ('PENDING', 'CLAIMED');
CREATE INDEX "data_workflow_watch_assignments_run_idx"
  ON "celesnity_app"."data_workflow_watch_source_delivery_assignments"("status", "workflow_run_id", "created_at");

CREATE FUNCTION "celesnity_app"."reject_data_workflow_watch_subscription_version_mutation"()
RETURNS trigger AS $$
BEGIN
  IF OLD.workflow_id IS DISTINCT FROM NEW.workflow_id
    OR OLD.workflow_version_id IS DISTINCT FROM NEW.workflow_version_id
    OR OLD.watch_source_id IS DISTINCT FROM NEW.watch_source_id
    OR OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Watch Source subscription version pins are immutable.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "data_workflow_watch_source_subscriptions_version_immutable"
  BEFORE UPDATE ON "celesnity_app"."data_workflow_watch_source_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION "celesnity_app"."reject_data_workflow_watch_subscription_version_mutation"();

CREATE FUNCTION "celesnity_app"."validate_data_workflow_watch_notification_batch"()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "celesnity_app"."data_workflow_watch_source_notification_batches" b
    WHERE b.id = NEW.batch_id AND b.organization_id = NEW.organization_id
      AND b.watch_source_id = NEW.watch_source_id
  ) THEN
    RAISE EXCEPTION 'Watch Source notification batch must belong to its watch source.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "data_workflow_watch_source_notifications_valid_batch"
  BEFORE INSERT OR UPDATE ON "celesnity_app"."data_workflow_watch_source_notifications"
  FOR EACH ROW EXECUTE FUNCTION "celesnity_app"."validate_data_workflow_watch_notification_batch"();

CREATE FUNCTION "celesnity_app"."validate_data_workflow_watch_assignment_pin"()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "celesnity_app"."data_workflow_watch_source_subscriptions" s
    WHERE s.id = NEW.subscription_id AND s.organization_id = NEW.organization_id
      AND s.workflow_id = NEW.workflow_id AND s.workflow_version_id = NEW.workflow_version_id
  ) THEN
    RAISE EXCEPTION 'Watch Source delivery assignment must use its subscription version pin.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "data_workflow_watch_source_delivery_assignments_valid_pin"
  BEFORE INSERT OR UPDATE ON "celesnity_app"."data_workflow_watch_source_delivery_assignments"
  FOR EACH ROW EXECUTE FUNCTION "celesnity_app"."validate_data_workflow_watch_assignment_pin"();

CREATE FUNCTION "celesnity_app"."reject_data_workflow_watch_notification_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Watch Source notifications and batches are immutable.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "data_workflow_watch_source_notification_batches_immutable"
  BEFORE UPDATE OR DELETE ON "celesnity_app"."data_workflow_watch_source_notification_batches"
  FOR EACH ROW EXECUTE FUNCTION "celesnity_app"."reject_data_workflow_watch_notification_mutation"();
CREATE TRIGGER "data_workflow_watch_source_notifications_immutable"
  BEFORE UPDATE OR DELETE ON "celesnity_app"."data_workflow_watch_source_notifications"
  FOR EACH ROW EXECUTE FUNCTION "celesnity_app"."reject_data_workflow_watch_notification_mutation"();
