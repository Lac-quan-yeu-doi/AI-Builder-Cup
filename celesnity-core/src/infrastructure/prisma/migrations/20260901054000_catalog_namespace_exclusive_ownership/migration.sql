-- A physical Trino/Iceberg namespace is a single shared resource. Its ownership
-- record must therefore be globally unique across organizations.
DROP INDEX "celesnity_app"."catalog_namespace_descriptions_organization_id_catalog_namespace_key";

CREATE UNIQUE INDEX "catalog_namespace_descriptions_catalog_namespace_key"
ON "celesnity_app"."catalog_namespace_descriptions"("catalog", "namespace");
