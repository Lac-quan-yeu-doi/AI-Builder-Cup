import { describe, expect, it } from 'vitest';

import { InputParseError } from '@/src/entities/errors/application-errors';
import type {
  Catalog,
  Namespace,
  TableMetadata,
  TablePreview,
  TablePreviewRequest,
  TableRef,
  TableSnapshot,
  TableSummary,
} from '@/src/entities/models/catalog';
import { createListCatalogsController } from '@/src/interface-adapters/controllers/catalog/list-catalogs.controller';
import { createCreateNamespaceController } from '@/src/interface-adapters/controllers/catalog/create-namespace.controller';
import { createListNamespacesController } from '@/src/interface-adapters/controllers/catalog/list-namespaces.controller';
import { createListTablesController } from '@/src/interface-adapters/controllers/catalog/list-tables.controller';
import { createListTableSnapshotsController } from '@/src/interface-adapters/controllers/catalog/list-table-snapshots.controller';
import { createLoadTableMetadataController } from '@/src/interface-adapters/controllers/catalog/load-table-metadata.controller';
import { createPreviewTableController } from '@/src/interface-adapters/controllers/catalog/preview-table.controller';
import { createUpdateNamespaceDescriptionController } from '@/src/interface-adapters/controllers/catalog/update-namespace-description.controller';

const catalog: Catalog = {
  name: 'iceberg',
  jdbcCatalogIdentity: 'celesnity',
};
const namespace: Namespace = { catalog: 'iceberg', name: 'analytics' };
const table: TableSummary = {
  catalog: 'iceberg',
  schema: 'analytics',
  name: 'events',
  tableType: 'BASE TABLE',
};
const metadata: TableMetadata = {
  catalog: 'iceberg',
  schema: 'analytics',
  name: 'events',
  columns: [
    {
      name: 'event_id',
      dataType: 'bigint',
      nullable: false,
      ordinalPosition: 1,
      comment: 'Primary event identifier',
    },
  ],
};
const snapshots: readonly TableSnapshot[] = [
  {
    snapshotId: 'snapshot-2',
    parentId: 'snapshot-1',
    committedAt: '2026-08-10 01:00:00.000 UTC',
    operation: 'append',
    manifestList: 's3://warehouse/manifest-list.avro',
    summary: { 'added-records': '42' },
  },
];
const previewNestedObject = {
  attributes: {
    source: 'web',
    tags: ['created'],
  },
};
const previewNestedArray = ['nested', { active: true }, [1, 2]];
const preview: TablePreview = {
  columns: [
    { name: 'event_id', type: 'bigint' },
    { name: 'payload', type: 'varchar' },
  ],
  rows: [
    [1, previewNestedObject],
    [previewNestedArray, 'created'],
    [2, null],
  ],
  rowCount: 3,
};
const ref: TableRef = { catalog: 'iceberg', schema: 'analytics', table: 'events' };

