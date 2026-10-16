'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUpIcon, ChevronDownIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import type { QueryExpression, VisualQueryDefinition } from '@/src/entities/models/canonical-chart';
import {
  fieldExpressionFromOption,
  presentFieldGroups,
  type FieldGroupViewModel,
  type FieldOptionViewModel,
  type RelationMetadataMap,
} from '@/src/interface-adapters/presenters/chart-builder-field.presenter';

import { expressionText, resolvePostAggregationFilterExpression } from '../chart-builder-query';
import { ClauseChip } from '../ui/clause-chip';
import { NotebookPreviewButton } from '../ui/notebook-preview-button';
import { NotebookStepBand } from '../ui/notebook-step-band';
import { ResponsiveEditor } from '../ui/responsive-editor';
import { GroupedFieldPicker } from './grouped-field-picker';
import { useNotebookEditor } from './notebook-editor-context';

export interface SortLimitStepProps {
  readonly query: VisualQueryDefinition;
  readonly relations: RelationMetadataMap;
  readonly onChange: (query: VisualQueryDefinition) => void;
  readonly onPreviewStep?: () => void;
  readonly previewDisabled?: boolean;
}

type Editor =
  { readonly kind: 'SORT'; readonly index: number | null } | { readonly kind: 'LIMIT' } | null;

export interface SortDraft {
  readonly field: FieldOptionViewModel | null;
  readonly direction: 'ASC' | 'DESC';
}

const MAX_QUERY_LIMIT = 10_000;

