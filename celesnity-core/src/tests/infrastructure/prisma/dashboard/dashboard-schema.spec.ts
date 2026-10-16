import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schema = readFileSync(
  resolve(__dirname, '../../../../infrastructure/prisma/schema.prisma'),
  'utf8',
);
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../infrastructure/prisma/migrations/20260905210000_dashboard_authoring/migration.sql',
  ),
  'utf8',
);

const TABLES = [
  'dashboards',
  'dashboard_tabs',
  'dashboard_cards',
  'dashboard_filters',
  'dashboard_filter_mappings',
] as const;

describe('Dashboard Prisma schema boundary', () => {
  it.each(TABLES)('maps %s into the application schema', (table) => {
    expect(schema).toMatch(
      new RegExp(`@@map\\("${table}"\\)[\\s\\S]*?@@schema\\("celesnity_app"\\)`),
    );
    expect(migration).toContain(`"celesnity_app"."${table}"`);
    expect(migration).not.toContain(`"public"."${table}"`);
  });

  it('keeps aggregate ownership and external references relational', () => {
    expect(schema).toMatch(/tabs\s+DashboardTab\[\]/u);
    expect(schema).toMatch(/cards\s+DashboardCard\[\]/u);
    expect(schema).toMatch(/filters\s+DashboardFilter\[\]/u);
    expect(schema).toMatch(/mappings\s+DashboardFilterMapping\[\]/u);
    expect(schema).toMatch(/chart\s+Chart\?/u);
    expect(schema).toMatch(/collection\s+ChartCollection/u);
  });

  it('enforces stable filter slugs and mapping identity in PostgreSQL', () => {
    expect(schema).toContain('@@unique([dashboardId, slug])');
    expect(schema).toContain('@@unique([filterId, cardId])');
    expect(migration).toContain('dashboard_filters_dashboard_id_slug_key');
    expect(migration).toContain('dashboard_filter_mappings_filter_id_card_id_key');
  });

  it('indexes active collection discovery and ordered dashboard children', () => {
    expect(schema).toContain('@@index([organizationId, collectionId, archivedAt, updatedAt])');
    expect(schema).toContain('@@index([dashboardId, order])');
    expect(schema).toContain('@@index([tabId, y, x])');
  });
});
