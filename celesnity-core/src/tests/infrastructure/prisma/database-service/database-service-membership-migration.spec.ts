import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('database service membership migration', () => {
  it('creates, backfills, verifies, and then contracts the legacy membership column', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'src/infrastructure/prisma/migrations/20260921140000_database_service_memberships/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE "celesnity_app"."database_service_memberships"');
    expect(migration).toContain('ON CONFLICT DO NOTHING');
    expect(migration).toMatch(/database_services[\s\S]*database_name[\s\S]*DROP COLUMN/u);
    expect(migration).toContain('database_services_database_name_idx');
    expect(migration).toContain('database_service_memberships_database_service_id_organization_id_fkey');
    expect(migration).toContain('RAISE EXCEPTION');
  });
});
