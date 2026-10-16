'use client';

import { useMemo, useState } from 'react';
import { ChartColumnIcon, PanelRightOpenIcon, Table2Icon } from 'lucide-react';

import { IconButton } from '@/app/_components/ui/icon-button';
import { ToggleGroup, ToggleGroupItem } from '@/app/_components/ui/toggle-group';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import { ChartView } from '@/app/_components/shared/chart-view';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';
import {
  parseChatChartPreview,
  type ChatChartPreview,
} from '@/src/entities/models/chat-chart-preview';

import { CHART_CARD_HEADER_CLASS, CHART_CARD_PLOT_CLASS } from './chart-card-skeleton';

interface InlineChartPreviewProps {
  readonly payload: Record<string, unknown>;
  readonly fallbackText: string;
  readonly renderer: ChartRenderer;
  /** The block this card draws, so the stage can scroll the transcript to it. */
  readonly blockId?: string;
  /** Opens the chart's tab on the stage; absent on a surface with no stage. */
  readonly onOpen?: () => void;
  /** Whether the chart currently has a tab on the stage. */
  readonly open?: boolean;
}

/**
 * A chart the agent drew, in the transcript.
 *
 * It is the whole chart, not a one-line card that opens it: an answer that
 * says "revenue peaks in December" wants the line right there under the
 * sentence. The header keeps the chart's own controls together — the same
 * rows as a table, and a button for the stage when there is one — and holds
 * one height whether or not there is a description, so the skeleton that
 * stands in for the card while the query runs is the same size. Keeping the
 * chart is the stage's job: the card is for reading, the tab is for acting.
 */
export function InlineChartPreview({
  payload,
  fallbackText,
  renderer,
  blockId,
  onOpen,
  open = false,
}: InlineChartPreviewProps) {
  const { t } = useTranslation();
  const preview = useMemo(() => {
    try {
      return parseChatChartPreview(payload);
    } catch {
      return null;
    }
  }, [payload]);

  const view = useMemo(
    () =>
      preview === null
        ? null
        : renderer.compile(preview.visualizationDefinition, preview.outputSchema, preview.rows),
    [preview, renderer],
  );

  const [mode, setMode] = useState<'chart' | 'table'>('chart');

  if (!preview) {
    return <p className="text-body-sm text-muted-foreground italic">{fallbackText}</p>;
  }

  const empty = preview.rows.length === 0;
  const drawable = view !== null && !empty;

  return (
    <article
      data-slot="chat-chart-card"
      data-block-id={blockId}
      className={cn(
        /* `scroll-mt-24` clears the chrome floating over the transcript when
           the stage scrolls this card to the top. */
        'min-w-0 w-full scroll-mt-24 overflow-hidden rounded-xl border bg-card shadow-sm transition-colors',
        open ? 'border-primary/40' : 'border-border',
      )}
    >
      <header
        className={cn(
          'flex items-start justify-between gap-3 border-b border-border px-4 py-3',
          CHART_CARD_HEADER_CLASS,
        )}
      >
        <div className="min-w-0 flex-1">
          <h3 className="m-0 truncate text-body-sm font-semibold text-foreground">
            {preview.title}
          </h3>
          {preview.description ? (
            <p className="m-0 mt-1 truncate text-caption text-muted-foreground">
              {preview.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {drawable ? (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={mode}
              onValueChange={(next) => {
                if (next === 'chart' || next === 'table') setMode(next);
              }}
              aria-label={t('chat.chart.view')}
            >
              <ToggleGroupItem value="chart" aria-label={t('chat.chart.view.chart')}>
                <ChartColumnIcon aria-hidden="true" />
              </ToggleGroupItem>
              <ToggleGroupItem value="table" aria-label={t('chat.chart.view.table')}>
                <Table2Icon aria-hidden="true" />
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          {onOpen ? (
            <IconButton label={t('chat.chart.openInPanel')} onClick={onOpen} size="sm">
              <PanelRightOpenIcon />
            </IconButton>
          ) : null}
        </div>
      </header>

      <div className="p-4">
        {empty ? (
          /* An empty plot reads as a broken one; the box keeps its size and
             says what happened instead. */
          <p
            role="status"
            className={cn(
              'm-0 flex w-full items-center justify-center rounded-md border border-dashed border-border text-body-sm text-muted-foreground',
              CHART_CARD_PLOT_CLASS,
            )}
          >
            {t('chat.artifact.empty')}
          </p>
        ) : mode === 'chart' && view !== null ? (
          <div className={cn('min-w-0 w-full overflow-hidden', CHART_CARD_PLOT_CLASS)}>
            <ChartView ariaLabel={preview.title} view={view} />
          </div>
        ) : preview.visualizationDefinition.type === 'NUMBER' ? (
          <PreviewNumber preview={preview} />
        ) : (
          <PreviewTable preview={preview} />
        )}
      </div>

      {preview.truncated ? (
        <p className="m-0 border-t border-border px-4 py-2 text-caption text-status-warning-dark dark:text-status-warning">
          {t('chat.chart.limitReached')}
        </p>
      ) : null}
      {preview.displayTruncated ? (
        <p className="m-0 border-t border-border px-4 py-2 text-caption text-muted-foreground">
          {t('chat.chart.partialDisplay')}
        </p>
      ) : null}
    </article>
  );
}

/** The same rows the chart was drawn from, at the plot's height so the card does not resize. */
function PreviewTable({ preview }: { readonly preview: ChatChartPreview }) {
  return (
    <div
      className={cn('w-full overflow-auto rounded-md border border-border', CHART_CARD_PLOT_CLASS)}
    >
      <table className="w-full border-collapse text-caption">
        <thead className="sticky top-0 bg-muted">
          <tr>
            {preview.outputSchema.map((column) => (
              <th
                key={column.name}
                className="border-b border-border px-3 py-2 text-left font-medium text-muted-foreground"
              >
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, index) => (
            <tr key={index} className="border-b border-border last:border-b-0">
              {row.map((value, valueIndex) => (
                <td key={valueIndex} className="px-3 py-1.5 text-foreground tabular-nums">
                  {value === null ? '—' : String(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewNumber({ preview }: { readonly preview: ChatChartPreview }) {
  const definition = preview.visualizationDefinition;
  if (definition.type !== 'NUMBER') return null;
  const measure = definition.roles.measure;
  const index = preview.outputSchema.findIndex((column) => column.name === measure);
  const value = preview.rows[0]?.[index] ?? '—';
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center rounded-md border border-border',
        CHART_CARD_PLOT_CLASS,
      )}
    >
      <p className="m-0 text-title font-semibold text-foreground">{String(value)}</p>
      <p className="m-0 mt-2 text-body-sm text-muted-foreground">{measure}</p>
    </div>
  );
}
