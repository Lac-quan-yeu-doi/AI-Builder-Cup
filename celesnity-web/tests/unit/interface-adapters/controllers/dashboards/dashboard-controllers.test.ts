import { describe, expect, it, vi } from 'vitest';

import { InputParseError } from '@/src/entities/errors/application-errors';
import type { Dashboard } from '@/src/entities/models/dashboard';
import { createCreateDashboardController } from '@/src/interface-adapters/controllers/dashboards/create-dashboard.controller';
import { createGetDashboardController } from '@/src/interface-adapters/controllers/dashboards/get-dashboard.controller';
import { createListDashboardFilterTargetsController } from '@/src/interface-adapters/controllers/dashboards/list-dashboard-filter-targets.controller';
import { createSaveDashboardController } from '@/src/interface-adapters/controllers/dashboards/save-dashboard.controller';
import { presentDashboard } from '@/src/interface-adapters/presenters/dashboard.presenter';

describe('Dashboard controllers', () => {
  it('validates and normalizes create input before exactly one use-case call', async () => {
    const useCase = vi.fn().mockResolvedValue(fixture());
    const controller = createCreateDashboardController(useCase);

    await controller({ collectionId: ' collection-1 ', name: ' Sales ', description: null });

    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith({
      collectionId: 'collection-1',
      name: 'Sales',
      description: null,
    });
    await expect(
      controller({ collectionId: '', name: '', description: null }),
    ).rejects.toBeInstanceOf(InputParseError);
  });

  it('validates identifiers and complete save drafts', async () => {
    const get = vi.fn().mockResolvedValue(fixture());
    const save = vi.fn().mockResolvedValue(fixture());

    await createGetDashboardController(get)(' dashboard-1 ');
    await createSaveDashboardController(save)(fixture());

    expect(get).toHaveBeenCalledWith('dashboard-1');
    expect(save).toHaveBeenCalledWith(fixture());
    await expect(createGetDashboardController(get)('')).rejects.toBeInstanceOf(InputParseError);
  });

  it('deep-copies and freezes presenter output', () => {
    const dashboard = fixture();
    const presented = presentDashboard(dashboard);

    expect(presented).not.toBe(dashboard);
    expect(presented.tabs).not.toBe(dashboard.tabs);
    expect(presented.cards).not.toBe(dashboard.cards);
    expect(Object.isFrozen(presented)).toBe(true);
    expect(Object.isFrozen(presented.tabs)).toBe(true);
  });

  it('validates draft chart references for filter-target preview', async () => {
    const useCase = vi.fn().mockResolvedValue([]);
    const controller = createListDashboardFilterTargetsController(useCase);

    await controller({
      dashboardId: ' dashboard-1 ',
      chartCards: [{ cardId: ' card-1 ', chartId: ' chart-1 ' }],
    });

    expect(useCase).toHaveBeenCalledWith({
      dashboardId: 'dashboard-1',
      chartCards: [{ cardId: 'card-1', chartId: 'chart-1' }],
    });
    await expect(controller({ dashboardId: '', chartCards: [] })).rejects.toBeInstanceOf(
      InputParseError,
    );
  });
});

function fixture(): Dashboard {
  return {
    id: 'dashboard-1',
    collectionId: 'collection-1',
    name: 'Sales',
    description: null,
    revision: 1,
    tabs: [{ id: 'tab-1', name: 'Tab 1', order: 0 }],
    cards: [],
    filters: [],
    mappings: [],
    createdByIdentityId: 'identity-1',
    archivedAt: null,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  };
}
