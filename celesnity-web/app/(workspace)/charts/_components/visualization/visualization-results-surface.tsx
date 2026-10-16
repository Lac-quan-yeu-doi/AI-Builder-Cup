'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Code2Icon,
  FilterIcon,
  PencilIcon,
  RefreshCwIcon,
  SaveIcon,
  Settings2Icon,
  SigmaIcon,
} from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import type {
  ChartDraft,
  OutputColumn,
  ParameterValue,
  VisualizationDefinition,
  VisualizationType,
} from '@/src/entities/models/canonical-chart';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';

import type { ChartPreviewStatus as BuilderPreviewStatus } from '../chart-builder-state';
import { ChartRenderPreview } from '../preview/chart-preview-pane';
import {
  VisualizationSettingsPanel,
  type VisualizationSettingsTab,
} from './visualization-settings-panel';
import { transitionVisualizationType } from './visualization-type-transition';
import { proposeVisualizationType } from './visualization-shape';
import { VisualizationTypePicker } from './visualization-type-picker';

export interface VisualizationResultsSurfaceProps {
  readonly draft: ChartDraft;
  readonly fields?: readonly OutputColumn[];
  readonly rows: readonly (readonly ParameterValue[])[];
  readonly status: BuilderPreviewStatus;
  readonly renderer: ChartRenderer;
  readonly error?: string | null;
  readonly canSave?: boolean;
  readonly saving?: boolean;
  readonly onDefinitionChange: (definition: VisualizationDefinition) => void;
  readonly onEdit: () => void;
  readonly onRefresh: () => void;
  readonly onSave: () => void;
  readonly onViewSql?: () => void;
  readonly onFilter?: () => void;
  readonly onSummarize?: () => void;
}

