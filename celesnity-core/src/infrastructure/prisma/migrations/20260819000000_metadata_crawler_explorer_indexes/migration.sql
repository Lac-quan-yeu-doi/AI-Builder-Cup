BEGIN;

SET LOCAL ROLE celesnity_app_owner;

CREATE INDEX "catalog_namespaces_database_service_id_deleted_at_name_id_idx"
  ON "celesnity_app"."catalog_namespaces" ("database_service_id", "deleted_at", "name", "id");
CREATE INDEX "catalog_relations_namespace_id_deleted_at_name_id_idx"
  ON "celesnity_app"."catalog_relations" ("namespace_id", "deleted_at", "name", "id");
CREATE INDEX "catalog_columns_relation_id_deleted_at_ordinal_position_id_idx"
  ON "celesnity_app"."catalog_columns" ("relation_id", "deleted_at", "ordinal_position", "id");
CREATE INDEX "catalog_constraints_relation_id_deleted_at_id_idx"
  ON "celesnity_app"."catalog_constraints" ("relation_id", "deleted_at", "id");

COMMIT;
