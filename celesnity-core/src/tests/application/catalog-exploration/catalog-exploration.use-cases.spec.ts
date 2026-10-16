import { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import type {
  ICatalogReader,
  TablePreview,
} from '@application/catalog-exploration/interfaces/i-catalog-reader';
import type { ICatalogWriter } from '@application/catalog-exploration/interfaces/i-catalog-writer';
import type { ICatalogNamespaceMetadataRepository } from '@application/catalog-exploration/interfaces/i-catalog-namespace-metadata.repository';
import type { IColumnProfileCache } from '@application/catalog-exploration/interfaces/i-column-profile-cache';
import { CatalogErrorCode } from '@domain/catalog-exploration/errors/catalog.errors';
import type { CatalogError } from '@domain/catalog-exploration/errors/catalog.errors';
import {
  ColumnProfile,
  Namespace,
  TableMetadata,
  TableSummary,
  type TableSnapshot,
} from '@domain/catalog-exploration/models/catalog-models';
import type {
  CatalogName,
  NamespaceName,
  TablePath,
} from '@domain/catalog-exploration/value-objects/catalog-value-objects';
import type { CatalogAccessAuthorizer } from '@application/catalog-exploration/catalog-access-authorizer';

const allowAll: CatalogAccessAuthorizer = {
  authorizeCatalog: () =>
    Promise.resolve({ allowed: true, matchedGrantIds: ['test'], reason: 'EXPLICIT_ALLOW' }),
};

class CatalogReaderStub implements ICatalogReader {
  public namespaces = [
    Namespace.create('iceberg', 'system'),
    Namespace.create('iceberg', 'analytics'),
  ];

  public tables = [
    TableSummary.create('iceberg', 'analytics', 'events', 'BASE TABLE'),
    TableSummary.create('iceberg', 'analytics', 'events_view', 'VIEW'),
  ];

  public listSchemas(): Promise<readonly Namespace[]> {
    return Promise.resolve(this.namespaces);
  }

  public listTables(): Promise<readonly TableSummary[]> {
    return Promise.resolve(this.tables);
  }

  public listColumns(path: TablePath): Promise<TableMetadata> {
    return Promise.resolve(
      TableMetadata.create(path.catalog.value, path.schema.value, path.table.value, []),
    );
  }

  public listSnapshots(): Promise<readonly TableSnapshot[]> {
    return Promise.resolve([]);
  }

  public previewTable(): Promise<TablePreview> {
    return Promise.resolve({ columns: [], rows: [] });
  }

  public profileTableCalls = 0;

  // Returns a fixed profile regardless of which table was asked for.
  public profileTable(_path: TablePath): Promise<readonly ColumnProfile[]> {
    this.profileTableCalls += 1;
    return Promise.resolve([
      ColumnProfile.create({
        name: 'status',
        dataType: 'varchar',
        kind: 'string',
        topValues: ['active', 'closed'],
        computedAt: '2026-09-02T00:00:00.000Z',
      }),
    ]);
  }
}

class FakeColumnProfileCache implements IColumnProfileCache {
  public readonly store = new Map<string, readonly ColumnProfile[]>();
  public getCalls: string[] = [];
  public setCalls: string[] = [];

  public get(key: string): readonly ColumnProfile[] | undefined {
    this.getCalls.push(key);
    return this.store.get(key);
  }

  public set(key: string, value: readonly ColumnProfile[]): void {
    this.setCalls.push(key);
    this.store.set(key, value);
  }
}

class CatalogWriterStub implements ICatalogWriter {
  public readonly creates: { readonly catalog: string; readonly namespace: string }[] = [];

  public createNamespace(catalog: CatalogName, namespace: NamespaceName): Promise<Namespace> {
    this.creates.push({ catalog: catalog.value, namespace: namespace.value });
    return Promise.resolve(Namespace.create(catalog.value, namespace.value));
  }
}

class NamespaceMetadataStub implements ICatalogNamespaceMetadataRepository {
  public readonly descriptions = new Map<string, string>();
  public readonly writes: {
    readonly catalog: string;
    readonly namespace: string;
    readonly description: string | undefined;
  }[] = [];

  public listDescriptions(): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(new Map(this.descriptions));
  }

  public setDescription(
    catalog: string,
    namespace: string,
    description: string | undefined,
  ): Promise<void> {
    this.writes.push({ catalog, namespace, description });
    if (description === undefined) this.descriptions.delete(namespace);
    else this.descriptions.set(namespace, description);
    return Promise.resolve();
  }
}

