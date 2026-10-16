// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataWorkflowHistoryPanel } from '@/app/(workspace)/data-workflows/_components/data-workflow-history-panel';
import { ConflictError } from '@/src/entities/errors/application-errors';
import type { DataWorkflowController } from '@/src/interface-adapters/controllers/data-workflow/data-workflow.controller';
import { renderUi } from '@/tests/support/render-ui';

const workflow = {
  id: 'workflow-1',
  name: 'Daily ingest',
  revision: 4,
  paused: false,
  triggerKind: 'CALENDAR' as const,
  publishedVersion: 2,
  createdAt: '2026-09-18T00:00:00.000Z',
  updatedAt: '2026-09-18T00:00:00.000Z',
  draft: {
    name: 'Daily ingest',
    graph: {
      nodes: [
        {
          id: 'trigger',
          type: 'TRIGGER' as const,
          trigger: {
            type: 'CALENDAR' as const,
            timeOfDay: '07:00',
            weekdays: ['MON'] as const,
            timezone: 'UTC',
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    },
  },
};

function controller(overrides: Partial<DataWorkflowController> = {}) {
  return {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    publish: vi.fn(),
    previewSchedule: vi.fn(),
    getSchedule: vi.fn().mockResolvedValue({
      kind: 'CALENDAR',
      lifecycle: 'ENABLED',
      enabled: true,
      paused: false,
      nextDueAt: '2026-09-19T00:00:00.000Z',
      occurrenceCoverage: { coalescedCount: 2 },
    }),
    setPaused: vi.fn().mockResolvedValue({ ...workflow, paused: true, revision: 5 }),
    listVersions: vi.fn().mockResolvedValue([
      {
        id: 'version-2',
        versionNumber: 2,
        graph: { ignored: 'graph' },
        trigger: { ignored: 'trigger' },
        publishedAt: '2026-09-18T00:00:00.000Z',
      },
    ]),
    listRuns: vi.fn().mockResolvedValue([
      {
        id: 'run-1',
        status: 'FAILED',
        revision: 3,
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T00:01:00.000Z',
        attempts: [
          { nodeId: 'load', attemptNumber: 1, state: 'FAILED', executionId: 'execution-1' },
        ],
      },
    ]),
    startRun: vi.fn().mockResolvedValue({ runId: 'run-2', status: 'QUEUED' }),
    retryNode: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } satisfies DataWorkflowController;
}

describe('DataWorkflowHistoryPanel', () => {
  afterEach(cleanup);

  it('shows recovery and historical names while retaining failed attempt links', async () => {
    const api = controller({
      listVersions: vi.fn().mockResolvedValue([
        {
          id: 'version-1',
          versionNumber: 1,
          graph: {
            nodes: [
              { id: 'outcome', type: 'PIPELINE_OUTCOME' },
              { id: 'recovery', type: 'PIPELINE', pipelineId: 'pipeline-new', versionNumber: 1 },
            ],
            edges: [
              {
                id: 'error-route',
                sourceNodeId: 'outcome',
                sourcePortId: 'error',
                targetNodeId: 'recovery',
                targetPortId: 'in',
              },
            ],
          },
          trigger: {},
          pipelineDisplayNames: { recovery: 'Customer retry' },
          publishedAt: '2026-09-18T00:00:00.000Z',
        },
      ]),
      listRuns: vi.fn().mockResolvedValue([
        {
          id: 'run-recovered',
          status: 'SUCCEEDED',
          recoveredFailure: true,
          versionId: 'version-1',
          selectedOutcomeRoutes: [{ nodeId: 'outcome', portId: 'error' }],
          nodeDisplayNames: { load: 'Orders ingest' },
          revision: 3,
          createdAt: '2026-09-18T00:00:00.000Z',
          updatedAt: '2026-09-18T00:01:00.000Z',
          attempts: [
            { nodeId: 'load', attemptNumber: 1, state: 'FAILED', executionId: 'execution-1' },
          ],
        },
      ]),
    });
    renderUi(createElement(DataWorkflowHistoryPanel, { controller: api, workflow }));
    expect(await screen.findByText('Succeeded via Error route')).toBeTruthy();
    expect(
      screen
        .getByText('Succeeded via Error route')
        .closest('[data-slot="badge"]')
        ?.getAttribute('data-variant'),
    ).toBe('success');
    fireEvent.click(screen.getByRole('button', { name: /Expand run run-recovered/i }));
    expect(screen.getByText(/Error route → Customer retry/)).toBeTruthy();
    expect(screen.getByText('Orders ingest')).toBeTruthy();
    expect(screen.getByText('attempt 1')).toBeTruthy();
    expect(screen.getByText('FAILED')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /View execution for Orders ingest attempt 1/ }),
    ).toBeTruthy();
  });

  it('shows safe schedule history, pauses automatic scheduling, and links an attempt to its execution', async () => {
    const api = controller();
    renderUi(createElement(DataWorkflowHistoryPanel, { controller: api, workflow }));

    await screen.findByText('Run history');
    expect(screen.getByText(/Next automatic run/i)).toBeTruthy();
    expect(screen.getByText(/2 due occurrences were coalesced/i)).toBeTruthy();
    expect(screen.queryByText(/v2.*immutable snapshot/i)).toBeNull();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Versions/i }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText(/v2.*immutable snapshot/i)).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Run history/i }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByText('FAILED').closest('[data-slot="badge"]')?.getAttribute('data-variant'),
    ).toBe('danger');
    fireEvent.click(screen.getByRole('button', { name: /Expand run run-1/i }));
    expect(
      screen.getByRole('link', { name: /View execution for load attempt 1/i }).getAttribute('href'),
    ).toBe('/executions?executionId=execution-1');
    expect(screen.queryByText(/parameters|delegation|source values|ignored: graph/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Pause automatic schedule' }));
    await waitFor(() => expect(api.setPaused).toHaveBeenCalledWith(workflow.id, 4, true));
    expect(screen.getByText(/paused affects automatic scheduling only/i)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Automatic scheduling is paused');

    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(api.startRun).toHaveBeenCalledWith(workflow.id));
  });

  it('gives recoverable active-run feedback and requires an explicit append-risk acknowledgement before retrying', async () => {
    const api = controller({ startRun: vi.fn().mockRejectedValue(new ConflictError('active')) });
    renderUi(createElement(DataWorkflowHistoryPanel, { controller: api, workflow }));

    await screen.findByRole('button', { name: 'Run now' });
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await screen.findByText(/another run is already active/i);

    fireEvent.click(screen.getByRole('button', { name: /Expand run run-1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Retry failed node load/i }));
    expect(
      screen
        .getByRole('button', { name: /Acknowledge duplicate-write risk and retry/i })
        .hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('checkbox', { name: /I understand this retry may repeat append writes/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Acknowledge duplicate-write risk and retry/i }),
    );
    await waitFor(() =>
      expect(api.retryNode).toHaveBeenCalledWith({
        workflowId: workflow.id,
        runId: 'run-1',
        nodeId: 'load',
        expectedRevision: 3,
        acknowledgeWriteRisk: true,
      }),
    );
  });

  it('switches between side-by-side history tabs and pages long run lists', async () => {
    const runs = Array.from({ length: 6 }, (_, index) => ({
      id: `run-${index + 1}`,
      status: index === 5 ? ('SUCCEEDED' as const) : ('FAILED' as const),
      revision: 1,
      createdAt: `2026-09-18T00:0${index}:00.000Z`,
      updatedAt: `2026-09-18T00:0${index}:30.000Z`,
      attempts: [],
    }));
    const api = controller({ listRuns: vi.fn().mockResolvedValue(runs) });

    renderUi(createElement(DataWorkflowHistoryPanel, { controller: api, workflow }));

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Run history6', 'Versions1']);
    expect(screen.getByRole('tab', { name: /Run history/i }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /Expand run run-1/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Expand run run-6/i })).toBeNull();
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('button', { name: /Expand run run-6/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Expand run run-1/i })).toBeNull();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Versions/i }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.queryByRole('button', { name: /Expand run run-6/i })).toBeNull();
    expect(screen.getByText(/v2.*immutable snapshot/i)).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Run history/i }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByRole('button', { name: /Expand run run-1/i })).toBeTruthy();
  });

  it('explains that manual schedules run only through Run now', async () => {
    const api = controller({
      getSchedule: vi.fn().mockResolvedValue({
        kind: 'MANUAL',
        lifecycle: 'MANUAL',
        enabled: false,
        paused: false,
        occurrenceCoverage: { coalescedCount: 0 },
      }),
    });
    renderUi(
      createElement(DataWorkflowHistoryPanel, {
        controller: api,
        workflow: { ...workflow, triggerKind: 'MANUAL' },
      }),
    );

    expect(await screen.findByText(/runs only when someone selects Run now/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Pause automatic schedule/i })).toBeNull();
  });

  it('summarizes the saved CDC trigger instead of showing the polling fallback', async () => {
    const api = controller({
      getSchedule: vi.fn().mockResolvedValue({
        kind: 'WATCH_SOURCE',
        lifecycle: 'ENABLED',
        enabled: true,
        paused: false,
        occurrenceCoverage: { coalescedCount: 0 },
      }),
    });
    renderUi(
      createElement(DataWorkflowHistoryPanel, {
        controller: api,
        workflow: {
          ...workflow,
          triggerKind: 'WATCH_SOURCE',
          draft: {
            name: 'CDC ingest',
            graph: {
              nodes: [
                {
                  id: 'trigger',
                  type: 'TRIGGER',
                  trigger: {
                    type: 'WATCH_SOURCE',
                    mode: 'CDC',
                    databaseServiceId: 'source-1',
                    aggregationWindowSeconds: 5,
                    relations: [
                      { schema: 'public', table: 'orders' },
                      { schema: 'public', table: 'brands' },
                    ],
                    changeTypes: ['INSERT', 'UPDATE', 'DELETE'],
                  },
                  position: { x: 0, y: 0 },
                },
              ],
              edges: [],
            },
          },
        },
      }),
    );

    expect(await screen.findByText('Watch Source · CDC')).toBeTruthy();
    expect(screen.getByText('INSERT, UPDATE and DELETE events')).toBeTruthy();
    expect(screen.getByText('2 tables · 5 second window')).toBeTruthy();
    expect(screen.queryByText('Watch Source · polling')).toBeNull();
    expect(screen.queryByText('Unavailable in this release')).toBeNull();
  });
});
