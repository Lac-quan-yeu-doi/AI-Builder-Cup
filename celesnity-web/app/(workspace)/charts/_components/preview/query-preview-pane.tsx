'use client';

import type { ActiveChartResult } from '@/src/entities/models/canonical-chart';

import { Button } from '@/app/_components/ui/button';
import type { ChartPreviewStatus } from '../chart-builder-state';

export interface QueryPreviewPaneProps {
  readonly status: ChartPreviewStatus;
  readonly preview: ActiveChartResult | null;
  readonly durationMs?: number | null;
  readonly error?: string | null;
  readonly onRetry?: () => void;
}

/** A transient, table-only preview of query output. Chart rendering belongs to Visualize. */
export function QueryPreviewPane({
  status,
  preview,
  durationMs = null,
  error = null,
  onRetry,
}: QueryPreviewPaneProps) {
  const hasPreview = preview !== null;
  const showRows =
    hasPreview && (status === 'SUCCEEDED' || status === 'STALE' || status === 'RUNNING');
  return (
    <section
      className="border-t border-border bg-background px-0 py-5"
      aria-label="Query result preview"
      role="region"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-body-lg font-semibold">Query result preview</h2>
          <p className="text-caption text-muted-foreground">
            {preview
              ? `${preview.rowCount} rows${preview.truncated ? ' (truncated)' : ''}. `
              : 'No query result yet. '}
            Preview data is not saved.
            {durationMs !== null ? ` Client elapsed: ${durationMs} ms` : ''}
          </p>
        </div>
        {status === 'STALE' ? (
          <span className="rounded-full bg-status-warning/15 px-2 py-1 text-caption text-status-warning-dark">
            Stale
          </span>
        ) : null}
        {status === 'RUNNING' ? (
          <span
            className="rounded-full bg-muted px-2 py-1 text-caption text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            Refreshing…
          </span>
        ) : null}
        {status === 'FAILED' ? (
          <span className="rounded-full bg-destructive/10 px-2 py-1 text-caption text-destructive">
            Failed
          </span>
        ) : null}
      </div>
      {status === 'STALE' && preview ? (
        <p className="mb-3 text-body-sm text-status-warning-dark" role="status">
          Showing the last successful query result. Refresh failed.
        </p>
      ) : null}
      {status === 'STALE' && !preview ? (
        <p className="mb-3 text-body-sm text-status-warning-dark" role="status">
          The query changed before a result was available. Run preview to validate it.
        </p>
      ) : null}
      {status === 'FAILED' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-3">
          <p className="text-body-sm text-destructive" role="alert">
            {error || 'Preview failed. Fix the query and run it again.'}
          </p>
          {onRetry ? (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : showRows && preview ? (
        <div className="max-h-90 overflow-auto rounded-md border border-border bg-card">
          <table className="min-w-max border-collapse text-body-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
              <tr>
                {preview.columns.map((column) => (
                  <th
                    className="border-b border-border px-3 py-2 text-left font-semibold"
                    key={column.name}
                  >
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, rowIndex) => (
                <tr className="hover:bg-muted/35" key={rowIndex}>
                  {preview.columns.map((column, columnIndex) => (
                    <td className="border-b border-border/70 px-3 py-2" key={column.name}>
                      {String(row[columnIndex] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border px-4 py-5 text-body-sm text-muted-foreground">
          {status === 'RUNNING'
            ? 'Running the query…'
            : 'Run preview to load the query result table.'}
        </div>
      )}
      {status === 'STALE' && onRetry ? (
        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>
          Retry preview
        </Button>
      ) : null}
    </section>
  );
}
