'use client';

import { ChevronDownIcon, PlusIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/app/_components/ui/button';
import type {
  FieldGroupViewModel,
  FieldOptionViewModel,
} from '@/src/interface-adapters/presenters/chart-builder-field.presenter';
import { presentResultFieldGroup } from '@/src/interface-adapters/presenters/chart-builder-field.presenter';
import type { OutputColumn } from '@/src/entities/models/canonical-chart';

import { GroupedFieldPicker } from '../notebook/grouped-field-picker';

export function FieldSelect({
  label,
  value,
  fields,
  onChange,
  allowEmpty = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly fields: readonly OutputColumn[];
  readonly onChange: (value: string) => void;
  readonly allowEmpty?: boolean;
}) {
  const group = presentResultFieldGroup(fields);
  const selected = group.fields.find((field) => field.name === value);
  const editorId = `visualization-${slugify(label)}`;

  return (
    <div className="grid gap-2">
      <span className="text-body-sm font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <GroupedFieldPicker
          editorId={editorId}
          ariaLabel={`${label} field picker`}
          groups={[group]}
          selectedIds={selected ? [selected.id] : []}
          onSelect={(field) => onChange(field.name)}
          trigger={
            <Button
              type="button"
              variant="outline"
              className="h-10 min-w-0 flex-1 justify-between px-3 text-left font-normal"
              aria-label={`${label} field`}
            >
              <span className="min-w-0 truncate">{selected?.label ?? 'Choose a field…'}</span>
              <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            </Button>
          }
        />
        {allowEmpty && value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Clear ${label}`}
            onClick={() => onChange('')}
          >
            <XIcon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function MultiFieldSelect({
  label,
  values,
  fields,
  onChange,
}: {
  readonly label: string;
  readonly values: readonly string[];
  readonly fields: readonly OutputColumn[];
  readonly onChange: (values: readonly string[]) => void;
}) {
  const group = presentResultFieldGroup(fields);
  const selectedFields = values
    .map((value) => group.fields.find((field) => field.name === value))
    .filter((field): field is FieldOptionViewModel => Boolean(field));
  const editorId = `visualization-${slugify(label)}-multiple`;

  function toggle(field: FieldOptionViewModel): void {
    const nextValues = values.includes(field.name)
      ? values.filter((value) => value !== field.name)
      : [...values, field.name];
    onChange(nextValues);
  }

  return (
    <div className="grid gap-2">
      <span className="text-body-sm font-medium text-foreground">{label}</span>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-1.5">
        {selectedFields.map((field) => (
          <span
            key={field.id}
            className="inline-flex min-h-8 items-center gap-1 rounded-md bg-primary px-2 text-body-sm text-primary-foreground"
          >
            <span className="max-w-40 truncate">{field.label}</span>
            <button
              type="button"
              className="rounded-sm p-0.5 hover:bg-primary-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove ${field.label}`}
              onClick={() => toggle(field)}
            >
              <XIcon aria-hidden="true" className="size-3.5" />
            </button>
          </span>
        ))}
        <GroupedFieldPicker
          editorId={editorId}
          ariaLabel={`${label} field picker`}
          groups={[group]}
          selectedIds={selectedFields.map((field) => field.id)}
          mode="MULTIPLE"
          onSelect={toggle}
          onToggle={toggle}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-body-sm font-medium text-primary"
              aria-label={`${label} field`}
            >
              <PlusIcon aria-hidden="true" className="size-4" />
              <span>{selectedFields.length ? 'Add' : 'Choose a field'}</span>
            </Button>
          }
        />
      </div>
    </div>
  );
}

export function SettingRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-body-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

export function fieldGroupForOutputColumns(columns: readonly OutputColumn[]): FieldGroupViewModel {
  return presentResultFieldGroup(columns);
}
