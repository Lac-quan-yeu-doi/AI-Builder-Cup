import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionRepository } from '@/src/application/repositories/execution.repository.interface';
import type {
  ExecutionProgressObserver,
  ExecutionProgressService,
  ExecutionProgressSubscription,
} from '@/src/application/services/execution-progress.service.interface';
import type {
  ScheduledTask,
  SchedulerService,
} from '@/src/application/services/scheduler.service.interface';
import {
  createMonitorExecutionUseCase,
  type ExecutionMonitor,
  type ExecutionMonitorHandlers,
  type ExecutionMonitorMode,
} from '@/src/application/use-cases/executions/monitor-execution.use-case';
import type {
  ExecutionDetail,
  ExecutionLog,
  ExecutionProgress,
  ExecutionSummary,
  RerunOutcome,
} from '@/src/entities/models/execution';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function detail(
  status: ExecutionDetail['status'] = 'running',
  overrides: Partial<ExecutionDetail> = {},
): ExecutionDetail {
  return {
    id: 'execution-1',
    workloadKind: 'SCRIPT',
    versionNumber: 1,
    scriptId: 'script-1',
    scriptVersionId: 'version-1',
    connectionId: 'connection-1',
    status,
    queuedAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:01:00.000Z',
    ...overrides,
  };
}

function progress(status: ExecutionProgress['status']): ExecutionProgress {
  return {
    id: 'execution-1',
    status,
    updatedAt: '2026-08-10T08:02:00.000Z',
  };
}

class DeferredExecutionRepository implements ExecutionRepository {
  public readonly pendingGets: Deferred<ExecutionDetail>[] = [];
  public readonly getIds: string[] = [];

  public async list(): Promise<readonly ExecutionSummary[]> {
    return [];
  }

  public get(id: string): Promise<ExecutionDetail> {
    this.getIds.push(id);
    const request = deferred<ExecutionDetail>();
    this.pendingGets.push(request);
    return request.promise;
  }

  public async cancel(_id: string): Promise<ExecutionDetail> {
    void _id;
    return detail('cancelling');
  }

  public async fetchLogs(_id: string): Promise<ExecutionLog | undefined> {
    void _id;
    return undefined;
  }

  public async rerun(_scriptId: string, _scriptVersionId: string): Promise<RerunOutcome> {
    void _scriptId;
    void _scriptVersionId;
    return { kind: 'version-missing' };
  }
}

class FakeExecutionProgressService implements ExecutionProgressService {
  public observer?: ExecutionProgressObserver;
  public subscribedId?: string;
  public closeCalls = 0;

  public subscribe(id: string, observer: ExecutionProgressObserver): ExecutionProgressSubscription {
    this.subscribedId = id;
    this.observer = observer;
    return {
      close: () => {
        this.closeCalls += 1;
      },
    };
  }

  public emit(value: ExecutionProgress): void {
    this.observer?.onProgress(value);
  }

  public fail(error: unknown): void {
    this.observer?.onError(error);
  }
}

class IntervalScheduler implements SchedulerService {
  public readonly intervals: number[] = [];
  public cancelCalls = 0;

  public every(intervalMs: number, task: () => void): ScheduledTask {
    this.intervals.push(intervalMs);
    const timer = setInterval(task, intervalMs);
    return {
      cancel: () => {
        this.cancelCalls += 1;
        clearInterval(timer);
      },
    };
  }
}

