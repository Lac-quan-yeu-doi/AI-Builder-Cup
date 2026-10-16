// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDataSourceBrowser } from '@/app/(workspace)/charts/_components/data-source-picker/use-data-source-browser';

afterEach(cleanup);

describe('useDataSourceBrowser', () => {
  it('ignores a late namespace response from an older catalog request', async () => {
    let resolveFirst: ((value: readonly { catalog: string; name: string }[]) => void) | undefined;
    let resolveSecond: ((value: readonly { catalog: string; name: string }[]) => void) | undefined;
    const listNamespaces = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<readonly { catalog: string; name: string }[]>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<readonly { catalog: string; name: string }[]>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const controllers = {
      listCatalogs: vi.fn().mockResolvedValue([]),
      listNamespaces,
      listTables: vi.fn().mockResolvedValue([]),
      loadTableMetadata: vi.fn(),
    };
    const { result } = renderHook(() => useDataSourceBrowser({ controllers }));

    await act(async () => {
      const first = result.current.loadNamespaces('iceberg');
      const second = result.current.loadNamespaces('hive');
      resolveFirst?.([{ catalog: 'iceberg', name: 'old_schema' }]);
      resolveSecond?.([{ catalog: 'hive', name: 'current_schema' }]);
      await Promise.all([first, second]);
    });

    await waitFor(() =>
      expect(result.current.namespaces).toEqual([{ catalog: 'hive', name: 'current_schema' }]),
    );
    expect(result.current.namespaces).not.toContainEqual({
      catalog: 'iceberg',
      name: 'old_schema',
    });
  });
});
