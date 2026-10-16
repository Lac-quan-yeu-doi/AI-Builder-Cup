// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import type { DataWorkflowController } from '@/src/interface-adapters/controllers/data-workflow/data-workflow.controller';
import { DataWorkflowScreen } from '@/app/(workspace)/data-workflows/_components/data-workflow-screen';

afterEach(() => cleanup());

function controllerWith(items: readonly unknown[]): DataWorkflowController {
  return {
    list: vi.fn().mockResolvedValue({ items, page: 1, pageSize: 20, totalItems: items.length }),
    create: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    publish: vi.fn(),
    previewSchedule: vi.fn(),
    getSchedule: vi.fn(),
    setPaused: vi.fn(),
    listVersions: vi.fn(),
    listRuns: vi.fn(),
    startRun: vi.fn(),
    retryNode: vi.fn(),
  };
}

describe('DataWorkflowScreen', () => {
  it('shows a clear empty state', async () => {
    renderUi(createElement(DataWorkflowScreen, { controller: controllerWith([]) }));

    expect(await screen.findByText('No data workflows yet.')).toBeTruthy();
  });

  it('shows a retryable failed state without a spinner when the initial load fails', async () => {
    const controller: DataWorkflowController = {
      list: vi
        .fn()
        .mockRejectedValueOnce(new Error('Data Workflows API is unavailable'))
        .mockResolvedValueOnce({ items: [], page: 1, pageSize: 20, totalItems: 0 }),
      create: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      publish: vi.fn(),
      previewSchedule: vi.fn(),
      getSchedule: vi.fn(),
      setPaused: vi.fn(),
      listVersions: vi.fn(),
      listRuns: vi.fn(),
      startRun: vi.fn(),
      retryNode: vi.fn(),
    };

    renderUi(createElement(DataWorkflowScreen, { controller }));

    expect(await screen.findByText('Data Workflows API is unavailable')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No data workflows yet.')).toBeTruthy();
  });

  it('keeps the current list visible when a refresh fails', async () => {
    const controller: DataWorkflowController = {
      list: vi
        .fn()
        .mockResolvedValueOnce({
          items: [
            {
              id: 'workflow-1',
              name: 'Current workflow',
              revision: 1,
              paused: false,
              triggerKind: 'MANUAL',
              createdAt: '2026-09-18T00:00:00.000Z',
              updatedAt: '2026-09-18T00:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          totalItems: 1,
        })
        .mockRejectedValueOnce(new Error('Refresh failed')),
      create: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      publish: vi.fn(),
      previewSchedule: vi.fn(),
      getSchedule: vi.fn(),
      setPaused: vi.fn(),
      listVersions: vi.fn(),
      listRuns: vi.fn(),
      startRun: vi.fn(),
      retryNode: vi.fn(),
    };

    renderUi(createElement(DataWorkflowScreen, { controller }));

    expect(await screen.findByText('Current workflow')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Refresh failed')).toBeTruthy();
    expect(screen.getByText('Current workflow')).toBeTruthy();
  });

  it('shows only supported schedule summaries', async () => {
    renderUi(
      createElement(DataWorkflowScreen, {
        controller: controllerWith([
          {
            id: 'workflow-1',
            name: 'Daily ingest',
            revision: 1,
            paused: false,
            triggerKind: 'CALENDAR',
            createdAt: '2026-09-18T00:00:00.000Z',
            updatedAt: '2026-09-18T00:00:00.000Z',
            schedule: {
              kind: 'CALENDAR',
              lifecycle: 'ENABLED',
              enabled: true,
              paused: false,
              nextDueAt: '2026-09-19T00:00:00.000Z',
              occurrenceCoverage: { coalescedCount: 0 },
            },
          },
        ]),
      }),
    );

    expect(await screen.findByText('Daily ingest')).toBeTruthy();
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.queryByText(/Watch Source|CDC/i)).toBeNull();
  });

  it('lazy loads and independently expands activity for each workflow row', async () => {
    const items = ['Daily ingest', 'Weekly archive'].map((name, index) => ({
      id: `workflow-${index + 1}`,
      name,
      revision: 1,
      paused: false,
      triggerKind: 'MANUAL' as const,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    }));
    const controller = controllerWith(items);
    vi.mocked(controller.get).mockImplementation(async (id) => ({
      ...items.find((item) => item.id === id)!,
      draft: {
        name: items.find((item) => item.id === id)!.name,
        graph: {
          nodes: [
            {
              id: 'trigger',
              type: 'TRIGGER',
              trigger: { type: 'MANUAL' },
              position: { x: 48, y: 160 },
            },
          ],
          edges: [],
        },
      },
    }));
    vi.mocked(controller.getSchedule).mockResolvedValue({
      kind: 'MANUAL',
      lifecycle: 'MANUAL',
      enabled: false,
      paused: false,
      occurrenceCoverage: { coalescedCount: 0 },
    });
    vi.mocked(controller.listVersions).mockResolvedValue([]);
    vi.mocked(controller.listRuns).mockResolvedValue([]);

    renderUi(createElement(DataWorkflowScreen, { controller }));

    await screen.findByText('Daily ingest');
    expect(controller.get).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Activity: Daily ingest' }));
    await waitFor(() => expect(controller.get).toHaveBeenCalledWith('workflow-1'));
    expect(await screen.findByText('Schedule and run history')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Activity: Weekly archive' }));
    await waitFor(() => expect(controller.get).toHaveBeenCalledWith('workflow-2'));
    expect(screen.getAllByText('Schedule and run history')).toHaveLength(2);
  });
});
