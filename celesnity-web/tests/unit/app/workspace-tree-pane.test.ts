// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceTreePane } from '@/app/(workspace)/chat/_components/stage/workspace-tree-pane';
import type { ListWorkspaceTreeController } from '@/src/interface-adapters/controllers/workspace-tree/list-workspace-tree.controller';
import type { GetWorkspaceFileContentController } from '@/src/interface-adapters/controllers/workspace-tree/get-workspace-file-content.controller';
import { renderUi } from '@/tests/support/render-ui';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WorkspaceTreePane', () => {
  it('loads and renders a room workspace tree', async () => {
    const listWorkspaceTree: ListWorkspaceTreeController = vi.fn().mockResolvedValue({
      entries: [
        { path: 'src', isDir: true, modifiedAt: '2026-09-09T00:00:00Z' },
        {
          path: 'src/app.ts',
          isDir: false,
          sizeBytes: 42,
          modifiedAt: '2026-09-09T00:00:00Z',
        },
        {
          path: 'README.md',
          isDir: false,
          sizeBytes: 18,
          modifiedAt: '2026-09-09T00:00:00Z',
          mimeType: 'text/markdown',
        },
      ],
      truncated: false,
    });
    const getWorkspaceFileContent: GetWorkspaceFileContentController = vi.fn();

    renderUi(
      createElement(WorkspaceTreePane, {
        roomId: 'room-1',
        listWorkspaceTree,
        getWorkspaceFileContent,
        refreshSignal: 0,
      }),
    );

    expect(await screen.findByRole('button', { name: 'Open src/app.ts' })).not.toBeNull();
    expect(screen.getByText('Markdown')).not.toBeNull();
    expect(listWorkspaceTree).toHaveBeenCalledWith('room-1');
  });

  it('offers retry after the initial tree load fails', async () => {
    const listWorkspaceTree: ListWorkspaceTreeController = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({
        entries: [
          { path: 'README.md', isDir: false, sizeBytes: 12, modifiedAt: '2026-09-09T00:00:00Z' },
        ],
        truncated: false,
      });
    const getWorkspaceFileContent: GetWorkspaceFileContentController = vi.fn();

    renderUi(
      createElement(WorkspaceTreePane, {
        roomId: 'room-1',
        listWorkspaceTree,
        getWorkspaceFileContent,
        refreshSignal: 0,
      }),
    );

    expect(await screen.findByRole('alert')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('button', { name: 'Open README.md' })).not.toBeNull();
    expect(listWorkspaceTree).toHaveBeenCalledTimes(2);
  });

  it('shows optimistic change badges and rows until the listing reconciles', async () => {
    const listWorkspaceTree: ListWorkspaceTreeController = vi
      .fn()
      .mockResolvedValueOnce({
        entries: [
          { path: 'README.md', isDir: false, sizeBytes: 12, modifiedAt: '2026-09-09T00:00:00Z' },
        ],
        truncated: false,
      })
      .mockRejectedValueOnce(new Error('refresh unavailable'));
    const getWorkspaceFileContent: GetWorkspaceFileContentController = vi.fn();
    const view = renderUi(
      createElement(WorkspaceTreePane, {
        roomId: 'room-1',
        listWorkspaceTree,
        getWorkspaceFileContent,
        refreshSignal: 0,
      }),
    );

    expect(await screen.findByRole('button', { name: 'Open README.md' })).not.toBeNull();
    view.rerender(
      createElement(WorkspaceTreePane, {
        roomId: 'room-1',
        listWorkspaceTree,
        getWorkspaceFileContent,
        refreshSignal: 1,
        workspaceChanges: [
          { path: 'README.md', kind: 'modified' },
          { path: 'new.txt', kind: 'created' },
        ],
      }),
    );

    expect(await screen.findByText('Modified')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Open new.txt, Created' })).not.toBeNull();
  });
  it('debounces refresh signals and keeps the last good tree after an error', async () => {
    vi.useFakeTimers();
    const listWorkspaceTree: ListWorkspaceTreeController = vi
      .fn()
      .mockResolvedValueOnce({
        entries: [
          { path: 'README.md', isDir: false, sizeBytes: 12, modifiedAt: '2026-09-09T00:00:00Z' },
        ],
        truncated: false,
      })
      .mockRejectedValueOnce(new Error('temporary failure'));
    const getWorkspaceFileContent: GetWorkspaceFileContentController = vi.fn();
    const view = renderUi(
      createElement(WorkspaceTreePane, {
        roomId: 'room-1',
        listWorkspaceTree,
        getWorkspaceFileContent,
        refreshSignal: 0,
      }),
    );

    vi.advanceTimersByTime(0);
    await vi.waitFor(() => expect(listWorkspaceTree).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Open README.md' })).not.toBeNull();

    view.rerender(
      createElement(WorkspaceTreePane, {
        roomId: 'room-1',
        listWorkspaceTree,
        getWorkspaceFileContent,
        refreshSignal: 1,
      }),
    );
    vi.advanceTimersByTime(299);
    expect(listWorkspaceTree).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await act(async () => {
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(listWorkspaceTree).toHaveBeenCalledTimes(2));

    expect(screen.getByRole('button', { name: 'Open README.md' })).not.toBeNull();
    expect(screen.getByRole('alert')).not.toBeNull();
  });
});
