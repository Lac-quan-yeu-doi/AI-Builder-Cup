import { describe, expect, it, vi } from 'vitest';

import type { DashboardRepository } from '@/src/application/repositories/dashboard.repository.interface';
import { createArchiveDashboardUseCase } from '@/src/application/use-cases/dashboards/archive-dashboard.use-case';
import { createCopyDashboardUseCase } from '@/src/application/use-cases/dashboards/copy-dashboard.use-case';
import { createCreateDashboardUseCase } from '@/src/application/use-cases/dashboards/create-dashboard.use-case';
import { createGetDashboardUseCase } from '@/src/application/use-cases/dashboards/get-dashboard.use-case';
import { createListDashboardsUseCase } from '@/src/application/use-cases/dashboards/list-dashboards.use-case';
import { createSaveDashboardUseCase } from '@/src/application/use-cases/dashboards/save-dashboard.use-case';
import type { Dashboard } from '@/src/entities/models/dashboard';

describe('Dashboard use cases', () => {
  it('delegates one repository operation per use case', async () => {
    const dashboard = fixture();
    const repository: DashboardRepository = {
      create: vi.fn().mockResolvedValue(dashboard),
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(dashboard),
      save: vi.fn().mockResolvedValue(dashboard),
      copy: vi.fn().mockResolvedValue(dashboard),
      archive: vi.fn().mockResolvedValue(undefined),
    };

    await createCreateDashboardUseCase(repository)({
      collectionId: 'collection-1',
      name: 'Sales',
      description: null,
    });
    await createListDashboardsUseCase(repository)('collection-1');
    await createGetDashboardUseCase(repository)('dashboard-1');
    await createSaveDashboardUseCase(repository)(dashboard);
    await createCopyDashboardUseCase(repository)({
      sourceDashboardId: 'dashboard-1',
      collectionId: 'collection-2',
      name: 'Sales copy',
      draft: dashboard,
    });
    await createArchiveDashboardUseCase(repository)('dashboard-1');

    expect(repository.create).toHaveBeenCalledOnce();
    expect(repository.list).toHaveBeenCalledWith('collection-1');
    expect(repository.get).toHaveBeenCalledWith('dashboard-1');
    expect(repository.save).toHaveBeenCalledWith(dashboard);
    expect(repository.copy).toHaveBeenCalledOnce();
    expect(repository.archive).toHaveBeenCalledWith('dashboard-1');
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
