SET ROLE celesnity_app_owner;

-- ACTIVE duplicated the commissioned device's administrative and reconciliation
-- state, while FAULTY duplicated reported alerts. Normalize both legacy values
-- before replacing the PostgreSQL enum with the provisioning-only lifecycle.
UPDATE "celesnity_app"."device_lifecycle_transitions"
SET "reason" = LEFT(
  CONCAT(
    '[Legacy lifecycle ',
    COALESCE("from_state"::text, 'NONE'),
    ' -> ',
    "to_state"::text,
    '] ',
    COALESCE("reason", '')
  ),
  500
)
WHERE "from_state" IN ('ACTIVE', 'FAULTY')
   OR "to_state" IN ('ACTIVE', 'FAULTY');

-- Older records may have reached ACTIVE/FAULTY without a populated timestamp.
-- Once normalized, every commissioned device should retain a usable milestone.
UPDATE "celesnity_app"."devices"
SET "commissioned_at" = COALESCE("commissioned_at", "updated_at", "created_at")
WHERE "lifecycle_state" IN ('ACTIVE', 'FAULTY');

ALTER TYPE "celesnity_app"."DeviceLifecycleState"
  RENAME TO "DeviceLifecycleState_legacy";

CREATE TYPE "celesnity_app"."DeviceLifecycleState" AS ENUM
  ('MANUFACTURED', 'PROVISIONED', 'COMMISSIONED', 'DECOMMISSIONED');

ALTER TABLE "celesnity_app"."devices"
  ALTER COLUMN "lifecycle_state" DROP DEFAULT,
  ALTER COLUMN "lifecycle_state" TYPE "celesnity_app"."DeviceLifecycleState"
    USING (
      CASE
        WHEN "lifecycle_state"::text IN ('ACTIVE', 'FAULTY') THEN 'COMMISSIONED'
        ELSE "lifecycle_state"::text
      END
    )::"celesnity_app"."DeviceLifecycleState",
  ALTER COLUMN "lifecycle_state" SET DEFAULT 'MANUFACTURED';

ALTER TABLE "celesnity_app"."device_lifecycle_transitions"
  ALTER COLUMN "from_state" TYPE "celesnity_app"."DeviceLifecycleState"
    USING (
      CASE
        WHEN "from_state" IS NULL THEN NULL
        WHEN "from_state"::text IN ('ACTIVE', 'FAULTY') THEN 'COMMISSIONED'
        ELSE "from_state"::text
      END
    )::"celesnity_app"."DeviceLifecycleState",
  ALTER COLUMN "to_state" TYPE "celesnity_app"."DeviceLifecycleState"
    USING (
      CASE
        WHEN "to_state"::text IN ('ACTIVE', 'FAULTY') THEN 'COMMISSIONED'
        ELSE "to_state"::text
      END
    )::"celesnity_app"."DeviceLifecycleState";

DROP TYPE "celesnity_app"."DeviceLifecycleState_legacy";

RESET ROLE;
