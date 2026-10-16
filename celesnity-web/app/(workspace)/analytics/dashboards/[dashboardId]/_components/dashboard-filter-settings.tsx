'use client';

import { Trash2Icon, XIcon } from 'lucide-react';

import type { DashboardFilterTargetOption } from '@/src/entities/models/dashboard-runtime';
import type {
  DashboardCard,
  DashboardFilter,
  DashboardFilterMapping,
} from '@/src/entities/models/dashboard';
import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import { DashboardFilterTargetMapper } from './dashboard-filter-target-mapper';

const RELATIVE_DATE_OPTIONS = [
  ['TODAY', 'Today'],
  ['YESTERDAY', 'Yesterday'],
  ['PREVIOUS_7_DAYS', 'Previous 7 days'],
  ['PREVIOUS_30_DAYS', 'Previous 30 days'],
  ['PREVIOUS_MONTH', 'Previous month'],
  ['PREVIOUS_3_MONTHS', 'Previous 3 months'],
  ['PREVIOUS_12_MONTHS', 'Previous 12 months'],
] as const;

export function DashboardFilterSettings({
  filter,
  cards,
  options,
  mappings,
  onChange,
  onMappingsChange,
  onRemove,
  onDone,
}: {
  readonly filter: DashboardFilter;
  readonly cards: readonly DashboardCard[];
  readonly options: readonly DashboardFilterTargetOption[];
  readonly mappings: readonly DashboardFilterMapping[];
  readonly onChange: (filter: DashboardFilter) => void;
  readonly onMappingsChange: (mappings: readonly DashboardFilterMapping[]) => void;
  readonly onRemove: () => void;
  readonly onDone: () => void;
}) {
  return (
    <aside
      className="fixed top-13 right-0 z-30 flex h-[calc(100vh-3.25rem)] w-full max-w-96 flex-col border-l border-border bg-background shadow-300"
      aria-label="Filter settings"
    >
      <header className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-body-lg font-semibold">Filter settings</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close filter settings"
          onClick={onDone}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </header>
      <div className="grid flex-1 content-start gap-5 overflow-y-auto p-4">
        <label className="grid gap-1 text-body-sm font-medium">
          Label
          <Input
            aria-label="Filter label"
            value={filter.label}
            onChange={(event) => onChange({ ...filter, label: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-body-sm font-medium">
          Filter or parameter type
          <select
            aria-label="Filter type"
            className="h-10 rounded-md border border-input bg-background px-3"
            value={filter.semanticType}
            onChange={(event) => {
              const type = event.target.value as DashboardFilter['semanticType'];
              onMappingsChange([]);
              onChange({
                ...filter,
                semanticType: type,
                operator: operatorsFor(type)[0]!,
                defaultValue: null,
              });
            }}
          >
            {(
              [
                'DATE_PICKER',
                'TIME_GROUPING',
                'LOCATION',
                'TEXT_CATEGORY',
                'NUMBER',
                'BOOLEAN',
                'ID',
              ] as const
            ).map((type) => (
              <option key={type} value={type}>
                {filterTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-body-sm font-medium">
          Filter operator
          <select
            aria-label="Filter operator"
            className="h-10 rounded-md border border-input bg-background px-3"
            value={filter.operator}
            onChange={(event) => onChange({ ...filter, operator: event.target.value })}
          >
            {operatorsFor(filter.semanticType).map((operator) => (
              <option key={operator} value={operator}>
                {operatorLabel(operator)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-body-sm font-medium">
          Default value
          {filter.semanticType === 'DATE_PICKER' && filter.operator === 'RELATIVE_DATE' ? (
            <select
              aria-label="Default value"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={typeof filter.defaultValue === 'string' ? filter.defaultValue : ''}
              onChange={(event) =>
                onChange({ ...filter, defaultValue: event.target.value || null })
              }
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
              {[0, 1].map((index) => (
                <Input
                  key={index}
                  aria-label={index === 0 ? 'Default start date' : 'Default end date'}
                  type="date"
                  value={defaultRangeValue(filter.defaultValue, index)}
                  onChange={(event) =>
                    onChange({
                      ...filter,
                      defaultValue: updateDefaultRange(
                        filter.defaultValue,
                        index,
                        event.target.value,
                      ),
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <Input
              aria-label="Default value"
              type={
                filter.semanticType === 'DATE_PICKER'
                  ? 'date'
                  : filter.semanticType === 'NUMBER'
                    ? 'number'
                    : 'text'
              }
              value={
                typeof filter.defaultValue === 'string' || typeof filter.defaultValue === 'number'
                  ? filter.defaultValue
                  : ''
              }
              onChange={(event) =>
                onChange({
                  ...filter,
                  defaultValue:
                    event.target.value === ''
                      ? null
                      : filter.semanticType === 'NUMBER'
                        ? Number(event.target.value)
                        : event.target.value,
                })
              }
            />
          )}
        </label>
        {supportsMultiple(filter) ? (
          <label className="flex items-center gap-2 text-body-sm">
            <input
              type="checkbox"
              checked={filter.multiple}
              onChange={(event) =>
                onChange({ ...filter, multiple: event.target.checked, defaultValue: null })
              }
            />
            Allow multiple values
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-body-sm">
          <input
            type="checkbox"
            checked={filter.required}
            onChange={(event) => onChange({ ...filter, required: event.target.checked })}
          />
          Always require a value
        </label>
        <label className="grid gap-1 text-body-sm font-medium">
          Move filter
          <select
            aria-label="Filter placement"
            className="h-10 rounded-md border border-input bg-background px-3"
            value={filter.placement.kind === 'TOP_OF_PAGE' ? 'TOP' : filter.placement.cardId}
            onChange={(event) =>
              onChange({
                ...filter,
                placement:
                  event.target.value === 'TOP'
                    ? { kind: 'TOP_OF_PAGE' }
                    : { kind: 'INLINE_CARD', cardId: event.target.value },
              })
            }
          >
            <option value="TOP">Top of page</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.kind === 'CHART'
                  ? `Chart · ${card.chartId}`
                  : `${card.kind.toLowerCase()} card`}
              </option>
            ))}
          </select>
        </label>
        <DashboardFilterTargetMapper
          filter={filter}
          cards={cards}
          options={options}
          mappings={mappings}
          onChange={onMappingsChange}
        />
      </div>
      <footer className="flex items-center justify-between border-t border-border p-4">
        <Button type="button" variant="ghost" className="text-destructive" onClick={onRemove}>
          <Trash2Icon aria-hidden="true" />
          Remove
        </Button>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </footer>
    </aside>
  );
}

function filterTypeLabel(type: DashboardFilter['semanticType']): string {
  return {
    DATE_PICKER: 'Date picker',
    TIME_GROUPING: 'Time grouping',
    LOCATION: 'Location',
    TEXT_CATEGORY: 'Text or Category',
    NUMBER: 'Number',
    BOOLEAN: 'Boolean',
    ID: 'ID',
  }[type];
}
function operatorsFor(type: DashboardFilter['semanticType']): readonly string[] {
  if (type === 'DATE_PICKER') return ['ALL_OPTIONS', 'SINGLE_DATE', 'DATE_RANGE', 'RELATIVE_DATE'];
  if (type === 'TIME_GROUPING') return ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'];
  if (type === 'NUMBER') return ['EQUAL', 'NOT_EQUAL', 'GREATER_THAN', 'LESS_THAN', 'BETWEEN'];
  if (type === 'TEXT_CATEGORY' || type === 'LOCATION')
    return ['IS', 'IS_NOT', 'CONTAINS', 'STARTS_WITH'];
  if (type === 'ID') return ['IS', 'IS_NOT'];
  return ['IS'];
}
function operatorLabel(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function supportsMultiple(filter: DashboardFilter): boolean {
  return (
    ['LOCATION', 'TEXT_CATEGORY', 'ID'].includes(filter.semanticType) &&
    !['BETWEEN', 'DATE_RANGE'].includes(filter.operator)
  );
}

function defaultRangeValue(value: unknown, index: number): string {
  const item = Array.isArray(value) ? value[index] : undefined;
  return typeof item === 'string' ? item : '';
}

function updateDefaultRange(value: unknown, index: number, next: string): readonly string[] | null {
  const range = Array.isArray(value) ? [...value] : ['', ''];
  range[index] = next;
  return range.some(Boolean) ? [String(range[0] ?? ''), String(range[1] ?? '')] : null;
}
