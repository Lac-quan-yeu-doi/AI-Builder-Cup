// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { expect, vi } from 'vitest';

import { useAnalyticsRecentsStore } from '@/app/_stores/analytics-recents.store';
import { renderUi } from '@/tests/support/render-ui';
import {
  createDefaultVisualization,
  type ActiveChartResult,
  type ChartDraft,
  type ChartPreview,
  type NativeQueryDefinition,
  type VisualQueryDefinition,
} from '@/src/entities/models/canonical-chart';
import {
  ChartBuilderScreen,
  type ChartBuilderScreenProps,
} from '@/app/(workspace)/charts/_components/chart-builder-screen';

export function makeVisualQuery(
  overrides: Partial<VisualQueryDefinition> = {},
): VisualQueryDefinition {
  const context = overrides.context ?? { catalog: 'iceberg', schema: 'analytics' };
  return {
    schemaVersion: 1,
    mode: 'VISUAL',
    context,
    parameters: [],
    source: {
      table: { ...context, table: 'orders' },
      alias: 'source',
    },
    joins: [],
    projections: [],
    customExpressions: [],
    filters: [],
    aggregations: [],
    breakouts: [],
    postAggregationFilters: [],
    orderBy: [],
    ...overrides,
  };
}

export function makeNativeQuery(
  overrides: Partial<NativeQueryDefinition> = {},
): NativeQueryDefinition {
  return {
    schemaVersion: 1,
    mode: 'NATIVE',
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    sql: 'SELECT region, revenue FROM orders',
    ...overrides,
  };
}

export function makeChartDraft(overrides: Partial<ChartDraft> = {}): ChartDraft {
  return {
    title: 'Revenue by region',
    description: null,
    collectionId: 'collection-1',
    queryDefinition: makeVisualQuery(),
    visualizationDefinition: createDefaultVisualization('TABLE'),
    outputSchema: [
      { name: 'region', type: 'VARCHAR', family: 'STRING' },
      { name: 'revenue', type: 'DOUBLE', family: 'NUMBER' },
    ],
    parameterValues: {},
    ...overrides,
  };
}

export function makePreview(overrides: Partial<ChartPreview> = {}): ChartPreview {
  const preview: ChartPreview = {
    runId: 'run-1',
    columns: [
      { name: 'region', type: 'VARCHAR', family: 'STRING' },
      { name: 'revenue', type: 'DOUBLE', family: 'NUMBER' },
    ],
    rows: [
      ['west', 1250],
      ['east', 980],
    ],
    rowCount: 2,
    byteCount: 64,
    truncated: false,
    ...overrides,
  };
  return preview;
}

export function makeQueryPreview(overrides: Partial<ChartPreview> = {}): ChartPreview {
  return makePreview(overrides);
}

