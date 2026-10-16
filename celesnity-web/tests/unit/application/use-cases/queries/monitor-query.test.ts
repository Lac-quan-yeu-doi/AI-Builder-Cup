import { describe, expect, it } from 'vitest';

import type { QueryRepository } from '@/src/application/repositories/query.repository.interface';
import type {
  QueryProgressObserver,
  QueryProgressService,
  QueryProgressSubscription,
} from '@/src/application/services/query-progress.service.interface';
import type {
  ScheduledTask,
  SchedulerService,
} from '@/src/application/services/scheduler.service.interface';
import {
  createMonitorQueryUseCase,
  type QueryMonitor,
  type QueryMonitorHandlers,
} from '@/src/application/use-cases/queries/monitor-query.use-case';
import type {
  QueryEditorSession,
  SqlCatalog,
  SqlExecutionAccepted,
  SqlExecutionEvent,
  SqlExecutionResult,
  SqlExecutionSummary,
  SqlNamespace,
} from '@/src/entities/models/query';

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

function snapshot(status: SqlExecutionResult['status'] = 'running'): SqlExecutionResult {
  return {
    id: 'query-1',
    status,
    catalog: 'iceberg',
    sql: 'SELECT 1',
    columns: [],
    rows: [],
    truncated: false,
    resultsAvailable: false,
    queuedAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:01:00.000Z',
  };
}

function progress(status: SqlExecutionEvent['status'] = 'running'): SqlExecutionEvent {
  return {
    id: 'query-1',
    status,
    finished: status === 'succeeded',
    updatedAt: '2026-08-10T08:01:00.000Z',
  };
}

class DeferredQueryRepository implements QueryRepository {
  public readonly pendingGets: Deferred<SqlExecutionResult>[] = [];
  public readonly getIds: string[] = [];

  public async listCatalogs(): Promise<readonly SqlCatalog[]> {
    return [];
  }
  public async listNamespaces(_catalog: string): Promise<readonly SqlNamespace[]> {
    void _catalog;
    return [];
  }
  public async listHistory(): Promise<readonly SqlExecutionSummary[]> {
    return [];
  }
  public async submit(_session: QueryEditorSession): Promise<SqlExecutionAccepted> {
    void _session;
    return { id: 'query-1', status: 'queued' };
  }
  public get(id: string): Promise<SqlExecutionResult> {
    this.getIds.push(id);
    const request = deferred<SqlExecutionResult>();
    this.pendingGets.push(request);
    return request.promise;
  }
  public async cancel(_id: string): Promise<SqlExecutionResult> {
    void _id;
    return snapshot('cancelled');
  }
}

class FakeQueryProgressService implements QueryProgressService {
  public observer?: QueryProgressObserver;
  public closeCalls = 0;
  public subscribedId?: string;
  public synchronousError?: unknown;

  public subscribe(id: string, observer: QueryProgressObserver): QueryProgressSubscription {
    this.subscribedId = id;
    this.observer = observer;
    if (this.synchronousError !== undefined) {
      observer.onError(this.synchronousError);
    }
    return { close: () => (this.closeCalls += 1) };
  }

  public emit(event: SqlExecutionEvent): void {
    this.observer?.onEvent(event);
  }

  public fail(error: unknown): void {
    this.observer?.onError(error);
  }
}

class ManualScheduler implements SchedulerService {
  public readonly intervals: number[] = [];
  public readonly tasks: (() => void)[] = [];
  public cancelCalls = 0;

  public every(intervalMs: number, task: () => void): ScheduledTask {
    this.intervals.push(intervalMs);
    this.tasks.push(task);
    return { cancel: () => (this.cancelCalls += 1) };
  }
}

