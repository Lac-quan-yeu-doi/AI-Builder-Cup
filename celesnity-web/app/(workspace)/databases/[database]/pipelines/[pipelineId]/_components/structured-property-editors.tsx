'use client';

import type { ReactNode } from 'react';

import { Button } from '@/app/_components/ui/button';
import type { NodePropertyOption } from '@/src/entities/models/node-definition';

const controlClass =
  'min-h-9 w-full rounded-md border border-border bg-card px-3 text-caption text-foreground outline-none focus:border-primary';

interface EditorProps {
  readonly value: unknown;
  readonly disabled: boolean;
  readonly options?: readonly NodePropertyOption[];
  readonly onChange: (value: unknown) => void;
}

const FILTER_OPERATORS = [
  'EQUALS',
  'NOT_EQUALS',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUALS',
  'LESS_THAN',
  'LESS_THAN_OR_EQUALS',
  'CONTAINS',
  'STARTS_WITH',
  'ENDS_WITH',
  'IN',
  'IS_NULL',
  'IS_NOT_NULL',
] as const;
const SPARK_TYPES = [
  'string',
  'boolean',
  'int',
  'long',
  'float',
  'double',
  'decimal(18,2)',
  'date',
  'timestamp',
] as const;

export function FilterBuilder({ value, disabled, options, onChange }: EditorProps) {
  const rows = records(value, { key: '', operator: 'EQUALS', value: typedDefault() });
  return (
    <fieldset className="contents" disabled={disabled}>
      <Rows
        rows={rows}
        disabled={disabled}
        addLabel="Add condition"
        newRow={{ key: '', operator: 'EQUALS', value: typedDefault() }}
        onChange={onChange}
        render={(row, update) => (
          <>
            <FieldSelect
              value={row.key}
              label="Filter field"
              options={options}
              onChange={(key) => update({ key })}
            />
            <Select
              value={row.operator}
              label="Filter operator"
              options={filterOperators(
                options?.find((option) => option.value === row.key)?.dataType,
              )}
              onChange={(operator) =>
                update({ operator, value: operator === 'IN' ? [] : typedDefault() })
              }
            />
            {['IS_NULL', 'IS_NOT_NULL'].includes(text(row.operator)) ? null : row.operator ===
              'IN' ? (
              <Text
                value={list(row.value).join(', ')}
                label="Values"
                placeholder="value one, value two"
                onChange={(next) => update({ value: splitList(next) })}
              />
            ) : (
              <TypedValueEditor
                value={row.value}
                disabled={disabled}
                compact
                onChange={(next) => update({ value: next })}
              />
            )}
          </>
        )}
      />
    </fieldset>
  );
}

export function ColumnMappingBuilder({ value, disabled, options, onChange }: EditorProps) {
  return (
    <fieldset className="contents" disabled={disabled}>
      <Rows
        rows={records(value, { sourceField: '', targetField: '', targetType: 'string' })}
        disabled={disabled}
        addLabel="Add mapping"
        newRow={{ sourceField: '', targetField: '', targetType: 'string' }}
        onChange={onChange}
        render={(row, update) => (
          <>
            <FieldSelect
              value={row.sourceField}
              label="Source field"
              options={options}
              onChange={(sourceField) => update({ sourceField })}
            />
            <Text
              value={row.targetField}
              label="Target field"
              placeholder="target"
              onChange={(targetField) => update({ targetField })}
            />
            <Select
              value={row.targetType}
              label="Target type"
              options={SPARK_TYPES}
              onChange={(targetType) => update({ targetType })}
            />
          </>
        )}
      />
    </fieldset>
  );
}

export function OrderByBuilder({ value, disabled, options, onChange }: EditorProps) {
  return (
    <fieldset className="contents" disabled={disabled}>
      <Rows
        rows={records(value)}
        disabled={disabled}
        addLabel="Add ordering"
        newRow={{ field: '', direction: 'ASC', nulls: 'LAST' }}
        onChange={onChange}
        render={(row, update) => (
          <>
            <FieldSelect
              value={row.field}
              label="Order field"
              options={options}
              onChange={(field) => update({ field })}
            />
            <Select
              value={row.direction}
              label="Direction"
              options={['ASC', 'DESC']}
              onChange={(direction) => update({ direction })}
            />
            <Select
              value={row.nulls}
              label="Null ordering"
              options={['FIRST', 'LAST']}
              onChange={(nulls) => update({ nulls })}
            />
          </>
        )}
      />
    </fieldset>
  );
}

export function AggregationBuilder({ value, disabled, options, onChange }: EditorProps) {
  return (
    <fieldset className="contents" disabled={disabled}>
      <Rows
        rows={records(value, { sourceField: '', function: 'SUM', outputField: '' })}
        disabled={disabled}
        addLabel="Add aggregation"
        newRow={{ sourceField: '', function: 'SUM', outputField: '' }}
        onChange={onChange}
        render={(row, update) => (
          <>
            <FieldSelect
              value={row.sourceField}
              label="Aggregation source field"
              options={options}
              onChange={(sourceField) => update({ sourceField })}
            />
            <Select
              value={row.function}
              label="Aggregation function"
              options={aggregationFunctions(
                options?.find((option) => option.value === row.sourceField)?.dataType,
              )}
              onChange={(fn) => update({ function: fn })}
            />
            <Text
              value={row.outputField}
              label="Aggregation output field"
              placeholder="output field"
              onChange={(outputField) => update({ outputField })}
            />
          </>
        )}
      />
    </fieldset>
  );
}

