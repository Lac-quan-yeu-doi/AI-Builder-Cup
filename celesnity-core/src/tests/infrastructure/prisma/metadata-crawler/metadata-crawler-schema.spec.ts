import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schema = readFileSync(
  resolve(__dirname, '../../../../infrastructure/prisma/schema.prisma'),
  'utf8',
);
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../infrastructure/prisma/migrations/20260818000000_metadata_crawler/migration.sql',
  ),
  'utf8',
);
const explorerMigration = readFileSync(
  resolve(
    __dirname,
    '../../../../infrastructure/prisma/migrations/20260819000000_metadata_crawler_explorer_indexes/migration.sql',
  ),
  'utf8',
);

const TABLES = [
  'metadata_crawlers',
  'database_metadata_crawlers',
  'metadata_crawler_runs',
  'metadata_crawler_run_scopes',
  'catalog_namespaces',
  'catalog_relations',
  'catalog_columns',
  'catalog_constraints',
  'catalog_constraint_columns',
] as const;

describe('Metadata Crawler schema boundary', () => {
  it.each(TABLES)('maps %s into celesnity_app', (table) => {
    expect(schema).toMatch(
      new RegExp(`@@map\\("${table}"\\)[\\s\\S]*?@@schema\\("celesnity_app"\\)`),
    );
    expect(migration).toContain(`"celesnity_app"."${table}"`);
    expect(migration).not.toContain(`"public"."${table}"`);
  });

  it('enforces one active run per crawler in PostgreSQL', () => {
    expect(migration).toContain('metadata_crawler_runs_one_active_per_crawler');
    expect(migration).toContain("WHERE \"status\" IN ('QUEUED', 'RUNNING')");
  });

  it('supports active source metadata explorer ordering paths', () => {
    expect(schema).toContain('@@index([databaseServiceId, deletedAt, name, id])');
    expect(schema).toContain('@@index([namespaceId, deletedAt, name, id])');
    expect(schema).toContain('@@index([relationId, deletedAt, ordinalPosition, id])');
    expect(schema).toContain('@@index([relationId, deletedAt, id])');
    expect(explorerMigration).toContain(
      'catalog_namespaces_database_service_id_deleted_at_name_id_idx',
    );
    expect(explorerMigration).toContain('catalog_relations_namespace_id_deleted_at_name_id_idx');
    expect(explorerMigration).toContain(
      'catalog_columns_relation_id_deleted_at_ordinal_position_id_idx',
    );
    expect(explorerMigration).toContain('catalog_constraints_relation_id_deleted_at_id_idx');
  });
});