describe('CatalogExplorationUseCases writable catalog operations', () => {
  it('hides catalog resources that do not have a matching named-resource grant', async () => {
    const denyAll: CatalogAccessAuthorizer = {
      authorizeCatalog: () =>
        Promise.resolve({ allowed: false, matchedGrantIds: [], reason: 'DEFAULT_DENY' }),
    };
    const useCases = new CatalogExplorationUseCases(
      new CatalogReaderStub(),
      new CatalogWriterStub(),
      'iceberg',
      100,
      denyAll,
    );

    await expect(useCases.listVisibleCatalogs()).resolves.toEqual([]);
    await expect(useCases.listSchemas('iceberg')).rejects.toMatchObject({
      name: 'CatalogAccessDeniedError',
      reason: 'DEFAULT_DENY',
    });
  });

  it('filters child resources independently after an ancestor discovery grant', async () => {
    const authorizer: CatalogAccessAuthorizer = {
      authorizeCatalog: (_permission, hierarchy) =>
        Promise.resolve({
          allowed: hierarchy.at(-1)?.id !== 'iceberg.system',
          matchedGrantIds: ['catalog-discover'],
          reason: hierarchy.at(-1)?.id === 'iceberg.system' ? 'DEFAULT_DENY' : 'EXPLICIT_ALLOW',
        }),
    };
    const useCases = new CatalogExplorationUseCases(
      new CatalogReaderStub(),
      new CatalogWriterStub(),
      'iceberg',
      100,
      authorizer,
    );

    await expect(useCases.listSchemas('iceberg')).resolves.toEqual([
      Namespace.create('iceberg', 'analytics'),
    ]);
  });

  it('creates a validated namespace through the writer port', async () => {
    const reader = new CatalogReaderStub();
    const writer = new CatalogWriterStub();
    const metadata = new NamespaceMetadataStub();
    const useCases = new CatalogExplorationUseCases(
      reader,
      writer,
      'iceberg',
      100,
      allowAll,
      metadata,
    );

    const result = await useCases.createSchema('iceberg', 'curated_sales');

    expect(writer.creates).toEqual([{ catalog: 'iceberg', namespace: 'curated_sales' }]);
    expect(metadata.writes).toEqual([
      { catalog: 'iceberg', namespace: 'curated_sales', description: undefined },
    ]);
    expect(result).toEqual(Namespace.create('iceberg', 'curated_sales'));
  });

  it('authorizes namespace creation at the parent catalog before ownership exists', async () => {
    const authorizer: CatalogAccessAuthorizer = {
      authorizeCatalog: jest.fn(() =>
        Promise.resolve({
          allowed: true,
          matchedGrantIds: ['catalog-alter'],
          reason: 'EXPLICIT_ALLOW',
        }),
      ),
    };
    const useCases = new CatalogExplorationUseCases(
      new CatalogReaderStub(),
      new CatalogWriterStub(),
      'iceberg',
      100,
      authorizer,
      new NamespaceMetadataStub(),
    );

    await useCases.createSchema('iceberg', 'tenant_database');

    expect(authorizer.authorizeCatalog).toHaveBeenCalledWith('ALTER', [
      { type: 'CATALOG', id: 'iceberg' },
    ]);
  });

  it('persists and returns an optional description when creating a namespace', async () => {
    const metadata = new NamespaceMetadataStub();
    const useCases = new CatalogExplorationUseCases(
      new CatalogReaderStub(),
      new CatalogWriterStub(),
      'iceberg',
      100,
      allowAll,
      metadata,
    );

    await expect(
      useCases.createSchema('iceberg', 'curated_sales', '  Curated sales data  '),
    ).resolves.toEqual(Namespace.create('iceberg', 'curated_sales', 'Curated sales data'));
    expect(metadata.descriptions.get('curated_sales')).toBe('Curated sales data');
  });

  it('joins descriptions onto visible namespaces and supports editing and clearing them', async () => {
    const metadata = new NamespaceMetadataStub();
    metadata.descriptions.set('analytics', 'Analytics warehouse');
    const useCases = new CatalogExplorationUseCases(
      new CatalogReaderStub(),
      new CatalogWriterStub(),
      'iceberg',
      100,
      allowAll,
      metadata,
    );

    await expect(useCases.listWritableSchemas('iceberg')).resolves.toEqual([
      Namespace.create('iceberg', 'analytics', 'Analytics warehouse'),
    ]);
    await expect(
      useCases.updateSchemaDescription('iceberg', 'analytics', 'Finance analytics'),
    ).resolves.toEqual(Namespace.create('iceberg', 'analytics', 'Finance analytics'));
    await expect(useCases.updateSchemaDescription('iceberg', 'analytics', '   ')).resolves.toEqual(
      Namespace.create('iceberg', 'analytics'),
    );
    expect(metadata.descriptions.has('analytics')).toBe(false);
  });

  it('rejects an existing namespace without calling the writer', async () => {
    const reader = new CatalogReaderStub();
    const writer = new CatalogWriterStub();
    const useCases = new CatalogExplorationUseCases(reader, writer, 'iceberg', 100, allowAll);

    await expect(useCases.createSchema('iceberg', 'ANALYTICS')).rejects.toMatchObject({
      code: CatalogErrorCode.CONFLICT,
    } satisfies Partial<CatalogError>);
    expect(writer.creates).toEqual([]);
  });

  it.each(['system', 'information_schema'])('rejects reserved namespace %s', async (name) => {
    const writer = new CatalogWriterStub();
    const useCases = new CatalogExplorationUseCases(
      new CatalogReaderStub(),
      writer,
      'iceberg',
      100,
      allowAll,
    );

    await expect(useCases.createSchema('iceberg', name)).rejects.toMatchObject({
      code: CatalogErrorCode.VALIDATION,
    } satisfies Partial<CatalogError>);
    expect(writer.creates).toEqual([]);
  });

  it('exposes only writable namespaces and base tables to target selection', async () => {
    const useCases = new CatalogExplorationUseCases(
      new CatalogReaderStub(),
      new CatalogWriterStub(),
      'iceberg',
      100,
      allowAll,
    );

    await expect(useCases.listWritableSchemas('iceberg')).resolves.toEqual([
      Namespace.create('iceberg', 'analytics'),
    ]);
    await expect(useCases.listWritableTables('iceberg', 'analytics')).resolves.toEqual([
      TableSummary.create('iceberg', 'analytics', 'events', 'BASE TABLE'),
    ]);
    await expect(useCases.listWritableTables('iceberg', 'system')).resolves.toEqual([]);
  });
});

