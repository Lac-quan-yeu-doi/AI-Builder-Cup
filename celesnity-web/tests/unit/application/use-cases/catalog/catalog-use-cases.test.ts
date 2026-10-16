import { describe, expect, it } from 'vitest';

import type { CatalogRepository } from '@/src/application/repositories/catalog.repository.interface';
import { createCreateNamespaceUseCase } from '@/src/application/use-cases/catalog/create-namespace.use-case';
import { createListCatalogsUseCase } from '@/src/application/use-cases/catalog/list-catalogs.use-case';
import { createListNamespacesUseCase } from '@/src/application/use-cases/catalog/list-namespaces.use-case';
import { createListTablesUseCase } from '@/src/application/use-cases/catalog/list-tables.use-case';
import { createListTableSnapshotsUseCase } from '@/src/application/use-cases/catalog/list-table-snapshots.use-case';
import { createLoadTableMetadataUseCase } from '@/src/application/use-cases/catalog/load-table-metadata.use-case';
import { createPreviewTableUseCase } from '@/src/application/use-cases/catalog/preview-table.use-case';
import { createUpdateNamespaceDescriptionUseCase } from '@/src/application/use-cases/catalog/update-namespace-description.use-case';
import type {
  Catalog,
  Namespace,
  TableMetadata,
  TablePreview,
  TableRef,
  TableSnapshot,
  TableSummary,
  CatalogNamespaceScope,
} from '@/src/entities/models/catalog';

const catalogs = [{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }] as const;
const namespaces = [{ catalog: 'iceberg', name: 'analytics' }] as const;
const tables = [
  { catalog: 'iceberg', schema: 'analytics', name: 'events', tableType: 'BASE TABLE' },
] as const;
const metadata: TableMetadata = {
  catalog: 'iceberg',
  schema: 'analytics',
  name: 'events',
  columns: [],
};
const snapshots = [
  {
    snapshotId: 'snapshot-1',
    committedAt: '2026-08-10 01:00:00.000 UTC',
    summary: { operation: 'append' },
  },
] as const;
const preview: TablePreview = {
  columns: [{ name: 'event_id', type: 'bigint' }],
  rows: [[1]],
  rowCount: 1,
};

class RecordingCatalogRepository implements CatalogRepository {
  public listCatalogCalls = 0;
  public namespaceRequests: { readonly catalog: string; readonly scope: CatalogNamespaceScope }[] =
    [];
  public namespaceCreates: {
    readonly catalog: string;
    readonly name: string;
    readonly description?: string;
  }[] = [];
  public namespaceDescriptionUpdates: {
    readonly catalog: string;
    readonly name: string;
    readonly description?: string;
  }[] = [];
  public tableRequests: { readonly catalog: string; readonly schema: string }[] = [];
  public metadataRefs: TableRef[] = [];
  public snapshotRefs: TableRef[] = [];
  public previewRefs: TableRef[] = [];

  public async listCatalogs(): Promise<readonly Catalog[]> {
    this.listCatalogCalls += 1;
    return catalogs;
  }

  public async listNamespaces(
    catalog: string,
    scope: CatalogNamespaceScope = 'writable',
  ): Promise<readonly Namespace[]> {
    this.namespaceRequests.push({ catalog, scope });
    return namespaces;
  }

  public async createNamespace(
    catalog: string,
    name: string,
    description?: string,
  ): Promise<Namespace> {
    this.namespaceCreates.push({
      catalog,
      name,
      ...(description !== undefined ? { description } : {}),
    });
    return { catalog, name, ...(description !== undefined ? { description } : {}) };
  }

  public async updateNamespaceDescription(
    catalog: string,
    name: string,
    description?: string,
  ): Promise<Namespace> {
    this.namespaceDescriptionUpdates.push({
      catalog,
      name,
      ...(description !== undefined ? { description } : {}),
    });
    return { catalog, name, ...(description !== undefined ? { description } : {}) };
  }

  public async listTables(catalog: string, schema: string): Promise<readonly TableSummary[]> {
    this.tableRequests.push({ catalog, schema });
    return tables;
  }

