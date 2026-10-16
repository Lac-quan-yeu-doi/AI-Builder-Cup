-- Install the least-privilege application principals as part of the schema
-- migration. Existing bindings (including disabled/revoked ones) are never
-- updated or re-enabled by a later deploy.
DO $$
DECLARE
  org RECORD;
  service_purpose TEXT;
  new_identity_id UUID;
BEGIN
  FOR org IN SELECT id FROM "celesnity_app"."organizations" LOOP
    FOREACH service_purpose IN ARRAY ARRAY['BACKGROUND', 'AGENT'] LOOP
      IF EXISTS (
        SELECT 1 FROM "celesnity_app"."organization_service_identities"
        WHERE "organization_id" = org.id AND "purpose" = service_purpose
      ) THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM "celesnity_app"."user_identities"
        WHERE "provider" = 'organization-service'
          AND "identity_tenant_id" = 'service:' || org.id::TEXT
          AND "subject" = lower(service_purpose) || ':' || org.id::TEXT
      ) THEN
        RAISE EXCEPTION 'Unbound organization service principal already exists for organization % and purpose %', org.id, service_purpose;
      END IF;

      new_identity_id := gen_random_uuid();
      INSERT INTO "celesnity_app"."user_identities"
        ("id", "provider", "subject", "identity_tenant_id", "display_name", "updated_at")
      VALUES
        (new_identity_id, 'organization-service', lower(service_purpose) || ':' || org.id::TEXT,
         'service:' || org.id::TEXT, 'Organization ' || lower(service_purpose) || ' service', CURRENT_TIMESTAMP);

      INSERT INTO "celesnity_app"."organization_memberships"
        ("id", "organization_id", "identity_id", "role", "updated_at")
      VALUES (gen_random_uuid(), org.id, new_identity_id, 'SERVICE_ACCOUNT', CURRENT_TIMESTAMP);

      INSERT INTO "celesnity_app"."organization_service_identities"
        ("organization_id", "purpose", "identity_id", "enabled", "permissions", "features", "updated_at")
      VALUES
        (org.id, service_purpose, new_identity_id, service_purpose = 'BACKGROUND',
         ARRAY['workspace:read', 'workspace:write']::TEXT[],
         CASE WHEN service_purpose = 'BACKGROUND'
           THEN ARRAY['EXECUTIONS', 'CRAWLER', 'AUTOMATIONS', 'DEVICES']::TEXT[]
           ELSE ARRAY['QUERY', 'ANALYTICS', 'DOCUMENTS', 'PLANT_MODEL', 'AUTOMATIONS']::TEXT[] END,
         CURRENT_TIMESTAMP);

      INSERT INTO "celesnity_app"."audit_events"
        ("id", "organization_id", "event_type", "action", "resource_type", "resource_id", "outcome", "metadata")
      VALUES
        (gen_random_uuid(), org.id, 'SERVICE_IDENTITY_MIGRATED', 'provision',
         'organization-service-identity', new_identity_id::TEXT, 'SUCCEEDED',
         jsonb_build_object('purpose', service_purpose, 'source', 'migration'));
    END LOOP;
  END LOOP;
END $$;
