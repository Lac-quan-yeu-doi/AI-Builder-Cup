import type { ChartActor } from '@application/chart/chart-authoring.use-cases';
import type { ICanonicalChartRepository } from '@application/chart/interfaces/i-chart.repository';
import type { ChartRunEvent } from '@application/chart/chart-query.executor';
import type { ChartRuntimeUseCases } from '@application/chart/chart-runtime.use-cases';
import type { DashboardFilterApplication } from '@application/dashboard/dashboard-execution.models';
import type {
  DashboardCardExecutorResult,
  IDashboardCardExecutor,
} from '@application/dashboard/interfaces/i-dashboard-card-executor';
import type { IDashboardCollectionAuthorizationReader } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { QueryDefinition } from '@domain/chart/models/query-definition';
import type { Expression, LiteralValueType } from '@domain/chart/models/expression';

export class CanonicalChartDashboardCardExecutor implements IDashboardCardExecutor {
  public constructor(
    private readonly charts: ICanonicalChartRepository,
    private readonly runtime: ChartRuntimeUseCases,
    private readonly collections: IDashboardCollectionAuthorizationReader,
  ) {}

  public async execute(
    input: Parameters<IDashboardCardExecutor['execute']>[0],
  ): Promise<DashboardCardExecutorResult> {
    const current = await this.charts.findCanonicalById(
      input.principal.organizationId,
      input.chartId,
    );
    if (current === null || !current.chart.collectionId || current.chart.archivedAt !== null)
      return { state: 'RESTRICTED', message: 'This chart is unavailable.' };
    try {
      await this.collections.requireAccess(current.chart.collectionId, input.principal, 'VIEW');
    } catch {
      return { state: 'RESTRICTED', message: 'This chart is unavailable.' };
    }
    const revision =
      input.revisionNumber === null || current.revision.revisionNumber === input.revisionNumber
        ? current.revision
        : (await this.charts.listRevisions(input.principal.organizationId, input.chartId)).find(
            (item) => item.revisionNumber === input.revisionNumber,
          );
    if (!revision) return { state: 'RESTRICTED', message: 'This chart revision is unavailable.' };

    const actor: ChartActor = input.principal;
    const prepared = applyFilters(revision.queryDefinition, input.filters);
    const run = await this.runtime.previewQuery({ actor, ...prepared });
    return collect(run.runId, run.stream);
  }
}

function applyFilters(
  definition: QueryDefinition,
  filters: readonly DashboardFilterApplication[],
): {
  readonly queryDefinition: QueryDefinition;
  readonly parameterValues: Readonly<Record<string, unknown>>;
} {
  if (definition.mode === 'NATIVE') {
    const parameterValues = Object.fromEntries(
      filters
        .filter((item) => item.target.kind === 'NATIVE_QUERY_VARIABLE' && item.value !== null)
        .map((item) => [
          (item.target as Extract<typeof item.target, { kind: 'NATIVE_QUERY_VARIABLE' }>)
            .variableKey,
          item.value,
        ]),
    );
    return { queryDefinition: definition, parameterValues };
  }
  const visualFilters = filters
    .filter(
      (item) =>
        item.target.kind === 'FIELD' &&
        item.value !== null &&
        !['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'].includes(item.operator),
    )
    .map(toVisualExpression);
  return {
    queryDefinition: applyTimeGrouping(
      { ...definition, filters: [...definition.filters, ...visualFilters] },
      filters,
    ),
    parameterValues: {},
  };
}

function applyTimeGrouping(
  definition: Extract<QueryDefinition, { mode: 'VISUAL' }>,
  filters: readonly DashboardFilterApplication[],
): Extract<QueryDefinition, { mode: 'VISUAL' }> {
  const grouping = filters.find(
    (item) =>
      item.target.kind === 'FIELD' &&
      ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'].includes(item.operator),
  );
  if (!grouping || grouping.target.kind !== 'FIELD' || grouping.value === null) return definition;
  if (typeof grouping.value !== 'string') throw new Error('Dashboard time grouping is invalid.');
  const unit = grouping.value.toLowerCase();
  if (!['day', 'week', 'month', 'quarter', 'year'].includes(unit)) {
    throw new Error('Dashboard time grouping is invalid.');
  }
  const separator = grouping.target.fieldId.indexOf('.');
  if (separator <= 0 || separator === grouping.target.fieldId.length - 1) {
    throw new Error('Dashboard time grouping target is invalid.');
  }
  const relation = grouping.target.fieldId.slice(0, separator);
  const fieldName = grouping.target.fieldId.slice(separator + 1);
  return {
    ...definition,
    breakouts: definition.breakouts.map((expression) =>
      expression.kind === 'FIELD' &&
      expression.relation === relation &&
      expression.field === fieldName
        ? {
            kind: 'CALL' as const,
            function: 'date_trunc',
            arguments: [literal(unit), expression],
          }
        : expression,
    ),
  };
}