export function makeBuilderControllers(
  overrides: Partial<ChartBuilderScreenProps['controllers']> = {},
): ChartBuilderScreenProps['controllers'] {
  const base = {
    queryPreview: vi.fn().mockResolvedValue(makeQueryPreview()),
    preview: vi.fn().mockResolvedValue(makePreview()),
    create: vi.fn().mockResolvedValue({ id: 'chart-1' }),
    update: vi.fn().mockResolvedValue({ id: 'chart-1' }),
    saveAsNew: vi.fn().mockResolvedValue({ id: 'chart-2' }),
    listCollections: vi.fn().mockResolvedValue([
      {
        id: 'collection-1',
        organizationId: 'org-1',
        parentId: 'root-1',
        name: 'Personal',
        description: null,
        kind: 'PERSONAL',
        access: 'CURATE',
        chartCount: 0,
        archivedAt: null,
        children: [],
      },
    ]),
    renderer: { compile: vi.fn().mockReturnValue(null) },
    listCatalogs: vi.fn().mockResolvedValue([{ name: 'iceberg', jdbcCatalogIdentity: 'iceberg' }]),
    listNamespaces: vi.fn().mockResolvedValue([
      { catalog: 'iceberg', name: 'analytics' },
      { catalog: 'iceberg', name: 'kasadata' },
    ]),
    listTables: vi.fn().mockResolvedValue([
      { catalog: 'iceberg', schema: 'analytics', name: 'orders', tableType: 'TABLE' },
      { catalog: 'iceberg', schema: 'analytics', name: 'order_items', tableType: 'TABLE' },
    ]),
    loadTableMetadata: vi.fn().mockImplementation(async (ref) => ({
      catalog: ref.catalog,
      schema: ref.schema,
      name: ref.table,
      columns: [
        { name: 'id', dataType: 'BIGINT', nullable: false, ordinalPosition: 1 },
        { name: 'created_at', dataType: 'DATE', nullable: false, ordinalPosition: 2 },
        { name: 'status', dataType: 'VARCHAR', nullable: true, ordinalPosition: 3 },
        { name: 'region', dataType: 'VARCHAR', nullable: true, ordinalPosition: 4 },
        { name: 'revenue', dataType: 'DOUBLE', nullable: true, ordinalPosition: 5 },
      ],
    })),
  };
  return Object.freeze({
    ...base,
    ...overrides,
  }) as unknown as ChartBuilderScreenProps['controllers'];
}

export interface ChartBuilderTestUser {
  click(element: Element): Promise<void>;
  type(element: Element, value: string): Promise<void>;
  clear(element: Element): Promise<void>;
  selectOptions(element: Element, value: string): Promise<void>;
}

function testUser(): ChartBuilderTestUser {
  return {
    async click(element) {
      // Radix activates a tab on pointer-down; a bare click event never
      // reaches its handler, so a real click has to be simulated as one.
      if (element.getAttribute('role') === 'tab') fireEvent.mouseDown(element);
      fireEvent.click(element);
      await Promise.resolve();
    },
    async type(element, value) {
      const target = element as HTMLInputElement | HTMLTextAreaElement;
      fireEvent.change(element, { target: { value: `${target.value}${value}` } });
      await Promise.resolve();
    },
    async clear(element) {
      fireEvent.change(element, { target: { value: '' } });
      await Promise.resolve();
    },
    async selectOptions(element, value) {
      fireEvent.change(element, { target: { value } });
      await Promise.resolve();
    },
  };
}

export interface RenderChartBuilderOptions {
  readonly controllers?: Partial<ChartBuilderScreenProps['controllers']>;
  readonly initialCollectionId?: string;
  readonly initialDraft?: ChartDraft;
  readonly chartId?: string;
  readonly expectedRevision?: number;
}

/** Zustand lives at module scope, so one case's recents are the next case's
 * fixture — a table picked in one reappeared in another's browse column and
 * made "orders" ambiguous. */
export function resetChartBuilderRecents(): void {
  useAnalyticsRecentsStore.getState().clear();
}

export function renderChartBuilder(options: RenderChartBuilderOptions = {}): RenderResult & {
  readonly user: ChartBuilderTestUser;
  readonly controllers: ChartBuilderScreenProps['controllers'];
} {
  const controllers = makeBuilderControllers(options.controllers);
  const rendered = renderUi(
    <ChartBuilderScreen
      controllers={controllers}
      initialCollectionId={options.initialCollectionId}
      initialDraft={options.initialDraft}
      chartId={options.chartId}
      expectedRevision={options.expectedRevision}
    />,
  );
  return { ...rendered, user: testUser(), controllers };
}

async function clickFirstNamed(user: ChartBuilderTestUser, name: string): Promise<void> {
  // Anchored: `orders` also matches `daily_orders`, and the browse columns show
  // both at once. The visual spec has always anchored for the same reason.
  const matcher = new RegExp(`^${name}(?:\\s|$)`, 'iu');
  const element =
    screen.queryByRole('button', { name: matcher }) ??
    screen.queryByRole('option', { name: matcher }) ??
    screen.queryByText(matcher);
  if (!element) throw new Error(`Could not find chart-builder control: ${name}`);
  await user.click(element);
}

