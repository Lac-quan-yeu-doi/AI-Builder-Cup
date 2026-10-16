import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  NotFoundError,
  RemoteServiceError,
} from '@/src/entities/errors/application-errors';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { CoreApiCatalogRepository } from '@/src/infrastructure/repositories/core-api-catalog.repository';

type CatalogResponseDto = components['schemas']['CatalogResponseDto'];
type NamespaceResponseDto = components['schemas']['NamespaceResponseDto'];
type TableSummaryResponseDto = components['schemas']['TableSummaryResponseDto'];
type TableMetadataResponseDto = components['schemas']['TableMetadataResponseDto'];
type TableSnapshotResponseDto = components['schemas']['TableSnapshotResponseDto'];
type TablePreviewResponseDto = components['schemas']['TablePreviewResponseDto'];

interface RecordedRequest {
  readonly path: string;
  readonly init?: RequestInit;
}

class FakeGeneratedApiTransport implements GeneratedApiTransport {
  public readonly requests: RecordedRequest[] = [];
  private readonly responses: unknown[];

  public constructor(...responses: unknown[]) {
    this.responses = [...responses];
  }

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    const response = this.responses.shift();
    if (response instanceof Error) {
      throw response;
    }
    return response as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used by this repository');
  }
}

describe('CoreApiCatalogRepository', () => {
  it('lists catalogs and maps every response field', async () => {
    const response: CatalogResponseDto[] = [{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }];
    const transport = new FakeGeneratedApiTransport(response);
    const repository = new CoreApiCatalogRepository(transport);

    const result = await repository.listCatalogs();

    expect(transport.requests).toEqual([{ path: '/catalogs', init: { method: 'GET' } }]);
    expect(result).toEqual([{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }]);
    expect(result).not.toBe(response);
    expect(result[0]).not.toBe(response[0]);
  });

  it('encodes the catalog segment independently and maps every namespace field', async () => {
    const response: NamespaceResponseDto[] = [
      { catalog: 'iceberg/prod', name: 'raw events', description: 'Raw event data' },
    ];
    const transport = new FakeGeneratedApiTransport(response);
    const repository = new CoreApiCatalogRepository(transport);

    const result = await repository.listNamespaces('iceberg/prod');

    expect(transport.requests).toEqual([
      { path: '/catalogs/iceberg%2Fprod/schemas?writable=true', init: { method: 'GET' } },
    ]);
    expect(result).toEqual([
      { catalog: 'iceberg/prod', name: 'raw events', description: 'Raw event data' },
    ]);
  });

  it('lists readable namespaces without applying the writable-only filter', async () => {
    const transport = new FakeGeneratedApiTransport([]);
    const repository = new CoreApiCatalogRepository(transport);

    await repository.listNamespaces('postgres', 'readable');

    expect(transport.requests).toEqual([
      { path: '/catalogs/postgres/schemas', init: { method: 'GET' } },
    ]);
  });

  it('creates a namespace with a POST body and maps the created database', async () => {
    const response: NamespaceResponseDto = {
      catalog: 'iceberg/prod',
      name: 'curated_sales',
      description: 'Curated sales data',
    };
    const transport = new FakeGeneratedApiTransport(response);
    const repository = new CoreApiCatalogRepository(transport);

    const result = await repository.createNamespace(
      'iceberg/prod',
      'curated_sales',
      'Curated sales data',
    );

    expect(transport.requests).toEqual([
      {
        path: '/catalogs/iceberg%2Fprod/schemas',
        init: {
          method: 'POST',
          body: JSON.stringify({ name: 'curated_sales', description: 'Curated sales data' }),
        },
      },
    ]);
    expect(result).toEqual(response);
    expect(result).not.toBe(response);
  });

  it('updates and clears a namespace description with PATCH', async () => {
    const updated: NamespaceResponseDto = {
      catalog: 'iceberg/prod',
      name: 'curated sales',
      description: 'Finance reporting',
    };
    const transport = new FakeGeneratedApiTransport(updated, {
      catalog: 'iceberg/prod',
      name: 'curated sales',
    });
    const repository = new CoreApiCatalogRepository(transport);

    await expect(
      repository.updateNamespaceDescription('iceberg/prod', 'curated sales', 'Finance reporting'),
    ).resolves.toEqual(updated);
    await repository.updateNamespaceDescription('iceberg/prod', 'curated sales');

    expect(transport.requests).toEqual([
      {
        path: '/catalogs/iceberg%2Fprod/schemas/curated%20sales',
        init: {
          method: 'PATCH',
          body: JSON.stringify({ description: 'Finance reporting' }),
        },
      },
      {
        path: '/catalogs/iceberg%2Fprod/schemas/curated%20sales',
        init: { method: 'PATCH', body: JSON.stringify({ description: null }) },
      },
    ]);
  });

  it('encodes catalog and schema separately and maps every table summary field', async () => {
    const response: TableSummaryResponseDto[] = [
      {
        catalog: 'iceberg/prod',
        schema: 'raw events',
        name: 'events#daily',
        tableType: 'BASE TABLE',
      },
    ];
    const transport = new FakeGeneratedApiTransport(response);
    const repository = new CoreApiCatalogRepository(transport);

    const result = await repository.listTables('iceberg/prod', 'raw events');

    expect(transport.requests).toEqual([
      {
        path: '/catalogs/iceberg%2Fprod/schemas/raw%20events/tables',
        init: { method: 'GET' },
      },
    ]);
    expect(result).toEqual([
      {
        catalog: 'iceberg/prod',
        schema: 'raw events',
        name: 'events#daily',
        tableType: 'BASE TABLE',
      },
    ]);
  });

  it('encodes all table-ref segments independently and maps sorted column metadata', async () => {
    const response: TableMetadataResponseDto = {
      catalog: 'iceberg/prod',
      schema: 'raw events',
      name: 'events#daily',
      columns: [
        {
          name: 'payload',
          dataType: 'varchar',
          nullable: true,
          ordinalPosition: 2,
          comment: null,
        },
        {
          name: 'event_id',
          dataType: 'bigint',
          nullable: false,
          ordinalPosition: 1,
          comment: 'Primary event identifier',
        },
      ],
    };
    const transport = new FakeGeneratedApiTransport(response);
    const repository = new CoreApiCatalogRepository(transport);

    const result = await repository.getTableMetadata({
      catalog: 'iceberg/prod',
      schema: 'raw events',
      table: 'events#daily',
    });

    expect(transport.requests).toEqual([
      {
        path: '/catalogs/iceberg%2Fprod/schemas/raw%20events/tables/events%23daily/columns',
        init: { method: 'GET' },
      },
    ]);
    expect(result).toEqual({
      catalog: 'iceberg/prod',
      schema: 'raw events',
      name: 'events#daily',
      columns: [
        {
          name: 'event_id',
          dataType: 'bigint',
          nullable: false,
          ordinalPosition: 1,
          comment: 'Primary event identifier',
        },
        {
          name: 'payload',
          dataType: 'varchar',
          nullable: true,
          ordinalPosition: 2,
        },
      ],
    });
    expect(response.columns.map((column) => column.ordinalPosition)).toEqual([2, 1]);
  });

  it('lists snapshots and maps every required and optional response field', async () => {
    const response: TableSnapshotResponseDto[] = [
      {
        snapshotId: 'snapshot-2',
        parentId: 'snapshot-1',
        committedAt: '2026-08-10 01:00:00.000 UTC',
        operation: 'append',
        manifestList: 's3://warehouse/manifest-list.avro',
        summary: { 'added-records': '42' },
      },
      {
        snapshotId: 'snapshot-1',
        parentId: null,
        committedAt: '2026-08-09 01:00:00.000 UTC',
        summary: {},
      },
    ];
    const transport = new FakeGeneratedApiTransport(response);
    const repository = new CoreApiCatalogRepository(transport);

    const result = await repository.listSnapshots({
      catalog: 'iceberg/prod',
      schema: 'raw events',
      table: 'events#daily',
    });

    expect(transport.requests).toEqual([
      {
        path: '/catalogs/iceberg%2Fprod/schemas/raw%20events/tables/events%23daily/snapshots',
        init: { method: 'GET' },
      },
    ]);
    expect(result).toEqual([
      {
        snapshotId: 'snapshot-2',
        parentId: 'snapshot-1',
        committedAt: '2026-08-10 01:00:00.000 UTC',
        operation: 'append',
        manifestList: 's3://warehouse/manifest-list.avro',
        summary: { 'added-records': '42' },
      },
      {
        snapshotId: 'snapshot-1',
        committedAt: '2026-08-09 01:00:00.000 UTC',
        summary: {},
      },
    ]);
  });

  it('loads a preview and maps every column, row, and count field', async () => {
    const nestedObject = {
      attributes: {
        source: 'web',
        tags: ['created'],
      },
    };
    const nestedArray = ['nested', { active: true }, [1, 2]];
    const response: TablePreviewResponseDto = {
      columns: [
        { name: 'event_id', type: 'bigint' },
        { name: 'payload', type: 'varchar' },
      ],
      rows: [
        [1, nestedObject],
        [nestedArray, 'created'],
        [2, null],
      ],
      rowCount: 3,
    };
    const transport = new FakeGeneratedApiTransport(response);
    const repository = new CoreApiCatalogRepository(transport);

    const result = await repository.previewTable({
      catalog: 'iceberg/prod',
      schema: 'raw events',
      table: 'events#daily',
    });

    expect(transport.requests).toEqual([
      {
        path: '/catalogs/iceberg%2Fprod/schemas/raw%20events/tables/events%23daily/preview',
        init: { method: 'GET' },
      },
    ]);
    expect(result).toEqual({
      columns: [
        { name: 'event_id', type: 'bigint' },
        { name: 'payload', type: 'varchar' },
      ],
      rows: [
        [1, nestedObject],
        [nestedArray, 'created'],
        [2, null],
      ],
      rowCount: 3,
    });
    expect(result.columns).not.toBe(response.columns);
    expect(result.rows).not.toBe(response.rows);
    expect(result.rows[0]).not.toBe(response.rows[0]);
    expect(result.rows[1]).not.toBe(response.rows[1]);
    expect(result.rows[2]).not.toBe(response.rows[2]);

    const copiedObject = result.rows[0]?.[1] as typeof nestedObject;
    const copiedArray = result.rows[1]?.[0] as typeof nestedArray;
    expect(copiedObject).not.toBe(nestedObject);
    expect(copiedObject.attributes).not.toBe(nestedObject.attributes);
    expect(copiedObject.attributes.tags).not.toBe(nestedObject.attributes.tags);
    expect(copiedArray).not.toBe(nestedArray);
    expect(copiedArray[1]).not.toBe(nestedArray[1]);
    expect(copiedArray[2]).not.toBe(nestedArray[2]);

    nestedObject.attributes.tags.push('mutated-after-mapping');
    (nestedArray[1] as { active: boolean }).active = false;
    expect(copiedObject.attributes.tags).toEqual(['created']);
    expect(copiedArray[1]).toEqual({ active: true });
  });

  it('encodes a device-scoped preview as a query parameter', async () => {
    const transport = new FakeGeneratedApiTransport({ columns: [], rows: [], rowCount: 0 });
    const repository = new CoreApiCatalogRepository(transport);

    await repository.previewTable({
      catalog: 'iceberg',
      schema: 'tnt_factory_bronze',
      table: 'mqtt_events',
      deviceId: '78a5815e-076c-48b6-b812-81f6422c5f93',
    });

    expect(transport.requests[0]?.path).toBe(
      '/catalogs/iceberg/schemas/tnt_factory_bronze/tables/mqtt_events/preview?deviceId=78a5815e-076c-48b6-b812-81f6422c5f93',
    );
  });

  it.each([
    [new CoreApiError(404, 'Table not found.'), NotFoundError],
    [new CoreApiError(409, 'Catalog conflict.'), ConflictError],
    [new CoreApiError(503, 'Core API unavailable.'), RemoteServiceError],
    [new TypeError('fetch failed'), RemoteServiceError],
  ])('translates external failures at the repository boundary', async (cause, ErrorType) => {
    const repository = new CoreApiCatalogRepository(new FakeGeneratedApiTransport(cause));

    await expect(repository.listCatalogs()).rejects.toMatchObject({
      constructor: ErrorType,
      cause,
    });
  });
});
