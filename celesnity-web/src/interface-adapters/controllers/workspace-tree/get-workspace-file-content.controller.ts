import type { GetWorkspaceFileContentUseCase } from '@/src/application/use-cases/workspace-tree/get-workspace-file-content.use-case';
import type { RunFileContent } from '@/src/entities/models/chat';

export type GetWorkspaceFileContentController = (
  roomId: string,
  path: string,
) => Promise<RunFileContent>;

export const createGetWorkspaceFileContentController =
  (useCase: GetWorkspaceFileContentUseCase): GetWorkspaceFileContentController =>
  (roomId, path) =>
    useCase(roomId, path);
