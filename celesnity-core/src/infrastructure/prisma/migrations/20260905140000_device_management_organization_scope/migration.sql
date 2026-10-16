ALTER TABLE "celesnity_app"."devices"
  ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."measurement_points"
  ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."device_lifecycle_transitions"
  ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."device_provisioning_attempts"
  ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE "celesnity_app"."devices"
  ADD CONSTRAINT "devices_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "celesnity_app"."measurement_points"
  ADD CONSTRAINT "measurement_points_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "celesnity_app"."device_lifecycle_transitions"
  ADD CONSTRAINT "device_lifecycle_transitions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "celesnity_app"."device_provisioning_attempts"
  ADD CONSTRAINT "device_provisioning_attempts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT;

CREATE INDEX "devices_organization_id_idx" ON "celesnity_app"."devices"("organization_id");
CREATE INDEX "measurement_points_organization_id_idx" ON "celesnity_app"."measurement_points"("organization_id");
CREATE INDEX "device_lifecycle_transitions_organization_id_idx"
  ON "celesnity_app"."device_lifecycle_transitions"("organization_id");
CREATE INDEX "device_provisioning_attempts_organization_id_idx"
  ON "celesnity_app"."device_provisioning_attempts"("organization_id");
