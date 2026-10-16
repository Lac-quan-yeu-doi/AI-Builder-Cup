'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ChevronDownIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import type { VisualQueryDefinition } from '@/src/entities/models/canonical-chart';
import {
  fieldExpressionFromOption,
  type FieldGroupViewModel,
  type FieldOptionViewModel,
} from '@/src/interface-adapters/presenters/chart-builder-field.presenter';

import { GroupedFieldPicker } from './grouped-field-picker';
import { useNotebookEditor } from './notebook-editor-context';

export const aggregationFunctions = [
  'COUNT',
  'DISTINCT_COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
] as const;

export type AggregationFunction = (typeof aggregationFunctions)[number];

export interface MeasureDraft {
  readonly functionName: AggregationFunction;
  readonly field: FieldOptionViewModel | null;
  readonly alias: string;
  readonly countRows: boolean;
}

export interface MeasureEditorProps {
  readonly editorId: string;
  readonly groups: readonly FieldGroupViewModel[];
  readonly initialDraft?: MeasureDraft;
  readonly onConfirm: (aggregation: VisualQueryDefinition['aggregations'][number]) => void;
  readonly onCancel: () => void;
  readonly confirmLabel?: string;
}

type MeasureStage = 'FUNCTION' | 'FIELD' | 'CONFIGURE';

/** SUM and AVG are arithmetic; MIN and MAX order dates and text perfectly well,
 * and COUNT takes anything. Narrowing only the two that are genuinely numeric
 * keeps the picker honest without hiding a column someone needs. */
const numericOnlyFunctions = new Set<AggregationFunction>(['SUM', 'AVG']);

function fieldsFor(
  groups: readonly FieldGroupViewModel[],
  functionName: AggregationFunction,
): readonly FieldGroupViewModel[] {
  if (!numericOnlyFunctions.has(functionName)) return groups;
  const narrowed = groups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => field.family === 'NUMBER'),
    }))
    .filter((group) => group.fields.length > 0);
  // A source with no numeric column at all is better shown whole than empty:
  // an empty picker looks broken, a full one just looks wrong.
  return narrowed.length > 0 ? narrowed : groups;
}

const defaultDraft: MeasureDraft = {
  functionName: 'COUNT',
  field: null,
  alias: '',
  countRows: false,
};

