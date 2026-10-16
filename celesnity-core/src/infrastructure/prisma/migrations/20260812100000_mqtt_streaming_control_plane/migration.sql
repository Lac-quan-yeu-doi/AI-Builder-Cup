SET ROLE celesnity_app_owner;

CREATE TYPE "celesnity_app"."StreamAdapterStatus" AS ENUM
  ('PROVISIONING', 'ACTIVE', 'DEGRADED', 'PAUSED', 'FAILED', 'ARCHIVED');
CREATE TYPE "celesnity_app"."StreamAdapterDesiredState" AS ENUM
  ('ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "celesnity_app"."StreamingPlacementKind" AS ENUM ('SHARED', 'DEDICATED');
CREATE TYPE "celesnity_app"."ProvisioningAttemptStatus" AS ENUM
  ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "celesnity_app"."tenants" (
  "id" UUID NOT NULL,
  "storage_key" VARCHAR(52) NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_storage_key_key"
  ON "celesnity_app"."tenants"("storage_key");

CREATE TABLE "celesnity_app"."mqtt_stream_adapters" (
  "id" UUID NOT NULL,
  "public_key" VARCHAR(52) NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "broker_url" VARCHAR(2048) NOT NULL,
  "topic_filter" VARCHAR(1024) NOT NULL,
  "qos" INTEGER NOT NULL DEFAULT 1,
  "encrypted_credential_payload" TEXT NOT NULL,
  "encryption_iv" VARCHAR(255) NOT NULL,
  "encryption_auth_tag" VARCHAR(255) NOT NULL,
  "encryption_key_version" VARCHAR(50) NOT NULL,
  "desired_state" "celesnity_app"."StreamAdapterDesiredState" NOT NULL DEFAULT 'ACTIVE',
  "status" "celesnity_app"."StreamAdapterStatus" NOT NULL DEFAULT 'PROVISIONING',
  "placement_kind" "celesnity_app"."StreamingPlacementKind" NOT NULL DEFAULT 'SHARED',
  "deployment_id" VARCHAR(120) NOT NULL DEFAULT 'shared-0',
  "generation" INTEGER NOT NULL DEFAULT 1,
  "observed_generation" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "last_reconciled_at" TIMESTAMPTZ(6),
  "reconcile_after" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reconciliation_failures" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "mqtt_stream_adapters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mqtt_stream_adapters_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "celesnity_app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "mqtt_stream_adapters_qos_check" CHECK ("qos" BETWEEN 0 AND 2)
);

CREATE UNIQUE INDEX "mqtt_stream_adapters_public_key_key"
  ON "celesnity_app"."mqtt_stream_adapters"("public_key");
CREATE UNIQUE INDEX "mqtt_stream_adapters_tenant_id_name_key"
  ON "celesnity_app"."mqtt_stream_adapters"("tenant_id", "name");
CREATE INDEX "mqtt_stream_adapters_status_reconcile_after_idx"
  ON "celesnity_app"."mqtt_stream_adapters"("status", "reconcile_after");
CREATE INDEX "mqtt_stream_adapters_tenant_id_status_idx"
  ON "celesnity_app"."mqtt_stream_adapters"("tenant_id", "status");

CREATE TABLE "celesnity_app"."streaming_provisioning_attempts" (
  "id" UUID NOT NULL,
  "adapter_id" UUID NOT NULL,
  "generation" INTEGER NOT NULL,
  "status" "celesnity_app"."ProvisioningAttemptStatus" NOT NULL DEFAULT 'RUNNING',
  "error" TEXT,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),
  CONSTRAINT "streaming_provisioning_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "streaming_provisioning_attempts_adapter_id_fkey" FOREIGN KEY ("adapter_id")
    REFERENCES "celesnity_app"."mqtt_stream_adapters"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "streaming_provisioning_attempts_adapter_id_started_at_idx"
  ON "celesnity_app"."streaming_provisioning_attempts"("adapter_id", "started_at");

RESET ROLE;
