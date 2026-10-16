import { describe, expect, it } from 'vitest';

import { RemoteServiceError } from '@/src/entities/errors/application-errors';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { CoreApiQueryRepository } from '@/src/infrastructure/repositories/core-api-query.repository';

type SummaryDto = components['schemas']['SqlExecutionSummaryResponseDto'];
type DetailDto = components['schemas']['SqlExecutionDetailResponseDto'];

interface RecordedRequest {
  readonly path: string;
  readonly init?: RequestInit;
}

class FakeTransport implements GeneratedApiTransport {
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

const summaryDto: SummaryDto = {
  id: 'query-1',
  status: 'FAILED',
  catalog: 'iceberg',
  namespace: 'analytics',
  statementPreview: 'SELECT * FROM orders',
  trinoQueryId: 'trino-1',
  rowCount: 0,
  errorCode: 'TRINO_USER_ERROR',
  queuedAt: '2026-08-10T08:00:00.000Z',
  startedAt: '2026-08-10T08:00:01.000Z',
  finishedAt: '2026-08-10T08:00:02.000Z',
  updatedAt: '2026-08-10T08:00:02.000Z',
};

const detailDto: DetailDto = {
  id: 'query-1',
  status: 'FAILED',
  catalog: 'iceberg',
  namespace: 'analytics',
  sql: 'SELECT * FROM orders',
  trinoQueryId: 'trino-1',
  columns: [{ name: 'payload', type: 'json' }],
  rows: [[{ nested: ['one', { two: 2 }] }]],
  rowCount: 0,
  truncated: false,
  resultsAvailable: true,
  statistics: {
    state: 'FAILED',
    queued: false,
    progressPercentage: 0,
    elapsedTimeMillis: 12,
    queuedTimeMillis: 1,
    cpuTimeMillis: 2,
    processedRows: 0,
    processedBytes: 0,
    peakMemoryBytes: 4,
    totalSplits: 3,
    completedSplits: 2,
  },
  failure: {
    code: 'TRINO_USER_ERROR',
    message: 'bad SQL',
    location: { line: 1, column: 8 },
  },
  queuedAt: '2026-08-10T08:00:00.000Z',
  startedAt: '2026-08-10T08:00:01.000Z',
  finishedAt: '2026-08-10T08:00:02.000Z',
  updatedAt: '2026-08-10T08:00:02.000Z',
};

describe('CoreApiQueryRepository', () => {
  it('lists catalogs, encoded namespaces, and fully mapped history', async () => {
    const transport = new FakeTransport(
      [{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }],
      [{ catalog: 'catalog/one', name: 'analytics' }],
      [summaryDto],
    );
    const repository = new CoreApiQueryRepository(transport);

    const catalogs = await repository.listCatalogs();
    const namespaces = await repository.listNamespaces('catalog/one');
    const history = await repository.listHistory();

    expect(transport.requests).toEqual([
      { path: '/catalogs', init: { method: 'GET' } },
      { path: '/catalogs/catalog%2Fone/schemas', init: { method: 'GET' } },
      { path: '/sql-executions', init: { method: 'GET' } },
    ]);
    expect(catalogs).toEqual([{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }]);
    expect(namespaces).toEqual([{ catalog: 'catalog/one', name: 'analytics' }]);
    expect(history).toEqual([
      {
        id: 'query-1',
        status: 'failed',
        catalog: 'iceberg',
        namespace: 'analytics',
        statementPreview: 'SELECT * FROM orders',
        trinoQueryId: 'trino-1',
        rowCount: 0,
        errorCode: 'TRINO_USER_ERROR',
        queuedAt: '2026-08-10T08:00:00.000Z',
        startedAt: '2026-08-10T08:00:01.000Z',
        finishedAt: '2026-08-10T08:00:02.000Z',
        updatedAt: '2026-08-10T08:00:02.000Z',
      },
    ]);
  });

  it('submits the exact SQL and context body and maps the accepted status', async () => {
    const transport = new FakeTransport({ id: 'query-1', status: 'QUEUED' });
    const repository = new CoreApiQueryRepository(transport);
    const sql = '\n SELECT 1;  \n';

    const accepted = await repository.submit({
      sql,
      context: { catalog: 'iceberg', namespace: 'analytics' },
    });

    expect(transport.requests).toEqual([
      {
        path: '/sql-executions',
        init: {
          method: 'POST',
          body: JSON.stringify({ sql, catalog: 'iceberg', namespace: 'analytics' }),
        },
      },
    ]);
    expect(accepted).toEqual({ id: 'query-1', status: 'queued' });
  });

  it('gets and cancels encoded IDs with complete copied detail mapping', async () => {
    const transport = new FakeTransport(detailDto, detailDto);
    const repository = new CoreApiQueryRepository(transport);

    const loaded = await repository.get('query/one');
    const cancelled = await repository.cancel('query/one');

    expect(transport.requests).toEqual([
      { path: '/sql-executions/query%2Fone', init: { method: 'GET' } },
      { path: '/sql-executions/query%2Fone/cancel', init: { method: 'POST' } },
    ]);
    expect(loaded).toEqual({
      id: 'query-1',
      status: 'failed',
      catalog: 'iceberg',
      namespace: 'analytics',
      sql: 'SELECT * FROM orders',
      trinoQueryId: 'trino-1',
      columns: [{ name: 'payload', type: 'json' }],
      rows: [[{ nested: ['one', { two: 2 }] }]],
      rowCount: 0,
      truncated: false,
      resultsAvailable: true,
      statistics: detailDto.statistics,
      failure: detailDto.failure,
      queuedAt: '2026-08-10T08:00:00.000Z',
      startedAt: '2026-08-10T08:00:01.000Z',
      finishedAt: '2026-08-10T08:00:02.000Z',
      updatedAt: '2026-08-10T08:00:02.000Z',
    });
    expect(cancelled).toEqual(loaded);
    expect(loaded).not.toBe(detailDto);
    expect(loaded.columns).not.toBe(detailDto.columns);
    expect(loaded.rows).not.toBe(detailDto.rows);
    expect(loaded.rows[0]?.[0]).not.toBe(detailDto.rows[0]?.[0]);
    expect(loaded.statistics).not.toBe(detailDto.statistics);
    expect(loaded.failure).not.toBe(detailDto.failure);
    expect(loaded.failure?.location).not.toBe(detailDto.failure?.location);
  });

  it('omits absent optional detail fields and translates transport failures', async () => {
    const minimal: DetailDto = {
      id: 'query-1',
      status: 'RUNNING',
      catalog: 'iceberg',
      sql: 'SELECT 1',
      columns: [],
      rows: [],
      truncated: false,
      resultsAvailable: false,
      queuedAt: '2026-08-10T08:00:00.000Z',
      updatedAt: '2026-08-10T08:00:01.000Z',
    };
    const repository = new CoreApiQueryRepository(
      new FakeTransport(minimal, new CoreApiError(500, 'unavailable')),
    );

    await expect(repository.get('query-1')).resolves.toEqual({
      id: 'query-1',
      status: 'running',
      catalog: 'iceberg',
      sql: 'SELECT 1',
      columns: [],
      rows: [],
      truncated: false,
      resultsAvailable: false,
      queuedAt: '2026-08-10T08:00:00.000Z',
      updatedAt: '2026-08-10T08:00:01.000Z',
    });
    await expect(repository.cancel('query-1')).rejects.toBeInstanceOf(RemoteServiceError);
  });

  it('uses the legacy queued fallback for an unexpected runtime response status', async () => {
    const invalidRuntimeDetail = {
      ...detailDto,
      status: 'UNKNOWN',
    } as unknown as DetailDto;
    const repository = new CoreApiQueryRepository(new FakeTransport(invalidRuntimeDetail));

    const loaded = await repository.get('query-1');

    expect(loaded.status).toBe('queued');
  });
});
