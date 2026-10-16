-- The preceding immutable migration retired an ownerless fixed-ID placeholder.
-- An older environment may have enrolled that ID as a real organization before
-- retirement was introduced. After an operator verifies and resolves the known
-- failed retirement attempt, preserve that organization and record why it was
-- retained. No organization, membership, or grant is created or changed here.
DO $$
DECLARE
  bootstrap_id CONSTANT UUID := '00000000-0000-4000-8000-000000000001';
  current_org RECORD;
BEGIN
  SELECT status, identity_tenant_id INTO current_org
  FROM celesnity_app.organizations
  WHERE id = bootstrap_id
  FOR UPDATE;

  IF NOT FOUND OR current_org.status = 'SUSPENDED' THEN
    RETURN;
  END IF;

  IF current_org.status <> 'ACTIVE'
     OR current_org.identity_tenant_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM celesnity_app.organization_memberships
       WHERE organization_id = bootstrap_id
         AND role = 'ORG_OWNER' AND status = 'ACTIVE'
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     ) THEN
    RAISE EXCEPTION 'Legacy bootstrap organization is neither retired nor verified as claimed';
  END IF;

  INSERT INTO celesnity_app.audit_events
    (id, organization_id, event_type, action, resource_type, resource_id, outcome, metadata)
  SELECT gen_random_uuid(), bootstrap_id, 'LEGACY_BOOTSTRAP_ORGANIZATION_RETAINED',
         'retain', 'organization', bootstrap_id::TEXT, 'SUCCEEDED',
         jsonb_build_object('source', 'migration', 'reason', 'verified-claimed-organization')
  WHERE NOT EXISTS (
    SELECT 1 FROM celesnity_app.audit_events
    WHERE organization_id = bootstrap_id
      AND event_type = 'LEGACY_BOOTSTRAP_ORGANIZATION_RETAINED'
  );
END $$;
