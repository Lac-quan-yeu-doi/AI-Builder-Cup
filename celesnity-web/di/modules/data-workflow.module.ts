import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createDataWorkflowUseCases } from '@/src/application/use-cases/data-workflow/data-workflow.use-cases';
import { CoreApiDataWorkflowRepository } from '@/src/infrastructure/repositories/core-api-data-workflow.repository';
import { createDataWorkflowController } from '@/src/interface-adapters/controllers/data-workflow/data-workflow.controller';

export function createDataWorkflowModule() {
  const dataWorkflowModule = createTypedModule();
  dataWorkflowModule
    .bind(DI_SYMBOLS.DataWorkflowRepository)
    .toClass(CoreApiDataWorkflowRepository, [DI_SYMBOLS.CoreApiClient]);
  dataWorkflowModule
    .bind(DI_SYMBOLS.DataWorkflowUseCases)
    .toHigherOrderFunction(createDataWorkflowUseCases, [DI_SYMBOLS.DataWorkflowRepository]);
  dataWorkflowModule
    .bind(DI_SYMBOLS.DataWorkflowController)
    .toHigherOrderFunction(createDataWorkflowController, [DI_SYMBOLS.DataWorkflowUseCases]);
  return dataWorkflowModule;
}
