CREATE TYPE "celesnity_app"."DeviceContactStatus" AS ENUM ('NEVER_SEEN', 'ONLINE', 'LOST_CONTACT');
CREATE TYPE "celesnity_app"."DeviceAlertStatus" AS ENUM ('RAISED', 'ACKNOWLEDGED', 'CLEARED');
CREATE TYPE "celesnity_app"."DeviceAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "celesnity_app"."DeviceAlertType" AS ENUM ('LOSS_OF_CONTACT');

ALTER TABLE "celesnity_app"."devices"
  ADD COLUMN "expected_check_in_interval_seconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "missed_check_in_threshold" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "contact_status" "celesnity_app"."DeviceContactStatus" NOT NULL DEFAULT 'NEVER_SEEN',
  ADD COLUMN "contact_deadline_at" TIMESTAMPTZ(6),
  ADD COLUMN "contact_lost_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "devices_expected_check_in_interval_seconds_check"
    CHECK ("expected_check_in_interval_seconds" BETWEEN 1 AND 86400),
  ADD CONSTRAINT "devices_missed_check_in_threshold_check"
    CHECK ("missed_check_in_threshold" BETWEEN 1 AND 100);

UPDATE "celesnity_app"."devices"
SET
  "contact_status" = 'ONLINE',
  "contact_deadline_at" = "last_seen_at" + INTERVAL '180 seconds'
WHERE "last_seen_at" IS NOT NULL;

CREATE INDEX "devices_contact_status_contact_deadline_at_idx"
  ON "celesnity_app"."devices"("contact_status", "contact_deadline_at");

CREATE TABLE "celesnity_app"."device_alerts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "type" "celesnity_app"."DeviceAlertType" NOT NULL,
  "severity" "celesnity_app"."DeviceAlertSeverity" NOT NULL,
  "status" "celesnity_app"."DeviceAlertStatus" NOT NULL DEFAULT 'RAISED',
  "snapshot" JSONB NOT NULL,
  "raised_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMPTZ(6),
  "acknowledged_by" VARCHAR(160),
  "cleared_at" TIMESTAMPTZ(6),
  "cleared_by" VARCHAR(160),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "device_alerts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "device_alerts_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "device_alerts_device_id_fkey" FOREIGN KEY ("device_id")
    REFERENCES "celesnity_app"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "device_alerts_organization_id_status_raised_at_idx"
  ON "celesnity_app"."device_alerts"("organization_id", "status", "raised_at");
CREATE INDEX "device_alerts_device_id_raised_at_idx"
  ON "celesnity_app"."device_alerts"("device_id", "raised_at");
CREATE UNIQUE INDEX "device_alerts_active_loss_of_contact_key"
  ON "celesnity_app"."device_alerts"("device_id", "type")
  WHERE "status" <> 'CLEARED';
