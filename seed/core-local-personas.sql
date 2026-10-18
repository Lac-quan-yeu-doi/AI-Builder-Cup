-- Local-development organization + login personas (web /login).
-- organization-bootstrap-main only enrolls identity-platform owners, so the org
-- and its ORG_OWNER are created here first; the bootstrap that runs next then
-- verifies them and adds the organization service identities.
-- Org fields must match BOOTSTRAP_* in docker-compose.yaml (celesnity-migrate).
-- Persona subjects/emails/names must match
-- celesnity-core/src/infrastructure/identity/local-development-identity-token.verifier.ts.
-- Idempotent: runs after every `prisma migrate deploy` in celesnity-migrate.

INSERT INTO celesnity_app.organizations (id, slug, display_name, home_region, identity_tenant_id, updated_at)
VALUES ('00000000-0000-4000-8000-000000000002', 'local-development', 'Local Development', 'local', 'local', now())
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE local_personas (subject text, email text, display_name text, role text);
INSERT INTO local_personas VALUES
  ('local-owner',         'owner@local.celesnity.test',    'Local Organization Owner', 'ORG_OWNER'),
  ('local-data-engineer', 'engineer@local.celesnity.test', 'Local Data Engineer',      'DATA_ENGINEER'),
  ('local-analyst',       'analyst@local.celesnity.test',  'Local Analyst',            'ANALYST'),
  ('local-viewer',        'viewer@local.celesnity.test',   'Local Viewer',             'VIEWER');

INSERT INTO celesnity_app.user_identities
  (id, provider, subject, email, display_name, email_verified, status, identity_tenant_id, updated_at)
SELECT gen_random_uuid(), 'local-development', subject, email, display_name, true, 'ACTIVE', 'local', now()
FROM local_personas
ON CONFLICT (provider, identity_tenant_id, subject) DO NOTHING;

INSERT INTO celesnity_app.organization_memberships
  (id, organization_id, identity_id, role, status, updated_at)
SELECT gen_random_uuid(), '00000000-0000-4000-8000-000000000002', i.id,
       p.role::celesnity_app."OrganizationRole", 'ACTIVE', now()
FROM local_personas p
JOIN celesnity_app.user_identities i
  ON i.provider = 'local-development' AND i.identity_tenant_id = 'local' AND i.subject = p.subject
ON CONFLICT (organization_id, identity_id) DO NOTHING;
