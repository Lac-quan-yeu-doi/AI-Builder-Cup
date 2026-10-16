CREATE TABLE "celesnity_app"."catalog_namespace_descriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "catalog" VARCHAR(255) NOT NULL,
    "namespace" VARCHAR(255) NOT NULL,
    "description" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_namespace_descriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_namespace_descriptions_organization_id_catalog_namespace_key"
ON "celesnity_app"."catalog_namespace_descriptions"("organization_id", "catalog", "namespace");

CREATE INDEX "catalog_namespace_descriptions_organization_id_catalog_idx"
ON "celesnity_app"."catalog_namespace_descriptions"("organization_id", "catalog");

ALTER TABLE "celesnity_app"."catalog_namespace_descriptions"
ADD CONSTRAINT "catalog_namespace_descriptions_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
