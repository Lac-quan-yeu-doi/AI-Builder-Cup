import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceTreeRepository } from '@/src/application/repositories/workspace-tree.repository.interface';
import type { WorkspaceTreeResult } from '@/src/entities/models/workspace-tree';
import type { RunFileContent } from '@/src/entities/models/chat';
import {
  createGetWorkspaceFileContentUseCase,
  type GetWorkspaceFileContentUseCase,
} from '@/src/application/use-cases/workspace-tree/get-workspace-file-content.use-case';
import {
  createListWorkspaceTreeUseCase,
  type ListWorkspaceTreeUseCase,
} from '@/src/application/use-cases/workspace-tree/list-workspace-tree.use-case';

const tree: WorkspaceTreeResult = {
  entries: [
    { path: 'src', isDir: true, modifiedAt: '2026-09-09T00:00:00Z' },
    { path: 'src/main.ts', isDir: false, sizeBytes: 12, modifiedAt: '2026-09-09T00:00:00Z' },
  ],
  truncated: false,
};

const content: RunFileContent = {
  blob: new Blob(['hello'], { type: 'text/plain' }),
  mimeType: 'text/plain',
  sizeBytes: 5,
  fileName: 'main.ts',
};

function fakeRepository(overrides: Partial<WorkspaceTreeRepository> = {}): WorkspaceTreeRepository {
  return {
    listTree: vi.fn(),
    getFileContent: vi.fn(),
    ...overrides,
  };
}

describe('workspace-tree use cases', () => {
  it('lists a room tree by delegating the exact room id', async () => {
    const repository = fakeRepository({ listTree: vi.fn().mockResolvedValue(tree) });
    const useCase: ListWorkspaceTreeUseCase = createListWorkspaceTreeUseCase(repository);

    await expect(useCase('room/1')).resolves.toBe(tree);
    expect(repository.listTree).toHaveBeenCalledTimes(1);
    expect(repository.listTree).toHaveBeenCalledWith('room/1');
  });

  it('gets file content by delegating the exact room id and path', async () => {
    const repository = fakeRepository({ getFileContent: vi.fn().mockResolvedValue(content) });
    const useCase: GetWorkspaceFileContentUseCase =
      createGetWorkspaceFileContentUseCase(repository);

    await expect(useCase('room/1', 'src/main.ts')).resolves.toBe(content);
    expect(repository.getFileContent).toHaveBeenCalledTimes(1);
    expect(repository.getFileContent).toHaveBeenCalledWith('room/1', 'src/main.ts');
  });
});
