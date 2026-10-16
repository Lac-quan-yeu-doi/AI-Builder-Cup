CREATE TABLE "celesnity_app"."device_configuration_templates" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "version" INTEGER NOT NULL,
  "parameters" JSONB NOT NULL,
  "created_by" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "device_configuration_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "device_configuration_templates_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "device_configuration_templates_organization_id_name_version_key"
  ON "celesnity_app"."device_configuration_templates"("organization_id", "name", "version");
CREATE INDEX "device_configuration_templates_organization_id_created_at_idx"
  ON "celesnity_app"."device_configuration_templates"("organization_id", "created_at");
