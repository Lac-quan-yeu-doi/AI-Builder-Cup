import type { CompiledChartQuery } from '@application/chart/query/compiled-chart-query';
import type { QueryContext, QueryParameter } from '@domain/chart/models/query-definition';

export interface INativeChartQueryPolicy {
  validateAndCompile(
    sql: string,
    context: QueryContext,
    parameters?: readonly QueryParameter[],
    values?: Readonly<Record<string, unknown>>,
  ): Promise<CompiledChartQuery>;
}
