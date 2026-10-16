SET ROLE celesnity_app_owner;

CREATE TYPE "celesnity_app"."DeviceType" AS ENUM ('GATEWAY', 'SENSOR');
CREATE TYPE "celesnity_app"."DeviceLifecycleState" AS ENUM
  ('MANUFACTURED', 'PROVISIONED', 'COMMISSIONED', 'ACTIVE', 'FAULTY', 'DECOMMISSIONED');

CREATE TABLE "celesnity_app"."measurement_points" (
  "id" UUID NOT NULL,
  "adapter_id" UUID NOT NULL,
  "external_key" VARCHAR(128) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "deployment_site" VARCHAR(160),
  "physical_location" VARCHAR(255),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "measurement_points_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "measurement_points_adapter_id_fkey" FOREIGN KEY ("adapter_id")
    REFERENCES "celesnity_app"."mqtt_stream_adapters"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "measurement_points_adapter_id_external_key_key"
  ON "celesnity_app"."measurement_points"("adapter_id", "external_key");

ALTER TABLE "celesnity_app"."devices"
  ADD COLUMN "device_type" "celesnity_app"."DeviceType" NOT NULL DEFAULT 'GATEWAY',
  ADD COLUMN "deployment_site" VARCHAR(160),
  ADD COLUMN "physical_location" VARCHAR(255),
  ADD COLUMN "commissioned_at" TIMESTAMPTZ(6),
  ADD COLUMN "provisioning_confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "lifecycle_state" "celesnity_app"."DeviceLifecycleState" NOT NULL DEFAULT 'MANUFACTURED',
  ADD COLUMN "gateway_id" UUID,
  ADD COLUMN "measurement_point_id" UUID,
  ADD CONSTRAINT "devices_gateway_id_fkey" FOREIGN KEY ("gateway_id")
    REFERENCES "celesnity_app"."devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "devices_measurement_point_id_fkey" FOREIGN KEY ("measurement_point_id")
    REFERENCES "celesnity_app"."measurement_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "devices_adapter_id_device_type_lifecycle_state_idx"
  ON "celesnity_app"."devices"("adapter_id", "device_type", "lifecycle_state");
CREATE INDEX "devices_gateway_id_idx" ON "celesnity_app"."devices"("gateway_id");
CREATE INDEX "devices_measurement_point_id_idx"
  ON "celesnity_app"."devices"("measurement_point_id");

CREATE TABLE "celesnity_app"."device_lifecycle_transitions" (
  "id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "from_state" "celesnity_app"."DeviceLifecycleState",
  "to_state" "celesnity_app"."DeviceLifecycleState" NOT NULL,
  "operator_id" VARCHAR(160) NOT NULL,
  "reason" VARCHAR(500),
  "transitioned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "device_lifecycle_transitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "device_lifecycle_transitions_device_id_fkey" FOREIGN KEY ("device_id")
    REFERENCES "celesnity_app"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "device_lifecycle_transitions_device_id_transitioned_at_idx"
  ON "celesnity_app"."device_lifecycle_transitions"("device_id", "transitioned_at");

RESET ROLE;
