DROP INDEX IF EXISTS "celesnity_app"."charts_room_id_updated_at_idx";

ALTER TABLE "celesnity_app"."charts"
DROP COLUMN "room_id";

CREATE INDEX "charts_updated_at_idx" ON "celesnity_app"."charts" ("updated_at");
