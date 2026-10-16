import type { ListWorkspaceTreeUseCase } from '@/src/application/use-cases/workspace-tree/list-workspace-tree.use-case';
import type { WorkspaceTreeResult } from '@/src/entities/models/workspace-tree';

export type ListWorkspaceTreeController = (roomId: string) => Promise<WorkspaceTreeResult>;

export const createListWorkspaceTreeController =
  (useCase: ListWorkspaceTreeUseCase): ListWorkspaceTreeController =>
  (roomId) =>
    useCase(roomId);