describe('catalog controllers', () => {
  it('lists catalogs through one use case and presents copied items', async () => {
    let calls = 0;
    const source = [catalog] as const;
    const controller = createListCatalogsController(async () => {
      calls += 1;
      return source;
    });

    const result = await controller();

    expect(calls).toBe(1);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result[0]).not.toBe(catalog);
  });

  it('lists namespaces without introducing a minimum catalog length', async () => {
    const source = [namespace] as const;
    const received: { readonly catalog: string; readonly scope: string }[] = [];
    const controller = createListNamespacesController(async (catalogName, scope) => {
      received.push({ catalog: catalogName, scope: scope ?? 'writable' });
      return source;
    });

    const result = await controller('');

    expect(received).toEqual([{ catalog: '', scope: 'writable' }]);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result[0]).not.toBe(namespace);
  });

  it('requests readable namespaces for catalog-backed consumers', async () => {
    const received: string[] = [];
    const controller = createListNamespacesController(async (_catalogName, scope) => {
      received.push(scope ?? 'writable');
      return [namespace];
    });

    await controller('iceberg', 'readable');

    expect(received).toEqual(['readable']);
  });

  it('creates and presents a trimmed valid database name and description exactly once', async () => {
    const received: { readonly catalog: string; readonly name: string; description?: string }[] =
      [];
    const controller = createCreateNamespaceController(async (catalogName, name, description) => {
      received.push({ catalog: catalogName, name, description });
      return { catalog: catalogName, name, description };
    });

    const result = await controller('iceberg', '  curated_sales  ', '  Reporting data  ');

    expect(received).toEqual([
      { catalog: 'iceberg', name: 'curated_sales', description: 'Reporting data' },
    ]);
    expect(result).toEqual({
      catalog: 'iceberg',
      name: 'curated_sales',
      description: 'Reporting data',
    });
  });

  it('trims and updates an optional database description', async () => {
    const controller = createUpdateNamespaceDescriptionController(
      async (catalogName, name, description) => ({ catalog: catalogName, name, description }),
    );

    await expect(controller('iceberg', 'analytics', '  Business metrics  ')).resolves.toEqual({
      catalog: 'iceberg',
      name: 'analytics',
      description: 'Business metrics',
    });
    await expect(controller('iceberg', 'analytics', '   ')).resolves.toEqual({
      catalog: 'iceberg',
      name: 'analytics',
      description: undefined,
    });
  });

  it('rejects an unsafe database identifier before invoking its use case', async () => {
    let calls = 0;
    const controller = createCreateNamespaceController(async () => {
      calls += 1;
      return namespace;
    });

    await expect(controller('iceberg', 'curated-sales')).rejects.toBeInstanceOf(InputParseError);
    expect(calls).toBe(0);
  });

  it('rejects a non-string catalog before listing namespaces', async () => {
    let calls = 0;
    const controller = createListNamespacesController(async () => {
      calls += 1;
      return [namespace];
    });

    await expect(controller(42 as unknown as string)).rejects.toBeInstanceOf(InputParseError);
    expect(calls).toBe(0);
  });

  it('lists tables through one use case and presents copied items', async () => {
    const source = [table] as const;
    const received: { catalog: string; schema: string }[] = [];
    const controller = createListTablesController(async (catalogName, schema) => {
      received.push({ catalog: catalogName, schema });
      return source;
    });

    const result = await controller('iceberg', 'analytics');

    expect(received).toEqual([{ catalog: 'iceberg', schema: 'analytics' }]);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result[0]).not.toBe(table);
  });

  it('rejects a structurally invalid table-list input before invoking its use case', async () => {
    let calls = 0;
    const controller = createListTablesController(async () => {
      calls += 1;
      return [table];
    });

    await expect(controller('iceberg', 42 as unknown as string)).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(calls).toBe(0);
  });

  it('loads metadata through one use case and copies its columns', async () => {
    const received: TableRef[] = [];
    const controller = createLoadTableMetadataController(async (input) => {
      received.push(input);
      return metadata;
    });

    const result = await controller(ref);

    expect(received).toEqual([ref]);
    expect(result).toEqual(metadata);
    expect(result).not.toBe(metadata);
    expect(result.columns).not.toBe(metadata.columns);
    expect(result.columns[0]).not.toBe(metadata.columns[0]);
  });

  it('rejects invalid metadata table references before invoking its use case', async () => {
    let calls = 0;
    const controller = createLoadTableMetadataController(async () => {
      calls += 1;
      return metadata;
    });

    await expect(
      controller({ catalog: 'iceberg', schema: 'analytics' } as unknown as TableRef),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(calls).toBe(0);
  });

  it('lists snapshots through one use case and copies items and summary maps', async () => {
    const received: TableRef[] = [];
    const controller = createListTableSnapshotsController(async (input) => {
      received.push(input);
      return snapshots;
    });

    const result = await controller(ref);

    expect(received).toEqual([ref]);
    expect(result).toEqual(snapshots);
    expect(result).not.toBe(snapshots);
    expect(result[0]).not.toBe(snapshots[0]);
    expect(result[0]?.summary).not.toBe(snapshots[0]?.summary);
  });

  it('rejects invalid snapshot table references before invoking its use case', async () => {
    let calls = 0;
    const controller = createListTableSnapshotsController(async () => {
      calls += 1;
      return snapshots;
    });

    await expect(
      controller({ catalog: 'iceberg', schema: 42, table: 'events' } as unknown as TableRef),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(calls).toBe(0);
  });

  it('previews a table through one use case and copies columns plus every row', async () => {
    const received: TablePreviewRequest[] = [];
    const controller = createPreviewTableController(async (input) => {
      received.push(input);
      return preview;
    });

    const result = await controller(ref);

    expect(received).toEqual([ref]);
    expect(result).toEqual(preview);
    expect(result).not.toBe(preview);
    expect(result.columns).not.toBe(preview.columns);
    expect(result.columns[0]).not.toBe(preview.columns[0]);
    expect(result.columns[1]).not.toBe(preview.columns[1]);
    expect(result.rows).not.toBe(preview.rows);
    expect(result.rows[0]).not.toBe(preview.rows[0]);
    expect(result.rows[1]).not.toBe(preview.rows[1]);
    expect(result.rows[2]).not.toBe(preview.rows[2]);

    const copiedObject = result.rows[0]?.[1] as typeof previewNestedObject;
    const copiedArray = result.rows[1]?.[0] as typeof previewNestedArray;
    expect(copiedObject).not.toBe(previewNestedObject);
    expect(copiedObject.attributes).not.toBe(previewNestedObject.attributes);
    expect(copiedObject.attributes.tags).not.toBe(previewNestedObject.attributes.tags);
    expect(copiedArray).not.toBe(previewNestedArray);
    expect(copiedArray[1]).not.toBe(previewNestedArray[1]);
    expect(copiedArray[2]).not.toBe(previewNestedArray[2]);
  });

  it('accepts a UUID device filter and rejects an invalid one', async () => {
    const received: TablePreviewRequest[] = [];
    const controller = createPreviewTableController(async (input) => {
      received.push(input);
      return preview;
    });
    const request = { ...ref, deviceId: '78a5815e-076c-48b6-b812-81f6422c5f93' };

    await controller(request);
    await expect(controller({ ...ref, deviceId: 'sensor-1' })).rejects.toBeInstanceOf(
      InputParseError,
    );

    expect(received).toEqual([request]);
  });

  it('rejects invalid preview table references before invoking its use case', async () => {
    let calls = 0;
    const controller = createPreviewTableController(async () => {
      calls += 1;
      return preview;
    });

    await expect(controller(null as unknown as TableRef)).rejects.toBeInstanceOf(InputParseError);
    expect(calls).toBe(0);
  });
});