/** Optional ordering and row-limit controls with transaction-scoped editors. */
export function SortLimitStep({
  query,
  relations,
  onChange,
  onPreviewStep,
  previewDisabled = false,
}: SortLimitStepProps) {
  const fieldGroups = useMemo(
    () => presentFieldGroups({ query, relations, scope: { kind: 'QUERY_VISIBLE' } }),
    [query, relations],
  );
  const sortGroups = useMemo(() => {
    const resultGroup = presentAggregationResultGroup(query);
    return resultGroup ? [...fieldGroups, resultGroup] : fieldGroups;
  }, [fieldGroups, query]);
  const [editor, setEditor] = useState<Editor>(null);
  const [limitInput, setLimitInput] = useState('');
  const editorRef = useRef<HTMLElement>(null);
  const hasConfiguredClause = query.orderBy.length > 0 || query.limit !== undefined;

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

  function openSort(index: number | null): void {
    setEditor({ kind: 'SORT', index });
  }

  function confirmSort(draft: SortDraft): void {
    if (!editor || editor.kind !== 'SORT' || !draft.field) return;
    const nextOrderBy = [...query.orderBy];
    const next = {
      expression: sortExpressionFromOption(query, draft.field),
      direction: draft.direction,
    } as const;
    if (editor.index === null) nextOrderBy.push(next);
    else nextOrderBy[editor.index] = next;
    onChange({ ...query, orderBy: nextOrderBy });
    setEditor(null);
  }

  function openLimit(): void {
    setLimitInput(query.limit === undefined ? '' : String(query.limit));
    setEditor({ kind: 'LIMIT' });
  }

  function applyLimit(): void {
    const parsed = parseLimit(limitInput);
    if (parsed === null) return;
    onChange({ ...query, limit: parsed });
    setEditor(null);
  }

  function removeLimit(): void {
    setLimitInput('');
    onChange({ ...query, limit: undefined });
    setEditor(null);
  }

  if (!hasConfiguredClause && editor === null) {
    return (
      <div className="flex items-center gap-1" aria-label="Optional query controls">
        <Button type="button" variant="ghost" size="sm" onClick={() => openSort(null)}>
          <ArrowDownUpIcon aria-hidden="true" /> Sort
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={openLimit}>
          <PlusIcon aria-hidden="true" /> Limit
        </Button>
      </div>
    );
  }

  const parsedLimit = parseLimit(limitInput);
  const limitError = limitInput.length > 0 && parsedLimit === null;

  return (
    <section ref={editorRef} className="space-y-2" aria-label="Sort and limit step" role="region">
      <NotebookStepBand
        tone="DATA"
        label="Sort and limit"
        action={
          <div className="flex items-center gap-1">
            {onPreviewStep ? (
              <NotebookPreviewButton
                label="final query"
                onClick={onPreviewStep}
                disabled={previewDisabled}
              />
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={() => openSort(null)}>
              <ArrowDownUpIcon aria-hidden="true" /> Sort
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={openLimit}>
              <PlusIcon aria-hidden="true" /> Limit
            </Button>
          </div>
        }
      >
        <div className="flex min-h-14 flex-wrap items-center gap-2">
          {query.orderBy.map((item, index) => (
            <ClauseChip
              key={`${expressionText(item.expression)}-${index}`}
              tone="DATA"
              ariaLabel={`Sort ${index + 1}`}
              onEdit={() => openSort(index)}
              onRemove={() =>
                onChange({
                  ...query,
                  orderBy: query.orderBy.filter((_, itemIndex) => itemIndex !== index),
                })
              }
            >
              {sortLabel(item.expression, item.direction, query)}
            </ClauseChip>
          ))}
          {query.limit !== undefined ? (
            <ClauseChip
              tone="DATA"
              ariaLabel="Query limit"
              onEdit={openLimit}
              onRemove={removeLimit}
            >
              Limit {query.limit}
            </ClauseChip>
          ) : null}
          {!query.orderBy.length && query.limit === undefined && editor === null ? (
            <p className="text-body-sm text-muted-foreground">
              Optional: sort or limit the result.
            </p>
          ) : null}
        </div>

        {editor?.kind === 'SORT' ? (
          <SortEditor
            key={`sort-${editor.index ?? 'new'}`}
            editorId="sort-limit-sort"
            groups={sortGroups}
            initialDraft={
              editor.index === null
                ? undefined
                : sortDraftFromOrder(query.orderBy[editor.index], sortGroups, query)
            }
            onConfirm={confirmSort}
            onCancel={() => setEditor(null)}
            confirmLabel={editor.index === null ? 'Add sort' : 'Update sort'}
          />
        ) : null}

        {editor?.kind === 'LIMIT' ? (
          <div
            data-testid="limit-editor"
            className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-md border border-border bg-card/80 p-3"
          >
            <label className="grid max-w-xs gap-1 text-body-sm font-medium">
              Query limit
              <Input
                aria-label="Query limit"
                type="number"
                min={1}
                max={MAX_QUERY_LIMIT}
                step={1}
                value={limitInput}
                placeholder={String(MAX_QUERY_LIMIT)}
                aria-invalid={limitError}
                onChange={(event) => setLimitInput(event.target.value)}
              />
              <span className="font-normal text-muted-foreground">
                Between 1 and {MAX_QUERY_LIMIT.toLocaleString()} rows.
              </span>
              {limitError ? (
                <span role="alert" className="font-normal text-destructive">
                  Enter a whole number between 1 and {MAX_QUERY_LIMIT.toLocaleString()}.
                </span>
              ) : null}
            </label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              {query.limit !== undefined ? (
                <Button type="button" variant="ghost" size="sm" onClick={removeLimit}>
                  Remove limit
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                aria-label="Apply limit"
                disabled={parsedLimit === null}
                onClick={applyLimit}
              >
                Apply limit
              </Button>
            </div>
          </div>
        ) : null}
      </NotebookStepBand>
    </section>
  );
}

function SortEditor({
  editorId,
  groups,
  initialDraft = { field: null, direction: 'DESC' },
  onConfirm,
  onCancel,
  confirmLabel,
}: {
  readonly editorId: string;
  readonly groups: readonly FieldGroupViewModel[];
  readonly initialDraft?: SortDraft;
  readonly onConfirm: (draft: SortDraft) => void;
  readonly onCancel: () => void;
  readonly confirmLabel: string;
}) {
  const [draft, setDraft] = useState<SortDraft>(initialDraft);
  const directionEditor = useNotebookEditor(`${editorId}-direction`);

  return (
    <div
      data-testid="sort-editor"
      className="mt-3 rounded-md border border-border bg-card/80 p-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <GroupedFieldPicker
            editorId={`${editorId}-field`}
            ariaLabel="Sort field picker"
            groups={groups}
            selectedIds={draft.field ? [draft.field.id] : []}
            trigger={
              <Button type="button" variant="outline" aria-label="Sort field">
                {draft.field?.label ?? 'Choose a field'}
                <ChevronDownIcon aria-hidden="true" />
              </Button>
            }
            onSelect={(field) => setDraft((current) => ({ ...current, field }))}
          />
          <ResponsiveEditor
            editorId={`${editorId}-direction`}
            ariaLabel="Sort direction picker"
            title="Sort direction"
            trigger={
              <Button type="button" variant="outline" aria-label="Sort direction">
                {sortDirectionLabel(draft.direction)}
                <ChevronDownIcon aria-hidden="true" />
              </Button>
            }
          >
            <div className="grid gap-1 p-2" role="listbox" aria-label="Sort directions">
              <button
                type="button"
                role="option"
                aria-selected={draft.direction === 'ASC'}
                className="flex min-h-10 items-center justify-between rounded-md px-3 text-left text-body-sm hover:bg-accent"
                onClick={() => {
                  setDraft((current) => ({ ...current, direction: 'ASC' }));
                  directionEditor.setOpen(false);
                }}
              >
                Ascending
              </button>
              <button
                type="button"
                role="option"
                aria-selected={draft.direction === 'DESC'}
                className="flex min-h-10 items-center justify-between rounded-md px-3 text-left text-body-sm hover:bg-accent"
                onClick={() => {
                  setDraft((current) => ({ ...current, direction: 'DESC' }));
                  directionEditor.setOpen(false);
                }}
              >
                Descending
              </button>
            </div>
          </ResponsiveEditor>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label={confirmLabel}
            disabled={!draft.field}
            onClick={() => onConfirm(draft)}
          >
            <PlusIcon aria-hidden="true" /> {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function presentAggregationResultGroup(query: VisualQueryDefinition): FieldGroupViewModel | null {
  if (!query.aggregations.length) return null;
  return {
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
      family: 'NUMBER',
    })),
  };
}

function sortExpressionFromOption(
  query: VisualQueryDefinition,
  option: FieldOptionViewModel,
): QueryExpression {
  return option.relation === 'result'
    ? resolvePostAggregationFilterExpression(query, option.name, query.source.alias)
    : fieldExpressionFromOption(option);
}

function sortDraftFromOrder(
  item: VisualQueryDefinition['orderBy'][number] | undefined,
  groups: readonly FieldGroupViewModel[],
  query: VisualQueryDefinition,
): SortDraft {
  if (!item) return { field: null, direction: 'DESC' };
  return {
    field: fieldOptionFromSortExpression(item.expression, groups, query),
    direction: item.direction,
  };
}

function fieldOptionFromSortExpression(
  expression: QueryExpression,
  groups: readonly FieldGroupViewModel[],
  query: VisualQueryDefinition,
): FieldOptionViewModel | null {
  if (expression.kind === 'FIELD') {
    return (
      groups
        .flatMap((group) => group.fields)
        .find(
          (field) => field.relation === expression.relation && field.name === expression.field,
        ) ?? null
    );
  }
  if (expression.kind === 'CALL') {
    const aggregation = query.aggregations.find(
      (item) =>
        item.function === expression.function &&
        expressionText(item.expression) === expressionText(expression.arguments[0]!),
    );
    return aggregation
      ? (groups
          .flatMap((group) => group.fields)
          .find((field) => field.relation === 'result' && field.name === aggregation.alias) ?? null)
      : null;
  }
  return null;
}

function sortLabel(
  expression: QueryExpression,
  direction: 'ASC' | 'DESC',
  query: VisualQueryDefinition,
): string {
  const aggregation =
    expression.kind === 'CALL'
      ? query.aggregations.find(
          (item) =>
            item.function === expression.function &&
            expressionText(item.expression) === expressionText(expression.arguments[0]!),
        )
      : undefined;
  const name =
    aggregation?.alias ??
    (expression.kind === 'FIELD' ? humanize(expression.field) : expressionText(expression));
  return `${name} ${direction === 'ASC' ? 'Ascending' : 'Descending'}`;
}

function sortDirectionLabel(direction: 'ASC' | 'DESC'): string {
  return direction === 'ASC' ? 'Ascending' : 'Descending';
}

function parseLimit(value: string): number | null {
  if (!/^\d+$/u.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_QUERY_LIMIT ? limit : null;
}

function humanize(value: string): string {
  return value
    .replaceAll('_', ' ')
    .split(' ')
    .map((word) => (word ? `${word[0]!.toUpperCase()}${word.slice(1)}` : word))
    .join(' ');
}