export function TypedValueEditor({
  value,
  disabled,
  onChange,
  compact = false,
}: EditorProps & { readonly compact?: boolean }) {
  const current = record(value) ?? typedDefault();
  const type = text(current.type) || 'STRING';
  return (
    <fieldset
      className={
        compact ? 'grid grid-cols-[0.8fr_1.2fr] gap-2 border-0 p-0' : 'grid gap-2 border-0 p-0'
      }
      disabled={disabled}
    >
      <Select
        value={type}
        label="Value type"
        options={['STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'NULL']}
        onChange={(nextType) => onChange({ type: nextType, value: defaultForType(nextType) })}
      />
      {type === 'NULL' ? null : type === 'BOOLEAN' ? (
        <Select
          value={current.value === true ? 'true' : 'false'}
          label="Boolean value"
          options={['true', 'false']}
          onChange={(next) => onChange({ type, value: next === 'true' })}
        />
      ) : (
        <Text
          value={current.value}
          label="Typed value"
          placeholder={type === 'STRING' ? 'value' : '0'}
          inputMode={type === 'INTEGER' || type === 'DECIMAL' ? 'decimal' : 'text'}
          onChange={(next) => onChange({ type, value: next })}
        />
      )}
    </fieldset>
  );
}

function Rows({
  rows,
  disabled,
  addLabel,
  newRow,
  onChange,
  render,
}: {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly disabled: boolean;
  readonly addLabel: string;
  readonly newRow: Readonly<Record<string, unknown>>;
  readonly onChange: (value: unknown) => void;
  readonly render: (
    row: Readonly<Record<string, unknown>>,
    update: (patch: Readonly<Record<string, unknown>>) => void,
  ) => ReactNode;
}) {
  return (
    <div className="grid gap-2">
      {rows.map((row, index) => (
        <div className="grid gap-2 rounded-lg border border-border p-2" key={index}>
          {render(row, (patch) =>
            onChange(
              rows.map((item, position) => (position === index ? { ...item, ...patch } : item)),
            ),
          )}
          <Button
            size="sm"
            variant="destructive-ghost"
            disabled={disabled}
            onClick={() => onChange(rows.filter((_item, position) => position !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => onChange([...rows, newRow])}
      >
        {addLabel}
      </Button>
    </div>
  );
}

function Text({
  value,
  label,
  placeholder,
  inputMode = 'text',
  onChange,
}: {
  readonly value: unknown;
  readonly label: string;
  readonly placeholder: string;
  readonly inputMode?: 'text' | 'decimal';
  readonly onChange: (value: string) => void;
}) {
  return (
    <input
      className={controlClass}
      value={text(value)}
      aria-label={label}
      placeholder={placeholder}
      inputMode={inputMode}
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function Select({
  value,
  label,
  options,
  onChange,
}: {
  readonly value: unknown;
  readonly label: string;
  readonly options: readonly string[];
  readonly onChange: (value: string) => void;
}) {
  const current = text(value);
  const stale = current !== '' && !options.includes(current);
  return (
    <select
      className={controlClass}
      value={current}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    >
      {stale ? <option value={current}>{current.replaceAll('_', ' ')} (unavailable)</option> : null}
      {options.map((option) => (
        <option key={option} value={option}>
          {option.replaceAll('_', ' ')}
        </option>
      ))}
    </select>
  );
}

function FieldSelect({
  value,
  label,
  options,
  onChange,
}: {
  readonly value: unknown;
  readonly label: string;
  readonly options?: readonly NodePropertyOption[];
  readonly onChange: (value: string) => void;
}) {
  const current = text(value);
  if (options === undefined) {
    return <Text value={value} label={label} placeholder="field" onChange={onChange} />;
  }
  const stale = current !== '' && !options.some((option) => option.value === current);
  return (
    <select
      className={controlClass}
      value={current}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Select a field</option>
      {stale ? <option value={current}>{current} (unavailable)</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function filterOperators(dataType: string | undefined): readonly string[] {
  if (dataType === undefined) return FILTER_OPERATORS;
  const base = dataType.toLowerCase().replace(/\(.+\)$/u, '');
  const common = ['EQUALS', 'NOT_EQUALS', 'IN', 'IS_NULL', 'IS_NOT_NULL'];
  if (['string', 'varchar', 'char', 'text'].includes(base)) {
    return [...common, 'CONTAINS', 'STARTS_WITH', 'ENDS_WITH'];
  }
  if (
    [
      'byte',
      'short',
      'int',
      'integer',
      'long',
      'bigint',
      'float',
      'double',
      'decimal',
      'date',
      'timestamp',
    ].includes(base)
  ) {
    return [
      ...common,
      'GREATER_THAN',
      'GREATER_THAN_OR_EQUALS',
      'LESS_THAN',
      'LESS_THAN_OR_EQUALS',
    ];
  }
  return common;
}

function aggregationFunctions(dataType: string | undefined): readonly string[] {
  if (dataType === undefined) return ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT'];
  const base = dataType.toLowerCase().replace(/\(.+\)$/u, '');
  return [
    'byte',
    'short',
    'int',
    'integer',
    'long',
    'bigint',
    'float',
    'double',
    'decimal',
  ].includes(base)
    ? ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT']
    : ['MIN', 'MAX', 'COUNT'];
}

function records(
  value: unknown,
  fallback?: Readonly<Record<string, unknown>>,
): readonly Readonly<Record<string, unknown>>[] {
  const parsed = Array.isArray(value)
    ? value
        .map(record)
        .filter((item): item is Readonly<Record<string, unknown>> => item !== undefined)
    : [];
  return parsed.length === 0 && fallback ? [fallback] : parsed;
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function typedDefault(): Readonly<Record<string, unknown>> {
  return { type: 'STRING', value: '' };
}

function defaultForType(type: string): unknown {
  if (type === 'BOOLEAN') return false;
  if (type === 'NULL') return null;
  return '';
}

function list(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function splitList(value: string): readonly string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
