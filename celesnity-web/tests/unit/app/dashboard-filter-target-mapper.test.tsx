// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DashboardFilterTargetMapper } from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-filter-target-mapper';
import type { DashboardCard, DashboardFilter } from '@/src/entities/models/dashboard';

const filter: DashboardFilter = {
  id: 'filter-1',
  slug: 'date',
  label: 'Date',
  semanticType: 'DATE_PICKER',
  operator: 'ALL_OPTIONS',
  defaultValue: null,
  required: false,
  multiple: false,
  valuesSource: null,
  placement: { kind: 'TOP_OF_PAGE' },
  order: 0,
};
const cards: readonly DashboardCard[] = [
  {
    id: 'card-1',
    tabId: 'tab-1',
    kind: 'CHART',
    chartId: 'chart-1',
    chartRevisionNumber: 1,
    visualizationOverrides: {},
    geometry: { x: 0, y: 0, width: 12, height: 6 },
  },
  {
    id: 'card-2',
    tabId: 'tab-1',
    kind: 'CHART',
    chartId: 'chart-2',
    chartRevisionNumber: 1,
    visualizationOverrides: {},
    geometry: { x: 12, y: 0, width: 12, height: 6 },
  },
];
const options = cards.map((card) => ({
  cardId: card.id,
  targets: [
    {
      kind: 'FIELD' as const,
      fieldId: `${card.id}.created_at`,
      semanticType: 'DATE_PICKER' as const,
    },
  ],
}));

describe('DashboardFilterTargetMapper', () => {
  it('connects one card or all compatible cards using stable targets', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DashboardFilterTargetMapper
        filter={filter}
        cards={cards}
        options={options}
        mappings={[]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Column to filter on Chart · chart-1'), {
      target: { value: 'FIELD:card-1.created_at' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      {
        filterId: 'filter-1',
        cardId: 'card-1',
        target: { kind: 'FIELD', fieldId: 'card-1.created_at' },
      },
    ]);

    rerender(
      <DashboardFilterTargetMapper
        filter={filter}
        cards={cards}
        options={options}
        mappings={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connect all' }));
    expect(onChange).toHaveBeenLastCalledWith([
      {
        filterId: 'filter-1',
        cardId: 'card-1',
        target: { kind: 'FIELD', fieldId: 'card-1.created_at' },
      },
      {
        filterId: 'filter-1',
        cardId: 'card-2',
        target: { kind: 'FIELD', fieldId: 'card-2.created_at' },
      },
    ]);
  });
});
