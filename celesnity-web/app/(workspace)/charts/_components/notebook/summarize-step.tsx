'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PlusIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import type { QueryExpression, VisualQueryDefinition } from '@/src/entities/models/canonical-chart';
import {
  presentFieldGroups,
  type FieldGroupViewModel,
  type FieldOptionViewModel,
  type RelationMetadataMap,
} from '@/src/interface-adapters/presenters/chart-builder-field.presenter';

import { expressionText } from '../chart-builder-query';
import { ClauseChip } from '../ui/clause-chip';
import { NotebookPreviewButton } from '../ui/notebook-preview-button';
import { NotebookStepBand } from '../ui/notebook-step-band';
import { GroupedFieldPicker } from './grouped-field-picker';
import { MeasureEditor, measureDraftFromAggregation } from './measure-editor';

export interface SummarizeStepProps {
  readonly query: VisualQueryDefinition;
  readonly relations: RelationMetadataMap;
  readonly onChange: (query: VisualQueryDefinition) => void;
  readonly onPreviewStep?: () => void;
  readonly previewDisabled?: boolean;
}

type Editor =
  | { readonly kind: 'MEASURE'; readonly index: number | null }
  | { readonly kind: 'BREAKOUT'; readonly index: number | null }
  | null;

/** Metabase-style summarize step with independent measure and breakout transactions. */
export function SummarizeStep({
  query,
  relations,
  onChange,
  onPreviewStep,
  previewDisabled = false,
}: SummarizeStepProps) {
  const fieldGroups = useMemo(
    () => presentFieldGroups({ query, relations, scope: { kind: 'QUERY_VISIBLE' } }),
    [query, relations],
  );
  const [editor, setEditor] = useState<Editor>(null);
  const editorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!editor) return;
    function dismissOutside(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node) || editorRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-slot="popover-content"]')) return;
      setEditor(null);
    }
    function dismissOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setEditor(null);
    }
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [editor]);

  function openMeasure(index: number | null): void {
    setEditor({ kind: 'MEASURE', index });
  }

  function confirmMeasure(aggregation: VisualQueryDefinition['aggregations'][number]): void {
    if (!editor || editor.kind !== 'MEASURE') return;
    const nextAggregations = [...query.aggregations];
    if (editor.index === null) nextAggregations.push(aggregation);
    else nextAggregations[editor.index] = aggregation;
    onChange({ ...query, aggregations: nextAggregations });
    setEditor(null);
  }

  function openBreakout(index: number | null): void {
    setEditor({ kind: 'BREAKOUT', index });
  }

  function selectBreakout(field: FieldOptionViewModel): void {
    if (!editor || editor.kind !== 'BREAKOUT') return;
    const isDuplicate = query.breakouts.some(
      (item, itemIndex) =>
        itemIndex !== editor.index &&
        item.kind === 'FIELD' &&
        item.relation === field.relation &&
        item.field === field.name,
    );
    if (isDuplicate) return;
    const nextBreakouts = [...query.breakouts];
    const nextExpression: QueryExpression = {
      kind: 'FIELD',
      relation: field.relation,
      field: field.name,
    };
    if (editor.index === null) nextBreakouts.push(nextExpression);
    else nextBreakouts[editor.index] = nextExpression;
    onChange({ ...query, breakouts: nextBreakouts });
    setEditor(null);
  }

  return (
    <section ref={editorRef} className="space-y-2" aria-label="Summarize step" role="region">
      <NotebookStepBand
        tone="SUMMARIZE"
        label="Summarize"
        surface="CLEAR"
        action={
          onPreviewStep ? (
            <NotebookPreviewButton
              label="Summarize"
              onClick={onPreviewStep}
              disabled={previewDisabled}
            />
          ) : null
        }
      >
        <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
          <div
            data-testid="measure-band"
            className="flex min-h-18 min-w-0 flex-wrap items-center gap-2 rounded-md bg-muted p-4"
          >
            {query.aggregations.map((aggregation, index) => (
              <ClauseChip
                key={`${aggregation.alias}-${index}`}
                tone="SUMMARIZE"
                ariaLabel={`Measure ${index + 1}`}
                onEdit={() => openMeasure(index)}
                onRemove={() =>
                  onChange({
                    ...query,
                    aggregations: query.aggregations.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
              >
                {aggregationLabel(aggregation)}
              </ClauseChip>
            ))}
            {!query.aggregations.length && editor === null ? (
              <Button
                type="button"
                variant="outline"
                className="border-border bg-card/60 text-foreground"
                onClick={() => openMeasure(null)}
              >
                Pick a function or metric
              </Button>
            ) : null}
            {query.aggregations.length ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Add measure"
                onClick={() => openMeasure(null)}
              >
                <PlusIcon aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <span className="flex items-center justify-center px-1 text-body-sm font-semibold text-foreground">
            by
          </span>
          <div
            data-testid="breakout-band"
            className="flex min-h-18 min-w-0 flex-wrap items-center gap-2 rounded-md bg-muted p-4"
          >
            {query.breakouts.map((item, index) => (
              <ClauseChip
                key={`breakout-${expressionText(item)}-${index}`}
                tone="SUMMARIZE"
                ariaLabel={`Breakout ${index + 1}`}
                onEdit={() => openBreakout(index)}
                onRemove={() =>
                  onChange({
                    ...query,
                    breakouts: query.breakouts.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
              >
                {fieldLabel(item, fieldGroups)}
              </ClauseChip>
            ))}
            {!query.breakouts.length && editor === null ? (
              <Button
                type="button"
                variant="outline"
                className="border-border bg-card/60 text-foreground"
                onClick={() => openBreakout(null)}
              >
                Pick a column to group by
              </Button>
            ) : null}
            {query.breakouts.length ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Add breakout"
                onClick={() => openBreakout(null)}
              >
                <PlusIcon aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>

        {editor?.kind === 'MEASURE' ? (
          <MeasureEditor
            key={`measure-${editor.index ?? 'new'}`}
            editorId="summarize-measure"
            groups={fieldGroups}
            initialDraft={
              editor.index === null
                ? undefined
                : measureDraftFromAggregation(query.aggregations[editor.index]!, fieldGroups)
            }
            onConfirm={confirmMeasure}
            onCancel={() => setEditor(null)}
            confirmLabel={editor.index === null ? 'Add measure' : 'Update measure'}
          />
        ) : null}

        {editor?.kind === 'BREAKOUT' ? (
          <BreakoutEditor
            editorId="summarize-breakout"
            groups={fieldGroups}
            initialField={
              editor.index === null
                ? null
                : fieldOptionForExpression(query.breakouts[editor.index], fieldGroups)
            }
            selectedIds={query.breakouts
              .filter((_, itemIndex) => itemIndex !== editor.index)
              .map((item) => (item.kind === 'FIELD' ? `${item.relation}.${item.field}` : ''))}
            onSelect={selectBreakout}
            onCancel={() => setEditor(null)}
          />
        ) : null}
      </NotebookStepBand>
    </section>
  );
}

function BreakoutEditor({
  editorId,
  groups,
  initialField,
  selectedIds,
  onSelect,
  onCancel,
}: {
  readonly editorId: string;
  readonly groups: readonly FieldGroupViewModel[];
  readonly initialField: FieldOptionViewModel | null;
  readonly selectedIds: readonly string[];
  readonly onSelect: (field: FieldOptionViewModel) => void;
  readonly onCancel: () => void;
}) {
  return (
    <div
      data-testid="breakout-editor"
      className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card/80 p-3"
    >
      <p className="text-body-sm font-medium text-foreground">Pick a column to group by</p>
      <div className="flex items-center gap-2">
        <GroupedFieldPicker
          editorId={`${editorId}-field`}
          ariaLabel="Breakout field picker"
          groups={groups}
          defaultOpen
          selectedIds={selectedIds}
          trigger={
            <Button type="button" variant="outline" aria-label="Breakout field">
              {initialField?.label ?? 'Choose a field'}
            </Button>
          }
          onSelect={onSelect}
        />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function aggregationLabel(aggregation: VisualQueryDefinition['aggregations'][number]): string {
  const functionLabel = aggregation.function
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./u, (letter) => letter.toUpperCase());
  if (aggregation.function === 'COUNT' && aggregation.expression.kind === 'LITERAL') {
    return 'Count rows';
  }
  return aggregation.alias || functionLabel;
}

function fieldLabel(expression: QueryExpression, groups: readonly FieldGroupViewModel[]): string {
  if (expression.kind !== 'FIELD') return expressionText(expression);
  return (
    groups
      .flatMap((group) => group.fields)
      .find((field) => field.relation === expression.relation && field.name === expression.field)
      ?.label ?? expression.field
  );
}

function fieldOptionForExpression(
  expression: QueryExpression | undefined,
  groups: readonly FieldGroupViewModel[],
): FieldOptionViewModel | null {
  if (!expression || expression.kind !== 'FIELD') return null;
  return (
    groups
      .flatMap((group) => group.fields)
      .find((field) => field.relation === expression.relation && field.name === expression.field) ??
    null
  );
}
