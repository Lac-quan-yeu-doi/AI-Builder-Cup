'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ChevronDownIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import type { LiteralExpression, QueryExpression } from '@/src/entities/models/canonical-chart';
import {
  fieldExpressionFromOption,
  type FieldGroupViewModel,
  type FieldOptionViewModel,
} from '@/src/interface-adapters/presenters/chart-builder-field.presenter';

import { GroupedFieldPicker } from './grouped-field-picker';
import { ResponsiveEditor } from '../ui/responsive-editor';

export type FilterTarget = 'WHERE' | 'HAVING';
export type FilterOperator =
  'EQ' | 'NOT_EQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IS_NULL' | 'IS_NOT_NULL';

export type FilterDraft = Readonly<{
  readonly target: FilterTarget;
  readonly field: FieldOptionViewModel | null;
  readonly operator: FilterOperator;
  readonly value: string;
}>;

export interface FilterClauseEditorProps {
  readonly editorId: string;
  readonly initialDraft: FilterDraft;
  readonly groups: readonly FieldGroupViewModel[];
  readonly onConfirm: (draft: FilterDraft) => void;
  readonly onCancel: () => void;
  readonly confirmLabel?: string;
}

export function FilterClauseEditor({
  editorId,
  initialDraft,
  groups,
  onConfirm,
  onCancel,
  confirmLabel = 'Add filter',
}: FilterClauseEditorProps) {
  const [draft, setDraft] = useState<FilterDraft>(initialDraft);
  const editorRef = useRef<HTMLDivElement>(null);

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

  const field = draft.field;
  const expression = filterDraftToExpression(draft);
  const needsValue = !isUnaryOperator(draft.operator);
  const canConfirm = Boolean(expression && (!needsValue || draft.value.trim()));

  function updateField(nextField: FieldOptionViewModel): void {
    setDraft((current) => ({ ...current, field: nextField, value: '' }));
  }

  return (
    <div
      ref={editorRef}
      data-testid="filter-clause-editor"
      className="mt-3 w-full rounded-md border border-border bg-card/80 p-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      {!field ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm font-medium text-foreground">Choose a field to filter</p>
          <GroupedFieldPicker
            editorId={`${editorId}-field`}
            ariaLabel="Filter field picker"
            groups={groups}
            trigger={
              <Button type="button" variant="outline" aria-label="Filter field">
                Choose a field <ChevronDownIcon aria-hidden="true" />
              </Button>
            }
            onSelect={updateField}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Back to filter fields"
              onClick={() => setDraft((current) => ({ ...current, field: null, value: '' }))}
            >
              <ArrowLeftIcon aria-hidden="true" /> {field.label}
            </Button>
            <ResponsiveEditor
              editorId={`${editorId}-operator`}
              ariaLabel="Filter operator"
              title="Filter operator"
              trigger={
                <Button type="button" variant="outline" aria-label="Filter operator">
                  {filterOperatorLabel(draft.operator)} <ChevronDownIcon aria-hidden="true" />
                </Button>
              }
            >
              <div className="grid gap-1 p-2">
                {filterOperators.map((operator) => (
                  <FilterOperatorOption
                    key={operator}
                    operator={operator}
                    selected={operator === draft.operator}
                    onSelect={(nextOperator) =>
                      setDraft((current) => ({
                        ...current,
                        operator: nextOperator,
                        value: isUnaryOperator(nextOperator) ? '' : current.value,
                      }))
                    }
                  />
                ))}
              </div>
            </ResponsiveEditor>
          </div>

          {needsValue ? (
            <FilterValueInput
              family={field.family}
              value={draft.value}
              onChange={(value) => setDraft((current) => ({ ...current, value }))}
            />
          ) : (
            <p className="text-body-sm text-muted-foreground">
              This filter does not require a value.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canConfirm}
              onClick={() => onConfirm(draft)}
            >
              <PlusIcon aria-hidden="true" /> {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterOperatorOption({
  operator,
  selected,
  onSelect,
}: {
  readonly operator: FilterOperator;
  readonly selected: boolean;
  readonly onSelect: (operator: FilterOperator) => void;
}) {
  return (
    <Button
      type="button"
      variant={selected ? 'secondary' : 'ghost'}
      className="justify-start"
      onClick={() => onSelect(operator)}
    >
      {filterOperatorLabel(operator)}
    </Button>
  );
}

function FilterValueInput({
  family,
  value,
  onChange,
}: {
  readonly family: FieldOptionViewModel['family'];
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  if (family === 'BOOLEAN') {
    return (
      <label className="grid gap-1 text-body-sm font-medium">
        Filter value
        <select
          aria-label="Filter value"
          className="h-10 rounded-md border border-input bg-background px-3 text-body-sm font-normal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose a value</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
    );
  }

  const type = family === 'NUMBER' ? 'number' : family === 'DATE' ? 'date' : 'text';
  return (
    <label className="grid gap-1 text-body-sm font-medium">
      Filter value
      <Input
        aria-label="Filter value"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function filterDraftToExpression(draft: FilterDraft): QueryExpression | null {
  if (!draft.field) return null;
  const operand = fieldExpressionFromOption(draft.field);
  if (isUnaryOperator(draft.operator)) {
    return { kind: 'UNARY', operator: draft.operator, operand };
  }
  if (!isValidFilterValue(draft.value, draft.field.family)) return null;
  return {
    kind: 'BINARY',
    operator: draft.operator,
    left: operand,
    right: literalFromValue(draft.value, draft.field.family),
  };
}

export function expressionToFilterDraft(
  expression: QueryExpression,
  groups: readonly FieldGroupViewModel[],
): FilterDraft | null {
  const operand =
    expression.kind === 'UNARY'
      ? expression.operand
      : expression.kind === 'BINARY'
        ? expression.left
        : null;
  if (!operand || operand.kind !== 'FIELD') return null;
  const field = groups
    .flatMap((group) => group.fields)
    .find((option) => option.relation === operand.relation && option.name === operand.field);
  if (!field) return null;

  const operator =
    expression.kind === 'UNARY' || expression.kind === 'BINARY' ? expression.operator : null;
  if (!operator) return null;
  if (!isFilterOperator(operator)) return null;
  const value =
    expression.kind === 'BINARY' && expression.right.kind === 'LITERAL'
      ? literalToInput(expression.right)
      : '';
  return { target: 'WHERE', field, operator, value };
}

export const filterOperators: readonly FilterOperator[] = [
  'EQ',
  'NOT_EQ',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'IS_NULL',
  'IS_NOT_NULL',
];

export function filterOperatorLabel(operator: FilterOperator): string {
  switch (operator) {
    case 'EQ':
      return 'is';
    case 'NOT_EQ':
      return 'is not';
    case 'GT':
      return 'greater than';
    case 'GTE':
      return 'greater than or equal to';
    case 'LT':
      return 'less than';
    case 'LTE':
      return 'less than or equal to';
    case 'IS_NULL':
      return 'is empty';
    case 'IS_NOT_NULL':
      return 'is not empty';
  }
}

export function isUnaryOperator(operator: FilterOperator): boolean {
  return operator === 'IS_NULL' || operator === 'IS_NOT_NULL';
}

function isFilterOperator(value: string): value is FilterOperator {
  return (filterOperators as readonly string[]).includes(value);
}

function literalFromValue(
  value: string,
  family: FieldOptionViewModel['family'],
): LiteralExpression {
  if (family === 'NUMBER') return { kind: 'LITERAL', valueType: 'NUMBER', value: Number(value) };
  if (family === 'BOOLEAN')
    return { kind: 'LITERAL', valueType: 'BOOLEAN', value: value === 'true' };
  if (family === 'DATE') return { kind: 'LITERAL', valueType: 'DATE', value };
  return { kind: 'LITERAL', valueType: 'STRING', value };
}

function literalToInput(literal: LiteralExpression): string {
  if (literal.value === null) return '';
  return String(literal.value);
}

function isValidFilterValue(value: string, family: FieldOptionViewModel['family']): boolean {
  if (family === 'NUMBER') return value.trim() !== '' && Number.isFinite(Number(value));
  if (family === 'BOOLEAN') return value === 'true' || value === 'false';
  return value.trim() !== '';
}
