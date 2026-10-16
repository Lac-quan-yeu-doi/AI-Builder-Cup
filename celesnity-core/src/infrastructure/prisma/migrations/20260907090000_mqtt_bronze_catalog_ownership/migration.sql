-- MQTT ingestion creates the physical Iceberg namespace asynchronously. Record
-- its organization ownership when an adapter already exists so fail-closed
-- Catalog authorization can expose only the matching tenant's Bronze data.
INSERT INTO "celesnity_app"."catalog_namespace_descriptions" (
    "id",
    "organization_id",
    "catalog",
    "namespace",
    "description",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    adapter."organization_id",
    'iceberg',
    tenant."storage_key" || '_bronze',
    'Managed MQTT Bronze events for ' || tenant."display_name" || '.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "celesnity_app"."mqtt_stream_adapters" AS adapter
JOIN "celesnity_app"."tenants" AS tenant
  ON tenant."id" = adapter."tenant_id"
ON CONFLICT ("catalog", "namespace") DO NOTHING;
