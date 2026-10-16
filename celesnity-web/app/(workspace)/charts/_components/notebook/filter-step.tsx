'use client';

import { useMemo, useState } from 'react';
import { PlusIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import type { QueryExpression, VisualQueryDefinition } from '@/src/entities/models/canonical-chart';
import {
  presentFieldGroups,
  type FieldGroupViewModel,
  type RelationMetadataMap,
} from '@/src/interface-adapters/presenters/chart-builder-field.presenter';

import { expressionText } from '../chart-builder-query';
import { NotebookPreviewButton } from '../ui/notebook-preview-button';
import { ClauseChip } from '../ui/clause-chip';
import { NotebookStepBand } from '../ui/notebook-step-band';
import {
  expressionToFilterDraft,
  filterDraftToExpression,
  filterOperatorLabel,
  type FilterClauseEditorProps,
  type FilterDraft,
  type FilterOperator,
} from './filter-clause-editor';
import { FilterClauseEditor } from './filter-clause-editor';

export interface FilterStepProps {
  readonly query: VisualQueryDefinition;
  readonly relations: RelationMetadataMap;
  readonly onChange: (query: VisualQueryDefinition) => void;
  readonly onPreviewStep?: () => void;
  readonly previewDisabled?: boolean;
}

type ActiveEditor = Readonly<{
  readonly target: FilterDraft['target'];
  readonly index: number | null;
  readonly draft: FilterDraft;
}>;

/** Filter notebook step with grouped, typed, confirm-before-mutate editors. */
export function FilterStep({
  query,
  relations,
  onChange,
  onPreviewStep,
  previewDisabled = false,
}: FilterStepProps) {
  const fieldGroups = useMemo(
    () => presentFieldGroups({ query, relations, scope: { kind: 'QUERY_VISIBLE' } }),
    [query, relations],
  );
  const havingGroups = useMemo(() => presentHavingGroups(query), [query]);
  const [activeEditor, setActiveEditor] = useState<ActiveEditor | null>(null);
  const hasWhere = query.filters.length > 0;
  const hasHaving = query.postAggregationFilters.length > 0;

  function openWhere(index: number | null = null): void {
    const existing = index === null ? null : query.filters[index];
    const draft = existing ? expressionToFilterDraft(existing, fieldGroups) : null;
    setActiveEditor({
      target: 'WHERE',
      index,
      draft: draft ?? emptyDraft('WHERE'),
    });
  }

  function openHaving(index: number | null = null): void {
    const existing = index === null ? null : query.postAggregationFilters[index];
    const draft = existing ? havingExpressionToDraft(existing, query, havingGroups) : null;
    setActiveEditor({
      target: 'HAVING',
      index,
      draft: draft ?? emptyDraft('HAVING'),
    });
  }

  function confirmDraft(draft: FilterDraft): void {
    if (!activeEditor) return;
    const normalizedDraft =
      draft.target === activeEditor.target ? draft : { ...draft, target: activeEditor.target };
    const expression = toCanonicalFilterExpression(normalizedDraft, query);
    if (!expression) return;
    if (activeEditor.target === 'WHERE') {
      const filters =
        activeEditor.index === null
          ? [...query.filters, expression]
          : query.filters.map((item, index) => (index === activeEditor.index ? expression : item));
      onChange({ ...query, filters });
    } else {
      const postAggregationFilters =
        activeEditor.index === null
          ? [...query.postAggregationFilters, expression]
          : query.postAggregationFilters.map((item, index) =>
              index === activeEditor.index ? expression : item,
            );
      onChange({ ...query, postAggregationFilters });
    }
    setActiveEditor(null);
  }

  function removeWhere(index: number): void {
    onChange({
      ...query,
      filters: query.filters.filter((_, itemIndex) => itemIndex !== index),
    });
    if (activeEditor?.target === 'WHERE' && activeEditor.index === index) setActiveEditor(null);
  }

  function removeHaving(index: number): void {
    onChange({
      ...query,
      postAggregationFilters: query.postAggregationFilters.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    });
    if (activeEditor?.target === 'HAVING' && activeEditor.index === index) setActiveEditor(null);
  }

  const editorProps: FilterClauseEditorProps | null = activeEditor
    ? {
        editorId: `filter-${activeEditor.target.toLowerCase()}-${activeEditor.index ?? 'new'}`,
        initialDraft: activeEditor.draft,
        groups: activeEditor.target === 'WHERE' ? fieldGroups : havingGroups,
        onConfirm: confirmDraft,
        onCancel: () => setActiveEditor(null),
        confirmLabel: activeEditor.index === null ? 'Add filter' : 'Update filter',
      }
    : null;

  return (
    <section className="space-y-2" aria-label="Filter step" role="region">
      <NotebookStepBand
        tone="FILTER"
        label="Filter"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            {onPreviewStep ? (
              <NotebookPreviewButton
                label="Filter"
                onClick={onPreviewStep}
                disabled={previewDisabled}
              />
            ) : null}
            {hasWhere || hasHaving ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => openWhere()}>
                <PlusIcon aria-hidden="true" /> Add filter
              </Button>
            ) : null}
            {query.aggregations.length > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => openHaving()}>
                <PlusIcon aria-hidden="true" /> Add summary filter
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {query.filters.map((expression, index) => (
            <ClauseChip
              key={`where-${expressionText(expression)}-${index}`}
              tone="FILTER"
              ariaLabel={`Filter ${index + 1}`}
              onEdit={() => openWhere(index)}
              onRemove={() => removeWhere(index)}
            >
              {filterExpressionLabel(expression, fieldGroups)}
            </ClauseChip>
          ))}
          {query.postAggregationFilters.map((expression, index) => (
            <ClauseChip
              key={`having-${expressionText(expression)}-${index}`}
              tone="FILTER"
              ariaLabel={`HAVING ${index + 1}`}
              onEdit={() => openHaving(index)}
              onRemove={() => removeHaving(index)}
            >
              HAVING {filterExpressionLabel(expression, havingGroups, query, 'HAVING')}
            </ClauseChip>
          ))}
          {!hasWhere && !hasHaving && !activeEditor ? (
            <Button
              type="button"
              variant="outline"
              className="border-border bg-card/60 text-foreground"
              onClick={() => openWhere()}
            >
              Add filters to narrow your answer
            </Button>
          ) : null}
          {editorProps ? <FilterClauseEditor key={editorProps.editorId} {...editorProps} /> : null}
        </div>
      </NotebookStepBand>
    </section>
  );
}

