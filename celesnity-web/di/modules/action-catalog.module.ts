import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createListActionCatalogUseCase } from '@/src/application/use-cases/action-catalog/list-action-catalog.use-case';
import { CoreApiActionCatalogRepository } from '@/src/infrastructure/repositories/core-api-action-catalog.repository';
import { createListActionCatalogController } from '@/src/interface-adapters/controllers/action-catalog/list-action-catalog.controller';

export function createActionCatalogModule() {
  const actionCatalogModule = createTypedModule();

  actionCatalogModule
    .bind(DI_SYMBOLS.ActionCatalogRepository)
    .toClass(CoreApiActionCatalogRepository, [DI_SYMBOLS.CoreApiClient]);

  actionCatalogModule
    .bind(DI_SYMBOLS.ListActionCatalogUseCase)
    .toHigherOrderFunction(createListActionCatalogUseCase, [DI_SYMBOLS.ActionCatalogRepository]);

  actionCatalogModule
    .bind(DI_SYMBOLS.ListActionCatalogController)
    .toHigherOrderFunction(createListActionCatalogController, [
      DI_SYMBOLS.ListActionCatalogUseCase,
    ]);

  return actionCatalogModule;
}
