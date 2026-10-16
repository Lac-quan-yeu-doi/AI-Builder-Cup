ALTER TABLE "celesnity_app"."device_configurations"
ADD COLUMN "confirmed_at" TIMESTAMPTZ(6);

UPDATE "celesnity_app"."device_configurations" AS configuration
SET "confirmed_at" = COALESCE(configuration."applied_at", configuration."updated_at")
FROM "celesnity_app"."devices" AS device
WHERE configuration."device_id" = device."id"
  AND configuration."status" = 'APPLIED'
  AND device."reported_configuration_version" = configuration."version";

CREATE INDEX "device_configurations_confirmation_idx"
ON "celesnity_app"."device_configurations" ("status", "confirmed_at", "applied_at");
