import { describe, expect, it } from 'vitest';

import type {
  QueryMonitorHandlers,
  QueryMonitorChannel,
} from '@/src/application/use-cases/queries/monitor-query.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type {
  QueryEditorSession,
  SqlCatalog,
  SqlExecutionEvent,
  SqlExecutionResult,
  SqlExecutionSummary,
  SqlNamespace,
} from '@/src/entities/models/query';
import { createCancelQueryController } from '@/src/interface-adapters/controllers/queries/cancel-query.controller';
import { createGetQueryController } from '@/src/interface-adapters/controllers/queries/get-query.controller';
import { createListQueryCatalogsController } from '@/src/interface-adapters/controllers/queries/list-query-catalogs.controller';
import { createListQueryHistoryController } from '@/src/interface-adapters/controllers/queries/list-query-history.controller';
import { createListQueryNamespacesController } from '@/src/interface-adapters/controllers/queries/list-query-namespaces.controller';
import { createMonitorQueryController } from '@/src/interface-adapters/controllers/queries/monitor-query.controller';
import { createSubmitQueryController } from '@/src/interface-adapters/controllers/queries/submit-query.controller';

const catalog: SqlCatalog = { name: 'iceberg', jdbcCatalogIdentity: 'celesnity' };
const namespace: SqlNamespace = { catalog: 'iceberg', name: 'analytics' };
const summary: SqlExecutionSummary = {
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
};
const detail: SqlExecutionResult = {
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
const event: SqlExecutionEvent = {
  id: 'query-1',
  status: 'running',
  finished: false,
  progressPercentage: 0,
  state: 'RUNNING',
  rowCount: 0,
  errorCode: '',
  updatedAt: '2026-08-10T08:00:01.000Z',
};

describe('query request-response controllers', () => {
  it('presents copied catalog, namespace, and history lists', async () => {
    const catalogs = [catalog] as const;
    const namespaces = [namespace] as const;
    const history = [summary];
    const receivedCatalogs: string[] = [];

    const catalogResult = await createListQueryCatalogsController(async () => catalogs)();
    const namespaceResult = await createListQueryNamespacesController(async (value) => {
      receivedCatalogs.push(value);
      return namespaces;
    })('catalog/one');
    const historyResult = await createListQueryHistoryController(async () => history)();

    expect(receivedCatalogs).toEqual(['catalog/one']);
    expect(catalogResult).toEqual(catalogs);
    expect(namespaceResult).toEqual(namespaces);
    expect(historyResult).toEqual(history);
    expect(catalogResult).not.toBe(catalogs);
    expect(catalogResult[0]).not.toBe(catalog);
    expect(namespaceResult[0]).not.toBe(namespace);
    expect(historyResult[0]).not.toBe(summary);
  });

  it('gets and cancels unchanged IDs and deeply presents independent query results', async () => {
    const ids: string[] = [];
    const get = createGetQueryController(async (id) => {
      ids.push(id);
      return detail;
    });
    const cancel = createCancelQueryController(async (id) => {
      ids.push(id);
      return detail;
    });

    const loaded = await get('');
    const cancelled = await cancel('query/one');

    expect(ids).toEqual(['', 'query/one']);
    expect(loaded).toEqual(detail);
    expect(cancelled).toEqual(detail);
    expect(loaded).not.toBe(detail);
    expect(loaded.columns).not.toBe(detail.columns);
    expect(loaded.rows).not.toBe(detail.rows);
    expect(loaded.rows[0]?.[0]).not.toBe(detail.rows[0]?.[0]);
    expect(loaded.statistics).not.toBe(detail.statistics);
    expect(loaded.failure).not.toBe(detail.failure);
    expect(loaded.failure?.location).not.toBe(detail.failure?.location);
  });

  it('validates submit structure without modifying any SQL or context string', async () => {
    const received: QueryEditorSession[] = [];
    const accepted = { id: 'query-1', status: 'queued' as const };
    const controller = createSubmitQueryController(async (session) => {
      received.push(session);
      return accepted;
    });
    const sql = '\n  SELECT *\nFROM orders;  \n';
    const input = { sql, context: { catalog: ' iceberg ', namespace: ' analytics ' } };

    const result = await controller(input);

    expect(received).toEqual([input]);
    expect(received[0]?.sql).toBe(sql);
    expect(result).toEqual(accepted);
    expect(result).not.toBe(accepted);
  });

  it('rejects non-string IDs and malformed submit input before invoking use cases', async () => {
    let calls = 0;
    const get = createGetQueryController(async () => {
      calls += 1;
      return detail;
    });
    const namespaceController = createListQueryNamespacesController(async () => {
      calls += 1;
      return [namespace];
    });
    const submit = createSubmitQueryController(async () => {
      calls += 1;
      return { id: 'query-1', status: 'queued' };
    });

    await expect(get(42 as unknown as string)).rejects.toBeInstanceOf(InputParseError);
    await expect(namespaceController(null as unknown as string)).rejects.toBeInstanceOf(
      InputParseError,
    );
    await expect(
      submit({ sql: 1 as unknown as string, context: { catalog: 'iceberg' } }),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(calls).toBe(0);
  });
});

describe('monitor query controller', () => {
  it('calls one monitor and deeply copies snapshots and event callbacks', () => {
    let applicationHandlers: QueryMonitorHandlers | undefined;
    const ids: string[] = [];
    let closeCalls = 0;
    const monitor = { close: () => (closeCalls += 1) };
    const controller = createMonitorQueryController((id, handlers) => {
      ids.push(id);
      applicationHandlers = handlers;
      return monitor;
    });
    const snapshots: SqlExecutionResult[] = [];
    const events: SqlExecutionEvent[] = [];
    const channels: QueryMonitorChannel[] = [];
    const errors: unknown[] = [];
    const failure = new Error('poll failed');

    const returned = controller('query/one', {
      onSnapshot: (value) => snapshots.push(value),
      onProgress: (value) => events.push(value),
      onChannel: (value) => channels.push(value),
      onError: (value) => errors.push(value),
    });
    applicationHandlers?.onSnapshot(detail);
    applicationHandlers?.onProgress?.(event);
    applicationHandlers?.onChannel?.('polling');
    applicationHandlers?.onError(failure);
    returned.close();

    expect(ids).toEqual(['query/one']);
    expect(returned).toBe(monitor);
    expect(closeCalls).toBe(1);
    expect(snapshots).toEqual([detail]);
    expect(snapshots[0]).not.toBe(detail);
    expect(snapshots[0]?.rows[0]?.[0]).not.toBe(detail.rows[0]?.[0]);
    expect(events).toEqual([event]);
    expect(events[0]).not.toBe(event);
    expect(channels).toEqual(['polling']);
    expect(errors).toEqual([failure]);
  });

  it('rejects a non-string monitor ID before creating the monitor', () => {
    let calls = 0;
    const controller = createMonitorQueryController(() => {
      calls += 1;
      return { close: () => undefined };
    });

    expect(() =>
      controller(42 as unknown as string, {
        onSnapshot: () => undefined,
        onError: () => undefined,
      }),
    ).toThrow(InputParseError);
    expect(calls).toBe(0);
  });
});
