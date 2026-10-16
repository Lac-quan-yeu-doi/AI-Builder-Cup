'use client';

import { BracesIcon, DatabaseIcon, PlusIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import type {
  ChartDraft,
  NativeQueryDefinition,
  QueryContext,
} from '@/src/entities/models/canonical-chart';
import type { DataSourceBrowserControllers } from '../data-source-picker/data-source-picker.types';
import type { DataSourceSelection } from '../data-source-picker/data-source-picker.types';
import { DataSourcePicker } from '../data-source-picker/data-source-picker';
import { SqlEditor } from '@/app/_components/shared/sql-editor';

export interface NativeQueryEditorProps {
  readonly query: NativeQueryDefinition;
  readonly values: ChartDraft['parameterValues'];
  readonly controllers: DataSourceBrowserControllers;
  readonly onChange: (sql: string) => void;
  readonly onQueryContextChange: (context: QueryContext) => void;
  readonly onParameters: (parameters: NativeQueryDefinition['parameters']) => void;
  readonly onValues: (values: ChartDraft['parameterValues']) => void;
  readonly autoFocus?: boolean;
}

/** Native SQL question editor. Context and parameter controls stay outside SQL text. */
export function NativeQueryEditor({
  query,
  values,
  controllers,
  onChange,
  onQueryContextChange,
  onParameters,
  onValues,
  autoFocus = false,
}: NativeQueryEditorProps) {
  function selectContext(selection: DataSourceSelection): void {
    onQueryContextChange({ catalog: selection.catalog, schema: selection.schema });
  }

  const contextReady = Boolean(query.context.catalog && query.context.schema);

  return (
    <div className="space-y-4" aria-label="Native SQL question">
      <DataSourcePicker mode="CONTEXT" controllers={controllers} onSelect={selectContext} />
      <section
        className="space-y-3 rounded-xl border border-border bg-card p-4"
        aria-label="SQL query"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-body-sm font-semibold">
              <BracesIcon aria-hidden="true" className="size-4 text-primary" />
              Native query
            </h3>
            <p className="text-caption text-muted-foreground">
              Write SQL against the selected Data Catalog catalog and schema. Query values are sent
              as typed parameters and never interpolated in the browser.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2 py-1 text-caption" aria-label="Query context">
            {contextReady ? `${query.context.catalog}.${query.context.schema}` : 'Choose context'}
          </span>
        </div>
        <SqlEditor
          value={query.sql}
          modelKey={`${query.context.catalog}-${query.context.schema}-chart-query`}
          disabled={false}
          onChange={onChange}
          autoFocus={autoFocus}
        />
        <p className="text-caption text-muted-foreground">
          Run preview is available after a catalog and schema are selected.
        </p>
      </section>
      <ParameterEditor
        query={query}
        values={values}
        onParameters={onParameters}
        onValues={onValues}
      />
    </div>
  );
}

function ParameterEditor({
  query,
  values,
  onParameters,
  onValues,
}: {
  readonly query: NativeQueryDefinition;
  readonly values: ChartDraft['parameterValues'];
  readonly onParameters: (parameters: NativeQueryDefinition['parameters']) => void;
  readonly onValues: (values: ChartDraft['parameterValues']) => void;
}) {
  const discovered = Array.from(query.sql.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/gu)).map(
    (match) => match[1],
  );
  const names = Array.from(new Set(discovered));

  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-card p-4"
      aria-label="Query parameters"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-body-sm font-semibold">
            <DatabaseIcon aria-hidden="true" className="size-4 text-primary" />
            Parameters
          </h3>
          <p className="text-caption text-muted-foreground">
            Declare each <code>{'{{parameter}}'}</code> used by the query.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onParameters([
              ...query.parameters,
              { name: `parameter_${query.parameters.length + 1}`, type: 'STRING', required: true },
            ])
          }
        >
          <PlusIcon aria-hidden="true" /> Add parameter
        </Button>
      </div>
      {names.length > 0 ? (
        <p className="text-caption text-muted-foreground">Detected: {names.join(', ')}</p>
      ) : null}
      {query.parameters.map((parameter, index) => (
        <div
          key={`${parameter.name}-${index}`}
          className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[1fr_140px_auto_auto_auto]"
        >
          <Input
            aria-label={`Parameter ${index + 1} name`}
            value={parameter.name}
            onChange={(event) => {
              const next = [...query.parameters];
              next[index] = { ...parameter, name: event.target.value };
              onParameters(next);
            }}
          />
          <select
            aria-label={`Parameter ${index + 1} type`}
            className="h-9 rounded-md border border-input bg-background px-3 text-body-sm"
            value={parameter.type}
            onChange={(event) => {
              const next = [...query.parameters];
              next[index] = {
                ...parameter,
                type: event.target.value as NativeQueryDefinition['parameters'][number]['type'],
              };
              onParameters(next);
            }}
          >
            {(['STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'TIMESTAMP'] as const).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-caption">
            <input
              type="checkbox"
              checked={parameter.required}
              onChange={(event) => {
                const next = [...query.parameters];
                next[index] = { ...parameter, required: event.target.checked };
                onParameters(next);
              }}
            />
            Required
          </label>
          <Input
            aria-label={`Value for ${parameter.name}`}
            value={formatParameterValue(values[parameter.name])}
            placeholder="Value"
            onChange={(event) =>
              onValues({
                ...values,
                [parameter.name]: parseParameterValue(parameter.type, event.target.value),
              })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove parameter ${index + 1}`}
            onClick={() =>
              onParameters(query.parameters.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        </div>
      ))}
    </section>
  );
}

function parseParameterValue(
  type: NativeQueryDefinition['parameters'][number]['type'],
  value: string,
): string | number | boolean | null {
  if (value === '') return null;
  if (type === 'NUMBER') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (type === 'BOOLEAN') return value.toLowerCase() === 'true';
  return value;
}

function formatParameterValue(value: string | number | boolean | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}
