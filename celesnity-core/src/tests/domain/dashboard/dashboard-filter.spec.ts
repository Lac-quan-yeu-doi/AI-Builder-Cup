import type { DashboardFilter } from '@domain/dashboard/models/dashboard-filter';
import {
  normalizeDashboardFilterValue,
  validateDashboardFilter,
} from '@domain/dashboard/services/dashboard-filter-normalizer';
import { isDashboardFilterTargetCompatible } from '@domain/dashboard/services/dashboard-filter-compatibility';

describe('Dashboard filter semantics', () => {
  it.each([
    ['DATE_PICKER', 'DATE_RANGE'],
    ['TIME_GROUPING', 'MONTH'],
    ['LOCATION', 'IS'],
    ['TEXT_CATEGORY', 'CONTAINS'],
    ['NUMBER', 'BETWEEN'],
    ['BOOLEAN', 'IS'],
    ['ID', 'IS'],
  ] as const)('accepts %s with its supported operator', (semanticType, operator) => {
    expect(() => validateDashboardFilter(filter({ semanticType, operator }))).not.toThrow();
  });

  it('rejects an operator that does not belong to the semantic type', () => {
    expect(() =>
      validateDashboardFilter(filter({ semanticType: 'BOOLEAN', operator: 'BETWEEN' })),
    ).toThrow('DASHBOARD_INVALID');
  });

  it('uses supplied values before defaults and normalizes scalar types', () => {
    expect(
      normalizeDashboardFilterValue(
        filter({ semanticType: 'NUMBER', operator: 'EQUAL', defaultValue: 7 }),
        '12',
      ),
    ).toBe(12);
    expect(
      normalizeDashboardFilterValue(
        filter({ semanticType: 'BOOLEAN', defaultValue: false }),
        undefined,
      ),
    ).toBe(false);
  });

  it('rejects an empty required value and invalid multiple input', () => {
    expect(() => normalizeDashboardFilterValue(filter({ required: true }), '')).toThrow(
      'DASHBOARD_INVALID',
    );
    expect(() => normalizeDashboardFilterValue(filter({ multiple: true }), 'one')).toThrow(
      'DASHBOARD_INVALID',
    );
  });

  it('matches filter types only to structurally compatible authorized targets', () => {
    expect(
      isDashboardFilterTargetCompatible('NUMBER', {
        kind: 'FIELD',
        fieldId: 'field-1',
        semanticType: 'NUMBER',
      }),
    ).toBe(true);
    expect(
      isDashboardFilterTargetCompatible('NUMBER', {
        kind: 'FIELD',
        fieldId: 'field-2',
        semanticType: 'TEXT_CATEGORY',
      }),
    ).toBe(false);
    expect(
      isDashboardFilterTargetCompatible('DATE_PICKER', {
        kind: 'NATIVE_QUERY_VARIABLE',
        variableKey: 'date',
        semanticType: 'DATE_PICKER',
      }),
    ).toBe(true);
    expect(
      isDashboardFilterTargetCompatible('TEXT_CATEGORY', {
        kind: 'CONTENT_VARIABLE',
        variableName: 'region',
        semanticType: 'TEXT_CATEGORY',
      }),
    ).toBe(true);
    expect(
      isDashboardFilterTargetCompatible('TIME_GROUPING', {
        kind: 'FIELD',
        fieldId: 'orders.created_at',
        semanticType: 'DATE_PICKER',
      }),
    ).toBe(true);
  });
});

function filter(overrides: Partial<DashboardFilter> = {}): DashboardFilter {
  return {
    id: 'filter-1',
    slug: 'region',
    label: 'Region',
    semanticType: 'TEXT_CATEGORY',
    operator: 'IS',
    defaultValue: null,
    required: false,
    multiple: false,
    valuesSource: null,
    placement: { kind: 'TOP_OF_PAGE' },
    order: 0,
    ...overrides,
  };
}
