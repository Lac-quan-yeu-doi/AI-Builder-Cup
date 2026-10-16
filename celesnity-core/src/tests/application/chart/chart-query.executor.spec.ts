import { ChartQueryExecutor } from '@application/chart/chart-query.executor';

describe('ChartQueryExecutor', () => {
  it('does not expose a durable result store dependency', () => {
    expect(Object.keys(new ChartQueryExecutor({} as never))).not.toContain('resultStore');
  });
});