function recordingHandlers() {
  const modes: ExecutionMonitorMode[] = [];
  const progresses: ExecutionProgress[] = [];
  const snapshots: ExecutionDetail[] = [];
  const errors: unknown[] = [];
  const handlers: ExecutionMonitorHandlers = {
    onMode: (mode) => modes.push(mode),
    onProgress: (value) => progresses.push(value),
    onSnapshot: (value) => snapshots.push(value),
    onError: (error) => errors.push(error),
  };
  return { handlers, modes, progresses, snapshots, errors };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('monitor execution use case', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('streams non-terminal progress, then closes SSE and fetches one final terminal snapshot', async () => {
    const repository = new DeferredExecutionRepository();
    const stream = new FakeExecutionProgressService();
    const scheduler = new IntervalScheduler();
    const recording = recordingHandlers();

    createMonitorExecutionUseCase(repository, stream, scheduler)('execution-1', recording.handlers);

    expect(stream.subscribedId).toBe('execution-1');
    expect(recording.modes).toEqual(['streaming']);

    const running = progress('running');
    stream.emit(running);

    expect(recording.progresses).toEqual([running]);
    expect(repository.getIds).toEqual([]);

    const succeeded = progress('succeeded');
    stream.emit(succeeded);

    expect(recording.progresses).toEqual([running, succeeded]);
    expect(stream.closeCalls).toBe(1);
    expect(repository.getIds).toEqual(['execution-1']);
    expect(scheduler.intervals).toEqual([]);

    const finalDetail = detail('succeeded', { finishedAt: '2026-08-10T08:03:00.000Z' });
    repository.pendingGets[0]?.resolve(finalDetail);
    await flushAsyncWork();

    expect(recording.snapshots).toEqual([finalDetail]);
    expect(recording.modes).toEqual(['streaming', 'idle']);
    expect(recording.errors).toEqual([]);
  });

  it('falls back to a 3000 ms poller, coalesces overlap, and stops on a terminal snapshot', async () => {
    const repository = new DeferredExecutionRepository();
    const stream = new FakeExecutionProgressService();
    const scheduler = new IntervalScheduler();
    const recording = recordingHandlers();

    createMonitorExecutionUseCase(repository, stream, scheduler)('execution-1', recording.handlers);
    stream.fail(new Error('stream disconnected'));

    expect(stream.closeCalls).toBe(1);
    expect(scheduler.intervals).toEqual([3000]);
    expect(recording.modes).toEqual(['streaming', 'polling']);
    expect(repository.getIds).toEqual(['execution-1']);

    await vi.advanceTimersByTimeAsync(9000);
    expect(repository.getIds).toEqual(['execution-1']);

    const running = detail('running');
    repository.pendingGets[0]?.resolve(running);
    await flushAsyncWork();
    expect(recording.snapshots).toEqual([running]);

    await vi.advanceTimersByTimeAsync(3000);
    expect(repository.getIds).toEqual(['execution-1', 'execution-1']);

    const succeeded = detail('succeeded');
    repository.pendingGets[1]?.resolve(succeeded);
    await flushAsyncWork();

    expect(recording.snapshots).toEqual([running, succeeded]);
    expect(scheduler.cancelCalls).toBe(1);
    expect(recording.modes).toEqual(['streaming', 'polling', 'idle']);

    await vi.advanceTimersByTimeAsync(9000);
    expect(repository.getIds).toEqual(['execution-1', 'execution-1']);
  });

  it('close cancels the stream and poller and suppresses late progress and snapshots', async () => {
    const repository = new DeferredExecutionRepository();
    const stream = new FakeExecutionProgressService();
    const scheduler = new IntervalScheduler();
    const recording = recordingHandlers();
    const monitor = createMonitorExecutionUseCase(
      repository,
      stream,
      scheduler,
    )('execution-1', recording.handlers);

    stream.fail(new Error('stream disconnected'));
    monitor.close();
    stream.emit(progress('running'));
    repository.pendingGets[0]?.resolve(detail('running'));
    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(9000);

    expect(stream.closeCalls).toBe(1);
    expect(scheduler.cancelCalls).toBe(1);
    expect(recording.progresses).toEqual([]);
    expect(recording.snapshots).toEqual([]);
    expect(recording.modes).toEqual(['streaming', 'polling', 'idle']);
    expect(repository.getIds).toEqual(['execution-1']);
  });

  it('reports a polling failure once, stops polling, and ignores later timer ticks', async () => {
    const repository = new DeferredExecutionRepository();
    const stream = new FakeExecutionProgressService();
    const scheduler = new IntervalScheduler();
    const recording = recordingHandlers();
    const failure = new Error('detail unavailable');

    createMonitorExecutionUseCase(repository, stream, scheduler)('execution-1', recording.handlers);
    stream.fail(new Error('stream disconnected'));
    repository.pendingGets[0]?.reject(failure);
    await flushAsyncWork();

    expect(recording.errors).toEqual([failure]);
    expect(scheduler.cancelCalls).toBe(1);
    expect(recording.modes).toEqual(['streaming', 'polling', 'idle']);

    await vi.advanceTimersByTimeAsync(9000);
    expect(repository.getIds).toEqual(['execution-1']);
  });

  it('does not create a poller when the polling mode callback closes reentrantly', async () => {
    const repository = new DeferredExecutionRepository();
    const stream = new FakeExecutionProgressService();
    const scheduler = new IntervalScheduler();
    const recording = recordingHandlers();
    const monitorRef: { current?: ExecutionMonitor } = {};
    const handlers: ExecutionMonitorHandlers = {
      ...recording.handlers,
      onMode: (mode) => {
        recording.handlers.onMode(mode);
        if (mode === 'polling') {
          monitorRef.current?.close();
        }
      },
    };
    monitorRef.current = createMonitorExecutionUseCase(
      repository,
      stream,
      scheduler,
    )('execution-1', handlers);

    stream.fail(new Error('stream disconnected'));
    await vi.advanceTimersByTimeAsync(9000);

    expect(recording.modes).toEqual(['streaming', 'polling', 'idle']);
    expect(scheduler.intervals).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(repository.getIds).toEqual([]);
  });

  it('does not refetch final detail when the terminal progress callback closes reentrantly', async () => {
    const repository = new DeferredExecutionRepository();
    const stream = new FakeExecutionProgressService();
    const scheduler = new IntervalScheduler();
    const recording = recordingHandlers();
    const monitorRef: { current?: ExecutionMonitor } = {};
    const handlers: ExecutionMonitorHandlers = {
      ...recording.handlers,
      onProgress: (value) => {
        recording.handlers.onProgress(value);
        monitorRef.current?.close();
      },
    };
    monitorRef.current = createMonitorExecutionUseCase(
      repository,
      stream,
      scheduler,
    )('execution-1', handlers);

    const succeeded = progress('succeeded');
    stream.emit(succeeded);
    await flushAsyncWork();

    expect(recording.progresses).toEqual([succeeded]);
    expect(recording.modes).toEqual(['streaming', 'idle']);
    expect(stream.closeCalls).toBe(1);
    expect(scheduler.intervals).toEqual([]);
    expect(repository.getIds).toEqual([]);
  });

  it('cancels a poller candidate when scheduling itself closes reentrantly', async () => {
    const repository = new DeferredExecutionRepository();
    const stream = new FakeExecutionProgressService();
    const recording = recordingHandlers();
    const monitorRef: { current?: ExecutionMonitor } = {};
    let cancelCalls = 0;
    const scheduler: SchedulerService = {
      every: (intervalMs, task) => {
        const timer = setInterval(task, intervalMs);
        monitorRef.current?.close();
        let active = true;
        return {
          cancel: () => {
            if (!active) {
              return;
            }
            active = false;
            cancelCalls += 1;
            clearInterval(timer);
          },
        };
      },
    };
    monitorRef.current = createMonitorExecutionUseCase(
      repository,
      stream,
      scheduler,
    )('execution-1', recording.handlers);

    stream.fail(new Error('stream disconnected'));
    await vi.advanceTimersByTimeAsync(9000);

    expect(recording.modes).toEqual(['streaming', 'polling', 'idle']);
    expect(cancelCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(repository.getIds).toEqual([]);
  });
});
