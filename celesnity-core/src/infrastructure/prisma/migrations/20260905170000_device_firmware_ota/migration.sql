CREATE TYPE "celesnity_app"."FirmwareDeploymentStatus" AS ENUM (
  'QUEUED', 'DISPATCHED', 'ACCEPTED', 'DOWNLOADING', 'VERIFYING',
  'INSTALLING', 'REBOOTING', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK', 'CANCELLED'
);

CREATE TABLE "celesnity_app"."firmware_releases" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "version" VARCHAR(120) NOT NULL,
  "device_model" VARCHAR(120) NOT NULL,
  "hardware_revision" VARCHAR(80),
  "artifact_url" VARCHAR(2048) NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "signature" TEXT NOT NULL,
  "release_notes" TEXT,
  "created_by" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "firmware_releases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "firmware_releases_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "firmware_releases_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "firmware_releases_organization_model_hardware_version_key"
  ON "celesnity_app"."firmware_releases" (
    "organization_id", "device_model", COALESCE("hardware_revision", ''), "version"
  );
CREATE INDEX "firmware_releases_organization_id_created_at_idx"
  ON "celesnity_app"."firmware_releases"("organization_id", "created_at");

CREATE TABLE "celesnity_app"."firmware_deployments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "release_id" UUID NOT NULL,
  "release_version" VARCHAR(120) NOT NULL,
  "status" "celesnity_app"."FirmwareDeploymentStatus" NOT NULL DEFAULT 'QUEUED',
  "progress_percent" INTEGER NOT NULL DEFAULT 0,
  "previous_version" VARCHAR(120),
  "error" VARCHAR(500),
  "event_token_hash" CHAR(64) NOT NULL,
  "requested_by" VARCHAR(160) NOT NULL,
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(6),
  "finished_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "firmware_deployments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "firmware_deployments_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "firmware_deployments_device_id_fkey" FOREIGN KEY ("device_id")
    REFERENCES "celesnity_app"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "firmware_deployments_release_id_fkey" FOREIGN KEY ("release_id")
    REFERENCES "celesnity_app"."firmware_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "firmware_deployments_progress_check" CHECK ("progress_percent" BETWEEN 0 AND 100),
  CONSTRAINT "firmware_deployments_event_token_hash_check" CHECK ("event_token_hash" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "firmware_deployments_organization_id_requested_at_idx"
  ON "celesnity_app"."firmware_deployments"("organization_id", "requested_at");
CREATE INDEX "firmware_deployments_device_id_requested_at_idx"
  ON "celesnity_app"."firmware_deployments"("device_id", "requested_at");
CREATE INDEX "firmware_deployments_release_id_idx"
  ON "celesnity_app"."firmware_deployments"("release_id");
CREATE UNIQUE INDEX "firmware_deployments_one_active_per_device_key"
  ON "celesnity_app"."firmware_deployments"("device_id")
  WHERE "status" IN (
    'QUEUED', 'DISPATCHED', 'ACCEPTED', 'DOWNLOADING', 'VERIFYING', 'INSTALLING', 'REBOOTING'
  );
