import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createAutomationWorkflowUseCases } from '@/src/application/use-cases/automation-workflow/automation-workflow.use-cases';
import { CoreApiAutomationWorkflowRepository } from '@/src/infrastructure/repositories/core-api-automation-workflow.repository';
import { createAutomationWorkflowController } from '@/src/interface-adapters/controllers/automation-workflow/automation-workflow.controller';

export function createAutomationWorkflowModule() {
  const automationWorkflowModule = createTypedModule();

  automationWorkflowModule
    .bind(DI_SYMBOLS.AutomationWorkflowRepository)
    .toClass(CoreApiAutomationWorkflowRepository, [DI_SYMBOLS.CoreApiClient]);
  automationWorkflowModule
    .bind(DI_SYMBOLS.AutomationWorkflowUseCases)
    .toHigherOrderFunction(createAutomationWorkflowUseCases, [
      DI_SYMBOLS.AutomationWorkflowRepository,
    ]);
  automationWorkflowModule
    .bind(DI_SYMBOLS.AutomationWorkflowController)
    .toHigherOrderFunction(createAutomationWorkflowController, [
      DI_SYMBOLS.AutomationWorkflowUseCases,
    ]);

  return automationWorkflowModule;
}
