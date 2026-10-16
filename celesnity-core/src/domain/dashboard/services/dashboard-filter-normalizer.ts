import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';
import type {
  DashboardFilter,
  DashboardFilterSemanticType,
} from '@domain/dashboard/models/dashboard-filter';

const OPERATORS: Readonly<Record<DashboardFilterSemanticType, readonly string[]>> = {
  DATE_PICKER: ['SINGLE_DATE', 'DATE_RANGE', 'RELATIVE_DATE', 'ALL_OPTIONS'],
  TIME_GROUPING: ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'],
  LOCATION: ['IS', 'IS_NOT', 'CONTAINS', 'STARTS_WITH'],
  TEXT_CATEGORY: ['IS', 'IS_NOT', 'CONTAINS', 'STARTS_WITH'],
  NUMBER: ['EQUAL', 'NOT_EQUAL', 'BETWEEN', 'GREATER_THAN', 'LESS_THAN'],
  BOOLEAN: ['IS'],
  ID: ['IS', 'IS_NOT'],
};

export type NormalizedDashboardFilterValue =
  string | number | boolean | null | readonly (string | number | boolean)[];

export function validateDashboardFilter(filter: DashboardFilter): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(filter.slug)) {
    throw DashboardError.validation(`Filter ${filter.id} requires a URL-safe slug.`);
  }
  if (!OPERATORS[filter.semanticType].includes(filter.operator)) {
    throw DashboardError.validation(`Filter ${filter.id} has an unsupported operator.`);
  }
  if (filter.multiple && ['BETWEEN', 'DATE_RANGE'].includes(filter.operator)) {
    throw DashboardError.validation(
      `Filter ${filter.id} cannot combine multiple mode with a range.`,
    );
  }
  if (filter.defaultValue !== null && filter.defaultValue !== undefined) {
    normalizeDashboardFilterValue(
      { ...filter, required: false, defaultValue: null },
      filter.defaultValue,
    );
  }
}

export function normalizeDashboardFilterValue(
  filter: DashboardFilter,
  supplied: unknown,
): NormalizedDashboardFilterValue {
  const candidate = isEmpty(supplied) ? filter.defaultValue : supplied;
  if (isEmpty(candidate)) {
    if (filter.required) throw DashboardError.validation(`Filter ${filter.id} requires a value.`);
    return null;
  }
  if (filter.multiple) {
    if (!Array.isArray(candidate)) {
      throw DashboardError.validation(`Filter ${filter.id} requires a list of values.`);
    }
    return candidate.map((value) => normalizeScalar(filter.semanticType, value));
  }
  if (Array.isArray(candidate)) {
    if (filter.operator === 'BETWEEN' || filter.operator === 'DATE_RANGE') {
      if (candidate.length !== 2)
        throw DashboardError.validation(`Filter ${filter.id} requires two range values.`);
      return candidate.map((value) => normalizeScalar(filter.semanticType, value));
    }
    throw DashboardError.validation(`Filter ${filter.id} requires one value.`);
  }
  return normalizeScalar(filter.semanticType, candidate);
}

function normalizeScalar(
  type: DashboardFilterSemanticType,
  value: unknown,
): string | number | boolean {
  if (type === 'NUMBER') {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed))
      throw DashboardError.validation('A numeric dashboard filter value is invalid.');
    return parsed;
  }
  if (type === 'BOOLEAN') {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw DashboardError.validation('A boolean dashboard filter value is invalid.');
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw DashboardError.validation('A dashboard filter value is invalid.');
  }
  return value.trim();
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}
