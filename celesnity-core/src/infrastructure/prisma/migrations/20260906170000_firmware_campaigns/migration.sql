CREATE TYPE "celesnity_app"."FirmwareCampaignStatus" AS ENUM
  ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'ABORTED');

CREATE TABLE "celesnity_app"."firmware_campaigns" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "release_id" UUID NOT NULL,
  "release_version" VARCHAR(120) NOT NULL,
  "status" "celesnity_app"."FirmwareCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "canary_size" INTEGER NOT NULL,
  "batch_size" INTEGER NOT NULL,
  "current_batch" INTEGER,
  "requested_by" VARCHAR(160) NOT NULL,
  "error" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "firmware_campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "firmware_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "firmware_campaigns_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "celesnity_app"."firmware_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "celesnity_app"."firmware_campaign_targets" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "batch_number" INTEGER NOT NULL,
  "deployment_id" UUID,
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "firmware_campaign_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "firmware_campaign_targets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "firmware_campaign_targets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "celesnity_app"."firmware_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "firmware_campaign_targets_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "celesnity_app"."devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "firmware_campaign_targets_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "celesnity_app"."firmware_deployments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "firmware_campaigns_organization_id_name_key" ON "celesnity_app"."firmware_campaigns"("organization_id", "name");
CREATE INDEX "firmware_campaigns_organization_id_status_created_at_idx" ON "celesnity_app"."firmware_campaigns"("organization_id", "status", "created_at");
CREATE INDEX "firmware_campaigns_release_id_idx" ON "celesnity_app"."firmware_campaigns"("release_id");
CREATE UNIQUE INDEX "firmware_campaign_targets_campaign_id_device_id_key" ON "celesnity_app"."firmware_campaign_targets"("campaign_id", "device_id");
CREATE UNIQUE INDEX "firmware_campaign_targets_deployment_id_key" ON "celesnity_app"."firmware_campaign_targets"("deployment_id");
CREATE INDEX "firmware_campaign_targets_organization_id_campaign_id_batch_number_idx" ON "celesnity_app"."firmware_campaign_targets"("organization_id", "campaign_id", "batch_number");
CREATE INDEX "firmware_campaign_targets_device_id_idx" ON "celesnity_app"."firmware_campaign_targets"("device_id");
