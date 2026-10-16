import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createArchiveDashboardUseCase } from '@/src/application/use-cases/dashboards/archive-dashboard.use-case';
import { createCopyDashboardUseCase } from '@/src/application/use-cases/dashboards/copy-dashboard.use-case';
import { createCreateDashboardUseCase } from '@/src/application/use-cases/dashboards/create-dashboard.use-case';
import { createGetDashboardUseCase } from '@/src/application/use-cases/dashboards/get-dashboard.use-case';
import { createListDashboardsUseCase } from '@/src/application/use-cases/dashboards/list-dashboards.use-case';
import { createSaveDashboardUseCase } from '@/src/application/use-cases/dashboards/save-dashboard.use-case';
import { createExecuteDashboardUseCase } from '@/src/application/use-cases/dashboards/execute-dashboard.use-case';
import { createListDashboardFilterTargetsUseCase } from '@/src/application/use-cases/dashboards/list-dashboard-filter-targets.use-case';
import { CoreApiDashboardRepository } from '@/src/infrastructure/repositories/core-api-dashboard.repository';
import { CoreApiDashboardRuntimeService } from '@/src/infrastructure/services/core-api-dashboard-runtime.service';
import { createArchiveDashboardController } from '@/src/interface-adapters/controllers/dashboards/archive-dashboard.controller';
import { createCopyDashboardController } from '@/src/interface-adapters/controllers/dashboards/copy-dashboard.controller';
import { createCreateDashboardController } from '@/src/interface-adapters/controllers/dashboards/create-dashboard.controller';
import { createGetDashboardController } from '@/src/interface-adapters/controllers/dashboards/get-dashboard.controller';
import { createListDashboardsController } from '@/src/interface-adapters/controllers/dashboards/list-dashboards.controller';
import { createSaveDashboardController } from '@/src/interface-adapters/controllers/dashboards/save-dashboard.controller';
import { createExecuteDashboardController } from '@/src/interface-adapters/controllers/dashboards/execute-dashboard.controller';
import { createListDashboardFilterTargetsController } from '@/src/interface-adapters/controllers/dashboards/list-dashboard-filter-targets.controller';

export function createDashboardsModule() {
  const dashboardsModule = createTypedModule();

  dashboardsModule
    .bind(DI_SYMBOLS.DashboardRepository)
    .toClass(CoreApiDashboardRepository, [DI_SYMBOLS.CoreApiClient]);
  dashboardsModule
    .bind(DI_SYMBOLS.DashboardRuntimeService)
    .toClass(CoreApiDashboardRuntimeService, [DI_SYMBOLS.CoreApiClient]);

  dashboardsModule
    .bind(DI_SYMBOLS.CreateDashboardUseCase)
    .toHigherOrderFunction(createCreateDashboardUseCase, [DI_SYMBOLS.DashboardRepository]);
  dashboardsModule
    .bind(DI_SYMBOLS.GetDashboardUseCase)
    .toHigherOrderFunction(createGetDashboardUseCase, [DI_SYMBOLS.DashboardRepository]);
  dashboardsModule
    .bind(DI_SYMBOLS.ListDashboardsUseCase)
    .toHigherOrderFunction(createListDashboardsUseCase, [DI_SYMBOLS.DashboardRepository]);
  dashboardsModule
    .bind(DI_SYMBOLS.SaveDashboardUseCase)
    .toHigherOrderFunction(createSaveDashboardUseCase, [DI_SYMBOLS.DashboardRepository]);
  dashboardsModule
    .bind(DI_SYMBOLS.CopyDashboardUseCase)
    .toHigherOrderFunction(createCopyDashboardUseCase, [DI_SYMBOLS.DashboardRepository]);
  dashboardsModule
    .bind(DI_SYMBOLS.ArchiveDashboardUseCase)
    .toHigherOrderFunction(createArchiveDashboardUseCase, [DI_SYMBOLS.DashboardRepository]);
  dashboardsModule
    .bind(DI_SYMBOLS.ExecuteDashboardUseCase)
    .toHigherOrderFunction(createExecuteDashboardUseCase, [DI_SYMBOLS.DashboardRuntimeService]);
  dashboardsModule
    .bind(DI_SYMBOLS.ListDashboardFilterTargetsUseCase)
    .toHigherOrderFunction(createListDashboardFilterTargetsUseCase, [
      DI_SYMBOLS.DashboardRuntimeService,
    ]);

  dashboardsModule
    .bind(DI_SYMBOLS.CreateDashboardController)
    .toHigherOrderFunction(createCreateDashboardController, [DI_SYMBOLS.CreateDashboardUseCase]);
  dashboardsModule
    .bind(DI_SYMBOLS.GetDashboardController)
    .toHigherOrderFunction(createGetDashboardController, [DI_SYMBOLS.GetDashboardUseCase]);
  dashboardsModule
    .bind(DI_SYMBOLS.ListDashboardsController)
    .toHigherOrderFunction(createListDashboardsController, [DI_SYMBOLS.ListDashboardsUseCase]);
  dashboardsModule
    .bind(DI_SYMBOLS.SaveDashboardController)
    .toHigherOrderFunction(createSaveDashboardController, [DI_SYMBOLS.SaveDashboardUseCase]);
  dashboardsModule
    .bind(DI_SYMBOLS.CopyDashboardController)
    .toHigherOrderFunction(createCopyDashboardController, [DI_SYMBOLS.CopyDashboardUseCase]);
  dashboardsModule
    .bind(DI_SYMBOLS.ArchiveDashboardController)
    .toHigherOrderFunction(createArchiveDashboardController, [DI_SYMBOLS.ArchiveDashboardUseCase]);
  dashboardsModule
    .bind(DI_SYMBOLS.ExecuteDashboardController)
    .toHigherOrderFunction(createExecuteDashboardController, [DI_SYMBOLS.ExecuteDashboardUseCase]);
  dashboardsModule
    .bind(DI_SYMBOLS.ListDashboardFilterTargetsController)
    .toHigherOrderFunction(createListDashboardFilterTargetsController, [
      DI_SYMBOLS.ListDashboardFilterTargetsUseCase,
    ]);

  return dashboardsModule;
}
