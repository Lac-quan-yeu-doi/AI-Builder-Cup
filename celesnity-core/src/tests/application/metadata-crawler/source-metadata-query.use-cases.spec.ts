import { SourceMetadataQueryUseCases } from '@application/metadata-crawler/source-metadata-query.use-cases';
import type { IMetadataCrawlerReader } from '@application/metadata-crawler/interfaces/i-metadata-crawler-reader';
import type { ISourceMetadataCatalogReader } from '@application/metadata-crawler/interfaces/i-source-metadata-catalog-reader';

const CRAWLER_ID = '22222222-2222-4222-8222-222222222222';
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const NAMESPACE_ID = '33333333-3333-4333-8333-333333333333';
const RELATION_ID = '44444444-4444-4444-8444-444444444444';

const page = {
  items: [],
  pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
  sort: { field: 'name', direction: 'asc' as const },
};

function dependencies() {
  const crawlerReader: IMetadataCrawlerReader = {
    list: jest.fn(),
    findById: jest.fn(
      async () =>
        ({
          id: CRAWLER_ID,
          databaseServiceId: SERVICE_ID,
        }) as never,
    ),
    listRuns: jest.fn(),
    findRunById: jest.fn(),
  };
  const catalogReader: ISourceMetadataCatalogReader = {
    summariesByDatabaseServiceIds: jest.fn(async () => new Map()),
    listNamespaces: jest.fn(async () => page),
    listRelations: jest.fn(async () => page),
    findRelation: jest.fn(async () => undefined),
    listColumns: jest.fn(async () => page),
    listConstraints: jest.fn(async () => []),
  };
  return { crawlerReader, catalogReader };
}

describe('SourceMetadataQueryUseCases', () => {
  it('scopes every catalog query through the crawler assignment', async () => {
    const deps = dependencies();
    const useCases = new SourceMetadataQueryUseCases(deps.crawlerReader, deps.catalogReader);
    const query = { page: 1, pageSize: 50, sortBy: 'name' as const, sortDirection: 'asc' as const };

    await useCases.listNamespaces(CRAWLER_ID, query);
    await useCases.listRelations(CRAWLER_ID, NAMESPACE_ID, {
      ...query,
      sortBy: 'columnCount' as const,
    });
    await useCases.listColumns(CRAWLER_ID, RELATION_ID, {
      ...query,
      sortBy: 'ordinalPosition' as const,
    });

    expect(deps.catalogReader.listNamespaces).toHaveBeenCalledWith(SERVICE_ID, query);
    expect(deps.catalogReader.listRelations).toHaveBeenCalledWith(
      SERVICE_ID,
      NAMESPACE_ID,
      expect.objectContaining({ sortBy: 'columnCount' }),
    );
    expect(deps.catalogReader.listColumns).toHaveBeenCalledWith(
      SERVICE_ID,
      RELATION_ID,
      expect.objectContaining({ sortBy: 'ordinalPosition' }),
    );
  });

  it('returns an empty summary before the first crawl', async () => {
    const deps = dependencies();
    const useCases = new SourceMetadataQueryUseCases(deps.crawlerReader, deps.catalogReader);

    await expect(useCases.summary(CRAWLER_ID)).resolves.toEqual({
      hasSnapshot: false,
      databaseCount: 0,
      schemaCount: 0,
      relationCount: 0,
      columnCount: 0,
      constraintCount: 0,
    });
  });

  it('hides child IDs that are not part of the crawler connection', async () => {
    const deps = dependencies();
    const useCases = new SourceMetadataQueryUseCases(deps.crawlerReader, deps.catalogReader);

    await expect(useCases.getRelation(CRAWLER_ID, RELATION_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
