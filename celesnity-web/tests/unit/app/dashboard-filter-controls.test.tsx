// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DashboardFilterControls,
  readDashboardFilterValues,
  writeDashboardFilterValue,
} from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-filter-controls';
import type { DashboardFilter } from '@/src/entities/models/dashboard';

const filters: readonly DashboardFilter[] = [
  {
    id: 'date',
    slug: 'created-at',
    label: 'Created at',
    semanticType: 'DATE_PICKER',
    operator: 'SINGLE_DATE',
    defaultValue: null,
    required: false,
    multiple: false,
    valuesSource: null,
    placement: { kind: 'TOP_OF_PAGE' },
    order: 0,
  },
  {
    id: 'active',
    slug: 'is-active',
    label: 'Is active',
    semanticType: 'BOOLEAN',
    operator: 'IS',
    defaultValue: true,
    required: false,
    multiple: false,
    valuesSource: null,
    placement: { kind: 'TOP_OF_PAGE' },
    order: 1,
  },
];

afterEach(cleanup);

describe('DashboardFilterControls', () => {
  it('uses valid URL values before defaults and serializes without navigation', () => {
    expect(readDashboardFilterValues(filters, '?created-at=2026-09-05')).toEqual({
      date: '2026-09-05',
      active: true,
    });
    expect(writeDashboardFilterValue('?created-at=2026-09-05', filters[0]!, null)).toBe('');
  });

  it('emits typed values from controls', () => {
    const onChange = vi.fn();
    render(
      <DashboardFilterControls
        filters={filters}
        values={{ date: null, active: true }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Created at' }));
    fireEvent.change(screen.getByLabelText('Created at value'), {
      target: { value: '2026-09-06' },
    });
    expect(onChange).toHaveBeenCalledWith(filters[0], '2026-09-06');
  });

  it('keeps both date-range values in the URL contract', () => {
    const rangeFilter: DashboardFilter = {
      ...filters[0]!,
      id: 'range',
      slug: 'date-range',
      operator: 'DATE_RANGE',
    };
    expect(
      readDashboardFilterValues([rangeFilter], '?date-range=2026-09-01&date-range=2026-09-06'),
    ).toEqual({ range: ['2026-09-01', '2026-09-06'] });

    const onChange = vi.fn();
    render(
      <DashboardFilterControls
        filters={[rangeFilter]}
        values={{ range: null }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Created at' }));
    fireEvent.change(screen.getByLabelText('Created at start'), {
      target: { value: '2026-09-01' },
    });
    expect(onChange).toHaveBeenCalledWith(rangeFilter, ['2026-09-01', '']);
  });
});
