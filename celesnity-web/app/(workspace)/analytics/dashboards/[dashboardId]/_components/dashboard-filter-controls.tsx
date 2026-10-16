'use client';

import { useState } from 'react';
import type { DashboardFilter } from '@/src/entities/models/dashboard';
import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';

const RELATIVE_DATE_OPTIONS = [
  ['TODAY', 'Today'],
  ['YESTERDAY', 'Yesterday'],
  ['PREVIOUS_7_DAYS', 'Previous 7 days'],
  ['PREVIOUS_30_DAYS', 'Previous 30 days'],
  ['PREVIOUS_MONTH', 'Previous month'],
  ['PREVIOUS_3_MONTHS', 'Previous 3 months'],
  ['PREVIOUS_12_MONTHS', 'Previous 12 months'],
] as const;

export function DashboardFilterControls({
  filters,
  values,
  onChange,
}: {
  readonly filters: readonly DashboardFilter[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (filter: DashboardFilter, value: unknown) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <div key={filter.id} className="relative">
          <Button
            type="button"
            variant="outline"
            aria-label={filter.label}
            onClick={() => setOpenId((current) => (current === filter.id ? null : filter.id))}
          >
            {filter.label}
            {displayValue(values[filter.id]) ? `: ${displayValue(values[filter.id])}` : ''}
            {filter.required ? ' *' : ''}
          </Button>
          {openId === filter.id ? (
            <label className="absolute top-11 left-0 z-30 grid min-w-64 gap-2 rounded-lg border border-border bg-popover p-3 text-caption font-medium text-popover-foreground shadow-lg">
              {filter.label}
              {filter.semanticType === 'TIME_GROUPING' ? (
                <select
                  aria-label={`${filter.label} value`}
                  className="h-9 rounded-md border border-input bg-background px-3 text-body-sm text-foreground"
                  value={scalarValue(values[filter.id])}
                  onChange={(event) => onChange(filter, event.target.value || null)}
                >
                  <option value="">Original grouping</option>
                  {['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'].map((unit) => (
                    <option key={unit} value={unit}>
                      {unit[0]}
                      {unit.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              ) : filter.semanticType === 'DATE_PICKER' && filter.operator === 'RELATIVE_DATE' ? (
                <select
                  aria-label={`${filter.label} value`}
                  className="h-9 rounded-md border border-input bg-background px-3 text-body-sm text-foreground"
                  value={scalarValue(values[filter.id])}
                  onChange={(event) => onChange(filter, event.target.value || null)}
                >
                  <option value="">No default</option>
                  {RELATIVE_DATE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : filter.semanticType === 'DATE_PICKER' && filter.operator === 'DATE_RANGE' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    aria-label={`${filter.label} start`}
                    type="date"
                    value={rangeValue(values[filter.id], 0)}
                    onChange={(event) =>
                      onChange(filter, updateRangeValue(values[filter.id], 0, event.target.value))
                    }
                  />
                  <Input
                    aria-label={`${filter.label} end`}
                    type="date"
                    value={rangeValue(values[filter.id], 1)}
                    onChange={(event) =>
                      onChange(filter, updateRangeValue(values[filter.id], 1, event.target.value))
                    }
                  />
                </div>
              ) : filter.semanticType === 'BOOLEAN' ? (
                <select
                  aria-label={`${filter.label} value`}
                  className="h-9 rounded-md border border-input bg-background px-3 text-body-sm text-foreground"
                  value={
                    values[filter.id] === true ? 'true' : values[filter.id] === false ? 'false' : ''
                  }
                  onChange={(event) =>
                    onChange(
                      filter,
                      event.target.value === '' ? null : event.target.value === 'true',
                    )
                  }
                >
                  <option value="">All</option>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              ) : (
                <Input
                  aria-label={`${filter.label} value`}
                  type={
                    filter.semanticType === 'DATE_PICKER'
                      ? 'date'
                      : filter.semanticType === 'NUMBER'
                        ? 'number'
                        : 'text'
                  }
                  value={scalarValue(values[filter.id])}
                  onChange={(event) =>
                    onChange(filter, parseControlValue(filter, event.target.value))
                  }
                  placeholder={filter.required ? 'Required' : 'All'}
                />
              )}
            </label>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function readDashboardFilterValues(
  filters: readonly DashboardFilter[],
  search: string,
): Readonly<Record<string, unknown>> {
  const params = new URLSearchParams(search);
  return Object.fromEntries(
    filters.map((filter) => {
      const values = params.getAll(filter.slug);
      if (values.length === 0) return [filter.id, filter.defaultValue];
      const parsed = values.map((value) => parseUrlValue(filter, value));
      return [
        filter.id,
        filter.multiple || filter.operator === 'DATE_RANGE' || filter.operator === 'BETWEEN'
          ? parsed
          : parsed[0],
      ];
    }),
  );
}

export function writeDashboardFilterValue(
  search: string,
  filter: DashboardFilter,
  value: unknown,
): string {
  const params = new URLSearchParams(search);
  params.delete(filter.slug);
  if (value !== null && value !== undefined && value !== '') {
    for (const item of Array.isArray(value) ? value : [value])
      params.append(filter.slug, String(item));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function parseControlValue(filter: DashboardFilter, value: string): unknown {
  if (value === '') return null;
  if (filter.semanticType === 'NUMBER') return Number(value);
  return value;
}

function parseUrlValue(filter: DashboardFilter, value: string): unknown {
  if (filter.semanticType === 'BOOLEAN')
    return value === 'true' ? true : value === 'false' ? false : filter.defaultValue;
  if (filter.semanticType === 'NUMBER') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : filter.defaultValue;
  }
  return value;
}

function scalarValue(value: unknown): string | number {
  return typeof value === 'string' || typeof value === 'number' ? value : '';
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function rangeValue(value: unknown, index: number): string {
  const item = Array.isArray(value) ? value[index] : undefined;
  return typeof item === 'string' ? item : '';
}

function updateRangeValue(value: unknown, index: number, next: string): readonly string[] | null {
  const range = Array.isArray(value) ? [...value] : ['', ''];
  range[index] = next;
  return range.some(Boolean) ? [String(range[0] ?? ''), String(range[1] ?? '')] : null;
}
