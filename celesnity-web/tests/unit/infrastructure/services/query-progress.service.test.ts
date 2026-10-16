import { describe, expect, it } from 'vitest';

import { RemoteServiceError } from '@/src/entities/errors/application-errors';
import {
  EventSourceQueryProgressService,
  type QueryEventSourceClient,
} from '@/src/infrastructure/services/event-source-query-progress.service';

class FakeEventSource implements QueryEventSourceClient {
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

describe('EventSourceQueryProgressService', () => {
  it('uses the encoded query event URL and maps every optional event field including zeros', () => {
    const source = new FakeEventSource();
    const urls: string[] = [];
    const service = new EventSourceQueryProgressService('https://core.test/api/v1', (url) => {
      urls.push(url);
      return source;
    });
    const events: unknown[] = [];

    service.subscribe('query/one', {
      onEvent: (event) => events.push(event),
      onError: () => undefined,
    });
    source.emit(
      JSON.stringify({
        id: 'query-1',
        status: 'SUCCEEDED',
        finished: true,
        progressPercentage: 0,
        state: 'FINISHED',
        rowCount: 0,
        errorCode: '',
        updatedAt: '2026-08-10T08:02:00.000Z',
      }),
    );

    expect(urls).toEqual(['https://core.test/api/v1/sql-executions/query%2Fone/events']);
    expect(events).toEqual([
      {
        id: 'query-1',
        status: 'succeeded',
        finished: true,
        progressPercentage: 0,
        state: 'FINISHED',
        rowCount: 0,
        errorCode: '',
        updatedAt: '2026-08-10T08:02:00.000Z',
      },
    ]);
  });

  it.each([
    '',
    '{invalid json',
    JSON.stringify({ id: 'query-1', status: 'UNKNOWN', finished: false, updatedAt: 'now' }),
    JSON.stringify({ id: 'query-1', status: 'toString', finished: false, updatedAt: 'now' }),
    JSON.stringify({ id: 'query-1', status: '__proto__', finished: false, updatedAt: 'now' }),
    JSON.stringify({ id: 1, status: 'RUNNING', finished: false, updatedAt: 'now' }),
    JSON.stringify({ id: 'query-1', status: 'RUNNING', finished: 'false', updatedAt: 'now' }),
    JSON.stringify({ id: 'query-1', status: 'RUNNING', finished: false, updatedAt: 1 }),
    JSON.stringify({
      id: 'query-1',
      status: 'RUNNING',
      finished: false,
      progressPercentage: '0',
      updatedAt: 'now',
    }),
    JSON.stringify({
      id: 'query-1',
      status: 'RUNNING',
      finished: false,
      state: null,
      updatedAt: 'now',
    }),
    JSON.stringify({
      id: 'query-1',
      status: 'RUNNING',
      finished: false,
      rowCount: null,
      updatedAt: 'now',
    }),
    JSON.stringify({
      id: 'query-1',
      status: 'RUNNING',
      finished: false,
      errorCode: 42,
      updatedAt: 'now',
    }),
  ])('ignores invalid query progress payloads without failing the stream %#', (raw) => {
    const source = new FakeEventSource();
    const service = new EventSourceQueryProgressService('https://core.test', () => source);
    const events: unknown[] = [];
    const errors: unknown[] = [];

    service.subscribe('query-1', {
      onEvent: (event) => events.push(event),
      onError: (error) => errors.push(error),
    });
    source.emit(raw);

    expect(events).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('closes on stream error, translates the error, and suppresses late events', () => {
    const source = new FakeEventSource();
    const service = new EventSourceQueryProgressService('https://core.test', () => source);
    const events: unknown[] = [];
    const errors: unknown[] = [];
    const subscription = service.subscribe('query-1', {
      onEvent: (event) => events.push(event),
      onError: (error) => errors.push(error),
    });
    const failure = new Event('error');

    source.fail(failure);
    source.emit(
      JSON.stringify({
        id: 'query-1',
        status: 'RUNNING',
        finished: false,
        updatedAt: 'now',
      }),
    );
    subscription.close();

    expect(source.closeCalls).toBe(1);
    expect(events).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RemoteServiceError);
    expect(errors[0]).toMatchObject({ cause: failure });
  });

  it('returns idempotent cleanup and reports unavailable transport synchronously', () => {
    const source = new FakeEventSource();
    const live = new EventSourceQueryProgressService('https://core.test', () => source);
    const subscription = live.subscribe('query-1', {
      onEvent: () => undefined,
      onError: () => undefined,
    });
    subscription.close();
    subscription.close();

    const unavailable = new Error('EventSource unavailable');
    const errors: unknown[] = [];
    const missing = new EventSourceQueryProgressService('https://core.test', () => {
      throw unavailable;
    });
    const noOp = missing.subscribe('query-1', {
      onEvent: () => undefined,
      onError: (error) => errors.push(error),
    });
    noOp.close();

    expect(source.closeCalls).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RemoteServiceError);
    expect(errors[0]).toMatchObject({ cause: unavailable });
  });
});