function toVisualExpression(filter: DashboardFilterApplication): Expression {
  if (filter.target.kind !== 'FIELD') throw new Error('Visual filters require a field target.');
  const separator = filter.target.fieldId.indexOf('.');
  if (separator <= 0 || separator === filter.target.fieldId.length - 1)
    throw new Error('Invalid field target.');
  const field: Expression = {
    kind: 'FIELD',
    relation: filter.target.fieldId.slice(0, separator),
    field: filter.target.fieldId.slice(separator + 1),
  };
  const values = Array.isArray(filter.value) ? filter.value : [filter.value];
  if (filter.operator === 'RELATIVE_DATE') {
    const range = relativeDateRange(values[0], new Date());
    return {
      kind: 'BINARY',
      operator: 'AND',
      left: { kind: 'BINARY', operator: 'GTE', left: field, right: literal(range[0]) },
      right: { kind: 'BINARY', operator: 'LTE', left: field, right: literal(range[1]) },
    };
  }
  if ((filter.operator === 'BETWEEN' || filter.operator === 'DATE_RANGE') && values.length === 2) {
    return {
      kind: 'BINARY',
      operator: 'AND',
      left: { kind: 'BINARY', operator: 'GTE', left: field, right: literal(values[0]) },
      right: { kind: 'BINARY', operator: 'LTE', left: field, right: literal(values[1]) },
    };
  }
  if (filter.operator === 'CONTAINS' || filter.operator === 'STARTS_WITH') {
    return {
      kind: 'BINARY',
      operator: 'EQ',
      left: {
        kind: 'CALL',
        function: filter.operator === 'CONTAINS' ? 'contains' : 'starts_with',
        arguments: [field, literal(values[0])],
      },
      right: literal(true),
    };
  }
  if (values.length > 1 && (filter.operator === 'IS' || filter.operator === 'IS_NOT')) {
    const comparison = filter.operator === 'IS' ? 'EQ' : 'NOT_EQ';
    const junction = filter.operator === 'IS' ? 'OR' : 'AND';
    const comparisons = values.map<Expression>((value) => ({
      kind: 'BINARY',
      operator: comparison,
      left: field,
      right: literal(value),
    }));
    return comparisons.slice(1).reduce<Expression>(
      (left, right) => ({
        kind: 'BINARY',
        operator: junction,
        left,
        right,
      }),
      comparisons[0]!,
    );
  }
  const operator =
    (
      {
        IS: 'EQ',
        EQUAL: 'EQ',
        SINGLE_DATE: 'EQ',
        ALL_OPTIONS: 'EQ',
        IS_NOT: 'NOT_EQ',
        NOT_EQUAL: 'NOT_EQ',
        GREATER_THAN: 'GT',
        LESS_THAN: 'LT',
      } as const
    )[filter.operator] ?? 'EQ';
  return { kind: 'BINARY', operator, left: field, right: literal(values[0]) };
}

export function relativeDateRange(value: unknown, now: Date): readonly [string, string] {
  if (typeof value !== 'string') throw new Error('Relative date value is invalid.');
  const end = startOfUtcDay(now);
  const start = new Date(end);
  if (value === 'TODAY') return [formatUtcDate(start), formatUtcDate(end)];
  if (value === 'YESTERDAY') {
    start.setUTCDate(start.getUTCDate() - 1);
    return [formatUtcDate(start), formatUtcDate(start)];
  }
  const days =
    value === 'PREVIOUS_7_DAYS'
      ? 7
      : value === 'PREVIOUS_30_DAYS'
        ? 30
        : value === 'PREVIOUS_3_MONTHS'
          ? 90
          : value === 'PREVIOUS_12_MONTHS'
            ? 365
            : null;
  if (days !== null) {
    start.setUTCDate(start.getUTCDate() - (days - 1));
    return [formatUtcDate(start), formatUtcDate(end)];
  }
  if (value === 'PREVIOUS_MONTH') {
    const previousMonthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0));
    const previousMonthStart = new Date(
      Date.UTC(previousMonthEnd.getUTCFullYear(), previousMonthEnd.getUTCMonth(), 1),
    );
    return [formatUtcDate(previousMonthStart), formatUtcDate(previousMonthEnd)];
  }
  throw new Error('Relative date value is invalid.');
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function formatUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function literal(value: unknown): Expression {
  if (
    value !== null &&
    value !== undefined &&
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    throw new Error('Dashboard filter values must be scalar.');
  }
  const normalized = value ?? null;
  const valueType: LiteralValueType =
    normalized === null
      ? 'NULL'
      : typeof normalized === 'number'
        ? 'NUMBER'
        : typeof normalized === 'boolean'
          ? 'BOOLEAN'
          : /^\d{4}-\d{2}-\d{2}/.test(String(normalized))
            ? 'DATE'
            : 'STRING';
  return { kind: 'LITERAL', valueType, value: normalized };
}

async function collect(
  runId: string,
  stream: AsyncIterable<ChartRunEvent>,
): Promise<DashboardCardExecutorResult> {
  let columns: unknown = [];
  const rows: unknown[] = [];
  let rowCount = 0;
  for await (const event of stream) {
    if (event.type === 'COLUMNS') columns = event.columns;
    if (event.type === 'ROWS') rows.push(...event.rows);
    if (event.type === 'SUCCEEDED') rowCount = event.rowCount;
    if (event.type === 'TIMED_OUT')
      return { state: 'TIMEOUT', message: 'The chart query timed out.' };
    if (event.type === 'FAILED') return { state: 'ERROR', message: 'The chart query failed.' };
  }
  return { state: 'SUCCESS', result: { runId, columns, rows, rowCount } };
}