function emptyDraft(target: FilterDraft['target']): FilterDraft {
  return { target, field: null, operator: 'EQ', value: '' };
}

function toCanonicalFilterExpression(
  draft: FilterDraft,
  query: VisualQueryDefinition,
): QueryExpression | null {
  const expression = filterDraftToExpression(draft);
  const field = draft.field;
  if (!expression || draft.target !== 'HAVING' || !field) return expression;
  const aggregation = query.aggregations.find((item) => item.alias === field.name);
  if (!aggregation) return expression;
  const aggregateExpression: QueryExpression = {
    kind: 'CALL',
    function: aggregation.function,
    arguments: [aggregation.expression],
  };
  if (expression.kind === 'UNARY') return { ...expression, operand: aggregateExpression };
  if (expression.kind === 'BINARY') return { ...expression, left: aggregateExpression };
  return expression;
}

function presentHavingGroups(query: VisualQueryDefinition): readonly FieldGroupViewModel[] {
  if (!query.aggregations.length) return [];
  return [
    {
      id: 'query-result',
      relation: 'result',
      label: 'Query result',
      role: 'RESULT',
      fields: query.aggregations.map((aggregation) => ({
        id: `result.${aggregation.alias}`,
        relation: 'result',
        name: aggregation.alias,
        label: humanize(aggregation.alias),
        dataType: 'NUMBER',
        family: 'NUMBER' as const,
      })),
    },
  ];
}

function havingExpressionToDraft(
  expression: QueryExpression,
  query: VisualQueryDefinition,
  groups: readonly FieldGroupViewModel[],
): FilterDraft | null {
  const operand =
    expression.kind === 'UNARY'
      ? expression.operand
      : expression.kind === 'BINARY'
        ? expression.left
        : null;
  if (!operand) return null;
  const aggregation =
    operand.kind === 'CALL'
      ? query.aggregations.find(
          (item) =>
            item.function.toUpperCase() === operand.function.toUpperCase() &&
            expressionText(item.expression) === expressionText(operand.arguments[0]!),
        )
      : null;
  if (!aggregation) {
    const draft = expressionToFilterDraft(expression, groups);
    return draft ? { ...draft, target: 'HAVING' } : null;
  }
  const field = groups
    .flatMap((group) => group.fields)
    .find((item) => item.name === aggregation.alias);
  if (!field) return null;
  const operator =
    expression.kind === 'UNARY' || expression.kind === 'BINARY' ? expression.operator : null;
  if (!operator) return null;
  if (!isFilterOperator(operator)) return null;
  const value =
    expression.kind === 'BINARY' && expression.right.kind === 'LITERAL'
      ? String(expression.right.value ?? '')
      : '';
  return { target: 'HAVING', field, operator, value };
}

function filterExpressionLabel(
  expression: QueryExpression,
  groups: readonly FieldGroupViewModel[],
  query?: VisualQueryDefinition,
  target: FilterDraft['target'] = 'WHERE',
): string {
  const draft =
    target === 'HAVING' && query
      ? havingExpressionToDraft(expression, query, groups)
      : expressionToFilterDraft(expression, groups);
  if (!draft?.field) return expressionText(expression);
  const fieldName = draft.field.label;
  if (draft.operator === 'IS_NULL' || draft.operator === 'IS_NOT_NULL') {
    return `${fieldName} ${filterOperatorLabel(draft.operator)}`;
  }
  return `${fieldName} ${filterOperatorLabel(draft.operator)} ${draft.value}`;
}

function isFilterOperator(value: string): value is FilterOperator {
  return ['EQ', 'NOT_EQ', 'GT', 'GTE', 'LT', 'LTE', 'IS_NULL', 'IS_NOT_NULL'].includes(value);
}

function humanize(value: string): string {
  return value
    .replaceAll('_', ' ')
    .split(' ')
    .map((word) =>
      word.toLowerCase() === 'id'
        ? 'ID'
        : word
          ? `${word[0]!.toUpperCase()}${word.slice(1)}`
          : word,
    )
    .join(' ');
}
