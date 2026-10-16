import { EventEmitter } from 'node:events';

import type { NextFunction, Request, Response } from 'express';

import { createHttpRequestLoggingMiddleware } from '@presentation/http/http-request-logging.middleware';
import { MessageBlockSseTransport } from '@presentation/message-block/message-block-sse.transport';

describe('HTTP request logging middleware', () => {
  it('counts an admitted stream disconnect as 499 without warning or recording completion twice', () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const metrics = { requestStarted: jest.fn(), requestCompleted: jest.fn() };
    const request = {
      headers: {},
      get: jest.fn(),
      method: 'GET',
      path: '/api/v1/rooms/room/message-blocks/stream',
      originalUrl: '/api/v1/rooms/room/message-blocks/stream',
    } as unknown as Request;
    const response = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      statusCode: 200,
      writableEnded: false,
      destroyed: false,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
    }) as unknown as Response;
    createHttpRequestLoggingMiddleware(logger, metrics)(request, response, jest.fn());
    new MessageBlockSseTransport().create(response).start();
    response.emit('close');
    response.emit('finish');
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(JSON.parse(logger.log.mock.calls[1]?.[0] ?? '{}')).toEqual(
      expect.objectContaining({
        status: 499,
        responseStatus: 200,
        outcome: 'client_disconnected',
      }),
    );
    expect(metrics.requestCompleted).toHaveBeenCalledTimes(1);
    expect(metrics.requestCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: '499' }),
      expect.any(Number),
    );
  });

  it.each(['error', 'slow_consumer', 'oversized'] as const)(
    'preserves warning severity for admitted %s failures despite a client close hint',
    (reason) => {
      const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const request = {
        headers: { 'x-stream-close-reason': 'unmount' },
        get: jest.fn(),
        method: 'GET',
        path: '/stream',
        originalUrl: '/stream',
      } as unknown as Request;
      const response = Object.assign(new EventEmitter(), {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        statusCode: 200,
        writableEnded: false,
        destroyed: false,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
      }) as unknown as Response;
      createHttpRequestLoggingMiddleware(logger)(request, response, jest.fn());
      const connection = new MessageBlockSseTransport().create(response);
      connection.start();
      connection.setCloseReason(reason);
      response.emit('close');
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(JSON.parse(logger.warn.mock.calls[0]?.[0] ?? '{}')).toEqual(
        expect.objectContaining({ status: 499, outcome: reason }),
      );
    },
  );

  it('counts a normal finish then close only once with the server rotation reason', () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const metrics = { requestStarted: jest.fn(), requestCompleted: jest.fn() };
    const request = {
      headers: {},
      get: jest.fn(),
      method: 'GET',
      path: '/stream',
      originalUrl: '/stream',
    } as unknown as Request;
    const response = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      statusCode: 200,
      writableEnded: true,
      destroyed: false,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
    }) as unknown as Response;
    createHttpRequestLoggingMiddleware(logger, metrics)(request, response, jest.fn());
    const connection = new MessageBlockSseTransport().create(response);
    connection.start();
    connection.setCloseReason('rotation');
    response.emit('finish');
    response.emit('close');
    expect(metrics.requestCompleted).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(JSON.parse(logger.log.mock.calls[1]?.[0] ?? '{}')).toEqual(
      expect.objectContaining({ status: 200, responseStatus: 200, outcome: 'rotation' }),
    );
  });

  it('does not trust an SSE Accept header to downgrade an unregistered disconnect', () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const request = {
      headers: { accept: 'text/event-stream' },
      get: jest.fn(),
      method: 'GET',
      path: '/api/v1/rooms/room/message-blocks/stream',
      originalUrl: '/api/v1/rooms/room/message-blocks/stream',
    } as unknown as Request;
    const response = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      statusCode: 200,
      writableEnded: false,
    }) as unknown as Response;
    createHttpRequestLoggingMiddleware(logger)(request, response, jest.fn());
    response.emit('close');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
  it('logs request completion and exposes a correlation ID', () => {
    const log = jest.fn<void, [string]>();
    const logger = { error: jest.fn(), log, warn: jest.fn() };
    const middleware = createHttpRequestLoggingMiddleware(logger);
    const request = {
      headers: {},
      get: jest.fn().mockReturnValue('https://dev.celesnity.com'),
      method: 'GET',
      originalUrl: '/api/v1/connections?ignored=value',
      path: '/api/v1/connections',
    } as unknown as Request;
    const events = new EventEmitter();
    const setHeader = jest.fn();
    const response = Object.assign(events, {
      setHeader,
      statusCode: 200,
    }) as unknown as Response;
    const next = jest.fn() as NextFunction;

    middleware(request, response, next);
    events.emit('finish');

    expect(next).toHaveBeenCalledTimes(1);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[1]?.[0]).toContain('"event":"http_request_completed"');
    expect(JSON.parse(log.mock.calls[1]?.[0] ?? '{}')).toEqual(
      expect.objectContaining({ occurredAt: expect.any(String) }),
    );
    expect(log.mock.calls[1]?.[0]).toContain('"path":"/api/v1/connections"');
    expect(log.mock.calls[1]?.[0]).not.toContain('ignored=value');
  });

  it('preserves a valid caller-provided request ID', () => {
    const middleware = createHttpRequestLoggingMiddleware({
      error: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    });
    const request = {
      headers: {},
      get: jest.fn((header: string) =>
        header === 'X-Request-Id' ? 'frontend-request-123' : undefined,
      ),
      method: 'GET',
      originalUrl: '/api/v1/pipelines',
      path: '/api/v1/pipelines',
    } as unknown as Request;
    const setHeader = jest.fn();
    const events = new EventEmitter();
    const response = Object.assign(events, {
      setHeader,
      statusCode: 200,
    }) as unknown as Response;

    middleware(request, response, jest.fn());

    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'frontend-request-123');
  });

  it('records a forbidden response with a timestamp and request ID', () => {
    const warn = jest.fn<void, [string]>();
    const middleware = createHttpRequestLoggingMiddleware({
      error: jest.fn(),
      log: jest.fn(),
      warn,
    });
    const request = {
      headers: {},
      get: jest.fn((header: string) =>
        header === 'X-Request-Id' ? 'forbidden-request-1' : undefined,
      ),
      method: 'POST',
      originalUrl: '/api/v1/sql-executions?query=private',
      path: '/api/v1/sql-executions',
    } as unknown as Request;
    const events = new EventEmitter();
    const response = Object.assign(events, {
      setHeader: jest.fn(),
      statusCode: 403,
    }) as unknown as Response;

    middleware(request, response, jest.fn());
    events.emit('finish');

    expect(warn).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(warn.mock.calls[0]?.[0] ?? '{}');
    expect(entry).toEqual(
      expect.objectContaining({
        event: 'http_request_completed',
        requestId: 'forbidden-request-1',
        status: 403,
        occurredAt: expect.any(String),
      }),
    );
    expect(warn.mock.calls[0]?.[0]).not.toContain('private');
  });

  it('records a valid cross-service correlation ID without logging arbitrary headers', () => {
    const log = jest.fn<void, [string]>();
    const middleware = createHttpRequestLoggingMiddleware({
      error: jest.fn(),
      log,
      warn: jest.fn(),
    });
    const request = {
      headers: {},
      get: jest.fn((header: string) =>
        header === 'X-Correlation-Id' ? 'web-request-123' : undefined,
      ),
      method: 'GET',
      originalUrl: '/api/v1/rooms/room-1/history',
      path: '/api/v1/rooms/room-1/history',
    } as unknown as Request;
    const events = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      statusCode: 200,
    }) as unknown as Response;

    middleware(request, events, jest.fn());
    events.emit('finish');

    expect(log.mock.calls[0]?.[0]).toContain('"correlationId":"web-request-123"');
    expect(log.mock.calls[0]?.[0]).not.toContain('authorization');
  });

  it.each(['/health', '/metrics', '/api/v1/health/ready'])(
    'does not fill application logs with the %s health probe',
    (path) => {
      const logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
      const middleware = createHttpRequestLoggingMiddleware(logger);
      const request = { path } as Request;
      const next = jest.fn() as NextFunction;

      middleware(request, {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(logger.log).not.toHaveBeenCalled();
    },
  );

  it('records bounded route-template RED metrics', () => {
    const metrics = {
      requestStarted: jest.fn(),
      requestCompleted: jest.fn(),
    };
    const middleware = createHttpRequestLoggingMiddleware(
      { error: jest.fn(), log: jest.fn(), warn: jest.fn() },
      metrics,
    );
    const request = {
      headers: {},
      baseUrl: '/api/v1/executions',
      get: jest.fn(),
      method: 'GET',
      originalUrl: '/api/v1/executions/3f5f7a2a',
      path: '/api/v1/executions/3f5f7a2a',
      route: { path: '/:executionId' },
    } as unknown as Request;
    const events = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      statusCode: 200,
    }) as unknown as Response;

    middleware(request, events, jest.fn());
    events.emit('finish');

    expect(metrics.requestStarted).toHaveBeenCalledTimes(1);
    expect(metrics.requestCompleted).toHaveBeenCalledWith(
      {
        method: 'GET',
        route: '/api/v1/executions/:executionId',
        statusCode: '200',
      },
      expect.any(Number),
    );
  });
});
