'use client';

import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/app/_components/ui/button';
import { MultiCombobox } from '@/app/_components/ui/combobox';
import { FieldBlock, SelectField, TextField, TextareaField } from '@/app/_components/ui/fields';
import { RadioGroupField } from '@/app/_components/ui/radio-group-field';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { NodePropertyField, NodePropertyOption } from '@/src/entities/models/node-definition';

import {
  AggregationBuilder,
  ColumnMappingBuilder,
  FilterBuilder,
  OrderByBuilder,
  TypedValueEditor,
} from './structured-property-editors';

interface PropertyFieldProps {
  readonly field: NodePropertyField;
  readonly value: unknown;
  readonly disabled: boolean;
  readonly loading?: boolean;
  readonly options?: readonly NodePropertyOption[];
  readonly issue?: string;
  readonly onChange: (value: unknown) => void;
}

export function PropertyField({
  field,
  value,
  disabled,
  loading = false,
  options,
  issue,
  onChange,
}: PropertyFieldProps) {
  const { t } = useTranslation();
  const label = field.required ? field.label : `${field.label} (optional)`;
  const effectiveOptions = options ?? field.options;
  const shared = {
    disabled: disabled || loading,
    label,
    ...(field.description ? { hint: field.description } : {}),
    ...(issue ? { error: issue } : {}),
  };

  const structured = structuredEditor(field.component, value, disabled, effectiveOptions, onChange);
  if (structured) return <FieldBlock {...shared}>{structured}</FieldBlock>;

  if (field.component === 'KEY_VALUE') {
    return (
      <FieldBlock {...shared}>
        <KeyValueEditor
          entries={asEntries(value)}
          disabled={disabled}
          onChange={(entries) => onChange(Object.fromEntries(entries))}
        />
      </FieldBlock>
    );
  }

  if (field.component === 'RADIO' && effectiveOptions) {
    return (
      <RadioGroupField
        {...shared}
        data={effectiveOptions.map(toSelectOption)}
        disabled={disabled || loading}
        onChange={onChange}
        value={asText(value)}
      />
    );
  }

  if (field.component === 'SQL_EDITOR') {
    return (
      <TextareaField
        {...shared}
        rows={field.key === 'sql' ? 10 : 3}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          field.key === 'sql'
            ? t('pipeline.manualSqlPlaceholder')
            : t('pipeline.filterSqlPlaceholder')
        }
        spellCheck={false}
        textareaClassName="font-mono"
        value={asText(value)}
      />
    );
  }

  if (field.component === 'MULTI_SELECT') {
    const values = asList(value);
    if (!effectiveOptions) {
      return (
        <TextField
          {...shared}
          autoComplete="off"
          onChange={(event) => onChange(splitList(event.target.value))}
          placeholder="field_one, field_two"
          value={values.join(', ')}
        />
      );
    }
    return (
      <MultiCombobox
        {...shared}
        data={effectiveOptions.map(toSelectOption)}
        onChange={onChange}
        value={values}
      />
    );
  }

  if (field.component === 'SELECT' && effectiveOptions) {
    return (
      <SelectField
        {...shared}
        data={[
          {
            label: loading ? t('pipeline.loadingValues') : t('pipeline.selectValue'),
            value: '',
          },
          ...effectiveOptions.map(toSelectOption),
        ]}
        onChange={(next) => onChange(next)}
        value={asText(value)}
      />
    );
  }

  return (
    <TextField
      {...shared}
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
      value={asText(value)}
    />
  );
}

function structuredEditor(
  component: NodePropertyField['component'],
  value: unknown,
  disabled: boolean,
  options: readonly NodePropertyOption[] | undefined,
  onChange: (value: unknown) => void,
): ReactNode {
  switch (component) {
    case 'FILTER_BUILDER':
      return (
        <FilterBuilder value={value} disabled={disabled} options={options} onChange={onChange} />
      );
    case 'COLUMN_MAPPING_BUILDER':
      return (
        <ColumnMappingBuilder
          value={value}
          disabled={disabled}
          options={options}
          onChange={onChange}
        />
      );
    case 'ORDER_BY_BUILDER':
      return (
        <OrderByBuilder value={value} disabled={disabled} options={options} onChange={onChange} />
      );
    case 'AGGREGATION_BUILDER':
      return (
        <AggregationBuilder
          value={value}
          disabled={disabled}
          options={options}
          onChange={onChange}
        />
      );
    case 'TYPED_VALUE':
      return <TypedValueEditor value={value} disabled={disabled} onChange={onChange} />;
    default:
      return undefined;
  }
}

function toSelectOption(option: NodePropertyOption) {
  return { label: option.label, value: option.value };
}

interface KeyValueEditorProps {
  readonly entries: readonly (readonly [string, string])[];
  readonly disabled: boolean;
  readonly onChange: (entries: readonly (readonly [string, string])[]) => void;
}

function KeyValueEditor({ entries, disabled, onChange }: KeyValueEditorProps) {
  const rows = entries.length > 0 ? entries : ([['', '']] as const);
  const replace = (index: number, key: string, value: string) =>
    onChange(rows.map((entry, position) => (position === index ? ([key, value] as const) : entry)));

  return (
    <div className="grid gap-2">
      {rows.map((entry, index) => (
        <div className="flex items-center gap-2" key={index}>
          <TextField
            aria-label={`Key ${index + 1}`}
            autoComplete="off"
            disabled={disabled}
            className="flex-1"
            onChange={(event) => replace(index, event.target.value, entry[1])}
            placeholder="key"
            value={entry[0]}
          />
          <TextField
            aria-label={`Value ${index + 1}`}
            autoComplete="off"
            disabled={disabled}
            className="flex-1"
            onChange={(event) => replace(index, entry[0], event.target.value)}
            placeholder="value"
            value={entry[1]}
          />
          <Button
            disabled={disabled}
            onClick={() => onChange(rows.filter((_entry, position) => position !== index))}
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove entry ${index + 1}`}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => onChange([...rows, ['', '']])}
      >
        Add entry
      </Button>
    </div>
  );
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function asEntries(value: unknown): readonly (readonly [string, string])[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  return Object.entries(value).map(
    ([key, entry]) => [key, typeof entry === 'string' ? entry : String(entry)] as const,
  );
}

function splitList(value: string): readonly string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
