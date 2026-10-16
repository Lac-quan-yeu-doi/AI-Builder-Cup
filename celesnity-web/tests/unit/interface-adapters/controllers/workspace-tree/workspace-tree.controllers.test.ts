import { describe, expect, it, vi } from 'vitest';

import type { RunFileContent } from '@/src/entities/models/chat';
import type { WorkspaceTreeResult } from '@/src/entities/models/workspace-tree';
import {
  createGetWorkspaceFileContentController,
  type GetWorkspaceFileContentController,
} from '@/src/interface-adapters/controllers/workspace-tree/get-workspace-file-content.controller';
import {
  createListWorkspaceTreeController,
  type ListWorkspaceTreeController,
} from '@/src/interface-adapters/controllers/workspace-tree/list-workspace-tree.controller';

const tree: WorkspaceTreeResult = { entries: [], truncated: false };
const content: RunFileContent = {
  blob: new Blob(['hello']),
  mimeType: 'application/octet-stream',
  sizeBytes: 5,
  fileName: 'file.bin',
};

describe('workspace-tree controllers', () => {
  it('lists a room tree with exactly one use-case call', async () => {
    const useCase = vi.fn().mockResolvedValue(tree);
    const controller: ListWorkspaceTreeController = createListWorkspaceTreeController(useCase);

    await expect(controller('room-1')).resolves.toBe(tree);
    expect(useCase).toHaveBeenCalledTimes(1);
    expect(useCase).toHaveBeenCalledWith('room-1');
  });

  it('gets file content with exactly one use-case call', async () => {
    const useCase = vi.fn().mockResolvedValue(content);
    const controller: GetWorkspaceFileContentController =
      createGetWorkspaceFileContentController(useCase);

    await expect(controller('room-1', 'dir/file.bin')).resolves.toBe(content);
    expect(useCase).toHaveBeenCalledTimes(1);
    expect(useCase).toHaveBeenCalledWith('room-1', 'dir/file.bin');
  });
});
