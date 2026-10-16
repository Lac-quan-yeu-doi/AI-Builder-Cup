import type { WorkspaceTreeRepository } from '@/src/application/repositories/workspace-tree.repository.interface';
import type { RunFileContent } from '@/src/entities/models/chat';

export type GetWorkspaceFileContentUseCase = (
  roomId: string,
  path: string,
) => Promise<RunFileContent>;

export const createGetWorkspaceFileContentUseCase =
  (repository: WorkspaceTreeRepository): GetWorkspaceFileContentUseCase =>
  (roomId, path) =>
    repository.getFileContent(roomId, path);
