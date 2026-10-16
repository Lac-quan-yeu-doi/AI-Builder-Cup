// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QueryWorkbenchScreen } from '@/app/(workspace)/sql/_components/query-workbench-screen';
import type { QueryMonitorControllerHandlers } from '@/src/interface-adapters/controllers/queries/monitor-query.controller';
import type { SqlExecutionResultViewModel } from '@/src/interface-adapters/presenters/query.presenter';
import { renderUi as render } from '@/tests/support/render-ui';

afterEach(cleanup);

describe('query workbench data context', () => {
  it('keeps the default Iceberg catalog internal and exposes non-system databases', async () => {
    let onSnapshot: QueryMonitorControllerHandlers['onSnapshot'] | undefined;
    const listNamespaces = vi.fn().mockResolvedValue([
      { catalog: 'iceberg', name: 'system' },
      { catalog: 'iceberg', name: 'test' },
    ]);
    const submit = vi.fn().mockResolvedValue({ id: 'query-1', status: 'QUEUED' });
    const controllers = Object.freeze({
      listCatalogs: vi.fn().mockResolvedValue([
        { name: 'other', jdbcCatalogIdentity: 'other' },
        { name: 'iceberg', jdbcCatalogIdentity: 'celesnity' },
      ]),
      listNamespaces,
      listHistory: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      cancel: vi.fn(),
      submit,
      monitor: vi.fn((_id: string, callbacks: QueryMonitorControllerHandlers) => {
        onSnapshot = callbacks.onSnapshot;
        return { close: vi.fn() };
      }),
    }) as unknown as Parameters<typeof QueryWorkbenchScreen>[0]['controllers'];

    render(createElement(QueryWorkbenchScreen, { controllers }));

    const database = await screen.findByLabelText('Database');
    await waitFor(() => expect((database as HTMLSelectElement).value).toBe('test'));
    expect(listNamespaces).toHaveBeenCalledWith('iceberg');
    expect(screen.queryByLabelText('Catalog')).toBeNull();
    expect(screen.queryByLabelText('Schema')).toBeNull();
    expect(within(database).queryByRole('option', { name: 'system' })).toBeNull();
    expect(within(database).getByRole('option', { name: 'test' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Run query' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        sql: 'SELECT 1 AS example',
        context: { catalog: 'iceberg', namespace: 'test' },
      }),
    );

    act(() =>
      onSnapshot?.({
        id: 'query-1',
        status: 'succeeded',
        catalog: 'iceberg',
        namespace: 'test',
        sql: 'SELECT 1 AS example',
        columns: [{ name: 'example', type: 'integer' }],
        rows: [[1]],
        rowCount: 1,
        truncated: false,
        resultsAvailable: true,
        queuedAt: '2026-09-21T13:00:00.000Z',
        finishedAt: '2026-09-21T13:00:00.100Z',
        updatedAt: '2026-09-21T13:00:00.100Z',
      } satisfies SqlExecutionResultViewModel),
    );

    expect(document.querySelector('[data-tutorial-target="query-results"]')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Query result rows' })).toBeTruthy();
  });
});
