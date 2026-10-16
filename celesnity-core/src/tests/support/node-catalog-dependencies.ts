import { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import type {
  ICatalogReader,
  TablePreview,
} from '@application/catalog-exploration/interfaces/i-catalog-reader';
import type { ICatalogWriter } from '@application/catalog-exploration/interfaces/i-catalog-writer';
import type {
  CatalogSourceBinding,
  ICatalogSourceBindingResolver,
} from '@application/node-catalog/interfaces/i-catalog-source-binding-resolver';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import type {
  DatabaseServiceListPage,
  DatabaseServiceView,
} from '@application/database-service/read-models/database-service.view';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import {
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

export const TEST_SOURCE_CONNECTION: DatabaseServiceView = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Production PostgreSQL',
  databaseNames: [],
  connectorType: 'POSTGRESQL',
  configSchemaVersion: 1,
  config: {
    endpoint: { host: 'source.internal', port: 5432 },
    databaseName: 'operations',
    username: 'reader',
    sslMode: 'require',
  },
  summary: [],
  verificationStatus: VerificationStatusValue.SUCCEEDED,
  lastTestedAt: '2026-08-11T01:00:00.000Z',
  createdAt: '2026-08-10T01:00:00.000Z',
  updatedAt: '2026-08-11T01:00:00.000Z',
};

export class NodeCatalogConnectionReaderStub implements IDatabaseServiceReader {
  public constructor(
    private readonly values: readonly DatabaseServiceView[] = [TEST_SOURCE_CONNECTION],
  ) {}

  public listActive(): Promise<DatabaseServiceListPage> {
    return Promise.resolve({
      items: this.values,
      page: 1,
      pageSize: this.values.length,
      total: this.values.length,
    });
  }

  public findActiveById(id: string): Promise<DatabaseServiceView | undefined> {
    return Promise.resolve(this.values.find((connection) => connection.id === id));
  }
}

export class NodeCatalogSourceBindingResolverStub implements ICatalogSourceBindingResolver {
  public constructor(private readonly binding?: CatalogSourceBinding) {}

  public resolve(
    databaseServiceId: string,
    namespaceId: string,
    relationId: string,
  ): Promise<CatalogSourceBinding | undefined> {
    if (
      this.binding?.databaseServiceId !== databaseServiceId ||
      this.binding.namespaceId !== namespaceId ||
      this.binding.relationId !== relationId
    ) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(this.binding);
  }
}

class NodeCatalogCatalogReaderStub implements ICatalogReader {
  public listSchemas(catalog: CatalogName): Promise<readonly Namespace[]> {
    return Promise.resolve([Namespace.create(catalog.value, 'analytics')]);
  }

  public listTables(catalog: CatalogName, schema: NamespaceName): Promise<readonly TableSummary[]> {
    return Promise.resolve([
      TableSummary.create(catalog.value, schema.value, 'customer_curated', 'BASE TABLE'),
    ]);
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

  public profileTable(): ReturnType<ICatalogReader['profileTable']> {
    return Promise.resolve([]);
  }
}

class NodeCatalogCatalogWriterStub implements ICatalogWriter {
  public createNamespace(catalog: CatalogName, namespace: NamespaceName): Promise<Namespace> {
    return Promise.resolve(Namespace.create(catalog.value, namespace.value));
  }
}

export function nodeCatalogCatalogUseCases(): CatalogExplorationUseCases {
  return new CatalogExplorationUseCases(
    new NodeCatalogCatalogReaderStub(),
    new NodeCatalogCatalogWriterStub(),
    'iceberg',
    100,
    {
      authorizeCatalog: () =>
        Promise.resolve({ allowed: true, matchedGrantIds: ['test'], reason: 'EXPLICIT_ALLOW' }),
    },
  );
}
