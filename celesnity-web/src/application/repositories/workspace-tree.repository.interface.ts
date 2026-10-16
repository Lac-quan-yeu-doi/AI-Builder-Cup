import type { RunFileContent } from '@/src/entities/models/chat';
import type { WorkspaceTreeResult } from '@/src/entities/models/workspace-tree';

export interface WorkspaceTreeRepository {
  listTree(roomId: string): Promise<WorkspaceTreeResult>;
  getFileContent(roomId: string, path: string): Promise<RunFileContent>;
}
