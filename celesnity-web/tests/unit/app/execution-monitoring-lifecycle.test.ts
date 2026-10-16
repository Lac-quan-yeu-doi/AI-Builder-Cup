// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';

import { renderUi as render } from '@/tests/support/render-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExecutionsScreen } from '@/app/_components/execution/executions-screen';
import { formatTimestamp } from '@/app/_components/execution/execution-format';
import { useExecutionLiveProgress } from '@/app/_components/execution/use-execution-live-progress';
import type { ExecutionRepository } from '@/src/application/repositories/execution.repository.interface';
import type {
  ExecutionProgressObserver,
  ExecutionProgressService,
  ExecutionProgressSubscription,
} from '@/src/application/services/execution-progress.service.interface';
import type { SchedulerService } from '@/src/application/services/scheduler.service.interface';
import { createMonitorExecutionUseCase } from '@/src/application/use-cases/executions/monitor-execution.use-case';
import type {
  ExecutionDetail,
  ExecutionLog,
  ExecutionProgress,
  ExecutionSummary,
  RerunOutcome,
} from '@/src/entities/models/execution';
import { RemoteServiceError } from '@/src/entities/errors/application-errors';
import { createMonitorExecutionController } from '@/src/interface-adapters/controllers/executions/monitor-execution.controller';
import type { ExecutionMonitorControllerHandlers } from '@/src/interface-adapters/controllers/executions/monitor-execution.controller';
import { presentExecutionDetail } from '@/src/interface-adapters/presenters/execution.presenter';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const runningExecution: ExecutionDetail = {
  id: 'execution-1',
  workloadKind: 'SCRIPT',
  versionNumber: 1,
  scriptId: 'script-1',
  scriptVersionId: 'version-1',
  connectionId: 'connection-1',
  status: 'running',
  queuedAt: '2026-08-10T08:00:00.000Z',
  startedAt: '2026-08-10T08:01:00.000Z',
  updatedAt: '2026-08-10T08:02:00.000Z',
};

class FinalSnapshotRepository implements ExecutionRepository {
  public readonly finalSnapshot = deferred<ExecutionDetail>();
  public getCalls = 0;

  public async list(): Promise<readonly ExecutionSummary[]> {
    return [runningExecution];
  }

  public get(): Promise<ExecutionDetail> {
    this.getCalls += 1;
    return this.finalSnapshot.promise;
  }

  public async cancel(): Promise<ExecutionDetail> {
    return runningExecution;
  }

  public async fetchLogs(): Promise<ExecutionLog | undefined> {
    return undefined;
  }

  public async rerun(): Promise<RerunOutcome> {
    return { kind: 'version-missing' };
  }
}

class ControllableProgressService implements ExecutionProgressService {
  public observer?: ExecutionProgressObserver;
  public closeCalls = 0;

  public subscribe(
    _id: string,
    observer: ExecutionProgressObserver,
  ): ExecutionProgressSubscription {
    this.observer = observer;
    return {
      close: () => {
        this.closeCalls += 1;
      },
    };
  }

  public emit(progress: ExecutionProgress): void {
    this.observer?.onProgress(progress);
  }
}

const unusedScheduler: SchedulerService = {
  every: () => {
    throw new Error('Polling is not expected in this lifecycle scenario.');
  },
};

afterEach(() => {
  cleanup();
});

