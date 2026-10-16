import type { WorkspaceTreeRepository } from '@/src/application/repositories/workspace-tree.repository.interface';
import type { WorkspaceTreeResult } from '@/src/entities/models/workspace-tree';

export type ListWorkspaceTreeUseCase = (roomId: string) => Promise<WorkspaceTreeResult>;

export const createListWorkspaceTreeUseCase =
  (repository: WorkspaceTreeRepository): ListWorkspaceTreeUseCase =>
  (roomId) =>
    repository.listTree(roomId);
