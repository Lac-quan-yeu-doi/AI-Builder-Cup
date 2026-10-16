CREATE TYPE "celesnity_app"."DeviceConfigurationStatus" AS ENUM (
  'QUEUED',
  'DISPATCHED',
  'APPLIED',
  'FAILED',
  'ROLLED_BACK'
);

ALTER TABLE "celesnity_app"."devices"
  ADD COLUMN "desired_configuration_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "applied_configuration_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reported_configuration_version" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "devices_desired_configuration_version_check"
    CHECK ("desired_configuration_version" >= 0),
  ADD CONSTRAINT "devices_applied_configuration_version_check"
    CHECK ("applied_configuration_version" >= 0),
  ADD CONSTRAINT "devices_reported_configuration_version_check"
    CHECK ("reported_configuration_version" >= 0);

CREATE TABLE "celesnity_app"."device_configurations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "celesnity_app"."DeviceConfigurationStatus" NOT NULL DEFAULT 'QUEUED',
  "parameters" JSONB NOT NULL,
  "restore_factory_defaults" BOOLEAN NOT NULL DEFAULT FALSE,
  "previous_applied_version" INTEGER NOT NULL DEFAULT 0,
  "event_token_hash" CHAR(64) NOT NULL,
  "requested_by" VARCHAR(160) NOT NULL,
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatched_at" TIMESTAMPTZ(6),
  "applied_at" TIMESTAMPTZ(6),
  "finished_at" TIMESTAMPTZ(6),
  "error" VARCHAR(500),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "device_configurations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "device_configurations_version_check" CHECK ("version" > 0),
  CONSTRAINT "device_configurations_previous_applied_version_check"
    CHECK ("previous_applied_version" >= 0),
  CONSTRAINT "device_configurations_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "device_configurations_device_id_fkey" FOREIGN KEY ("device_id")
    REFERENCES "celesnity_app"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "device_configurations_device_id_version_key"
  ON "celesnity_app"."device_configurations"("device_id", "version");
CREATE INDEX "device_configurations_organization_id_requested_at_idx"
  ON "celesnity_app"."device_configurations"("organization_id", "requested_at");
CREATE INDEX "device_configurations_device_id_status_idx"
  ON "celesnity_app"."device_configurations"("device_id", "status");
CREATE UNIQUE INDEX "device_configurations_active_device_key"
  ON "celesnity_app"."device_configurations"("device_id")
  WHERE "status" IN ('QUEUED', 'DISPATCHED');
