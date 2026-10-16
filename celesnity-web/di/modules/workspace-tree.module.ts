import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createGetWorkspaceFileContentUseCase } from '@/src/application/use-cases/workspace-tree/get-workspace-file-content.use-case';
import { createListWorkspaceTreeUseCase } from '@/src/application/use-cases/workspace-tree/list-workspace-tree.use-case';
import { CoreApiWorkspaceTreeRepository } from '@/src/infrastructure/repositories/core-api-workspace-tree.repository';
import { createGetWorkspaceFileContentController } from '@/src/interface-adapters/controllers/workspace-tree/get-workspace-file-content.controller';
import { createListWorkspaceTreeController } from '@/src/interface-adapters/controllers/workspace-tree/list-workspace-tree.controller';

export function createWorkspaceTreeModule() {
  const workspaceTreeModule = createTypedModule();

  workspaceTreeModule
    .bind(DI_SYMBOLS.WorkspaceTreeRepository)
    .toClass(CoreApiWorkspaceTreeRepository, [DI_SYMBOLS.CoreApiClient]);
  workspaceTreeModule
    .bind(DI_SYMBOLS.ListWorkspaceTreeUseCase)
    .toHigherOrderFunction(createListWorkspaceTreeUseCase, [DI_SYMBOLS.WorkspaceTreeRepository]);
  workspaceTreeModule
    .bind(DI_SYMBOLS.GetWorkspaceFileContentUseCase)
    .toHigherOrderFunction(createGetWorkspaceFileContentUseCase, [
      DI_SYMBOLS.WorkspaceTreeRepository,
    ]);
  workspaceTreeModule
    .bind(DI_SYMBOLS.ListWorkspaceTreeController)
    .toHigherOrderFunction(createListWorkspaceTreeController, [
      DI_SYMBOLS.ListWorkspaceTreeUseCase,
    ]);
  workspaceTreeModule
    .bind(DI_SYMBOLS.GetWorkspaceFileContentController)
    .toHigherOrderFunction(createGetWorkspaceFileContentController, [
      DI_SYMBOLS.GetWorkspaceFileContentUseCase,
    ]);

  return workspaceTreeModule;
}
