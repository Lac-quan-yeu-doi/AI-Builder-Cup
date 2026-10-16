ALTER TYPE "celesnity_app"."DeviceAlertType" ADD VALUE IF NOT EXISTS 'STORAGE_ALMOST_FULL';
ALTER TYPE "celesnity_app"."DeviceAlertType" ADD VALUE IF NOT EXISTS 'SIM_DATA_LIMIT';
ALTER TYPE "celesnity_app"."DeviceAlertType" ADD VALUE IF NOT EXISTS 'BATTERY_LOW';
ALTER TYPE "celesnity_app"."DeviceAlertType" ADD VALUE IF NOT EXISTS 'TAMPER';
ALTER TYPE "celesnity_app"."DeviceAlertType" ADD VALUE IF NOT EXISTS 'SHOCK';
ALTER TYPE "celesnity_app"."DeviceAlertType" ADD VALUE IF NOT EXISTS 'MOVED';
ALTER TYPE "celesnity_app"."DeviceAlertType" ADD VALUE IF NOT EXISTS 'SENSOR_FAULT';
ALTER TYPE "celesnity_app"."DeviceAlertType" ADD VALUE IF NOT EXISTS 'UNEXPECTED_REBOOT';
ALTER TYPE "celesnity_app"."DeviceAlertType" ADD VALUE IF NOT EXISTS 'RADIO_DEGRADED';
ALTER TYPE "celesnity_app"."DeviceAlertType" ADD VALUE IF NOT EXISTS 'LTE_MODEM_FAILURE';

ALTER TABLE "celesnity_app"."device_alerts"
  ADD COLUMN "source_event_id" UUID;

DROP INDEX "celesnity_app"."device_alerts_active_loss_of_contact_key";

CREATE UNIQUE INDEX "device_alerts_active_type_key"
  ON "celesnity_app"."device_alerts"("device_id", "type")
  WHERE "status" <> 'CLEARED';

CREATE UNIQUE INDEX "device_alerts_organization_id_source_event_id_key"
  ON "celesnity_app"."device_alerts"("organization_id", "source_event_id");
