import { describe, expect, it } from 'vitest';

import {
  dashboardCardGeometry,
  type Dashboard,
  type DashboardCard,
} from '@/src/entities/models/dashboard';

describe('Dashboard entity model', () => {
  it.each([
    ['HEADING', { x: 0, y: 0, width: 24, height: 1 }],
    ['TEXT', { x: 0, y: 0, width: 12, height: 3 }],
    ['TABLE', { x: 0, y: 0, width: 12, height: 9 }],
    ['BAR', { x: 0, y: 0, width: 12, height: 6 }],
    ['PIE', { x: 0, y: 0, width: 12, height: 8 }],
    ['NUMBER', { x: 0, y: 0, width: 6, height: 3 }],
  ] as const)('provides Metabase-style default geometry for %s cards', (kind, geometry) => {
    expect(dashboardCardGeometry(kind, 0)).toEqual(geometry);
  });

  it('models cards as immutable discriminated variants', () => {
    const card: DashboardCard = {
      id: 'card-1',
      tabId: 'tab-1',
      kind: 'CHART',
      chartId: 'chart-1',
      chartRevisionNumber: null,
      visualizationOverrides: {},
      geometry: dashboardCardGeometry('BAR', 2),
    };
    const dashboard: Dashboard = {
      id: 'dashboard-1',
      collectionId: 'collection-1',
      name: 'Sales',
      description: null,
      revision: 1,
      tabs: [{ id: 'tab-1', name: 'Tab 1', order: 0 }],
      cards: [card],
      filters: [],
      mappings: [],
      createdByIdentityId: 'identity-1',
      archivedAt: null,
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z',
    };

    expect(dashboard.cards[0]?.kind).toBe('CHART');
    expect(dashboard.cards[0]?.geometry.y).toBe(2);
  });
});
