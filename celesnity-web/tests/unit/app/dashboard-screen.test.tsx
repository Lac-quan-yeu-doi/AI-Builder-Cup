// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DashboardScreen } from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-screen';
import type { Dashboard } from '@/src/entities/models/dashboard';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);

const dashboard: Dashboard = {
  id: 'dashboard-1',
  collectionId: 'collection-1',
  name: 'Operations',
  description: 'Daily overview',
  revision: 2,
  tabs: [{ id: 'tab-1', name: 'Overview', order: 0 }],
  cards: [
    {
      id: 'heading-1',
      tabId: 'tab-1',
      kind: 'HEADING',
      content: { text: 'Revenue' },
      geometry: { x: 0, y: 0, width: 24, height: 1 },
    },
    {
      id: 'chart-card-1',
      tabId: 'tab-1',
      kind: 'CHART',
      chartId: 'chart-1',
      chartRevisionNumber: 1,
      visualizationOverrides: {},
      geometry: { x: 0, y: 1, width: 12, height: 6 },
    },
  ],
  filters: [
    {
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
    },
  ],
  mappings: [],
  createdByIdentityId: 'identity-1',
  archivedAt: null,
  createdAt: '2026-09-05T08:00:00.000Z',
  updatedAt: '2026-09-05T09:00:00.000Z',
};

describe('DashboardScreen', () => {
  it('renders title, tabs, top-level filters and cards in grid order', () => {
    renderUi(<DashboardScreen dashboard={dashboard} loading={false} error={null} />);

    expect(screen.getByRole('heading', { name: 'Operations' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Date' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Revenue' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit dashboard' })).toBeTruthy();
    expect(screen.getByText('Loading chart…')).toBeTruthy();
    // A single tab is not navigation, it is a label for the only thing there.
    expect(screen.queryByRole('tab', { name: 'Overview' })).toBeNull();
  });

  it('shows the tab bar once a dashboard actually has tabs', () => {
    renderUi(
      <DashboardScreen
        dashboard={{
          ...dashboard,
          tabs: [
            { id: 'tab-1', name: 'Overview', order: 0 },
            { id: 'tab-2', name: 'Detail', order: 1 },
          ],
        }}
        loading={false}
        error={null}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Detail' })).toBeTruthy();
  });

  it('says how many filters are narrowing what you are looking at', () => {
    renderUi(
      <DashboardScreen
        dashboard={dashboard}
        loading={false}
        error={null}
        filterValues={{ 'filter-1': '2026-09-02' }}
      />,
    );

    expect(screen.getByText('1 active')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
  });

  it('leaves the filter bar quiet when nothing is set', () => {
    renderUi(<DashboardScreen dashboard={dashboard} loading={false} error={null} />);

    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('offers a way forward when a dashboard is empty', () => {
    renderUi(
      <DashboardScreen dashboard={{ ...dashboard, cards: [] }} loading={false} error={null} />,
    );

    expect(screen.getByRole('heading', { name: 'This dashboard is empty' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add a chart' })).toBeTruthy();
  });
});
