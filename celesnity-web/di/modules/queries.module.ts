import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createCancelQueryUseCase } from '@/src/application/use-cases/queries/cancel-query.use-case';
import { createGetQueryUseCase } from '@/src/application/use-cases/queries/get-query.use-case';
import { createListQueryCatalogsUseCase } from '@/src/application/use-cases/queries/list-query-catalogs.use-case';
import { createListQueryHistoryUseCase } from '@/src/application/use-cases/queries/list-query-history.use-case';
import { createListQueryNamespacesUseCase } from '@/src/application/use-cases/queries/list-query-namespaces.use-case';
import { createMonitorQueryUseCase } from '@/src/application/use-cases/queries/monitor-query.use-case';
import { createSubmitQueryUseCase } from '@/src/application/use-cases/queries/submit-query.use-case';
import { CoreApiQueryRepository } from '@/src/infrastructure/repositories/core-api-query.repository';
import { createCancelQueryController } from '@/src/interface-adapters/controllers/queries/cancel-query.controller';
import { createGetQueryController } from '@/src/interface-adapters/controllers/queries/get-query.controller';
import { createListQueryCatalogsController } from '@/src/interface-adapters/controllers/queries/list-query-catalogs.controller';
import { createListQueryHistoryController } from '@/src/interface-adapters/controllers/queries/list-query-history.controller';
import { createListQueryNamespacesController } from '@/src/interface-adapters/controllers/queries/list-query-namespaces.controller';
import { createMonitorQueryController } from '@/src/interface-adapters/controllers/queries/monitor-query.controller';
import { createSubmitQueryController } from '@/src/interface-adapters/controllers/queries/submit-query.controller';

export function createQueriesModule() {
  const queriesModule = createTypedModule();

  queriesModule
    .bind(DI_SYMBOLS.QueryRepository)
    .toClass(CoreApiQueryRepository, [DI_SYMBOLS.CoreApiClient]);
  queriesModule
    .bind(DI_SYMBOLS.ListQueryCatalogsUseCase)
    .toHigherOrderFunction(createListQueryCatalogsUseCase, [DI_SYMBOLS.QueryRepository]);
  queriesModule
    .bind(DI_SYMBOLS.ListQueryNamespacesUseCase)
    .toHigherOrderFunction(createListQueryNamespacesUseCase, [DI_SYMBOLS.QueryRepository]);
  queriesModule
    .bind(DI_SYMBOLS.ListQueryHistoryUseCase)
    .toHigherOrderFunction(createListQueryHistoryUseCase, [DI_SYMBOLS.QueryRepository]);
  queriesModule
    .bind(DI_SYMBOLS.GetQueryUseCase)
    .toHigherOrderFunction(createGetQueryUseCase, [DI_SYMBOLS.QueryRepository]);
  queriesModule
    .bind(DI_SYMBOLS.CancelQueryUseCase)
    .toHigherOrderFunction(createCancelQueryUseCase, [DI_SYMBOLS.QueryRepository]);
  queriesModule
    .bind(DI_SYMBOLS.SubmitQueryUseCase)
    .toHigherOrderFunction(createSubmitQueryUseCase, [DI_SYMBOLS.QueryRepository]);
  queriesModule
    .bind(DI_SYMBOLS.MonitorQueryUseCase)
    .toHigherOrderFunction(createMonitorQueryUseCase, [
      DI_SYMBOLS.QueryRepository,
      DI_SYMBOLS.QueryProgressService,
      DI_SYMBOLS.SchedulerService,
    ]);

  queriesModule
    .bind(DI_SYMBOLS.ListQueryCatalogsController)
    .toHigherOrderFunction(createListQueryCatalogsController, [
      DI_SYMBOLS.ListQueryCatalogsUseCase,
    ]);
  queriesModule
    .bind(DI_SYMBOLS.ListQueryNamespacesController)
    .toHigherOrderFunction(createListQueryNamespacesController, [
      DI_SYMBOLS.ListQueryNamespacesUseCase,
    ]);
  queriesModule
    .bind(DI_SYMBOLS.ListQueryHistoryController)
    .toHigherOrderFunction(createListQueryHistoryController, [DI_SYMBOLS.ListQueryHistoryUseCase]);
  queriesModule
    .bind(DI_SYMBOLS.GetQueryController)
    .toHigherOrderFunction(createGetQueryController, [DI_SYMBOLS.GetQueryUseCase]);
  queriesModule
    .bind(DI_SYMBOLS.CancelQueryController)
    .toHigherOrderFunction(createCancelQueryController, [DI_SYMBOLS.CancelQueryUseCase]);
  queriesModule
    .bind(DI_SYMBOLS.SubmitQueryController)
    .toHigherOrderFunction(createSubmitQueryController, [DI_SYMBOLS.SubmitQueryUseCase]);
  queriesModule
    .bind(DI_SYMBOLS.MonitorQueryController)
    .toHigherOrderFunction(createMonitorQueryController, [DI_SYMBOLS.MonitorQueryUseCase]);

  return queriesModule;
}
