'use client';

import { useMemo } from 'react';

import type { ChartRenderer } from '@/src/entities/models/chart-renderer';
import type { ChartDraft } from '@/src/entities/models/canonical-chart';
import { cn } from '@/app/_components/ui/utils';
import { ChartView } from './chart-view';

export type SharedChartPreviewStatus = 'EMPTY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'STALE';

export interface ChartPreviewPaneProps {
  readonly status: SharedChartPreviewStatus;
  readonly draft: ChartDraft;
  readonly rows: readonly (readonly (string | number | boolean | null)[])[];
  readonly renderer: ChartRenderer;
}

/** Transient result pane shared by chart authoring and inline chat previews. */
export function ChartPreviewPane({ status, draft, rows, renderer }: ChartPreviewPaneProps) {
  const hasRows = rows.length > 0;
  const showRows =
    status === 'SUCCEEDED' || status === 'STALE' || (status === 'RUNNING' && hasRows);

  return (
    <section
      className="break-inside-avoid min-w-0 w-full bg-background p-4 min-[1081px]:p-8"
      aria-label="Preview pane"
      role="region"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Preview</h2>
        {status === 'STALE' ? (
          <span className="rounded-full bg-status-warning/15 px-2 py-1 text-xs text-status-warning-dark dark:text-status-warning">
            Stale
          </span>
        ) : null}
        {status === 'RUNNING' ? (
          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
            Refreshing…
          </span>
        ) : null}
      </div>
      {status === 'STALE' ? (
        <p className="mt-3 text-sm text-status-warning-dark dark:text-status-warning" role="status">
          Showing the last successful preview. Refresh failed.
        </p>
      ) : null}
      {showRows ? (
        <>
          <ChartRenderPreview draft={draft} rows={rows} renderer={renderer} />
          <PreviewRows draft={draft} rows={rows} />
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {status === 'FAILED'
            ? 'Preview failed. Fix the query and run it again.'
            : 'Run the query to load transient data and render the selected chart. No preview data is persisted.'}
        </p>
      )}
    </section>
  );
}

function PreviewRows({
  draft,
  rows,
}: {
  readonly draft: ChartDraft;
  readonly rows: readonly (readonly (string | number | boolean | null)[])[];
}) {
  return (
    <div className="mt-4 overflow-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {draft.outputSchema.map((column) => (
              <th className="border-b border-border p-2 text-left font-medium" key={column.name}>
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((value, valueIndex) => (
                <td className="border-b border-border p-2" key={valueIndex}>
                  {String(value ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renders a NUMBER card's value the way its definition asks.
 *
 * Trino hands back `decimal(38,16)` for anything divided, so an unformatted
 * percentage arrives as `71.4753243744207600`. The definition already carries
 * `decimalPlaces`, a `prefix`/`suffix` and a compact flag — this reads them
 * instead of printing the raw string, and falls back to a sane four places so a
 * chart authored without display settings is still legible.
 */
function formatMeasure(
  value: unknown,
  display:
    | {
        readonly decimalPlaces?: number;
        readonly compact?: boolean;
        readonly prefix?: string;
        readonly suffix?: string;
        readonly valueFormatting?: {
          readonly decimalPlaces?: number;
          readonly compact?: boolean;
          readonly prefix?: string;
          readonly suffix?: string;
        };
      }
    | undefined,
): string {
  if (value === null || value === undefined) return '\u2014';
  const settings = { ...display?.valueFormatting, ...display };
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  const decimals = Math.min(settings.decimalPlaces ?? 4, 4);
  const formatted = new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    ...(settings.compact === true ? { notation: 'compact' as const } : {}),
  }).format(numeric);
  return `${settings.prefix ?? ''}${formatted}${settings.suffix ?? ''}`;
}

export function ChartRenderPreview({
  draft,
  rows,
  renderer,
  fill = false,
}: {
  readonly draft: ChartDraft;
  readonly rows: readonly (readonly (string | number | boolean | null)[])[];
  readonly renderer: ChartRenderer;
  /**
   * Take the height of the container instead of asserting a 256px minimum.
   * A dashboard card is sized by its own grid geometry — a six-row card is
   * 240px, so the minimum overflowed it and `overflow-hidden` cut the axis off.
   */
  readonly fill?: boolean;
}) {
  const view = useMemo(
    () => renderer.compile(draft.visualizationDefinition, draft.outputSchema, rows),
    [draft.outputSchema, draft.visualizationDefinition, renderer, rows],
  );

  if (draft.visualizationDefinition.type === 'NUMBER') {
    const { roles, display } = draft.visualizationDefinition;
    const measure = roles.measure;
    const index = draft.outputSchema.findIndex((column) => column.name === measure);
    const value = rows[0]?.[index];
    return (
      <div
        className={cn(
          'rounded-lg border border-border bg-card p-6 text-center',
          fill ? 'flex h-full flex-col items-center justify-center' : 'my-4',
        )}
      >
        <p className="text-4xl font-semibold tabular-nums">{formatMeasure(value, display)}</p>
        <p className="mt-2 text-sm text-muted-foreground">{measure || 'Choose a measure'}</p>
      </div>
    );
  }
  if (draft.visualizationDefinition.type === 'TABLE' || !view) return null;
  return (
    <div
      className={cn(
        'min-w-0 w-full max-w-full overflow-hidden rounded-lg border border-border bg-card p-2',
        fill ? 'h-full min-h-0' : 'my-4 min-h-64',
      )}
    >
      <ChartView
        view={view}
        fill={fill}
        ariaLabel={`${draft.visualizationDefinition.type} chart preview`}
      />
    </div>
  );
}