function recordingHandlers() {
  const snapshots: SqlExecutionResult[] = [];
  const progresses: SqlExecutionEvent[] = [];
  const channels: string[] = [];
  const errors: unknown[] = [];
  const handlers: QueryMonitorHandlers = {
    onSnapshot: (value) => snapshots.push(value),
    onProgress: (value) => progresses.push(value),
    onChannel: (value) => channels.push(value),
    onError: (value) => errors.push(value),
  };
  return { handlers, snapshots, progresses, channels, errors };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('monitor query use case', () => {
  it('starts an immediate snapshot and streaming channel, then refreshes for progress events', async () => {
    const repository = new DeferredQueryRepository();
    const stream = new FakeQueryProgressService();
    const scheduler = new ManualScheduler();
    const recording = recordingHandlers();

    createMonitorQueryUseCase(repository, stream, scheduler)('query/one', recording.handlers);

    expect(repository.getIds).toEqual(['query/one']);
    expect(stream.subscribedId).toBe('query/one');
    expect(recording.channels).toEqual(['streaming']);

    repository.pendingGets[0]?.resolve(snapshot());
    await flushAsyncWork();
    const event = progress();
    stream.emit(event);

    expect(recording.progresses).toEqual([event]);
    expect(repository.getIds).toEqual(['query/one', 'query/one']);
  });

  it('coalesces multiple events during a refresh into one follow-up refresh', async () => {
    const repository = new DeferredQueryRepository();
    const stream = new FakeQueryProgressService();
    const recording = recordingHandlers();

    createMonitorQueryUseCase(
      repository,
      stream,
      new ManualScheduler(),
    )('query-1', recording.handlers);
    stream.emit(progress());
    stream.emit(progress());
    stream.emit(progress());

    expect(repository.getIds).toEqual(['query-1']);
    repository.pendingGets[0]?.resolve(snapshot());
    await flushAsyncWork();

    expect(repository.getIds).toEqual(['query-1', 'query-1']);
  });

  it('falls back to 1500 ms polling after stream error and stops on a terminal snapshot', async () => {
    const repository = new DeferredQueryRepository();
    const stream = new FakeQueryProgressService();
    const scheduler = new ManualScheduler();
    const recording = recordingHandlers();

    createMonitorQueryUseCase(repository, stream, scheduler)('query-1', recording.handlers);
    stream.fail(new Error('stream failed'));

    expect(stream.closeCalls).toBe(1);
    expect(scheduler.intervals).toEqual([1500]);
    expect(recording.channels).toEqual(['streaming', 'polling']);
    expect(repository.getIds).toEqual(['query-1']);

    repository.pendingGets[0]?.resolve(snapshot('succeeded'));
    await flushAsyncWork();

    expect(recording.snapshots).toEqual([snapshot('succeeded')]);
    expect(scheduler.cancelCalls).toBe(1);
    scheduler.tasks[0]?.();
    expect(repository.getIds).toEqual(['query-1']);
  });

  it('falls back safely when subscribe reports an error before returning its subscription', () => {
    const repository = new DeferredQueryRepository();
    const stream = new FakeQueryProgressService();
    stream.synchronousError = new Error('synchronous stream failure');
    const scheduler = new ManualScheduler();
    const recording = recordingHandlers();

    createMonitorQueryUseCase(repository, stream, scheduler)('query-1', recording.handlers);

    expect(stream.closeCalls).toBe(1);
    expect(scheduler.intervals).toEqual([1500]);
    expect(recording.channels).toEqual(['streaming', 'polling']);
  });

  it('keeps streaming after a refresh error and recovers on the next SSE event', async () => {
    const repository = new DeferredQueryRepository();
    const stream = new FakeQueryProgressService();
    const scheduler = new ManualScheduler();
    const recording = recordingHandlers();
    const failure = new Error('snapshot failed');

    createMonitorQueryUseCase(repository, stream, scheduler)('query-1', recording.handlers);
    repository.pendingGets[0]?.reject(failure);
    await flushAsyncWork();

    expect(recording.errors).toEqual([failure]);
    expect(stream.closeCalls).toBe(0);

    const event = progress();
    stream.emit(event);
    repository.pendingGets[1]?.resolve(snapshot('running'));
    await flushAsyncWork();

    expect(recording.errors).toEqual([failure]);
    expect(recording.progresses).toEqual([event]);
    expect(recording.snapshots).toEqual([snapshot('running')]);
    expect(repository.getIds).toEqual(['query-1', 'query-1']);
    expect(stream.closeCalls).toBe(0);
    expect(scheduler.intervals).toEqual([]);
  });

  it('keeps polling after a refresh error and recovers on a later 1500 ms tick', async () => {
    const repository = new DeferredQueryRepository();
    const stream = new FakeQueryProgressService();
    const scheduler = new ManualScheduler();
    const recording = recordingHandlers();
    const failure = new Error('poll refresh failed');

    createMonitorQueryUseCase(repository, stream, scheduler)('query-1', recording.handlers);
    repository.pendingGets[0]?.resolve(snapshot('running'));
    await flushAsyncWork();
    stream.fail(new Error('stream failed'));

    expect(repository.getIds).toEqual(['query-1', 'query-1']);
    repository.pendingGets[1]?.reject(failure);
    await flushAsyncWork();

    expect(recording.errors).toEqual([failure]);
    expect(scheduler.intervals).toEqual([1500]);
    expect(scheduler.cancelCalls).toBe(0);

    scheduler.tasks[0]?.();
    repository.pendingGets[2]?.resolve(snapshot('running'));
    await flushAsyncWork();

    expect(repository.getIds).toEqual(['query-1', 'query-1', 'query-1']);
    expect(recording.snapshots).toEqual([snapshot('running'), snapshot('running')]);
    expect(scheduler.cancelCalls).toBe(0);
  });

  it('cleans up when onError closes reentrantly and suppresses late callbacks', async () => {
    const repository = new DeferredQueryRepository();
    const stream = new FakeQueryProgressService();
    const scheduler = new ManualScheduler();
    const monitorRef: { current?: QueryMonitor } = {};
    const errors: unknown[] = [];
    const progresses: SqlExecutionEvent[] = [];
    const snapshots: SqlExecutionResult[] = [];
    const failure = new Error('snapshot failed');
    const handlers: QueryMonitorHandlers = {
      onSnapshot: (value) => snapshots.push(value),
      onProgress: (value) => progresses.push(value),
      onError: (error) => {
        errors.push(error);
        monitorRef.current?.close();
      },
    };
    monitorRef.current = createMonitorQueryUseCase(
      repository,
      stream,
      scheduler,
    )('query-1', handlers);

    repository.pendingGets[0]?.reject(failure);
    await flushAsyncWork();
    stream.emit(progress());
    stream.fail(new Error('late stream error'));

    expect(errors).toEqual([failure]);
    expect(stream.closeCalls).toBe(1);
    expect(progresses).toEqual([]);
    expect(snapshots).toEqual([]);
    expect(repository.getIds).toEqual(['query-1']);
    expect(scheduler.intervals).toEqual([]);
  });

  it('explicit close is idempotent and ignores late snapshots, progress, and stream errors', async () => {
    const repository = new DeferredQueryRepository();
    const stream = new FakeQueryProgressService();
    const scheduler = new ManualScheduler();
    const recording = recordingHandlers();
    const monitor = createMonitorQueryUseCase(
      repository,
      stream,
      scheduler,
    )('query-1', recording.handlers);

    monitor.close();
    monitor.close();
    stream.emit(progress());
    stream.fail(new Error('late'));
    repository.pendingGets[0]?.resolve(snapshot());
    await flushAsyncWork();

    expect(stream.closeCalls).toBe(1);
    expect(recording.snapshots).toEqual([]);
    expect(recording.progresses).toEqual([]);
    expect(recording.errors).toEqual([]);
    expect(scheduler.intervals).toEqual([]);
  });

  it('does not schedule or refresh after reentrant close from a polling channel callback', () => {
    const repository = new DeferredQueryRepository();
    const stream = new FakeQueryProgressService();
    const scheduler = new ManualScheduler();
    const monitorRef: { current?: QueryMonitor } = {};
    const channels: string[] = [];
    const handlers: QueryMonitorHandlers = {
      onSnapshot: () => undefined,
      onChannel: (channel) => {
        channels.push(channel);
        if (channel === 'polling') {
          monitorRef.current?.close();
        }
      },
      onError: () => undefined,
    };
    monitorRef.current = createMonitorQueryUseCase(
      repository,
      stream,
      scheduler,
    )('query-1', handlers);

    stream.fail(new Error('stream failed'));

    expect(channels).toEqual(['streaming', 'polling']);
    expect(scheduler.intervals).toEqual([]);
    expect(repository.getIds).toEqual(['query-1']);
  });

  it('starts only one poller when closing the stream reentrantly reports another error', () => {
    const repository = new DeferredQueryRepository();
    const scheduler = new ManualScheduler();
    const recording = recordingHandlers();
    let observer: QueryProgressObserver | undefined;
    const stream: QueryProgressService = {
      subscribe: (_id, nextObserver) => {
        void _id;
        observer = nextObserver;
        return {
          close: () => observer?.onError(new Error('close emitted an error')),
        };
      },
    };

    createMonitorQueryUseCase(repository, stream, scheduler)('query-1', recording.handlers);
    observer?.onError(new Error('stream failed'));

    expect(recording.channels).toEqual(['streaming', 'polling']);
    expect(scheduler.intervals).toEqual([1500]);
  });
});