export async function chooseQuestionSource(
  user: ChartBuilderTestUser,
  catalog: string,
  schema: string,
  table: string,
): Promise<void> {
  await waitFor(() => expect(screen.getByRole('button', { name: catalog })).toBeTruthy());
  await clickFirstNamed(user, catalog);
  await waitFor(() => expect(screen.getByRole('button', { name: schema })).toBeTruthy());
  await clickFirstNamed(user, schema);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: new RegExp(`^${table}(?:\\s|$)`, 'iu') }),
    ).toBeTruthy(),
  );
  await clickFirstNamed(user, table);
}

export async function addJoin(
  user: ChartBuilderTestUser,
  table: string,
  leftField: string,
  rightField: string,
): Promise<void> {
  await clickFirstNamed(user, 'add join');
  await chooseQuestionSource(user, 'iceberg', 'analytics', table);
  await waitFor(() => expect(screen.getByRole('region', { name: /^Join data/i })).toBeTruthy());
  await chooseGroupedField(user, 'Join 1 left field 1', leftField);
  await chooseGroupedField(user, 'Join 1 right field 1', rightField);
}

export async function addVisualFilter(
  user: ChartBuilderTestUser,
  fieldName: string,
  operator: string,
  valueSpec: { readonly type?: string; readonly value: string } = { value: '' },
): Promise<void> {
  if (!screen.queryByTestId('filter-clause-editor')) {
    await clickFirstNamed(user, 'Add filters to narrow your answer');
  }

  await clickFirstNamed(user, 'Filter field');
  const [relation = '', ...fieldParts] = fieldName.split('.');
  const fieldLabel = humanizeTestLabel(fieldParts.join('.') || relation);
  const groupLabel = `${humanizeTestLabel(relation)} fields`;
  const group = screen.getByRole('button', { name: groupLabel });
  if (group.getAttribute('aria-expanded') !== 'true') await user.click(group);
  await user.click(screen.getByRole('option', { name: fieldLabel }));

  await user.click(screen.getByRole('button', { name: 'Filter operator' }));
  const operatorLabel = filterOperatorTestLabel(operator);
  await user.click(screen.getByRole('button', { name: new RegExp(`^${operatorLabel}$`, 'i') }));

  if (valueSpec.type) {
    // Value controls are inferred from catalog metadata; the type hint is retained for callers.
    void valueSpec.type;
  }
  const filterValue = screen.getByLabelText(/^filter value$/i);
  await user.type(filterValue, valueSpec.value);
  const addFilterButtons = screen.getAllByRole('button', { name: /add filter/i });
  await user.click(addFilterButtons[addFilterButtons.length - 1]!);
}

function filterOperatorTestLabel(operator: string): string {
  const labels: Record<string, string> = {
    EQ: 'is',
    NOT_EQ: 'is not',
    GT: 'greater than',
    GTE: 'greater than or equal to',
    LT: 'less than',
    LTE: 'less than or equal to',
    IS_NULL: 'is empty',
    IS_NOT_NULL: 'is not empty',
  };
  return labels[operator] ?? operator;
}