describe('CatalogExplorationUseCases.profileTable', () => {
  it('requires PREVIEW access, same as previewTable', async () => {
    const denyAll: CatalogAccessAuthorizer = {
      authorizeCatalog: () =>
        Promise.resolve({ allowed: false, matchedGrantIds: [], reason: 'DEFAULT_DENY' }),
    };
    const reader = new CatalogReaderStub();
    const useCases = new CatalogExplorationUseCases(
      reader,
      new CatalogWriterStub(),
      'iceberg',
      100,
      denyAll,
      undefined,
      new FakeColumnProfileCache(),
    );

    await expect(useCases.profileTable('iceberg', 'analytics', 'events')).rejects.toMatchObject({
      name: 'CatalogAccessDeniedError',
    });
    expect(reader.profileTableCalls).toBe(0);
  });

  it('calls the reader and populates the cache on a miss', async () => {
    const reader = new CatalogReaderStub();
    const cache = new FakeColumnProfileCache();
    const useCases = new CatalogExplorationUseCases(
      reader,
      new CatalogWriterStub(),
      'iceberg',
      100,
      allowAll,
      undefined,
      cache,
    );

    const profile = await useCases.profileTable('iceberg', 'analytics', 'events');

    expect(reader.profileTableCalls).toBe(1);
    expect(profile).toHaveLength(1);
    expect(cache.setCalls).toEqual(['iceberg.analytics.events']);
  });

  it('serves a cached profile without calling the reader again', async () => {
    const reader = new CatalogReaderStub();
    const cache = new FakeColumnProfileCache();
    const useCases = new CatalogExplorationUseCases(
      reader,
      new CatalogWriterStub(),
      'iceberg',
      100,
      allowAll,
      undefined,
      cache,
    );

    await useCases.profileTable('iceberg', 'analytics', 'events');
    await useCases.profileTable('iceberg', 'analytics', 'events');

    expect(reader.profileTableCalls).toBe(1);
    expect(cache.getCalls).toEqual(['iceberg.analytics.events', 'iceberg.analytics.events']);
  });
});
