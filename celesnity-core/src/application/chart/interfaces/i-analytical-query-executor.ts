import type { CompiledChartQuery } from '@application/chart/query/compiled-chart-query';
import type { ChartRunEvent, ChartRunLimits } from '@application/chart/chart-query.executor';

/** Outbound port for bounded, non-persisting analytical chart execution. */
export interface IAnalyticalQueryExecutor {
  execute(
    compiled: CompiledChartQuery,
    limits: ChartRunLimits,
    signal: AbortSignal,
    runId?: string,
  ): AsyncIterable<ChartRunEvent>;
}
