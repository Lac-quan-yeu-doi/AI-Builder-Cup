import { runSqlAndCollectRows } from '@presentation/mcp/sql-execution-helper';
import { QueryStatusValue } from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import type { QueryWorkbenchUseCases } from '@application/query-workbench/query-workbench.use-cases';

function fakeQueryWorkbench(
  details: readonly {
    status: QueryStatusValue;
    columns?: unknown[];
    rows?: unknown[][];
    failure?: { message: string };
  }[],
  warnings: readonly string[] = [],
): QueryWorkbenchUseCases {
  let call = 0;
  return {
    submit: jest
      .fn()
      .mockResolvedValue({ id: 'exec-1', status: QueryStatusValue.QUEUED, warnings }),
    get: jest.fn().mockImplementation(async () => {
      const detail = details[Math.min(call, details.length - 1)];
      call += 1;
      return detail;
    }),
  } as unknown as QueryWorkbenchUseCases;
}

describe('runSqlAndCollectRows', () => {
  it('returns rows as objects keyed by column name once the execution succeeds', async () => {
    const queryWorkbench = fakeQueryWorkbench([
      {
        status: QueryStatusValue.SUCCEEDED,
        columns: [{ name: 'id' }, { name: 'total' }],
        rows: [
          [1, 100],
          [2, 200],
        ],
      },
    ]);

    const result = await runSqlAndCollectRows('select 1', queryWorkbench);

    expect(result.rows).toEqual([
      { id: 1, total: 100 },
      { id: 2, total: 200 },
    ]);
  });

  it('throws the failure message once the execution ends in a terminal failure', async () => {
    const queryWorkbench = fakeQueryWorkbench([
      { status: QueryStatusValue.FAILED, failure: { message: 'table not found' } },
    ]);

    await expect(runSqlAndCollectRows('select 1', queryWorkbench)).rejects.toThrow(
      'table not found',
    );
  });

  it('passes catalog/namespace through to submit when given', async () => {
    const queryWorkbench = fakeQueryWorkbench([
      { status: QueryStatusValue.SUCCEEDED, columns: [], rows: [] },
    ]);

    await runSqlAndCollectRows('select 1', queryWorkbench, {
      catalog: 'iceberg',
      namespace: 'sales',
    });

    expect(queryWorkbench.submit).toHaveBeenCalledWith({
      sql: 'select 1',
      catalog: 'iceberg',
      namespace: 'sales',
    });
  });

  it('passes through the submit-time lint warnings alongside the rows', async () => {
    const queryWorkbench = fakeQueryWorkbench(
      [{ status: QueryStatusValue.SUCCEEDED, columns: [], rows: [] }],
      ['CURRENT_DATE is frozen at the time this result was computed, not "live".'],
    );

    const result = await runSqlAndCollectRows('select CURRENT_DATE', queryWorkbench);

    expect(result.warnings).toEqual([
      'CURRENT_DATE is frozen at the time this result was computed, not "live".',
    ]);
  });

  it('returns an empty warnings array when submit reports none', async () => {
    const queryWorkbench = fakeQueryWorkbench([
      { status: QueryStatusValue.SUCCEEDED, columns: [], rows: [] },
    ]);

    const result = await runSqlAndCollectRows('select 1', queryWorkbench);

    expect(result.warnings).toEqual([]);
  });
});
