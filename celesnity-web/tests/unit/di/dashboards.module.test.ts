import type { DependencyKey } from '@evyweb/ioctopus';
import { describe, expect, it } from 'vitest';

import { createDashboardsModule } from '@/di/modules/dashboards.module';
import { DI_SYMBOLS } from '@/di/types';

const bindings = [
  [DI_SYMBOLS.DashboardRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.DashboardRuntimeService, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.CreateDashboardUseCase, [DI_SYMBOLS.DashboardRepository]],
  [DI_SYMBOLS.GetDashboardUseCase, [DI_SYMBOLS.DashboardRepository]],
  [DI_SYMBOLS.ListDashboardsUseCase, [DI_SYMBOLS.DashboardRepository]],
  [DI_SYMBOLS.SaveDashboardUseCase, [DI_SYMBOLS.DashboardRepository]],
  [DI_SYMBOLS.CopyDashboardUseCase, [DI_SYMBOLS.DashboardRepository]],
  [DI_SYMBOLS.ArchiveDashboardUseCase, [DI_SYMBOLS.DashboardRepository]],
  [DI_SYMBOLS.ExecuteDashboardUseCase, [DI_SYMBOLS.DashboardRuntimeService]],
  [DI_SYMBOLS.ListDashboardFilterTargetsUseCase, [DI_SYMBOLS.DashboardRuntimeService]],
  [DI_SYMBOLS.CreateDashboardController, [DI_SYMBOLS.CreateDashboardUseCase]],
  [DI_SYMBOLS.GetDashboardController, [DI_SYMBOLS.GetDashboardUseCase]],
  [DI_SYMBOLS.ListDashboardsController, [DI_SYMBOLS.ListDashboardsUseCase]],
  [DI_SYMBOLS.SaveDashboardController, [DI_SYMBOLS.SaveDashboardUseCase]],
  [DI_SYMBOLS.CopyDashboardController, [DI_SYMBOLS.CopyDashboardUseCase]],
  [DI_SYMBOLS.ArchiveDashboardController, [DI_SYMBOLS.ArchiveDashboardUseCase]],
  [DI_SYMBOLS.ExecuteDashboardController, [DI_SYMBOLS.ExecuteDashboardUseCase]],
  [DI_SYMBOLS.ListDashboardFilterTargetsController, [DI_SYMBOLS.ListDashboardFilterTargetsUseCase]],
] as const;

describe('dashboards dependency injection module', () => {
  it('wires repositories, use cases and one-use-case controllers in dependency order', () => {
    const dashboardsModule = createDashboardsModule();

    expect([...dashboardsModule.bindings.keys()]).toEqual(bindings.map(([key]) => key));
    for (const [key, dependencies] of bindings) {
      const resolutionOrder: DependencyKey[] = [];
      dashboardsModule.bindings.get(key)?.factory((dependency) => {
        resolutionOrder.push(dependency);
        return Object.freeze({ dependency });
      });
      expect(resolutionOrder, String(key)).toEqual(dependencies);
    }
  });
});
