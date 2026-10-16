-- The administration trust-boundary migration created this fixed-ID placeholder
-- to own legacy rows before real organizations existed. Once a real organization
-- is bootstrapped, leaving the ownerless placeholder ACTIVE blocks readiness.
-- Retain the organization and its historical records; never delete audit data.
DO $$
DECLARE
  placeholder_id CONSTANT UUID := '00000000-0000-4000-8000-000000000001';
  placeholder RECORD;
  scoped_table RECORD;
  has_rows BOOLEAN;
BEGIN
  SELECT slug, status, identity_tenant_id INTO placeholder
  FROM celesnity_app.organizations
  WHERE id = placeholder_id
  FOR UPDATE;

  IF NOT FOUND OR placeholder.status <> 'ACTIVE' THEN
    RETURN;
  END IF;
  IF placeholder.slug <> 'celesnity-bootstrap' OR placeholder.identity_tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy bootstrap organization has been claimed; review it before rollout';
  END IF;
  IF EXISTS (
    SELECT 1 FROM celesnity_app.organization_memberships
    WHERE organization_id = placeholder_id AND role <> 'SERVICE_ACCOUNT'
  ) THEN
    RAISE EXCEPTION 'Legacy bootstrap organization has human memberships; review it before rollout';
  END IF;
  IF EXISTS (
    SELECT 1 FROM celesnity_app.outbox_events
    WHERE organization_id = placeholder_id AND status <> 'PUBLISHED'
  ) OR EXISTS (
    SELECT 1 FROM celesnity_app.streaming_provisioning_attempts
    WHERE organization_id = placeholder_id AND status = 'RUNNING'
  ) THEN
    RAISE EXCEPTION 'Legacy bootstrap organization has unfinished work; review it before rollout';
  END IF;

  -- Permit only historical/audit rows and the principals installed by the
  -- preceding migration. Any live organization-scoped resource must stop the
  -- migration rather than being made inaccessible by an automatic suspension.
  FOR scoped_table IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'celesnity_app' AND c.column_name = 'organization_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name NOT IN (
        'audit_events', 'outbox_events', 'streaming_provisioning_attempts',
        'organization_memberships', 'organization_service_identities'
      )
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE organization_id = $1)',
      scoped_table.table_schema, scoped_table.table_name
    ) INTO has_rows USING placeholder_id;
    IF has_rows THEN
      RAISE EXCEPTION 'Legacy bootstrap organization has scoped resources in %; review it before rollout',
        scoped_table.table_name;
    END IF;
  END LOOP;

  UPDATE celesnity_app.organizations
  SET status = 'SUSPENDED', updated_at = CURRENT_TIMESTAMP
  WHERE id = placeholder_id;

  INSERT INTO celesnity_app.audit_events
    (id, organization_id, event_type, action, resource_type, resource_id, outcome, metadata)
  VALUES
    (gen_random_uuid(), placeholder_id, 'LEGACY_BOOTSTRAP_ORGANIZATION_RETIRED',
     'suspend', 'organization', placeholder_id::TEXT, 'SUCCEEDED',
     jsonb_build_object('source', 'migration', 'reason', 'unowned-legacy-placeholder'));
END $$;
