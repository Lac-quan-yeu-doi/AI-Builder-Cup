SET ROLE celesnity_app_owner;

CREATE TYPE "celesnity_app"."DeviceStatus" AS ENUM
  ('PROVISIONING', 'ACTIVE', 'DEGRADED', 'SUSPENDED', 'FAILED', 'RETIRED');
CREATE TYPE "celesnity_app"."DeviceDesiredState" AS ENUM
  ('ACTIVE', 'SUSPENDED', 'RETIRED');

CREATE TABLE "celesnity_app"."devices" (
  "id" UUID NOT NULL,
  "public_key" VARCHAR(52) NOT NULL,
  "adapter_id" UUID NOT NULL,
  "external_device_id" VARCHAR(128) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "hardware_revision" VARCHAR(80),
  "current_firmware_version" VARCHAR(120),
  "telemetry_topic" VARCHAR(1024) NOT NULL,
  "firmware_events_topic" VARCHAR(1024) NOT NULL,
  "firmware_commands_topic" VARCHAR(1024) NOT NULL,
  "qos" INTEGER NOT NULL DEFAULT 1,
  "encrypted_credential_payload" TEXT NOT NULL,
  "encryption_iv" VARCHAR(255) NOT NULL,
  "encryption_auth_tag" VARCHAR(255) NOT NULL,
  "encryption_key_version" VARCHAR(50) NOT NULL,
  "desired_state" "celesnity_app"."DeviceDesiredState" NOT NULL DEFAULT 'ACTIVE',
  "status" "celesnity_app"."DeviceStatus" NOT NULL DEFAULT 'PROVISIONING',
  "generation" INTEGER NOT NULL DEFAULT 1,
  "observed_generation" INTEGER NOT NULL DEFAULT 0,
  "last_seen_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "last_reconciled_at" TIMESTAMPTZ(6),
  "reconcile_after" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reconciliation_failures" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "devices_adapter_id_fkey" FOREIGN KEY ("adapter_id")
    REFERENCES "celesnity_app"."mqtt_stream_adapters"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devices_qos_check" CHECK ("qos" BETWEEN 0 AND 2)
);

CREATE UNIQUE INDEX "devices_public_key_key"
  ON "celesnity_app"."devices"("public_key");
CREATE UNIQUE INDEX "devices_adapter_id_external_device_id_key"
  ON "celesnity_app"."devices"("adapter_id", "external_device_id");
CREATE INDEX "devices_adapter_id_status_idx"
  ON "celesnity_app"."devices"("adapter_id", "status");
CREATE INDEX "devices_adapter_id_last_seen_at_idx"
  ON "celesnity_app"."devices"("adapter_id", "last_seen_at");
CREATE INDEX "devices_status_reconcile_after_idx"
  ON "celesnity_app"."devices"("status", "reconcile_after");

CREATE TABLE "celesnity_app"."device_provisioning_attempts" (
  "id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "generation" INTEGER NOT NULL,
  "status" "celesnity_app"."ProvisioningAttemptStatus" NOT NULL DEFAULT 'RUNNING',
  "error" TEXT,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),
  CONSTRAINT "device_provisioning_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "device_provisioning_attempts_device_id_fkey" FOREIGN KEY ("device_id")
    REFERENCES "celesnity_app"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "device_provisioning_attempts_device_id_started_at_idx"
  ON "celesnity_app"."device_provisioning_attempts"("device_id", "started_at");

RESET ROLE;