  public async getTableMetadata(ref: TableRef): Promise<TableMetadata> {
    this.metadataRefs.push(ref);
    return metadata;
  }

  public async listSnapshots(ref: TableRef): Promise<readonly TableSnapshot[]> {
    this.snapshotRefs.push(ref);
    return snapshots;
  }

  public async previewTable(ref: TableRef): Promise<TablePreview> {
    this.previewRefs.push(ref);
    return preview;
  }
}

describe('catalog use cases', () => {
  it('lists catalogs exactly once and returns the repository result unchanged', async () => {
    const repository = new RecordingCatalogRepository();

    const result = await createListCatalogsUseCase(repository)();

    expect(repository.listCatalogCalls).toBe(1);
    expect(result).toBe(catalogs);
  });

  it('forwards the catalog exactly once when listing namespaces', async () => {
    const repository = new RecordingCatalogRepository();

    const result = await createListNamespacesUseCase(repository)('iceberg/warehouse');

    expect(repository.namespaceRequests).toEqual([
      { catalog: 'iceberg/warehouse', scope: 'writable' },
    ]);
    expect(result).toBe(namespaces);
  });

  it('forwards readable scope for catalog-backed property browsing', async () => {
    const repository = new RecordingCatalogRepository();

    await createListNamespacesUseCase(repository)('postgres', 'readable');

    expect(repository.namespaceRequests).toEqual([{ catalog: 'postgres', scope: 'readable' }]);
  });

  it('forwards the catalog and database name exactly once when creating a namespace', async () => {
    const repository = new RecordingCatalogRepository();

    const result = await createCreateNamespaceUseCase(repository)(
      'iceberg',
      'curated_sales',
      'Curated reporting data',
    );

    expect(repository.namespaceCreates).toEqual([
      {
        catalog: 'iceberg',
        name: 'curated_sales',
        description: 'Curated reporting data',
      },
    ]);
    expect(result).toEqual({
      catalog: 'iceberg',
      name: 'curated_sales',
      description: 'Curated reporting data',
    });
  });

  it('forwards a database description update exactly once', async () => {
    const repository = new RecordingCatalogRepository();

    const result = await createUpdateNamespaceDescriptionUseCase(repository)(
      'iceberg',
      'curated_sales',
      'Finance reporting data',
    );

    expect(repository.namespaceDescriptionUpdates).toEqual([
      {
        catalog: 'iceberg',
        name: 'curated_sales',
        description: 'Finance reporting data',
      },
    ]);
    expect(result.description).toBe('Finance reporting data');
  });

  it('forwards the catalog and schema exactly once when listing tables', async () => {
    const repository = new RecordingCatalogRepository();

    const result = await createListTablesUseCase(repository)('iceberg', 'raw/events');

    expect(repository.tableRequests).toEqual([{ catalog: 'iceberg', schema: 'raw/events' }]);
    expect(result).toBe(tables);
  });

  it('forwards the table reference exactly once when loading metadata', async () => {
    const repository = new RecordingCatalogRepository();
    const ref = { catalog: 'iceberg', schema: 'analytics', table: 'events' } as const;

    const result = await createLoadTableMetadataUseCase(repository)(ref);

    expect(repository.metadataRefs).toEqual([ref]);
    expect(result).toBe(metadata);
  });

  it('forwards the table reference exactly once when listing snapshots', async () => {
    const repository = new RecordingCatalogRepository();
    const ref = { catalog: 'iceberg', schema: 'analytics', table: 'events' } as const;

    const result = await createListTableSnapshotsUseCase(repository)(ref);

    expect(repository.snapshotRefs).toEqual([ref]);
    expect(result).toBe(snapshots);
  });

  it('forwards the exact table reference once when loading a preview', async () => {
    const repository = new RecordingCatalogRepository();
    const loadPreview = createPreviewTableUseCase(repository);

    const result = await loadPreview({
      catalog: 'iceberg',
      schema: 'analytics',
      table: 'events',
    });

    expect(repository.previewRefs).toEqual([
      {
        catalog: 'iceberg',
        schema: 'analytics',
        table: 'events',
      },
    ]);
    expect(result).toBe(preview);
  });
});
