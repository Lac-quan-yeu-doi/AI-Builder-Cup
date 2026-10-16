// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DashboardFilterSettings } from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-filter-settings';
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
const card: DashboardCard = {
  id: 'card-1',
  tabId: 'tab-1',
  kind: 'CHART',
  chartId: 'chart-1',
  chartRevisionNumber: 1,
  visualizationOverrides: {},
  geometry: { x: 0, y: 0, width: 12, height: 6 },
};

describe('DashboardFilterSettings', () => {
  it('changes placement independently and exposes mapping, remove and done controls', () => {
    const onChange = vi.fn();
    const onMappingsChange = vi.fn();
    render(
      <DashboardFilterSettings
        filter={filter}
        cards={[card]}
        options={[
          {
            cardId: card.id,
            targets: [{ kind: 'FIELD', fieldId: 'brands.created_at', semanticType: 'DATE_PICKER' }],
          },
        ]}
        mappings={[]}
        onChange={onChange}
        onMappingsChange={onMappingsChange}
        onRemove={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Filter placement'), { target: { value: 'card-1' } });
    expect(onChange).toHaveBeenCalledWith({
      ...filter,
      placement: { kind: 'INLINE_CARD', cardId: 'card-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect all' }));
    expect(onMappingsChange).toHaveBeenCalledWith([
      {
        filterId: 'filter-1',
        cardId: 'card-1',
        target: { kind: 'FIELD', fieldId: 'brands.created_at' },
      },
    ]);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('offers multiple selection only for compatible categorical filters', () => {
    const onChange = vi.fn();
    render(
      <DashboardFilterSettings
        filter={{ ...filter, semanticType: 'TEXT_CATEGORY', operator: 'IS' }}
        cards={[card]}
        options={[]}
        mappings={[]}
        onChange={onChange}
        onMappingsChange={vi.fn()}
        onRemove={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow multiple values' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: true, defaultValue: null }),
    );
  });
});