describe('execution monitoring React lifecycle', () => {
  it('shows pipeline names in run executions while retaining the identifier as context', async () => {
    const pipelineExecution: ExecutionDetail = {
      id: 'pipeline-execution-1',
      workloadKind: 'PIPELINE',
      versionNumber: 3,
      pipelineId: 'pipeline-1',
      pipelineVersionId: 'pipeline-version-1',
      status: 'running',
      queuedAt: '2026-08-10T08:00:00.000Z',
      startedAt: '2026-08-10T08:01:00.000Z',
      updatedAt: '2026-08-10T08:02:00.000Z',
    };
    const controllers = {
      list: vi.fn(async () => [presentExecutionDetail(pipelineExecution)]),
      get: vi.fn(async () => presentExecutionDetail(pipelineExecution)),
      cancel: vi.fn(async () => presentExecutionDetail(pipelineExecution)),
      getLogs: vi.fn(async () => undefined),
      rerun: vi.fn(async () => ({ kind: 'version-missing' }) as const),
      monitor: vi.fn(() => ({ close: () => undefined })),
      listPipelines: vi.fn(async () => ({
        items: [
          {
            id: 'pipeline-1',
            name: 'Daily order load',
            status: 'DRAFT' as const,
            version: 3,
            sourceConnectionIds: [],
            createdBy: 'System',
            updatedAt: '2026-08-10T08:00:00.000Z',
          },
        ],
        page: 1,
        pageSize: 100,
        totalItems: 1,
        totalPages: 1,
      })),
    };

    render(createElement(ExecutionsScreen, { controllers }));

    // The row names the pipeline rather than printing its id, which was the
    // widest and least scannable thing on it. The run id stays as the row's
    // tooltip so it can still be quoted.
    const row = await screen.findByRole('button', { name: /Daily order load/u });
    // The id is the tooltip, not the row's accessible name — on the button it
    // made a screen reader announce a UUID instead of the run.
    expect(screen.getByTitle('pipeline-execution-1')).toBeTruthy();
    fireEvent.click(row);

    await waitFor(() => expect(controllers.get).toHaveBeenCalledWith('pipeline-execution-1'));
    expect((await screen.findAllByText(/Daily order load/u)).length).toBeGreaterThan(1);
  });

  it('reports list selection so the route can stay synchronized', async () => {
    const onSelectionChange = vi.fn();
    const controllers = {
      list: vi.fn(async () => [presentExecutionDetail(runningExecution)]),
      get: vi.fn(async () => presentExecutionDetail(runningExecution)),
      cancel: vi.fn(async () => presentExecutionDetail(runningExecution)),
      getLogs: vi.fn(async () => undefined),
      rerun: vi.fn(async () => ({ kind: 'version-missing' }) as const),
      monitor: vi.fn(() => ({ close: () => undefined })),
    };

    render(createElement(ExecutionsScreen, { controllers, onSelectionChange }));

    fireEvent.click(await screen.findByTitle('execution-1'));

    expect(onSelectionChange).toHaveBeenCalledWith('execution-1');
    await waitFor(() => expect(controllers.get).toHaveBeenCalledWith('execution-1'));
  });

  it('loads a different detail when browser navigation changes the requested execution', async () => {
    const second = { ...runningExecution, id: 'execution-2' };
    const controllers = {
      list: vi.fn(async () => [runningExecution, second].map(presentExecutionDetail)),
      get: vi.fn(async (id: string) =>
        presentExecutionDetail(id === second.id ? second : runningExecution),
      ),
      cancel: vi.fn(async () => presentExecutionDetail(runningExecution)),
      getLogs: vi.fn(async () => undefined),
      rerun: vi.fn(async () => ({ kind: 'version-missing' }) as const),
      monitor: vi.fn(() => ({ close: () => undefined })),
    };
    const rendered = render(
      createElement(ExecutionsScreen, {
        controllers,
        initialExecutionId: runningExecution.id,
      }),
    );
    await waitFor(() => expect(controllers.get).toHaveBeenCalledWith(runningExecution.id));

    rendered.rerender(
      createElement(ExecutionsScreen, {
        controllers,
        initialExecutionId: second.id,
      }),
    );

    await waitFor(() => expect(controllers.get).toHaveBeenCalledWith(second.id));
  });

  it('does not reset a loaded selection when the URL acknowledges that same execution', async () => {
    const second = { ...runningExecution, id: 'execution-2' };
    const controllers = {
      list: vi.fn(async () => [runningExecution, second].map(presentExecutionDetail)),
      get: vi.fn(async (id: string) =>
        presentExecutionDetail(id === second.id ? second : runningExecution),
      ),
      cancel: vi.fn(async () => presentExecutionDetail(runningExecution)),
      getLogs: vi.fn(async () => undefined),
      rerun: vi.fn(async () => ({ kind: 'version-missing' }) as const),
      monitor: vi.fn(() => ({ close: () => undefined })),
    };
    const rendered = render(
      createElement(ExecutionsScreen, {
        controllers,
        initialExecutionId: runningExecution.id,
      }),
    );
    const secondLabel = await screen.findByTitle(second.id);
    fireEvent.click(secondLabel.closest('button')!);
    await waitFor(() => expect(controllers.get).toHaveBeenCalledWith(second.id));
    expect(await screen.findByRole('heading', { name: second.id })).toBeTruthy();

    rendered.rerender(
      createElement(ExecutionsScreen, {
        controllers,
        initialExecutionId: second.id,
      }),
    );

    expect(screen.queryByText('Loading execution…')).toBeNull();
    expect(screen.getByRole('heading', { name: second.id })).toBeTruthy();
  });

  it('renders a contextual fallback instead of a hidden native network message', async () => {
    const controllers = {
      list: vi.fn(async () => {
        throw new RemoteServiceError('Failed to fetch', { exposeMessage: false });
      }),
      get: vi.fn(async () => presentExecutionDetail(runningExecution)),
      cancel: vi.fn(async () => presentExecutionDetail(runningExecution)),
      getLogs: vi.fn(async () => undefined),
      rerun: vi.fn(async () => ({ kind: 'version-missing' }) as const),
      monitor: vi.fn(() => ({ close: () => undefined })),
    };

    render(createElement(ExecutionsScreen, { controllers }));

    expect(
      await screen.findByText('Executions could not be loaded. Confirm the Core API is running.'),
    ).toBeTruthy();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });

  it('keeps terminal finalization alive when terminal progress disables live watching', async () => {
    const repository = new FinalSnapshotRepository();
    const progressService = new ControllableProgressService();
    const monitor = createMonitorExecutionController(
      createMonitorExecutionUseCase(repository, progressService, unusedScheduler),
    );
    const controllers = {
      list: vi.fn(async () => [presentExecutionDetail(runningExecution)]),
      get: vi.fn(async () => presentExecutionDetail(runningExecution)),
      cancel: vi.fn(async () => presentExecutionDetail(runningExecution)),
      getLogs: vi.fn(async () => undefined),
      rerun: vi.fn(async () => ({ kind: 'version-missing' }) as const),
      monitor,
    };

    render(createElement(ExecutionsScreen, { controllers }));

    fireEvent.click(await screen.findByTitle('execution-1'));
    await screen.findAllByText('Running');
    await waitFor(() => expect(progressService.observer).toBeDefined());

    await act(async () => {
      progressService.emit({
        id: 'execution-1',
        status: 'cancelled',
        updatedAt: '2026-08-10T08:03:00.000Z',
      });
    });

    expect(repository.getCalls).toBe(1);

    await act(async () => {
      repository.finalSnapshot.resolve({
        ...runningExecution,
        status: 'cancelled',
        errorSummary: 'Cancelled by scheduler\nThe retry budget was exhausted.',
        finishedAt: '2026-08-10T08:03:30.000Z',
        cancelledAt: '2026-08-10T08:04:00.000Z',
        updatedAt: '2026-08-10T08:04:00.000Z',
        resourceProfile: {
          driverMemory: '2g',
          executorMemory: '4g',
          executorCores: 2,
          maxCores: 8,
        },
      });
      await repository.finalSnapshot.promise;
    });

    expect(await screen.findByText('Cancelled by scheduler')).toBeTruthy();
    expect(screen.getByText('The retry budget was exhausted.')).toBeTruthy();
    expect(screen.getByText('2g')).toBeTruthy();
    expect(screen.getByText('4g')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getAllByText('Cancelled')).not.toHaveLength(0);
    // `finishedAt` used to be readable off the list row, which printed all
    // three of queued/started/finished. The rows carry a duration and a clock
    // time now, and the detail shows `Cancelled` in place of `Finished` for a
    // cancelled run — so this is the timestamp the screen actually states.
    expect(screen.getByText(formatTimestamp('2026-08-10T08:04:00.000Z'))).toBeTruthy();
  });

  it('closes replaced monitors and suppresses callbacks after selection changes or unmount', async () => {
    const handlers = new Map<string, ExecutionMonitorControllerHandlers>();
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    const monitor = vi.fn((id: string, nextHandlers: ExecutionMonitorControllerHandlers) => {
      handlers.set(id, nextHandlers);
      nextHandlers.onMode('streaming');
      return { close: id === 'execution-1' ? closeFirst : closeSecond };
    });
    const onSnapshot = vi.fn();
    const onProgress = vi.fn();

    const { rerender, unmount } = renderHook(
      ({ executionId }: { readonly executionId: string }) =>
        useExecutionLiveProgress({
          monitor,
          executionId,
          enabled: true,
          onProgress,
          onSnapshot,
        }),
      { initialProps: { executionId: 'execution-1' } },
    );

    await waitFor(() => expect(monitor).toHaveBeenCalledTimes(1));
    rerender({ executionId: 'execution-2' });
    await waitFor(() => expect(monitor).toHaveBeenCalledTimes(2));
    expect(closeFirst).toHaveBeenCalledOnce();

    act(() => {
      handlers.get('execution-1')?.onSnapshot(presentExecutionDetail(runningExecution));
    });
    expect(onSnapshot).not.toHaveBeenCalled();

    unmount();
    expect(closeSecond).toHaveBeenCalledOnce();
    act(() => {
      handlers
        .get('execution-2')
        ?.onSnapshot(presentExecutionDetail({ ...runningExecution, id: 'execution-2' }));
    });
    expect(onSnapshot).not.toHaveBeenCalled();
  });
});
