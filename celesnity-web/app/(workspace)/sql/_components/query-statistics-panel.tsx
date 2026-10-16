'use client';

import type { QueryStatistics } from '@/src/entities/models/query';
import { formatBytes, formatDuration, formatInteger } from './format';

interface QueryStatisticsPanelProps {
  readonly statistics?: QueryStatistics;
}

interface Metric {
  readonly label: string;
  readonly value: string;
}

export function QueryStatisticsPanel({ statistics }: QueryStatisticsPanelProps) {
  const metrics = statistics ? buildMetrics(statistics) : [];

  return (
    <section
      className="rounded-xl border border-border bg-card px-5 py-[18px]"
      aria-labelledby="query-stats-heading"
    >
      <div className="mb-[14px] flex items-center justify-between gap-[14px]">
        <h3 className="m-0 text-body-lg font-medium tracking-[-0.02em]" id="query-stats-heading">
          Query statistics
        </h3>
        {statistics?.progressPercentage !== undefined ? (
          <span className="rounded-full bg-accent px-[9px] py-1 text-caption font-semibold text-primary">
            {Math.round(clampProgress(statistics.progressPercentage))}%
          </span>
        ) : null}
      </div>

      {statistics?.progressPercentage !== undefined ? (
        <div
          className="mb-4 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(clampProgress(statistics.progressPercentage))}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-[240ms] ease-[ease]"
            style={{ width: `${clampProgress(statistics.progressPercentage)}%` }}
          />
        </div>
      ) : null}

      {metrics.length > 0 ? (
        <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-[18px] gap-y-[14px]">
          {metrics.map((metric) => (
            <div className="min-w-0" key={metric.label}>
              <dt className="mb-[3px] text-micro font-[750] tracking-[0.05em] text-muted-foreground uppercase">
                {metric.label}
              </dt>
              <dd className="m-0 overflow-hidden text-body-sm font-[650] text-ellipsis whitespace-nowrap text-foreground">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="my-2 text-caption leading-[1.55] text-muted-foreground">
          Statistics appear once Trino begins executing the query.
        </p>
      )}
    </section>
  );
}

function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function buildMetrics(statistics: QueryStatistics): readonly Metric[] {
  const metrics: Metric[] = [];

  if (statistics.state) {
    metrics.push({ label: 'State', value: statistics.state });
  }
  if (statistics.elapsedTimeMillis !== undefined) {
    metrics.push({ label: 'Elapsed', value: formatDuration(statistics.elapsedTimeMillis) });
  }
  if (statistics.queuedTimeMillis !== undefined) {
    metrics.push({ label: 'Queued', value: formatDuration(statistics.queuedTimeMillis) });
  }
  if (statistics.cpuTimeMillis !== undefined) {
    metrics.push({ label: 'CPU time', value: formatDuration(statistics.cpuTimeMillis) });
  }
  if (statistics.processedRows !== undefined) {
    metrics.push({ label: 'Processed rows', value: formatInteger(statistics.processedRows) });
  }
  if (statistics.processedBytes !== undefined) {
    metrics.push({ label: 'Processed', value: formatBytes(statistics.processedBytes) });
  }
  if (statistics.peakMemoryBytes !== undefined) {
    metrics.push({ label: 'Peak memory', value: formatBytes(statistics.peakMemoryBytes) });
  }
  if (statistics.totalSplits !== undefined) {
    const splits =
      statistics.completedSplits !== undefined
        ? `${formatInteger(statistics.completedSplits)} / ${formatInteger(statistics.totalSplits)}`
        : formatInteger(statistics.totalSplits);
    metrics.push({ label: 'Splits', value: splits });
  }

  return metrics;
}
