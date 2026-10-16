-- Complete the versioned Agent capability ceiling for MCP tool families.
-- The first provisioned dev Agent identity predates the schema migration and
-- was created by the operator CLI with QUERY/read only. The migration kept it
-- intact, so chart, document, workflow and skill tools fail before resource
-- authorization. Reconcile only that exact legacy shape or the untouched
-- migration default; never re-enable an identity or overwrite an admin edit.
WITH targets AS (
  SELECT s."organization_id", s."identity_id", s."permissions", s."features",
         CASE WHEN s."features" = ARRAY['QUERY']::TEXT[]
              THEN 'legacy-operator-cli' ELSE 'migration-default' END AS source
  FROM "celesnity_app"."organization_service_identities" s
  WHERE s."purpose" = 'AGENT'
    AND NOT EXISTS (
      SELECT 1 FROM "celesnity_app"."audit_events" a
      WHERE a."organization_id" = s."organization_id"
        AND a."resource_id" = s."identity_id"::TEXT
        AND a."event_type" = 'SERVICE_IDENTITY_UPDATED'
    )
    AND (
      (s."features" = ARRAY['QUERY', 'ANALYTICS', 'DOCUMENTS', 'PLANT_MODEL', 'AUTOMATIONS']::TEXT[]
       AND s."permissions" = ARRAY['workspace:read', 'workspace:write']::TEXT[])
      OR
      (s."enabled" = TRUE
       AND s."features" = ARRAY['QUERY']::TEXT[]
       AND s."permissions" = ARRAY['workspace:read']::TEXT[]
       AND EXISTS (
         SELECT 1 FROM "celesnity_app"."audit_events" a
         WHERE a."organization_id" = s."organization_id"
           AND a."resource_id" = s."identity_id"::TEXT
           AND a."event_type" = 'SERVICE_IDENTITY_PROVISIONED'
           AND a."metadata"->>'source' = 'operator-cli'
       ))
    )
), updated AS (
  UPDATE "celesnity_app"."organization_service_identities" s
  SET "permissions" = ARRAY['workspace:read', 'workspace:write']::TEXT[],
      "features" = ARRAY['QUERY', 'ANALYTICS', 'DOCUMENTS', 'PLANT_MODEL', 'AUTOMATIONS', 'ADMINISTRATION']::TEXT[],
      "updated_at" = CURRENT_TIMESTAMP
  FROM targets t
  WHERE s."organization_id" = t."organization_id" AND s."purpose" = 'AGENT'
    AND s."identity_id" = t."identity_id"
  RETURNING s."organization_id", s."identity_id", t.source
)
INSERT INTO "celesnity_app"."audit_events"
  ("id", "organization_id", "event_type", "action", "resource_type", "resource_id", "outcome", "metadata")
SELECT gen_random_uuid(), u."organization_id", 'SERVICE_IDENTITY_MIGRATED',
       'reconcile_capabilities', 'organization-service-identity', u."identity_id"::TEXT,
       'SUCCEEDED', jsonb_build_object('purpose', 'AGENT', 'source', u.source,
                                      'migration', '20260926110000_reconcile_agent_mcp_capabilities')
FROM updated u;
