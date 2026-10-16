CREATE TABLE "celesnity_app"."plant_dashboard_associations" (
  "organization_id" UUID NOT NULL,
  "site_id" UUID NOT NULL,
  "dashboard_id" UUID NOT NULL,
  "role" VARCHAR(30) NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "plant_dashboard_associations_pkey" PRIMARY KEY ("site_id", "dashboard_id"),
  CONSTRAINT "plant_dashboard_associations_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "plant_dashboard_associations_site_id_fkey" FOREIGN KEY ("site_id")
    REFERENCES "celesnity_app"."plant_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "plant_dashboard_associations_dashboard_id_fkey" FOREIGN KEY ("dashboard_id")
    REFERENCES "celesnity_app"."dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "plant_dashboard_associations_organization_id_site_id_display_order_idx"
  ON "celesnity_app"."plant_dashboard_associations" ("organization_id", "site_id", "display_order");

CREATE UNIQUE INDEX "plant_dashboard_associations_one_default_per_site_key"
  ON "celesnity_app"."plant_dashboard_associations" ("site_id") WHERE "is_default" = true;
