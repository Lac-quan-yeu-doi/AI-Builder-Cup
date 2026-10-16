import { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import {
  NodeCatalogError,
  NodeCatalogErrorCode,
} from '@domain/node-catalog/errors/node-catalog.errors';
import { InMemoryNodeDefinitionReader } from '@tests/support/in-memory-node-definition.reader';
import {
  NodeCatalogConnectionReaderStub,
  NodeCatalogSourceBindingResolverStub,
  nodeCatalogCatalogUseCases,
} from '@tests/support/node-catalog-dependencies';

describe('NodeCatalogUseCases', () => {
  const useCases = new NodeCatalogUseCases(
    new InMemoryNodeDefinitionReader(),
    new NodeCatalogConnectionReaderStub(),
    nodeCatalogCatalogUseCases(),
    new NodeCatalogSourceBindingResolverStub(),
  );

  it('filters, sorts, and paginates definitions deterministically', async () => {
    const page = await useCases.listDefinitions({
      category: 'TRANSFORM',
      keyword: 'field',
      page: 2,
      pageSize: 2,
      sortBy: 'label',
      sortDirection: 'ASC',
    });

    expect(page).toMatchObject({ page: 2, pageSize: 2, totalItems: 4, totalPages: 2 });
    expect(page.items.map((definition) => definition.type)).toEqual([
      'RENAME_FIELD',
      'SELECT_FIELDS',
    ]);
    expect(page.items[0]).not.toHaveProperty('propertyPanel');
  });

  it('matches a definition type case-insensitively for detail lookup', async () => {
    await expect(useCases.getDefinition('filter')).resolves.toMatchObject({ type: 'FILTER' });
  });

  it.each([
    ['POSTGRES_SOURCE', 'SOURCE'],
    ['ICEBERG_SOURCE', 'SOURCE'],
    ['ICEBERG_TARGET', 'TARGET'],
  ] as const)(
    'resolves the dynamic %s definition for property-panel lookup',
    async (type, category) => {
      await expect(useCases.getDefinition(type)).resolves.toMatchObject({ type, category });
    },
  );

  it('projects saved connections into source catalog entries', async () => {
    const page = await useCases.listDefinitions({
      category: 'SOURCE',
      page: 1,
      pageSize: 20,
      sortBy: 'label',
      sortDirection: 'ASC',
    });

    expect(page.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceId: 'connection:11111111-1111-4111-8111-111111111111',
          type: 'POSTGRES_SOURCE',
          category: 'SOURCE',
          enabled: true,
          source: expect.objectContaining({
            connectionName: 'Production PostgreSQL',
            dbmsType: 'POSTGRESQL',
            verificationStatus: 'SUCCEEDED',
          }) as unknown,
        }),
        expect.objectContaining({
          resourceId: 'iceberg-source:iceberg',
          type: 'ICEBERG_SOURCE',
          category: 'SOURCE',
          enabled: true,
        }),
      ]),
    );
    expect(page.totalItems).toBe(2);
  });

  it('offers crawler-backed Database Service and managed Data Catalog as separate sources', async () => {
    const databaseService = await useCases.getDefinition('POSTGRES_SOURCE');
    const databaseFields = databaseService.propertyPanel.sections.flatMap(
      (section) => section.fields,
    );
    const catalog = await useCases.getDefinition('ICEBERG_SOURCE');
    const catalogFields = catalog.propertyPanel.sections.flatMap((section) => section.fields);

    expect(databaseFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'catalogNamespaceId' }),
        expect.objectContaining({
          key: 'catalogRelationId',
          dependsOn: ['catalogNamespaceId'],
        }),
      ]),
    );
    expect(databaseFields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'sourceMode' })]),
    );
    expect(catalogFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'catalogDatabaseName' }),
        expect.objectContaining({
          key: 'catalogTableName',
          dependsOn: ['catalogDatabaseName'],
        }),
      ]),
    );
    expect(databaseService.resourceId).toBe('connection:11111111-1111-4111-8111-111111111111');
    expect(catalog.resourceId).toBe('iceberg-source:iceberg');
  });

  it('projects one configurable managed Iceberg target', async () => {
    const page = await useCases.listDefinitions({
      category: 'TARGET',
      page: 1,
      pageSize: 20,
      sortBy: 'label',
      sortDirection: 'ASC',
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        resourceId: 'iceberg:iceberg',
        type: 'ICEBERG_TARGET',
        category: 'TARGET',
      }),
    ]);
  });

  it('rejects an unknown definition', async () => {
    expect.assertions(2);
    try {
      await useCases.getDefinition('unknown');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(NodeCatalogError);
      expect((error as NodeCatalogError).code).toBe(NodeCatalogErrorCode.NOT_FOUND);
    }
  });
});
