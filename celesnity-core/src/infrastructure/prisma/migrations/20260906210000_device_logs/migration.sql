CREATE TYPE "celesnity_app"."DeviceLogLevel" AS ENUM ('ERROR', 'WARNING', 'INFO', 'DEBUG');
CREATE TYPE "celesnity_app"."DeviceLogKind" AS ENUM ('OPERATIONAL', 'FAULT');

CREATE TABLE "celesnity_app"."device_logs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "source_event_id" UUID NOT NULL,
  "level" "celesnity_app"."DeviceLogLevel" NOT NULL,
  "kind" "celesnity_app"."DeviceLogKind" NOT NULL DEFAULT 'OPERATIONAL',
  "message" VARCHAR(500) NOT NULL,
  "context" JSONB NOT NULL,
  "observed_at" TIMESTAMPTZ(6) NOT NULL,
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "device_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "device_logs_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "device_logs_device_id_fkey" FOREIGN KEY ("device_id")
    REFERENCES "celesnity_app"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "device_logs_organization_id_source_event_id_key"
  ON "celesnity_app"."device_logs"("organization_id", "source_event_id");
CREATE INDEX "device_logs_organization_id_observed_at_idx"
  ON "celesnity_app"."device_logs"("organization_id", "observed_at");
CREATE INDEX "device_logs_device_id_observed_at_idx"
  ON "celesnity_app"."device_logs"("device_id", "observed_at");
CREATE INDEX "device_logs_device_id_level_observed_at_idx"
  ON "celesnity_app"."device_logs"("device_id", "level", "observed_at");
