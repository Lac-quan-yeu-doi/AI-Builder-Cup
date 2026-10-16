import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RemoteServiceError } from '@/src/entities/errors/application-errors';
import { BrowserSchedulerService } from '@/src/infrastructure/services/browser-scheduler.service';
import {
  EventSourceExecutionProgressService,
  type EventSourceClient,
} from '@/src/infrastructure/services/event-source-execution-progress.service';

class FakeEventSource implements EventSourceClient {
  public onmessage: ((event: MessageEvent<string>) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public closeCalls = 0;

  public close(): void {
    this.closeCalls += 1;
  }

  public emit(raw: string): void {
    this.onmessage?.({ data: raw } as MessageEvent<string>);
  }

  public fail(error: Event): void {
    this.onerror?.(error);
  }
}

describe('BrowserSchedulerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a repeated task at the requested interval and cancels idempotently', async () => {
    const scheduler = new BrowserSchedulerService();
    let calls = 0;

    const scheduled = scheduler.every(3000, () => {
      calls += 1;
    });

    await vi.advanceTimersByTimeAsync(6000);
    expect(calls).toBe(2);

    scheduled.cancel();
    scheduled.cancel();
    await vi.advanceTimersByTimeAsync(6000);

    expect(calls).toBe(2);
  });
});

describe('EventSourceExecutionProgressService', () => {
  it('uses the encoded legacy URL and maps valid progress events including zero exit codes', () => {
    const source = new FakeEventSource();
    const urls: string[] = [];
    const service = new EventSourceExecutionProgressService('https://core.test/api/v1', (url) => {
      urls.push(url);
      return source;
    });
    const progresses: unknown[] = [];
    const errors: unknown[] = [];

    service.subscribe('execution/one', {
      onProgress: (progress) => progresses.push(progress),
      onError: (error) => errors.push(error),
    });
    source.emit(
      JSON.stringify({
        id: 'execution-1',
        status: 'SUCCEEDED',
        sparkApplicationId: 'application-1',
        exitCode: 0,
        updatedAt: '2026-08-10T08:02:00.000Z',
      }),
    );

    expect(urls).toEqual(['https://core.test/api/v1/executions/execution%2Fone/events']);
    expect(progresses).toEqual([
      {
        id: 'execution-1',
        status: 'succeeded',
        sparkApplicationId: 'application-1',
        exitCode: 0,
        updatedAt: '2026-08-10T08:02:00.000Z',
      },
    ]);
    expect(errors).toEqual([]);
  });

  it.each([
    '',
    '{invalid json',
    JSON.stringify({ id: 'execution-1', status: 'UNKNOWN', updatedAt: 'now' }),
    JSON.stringify({ id: 'execution-1', status: 'toString', updatedAt: 'now' }),
    JSON.stringify({ id: 'execution-1', status: 'constructor', updatedAt: 'now' }),
    JSON.stringify({ id: 'execution-1', status: '__proto__', updatedAt: 'now' }),
    JSON.stringify({ id: 1, status: 'RUNNING', updatedAt: 'now' }),
    JSON.stringify({ id: 'execution-1', status: 'RUNNING', updatedAt: 42 }),
    JSON.stringify({
      id: 'execution-1',
      status: 'RUNNING',
      sparkApplicationId: 42,
      updatedAt: 'now',
    }),
    JSON.stringify({ id: 'execution-1', status: 'RUNNING', exitCode: '0', updatedAt: 'now' }),
    JSON.stringify({
      id: 'execution-1',
      status: 'RUNNING',
      sparkApplicationId: null,
      exitCode: null,
      updatedAt: 'now',
    }),
  ])('ignores an invalid progress payload without failing the stream %#', (raw) => {
    const source = new FakeEventSource();
    const service = new EventSourceExecutionProgressService('https://core.test', () => source);
    const progresses: unknown[] = [];
    const errors: unknown[] = [];

    service.subscribe('execution-1', {
      onProgress: (progress) => progresses.push(progress),
      onError: (error) => errors.push(error),
    });
    source.emit(raw);

    expect(progresses).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('closes the retrying source, translates its error, and suppresses late events', () => {
    const source = new FakeEventSource();
    const service = new EventSourceExecutionProgressService('https://core.test', () => source);
    const progresses: unknown[] = [];
    const errors: unknown[] = [];
    const subscription = service.subscribe('execution-1', {
      onProgress: (progress) => progresses.push(progress),
      onError: (error) => errors.push(error),
    });
    const streamFailure = new Event('error');

    source.fail(streamFailure);
    source.emit(
      JSON.stringify({
        id: 'execution-1',
        status: 'RUNNING',
        updatedAt: '2026-08-10T08:02:00.000Z',
      }),
    );
    subscription.close();

    expect(source.closeCalls).toBe(1);
    expect(progresses).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RemoteServiceError);
    expect(errors[0]).toMatchObject({ cause: streamFailure });
  });

  it('returns an idempotent subscription and suppresses messages after explicit close', () => {
    const source = new FakeEventSource();
    const service = new EventSourceExecutionProgressService('https://core.test', () => source);
    const progresses: unknown[] = [];
    const subscription = service.subscribe('execution-1', {
      onProgress: (progress) => progresses.push(progress),
      onError: () => undefined,
    });

    subscription.close();
    subscription.close();
    source.emit(
      JSON.stringify({
        id: 'execution-1',
        status: 'RUNNING',
        updatedAt: '2026-08-10T08:02:00.000Z',
      }),
    );

    expect(source.closeCalls).toBe(1);
    expect(progresses).toEqual([]);
  });

  it('reports an unavailable EventSource transport synchronously for polling fallback', () => {
    const unavailable = new Error('EventSource unavailable');
    const service = new EventSourceExecutionProgressService('https://core.test', () => {
      throw unavailable;
    });
    const errors: unknown[] = [];

    const subscription = service.subscribe('execution-1', {
      onProgress: () => undefined,
      onError: (error) => errors.push(error),
    });
    subscription.close();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RemoteServiceError);
    expect(errors[0]).toMatchObject({ cause: unavailable });
  });
});
