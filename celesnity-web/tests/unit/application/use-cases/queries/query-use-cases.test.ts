import { describe, expect, it } from 'vitest';

import type { QueryRepository } from '@/src/application/repositories/query.repository.interface';
import { createCancelQueryUseCase } from '@/src/application/use-cases/queries/cancel-query.use-case';
import { createGetQueryUseCase } from '@/src/application/use-cases/queries/get-query.use-case';
import { createListQueryCatalogsUseCase } from '@/src/application/use-cases/queries/list-query-catalogs.use-case';
import { createListQueryHistoryUseCase } from '@/src/application/use-cases/queries/list-query-history.use-case';
import { createListQueryNamespacesUseCase } from '@/src/application/use-cases/queries/list-query-namespaces.use-case';
import { createSubmitQueryUseCase } from '@/src/application/use-cases/queries/submit-query.use-case';
import type {
  QueryEditorSession,
  SqlExecutionResult,
  SqlExecutionSummary,
} from '@/src/entities/models/query';

function result(): SqlExecutionResult {
  return {
    id: 'query-1',
    status: 'running',
    catalog: 'iceberg',
    sql: 'SELECT 1',
    columns: [],
    rows: [],
    truncated: false,
    resultsAvailable: false,
    queuedAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:01:00.000Z',
  };
}

class RecordingQueryRepository implements QueryRepository {
  public history: readonly SqlExecutionSummary[] = [];
  public readonly calls: string[] = [];
  public readonly values: unknown[] = [];

  public async listCatalogs() {
    this.calls.push('listCatalogs');
    return [{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }];
  }

  public async listNamespaces(catalog: string) {
    this.calls.push('listNamespaces');
    this.values.push(catalog);
    return [{ catalog, name: 'analytics' }];
  }

  public async listHistory() {
    this.calls.push('listHistory');
    return this.history;
  }

  public async submit(session: QueryEditorSession) {
    this.calls.push('submit');
    this.values.push(session);
    return { id: 'query-1', status: 'queued' as const };
  }

  public async get(id: string) {
    this.calls.push('get');
    this.values.push(id);
    return result();
  }

  public async cancel(id: string) {
    this.calls.push('cancel');
    this.values.push(id);
    return result();
  }
}

function summary(id: string, queuedAt: string): SqlExecutionSummary {
  return {
    id,
    status: 'queued',
    catalog: 'iceberg',
    statementPreview: 'SELECT 1',
    queuedAt,
    updatedAt: queuedAt,
  };
}

describe('query request-response use cases', () => {
  it('delegates catalog, namespace, get, and cancel operations exactly once', async () => {
    const repository = new RecordingQueryRepository();

    const catalogs = await createListQueryCatalogsUseCase(repository)();
    const namespaces = await createListQueryNamespacesUseCase(repository)('catalog/one');
    const loaded = await createGetQueryUseCase(repository)('query/get');
    const cancelled = await createCancelQueryUseCase(repository)('query/cancel');

    expect(catalogs).toEqual([{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }]);
    expect(namespaces).toEqual([{ catalog: 'catalog/one', name: 'analytics' }]);
    expect(loaded).toEqual(result());
    expect(cancelled).toEqual(result());
    expect(repository.calls).toEqual(['listCatalogs', 'listNamespaces', 'get', 'cancel']);
    expect(repository.values).toEqual(['catalog/one', 'query/get', 'query/cancel']);
  });

  it('sorts history newest-first without mutating the repository array', async () => {
    const repository = new RecordingQueryRepository();
    const source = [
      summary('old', '2026-08-09T08:00:00.000Z'),
      summary('new', '2026-08-10T08:00:00.000Z'),
      summary('middle', '2026-08-10T07:00:00.000Z'),
    ] as const;
    repository.history = source;

    const history = await createListQueryHistoryUseCase(repository)();

    expect(history.map(({ id }) => id)).toEqual(['new', 'middle', 'old']);
    expect(source.map(({ id }) => id)).toEqual(['old', 'new', 'middle']);
    expect(repository.calls).toEqual(['listHistory']);
  });

  it('trims query context, omits a blank namespace, and preserves SQL byte-for-byte', async () => {
    const repository = new RecordingQueryRepository();
    const sql = '\n  SELECT *\nFROM iceberg.analytics.orders;  \n';

    await createSubmitQueryUseCase(repository)({
      sql,
      context: { catalog: '  iceberg  ', namespace: ' \t ' },
    });
    await createSubmitQueryUseCase(repository)({
      sql,
      context: { catalog: ' iceberg ', namespace: ' analytics ' },
    });

    expect(repository.values).toEqual([
      { sql, context: { catalog: 'iceberg' } },
      { sql, context: { catalog: 'iceberg', namespace: 'analytics' } },
    ]);
  });
});
