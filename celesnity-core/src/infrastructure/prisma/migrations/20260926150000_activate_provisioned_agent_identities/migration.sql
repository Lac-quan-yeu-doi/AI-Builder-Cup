-- Agent workload authentication and explicit user/Agent catalog grants remain
-- independent checks. Activate only identities left disabled by the original
-- provisioning path; never undo an administrator's explicit disable/revocation.
WITH eligible AS (
  SELECT s."organization_id", s."identity_id"
  FROM "celesnity_app"."organization_service_identities" s
  JOIN "celesnity_app"."user_identities" i ON i."id" = s."identity_id"
  JOIN "celesnity_app"."organization_memberships" m
    ON m."organization_id" = s."organization_id" AND m."identity_id" = s."identity_id"
  WHERE s."purpose" = 'AGENT'
    AND s."enabled" = FALSE
    AND i."provider" = 'organization-service'
    AND i."status" = 'ACTIVE'
    AND m."role" = 'SERVICE_ACCOUNT'
    AND m."status" = 'ACTIVE'
    AND (m."expires_at" IS NULL OR m."expires_at" > CURRENT_TIMESTAMP)
    AND s."permissions" @> ARRAY['workspace:read']::TEXT[]
    AND s."features" @> ARRAY['QUERY']::TEXT[]
    AND EXISTS (
      SELECT 1 FROM "celesnity_app"."audit_events" a
      WHERE a."organization_id" = s."organization_id"
        AND a."resource_id" = s."identity_id"::TEXT
        AND a."action" = 'provision'
        AND a."event_type" IN ('SERVICE_IDENTITY_MIGRATED', 'SERVICE_IDENTITY_PROVISIONED')
        AND a."metadata"->>'source' IN ('migration', 'organization-lifecycle')
    )
    AND NOT EXISTS (
      SELECT 1 FROM "celesnity_app"."audit_events" a
      WHERE a."organization_id" = s."organization_id"
        AND a."resource_id" = s."identity_id"::TEXT
        AND a."event_type" = 'SERVICE_IDENTITY_UPDATED'
    )
  FOR UPDATE OF s
), activated AS (
  UPDATE "celesnity_app"."organization_service_identities" s
  SET "enabled" = TRUE, "updated_at" = CURRENT_TIMESTAMP
  FROM eligible e
  WHERE s."organization_id" = e."organization_id"
    AND s."purpose" = 'AGENT'
    AND s."identity_id" = e."identity_id"
    AND s."enabled" = FALSE
  RETURNING s."organization_id", s."identity_id"
)
INSERT INTO "celesnity_app"."audit_events"
  ("id", "organization_id", "event_type", "action", "resource_type", "resource_id", "outcome", "metadata")
SELECT gen_random_uuid(), a."organization_id", 'SERVICE_IDENTITY_MIGRATED',
       'activate', 'organization-service-identity', a."identity_id"::TEXT,
       'SUCCEEDED', jsonb_build_object('purpose', 'AGENT',
         'migration', '20260926150000_activate_provisioned_agent_identities')
FROM activated a;
