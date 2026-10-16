import { describe, expect, it, vi } from 'vitest';

import type { DashboardRuntimeService } from '@/src/application/services/dashboard-runtime.service.interface';
import { createExecuteDashboardUseCase } from '@/src/application/use-cases/dashboards/execute-dashboard.use-case';
import { createListDashboardFilterTargetsUseCase } from '@/src/application/use-cases/dashboards/list-dashboard-filter-targets.use-case';

describe('Dashboard runtime use cases', () => {
  it('delegates execution and filter-target discovery to the runtime boundary', async () => {
    const service: DashboardRuntimeService = {
      execute: vi.fn().mockResolvedValue({ dashboardId: 'dashboard-1', tabId: 'tab-1', cards: [] }),
      listFilterTargets: vi.fn().mockResolvedValue([]),
    };

    await createExecuteDashboardUseCase(service)({
      dashboardId: 'dashboard-1',
      tabId: 'tab-1',
      values: { 'filter-1': '2026-09-05' },
      changedFilterIds: ['filter-1'],
    });
    await createListDashboardFilterTargetsUseCase(service)({
      dashboardId: 'dashboard-1',
      chartCards: [{ cardId: 'draft-card', chartId: 'chart-2' }],
    });

    expect(service.execute).toHaveBeenCalledWith({
      dashboardId: 'dashboard-1',
      tabId: 'tab-1',
      values: { 'filter-1': '2026-09-05' },
      changedFilterIds: ['filter-1'],
    });
    expect(service.listFilterTargets).toHaveBeenCalledWith({
      dashboardId: 'dashboard-1',
      chartCards: [{ cardId: 'draft-card', chartId: 'chart-2' }],
    });
  });
});
