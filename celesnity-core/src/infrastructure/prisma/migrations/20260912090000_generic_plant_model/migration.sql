CREATE TABLE "celesnity_app"."plant_sites" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "code" VARCHAR(120) NOT NULL,
  "timezone" VARCHAR(80) NOT NULL,
  "draft" JSONB NOT NULL,
  "reference_data" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "latest_published_version" INTEGER,
  "published_revision" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "plant_sites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plant_sites_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "plant_sites_organization_code_ci_key"
  ON "celesnity_app"."plant_sites" ("organization_id", lower("code"));
CREATE INDEX "plant_sites_organization_id_updated_at_idx"
  ON "celesnity_app"."plant_sites" ("organization_id", "updated_at");

CREATE TABLE "celesnity_app"."plant_model_versions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "site_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "note" VARCHAR(400),
  "published_by" VARCHAR(320) NOT NULL,
  "published_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "plant_model_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plant_model_versions_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "plant_model_versions_site_id_fkey" FOREIGN KEY ("site_id")
    REFERENCES "celesnity_app"."plant_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "plant_model_versions_site_id_version_number_key"
  ON "celesnity_app"."plant_model_versions" ("site_id", "version_number");
CREATE INDEX "plant_model_versions_organization_id_published_at_idx"
  ON "celesnity_app"."plant_model_versions" ("organization_id", "published_at");