/** Transactional, function-first editor shared by new and existing measures. */
export function MeasureEditor({
  editorId,
  groups,
  initialDraft = defaultDraft,
  onConfirm,
  onCancel,
  confirmLabel = 'Add measure',
}: MeasureEditorProps) {
  const [draft, setDraft] = useState<MeasureDraft>(initialDraft);
  const [stage, setStage] = useState<MeasureStage>(initialStage(initialDraft));
  const editorRef = useRef<HTMLDivElement>(null);
  const fieldPicker = useNotebookEditor(`${editorId}-field`);
  const pickerGroups = fieldsFor(groups, draft.functionName);

  useEffect(() => {
    function dismissOutside(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node) || editorRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-slot="popover-content"]')) return;
      onCancel();
    }
    function dismissOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [onCancel]);

  const selectedField = draft.field;
  const canConfirm = draft.countRows || Boolean(selectedField);

  function selectFunction(functionName: AggregationFunction, countRows = false): void {
    setDraft((current) => ({
      ...current,
      functionName,
      countRows,
      field: countRows ? null : current.field,
    }));
    if (countRows) {
      fieldPicker.setOpen(false);
      setStage('CONFIGURE');
      return;
    }
    setStage('FIELD');
    fieldPicker.setOpen(true);
  }

  function selectField(field: FieldOptionViewModel): void {
    setDraft((current) => ({ ...current, field, countRows: false }));
    setStage('CONFIGURE');
  }

  function confirm(): void {
    if (!canConfirm) return;
    const alias =
      draft.alias.trim() ||
      (draft.countRows
        ? 'count_rows'
        : `${draft.functionName.toLowerCase()}_${draft.field?.name ?? 'measure'}`);
    onConfirm({
      alias,
      function: draft.functionName,
      expression: draft.countRows
        ? { kind: 'LITERAL', valueType: 'NUMBER', value: 1 }
        : fieldExpressionFromOption(draft.field!),
    });
  }

  return (
    <div
      ref={editorRef}
      data-testid="measure-editor"
      className="mt-3 rounded-md border border-border bg-card/80 p-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      {stage === 'FUNCTION' ? (
        <div className="space-y-2">
          <p className="text-body-sm font-medium text-foreground">Choose a function or metric</p>
          <div className="grid gap-1 sm:grid-cols-2" role="listbox" aria-label="Measure functions">
            <FunctionOption
              label="Count rows"
              description="Count every row"
              selected={draft.countRows}
              onSelect={() => selectFunction('COUNT', true)}
            />
            <FunctionOption
              label="Count a field"
              description="Count non-empty values"
              selected={draft.functionName === 'COUNT' && !draft.countRows}
              onSelect={() => selectFunction('COUNT')}
            />
            <FunctionOption
              label="Distinct count"
              description="Count unique values"
              selected={draft.functionName === 'DISTINCT_COUNT'}
              onSelect={() => selectFunction('DISTINCT_COUNT')}
            />
            <FunctionOption
              label="Sum"
              description="Add numeric values"
              selected={draft.functionName === 'SUM'}
              onSelect={() => selectFunction('SUM')}
            />
            <FunctionOption
              label="Average"
              description="Average numeric values"
              selected={draft.functionName === 'AVG'}
              onSelect={() => selectFunction('AVG')}
            />
            <FunctionOption
              label="Minimum"
              description="Smallest value"
              selected={draft.functionName === 'MIN'}
              onSelect={() => selectFunction('MIN')}
            />
            <FunctionOption
              label="Maximum"
              description="Largest value"
              selected={draft.functionName === 'MAX'}
              onSelect={() => selectFunction('MAX')}
            />
          </div>
          <CancelButton onCancel={onCancel} />
        </div>
      ) : null}

      {stage === 'FIELD' ? (
        <div className="space-y-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Back to measure functions"
            onClick={() => {
              fieldPicker.setOpen(false);
              setStage('FUNCTION');
            }}
          >
            <ArrowLeftIcon aria-hidden="true" /> {aggregationFunctionLabel(draft.functionName)}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-label text-foreground">
              {numericOnlyFunctions.has(draft.functionName)
                ? 'Pick a numeric field to summarize'
                : 'Pick a field to summarize'}
            </p>
            <GroupedFieldPicker
              editorId={`${editorId}-field`}
              ariaLabel="Measure field picker"
              groups={pickerGroups}
              defaultOpen
              trigger={
                <Button type="button" variant="outline" aria-label="Measure field">
                  {selectedField?.label ?? 'Choose a field'}
                  <ChevronDownIcon aria-hidden="true" />
                </Button>
              }
              onSelect={selectField}
            />
          </div>
          <CancelButton onCancel={onCancel} />
        </div>
      ) : null}

      {stage === 'CONFIGURE' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Back to measure functions"
              onClick={() => {
                fieldPicker.setOpen(false);
                setStage('FUNCTION');
              }}
            >
              <ArrowLeftIcon aria-hidden="true" /> {measureDescription(draft)}
            </Button>
            {!draft.countRows ? (
              <GroupedFieldPicker
                editorId={`${editorId}-field`}
                ariaLabel="Measure field picker"
                groups={pickerGroups}
                trigger={
                  <Button type="button" variant="outline" aria-label="Measure field">
                    {selectedField?.label ?? 'Choose a field'}
                    <ChevronDownIcon aria-hidden="true" />
                  </Button>
                }
                onSelect={selectField}
              />
            ) : null}
          </div>
          <label className="grid gap-1 text-body-sm font-medium">
            Alias
            <Input
              aria-label="Aggregation alias"
              value={draft.alias}
              placeholder={draft.countRows ? 'count_rows' : 'sum_revenue'}
              onChange={(event) =>
                setDraft((current) => ({ ...current, alias: event.target.value }))
              }
            />
          </label>
          <div className="flex justify-end gap-2">
            <CancelButton onCancel={onCancel} />
            <Button
              type="button"
              variant="outline"
              aria-label={confirmLabel}
              disabled={!canConfirm}
              onClick={confirm}
            >
              <PlusIcon aria-hidden="true" /> {confirmLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FunctionOption({
  label,
  description,
  selected,
  onSelect,
}: {
  readonly label: string;
  readonly description: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-label={label}
      aria-selected={selected}
      className="flex min-h-12 items-center justify-between rounded-md border border-transparent px-3 py-2 text-left text-body-sm hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onSelect}
    >
      <span className="font-semibold">{label}</span>
      <span className="ml-3 text-caption text-muted-foreground">{description}</span>
    </button>
  );
}

function CancelButton({ onCancel }: { readonly onCancel: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
      Cancel
    </Button>
  );
}

function initialStage(draft: MeasureDraft): MeasureStage {
  if (draft.countRows || draft.field) return 'CONFIGURE';
  return 'FUNCTION';
}

function measureDescription(draft: MeasureDraft): string {
  if (draft.countRows) return 'Count rows';
  return draft.field
    ? `${aggregationFunctionLabel(draft.functionName)} ${draft.field.label}`
    : aggregationFunctionLabel(draft.functionName);
}

function aggregationFunctionLabel(functionName: AggregationFunction): string {
  switch (functionName) {
    case 'COUNT':
      return 'Count';
    case 'DISTINCT_COUNT':
      return 'Distinct count';
    case 'SUM':
      return 'Sum';
    case 'AVG':
      return 'Average';
    case 'MIN':
      return 'Minimum';
    case 'MAX':
      return 'Maximum';
  }
}

export function measureDraftFromAggregation(
  aggregation: VisualQueryDefinition['aggregations'][number],
  groups: readonly FieldGroupViewModel[],
): MeasureDraft {
  const countRows =
    aggregation.function === 'COUNT' &&
    aggregation.expression.kind === 'LITERAL' &&
    aggregation.expression.valueType === 'NUMBER' &&
    aggregation.expression.value === 1;
  const expression = aggregation.expression;
  const field =
    expression.kind === 'FIELD'
      ? (groups
          .flatMap((group) => group.fields)
          .find(
            (option) => option.relation === expression.relation && option.name === expression.field,
          ) ?? null)
      : null;
  return {
    functionName: isAggregationFunction(aggregation.function) ? aggregation.function : 'COUNT',
    field,
    alias: aggregation.alias,
    countRows,
  };
}

function isAggregationFunction(value: string): value is AggregationFunction {
  return (aggregationFunctions as readonly string[]).includes(value);
}