function humanizeTestLabel(value: string): string {
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

export async function addAggregation(
  user: ChartBuilderTestUser,
  functionName = 'COUNT',
  fieldName = '',
  alias = 'aggregation_1',
): Promise<void> {
  if (!screen.queryByTestId('measure-editor')) {
    const trigger =
      screen.queryByRole('button', { name: /^Pick a function or metric$/i }) ??
      screen.getByRole('button', { name: /^Add measure$/i });
    await user.click(trigger);
  }
  const functionLabel = aggregationFunctionTestLabel(functionName, fieldName);
  await user.click(screen.getByRole('option', { name: new RegExp(`^${functionLabel}$`, 'i') }));
  if (fieldName) await chooseGroupedField(user, 'Measure field', fieldName);
  const aliasField = screen.getByRole('textbox', { name: /aggregation alias/i });
  await user.clear(aliasField);
  await user.type(aliasField, alias);
  const confirmButtons = screen.getAllByRole('button', { name: /add measure|update measure/i });
  await user.click(confirmButtons[confirmButtons.length - 1]!);
}

export async function addBreakout(user: ChartBuilderTestUser, fieldName: string): Promise<void> {
  if (!screen.queryByTestId('breakout-editor')) {
    const trigger =
      screen.queryByRole('button', { name: /^Pick a column to group by$/i }) ??
      screen.getByRole('button', { name: /^Add breakout$/i });
    await user.click(trigger);
  }
  await chooseGroupedField(user, 'Breakout field', fieldName);
}

export async function addSort(
  user: ChartBuilderTestUser,
  fieldName: string,
  direction = 'DESC',
): Promise<void> {
  if (!screen.queryByTestId('sort-editor')) {
    await clickFirstNamed(user, 'Sort');
  }
  await chooseGroupedField(user, 'Sort field', fieldName);
  await user.click(screen.getByRole('button', { name: /sort direction/i }));
  await user.click(
    screen.getByRole('option', { name: direction === 'ASC' ? 'Ascending' : 'Descending' }),
  );
  const confirmButtons = screen.getAllByRole('button', { name: /add sort|update sort/i });
  await user.click(confirmButtons[confirmButtons.length - 1]!);
}

export async function setQueryLimit(user: ChartBuilderTestUser, limit: number): Promise<void> {
  if (!screen.queryByTestId('limit-editor')) {
    await clickFirstNamed(user, 'Limit');
  }
  const field = screen.getByRole('spinbutton', { name: /query limit/i });
  await user.clear(field);
  await user.type(field, String(limit));
  await user.click(screen.getByRole('button', { name: /apply limit/i }));
}

async function chooseGroupedField(
  user: ChartBuilderTestUser,
  pickerName: string,
  fieldName: string,
): Promise<void> {
  const picker = screen.getByRole('button', { name: new RegExp(`^${pickerName}$`, 'i') });
  await user.click(picker);

  const [relation = '', ...fieldParts] = fieldName.split('.');
  const fieldLabel = humanizeTestLabel(fieldParts.join('.') || relation);
  const preferredGroupLabel = fieldParts.length
    ? `${humanizeTestLabel(relation)} fields`
    : 'Query result fields';
  const preferredGroup = screen.queryByRole('button', {
    name: new RegExp(`^${preferredGroupLabel}$`, 'i'),
  });
  if (preferredGroup) {
    if (preferredGroup.getAttribute('aria-expanded') !== 'true') await user.click(preferredGroup);
    const option = screen.queryByRole('option', { name: new RegExp(`^${fieldLabel}$`, 'i') });
    if (option) {
      await user.click(option);
      return;
    }
  }

  // Source aliases can differ from their table names (for example `source` → `orders`).
  // Walk the visible table groups and select the first group containing the requested field.
  const groups = screen.getAllByRole('button', { name: / fields$/i });
  for (const group of groups) {
    if (group.getAttribute('aria-expanded') !== 'true') await user.click(group);
    const option = screen.queryByRole('option', { name: new RegExp(`^${fieldLabel}$`, 'i') });
    if (option) {
      await user.click(option);
      return;
    }
  }
  throw new Error(`Could not find grouped field: ${fieldName}`);
}

function aggregationFunctionTestLabel(functionName: string, fieldName: string): string {
  if (functionName === 'COUNT' && !fieldName) return 'Count rows';
  if (functionName === 'COUNT') return 'Count a field';
  const labels: Record<string, string> = {
    DISTINCT_COUNT: 'Distinct count',
    SUM: 'Sum',
    AVG: 'Average',
    MIN: 'Minimum',
    MAX: 'Maximum',
  };
  return labels[functionName] ?? functionName;
}

export async function runPreview(user: ChartBuilderTestUser): Promise<void> {
  await clickFirstNamed(user, 'run preview|visualize');
}

export type { ActiveChartResult };
