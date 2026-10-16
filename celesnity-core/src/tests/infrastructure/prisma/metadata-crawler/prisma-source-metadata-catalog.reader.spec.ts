import type { PrismaService } from '@infrastructure/prisma/prisma.service';
import { PrismaSourceMetadataCatalogReader } from '@infrastructure/prisma/metadata-crawler/prisma-source-metadata-catalog.reader';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const NAMESPACE_ID = '22222222-2222-4222-8222-222222222222';
const RELATION_ID = '33333333-3333-4333-8333-333333333333';
const ORGANIZATION_ID = '44444444-4444-4444-8444-444444444444';

function queryText(query: unknown): string {
  return (query as { readonly strings?: readonly string[] }).strings?.join(' ') ?? '';
}

function queryValues(query: unknown): readonly unknown[] {
  return (query as { readonly values?: readonly unknown[] }).values ?? [];
}

function readerHarness() {
  const client = {
    $queryRaw: jest.fn(),
    catalogNamespace: { findFirst: jest.fn() },
    catalogRelation: { findFirst: jest.fn() },
    catalogColumn: { findMany: jest.fn(), count: jest.fn() },
    catalogConstraint: { findMany: jest.fn() },
  };
  return {
    client,
    reader: new PrismaSourceMetadataCatalogReader(
      { client } as unknown as PrismaService,
      {
        require: () => ({ organizationId: ORGANIZATION_ID }),
      } as unknown as AuthenticatedContextStore,
    ),
  };
}

describe('PrismaSourceMetadataCatalogReader', () => {
  it('returns zero summaries for requested services absent from the active snapshot', async () => {
    const { client, reader } = readerHarness();
    client.$queryRaw.mockResolvedValueOnce([]);

    const result = await reader.summariesByDatabaseServiceIds([SERVICE_ID]);

    expect(result.get(SERVICE_ID)).toEqual({
      hasSnapshot: false,
      databaseCount: 0,
      schemaCount: 0,
      relationCount: 0,
      columnCount: 0,
      constraintCount: 0,
    });
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    const query = client.$queryRaw.mock.calls[0][0];
    expect(queryText(query)).toContain('catalog_namespaces');
    expect(queryText(query)).toContain('database_metadata_crawlers');
    expect(queryText(query)).toContain('metadata_crawler_runs');
    expect(queryText(query)).toContain('deleted_at IS NULL');
    expect(queryValues(query)).toEqual(
      expect.arrayContaining([SERVICE_ID, 'SUCCEEDED', 'PARTIAL']),
    );
  });

  it('aggregates active counts and last crawl timestamp by service in one query', async () => {
    const { client, reader } = readerHarness();
    client.$queryRaw.mockResolvedValueOnce([
      {
        database_service_id: SERVICE_ID,
        database_count: 1n,
        schema_count: 3n,
        relation_count: 22n,
        column_count: 73n,
        constraint_count: 8n,
        last_crawled_at: new Date('2026-08-18T16:56:00.000Z'),
      },
    ]);

    const result = await reader.summariesByDatabaseServiceIds([SERVICE_ID, SERVICE_ID]);

    expect(result.get(SERVICE_ID)).toEqual({
      hasSnapshot: true,
      databaseCount: 1,
      schemaCount: 3,
      relationCount: 22,
      columnCount: 73,
      constraintCount: 8,
      lastCrawledAt: '2026-08-18T16:56:00.000Z',
    });
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('scopes namespace pages, applies search before pagination, and uses an allowlisted sort', async () => {
    const { client, reader } = readerHarness();
    client.$queryRaw
      .mockResolvedValueOnce([
        {
          id: NAMESPACE_ID,
          name: 'sales',
          namespace_type: 'SCHEMA',
          description: null,
          relation_count: 4n,
          last_crawled_at: null,
        },
      ])
      .mockResolvedValueOnce([{ total: 1n }]);

    const result = await reader.listNamespaces(SERVICE_ID, {
      page: 2,
      pageSize: 50,
      search: 'sales',
      sortBy: 'relationCount',
      sortDirection: 'desc',
    });

    expect(result.items[0]).toMatchObject({ id: NAMESPACE_ID, relationCount: 4 });
    expect(result.pagination).toEqual({ page: 2, pageSize: 50, total: 1, totalPages: 1 });
    const query = client.$queryRaw.mock.calls[0][0];
    expect(queryText(query)).toContain('relation_count');
    expect(queryText(query)).toContain('relation_run.status IN');
    expect(queryText(query)).toContain('DESC');
    expect(queryText(query)).toContain('n.id ASC');
    expect(queryValues(query)).toEqual(expect.arrayContaining([SERVICE_ID, 'sales']));
  });

  it('returns undefined for a foreign namespace and filters relation ownership through it', async () => {
    const { client, reader } = readerHarness();
    client.catalogNamespace.findFirst.mockResolvedValueOnce(null);

    await expect(
      reader.listRelations(SERVICE_ID, NAMESPACE_ID, {
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortDirection: 'asc',
      }),
    ).resolves.toBeUndefined();
    expect(client.$queryRaw).not.toHaveBeenCalled();

    client.catalogRelation.findFirst.mockResolvedValueOnce(null);
    await expect(reader.findRelation(SERVICE_ID, RELATION_ID)).resolves.toBeUndefined();
    expect(client.catalogRelation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: RELATION_ID,
          deletedAt: null,
          namespace: expect.objectContaining({
            databaseServiceId: SERVICE_ID,
            deletedAt: null,
            lastSeenRun: expect.objectContaining({ status: { in: ['SUCCEEDED', 'PARTIAL'] } }),
          }),
          lastSeenRun: expect.objectContaining({ status: { in: ['SUCCEEDED', 'PARTIAL'] } }),
        }),
      }),
    );
  });

  it('orders active columns by ordinal position and uses the relation ownership guard', async () => {
    const { client, reader } = readerHarness();
    client.catalogRelation.findFirst.mockResolvedValueOnce({ id: RELATION_ID });
    client.catalogColumn.findMany.mockResolvedValueOnce([]);
    client.catalogColumn.count.mockResolvedValueOnce(0);

    const result = await reader.listColumns(SERVICE_ID, RELATION_ID, {
      page: 1,
      pageSize: 50,
      sortBy: 'ordinalPosition',
      sortDirection: 'asc',
    });

    if (result === undefined) throw new Error('Expected an owned relation page.');
    expect(result.pagination.total).toBe(0);
    expect(client.catalogColumn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ ordinalPosition: 'asc' }, { id: 'asc' }] }),
    );
    expect(client.catalogColumn.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ relationId: RELATION_ID, deletedAt: null }),
      }),
    );
  });
});
