import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createListPendingActionsUseCase } from '@/src/application/use-cases/pending-actions/list-pending-actions.use-case';
import { createGetPendingActionUseCase } from '@/src/application/use-cases/pending-actions/get-pending-action.use-case';
import { createApprovePendingActionUseCase } from '@/src/application/use-cases/pending-actions/approve-pending-action.use-case';
import { createRejectPendingActionUseCase } from '@/src/application/use-cases/pending-actions/reject-pending-action.use-case';
import { CoreApiPendingActionRepository } from '@/src/infrastructure/repositories/core-api-pending-action.repository';
import { createListPendingActionsController } from '@/src/interface-adapters/controllers/pending-actions/list-pending-actions.controller';
import { createGetPendingActionController } from '@/src/interface-adapters/controllers/pending-actions/get-pending-action.controller';
import { createApprovePendingActionController } from '@/src/interface-adapters/controllers/pending-actions/approve-pending-action.controller';
import { createRejectPendingActionController } from '@/src/interface-adapters/controllers/pending-actions/reject-pending-action.controller';

export function createPendingActionsModule() {
  const pendingActionsModule = createTypedModule();

  pendingActionsModule
    .bind(DI_SYMBOLS.PendingActionRepository)
    .toClass(CoreApiPendingActionRepository, [DI_SYMBOLS.CoreApiClient]);

  pendingActionsModule
    .bind(DI_SYMBOLS.ListPendingActionsUseCase)
    .toHigherOrderFunction(createListPendingActionsUseCase, [DI_SYMBOLS.PendingActionRepository]);
  pendingActionsModule
    .bind(DI_SYMBOLS.GetPendingActionUseCase)
    .toHigherOrderFunction(createGetPendingActionUseCase, [DI_SYMBOLS.PendingActionRepository]);
  pendingActionsModule
    .bind(DI_SYMBOLS.ApprovePendingActionUseCase)
    .toHigherOrderFunction(createApprovePendingActionUseCase, [DI_SYMBOLS.PendingActionRepository]);
  pendingActionsModule
    .bind(DI_SYMBOLS.RejectPendingActionUseCase)
    .toHigherOrderFunction(createRejectPendingActionUseCase, [DI_SYMBOLS.PendingActionRepository]);

  pendingActionsModule
    .bind(DI_SYMBOLS.ListPendingActionsController)
    .toHigherOrderFunction(createListPendingActionsController, [
      DI_SYMBOLS.ListPendingActionsUseCase,
    ]);
  pendingActionsModule
    .bind(DI_SYMBOLS.GetPendingActionController)
    .toHigherOrderFunction(createGetPendingActionController, [DI_SYMBOLS.GetPendingActionUseCase]);
  pendingActionsModule
    .bind(DI_SYMBOLS.ApprovePendingActionController)
    .toHigherOrderFunction(createApprovePendingActionController, [
      DI_SYMBOLS.ApprovePendingActionUseCase,
    ]);
  pendingActionsModule
    .bind(DI_SYMBOLS.RejectPendingActionController)
    .toHigherOrderFunction(createRejectPendingActionController, [
      DI_SYMBOLS.RejectPendingActionUseCase,
    ]);

  return pendingActionsModule;
}