/** Results-mode workspace: canvas first, with Metabase-style configuration controls. */
export function VisualizationResultsSurface({
  draft,
  fields,
  rows,
  status,
  renderer,
  error,
  canSave = false,
  saving = false,
  onDefinitionChange,
  onEdit,
  onRefresh,
  onSave,
  onViewSql,
  onFilter,
  onSummarize,
}: VisualizationResultsSurfaceProps) {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<VisualizationSettingsTab>('DATA');
  const fieldNames = useMemo(
    () => (fields ?? draft.outputSchema).map((column) => column.name),
    [draft.outputSchema, fields],
  );
  const hasRows = rows.length > 0;
  const showRows =
    status === 'SUCCEEDED' || status === 'STALE' || (status === 'RUNNING' && hasRows);
  const displayDraft = useMemo(
    () => ({ ...draft, visualizationDefinition: draft.visualizationDefinition }),
    [draft],
  );

  /**
   * Open on a shape that fits the result.
   *
   * Every query used to land on a table no matter what came back, and the only
   * route to a chart was a pill at the bottom of the page. This proposes once —
   * on the first result of a draft — and never again, so an explicit choice is
   * never overwritten by the next refresh.
   */
  const proposedFor = useRef<string | null>(null);
  const resultColumns = fields ?? draft.outputSchema;
  useEffect(() => {
    if (!showRows || resultColumns.length === 0) return;
    const signature = resultColumns.map((column) => `${column.name}:${column.family}`).join('|');
    if (proposedFor.current === signature) return;
    proposedFor.current = signature;
    if (draft.visualizationDefinition.type !== 'TABLE') return;
    const proposed = proposeVisualizationType(resultColumns);
    if (proposed === 'TABLE') return;
    onDefinitionChange(
      transitionVisualizationType(
        draft.visualizationDefinition,
        proposed,
        resultColumns.map((column) => column.name),
        visualizationRoleHints(draft),
      ),
    );
    // `draft` and `onDefinitionChange` are intentionally absent: this reacts to
    // a new result shape, not to the user editing the definition it produced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRows, resultColumns]);

  function chooseType(nextType: VisualizationType): void {
    onDefinitionChange(
      transitionVisualizationType(
        draft.visualizationDefinition,
        nextType,
        fieldNames,
        visualizationRoleHints(draft),
      ),
    );
    setSettingsOpen(true);
    setActiveTab('DATA');
  }

  return (
    <main
      className="flex h-full min-h-0 min-w-0 flex-col bg-background"
      aria-label="Visualization result"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-3 lg:px-8">
        <div className="min-w-0">
          <h1 className="truncate text-title">{draft.title || 'Untitled chart'}</h1>
          <p className="truncate text-caption text-muted-foreground">
            {draft.queryDefinition.context.catalog} / {draft.queryDefinition.context.schema}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onFilter ? (
            <Button type="button" variant="outline" size="sm" onClick={onFilter}>
              <FilterIcon aria-hidden="true" /> Filter
            </Button>
          ) : null}
          {onSummarize ? (
            <Button type="button" variant="outline" size="sm" onClick={onSummarize}>
              <SigmaIcon aria-hidden="true" /> Summarize
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <PencilIcon aria-hidden="true" /> Editor
          </Button>
          {onViewSql ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="View SQL"
              onClick={onViewSql}
            >
              <Code2Icon aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Refresh"
            onClick={onRefresh}
            disabled={status === 'RUNNING'}
          >
            <RefreshCwIcon
              aria-hidden="true"
              className={status === 'RUNNING' ? 'animate-spin' : undefined}
            />
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={!canSave || saving}>
            <SaveIcon aria-hidden="true" /> {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {settingsOpen ? (
          <VisualizationSettingsPanel
            open
            activeTab={activeTab}
            definition={draft.visualizationDefinition}
            fields={fields ?? draft.outputSchema}
            onTabChange={setActiveTab}
            onClose={() => setSettingsOpen(false)}
            onChange={onDefinitionChange}
            typePicker={
              <VisualizationTypePicker
                type={draft.visualizationDefinition.type}
                columns={fields ?? draft.outputSchema}
                onChange={onDefinitionChange}
                onTypeChange={chooseType}
                compact
              />
            }
          />
        ) : null}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Chart canvas">
          <div className="min-h-0 flex-1 overflow-auto p-4 lg:p-8">
            {status === 'STALE' ? (
              <p
                className="mb-3 rounded-md bg-status-warning-light px-3 py-2 text-body-sm text-status-warning-dark"
                role="status"
              >
                {error
                  ? 'Showing the last successful preview. Refresh failed.'
                  : 'Visualization changed. Refresh to update the preview.'}
              </p>
            ) : null}
            {status === 'FAILED' ? (
              <p
                className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-body-sm text-destructive"
                role="alert"
              >
                {error || 'Preview failed. Fix the query and run it again.'}
              </p>
            ) : null}
            {showRows ? (
              <>
                <ChartRenderPreview draft={displayDraft} rows={rows} renderer={renderer} />
                {draft.visualizationDefinition.type === 'TABLE' ? (
                  <ResultTable columns={draft.outputSchema} rows={rows} />
                ) : null}
              </>
            ) : (
              <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-border text-body-sm text-muted-foreground">
                {status === 'RUNNING'
                  ? 'Refreshing preview…'
                  : 'Run the query to render this visualization.'}
              </div>
            )}
          </div>
          {settingsOpen ? null : (
            <footer className="flex shrink-0 items-center justify-start border-t border-border bg-card px-5 py-2 lg:px-8">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2Icon aria-hidden="true" /> {t('viz.chartType')}
              </Button>
            </footer>
          )}
        </section>
      </div>
    </main>
  );
}

function visualizationRoleHints(draft: ChartDraft): {
  readonly categories: readonly string[];
  readonly measures: readonly string[];
} {
  const query = draft.queryDefinition;
  if (query.mode !== 'VISUAL') return { categories: [], measures: [] };
  return {
    categories: query.breakouts.flatMap((breakout) =>
      breakout.kind === 'FIELD' ? [breakout.field] : [],
    ),
    measures: query.aggregations.map((aggregation) => aggregation.alias),
  };
}

/**
 * The raw rows under the chart.
 *
 * Numerals are right-aligned and tabular so magnitudes line up on the decimal
 * point, which is the whole reason to look at the grid rather than the chart.
 * The header carries the column's type, which the result has always known.
 */
/** `TIMESTAMP WITH TIME ZONE` is wider than the column it describes; the head
 * word carries the same information at a glance and the full type stays in the
 * tooltip. */
function shortType(type: string): string {
  return type.split(/[\s(]/u)[0] ?? type;
}

function ResultTable({
  columns,
  rows,
}: {
  readonly columns: readonly OutputColumn[];
  readonly rows: readonly (readonly ParameterValue[])[];
}) {
  return (
    <div className="mt-4 overflow-auto rounded-lg border border-border">
      <table className="w-full text-body-sm">
        <thead className="sticky top-0 bg-card">
          <tr>
            {columns.map((column) => (
              <th
                key={column.name}
                scope="col"
                className={cn(
                  'border-b border-border px-3 py-2 font-medium whitespace-nowrap',
                  column.family === 'NUMBER' ? 'text-right' : 'text-left',
                )}
              >
                {column.name}
                <span
                  className="ml-2 text-micro font-normal text-muted-foreground uppercase"
                  title={column.type}
                >
                  {shortType(column.type)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-muted/50">
              {row.map((value, columnIndex) => (
                <td
                  key={columnIndex}
                  className={cn(
                    'border-b border-border px-3 py-2',
                    columns[columnIndex]?.family === 'NUMBER'
                      ? 'text-right tabular-nums'
                      : 'text-left',
                  )}
                >
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
